import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ban, Check, Download, Eye, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AlertBanner from '@/components/shared/AlertBanner';
import Pagination from '@/components/shared/Pagination';
import { SIN_SONDEO } from '@/lib/query-client';
import { celdaCsv } from '@/lib/lotes';
import { rangoPorDefecto } from '@/lib/historialTkc';
import {
  ESTADOS_TRANSFERENCIA, SENTIDOS, destinoDe, esBorrador, filtrosDeTransferencias,
  interpretarTransferencia, mensajeDeError, origenDe, transferenciasACsv,
} from '@/lib/transferencias';
import { observacionDe } from '@/lib/historialTkc';
import { listarTransferencias } from '@/services/transferenciasService';

const PAGE_SIZE = 50;
const SELECT_CLS = 'bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground';

/**
 * Las transferencias que TKC tiene del almacén elegido: las que salen de él o las
 * que le llegan. Con fechas, estado y búsqueda, páginas y exportación. Un
 * borrador («editada») se confirma o se cancela desde aquí.
 */
export default function HistorialTransferencias({
  almacen, almacenValido, resultados, sinTkc, ocupado, bloqueo, onVerLineas, onConfirmar, onCancelar,
}) {
  const inicial = useMemo(() => rangoPorDefecto(), []);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [sentido, setSentido] = useState('salidas');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [exportando, setExportando] = useState(false);

  const filtros = filtrosDeTransferencias({ almacen, sentido, desde, hasta, status, q });

  const historial = useQuery({
    queryKey: ['transferencias', filtros, page],
    queryFn: () => listarTransferencias({ ...filtros, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    enabled: almacenValido,
    staleTime: 15_000,
    ...SIN_SONDEO,
  });
  const filas = Array.isArray(historial.data?.body) ? historial.data.body : [];
  const total = historial.data?.total ?? filas.length;
  const error = historial.data && !Array.isArray(historial.data.body)
    ? interpretarTransferencia(historial.data.status, historial.data.body) : null;

  /** Todo lo que cumple los filtros, no solo la página. Sin `limit` la API lo devuelve entero. */
  const exportar = async () => {
    setExportando(true);
    try {
      const r = await listarTransferencias({ ...filtros, limit: null });
      if (!Array.isArray(r.body)) throw new Error(mensajeDeError(interpretarTransferencia(r.status, r.body)));
      // BOM al principio: sin él Excel abre el CSV en latin-1 y parte los acentos.
      const blob = new Blob(['﻿', transferenciasACsv(r.body, celdaCsv)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `transferencias_${almacen}_${sentido}_${desde}_${hasta}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`No se pudo exportar: ${e.message}`);
    } finally {
      setExportando(false);
    }
  };

  const cambiar = (fn) => (e) => { fn(e.target.value); setPage(1); };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <select value={sentido} onChange={cambiar(setSentido)} className={SELECT_CLS} aria-label="Sentido" style={{ borderRadius: 'var(--r-ctl)' }}>
          {SENTIDOS.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
        </select>
        <label className="space-y-1 text-xs text-muted-foreground">
          Desde
          <Input type="date" value={desde} max={hasta} onChange={cambiar(setDesde)} style={{ borderRadius: 'var(--r-ctl)' }} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Hasta
          <Input type="date" value={hasta} min={desde} onChange={cambiar(setHasta)} style={{ borderRadius: 'var(--r-ctl)' }} />
        </label>
        <select value={status} onChange={cambiar(setStatus)} className={SELECT_CLS} aria-label="Estado" style={{ borderRadius: 'var(--r-ctl)' }}>
          {ESTADOS_TRANSFERENCIA.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
        </select>
        <Input value={q} onChange={cambiar(setQ)} placeholder="Buscar por código, observaciones…" className="w-64"
          style={{ borderRadius: 'var(--r-ctl)' }} />
        <div className="flex gap-1 ml-auto">
          <Button variant="outline" size="sm" onClick={exportar} disabled={!almacenValido || exportando || total === 0}
            style={{ borderRadius: 'var(--r-ctl)' }} title="Exportar a CSV todo lo que cumple los filtros">
            <Download className="w-3.5 h-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Exportar</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => historial.refetch()} disabled={!almacenValido || historial.isFetching}
            aria-label="Volver a pedir">
            <RefreshCw className={`w-3.5 h-3.5 ${historial.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {!almacenValido && <p className="text-sm text-muted-foreground">Elige un almacén para ver sus transferencias.</p>}
      {error && <AlertBanner variant="danger" message={mensajeDeError(error)} />}
      {almacenValido && !error && !historial.isLoading && filas.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin transferencias con estos filtros.</p>
      )}

      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3 font-medium">Documento</th>
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium hidden sm:table-cell">Origen</th>
                <th className="py-2 pr-3 font-medium hidden sm:table-cell">Destino</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                <th className="py-2 pr-3 font-medium hidden md:table-cell">Observación</th>
                <th className="py-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const hecho = resultados[f.id];
                const estado = hecho?.tipo === 'confirmado' ? 'en tránsito'
                  : hecho?.tipo === 'cancelado' ? 'cancelada' : f.status;
                const abierto = esBorrador(f.status) && !hecho;
                return (
                  <tr key={f.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono text-xs">{f.code}</td>
                    <td className="py-2 pr-3">{f.date}</td>
                    <td className="py-2 pr-3 text-xs hidden sm:table-cell">{origenDe(f) || '—'}</td>
                    <td className="py-2 pr-3 text-xs hidden sm:table-cell">{destinoDe(f) || '—'}</td>
                    <td className="py-2 pr-3 capitalize">{estado}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[16rem] hidden md:table-cell">
                      <span className="line-clamp-2" title={observacionDe(f)}>{observacionDe(f) || '—'}</span>
                    </td>
                    <td className="py-2 text-right space-x-1 whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => onVerLineas({ id: f.id, code: f.code })} title="Ver productos">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      {abierto && (
                        <>
                          <Button size="sm" variant="outline" style={{ borderRadius: 'var(--r-ctl)' }}
                            disabled={sinTkc || ocupado || bloqueo === f.id}
                            onClick={() => onConfirmar(f.id, f.code)} title="Confirmar" aria-label="Confirmar">
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="text-[var(--c-bad)] hover:text-[var(--c-bad)]"
                            disabled={sinTkc || ocupado || bloqueo === f.id}
                            onClick={() => onCancelar(f.id, f.code)} title="Cancelar el borrador" aria-label="Cancelar">
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      {hecho && hecho.tipo !== 'confirmado' && hecho.tipo !== 'cancelado' && (
                        <span className="text-xs text-[var(--c-bad)]">{hecho.mensaje}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </div>
      )}
    </Card>
  );
}
