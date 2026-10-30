import { createApp } from './app';
import { startLiberarReservasJob } from './jobs/liberarReservas.job';
import { config } from './shared/config';
import { closePool, getPool } from './shared/db';
import { logger } from './shared/logger';

async function main(): Promise<void> {
  await getPool(); // falla rápido si la BD no está disponible o las credenciales son incorrectas
  const server = createApp().listen(config.PORT, () => {
    logger.info(`API escuchando en http://localhost:${config.PORT}/api/v1`);
  });

  const job = startLiberarReservasJob();

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Cerrando…');
    void job.stop();
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'No se pudo iniciar la API');
  process.exit(1);
});
