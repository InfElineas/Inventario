import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Category = Database["public"]["Tables"]["categories"]["Row"];
type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];
type ProductStatus = Database["public"]["Enums"]["product_status"];

interface ProductFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryId: string | null;
  onCategoryChange: (value: string | null) => void;
  supplierId: string | null;
  onSupplierChange: (value: string | null) => void;
  status: ProductStatus | null;
  onStatusChange: (value: ProductStatus | null) => void;
  categories: Category[];
  suppliers: Supplier[];
  onClearFilters: () => void;
}

export function ProductFilters({
  searchQuery,
  onSearchChange,
  categoryId,
  onCategoryChange,
  supplierId,
  onSupplierChange,
  status,
  onStatusChange,
  categories,
  suppliers,
  onClearFilters,
}: ProductFiltersProps) {
  const hasFilters = searchQuery || categoryId || supplierId || status;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select
          value={categoryId || "all"}
          onValueChange={(val) => onCategoryChange(val === "all" ? null : val)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={supplierId || "all"}
          onValueChange={(val) => onSupplierChange(val === "all" ? null : val)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los proveedores</SelectItem>
            {suppliers.map((sup) => (
              <SelectItem key={sup.id} value={sup.id}>
                {sup.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status || "all"}
          onValueChange={(val) => onStatusChange(val === "all" ? null : val as ProductStatus)}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="discontinued">Descontinuado</SelectItem>
            <SelectItem value="out_of_stock">Sin Stock</SelectItem>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="icon" onClick={onClearFilters}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
