import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

export default function SortTh({ colKey, label, sort, onSort, className = '', align = 'left' }) {
  const active = sort.key === colKey
  const icon = !active
    ? <ArrowUpDown className="w-3 h-3 opacity-30 flex-shrink-0" />
    : sort.dir === 'asc'
      ? <ArrowUp   className="w-3 h-3 text-[#4ade80] flex-shrink-0" />
      : <ArrowDown className="w-3 h-3 text-[#4ade80] flex-shrink-0" />

  return (
    <th
      onClick={() => onSort(colKey)}
      className={`px-3 py-2.5 text-xs font-medium cursor-pointer select-none transition-colors whitespace-nowrap
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
