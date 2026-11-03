import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KPICard from '@/components/shared/KPICard';
import AlertBanner from '@/components/shared/AlertBanner';
import CabeceraLista from '@/components/shared/CabeceraLista';
import ListaResponsive from '@/components/shared/ListaResponsive';
import Pagination from '@/components/shared/Pagination';
import { SelectorAlmacen } from '@/components/shared/ControlesLista';
import DialogosConteo, { CeldaAcciones } from '@/components/inventario/AccionesConteo';
import { Boxes, DollarSign, Download, Receipt, Search, TrendingUp } from 'lucide-react';
import { useAlmacen } from '@/lib/useAlmacen';
import { SIN_SONDEO } from '@/lib/query-client';
import { warehouseName } from '@/services/tkc/warehouses';
import { fetchResumenVentas } from '@/services/ventasService';
import { diasDelRango, margen, rangoPorDefecto, ventasACsv } from '@/lib/ventas';

/**
 * Resumen de ventas por período.
 *
 * Las cantidades que vendió la plataforma entre dos fechas, en un almacén, por
 * producto y por día. Es lo primero que pidió Facturación para conciliar:
 * saber cuánto salió en un período antes de compararlo con lo que hay.
 *
 * Es el informe de ventas de la plataforma (RDP). Los despachos de la flota y
 * las ventas directas son otra cosa y no están aquí hasta que Facturación
 * diga qué cuenta como despacho.
 */

const PAGE_SIZE = 50;
// Lo que hay antes de que lleguen los datos. Una sola vez, fuera del componente.
const VACIO = { total: null, productos: [], dias: [], cobertura: null, recortado: false };
const numero = new Intl.NumberFormat('es-CU');
const dinero = new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'USD' });

const COLUMNAS_PRODUCTO = ['producto', 'cantidad', 'ordenes', 'importe', 'costo', 'acciones'];
const COLUMNAS_DIA = ['fecha', 'cantidad', 'ordenes', 'importe', 'costo'];
const TITULOS = {
  producto: { label: 'Producto' },
  acciones: { label: 'Acciones' },
  fecha: { label: 'Día' },
  cantidad: { label: 'Unidades', align: 'right' },
  ordenes: { label: 'Órdenes', align: 'right', className: 'hidden sm:table-cell' },
  importe: { label: 'Importe', align: 'right' },
  costo: { label: 'Costo', align: 'right', className: 'hidden md:table-cell' },
};

export default function ResumenVentas() {
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const inicial = useMemo(() => rangoPorDefecto(), []);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [vista, setVista] = useState('productos');
  const [buscar, setBuscar] = useState('');
  const [page, setPage] = useState(1);
  const [accion, setAccion] = useState(null);   // { tipo, inv } del menú ⋯ de un producto

  const dias = diasDelRango(desde, hasta);
  const rangoValido = dias !== null && dias <= 366;

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['ventas-resumen', almacen, desde, hasta],
    queryFn: () => fetchResumenVentas({ almacen, desde, hasta }),
    enabled: Boolean(almacen) && rangoValido,
    retry: false,
    ...SIN_SONDEO,
  });

  // Cambiar lo que se mira devuelve a la primera página.
  useEffect(() => { setPage(1); }, [almacen, desde, hasta, vista, buscar]);

  // Sin `data?.x` dentro del componente: el compilador de React no compila
  // bien un acceso opcional cuando `data` aún no ha llegado, y rompía la
  // pantalla en el primer render. Se desestructura de una vez.
  const { total, productos: todosProductos, dias: filasDia, cobertura: cob, recortado } = data ?? VACIO;
  const productos = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q
      ? todosProductos.filter((p) => `${p.codigo} ${p.nombre}`.toLowerCase().includes(q))
      : todosProductos;
  }, [todosProductos, buscar]);

  const filas = vista === 'productos' ? productos : filasDia;
  const pagina = filas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportar = () => {
    const csv = ventasACsv(todosProductos);
    // BOM al principio: sin él Excel abre el CSV en latin-1 y parte los acentos.
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas_${almacen}_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <CabeceraLista
        titulo="Resumen de ventas"
        subtitulo={almacen ? `Ventas de la plataforma en ${warehouseName(almacen)}` : 'Lo que vendió la plataforma en un período'}
        recuento={data ? `${numero.format(filas.length)} ${vista === 'productos' ? 'productos' : 'días'}` : ''}
        buscador={vista === 'productos' ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={buscar} onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar por producto o código..." className="pl-10" style={{ borderRadius: 'var(--r-ctl)' }} />
          </div>
        ) : null}
        filtros={(
          <>
            <SelectorAlmacen almacen={almacen} setAlmacen={setAlmacen} almacenesConfig={almacenesConfig} />
            <Input type="date" value={desde} max={hasta} aria-label="Desde"
              onChange={(e) => setDesde(e.target.value)} className="w-[150px]" style={{ borderRadius: 'var(--r-ctl)' }} />
            <Input type="date" value={hasta} min={desde} aria-label="Hasta"
              onChange={(e) => setHasta(e.target.value)} className="w-[150px]" style={{ borderRadius: 'var(--r-ctl)' }} />
            <Button variant="outline" onClick={exportar} disabled={todosProductos.length === 0}
              style={{ borderRadius: 'var(--r-ctl)' }} title="Exportar a CSV las ventas por producto">
              <Download className="w-4 h-4 lg:mr-1.5" />
              <span className="hidden lg:inline">Exportar</span>
            </Button>
          </>
        )}
      />

      {!almacen && <AlertBanner variant="info" message="Elige un almacén arriba: las ventas se resumen por almacén." />}
      {almacen && !rangoValido && (
        <AlertBanner variant="warning" message="Elige un período válido: la fecha inicial no puede ser posterior a la final ni pasar de 366 días." />
      )}
      {error && <AlertBanner variant="warning" message={`No se pudo calcular el resumen: ${error.message}`} />}

      {/* Si faltan días, el total no es el del período: decirlo antes de que
          alguien lo compare con otra cifra. */}
      {cob && cob.diasConDatos < cob.diasPedidos && (
        <AlertBanner variant="warning"
          message={`Hay ventas de ${cob.diasConDatos} de los ${cob.diasPedidos} días pedidos. `
            + `El informe de este almacén llega ${cob.ultima ? `hasta el ${cob.ultima}` : 'sin datos'}`
            + `${cob.primera ? ` y empieza el ${cob.primera}` : ''}. `
            + 'Los totales son de los días que sí tienen datos.'} />
      )}
      {recortado && (
        <AlertBanner variant="info" message="Hay más productos de los que caben en el informe: se muestran los de más ventas." />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title="Unidades" value={total ? numero.format(total.cantidad) : '—'} icon={Boxes}
          color="text-[var(--c-info-2)]" bgColor="bg-[var(--c-info-2)]/10" />
        <KPICard title="Órdenes" value={total ? numero.format(total.ordenes) : '—'} icon={Receipt}
          color="text-[var(--c-purple)]" bgColor="bg-[var(--c-purple)]/10" />
        <KPICard title="Importe" value={total ? dinero.format(total.importe) : '—'} icon={DollarSign}
          color="text-[var(--c-ok-dim)]" bgColor="bg-[var(--c-ok-dim)]/10" />
        <KPICard title="Margen"
          value={total && margen(total.importe, total.costo) !== null ? `${margen(total.importe, total.costo).toFixed(1)}%` : '—'}
          icon={TrendingUp} color="text-[var(--c-warn)]" bgColor="bg-[var(--c-warn)]/10" />
      </div>

      <Tabs value={vista} onValueChange={setVista}>
        <TabsList>
          <TabsTrigger value="productos">Por producto</TabsTrigger>
          <TabsTrigger value="dias">Por día</TabsTrigger>
        </TabsList>
      </Tabs>

      <ListaResponsive
        columnas={vista === 'productos' ? COLUMNAS_PRODUCTO : COLUMNAS_DIA}
        titulos={TITULOS}
        filas={pagina}
        cargando={(isLoading || isFetching) && !data}
        vacio={almacen ? 'Sin ventas en este período.' : 'Elige un almacén.'}
        claveDe={(f) => f.codigo ?? f.fecha}
        encabezado={vista === 'productos' ? 'producto' : 'fecha'}
        accion={vista === 'productos' ? 'acciones' : undefined}
        celda={(f, k, enTabla) => celdaVenta(f, k, enTabla, { almacen, onAccion: setAccion })}
      />
      <DialogosConteo accion={accion} onHecho={() => setAccion(null)} onClose={() => setAccion(null)} />

      <Pagination page={page} total={filas.length} pageSize={PAGE_SIZE} onPage={setPage} />
    </div>
  );
}

/** Una celda: la misma para la tabla y para la ficha del móvil. */
function celdaVenta(f, clave, enTabla, { almacen, onAccion }) {
  const env = (contenido, clases = '') => (enTabla
    ? <td key={clave} className={`px-2.5 py-1.5 ${clases}`}>{contenido}</td>
    : contenido);

  switch (clave) {
    case 'producto':
      return env(
        <>
          <p className="font-medium leading-snug">{f.nombre || 'Sin nombre en el catálogo'}</p>
          <p className="text-xs text-muted-foreground font-mono">{f.codigo}</p>
        </>,
      );
    case 'fecha':
      return env(<span className="font-medium tabular-nums">{f.fecha}</span>);
    case 'acciones':
      return env(
        <CeldaAcciones inv={{ almacen_num: almacen, producto_codigo: f.codigo, producto_nombre: f.nombre || f.codigo }}
          analizar onAccion={onAccion} />,
        'whitespace-nowrap',
      );
    case 'cantidad':
      return env(<span className="font-medium tabular-nums">{numero.format(f.cantidad)}</span>, 'text-right');
    case 'ordenes':
      return env(<span className="tabular-nums">{numero.format(f.ordenes)}</span>, 'text-right');
    case 'importe':
      return env(<span className="tabular-nums">{dinero.format(f.importe)}</span>, 'text-right');
    case 'costo':
      return env(<span className="tabular-nums text-muted-foreground">{dinero.format(f.costo)}</span>, 'text-right');
    default:
      return env(null);
  }
}
