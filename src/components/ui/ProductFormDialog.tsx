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
  FormDescription,
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
import { useCategories, useSuppliers, type ProductWithRelations } from "@/hooks/useProducts";
import type { Database } from "@/integrations/supabase/types";

type ProductStatus = Database["public"]["Enums"]["product_status"];

const productSchema = z.object({
  sku: z.string().min(1, "El SKU es requerido"),
  name: z.string().min(1, "El nombre es requerido"),
  description: z.string().optional(),
  category_id: z.string().optional(),
  supplier_id: z.string().optional(),
  unit: z.string().default("unit"),
  min_stock: z.coerce.number().min(0).default(0),
  max_stock: z.coerce.number().min(0).optional(),
  cost_price: z.coerce.number().min(0).optional(),
  sale_price: z.coerce.number().min(0).optional(),
  status: z.enum(["active", "discontinued", "out_of_stock"] as const).default("active"),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: ProductWithRelations | null;
  orgId: string;
  onSuccess: () => void;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  orgId,
  onSuccess,
}: ProductFormDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const isEditing = !!product;
  
  const { categories } = useCategories(orgId);
  const { suppliers } = useSuppliers(orgId);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      sku: "",
      name: "",
      description: "",
      category_id: "",
      supplier_id: "",
      unit: "unit",
      min_stock: 0,
      max_stock: undefined,
      cost_price: undefined,
      sale_price: undefined,
      status: "active",
    },
  });

  // Reset form when product changes
  useEffect(() => {
    if (product) {
      form.reset({
        sku: product.sku,
        name: product.name,
        description: product.description || "",
        category_id: product.category_id || "",
        supplier_id: product.supplier_id || "",
        unit: product.unit || "unit",
        min_stock: product.min_stock ?? 0,
        max_stock: product.max_stock ?? undefined,
        cost_price: product.cost_price ?? undefined,
        sale_price: product.sale_price ?? undefined,
        status: product.status,
      });
    } else {
      form.reset({
        sku: "",
        name: "",
        description: "",
        category_id: "",
        supplier_id: "",
        unit: "unit",
        min_stock: 0,
        max_stock: undefined,
        cost_price: undefined,
        sale_price: undefined,
        status: "active",
      });
    }
  }, [product, form]);

  const onSubmit = async (data: ProductFormData) => {
    setSubmitting(true);
    
    try {
      const productData = {
        sku: data.sku,
        name: data.name,
        description: data.description || null,
        category_id: data.category_id || null,
        supplier_id: data.supplier_id || null,
        unit: data.unit,
        min_stock: data.min_stock,
        max_stock: data.max_stock ?? null,
        cost_price: data.cost_price ?? null,
        sale_price: data.sale_price ?? null,
        status: data.status as ProductStatus,
        org_id: orgId,
      };

      if (isEditing && product) {
        const { error } = await supabase
          .from("products")
          .update(productData)
          .eq("id", product.id);

        if (error) throw error;
        toast.success("Producto actualizado correctamente");
      } else {
        const { error } = await supabase
          .from("products")
          .insert(productData);

        if (error) {
          if (error.code === "23505") {
            toast.error("Ya existe un producto con este SKU");
            return;
          }
          throw error;
        }
        toast.success("Producto creado correctamente");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving product:", error);
      toast.error("Error al guardar el producto");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Producto" : "Nuevo Producto"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Modifica la información del producto."
              : "Añade un nuevo producto a tu catálogo."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU *</FormLabel>
                    <FormControl>
                      <Input placeholder="PROD-001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar estado" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Activo</SelectItem>
                        <SelectItem value="discontinued">Descontinuado</SelectItem>
                        <SelectItem value="out_of_stock">Sin Stock</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del producto" {...field} />
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
                      placeholder="Descripción del producto..."
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Sin categoría</SelectItem>
                        {categories.map((cat) => (
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

              <FormField
                control={form.control}
                name="supplier_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proveedor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar proveedor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">Sin proveedor</SelectItem>
                        {suppliers.map((sup) => (
                          <SelectItem key={sup.id} value={sup.id}>
                            {sup.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidad</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="unit">Unidad</SelectItem>
                        <SelectItem value="kg">Kilogramo</SelectItem>
                        <SelectItem value="lt">Litro</SelectItem>
                        <SelectItem value="m">Metro</SelectItem>
                        <SelectItem value="box">Caja</SelectItem>
                        <SelectItem value="pack">Paquete</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="min_stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Mínimo</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="max_stock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Máximo</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        placeholder="Sin límite"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cost_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio Costo</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>Precio de compra</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sale_price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio Venta</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>Precio de venta al público</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                {isEditing ? "Guardar Cambios" : "Crear Producto"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
