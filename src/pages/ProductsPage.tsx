import { useState } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { useUserRole, hasPermission } from "@/hooks/useUserRole";
import { useProducts, useCategories, useSuppliers, type ProductWithRelations } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProductsTable } from "@/components/products/ProductsTable";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { DeleteProductDialog } from "@/components/products/DeleteProductDialog";
import { ProductDetailDialog } from "@/components/products/ProductDetailDialog";
import type { Database } from "@/integrations/supabase/types";

type ProductStatus = Database["public"]["Enums"]["product_status"];
import { ProductFilters } from "@/components/products/ProductFilters";
import { ProductsPagination } from "@/components/products/ProductsPagination";
import { Plus, Package, Tag, TrendingUp, Loader2 } from "lucide-react";

const PAGE_SIZE = 10;

export default function ProductsPage() {
  const { user } = useOrganization();
  const { orgId, permissions, loading: roleLoading } = useUserRole(user?.id);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProductStatus | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Dialogs state
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithRelations | null>(null);

  // Permissions
  const canManage = hasPermission(permissions, "products.update") || hasPermission(permissions, "products.delete");
  const canCreate = hasPermission(permissions, "products.create");

  // Data fetching
  const { categories } = useCategories(orgId);
  const { suppliers } = useSuppliers(orgId);
  const { products, loading, totalCount, totalPages, refetch } = useProducts({
    orgId,
    page: currentPage,
    pageSize: PAGE_SIZE,
    searchQuery,
    categoryId,
    supplierId,
    status,
  });

  // Reset page when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleCategoryChange = (value: string | null) => {
    setCategoryId(value);
    setCurrentPage(1);
  };

  const handleSupplierChange = (value: string | null) => {
    setSupplierId(value);
    setCurrentPage(1);
  };

  const handleStatusChange = (value: ProductStatus | null) => {
    setStatus(value);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setCategoryId(null);
    setSupplierId(null);
    setStatus(null);
    setCurrentPage(1);
  };

  // Actions
  const handleEdit = (product: ProductWithRelations) => {
    setSelectedProduct(product);
    setFormDialogOpen(true);
  };

  const handleDelete = (product: ProductWithRelations) => {
    setSelectedProduct(product);
    setDeleteDialogOpen(true);
  };

  const handleView = (product: ProductWithRelations) => {
    setSelectedProduct(product);
    setDetailDialogOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setFormDialogOpen(open);
    if (!open) setSelectedProduct(null);
  };

  // Stats
  const activeProducts = products.filter((p) => p.status === "active").length;
  const uniqueCategories = new Set(products.map((p) => p.category_id).filter(Boolean)).size;

  if (roleLoading) {
    return (
      <div className="page-container flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Productos</h2>
          <p className="page-description">Gestiona tu catálogo de productos</p>
        </div>
        {canCreate && (
          <Button onClick={() => setFormDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Producto
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="stats-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalCount}</p>
                <p className="text-sm text-muted-foreground">Productos Totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stats-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/10">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeProducts}</p>
                <p className="text-sm text-muted-foreground">Productos Activos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stats-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent/50">
                <Tag className="h-6 w-6 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{uniqueCategories}</p>
                <p className="text-sm text-muted-foreground">Categorías en Uso</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <ProductFilters
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          categoryId={categoryId}
          onCategoryChange={handleCategoryChange}
          supplierId={supplierId}
          onSupplierChange={handleSupplierChange}
          status={status}
          onStatusChange={handleStatusChange}
          categories={categories}
          suppliers={suppliers}
          onClearFilters={handleClearFilters}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <ProductsTable
            products={products}
            canManage={canManage}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onView={handleView}
          />
          <ProductsPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
          />
        </>
      )}

      {/* Dialogs */}
      <ProductFormDialog
        open={formDialogOpen}
        onOpenChange={handleFormClose}
        product={selectedProduct}
        orgId={orgId || ""}
        onSuccess={refetch}
      />

      <DeleteProductDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        product={selectedProduct}
        onSuccess={refetch}
      />

      <ProductDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        product={selectedProduct}
      />
    </div>
  );
}
