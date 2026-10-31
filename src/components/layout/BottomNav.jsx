import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ClipboardList, TrendingDown, Clock, PackageOpen,
  Megaphone, BarChart3, Package, ShieldCheck, Users, Settings2, Eye, Crown,
  PackagePlus, PackageMinus, Repeat, ShoppingCart, MoreHorizontal, X,
} from 'lucide-react';
import { destinosDeMovil, esRutaActiva } from '@/lib/navegacion';

const ICONS = {
  LayoutDashboard, ClipboardList, TrendingDown, Clock, PackageOpen,
  Megaphone, BarChart3, Package, ShieldCheck, Users, Settings2, Eye, Crown,
  PackagePlus, PackageMinus, Repeat, ShoppingCart,
};

/**
 * Cuántas caben abajo. Cinco a 64 px son 320, que entra en la pantalla más
 * estrecha que se usa (375). La sexta y las siguientes van al botón flotante.
 */
const EN_LA_BARRA = 5;

/**
 * La barra de abajo y el botón de «más», que es la navegación del teléfono.
 *
 * Antes filtraba con `roles.includes(role)`: un solo rol, el de más autoridad.
 * Quien era inventarista y además facturaba perdía la mitad del menú, y como
 * ninguna entrada nombraba a superadmin ni a jefe de departamento, esos dos
 * veían la barra VACÍA y no podían moverse por la aplicación desde el móvil.
 * Ahora se filtra con `tieneRol`, que entiende varios roles y deja pasar a
 * superadmin, y la lista es la misma que usa el menú lateral.
 */
export default function BottomNav({ user, pendingCounts: pendingCountsRaw }) {
  const pendingCounts = pendingCountsRaw ?? {};
  const location = useLocation();
  const [abierto, setAbierto] = useState(false);
  const hoja = useRef(null);

  const { enBarra, enMenu } = destinosDeMovil(user, EN_LA_BARRA);

  // Cambiar de pantalla cierra el menú: si no, queda tapando la que acabas
  // de abrir.
  useEffect(() => { setAbierto(false); }, [location.pathname]);

  // Tocar fuera también lo cierra, que es lo que hace todo el mundo antes de
  // buscar el botón de cerrar.
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (!hoja.current?.contains(e.target)) setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  if (enBarra.length === 0) return null;

  const pendientesOcultas = enMenu.reduce((s, i) => s + (pendingCounts[i.path] || 0), 0);

  return (
    <>
      {/* Botón de «más», justo encima de la barra y a la derecha. Solo
          aparece si de verdad quedó algo fuera. */}
      {enMenu.length > 0 && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-label={abierto ? 'Cerrar más opciones' : 'Más opciones'}
          aria-expanded={abierto}
          data-testid="btn-mas-opciones"
          className="lg:hidden fixed right-4 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform active:scale-95"
          style={{
            bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 12px)',
            background: '#4ade80',
            color: '#000',
          }}
        >
          {abierto ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
          {!abierto && pendientesOcultas > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ background: '#E24B4A' }}>
              {pendientesOcultas > 9 ? '9+' : pendientesOcultas}
            </span>
          )}
        </button>
      )}

      {abierto && (
        <>
          <div className="lg:hidden fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }} />
          <div
            ref={hoja}
            data-testid="hoja-mas-opciones"
            className="lg:hidden fixed left-3 right-3 z-50 rounded-2xl overflow-hidden shadow-2xl"
            style={{
              bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 68px)',
              maxHeight: '60vh',
              overflowY: 'auto',
              background: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
            }}
          >
            {/* Agrupadas por módulo: en una lista de diez enlaces sueltos no
                se distingue lo de inventario de lo de facturación. */}
            {[...new Set(enMenu.map((i) => i.grupo))].map((grupo) => (
              <div key={grupo ?? 'sueltas'}>
                {grupo && (
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-muted-foreground">
                    {grupo}
                  </p>
                )}
                {enMenu.filter((i) => i.grupo === grupo).map((item) => {
                  const Icon = ICONS[item.icon];
                  const activa = esRutaActiva(location.pathname, item.path);
                  const cuenta = pendingCounts[item.path] || 0;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                        activa ? 'text-[#4ade80] bg-[#4ade80]/[0.08]' : 'text-foreground hover:bg-accent'
                      }`}
                    >
                      {Icon && <Icon className="w-[18px] h-[18px] shrink-0" />}
                      <span className="flex-1 text-sm">{item.label}</span>
                      {cuenta > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[11px] font-bold bg-[#4ade80]/15 text-[#4ade80]">
                          {cuenta}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex items-stretch"
        style={{
          background: 'hsl(var(--background))',
          borderTop: '1px solid hsl(var(--border))',
          height: '56px',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {enBarra.map((item) => {
          const Icon = ICONS[item.icon];
          const activa = location.pathname === item.path || esRutaActiva(location.pathname, item.path);
          const cuenta = pendingCounts[item.path] || 0;

          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={activa ? 'page' : undefined}
              // `flex-1` y no un ancho fijo: con cinco entradas la barra ya no
              // se desplaza, así que repartir el ancho deja cada destino donde
              // el dedo lo espera.
              className="relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{ padding: '6px 4px 4px', color: activa ? '#4ade80' : 'hsl(var(--muted-foreground))' }}
            >
              {activa && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-full"
                  style={{ width: '20px', height: '2px', background: '#4ade80' }} />
              )}
              <div className="relative">
                {Icon && <Icon style={{ width: '18px', height: '18px' }} />}
                {cuenta > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex items-center justify-center rounded-full text-black font-bold"
                    style={{ width: '14px', height: '14px', fontSize: '9px', background: '#4ade80' }}>
                    {cuenta > 9 ? '9+' : cuenta}
                  </span>
                )}
              </div>
              <span className="w-full text-center truncate" style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1.1 }}>
                {item.corto ?? item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
