// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// MariBank "Deposit and Investment Statement" parser: the savings account
// (bank account, reconciled each month) and each fund in the investment account.
// Works in the browser (window.MariParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./layout.js"), require("../../core/export.js"));
  else root.MariParser = factory(root.MariLayout, root.StatementExport);
})(typeof self !== "undefined" ? self : this, function (L, E) {
  "use strict";

  const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
  const AMOUNT_RE = /^-?[\d,]+\.\d{2}$/;
  const NUM_RE = /^-?[\d,]+(\.\d+)?$/;
  const { round2, pad } = E;
  const num = (s) => parseFloat(String(s).replace(/,/g, ""));
  const iso = (d, mon, y) => `${y}-${pad(MONTHS[mon])}-${pad(d)}`;
  const ZERO = 0.005;

  // ---- one statement --------------------------------------------------------
  const TITLE_RE = /^(?:([A-Z]{3}) ACCOUNT SUMMARY|SAVINGS(?: \(([A-Z]{3})\))? - (ACCOUNT SUMMARY|TRANSACTION DETAILS|INTEREST DETAILS)\*?|INVESTMENTS - (ACCOUNT SUMMARY|TRANSACTION DETAILS))$/;
  const FURNITURE_RE = /^(DEPOSIT AND INVESTMENT STATEMENT|S\/N \S+|\d{2} [A-Z]{3} \d{4}|page \d+ of \d+|Contact Us.*)$/;

  // pages: [[{ str, x, y, w, h }, ...], ...] (pdf.js text items per page)
  function parseStatement(pages) {
    const lines = [];
    pages.forEach((items, page) => {
      const pl = L.pageLines(items);
      const top = pl.length ? pl[0].y : 0;
      for (const l of pl) {
        // Drop the running page header (title, serial number, issue date) and footer.
        if (FURNITURE_RE.test(l.text) && (top - l.y < 40 || /^page /.test(l.text))) continue;
        lines.push({ ...l, page });
      }
    });
    const text = lines.map((l) => l.text).join("\n");
    const p = text.match(/STATEMENT PERIOD:\s+(\d{2}) ([A-Z]{3}) (\d{4}) to (\d{2}) ([A-Z]{3}) (\d{4})/);
    if (!p) return { error: "not a MariBank deposit and investment statement (no statement period found)" };
    const st = {
      periodStart: iso(p[1], p[2], p[3]), monthEnd: iso(p[4], p[5], p[6]), year: p[6], endMonth: p[5],
      savings: {}, holdings: [], invest: [], problems: [],
    };

    // Split the line stream into tables: a title starts a section, a header
    // line starts (or, on a continuation page, resumes) its table.
    let section = null, savingsCcy = "SGD", table = null;
    const tables = [];
    const close = () => { if (table && table.lines.length) tables.push(table); table = null; };
    for (const l of lines) {
      const t = l.text.match(TITLE_RE);
      if (t) {
        close();
        if (t[1]) { section = "savings-summary"; savingsCcy = t[1]; }
        else if (t[3]) { section = "savings-" + t[3].split(" ")[0].toLowerCase(); savingsCcy = t[2] || savingsCcy; }
        else section = "investments-" + t[4].split(" ")[0].toLowerCase();
        continue;
      }
      let header = null;
      if (/^ACCOUNT\s+STARTING BALANCE/.test(l.text)) header = "savings-summary";
      else if (/^DATE\s+TRANSACTION\s+OUTGOING/.test(l.text)) header = "savings-transaction";
      else if (/^DATE\s+PREVIOUS DAY BALANCE/.test(l.text)) header = "savings-interest";
      else if (/^FUND NAME\s+UNIT HOLDINGS/.test(l.text)) header = "investments-account";
      else if (/^TRANSACTION\s+TRADE\s+FUND NAME/.test(l.text)) header = "investments-transaction";
      if (header) {
        const cols = Object.fromEntries(l.items.map((it) => [it.s.replace(/\s*\(\w+\)$/, ""), it]));
        if (table && table.type === header) { table.cols = cols; table.resume = true; continue; }
        close();
        const ccy = (l.text.match(/\(([A-Z]{3})\)/) || [])[1];
        table = { type: header, cols, lines: [], ccy: header.startsWith("savings") ? ccy || savingsCcy : ccy || "SGD", headerY: l.y, page: l.page };
        continue;
      }
      if (!table) continue;
      // Second header line ("VALUATION DATE", "DATE DATE TYPE") right under the header.
      if (!table.lines.length && /^(VALUATION DATE|DATE\s+DATE\s+TYPE|\(.*\))$/.test(l.text.replace(/\s{2,}/g, "  ").replace(/  /g, " ").trim()) ) continue;
      if (/^DATE\s+DATE/.test(l.text) || /^VALUATION DATE$/.test(l.text)) continue;
      if (/^TOTAL( INTEREST CREDITED)?:/.test(l.text) || /^\*/.test(l.text) || /^(General|Deposit Insurance)/.test(l.text)) { close(); continue; }
      table.lines.push(l);
    }
    close();

    for (const tb of tables) {
      const rows = groupRows(tb.lines);
      if (tb.type === "savings-summary") parseSavingsSummary(st, tb, rows);
      else if (tb.type === "savings-transaction") for (const r of rows) parseSavingsRow(st, tb, r);
      else if (tb.type === "investments-account") for (const r of rows) parseHoldingRow(st, tb, r);
      else if (tb.type === "investments-transaction") for (const r of rows) parseInvestRow(st, tb, r);
    }
    return st;
  }

  // Rows: lines on one page closer together than ~2 line heights.
  function groupRows(lines) {
    const rows = [];
    let row = null, prev = null;
    for (const l of lines) {
      if (!row || l.page !== prev.page || prev.y - l.y > 1.9 * Math.max(l.h, prev.h)) rows.push((row = []));
      row.push(l);
      prev = l;
    }
    return rows;
  }

  const rowItems = (row) => row.flatMap((l) => l.items.map((it) => ({ ...it, y: l.y, h: l.h })));
  const dateOf = (st, s) => {
    const m = s.match(/^(\d{2}) ([A-Z]{3})$/);
    if (m) return iso(m[1], m[2], MONTHS[m[2]] > MONTHS[st.endMonth] ? String(st.year - 1) : st.year);
    return /^[A-Z]{3}$/.test(s) ? st.monthEnd : null; // "SEP" (monthly interest): end of period
  };

  function parseSavingsSummary(st, tb, rows) {
    for (const r of rows) {
      const its = rowItems(r);
      if (!/^SAVINGS$/i.test(its[0].s)) continue;
      const v = its.slice(1).filter((it) => AMOUNT_RE.test(it.s)).map((it) => num(it.s));
      if (v.length !== 4) { st.problems.push(`savings summary: expected 4 amounts, found ${v.length}`); continue; }
      st.savings[tb.ccy] = st.savings[tb.ccy] || { rows: [] };
      Object.assign(st.savings[tb.ccy], { opening: v[0], outgoing: v[1], incoming: v[2], closing: v[3] });
    }
  }

  function parseSavingsRow(st, tb, row) {
    const its = rowItems(row);
    const txX = tb.cols.TRANSACTION ? tb.cols.TRANSACTION.x : 150;
    const out = tb.cols.OUTGOING, inc = tb.cols.INCOMING;
    const outRight = out ? out.x + out.w : 420, incRight = inc ? inc.x + inc.w : 550;
    const dateIt = its.find((it) => it.x < txX - 5 && /^(\d{2} )?[A-Z]{3}$/.test(it.s));
    const amounts = its.filter((it) => it.x > txX + 100 && AMOUNT_RE.test(it.s));
    if (!dateIt || amounts.length !== 1) {
      st.problems.push(`savings row not understood: ${its.map((i) => i.s).join(" ").slice(0, 80)}`);
      return;
    }
    const a = amounts[0];
    const incoming = a.x + a.w > (outRight + incRight) / 2;
    const desc = its.filter((it) => it !== dateIt && it !== a).sort((x, y) => y.y - x.y || x.x - y.x);
    const big = Math.max(...desc.map((d) => d.h), 0);
    // Counterparty lines are in the larger font; channel and reference lines in
    // the smaller one. Older statements print the channel ("FAST Transfer") in
    // the larger font too, so a trailing channel line moves to the notes.
    const title = desc.filter((d) => d.h >= big - 0.3).map((d) => d.s);
    const sub = desc.filter((d) => d.h < big - 0.3).map((d) => d.s);
    if (title.length > 1 && /^(FAST|PayNow|GIRO)\b/i.test(title[title.length - 1])) sub.unshift(title.pop());
    st.savings[tb.ccy] = st.savings[tb.ccy] || { rows: [] };
    st.savings[tb.ccy].rows.push({
      date: dateOf(st, dateIt.s), amount: incoming ? -num(a.s) : num(a.s), currency: tb.ccy,
      name: title.join(" ") || sub.join(" "), notes: title.length ? sub.join(" · ") : "",
    });
  }

  function parseHoldingRow(st, tb, row) {
    const its = rowItems(row);
    const unitsX = tb.cols["UNIT HOLDINGS"] ? tb.cols["UNIT HOLDINGS"].x : 250;
    const name = its.filter((it) => it.x < unitsX - 5 && !NUM_RE.test(it.s)).sort((a, b) => b.y - a.y || a.x - b.x).map((it) => it.s).join(" ");
    const date = its.find((it) => /^\d{2} [A-Z]{3} \d{4}$/.test(it.s));
    const nums = its.filter((it) => it.x >= unitsX - 60 && NUM_RE.test(it.s)).sort((a, b) => a.x - b.x).map((it) => num(it.s));
    if (!name || nums.length !== 3) { st.problems.push(`holding row not understood: ${its.map((i) => i.s).join(" ").slice(0, 80)}`); return; }
    st.holdings.push({ fund: name.replace(/\s+/g, " "), units: nums[0], price: nums[1], value: nums[2],
      valuationDate: date ? iso(...date.s.split(" ")) : null, currency: tb.ccy });
  }

  function parseInvestRow(st, tb, row) {
    const its = rowItems(row);
    const tradeX = tb.cols.TRADE ? tb.cols.TRADE.x : 110, fundX = tb.cols["FUND NAME"] ? tb.cols["FUND NAME"].x : 180;
    const typeX = (Object.entries(tb.cols).find(([k, v]) => k === "TRANSACTION" && v.x > fundX) || [, { x: 280 }])[1].x;
    const dateIt = its.find((it) => it.x < tradeX - 5 && /^\d{2} [A-Z]{3}$/.test(it.s));
    if (!dateIt) { st.problems.push(`investment row not understood: ${its.map((i) => i.s).join(" ").slice(0, 80)}`); return; }
    const tradeIt = its.find((it) => it.x >= tradeX - 5 && it.x < fundX - 5 && it.y === dateIt.y);
    const fund = its.filter((it) => it.x >= fundX - 5 && it.x < typeX - 5).sort((a, b) => b.y - a.y || a.x - b.x).map((it) => it.s).join(" ");
    // On the date line, the last three number-or-dash cells are units, unit price, amount.
    const right = its.filter((it) => it.x >= typeX - 5);
    const mainLine = right.filter((it) => it.y === dateIt.y).sort((a, b) => a.x - b.x);
    const tail = [];
    for (let i = mainLine.length - 1; i >= 0 && tail.length < 3; i--) if (NUM_RE.test(mainLine[i].s) || mainLine[i].s === "-") tail.unshift(mainLine[i]);
    const type = right.filter((it) => !tail.includes(it)).sort((a, b) => b.y - a.y || a.x - b.x).map((it) => it.s).join(" ").replace(/\s+/g, " ").trim();
    if (tail.length !== 3 || !fund || !type) { st.problems.push(`investment row not understood: ${its.map((i) => i.s).join(" ").slice(0, 80)}`); return; }
    const [u, pr, amt] = tail.map((it) => (it.s === "-" ? null : num(it.s)));
    st.invest.push({
      date: dateOf(st, dateIt.s), tradeDate: tradeIt && tradeIt.s !== "-" ? dateOf(st, tradeIt.s) : null,
      fund: fund.replace(/\s+/g, " "), type, units: u, price: pr, amount: amt, currency: tb.ccy,
    });
  }

  // ---- all statements -------------------------------------------------------
  // statements: [{ id, pages: [[items...], ...] }], any order. config per account
  // id ("savings:SGD", "fund:<name>"): { name, kind, mergeInto, exclude }.
  function parseStatements(statements, config = {}) {
    const errors = [], warnings = [], skipped = {}, skippedRows = [], months = [];
    const skip = (date, category, detail, account) => {
      skipped[category] = (skipped[category] || 0) + 1;
      skippedRows.push({ date, category, detail, portfolio: account });
    };

    const parsed = [];
    for (const s of statements) {
      const st = parseStatement(s.pages);
      if (st.error) { errors.push({ id: s.id, error: st.error }); continue; }
      parsed.push({ ...st, id: s.id });
    }
    parsed.sort((a, b) => a.monthEnd.localeCompare(b.monthEnd));
    const seen = new Set();
    const list = [];
    for (const st of parsed) {
      const month = st.monthEnd.slice(0, 7);
      if (seen.has(month)) { errors.push({ id: st.id, error: `duplicate statement for ${month}, ignored` }); continue; }
      seen.add(month);
      months.push({ id: st.id, month });
      for (const pr of st.problems) warnings.push(`${month}: ${pr}`);
      list.push({ ...st, month });
    }

    // Accounts before config: savings per currency, one per fund.
    const raw = {};
    const acct = (id, init) => (raw[id] = raw[id] || { id, months: {}, trades: [], cash: [], firstMonth: null, lastMonth: null, ...init });
    let prevHoldings = null;
    for (const st of list) {
      const { month, monthEnd } = st;
      for (const [ccy, s] of Object.entries(st.savings)) {
        const a = acct(`savings:${ccy}`, { label: ccy === "SGD" ? "Savings" : `Savings (${ccy})`, kind: "bank", currency: ccy, names: ["Savings"] });
        a.firstMonth = a.firstMonth || month; a.lastMonth = month;
        a.months[month] = { monthEnd, opening: s.opening, closing: s.closing, cashflow: 0, fx: null };
        a.cash.push(...s.rows.map((r) => ({ ...r, kind: "bank" })));
        // Reconcile against the statement's own totals.
        const out = round2(s.rows.filter((r) => r.amount > 0).reduce((t, r) => t + r.amount, 0));
        const inc = round2(s.rows.filter((r) => r.amount < 0).reduce((t, r) => t - r.amount, 0));
        if (s.opening == null) warnings.push(`${month}: savings (${ccy}) summary not found`);
        else {
          if (Math.abs(out - s.outgoing) >= ZERO || Math.abs(inc - s.incoming) >= ZERO)
            warnings.push(`${month}: savings (${ccy}) transactions total out ${out} / in ${inc}, statement says ${s.outgoing} / ${s.incoming}`);
          if (Math.abs(round2(s.opening - s.outgoing + s.incoming) - s.closing) >= ZERO)
            warnings.push(`${month}: savings (${ccy}) statement summary doesn't add up`);
        }
      }

      // Funds: value at month end from holdings (0 if no longer held).
      const held = Object.fromEntries(st.holdings.map((h) => [h.fund, h]));
      const funds = new Set([...Object.keys(held), ...st.invest.map((t) => t.fund), ...Object.keys(prevHoldings || {})]);
      for (const fund of funds) {
        const h = held[fund];
        const txs = st.invest.filter((t) => t.fund === fund);
        if (!h && !txs.length && !(prevHoldings && prevHoldings[fund] && prevHoldings[fund].value)) continue;
        const a = acct(`fund:${fund}`, { label: fund, kind: "investment", currency: (h || txs[0] || prevHoldings[fund]).currency, names: [fund] });
        const isFirst = !a.firstMonth;
        a.firstMonth = a.firstMonth || month; a.lastMonth = month;
        const prior = Object.values(a.months).pop();
        const bought = txs.filter((t) => /^BUY/i.test(t.type)).reduce((s, t) => s + (t.units || 0), 0);
        const sold = txs.filter((t) => /^SELL/i.test(t.type)).reduce((s, t) => s + (t.units || 0), 0);
        const units = h ? h.units : 0;
        let opening;
        if (prior) opening = prior.closing;
        else if (isFirst && month !== list[0].month) opening = 0; // first appears after the earliest statement
        else opening = Math.abs(units - bought + sold) < 0.01 ? 0 : null; // earliest statement: 0 if bought this month
        const closing = h ? h.value : 0;
        for (const t of txs) {
          const date = t.date;
          const reinvest = /reinvest/i.test(t.type);
          if (/^BUY/i.test(t.type)) {
            a.trades.push({ date: t.tradeDate || date, ticker: fund, qty: t.units, price: t.price, currency: t.currency, name: reinvest ? "Buy (dividend reinvested)" : "Buy" });
            if (!reinvest) a.cash.push({ date, amount: -t.amount, currency: t.currency, kind: "transfer", name: "Buy (from savings)", notes: `${t.units} units @ ${t.price}` });
          } else if (/^SELL/i.test(t.type)) {
            a.trades.push({ date: t.tradeDate || date, ticker: fund, qty: -t.units, price: t.price, currency: t.currency, name: "Sell" });
            a.cash.push({ date, amount: t.amount, currency: t.currency, kind: "transfer", name: "Sell (to savings)", notes: t.units ? `${t.units} units @ ${t.price}` : "" });
          } else if (/^Payout/i.test(t.type) && reinvest) {
            a.cash.push({ date, amount: -t.amount, currency: t.currency, kind: "income", name: "Dividend (reinvested)" });
          } else if (/^Payout/i.test(t.type)) {
            skip(date, "payout paid into savings", `${t.type} ${t.amount != null ? t.amount.toFixed(2) : ""}`.trim(), a.label);
          } else {
            skip(date, "unknown", `${t.type} ${t.amount != null ? t.amount.toFixed(2) : ""}`.trim(), a.label);
          }
        }
        const flows = a.cash.filter((c) => c.date.startsWith(month)).reduce((s, c) => s - c.amount, 0);
        if (opening == null) opening = round2(closing - flows); // unknown history: start where the month started
        a.months[month] = { monthEnd, opening: round2(opening), closing: round2(closing), cashflow: 0, fx: null, units };
        const prevUnits = prior ? prior.units : null;
        if (prevUnits != null && Math.abs(prevUnits + bought - sold - units) >= 0.025)
          warnings.push(`${month}: ${fund} units ${units} don't follow from ${prevUnits} + ${round2(bought)} bought − ${round2(sold)} sold`);
      }
      prevHoldings = held;
    }

    // Apply config (rename, type, merge, exclude) and build accounts.
    const rootOf = (id) => { const path = new Set(); while (config[id] && config[id].mergeInto && raw[config[id].mergeInto] && !path.has(id)) { path.add(id); id = config[id].mergeInto; } return id; };
    const portfolios = Object.values(raw).sort((a, b) => (a.kind === "bank" ? -1 : 0) - (b.kind === "bank" ? -1 : 0) || a.firstMonth.localeCompare(b.firstMonth) || a.label.localeCompare(b.label));
    const accounts = {};
    for (const r of portfolios) {
      const root = raw[rootOf(r.id)];
      if ((config[root.id] || {}).exclude || (config[r.id] || {}).exclude) { r.account = null; continue; }
      const name = ((config[root.id] || {}).name || "").trim() || root.label;
      r.account = name;
      const a = (accounts[name] = accounts[name] || { kind: (config[root.id] || {}).kind || root.kind, currency: root.currency, valuations: [], trades: [], cash: [], months: {}, portfolios: [] });
      a.portfolios.push(r.id);
      a.trades.push(...r.trades);
      a.cash.push(...r.cash);
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
    skippedRows.sort((x, y) => x.date.localeCompare(y.date));

    const gaps = E.monthGaps(months.map((m) => m.month));
    const first = months.length ? months[0].month : null;
    const firstOpenings = first ? Object.entries(accounts).filter(([, a]) => a.months[first] && Math.abs(a.months[first].opening) >= ZERO)
      .map(([name, a]) => ({ account: name, month: first, opening: a.months[first].opening })) : [];
    return {
      accounts, months, skipped, skippedRows, reconciled: [], errors, warnings, gaps, firstOpenings, baseCurrency: "SGD",
      portfolios: portfolios.map((r) => ({ id: r.id, label: r.label, names: r.names, firstMonth: r.firstMonth, lastMonth: r.lastMonth, kind: r.kind, currency: r.currency, account: r.account })),
      unmapped: {},
    };
  }

  return { parseStatement, parseStatements };
});
