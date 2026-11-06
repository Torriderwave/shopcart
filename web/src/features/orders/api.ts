import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CrearDevolucionInput,
  EstadoPedido,
  PedidoDetalle,
  PedidoResumen,
  PedidoResumenAdmin,
} from '@shopcart/contracts';
import { api, apiPaged } from '../../shared/api/client';

export const useMisPedidos = (query: Record<string, unknown>) =>
  useQuery({
    queryKey: ['orders', 'mine', query],
    queryFn: () => apiPaged<PedidoResumen>('/orders/mine', { query }),
    placeholderData: keepPreviousData,
  });

export const usePedidosAdmin = (query: Record<string, unknown>) =>
  useQuery({
    queryKey: ['orders', 'admin', query],
    queryFn: () => apiPaged<PedidoResumenAdmin>('/orders', { query }),
    placeholderData: keepPreviousData,
  });

export const usePedido = (id: number) =>
  useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () => api<PedidoDetalle>(`/orders/${id}`),
    enabled: Number.isFinite(id),
  });

/** Las acciones sobre un pedido devuelven el detalle actualizado. */
export function usePedidoAcciones(id: number) {
  const qc = useQueryClient();
  const store = (p: PedidoDetalle) => {
    qc.setQueryData(['orders', 'detail', id], p);
    void qc.invalidateQueries({
      queryKey: ['orders'],
      predicate: (q) => q.queryKey[1] !== 'detail',
    });
    void qc.invalidateQueries({ queryKey: ['existencias'] });
  };
  return {
    cancelar: useMutation({
      mutationFn: (motivo: string) =>
        api<PedidoDetalle>(`/orders/${id}/cancel`, { method: 'POST', body: { motivo } }),
      onSuccess: store,
    }),
    estado: useMutation({
      mutationFn: (v: { estado: EstadoPedido; nota?: string }) =>
        api<PedidoDetalle>(`/orders/${id}/status`, { method: 'PATCH', body: v }),
      onSuccess: store,
    }),
    devolver: useMutation({
      mutationFn: (v: CrearDevolucionInput) =>
        api<PedidoDetalle>(`/orders/${id}/returns`, { method: 'POST', body: v }),
      onSuccess: store,
    }),
  };
}
