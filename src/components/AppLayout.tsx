import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { User, Session } from "@supabase/supabase-js";

export function AppLayout() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        setOrgName("");
        setLoading(false);
        navigate("/auth");
        return;
      }
      fetchOrgData(session.user.id);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (!session) {
        setOrgName("");
        setLoading(false);
        navigate("/auth");
      } else {
        fetchOrgData(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchOrgData = async (userId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("organization_memberships")
        .select("organizations(name)")
        .eq("user_id", userId)
        .limit(1);

      if (error) throw error;

      const organization = data?.[0]?.organizations as { name: string } | null | undefined;
      if (organization?.name) {
        setOrgName(organization.name);
      } else {
        setOrgName("");
      }
    } catch (error) {
      console.error("Error fetching organization:", error);
      setOrgName("");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  const orgLoading = loading && !!session;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar user={user} />
        <SidebarInset className="flex flex-col flex-1">
          <AppHeader user={user} orgName={orgLoading ? "Cargando..." : orgName} />
          <main className="flex-1 overflow-auto">
            {orgLoading ? (
              <div className="min-h-full flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                  <p className="text-sm text-muted-foreground">Cargando...</p>
                </div>
              </div>
            ) : (
              <Outlet context={{ user, session, orgName }} />
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
