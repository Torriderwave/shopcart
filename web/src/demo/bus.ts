/** Aviso de "reportes obsoletos" (reemplaza al SSE del servidor). */
export type Alcance = 'ventas' | 'carritos' | 'todo';
const listeners = new Set<(a: Alcance) => void>();
export const onReportes = (fn: (a: Alcance) => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const emitirReportes = (a: Alcance): void => {
  for (const fn of listeners) fn(a);
};
export const hayEscuchas = (): boolean => listeners.size > 0;
