import { createPortal } from 'react-dom'
import { RefreshCw, AlertTriangle } from 'lucide-react'

/**
 * Popover flotante con el desglose de existencia de una fila de TKC:
 * física, en almacén y en tienda.
 *
 * Se renderiza por portal (fuera del DOM de la tabla) para que no lo recorte el
 * `overflow-x-auto` del contenedor, igual que `ProductHoverCard`. No captura el
 * ratón (`pointer-events-none`), así que pasar por encima no cierra el hover de
 * la fila que lo abrió.
 *
 * Solo pinta: quien decide cuándo aparece (debounce) y quién trae los datos es
 * la página.
 */

const CARD_W = 240
const CARD_H = 132
const GAP = 14

const numberFmt = new Intl.NumberFormat('es-CU')

/** Posición fija junto a la fila, replegándose si no cabe en el viewport. */
function placeCard(rect) {
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = rect.right + GAP
  if (left + CARD_W > vw - 8) left = rect.left - CARD_W - GAP
  if (left < 8) left = 8

  let top = rect.top + rect.height / 2 - CARD_H / 2
  if (top < 8) top = 8
  if (top + CARD_H > vh - 8) top = vh - CARD_H - 8

  return { left, top }
}

function Cifra({ label, value, color }) {
  return (
    <div className="flex-1 text-center px-1">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[15px] font-bold tabular-nums" style={{ color }}>
        {numberFmt.format(value)}
      </p>
    </div>
  )
}

/**
 * @param {object}  props
 * @param {DOMRect} props.rect       Rect de la fila sobre la que se hace hover.
 * @param {string}  props.nombre     Nombre del producto (ya lo tiene el listado).
 * @param {object}  [props.data]     Respuesta de `fetchExistenciaTkc`; null = no está en el submayor.
 * @param {boolean} [props.isLoading]
 * @param {Error}   [props.error]
 */
export default function ExistenciaHoverCard({ rect, nombre, data, isLoading, error }) {
  if (!rect) return null

  const { left, top } = placeCard(rect)
  const ex = data?.existencia

  const card = (
    <div
      className="fixed z-[9999] rounded-xl shadow-2xl overflow-hidden pointer-events-none"
      style={{
        left,
        top,
        width: CARD_W,
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        animation: 'fadeInCard 0.12s ease-out',
      }}
    >
      <div className="px-3 pt-2.5 pb-2">
        <p className="text-[12px] font-semibold text-foreground leading-snug line-clamp-2">
          {nombre || '—'}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">Existencia en el submayor</p>
      </div>

      <div className="border-t border-border px-3 py-2.5 min-h-[62px] flex items-center">
        {isLoading ? (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Consultando TKC…
          </span>
        ) : error ? (
          <span className="flex items-start gap-2 text-xs text-[#e24b4a]">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
            <span className="line-clamp-2">{error.message}</span>
          </span>
        ) : !ex ? (
          <span className="text-xs text-muted-foreground italic">
            Sin datos en el submayor para este almacén
          </span>
        ) : (
          <div className="flex items-center w-full">
            <Cifra label="EF" value={ex.fisica} color={ex.fisica === 0 ? '#e24b4a' : '#4ade80'} />
            <Cifra label="A" value={ex.enAlmacen} color="#60a5fa" />
            <Cifra label="T" value={ex.enTienda} color="#facc15" />
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(card, document.body)
}
