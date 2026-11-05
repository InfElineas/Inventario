import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, Loader2, PackageCheck, Search, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import AlertBanner from '@/components/shared/AlertBanner';
import BotonAccion from '@/components/shared/BotonAccion';
import TkcBloqueoAviso from '@/components/shared/TkcBloqueoAviso';
import { useAccesoTkc } from '@/lib/useAccesoTkc';
import { useConfirm } from '@/lib/useConfirm';
import { SIN_SONDEO } from '@/lib/query-client';
import { warehouseName } from '@/services/tkc/warehouses';
import {
  cancelarDespachos, cerrarDespachos, pendientesDespachos, trabajoDespachos,
} from '@/services/despachosService';

const ESTADO_FILA = {
  cerrado:  { texto: 'Cerrado',  color: 'text-[var(--c-ok-dim)]' },
  omitido:  { texto: 'Omitido',  color: 'text-[var(--c-warn)]' },
  fallido:  { texto: 'Fallido',  color: 'text-[var(--c-bad)]' },
};

/** El mensaje de un error de la API, sea cual sea su forma. */
const mensajeDe = (r) => r?.body?.error?.message ?? `Error ${r?.status ?? ''} al hablar con el servidor.`;

/**
 * Cerrar los despachos de TKC de un almacén.
 *
 * El flujo, hecho para que no se pueda cerrar nada sin haberlo visto antes:
 *
 *   1. Se elige el almacén.
 *   2. «Revisar pendientes» LEE de TKC —con la cuenta de quien lo hace— y enseña
 *      qué despachos se cerrarían. No toca nada.
 *   3. Solo entonces se puede cerrar, con una confirmación que dice cuántos y de
 *      qué almacén: en TKC no se puede deshacer. Se puede empezar por el más
 *      antiguo, para probar.
 *   4. El cierre corre en el servidor y aquí se ve cómo avanza; se puede parar.
 *
 * El almacén es el del filtro de la página; cambiarlo invalida lo revisado.
 */
export default function CierreDespachos({ almacenInicial }) {
  const [abierto, setAbierto] = useState(false);
  // El almacén es el del filtro de la página, no se elige aquí: el servidor
  // saca de él el proveedor de TKC.
  const almacen = almacenInicial ?? '';
  const [trabajoId, setTrabajoId] = useState(null);
  const { tiene: conTkc, cargando: cargandoUsuario } = useAccesoTkc();
  const sinTkc = !cargandoUsuario && !conTkc;
  const { confirmDialog, ConfirmDialogNode } = useConfirm();

  // Lo revisado es de ESE almacén: si cambia, deja de valer.
  const [revisado, setRevisado] = useState(null);   // { almacen, ...respuesta }
  const vigente = revisado?.almacen === almacen ? revisado : null;

  const revisar = useMutation({
    mutationFn: () => pendientesDespachos(almacen),
    onSuccess: (r) => setRevisado(r.status === 200 ? { almacen, ...r.body } : { almacen, error: mensajeDe(r) }),
  });

  const cerrar = useMutation({
    mutationFn: (maximo) => cerrarDespachos({ almacen, maximo }),
    onSuccess: (r) => {
      if (r.status === 202) { setTrabajoId(r.body.id); setRevisado(null); }
      else setRevisado({ almacen, error: mensajeDe(r) });
    },
  });

  const trabajo = useQuery({
    queryKey: ['despachos-trabajo', trabajoId],
    queryFn: () => trabajoDespachos(trabajoId),
    enabled: Boolean(trabajoId),
    // Mientras corre se mira cada par de segundos; al terminar, ya no.
    refetchInterval: (q) => (q.state.data?.body?.estado === 'corriendo' ? 2000 : false),
    ...SIN_SONDEO,
  });
  const t = trabajo.data?.status === 200 ? trabajo.data.body : null;
  const corriendo = t?.estado === 'corriendo' || cerrar.isPending;

  async function pedirCierre(maximo) {
    const cuantos = maximo ? 'el despacho MÁS ANTIGUO' : `los ${vigente.total} despachos pendientes`;
    const ok = await confirmDialog(
      `Se cerrará ${cuantos} de ${warehouseName(almacen)} en TKC, con tu cuenta. Cerrar en TKC no se puede deshacer desde aquí.`,
      { title: 'Cerrar despachos', destructive: true },
    );
    if (ok) cerrar.mutate(maximo);
  }

  const cancelar = useMutation({ mutationFn: () => cancelarDespachos(trabajoId) });

  const cerrarVentana = (o) => { if (!o && corriendo) return; setAbierto(o); };

  return (
    <>
      <BotonAccion icono={PackageCheck} variant="outline" onClick={() => setAbierto(true)}>
        Cerrar despachos
      </BotonAccion>
      {ConfirmDialogNode}

      <Dialog open={abierto} onOpenChange={cerrarVentana}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="text-sm font-medium">Cerrar despachos de TKC</DialogTitle>
          <DialogDescription className="text-xs">
            Se hace con tu cuenta de TKC. Primero revisas qué se cerraría; cerrar no se puede deshacer.
          </DialogDescription>

          {sinTkc && <TkcBloqueoAviso funcion="cerrar despachos de TKC" />}

          {!almacen && (
            <AlertBanner variant="warning" message="Elige un almacén en el filtro de la página y vuelve a abrir esto." />
          )}

          {almacen && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-sm">
                  <span className="text-xs text-muted-foreground block">Almacén (el del filtro de la página)</span>
                  <strong>{warehouseName(almacen)}</strong>
                </p>
                <Button variant="outline" disabled={!almacen || sinTkc || corriendo || revisar.isPending}
                  onClick={() => revisar.mutate()} style={{ borderRadius: 'var(--r-ctl)' }}>
                  {revisar.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Search className="w-4 h-4 mr-1.5" />}
                  Revisar pendientes
                </Button>
              </div>

              {vigente?.error && <AlertBanner variant="danger" message={vigente.error} />}

              {vigente && !vigente.error && (
                <div className="space-y-3">
                  <p className="text-sm">
                    {vigente.total === 0
                      ? 'No hay despachos pendientes de cerrar.'
                      : <><strong>{vigente.total}</strong> {vigente.total === 1 ? 'despacho pendiente' : 'despachos pendientes'} de cerrar, hasta el {vigente.limite} (los de hoy no se cierran).</>}
                  </p>
                  {vigente.total > 0 && (
                    <>
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-border" style={{ borderRadius: 'var(--r-ctl)' }}>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-muted-foreground border-b border-border">
                              <th className="sticky top-0 z-10 bg-card px-3 py-1.5 font-medium">Despacho (id)</th>
                              <th className="sticky top-0 z-10 bg-card px-3 py-1.5 font-medium">Día</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {vigente.despachos.map((d, i) => (
                              <tr key={d.despachoId}>
                                <td className="px-3 py-1.5 font-mono">{d.despachoId}{i === 0 && <span className="ml-2 text-[11px] text-muted-foreground">el primero de la cola</span>}</td>
                                <td className="px-3 py-1.5 tabular-nums">{d.fecha}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        TKC los cierra en cola, del más antiguo al más nuevo, de uno en uno. Los incompletos
                        (con productos sin confirmar) se omiten y se dice por qué.
                      </p>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" disabled={corriendo || sinTkc} onClick={() => pedirCierre(1)} style={{ borderRadius: 'var(--r-ctl)' }}>
                          Cerrar solo el más antiguo
                        </Button>
                        <Button disabled={corriendo || sinTkc} onClick={() => pedirCierre(null)} style={{ borderRadius: 'var(--r-ctl)' }}>
                          Cerrar los {vigente.total} pendientes
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {t && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  {t.estado === 'corriendo' && <><Loader2 className="w-4 h-4 animate-spin" /> Cerrando despachos…</>}
                  {t.estado === 'terminado' && <><CheckCircle2 className="w-4 h-4 text-[var(--c-ok-dim)]" /> Terminado</>}
                  {t.estado === 'cancelado' && <><Square className="w-4 h-4 text-[var(--c-warn)]" /> Cancelado</>}
                  {t.estado === 'fallido' && <><CircleAlert className="w-4 h-4 text-[var(--c-bad)]" /> Se detuvo</>}
                </p>
                {t.estado === 'corriendo' && (
                  <Button variant="outline" size="sm" disabled={cancelar.isPending} onClick={() => cancelar.mutate()} style={{ borderRadius: 'var(--r-ctl)' }}>
                    Parar
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t.resumen.cerrados} cerrados · {t.resumen.omitidos} omitidos · {t.resumen.fallidos} fallidos
              </p>
              {t.error && <AlertBanner variant="danger" message={t.error} />}
              {t.filas.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-lg border border-border" style={{ borderRadius: 'var(--r-ctl)' }}>
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-border">
                      {t.filas.map((f) => (
                        <tr key={f.despachoId}>
                          <td className="px-3 py-1.5 font-mono">{f.numDespacho ? `#${f.numDespacho}` : f.despachoId}</td>
                          <td className="px-3 py-1.5 tabular-nums">{f.fecha}</td>
                          <td className="px-3 py-1.5">
                            <span className={`font-medium ${ESTADO_FILA[f.estado]?.color}`}>{ESTADO_FILA[f.estado]?.texto ?? f.estado}</span>
                            {f.motivo && <span className="block text-[11px] text-muted-foreground">{f.motivo}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
