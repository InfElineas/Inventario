import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AlertBanner from '@/components/shared/AlertBanner';
import { fetchRotacion } from '@/services/rotacionService';
import { warehouseName } from '@/services/tkc/warehouses';
import { SIN_SONDEO } from '@/lib/query-client';
import { X, ShoppingCart, Download, Loader2, RefreshCw } from 'lucide-react';

/**
 * Qué hay que reponer, por días de cobertura.
 *
 * Antes miraba `productos.stock_minimo`, un campo que había que rellenar a
 * mano producto por producto: nadie lo hizo nunca, así que la pantalla salía
 * siempre vacía y el botón no servía para nada.
 *
 * Ahora la pregunta es otra y se contesta sola: al ritmo al que se vende cada
 * producto, ¿cuántos días aguanta lo que hay? El ritmo sale del informe de
 * rotación de TKC y la existencia, de nuestra copia. El mínimo deja de ser un
 * número escrito a mano y pasa a ser lo que hace falta para cubrir los días
 * que decida quien compra.
 *
 * Lo que no se vende no sale: no es que falte, es que no rota. Y lo que no
 * tiene id de tienda tampoco, porque el informe va por ese id.
 */

const DIAS_KEY = 'reab_dias_cobertura';
/** Dos semanas: lo que tarda en llegar un pedido más un margen. */
const DIAS_POR_DEFECTO = 15;

const leerDias = () => {
  try { return Number(localStorage.getItem(DIAS_KEY)) || DIAS_POR_DEFECTO; }
  catch { return DIAS_POR_DEFECTO; }
};

/** Color según lo apurado que esté: rojo si ya se agotó o le quedan días. */
function colorCobertura(dias, objetivo) {
  if (dias === null) return 'text-muted-foreground';
  if (dias <= 0) return 'text-[#E24B4A]';
  if (dias < objetivo / 2) return 'text-[#E24B4A]';
  if (dias < objetivo) return 'text-[#BA7517]';
  return 'text-[#1D9E75]';
}

export default function OrdenReabastecimiento({ almacen, onClose }) {
  const [dias, setDias] = useState(leerDias);
  const [cantidades, setCantidades] = useState({});

  const guardarDias = (v) => {
    setDias(v);
    try { localStorage.setItem(DIAS_KEY, String(v)); } catch { /* sin persistencia, da igual */ }
  };

  const { data: productosRaw, isLoading: cargandoProductos } = useQuery({
    queryKey: ['productos-reab', almacen],
    queryFn: () => base44.entities.Producto.filter(
      { activo: true, ...(almacen ? { almacen_num: almacen } : {}) },
      '-exist_fisica', 2000,
      ['id', 'nombre', 'codigo_producto', 'id_tienda', 'suministrador', 'exist_fisica', 'almacen_num'],
    ),
    select: (d) => (Array.isArray(d) ? d : []),
    enabled: Boolean(almacen),
  });

  const { data: rotacion, isLoading: cargandoRotacion, error, refetch, isFetching } = useQuery({
    queryKey: ['rotacion'],
    queryFn: () => fetchRotacion(),
    ...SIN_SONDEO,
    retry: false,
  });

  const productos = productosRaw ?? [];
  const cargando = cargandoProductos || cargandoRotacion;

  const filas = useMemo(() => {
    if (!rotacion) return [];
    return productos
      .map((p) => {
        const r = rotacion[String(p.id_tienda ?? '').trim()];
        const diaria = r?.diaria ?? 0;
        if (!diaria) return null;            // no rota: no es cosa de reponer
        const existencia = Number(p.exist_fisica) || 0;
        const cobertura = diaria > 0 ? existencia / diaria : null;
        const minimo = Math.ceil(diaria * dias);
        return {
          ...p,
          diaria,
          cobertura,
          minimo,
          // Lo que falta para cubrir los días pedidos. Nunca negativo: si
          // sobra, no hay nada que pedir.
          faltan: Math.max(0, minimo - existencia),
          ultimaVenta: r?.ultimaVenta ?? null,
        };
      })
      .filter((p) => p && p.faltan > 0)
      .sort((a, b) => (a.cobertura ?? 0) - (b.cobertura ?? 0));
  }, [productos, rotacion, dias]);

  const exportar = () => {
    const cabecera = ['Código', 'Nombre', 'Suministrador', 'Existencia', 'Venta diaria', 'Días de cobertura', 'Mínimo', 'A pedir'];
    const cuerpo = filas.map((p) => [
      p.codigo_producto,
      `"${(p.nombre ?? '').replace(/"/g, '""')}"`,
      `"${(p.suministrador ?? '—').replace(/"/g, '""')}"`,
      p.exist_fisica ?? 0,
      p.diaria.toFixed(2),
      p.cobertura === null ? '' : p.cobertura.toFixed(1),
      p.minimo,
      cantidades[p.id] ?? p.faltan,
    ]);
    const csv = [cabecera, ...cuerpo].map((f) => f.join(',')).join('\n');
    // BOM al principio: sin él Excel abre el CSV en latin-1 y parte los acentos.
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reabastecimiento_${almacen}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-6 space-y-5" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-[#E24B4A]" />
          <h3 className="text-sm font-medium">Reabastecimiento — {warehouseName(almacen) || almacen || 'sin almacén'}</h3>
          {filas.length > 0 && (
            <span className="text-[11px] bg-[#E24B4A]/10 text-[#E24B4A] px-2 py-0.5 rounded font-medium">
              {filas.length} producto{filas.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Cubrir
            <Input type="number" min="1" max="365" value={dias} className="w-16 h-7 text-right text-xs"
              onChange={(e) => guardarDias(Number(e.target.value) || DIAS_POR_DEFECTO)}
              style={{ borderRadius: '6px' }} />
            días
          </label>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} title="Volver a pedir la rotación">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
      </div>

      {!almacen && <AlertBanner variant="warning" message="Elige un almacén para ver qué hay que reponer." />}
      {error && <AlertBanner variant="danger" message={error.message} />}

      {cargando ? (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Cruzando la rotación de venta con las existencias…
        </p>
      ) : filas.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nada por reponer con {dias} días de cobertura.</p>
          <p className="text-xs mt-1">
            Solo entran los productos que se venden y tienen id de tienda; sube los días para ver más.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Ordenado por lo que menos aguanta. «Días» es cuánto dura la existencia al ritmo al que se vende;
            «mínimo» es lo que haría falta para cubrir {dias} días.
          </p>

          <div className="overflow-x-auto rounded-lg border" style={{ borderWidth: '0.5px' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/40">
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Producto</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Existencia</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Venta/día</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Días</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Mínimo</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">A pedir</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-3">
                      <p className="font-medium text-xs">{p.nombre}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.codigo_producto} · {p.suministrador || '—'}
                      </p>
                    </td>
                    <td className="p-3 text-right tabular-nums">{p.exist_fisica ?? 0}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{p.diaria.toFixed(2)}</td>
                    <td className={`p-3 text-right tabular-nums font-medium ${colorCobertura(p.cobertura, dias)}`}>
                      {p.cobertura === null ? '—' : p.cobertura.toFixed(1)}
                    </td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{p.minimo}</td>
                    <td className="p-3 text-right">
                      <Input type="number" min="0" className="w-20 text-right h-7 text-xs"
                        value={cantidades[p.id] ?? p.faltan}
                        onChange={(e) => setCantidades((c) => ({ ...c, [p.id]: e.target.value }))}
                        style={{ borderRadius: '6px' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} style={{ borderRadius: '8px' }}>Cerrar</Button>
            <Button onClick={exportar} style={{ borderRadius: '8px' }}>
              <Download className="w-4 h-4 mr-1.5" /> Exportar CSV
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
