import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ListFilter, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import StatusBadge from '@/components/shared/StatusBadge';
import CabeceraLista from '@/components/shared/CabeceraLista';
import ListaResponsive from '@/components/shared/ListaResponsive';
import Pagination from '@/components/shared/Pagination';
import { FiltroIcono, SelectorAlmacen } from '@/components/shared/ControlesLista';
import { useAlmacen } from '@/lib/useAlmacen';
import { useTablaPaginada } from '@/lib/useTablaPaginada';

/**
 * Todas las mermas de un almacén, en cualquier estado: lo ya completado también.
 *
 * La lista de Mermas es la bandeja de trabajo —lo que está en manos de inventario—;
 * esto es lo que quedó hecho, por almacén, con fechas, estado y búsqueda.
 *
 * Cada quien ve lo suyo: el servidor entrega a un inventarista solo las mermas que
 * registró y solo de sus almacenes. Quien supervisa o factura (jefes, facturación,
 * auditoría, administración) ve las de todos, y entonces sale la columna de quién
 * la registró.
 */

const PAGE_SIZE = 50;

const ESTADOS = [
  { valor: 'all', label: 'Todos los estados' },
  { valor: 'en_curso', label: 'En curso' },
  { valor: 'pend_fact', label: 'Pend. FACT' },
  { valor: 'en_auditoria', label: 'En auditoría' },
  { valor: 'completado', label: 'Completado' },
  { valor: 'devuelto', label: 'Devuelto' },
  { valor: 'reconteo_solicitado', label: 'Reconteo' },
];

const TITULOS = {
  producto:      { label: 'Producto' },
  fecha:         { label: 'Fecha' },
  cantidad:      { label: 'Cantidad', align: 'right' },
  clasificacion: { label: 'Clasificación' },
  perdida:       { label: 'Pérdida', align: 'right' },
  especialista:  { label: 'Registró' },
  estado:        { label: 'Estado', align: 'center' },
};

const dinero = (n) => `$${Number(n ?? 0).toFixed(2)}`;
const dia = (f) => (f ? format(new Date(`${String(f).slice(0, 10)}T00:00:00`), 'dd/MM/yy') : '—');

/** @param {{ user: object, vistaGlobal: boolean, pestanas?: React.ReactNode }} props */
export default function HistorialMermas({ user, vistaGlobal, pestanas }) {
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const [estado, setEstado] = useState('all');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [buscar, setBuscar] = useState('');
  const [page, setPage] = useState(1);
  const cambiar = (fn) => (v) => { fn(v); setPage(1); };

  const condiciones = useMemo(() => {
    const c = { almacen_num: almacen };
    if (estado !== 'all') c.estado_tarea = estado;
    if (desde || hasta) c.fecha_inv = { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) };
    // Sin ver a los demás, solo lo propio (el servidor lo impone igual).
    if (!vistaGlobal && user?.email) c.especialista_id = user.email;
    return c;
  }, [almacen, estado, desde, hasta, vistaGlobal, user?.email]);

  const { filas, total, cargando } = useTablaPaginada({
    entidad: 'Merma',
    clave: ['mermas-historial', condiciones],
    condiciones,
    texto: buscar,
    campos: ['producto_nombre', 'producto_codigo'],
    orden: '-fecha_inv',
    pagina: page,
    porPagina: PAGE_SIZE,
    activa: Boolean(almacen),
  });

  const columnas = vistaGlobal
    ? ['fecha', 'producto', 'cantidad', 'clasificacion', 'perdida', 'especialista', 'estado']
    : ['fecha', 'producto', 'cantidad', 'clasificacion', 'perdida', 'estado'];

  const celda = (m, k, enTabla) => {
    const env = (hijo, extra = '') => (enTabla ? <td key={k} className={`px-2.5 py-1.5 ${extra}`}>{hijo}</td> : hijo);
    switch (k) {
      case 'fecha': return env(<span className="text-xs tabular-nums">{dia(m.fecha_inv || m.created_date)}</span>);
      case 'producto':
        return env(
          <div className="min-w-0">
            <p className="font-medium line-clamp-2">{m.producto_nombre || '—'}</p>
            <p className="text-[11px] font-mono text-muted-foreground">{m.producto_codigo}</p>
          </div>,
        );
      case 'cantidad': return env(<span className="tabular-nums">{m.cantidad}</span>, 'text-right');
      case 'clasificacion': return env(<span className="text-xs text-muted-foreground">{m.clasif_merma || '—'}</span>);
      case 'perdida': return env(<span className="text-xs tabular-nums">{dinero(m.total_perdida)}</span>, 'text-right');
      case 'especialista': return env(<span className="text-xs text-muted-foreground">{m.especialista_nombre || '—'}</span>);
      case 'estado': return env(<StatusBadge status={m.estado_tarea} />, 'text-center');
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <CabeceraLista
        titulo="Mermas"
        subtitulo={vistaGlobal ? 'Historial de mermas del almacén' : 'Tu historial de mermas del almacén'}
        pestanas={pestanas}
        recuento={almacen ? `${total} ${total === 1 ? 'merma' : 'mermas'}` : null}
        buscador={(
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={buscar} onChange={(e) => cambiar(setBuscar)(e.target.value)}
              placeholder="Buscar por producto o código…" className="pl-10" style={{ borderRadius: 'var(--r-ctl)' }} />
          </div>
        )}
        filtros={(
          <>
            <SelectorAlmacen almacen={almacen} setAlmacen={cambiar(setAlmacen)} almacenesConfig={almacenesConfig} />
            <FiltroIcono icono={ListFilter} etiqueta="Estado" valor={estado} porDefecto="all"
              onChange={cambiar(setEstado)} opciones={ESTADOS} />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Desde
              <Input type="date" value={desde} max={hasta || undefined} onChange={(e) => cambiar(setDesde)(e.target.value)}
                className="h-9 w-[140px]" style={{ borderRadius: 'var(--r-ctl)' }} />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Hasta
              <Input type="date" value={hasta} min={desde || undefined} onChange={(e) => cambiar(setHasta)(e.target.value)}
                className="h-9 w-[140px]" style={{ borderRadius: 'var(--r-ctl)' }} />
            </label>
          </>
        )}
      />

      {!almacen ? (
        <p className="text-sm text-muted-foreground text-center py-10">Elige un almacén para ver su historial.</p>
      ) : (
        <>
          <ListaResponsive
            columnas={columnas}
            titulos={TITULOS}
            filas={filas}
            cargando={cargando}
            vacio="Ninguna merma con estos filtros."
            claveDe={(m) => m.id}
            encabezado="producto"
            celda={celda}
          />
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
