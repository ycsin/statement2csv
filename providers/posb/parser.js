// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// POSB / DBS consolidated statement parser. Every deposit account (and each
// currency inside a multi-currency account) is a bank-like account: each
// transaction is exported, checked against the running balance printed on its
// row, and each statement period against its brought- and carried-forward
// balances. Fixed deposits are listed but not exported (they have no
// transactions; placements and maturities show in the paying account).
// Works in the browser (window.PosbParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../core/layout.js"), require("../../core/export.js"));
  else root.PosbParser = factory(root.StatementLayout, root.StatementExport);
})(typeof self !== "undefined" ? self : this, function (L, E) {
  "use strict";

  const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const { round2, pad } = E;
  const ZERO = 0.005;
  const NUM_RE = /^[\d,]+\.\d{2}$/;
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));
  const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const iso = (s) => { const m = s.match(DATE_RE); return `${m[3]}-${m[2]}-${m[1]}`; };
  // "CURRENCY: SINGAPORE DOLLAR" -> ISO code.
  const CCY = {
    "SINGAPORE DOLLAR": "SGD", "UNITED STATES DOLLAR": "USD", "US DOLLAR": "USD", "AUSTRALIAN DOLLAR": "AUD", "BRITISH POUND": "GBP",
    "STERLING POUND": "GBP", "POUND STERLING": "GBP", "EURO": "EUR", "JAPANESE YEN": "JPY", "HONG KONG DOLLAR": "HKD", "CANADIAN DOLLAR": "CAD",
    "NEW ZEALAND DOLLAR": "NZD", "SWISS FRANC": "CHF", "CHINESE RENMINBI": "CNH", "CHINESE YUAN": "CNH", "THAI BAHT": "THB",
    "SWEDISH KRONA": "SEK", "NORWEGIAN KRONE": "NOK", "DANISH KRONE": "DKK", "INDONESIAN RUPIAH": "IDR", "PHILIPPINE PESO": "PHP",
  };
  const nextMonth = (m) => { let [y, mo] = m.split("-").map(Number); mo += 1; if (mo > 12) { mo = 1; y += 1; } return `${y}-${pad(mo)}`; };
  const prevMonth = (m) => E.prevMonth(m);
  const ACCOUNT_NO_RE = /^Account No\.\s*([\d-]+)$/;

  // ---- one statement --------------------------------------------------------
  // pages: [[{ str, x, y, w, h }, ...], ...] (pdf.js text items per page)
  function parseStatement(pages) {
    const lines = [];
    pages.forEach((items, page) => { for (const l of L.pageLines(items)) lines.push({ ...l, page }); });
    const text = lines.map((l) => l.text).join("\n");
    const asAt = text.match(/Transaction Details as at (\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/) || text.match(/as at (\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/i);
    if (asAt && /^Details of Your .+Account No\.:?\s*[\d-]+$/m.test(text) && !/Consolidated Statement/.test(text)) return parseStandalone(lines, asAt);
    if (!asAt || !/Consolidated Statement/.test(text) || !/DBS|POSB/.test(text)) return { error: "not a POSB/DBS consolidated or deposit account statement" };
    const st = { monthEnd: `${asAt[3]}-${pad(MONTHS[asAt[2]])}-${pad(+asAt[1])}`, tables: [], fixed: [], problems: [] };

    let inDetails = false, acct = null, ccy = null, cols = null, table = null, row = null, fd = null;
    const close = () => { row = null; table = null; };
    // Account Summary (page 1): "<name>  <account no.>  <CCY>  <balance>  <SGD equivalent>",
    // further currencies of the same account on the following lines.
    st.summary = [];
    let sumAcct = null;
    for (const l of lines) {
      const t = l.text;
      if (/^Transaction Details as (at|of) /.test(t)) { inDetails = true; continue; }
      if (!inDetails) {
        const noI = l.items.findIndex((it) => /^\d{3,4}-\d{5,8}-\d(-\d+)?$/.test(it.s));
        const amt = (from) => l.items.slice(from).find((it) => NUM_RE.test(it.s));
        if (noI > 0) {
          sumAcct = { number: l.items[noI].s, name: l.items.slice(0, noI).map((it) => it.s).join(" ").trim() };
          const c = l.items.slice(noI + 1).find((it) => /^[A-Z]{3}$/.test(it.s));
          const v = amt(noI + 1);
          if (v && !/fixed deposit/i.test(sumAcct.name)) st.summary.push({ ...sumAcct, currency: c ? c.s : "SGD", balance: num(v.s) });
        } else if (sumAcct && l.items.length >= 2 && /^[A-Z]{3}$/.test(l.items[0].s) && l.items[0].x > 300 && amt(1)) {
          if (!/fixed deposit/i.test(sumAcct.name)) st.summary.push({ ...sumAcct, currency: l.items[0].s, balance: num(amt(1).s) });
        } else if (!/^\(/.test(t)) sumAcct = null;
        continue;
      }
      if (/^(Messages For You|For Your Information)$/.test(t)) { inDetails = false; close(); continue; }
      if (/^(SG\d+ \(|Page \d+ of \d+|PDS_)/.test(t) || /Page \d+ of \d+$/.test(t)) continue;
      // Account header: "<name>   Account No. 271-123456-7" (repeated after a page break).
      const noIt = l.items.find((it) => ACCOUNT_NO_RE.test(it.s));
      if (noIt) {
        const number = noIt.s.match(ACCOUNT_NO_RE)[1];
        const name = l.items.filter((it) => it !== noIt).map((it) => it.s).join(" ").trim();
        if (!acct || acct.number !== number) { acct = { number, name }; ccy = null; close(); }
        fd = /fixed deposit/i.test(name) ? { number, name, principal: {} } : null;
        if (fd) st.fixed.push(fd);
        continue;
      }
      const cur = t.match(/^CURRENCY:\s*(.+)$/);
      if (cur) { ccy = CCY[cur[1].trim().toUpperCase()] || cur[1].trim(); close(); continue; }
      if (fd) {
        const tp = t.match(/^Total Principal Amount in ([A-Z]{3}):\s+([\d,]+\.\d{2})$/);
        if (tp) fd.principal[tp[1]] = num(tp[2]);
        continue;
      }
      if (/^Date\s+Description\s+Withdrawal/.test(t)) {
        const head = Object.fromEntries(l.items.map((it) => [it.s.replace(/\s*\(.*$/, ""), it]));
        const bal = l.items.find((it) => /^Balance/.test(it.s));
        const hc = (bal.s.match(/\(([A-Z]{3})\)/) || [])[1];
        if (hc && !ccy) ccy = hc;
        cols = { withdrawal: head.Withdrawal.x + head.Withdrawal.w, deposit: head.Deposit.x + head.Deposit.w, desc: head.Description.x };
        continue;
      }
      if (!acct || !cols) continue;
      const amounts = (items) => items.filter((it) => NUM_RE.test(it.s) || /^[A-Z]{3} [\d,]+\.\d{2}$/.test(it.s));
      const lastNum = (items) => { const a = amounts(items); return a.length ? num(a[a.length - 1].s.replace(/^[A-Z]{3} /, "")) : null; };
      if (/^Balance Brought Forward/.test(t)) {
        const v = lastNum(l.items);
        const c = (l.items.map((it) => it.s.match(/^([A-Z]{3}) /)).find(Boolean) || [])[1] || ccy || "SGD";
        ccy = c;
        const key = `${acct.number}:${c}`;
        const open = st.tables.find((x) => x.key === key && !x.closed);
        if (open) { table = open; if (Math.abs(open.running - v) >= ZERO) st.problems.push(`${acct.name} ${c}: brought forward ${v} after a page break, expected ${open.running}`); }
        else { table = { key, number: acct.number, name: acct.name, currency: c, opening: v, running: v, closing: null, rows: [], closed: false }; st.tables.push(table); }
        row = null;
        continue;
      }
      if (!table) continue;
      if (/^Balance Carried Forward/.test(t)) { row = null; continue; }
      if (/^Total Balance Carried Forward/.test(t)) {
        table.closing = lastNum(l.items);
        if (Math.abs(table.closing - table.running) >= ZERO) st.problems.push(`${table.name} ${table.currency}: rows end at ${table.running}, carried forward ${table.closing}`);
        table.closed = true;
        close();
        continue;
      }
      if (/^Indicative in /.test(t)) continue;
      const d = l.items[0] && DATE_RE.test(l.items[0].s) && l.items[0].x < cols.desc - 10 ? l.items[0] : null;
      if (d) {
        const nums = amounts(l.items.slice(1));
        const desc = l.items.slice(1).filter((it) => !nums.includes(it) && it.x >= cols.desc - 5).map((it) => it.s).join(" ").trim();
        if (!nums.length) { row = null; continue; }
        const balance = num(nums[nums.length - 1].s);
        if (nums.length === 1) {
          // Date and balance only: the month-end balance line.
          if (Math.abs(balance - table.running) >= ZERO) st.problems.push(`${table.name} ${table.currency} ${iso(d.s)}: balance line ${balance}, expected ${table.running}`);
          row = null;
          continue;
        }
        const amtIt = nums[nums.length - 2];
        const right = amtIt.x + amtIt.w;
        const out = Math.abs(right - cols.withdrawal) < Math.abs(right - cols.deposit);
        const amount = num(amtIt.s);
        const delta = round2(balance - table.running);
        if (Math.abs(Math.abs(delta) - amount) >= ZERO || (amount >= ZERO && (delta < 0) !== out))
          st.problems.push(`${table.name} ${table.currency} ${iso(d.s)} ${desc}: ${out ? "-" : "+"}${amount} doesn't take ${table.running} to ${balance}`);
        table.running = balance;
        // Internal sign convention: inflow negative.
        row = { date: iso(d.s), amount: round2(out ? amount : -amount), balance, desc, notes: [] };
        table.rows.push(row);
        continue;
      }
      if (row && l.items.every((it) => it.x >= cols.desc - 5) && !amounts(l.items).length) row.notes.push(t);
    }
    for (const x of st.tables) if (!x.closed) st.problems.push(`${x.name} ${x.currency}: no carried-forward balance`);
    return st;
  }

  // Older single-account "Deposit Account Statement": issued monthly, or yearly
  // when there's little activity, covering the time since the previous one.
  // "Details of Your <name> Account   Account No.: 123-45678-9", rows dated
  // "31 Jan" (the year is the statement's, or the one before for later months),
  // and the balance printed only on the last row of a day.
  function parseStandalone(lines, asAt) {
    const st = { standalone: true, monthEnd: `${asAt[3]}-${pad(MONTHS[asAt[2]])}-${pad(+asAt[1])}`, tables: [], fixed: [], summary: [], problems: [] };
    const endMonth = MONTHS[asAt[2]], year = +asAt[3];
    let table = null, cols = null, row = null;
    for (const l of lines) {
      const t = l.text;
      const head = t.match(/^Details of Your (.+?)\s+Account No\.:?\s*([\d-]+)$/);
      if (head) {
        const number = head[2], name = head[1].trim();
        table = st.tables.find((x) => x.number === number) || null;
        if (!table) { table = { key: `${number}:SGD`, number, name, currency: "SGD", opening: null, running: null, closing: null, rows: [], closed: false }; st.tables.push(table); }
        row = null;
        continue;
      }
      if (!table || table.closed) continue;
      if (/^DATE\s+DETAILS OF TRANSACTIONS/i.test(t)) {
        const edge = (re) => { const it = l.items.find((x) => re.test(x.s)); return it ? it.x + it.w : null; };
        cols = { withdrawal: edge(/^WITHDRAWAL/i), deposit: edge(/^DEPOSIT/i), balance: edge(/^BALANCE/i), desc: l.items[1] ? l.items[1].x : 90 };
        continue;
      }
      if (!cols) continue;
      const nums = l.items.filter((it) => NUM_RE.test(it.s));
      const near = (it) => [["withdrawal", cols.withdrawal], ["deposit", cols.deposit], ["balance", cols.balance]]
        .map(([k, x]) => [k, Math.abs(it.x + it.w - x)]).sort((a, b) => a[1] - b[1])[0][0];
      if (/^Balance Brought Forward/i.test(t) && nums.length) {
        if (table.opening == null) table.opening = table.running = num(nums[nums.length - 1].s);
        row = null;
        continue;
      }
      if (/^Balance Carried Forward/i.test(t) && nums.length) {
        table.closing = num(nums[nums.length - 1].s);
        if (Math.abs(table.closing - table.running) >= ZERO) st.problems.push(`${table.name}: rows end at ${table.running}, carried forward ${table.closing}`);
        table.closed = true;
        continue;
      }
      if (/^(Total|Messages? For You)\b/i.test(t)) { row = null; continue; }
      const d = l.items[0] && /^\d{2} [A-Z][a-z]{2}$/.test(l.items[0].s) && l.items[0].x < cols.desc - 10 ? l.items[0].s.split(" ") : null;
      if (d && table.opening != null) {
        const amt = nums.find((it) => near(it) !== "balance");
        const bal = nums.find((it) => near(it) === "balance");
        if (!amt) { row = null; continue; }
        const out = near(amt) === "withdrawal";
        const amount = num(amt.s);
        table.running = round2(table.running + (out ? -amount : amount));
        if (bal && Math.abs(num(bal.s) - table.running) >= ZERO) st.problems.push(`${table.name} ${d.join(" ")}: balance ${bal.s}, expected ${table.running}`);
        const y = MONTHS[d[1]] > endMonth ? year - 1 : year;
        const desc = l.items.slice(1).filter((it) => !nums.includes(it)).map((it) => it.s).join(" ").trim();
        row = { date: `${y}-${pad(MONTHS[d[1]])}-${d[0]}`, amount: round2(out ? amount : -amount), balance: table.running, desc, notes: [] };
        table.rows.push(row);
        continue;
      }
      if (row && !nums.length && l.items.every((it) => it.x >= cols.desc - 5)) row.notes.push(t);
    }
    for (const x of st.tables) if (!x.closed) st.problems.push(`${x.name}: no carried-forward balance`);
    if (!st.tables.length) return { error: "no account found in this deposit account statement" };
    return st;
  }

  // ---- transaction history CSV ----------------------------------------------
  // The digibank download of recent transactions: header lines ("Account Details
  // For:", "Statement as at:", "Currency:", "Ledger Balance:"), then one row per
  // transaction, newest first, with no running balance. Balances are worked back
  // from the ledger balance. Rows not yet settled aren't in it and are skipped.
  function csvRows(text) {
    const rows = [];
    let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  // Transaction codes, worded as on the statements.
  const CODES = { ICT: "FAST Payment / Receipt", IDT: "FAST Collection", TRF: "Funds Transfer", RTF: "Remittance Transfer of Funds" };
  const DMY_RE = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/;
  const dmy = (s) => { const m = s.match(DMY_RE); return m && MONTHS[m[2]] ? `${m[3]}-${pad(MONTHS[m[2]])}-${pad(+m[1])}` : null; };

  function parseHistoryCsv(text) {
    const rows = csvRows(text.replace(/^﻿/, "")).map((r) => r.map((c) => c.trim()));
    const field = (label) => { const r = rows.find((x) => x[0].toLowerCase() === label.toLowerCase()); return r ? r[1] || "" : null; };
    const details = field("Account Details For:"), asAt = dmy(field("Statement as at:") || ""), ledgerS = field("Ledger Balance:");
    const hi = rows.findIndex((r) => r.includes("Transaction Date") && r.includes("Debit Amount") && r.includes("Credit Amount"));
    const acct = (details || "").match(/^(.*?)\s*(\d{3,4}-\d{5,8}-\d(?:-\d+)?)$/);
    if (!acct || !asAt || !ledgerS || hi < 0) return { error: "not a POSB/DBS transaction history CSV" };
    const currency = ((field("Currency:") || "").match(/^([A-Z]{3})\b/) || ledgerS.match(/^([A-Z]{3})\b/) || [])[1] || "SGD";
    const ledger = num(ledgerS.replace(/^[A-Z]{3}\s*/, ""));
    if (!Number.isFinite(ledger)) return { error: "no ledger balance in this transaction history CSV" };
    const head = rows[hi];
    const get = (r, name) => { const i = head.indexOf(name); return i >= 0 ? r[i] || "" : ""; };
    const st = { csv: true, standalone: true, monthEnd: asAt, tables: [], fixed: [], summary: [], problems: [], skipped: [] };
    const tx = [];
    for (const r of rows.slice(hi + 1)) {
      if (r.every((c) => !c)) continue;
      const date = dmy(get(r, "Transaction Date"));
      const debit = get(r, "Debit Amount"), credit = get(r, "Credit Amount");
      if (!date || (!debit && !credit)) { st.problems.push(`row not understood: ${r.filter(Boolean).join(", ")}`); continue; }
      const supp = get(r, "Supplementary Code");
      const code = (supp || get(r, "Description")).split(/\s+/)[0];
      // References without the ISO purpose code "OTHR" (other).
      const refs = [supp.slice(code.length), get(r, "Client Reference"), get(r, "Additional Reference")]
        .map((s) => s.replace(/\bOTHR\b/g, "").replace(/\s+/g, " ").trim()).filter(Boolean);
      const desc = supp
        ? [get(r, "Supplementary Code Description"), CODES[code] || code].filter(Boolean).join(" ")
        : get(r, "Description").replace(/\bOTHR\b/g, "").replace(/\s+/g, " ").trim();
      const valueDate = get(r, "Value Date");
      const notes = valueDate ? [...refs, `VALUE DATE : ${valueDate}`] : refs;
      // Internal sign convention: inflow negative.
      const amount = round2(debit ? num(debit) : -num(credit));
      if (get(r, "Currency") && get(r, "Currency") !== currency) st.problems.push(`${date} ${desc}: in ${get(r, "Currency")}, the account is ${currency}`);
      const cp = counterparty(refs.map((s) => s.toUpperCase()));
      const status = get(r, "Status");
      if (status && !/^settled$/i.test(status)) { st.skipped.push({ date, category: "not settled", detail: `${cp ? `${desc} - ${cp}` : desc} (${status})` }); continue; }
      tx.push({ date, amount, desc, notes, counterparty: cp });
    }
    if (tx.length > 1 && tx[0].date > tx[tx.length - 1].date) tx.reverse();
    tx.sort((a, b) => a.date.localeCompare(b.date)); // stable: keeps the order within a day
    const opening = round2(ledger + tx.reduce((s, x) => s + x.amount, 0));
    let running = opening;
    for (const x of tx) { running = round2(running - x.amount); x.balance = running; }
    const name = acct[1].trim() || "Account";
    st.tables.push({ key: `${acct[2]}:${currency}`, number: acct[2], name, currency, opening, running: ledger, closing: ledger, rows: tx, closed: true });
    return st;
  }

  // Counterparty for the transaction name: "TO: X" / "FROM: X", else the first
  // descriptive line that isn't a reference, an account number or a channel tag.
  const SKIP = /^(OTHER|TRANSFER|PAYNOW TRANSFER|FAST TRANSFER|TRANSFER - MOBILE|VALUE DATE\b.*|REF: .*|[A-Z0-9:./-]+|\d{3}-\d{5,6}-\d.*)$/;
  function counterparty(notes) {
    for (const n of notes) { const m = n.match(/^(?:TO|FROM)(?: MSA)?:\s*(.+)$/); if (m) return m[1].trim(); }
    const text = notes.find((n) => /[A-Za-z]{3}/.test(n) && / /.test(n) && !SKIP.test(n));
    if (text) return text;
    // Reference-style lines: "BANK:12345678:I-BANK", "123-45678-9 : I-BANK", "PAYEE-REFERENCE".
    for (const n of notes) {
      let m = n.match(/^([A-Z]{2,8}:[\d-]{4,}):/); if (m) return m[1];
      m = n.match(/^(\d{3}-\d{5,6}-\d)\s*:\s*(?:I-BANK|IB)\b/); if (m) return m[1];
      m = n.match(/^([A-Z][A-Z0-9]{2,})-[A-Z0-9]{10,}$/); if (m) return m[1];
      if (/^[A-Z][A-Z&']{3,}$/.test(n) && !/^(OTHER|OTHR|TRANSFER)$/.test(n)) return n;
    }
    return "";
  }

  // ---- all statements -------------------------------------------------------
  // statements: [{ id, pages }] (PDF text) or [{ id, csv }] (transaction history
  // download), any order. config per account id ("271-123456-7:SGD"):
  // { name, kind, mergeInto, exclude }.
  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], months = [], late_ = [], skippedRows = [];
    let count = 0, downloads = 0;
    const parsed = [];
    for (const s of statements) {
      const st = s.csv != null ? parseHistoryCsv(s.csv) : parseStatement(s.pages);
      if (st.error) { errors.push({ id: s.id, error: st.error }); continue; }
      parsed.push({ ...st, id: s.id });
    }
    // Downloads last: they only add what comes after the statements.
    parsed.sort((a, b) => !!a.csv - !!b.csv || a.monthEnd.localeCompare(b.monthEnd));
    const seen = new Set();
    const raw = {};
    const fixed = {};
    for (const st of parsed) {
      const month = st.monthEnd.slice(0, 7);
      // One consolidated statement per month; deposit account statements per account.
      const dup = st.csv ? `${st.monthEnd}|${st.tables[0].key}` : st.standalone ? `${month}|${st.tables.map((t) => t.key).join(",")}` : month;
      if (seen.has(dup)) { errors.push({ id: st.id, error: `duplicate ${st.csv ? "download" : "statement"} for ${st.csv ? st.monthEnd : month}, ignored` }); continue; }
      seen.add(dup);
      if (st.csv) { addDownload(st); continue; }
      count++;
      // Months this statement covers: a deposit account statement covers the time
      // since that account's previous one (or since its first row).
      let from = month;
      if (st.standalone) for (const tb of st.tables) {
        const r = raw[tb.key];
        const start = r ? nextMonth(r.lastMonth) : tb.rows.length ? tb.rows[0].date.slice(0, 7) : month;
        if (start < from) from = start;
      }
      for (let m = from; m <= month; m = nextMonth(m)) if (!months.some((x) => x.month === m)) months.push({ id: st.id, month: m });
      for (const pr of st.problems) warnings.push(`${month}: ${pr}`);
      for (const f of st.fixed) for (const [c, v] of Object.entries(f.principal)) (fixed[`${f.number}:${c}`] = fixed[`${f.number}:${c}`] || { name: f.name, currency: c, months: {} }).months[month] = v;
      for (const tb of st.tables) {
        const id = tb.key;
        const label = `${tb.name} #${tb.number.slice(-5)}${tb.currency === "SGD" ? "" : " " + tb.currency}`;
        const r = (raw[id] = raw[id] || { id, label, kind: "bank", currency: tb.currency, names: [], months: {}, cash: [], keys: new Set(), firstMonth: month, lastMonth: month });
        const was = r.lastMonth;
        r.label = label; // latest name (nicknames change)
        if (!r.names.includes(tb.name)) r.names.push(tb.name);
        r.lastMonth = month;
        // Some accounts (e.g. quarterly ones) list rows from earlier months: split
        // the table into months by its running balance. Rows already seen in an
        // earlier statement are not exported twice.
        if (!st.standalone) r.consolidated = true;
        r.fromStatements = true;
        let running = tb.opening;
        const span = [];
        let start = tb.rows.length && tb.rows[0].date.slice(0, 7) < month ? tb.rows[0].date.slice(0, 7) : month;
        if (st.standalone && Object.keys(r.months).length && nextMonth(was) < start) start = nextMonth(was);
        for (let m = start; m <= month; m = nextMonth(m)) span.push(m);
        for (const m of span) {
          const opening = running;
          for (const x of tb.rows.filter((x) => x.date.startsWith(m))) {
            running = x.balance;
            const k = `${x.date}|${x.amount}|${x.balance}|${x.desc}`;
            if (r.keys.has(k) || Math.abs(x.amount) < ZERO) continue;
            r.keys.add(k);
            const cp = x.counterparty != null ? x.counterparty : counterparty(x.notes);
            r.cash.push({ date: x.date, amount: x.amount, currency: tb.currency, name: cp ? `${x.desc} - ${cp}` : x.desc, notes: x.notes.join(" · "), kind: "bank" });
          }
          const closing = m === month ? tb.closing : running;
          const prev = r.months[m];
          const before = r.months[prevMonth(m)];
          if (m === span[0] && !(prev && !prev.partial) && before && Math.abs(before.closing - opening) >= ZERO && !before.partial)
            warnings.push(`${month}: ${label} opens at ${opening}, the previous statement closed at ${before.closing}`);
          if (m < month && prev && !prev.partial) {
            // Rows dated in an earlier month that its own statement didn't include
            // (posted after its cut-off): keep their date and count them in that
            // month's closing, so the following month still builds on it.
            const late = round2(closing - opening);
            if (Math.abs(late) >= ZERO) {
              prev.closing = round2(prev.closing + late);
              late_.push({ month: m, statement: month, account: label, amount: late });
            }
            continue;
          }
          if (prev && prev.partial && Math.abs(prev.closing - closing) >= ZERO)
            warnings.push(`${month}: ${label} closed ${m} at ${prev.closing} on that month's statement, ${closing} by this statement's rows`);
          const shifted = m === month && span.length > 1 && r.months[prevMonth(m)] ? r.months[prevMonth(m)].closing : opening;
          r.months[m] = { monthEnd: m === month ? st.monthEnd : E.lastDayOf(m), opening: shifted, closing, cashflow: 0, fx: null };
          if (m < r.firstMonth) r.firstMonth = m;
        }
      }
      // Accounts on the summary without a transaction table this month: the
      // balance is known, the rows may come in a later statement (quarterly
      // accounts); until then the month is marked partial.
      for (const x of st.summary) {
        const id = `${x.number}:${x.currency}`;
        const tb = st.tables.find((t) => t.key === id);
        if (tb) {
          if (tb.closing != null && Math.abs(tb.closing - x.balance) >= ZERO) warnings.push(`${month}: ${x.name} ${x.currency}: summary shows ${x.balance}, transactions end at ${tb.closing}`);
          continue;
        }
        const r = raw[id];
        if (!r && Math.abs(x.balance) < ZERO) continue;
        const label = `${x.name} #${x.number.slice(-5)}${x.currency === "SGD" ? "" : " " + x.currency}`;
        const a = r || (raw[id] = { id, label, kind: "bank", currency: x.currency, names: [x.name], months: {}, cash: [], keys: new Set(), firstMonth: month, lastMonth: month });
        a.lastMonth = month;
        a.fromStatements = true;
        const before = a.months[prevMonth(month)];
        a.months[month] = { monthEnd: st.monthEnd, opening: before ? before.closing : x.balance, closing: x.balance, cashflow: 0, fx: null, partial: true };
      }
    }

    // A transaction history download for one account: its rows after the
    // account's last loaded statement (or download), in months up to the
    // download's date. Its balance where it takes over is checked against that
    // statement's closing: equal when the download reaches back that far,
    // otherwise the difference is bridged as not covered.
    function addDownload(st) {
      const tb = st.tables[0];
      const asAtMonth = st.monthEnd.slice(0, 7);
      const label = `${tb.name} #${tb.number.slice(-5)}${tb.currency === "SGD" ? "" : " " + tb.currency}`;
      const r = raw[tb.key] || (raw[tb.key] = { id: tb.key, label, kind: "bank", currency: tb.currency, names: [tb.name], months: {}, cash: [], keys: new Set(), firstMonth: null, lastMonth: null });
      const last = r.lastMonth ? r.months[r.lastMonth] : null;
      const cut = last ? last.monthEnd : null;
      // After an earlier download the cut-off day itself may have later rows; the
      // keys (with the worked-back balance) skip the ones already added.
      const key = (x) => `${x.date}|${x.amount}|${x.balance}|${x.desc}`;
      const rows = tb.rows.filter((x) => !cut || x.date > cut || (x.date === cut && r.downloadEnd === cut));
      const fresh = rows.filter((x) => !r.keys.has(key(x)));
      if (cut && st.monthEnd <= cut) { errors.push({ id: st.id, error: `nothing after ${cut}, the last statement loaded for ${r.label}; ignored` }); return; }
      for (const x of st.skipped) if (!cut || x.date > cut) skippedRows.push({ ...x, account: r.label });
      downloads++;
      const startBal = fresh.length ? round2(fresh[0].balance + fresh[0].amount) : tb.closing;
      const reachesBack = cut && tb.rows.some((x) => x.date <= cut);
      const off = last ? round2(startBal - last.closing) : 0;
      if (reachesBack && Math.abs(off) >= ZERO) warnings.push(`${st.id}: ${r.label} balance on ${cut} works out at ${startBal}, the statement shows ${last.closing}`);
      // Same month as the cut-off (a download dated mid-month): extend that month.
      const start = !cut ? (fresh.length ? fresh[0].date.slice(0, 7) : asAtMonth) : cut < E.lastDayOf(r.lastMonth) ? r.lastMonth : nextMonth(r.lastMonth);
      let running = startBal;
      for (let m = start; m <= asAtMonth; m = nextMonth(m)) {
        const prev = r.months[m];
        const opening = prev ? prev.opening : m === start ? startBal : running;
        for (const x of fresh.filter((x) => x.date.startsWith(m))) {
          running = x.balance;
          r.keys.add(key(x));
          if (Math.abs(x.amount) < ZERO) continue;
          r.cash.push({ date: x.date, amount: x.amount, currency: tb.currency, name: x.counterparty ? `${x.desc} - ${x.counterparty}` : x.desc, notes: x.notes.join(" · "), kind: "bank" });
        }
        const month = { monthEnd: m === asAtMonth ? st.monthEnd : E.lastDayOf(m), opening, closing: running, cashflow: 0, fx: null };
        if ((prev && prev.partial) || (m === start && Math.abs(off) >= ZERO)) month.partial = true;
        if (!cut && m === start && fresh.length) month.startDate = fresh[0].date;
        r.months[m] = month;
        if (!months.some((x) => x.month === m)) months.push({ id: st.id, month: m });
      }
      if (!r.firstMonth || start < r.firstMonth) r.firstMonth = start;
      r.lastMonth = asAtMonth;
      r.downloadEnd = st.monthEnd;
    }

    // An account that drops off the statements with money left in it was closed:
    // its balance moved out before the next loaded statement (bridged as a gap).
    const closed = [];
    for (const r of Object.values(raw)) {
      const last = r.months[r.lastMonth];
      const next = months.map((m) => m.month).sort().find((m) => m > r.lastMonth && parsed.some((st) => !st.standalone && st.monthEnd.startsWith(m)));
      if (!r.consolidated || !next || !last || Math.abs(last.closing) < ZERO) continue;
      r.months[next] = { monthEnd: parsed.find((st) => st.monthEnd.startsWith(next)).monthEnd, opening: 0, closing: 0, cashflow: 0, fx: null, partial: true };
      closed.push({ account: r.label, month: next, balance: last.closing });
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
      a.downloadOnly = (a.downloadOnly !== false) && !r.fromStatements;
      a.cash.push(...r.cash);
      for (const [m, v] of Object.entries(r.months)) {
        const t = (a.months[m] = a.months[m] || { monthEnd: v.monthEnd, opening: 0, closing: 0, cashflow: 0, fx: null });
        t.opening = round2(t.opening + v.opening); t.closing = round2(t.closing + v.closing);
        if (v.partial) t.partial = true;
        if (v.startDate && (!t.startDate || v.startDate < t.startDate)) t.startDate = v.startDate;
      }
    }
    for (const a of Object.values(accounts)) {
      a.cash.sort((x, y) => x.date.localeCompare(y.date));
      a.valuations = Object.values(a.months).map((m) => [m.monthEnd, m.closing]).sort(([x], [y]) => x.localeCompare(y));
    }
    months.sort((a, b) => a.month.localeCompare(b.month));
    const gaps = E.monthGaps(months.map((m) => m.month));
    // Loaded statements that leave out an account still open before and after them.
    const loaded = new Set(months.map((m) => m.month));
    const lastClosingBefore = (r, m) => { const k = Object.keys(r.months).filter((x) => x < m).sort().pop(); return k ? r.months[k].closing : 0; };
    const partialMonths = [...new Set(Object.values(raw).flatMap((r) => [...loaded].filter((m) => m > r.firstMonth && m < r.lastMonth && !r.months[m] && Math.abs(lastClosingBefore(r, m)) >= ZERO)))].sort();
    const first = months.length ? months[0].month : null;
    const firstOpenings = first ? Object.entries(accounts).filter(([, a]) => a.months[first] && Math.abs(a.months[first].opening) >= ZERO)
      .map(([name, a]) => ({ account: name, month: first, opening: a.months[first].opening })) : [];
    return {
      accounts, months, skipped: {}, skippedRows, reconciled: [], late: late_, closed, statements: count, downloads, errors, warnings, gaps, firstOpenings, baseCurrency: "SGD",
      portfolios: portfolios.map((r) => ({ id: r.id, label: r.label, names: r.names, firstMonth: r.firstMonth, lastMonth: r.lastMonth, kind: r.kind, currency: r.currency, account: r.account })),
      partialMonths,
      fixedDeposits: Object.entries(fixed).map(([id, f]) => ({ id, ...f })),
      unmapped: {},
    };
  }

  return { parseStatement, parseStatements, counterparty };
});
