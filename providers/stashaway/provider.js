// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Descriptor of the StashAway statement app (docs/CONTRACT.md, descriptor). Plain data only.
// One account per portfolio. The parser keeps its own export layer: it replaces the 11 core
// export functions the app calls (exportOverrides, a closed set), so the app's namespace holds
// the parser's writers exactly as the old page's did. Each PDF page is turned into text as it
// is read (pdf.pageTransform). The storage keys and naming are the old page's ("portfolios",
// the "-portfolios" config key), as frozen.js records. The legacy block reproduces the old
// page: the "gen1" wording and status, only "cash" portfolios forced to Balance only, tags and
// "Auto" labels Investment or Cash-like, unrecognised portfolios listed in the status, skipped
// rows owned by their portfolio, and a mode switch that never hides (docs/MIGRATION.md).
// Page copy is in page.html; test.js holds the hand-checked reference comparison.
module.exports = {
  contract: 1,
  id: "stashaway",
  name: "StashAway",
  summary: "StashAway monthly statement PDFs, one set of files per portfolio",
  inputs: ["pdf"],
  parserGlobal: "StashParser",
  exportOverrides: ["qif", "inRange", "tradesCsv", "transactionsCsv", "valuationsCsv", "adjustedEntries", "adjustedCsv",
    "openingBalance", "accountsCsv", "combinedTradesCsv", "combinedTransactionsCsv"],
  pdf: { pageTransform: "itemsToPageText" },
  storage: { modeKey: "stashaway-csv-mode", configKey: "stashaway-csv-portfolios" },
  naming: { accountPrefix: "StashAway ", brand: "StashAway", groupNoun: "portfolios", slug: "stashaway" },
  ui: {
    skipLabels: {
      "fx conversion (internal)": "Currency conversions inside a portfolio",
      "fixed-deposit placement (internal)": "Fixed-term placements and redemptions inside a portfolio",
      "no amount": "Rows the statement printed without an amount",
      "trade in cash-like account": "Fund switches in cash-like portfolios",
      "trade without qty/price": "Buys/sells without units or price",
      "unknown": "Unrecognised transaction types (not exported; please report)",
    },
  },
  legacy: {
    preset: "gen1",
    kindModel: "investment-cash",
    hideModeWithoutInvestments: false,
    extraWarnings: "unmapped",
    unmappedNoun: "portfolio",
    skippedOwner: "portfolio",
  },
};
