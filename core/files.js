// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// File assembly of the statement app (docs/ARCHITECTURE.md, core/files.js): what each account
// exports, every file's name and text, the Accounts and Combined files, the zip names, and the
// downloads hook (docs/CONTRACT.md) that lists every download the page offers for a state.
// Pure: it reads only what ctx returns, and never touches the DOM, storage or the clock.
// Works in the browser (self.StatementFiles) and in Node (module.exports).
//
//   const F = StatementFiles.create({ P, result, mode, range, naming, kindModel })
//     P          the composed namespace, Object.assign({}, StatementExport, parser)
//     result()   the current Result; non-null whenever a method other than downloads() runs
//     mode()     "balance" | "tradelog" | "holdings"
//     range()    {from, to}, already swapped so that from <= to
//     naming     {accountPrefix, brand, groupNoun, slug}
//     kindModel  "standard" | "investment-cash"
//   F.modeOf, earliest, span, exportsFor, fileFor, accountsFile, combinedFiles, zipName,
//   cards, allFiles, downloads
//
// Derivation. Line numbers are those of the reference statement app (src/app.js at its
// legacyHead); docs/MIGRATION.md names it and lists the variants' lines. The moved bodies are
// verbatim apart from state.result -> ctx.result(), state.mode -> ctx.mode(), range() ->
// ctx.range(), the provider strings -> naming fields, and modeOf chosen by kindModel.
//   modeOf         :44 standard; investment-cash is the variant's own line (only "cash" is
//                  forced to Balance only)
//   label          :46 (the identity in every old app)
//   earliest       :104
//   exportsFor     :108-127
//   fileFor        :129-146; the prefixed variants put accountPrefix before label(name) in
//                  both file names and in the QIF account
//   accountsFile   :148-164; "<brand> accounts - <span>.csv", Name = accountPrefix + name
//   combinedFiles  :166-186; "<brand> all <groupNoun> - …", account = accountPrefix + name
//   zipName        :380-381 and :387-388; always <from>_to_<to>
//   span           the expression of :137, :144, :162 and :182
// New pure functions that restate the page's rules (replay checks them against every golden):
//   cards          render's card loop, :195-198 (a card iff its account has files or month-end
//                  values), with the buttons of :225-227 (one per file, in files order)
//   allFiles       the Download-all list of :384-389, Accounts CSV first, then each card's
//                  buttons' files in card and button order (the data form of the DOM scan)
//   downloads      the card buttons in DOM order (:365-370), then #accounts (:372-375),
//                  #combined (:377-382: one file as CSV, two as a zip) and #zip (:384-389);
//                  the three toolbar buttons are disabled exactly when there is no card
//                  (:231-233); [] without a result (#results hidden)
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StatementFiles = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const KIND_MODELS = ["standard", "investment-cash"];
  const NAMING_KEYS = ["accountPrefix", "brand", "groupNoun", "slug"];

  function create(ctx) {
    if (!ctx || typeof ctx !== "object") throw new TypeError("StatementFiles.create needs a context object");
    for (const k of ["result", "mode", "range"]) {
      if (typeof ctx[k] !== "function") throw new TypeError(`StatementFiles.create: ctx.${k} must be a function`);
    }
    const { P, naming, kindModel } = ctx;
    if (!P || typeof P !== "object") throw new TypeError("StatementFiles.create: ctx.P must be the composed namespace");
    if (!naming || typeof naming !== "object" || NAMING_KEYS.some((k) => typeof naming[k] !== "string")) {
      throw new TypeError(`StatementFiles.create: ctx.naming needs the strings ${NAMING_KEYS.join(", ")}`);
    }
    if (!KIND_MODELS.includes(kindModel)) {
      throw new TypeError(`StatementFiles.create: ctx.kindModel must be ${KIND_MODELS.map((m) => JSON.stringify(m)).join(" or ")}`);
    }
    const { accountPrefix, brand, groupNoun, slug } = naming;

    // The accounts the mode switch applies to: investments (standard), or everything but
    // cash-like accounts (investment-cash); the others always export Balance only.
    const modeOf = kindModel === "investment-cash"
      ? (name) => (ctx.result().accounts[name].kind === "cash" ? "balance" : ctx.mode())
      : (name) => (ctx.result().accounts[name].kind !== "investment" ? "balance" : ctx.mode());
    const label = (name) => name;
    const earliest = () => (ctx.result() && ctx.result().months.length ? ctx.result().months[0].month : null);
    const span = () => { const { from, to } = ctx.range(); return from === to ? from : `${from}_to_${to}`; };

    // ---------- what each account exports ----------
    function exportsFor(name) {
      const a = ctx.result().accounts[name];
      const { from, to } = ctx.range();
      const vals = a.valuations.filter(([d]) => P.inRange(d, from, to));
      const mode = modeOf(name);
      if (mode !== "holdings") {
        const { entries, problems } = P.adjustedEntries(a, from, to, earliest(), mode === "tradelog");
        const n = (kind) => entries.filter((e) => e.kind === kind).length;
        return { vals, problems, adjustments: n("adjustment"), tradeLines: n("trade"),
                 files: entries.length ? [{ kind: "transactions", label: "Transactions CSV", count: entries.length - n("trade") },
                                         { kind: "qif", label: "QIF", count: entries.length - n("trade") }] : [] };
      }
      const trades = a.trades.filter((t) => P.inRange(t.date, from, to));
      const cash = a.cash.filter((c) => P.inRange(c.date, from, to));
      const files = [];
      if (trades.length) files.push({ kind: "trades", label: "Trades CSV", count: trades.length });
      if (cash.length) files.push({ kind: "transactions", label: "Transactions CSV", count: cash.length });
      if (vals.length) files.push({ kind: "valuations", label: "Month-end balances CSV", count: vals.length });
      return { vals, problems: [], files, balancing: cash.filter((c) => c.balancing).length };
    }

    function fileFor(name, kind) {
      const a = ctx.result().accounts[name];
      const { from, to } = ctx.range();
      const mode = modeOf(name);
      if (kind === "qif") {
        // One QIF per account, with the starting balance as its "Opening Balance" record.
        const { entries } = P.adjustedEntries(a, from, to, earliest());
        const start = P.openingBalance(a, from, to, earliest(), entries);
        const span = from === to ? from : `${from}_to_${to}`;
        return { name: `${accountPrefix}${label(name)} - ${span}.qif`, text: P.qif(entries, start, `${accountPrefix}${label(name)}`) };
      }
      const text = mode !== "holdings" ? P.adjustedCsv(a, from, to, earliest(), mode === "tradelog")
        : kind === "trades" ? P.tradesCsv(a.trades, from, to)
        : kind === "transactions" ? P.transactionsCsv(a.cash, from, to)
        : P.valuationsCsv(a.valuations, from, to, a.currency);
      const span = from === to ? from : `${from}_to_${to}`;
      return { name: `${accountPrefix}${label(name)} - ${kind} - ${span}.csv`, text };
    }

    // One row per exported account: account type and its starting balance just
    // before the first exported entry.
    function accountsFile() {
      const { from, to } = ctx.range();
      const rows = [];
      for (const [name, a] of Object.entries(ctx.result().accounts)) {
        if (!exportsFor(name).files.length) continue;
        const mode = modeOf(name);
        const entries = mode === "holdings"
          ? [...a.trades, ...a.cash].filter((e) => P.inRange(e.date, from, to))
          : P.adjustedEntries(a, from, to, earliest(), mode === "tradelog").entries;
        const start = P.openingBalance(a, from, to, earliest(), entries);
        if (start) rows.push({ type: a.kind === "investment" ? "Investment" : "Savings", name: `${accountPrefix}${label(name)}`, currency: a.currency, ...start });
      }
      const span = from === to ? from : `${from}_to_${to}`;
      return { name: `${brand} accounts - ${span}.csv`, text: P.accountsCsv(rows), count: rows.length };
    }

    // All accounts in one file per kind, with an account column named like the
    // Accounts CSV, for multi-account imports.
    function combinedFiles() {
      const { from, to } = ctx.range();
      const trades = [], cash = [];
      for (const [name, a] of Object.entries(ctx.result().accounts)) {
        if (!exportsFor(name).files.length) continue;
        const account = `${accountPrefix}${label(name)}`;
        const mode = modeOf(name);
        if (mode === "holdings") {
          trades.push({ account, rows: a.trades.filter((t) => P.inRange(t.date, from, to)) });
          cash.push({ account, rows: a.cash.filter((c) => P.inRange(c.date, from, to)) });
        } else {
          cash.push({ account, rows: P.adjustedEntries(a, from, to, earliest(), mode === "tradelog").entries });
        }
      }
      const span = from === to ? from : `${from}_to_${to}`;
      const files = [{ name: `${brand} all ${groupNoun} - transactions - ${span}.csv`, text: P.combinedTransactionsCsv(cash) }];
      if (trades.some((g) => g.rows.length)) files.unshift({ name: `${brand} all ${groupNoun} - trades - ${span}.csv`, text: P.combinedTradesCsv(trades) });
      return files;
    }

    // The zips are always named <from>_to_<to>, even for a single month.
    function zipName(which) {
      if (which !== "csv" && which !== "combined") throw new TypeError(`zipName: which must be "csv" or "combined", not ${JSON.stringify(which)}`);
      const { from, to } = ctx.range();
      return `${slug}-${which}-${from}_to_${to}.zip`;
    }

    // ---------- the page's cards and toolbar, as data ----------
    // [{name, files}] in result order: a card iff the account has files or month-end values in
    // the range; files are its buttons, in order (possibly none).
    function cards() {
      const out = [];
      for (const name of Object.keys(ctx.result().accounts)) {
        const ex = exportsFor(name);
        if (!ex.files.length && !ex.vals.length) continue;
        out.push({ name, files: ex.files });
      }
      return out;
    }

    // The whole Download-all entry list, Accounts CSV included (never prefix it again).
    function allFiles() {
      const files = [accountsFile()];
      for (const { name, files: buttons } of cards()) for (const f of buttons) files.push(fileFor(name, f.kind));
      return files;
    }

    const entry = ({ name, text }) => ({ name, text });

    // The downloads hook, in the page driver's click order.
    function downloads() {
      if (!ctx.result()) return [];
      const shown = cards();
      const out = [];
      for (const { name, files } of shown) {
        for (const f of files) {
          const file = fileFor(name, f.kind);
          out.push({ trigger: "card", account: name, kind: f.kind, name: file.name, type: "text/csv", text: file.text });
        }
      }
      if (!shown.length) {
        for (const trigger of ["accounts", "combined", "zip"]) out.push({ trigger, account: null, kind: null, disabled: true });
        return out;
      }
      const accounts = accountsFile();
      out.push({ trigger: "accounts", account: null, kind: null, name: accounts.name, type: "text/csv", text: accounts.text });
      const combined = combinedFiles();
      out.push(combined.length === 1
        ? { trigger: "combined", account: null, kind: null, name: combined[0].name, type: "text/csv", text: combined[0].text }
        : { trigger: "combined", account: null, kind: null, name: zipName("combined"), type: "application/zip", files: combined.map(entry) });
      out.push({ trigger: "zip", account: null, kind: null, name: zipName("csv"), type: "application/zip", files: allFiles().map(entry) });
      return out;
    }

    return { modeOf, earliest, span, exportsFor, fileFor, accountsFile, combinedFiles, zipName, cards, allFiles, downloads };
  }

  return { create };
});
