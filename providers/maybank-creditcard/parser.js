// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Maybank (Malaysia) credit card statement PDF (docs/CONTRACT.md, parser). One statement per
// card per billing cycle; StatementLayout.pageLines gives the text lines, the cells of a line
// joined by two spaces:
//   Malayan Banking Berhad (3813-K)
//   …  DD MMM YY  DD MMM YY                       statement date, payment due date
//   Posting Date /  Transaction Date /  …          the table header (repeated on each page)
//   <CARD NAME>  :  NNNN NNNN NNNN NNNN            the card
//   YOUR PREVIOUS STATEMENT BALANCE  1,234.56[CR]  starts the rows
//   DD/MM  DD/MM  <merchant>  <city country>  1,234.56[CR]
//   TRANSACTED AMOUNT  <CCY>  12.34               the foreign amount of the row above
//   DD/MM  DD/MM  RETAIL INTEREST RATE = 15.00%    a notice without an amount: not exported
//   TOTAL CREDIT THIS MONTH…  1,234.56
//   TOTAL DEBIT THIS MONTH…  1,234.56
//   SUB TOTAL/JUMLAH  1,234.56[CR]                 the new balance; ends the rows
// Balances are what is owed: "CR" marks a credit balance, and a row with "CR" is a credit
// (payment, refund). The card is kept as a bank-like account whose balance is minus what is
// owed: a purchase is an outflow, a payment an inflow. Rows are dated by their posting date,
// the date the statement's balance counts them on (the transaction date goes in the notes when
// it differs), and the year comes from the statement date.
//
// A cycle runs from the day after the previous statement date to the statement date, so each
// statement covers the end of the calendar month before its own: calendar months are put
// together from the statements around them. Month m closes at the balance the next month's
// statement reaches on m's last day, or, without that statement, at this statement's new
// balance on its statement date (the newest month ends there until the next statement comes).
// A month whose own statement is missing opens at the next statement's previous balance, on
// the day its cycle starts, and is partial: the rows before that day are not known.
//
// One portfolio per card number: id "<16 digits>", label "<card name> <last 4 digits>", the
// whole number in place of the last 4 where two cards would share a label. A second statement
// for the same card and month is an error, whichever file came first.
//
// The Accounts CSV and the QIF's "Opening Balance" record give the amount owed (positive when
// owed, negative for a credit balance), the convention of finance apps' credit card accounts,
// and the QIF is of type CCard; the Accounts CSV's account type is "Credit Card".
// Works in the browser (self.MaybankCreditcardParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../core/layout.js"), require("../../core/export.js"), require("../../core/assemble.js"));
  else root.MaybankCreditcardParser = factory(root.StatementLayout, root.StatementExport, root.StatementAssemble);
})(typeof self !== "undefined" ? self : this, function (L, E, A) {
  "use strict";
  const CENT = 0.005;
  const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const LONG_DATE_RE = /^(\d{2}) ([A-Z]{3}) (\d{2})$/;
  const SHORT_DATE_RE = /^(\d{2})\/(\d{2})$/;
  const CARD_RE = /^(.+?)  :  (\d{4}) (\d{4}) (\d{4}) (\d{4})$/;
  const AMOUNT_RE = /^(\d{1,3}(?:,\d{3})*\.\d{2})(CR)?$/;
  const CCY_RE = /^[A-Z]{3}$/;
  // Lines inside the rows that carry nothing: page headers repeated on a new page, and the
  // Malay halves of the labels.
  const NOISE_RE = /^(Posting Date \/|Tarikh Pos\b|Malayan Banking Berhad|Page\/Halaman\b|STATEMENT OF CREDIT CARD ACCOUNT$|PENYATA AKAUN KAD KREDIT$|JUMLAH PENYATA TERAKHIR$|\(JUMLAH (KREDIT|DEBIT)\)$)/;
  // A gap this wide between two cells of a row's description separates the merchant from its
  // city and country.
  const COLUMN_GAP = 40;
  // Code-point order: the same in every browser and locale (never localeCompare without a locale).
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const pad = (n) => String(n).padStart(2, "0");
  const money = (s) => Number(s.replace(/,/g, ""));
  // A balance as the account holds it: minus what is owed.
  const balance = (m) => (m[2] ? money(m[1]) : -money(m[1]));
  const title = (s) => s.toLowerCase().replace(/(^|[\s(\-/])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  const nextMonth = (m) => { let [y, mo] = m.split("-").map(Number); mo += 1; if (mo > 12) { mo = 1; y += 1; } return `${y}-${pad(mo)}`; };
  // The same day a month earlier (the day before a cycle starts), clamped to that month's end.
  function monthBefore(iso) {
    const prev = E.prevMonth(iso.slice(0, 7));
    const last = E.lastDayOf(prev);
    const day = `${prev}-${iso.slice(8, 10)}`;
    return day < last ? day : last;
  }
  const dayAfter = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  };

  // "DD/MM" of a statement dated `date`: in that year, or the year before for a later month.
  function fullDate(m, date) {
    const year = Number(date.slice(0, 4)) - (Number(m[2]) > Number(date.slice(5, 7)) ? 1 : 0);
    return `${year}-${m[2]}-${m[1]}`;
  }

  // One statement: {date, name, number, opening, closing, rows, notices, problems} or {error}.
  function readStatement(s) {
    const pages = s !== null && typeof s === "object" && Array.isArray(s.pages) ? s.pages : [];
    const lines = pages.flatMap((items) => L.pageLines(Array.isArray(items) ? items : []));
    const texts = lines.map((l) => l.text);
    if (!texts.some((t) => /^Malayan Banking Berhad\b/.test(t)) || !texts.some((t) => /^YOUR PREVIOUS STATEMENT BALANCE\b/.test(t)))
      return { error: "not a Maybank credit card statement" };
    const st = { date: null, name: null, number: null, opening: null, closing: null, rows: [], notices: [], problems: [], totals: {} };
    let state = "head", row = null, cards = 0;
    for (const l of lines) {
      const t = l.text;
      let m;
      if (!st.date) {
        const dates = l.items.map((it) => LONG_DATE_RE.exec(it.s)).filter(Boolean);
        if (dates.length >= 2 && MONTHS.includes(dates[0][2])) st.date = `20${dates[0][3]}-${pad(MONTHS.indexOf(dates[0][2]) + 1)}-${dates[0][1]}`;
      }
      if (state === "done") continue;
      if ((m = CARD_RE.exec(t))) {
        cards++;
        const name = m[1].replace(/^MAYBANK\s+/i, "").trim();
        st.name = /[a-z]/.test(name) ? name : title(name); // names printed in capitals are title-cased
        st.number = m[2] + m[3] + m[4] + m[5];
        continue;
      }
      if (state === "head") {
        if ((m = /^YOUR PREVIOUS STATEMENT BALANCE  (.+)$/.exec(t)) && (m = AMOUNT_RE.exec(m[1]))) {
          st.opening = balance(m);
          state = "rows";
        }
        continue;
      }
      if ((m = /^SUB TOTAL\/JUMLAH  (.+)$/.exec(t))) {
        if ((m = AMOUNT_RE.exec(m[1]))) st.closing = balance(m);
        state = "done";
        continue;
      }
      if ((m = /^TOTAL (CREDIT|DEBIT) THIS MONTH\b.*  (\S+)$/.exec(t)) && AMOUNT_RE.test(m[2])) {
        st.totals[m[1].toLowerCase()] = money(m[2]);
        continue;
      }
      if (NOISE_RE.test(t)) continue;
      const cells = l.items.map((it) => it.s);
      const posted = SHORT_DATE_RE.exec(cells[0] || ""), done = SHORT_DATE_RE.exec(cells[1] || "");
      if (posted && done && cells.length >= 3 && st.date) {
        const last = AMOUNT_RE.exec(cells[cells.length - 1]);
        const desc = l.items.slice(2, last ? -1 : undefined);
        const date = fullDate(posted, st.date), on = fullDate(done, st.date);
        if (!last || desc.length === 0) {
          st.notices.push({ date, detail: cells.slice(2).join(" ") });
          row = null;
          continue;
        }
        // Merchant cells, then (after a wide gap) the city and country.
        let split = desc.length;
        for (let i = 1; i < desc.length; i++) if (desc[i].x - (desc[i - 1].x + desc[i - 1].w) > COLUMN_GAP) { split = i; break; }
        const amount = money(last[1]);
        row = { date, on, name: desc.slice(0, split).map((it) => it.s).join(" "), place: desc.slice(split).map((it) => it.s).join(" "), foreign: "",
                amount: last[2] ? -amount : amount, credit: Boolean(last[2]) };
        st.rows.push(row);
        continue;
      }
      if ((m = /^TRANSACTED AMOUNT  (\S+)  (\S+)$/.exec(t)) && CCY_RE.test(m[1]) && AMOUNT_RE.test(m[2]) && row && !row.foreign) {
        row.foreign = `${m[1]} ${m[2]}`;
        continue;
      }
      st.problems.push(`unrecognised line in the transactions: ${t}`);
    }
    if (!st.date) return { error: "no statement date found" };
    if (cards === 0) return { error: "no card number found" };
    if (cards > 1) return { error: "a statement with more than one card is not supported yet" };
    if (st.closing === null) return { error: "no SUB TOTAL (new balance) found" };
    return st;
  }

  // An account's labels, shortest first: "<card name> <last 4 digits>", then with the whole
  // number, which no other card can have.
  const labelForms = (x) => [`${x.name} ${x.number.slice(-4)}`, `${x.name} ${x.number}`];

  // Each portfolio whose label another one shares takes its next form, until no label is shared
  // (portfolios with one label would merge into one account).
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

  // The balance a statement reaches at the end of `day`.
  const balanceAt = (st, day) => E.round2(st.rows.reduce((b, r) => (r.date <= day ? b - r.amount : b), st.opening));

  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], raw = {}, months = [], skippedRows = [];
    const parsed = [];
    for (const s of Array.isArray(statements) ? statements : []) {
      const st = statementOf(s);
      if (st.error) errors.push({ id: String(s && s.id), error: st.error });
      else parsed.push({ s, st });
    }
    // Statement date, then the file name (code-point order): the first statement of a card's
    // month wins, whatever order the files were added in.
    parsed.sort((a, b) => cmp(a.st.date, b.st.date) || cmp(String(a.s.id), String(b.s.id)));
    const cards = new Map(); // number -> Map month -> {s, st}
    for (const p of parsed) {
      const month = p.st.date.slice(0, 7);
      const byMonth = cards.get(p.st.number) || new Map();
      cards.set(p.st.number, byMonth);
      if (byMonth.has(month)) errors.push({ id: String(p.s.id), error: `duplicate statement for ${month}, ignored` });
      else byMonth.set(month, p);
    }
    const newest = new Map();
    for (const [number, byMonth] of cards) newest.set(number, [...byMonth.values()].pop().st);
    const form = distinctLabels(new Map([...newest].map(([id, x]) => [id, labelForms(x)])));
    let used = 0;
    for (const [id, byMonth] of cards) {
      const label = labelForms(newest.get(id))[form.get(id)];
      const r = (raw[id] = { label, names: [], kind: "bank", currency: "MYR", months: {}, cash: [], trades: [] });
      const covered = new Set();
      let prev = null;
      for (const [month, { s, st }] of byMonth) {
        used++;
        const name = labelForms(st)[form.get(id)];
        if (r.names[r.names.length - 1] !== name) r.names.push(name); // oldest -> newest
        const before = E.prevMonth(month);
        covered.add(before).add(month);
        months.push({ month: before, id: String(s.id) }, { month, id: String(s.id) });
        for (const p of st.problems) warnings.push(`${month}: ${label}: ${p}`);
        // The statement's own sums.
        const end = balanceAt(st, st.date);
        if (Math.abs(end - st.closing) >= CENT) warnings.push(`${month}: ${label}: the rows take the balance to ${(-end).toFixed(2)} owed, the new balance is ${(-st.closing).toFixed(2)}`);
        const credit = E.round2(st.rows.filter((x) => x.credit).reduce((a, x) => a - x.amount, 0));
        const debit = E.round2(st.rows.filter((x) => !x.credit).reduce((a, x) => a + x.amount, 0));
        if (st.totals.credit !== undefined && Math.abs(st.totals.credit - credit) >= CENT) warnings.push(`${month}: ${label}: total credit ${st.totals.credit.toFixed(2)}, the credits add up to ${credit.toFixed(2)}`);
        if (st.totals.debit !== undefined && Math.abs(st.totals.debit - debit) >= CENT) warnings.push(`${month}: ${label}: total debit ${st.totals.debit.toFixed(2)}, the debits add up to ${debit.toFixed(2)}`);
        if (prev && prev.month === before && Math.abs(prev.st.closing - st.opening) >= CENT)
          warnings.push(`${month}: ${label}: the previous balance is ${(-st.opening).toFixed(2)} owed, the ${before} statement ended at ${(-prev.st.closing).toFixed(2)}`);
        const start = dayAfter(monthBefore(st.date));
        for (const x of st.rows) {
          if (x.date < start || x.date > st.date) warnings.push(`${month}: ${label}: ${x.date} ${x.name} is posted outside the cycle ${start} to ${st.date}`);
          const notes = [x.place, x.foreign && `transacted amount ${x.foreign}`, x.on !== x.date && `transaction date ${x.on}`].filter(Boolean).join(" · ");
          r.cash.push({ date: x.date, amount: x.amount, currency: "MYR", name: x.name, notes, kind: "bank" });
        }
        for (const n of st.notices) skippedRows.push({ date: n.date, category: /\bINTEREST RATE\b/i.test(n.detail) ? "interest rate notice" : "no amount", detail: n.detail, account: label });
        prev = { month, st };
      }
      // Calendar months from the statements around them.
      for (const m of [...covered].sort(cmp)) {
        const own = byMonth.get(m), next = byMonth.get(nextMonth(m));
        const entry = next
          ? { monthEnd: E.lastDayOf(m), closing: balanceAt(next.st, E.lastDayOf(m)) }
          : { monthEnd: own.st.date, closing: own.st.closing };
        if (own) entry.opening = balanceAt(own.st, E.lastDayOf(E.prevMonth(m)));
        else Object.assign(entry, { opening: next.st.opening, startDate: dayAfter(monthBefore(next.st.date)), partial: true });
        r.months[m] = { monthEnd: entry.monthEnd, opening: entry.opening, closing: entry.closing, fx: null,
                        ...(entry.partial ? { partial: true, startDate: entry.startDate } : {}) };
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
