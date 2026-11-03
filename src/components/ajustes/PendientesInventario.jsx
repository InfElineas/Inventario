import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import AlertBanner from '@/components/shared/AlertBanner';
import ReadOnlyBlock, { ReadOnlyField } from '@/components/shared/ReadOnlyBlock';
import ExistenciaAhora from '@/components/inventario/ExistenciaAhora';
import { ClipboardList, ArrowDownToLine, Eye, Undo2 } from 'lucide-react';
import {
  anterioresDe, esAjustable, esIntercambio, lineasDeConteos, ultimoPorProducto,
} from '@/lib/conteosFact';
import { devolverConteo } from '@/services/conteosFactService';
import { esDeTransferencia } from '@/lib/transferencias';

/**
 * Los conteos de inventario que esperan este ajuste.
 *
 * El flujo ya existía partido en dos mitades que no se hablaban: inventario
 * cuenta, encuentra una diferencia y la manda a facturación (`pend_fact`); y
 * facturación, en otra pantalla, escribe a mano los códigos a ajustar. Entre
 * las dos había un copiar y pegar desde un sitio que no era el sistema.
 *
 * Aquí se ve qué está esperando, con lo que hace falta para decidir —la
 * existencia al contar, la clasificación y la nota de quien contó—, se elige
 * cuáles ajustar y se rellena el formulario con ellos. La cantidad del ajuste
 * es la diferencia que midió el conteo, que es justo lo que hay que mover.
 * Lo que no procede se devuelve a inventario, con su motivo.
 *
 * Un sobrante se resuelve con un ajuste de AUMENTO y un faltante con uno de
 * DISMINUCIÓN. Por eso cada pantalla pide un `resultado` distinto. Los
 * intercambios entre productos no entran aquí: van a Procesamientos.
 *
 * Y un faltante cuya clasificación es una transferencia («Transferencia a Latino
 * no registrada»…) es mercancía que salió hacia otro almacén sin documento: se
 * resuelve montando esa transferencia, en su pantalla.
 */

const POR_TIPO = {
  aumento:       { resultado: 'sobrante', etiqueta: 'sobrantes', panel: 'este ajuste' },
  disminucion:   { resultado: 'faltante', etiqueta: 'faltantes', panel: 'este ajuste' },
  transferencia: { resultado: 'faltante', etiqueta: 'faltantes por transferencia', panel: 'esta transferencia', filtro: esDeTransferencia },
};

const colorDe = (d) => (Number(d) > 0 ? 'var(--c-warn)' : 'var(--c-bad)');
const conSigno = (d) => `${Number(d) > 0 ? '+' : ''}${d}`;

/**
 * @param {object} props
 * @param {'aumento'|'disminucion'|'transferencia'} props.tipo
 * @param {string} props.almacen
 * @param {(lineas: string, conteos: Array<{ conteo: object, anteriores: object[] }>) => void} props.onUsar
 *   Las líneas `CODIGO*CANTIDAD` y los conteos de los que salen, para poder darlos por
 *   procesados cuando el documento se confirme.
 */
export default function PendientesInventario({ tipo, almacen, onUsar }) {
  const cfg = POR_TIPO[tipo];
  const queryClient = useQueryClient();
  const [excluidos, setExcluidos] = useState(() => new Set());   // desmarcados; por defecto van todos
  const [detalle, setDetalle] = useState(null);
  const [devolviendo, setDevolviendo] = useState(null);

  const { data: filas = [], isLoading } = useQuery({
    queryKey: ['pend-fact', tipo, almacen],
    queryFn: () => base44.entities.Inventario.filter(
      { almacen_num: almacen, resultado: cfg.resultado, estado_tarea: 'pend_fact' },
      '-fecha_inv', 500,
    ),
    enabled: Boolean(almacen && cfg),
    select: (d) => (Array.isArray(d) ? d : []),
  });

  // Los intercambios son de la pantalla de Procesamientos. Y de cada producto
  // solo vale el conteo más reciente: los anteriores se cierran al procesar.
  const propios = useMemo(
    () => filas.filter((c) => !esIntercambio(c) && (cfg?.filtro?.(c) ?? true)),
    [filas, cfg],
  );
  const { vigentes, anteriores } = useMemo(() => ultimoPorProducto(propios), [propios]);
  const ajustables = vigentes.filter(esAjustable);
  const marcados = ajustables.filter((c) => !excluidos.has(c.id));
  const ocultos = propios.length - vigentes.length;

  if (!cfg || !almacen) return null;

  const alternar = (id) => setExcluidos((prev) => {
    const s = new Set(prev);
    if (s.has(id)) s.delete(id); else s.add(id);
    return s;
  });

  const usar = () => onUsar(
    lineasDeConteos(marcados),
    marcados.map((conteo) => ({ conteo, anteriores: anterioresDe(anteriores, conteo) })),
  );

  return (
    <Card className="overflow-hidden" style={{ borderRadius: 'var(--r-card)', borderWidth: '0.5px' }}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <p className="text-sm font-medium flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          Conteos esperando {cfg.panel}
          {ajustables.length > 0 && (
            <span className="text-xs text-muted-foreground">({ajustables.length})</span>
          )}
        </p>
        {ajustables.length > 0 && (
          <Button type="button" variant="outline" size="sm" style={{ borderRadius: 'var(--r-ctl)' }}
            disabled={marcados.length === 0} onClick={usar}>
            <ArrowDownToLine className="w-3.5 h-3.5 mr-1.5" />
            Pasarlos al formulario ({marcados.length})
          </Button>
        )}
      </div>

      {ocultos > 0 && (
        <p className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
          {ocultos} {ocultos === 1 ? 'conteo anterior queda cubierto' : 'conteos anteriores quedan cubiertos'} por
          el más reciente del mismo producto. Al procesar, se cierran sin ajuste.
        </p>
      )}

      {isLoading ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">Cargando…</p>
      ) : ajustables.length === 0 ? (
        <p className="px-4 py-6 text-xs text-muted-foreground text-center">
          Ningún conteo de este almacén tiene {cfg.etiqueta} pendientes de facturación.
        </p>
      ) : (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="w-8 px-3 py-2" />
                <th className="px-2 py-2 text-left font-medium">Producto</th>
                <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Código</th>
                <th className="px-3 py-2 text-right font-medium hidden md:table-cell">EF → Conteo</th>
                <th className="px-3 py-2 text-right font-medium">Diferencia</th>
                <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Contó</th>
                <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Fecha</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ajustables.map((i) => (
                <tr key={i.id} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-3 py-2">
                    <input type="checkbox" aria-label={`Incluir ${i.producto_nombre}`}
                      checked={!excluidos.has(i.id)} onChange={() => alternar(i.id)}
                      className="w-3.5 h-3.5 accent-[var(--c-ok)] cursor-pointer" />
                  </td>
                  <td className="px-2 py-2">
                    <p className="line-clamp-1">{i.producto_nombre || '—'}</p>
                    {i.clasif_ajuste && (
                      <p className="text-[11px] text-muted-foreground">{i.clasif_ajuste}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs hidden sm:table-cell">{i.producto_codigo || '—'}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground hidden md:table-cell">
                    {i.exist_fisica_tkc ?? '—'} → {i.conteo_real ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium" style={{ color: colorDe(i.diferencia) }}>
                    {conSigno(i.diferencia)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">
                    {i.especialista_nombre || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground hidden md:table-cell">
                    {i.fecha_inv || '—'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDetalle(i)}
                      aria-label={`Ver detalle: ${i.producto_nombre}`} title="Ver detalle">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDevolviendo(i)}
                      aria-label={`Devolver a inventario: ${i.producto_nombre}`} title="Devolver a inventario">
                      <Undo2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetalleConteo conteo={detalle} onClose={() => setDetalle(null)} />
      <DevolverConteo conteos={devolviendo ? [devolviendo] : null} onClose={() => setDevolviendo(null)}
        onHecho={() => {
          setDevolviendo(null);
          queryClient.invalidateQueries({ queryKey: ['pend-fact'] });
          queryClient.invalidateQueries({ queryKey: ['inventarios'] });
        }} />
    </Card>
  );
}

/** Todo lo que se sabe del conteo, y cómo está la existencia ahora: lo que hace falta para decidir. */
export function DetalleConteo({ conteo, onClose }) {
  return (
    <Dialog open={Boolean(conteo)} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {conteo && (
          <div className="space-y-4">
            <DialogTitle className="text-sm font-medium">{conteo.producto_nombre}</DialogTitle>
            <DialogDescription className="text-xs">
              <span className="font-mono">{conteo.producto_codigo}</span> · almacén {conteo.almacen_num}
            </DialogDescription>
            <ReadOnlyBlock title="Conteo">
              <ReadOnlyField label="EF TKC al contar" value={conteo.exist_fisica_tkc} />
              <ReadOnlyField label="Conteo real" value={conteo.conteo_real} />
              <ReadOnlyField label="Diferencia" value={conSigno(conteo.diferencia)} />
              <ReadOnlyField label="Resultado" value={conteo.resultado} />
              <ReadOnlyField label="Clasificación" value={conteo.clasif_ajuste || '—'} />
              <ReadOnlyField label="Contó" value={conteo.especialista_nombre || '—'} />
              <ReadOnlyField label="Fecha" value={conteo.fecha_inv?.slice(0, 10) || '—'} />
            </ReadOnlyBlock>
            {conteo.notas_inv && (
              <p className="text-xs text-muted-foreground"><span className="font-medium">Nota de inventario:</span> {conteo.notas_inv}</p>
            )}
            {/* Quien procesa lo hace días después: tiene que ver contra qué
                existencia se midió y cuál es la de ahora. */}
            <ExistenciaAhora inv={conteo} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Devolver uno o varios conteos —los dos de un intercambio van juntos— con el
 * mismo motivo.
 */
export function DevolverConteo({ conteos, onClose, onHecho }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cerrar = () => { setMotivo(''); setError(''); onClose(); };

  const devolver = async () => {
    setEnviando(true);
    setError('');
    try {
      const user = await base44.auth.me();
      for (const conteo of conteos) {
        await devolverConteo({ conteo, motivo: motivo.trim(), user });
      }
      setMotivo('');
      onHecho();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={Boolean(conteos)} onOpenChange={(o) => { if (!o) cerrar(); }}>
      <DialogContent className="max-w-md">
        {conteos && (
          <div className="space-y-4">
            <DialogTitle className="text-sm font-medium">Devolver a inventario</DialogTitle>
            <DialogDescription className="text-xs">
              {conteos.map((c) => `${c.producto_nombre} (${conSigno(c.diferencia)})`).join(' y ')}.
              {' '}Quien {conteos.length === 1 ? 'lo contó lo recibe' : 'los contó los recibe'} para corregir y volver a enviar.
            </DialogDescription>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500}
              placeholder="Qué hay que corregir (obligatorio)…" style={{ borderRadius: 'var(--r-ctl)' }} />
            {error && <AlertBanner variant="danger" message={error} />}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={cerrar} style={{ borderRadius: 'var(--r-ctl)' }}>Cancelar</Button>
              <Button disabled={!motivo.trim() || enviando} onClick={devolver} style={{ borderRadius: 'var(--r-ctl)' }}>
                Devolver
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
