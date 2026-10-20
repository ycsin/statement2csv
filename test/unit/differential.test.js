// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Differential tests (docs/TESTING.md): the core modules against the frozen copies of the old
// code in test/legacy/, 10 000 seeded cases per comparison (test/lib/prng.js), synthetic data
// only. A failure names the comparison, the seed and the first differing call, so every case can
// be regenerated from its seed.
//   - export: core/export.js against export layers C and B on every input, and against A on months
//     without a truthy partial or startDate, through all 17 shared functions. A fourth run gives A
//     those fields too and requires every difference to be one of the two that make C a safe
//     superset (a partial month of a bank account; a month's startDate).
//   - layout: core/layout.js against L3 on item clouds with injected near-duplicates, and L1
//     against L3 on clouds without near-duplicates (the only way the two differ).
//   - zip: zipParts(files, now) against the old writer at the same time, byte for byte.
//   - storage: core/storage.js against the old storage functions, for the frozen keys and mode ids
//     of every migrated provider, over stored values, junk and throwing storage.
// Generator counters are asserted too, so a degenerate generator cannot make a comparison pass
// vacuously.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const util = require("util");
const { mulberry32 } = require("../lib/prng.js");
const { frozenProviders } = require("../lib/load-provider.js");

const REPO = path.resolve(__dirname, "..", "..");
const core = (m) => require(path.join(REPO, "core", m));
const legacy = (m) => require(path.join(REPO, "test", "legacy", m));

const CASES = 10000;
const SHARED = ["qif", "round2", "pad", "monthGaps", "prevMonth", "lastDayOf", "dayBefore", "inRange", "tradesCsv", "transactionsCsv",
  "valuationsCsv", "adjustedEntries", "adjustedCsv", "openingBalance", "accountsCsv", "combinedTradesCsv", "combinedTransactionsCsv"];

// ---------------------------------------------------------------- shared helpers

function rand(seed) {
  const next = mulberry32(seed);
  const int = (a, b) => a + Math.floor(next() * (b - a + 1));
  const pick = (xs) => xs[Math.floor(next() * xs.length)];
  const chance = (p) => next() < p;
  const shuffle = (xs) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [xs[i], xs[j]] = [xs[j], xs[i]];
    }
    return xs;
  };
  return { next, int, pick, chance, shuffle };
}

// Runs fn and records its value or the error it throws, so equal throws compare equal.
function outcome(fn) {
  try {
    return { value: fn() };
  } catch (e) {
    return { threw: `${e && e.constructor ? e.constructor.name : typeof e}: ${e && e.message}` };
  }
}

const show = (v) => {
  const s = util.inspect(v, { depth: 6, breakLength: Infinity, maxArrayLength: 40, maxStringLength: 400 });
  return s.length > 3000 ? `${s.slice(0, 3000)}…` : s;
};

// The first index where two call logs ([label, outcome] pairs) differ, or -1.
function firstDifference(a, b) {
  for (let k = 0; k < Math.max(a.length, b.length); k++) if (!util.isDeepStrictEqual(a[k], b[k])) return k;
  return -1;
}

function assertSameCalls(what, seed, expected, actual) {
  const k = firstDifference(expected, actual);
  if (k < 0) return;
  assert.fail(`${what}, seed ${seed}: call ${k} (${(expected[k] || actual[k])[0]}) differs\n  old: ${show(expected[k])}\n  new: ${show(actual[k])}`);
}

// ---------------------------------------------------------------- export: inputs

const pad2 = (n) => String(n).padStart(2, "0");
const ym = (y, m) => `${y}-${pad2(m)}`;
function addMonths(month, k) {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + k;
  return ym(Math.floor(t / 12), (t % 12) + 1);
}
const daysIn = (month) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const day = (month, d) => `${month}-${pad2(d)}`;
const cents = (x) => Math.round(x * 100) / 100;

const WORDS = ["Deposit", "Withdrawal", "Interest", "Dividend", "Fee", "Transfer in", "Transfer out", "Card payment", "Refund",
  "Fund switch", "Unit trust", "Bonus", "Cash rebate", "Standing order", "Distribution"];
const TRICKY = [",", "\"", "\"\"", "\n", "\r\n", "\r", "\t", ", ", " \"quoted\" ", "é", "–", "€", "日本", "💰", "&", "<b>", "'", ";", "  "];
const LEADS = ["=", "+", "-", "@", "\t", "\r", "=1+2", "+1 ", "-12.50", "-", "@SUM(A1)", "=HYPERLINK(\"x\")", "1.5", ".5", "-0", "+5", "--", "=-"];
const CCYS = ["SGD", "USD", "MYR", "EUR", "HKD"];
const TICKERS = ["VWRA", "CSPX", "Global Equity Fund", "Bond, Short Duration", "=CMD", "\"Q\" Fund", "Fund–É", "-X"];

function text(r) {
  if (r.chance(0.04)) return "";
  if (r.chance(0.04)) return r.pick(LEADS);
  let s = r.pick(WORDS);
  for (let i = r.int(0, 3); i > 0; i--) s += r.chance(0.5) ? r.pick(TRICKY) : ` ${r.pick(WORDS)}`;
  if (r.chance(0.2)) s = r.pick(LEADS) + s;
  if (r.chance(0.03)) s = ` ${s} `;
  return s;
}

function money(r, max) {
  if (r.chance(0.03)) return 0;
  let v = cents((r.next() * 2 - 1) * max);
  if (r.chance(0.05)) v += r.pick([1e-9, -1e-9, 0.0049, 0.005, 0.1 + 0.2 - 0.3]);
  return v;
}

function genCash(r, month, currency, prev) {
  const c = {
    date: prev && r.chance(0.2) ? prev.date : day(month, r.int(1, daysIn(month))),
    amount: money(r, 3000),
    currency: r.chance(0.6) ? currency : r.chance(0.6) ? "USD" : r.pick(CCYS),
    name: text(r),
  };
  if (r.chance(0.3)) c.notes = r.chance(0.1) ? r.pick(["", null, 0]) : text(r);
  if (r.chance(0.05)) c.balancing = true;
  if (r.chance(0.03)) c.kind = r.pick(["adjustment", "gap", "trade", "other"]);
  return c;
}

function genTrade(r, month) {
  const t = {
    date: day(month, r.int(1, daysIn(month))),
    ticker: r.pick(TICKERS),
    qty: (r.chance(0.5) ? 1 : -1) * r.pick([r.int(1, 500), Math.round(r.next() * 1e9) / 1e6, 4e-7, 1.5]),
    price: r.pick([Math.round(r.next() * 5e6) / 1e4, Math.round(r.next() * 1e8) / 1e6, 0, 1]),
    currency: r.pick(CCYS),
    name: text(r),
  };
  return t;
}

// One malformed value in about 2% of the cases: both sides must then throw (or not) alike.
function corrupt(r, accounts) {
  if (!r.chance(0.02)) return false;
  const a = r.pick(accounts);
  const keys = Object.keys(a.months);
  const t = r.next();
  if (t < 0.3 && a.cash.length) r.pick(a.cash).date = r.pick([undefined, null, 20260101]);
  else if (t < 0.5 && a.trades.length) r.pick(a.trades).qty = r.pick([null, undefined, "1"]);
  else if (t < 0.7 && keys.length) a.months[r.pick(keys)].monthEnd = r.pick([undefined, null]);
  else if (t < 0.85 && keys.length) a.months[r.pick(keys)].closing = r.pick([undefined, "12.00", null]);
  else a.valuations.push([r.pick([undefined, "2026-01-31"]), r.pick([null, "1"])]);
  return true;
}

function monthEnd(r, month) {
  const t = r.next();
  if (t < 0.8) return day(month, daysIn(month));
  if (t < 0.97) return day(month, r.int(1, daysIn(month))); // a statement that ends mid-month
  return day(addMonths(month, 1), 1); // odd, but possible in a parser's output
}

// partial/startDate: absent, falsy or (only with truthy) truthy.
function optionalField(r, truthy, makeTruthy) {
  const t = r.next();
  if (t < 0.6) return { has: false };
  if (t < 0.75 || !truthy) return { has: true, value: r.pick([false, 0, "", null, undefined]) };
  return { has: true, value: makeTruthy() };
}

function genAccount(r, truthy, stats) {
  const currency = r.pick(CCYS);
  const kind = r.pick(["investment", "cash", "bank", "other"]);
  const start = ym(r.int(2016, 2028), r.int(1, 12));
  const keys = [];
  const nMonths = r.chance(0.05) ? 0 : r.int(1, 7);
  for (let i = 0, cur = start; i < nMonths; i++) {
    keys.push(cur);
    const step = r.chance(0.7) ? 1 : r.int(2, 14);
    if (step > 1) stats.gapped++;
    cur = addMonths(cur, step);
  }
  const months = {};
  const cash = [];
  const trades = [];
  let prevKey = null;
  let prevClosing = money(r, 20000);
  for (const k of keys) {
    const fx = r.pick([null, null, undefined, 0, Math.round((0.2 + r.next() * 4.8) * 1e4) / 1e4, Math.round((1 + r.next()) * 1e4) / 1e4]);
    const rows = [];
    for (let i = r.int(0, 6); i > 0; i--) rows.push(genCash(r, k, currency, rows[rows.length - 1]));
    const consecutive = prevKey !== null && addMonths(prevKey, 1) === k;
    const opening = prevKey !== null && r.chance(0.7) ? cents(prevClosing + (r.chance(0.2) ? money(r, 5) : 0)) : money(r, 20000);
    const base = consecutive ? prevClosing : opening;
    let flows = 0;
    for (const c of rows) {
      if (c.currency === currency) flows += -c.amount;
      else if (c.currency === "USD" && fx) flows += -cents(c.amount * fx);
    }
    const noise = r.pick([0, 0, 0, 0.004, -0.004, 0.005, -0.005, 0.006, 0.01, -0.01, money(r, 300)]);
    const m = { monthEnd: monthEnd(r, k), opening, closing: cents(base + flows + noise), fx };
    const partial = optionalField(r, truthy, () => r.pick([true, 1, "yes"]));
    if (partial.has) m.partial = partial.value;
    const startDate = optionalField(r, truthy, () => day(k, r.int(1, daysIn(k))));
    if (startDate.has) m.startDate = startDate.value;
    if (r.chance(0.02)) m.units = r.int(1, 99);
    months[k] = m;
    cash.push(...rows);
    prevKey = k;
    prevClosing = m.closing;
  }
  // Rows outside the loaded months (a gap month, or beyond): ignored by the balance export,
  // still listed by the plain writers.
  const around = keys.length ? keys : [start];
  for (let i = r.int(0, 2); i > 0; i--) cash.push(genCash(r, addMonths(r.pick(around), r.pick([-1, 1, 2])), currency, null));
  for (let i = r.int(0, 5); i > 0; i--) trades.push(genTrade(r, r.chance(0.85) ? r.pick(around) : addMonths(around[0], -1)));
  const byDate = (a, b) => (String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0);
  if (r.chance(0.7)) cash.sort(byDate);
  else r.shuffle(cash);
  if (r.chance(0.7)) trades.sort(byDate);
  const order = r.chance(0.3) ? r.shuffle([...keys]) : keys;
  const shuffledMonths = {};
  for (const k of order) shuffledMonths[k] = months[k];
  const valuations = keys.map((k) => [months[k].monthEnd, months[k].closing]);
  if (r.chance(0.2)) valuations.push([day(r.pick(around), 15), money(r, 9000)]);
  return { name: text(r), kind, currency, months: shuffledMonths, cash, trades, valuations, mode: r.pick(["balance", "tradelog", "holdings"]) };
}

function genExportCase(seed, { truthy }) {
  const r = rand(seed);
  const stats = { gapped: 0 };
  const accounts = [];
  for (let i = r.int(1, 3); i > 0; i--) accounts.push(genAccount(r, truthy, stats));
  stats.corrupt = corrupt(r, accounts);
  const all = [...new Set(accounts.flatMap((a) => Object.keys(a.months)))].sort();
  const first = all[0] || "2026-01";
  const last = all[all.length - 1] || "2026-01";
  const inGap = () => {
    for (let k = first; k < last; k = addMonths(k, 1)) if (!all.includes(k) && r.chance(0.5)) return k;
    return addMonths(last, 1);
  };
  const side = () => {
    const t = r.next();
    if (t < 0.15) return r.pick([null, "", undefined]);
    if (t < 0.65) return all.length ? r.pick(all) : first;
    if (t < 0.75) return addMonths(first, -r.int(1, 24));
    if (t < 0.85) return addMonths(last, r.int(1, 24));
    return inGap();
  };
  let from = side();
  let to = r.chance(0.1) ? from : side();
  let rangeKind = "plain";
  if (from && to && from > to) {
    if (r.chance(0.5)) [from, to] = [to, from]; // as the page's range() swaps them
    else rangeKind = "reversed"; // passed as is
  }
  const later = all.find((k) => k > first) || addMonths(first, 1);
  const earliestMonth = r.pick([null, addMonths(first, -r.int(1, 18)), first, first, later]);
  const withTrades = r.pick([true, false, undefined]);
  const months = Array.from({ length: 6 }, () => r.pick([ym(r.int(1999, 2101), r.int(1, 12)), r.pick(all.length ? all : [first]),
    "2024-02", "2100-02", "2000-02", "2026-01", "2026-12"]));
  if (r.chance(0.02)) months.push(r.pick(["2026-1", "2026-13", "2026-00", "abc", "", undefined]));
  const days = Array.from({ length: 4 }, () => {
    const m = r.pick(months.filter((x) => /^\d{4}-\d{2}$/.test(x) && Number(x.slice(5)) >= 1 && Number(x.slice(5)) <= 12));
    return r.chance(0.3) ? day(m, 1) : day(m, r.int(1, daysIn(m)));
  });
  if (r.chance(0.02)) days.push(r.pick(["2026-02-30", "", "2026-13-01", "x"]));
  const randomEntries = Array.from({ length: r.int(0, 5) }, () => genCash(r, r.pick(all.length ? all : [first]), "SGD", null));
  const extra = {
    numbers: Array.from({ length: 5 }, () => r.pick([money(r, 1e4), 0.005, -0.005, 1.005, 2.675, -123.455, 1e21, -0, 0.1 + 0.2, NaN, Infinity, 123.456789])),
    pads: Array.from({ length: 3 }, () => r.pick([r.int(0, 12), 99, 100, -1, "5", "", "123", 7.5])),
    monthLists: [all, [...new Set(months.filter((m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m)))].sort()],
    months,
    days,
    ranges: Array.from({ length: 4 }, () => [r.pick([...days, "2026-01-15"]), side(), side()]),
    qif: { entries: randomEntries, start: r.chance(0.5) ? { balance: money(r, 5000), date: r.pick(days) } : null, name: text(r),
      type: r.pick([[], ["Bank"], ["Invst"], ["Cash"]]) },
    accountRows: Array.from({ length: r.int(0, 3) }, () => ({ type: r.pick(["Investment", "Savings", "=x"]), name: text(r),
      balance: money(r, 9e4), currency: r.pick(CCYS), date: r.pick(days) })),
    tradeGroups: accounts.map((a) => ({ account: text(r), rows: a.trades })),
    cashGroups: accounts.map((a) => ({ account: text(r), rows: r.chance(0.5) ? a.cash : randomEntries })),
  };
  return { accounts, from, to, earliestMonth, withTrades, extra, stats: { ...stats, rangeKind } };
}

// ---------------------------------------------------------------- export: the calls

// Every shared function, as the statement apps call them (per account, then the Accounts and
// Combined files) and on direct inputs. Labels carry the account index ("#i").
function runExport(E, input) {
  const calls = [];
  const call = (label, fn) => {
    const o = outcome(fn);
    calls.push([label, o]);
    return o;
  };
  const { accounts, from, to, earliestMonth, withTrades, extra } = input;
  for (const x of extra.numbers) call("round2", () => E.round2(x));
  for (const x of extra.pads) call("pad", () => E.pad(x));
  for (const list of extra.monthLists) call("monthGaps", () => E.monthGaps(list));
  for (const m of extra.months) {
    call("prevMonth", () => E.prevMonth(m));
    call("lastDayOf", () => E.lastDayOf(m));
  }
  for (const d of extra.days) call("dayBefore", () => E.dayBefore(d));
  for (const [d, f, t] of extra.ranges) call("inRange", () => E.inRange(d, f, t));
  const rows = [];
  const tradeGroups = [];
  const cashGroups = [];
  accounts.forEach((a, i) => {
    const tag = `#${i}`;
    for (const c of a.cash) call(`inRange${tag}`, () => E.inRange(c.date, from, to));
    call(`tradesCsv${tag}`, () => E.tradesCsv(a.trades, from, to));
    call(`transactionsCsv${tag}`, () => E.transactionsCsv(a.cash, from, to));
    call(`valuationsCsv${tag}`, () => E.valuationsCsv(a.valuations, from, to, a.currency));
    const traded = call(`adjustedEntries${tag}`, () => E.adjustedEntries(a, from, to, earliestMonth, withTrades));
    call(`adjustedCsv${tag}`, () => E.adjustedCsv(a, from, to, earliestMonth, withTrades));
    const plain = call(`adjustedEntries.plain${tag}`, () => E.adjustedEntries(a, from, to, earliestMonth));
    const entries = "value" in plain ? plain.value.entries : [];
    const start = call(`openingBalance${tag}`, () => E.openingBalance(a, from, to, earliestMonth, entries));
    call(`qif${tag}`, () => E.qif(entries, "value" in start ? start.value : null, a.name));
    const held = call(`holdings${tag}`, () => [...a.trades, ...a.cash].filter((e) => E.inRange(e.date, from, to)));
    call(`openingBalance.holdings${tag}`, () => E.openingBalance(a, from, to, earliestMonth, held.value));
    call(`openingBalance.none${tag}`, () => E.openingBalance(a, from, to, earliestMonth));
    // The Accounts and Combined files, built the way the apps build them for this account's mode.
    call(`files${tag}`, () => {
      if (a.mode === "holdings") {
        tradeGroups.push({ account: a.name, rows: a.trades.filter((t) => E.inRange(t.date, from, to)) });
        cashGroups.push({ account: a.name, rows: a.cash.filter((c) => E.inRange(c.date, from, to)) });
      } else {
        cashGroups.push({ account: a.name, rows: a.mode === "tradelog" ? traded.value.entries : entries });
      }
      const s = E.openingBalance(a, from, to, earliestMonth, a.mode === "holdings" ? held.value : a.mode === "tradelog" ? traded.value.entries : entries);
      if (s) rows.push({ type: a.kind === "investment" ? "Investment" : "Savings", name: a.name, currency: a.currency, ...s });
      return s;
    });
  });
  call("accountsCsv", () => E.accountsCsv(rows));
  call("combinedTradesCsv", () => E.combinedTradesCsv(tradeGroups));
  call("combinedTransactionsCsv", () => E.combinedTransactionsCsv(cashGroups));
  call("accountsCsv.direct", () => E.accountsCsv(extra.accountRows));
  call("combinedTradesCsv.direct", () => E.combinedTradesCsv(extra.tradeGroups));
  call("combinedTransactionsCsv.direct", () => E.combinedTransactionsCsv(extra.cashGroups));
  call("qif.direct", () => E.qif(extra.qif.entries, extra.qif.start, extra.qif.name, ...extra.qif.type));
  return calls;
}

// Runs both implementations on their own copy of the case; returns both call logs and the
// copies afterwards (a writer that mutated its input would show there).
function runBoth(oldE, newE, input) {
  const a = structuredClone(input);
  const b = structuredClone(input);
  return { oldCalls: runExport(oldE, a), newCalls: runExport(newE, b), oldInput: a, newInput: b };
}

const counters = () => ({ adjustment: 0, gap: 0, trade: 0, convert: 0, unbalanced: 0, usd: 0, startNull: 0, start: 0, guarded: 0, quoted: 0,
  qifNotes: 0, threw: 0, accountThrew: 0, reversed: 0, gapped: 0, multiAccount: 0 });

function count(c, input, calls) {
  const has = (pred) => calls.some(([label, o]) => pred(label, o));
  const entriesOf = (label, o) => /^adjustedEntries/.test(label) && o.value ? o.value.entries : [];
  const problemsOf = (label, o) => /^adjustedEntries/.test(label) && o.value ? o.value.problems : [];
  const texts = calls.filter(([, o]) => typeof o.value === "string").map(([, o]) => o.value);
  if (has((l, o) => entriesOf(l, o).some((e) => e.kind === "adjustment"))) c.adjustment++;
  if (has((l, o) => entriesOf(l, o).some((e) => e.kind === "gap"))) c.gap++;
  if (has((l, o) => entriesOf(l, o).some((e) => e.kind === "trade"))) c.trade++;
  if (has((l, o) => problemsOf(l, o).some((p) => p.includes("cannot convert")))) c.convert++;
  if (has((l, o) => problemsOf(l, o).some((p) => p.includes("don't add up")))) c.unbalanced++;
  if (has((l, o) => entriesOf(l, o).some((e) => / \(USD -?[\d.]+ @ /.test(e.name)))) c.usd++;
  if (has((l, o) => /^openingBalance/.test(l) && o.value === null)) c.startNull++;
  if (has((l, o) => /^openingBalance/.test(l) && o.value && o.value.date)) c.start++;
  if (texts.some((t) => /(^|,|\n)"?'[=+\-@\t\r]/.test(t))) c.guarded++;
  if (texts.some((t) => /(^|,)"[^\n]*""/.test(t) || /,"[^"]*\n/.test(t))) c.quoted++;
  if (texts.some((t) => t.startsWith("!Type:") && /\nM/.test(t))) c.qifNotes++;
  if (has((l, o) => "threw" in o)) c.threw++;
  if (has((l, o) => /#/.test(l) && "threw" in o)) c.accountThrew++;
  if (input.stats.rangeKind === "reversed") c.reversed++;
  if (input.stats.gapped) c.gapped++;
  if (input.accounts.length > 1) c.multiAccount++;
}

// Lower bounds on what the 10 000 cases exercise (about half of what the seeds give), and an
// upper bound on cases cut short by a malformed value.
const COVERAGE = { adjustment: 2400, gap: 2000, trade: 1000, convert: 2800, unbalanced: 750, usd: 1400, startNull: 2900, start: 3600,
  guarded: 4900, quoted: 4800, qifNotes: 3800, threw: 150, reversed: 700, gapped: 4100, multiAccount: 3300 };

function assertCoverage(c) {
  const low = Object.entries(COVERAGE).filter(([k, n]) => !(c[k] >= n)).map(([k, n]) => `${k} ${c[k]} < ${n}`);
  assert.deepEqual(low, [], `generator coverage over ${CASES} cases: ${JSON.stringify(c)}`);
  assert.ok(c.accountThrew <= CASES * 0.05, `generator coverage: ${c.accountThrew} cases threw in an account's calls; most cases must run through`);
}

function exportComparison(what, oldE, newE, seedBase, { truthy }) {
  const c = counters();
  for (let i = 0; i < CASES; i++) {
    const seed = seedBase + i;
    const input = genExportCase(seed, { truthy });
    const { oldCalls, newCalls, oldInput, newInput } = runBoth(oldE, newE, input);
    assertSameCalls(what, seed, oldCalls, newCalls);
    if (!util.isDeepStrictEqual(oldInput, newInput)) assert.fail(`${what}, seed ${seed}: the two implementations left their inputs different`);
    count(c, input, newCalls);
  }
  assertCoverage(c);
}

// ---------------------------------------------------------------- export tests

test("export layers A, B and C share the 17 functions; core adds csvCell and csv", () => {
  for (const m of ["export-A.js", "export-B.js", "export-C.js"]) assert.deepEqual(Object.keys(legacy(m)), SHARED, m);
  assert.deepEqual(Object.keys(core("export.js")), [...SHARED, "csvCell", "csv"]);
});

test("export: core equals export C on every input (10 000 seeds)", () => {
  exportComparison("core vs export C", legacy("export-C.js"), core("export.js"), 0x10000000, { truthy: true });
});

test("export: core equals export B on every input (10 000 seeds)", () => {
  exportComparison("core vs export B", legacy("export-B.js"), core("export.js"), 0x20000000, { truthy: true });
});

test("export: core equals export A on months without a truthy partial or startDate (10 000 seeds)", () => {
  exportComparison("core vs export A", legacy("export-A.js"), core("export.js"), 0x30000000, { truthy: false });
});

// With truthy partial/startDate, A may differ from C only through the two changes that make C a
// superset: the gap row of a partial month on a bank account (adjustedEntries, and what is built
// from its entries), and the opening date taken from the first month's startDate (openingBalance,
// and what is built from it).
function allowedDifference(label, input) {
  const [, fn, idx] = /^(.*?)(?:#(\d+))?$/.exec(label);
  const months = (a) => Object.values(a.months);
  const bankPartial = (a) => a.kind === "bank" && months(a).some((m) => m.partial);
  const startDate = (a) => months(a).some((m) => m.startDate);
  const a = idx === undefined ? null : input.accounts[Number(idx)];
  const any = (p) => input.accounts.some(p);
  switch (fn) {
    case "adjustedEntries": case "adjustedEntries.plain": case "adjustedCsv": return bankPartial(a);
    case "openingBalance": case "qif": case "files": return bankPartial(a) || startDate(a);
    case "openingBalance.holdings": case "openingBalance.none": return startDate(a);
    case "accountsCsv": return any(bankPartial) || any(startDate);
    case "combinedTransactionsCsv": return any(bankPartial);
    default: return false;
  }
}

test("export: A differs from core only on a partial bank month or a startDate (10 000 seeds)", () => {
  const A = legacy("export-A.js");
  const C = core("export.js");
  let partialCases = 0;
  let startCases = 0;
  for (let i = 0; i < CASES; i++) {
    const seed = 0x40000000 + i;
    const input = genExportCase(seed, { truthy: true });
    const { oldCalls, newCalls } = runBoth(A, C, input);
    assert.equal(oldCalls.length, newCalls.length, `seed ${seed}: different call counts`);
    let partial = false;
    let start = false;
    oldCalls.forEach((call, k) => {
      if (util.isDeepStrictEqual(call, newCalls[k])) return;
      const label = call[0];
      if (!allowedDifference(label, input)) assert.fail(`core vs export A, seed ${seed}: call ${k} (${label}) differs without a partial bank month or startDate\n  A: ${show(call)}\n  C: ${show(newCalls[k])}`);
      if (/^adjustedEntries/.test(label)) partial = true;
      if (/^openingBalance\.none/.test(label)) start = true;
    });
    partialCases += partial;
    startCases += start;
  }
  // The two branches really fire, so the run above proves something.
  assert.ok(partialCases >= 350, `partial bank months changed adjustedEntries in ${partialCases} cases`);
  assert.ok(startCases >= 1200, `startDate changed openingBalance in ${startCases} cases`);
});

// ---------------------------------------------------------------- layout

const FRAGMENTS = ["Date", "Description", "Amount", "Balance", "01 Jan 2026", "1,234.56", "-12.00", "CR", "Opening balance", "Fund",
  "Units", "@", "é", "日本", "  padded  ", " ", "", "\u0000", "a\u0001b", "\u007f", "\tTab", "x"];

function fragText(r) {
  const t = r.next();
  if (t < 0.03) return r.pick([undefined, null]);
  if (t < 0.8) return r.pick(FRAGMENTS);
  return `${r.pick(FRAGMENTS)}${r.pick(FRAGMENTS)}`;
}

// A pdf.js-like item cloud: runs of fragments on text lines (with jitter around the line
// grouping threshold, and gaps around the merge and space thresholds) plus stray items.
function genCloud(r, nearDuplicates) {
  const items = [];
  const baseH = r.pick([6, 8, 9, 10, 12]);
  for (let li = r.int(0, 14); li > 0; li--) {
    const y = Math.round(r.next() * 8000) / 10;
    let x = Math.round(r.next() * 800) / 10;
    const h = r.chance(0.1) ? r.pick([0, -1, 0.5, 1]) : baseH + (r.chance(0.3) ? (r.next() - 0.5) * 4 : 0);
    const unit = Math.max(Math.abs(h), 1);
    for (let k = r.int(1, 6); k > 0; k--) {
      const str = fragText(r);
      const w = r.chance(0.05) ? 0 : Math.max(0.5, String(str || "x").length * unit * (0.3 + r.next() * 0.4));
      const dy = r.chance(0.3) ? (r.next() - 0.5) * unit * 1.2 : 0;
      items.push({ str, x, y: y + dy, w, h });
      x += w + r.pick([0, 0.05, 0.149, 0.151, 0.3, 0.599, 0.601, 1, 2.5, r.next() * 4]) * unit;
    }
  }
  for (let k = r.int(0, 5); k > 0; k--) items.push({ str: fragText(r), x: r.next() * 600, y: r.next() * 800, w: r.next() * 100, h: r.next() * 14 });
  if (nearDuplicates && items.length) {
    for (let k = r.int(1, Math.max(1, Math.ceil(items.length / 2))); k > 0; k--) {
      const src = r.pick(items);
      const t = r.next();
      let dx;
      let dy;
      let str = src.str;
      if (t < 0.6) {
        dx = (r.next() * 2 - 1) * 0.99; // a near-duplicate ("fake bold")
        dy = (r.next() * 2 - 1) * 0.49;
      } else if (t < 0.75) {
        dx = r.pick([1, -1, 0.999, -0.999, 0]); // on the thresholds
        dy = r.pick([0, 0.5, -0.5, 0.499]);
      } else if (t < 0.9) {
        dx = (r.next() * 2 - 1) * 0.5; // the same text once cleaned up
        dy = 0;
        str = ` ${src.str || ""}\u0001 `;
      } else {
        dx = 0; // other text at the same place
        dy = 0;
        str = `${src.str || ""}x`;
      }
      items.splice(r.int(0, items.length), 0, { str, x: src.x + dx, y: src.y + dy, w: src.w, h: src.h });
    }
  }
  if (r.chance(0.5)) r.shuffle(items);
  return items;
}

// Drops every item L3 would drop as a near-duplicate of an earlier one (its own rule).
function withoutNearDuplicates(items) {
  const clean = (it) => (it.str || "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const kept = [];
  return items.filter((it) => {
    const s = clean(it);
    if (s && kept.some((k) => k.s === s && Math.abs(k.x - it.x) < 1 && Math.abs(k.y - it.y) < 0.5)) return false;
    if (s) kept.push({ s, x: it.x, y: it.y });
    return true;
  });
}

function runLayout(L, items, args) {
  const calls = [];
  const lines = outcome(() => L.pageLines(items));
  calls.push(["pageLines", lines]);
  const n = lines.value ? lines.value.length : 0;
  for (const [start, end, gap] of args) calls.push(["tableRows", outcome(() => L.tableRows(lines.value || [], Math.min(start, n), Math.min(end, n), ...gap))]);
  return calls;
}

function tableArgs(r) {
  return Array.from({ length: 3 }, () => {
    const a = r.int(0, 15);
    return [a, a + r.int(0, 15), r.pick([[], [1.9], [0.5], [3]])];
  });
}

test("layout: core equals L3 on item clouds with near-duplicates (10 000 seeds)", () => {
  const L3 = legacy("layout-L3.js");
  const L1 = legacy("layout-L1.js");
  const C = core("layout.js");
  let deduplicated = 0;
  let lines = 0;
  for (let i = 0; i < CASES; i++) {
    const seed = 0x50000000 + i;
    const r = rand(seed);
    const items = genCloud(r, true);
    const args = tableArgs(r);
    const before = structuredClone(items);
    const old = runLayout(L3, structuredClone(items), args);
    const now = runLayout(C, items, args);
    assertSameCalls("core vs layout L3", seed, old, now);
    assert.deepStrictEqual(items, before, `seed ${seed}: pageLines changed its input`);
    if (!util.isDeepStrictEqual(runLayout(L1, structuredClone(items), args)[0], old[0])) deduplicated++;
    if (old[0][1].value && old[0][1].value.length > 1) lines++;
  }
  assert.ok(deduplicated >= 4500, `the de-duplication changed the lines in ${deduplicated} cases`);
  assert.ok(lines >= 4800, `clouds with more than one line: ${lines}`);
});

test("layout: L1 equals L3 where no near-duplicate exists (10 000 seeds)", () => {
  const L3 = legacy("layout-L3.js");
  const L1 = legacy("layout-L1.js");
  let merged = 0;
  for (let i = 0; i < CASES; i++) {
    const seed = 0x60000000 + i;
    const r = rand(seed);
    const items = withoutNearDuplicates(genCloud(r, r.chance(0.5)));
    const args = tableArgs(r);
    const l3 = runLayout(L3, structuredClone(items), args);
    assertSameCalls("layout L1 vs L3", seed, l3, runLayout(L1, structuredClone(items), args));
    assertSameCalls("core vs layout L1", seed, l3, runLayout(core("layout.js"), structuredClone(items), args));
    if (l3[0][1].value && l3[0][1].value.some((l) => l.items.length > 1 && /\S  \S/.test(l.text))) merged++;
  }
  assert.ok(merged >= 4400, `clouds with multi-cell lines: ${merged}`);
});

// ---------------------------------------------------------------- zip

const NAME_PARTS = ["Accounts", "all accounts", "transactions", "trades", "valuations", " - ", "2026-01", "_to_", "é", "–", "日本", "💰",
  "a/b", " ", "'", "\"", ",", ".csv", ".qif"];

function genFiles(r) {
  const files = [];
  for (let n = r.pick([0, 1, 1, 2, 3, 4, 6, 9]); n > 0; n--) {
    let name = "";
    for (let k = r.int(1, 6); k > 0; k--) name += r.pick(NAME_PARTS);
    let body = "";
    if (!r.chance(0.1)) {
      for (let k = r.int(1, 40); k > 0; k--) body += `${r.pick(["date,amount", "2026-01-31,-12.50", "\"a, b\",1", "é–日本💰", "!Type:Bank", "^", ""])}\n`;
      if (r.chance(0.1)) body = body.repeat(r.int(2, 60));
    }
    const f = { name, text: body };
    if (r.chance(0.3)) Object.assign(f, { kind: "transactions", label: "Transactions CSV", count: r.int(0, 9) }); // ignored fields
    files.push(f);
  }
  return files;
}

function genDate(r) {
  const t = r.next();
  if (t < 0.8) return new Date(Date.UTC(r.int(1980, 2107), r.int(0, 11), r.int(1, 28), r.int(0, 23), r.int(0, 59), r.int(0, 59), r.int(0, 999)));
  if (t < 0.9) return r.pick([new Date(1980, 0, 1, 0, 0, 0), new Date(2107, 11, 31, 23, 59, 59), new Date(2026, 0, 2, 3, 4, 6), new Date(2026, 0, 2, 3, 4, 7)]);
  return new Date(Date.UTC(r.pick([r.int(1970, 1979), r.int(2108, 2200)]), r.int(0, 11), r.int(1, 28), r.int(0, 23), r.int(0, 59), r.int(0, 59)));
}

// Zones with whole, half-hour and 45-minute offsets, both hemispheres' daylight saving, and the
// golden environments' zones: the DOS fields come from the local getters, so the local date and
// time must differ from UTC for a wrong getter to show.
const ZONES = ["UTC", "Asia/Singapore", "America/Los_Angeles", "Europe/London", "Pacific/Chatham", "America/St_Johns", "Australia/Lord_Howe",
  "Asia/Kathmandu", "Pacific/Kiritimati", "Pacific/Pago_Pago"];

test("zip: zipParts equals the old writer byte for byte (10 000 seeds)", async () => {
  const Z = core("zip.js");
  const old = legacy("zip-old.js");
  const savedTz = process.env.TZ;
  let entries = 0;
  let localDiffers = 0;
  try {
    for (let i = 0; i < CASES; i++) {
      const seed = 0x70000000 + i;
      const r = rand(seed);
      process.env.TZ = r.pick(ZONES); // both writers run in the same zone
      const files = genFiles(r);
      const now = genDate(r);
      const before = structuredClone(files);
      const blob = old.zip(structuredClone(files), new Date(now.getTime()));
      assert.equal(blob.type, "application/zip");
      const expected = Buffer.from(await blob.arrayBuffer());
      const actual = Buffer.from(await new Blob(Z.zipParts(files, now)).arrayBuffer());
      if (!expected.equals(actual)) assert.fail(`core zipParts vs the old writer, seed ${seed} (${process.env.TZ}): the bytes differ (${expected.length} and ${actual.length} bytes)`);
      assert.deepStrictEqual(files, before, `seed ${seed}: zipParts changed its input`);
      const enc = new TextEncoder();
      for (const f of files) {
        const data = enc.encode(f.text);
        assert.equal(Z.crc32(data), old.crc32(data), `seed ${seed}: crc32 differs`);
      }
      const noise = Uint8Array.from({ length: r.int(0, 64) }, () => r.int(0, 255));
      assert.equal(Z.crc32(noise), old.crc32(noise), `seed ${seed}: crc32 differs on random bytes`);
      entries += files.length;
      if (now.getDate() !== now.getUTCDate() || now.getMonth() !== now.getUTCMonth()) localDiffers++;
    }
  } finally {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  }
  assert.ok(entries >= 16000, `zip entries written: ${entries}`);
  assert.ok(localDiffers >= 1500, `cases whose local date differs from the UTC date: ${localDiffers}`);
});

// ---------------------------------------------------------------- storage

class FakeStorage {
  constructor(entries, behaviour, log) {
    this.map = new Map(entries);
    this.behaviour = behaviour;
    this.log = log;
  }
  getItem(k) {
    this.log.push(["get", String(k)]);
    if (this.behaviour === "get-throws") throw new Error("SecurityError: storage is disabled");
    return this.map.has(String(k)) ? this.map.get(String(k)) : null;
  }
  setItem(k, v) {
    this.log.push(["set", String(k), String(v)]);
    if (this.behaviour === "set-throws") throw new Error("QuotaExceededError: quota exceeded");
    this.map.set(String(k), String(v));
  }
}

// Every property read throws, like a page whose localStorage getter throws.
const THROWING = new Proxy({}, { get() { throw new Error("SecurityError: access denied"); } });

// Runs fn with globalThis.localStorage set up for the behaviour (core/storage.js reads the
// global, as the page does), then removes it again.
function withGlobalStorage(behaviour, store, fn) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  if (behaviour === "missing") delete globalThis.localStorage;
  else {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        if (behaviour === "access-throws") throw new Error("SecurityError: access denied");
        return behaviour === "absent" ? undefined : store;
      },
    });
  }
  try {
    return fn();
  } finally {
    if (saved) Object.defineProperty(globalThis, "localStorage", saved);
    else delete globalThis.localStorage;
  }
}

const STORED = ["tradelog", "holdings", "balance", "month", "day", "null", "[]", "5", "\"x\"", "{not json", "", "{}", "0", "false", "true",
  " tradelog", "Tradelog", "HOLDINGS", "day ", "__proto__", "constructor", "toString", "undefined", "NaN", "{\"p0\":{\"name\":\"x\"}}",
  "{\"a:USD\":{\"kind\":\"cash\",\"exclude\":true}}", "[1,2]", "\"tradelog\"", "1e400", "{\"__proto__\":{\"x\":1}}", "{\"a\":{\"mergeInto\":\"b\"}}"];
const BEHAVIOURS = ["ok", "ok", "ok", "ok", "get-throws", "set-throws", "access-throws", "absent", "missing"];

function junk(r) {
  let s = "";
  for (let k = r.int(0, 12); k > 0; k--) s += r.pick(["{", "}", "\"", ":", ",", "[", "]", "a", "1", " ", "\\", "é", "null", "mode"]);
  return s;
}

function configValue(r) {
  const t = r.next();
  if (t < 0.5) {
    const cfg = {};
    for (let k = r.int(0, 4); k > 0; k--) {
      cfg[`${junk(r)}:${r.pick(CCYS)}`] = r.pick([{ name: text(r) }, { kind: r.pick(["", "investment", "cash"]) }, { exclude: true }, { mergeInto: junk(r) }, {}]);
    }
    return cfg;
  }
  if (t < 0.6) {
    const circular = { a: 1 };
    circular.self = circular;
    return circular;
  }
  if (t < 0.65) return { n: 10n };
  if (t < 0.7) return { toJSON: () => ({ replaced: true }) };
  return r.pick([{}, [], "str", 5, null, undefined, { nested: { deep: [1, { x: "y" }] } }]);
}

test("storage: core equals the old storage functions for every migrated provider (10 000 seeds)", () => {
  const S = core("storage.js");
  const old = legacy("storage-old.js");
  const frozens = frozenProviders({ root: REPO }).map((p) => p.frozen).filter((f) => f.legacyRepo);
  assert.ok(frozens.length >= 1, "no migrated provider (frozen.js with legacyRepo) found");
  const seen = new Map();
  for (let i = 0; i < CASES; i++) {
    const seed = 0x80000000 + i;
    const r = rand(seed);
    const f = r.pick(frozens);
    const { modeKey, configKey } = f.storage;
    const statementApp = "kindModel" in f;
    assert.ok(statementApp || configKey === null, `${modeKey}: a migrated custom app with a configurator has no old storage code to compare with`);
    const behaviour = r.pick(BEHAVIOURS);
    const initial = [];
    if (!r.chance(0.15)) initial.push([modeKey, r.chance(0.8) ? r.pick([...STORED, ...f.modeValues]) : junk(r)]);
    if (configKey && !r.chance(0.15)) initial.push([configKey, r.chance(0.8) ? r.pick(STORED) : junk(r)]);
    if (r.chance(0.3)) initial.push(["unrelated-key", "x"]);
    const ops = Array.from({ length: r.int(1, 6) }, () => {
      const kinds = configKey ? ["loadMode", "saveMode", "loadConfig", "saveConfig"] : ["loadMode", "saveMode", "loadConfig"];
      const op = r.pick(kinds);
      if (op === "saveMode") return [op, r.chance(0.8) ? r.pick(f.modeValues) : r.pick([junk(r), "", undefined, null, 5])];
      if (op === "saveConfig") return [op, configValue(r)];
      return [op];
    });
    const oldLog = [];
    const oldStore = new FakeStorage(initial, behaviour, oldLog);
    const ls = behaviour === "access-throws" ? THROWING : behaviour === "absent" || behaviour === "missing" ? undefined : oldStore;
    const o = statementApp ? old.statementApp(modeKey, configKey, ls) : old.customApp(modeKey, ls);
    const oldResults = ops.map(([op, arg]) => {
      if (op === "loadMode") return outcome(() => o.loadMode());
      if (op === "saveMode") return outcome(() => o.setMode(arg));
      if (op === "loadConfig") return outcome(() => (configKey ? o.loadConfig() : {})); // no configurator: the page never read one
      o.state.config = arg;
      return outcome(() => o.saveConfig());
    });
    const newLog = [];
    const newStore = new FakeStorage(initial, behaviour, newLog);
    const newResults = withGlobalStorage(behaviour, newStore, () => ops.map(([op, arg]) => {
      if (op === "loadMode") return outcome(() => S.loadMode(modeKey, f.modeValues));
      if (op === "saveMode") return outcome(() => S.saveMode(modeKey, arg));
      if (op === "loadConfig") return outcome(() => S.loadConfig(configKey));
      return outcome(() => S.saveConfig(configKey, arg));
    }));
    const where = `core vs old storage, seed ${seed} (${behaviour}, ${ops.map((x) => x[0]).join(" ")})`;
    assert.deepStrictEqual(newResults, oldResults, `${where}: results differ`);
    assert.deepStrictEqual(newLog, oldLog, `${where}: storage calls differ`);
    assert.deepStrictEqual([...newStore.map], [...oldStore.map], `${where}: stored values differ`);
    seen.set(modeKey, (seen.get(modeKey) || 0) + 1);
  }
  assert.equal(seen.size, frozens.length, "every migrated provider's keys were compared");
  assert.equal(globalThis.localStorage, undefined, "the global localStorage stub was removed");
});

test("storage: without a config key nothing is read or written, even from throwing storage", () => {
  const S = core("storage.js");
  for (const behaviour of BEHAVIOURS) {
    const log = [];
    const store = new FakeStorage([["null", "{\"a\":1}"], ["undefined", "{\"b\":2}"]], behaviour, log);
    withGlobalStorage(behaviour, store, () => {
      for (const key of [null, undefined]) {
        assert.deepEqual(S.loadConfig(key), {});
        assert.equal(S.saveConfig(key, { a: 1 }), undefined);
      }
    });
    assert.deepEqual(log, [], behaviour);
    assert.deepEqual([...store.map.keys()], ["null", "undefined"], behaviour);
  }
});
