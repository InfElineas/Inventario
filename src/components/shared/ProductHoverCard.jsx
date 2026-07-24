import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Package } from 'lucide-react'

/**
 * Card flotante que muestra imagen y detalles del producto.
 * Se renderiza via portal (fuera del DOM de la tabla) para evitar overflow.
 *
 * Uso en un <tr>:
 *   <tr
 *     onMouseEnter={(e) => setHoveredProduct({ p, rect: e.currentTarget.getBoundingClientRect() })}
 *     onMouseLeave={() => setHoveredProduct(null)}
 *   >
 *
 * Luego fuera de la tabla:
 *   {hoveredProduct && <ProductHoverCard producto={hoveredProduct.p} rect={hoveredProduct.rect} />}
 */
export default function ProductHoverCard({ producto, rect }) {
  const [imgError, setImgError] = useState(false)

  useEffect(() => setImgError(false), [producto?.id])

  if (!producto || !rect) return null

  const CARD_W = 272
  const CARD_H = 270
  const GAP    = 14
  const vw     = window.innerWidth
  const vh     = window.innerHeight

  // Posicionar a la derecha de la fila, o a la izquierda si no cabe
  let left = rect.right + GAP
  if (left + CARD_W > vw - 8) left = rect.left - CARD_W - GAP

  // Centrar verticalmente respecto a la fila
  let top = rect.top + rect.height / 2 - CARD_H / 2
  if (top < 8)              top = 8
  if (top + CARD_H > vh - 8) top = vh - CARD_H - 8

  const firstImg = Array.isArray(producto.fotos) && producto.fotos.length > 0 ? producto.fotos[0] : null

  const card = (
    <div
      className="fixed z-[9999] rounded-xl shadow-2xl overflow-hidden pointer-events-none"
      style={{
        left,
        top,
        width: CARD_W,
        background: 'hsl(var(--card))',
        border:     '1px solid hsl(var(--border))',
        boxShadow:  '0 20px 60px rgba(0,0,0,0.3)',
        animation:  'fadeInCard 0.12s ease-out',
      }}
    >
      {/* Imagen */}
      <div className="w-full h-32 bg-muted flex items-center justify-center overflow-hidden">
        {firstImg && !imgError ? (
          <img
            src={firstImg}
            alt={producto.nombre}
            onError={() => setImgError(true)}
            className="w-full h-full object-contain p-2"
          />
        ) : (
          <Package className="w-10 h-10 text-muted-foreground opacity-25" />
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
          {producto.nombre}
        </p>

        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          {producto.codigo_producto && <>
            <span className="text-muted-foreground">Código</span>
            <span className="text-foreground font-mono truncate">{producto.codigo_producto}</span>
          </>}
          {producto.id_tienda && <>
            <span className="text-muted-foreground">ID Tienda</span>
            <span className="text-foreground font-mono">{producto.id_tienda}</span>
          </>}
          {producto.suministrador && <>
            <span className="text-muted-foreground">Suministrador</span>
            <span className="text-foreground truncate">{producto.suministrador?.replace('SEL ','')}</span>
          </>}
          {producto.categoria_elineas && <>
            <span className="text-muted-foreground">Categoría</span>
            <span className="text-foreground truncate">{producto.categoria_elineas}</span>
          </>}
        </div>

        {/* Stock + precio */}
        <div className="flex items-center gap-0 pt-1.5 border-t border-border">
          {[
            { label: 'EF', value: producto.exist_fisica ?? 0, color: (producto.exist_fisica ?? 0) === 0 ? '#e24b4a' : '#4ade80' },
            { label: 'A',  value: producto.almacen ?? 0,       color: '#60a5fa' },
            { label: 'T',  value: producto.tienda  ?? 0,       color: '#facc15' },
            ...(+(producto.precio_costo ?? 0) > 0
              ? [{ label: 'Precio', value: `$${(+producto.precio_costo).toFixed(2)}`, color: '#a78bfa' }]
              : [])
          ].map(({ label, value, color }) => (
            <div key={label} className="flex-1 text-center px-1">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="text-[13px] font-bold tabular-nums" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return createPortal(card, document.body)
}
