// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Contract constants (docs/CONTRACT.md, contract 1). Node only: never inlined into a page.
// The browser copies in core/app/statement-app.js are literal constants that a unit test
// compares with these. Every text is copied character for character from the old pages,
// typographic quotes included.
"use strict";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

const CONTRACT_VERSION = 1;

// The three export modes of a statement app, in button order; the first is the default.
const LEDGER_MODES = [
  { id: "balance", label: "Balance only" },
  { id: "tradelog", label: "Balance + trade log" },
  { id: "holdings", label: "With holdings" },
];

// What the configurator's Type select may write. Never "bank": an old page would let such
// an account follow the global mode.
const CONFIG_KINDS = ["", "investment", "cash"];

// Cash entry kinds made by the export layer; a parser never uses them.
const RESERVED_KINDS = ["adjustment", "gap", "trade"];

const KIND_LABEL = { investment: "Investment", cash: "Cash-like", bank: "Bank" };

// The 19 functions core/export.js returns.
const CORE_EXPORT_NAMES = [
  "qif", "round2", "pad", "monthGaps", "prevMonth", "lastDayOf", "dayBefore", "inRange",
  "tradesCsv", "transactionsCsv", "valuationsCsv", "adjustedEntries", "adjustedCsv",
  "openingBalance", "accountsCsv", "combinedTradesCsv", "combinedTransactionsCsv", "csvCell", "csv",
];

// The core export functions the statement app calls on P (besides parseStatements and the
// page transform). Overrides must be closed over these (C08b).
const APP_CALLED_EXPORTS = [
  "inRange", "adjustedEntries", "openingBalance", "qif", "adjustedCsv", "tradesCsv",
  "transactionsCsv", "valuationsCsv", "accountsCsv", "combinedTradesCsv", "combinedTransactionsCsv",
];

const DEFAULT_SKIP_LABELS = {
  "no amount": "Rows the statement printed without an amount",
  "trade in cash-like account": "Buys and sells in accounts set to cash-like",
  "trade without qty/price": "Buys/sells without units or price",
  "unknown": "Unrecognised transaction types (not exported; please report)",
};

// Runtime `ui` defaults, in the key order of the runtime object.
const DEFAULT_UI = {
  busyNoun: "file",
  kindModel: "standard",
  hideModeWithoutInvestments: true,
  status: "statements",
  openingsCurrency: "account",
  extraWarnings: "warnings",
  unmappedNoun: "account",
  diagnostics: ["gaps", "late"],
  skippedOwner: "account",
  skipDetailed: ["unknown", "no amount"],
  skipLabels: DEFAULT_SKIP_LABELS,
  notes: {
    bank: "Every transaction, checked against the statement's starting and ending balance each month.",
    bankDownloadOnly: "Every transaction from the download, with balances worked back from its ledger balance.",
    other: "One file. A monthly returns adjustment puts the running balance on each statement's closing value.",
    tradelog: "One file, as Balance only, plus every buy and sell as a zero-amount line with units and price.",
    holdings: "Trades and cash in separate files; month-end balances to record as balance updates.",
  },
  text: {
    gapWarning: "Each account bridges the gap with one “not covered by statements” entry, so later balances stay right, but that month’s individual transactions are missing. Add the missing PDF to fix this.",
    partialWarning: "are missing for some of your accounts. Those accounts bridge the gap the same way; add their statements for those months if you have them.",
    downloadNoun: "transaction history download",
  },
};

// legacy.preset "gen1": the wording and status of the four oldest pages.
const GEN1_PRESET = {
  busyNoun: "statement",
  status: "months",
  openingsCurrency: "base",
  diagnostics: ["reconciled"],
  text: {
    gapWarning: "Balance-only files bridge the gap with one “not covered by statements” entry, so later balances stay right, but that month’s individual transactions are missing. With holdings, its trades are missing too, so unit counts stay off from then on. Add the missing PDF to fix this.",
  },
};

// Allowed values of the legacy knobs (accepted only with frozen.legacyRepo, C06).
// "string" means any string; diagnostics is checked separately.
const LEGACY_KNOBS = {
  preset: ["gen1"],
  busyNoun: ["statement"],
  status: ["months"],
  openingsCurrency: ["base"],
  diagnostics: "diagnostics",
  hideModeWithoutInvestments: [false],
  kindModel: ["investment-cash"],
  extraWarnings: ["unmapped"],
  unmappedNoun: "string",
  skippedOwner: ["portfolio"],
};

const RESERVED_IDS = ["all"];

// What frozen.js may and must hold, per app type (docs/CONTRACT.md, frozen.js).
//   configurator: true  -> storage.configKey a string, configKinds = CONFIG_KINDS,
//                          configIdPattern a regex source;
//                 false -> all three are null.
//   kindModel: "legacy" -> required with legacyRepo, otherwise optional and "standard";
//              "absent" -> must not be present.
const FROZEN_SCHEMA = {
  common: ["storage", "modeValues", "configKinds", "configIdPattern", "naming"],
  legacy: ["legacyRepo", "legacyUrl", "legacyHead", "legacyIndexSha256", "legacyDom"],
  types: {
    statement: {
      configurator: true,
      naming: { required: ["accountPrefix", "brand", "groupNoun", "slug"], optional: [] },
      kindModel: "legacy",
    },
    custom: {
      configurator: false,
      naming: { required: ["slug"], optional: ["accountPrefix", "brand", "groupNoun"] },
      kindModel: "absent",
    },
    "custom-config": {
      configurator: true,
      naming: { required: ["slug"], optional: ["accountPrefix", "brand", "groupNoun"] },
      kindModel: "absent",
    },
  },
  kindModels: ["standard", "investment-cash"],
  legacyDomKeys: ["list", "row", "count", "reset"],
};

module.exports = deepFreeze({
  CONTRACT_VERSION,
  LEDGER_MODES,
  CONFIG_KINDS,
  RESERVED_KINDS,
  KIND_LABEL,
  CORE_EXPORT_NAMES,
  APP_CALLED_EXPORTS,
  DEFAULT_SKIP_LABELS,
  DEFAULT_UI,
  GEN1_PRESET,
  LEGACY_KNOBS,
  RESERVED_IDS,
  FROZEN_SCHEMA,
});
