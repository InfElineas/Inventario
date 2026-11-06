import { useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, History, TriangleAlert } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import HistorialSubmayorDialog from '@/components/productos/HistorialSubmayorDialog';
import { SIN_SONDEO } from '@/lib/query-client';
import { useAccesoTkc } from '@/lib/useAccesoTkc';
import { fetchHistorialTkc } from '@/services/tkcService';
import {
  construirAlertas, primeraEntrada, severidadSinId, textoDias,
} from '@/lib/alertasPanel';

/**
 * Lo que está mal y no se arregla solo, en el panel. Es un aviso para **facturación y
 * anuncios** (ver `veAlertasDeAnuncios`): son quienes lo resuelven.
 *
 * La alerta principal es la de productos con existencia y SIN ID de tienda: sin
 * anuncio en TKC no se pueden vender en línea, y hay quien lleva meses así. Cuánto
 * llevan se saca del submayor (la fecha de su primera entrada), de los ocho con más
 * existencia; el catálogo no guarda cuándo entró la mercancía. Es crítica cuando
 * lleva 30 días o más, o hay 500 unidades o más, o valen 500 o más.
 *
 * Además, los casos de anuncio abiertos que de verdad son un problema: muertos o
 * desactivados con existencia, y activos sin existencia.
 *
 * @param {{ almacen: string }} props
 */

const CUANTOS_PARA_EDAD = 8;
const CAMPOS = ['id', 'nombre', 'codigo_producto', 'exist_fisica', 'precio_costo'];
const ABIERTOS = ['pendiente', 'pend_ca', 'en_auditoria'];

const hoyIso = () => new Date().toISOString().slice(0, 10);
const haceUnAnio = () => new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

const COLOR = { critica: 'var(--c-bad)', atencion: 'var(--c-warn)' };
const ETIQUETA = { critica: 'Crítica', atencion: 'Atención' };

export default function AlertasCriticas({ almacen }) {
  const navigate = useNavigate();
  const { tiene: conTkc } = useAccesoTkc();
  const [abierto, setAbierto] = useState(false);
  const [historial, setHistorial] = useState(null);

  // Productos con existencia y sin ID, los de más existencia primero.
  const sinIdQ = useQuery({
    queryKey: ['alerta-sin-id', almacen],
    queryFn: async () => {
      const cond = { almacen_num: almacen, activo: true, estado_tienda: 'SIN ID', exist_fisica: { gt: 0 } };
      const [filas, total] = await Promise.all([
        base44.entities.Producto.filter(cond, '-exist_fisica', 50, 0, CAMPOS),
        base44.entities.Producto.count(cond),
      ]);
      return { filas: Array.isArray(filas) ? filas : [], total };
    },
    enabled: Boolean(almacen),
    staleTime: 10 * 60 * 1000,
    ...SIN_SONDEO,
  });
  const filasBase = sinIdQ.data?.filas ?? [];

  // Cuánto llevan: la primera entrada en el submayor, de los de más existencia.
  const edades = useQueries({
    queries: filasBase.slice(0, CUANTOS_PARA_EDAD).map((p) => ({
      queryKey: ['alerta-sin-id-edad', almacen, p.codigo_producto],
      queryFn: () => fetchHistorialTkc({ almacen, codigo: p.codigo_producto, desde: haceUnAnio(), hasta: hoyIso() }),
      enabled: conTkc && Boolean(p.codigo_producto),
      staleTime: 6 * 60 * 60 * 1000,
      retry: false,
      ...SIN_SONDEO,
    })),
  });
  const edadesClave = edades.map((e) => e.dataUpdatedAt).join('|');

  const filas = useMemo(() => filasBase.map((p, i) => {
    const entrada = i < CUANTOS_PARA_EDAD ? primeraEntrada(edades[i]?.data?.movimientos) : null;
    const ef = Number(p.exist_fisica) || 0;
    const valor = ef * (Number(p.precio_costo) || 0);
    const dias = entrada?.dias ?? null;
    return { ...p, ef, valor, dias, severidad: severidadSinId({ dias, ef, valor }) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filasBase, edadesClave]);

  // Casos de anuncio abiertos que son un problema, por tipo.
  const contar = (tipo) => base44.entities.AnuncioDesact.count({ tipo_caso: tipo, estado_tarea: ABIERTOS, almacen_num: almacen });
  const casosQ = useQuery({
    queryKey: ['alerta-casos', almacen],
    queryFn: async () => {
      const [muerto, desactivado, activoSin] = await Promise.all([
        contar('muerto_ef_positivo'), contar('desact_ef_positivo'), contar('activo_ef_cero'),
      ]);
      return { muertoConExistencia: muerto, desactivadoConExistencia: desactivado, activoSinExistencia: activoSin };
    },
    enabled: Boolean(almacen),
    staleTime: 10 * 60 * 1000,
    ...SIN_SONDEO,
  });

  const alertas = useMemo(() => construirAlertas({
    sinId: {
      total: sinIdQ.data?.total ?? 0,
      unidades: filas.reduce((s, f) => s + f.ef, 0),
      filas,
    },
    casos: casosQ.data,
  }), [sinIdQ.data, filas, casosQ.data]);

  if (!almacen || alertas.length === 0) return null;

  const abrir = (a) => (a.enlace === 'sin-id' ? setAbierto(true) : navigate(a.enlace));

  return (
    <>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <TriangleAlert className="w-4 h-4 text-[var(--c-bad)]" />
          <h3 className="text-sm font-medium">Alertas</h3>
          <span className="text-xs text-muted-foreground">{alertas.length}</span>
        </div>
        <div className="divide-y divide-border">
          {alertas.map((a) => (
            <button key={a.clave} type="button" onClick={() => abrir(a)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors">
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5"
                style={{ color: COLOR[a.severidad], background: `color-mix(in srgb, ${COLOR[a.severidad]} 14%, transparent)` }}>
                {ETIQUETA[a.severidad]}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm">{a.titulo}</span>
                <span className="block text-[11px] text-muted-foreground">{a.detalle}</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {abierto && (
        <Dialog open onOpenChange={(o) => { if (!o) setAbierto(false); }}>
          <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <DialogTitle className="text-sm font-medium">Con existencia y sin ID de tienda</DialogTitle>
            <DialogDescription className="text-xs">
              Aviso para facturación y anuncios. Sin ID no se pueden vender en línea: hay que crearles el anuncio
              en TKC, o confirmar que son insumos que no se venden. Salen primero los de más existencia.
            </DialogDescription>
            <div className="min-h-0 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <th className="text-left font-medium px-3 py-2">Producto</th>
                    <th className="text-right font-medium px-3 py-2">Existencia</th>
                    <th className="text-left font-medium px-3 py-2">Lleva</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filas.map((f) => (
                    <tr key={f.id}>
                      <td className="px-3 py-2">
                        <p className="line-clamp-2">{f.nombre}</p>
                        <p className="text-[11px] font-mono text-muted-foreground">{f.codigo_producto}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{f.ef.toLocaleString()}</td>
                      <td className="px-3 py-2 text-xs">
                        <span style={{ color: COLOR[f.severidad] }}>
                          {f.dias != null ? textoDias(f.dias) : '—'}
                        </span>
                        {f.severidad === 'critica' && <span className="ml-1.5 text-[10px] uppercase text-[var(--c-bad)]">crítica</span>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setHistorial({ nombre: f.nombre, codigo: f.codigo_producto })}
                          aria-label={`Historial de ${f.nombre}`}>
                          <History className="w-3.5 h-3.5 mr-1" /> Historial
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(sinIdQ.data?.total ?? 0) > filas.length && (
              <p className="text-xs text-muted-foreground">
                Se muestran los {filas.length} con más existencia, de {sinIdQ.data.total}.
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}

      {historial && (
        <HistorialSubmayorDialog producto={historial} almacen={almacen} onClose={() => setHistorial(null)} />
      )}
    </>
  );
}
