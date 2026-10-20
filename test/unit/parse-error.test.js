// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The parse-error smoke (test/smoke/parse-error.js) on the synthetic tree of
// test/unit/synthetic-tree.js, whose statement app and injected piece are byte copies of the
// real core/app/statement-app.js and test/smoke/inject/throw-on-marker.js. Discovery picks the
// tree's CSV skeleton, and the whole check passes on it. Every check has a failing sample, made
// by changing one thing in a fresh copy: the parse error uncaught (the statement app before
// migration step M9), the previous result dropped on the error, the error line missing, the
// error line kept after Clear, an injected piece that never throws or is missing, fixtures
// without a CSV to copy, a tree with nothing to check, and Chrome missing. Without --root the
// smoke runs on this repository, whose CSV template (migration step M12) is the skeleton
// discovery finds there. Discovery is tested without Chrome; the browser parts need the pinned
// chrome-headless-shell and are skipped, with a message, without it.
// $S2C_PRIVATE points at a temporary directory, so nothing here can reach <private-dir>.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-parse-error-test-"));
process.env.S2C_PRIVATE = path.join(TMP, "private");
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const { makeSyntheticTree, SPDX, MARKER, ledger } = require("./synthetic-tree.js");
const parseError = require("../smoke/parse-error.js");
const browserLib = require("../lib/browser.js");

const CHROME_READY = fs.existsSync(browserLib.chromePath());
const NO_CHROME = !CHROME_READY && "the pinned chrome-headless-shell is not installed";
const APP = "core/app/statement-app.js";
const INJECT = "test/smoke/inject/throw-on-marker.js";
const SKEL = "providers/_syn-skel";

const withTree = (fn) => async () => {
  const t = makeSyntheticTree();
  try {
    return await fn(t);
  } finally {
    t.cleanup();
  }
};

// text with `from` replaced by `to`, asserting that `from` occurs exactly once.
function swap(text, from, to) {
  assert.equal(text.split(from).length, 2, `expected exactly one ${JSON.stringify(from.slice(0, 60))}`);
  return text.replace(from, () => to);
}
const edit = (t, rel, from, to) => t.write({ [rel]: swap(t.read(rel), from, to) });
const run = (t) => parseError.runParseError({ root: t.root });
const has = (r, re) => assert.ok(r.problems.some((m) => re.test(m)), `no problem matches ${re}:\n${r.problems.join("\n") || "(none)"}`);
const data = (comment, value) => `${SPDX}// ${comment}\nmodule.exports = ${JSON.stringify(value, null, 2)};\n`;
const descriptor = (o) => data("Synthetic skeleton descriptor.", { contract: 1, name: "Synthetic Skeleton", summary: "A synthetic skeleton", uses: ["assemble"], testing: { fixtures: "fixtures" }, ...o });

// The statement app's M9 lines, as the failing samples change them.
const CATCH = "    try {\n      state.result = state.statements.size ? P.parseStatements([...state.statements.values()], state.config) : null;\n"
  + "    } catch (e) {\n      state.parseError = e && e.message ? e.message : String(e);\n      renderStatus(state.result);\n      return;\n    }\n    state.parseError = null;\n";
const UNCAUGHT = "    state.result = state.statements.size ? P.parseStatements([...state.statements.values()], state.config) : null;\n";

// ---------------------------------------------------------------- discovery (no Chrome)

test("discovery: the first skeleton with a statement app, csv inputs and fixtures, in folder order", withTree(async (t) => {
  assert.equal(parseError.findTarget(t.root).id, "syn-skel");
  // Skeletons that come first but do not qualify: one on PDF inputs, and a custom app on CSV
  // (the custom app of the tree under other names; a skeleton needs no frozen.js).
  const pdfSkel = "providers/_aaa-pdf";
  t.write({
    [`${pdfSkel}/provider.js`]: descriptor({ id: "aaa-pdf", inputs: ["pdf"], parserGlobal: "AaaPdfParser" }),
    [`${pdfSkel}/parser.js`]: t.read(`${SKEL}/parser.js`).split("SynSkelParser").join("AaaPdfParser"),
    [`${pdfSkel}/page.html`]: t.read(`${SKEL}/page.html`),
    [`${pdfSkel}/fixtures/statements.js`]: t.read(`${SKEL}/fixtures/statements.js`),
  });
  const rename = (s) => s.split("SynSheetParser").join("AabParser").split("SynSheetFiles").join("AabFiles").split("syn-sheet").join("aab-custom");
  const custom = {};
  for (const f of ["provider.js", "parser.js", "files.js", "app.js", "test.js", "page.html", "fixtures/statements.js"]) custom[`providers/_aab-custom/${f}`] = rename(t.read(`providers/syn-sheet/${f}`));
  custom["providers/_aab-custom/provider.js"] = custom["providers/_aab-custom/provider.js"].replace("\"inputs\": [\n    \"xlsx\"\n  ]", "\"inputs\": [\n    \"csv\"\n  ]");
  assert.ok(custom["providers/_aab-custom/provider.js"].includes("\"csv\""), "the custom skeleton declares csv");
  t.write(custom);
  const found = parseError.findTarget(t.root);
  assert.equal(found.id, "syn-skel", "the PDF skeleton and the custom app are skipped");
  // Without fixtures the CSV skeleton does not qualify, and nothing else does: the published
  // CSV providers with fixtures never count.
  t.write({ [`${SKEL}/provider.js`]: t.read(`${SKEL}/provider.js`).replace(/,\s*"testing": \{\s*"fixtures": "fixtures"\s*\}/, "") });
  assert.equal(parseError.findTarget(t.root), null);
}));

test("a tree without such a skeleton fails: nothing to check is a problem, and needs no browser", withTree(async (t) => {
  t.remove(SKEL);
  const chrome = process.env.CHROME;
  process.env.CHROME = path.join(TMP, "no-such-chrome");
  try {
    const lines = [];
    const r = await parseError.runParseError({ root: t.root, log: (m) => lines.push(m) });
    assert.deepEqual(r, { target: null, tree: null, instances: 0, downloads: 0, problems: [`${parseError.NOTHING}, which fails: a smoke that checks nothing is not green`] });
    assert.ok(lines.some((m) => /^FAIL parse-error: .*nothing to check/.test(m)), lines.join("\n"));
  } finally {
    if (chrome === undefined) delete process.env.CHROME;
    else process.env.CHROME = chrome;
  }
}));

test("providers that do not validate are a problem, not a quiet pass", withTree(async (t) => {
  t.write({ [`${SKEL}/provider.js`]: t.read(`${SKEL}/provider.js`).replace("\"contract\": 1", "\"contract\": 2") });
  has(await run(t), /the providers do not validate/);
}));

test("parseArgs takes --root only; without it the tree is this repository", () => {
  assert.deepEqual(parseError.parseArgs(["--root", "x"]), { root: path.resolve("x") });
  assert.deepEqual(parseError.parseArgs([]), { root: REPO });
  assert.throws(() => parseError.parseArgs(["--root"]), /--root needs a value/);
  assert.throws(() => parseError.parseArgs(["--provider", "x"]), /unknown argument/);
});

test("this repository has a target: a skeleton with a statement app, csv inputs and fixtures (the CSV template)", () => {
  const found = parseError.findTarget(REPO);
  assert.ok(found, "npm run smoke would have nothing to check");
  assert.equal(found.skeleton, true);
  assert.notEqual(found.D.app, "custom");
  assert.ok(found.D.inputs.includes("csv"));
  assert.ok(found.D.testing.fixtures);
});

// ---------------------------------------------------------------- the synthetic tree

test("parse-error: the synthetic tree's CSV skeleton keeps its result through a parse error", { skip: NO_CHROME }, withTree(async (t) => {
  const r = await run(t);
  assert.deepEqual(r.problems, []);
  assert.equal(r.target, "syn-skel");
  assert.equal(r.tree, "given");
  assert.equal(r.instances, 1);
  assert.ok(r.downloads >= 3, `${r.downloads} downloads`);
  assert.ok(t.read(APP).includes(CATCH), "the tree runs the M9 statement app");
}));

test("parse-error fails: the parse error uncaught, as before M9", { skip: NO_CHROME }, withTree(async (t) => {
  edit(t, APP, CATCH, UNCAUGHT);
  const r = await run(t);
  has(r, /syn-skel: THROW\.csv: #busy is not hidden \(the page stays busy\)/);
  has(r, /syn-skel: THROW\.csv: #status shows the warn line "Could not read these statements: injected failure" 0 times, not once/);
  has(r, /syn-skel: page error: (unhandledrejection|pageerror): Error: injected failure/);
}));

test("parse-error fails: the previous result dropped on the error", { skip: NO_CHROME }, withTree(async (t) => {
  // render() without a result returns before the cards and the configurator, so the sample
  // empties them itself.
  edit(t, APP, "      renderStatus(state.result);\n      return;\n",
    "      state.result = null;\n      setHtml($(\"#cards\"), html``);\n      setHtml($(\"#config-list\"), html``);\n      fillRange([]);\n      render();\n      return;\n");
  const r = await run(t);
  for (const what of ["the cards", "the range \\(#from\\)", "the range \\(#to\\)", "the configurator", "#results", "#empty"]) has(r, new RegExp(`THROW\\.csv: ${what} changed`));
  has(r, /THROW\.csv: #status, without the error line, differs from before/);
  has(r, /THROW\.csv: the downloads differ from those before: record \d+ \(\w+\) count/);
}));

test("parse-error fails: no error line, and an error line that Clear does not remove", { skip: NO_CHROME }, withTree(async (t) => {
  const base = t.read(APP);
  t.write({ [APP]: swap(base, "    if (state.parseError) warn.push(html`Could not read these statements: ${state.parseError}`);\n", "") });
  has(await run(t), /THROW\.csv: #status shows the warn line "Could not read these statements: injected failure" 0 times, not once/);
  t.write({ [APP]: swap(base, "    state.parseError = null;\n", "") });
  const kept = await run(t);
  has(kept, /syn-skel: Clear: #status still shows 1 warn line$/);
  assert.ok(!kept.problems.some((m) => /THROW\.csv/.test(m)), "the error step itself passes");
}));

test("parse-error fails: an injected piece that never throws, or none at all", { skip: NO_CHROME }, withTree(async (t) => {
  edit(t, INJECT, "String(s.id).includes(\"THROW\")", "String(s.id).includes(\"NEVER-THROW\")");
  const r = await run(t);
  has(r, /THROW\.csv: #status shows the warn line "Could not read these statements: injected failure" 0 times, not once/);
  has(r, /THROW\.csv: #status, without the error line, differs from before/);
  t.remove(INJECT);
  has(await run(t), /syn-skel: the page does not build with the injected piece: --inject: .*does not exist/);
}));

test("parse-error fails: fixtures without a CSV outside expectErrors to copy", { skip: NO_CHROME }, withTree(async (t) => {
  t.write({ [`${SKEL}/fixtures/statements.js`]: data(`${MARKER}: synthetic.`, {
    marker: MARKER,
    files: [{ name: "skeleton-2026-04.csv", text: ledger("K1", "EUR", ["2026-04-01,Opening deposit,10.00,10.00"]) }],
    expectErrors: ["skeleton-2026-04.csv"],
  }) });
  has(await run(t), /syn-skel: fixtures: no CSV file outside expectErrors to copy as THROW\.csv/);
}));

test("parse-error fails, never skips, when Chrome cannot be launched", withTree(async (t) => {
  const chrome = process.env.CHROME;
  process.env.CHROME = path.join(TMP, "no-such-chrome");
  try {
    has(await run(t), /Chrome cannot be launched/);
  } finally {
    if (chrome === undefined) delete process.env.CHROME;
    else process.env.CHROME = chrome;
  }
}));
