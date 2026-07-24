import { useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'elineas_almacen_activo'

/**
 * Hook compartido: almacén activo del usuario.
 *
 * - almacen:         almacén seleccionado actualmente (string)
 * - almacenesConfig: array de almacenes que el usuario tiene configurados.
 *                    Vacío = sin restricción, ve todos.
 * - setAlmacen:      cambia el almacén activo y lo persiste en localStorage
 *
 * Auto-selección: si el usuario tiene exactamente 1 almacén configurado,
 * se selecciona automáticamente sin que tenga que elegirlo manualmente.
 */
export function useAlmacen() {
  const { user } = useAuth()
  const almacenesConfig = user?.almacenes_config ?? []

  const [almacen, setAlmacenState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || user?.almacen_num || ''
  )

  // Seed desde el perfil si localStorage está vacío
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY) && user?.almacen_num) {
      setAlmacenState(user.almacen_num)
    }
  }, [user?.almacen_num])

  // Auto-selección cuando hay exactamente 1 almacén configurado
  useEffect(() => {
    if (almacenesConfig.length === 1) {
      const solo = almacenesConfig[0]
      if (almacen !== solo) {
        localStorage.setItem(STORAGE_KEY, solo)
        setAlmacenState(solo)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacenesConfig.join(',')])

  // Si el almacén activo (heredado de localStorage/perfil) ya no está entre
  // los configurados para este usuario, se descarta — evita seguir viendo
  // datos de un almacén al que ya no tiene acceso tras un cambio de config.
  useEffect(() => {
    if (almacenesConfig.length > 0 && almacen && !almacenesConfig.includes(almacen)) {
      const fallback = almacenesConfig.length === 1 ? almacenesConfig[0] : ''
      if (fallback) localStorage.setItem(STORAGE_KEY, fallback)
      else localStorage.removeItem(STORAGE_KEY)
      setAlmacenState(fallback)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacenesConfig.join(','), almacen])

  const setAlmacen = (num) => {
    if (num) localStorage.setItem(STORAGE_KEY, num)
    else localStorage.removeItem(STORAGE_KEY)
    setAlmacenState(num)
  }

  return { almacen, setAlmacen, almacenesConfig }
}

/**
 * Filtra la lista de almacenes del sistema según la configuración del usuario.
 * Si almacenesConfig está vacío, devuelve todos (sin restricción).
 */
export function filterAlmacenesByConfig(allAlmacenes, almacenesConfig) {
  if (!almacenesConfig?.length) return allAlmacenes
  return allAlmacenes.filter(a => almacenesConfig.includes(a))
}
