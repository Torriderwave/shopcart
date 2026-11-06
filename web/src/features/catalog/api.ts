import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Categoria, ProductoDetalle, ProductoResumen } from '@shopcart/contracts';
import { api, apiPaged } from '../../shared/api/client';

export const useCategorias = (incluirInactivas = false) =>
  useQuery({
    queryKey: ['categorias', incluirInactivas],
    queryFn: () => api<Categoria[]>('/catalog/categorias', { query: { incluirInactivas } }),
    staleTime: 60_000,
  });

export const useProductos = (query: Record<string, unknown>) =>
  useQuery({
    queryKey: ['productos', query],
    queryFn: () => apiPaged<ProductoResumen>('/catalog/productos', { query }),
    placeholderData: keepPreviousData,
  });

export const useProducto = (id: number, incluirInactivos = false) =>
  useQuery({
    queryKey: ['producto', id, incluirInactivos],
    queryFn: () =>
      api<ProductoDetalle>(`/catalog/productos/${id}`, { query: { incluirInactivos } }),
    enabled: Number.isFinite(id),
  });
