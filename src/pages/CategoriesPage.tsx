import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useUserRole, hasPermission } from "@/hooks/useUserRole";
import { useCategories, type CategoryWithParent } from "@/hooks/useCategories";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CategoriesTable } from "@/components/categories/CategoriesTable";
import { CategoryFormDialog } from "@/components/categories/CategoryFormDialog";
import { DeleteCategoryDialog } from "@/components/categories/DeleteCategoryDialog";
import { CategoryBreadcrumb } from "@/components/categories/CategoryBreadcrumb";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Plus, FolderTree, Search, Layers, Loader2 } from "lucide-react";

const PAGE_SIZE = 10;

export default function CategoriesPage() {
  const { user } = useOrganization();
  const { orgId, permissions, loading: roleLoading } = useUserRole(user?.id);

  // Navigation state for hierarchy
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [breadcrumbPath, setBreadcrumbPath] = useState<CategoryWithParent[]>([]);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Dialogs state
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryWithParent | null>(null);

  // Permissions
  const canManage =
    hasPermission(permissions, "categories.update") ||
    hasPermission(permissions, "categories.delete");
  const canCreate = hasPermission(permissions, "categories.create");

  // Data fetching
  const { categories, loading, totalCount, totalPages, refetch } = useCategories({
    orgId,
    page: currentPage,
    pageSize: PAGE_SIZE,
    searchQuery,
    parentId: searchQuery ? undefined : currentParentId, // Show all when searching
  });

  // Fetch all categories for stats
  const { categories: allCategories } = useCategories({
    orgId,
    includeAll: true,
  });

  // Reset page when filters change
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  // Navigate to a category's children
  const handleViewChildren = async (category: CategoryWithParent) => {
    setCurrentParentId(category.id);
    setCurrentPage(1);
    setSearchQuery("");
    setBreadcrumbPath([...breadcrumbPath, category]);
  };

  // Navigate via breadcrumb
  const handleBreadcrumbNavigate = (category: CategoryWithParent | null) => {
    if (category === null) {
      setCurrentParentId(null);
      setBreadcrumbPath([]);
    } else {
      const index = breadcrumbPath.findIndex((c) => c.id === category.id);
      if (index >= 0) {
        setCurrentParentId(category.id);
        setBreadcrumbPath(breadcrumbPath.slice(0, index + 1));
      }
    }
    setCurrentPage(1);
  };

  // Actions
  const handleEdit = (category: CategoryWithParent) => {
    setSelectedCategory(category);
    setFormDialogOpen(true);
  };

  const handleDelete = (category: CategoryWithParent) => {
    setSelectedCategory(category);
    setDeleteDialogOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setFormDialogOpen(open);
    if (!open) setSelectedCategory(null);
  };

  // Stats
  const rootCategories = allCategories.filter((c) => !c.parent_id).length;
  const subCategories = allCategories.filter((c) => c.parent_id).length;

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
          <h2 className="page-title">Categorías</h2>
          <p className="page-description">Organiza tus productos por categorías jerárquicas</p>
        </div>
        {canCreate && (
          <Button onClick={() => setFormDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Categoría
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="stats-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <FolderTree className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{allCategories.length}</p>
                <p className="text-sm text-muted-foreground">Categorías Totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stats-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-secondary/50">
                <FolderTree className="h-6 w-6 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{rootCategories}</p>
                <p className="text-sm text-muted-foreground">Categorías Raíz</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stats-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent/50">
                <Layers className="h-6 w-6 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{subCategories}</p>
                <p className="text-sm text-muted-foreground">Subcategorías</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar categorías..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-10 max-w-md"
        />
      </div>

      {/* Breadcrumb Navigation */}
      {!searchQuery && (
        <CategoryBreadcrumb path={breadcrumbPath} onNavigate={handleBreadcrumbNavigate} />
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <CategoriesTable
            categories={categories}
            canManage={canManage}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onViewChildren={handleViewChildren}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * PAGE_SIZE + 1} -{" "}
                {Math.min(currentPage * PAGE_SIZE, totalCount)} de {totalCount} categorías
              </p>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => currentPage > 1 && setCurrentPage(currentPage - 1)}
                      className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = i + 1;
                    return (
                      <PaginationItem key={page}>
                        <PaginationLink
                          isActive={page === currentPage}
                          onClick={() => setCurrentPage(page)}
                          className="cursor-pointer"
                        >
                          {page}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => currentPage < totalPages && setCurrentPage(currentPage + 1)}
                      className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <CategoryFormDialog
        open={formDialogOpen}
        onOpenChange={handleFormClose}
        category={selectedCategory}
        orgId={orgId || ""}
        defaultParentId={currentParentId}
        onSuccess={refetch}
      />

      <DeleteCategoryDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        category={selectedCategory}
        onSuccess={refetch}
      />
    </div>
  );
}
