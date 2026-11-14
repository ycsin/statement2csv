// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Descriptor (docs/CONTRACT.md, descriptor): plain data only, no functions and no require.
// Made by tools/new-provider.js from providers/_template-pdf/. The storage keys, the zip
// slug and the brand are the defaults that follow from the id and the name; frozen.js records
// them. The parser replaces two writers (exportOverrides): the Accounts CSV gives each card
// account's type as "Credit Card" and its balance as the amount owed, and the QIF is of type
// CCard with the amount owed as its opening balance.
module.exports = {
  contract: 1,
  id: "hsbc-sg-creditcard",
  name: "HSBC SG Credit Card",
  summary: "HSBC Singapore credit card statement PDFs, one card account per statement",
  inputs: ["pdf"],
  uses: ["layout", "assemble"],
  parserGlobal: "HsbcSgCreditcardParser",
  exportOverrides: ["accountsCsv", "qif"],
  testing: { fixtures: "fixtures" },
};
