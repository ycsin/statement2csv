// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The contract constants against the code that relies on them (docs/TESTING.md, unit tests):
// the literal constants of core/app/statement-app.js (their browser copies) equal
// core/contract/constants.js, the app reads exactly the runtime fields the contract defines,
// and FROZEN_SCHEMA covers every key used in every providers/<id>/frozen.js. Synthetic data
// only; no provider is named.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const C = require("../../core/contract/constants.js");
const { checkFrozen, resolveRuntime } = require("../../core/contract/descriptor.js");
const { frozenProviders } = require("../lib/load-provider.js");

const APP = path.resolve(__dirname, "..", "..", "core", "app", "statement-app.js");
const app = fs.readFileSync(APP, "utf8");
const json = (v) => JSON.parse(JSON.stringify(v));

// Source without comments, so a name in a comment never counts as a use.
const code = app.replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

// Every `const NAME = <expression>;` line of the app whose NAME is a contract constant.
function literalConstants(src) {
  const out = [];
  for (const m of src.matchAll(/^\s*const ([A-Z][A-Z0-9_]*) = (.+?);\s*(?:\/\/.*)?$/gm)) {
    if (Object.prototype.hasOwnProperty.call(C, m[1])) out.push({ name: m[1], expr: m[2] });
  }
  return out;
}

test("every literal constant of the statement app equals its contract constant", () => {
  const found = literalConstants(app);
  assert.ok(found.some((c) => c.name === "KIND_LABEL"), "the app declares KIND_LABEL");
  const names = found.map((c) => c.name);
  assert.deepEqual(names, [...new Set(names)], "each contract constant is declared once");
  for (const { name, expr } of found) {
    // Evaluated with no globals at all: a literal, never a computed value.
    const value = vm.runInNewContext(`(${expr})`, Object.create(null), { timeout: 1000 });
    assert.deepEqual(json(value), json(C[name]), `${name} in the app equals core/contract/constants.js`);
  }
});

test("literalConstants finds a constant and the comparison catches a changed copy", () => {
  const sample = '  const KIND_LABEL = { investment: "Investment", cash: "Cash", bank: "Bank" };  // :45\n  const OTHER = 1;\n';
  const found = literalConstants(sample);
  assert.deepEqual(found.map((c) => c.name), ["KIND_LABEL"]);
  const value = vm.runInNewContext(`(${found[0].expr})`, Object.create(null));
  assert.notDeepEqual(json(value), json(C.KIND_LABEL));
});

test("the configurator's Type select offers exactly CONFIG_KINDS, labelled as KIND_LABEL", () => {
  const m = /<select data-field="kind">([\s\S]*?)<\/select>/.exec(app);
  assert.ok(m, "the app renders a Type select");
  const values = [...m[1].matchAll(/opt\("([^"]*)"/g)].map((x) => x[1]);
  assert.deepEqual(values, C.CONFIG_KINDS);
  assert.ok(!values.includes("bank"), "the configurator never offers bank");
  for (const x of m[1].matchAll(/opt\("([a-z]+)", "([^"]*)"/g)) assert.equal(x[2], C.KIND_LABEL[x[1]], `the ${x[1]} option's label`);
});

test("the app reads exactly the runtime ui fields of the contract, and every one of them", () => {
  const top = new Set(), nested = { notes: new Set(), text: new Set() };
  for (const m of code.matchAll(/\bU\.([A-Za-z]+)(?:\.([A-Za-z]+))?/g)) {
    top.add(m[1]);
    if (m[2] && nested[m[1]]) nested[m[1]].add(m[2]);
  }
  assert.deepEqual([...top].sort(), Object.keys(C.DEFAULT_UI).sort(), "top-level ui keys read by the app");
  for (const k of ["notes", "text"]) assert.deepEqual([...nested[k]].sort(), Object.keys(C.DEFAULT_UI[k]).sort(), `ui.${k} keys read by the app`);
});

// Every D.<a>.<b>… and U.<a>.<b>… path in src, walked through the runtime object R (U is
// R.ui): each step into a plain object must name one of its own keys, so a misspelt nested
// field (D.storage.modeKeyX, U.notes.bankX) is reported. A step into an array, a string or
// null ends the walk (D.inputs.includes, D.pdf.pageTransform). Also reported: a declaration
// that binds a fixed-key runtime object to another name (const S = D.storage), since reads
// through it escape the walk. U itself (D.ui) and U.skipLabels, a map read by category, may
// be bound.
function runtimePathProblems(src, R) {
  const problems = [];
  const walk = (root, steps) => {
    let v = root === "D" ? R : R.ui;
    for (const k of steps) {
      if (v === null || typeof v !== "object" || Array.isArray(v)) return { ok: true, value: undefined };
      if (!Object.prototype.hasOwnProperty.call(v, k)) return { ok: false };
      v = v[k];
    }
    return { ok: true, value: v };
  };
  for (const m of src.matchAll(/\b([DU])((?:\.[A-Za-z_$][\w$]*)+)/g)) {
    if (!walk(m[1], m[2].slice(1).split(".")).ok) problems.push(`${m[1]}${m[2]} is not a runtime field`);
  }
  for (const m of src.matchAll(/(?:const|let|var|,)\s*([A-Za-z_$][\w$]*)\s*=\s*([DU])((?:\.[A-Za-z_$][\w$]*)+)\s*[;,]/g)) {
    const p = `${m[2]}${m[3]}`;
    if ((m[1] === "U" && p === "D.ui") || p === "U.skipLabels") continue;
    const w = walk(m[2], m[3].slice(1).split("."));
    if (w.ok && w.value !== null && typeof w.value === "object" && !Array.isArray(w.value)) problems.push(`${m[1]} = ${p} binds a runtime object to another name`);
  }
  return [...new Set(problems)];
}

test("the app reads only fields of the runtime object", () => {
  const R = resolveRuntime({ contract: 1, id: "sample", name: "Sample", summary: "Synthetic", inputs: ["pdf"], parserGlobal: "SampleParser" });
  const read = new Set([...code.matchAll(/\bD\.([A-Za-z]+)/g)].map((m) => m[1]));
  for (const k of read) assert.ok(Object.prototype.hasOwnProperty.call(R, k), `D.${k} is a runtime field`);
  for (const k of ["ui", "inputs", "parserGlobal", "pdf", "storage", "modes", "naming"]) assert.ok(read.has(k), `the app reads D.${k}`);
  assert.deepEqual(runtimePathProblems(code, R), [], "every nested D. and U. path is a runtime field");
  for (const path of ["D.storage.modeKey", "D.storage.configKey", "D.pdf.pageTransform", "U.notes.bank", "U.text.gapWarning"]) {
    assert.ok(new RegExp(`\\b${path.replace(/\./g, "\\.")}\\b`).test(code), `the app reads ${path}`);
  }
  // Each diagnostics section the app can render is a value the contract allows.
  const sec = /const section = \{([\s\S]*?)\n {4}\};/.exec(code);
  assert.ok(sec, "the app has its diagnostics sections");
  const sections = [...sec[1].matchAll(/^ {6}([a-z]+): \(\) =>/gm)].map((m) => m[1]);
  const allowed = new Set([...C.DEFAULT_UI.diagnostics, ...C.GEN1_PRESET.diagnostics, "closed"]);
  assert.deepEqual(new Set(sections), allowed);
});

test("runtimePathProblems catches a misspelt nested field and an alias of a runtime object", () => {
  const R = resolveRuntime({ contract: 1, id: "sample", name: "Sample", summary: "Synthetic", inputs: ["pdf"], parserGlobal: "SampleParser" });
  const ok = "const D = self.StatementProvider, U = D.ui;\nconst m = D.storage.modeKey, i = D.inputs.includes(\"pdf\"), t = D.pdf.pageTransform, ids = D.modes.map((x) => x.id);\nconst LABELS = U.skipLabels;\nconst n = U.notes.bankDownloadOnly + U.text.downloadNoun + U.diagnostics.join(\",\");\n";
  assert.deepEqual(runtimePathProblems(ok, R), []);
  const bad = {
    "D.storage.modeKeyX": "const k = D.storage.modeKeyX;",
    "D.pdf.transform": "const t = D.pdf.transform;",
    "U.notes.bankX": "const n = U.notes.bankX;",
    "U.text.gapWarningX": "x(U.text.gapWarningX);",
    "D.colour": "if (D.colour) y();",
    "S = D.storage": "const S = D.storage;",
    "N = U.notes": "const a = 1, N = U.notes;",
  };
  for (const [what, src] of Object.entries(bad)) {
    const found = runtimePathProblems(src, R);
    assert.equal(found.length, 1, `${what}: ${JSON.stringify(found)}`);
    assert.ok(found[0].startsWith(what), `${what}: ${found[0]}`);
  }
});

const frozens = frozenProviders();
const S = C.FROZEN_SCHEMA;
const typeOf = (f) => ("kindModel" in f ? "statement" : f.storage && f.storage.configKey === null ? "custom" : "custom-config");

test("FROZEN_SCHEMA covers every key used in every frozen.js", () => {
  assert.ok(frozens.length > 0, "the tree has frozen.js files");
  assert.equal(frozens.filter((p) => p.frozen.legacyRepo !== undefined).length, 8, "one frozen.js per old repository");
  const known = new Set([...S.common, "kindModel", ...S.legacy]);
  for (const { id, frozen } of frozens) {
    const at = `providers/${id}/frozen.js`;
    const type = typeOf(frozen);
    const T = S.types[type];
    for (const k of Object.keys(frozen)) assert.ok(known.has(k), `${at}: key ${k} is in FROZEN_SCHEMA`);
    for (const k of S.common) assert.ok(k in frozen, `${at}: required key ${k}`);
    assert.deepEqual(Object.keys(frozen.storage).sort(), ["configKey", "modeKey"], `${at}: storage keys`);
    for (const k of Object.keys(frozen.naming)) assert.ok([...T.naming.required, ...T.naming.optional].includes(k), `${at}: naming.${k} is in FROZEN_SCHEMA`);
    for (const k of T.naming.required) assert.ok(k in frozen.naming, `${at}: naming.${k} required`);
    if (T.kindModel === "absent") assert.ok(!("kindModel" in frozen), `${at}: no kindModel for ${type}`);
    if ("kindModel" in frozen) assert.ok(S.kindModels.includes(frozen.kindModel), `${at}: kindModel ${frozen.kindModel}`);
    if (T.configurator) assert.deepEqual(frozen.configKinds, C.CONFIG_KINDS, `${at}: configKinds`);
    if (type === "statement") assert.deepEqual(frozen.modeValues, C.LEDGER_MODES.map((m) => m.id), `${at}: modeValues`);
    if (frozen.legacyDom) assert.deepEqual(Object.keys(frozen.legacyDom).sort(), [...S.legacyDomKeys].sort(), `${at}: legacyDom keys`);
    assert.deepEqual(checkFrozen(frozen, type), [], `${at}: checkFrozen`);
  }
});

test("the schema check is not vacuous: an unknown or missing key is reported", () => {
  const f = json(frozens.find((p) => "kindModel" in p.frozen).frozen);
  assert.ok(checkFrozen({ ...f, extra: 1 }, "statement").some((m) => /unknown key "extra"/.test(m)));
  const { naming, ...rest } = f;
  assert.ok(checkFrozen(rest, "statement").some((m) => /missing required key "naming"/.test(m)));
  assert.ok(checkFrozen({ ...f, naming: { ...naming, extra: "x" } }, "statement").some((m) => /naming\.extra/.test(m)));
});
