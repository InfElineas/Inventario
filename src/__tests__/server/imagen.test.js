import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * La imagen de producción no copia el proyecto entero, solo las carpetas que
 * el servidor necesita. Es deliberado —mantiene la imagen pequeña— pero añade
 * una trampa: un import nuevo hacia un archivo fuera de esas carpetas compila,
 * pasa los tests y revienta al arrancar el contenedor, que es el peor momento
 * para enterarse.
 *
 * Ya ocurrió una vez: session.js importó ../lib/roles.js y el contenedor murió
 * buscando el módulo. Esta prueba recorre el grafo de imports desde el punto de
 * entrada y comprueba que todo lo que alcanza viaja en la imagen.
 */

const RAIZ = path.resolve(__dirname, '../../..');
const ENTRADA = path.join(RAIZ, 'server/index.js');

/** Rutas que la etapa runtime del Dockerfile copia. */
function rutasCopiadas() {
  const dockerfile = readFileSync(path.join(RAIZ, 'Dockerfile'), 'utf8');
  // Solo la etapa final: lo que copie `build` no llega a la imagen.
  const runtime = dockerfile.slice(dockerfile.indexOf('AS runtime'));
  return [...runtime.matchAll(/^COPY (?!--from)(\S+)\s/gm)].map((m) => m[1]);
}

/** ¿La ruta está dentro de algo que se copia? */
function viajaEnLaImagen(relativa, copiadas) {
  const normal = relativa.split(path.sep).join('/');
  return copiadas.some((c) => normal === c || normal.startsWith(`${c}/`));
}

/** Imports relativos de un archivo, resueltos a rutas absolutas. */
function importsLocales(archivo) {
  const codigo = readFileSync(archivo, 'utf8');
  const dir = path.dirname(archivo);
  return [...codigo.matchAll(/from\s+['"](\.[^'"]+)['"]/g)]
    .map((m) => path.resolve(dir, m[1]))
    .filter((p) => existsSync(p));
}

/** Todos los archivos alcanzables desde la entrada. */
function grafo(entrada) {
  const vistos = new Set();
  const pendientes = [entrada];
  while (pendientes.length) {
    const actual = pendientes.pop();
    if (vistos.has(actual)) continue;
    vistos.add(actual);
    pendientes.push(...importsLocales(actual));
  }
  return [...vistos];
}

describe('la imagen de producción incluye todo lo que el servidor importa', () => {
  it('ningún módulo alcanzable queda fuera del Dockerfile', () => {
    const copiadas = rutasCopiadas();
    expect(copiadas.length).toBeGreaterThan(0);

    const fuera = grafo(ENTRADA)
      .map((abs) => path.relative(RAIZ, abs))
      .filter((rel) => !viajaEnLaImagen(rel, copiadas));

    expect(fuera, `Falta COPY en el Dockerfile para: ${fuera.join(', ')}`).toEqual([]);
  });

  it('roles.js está incluido, que fue el que faltó', () => {
    expect(viajaEnLaImagen('src/lib/roles.js', rutasCopiadas())).toBe(true);
  });
});
