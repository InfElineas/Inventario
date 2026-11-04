import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/**
 * Las tarjetas de tareas del panel: lo que espera a facturación y lo que te
 * devolvieron. Cada fila lleva a donde se resuelve; lo que está en cero no sale,
 * porque una lista de ceros esconde lo único que tiene algo.
 */

function Tarjeta({ titulo, enlace, enlaceTexto, children }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{titulo}</h3>
        {enlace && <Link to={enlace} className="text-xs text-[var(--c-ok)] hover:underline">{enlaceTexto} →</Link>}
      </div>
      {children}
    </div>
  );
}

function Vacio({ children }) {
  return <p className="text-xs text-muted-foreground text-center py-6 px-4">{children}</p>;
}

function Fila({ to, texto, cantidad, color }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors">
      <span className="flex-1 min-w-0 text-sm truncate">{texto}</span>
      <span className="text-xs font-medium tabular-nums px-2 py-0.5 rounded-md"
        style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{cantidad}</span>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
    </Link>
  );
}

/**
 * Lo que espera a facturación, por pantalla.
 * @param {{ resumen: ReturnType<typeof import('@/lib/panelTareas').resumenFacturacion> }} props
 */
export function EsperanFacturacion({ resumen }) {
  const filas = [
    { clave: 'aumento', to: '/ajustes/aumento', texto: 'Ajuste de aumento', cantidad: resumen.aumento, color: 'var(--c-ok)' },
    { clave: 'disminucion', to: '/ajustes/disminucion', texto: 'Ajuste de disminución', cantidad: resumen.disminucion, color: 'var(--c-bad)' },
    { clave: 'procesamiento', to: '/procesamientos', texto: 'Procesamientos (intercambios)', cantidad: resumen.procesamiento, color: 'var(--c-info-2)' },
    { clave: 'mermas', to: '/ajustes/disminucion?tab=mermas', texto: 'Mermas por facturar', cantidad: resumen.mermas, color: 'var(--c-orange)' },
    { clave: 'auditoria', to: '/auditoria', texto: 'En auditoría', cantidad: resumen.enAuditoria, color: 'var(--c-purple)' },
  ].filter((f) => f.cantidad > 0);

  return (
    <Tarjeta titulo="Esperan facturación" enlace="/ajustes/disminucion" enlaceTexto="Ir a los ajustes">
      {filas.length === 0
        ? <Vacio>Nada espera a facturación.</Vacio>
        : <div className="divide-y divide-border">{filas.map(({ clave, ...f }) => <Fila key={clave} {...f} />)}</div>}
    </Tarjeta>
  );
}

/**
 * Lo que te devolvieron para corregir, y los conteos que aún no has enviado.
 * @param {{ devueltos: ReturnType<typeof import('@/lib/panelTareas').devueltosDe>, enCurso: number }} props
 */
export function Devueltos({ devueltos, enCurso }) {
  const vacio = devueltos.total === 0 && enCurso === 0;
  return (
    <Tarjeta titulo="Te los devolvieron" enlace="/inventario" enlaceTexto="Ver inventario">
      {vacio ? <Vacio>No tienes nada por corregir.</Vacio> : (
        <div className="divide-y divide-border">
          {devueltos.filas.map((d) => (
            <Link key={d.id} to={d.enlace} className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/40 transition-colors">
              <span className="flex-1 min-w-0">
                <span className="block text-sm line-clamp-1">{d.nombre}</span>
                {d.nota && <span className="block text-[11px] text-muted-foreground line-clamp-1">{d.nota}</span>}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
            </Link>
          ))}
          {devueltos.total > devueltos.filas.length && (
            <p className="px-4 py-2 text-xs text-muted-foreground">y {devueltos.total - devueltos.filas.length} más</p>
          )}
          {enCurso > 0 && (
            <Fila to="/inventario" texto="Conteos sin enviar a facturación" cantidad={enCurso} color="var(--c-info)" />
          )}
        </div>
      )}
    </Tarjeta>
  );
}
