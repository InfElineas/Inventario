import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Paginación simple.
 * @param {number} page     - Página actual (1-indexed)
 * @param {number} total    - Total de items
 * @param {number} pageSize - Items por página
 * @param {Function} onPage - (newPage) => void
 */
export default function Pagination({ page, total, pageSize, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null

  const from  = (page - 1) * pageSize + 1
  const to    = Math.min(page * pageSize, total)

  // Ventana de páginas a mostrar
  const WINDOW = 2
  const start  = Math.max(1, page - WINDOW)
  const end    = Math.min(pages, page + WINDOW)
  const nums   = []
  for (let i = start; i <= end; i++) nums.push(i)

  const btnCls = (isActive) =>
    `min-w-[32px] h-8 px-2 rounded-md text-xs font-medium transition-colors ${
      isActive
        ? 'bg-[#4ade80]/15 text-[#4ade80] border border-[#4ade80]/30'
        : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-default'
    }`

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-t border-border justify-between">
      <span className="text-xs text-muted-foreground">
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-0.5">
        {/* Prev — clave string explícita para evitar key=[object Object] */}
        <button key="prev" onClick={() => onPage(page - 1)} disabled={page <= 1} className={btnCls(false)}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        {start > 1 && (
          <>
            <button key="first" onClick={() => onPage(1)} className={btnCls(false)}>1</button>
            {start > 2 && <span key="ellipsis-l" className="text-muted-foreground text-xs px-1">…</span>}
          </>
        )}

        {nums.map(n => (
          <button key={n} onClick={() => onPage(n)} className={btnCls(n === page)}>{n}</button>
        ))}

        {end < pages && (
          <>
            {end < pages - 1 && <span key="ellipsis-r" className="text-muted-foreground text-xs px-1">…</span>}
            <button key="last" onClick={() => onPage(pages)} className={btnCls(false)}>{pages}</button>
          </>
        )}

        {/* Next */}
        <button key="next" onClick={() => onPage(page + 1)} disabled={page >= pages} className={btnCls(false)}>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
