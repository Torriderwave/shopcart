import { Router, type Request } from 'express';
import {
  ActualizarCantidadInputSchema,
  AgregarLineaInputSchema,
  AplicarCuponInputSchema,
  IdParamSchema,
  type ActualizarCantidadInput,
  type AgregarLineaInput,
  type AplicarCuponInput,
} from '@shopcart/contracts';
import { optionalAuth } from '../../shared/auth';
import { cartToken, ok, valid, validate } from '../../shared/http';
import * as service from './cart.service';

export const cartRouter = Router();

// Invitado (X-Cart-Token) o Cliente autenticado: el mismo contrato para ambos.
cartRouter.use('/cart', optionalAuth);

const identidad = (req: Request): service.Identidad => ({
  usuario: req.user,
  token: cartToken(req),
});

cartRouter.get('/cart', async (req, res) => {
  ok(res, await service.obtener(identidad(req)));
});

cartRouter.post('/cart/items', validate({ body: AgregarLineaInputSchema }), async (req, res) => {
  const { body } = valid<unknown, unknown, AgregarLineaInput>(res);
  ok(res, await service.agregarLinea(identidad(req), body), 201);
});

cartRouter.patch(
  '/cart/items/:id',
  validate({ params: IdParamSchema, body: ActualizarCantidadInputSchema }),
  async (req, res) => {
    const { params, body } = valid<{ id: number }, unknown, ActualizarCantidadInput>(res);
    ok(res, await service.actualizarCantidad(identidad(req), params.id, body));
  },
);

cartRouter.delete('/cart/items/:id', validate({ params: IdParamSchema }), async (req, res) => {
  const { params } = valid<{ id: number }>(res);
  ok(res, await service.eliminarLinea(identidad(req), params.id));
});

cartRouter.post('/cart/coupon', validate({ body: AplicarCuponInputSchema }), async (req, res) => {
  const { body } = valid<unknown, unknown, AplicarCuponInput>(res);
  ok(res, await service.aplicarCupon(identidad(req), body.codigo));
});

cartRouter.delete('/cart/coupon', async (req, res) => {
  ok(res, await service.quitarCupon(identidad(req)));
});
