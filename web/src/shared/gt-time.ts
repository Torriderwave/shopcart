// Las vigencias se capturan y muestran en hora de Guatemala (UTC−6, sin horario de verano).
const GT = 'America/Guatemala';

/** ISO (UTC) → "YYYY-MM-DDTHH:mm" en hora de Guatemala, para <input type="datetime-local">. */
export function isoToGtInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: GT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
}

/** "YYYY-MM-DDTHH:mm" en hora de Guatemala → ISO UTC; '' si no es válida. */
export function gtInputToIso(v: string): string {
  if (!v) return '';
  const d = new Date(`${v}:00-06:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
