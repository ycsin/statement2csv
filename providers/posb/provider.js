// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Descriptor of the POSB / DBS statement app (docs/CONTRACT.md, descriptor). Plain data only.
// It reads statement PDFs and transaction history CSVs: the inputs are in the old picker's
// accept order, and the app always tries the CSV reader first. The status counts statements
// and downloads apart, the diagnostics add the section on closed accounts, rows not settled
// yet are listed per description, and the skip labels and the two warning texts are the old
// page's own (docs/MIGRATION.md). The storage keys and slug take the id defaults, as frozen.js
// records; the card notes are the defaults, the download-only bank note included. Page copy is
// in page.html.
module.exports = {
  contract: 1,
  id: "posb",
  name: "POSB",
  summary: "POSB and DBS monthly statement PDFs and transaction history CSVs, one account per deposit account and currency",
  inputs: ["pdf", "csv"],
  uses: ["layout"],
  parserGlobal: "PosbParser",
  naming: { brand: "POSB" },
  ui: {
    status: "statements+downloads",
    diagnostics: ["gaps", "late", "closed"],
    skipDetailed: ["unknown", "no amount", "not settled"],
    skipLabels: {
      "no amount": "Rows the statement printed without an amount",
      "trade in cash-like account": "Buys and sells in funds set to cash-like",
      "trade without qty/price": "Buys/sells without units or price",
      "payout paid into savings": "Fund payouts (exported in Savings, where the cash arrived)",
      "not settled": "Transactions not settled yet when downloaded (not in the ledger balance; download again once they settle)",
      "unknown": "Unrecognised transaction types (not exported; please report)",
    },
    text: {
      gapWarning: "Each account bridges the gap with one “not covered by statements” entry, so later balances stay right, but that month’s individual transactions are missing. Add the missing PDF (or a transaction history download that reaches back that far) to fix this.",
      partialWarning: "don't list some of your accounts (DBS sometimes sends a separate statement, e.g. one with only SRS). Those accounts bridge the gap the same way; add the other statement for those months if you have it.",
    },
  },
};
