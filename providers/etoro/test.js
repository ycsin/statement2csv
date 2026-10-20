// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Harness hooks of the custom xlsx app (docs/CONTRACT.md, test.js hooks). Node only: never
// inlined into a page. Every hook reaches the parser through ctx.P only, so the same hooks serve
// replay with the old parser and with the new one. ctx = {P, R, mode, config, from, to}, with
// from <= to as the page's range() returns them.
"use strict";

const EtoroFiles = require("./files.js");

// What the app's recompute() leaves in state.result: null without a workbook, and null for an
// {error} result (the page then shows the error and no results).
const shown = (result) => (result && result.error ? null : result);

module.exports = {
  // As recompute(): the one workbook parsed with the mode as its group; null when nothing was
  // read (no file yet, after Clear, or a file the reader failed on). May return {error}.
  parse(statements, ctx) {
    const s = statements && statements[0];
    return s && s.workbook ? ctx.P.parseWorkbook(s.workbook, { group: ctx.mode }) : null;
  },

  // The downloads hook (docs/CONTRACT.md): the files module on the page's state.
  downloads(result, ctx) {
    const r = shown(result);
    return EtoroFiles.create({ P: ctx.P, result: () => r, range: () => ({ from: ctx.from, to: ctx.to }), naming: ctx.R.naming }).downloads();
  },

  // The running balance equals total equity at every anchor (the old reconcile test's check),
  // for the result of ctx.mode. Lines name dates and amounts: callers keep them private.
  reconcile(result, ctx) {
    if (!result) return [];
    if (result.error) return [`${ctx.mode}: ${result.error}`];
    const a = result.account;
    const problems = [];
    for (const x of a.anchors) {
      const b = ctx.P.balanceOn(a, x.date);
      if (Math.abs(b - x.total) >= 0.005) problems.push(`${ctx.mode}: ${x.date} balance ${b} != total equity ${x.total}`);
    }
    return problems;
  },

  // The header line of a card's CSV: the first line its writer gives on empty input. null for
  // the QIF (served as text/csv too), the zip and a disabled trigger.
  expectedHeader(download, ctx) {
    if (!download || download.disabled || download.trigger !== "card" || download.type === "application/zip") return null;
    const first = (text) => String(text).split("\n")[0];
    if (download.kind === "transactions") return first(ctx.P.transactionsCsv([], null, null));
    if (download.kind === "balances") return first(ctx.P.valuationsCsv([], null, null, ""));
    if (download.kind === "accounts") return first(ctx.P.accountsCsv([]));
    return null;
  },
};
