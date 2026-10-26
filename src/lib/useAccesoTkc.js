import { useAuth } from '@/lib/AuthContext';

/**
 * ¿Puede esta persona usar lo que consulta TKC? Depende solo de que tenga
 * credenciales vigentes (`tiene_tkc`): las pone ella en Configuración y duran
 * 7 días. Las pantallas lo usan para bloquear sus controles y llamadas, y
 * `TkcBloqueoAviso` para decir por qué.
 */
export function useAccesoTkc() {
  const { user } = useAuth();
  return { tiene: Boolean(user?.tiene_tkc), cargando: !user };
}
