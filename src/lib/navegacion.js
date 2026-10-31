/**
 * A dónde se puede ir, dicho una sola vez.
 *
 * Antes esta lista estaba escrita dos veces —una en el menú lateral y otra en
 * el de abajo— y se separaron: en el móvil faltaba Reabastecimiento, las
 * Recepciones las veían dos roles en vez de cinco, y ni superadmin ni jefe de
 * departamento aparecían en ninguna entrada, así que en el teléfono veían la
 * barra vacía y no podían navegar. Ahora las dos barras leen de aquí.
 *
 * `prioridad` solo la usa el móvil: la barra de abajo cabe para cinco, así que
 * se queda con las cinco de número más bajo que el usuario pueda ver y el
 * resto se va al botón flotante. Los números van por módulo —primero lo de
 * inventario, luego facturación, luego análisis— de modo que cada quien acaba
 * con las suyas delante sin que haya que decidirlo rol por rol.
 */

import { ROLES_AJUSTES } from '@/lib/ajustes';
import { ROLES_PROCESAMIENTOS } from '@/lib/procesamientos';
import { tieneRol } from '@/lib/roles';

export const TODOS_LOS_ROLES = [
  'inv', 'fact', 'auditor', 'ca', 'jefe_depto', 'administrador', 'superadmin',
];

/**
 * Los grupos tal como los pinta el menú lateral. `label` vacío es un grupo sin
 * cabecera (las dos entradas sueltas de arriba).
 *
 * `corto` es el nombre para la barra del móvil, donde no caben trece
 * caracteres debajo de un icono.
 */
export const NAV_GROUPS = [
  {
    items: [
      { path: '/', label: 'PC General', corto: 'Panel', icon: 'LayoutDashboard', roles: TODOS_LOS_ROLES, prioridad: 1 },
    ],
  },
  {
    items: [
      { path: '/productos', label: 'Catálogo', icon: 'Package', roles: TODOS_LOS_ROLES, prioridad: 2 },
    ],
  },
  {
    label: 'INVENTARIO',
    groupIcon: 'ClipboardList',
    items: [
      { path: '/inventario',  label: 'Inventario',  icon: 'ClipboardList', prioridad: 10,
        roles: ['inv','fact','auditor','jefe_depto','administrador','superadmin'] },
      { path: '/mermas',      label: 'Mermas',      icon: 'TrendingDown',  prioridad: 11,
        roles: ['inv','fact','auditor','jefe_depto','administrador','superadmin'] },
      { path: '/lotes',       label: 'Vencimientos', corto: 'Vencim.', icon: 'Clock', prioridad: 12,
        roles: ['inv','ca','auditor','jefe_depto','administrador','superadmin'] },
      // `fact` entra pero sin poder recibir (eso lo gatea la propia página):
      // el reporte de incidencia le llega por notificación y tiene que poder
      // volver a él para cuadrar la factura del proveedor.
      { path: '/recepciones', label: 'Recepciones', corto: 'Recepc.', icon: 'PackageOpen', prioridad: 13,
        roles: ['inv','fact','jefe_depto','administrador','superadmin'] },
      { path: '/reabastecimiento', label: 'Reabastecimiento', corto: 'Reabast.', icon: 'ShoppingCart', prioridad: 14,
        roles: ['inv','ca','jefe_depto','supervisor','administrador','superadmin'] },
    ],
  },
  {
    label: 'FACTURACIÓN',
    groupIcon: 'Megaphone',
    items: [
      { path: '/facturacion/inventario', label: 'Conteos por facturar', corto: 'Conteos', icon: 'ClipboardList', roles: ROLES_AJUSTES, prioridad: 20 },
      { path: '/facturacion/mermas',     label: 'Mermas por facturar',  corto: 'M. fact.', icon: 'TrendingDown',  roles: ROLES_AJUSTES, prioridad: 21 },
      { path: '/anuncios', label: 'Anuncios', icon: 'Megaphone', prioridad: 22,
        roles: ['inv','ca','auditor','jefe_depto','administrador','superadmin'] },
      { path: '/ajustes/aumento',     label: 'Ajuste de aumento',     corto: 'Aumento',  icon: 'PackagePlus',  roles: ROLES_AJUSTES, prioridad: 23 },
      { path: '/ajustes/disminucion', label: 'Ajuste de disminución', corto: 'Disminuc.', icon: 'PackageMinus', roles: ROLES_AJUSTES, prioridad: 24 },
      { path: '/procesamientos',      label: 'Procesamientos',        corto: 'Proces.',  icon: 'Repeat',       roles: ROLES_PROCESAMIENTOS, prioridad: 25 },
    ],
  },
  {
    label: 'ANÁLISIS',
    groupIcon: 'BarChart3',
    items: [
      { path: '/supervision', label: 'Supervisión', corto: 'Superv.', icon: 'Eye',         prioridad: 30, roles: ['jefe_depto','administrador','superadmin'] },
      { path: '/reportes',    label: 'Reportes',    icon: 'BarChart3',   prioridad: 31, roles: ['auditor','administrador','superadmin'] },
      { path: '/auditoria',   label: 'Auditoría',   icon: 'ShieldCheck', prioridad: 32, roles: ['auditor','administrador','superadmin'] },
    ],
  },
  {
    label: 'CONFIGURACIÓN',
    groupIcon: 'Settings2',
    items: [
      { path: '/configuracion',  label: 'Configuración', corto: 'Config.', icon: 'Settings2', roles: TODOS_LOS_ROLES, prioridad: 40 },
      { path: '/admin/usuarios', label: 'Usuarios',      icon: 'Users',     prioridad: 41, roles: ['administrador','superadmin'] },
    ],
  },
  {
    label: 'SUPERADMIN',
    groupIcon: 'Crown',
    items: [
      { path: '/superadmin', label: 'Panel de Control', corto: 'Control', icon: 'Crown', roles: ['superadmin'], prioridad: 50 },
    ],
  },
];

/** Todas las entradas en una sola lista, sin grupos. */
export const TODOS_LOS_DESTINOS = NAV_GROUPS.flatMap((g) =>
  g.items.map((i) => ({ ...i, grupo: g.label ?? null })));

/**
 * ¿Es esta la pantalla en la que estamos?
 *
 * El prefijo cuenta porque hay pantallas con detalle propio
 * (`/recepciones/:id`). La raíz se compara entera o cualquier ruta la
 * activaría.
 */
export const esRutaActiva = (pathname, path) =>
  pathname === path || (path !== '/' && pathname.startsWith(`${path}/`));

/**
 * Cómo se reparte la navegación del móvil entre la barra y el botón de «más».
 *
 * Se separa del componente para poder probarlo: el fallo que arregla —que
 * superadmin y jefe de departamento no vieran NINGUNA entrada en el teléfono—
 * vivía justo en este reparto y no se veía en ninguna prueba.
 *
 * @param {object} usuario
 * @param {number} [enLaBarra] Cuántas caben abajo.
 * @returns {{ enBarra: object[], enMenu: object[] }}
 */
export function destinosDeMovil(usuario, enLaBarra = 5) {
  const visibles = TODOS_LOS_DESTINOS
    .filter((i) => tieneRol(usuario, i.roles))
    .sort((a, b) => a.prioridad - b.prioridad);

  return {
    enBarra: visibles.slice(0, enLaBarra),
    enMenu: visibles.slice(enLaBarra),
  };
}
