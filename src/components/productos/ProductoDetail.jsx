import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ReadOnlyBlock, { ReadOnlyField } from '@/components/shared/ReadOnlyBlock';
import ProductoHistorial from '@/components/productos/ProductoHistorial';

// Se usa siempre dentro de ProductoModal (Dialog) — ver ese archivo.
export default function ProductoDetail({ producto, role, onUpdate }) {
  const canEdit = role === 'administrador' || role === 'ca' || role === 'supervisor';
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    exist_fisica: producto.exist_fisica ?? 0,
    almacen: producto.almacen ?? 0,
    tienda: producto.tienda ?? 0,
    precio: producto.precio ?? '',
    precio_costo: producto.precio_costo ?? '',
    estado_anuncio: producto.estado_anuncio || 'DESACTIVADO',
    vigencia_dias: producto.vigencia_dias ?? '',
    stock_minimo: producto.stock_minimo ?? 0,
  });

  const handleSave = () => {
    // precio/precio_costo vacíos deben quedar en null, no forzarse a 0
    const numOrNull = (v) => (v === '' || v === null || v === undefined) ? null : Number(v);
    onUpdate({
      exist_fisica: Math.max(0, Number(form.exist_fisica) || 0),
      almacen: Math.max(0, Number(form.almacen) || 0),
      tienda: Math.max(0, Number(form.tienda) || 0),
      precio: numOrNull(form.precio),
      precio_costo: numOrNull(form.precio_costo),
      estado_anuncio: form.estado_anuncio,
      vigencia_dias: form.vigencia_dias ? Number(form.vigencia_dias) : null,
      stock_minimo: form.stock_minimo !== '' ? Number(form.stock_minimo) : 0,
    });
  };

  return (
    <div className="p-5 space-y-4">
      {canEdit && !editMode && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setEditMode(true)} style={{ borderRadius: '8px' }}>Editar</Button>
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList className="w-full" style={{ borderRadius: '8px' }}>
          <TabsTrigger value="info" className="flex-1 text-xs">Información</TabsTrigger>
          <TabsTrigger value="historial" className="flex-1 text-xs">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-4 mt-3">
          <ReadOnlyBlock title="Identificación">
            <ReadOnlyField label="Nombre" value={producto.nombre} />
            <ReadOnlyField label="Código" value={producto.codigo_producto} />
            <ReadOnlyField label="ID Tienda" value={producto.id_tienda} />
            <ReadOnlyField label="Suministrador" value={producto.suministrador} />
            <ReadOnlyField label="Categoría" value={producto.categoria_elineas} />
            <ReadOnlyField label="Unidad" value={producto.unidad} />
          </ReadOnlyBlock>

          {!editMode ? (
            <>
              <ReadOnlyBlock title="Stock">
                <ReadOnlyField label="Exist. física" value={producto.exist_fisica ?? 0} />
                <ReadOnlyField label="Almacén" value={producto.almacen ?? 0} />
                <ReadOnlyField label="Tienda" value={producto.tienda ?? 0} />
                <ReadOnlyField label="Stock mínimo" value={producto.stock_minimo ?? 0} />
              </ReadOnlyBlock>
              <ReadOnlyBlock title="Precios y estado">
                <ReadOnlyField label="Precio venta" value={producto.precio ? `$${producto.precio}` : '—'} />
                <ReadOnlyField label="Precio costo" value={producto.precio_costo ? `$${producto.precio_costo}` : '—'} />
                <ReadOnlyField label="Estado anuncio" value={producto.estado_anuncio} />
                <ReadOnlyField label="Vigencia (días)" value={producto.vigencia_dias} />
              </ReadOnlyBlock>
            </>
          ) : (
            <div className="space-y-3 p-4 border rounded-lg" style={{ borderRadius: '8px', borderWidth: '0.5px' }}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Editar datos</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Exist. física</label>
                  <Input type="number" min="0" value={form.exist_fisica}
                    onChange={(e) => setForm({ ...form, exist_fisica: e.target.value })} style={{ borderRadius: '8px' }} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Almacén</label>
                  <Input type="number" min="0" value={form.almacen}
                    onChange={(e) => setForm({ ...form, almacen: e.target.value })} style={{ borderRadius: '8px' }} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Tienda</label>
                  <Input type="number" min="0" value={form.tienda}
                    onChange={(e) => setForm({ ...form, tienda: e.target.value })} style={{ borderRadius: '8px' }} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Vigencia días</label>
                  <Input type="number" value={form.vigencia_dias}
                    onChange={(e) => setForm({ ...form, vigencia_dias: e.target.value })} style={{ borderRadius: '8px' }} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Stock mínimo</label>
                  <Input type="number" min="0" value={form.stock_minimo}
                    onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} style={{ borderRadius: '8px' }} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Precio venta</label>
                  <Input type="number" value={form.precio}
                    onChange={(e) => setForm({ ...form, precio: e.target.value })} style={{ borderRadius: '8px' }} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Precio costo</label>
                  <Input type="number" value={form.precio_costo}
                    onChange={(e) => setForm({ ...form, precio_costo: e.target.value })} style={{ borderRadius: '8px' }} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Estado anuncio</label>
                <Select value={form.estado_anuncio} onValueChange={(v) => setForm({ ...form, estado_anuncio: v })}>
                  <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVADO">ACTIVADO</SelectItem>
                    <SelectItem value="DESACTIVADO">DESACTIVADO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={handleSave} style={{ borderRadius: '8px' }}>Guardar</Button>
                <Button size="sm" variant="outline" onClick={() => setEditMode(false)} style={{ borderRadius: '8px' }}>Cancelar</Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="historial" className="mt-3">
          <ProductoHistorial productoId={producto.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}