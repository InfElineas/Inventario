import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { SIN_SONDEO } from '@/lib/query-client';
import { fetchCobertura } from '@/services/rotacionService';
import { warehouseName } from '@/services/tkc/warehouses';
import { ArrowRight, Loader2, ShoppingCart } from 'lucide-react';

/**
 * Lo que se queda sin existencia antes, en el panel.
 *
 * El panel cuenta cuántos productos hay en cada estado, que sirve para saber
 * cómo está el almacén pero no para decidir qué hacer hoy. Esto contesta lo
 * segundo: al ritmo al que se vende cada cosa, estas son las que se acaban
 * primero.
 *
 * Lo que ya se agotó no entra: eso ya pasó y para eso está el estado AGOTADO. Aquí
 * van los que todavía se pueden salvar —primero las ÚLTIMAS PIEZAS y después los
 * de menos cobertura—.
 *
 * Solo anuncios activados: comprar para uno muerto no tiene sentido, y en un
 * resumen de ocho líneas no hay sitio para explicar la excepción. Quien
 * quiera verlos entra en la pantalla de reabastecimiento, que tiene el filtro.
 */

const CUANTOS = 8;
/** El mismo que trae por defecto la pantalla de reabastecimiento. */
const DIAS = 15;

/**
 * Los que se acaban primero: con anuncio activado y existencia (los agotados ya no
 * se acaban), las ÚLTIMAS PIEZAS delante y luego los de menos cobertura.
 */
export function ordenarCriticos(filas) {
  return filas
    .filter((f) => f.estadoAnuncio === 'ACTIVADO' && Number(f.existencia) > 0 && f.estadoTienda !== 'AGOTADO')
    .sort((a, b) => {
      const ua = a.estadoTienda === 'ULTIMAS PIEZAS' ? 0 : 1;
      const ub = b.estadoTienda === 'ULTIMAS PIEZAS' ? 0 : 1;
      return ua - ub || a.cobertura - b.cobertura;
    });
}

export default function CriticosReabastecimiento({ almacen }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cobertura', almacen, DIAS],
    queryFn: () => fetchCobertura({ almacen, dias: DIAS }),
    enabled: Boolean(almacen),
    ...SIN_SONDEO,
    retry: false,
  });

  if (!almacen) return null;

  const criticos = ordenarCriticos(data ?? []).slice(0, CUANTOS);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-[var(--c-bad)]" />
          Se acaban primero
          <span className="text-xs text-muted-foreground font-normal">
            — {warehouseName(almacen) || almacen}, anuncios activados
          </span>
        </h3>
        <Link to="/reabastecimiento"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 whitespace-nowrap">
          Ver todo <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {isLoading ? (
        <p className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Cruzando la rotación con las existencias…
        </p>
      ) : error ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">
          No se pudo consultar la rotación de venta.
        </p>
      ) : criticos.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">
          Nada con existencia que se acabe antes de {DIAS} días.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {criticos.map((f) => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2">
              <span className="flex-1 min-w-0">
                <span className="block text-sm line-clamp-1" title={f.nombre}>{f.nombre}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {f.estadoTienda === 'ULTIMAS PIEZAS' ? 'Últimas piezas · ' : ''}{f.suministrador || '—'} · quedan {f.existencia} · vende {f.diaria.toFixed(2)}/día
                </span>
              </span>
              <span className="text-right whitespace-nowrap">
                <span className={`block text-sm font-medium tabular-nums ${
                  f.cobertura < DIAS / 2 ? 'text-[var(--c-bad)]' : 'text-[var(--c-warn)]'
                }`}>
                  {`${f.cobertura.toFixed(1)} días`}
                </span>
                <span className="block text-[11px] text-muted-foreground">pedir {f.faltan}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
