import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import AlertBanner from '@/components/shared/AlertBanner';
import { Check, Loader2 } from 'lucide-react';
import { CLASIF_INTERCAMBIO } from '@/lib/conteosFact';

// Una sola definición: la usan también las pantallas de ajustes para reconocer
// los intercambios. Ver src/lib/conteosFact.js.
export { CLASIF_INTERCAMBIO };

/**
 * Lo que hay que escribirle a la otra mitad cuando se declara el intercambio.
 *
 * Las dos mitades son el mismo hecho, así que tienen que viajar juntas. Si
 * una se clasifica como intercambio y se manda a facturación, la otra no
 * puede quedarse en borrador con otra clasificación: facturación recibiría
 * un ajuste suelto que no cuadra con nada y el borrador se quedaría ahí
 * esperando a alguien que ya dio el caso por cerrado.
 *
 * El estado solo se propaga si el conteo que declara el par cambia de
 * estado. Guardar un borrador no arrastra al otro a ningún sitio.
 *
 * @param {string} idPropio  El conteo que declara el intercambio.
 * @param {string} [estado]  El estado al que acaba de pasar ese conteo.
 */
export function cambiosDelPar(idPropio, estado) {
  return {
    intercambio_id: idPropio,
    clasif_ajuste: CLASIF_INTERCAMBIO,
    ...(estado ? { estado_tarea: estado } : {}),
  };
}

/**
 * Con qué conteo se intercambió este producto.
 *
 * Un intercambio es un solo hecho contado dos veces: se vendió un producto
 * por otro, así que uno sale faltante y el otro sobrante por la MISMA
 * cantidad. Declarar solo la mitad deja a facturación con dos ajustes que no
 * cuadran y sin forma de saber que eran el mismo caso.
 *
 * Solo se ofrecen los conteos en borrador del mismo almacén cuya diferencia
 * sea exactamente la inversa. Dos razones:
 *
 *  · Un conteo ya enviado no se puede emparejar sin reabrirlo, y reabrirlo
 *    es otra conversación.
 *  · Si las cantidades no son opuestas, no es un intercambio: es otra cosa
 *    con dos diferencias que da la casualidad de que se parecen.
 *
 * Lo que NO se comprueba es que los productos se parezcan. Eso lo sabe quien
 * los tiene en la mano; el sistema no tiene con qué medirlo y fingir que sí
 * sería rechazar emparejamientos buenos.
 *
 * @param {object} props
 * @param {number} props.diferencia  La de este conteo. Se busca su inversa.
 * @param {string} props.almacen
 * @param {string} [props.excluirId] Este mismo conteo, al corregir un borrador.
 * @param {string} [props.valor]     El conteo ya elegido.
 * @param {Function} props.onElegir  (conteo | null) => void
 */
export default function SelectorIntercambio({
  diferencia, almacen, excluirId, valor, onElegir,
}) {
  const buscada = -diferencia;

  const { data: candidatos, isLoading, error } = useQuery({
    queryKey: ['intercambio', almacen, buscada, excluirId],
    queryFn: () => base44.entities.Inventario.filter(
      { almacen_num: almacen, estado_tarea: 'en_curso', diferencia: buscada },
      '-fecha_inv', 50,
    ),
    enabled: Boolean(almacen) && Number.isFinite(buscada) && buscada !== 0,
    select: (d) => (Array.isArray(d) ? d : []).filter((i) => i.id !== excluirId),
  });

  const lista = candidatos ?? [];
  const elegido = lista.find((i) => i.id === valor);

  if (!Number.isFinite(diferencia) || diferencia === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        ¿Con qué producto se intercambió? Hace falta uno con{' '}
        <strong className="text-foreground">{buscada > 0 ? '+' : ''}{buscada}</strong>, el
        contrario de este conteo.
      </p>

      {isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando borradores…
        </p>
      )}

      {error && (
        <AlertBanner variant="warning" message={`No se pudieron buscar los borradores: ${error.message}`} />
      )}

      {!isLoading && !error && lista.length === 0 && (
        <AlertBanner variant="warning"
          message={`No hay ningún conteo en borrador con ${buscada > 0 ? '+' : ''}${buscada}. `
            + 'Cuenta primero el otro producto y guárdalo con «Guardar para recontar»; '
            + 'entonces aparecerá aquí.'} />
      )}

      {lista.length > 0 && (
        <div className="rounded-lg border border-border divide-y divide-border overflow-hidden max-h-56 overflow-y-auto"
          style={{ borderRadius: 'var(--r-card)' }}>
          {lista.map((i) => {
            const puesto = i.id === valor;
            return (
              <button
                key={i.id}
                type="button"
                onClick={() => onElegir(puesto ? null : i)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  puesto ? 'bg-[var(--c-ok)]/10' : 'hover:bg-accent'
                }`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  puesto ? 'bg-[var(--c-ok)] border-[var(--c-ok)]' : 'border-border'
                }`}>
                  {puesto && <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate">{i.producto_nombre || '—'}</span>
                  <span className="block text-[11px] text-muted-foreground font-mono">
                    {i.producto_codigo} · {i.fecha_inv?.slice(0, 10)}
                  </span>
                </span>
                <span className={`text-sm font-medium tabular-nums shrink-0 ${
                  (i.diferencia ?? 0) > 0 ? 'text-[var(--c-warn)]' : 'text-[var(--c-bad)]'
                }`}>
                  {(i.diferencia ?? 0) > 0 ? '+' : ''}{i.diferencia}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {elegido && (
        <p className="text-xs text-[var(--c-ok-dim)]">
          Se emparejará con «{elegido.producto_nombre}». Los dos conteos quedarán enlazados.
        </p>
      )}
    </div>
  );
}
