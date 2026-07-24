import { useState, useMemo } from 'react'
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react'

/**
 * Panel de filtros avanzados para el catálogo de productos.
 * Recibe la lista completa de productos para construir los filtros dinámicamente.
 *
 * @param {object[]} productos  - Array de todos los productos
 * @param {object}   filters    - Estado actual de filtros
 * @param {Function} onChange   - (newFilters) => void
 */
export default function ProductFilters({ productos, filters, onChange }) {
  const [open, setOpen] = useState(false)

  // Listas únicas de valores para cada filtro
  const opciones = useMemo(() => {
    const suministradores = new Set()
    const categorias      = new Set()
    for (const p of productos) {
      if (p.suministrador) suministradores.add(p.suministrador)
      if (p.categoria_elineas) categorias.add(p.categoria_elineas)
    }
    return {
      suministradores: [...suministradores].sort(),
      categorias:      [...categorias].sort(),
    }
  }, [productos])

  const activeCount = Object.values(filters).filter(v => v && v !== 'all').length

  const set = (key, val) => onChange({ ...filters, [key]: val })
  const reset = () => onChange({
    existencia: 'all', suministrador: '', categoria: '', estadoTienda: 'all',
    precioMin: '', precioMax: '',
  })

  return (
    <div className="space-y-2">
      {/* Toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors
          ${activeCount > 0
            ? 'bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]'
            : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-[#4ade80]/30'
          }`}
      >
        <SlidersHorizontal className="w-4 h-4" />
        Filtros avanzados
        {activeCount > 0 && (
          <span className="bg-[#4ade80] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">{activeCount}</span>
        )}
        {open ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
      </button>

      {/* Panel expandible */}
      {open && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">

            {/* Existencia */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Existencia</label>
              <select
                value={filters.existencia}
                onChange={e => set('existencia', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50"
              >
                <option value="all">Todos</option>
                <option value="con_ef">Con existencia (EF &gt; 0)</option>
                <option value="sin_ef">Sin existencia (EF = 0)</option>
                <option value="critico">Bajo stock (EF &lt; 5)</option>
              </select>
            </div>

            {/* Estado Tienda */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Estado Tienda</label>
              <select
                value={filters.estadoTienda}
                onChange={e => set('estadoTienda', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50"
              >
                <option value="all">Todos</option>
                <option value="SIN RESERVA">Sin Reserva (urgente)</option>
                <option value="NO TIENDA">No Tienda</option>
                <option value="ULTIMAS PIEZAS">Últimas Piezas</option>
                <option value="PROXIMO">Próximo</option>
                <option value="DISPONIBLE">Disponible</option>
                <option value="AGOTADO">Agotado</option>
                <option value="SIN ID">Sin ID TKC</option>
              </select>
            </div>

            {/* Suministrador */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Suministrador</label>
              <select
                value={filters.suministrador}
                onChange={e => set('suministrador', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50"
              >
                <option value="">Todos</option>
                {opciones.suministradores.map(s => (
                  <option key={s} value={s}>{s.replace('SEL ', '')}</option>
                ))}
              </select>
            </div>

            {/* Categoría */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Categoría</label>
              <select
                value={filters.categoria}
                onChange={e => set('categoria', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50"
              >
                <option value="">Todas</option>
                {opciones.categorias.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Rango de precio */}
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Precio ($)</label>
              <div className="flex items-center gap-1">
                <input
                  type="number" min="0" placeholder="Min"
                  value={filters.precioMin}
                  onChange={e => set('precioMin', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50"
                />
                <span className="text-muted-foreground text-xs flex-shrink-0">–</span>
                <input
                  type="number" min="0" placeholder="Max"
                  value={filters.precioMax}
                  onChange={e => set('precioMax', e.target.value)}
                  className="w-full px-2 py-1.5 text-xs rounded-lg bg-background border border-border text-foreground focus:outline-none focus:ring-1 focus:ring-[#4ade80]/50"
                />
              </div>
            </div>
          </div>

          {/* Tags de filtros activos + reset */}
          {activeCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Filtros activos:</span>
              {filters.existencia !== 'all' && (
                <Tag label={`Existencia: ${filters.existencia}`} onRemove={() => set('existencia', 'all')} />
              )}
              {filters.estadoTienda !== 'all' && (
                <Tag label={`Estado: ${filters.estadoTienda}`} onRemove={() => set('estadoTienda', 'all')} />
              )}
              {filters.suministrador && (
                <Tag label={`Suminst: ${filters.suministrador.replace('SEL ','')}`} onRemove={() => set('suministrador', '')} />
              )}
              {filters.categoria && (
                <Tag label={`Cat: ${filters.categoria}`} onRemove={() => set('categoria', '')} />
              )}
              {(filters.precioMin || filters.precioMax) && (
                <Tag label={`Precio: $${filters.precioMin||0}–$${filters.precioMax||'∞'}`} onRemove={() => { set('precioMin',''); set('precioMax','') }} />
              )}
              <button onClick={reset} className="ml-auto text-xs text-[#e24b4a] hover:underline">
                Limpiar todo
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Tag({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#4ade80]/10 text-[#4ade80] border border-[#4ade80]/20">
      {label}
      <button onClick={onRemove} className="hover:text-white transition-colors">
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  )
}
