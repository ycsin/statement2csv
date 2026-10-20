// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// XLSX reader (docs/ARCHITECTURE.md, readers): core/xlsx.js with the browser's raw-deflate
// decompressor. Works in the browser (self.StatementXlsx, after self.Xlsx) and in Node
// (module.exports; Node has DecompressionStream too).
//
//   accept         the picker's accept tokens for XLSX
//   accepts(f)     the file is XLSX by name or MIME type
//   inflateRaw(d)  raw deflate through DecompressionStream("deflate-raw")
//   read(f)        -> {id: f.name, workbook: {[sheetName]: rows}}; errors propagate unchanged
//
// inflateRaw and the Xlsx.read call are moved verbatim from the workbook app (app.js:28-32,
// :39; the derivation map in docs/MIGRATION.md names it), error texts included.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../xlsx.js"));
  else root.StatementXlsx = factory(root.Xlsx);
})(typeof self !== "undefined" ? self : this, function (Xlsx) {
  "use strict";

  const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const accept = `.xlsx,${MIME}`;
  const accepts = (f) => /\.xlsx$/i.test(f.name) || f.type === MIME;

  async function inflateRaw(data) {
    if (typeof DecompressionStream === "undefined") throw new Error("this browser can't decompress .xlsx files (no DecompressionStream); try a current Chrome, Edge, Firefox or Safari");
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function read(file) {
    return { id: file.name, workbook: await Xlsx.read(new Uint8Array(await file.arrayBuffer()), inflateRaw) };
  }

  return { accept, accepts, inflateRaw, read };
});
