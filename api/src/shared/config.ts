import { z } from 'zod';

// El .env vive en la raíz del monorepo (api/src/shared → ../../../.env).
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url));
} catch {
  // Sin .env: se usan las variables ya presentes en el entorno.
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().default('ShopCart'),
  DB_APP_USER: z.string().min(1),
  DB_APP_PASSWORD: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL_MIN: z.coerce.number().int().positive().default(15),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((o) => o.trim())),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(10),
  CARRITO_ABANDONADO_MIN: z.coerce.number().int().positive().default(60),
  RESERVA_TTL_MIN: z.coerce.number().int().positive().default(15),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Configuración de entorno inválida (revisa .env.example):\n${issues}`);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
