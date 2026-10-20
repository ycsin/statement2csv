// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Running-balance reconciliation of a statement-app result (harness step H6), through the
// provider's composed namespace handle.P only, so an export override is honoured.
//   H6: for every account and withTrades in {false, true}, start at
//       P.openingBalance(a, null, null, earliest, entries); the running balance must hit every
//       month-end valuation within 0.005, adjustedEntries must report no problems, and with
//       trades an investment account must have one trade line per trade. An account whose
//       opening is null is skipped.
//   H6b: for every month m with entries in [m, m], the opening plus those entries must equal
//       that month's closing within 0.005.
// reconcileStatement(handle, result, {mode}) -> string[], one line per problem (the harness
// counts them against the private declaration). Lines name accounts and amounts, so callers
// write them only to the private directory. The mode does not change a statement app's parse
// result or its ledger, so it is accepted for the handle's signature and otherwise unused.
// reconcileParts(handle, result) -> {lines: [{part, account, line}], counts: {accounts,
// valuations, months}} (an extra, for the harness): the same lines in the same order, each
// tagged with its part, so H6 and H6b can be counted apart:
//   "problems"  adjustedEntries' problems (balance only), the card's .warn lines
//   "running"   a running balance that misses month-end values
//   "trades"    trade lines that do not match the trades of an investment account
//   "monthly"   a month whose opening plus entries is not its closing (H6b)
// counts: the accounts looked at, the month-end values checked (once per account, whichever
// running balance) and the months checked by H6b.
"use strict";

const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => (typeof n === "number" ? n.toFixed(2) : String(n));

function reconcileParts(handle, result) {
  const P = handle && handle.P;
  if (!P || typeof P.adjustedEntries !== "function" || typeof P.openingBalance !== "function") {
    throw new TypeError("reconcileStatement: handle.P must provide adjustedEntries and openingBalance");
  }
  const lines = [];
  const counts = { accounts: 0, valuations: 0, months: 0 };
  if (!result || !result.accounts || typeof result.accounts !== "object") return { lines, counts };
  const add = (part, account, line) => lines.push({ part, account, line });
  const months = Array.isArray(result.months) ? result.months : [];
  const earliest = months.length ? months[0].month : null;
  for (const [name, a] of Object.entries(result.accounts)) {
    counts.accounts++;
    let counted = false;
    for (const withTrades of [false, true]) {
      const how = withTrades ? "trade log" : "balance only";
      const { entries, problems: found } = P.adjustedEntries(a, null, null, earliest, withTrades);
      if (!withTrades) for (const p of found) add("problems", name, `${name}: ${p}`);
      const start = P.openingBalance(a, null, null, earliest, entries);
      if (!start) continue;
      if (!counted) {
        counts.valuations += a.valuations.length;
        counted = true;
      }
      let worst = 0;
      let missed = 0;
      for (const [date, value] of a.valuations) {
        const balance = start.balance + entries.filter((e) => e.date <= date).reduce((s, e) => s - e.amount, 0);
        const diff = Math.abs(round2(balance) - value);
        if (!(diff < 0.005)) missed++;
        if (!(diff <= worst)) worst = diff;
      }
      if (missed) add("running", name, `${name} (${how}): the running balance misses ${missed} of ${a.valuations.length} month-end values (max diff ${money(worst)})`);
      if (withTrades && a.kind === "investment") {
        const n = entries.filter((e) => e.kind === "trade").length;
        if (n !== a.trades.length) add("trades", name, `${name} (trade log): ${n} trade lines for ${a.trades.length} trades`);
      }
    }
    for (const m of Object.keys(a.months).sort()) {
      const { entries } = P.adjustedEntries(a, m, m, earliest, false);
      if (!entries.length) continue;
      const start = P.openingBalance(a, m, m, earliest, entries);
      if (!start) continue;
      counts.months++;
      const end = round2(start.balance + entries.reduce((s, e) => s - e.amount, 0));
      const closing = a.months[m].closing;
      if (!(Math.abs(end - closing) < 0.005)) {
        add("monthly", name, `${name}: ${m}: opening ${money(start.balance)} plus its entries gives ${money(end)}, the closing is ${money(closing)}`);
      }
    }
  }
  return { lines, counts };
}

function reconcileStatement(handle, result, { mode } = {}) {
  void mode;
  return reconcileParts(handle, result).lines.map((x) => x.line);
}

module.exports = { reconcileStatement, reconcileParts };
