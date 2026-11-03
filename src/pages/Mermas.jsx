import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/shared/StatusBadge';
import MermaForm from '@/components/mermas/MermaForm';
import MermaDetail from '@/components/mermas/MermaDetail';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowDownToLine, Check, ListFilter, Plus, Search } from 'lucide-react';
import { ESTADOS_AMBITO, ETIQUETA_AMBITO } from '@/lib/ambito';
import { useTablaPaginada } from '@/lib/useTablaPaginada';
import Pagination from '@/components/shared/Pagination';
import BajarMermasDialog from '@/components/mermas/BajarMermasDialog';
import { useAlmacen } from '@/lib/useAlmacen';
import { warehouseName } from '@/services/tkc/warehouses';
import ColPicker, { loadColsWithOrder, saveColsWithOrder } from '@/components/shared/ColPicker';
import { ROLES_TIENDA } from '@/lib/ajustes';
import { notifyJefeDepto } from '@/lib/notificationService';
import { logTransicion, logBorrado, notificarTransicion } from '@/lib/workflowService';
import { useSortable } from '@/lib/useSortable';
import { tieneRol } from '@/lib/roles';
import { puedeEliminarMerma } from '@/lib/conteos';
import { useConfirm } from '@/lib/useConfirm';
import DialogosConteo, { CeldaAcciones } from '@/components/inventario/AccionesConteo';
import BotonAccion from '@/components/shared/BotonAccion';
import { FiltroIcono, SelectorAlmacen } from '@/components/shared/ControlesLista';
import CabeceraLista from '@/components/shared/CabeceraLista';
import ListaResponsive from '@/components/shared/ListaResponsive';


/**
 * Elegir el almacén que se está mirando.
 *
 * La lista va filtrada por él, así que sin este control la pantalla depende
 * de un almacén elegido en otro sitio: quien entrara directo a Inventario con
 * el almacén equivocado —o sin ninguno— veía una lista vacía y nada que
 * tocar para arreglarlo.
 */
const PAGE_SIZE = 50

const MERMA_COL_DEFS = [
  { key: 'producto_nombre',   label: 'Producto',      defaultOn: true,  required: true  },
  { key: 'almacen',           label: 'Almacén',       defaultOn: false, required: false },
  { key: 'cantidad',          label: 'Cant.',         defaultOn: true,  required: false },
  { key: 'clasif_merma',      label: 'Clasificación', defaultOn: true,  required: false },
  { key: 'total_perdida',     label: 'Pérdida',       defaultOn: true,  required: false },
  { key: 'estado_tarea',      label: 'Estado',        defaultOn: true,  required: false },
  { key: 'rebaja_confirmada', label: 'Tienda',        defaultOn: true,  required: false },
  { key: 'fecha_inv',         label: 'Fecha',         defaultOn: true,  required: false },
  { key: 'acciones',          label: 'Acciones',      defaultOn: true,  required: false },
]
const MERMA_COLS_KEY = 'merma_cols'

/** Cómo se titula y alinea cada columna. La usan la cabecera y las celdas. */
const COL_TITULO = {
  producto_nombre:   { label: 'Producto' },
  almacen:           { label: 'Almacén',       className: 'hidden md:table-cell' },
  cantidad:          { label: 'Cant.',         align: 'right' },
  clasif_merma:      { label: 'Clasificación' },
  total_perdida:     { label: 'Pérdida',       align: 'right' },
  estado_tarea:      { label: 'Estado',        align: 'center' },
  rebaja_confirmada: { label: 'Tienda',        align: 'center' },
  fecha_inv:         { label: 'Fecha' },
  acciones:          { label: 'Acciones' },
}

/** Clave de orden de la pantalla → columna real, para que ordene Postgres. */
const ORDEN_COLUMNA = {
  producto_nombre: 'producto_nombre',
  almacen:         'almacen_num',
  cantidad:        'cantidad',
  clasif_merma:    'clasif_merma',
  total_perdida:   'total_perdida',
  rebaja_confirmada: 'rebaja_confirmada',
  estado_tarea:    'estado_tarea',
  fecha_inv:       'fecha_inv',
}

/** Quién ve las mermas de los demás. Mismo criterio que en inventario. */
const VISTA_GLOBAL_MERMAS = ['jefe_depto', 'fact', 'auditor', 'administrador', 'superadmin'];


export default function Mermas({ ambito = 'inventario' }) {
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  // Por defecto, lo que le toca a esta sección. Ver src/lib/ambito.js.
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const [filterEstado, setFilterEstado] = useState('ambito');
  const [searchQ, setSearchQ] = useState('');
  const [cols, setCols] = useState(() => loadColsWithOrder(MERMA_COLS_KEY, MERMA_COL_DEFS).visible);
  const [colOrder, setColOrder] = useState(() => loadColsWithOrder(MERMA_COLS_KEY, MERMA_COL_DEFS).order);
  const [page, setPage] = useState(1);
  // Cambiar de almacén, de filtro o de búsqueda devuelve a la primera página.
  const firmaFiltros = `${almacen}|${filterEstado}|${searchQ.trim()}`;
  const firmaPrevia = useRef(firmaFiltros);
  useEffect(() => {
    if (firmaPrevia.current !== firmaFiltros) { firmaPrevia.current = firmaFiltros; setPage(1); }
  }, [firmaFiltros]);
  const queryClient = useQueryClient();
  const { sort, onSort } = useSortable('fecha_inv', 'desc');

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const role = user?.role || 'inv';
  // Igual que en inventario: cada uno ve lo suyo y lo de su almacén; la vista
  // global es del jefe de departamento y de quien tiene que procesarlas.
  const vistaGlobal = tieneRol(user, VISTA_GLOBAL_MERMAS);
  // Una merma sigue contada en el piso de tienda hasta que se baja. Quien
  // puede mover mercancía puede hacerlo desde aquí.
  const puedeBajar = tieneRol(user, ROLES_TIENDA);
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [bajando, setBajando] = useState(null);   // { mermas, almacen }
  const [accionFila, setAccionFila] = useState(null);   // { tipo, inv } del menú de la fila
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  const condiciones = {
    ...(almacen ? { almacen_num: almacen } : {}),
    ...(vistaGlobal || !user?.email ? {} : { especialista_id: user.email }),
    ...(filterEstado === 'all' ? {}
      : filterEstado === 'ambito' ? { estado_tarea: ESTADOS_AMBITO[ambito] }
      : { estado_tarea: filterEstado }),
  };

  const { filas: mermasRaw, total, cargando: isLoading } = useTablaPaginada({
    entidad: 'Merma',
    clave: ['mermas', almacen, vistaGlobal ? 'todos' : user?.email, ambito, filterEstado],
    condiciones,
    texto: searchQ,
    campos: ['producto_nombre', 'producto_codigo'],
    orden: ORDEN_COLUMNA[sort.key] ? `${sort.dir === 'asc' ? '' : '-'}${ORDEN_COLUMNA[sort.key]}` : '-created_date',
    pagina: page,
    porPagina: PAGE_SIZE,
    activa: Boolean(user),
  });

  const mermas = mermasRaw ?? [];

  const createMut = useMutation({
    mutationFn: (data) => base44.entities.Merma.create(data),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['mermas'] });
      setShowForm(false);
      const registro = { ...variables, id: result?.id, estado_tarea: null }
      logTransicion('mermas', registro, variables.estado_tarea, user, variables).catch(() => {})
      notificarTransicion('mermas', registro, variables.estado_tarea, user).catch(() => {})
      notifyJefeDepto(
        'inventario', 'merma',
        'Nueva merma registrada',
        `Producto: ${variables?.producto_nombre || '—'} — por ${user?.full_name || user?.email || '—'}`
      ).catch(() => {});
    },
    onError: (error) => alert(error.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Merma.update(id, data),
    onSuccess: (_, variables) => {
      if (variables.data?.estado_tarea) {
        const mermaAntes = mermas.find(m => m.id === variables.id) || {}
        notificarTransicion('mermas', { ...mermaAntes, ...variables.data }, variables.data.estado_tarea, user).catch(() => {})
      }
      queryClient.invalidateQueries({ queryKey: ['mermas'] })
      setSelectedId(null)
    },
    onError: (error) => alert(error.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id) => {
      // La traza va ANTES del borrado: después ya no hay fila de la que
      // sacar el producto ni la diferencia.
      const fila = mermas.find((x) => x.id === id);
      if (fila) await logBorrado('mermas', fila, user);
      return base44.entities.Merma.delete(id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['mermas'] }); setSelectedId(null); },
    onError: (error) => alert(error.message),
  });

  const selected = mermas.find(m => m.id === selectedId);

  const sorted = mermas;

  // El acumulado es el de la página que se está viendo, no el de la tabla
  // entera: decir «total» de lo que solo es una página sería mentir.
  const perdidaPagina = sorted.reduce((s, m) => s + (m.total_perdida || 0), 0);

  // ── Selección para bajar de tienda ──────────────────────────
  //
  // Solo entran las que tienen código y cantidad: sin eso no hay nada que
  // mandarle a TKC.
  // Lo ya rebajado queda fuera: volver a bajarlo sacaría del piso de tienda
  // unidades que ya se sacaron.
  const bajables = sorted.filter(
    m => m.producto_codigo && Number(m.cantidad) > 0 && !m.rebaja_confirmada,
  );
  const marcadas = bajables.filter(m => seleccion.has(m.id));
  // Un envío va a UN almacén: la API de transferencias recibe un `warehouse`.
  // Mezclarlos no se puede resolver aquí, así que se avisa y no se deja.
  const almacenes = [...new Set(marcadas.map(m => m.almacen_num).filter(Boolean))];
  const mezclaAlmacenes = almacenes.length > 1;
  const unidadesMarcadas = marcadas.reduce((s, m) => s + Math.abs(Number(m.cantidad) || 0), 0);

  const alternar = (id) => setSeleccion(prev => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });
  const todasMarcadas = bajables.length > 0 && marcadas.length === bajables.length;
  const alternarTodas = () => setSeleccion(
    todasMarcadas ? new Set() : new Set(bajables.map(m => m.id)),
  );
  const abrirBajada = (lista) => setBajando({ mermas: lista, almacen: lista[0]?.almacen_num });

  // Bajar de tienda es el flujo de la merma (marca la rebaja y la adelanta de
  // estado), no el movimiento suelto del catálogo. Eliminar se confirma aquí
  // y se borra con la misma traza que el botón del detalle.
  const alElegirAccion = async ({ tipo, inv }) => {
    if (tipo === 'bajar') { abrirBajada([inv]); return; }
    if (tipo !== 'eliminar') { setAccionFila({ tipo, inv }); return; }
    const ok = await confirmDialog('Esta acción no se puede deshacer.', {
      title: `¿Eliminar la merma de «${inv.producto_nombre}»?`, destructive: true,
    });
    if (ok) deleteMut.mutate(inv.id);
  };

  return (
    <div className="space-y-6">
      {ConfirmDialogNode}
      <CabeceraLista
        titulo="Mermas"
        subtitulo={ambito === 'facturacion'
          ? 'Mermas ya bajadas de tienda, a la espera de facturación'
          : 'Registro y seguimiento de mermas'}
        recuento={`${total} ${total === 1 ? 'resultado' : 'resultados'}`}
        buscador={(
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Buscar..." className="pl-10" style={{ borderRadius: 'var(--r-ctl)' }} />
          </div>
        )}
        filtros={(
          <>
          <SelectorAlmacen almacen={almacen} setAlmacen={setAlmacen} almacenesConfig={almacenesConfig} />
          <FiltroIcono
            icono={ListFilter}
            etiqueta="Estado"
            valor={filterEstado}
            porDefecto="ambito"
            onChange={setFilterEstado}
            opciones={[
              { valor: 'ambito', label: ETIQUETA_AMBITO[ambito] },
              { valor: 'all', label: 'Todos los estados' },
              { valor: 'en_curso', label: 'En curso' },
              { valor: 'pend_fact', label: 'Pend. FACT' },
              { valor: 'en_auditoria', label: 'En auditoría' },
              { valor: 'completado', label: 'Completado' },
              { valor: 'devuelto', label: 'Devuelto' },
              { valor: 'reconteo_solicitado', label: 'Reconteo' },
            ]}
          />
          <ColPicker cols={MERMA_COL_DEFS} visible={cols}
            onChange={(next) => { setCols(next); saveColsWithOrder(MERMA_COLS_KEY, next, colOrder); }}
            storageKey={MERMA_COLS_KEY} order={colOrder}
            onOrderChange={(next) => { setColOrder(next); saveColsWithOrder(MERMA_COLS_KEY, cols, next); }} />
          {tieneRol(user, ['inv', 'administrador', 'superadmin']) && (
            <BotonAccion icono={Plus} onClick={() => { setShowForm(true); setSelectedId(null); }}>
              Registrar merma
            </BotonAccion>
          )}
          </>
        )}
      />

      <Dialog open={showForm} onOpenChange={(o) => { if (!o && !createMut.isPending) setShowForm(false) }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar merma</DialogTitle>
          </DialogHeader>
          <MermaForm user={user} onSubmit={(d) => createMut.mutate(d)} onCancel={() => setShowForm(false)} isPending={createMut.isPending} />
        </DialogContent>
      </Dialog>


      {/* La barra está siempre que haya algo que bajar, no solo al marcar: si
          el botón aparece con la selección, quien no sabe que puede marcar
          tampoco descubre que puede bajarlas. */}
      {puedeBajar && bajables.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-[var(--c-warn)]/30 bg-[var(--c-warn)]/5"
          style={{ borderRadius: 'var(--r-card)' }}>
          {/* `basis-full` hasta `sm`: con `flex-1 min-w-0` el texto podia
              encogerse por debajo de su palabra mas corta, asi que en el movil
              no bajaba de linea y quedaba una columna de una palabra por fila
              con los botones al lado. */}
          <p className="text-sm basis-full sm:basis-0 sm:flex-1 min-w-0">
            {marcadas.length === 0 ? (
              <span className="text-muted-foreground">
                {bajables.length} {bajables.length === 1 ? 'merma sin bajar' : 'mermas sin bajar'} de tienda.
                Mientras sigan contadas en el piso, la existencia dice que hay algo que no hay.
              </span>
            ) : (
              <>
                <span className="font-medium">{marcadas.length}</span>
                {marcadas.length === 1 ? ' merma seleccionada' : ' mermas seleccionadas'}
                {' · '}{unidadesMarcadas} {unidadesMarcadas === 1 ? 'unidad' : 'unidades'}
              </>
            )}
            {mezclaAlmacenes && (
              <span className="block text-xs text-[var(--c-bad)] mt-0.5">
                Son de {almacenes.length} almacenes distintos y cada envío va a uno solo. Deja marcadas las de un almacén.
              </span>
            )}
          </p>
          <Button variant="ghost" size="sm" className="shrink-0" onClick={alternarTodas}>
            {todasMarcadas ? 'Quitar selección' : 'Seleccionar todas'}
          </Button>
          <Button size="sm" className="shrink-0" disabled={marcadas.length === 0 || mezclaAlmacenes}
            onClick={() => abrirBajada(marcadas)} style={{ borderRadius: 'var(--r-ctl)' }}>
            <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
            Bajar de tienda
          </Button>
        </div>
      )}

      <ListaResponsive
        columnas={colOrder.filter((k) => cols[k])}
        titulos={COL_TITULO}
        filas={sorted}
        cargando={isLoading}
        vacio="Ninguna merma con estos filtros."
        claveDe={(m) => m.id}
        encabezado="producto_nombre"
        accion="acciones"
        orden={{ sort, onSort }}
        alPulsar={(m) => { setSelectedId(m.id); setShowForm(false); }}
        cabeceraMarca={puedeBajar ? (
          <input type="checkbox" aria-label="Seleccionar todas"
            checked={todasMarcadas} onChange={alternarTodas}
            disabled={bajables.length === 0}
            className="w-3.5 h-3.5 accent-[var(--c-warn)] cursor-pointer" />
        ) : null}
        marca={puedeBajar ? ((m) => (
          m.producto_codigo && Number(m.cantidad) > 0 && !m.rebaja_confirmada ? (
            <input type="checkbox" aria-label={`Seleccionar ${m.producto_nombre}`}
              checked={seleccion.has(m.id)} onChange={() => alternar(m.id)}
              className="w-3.5 h-3.5 accent-[var(--c-warn)] cursor-pointer" />
          ) : null
        )) : undefined}
        pie={(
          <tfoot>
            <tr className="border-t bg-secondary/30">
              <td colSpan={colOrder.filter((k) => cols[k]).length + (puedeBajar ? 1 : 0)}
                className="p-3 text-xs font-medium text-muted-foreground">
                Pérdida en esta página
                <span className="ml-2 text-sm text-[var(--c-bad)]">${perdidaPagina.toFixed(2)}</span>
              </td>
            </tr>
          </tfoot>
        )}
        celda={(m, k, enTabla) => celdaMerma({
          merma: m, clave: k, enTabla,
          acciones: (f) => (
            <CeldaAcciones inv={f} onAccion={alElegirAccion}
              // Solo se baja lo que sigue contado en el piso de tienda.
              // Facturación solo retira: la bajada de tienda y los precios no son suyos.
              puedeMoverTienda={ambito !== 'facturacion' && puedeBajar && Boolean(f.producto_codigo) && Number(f.cantidad) > 0 && !f.rebaja_confirmada}
              sinPrecios={ambito === 'facturacion'}
              modulos={['bajar']}
              analizar={ambito === 'facturacion'}
              puedeEliminar={puedeEliminarMerma(f, user)} />
          ),
        })}
      />

      {/* Historial del submayor y conteos del producto de la merma. */}
      <DialogosConteo accion={accionFila} onClose={() => setAccionFila(null)} />

      {/* La pérdida de la página también en el móvil, donde no hay pie de
          tabla que la lleve. */}
      <p className="sm:hidden flex justify-between text-xs text-muted-foreground px-1">
        Pérdida en esta página
        <span className="font-medium text-[var(--c-bad)]">${perdidaPagina.toFixed(2)}</span>
      </p>

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />

      {bajando && (
        <BajarMermasDialog
          mermas={bajando.mermas}
          almacen={bajando.almacen}
          onHecho={() => setSeleccion(new Set())}
          onClose={() => setBajando(null)}
        />
      )}

      <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          {selected && (
            <MermaDetail
              merma={selected}
              role={role}
              user={user}
              onUpdate={(data) => updateMut.mutate({ id: selected.id, data })}
              onDelete={() => deleteMut.mutate(selected.id)}
              isUpdating={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Una celda del listado de mermas.
 *
 * La misma para la tabla y para la ficha del móvil: con `enTabla` se envuelve
 * en `<td>` y sin él va suelta dentro de la ficha.
 */
function celdaMerma({ merma: m, clave, enTabla, acciones }) {
  // `py-1.5`: la fila baja de 44 px a 32. En una pantalla de portátil eso
  // son seis filas más sin desplazar, que es de lo que va un listado de
  // trabajo. La ficha del teléfono no cambia: ahí el dedo manda.
  const env = (contenido, clases = '') => (enTabla
    ? <td key={clave} className={`px-2.5 py-1.5 ${clases}`}>{contenido}</td>
    : contenido);

  switch (clave) {
    case 'producto_nombre':
      return env(
        <>
          <p className="font-medium leading-snug">{m.producto_nombre}</p>
          <p className="text-xs text-muted-foreground font-mono">{m.producto_codigo}</p>
        </>,
      );
    case 'almacen':
      return env(
        <span className="text-xs text-muted-foreground">
          {warehouseName(m.almacen_num) || m.almacen_num || '\u2014'}
        </span>,
      );
    case 'cantidad':
      return env(<span className="font-medium tabular-nums">{m.cantidad}</span>, 'text-right');
    case 'clasif_merma':
      return env(<span className="text-xs">{m.clasif_merma}</span>);
    case 'total_perdida':
      return env(
        <span className="font-medium tabular-nums text-[var(--c-bad)]">
          ${m.total_perdida?.toFixed(2) || '0.00'}
        </span>,
        'text-right',
      );
    case 'estado_tarea':
      return env(<StatusBadge status={m.estado_tarea} />, 'text-center');
    case 'rebaja_confirmada':
      return env(
        m.rebaja_confirmada ? (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--c-ok-dim)] bg-[var(--c-ok-dim)]/10 px-2 py-1 rounded-md whitespace-nowrap"
            title={m.fecha_rebaja_tienda ? `Bajado el ${m.fecha_rebaja_tienda}` : 'Bajado de tienda'}>
            <Check className="w-3 h-3" /> Bajado
          </span>
        ) : m.producto_codigo && Number(m.cantidad) > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--c-warn)] bg-[var(--c-warn)]/10 px-2 py-1 rounded-md whitespace-nowrap">
            Sin bajar
          </span>
        ) : (
          <span className="text-xs text-muted-foreground/40">\u2014</span>
        ),
        'text-center',
      );
    case 'fecha_inv':
      return env(<span className="text-muted-foreground">{m.fecha_inv?.slice(0, 10)}</span>);
    case 'acciones':
      return env(acciones(m), 'whitespace-nowrap');
    default:
      return env(null);
  }
}
