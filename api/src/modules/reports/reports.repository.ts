import type {
  CarritoAbandonado,
  EntradaBitacora,
  Kpis,
  ListarBitacoraQuery,
  RangoQuery,
  TopProducto,
  TopProductosQuery,
  VentaCategoria,
  VentaPeriodo,
  VentasQuery,
} from '@shopcart/contracts';
import { executeSp, firstRow, iso, p, pageRows, T, type Row } from '../../shared/db';

const rango = (q: RangoQuery) => ({
  Desde: p(T.NVarChar(10), q.desde ?? null),
  Hasta: p(T.NVarChar(10), q.hasta ?? null),
});

const dateOnly = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v);

export async function kpis(idSesion: number, q: RangoQuery): Promise<Kpis> {
  const r = firstRow(
    await executeSp('SP_Reportes_Kpis', { IDUsuarioSesion: p(T.Int, idSesion), ...rango(q) }),
  )!;
  return {
    ventasNetas: Number(r.ventasNetas),
    pedidos: Number(r.pedidos),
    ticketPromedio: Number(r.ticketPromedio),
    unidades: Number(r.unidades),
    montoDevuelto: Number(r.montoDevuelto),
    desde: dateOnly(r.desde),
    hasta: dateOnly(r.hasta),
  };
}

export async function ventasPorPeriodo(idSesion: number, q: VentasQuery): Promise<VentaPeriodo[]> {
  const r = await executeSp('SP_Reportes_VentasPorPeriodo', {
    IDUsuarioSesion: p(T.Int, idSesion),
    ...rango(q),
    Agrupacion: p(T.NVarChar(6), q.agrupacion),
  });
  return (r.recordsets[0] ?? []).map((x) => ({
    periodo: x.periodo as string,
    ventasNetas: Number(x.ventasNetas),
    pedidos: Number(x.pedidos),
  }));
}

export async function ventasPorCategoria(
  idSesion: number,
  q: RangoQuery,
): Promise<VentaCategoria[]> {
  const r = await executeSp('SP_Reportes_VentasPorCategoria', {
    IDUsuarioSesion: p(T.Int, idSesion),
    ...rango(q),
  });
  return (r.recordsets[0] ?? []).map((x) => ({
    idCategoria: x.idCategoria as number,
    categoria: x.categoria as string,
    ventasNetas: Number(x.ventasNetas),
    unidades: Number(x.unidades),
    pedidos: Number(x.pedidos),
  }));
}

export async function topProductos(idSesion: number, q: TopProductosQuery): Promise<TopProducto[]> {
  const r = await executeSp('SP_Reportes_TopProductos', {
    IDUsuarioSesion: p(T.Int, idSesion),
    ...rango(q),
    Limite: p(T.Int, q.limite),
  });
  return (r.recordsets[0] ?? []).map((x) => ({
    idProducto: x.idProducto as number,
    producto: x.producto as string,
    unidades: Number(x.unidades),
    ventasNetas: Number(x.ventasNetas),
  }));
}

export async function carritosAbandonados(
  idSesion: number,
  minutos: number,
  page: number,
  pageSize: number,
): Promise<{ items: CarritoAbandonado[]; total: number }> {
  const r = await executeSp('SP_Reportes_CarritosAbandonados', {
    IDUsuarioSesion: p(T.Int, idSesion),
    Minutos: p(T.Int, minutos),
    Pagina: p(T.Int, page),
    TamanoPagina: p(T.Int, pageSize),
  });
  const { items, total } = pageRows(r.recordsets[0] ?? []);
  return {
    total,
    items: items.map((x) => ({
      idCarrito: x.idCarrito as number,
      cliente: (x.cliente as string | null) ?? null,
      correoCliente: (x.correoCliente as string | null) ?? null,
      items: Number(x.items),
      subtotal: Number(x.subtotal),
      ultimaActividad: iso(x.ultimaActividad),
    })),
  };
}

function parseJson(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  try {
    return JSON.parse(String(v)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const toEntrada = (x: Row): EntradaBitacora => ({
  idBitacora: Number(x.idBitacora),
  fecha: iso(x.fecha),
  usuario: x.usuario as string,
  idUsuario: (x.idUsuario as number | null) ?? null,
  modulo: x.modulo as string,
  entidad: x.entidad as string,
  idEntidad: x.idEntidad as number,
  accion: x.accion as EntradaBitacora['accion'],
  valorAnterior: parseJson(x.valorAnterior),
  valorNuevo: parseJson(x.valorNuevo),
});

export async function listarBitacora(
  idSesion: number,
  q: ListarBitacoraQuery,
): Promise<{ items: EntradaBitacora[]; total: number }> {
  const r = await executeSp('SP_Bitacora_Listar', {
    IDUsuarioSesion: p(T.Int, idSesion),
    Modulo: p(T.NVarChar(30), q.modulo ?? null),
    Entidad: p(T.NVarChar(50), q.entidad ?? null),
    IDUsuario: p(T.Int, q.idUsuario ?? null),
    Accion: p(T.NVarChar(12), q.accion ?? null),
    Desde: p(T.NVarChar(10), q.desde ?? null),
    Hasta: p(T.NVarChar(10), q.hasta ?? null),
    Pagina: p(T.Int, q.page),
    TamanoPagina: p(T.Int, q.pageSize),
  });
  const { items, total } = pageRows(r.recordsets[0] ?? []);
  return { items: items.map(toEntrada), total };
}
