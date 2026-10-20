// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Descriptor of the Chocolate Finance statement app (docs/CONTRACT.md, descriptor). Plain data
// only. One bank-like account per currency, reconciled each month. The parser runs on its own
// layout copy (layout.js sets MariLayout), so that file is inlined before parser.js. The
// storage keys, slug and group noun are the defaults, which frozen.js records; the account
// prefix and brand are the old page's. The skip labels are the old page's own five; the
// "gen1" preset gives the old page's wording, status line and balancing-entries section, and
// the mode switch keeps hiding while no account is an investment (docs/MIGRATION.md).
// Page copy is in page.html.
module.exports = {
  contract: 1,
  id: "chocolate",
  name: "Chocolate",
  summary: "Chocolate Finance monthly account statement PDFs, one account per currency",
  inputs: ["pdf"],
  scripts: ["layout.js", "parser.js"],
  parserGlobal: "ChocParser",
  naming: { accountPrefix: "Chocolate ", brand: "Chocolate" },
  ui: {
    skipLabels: {
      "no amount": "Rows the statement printed without an amount",
      "trade in cash-like account": "Buys and sells in funds set to cash-like",
      "trade without qty/price": "Buys/sells without units or price",
      "payout paid into savings": "Fund payouts (exported in Savings, where the cash arrived)",
      "unknown": "Unrecognised transaction types (not exported; please report)",
    },
  },
  legacy: { preset: "gen1" },
};
