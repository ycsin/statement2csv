// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// File assembly of the custom xlsx app (docs/ARCHITECTURE.md, the custom app's files module):
// the one account's files, the zip name, and the downloads hook (docs/CONTRACT.md) that lists
// every download the page offers for a state. Pure: it reads only what ctx returns, and never
// touches the DOM, storage or the clock. The app's click handlers and the harness hooks
// (test.js) both call it, so replay sees exactly the files the page offers.
// Works in the browser (self.EtoroFiles) and in Node (module.exports). The Node branch requires
// nothing: the composed namespace arrives as ctx.P, so test.js can hand it the old parser or
// the new one.
//
//   const F = EtoroFiles.create({ P, result, range, naming })
//     P          the composed namespace, Object.assign({}, StatementExport, parser)
//     result()   the current result ({account, period, months, ...}, never an {error});
//                non-null whenever a method other than downloads() runs
//     range()    {from, to}, already swapped so that from <= to
//     naming     only naming.slug is read
//   F.span, files, zipName, downloads
//
// Derivation. Line numbers are those of the old page's src/app.js at frozen.legacyHead
// (docs/MIGRATION.md). The moved lines are verbatim, one level deeper inside create, apart from
// state.result -> result() and the zip name's slug:
//   span       :67 (range is ctx.range)
//   files      :70-83; out stays in the order transactions, QIF (spliced in at index 1),
//              balances, accounts
//   zipName    the name of :153 with naming.slug for the literal slug, the same string; it uses
//              span(), so it collapses for one month
// A new pure function that restates the page's rules (replay checks it against every golden):
//   downloads  render's card rule, :99-105: one card iff there are entries in range, with one
//              button per element of out, in out order; the card click of :147-152 downloads
//              the element of the button's kind (kinds are unique in out) as a text/csv Blob,
//              the QIF too; then #zip, :106 and :153: enabled iff out is not empty, also with
//              no card (anchors but no entries in range give out = [balances]), and a zip of
//              out. [] without a result (#results hidden)
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.EtoroFiles = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function create(ctx) {
    if (!ctx || typeof ctx !== "object") throw new TypeError("EtoroFiles.create needs a context object");
    const { P, result, range, naming } = ctx;
    if (!P || typeof P !== "object") throw new TypeError("EtoroFiles.create: ctx.P must be the composed namespace");
    for (const [k, f] of [["result", result], ["range", range]]) {
      if (typeof f !== "function") throw new TypeError(`EtoroFiles.create: ctx.${k} must be a function`);
    }
    if (!naming || typeof naming !== "object" || typeof naming.slug !== "string") {
      throw new TypeError("EtoroFiles.create: ctx.naming needs the string slug");
    }

    const span = () => { const { from, to } = range(); return from === to ? from : `${from}_to_${to}`; };

    // ---------- the account's files ----------
    function files() {
      const a = result().account;
      const { from, to } = range();
      const entries = a.entries.filter((e) => P.inRange(e.date, from, to));
      const anchors = a.anchors.filter((x) => P.inRange(x.date, from, to));
      const out = [];
      if (entries.length) out.push({ kind: "transactions", label: "Transactions CSV", name: `${a.name} - transactions - ${span()}.csv`, text: P.transactionsCsv(a.entries, from, to), count: entries.length });
      if (anchors.length) out.push({ kind: "balances", label: "Balances CSV", name: `${a.name} - balances - ${span()}.csv`, text: P.valuationsCsv(anchors.map((x) => [x.date, x.total]), from, to, a.currency), count: anchors.length });
      const start = P.openingBalance(a, from, to);
      // One QIF with the starting balance as its "Opening Balance" record.
      if (entries.length) out.splice(1, 0, { kind: "qif", label: "QIF", name: `${a.name} - ${span()}.qif`, text: P.qif(entries, start, a.name), count: entries.length });
      if (start) out.push({ kind: "accounts", label: "Accounts CSV", name: `${a.name} accounts - ${span()}.csv`, text: P.accountsCsv([{ type: "Investment", name: a.name, currency: a.currency, ...start }]), count: 1 });
      return { out, entries, anchors, start };
    }

    // Download all's name: "<slug>-csv-<span>.zip", collapsed for one month like every name.
    const zipName = () => `${naming.slug}-csv-${span()}.zip`;

    // ---------- the page's card and #zip, as data ----------
    const entry = ({ name, text }) => ({ name, text });

    // The downloads hook, in the page driver's click order: the card's buttons, then #zip.
    function downloads() {
      if (!result()) return [];
      const { out, entries } = files();
      const list = [];
      if (entries.length) {
        for (const f of out) list.push({ trigger: "card", account: null, kind: f.kind, name: f.name, type: "text/csv", text: f.text });
      }
      list.push(out.length
        ? { trigger: "zip", account: null, kind: null, name: zipName(), type: "application/zip", files: out.map(entry) }
        : { trigger: "zip", account: null, kind: null, disabled: true });
      return list;
    }

    return { span, files, zipName, downloads };
  }

  return { create };
});
