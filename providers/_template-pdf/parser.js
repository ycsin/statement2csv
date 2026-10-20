// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Example Bank monthly statement PDF (template, synthetic format; docs/CONTRACT.md, parser). One
// statement per month covers every account, each in a section; StatementLayout.pageLines gives
// the text lines, with the cells of a line joined by two spaces:
//   Example Bank
//   Monthly statement
//   Statement period  DD/MM/YYYY to DD/MM/YYYY
//   Account  <name>  <number>  <CCY>             a section per account, on any page
//   Opening balance  <amount>
//   Date  Description  Amount                    (the table header; ignored)
//   DD/MM/YYYY  <description>  <amount>          a row, inflow positive
//   DD/MM/YYYY  <description>                    a row without an amount: not exported
//   Closing balance  <amount>                    ends the section
// Amounts look like 1,234.56 or -45.20. Other lines (page footers, a header repeated on the next
// page) are ignored. One portfolio per account number and currency: id "<number>:<CCY>" (the
// format frozen.js's configIdPattern describes), label "<name> <last 4 digits>" with its newest
// name, and the currency and then the whole number added where portfolios would share a label
// (distinctLabels); its names list each name it had, oldest first, in the same form. A second
// statement for a month is an error, whichever file came first.
// Works in the browser (self.ExampleBankParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../core/layout.js"), require("../../core/export.js"), require("../../core/assemble.js"));
  else root.ExampleBankParser = factory(root.StatementLayout, root.StatementExport, root.StatementAssemble);
})(typeof self !== "undefined" ? self : this, function (L, E, A) {
  "use strict";
  const TITLE = "Example Bank";
  const SUBTITLE = "Monthly statement";
  const DATE = "(\\d{2})/(\\d{2})/(\\d{4})";
  const AMOUNT = "(-?\\d{1,3}(?:,\\d{3})*\\.\\d{2})";
  const PERIOD_RE = new RegExp(`^Statement period  ${DATE} to ${DATE}$`);
  const ACCOUNT_RE = /^Account  (.+)  (\d+)  ([A-Z]{3})$/;
  const OPENING_RE = new RegExp(`^Opening balance  ${AMOUNT}$`);
  const CLOSING_RE = new RegExp(`^Closing balance  ${AMOUNT}$`);
  const ROW_RE = new RegExp(`^${DATE}  (.+)  ${AMOUNT}$`);
  const DATED_RE = new RegExp(`^${DATE}  (.+)$`);
  const CENT = 0.005;
  // Code-point order: the same in every browser and locale (never localeCompare without a locale).
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const iso = (d, m, y) => `${y}-${m}-${d}`;
  const amount = (s) => Number(s.replace(/,/g, ""));

  // One statement: {month, sections: [{name, number, currency, opening, closing, rows,
  // unpriced}]} or {error}.
  function readStatement(s) {
    const pages = s !== null && typeof s === "object" && Array.isArray(s.pages) ? s.pages : [];
    const lines = pages.flatMap((items) => L.pageLines(Array.isArray(items) ? items : []).map((l) => l.text));
    if (lines[0] !== TITLE || lines[1] !== SUBTITLE) return { error: "not an Example Bank monthly statement" };
    let period = null, section = null;
    const sections = [];
    for (const line of lines) {
      let m;
      if (!period && (m = PERIOD_RE.exec(line))) period = { from: iso(m[1], m[2], m[3]), to: iso(m[4], m[5], m[6]) };
      else if ((m = ACCOUNT_RE.exec(line))) sections.push((section = { name: m[1], number: m[2], currency: m[3], opening: null, closing: null, rows: [], unpriced: [] }));
      else if (!section) continue;
      else if ((m = OPENING_RE.exec(line))) section.opening = amount(m[1]);
      else if ((m = CLOSING_RE.exec(line))) {
        section.closing = amount(m[1]);
        section = null;
      } else if ((m = ROW_RE.exec(line))) section.rows.push({ date: iso(m[1], m[2], m[3]), name: m[4], amount: amount(m[5]) });
      else if ((m = DATED_RE.exec(line))) section.unpriced.push({ date: iso(m[1], m[2], m[3]), detail: m[4] });
    }
    if (!period) return { error: "no statement period" };
    if (period.from.slice(0, 7) !== period.to.slice(0, 7)) return { error: "the statement period is not one calendar month" };
    if (sections.some((x) => x.opening === null || x.closing === null)) return { error: "an account section has no opening or closing balance" };
    return { month: period.to.slice(0, 7), sections };
  }

  // An account's labels for one of its names, shortest first: "<name> <last 4 digits>", then
  // with the currency, then with the whole number and the currency, which no other portfolio id
  // can have.
  const labelForms = (x) => [`${x.name} ${x.number.slice(-4)}`, `${x.name} ${x.number.slice(-4)} ${x.currency}`, `${x.name} ${x.number} ${x.currency}`];

  // A label is its account's default name (in the file names and the Accounts CSV), and
  // StatementAssemble.build puts portfolios with equal labels into one account, as it does with
  // two renamed to one name. So each portfolio whose label another one shares takes its next
  // form, until no label is shared: distinct ids never merge unless the user merges them, and
  // since every sharer changes, the order the files were added in never matters.
  //   forms: Map id -> its label forms -> Map id -> the index of the form it takes
  function distinctLabels(forms) {
    const at = new Map([...forms.keys()].map((id) => [id, 0]));
    let again = true;
    while (again) {
      again = false;
      const uses = new Map();
      for (const [id, f] of forms) uses.set(f[at.get(id)], (uses.get(f[at.get(id)]) || 0) + 1);
      for (const [id, f] of forms) {
        if (uses.get(f[at.get(id)]) > 1 && at.get(id) < f.length - 1) {
          at.set(id, at.get(id) + 1);
          again = true;
        }
      }
    }
    return at;
  }

  // The app parses again on every configurator change: read each statement once.
  const read = new WeakMap();
  function statementOf(s) {
    if (s === null || typeof s !== "object") return readStatement(null);
    if (!read.has(s)) read.set(s, readStatement(s));
    return read.get(s);
  }

  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], raw = {}, months = [], skippedRows = [];
    const parsed = [];
    for (const s of statements) {
      const st = statementOf(s);
      if (st.error) errors.push({ id: String(s && s.id), error: st.error });
      else parsed.push({ s, st });
    }
    // Month order, then the file name (code-point order): the first statement of a month wins,
    // whatever order the files were added in.
    parsed.sort((a, b) => cmp(a.st.month, b.st.month) || cmp(a.s.id, b.s.id));
    const seen = new Set(), used = [];
    for (const { s, st } of parsed) {
      if (seen.has(st.month)) errors.push({ id: s.id, error: `duplicate statement for ${st.month}, ignored` });
      else {
        seen.add(st.month);
        used.push({ s, st });
      }
    }
    // The form each account's labels take is decided first, from its newest name, so every
    // statement's warnings and skipped rows already name the account in that form.
    const newest = new Map();
    for (const { st } of used) for (const x of st.sections) newest.set(`${x.number}:${x.currency}`, x);
    const form = distinctLabels(new Map([...newest].map(([id, x]) => [id, labelForms(x)])));
    for (const { s, st } of used) {
      months.push({ month: st.month, id: s.id });
      for (const x of st.sections) {
        const id = `${x.number}:${x.currency}`, label = labelForms(x)[form.get(id)];
        const r = (raw[id] = raw[id] || { label, names: [], kind: "bank", currency: x.currency, months: {}, cash: [], trades: [] });
        if (r.names[r.names.length - 1] !== label) r.names.push(label); // oldest -> newest
        r.label = label;
        r.months[st.month] = { monthEnd: E.lastDayOf(st.month), opening: x.opening, closing: x.closing, fx: null };
        let balance = x.opening;
        for (const row of x.rows) {
          r.cash.push({ date: row.date, amount: -row.amount, currency: x.currency, name: row.name, notes: "", kind: "bank" });
          balance = E.round2(balance + row.amount);
        }
        if (Math.abs(balance - x.closing) >= CENT) {
          warnings.push(`${st.month}: ${label}: the rows add up to ${balance.toFixed(2)}, the closing balance is ${x.closing.toFixed(2)}`);
        }
        for (const u of x.unpriced) skippedRows.push({ date: u.date, category: "no amount", detail: u.detail, account: label });
      }
    }
    return A.build({ raw, config, months, statements: used.length, errors, warnings, skippedRows });
  }

  return { parseStatements };
});
