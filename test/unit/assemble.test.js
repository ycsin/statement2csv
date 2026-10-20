// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// core/assemble.js (docs/TESTING.md, unit tests): merge, chain, cycle, unknown target, exclude
// root or member, rename collision, kind override, cashLikeTrades strip/keep, code-point order,
// partial/startDate/downloadOnly merging, firstOpenings, partialMonths; config garbage and
// purity. A differential test pins it to the old account accumulator it is derived from, on
// seeded random inputs inside the domain where the two must agree (string config fields,
// labels whose locale order is their code-point order, no trades, fx null). The old
// accumulator is embedded below verbatim; with the old repositories present, the test also
// checks that an old parser contains exactly these lines. Synthetic data only.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const E = require("../../core/export.js");
const { build } = require("../../core/assemble.js");
const { checkResult } = require("../../core/contract/result.js");
const { mulberry32 } = require("../lib/prng.js");
const { frozenProviders } = require("../lib/load-provider.js");

const REPO = path.resolve(__dirname, "..", "..");
const SOURCE = fs.readFileSync(path.join(REPO, "core", "assemble.js"), "utf8");
const oldRoot = process.env.S2C_OLD_ROOT || os.homedir();

const clone = (v) => structuredClone(v);
function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

// ---------------------------------------------------------------- builders

const lastDay = (m) => E.lastDayOf(m);
// A raw portfolio: months as {"YYYY-MM": [opening, closing, extra?]}.
function portfolio(label, { kind = "bank", currency = "SGD", months = {}, cash = [], trades = [], names, fromStatements } = {}) {
  const r = { label, names: names || [label], kind, currency, months: {}, cash, trades };
  for (const [m, [opening, closing, extra]] of Object.entries(months)) r.months[m] = { monthEnd: lastDay(m), opening, closing, fx: null, ...(extra || {}) };
  if (fromStatements !== undefined) r.fromStatements = fromStatements;
  return r;
}
const cashRow = (date, amount, name = "row", extra = {}) => ({ date, amount, currency: "SGD", name, notes: "", kind: "bank", ...extra });
const tradeRow = (date, name = "Buy X") => ({ date, ticker: "X", qty: 1, price: 2, currency: "SGD", name });
const monthsOf = (...ms) => ms.map((m) => ({ month: m, id: `s-${m}` }));

// Three portfolios over 2026-01..2026-03, all with something in them.
function sample() {
  return {
    "p0:SGD": portfolio("Alpha", { months: { "2026-01": [100, 110], "2026-02": [110, 120] }, cash: [cashRow("2026-01-05", -10), cashRow("2026-02-05", -10)] }),
    "p1:SGD": portfolio("Bravo", { months: { "2026-01": [50, 55], "2026-03": [60, 70] }, cash: [cashRow("2026-01-07", -5)] }),
    "p2:USD": portfolio("Charlie", { kind: "investment", currency: "USD", months: { "2026-02": [0, 20], "2026-03": [20, 25] }, cash: [cashRow("2026-02-03", -20)], trades: [tradeRow("2026-02-04")] }),
  };
}
const run = (raw, config = {}, extra = {}) => build({ raw, config, months: monthsOf("2026-01", "2026-02", "2026-03"), statements: 3, errors: [], warnings: [], skippedRows: [], ...extra });

// ---------------------------------------------------------------- the shape

test("a plain build: accounts in portfolio order, sorted rows and months, the result fields", () => {
  const r = run(sample());
  assert.deepEqual(Object.keys(r), ["accounts", "months", "portfolios", "errors", "warnings", "gaps", "firstOpenings", "skippedRows", "statements", "partialMonths", "late", "closed"]);
  assert.deepEqual(Object.keys(r.accounts), ["Alpha", "Bravo", "Charlie"]);
  assert.deepEqual(r.accounts.Alpha, {
    kind: "bank", currency: "SGD",
    valuations: [["2026-01-31", 110], ["2026-02-28", 120]],
    trades: [],
    cash: [cashRow("2026-01-05", -10), cashRow("2026-02-05", -10)],
    months: { "2026-01": { monthEnd: "2026-01-31", opening: 100, closing: 110, fx: null }, "2026-02": { monthEnd: "2026-02-28", opening: 110, closing: 120, fx: null } },
    portfolios: ["p0:SGD"],
    downloadOnly: false,
  });
  assert.deepEqual(r.months, monthsOf("2026-01", "2026-02", "2026-03"));
  assert.deepEqual(r.gaps, []);
  assert.deepEqual(r.portfolios.map((p) => [p.id, p.label, p.firstMonth, p.lastMonth, p.kind, p.currency, p.account]), [
    ["p0:SGD", "Alpha", "2026-01", "2026-02", "bank", "SGD", "Alpha"],
    ["p1:SGD", "Bravo", "2026-01", "2026-03", "bank", "SGD", "Bravo"],
    ["p2:USD", "Charlie", "2026-02", "2026-03", "investment", "USD", "Charlie"],
  ]);
  assert.deepEqual(r.portfolios[0].names, ["Alpha"]);
  assert.deepEqual(r.firstOpenings, [{ account: "Alpha", month: "2026-01", opening: 100 }, { account: "Bravo", month: "2026-01", opening: 50 }]);
  assert.deepEqual(r.partialMonths, ["2026-02"], "Bravo is open in 2026-01 and 2026-03 but missing from 2026-02");
  assert.deepEqual([r.late, r.closed, r.statements], [[], [], 3]);
  assert.ok(!("downloads" in r));
  assert.equal(build({ raw: sample(), months: [], downloads: 2 }).downloads, 2);
});

test("the result passes checkResult in strict mode", () => {
  for (const config of [{}, { "p1:SGD": { mergeInto: "p0:SGD" } }, { "p0:SGD": { name: "=Renamed \"A&B\", <x>", kind: "investment" } }]) {
    const r = run(sample(), config);
    assert.deepEqual(checkResult(r, null, { strict: true, P: E }), { errors: [], warnings: [] }, JSON.stringify(config));
  }
});

// ---------------------------------------------------------------- merging

test("merge: members' months are summed with round2, cash concatenated and sorted, monthEnd and fx from the first member", () => {
  const raw = {
    a: portfolio("A", { months: { "2026-01": [0.1, 0.2] }, cash: [cashRow("2026-01-20", -1, "late a")] }),
    b: portfolio("B", { months: { "2026-01": [0.2, 0.1], "2026-02": [5, 6] }, cash: [cashRow("2026-01-02", -2, "early b"), cashRow("2026-01-20", -3, "late b")] }),
  };
  raw.a.months["2026-01"].fx = 1.25;
  raw.b.months["2026-01"].fx = 9;
  raw.b.months["2026-01"].monthEnd = "2026-01-30";
  const r = build({ raw, config: { b: { mergeInto: "a" } }, months: monthsOf("2026-01", "2026-02") });
  assert.deepEqual(Object.keys(r.accounts), ["A"]);
  const a = r.accounts.A;
  assert.deepEqual(a.months["2026-01"], { monthEnd: "2026-01-31", opening: 0.3, closing: 0.3, fx: 1.25 });
  assert.deepEqual(a.months["2026-02"], { monthEnd: "2026-02-28", opening: 5, closing: 6, fx: null });
  assert.deepEqual(a.cash.map((c) => c.name), ["early b", "late a", "late b"], "stable by date, members in portfolio order");
  assert.deepEqual(a.portfolios, ["a", "b"]);
  assert.deepEqual(r.portfolios.map((p) => p.account), ["A", "A"]);
});

test("merge chains, cycles and unknown targets follow every old parser's loop", () => {
  const raw = () => ({
    p0: portfolio("Zero", { months: { "2026-01": [1, 1] } }),
    p1: portfolio("One", { months: { "2026-01": [2, 2] } }),
    p2: portfolio("Two", { months: { "2026-01": [4, 4] } }),
  });
  const accounts = (config) => Object.fromEntries(Object.entries(build({ raw: raw(), config, months: monthsOf("2026-01") }).accounts).map(([n, a]) => [n, a.portfolios]));
  assert.deepEqual(accounts({ p2: { mergeInto: "p1" }, p1: { mergeInto: "p0" } }), { Zero: ["p1", "p2", "p0"] }, "a chain ends at its root; members in portfolio order (One, Two, Zero)");
  assert.deepEqual(accounts({ p0: { mergeInto: "p1" }, p1: { mergeInto: "p0" } }), { Zero: ["p0"], One: ["p1"], Two: ["p2"] }, "in a two-cycle each is its own root");
  assert.deepEqual(accounts({ p0: { mergeInto: "p1" }, p1: { mergeInto: "p2" }, p2: { mergeInto: "p0" } }), { Zero: ["p0"], One: ["p1"], Two: ["p2"] }, "in a three-cycle too");
  assert.deepEqual(accounts({ p1: { mergeInto: "nope" } }), { Zero: ["p0"], One: ["p1"], Two: ["p2"] }, "an unknown target is ignored");
  assert.deepEqual(accounts({ p1: { mergeInto: "p1" } }), { Zero: ["p0"], One: ["p1"], Two: ["p2"] }, "a self-merge is ignored");
});

test("merging into a portfolio that is left out (all zero, nothing in it) keeps the member on its own", () => {
  const raw = { empty: portfolio("Empty", { months: { "2026-01": [0, 0.004] } }), p: portfolio("P", { months: { "2026-01": [1, 2] } }) };
  const r = build({ raw, config: { p: { mergeInto: "empty" } }, months: monthsOf("2026-01") });
  assert.deepEqual(Object.keys(r.accounts), ["P"]);
  assert.deepEqual(r.portfolios.map((p) => p.id), ["p"], "the empty portfolio is not offered at all");
});

test("exclude: the root excludes every member, a member only itself; exclude counts when truthy", () => {
  const names = (config) => Object.keys(run(sample(), config).accounts);
  const merge = { "p1:SGD": { mergeInto: "p0:SGD" } };
  assert.deepEqual(names({ ...merge, "p0:SGD": { exclude: true } }), ["Charlie"]);
  assert.deepEqual(names({ "p1:SGD": { mergeInto: "p0:SGD", exclude: true } }), ["Alpha", "Charlie"]);
  assert.deepEqual(run(sample(), { "p1:SGD": { mergeInto: "p0:SGD", exclude: true } }).accounts.Alpha.portfolios, ["p0:SGD"]);
  assert.deepEqual(names({ "p2:USD": { exclude: "yes" } }), ["Alpha", "Bravo"]);
  assert.deepEqual(names({ "p2:USD": { exclude: 0 } }), ["Alpha", "Bravo", "Charlie"]);
  assert.deepEqual(run(sample(), { "p2:USD": { exclude: true } }).portfolios.map((p) => p.account), ["Alpha", "Bravo", null]);
});

test("rename: trimmed, a blank name keeps the label, and two portfolios with one name share an account", () => {
  const r = run(sample(), { "p0:SGD": { name: "  Merged  " }, "p2:USD": { name: "Merged" }, "p1:SGD": { name: "   " } });
  assert.deepEqual(Object.keys(r.accounts), ["Merged", "Bravo"]);
  const m = r.accounts.Merged;
  assert.deepEqual([m.kind, m.currency, m.portfolios], ["bank", "SGD", ["p0:SGD", "p2:USD"]], "kind and currency come from the first portfolio");
  assert.deepEqual(m.trades, [], "the investment portfolio's trades sit in a bank account now, so they are stripped");
  assert.deepEqual(r.portfolios.map((p) => p.account), ["Merged", "Bravo", "Merged"]);
});

test("kind override: the root's configured kind applies; a member's is ignored", () => {
  assert.equal(run(sample(), { "p0:SGD": { kind: "investment" } }).accounts.Alpha.kind, "investment");
  assert.equal(run(sample(), { "p1:SGD": { mergeInto: "p0:SGD", kind: "investment" } }).accounts.Alpha.kind, "bank");
  assert.equal(run(sample(), { "p0:SGD": { kind: "cash" } }).portfolios[0].kind, "bank", "portfolios keep the detected kind");
  assert.equal(run(sample(), { "p0:SGD": { kind: "foo" } }).accounts.Alpha.kind, "foo", "a hand-edited kind string passes through");
  assert.equal(run(sample(), { "p0:SGD": { kind: "" } }).accounts.Alpha.kind, "bank");
});

test("cashLikeTrades: strip moves trades of non-investment accounts to skippedRows; keep leaves them", () => {
  const given = [{ date: "2026-01-01", category: "unknown", detail: "x", account: "Alpha" }];
  const stripped = run(sample(), { "p2:USD": { kind: "cash" } }, { skippedRows: given });
  assert.deepEqual(stripped.accounts.Charlie.trades, []);
  assert.deepEqual(stripped.skippedRows, [...given, { date: "2026-02-04", category: "trade in cash-like account", detail: "Buy X", account: "Charlie" }]);
  assert.notEqual(stripped.skippedRows, given, "a new array; the input is not touched");
  assert.equal(given.length, 1);
  const kept = run(sample(), { "p2:USD": { kind: "cash" } }, { cashLikeTrades: "keep" });
  assert.deepEqual(kept.accounts.Charlie.trades, [tradeRow("2026-02-04")]);
  assert.deepEqual(kept.skippedRows, []);
  assert.deepEqual(run(sample()).accounts.Charlie.trades, [tradeRow("2026-02-04")], "an investment account keeps its trades");
  assert.throws(() => run(sample(), {}, { cashLikeTrades: "drop" }), TypeError);
});

test("partial is OR'ed, the earliest startDate wins, downloadOnly needs every member to be download-only", () => {
  const raw = {
    a: portfolio("A", { months: { "2026-01": [1, 2, { startDate: "2026-01-12" }], "2026-02": [2, 3] }, fromStatements: false }),
    b: portfolio("B", { months: { "2026-01": [1, 1, { startDate: "2026-01-05", partial: true }], "2026-02": [1, 1, { partial: false }] }, fromStatements: false }),
    c: portfolio("C", { months: { "2026-01": [7, 7] } }),
    d: portfolio("D", { months: { "2026-01": [8, 8] }, fromStatements: false }),
  };
  const r = build({ raw, config: { b: { mergeInto: "a" }, c: { mergeInto: "d" } }, months: monthsOf("2026-01", "2026-02") });
  assert.deepEqual(r.accounts.A.months["2026-01"], { monthEnd: "2026-01-31", opening: 2, closing: 3, fx: null, startDate: "2026-01-05", partial: true });
  assert.deepEqual(r.accounts.A.months["2026-02"], { monthEnd: "2026-02-28", opening: 3, closing: 4, fx: null });
  assert.equal(r.accounts.A.downloadOnly, true);
  assert.equal(r.accounts.D.downloadOnly, false, "c has statements (fromStatements defaults to true)");
  assert.deepEqual(Object.keys(r.accounts), ["A", "D"]);
});

// ---------------------------------------------------------------- order

test("code-point order: first month, then label, then id; never the locale", () => {
  const raw = {
    z: portfolio("alpha", { months: { "2026-02": [1, 1] } }),
    y: portfolio("Zeta", { months: { "2026-02": [1, 1] } }),
    x: portfolio("Øre", { months: { "2026-02": [1, 1] } }),
    w: portfolio("Äpfel", { months: { "2026-02": [1, 1] } }),
    v: portfolio("late", { months: { "2026-03": [1, 1] } }),
    u: portfolio("early", { months: { "2026-01": [1, 1] } }),
    t: portfolio("alpha", { months: { "2026-02": [2, 2] } }),
  };
  const r = build({ raw, months: monthsOf("2026-01", "2026-02", "2026-03") });
  assert.deepEqual(r.portfolios.map((p) => p.id), ["u", "y", "t", "z", "w", "x", "v"]);
  assert.deepEqual(Object.keys(r.accounts), ["early", "Zeta", "alpha", "Äpfel", "Øre", "late"]);
  assert.deepEqual(r.accounts.alpha.portfolios, ["t", "z"], "same label: the id decides");
  assert.notDeepEqual(["Zeta", "alpha", "Äpfel", "Øre"].slice().sort((a, b) => a.localeCompare(b)), ["Zeta", "alpha", "Äpfel", "Øre"], "a locale would order these differently");
  assert.ok(!/localeCompare/.test(SOURCE), "core/assemble.js never calls localeCompare");
});

test("order: a provider's comparator over the raw portfolios decides the order", () => {
  const raw = sample();
  const byLabelDesc = (a, b) => (a.label < b.label ? 1 : a.label > b.label ? -1 : 0);
  const r = run(raw, {}, { order: byLabelDesc });
  assert.deepEqual(Object.keys(r.accounts), ["Charlie", "Bravo", "Alpha"]);
  assert.deepEqual(r.portfolios.map((p) => p.id), ["p2:USD", "p1:SGD", "p0:SGD"]);
  assert.throws(() => run(raw, {}, { order: "label" }), TypeError);
});

// ---------------------------------------------------------------- months, gaps, openings

test("months: repeats dropped (the first id wins), sorted by code point; gaps between them", () => {
  const r = build({ raw: sample(), months: [{ month: "2026-04", id: "d" }, { month: "2026-01", id: "a" }, { month: "2026-01", id: "a2" }, { month: "2025-11" }] });
  assert.deepEqual(r.months, [{ month: "2025-11" }, { month: "2026-01", id: "a" }, { month: "2026-04", id: "d" }]);
  assert.deepEqual(r.gaps, ["2025-12", "2026-02", "2026-03"]);
  assert.deepEqual(r.firstOpenings, [], "no account has the earliest loaded month");
});

test("firstOpenings: accounts with the earliest month and a non-zero opening, by export name", () => {
  const raw = sample();
  raw["p1:SGD"].months["2026-01"].opening = 0.004;
  const r = run(raw, { "p0:SGD": { name: "First" } });
  assert.deepEqual(r.firstOpenings, [{ account: "First", month: "2026-01", opening: 100 }]);
  assert.deepEqual(run(raw, { "p0:SGD": { exclude: true } }).firstOpenings, []);
});

test("partialMonths: a loaded month inside a portfolio's span without that portfolio, unless it was at zero", () => {
  const raw = {
    a: portfolio("A", { months: { "2026-01": [1, 5], "2026-04": [5, 6] } }),
    b: portfolio("B", { months: { "2026-01": [0, 0], "2026-03": [0, 1] }, cash: [cashRow("2026-03-01", -1)] }),
    c: portfolio("C", { months: { "2026-01": [1, 1], "2026-02": [1, 1], "2026-03": [1, 1], "2026-04": [1, 1] } }),
  };
  const r = build({ raw, months: monthsOf("2026-01", "2026-02", "2026-03", "2026-04") });
  assert.deepEqual(r.partialMonths, ["2026-02", "2026-03"], "A misses 02 and 03; B misses 02 but was at 0");
  assert.deepEqual(build({ raw, config: { a: { exclude: true } }, months: monthsOf("2026-01", "2026-02", "2026-03", "2026-04") }).partialMonths,
    ["2026-02", "2026-03"], "every portfolio counts, excluded or not");
});

test("portfolios with no cash, no trades and only zero balances are left out; a trade keeps one", () => {
  const raw = {
    zero: portfolio("Zero", { months: { "2026-01": [0, 0], "2026-02": [0.004, -0.004] } }),
    traded: portfolio("Traded", { kind: "investment", months: { "2026-01": [0, 0] }, trades: [tradeRow("2026-01-03")] }),
    nomonths: portfolio("No months"),
  };
  const r = build({ raw, months: monthsOf("2026-01", "2026-02") });
  assert.deepEqual(Object.keys(r.accounts), ["Traded"]);
  assert.deepEqual(r.portfolios.map((p) => p.id), ["traded"]);
});

// ---------------------------------------------------------------- config garbage and purity

test("garbage configs never throw: non-objects count as {}, non-string fields read as absent", () => {
  const plain = run(sample());
  for (const config of [5, "x", null, undefined, true, [], ["p0:SGD"], { x: 5 }, { x: { name: 5, kind: 5, mergeInto: 5, exclude: "yes" } }, { "p0:SGD": 5 }, { "p0:SGD": [] }]) {
    assert.deepEqual(run(sample(), config), plain, JSON.stringify(config));
  }
  const odd = run(sample(), { "p0:SGD": { name: 5, kind: 5, mergeInto: 5 }, "p1:SGD": { name: { toString: () => "X" }, kind: ["cash"], mergeInto: ["p0:SGD"] } });
  assert.deepEqual(Object.keys(odd.accounts), ["Alpha", "Bravo", "Charlie"]);
  assert.equal(odd.accounts.Alpha.kind, "bank");
  assert.deepEqual(run(sample(), { "p0:SGD": { name: 5, exclude: "yes" } }).portfolios[0].account, null);
});

test("ids and names that are Object.prototype keys are ordinary ids and names", () => {
  const raw = {
    constructor: portfolio("toString", { months: { "2026-01": [1, 1] } }),
    ["__proto__"]: portfolio("P", { months: { "2026-01": [2, 2] } }), // a computed key: an own "__proto__" property
    hasOwnProperty: portfolio("H", { months: { "2026-01": [3, 3] } }),
  };
  const config = JSON.parse('{"__proto__": {"name": "__proto__"}, "hasOwnProperty": {"mergeInto": "constructor"}, "constructor": {"mergeInto": "valueOf"}}');
  const r = build({ raw, config, months: monthsOf("2026-01") });
  assert.deepEqual(Object.keys(r.accounts), ["toString", "__proto__"]);
  assert.ok(Object.prototype.hasOwnProperty.call(r.accounts, "__proto__"));
  assert.equal(Object.getPrototypeOf(r.accounts), Object.prototype);
  assert.deepEqual(r.accounts.toString.portfolios, ["hasOwnProperty", "constructor"], "portfolio order H, P, toString");
  assert.deepEqual(r.accounts.__proto__.portfolios, ["__proto__"]);
  assert.deepEqual(checkResult(r, null, { strict: true }).errors, []);
});

test("inputs are never mutated (deep-frozen), and the same input gives the same result in any key order", () => {
  const raw = sample();
  const config = { "p1:SGD": { mergeInto: "p0:SGD", name: " Both " }, "p2:USD": { kind: "cash" } };
  const months = [...monthsOf("2026-03", "2026-01", "2026-02"), { month: "2026-01", id: "again" }];
  const input = deepFreeze({ raw: clone(raw), config, months, statements: 2, downloads: 1, errors: [{ id: "x", error: "not this" }], warnings: ["w"], skippedRows: [] });
  const a = build(input);
  const b = build(input);
  assert.deepEqual(a, b);
  const reversed = Object.fromEntries(Object.entries(raw).reverse());
  assert.deepEqual(build({ ...input, raw: reversed }), a);
  assert.deepEqual(a.errors, [{ id: "x", error: "not this" }]);
  assert.notEqual(a.errors, input.errors);
});

test("loading touches nothing: the browser branch sets self.StatementAssemble after self.StatementExport", () => {
  const context = vm.createContext({});
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(REPO, "core", "export.js"), "utf8"), context);
  vm.runInContext(SOURCE, context);
  assert.deepEqual(Object.keys(context.StatementAssemble), ["build"]);
  const r = context.StatementAssemble.build({ raw: sample(), months: monthsOf("2026-01", "2026-02", "2026-03") });
  assert.deepEqual(JSON.parse(JSON.stringify(r)), JSON.parse(JSON.stringify(run(sample(), {}, { statements: 0, errors: [], warnings: [] }))));
});

// ---------------------------------------------------------------- against the old accumulator

// The newest old account accumulator, verbatim (docs/MIGRATION.md names its file and lines):
// the drop step, merge roots, accounts, sorting, gaps, partial months and first openings.
const OLD_ACCUMULATOR = String.raw`    for (const [id, r] of Object.entries(raw)) if (!r.cash.length && Object.values(r.months).every((m) => Math.abs(m.closing || 0) < ZERO && Math.abs(m.opening || 0) < ZERO)) delete raw[id];

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
      .map(([name, a]) => ({ account: name, month: first, opening: a.months[first].opening })) : [];`;
// The old result's portfolio rows (the same parser's return statement).
const OLD_PORTFOLIOS = "portfolios: portfolios.map((r) => ({ id: r.id, label: r.label, names: r.names, firstMonth: r.firstMonth, lastMonth: r.lastMonth, kind: r.kind, currency: r.currency, account: r.account })),";

const oldAccumulator = vm.compileFunction(`${OLD_ACCUMULATOR}\n    return { accounts, months, gaps, partialMonths, firstOpenings, ${OLD_PORTFOLIOS} };`,
  ["raw", "config", "months", "round2", "E", "ZERO"]);

const legacy = frozenProviders({ root: REPO }).filter((p) => p.frozen.legacyRepo);
const parsers = legacy.map(({ frozen }) => path.join(oldRoot, frozen.legacyRepo, "src", "parser.js"));
const oldPresent = parsers.length > 0 && parsers.every((f) => fs.existsSync(f));

test("the embedded old accumulator is an old parser's own code, line for line", { skip: oldPresent ? false : "old repositories not present" }, () => {
  const containing = parsers.filter((f) => {
    const text = fs.readFileSync(f, "utf8");
    return text.includes(`${OLD_ACCUMULATOR}\n`) && text.includes(`      ${OLD_PORTFOLIOS}\n`);
  });
  assert.equal(containing.length, 1, "exactly one old parser holds this accumulator");
});

// Random raw portfolios, configs and loaded months inside the shared domain.
function generate(rand) {
  const pickOne = (xs) => xs[Math.floor(rand() * xs.length)];
  const MONTHS = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"];
  const LABELS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel"].sort(() => rand() - 0.5);
  const n = 2 + Math.floor(rand() * 5);
  const cents = () => (rand() < 0.2 ? 0 : Math.round((rand() * 2000 - 500) * 100) / 100);
  const raw = {};
  const ids = [];
  for (let i = 0; i < n; i++) {
    const id = rand() < 0.2 ? String(10 + i) : `p${i}:${pickOne(["SGD", "USD"])}`;
    const months = {};
    let first = Math.floor(rand() * MONTHS.length);
    const span = 1 + Math.floor(rand() * (MONTHS.length - first));
    for (let k = first; k < first + span; k++) {
      if (k > first && rand() < 0.25) continue;
      const m = MONTHS[k];
      const zero = rand() < 0.15;
      months[m] = { monthEnd: lastDay(m), opening: zero ? 0 : cents(), closing: zero ? 0 : cents(), fx: null };
      if (rand() < 0.15) months[m].partial = true;
      if (rand() < 0.15) months[m].startDate = `${m}-${String(1 + Math.floor(rand() * 27)).padStart(2, "0")}`;
    }
    const keys = Object.keys(months).sort();
    const cash = [];
    for (const m of keys) {
      const k = Math.floor(rand() * 3);
      for (let j = 0; j < k; j++) cash.push(cashRow(`${m}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`, cents(), `r${i}.${j}`, rand() < 0.1 ? { balancing: true } : {}));
    }
    const label = LABELS[i];
    raw[id] = { id, label, names: rand() < 0.3 ? [`old ${label}`, label] : [label], kind: pickOne(["investment", "cash", "bank"]), currency: id.endsWith("USD") ? "USD" : "SGD",
                months, cash, trades: [], fromStatements: rand() < 0.7, firstMonth: keys[0], lastMonth: keys[keys.length - 1] };
    ids.push(id);
  }
  const config = {};
  for (const id of ids) {
    if (rand() < 0.5) continue;
    const c = {};
    if (rand() < 0.3) c.name = pickOne(["merged", " alpha ", "bravo", "  spaced  ", "x"]);
    if (rand() < 0.3) c.kind = pickOne(["investment", "cash"]);
    if (rand() < 0.4) c.mergeInto = rand() < 0.15 ? "nope" : pickOne(ids);
    if (rand() < 0.15) c.exclude = true;
    config[id] = c;
  }
  const loaded = [...new Set(Object.values(raw).flatMap((r) => Object.keys(r.months)))];
  if (rand() < 0.3) loaded.push(pickOne(MONTHS));
  const months = [...new Set(loaded)].sort(() => rand() - 0.5).map((m) => ({ id: `s-${m}`, month: m }));
  return { raw, config, months };
}

test("on 2000 seeded random inputs, build equals the old accumulator wherever the two must agree", () => {
  let accountsSeen = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const { raw, config, months } = generate(mulberry32(seed));
    const old = oldAccumulator(clone(raw), clone(config), clone(months), E.round2, E, 0.005);
    for (const a of Object.values(old.accounts)) for (const m of Object.values(a.months)) delete m.cashflow;
    const input = deepFreeze({ raw: clone(raw), config: clone(config), months: clone(months), statements: 1, errors: [], warnings: [], skippedRows: [] });
    const mine = build(input);
    const at = `seed ${seed}`;
    assert.deepEqual(Object.keys(mine.accounts), Object.keys(old.accounts), `${at}: account order`);
    assert.deepEqual(mine.accounts, old.accounts, `${at}: accounts`);
    assert.deepEqual(mine.months, old.months, `${at}: months`);
    assert.deepEqual([mine.gaps, mine.partialMonths, mine.firstOpenings], [old.gaps, old.partialMonths, old.firstOpenings], `${at}: gaps, partial months, first openings`);
    assert.deepEqual(mine.portfolios, old.portfolios, `${at}: portfolios`);
    accountsSeen += Object.keys(mine.accounts).length;
  }
  assert.ok(accountsSeen > 4000, `the generator makes real cases (${accountsSeen} accounts)`);
});
