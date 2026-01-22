import { useOutletContext } from "react-router-dom";
import { User, Session } from "@supabase/supabase-js";

interface OrganizationContext {
  user: User | null;
  session: Session | null;
  orgName: string;
}

export function useOrganization() {
  return useOutletContext<OrganizationContext>();
}
