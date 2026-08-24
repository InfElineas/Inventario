import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useAlmacen, filterAlmacenesByConfig } from '@/lib/useAlmacen';
import { fetchInventarioTkc, fetchExistenciasTkc, TKC_ALMACENES } from '@/services/tkcService';
import { calcEstadoAnuncio, grupoAnuncio, codigoFlagsMatch } from '@/lib/anuncioEstado';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AlertBanner from '@/components/shared/AlertBanner';
import { Search, RefreshCw, Send, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

// TKC pagina del lado del servidor, así que la detección clasifica la página
// que está en pantalla. Se pide el máximo por página para que un barrido
// normal quepa en pocas vueltas.
const PAGE_SIZE = 200;

const PROBLEMAS = {
  muerto:         { label: 'Muerto',          tipo_caso: 'muerto' },
  desactivado:    { label: 'Desactivado',     tipo_caso: 'desactivado' },
  codigo_marcado: { label: 'Código marcado',  tipo_caso: 'codigo_marcado' },
};

/** Motivos por los que una fila de TKC entra en la lista de problemas. */
function detectarProblemas(row, ef, a, t, flags) {
  const out = [];
  const grupo = grupoAnuncio(row.idOnline, ef, a, t);
  if (grupo === 'MUERTO') out.push('muerto');
  else if (grupo === 'DESACTIVADO') out.push('desactivado');
  if (codigoFlagsMatch(row.codigo, flags).length > 0) out.push('codigo_marcado');
  return out;
}

export default function DeteccionTkc({ role }) {
  const { user } = useAuth();
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const queryClient = useQueryClient();

  const [page, setPage]           = useState(1);
  const [search, setSearch]       = useState('');
  const [filtro, setFiltro]       = useState('all');
  const [escalados, setEscalados] = useState({});   // rowId → 'ok' | 'error'

  const flags = useMemo(() => {
    const cfg = user?.anuncio_config;
    return Array.isArray(cfg?.codigo_flags) ? cfg.codigo_flags : [];
  }, [user?.anuncio_config]);

  const almacenes = useMemo(
    () => filterAlmacenesByConfig(TKC_ALMACENES, almacenesConfig),
    [almacenesConfig]
  );

  // ── Inventario TKC en vivo ──────────────────────────────────
  const {
    data: tkcData,
    isLoading,
    isFetching,
    error: tkcError,
  } = useQuery({
    queryKey: ['anuncios_tkc', almacen, page, search.trim()],
    queryFn: () => fetchInventarioTkc({
      almacen,
      page,
      limit: PAGE_SIZE,
      search: search.trim(),
      existencia: 'todos',
    }),
    enabled: Boolean(almacen),
    placeholderData: (prev) => prev,
    staleTime: 60 * 1000,
    retry: false,
  });

  const rows = tkcData?.rows ?? [];
  const pagination = tkcData?.pagination;

  // ── Existencias EF/A/T (submayor) ───────────────────────────
  // El listado solo trae el total; el desglose que necesita el clasificador
  // lo publica el submayor y el servidor lo cachea por almacén.
  const ids = useMemo(() => rows.map(r => r.idOnline).filter(Boolean), [rows]);

  const { data: existData, error: existError } = useQuery({
    queryKey: ['anuncios_tkc_exist', almacen, ids],
    queryFn: () => fetchExistenciasTkc({ almacen, ids }),
    enabled: Boolean(almacen) && ids.length > 0,
    placeholderData: (prev) => prev,
    refetchInterval: (q) => (q.state.data?.progreso?.listo ? false : 2000),
    staleTime: 60 * 1000,
    retry: false,
  });

  const existencias = existData?.existencias ?? {};
  const progreso    = existData?.progreso;
  const stockListo  = Boolean(progreso?.listo);

  // ── Clasificación ───────────────────────────────────────────
  const detectados = useMemo(() => {
    return rows.map(r => {
      const e = existencias[r.idOnline];
      const ef = e?.fisica    ?? null;
      const a  = e?.enAlmacen ?? null;
      const t  = e?.enTienda  ?? null;
      // Sin desglose todavía no se puede clasificar por estado: solo por código.
      const problemas = e
        ? detectarProblemas(r, ef, a, t, flags)
        : (codigoFlagsMatch(r.codigo, flags).length > 0 ? ['codigo_marcado'] : []);
      return {
        row: r,
        ef, a, t,
        sinDesglose: !e,
        estado: e ? calcEstadoAnuncio(r.idOnline, ef, a, t) : null,
        flagsMatch: codigoFlagsMatch(r.codigo, flags),
        problemas,
      };
    }).filter(d => d.problemas.length > 0);
  }, [rows, existencias, flags]);

  const visibles = useMemo(
    () => filtro === 'all' ? detectados : detectados.filter(d => d.problemas.includes(filtro)),
    [detectados, filtro]
  );

  const counts = useMemo(() => ({
    muerto:         detectados.filter(d => d.problemas.includes('muerto')).length,
    desactivado:    detectados.filter(d => d.problemas.includes('desactivado')).length,
    codigo_marcado: detectados.filter(d => d.problemas.includes('codigo_marcado')).length,
  }), [detectados]);

  // ── Escalar al workflow de anuncios ─────────────────────────
  const escalarMut = useMutation({
    mutationFn: async ({ det, tipoCaso }) => {
      const r = det.row;
      // anuncios_desact.producto_id referencia productos(id): hay que resolver
      // el uuid local por código. Si el producto no está sincronizado en la BD
      // local queda null (la columna lo admite) y el caso se crea igual.
      const { data: local } = await supabase
        .from('productos')
        .select('id')
        .eq('codigo_producto', r.codigo)
        .limit(1);

      const payload = {
        producto_id:        local?.[0]?.id ?? null,
        producto_nombre:    r.nombre,
        producto_codigo:    r.codigo,
        suministrador:      r.suministrador,
        tipo_caso:          tipoCaso,
        estado_tarea:       'pendiente',
        estado_anuncio_tkc: det.estado ?? '',
        ef_al_detectar:     det.ef ?? 0,
        fecha_deteccion:    format(new Date(), 'yyyy-MM-dd'),
      };

      const { error } = await supabase.from('anuncios_desact').insert(payload);
      if (error) throw error;
      return det.row.rowId;
    },
    onSuccess: (rowId) => {
      setEscalados(prev => ({ ...prev, [rowId]: 'ok' }));
      queryClient.invalidateQueries({ queryKey: ['anuncios'] });
    },
    onError: (error, vars) => {
      setEscalados(prev => ({ ...prev, [vars.det.row.rowId]: 'error' }));
      alert(error.message);
    },
  });

  const puedeEscalar = ['esp_anuncio', 'inv', 'administrador', 'superadmin'].includes(role);

  const totalPages = pagination?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap gap-3">
        <Select value={almacen || ''} onValueChange={(v) => { setAlmacen(v); setPage(1); }}>
          <SelectTrigger className="w-32" style={{ borderRadius: '8px' }}>
            <SelectValue placeholder="Almacén" />
          </SelectTrigger>
          <SelectContent>
            {almacenes.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar en TKC por nombre o código..."
            className="pl-10"
            style={{ borderRadius: '8px' }}
          />
        </div>

        <Select value={filtro} onValueChange={setFiltro}>
          <SelectTrigger className="w-44" style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los problemas</SelectItem>
            <SelectItem value="muerto">Muerto ({counts.muerto})</SelectItem>
            <SelectItem value="desactivado">Desactivado ({counts.desactivado})</SelectItem>
            <SelectItem value="codigo_marcado">Código marcado ({counts.codigo_marcado})</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['anuncios_tkc', almacen] });
            fetchExistenciasTkc({ almacen, ids, refrescar: true })
              .catch(() => {})
              .finally(() => queryClient.invalidateQueries({ queryKey: ['anuncios_tkc_exist', almacen] }));
          }}
          disabled={!almacen || isFetching}
          style={{ borderRadius: '8px' }}
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} /> Refrescar
        </Button>
      </div>

      {/* Avisos */}
      {!almacen && (
        <AlertBanner variant="info" message="Selecciona un almacén para consultar TKC." />
      )}
      {flags.length === 0 && (
        <AlertBanner
          variant="info"
          message="No tienes fragmentos de código configurados. Defínelos en Configuración › Códigos a marcar en Anuncios para detectar productos por código."
        />
      )}
      {tkcError && (
        <AlertBanner variant="danger" message={`Error al consultar TKC: ${tkcError.message}`} />
      )}
      {existError && (
        <AlertBanner variant="warning" message={`No se pudo leer el submayor: ${existError.message}. Solo se detecta por código.`} />
      )}
      {almacen && !stockListo && !existError && ids.length > 0 && (
        <AlertBanner
          variant="warning"
          message={`Cargando existencias del almacén (${progreso?.cargadas ?? 0}/${progreso?.total ?? '?'}). La detección por estado se completa cuando termine.`}
        />
      )}

      {/* Tabla */}
      <Card className="overflow-hidden" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Producto</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Código</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">EF</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">A</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">T</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Problema</th>
                {puedeEscalar && <th className="p-3" />}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Consultando TKC...</td></tr>
              ) : !almacen ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Sin almacén seleccionado</td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Sin productos con problemas en esta página
                </td></tr>
              ) : visibles.map(d => {
                const estadoEscalado = escalados[d.row.rowId];
                return (
                  <tr key={d.row.rowId} className="border-b hover:bg-accent/50 transition-colors">
                    <td className="p-3">
                      <p className="font-medium line-clamp-2">{d.row.nombre}</p>
                      <p className="text-xs text-muted-foreground">{d.row.suministrador || '—'}</p>
                    </td>
                    <td className="p-3 font-mono text-xs">{d.row.codigo}</td>
                    <td className="p-3 text-right">{d.sinDesglose ? '…' : d.ef}</td>
                    <td className="p-3 text-right">{d.sinDesglose ? '…' : d.a}</td>
                    <td className="p-3 text-right">{d.sinDesglose ? '…' : d.t}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {d.problemas.map(p => (
                          <span key={p} className="text-[10px] font-medium px-2 py-0.5 rounded bg-secondary text-foreground">
                            {PROBLEMAS[p].label}
                          </span>
                        ))}
                        {d.flagsMatch.length > 0 && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0EA5E9]/10 text-[#0EA5E9]">
                            {d.flagsMatch.join(', ')}
                          </span>
                        )}
                      </div>
                    </td>
                    {puedeEscalar && (
                      <td className="p-3 text-right whitespace-nowrap">
                        {estadoEscalado === 'ok' ? (
                          <span className="text-xs text-[#1D9E75]">Escalado</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={escalarMut.isPending}
                            onClick={() => escalarMut.mutate({
                              det: d,
                              tipoCaso: PROBLEMAS[d.problemas[0]].tipo_caso,
                            })}
                            style={{ borderRadius: '8px' }}
                          >
                            <Send className="w-3.5 h-3.5 mr-1" /> Escalar
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Paginación */}
      {almacen && pagination && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {visibles.length} con problemas de {rows.length} en la página · {pagination.total} productos en TKC
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="outline"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              style={{ borderRadius: '8px' }}
            >Anterior</Button>
            <span>Página {page} de {totalPages}</span>
            <Button
              size="sm" variant="outline"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage(p => p + 1)}
              style={{ borderRadius: '8px' }}
            >Siguiente</Button>
          </div>
        </div>
      )}

      {detectados.length > 0 && !stockListo && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          La detección aplica a la página actual. Recorre las páginas para barrer el almacén completo.
        </p>
      )}
    </div>
  );
}
