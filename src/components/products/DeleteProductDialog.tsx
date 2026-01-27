import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ProductWithRelations } from "@/hooks/useProducts";

interface DeleteProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductWithRelations | null;
  onSuccess: () => void;
}

export function DeleteProductDialog({
  open,
  onOpenChange,
  product,
  onSuccess,
}: DeleteProductDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!product) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", product.id);

      if (error) throw error;

      toast.success("Producto eliminado correctamente");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("Error al eliminar el producto. Puede que tenga inventario asociado.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <AlertDialogTitle>Eliminar Producto</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro de que deseas eliminar este producto?
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {product && (
          <div className="rounded-lg bg-muted p-4">
            <p className="font-medium">{product.name}</p>
            <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Esta acción no se puede deshacer. Se eliminarán todos los datos asociados
          al producto, incluyendo historial de movimientos.
        </p>

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Eliminar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
