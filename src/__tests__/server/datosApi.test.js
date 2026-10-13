import { describe, it, expect, vi, beforeEach } from 'vitest';

// La base y la sesión se sustituyen: lo que se prueba aquí es el SQL que se
// construye y a quién se le deja hacer qué, no Postgres.
const query = vi.hoisted(() => vi.fn());
const queryOne = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
vi.mock('@/server/db', () => ({ query, queryOne, transaction }));

const resolverSesion = vi.hoisted(() => vi.fn());
vi.mock('@/server/session', () => ({ resolverSesion }));

// Columnas reales de las tablas que tocan estas pruebas.
const COLUMNAS = {
  mermas: ['id', 'estado_tarea', 'especialista_id', 'cantidad', 'created_date', 'fact_no_factura', 'auditor_id'],
  notificaciones: ['id', 'usuario_id', 'leida', 'titulo', 'created_date'],
  lotes_vigencia: ['id', 'estado_fv', 'created_date'],
};

const { createDatosApiMiddleware } = await import('@/server/datosApi');
const { _limpiarCache } = await import('@/server/columnas');

/** Petición y respuesta mínimas con la interfaz que usa el middleware. */
function peticion(url, cuerpo, metodo = 'POST') {
  const manejadores = {};
  const req = {
    url, method: metodo, headers: {},
    on: (ev, fn) => {
      manejadores[ev] = fn;
      // Se emite al registrar 'end', no antes: el middleware resuelve la
      // sesión primero y solo entonces lee el cuerpo, así que emitir al
      // construir la petición dejaría los datos sin nadie escuchando.
      if (ev === 'end') {
        queueMicrotask(() => {
          manejadores.data?.(JSON.stringify(cuerpo ?? {}));
          manejadores.end?.();
        });
      }
      return req;
    },
  };
  return req;
}

function respuesta() {
  const r = {
    statusCode: 0, cuerpo: null, cabeceras: {},
    setHeader: (k, v) => { r.cabeceras[k] = v; },
    getHeader: (k) => r.cabeceras[k],
    end: (c) => { r.cuerpo = c ? JSON.parse(c) : null; },
  };
  return r;
}

const mw = createDatosApiMiddleware();

async function llamar(url, cuerpo) {
  const res = respuesta();
  await mw(peticion(url, cuerpo), res, () => { res.statusCode = 999; });
  return res;
}

/** Última consulta SQL ejecutada, normalizada. */
const ultimoSql = () => query.mock.calls.at(-1)?.[0].replace(/\s+/g, ' ').trim();
const ultimosValores = () => query.mock.calls.at(-1)?.[1];

beforeEach(() => {
  query.mockReset();
  queryOne.mockReset();
  transaction.mockReset();
  resolverSesion.mockReset();
  _limpiarCache();

  // information_schema devuelve las columnas; el resto, filas vacías.
  query.mockImplementation(async (sql, valores) => {
    if (sql.includes('information_schema.columns')) {
      const tabla = valores[0];
      return { rows: (COLUMNAS[tabla] ?? []).map((c) => ({ column_name: c })) };
    }
    if (sql.includes('count(*)')) return { rows: [{ total: 7 }] };
    return { rows: [] };
  });

  resolverSesion.mockResolvedValue({
    email: 'yo@mercadoelineas.com',
    usuario: { role: 'inv', email: 'yo@mercadoelineas.com' },
  });
});

describe('enrutado', () => {
  it('deja pasar lo que no es /api/datos/', async () => {
    const res = await llamar('/api/tkc/inventario', {});
    expect(res.statusCode).toBe(999); // llamó a next()
  });

  it('una entidad no mapeada da 404', async () => {
    const res = await llamar('/api/datos/Inventada/list', {});
    expect(res.statusCode).toBe(404);
  });

  it('una acción desconocida da 404', async () => {
    const res = await llamar('/api/datos/Merma/explotar', {});
    expect(res.statusCode).toBe(404);
  });
});

describe('sesión', () => {
  it('sin sesión, 401 y no se consulta nada', async () => {
    resolverSesion.mockResolvedValue(null);
    const res = await llamar('/api/datos/Merma/list', {});
    expect(res.statusCode).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('list y filter', () => {
  it('ordena y limita', async () => {
    await llamar('/api/datos/Merma/list', { orderBy: '-created_date', limit: 50 });
    expect(ultimoSql()).toContain('ORDER BY "created_date" DESC');
    expect(ultimoSql()).toContain('LIMIT 50');
  });

  it('una columna de orden desconocida cae al orden por defecto en vez de fallar', async () => {
    await llamar('/api/datos/Merma/list', { orderBy: 'columna_inventada' });
    expect(ultimoSql()).toContain('ORDER BY "created_date" DESC');
  });

  it('las condiciones van parametrizadas, nunca interpoladas', async () => {
    await llamar('/api/datos/Merma/filter', { conditions: { estado_tarea: 'pend_fact' } });
    expect(ultimoSql()).toContain('WHERE "estado_tarea" = $1');
    expect(ultimosValores()).toEqual(['pend_fact']);
  });

  it('un array se traduce a IN', async () => {
    await llamar('/api/datos/Merma/filter', { conditions: { estado_tarea: ['pend_fact', 'en_auditoria'] } });
    expect(ultimoSql()).toContain('IN ($1, $2)');
    expect(ultimosValores()).toEqual(['pend_fact', 'en_auditoria']);
  });

  it('null se traduce a IS NULL', async () => {
    await llamar('/api/datos/Merma/filter', { conditions: { auditor_id: null } });
    expect(ultimoSql()).toContain('"auditor_id" IS NULL');
  });

  it('count devuelve el total sin traer filas', async () => {
    const res = await llamar('/api/datos/Merma/count', { conditions: { estado_tarea: 'pend_fact' } });
    expect(res.cuerpo).toEqual({ count: 7 });
    expect(ultimoSql()).toContain('count(*)');
  });
});

describe('identificadores: la defensa que antes ponía PostgREST', () => {
  it('una columna inventada en las condiciones da 400', async () => {
    const res = await llamar('/api/datos/Merma/filter', { conditions: { no_existe: 1 } });
    expect(res.statusCode).toBe(400);
    expect(res.cuerpo.error).toMatch(/Columna desconocida/);
  });

  it('un intento de inyección por el nombre de columna da 400', async () => {
    const res = await llamar('/api/datos/Merma/filter', {
      conditions: { 'id = 1 OR 1=1 --': 'x' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('las columnas que no existen se descartan al crear, no se inyectan', async () => {
    resolverSesion.mockResolvedValue({
      email: 'yo@mercadoelineas.com',
      usuario: { role: 'inv', email: 'yo@mercadoelineas.com' },
    });
    queryOne.mockResolvedValue({ id: 'm1' });
    await llamar('/api/datos/Merma/create', {
      data: { especialista_id: 'yo@mercadoelineas.com', cantidad: 2, columna_falsa: 'x' },
    });
    const sql = queryOne.mock.calls.at(-1)[0];
    expect(sql).not.toContain('columna_falsa');
    expect(sql).toContain('"especialista_id"');
  });
});

describe('filas propias', () => {
  it('las notificaciones se filtran por el propio email aunque el cliente no lo pida', async () => {
    await llamar('/api/datos/Notificacion/list', {});
    expect(ultimoSql()).toContain('"usuario_id" = $1');
    expect(ultimosValores()).toEqual(['yo@mercadoelineas.com']);
  });

  it('el cliente no puede pedir las de otro: el servidor impone el filtro', async () => {
    await llamar('/api/datos/Notificacion/filter', {
      conditions: { usuario_id: 'otro@mercadoelineas.com' },
    });
    expect(ultimosValores()).toEqual(['yo@mercadoelineas.com']);
  });

  it('un admin las ve todas', async () => {
    resolverSesion.mockResolvedValue({
      email: 'jefe@mercadoelineas.com',
      usuario: { role: 'administrador', email: 'jefe@mercadoelineas.com' },
    });
    await llamar('/api/datos/Notificacion/list', {});
    expect(ultimoSql()).not.toContain('usuario_id');
  });
});

describe('permisos en la escritura', () => {
  it('inv no crea una merma a nombre de otro', async () => {
    const res = await llamar('/api/datos/Merma/create', {
      data: { especialista_id: 'otro@mercadoelineas.com', cantidad: 1 },
    });
    expect(res.statusCode).toBe(403);
    expect(queryOne).not.toHaveBeenCalled();
  });

  it('la actualización bloquea el salto de estado', async () => {
    // Se simula la transacción: devuelve la fila y deja correr la lógica.
    transaction.mockImplementation(async (fn) => fn({
      query: async (sql) => sql.startsWith('SELECT')
        ? { rows: [{ id: 'm1', estado_tarea: 'en_curso' }] }
        : { rows: [{ id: 'm1' }] },
    }));

    const res = await llamar('/api/datos/Merma/update', {
      id: 'm1', data: { estado_tarea: 'completado' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('la actualización válida pasa', async () => {
    transaction.mockImplementation(async (fn) => fn({
      query: async (sql) => sql.startsWith('SELECT')
        ? { rows: [{ id: 'm1', estado_tarea: 'en_curso' }] }
        : { rows: [{ id: 'm1', estado_tarea: 'pend_fact' }] },
    }));

    const res = await llamar('/api/datos/Merma/update', {
      id: 'm1', data: { estado_tarea: 'pend_fact' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.cuerpo.data.estado_tarea).toBe('pend_fact');
  });

  it('la fila se bloquea con FOR UPDATE antes de decidir', async () => {
    // Sin el bloqueo, dos transiciones simultáneas podrían colarse las dos:
    // RLS evaluaba el USING dentro del propio UPDATE, de forma atómica.
    let sqlLectura = '';
    transaction.mockImplementation(async (fn) => fn({
      query: async (sql) => {
        if (sql.startsWith('SELECT')) { sqlLectura = sql; return { rows: [{ id: 'm1', estado_tarea: 'en_curso' }] }; }
        return { rows: [{ id: 'm1' }] };
      },
    }));

    await llamar('/api/datos/Merma/update', { id: 'm1', data: { cantidad: 3 } });
    expect(sqlLectura).toContain('FOR UPDATE');
  });

  it('borrar algo que no existe da 404', async () => {
    transaction.mockImplementation(async (fn) => fn({ query: async () => ({ rows: [] }) }));
    const res = await llamar('/api/datos/Merma/delete', { id: 'nope' });
    expect(res.statusCode).toBe(404);
  });

  it('actualizar sin id da 400', async () => {
    const res = await llamar('/api/datos/Merma/update', { data: { cantidad: 1 } });
    expect(res.statusCode).toBe(400);
  });
});

describe('solo lectura', () => {
  it('no se puede escribir en una vista', async () => {
    const res = await llamar('/api/datos/Lote/create', { data: { estado_fv: 'critico' } });
    expect(res.statusCode).toBe(405);
  });

  it('pero sí leerla', async () => {
    const res = await llamar('/api/datos/Lote/list', {});
    expect(res.statusCode).toBe(200);
  });
});
