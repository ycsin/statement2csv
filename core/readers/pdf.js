// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// PDF reader (docs/ARCHITECTURE.md, readers) on the page's pdf.js (the global pdfjsLib, looked
// up when a function runs). Works in the browser (self.StatementPdf) and in Node
// (module.exports, with a pdfjsLib supplied by the caller).
//
//   accept       the picker's accept tokens for PDF
//   accepts(f)   the file is PDF by MIME type or name
//   init()       points pdf.js at a worker made from the page's #pdf-worker-src text, if present
//   read(f, transform = null) -> {id: f.name, pages}: per page, in pdf.js order, the items
//                {str, x, y, w, h}; with a transform, each page is transform(items) instead.
//                Errors propagate unchanged.
//
// Moved verbatim from the reference app (the derivation map in docs/MIGRATION.md names it):
// init is app.js:9-13, read is :49-63, where the one change is the transform hook on the page
// push (:57), which the transform-applying app had as a parser call (its app.js:55).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StatementPdf = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const accept = "application/pdf,.pdf";
  const accepts = (f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

  // pdf.js worker: the worker source is embedded in the page, so it works from file://.
  function init() {
    const workerSrc = document.getElementById("pdf-worker-src");
    if (workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerSrc.textContent], { type: "text/javascript" }));
    }
  }

  async function read(file, transform = null) {
    // isEvalSupported: false closes CVE-2024-4367 (code execution from a crafted
    // font in pdf.js < 4.2.67); the page's CSP also forbids eval. Text extraction
    // doesn't need it.
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      const items = content.items.map((it) => ({
        str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || Math.abs(it.transform[3]),
      }));
      pages.push(transform ? transform(items) : items);
    }
    await doc.destroy();
    return { id: file.name, pages };
  }

  return { accept, accepts, init, read };
});
