// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// core/contract/headers.js: expected CSV headers derived from the composed namespace P.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { expectedHeader, effectiveMode } = require("../../core/contract/headers.js");

const EXPORT = path.resolve(__dirname, "..", "..", "core", "export.js");
const csv = (header) => `${header.join(",")}\n`;

// A synthetic namespace with the core's five-column transaction files.
const FIVE = {
  adjustedCsv: () => csv(["date", "amount", "currency", "name", "notes"]),
  transactionsCsv: () => csv(["date", "amount", "currency", "name", "notes"]),
  tradesCsv: () => csv(["date", "ticker", "qty", "price", "currency", "name"]),
  valuationsCsv: () => csv(["date", "balance", "currency"]),
  accountsCsv: () => csv(["Account type", "Name", "Balance", "Currency", "Balance Date"]),
  combinedTransactionsCsv: () => csv(["account", "date", "amount", "currency", "name", "notes"]),
  combinedTradesCsv: () => csv(["account", "date", "ticker", "qty", "price", "currency", "name"]),
};
// The same with overriding writers that drop the notes column.
const FOUR = {
  ...FIVE,
  adjustedCsv: () => csv(["date", "amount", "currency", "name"]),
  transactionsCsv: () => csv(["date", "amount", "currency", "name"]),
  combinedTransactionsCsv: () => csv(["account", "date", "amount", "currency", "name"]),
};

test("core P gives the five-column transactions header", { skip: fs.existsSync(EXPORT) ? false : "core/export.js is not in the tree yet" }, () => {
  const P = Object.assign({}, require(EXPORT));
  for (const mode of ["balance", "tradelog", "holdings"]) {
    assert.equal(expectedHeader(P, { trigger: "card", kind: "transactions", mode }), "date,amount,currency,name,notes", mode);
  }
  assert.equal(expectedHeader(P, { trigger: "card", kind: "trades", mode: "holdings" }), "date,ticker,qty,price,currency,name");
  assert.equal(expectedHeader(P, { trigger: "card", kind: "valuations", mode: "holdings" }), "date,balance,currency");
  assert.equal(expectedHeader(P, { trigger: "accounts" }), "Account type,Name,Balance,Currency,Balance Date");
  assert.equal(expectedHeader(P, { trigger: "combined", type: "text/csv" }), "account,date,amount,currency,name,notes");
});

test("a synthetic five-column P and an overriding four-column P", () => {
  for (const mode of ["balance", "tradelog", "holdings"]) {
    assert.equal(expectedHeader(FIVE, { trigger: "card", kind: "transactions", mode }), "date,amount,currency,name,notes");
    assert.equal(expectedHeader(FOUR, { trigger: "card", kind: "transactions", mode }), "date,amount,currency,name");
  }
  assert.equal(expectedHeader(FOUR, { trigger: "combined", type: "text/csv" }), "account,date,amount,currency,name");
  assert.equal(expectedHeader(FOUR, { trigger: "card", kind: "trades", mode: "holdings" }), "date,ticker,qty,price,currency,name");
});

test("the Combined zip's entries: trades from combinedTradesCsv, transactions from combinedTransactionsCsv", () => {
  assert.equal(expectedHeader(FIVE, { trigger: "combined", kind: "trades" }), "account,date,ticker,qty,price,currency,name");
  assert.equal(expectedHeader(FIVE, { trigger: "combined", kind: "transactions" }), "account,date,amount,currency,name,notes");
  assert.equal(expectedHeader(FOUR, { trigger: "combined", kind: "transactions" }), "account,date,amount,currency,name", "an override's header");
  assert.equal(expectedHeader({ ...FIVE, combinedTradesCsv: () => csv(["account", "date", "ticker", "qty"]) }, { trigger: "combined", kind: "trades" }), "account,date,ticker,qty");
  assert.equal(expectedHeader(FIVE, { trigger: "combined", kind: "valuations" }), null, "no Combined entry of another kind");
  if (fs.existsSync(EXPORT)) {
    const P = Object.assign({}, require(EXPORT));
    // The per-account trades writer has no account column: a Combined trades entry written with
    // it does not have the expected header.
    assert.notEqual(expectedHeader(P, { trigger: "combined", kind: "trades" }), P.tradesCsv([], null, null).split("\n")[0]);
    assert.equal(expectedHeader(P, { trigger: "combined", kind: "trades" }), P.combinedTradesCsv([]).split("\n")[0]);
  }
});

test("no expectation for QIF, zips, disabled records and unknown kinds", () => {
  assert.equal(expectedHeader(FIVE, { trigger: "card", kind: "qif", mode: "balance" }), null);
  assert.equal(expectedHeader(FIVE, { trigger: "zip", type: "application/zip", files: [] }), null);
  assert.equal(expectedHeader(FIVE, { trigger: "combined", type: "application/zip", files: [] }), null);
  assert.equal(expectedHeader(FIVE, { trigger: "accounts", disabled: true }), null);
  assert.equal(expectedHeader(FIVE, { trigger: "card", kind: "other", mode: "balance" }), null);
});

test("holdings mode: the account decides which writer made a transactions file", () => {
  const mixed = { ...FIVE, adjustedCsv: () => csv(["date", "amount", "currency", "name", "notes", "extra"]) };
  const result = { accounts: { Fund: { kind: "investment" }, Savings: { kind: "bank" }, Pot: { kind: "cash" } } };
  const h = (account, kindModel) => expectedHeader(mixed, { trigger: "card", kind: "transactions", mode: "holdings", account, result, kindModel });
  assert.equal(h("Fund"), "date,amount,currency,name,notes", "an investment exports with holdings");
  assert.equal(h("Savings"), "date,amount,currency,name,notes,extra", "standard: non-investments export as balance");
  assert.equal(h("Savings", "investment-cash"), "date,amount,currency,name,notes", "investment-cash: only cash is forced to balance");
  assert.equal(h("Pot", "investment-cash"), "date,amount,currency,name,notes,extra");
  assert.equal(expectedHeader(mixed, { trigger: "card", kind: "transactions", mode: "holdings" }), null, "ambiguous without the account");
  assert.equal(expectedHeader(FIVE, { trigger: "card", kind: "transactions", mode: "holdings" }), "date,amount,currency,name,notes", "not ambiguous when both writers agree");
  assert.equal(effectiveMode("tradelog", result, "Fund"), "tradelog");
  assert.equal(effectiveMode("tradelog", result, "Nobody"), null);
});

test("writers get a fresh, writable empty account", () => {
  const P = { ...FIVE, adjustedCsv: (a) => { a.cash.sort(); a.cash.push(1); return csv(["date"]); } };
  assert.equal(expectedHeader(P, { trigger: "card", kind: "transactions", mode: "balance" }), "date");
  assert.equal(expectedHeader(P, { trigger: "card", kind: "transactions", mode: "balance" }), "date");
});
