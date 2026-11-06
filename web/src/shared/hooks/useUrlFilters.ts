import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Estado de filtros/paginación/orden en la URL (compartible y sobrevive al recargar).
 * Cambiar cualquier filtro distinto de `page` regresa a la página 1.
 */
export function useUrlFilters(defaults: Record<string, string> = {}) {
  const [params, setParams] = useSearchParams();

  const values = useMemo(() => {
    const out: Record<string, string> = { ...defaults };
    params.forEach((v, k) => {
      out[k] = v;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const set = useCallback(
    (patch: Record<string, string | undefined>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
            else next.set(k, v);
          }
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  );

  return { values, set };
}
