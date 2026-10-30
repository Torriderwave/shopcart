import cron, { type ScheduledTask } from 'node-cron';
import { executeSp } from '../shared/db';
import { logger } from '../shared/logger';

/** Libera cada minuto las reservas vencidas (la lógica vive en el SP; aquí solo se programa). */
export async function liberarReservasVencidas(): Promise<number> {
  const r = await executeSp('SP_Inventario_LiberarReservasVencidas');
  return Number(r.recordsets[0]?.[0]?.liberadas ?? 0);
}

export function startLiberarReservasJob(): ScheduledTask {
  let corriendo = false;
  return cron.schedule('* * * * *', async () => {
    if (corriendo) return; // evita solapar ejecuciones si una tarda más de un minuto
    corriendo = true;
    try {
      const n = await liberarReservasVencidas();
      if (n > 0) logger.info({ liberadas: n }, 'Reservas vencidas liberadas');
    } catch (err) {
      logger.error({ err }, 'Falló la liberación de reservas');
    } finally {
      corriendo = false;
    }
  });
}
