import { RELEASES } from '@/data/releases';

/**
 * Versión de la web: qué compilación se está ejecutando y qué hay publicado.
 *
 * Cada compilación lleva un identificador (`__BUILD_ID__`, que pone Vite) y publica
 * `/version.json` con ese mismo identificador y la última entrada de novedades. Una
 * pestaña que lleva abierta desde antes del despliegue compara el suyo con el del
 * servidor: si no coinciden, hay una versión nueva.
 */

const CLAVE_VISTA = 'eb:release-vista';

/** El identificador de ESTA compilación. En desarrollo no hay: no se avisa de nada. */
export const BUILD_ID = typeof __BUILD_ID__ === 'undefined' ? 'dev' : __BUILD_ID__;

/** ¿El servidor tiene una versión distinta de la que se está ejecutando? */
export function hayVersionNueva(actual, remota) {
  if (!actual || actual === 'dev' || !remota?.build) return false;
  return remota.build !== actual;
}

/**
 * Lo publicado en el servidor, o null si no se pudo leer. Nunca lanza: un fallo de
 * red no es una versión nueva ni un error que enseñar.
 */
export async function leerVersionRemota(pedir = fetch) {
  try {
    const res = await pedir('/version.json', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    const datos = await res.json();
    return datos && typeof datos.build === 'string' ? datos : null;
  } catch {
    // En desarrollo ese archivo no existe y la ruta devuelve una página: no es JSON.
    return null;
  }
}

/** La entrada de novedades que esta persona aún no ha visto, o null. */
export function releaseSinVer(vista, releases = RELEASES) {
  const ultima = releases[0];
  if (!ultima) return null;
  return vista === ultima.version ? null : ultima;
}

export function leerReleaseVista() {
  try { return localStorage.getItem(CLAVE_VISTA); } catch { return null; }
}

export function marcarReleaseVista(version) {
  try { localStorage.setItem(CLAVE_VISTA, version); } catch { /* sin almacenamiento: se volverá a enseñar */ }
}
