import MermasPanel from '@/components/mermas/MermasPanel';

/**
 * Mermas, para inventario: donde se registran y se siguen. Facturación las ve
 * en la pestaña Mermas de Ajuste de disminución, donde las ajusta.
 */
export default function Mermas() {
  return <MermasPanel ambito="inventario" />;
}
