import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Package, Tag, Truck, Calendar, DollarSign, Layers } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { ProductWithRelations } from "@/hooks/useProducts";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Activo", variant: "default" },
  discontinued: { label: "Descontinuado", variant: "secondary" },
  out_of_stock: { label: "Sin Stock", variant: "destructive" },
};

const unitLabels: Record<string, string> = {
  unit: "Unidad",
  kg: "Kilogramo",
  lt: "Litro",
  m: "Metro",
  box: "Caja",
  pack: "Paquete",
};

interface ProductDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithRelations | null;
}

export function ProductDetailDialog({
  open,
  onOpenChange,
  product,
}: ProductDetailDialogProps) {
  if (!product) return null;

  const statusInfo = statusConfig[product.status] || statusConfig.active;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">{product.name}</DialogTitle>
                <p className="text-sm text-muted-foreground font-mono">{product.sku}</p>
              </div>
            </div>
            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          </div>
        </DialogHeader>

        {product.description && (
          <p className="text-sm text-muted-foreground">{product.description}</p>
        )}

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Tag className="h-4 w-4" />
              <span className="text-sm">Categoría</span>
            </div>
            <p className="font-medium">{product.categories?.name || "Sin categoría"}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Truck className="h-4 w-4" />
              <span className="text-sm">Proveedor</span>
            </div>
            <p className="font-medium">{product.suppliers?.name || "Sin proveedor"}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Layers className="h-4 w-4" />
              <span className="text-sm">Unidad</span>
            </div>
            <p className="font-medium">{unitLabels[product.unit || "unit"]}</p>
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span className="text-sm">Creado</span>
            </div>
            <p className="font-medium">
              {format(new Date(product.created_at), "dd MMM yyyy", { locale: es })}
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="font-medium flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Precios y Stock
          </h4>

          <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-4">
            <div>
              <p className="text-sm text-muted-foreground">Precio Costo</p>
              <p className="text-lg font-semibold">
                {product.cost_price != null
                  ? `$${Number(product.cost_price).toFixed(2)}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Precio Venta</p>
              <p className="text-lg font-semibold text-primary">
                {product.sale_price != null
                  ? `$${Number(product.sale_price).toFixed(2)}`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stock Mínimo</p>
              <p className="text-lg font-semibold">{product.min_stock ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stock Máximo</p>
              <p className="text-lg font-semibold">
                {product.max_stock ?? "Sin límite"}
              </p>
            </div>
          </div>
        </div>

        {product.cost_price != null && product.sale_price != null && (
          <div className="rounded-lg border border-border p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Margen de Ganancia</span>
              <span className="text-lg font-bold text-green-600">
                {(
                  ((Number(product.sale_price) - Number(product.cost_price)) /
                    Number(product.cost_price)) *
                  100
                ).toFixed(1)}
                %
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
