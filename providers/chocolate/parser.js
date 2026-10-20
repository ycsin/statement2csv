// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Chocolate Finance monthly statement parser. Each currency account (SGD
// Account, USD Account, …) is a bank-like account: every transaction is
// exported and each month is reconciled against the statement's start and end
// balance. The "Chocolate Managed Account" pages (underlying funds) don't change
// the account balance and are not exported.
// Works in the browser (window.ChocParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./layout.js"), require("../../core/export.js"));
  else root.ChocParser = factory(root.MariLayout, root.StatementExport);
})(typeof self !== "undefined" ? self : this, function (L, E) {
  "use strict";

  const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  // Amounts: "S$1,234.56", "US$9,876.54", "-S$1,111.11", "+US$2,222.22" (letters before "$" name the currency).
  const MONEY_RE = /^([+-])?([A-Z]{0,3})\$([\d,]+\.\d{2})$/;
  const PREFIX = { S: "SGD", US: "USD", HK: "HKD", A: "AUD", C: "CAD", NZ: "NZD" };
  const { round2, pad } = E;
  const ZERO = 0.005;
  const iso = (d, mon, y) => `${y}-${pad(MONTHS[mon])}-${pad(d)}`;

  function money(s) {
    const m = String(s).trim().match(MONEY_RE);
    if (!m) return null;
    const v = parseFloat(m[3].replace(/,/g, ""));
    return { value: m[1] === "-" ? -v : v, currency: PREFIX[m[2]] || (m[2] ? m[2] : null) };
  }

  // ---- one statement --------------------------------------------------------
  // pages: [[{ str, x, y, w, h }, ...], ...] (pdf.js text items per page)
  function parseStatement(pages) {
    const lines = [];
    pages.forEach((items, page) => { for (const l of L.pageLines(items)) lines.push({ ...l, page }); });
    const text = lines.map((l) => l.text).join("\n");
    const p = text.match(/(\d{1,2}) ([A-Z][a-z]{2}) (\d{4}) [–-] (\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/);
    if (!p || !/chocolate/i.test(text)) return { error: "not a Chocolate Finance statement (no statement period found)" };
    const st = { monthEnd: iso(p[4], p[5], p[6]), year: p[6], endMonth: p[5], accounts: {}, problems: [] };

    // Older statements cover one account: "<Month> <Year> Statement  SGD".
    const single = (text.match(/Statement\s+([A-Z]{3})\b/) || [])[1];
    let ccy = single || null, acct = null, table = null, wantSummary = false;
    const account = (c) => (st.accounts[c] = st.accounts[c] || { currency: c, opening: null, closing: null, rows: [] });
    const rows = [];
    let current = null, prev = null;
    for (const l of lines) {
      const head = l.text.match(/^([A-Z]{3}) Account$/);
      if (head) { ccy = head[1]; acct = account(ccy); table = null; continue; }
      if (!acct && ccy && /^Start of month balance/.test(l.text)) acct = account(ccy);
      if (/^Start of month balance\s+End of month balance/.test(l.text)) { wantSummary = true; continue; }
      if (wantSummary && acct) {
        const v = l.items.map((it) => money(it.s)).filter(Boolean);
        if (v.length >= 2) { acct.opening = v[0].value; acct.closing = v[1].value; wantSummary = false; }
        continue;
      }
      if (/^Date\s+Transaction\s+In\s+Out/.test(l.text) && acct) {
        const cols = Object.fromEntries(l.items.map((it) => [it.s, it]));
        table = { acct, cols, balRight: null };
        current = null;
        continue;
      }
      if (table && /^(Balance after|transaction)$/.test(l.text.trim())) {
        if (l.text.trim() === "transaction") table.balRight = l.items[0].x + l.items[0].w;
        continue;
      }
      if (/^(Chocolate Managed Account|Breakdown of returns|Page \d+ of \d+|NOTES AND DISCLAIMERS|Your total)/.test(l.text) || head) { table = null; continue; }
      if (!table) continue;
      // A row starts at a line carrying a date; following smaller lines are its notes.
      const dateIt = l.items.find((it) => it.x < table.cols.Transaction.x - 5 && /^\d{1,2} [A-Z][a-z]{2}$/.test(it.s));
      if (dateIt) {
        current = { table, main: l, notes: [], date: dateIt.s };
        rows.push(current);
      } else if (current && l.page === current.main.page && current.main.y - l.y < 3 * l.h) {
        current.notes.push(l);
      }
      prev = l;
    }

    for (const r of rows) parseRow(st, r);
    for (const [c, a] of Object.entries(st.accounts)) if (a.opening == null) st.problems.push(`${c} account: start/end balance not found`);
    return st;
  }

  function parseRow(st, r) {
    const { cols } = r.table;
    const inRight = cols.In.x + cols.In.w, outRight = cols.Out.x + cols.Out.w;
    const balRight = r.table.balRight || outRight + 120;
    const items = r.main.items;
    const amounts = items.filter((it) => money(it.s));
    const desc = items.filter((it) => !money(it.s) && it.x >= cols.Transaction.x - 5).map((it) => it.s).join(" ");
    let amount = null;
    for (const it of amounts) {
      const right = it.x + it.w;
      const near = [["in", Math.abs(right - inRight)], ["out", Math.abs(right - outRight)], ["balance", Math.abs(right - balRight)]].sort((a, b) => a[1] - b[1])[0][0];
      if (near === "balance") continue;
      const m = money(it.s);
      // Internal sign convention: inflow negative, outflow positive.
      amount = { value: near === "in" ? -Math.abs(m.value) : Math.abs(m.value), currency: m.currency || r.table.acct.currency };
    }
    if (!amount) { st.problems.push(`row not understood: ${r.date} ${desc}`); return; }
    const [d, mon] = r.date.split(" ");
    const year = MONTHS[mon] > MONTHS[st.endMonth] ? String(st.year - 1) : st.year;
    r.table.acct.rows.push({
      date: iso(d, mon, year), amount: round2(amount.value), currency: r.table.acct.currency, name: desc,
      notes: r.notes.map((n) => n.items.map((it) => it.s).join(" ")).join(" · "), kind: "bank",
    });
  }

  // ---- all statements -------------------------------------------------------
  // statements: [{ id, pages }], any order. config per account id ("account:SGD"):
  // { name, kind, mergeInto, exclude }.
  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], months = [];
    const parsed = [];
    for (const s of statements) {
      const st = parseStatement(s.pages);
      if (st.error) { errors.push({ id: s.id, error: st.error }); continue; }
      parsed.push({ ...st, id: s.id });
    }
    parsed.sort((a, b) => a.monthEnd.localeCompare(b.monthEnd));
    const seen = new Set();
    const raw = {};
    for (const st of parsed) {
      const month = st.monthEnd.slice(0, 7);
      if (seen.has(month)) { errors.push({ id: st.id, error: `duplicate statement for ${month}, ignored` }); continue; }
      seen.add(month);
      months.push({ id: st.id, month });
      for (const pr of st.problems) warnings.push(`${month}: ${pr}`);
      for (const [c, a] of Object.entries(st.accounts)) {
        const id = `account:${c}`;
        const r = (raw[id] = raw[id] || { id, label: `${c} Account`, kind: "bank", currency: c, names: [`${c} Account`], months: {}, cash: [], firstMonth: month, lastMonth: month });
        r.lastMonth = month;
        r.months[month] = { monthEnd: st.monthEnd, opening: a.opening, closing: a.closing, cashflow: 0, fx: null };
        r.cash.push(...a.rows);
        const net = round2(a.rows.reduce((s, x) => s - x.amount, 0));
        if (a.opening != null && Math.abs(round2(a.opening + net) - a.closing) >= ZERO)
          warnings.push(`${month}: ${c} account transactions (net ${net.toFixed(2)}) don't take ${a.opening} to ${a.closing}`);
      }
    }

    const rootOf = (id) => { const path = new Set(); while (config[id] && config[id].mergeInto && raw[config[id].mergeInto] && !path.has(id)) { path.add(id); id = config[id].mergeInto; } return id; };
    const portfolios = Object.values(raw).sort((a, b) => a.firstMonth.localeCompare(b.firstMonth) || a.label.localeCompare(b.label));
    const accounts = {};
    for (const r of portfolios) {
      const root = raw[rootOf(r.id)];
      if ((config[root.id] || {}).exclude || (config[r.id] || {}).exclude) { r.account = null; continue; }
      const name = ((config[root.id] || {}).name || "").trim() || root.label;
      r.account = name;
      const a = (accounts[name] = accounts[name] || { kind: (config[root.id] || {}).kind || root.kind, currency: root.currency, valuations: [], trades: [], cash: [], months: {}, portfolios: [] });
      a.portfolios.push(r.id);
      a.cash.push(...r.cash);
      for (const [m, v] of Object.entries(r.months)) {
        const t = (a.months[m] = a.months[m] || { monthEnd: v.monthEnd, opening: 0, closing: 0, cashflow: 0, fx: null });
        t.opening = round2(t.opening + v.opening); t.closing = round2(t.closing + v.closing);
      }
    }
    for (const a of Object.values(accounts)) {
      a.cash.sort((x, y) => x.date.localeCompare(y.date));
      a.valuations = Object.values(a.months).map((m) => [m.monthEnd, m.closing]).sort(([x], [y]) => x.localeCompare(y));
    }
    const gaps = E.monthGaps(months.map((m) => m.month));
    const first = months.length ? months[0].month : null;
    const firstOpenings = first ? Object.entries(accounts).filter(([, a]) => a.months[first] && Math.abs(a.months[first].opening) >= ZERO)
      .map(([name, a]) => ({ account: name, month: first, opening: a.months[first].opening })) : [];
    return {
      accounts, months, skipped: {}, skippedRows: [], reconciled: [], errors, warnings, gaps, firstOpenings, baseCurrency: "SGD",
      portfolios: portfolios.map((r) => ({ id: r.id, label: r.label, names: r.names, firstMonth: r.firstMonth, lastMonth: r.lastMonth, kind: r.kind, currency: r.currency, account: r.account })),
      unmapped: {},
    };
  }

  return { parseStatement, parseStatements };
});
