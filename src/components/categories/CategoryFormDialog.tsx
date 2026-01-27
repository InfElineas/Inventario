import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCategoryOptions, type CategoryWithParent } from "@/hooks/useCategories";

const categorySchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  parent_id: z.string().optional(),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryWithParent | null;
  orgId: string;
  defaultParentId?: string | null;
  onSuccess: () => void;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  orgId,
  defaultParentId,
  onSuccess,
}: CategoryFormDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const isEditing = !!category;

  // Exclude current category from parent options to prevent circular references
  const { options: parentOptions } = useCategoryOptions(orgId, category?.id);

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema),
    defaultValues: {
      name: "",
      description: "",
      parent_id: "",
    },
  });

  // Reset form when category changes
  useEffect(() => {
    if (category) {
      form.reset({
        name: category.name,
        description: category.description || "",
        parent_id: category.parent_id || "",
      });
    } else {
      form.reset({
        name: "",
        description: "",
        parent_id: defaultParentId || "",
      });
    }
  }, [category, defaultParentId, form]);

  const onSubmit = async (data: CategoryFormData) => {
    setSubmitting(true);

    try {
      const categoryData = {
        name: data.name,
        description: data.description || null,
        parent_id: data.parent_id || null,
        org_id: orgId,
      };

      if (isEditing && category) {
        const { error } = await supabase
          .from("categories")
          .update(categoryData)
          .eq("id", category.id);

        if (error) throw error;
        toast.success("Categoría actualizada correctamente");
      } else {
        const { error } = await supabase.from("categories").insert(categoryData);

        if (error) throw error;
        toast.success("Categoría creada correctamente");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving category:", error);
      toast.error("Error al guardar la categoría");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Categoría" : "Nueva Categoría"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica la información de la categoría."
              : "Crea una nueva categoría para organizar tus productos."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre de la categoría" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descripción de la categoría..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="parent_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Categoría Padre</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría padre" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">Sin categoría padre (Raíz)</SelectItem>
                      {parentOptions.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Guardar Cambios" : "Crear Categoría"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
