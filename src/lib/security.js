// ── Mapa de permisos por rol ──────────────────────────────
// Define qué acciones puede ejecutar cada rol sobre cada recurso.
// administrador tiene acceso total (no aparece en el mapa).
const ROLE_PERMISSIONS = {
  inv: {
    mermas:         ['read', 'create'],
    inventarios:    ['read', 'create'],
    lotes:          ['read', 'create_ic'],
    recepciones:    ['read', 'create', 'update'],
    anuncios:       ['read', 'process_inv'],
    productos:      ['read', 'import_stock'],
    notificaciones: ['read', 'mark_read'],
  },
  fact: {
    mermas:         ['read', 'process_fact'],
    inventarios:    ['read', 'process_fact'],
    productos:      ['read'],
    notificaciones: ['read', 'mark_read'],
  },
  auditor: {
    mermas:         ['read', 'audit'],
    inventarios:    ['read', 'audit'],
    anuncios:       ['read', 'audit'],
    lotes:          ['read'],
    productos:      ['read'],
    reportes:       ['read'],
    auditoria:      ['read'],
    notificaciones: ['read', 'mark_read'],
  },
  ca: {
    anuncios:       ['read', 'process_ca'],
    lotes:          ['read', 'create_ic'],
    productos:      ['read'],
    notificaciones: ['read', 'mark_read'],
  },
  supervisor: {
    recepciones:    ['read', 'resolve_diferencias'],
    productos:      ['read', 'update'],
    notificaciones: ['read', 'mark_read'],
  },
  jefe_depto: {
    mermas:                  ['read', 'comment'],
    inventarios:             ['read', 'comment'],
    anuncios:                ['read', 'comment'],
    lotes:                   ['read', 'comment'],
    lotes_ic:                ['read', 'comment'],
    recepciones:             ['read', 'comment'],
    productos:               ['read'],
    reportes:                ['read'],
    notificaciones:          ['read', 'mark_read'],
    comentarios_supervision: ['read', 'create'],
  },
};

/**
 * Verifica si un rol tiene permiso para una acción sobre un recurso.
 * administrador tiene acceso total.
 */
export function hasPermission(role, resource, action) {
  if (role === 'administrador') return true;
  return (ROLE_PERMISSIONS[role]?.[resource] || []).includes(action);
}

/** Lanza un error si el rol no tiene el permiso indicado. */
export function assertPermission(role, resource, action) {
  if (!hasPermission(role, resource, action)) {
    throw new Error(`No autorizado: rol '${role}' no puede ejecutar '${action}' en '${resource}'`);
  }
}

// ── Sanitización de texto (prevención XSS básica) ─────────
const DANGEROUS_CHARS = /[<>'"&]/g;
const CHAR_ENTITIES = { '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '&': '&amp;' };

/** Escapa caracteres HTML peligrosos en un string. */
export function sanitizeText(input, maxLen = 2000) {
  if (typeof input !== 'string') return input;
  return input
    .replace(DANGEROUS_CHARS, c => CHAR_ENTITIES[c] || c)
    .slice(0, maxLen);
}

/** Sanitiza todos los campos string de un objeto plano. */
export function sanitizeObject(obj, maxLen = 500) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      typeof v === 'string' ? sanitizeText(v, maxLen) : v,
    ])
  );
}

// ── Validación de cantidades ──────────────────────────────
/**
 * Valida un valor numérico. Retorna string con el error o null si es válido.
 */
export function validateQuantity(value, opts = {}) {
  const {
    min     = 0,
    max     = 9_999_999,
    integer = false,
    label   = 'Cantidad',
  } = opts;

  if (value === '' || value === null || value === undefined) {
    return `${label} es requerida`;
  }
  const n = Number(value);
  if (isNaN(n) || !isFinite(n)) return `${label} inválida`;
  if (integer && !Number.isInteger(n))  return `${label} debe ser un número entero`;
  if (n < min) return `${label} mínimo permitido: ${min}`;
  if (n > max) return `${label} máximo permitido: ${max.toLocaleString('es')}`;
  return null;
}

// ── Sanitización de errores de Supabase ───────────────────
// Evita exponer detalles internos (nombres de tablas, consultas SQL, JWT info).
export function sanitizeError(error) {
  if (!error) return 'Error inesperado';
  const msg = (error.message || '').toLowerCase();

  if (msg.includes('jwt') || msg.includes('token') || msg.includes('auth')) {
    return 'Error de sesión — vuelve a iniciar sesión';
  }
  if (msg.includes('violates') || msg.includes('constraint') || msg.includes('unique')) {
    return 'Datos duplicados o inválidos';
  }
  if (msg.includes('permission') || msg.includes('denied') || msg.includes('policy')) {
    return 'Sin permisos para esta operación';
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Error de conexión — verifica tu red';
  }

  return 'Error inesperado — intenta de nuevo o contacta soporte';
}

// ── Validación de archivos de importación ─────────────────
export const IMPORT_LIMITS = {
  MAX_FILE_SIZE_BYTES: 5 * 1024 * 1024,  // 5 MB
  MAX_ROWS:            5_000,
  MAX_QTY:             9_999_999,
  ALLOWED_EXTENSIONS:  ['csv'],
};

export function validateImportFile(file) {
  if (!file) return 'Selecciona un archivo';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!IMPORT_LIMITS.ALLOWED_EXTENSIONS.includes(ext)) {
    return `Solo se permiten archivos: ${IMPORT_LIMITS.ALLOWED_EXTENSIONS.join(', ').toUpperCase()}`;
  }
  if (file.size > IMPORT_LIMITS.MAX_FILE_SIZE_BYTES) {
    return `El archivo excede 5MB (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  }
  return null;
}
