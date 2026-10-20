// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// eToro account statement (.xlsx) parser. The account is followed by its
// realized equity: deposits and withdrawals one by one, everything else that
// changes realized equity (closed positions, dividends, overnight fees, ...)
// summed per month (or per day) and kind. At each holdings snapshot and at the
// statement end, a "change in unrealized gain/loss" entry brings the running
// balance to the total equity (realized equity + open positions' profit/loss).
// Works in the browser (window.EtoroParser) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../core/export.js"));
  else root.EtoroParser = factory(root.StatementExport);
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  const { round2, pad, lastDayOf } = E;
  const ZERO = 0.005;

  // Cell helpers: numbers may come as numbers or text ("-" = none).
  const num = (v) => (typeof v === "number" ? v : v == null || v === "" || v === "-" ? 0 : Number(String(v).replace(/,/g, "")) || 0);
  const str = (v) => (v == null ? "" : String(v).trim());
  // Dates: Excel serial numbers or "DD/MM/YYYY[ HH:MM:SS]".
  function isoDate(v) {
    if (typeof v === "number") {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5);
      return d.toISOString().slice(0, 10);
    }
    const m = str(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : null;
  }

  // Rows of a sheet as objects keyed by the header row (the first row whose
  // first cell is `first`).
  function table(rows, first) {
    if (!rows) return null;
    const h = rows.findIndex((r) => r && str(r[0]) === first);
    if (h < 0) return null;
    const head = rows[h].map(str);
    return rows.slice(h + 1).filter((r) => r && r.some((c) => c != null && c !== "")).map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
  }

  // "Account Summary": label/value pairs.
  function summaryOf(rows) {
    const out = {};
    for (const r of rows || []) if (r && r[0] != null && r[1] != null) out[str(r[0])] = r[1];
    return out;
  }

  // Activity types -> how they are exported. Deposits and withdrawals are kept
  // one by one; the rest is summed per period and group.
  const GROUPS = [
    [/^(deposit|withdraw)/i, null],
    [/^position closed$/i, "Closed positions profit/loss"],
    [/^dividend$/i, "Dividends"],
    [/^(overnight|weekend) (fee|refund)$/i, "Overnight fees and refunds"],
    [/^interest payment$/i, "Interest"],
  ];
  const OTHER = "Fees and adjustments";
  const COUNT = { "Closed positions profit/loss": ["position closed", "positions closed"], Dividends: ["payment", "payments"],
                  Interest: ["payment", "payments"], "Overnight fees and refunds": ["entry", "entries"] };

  // workbook: { sheetName: rows }. options.group: "month" (default) or "day".
  function parseWorkbook(workbook, options = {}) {
    // "balance": deposits/withdrawals plus one returns row per month; "month"/"day":
    // summary rows per kind.
    const mode = ["day", "balance"].includes(options.group) ? options.group : "month";
    const group = mode === "day" ? "day" : "month";
    const warnings = [];
    const summary = summaryOf(workbook["Account Summary"]);
    const activity = table(workbook["Account Activity"], "Date");
    if (!activity || !("Realized Equity Change" in (activity[0] || {})))
      return { error: "not an eToro account statement (no Account Activity sheet)" };
    const holdings = table(workbook["Holdings"], "Snapshot Date") || [];
    const closed = table(workbook["Closed Positions"], "Position ID") || [];
    const currency = str(summary.Currency) || "USD";
    const start = isoDate(summary["Start Date"]);
    const end = isoDate(summary["End Date"]) || isoDate(activity[activity.length - 1].Date);
    const beginRealized = num(summary["Beginning Realized Equity"]);
    const beginTotal = summary["Beginning Unrealized Equity"] != null ? num(summary["Beginning Unrealized Equity"]) : beginRealized;
    const endTotal = summary["Ending Unrealized Equity"] != null ? num(summary["Ending Unrealized Equity"]) : null;

    // ---- realized side ----
    const rows = [];
    for (const r of activity) {
      const date = isoDate(r.Date);
      if (!date) { warnings.push(`activity row without a date: ${str(r.Type)} ${str(r.Details)}`); continue; }
      rows.push({ date, type: str(r.Type), details: str(r.Details), change: num(r["Realized Equity Change"]), realized: num(r["Realized Equity"]), position: str(r["Position ID"]), amount: num(r.Amount) });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date)); // stable: statement order within a day
    const entries = [];
    const sums = {}; // period|group -> { date, group, amount, n, types }
    const types = {};
    let realized = beginRealized;
    const realizedAt = []; // [date, realized equity after that date]
    for (const r of rows) {
      const t = (types[r.type] = types[r.type] || { count: 0, total: 0 });
      t.count++; t.total = round2(t.total + r.change);
      realized = round2(realized + r.change);
      if (realizedAt.length && realizedAt[realizedAt.length - 1][0] === r.date) realizedAt[realizedAt.length - 1][1] = realized;
      else realizedAt.push([r.date, realized]);
      if (Math.abs(r.change) < ZERO) continue;
      const g = GROUPS.find(([re]) => re.test(r.type));
      // Internal sign convention: inflow negative.
      if (g && g[1] === null) { entries.push({ date: r.date, amount: round2(-r.change), currency, name: r.type, notes: r.details, kind: "transfer" }); continue; }
      const name = g ? g[1] : OTHER;
      const period = group === "day" ? r.date : r.date.slice(0, 7);
      const date = group === "day" ? r.date : (end && lastDayOf(period) > end ? end : lastDayOf(period));
      const s = (sums[`${period}|${name}`] = sums[`${period}|${name}`] || { date, name, period, amount: 0, n: 0, types: {} });
      s.amount = round2(s.amount + r.change); s.n++;
      s.types[r.type] = round2((s.types[r.type] || 0) + r.change);
    }
    for (const s of Object.values(sums)) {
      if (Math.abs(s.amount) < ZERO && s.n) continue;
      const parts = Object.entries(s.types);
      const notes = parts.length > 1 || s.name === OTHER ? parts.map(([k, v]) => `${k} ${v.toFixed(2)}`).join("; ") : `${s.n} ${(COUNT[s.name] || ["entry", "entries"])[s.n === 1 ? 0 : 1]}`;
      entries.push({ date: s.date, amount: round2(-s.amount), currency, name: `${s.name} (${s.period})`, notes, kind: s.name === OTHER ? "fee" : "income" });
    }
    const lastRealized = rows.length ? rows[rows.length - 1].realized : beginRealized;
    if (Math.abs(lastRealized - realized) >= ZERO)
      warnings.push(`Account Activity: realized equity changes add up to ${realized.toFixed(2)}, the last row shows ${lastRealized.toFixed(2)}`);
    if (summary["Ending Realized Equity"] != null && Math.abs(num(summary["Ending Realized Equity"]) - realized) >= ZERO)
      warnings.push(`Account Summary shows ending realized equity ${num(summary["Ending Realized Equity"]).toFixed(2)}, Account Activity adds up to ${realized.toFixed(2)}; the ending total equity is used as given, so the difference lands in the last month`);
    const realizedOn = (d) => { let v = beginRealized; for (const [x, r] of realizedAt) { if (x > d) break; v = r; } return v; };

    // ---- unrealized side: open positions' P/L at each snapshot ----
    // P/L = direction x (|value| - invested x leverage), where invested is the
    // amount opened less any part closed by then. "Value in USD" is the
    // position's market exposure (negative for shorts).
    const opened = {};
    for (const r of rows) if (/^open position$/i.test(r.type) && r.position) opened[r.position] = { date: r.date, amount: (opened[r.position] ? opened[r.position].amount : 0) + r.amount };
    const closes = {};
    for (const c of closed) { const id = str(c["Position ID"]); (closes[id] = closes[id] || []).push({ date: isoDate(c["Close Date"]), amount: num(c.Amount) }); }
    const bySnap = {};
    for (const h of holdings) { const d = isoDate(h["Snapshot Date"]); if (d) (bySnap[d] = bySnap[d] || []).push(h); }
    const anchors = [];
    for (const d of Object.keys(bySnap).sort()) {
      if ((start && d < start) || (end && d > end)) continue;
      // Monthly rows are dated the month end, so mid-month snapshots can't be matched.
      if (group === "month" && d !== lastDayOf(d.slice(0, 7))) continue;
      let pl = 0, approx = 0;
      for (const h of bySnap[d]) {
        const id = str(h["Position ID"]);
        const sign = /^short$/i.test(str(h.Direction)) ? -1 : 1;
        const lev = num(str(h.Leverage).replace(/^x/i, "")) || 1;
        const value = Math.abs(num(h["Value in USD"]));
        const o = opened[id];
        if (o && o.date <= d) {
          const out = (closes[id] || []).filter((c) => c.date && c.date <= d).reduce((s, c) => s + c.amount, 0);
          pl += sign * (value - (o.amount - out) * lev);
        } else {
          // Opened before this statement: estimate from the rates.
          const units = num(h.Units), cur = num(h["Current Rate"]), open = num(h["Open Rate"]);
          if (units && cur) pl += sign * value * (1 - open / cur);
          approx++;
        }
      }
      if (approx) warnings.push(`${d} holdings: ${approx} position(s) opened before the statement period; their profit/loss is estimated from open and current rates`);
      const r = realizedOn(d);
      anchors.push({ date: d, realized: r, unrealized: round2(pl), total: round2(r + pl), source: `holdings snapshot, ${bySnap[d].length} positions` });
    }
    if (end && endTotal != null) {
      const r = realizedOn(end);
      const last = anchors[anchors.length - 1];
      if (last && last.date === end) anchors.pop();
      anchors.push({ date: end, realized: r, unrealized: round2(endTotal - r), total: endTotal, source: "Account Summary, ending unrealized equity" });
    }
    let prevPl = round2(beginTotal - beginRealized);
    for (const a of anchors) {
      const change = round2(a.unrealized - prevPl);
      prevPl = a.unrealized;
      if (Math.abs(change) < ZERO) continue;
      entries.push({ date: a.date, amount: round2(-change), currency, name: "Change in unrealized gain/loss",
                     notes: `Open positions ${a.unrealized >= 0 ? "+" : ""}${a.unrealized.toFixed(2)} on ${a.date} (${a.source})`, kind: "adjustment" });
    }
    // Balance only: everything but deposits/withdrawals in one row per month (all
    // summary and unrealized rows of a month share its date, so anchors still hold).
    if (mode === "balance") {
      const keep = entries.filter((e) => e.kind === "transfer");
      const byMonth = {};
      for (const e of entries.filter((e) => e.kind !== "transfer")) {
        const m = e.date.slice(0, 7);
        const t = (byMonth[m] = byMonth[m] || { date: e.date, amount: 0, parts: [] });
        t.amount = round2(t.amount + e.amount);
        t.parts.push(`${e.name.replace(/ \(\d{4}-\d{2}\)$/, "")} ${(-e.amount).toFixed(2)}`);
      }
      entries.length = 0;
      entries.push(...keep);
      for (const [m, t] of Object.entries(byMonth))
        entries.push({ date: t.date, amount: t.amount, currency, name: `Returns (month-end adjustment, ${m})`, notes: t.parts.join("; "), kind: "adjustment" });
    }
    // By date; within a day statement order, unrealized entries last.
    entries.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "adjustment") - (b.kind === "adjustment"));

    const months = [...new Set(rows.map((r) => r.date.slice(0, 7)).concat(anchors.map((a) => a.date.slice(0, 7))))].sort();
    return {
      account: { name: "eToro", kind: "investment", currency, beginTotal, entries, anchors },
      period: { start, end }, months, types, warnings,
      summary: { deposits: num(summary.Deposits), endRealized: realized, endTotal },
    };
  }

  // Balance just before the first entry in range, and that date.
  function openingBalance(account, from, to) {
    const inRange = account.entries.filter((e) => E.inRange(e.date, from, to));
    if (!inRange.length) return null;
    const first = inRange[0].date;
    const before = account.entries.filter((e) => e.date < first).reduce((s, e) => s - e.amount, 0);
    return { balance: round2(account.beginTotal + before), date: E.dayBefore(first) };
  }

  // Running balance at each anchor date (for checks and the balances CSV).
  function balanceOn(account, date) {
    return round2(account.beginTotal + account.entries.filter((e) => e.date <= date).reduce((s, e) => s - e.amount, 0));
  }

  // Where an activity type goes: null = one by one, else the summary row name.
  const groupOf = (type) => { const g = GROUPS.find(([re]) => re.test(type)); return g ? g[1] : OTHER; };

  return { parseWorkbook, openingBalance, balanceOn, isoDate, groupOf };
});
