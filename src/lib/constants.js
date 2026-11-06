// Role configuration
export const ROLES = {
  inv:          { label: 'Inventarista',    color: 'bg-primary text-primary-foreground' },
  fact:         { label: 'Facturación',     color: 'bg-warning text-warning-foreground' },
  auditor:      { label: 'Auditor',         color: 'bg-success text-success-foreground' },
  ca:           { label: 'Comercial',       color: 'bg-coral text-coral-foreground' },
  ic:           { label: 'Intervención',    color: 'bg-warning text-warning-foreground' },
  supervisor:   { label: 'Supervisor',      color: 'bg-neutral text-neutral-foreground' },
  jefe_depto:   { label: 'Jefe de Depto.', color: 'bg-[#6366F1] text-white' },
  jefe_inventario:  { label: 'Jefe de Inventario',   color: 'bg-[#6366F1] text-white' },
  jefe_facturacion: { label: 'Jefe de Facturación',  color: 'bg-[#6366F1] text-white' },
  jefe_ca:          { label: 'Jefe de Creación de Anuncio', color: 'bg-[#6366F1] text-white' },
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

/**
 * LA clasificación: una sola lista para conteos, mermas y facturación (Clasificación
 * Ajuste TKC). El motivo por el que la existencia no cuadra no cambia según quién
 * lo escriba, y dos vocabularios obligaban a traducir de uno a otro. Está tal como
 * la usa quien factura; no se corrige la ortografía aunque falten acentos, porque es
 * el texto que se guarda y se busca.
 */
export const CLASIFICACIONES = [
  'Faltante Inventario',
  'Sobrante en inventario',
  'Sustitucion de inventario',
  'Incidencias Picker',
  'Reposicion de inventario',
  'Reposicion productos sobreventa',
  'Robo',
  'Transferencia almacén Externo',
  'Cuenta casa atenciones',
  'Cuenta casa eventos',
  'Devolucion a proveedor',
  'Error contable-Fac NO',
  'Error contable-Fact - o +',
  'Error contable-Inventario',
  'Faltante de origen',
  'Producto incontable',
  'Reclasificacion de calidad',
  'Responsabilidad de materiales',
  'Venta Directa',
  'Venta SP',
  'Merma-Manipulacion',
  'Merma-Ratones',
  'Merma-FV',
  'Mal estado-Sin presencia comercial',
  'Mal estado-sin calidad',
  'Salida de insumos-Medios Basicos',
  'Salida de insumos-Preparacion ordenes',
  'Salida de insumos-Mantenimiento',
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
  'Procesamiento-PP',
  'Procesamiento-Fact',
  'Error contable-VD',
  'Mal estado-solo AC-VD',
  'Fitosanitario e Higiene',
  'Creación de anuncio',
  'Higiene',
  'Reserva Transporte',
  'Veterinario',
  'Modulo para trabajadores',
  'Error Fact +-',
  'Merma de Origen',
  'Reposicion del provedor',
  'Intercambio de Producto',
  'En investigación',
  'Reclasificacion del producto',
  'Transferencia de Latino no registrada',
  'Sobrante de Origen',
  'Devolucion por Merma FF-Yeya',
];

/**
 * Las mermas con estas clasificaciones NO pasan por facturación: son consumo interno
 * o trámites que no mueven la factura, y van directo a auditoría.
 *
 * Incluye también los nombres de ANTES de unificar la lista («Cuenta casa — Administrativa
 * Eli»…): hay mermas guardadas así y no pueden empezar a pedir facturación de pronto.
 */
export const CLASIF_MERMA_SIN_FACT = [
  'Cuenta casa atenciones',
  'Cuenta casa eventos',
  'Cuenta casa administrativa-Eli',
  'Cuenta casa administrativa-Mandy padre',
  'Cuenta casa administrativa-Yanet',
  'Cuenta casa administrativa-Belkis',
  'Cuenta casa administrativa-Pablo',
  'Cuenta casa administrativa-Rene',
  'Fitosanitario e Higiene',
  'Higiene',
  'Creación de anuncio',
  'Veterinario',
  'Reclasificacion de calidad',
  'Reclasificacion del producto',
  // Los nombres anteriores, para las mermas que ya existen.
  'Cuenta casa — Administrativa Eli',
  'Cuenta casa — Administrativa Mandy padre',
  'Cuenta casa — Administrativa Yanet',
  'Cuenta casa — Administrativa Belkis',
  'Cuenta casa — Administrativa Pablo',
  'Cuenta casa — Administrativa René',
  'Cuenta casa — Atenciones',
  'Cuenta casa — Eventos',
  'Fitosanitario e higiene',
  'Reclasificación de calidad',
];

export const ALL_CLASIF_MERMA = CLASIFICACIONES;

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
export const CLASIF_FACT = CLASIFICACIONES

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