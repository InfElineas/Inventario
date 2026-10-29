import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Package, RefreshCw, AlertTriangle } from 'lucide-react'

/**
 * Ficha flotante del producto bajo el ratón en el catálogo.
 *
 * Sustituye a `ExistenciaHoverCard`, que solo enseñaba EF/A/T. Ahora la fila ya
 * trae todo lo que TKC publica —proveedor, marca, vencimiento, estados—, así
 * que no tiene sentido pedirlo aparte: lo que no se puede saber sin preguntar a
 * TKC es la existencia EN VIVO, y eso es lo único que llega por `enVivo`.
 *
 * Va por portal, fuera del DOM de la tabla, para que no la recorte el
 * `overflow-x-auto`. Y no captura el ratón (`pointer-events-none`): si lo
 * hiciera, pasar por encima cerraría el hover de la celda que la abrió. Por eso
 * el carrusel avanza solo en vez de tener flechas — no habría forma de pulsarlas.
 */

const CARD_W = 320
/**
 * Alto estimado para colocarla antes de medirla.
 *
 * Es solo la primera posición: en cuanto está en pantalla se mide y se
 * recoloca con el alto de verdad. Con el estimado a secas, un producto de
 * nombre largo o con categoría larga crecía por debajo y la tarjeta salía
 * cortada por abajo justo donde están las existencias y el precio.
 */
const CARD_H = 420
const GAP = 14
/** Cada cuánto pasa a la siguiente foto. */
const MS_POR_FOTO = 1800

const numberFmt = new Intl.NumberFormat('es-CU')

function posicionar(rect, alto = CARD_H) {
  const vw = window.innerWidth
  const vh = window.innerHeight

  let left = rect.right + GAP
  if (left + CARD_W > vw - 8) left = rect.left - CARD_W - GAP
  if (left < 8) left = 8

  let top = rect.top + rect.height / 2 - alto / 2
  if (top + alto > vh - 8) top = vh - alto - 8
  if (top < 8) top = 8

  return { left, top }
}

/** Carrusel automático. Con una sola foto no se anima ni se pintan puntos. */
function Carrusel({ fotos, nombre }) {
  const [i, setI] = useState(0)
  const [rotas, setRotas] = useState(() => new Set())

  const buenas = fotos.filter((_, idx) => !rotas.has(idx))

  useEffect(() => { setI(0) }, [nombre])

  useEffect(() => {
    if (buenas.length < 2) return
    const t = setInterval(() => setI((n) => (n + 1) % buenas.length), MS_POR_FOTO)
    return () => clearInterval(t)
  }, [buenas.length])

  if (buenas.length === 0) {
    return (
      <div className="w-full h-40 bg-muted flex items-center justify-center">
        <Package className="w-10 h-10 text-muted-foreground opacity-25" />
      </div>
    )
  }

  const actual = Math.min(i, buenas.length - 1)

  return (
    <div className="relative w-full h-40 bg-muted overflow-hidden">
      {/* Las fotos van en una tira que se desplaza; así el cambio es un
          deslizamiento y no un salto. */}
      <div
        className="flex h-full transition-transform duration-500 ease-out"
        style={{ width: `${buenas.length * 100}%`, transform: `translateX(-${actual * (100 / buenas.length)}%)` }}
      >
        {buenas.map((src, idx) => (
          <div key={src + idx} className="h-full flex items-center justify-center" style={{ width: `${100 / buenas.length}%` }}>
            <img
              src={src}
              alt={nombre}
              onError={() => setRotas((s) => new Set(s).add(fotos.indexOf(src)))}
              className="max-w-full max-h-full object-contain p-2"
            />
          </div>
        ))}
      </div>

      {buenas.length > 1 && (
        <div className="absolute bottom-1.5 left-0 right-0 flex items-center justify-center gap-1">
          {buenas.map((_, idx) => (
            <span
              key={idx}
              className={`h-1 rounded-full transition-all duration-300 ${
                idx === actual ? 'w-4 bg-[#4ade80]' : 'w-1 bg-white/35'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Cifra({ label, value, color }) {
  return (
    <div className="flex-1 text-center px-1">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[13px] font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  )
}

function Dato({ label, children }) {
  if (!children) return null
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground truncate" title={typeof children === 'string' ? children : undefined}>
        {children}
      </span>
    </>
  )
}

/** Vocabulario de public."apGlobalV2". Con existencia pesa más que sin ella. */
const COLOR_ANUNCIO = {
  'ACTIVADO':                'text-[#4ade80] bg-[#4ade80]/10',
  'DESACTIVADO EF>0':        'text-[#fb923c] bg-[#fb923c]/10',
  'DESACTIVADO EF=0':        'text-[#facc15] bg-[#facc15]/10',
  'DESACTIVADO MUERTO EF>0': 'text-[#e24b4a] bg-[#e24b4a]/10',
  'DESACTIVADO MUERTO EF=0': 'text-[#888780] bg-[#88878014]',
  'SIN ID EF>0':             'text-[#BA7517] bg-[#BA751714]',
  'SIN ID EF=0':             'text-[#888780] bg-[#88878014]',
}

/**
 * @param {object}  producto     fila del catálogo (ver catalogoService.aFila)
 * @param {DOMRect} rect         celda que disparó el hover
 * @param {object}  [enVivo]     existencia del submayor de TKC, si se pudo pedir
 * @param {boolean} [cargando]   la consulta en vivo sigue en marcha
 * @param {Error}   [error]      la consulta en vivo falló
 * @param {boolean} [sinAccesoTkc] la persona no tiene credenciales de TKC
 */
export default function CatalogoHoverCard({ producto, rect, enVivo, cargando, error, sinAccesoTkc }) {
  const ref = useRef(null)
  const [alto, setAlto] = useState(CARD_H)

  // Se mide ya pintada y se recoloca si hace falta. `useLayoutEffect` y no
  // `useEffect` para que el salto ocurra antes de que el ojo lo vea.
  useLayoutEffect(() => {
    const medido = ref.current?.offsetHeight
    if (medido && Math.abs(medido - alto) > 1) setAlto(medido)
  })

  if (!producto || !rect) return null

  const { left, top } = posicionar(rect, alto)
  const fotos = Array.isArray(producto.imagenes) ? producto.imagenes.filter(Boolean) : []
  const vivo = enVivo?.existencia ?? null
  // Nuestra copia puede ir hasta 18 h por detrás del submayor; cuando TKC
  // responde otra cosa, lo que manda es TKC.
  const discrepa = vivo && vivo.fisica !== producto.ef

  const card = (
    <div
      ref={ref}
      className="fixed z-[9999] rounded-xl shadow-2xl overflow-hidden pointer-events-none"
      style={{
        left, top, width: CARD_W,
        // Si ni así cabe —pantalla muy baja— se limita al alto de la ventana
        // en vez de desbordarla.
        maxHeight: 'calc(100vh - 16px)',
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        animation: 'fadeInCard 0.12s ease-out',
      }}
    >
      <Carrusel fotos={fotos} nombre={producto.nombre} />

      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <p className="text-[13px] font-semibold leading-snug line-clamp-2 flex-1">{producto.nombre}</p>
          {producto.estadoAnuncioTkc && (
            <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-medium ${
              COLOR_ANUNCIO[producto.estadoAnuncioTkc] ?? 'text-muted-foreground bg-secondary'
            }`}>
              {producto.estadoAnuncioTkc}
            </span>
          )}
        </div>

        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          <Dato label="Código">{producto.codigo}</Dato>
          <Dato label="ID tienda">{producto.idOnline}</Dato>
          <Dato label="Suministrador">{producto.suministrador?.replace('SEL ', '')}</Dato>
          <Dato label="Proveedor">{producto.proveedor}</Dato>
          <Dato label="Marca">{producto.marca}</Dato>
          <Dato label="Categoría">{producto.categoriaOnline}</Dato>
          <Dato label="U/M">{producto.unidadMedida}</Dato>
          <Dato label="Vence">{producto.fechaVencimiento}</Dato>
          <Dato label="Estado">{producto.estadoTienda}</Dato>
        </div>

        <div className="flex items-center pt-1.5 border-t border-border">
          <Cifra label="EF" value={numberFmt.format(producto.ef)} color={producto.ef === 0 ? '#e24b4a' : '#4ade80'} />
          <Cifra label="A" value={numberFmt.format(producto.enAlmacen)} color="#60a5fa" />
          <Cifra label="T" value={numberFmt.format(producto.enTienda)} color="#facc15" />
          {producto.precio > 0 && (
            <Cifra label="Precio" value={`$${producto.precio.toFixed(2)}`} color="#a78bfa" />
          )}
        </div>

        {/* La existencia en vivo de TKC, cuando se puede saber. Lo de arriba es
            nuestra copia; esto es lo que TKC dice ahora mismo. */}
        <div className="pt-1.5 border-t border-border text-[10px]">
          {!producto.idOnline ? (
            <p className="text-muted-foreground">
              Sin ID de tienda: el submayor de TKC no puede buscarlo.
            </p>
          ) : sinAccesoTkc ? (
            <p className="text-muted-foreground">
              Pon tu cuenta de TKC para ver la existencia en vivo.
            </p>
          ) : cargando ? (
            <p className="flex items-center gap-1 text-muted-foreground">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Consultando el submayor…
            </p>
          ) : error ? (
            <p className="flex items-center gap-1 text-[#e24b4a]">
              <AlertTriangle className="w-2.5 h-2.5" /> El submayor no respondió
            </p>
          ) : vivo ? (
            <p className={discrepa ? 'text-[#BA7517]' : 'text-muted-foreground'}>
              <span className="uppercase tracking-wide">Submayor ahora</span>{' '}
              EF <strong>{numberFmt.format(vivo.fisica)}</strong>
              {' · '}A <strong>{numberFmt.format(vivo.enAlmacen)}</strong>
              {' · '}T <strong>{numberFmt.format(vivo.enTienda)}</strong>
              {discrepa && ' — no coincide con nuestra copia'}
            </p>
          ) : (
            <p className="text-muted-foreground">El submayor no tiene este producto en el almacén.</p>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(card, document.body)
}
