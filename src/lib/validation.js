import { z } from 'zod';

// ── Helpers ──────────────────────────────────────────────

const positiveInt = (max = 100_000, label = 'Cantidad') =>
  z
    .number({ invalid_type_error: `${label} debe ser numérica`, required_error: `${label} requerida` })
    .int(`${label} debe ser un número entero`)
    .positive(`${label} debe ser mayor a 0`)
    .max(max, `${label} no puede superar ${max.toLocaleString('es')}`);

const nonNegativeNum = (max = 9_999_999, label = 'Valor') =>
  z
    .number({ invalid_type_error: `${label} debe ser numérico` })
    .min(0, `${label} no puede ser negativo`)
    .max(max, `${label} no puede superar ${max.toLocaleString('es')}`)
    .finite(`${label} inválido`);

export const shortText  = z.string().max(200, 'Máximo 200 caracteres');
export const notes      = z.string().max(500, 'Máximo 500 caracteres').optional().default('');

// ── Merma ────────────────────────────────────────────────
export const mermaSchema = z.object({
  cantidad:              positiveInt(100_000),
  clasif_merma:          z.string().min(1, 'Clasificación requerida').max(200),
  notas:                 notes,
  destino_final:         shortText.optional().default(''),
  rebaja_confirmada:     z.boolean().optional().default(false),
  fecha_rebaja_tienda:   z.string().optional().default(''),
  fecha_vencimiento_lote:z.string().optional().default(''),
});

// ── Inventario ───────────────────────────────────────────
export const inventarioDetalleSchema = z.object({
  cantidad:         nonNegativeNum(100_000),
  no_lote:          shortText.optional().default(''),
  fecha_vencimiento:z.string().optional().default(''),
});

export const inventarioSchema = z.object({
  detalles:   z.array(inventarioDetalleSchema).min(1, 'Agregar al menos un detalle'),
  notas_inv:  notes,
  clasif_ajuste: shortText.optional().default(''),
});

// ── Recepción ────────────────────────────────────────────
export const recepcionItemSchema = z.object({
  cant_esperada: nonNegativeNum(999_999, 'Cant. esperada').optional(),
  cant_recibida: nonNegativeNum(999_999, 'Cant. recibida'),
  no_lote:       shortText.optional().default(''),
  fecha_vencimiento: z.string().optional().default(''),
});

// ── Producto ─────────────────────────────────────────────
export const productoUpdateSchema = z.object({
  exist_fisica:  nonNegativeNum(9_999_999, 'Existencia física').optional(),
  almacen:       nonNegativeNum(9_999_999, 'Almacén').optional(),
  tienda:        nonNegativeNum(9_999_999, 'Tienda').optional(),
  precio:        nonNegativeNum(9_999_999, 'Precio').optional(),
  precio_costo:  nonNegativeNum(9_999_999, 'Precio costo').optional(),
  stock_minimo:  nonNegativeNum(999_999,   'Stock mínimo').optional(),
});

// ── Importación CSV ──────────────────────────────────────
export const importRowSchema = z.object({
  codigo:   z.string().min(1, 'Código vacío').max(200),
  cantidad: nonNegativeNum(9_999_999),
});

// ── Lote IC ──────────────────────────────────────────────
export const loteIcSchema = z.object({
  cant_x_vencer:      positiveInt(999_999, 'Cantidad por vencer'),
  propuesta_precio_ic:nonNegativeNum(9_999_999, 'Precio IC').optional(),
  precio_restaurar:   nonNegativeNum(9_999_999, 'Precio a restaurar').optional(),
  clasif_inv:         shortText.optional().default(''),
  nota_inv:           notes,
  notas_ic:           notes,
});

// ── Helper: formatear errores Zod para mostrar al usuario ─
export function formatZodError(result) {
  if (result.success) return null;
  const first = result.error.issues[0];
  return first ? first.message : 'Datos inválidos';
}

/** Valida un objeto contra un schema Zod. Retorna { ok, error, data }. */
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, data: result.data, error: null };
  return { ok: false, data: null, error: formatZodError(result) };
}
