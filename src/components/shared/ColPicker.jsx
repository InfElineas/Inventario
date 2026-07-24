import { useState, useRef, useEffect } from 'react'
import { SlidersHorizontal, Check, ChevronUp, ChevronDown, GripVertical } from 'lucide-react'

export function loadColsWithOrder(storageKey, colDefs) {
  const defaultOrder   = colDefs.map(c => c.key)
  const defaultVisible = Object.fromEntries(colDefs.map(c => [c.key, c.defaultOn]))
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.visible !== undefined) {
        const order   = (parsed.order ?? defaultOrder).filter(k => defaultOrder.includes(k))
        const missing = defaultOrder.filter(k => !order.includes(k))
        const fullOrder = [...order, ...missing]
        return { visible: { ...defaultVisible, ...parsed.visible }, order: fullOrder }
      } else {
        // Old format: flat visibility object
        return { visible: { ...defaultVisible, ...parsed }, order: defaultOrder }
      }
    }
  } catch {}
  return { visible: defaultVisible, order: defaultOrder }
}

export function saveColsWithOrder(storageKey, visible, order) {
  if (storageKey) localStorage.setItem(storageKey, JSON.stringify({ visible, order }))
}

// Backward compat
export function loadCols(storageKey, colDefs) {
  return loadColsWithOrder(storageKey, colDefs).visible
}

export default function ColPicker({ cols, visible, onChange, storageKey, order, onOrderChange }) {
  const [open, setOpen]         = useState(false)
  const [dragKey, setDragKey]   = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  const handleDragStart = (e, key) => {
    setDragKey(key)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e, key) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (key !== dragKey) setDragOver(key)
  }
  const handleDrop = (e, targetKey) => {
    e.preventDefault()
    if (!dragKey || dragKey === targetKey || !order || !onOrderChange) return
    const newOrder = [...order]
    const from = newOrder.indexOf(dragKey)
    const to   = newOrder.indexOf(targetKey)
    newOrder.splice(from, 1)
    newOrder.splice(to, 0, dragKey)
    onOrderChange(newOrder)
    saveColsWithOrder(storageKey, visible, newOrder)
    setDragKey(null)
    setDragOver(null)
  }
  const handleDragEnd = () => { setDragKey(null); setDragOver(null) }

  const toggle = (key) => {
    const col = cols.find(c => c.key === key)
    if (col?.required) return
    const next = { ...visible, [key]: !visible[key] }
    onChange(next)
    if (onOrderChange) saveColsWithOrder(storageKey, next, order)
    else if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next))
  }

  const move = (key, dir) => {
    if (!order || !onOrderChange) return
    const idx = order.indexOf(key)
    if (idx < 0) return
    const newOrder = [...order]
    const target = idx + dir
    if (target < 0 || target >= newOrder.length) return
    ;[newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]]
    onOrderChange(newOrder)
    saveColsWithOrder(storageKey, visible, newOrder)
  }

  // Render cols in order sequence if provided
  const displayCols = order
    ? order.map(k => cols.find(c => c.key === k)).filter(Boolean)
    : cols

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:border-[#4ade80]/30 transition-colors"
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span className="hidden sm:inline">Columnas</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-[42px] rounded-xl shadow-2xl z-50 overflow-hidden py-2"
          style={{ minWidth: '210px', background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
        >
          {displayCols.map((c, idx) => (
            <div
              key={c.key}
              draggable={Boolean(order && onOrderChange && !c.required)}
              onDragStart={(e) => handleDragStart(e, c.key)}
              onDragOver={(e) => handleDragOver(e, c.key)}
              onDrop={(e) => handleDrop(e, c.key)}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-1 px-3 py-1.5 transition-colors cursor-default
                ${order && onOrderChange && !c.required ? 'cursor-grab active:cursor-grabbing' : ''}
                ${dragOver === c.key ? 'bg-[#4ade80]/10 border-t border-[#4ade80]/40' : 'hover:bg-white/[0.04]'}
                ${dragKey === c.key ? 'opacity-40' : ''}
              `}
            >
              {/* Checkbox */}
              <button
                disabled={c.required}
                onClick={() => toggle(c.key)}
                className="flex items-center gap-2 flex-1 min-w-0 disabled:opacity-40"
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${visible[c.key] ? 'bg-[#4ade80] border-[#4ade80]' : 'border-[#333]'}`}>
                  {visible[c.key] && <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />}
                </span>
                <span className={`text-sm truncate ${visible[c.key] ? 'text-foreground' : 'text-muted-foreground'}`}>{c.label}</span>
                {c.required && <span className="ml-auto text-[10px] text-[#333] flex-shrink-0">fijo</span>}
              </button>

              {/* Drag handle + arrows */}
              {order && onOrderChange && !c.required && (
                <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground opacity-50" />
                  <div className="flex flex-col">
                    <button onClick={() => move(c.key, -1)} disabled={idx === 0}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button onClick={() => move(c.key, 1)} disabled={idx === displayCols.length - 1}
                      className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors">
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
