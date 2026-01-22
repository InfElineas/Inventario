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
import type { CategoryWithParent } from "@/hooks/useCategories";

interface DeleteCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryWithParent | null;
  onSuccess: () => void;
}

export function DeleteCategoryDialog({
  open,
  onOpenChange,
  category,
  onSuccess,
}: DeleteCategoryDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const hasChildren = category?.children_count && category.children_count > 0;

  const handleDelete = async () => {
    if (!category) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", category.id);

      if (error) throw error;

      toast.success("Categoría eliminada correctamente");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error deleting category:", error);
      if (error.code === "23503") {
        toast.error("No se puede eliminar: la categoría tiene productos asociados");
      } else {
        toast.error("Error al eliminar la categoría");
      }
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
              <AlertDialogTitle>Eliminar Categoría</AlertDialogTitle>
              <AlertDialogDescription>
                ¿Estás seguro de que deseas eliminar esta categoría?
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {category && (
          <div className="rounded-lg bg-muted p-4">
            <p className="font-medium">{category.name}</p>
            {category.description && (
              <p className="text-sm text-muted-foreground">{category.description}</p>
            )}
          </div>
        )}

        {hasChildren && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Advertencia:</strong> Esta categoría tiene {category?.children_count}{" "}
              subcategoría(s). Si la eliminas, las subcategorías quedarán sin padre.
            </p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Esta acción no se puede deshacer. Los productos asociados perderán esta categoría.
        </p>

        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Eliminar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
