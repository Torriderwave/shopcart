import type { ZodType } from 'zod';

/**
 * Adaptador zod → @mantine/form: la misma validación que el backend (esquemas de `contracts`).
 * Devuelve { 'ruta.del.campo': mensaje } con el primer error de cada campo.
 */
export function zodValidate<T>(schema: ZodType<T>) {
  return (values: unknown): Record<string, string> => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.');
      if (!(key in errors)) errors[key] = issue.message;
    }
    return errors;
  };
}
