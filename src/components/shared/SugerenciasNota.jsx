/**
 * Las notas que se repiten, a un clic.
 *
 * Casi todas las notas de un conteo son la misma media docena de frases, y
 * casi siempre con un detalle detrás: «Producto cercano a vencer. Las 18u».
 * Por eso cada sugerencia AÑADE texto en vez de sustituirlo — se pulsa la
 * frase y se escribe el detalle — y por eso no son un desplegable cerrado: lo
 * que no esté en la lista se sigue escribiendo a mano.
 *
 * Teclearlas enteras cada vez no solo es lento: hace que la misma causa se
 * escriba de cinco maneras y luego no se pueda contar cuántas veces pasó.
 */

/** Las que de verdad se repiten, tomadas de las notas ya registradas. */
export const NOTAS_FRECUENTES = [
  'Sin explicación',
  'Mal conteo de inventario',
  'No se encuentra en almacén',
  'No se encontraron más unidades',
  'Producto cercano a vencer',
  'No estaba a la vista',
  'Posible faltante de origen',
  'Intercambio con otro producto similar',
  'Salió por venta directa sin reflejarlo en TKC',
];

export default function SugerenciasNota({ valor, onElegir, opciones = NOTAS_FRECUENTES }) {
  /** Se encadenan con punto, como están escritas hoy. */
  const añadir = (frase) => {
    const actual = (valor ?? '').trim();
    if (!actual) return onElegir(frase);
    if (actual.toLowerCase().includes(frase.toLowerCase())) return undefined;
    return onElegir(`${actual.replace(/\.*$/, '')}. ${frase}`);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((frase) => {
        const puesta = (valor ?? '').toLowerCase().includes(frase.toLowerCase());
        return (
          <button
            key={frase} type="button" onClick={() => añadir(frase)} disabled={puesta}
            className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
              puesta
                ? 'border-[#4ade80]/40 bg-[#4ade80]/10 text-[#4ade80] cursor-default'
                : 'border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          >
            {frase}
          </button>
        );
      })}
    </div>
  );
}
