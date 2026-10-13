/**
 * Cliente de datos del navegador.
 *
 * Antes armaba consultas de Supabase; ahora llama a la API de este servidor.
 * Lo que hay que fijar sigue siendo lo mismo: que la petición se forme bien.
 * Un fallo aquí no rompe nada de forma visible —devuelve un número equivocado
 * o un listado vacío, en silencio—, que es justo lo que lo hace peligroso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal('fetch', fetchMock);

const { base44 } = await import('@/api/base44Client');

/** Lo que se mandó en la última llamada. */
const ultima = () => {
  const [url, opciones] = fetchMock.mock.calls.at(-1);
  return { url, cuerpo: JSON.parse(opciones.body), opciones };
};

const responder = (datos, ok = true, status = 200) =>
  fetchMock.mockResolvedValue({ ok, status, json: async () => datos });

beforeEach(() => {
  fetchMock.mockReset();
  responder({ data: [], count: 0 });
});

describe('forma de la petición', () => {
  it('apunta al endpoint de la entidad y la acción', async () => {
    await base44.entities.Merma.list();
    expect(ultima().url).toBe('/api/datos/Merma/list');
  });

  it('manda las cookies: sin ellas el servidor responde 401', async () => {
    await base44.entities.Merma.list();
    expect(ultima().opciones.credentials).toBe('include');
  });

  it('una entidad no mapeada falla en el cliente, sin llamar al servidor', async () => {
    expect(() => base44.entities.Inventada).toThrow(/no mapeada/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('count()', () => {
  it('devuelve el total', async () => {
    responder({ count: 7 });
    expect(await base44.entities.Merma.count()).toBe(7);
  });

  it('devuelve 0 si el servidor no manda count, en vez de undefined', async () => {
    responder({});
    expect(await base44.entities.Merma.count()).toBe(0);
  });

  it('pasa las condiciones tal cual, incluidos los arrays', async () => {
    // El servidor traduce el array a IN; aquí solo se comprueba que viaja.
    await base44.entities.Lote.count({ estado_fv: ['critico', 'vencido'] });
    expect(ultima().cuerpo.conditions).toEqual({ estado_fv: ['critico', 'vencido'] });
  });

  it('combina varias condiciones', async () => {
    await base44.entities.Merma.count({ estado_tarea: 'pendiente', almacen_num: '001' });
    expect(ultima().cuerpo.conditions).toEqual({ estado_tarea: 'pendiente', almacen_num: '001' });
  });
});

describe('list y filter', () => {
  it('pasa orden y límite', async () => {
    await base44.entities.Merma.list('-fecha_inv', 50);
    expect(ultima().cuerpo).toEqual({ orderBy: '-fecha_inv', limit: 50 });
  });

  it('devuelve [] si el servidor no manda data, en vez de undefined', async () => {
    responder({});
    expect(await base44.entities.Merma.list()).toEqual([]);
  });

  it('filter manda las condiciones', async () => {
    await base44.entities.Inventario.filter({ estado_tarea: 'pend_fact' }, 'fecha_inv', 10);
    expect(ultima().cuerpo).toEqual({
      conditions: { estado_tarea: 'pend_fact' }, orderBy: 'fecha_inv', limit: 10,
    });
  });
});

describe('escritura', () => {
  it('create devuelve la fila creada', async () => {
    responder({ data: { id: 'm1' } });
    expect(await base44.entities.Merma.create({ cantidad: 2 })).toEqual({ id: 'm1' });
    expect(ultima().cuerpo).toEqual({ data: { cantidad: 2 } });
  });

  it('update manda id y cambios por separado', async () => {
    responder({ data: { id: 'm1' } });
    await base44.entities.Merma.update('m1', { estado_tarea: 'pend_fact' });
    expect(ultima().cuerpo).toEqual({ id: 'm1', data: { estado_tarea: 'pend_fact' } });
  });

  it('delete manda solo el id', async () => {
    responder({ ok: true });
    await base44.entities.Merma.delete('m1');
    expect(ultima().cuerpo).toEqual({ id: 'm1' });
  });
});

describe('errores', () => {
  it('propaga el mensaje del servidor', async () => {
    responder({ error: 'Sin permiso' }, false, 403);
    await expect(base44.entities.Merma.create({})).rejects.toThrow('Sin permiso');
  });

  it('si el servidor no manda mensaje, usa el código', async () => {
    responder(null, false, 500);
    await expect(base44.entities.Merma.list()).rejects.toThrow('Error 500');
  });

  it('un 401 manda al login en vez de dejar la pantalla a medias', async () => {
    // La sesión caducó o se revocó desde el IS: seguir mostrando datos
    // parciales confunde más que redirigir.
    const location = { href: '' };
    vi.stubGlobal('window', { location });
    responder({ error: 'Sin sesión' }, false, 401);

    await expect(base44.entities.Merma.list()).rejects.toThrow();
    expect(location.href).toBe('/login');
  });
});

describe('auth', () => {
  it('me() devuelve el usuario', async () => {
    responder({ user: { email: 'a@mercadoelineas.com', role: 'inv' } });
    const u = await base44.auth.me();
    expect(u.role).toBe('inv');
    expect(fetchMock.mock.calls.at(-1)[0]).toBe('/api/auth/me');
  });

  it('me() devuelve null sin sesión, sin lanzar', async () => {
    responder({ error: 'Sin sesión' }, false, 401);
    expect(await base44.auth.me()).toBeNull();
  });
});
