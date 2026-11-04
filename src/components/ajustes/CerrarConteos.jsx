import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import AlertBanner from '@/components/shared/AlertBanner';
import { Loader2, Send } from 'lucide-react';
import { procesarConteos } from '@/services/conteosFactService';
import { sentidoValido } from '@/lib/ajusteFact';

/**
 * Dar por procesados los conteos que el documento acaba de resolver.
 *
 * Antes, tras confirmar el ajuste, facturación tenía que ir a «Conteos por
 * facturar» y teclear el número del documento en cada conteo, uno por uno. Aquí
 * es un botón: cada conteo guarda el documento que lo resolvió, cómo, quién y
 * cuándo, y pasa a auditoría.
 *
 * Solo entran los conteos cuyo producto TKC aceptó en el documento. Si una
 * línea se rechazó, ese conteo se queda pendiente, y se dice.
 *
 * @param {object} props
 * @param {Array<{ conteo: object, anteriores: object[] }>} props.conteos  Los que se pasaron al formulario.
 * @param {Array<{ code: string }>} props.aceptadas  Las líneas que TKC montó.
 * @param {string} props.documento  El `TKCE…`/`TKCS…`/`TKCP…` del documento.
 * @param {string} [props.estado]   Cómo se resolvió, si no es lo que sugiere el resultado del conteo.
 * @param {'aumento'|'disminucion'|'transferencia'} [props.sentido]  Qué documento es: solo resuelve los conteos de su sentido.
 * @param {string} [props.notasPorDefecto]  Lo que va escrito en las notas, que se puede cambiar.
 * @param {() => void} [props.onHecho]
 */
export default function CerrarConteos({ conteos, aceptadas, documento, estado, sentido, notasPorDefecto, onHecho }) {
  const queryClient = useQueryClient();
  const [notas, setNotas] = useState(notasPorDefecto ?? '');
  const [resultado, setResultado] = useState(null);
  // Los que ya se escribieron: si un reintento vuelve a mandarlos, se procesarían dos veces.
  const [hechos, setHechos] = useState(() => new Set());

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const aceptados = new Set((aceptadas ?? []).map((l) => String(l.code)));
  const cubiertos = conteos.filter(({ conteo }) => aceptados.has(String(conteo.producto_codigo)));
  // Poka-yoke: lo que va en sentido contrario al documento no se da por procesado.
  const contrarios = cubiertos.filter(({ conteo }) => !sentidoValido(sentido, conteo.resultado));
  const porHacer = cubiertos.filter(({ conteo }) => !hechos.has(conteo.id) && sentidoValido(sentido, conteo.resultado));
  const fuera = conteos.filter(({ conteo }) => !aceptados.has(String(conteo.producto_codigo)));

  const cerrar = useMutation({
    mutationFn: () => procesarConteos({ conteos: porHacer, documento, estado, sentido, notas: notas.trim(), user }),
    onSuccess: (r) => {
      setResultado(r);
      setHechos((prev) => new Set([...prev, ...r.hechos.map((c) => c.id)]));
      queryClient.invalidateQueries({ queryKey: ['pend-fact'] });
      queryClient.invalidateQueries({ queryKey: ['inventarios'] });
      if (r.fallos.length === 0) onHecho?.();
    },
  });

  if (conteos.length === 0) return null;

  if (resultado && resultado.fallos.length === 0) {
    const n = hechos.size;
    return (
      <AlertBanner variant="success"
        message={`${n} ${n === 1 ? 'conteo quedó procesado' : 'conteos quedaron procesados'} `
          + `con el documento ${documento} y ${n === 1 ? 'pasó' : 'pasaron'} a auditoría.`} />
    );
  }

  return (
    <div className="space-y-3 rounded-lg border px-4 py-3" style={{ borderRadius: 'var(--r-ctl)' }}>
      <p className="text-sm font-medium">Dar por procesados los conteos</p>
      <p className="text-xs text-muted-foreground">
        {cubiertos.length === 0
          ? 'Ningún conteo de los que pasaste al formulario entró en el documento.'
          : `${porHacer.length} ${porHacer.length === 1 ? 'conteo entró' : 'conteos entraron'} en el documento ${documento}. `
            + 'Guardarán ese documento y pasarán a auditoría.'}
      </p>

      {fuera.length > 0 && (
        <AlertBanner variant="warning"
          message={`${fuera.length} ${fuera.length === 1 ? 'conteo no entró' : 'conteos no entraron'} en el documento `
            + `(${fuera.map(({ conteo }) => conteo.producto_codigo).join(', ')}) y se ${fuera.length === 1 ? 'queda pendiente' : 'quedan pendientes'}.`} />
      )}
      {contrarios.length > 0 && (
        <AlertBanner variant="danger"
          message={`${contrarios.map(({ conteo }) => conteo.producto_codigo).join(', ')} ${contrarios.length === 1 ? 'es un conteo' : 'son conteos'} `
            + 'que va en sentido contrario a este documento: no se da por procesado. Devuélvelo a inventario o resuélvelo con el documento que corresponde.'} />
      )}
      {resultado?.fallos.length > 0 && (
        <AlertBanner variant="danger"
          message={`No se pudo escribir en ${resultado.fallos.length} ${resultado.fallos.length === 1 ? 'conteo' : 'conteos'}: `
            + `${resultado.fallos.map((f) => `${f.conteo.producto_codigo} (${f.motivo})`).join('; ')}.`} />
      )}

      {porHacer.length > 0 && (
        <>
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={500}
            placeholder="Notas de facturación para estos conteos (opcional)…" style={{ borderRadius: 'var(--r-ctl)' }} />
          <div className="flex justify-end">
            <Button onClick={() => cerrar.mutate()} disabled={cerrar.isPending || !user} style={{ borderRadius: 'var(--r-ctl)' }}>
              {cerrar.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Send className="w-4 h-4 mr-1.5" />}
              Enviar a auditoría ({porHacer.length})
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
