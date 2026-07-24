import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import AccessDenied from '@/components/shared/AccessDenied';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import SortTh from '@/components/shared/SortTh';
import { useSortable } from '@/lib/useSortable';

const TIPOS = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'stock', label: 'Stock' },
  { value: 'precio', label: 'Precio' },
  { value: 'estado_anuncio', label: 'Estado anuncio' },
  { value: 'importacion', label: 'Importación' },
];

const CAMPO_LABELS = {
  exist_fisica: 'Exist. física',
  almacen: 'Almacén',
  tienda: 'Tienda',
  precio: 'Precio venta',
  precio_costo: 'Precio costo',
  estado_anuncio: 'Estado anuncio',
  vigencia_dias: 'Vigencia días',
};

const TIPO_COLORS = {
  stock: 'bg-blue-50 text-blue-700',
  precio: 'bg-purple-50 text-purple-700',
  estado_anuncio: 'bg-orange-50 text-orange-700',
  importacion: 'bg-green-50 text-green-700',
};

const PAGE_SIZE = 20;

export default function Auditoria() {
  const { user } = useAuth();

  const [searchQ, setSearchQ] = useState('');
  const [filterTipo, setFilterTipo] = useState('all');
  const [filterUsuario, setFilterUsuario] = useState('all');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [page, setPage] = useState(1);
  const { sort, onSort } = useSortable('fecha', 'desc');

  const { data: registros = [], isLoading } = useQuery({
    queryKey: ['historial'],
    queryFn: () => base44.entities.HistorialMovimiento.list('-fecha', 2000),
    select: (d) => Array.isArray(d) ? d : [],
  });

  const usuarios = useMemo(() => {
    const set = new Set(registros.map(r => r.usuario_id).filter(Boolean));
    return Array.from(set).map(id => {
      const r = registros.find(x => x.usuario_id === id);
      return { id, nombre: r?.usuario_nombre || id };
    });
  }, [registros]);

  const filtered = useMemo(() => {
    return registros.filter(r => {
      if (filterTipo !== 'all' && r.tipo_cambio !== filterTipo) return false;
      if (filterUsuario !== 'all' && r.usuario_id !== filterUsuario) return false;
      if (fechaDesde && r.fecha && new Date(r.fecha) < new Date(fechaDesde + 'T00:00:00')) return false;
      if (fechaHasta && r.fecha && new Date(r.fecha) > new Date(fechaHasta + 'T23:59:59.999')) return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        if (
          !r.producto_nombre?.toLowerCase().includes(q) &&
          !r.producto_codigo?.toLowerCase().includes(q) &&
          !r.usuario_nombre?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [registros, filterTipo, filterUsuario, fechaDesde, fechaHasta, searchQ]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    return [...filtered].sort((a, b) => {
      const av = a[key] ?? '';
      const bv = b[key] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <ClipboardList className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-medium">Auditoría de cambios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Historial de modificaciones en productos</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <div className="flex flex-col gap-3">
          {/* Row 1: search + tipo + usuario */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQ}
                onChange={(e) => { setSearchQ(e.target.value); resetPage(); }}
                placeholder="Buscar producto o usuario..."
                className="pl-10"
                style={{ borderRadius: '8px' }}
              />
            </div>

            <Select value={filterTipo} onValueChange={(v) => { setFilterTipo(v); resetPage(); }}>
              <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterUsuario} onValueChange={(v) => { setFilterUsuario(v); resetPage(); }}>
              <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue placeholder="Todos los usuarios" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los usuarios</SelectItem>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Row 2: date range */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Desde</label>
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => { setFechaDesde(e.target.value); resetPage(); }}
                style={{ borderRadius: '8px', width: '160px' }}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">Hasta</label>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => { setFechaHasta(e.target.value); resetPage(); }}
                style={{ borderRadius: '8px', width: '160px' }}
                className="text-sm"
              />
            </div>
            {(fechaDesde || fechaHasta) && (
              <Button variant="ghost" size="sm" className="text-xs mb-0.5"
                onClick={() => { setFechaDesde(''); setFechaHasta(''); resetPage(); }}>
                Limpiar fechas
              </Button>
            )}
            {(searchQ || filterTipo !== 'all' || filterUsuario !== 'all' || fechaDesde || fechaHasta) && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground">{sorted.length} resultado{sorted.length !== 1 ? 's' : ''}</span>
                <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => {
                  setSearchQ(''); setFilterTipo('all'); setFilterUsuario('all');
                  setFechaDesde(''); setFechaHasta(''); resetPage();
                }}>Limpiar todo</Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/40">
                <SortTh colKey="fecha" label="Fecha y hora" sort={sort} onSort={onSort} />
                <SortTh colKey="usuario_nombre" label="Usuario" sort={sort} onSort={onSort} />
                <SortTh colKey="producto_nombre" label="Producto" sort={sort} onSort={onSort} />
                <SortTh colKey="tipo_cambio" label="Tipo" sort={sort} onSort={onSort} />
                <SortTh colKey="campo" label="Campo" sort={sort} onSort={onSort} />
                <SortTh colKey="valor_anterior" label="Valor anterior" sort={sort} onSort={onSort} align="right" />
                <SortTh colKey="valor_nuevo" label="Valor nuevo" sort={sort} onSort={onSort} align="right" />
                <SortTh colKey="origen" label="Origen" sort={sort} onSort={onSort} align="center" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="p-10 text-center text-muted-foreground text-sm">Cargando...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={8} className="p-10 text-center text-muted-foreground text-sm">Sin registros</td></tr>
              ) : paginated.map((r, i) => (
                <tr key={r.id || i} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                    {r.fecha ? format(new Date(r.fecha), 'dd/MM/yyyy HH:mm') : '—'}
                  </td>
                  <td className="p-3">
                    <p className="text-xs font-medium">{r.usuario_nombre || '—'}</p>
                    <p className="text-[10px] text-muted-foreground">{r.usuario_id}</p>
                  </td>
                  <td className="p-3">
                    <p className="text-xs font-medium">{r.producto_nombre || '—'}</p>
                    <p className="text-[10px] text-muted-foreground">{r.producto_codigo}</p>
                  </td>
                  <td className="p-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${TIPO_COLORS[r.tipo_cambio] || 'bg-secondary text-secondary-foreground'}`}
                      style={{ borderRadius: '4px' }}>
                      {r.tipo_cambio || '—'}
                    </span>
                  </td>
                  <td className="p-3 text-xs">{CAMPO_LABELS[r.campo] || r.campo || '—'}</td>
                  <td className="p-3 text-right text-xs text-muted-foreground">{r.valor_anterior ?? '—'}</td>
                  <td className="p-3 text-right text-xs font-medium">{r.valor_nuevo ?? '—'}</td>
                  <td className="p-3 text-center">
                    <span className={`text-[10px] px-2 py-0.5 rounded ${r.origen === 'importacion' ? 'bg-green-50 text-green-700' : 'bg-secondary text-muted-foreground'}`}
                      style={{ borderRadius: '4px' }}>
                      {r.origen || 'manual'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-secondary/20">
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages} · {sorted.length} registros
            </p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2;
                if (p < 1 || p > totalPages) return null;
                return (
                  <Button key={p} variant={p === page ? 'default' : 'outline'} size="icon"
                    className="h-7 w-7 text-xs" onClick={() => setPage(p)}>
                    {p}
                  </Button>
                );
              })}
              <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}