// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Positioned-text layout for statement PDFs: lines from pdf.js text
// fragments, and table rows from the vertical gaps between lines (cells are
// multi-line and vertically centred, so plain text order isn't enough).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StatementLayout = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // items: [{ str, x, y, w, h }] for one page (pdf.js coordinates, y grows upwards).
  // Returns lines top to bottom: { y, h, text, items: [{ s, x, w }] sorted by x }.
  function pageLines(items) {
    const frags = items
      .map((it) => ({ s: (it.str || "").replace(/[\u0000-\u001f\u007f]/g, "").trim(), x: it.x, y: it.y, w: it.w, h: Math.max(it.h, 1) }))
      .filter((f) => f.s);
    // Some PDFs draw text twice, offset by a fraction of a point (fake bold);
    // keep one copy of identical text within 1pt.
    const unique = [];
    for (const f of frags) {
      if (unique.some((u) => u.s === f.s && Math.abs(u.x - f.x) < 1 && Math.abs(u.y - f.y) < 0.5)) continue;
      unique.push(f);
    }
    frags.length = 0;
    frags.push(...unique);
    frags.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const f of frags) {
      const line = lines.find((l) => Math.abs(l.y - f.y) <= Math.min(l.h, f.h) * 0.4);
      if (line) line.items.push(f);
      else lines.push({ y: f.y, h: f.h, items: [f] });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      // Merge fragments that touch (one word split by the PDF) into one cell.
      const merged = [];
      for (const it of l.items) {
        const prev = merged[merged.length - 1];
        if (prev && it.x - (prev.x + prev.w) < l.h * 0.6) { prev.s += (it.x - (prev.x + prev.w) > l.h * 0.15 ? " " : "") + it.s; prev.w = it.x + it.w - prev.x; }
        else merged.push({ s: it.s, x: it.x, w: it.w });
      }
      l.items = merged;
      l.text = merged.map((m) => m.s).join("  ");
    }
    return lines;
  }

  // Split the lines between a header line and the end of a table into rows: a
  // gap larger than rowGap (in units of line height) starts a new row.
  function tableRows(lines, start, end, rowGap = 1.9) {
    const rows = [];
    let row = null;
    for (let i = start; i < end; i++) {
      const l = lines[i];
      const prev = lines[i - 1];
      if (!row || (prev && prev.y - l.y > rowGap * Math.max(l.h, prev.h))) rows.push((row = []));
      row.push(l);
    }
    return rows;
  }

  return { pageLines, tableRows };
});
