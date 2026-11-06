const money = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
export const fmtMoney = (n: number): string => money.format(n);

const dateTime = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Guatemala',
});
const dateOnly = new Intl.DateTimeFormat('es-GT', {
  dateStyle: 'medium',
  timeZone: 'America/Guatemala',
});
export const fmtDateTime = (iso: string): string => dateTime.format(new Date(iso));
export const fmtDate = (iso: string): string => dateOnly.format(new Date(iso));

/** Atributos de variante → "Talla: M · Color: Rojo". */
export const fmtAtributos = (a: Record<string, string>): string =>
  Object.entries(a)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

/** YYYY-MM-DD de hoy en hora de Guatemala (para rangos del dashboard). */
export function hoyGT(offsetDias = 0): string {
  const d = new Date(Date.now() + offsetDias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(d);
}
