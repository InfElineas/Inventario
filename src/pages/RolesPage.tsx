import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useUserRole, hasPermission } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Check, Loader2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface Permission {
  key: string;
  name: string;
  description: string | null;
  category: string;
}

interface RolePermissions {
  [role: string]: string[];
}

const roleConfig: Record<AppRole, { label: string; description: string; color: string }> = {
  org_admin: { 
    label: "Administrador", 
    description: "Acceso completo a todas las funciones del sistema",
    color: "bg-red-500/10 text-red-500 border-red-500/30"
  },
  security_admin: { 
    label: "Admin de Seguridad", 
    description: "Gestiona usuarios, roles, auditoría y errores",
    color: "bg-orange-500/10 text-orange-500 border-orange-500/30"
  },
  inventory_manager: { 
    label: "Gestor de Inventario", 
    description: "Administra productos, inventario, lotes e importaciones",
    color: "bg-blue-500/10 text-blue-500 border-blue-500/30"
  },
  import_operator: { 
    label: "Operador de Importaciones", 
    description: "Ejecuta y monitorea jobs de importación",
    color: "bg-green-500/10 text-green-500 border-green-500/30"
  },
  viewer: { 
    label: "Solo Lectura", 
    description: "Acceso de consulta sin permisos de modificación",
    color: "bg-gray-500/10 text-gray-500 border-gray-500/30"
  },
};

const roles: AppRole[] = ["org_admin", "security_admin", "inventory_manager", "import_operator", "viewer"];

export default function RolesPage() {
  const { user } = useOrganization();
  const { permissions: userPerms, loading: roleLoading } = useUserRole(user?.id);
  
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>({});
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<AppRole>("org_admin");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Get all permissions
        const { data: perms } = await supabase
          .from("permissions")
          .select("key, name, description, category")
          .order("category")
          .order("key");

        if (perms) setAllPermissions(perms);

        // Get all role permissions
        const { data: rolePerms } = await supabase
          .from("role_permissions")
          .select("role, permission_key");

        if (rolePerms) {
          const grouped = rolePerms.reduce((acc, rp) => {
            if (!acc[rp.role]) acc[rp.role] = [];
            acc[rp.role].push(rp.permission_key);
            return acc;
          }, {} as RolePermissions);
          setRolePermissions(grouped);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Group permissions by category
  const groupedPermissions = allPermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  if (roleLoading || loading) {
    return (
      <div className="page-container flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Roles y Permisos</h2>
          <p className="page-description">Visualiza la matriz de permisos por rol</p>
        </div>
      </div>

      {/* Role Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        {roles.map((role) => (
          <Card 
            key={role} 
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedRole === role ? "ring-2 ring-primary" : ""
            }`}
            onClick={() => setSelectedRole(role)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <CardTitle className="text-sm">{roleConfig[role].label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-2">
                {roleConfig[role].description}
              </p>
              <Badge className={roleConfig[role].color} variant="outline">
                {rolePermissions[role]?.length || 0} permisos
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Permissions Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Permisos de {roleConfig[selectedRole].label}
          </CardTitle>
          <CardDescription>
            {roleConfig[selectedRole].description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={Object.keys(groupedPermissions)[0]} className="w-full">
            <TabsList className="mb-4 flex-wrap h-auto gap-2">
              {Object.keys(groupedPermissions).map((category) => (
                <TabsTrigger key={category} value={category} className="text-xs">
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>

            {Object.entries(groupedPermissions).map(([category, permissions]) => (
              <TabsContent key={category} value={category}>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="grid gap-2">
                    {permissions.map((perm) => {
                      const hasPermission = rolePermissions[selectedRole]?.includes(perm.key);
                      return (
                        <div
                          key={perm.key}
                          className={`flex items-center justify-between p-4 rounded-lg border ${
                            hasPermission 
                              ? "bg-primary/5 border-primary/20" 
                              : "bg-muted/30 border-border"
                          }`}
                        >
                          <div className="flex-1">
                            <div className="font-medium">{perm.name}</div>
                            <div className="text-sm text-muted-foreground">{perm.description}</div>
                            <code className="text-xs bg-muted px-2 py-0.5 rounded mt-1 inline-block">
                              {perm.key}
                            </code>
                          </div>
                          <div className="ml-4">
                            {hasPermission ? (
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                <Check className="h-5 w-5 text-primary" />
                              </div>
                            ) : (
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                <span className="text-muted-foreground text-xl">−</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Role Comparison Table */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Comparativa de Roles</CardTitle>
          <CardDescription>Vista general de permisos por categoría</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Categoría</th>
                  {roles.map((role) => (
                    <th key={role} className="text-center py-3 px-2">
                      <span className="text-xs">{roleConfig[role].label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedPermissions).map(([category, permissions]) => (
                  <tr key={category} className="border-b">
                    <td className="py-3 px-4 font-medium">{category}</td>
                    {roles.map((role) => {
                      const rolePerms = rolePermissions[role] || [];
                      const categoryPerms = permissions.map(p => p.key);
                      const hasAll = categoryPerms.every(p => rolePerms.includes(p));
                      const hasSome = categoryPerms.some(p => rolePerms.includes(p));
                      const count = categoryPerms.filter(p => rolePerms.includes(p)).length;
                      
                      return (
                        <td key={role} className="text-center py-3 px-2">
                          {hasAll ? (
                            <Badge variant="default" className="text-xs">Completo</Badge>
                          ) : hasSome ? (
                            <Badge variant="secondary" className="text-xs">{count}/{permissions.length}</Badge>
                          ) : (
                            <span className="text-muted-foreground">−</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
