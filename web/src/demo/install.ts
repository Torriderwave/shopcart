import { initState } from './db';
import { construirSeed } from './seed';
import { instalarFetch } from './router';
import { iniciarTareas } from './live';

/** Arranca la demo: estado del día (o seed), `fetch` simulado y tareas periódicas. */
export function instalarDemo(): void {
  initState(construirSeed);
  instalarFetch();
  iniciarTareas();
}
