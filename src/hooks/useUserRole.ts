import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface UserRoleData {
  role: AppRole | null;
  orgId: string | null;
  permissions: string[];
  loading: boolean;
}

export function useUserRole(userId: string | undefined): UserRoleData {
  const [role, setRole] = useState<AppRole | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setRole(null);
      setOrgId(null);
      setPermissions([]);
      setLoading(false);
      return;
    }

    const fetchRoleAndPermissions = async () => {
      try {
        // Get membership with role
        const { data: membership } = await supabase
          .from("organization_memberships")
          .select("role, org_id")
          .eq("user_id", userId)
          .single();

        if (membership) {
          setRole(membership.role);
          setOrgId(membership.org_id);

          // Get permissions for role
          const { data: rolePerms } = await supabase
            .from("role_permissions")
            .select("permission_key")
            .eq("role", membership.role);

          if (rolePerms) {
            setPermissions(rolePerms.map((p) => p.permission_key));
          }
        }
      } catch (error) {
        console.error("Error fetching role:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRoleAndPermissions();
  }, [userId]);

  return { role, orgId, permissions, loading };
}

export function hasPermission(permissions: string[], requiredPermission: string): boolean {
  return permissions.includes(requiredPermission);
}
