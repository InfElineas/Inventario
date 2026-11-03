import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AlertBanner from '@/components/shared/AlertBanner';
import { SIN_SONDEO } from '@/lib/query-client';
import { fetchHistorialTkc } from '@/services/tkcService';
import { fetchResumenVentas } from '@/services/ventasService';
import { warehouseName } from '@/services/tkc/warehouses';
import { conteoDeRegistro } from '@/lib/analisisConteo';
import {
  TIPOS_DE_AJUSTE, cambioDeExistencia, clasificarMovimientos, compararVentas, desdeFecha,
  fechaIso, resumirMovimientos, unidadesDespachadas,
} from '@/lib/movimientosSubmayor';

/**
 * De dónde viene un faltante o un sobrante.
 *
 * Todo sale del submayor de TKC, que guarda cada movimiento del producto —
 * despachos, ventas directas, ajustes, transferencias— con su documento y su
 * usuario. Aquí se ordena ese historial para contestar la pregunta, en cuatro
 * vistas: lo que pasó desde el conteo, el origen por tipo y por usuario, las
 * ventas directas y ajustes, y lo vendido contra lo despachado.
 *
 * `inv` es la fila de un conteo (o de una merma, que no trae conteo: entonces
 * no hay cabecera de diferencia). Todo es de lectura.
 */

const dia = (ms) => new Date(ms).toISOString().slice(0, 10);
const hoy = () => dia(Date.now());

/** Por defecto el último mes; si el conteo es más viejo, desde una semana antes de él. */
function inicioPorDefecto(fechaConteo) {
  const mes = dia(Date.now() - 30 * 86400000);
  const iso = fechaIso(fechaConteo);
  if (!iso || iso >= mes) return mes;
  return dia(Date.parse(`${iso}T00:00:00Z`) - 7 * 86400000);
}

/** El contenido de una pestaña: lo que se desplaza es la tabla, no la ventana entera. */
const ZONA = 'overflow-y-auto min-h-0 max-h-[48vh] space-y-3 pr-1';

const conSigno = (n) => `${n > 0 ? '+' : ''}${n}`;

export default function AnalisisDiferenciaDialog({ inv, idTienda, onClose }) {
  const almacen = inv.almacen_num;
  const fechaConteo = fechaIso(inv.fecha_inv);
  const [desde, setDesde] = useState(() => inicioPorDefecto(inv.fecha_inv));
  const [hasta, setHasta] = useState(hoy);

  const historial = useQuery({
    queryKey: ['historial-submayor', almacen, idTienda, desde, hasta],
    queryFn: () => fetchHistorialTkc({ almacen, idTienda, desde, hasta }),
    enabled: Boolean(almacen && idTienda),
    retry: false,
    ...SIN_SONDEO,
  });

  const ventas = useQuery({
    queryKey: ['ventas-producto', almacen, inv.producto_codigo, desde, hasta],
    queryFn: () => fetchResumenVentas({ almacen, desde, hasta, codigo: inv.producto_codigo }),
    enabled: Boolean(almacen && inv.producto_codigo),
    retry: false,
    ...SIN_SONDEO,
  });

  const movimientos = useMemo(() => clasificarMovimientos(historial.data?.movimientos), [historial.data]);
  const resumen = useMemo(() => resumirMovimientos(movimientos), [movimientos]);
  const desdeConteo = useMemo(() => desdeFecha(movimientos, fechaConteo), [movimientos, fechaConteo]);
  const deAjuste = useMemo(() => movimientos.filter((m) => TIPOS_DE_AJUSTE.includes(m.tipo)), [movimientos]);

  const conteo = conteoDeRegistro(inv);
  const diferencia = Number(inv.diferencia);
  const hayConteo = Number.isFinite(conteo) && Number.isFinite(diferencia);

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogTitle className="text-sm font-medium">Analizar diferencia — {warehouseName(almacen)}</DialogTitle>
        <DialogDescription className="text-xs">
          {inv.producto_nombre} · <span className="font-mono">{inv.producto_codigo}</span>
        </DialogDescription>

        {hayConteo && (
          <p className="text-xs rounded-lg border px-3 py-2" style={{ borderRadius: 'var(--r-ctl)' }}>
            {fechaConteo ? `El ${fechaConteo}` : 'En el conteo'}: TKC tenía <strong>{inv.exist_fisica_tkc ?? '—'}</strong>,
            se contó <strong>{conteo}</strong>, diferencia <strong>{conSigno(diferencia)}</strong>.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block space-y-1.5 text-xs text-muted-foreground">
            Desde
            <Input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
              style={{ borderRadius: 'var(--r-ctl)' }} />
          </label>
          <label className="block space-y-1.5 text-xs text-muted-foreground">
            Hasta
            <Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)}
              style={{ borderRadius: 'var(--r-ctl)' }} />
          </label>
          {historial.isLoading && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground pb-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preguntando a TKC…
            </span>
          )}
        </div>

        {!idTienda && (
          <AlertBanner variant="warning"
            message="Este producto no tiene id de tienda, y el submayor busca por ese id. Hay que crearle el anuncio en TKC." />
        )}
        {historial.error && <AlertBanner variant="danger" message={historial.error.message} />}
        {historial.data === null && !historial.isLoading && !historial.error && (
          <AlertBanner variant="warning" message="El submayor no tiene este producto en este almacén." />
        )}

        {historial.data && (
          <Tabs defaultValue="conteo" className="flex flex-col gap-3 min-h-0">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="conteo">Desde el conteo</TabsTrigger>
              <TabsTrigger value="origen">Origen</TabsTrigger>
              <TabsTrigger value="ajustes">Ventas directas y ajustes</TabsTrigger>
              <TabsTrigger value="ventas">Ventas vs despachos</TabsTrigger>
            </TabsList>

            <TabsContent value="conteo" className={ZONA}>
              {!fechaConteo ? (
                <p className="text-sm text-muted-foreground">Esta fila no tiene fecha de conteo: mira el origen de los movimientos.</p>
              ) : (
                <>
                  <DesdeElConteo fecha={fechaConteo} movimientos={desdeConteo} cubierto={desde <= fechaConteo} />
                  <TablaMovimientos movimientos={desdeConteo} vacio="No hubo movimientos desde el conteo." />
                </>
              )}
            </TabsContent>

            <TabsContent value="origen" className={`${ZONA} space-y-4`}>
              <Origen resumen={resumen} />
            </TabsContent>

            <TabsContent value="ajustes" className={ZONA}>
              <TablaMovimientos movimientos={deAjuste} vacio="Sin ventas directas ni ajustes en el período." />
            </TabsContent>

            <TabsContent value="ventas" className={ZONA}>
              <VentasVsDespachos ventas={ventas} despachado={unidadesDespachadas(movimientos)} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Lo que cambió la existencia desde el conteo: si ya cambió, la diferencia es de aquel día. */
function DesdeElConteo({ fecha, movimientos, cubierto }) {
  const cambio = cambioDeExistencia(movimientos);
  return (
    <>
      {!cubierto && (
        <AlertBanner variant="warning"
          message={`El período empieza después del conteo (${fecha}): baja la fecha «Desde» para ver todo lo que pasó desde entonces.`} />
      )}
      {cambio !== 0
        ? (
          <AlertBanner variant="warning"
            message={`Desde el conteo la existencia ha cambiado en ${conSigno(cambio)} unidades. La diferencia es de aquel día: puede haberse corregido sola o haberse movido.`} />
        )
        : <p className="text-xs text-muted-foreground">Desde el conteo la existencia no ha cambiado.</p>}
    </>
  );
}

function Origen({ resumen }) {
  if (resumen.porTipo.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin movimientos en el período.</p>;
  }
  return (
    <>
      <div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="sticky top-0 bg-background py-2 pr-3 font-medium">Tipo</th>
              <th className="sticky top-0 bg-background py-2 pr-3 font-medium text-right">Movimientos</th>
              <th className="sticky top-0 bg-background py-2 pr-3 font-medium text-right">Entradas</th>
              <th className="sticky top-0 bg-background py-2 pr-3 font-medium text-right">Salidas</th>
              <th className="sticky top-0 bg-background py-2 font-medium text-right">Neto</th>
            </tr>
          </thead>
          <tbody>
            {resumen.porTipo.map((t) => (
              <tr key={t.clave} className="border-b last:border-0">
                <td className="py-1.5 pr-3">{t.etiqueta}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{t.movimientos}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--c-ok-dim)]">{t.entradas || ''}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--c-bad)]">{t.salidas || ''}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">{conSigno(t.neto)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-medium">
              <td className="py-1.5 pr-3">Total</td>
              <td />
              <td className="py-1.5 pr-3 text-right tabular-nums">{resumen.entradas}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{resumen.salidas}</td>
              <td className="py-1.5 text-right tabular-nums">{conSigno(resumen.neto)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {resumen.internos > 0 && (
        <p className="text-xs text-muted-foreground">
          {resumen.internos} {resumen.internos === 1 ? 'subida o bajada' : 'subidas o bajadas'} de tienda no
          {' '}se cuentan: reparten la misma existencia entre almacén y tienda.
        </p>
      )}
      {resumen.otros.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Sin clasificar («Otros»): {resumen.otros.slice(0, 4).join('; ')}{resumen.otros.length > 4 ? '…' : ''}.
        </p>
      )}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Por usuario</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b">
              <th className="py-1.5 pr-3 font-medium">Usuario</th>
              <th className="py-1.5 pr-3 font-medium">Fecha</th>
              <th className="py-1.5 pr-3 font-medium text-right">Mov.</th>
              <th className="py-1.5 pr-3 font-medium text-right">Entradas</th>
              <th className="py-1.5 font-medium text-right">Salidas</th>
            </tr>
          </thead>
          <tbody>
            {resumen.porUsuario.map((u) => (
              <tr key={u.usuario} className="border-b last:border-0">
                <td className="py-1.5 pr-3">{u.usuario}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
                  {u.primera.fecha === u.ultima.fecha ? u.primera.fecha : `${u.primera.fecha} – ${u.ultima.fecha}`}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{u.movimientos}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--c-ok-dim)]">{u.entradas || ''}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--c-bad)]">{u.salidas || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function VentasVsDespachos({ ventas, despachado }) {
  if (ventas.isLoading) {
    return <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Consultando las ventas…</p>;
  }
  if (ventas.error) return <AlertBanner variant="warning" message={`No se pudieron leer las ventas: ${ventas.error.message}`} />;

  const vendido = ventas.data?.total?.cantidad ?? 0;
  const { diferencia, mensaje } = compararVentas({ vendido, despachado });
  const cobertura = ventas.data?.cobertura;
  return (
    <>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border px-3 py-2" style={{ borderRadius: 'var(--r-ctl)' }}>
          <p className="text-[11px] text-muted-foreground">Vendió la plataforma</p>
          <p className="text-lg font-medium tabular-nums">{vendido}</p>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ borderRadius: 'var(--r-ctl)' }}>
          <p className="text-[11px] text-muted-foreground">Salió como despacho</p>
          <p className="text-lg font-medium tabular-nums">{despachado}</p>
        </div>
        <div className="rounded-lg border px-3 py-2" style={{ borderRadius: 'var(--r-ctl)' }}>
          <p className="text-[11px] text-muted-foreground">Diferencia</p>
          <p className="text-lg font-medium tabular-nums" style={{ color: diferencia === 0 ? 'var(--c-ok-dim)' : 'var(--c-warn)' }}>
            {conSigno(diferencia)}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{mensaje}</p>
      {cobertura && cobertura.diasConDatos < cobertura.diasPedidos && (
        <p className="text-xs text-muted-foreground">
          La plataforma solo tiene datos de {cobertura.diasConDatos} de los {cobertura.diasPedidos} días pedidos
          {cobertura.ultima ? ` (último: ${cobertura.ultima})` : ''}.
        </p>
      )}
    </>
  );
}

/** Los movimientos tal como los tiene TKC, con su tipo. */
function TablaMovimientos({ movimientos, vacio }) {
  if (movimientos.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">{vacio}</p>;
  return (
    <div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground border-b">
            <th className="sticky top-0 bg-background py-2 pr-3 font-medium">Fecha</th>
            <th className="sticky top-0 bg-background py-2 pr-3 font-medium">Documento</th>
            <th className="sticky top-0 bg-background py-2 pr-3 font-medium text-right">Entrada</th>
            <th className="sticky top-0 bg-background py-2 pr-3 font-medium text-right">Salida</th>
            <th className="sticky top-0 bg-background py-2 pr-3 font-medium text-right">Después</th>
            <th className="sticky top-0 bg-background py-2 font-medium">Usuario</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m, i) => (
            <tr key={`${m.fecha}-${m.documento}-${i}`} className="border-b last:border-0">
              <td className="py-1.5 pr-3 whitespace-nowrap">{m.fecha}</td>
              <td className="py-1.5 pr-3">{m.documento}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--c-ok-dim)]">{m.entrada ?? ''}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[var(--c-bad)]">{m.salida ?? ''}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{m.saldoFinal ?? '—'}</td>
              <td className="py-1.5 text-muted-foreground">{m.usuario}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">
        {movimientos.length} {movimientos.length === 1 ? 'movimiento' : 'movimientos'}. Tal como los tiene TKC.
      </p>
    </div>
  );
}
