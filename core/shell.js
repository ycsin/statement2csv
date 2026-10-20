// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Page helpers shared by every app (docs/ARCHITECTURE.md, core/shell.js). Works in the browser
// (self.StatementShell) and in Node (module.exports); every function looks up document, URL
// and the elements when it is called, never while the file is evaluated.
//
//   $(sel)            document.querySelector(sel)
//   setBusy(msg)      #busy text, hidden when there is no message
//   fmtInt(n), fmtMoney(n), monthLabel("YYYY-MM")   UI formatting in the browser's locale
//   download(name, blob)   the anchor + object-URL sequence; the URL is revoked after 1 s
//   wireInput({onFiles, onMode, onRange, onClear})  the input listeners, registered in the old
//                     pages' order: #drop click and keydown; #picker change; document dragenter,
//                     dragover, dragleave, drop, then the drop that loads the files; #mode
//                     click; #from and #to change; #clear click. onFiles gets the FileList
//                     itself, onMode the clicked button's mode, onRange the change event (as the
//                     old render did), onClear nothing.
//
// Moved verbatim from the reference app (the derivation map in docs/MIGRATION.md names it;
// every old page has the same lines): $ app.js:7, monthLabel :105, download :356-363, the
// input block :420-431 (render -> onRange, setMode -> onMode, addFiles -> onFiles, the #clear
// body -> onClear), setBusy :434, fmtInt and fmtMoney :436-437.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StatementShell = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });

  // ---------- downloads ----------
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- input ----------
  function wireInput({ onFiles, onMode, onRange, onClear }) {
    const drop = $("#drop"), picker = $("#picker");
    drop.addEventListener("click", () => picker.click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); picker.click(); } });
    picker.addEventListener("change", () => { onFiles(picker.files); picker.value = ""; });
    for (const ev of ["dragenter", "dragover"]) document.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
    for (const ev of ["dragleave", "drop"]) document.addEventListener(ev, (e) => { e.preventDefault(); if (ev === "drop" || e.target === document.documentElement) drop.classList.remove("over"); });
    document.addEventListener("drop", (e) => onFiles(e.dataTransfer.files));
    $("#mode").addEventListener("click", (e) => { const b = e.target.closest("button[data-mode]"); if (b) onMode(b.dataset.mode); });
    $("#from").addEventListener("change", onRange);
    $("#to").addEventListener("change", onRange);
    $("#clear").addEventListener("click", () => { onClear(); });
  }

  // ---------- helpers ----------
  function setBusy(msg) { $("#busy").textContent = msg || ""; $("#busy").hidden = !msg; }
  const fmtInt = (n) => n.toLocaleString();
  const fmtMoney = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return { $, setBusy, fmtInt, fmtMoney, monthLabel, download, wireInput };
});
