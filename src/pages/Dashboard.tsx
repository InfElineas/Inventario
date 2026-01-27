import { useOutletContext } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Warehouse, Users, FileUp, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";
import { User, Session } from "@supabase/supabase-js";

interface OutletContext {
  user: User | null;
  session: Session | null;
  orgName: string;
}

export default function Dashboard() {
  const { user, orgName } = useOutletContext<OutletContext>();

  const stats = [
    { title: "Productos", value: "0", icon: Package, color: "bg-primary/10 text-primary" },
    { title: "Almacenes", value: "0", icon: Warehouse, color: "bg-accent/10 text-accent" },
    { title: "Usuarios", value: "1", icon: Users, color: "bg-info/10 text-info" },
    { title: "Importaciones", value: "0", icon: FileUp, color: "bg-warning/10 text-warning" },
  ];

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Dashboard</h2>
          <p className="page-description">Vista general de tu inventario · {orgName}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="stats-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className={`stats-card-icon ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="stats-card-value">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="stats-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-success">
              <CheckCircle className="h-5 w-5" /> Sistema Listo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Tu plataforma ELINEAS está configurada con RBAC multi-tenant completo.
            </p>
          </CardContent>
        </Card>

        <Card className="stats-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-info">
              <TrendingUp className="h-5 w-5" /> Próximos Pasos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Crea productos, categorías y almacenes para comenzar.
            </p>
          </CardContent>
        </Card>

        <Card className="stats-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" /> Importaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Sube archivos SUB, VD y LOT para poblar tu inventario.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
