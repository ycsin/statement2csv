// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Example Bank transaction-history CSV (template, synthetic format; docs/CONTRACT.md, parser).
// One export per file, one account per export, rows oldest first:
//   Example Bank transaction history
//   Account,<number>,<CCY>
//   Date,Description,Amount,Balance
//   <YYYY-MM-DD>,<description>,<amount, inflow positive>,<balance after the row>
// Cells follow RFC 4180 on one line: a cell may be quoted, with "" for a quote inside it (a
// line break inside a cell is not supported). Exports may overlap; each row counts once. One
// portfolio per account number and currency: id "<number>:<CCY>" (the format frozen.js's
// configIdPattern describes), label "Example #<last 3 digits>", with the currency and then the
// whole number added where portfolios would share a label (distinctLabels). Every row is
// checked against the running balance of its export, and what does not add up becomes a
// warning.
// Works in the browser (self.ExampleCsvParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../core/export.js"), require("../../core/assemble.js"));
  else root.ExampleCsvParser = factory(root.StatementExport, root.StatementAssemble);
})(typeof self !== "undefined" ? self : this, function (E, A) {
  "use strict";
  const { round2, lastDayOf, prevMonth } = E;
  const TITLE = "Example Bank transaction history";
  const HEADER = "Date,Description,Amount,Balance";
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const NUMBER_RE = /^-?\d+(\.\d+)?$/;
  const CENT = 0.005;
  // Code-point order: the same in every browser and locale (never localeCompare without a locale).
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const nextMonth = (m) => {
    let [y, n] = m.split("-").map(Number);
    if (++n > 12) {
      n = 1;
      y++;
    }
    return `${y}-${String(n).padStart(2, "0")}`;
  };

  // One CSV line as its cells (RFC 4180 quoting), each trimmed.
  function cells(line) {
    const out = [];
    let cell = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch !== "\"") cell += ch;
        else if (line[i + 1] === "\"") {
          cell += "\"";
          i++;
        } else inQuotes = false;
      } else if (ch === ",") {
        out.push(cell.trim());
        cell = "";
      } else if (ch === "\"" && !cell.trim()) {
        cell = "";
        inQuotes = true;
      } else cell += ch;
    }
    out.push(cell.trim());
    return out;
  }

  // One export: {number, currency, rows: [{date, name, amount, balance}], problems} or {error}.
  function parseExport(text) {
    const lines = String(text).split(/\r?\n/).filter((l) => l.trim()).map(cells);
    if ((lines[0] || [])[0] !== TITLE) return { error: "not an Example Bank transaction history CSV" };
    const [tag, number, currency] = lines[1] || [];
    if (tag !== "Account" || !number || number.includes(":") || !/^[A-Z]{3}$/.test(currency || "") || (lines[2] || []).join(",") !== HEADER) {
      return { error: "no account line or column header" };
    }
    const rows = [], problems = [];
    for (const l of lines.slice(3)) {
      const [date, name, amount, balance] = l;
      if (l.length !== 4 || !DATE_RE.test(date) || !NUMBER_RE.test(amount) || !NUMBER_RE.test(balance)) {
        problems.push(`row not understood: ${l.join(",")}`);
        continue;
      }
      const row = { date, name, amount: Number(amount), balance: Number(balance) };
      const prev = rows[rows.length - 1];
      if (prev && row.date < prev.date) problems.push(`${row.date}: "${row.name}" comes after a row of ${prev.date} (rows must be oldest first)`);
      else if (prev && Math.abs(round2(prev.balance + row.amount) - row.balance) >= CENT) {
        problems.push(`${row.date}: the balance ${row.balance.toFixed(2)} after "${row.name}" is not the running balance ${round2(prev.balance + row.amount).toFixed(2)}`);
      }
      rows.push(row);
    }
    return { number, currency, rows, problems };
  }

  // An account's labels, shortest first: "Example #<last 3 digits>", then with the currency,
  // then with the whole number and the currency, which no other portfolio id can have.
  const labelForms = (number, currency) => [`Example #${number.slice(-3)}`, `Example #${number.slice(-3)} ${currency}`, `Example #${number} ${currency}`];

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
  function exportOf(s) {
    if (s === null || typeof s !== "object") return parseExport("");
    if (!read.has(s)) read.set(s, parseExport(s.csv));
    return read.get(s);
  }

  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], raw = {}, months = [], seen = new Set();
    const parsed = [];
    for (const s of statements) {
      const st = exportOf(s);
      if (st.error) errors.push({ id: String(s && s.id), error: st.error });
      else parsed.push({ s, st });
    }
    // Oldest export first (code-point order on the first row's date, then the file name), so
    // the order the files were added in never matters.
    const first = (st) => (st.rows.length ? st.rows[0].date : "");
    parsed.sort((a, b) => cmp(first(a.st), first(b.st)) || cmp(a.s.id, b.s.id));
    // Every export with rows gives its account a portfolio; its label is decided first.
    const forms = new Map();
    for (const { st } of parsed) if (st.rows.length) forms.set(`${st.number}:${st.currency}`, labelForms(st.number, st.currency));
    const form = distinctLabels(forms);
    let used = 0;
    for (const { s, st } of parsed) {
      used++;
      for (const p of st.problems) warnings.push(`${s.id}: ${p}`);
      if (!st.rows.length) continue;
      const id = `${st.number}:${st.currency}`, label = forms.get(id)[form.get(id)];
      const r = (raw[id] = raw[id] || { label, names: [label], kind: "bank", currency: st.currency, months: {}, cash: [], trades: [] });
      for (const x of st.rows) {
        const key = `${x.date}|${x.name}|${x.amount}|${x.balance}`;
        if (seen.has(`${id}|${key}`)) continue; // overlapping exports: each row once
        seen.add(`${id}|${key}`);
        const m = x.date.slice(0, 7);
        const t = (r.months[m] = r.months[m] || { monthEnd: lastDayOf(m), opening: round2(x.balance - x.amount), closing: x.balance, fx: null });
        t.closing = x.balance;
        r.cash.push({ date: x.date, amount: -x.amount, currency: st.currency, name: x.name, notes: "", kind: "bank" });
      }
      // Months inside this export's span without rows are covered, not missing.
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
});
