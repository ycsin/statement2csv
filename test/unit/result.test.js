// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// core/contract/result.js: checkResult on good and bad synthetic results, the fields the
// resolved ui switches require, and strict mode.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { checkResult } = require("../../core/contract/result.js");
const { resolveRuntime } = require("../../core/contract/descriptor.js");

const R = resolveRuntime({ contract: 1, id: "example", name: "Example Bank", summary: "x", inputs: ["pdf"], parserGlobal: "ExampleBankParser" });
const runtime = (ui = {}, legacy) => resolveRuntime({ contract: 1, id: "example", name: "Example Bank", summary: "x", inputs: ["pdf"], parserGlobal: "ExampleBankParser", ui, ...(legacy ? { legacy } : {}) });

function good() {
  return {
    accounts: {
      "Example Savings": {
        kind: "bank", currency: "SGD", downloadOnly: false,
        months: {
          "2026-01": { monthEnd: "2026-01-31", opening: 0, closing: 100, fx: null },
          "2026-02": { monthEnd: "2026-02-28", opening: 100, closing: 90, fx: null, partial: true, startDate: "2026-02-03" },
        },
        valuations: [["2026-01-31", 100], ["2026-02-28", 90]],
        trades: [],
        cash: [
          { date: "2026-01-02", amount: -100, currency: "SGD", name: "Salary", notes: "", kind: "bank" },
          { date: "2026-02-03", amount: 10, currency: "SGD", name: "Card", kind: "bank", balancing: true },
        ],
      },
      "Example Fund": {
        kind: "investment", currency: "USD",
        months: { "2026-02": { monthEnd: "2026-02-28", opening: 0, closing: 51, fx: 1.35 } },
        valuations: [["2026-02-28", 51]],
        trades: [{ date: "2026-02-10", ticker: "EXF", qty: 2, price: 25, currency: "USD", name: "Example Fund" }],
        cash: [{ date: "2026-02-10", amount: -50, currency: "USD", name: "Buy", kind: "transfer" }],
      },
    },
    months: [{ month: "2026-01", id: "a.pdf" }, { month: "2026-02", id: "b.pdf" }],
    portfolios: [
      { id: "1:SGD", label: "Example Savings", names: ["Old name", "Example Savings"], firstMonth: "2026-01", lastMonth: "2026-02", kind: "bank", currency: "SGD" },
      { id: "fund:EXF", label: "Example Fund", names: ["Example Fund"], firstMonth: "2026-02", lastMonth: "2026-02", kind: "investment", currency: null },
    ],
    errors: [{ id: "c.pdf", error: "not an Example Bank statement" }],
    gaps: [],
    firstOpenings: [{ account: "Example Savings", month: "2026-01", opening: 0.5 }],
    skippedRows: [{ date: "2026-01-05", category: "unknown", detail: "Mystery", account: "Example Savings" }],
    statements: 2,
    warnings: [],
    partialMonths: ["2026-02"],
    late: [{ month: "2026-01", statement: "2026-02", account: "Example Savings", amount: 5 }],
    closed: [{ account: "Old", month: "2026-02", balance: 0 }],
  };
}

const errs = (r, rt = R, o = {}) => checkResult(r, rt, o).errors;
const warns = (r, rt = R, o = {}) => checkResult(r, rt, o).warnings;
const has = (list, re) => list.some((e) => re.test(e));

test("a well-formed result passes, strict included", () => {
  assert.deepEqual(checkResult(good(), R), { errors: [], warnings: [] });
  assert.deepEqual(checkResult(good(), R, { strict: true }), { errors: [], warnings: [] });
});

test("missing required fields and wrong types are errors", () => {
  for (const k of ["accounts", "months", "portfolios", "errors", "gaps", "firstOpenings", "skippedRows", "statements", "warnings"]) {
    const r = good();
    delete r[k];
    assert.ok(has(errs(r), new RegExp(`missing required field ${k}`)), k);
  }
  assert.ok(has(errs({ ...good(), accounts: [] }), /accounts must be an object/));
  assert.ok(has(errs({ ...good(), statements: "2" }), /statements must be a number/));
  assert.deepEqual(errs(null), ["result must be an object"]);
  const r = good();
  r.accounts["Example Fund"].trades[0].qty = "2";
  r.accounts["Example Fund"].cash[0].name = 5;
  r.accounts["Example Savings"].months["2026-01"].fx = "1";
  r.portfolios[0].names = "Example Savings";
  r.errors.push({ id: "x" });
  r.skippedRows.push({ date: "2026-01", category: "x" });
  const e = errs(r);
  assert.ok(has(e, /trades\[0\]\.qty must be a finite number/));
  assert.ok(has(e, /cash\[0\]\.name must be a string/));
  assert.ok(has(e, /fx must be a finite number or null/));
  assert.ok(has(e, /names must be an array of strings/));
  assert.ok(has(e, /errors\[1\] must be \{id: string, error: string\}/));
  assert.ok(has(e, /skippedRows\[1\]\.date must be "YYYY-MM-DD"/));
});

test("NaN and Infinity are errors", () => {
  const r = good();
  r.accounts["Example Savings"].months["2026-01"].closing = NaN;
  r.accounts["Example Savings"].cash[0].amount = Infinity;
  r.accounts["Example Savings"].valuations[0][1] = -Infinity;
  r.firstOpenings[0].opening = NaN;
  const e = errs(r);
  assert.ok(has(e, /closing must be a finite number, not NaN/));
  assert.ok(has(e, /cash\[0\]\.amount must be a finite number, not Infinity/));
  assert.ok(has(e, /valuations\[0\] must be/));
  assert.ok(has(e, /firstOpenings\[0\]\.opening must be a finite number/));
});

test("unsorted or repeated months, valuations, cash and trades are errors", () => {
  const r = good();
  r.months.reverse();
  r.accounts["Example Savings"].valuations.reverse();
  r.accounts["Example Savings"].cash.reverse();
  r.accounts["Example Fund"].trades.push({ ...r.accounts["Example Fund"].trades[0], date: "2026-02-01" });
  const e = errs(r);
  assert.ok(has(e, /months are not in ascending order/));
  assert.ok(has(e, /valuations is not in ascending date order/));
  assert.ok(has(e, /cash is not in ascending date order/));
  assert.ok(has(e, /trades is not in ascending date order/));
  const d = good();
  d.months.push({ month: "2026-02" });
  assert.ok(has(errs(d), /months: 2026-02 is listed twice/));
  const same = good();
  same.accounts["Example Savings"].cash[1].date = "2026-01-02";
  assert.deepEqual(errs(same), [], "equal dates keep their (stable) order");
});

test("reserved kinds, unknown first-opening accounts, duplicate portfolio ids, monthEnd outside its month", () => {
  for (const kind of ["adjustment", "gap", "trade"]) {
    const r = good();
    r.accounts["Example Savings"].cash[0].kind = kind;
    assert.ok(has(errs(r), new RegExp(`kind "${kind}" is reserved`)), kind);
  }
  const r = good();
  r.firstOpenings[0].account = "Nobody";
  r.portfolios[1].id = "1:SGD";
  r.accounts["Example Fund"].months["2026-02"].monthEnd = "2026-03-01";
  const e = errs(r);
  assert.ok(has(e, /firstOpenings\[0\]\.account "Nobody" is not an account/));
  assert.ok(has(e, /portfolio id "1:SGD" is listed twice/));
  assert.ok(has(e, /monthEnd 2026-03-01 is outside its month/));
});

test("warnings: odd currencies and names not ending with the label; strict turns them into errors", () => {
  const r = good();
  r.accounts["Example Fund"].currency = "US$";
  r.portfolios[1].names = ["Example Fund", "Renamed"];
  const w = warns(r);
  assert.ok(has(w, /currency "US\$" is not a three-letter currency code/));
  assert.ok(has(w, /names does not end with its label "Example Fund"/));
  assert.deepEqual(errs(r), []);
  const s = checkResult(r, R, { strict: true });
  assert.deepEqual(s.warnings, []);
  assert.ok(has(s.errors, /^strict: .*three-letter/));
});

test("with P: an adjustment must be the last entry of its day", () => {
  const P = (entries) => ({ adjustedEntries: () => ({ entries, problems: [] }) });
  const day = "2026-01-31";
  const ok = P([{ date: day, kind: "bank" }, { date: day, kind: "adjustment" }, { date: "2026-02-28", kind: "adjustment" }]);
  assert.deepEqual(warns(good(), R, { P: ok }), []);
  const bad = P([{ date: day, kind: "adjustment" }, { date: day, kind: "bank" }]);
  assert.ok(has(warns(good(), R, { P: bad }), /adjustment on 2026-01-31 is not the last entry of its day/));
  const boom = { adjustedEntries: () => { throw new Error("nope"); } };
  assert.ok(has(errs(good(), R, { P: boom }), /P\.adjustedEntries throws: nope/));
});

test("fields required by the resolved switches", () => {
  const strip = (...keys) => {
    const r = good();
    for (const k of keys) delete r[k];
    return r;
  };
  // status "months" needs no statements count; "statements+downloads" needs downloads too
  const gen1 = runtime({}, { preset: "gen1" });
  assert.ok(!has(errs(strip("statements"), gen1), /statements/), "status months");
  assert.ok(has(errs(strip("baseCurrency"), gen1), /missing required field baseCurrency/), "openingsCurrency base");
  assert.ok(has(errs(strip("reconciled"), gen1), /missing required field reconciled/), "diagnostics reconciled");
  assert.deepEqual(errs({ ...good(), baseCurrency: "SGD", reconciled: [{ month: "2026-01", account: "Example Savings", diff: 1.5 }] }, gen1), []);
  assert.ok(has(errs({ ...good(), baseCurrency: "SGD", reconciled: [{ month: "2026-01" }] }, gen1), /reconciled\[0\] must be/));
  const sd = runtime({ status: "statements+downloads" });
  assert.ok(has(errs(good(), sd), /missing required field downloads/));
  assert.deepEqual(errs({ ...good(), downloads: 1 }, sd), []);
  // extraWarnings "unmapped": unmapped replaces warnings
  const um = runtime({}, { extraWarnings: "unmapped" });
  assert.ok(has(errs(strip("warnings"), um), /missing required field unmapped/));
  assert.deepEqual(errs({ ...strip("warnings"), unmapped: { "Odd portfolio": ["2026-01"] } }, um), []);
  assert.ok(has(errs({ ...good(), unmapped: { x: "2026-01" } }, um), /unmapped must be an object/));
  // optional, guarded fields are type-checked when present
  assert.deepEqual(errs(strip("partialMonths", "late", "closed")), []);
  assert.ok(has(errs({ ...good(), partialMonths: ["2026-2"] }), /partialMonths must be an array/));
  assert.ok(has(errs({ ...good(), late: [{ month: "2026-01" }] }), /late\[0\] must be/));
  assert.ok(has(errs({ ...good(), closed: [{ account: "x" }] }), /closed\[0\] must be/));
});

test("a skipped row's detail and owner may be absent or null, else they must be strings", () => {
  const r = good();
  r.skippedRows.push({ date: "2026-01-06", category: "internal", detail: null, account: null }, { date: "2026-01-07", category: "internal" });
  assert.deepEqual(errs(r), []);
  assert.deepEqual(errs(r, R, { strict: true }), []);
  r.skippedRows.push({ date: "2026-01-08", category: "internal", detail: 5 }, { date: "2026-01-09", category: "internal", detail: false, account: 7 });
  assert.deepEqual(errs(r), [
    "skippedRows[3].detail must be a string when present",
    "skippedRows[4].detail must be a string when present",
    "skippedRows[4].account must be a string when present",
  ]);
});

test("skipped-row owner field follows ui.skippedOwner", () => {
  const r = good();
  r.skippedRows[0].portfolio = 5;
  assert.deepEqual(errs(r), [], "account owner: portfolio is not read");
  const owner = runtime({}, { skippedOwner: "portfolio" });
  assert.ok(has(errs(r, owner), /skippedRows\[0\]\.portfolio must be a string/));
});
