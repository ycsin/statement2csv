// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// CSV reader (docs/ARCHITECTURE.md, readers). Works in the browser (self.StatementCsv) and in
// Node (module.exports).
//
//   accept       the picker's accept tokens for CSV
//   accepts(f)   the file is CSV by MIME type or name
//   read(f)      -> {id: f.name, csv}: the text decoded as UTF-8 by f.text(), which strips one
//                leading byte order mark, keeps CRLF and replaces invalid bytes with U+FFFD.
//                In Node, new Blob([bytes]).text() decodes exactly the same way.
//
// Moved verbatim from the PDF + CSV app's isCsv and its CSV branch of readStatement (app.js:49,
// :51; the derivation map in docs/MIGRATION.md names it).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StatementCsv = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const accept = "text/csv,.csv";
  const accepts = (f) => f.type === "text/csv" || /\.csv$/i.test(f.name);

  async function read(file) {
    return { id: file.name, csv: await file.text() };
  }

  return { accept, accepts, read };
});
