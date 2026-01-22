import { format } from "date-fns";
import { es } from "date-fns/locale";
import { MoreHorizontal, Pencil, Trash2, Eye, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductWithRelations } from "@/hooks/useProducts";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  active: { label: "Activo", variant: "default" },
  discontinued: { label: "Descontinuado", variant: "secondary" },
  out_of_stock: { label: "Sin Stock", variant: "destructive" },
};

interface ProductsTableProps {
  products: ProductWithRelations[];
  canManage: boolean;
  onEdit: (product: ProductWithRelations) => void;
  onDelete: (product: ProductWithRelations) => void;
  onView: (product: ProductWithRelations) => void;
}

export function ProductsTable({
  products,
  canManage,
  onEdit,
  onDelete,
  onView,
}: ProductsTableProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12">
        <div className="empty-state">
          <Package className="empty-state-icon h-12 w-12" />
          <h3 className="empty-state-title">No hay productos</h3>
          <p className="empty-state-description">
            Añade tu primer producto para comenzar a gestionar tu inventario.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>SKU</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Proveedor</TableHead>
            <TableHead className="text-right">Precio Venta</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Fecha Creación</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const statusInfo = statusConfig[product.status] || statusConfig.active;
            
            return (
              <TableRow key={product.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-sm">{product.sku}</TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{product.name}</p>
                    {product.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {product.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {product.categories?.name || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {product.suppliers?.name || (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {product.sale_price != null
                    ? `$${Number(product.sale_price).toFixed(2)}`
                    : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(product.created_at), "dd MMM yyyy", { locale: es })}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onView(product)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Ver Detalles
                      </DropdownMenuItem>
                      {canManage && (
                        <>
                          <DropdownMenuItem onClick={() => onEdit(product)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => onDelete(product)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
