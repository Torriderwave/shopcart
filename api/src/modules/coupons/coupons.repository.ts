import type { Cupon, CuponInput, ListarCuponesQuery } from '@shopcart/contracts';
import { executeSp, firstRow, iso, p, pageRows, T, type Row } from '../../shared/db';

const toCupon = (r: Row): Cupon => ({
  idCupon: r.idCupon as number,
  codigo: r.codigo as string,
  tipo: r.tipo as Cupon['tipo'],
  valor: Number(r.valor),
  montoMinimo: Number(r.montoMinimo),
  usosTotalesMax: r.usosTotalesMax as number,
  usosTotalesActual: r.usosTotalesActual as number,
  usosPorCliente: r.usosPorCliente as number,
  idCategoria: (r.idCategoria as number | null) ?? null,
  categoria: (r.categoria as string | null) ?? null,
  vigenteDesde: iso(r.vigenteDesde),
  vigenteHasta: iso(r.vigenteHasta),
  activo: Boolean(r.activo),
  vigente: Boolean(r.vigente),
});

const campos = (c: CuponInput) => ({
  Codigo: p(T.NVarChar(30), c.codigo),
  Tipo: p(T.NVarChar(12), c.tipo),
  Valor: p(T.Decimal(18, 2), c.valor),
  MontoMinimo: p(T.Decimal(18, 2), c.montoMinimo),
  UsosTotalesMax: p(T.Int, c.usosTotalesMax),
  UsosPorCliente: p(T.Int, c.usosPorCliente),
  IDCategoria: p(T.Int, c.idCategoria),
  VigenteDesde: p(T.DateTime2(3), c.vigenteDesde),
  VigenteHasta: p(T.DateTime2(3), c.vigenteHasta),
});

export async function listar(
  idSesion: number,
  q: ListarCuponesQuery,
): Promise<{ items: Cupon[]; total: number }> {
  const r = await executeSp('SP_Cupones_Listar', {
    IDUsuarioSesion: p(T.Int, idSesion),
    Q: p(T.NVarChar(30), q.q ?? null),
    Activo: p(T.Bit, q.activo ?? null),
    Vigente: p(T.Bit, q.vigente ?? null),
    OrdenarPor: p(T.NVarChar(20), q.sort.campo),
    Direccion: p(T.NVarChar(4), q.sort.direccion),
    Pagina: p(T.Int, q.page),
    TamanoPagina: p(T.Int, q.pageSize),
  });
  const { items, total } = pageRows(r.recordsets[0] ?? []);
  return { items: items.map(toCupon), total };
}

export async function crear(idSesion: number, c: CuponInput): Promise<Cupon> {
  const r = await executeSp('SP_Cupones_Crear', {
    IDUsuarioSesion: p(T.Int, idSesion),
    ...campos(c),
  });
  return toCupon(firstRow(r)!);
}

export async function actualizar(idSesion: number, id: number, c: CuponInput): Promise<Cupon> {
  const r = await executeSp('SP_Cupones_Actualizar', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDCupon: p(T.Int, id),
    ...campos(c),
    Activo: p(T.Bit, c.activo),
  });
  return toCupon(firstRow(r)!);
}

export async function desactivar(idSesion: number, id: number): Promise<void> {
  await executeSp('SP_Cupones_Desactivar', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDCupon: p(T.Int, id),
  });
}
