import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Check, X } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface PermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: {
    id: string;
    email: string;
    full_name: string | null;
    role: AppRole;
  } | null;
}

interface Permission {
  key: string;
  name: string;
  description: string | null;
  category: string;
}

const roleLabels: Record<AppRole, string> = {
  org_admin: "Administrador",
  security_admin: "Admin de Seguridad",
  inventory_manager: "Gestor de Inventario",
  import_operator: "Operador de Importaciones",
  viewer: "Solo Lectura",
};

export function PermissionsDialog({ open, onOpenChange, user }: PermissionsDialogProps) {
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !user) return;

    const fetchPermissions = async () => {
      setLoading(true);
      try {
        // Get all permissions
        const { data: perms } = await supabase
          .from("permissions")
          .select("key, name, description, category")
          .order("category")
          .order("key");

        if (perms) setAllPermissions(perms);

        // Get role permissions
        const { data: rolePerms } = await supabase
          .from("role_permissions")
          .select("permission_key")
          .eq("role", user.role);

        if (rolePerms) setUserPermissions(rolePerms.map(p => p.permission_key));
      } catch (error) {
        console.error("Error fetching permissions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [open, user]);

  // Group permissions by category
  const groupedPermissions = allPermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) acc[perm.category] = [];
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Permisos de {user?.full_name || user?.email}</DialogTitle>
          <DialogDescription>
            Rol: <Badge variant="secondary">{user ? roleLabels[user.role] : ""}</Badge>
            <span className="ml-2 text-muted-foreground">
              ({userPermissions.length} permisos activos)
            </span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-6">
              {Object.entries(groupedPermissions).map(([category, permissions]) => (
                <div key={category}>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wider">
                    {category}
                  </h4>
                  <div className="grid gap-2">
                    {permissions.map((perm) => {
                      const hasPermission = userPermissions.includes(perm.key);
                      return (
                        <div
                          key={perm.key}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            hasPermission 
                              ? "bg-primary/5 border-primary/20" 
                              : "bg-muted/30 border-border opacity-60"
                          }`}
                        >
                          <div>
                            <div className="font-medium text-sm">{perm.name}</div>
                            {perm.description && (
                              <div className="text-xs text-muted-foreground">{perm.description}</div>
                            )}
                          </div>
                          {hasPermission ? (
                            <Check className="h-5 w-5 text-primary" />
                          ) : (
                            <X className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
