// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Throwaway trees for the build and loader unit tests: this repository's core/page files,
// stub core modules (tiny UMD files that set the documented globals) and synthetic stub
// providers. Lets the build be tested without the real core modules. Synthetic data only;
// everything is written under the OS temp directory and removed by cleanup().
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const SPDX = "// SPDX-License-Identifier: Apache-2.0\n// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>\n";
const HTML_SPDX = "<!-- SPDX-License-Identifier: Apache-2.0 -->\n<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->\n";
const BOM = String.fromCharCode(0xfeff);

// Text that must reach the page byte for byte: replacement patterns, a token look-alike and
// a mid-file U+FEFF (as in one of the pinned parsers).
const TRICKY = `// survive: $& $1 $$ $' $\` {{csp}} {{> help-qif-short}} [${BOM}]\n`;

const umd = (global, deps, body) => `${SPDX}(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(${deps.map((d) => `require(${JSON.stringify(d.path)})`).join(", ")});
  else root.${global} = factory(${deps.map((d) => `root.${d.global}`).join(", ")});
})(typeof self !== "undefined" ? self : this, function (${deps.map((d, i) => `d${i}`).join(", ")}) {
  "use strict";
${body}
});
`;

// A minimal core export: CSV writers with the real headers, and inRange.
const EXPORT_BODY = `  const csv = (header, rows) => [header, ...rows].map((r) => r.join(",")).join("\\n") + "\\n";
  const inRange = (date, from, to) => (!from || date.slice(0, 7) >= from) && (!to || date.slice(0, 7) <= to);
  return {
    csv, inRange,
    qif: () => "!Type:Bank\\n",
    adjustedCsv: () => csv(["date", "amount", "currency", "name", "notes"], []),
    transactionsCsv: (cash) => csv(["date", "amount", "currency", "name", "notes"], cash.map((c) => [c.date, (-c.amount).toFixed(2), c.currency, c.name, c.notes || ""])),
    tradesCsv: () => csv(["date", "ticker", "qty", "price", "currency", "name"], []),
    valuationsCsv: () => csv(["date", "balance", "currency"], []),
    accountsCsv: () => csv(["Account type", "Name", "Balance", "Currency", "Balance Date"], []),
    combinedTransactionsCsv: () => csv(["account", "date", "amount", "currency", "name", "notes"], []),
    combinedTradesCsv: () => csv(["account", "date", "ticker", "qty", "price", "currency", "name"], []),
    openingBalance: () => null,
  };`;

// Stub StatementFiles: one card record per account, with the transactions file.
const FILES_BODY = `  return {
    create(ctx) {
      return {
        downloads() {
          const r = ctx.result();
          if (!r) return [];
          const { from, to } = ctx.range();
          return Object.keys(r.accounts).map((name) => ({ trigger: "card", account: name, kind: "transactions",
            name: name + " - transactions - " + from + "_to_" + to + ".csv", type: "text/csv",
            text: ctx.P.transactionsCsv(r.accounts[name].cash, from, to), mode: ctx.mode() }));
        },
      };
    },
  };`;

const CORE = {
  "core/escape.js": umd("StatementEscape", [], "  return { esc: (s) => String(s) };"),
  "core/shell.js": umd("StatementShell", [], "  return { $: (s) => s };"),
  "core/zip.js": umd("StatementZip", [], "  return { zipParts: (files) => files };"),
  "core/storage.js": umd("StatementStorage", [], "  return { loadMode: (k, ids) => ids[0] };"),
  "core/readers/csv.js": umd("StatementCsv", [], "  return { accept: \"text/csv,.csv\" };"),
  "core/readers/xlsx.js": umd("StatementXlsx", [], "  return { accept: \".xlsx\" };"),
  "core/readers/pdf.js": umd("StatementPdf", [], "  // pdfjsLib.getDocument({ data, isEvalSupported: false })\n  return { accept: \"application/pdf,.pdf\" };"),
  "core/xlsx.js": umd("Xlsx", [], "  return { read: () => ({}) };"),
  "core/layout.js": umd("StatementLayout", [], "  return { pageLines: () => [] };"),
  "core/assemble.js": umd("StatementAssemble", [], "  return { build: (x) => x };"),
  "core/export.js": umd("StatementExport", [], EXPORT_BODY),
  "core/files.js": umd("StatementFiles", [], FILES_BODY),
  "core/app/statement-app.js": `${SPDX}(function () {\n  "use strict";\n  // stub app: reads self.StatementProvider\n  void self.StatementProvider;\n})();\n`,
  "vendor/pdf.min.js": `${SPDX}${TRICKY}self.pdfjsLib = { GlobalWorkerOptions: {} };\n`,
  "vendor/pdf.worker.min.js": `${SPDX}// stub worker, never executed\n`,
};

const RESULT = `{
      accounts: { "Stub Savings": { kind: "bank", currency: "SGD", months: { "2026-01": { monthEnd: "2026-01-31", opening: 0, closing: 10, fx: null } },
        valuations: [["2026-01-31", 10]], trades: [], cash: [{ date: "2026-01-05", amount: -10, currency: "SGD", name: "Deposit", kind: "bank" }] } },
      months: [{ month: "2026-01", id: statements.length ? statements[0].id : "none" }],
      portfolios: [{ id: "acct:SGD", label: "Stub Savings", names: ["Stub Savings"], firstMonth: "2026-01", lastMonth: "2026-01", kind: "bank", currency: "SGD" }],
      errors: [], gaps: [], firstOpenings: [], skippedRows: [], statements: statements.length, warnings: [],
    }`;

const parserUmd = (global, deps, extra = "") => umd(global, deps, `${TRICKY}  function parseStatements(statements, config = {}) {
    void config;
    return ${RESULT};
  }
${extra}  return { parseStatements };`);

const PAGE = (extra = "") => `${HTML_SPDX}<template data-slot="h1">Stub Bank statement to CSV and QIF</template>
<template data-slot="lede">Turns <em>Stub Bank</em> files into CSV files. Read in this browser.</template>
<template data-slot="drop-title">Drop files here</template>
<template data-slot="drop-help">or click to choose files.</template>
<template data-slot="mode-label">Funds</template>
<template data-slot="hint">Export only months you haven't imported yet.</template>
${extra}<template data-slot="help-items">
<li>One <em>Transactions CSV</em> per account.</li>
{{> help-columns-transactions}}
</template>
`;
const CONFIG_HELP = "<template data-slot=\"config-help\">Detected from the files. Saved in this browser.</template>\n";

const frozenFor = (id, { prefix = "", brand = "Stub Bank", custom = false } = {}) => custom
  ? `${SPDX}module.exports = {\n  storage: { modeKey: "${id}-mode", configKey: null },\n  modeValues: ["balance", "month"],\n  configKinds: null,\n  configIdPattern: null,\n  naming: { slug: "${id}" },\n};\n`
  : `${SPDX}module.exports = {\n  storage: { modeKey: "${id}-csv-mode", configKey: "${id}-csv-accounts" },\n  modeValues: ["balance", "tradelog", "holdings"],\n  configKinds: ["", "investment", "cash"],\n  naming: { accountPrefix: "${prefix}", brand: "${brand}", groupNoun: "accounts", slug: "${id}" },\n  configIdPattern: "^[^:]+:[A-Z]{3}$",\n  kindModel: "standard",\n};\n`;

const PROVIDERS = {
  // statement app, PDF input, uses layout
  "providers/stub-pdf/provider.js": `${SPDX}module.exports = {\n  contract: 1, id: "stub-pdf", name: "Stub Bank", summary: "Synthetic PDF stub",\n  inputs: ["pdf"], uses: ["layout"], parserGlobal: "StubPdfParser",\n};\n`,
  "providers/stub-pdf/parser.js": parserUmd("StubPdfParser", [{ path: "../../core/layout.js", global: "StatementLayout" }, { path: "../../core/export.js", global: "StatementExport" }]),
  "providers/stub-pdf/page.html": PAGE(CONFIG_HELP),
  "providers/stub-pdf/frozen.js": frozenFor("stub-pdf"),
  // statement app, CSV input, two scripts (a helper before the parser), assemble
  "providers/stub-csv/provider.js": `${SPDX}module.exports = {\n  contract: 1, id: "stub-csv", name: "Another Stub", summary: "Synthetic CSV stub",\n  inputs: ["csv"], uses: ["assemble"], scripts: ["helper.js", "parser.js"], parserGlobal: "StubCsvParser",\n  naming: { accountPrefix: "Stub " },\n};\n`,
  "providers/stub-csv/helper.js": umd("StubCsvHelper", [], "  return { help: () => 1 };"),
  "providers/stub-csv/parser.js": parserUmd("StubCsvParser", [{ path: "../../core/export.js", global: "StatementExport" }]),
  "providers/stub-csv/page.html": PAGE(CONFIG_HELP + "<template data-slot=\"empty\">Nothing yet.</template>\n"),
  "providers/stub-csv/frozen.js": frozenFor("stub-csv", { prefix: "Stub ", brand: "Another Stub" }),
  // custom app, xlsx input, single file, own app and files helper
  "providers/stub-custom/provider.js": `${SPDX}module.exports = {\n  contract: 1, id: "stub-custom", name: "Stub Sheet", summary: "Synthetic custom stub",\n  app: "custom", inputs: ["xlsx"], multiple: false, scripts: ["parser.js", "files.js"], parserGlobal: "StubSheetParser",\n  exportOverrides: ["openingBalance"],\n  storage: { modeKey: "stub-custom-mode", configKey: null }, naming: { slug: "stub-custom" },\n  modes: [{ id: "balance", label: "Balance only" }, { id: "month", label: "By <kind> & month" }],\n  testing: { allowWarnings: true },\n};\n`,
  "providers/stub-custom/parser.js": umd("StubSheetParser", [{ path: "../../core/export.js", global: "StatementExport" }],
    "  function parseWorkbook(wb, opts) { return { rows: Object.keys(wb || {}), group: opts.group }; }\n  function openingBalance() { return { balance: 0, date: \"2026-01-01\" }; }\n  return { parseWorkbook, openingBalance };"),
  "providers/stub-custom/files.js": umd("StubSheetFiles", [], "  return { create: (ctx) => ({ downloads: () => [{ trigger: \"zip\", account: null, kind: null, disabled: true, group: ctx.mode }] }) };"),
  "providers/stub-custom/app.js": `${SPDX}(function () {\n  "use strict";\n  void self.StatementProvider;\n})();\n`,
  "providers/stub-custom/test.js": `${SPDX}const F = require("./files.js");\nmodule.exports = {\n  parse(statements, ctx) { return statements.length ? ctx.P.parseWorkbook(statements[0].workbook, { group: ctx.mode }) : { error: "no workbook" }; },\n  downloads(result, ctx) { return F.create(ctx).downloads(); },\n  reconcile() { return []; },\n  expectedHeader(d) { return d.kind === "balances" ? "date,balance,currency" : null; },\n};\n`,
  "providers/stub-custom/page.html": `${HTML_SPDX}<template data-slot="h1">Stub Sheet statement to CSV</template>
<template data-slot="lede">Turns a <em>Stub Sheet</em> workbook into a CSV file.</template>
<template data-slot="drop-title">Drop the workbook here</template>
<template data-slot="drop-help">or click to choose it.</template>
<template data-slot="empty">No statement yet.</template>
<template data-slot="mode-label">Detail</template>
<template data-slot="hint">Export only months you haven't imported yet.</template>
<template data-slot="help-items">
  <li><strong>Balance only</strong>: one file.</li>
</template>
<template data-slot="help-extra">
<details>
  <summary>More</summary>
  <ul>
    <li>Extra notes.</li>
  </ul>
</details>
</template>
`,
  "providers/stub-custom/frozen.js": frozenFor("stub-custom", { custom: true }),
  // skeleton: built only with --include-skeletons
  "providers/_stub-skel/provider.js": `${SPDX}module.exports = {\n  contract: 1, id: "stub-skel", name: "Skeleton Bank", summary: "Synthetic skeleton",\n  inputs: ["csv", "pdf"], parserGlobal: "StubSkelParser",\n};\n`,
  "providers/_stub-skel/parser.js": parserUmd("StubSkelParser", [{ path: "../../core/export.js", global: "StatementExport" }]),
  "providers/_stub-skel/page.html": PAGE(CONFIG_HELP),
  // a folder with frozen.js only (a provider before its provider.js exists)
  "providers/stub-frozen-only/frozen.js": frozenFor("stub-frozen-only"),
  // test-only injected piece
  "test/inject/canary.js": `${SPDX}// INJECTED CANARY PIECE\nself.__injected = typeof self.StatementProvider;\n`,
  "test/inject/other.js": `${SPDX}// second injected file\n`,
};

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const d of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, d.name), b = path.join(to, d.name);
    if (d.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function writeTree(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
}

// makeStubTree({providers}) -> {root, tmp, write(files), cleanup()}
//   providers: false leaves providers/ empty (core and page only).
function makeStubTree({ providers = true } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-stub-"));
  const root = path.join(tmp, "tree");
  copyDir(path.join(REPO, "core", "page"), path.join(root, "core", "page"));
  writeTree(root, CORE);
  if (providers) writeTree(root, PROVIDERS);
  else fs.mkdirSync(path.join(root, "providers"), { recursive: true });
  return {
    root,
    tmp,
    write: (files) => writeTree(root, files),
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

module.exports = { makeStubTree, SPDX, HTML_SPDX, BOM, TRICKY, PAGE, CONFIG_HELP, frozenFor, umd, parserUmd };
