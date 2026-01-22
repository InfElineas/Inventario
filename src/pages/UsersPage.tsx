import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useUserRole, hasPermission } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { UsersTable } from "@/components/users/UsersTable";
import { UserFormDialog } from "@/components/users/UserFormDialog";
import { DeleteUserDialog } from "@/components/users/DeleteUserDialog";
import { PermissionsDialog } from "@/components/users/PermissionsDialog";
import { Plus, Search, Users, Shield, Loader2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  membership_id: string;
  created_at: string;
}

export default function UsersPage() {
  const { user } = useOrganization();
  const { orgId, permissions, loading: roleLoading } = useUserRole(user?.id);
  
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Dialogs
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);

  const canManage = hasPermission(permissions, "users.update") || hasPermission(permissions, "users.delete");
  const canCreate = hasPermission(permissions, "users.create");

  const fetchUsers = async () => {
    if (!orgId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("organization_memberships")
        .select(`
          id,
          role,
          created_at,
          profiles!organization_memberships_user_id_fkey (
            id,
            email,
            full_name,
            avatar_url
          )
        `)
        .eq("org_id", orgId);

      if (error) throw error;

      const mappedUsers: UserRow[] = (data || []).map((m: any) => ({
        id: m.profiles.id,
        email: m.profiles.email,
        full_name: m.profiles.full_name,
        avatar_url: m.profiles.avatar_url,
        role: m.role,
        membership_id: m.id,
        created_at: m.created_at,
      }));

      setUsers(mappedUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orgId) {
      fetchUsers();
    }
  }, [orgId]);

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.full_name && u.full_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleEdit = (userRow: UserRow) => {
    setSelectedUser(userRow);
    setFormDialogOpen(true);
  };

  const handleDelete = (userRow: UserRow) => {
    setSelectedUser(userRow);
    setDeleteDialogOpen(true);
  };

  const handleViewPermissions = (userRow: UserRow) => {
    setSelectedUser(userRow);
    setPermissionsDialogOpen(true);
  };

  const handleFormClose = (open: boolean) => {
    setFormDialogOpen(open);
    if (!open) setSelectedUser(null);
  };

  if (roleLoading) {
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
          <h2 className="page-title">Usuarios</h2>
          <p className="page-description">Gestiona los usuarios y roles de tu organización</p>
        </div>
        {canCreate && (
          <Button onClick={() => setFormDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo Usuario
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="stats-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-sm text-muted-foreground">Usuarios Totales</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stats-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-secondary/50">
                <Shield className="h-6 w-6 text-secondary-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {users.filter((u) => u.role === "org_admin" || u.role === "security_admin").length}
                </p>
                <p className="text-sm text-muted-foreground">Administradores</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="stats-card">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-accent/50">
                <Users className="h-6 w-6 text-accent-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">5</p>
                <p className="text-sm text-muted-foreground">Roles Disponibles</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 max-w-md"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <UsersTable
          users={filteredUsers}
          currentUserId={user?.id}
          canManage={canManage}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onViewPermissions={handleViewPermissions}
        />
      )}

      {/* Dialogs */}
      <UserFormDialog
        open={formDialogOpen}
        onOpenChange={handleFormClose}
        user={selectedUser ? {
          id: selectedUser.id,
          email: selectedUser.email,
          full_name: selectedUser.full_name,
          role: selectedUser.role,
          membership_id: selectedUser.membership_id,
        } : undefined}
        orgId={orgId || ""}
        onSuccess={fetchUsers}
      />

      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        user={selectedUser}
        onSuccess={fetchUsers}
      />

      <PermissionsDialog
        open={permissionsDialogOpen}
        onOpenChange={setPermissionsDialogOpen}
        user={selectedUser}
      />
    </div>
  );
}
