import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export default function SortTh({ colKey, label, sort, onSort, className: classNameRaw, align: alignRaw }) {
  const className = classNameRaw ?? ''
  const align = alignRaw ?? 'left'
  const active = sort.key === colKey
  const icon = !active
    ? <ArrowUpDown className="w-3 h-3 opacity-30 shrink-0" />
    : sort.dir === 'asc'
      ? <ArrowUp   className="w-3 h-3 text-[var(--c-ok)] shrink-0" />
      : <ArrowDown className="w-3 h-3 text-[var(--c-ok)] shrink-0" />

  return (
    <th
      onClick={() => onSort(colKey)}
      className={`px-2.5 py-1.5 text-xs font-medium cursor-pointer select-none transition-colors whitespace-nowrap
        ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'} ${className}`}
    >
      <span className={`inline-flex items-center gap-1.5
        ${align === 'right'  ? 'flex-row-reverse w-full justify-start' :
          align === 'center' ? 'justify-center' : ''}`}>
        {label}{icon}
      </span>
    </th>
  )
}
