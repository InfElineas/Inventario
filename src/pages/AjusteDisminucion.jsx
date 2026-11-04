import { useSearchParams } from 'react-router-dom';
import AjusteForm from '@/components/ajustes/AjusteForm';

export default function AjusteDisminucion() {
  // `?tab=mermas`: los enlaces de las mermas (avisos, panel) llegan a su pestaña.
  const [consulta] = useSearchParams();
  return <AjusteForm tipo="disminucion" pestana={consulta.get('tab') ?? undefined} />;
}
