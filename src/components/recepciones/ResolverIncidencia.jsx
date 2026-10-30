import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import AlertBanner from '@/components/shared/AlertBanner';
import { RotateCcw, Check } from 'lucide-react';
import { format } from 'date-fns';

/**
 * Resolver las incidencias de una recepción.
 *
 * Antes esto era un desplegable de cuatro valores y nada más: quedaba
 * constancia de que alguien había decidido algo, pero no de qué ni por qué, y
 * las dos cosas que de verdad hacen falta —volver a contar y arreglar la
 * factura— no estaban por ninguna parte.
 *
 * Ahora cada diferencia se resuelve con tres piezas:
 *
 *   · Qué se decide. La lista incluye mandar a recontar y ajustar la factura,
 *     que son las salidas reales.
 *   · Cuánto se factura. La factura del proveedor dice lo que se pidió; esto
 *     es lo que hay que pagar de verdad. Arranca en lo recibido, que es lo
 *     correcto casi siempre, y se puede cambiar.
 *   · Por qué. Sin nota no se guarda nada que no sea «pendiente»: dentro de
 *     tres meses, una diferencia «aceptada» sin explicación no vale de nada.
 *
 * Mandar a recontar devuelve la recepción al muelle con esas líneas en
 * blanco. No lo puede hacer facturación: su parte es la factura.
 */

export const RESOLUCIONES = [
  { valor: 'pendiente',           label: 'Pendiente de decidir' },
  { valor: 'reconteo_solicitado', label: 'Mandar a recontar' },
  { valor: 'aceptada',            label: 'Aceptada: se paga lo recibido' },
  { valor: 'reclamada_proveedor', label: 'Reclamada al proveedor' },
  { valor: 'rechazo_parcial',     label: 'Rechazo parcial' },
  { valor: 'ajuste_factura',      label: 'Ajuste en la factura' },
  { valor: 'error_conteo',        label: 'Era un error de conteo' },
];

const ETIQUETA = Object.fromEntries(RESOLUCIONES.map((r) => [r.valor, r.label]));

export default function ResolverIncidencia({
  recepcion, puedeRecontar, puedeCerrar, usuario, onUpdate, onRecontar,
}) {
  const diferencias = recepcion.diferencias ?? [];
  const [marcadas, setMarcadas] = useState(() => new Set());

  if (diferencias.length === 0) return null;

  const guardar = (i, cambios) => {
    const copia = [...diferencias];
    copia[i] = {
      ...copia[i], ...cambios,
      resuelto_por: usuario?.email,
      fecha_resolucion: format(new Date(), 'yyyy-MM-dd'),
    };
    onUpdate({ diferencias: copia });
  };

  const alternar = (i) => setMarcadas((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });

  const sinResolver = diferencias.filter((d) => (d.tipo_diferencia ?? 'pendiente') === 'pendiente').length;

  return (
    <Card className="p-4 space-y-4" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Resolver incidencia</h2>
        <span className="text-xs text-muted-foreground">
          {sinResolver > 0
            ? `${sinResolver} de ${diferencias.length} sin decidir`
            : `${diferencias.length} ${diferencias.length === 1 ? 'resuelta' : 'resueltas'}`}
        </span>
      </div>

      {diferencias.map((d, i) => (
        <Linea key={i} dif={d} marcada={marcadas.has(i)}
          puedeRecontar={puedeRecontar}
          onMarcar={() => alternar(i)}
          onGuardar={(cambios) => guardar(i, cambios)} />
      ))}

      {puedeRecontar && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {marcadas.size > 0
              ? `${marcadas.size} ${marcadas.size === 1 ? 'producto marcado' : 'productos marcados'} para recontar.`
              : 'Marca los productos que haya que volver a contar.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={marcadas.size === 0}
              onClick={() => { onRecontar([...marcadas]); setMarcadas(new Set()); }}
              style={{ borderRadius: '8px' }}>
              <RotateCcw className="w-4 h-4 mr-1.5" /> Mandar a recontar
            </Button>
            {puedeCerrar && (
              <Button size="sm" disabled={sinResolver > 0}
                onClick={() => onUpdate({ estado: 'cerrada' })} style={{ borderRadius: '8px' }}>
                <Check className="w-4 h-4 mr-1.5" /> Dar por resuelta
              </Button>
            )}
          </div>
        </div>
      )}

      {puedeCerrar && sinResolver > 0 && (
        <p className="text-xs text-muted-foreground">
          Quedan {sinResolver} sin decidir: hasta que no lo estén, la recepción no se puede dar por resuelta.
        </p>
      )}
    </Card>
  );
}

function Linea({ dif, marcada, puedeRecontar, onMarcar, onGuardar }) {
  const [tipo, setTipo] = useState(dif.tipo_diferencia ?? 'pendiente');
  const [nota, setNota] = useState(dif.nota_resolucion ?? '');
  const [facturar, setFacturar] = useState(
    dif.cant_facturar ?? dif.cant_recibida ?? 0,
  );

  const sucio = tipo !== (dif.tipo_diferencia ?? 'pendiente')
    || nota !== (dif.nota_resolucion ?? '')
    || Number(facturar) !== Number(dif.cant_facturar ?? dif.cant_recibida ?? 0);

  // Decidir sin explicar no es decidir: en tres meses nadie se acuerda de por
  // qué se aceptó un faltante de treinta unidades.
  const faltaNota = tipo !== 'pendiente' && !nota.trim();

  return (
    <div className="p-3 rounded-lg border space-y-3 bg-secondary/30"
      style={{ borderRadius: '10px', borderWidth: '0.5px' }}>
      <div className="flex items-start gap-3">
        {puedeRecontar && (
          <Checkbox checked={marcada} onCheckedChange={onMarcar} className="mt-1" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{dif.producto_nombre || dif.producto_codigo}</p>
          <p className="text-xs text-muted-foreground">
            Se pidieron {dif.cant_esperada} y llegaron {dif.cant_recibida}
            {' · '}
            <span className={dif.cantidad_diferencia < 0 ? 'text-[#E24B4A]' : 'text-[#BA7517]'}>
              {dif.cantidad_diferencia > 0 ? '+' : ''}{dif.cantidad_diferencia}
            </span>
          </p>
        </div>
        {dif.fecha_resolucion && !sucio && (
          <span className="text-xs text-muted-foreground shrink-0 text-right">
            {ETIQUETA[dif.tipo_diferencia] ?? dif.tipo_diferencia}
            <br />{dif.fecha_resolucion}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="sm:col-span-2 space-y-1 text-xs text-muted-foreground">
          Qué se decide
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger style={{ borderRadius: '8px' }}><SelectValue /></SelectTrigger>
            <SelectContent>
              {RESOLUCIONES.map((r) => (
                <SelectItem key={r.valor} value={r.valor}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          Cantidad a facturar
          <Input type="number" min="0" value={facturar}
            onChange={(e) => setFacturar(e.target.value)} style={{ borderRadius: '8px' }} />
        </label>
      </div>

      <label className="block space-y-1 text-xs text-muted-foreground">
        Nota {tipo !== 'pendiente' && '*'}
        <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2}
          placeholder="Qué se acordó, con quién, y qué queda pendiente."
          style={{ borderRadius: '8px' }} />
      </label>

      {Number(facturar) !== Number(dif.cant_recibida) && (
        <AlertBanner variant="info"
          message={`Se facturarán ${facturar} de las ${dif.cant_recibida} que llegaron. Explica la diferencia en la nota.`} />
      )}

      <div className="flex justify-end">
        <Button size="sm" disabled={!sucio || faltaNota}
          onClick={() => onGuardar({
            tipo_diferencia: tipo,
            nota_resolucion: nota.trim(),
            cant_facturar: Number(facturar) || 0,
          })}
          style={{ borderRadius: '8px' }}>
          Guardar resolución
        </Button>
      </div>
    </div>
  );
}
