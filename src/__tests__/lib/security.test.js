import { describe, it, expect } from 'vitest';
import {
  hasPermission,
  assertPermission,
  sanitizeText,
  sanitizeObject,
  validateQuantity,
  sanitizeError,
  validateImportFile,
  IMPORT_LIMITS,
} from '@/lib/security';

describe('hasPermission', () => {
  it('administrador tiene acceso total a cualquier recurso/acción', () => {
    expect(hasPermission('administrador', 'mermas', 'delete_all')).toBe(true);
    expect(hasPermission('administrador', 'algo_inventado', 'accion_inventada')).toBe(true);
  });

  it('permite una acción listada explícitamente para el rol', () => {
    expect(hasPermission('inv', 'mermas', 'create')).toBe(true);
    expect(hasPermission('fact', 'mermas', 'process_fact')).toBe(true);
  });

  it('rechaza una acción no listada para el rol', () => {
    expect(hasPermission('inv', 'mermas', 'process_fact')).toBe(false);
    expect(hasPermission('auditor', 'productos', 'update')).toBe(false);
  });

  it('rechaza un rol o recurso inexistente sin lanzar', () => {
    expect(hasPermission('rol_inventado', 'mermas', 'read')).toBe(false);
    expect(hasPermission('inv', 'recurso_inventado', 'read')).toBe(false);
  });

  it('supervisor tiene los permisos asignados (recepciones, productos)', () => {
    expect(hasPermission('supervisor', 'recepciones', 'resolve_diferencias')).toBe(true);
    expect(hasPermission('supervisor', 'productos', 'update')).toBe(true);
    expect(hasPermission('supervisor', 'mermas', 'create')).toBe(false);
  });
});

describe('assertPermission', () => {
  it('no lanza cuando el rol sí tiene el permiso', () => {
    expect(() => assertPermission('inv', 'mermas', 'create')).not.toThrow();
  });

  it('lanza un error descriptivo cuando el rol no tiene el permiso', () => {
    expect(() => assertPermission('inv', 'mermas', 'process_fact')).toThrow(/no autorizado/i);
  });
});

describe('sanitizeText', () => {
  it('escapa caracteres HTML peligrosos', () => {
    expect(sanitizeText('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
  });

  it('escapa comillas simples y el ampersand', () => {
    expect(sanitizeText(`it's "quoted" & more`)).toBe('it&#39;s &quot;quoted&quot; &amp; more');
  });

  it('trunca al largo máximo indicado', () => {
    expect(sanitizeText('abcdefghij', 5)).toBe('abcde');
  });

  it('devuelve el valor tal cual si no es un string', () => {
    expect(sanitizeText(42)).toBe(42);
    expect(sanitizeText(null)).toBe(null);
    expect(sanitizeText(undefined)).toBe(undefined);
  });

  it('no modifica texto sin caracteres peligrosos', () => {
    expect(sanitizeText('Producto normal 123')).toBe('Producto normal 123');
  });
});

describe('sanitizeObject', () => {
  it('sanitiza solo los campos de tipo string', () => {
    const result = sanitizeObject({ nombre: '<b>Juan</b>', cantidad: 10, activo: true });
    expect(result.nombre).toBe('&lt;b&gt;Juan&lt;/b&gt;');
    expect(result.cantidad).toBe(10);
    expect(result.activo).toBe(true);
  });

  it('respeta el maxLen indicado para cada campo string', () => {
    const result = sanitizeObject({ notas: 'x'.repeat(100) }, 10);
    expect(result.notas).toHaveLength(10);
  });

  it('devuelve el valor tal cual si no es un objeto', () => {
    expect(sanitizeObject(null)).toBe(null);
    expect(sanitizeObject('texto')).toBe('texto');
  });
});

describe('validateQuantity', () => {
  it('rechaza valores vacíos', () => {
    expect(validateQuantity('')).toMatch(/requerida/i);
    expect(validateQuantity(null)).toMatch(/requerida/i);
    expect(validateQuantity(undefined)).toMatch(/requerida/i);
  });

  it('rechaza valores no numéricos', () => {
    expect(validateQuantity('abc')).toMatch(/inválida/i);
  });

  it('rechaza por debajo del mínimo', () => {
    expect(validateQuantity(-1, { min: 0 })).toMatch(/mínimo/i);
  });

  it('rechaza por encima del máximo', () => {
    expect(validateQuantity(100, { max: 50 })).toMatch(/máximo/i);
  });

  it('rechaza no-enteros cuando integer=true', () => {
    expect(validateQuantity(2.5, { integer: true })).toMatch(/entero/i);
  });

  it('acepta un valor válido dentro de rango', () => {
    expect(validateQuantity(10, { min: 0, max: 100 })).toBeNull();
  });

  it('acepta el límite exacto (min y max inclusive)', () => {
    expect(validateQuantity(0, { min: 0, max: 100 })).toBeNull();
    expect(validateQuantity(100, { min: 0, max: 100 })).toBeNull();
  });
});

describe('sanitizeError', () => {
  it('devuelve un mensaje genérico si no hay error', () => {
    expect(sanitizeError(null)).toBe('Error inesperado');
  });

  it('detecta errores de sesión/token', () => {
    expect(sanitizeError({ message: 'JWT expired' })).toMatch(/sesión/i);
  });

  it('detecta violaciones de restricción única/duplicados', () => {
    expect(sanitizeError({ message: 'duplicate key value violates unique constraint' })).toMatch(/duplicad/i);
  });

  it('detecta errores de permisos', () => {
    expect(sanitizeError({ message: 'permission denied for table productos' })).toMatch(/permisos/i);
  });

  it('detecta errores de red', () => {
    expect(sanitizeError({ message: 'network error' })).toMatch(/conexión/i);
  });

  it('no expone el mensaje técnico crudo de Supabase para errores no reconocidos', () => {
    const raw = 'relation "productos" does not exist at character 15';
    const result = sanitizeError({ message: raw });
    // El mensaje sanitizado debe seguir siendo útil pero no idéntico al crudo de Postgres
    expect(result).not.toBe(raw);
  });
});

describe('validateImportFile', () => {
  it('rechaza si no hay archivo', () => {
    expect(validateImportFile(null)).toMatch(/selecciona/i);
  });

  it('rechaza extensiones no permitidas', () => {
    const file = { name: 'productos.xlsx', size: 1000 };
    expect(validateImportFile(file)).toMatch(/csv/i);
  });

  it('rechaza archivos que exceden el tamaño máximo', () => {
    const file = { name: 'productos.csv', size: IMPORT_LIMITS.MAX_FILE_SIZE_BYTES + 1 };
    expect(validateImportFile(file)).toMatch(/5MB/i);
  });

  it('acepta un CSV dentro del límite de tamaño', () => {
    const file = { name: 'productos.csv', size: 1024 };
    expect(validateImportFile(file)).toBeNull();
  });
});
