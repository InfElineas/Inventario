import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ProductoDetail from './ProductoDetail'

/**
 * Wrapper de ProductoDetail en un Dialog modal.
 * Usar en lugar del panel lateral para mejor UX.
 */
export default function ProductoModal({ producto, role, open, onClose, onUpdate }) {
  if (!producto) return null

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl w-full p-0 gap-0 overflow-hidden bg-card border-border">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="text-sm font-medium text-foreground">
            {producto.nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[80vh]">
          <ProductoDetail
            producto={producto}
            role={role}
            onUpdate={(data) => { onUpdate(data); onClose() }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
