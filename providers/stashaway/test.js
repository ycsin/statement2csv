// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Harness hooks of the StashAway statement app (docs/CONTRACT.md, test.js hooks). Node only:
// never inlined into a page. A statement app gets parse, downloads and expectedHeader from the
// core, so this file holds one hook: `reference`, the old repository's test/compare.js ported
// to the harness (--reference <file>, docs/TESTING.md). It compares a parse result with a
// reference parse checked by hand against the same statements, kept private:
//   { accounts: { <name>: { valuations: [[date, value]...], trades: [...], cash: [...] } },
//     names?: { <result name>: <reference name> },   // the old map file's name translation
//     config?: { <portfolio id>: {...} } }           // the old map file's config
// The harness parses with its own config (ctx.config), so the result is no longer parsed here;
// a `config` in the file must equal that config, otherwise the comparison would be run on a
// result the reference was not written for. As in compare.js: every reference account needs a
// result account and every result account a reference one; per account, valuations
// (date|value), trades (date|ticker|qty|price|currency) and cash rows (date|amount|currency|
// name) must be equal as multisets, numbers written with 6 decimals; each difference lists up
// to 5 rows per side. The old informational lines (statement count, errors, gaps, unmapped,
// skipped, balancing count) are left to the harness. Returned lines name accounts, dates and
// amounts: callers keep them private.
"use strict";

const fs = require("fs");

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);

// compare.js:26 (a row that is not an object reads as an empty one, so a damaged reference file
// gives differences instead of a TypeError)
const key = (row, fields) => {
  const o = isObj(row) ? row : {};
  return fields.map((f) => (typeof o[f] === "number" ? o[f].toFixed(6) : o[f])).join("|");
};

// compare.js:28-41, with the printed lines returned as problems
function diffMultiset(what, a, b) {
  const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(a), cb = count(b);
  const onlyA = [], onlyB = [];
  for (const [k, n] of ca) for (let i = 0; i < n - (cb.get(k) || 0); i++) onlyA.push(k);
  for (const [k, n] of cb) for (let i = 0; i < n - (ca.get(k) || 0); i++) onlyB.push(k);
  if (!onlyA.length && !onlyB.length) return [];
  return [
    `${what}: ${onlyA.length} only in the result, ${onlyB.length} only in the reference`,
    ...onlyA.slice(0, 5).map((k) => `${what}: result: ${k}`),
    ...onlyB.slice(0, 5).map((k) => `${what}: reference: ${k}`),
  ];
}

// Key order does not matter when two configs are compared.
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}

module.exports = {
  // -> string[]: empty when the result equals the reference (compare.js's "IDENTICAL").
  reference(result, refPath, ctx) {
    let ref;
    try {
      ref = JSON.parse(fs.readFileSync(refPath, "utf8"));
    } catch (e) {
      return [e instanceof SyntaxError ? "the reference file is not valid JSON" : `the reference file cannot be read (${e.code || e.name})`];
    }
    if (!isObj(ref) || !isObj(ref.accounts)) return ["the reference file has no accounts object"];
    if (ref.names !== undefined && !isObj(ref.names)) return ["the reference file's names must be an object"];
    if (ref.config !== undefined && canonical(ref.config) !== canonical(ctx && ctx.config != null ? ctx.config : {})) {
      return ["the reference file's config differs from the config the result was parsed with"];
    }
    if (!result || !isObj(result.accounts)) return ["no result to compare (no statement was parsed)"];
    const problems = [];
    const py = ref.accounts;
    const names = ref.names || {};
    const ours = Object.keys(result.accounts);
    const toRef = (n) => (Object.prototype.hasOwnProperty.call(names, n) ? names[n] : n) || n;
    const missing = Object.keys(py).filter((n) => !ours.some((o) => toRef(o) === n));
    if (missing.length) problems.push(`reference accounts with no match: ${missing.join(", ")}`);
    for (const name of ours) {
      const a = isObj(result.accounts[name]) ? result.accounts[name] : {};
      const b =Object.prototype.hasOwnProperty.call(py, toRef(name)) ? py[toRef(name)] : undefined;
      if (!isObj(b)) {
        problems.push(`${name}: not in reference`);
        continue;
      }
      problems.push(...diffMultiset(`${name} valuations`, list(a.valuations).map((v) => list(v).join("|")), list(b.valuations).map((v) => list(v).join("|"))));
      problems.push(...diffMultiset(`${name} trades`, list(a.trades).map((t) => key(t, ["date", "ticker", "qty", "price", "currency"])),
        list(b.trades).map((t) => key(t, ["date", "ticker", "qty", "price", "currency"]))));
      problems.push(...diffMultiset(`${name} cash`, list(a.cash).map((c) => key(c, ["date", "amount", "currency", "name"])),
        list(b.cash).map((c) => key(c, ["date", "amount", "currency", "name"]))));
    }
    return problems;
  },
};
