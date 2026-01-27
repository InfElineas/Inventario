import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

const roleLabels: Record<AppRole, string> = {
  org_admin: "Administrador",
  security_admin: "Admin de Seguridad",
  inventory_manager: "Gestor de Inventario",
  import_operator: "Operador de Importaciones",
  viewer: "Solo Lectura",
};

const createSchema = z.object({
  email: z.string().email("Email inválido"),
  full_name: z.string().min(2, "Mínimo 2 caracteres"),
  role: z.enum(["org_admin", "security_admin", "inventory_manager", "import_operator", "viewer"] as const),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

const editSchema = z.object({
  full_name: z.string().min(2, "Mínimo 2 caracteres"),
  role: z.enum(["org_admin", "security_admin", "inventory_manager", "import_operator", "viewer"] as const),
});

type CreateFormData = z.infer<typeof createSchema>;
type EditFormData = z.infer<typeof editSchema>;

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: {
    id: string;
    email: string;
    full_name: string | null;
    role: AppRole;
    membership_id: string;
  };
  orgId: string;
  onSuccess: () => void;
}

export function UserFormDialog({ open, onOpenChange, user, orgId, onSuccess }: UserFormDialogProps) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const isEditing = !!user;

  const form = useForm<CreateFormData | EditFormData>({
    resolver: zodResolver(isEditing ? editSchema : createSchema),
    defaultValues: {
      email: "",
      full_name: "",
      role: "viewer" as AppRole,
      password: "",
    },
  });

  // Reset form when dialog opens/closes or user changes
  useEffect(() => {
    if (open) {
      if (user) {
        form.reset({
          full_name: user.full_name || "",
          role: user.role,
        });
      } else {
        form.reset({
          email: "",
          full_name: "",
          role: "viewer",
          password: "",
        });
      }
    }
  }, [open, user, form]);

  const onSubmit = async (data: CreateFormData | EditFormData) => {
    setLoading(true);
    try {
      if (isEditing) {
        // Update profile
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ full_name: data.full_name })
          .eq("id", user.id);

        if (profileError) throw profileError;

        // Update role in membership
        const { error: membershipError } = await supabase
          .from("organization_memberships")
          .update({ role: data.role })
          .eq("id", user.membership_id);

        if (membershipError) throw membershipError;

        toast({ title: "Usuario actualizado", description: "Los cambios se guardaron correctamente." });
      } else {
        // Create new user via edge function
        const createData = data as CreateFormData;
        
        const { data: responseData, error } = await supabase.functions.invoke("invite-user", {
          body: {
            email: createData.email,
            fullName: createData.full_name,
            role: createData.role,
            orgId: orgId,
            password: createData.password,
          },
        });

        if (error) {
          throw new Error(error.message || "Error al invitar usuario");
        }

        if (responseData?.error) {
          throw new Error(responseData.error);
        }

        toast({ 
          title: "Invitación enviada", 
          description: `Se envió un email de invitación a ${createData.email}`,
        });
      }
      
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error in user form:", error);
      toast({ 
        title: "Error", 
        description: error.message || "Ocurrió un error al procesar la solicitud", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Usuario" : "Invitar Usuario"}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Modifica la información del usuario y su rol." 
              : "Crea un usuario y envía una invitación por email al nuevo usuario."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!isEditing && (
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@empresa.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!isEditing && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña temporal</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Mínimo 6 caracteres" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Juan Pérez" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(roleLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {!loading && !isEditing && <Mail className="mr-2 h-4 w-4" />}
                {isEditing ? "Guardar" : "Enviar Invitación"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
