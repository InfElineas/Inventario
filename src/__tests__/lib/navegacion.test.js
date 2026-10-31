import { describe, it, expect } from 'vitest';
import { destinosDeMovil, TODOS_LOS_DESTINOS, esRutaActiva } from '@/lib/navegacion';

/**
 * La navegación del teléfono.
 *
 * La web se usa sobre todo desde el móvil, así que quedarse sin barra de abajo
 * es quedarse sin aplicación. Pasó: el filtro miraba un solo rol y ninguna
 * entrada nombraba a superadmin ni a jefe de departamento.
 */

const con = (...roles) => ({ email: 'yo@mercadoelineas.com', roles });

describe('destinosDeMovil', () => {
  it('un superadmin ve la barra llena', () => {
    // Antes veía CERO: ninguna entrada lo nombraba y el filtro no sabía que
    // superadmin pasa por encima de todo.
    const { enBarra } = destinosDeMovil(con('superadmin'));
    expect(enBarra).toHaveLength(5);
  });

  it('un jefe de departamento también', () => {
    const { enBarra } = destinosDeMovil(con('jefe_depto'));
    expect(enBarra.length).toBeGreaterThan(0);
  });

  it('quien tiene dos roles ve lo de los dos', () => {
    // Resolviendo a un solo rol, quien es inventarista y además factura
    // perdía lo que solo puede `inv`.
    const soloInv = destinosDeMovil(con('inv'), 99);
    const soloFact = destinosDeMovil(con('fact'), 99);
    const ambos = destinosDeMovil(con('inv', 'fact'), 99);

    const rutas = (d) => new Set(d.enBarra.concat(d.enMenu).map((i) => i.path));
    for (const r of [...rutas(soloInv), ...rutas(soloFact)]) {
      expect(rutas(ambos)).toContain(r);
    }
  });

  it('nadie se queda sin destinos', () => {
    for (const rol of ['inv', 'fact', 'ca', 'auditor', 'jefe_depto', 'administrador', 'superadmin']) {
      const { enBarra } = destinosDeMovil(con(rol));
      expect(enBarra.length, `${rol} no ve nada en la barra`).toBeGreaterThan(0);
    }
  });

  it('abajo van las de número más bajo y el resto al botón', () => {
    const { enBarra, enMenu } = destinosDeMovil(con('inv'), 3);
    expect(enBarra.map((i) => i.path)).toEqual(['/', '/productos', '/inventario']);
    // Nada se pierde entre las dos listas.
    const todas = destinosDeMovil(con('inv'), 99).enBarra.length;
    expect(enBarra.length + enMenu.length).toBe(todas);
  });

  it('un inventarista no ve las pantallas de facturación', () => {
    const { enBarra, enMenu } = destinosDeMovil(con('inv'), 99);
    const rutas = enBarra.concat(enMenu).map((i) => i.path);
    expect(rutas).not.toContain('/ajustes/aumento');
    expect(rutas).not.toContain('/admin/usuarios');
  });

  it('cada destino tiene su número de orden', () => {
    // Sin él, `sort` lo deja donde caiga y la barra cambia sola entre visitas.
    for (const d of TODOS_LOS_DESTINOS) {
      expect(typeof d.prioridad, `${d.path} sin prioridad`).toBe('number');
    }
  });
});

describe('esRutaActiva', () => {
  it('el detalle de una recepción sigue siendo Recepciones', () => {
    expect(esRutaActiva('/recepciones/abc-123', '/recepciones')).toBe(true);
  });

  it('la raíz no se activa con cualquier ruta', () => {
    expect(esRutaActiva('/mermas', '/')).toBe(false);
    expect(esRutaActiva('/', '/')).toBe(true);
  });

  it('no confunde rutas que empiezan igual', () => {
    // `/facturacion/inventario` no es `/inventario`, y sin la barra de más
    // ambas se marcarían a la vez.
    expect(esRutaActiva('/inventariados', '/inventario')).toBe(false);
  });
});
