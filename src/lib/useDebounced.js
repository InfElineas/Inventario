import { useEffect, useState } from 'react';

/**
 * Un valor que se actualiza `delay` ms después de que deja de cambiar. Para no
 * lanzar una petición por cada tecla al filtrar contra la API.
 */
export function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
