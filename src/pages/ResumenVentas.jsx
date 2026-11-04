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
import SelectorProducto from '@/components/ventas/SelectorProducto';
import VentasPorDia from '@/components/ventas/VentasPorDia';
import { Boxes, DollarSign, Download, Receipt, Search, TrendingUp } from 'lucide-react';
import { useAlmacen } from '@/lib/useAlmacen';
import { SIN_SONDEO } from '@/lib/query-client';
import { warehouseName } from '@/services/tkc/warehouses';
import { fetchResumenVentas } from '@/services/ventasService';
import { diasDelRango, margen, rangoPorDefecto, ventasACsv } from '@/lib/ventas';

/**
 * Resumen de ventas por período.
 *
 * Lo que se vendió entre dos fechas, por producto y por día, en dos pestañas
 * que no se mezclan: las ventas de la **plataforma** (informe RDP, de un
 * almacén) y las **ventas directas** (facturas, de todos los almacenes: no
 * dicen de cuál son).
 *
 * Por día, cada día se abre y enseña los productos que lo componen, y se puede
 * elegir un producto —por código o por nombre— para ver solo los días en que se
 * vendió: «el día 5 se vendieron 6.500 unidades» no dice nada hasta que se sabe
 * de qué.
 */

const PAGE_SIZE = 50;
// Lo que hay antes de que lleguen los datos. Una sola vez, fuera del componente.
const VACIO = { total: null, productos: [], dias: [], cobertura: null, recortado: false };
const numero = new Intl.NumberFormat('es-CU');
const dinero = new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'USD' });

const COLUMNAS_PRODUCTO = ['producto', 'cantidad', 'ordenes', 'importe', 'costo', 'acciones'];
const COLUMNAS_PRODUCTO_DIRECTAS = ['producto', 'cantidad', 'ordenes', 'importe'];
const TITULOS = {
  producto: { label: 'Producto' },
  acciones: { label: 'Acciones' },
  cantidad: { label: 'Unidades', align: 'right' },
  ordenes: { label: 'Órdenes', align: 'right', className: 'hidden sm:table-cell' },
  importe: { label: 'Importe', align: 'right' },
  costo: { label: 'Costo', align: 'right', className: 'hidden md:table-cell' },
};

export default function ResumenVentas() {
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const inicial = useMemo(() => rangoPorDefecto(), []);
  const [fuente, setFuente] = useState('plataforma');   // 'plataforma' | 'directas'
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [vista, setVista] = useState('productos');
  const [buscar, setBuscar] = useState('');
  const [codigo, setCodigo] = useState('');             // el producto que se analiza por día
  const [page, setPage] = useState(1);
  const [accion, setAccion] = useState(null);   // { tipo, inv } del menú ⋯ de un producto

  const directas = fuente === 'directas';
  const dias = diasDelRango(desde, hasta);
  const rangoValido = dias !== null && dias <= 366;
  const listo = (directas || Boolean(almacen)) && rangoValido;
  // Las ventas directas no son de ningún almacén: cambiar de almacén no las toca.
  const deAlmacen = directas ? '' : almacen;

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['ventas-resumen', fuente, deAlmacen, desde, hasta],
    queryFn: () => fetchResumenVentas({ almacen, desde, hasta, fuente }),
    enabled: listo,
    retry: false,
    ...SIN_SONDEO,
  });

  // Los días de UN producto: el mismo informe acotado a su código.
  const conProducto = vista === 'dias' && Boolean(codigo);
  const delProducto = useQuery({
    queryKey: ['ventas-resumen', fuente, deAlmacen, desde, hasta, codigo],
    queryFn: () => fetchResumenVentas({ almacen, desde, hasta, fuente, codigo }),
    enabled: listo && conProducto,
    retry: false,
    ...SIN_SONDEO,
  });

  // Cambiar lo que se mira devuelve a la primera página, y a otro almacén o
  // otra fuente, sin el producto que se estaba analizando.
  useEffect(() => { setPage(1); }, [fuente, almacen, desde, hasta, vista, buscar, codigo]);
  useEffect(() => { setCodigo(''); }, [fuente, almacen, desde, hasta]);

  // Sin `data?.x` dentro del componente: el compilador de React no compila
  // bien un acceso opcional cuando `data` aún no ha llegado, y rompía la
  // pantalla en el primer render. Se desestructura de una vez.
  const { total: totalGeneral, productos: todosProductos, dias: diasGenerales, cobertura: cob, recortado } = data ?? VACIO;
  const { total: totalProducto, dias: diasProducto } = delProducto.data ?? VACIO;
  const total = conProducto ? totalProducto : totalGeneral;
  const filasDia = conProducto ? diasProducto : diasGenerales;

  const productos = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q
      ? todosProductos.filter((p) => `${p.codigo} ${p.nombre}`.toLowerCase().includes(q))
      : todosProductos;
  }, [todosProductos, buscar]);

  const filas = vista === 'productos' ? productos : filasDia;
  const pagina = filas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const elegido = todosProductos.find((p) => p.codigo === codigo);

  const exportar = () => {
    const csv = ventasACsv(todosProductos);
    // BOM al principio: sin él Excel abre el CSV en latin-1 y parte los acentos.
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ventas${directas ? '_directas' : `_${almacen}`}_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Ver los días de un producto: desde la lista de días, al pulsarlo dentro de uno.
  const verDiasDe = (c) => { setVista('dias'); setCodigo(c); };

  const margenTotal = total && !directas ? margen(total.importe, total.costo) : null;

  return (
    <div className="space-y-6">
      <CabeceraLista
        titulo="Resumen de ventas"
        subtitulo={directas
          ? 'Ventas directas de todos los almacenes'
          : almacen ? `Ventas de la plataforma en ${warehouseName(almacen)}` : 'Lo que vendió la plataforma en un período'}
        recuento={data ? `${numero.format(filas.length)} ${vista === 'productos' ? 'productos' : 'días'}` : ''}
        pestanas={(
          <Tabs value={fuente} onValueChange={setFuente}>
            <TabsList>
              <TabsTrigger value="plataforma">Plataforma</TabsTrigger>
              <TabsTrigger value="directas">Ventas directas</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        buscador={vista === 'productos' ? (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={buscar} onChange={(e) => setBuscar(e.target.value)}
              placeholder="Buscar por producto o código..." className="pl-10" style={{ borderRadius: 'var(--r-ctl)' }} />
          </div>
        ) : null}
        filtros={(
          <>
            {!directas && <SelectorAlmacen almacen={almacen} setAlmacen={setAlmacen} almacenesConfig={almacenesConfig} />}
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

      {!directas && !almacen && <AlertBanner variant="info" message="Elige un almacén arriba: las ventas de la plataforma se resumen por almacén." />}
      {directas && (
        <AlertBanner variant="info"
          message="Las ventas directas no dicen de qué almacén son, así que se cuentan todas. Tampoco traen costo, y el importe es cantidad por precio final. En la base hay un hueco entre el 21 de julio y el 24 de septiembre de 2026." />
      )}
      {(directas || almacen) && !rangoValido && (
        <AlertBanner variant="warning" message="Elige un período válido: la fecha inicial no puede ser posterior a la final ni pasar de 366 días." />
      )}
      {error && <AlertBanner variant="warning" message={`No se pudo calcular el resumen: ${error.message}`} />}

      {/* Si faltan días, el total no es el del período: decirlo antes de que
          alguien lo compare con otra cifra. */}
      {cob && cob.diasConDatos < cob.diasPedidos && (
        <AlertBanner variant="warning"
          message={`Hay ventas de ${cob.diasConDatos} de los ${cob.diasPedidos} días pedidos. `
            + `El informe ${directas ? '' : 'de este almacén '}llega ${cob.ultima ? `hasta el ${cob.ultima}` : 'sin datos'}`
            + `${cob.primera ? ` y empieza el ${cob.primera}` : ''}. `
            + 'Los totales son de los días que sí tienen datos.'} />
      )}
      {recortado && (
        <AlertBanner variant="info" message="Hay más productos de los que caben en el informe: se muestran los de más ventas." />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard title="Unidades" value={total ? numero.format(total.cantidad) : '—'} icon={Boxes}
          color="text-[var(--c-info-2)]" bgColor="bg-[var(--c-info-2)]/10" />
        <KPICard title={directas ? 'Facturas' : 'Órdenes'} value={total ? numero.format(total.ordenes) : '—'} icon={Receipt}
          color="text-[var(--c-purple)]" bgColor="bg-[var(--c-purple)]/10" />
        <KPICard title="Importe" value={total ? dinero.format(total.importe) : '—'} icon={DollarSign}
          color="text-[var(--c-ok-dim)]" bgColor="bg-[var(--c-ok-dim)]/10" />
        <KPICard title="Margen"
          value={margenTotal !== null ? `${margenTotal.toFixed(1)}%` : '—'}
          icon={TrendingUp} color="text-[var(--c-warn)]" bgColor="bg-[var(--c-warn)]/10" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={vista} onValueChange={setVista}>
          <TabsList>
            <TabsTrigger value="productos">Por producto</TabsTrigger>
            <TabsTrigger value="dias">Por día</TabsTrigger>
          </TabsList>
        </Tabs>
        {vista === 'dias' && (
          <SelectorProducto productos={todosProductos} valor={codigo} onChange={setCodigo} />
        )}
        {conProducto && (
          <p className="text-xs text-muted-foreground">
            Días en que se vendió <span className="text-foreground font-medium">{elegido?.nombre || codigo}</span>
          </p>
        )}
      </div>

      {vista === 'dias' ? (
        <VentasPorDia
          fuente={fuente}
          almacen={almacen}
          filas={pagina}
          cargando={conProducto ? delProducto.isLoading : ((isLoading || isFetching) && !data)}
          conProducto={conProducto}
          onElegirProducto={verDiasDe}
        />
      ) : (
        <ListaResponsive
          columnas={directas ? COLUMNAS_PRODUCTO_DIRECTAS : COLUMNAS_PRODUCTO}
          titulos={directas ? { ...TITULOS, ordenes: { ...TITULOS.ordenes, label: 'Facturas' } } : TITULOS}
          filas={pagina}
          cargando={(isLoading || isFetching) && !data}
          vacio={!directas && !almacen ? 'Elige un almacén.' : 'Sin ventas en este período.'}
          claveDe={(f) => f.codigo}
          encabezado="producto"
          accion={directas ? undefined : 'acciones'}
          celda={(f, k, enTabla) => celdaVenta(f, k, enTabla, { almacen, onAccion: setAccion })}
        />
      )}
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
    case 'acciones':
      return env(
        <CeldaAcciones inv={{ almacen_num: almacen, producto_codigo: f.codigo, producto_nombre: f.nombre || f.codigo }}
          analizar sinPrecios onAccion={onAccion} />,
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
