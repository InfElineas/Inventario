import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, Check, CheckCircle2, Eye, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AlertBanner from '@/components/shared/AlertBanner';
import { useAuth } from '@/lib/AuthContext';
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';
import { useConfirm } from '@/lib/useConfirm';
import { WAREHOUSES } from '@/services/tkc/warehouses';
import {
  TIPOS_AJUSTE, parseLineas, nuevaClave, interpretar, puedeConfirmar,
} from '@/lib/ajustes';
import {
  listarAjustes, lineasAjuste, crearAjuste, confirmarAjuste, ErrorDeRed,
} from '@/services/ajustesService';

const hoy = () => format(new Date(), 'yyyy-MM-dd');

/** Lo que muestra el banner de un resultado que no es un éxito. */
function mensajeDeError(r) {
  if (r.codigo === 'no_tkc_credentials') return r.mensaje;
  if (r.codigo === 'forbidden' || r.codigo === 'no_access') {
    return `${r.mensaje} Pide que te den ese permiso en el Identity Server.`;
  }
  return r.mensaje || 'No se pudo completar la operación.';
}

/**
 * Montar y confirmar ajustes de un tipo (`aumento` | `disminucion`).
 *
 * Dos pasos SEPARADOS, como en elineas-transferencia: «Montar» crea el documento
 * en TKC (queda «editada», no toca la existencia) y «Confirmar» —un botón y un
 * diálogo aparte— es lo que la mueve. Nunca van encadenados.
 *
 * Todo sale con la cuenta de TKC de quien lo hace.
 */
export default function AjusteForm({ tipo }) {
  const cfg = TIPOS_AJUSTE[tipo];
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { confirmDialog, ConfirmDialogNode } = useConfirm();
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();

  const [fecha, setFecha] = useState(hoy);
  const [clasificacion, setClasificacion] = useState(cfg.clasificacionPorDefecto);
  const [notas, setNotas] = useState('');
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState(null);   // de «Montar»
  const [confirmado, setConfirmado] = useState({});    // id → resultado de «Confirmar»
  const [bloqueo, setBloqueo] = useState(null);        // 'crear' | id de documento sin verificar
  const [verLineas, setVerLineas] = useState(null);    // { id, code }

  // Un envío distinto, una clave distinta; repetir el mismo reutiliza la clave.
  const claveCrear = useRef({ firma: '', clave: '' });
  const clavesConfirmar = useRef(new Map());

  const sinTkc = user && !user.tiene_tkc;
  const almacenes = useMemo(
    () => WAREHOUSES.filter((w) => filterAlmacenesByConfig([w.key], almacenesConfig).length > 0),
    [almacenesConfig],
  );
  const almacenValido = almacenes.some((w) => w.key === almacen);
  const { lines, errores } = useMemo(() => parseLineas(texto), [texto]);

  const faltaClasificacion = cfg.clasificacionObligatoria && !clasificacion;
  const puedeMontar =
    !sinTkc && almacenValido && lines.length > 0 && errores.length === 0 &&
    !faltaClasificacion && bloqueo !== 'crear';

  // ── Historial del almacén ──────────────────────────────────────────
  const historial = useQuery({
    queryKey: ['ajustes', tipo, almacen],
    queryFn: () => listarAjustes(tipo, { almacen, limit: 50 }),
    enabled: almacenValido,
    staleTime: 15_000,
  });
  const filas = Array.isArray(historial.data?.body) ? historial.data.body : [];
  const errorHistorial = historial.data && !Array.isArray(historial.data.body)
    ? interpretar(historial.data.status, historial.data.body) : null;
  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['ajustes', tipo] });

  /** Ejecuta una escritura y la traduce a un resultado de pantalla. */
  async function escribir(fn) {
    try {
      const { status, body } = await fn();
      return interpretar(status, body);
    } catch (e) {
      if (e instanceof ErrorDeRed && e.escritura) return { tipo: 'sin_verificar', mensaje: e.message };
      return { tipo: 'error', mensaje: e.message };
    }
  }

  const montar = useMutation({
    mutationFn: () => {
      const payload = {
        almacen, lines, date: fecha, notes: notas.trim() || undefined,
        classification: clasificacion || undefined,
      };
      const firma = JSON.stringify(payload);
      if (claveCrear.current.firma !== firma) claveCrear.current = { firma, clave: nuevaClave('aj') };
      return escribir(() => crearAjuste(tipo, { ...payload, idempotencyKey: claveCrear.current.clave }));
    },
    onSuccess: (r) => {
      setResultado({ ...r, almacen });
      if (r.tipo === 'sin_verificar') setBloqueo('crear');
      if (r.tipo === 'creado') {
        setTexto('');                       // ya está montado: no se reenvía por error
        claveCrear.current = { firma: '', clave: '' };
        refrescar();
      }
    },
  });

  const confirmar = useMutation({
    mutationFn: ({ id, code }) => {
      if (!clavesConfirmar.current.has(id)) clavesConfirmar.current.set(id, nuevaClave('conf'));
      return escribir(() => confirmarAjuste(tipo, id, {
        almacen, code, idempotencyKey: clavesConfirmar.current.get(id),
      })).then((r) => ({ id, r }));
    },
    onSuccess: ({ id, r }) => {
      setConfirmado((c) => ({ ...c, [id]: r }));
      if (r.tipo === 'sin_verificar') setBloqueo(id);
      if (r.tipo === 'confirmado') { clavesConfirmar.current.delete(id); refrescar(); }
    },
  });

  async function pedirConfirmacion(id, code) {
    const ok = await confirmDialog(
      `Esto ${cfg.efectoConfirmar} las cantidades en la existencia de TKC del almacén ${almacen} ` +
      `(documento ${code || id}) y queda a nombre de tu usuario de TKC. No se puede deshacer desde aquí.`,
      { title: `Confirmar ${cfg.titulo.toLowerCase()}`, destructive: true },
    );
    if (ok) confirmar.mutate({ id, code });
  }

  const documento = resultado?.documento;
  const estaOcupado = montar.isPending || confirmar.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">{cfg.titulo}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{cfg.descripcion}</p>
      </div>

      {sinTkc && (
        <AlertBanner
          variant="danger"
          message="Tu sesión no tiene credenciales de TKC, y los ajustes se hacen con tu usuario de TKC. Cierra sesión y vuelve a entrar; si sigue igual, pide que enlacen tu cuenta de TKC en el Identity Server."
        />
      )}

      {bloqueo && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-[#BA7517]/30 bg-[#BA751710]" style={{ borderRadius: '8px' }}>
          <ShieldAlert className="w-4 h-4 text-[#BA7517] mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-[#BA7517]">
            <p className="font-medium">Se envió a TKC y no se pudo comprobar el resultado.</p>
            <p className="mt-0.5">Revisa en TKC si el documento quedó antes de repetir: reintentarlo a ciegas puede duplicarlo o aplicarlo dos veces.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setBloqueo(null)} style={{ borderRadius: '8px' }}>
            Ya lo revisé en TKC
          </Button>
        </div>
      )}

      {/* ── Montar ─────────────────────────────────────────────── */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-medium">Montar documento</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-xs text-muted-foreground">
            Almacén
            <Select value={almacenValido ? almacen : ''} onValueChange={setAlmacen}>
              <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Elige un almacén" /></SelectTrigger>
              <SelectContent>
                {almacenes.map((w) => <SelectItem key={w.key} value={w.key}>{w.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-xs text-muted-foreground">
            Fecha
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={{ borderRadius: '8px' }} />
          </label>
          <label className="space-y-1.5 text-xs text-muted-foreground">
            Clasificación{cfg.clasificacionObligatoria ? ' (obligatoria)' : ''}
            <Select value={clasificacion} onValueChange={setClasificacion}>
              <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Elige una clasificación" /></SelectTrigger>
              <SelectContent>
                {cfg.clasificaciones.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1.5 text-xs text-muted-foreground">
            Observaciones (opcional)
            <Input value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} style={{ borderRadius: '8px' }} />
          </label>
        </div>

        <label className="block space-y-1.5 text-xs text-muted-foreground">
          Productos — una línea por producto: <code className="font-mono">CODIGO*CANTIDAD</code> (sin cantidad vale 1)
          <Textarea
            rows={8}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'7622210833662*3\n7622210697394*4'}
            className="font-mono text-sm"
            style={{ borderRadius: '8px' }}
          />
        </label>

        {errores.length > 0 && (
          <ul className="text-xs text-[#E24B4A] space-y-0.5">
            {errores.slice(0, 8).map((e, i) => (
              <li key={i}>{e.linea ? `Línea ${e.linea}: ` : ''}{e.motivo}{e.texto ? ` («${e.texto}»)` : ''}</li>
            ))}
            {errores.length > 8 && <li>…y {errores.length - 8} más.</li>}
          </ul>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {lines.length} {lines.length === 1 ? 'producto' : 'productos'}, {lines.reduce((s, l) => s + l.quantity, 0)} unidades.
            Montarlo no mueve la existencia.
          </p>
          <Button onClick={() => montar.mutate()} disabled={!puedeMontar || estaOcupado} style={{ borderRadius: '8px' }}>
            {montar.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            Montar ajuste
          </Button>
        </div>
      </Card>

      {/* ── Resultado de montar ────────────────────────────────── */}
      {resultado && (
        <Card className="p-5 space-y-4">
          {resultado.tipo === 'creado' && (
            <>
              <div className="flex items-center gap-2 text-[#1D9E75]">
                <CheckCircle2 className="w-4 h-4" />
                <h2 className="text-sm font-medium">
                  Documento {documento?.code ?? documento?.id} montado en «editada»
                </h2>
              </div>
              {documento?.id ? (
                <ConfirmarBloque
                  resultado={confirmado[documento.id]}
                  onConfirmar={() => pedirConfirmacion(documento.id, documento.code)}
                  deshabilitado={sinTkc || estaOcupado || bloqueo === documento.id}
                  pendiente={confirmar.isPending && confirmar.variables?.id === documento.id}
                  cfg={cfg}
                />
              ) : (
                <AlertBanner variant="warning" message="TKC creó el documento pero no se pudo averiguar su id. Confírmalo desde el historial." />
              )}
              <TablaLineas titulo="Aceptadas" filas={resultado.aceptadas} />
              <TablaLineas titulo="Rechazadas (no se montaron)" filas={resultado.rechazadas} conMotivo />
            </>
          )}
          {resultado.tipo === 'rechazado' && (
            <>
              <AlertBanner variant="warning" message={`No se envió nada a TKC.${resultado.mensaje ? ` ${resultado.mensaje}` : ''}`} />
              <TablaLineas titulo="Rechazadas" filas={resultado.rechazadas} conMotivo />
            </>
          )}
          {resultado.tipo === 'fallo' && <AlertBanner variant="danger" message={resultado.mensaje} />}
          {resultado.tipo === 'error' && <AlertBanner variant="danger" message={mensajeDeError(resultado)} />}
          {resultado.tipo === 'sin_verificar' && <AlertBanner variant="warning" message={resultado.mensaje || 'No se pudo comprobar el resultado.'} />}
        </Card>
      )}

      {/* ── Historial ──────────────────────────────────────────── */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Recientes en {almacenValido ? almacen : '—'} <span className="text-muted-foreground font-normal">(últimos 7 días)</span></h2>
          <Button variant="ghost" size="sm" onClick={refrescar} disabled={!almacenValido || historial.isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 ${historial.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {!almacenValido && <p className="text-sm text-muted-foreground">Elige un almacén para ver sus documentos.</p>}
        {errorHistorial && <AlertBanner variant="danger" message={mensajeDeError(errorHistorial)} />}
        {almacenValido && !errorHistorial && !historial.isLoading && filas.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin documentos en este rango.</p>
        )}
        {filas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-medium">Documento</th>
                  <th className="py-2 pr-3 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 pr-3 font-medium text-right">Monto</th>
                  <th className="py-2 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{f.code}</td>
                    <td className="py-2 pr-3">{f.date}</td>
                    <td className="py-2 pr-3 capitalize">{confirmado[f.id]?.tipo === 'confirmado' ? 'confirmada' : f.status}</td>
                    <td className="py-2 pr-3 text-right">{f.amount}</td>
                    <td className="py-2 text-right space-x-1 whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setVerLineas({ id: f.id, code: f.code })} title="Ver productos">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      {puedeConfirmar(f.status) && confirmado[f.id]?.tipo !== 'confirmado' && (
                        <Button
                          size="sm" variant="outline" style={{ borderRadius: '8px' }}
                          disabled={sinTkc || estaOcupado || bloqueo === f.id}
                          onClick={() => pedirConfirmacion(f.id, f.code)}
                          title="Confirmar" aria-label="Confirmar"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {confirmado[f.id] && confirmado[f.id].tipo !== 'confirmado' && (
                        <span className="text-xs text-[#E24B4A]">{confirmado[f.id].mensaje}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {historial.data?.total > filas.length && (
              <p className="text-xs text-muted-foreground mt-2">Mostrando {filas.length} de {historial.data.total}.</p>
            )}
          </div>
        )}
      </Card>

      <LineasDialog tipo={tipo} doc={verLineas} onClose={() => setVerLineas(null)} />
      {ConfirmDialogNode}
    </div>
  );
}

function ConfirmarBloque({ resultado, onConfirmar, deshabilitado, pendiente, cfg }) {
  if (resultado?.tipo === 'confirmado') {
    return (
      <div className="space-y-1">
        <AlertBanner variant="success" message={`${resultado.mensaje || 'Ajuste confirmado'}: la existencia en TKC ya se movió.`} />
        {resultado.aviso && <AlertBanner variant="warning" message={resultado.aviso} />}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {resultado && resultado.tipo !== 'confirmado' && (
        <AlertBanner variant={resultado.tipo === 'sin_verificar' ? 'warning' : 'danger'} message={mensajeDeError(resultado)} />
      )}
      <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3" style={{ borderRadius: '8px' }}>
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Confirmarlo {cfg.efectoConfirmar} las cantidades en la existencia de TKC.
        </p>
        <Button onClick={onConfirmar} disabled={deshabilitado} style={{ borderRadius: '8px' }}>
          {pendiente ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
          Confirmar ajuste
        </Button>
      </div>
    </div>
  );
}

function TablaLineas({ titulo, filas, conMotivo = false }) {
  if (!filas?.length) return null;
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1">{titulo} ({filas.length})</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <tbody>
            {filas.map((f) => (
              <tr key={`${f.line}-${f.code}`} className="border-b last:border-0">
                <td className="py-1 pr-3 text-muted-foreground">{f.line}</td>
                <td className="py-1 pr-3 font-mono">{f.code}</td>
                <td className="py-1 pr-3 text-right">{f.quantity}</td>
                {conMotivo && <td className="py-1 text-[#E24B4A]">{f.reason}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LineasDialog({ tipo, doc, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ajustes-lineas', tipo, doc?.id],
    queryFn: () => lineasAjuste(tipo, doc.id),
    enabled: Boolean(doc),
  });
  const tabla = data?.body;
  const error = data && !tabla?.rows ? interpretar(data.status, data.body) : null;
  return (
    <Dialog open={Boolean(doc)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Productos de {doc?.code}</DialogTitle></DialogHeader>
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        {error && <AlertBanner variant="danger" message={mensajeDeError(error)} />}
        {tabla?.rows && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  {tabla.headers.map((h, i) => <th key={i} className="py-1.5 pr-3 font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {tabla.rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {r.map((c, j) => <td key={j} className="py-1.5 pr-3">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
