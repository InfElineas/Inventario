import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, ShoppingCart, Download, AlertTriangle } from 'lucide-react';

export default function OrdenReabastecimiento({ onClose }) {
  const [cantidades, setCantidades] = useState({});

  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['productos'],
    queryFn: () => base44.entities.Producto.list('-updated_date', 500),
  });

  // Products below minimum stock
  const bajoMinimo = productos.filter(p =>
    p.activo !== false &&
    (p.stock_minimo || 0) > 0 &&
    (p.exist_fisica || 0) < (p.stock_minimo || 0)
  );

  const handleCantidadChange = (id, val) => {
    setCantidades(prev => ({ ...prev, [id]: val }));
  };

  const getCantidadSugerida = (p) => (p.stock_minimo || 0) - (p.exist_fisica || 0);

  const handleExportar = () => {
    const filas = bajoMinimo.map(p => {
      const cant = cantidades[p.id] ?? getCantidadSugerida(p);
      return [p.codigo_producto, p.nombre, p.suministrador || '—', p.exist_fisica ?? 0, p.stock_minimo ?? 0, cant];
    });

    const cabecera = ['Código', 'Nombre', 'Suministrador', 'Stock actual', 'Stock mínimo', 'Cantidad a pedir'];
    const csv = [cabecera, ...filas].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orden_reabastecimiento_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-6 space-y-5" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-[#E24B4A]" />
          <h3 className="text-sm font-medium">Orden de Reabastecimiento</h3>
          <span className="text-[11px] bg-[#E24B4A]/10 text-[#E24B4A] px-2 py-0.5 rounded font-medium">
            {bajoMinimo.length} producto{bajoMinimo.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Cargando...</p>
      ) : bajoMinimo.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay productos bajo el stock mínimo.</p>
          <p className="text-xs mt-1">Configura el stock mínimo en el detalle de cada producto.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border" style={{ borderWidth: '0.5px' }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-secondary/40">
                  <th className="text-left p-3 text-xs font-medium text-muted-foreground">Producto</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Stock actual</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Mínimo</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">Déficit</th>
                  <th className="text-right p-3 text-xs font-medium text-muted-foreground">A pedir</th>
                </tr>
              </thead>
              <tbody>
                {bajoMinimo.map(p => {
                  const sugerida = getCantidadSugerida(p);
                  return (
                    <tr key={p.id} className="border-b last:border-0 bg-[#E24B4A]/[0.03]">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#E24B4A] flex-shrink-0" />
                          <div>
                            <p className="font-medium text-xs">{p.nombre}</p>
                            <p className="text-[11px] text-muted-foreground">{p.codigo_producto} · {p.suministrador || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right font-medium text-[#E24B4A]">{p.exist_fisica ?? 0}</td>
                      <td className="p-3 text-right text-muted-foreground">{p.stock_minimo}</td>
                      <td className="p-3 text-right font-medium text-[#BA7517]">-{sugerida}</td>
                      <td className="p-3 text-right">
                        <Input
                          type="number"
                          min="1"
                          className="w-20 text-right h-7 text-xs"
                          value={cantidades[p.id] ?? sugerida}
                          onChange={(e) => handleCantidadChange(p.id, e.target.value)}
                          style={{ borderRadius: '6px' }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} style={{ borderRadius: '8px' }}>Cerrar</Button>
            <Button onClick={handleExportar} style={{ borderRadius: '8px' }}>
              <Download className="w-4 h-4 mr-1.5" /> Exportar orden CSV
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}