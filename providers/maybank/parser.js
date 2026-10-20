// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Maybank (Malaysia) deposit account statement parser. Each account is a
// bank-like account: every transaction is exported, checked against the
// running balance printed on its row, and each statement against its beginning
// and ending balance and its total credit and debit. Card pre-authorisations
// refunded in the same statement (a hold and its release) are left out.
// Works in the browser (window.MaybankParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../core/layout.js"), require("../../core/export.js"));
  else root.MaybankParser = factory(root.StatementLayout, root.StatementExport);
})(typeof self !== "undefined" ? self : this, function (L, E) {
  "use strict";

  const { round2, pad } = E;
  const ZERO = 0.005;
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));
  const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{2})$/;
  const iso = (s) => { const m = s.match(DATE_RE); return `20${m[3]}-${m[2]}-${m[1]}`; };
  const AMOUNT_RE = /^([\d,]+\.\d{2})([+-])$/;
  const BAL_RE = /^-?[\d,]+\.\d{2}-?$/;
  const bal = (s) => (s.endsWith("-") || s.startsWith("-") ? -1 : 1) * num(s.replace(/-/g, ""));
  const ACCOUNT_RE = /^\d{6}-\d{6}$/;
  const nextMonth = (m) => { let [y, mo] = m.split("-").map(Number); mo += 1; if (mo > 12) { mo = 1; y += 1; } return `${y}-${pad(mo)}`; };
  const prevMonth = (m) => E.prevMonth(m);
  const title = (s) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase()).replace(/-I$/, "-i");

  // ---- one statement --------------------------------------------------------
  // pages: [[{ str, x, y, w, h }, ...], ...] (pdf.js text items per page).
  // Each page: a header (bank, statement date, account number and type), the
  // column headings ending in "ENTRY DATE ... STATEMENT BALANCE", the rows, then
  // a footer starting "Perhatian / Note". Rows: "dd/mm/yy  TYPE  1,234.56-  9,876.54"
  // ("-" debit, "+" credit), then description lines under the type.
  function parseStatement(pages) {
    const text = pages.map((items) => L.pageLines(items).map((l) => l.text).join("\n")).join("\n");
    if (!/Malayan Banking Berhad|Maybank/i.test(text) || !/BEGINNING BALANCE/.test(text) || !/ENTRY DATE/.test(text))
      return { error: "not a Maybank account statement" };
    const st = { tables: [], problems: [] };
    let table = null, row = null, done = false;
    for (const items of pages) {
      const lines = L.pageLines(items);
      // Header: statement date, account number and type for this page.
      let number = null, type = null, inRows = false;
      for (const l of lines) {
        const t = l.text;
        if (!inRows) {
          const d = t.match(/:\s*(\d{2}\/\d{2}\/\d{2})$/);
          if (d && !st.monthEnd) st.monthEnd = iso(d[1]);
          const no = l.items.find((it) => ACCOUNT_RE.test(it.s));
          if (no) number = no.s;
          const ty = l.items.find((it) => it.x > 300 && /\bACCOUNT(-I)?\b/.test(it.s) && !/NOMBOR|^ACCOUNT$/.test(it.s));
          if (ty) type = ty.s;
          if (/^ENTRY DATE\b.*BALANCE$/.test(t)) inRows = true;
          continue;
        }
        if (/^Perhatian|^Perhation|^Note\b/i.test(t)) break;
        if (done) continue;
        if (number && (!table || table.number !== number)) {
          table = st.tables.find((x) => x.number === number) || null;
          if (!table) { table = { key: number, number, name: title(type || "Account"), currency: "MYR", opening: null, running: null, closing: null, rows: [], credit: 0, debit: 0, totals: {} }; st.tables.push(table); }
          row = null;
        }
        if (!table) continue;
        const last = l.items[l.items.length - 1];
        if (/^BEGINNING BALANCE/.test(t)) { table.opening = table.running = bal(last.s); continue; }
        const end = t.match(/^ENDING BALANCE\s*:\s*(-?[\d,]+\.\d{2}-?)/);
        if (end) { table.closing = bal(end[1]); row = null; continue; }
        const tot = t.match(/^TOTAL (CREDIT|DEBIT)\s*:\s*([\d,]+\.\d{2})/);
        if (tot) { table.totals[tot[1].toLowerCase()] = num(tot[2]); continue; }
        const first = l.items[0];
        if (DATE_RE.test(first.s) && first.x < 80) {
          const amt = l.items.find((it) => AMOUNT_RE.test(it.s));
          const b = l.items.length > 2 && BAL_RE.test(last.s) && last !== amt ? last : null;
          if (!amt) { st.problems.push(`${iso(first.s)} ${t}: no amount`); row = null; continue; }
          const [, a, sign] = amt.s.match(AMOUNT_RE);
          const amount = num(a);
          const desc = l.items.filter((it) => it !== first && it !== amt && it !== b).map((it) => it.s).join(" ").trim();
          if (table.running == null) { st.problems.push(`${table.name}: rows before the beginning balance`); table.opening = table.running = 0; }
          table.running = round2(table.running + (sign === "+" ? amount : -amount));
          if (sign === "+") table.credit = round2(table.credit + amount); else table.debit = round2(table.debit + amount);
          if (b && Math.abs(bal(b.s) - table.running) >= ZERO) st.problems.push(`${table.name} ${iso(first.s)} ${desc}: ${sign}${amount} doesn't take the balance to ${b.s} (expected ${table.running})`);
          if (b) table.running = bal(b.s);
          // Internal sign convention: inflow negative.
          row = { date: iso(first.s), amount: round2(sign === "+" ? -amount : amount), balance: table.running, desc, notes: [] };
          table.rows.push(row);
          continue;
        }
        if (row && first.x > 80) {
          const s = l.items.map((it) => it.s).filter((s) => s !== "*").join(" ").replace(/\s*\*$/, "").trim();
          if (s) row.notes.push(s);
        }
      }
    }
    if (!st.monthEnd) return { error: "no statement date found" };
    if (!st.tables.length) return { error: "no account found in this statement" };
    for (const x of st.tables) {
      if (x.closing == null) st.problems.push(`${x.name}: no ending balance`);
      else if (Math.abs(x.closing - x.running) >= ZERO) st.problems.push(`${x.name}: rows end at ${x.running}, ending balance ${x.closing}`);
      for (const k of ["credit", "debit"]) if (x.totals[k] != null && Math.abs(x.totals[k] - x[k]) >= ZERO) st.problems.push(`${x.name}: total ${k} ${x.totals[k]}, rows add up to ${x[k]}`);
      for (const r of x.rows) nameRow(r);
    }
    return st;
  }

  // Name: the transaction type plus the first description line (merchant, payee
  // or payer); the notes are the other lines, without one that repeats the type.
  function nameRow(r) {
    const notes = r.notes.filter((n, i) => !(i === r.notes.length - 1 && n.toUpperCase() === r.desc.toUpperCase() && i > 0));
    const cp = notes.length && /[A-Za-z]{2}/.test(notes[0]) ? notes[0] : "";
    r.name = cp ? `${r.desc} - ${cp}` : r.desc;
    r.notes = cp ? notes.slice(1) : notes;
  }

  // Refunded card pre-authorisations: a "PRE-AUTH DEBIT" and a "PRE-AUTH REFUND"
  // of the same amount in the same statement (the refund is sometimes listed
  // first). Both are left out (they net to zero inside the month); holds without
  // a refund are the actual charges and are kept.
  function preauthPairs(rows) {
    const drop = new Set();
    const merchant = (s) => s.name.replace(/^PRE-AUTH (DEBIT|REFUND)( - )?/, "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    rows.forEach((r, i) => {
      if (!/^PRE-AUTH REFUND\b/.test(r.desc)) return;
      const cands = rows.map((d, j) => j).filter((j) => !drop.has(j) && /^PRE-AUTH DEBIT\b/.test(rows[j].desc) && Math.abs(rows[j].amount + r.amount) < ZERO);
      cands.sort((x, y) => (merchant(rows[y]) === merchant(r)) - (merchant(rows[x]) === merchant(r)) || Math.abs(x - i) - Math.abs(y - i));
      if (cands.length) { drop.add(cands[0]); drop.add(i); }
    });
    return drop;
  }

  // ---- all statements -------------------------------------------------------
  // statements: [{ id, pages }], any order. config per account id
  // ("123456-789012"): { name, kind, mergeInto, exclude }.
  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], months = [], late_ = [], skippedRows = [];
    let count = 0;
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
      // One statement per account per month.
      const dup = `${month}|${st.tables.map((t) => t.key).join(",")}`;
      if (seen.has(dup)) { errors.push({ id: st.id, error: `duplicate statement for ${month}, ignored` }); continue; }
      seen.add(dup);
      count++;
      if (!months.some((x) => x.month === month)) months.push({ id: st.id, month });
      for (const pr of st.problems) warnings.push(`${month}: ${pr}`);
      for (const tb of st.tables) {
        const id = tb.key;
        const label = `${tb.name} #${tb.number.slice(-4)}`;
        const r = (raw[id] = raw[id] || { id, label, kind: "bank", currency: tb.currency, names: [], months: {}, cash: [], keys: new Set(), firstMonth: month, lastMonth: month });
        r.label = label;
        if (!r.names.includes(tb.name)) r.names.push(tb.name);
        if (month > r.lastMonth) r.lastMonth = month;
        const drop = preauthPairs(tb.rows);
        // A statement dated mid-month covers part of the month before: split its
        // rows into months by the running balance. Rows already seen in an
        // earlier statement are not exported twice.
        let running = tb.opening;
        const span = [];
        const start = tb.rows.length && tb.rows[0].date.slice(0, 7) < month ? tb.rows[0].date.slice(0, 7) : month;
        for (let m = start; m <= month; m = nextMonth(m)) span.push(m);
        for (const m of span) {
          const opening = running;
          tb.rows.forEach((x, i) => {
            if (!x.date.startsWith(m)) return;
            running = x.balance;
            const k = `${x.date}|${x.amount}|${x.balance}|${x.name}`;
            if (r.keys.has(k) || Math.abs(x.amount) < ZERO) return;
            r.keys.add(k);
            if (drop.has(i)) { skippedRows.push({ date: x.date, category: "refunded pre-authorisation", detail: x.name, account: label }); return; }
            r.cash.push({ date: x.date, amount: x.amount, currency: tb.currency, name: x.name, notes: x.notes.join(" · "), kind: "bank" });
          });
          const closing = m === month ? tb.closing : running;
          const prev = r.months[m];
          const before = r.months[prevMonth(m)];
          if (m === span[0] && !prev && before && Math.abs(before.closing - opening) >= ZERO)
            warnings.push(`${month}: ${label} opens at ${opening}, the previous statement closed at ${before.closing}`);
          if (m < month && prev) {
            // Rows dated in an earlier month that its own statement didn't
            // include: keep their date and count them in that month's closing.
            const late = round2(closing - opening);
            if (Math.abs(late) >= ZERO) {
              prev.closing = round2(prev.closing + late);
              late_.push({ month: m, statement: month, account: label, amount: late });
            }
            continue;
          }
          const shifted = m === month && span.length > 1 && r.months[prevMonth(m)] ? r.months[prevMonth(m)].closing : opening;
          r.months[m] = { monthEnd: m === month ? st.monthEnd : E.lastDayOf(m), opening: shifted, closing, cashflow: 0, fx: null };
          if (m < r.firstMonth) r.firstMonth = m;
        }
      }
    }

    // Accounts with no transactions and a zero balance throughout are left out.
    for (const [id, r] of Object.entries(raw)) if (!r.cash.length && Object.values(r.months).every((m) => Math.abs(m.closing || 0) < ZERO && Math.abs(m.opening || 0) < ZERO)) delete raw[id];

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
        if (v.partial) t.partial = true;
      }
    }
    for (const a of Object.values(accounts)) {
      a.cash.sort((x, y) => x.date.localeCompare(y.date));
      a.valuations = Object.values(a.months).map((m) => [m.monthEnd, m.closing]).sort(([x], [y]) => x.localeCompare(y));
    }
    months.sort((a, b) => a.month.localeCompare(b.month));
    const gaps = E.monthGaps(months.map((m) => m.month));
    // Months with a statement for some accounts but not for another account that
    // was open before and after.
    const loaded = new Set(months.map((m) => m.month));
    const lastClosingBefore = (r, m) => { const k = Object.keys(r.months).filter((x) => x < m).sort().pop(); return k ? r.months[k].closing : 0; };
    const partialMonths = [...new Set(Object.values(raw).flatMap((r) => [...loaded].filter((m) => m > r.firstMonth && m < r.lastMonth && !r.months[m] && Math.abs(lastClosingBefore(r, m)) >= ZERO)))].sort();
    const first = months.length ? months[0].month : null;
    const firstOpenings = first ? Object.entries(accounts).filter(([, a]) => a.months[first] && Math.abs(a.months[first].opening) >= ZERO)
      .map(([name, a]) => ({ account: name, month: first, opening: a.months[first].opening })) : [];
    return {
      accounts, months, skipped: {}, skippedRows, late: late_, statements: count, errors, warnings, gaps, firstOpenings, partialMonths, baseCurrency: "MYR",
      portfolios: portfolios.map((r) => ({ id: r.id, label: r.label, names: r.names, firstMonth: r.firstMonth, lastMonth: r.lastMonth, kind: r.kind, currency: r.currency, account: r.account })),
    };
  }

  return { parseStatement, parseStatements };
});
