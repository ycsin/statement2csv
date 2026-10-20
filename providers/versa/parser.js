// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// AHAM Capital (Versa) Statement of Account parser. One statement lists every
// transaction of each unit trust fund since the holding was last zero, with
// units, unit price and the units balance, and ends with the market value at
// the statement date. Each account (and fund currency) is an investment
// account holding its funds; switches between its funds are trades. Month-end
// values are each fund's units times its latest unit price on the statement up
// to that day (a transaction's price, or the closing NAV), so they're exact at
// the statement date and close in between.
// Works in the browser (window.AhamParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../core/layout.js"), require("../../core/export.js"));
  else root.AhamParser = factory(root.StatementLayout, root.StatementExport);
})(typeof self !== "undefined" ? self : this, function (L, E) {
  "use strict";

  const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const { round2, pad } = E;
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));
  const val = (s) => (s === "-" ? 0 : num(s));
  const DATE_RE = /^(\d{2})-([A-Z][a-z]{2})-(\d{4})$/;
  const iso = (s) => { const m = s.match(DATE_RE); return `${m[3]}-${pad(MONTHS[m[2]])}-${m[1]}`; };
  const isoParts = (d, mo, y) => `${y}-${pad(MONTHS[mo[0].toUpperCase() + mo.slice(1).toLowerCase()])}-${d}`;
  const nextMonth = (m) => { let [y, mo] = m.split("-").map(Number); mo += 1; if (mo > 12) { mo = 1; y += 1; } return `${y}-${pad(mo)}`; };
  const UNITS_TOL = 0.015;
  // Transaction types and which way they move units; anything else is reported.
  const TYPES = {
    "Investment": +1, "Income Distributions": +1, "Income Distribution": +1, "Switching In": +1,
    "Redemption": -1, "Switching Out": -1,
  };

  // ---- one statement --------------------------------------------------------
  // pages: [[{ str, x, y, w, h }, ...], ...] (pdf.js text items per page).
  // The heading is letter-spaced ("STAT EM EN T O F AC C O U N T"), so headings
  // are matched with the spaces taken out. Per fund: "<FUND NAME>", then
  // "Fund Currency: MYR | Plan: Cash | NAV as at 01-Jan-2026: 1.0000", the
  // investment overview, and rows "date | [type] | amount | charge % | charge |
  // SST | net amount | unit price | units | units balance". A type that doesn't
  // fit ("Income Distributions") wraps onto the lines just above and below.
  function parseStatement(pages) {
    const all = pages.map((items) => L.pageLines(items));
    const squash = all.flat().map((l) => l.text.replace(/\s+/g, "")).join("\n");
    if (!/STATEMENTOFACCOUNT/i.test(squash) || !/AHAM|Affin/i.test(squash)) return { error: "not an AHAM Capital statement of account" };
    const period = squash.match(/\((\d{2})-([A-Za-z]{3})-(\d{4})-(\d{2})-([A-Za-z]{3})-(\d{4})\)/);
    if (!period) return { error: "no statement period found" };
    const st = { from: isoParts(period[1], period[2], period[3]), monthEnd: isoParts(period[4], period[5], period[6]), funds: [], problems: [] };
    let fund = null;
    for (const [p, lines] of all.entries()) {
      for (const [i, l] of lines.entries()) {
        const t = l.text;
        if (!st.account) { const no = l.items.find((it) => /^\d{6,}-\d{3}$/.test(it.s)); if (no) st.account = no.s; }
        if (p === 0 && /^Total\b/.test(t) && !st.marketValue) {
          const nums = l.items.filter((it) => /^[\d,]+\.\d{2}$/.test(it.s));
          if (nums.length >= 2) st.marketValue = num(nums[nums.length - 1].s);
        }
        const fc = t.match(/^Fund Currency:\s*([A-Z]{3})\b/);
        if (fc) {
          const name = (lines[i - 1] ? lines[i - 1].text : "").trim();
          const nav = t.match(/NAV as at (\d{2}-[A-Z][a-z]{2}-\d{4}):\s*([\d.]+)/);
          fund = { name, currency: fc[1], nav: nav ? { date: iso(nav[1]), price: num(nav[2]) } : null, rows: [] };
          st.funds.push(fund);
          continue;
        }
        if (!fund) continue;
        const ov = t.match(/^Units Balance\s+([\d,]+\.\d+)/);
        if (ov) { fund.unitsBalance = num(ov[1]); continue; }
        const mv = t.match(/Market Value\s+[A-Z]{3}\s+([\d,]+\.\d{2})/);
        if (mv) { fund.marketValue = num(mv[1]); continue; }
        const d = l.items[0];
        if (!DATE_RE.test(d.s) || d.x > 60) continue;
        const values = l.items.filter((it) => it.x >= 185).map((it) => it.s);
        if (values.length !== 8 || !values.every((v) => v === "-" || /^-?[\d,]+\.\d+$/.test(v))) { st.problems.push(`${fund.name} ${t}: row not understood`); continue; }
        // The type: on the row, or wrapped onto the lines just above and below.
        const typeOf = (line) => line.items.filter((it) => it.x >= 110 && it.x < 185).map((it) => it.s);
        const near = lines.filter((o) => o !== l && Math.abs(o.y - l.y) <= 12 && !DATE_RE.test(o.items[0].s)).sort((a, b) => b.y - a.y);
        const above = near.filter((o) => o.y > l.y).flatMap(typeOf), below = near.filter((o) => o.y < l.y).flatMap(typeOf);
        const type = [...above, ...typeOf(l), ...below].join(" ").replace(/\s+/g, " ").trim();
        const [amount, chargePct, charge, sst, net, price, units, balance] = values.map(val);
        fund.rows.push({ date: iso(d.s), type, amount, chargePct, charge, sst, net, price, units, balance });
      }
    }
    if (!st.account) return { error: "no account number found" };
    if (!st.funds.length) return { error: "no funds found in this statement" };
    for (const f of st.funds) {
      let units = f.rows.length ? round4(f.rows[0].balance - dir(f.rows[0]) * f.rows[0].units) : 0;
      f.openingUnits = units;
      for (const r of f.rows) {
        units = round4(units + dir(r) * r.units);
        if (Math.abs(units - r.balance) > UNITS_TOL) st.problems.push(`${f.name} ${r.date} ${r.type}: units ${r.units} don't take the balance to ${r.balance}`);
        units = r.balance;
        if (!(r.type in TYPES)) st.problems.push(`${f.name} ${r.date}: transaction type "${r.type}" not recognised`);
      }
      if (f.unitsBalance != null && Math.abs(f.unitsBalance - units) > UNITS_TOL) st.problems.push(`${f.name}: units balance ${f.unitsBalance}, rows end at ${units}`);
      if (f.marketValue != null && f.nav && Math.abs(round2(units * f.nav.price) - f.marketValue) >= 0.015) st.problems.push(`${f.name}: market value ${f.marketValue}, units × NAV is ${round2(units * f.nav.price)}`);
    }
    if (st.marketValue != null) {
      const sum = round2(st.funds.reduce((s, f) => s + (f.marketValue || 0), 0));
      if (Math.abs(sum - st.marketValue) >= 0.015) st.problems.push(`total market value ${st.marketValue}, funds add up to ${sum}`);
    }
    return st;
  }
  const round4 = (n) => Math.round(n * 1e4) / 1e4;
  // Direction from the type; for an unknown type, from how it moved the balance.
  function dir(r) { return TYPES[r.type] || 0; }

  // ---- all statements -------------------------------------------------------
  // statements: [{ id, pages }], any order (later statements repeat earlier
  // rows; each row is kept once). config per account id ("<account no>:<CCY>"):
  // { name, kind, mergeInto, exclude }.
  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], skippedRows = [];
    const parsed = [];
    for (const s of statements) {
      const st = parseStatement(s.pages);
      if (st.error) { errors.push({ id: s.id, error: st.error }); continue; }
      parsed.push({ ...st, id: s.id });
    }
    parsed.sort((a, b) => a.monthEnd.localeCompare(b.monthEnd));
    const seen = new Set();
    const raw = {};
    let count = 0, lastEnd = null;
    for (const st of parsed) {
      const dup = `${st.account}|${st.monthEnd}`;
      if (seen.has(dup)) { errors.push({ id: st.id, error: `duplicate statement for ${st.monthEnd}, ignored` }); continue; }
      seen.add(dup);
      count++;
      if (!lastEnd || st.monthEnd > lastEnd) lastEnd = st.monthEnd;
      for (const pr of st.problems) warnings.push(`${st.monthEnd}: ${pr}`);
      for (const f of st.funds) {
        const id = `${st.account}:${f.currency}`;
        const label = `AHAM Capital #${st.account.slice(-7)}${f.currency === "MYR" ? "" : " " + f.currency}`;
        const r = (raw[id] = raw[id] || { id, label, kind: "investment", currency: f.currency, names: [label], funds: {}, end: null });
        if (!r.end || st.monthEnd > r.end) r.end = st.monthEnd;
        const fd = (r.funds[f.name] = r.funds[f.name] || { name: f.name, rows: [], keys: new Set(), prices: [], openingUnits: null });
        if (fd.openingUnits == null || (f.rows[0] && (!fd.rows[0] || f.rows[0].date < fd.rows[0].date))) fd.openingUnits = f.openingUnits;
        for (const x of f.rows) {
          const k = `${x.date}|${x.type}|${x.amount}|${x.units}|${x.balance}`;
          if (fd.keys.has(k)) continue;
          fd.keys.add(k);
          fd.rows.push(x);
          fd.prices.push([x.date, x.price]);
        }
        if (f.nav) fd.prices.push([f.nav.date, f.nav.price]);
        if (!f.rows.length && f.unitsBalance && fd.openingUnits == null) fd.openingUnits = f.unitsBalance;
      }
    }

    // Per account: cash entries, trades, and month-end values.
    for (const r of Object.values(raw)) {
      r.cash = []; r.trades = []; r.months = {};
      const funds = Object.values(r.funds);
      for (const f of funds) { f.rows.sort((a, b) => a.date.localeCompare(b.date)); f.prices.sort((a, b) => a[0].localeCompare(b[0])); }
      // Switches between this account's funds on the same day for the same
      // amount are internal: trades only, no cash.
      const switches = funds.flatMap((f) => f.rows.filter((x) => /^Switching (In|Out)$/.test(x.type)).map((x) => ({ f, x })));
      const internal = new Set();
      for (const o of switches.filter((s) => s.x.type === "Switching Out")) {
        const i = switches.find((s) => s.x.type === "Switching In" && !internal.has(s.x) && s.f !== o.f && s.x.date === o.x.date && Math.abs(s.x.amount - o.x.amount) < 0.005);
        if (i) { internal.add(o.x); internal.add(i.x); }
      }
      for (const f of funds) {
        for (const x of f.rows) {
          const d = dir(x) || 0;
          const qty = d * x.units;
          if (qty) r.trades.push({ date: x.date, ticker: f.name, qty, price: x.price, currency: r.currency, name: `${qty > 0 ? "Buy" : "Sell"} ${f.name} (${x.type})` });
          const fee = round2(Math.abs(x.amount - x.net));
          // Internal sign convention: inflow negative.
          if (/^Income Distribution/.test(x.type)) r.cash.push({ date: x.date, amount: -x.net, currency: r.currency, name: `Income distribution (reinvested) - ${f.name}`, kind: "income" });
          else if (x.type === "Investment") {
            r.cash.push({ date: x.date, amount: -x.amount, currency: r.currency, name: `Investment - ${f.name}`, kind: "deposit" });
            if (fee >= 0.005) r.cash.push({ date: x.date, amount: fee, currency: r.currency, name: `Sales charge - ${f.name}`, notes: x.chargePct ? `${x.chargePct}%` : "", kind: "fee" });
          } else if (x.type === "Redemption") {
            r.cash.push({ date: x.date, amount: x.net, currency: r.currency, name: `Redemption - ${f.name}`, kind: "withdrawal" });
            if (fee >= 0.005) r.cash.push({ date: x.date, amount: fee, currency: r.currency, name: `Redemption charge - ${f.name}`, kind: "fee" });
          } else if (/^Switching (In|Out)$/.test(x.type)) {
            if (!internal.has(x)) r.cash.push({ date: x.date, amount: x.type === "Switching In" ? -x.net : x.net, currency: r.currency, name: `${x.type} - ${f.name}`, kind: "transfer" });
          } else {
            skippedRows.push({ date: x.date, category: "unknown", detail: `${x.type || "(no type)"} - ${f.name}`, account: r.label });
          }
        }
      }
      r.cash.sort((a, b) => a.date.localeCompare(b.date));
      r.trades.sort((a, b) => a.date.localeCompare(b.date));

      // Month-end values: units at that day × latest known price, per fund.
      const unitsAt = (f, day) => { let u = f.openingUnits || 0; for (const x of f.rows) if (x.date <= day) u = x.balance; return u; };
      const priceAt = (f, day) => { let p = null; for (const [d, v] of f.prices) if (d <= day) p = v; return p; };
      const starts = funds.map((f) => (f.rows[0] ? f.rows[0].date : r.end)).sort();
      r.firstMonth = starts[0].slice(0, 7);
      r.lastMonth = r.end.slice(0, 7);
      let prevClose = null;
      for (let m = r.firstMonth; m <= r.lastMonth; m = nextMonth(m)) {
        const monthEnd = m === r.lastMonth ? r.end : E.lastDayOf(m);
        let closing = 0;
        for (const f of funds) {
          const u = unitsAt(f, monthEnd);
          if (Math.abs(u) < 0.005) continue;
          const p = priceAt(f, monthEnd);
          if (p == null) { warnings.push(`${m}: ${f.name}: no unit price yet`); continue; }
          closing += round2(u * p);
        }
        closing = round2(closing);
        let opening = prevClose;
        if (opening == null) {
          // Before the first row: the units the statement starts from (normally 0).
          opening = round2(funds.reduce((s, f) => s + (f.openingUnits && f.prices[0] ? f.openingUnits * f.prices[0][1] : 0), 0));
        }
        r.months[m] = { monthEnd, opening, closing, cashflow: 0, fx: null };
        prevClose = closing;
      }
    }

    const months = [];
    for (const r of Object.values(raw)) for (const m of Object.keys(r.months)) if (!months.some((x) => x.month === m)) months.push({ month: m });
    months.sort((a, b) => a.month.localeCompare(b.month));

    const rootOf = (id) => { const path = new Set(); while (config[id] && config[id].mergeInto && raw[config[id].mergeInto] && !path.has(id)) { path.add(id); id = config[id].mergeInto; } return id; };
    const portfolios = Object.values(raw).sort((a, b) => a.firstMonth.localeCompare(b.firstMonth) || a.label.localeCompare(b.label));
    const accounts = {};
    for (const r of portfolios) {
      const root = raw[rootOf(r.id)];
      if ((config[root.id] || {}).exclude || (config[r.id] || {}).exclude) { r.account = null; continue; }
      const name = ((config[root.id] || {}).name || "").trim() || root.label;
      r.account = name;
      const a = (accounts[name] = accounts[name] || { kind: (config[root.id] || {}).kind || root.kind, currency: root.currency, valuations: [], trades: [], cash: [], months: {}, portfolios: [], funds: [] });
      a.portfolios.push(r.id);
      a.cash.push(...r.cash);
      a.trades.push(...r.trades);
      a.funds.push(...Object.keys(r.funds));
      for (const [m, v] of Object.entries(r.months)) {
        const t = (a.months[m] = a.months[m] || { monthEnd: v.monthEnd, opening: 0, closing: 0, cashflow: 0, fx: null });
        t.opening = round2(t.opening + v.opening); t.closing = round2(t.closing + v.closing);
      }
    }
    for (const a of Object.values(accounts)) {
      a.cash.sort((x, y) => x.date.localeCompare(y.date));
      a.trades.sort((x, y) => x.date.localeCompare(y.date));
      a.valuations = Object.values(a.months).map((m) => [m.monthEnd, m.closing]).sort(([x], [y]) => x.localeCompare(y));
    }
    const first = months.length ? months[0].month : null;
    const firstOpenings = first ? Object.entries(accounts).filter(([, a]) => a.months[first] && Math.abs(a.months[first].opening) >= 0.005)
      .map(([name, a]) => ({ account: name, month: first, opening: a.months[first].opening })) : [];
    return {
      accounts, months, skipped: {}, skippedRows, late: [], statements: count, errors, warnings, gaps: [], partialMonths: [], firstOpenings, baseCurrency: "MYR",
      marketValue: parsed.length ? parsed[parsed.length - 1].marketValue : null, asAt: lastEnd,
      portfolios: portfolios.map((r) => ({ id: r.id, label: r.label, names: r.names, firstMonth: r.firstMonth, lastMonth: r.lastMonth, kind: r.kind, currency: r.currency, account: r.account })),
    };
  }

  return { parseStatement, parseStatements };
});
