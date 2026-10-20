// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Export layer, shared in spirit with stashaway2csv: month helpers, balance-only
// entries with month-end adjustments, starting balances, and the CSV formats.
// Works on accounts of the shape { kind: "investment" | "cash" | "bank",
// currency, months: { "YYYY-MM": { monthEnd, opening, closing, fx } }, trades,
// cash, valuations }. Bank accounts are reconciled, never adjusted.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StatementExport = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const round2 = (n) => Math.round(n * 100) / 100;
  const pad = (n) => String(n).padStart(2, "0");

  function monthGaps(sortedMonths) {
    const gaps = [];
    for (let i = 1; i < sortedMonths.length; i++) {
      let [y, m] = sortedMonths[i - 1].split("-").map(Number);
      for (;;) {
        m += 1; if (m > 12) { m = 1; y += 1; }
        const k = `${y}-${pad(m)}`;
        if (k >= sortedMonths[i]) break;
        gaps.push(k);
      }
    }
    return gaps;
  }

  // ---- CSV output ----
  // Text copied from a statement must not be read as a spreadsheet formula, so
  // text cells starting with = + - @ get a leading apostrophe (numbers are left alone).
  const csvCell = (v) => {
    let s = String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?[\d.]+$/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = (header, rows) => [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
  const num = (n, dp) => n.toFixed(dp).replace(/\.?0+$/, "");
  const inRange = (date, from, to) => (!from || date.slice(0, 7) >= from) && (!to || date.slice(0, 7) <= to);

  // Combined files for multi-account imports: one CSV for all portfolios with a
  // leading "account" column. groups: [{ account, rows }] (rows already filtered).
  function combinedTradesCsv(groups) {
    return csv(["account", "date", "ticker", "qty", "price", "currency", "name"],
      groups.flatMap((g) => g.rows.map((t) => [g.account, t.date, t.ticker, num(t.qty, 6), num(t.price, 6), t.currency, t.name])));
  }

  // Entries in the internal sign convention; written with inflows positive.
  function combinedTransactionsCsv(groups) {
    return csv(["account", "date", "amount", "currency", "name", "notes"],
      groups.flatMap((g) => g.rows.slice().sort((a, b) => a.date.localeCompare(b.date))
        .map((c) => [g.account, c.date, (-c.amount).toFixed(2), c.currency, c.name, c.notes || ""])));
  }

  function tradesCsv(trades, from, to) {
    return csv(["date", "ticker", "qty", "price", "currency", "name"],
      trades.filter((t) => inRange(t.date, from, to)).map((t) => [t.date, t.ticker, num(t.qty, 6), num(t.price, 6), t.currency, t.name]));
  }

  // Amounts written with inflows positive (deposits/dividends +, fees/withdrawals -).
  function transactionsCsv(cash, from, to) {
    return csv(["date", "amount", "currency", "name", "notes"],
      cash.filter((c) => inRange(c.date, from, to)).slice().sort((a, b) => a.date.localeCompare(b.date))
        .map((c) => [c.date, (-c.amount).toFixed(2), c.currency, c.name, c.notes || ""]));
  }

  function valuationsCsv(valuations, from, to, currency) {
    return csv(["date", "balance", "currency"], valuations.filter(([d]) => inRange(d, from, to)).map(([d, v]) => [d, v.toFixed(2), currency]));
  }

  // Balance-only export: the account's cash entries in SGD plus one
  // "Returns (month-end adjustment)" entry per month, so that this one CSV puts
  // the running balance exactly on each statement's closing value, with no
  // trades or separate balance records needed. Each month builds on the previous
  // month's closing balance when that statement is loaded, otherwise on the
  // statement's own opening balance (StashAway's opening occasionally differs
  // from the prior closing by a few dollars). If earlier statements are loaded
  // but the previous month is missing, or the portfolio first appears after the
  // earliest loaded statement (it started in a missing month), one "Balance
  // change not covered by statements" entry bridges the gap so later balances
  // stay exact; the missing month's individual entries are unknown. Non-SGD entries are converted at
  // the statement's closing USD/SGD rate. Entries use the internal sign
  // convention (inflow negative), sorted by date.
  // earliestMonth: the first statement month loaded at all ("YYYY-MM").
  // withTrades: also list each buy/sell as a zero-amount line ("trade log"); a
  // trade swaps cash for units inside the portfolio, so the value doesn't change.
  function adjustedEntries(account, from, to, earliestMonth, withTrades = false) {
    const out = [];
    const problems = [];
    const baseCcy = account.currency;
    let last = null; // last loaded month before this one: [month, data]
    for (const [month, m] of Object.entries(account.months).sort(([x], [y]) => x.localeCompare(y))) {
      const prior = account.months[prevMonth(month)];
      const lastBefore = last;
      last = [month, m];
      if (!inRange(m.monthEnd, from, to)) continue;
      const base = prior ? prior.closing : m.opening;
      if (!prior && (lastBefore || (earliestMonth && month > earliestMonth))) {
        const bridge = round2(m.opening - (lastBefore ? lastBefore[1].closing : 0));
        if (Math.abs(bridge) >= 0.005) {
          const missing = [];
          const stop = lastBefore ? lastBefore[0] : prevMonth(earliestMonth);
          for (let k = prevMonth(month); k > stop && missing.length < 12; k = prevMonth(k)) missing.unshift(k);
          out.push({ date: lastDayOf(prevMonth(month)), amount: -bridge, currency: baseCcy, kind: "gap",
                     name: `Balance change not covered by statements (${missing.join(", ")})` });
        }
      }
      let flows = 0; // SGD, inflow positive
      for (const c of account.cash.filter((c) => c.date.startsWith(month))) {
        let entry = c;
        if (c.currency !== baseCcy) {
          if (c.currency !== "USD" || !m.fx) { problems.push(`${month}: cannot convert ${c.currency} entry "${c.name}"`); continue; }
          const usd = -c.amount;
          entry = { ...c, amount: round2(c.amount * m.fx), currency: baseCcy,
                    name: `${c.name} (USD ${usd.toFixed(2)} @ ${m.fx})` };
        }
        flows += -entry.amount;
        out.push(entry);
      }
      if (withTrades) {
        for (const t of account.trades.filter((t) => t.date.startsWith(month))) {
          const value = Math.abs(t.qty) * t.price;
          out.push({ date: t.date, amount: 0, currency: baseCcy, kind: "trade",
                     name: `${t.qty > 0 ? "Buy" : "Sell"} ${num(Math.abs(t.qty), 6)} ${t.ticker} @ ${t.currency} ${num(t.price, 6)} (${t.currency} ${value.toFixed(2)})` });
        }
      }
      const adj = round2(m.closing - base - flows);
      if (account.kind === "bank") {
        // A bank account must reconcile exactly; a difference means a parsing problem.
        if (Math.abs(adj) >= 0.005) problems.push(`${month}: entries don't add up to the statement balance (off by ${adj.toFixed(2)})`);
        continue;
      }
      if (Math.abs(adj) >= 0.005) {
        out.push({ date: m.monthEnd, amount: -adj, currency: baseCcy, kind: "adjustment",
                   name: `Returns (month-end adjustment, ${month})` });
      }
    }
    // Stable sort: by date, keeping statement order within a day; adjustments last.
    out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "adjustment") - (b.kind === "adjustment"));
    return { entries: out, problems };
  }

  function prevMonth(month) {
    let [y, m] = month.split("-").map(Number);
    m -= 1;
    if (!m) { m = 12; y -= 1; }
    return `${y}-${pad(m)}`;
  }

  function lastDayOf(month) {
    const [y, m] = month.split("-").map(Number);
    return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
  }

  // Starting point for an account import: the balance just before the first
  // exported entry, and that date. Matches the base adjustedEntries builds on:
  // the previous month's closing, else the last loaded closing before a gap,
  // else 0 for a portfolio that started in a missing month, else the earliest
  // statement's opening. Null if the account has no months in range.
  function openingBalance(account, from, to, earliestMonth, entries) {
    const months = Object.keys(account.months).sort();
    const first = months.find((m) => inRange(account.months[m].monthEnd, from, to));
    if (!first) return null;
    const earlier = months.filter((m) => m < first);
    const lastBefore = earlier.length ? account.months[earlier[earlier.length - 1]] : null;
    const prior = account.months[prevMonth(first)];
    let balance;
    if (prior) balance = prior.closing;
    else if (lastBefore) balance = lastBefore.closing;
    else if (earliestMonth && first > earliestMonth) balance = 0;
    else balance = account.months[first].opening;
    let date = lastDayOf(prevMonth(first));
    const firstEntry = (entries || []).map((e) => e.date).sort()[0];
    if (firstEntry && firstEntry <= date) date = dayBefore(firstEntry);
    return { balance: round2(balance), date };
  }

  function dayBefore(iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  // rows: [{ type, name, balance, date }]. Header follows the common
  // "Account type, Name, Balance, Currency, Balance Date" account-import layout.
  function accountsCsv(rows) {
    return csv(["Account type", "Name", "Balance", "Currency", "Balance Date"],
      rows.map((r) => [r.type, r.name, r.balance.toFixed(2), r.currency, r.date]));
  }

  function adjustedCsv(account, from, to, earliestMonth, withTrades = false) {
    return csv(["date", "amount", "currency", "name", "notes"],
      adjustedEntries(account, from, to, earliestMonth, withTrades).entries.map((c) => [c.date, (-c.amount).toFixed(2), c.currency, c.name, c.notes || ""]));
  }

  // QIF (Quicken Interchange Format) for one account: an "Opening Balance" record
  // (balance just before the first entry), then every entry. QIF has no currency
  // field; import each file into an account of the right currency. Dates are ISO
  // (YYYY-MM-DD) so they can't be misread as month/day. P = name, M = notes.
  // start: { balance, date } or null.
  function qif(entries, start, accountName, type = "Bank") {
    const clean = (s) => String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim();
    const out = [`!Type:${type}`];
    if (start) out.push(`D${start.date}`, `T${start.balance.toFixed(2)}`, "POpening Balance", `L[${clean(accountName)}]`, "^");
    for (const e of entries.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      out.push(`D${e.date}`, `T${(-e.amount).toFixed(2)}`, `P${clean(e.name)}`);
      if (e.notes) out.push(`M${clean(e.notes)}`);
      out.push("^");
    }
    return out.join("\n") + "\n";
  }

  return { qif, round2, pad, monthGaps, prevMonth, lastDayOf, dayBefore, inRange, tradesCsv, transactionsCsv, valuationsCsv,
           adjustedEntries, adjustedCsv, openingBalance, accountsCsv, combinedTradesCsv, combinedTransactionsCsv };
});
