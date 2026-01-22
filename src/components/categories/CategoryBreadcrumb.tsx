import { ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CategoryWithParent } from "@/hooks/useCategories";

interface CategoryBreadcrumbProps {
  path: CategoryWithParent[];
  onNavigate: (category: CategoryWithParent | null) => void;
}

export function CategoryBreadcrumb({ path, onNavigate }: CategoryBreadcrumbProps) {
  if (path.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 text-sm mb-4">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onNavigate(null)}
        className="h-7 px-2 gap-1"
      >
        <Home className="h-3.5 w-3.5" />
        Raíz
      </Button>

      {path.map((cat, index) => (
        <div key={cat.id} className="flex items-center">
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
          <Button
            variant={index === path.length - 1 ? "secondary" : "ghost"}
            size="sm"
            onClick={() => onNavigate(cat)}
            className="h-7 px-2"
          >
            {cat.name}
          </Button>
        </div>
      ))}
    </nav>
  );
}
