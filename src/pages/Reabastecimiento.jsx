import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AlertBanner from '@/components/shared/AlertBanner';
import Pagination from '@/components/shared/Pagination';
import ColPicker, { loadColsWithOrder, saveColsWithOrder } from '@/components/shared/ColPicker';
import SortTh from '@/components/shared/SortTh';
import { useSortable } from '@/lib/useSortable';
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';
import { SIN_SONDEO } from '@/lib/query-client';
import { fetchCobertura } from '@/services/rotacionService';
import { WAREHOUSES, warehouseName } from '@/services/tkc/warehouses';
import { Download, Loader2, RefreshCw, Search, ShoppingCart } from 'lucide-react';

/**
 * Qué hay que reponer, por días de cobertura.
 *
 * La pregunta que contesta es «al ritmo al que se vende cada producto,
 * ¿cuántos días aguanta lo que hay?». El ritmo sale del informe diario de TKC
 * y la existencia de nuestra copia; el cruce lo hace el servidor.
 *
 * Antes esto vivía en un panel dentro de Inventario que miraba un
 * `stock_minimo` escrito a mano que nadie rellenó, así que salía siempre
 * vacío. Ahora es su propia pantalla porque es su propio trabajo: comprar no
 * es contar.
 *
 * Las pestañas son el estado en tienda. No es un adorno: un producto agotado
 * y uno que solo está sin reserva necesitan comprarse con urgencias
 * distintas, y mezclarlos en una lista de setecientas filas hace que la
 * diferencia desaparezca.
 */

const PAGE_SIZE = 50;

/**
 * Las columnas, elegibles como en el resto del modulo.
 *
 * Suministrador y minimo nacen apagadas porque son las que ya se escondian
 * por ancho de pantalla: quien entra desde el movil ve lo mismo de antes y
 * puede sacarlas si las necesita.
 */
const REAB_COL_DEFS = [
  { key: 'producto',      label: 'Producto',      defaultOn: true,  required: true  },
  { key: 'suministrador', label: 'Suministrador', defaultOn: false, required: false },
  { key: 'estadoTienda',  label: 'Tienda',        defaultOn: true,  required: false },
  { key: 'existencia',    label: 'Existencia',    defaultOn: true,  required: false },
  { key: 'diaria',        label: 'Venta/dia',     defaultOn: true,  required: false },
  { key: 'cobertura',     label: 'Dias',          defaultOn: true,  required: false },
  { key: 'minimo',        label: 'Minimo',        defaultOn: false, required: false },
  { key: 'pedir',         label: 'A pedir',       defaultOn: true,  required: true  },
];
const REAB_COLS_KEY = 'reab_cols';

/** Como se titula, alinea y si se puede ordenar por ella. */
const COL_TITULO = {
  producto:      { label: 'Producto', ordenable: true },
  suministrador: { label: 'Suministrador', ordenable: true },
  estadoTienda:  { label: 'Tienda', align: 'center' },
  existencia:    { label: 'Existencia', align: 'right', ordenable: true },
  diaria:        { label: 'Venta/dia', align: 'right', ordenable: true },
  cobertura:     { label: 'Dias', align: 'right', ordenable: true },
  minimo:        { label: 'Minimo', align: 'right', ordenable: true },
  pedir:         { label: 'A pedir', align: 'right' },
};

/**
 * Por defecto solo se ofrecen los anuncios activados.
 *
 * De los cinco mil productos que piden reposición en un almacén, casi todos
 * están agotados; y entre esos hay muchos cuyo anuncio está desactivado o
 * muerto en TKC. Comprar para un anuncio muerto no tiene sentido, pero
 * esconderlo tampoco: puede ser justo el que conviene reactivar porque se
 * vendía bien. Se filtra, no se oculta.
 */
const ANUNCIO_POR_DEFECTO = 'ACTIVADO';
const DIAS_KEY = 'reab_dias_cobertura';
const DIAS_POR_DEFECTO = 15;

const leerDias = () => {
  try { return Number(localStorage.getItem(DIAS_KEY)) || DIAS_POR_DEFECTO; }
  catch { return DIAS_POR_DEFECTO; }
};

/** Orden de las pestañas: de lo más apurado a lo que puede esperar. */
const ORDEN_ESTADOS = [
  'AGOTADO', 'SIN RESERVA', 'ULTIMAS PIEZAS', 'NO TIENDA', 'PROXIMO', 'DISPONIBLE', 'SIN ID',
];

const ORDEN_COLUMNA = {
  producto: (f) => (f.nombre ?? '').toLowerCase(),
  existencia: (f) => f.existencia,
  diaria: (f) => f.diaria,
  cobertura: (f) => f.cobertura,
  minimo: (f) => f.minimo,
  faltan: (f) => f.faltan,
  suministrador: (f) => (f.suministrador ?? '').toLowerCase(),
};

function colorCobertura(dias, objetivo) {
  if (dias <= 0) return 'text-[#E24B4A]';
  if (dias < objetivo / 2) return 'text-[#E24B4A]';
  if (dias < objetivo) return 'text-[#BA7517]';
  return 'text-[#1D9E75]';
}

export default function Reabastecimiento() {
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const [dias, setDias] = useState(leerDias);
  const [estado, setEstado] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [suministrador, setSuministrador] = useState('');
  const [anuncio, setAnuncio] = useState(ANUNCIO_POR_DEFECTO);
  const [cantidades, setCantidades] = useState({});
  const [page, setPage] = useState(1);
  const [cols, setCols] = useState(() => loadColsWithOrder(REAB_COLS_KEY, REAB_COL_DEFS).visible);
  const [colOrder, setColOrder] = useState(() => loadColsWithOrder(REAB_COLS_KEY, REAB_COL_DEFS).order);
  const visibles = colOrder.filter((k) => cols[k]);
  const { sort, onSort } = useSortable('cobertura', 'asc');

  const guardarDias = (v) => {
    setDias(v);
    try { localStorage.setItem(DIAS_KEY, String(v)); } catch { /* da igual */ }
  };

  const almacenes = useMemo(
    () => WAREHOUSES.filter((w) => filterAlmacenesByConfig([w.key], almacenesConfig).length > 0),
    [almacenesConfig],
  );

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['cobertura', almacen, dias],
    queryFn: () => fetchCobertura({ almacen, dias }),
    enabled: Boolean(almacen),
    ...SIN_SONDEO,
    retry: false,
  });
  const filas = data ?? [];

  // Cambiar de filtro devuelve a la primera página: quedarse en la siete de
  // una lista que ahora tiene dos deja la tabla vacía.
  const firma = `${almacen}|${dias}|${estado}|${busqueda.trim()}|${suministrador}|${anuncio}`;
  const previa = useRef(firma);
  useEffect(() => {
    if (previa.current !== firma) { previa.current = firma; setPage(1); }
  }, [firma]);

  // El filtro de anuncio se aplica antes de contar las pestañas: si no, los
  // números de arriba no cuadrarían con las filas de abajo.
  const porAnuncio = useMemo(
    () => (anuncio === 'TODOS' ? filas : filas.filter((f) => f.estadoAnuncio === anuncio)),
    [filas, anuncio],
  );

  const suministradores = useMemo(
    () => [...new Set(porAnuncio.map((f) => f.suministrador).filter(Boolean))].sort(),
    [porAnuncio],
  );

  const anuncios = useMemo(
    () => [...new Set(filas.map((f) => f.estadoAnuncio).filter(Boolean))].sort(),
    [filas],
  );

  const porEstado = useMemo(() => {
    const cuenta = new Map();
    for (const f of porAnuncio) cuenta.set(f.estadoTienda, (cuenta.get(f.estadoTienda) ?? 0) + 1);
    return cuenta;
  }, [porAnuncio]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = porAnuncio.filter((f) => {
      if (estado !== 'TODOS' && f.estadoTienda !== estado) return false;
      if (suministrador && f.suministrador !== suministrador) return false;
      if (q && !f.nombre?.toLowerCase().includes(q) && !String(f.codigo).toLowerCase().includes(q)) return false;
      return true;
    });

    const clave = ORDEN_COLUMNA[sort.key] ?? ORDEN_COLUMNA.cobertura;
    const mul = sort.dir === 'asc' ? 1 : -1;
    return [...lista].sort((a, b) => {
      const va = clave(a); const vb = clave(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mul;
      return String(va).localeCompare(String(vb)) * mul;
    });
  }, [porAnuncio, estado, suministrador, busqueda, sort]);

  const pagina = filtradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const unidades = filtradas.reduce((s, f) => s + (Number(cantidades[f.id] ?? f.faltan) || 0), 0);

  const exportar = () => {
    const cabecera = ['Código', 'Nombre', 'Suministrador', 'Estado en tienda', 'Existencia', 'Venta diaria', 'Días', 'Mínimo', 'A pedir'];
    const cuerpo = filtradas.map((f) => [
      f.codigo,
      `"${(f.nombre ?? '').replace(/"/g, '""')}"`,
      `"${(f.suministrador || '—').replace(/"/g, '""')}"`,
      f.estadoTienda,
      f.existencia,
      f.diaria.toFixed(2),
      f.cobertura.toFixed(1),
      f.minimo,
      cantidades[f.id] ?? f.faltan,
    ]);
    const csv = [cabecera, ...cuerpo].map((l) => l.join(',')).join('\n');
    // BOM al principio: sin él Excel abre el CSV en latin-1 y parte los acentos.
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reabastecimiento_${almacen}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const estadosConFilas = ORDEN_ESTADOS.filter((e) => porEstado.has(e))
    .concat([...porEstado.keys()].filter((e) => !ORDEN_ESTADOS.includes(e)).sort());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium">Reabastecimiento</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Qué comprar, por los días que aguanta cada producto al ritmo al que se vende
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={almacenes.some((w) => w.key === almacen) ? almacen : ''} onValueChange={setAlmacen}>
            <SelectTrigger className="w-52" style={{ borderRadius: '8px' }}>
              <SelectValue placeholder="Elige un almacén" />
            </SelectTrigger>
            <SelectContent>
              {almacenes.map((w) => <SelectItem key={w.key} value={w.key}>{w.nombre}</SelectItem>)}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Cubrir
            <Input type="number" min="1" max="365" value={dias} className="w-16 h-9 text-right text-xs"
              onChange={(e) => guardarDias(Number(e.target.value) || DIAS_POR_DEFECTO)}
              style={{ borderRadius: '8px' }} />
            días
          </label>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching || !almacen}
            style={{ borderRadius: '8px' }} title="Volver a pedir el informe de rotación">
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <ColPicker cols={REAB_COL_DEFS} visible={cols}
            onChange={(next) => { setCols(next); saveColsWithOrder(REAB_COLS_KEY, next, colOrder); }}
            storageKey={REAB_COLS_KEY} order={colOrder}
            onOrderChange={(next) => { setColOrder(next); saveColsWithOrder(REAB_COLS_KEY, cols, next); }} />
          <Button onClick={exportar} disabled={filtradas.length === 0} style={{ borderRadius: '8px' }}>
            <Download className="w-4 h-4 mr-1.5" /> Exportar
          </Button>
        </div>
      </div>

      {!almacen && <AlertBanner variant="warning" message="Elige un almacén para ver qué hay que reponer." />}
      {error && <AlertBanner variant="danger" message={error.message} />}

      {isLoading ? (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-16">
          <Loader2 className="w-4 h-4 animate-spin" /> Cruzando la rotación de venta con las existencias…
        </p>
      ) : almacen && filas.length === 0 && !error ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nada por reponer en {warehouseName(almacen)} con {dias} días de cobertura.</p>
          <p className="text-xs mt-1">Solo entran los productos que se venden y tienen id de tienda.</p>
        </div>
      ) : almacen && (
        <>
          {/* Pestañas por estado en tienda: un agotado y un «sin reserva» no
              se compran con la misma urgencia, y en una lista de setecientas
              filas esa diferencia se pierde. */}
          <Tabs value={estado} onValueChange={setEstado}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="TODOS">Todos ({porAnuncio.length})</TabsTrigger>
              {estadosConFilas.map((e) => (
                <TabsTrigger key={e} value={e}>{e} ({porEstado.get(e)})</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre o código…" className="pl-10" style={{ borderRadius: '8px' }} />
            </div>
            <Select value={anuncio} onValueChange={setAnuncio}>
              <SelectTrigger className="w-56" style={{ borderRadius: '8px' }}>
                <SelectValue placeholder="Estado del anuncio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos los anuncios</SelectItem>
                {anuncios.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={suministrador || 'all'} onValueChange={(v) => setSuministrador(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-60" style={{ borderRadius: '8px' }}>
                <SelectValue placeholder="Suministrador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los suministradores</SelectItem>
                {suministradores.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {anuncio !== 'TODOS' && porAnuncio.length < filas.length && (
            <p className="text-xs text-muted-foreground">
              Se muestran los de anuncio «{anuncio}». Hay {filas.length - porAnuncio.length} más con otro
              estado de anuncio —desactivados o muertos—: no se compran, pero alguno puede merecer reactivarse.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            {filtradas.length} {filtradas.length === 1 ? 'producto' : 'productos'} · {unidades} unidades a pedir.
            «Días» es cuánto dura la existencia al ritmo al que se vende; «mínimo», lo que haría falta para {dias} días.
            La venta diaria se calcula sobre los días en que hubo venta, no sobre el calendario: un día sin existencia
            vende cero y contarlo haría parecer que el producto se pide menos de lo que se pide. No entra lo que lleve
            más de noventa días sin venderse.
          </p>

          <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/40">
                    {visibles.map((k) => (COL_TITULO[k].ordenable ? (
                      <SortTh key={k} colKey={k} label={COL_TITULO[k].label} align={COL_TITULO[k].align}
                        sort={sort} onSort={onSort} className="p-3 text-xs font-medium text-muted-foreground" />
                    ) : (
                      <th key={k} className={`p-3 text-xs font-medium text-muted-foreground ${
                        COL_TITULO[k].align === 'right' ? 'text-right'
                          : COL_TITULO[k].align === 'center' ? 'text-center' : ''
                      }`}>{COL_TITULO[k].label}</th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {pagina.length === 0 ? (
                    <tr><td colSpan={visibles.length || 8} className="p-8 text-center text-muted-foreground">Nada con estos filtros.</td></tr>
                  ) : pagina.map((f) => (
                    <tr key={f.id} className="border-b last:border-0 hover:bg-accent/40 transition-colors">
                      {visibles.map((k) => {
                        const CELDAS = {
                          producto: (
                            <td key={k} className="p-3">
                              <p className="font-medium text-xs line-clamp-1" title={f.nombre}>{f.nombre}</p>
                              <p className="text-[11px] text-muted-foreground font-mono">{f.codigo}</p>
                            </td>
                          ),
                          suministrador: <td key={k} className="p-3 text-xs text-muted-foreground">{f.suministrador || '—'}</td>,
                          estadoTienda: (
                            <td key={k} className="p-3 text-center">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground whitespace-nowrap">
                                {f.estadoTienda}
                              </span>
                            </td>
                          ),
                          existencia: <td key={k} className="p-3 text-right tabular-nums">{f.existencia}</td>,
                          diaria: <td key={k} className="p-3 text-right tabular-nums text-muted-foreground">{f.diaria.toFixed(2)}</td>,
                          cobertura: (
                            <td key={k} className={`p-3 text-right tabular-nums font-medium ${colorCobertura(f.cobertura, dias)}`}>
                              {f.cobertura.toFixed(1)}
                            </td>
                          ),
                          minimo: <td key={k} className="p-3 text-right tabular-nums text-muted-foreground">{f.minimo}</td>,
                          pedir: (
                            <td key={k} className="p-3 text-right">
                              <Input type="number" min="0" className="w-20 text-right h-7 text-xs"
                                value={cantidades[f.id] ?? f.faltan}
                                onChange={(e) => setCantidades((c) => ({ ...c, [f.id]: e.target.value }))}
                                style={{ borderRadius: '6px' }} />
                            </td>
                          ),
                        };
                        return CELDAS[k] ?? <td key={k} className="p-3" />;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination page={page} total={filtradas.length} pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}
    </div>
  );
}
