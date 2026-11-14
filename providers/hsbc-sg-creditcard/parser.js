// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// HSBC Singapore credit card statement PDF (docs/CONTRACT.md, parser). One statement per card
// account per billing cycle. The first page has two columns: the transactions on the left and
// the account summary on the right (cells from x = 380 on), so the rows are read from the left
// column only. StatementLayout.pageLines gives the text lines, the cells of a line joined by two
// spaces:
//   HSBC VISA REVOLUTION                           the card product, at the top of each page
//   … From DD MMM YYYY to DD MMM YYYY …            the statement period
//   DATE  DATE  DESCRIPTION  AMOUNT(SGD)           the table header; the rows follow (each page)
//   <Cardholder> NNNN-XXXX-XXXX-NNNN              the card the rows below were made with
//   Previous Statement Balance  1,234.56[CR]
//   DD Mon  DD Mon  <merchant>  [<city>]  1,234.56[CR]   posting date, transaction date
//   <city>  <country>  [<CCY> 12.34]              the rest of the place, and a foreign amount
//   Continued on next page                         ends the table on this page
//   Total Due  1,234.56[CR]                        the new balance; ends the table
// and in the right column "Payments & Credits  1,234.56CR" and "Purchases & Debits  1,234.56".
// Balances are what is owed: "CR" marks a credit balance, and a row with "CR" is a credit
// (payment, refund). The card account is kept as a bank-like account whose balance is minus
// what is owed: a purchase is an outflow, a payment an inflow. Rows are dated by their posting
// date, the date the statement's balance counts them on (the transaction date goes in the
// notes when it differs), and the year comes from the statement period.
//
// A cycle does not follow the calendar, so calendar months are put together from the
// statements around them: month m closes at the balance of the statement whose period holds
// m's last day on that day, or, without that statement, at the new balance of the newest
// statement ending in m, on its last day (the month ends there until the next statement
// comes). It opens at the balance of the statement whose period holds the day before m on that
// day, or else at the previous balance of the first statement starting in m, on the day its
// period starts; such a month is partial (the rows before that day are not known), as is one
// whose statements around it are not consecutive.
//
// One portfolio per card product (a replaced card keeps the account, its balance carries over):
// id the product's name in lowercase with "-" between its words ("visa-revolution"), label the
// name without "HSBC", title-cased when printed in capitals ("Visa Revolution"). A second statement for the same product and period end
// month is an error, whichever file came first.
//
// The Accounts CSV and the QIF's "Opening Balance" record give the amount owed (positive when
// owed, negative for a credit balance), the convention of finance apps' credit card accounts,
// and the QIF is of type CCard; the Accounts CSV's account type is "Credit Card".
// Works in the browser (self.HsbcSgCreditcardParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../core/layout.js"), require("../../core/export.js"), require("../../core/assemble.js"));
  else root.HsbcSgCreditcardParser = factory(root.StatementLayout, root.StatementExport, root.StatementAssemble);
})(typeof self !== "undefined" ? self : this, function (L, E, A) {
  "use strict";
  const CENT = 0.005;
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const PERIOD_RE = /\bFrom (\d{2}) ([A-Z]{3}) (\d{4}) to (\d{2}) ([A-Z]{3}) (\d{4})\b/;
  // The first line naming an HSBC product (not the bank, the app or online banking).
  const PRODUCT_RE = /^HSBC (?!Bank\b|Singapore\b|Online\b)(\S.*)$/;
  const SHORT_DATE_RE = /^(\d{2}) ([A-Z][a-z]{2})$/;
  const AMOUNT_RE = /^(\d{1,3}(?:,\d{3})*\.\d{2})(CR)?$/;
  const CARD_RE = /\b\d{4}-XXXX-XXXX-(\d{4})$/;
  const FOREIGN_RE = /^(.*?)\s*\b([A-Z]{3}) (\d{1,3}(?:,\d{3})*\.\d{2})$/;
  // Where the right column (the account summary) starts on the first page.
  const RIGHT_COLUMN = 380;
  // Code-point order: the same in every browser and locale (never localeCompare without a locale).
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const pad = (n) => String(n).padStart(2, "0");
  const money = (s) => Number(s.replace(/,/g, ""));
  // A balance as the account holds it: minus what is owed.
  const balance = (m) => (m[2] ? money(m[1]) : -money(m[1]));
  const title = (s) => s.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  const nextMonth = (m) => { let [y, mo] = m.split("-").map(Number); mo += 1; if (mo > 12) { mo = 1; y += 1; } return `${y}-${pad(mo)}`; };
  const shift = (iso, days) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const longDate = (d, mon, y) => (MONTHS.includes(mon) ? `${y}-${pad(MONTHS.indexOf(mon) + 1)}-${d}` : null);

  // "DD Mon" of a statement whose period ends on `to`: in that year, or the year before for a
  // later month.
  function fullDate(m, to) {
    const mo = MONTHS.indexOf(m[2].toUpperCase()) + 1;
    if (!mo) return null;
    const year = Number(to.slice(0, 4)) - (mo > Number(to.slice(5, 7)) ? 1 : 0);
    return `${year}-${pad(mo)}-${m[1]}`;
  }

  // One statement: {from, to, product, cards, opening, closing, rows, notices, totals,
  // problems} or {error}.
  function readStatement(s) {
    const pages = s !== null && typeof s === "object" && Array.isArray(s.pages) ? s.pages : [];
    const lines = pages.map((items) => L.pageLines(Array.isArray(items) ? items : []));
    const texts = lines.flat().map((l) => l.text);
    if (!texts.some((t) => /^HSBC Bank \(Singapore\) Limited\b/.test(t)) || !texts.some((t) => /^DATE  DATE  DESCRIPTION\b/.test(t)))
      return { error: "not an HSBC Singapore credit card statement" };
    const st = { from: null, to: null, product: null, cards: [], opening: null, closing: null, rows: [], notices: [], totals: {}, problems: [] };
    for (const t of texts) {
      let m;
      if (!st.from && (m = PERIOD_RE.exec(t))) { st.from = longDate(m[1], m[2], m[3]); st.to = longDate(m[4], m[5], m[6]); }
      if (!st.product && (m = PRODUCT_RE.exec(t))) st.product = m[1];
    }
    if (!st.from || !st.to || st.from > st.to) return { error: "no statement period found" };
    if (!st.product) return { error: "no card product found" };
    let done = false, row = null;
    for (const page of lines) {
      let inTable = false;
      for (const l of page) {
        // The summary's totals, in the right column.
        const right = l.items.filter((it) => it.x >= RIGHT_COLUMN);
        for (let i = 0; i + 1 < right.length; i++) {
          const k = /^(Payments & Credits|Purchases & Debits)$/.exec(right[i].s), v = AMOUNT_RE.exec(right[i + 1].s);
          if (k && v && !(k[1] in st.totals)) st.totals[k[1]] = money(v[1]);
        }
        if (done) continue;
        if (/^DATE  DATE  DESCRIPTION\b/.test(l.text)) { inTable = true; continue; }
        if (!inTable) continue;
        const cells = l.items.filter((it) => it.x < RIGHT_COLUMN);
        if (!cells.length) continue;
        const text = cells.map((it) => it.s).join("  ");
        let m;
        if (/^Continued on next page$/.test(text)) { inTable = false; row = null; continue; }
        if ((m = CARD_RE.exec(text))) { if (!st.cards.includes(m[1])) st.cards.push(m[1]); row = null; continue; }
        const last = AMOUNT_RE.exec(cells[cells.length - 1].s);
        if (/^Previous Statement Balance$/.test(cells[0].s) && last && cells.length === 2) { st.opening = balance(last); continue; }
        if (/^Total Due$/.test(cells[0].s) && last && cells.length === 2) { st.closing = balance(last); done = true; continue; }
        const posted = SHORT_DATE_RE.exec(cells[0].s), made = cells[1] && SHORT_DATE_RE.exec(cells[1].s);
        if (posted && made) {
          const date = fullDate(posted, st.to), on = fullDate(made, st.to);
          const desc = cells.slice(2, last ? -1 : undefined).map((it) => it.s);
          if (!date || !on) { st.problems.push(`unreadable date in the transactions: ${text}`); row = null; continue; }
          if (!last || !desc.length) { st.notices.push({ date, detail: desc.join(" ") }); row = null; continue; }
          const amount = money(last[1]);
          row = { date, on, name: desc[0], place: desc.slice(1), amount: last[2] ? -amount : amount, credit: Boolean(last[2]) };
          st.rows.push(row);
          continue;
        }
        // The rest of the place (and a foreign amount) of the row above.
        if (row && !last) { row.place.push(...cells.map((it) => it.s)); continue; }
        st.problems.push(`unrecognised line in the transactions: ${text}`);
      }
    }
    if (st.opening === null) return { error: "no previous statement balance found" };
    if (st.closing === null) return { error: "no Total Due (new balance) found" };
    for (const r of st.rows) {
      const place = r.place.join(" ");
      const f = FOREIGN_RE.exec(place);
      r.place = f ? f[1] : place;
      r.foreign = f ? `${f[2]} ${f[3]}` : "";
    }
    return st;
  }

  // The app parses again on every configurator change: read each statement once.
  const read = new WeakMap();
  function statementOf(s) {
    if (s === null || typeof s !== "object") return readStatement(null);
    if (!read.has(s)) read.set(s, readStatement(s));
    return read.get(s);
  }

  // The balance a statement reaches at the end of `day`.
  const balanceAt = (st, day) => E.round2(st.rows.reduce((b, r) => (r.date <= day ? b - r.amount : b), st.opening));
  const covers = (st, day) => st.from <= day && day <= st.to;

  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], raw = {}, months = [], skippedRows = [];
    const parsed = [];
    for (const s of Array.isArray(statements) ? statements : []) {
      const st = statementOf(s);
      if (st.error) errors.push({ id: String(s && s.id), error: st.error });
      else parsed.push({ s, st });
    }
    // Period end, then the file name (code-point order): the first statement of a product's
    // month wins, whatever order the files were added in.
    parsed.sort((a, b) => cmp(a.st.to, b.st.to) || cmp(String(a.s.id), String(b.s.id)));
    const products = new Map(); // id -> [{s, st}] by period end
    for (const p of parsed) {
      const id = p.st.product.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "card";
      const list = products.get(id) || [];
      products.set(id, list);
      const month = p.st.to.slice(0, 7);
      if (list.some((q) => q.st.to.slice(0, 7) === month)) errors.push({ id: String(p.s.id), error: `duplicate statement for ${month}, ignored` });
      else list.push(p);
    }
    let used = 0;
    for (const [id, list] of products) {
      const product = list[list.length - 1].st.product;
      const label = /[a-z]/.test(product) ? product : title(product); // names printed in capitals are title-cased
      const r = (raw[id] = { label, names: [label], kind: "bank", currency: "SGD", months: {}, cash: [], trades: [] });
      const covered = new Set();
      list.forEach(({ s, st }, i) => {
        used++;
        const month = st.to.slice(0, 7);
        for (let m = st.from.slice(0, 7); m <= month; m = nextMonth(m)) { covered.add(m); months.push({ month: m, id: String(s.id) }); }
        for (const p of st.problems) warnings.push(`${month}: ${label}: ${p}`);
        // The statement's own sums.
        const end = balanceAt(st, st.to);
        if (Math.abs(end - st.closing) >= CENT) warnings.push(`${month}: ${label}: the rows take the balance to ${(-end).toFixed(2)} owed, the Total Due is ${(-st.closing).toFixed(2)}`);
        const credit = E.round2(st.rows.filter((x) => x.credit).reduce((a, x) => a - x.amount, 0));
        const debit = E.round2(st.rows.filter((x) => !x.credit).reduce((a, x) => a + x.amount, 0));
        const tc = st.totals["Payments & Credits"], td = st.totals["Purchases & Debits"];
        if (tc !== undefined && Math.abs(tc - credit) >= CENT) warnings.push(`${month}: ${label}: payments and credits ${tc.toFixed(2)}, the credits add up to ${credit.toFixed(2)}`);
        if (td !== undefined && Math.abs(td - debit) >= CENT) warnings.push(`${month}: ${label}: purchases and debits ${td.toFixed(2)}, the debits add up to ${debit.toFixed(2)}`);
        const prev = i > 0 ? list[i - 1].st : null;
        if (prev && shift(prev.to, 1) === st.from && Math.abs(prev.closing - st.opening) >= CENT)
          warnings.push(`${month}: ${label}: the previous balance is ${(-st.opening).toFixed(2)} owed, the statement before ended at ${(-prev.closing).toFixed(2)}`);
        for (const x of st.rows) {
          if (x.date < st.from || x.date > st.to) warnings.push(`${month}: ${label}: ${x.date} ${x.name} is posted outside the period ${st.from} to ${st.to}`);
          const notes = [x.place, x.foreign && `transacted amount ${x.foreign}`, x.on !== x.date && `transaction date ${x.on}`].filter(Boolean).join(" · ");
          r.cash.push({ date: x.date, amount: x.amount, currency: "SGD", name: x.name, notes, kind: "bank" });
        }
        for (const n of st.notices) skippedRows.push({ date: n.date, category: "no amount", detail: n.detail, account: label });
      });
      // Calendar months from the statements around them.
      const sts = list.map((p) => p.st);
      for (const m of [...covered].sort(cmp)) {
        const last = E.lastDayOf(m), before = shift(`${m}-01`, -1);
        const atEnd = sts.find((x) => covers(x, last));
        const endingIn = sts.filter((x) => x.to.startsWith(m)).pop();
        const atStart = sts.find((x) => covers(x, before));
        const startingIn = sts.find((x) => x.from.startsWith(m));
        const entry = atEnd ? { monthEnd: last, closing: balanceAt(atEnd, last) } : { monthEnd: endingIn.to, closing: endingIn.closing };
        entry.opening = atStart ? balanceAt(atStart, before) : startingIn.opening;
        // Partial: the month starts part-way, or a statement between its two ends is missing.
        const chain = sts.filter((x) => x.to >= (atStart ? atStart.to : startingIn.to) && x.from <= (atEnd ? atEnd.from : endingIn.from));
        const gap = chain.some((x, k) => k > 0 && shift(chain[k - 1].to, 1) !== x.from);
        r.months[m] = { monthEnd: entry.monthEnd, opening: entry.opening, closing: entry.closing, fx: null,
                        ...(!atStart ? { partial: true, startDate: startingIn.from } : gap ? { partial: true } : {}) };
      }
    }
    return A.build({ raw, config, months, statements: used, errors, warnings, skippedRows });
  }

  // Writers for a credit card: the Accounts CSV's type and balance, and the QIF's type and
  // opening balance, as finance apps' credit card accounts take them (the amount owed).
  function accountsCsv(rows) {
    return E.accountsCsv(rows.map((r) => ({ ...r, type: r.type === "Investment" ? r.type : "Credit Card", balance: r.type === "Investment" ? r.balance : E.round2(-r.balance) })));
  }
  function qif(entries, start, accountName, type = "CCard") {
    return E.qif(entries, start ? { ...start, balance: E.round2(-start.balance) } : start, accountName, type);
  }

  return { parseStatements, accountsCsv, qif };
});
