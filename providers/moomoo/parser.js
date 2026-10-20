// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// moomoo monthly securities statement parser. Per currency: one "Securities &
// cash" account (stocks, bonds and cash) and one account per fund. Month-end
// values come from the statement's per-currency net asset value and fund
// position values; flows from the dated cash ledger; trades from the trade
// tables. Works in the browser (window.MooParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../core/layout.js"), require("../../core/export.js"));
  else root.MooParser = factory(root.StatementLayout, root.StatementExport);
})(typeof self !== "undefined" ? self : this, function (L, E) {
  "use strict";

  const { round2 } = E;
  const ZERO = 0.005;
  const NUM_RE = /^[+-]?[\d,]+(\.\d+)?$/;
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));
  const CCY_RE = /^[A-Z]{3}$/;
  const ISIN_RE = /^(SGXZ\d{8}|[A-Z]{2}[A-Z0-9]{9}\d)$/;
  const isoDate = (s) => s.replace(/\//g, "-"); // 2025/01/02 -> 2025-01-02
  const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

  // Cash ledger types -> how they move money. "transfer" types cross accounts
  // (cash <-> fund, currency <-> currency, in/out of moomoo).
  const LEDGER = {
    "Cash In Out": { kind: "transfer", label: (a) => (a > 0 ? "Deposit" : "Withdrawal") },
    "Currency Exchange": { kind: "transfer" },
    "Fund Subscription": { kind: "transfer", fund: +1 },
    "Fund Redemption": { kind: "transfer", fund: -1 },
    "Fund Subscription Fee": { kind: "fee" },
    "Fund Redemption Fee": { kind: "fee" },
    "Corporate Action": { kind: "income" },
    "Cash Dividend": { kind: "income" },
    "Coupon": { kind: "income" },
    "Fund Corporate Action": { kind: "income" },
    "NRA Withholding Tax": { kind: "fee" },
    "Asset Adjustment": { kind: "income" },
  };

  // ---- one statement --------------------------------------------------------
  function parseStatement(pages) {
    const lines = [];
    pages.forEach((items, page) => { for (const l of L.pageLines(items)) lines.push({ ...l, page }); });
    const text = lines.map((l) => l.text).join("\n");
    if (!/Monthly Statement of .*Account/.test(text)) return { error: "not a moomoo monthly statement" };
    const endM = text.match(/Ending Net Asset Value (\d{8})/);
    const startM = text.match(/Starting Net Asset Value (\d{8})/);
    if (!endM) return { error: "no ending net asset value found" };
    const st = { monthEnd: ymd(endM[1]), start: startM ? ymd(startM[1]) : null, nav: {}, navStart: {}, funds: {}, ledger: [], trades: [], problems: [] };

    // Per-currency NAV: "SGD USD HKD ..." header, then the values line.
    const navAfter = (label) => {
      const i = lines.findIndex((l) => l.text.startsWith(label));
      if (i < 0) return {};
      const head = lines.slice(i + 1, i + 4).find((l) => l.items.every((it) => CCY_RE.test(it.s)) && l.items.length >= 2);
      const vals = lines.slice(i + 1, i + 6).find((l) => l !== head && l.items.length === (head ? head.items.length : 0) && l.items.every((it) => NUM_RE.test(it.s)));
      if (!head || !vals) { st.problems.push(`${label}: per-currency values not found`); return {}; }
      return Object.fromEntries(head.items.map((it, k) => [it.s, num(vals.items[k].s)]));
    };
    st.navStart = navAfter("Starting Net Asset Value");
    st.nav = navAfter("Ending Net Asset Value");

    // Sections in reading order.
    let section = null, sub = null, table = null, prev = null;
    const tables = [];
    for (const l of lines) {
      const before = prev; prev = l;
      if (/^(Monthly Statement of|Preparation Date|Account Name:|Client Name:|Important Notice)/.test(l.text) || /^[A-Z][a-z]{2} \d{4}$/.test(l.text)) continue;
      if (/^Changes in Position Value$/.test(l.text)) { section = "positions"; table = null; continue; }
      if (/^Trades - (Securities|Funds|Bonds)$/.test(l.text)) { section = "trades-" + l.text.split(" - ")[1].toLowerCase(); table = null; continue; }
      if (/^Changes in Cash$/.test(l.text)) { section = "cash"; table = null; continue; }
      if (/^Ending Positions$/.test(l.text)) { section = "ending"; table = null; continue; }
      if (section === "positions" && /^(Securities|Funds|Bonds)$/.test(l.text)) { sub = l.text.toLowerCase(); table = null; continue; }
      if (section === "positions" && /^(Symbol\s+)?Exchange\s+Currency\s+Quantity/.test(l.text)) { table = { type: "pos-" + sub, cols: l.items, lines: [] }; tables.push(table); continue; }
      if (section && section.startsWith("trades") && /^Direction\s+/.test(l.text)) {
        // Some headers wrap: a lone word ("Price") sits just above the header line.
        const cols = before && before.page === l.page && before.y - l.y < 6 && before.items.length === 1 && /^[A-Z][a-z]+$/.test(before.items[0].s)
          ? [...l.items, before.items[0]].sort((a, b) => a.x - b.x) : l.items;
        if (table && table.type === section && table.lines.length && table.lines[table.lines.length - 1] === before) table.lines.pop();
        if (!(table && table.type === section)) { table = { type: section, cols, lines: [] }; tables.push(table); }
        else table.cols = cols;
        continue;
      }
      const cashHead = section === "cash" && l.text.match(/^([A-Z]{3})\s+Date\/Time\s+Type\s+Amount\s+Comment/);
      if (cashHead) { table = { type: "cash", ccy: cashHead[1], cols: l.items, lines: [] }; tables.push(table); continue; }
      if (!table) continue;
      if (/^(Starting|Changes in|Position Value|Quantity)$/.test(l.text) || /^Starting\s+Ending$/.test(l.text)) continue;
      table.lines.push(l);
    }

    for (const tb of tables) {
      if (tb.type === "pos-funds") parseFunds(st, tb);
      else if (tb.type === "cash") parseCash(st, tb);
      else if (tb.type === "trades-securities") parseSecTrades(st, tb);
      else if (tb.type === "trades-funds") parseFundTrades(st, tb);
    }
    return st;
  }

  // Rows separated by vertical gaps (and page breaks).
  function groupRows(lines, gap = 1.6) {
    const rows = [];
    let row = null, prev = null;
    for (const l of lines) {
      if (!row || l.page !== prev.page || prev.y - l.y > gap * Math.max(l.h, prev.h) + 1) rows.push((row = []));
      row.push(l);
      prev = l;
    }
    return rows;
  }
  // Column of a cell: the header whose centre is nearest (numbers are right-aligned, text left-aligned).
  const colOf = (cols, it) => cols.reduce((best, h) => (Math.abs(it.x + it.w / 2 - (h.x + h.w / 2)) < Math.abs(it.x + it.w / 2 - (best.x + best.w / 2)) ? h : best), cols[0]).s;

  function parseFunds(st, tb) {
    // Each fund row ends with its ISIN line; the name wraps above and may share the data line.
    let row = [];
    for (const l of tb.lines) {
      if (/^(SGD|USD|HKD|CNH|JPY|KRW) Total/.test(l.text)) { row = []; continue; }
      row.push(l);
      if (!ISIN_RE.test(l.text.trim())) continue;
      const isin = l.text.trim();
      let data = null, k = -1;
      for (const r of row) {
        const idx = r.items.findIndex((it, n) => CCY_RE.test(it.s) && n > 0 && r.items.slice(n + 1, n + 8).length === 7 && r.items.slice(n + 1, n + 8).every((x) => NUM_RE.test(x.s) || x.s === "-"));
        if (idx > 0) { data = r; k = idx; break; }
      }
      if (!data) { st.problems.push(`fund row not understood: ${row.map((r) => r.text).join(" | ").slice(0, 90)}`); row = []; continue; }
      const v = data.items.slice(k).map((it) => it.s); // CCY, qty, price, value, qty, price, value, ...
      const nameParts = row.filter((r) => r !== l).flatMap((r) => (r === data ? r.items.slice(0, k - 1) : r.items).map((it) => it.s));
      const name = nameParts.join(" ").replace(/\s+/g, " ").trim();
      const n = (x) => (x === "-" ? 0 : num(x));
      const f = (st.funds[isin] = st.funds[isin] || { id: isin, isin, name, currency: v[0], startValue: 0, endValue: 0, endUnits: 0 });
      f.startValue += n(v[3]); f.endValue += n(v[6]); f.endUnits += n(v[4]);
      row = [];
    }
  }

  function parseCash(st, tb) {
    const x = Object.fromEntries(tb.cols.map((c) => [c.s, c.x]));
    const left = x["Date/Time"] - 4;
    const ll = tb.lines.map((l) => ({ ...l, items: l.items.filter((it) => it.x >= left) })).filter((l) => l.items.length);
    // Rows are anchored on the Date/Time cell ("-" marks summary lines). Type and Amount cells
    // may sit a few points off that line, and comment lines wrap above and below it.
    const rows = [], cells = [], notes = [];
    const DATE_RE = /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/;
    for (const l of ll) {
      for (const it of l.items) {
        if (it.x < x.Type - 4 && (DATE_RE.test(it.s) || it.s === "-")) rows.push({ date: DATE_RE.test(it.s) ? isoDate(it.s.slice(0, 10)) : null, type: [], amount: null, comment: [], y: l.y, page: l.page });
        else if (it.x < x.Comment - 4) cells.push({ it, y: l.y, page: l.page });
        else notes.push({ y: l.y, page: l.page, items: [it.s] });
      }
    }
    const nearest = (c, max) => { const r = rows.filter((r) => r.page === c.page).sort((a, b) => Math.abs(a.y - c.y) - Math.abs(b.y - c.y))[0]; return r && Math.abs(r.y - c.y) < max ? r : null; };
    for (const c of cells) {
      const r = nearest(c, 6);
      if (!r) continue;
      if (NUM_RE.test(c.it.s) && c.it.x > x.Type + 60) r.amount = num(c.it.s); else r.type.push(c.it.s);
    }
    for (const r of rows) r.type = r.type.join(" ");
    // Comment lines wrap above and below their row: attach each to the nearest row.
    for (const n of notes) {
      const near = nearest(n, 14);
      if (near) near.comment.push(...n.items.map((s) => ({ s, y: n.y })));
    }
    for (const r of rows) {
      if (!r.date) continue;
      if (r.amount == null) { st.problems.push(`${tb.ccy} ledger row without amount: ${r.date} ${r.type}`); continue; }
      const comment = r.comment.sort((a, b) => b.y - a.y).map((c) => c.s).join(" ").replace(/\s+/g, " ").trim();
      st.ledger.push({ date: r.date, type: r.type, amount: r.amount, currency: tb.ccy, comment });
    }
  }

  function parseSecTrades(st, tb) {
    // One trade per block ending with its "Subtotal:" (fees) line.
    let block = [];
    for (const l of tb.lines) {
      if (/^(Subtotal:|Total of Transaction Fee|Buy$|Sell$|USD Total|SGD Total|HKD Total|Trading Activity)/.test(l.text)) {
        if (/^Subtotal:/.test(l.text) && block.length) {
          const t = secTrade(tb, block, l);
          if (t) st.trades.push(t); else st.problems.push(`trade not understood: ${block.map((b) => b.text).join(" | ").slice(0, 90)}`);
        }
        block = [];
        continue;
      }
      block.push(l);
    }
  }

  function secTrade(tb, block, subtotal) {
    const cells = {};
    for (const l of block) for (const it of l.items) (cells[colOf(tb.cols, it)] = cells[colOf(tb.cols, it)] || []).push(it.s);
    const dir = (cells.Direction || []).join(" ");
    const sym = (cells.Symbol || []).filter((s) => /^[A-Z0-9.]{1,12}$/.test(s)).pop();
    const date = ((cells["Date/Time"] || []).join(" ").match(/\d{4}\/\d{2}\/\d{2}/) || [])[0];
    // The quantity can share the date line ("2025/01/02  10"), so read it from the Quantity column or that line.
    const qty = [...(cells.Quantity || []), ...(cells["Date/Time"] || [])].map((s) => s.trim()).find((s) => NUM_RE.test(s));
    const price = (cells.Price || []).find((s) => NUM_RE.test(s));
    const ccy = (cells.Currency || []).find((s) => CCY_RE.test(s));
    const fee = (subtotal.text.match(/Subtotal:\s*([\d,.]+)/) || [])[1];
    if (!dir || !sym || !date || !qty || !price) return null;
    const sell = /^Sell/i.test(dir);
    return { kind: "security", date: isoDate(date), ticker: sym, qty: sell ? -num(qty) : num(qty), price: num(price), currency: ccy || "USD", fee: fee ? num(fee) : 0, name: dir };
  }

  function parseFundTrades(st, tb) {
    for (const row of groupRows(tb.lines.filter((l) => !/^(USD Total|SGD Total|Buy$|Sell$|Total of Transaction|\d[\d,. -]*$)/.test(l.text)), 1.4)) {
      const cells = {};
      for (const l of row) for (const it of l.items) (cells[colOf(tb.cols, it)] = cells[colOf(tb.cols, it)] || []).push(it.s);
      const dir = (cells.Direction || [])[0];
      const date = ((cells["Date/Time"] || []).join(" ").match(/\d{4}\/\d{2}\/\d{2}/) || [])[0];
      const isin = row.flatMap((l) => l.items.map((it) => it.s)).find((s) => ISIN_RE.test(s));
      const ccy = (cells.Currency || []).find((s) => CCY_RE.test(s));
      const nums = ["Price", "Quantity", "Amount"].map((k) => (cells[k] || []).find((s) => NUM_RE.test(s)));
      if (!dir || !date || !nums.every(Boolean)) { st.problems.push(`fund trade not understood: ${row.map((l) => l.text).join(" | ").slice(0, 90)}`); continue; }
      const out = /^Redemption/i.test(dir);
      st.trades.push({ kind: "fund", date: isoDate(date), ticker: isin, isin, qty: out ? -num(nums[1]) : num(nums[1]), price: num(nums[0]), amount: num(nums[2]), currency: ccy, name: dir });
    }
  }

  // ---- all statements -------------------------------------------------------
  // config per account id ("cash:USD", "fund:<ISIN>"): { name, kind, mergeInto, exclude }.
  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], months = [], skipped = {}, skippedRows = [];
    const skip = (date, category, detail, portfolio) => { skipped[category] = (skipped[category] || 0) + 1; skippedRows.push({ date, category, detail, account: portfolio }); };
    const parsed = [];
    for (const s of statements) {
      const st = parseStatement(s.pages);
      if (st.error) { errors.push({ id: s.id, error: st.error }); continue; }
      parsed.push({ ...st, id: s.id });
    }
    parsed.sort((a, b) => a.monthEnd.localeCompare(b.monthEnd));
    const seen = new Set(), list = [];
    for (const st of parsed) {
      const month = st.monthEnd.slice(0, 7);
      if (seen.has(month)) { errors.push({ id: st.id, error: `duplicate statement for ${month}, ignored` }); continue; }
      seen.add(month); months.push({ id: st.id, month }); list.push({ ...st, month });
      for (const p of st.problems) warnings.push(`${month}: ${p}`);
    }

    const raw = {};
    const acct = (id, init) => (raw[id] = raw[id] || { id, months: {}, trades: [], cash: [], firstMonth: null, lastMonth: null, ...init });
    const fundName = {}, fundCcy = {}, fundNames = {};
    for (const st of list) for (const f of Object.values(st.funds)) { fundName[f.id] = f.name; fundCcy[f.id] = f.currency; (fundNames[f.id] = fundNames[f.id] || new Set()).add(f.name); }
    const allFundTrades = list.flatMap((st) => st.trades.filter((t) => t.kind === "fund"));
    const squash = (x) => x.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    // The fund a ledger row refers to: its comment names the fund ("Fund Subscription#<name>").
    const fundFor = (r) => {
      const c = squash(r.comment.replace(/^[^#]*#/, ""));
      const hits = c.length < 6 ? [] : Object.keys(fundName).filter((id) => fundCcy[id] === r.currency && [...fundNames[id]].some((n) => { const q = squash(n); return q === c || q.includes(c) || c.includes(q); }));
      if (hits.length === 1) return hits[0];
      // No (usable) comment: the fund trade with the same amount, closest in date.
      const days = (d) => Date.parse(d) / 864e5;
      const t = allFundTrades.filter((t) => t.currency === r.currency && Math.abs(Math.abs(t.amount) - Math.abs(r.amount)) < ZERO && Math.abs(days(t.date) - days(r.date)) <= 10 && (t.qty < 0) === (r.amount > 0))
        .sort((x, y) => Math.abs(days(x.date) - days(r.date)) - Math.abs(days(y.date) - days(r.date)));
      return t.length ? t[0].isin : null;
    };
    let prevFunds = {};
    // Money paid for a fund but not yet allotted (or redeemed but not yet paid out) at month end:
    // the statement counts it as cash, the ledger has already moved it, so it belongs to the fund.
    const transit = {};
    let prevTransit = {};
    for (const st of list) {
      const { month, monthEnd } = st;
      const fundsByCcy = {};
      for (const f of Object.values(st.funds)) (fundsByCcy[f.currency] = fundsByCcy[f.currency] || []).push(f);
      const ccys = new Set([...Object.keys(st.nav), ...st.ledger.map((r) => r.currency)]);
      for (const c of ccys) {
        const fs = fundsByCcy[c] || [];
        const open = round2((st.navStart[c] || 0) - fs.reduce((s, f) => s + f.startValue, 0));
        const close = round2((st.nav[c] || 0) - fs.reduce((s, f) => s + f.endValue, 0));
        const active = Math.abs(open) >= ZERO || Math.abs(close) >= ZERO || st.ledger.some((r) => r.currency === c);
        if (!active && !raw[`cash:${c}`]) continue;
        const a = acct(`cash:${c}`, { label: `${c} Securities & Cash`, kind: "investment", currency: c, names: [`${c} Securities & Cash`] });
        a.firstMonth = a.firstMonth || month; a.lastMonth = month;
        a.months[month] = { monthEnd, opening: open, closing: close, cashflow: 0, fx: null };
      }
      // A fund redeemed in full drops off the next statement: it ends that month at 0.
      for (const [id, f] of Object.entries(prevFunds)) if (!st.funds[id] && Math.abs(f.endValue) >= ZERO) st.funds[id] = { ...f, startValue: f.endValue, endValue: 0, endUnits: 0 };
      // Funds paid for this month but not yet allotted still need an account for the cash.
      for (const r of st.ledger) { const id = LEDGER[r.type] && LEDGER[r.type].fund ? fundFor(r) : null; if (id && !st.funds[id]) st.funds[id] = { id, name: fundName[id], currency: r.currency, startValue: 0, endValue: 0, endUnits: 0 }; }
      for (const r of st.ledger) {
        const rule = LEDGER[r.type], id = rule && rule.fund ? fundFor(r) : null;
        if (id) transit[id] = round2((transit[id] || 0) - r.amount);
      }
      for (const t of st.trades) if (t.kind === "fund" && t.isin) transit[t.isin] = round2((transit[t.isin] || 0) - (t.qty < 0 ? -t.amount : t.amount));
      const openTransit = {};
      for (const f of Object.values(st.funds)) {
        openTransit[f.id] = prevTransit[f.id] || 0;
        f.startValue += openTransit[f.id]; f.endValue += transit[f.id] || 0;
        const c = raw[`cash:${f.currency}`];
        if (c && c.months[month]) { c.months[month].opening = round2(c.months[month].opening - openTransit[f.id]); c.months[month].closing = round2(c.months[month].closing - (transit[f.id] || 0)); }
      }
      prevTransit = { ...transit };
      for (const f of Object.values(st.funds)) {
        const a = acct(`fund:${f.id}`, { label: f.name, kind: "investment", currency: f.currency, names: [f.name] });
        a.firstMonth = a.firstMonth || month; a.lastMonth = month;
        a.months[month] = { monthEnd, opening: round2(f.startValue), closing: round2(f.endValue), cashflow: 0, fx: null };
      }
      prevFunds = Object.fromEntries(Object.entries(st.funds).filter(([, f]) => Math.abs(f.endValue) >= ZERO));
      // Ledger rows: securities & cash side; fund subscriptions/redemptions also on the fund.
      for (const r of st.ledger) {
        const rule = LEDGER[r.type];
        const cashAcct = raw[`cash:${r.currency}`];
        if (!rule) { skip(r.date, "unknown", `${r.type} ${r.amount} ${r.currency}`, cashAcct && cashAcct.label); continue; }
        const name = rule.label ? rule.label(r.amount) : r.type;
        // Internal sign convention: inflow negative.
        cashAcct.cash.push({ date: r.date, amount: round2(-r.amount), currency: r.currency, kind: rule.kind, name, notes: r.comment });
        if (rule.fund && Math.abs(r.amount) >= ZERO) {
          const targetId = fundFor(r);
          if (!targetId) { warnings.push(`${month}: ${r.type} ${r.amount} ${r.currency} doesn't name a known fund: ${r.comment.slice(0, 60)}`); continue; }
          raw[`fund:${targetId}`].cash.push({ date: r.date, amount: round2(r.amount), currency: r.currency, kind: "transfer",
            name: rule.fund > 0 ? "Subscription (from cash)" : "Redemption (to cash)", notes: r.comment });
        }
      }
      for (const t of st.trades) {
        if (t.kind === "security") { const a = raw[`cash:${t.currency}`]; if (a) a.trades.push({ ...t, name: t.name }); }
        else { const a = raw[`fund:${t.isin}`] || Object.values(raw).find((x) => x.id.startsWith("fund:") && fundName[x.id.slice(5)] && t.isin && x.id.endsWith(t.isin)); if (a) a.trades.push(t); }
      }
    }

    // Fund labels: the latest name (funds get renamed), spelled as in the ledger comments when
    // they agree (PDF text can split words: "Cas h").
    const commentNames = list.flatMap((st) => st.ledger.map((r) => r.comment.replace(/^[^#]*#/, "").trim())).filter(Boolean);
    for (const r of Object.values(raw)) {
      if (!r.id.startsWith("fund:")) continue;
      const n = fundName[r.id.slice(5)] || r.label;
      r.label = commentNames.find((c) => squash(c) === squash(n)) || n;
      r.names = [...new Set([r.label, ...(fundNames[r.id.slice(5)] || [])])];
    }

    // Config and accounts (same contract as the other converters).
    const rootOf = (id) => { const p = new Set(); while (config[id] && config[id].mergeInto && raw[config[id].mergeInto] && !p.has(id)) { p.add(id); id = config[id].mergeInto; } return id; };
    const portfolios = Object.values(raw).sort((a, b) => (a.id.startsWith("cash:") ? 0 : 1) - (b.id.startsWith("cash:") ? 0 : 1) || a.firstMonth.localeCompare(b.firstMonth) || a.label.localeCompare(b.label));
    const accounts = {};
    for (const r of portfolios) {
      const root = raw[rootOf(r.id)];
      if ((config[root.id] || {}).exclude || (config[r.id] || {}).exclude) { r.account = null; continue; }
      const name = ((config[root.id] || {}).name || "").trim() || root.label;
      r.account = name;
      const a = (accounts[name] = accounts[name] || { kind: (config[root.id] || {}).kind || root.kind, currency: root.currency, valuations: [], trades: [], cash: [], months: {}, portfolios: [] });
      a.portfolios.push(r.id);
      a.trades.push(...r.trades); a.cash.push(...r.cash);
      for (const [m, v] of Object.entries(r.months)) {
        const t = (a.months[m] = a.months[m] || { monthEnd: v.monthEnd, opening: 0, closing: 0, cashflow: 0, fx: null });
        t.opening = round2(t.opening + v.opening); t.closing = round2(t.closing + v.closing);
      }
    }
    for (const [name, a] of Object.entries(accounts)) {
      if (a.kind !== "investment" && a.trades.length) { for (const t of a.trades) skip(t.date, "trade in cash-like account", t.name, name); a.trades = []; }
      a.trades.sort((x, y) => x.date.localeCompare(y.date));
      a.cash.sort((x, y) => x.date.localeCompare(y.date));
      a.valuations = Object.values(a.months).map((m) => [m.monthEnd, m.closing]).sort(([x], [y]) => x.localeCompare(y));
    }
    const gaps = E.monthGaps(months.map((m) => m.month));
    const first = months.length ? months[0].month : null;
    const firstOpenings = first ? Object.entries(accounts).filter(([, a]) => a.months[first] && Math.abs(a.months[first].opening) >= ZERO)
      .map(([name, a]) => ({ account: name, month: first, opening: a.months[first].opening })) : [];
    return {
      accounts, months, skipped, skippedRows, reconciled: [], errors, warnings, gaps, firstOpenings, baseCurrency: "USD",
      portfolios: portfolios.map((r) => ({ id: r.id, label: r.label, names: r.names, firstMonth: r.firstMonth, lastMonth: r.lastMonth, kind: r.kind, currency: r.currency, account: r.account })),
      unmapped: {},
    };
  }

  return { parseStatement, parseStatements };
});
