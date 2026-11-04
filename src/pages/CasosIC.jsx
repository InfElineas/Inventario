import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import StatusBadge from '@/components/shared/StatusBadge';
import AlertBanner from '@/components/shared/AlertBanner';
import ReadOnlyBlock, { ReadOnlyField } from '@/components/shared/ReadOnlyBlock';
import Pagination from '@/components/shared/Pagination';
import CabeceraLista from '@/components/shared/CabeceraLista';
import ListaResponsive from '@/components/shared/ListaResponsive';
import { FiltroIcono, SelectorAlmacen } from '@/components/shared/ControlesLista';
import { Check, Clock, Download, ListFilter, Search, Trash2, X } from 'lucide-react';
import { useTablaPaginada } from '@/lib/useTablaPaginada';
import { useAlmacen } from '@/lib/useAlmacen';
import { useSortable } from '@/lib/useSortable';
import { useConfirm } from '@/lib/useConfirm';
import { tieneRol } from '@/lib/roles';
import { notifyUsuario } from '@/lib/notificationService';
import { warehouseName } from '@/services/tkc/warehouses';
import {
  ESTADOS_IC, VISTA_GLOBAL_IC, casosICaCsv, descuentoIC,
  puedeEliminarIC, puedeResponderIC, respuestaIC,
} from '@/lib/ic';

/**
 * Casos de intervención comercial.
 *
 * Lo que inventario manda desde Vencimientos con «Enviar a IC» llega aquí: un
 * lote que está por vencer y una propuesta de rebaja. Comercial responde —
 * aprueba o dice que no procede— y quien lo mandó ve qué pasó. Antes el caso
 * se guardaba y no lo veía nadie salvo un jefe, en Supervisión.
 */

import ComentariosDeSupervision from '@/components/supervision/ComentariosDeSupervision';
const PAGE_SIZE = 50;

const COL_DEFS = [
  { key: 'producto_nombre',     label: 'Producto' },
  { key: 'almacen_num',         label: 'Almacén' },
  { key: 'cant_x_vencer',       label: 'Cant.' },
  { key: 'fecha_vencimiento',   label: 'Vence' },
  { key: 'propuesta_precio_ic', label: 'Propuesta' },
  { key: 'estado_tarea',        label: 'Estado' },
  { key: 'especialista',        label: 'Enviado por' },
  { key: 'fecha_deteccion',     label: 'Enviado' },
];

const COL_TITULO = {
  producto_nombre:     { label: 'Producto' },
  almacen_num:         { label: 'Almacén', className: 'hidden md:table-cell' },
  cant_x_vencer:       { label: 'Cant.', align: 'right' },
  fecha_vencimiento:   { label: 'Vence' },
  propuesta_precio_ic: { label: 'Propuesta', align: 'right' },
  estado_tarea:        { label: 'Estado', align: 'center' },
  especialista:        { label: 'Enviado por', className: 'hidden lg:table-cell' },
  fecha_deteccion:     { label: 'Enviado', className: 'hidden md:table-cell' },
};

/** Clave de orden de la pantalla → columna real, para que ordene Postgres. */
const ORDEN_COLUMNA = {
  producto_nombre: 'producto_nombre',
  almacen_num: 'almacen_num',
  cant_x_vencer: 'cant_x_vencer',
  fecha_vencimiento: 'fecha_vencimiento',
  propuesta_precio_ic: 'propuesta_precio_ic',
  estado_tarea: 'estado_tarea',
  especialista: 'especialista_inv_nombre',
  fecha_deteccion: 'fecha_deteccion',
};

const dinero = (n) => (n == null || n === '' ? '—' : `$${Number(n).toFixed(2)}`);

export default function CasosIC() {
  const { almacen, setAlmacen, almacenesConfig } = useAlmacen();
  const [filterEstado, setFilterEstado] = useState('pendiente');
  const [searchQ, setSearchQ] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [exportando, setExportando] = useState(false);
  const { sort, onSort } = useSortable('fecha_deteccion', 'desc');
  const queryClient = useQueryClient();
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  // Cambiar de almacén, de filtro o de búsqueda devuelve a la primera página.
  const firmaFiltros = `${almacen}|${filterEstado}|${searchQ.trim()}`;
  const firmaPrevia = useRef(firmaFiltros);
  useEffect(() => {
    if (firmaPrevia.current !== firmaFiltros) { firmaPrevia.current = firmaFiltros; setPage(1); }
  }, [firmaFiltros]);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });
  const vistaGlobal = tieneRol(user, VISTA_GLOBAL_IC);

  const condiciones = {
    ...(almacen ? { almacen_num: almacen } : {}),
    ...(vistaGlobal || !user?.email ? {} : { especialista_inv_id: user.email }),
    ...(filterEstado === 'all' ? {} : { estado_tarea: filterEstado }),
  };
  const orden = ORDEN_COLUMNA[sort.key]
    ? `${sort.dir === 'asc' ? '' : '-'}${ORDEN_COLUMNA[sort.key]}`
    : '-created_date';

  const { filas, total, cargando } = useTablaPaginada({
    entidad: 'LoteIC',
    clave: ['casos-ic', almacen, vistaGlobal ? 'todos' : user?.email, filterEstado],
    condiciones,
    texto: searchQ,
    campos: ['producto_nombre', 'producto_codigo', 'no_lote'],
    orden,
    pagina: page,
    porPagina: PAGE_SIZE,
    activa: Boolean(user),
  });

  const selected = filas.find((c) => c.id === selectedId);
  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['casos-ic'] });
    queryClient.invalidateQueries({ queryKey: ['count'] });   // el contador del menú
  };

  const responder = useMutation({
    mutationFn: ({ caso, estado, nota }) => {
      const r = respuestaIC({ estado, nota, user });
      if (r.error) throw new Error(r.error);
      return base44.entities.LoteIC.update(caso.id, r.cambios);
    },
    onSuccess: (_r, { caso, estado, nota }) => {
      refrescar();
      setSelectedId(null);
      // Quien lo mandó no mira esta pantalla cada hora: se le dice.
      notifyUsuario(
        caso.especialista_inv_id, 'lote',
        estado === 'aprobado' ? 'Rebaja aprobada' : 'Caso de IC rechazado',
        `${caso.producto_nombre}: ${estado === 'aprobado' ? 'comercial aprobó la rebaja' : 'no procede'}`
          + `${nota?.trim() ? ` — ${nota.trim()}` : ''}`,
        '/ic',
      ).catch(() => {});
    },
    onError: (e) => alert(e.message),
  });

  const eliminar = useMutation({
    mutationFn: (id) => base44.entities.LoteIC.delete(id),
    onSuccess: () => { refrescar(); setSelectedId(null); },
    onError: (e) => alert(e.message),
  });

  /** Todo lo que cumple los filtros, no solo la página que se ve. */
  const exportar = async () => {
    setExportando(true);
    try {
      const buscado = searchQ.trim();
      const todos = buscado
        ? await base44.entities.LoteIC.buscar(buscado, ['producto_nombre', 'producto_codigo', 'no_lote'], condiciones, orden, 5000, 0)
        : await base44.entities.LoteIC.filter(condiciones, orden, 5000, 0);
      const csv = casosICaCsv(Array.isArray(todos) ? todos : []);
      // BOM al principio: sin él Excel abre el CSV en latin-1 y parte los acentos.
      const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `casos_ic_${almacen || 'todos'}_${filterEstado}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`No se pudo exportar: ${e.message}`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6">
      {ConfirmDialogNode}
      <CabeceraLista
        titulo="Casos de IC"
        subtitulo={vistaGlobal
          ? 'Lotes por vencer que inventario propone rebajar'
          : 'Los lotes que has mandado a intervención comercial'}
        recuento={`${total} ${total === 1 ? 'caso' : 'casos'}`}
        buscador={(
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Buscar por producto, código o lote..." className="pl-10" style={{ borderRadius: 'var(--r-ctl)' }} />
          </div>
        )}
        filtros={(
          <>
            <SelectorAlmacen almacen={almacen} setAlmacen={setAlmacen} almacenesConfig={almacenesConfig} />
            <FiltroIcono
              icono={ListFilter}
              etiqueta="Estado"
              valor={filterEstado}
              porDefecto="pendiente"
              onChange={setFilterEstado}
              opciones={[
                ...ESTADOS_IC.map((e) => ({ valor: e.valor, label: e.label })),
                { valor: 'all', label: 'Todos los estados' },
              ]}
            />
            <Button variant="outline" onClick={exportar} disabled={exportando || total === 0}
              style={{ borderRadius: 'var(--r-ctl)' }} title="Exportar a CSV los casos que cumplen los filtros">
              <Download className="w-4 h-4 lg:mr-1.5" />
              <span className="hidden lg:inline">Exportar</span>
            </Button>
            <Button variant="outline" asChild style={{ borderRadius: 'var(--r-ctl)' }}>
              <Link to="/lotes" title="Mandar un lote nuevo desde Vencimientos">
                <Clock className="w-4 h-4 lg:mr-1.5" />
                <span className="hidden lg:inline">Vencimientos</span>
              </Link>
            </Button>
          </>
        )}
      />

      {!vistaGlobal && (
        <p className="text-xs text-muted-foreground px-1">
          Aquí ves lo que mandaste y qué respondió comercial. Para mandar un lote nuevo, entra en{' '}
          <Link to="/lotes" className="underline">Vencimientos</Link> y elige «Enviar a intervención comercial» en el menú del lote.
        </p>
      )}

      <ListaResponsive
        columnas={COL_DEFS.filter((c) => vistaGlobal || c.key !== 'especialista').map((c) => c.key)}
        titulos={COL_TITULO}
        filas={filas}
        cargando={cargando}
        vacio={filterEstado === 'pendiente' ? 'Ningún caso pendiente.' : 'Ningún caso con estos filtros.'}
        claveDe={(c) => c.id}
        encabezado="producto_nombre"
        orden={{ sort, onSort }}
        alPulsar={(c) => setSelectedId(c.id)}
        celda={(c, k, enTabla) => celdaCaso(c, k, enTabla)}
      />

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPage={setPage} />

      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelectedId(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selected && (
            <DetalleCaso
              caso={selected}
              usuario={user}
              puedeResponder={puedeResponderIC(selected, user)}
              puedeEliminar={puedeEliminarIC(selected, user)}
              respondiendo={responder.isPending}
              onResponder={(estado, nota) => responder.mutate({ caso: selected, estado, nota })}
              onEliminar={async () => {
                const ok = await confirmDialog('Esta acción no se puede deshacer.', {
                  title: `¿Retirar el caso de «${selected.producto_nombre}»?`, destructive: true,
                });
                if (ok) eliminar.mutate(selected.id);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetalleCaso({ caso, usuario, puedeResponder, puedeEliminar, respondiendo, onResponder, onEliminar }) {
  const [nota, setNota] = useState('');
  const d = descuentoIC(caso);
  const respondido = caso.estado_tarea !== 'pendiente';

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          Caso de IC <StatusBadge status={caso.estado_tarea} />
        </DialogTitle>
        <DialogDescription className="text-xs">
          {warehouseName(caso.almacen_num) || caso.almacen_num} · enviado el {caso.fecha_deteccion?.slice(0, 10) ?? '—'}
        </DialogDescription>
      </DialogHeader>

      <ComentariosDeSupervision tabla="lotes_ic" registroId={caso.id} usuario={usuario} />

      <ReadOnlyBlock title="Lote">
        <ReadOnlyField label="Producto" value={caso.producto_nombre} />
        <ReadOnlyField label="Código" value={caso.producto_codigo} />
        <ReadOnlyField label="Lote" value={caso.no_lote || '—'} />
        <ReadOnlyField label="Vence" value={caso.fecha_vencimiento?.slice(0, 10) ?? '—'} />
        <ReadOnlyField label="Cant. por vencer" value={caso.cant_x_vencer} />
        <ReadOnlyField label="Enviado por" value={caso.especialista_inv_nombre || caso.especialista_inv_id} />
      </ReadOnlyBlock>

      <ReadOnlyBlock title="Propuesta de inventario">
        <ReadOnlyField label="Precio actual" value={dinero(caso.precio_actual)} />
        <ReadOnlyField label="Precio propuesto" value={dinero(caso.propuesta_precio_ic)} />
        <ReadOnlyField label="Descuento" value={d === null ? '—' : `${d.toFixed(1)}%`} />
        <ReadOnlyField label="Restaurar a" value={dinero(caso.precio_restaurar)} />
        <ReadOnlyField label="Clasificación" value={caso.clasif_inv || '—'} />
      </ReadOnlyBlock>

      {caso.nota_inv && (
        <p className="text-xs text-muted-foreground"><span className="font-medium">Nota de inventario:</span> {caso.nota_inv}</p>
      )}

      {respondido && (
        <AlertBanner
          variant={caso.estado_tarea === 'aprobado' ? 'success' : 'danger'}
          message={`${caso.estado_tarea === 'aprobado' ? 'Rebaja aprobada' : 'No procede'}`
            + `${caso.respondido_por ? ` — ${caso.respondido_por}` : ''}`
            + `${caso.fecha_respuesta ? `, el ${caso.fecha_respuesta.slice(0, 10)}` : ''}`
            + `${caso.notas_ic ? `. ${caso.notas_ic}` : '.'}`} />
      )}

      {puedeResponder && (
        <div className="space-y-3 p-4 border border-border rounded-lg bg-secondary/40" style={{ borderRadius: 'var(--r-ctl)' }}>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={500}
            placeholder="Respuesta de comercial (obligatoria si no procede)…"
            style={{ borderRadius: 'var(--r-ctl)' }} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={respondiendo} onClick={() => onResponder('aprobado', nota)}
              style={{ borderRadius: 'var(--r-ctl)' }}>
              <Check className="w-3.5 h-3.5 mr-1.5" /> Aprobar rebaja
            </Button>
            <Button size="sm" variant="outline" disabled={respondiendo || !nota.trim()}
              onClick={() => onResponder('rechazado', nota)} style={{ borderRadius: 'var(--r-ctl)' }}>
              <X className="w-3.5 h-3.5 mr-1.5" /> No procede
            </Button>
          </div>
        </div>
      )}

      {puedeEliminar && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onEliminar}
            className="text-[var(--c-bad)] hover:text-[var(--c-bad)] hover:bg-[var(--c-bad)]/10">
            <Trash2 className="w-4 h-4 mr-1.5" /> Retirar caso
          </Button>
        </div>
      )}
    </div>
  );
}

/** Una celda del listado: la misma para la tabla y para la ficha del móvil. */
function celdaCaso(c, clave, enTabla) {
  const env = (contenido, clases = '') => (enTabla
    ? <td key={clave} className={`px-2.5 py-1.5 ${clases}`}>{contenido}</td>
    : contenido);

  switch (clave) {
    case 'producto_nombre':
      return env(
        <>
          <p className="font-medium leading-snug">{c.producto_nombre}</p>
          <p className="text-xs text-muted-foreground font-mono">
            {c.producto_codigo}{c.no_lote ? ` · lote ${c.no_lote}` : ''}
          </p>
        </>,
      );
    case 'almacen_num':
      return env(<span className="text-xs text-muted-foreground">{warehouseName(c.almacen_num) || c.almacen_num || '—'}</span>);
    case 'cant_x_vencer':
      return env(<span className="font-medium tabular-nums">{c.cant_x_vencer}</span>, 'text-right');
    case 'fecha_vencimiento':
      return env(<span className="text-xs tabular-nums">{c.fecha_vencimiento?.slice(0, 10) || '—'}</span>);
    case 'propuesta_precio_ic':
      return env(<span className="tabular-nums">{dinero(c.propuesta_precio_ic)}</span>, 'text-right');
    case 'estado_tarea':
      return env(<StatusBadge status={c.estado_tarea} />, 'text-center');
    case 'especialista':
      return env(<span className="text-xs text-muted-foreground">{c.especialista_inv_nombre || c.especialista_inv_id || '—'}</span>);
    case 'fecha_deteccion':
      return env(<span className="text-muted-foreground">{c.fecha_deteccion?.slice(0, 10)}</span>);
    default:
      return env(null);
  }
}
