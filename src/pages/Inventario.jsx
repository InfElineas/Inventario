import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AlertBanner from '@/components/shared/AlertBanner';
import SugerenciasNota from '@/components/shared/SugerenciasNota';
import InventarioForm from '@/components/inventario/InventarioForm';
import ReadOnlyBlock, { ReadOnlyField } from '@/components/shared/ReadOnlyBlock';
import Timeline from '@/components/shared/Timeline';
import { ChevronRight, ClipboardList, ListFilter, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { ESTADOS_AMBITO, ETIQUETA_AMBITO } from '@/lib/ambito';
import { useTablaPaginada } from '@/lib/useTablaPaginada';
import { useAlmacen } from '@/lib/useAlmacen';
import { Textarea } from '@/components/ui/textarea';
import ColPicker, { loadColsWithOrder, saveColsWithOrder } from '@/components/shared/ColPicker';
import Pagination from '@/components/shared/Pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { notifyJefeDepto } from '@/lib/notificationService';
import { logTransicion, logBorrado, notificarTransicion, avisarConteoReemplazado, avisarIntercambioEmparejado } from '@/lib/workflowService';
import { useConfirm } from '@/lib/useConfirm';
import { CLASIF_AJUSTE, CLASIF_FACT, ESTADO_FACT, conValorActual } from '@/lib/constants'
import { ESTADO_POR_RESULTADO, estadoContradictorio } from '@/lib/ajusteFact'
import { useSortable } from '@/lib/useSortable';
import { tieneRol } from '@/lib/roles';
import { ROLES_TIENDA } from '@/lib/ajustes';
import { puedeEliminarConteo, revisionesDeConteo } from '@/lib/conteos';
import DialogosConteo, { CeldaAcciones } from '@/components/inventario/AccionesConteo';
import { FiltroIcono, SelectorAlmacen } from '@/components/shared/ControlesLista';
import CabeceraLista from '@/components/shared/CabeceraLista';
import ListaResponsive from '@/components/shared/ListaResponsive';
import SelectorIntercambio, { CLASIF_INTERCAMBIO, cambiosDelPar } from '@/components/inventario/SelectorIntercambio';
import ExistenciaAhora from '@/components/inventario/ExistenciaAhora';
import ComentariosDeSupervision from '@/components/supervision/ComentariosDeSupervision';
import HistorialPorUsuario from '@/components/inventario/HistorialPorUsuario';
import { celdaConteo } from '@/components/inventario/celdasConteo';

const PAGE_SIZE = 50

/** Clave de orden de la pantalla → columna real, para que ordene Postgres. */
const ORDEN_COLUMNA = {
  producto:      'producto_nombre',
  almacen:       'almacen_num',
  ef_tkc:        'exist_fisica_tkc',
  conteo:        'conteo_real',
  diferencia:    'diferencia',
  clasificacion: 'clasif_ajuste',
  especialista:  'especialista_nombre',
  estado:        'estado_tarea',
  fecha:         'fecha_inv',
}


/**
 * Elegir el almacén que se está mirando.
 *
 * La lista va filtrada por él, así que sin este control la pantalla depende
 * de un almacén elegido en otro sitio: quien entrara directo a Inventario con
 * el almacén equivocado —o sin ninguno— veía una lista vacía y nada que
 * tocar para arreglarlo.
 */

/**
 * Quién ve los conteos de los demás.
 *
 * El inventarista, los suyos. El jefe de departamento sigue el trabajo de su
 * gente; facturación y auditoría los procesan, así que tienen que verlos.
 */
const VISTA_GLOBAL_INV = ['jefe_depto', 'fact', 'auditor', 'administrador', 'superadmin'];

/**
 * Deja atado el otro conteo del intercambio.
 *
 * Las dos mitades son el mismo hecho contado dos veces, así que al declarar
 * una hay que dejar la otra igual: enlazada de vuelta, con la clasificación
 * de intercambio y en el mismo estado. Antes solo se escribía el enlace, y
 * el otro conteo se quedaba en borrador con la clasificación que tuviera:
 * facturación veía llegar medio caso y el borrador esperaba a alguien que ya
 * lo daba por cerrado.
 *
 * Si el par era de otra persona, se le avisa: su conteo se le fue de las
 * manos sin que ella tocara nada.
 */
async function enlazarPar({ parId, propio, estado, producto, user }) {
  const par = await base44.entities.Inventario.update(parId, cambiosDelPar(propio, estado));
  const seFue = estado && estado !== 'en_curso';
  if (seFue && par?.especialista_id && par.especialista_id !== user?.email) {
    await avisarIntercambioEmparejado(par, user, producto);
  }
  return par;
}

const INV_COL_DEFS = [
  { key: 'producto',      label: 'Producto',       defaultOn: true,  required: true  },
  { key: 'almacen',       label: 'Almacén',        defaultOn: true,  required: false },
  { key: 'ef_tkc',        label: 'EF TKC',         defaultOn: true,  required: false },
  { key: 'conteo',        label: 'Conteo real',     defaultOn: true,  required: false },
  { key: 'diferencia',    label: 'Diferencia',      defaultOn: true,  required: false },
  { key: 'clasificacion', label: 'Clasificación',   defaultOn: false, required: false },
  { key: 'especialista',  label: 'Especialista',    defaultOn: false, required: false },
  { key: 'estado',        label: 'Estado',          defaultOn: true,  required: false },
  { key: 'fecha',         label: 'Fecha',           defaultOn: true,  required: false },
  { key: 'acciones',      label: 'Acciones',        defaultOn: true,  required: false },
]
const INV_COLS_KEY = 'inv_cols'

/** Cómo se titula y alinea cada columna. La usan la cabecera y el ColPicker. */
const COL_TITULO = {
  producto:      { label: 'Producto',      className: 'hidden sm:table-cell' },
  almacen:       { label: 'Almacén',       className: 'hidden md:table-cell' },
  ef_tkc:        { label: 'EF TKC',        align: 'right', className: 'hidden sm:table-cell' },
  conteo:        { label: 'Conteo',        align: 'right', className: 'hidden sm:table-cell' },
  diferencia:    { label: 'Diferencia',    align: 'right' },
  clasificacion: { label: 'Clasificación', className: 'hidden lg:table-cell' },
  especialista:  { label: 'Especialista',  className: 'hidden lg:table-cell' },
  estado:        { label: 'Estado',        align: 'center' },
  fecha:         { label: 'Fecha',         className: 'hidden md:table-cell' },
  acciones:      { label: 'Acciones' },
}

export default function Inventario() {
  // Lo de facturación se resuelve en las pantallas de ajustes, procesamientos y transferencias.
  const ambito = 'inventario';
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [accionFila, setAccionFila] = useState(null);   // { tipo, inv } del menú de la fila
  // Por defecto, lo que le toca a esta sección. Ver src/lib/ambito.js.
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const [vista, setVista] = useState('conteos');   // 'conteos' | 'historial'
  const [filterEstado, setFilterEstado] = useState('ambito');
  const [searchQ, setSearchQ] = useState('');
  const [cols, setCols] = useState(() => loadColsWithOrder(INV_COLS_KEY, INV_COL_DEFS).visible);
  const [colOrder, setColOrder] = useState(() => loadColsWithOrder(INV_COLS_KEY, INV_COL_DEFS).order);
  const [page, setPage] = useState(1);
  // Cambiar de almacén, de filtro o de búsqueda devuelve a la primera página:
  // seguir en la siete de un listado que ahora tiene dos deja la tabla vacía.
  const firmaFiltros = `${almacen}|${filterEstado}|${searchQ.trim()}`;
  const firmaPrevia = useRef(firmaFiltros);
  useEffect(() => {
    if (firmaPrevia.current !== firmaFiltros) { firmaPrevia.current = firmaFiltros; setPage(1); }
  }, [firmaFiltros]);
  const { sort, onSort } = useSortable('fecha_inv', 'desc')
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const role = user?.role || 'inv';

  // Un inventarista ve SUS conteos, y solo los del almacén en el que está.
  // Antes la lista traía los últimos 200 de los treinta almacenes y de todo el
  // mundo, sin decir siquiera a cuál pertenecía cada uno: con eso no se puede
  // trabajar ni saber si falta algo por contar.
  //
  // La vista global es del jefe de departamento, que es quien sigue el trabajo
  // de los suyos; facturación y auditoría ven los de todos porque les toca
  // procesarlos.
  const vistaGlobal = tieneRol(user, VISTA_GLOBAL_INV);
  const puedeMoverTienda = tieneRol(user, ROLES_TIENDA);

  // Qué filas le tocan a esta pantalla. Va al WHERE, no al navegador: lo que
  // se filtra aquí tiene que contar para el total y para las páginas.
  const condiciones = {
    ...(almacen ? { almacen_num: almacen } : {}),
    ...(vistaGlobal || !user?.email ? {} : { especialista_id: user.email }),
    ...(filterEstado === 'all' ? {}
      : filterEstado === 'ambito' ? { estado_tarea: ESTADOS_AMBITO[ambito] }
      : { estado_tarea: filterEstado }),
  };

  const { filas: inventariosRaw, total, cargando: isLoading } = useTablaPaginada({
    entidad: 'Inventario',
    clave: ['inventarios', almacen, vistaGlobal ? 'todos' : user?.email, ambito, filterEstado],
    condiciones,
    texto: searchQ,
    campos: ['producto_nombre', 'producto_codigo'],
    orden: ORDEN_COLUMNA[sort.key] ? `${sort.dir === 'asc' ? '' : '-'}${ORDEN_COLUMNA[sort.key]}` : '-created_date',
    pagina: page,
    porPagina: PAGE_SIZE,
    activa: Boolean(user),
  });

  const inventarios = inventariosRaw ?? [];

  // Aquí se descargaban 500 productos en cada visita para marcar los que
  // están bajo su `stock_minimo`. Ese campo había que rellenarlo a mano
  // producto por producto y nunca se rellenó, así que el contador salía
  // siempre a cero y el punto rojo no aparecía jamás. Lo que de verdad
  // responde «qué hay que reponer» es la rotación de venta, y de eso se
  // encarga el panel de reabastecimiento.

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Inventario.create(data),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      setShowForm(false);
      // La otra mitad del intercambio. El id de este conteo no existía hasta
      // ahora, así que el enlace de vuelta se escribe aquí.
      if (variables.intercambio_id && result?.id) {
        enlazarPar({
          parId: variables.intercambio_id,
          propio: result.id,
          estado: variables.estado_tarea,
          producto: variables.producto_nombre,
          user,
        })
          .catch((e) => alert(
            'El conteo se guardó, pero no se pudo enlazar con el otro conteo del '
            + `intercambio: ${e.message}. Ábrelo y vuelve a emparejarlo.`,
          ))
          .finally(() => queryClient.invalidateQueries({ queryKey: ['inventarios'] }));
      }
      // La fecha de vencimiento que trae el conteo corrige el lote: sin esto
      // quedaba en el conteo y el estado de vigencia seguía con la del informe.
      const revisiones = revisionesDeConteo(variables, user);
      if (revisiones.length > 0) {
        Promise.all(revisiones.map((r) => base44.entities.LoteRevision.create(r)))
          .catch((e) => alert(
            'El conteo se guardó, pero no se pudo actualizar la fecha de vencimiento del lote: '
            + `${e.message}. Corrígela desde Vencimientos.`,
          ))
          .finally(() => {
            queryClient.invalidateQueries({ queryKey: ['lotes'] });
            queryClient.invalidateQueries({ queryKey: ['lotes-resumen'] });
          });
      }
      const registro = { ...variables, id: result?.id, estado_tarea: null }
      logTransicion('inventarios', registro, variables.estado_tarea, user, variables).catch(() => {})
      notificarTransicion('inventarios', registro, variables.estado_tarea, user).catch(() => {})
      notifyJefeDepto(
        'inventario', 'sistema',
        'Nuevo conteo registrado',
        `Producto: ${variables?.producto_nombre || '—'} — por ${user?.full_name || user?.email || '—'}`
      ).catch(() => {});
    },
    onError: (error) => alert(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      // La traza va ANTES del borrado: después ya no hay fila de la que
      // sacar el producto ni la diferencia.
      const fila = inventarios.find((x) => x.id === id);
      if (fila) await logBorrado('inventarios', fila, user);
      return base44.entities.Inventario.delete(id);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['inventarios'] }); setSelectedId(null); },
    onError: (error) => alert(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, hermanos = [] }) => {
      const r = await base44.entities.Inventario.update(id, data);

      // La otra mitad del intercambio. Se escribe aquí y no en el formulario
      // porque el enlace vale en los dos sentidos: abrir cualquiera de los
      // dos conteos tiene que llevar al otro.
      if (data.intercambio_id) {
        try {
          await enlazarPar({
            parId: data.intercambio_id,
            propio: id,
            estado: data.estado_tarea,
            producto: data.producto_nombre ?? inventarios.find((x) => x.id === id)?.producto_nombre,
            user,
          });
        } catch (e) {
          // El conteo ya quedó guardado; fallar aquí no lo deshace. Pero
          // callarlo deja un intercambio a medias sin que nadie lo sepa.
          alert('El conteo se guardó, pero no se pudo enlazar con el otro conteo del '
            + `intercambio: ${e.message}. Ábrelo y vuelve a emparejarlo.`);
        }
      }

      // Los conteos anteriores del mismo producto se cierran sin ajuste: su
      // diferencia se midió contra la existencia de otro día. Se les deja
      // escrito el motivo y se avisa a quien los hizo, para que no se entere
      // por una bandeja que de pronto está vacía.
      for (const h of hermanos) {
        try {
          await base44.entities.Inventario.update(h.id, {
            estado_tarea: 'completado',
            fact_estado: 'No Procesar x Fact',
            fact_especialista_id: user?.email,
            fact_especialista_nombre: user?.full_name,
            fact_fecha: new Date().toISOString().slice(0, 10),
            fact_notas: `Cerrado sin ajuste: lo reemplaza el conteo del ${data.fecha_inv ?? 'más reciente'}. `
              + 'Su diferencia se midió contra otra existencia.'
              + (h.fact_notas ? ` — ${h.fact_notas}` : ''),
          });
          await avisarConteoReemplazado(h, user);
        } catch { /* no puede impedir el procesamiento del que sí vale */ }
      }
      return r;
    },
    onSuccess: (_, variables) => {
      if (variables.data?.estado_tarea) {
        const invAntes = inventarios.find(i => i.id === variables.id) || {}
        logTransicion('inventarios', invAntes, variables.data.estado_tarea, user, variables.data).catch(() => {})
        notificarTransicion('inventarios', { ...invAntes, ...variables.data }, variables.data.estado_tarea, user).catch(() => {})
      }
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      setSelectedId(null);
    },
    onError: (error) => alert(error.message),
  });

  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  // Eliminar no abre un diálogo propio: se confirma y se borra, con la misma
  // traza que el botón del detalle.
  const alElegirAccion = async (accion) => {
    if (accion.tipo !== 'eliminar') { setAccionFila(accion); return; }
    const ok = await confirmDialog('Esta acción no se puede deshacer.', {
      title: `¿Eliminar el conteo de «${accion.inv.producto_nombre}»?`, destructive: true,
    });
    if (ok) deleteMutation.mutate(accion.inv.id);
  };

  const selected = inventarios.find(i => i.id === selectedId);

  // Conteos ANTERIORES del mismo producto que siguen esperando a facturación.
  // Son los que quedarían con un ajuste pendiente que ya no corresponde.
  const hermanosPendientes = selected
    ? inventarios.filter(i =>
        i.id !== selected.id
        && i.estado_tarea === 'pend_fact'
        && i.almacen_num === selected.almacen_num
        && (i.producto_id ?? i.producto_codigo) === (selected.producto_id ?? selected.producto_codigo)
        && (i.fecha_inv ?? '') <= (selected.fecha_inv ?? ''))
    : [];

  const sorted = inventarios;

  const difColor = (d) => d === 0 ? 'text-[var(--c-ok-dim)]' : d > 0 ? 'text-[var(--c-warn)]' : 'text-[var(--c-bad)]';


  // Las mismas dos pestañas bajo el título en las dos vistas.
  const pestanas = (
    <Tabs value={vista} onValueChange={setVista}>
      <TabsList>
        <TabsTrigger value="conteos">Conteos</TabsTrigger>
        <TabsTrigger value="historial">Historial por usuario</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (vista === 'historial') {
    return (
      <div className="space-y-6">
        <HistorialPorUsuario user={user} vistaGlobal={vistaGlobal} pestanas={pestanas} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ConfirmDialogNode}
      <CabeceraLista
        titulo="Inventario"
        subtitulo="Conteos y ajustes de inventario"
        pestanas={pestanas}
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
            ]}
          />
          <ColPicker cols={INV_COL_DEFS} visible={cols}
            onChange={(next) => { setCols(next); saveColsWithOrder(INV_COLS_KEY, next, colOrder); }}
            storageKey={INV_COLS_KEY} order={colOrder}
            onOrderChange={(next) => { setColOrder(next); saveColsWithOrder(INV_COLS_KEY, cols, next); }} />
          {/* Reabastecimiento tiene pantalla propia: comprar no es contar, y
              el panel incrustado aquí no daba sitio para pestañas ni filtros. */}
          <Button variant="outline" asChild style={{ borderRadius: 'var(--r-ctl)' }}>
            <Link to="/reabastecimiento">
              <ShoppingCart className="w-4 h-4 lg:mr-1.5" />
              <span className="hidden lg:inline">Reabastecimiento</span>
            </Link>
          </Button>
          {tieneRol(user, ['inv', 'administrador', 'superadmin']) && (
            <Button onClick={() => { setShowForm(true); setSelectedId(null); }} style={{ borderRadius: 'var(--r-ctl)' }}>
              <Plus className="w-4 h-4 lg:mr-1.5" /><span className="hidden lg:inline"> Nuevo conteo</span>
            </Button>
          )}
          </>
        )}
      />

      <Dialog open={showForm} onOpenChange={(o) => { if (!o && !createMutation.isPending) setShowForm(false) }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo conteo de inventario</DialogTitle>
          </DialogHeader>
          <InventarioForm user={user} onSubmit={(d) => createMutation.mutate(d)} onCancel={() => setShowForm(false)} isPending={createMutation.isPending} />
        </DialogContent>
      </Dialog>

      <MisPendientes
        inventarios={inventarios}
        email={user?.email}
        onAbrir={(id) => { setSelectedId(id); setShowForm(false); }}
        onVerTodos={() => { setFilterEstado('en_curso'); setSearchQ(''); }}
      />


      <ListaResponsive
        columnas={colOrder.filter((k) => cols[k])}
        titulos={COL_TITULO}
        filas={sorted}
        cargando={isLoading}
        vacio="Ningún conteo con estos filtros."
        claveDe={(inv) => inv.id}
        encabezado="producto"
        orden={{ sort, onSort }}
        accion="acciones"
        alPulsar={(inv) => { setSelectedId(inv.id); setShowForm(false); }}
        celda={(inv, k, enTabla) => celdaConteo(inv, k, enTabla, difColor, (f) => (
          <CeldaAcciones inv={f} puedeMoverTienda={puedeMoverTienda}
            puedeEliminar={puedeEliminarConteo(f, user)} onAccion={alElegirAccion} />
        ))}
      />

      {/* Las acciones del catálogo sobre la fila. Mover cambia la existencia
          en TKC, así que se descarta lo que se tenía de ella. */}
      <DialogosConteo
        accion={accionFila}
        onHecho={() => queryClient.invalidateQueries({ queryKey: ['submayor-producto'] })}
        onClose={() => setAccionFila(null)}
      />

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />

      {/* Detail modal */}
      <Dialog open={!!selectedId} onOpenChange={(o) => { if (!o) setSelectedId(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-0">
          {selected && (
            <InventarioDetail
              inv={selected}
              role={role}
              user={user}
              onUpdate={(data, hermanos) => updateMutation.mutate({ id: selected.id, data, hermanos })}
              hermanos={hermanosPendientes}
              onDelete={() => { deleteMutation.mutate(selected.id); setSelectedId(null); }}
              onClose={() => setSelectedId(null)}
              isUpdating={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Los conteos propios sin enviar, arriba del todo.
 *
 * Un conteo en curso no está en la bandeja de nadie más: si quien lo contó no
 * lo recuerda, se queda ahí para siempre y la diferencia nunca llega a
 * facturación. Por eso sale primero y solo a quien lo tiene que terminar.
 */
function MisPendientes({ inventarios, email, onAbrir, onVerTodos }) {
  const mios = email
    ? inventarios.filter((i) => i.estado_tarea === 'en_curso' && i.especialista_id === email)
    : [];
  if (mios.length === 0) return null;

  /*
   * Un aviso, no una segunda lista.
   *
   * Antes repetia aqui cada conteo con su producto, su fecha y su diferencia
   * —los mismos que estan en la tabla de abajo— y en un telefono eso era
   * media pantalla de duplicado antes de llegar al listado. Lo que hace
   * falta saber es que hay algo sin enviar y donde: si es uno, se abre; si
   * son varios, el filtro los deja a la vista.
   */
  const uno = mios.length === 1;

  return (
    <button
      type="button"
      onClick={() => (uno ? onAbrir(mios[0].id) : onVerTodos())}
      className="w-full flex items-center gap-3 px-3 py-2.5 sm:px-4 sm:py-3 rounded-xl border border-[var(--c-warn)]/30 bg-[var(--c-warn)]/5 text-left transition-transform active:scale-[0.995]"
      style={{ borderRadius: 'var(--r-card)' }}
    >
      <ClipboardList className="w-4 h-4 text-[var(--c-warn)] shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">
          Tienes {mios.length} {uno ? 'conteo sin enviar' : 'conteos sin enviar'}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          Nadie mas los ve hasta que los mandes a facturacion
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}


/** Ayer o hoy, en el formato que quiere <input type="date">. */
const aIso = (d) => d.toISOString().slice(0, 10);
export const HOY = () => aIso(new Date());
export const AYER = () => aIso(new Date(Date.now() - 86400000));

/**
 * Corregir un conteo que todavía es de inventario.
 *
 * Dos casos, el mismo formulario: el borrador propio sin enviar y el que
 * facturación o auditoría devolvieron. Antes solo se podía cambiar la
 * cantidad, y si lo que estaba mal era la clasificación o la fecha no había
 * forma de arreglarlo sin borrarlo y empezar de cero.
 */

function BloqueCorreccion({ inv, devuelto, isUpdating, onGuardar, confirmDialog }) {
  const [conteo, setConteo] = useState(String(inv.conteo_real ?? ''));
  const [clasif, setClasif] = useState(inv.clasif_ajuste ?? '');
  const [fecha, setFecha] = useState(inv.fecha_inv?.slice(0, 10) ?? HOY());
  const [notas, setNotas] = useState(inv.notas_inv ?? '');
  const [intercambio, setIntercambio] = useState(null);

  const n = Number(conteo);
  const conteoValido = conteo !== '' && !isNaN(n) && n >= 0;
  const diferencia = n - (inv.exist_fisica_tkc || 0);
  const resultado = diferencia === 0 ? 'ok' : diferencia > 0 ? 'sobrante' : 'faltante';
  // La clasificación solo hace falta si hay algo que clasificar.
  const faltaClasif = diferencia !== 0 && !clasif;
  // Un intercambio sin su par deja a facturación con dos ajustes que no
  // cuadran y sin saber que eran el mismo caso. Si ya venía emparejado, vale.
  const esIntercambio = diferencia !== 0 && clasif === CLASIF_INTERCAMBIO;
  const parYaPuesto = Boolean(inv.intercambio_id) && clasif === inv.clasif_ajuste;
  const faltaIntercambio = esIntercambio && !intercambio && !parYaPuesto;
  const valido = conteoValido && !faltaClasif && !faltaIntercambio;

  const cambios = {
    conteo_real: n,
    diferencia,
    resultado,
    clasif_ajuste: diferencia === 0 ? '' : clasif,
    fecha_inv: fecha,
    notas_inv: notas,
    ...(esIntercambio
      ? (intercambio ? { intercambio_id: intercambio.id } : {})
      : { intercambio_id: null }),
  };

  const enviar = async () => {
    const destino = diferencia === 0 ? 'completado' : 'pend_fact';
    const aviso = diferencia === 0
      ? 'No hay diferencia, así que el conteo se cierra aquí mismo.'
      : 'Facturación lo verá en su bandeja y dejarás de poder editarlo.';
    if (!await confirmDialog(aviso, { title: '¿Enviar este conteo?' })) return;
    onGuardar({ ...cambios, estado_tarea: destino });
  };

  const borde = devuelto ? 'border-[var(--c-bad)]/40 bg-[var(--c-bad)]/3' : 'border-border bg-secondary/40';

  return (
    <div className={`space-y-3 p-4 border rounded-lg ${borde}`} style={{ borderRadius: 'var(--r-ctl)' }}>
      <p className={`text-xs font-medium uppercase tracking-wider ${devuelto ? 'text-[var(--c-bad)]' : 'text-muted-foreground'}`}>
        {devuelto ? 'Devuelto — corrección requerida' : 'Sin enviar — puedes recontar'}
      </p>

      {devuelto && inv.nota_auditor && (
        <p className="text-xs text-muted-foreground"><span className="font-medium">Nota del auditor:</span> {inv.nota_auditor}</p>
      )}
      {devuelto && inv.fact_notas && (
        <p className="text-xs text-muted-foreground"><span className="font-medium">Nota de facturación:</span> {inv.fact_notas}</p>
      )}
      {!devuelto && (
        <p className="text-xs text-muted-foreground">
          Mientras no lo envíes, este conteo es tuyo y nadie más lo ve en su bandeja.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 text-xs text-muted-foreground">
          Conteo real
          <Input type="number" min="0" value={conteo} onChange={(e) => setConteo(e.target.value)} style={{ borderRadius: 'var(--r-ctl)' }} />
        </label>
        <label className="block space-y-1.5 text-xs text-muted-foreground">
          Fecha del conteo
          {/* Hoy o ayer: un conteo se hace en el día, y como mucho se registra
              a la mañana siguiente. */}
          <Input type="date" value={fecha} min={AYER()} max={HOY()}
            onChange={(e) => setFecha(e.target.value)} style={{ borderRadius: 'var(--r-ctl)' }} />
        </label>
      </div>

      {conteoValido && (
        <p className="text-xs text-muted-foreground">
          EF TKC del conteo: <span className="text-foreground">{inv.exist_fisica_tkc ?? 0}</span>
          {' · '}Diferencia: <span className="text-foreground font-medium">{diferencia > 0 ? '+' : ''}{diferencia}</span>
          {diferencia === 0 && ' — sin diferencia, al enviarlo queda completado.'}
        </p>
      )}

      {diferencia !== 0 && (
        <Select value={clasif} onValueChange={(v) => { setClasif(v); setIntercambio(null); }}>
          <SelectTrigger style={{ borderRadius: 'var(--r-ctl)' }}><SelectValue placeholder="Clasificación de ajuste" /></SelectTrigger>
          <SelectContent>{conValorActual(CLASIF_AJUSTE, inv.clasif_ajuste).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      )}

      {esIntercambio && (parYaPuesto ? (
        // Decir «ya emparejado» y no decir con qué obliga a cerrar el conteo
        // y abrir el otro para comprobarlo.
        <ParIntercambio id={inv.intercambio_id} />
      ) : (
        <SelectorIntercambio
          diferencia={diferencia}
          almacen={inv.almacen_num}
          excluirId={inv.id}
          valor={intercambio?.id}
          onElegir={setIntercambio}
        />
      ))}

      <Textarea value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)}
        placeholder="Notas del conteo…" style={{ borderRadius: 'var(--r-ctl)' }} />
      <SugerenciasNota valor={notas} onElegir={setNotas} />

      <div className="flex flex-wrap gap-2">
        {!devuelto && (
          <Button size="sm" variant="outline" disabled={!valido || isUpdating}
            onClick={() => onGuardar(cambios)} style={{ borderRadius: 'var(--r-ctl)' }}>
            {isUpdating ? 'Guardando…' : 'Guardar el nuevo conteo'}
          </Button>
        )}
        <Button size="sm" disabled={!valido || isUpdating} onClick={enviar} style={{ borderRadius: 'var(--r-ctl)' }}>
          {devuelto ? 'Reenviar conteo corregido' : 'Enviar a facturación'}
        </Button>
      </div>
      {faltaClasif && (
        <p className="text-xs text-[var(--c-warn)]">Hay diferencia: elige una clasificación antes de guardar.</p>
      )}
    </div>
  );
}

function InventarioDetail({ inv, role, user, onUpdate, onDelete, onClose, isUpdating: isUpdatingRaw, hermanos = [] }) {
  const isUpdating = isUpdatingRaw ?? false;
  const [factData, setFactData] = useState({
    fact_no_factura: '', fact_clasif: '', fact_notas: '',
    // Propuesto a partir del conteo; facturación puede cambiarlo.
    fact_estado: ESTADO_POR_RESULTADO[inv.resultado] ?? '',
  });
  const [auditorNota, setAuditorNota] = useState('');
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  const steps = ['INV', 'FACT', 'Auditor', 'Completado'];
  const stepMap = { en_curso: 0, pend_fact: 1, en_auditoria: 2, completado: 3, devuelto: 0 };
  const currentStep = stepMap[inv.estado_tarea] ?? 0;

  const canProcessFact = tieneRol(user, ['fact', 'administrador']) && inv.estado_tarea === 'pend_fact';
  const canAudit       = tieneRol(user, ['auditor', 'administrador']) && inv.estado_tarea === 'en_auditoria';
  const canDevuelto    = tieneRol(user, ['inv', 'administrador']) && inv.estado_tarea === 'devuelto';
  // Un conteo propio sin enviar se puede seguir tocando: es el caso de contar,
  // dudar y volver a contar antes de pasárselo a facturación.
  // Mientras no lo haya enviado es suyo y lo puede corregir entero. Antes
  // faltaba `superadmin` en la lista, así que a un superadministrador el
  // bloque no le salía y su propio conteo se quedaba congelado.
  const canEditarBorrador = inv.estado_tarea === 'en_curso'
    && (tieneRol(user, ['administrador', 'superadmin']) || inv.especialista_id === user?.email);
  const canDelete = puedeEliminarConteo(inv, user);

  // Mensaje contextual según estado + rol
  const statusHint = (() => {
    const e = inv.estado_tarea;
    if (e === 'completado') return { msg: 'Proceso completado y cerrado.', color: 'text-[var(--c-ok)]' };
    if (e === 'pend_fact'  && !tieneRol(user, ['fact','administrador','superadmin']))
      return { msg: 'Esperando revisión de FACTURACIÓN.', color: 'text-[var(--c-info-2)]' };
    if (e === 'en_auditoria' && !tieneRol(user, ['auditor','administrador','superadmin']))
      return { msg: 'En revisión por AUDITORÍA.', color: 'text-[var(--c-purple)]' };
    if (e === 'devuelto' && !tieneRol(user, ['inv','administrador','superadmin']))
      return { msg: 'Devuelto a INV para corrección.', color: 'text-[var(--c-bad)]' };
    return null;
  })();

  return (
    <>
    {ConfirmDialogNode}
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between pr-6">
        <DialogTitle className="text-sm font-semibold">Detalle de inventario</DialogTitle>
        {canDelete && (
          <Button
            variant="ghost" size="sm"
            className="text-[var(--c-bad)] hover:text-[var(--c-bad)] hover:bg-[var(--c-bad)]/10"
            onClick={async () => { if (await confirmDialog('Esta acción no se puede deshacer.', { title: '¿Eliminar este conteo?', destructive: true })) onDelete() }}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <Timeline steps={steps} currentStep={currentStep} />

      {statusHint && (
        <p className={`text-xs px-3 py-2 rounded-md bg-secondary/60 border border-border ${statusHint.color}`}>
          {statusHint.msg}
        </p>
      )}

      {/* Lo que la supervisión le dijo a quien lo abre sobre este conteo. */}
      <ComentariosDeSupervision tabla="inventarios" registroId={inv.id} usuario={user} />

      <ReadOnlyBlock title="Registro INV">
        <ReadOnlyField label="Fecha" value={inv.fecha_inv || '—'} />
        <ReadOnlyField label="Producto" value={inv.producto_nombre} />
        <ReadOnlyField label="Código" value={inv.producto_codigo} />
        <ReadOnlyField label="EF TKC" value={inv.exist_fisica_tkc} />
        <ReadOnlyField label="Conteo real" value={inv.conteo_real} />
        <ReadOnlyField label="Diferencia" value={inv.diferencia} />
        <ReadOnlyField label="Resultado" value={inv.resultado} />
        <ReadOnlyField label="Clasificación" value={inv.clasif_ajuste} />
        <ReadOnlyField label="Especialista" value={inv.especialista_nombre} />
        {inv.notas_inv && <ReadOnlyField label="Notas INV" value={inv.notas_inv} />}
      </ReadOnlyBlock>

      {/* Solo cuando ya no es de inventario: es quien procesa días después
          el que necesita saber de cuándo es el número. */}
      {inv.estado_tarea !== 'en_curso' && <ExistenciaAhora inv={inv} />}

      {inv.intercambio_id && <ParIntercambio id={inv.intercambio_id} />}

      {(inv.fact_no_factura || inv.fact_clasif || inv.fact_notas || inv.fact_estado || inv.fact_fecha) && (
        <ReadOnlyBlock title="Registro FACT">
          {inv.fact_fecha               && <ReadOnlyField label="Fecha"        value={inv.fact_fecha} />}
          {inv.fact_no_factura          && <ReadOnlyField label="No. factura"  value={inv.fact_no_factura} />}
          {inv.fact_clasif              && <ReadOnlyField label="Clasificación" value={inv.fact_clasif} />}
          {inv.fact_estado              && <ReadOnlyField label="Estado"        value={inv.fact_estado} />}
          {inv.fact_notas               && <ReadOnlyField label="Notas"         value={inv.fact_notas} />}
          {inv.fact_especialista_nombre && <ReadOnlyField label="Especialista"  value={inv.fact_especialista_nombre} />}
        </ReadOnlyBlock>
      )}

      {(inv.auditoria_fecha || inv.nota_auditor || inv.auditor_nombre) && (
        <ReadOnlyBlock title="Registro Auditor">
          {inv.auditoria_fecha && <ReadOnlyField label="Fecha"   value={inv.auditoria_fecha} />}
          {inv.auditor_nombre  && <ReadOnlyField label="Auditor" value={inv.auditor_nombre} />}
          {inv.nota_auditor    && <ReadOnlyField label="Nota"    value={inv.nota_auditor} />}
        </ReadOnlyBlock>
      )}

      {/* Corrección del conteo: el borrador propio y el devuelto */}
      {(canEditarBorrador || canDevuelto) && (
        <BloqueCorreccion
          inv={inv}
          devuelto={inv.estado_tarea === 'devuelto'}
          isUpdating={isUpdating}
          onGuardar={onUpdate}
          confirmDialog={confirmDialog}
        />
      )}

      {/* FACT form */}
      {canProcessFact && (
        <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: 'var(--r-ctl)', borderWidth: '0.5px' }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Procesamiento FACT</p>
          {hermanos.length > 0 && (
            <AlertBanner variant="warning"
              message={`Hay ${hermanos.length} ${hermanos.length === 1 ? 'conteo anterior' : 'conteos anteriores'} de este producto esperando a facturación. Al procesar este, aquellos se cierran sin ajuste y se avisa a quien los hizo: su diferencia se midió contra otra existencia.`} />
          )}
          <Input placeholder="No. factura TKC" value={factData.fact_no_factura} onChange={(e) => setFactData({ ...factData, fact_no_factura: e.target.value })} style={{ borderRadius: 'var(--r-ctl)' }} />
          <Select value={factData.fact_clasif} onValueChange={(v) => setFactData({ ...factData, fact_clasif: v })}>
            <SelectTrigger style={{ borderRadius: 'var(--r-ctl)' }}><SelectValue placeholder="Clasificación FACT" /></SelectTrigger>
            <SelectContent>{conValorActual(CLASIF_FACT, inv.fact_clasif).map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={factData.fact_estado} onValueChange={(v) => setFactData({ ...factData, fact_estado: v })}>
            <SelectTrigger style={{ borderRadius: 'var(--r-ctl)' }}><SelectValue placeholder="Estado FACT" /></SelectTrigger>
            <SelectContent>{ESTADO_FACT.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
          </Select>
          {estadoContradictorio(inv.resultado, factData.fact_estado) && (
            <p className="text-xs text-[var(--c-warn)] bg-[var(--c-warn)]/10 px-3 py-2 rounded-md">
              El conteo dio un <strong>{inv.resultado}</strong> de {Math.abs(inv.diferencia ?? 0)} y
              estás aplicando «{factData.fact_estado}», que va en sentido contrario. No se puede
              enviar así: elige el estado que corresponde o devuélvelo a inventario.
            </p>
          )}
          {factData.fact_estado === 'Procesamiento' && (
            <p className="text-xs text-muted-foreground bg-secondary/60 px-3 py-2 rounded-md">
              Anota en las notas <strong>con qué producto se intercambió y su precio</strong>: el
              registro guarda un solo producto, así que esa información solo queda aquí.
            </p>
          )}
          <Textarea placeholder="Notas FACT" value={factData.fact_notas} onChange={(e) => setFactData({ ...factData, fact_notas: e.target.value })} style={{ borderRadius: 'var(--r-ctl)' }} />
          <div className="flex gap-2">
            <Button size="sm" disabled={isUpdating || estadoContradictorio(inv.resultado, factData.fact_estado)} onClick={async () => {
              // Los conteos anteriores del mismo producto que siguen esperando
              // a facturación ya no valen: su diferencia se midió contra una
              // existencia de otro día. Aplicarles un ajuste además de este
              // sería mover dos veces la misma mercancía, y dejarlos ahí es
              // dejar datos falseados en la bandeja de alguien.
              if (hermanos.length > 0) {
                const ok = await confirmDialog(
                  `Hay ${hermanos.length} ${hermanos.length === 1 ? 'conteo anterior' : 'conteos anteriores'} ` +
                  'del mismo producto esperando a facturación. Se cerrarán sin ajuste, porque su diferencia ' +
                  'se midió contra otra existencia, y se avisará a quien los hizo.',
                  { title: '¿Procesar este conteo?' },
                );
                if (!ok) return;
              }
              onUpdate({
                ...factData,
                fact_especialista_id: user?.email,
                fact_especialista_nombre: user?.full_name,
                fact_fecha: new Date().toISOString().slice(0, 10),
                estado_tarea: 'en_auditoria',
              }, hermanos);
            }} style={{ borderRadius: 'var(--r-ctl)' }}>
              {isUpdating ? 'Enviando...' : 'Enviar a auditor'}
            </Button>
            <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => onUpdate({ estado_tarea: 'devuelto' })} style={{ borderRadius: 'var(--r-ctl)' }}>
              Devolver a INV
            </Button>
          </div>
        </div>
      )}

      {/* Auditor form */}
      {canAudit && (
        <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: 'var(--r-ctl)', borderWidth: '0.5px' }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Auditoría</p>
          <Textarea placeholder="Nota del auditor" value={auditorNota} onChange={(e) => setAuditorNota(e.target.value)} style={{ borderRadius: 'var(--r-ctl)' }} />
          <div className="flex gap-2">
            <Button size="sm" disabled={isUpdating} onClick={async () => {
              if (!await confirmDialog('Se completará el proceso y no podrá revertirse.', { title: '¿Aprobar y completar este inventario?' })) return;
              onUpdate({ nota_auditor: auditorNota, auditor_id: user?.email, auditor_nombre: user?.full_name, auditoria_fecha: new Date().toISOString().slice(0, 10), estado_tarea: 'completado' });
            }} style={{ borderRadius: 'var(--r-ctl)' }}>{isUpdating ? 'Guardando...' : 'Aprobar y completar'}</Button>
            {/* Dos destinos: no siempre el problema es del conteo. Si lo que
                está mal es la factura o la clasificación contable, devolverlo
                a quien contó no arregla nada y hace perder un viaje. */}
            <Button size="sm" variant="outline" disabled={isUpdating}
              onClick={() => onUpdate({ nota_auditor: auditorNota, auditoria_fecha: new Date().toISOString().slice(0, 10), estado_tarea: 'devuelto' })}
              style={{ borderRadius: 'var(--r-ctl)' }}>
              Devolver a inventario
            </Button>
            <Button size="sm" variant="outline" disabled={isUpdating}
              onClick={() => onUpdate({ nota_auditor: auditorNota, auditoria_fecha: new Date().toISOString().slice(0, 10), estado_tarea: 'pend_fact' })}
              style={{ borderRadius: 'var(--r-ctl)' }}>
              Devolver a facturación
            </Button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}


/**
 * La otra mitad de un intercambio.
 *
 * Son un solo hecho contado dos veces, así que desde cualquiera de los dos
 * conteos hay que poder ver el otro: sus cantidades tienen que ser opuestas
 * y, si no lo son, algo se emparejó mal y conviene que se note.
 */
function ParIntercambio({ id }) {
  const { data: par, isLoading } = useQuery({
    queryKey: ['intercambio-par', id],
    queryFn: async () => (await base44.entities.Inventario.filter({ id }, null, 1))[0] ?? null,
    enabled: Boolean(id),
  });

  if (isLoading) return null;

  if (!par) {
    return (
      <AlertBanner variant="warning"
        message="Este conteo estaba emparejado con otro que ya no existe." />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-1"
      style={{ borderRadius: 'var(--r-ctl)' }}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Intercambiado con
      </p>
      <p className="text-sm">{par.producto_nombre || '—'}</p>
      <p className="text-xs text-muted-foreground font-mono">{par.producto_codigo}</p>
      <p className="text-xs text-muted-foreground">
        Diferencia{' '}
        <span className={`font-medium ${(par.diferencia ?? 0) > 0 ? 'text-[var(--c-warn)]' : 'text-[var(--c-bad)]'}`}>
          {(par.diferencia ?? 0) > 0 ? '+' : ''}{par.diferencia}
        </span>
        {' · '}{par.fecha_inv?.slice(0, 10)}
      </p>
    </div>
  );
}
