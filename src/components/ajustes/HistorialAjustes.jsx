import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Download, Eye, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AlertBanner from '@/components/shared/AlertBanner';
import Pagination from '@/components/shared/Pagination';
import { interpretar, mensajeDeError } from '@/lib/ajustes';
import { SIN_SONDEO } from '@/lib/query-client';
import { listarAjustes } from '@/services/ajustesService';
import {
  ESTADOS_DOCUMENTO, TIPOS_SALIDA, filtrosDeHistorial,
  historialACsv, rangoPorDefecto, sePuedeConfirmar,
} from '@/lib/historialTkc';

const PAGE_SIZE = 50;
const SELECT_CLS = 'bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground';

/**
 * Lo que TKC tiene del almacén: ajustes de aumento o de disminución y, en las
 * disminuciones, también las ventas directas.
 *
 * Antes enseñaba «los últimos 7 días» sin poder cambiarlo, así que nada de lo
 * anterior se podía consultar. Ahora hay fechas, estado y búsqueda, páginas y
 * exportación. Las ventas directas son solo lectura: se ven y se exportan, pero
 * no se confirman.
 */
export default function HistorialAjustes({
  tipo, almacen, almacenValido, confirmado, sinTkc, ocupado, bloqueo, onVerLineas, onConfirmar,
}) {
  const inicial = useMemo(() => rangoPorDefecto(), []);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [tipoSalida, setTipoSalida] = useState('decrease');
  const [page, setPage] = useState(1);
  const [exportando, setExportando] = useState(false);

  const filtros = filtrosDeHistorial({ tipo, tipoSalida, desde, hasta, status, q });
  const conVd = tipo === 'disminucion' && tipoSalida !== 'decrease';

  const historial = useQuery({
    queryKey: ['ajustes', tipo, almacen, filtros, page],
    queryFn: () => listarAjustes(tipo, { almacen, ...filtros, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    enabled: almacenValido,
    staleTime: 15_000,
    ...SIN_SONDEO,
  });
  const filas = Array.isArray(historial.data?.body) ? historial.data.body : [];
  const total = historial.data?.total ?? filas.length;
  const error = historial.data && !Array.isArray(historial.data.body)
    ? interpretar(historial.data.status, historial.data.body) : null;

  /** Todo lo que cumple los filtros, no solo la página. Sin `limit` la API lo devuelve entero. */
  const exportar = async () => {
    setExportando(true);
    try {
      const r = await listarAjustes(tipo, { almacen, ...filtros, limit: null });
      if (!Array.isArray(r.body)) throw new Error(mensajeDeError(interpretar(r.status, r.body)));
      // BOM al principio: sin él Excel abre el CSV en latin-1 y parte los acentos.
      const blob = new Blob(['﻿', historialACsv(r.body)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tipo}_${almacen}_${desde}_${hasta}.csv`;
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
        <label className="space-y-1 text-xs text-muted-foreground">
          Desde
          <Input type="date" value={desde} max={hasta} onChange={cambiar(setDesde)} style={{ borderRadius: 'var(--r-ctl)' }} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Hasta
          <Input type="date" value={hasta} min={desde} onChange={cambiar(setHasta)} style={{ borderRadius: 'var(--r-ctl)' }} />
        </label>
        <select value={status} onChange={cambiar(setStatus)} className={SELECT_CLS} aria-label="Estado" style={{ borderRadius: 'var(--r-ctl)' }}>
          {ESTADOS_DOCUMENTO.map((e) => <option key={e.valor} value={e.valor}>{e.label}</option>)}
        </select>
        {tipo === 'disminucion' && (
          <select value={tipoSalida} onChange={cambiar(setTipoSalida)} className={SELECT_CLS} aria-label="Tipo de salida" style={{ borderRadius: 'var(--r-ctl)' }}>
            {TIPOS_SALIDA.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
          </select>
        )}
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

      {conVd && (
        <p className="text-xs text-muted-foreground">
          Las ventas directas son solo lectura desde aquí: se ven y se exportan, no se confirman.
        </p>
      )}
      {!almacenValido && <p className="text-sm text-muted-foreground">Elige un almacén para ver sus documentos.</p>}
      {error && <AlertBanner variant="danger" message={mensajeDeError(error)} />}
      {almacenValido && !error && !historial.isLoading && filas.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin documentos con estos filtros.</p>
      )}

      {filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3 font-medium">Documento</th>
                {conVd && <th className="py-2 pr-3 font-medium">Tipo</th>}
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Estado</th>
                {conVd && <th className="py-2 pr-3 font-medium">Cliente</th>}
                <th className="py-2 pr-3 font-medium text-right">Monto</th>
                <th className="py-2 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs">{f.code}</td>
                  {conVd && <td className="py-2 pr-3 text-xs">{f.type}</td>}
                  <td className="py-2 pr-3">
                    {f.date}
                    {f.accountingDate && f.accountingDate !== f.date && (
                      <span className="block text-[11px] text-muted-foreground">contable {f.accountingDate}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 capitalize">{confirmado[f.id]?.tipo === 'confirmado' ? 'confirmada' : f.status}</td>
                  {conVd && <td className="py-2 pr-3 text-xs">{f.client || '—'}</td>}
                  <td className="py-2 pr-3 text-right">{f.amount}</td>
                  <td className="py-2 text-right space-x-1 whitespace-nowrap">
                    <Button variant="ghost" size="sm" onClick={() => onVerLineas({ id: f.id, code: f.code })} title="Ver productos">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {sePuedeConfirmar(f) && confirmado[f.id]?.tipo !== 'confirmado' && (
                      <Button
                        size="sm" variant="outline" style={{ borderRadius: 'var(--r-ctl)' }}
                        disabled={sinTkc || ocupado || bloqueo === f.id}
                        onClick={() => onConfirmar(f.id, f.code)}
                        title="Confirmar" aria-label="Confirmar"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {confirmado[f.id] && confirmado[f.id].tipo !== 'confirmado' && (
                      <span className="text-xs text-[var(--c-bad)]">{confirmado[f.id].mensaje}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
        </div>
      )}
    </Card>
  );
}
