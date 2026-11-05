import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Boxes, Factory, Loader2, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CabeceraLista from '@/components/shared/CabeceraLista';
import ListaResponsive from '@/components/shared/ListaResponsive';
import MultiSelect from '@/components/shared/MultiSelect';
import Pagination from '@/components/shared/Pagination';
import { FiltroIcono, SelectorAlmacen } from '@/components/shared/ControlesLista';
import { useAlmacen } from '@/lib/useAlmacen';
import { SIN_SONDEO } from '@/lib/query-client';
import { fetchCatalogo } from '@/services/catalogoService';

/**
 * Qué contar hoy: los productos del almacén y del suministrador elegidos, en el
 * orden de trabajo que ya define el estado de la tienda.
 *
 * La prioridad (`productos.prioridad_tienda`, generada en la base) pone primero
 * lo más urgente: 1 es «sin reserva», lo que vende en tienda sin tener nada que
 * reponer, y 99 lo que no tiene datos. Aquí no se calcula nada: se ordena por
 * ella y se enseña de qué estado sale.
 *
 * Un producto contado hoy sale marcado y sin botón: contarlo dos veces manda dos
 * ajustes por la misma diferencia (ver `InventarioForm`).
 *
 * @param {object} props
 * @param {object} props.user
 * @param {React.ReactNode} props.pestanas   Las pestañas de la página, bajo el título.
 * @param {(producto: object) => void} [props.onContar]  Abre el formulario de conteo con ese producto. Sin él (quien no cuenta), la lista es solo de consulta.
 */

const PAGE_SIZE = 50;
const hoy = () => format(new Date(), 'yyyy-MM-dd');

const TITULOS = {
  producto:      { label: 'Producto' },
  prioridad:     { label: 'Prioridad' },
  suministrador: { label: 'Suministrador' },
  existencia:    { label: 'EF · A · T', align: 'right' },
  accion:        { label: '', align: 'right' },
};
const COLUMNAS = ['prioridad', 'producto', 'suministrador', 'existencia', 'accion'];

/** 1–3 urge, 4–6 conviene, el resto puede esperar. */
const colorDe = (p) => (p == null ? 'text-muted-foreground' : p <= 3 ? 'text-[var(--c-bad)]' : p <= 6 ? 'text-[var(--c-warn)]' : 'text-muted-foreground');

export default function PorContar({ pestanas, onContar }) {
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const [suministradores, setSuministradores] = useState([]);
  const [existencia, setExistencia] = useState('all');
  const [busqueda, setBusqueda] = useState('');
  const [texto, setTexto] = useState('');
  const [page, setPage] = useState(1);
  const [abriendo, setAbriendo] = useState(null);   // id del producto que se está abriendo

  // El buscador no pregunta en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setTexto(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Otro almacén tiene otros suministradores: lo marcado ya no vale.
  useEffect(() => { setSuministradores([]); }, [almacen]);
  // Cualquier filtro vuelve a la primera página.
  const firma = `${almacen}|${suministradores.join('|')}|${existencia}|${texto}`;
  useEffect(() => { setPage(1); }, [firma]);

  const { data: opciones = [] } = useQuery({
    queryKey: ['por-contar-suministradores', almacen],
    queryFn: () => base44.entities.Producto.distinct('suministrador', { activo: true, almacen_num: almacen }),
    enabled: Boolean(almacen),
    staleTime: 5 * 60 * 1000,
    select: (d) => (Array.isArray(d) ? d.filter(Boolean) : []),
    ...SIN_SONDEO,
  });

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['por-contar', almacen, suministradores.join('|'), existencia, texto, page],
    queryFn: () => fetchCatalogo({
      almacen, page, limit: PAGE_SIZE, search: texto,
      sortBy: 'prioridad', sortDir: 'asc',
      filtros: { existencia, suministrador: suministradores },
    }),
    enabled: Boolean(almacen),
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
    ...SIN_SONDEO,
  });
  const filas = data?.rows ?? [];
  const total = data?.pagination?.total ?? 0;

  // Lo ya contado hoy en este almacén.
  const fecha = hoy();
  const { data: contados } = useQuery({
    queryKey: ['por-contar-hoy', almacen, fecha],
    queryFn: () => base44.entities.Inventario.filter({ almacen_num: almacen, fecha_inv: fecha }, '-created_date', 1000),
    enabled: Boolean(almacen),
    staleTime: 30 * 1000,
    select: (d) => new Set((Array.isArray(d) ? d : []).map((i) => i.producto_id)),
    ...SIN_SONDEO,
  });
  const yaContado = (f) => contados?.has(f.id) ?? false;

  const contar = async (fila) => {
    setAbriendo(fila.id);
    try {
      // El formulario trabaja con la fila entera de `productos`, no con la de la tabla.
      const [producto] = await base44.entities.Producto.filter({ id: fila.id }, 'nombre', 1);
      if (producto) onContar?.(producto);
    } finally {
      setAbriendo(null);
    }
  };

  const celda = useMemo(() => (f, k, enTabla) => {
    const envolver = (hijo, extra = '') => (enTabla ? <td key={k} className={`px-2.5 py-1.5 ${extra}`}>{hijo}</td> : hijo);
    switch (k) {
      case 'prioridad':
        return envolver(
          <span className={`text-xs font-medium ${colorDe(f.prioridad)}`}>
            {f.prioridad ?? '—'} · {f.estadoTienda || 'SIN DATOS'}
          </span>,
        );
      case 'producto':
        return envolver(
          <div className="min-w-0">
            <p className="font-medium line-clamp-2">{f.nombre || '—'}</p>
            <p className="text-[11px] font-mono text-muted-foreground">{f.codigo}</p>
          </div>,
        );
      case 'suministrador':
        return envolver(<span className="text-xs text-muted-foreground">{f.suministrador || '—'}</span>);
      case 'existencia':
        return envolver(
          <span className="text-xs tabular-nums">{f.ef} · {f.enAlmacen} · {f.enTienda}</span>,
          'text-right',
        );
      case 'accion':
        if (!onContar) return envolver(yaContado(f) ? <span className="text-xs text-[var(--c-ok-dim)]">Contado hoy</span> : null, 'text-right');
        return envolver(
          yaContado(f)
            ? <span className="text-xs text-[var(--c-ok-dim)]">Contado hoy</span>
            : (
              <Button size="sm" disabled={abriendo === f.id} onClick={(e) => { e.stopPropagation(); contar(f); }}
                style={{ borderRadius: 'var(--r-ctl)' }}>
                {abriendo === f.id && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Contar
              </Button>
            ),
          'text-right',
        );
      default:
        return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contados, abriendo]);

  const sinAlmacen = !almacen;

  return (
    <div className="space-y-6">
      <CabeceraLista
        titulo="Inventario"
        subtitulo="Qué contar, por prioridad de tienda"
        pestanas={pestanas}
        recuento={almacen ? `${total} ${total === 1 ? 'producto' : 'productos'}${isFetching ? ' …' : ''}` : null}
        buscador={(
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código…" className="pl-10" style={{ borderRadius: 'var(--r-ctl)' }} />
          </div>
        )}
        filtros={(
          <>
            <SelectorAlmacen almacen={almacen} setAlmacen={setAlmacen} almacenesConfig={almacenesConfig} />
            <MultiSelect
              icono={Factory}
              value={suministradores}
              onChange={setSuministradores}
              placeholder="Suministrador: todos"
              etiquetaVarios={(n) => `${n} suministradores`}
              // Nombre exacto: «SEL PUCARA» y «PUCARA» son suministradores distintos.
              options={[...opciones].sort((a, b) => a.localeCompare(b)).map((s) => ({ value: s, label: s }))}
            />
            <FiltroIcono
              icono={Boxes}
              etiqueta="Existencia"
              valor={existencia}
              porDefecto="all"
              onChange={setExistencia}
              opciones={[
                { valor: 'all', label: 'Con y sin existencia' },
                { valor: 'existencia', label: 'Con existencia' },
                { valor: 'no-existencia', label: 'Sin existencia' },
              ]}
            />
          </>
        )}
      />

      {sinAlmacen ? (
        <p className="text-sm text-muted-foreground text-center py-10">Elige un almacén para ver qué contar.</p>
      ) : isError ? (
        <p className="text-sm text-[var(--c-bad)] text-center py-10">No se pudo cargar la lista. Inténtalo de nuevo.</p>
      ) : (
        <>
          <ListaResponsive
            columnas={COLUMNAS}
            titulos={TITULOS}
            filas={filas}
            cargando={isLoading}
            vacio="Ningún producto con estos filtros."
            claveDe={(f) => f.id}
            encabezado="producto"
            accion="accion"
            celda={celda}
          />
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
