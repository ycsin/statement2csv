// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// A complete synthetic tree for the contract, lint and smoke tests (a helper, not a test):
// this repository's real core modules, the real statement app (core/app/statement-app.js),
// page files, vendor/ and the parse-error smoke's injected piece
// (test/smoke/inject/throw-on-marker.js, which build --inject takes from the tree's own test/)
// as byte copies, and five synthetic providers that keep the whole contract:
//   syn-csv    statement app, CSV ledger exports, StatementAssemble, fixtures (3 + 1 bad file)
//   syn-invest statement app, CSV broker exports: an investment account with trades and a
//              cash-like account (holdings files, a Combined zip, trade lines), fixtures (4)
//   syn-pdf    statement app, PDF statements read through StatementLayout, with a page transform
//              that drops a stamp the parse would otherwise fail on, fixtures (3 + 1 dup, a month
//              missing before the last, so its account has a gap row), and two hostile statements
//              for the injection smoke: their currency is markup, a month is missing between them
//              and the second lists a row without an amount whose description is markup, so the
//              payloads reach the cards, the configurator, the status and the diagnostics
//   syn-sheet  custom app: one xlsx workbook, modes that act at parse time, its own app.js,
//              files.js and test.js, fixtures
//   _syn-skel  a skeleton (checked and tested, never published), CSV, fixtures; the
//              parse-error smoke's page
// The tree builds with node build/build.js --root <tree>; the contract checks (both tiers),
// the lints, the pages smoke and the fixtures golden all pass on it, which is what a test
// changes one thing at a time to see each check fail. Synthetic data only; everything is
// written under the OS temporary directory, and cleanup() removes it.
//
// The three statement-app providers therefore run the real app on real parse results in CI:
// the smoke renders their cards and clicks every button, and the fixtures golden compares
// every download, Download all's scan of the rendered cards included, with the downloads hook.
// The custom app, parser and files sources are real functions in this file, written into the
// tree with Function.prototype.toString, so they are syntax-checked here and stay readable.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const SPDX = "// SPDX-License-Identifier: Apache-2.0\n// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>\n";
const HASH_SPDX = "# SPDX-License-Identifier: Apache-2.0\n# Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>\n";
const HTML_SPDX = "<!-- SPDX-License-Identifier: Apache-2.0 -->\n<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->\n";
const MARKER = "SYNTHETIC TEST DATA";
// The hostile PDF's currency: an element with a handler, written without spaces (a PDF text token).
const HOSTILE_CURRENCY = "<img/src/onerror=window.__pwned=1>";
// The hostile PDF's row without an amount: its description, which the diagnostics list.
const HOSTILE_DETAIL = "<b onmouseover=\"window.__pwned=1\">Pending</b>";

const COPIED = [
  "LICENSE", ".gitignore", "vendor/pdf.min.js", "vendor/pdf.worker.min.js",
  "core/escape.js", "core/shell.js", "core/zip.js", "core/storage.js", "core/export.js", "core/layout.js", "core/xlsx.js",
  "core/assemble.js", "core/files.js", "core/readers/csv.js", "core/readers/pdf.js", "core/readers/xlsx.js",
  "core/app/statement-app.js", "test/smoke/inject/throw-on-marker.js",
];

// ---------------------------------------------------------------- the custom app (syn-sheet)

/* eslint-disable no-undef */
function sheetApp() {
  "use strict";
  const R = self.StatementProvider;
  const P = Object.assign({}, self.StatementExport, self[R.parserGlobal]);
  const S = self.StatementShell, E = self.StatementEscape, Z = self.StatementZip, St = self.StatementStorage;
  const $ = S.$;
  const state = { workbook: null, file: null, error: null, result: null, mode: St.loadMode(R.storage.modeKey, R.modes.map((m) => m.id)) };
  const range = () => {
    let from = $("#from").value, to = $("#to").value;
    if (from && to && from > to) [from, to] = [to, from];
    return { from, to };
  };
  const F = self.SynSheetFiles.create({ P, result: () => state.result, range, naming: R.naming });
  function render() {
    const r = state.result;
    $("#empty").hidden = !!r || !!state.error;
    $("#results").hidden = !r;
    E.setHtml($("#status"), state.error ? E.html`<p class="warn">${state.file || "File"}: ${state.error}</p>` : r ? E.html`<p><strong>${state.file}</strong></p>` : E.html``);
    if (!r) return;
    const files = F.files();
    E.setHtml($("#cards"), files.length
      ? E.html`<article class="card"><header><h3>${r.account.name}</h3></header><div class="buttons">${files.map((f) => E.html`<button class="dl" data-kind="${f.kind}">${f.label}</button>`)}</div></article>`
      : E.html`<p class="muted">No activity in the selected months.</p>`);
    $("#zip").disabled = !files.length;
  }
  function recompute(keep) {
    const prev = keep ? range() : null;
    state.result = state.workbook ? P.parseSheet(state.workbook, { mode: state.mode }) : null;
    if (state.result && state.result.error) {
      state.error = state.result.error;
      state.result = null;
    }
    const months = state.result ? state.result.months : [];
    for (const id of ["from", "to"]) {
      const sel = $(`#${id}`), k = prev && prev[id];
      E.setHtml(sel, E.html`${months.map((m) => E.html`<option value="${m}">${S.monthLabel(m)}</option>`)}`);
      sel.value = k && months.includes(k) ? k : id === "from" ? months[0] || "" : months[months.length - 1] || "";
    }
    render();
  }
  async function onFiles(list) {
    const file = [...list].find((f) => self.StatementXlsx.accepts(f)) || list[0];
    if (!file) return;
    S.setBusy(`Reading ${file.name}`);
    try {
      state.workbook = (await self.StatementXlsx.read(file)).workbook;
      state.file = file.name;
      state.error = null;
    } catch (e) {
      state.workbook = null;
      state.file = file.name;
      state.error = String(e && e.message ? e.message : e);
    }
    S.setBusy("");
    recompute(false);
  }
  function setMode(mode) {
    state.mode = mode;
    St.saveMode(R.storage.modeKey, mode);
    for (const b of document.querySelectorAll("#mode button")) {
      b.classList.toggle("on", b.dataset.mode === mode);
      b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    }
    recompute(true);
  }
  $("#cards").addEventListener("click", (e) => {
    const b = e.target.closest("button.dl");
    if (!b) return;
    const f = F.files().find((x) => x.kind === b.dataset.kind);
    if (f) S.download(f.name, new Blob([f.text], { type: "text/csv" }));
  });
  $("#zip").addEventListener("click", () => S.download(F.zipName(), Z.zip(F.files())));
  S.wireInput({ onFiles, onMode: setMode, onRange: render, onClear: () => { state.workbook = null; state.file = null; state.error = null; recompute(false); } });
  setMode(state.mode);
}
/* eslint-enable no-undef */

// ---------------------------------------------------------------- parsers and helpers

// A ledger export: "Synthetic ledger export", "Account,<number>,<CCY>", the column header, then
// rows oldest first (the design's CSV template, generalised).
function csvParserFactory(E, A) {
  "use strict";
  const { round2, lastDayOf, prevMonth } = E;
  const TITLE = "Synthetic ledger export";
  const HEADER = "Date,Description,Amount,Balance";
  const nextMonth = (m) => {
    let [y, n] = m.split("-").map(Number);
    if (++n > 12) {
      n = 1;
      y++;
    }
    return `${y}-${String(n).padStart(2, "0")}`;
  };
  function parseExport(text) {
    const lines = String(text).split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(",").map((c) => c.trim()));
    if ((lines[0] || [])[0] !== TITLE) return { error: "not a synthetic ledger export" };
    const [tag, number, currency] = lines[1] || [];
    if (tag !== "Account" || !number || !/^[A-Z]{3}$/.test(currency || "") || (lines[2] || []).join(",") !== HEADER) return { error: "no account line or column header" };
    const rows = [], problems = [];
    for (const l of lines.slice(3)) {
      const [date, name, amount, balance] = l;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(Number(amount)) || !Number.isFinite(Number(balance))) {
        problems.push(`row not understood: ${l.join(",")}`);
        continue;
      }
      rows.push({ date, name, amount: Number(amount), balance: Number(balance) });
    }
    return { number, currency, rows, problems };
  }
  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], raw = {}, months = [], seen = new Set();
    let used = 0;
    for (const s of statements) {
      const st = parseExport(s.csv);
      if (st.error) {
        errors.push({ id: s.id, error: st.error });
        continue;
      }
      used++;
      for (const p of st.problems) warnings.push(`${s.id}: ${p}`);
      if (!st.rows.length) continue;
      const id = `${st.number}:${st.currency}`, label = `Ledger ${st.number}`;
      const r = (raw[id] = raw[id] || { label, names: [label], kind: "bank", currency: st.currency, months: {}, cash: [], trades: [] });
      for (const x of st.rows) {
        const key = `${id}|${x.date}|${x.name}|${x.amount}|${x.balance}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const m = x.date.slice(0, 7);
        const t = (r.months[m] = r.months[m] || { monthEnd: lastDayOf(m), opening: round2(x.balance - x.amount), closing: x.balance, fx: null });
        t.closing = x.balance;
        r.cash.push({ date: x.date, amount: -x.amount, currency: st.currency, name: x.name, notes: "", kind: "bank" });
      }
      for (let m = st.rows[0].date.slice(0, 7), end = st.rows[st.rows.length - 1].date.slice(0, 7); m <= end; m = nextMonth(m)) {
        if (!r.months[m]) {
          const p = r.months[prevMonth(m)];
          r.months[m] = { monthEnd: lastDayOf(m), opening: p.closing, closing: p.closing, fx: null };
        }
        months.push({ month: m, id: s.id });
      }
    }
    return A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] });
  }
  return { parseStatements };
}

// A broker export, one account per file: "Synthetic broker export", "Account,<number>,<CCY>,
// <kind>" (investment or cash), one "Month,<YYYY-MM>,<opening>,<closing>" line per month (the
// account's total value), the column header, then rows oldest first: cash rows (deposit,
// withdrawal, dividend, interest, fee) with an amount, inflow positive, and trades (buy, sell)
// with a ticker, a quantity and a price.
function investParserFactory(E, A) {
  "use strict";
  const TITLE = "Synthetic broker export";
  const HEADER = "Date,Type,Description,Ticker,Qty,Price,Amount";
  const CASH = ["deposit", "withdrawal", "dividend", "interest", "fee"];
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const num = (v) => (typeof v === "string" && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  function parseExport(text) {
    const lines = String(text).split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(",").map((c) => c.trim()));
    if ((lines[0] || [])[0] !== TITLE) return { error: "not a synthetic broker export" };
    const [tag, number, currency, kind] = lines[1] || [];
    if (tag !== "Account" || !number || !/^[A-Z]{3}$/.test(currency || "") || (kind !== "investment" && kind !== "cash")) return { error: "no account line" };
    const months = {};
    let i = 2;
    for (; lines[i] && lines[i][0] === "Month"; i++) {
      const [, m, opening, closing] = lines[i];
      if (!/^\d{4}-\d{2}$/.test(m || "") || num(opening) === null || num(closing) === null) return { error: "a month line is not understood" };
      months[m] = { monthEnd: E.lastDayOf(m), opening: num(opening), closing: num(closing), fx: null };
    }
    if ((lines[i] || []).join(",") !== HEADER) return { error: "no column header" };
    const cash = [], trades = [], problems = [];
    for (const l of lines.slice(i + 1)) {
      const [date, type, name, ticker, qty, price, amount] = l;
      if (DATE.test(date || "") && (type === "buy" || type === "sell") && ticker && num(qty) !== null && num(price) !== null) {
        trades.push({ date, ticker, qty: type === "sell" ? -num(qty) : num(qty), price: num(price), currency, name });
      } else if (DATE.test(date || "") && CASH.includes(type) && num(amount) !== null) {
        cash.push({ date, amount: -num(amount), currency, name, notes: "", kind: type });
      } else problems.push(`row not understood: ${l.join(",")}`);
    }
    return { number, currency, kind, months, cash, trades, problems };
  }
  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], raw = {}, months = [];
    let used = 0;
    for (const s of statements) {
      const st = parseExport(s.csv);
      if (st.error) {
        errors.push({ id: s.id, error: st.error });
        continue;
      }
      used++;
      for (const p of st.problems) warnings.push(`${s.id}: ${p}`);
      const id = `${st.number}:${st.currency}`, label = `${st.kind === "investment" ? "Brokerage" : "Savings"} ${st.number}`;
      const r = (raw[id] = raw[id] || { label, names: [label], kind: st.kind, currency: st.currency, months: {}, cash: [], trades: [] });
      Object.assign(r.months, st.months);
      r.cash.push(...st.cash);
      r.trades.push(...st.trades);
      for (const m of Object.keys(st.months)) months.push({ month: m, id: s.id });
    }
    return A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] });
  }
  return { parseStatements };
}

// A one-account monthly statement PDF: a stamp line above everything, which the page transform
// (dropStamp) removes, then the title, "Period YYYY-MM", "Account <no> <currency>", the opening
// balance, rows "<date>  <description>  <amount>" (three runs on one line), the closing balance.
// Without the transform the first line is the stamp, and the statement is not recognised. The
// currency is the token as printed, as a raw-text fallback reads it, so a hostile statement can
// carry markup there (fixtures/hostile.js). A row "<date>  <description>" without an amount is not
// exported: it is a skipped row of category "no amount", its description the detail and the
// account's label the owner, as the diagnostics list them.
function pdfParserFactory(L, E, A) {
  "use strict";
  const TITLE = "Synthetic Pdf Bank statement";
  const STAMP = "SYNTHETIC STAMP";
  function dropStamp(items) {
    return (Array.isArray(items) ? items : []).filter((it) => !(it && it.str === STAMP));
  }
  function readStatement(s) {
    const lines = (Array.isArray(s.pages) ? s.pages : []).flatMap((p) => L.pageLines(Array.isArray(p) ? p : []).map((l) => l.text));
    if (lines[0] !== TITLE) return { error: "not a synthetic PDF statement" };
    const get = (re) => {
      for (const l of lines) {
        const m = re.exec(l);
        if (m) return m;
      }
      return null;
    };
    const period = get(/^Period (\d{4}-\d{2})$/), account = get(/^Account (\S+) (\S+)$/);
    const opening = get(/^Opening balance (-?\d+\.\d\d)$/), closing = get(/^Closing balance (-?\d+\.\d\d)$/);
    if (!period || !account || !opening || !closing) return { error: "no period, account or balances on the statement" };
    const rows = [], unpriced = [];
    for (const l of lines) {
      const m = /^(\d{4}-\d{2}-\d{2}) {2}(.+) {2}(-?\d+\.\d\d)$/.exec(l);
      if (m) rows.push({ date: m[1], name: m[2], amount: Number(m[3]) });
      else if (/^\d{4}-\d{2}-\d{2} {2}\S/.test(l)) unpriced.push({ date: l.slice(0, 10), detail: l.slice(12) });
    }
    return { month: period[1], number: account[1], currency: account[2], opening: Number(opening[1]), closing: Number(closing[1]), rows, unpriced };
  }
  function parseStatements(statements, config = {}) {
    const errors = [], raw = {}, months = [], seen = new Set(), skippedRows = [];
    let used = 0;
    for (const s of statements) {
      const st = readStatement(s);
      if (st.error) {
        errors.push({ id: s.id, error: st.error });
        continue;
      }
      const id = `${st.number}:${st.currency}`;
      if (seen.has(`${id}|${st.month}`)) {
        errors.push({ id: s.id, error: `duplicate statement for ${st.month}, ignored` });
        continue;
      }
      seen.add(`${id}|${st.month}`);
      used++;
      const label = `Savings ${st.number}`;
      const r = (raw[id] = raw[id] || { label, names: [label], kind: "bank", currency: st.currency, months: {}, cash: [], trades: [] });
      r.months[st.month] = { monthEnd: E.lastDayOf(st.month), opening: st.opening, closing: st.closing, fx: null };
      for (const x of st.rows) r.cash.push({ date: x.date, amount: -x.amount, currency: st.currency, name: x.name, notes: "", kind: "bank" });
      for (const x of st.unpriced) skippedRows.push({ date: x.date, category: "no amount", detail: x.detail, account: label });
      months.push({ month: st.month, id: s.id });
    }
    for (const r of Object.values(raw)) r.cash.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return A.build({ raw, config, months, statements: used, errors, warnings: [], skippedRows });
  }
  return { parseStatements, dropStamp };
}

// A workbook with a "Synthetic Ledger" sheet: Date, Description, Amount, Currency. Mode "plain"
// keeps every row; "monthly" sums each month into one row dated at its end.
function sheetParserFactory(E) {
  "use strict";
  const SHEET = "Synthetic Ledger";
  const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  function monthly(entries) {
    const by = new Map();
    for (const e of entries) {
      const m = e.date.slice(0, 7);
      const x = by.get(m) || { date: E.lastDayOf(m), amount: 0, currency: e.currency, name: "Monthly total", notes: "", kind: "transfer" };
      x.amount = E.round2(x.amount + e.amount);
      by.set(m, x);
    }
    return [...by.values()];
  }
  function parseSheet(workbook, { mode } = {}) {
    const rows = workbook && Array.isArray(workbook[SHEET]) ? workbook[SHEET] : null;
    if (!rows || !Array.isArray(rows[0]) || rows[0].join("|") !== "Date|Description|Amount|Currency") return { error: "not a synthetic ledger workbook" };
    const entries = [];
    for (const r of rows.slice(1)) {
      if (!Array.isArray(r)) continue;
      const [date, name, amount, currency] = r;
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof amount !== "number" || typeof currency !== "string") continue;
      entries.push({ date, amount: -amount, currency, name: String(name), notes: "", kind: "transfer" });
    }
    if (!entries.length) return { error: "the workbook has no ledger rows" };
    entries.sort(byDate);
    const list = mode === "monthly" ? monthly(entries) : entries;
    return { account: { name: "Synthetic Sheet", currency: entries[0].currency, entries: list }, months: [...new Set(list.map((e) => e.date.slice(0, 7)))] };
  }
  return { parseSheet };
}

function sheetFilesFactory() {
  "use strict";
  function create(ctx) {
    const span = () => {
      const { from, to } = ctx.range();
      return from === to ? from : `${from}_to_${to}`;
    };
    function files() {
      const r = ctx.result();
      if (!r) return [];
      const a = r.account, { from, to } = ctx.range();
      const entries = a.entries.filter((e) => ctx.P.inRange(e.date, from, to));
      if (!entries.length) return [];
      const before = a.entries.filter((e) => from && e.date.slice(0, 7) < from).reduce((s, e) => s - e.amount, 0);
      const start = { balance: ctx.P.round2(before), date: ctx.P.dayBefore(entries[0].date) };
      return [
        { kind: "transactions", label: "Transactions CSV", name: `${a.name} - transactions - ${span()}.csv`, text: ctx.P.transactionsCsv(a.entries, from, to) },
        { kind: "qif", label: "QIF", name: `${a.name} - ${span()}.qif`, text: ctx.P.qif(entries, start, a.name) },
      ];
    }
    const zipName = () => `${ctx.naming.slug}-csv-${span()}.zip`;
    function downloads() {
      if (!ctx.result()) return [];
      const fs = files();
      const out = fs.map((f) => ({ trigger: "card", account: null, kind: f.kind, name: f.name, type: "text/csv", text: f.text }));
      out.push(fs.length
        ? { trigger: "zip", account: null, kind: null, name: zipName(), type: "application/zip", files: fs.map(({ name, text }) => ({ name, text })) }
        : { trigger: "zip", account: null, kind: null, disabled: true });
      return out;
    }
    return { files, zipName, downloads };
  }
  return { create };
}

// ---------------------------------------------------------------- the files of the tree

function umd(globalName, deps, factory) {
  return `${SPDX}(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(${deps.map(([p]) => `require(${JSON.stringify(p)})`).join(", ")});
  else root.${globalName} = factory(${deps.map(([, g]) => `root.${g}`).join(", ")});
})(typeof self !== "undefined" ? self : this, ${factory.toString()});
`;
}

const data = (comment, value) => `${SPDX}// ${comment}\nmodule.exports = ${JSON.stringify(value, null, 2)};\n`;
const app = (fn, comment) => `${SPDX}// ${comment}\n(${fn.toString()})();\n`;

const frozenStatement = (id, brand) => ({
  storage: { modeKey: `${id}-csv-mode`, configKey: `${id}-csv-accounts` },
  modeValues: ["balance", "tradelog", "holdings"],
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "", brand, groupNoun: "accounts", slug: id },
  configIdPattern: "^[^:]+:[A-Z]{3}$",
  kindModel: "standard",
});

const pageHtml = (name, { configurator = true, extra = "" } = {}) => `${HTML_SPDX}<template data-slot="h1">${name} statement to CSV and QIF</template>
<template data-slot="lede">Turns <em>${name}</em> files into CSV or QIF files. The files are read in this browser and never uploaded.</template>
<template data-slot="drop-title">Drop files here</template>
<template data-slot="drop-help">or click to choose files.</template>
<template data-slot="mode-label">Detail</template>
<template data-slot="hint">Export only months you haven't imported yet.</template>
${configurator ? "<template data-slot=\"config-help\">Detected from the files. Saved in this browser.</template>\n" : ""}${extra}<template data-slot="help-items">
<li>One <em>Transactions CSV</em> per account.</li>
${configurator ? "{{> help-qif-short}}\n{{> help-accounts-combined}}\n" : ""}{{> help-columns-transactions}}
</template>
`;

const ledger = (number, currency, rows) => ["Synthetic ledger export", `Account,${number},${currency}`, "Date,Description,Amount,Balance", ...rows].join("\n") + "\n";

const broker = (number, currency, kind, months, rows) => ["Synthetic broker export", `Account,${number},${currency},${kind}`,
  ...months.map(([m, opening, closing]) => `Month,${m},${opening},${closing}`), "Date,Type,Description,Ticker,Qty,Price,Amount", ...rows].join("\n") + "\n";

// rows: [date, description, amount], or [date, description] for a row without an amount.
const pdfPage = (month, opening, closing, rows, currency = "SGD") => [[
  { x: 50, y: 820, text: "SYNTHETIC STAMP" },
  { x: 50, y: 800, text: "Synthetic Pdf Bank statement" },
  { x: 50, y: 780, text: `Period ${month}` },
  { x: 50, y: 765, text: `Account S7 ${currency}` },
  { x: 50, y: 750, text: `Opening balance ${opening}` },
  ...rows.flatMap(([d, n, a], i) => [{ x: 50, y: 720 - i * 15, text: d }, { x: 150, y: 720 - i * 15, text: n }, ...(a === undefined ? [] : [{ x: 400, y: 720 - i * 15, text: a }])]),
  { x: 50, y: 600, text: `Closing balance ${closing}` },
]];

function files() {
  const csvSpec = {
    marker: MARKER,
    files: [
      { name: "ledger-a-2026-01.csv", text: ledger("L100", "SGD", ["2026-01-05,Salary,1000.00,1000.00", "2026-01-20,Rent,-400.00,600.00"]) },
      { name: "ledger-a-2026-02.csv", text: ledger("L100", "SGD", ["2026-02-03,Groceries,-50.00,550.00", "2026-03-10,=Refund,25.00,575.00"]) },
      { name: "ledger-b-2026-02.csv", text: ledger("L200", "USD", ["2026-02-15,Deposit,200.00,200.00"]) },
      { name: "notes.csv", text: "hello\n" },
    ],
    expectErrors: ["notes.csv"],
  };
  const investSpec = {
    marker: MARKER,
    files: [
      { name: "broker-b1-2026-01.csv", text: broker("B1", "SGD", "investment", [["2026-01", "0.00", "1012.00"]], [
        "2026-01-05,deposit,Top-up,,,,1000.00", "2026-01-06,buy,Fund units,FND,10,50.00,", "2026-01-07,buy,Bond units,BND,5,100.00,", "2026-01-20,dividend,Fund dividend,,,,2.00",
      ]) },
      { name: "broker-b1-2026-02.csv", text: broker("B1", "SGD", "investment", [["2026-02", "1012.00", "1100.50"]], [
        "2026-02-03,deposit,Top-up,,,,50.00", "2026-02-10,sell,Fund units,FND,2,52.00,", "2026-02-11,buy,Bond units,BND,1,101.00,", "2026-02-25,fee,Platform fee,,,,-1.50",
      ]) },
      { name: "broker-c1-2026-01.csv", text: broker("C1", "SGD", "cash", [["2026-01", "200.00", "300.25"]], ["2026-01-10,deposit,Transfer in,,,,100.00", "2026-01-31,interest,Interest,,,,0.25"]) },
      { name: "broker-c1-2026-02.csv", text: broker("C1", "SGD", "cash", [["2026-02", "300.25", "280.50"]], ["2026-02-15,withdrawal,Transfer out,,,,-20.00", "2026-02-28,interest,Interest,,,,0.25"]) },
    ],
  };
  const pdfSpec = {
    marker: MARKER,
    files: [
      { name: "statement-2026-01.pdf", pages: pdfPage("2026-01", "100.00", "180.00", [["2026-01-04", "Deposit", "100.00"], ["2026-01-18", "Card payment", "-20.00"]]) },
      { name: "statement-2026-02.pdf", pages: pdfPage("2026-02", "180.00", "175.50", [["2026-02-09", "Interest", "0.50"], ["2026-02-11", "Fee", "-5.00"]]) },
      { name: "statement-2026-01-copy.pdf", pages: pdfPage("2026-01", "100.00", "180.00", [["2026-01-04", "Deposit", "100.00"], ["2026-01-18", "Card payment", "-20.00"]]) },
      // March is missing, and April opens above February's close: the account's gap row, which
      // the diagnostics list under the account's name (the injection smoke's seeded name).
      { name: "statement-2026-04.pdf", pages: pdfPage("2026-04", "190.00", "200.00", [["2026-04-06", "Deposit", "10.00"]]) },
    ],
    expectErrors: ["statement-2026-01-copy.pdf"],
  };
  // The injection smoke's hostile files: two statements whose currency is markup with a handler,
  // April missing between them (a gap row, which the diagnostics print with the currency), and
  // in May a row without an amount whose description is markup (a skipped row the diagnostics
  // list). The statement app prints the currency on the card, in the configurator, in the first
  // openings and in the gap row, and the description among the rows not exported.
  const pdfHostile = {
    marker: MARKER,
    files: [
      { name: "statement-2026-03-hostile.pdf", pages: pdfPage("2026-03", "175.50", "200.50", [["2026-03-02", "Deposit", "25.00"]], HOSTILE_CURRENCY) },
      { name: "statement-2026-05-hostile.pdf", pages: pdfPage("2026-05", "210.50", "215.50", [["2026-05-04", HOSTILE_DETAIL], ["2026-05-08", "Deposit", "5.00"]], HOSTILE_CURRENCY) },
    ],
  };
  const sheetSpec = {
    marker: MARKER,
    files: [{ name: "synthetic-ledger.xlsx", sheets: { "Synthetic Ledger": [["Date", "Description", "Amount", "Currency"], ["2026-01-05", "Deposit", 500, "USD"], ["2026-01-20", "Fee", -5, "USD"], ["2026-02-10", "Deposit", 100, "USD"]] } }],
  };
  const skelSpec = { marker: MARKER, files: [{ name: "skeleton-2026-04.csv", text: ledger("K1", "EUR", ["2026-04-01,Opening deposit,10.00,10.00"]) }] };
  const fixtureNote = `${MARKER}: synthetic fixtures (docs/TESTING.md, fixture spec format).`;
  return {
    "NOTICE": "synthetic tree\nCopyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>\n",
    "README.md": `${HTML_SPDX}\n# A synthetic tree\n\nBuilt by the unit tests.\n`,
    "package.json": `${JSON.stringify({ name: "synthetic-tree", private: true, license: "Apache-2.0" }, null, 2)}\n`,
    "test/contract/provenance.js": `${SPDX}// No pinned files in the synthetic tree.\nmodule.exports = [];\n`,

    "providers/syn-csv/provider.js": data("Synthetic descriptor.", { contract: 1, id: "syn-csv", name: "Synthetic Ledger", summary: "Synthetic ledger exports (CSV)", inputs: ["csv"], uses: ["assemble"], parserGlobal: "SynCsvParser", testing: { fixtures: "fixtures" } }),
    "providers/syn-csv/frozen.js": data("Synthetic compatibility surface.", frozenStatement("syn-csv", "Synthetic Ledger")),
    "providers/syn-csv/parser.js": umd("SynCsvParser", [["../../core/export.js", "StatementExport"], ["../../core/assemble.js", "StatementAssemble"]], csvParserFactory),
    "providers/syn-csv/page.html": pageHtml("Synthetic Ledger"),
    "providers/syn-csv/fixtures/statements.js": data(fixtureNote, csvSpec),

    "providers/syn-invest/provider.js": data("Synthetic descriptor.", { contract: 1, id: "syn-invest", name: "Synthetic Broker", summary: "Synthetic broker exports (CSV)", inputs: ["csv"], uses: ["assemble"], parserGlobal: "SynInvestParser", testing: { fixtures: "fixtures" } }),
    "providers/syn-invest/frozen.js": data("Synthetic compatibility surface.", frozenStatement("syn-invest", "Synthetic Broker")),
    "providers/syn-invest/parser.js": umd("SynInvestParser", [["../../core/export.js", "StatementExport"], ["../../core/assemble.js", "StatementAssemble"]], investParserFactory),
    "providers/syn-invest/page.html": pageHtml("Synthetic Broker"),
    "providers/syn-invest/fixtures/statements.js": data(fixtureNote, investSpec),

    "providers/syn-pdf/provider.js": data("Synthetic descriptor.", { contract: 1, id: "syn-pdf", name: "Synthetic Statement", summary: "Synthetic monthly statements (PDF)", inputs: ["pdf"], uses: ["layout", "assemble"], parserGlobal: "SynPdfParser", pdf: { pageTransform: "dropStamp" }, testing: { fixtures: "fixtures" } }),
    "providers/syn-pdf/frozen.js": data("Synthetic compatibility surface.", frozenStatement("syn-pdf", "Synthetic Statement")),
    "providers/syn-pdf/parser.js": umd("SynPdfParser", [["../../core/layout.js", "StatementLayout"], ["../../core/export.js", "StatementExport"], ["../../core/assemble.js", "StatementAssemble"]], pdfParserFactory),
    "providers/syn-pdf/page.html": pageHtml("Synthetic Statement"),
    "providers/syn-pdf/fixtures/statements.js": data(fixtureNote, pdfSpec),
    "providers/syn-pdf/fixtures/hostile.js": data(fixtureNote, pdfHostile),

    "providers/syn-sheet/provider.js": data("Synthetic descriptor.", {
      contract: 1, id: "syn-sheet", name: "Synthetic Sheet", summary: "A synthetic ledger workbook (XLSX)", app: "custom", inputs: ["xlsx"], multiple: false,
      scripts: ["parser.js", "files.js"], parserGlobal: "SynSheetParser", storage: { modeKey: "syn-sheet-csv-mode", configKey: null },
      modes: [{ id: "plain", label: "Every row" }, { id: "monthly", label: "Monthly totals" }], naming: { slug: "syn-sheet" }, testing: { fixtures: "fixtures" },
    }),
    "providers/syn-sheet/frozen.js": data("Synthetic compatibility surface.", { storage: { modeKey: "syn-sheet-csv-mode", configKey: null }, modeValues: ["plain", "monthly"], configKinds: null, configIdPattern: null, naming: { slug: "syn-sheet" } }),
    "providers/syn-sheet/parser.js": umd("SynSheetParser", [["../../core/export.js", "StatementExport"]], sheetParserFactory),
    "providers/syn-sheet/files.js": umd("SynSheetFiles", [], sheetFilesFactory),
    "providers/syn-sheet/app.js": app(sheetApp, "The synthetic custom app."),
    "providers/syn-sheet/test.js": `${SPDX}// The synthetic custom app's hooks (docs/CONTRACT.md, test.js hooks).
const F = require("./files.js");
module.exports = {
  parse(statements, ctx) {
    const s = statements[0];
    return s && s.workbook ? ctx.P.parseSheet(s.workbook, { mode: ctx.mode }) : null;
  },
  downloads(result, ctx) {
    if (!result || result.error) return [];
    return F.create({ P: ctx.P, result: () => result, range: () => ({ from: ctx.from, to: ctx.to }), naming: ctx.R.naming }).downloads();
  },
  reconcile() {
    return [];
  },
};
`,
    "providers/syn-sheet/page.html": pageHtml("Synthetic Sheet", { configurator: false }),
    "providers/syn-sheet/fixtures/statements.js": data(fixtureNote, sheetSpec),

    "providers/_syn-skel/provider.js": data("Synthetic skeleton descriptor.", { contract: 1, id: "syn-skel", name: "Synthetic Skeleton", summary: "A synthetic skeleton (CSV)", inputs: ["csv"], uses: ["assemble"], parserGlobal: "SynSkelParser", testing: { fixtures: "fixtures" } }),
    "providers/_syn-skel/parser.js": umd("SynSkelParser", [["../../core/export.js", "StatementExport"], ["../../core/assemble.js", "StatementAssemble"]], csvParserFactory),
    "providers/_syn-skel/page.html": pageHtml("Synthetic Skeleton"),
    "providers/_syn-skel/fixtures/statements.js": data(fixtureNote, skelSpec),
  };
}

function writeTree(root, content) {
  for (const [rel, text] of Object.entries(content)) {
    const abs = path.join(root, rel);
    if (text === null) continue;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const d of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, d.name), b = path.join(to, d.name);
    if (d.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function git(root, ...args) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  env.GIT_CEILING_DIRECTORIES = path.dirname(root);
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = os.devNull;
  return execFileSync("git", ["-c", "user.name=synthetic", "-c", "user.email=synthetic", "-c", "commit.gpgsign=false", "-C", root, ...args], { env, stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
}

// makeSyntheticTree({git}) -> {root, tmp, write(files), remove(...paths), read(rel), git(...args),
//   build(args), cleanup()}. With git: true the tree is a git repository with everything
//   committed (dist/ excluded until build() and a commit).
function makeSyntheticTree({ git: withGit = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-synthetic-"));
  const root = path.join(tmp, "tree");
  copyDir(path.join(REPO, "core", "page"), path.join(root, "core", "page"));
  for (const rel of COPIED) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.copyFileSync(path.join(REPO, rel), path.join(root, rel));
  }
  writeTree(root, files());
  if (withGit) {
    git(root, "init", "-q");
    git(root, "add", "-A");
    git(root, "commit", "-q", "--no-verify", "-m", "synthetic");
  }
  return {
    root,
    tmp,
    write: (content) => writeTree(root, content),
    remove: (...rels) => rels.forEach((r) => fs.rmSync(path.join(root, r), { recursive: true, force: true })),
    read: (rel) => fs.readFileSync(path.join(root, rel), "utf8"),
    git: (...args) => git(root, ...args),
    build: (args = []) => {
      const out = [], err = [];
      const code = require(path.join(REPO, "build", "build.js")).run(["--root", root, ...args], { log: (m) => out.push(m), err: (m) => err.push(m) });
      return { code, out, err };
    },
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

module.exports = {
  makeSyntheticTree, SPDX, HASH_SPDX, HTML_SPDX, MARKER, HOSTILE_CURRENCY, HOSTILE_DETAIL, umd, csvParserFactory, investParserFactory, pdfParserFactory, sheetParserFactory, sheetFilesFactory, sheetApp,
  // Statement builders, for tests that write their own statement folders.
  ledger, broker, pdfPage,
};
