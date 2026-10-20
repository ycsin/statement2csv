// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The two templates' account labels (providers/_template-csv/parser.js and
// providers/_template-pdf/parser.js, distinctLabels): a label is its account's default name, and
// StatementAssemble.build puts portfolios with equal labels into one account, so the templates
// give every portfolio id a label of its own. A label two portfolios would share adds the
// currency, then the whole number; every portfolio that shares one changes, so the input order
// never matters; labels nobody shares stay short. Synthetic statements in each template's format,
// built here; the fixtures hold one such account too (a number in two currencies).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const CSV = require(path.join(REPO, "providers", "_template-csv", "parser.js"));
const PDF = require(path.join(REPO, "providers", "_template-pdf", "parser.js"));

// A CSV export of one account: rows [date, description, amount, balance].
const csvExport = (id, number, currency, rows) => ({
  id,
  csv: ["Example Bank transaction history", `Account,${number},${currency}`, "Date,Description,Amount,Balance", ...rows.map((r) => r.join(","))].join("\n") + "\n",
});

// A PDF statement for a month: sections [name, number, currency, opening, rows [[date, text,
// amount?]], closing], as pdf.js gives the text items of the PDF template's layout.
function pdfStatement(id, month, sections) {
  const [y, m] = month.split("-");
  const last = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  const lines = [[[50, "Example Bank"]], [[50, "Monthly statement"]], [[50, "Statement period"], [160, `01/${m}/${y} to ${last}/${m}/${y}`]]];
  for (const [name, number, currency, opening, rows, closing] of sections) {
    lines.push([[50, "Account"], [130, name], [420, number], [500, currency]], [[50, "Opening balance"], [500, opening]]);
    for (const [date, text, amount] of rows) lines.push([[50, date], [130, text], ...(amount === undefined ? [] : [[500, amount]])]);
    lines.push([[50, "Closing balance"], [500, closing]]);
  }
  const items = lines.flatMap((cells, i) => cells.map(([x, str]) => ({ str, x, y: 800 - 15 * i, w: str.length * 5, h: 10 })));
  return { id, pages: [items] };
}

// Every order of a list.
const orders = (list) => (list.length <= 1 ? [list] : list.flatMap((x, i) => orders([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest])));

// What a result says about its accounts: portfolio id -> account name, and each account's
// currency, the currencies of its cash and its month-end values.
function accountsOf(r) {
  return {
    portfolios: Object.fromEntries(r.portfolios.map((p) => [p.id, p.account])),
    accounts: Object.fromEntries(Object.entries(r.accounts).map(([name, a]) => [name, { currency: a.currency, cash: [...new Set(a.cash.map((c) => c.currency))], valuations: a.valuations }])),
  };
}

test("CSV template: a label two portfolios would share adds the currency, then the whole number", () => {
  const statements = [
    csvExport("a-sgd.csv", "SYNTH0001234", "SGD", [["2026-01-05", "Deposit", "100.00", "100.00"], ["2026-01-20", "Fee", "-1.00", "99.00"]]),
    csvExport("a-usd.csv", "SYNTH0001234", "USD", [["2026-01-06", "Deposit", "50.00", "50.00"]]),
    csvExport("b-sgd.csv", "SYNTH9990234", "SGD", [["2026-01-07", "Deposit", "7.00", "7.00"]]),
    csvExport("c-sgd.csv", "SYNTH0000555", "SGD", [["2026-01-08", "Deposit", "3.00", "3.00"]]),
  ];
  const want = {
    portfolios: {
      "SYNTH0001234:SGD": "Example #SYNTH0001234 SGD", // "Example #234 SGD" is b's too
      "SYNTH0001234:USD": "Example #234 USD",
      "SYNTH9990234:SGD": "Example #SYNTH9990234 SGD",
      "SYNTH0000555:SGD": "Example #555", // nobody else's: short
    },
    accounts: {
      "Example #SYNTH0001234 SGD": { currency: "SGD", cash: ["SGD"], valuations: [["2026-01-31", 99]] },
      "Example #234 USD": { currency: "USD", cash: ["USD"], valuations: [["2026-01-31", 50]] },
      "Example #SYNTH9990234 SGD": { currency: "SGD", cash: ["SGD"], valuations: [["2026-01-31", 7]] },
      "Example #555": { currency: "SGD", cash: ["SGD"], valuations: [["2026-01-31", 3]] },
    },
  };
  for (const order of orders(statements)) {
    const r = CSV.parseStatements(order, {});
    assert.deepEqual([r.errors, r.warnings], [[], []]);
    const got = accountsOf(r);
    assert.deepEqual(got.portfolios, want.portfolios, order.map((s) => s.id).join(" "));
    for (const [name, a] of Object.entries(want.accounts)) assert.deepEqual(got.accounts[name], a, name);
    for (const p of r.portfolios) assert.deepEqual(p.names, [p.label]);
  }
  // Two currencies of one number: the currency is enough.
  const two = CSV.parseStatements(statements.slice(0, 2), {});
  assert.deepEqual(accountsOf(two).portfolios, { "SYNTH0001234:SGD": "Example #234 SGD", "SYNTH0001234:USD": "Example #234 USD" });
  // Alone, every label is short; an export without rows makes no portfolio and changes no label.
  assert.deepEqual(accountsOf(CSV.parseStatements([statements[0], csvExport("empty.csv", "SYNTH9990234", "SGD", [])], {})).portfolios, { "SYNTH0001234:SGD": "Example #234" });
  // A rename in the configurator still names the account, and a rename to one name merges.
  const renamed = CSV.parseStatements(statements.slice(0, 2), { "SYNTH0001234:SGD": { name: "Joint" }, "SYNTH0001234:USD": { name: "Joint" } });
  assert.deepEqual(Object.keys(renamed.accounts), ["Joint"]);
});

test("PDF template: the same, with every name an account had in the form its label takes", () => {
  const jan = pdfStatement("s-2026-01.pdf", "2026-01", [
    ["Multi Currency", "55501", "SGD", "10.00", [["05/01/2026", "Deposit", "5.00"]], "15.00"],
    ["Multi Currency", "55501", "USD", "20.00", [], "20.00"],
    ["Saver", "70001", "SGD", "1.00", [], "1.00"],
    ["Saver", "80001", "SGD", "2.00", [], "2.00"],
    ["Travel", "90002", "USD", "4.00", [], "4.00"],
  ]);
  const feb = pdfStatement("s-2026-02.pdf", "2026-02", [
    ["Multi Currency Plus", "55501", "SGD", "15.00", [], "15.00"],
    ["Multi Currency", "55501", "USD", "20.00", [["10/02/2026", "Card payment, online", "-2.50"]], "17.50"],
    ["Saver", "70001", "SGD", "1.00", [], "1.00"],
    ["Saver", "80001", "SGD", "2.00", [], "2.00"],
    ["Travel", "90002", "USD", "4.00", [], "4.00"],
  ]);
  for (const order of orders([jan, feb])) {
    const r = PDF.parseStatements(order, {});
    assert.deepEqual([r.errors, r.warnings], [[], []]);
    const got = Object.fromEntries(r.portfolios.map((p) => [p.id, [p.account, p.names]]));
    assert.deepEqual(got, {
      // renamed in February: the newest name is no other account's, so both stay short
      "55501:SGD": ["Multi Currency Plus 5501", ["Multi Currency 5501", "Multi Currency Plus 5501"]],
      "55501:USD": ["Multi Currency 5501", ["Multi Currency 5501"]],
      // the same name and last digits in one currency: the whole number
      "70001:SGD": ["Saver 70001 SGD", ["Saver 70001 SGD"]],
      "80001:SGD": ["Saver 80001 SGD", ["Saver 80001 SGD"]],
      "90002:USD": ["Travel 0002", ["Travel 0002"]],
    });
    assert.equal(Object.keys(r.accounts).length, 5, "five accounts, none merged");
    assert.deepEqual(r.accounts["Saver 80001 SGD"].valuations, [["2026-01-31", 2], ["2026-02-28", 2]]);
  }
  // Without the rename, the number's two currencies would share a label: both add the currency.
  const both = PDF.parseStatements([jan], {});
  assert.equal(both.portfolios.find((p) => p.id === "55501:SGD").account, "Multi Currency 5501 SGD");
  assert.equal(both.portfolios.find((p) => p.id === "55501:USD").account, "Multi Currency 5501 USD");
  assert.deepEqual(both.accounts["Multi Currency 5501 USD"].valuations, [["2026-01-31", 20]]);
  // A row without an amount is reported under the label the account takes.
  const unpriced = pdfStatement("s-2026-03.pdf", "2026-03", [
    ["Multi Currency", "55501", "SGD", "15.00", [["03/03/2026", "Card replaced"]], "15.00"],
    ["Multi Currency", "55501", "USD", "17.50", [], "17.50"],
  ]);
  const r = PDF.parseStatements([unpriced], {});
  assert.deepEqual(r.skippedRows.map((x) => x.account), ["Multi Currency 5501 SGD"]);
});
