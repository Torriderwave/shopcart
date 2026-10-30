import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { Health } from '@shopcart/contracts';
import { authRouter } from './modules/auth/auth.routes';
import { cartRouter } from './modules/cart/cart.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { couponsRouter } from './modules/coupons/coupons.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import { ordersRouter } from './modules/orders/orders.routes';
import { reportsRouter } from './modules/reports/reports.routes';
import { config } from './shared/config';
import { executeSp } from './shared/db';
import { errorHandler, notFoundHandler, AppError } from './shared/errors';
import { ok } from './shared/http';
import { httpLogger } from './shared/logger';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(httpLogger);
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  const api = Router();

  api.get('/health', async (_req, res) => {
    try {
      await executeSp('SP_Sistema_Salud');
    } catch {
      throw new AppError('INTERNO', 503, 'Base de datos no disponible.');
    }
    ok<Health>(res, { status: 'ok', db: 'up' });
  });

  api.use(authRouter);
  api.use(catalogRouter);
  api.use(inventoryRouter);
  api.use(cartRouter);
  api.use(couponsRouter);
  api.use(ordersRouter);
  api.use(reportsRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
