// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Descriptor of the Maybank statement app (docs/CONTRACT.md, descriptor). Plain data only.
// The storage keys and slug take the id defaults, as frozen.js records; the brand is written
// out. The skip labels are the old page's own six (docs/MIGRATION.md): pre-authorisation pairs
// refunded in the same statement are labelled but not listed per description, so the
// diagnostics only count them. Everything else takes the defaults, which are this page's card
// notes, warning texts and diagnostics sections. Page copy is in page.html.
module.exports = {
  contract: 1,
  id: "maybank",
  name: "Maybank",
  summary: "Maybank account statement PDFs",
  inputs: ["pdf"],
  uses: ["layout"],
  parserGlobal: "MaybankParser",
  naming: { brand: "Maybank" },
  ui: {
    skipLabels: {
      "no amount": "Rows the statement printed without an amount",
      "trade in cash-like account": "Buys and sells in funds set to cash-like",
      "trade without qty/price": "Buys/sells without units or price",
      "payout paid into savings": "Fund payouts (exported in Savings, where the cash arrived)",
      "refunded pre-authorisation": "Card pre-authorisations refunded in the same statement (each hold and its refund; they cancel out)",
      "unknown": "Unrecognised transaction types (not exported; please report)",
    },
  },
};
