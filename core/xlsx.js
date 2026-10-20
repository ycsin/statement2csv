// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Minimal .xlsx reader: zip central directory + raw-deflate (supplied by the
// caller: DecompressionStream in the browser, zlib in Node), shared strings and
// worksheet cells. Returns { sheetName: [[cell, ...], ...] } with numbers as
// numbers and everything else as strings. Styles, formulas and dates are not
// interpreted (date cells stay Excel serial numbers).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Xlsx = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

  // name -> { method, offset, size } from the zip central directory.
  function zipEntries(b) {
    let eocd = -1;
    for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error("not a zip file (no end of central directory)");
    const count = u16(b, eocd + 10);
    let p = u32(b, eocd + 16);
    const out = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (u32(b, p) !== 0x02014b50) throw new Error("bad zip central directory");
      const method = u16(b, p + 10), size = u32(b, p + 20), nameLen = u16(b, p + 28), extra = u16(b, p + 30), comment = u16(b, p + 32);
      const local = u32(b, p + 42);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
      out[name] = { method, local, size };
      p += 46 + nameLen + extra + comment;
    }
    return out;
  }

  async function readEntry(b, e, inflateRaw) {
    if (u32(b, e.local) !== 0x04034b50) throw new Error("bad zip local header");
    const start = e.local + 30 + u16(b, e.local + 26) + u16(b, e.local + 28);
    const data = b.subarray(start, start + e.size);
    if (e.method === 0) return data;
    if (e.method === 8) return inflateRaw(data);
    throw new Error(`unsupported zip compression method ${e.method}`);
  }

  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  const unescape = (s) => s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e]);
  // Text of all <t> elements inside a fragment (rich text runs are concatenated).
  // Tags may carry a namespace prefix (<x:row>), so every pattern allows one.
  const texts = (xml) => { let s = ""; const re = /<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g; let m; while ((m = re.exec(xml))) s += m[1]; return unescape(s); };
  const colIndex = (ref) => { let n = 0; for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + c - 64; } return n - 1; };

  function parseSheet(xml, strings) {
    const rows = [];
    const rowRe = /<(?:\w+:)?row\b[^>]*?(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
    const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
    let r;
    while ((r = rowRe.exec(xml))) {
      const row = [];
      if (r[1]) {
        let c, next = 0;
        cellRe.lastIndex = 0;
        while ((c = cellRe.exec(r[1]))) {
          const attrs = c[1], body = c[2] || "";
          const ref = (attrs.match(/\br="([A-Z]+)\d+"/) || [])[1];
          const col = ref ? colIndex(ref) : next;
          next = col + 1;
          const t = (attrs.match(/\bt="(\w+)"/) || [])[1];
          const v = (body.match(/<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/) || [])[1];
          let val = null;
          if (t === "s") val = v != null ? strings[+v] : null;
          else if (t === "inlineStr") val = texts(body);
          else if (t === "str" || t === "e") val = v != null ? unescape(v) : null;
          else if (t === "b") val = v === "1";
          else if (v != null) { const n = Number(v); val = Number.isFinite(n) ? n : unescape(v); }
          row[col] = val;
        }
      }
      for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
      rows.push(row);
    }
    return rows;
  }

  // bytes: Uint8Array of the .xlsx; inflateRaw: async (Uint8Array) => Uint8Array.
  async function read(bytes, inflateRaw) {
    const entries = zipEntries(bytes);
    const dec = new TextDecoder();
    const text = async (name) => (entries[name] ? dec.decode(await readEntry(bytes, entries[name], inflateRaw)) : null);
    const ss = await text("xl/sharedStrings.xml");
    const strings = [];
    if (ss) { const re = /<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g; let m; while ((m = re.exec(ss))) strings.push(texts(m[1])); }
    const wb = await text("xl/workbook.xml");
    const rels = await text("xl/_rels/workbook.xml.rels");
    if (!wb || !rels) throw new Error("not an Excel workbook");
    const target = {};
    for (const m of rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
      const id = (m[1].match(/\bId="([^"]+)"/) || [])[1], t = (m[1].match(/\bTarget="([^"]+)"/) || [])[1];
      if (id && t) target[id] = t.replace(/^\//, "").replace(/^(?!xl\/)/, "xl/");
    }
    const sheets = {};
    for (const m of wb.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)) {
      const name = unescape((m[1].match(/\bname="([^"]*)"/) || [])[1] || "");
      const rid = (m[1].match(/\br:id="([^"]+)"/) || [])[1];
      const xml = rid && target[rid] ? await text(target[rid]) : null;
      if (xml) sheets[name] = parseSheet(xml, strings);
    }
    return sheets;
  }

  return { read };
});
