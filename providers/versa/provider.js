// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Descriptor of the AHAM Capital (Versa) statement app (docs/CONTRACT.md, descriptor). Plain
// data only. The id and URL are "versa"; the storage keys, brand and slug stay those of the old
// page ("aham", "AHAM"), as frozen.js records. Every account is an investment account holding
// its funds, so the mode switch shows and all three modes are real. The skip labels and the two
// card notes are the old page's own (docs/MIGRATION.md); everything else takes the defaults.
// Page copy is in page.html.
module.exports = {
  contract: 1,
  id: "versa",
  name: "Versa",
  summary: "AHAM Capital (Versa) Statement of Account PDFs, one investment account per account number and fund currency",
  inputs: ["pdf"],
  uses: ["layout"],
  parserGlobal: "AhamParser",
  storage: { modeKey: "aham-csv-mode", configKey: "aham-csv-accounts" },
  naming: { brand: "AHAM", slug: "aham" },
  ui: {
    skipLabels: {
      "no amount": "Rows the statement printed without an amount",
      "trade in cash-like account": "Buys and sells in funds set to cash-like",
      "trade without qty/price": "Buys/sells without units or price",
      "payout paid into savings": "Fund payouts (exported in Savings, where the cash arrived)",
      "unknown": "Unrecognised transaction types (not exported; please report)",
    },
    notes: {
      other: "One file: investments, redemptions and reinvested income, plus a monthly returns adjustment that puts the balance on the month-end value (units × latest unit price on the statement).",
      tradelog: "One file, as Balance only, plus every purchase and sale of units as a zero-amount line with units and price.",
    },
  },
};
