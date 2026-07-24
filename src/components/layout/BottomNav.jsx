import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, TrendingDown, Clock, PackageOpen,
  Megaphone, BarChart3, Package, ShieldCheck, Users, Database, Settings2,
} from 'lucide-react';

const ICONS = {
  LayoutDashboard, ClipboardList, TrendingDown, Clock, PackageOpen,
  Megaphone, BarChart3, Package, ShieldCheck, Users, Database, Settings2,
};

const ALL = ['inv', 'fact', 'auditor', 'ca', 'administrador'];
const NAV = [
  { path: '/',               label: 'PC General',  icon: 'LayoutDashboard', roles: ALL },
  { path: '/productos',      label: 'Productos',   icon: 'Package',         roles: ALL },
  { path: '/bd-tkc',         label: 'BD TKC',      icon: 'Database',        roles: ALL },
  { path: '/inventario',     label: 'Inventario',  icon: 'ClipboardList',   roles: ['inv','fact','auditor','administrador'] },
  { path: '/mermas',         label: 'Mermas',      icon: 'TrendingDown',    roles: ['inv','fact','auditor','administrador'] },
  { path: '/lotes',          label: 'Vencim.',     icon: 'Clock',           roles: ['inv','ca','auditor','administrador'] },
  { path: '/recepciones',    label: 'Recepc.',     icon: 'PackageOpen',     roles: ['inv','administrador'] },
  { path: '/anuncios',       label: 'Anuncios',    icon: 'Megaphone',       roles: ['inv','ca','auditor','administrador'] },
  { path: '/reportes',       label: 'Reportes',    icon: 'BarChart3',       roles: ['auditor','administrador'] },
  { path: '/auditoria',      label: 'Auditoría',   icon: 'ShieldCheck',     roles: ['auditor','administrador'] },
  { path: '/configuracion',  label: 'Config.',     icon: 'Settings2',       roles: ALL },
  { path: '/admin/usuarios', label: 'Usuarios',    icon: 'Users',           roles: ['administrador'] },
];

export default function BottomNav({ role = 'inv', pendingCounts = {} }) {
  const location = useLocation();
  const items = NAV.filter(item => item.roles.includes(role));

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch overflow-x-auto"
      style={{
        background: 'hsl(var(--background))',
        borderTop: '1px solid hsl(var(--border))',
        height: '56px',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      <style>{`nav::-webkit-scrollbar { display: none; }`}</style>

      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const isActive = location.pathname === item.path ||
          (item.path !== '/' && location.pathname.startsWith(item.path));
        const count = pendingCounts[item.path] || 0;

        return (
          <Link
            key={item.path}
            to={item.path}
            className="relative flex flex-col items-center justify-center gap-0.5 flex-shrink-0 transition-colors"
            style={{
              minWidth: '60px',
              padding: '6px 8px 4px',
              color: isActive ? '#4ade80' : '#555',
            }}
          >
            {/* Active bar top */}
            {isActive && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-full"
                style={{ width: '20px', height: '2px', background: '#4ade80' }}
              />
            )}

            {/* Icon with badge */}
            <div className="relative">
              {Icon && <Icon style={{ width: '18px', height: '18px' }} />}
              {count > 0 && (
                <span
                  className="absolute -top-1 -right-1.5 flex items-center justify-center rounded-full text-black font-bold"
                  style={{ width: '14px', height: '14px', fontSize: '9px', background: '#4ade80' }}
                >
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </div>

            {/* Label */}
            <span style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1 }}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
