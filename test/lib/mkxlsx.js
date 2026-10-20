// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Synthetic .xlsx writer for fixtures. renderXlsx(sheets) -> Buffer, where sheets is exactly
// the workbook object a statement carries: {[sheetName]: (string|number|boolean|null)[][]}.
// Strings become inline strings, numbers stay numbers (-0 included), booleans become t="b"
// cells and null an empty cell, so the reader gives back the identical object. Entries are
// stored (or, with {deflate: true}, raw-deflated with zlib, to exercise a reader's inflate
// path). The ZIP container and its CRC-32 are written here, independently of the zip code
// under test. Output is deterministic (every entry is dated 1980-01-01 00:00).
// {entryBytes(name, stored) -> Buffer} (tests of damaged workbooks): the bytes written as an
// entry's data in place of `stored`, the bytes it would have; the compressed size follows the
// returned bytes, while the method, CRC-32 and uncompressed size stay those of the entry.
"use strict";

const zlib = require("zlib");

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// Characters XML 1.0 cannot carry, even as references.
const XML_INVALID = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

function xmlText(s, where) {
  if (XML_INVALID.test(s)) throw new Error(`mkxlsx: ${where} has a character XML cannot hold`);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#13;");
}

function xmlAttr(s, where) {
  return xmlText(s, where).replace(/"/g, "&quot;").replace(/\n/g, "&#10;").replace(/\t/g, "&#9;");
}

function columnName(index) {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellXml(value, ref, where) {
  if (value === null) return `<c r="${ref}"/>`;
  if (typeof value === "string") return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value, where)}</t></is></c>`;
  if (typeof value === "boolean") return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`mkxlsx: ${where} is not a finite number`);
    return `<c r="${ref}"><v>${Object.is(value, -0) ? "-0" : String(value)}</v></c>`;
  }
  throw new TypeError(`mkxlsx: ${where} must be a string, number, boolean or null`);
}

function sheetXml(name, rows) {
  if (!Array.isArray(rows)) throw new TypeError(`mkxlsx: sheet "${name}" must be an array of rows`);
  const body = rows.map((row, r) => {
    if (!Array.isArray(row)) throw new TypeError(`mkxlsx: sheet "${name}" row ${r} must be an array`);
    if (!row.length) return `<row r="${r + 1}"/>`;
    const cells = [];
    for (let c = 0; c < row.length; c++) {
      if (!(c in row) || row[c] === undefined) throw new TypeError(`mkxlsx: sheet "${name}" row ${r} has no value at column ${c}`);
      cells.push(cellXml(row[c], `${columnName(c)}${r + 1}`, `sheet "${name}" cell ${columnName(c)}${r + 1}`));
    }
    return `<row r="${r + 1}">${cells.join("")}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${body ? `<sheetData>${body}</sheetData>` : "<sheetData/>"}</worksheet>`;
}

function parts(sheets) {
  if (!sheets || typeof sheets !== "object" || Array.isArray(sheets)) throw new TypeError("mkxlsx: sheets must be an object of sheet name -> rows");
  const names = Object.keys(sheets);
  if (!names.length) throw new TypeError("mkxlsx: a workbook needs at least one sheet");
  const ns = "http://schemas.openxmlformats.org";
  const sheetList = names.map((n, i) => `<sheet name="${xmlAttr(n, `sheet name "${n}"`)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  const rels = names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("");
  const overrides = names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const head = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
  return [
    ["[Content_Types].xml", `${head}<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`],
    ["_rels/.rels", `${head}<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `${head}<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets>${sheetList}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `${head}<Relationships xmlns="${ns}/package/2006/relationships">${rels}</Relationships>`],
    ...names.map((n, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(n, sheets[n])]),
  ];
}

// A ZIP of [name, text] pairs: local headers and data in order, then the central directory.
function zipParts(files, deflate, entryBytes = null) {
  const DOS_TIME = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    let stored = deflate ? zlib.deflateRawSync(data) : data;
    if (entryBytes) {
      stored = entryBytes(name, stored);
      if (!Buffer.isBuffer(stored)) throw new TypeError(`mkxlsx: entryBytes must return a Buffer for ${name}`);
    }
    const method = deflate ? 8 : 0;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(DOS_TIME, 12);
    cen.writeUInt16LE(DOS_DATE, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(stored.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    chunks.push(local, nameBuf, stored);
    central.push(cen, nameBuf);
    offset += 30 + nameBuf.length + stored.length;
  }
  const cdSize = central.reduce((s, b) => s + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

function renderXlsx(sheets, { deflate = false, entryBytes = null } = {}) {
  if (entryBytes !== null && typeof entryBytes !== "function") throw new TypeError("mkxlsx: entryBytes must be a function");
  return zipParts(parts(sheets), deflate, entryBytes);
}

module.exports = { renderXlsx, crc32 };
