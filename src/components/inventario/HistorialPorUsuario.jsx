import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ListFilter, Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import BloqueMetricas from '@/components/shared/BloqueMetricas';
import CabeceraLista from '@/components/shared/CabeceraLista';
import ListaResponsive from '@/components/shared/ListaResponsive';
import Pagination from '@/components/shared/Pagination';
import { FiltroIcono } from '@/components/shared/ControlesLista';
import { celdaConteo } from '@/components/inventario/celdasConteo';
import { useTablaPaginada } from '@/lib/useTablaPaginada';
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';
import { WAREHOUSES } from '@/services/tkc/warehouses';
import { condicionesDeHistorial } from '@/lib/historialConteos';

const PAGE_SIZE = 50;
const SELECT_CLS = 'h-9 bg-card border border-border rounded-lg px-2.5 text-xs text-foreground';

const COLUMNAS = ['fecha', 'producto', 'almacen', 'ef_tkc', 'conteo', 'diferencia', 'clasificacion', 'estado'];
const TITULOS = {
  fecha:         { label: 'Fecha' },
  producto:      { label: 'Producto' },
  almacen:       { label: 'Almacén', className: 'hidden md:table-cell' },
  ef_tkc:        { label: 'EF TKC', align: 'right', className: 'hidden sm:table-cell' },
  conteo:        { label: 'Conteo', align: 'right', className: 'hidden sm:table-cell' },
  diferencia:    { label: 'Diferencia', align: 'right' },
  clasificacion: { label: 'Clasificación', className: 'hidden lg:table-cell' },
  estado:        { label: 'Estado', align: 'center' },
};
const ESTADOS = [
  { valor: 'all', label: 'Todos los estados' },
  { valor: 'en_curso', label: 'En curso' },
  { valor: 'pend_fact', label: 'Pend. FACT' },
  { valor: 'en_auditoria', label: 'En auditoría' },
  { valor: 'completado', label: 'Completado' },
  { valor: 'devuelto', label: 'Devuelto' },
];

const difColor = (d) => (d === 0 ? 'text-[var(--c-ok-dim)]' : d > 0 ? 'text-[var(--c-warn)]' : 'text-[var(--c-bad)]');

/**
 * Todos los conteos que ha hecho una persona, en cualquier estado.
 *
 * En Inventario es el historial PROPIO de cada quien (`vistaGlobal` falso). Elegir
 * de quién es de quien supervisa, y vive en Supervisión.
 *
 * La lista de Inventario enseña lo que está en manos de inventario —lo que
 * falta por enviar o corregir—; esto es lo que quedó hecho: qué contó, dónde,
 * con qué diferencia y en qué punto está cada conteo. Con fechas, almacén y
 * estado, y un resumen que cuenta la base entera y no solo la página.
 *
 * Un inventarista ve los suyos. Quien sigue el trabajo de los demás —jefe de
 * departamento, facturación, auditoría, administradores— elige de quién.
 *
 * @param {object} props
 * @param {object} props.user
 * @param {boolean} props.vistaGlobal  Puede mirar a otras personas.
 * @param {React.ReactNode} props.pestanas
 */
export default function HistorialPorUsuario({ user, vistaGlobal, pestanas, embebido = false }) {
  const { almacenesConfig } = useAlmacen();
  const [email, setEmail] = useState('');
  const [almacen, setAlmacen] = useState('');
  const [estado, setEstado] = useState('all');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [buscar, setBuscar] = useState('');
  const [page, setPage] = useState(1);

  // Hasta que se elija otra persona, la sesión: es a quien casi siempre se mira.
  const persona = vistaGlobal ? (email || user?.email || '') : (user?.email || '');
  const cambiar = (fn) => (v) => { fn(v); setPage(1); };

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-activos'],
    queryFn: () => base44.entities.Usuario.filter({ activo: true }, 'full_name', 500),
    enabled: vistaGlobal,
    staleTime: 10 * 60 * 1000,
    select: (d) => (Array.isArray(d) ? d : []),
  });
  const gente = useMemo(() => {
    const porCorreo = new Map(usuarios.filter((u) => u.email).map((u) => [u.email, u]));
    // Quien mira siempre está en la lista, aunque su ficha no venga.
    if (user?.email && !porCorreo.has(user.email)) porCorreo.set(user.email, user);
    return [...porCorreo.values()].sort((a, b) => String(a.full_name ?? a.email).localeCompare(String(b.full_name ?? b.email), 'es'));
  }, [usuarios, user]);
  const nombre = gente.find((u) => u.email === persona)?.full_name || persona;

  const condiciones = useMemo(
    () => condicionesDeHistorial({ persona, almacen, estado, desde, hasta }),
    [persona, almacen, estado, desde, hasta],
  );

  const { filas, total, cargando } = useTablaPaginada({
    entidad: 'Inventario',
    clave: ['inventarios-historial', condiciones],
    condiciones,
    texto: buscar,
    campos: ['producto_nombre', 'producto_codigo'],
    orden: '-fecha_inv',
    pagina: page,
    porPagina: PAGE_SIZE,
    activa: Boolean(persona),
  });

  // El resumen cuenta la base, no la página: con cincuenta filas a la vista,
  // «cuántos faltantes» tiene que seguir siendo verdad.
  const { data: resumen } = useQuery({
    queryKey: ['inventarios-historial-resumen', condiciones],
    queryFn: async () => {
      const [sobrantes, faltantes, sinDiferencia] = await Promise.all(
        ['sobrante', 'faltante', 'ok'].map((resultado) => base44.entities.Inventario.count({ ...condiciones, resultado })),
      );
      return { sobrantes, faltantes, sinDiferencia };
    },
    enabled: Boolean(persona),
    staleTime: 30 * 1000,
  });

  const almacenes = useMemo(
    () => WAREHOUSES.filter((w) => filterAlmacenesByConfig([w.key], almacenesConfig).length > 0),
    [almacenesConfig],
  );

  return (
    <div className="space-y-6">
      <CabeceraLista
        titulo={embebido ? undefined : 'Inventario'}
        subtitulo={!vistaGlobal ? 'Tus conteos hechos' : persona ? `Conteos hechos por ${nombre}` : 'Elige una persona'}
        pestanas={pestanas}
        recuento={`${total} ${total === 1 ? 'conteo' : 'conteos'}`}
        buscador={(
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={buscar} onChange={(e) => cambiar(setBuscar)(e.target.value)}
              placeholder="Buscar por producto o código…" className="pl-10" style={{ borderRadius: 'var(--r-ctl)' }} />
          </div>
        )}
        filtros={(
          <>
            {vistaGlobal && (
              <select value={persona} onChange={(e) => cambiar(setEmail)(e.target.value)}
                className={`${SELECT_CLS} max-w-[200px]`} aria-label="Persona" style={{ borderRadius: 'var(--r-ctl)' }}>
                {gente.map((u) => <option key={u.email} value={u.email}>{u.full_name || u.email}</option>)}
              </select>
            )}
            <select value={almacen} onChange={(e) => cambiar(setAlmacen)(e.target.value)}
              className={SELECT_CLS} aria-label="Almacén" style={{ borderRadius: 'var(--r-ctl)' }}>
              <option value="">Todos los almacenes</option>
              {almacenes.map((w) => <option key={w.key} value={w.key}>{w.nombre}</option>)}
            </select>
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

      <BloqueMetricas columnas="sm:grid-cols-4" visibles={4} metricas={[
        { clave: 'total', titulo: 'Conteos', valor: total, color: 'var(--c-info)' },
        { clave: 'sinDif', titulo: 'Sin diferencia', valor: resumen?.sinDiferencia, color: 'var(--c-ok)' },
        { clave: 'sobrantes', titulo: 'Sobrantes', valor: resumen?.sobrantes, color: 'var(--c-warn)' },
        { clave: 'faltantes', titulo: 'Faltantes', valor: resumen?.faltantes, color: 'var(--c-bad)' },
      ]} />

      <ListaResponsive
        columnas={COLUMNAS}
        titulos={TITULOS}
        filas={filas}
        cargando={cargando}
        vacio={vistaGlobal ? 'Esta persona no tiene conteos con estos filtros.' : 'No tienes conteos con estos filtros.'}
        claveDe={(inv) => inv.id}
        encabezado="producto"
        celda={(inv, k, enTabla) => celdaConteo(inv, k, enTabla, difColor, () => null)}
      />

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}
