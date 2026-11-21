/* Libro .xlsx mínimo (ZIP sin compresión + SpreadsheetML) para "Exportar a Excel" sin servidor. */

export type Celda = string | number;
export interface Hoja {
  nombre: string;
  filas: Celda[][];
}

const enc = new TextEncoder();
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = TABLA_CRC[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = enc.encode(a.nombre);
    const crc = crc32(a.datos);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, a.datos.length, true);
    local.setUint32(22, a.datos.length, true);
    local.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(local.buffer), nombre, a.datos);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.datos.length, true);
    c.setUint32(24, a.datos.length, true);
    c.setUint16(28, nombre.length, true);
    c.setUint32(42, offset, true);
    central.push(new Uint8Array(c.buffer), nombre);
    offset += 30 + nombre.length + a.datos.length;
  }
  const tamCentral = central.reduce((n, p) => n + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of todo) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const col = (i: number): string => String.fromCharCode(65 + i);

export function crearXlsx(hojas: Hoja[]): Uint8Array {
  const x = (s: string) =>
    enc.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const archivos = [
    {
      nombre: '[Content_Types].xml',
      datos: x(
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${hojas
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('')}</Types>`,
      ),
    },
    {
      nombre: '_rels/.rels',
      datos: x(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      nombre: 'xl/workbook.xml',
      datos: x(
        `<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
          .map(
            (h, i) =>
              `<sheet name="${esc(h.nombre.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join('')}</sheets></workbook>`,
      ),
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      datos: x(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('')}</Relationships>`,
      ),
    },
    ...hojas.map((h, i) => ({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      datos: x(
        `<worksheet xmlns="${NS}"><sheetData>${h.filas
          .map(
            (f, r) =>
              `<row r="${r + 1}">${f
                .map((c, k) =>
                  typeof c === 'number'
                    ? `<c r="${col(k)}${r + 1}"><v>${c}</v></c>`
                    : `<c r="${col(k)}${r + 1}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`,
                )
                .join('')}</row>`,
          )
          .join('')}</sheetData></worksheet>`,
      ),
    })),
  ];
  return zip(archivos);
}
