import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Shield, Eye } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const roleConfig: Record<AppRole, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  org_admin: { label: "Administrador", variant: "default" },
  security_admin: { label: "Admin Seguridad", variant: "secondary" },
  inventory_manager: { label: "Gestor Inventario", variant: "outline" },
  import_operator: { label: "Operador Imports", variant: "outline" },
  viewer: { label: "Solo Lectura", variant: "outline" },
};

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  membership_id: string;
  created_at: string;
}

interface UsersTableProps {
  users: UserRow[];
  currentUserId?: string;
  canManage: boolean;
  onEdit: (user: UserRow) => void;
  onDelete: (user: UserRow) => void;
  onViewPermissions: (user: UserRow) => void;
}

export function UsersTable({ 
  users, 
  currentUserId, 
  canManage, 
  onEdit, 
  onDelete,
  onViewPermissions 
}: UsersTableProps) {
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[300px]">Usuario</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Fecha de Ingreso</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                No hay usuarios en la organización.
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium">
                        {user.full_name || "Sin nombre"}
                        {user.id === currentUserId && (
                          <span className="text-xs text-muted-foreground ml-2">(Tú)</span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={roleConfig[user.role].variant}>
                    <Shield className="h-3 w-3 mr-1" />
                    {roleConfig[user.role].label}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString("es-ES", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onViewPermissions(user)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Ver Permisos
                      </DropdownMenuItem>
                      {canManage && user.id !== currentUserId && (
                        <>
                          <DropdownMenuItem onClick={() => onEdit(user)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => onDelete(user)}
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
