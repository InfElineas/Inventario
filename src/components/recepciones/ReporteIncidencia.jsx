import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Printer, AlertTriangle } from 'lucide-react';
import { ETIQUETA_INCIDENCIA, incidenciasDe } from '@/lib/incidenciasRecepcion';

/**
 * El informe de lo que salió mal en una recepción.
 *
 * Tiene dos lectores con necesidades distintas. Quien recibió y su jefe
 * quieren saber qué reclamar al proveedor. Facturación quiere cuadrar la
 * factura contra lo que entró de verdad, y para eso necesita las cifras y
 * poder sacarlas de aquí: de ahí el botón de copiar, que deja el informe en
 * texto plano listo para pegar en un correo.
 */

const COLOR = {
  alta:  'bg-[#E24B4A14] text-[#E24B4A]',
  media: 'bg-[#BA751714] text-[#BA7517]',
  baja:  'bg-secondary text-muted-foreground',
};

export default function ReporteIncidencia({ recepcion }) {
  const [copiado, setCopiado] = useState(false);
  const incidencias = incidenciasDe(recepcion);

  if (incidencias.length === 0) return null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(enTexto(recepcion, incidencias));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      alert('El navegador no dejó copiar. Usa Imprimir.');
    }
  };

  return (
    <Card className="p-4 space-y-3" style={{ borderRadius: '12px', borderWidth: '0.5px' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#BA7517]" />
          <h2 className="text-sm font-medium">Reporte de incidencia</h2>
          <span className="text-xs text-muted-foreground">
            {incidencias.length} {incidencias.length === 1 ? 'incidencia' : 'incidencias'}
          </span>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={copiar} style={{ borderRadius: '8px' }}>
            <Copy className="w-3.5 h-3.5 mr-1.5" /> {copiado ? 'Copiado' : 'Copiar'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} style={{ borderRadius: '8px' }}>
            <Printer className="w-3.5 h-3.5 mr-1.5" /> Imprimir
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {recepcion.proveedor || 'Proveedor sin nombre'}
        {recepcion.no_orden ? ` · orden ${recepcion.no_orden}` : ''}
        {recepcion.fecha ? ` · ${recepcion.fecha}` : ''}
        {recepcion.especialista_nombre ? ` · recibió ${recepcion.especialista_nombre}` : ''}
      </p>

      <div className="space-y-2">
        {incidencias.map((i, n) => (
          <div key={n} className="flex flex-wrap items-start gap-2 p-2.5 rounded bg-secondary/40"
            style={{ borderRadius: '8px' }}>
            <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${COLOR[i.gravedad]}`}
              style={{ borderRadius: '4px' }}>
              {ETIQUETA_INCIDENCIA[i.tipo]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{i.producto || i.codigo}</p>
              <p className="text-xs text-muted-foreground">{i.detalle}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** El mismo informe en texto plano, para pegarlo en un correo. */
function enTexto(recepcion, incidencias) {
  const cabecera = [
    `Reporte de incidencia — ${recepcion.no_recepcion}`,
    `Proveedor: ${recepcion.proveedor || '—'}`,
    `Orden: ${recepcion.no_orden || '—'}`,
    `Fecha: ${recepcion.fecha || '—'}`,
    `Recibió: ${recepcion.especialista_nombre || recepcion.especialista_id || '—'}`,
    '',
  ];

  const filas = incidencias.map((i) =>
    `- [${ETIQUETA_INCIDENCIA[i.tipo]}] ${i.producto || i.codigo}`
    + (i.codigo && i.producto ? ` (${i.codigo})` : '')
    + `: ${i.detalle}`);

  return [...cabecera, ...filas].join('\n');
}
