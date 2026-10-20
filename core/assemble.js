// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Account assembly for new providers (docs/ARCHITECTURE.md, core/assemble.js): applies the
// configurator's overrides (rename, kind, merge, exclude) to the portfolios a parser found and
// builds the statement-app Result (docs/CONTRACT.md, "Result shape"). Works in the browser
// (self.StatementAssemble, after self.StatementExport) and in Node (module.exports).
//
//   build({raw, config, months, statements, downloads, errors, warnings, skippedRows,
//          cashLikeTrades = "strip", order}) -> Result, with late: [] and closed: []
//     raw       {[portfolioId]: {label, names (oldest -> newest, label last), kind, currency,
//                 months: {"YYYY-MM": {monthEnd, opening, closing, fx, partial?, startDate?}},
//                 cash, trades, fromStatements? (default true; false = transaction-history
//                 download only)}}; the key is the portfolio id
//     config    as loaded; anything but an object counts as {}
//     months    [{month, id?}] covered by the loaded inputs: any order, repeats allowed
//     order     optional comparator over the raw portfolio objects; default: first month,
//               then label, then id, by code point
//
// Pure and locale-independent: strings compare by code point, inputs are never mutated, and
// no config value makes it throw (a non-string name, kind or mergeInto reads as absent;
// exclude counts when truthy; ids are looked up as own properties only). Derived from the
// newest account accumulator of the old parsers, which docs/MIGRATION.md names with its
// lines; the changes from it are listed there.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./export.js"));
  else root.StatementAssemble = factory(root.StatementExport);
})(typeof self !== "undefined" ? self : this, function (E) {
  "use strict";

  const ZERO = 0.005;
  const CATEGORY_CASH_LIKE_TRADE = "trade in cash-like account";

  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const own = (o, k) => o !== null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
  const isEntry = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  const string = (v) => (typeof v === "string" ? v : "");
  // An own data property even for a name like "__proto__".
  const define = (o, k, value) => Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });

  function build({ raw = {}, config, months = [], statements = 0, downloads, errors = [], warnings = [], skippedRows = [],
                   cashLikeTrades = "strip", order } = {}) {
    if (cashLikeTrades !== "strip" && cashLikeTrades !== "keep") throw new TypeError('StatementAssemble.build: cashLikeTrades must be "strip" or "keep"');
    if (order !== undefined && typeof order !== "function") throw new TypeError("StatementAssemble.build: order must be a comparator function");
    const settings = config !== null && typeof config === "object" ? config : {};
    const cfg = (id) => (own(settings, id) && isEntry(settings[id]) ? settings[id] : {});

    // 1. Portfolios with no cash, no trades and nothing but zero balances are left out.
    const kept = new Map();
    for (const id of Object.keys(raw)) {
      const r = raw[id];
      const ms = Object.values(r.months || {});
      const empty = !(r.cash || []).length && !(r.trades || []).length
        && ms.every((m) => Math.abs(m.closing || 0) < ZERO && Math.abs(m.opening || 0) < ZERO);
      if (!empty) kept.set(id, r);
    }

    // 2. Portfolio order.
    const span = new Map();
    for (const [id, r] of kept) {
      const keys = Object.keys(r.months || {}).sort(cmp);
      span.set(id, { firstMonth: keys.length ? keys[0] : null, lastMonth: keys.length ? keys[keys.length - 1] : null });
    }
    const ids = [...kept.keys()].sort(order
      ? (x, y) => order(kept.get(x), kept.get(y))
      : (x, y) => cmp(span.get(x).firstMonth || "", span.get(y).firstMonth || "") || cmp(string(kept.get(x).label), string(kept.get(y).label)) || cmp(x, y));

    // 3. The root of a merge chain, with the cycle guard of every old parser.
    const rootOf = (id) => {
      const path = new Set();
      for (;;) {
        const target = string(cfg(id).mergeInto);
        if (!target || !kept.has(target) || path.has(id)) return id;
        path.add(id);
        id = target;
      }
    };

    // 4-5. Accounts, created in portfolio order.
    const accounts = {};
    const accountOf = new Map();
    for (const id of ids) {
      const r = kept.get(id);
      const rootId = rootOf(id);
      const root = kept.get(rootId);
      const rc = cfg(rootId);
      if (rc.exclude || cfg(id).exclude) { accountOf.set(id, null); continue; }
      const name = string(rc.name).trim() || root.label;
      accountOf.set(id, name);
      let a = own(accounts, name) ? accounts[name] : null;
      if (!a) {
        a = { kind: string(rc.kind) || root.kind, currency: root.currency, valuations: [], trades: [], cash: [], months: {}, portfolios: [], downloadOnly: true };
        define(accounts, name, a);
      }
      a.portfolios.push(id);
      a.downloadOnly = a.downloadOnly && r.fromStatements === false;
      for (const c of r.cash || []) a.cash.push(c);
      for (const t of r.trades || []) a.trades.push(t);
      const rm = r.months || {};
      for (const m of Object.keys(rm).sort(cmp)) {
        const v = rm[m];
        const t = own(a.months, m) ? a.months[m] : (a.months[m] = { monthEnd: v.monthEnd, opening: 0, closing: 0, fx: v.fx === undefined ? null : v.fx });
        t.opening = E.round2(t.opening + v.opening);
        t.closing = E.round2(t.closing + v.closing);
        if (v.partial) t.partial = true;
        if (v.startDate && (!t.startDate || v.startDate < t.startDate)) t.startDate = v.startDate;
      }
    }

    // 6. Stable date order, months in order, and the month-end values.
    const skipped = [...skippedRows];
    for (const [name, a] of Object.entries(accounts)) {
      a.cash.sort((x, y) => cmp(x.date, y.date));
      a.trades.sort((x, y) => cmp(x.date, y.date));
      const keys = Object.keys(a.months).sort(cmp);
      const sorted = {};
      for (const k of keys) sorted[k] = a.months[k];
      a.months = sorted;
      a.valuations = keys.map((k) => [sorted[k].monthEnd, sorted[k].closing]);
      // 7. Buys and sells in an account that does not hold investments are not exported.
      if (cashLikeTrades === "strip" && a.kind !== "investment" && a.trades.length) {
        for (const t of a.trades) skipped.push({ date: t.date, category: CATEGORY_CASH_LIKE_TRADE, detail: t.name, account: name });
        a.trades = [];
      }
    }

    // 8. The loaded months, once each and in order, and the missing ones.
    const seen = new Set();
    const monthList = [];
    for (const m of months) {
      if (!m || typeof m.month !== "string" || seen.has(m.month)) continue;
      seen.add(m.month);
      monthList.push(m.id === undefined ? { month: m.month } : { month: m.month, id: m.id });
    }
    monthList.sort((x, y) => cmp(x.month, y.month));
    const gaps = E.monthGaps(monthList.map((m) => m.month));

    // 9. Loaded months that leave out a portfolio open before and after them, and the
    //    balances the earliest loaded month opens with.
    const lastClosingBefore = (r, m) => { const k = Object.keys(r.months || {}).filter((x) => x < m).sort(cmp).pop(); return k ? r.months[k].closing : 0; };
    const partialMonths = [...new Set([...kept].flatMap(([id, r]) => monthList.map((x) => x.month).filter((m) => {
      const { firstMonth, lastMonth } = span.get(id);
      return firstMonth !== null && m > firstMonth && m < lastMonth && !own(r.months, m) && Math.abs(lastClosingBefore(r, m)) >= ZERO;
    })))].sort(cmp);
    const first = monthList.length ? monthList[0].month : null;
    const firstOpenings = first ? Object.entries(accounts).filter(([, a]) => own(a.months, first) && Math.abs(a.months[first].opening) >= ZERO)
      .map(([name, a]) => ({ account: name, month: first, opening: a.months[first].opening })) : [];

    // 10. The configurator's rows, in portfolio order.
    const portfolios = ids.map((id) => {
      const r = kept.get(id);
      return { id, label: r.label, names: Array.isArray(r.names) ? [...r.names] : [r.label], ...span.get(id),
               kind: r.kind, currency: r.currency === undefined ? null : r.currency, account: accountOf.get(id) };
    });

    const result = { accounts, months: monthList, portfolios, errors: [...errors], warnings: [...warnings], gaps, firstOpenings,
                     skippedRows: skipped, statements, partialMonths, late: [], closed: [] };
    if (downloads !== undefined) result.downloads = downloads;
    return result;
  }

  return { build };
});
