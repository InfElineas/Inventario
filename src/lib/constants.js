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
  superadmin:   { label: 'Super Admin',     color: 'bg-[var(--c-bad)] text-white' },
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
  pendiente: { label: 'Pendiente', bg: 'bg-[var(--c-gray)]/8', text: 'text-[var(--c-gray)]', dot: 'bg-[var(--c-gray)]' },
  en_curso: { label: 'En curso', bg: 'bg-[var(--c-info)]/8', text: 'text-[var(--c-info)]', dot: 'bg-[var(--c-info)]' },
  pend_fact: { label: 'Pend. FACT', bg: 'bg-[var(--c-warn)]/8', text: 'text-[var(--c-warn)]', dot: 'bg-[var(--c-warn)]' },
  pend_ca: { label: 'Pend. CA', bg: 'bg-[var(--c-warn)]/8', text: 'text-[var(--c-warn)]', dot: 'bg-[var(--c-warn)]' },
  en_auditoria: { label: 'En auditoría', bg: 'bg-[var(--c-warn)]/8', text: 'text-[var(--c-warn)]', dot: 'bg-[var(--c-warn)]' },
  completado: { label: 'Completado', bg: 'bg-[var(--c-ok-dim)]/8', text: 'text-[var(--c-ok-dim)]', dot: 'bg-[var(--c-ok-dim)]' },
  devuelto: { label: 'Devuelto', bg: 'bg-[var(--c-bad)]/8', text: 'text-[var(--c-bad)]', dot: 'bg-[var(--c-bad)]' },
  // Casos de intervención comercial: comercial aprueba la rebaja o dice que no procede.
  aprobado: { label: 'Rebaja aprobada', bg: 'bg-[var(--c-ok-dim)]/8', text: 'text-[var(--c-ok-dim)]', dot: 'bg-[var(--c-ok-dim)]' },
  rechazado: { label: 'No procede', bg: 'bg-[var(--c-bad)]/8', text: 'text-[var(--c-bad)]', dot: 'bg-[var(--c-bad)]' },
  reconteo_solicitado: { label: 'Reconteo', bg: 'bg-[var(--c-bad)]/8', text: 'text-[var(--c-bad)]', dot: 'bg-[var(--c-bad)]' },
};

/**
 * Estados de una recepción.
 *
 * Aparte de ESTADO_TAREA a propósito. La recepción se pintaba reusando
 * aquellos: `cerrada` salía como «Completado» y `con_diferencias` como
 * «Devuelto», que en el resto del sistema significa que auditoría o
 * facturación rechazaron una tarea y la mandaron de vuelta. Nadie devolvió
 * nada: llegó mercancía que no cuadra. Quien leía la lista entendía lo que no
 * era.
 */
export const ESTADO_RECEPCION = {
  en_curso: { label: 'Recibiendo', bg: 'bg-[var(--c-info)]/8', text: 'text-[var(--c-info)]', dot: 'bg-[var(--c-info)]' },
  cerrada: { label: 'Conforme', bg: 'bg-[var(--c-ok-dim)]/8', text: 'text-[var(--c-ok-dim)]', dot: 'bg-[var(--c-ok-dim)]' },
  con_diferencias: { label: 'Con incidencia', bg: 'bg-[var(--c-warn)]/8', text: 'text-[var(--c-warn)]', dot: 'bg-[var(--c-warn)]' },
};

// Lot expiry states
export const ESTADO_FV = {
  vencido: { label: 'Vencido', bg: 'bg-[var(--c-bad)]/9', text: 'text-[var(--c-bad)]', dot: 'bg-[var(--c-bad)]' },
  critico: { label: 'Crítico', bg: 'bg-[var(--c-bad)]/6', text: 'text-[var(--c-bad)]', dot: 'bg-[var(--c-bad)]' },
  por_vencer: { label: 'Por vencer', bg: 'bg-[var(--c-warn)]/8', text: 'text-[var(--c-warn)]', dot: 'bg-[var(--c-warn)]' },
  vigente: { label: 'Vigente', bg: 'bg-[var(--c-ok-dim)]/8', text: 'text-[var(--c-ok-dim)]', dot: 'bg-[var(--c-ok-dim)]' },
  sin_fecha: { label: 'Sin fecha', bg: 'bg-[var(--c-gray)]/8', text: 'text-[var(--c-gray)]', dot: 'bg-[var(--c-gray)]' },
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

const CLASIF_MERMA_CON_FACT = [
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
  // Las que faltaban del catálogo de TKC. Sin ellas, quien clasificaba un
  // ajuste tenía que elegir la más parecida, y el motivo real se perdía.
  'Fitosanitario e Higiene',
  'Higiene',
  'Veterinario',
  'Creación de anuncio',
  'Reserva Transporte',
  'Módulo para trabajadores',
  'Error Fact +-',
  'Merma de Origen',
  'Reposición del proveedor',
  'Intercambio de Producto',
]

/**
 * Clasificación de un ajuste de inventario.
 *
 * Es la MISMA lista que usa facturación: el motivo por el que la existencia no
 * cuadra no cambia según quién lo escriba, y tener dos vocabularios obligaba a
 * traducir de uno a otro —inventario decía «Faltante por robo» y facturación
 * «Robo»— con la pérdida de detalle que eso trae.
 *
 * Antes inventario solo ofrecía siete opciones genéricas.
 */
export const CLASIF_AJUSTE = CLASIF_FACT

/**
 * La lista con el valor ya guardado dentro, aunque sea de una versión vieja.
 *
 * Al unificar los vocabularios, un registro clasificado como «Faltante por
 * robo» dejó de tener su opción en el desplegable: al abrirlo salía vacío y el
 * primer guardado le borraba la clasificación sin que nadie lo pidiera.
 */
export function conValorActual(lista, valor) {
  if (!valor || lista.includes(valor)) return lista
  return [valor, ...lista]
}

// Estado FACT
export const ESTADO_FACT = [
  'Pendiente a retiro',
  'Retirado',
  'Sin existencias en TKC',
  'Solicitud de retiro duplicado',
  'Proveedor Incorrecto',
  'Ajuste de aumento',
  // El contrario de 'Ajuste de aumento'. Faltaba: un sobrante tenía cómo
  // resolverse y un faltante no, así que acababa en estados del retiro
  // ('Pendiente a retiro') que describen otra cosa.
  'Ajuste de disminución',
  // Intercambio entre productos similares. Con qué producto se intercambió y
  // a qué precio va en las notas de FACT: el registro guarda un solo producto.
  'Procesamiento',
  // Un faltante que salió hacia otro almacén sin documento: se resuelve montando
  // la transferencia.
  'Transferencia',
  'Recontar',
]

/**
 * Tipos de caso de anuncio, uno por estado de `apGlobalV2` que merece
 * expediente.
 *
 * `muerto_ef_positivo` se separó de `desact_ef_positivo` porque meter los dos
 * bajo la etiqueta «DESACT EF>0» confundía: en Anuncios salían tres casos y el
 * filtro «DESACTIVADO EF>0» del catálogo devolvía cero, porque esos tres eran
 * muertos, no desactivados. Son estados distintos en TKC y tienen que verse
 * distintos aquí.
 */
export const TIPO_CASO_LABELS = {
  muerto_ef_positivo: { label: 'MUERTO EF>0', bg: 'bg-[var(--c-bad)]/8', text: 'text-[var(--c-bad)]' },
  desact_ef_positivo: { label: 'DESACT EF>0', bg: 'bg-[var(--c-orange)]/8', text: 'text-[var(--c-orange)]' },
  sin_id: { label: 'Sin ID', bg: 'bg-[var(--c-warn)]/8', text: 'text-[var(--c-warn)]' },
  activo_ef_cero: { label: 'Activo EF=0', bg: 'bg-[var(--c-gray)]/8', text: 'text-[var(--c-gray)]' },
};