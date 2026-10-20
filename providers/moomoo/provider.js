// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Descriptor of the moomoo statement app (docs/CONTRACT.md, descriptor). Plain data only.
// One of the four oldest pages: the gen1 preset gives their busy text, status count (months),
// first openings in the base currency, balancing-entries diagnostics and gap warning. Unlike
// the reference app, the mode switch never hides. File names carry the "moomoo " account
// prefix, and the skip labels are the old page's own three (docs/MIGRATION.md). The storage
// keys and slug take the id defaults, as frozen.js records. Page copy is in page.html.
module.exports = {
  contract: 1,
  id: "moomoo",
  name: "moomoo",
  summary: "moomoo monthly account statement PDFs, one account per currency for securities and cash, and one per fund",
  inputs: ["pdf"],
  uses: ["layout"],
  parserGlobal: "MooParser",
  naming: { accountPrefix: "moomoo ", brand: "moomoo" },
  ui: {
    skipLabels: {
      "no amount": "Rows the statement printed without an amount",
      "trade in cash-like account": "Buys and sells in accounts set to cash-like",
      "unknown": "Unrecognised transaction types (not exported; please report)",
    },
  },
  legacy: { preset: "gen1", hideModeWithoutInvestments: false },
};
