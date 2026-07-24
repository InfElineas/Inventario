import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, ClipboardList, TrendingDown, Clock, PackageOpen,
  Megaphone, BarChart3, Package, ShieldCheck, Users, Warehouse,
  ChevronsLeft, ChevronsRight, Settings2, Eye, Crown, ChevronDown,
} from 'lucide-react';

const ICONS = {
  LayoutDashboard, ClipboardList, TrendingDown, Clock, PackageOpen,
  Megaphone, BarChart3, Package, ShieldCheck, Users, Settings2, Eye, Crown,
};

const ALL = ['inv', 'fact', 'auditor', 'ca', 'jefe_depto', 'administrador', 'superadmin'];

const NAV_GROUPS = [
  {
    items: [
      { path: '/', label: 'PC General', icon: 'LayoutDashboard', roles: ALL },
    ],
  },
  {
    items: [
      { path: '/productos', label: 'Catálogo', icon: 'Package', roles: ALL },
    ],
  },
  {
    label: 'INVENTARIO',
    groupIcon: 'ClipboardList',
    items: [
      { path: '/inventario',  label: 'Inventario',  icon: 'ClipboardList', roles: ['inv','fact','auditor','jefe_depto','administrador','superadmin'] },
      { path: '/mermas',      label: 'Mermas',       icon: 'TrendingDown',  roles: ['inv','fact','auditor','jefe_depto','administrador','superadmin'] },
      { path: '/lotes',       label: 'Vencimientos', icon: 'Clock',         roles: ['inv','ca','auditor','jefe_depto','administrador','superadmin']  },
      { path: '/recepciones', label: 'Recepciones',  icon: 'PackageOpen',   roles: ['inv','jefe_depto','administrador','superadmin']                 },
    ],
  },
  {
    label: 'FACTURACIÓN',
    groupIcon: 'Megaphone',
    items: [
      { path: '/anuncios', label: 'Anuncios', icon: 'Megaphone', roles: ['inv','ca','auditor','jefe_depto','administrador','superadmin'] },
    ],
  },
  {
    label: 'ANÁLISIS',
    groupIcon: 'BarChart3',
    items: [
      { path: '/supervision', label: 'Supervisión', icon: 'Eye',         roles: ['jefe_depto','administrador','superadmin'] },
      { path: '/reportes',    label: 'Reportes',    icon: 'BarChart3',   roles: ['auditor','administrador','superadmin']    },
      { path: '/auditoria',   label: 'Auditoría',   icon: 'ShieldCheck', roles: ['auditor','administrador','superadmin']    },
    ],
  },
  {
    label: 'CONFIGURACIÓN',
    groupIcon: 'Settings2',
    items: [
      { path: '/configuracion',  label: 'Configuración', icon: 'Settings2', roles: ALL },
      { path: '/admin/usuarios', label: 'Usuarios',      icon: 'Users',     roles: ['administrador','superadmin'] },
    ],
  },
  {
    label: 'SUPERADMIN',
    groupIcon: 'Crown',
    items: [
      { path: '/superadmin', label: 'Panel de Control', icon: 'Crown', roles: ['superadmin'] },
    ],
  },
];

// Devuelve el label del grupo que contiene la ruta activa
function activeGroupLabel(pathname, groups) {
  for (const g of groups) {
    if (!g.label) continue;
    for (const item of g.items) {
      if (pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path))) {
        return g.label;
      }
    }
  }
  return null;
}

export default function Sidebar({ user, pendingCounts = {}, isCollapsed = false, onToggle, hoverMode = false }) {
  const location = useLocation();
  const role     = user?.role || 'inv';
  const isSA     = role === 'superadmin';

  // Para superadmin: acordeón (grupos expandibles, sidebar siempre visible a 220px)
  // Para otros roles: comportamiento normal (collapsed toggle)
  const useAccordion = isSA;

  const [hovered, setHovered]     = useState(false);
  const collapseTimer             = useState(null);

  const handleMouseEnter = () => {
    if (!hoverMode) return;
    if (collapseTimer[0]) { clearTimeout(collapseTimer[0]); collapseTimer[1](null); }
    setHovered(true);
  };
  const handleMouseLeave = () => {
    if (!hoverMode) return;
    const t = setTimeout(() => { setHovered(false); collapseTimer[1](null); }, 400);
    collapseTimer[1](t);
  };

  const initOpen = activeGroupLabel(location.pathname, NAV_GROUPS);
  const [openGroup, setOpenGroup] = useState(initOpen);

  useEffect(() => {
    const active = activeGroupLabel(location.pathname, NAV_GROUPS);
    if (active) setOpenGroup(active);
  }, [location.pathname]);

  const toggleAccordionGroup = (label) =>
    setOpenGroup(prev => prev === label ? null : label);

  // hover mode: 52px por defecto, 220px al hacer hover
  // accordion mode (superadmin): siempre 220px cuando está expandido por hover
  const collapsed = hoverMode ? !hovered : isCollapsed;

  return (
    <aside
      className="hidden lg:flex fixed left-0 top-0 bottom-0 flex-col z-40 overflow-hidden"
      style={{
        width: collapsed ? '52px' : '220px',
        transition: hoverMode ? 'width 120ms ease' : 'width 180ms ease',
        background: 'hsl(var(--sidebar-background))',
        borderRight: '1px solid hsl(var(--sidebar-border))',
        boxShadow: hoverMode && hovered ? '4px 0 20px rgba(0,0,0,0.35)' : 'none',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Logo */}
      <div
        className={`flex items-center py-4 ${collapsed ? 'justify-center px-0' : 'px-4 gap-2.5'}`}
        style={{ borderBottom: '1px solid hsl(var(--sidebar-border))', flexShrink: 0 }}
      >
        <div className="w-7 h-7 rounded-lg bg-[#4ade80] flex items-center justify-center flex-shrink-0">
          <Warehouse className="w-3.5 h-3.5 text-black" />
        </div>
        {!collapsed && (
          <div className="min-w-0 overflow-hidden">
            <p className="text-[13px] font-bold text-foreground truncate whitespace-nowrap tracking-wide">ELÍNEAS</p>
            <p className="text-[10px] text-muted-foreground whitespace-nowrap">Inventario</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
        {NAV_GROUPS.map((group, gi) => {
          const visibleItems = isSA ? group.items : group.items.filter(item => item.roles.includes(role));
          if (visibleItems.length === 0) return null;

          // Grupo sin label (PC General): siempre visible
          if (!group.label) {
            return (
              <div key={gi} className="space-y-0.5">
                {visibleItems.map(item => {
                  const Icon     = ICONS[item.icon];
                  const isActive = location.pathname === item.path;
                  const count    = pendingCounts[item.path] || 0;
                  return (
                    <div key={item.path} className="relative">
                      {isActive && <span className="absolute left-0 top-[5px] bottom-[5px] w-[3px] bg-[#4ade80] rounded-r-full" />}
                      <Link
                        to={item.path}
                        title={collapsed ? item.label : undefined}
                        className={`flex items-center py-[7px] rounded-md transition-colors whitespace-nowrap
                          ${collapsed ? 'justify-center mx-1.5 px-0' : 'gap-2.5 ml-3 mr-2 px-3'}
                          ${isActive ? 'bg-[#4ade80]/[0.08] text-[#4ade80]' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'}`}
                      >
                        {Icon && <Icon className="w-[15px] h-[15px] flex-shrink-0" />}
                        {!collapsed && <span className="flex-1 text-[13px] font-medium">{item.label}</span>}
                        {!collapsed && count > 0 && (
                          <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold bg-[#4ade80]/15 text-[#4ade80] px-1">{count}</span>
                        )}
                        {collapsed && count > 0 && <span className="absolute top-[4px] right-[6px] w-[7px] h-[7px] rounded-full bg-[#4ade80]" />}
                      </Link>
                    </div>
                  );
                })}
              </div>
            );
          }

          // Grupo con label
          const GroupIcon   = ICONS[group.groupIcon];
          const isExpanded  = useAccordion ? openGroup === group.label : true;
          const hasActive   = visibleItems.some(item =>
            location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
          );
          const groupCount  = visibleItems.reduce((s, i) => s + (pendingCounts[i.path] || 0), 0);

          return (
            <div key={gi} className="mt-1">
              {/* Cabecera del grupo */}
              {collapsed ? (
                // 52px: icono del grupo centrado, clicable (abre el hover externamente)
                <div className="relative">
                  {hasActive && (
                    <span className="absolute left-0 top-[5px] bottom-[5px] w-[3px] bg-[#4ade80] rounded-r-full" />
                  )}
                  <div
                    title={group.label}
                    className={`flex items-center justify-center mx-1 py-2.5 w-[44px] rounded-md
                      ${hasActive ? 'text-[#4ade80] bg-[#4ade80]/10' : 'text-muted-foreground'}`}
                  >
                    {GroupIcon && <GroupIcon className="w-5 h-5 flex-shrink-0" />}
                    {groupCount > 0 && (
                      <span className="absolute top-[4px] right-[4px] w-[7px] h-[7px] rounded-full bg-[#4ade80]" />
                    )}
                  </div>
                </div>
              ) : useAccordion ? (
                // Acordeón expandido: fila completa clickeable
                <button
                  onClick={() => toggleAccordionGroup(group.label)}
                  className={`w-full flex items-center gap-2 px-4 pt-2.5 pb-1.5 transition-colors hover:bg-white/[0.03]
                    ${hasActive && !isExpanded ? 'text-[#4ade80]' : 'text-muted-foreground'}`}
                >
                  {GroupIcon && <GroupIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="flex-1 text-[9px] font-semibold tracking-widest text-left">{group.label}</span>
                  {groupCount > 0 && !isExpanded && (
                    <span className="w-[7px] h-[7px] rounded-full bg-[#4ade80] flex-shrink-0" />
                  )}
                  <ChevronDown
                    className="w-3 h-3 flex-shrink-0 transition-transform duration-150"
                    style={{ transform: isExpanded ? 'none' : 'rotate(-90deg)' }}
                  />
                </button>
              ) : (
                <p className="px-4 pt-3 pb-1 text-[9px] font-semibold tracking-widest"
                   style={{ color: 'hsl(var(--muted-foreground))' }}>
                  {group.label}
                </p>
              )}

              {/* Items del grupo: solo visibles cuando está expandido Y no está en 52px */}
              {isExpanded && !collapsed && (
                <div className="space-y-0.5">
                  {visibleItems.map(item => {
                    const Icon     = ICONS[item.icon];
                    const isActive = location.pathname === item.path ||
                      (item.path !== '/' && location.pathname.startsWith(item.path));
                    const count    = pendingCounts[item.path] || 0;
                    return (
                      <div key={item.path} className="relative">
                        {isActive && <span className="absolute left-0 top-[5px] bottom-[5px] w-[3px] bg-[#4ade80] rounded-r-full" />}
                        <Link
                          to={item.path}
                          title={collapsed ? item.label : undefined}
                          className={`flex items-center py-[7px] rounded-md transition-colors whitespace-nowrap
                            ${collapsed ? 'justify-center mx-1.5 px-0' : 'gap-2.5 ml-3 mr-2 px-3'}
                            ${isActive ? 'bg-[#4ade80]/[0.08] text-[#4ade80]' : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground'}`}
                        >
                          {Icon && <Icon className="w-[15px] h-[15px] flex-shrink-0" />}
                          {!collapsed && <span className="flex-1 text-[13px] font-medium">{item.label}</span>}
                          {!collapsed && count > 0 && (
                            <span className="min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold bg-[#4ade80]/15 text-[#4ade80] px-1">{count}</span>
                          )}
                          {collapsed && count > 0 && <span className="absolute top-[4px] right-[6px] w-[7px] h-[7px] rounded-full bg-[#4ade80]" />}
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle — solo para roles no-superadmin */}
      {!useAccordion && (
        <div style={{ borderTop: '1px solid hsl(var(--sidebar-border))', flexShrink: 0 }} className="py-2">
          <button
            onClick={onToggle}
            title={collapsed ? 'Expandir' : 'Colapsar'}
            className={`flex items-center py-2 text-muted-foreground hover:text-foreground hover:bg-white/[0.04] rounded-md transition-colors
              ${collapsed ? 'justify-center mx-1.5' : 'gap-2 ml-3 mr-2 px-3'}`}
            style={{ width: collapsed ? 'calc(100% - 12px)' : 'calc(100% - 20px)' }}
          >
            {collapsed ? <ChevronsRight className="w-[15px] h-[15px]" /> : <ChevronsLeft className="w-[15px] h-[15px]" />}
            {!collapsed && <span className="text-[13px] font-medium">Colapsar</span>}
          </button>
        </div>
      )}
    </aside>
  );
}
