// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// core/contract/callgraph.js: the export call graph derived from source. The graph of the
// pinned core/export.js is pinned here, so a scanner regression fails CI.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { exportCallGraph, blank } = require("../../core/contract/callgraph.js");
const { validate } = require("../../core/contract/descriptor.js");

const EXPORT = path.resolve(__dirname, "..", "..", "core", "export.js");

// docs/CONTRACT.md: the graph of the pinned export layer. num is internal (not exported).
const PINNED = {
  adjustedCsv: ["adjustedEntries", "csv"],
  adjustedEntries: ["inRange", "lastDayOf", "num", "prevMonth", "round2"],
  openingBalance: ["dayBefore", "inRange", "lastDayOf", "prevMonth", "round2"],
  prevMonth: ["pad"],
  lastDayOf: ["pad"],
  monthGaps: ["pad"],
  tradesCsv: ["csv", "inRange", "num"],
  transactionsCsv: ["csv", "inRange"],
  valuationsCsv: ["csv", "inRange"],
  accountsCsv: ["csv"],
  combinedTransactionsCsv: ["csv"],
  combinedTradesCsv: ["csv", "num"],
  csv: ["csvCell"],
  round2: [], pad: [], csvCell: [], num: [], inRange: [], dayBefore: [], qif: [],
};
const sorted = (g) => Object.fromEntries(Object.keys(g).sort().map((k) => [k, [...g[k]].sort()]));

test("the pinned core/export.js gives the documented graph", { skip: fs.existsSync(EXPORT) ? false : "core/export.js is not in the tree yet" }, () => {
  const g = exportCallGraph(fs.readFileSync(EXPORT, "utf8"));
  assert.deepEqual(sorted(g), sorted(PINNED));
});

const umd = (body) => `(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Synthetic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
${body}
  return {};
});
`;

test("whole identifiers only; comments, strings, regexes and template text are ignored", () => {
  const g = exportCallGraph(umd(`
  const pad = (n) => String(n).padStart(2, "0");
  const csv = (rows) => rows.join("\\n");
  // pad( csv( in a comment are not uses
  /* neither is pad here */
  function label(m) { return \`pad \${pad(m)} csv\` + "pad(" + 'csv('; }
  function quoting(s) { return /pad"csv/.test(s) ? \`"\${s.replace(/"/g, '""')}"\` : s; }
  function divide(a, b) { return (a) / 2 / (b) + pad(1); }
  function nested(x) { return \`\${x ? \`\${csv([x])}\` : ""}\`; }
  function padded() { return 1; }
  const twoA = 1, twoB = (x) => pad(x);
`));
  assert.deepEqual(g.label, ["pad"], "a call inside a template interpolation counts");
  assert.deepEqual(g.quoting, [], "regex literal and template text with quotes are not code");
  assert.deepEqual(g.divide, ["pad"], "division is not a regex");
  assert.deepEqual(g.nested, ["csv"], "nested templates");
  assert.deepEqual(g.padded, [], "padded is not pad");
  assert.deepEqual(g.twoA, []);
  assert.deepEqual(g.twoB, ["pad"], "comma-separated declarators");
  assert.deepEqual(Object.keys(g), ["pad", "csv", "label", "quoting", "divide", "nested", "padded", "twoA", "twoB"]);
});

test("over-approximation: aliases, shadowing locals and object keys count; property accesses do not", () => {
  const g = exportCallGraph(umd(`
  const pad = (n) => String(n);
  const alias = pad;
  function viaAlias() { return alias(1); }
  function shadow() { const pad = 2; return pad; }
  function property(o) { return o.pad(1) + o?.pad + o. pad; }
  function key() { return { pad: 1 }; }
  function spread(xs) { return [...pad]; }
`));
  assert.deepEqual(g.alias, ["pad"]);
  assert.deepEqual(g.viaAlias, ["alias"], "reaches pad through the alias");
  assert.deepEqual(g.shadow, ["pad"], "a shadowing local counts (stricter)");
  assert.deepEqual(g.property, [], "o.pad, o?.pad and o. pad are property accesses");
  assert.deepEqual(g.key, ["pad"], "an object key counts (stricter)");
  assert.deepEqual(g.spread, ["pad"], "a spread is a use");
});

test("C08b with a derived graph: overriding only pad is not closed", () => {
  const src = umd(`
  const pad = (n) => String(n).padStart(2, "0");
  function prevMonth(m) { return \`\${m}-\${pad(1)}\`; }
  function adjustedEntries(a) { return prevMonth(a); }
  function adjustedCsv(a) { return adjustedEntries(a); }
  function qif() { return ""; }
`);
  const callGraph = exportCallGraph(src);
  const D = { contract: 1, id: "example", name: "Example Bank", summary: "x", inputs: ["pdf"], parserGlobal: "ExampleBankParser", exportOverrides: ["pad"] };
  const errs = validate(D, { skeleton: true, parser: { parseStatements() {}, pad() {} }, callGraph });
  assert.ok(errs.some((e) => /C08b: adjustedEntries uses the overridden pad internally \(adjustedEntries -> prevMonth -> pad\)/.test(e)), JSON.stringify(errs));
  assert.ok(errs.some((e) => /C08b: adjustedCsv uses the overridden pad/.test(e)));
});

test("blank keeps positions and newlines", () => {
  const src = 'const a = "x\\"y"; // c\nconst b = `t${a}`; /re/g.test(a);\n';
  const out = blank(src);
  assert.equal(out.length, src.length);
  assert.equal(out.split("\n").length, src.split("\n").length);
  assert.ok(!/x|re|c\b/.test(out.replace(/const|test/g, "")));
  assert.ok(out.includes("${a}"), "interpolation code is kept");
  assert.throws(() => blank('const s = "open'), /unterminated string/);
  assert.throws(() => blank("/* open"), /unterminated comment/);
});

test("blank reports each literal's span, in source order, and blanks the same text", () => {
  const src = 'f("a\\"b", \'c\'); // "no"\nconst t = `x${y + `z`}w`, u = `plain`; /r"e/g.test(q);\n';
  const seen = [];
  const out = blank(src, { onLiteral: (l) => seen.push(l) });
  assert.equal(out, blank(src), "the callback changes nothing");
  assert.deepEqual(seen.map((l) => [l.kind, src.slice(l.start, l.end), l.first, l.last]), [
    ["string", '"a\\"b"', undefined, undefined], ["string", "'c'", undefined, undefined],
    ["template", "x", true, false], ["template", "z", true, true], ["template", "w", false, true], ["template", "plain", true, true],
    ["regex", '/r"e/g', undefined, undefined],
  ]);
});
