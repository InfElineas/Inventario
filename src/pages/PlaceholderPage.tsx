import { useLocation } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

const pageTitles: Record<string, { title: string; description: string }> = {
  "/products": { title: "Productos", description: "Gestiona tu catálogo de productos" },
  "/categories": { title: "Categorías", description: "Organiza tus productos por categorías" },
  "/suppliers": { title: "Proveedores", description: "Administra tus proveedores" },
  "/warehouses": { title: "Almacenes", description: "Configura tus ubicaciones de almacenamiento" },
  "/inventory": { title: "Existencias", description: "Consulta y ajusta el inventario" },
  "/lots": { title: "Lotes", description: "Gestiona lotes y fechas de vencimiento" },
  "/imports": { title: "Importaciones", description: "Carga masiva de datos" },
  "/users": { title: "Usuarios", description: "Administra usuarios de la organización" },
  "/roles": { title: "Roles y Permisos", description: "Configura el control de acceso" },
  "/audit": { title: "Auditoría", description: "Revisa el historial de cambios" },
  "/errors": { title: "Errores", description: "Monitorea errores del sistema" },
  "/settings": { title: "Configuración", description: "Ajustes de la organización" },
};

export default function PlaceholderPage() {
  const location = useLocation();
  const pageInfo = pageTitles[location.pathname] || { 
    title: "Página", 
    description: "Esta página está en desarrollo" 
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">{pageInfo.title}</h2>
          <p className="page-description">{pageInfo.description}</p>
        </div>
      </div>

      <Card className="stats-card">
        <CardContent className="py-16">
          <div className="empty-state">
            <Construction className="empty-state-icon h-16 w-16" />
            <h3 className="empty-state-title">En Construcción</h3>
            <p className="empty-state-description">
              Este módulo será implementado próximamente con CRUD completo y todas las funcionalidades.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
