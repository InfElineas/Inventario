import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Ban, Check, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AlertBanner from '@/components/shared/AlertBanner';
import TkcBloqueoAviso from '@/components/shared/TkcBloqueoAviso';
import PendientesInventario from '@/components/ajustes/PendientesInventario';
import CerrarConteos from '@/components/ajustes/CerrarConteos';
import ComprobacionLineas from '@/components/ajustes/ComprobacionLineas';
import HistorialTransferencias from '@/components/transferencias/HistorialTransferencias';
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';
import { useConfirm } from '@/lib/useConfirm';
import { useAccesoTkc } from '@/lib/useAccesoTkc';
import { SIN_SONDEO } from '@/lib/query-client';
import { WAREHOUSES } from '@/services/tkc/warehouses';
import { ErrorDeRed } from '@/services/ajustesService';
import {
  interpretarTransferencia, mensajeDeError, nuevaClave, parseLineas,
} from '@/lib/transferencias';
import {
  cancelarTransferencia, confirmarTransferencia, crearTransferencia, lineasTransferencia,
} from '@/services/transferenciasService';

/**
 * Montar, confirmar y cancelar transferencias entre almacenes.
 *
 * Dos pasos SEPARADOS, como en los ajustes: «Montar» crea el documento en TKC
 * (queda «editada», no mueve nada) y «Confirmar» —un botón y un diálogo aparte—
 * lo pasa a «en tránsito». Nunca van encadenados. Un borrador también se puede
 * cancelar.
 *
 * El almacén de arriba es el ORIGEN. Los faltantes de un conteo clasificados como
 * transferencia («Transferencia a Latino no registrada»…) se pueden pasar al
 * formulario, y al confirmar el documento se dan por procesados.
 *
 * Todo sale con la cuenta de TKC de quien lo hace.
 */
export default function TransferenciaForm() {
  const { tiene: conTkc, cargando: cargandoUsuario } = useAccesoTkc();
  const sinTkc = !cargandoUsuario && !conTkc;
  const queryClient = useQueryClient();
  const { confirmDialog, ConfirmDialogNode } = useConfirm();
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();

  const [destino, setDestino] = useState('');
  const [notas, setNotas] = useState('');
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState(null);   // de «Montar»
  const [hechos, setHechos] = useState({});           // id → resultado de confirmar o cancelar
  const [bloqueo, setBloqueo] = useState(null);       // 'crear' | id de documento sin verificar
  const [verLineas, setVerLineas] = useState(null);   // { id, code }
  const [conteosUsados, setConteosUsados] = useState([]);
  const [montarAbierto, setMontarAbierto] = useState(false);
  // Poka-yoke: no se monta lo que el origen no tiene (ver lib/existenciaLineas.js).
  const [comprobacion, setComprobacion] = useState({ vigente: false, bloqueado: false });

  // Un envío distinto, una clave distinta; repetir el mismo reutiliza la clave.
  const claveCrear = useRef({ firma: '', clave: '' });
  const clavesDoc = useRef(new Map());

  const almacenes = useMemo(
    () => WAREHOUSES.filter((w) => filterAlmacenesByConfig([w.key], almacenesConfig).length > 0),
    [almacenesConfig],
  );
  const almacenValido = almacenes.some((w) => w.key === almacen);
  // El destino puede ser cualquiera de TKC menos el propio origen: recibir en un
  // almacén que no administro es lo normal.
  const destinos = useMemo(() => WAREHOUSES.filter((w) => w.key !== almacen), [almacen]);
  const destinoValido = destinos.some((w) => w.key === destino);
  const { lines, errores } = useMemo(() => parseLineas(texto), [texto]);

  const puedeMontar =
    !sinTkc && almacenValido && destinoValido && lines.length > 0 && errores.length === 0 && bloqueo !== 'crear'
    && comprobacion.vigente && !comprobacion.bloqueado;

  const refrescar = () => queryClient.invalidateQueries({ queryKey: ['transferencias'] });

  /** Ejecuta una escritura y la traduce a un resultado de pantalla. */
  async function escribir(fn) {
    try {
      const { status, body } = await fn();
      return interpretarTransferencia(status, body);
    } catch (e) {
      if (e instanceof ErrorDeRed && e.escritura) return { tipo: 'sin_verificar', mensaje: e.message };
      return { tipo: 'error', mensaje: e.message };
    }
  }

  const montar = useMutation({
    mutationFn: () => {
      const payload = { origen: almacen, destino, lines, notes: notas.trim() || undefined };
      const firma = JSON.stringify(payload);
      if (claveCrear.current.firma !== firma) claveCrear.current = { firma, clave: nuevaClave('tr') };
      return escribir(() => crearTransferencia({ ...payload, idempotencyKey: claveCrear.current.clave }));
    },
    onSuccess: (r) => {
      setResultado({ ...r, almacen, conteos: conteosUsados });
      if (r.tipo === 'sin_verificar') setBloqueo('crear');
      if (r.tipo === 'creado') {
        setConteosUsados([]);
        setTexto('');                       // ya está montada: no se reenvía por error
        claveCrear.current = { firma: '', clave: '' };
        refrescar();
      }
    },
  });

  const mover = useMutation({
    mutationFn: ({ id, accion }) => {
      const k = `${accion}-${id}`;
      if (!clavesDoc.current.has(k)) clavesDoc.current.set(k, nuevaClave(accion === 'confirmar' ? 'conf' : 'canc'));
      const llamar = accion === 'confirmar' ? confirmarTransferencia : cancelarTransferencia;
      return escribir(() => llamar(id, { almacen, idempotencyKey: clavesDoc.current.get(k) })).then((r) => ({ id, accion, r }));
    },
    onSuccess: ({ id, accion, r }) => {
      setHechos((h) => ({ ...h, [id]: r }));
      if (r.tipo === 'sin_verificar') setBloqueo(id);
      if (r.tipo === 'confirmado' || r.tipo === 'cancelado') { clavesDoc.current.delete(`${accion}-${id}`); refrescar(); }
    },
  });

  async function pedirConfirmacion(id, code) {
    const ok = await confirmDialog(
      `La transferencia ${code || id} pasa a «en tránsito» en TKC y queda a nombre de tu usuario. ` +
      'No se puede deshacer desde aquí.',
      { title: 'Confirmar transferencia', destructive: true },
    );
    if (ok) mover.mutate({ id, accion: 'confirmar' });
  }

  async function pedirCancelacion(id, code) {
    const ok = await confirmDialog(
      `Se cancela el borrador ${code || id}: no llegará a salir ningún producto.`,
      { title: 'Cancelar transferencia', destructive: true },
    );
    if (ok) mover.mutate({ id, accion: 'cancelar' });
  }

  // El modal se cierra cuando lo siguiente que hay que hacer está FUERA de él:
  // confirmar el borrador, o desbloquear el aviso de «no se pudo comprobar». Con
  // un rechazo se queda abierto: ahí toca corregir y reintentar.
  useEffect(() => {
    if (resultado?.tipo === 'creado' || resultado?.tipo === 'sin_verificar') setMontarAbierto(false);
  }, [resultado]);

  const documento = resultado?.documento;
  const estaOcupado = montar.isPending || mover.isPending;
  const hecho = documento?.id ? hechos[documento.id] : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Transferencias</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Mueve productos de un almacén a otro. El almacén que eliges arriba es el origen.
        </p>
      </div>

      {sinTkc && <TkcBloqueoAviso funcion="montar, confirmar o cancelar transferencias" />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block space-y-1.5 text-xs text-muted-foreground w-full max-w-xs">
          Almacén de origen
          <Select value={almacenValido ? almacen : ''} onValueChange={setAlmacen}>
            <SelectTrigger style={{ borderRadius: 'var(--r-ctl)' }}><SelectValue placeholder="Elige un almacén" /></SelectTrigger>
            <SelectContent>
              {almacenes.map((w) => <SelectItem key={w.key} value={w.key}>{w.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        {/* Encima del contenido, no debajo de la lista: es la acción de la pantalla.
            No vacía el texto a propósito: tras un «se envió y no se pudo comprobar»
            hay que poder reabrir y reenviar LO MISMO, para que la clave de
            idempotencia se reutilice y TKC devuelva el documento ya hecho. */}
        <Button disabled={!almacenValido} onClick={() => setMontarAbierto(true)}
          style={{ borderRadius: 'var(--r-ctl)' }}>
          Montar una transferencia a mano
        </Button>
      </div>

      {bloqueo && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-[var(--c-warn)]/30 bg-[var(--c-warn)]/6" style={{ borderRadius: 'var(--r-ctl)' }}>
          <ShieldAlert className="w-4 h-4 text-[var(--c-warn)] mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-[var(--c-warn)]">
            <p className="font-medium">Se envió a TKC y no se pudo comprobar el resultado.</p>
            <p className="mt-0.5">Revisa en TKC si el documento quedó antes de repetir: reintentarlo a ciegas puede duplicarlo.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setBloqueo(null)} style={{ borderRadius: 'var(--r-ctl)' }}>
            Ya lo revisé en TKC
          </Button>
        </div>
      )}

      <Tabs defaultValue="pendientes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pendientes">Por transferir</TabsTrigger>
          <TabsTrigger value="historial">Historial de TKC</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="space-y-4">
          <PendientesInventario
            tipo="transferencia"
            almacen={almacen}
            onUsar={(lineas, conteos) => { setTexto(lineas); setConteosUsados(conteos ?? []); setMontarAbierto(true); }}
          />
        </TabsContent>

        <TabsContent value="historial">
          <HistorialTransferencias
            almacen={almacen}
            almacenValido={almacenValido}
            resultados={hechos}
            sinTkc={sinTkc}
            ocupado={estaOcupado}
            bloqueo={bloqueo}
            onVerLineas={setVerLineas}
            onConfirmar={pedirConfirmacion}
            onCancelar={pedirCancelacion}
          />
        </TabsContent>
      </Tabs>

      {/* ── Montar: en modal ───────────────────────────────────── */}
      <Dialog open={montarAbierto} onOpenChange={setMontarAbierto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="text-sm font-medium">
            Transferencia desde {almacenValido ? almacen : 'un almacén sin elegir'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Montarla no mueve la existencia: queda como borrador hasta que la confirmes.
          </DialogDescription>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-xs text-muted-foreground">
                Almacén de destino
                <Select value={destinoValido ? destino : ''} onValueChange={setDestino}>
                  <SelectTrigger style={{ borderRadius: 'var(--r-ctl)' }}><SelectValue placeholder="Elige el destino" /></SelectTrigger>
                  <SelectContent>
                    {destinos.map((w) => <SelectItem key={w.key} value={w.key}>{w.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1.5 text-xs text-muted-foreground">
                Observaciones (opcional)
                <Input value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} style={{ borderRadius: 'var(--r-ctl)' }} />
              </label>
            </div>

            <label className="block space-y-1.5 text-xs text-muted-foreground">
              Productos — una línea por producto: <code className="font-mono">CODIGO*CANTIDAD</code> (sin cantidad vale 1)
              <Textarea rows={8} value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder={'7622210833662*3\n7622210697394*4'} className="font-mono text-sm"
                style={{ borderRadius: 'var(--r-ctl)' }} />
            </label>

            {errores.length > 0 && (
              <ul className="text-xs text-[var(--c-bad)] space-y-0.5">
                {errores.slice(0, 8).map((e, i) => (
                  <li key={i}>{e.linea ? `Línea ${e.linea}: ` : ''}{e.motivo}{e.texto ? ` («${e.texto}»)` : ''}</li>
                ))}
                {errores.length > 8 && <li>…y {errores.length - 8} más.</li>}
              </ul>
            )}

            <ComprobacionLineas almacen={almacen} lines={lines} tipo="transferencia"
              deshabilitado={!almacenValido || errores.length > 0 || sinTkc} onEstado={setComprobacion} />

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {lines.length} {lines.length === 1 ? 'producto' : 'productos'}, {lines.reduce((s, l) => s + l.quantity, 0)} unidades.
                {lines.length > 0 && !comprobacion.vigente && ' Comprueba la existencia del origen para poder montar.'}
              </p>
              <Button onClick={() => montar.mutate()} disabled={!puedeMontar || estaOcupado} style={{ borderRadius: 'var(--r-ctl)' }}>
                {montar.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
                Montar transferencia
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Resultado de montar ────────────────────────────────── */}
      {resultado && (
        <Card className="p-5 space-y-4">
          {resultado.tipo === 'creado' && (
            <>
              <div className="flex items-center gap-2 text-[var(--c-ok-dim)]">
                <CheckCircle2 className="w-4 h-4" />
                <h2 className="text-sm font-medium">
                  Transferencia {documento?.code ?? documento?.id ?? ''} montada en «editada»
                </h2>
              </div>
              {documento?.id ? (
                <AccionesBorrador
                  hecho={hecho}
                  onConfirmar={() => pedirConfirmacion(documento.id, documento.code)}
                  onCancelar={() => pedirCancelacion(documento.id, documento.code)}
                  deshabilitado={sinTkc || estaOcupado || bloqueo === documento.id}
                  pendiente={mover.isPending && mover.variables?.id === documento.id}
                />
              ) : (
                <AlertBanner variant="warning" message="TKC creó el documento pero no se pudo averiguar su id. Confírmalo desde el historial." />
              )}
              {/* Con la transferencia confirmada, los conteos de los que salió se
                  dan por procesados de una vez. */}
              {documento?.code && hecho?.tipo === 'confirmado' && resultado.conteos?.length > 0 && (
                <CerrarConteos
                  sentido="transferencia"
                  conteos={resultado.conteos}
                  aceptadas={resultado.aceptadas}
                  documento={documento.code}
                  estado="Transferencia"
                />
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

      <LineasDialog doc={verLineas} onClose={() => setVerLineas(null)} />
      {ConfirmDialogNode}
    </div>
  );
}

function AccionesBorrador({ hecho, onConfirmar, onCancelar, deshabilitado, pendiente }) {
  if (hecho?.tipo === 'confirmado') {
    return <AlertBanner variant="success" message={`${hecho.mensaje || 'Transferencia confirmada'}: quedó en tránsito en TKC.`} />;
  }
  if (hecho?.tipo === 'cancelado') {
    return <AlertBanner variant="success" message="Borrador cancelado: no salió ningún producto." />;
  }
  return (
    <div className="space-y-2">
      {hecho && <AlertBanner variant={hecho.tipo === 'sin_verificar' ? 'warning' : 'danger'} message={mensajeDeError(hecho)} />}
      <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3" style={{ borderRadius: 'var(--r-ctl)' }}>
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Confirmarla la pasa a «en tránsito» en TKC.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={deshabilitado} style={{ borderRadius: 'var(--r-ctl)' }}>
            <Ban className="w-4 h-4 mr-1.5" /> Cancelar
          </Button>
          <Button onClick={onConfirmar} disabled={deshabilitado} style={{ borderRadius: 'var(--r-ctl)' }}>
            {pendiente ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Check className="w-4 h-4 mr-1.5" />}
            Confirmar transferencia
          </Button>
        </div>
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
                {conMotivo && <td className="py-1 text-[var(--c-bad)]">{f.reason}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LineasDialog({ doc, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['transferencias-lineas', doc?.id],
    queryFn: () => lineasTransferencia(doc.id),
    enabled: Boolean(doc),
    ...SIN_SONDEO,
  });
  const tabla = data?.body;
  const error = data && !tabla?.rows ? interpretarTransferencia(data.status, data.body) : null;
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
