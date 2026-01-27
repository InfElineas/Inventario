import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export default function Forbidden() {
  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Acceso denegado</h2>
          <p className="page-description">
            No tienes permisos para ver este módulo.
          </p>
        </div>
      </div>

      <Card className="stats-card">
        <CardHeader className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          <CardTitle className="text-base">Permisos insuficientes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Si crees que esto es un error, contacta a un administrador de tu
            organización.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
