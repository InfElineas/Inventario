import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, ScanSearch } from 'lucide-react';

/**
 * Lo que el análisis automático recomienda para la diferencia de un conteo.
 * Ver src/lib/analisisConteo.js.
 *
 * Dice qué hacer —bajar de tienda, subir, o nada— y cuántas unidades, y el
 * porqué en una o dos frases, porque una recomendación sin razón no se puede
 * comprobar con lo que se tiene delante. Y dice el supuesto sobre el que se
 * apoya: que el conteo es el del almacén.
 *
 * @param {{ analisis: ReturnType<typeof import('@/lib/analisisConteo').analizarConteo> }} props
 */
export default function AnalisisConteo({ analisis }) {
  if (!analisis || analisis.diferencia === 0) return null;

  const { accion, cantidad, condicional, resumen, detalles } = analisis;
  const Icono = accion === 'bajar' ? ArrowDownToLine : accion === 'subir' ? ArrowUpFromLine : CheckCircle2;
  const color = accion === 'bajar' ? 'var(--c-warn)' : accion === 'subir' ? 'var(--c-info-2)' : 'var(--c-ok-dim)';

  return (
    <div className="rounded-lg border px-3 py-2.5 space-y-1.5"
      style={{ borderRadius: 'var(--r-ctl)', borderColor: `color-mix(in srgb, ${color} 30%, transparent)`, background: `color-mix(in srgb, ${color} 6%, transparent)` }}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <ScanSearch className="w-3 h-3" /> Análisis del conteo
      </p>
      <p className="text-sm font-medium flex items-center gap-2" style={{ color }}>
        <Icono className="w-4 h-4 shrink-0" />
        {accion === 'ninguna' ? resumen : (
          <>
            {condicional ? 'Posible: ' : 'Recomendado: '}
            {accion === 'bajar' ? 'bajar' : 'subir'} {cantidad} {cantidad === 1 ? 'unidad' : 'unidades'} {accion === 'bajar' ? 'de tienda' : 'a tienda'}
          </>
        )}
      </p>
      {detalles.map((d) => <p key={d} className="text-xs text-muted-foreground leading-snug">{d}</p>)}
      <p className="text-[11px] text-muted-foreground/80">
        Supone que el conteo es el del almacén: compara con A, no con la existencia total.
      </p>
    </div>
  );
}
