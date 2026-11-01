/**
 * Lo que se ve mientras carga: la forma de la pantalla, no una rueda.
 *
 * Una rueda centrada en una pantalla en blanco no dice nada —ni qué está
 * llegando, ni cuánto va a ocupar— y cuando entran los datos todo salta de
 * golpe. Dibujando de antemano las franjas que van a aparecer, la página no
 * se mueve al cargar y mientras tanto ya se ve de qué pantalla se trata.
 *
 * Las medidas copian las de verdad: la cabecera de 56 px, la barra de abajo
 * de 56, el menú lateral de 220, y el contenido con el mismo orden de
 * siempre —título, subtítulo, filtros, buscador, recuento, lista—.
 */

/** Una barra gris. El ancho va en clases para que lo elija quien la usa. */
function Barra({ className = '' }) {
  return <div className={`rounded bg-muted animate-pulse ${className}`} />;
}

/**
 * El contenido de una pantalla de listado.
 *
 * Se usa solo, dentro del armazón ya pintado, cuando lo que falta por llegar
 * es la pantalla y no la sesión.
 */
export function EsqueletoContenido() {
  return (
    // Sin `role` propio: dentro de EsqueletoApp seria un segundo «status»
    // anidado y el lector de pantalla anunciaria la espera dos veces. Quien
    // lo use suelto pone el suyo.
    <div className="space-y-3" aria-hidden="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <Barra className="h-6 w-40" />
          <Barra className="h-3.5 w-56 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Barra className="h-9 w-[150px]" />
          <Barra className="h-9 w-9" />
          <Barra className="h-9 w-9" />
          <Barra className="h-9 w-9" />
        </div>
      </div>

      <Barra className="h-9 w-full" />
      <div className="flex justify-end"><Barra className="h-3 w-24" /></div>

      {/* Fichas en el móvil, filas de tabla a partir de `sm`: lo mismo que
          va a aparecer cuando lleguen los datos. */}
      <div className="sm:hidden space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-3 space-y-2.5"
            style={{ borderRadius: '12px' }}>
            <Barra className="h-4 w-3/4" />
            <Barra className="h-2.5 w-28" />
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Barra className="h-3 w-full" />
              <Barra className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden sm:block rounded-xl border border-border bg-card overflow-hidden"
        style={{ borderRadius: '12px' }}>
        <div className="flex gap-4 px-3 py-3 border-b border-border">
          {[28, 16, 12, 12, 16].map((w, i) => (
            <div key={i} className="rounded bg-muted animate-pulse h-3" style={{ width: `${w}%` }} />
          ))}
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex gap-4 px-3 py-3.5 border-b border-border last:border-0">
            {[28, 16, 12, 12, 16].map((w, j) => (
              <div key={j} className="rounded bg-muted animate-pulse h-3.5" style={{ width: `${w}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * La aplicación entera mientras se resuelve la sesión.
 *
 * Aquí todavía no hay armazón: lo dibuja este mismo esqueleto —cabecera,
 * menú lateral en el escritorio, barra de abajo en el móvil— para que al
 * entrar no haya un salto entre la pantalla de carga y la de verdad.
 */
export default function EsqueletoApp() {
  return (
    <div className="fixed inset-0 bg-background overflow-hidden" role="status" aria-label="Cargando">
      <span className="sr-only">Cargando la aplicación</span>

      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[220px] flex-col gap-1 p-3 border-r border-border">
        <div className="flex items-center gap-2.5 pb-3 mb-1 border-b border-border">
          <Barra className="w-7 h-7 rounded-lg" />
          <div className="space-y-1.5 flex-1">
            <Barra className="h-3 w-20" />
            <Barra className="h-2 w-14" />
          </div>
        </div>
        {Array.from({ length: 8 }, (_, i) => <Barra key={i} className="h-8 w-full" />)}
      </aside>

      <div className="flex flex-col h-full lg:ml-[220px]">
        <header className="flex items-center justify-between px-4 lg:px-6 h-14 sm:h-[52px] border-b border-border shrink-0">
          <Barra className="h-4 w-28" />
          <div className="flex items-center gap-2">
            <Barra className="w-8 h-8 rounded-md" />
            <Barra className="w-8 h-8 rounded-md" />
            <Barra className="w-8 h-8 rounded-full" />
          </div>
        </header>

        <main className="flex-1 overflow-hidden p-4 lg:p-6">
          <EsqueletoContenido />
        </main>
      </div>

      {/* 56 px exactos, los mismos que la barra de verdad: con `h-14`
          medía 49 en el móvil —la escala baja la raíz a 14 px— y al entrar
          la aplicación la barra daba un salto. */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 flex items-stretch border-t border-border bg-background"
        style={{ height: '56px' }}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-center gap-1.5">
            <Barra className="w-[18px] h-[18px] rounded" />
            <Barra className="w-10 h-2" />
          </div>
        ))}
      </nav>
    </div>
  );
}
