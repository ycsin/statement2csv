// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Synthetic PDF writer for fixtures: Helvetica text runs at given positions, nothing else.
// renderPdf(pages) -> Buffer, where pages = [[{x, y, text, size?}, ...], ...] (one array per
// page, A4, size defaults to 10). Each run is its own BT/ET block with a fresh text matrix, so
// pdf.js reports it as one item with transform [size, 0, 0, size, x, y]. Text is written in
// WinAnsiEncoding; a character outside it throws. The output is deterministic and ASCII-only.
"use strict";

const ITEM_KEYS = new Set(["x", "y", "text", "size"]);
const PAGE_BOX = "[0 0 595 842]";
const DEFAULT_SIZE = 10;

// WinAnsiEncoding (CP1252) codes 0x80-0x9F; 0x20-0x7E and 0xA0-0xFF equal their code points.
const WIN_ANSI_HIGH = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
  [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91],
  [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98],
  [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function winAnsi(cp) {
  if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) return cp;
  return WIN_ANSI_HIGH.has(cp) ? WIN_ANSI_HIGH.get(cp) : -1;
}

// A PDF literal string; parentheses and backslashes escaped, bytes above 0x7E as octal.
function pdfString(text) {
  let s = "(";
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    const code = winAnsi(cp);
    if (code < 0) throw new Error(`minipdf: U+${cp.toString(16).toUpperCase().padStart(4, "0")} cannot be written in WinAnsiEncoding`);
    if (code === 0x28 || code === 0x29 || code === 0x5c) s += `\\${String.fromCharCode(code)}`;
    else if (code <= 0x7e) s += String.fromCharCode(code);
    else s += `\\${code.toString(8).padStart(3, "0")}`;
  }
  return `${s})`;
}

// A number as PDF writes it: at most 3 decimals, never an exponent.
function num(n, what) {
  if (typeof n !== "number" || !Number.isFinite(n)) throw new TypeError(`minipdf: ${what} must be a finite number`);
  const s = String(Math.round(n * 1000) / 1000);
  if (/e/i.test(s)) throw new RangeError(`minipdf: ${what} ${n} is out of range`);
  return s === "-0" ? "0" : s;
}

function contentStream(items, pageIndex) {
  if (!Array.isArray(items)) throw new TypeError(`minipdf: page ${pageIndex} must be an array of text runs`);
  return items.map((it, i) => {
    const where = `page ${pageIndex} run ${i}`;
    if (!it || typeof it !== "object" || Array.isArray(it)) throw new TypeError(`minipdf: ${where} must be an object`);
    for (const k of Object.keys(it)) if (!ITEM_KEYS.has(k)) throw new TypeError(`minipdf: ${where} has unknown key "${k}"`);
    if (typeof it.text !== "string") throw new TypeError(`minipdf: ${where} needs a text string`);
    const size = it.size === undefined ? DEFAULT_SIZE : it.size;
    if (!(typeof size === "number" && size > 0)) throw new TypeError(`minipdf: ${where} size must be a positive number`);
    return `BT /F1 ${num(size, `${where} size`)} Tf 1 0 0 1 ${num(it.x, `${where} x`)} ${num(it.y, `${where} y`)} Tm ${pdfString(it.text)} Tj ET`;
  }).join("\n");
}

function renderPdf(pages) {
  if (!Array.isArray(pages) || !pages.length) throw new TypeError("minipdf: pages must be a non-empty array");
  // Objects: 1 catalog, 2 page tree, 3 font, then per page i: 4 + 2i page, 5 + 2i contents.
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + 2 * i} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  pages.forEach((items, i) => {
    const data = contentStream(items, i);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox ${PAGE_BOX} /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`);
    objects.push(`<< /Length ${data.length} >>\nstream\n${data}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, k) => {
    const at = out.length;
    out += `${k + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) out += `${String(at).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

module.exports = { renderPdf };
