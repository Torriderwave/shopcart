import type {
  Atributos,
  AjusteInput,
  EntradaInput,
  Existencia,
  ExistenciaListado,
  KardexQuery,
  KardexResponse,
  ListarExistenciasQuery,
  MovimientoKardex,
} from '@shopcart/contracts';
import { executeSp, firstRow, iso, p, pageRows, T, type Row } from '../../shared/db';

function parseAtributos(json: unknown): Atributos {
  try {
    return JSON.parse(String(json)) as Atributos;
  } catch {
    return {};
  }
}

const toExistencia = (r: Row): Existencia => ({
  idVariante: r.idVariante as number,
  sku: r.sku as string,
  producto: r.producto as string,
  atributos: parseAtributos(r.atributosJson),
  fisica: r.fisica as number,
  reservada: r.reservada as number,
  disponible: r.disponible as number,
});

const toListado = (r: Row): ExistenciaListado => ({
  ...toExistencia(r),
  idCategoria: r.idCategoria as number,
  categoria: r.categoria as string,
  varianteActiva: r.varianteActiva as boolean,
});

const toMovimiento = (r: Row): MovimientoKardex => ({
  idKardex: r.idKardex as number,
  fecha: iso(r.fecha),
  tipo: r.tipo as MovimientoKardex['tipo'],
  cantidad: r.cantidad as number,
  resultante: r.resultante as number,
  motivo: r.motivo as string,
  usuario: r.usuario as string,
  numeroPedido: (r.numeroPedido as string | null) ?? null,
});

export async function listarExistencias(
  idSesion: number,
  q: ListarExistenciasQuery,
): Promise<{ items: ExistenciaListado[]; total: number }> {
  const r = await executeSp('SP_Inventario_ListarExistencias', {
    IDUsuarioSesion: p(T.Int, idSesion),
    Q: p(T.NVarChar(100), q.q ?? null),
    IDCategoria: p(T.Int, q.idCategoria ?? null),
    SoloSinStock: p(T.Bit, q.soloSinStock),
    OrdenarPor: p(T.NVarChar(20), q.sort.campo),
    Direccion: p(T.NVarChar(4), q.sort.direccion),
    Pagina: p(T.Int, q.page),
    TamanoPagina: p(T.Int, q.pageSize),
  });
  const { items, total } = pageRows(r.recordsets[0] ?? []);
  return { items: items.map(toListado), total };
}

export async function obtenerKardex(
  idSesion: number,
  idVariante: number,
  q: KardexQuery,
): Promise<{ data: KardexResponse; total: number }> {
  const r = await executeSp('SP_Inventario_ObtenerKardex', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDVariante: p(T.Int, idVariante),
    Tipo: p(T.NVarChar(12), q.tipo ?? null),
    Desde: p(T.NVarChar(10), q.desde ?? null),
    Hasta: p(T.NVarChar(10), q.hasta ?? null),
    Pagina: p(T.Int, q.page),
    TamanoPagina: p(T.Int, q.pageSize),
  });
  const { items, total } = pageRows(r.recordsets[0] ?? []);
  return {
    data: {
      variante: toExistencia(r.recordsets[1]![0]!),
      movimientos: items.map(toMovimiento),
    },
    total,
  };
}

export async function registrarEntrada(idSesion: number, e: EntradaInput): Promise<Existencia> {
  const r = await executeSp('SP_Inventario_Entrada', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDVariante: p(T.Int, e.idVariante),
    Cantidad: p(T.Int, e.cantidad),
    Motivo: p(T.NVarChar(200), e.motivo),
  });
  return toExistencia(firstRow(r)!);
}

export async function registrarAjuste(idSesion: number, a: AjusteInput): Promise<Existencia> {
  const r = await executeSp('SP_Inventario_Ajuste', {
    IDUsuarioSesion: p(T.Int, idSesion),
    IDVariante: p(T.Int, a.idVariante),
    Cantidad: p(T.Int, a.cantidad),
    Motivo: p(T.NVarChar(200), a.motivo),
  });
  return toExistencia(firstRow(r)!);
}
