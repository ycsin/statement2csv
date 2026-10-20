// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The CSV header line each statement-app download must start with (harness H8), derived
// from the composed namespace P, so a provider that overrides a writer (exportOverrides)
// gets its own header with no test edit. Node only: never inlined.
//
//   expectedHeader(P, {trigger, kind, mode, type, files, account, result, kindModel})
//     -> string | null
//
// The header is the first line the composed writer produces on empty input. null means
// "no expectation": QIF files, zips, unknown kinds, and a holdings-mode transactions file
// whose writer cannot be told without the account (see below).
//
// A zip has no header of its own, but the entries of the Combined zip do. The harness describes
// each entry as {trigger: "combined", kind: "trades" | "transactions"}, the kind its name gives
// (core/files.js names them "<brand> all <groupNoun> - <kind> - <span>.csv"): trades come from
// P.combinedTradesCsv and transactions from P.combinedTransactionsCsv. The Combined record
// itself has kind null; as one CSV it is the transactions file.
//
// `mode` is the mode the card's account exports in. A card's transactions file comes from
// P.adjustedCsv in balance and tradelog modes and from P.transactionsCsv in holdings mode,
// but accounts that are not investments always export as balance. Pass `result` (and
// `kindModel`, default "standard") with the download's `account` to apply that rule here;
// without them, a holdings-mode transactions file is checked only if both writers agree.
"use strict";

// A fresh empty account per call, so a writer that sorts in place cannot hit a frozen array.
const emptyAccount = () => ({ kind: "investment", currency: "", months: {}, valuations: [], trades: [], cash: [] });

const firstLine = (text) => String(text).split("\n")[0];

const WRITERS = {
  adjusted: (P, mode) => P.adjustedCsv(emptyAccount(), null, null, null, mode === "tradelog"),
  transactions: (P) => P.transactionsCsv([], null, null),
  trades: (P) => P.tradesCsv([], null, null),
  valuations: (P) => P.valuationsCsv([], null, null, ""),
  accounts: (P) => P.accountsCsv([]),
  combinedTransactions: (P) => P.combinedTransactionsCsv([]),
  combinedTrades: (P) => P.combinedTradesCsv([]),
};

function header(P, writer, mode) {
  return firstLine(WRITERS[writer](P, mode));
}

// The mode an account exports in (StatementFiles.modeOf): standard -> kind !== "investment"
// is balance; investment-cash -> kind === "cash" is balance.
function effectiveMode(mode, result, account, kindModel = "standard") {
  const a = result && result.accounts && account != null ? result.accounts[account] : null;
  if (!a) return null;
  const forced = kindModel === "investment-cash" ? a.kind === "cash" : a.kind !== "investment";
  return forced ? "balance" : mode;
}

function expectedHeader(P, d = {}) {
  const { trigger, kind, type, files } = d;
  if (type === "application/zip" || Array.isArray(files) || d.disabled) return null;
  if (trigger === "accounts") return header(P, "accounts");
  if (trigger === "combined") {
    if (kind === "trades") return header(P, "combinedTrades");
    return kind === null || kind === undefined || kind === "transactions" ? header(P, "combinedTransactions") : null;
  }
  if (trigger !== "card") return null;
  let mode = d.mode;
  const eff = effectiveMode(mode, d.result, d.account, d.kindModel);
  if (eff) mode = eff;
  if (kind === "qif") return null;
  if (kind === "trades") return header(P, "trades");
  if (kind === "valuations") return header(P, "valuations");
  if (kind !== "transactions") return null;
  if (mode !== "holdings") return header(P, "adjusted", mode);
  if (eff) return header(P, "transactions");
  // holdings without the account: either writer may have made it.
  const a = header(P, "adjusted", "balance"), t = header(P, "transactions");
  return a === t ? t : null;
}

module.exports = { expectedHeader, effectiveMode };
