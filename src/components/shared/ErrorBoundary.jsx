import { Component } from 'react';
import PantallaError, { clasificarError } from '@/components/shared/PantallaError';

/**
 * Contiene el fallo de una pantalla para que no se lleve por delante la
 * aplicación entera.
 *
 * Sin esto, cualquier excepción durante el render desmonta todo el árbol y
 * deja la ventana en blanco: ni menú, ni mensaje, ni forma de volver. El
 * usuario solo ve que «se rompió», y el motivo queda en una consola que nadie
 * mira. Pasó con un `ReferenceError` en el catálogo.
 *
 * Aquí el fallo queda acotado a la ruta: el resto de la aplicación sigue en
 * pie, se dice qué pasó y se ofrece reintentar.
 *
 * Tiene que ser una clase: los hooks no capturan errores de render.
 */
const CLAVE_RECARGA = 'eb:recarga-por-modulo'

/** ¿El fallo es un trozo de JavaScript que ya no existe en el servidor? */
function esModuloCaducado(error) {
  const m = String(error?.message ?? '')
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically/i.test(m)
}

// Una recarga por minuto como mucho. Antes era una por sesión, y la marca no
// se borraba nunca: la primera pestaña caducada se arreglaba sola, pero en la
// misma sesión el despliegue siguiente ya no recargaba y salía la pantalla de
// error. Con una pestaña abierta todo el día, tras cada despliegue.
//
// El minuto sigue frenando el bucle: si tras recargar vuelve a fallar, es otra
// cosa y se enseña.
const VENTANA_RECARGA_MS = 60_000

// sessionStorage puede no estar (modo privado, cookies bloqueadas). Si no se
// puede recordar que ya se recargó, es mejor no recargar: un bucle de recargas
// es peor que una pantalla de error.
export function yaSeRecargo(ahora = Date.now()) {
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE_RECARGA))
    return Number.isFinite(ultima) && ahora - ultima < VENTANA_RECARGA_MS
  } catch { return true }
}

function marcarRecarga(ahora = Date.now()) {
  try { sessionStorage.setItem(CLAVE_RECARGA, String(ahora)) } catch { /* no se puede: no se recarga */ }
}

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Tras un despliegue, el navegador conserva el índice viejo y pide trozos
    // de JavaScript cuyo nombre ya cambió: el import falla y la pantalla no
    // carga. No es un fallo del código, es una versión a medias, y se arregla
    // recargando. Una sola vez por sesión: si tras recargar vuelve a fallar,
    // es otra cosa y hay que enseñarla en vez de girar en bucle.
    if (esModuloCaducado(error) && !yaSeRecargo()) {
      marcarRecarga()
      window.location.reload()
      return
    }

    // Con el mensaje a secas no se puede diagnosticar nada: hace falta saber
    // qué componente lo lanzó.
    console.error('[error-boundary]', error, info?.componentStack);
  }

  // `React.lazy` recuerda el import que falló: volver a pintar la ruta repite
  // el mismo error. Con un módulo caducado el único reintento que sirve es
  // cargar la versión nueva.
  reintentar = () => {
    if (esModuloCaducado(this.state.error)) { window.location.reload(); return }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const tipo = esModuloCaducado(error) ? 'fallo' : clasificarError(error);
    return (
      <PantallaError tipo={tipo} detalle={error.message || String(error)} onReintentar={this.reintentar} />
    );
  }
}
