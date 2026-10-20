// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Pin list (C15, docs/TESTING.md): every file in this repository that is a copy of a file in an
// old repository. Data only (loaded without require). Two commands use it:
//   node tools/provenance.js check                      every pinned file's sha256 equals its pin
//                                                       (CI; no old repository needed)
//   node tools/provenance.js rederive --old-root <dir>  rebuilds every pinned file from
//                                                       `git cat-file blob <head>:<path>` and
//                                                       requires the same bytes
// A pinned file changes only through a declared edit here plus `rederive --write`, in one commit,
// and is never edited by hand.
//
// One entry per pinned file. A copy of a whole file:
//   {
//     path: "core/export.js",               the file in this repository ("/"-separated)
//     from: { repo, head, path, sha256 },   the old repository's folder name (the legacyRepo of
//                                           a providers/*/frozen.js), that frozen.js's
//                                           legacyHead, the file's path there, and the sha256 of
//                                           that blob
//     edits: [{ line, old, new }],          whole-line replacements in ascending line order:
//                                           line is 1-based in the blob, old is that line's exact
//                                           text and new replaces it (neither holds "\n");
//                                           [] for a verbatim copy
//     sha256: "<64 hex>",                   the sha256 of the file in this repository
//     sentinels: [{ line, contains }],      optional: text that must stay on that line of the
//                                           file, such as a literal "\uFEFF" (checked by
//                                           `check` and by the lint, each with its own message)
//   }
// Lines are the blob's bytes split at "\n", so a copy keeps every byte outside its edited lines,
// including a final newline or the lack of one. Edits never add or remove a line, so an edited
// line keeps its line number.
//
// A test-only module built around old lines (test/legacy/zip-old.js and storage-old.js) has
// `parts` in place of `from` and `edits`:
//     parts: [ "<line>", ..., { from: { repo, head, path, sha256 }, lines: [first, last],
//              edits: [{ line, old, new }] }, "<line>", ... ]
// A string is one literal line. An object stands for lines first..last (1-based, inclusive) of
// that blob, with its edits applied (line numbers are the blob's). The file is every line, each
// followed by "\n".
//
// To add a pin, append an entry whose sha256 is any 64 hex digits, run
//   node tools/provenance.js rederive --old-root <dir> --write --only <path>
// which writes the file from the blob and prints the sha256 it got, and record that sha256.
module.exports = [
  // ---- core (docs/ARCHITECTURE.md) ----
  {
    path: "core/export.js",
    from: { repo: "versa2csv", head: "75d4f12196e13bab22112ec18d050e7e38903e11", path: "src/export.js", sha256: "69c00a6da9b227eeacb4e901c0b8190098edbfe8df4b001eaeeeff4e2b305d6a" },
    edits: [
      { line: 3, old: "// Export layer, shared in spirit with stashaway2csv: month helpers, balance-only", new: "// Export layer: month helpers, balance-only" },
      { line: 78, old: "  // statement's own opening balance (StashAway's opening occasionally differs", new: "  // statement's own opening balance (a statement's opening occasionally differs" },
      { line: 203, old: "  // QIF (Quicken Interchange Format) for one account: an \"Opening Balance\" record", new: "  // QIF for one account: an \"Opening Balance\" record" },
      { line: 221, old: "           adjustedEntries, adjustedCsv, openingBalance, accountsCsv, combinedTradesCsv, combinedTransactionsCsv };", new: "           adjustedEntries, adjustedCsv, openingBalance, accountsCsv, combinedTradesCsv, combinedTransactionsCsv, csvCell, csv };" },
    ],
    sha256: "ac38e64a96e38161c6a8407b98b0a7c5a4d0ddd270761807ff38110f5b956731",
  },
  {
    path: "core/layout.js",
    from: { repo: "versa2csv", head: "75d4f12196e13bab22112ec18d050e7e38903e11", path: "src/layout.js", sha256: "8fabad66d4426a02a3c53d3670412ef5537eecc9ff347b6213cb9411d4622602" },
    edits: [],
    sha256: "8fabad66d4426a02a3c53d3670412ef5537eecc9ff347b6213cb9411d4622602",
  },
  {
    path: "core/xlsx.js",
    from: { repo: "etoro2csv", head: "add9f42ac11f196ecd01061bfd4dac1ab1d3e231", path: "src/xlsx.js", sha256: "e1560a53f680a3ca0e230cf5164d62a7ca824a509e40704f7f02408721eb6980" },
    edits: [],
    sha256: "e1560a53f680a3ca0e230cf5164d62a7ca824a509e40704f7f02408721eb6980",
  },

  // ---- vendor and licence ----
  {
    path: "vendor/pdf.min.js",
    from: { repo: "posb2csv", head: "93c1778d6ec29d436d426889e4f5a430c53bb05f", path: "vendor/pdf.min.js", sha256: "5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946" },
    edits: [],
    sha256: "5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946",
  },
  {
    path: "vendor/pdf.worker.min.js",
    from: { repo: "posb2csv", head: "93c1778d6ec29d436d426889e4f5a430c53bb05f", path: "vendor/pdf.worker.min.js", sha256: "feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b" },
    edits: [],
    sha256: "feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b",
  },
  {
    path: "LICENSE",
    from: { repo: "posb2csv", head: "93c1778d6ec29d436d426889e4f5a430c53bb05f", path: "LICENSE", sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30" },
    edits: [],
    sha256: "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30",
  },

  // ---- test/legacy: the oracles of test/unit/differential.test.js (never inlined) ----
  {
    path: "test/legacy/export-A.js",
    from: { repo: "maribank2csv", head: "bc79c6919cc9420e149b36fec3ad25e4bbafe2b7", path: "src/export.js", sha256: "4ac90f993fcf9232312f8e2d0dc50e644da924023d4025decf89bc9af0240c8d" },
    edits: [],
    sha256: "4ac90f993fcf9232312f8e2d0dc50e644da924023d4025decf89bc9af0240c8d",
  },
  {
    path: "test/legacy/export-B.js",
    from: { repo: "posb2csv", head: "93c1778d6ec29d436d426889e4f5a430c53bb05f", path: "src/export.js", sha256: "68f69ec93c66ebbd6b51b6b8327b276ea780ee412d5863d1939196c081c9f5d1" },
    edits: [],
    sha256: "68f69ec93c66ebbd6b51b6b8327b276ea780ee412d5863d1939196c081c9f5d1",
  },
  {
    path: "test/legacy/export-C.js",
    from: { repo: "versa2csv", head: "75d4f12196e13bab22112ec18d050e7e38903e11", path: "src/export.js", sha256: "69c00a6da9b227eeacb4e901c0b8190098edbfe8df4b001eaeeeff4e2b305d6a" },
    edits: [],
    sha256: "69c00a6da9b227eeacb4e901c0b8190098edbfe8df4b001eaeeeff4e2b305d6a",
  },
  {
    path: "test/legacy/layout-L1.js",
    from: { repo: "maribank2csv", head: "bc79c6919cc9420e149b36fec3ad25e4bbafe2b7", path: "src/layout.js", sha256: "f653e7fee46bb7bbce169eabc6e885c168d4a6a206fa43e345af0107177a6fa6" },
    edits: [],
    sha256: "f653e7fee46bb7bbce169eabc6e885c168d4a6a206fa43e345af0107177a6fa6",
  },
  {
    path: "test/legacy/layout-L3.js",
    from: { repo: "versa2csv", head: "75d4f12196e13bab22112ec18d050e7e38903e11", path: "src/layout.js", sha256: "8fabad66d4426a02a3c53d3670412ef5537eecc9ff347b6213cb9411d4622602" },
    edits: [],
    sha256: "8fabad66d4426a02a3c53d3670412ef5537eecc9ff347b6213cb9411d4622602",
  },
  {
    path: "test/legacy/zip-old.js",
    parts: [
      "// SPDX-License-Identifier: Apache-2.0",
      "// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>",
      "//",
      "// Frozen copy of the old pages' ZIP writer as a module: versa2csv src/app.js:391-418 at its",
      "// legacyHead (the same lines in all eight old apps). It is the oracle core/zip.js is compared",
      "// with in test/unit/differential.test.js, and is never inlined into a page. The old lines are",
      "// verbatim apart from one edit, on two lines: `now` is a parameter instead of the current time,",
      "// so a test can fix it. Pinned and re-derived from git (test/contract/provenance.js).",
      "\"use strict\";",
      "",
      "module.exports = (function () {",
      {
        from: { repo: "versa2csv", head: "75d4f12196e13bab22112ec18d050e7e38903e11", path: "src/app.js", sha256: "7fcbfc2cc16e31dff6eb2d6376532b667b523bc0ff1358981926fca7c9dd8e38" },
        lines: [391, 418],
        edits: [
          { line: 394, old: "  function zip(files) {", new: "  function zip(files, now) {" },
          { line: 398, old: "    const now = new Date();", new: "    // now: the caller's Date (the page used the current time here)" },
        ],
      },
      "  return { CRC, crc32, zip };",
      "})();",
    ],
    sha256: "342eaa6e0e8671212f243c2ac5051a556bd9573025881ce5ca719f8116df6443",
  },
  {
    path: "test/legacy/storage-old.js",
    parts: [
      "// SPDX-License-Identifier: Apache-2.0",
      "// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>",
      "//",
      "// Frozen copies of the old pages' storage functions, the oracles core/storage.js is compared",
      "// with in test/unit/differential.test.js (never inlined into a page):",
      "//   - statementApp: src/app.js:24-36 of the seven statement apps (the same lines in all seven;",
      "//     copied from versa2csv at its legacyHead): loadConfig, saveConfig, loadMode and the",
      "//     storage line of setMode;",
      "//   - customApp: etoro2csv src/app.js:14-19 at its legacyHead: loadMode and the storage line",
      "//     of setMode.",
      "// The old lines are verbatim. Each block runs inside a function whose parameters stand for the",
      "// page's key constants and its localStorage, so a test passes the keys and a fake storage;",
      "// `state` stands for the page's state object (saveConfig writes state.config). Pinned and",
      "// re-derived from git (test/contract/provenance.js).",
      "\"use strict\";",
      "",
      "// statementApp(MODE_KEY, CONFIG_KEY, localStorage) -> { loadConfig, saveConfig, loadMode, setMode, state }",
      "function statementApp(MODE_KEY, CONFIG_KEY, localStorage) {",
      "  const state = { config: {}, mode: null };",
      {
        from: { repo: "versa2csv", head: "75d4f12196e13bab22112ec18d050e7e38903e11", path: "src/app.js", sha256: "7fcbfc2cc16e31dff6eb2d6376532b667b523bc0ff1358981926fca7c9dd8e38" },
        lines: [24, 36],
        edits: [],
      },
      "  }",
      "  return { loadConfig, saveConfig, loadMode, setMode, state };",
      "}",
      "",
      "// customApp(MODE_KEY, localStorage) -> { loadMode, setMode, state }",
      "function customApp(MODE_KEY, localStorage) {",
      "  const state = { mode: null };",
      {
        from: { repo: "etoro2csv", head: "add9f42ac11f196ecd01061bfd4dac1ab1d3e231", path: "src/app.js", sha256: "dadf84a19547bb08b943e43b46e842b46a151085a86562b5812f3bec0a4a0447" },
        lines: [14, 19],
        edits: [],
      },
      "  }",
      "  return { loadMode, setMode, state };",
      "}",
      "",
      "module.exports = { statementApp, customApp };",
    ],
    sha256: "01ca7fb50cd115d79b66a856a29fdfcdee0689b47242aa249b08be49949327f2",
  },

  // ---- providers: parser and layout copies (edits: the Node branch's require line, or one comment) ----
  {
    path: "providers/stashaway/parser.js",
    from: { repo: "stashaway2csv", head: "ed1879d267bdcd53cba5432b00b7d76ed6b1b76d", path: "src/parser.js", sha256: "0753034aa4c4d7c0f06d0088d7b044536658fe92af710af0a9067852863ac4b7" },
    edits: [
      { line: 579, old: "  // QIF (Quicken Interchange Format) for one account: an \"Opening Balance\" record", new: "  // QIF for one account: an \"Opening Balance\" record" },
    ],
    sha256: "3a7c85ee767589bbf54f287bf4b4785c9f86058ffcf1d1b3f7579c115e5cbf92",
  },
  {
    path: "providers/maribank/parser.js",
    from: { repo: "maribank2csv", head: "bc79c6919cc9420e149b36fec3ad25e4bbafe2b7", path: "src/parser.js", sha256: "035e01c4e24ab4e062b638ded957d11d088e118c4f4cc44cf0451980585f028d" },
    edits: [
      { line: 7, old: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"./layout.js\"), require(\"./export.js\"));", new: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"./layout.js\"), require(\"../../core/export.js\"));" },
    ],
    sha256: "b1bef05cd7ccdf9777a0adfceed640968eae5a46c4b82c6565a01ae9177341c4",
  },
  {
    path: "providers/maribank/layout.js",
    from: { repo: "maribank2csv", head: "bc79c6919cc9420e149b36fec3ad25e4bbafe2b7", path: "src/layout.js", sha256: "f653e7fee46bb7bbce169eabc6e885c168d4a6a206fa43e345af0107177a6fa6" },
    edits: [],
    sha256: "f653e7fee46bb7bbce169eabc6e885c168d4a6a206fa43e345af0107177a6fa6",
  },
  {
    path: "providers/chocolate/parser.js",
    from: { repo: "chocolate2csv", head: "eff3c0d7c60aa8410a5216ddd6bdc6c3846b6241", path: "src/parser.js", sha256: "d5fbca02750185b193b1e275c0b33cb10f2228c7553b8a4c409184907efb25de" },
    edits: [
      { line: 10, old: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"./layout.js\"), require(\"./export.js\"));", new: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"./layout.js\"), require(\"../../core/export.js\"));" },
    ],
    sha256: "e3d04c72ad13c82367477ae4b71026d39408dec7d1ca28b87f77415707921a89",
  },
  {
    path: "providers/chocolate/layout.js",
    from: { repo: "chocolate2csv", head: "eff3c0d7c60aa8410a5216ddd6bdc6c3846b6241", path: "src/layout.js", sha256: "5363850d4d01eae366e78ada505ce46da98707796eedc3eefce074b46eeec0e6" },
    edits: [],
    sha256: "5363850d4d01eae366e78ada505ce46da98707796eedc3eefce074b46eeec0e6",
  },
  {
    path: "providers/moomoo/parser.js",
    from: { repo: "moomoo2csv", head: "7bd9b9d794643dbfbd9e84bf26a32b71ca5661ef", path: "src/parser.js", sha256: "ad6559330558e8d01064c8249dd246bf7b342ee811dfcad911763beb69434373" },
    edits: [
      { line: 9, old: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"./layout.js\"), require(\"./export.js\"));", new: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"../../core/layout.js\"), require(\"../../core/export.js\"));" },
    ],
    sha256: "d08ea27054e7a35cb97cc519e33cb4bf3662117205c24ab4d5abc51ebbcc39f2",
  },
  {
    path: "providers/posb/parser.js",
    from: { repo: "posb2csv", head: "93c1778d6ec29d436d426889e4f5a430c53bb05f", path: "src/parser.js", sha256: "af6853febc881bdfc83b1157e5feec00e9827dea41306d652fe699d83d22738d" },
    edits: [
      { line: 11, old: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"./layout.js\"), require(\"./export.js\"));", new: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"../../core/layout.js\"), require(\"../../core/export.js\"));" },
    ],
    sha256: "e5c06148e222debf93adce17423d0a95b718b0354c96161c66d6aa39bf7808e5",
    sentinels: [{ line: 243, contains: "\uFEFF" }],
  },
  {
    path: "providers/maybank/parser.js",
    from: { repo: "maybank2csv", head: "27f42f7bcfef9cf4f8823458c73902d4d4831de7", path: "src/parser.js", sha256: "99064079cafd8c3954dd786de0884f9fda00f96c37ac22506d571fa3feb690aa" },
    edits: [
      { line: 10, old: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"./layout.js\"), require(\"./export.js\"));", new: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"../../core/layout.js\"), require(\"../../core/export.js\"));" },
    ],
    sha256: "1b564d4b50ada910acc90f0b3e1d95710acf873499fde7e78d8f36e8fe8e3f76",
  },
  {
    path: "providers/versa/parser.js",
    from: { repo: "versa2csv", head: "75d4f12196e13bab22112ec18d050e7e38903e11", path: "src/parser.js", sha256: "5a11c7e992a89163486aa48c666aa8f426e1b85270d6063c83a338aeeeafecad" },
    edits: [
      { line: 13, old: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"./layout.js\"), require(\"./export.js\"));", new: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"../../core/layout.js\"), require(\"../../core/export.js\"));" },
    ],
    sha256: "8225696ea9ad70b3b721e4aff32ce3c74a90bacae7a874148208927aed99e606",
  },
  {
    path: "providers/etoro/parser.js",
    from: { repo: "etoro2csv", head: "add9f42ac11f196ecd01061bfd4dac1ab1d3e231", path: "src/parser.js", sha256: "3d42411420621a9fff9bfbfbab90fe244691211372024456ad09f0160942351a" },
    edits: [
      { line: 11, old: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"./export.js\"));", new: "  if (typeof module === \"object\" && module.exports) module.exports = factory(require(\"../../core/export.js\"));" },
    ],
    sha256: "5d5291ea8563994938bffea93558faaf3059a71c7b8965e35f2ac987b69acff6",
  },
];
