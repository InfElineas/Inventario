// Role configuration
export const ROLES = {
  inv:          { label: 'Inventarista',    color: 'bg-primary text-primary-foreground' },
  fact:         { label: 'Facturación',     color: 'bg-warning text-warning-foreground' },
  auditor:      { label: 'Auditor',         color: 'bg-success text-success-foreground' },
  ca:           { label: 'Comercial',       color: 'bg-coral text-coral-foreground' },
  ic:           { label: 'Intervención',    color: 'bg-warning text-warning-foreground' },
  supervisor:   { label: 'Supervisor',      color: 'bg-neutral text-neutral-foreground' },
  jefe_depto:   { label: 'Jefe de Depto.', color: 'bg-[#6366F1] text-white' },
  administrador:{ label: 'Administrador',   color: 'bg-purple text-purple-foreground' },
  superadmin:   { label: 'Super Admin',     color: 'bg-[#e24b4a] text-white' },
};

/** true si el rol tiene dominio total sobre el sistema */
export const isSuperAdmin = (role) => role === 'superadmin';

// Departamentos para rol jefe_depto
export const DEPARTAMENTOS = {
  inventario:  'Inventario',
  facturacion: 'Facturación',
  ca:          'Creación de Anuncio',
};

// Task state badges
export const ESTADO_TAREA = {
  pendiente: { label: 'Pendiente', bg: 'bg-[#88878014]', text: 'text-[#888780]', dot: 'bg-[#888780]' },
  en_curso: { label: 'En curso', bg: 'bg-[#378ADD14]', text: 'text-[#378ADD]', dot: 'bg-[#378ADD]' },
  pend_fact: { label: 'Pend. FACT', bg: 'bg-[#BA751714]', text: 'text-[#BA7517]', dot: 'bg-[#BA7517]' },
  pend_ca: { label: 'Pend. CA', bg: 'bg-[#BA751714]', text: 'text-[#BA7517]', dot: 'bg-[#BA7517]' },
  en_auditoria: { label: 'En auditoría', bg: 'bg-[#BA751714]', text: 'text-[#BA7517]', dot: 'bg-[#BA7517]' },
  completado: { label: 'Completado', bg: 'bg-[#1D9E7514]', text: 'text-[#1D9E75]', dot: 'bg-[#1D9E75]' },
  devuelto: { label: 'Devuelto', bg: 'bg-[#E24B4A14]', text: 'text-[#E24B4A]', dot: 'bg-[#E24B4A]' },
  reconteo_solicitado: { label: 'Reconteo', bg: 'bg-[#E24B4A14]', text: 'text-[#E24B4A]', dot: 'bg-[#E24B4A]' },
};

// Lot expiry states
export const ESTADO_FV = {
  vencido: { label: 'Vencido', bg: 'bg-[#E24B4A18]', text: 'text-[#E24B4A]', dot: 'bg-[#E24B4A]' },
  critico: { label: 'Crítico', bg: 'bg-[#E24B4A10]', text: 'text-[#E24B4A]', dot: 'bg-[#E24B4A]' },
  por_vencer: { label: 'Por vencer', bg: 'bg-[#BA751714]', text: 'text-[#BA7517]', dot: 'bg-[#BA7517]' },
  vigente: { label: 'Vigente', bg: 'bg-[#1D9E7514]', text: 'text-[#1D9E75]', dot: 'bg-[#1D9E75]' },
  sin_fecha: { label: 'Sin fecha', bg: 'bg-[#88878014]', text: 'text-[#888780]', dot: 'bg-[#888780]' },
};

// Merma classifications
export const CLASIF_MERMA_SIN_FACT = [
  'Cuenta casa — Administrativa Eli',
  'Cuenta casa — Administrativa Mandy padre',
  'Cuenta casa — Administrativa Yanet',
  'Cuenta casa — Administrativa Belkis',
  'Cuenta casa — Administrativa Pablo',
  'Cuenta casa — Administrativa René',
  'Cuenta casa — Atenciones',
  'Cuenta casa — Eventos',
  'Fitosanitario e higiene',
  'Higiene',
  'Creación de anuncio',
  'Veterinario',
  'Reclasificación de calidad',
];

export const CLASIF_MERMA_CON_FACT = [
  'Mal estado — Roto',
  'Mal estado — Dañado',
  'Mal estado — Húmedo',
  'Mal estado — Derramado',
  'Mal estado — Contaminado',
  'Merma-FV — Vencido',
  'Merma-FV — Próximo a vencer',
  'Salida insumos — Empaque',
  'Salida insumos — Etiquetas',
  'Salida insumos — Limpieza',
  'Salida insumos — Herramientas',
  'Devolución cliente',
  'Error de despacho',
  'Faltante sin justificar',
  'Robo / hurto',
  'Avería en transporte',
  'Error de etiquetado',
  'Producto no conforme',
  'Muestra comercial',
  'Donación',
];

export const ALL_CLASIF_MERMA = [...CLASIF_MERMA_SIN_FACT, ...CLASIF_MERMA_CON_FACT];

// Destinos válidos
export const DESTINOS_MERMA = [
  'Venta directa',
  'Local de merma (Yanet)',
  'Destrucción',
  'Devolución a proveedor',
  'Consumo interno',
  'Fitosanitario',
];

// Motivos TKC
export const MOTIVOS_TKC = [
  'Agotado',
  'Precio desactualizado',
  'Producto descontinuado',
  'Mala imagen o descripción',
  'Sin categoría asignada',
  'Pendiente revisión catálogo',
  'Error de sincronización',
  'Restricción temporal',
];

// Motivos ELíneas
export const MOTIVOS_ELINEAS = [
  'Agotado sin stock visible',
  'Precio fuera de rango',
  'Sin ID de publicación',
  'Imagen rechazada',
  'Categoría incorrecta',
  'Pendiente aprobación',
  'Bloqueado por proveedor',
];

// Reconteo motivo categories
export const MOTIVOS_RECONTEO = [
  'Cantidad sospechosa',
  'Discrepancia con sistema',
  'Clasificación incorrecta',
  'Producto confundido',
  'Falta evidencia',
  'Error de digitación',
  'Solicitud de supervisor',
];

// Navegación
export const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: 'LayoutDashboard' },
  { path: '/inventario', label: 'Inventario', icon: 'ClipboardList' },
  { path: '/mermas', label: 'Mermas', icon: 'TrendingDown' },
  { path: '/lotes', label: 'Vencimientos', icon: 'Clock' },
  { path: '/recepciones', label: 'Recepciones', icon: 'PackageOpen' },
  { path: '/anuncios', label: 'Anuncios', icon: 'Megaphone' },
  { path: '/reportes', label: 'Reportes', icon: 'BarChart3' },
  { path: '/auditoria', label: 'Auditoría', icon: 'ShieldCheck' },
];

// Clasificación FACT (Ajuste TKC)
export const CLASIF_FACT = [
  'Faltante Inventario',
  'Sobrante en inventario',
  'Sustitución de inventario',
  'Incidencias Picker',
  'Reposicion de inventario',
  'Reposicion productos sobreventa',
  'Robo',
  'Transferencia almacén Externo',
  'Cuenta casa atenciones',
  'Cuenta casa eventos',
  'Devolución a proveedor',
  'Error contable-Fac NO',
  'Error contable-Fac -o +',
  'Error contable-Inventario',
  'Faltante de origen',
  'Producto incontable',
  'Reclasificación de calidad',
  'Responsabilidad de materiales',
  'Venta Directa',
  'Venta SP',
  'Merma-Manipulación',
  'Merma-Ratones',
  'Merma-FV',
  'Mal estado-Sin presencia comercial',
  'Mal estado-sin calidad',
  'Salida de insumos Medios Básicos',
  'Salida de insumos Preparación ordenes',
  'Salida de insumos Mantenimiento',
  'Cuenta casa administrativa-Eli',
  'Cuenta casa administrativa-Mandy padre',
  'Cuenta casa administrativa-Yanet',
  'Cuenta casa administrativa-Belkis',
  'Cuenta casa administrativa-Pablo',
  'Cuenta casa administrativa-Rene',
  'Transferencia a Thaba no registrada',
  'Transferencia a Latino no registrada',
  'Error antiguo',
  'Sin explicación',
  'No Procesar x Fact',
  'Procesamiento PP',
  'Procesamiento-Fact',
  'Error contable-VD',
  'Mal estado-solo AC-VD',
  'No disponibilidad TKC',
  'Transferencia bodegón no registrada',
  'Cuenta casa administrativa-Libia',
]

// Estado FACT
export const ESTADO_FACT = [
  'Pendiente a retiro',
  'Retirado',
  'Sin existencias en TKC',
  'Solicitud de retiro duplicado',
  'Proveedor Incorrecto',
  'Ajuste de aumento',
  'Procesamiento',
  'Recontar',
]

export const TIPO_CASO_LABELS = {
  desact_ef_positivo: { label: 'DESACT EF>0', bg: 'bg-[#E24B4A14]', text: 'text-[#E24B4A]' },
  sin_id: { label: 'Sin ID', bg: 'bg-[#BA751714]', text: 'text-[#BA7517]' },
  activo_ef_cero: { label: 'Activo EF=0', bg: 'bg-[#88878014]', text: 'text-[#888780]' },
};