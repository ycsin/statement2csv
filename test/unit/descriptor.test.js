// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// core/contract/descriptor.js: defaults, precedence (defaults < preset < legacy < ui),
// legacy gating, unknown keys, and every validation check C01-C09. Synthetic descriptors.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const C = require("../../core/contract/constants.js");
const Dsc = require("../../core/contract/descriptor.js");
const { frozenProviders } = require("../lib/load-provider.js");

const REPO = path.resolve(__dirname, "..", "..");
const base = () => ({ contract: 1, id: "example", name: "Example Bank", summary: "Synthetic", inputs: ["pdf"], parserGlobal: "ExampleBankParser" });
const custom = () => ({
  contract: 1, id: "sheet", name: "Sheet Co", summary: "Synthetic", app: "custom", inputs: ["xlsx"], multiple: false,
  parserGlobal: "SheetParser", modes: [{ id: "balance", label: "Balance only" }, { id: "day", label: "Daily" }],
});
const frozenFor = (D) => {
  const R = Dsc.resolveRuntime(D);
  const statement = R.app === "statement";
  return {
    storage: { ...R.storage },
    modeValues: R.modes.map((m) => m.id),
    configKinds: statement ? [...C.CONFIG_KINDS] : null,
    configIdPattern: statement ? "^[^:]+:[A-Z]{3}$" : null,
    naming: statement ? { ...R.naming } : { slug: R.naming.slug },
    ...(statement ? { kindModel: "standard" } : {}),
  };
};
const LEGACY = {
  legacyRepo: "example2csv", legacyUrl: "https://example.invalid/example2csv/",
  legacyHead: "0".repeat(40), legacyIndexSha256: "a".repeat(64), legacyDom: null,
};
const has = (errs, re) => errs.some((e) => re.test(e));

test("normalize: statement app defaults", () => {
  const D = base();
  const N = Dsc.normalize(D);
  assert.deepEqual(D, base(), "the input is not changed");
  assert.equal(N.app, "statement");
  assert.equal(N.multiple, true);
  assert.deepEqual(N.scripts, ["parser.js"]);
  assert.equal(N.parserScript, "parser.js");
  assert.deepEqual(N.uses, []);
  assert.deepEqual(N.exportOverrides, []);
  assert.deepEqual(N.pdf, { pageTransform: null });
  assert.deepEqual(N.storage, { modeKey: "example-csv-mode", configKey: "example-csv-accounts" });
  assert.deepEqual(N.modes, C.LEDGER_MODES);
  assert.deepEqual(N.naming, { accountPrefix: "", brand: "Example Bank", groupNoun: "accounts", slug: "example" });
  assert.deepEqual(N.ui, {}, "ui stays as written");
  assert.equal(N.detect, null);
  assert.deepEqual(N.testing, { reconcile: "statement", allowWarnings: false, gapDrop: true, fixtures: null });
  assert.equal(N.publish, true);
  assert.ok(!("appScript" in N) && !("custom" in N) && !("legacy" in N));
  assert.deepEqual(Dsc.normalize(N), N, "idempotent");
});

test("normalize: custom app defaults", () => {
  const N = Dsc.normalize(custom());
  assert.equal(N.appScript, "app.js");
  assert.deepEqual(N.storage, { modeKey: "sheet-csv-mode", configKey: null });
  assert.deepEqual(N.custom, { toolbar: [], config: false });
  assert.deepEqual(N.testing, { reconcile: "custom", allowWarnings: false, gapDrop: false, fixtures: null });
  assert.ok(!("ui" in N));
});

test("resolveRuntime: contract key order and core defaults", () => {
  const R = Dsc.resolveRuntime(base());
  assert.deepEqual(Object.keys(R), ["id", "app", "inputs", "multiple", "parserGlobal", "pdf", "storage", "modes", "naming", "ui"]);
  assert.deepEqual(Object.keys(R.ui), ["busyNoun", "kindModel", "hideModeWithoutInvestments", "status", "openingsCurrency", "extraWarnings",
    "unmappedNoun", "diagnostics", "skippedOwner", "skipDetailed", "skipLabels", "notes", "text"]);
  assert.deepEqual(Object.keys(R.ui.notes), ["bank", "bankDownloadOnly", "other", "tradelog", "holdings"]);
  assert.deepEqual(Object.keys(R.ui.text), ["gapWarning", "partialWarning", "downloadNoun"]);
  assert.deepEqual(R.ui, C.DEFAULT_UI);
  assert.deepEqual(Object.keys(R.naming), ["accountPrefix", "brand", "groupNoun", "slug"]);
  const Rc = Dsc.resolveRuntime(custom());
  assert.ok(!("ui" in Rc), "custom apps get no ui");
  assert.deepEqual(Rc.modes, custom().modes);
  assert.ok(!Object.isFrozen(R.ui.diagnostics), "the runtime object is a copy, not the frozen constant");
});

test("resolveRuntime: defaults < legacy.preset < legacy.* < ui.*", () => {
  const gen1 = Dsc.resolveRuntime({ ...base(), legacy: { preset: "gen1" } }).ui;
  assert.equal(gen1.busyNoun, "statement");
  assert.equal(gen1.status, "months");
  assert.equal(gen1.openingsCurrency, "base");
  assert.deepEqual(gen1.diagnostics, ["reconciled"]);
  assert.equal(gen1.text.gapWarning, C.GEN1_PRESET.text.gapWarning);
  assert.equal(gen1.text.partialWarning, C.DEFAULT_UI.text.partialWarning, "the preset leaves the rest");
  const lg = Dsc.resolveRuntime({ ...base(), legacy: { preset: "gen1", diagnostics: ["reconciled", "gaps"], kindModel: "investment-cash", hideModeWithoutInvestments: false, extraWarnings: "unmapped", unmappedNoun: "portfolio", skippedOwner: "portfolio" } }).ui;
  assert.deepEqual(lg.diagnostics, ["reconciled", "gaps"], "explicit legacy beats the preset");
  assert.equal(lg.kindModel, "investment-cash");
  assert.equal(lg.hideModeWithoutInvestments, false);
  assert.equal(lg.extraWarnings, "unmapped");
  assert.equal(lg.unmappedNoun, "portfolio");
  assert.equal(lg.skippedOwner, "portfolio");
  const ui = Dsc.resolveRuntime({ ...base(), legacy: { preset: "gen1" }, ui: { status: "statements", text: { gapWarning: "Mine." }, notes: { other: "Other note." } } }).ui;
  assert.equal(ui.status, "statements", "explicit ui beats the preset");
  assert.equal(ui.text.gapWarning, "Mine.");
  assert.equal(ui.notes.other, "Other note.");
  assert.equal(ui.notes.bank, C.DEFAULT_UI.notes.bank, "notes merge per key");
  const labels = Dsc.resolveRuntime({ ...base(), ui: { skipLabels: { "only one": "Only one" } } }).ui.skipLabels;
  assert.deepEqual(labels, { "only one": "Only one" }, "skipLabels replaces the default as a whole");
});

test("validate: a minimal statement descriptor and a minimal custom descriptor are valid", () => {
  const D = base();
  assert.deepEqual(Dsc.validate(D, { frozen: frozenFor(D) }), []);
  const Cd = custom();
  assert.deepEqual(Dsc.validate(Cd, { frozen: frozenFor(Cd) }), []);
  assert.deepEqual(Dsc.validate({ ...D, publish: false }), [], "an unpublished provider needs no frozen.js");
});

test("C01: unknown keys, types, enums and per-app fields", () => {
  const v = (over, opts = {}) => Dsc.validate({ ...base(), ...over }, { skeleton: true, ...opts });
  assert.ok(has(v({ colour: "red" }), /\[C01\] unknown key "colour"/));
  assert.ok(has(v({ naming: { prefix: "x" } }), /unknown key naming\.prefix/));
  assert.ok(has(v({ ui: { notes: { banks: "x" } } }), /unknown key ui\.notes\.banks/));
  assert.ok(has(v({ ui: { colour: 1 } }), /unknown key ui\.colour/));
  assert.ok(has(v({ testing: { slow: true } }), /unknown key testing\.slow/));
  assert.ok(has(v({ pdf: { scale: 2 } }), /unknown key pdf\.scale/));
  assert.ok(has(v({ inputs: [] }), /inputs must be a non-empty array/));
  assert.ok(has(v({ inputs: ["pdf", "ofx"] }), /unknown input "ofx"/));
  assert.ok(has(v({ inputs: ["pdf", "pdf"] }), /inputs: repeated/));
  assert.ok(has(v({ multiple: false }), /multiple must be true for a statement app/));
  assert.ok(has(v({ parserGlobal: "lower" }), /parserGlobal must match/));
  assert.ok(has(v({ scripts: ["lib.js"] }), /scripts must contain parserScript "parser.js"/));
  assert.ok(has(v({ scripts: ["../x.js", "parser.js"] }), /not a provider-relative \.js path/));
  assert.ok(has(v({ uses: ["layout", "zip"] }), /unknown module "zip"/));
  assert.ok(has(v({ exportOverrides: ["parseStatements"] }), /not a core export name/));
  assert.ok(has(v({ storage: { modeKey: "k", configKey: "k" } }), /must differ/));
  assert.ok(has(v({ storage: { configKey: null } }), /configKey cannot be null for a statement app/));
  assert.ok(has(v({ naming: { slug: "Bad Slug" } }), /naming\.slug must match/));
  assert.ok(has(v({ ui: { diagnostics: ["reconciled"] } }), /unknown section "reconciled"/));
  assert.ok(has(v({ ui: { status: "months" } }), /ui\.status must be one of/));
  assert.ok(has(v({ ui: { skipLabels: { a: 5 } } }), /skipLabels must be an object/));
  assert.ok(has(v({ detect: { pdfText: ["(unclosed"] } }), /regex does not compile/));
  assert.ok(has(v({ modes: C.LEDGER_MODES }), /modes is fixed for a statement app/));
  assert.ok(has(v({ appScript: "app.js" }), /appScript is for custom apps only/));
  assert.ok(has(v({ custom: { toolbar: [] } }), /custom is for custom apps only/));
  assert.ok(has(v({ app: "plugin" }), /app must be "statement" or "custom"/));
  for (const k of ["contract", "id", "name", "summary", "inputs", "parserGlobal"]) {
    const D = base();
    delete D[k];
    assert.ok(has(Dsc.validate(D, { skeleton: true }), new RegExp(`missing required key "${k}"`)), k);
  }
  const c = (over) => Dsc.validate({ ...custom(), ...over }, { skeleton: true });
  assert.ok(has(c({ modes: undefined }), /modes is required for a custom app/));
  assert.ok(has(c({ modes: [{ id: "a", label: "A" }, { id: "a", label: "B" }] }), /repeated id/));
  assert.ok(has(c({ modes: [{ id: "Bad id", label: "A" }] }), /modes\[0\]\.id must match/));
  assert.ok(has(c({ ui: {} }), /ui is for statement apps only/));
  assert.ok(has(c({ legacy: { preset: "gen1" } }), /legacy is for statement apps only/));
  assert.ok(has(c({ custom: { toolbar: ["accounts", "zip"] } }), /unknown button "zip"/));
  assert.ok(has(c({ custom: { config: true } }), /custom\.config needs an explicit storage\.configKey/));
  assert.ok(has(c({ scripts: ["parser.js", "app.js"] }), /do not list it in scripts/));
  assert.ok(has(c({ testing: { gapDrop: true } }), /gapDrop applies to statement apps only/));
  assert.deepEqual(Dsc.validate("nope"), ["provider.js: [C01] module.exports must be a plain object"]);
});

test("C02: data only (functions, Dates, RegExps, undefined, NaN, -0, getters)", () => {
  const v = (over) => Dsc.validate({ ...base(), ...over }, { skeleton: true });
  for (const [name, over] of [
    ["function", { summary: () => "x" }],
    ["Date", { naming: { brand: new Date(0) } }],
    ["RegExp", { detect: { pdfText: [/x/] } }],
    ["undefined", { publish: undefined }],
    ["NaN", { contract: NaN }],
    ["-0", { contract: -0 }],
  ]) assert.ok(has(v(over), /\[C02\]/), name);
  const D = base();
  Object.defineProperty(D, "summary", { get: () => "computed", enumerable: true });
  assert.ok(has(Dsc.validate(D, { skeleton: true }), /\[C02\] module\.exports\.summary is an accessor/));
  assert.deepEqual(Dsc.dataOnlyProblems(base()), []);
});

test("C03: id format, folder name, reserved ids, contract version", () => {
  const v = (over, opts = {}) => Dsc.validate({ ...base(), ...over }, { skeleton: true, ...opts });
  assert.ok(has(v({ id: "Example" }), /\[C03\] id must match/));
  assert.ok(has(v({ id: "a".repeat(33) }), /id must match/));
  assert.ok(has(v({ id: "all" }), /id "all" is reserved/));
  assert.ok(has(v({ contract: 2 }), /\[C03\] contract must be 1/));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-c03-"));
  try {
    fs.mkdirSync(path.join(dir, "example"));
    fs.mkdirSync(path.join(dir, "_example"));
    fs.mkdirSync(path.join(dir, "other"));
    const c03 = (folder) => Dsc.validate(base(), { dir: path.join(dir, folder) }).filter((e) => /C03/.test(e));
    assert.deepEqual(c03("example"), []);
    assert.deepEqual(c03("_example"), [], "one leading underscore is removed");
    assert.ok(has(c03("other"), /must equal the folder name "other"/));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("C04: id, parserGlobal, storage keys and slug unique across providers", () => {
  const a = base();
  const b = { ...base(), id: "other", name: "Other", parserGlobal: "OtherParser" };
  assert.deepEqual(Dsc.validate(a, { skeleton: true, all: [a, b] }), []);
  const clash = (over) => Dsc.validate(a, { skeleton: true, all: [a, { ...b, ...over }] });
  assert.ok(has(clash({ id: "example" }), /\[C04\] id "example"/));
  assert.ok(has(clash({ parserGlobal: "ExampleBankParser" }), /\[C04\] parserGlobal/));
  assert.ok(has(clash({ storage: { modeKey: "example-csv-mode" } }), /storage key "example-csv-mode"/));
  assert.ok(has(clash({ storage: { modeKey: "example-csv-accounts" } }), /storage key "example-csv-accounts"/), "mode and config keys share one namespace");
  assert.ok(has(clash({ naming: { slug: "example" } }), /naming\.slug "example"/));
  assert.equal(Dsc.checkUnique([a, { ...b, parserGlobal: "ExampleBankParser" }]).length, 1);
  assert.deepEqual(Dsc.checkUnique([{ D: a }, { D: b }]), []);
});

test("C05: frozen.js schema per app type and equality with the resolved descriptor", () => {
  const D = base();
  const F = frozenFor(D);
  const v = (frozen, d = D) => Dsc.validate(d, { frozen });
  assert.deepEqual(v(F), []);
  assert.ok(has(v({ ...F, colour: 1 }), /frozen\.js: \[C05\] unknown key "colour"/));
  const { naming, ...noNaming } = F;
  void naming;
  assert.ok(has(v(noNaming), /missing required key "naming"/));
  assert.ok(has(v({ ...F, storage: { modeKey: "renamed", configKey: F.storage.configKey } }), /storage is .* in the descriptor but .* in frozen\.js/));
  assert.ok(has(v({ ...F, modeValues: ["balance", "holdings"] }), /mode ids/));
  assert.ok(has(v({ ...F, configKinds: ["", "investment", "cash", "bank"] }), /configKinds/));
  assert.ok(has(v({ ...F, naming: { ...F.naming, brand: "Renamed" } }), /naming\.brand/));
  assert.ok(has(v({ ...F, naming: { ...F.naming, extra: "x" } }), /unknown key naming\.extra/));
  assert.ok(has(v({ ...F, configIdPattern: "(" }), /configIdPattern does not compile/));
  assert.ok(has(v({ ...F, kindModel: "investment-cash" }), /kindModel must be "standard" without legacyRepo/));
  const { kindModel, ...noKind } = F;
  void kindModel;
  assert.deepEqual(v(noKind), [], "kindModel is optional without legacyRepo");
  assert.ok(has(v({ ...noKind, ...LEGACY }), /missing required key kindModel/));
  assert.deepEqual(v({ ...F, ...LEGACY }), []);
  assert.ok(has(v({ ...F, legacyRepo: "x2csv" }), /come together or not at all/));
  assert.ok(has(v({ ...F, ...LEGACY, legacyHead: "abc" }), /legacyHead must be a 40-digit commit id/));
  assert.ok(has(v({ ...F, ...LEGACY, legacyDom: { list: "#a" } }), /legacyDom must be null or/));
  assert.deepEqual(v({ ...F, ...LEGACY, legacyDom: { list: "#a", row: ".b", count: "#c", reset: "#d" } }), []);
  // kindModel follows the legacy knob
  const ic = { ...D, legacy: { kindModel: "investment-cash" } };
  assert.deepEqual(v({ ...F, ...LEGACY, kindModel: "investment-cash" }, ic), []);
  assert.ok(has(v({ ...F, ...LEGACY, kindModel: "standard" }, ic), /ui\.kindModel/));
  // custom apps: explicit nulls, naming {slug}, no kindModel
  const Cd = custom();
  const CF = frozenFor(Cd);
  assert.deepEqual(v(CF, Cd), []);
  assert.ok(has(v({ ...CF, configKinds: [] }, Cd), /configKinds must be null for app type custom/));
  assert.ok(has(v({ ...CF, configIdPattern: "^x$" }, Cd), /configIdPattern must be null/));
  assert.ok(has(v({ ...CF, storage: { modeKey: CF.storage.modeKey, configKey: "k" } }, Cd), /configKey must be null/));
  assert.ok(has(v({ ...CF, kindModel: "standard" }, Cd), /kindModel must be absent/));
  assert.ok(has(v({ ...CF, naming: {} }, Cd), /missing required key naming\.slug/));
  assert.deepEqual(v({ ...CF, naming: { slug: CF.naming.slug, brand: "Sheet Co" } }, Cd), [], "other naming keys are optional");
  // custom app with a configurator
  const Cc = { ...Cd, storage: { configKey: "sheet-config" }, custom: { config: true } };
  const CcF = { ...CF, storage: { modeKey: "sheet-csv-mode", configKey: "sheet-config" }, configKinds: [...C.CONFIG_KINDS], configIdPattern: "^.+$" };
  assert.equal(Dsc.frozenType(Cc), "custom-config");
  assert.deepEqual(v(CcF, Cc), []);
});

test("C05b: published providers need frozen.js; skeletons do not", () => {
  const D = base();
  assert.ok(has(Dsc.validate(D), /frozen\.js: \[C05\] a published provider needs frozen\.js \(C05b\)/));
  assert.deepEqual(Dsc.validate(D, { skeleton: true }), []);
  assert.deepEqual(Dsc.validate({ ...D, publish: false }), []);
  assert.ok(has(Dsc.validate({ ...D, publish: false }, { tracked: true }), /whose dist page is tracked/));
});

test("C06: the legacy block is gated on frozen.legacyRepo and its values are checked", () => {
  const D = { ...base(), legacy: { preset: "gen1" } };
  const F = frozenFor(base());
  assert.ok(has(Dsc.validate(D, { frozen: F }), /\[C06\] a legacy block needs frozen\.js with legacyRepo/));
  assert.ok(has(Dsc.validate(D, { skeleton: true }), /\[C06\]/), "skeletons cannot opt in either");
  const FL = { ...F, ...LEGACY };
  assert.deepEqual(Dsc.validate(D, { frozen: FL }), []);
  const v = (legacy) => Dsc.validate({ ...base(), legacy }, { frozen: FL });
  assert.ok(has(v({ preset: "gen2" }), /legacy\.preset must be "gen1"/));
  assert.ok(has(v({ status: "statements" }), /legacy\.status must be "months"/));
  assert.ok(has(v({ hideModeWithoutInvestments: true }), /must be false/));
  assert.ok(has(v({ diagnostics: ["gaps"] }), /legacy\.diagnostics must be an array with "reconciled"/));
  assert.ok(has(v({ diagnostics: ["reconciled", "bogus"] }), /legacy\.diagnostics/));
  assert.ok(has(v({ unmappedNoun: "" }), /unmappedNoun must be a non-empty string/));
  assert.ok(has(v({ shiny: true }), /unknown legacy knob "shiny"/));
  assert.deepEqual(v({ diagnostics: ["reconciled", "gaps", "late", "closed"] }), []);
  assert.ok(has(Dsc.validate({ ...base(), legacy: { diagnostics: ["reconciled"] }, ui: { diagnostics: ["gaps"] } }, { frozen: FL }), /not both/));
});

test("C07: referenced files exist", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-c07-"));
  const p = path.join(dir, "example");
  fs.mkdirSync(p);
  try {
    const D = { ...base(), scripts: ["layout.js", "parser.js"], testing: { fixtures: "fixtures" } };
    const v = (d = D) => Dsc.validate(d, { dir: p, skeleton: true }).filter((e) => /C07/.test(e));
    assert.ok(has(v(), /scripts: layout\.js does not exist/));
    assert.ok(has(v(), /scripts: parser\.js does not exist/));
    assert.ok(has(v(), /page\.html: \[C07\] page\.html does not exist/));
    assert.ok(has(v(), /folder fixtures does not exist/));
    for (const f of ["layout.js", "parser.js", "page.html"]) fs.writeFileSync(path.join(p, f), "");
    fs.mkdirSync(path.join(p, "fixtures"));
    assert.ok(has(v(), /fixtures\/statements\.js does not exist/));
    fs.writeFileSync(path.join(p, "fixtures", "statements.js"), "");
    assert.deepEqual(v(), []);
    // custom apps: appScript and test.js with the three hooks
    const q = path.join(dir, "sheet");
    fs.mkdirSync(q);
    for (const f of ["parser.js", "page.html"]) fs.writeFileSync(path.join(q, f), "");
    const c = () => Dsc.validate(custom(), { dir: q, skeleton: true }).filter((e) => /C07/.test(e));
    assert.ok(has(c(), /appScript app\.js does not exist/));
    assert.ok(has(c(), /test\.js: \[C07\] a custom app needs test\.js exporting parse, downloads, reconcile/));
    fs.writeFileSync(path.join(q, "app.js"), "");
    fs.writeFileSync(path.join(q, "test.js"), "module.exports = { parse() {}, downloads() {} };\n");
    assert.ok(has(c(), /test\.js: \[C07\] must export reconcile\(\)/));
    fs.writeFileSync(path.join(q, "test.js"), "module.exports = { parse() {}, downloads() {}, reconcile() {} };\n");
    assert.deepEqual(c(), []);
    fs.writeFileSync(path.join(q, "test.js"), "throw new Error('broken');\n");
    assert.ok(has(c(), /test\.js: \[C07\] cannot be loaded: broken/));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The export call graph of the core export layer (pinned in callgraph.test.js as well).
const GRAPH = {
  adjustedCsv: ["csv", "adjustedEntries"], adjustedEntries: ["round2", "num", "inRange", "prevMonth", "lastDayOf"],
  openingBalance: ["round2", "inRange", "prevMonth", "lastDayOf", "dayBefore"], prevMonth: ["pad"], lastDayOf: ["pad"], monthGaps: ["pad"],
  tradesCsv: ["csv", "num", "inRange"], transactionsCsv: ["csv", "inRange"], valuationsCsv: ["csv", "inRange"],
  accountsCsv: ["csv"], combinedTransactionsCsv: ["csv"], combinedTradesCsv: ["csv", "num"], csv: ["csvCell"],
  round2: [], pad: [], csvCell: [], num: [], inRange: [], dayBefore: [], qif: [],
};
const fns = (names) => Object.fromEntries(names.map((n) => [n, () => null]));

test("C08: exportOverrides equals the actual overlap of the parser's exports", () => {
  const v = (overrides, exportsNames) => Dsc.validate({ ...base(), exportOverrides: overrides }, { skeleton: true, parser: fns(exportsNames), callGraph: GRAPH });
  assert.deepEqual(v([], ["parseStatements", "itemsToText"]), []);
  assert.ok(has(v([], ["parseStatements", "qif"]), /\[C08\] parser\.js exports the core name qif/));
  assert.ok(has(v(["qif"], ["parseStatements"]), /exportOverrides lists qif, but parser\.js does not export it/));
  assert.deepEqual(v(["qif"], ["parseStatements", "qif"]), [], "qif is called by no core function");
});

test("C08b: overrides closed under the export call graph", () => {
  const v = (overrides, d = base()) => Dsc.validate({ ...d, exportOverrides: overrides }, { skeleton: true, parser: fns(["parseStatements", ...overrides]), callGraph: GRAPH });
  const pad = v(["pad"]);
  assert.ok(has(pad, /C08b: adjustedEntries uses the overridden pad internally \(adjustedEntries -> prevMonth -> pad\)/));
  assert.ok(has(pad, /C08b: openingBalance uses the overridden pad/));
  assert.ok(has(pad, /C08b: adjustedCsv uses the overridden pad/));
  assert.ok(!has(pad, /tradesCsv uses/), "tradesCsv does not reach pad");
  assert.ok(has(v(["adjustedEntries"]), /adjustedCsv uses the overridden adjustedEntries/));
  assert.deepEqual(v(["adjustedEntries", "adjustedCsv"]), []);
  const inRange = v(["inRange"]).map((e) => /C08b: (\w+) uses/.exec(e)[1]).sort();
  assert.deepEqual(inRange, ["adjustedCsv", "adjustedEntries", "openingBalance", "tradesCsv", "transactionsCsv", "valuationsCsv"]);
  assert.deepEqual(v([...C.APP_CALLED_EXPORTS]), [], "overriding every app-called function is closed");
  // custom apps: every core export counts as called
  const cv = (overrides) => Dsc.validate({ ...custom(), exportOverrides: overrides }, { skeleton: true, parser: fns(overrides), callGraph: GRAPH });
  assert.deepEqual(cv(["openingBalance"]), []);
  assert.ok(has(cv(["csvCell"]), /csv uses the overridden csvCell/));
  assert.ok(has(Dsc.overrideClosure(["num"], ["tradesCsv"], GRAPH), /tradesCsv uses the overridden num/));
});

test("C09: the page transform is an exported function and needs pdf input", () => {
  const D = { ...base(), pdf: { pageTransform: "toText" } };
  assert.deepEqual(Dsc.validate(D, { skeleton: true, parser: fns(["parseStatements", "toText"]), callGraph: GRAPH }), []);
  assert.ok(has(Dsc.validate(D, { skeleton: true, parser: { parseStatements() {}, toText: 1 }, callGraph: GRAPH }), /\[C09\] pdf\.pageTransform "toText" is not a function/));
  assert.ok(has(Dsc.validate({ ...D, inputs: ["csv"] }, { skeleton: true }), /\[C09\] pdf\.pageTransform needs "pdf" in inputs/));
});

test("every frozen.js in the tree follows FROZEN_SCHEMA for its app type", () => {
  const list = frozenProviders({ root: REPO });
  assert.ok(list.length > 0);
  for (const { id, frozen } of list) {
    const type = frozen.kindModel !== undefined ? "statement" : frozen.storage && frozen.storage.configKey !== null ? "custom-config" : "custom";
    assert.deepEqual(Dsc.checkFrozen(frozen, type), [], id);
    assert.deepEqual(Dsc.dataOnlyProblems(frozen, "frozen.js"), [], id);
  }
});

test("constants are frozen and self-consistent", () => {
  assert.ok(Object.isFrozen(C.DEFAULT_UI) && Object.isFrozen(C.DEFAULT_UI.notes) && Object.isFrozen(C.LEDGER_MODES[0]));
  assert.equal(C.CORE_EXPORT_NAMES.length, 19);
  assert.ok(C.APP_CALLED_EXPORTS.every((n) => C.CORE_EXPORT_NAMES.includes(n)));
  assert.ok(!C.CONFIG_KINDS.includes("bank"));
  assert.deepEqual(C.DEFAULT_UI.skipLabels, C.DEFAULT_SKIP_LABELS);
});
