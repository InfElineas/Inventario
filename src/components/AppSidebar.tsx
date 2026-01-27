import { useLocation } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Truck,
  Warehouse,
  ClipboardList,
  Layers,
  FileUp,
  Users,
  Shield,
  Settings,
  Activity,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import { User as SupabaseUser } from "@supabase/supabase-js";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const navigationGroups: NavGroup[] = [
  {
    label: "Principal",
    defaultOpen: true,
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Catálogo",
    defaultOpen: true,
    items: [
      { title: "Productos", url: "/products", icon: Package, permission: "products.read" },
      { title: "Categorías", url: "/categories", icon: FolderTree, permission: "categories.read" },
      { title: "Proveedores", url: "/suppliers", icon: Truck, permission: "suppliers.read" },
      { title: "Almacenes", url: "/warehouses", icon: Warehouse, permission: "warehouses.read" },
    ],
  },
  {
    label: "Inventario",
    defaultOpen: true,
    items: [
      { title: "Existencias", url: "/inventory", icon: ClipboardList, permission: "inventory.read" },
      { title: "Lotes", url: "/lots", icon: Layers, permission: "lots.read" },
    ],
  },
  {
    label: "Importaciones",
    defaultOpen: true,
    items: [
      { title: "Jobs de Importación", url: "/imports", icon: FileUp, permission: "imports.read" },
    ],
  },
  {
    label: "Seguridad",
    defaultOpen: false,
    items: [
      { title: "Usuarios", url: "/users", icon: Users, permission: "users.read" },
      { title: "Roles y Permisos", url: "/roles", icon: Shield, permission: "roles.read" },
      { title: "Auditoría", url: "/audit", icon: Activity, permission: "audit.read" },
      { title: "Errores", url: "/errors", icon: AlertTriangle, permission: "errors.read" },
    ],
  },
  {
    label: "Configuración",
    defaultOpen: false,
    items: [
      { title: "Organización", url: "/settings", icon: Settings, permission: "org.read" },
    ],
  },
];

function NavGroupComponent({ group }: { group: NavGroup }) {
  const location = useLocation();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  
  const isGroupActive = group.items.some(item => location.pathname === item.url);

  if (isCollapsed) {
    return (
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {group.items.map((item) => (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={location.pathname === item.url}
                >
                  <NavLink to={item.url}>
                    <item.icon className="h-4 w-4" />
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <Collapsible defaultOpen={group.defaultOpen || isGroupActive} className="group/collapsible">
      <SidebarGroup>
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="cursor-pointer hover:bg-sidebar-accent/50 rounded-md transition-colors">
            <span className="flex-1">{group.label}</span>
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=closed]/collapsible:rotate-[-90deg]" />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname === item.url}
                  >
                    <NavLink 
                      to={item.url}
                      className="sidebar-nav-item"
                      activeClassName="sidebar-nav-item-active"
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

interface AppSidebarProps {
  user: SupabaseUser | null;
}

export function AppSidebar({ user }: AppSidebarProps) {
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { permissions, loading } = useUserRole(user?.id);

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.permission) return true;
        if (loading) return false;
        return permissions.includes(item.permission);
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={cn(
          "flex items-center gap-3 px-2 py-2",
          isCollapsed && "justify-center"
        )}>
          <div className="h-9 w-9 rounded-lg bg-gradient-primary flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-primary-foreground" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg text-sidebar-foreground">ELINEAS</span>
              <span className="text-xs text-sidebar-muted">Inventario v1.0</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="py-2">
        {visibleGroups.map((group) => (
          <NavGroupComponent key={group.label} group={group} />
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className={cn(
          "px-4 py-3 text-xs text-sidebar-muted",
          isCollapsed && "px-2 text-center"
        )}>
          {isCollapsed ? "v1.0" : "Plataforma ELINEAS v1.0"}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
