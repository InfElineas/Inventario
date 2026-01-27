import { format } from "date-fns";
import { es } from "date-fns/locale";
import { MoreHorizontal, Pencil, Trash2, FolderTree, ChevronRight } from "lucide-react";
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
import type { CategoryWithParent } from "@/hooks/useCategories";

interface CategoriesTableProps {
  categories: CategoryWithParent[];
  canManage: boolean;
  onEdit: (category: CategoryWithParent) => void;
  onDelete: (category: CategoryWithParent) => void;
  onViewChildren: (category: CategoryWithParent) => void;
}

export function CategoriesTable({
  categories,
  canManage,
  onEdit,
  onDelete,
  onViewChildren,
}: CategoriesTableProps) {
  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12">
        <div className="empty-state">
          <FolderTree className="empty-state-icon h-12 w-12" />
          <h3 className="empty-state-title">No hay categorías</h3>
          <p className="empty-state-description">
            Crea tu primera categoría para organizar tus productos.
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
            <TableHead>Nombre</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Categoría Padre</TableHead>
            <TableHead className="text-center">Subcategorías</TableHead>
            <TableHead>Fecha Creación</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => (
            <TableRow key={category.id} className="hover:bg-muted/30">
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <FolderTree className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-medium">{category.name}</span>
                </div>
              </TableCell>
              <TableCell>
                {category.description ? (
                  <span className="line-clamp-1 text-muted-foreground">
                    {category.description}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {category.parent?.name ? (
                  <Badge variant="outline">{category.parent.name}</Badge>
                ) : (
                  <span className="text-muted-foreground">Raíz</span>
                )}
              </TableCell>
              <TableCell className="text-center">
                {category.children_count && category.children_count > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onViewChildren(category)}
                    className="gap-1"
                  >
                    <Badge variant="secondary">{category.children_count}</Badge>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                ) : (
                  <span className="text-muted-foreground">0</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(category.created_at), "dd MMM yyyy", { locale: es })}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canManage && (
                      <>
                        <DropdownMenuItem onClick={() => onEdit(category)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onDelete(category)}
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
