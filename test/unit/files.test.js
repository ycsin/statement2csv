// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// core/files.js (docs/TESTING.md, unit tests). A synthetic multi-account result (investment,
// cash-like, bank and an unknown kind; trades; a missing month; a balancing entry; an account
// with month-end values but no files; an integer-like name; markup, quotes, commas and a
// leading "=" in names) checked for: exact file names for several naming combinations; span
// for one month and for a range; zip names always <from>_to_<to>; the Accounts type mapping;
// the Combined trades file put first; both kind models. Download all: allFiles() has unique
// names, exactly one Accounts entry (first), and equals [accountsFile(), the card buttons'
// files]. downloads(): the click order, card visibility, the Combined one-file vs zip rule,
// the toolbar disabled exactly when there is no card, and [] without a result.
//
// With the old repositories present, every statement app's own old app.js runs in a vm
// sandbox with a stub DOM, fed the same result through its own parser module: every download
// its page offers, Download all's scan of the rendered card buttons included, must equal
// downloads() for every mode and range, with the frozen naming and kind model. No provider is
// named: everything comes from frozen.js. Synthetic data only.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const StatementFiles = require("../../core/files.js");
const E = require("../../core/export.js");
const unzip = require("../lib/unzip.js");
const baseline = require("../lib/baseline.js");
const { frozenProviders, loadNode } = require("../lib/load-provider.js");

const REPO = path.resolve(__dirname, "..", "..");
const oldRoot = process.env.S2C_OLD_ROOT || os.homedir();
const MODES = ["balance", "tradelog", "holdings"];
const KIND_MODELS = ["standard", "investment-cash"];

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

// ---------------------------------------------------------------- the synthetic results

const FUND = '=Fund, "B" & <C>';
const CASH = "Cash 'pocket' Ö";
const BANK = "Bank";
const IDLE = "Idle";
const LATE = "2024"; // integer-like: Object.keys lists it before every other name

const month = (m, opening, closing, fx = null, extra = {}) => ({ monthEnd: E.lastDayOf(m), opening, closing, fx, ...extra });
const valuationsOf = (months) => Object.keys(months).sort().map((k) => [months[k].monthEnd, months[k].closing]);
const account = (kind, currency, months, cash = [], trades = [], extra = {}) => ({ kind, currency, months, valuations: valuationsOf(months), trades, cash, ...extra });

// plain: no partial month and no startDate (the export variants agree on such data).
function resultA({ plain = false } = {}) {
  const accounts = {};
  accounts[FUND] = account("investment", "SGD",
    { "2026-01": month("2026-01", 0, 1000.5, 1.35), "2026-02": month("2026-02", 1000.5, 1100, 1.34), "2026-04": month("2026-04", 1150, 1200, 1.33) },
    [
      { date: "2026-01-05", amount: -1000, currency: "SGD", name: 'Deposit, "first"', notes: "=via transfer", kind: "deposit" },
      { date: "2026-02-10", amount: 5, currency: "USD", name: "Fee", kind: "fee" },
      { date: "2026-02-15", amount: -20, currency: "SGD", name: "Balancing deposit", kind: "deposit", balancing: true },
      { date: "2026-04-02", amount: -30, currency: "SGD", name: "Deposit\nsecond line", kind: "deposit" },
      { date: "2026-04-03", amount: 1, currency: "EUR", name: "Cannot convert", kind: "fee" },
    ],
    [
      { date: "2026-01-06", ticker: "FUND A", qty: 10.5, price: 95.238095, currency: "SGD", name: "Buy FUND A" },
      { date: "2026-01-20", ticker: "B,C", qty: 0.25, price: 120, currency: "SGD", name: '=Buy "B,C"' },
      { date: "2026-02-11", ticker: "FUND A", qty: -1, price: 100, currency: "SGD", name: "Sell FUND A" },
    ]);
  accounts[CASH] = account("cash", "SGD",
    { "2026-01": month("2026-01", 500, 501.25), "2026-02": month("2026-02", 501.25, 502.5), "2026-04": month("2026-04", 502.5, 503) },
    [{ date: "2026-02-01", amount: -0.5, currency: "SGD", name: "Interest", kind: "interest" }],
    [{ date: "2026-02-03", ticker: "MMF", qty: 1, price: 1, currency: "SGD", name: "Switch into MMF" }]);
  accounts[BANK] = account("bank", "SGD",
    { "2026-01": month("2026-01", 200, 250, null, plain ? {} : { startDate: "2026-01-10" }), "2026-02": month("2026-02", 250, plain ? 255 : 260, null, plain ? {} : { partial: true }),
      "2026-04": month("2026-04", plain ? 255 : 260, 240) },
    [{ date: "2026-01-10", amount: -50, currency: "SGD", name: "Salary", kind: "bank" }, { date: "2026-02-05", amount: -5, currency: "SGD", name: "Refund", kind: "bank" },
     { date: "2026-04-07", amount: 15, currency: "SGD", name: "Card", kind: "bank" }],
    [], { downloadOnly: true });
  accounts[IDLE] = account("cash", "SGD", { "2026-01": month("2026-01", 25.5, 25.5), "2026-02": month("2026-02", 25.5, 25.5), "2026-04": month("2026-04", 25.5, 25.5) });
  accounts[LATE] = account("other", "USD", { "2026-02": month("2026-02", 300, 310), "2026-04": month("2026-04", 310, 305) },
    [{ date: "2026-02-14", amount: -10, currency: "USD", name: "Dividend", kind: "dividend" }]);
  return finish(accounts, ["2026-01", "2026-02", "2026-04"], {
    firstOpenings: [{ account: CASH, month: "2026-01", opening: 500 }, { account: BANK, month: "2026-01", opening: 200 }],
    skippedRows: [{ date: "2026-02-02", category: "unknown", detail: "Mystery row", account: FUND, portfolio: "p1:SGD" }],
    reconciled: [{ month: "2026-02", account: FUND, diff: 1.5 }],
    warnings: ["2026-02: a synthetic warning"],
  });
}

// One account with January only, and two loaded months: February shows no card.
function resultSparse() {
  const accounts = { "Only Jan": account("cash", "SGD", { "2026-01": month("2026-01", 10, 10.5) }) };
  return finish(accounts, ["2026-01", "2026-02"]);
}

// Every account excluded.
const resultEmpty = () => finish({}, ["2026-01"]);

// Every field any old statement app reads, so their pages render it.
function finish(accounts, months, extra = {}) {
  const portfolios = Object.keys(accounts).map((name, i) => {
    const keys = Object.keys(accounts[name].months).sort();
    return { id: `p${i}:${accounts[name].currency}`, label: name, names: [name], firstMonth: keys[0], lastMonth: keys[keys.length - 1], kind: accounts[name].kind, currency: accounts[name].currency };
  });
  return {
    accounts, months: months.map((m) => ({ month: m, id: `statement-${m}.pdf` })), portfolios,
    statements: months.length, downloads: 1, errors: [], warnings: [], unmapped: {}, gaps: E.monthGaps(months), partialMonths: [],
    firstOpenings: [], skippedRows: [], late: [], closed: [], reconciled: [], baseCurrency: "SGD", ...extra,
  };
}

const RESULTS = { A: resultA(), "A-plain": resultA({ plain: true }), sparse: resultSparse(), empty: resultEmpty() };
for (const r of Object.values(RESULTS)) deepFreeze(r);

// The ranges the page's selects can show for a result (from, to as selected; reversed included).
function rangesOf(result) {
  const ms = result.months.map((m) => m.month);
  const out = [[ms[0], ms[ms.length - 1]], [ms[ms.length - 1], ms[0]]];
  for (const m of ms) out.push([m, m]);
  if (ms.length > 2) out.push([ms[0], ms[1]], [ms[1], ms[ms.length - 1]]);
  return out;
}
const swapped = ([from, to]) => (from && to && from > to ? [to, from] : [from, to]);

const NAMINGS = [
  { accountPrefix: "", brand: "Example", groupNoun: "accounts", slug: "example" },
  { accountPrefix: "Ex ", brand: "Ex Bank", groupNoun: "pockets", slug: "ex-bank" },
];

function makeF({ result = RESULTS.A, mode = "balance", range = ["2026-01", "2026-04"], naming = NAMINGS[0], kindModel = "standard", P = E } = {}) {
  const [from, to] = swapped(range);
  return StatementFiles.create({ P, result: () => result, mode: () => mode, range: () => ({ from, to }), naming, kindModel });
}

// ---------------------------------------------------------------- create

test("create checks its context", () => {
  const ok = { P: E, result: () => null, mode: () => "balance", range: () => ({ from: "", to: "" }), naming: NAMINGS[0], kindModel: "standard" };
  assert.ok(StatementFiles.create(ok));
  for (const [what, bad] of [
    ["no context", undefined],
    ["result not a function", { ...ok, result: null }],
    ["no P", { ...ok, P: undefined }],
    ["a naming key missing", { ...ok, naming: { accountPrefix: "", brand: "B", slug: "s" } }],
    ["a naming value not a string", { ...ok, naming: { ...NAMINGS[0], slug: 5 } }],
    ["an unknown kind model", { ...ok, kindModel: "bank" }],
    ["no kind model", { ...ok, kindModel: undefined }],
  ]) assert.throws(() => StatementFiles.create(bad), TypeError, what);
  assert.deepEqual(Object.keys(StatementFiles.create(ok)), ["modeOf", "earliest", "span", "exportsFor", "fileFor", "accountsFile", "combinedFiles", "zipName", "cards", "allFiles", "downloads"]);
});

// ---------------------------------------------------------------- modeOf, earliest, span, zipName

test("modeOf: standard forces every non-investment account to balance; investment-cash only cash-like ones", () => {
  const modes = (kindModel, mode) => Object.fromEntries(Object.keys(RESULTS.A.accounts).map((n) => [n, makeF({ kindModel, mode }).modeOf(n)]));
  assert.deepEqual(modes("standard", "holdings"), { [LATE]: "balance", [FUND]: "holdings", [CASH]: "balance", [BANK]: "balance", [IDLE]: "balance" });
  assert.deepEqual(modes("investment-cash", "holdings"), { [LATE]: "holdings", [FUND]: "holdings", [CASH]: "balance", [BANK]: "holdings", [IDLE]: "balance" });
  assert.deepEqual(modes("investment-cash", "tradelog"), { [LATE]: "tradelog", [FUND]: "tradelog", [CASH]: "balance", [BANK]: "tradelog", [IDLE]: "balance" });
  for (const km of KIND_MODELS) assert.ok(Object.values(modes(km, "balance")).every((m) => m === "balance"));
});

test("earliest, span and zipName: one month collapses the span, never the zip names", () => {
  const full = makeF({ range: ["2026-01", "2026-04"] });
  assert.equal(full.earliest(), "2026-01");
  assert.equal(full.span(), "2026-01_to_2026-04");
  assert.equal(full.zipName("csv"), "example-csv-2026-01_to_2026-04.zip");
  const one = makeF({ range: ["2026-02", "2026-02"], naming: NAMINGS[1] });
  assert.equal(one.span(), "2026-02");
  assert.equal(one.zipName("csv"), "ex-bank-csv-2026-02_to_2026-02.zip");
  assert.equal(one.zipName("combined"), "ex-bank-combined-2026-02_to_2026-02.zip");
  assert.throws(() => one.zipName("all"), TypeError);
  assert.equal(makeF({ result: { ...RESULTS.A, months: [] } }).earliest(), null);
  assert.equal(StatementFiles.create({ P: E, result: () => null, mode: () => "balance", range: () => ({}), naming: NAMINGS[0], kindModel: "standard" }).earliest(), null);
});

// ---------------------------------------------------------------- what each account exports

test("exportsFor keeps the old fields: entries and adjustments, or the holdings files and balancing", () => {
  const balance = makeF().exportsFor(FUND);
  assert.deepEqual(balance, {
    vals: [["2026-01-31", 1000.5], ["2026-02-28", 1100], ["2026-04-30", 1200]],
    problems: ['2026-04: cannot convert EUR entry "Cannot convert"'],
    adjustments: 3, tradeLines: 0,
    files: [{ kind: "transactions", label: "Transactions CSV", count: 8 }, { kind: "qif", label: "QIF", count: 8 }],
  });
  const tradelog = makeF({ mode: "tradelog" }).exportsFor(FUND);
  assert.deepEqual([tradelog.tradeLines, tradelog.files.map((f) => f.count)], [3, [8, 8]]);
  assert.deepEqual(makeF({ mode: "holdings" }).exportsFor(FUND), {
    vals: balance.vals, problems: [],
    files: [{ kind: "trades", label: "Trades CSV", count: 3 }, { kind: "transactions", label: "Transactions CSV", count: 5 }, { kind: "valuations", label: "Month-end balances CSV", count: 3 }],
    balancing: 1,
  });
  assert.deepEqual(makeF().exportsFor(IDLE).files, [], "no entry anywhere, but month-end values");
  assert.deepEqual(makeF().exportsFor(BANK).problems, ["2026-04: entries don't add up to the statement balance (off by -5.00)"]);
});

// ---------------------------------------------------------------- names

const NAMES_BALANCE_FULL = (p, brand, noun, slug) => [
  ["card", LATE, "transactions", `${p}2024 - transactions - 2026-01_to_2026-04.csv`],
  ["card", LATE, "qif", `${p}2024 - 2026-01_to_2026-04.qif`],
  ["card", FUND, "transactions", `${p}${FUND} - transactions - 2026-01_to_2026-04.csv`],
  ["card", FUND, "qif", `${p}${FUND} - 2026-01_to_2026-04.qif`],
  ["card", CASH, "transactions", `${p}${CASH} - transactions - 2026-01_to_2026-04.csv`],
  ["card", CASH, "qif", `${p}${CASH} - 2026-01_to_2026-04.qif`],
  ["card", BANK, "transactions", `${p}Bank - transactions - 2026-01_to_2026-04.csv`],
  ["card", BANK, "qif", `${p}Bank - 2026-01_to_2026-04.qif`],
  ["accounts", null, null, `${brand} accounts - 2026-01_to_2026-04.csv`],
  ["combined", null, null, `${brand} all ${noun} - transactions - 2026-01_to_2026-04.csv`],
  ["zip", null, null, `${slug}-csv-2026-01_to_2026-04.zip`],
];

const summary = (list) => list.map((d) => [d.trigger, d.account, d.kind, d.name]);

test("exact names, balance mode, full range, for each naming combination", () => {
  for (const n of [...NAMINGS, { accountPrefix: "Ex ", brand: "Example", groupNoun: "accounts", slug: "x" }, { accountPrefix: "", brand: "B", groupNoun: "portfolios", slug: "b-2" }]) {
    for (const km of KIND_MODELS) {
      const list = makeF({ naming: n, kindModel: km }).downloads();
      assert.deepEqual(summary(list), NAMES_BALANCE_FULL(n.accountPrefix, n.brand, n.groupNoun, n.slug), JSON.stringify(n));
      assert.deepEqual(list.map((d) => d.type), [...Array(10).fill("text/csv"), "application/zip"]);
    }
  }
});

test("exact names, holdings mode: the trades file first in a Combined zip, accountPrefix in every account name", () => {
  const n = NAMINGS[1];
  const F = makeF({ mode: "holdings", naming: n });
  const list = F.downloads();
  assert.deepEqual(summary(list), [
    ["card", LATE, "transactions", "Ex 2024 - transactions - 2026-01_to_2026-04.csv"],
    ["card", LATE, "qif", "Ex 2024 - 2026-01_to_2026-04.qif"],
    ["card", FUND, "trades", `Ex ${FUND} - trades - 2026-01_to_2026-04.csv`],
    ["card", FUND, "transactions", `Ex ${FUND} - transactions - 2026-01_to_2026-04.csv`],
    ["card", FUND, "valuations", `Ex ${FUND} - valuations - 2026-01_to_2026-04.csv`],
    ["card", CASH, "transactions", `Ex ${CASH} - transactions - 2026-01_to_2026-04.csv`],
    ["card", CASH, "qif", `Ex ${CASH} - 2026-01_to_2026-04.qif`],
    ["card", BANK, "transactions", "Ex Bank - transactions - 2026-01_to_2026-04.csv"],
    ["card", BANK, "qif", "Ex Bank - 2026-01_to_2026-04.qif"],
    ["accounts", null, null, "Ex Bank accounts - 2026-01_to_2026-04.csv"],
    ["combined", null, null, "ex-bank-combined-2026-01_to_2026-04.zip"],
    ["zip", null, null, "ex-bank-csv-2026-01_to_2026-04.zip"],
  ]);
  const combined = list.find((d) => d.trigger === "combined");
  assert.equal(combined.type, "application/zip");
  assert.deepEqual(combined.files.map((f) => f.name), ["Ex Bank all pockets - trades - 2026-01_to_2026-04.csv", "Ex Bank all pockets - transactions - 2026-01_to_2026-04.csv"]);
  assert.equal(combined.files[0].text.split("\n")[0], "account,date,ticker,qty,price,currency,name");
  assert.ok(combined.files[0].text.includes(`\n"Ex ${FUND.replace(/"/g, '""')}",2026-01-20,"B,C",0.25,120,SGD,"'=Buy ""B,C"""\n`), "account column, quoting and the formula guard");
  assert.ok(F.fileFor(FUND, "qif").text.includes(`L[Ex ${FUND}]`), "the QIF account carries the prefix");
});

test("exact names, investment-cash, holdings, one month: span collapsed, bank and unknown kinds follow the mode", () => {
  const list = makeF({ mode: "holdings", kindModel: "investment-cash", range: ["2026-02", "2026-02"] }).downloads();
  assert.deepEqual(summary(list), [
    ["card", LATE, "transactions", "2024 - transactions - 2026-02.csv"],
    ["card", LATE, "valuations", "2024 - valuations - 2026-02.csv"],
    ["card", FUND, "trades", `${FUND} - trades - 2026-02.csv`],
    ["card", FUND, "transactions", `${FUND} - transactions - 2026-02.csv`],
    ["card", FUND, "valuations", `${FUND} - valuations - 2026-02.csv`],
    ["card", CASH, "transactions", `${CASH} - transactions - 2026-02.csv`],
    ["card", CASH, "qif", `${CASH} - 2026-02.qif`],
    ["card", BANK, "transactions", "Bank - transactions - 2026-02.csv"],
    ["card", BANK, "valuations", "Bank - valuations - 2026-02.csv"],
    ["accounts", null, null, "Example accounts - 2026-02.csv"],
    ["combined", null, null, "example-combined-2026-02_to_2026-02.zip"],
    ["zip", null, null, "example-csv-2026-02_to_2026-02.zip"],
  ]);
});

test("Accounts CSV: investment -> Investment, every other kind -> Savings; Name with the prefix; starting balances", () => {
  assert.equal(makeF().accountsFile().text, [
    "Account type,Name,Balance,Currency,Balance Date",
    "Savings,2024,0.00,USD,2026-01-30",
    `Investment,"'=Fund, ""B"" & <C>",0.00,SGD,2025-12-31`,
    "Savings,Cash 'pocket' Ö,500.00,SGD,2025-12-31",
    "Savings,Bank,200.00,SGD,2026-01-09",
    "",
  ].join("\n"));
  const prefixed = makeF({ naming: NAMINGS[1] }).accountsFile();
  assert.deepEqual([prefixed.name, prefixed.count], ["Ex Bank accounts - 2026-01_to_2026-04.csv", 4]);
  assert.deepEqual(prefixed.text.split("\n").slice(1, -1).map((l) => l.split(",")[0]), ["Savings", "Investment", "Savings", "Savings"]);
  assert.ok(prefixed.text.includes('\nInvestment,"Ex =Fund, ""B"" & <C>",'), "the prefix comes before the name, so no formula guard");
  const foo = { ...RESULTS.A, accounts: { X: { ...RESULTS.A.accounts[CASH], kind: "foo" } } };
  assert.equal(makeF({ result: foo }).accountsFile().text.split("\n")[1].split(",")[0], "Savings");
});

test("Combined: one transactions file without trades in range, the trades file unshifted with them", () => {
  const april = makeF({ mode: "holdings", range: ["2026-04", "2026-04"] });
  assert.deepEqual(april.combinedFiles().map((f) => f.name), ["Example all accounts - transactions - 2026-04.csv"]);
  const rec = april.downloads().find((d) => d.trigger === "combined");
  assert.deepEqual([rec.name, rec.type, "files" in rec], ["Example all accounts - transactions - 2026-04.csv", "text/csv", false]);
  assert.deepEqual(makeF({ mode: "holdings" }).combinedFiles().map((f) => f.name.split(" - ")[1]), ["trades", "transactions"]);
  assert.deepEqual(makeF({ mode: "tradelog" }).combinedFiles().map((f) => f.name.split(" - ")[1]), ["transactions"], "trade-log lines live in the transactions file");
});

// ---------------------------------------------------------------- cards, Download all, the hook

test("cards: an account shows iff it has files or month-end values in the range, buttons in files order", () => {
  const cards = (o) => makeF(o).cards().map((c) => [c.name, c.files.map((f) => f.kind)]);
  assert.deepEqual(cards({}), [[LATE, ["transactions", "qif"]], [FUND, ["transactions", "qif"]], [CASH, ["transactions", "qif"]], [BANK, ["transactions", "qif"]], [IDLE, []]]);
  assert.deepEqual(cards({ mode: "holdings", range: ["2026-01", "2026-01"] }), [
    [FUND, ["trades", "transactions", "valuations"]], [CASH, ["transactions", "qif"]], [BANK, ["transactions", "qif"]], [IDLE, []]], "the late account has nothing in January");
  assert.deepEqual(cards({ result: RESULTS.sparse, range: ["2026-02", "2026-02"] }), []);
  assert.deepEqual(cards({ result: RESULTS.sparse, range: ["2026-01", "2026-02"] }), [["Only Jan", ["transactions", "qif"]]]);
  assert.deepEqual(cards({ result: RESULTS.empty, range: ["2026-01", "2026-01"] }), []);
});

test("no card: the three toolbar records are disabled; no result: no records at all", () => {
  const disabled = ["accounts", "combined", "zip"].map((trigger) => ({ trigger, account: null, kind: null, disabled: true }));
  assert.deepEqual(makeF({ result: RESULTS.sparse, range: ["2026-02", "2026-02"] }).downloads(), disabled);
  assert.deepEqual(makeF({ result: RESULTS.empty, range: ["2026-01", "2026-01"] }).downloads(), disabled);
  for (const none of [null, undefined]) {
    const F = StatementFiles.create({ P: E, result: () => none, mode: () => "balance", range: () => ({ from: "", to: "" }), naming: NAMINGS[0], kindModel: "standard" });
    assert.deepEqual(F.downloads(), [], String(none));
  }
  // A card without buttons still enables the toolbar.
  const idleOnly = { ...RESULTS.A, accounts: { [IDLE]: RESULTS.A.accounts[IDLE] } };
  assert.deepEqual(summary(makeF({ result: idleOnly }).downloads()), [
    ["accounts", null, null, "Example accounts - 2026-01_to_2026-04.csv"],
    ["combined", null, null, "Example all accounts - transactions - 2026-01_to_2026-04.csv"],
    ["zip", null, null, "example-csv-2026-01_to_2026-04.zip"],
  ]);
});

// Every combination of result, kind model, mode, range and naming.
function* states() {
  for (const [rid, result] of Object.entries(RESULTS)) {
    for (const kindModel of KIND_MODELS) for (const mode of MODES) for (const range of rangesOf(result)) for (const naming of NAMINGS) {
      yield { at: `${rid} ${kindModel} ${mode} ${range.join("..")} ${naming.slug}`, result, kindModel, mode, range, naming };
    }
  }
}

test("allFiles is the whole Download-all list: Accounts CSV once and first, then the card buttons' files; names unique", () => {
  let n = 0;
  for (const s of states()) {
    const F = makeF(s);
    const all = F.allFiles();
    const accounts = F.accountsFile();
    assert.deepEqual(all, [accounts, ...F.cards().flatMap((c) => c.files.map((f) => F.fileFor(c.name, f.kind)))], s.at);
    assert.equal(all.filter((f) => f.name === accounts.name).length, 1, `${s.at}: one Accounts entry`);
    assert.equal(all[0].name, accounts.name);
    assert.equal(new Set(all.map((f) => f.name)).size, all.length, `${s.at}: unique names`);
    n++;
  }
  assert.ok(n > 200);
});

test("downloads follows the page: cards in order, then #accounts, #combined, #zip; zips list their files", () => {
  for (const s of states()) {
    const F = makeF(s);
    const list = F.downloads();
    const cards = F.cards();
    const cardRecords = cards.flatMap((c) => c.files.map((f) => {
      const file = F.fileFor(c.name, f.kind);
      return { trigger: "card", account: c.name, kind: f.kind, name: file.name, type: "text/csv", text: file.text };
    }));
    assert.deepEqual(list.slice(0, cardRecords.length), cardRecords, s.at);
    const toolbar = list.slice(cardRecords.length);
    assert.deepEqual(toolbar.map((d) => d.trigger), ["accounts", "combined", "zip"], s.at);
    if (!cards.length) {
      assert.ok(toolbar.every((d) => d.disabled === true && d.account === null && d.kind === null && Object.keys(d).length === 4), s.at);
      continue;
    }
    const [acc, comb, zip] = toolbar;
    const accounts = F.accountsFile();
    assert.deepEqual(acc, { trigger: "accounts", account: null, kind: null, name: accounts.name, type: "text/csv", text: accounts.text });
    const combined = F.combinedFiles();
    assert.deepEqual(comb, combined.length === 1
      ? { trigger: "combined", account: null, kind: null, name: combined[0].name, type: "text/csv", text: combined[0].text }
      : { trigger: "combined", account: null, kind: null, name: F.zipName("combined"), type: "application/zip", files: combined.map(({ name, text }) => ({ name, text })) }, s.at);
    assert.deepEqual(zip, { trigger: "zip", account: null, kind: null, name: F.zipName("csv"), type: "application/zip", files: F.allFiles().map(({ name, text }) => ({ name, text })) });
    assert.deepEqual(F.downloads(), list, `${s.at}: deterministic`);
  }
});

test("the browser branch loads without touching anything and gives the same downloads", () => {
  const context = vm.createContext({});
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(REPO, "core", "files.js"), "utf8"), context, { filename: "core/files.js" });
  assert.deepEqual(Object.keys(context.StatementFiles), ["create"]);
  const ctx = { P: E, result: () => RESULTS.A, mode: () => "holdings", range: () => ({ from: "2026-01", to: "2026-04" }), naming: NAMINGS[1], kindModel: "investment-cash" };
  assert.deepEqual(JSON.parse(JSON.stringify(context.StatementFiles.create(ctx).downloads())), StatementFiles.create(ctx).downloads());
});

// ---------------------------------------------------------------- against the old apps

const statementApps = frozenProviders({ root: REPO }).filter((p) => p.frozen.legacyRepo && p.frozen.kindModel);
const srcOf = (frozen, file) => path.join(oldRoot, frozen.legacyRepo, "src", file);
const oldPresent = statementApps.length > 0 && statementApps.every((p) => fs.existsSync(srcOf(p.frozen, "app.js")));

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e]);

// An old statement page in a vm sandbox. The stub DOM gives the old app what it reads and
// keeps what it writes; #cards parses the card markup the old render writes (titles and
// button.dl attributes, entities decoded as the HTML parser does), and an anchor click
// records the download. The parser module is the old one with parseStatements returning the
// synthetic result; pdf.js is a stub that reads every file as a document with no pages.
function oldPage(appSource, { exportModule, parserGlobal, parser, result }) {
  const listeners = new Map();
  const on = (key) => (type, fn) => {
    if (!listeners.has(key)) listeners.set(key, {});
    const l = listeners.get(key);
    (l[type] = l[type] || []).push(fn);
  };
  const fire = async (key, type, event) => {
    const fns = ((listeners.get(key) || {})[type] || []).slice();
    await Promise.all(fns.map((fn) => fn(event)));
  };
  const DOC = {};
  const records = [];
  const blobs = new Map();
  let cards = [];
  const field = { hidden: false };
  const els = new Map();
  function el(id) {
    if (els.has(id)) return els.get(id);
    let e;
    if (id === "from" || id === "to") {
      let options = [], value = "";
      e = {
        disabled: false,
        get value() { return value; },
        set value(v) { value = options.includes(String(v)) ? String(v) : ""; },
        get innerHTML() { return options.join(","); },
        set innerHTML(h) { options = [...String(h).matchAll(/<option value="([^"]*)">/g)].map((m) => decode(m[1])); value = options.length ? options[0] : ""; },
      };
    } else if (id === "cards") {
      let html = "";
      e = {
        get innerHTML() { return html; },
        set innerHTML(h) {
          html = String(h);
          cards = html.split('<article class="card">').slice(1).map((a) => ({
            title: decode((/<h3>([^<]*)<\/h3>/.exec(a) || [])[1]),
            buttons: [...a.matchAll(/<button class="dl" data-account="([^"]*)" data-kind="([^"]*)">/g)].map((m) => {
              const b = { dataset: { account: decode(m[1]), kind: decode(m[2]) } };
              b.closest = (sel) => (sel === "button.dl" ? b : null);
              return b;
            }),
          }));
        },
      };
    } else {
      e = { innerHTML: "", textContent: "", hidden: false, disabled: false, value: "" };
    }
    Object.assign(e, { id, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, addEventListener: on(e), closest: (sel) => (sel === ".field" ? field : null), click() {} });
    els.set(id, e);
    return e;
  }
  const buttons = () => cards.flatMap((c) => c.buttons);
  const modeButtons = MODES.map((mode) => ({ dataset: { mode }, classList: { toggle() {} }, setAttribute() {} }));
  const document = {
    querySelector(sel) {
      const m = /^#([\w-]+)$/.exec(sel);
      if (!m) throw new Error(`stub DOM: unexpected selector ${sel}`);
      return el(m[1]);
    },
    querySelectorAll(sel) {
      if (sel === "#mode button") return modeButtons;
      if (sel === "#cards button.dl") return buttons();
      throw new Error(`stub DOM: unexpected selector ${sel}`);
    },
    getElementById: (id) => (id === "pdf-worker-src" ? null : el(id)),
    createElement(tag) {
      if (tag !== "a") throw new Error(`stub DOM: unexpected element ${tag}`);
      const a = { click() { records.push({ name: a.download, blob: blobs.get(a.href) }); }, remove() {} };
      return a;
    },
    body: { appendChild() {} },
    documentElement: {},
    addEventListener: on(DOC),
  };
  let urls = 0;
  const store = new Map();
  const context = vm.createContext({
    document,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    pdfjsLib: { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 0, getPage: async () => { throw new Error("no pages"); }, destroy: async () => {} }) }) },
    URL: { createObjectURL: (blob) => { const u = `blob:stub/${++urls}`; blobs.set(u, blob); return u; }, revokeObjectURL() {} },
    Blob, TextEncoder, setTimeout: () => 0, console,
  });
  context.window = context;
  context.self = context;
  context.StatementExport = exportModule;
  context[parserGlobal] = Object.assign({}, parser, { parseStatements: () => structuredClone(result) });
  vm.runInContext(appSource, context, { filename: "old app.js" });

  async function normalise(x) {
    if (x.disabled) return { trigger: x.trigger, account: null, kind: null, disabled: true };
    const { name, blob } = x.record;
    const base = { trigger: x.trigger, account: x.account, kind: x.kind, name, type: blob.type };
    if (blob.type !== "application/zip") return { ...base, text: await blob.text() };
    const entries = unzip(new Uint8Array(await blob.arrayBuffer()));
    assert.ok(entries.every((e) => e.crcOk), "the old zip's CRCs");
    return { ...base, files: entries.map((e) => ({ name: e.name, text: new TextDecoder().decode(e.data) })) };
  }

  return {
    async load() {
      const file = { name: "statement.pdf", type: "application/pdf", size: 1, arrayBuffer: async () => new ArrayBuffer(1) };
      await fire(DOC, "drop", { preventDefault() {}, target: {}, dataTransfer: { files: [file] } });
      assert.deepEqual([el("empty").hidden, el("results").hidden], [true, false], "the old page shows results");
    },
    async setMode(mode) {
      await fire(el("mode"), "click", { target: { closest: (sel) => (sel === "button[data-mode]" ? { dataset: { mode } } : null) } });
    },
    async setRange(from, to) {
      el("from").value = from;
      el("to").value = to;
      assert.deepEqual([el("from").value, el("to").value], [from, to], "the selects offer these months");
      await fire(el("from"), "change", {});
    },
    cards: () => cards.map((c) => ({ name: c.title, kinds: c.buttons.map((b) => b.dataset.kind), accounts: c.buttons.map((b) => b.dataset.account) })),
    // The page driver's clicks: every card button in DOM order, then the toolbar.
    async clickAll() {
      const out = [];
      for (const b of buttons()) {
        const before = records.length;
        await fire(el("cards"), "click", { target: b });
        assert.equal(records.length, before + 1, "one download per card button");
        out.push({ trigger: "card", account: b.dataset.account, kind: b.dataset.kind, record: records[before] });
      }
      for (const id of ["accounts", "combined", "zip"]) {
        if (el(id).disabled) { out.push({ trigger: id, disabled: true }); continue; }
        const before = records.length;
        await fire(el(id), "click", {});
        assert.equal(records.length, before + 1, `one download from #${id}`);
        out.push({ trigger: id, account: null, kind: null, record: records[before] });
      }
      return Promise.all(out.map(normalise));
    },
  };
}

function oldModules(frozen) {
  const appSource = fs.readFileSync(srcOf(frozen, "app.js"), "utf8");
  const m = /const P = (?:Object\.assign\(\{\}, window\.StatementExport, )?window\.([A-Za-z]+)\)?;/.exec(appSource);
  assert.ok(m, `${frozen.legacyRepo}: the old app composes P from a window global`);
  const exportFile = srcOf(frozen, "export.js");
  return {
    appSource,
    parserGlobal: m[1],
    parser: require(srcOf(frozen, "parser.js")),
    exportModule: fs.existsSync(exportFile) ? require(exportFile) : E,
  };
}

test("every statement app's old page offers exactly downloads() for every mode and range, Download all's DOM scan included", { skip: oldPresent ? false : "old repositories not present" }, async (t) => {
  const { problems, manifests } = await baseline.before(statementApps.map((p) => p.frozen), { live: false, oldRoot });
  let steps = 0, records = 0;
  try {
    assert.deepEqual(problems, [], "HEAD and index.html match frozen.js");
    for (const { id, frozen } of statementApps) {
      const mods = oldModules(frozen);
      // The same composed namespace on both sides, so only the app's own file logic differs.
      const P = Object.assign({}, mods.exportModule, mods.parser);
      for (const [rid, result] of Object.entries(RESULTS)) {
        const page = oldPage(mods.appSource, { ...mods, result });
        await page.load();
        for (const mode of MODES) {
          await page.setMode(mode);
          for (const range of rangesOf(result)) {
            await page.setRange(...range);
            const at = `${id} ${rid} ${mode} ${range.join("..")}`;
            const F = makeF({ result, mode, range, naming: frozen.naming, kindModel: frozen.kindModel, P });
            assert.deepEqual(page.cards(), F.cards().map((c) => ({ name: c.name, kinds: c.files.map((f) => f.kind), accounts: c.files.map(() => c.name) })), `${at}: cards`);
            const old = await page.clickAll();
            assert.deepEqual(F.downloads(), old, `${at}: downloads`);
            steps++;
            records += old.length;
          }
        }
      }
    }
    t.diagnostic(`${statementApps.length} old pages, ${steps} states, ${records} downloads compared`);
  } finally {
    assert.deepEqual(baseline.after(manifests), [], "nothing in the old repositories changed");
  }
});

test("the replay path (loadNode with the old parser) gives what the old pages offer, on data where the export variants agree", { skip: oldPresent ? false : "old repositories not present" }, async () => {
  const { problems, manifests } = await baseline.before(statementApps.map((p) => p.frozen), { live: false, oldRoot });
  try {
    assert.deepEqual(problems, []);
    const result = RESULTS["A-plain"];
    for (const { id, frozen } of statementApps) {
      const handle = loadNode(id, { parser: "old", oldRoot });
      const page = oldPage(oldModules(frozen).appSource, { ...oldModules(frozen), result });
      await page.load();
      for (const mode of MODES) {
        await page.setMode(mode);
        for (const [from, to] of rangesOf(result)) {
          await page.setRange(from, to);
          assert.deepEqual(handle.downloads(result, { mode, from, to }), await page.clickAll(), `${id} ${mode} ${from}..${to}`);
        }
      }
      assert.deepEqual(handle.downloads(null, { mode: "balance" }), []);
    }
  } finally {
    assert.deepEqual(baseline.after(manifests), []);
  }
});
