import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useOrganization } from "@/hooks/useOrganization";
import { useUserRole } from "@/hooks/useUserRole";
import { Loader2 } from "lucide-react";

interface RequirePermissionProps {
  required: string | string[];
  children: ReactNode;
}

export function RequirePermission({ required, children }: RequirePermissionProps) {
  const { session, user } = useOrganization();
  const { permissions, loading } = useUserRole(user?.id);

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  if (loading) {
    return (
      <div className="page-container flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const requiredList = Array.isArray(required) ? required : [required];
  const hasAccess =
    requiredList.length === 0 || requiredList.every((perm) => permissions.includes(perm));

  if (!hasAccess) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
