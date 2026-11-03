import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine, CheckCircle2, ClipboardList, Loader2, Plus, RefreshCw, Search, ShieldAlert,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import Pagination from '@/components/shared/Pagination';
import { useDebounced } from '@/lib/useDebounced';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ParesIntercambio from '@/components/ajustes/ParesIntercambio';
import CerrarConteos from '@/components/ajustes/CerrarConteos';
import AlertBanner from '@/components/shared/AlertBanner';
import DialogosConteo, { CeldaAcciones } from '@/components/inventario/AccionesConteo';
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';
import { useConfirm } from '@/lib/useConfirm';
import { useAccesoTkc } from '@/lib/useAccesoTkc';
import TkcBloqueoAviso from '@/components/shared/TkcBloqueoAviso';
import { WAREHOUSES } from '@/services/tkc/warehouses';
import { mensajeDeError } from '@/lib/ajustes';
import {
  parseLineas, nuevaClave, codigoBase, interpretarProceso, interpretarAnalisis,
  LINEAS_POR_DOCUMENTO, ETIQUETA_LINEA, lineasParaEnviar, paresHechos,
  ESTADOS_CANDIDATO, ESTADOS_PROCESADO, etiquetaProcesado,
} from '@/lib/procesamientos';
import {
  listarCandidatos, listarProcesados, analizarProceso, procesar,
} from '@/services/procesamientosService';
import { ErrorDeRed } from '@/services/ajustesService';
import { SIN_SONDEO } from '@/lib/query-client';

const PAGINA = 50;
const SELECT_CLS = 'bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground';
const COLOR_LINEA = { done: 'text-[var(--c-ok-dim)]', failed: 'text-[var(--c-bad)]', unverified: 'text-[var(--c-warn)]' };

/**
 * Procesar productos `NoMT…`: pasar su existencia al producto normal del mismo
 * almacén (documento TKCP en TKC).
 *
 * Dos pasos SEPARADOS, como en elineas-transferencia: «Analizar» solo lee y dice
 * qué haría; «Procesar» —con confirmación— es lo que mueve la existencia, y solo
 * se habilita con un análisis vigente de lo que hay escrito. Cualquier cambio en
 * el texto o el almacén lo invalida.
 *
 * Todo sale con la cuenta de TKC de quien lo hace.
 */
export default function ProcesamientoForm() {
  const { tiene: conTkc, cargando: cargandoUsuario } = useAccesoTkc();
  const sinTkc = !cargandoUsuario && !conTkc;
  const queryClient = useQueryClient();
  const { confirmDialog, ConfirmDialogNode } = useConfirm();
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();

  const [texto, setTexto] = useState('');
  const [analisis, setAnalisis] = useState(null);   // { firma, ...interpretarAnalisis }
  const [resultado, setResultado] = useState(null); // de «Procesar»
  const [bloqueo, setBloqueo] = useState(false);    // se envió y no se pudo comprobar
  // Los pares de intercambio de los que salen las líneas del formulario: cuando
  // el documento salga bien, sus conteos se dan por procesados.
  const [paresUsados, setParesUsados] = useState([]);
  // Escribir los códigos vive en un modal, igual que montar un ajuste: ocupaba
  // la pantalla entera para lo que menos se hace. Lo habitual es mirar qué
  // queda por procesar.
  const [entradaAbierta, setEntradaAbierta] = useState(false);
  const [accion, setAccion] = useState(null);   // { tipo, inv } del menú ⋯ de un candidato

  // Un envío distinto, una clave distinta; repetir el mismo reutiliza la clave.
  const claveProcesar = useRef({ firma: '', clave: '' });
  // «Actualizar» salta lo que la API recuerda (10 min); la carga normal, no.
  const saltarCache = useRef(false);

  const almacenes = useMemo(
    () => WAREHOUSES.filter((w) => filterAlmacenesByConfig([w.key], almacenesConfig).length > 0),
    [almacenesConfig],
  );
  const almacenValido = almacenes.some((w) => w.key === almacen);
  const { lines, errores } = useMemo(() => parseLineas(texto), [texto]);

  // Lo que hay escrito, tal cual: si cambia, el análisis ya no corresponde.
  const firma = JSON.stringify({ almacen, lines });
  const analisisVigente = analisis?.tipo === 'analizado' && analisis.firma === firma ? analisis : null;
  // Se manda lo que se escribió, no lo que vuelve del análisis: una línea de
  // intercambio (`ORIGEN>DESTINO`) puede volver sin su destino en `code`.
  const aProcesar = useMemo(
    () => (analisisVigente ? lineasParaEnviar(lines, analisisVigente.lineas) : []),
    [analisisVigente, lines],
  );

  const entradaValida = almacenValido && lines.length > 0 && errores.length === 0;
  const repetidos = useMemo(() => {
    const vistos = new Set();
    const dup = [];
    for (const l of lines) {
      const base = codigoBase(l.code);
      if (vistos.has(base)) dup.push(l.code);
      vistos.add(base);
    }
    return dup;
  }, [lines]);

  // ── Por procesar / procesados del almacén ─────────────────────────
  // Los filtros los hace la API (`status`, `q`, `limit`/`offset`): ella dice
  // cuántos hay en total y cuáles se pueden procesar, sin traerlo todo.
  const [estadoCand, setEstadoCand] = useState('');
  const [buscarCand, setBuscarCand] = useState('');
  const [paginaCand, setPaginaCand] = useState(1);
  const qCand = useDebounced(buscarCand.trim(), 400);
  const [estadoProc, setEstadoProc] = useState('');
  const [buscarProc, setBuscarProc] = useState('');
  const [paginaProc, setPaginaProc] = useState(1);
  const qProc = useDebounced(buscarProc.trim(), 400);

  const candidatos = useQuery({
    queryKey: ['procesamientos', 'candidatos', almacen, estadoCand, qCand, paginaCand],
    queryFn: () => listarCandidatos({
      almacen, status: estadoCand, q: qCand, refresh: saltarCache.current,
      limit: PAGINA, offset: (paginaCand - 1) * PAGINA,
    }),
    enabled: almacenValido && !sinTkc,
    staleTime: 60_000,
    ...SIN_SONDEO,
  });
  const procesados = useQuery({
    queryKey: ['procesamientos', 'documentos', almacen, estadoProc, qProc, paginaProc],
    queryFn: () => listarProcesados({
      almacen, status: estadoProc, q: qProc, refresh: saltarCache.current,
      limit: PAGINA, offset: (paginaProc - 1) * PAGINA,
    }),
    enabled: almacenValido && !sinTkc,
    staleTime: 60_000,
    ...SIN_SONDEO,
  });
  const filasCandidatos = Array.isArray(candidatos.data?.body) ? candidatos.data.body : [];
  const filasProcesados = Array.isArray(procesados.data?.body) ? procesados.data.body : [];
  const errorCandidatos = candidatos.data && !Array.isArray(candidatos.data.body)
    ? interpretarAnalisis(candidatos.data.status, candidatos.data.body) : null;
  const errorProcesados = procesados.data && !Array.isArray(procesados.data.body)
    ? interpretarAnalisis(procesados.data.status, procesados.data.body) : null;
  const refrescar = async () => {
    saltarCache.current = true;
    try {
      await Promise.all([candidatos.refetch(), procesados.refetch()]);
    } finally {
      saltarCache.current = false;
    }
  };
  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['procesamientos'] });

  const analizar = useMutation({
    mutationFn: async () => {
      try {
        const { status, body } = await analizarProceso({ almacen, lines });
        return interpretarAnalisis(status, body);
      } catch (e) {
        return { tipo: 'error', mensaje: e.message };
      }
    },
    onSuccess: (r) => {
      setResultado(null);
      setAnalisis({ ...r, firma });
    },
  });

  const ejecutar = useMutation({
    mutationFn: async () => {
      const payload = { almacen, lines: aProcesar };
      const f = JSON.stringify(payload);
      if (claveProcesar.current.firma !== f) claveProcesar.current = { firma: f, clave: nuevaClave('proc') };
      try {
        const { status, body } = await procesar({ ...payload, idempotencyKey: claveProcesar.current.clave });
        return interpretarProceso(status, body);
      } catch (e) {
        if (e instanceof ErrorDeRed && e.escritura) return { tipo: 'sin_verificar', mensaje: e.message, grupos: [], rechazadas: [] };
        return { tipo: 'error', mensaje: e.message };
      }
    },
    onSuccess: (r) => {
      // Los pares van con el documento que procesan: el siguiente empieza limpio.
      setResultado({ ...r, almacen, pares: paresUsados });
      setAnalisis(null);                       // lo que se procesó ya no es lo analizado
      if (r.tipo === 'sin_verificar') setBloqueo(true);
      if (r.tipo === 'procesado' || r.tipo === 'parcial' || r.tipo === 'sin_verificar') {
        claveProcesar.current = { firma: '', clave: '' };
        setParesUsados([]);
        setTexto('');
        invalidar();
      }
    },
  });

  async function pedirConfirmacion() {
    const unidades = aProcesar.reduce((s, l) => s + l.quantity, 0);
    const ok = await confirmDialog(
      `Esto pasará ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'} de ${aProcesar.length} ` +
      `${aProcesar.length === 1 ? 'producto' : 'productos'} a su código de destino en la existencia de TKC del ` +
      `almacén ${almacen}, y queda a nombre de tu usuario de TKC. No se puede deshacer desde aquí.`,
      { title: 'Confirmar procesamiento', destructive: true },
    );
    if (ok) ejecutar.mutate();
  }

  /** Añade `CODIGO*CANTIDAD` al texto (si el código no está ya). */
  function agregar(c) {
    setEntradaAbierta(true);
    if (lines.some((l) => codigoBase(l.code) === codigoBase(c.code))) return;
    setTexto((t) => `${t.trimEnd()}${t.trim() ? '\n' : ''}${c.code}*${c.quantity}`);
  }

  /**
   * Todo lo que TKC dice que se puede procesar, sin teclear nada. Se pide a la
   * API con `status=ready` y no se toma de la página que se está viendo: ahí
   * puede haber solo una parte, o un filtro puesto.
   */
  const [cargandoListos, setCargandoListos] = useState(false);
  const [errorListos, setErrorListos] = useState('');
  async function cargarTodos() {
    setCargandoListos(true);
    setErrorListos('');
    try {
      const { status, body } = await listarCandidatos({ almacen, status: 'ready', limit: 500, offset: 0 });
      if (!Array.isArray(body)) throw new Error(mensajeDeError(interpretarAnalisis(status, body)));
      const listos = body.filter((c) => c.status === 'ready');
      if (listos.length === 0) { setErrorListos('TKC no tiene ahora ningún producto procesable en este almacén.'); return; }
      setTexto(listos.map((c) => `${c.code}*${c.quantity}`).join('\n'));
      setEntradaAbierta(true);
    } catch (e) {
      setErrorListos(e.message);
    } finally {
      setCargandoListos(false);
    }
  }

  // El modal se cierra cuando lo siguiente que hay que hacer está fuera: ver
  // el resultado, o desbloquear el aviso de «se envió y no se pudo comprobar».
  // Con un rechazo o un fallo se queda abierto, porque ahí lo que toca es
  // corregir lo escrito y reintentar.
  useEffect(() => {
    if (['procesado', 'parcial', 'sin_verificar'].includes(resultado?.tipo)) setEntradaAbierta(false);
  }, [resultado]);

  const ocupado = analizar.isPending || ejecutar.isPending;
  const puedeAnalizar = !sinTkc && entradaValida && repetidos.length === 0 && !ocupado;
  const puedeProcesar = !sinTkc && Boolean(analisisVigente) && aProcesar.length > 0 && !bloqueo && !ocupado;
  const documentos = Math.ceil(aProcesar.length / LINEAS_POR_DOCUMENTO);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium">Procesamientos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pasa la existencia de un producto NoMT a su código normal, en el mismo almacén.
        </p>
      </div>

      {sinTkc && <TkcBloqueoAviso funcion="analizar o procesar productos" />}

      {bloqueo && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-[var(--c-warn)]/30 bg-[var(--c-warn)]/6" style={{ borderRadius: 'var(--r-ctl)' }}>
          <ShieldAlert className="w-4 h-4 text-[var(--c-warn)] mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-[var(--c-warn)]">
            <p className="font-medium">Se envió a TKC y no se pudo comprobar el resultado.</p>
            <p className="mt-0.5">Revisa en TKC si el procesamiento quedó antes de repetir: reintentarlo a ciegas puede procesar dos veces.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setBloqueo(false)} style={{ borderRadius: 'var(--r-ctl)' }}>
            Ya lo revisé en TKC
          </Button>
        </div>
      )}

      {/* El almacén manda en las dos pestañas y en el formulario: va fuera. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block space-y-1.5 text-xs text-muted-foreground w-full max-w-xs">
          Almacén
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
        <Button disabled={!almacenValido} onClick={() => setEntradaAbierta(true)}
          style={{ borderRadius: 'var(--r-ctl)' }}>
          Procesar a mano
        </Button>
      </div>

      {/* ── Resultado ──────────────────────────────────────────── */}
      {resultado && <ResultadoProceso r={resultado} />}

      {/* Con el documento hecho, los conteos del intercambio se dan por
          procesados de una vez: antes había que teclear el número en cada uno. */}
      {resultado?.pares?.length > 0 && resultado.grupos?.map((g) => {
        const hechos = g.processId ? paresHechos(resultado.pares, g.lines) : [];
        if (hechos.length === 0) return null;
        const conteos = hechos.flatMap(({ origen, destino }) => [
          { conteo: origen, anteriores: [] }, { conteo: destino, anteriores: [] },
        ]);
        // El listado de procesados trae el TKCP; hasta que llegue, el id.
        const documento = filasProcesados.find((f) => String(f.id) === String(g.processId))?.code
          ?? `proceso ${g.processId}`;
        return (
          <CerrarConteos
            key={g.processId}
            conteos={conteos}
            aceptadas={conteos.map(({ conteo }) => ({ code: conteo.producto_codigo }))}
            documento={documento}
            estado="Procesamiento"
            notasPorDefecto={hechos
              .map(({ origen, destino, cantidad }) => `Intercambio: ${cantidad} de ${origen.producto_codigo} a ${destino.producto_codigo}.`)
              .join(' ')}
          />
        );
      })}

      {/* Dos pestañas, como en los ajustes: lo que falta por procesar y lo que
          TKC ya tiene. Lo primero es lo que se mira a diario. */}
      <Tabs defaultValue="pendientes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pendientes">Por procesar</TabsTrigger>
          <TabsTrigger value="historial">Historial de TKC</TabsTrigger>
        </TabsList>

        <TabsContent value="pendientes" className="space-y-4">
          <ParesIntercambio
            almacen={almacenValido ? almacen : ''}
            onUsar={(lineas, pares) => { setTexto(lineas); setParesUsados(pares); setEntradaAbierta(true); }}
          />

          <Card className="overflow-hidden" style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
              <p className="text-sm font-medium flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-muted-foreground" />
                Productos NoMT con existencia
                {candidatos.data?.total > 0 && (
                  <span className="text-xs text-muted-foreground">({candidatos.data.total})</span>
                )}
              </p>
              <div className="flex items-center gap-1">
                {almacenValido && !sinTkc && (
                  <Button type="button" variant="outline" size="sm" style={{ borderRadius: 'var(--r-ctl)' }}
                    onClick={cargarTodos} disabled={cargandoListos}>
                    {cargandoListos
                      ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      : <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />}
                    Pasar los procesables al formulario
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={refrescar} title="Actualizar"
                  disabled={!almacenValido || sinTkc || candidatos.isFetching || procesados.isFetching}>
                  <RefreshCw className={`w-3.5 h-3.5 ${candidatos.isFetching ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>

            {almacenValido && (
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border">
                <select value={estadoCand} onChange={(e) => { setEstadoCand(e.target.value); setPaginaCand(1); }}
                  className={SELECT_CLS} aria-label="Estado" style={{ borderRadius: 'var(--r-ctl)' }}>
                  {ESTADOS_CANDIDATO.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
                </select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input value={buscarCand} onChange={(e) => { setBuscarCand(e.target.value); setPaginaCand(1); }}
                    placeholder="Buscar por código o nombre…" className="pl-8 w-64" style={{ borderRadius: 'var(--r-ctl)' }} />
                </div>
              </div>
            )}
            {errorListos && <div className="px-4 pt-3"><AlertBanner variant="warning" message={errorListos} /></div>}

            {!almacenValido ? (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">Elige un almacén para ver sus productos NoMT.</p>
            ) : errorCandidatos ? (
              <div className="p-4"><AlertBanner variant="danger" message={mensajeDeError(errorCandidatos)} /></div>
            ) : candidatos.isLoading ? (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">Cargando…</p>
            ) : filasCandidatos.length === 0 ? (
              <p className="px-4 py-6 text-xs text-muted-foreground text-center">
                {estadoCand || qCand ? 'Ningún producto NoMT cumple estos filtros.' : 'No hay productos NoMT con existencia.'}
              </p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="px-4 py-2 text-left font-medium">Producto</th>
                      <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Código NoMT</th>
                      <th className="px-3 py-2 text-right font-medium">Existencia</th>
                      <th className="px-3 py-2 text-right font-medium hidden lg:table-cell">Precio</th>
                      <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Pasaría a</th>
                      <th className="px-3 py-2 text-left font-medium">Estado</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filasCandidatos.map((c) => (
                      <tr key={`${c.warehouse}-${c.code}`} className="hover:bg-secondary/40 transition-colors">
                        <td className="px-4 py-2 max-w-[18rem]"><p className="line-clamp-1" title={c.name}>{c.name}</p></td>
                        <td className="px-3 py-2 font-mono text-xs hidden sm:table-cell">{c.code}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-xs hidden lg:table-cell">
                          {c.price != null ? c.price : '—'}
                          {c.targetPrice != null && c.targetPrice !== c.price && (
                            <span className="block text-[11px] text-muted-foreground">destino {c.targetPrice}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs hidden md:table-cell max-w-[14rem]">
                          {c.targetCode ? (
                            <>
                              <span className="font-mono">{c.targetCode}</span>
                              {c.targetQuantity != null && (
                                <span className="text-[11px] text-muted-foreground"> · tiene {c.targetQuantity}</span>
                              )}
                              {c.targetName && <p className="line-clamp-1 text-[11px] text-muted-foreground" title={c.targetName}>{c.targetName}</p>}
                            </>
                          ) : '—'}
                        </td>
                        <td className={`px-3 py-2 text-xs ${c.status === 'ready' ? 'text-[var(--c-ok-dim)]' : 'text-muted-foreground'}`}>{c.reason}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <span className="inline-block align-middle">
                            <CeldaAcciones inv={{ almacen_num: almacen, producto_codigo: c.code, producto_nombre: c.name }}
                              analizar sinPrecios onAccion={setAccion} />
                          </span>
                          {c.status === 'ready' && (
                            <Button size="sm" variant="ghost" title="Agregar al formulario" aria-label={`Agregar ${c.code}`} onClick={() => agregar(c)}>
                              <Plus className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 pb-2">
              <Pagination page={paginaCand} total={candidatos.data?.total ?? 0} pageSize={PAGINA} onPage={setPaginaCand} />
            </div>
          </Card>

        </TabsContent>

        <TabsContent value="historial">
          <Card className="p-5 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <h2 className="text-sm font-medium mr-auto">Procesamientos recientes en {almacenValido ? almacen : '—'}</h2>
              <select value={estadoProc} onChange={(e) => { setEstadoProc(e.target.value); setPaginaProc(1); }}
                className={SELECT_CLS} aria-label="Estado del documento" style={{ borderRadius: 'var(--r-ctl)' }}>
                {ESTADOS_PROCESADO.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
              </select>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={buscarProc} onChange={(e) => { setBuscarProc(e.target.value); setPaginaProc(1); }}
                  placeholder="Buscar por documento…" className="pl-8 w-56" style={{ borderRadius: 'var(--r-ctl)' }} />
              </div>
            </div>
            {procesados.isLoading && almacenValido && !sinTkc && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Pidiendo los documentos a TKC…
              </p>
            )}
            {procesados.error && <AlertBanner variant="danger" message={`No se pudieron cargar los procesamientos: ${procesados.error.message}`} />}
            {errorProcesados && <AlertBanner variant="danger" message={mensajeDeError(errorProcesados)} />}
            {almacenValido && !sinTkc && !errorProcesados && !procesados.isLoading && !procesados.error && filasProcesados.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {estadoProc || qProc ? 'Ningún procesamiento cumple estos filtros.' : 'Sin procesamientos recientes.'}
              </p>
            )}
            {filasProcesados.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-3 font-medium">Documento</th>
                      <th className="py-2 pr-3 font-medium">Fecha</th>
                      <th className="py-2 pr-3 font-medium">Estado</th>
                      <th className="py-2 font-medium text-right">Procesados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasProcesados.map((d) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs">{d.code}</td>
                        <td className="py-2 pr-3">{d.date}</td>
                        <td className="py-2 pr-3">
                          {etiquetaProcesado(d.status)}
                          {d.canResume && <span className="block text-[11px] text-muted-foreground">Se puede reanudar en TKC</span>}
                        </td>
                        <td className="py-2 text-right tabular-nums">{d.totalProcessed} de {d.totalProducts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination page={paginaProc} total={procesados.data?.total ?? filasProcesados.length} pageSize={PAGINA} onPage={setPaginaProc} />
              </div>
            )}
            <p className="text-xs text-muted-foreground">Se muestran los 100 más recientes del almacén.</p>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Entrada y análisis: en modal ───────────────────────── */}
      <Dialog open={entradaAbierta} onOpenChange={setEntradaAbierta}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="text-sm font-medium">
            Procesar NoMT — {almacenValido ? almacen : 'sin almacén'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Analizar solo lee y dice qué haría; procesar es lo que mueve la existencia.
          </DialogDescription>
          <div className="space-y-4">
        <label className="block space-y-1.5 text-xs text-muted-foreground">
          Productos — una línea por producto: <code className="font-mono">CODIGO*CANTIDAD</code> (con o sin <code className="font-mono">NoMT</code>; sin cantidad vale 1)
          <Textarea
            rows={7}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'NoMT10157977*1\nNoMT021321020*2'}
            className="font-mono text-sm"
            style={{ borderRadius: 'var(--r-ctl)' }}
          />
        </label>

        {errores.length > 0 && (
          <ul className="text-xs text-[var(--c-bad)] space-y-0.5">
            {errores.slice(0, 8).map((e, i) => (
              <li key={i}>{e.linea ? `Línea ${e.linea}: ` : ''}{e.motivo}{e.texto ? ` («${e.texto}»)` : ''}</li>
            ))}
            {errores.length > 8 && <li>…y {errores.length - 8} más.</li>}
          </ul>
        )}
        {repetidos.length > 0 && (
          <p className="text-xs text-[var(--c-bad)]">
            Repetido con y sin NoMT (es el mismo producto): {repetidos.slice(0, 5).join(', ')}.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {lines.length} {lines.length === 1 ? 'producto' : 'productos'}, {lines.reduce((s, l) => s + l.quantity, 0)} unidades.
            Analizar no mueve la existencia.
          </p>
          <Button variant="outline" onClick={() => analizar.mutate()} disabled={!puedeAnalizar} style={{ borderRadius: 'var(--r-ctl)' }}>
            {analizar.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Search className="w-4 h-4 mr-1.5" />}
            Analizar
          </Button>
        </div>

        {/* ── Análisis ─────────────────────────────────────────── */}
        {analisis?.tipo === 'error' && <AlertBanner variant="danger" message={mensajeDeError(analisis)} />}
        {analisis?.tipo === 'analizado' && (
          <div className="rounded-lg border border-border p-4 space-y-4" style={{ borderRadius: 'var(--r-ctl)' }}>
          <h2 className="text-sm font-medium">
            {analisis.procesables} de {analisis.lineas.length} se pueden procesar
            {!analisisVigente && <span className="text-muted-foreground font-normal"> (cambiaste la entrada: vuelve a analizar)</span>}
          </h2>
          <TablaAnalisis lineas={analisis.lineas} />
          {analisis.rechazadas.length > 0 && (
            <ul className="text-xs text-[var(--c-bad)] space-y-0.5">
              {analisis.rechazadas.map((r, i) => <li key={i}>Línea {r.line}: {r.reason} («{r.code}»)</li>)}
            </ul>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3" style={{ borderRadius: 'var(--r-ctl)' }}>
            <p className="text-xs text-muted-foreground">
              {aProcesar.length > 0
                ? `Se procesarán ${aProcesar.length} ${aProcesar.length === 1 ? 'producto' : 'productos'} en ${documentos} ${documentos === 1 ? 'documento' : 'documentos'}. Lo que no se pueda no se envía.`
                : 'Nada que procesar con esta entrada.'}
            </p>
            <Button onClick={pedirConfirmacion} disabled={!puedeProcesar} style={{ borderRadius: 'var(--r-ctl)' }}>
              {ejecutar.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Procesar
            </Button>
          </div>
          </div>
        )}
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialogNode}
      <DialogosConteo accion={accion} onHecho={() => setAccion(null)} onClose={() => setAccion(null)} />
    </div>
  );
}

function motivo(l) {
  if (l.processable) return '';
  if (l.reason) return l.reason;
  if (l.requested > l.existence) return `Pides ${l.requested} y hay ${l.existence}.`;
  return 'No se puede procesar.';
}

function TablaAnalisis({ lineas }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="py-1.5 pr-3 font-medium">Código</th>
            <th className="py-1.5 pr-3 font-medium">Producto</th>
            <th className="py-1.5 pr-3 font-medium text-right">Pides</th>
            <th className="py-1.5 pr-3 font-medium text-right">Hay</th>
            <th className="py-1.5 pr-3 font-medium">Destino</th>
            <th className="py-1.5 font-medium">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l) => (
            <tr key={l.code} className="border-b last:border-0">
              <td className="py-1.5 pr-3 font-mono">{l.code}</td>
              <td className="py-1.5 pr-3 max-w-[16rem] truncate" title={l.name}>{l.name}</td>
              <td className="py-1.5 pr-3 text-right">{l.requested}</td>
              <td className="py-1.5 pr-3 text-right">{l.existence}</td>
              <td className="py-1.5 pr-3 font-mono">{l.targetCode || '—'}</td>
              <td className={`py-1.5 ${l.processable ? 'text-[var(--c-ok-dim)]' : 'text-[var(--c-bad)]'}`}>
                {l.processable ? 'Se puede procesar' : motivo(l)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultadoProceso({ r }) {
  if (r.tipo === 'error') return <AlertBanner variant="danger" message={mensajeDeError(r)} />;
  if (r.tipo === 'fallo') return <AlertBanner variant="danger" message={r.mensaje} />;
  return (
    <Card className="p-5 space-y-4">
      {(r.tipo === 'procesado' || r.tipo === 'parcial') && (
        <div className={`flex items-center gap-2 ${r.tipo === 'procesado' ? 'text-[var(--c-ok-dim)]' : 'text-[var(--c-warn)]'}`}>
          <CheckCircle2 className="w-4 h-4" />
          <h2 className="text-sm font-medium">
            {r.tipo === 'procesado'
              ? `Procesado: ${r.hechas} ${r.hechas === 1 ? 'producto' : 'productos'}.`
              : `Procesado en parte: ${r.hechas} bien, ${r.falladas} fallaron, ${r.sinVerificar} sin confirmar.`}
          </h2>
        </div>
      )}
      {r.tipo === 'rechazado' && (
        <AlertBanner variant="warning" message={`No se envió nada a TKC.${r.mensaje ? ` ${r.mensaje}` : ''}`} />
      )}
      {r.tipo === 'sin_verificar' && (
        <AlertBanner variant="warning" message={r.mensaje || 'Se envió a TKC y no se pudo comprobar el resultado. Revísalo en TKC antes de repetir.'} />
      )}
      {r.grupos.map((g) => (
        <div key={g.processId ?? g.warehouse}>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            {g.warehouseName}{g.processId ? ` — documento ${g.processId}` : ' — no se llegó a crear el documento'}
          </p>
          <table className="w-full text-xs">
            <tbody>
              {g.lines.map((l) => (
                <tr key={l.code} className="border-b last:border-0">
                  <td className="py-1 pr-3 font-mono">{l.code}</td>
                  <td className="py-1 pr-3 text-right">{l.quantity}</td>
                  <td className={`py-1 pr-3 whitespace-nowrap ${COLOR_LINEA[l.status] ?? ''}`}>{ETIQUETA_LINEA[l.status] ?? l.status}</td>
                  <td className="py-1 text-muted-foreground">{l.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {r.rechazadas.length > 0 && (
        <ul className="text-xs text-[var(--c-bad)] space-y-0.5">
          {r.rechazadas.map((x, i) => <li key={i}>Línea {x.line}: {x.reason} («{x.code}»)</li>)}
        </ul>
      )}
    </Card>
  );
}
