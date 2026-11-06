import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MermasPanel from '@/components/mermas/MermasPanel';
import HistorialMermas from '@/components/mermas/HistorialMermas';
import { useAuth } from '@/lib/AuthContext';
import { tieneRol } from '@/lib/roles';

/**
 * Mermas, para inventario: donde se registran y se siguen, y su historial por
 * almacén. Facturación las ve en la pestaña Mermas de Ajuste de disminución, donde
 * las ajusta.
 */

/** Quien ve las mermas de todos; el resto, solo las suyas. Igual que en el servidor. */
const VISTA_GLOBAL = ['jefe_depto', 'fact', 'auditor', 'administrador', 'superadmin'];

export default function Mermas() {
  const { user } = useAuth();
  const [vista, setVista] = useState('mermas');   // 'mermas' | 'historial'

  const pestanas = (
    <Tabs value={vista} onValueChange={setVista}>
      <TabsList>
        <TabsTrigger value="mermas">Mermas</TabsTrigger>
        <TabsTrigger value="historial">Historial</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (vista === 'historial') {
    return <HistorialMermas user={user} vistaGlobal={tieneRol(user, VISTA_GLOBAL)} pestanas={pestanas} />;
  }
  return <MermasPanel ambito="inventario" pestanas={pestanas} />;
}
