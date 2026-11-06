/**
 * Los cambios de una entrada de novedades, cada uno con su etiqueta: algo nuevo,
 * una mejora o un arreglo.
 */
const ETIQUETA = {
  nuevo:   { texto: 'Nuevo',   color: 'var(--c-ok)' },
  mejora:  { texto: 'Mejora',  color: 'var(--c-info)' },
  arreglo: { texto: 'Arreglo', color: 'var(--c-warn)' },
};

export default function ListaCambios({ cambios }) {
  return (
    <ul className="space-y-2">
      {(cambios ?? []).map((c, i) => {
        const e = ETIQUETA[c.tipo] ?? ETIQUETA.mejora;
        return (
          <li key={i} className="flex items-start gap-2.5 text-sm">
            <span className="shrink-0 mt-0.5 w-[58px] text-center text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5"
              style={{ color: e.color, background: `color-mix(in srgb, ${e.color} 14%, transparent)` }}>
              {e.texto}
            </span>
            <span className="min-w-0">{c.texto}</span>
          </li>
        );
      })}
    </ul>
  );
}
