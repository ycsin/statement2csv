// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The contract checks (test/contract/run.js), the pages smoke (test/smoke/pages.js) and the
// fixtures golden (test/smoke/fixtures-golden.js) on the synthetic tree of
// test/unit/synthetic-tree.js: the whole tree passes, and every check has a failing sample, made
// by changing one thing in a fresh copy. The tree's statement app is a byte copy of the real
// core/app/statement-app.js, so the smoke and the fixtures golden run it on real parse results.
// The browser parts (C13, the smoke, the fixtures golden) need the pinned chrome-headless-shell
// and are skipped, with a message, without it (CI runs them after installing it, and the
// browser tier fails rather than skips there). C13 reads the fixtures through
// test/lib/extract.js, whose cache lives in <private-dir>, so $S2C_PRIVATE points at a
// temporary directory for this file: synthetic entries never reach the real one.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-contract-"));
process.env.S2C_PRIVATE = path.join(TMP, "private");
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const { makeSyntheticTree, SPDX } = require("./synthetic-tree.js");
const contract = require("../contract/run.js");
const { loadDataModule } = require("../../build/discover.js");
const browserLib = require("../lib/browser.js");

const CHROME_READY = fs.existsSync(browserLib.chromePath());
const NO_CHROME = !CHROME_READY && "the pinned chrome-headless-shell is not installed";
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

const withTree = (fn, opts) => async () => {
  const t = makeSyntheticTree(opts);
  try {
    return await fn(t);
  } finally {
    t.cleanup();
  }
};

function edit(t, rel, from, to) {
  const before = t.read(rel);
  const after = before.split(from).join(to);
  assert.notEqual(after, before, `the edit of ${rel} changed nothing`);
  t.write({ [rel]: after });
}

// text with `from` replaced by `to`, asserting that `from` occurs exactly once.
function swap(text, from, to) {
  assert.equal(text.split(from).length, 2, `expected exactly one ${JSON.stringify(from.slice(0, 40))}`);
  return text.replace(from, () => to);
}

function editData(t, rel, fn) {
  const obj = loadDataModule(path.join(t.root, rel));
  const next = fn(obj) || obj;
  t.write({ [rel]: `${SPDX}module.exports = ${JSON.stringify(next, null, 2)};\n` });
}

const check = (t, opts = {}) => contract.runContract({ root: t.root, tier: "node", ...opts });
const tagged = (r, tag) => r.problems.filter((m) => m.includes(`[${tag}]`));

function assertFails(r, tag, re) {
  const hits = tagged(r, tag);
  assert.ok(hits.length, `expected a [${tag}] problem, got:\n${r.problems.join("\n") || "(none)"}`);
  if (re) assert.ok(hits.some((m) => re.test(m)), `no [${tag}] problem matches ${re}:\n${hits.join("\n")}`);
}

// ---------------------------------------------------------------- the passing tree

test("the synthetic tree passes every node-tier check (C01-C12, C14-C18)", withTree(async (t) => {
  assert.equal(t.read("core/app/statement-app.js"), fs.readFileSync(path.join(REPO, "core", "app", "statement-app.js"), "utf8"), "the tree runs the real statement app");
  const r = await check(t);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.providers.map((p) => p.folder), ["_syn-skel", "syn-csv", "syn-invest", "syn-pdf", "syn-sheet"], "skeletons included, code-point order");
  assert.match(r.tree.summary.C15, /^0 pins checked$/);
}));

test("--provider limits the per-provider checks; an unknown one is an error", withTree(async (t) => {
  const r = await check(t, { providers: ["syn-csv"] });
  assert.deepEqual(r.providers.map((p) => p.id), ["syn-csv"]);
  assert.deepEqual(r.problems, []);
  const s = await check(t, { providers: ["syn-skel"] });
  assert.deepEqual(s.providers.map((p) => p.folder), ["_syn-skel"], "a skeleton by its id");
  await assert.rejects(check(t, { providers: ["nope"] }), /no provider nope/);
}));

// ---------------------------------------------------------------- C01-C09 (the descriptor)

test("C01: an unknown descriptor key fails", withTree(async (t) => {
  editData(t, "providers/syn-csv/provider.js", (d) => ({ ...d, colour: "red" }));
  assertFails(await check(t), "C01", /unknown key "colour"/);
}));

test("C02: a descriptor that is not plain data fails (an undefined value, a getter)", withTree(async (t) => {
  const base = t.read("providers/syn-csv/provider.js");
  t.write({ "providers/syn-csv/provider.js": base.replace('"fixtures": "fixtures"', '"fixtures": "fixtures", "allowWarnings": undefined') });
  assertFails(await check(t), "C02", /JSON round trip/);
  t.write({ "providers/syn-csv/provider.js": `${base}Object.defineProperty(module.exports, "summary", { get: () => "x", enumerable: true });\n` });
  assertFails(await check(t), "C02", /accessor/);
}));

test("C03: an id that is not the folder name, or another contract version, fails", withTree(async (t) => {
  editData(t, "providers/syn-csv/provider.js", (d) => ({ ...d, id: "syn-other" }));
  assertFails(await check(t), "C03", /folder name/);
  editData(t, "providers/syn-csv/provider.js", (d) => ({ ...d, id: "syn-csv", contract: 2 }));
  assertFails(await check(t), "C03", /contract must be 1/);
}));

test("C04: a parserGlobal used twice fails", withTree(async (t) => {
  editData(t, "providers/syn-pdf/provider.js", (d) => ({ ...d, parserGlobal: "SynCsvParser" }));
  assertFails(await check(t), "C04", /parserGlobal "SynCsvParser"/);
}));

test("C05: frozen.js that disagrees with the descriptor fails; C05b: a published provider without frozen.js fails", withTree(async (t) => {
  editData(t, "providers/syn-csv/frozen.js", (f) => ({ ...f, naming: { ...f.naming, slug: "other" } }));
  assertFails(await check(t), "C05", /naming\.slug/);
  t.remove("providers/syn-csv/frozen.js");
  assertFails(await check(t), "C05", /C05b/);
  editData(t, "providers/syn-csv/provider.js", (d) => ({ ...d, publish: false }));
  assert.deepEqual(tagged(await check(t), "C05"), [], "an unpublished, untracked provider may lack frozen.js");
}));

test("C05b: a provider whose dist page is tracked by git needs frozen.js even when unpublished", withTree(async (t) => {
  assert.equal(t.build().code, 0);
  t.git("add", "-A");
  t.git("commit", "-q", "--no-verify", "-m", "dist");
  editData(t, "providers/syn-csv/provider.js", (d) => ({ ...d, publish: false }));
  t.remove("providers/syn-csv/frozen.js");
  assertFails(await check(t), "C05", /dist page is tracked/);
}, { git: true }));

test("C06: a legacy block without frozen.legacyRepo fails", withTree(async (t) => {
  editData(t, "providers/syn-csv/provider.js", (d) => ({ ...d, legacy: { preset: "gen1" } }));
  assertFails(await check(t), "C06", /legacyRepo/);
}));

test("C07: a referenced file that does not exist fails", withTree(async (t) => {
  editData(t, "providers/syn-csv/provider.js", (d) => ({ ...d, scripts: ["helper.js", "parser.js"] }));
  assertFails(await check(t), "C07", /helper\.js does not exist/);
}));

test("C08: an undeclared core export name fails; C08b: an override that is not closed fails", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "return { parseStatements };", "return { parseStatements, csv: E.csv };");
  assertFails(await check(t), "C08", /exports the core name csv/);
  edit(t, "providers/syn-csv/parser.js", "return { parseStatements, csv: E.csv };", "return { parseStatements, pad: E.pad };");
  editData(t, "providers/syn-csv/provider.js", (d) => ({ ...d, exportOverrides: ["pad"] }));
  assertFails(await check(t), "C08", /C08b: .*pad/);
}));

test("C09: a page transform that the parser does not export fails", withTree(async (t) => {
  editData(t, "providers/syn-pdf/provider.js", (d) => ({ ...d, pdf: { pageTransform: "toText" } }));
  assertFails(await check(t), "C09", /toText/);
}));

// ---------------------------------------------------------------- C10-C12 (the branches)

test("C10a: a parser whose Node branch cannot be required fails", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", 'require("../../core/assemble.js")', 'require("./missing.js")');
  assertFails(await check(t), "C10a", /cannot be required/);
}));

test("C10b: a browser branch that sets another global, or a global defined too early, fails", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "root.SynCsvParser =", "root.SynCsvParserX =");
  assertFails(await check(t), "C10b", /does not define self\.SynCsvParser/);
  edit(t, "providers/syn-csv/parser.js", "root.SynCsvParserX = factory(", "root.SynCsvParser = Object.assign({ pageOnly: 1 }, factory(");
  edit(t, "providers/syn-csv/parser.js", "root.StatementAssemble);", "root.StatementAssemble));");
  assertFails(await check(t), "C10b", /exports pageOnly, parseStatements in the page, parseStatements in Node/);
  edit(t, "providers/syn-csv/parser.js", "root.SynCsvParser = Object.assign({ pageOnly: 1 }, factory(", "root.SynCsvParser = factory(");
  edit(t, "providers/syn-csv/parser.js", "root.StatementAssemble));", "root.StatementAssemble);");
  assert.deepEqual(tagged(await check(t), "C10b"), []);
  t.write({ "providers/syn-csv/early.js": `${SPDX}(function (root) { root.SynCsvParser = {}; })(typeof self !== "undefined" ? self : this);\n` });
  editData(t, "providers/syn-csv/provider.js", (d) => ({ ...d, scripts: ["early.js", "parser.js"] }));
  assertFails(await check(t), "C10b", /already defined/);
}));

test("C11: a parser that throws on garbage, names no errors entry, or throws on a garbage config fails", withTree(async (t) => {
  const rel = "providers/syn-csv/parser.js";
  const base = t.read(rel);
  edit(t, rel, "function parseExport(text) {", "function parseExport(text) {\n    if (!String(text).trim()) throw new Error(\"empty\");");
  assertFails(await check(t), "C11", /Node branch, garbage csv input 2: parseStatements throws/);
  assertFails(await check(t), "C11", /page branch, garbage csv input 2/);
  t.write({ [rel]: swap(base, "errors.push({ id: s.id, error: st.error });", "errors.push({ id: `x${s.id}`, error: st.error });") });
  assertFails(await check(t), "C11", /no errors entry with id "garbage\.csv"/);
  t.write({ [rel]: swap(base, "const errors = [], warnings = []", "if (config && typeof config === \"object\" && !Array.isArray(config)) for (const k of Object.keys(config)) config[k].name.trim();\n    const errors = [], warnings = []") });
  assertFails(await check(t), "C11", /config \{"x":5\}: parseStatements throws/);
}));

test("C11 (custom app): test.parse that does not return {error} for garbage fails", withTree(async (t) => {
  edit(t, "providers/syn-sheet/test.js", "return s && s.workbook ? ctx.P.parseSheet(s.workbook, { mode: ctx.mode }) : null;",
    "const r = s && s.workbook ? ctx.P.parseSheet(s.workbook, { mode: ctx.mode }) : null;\n    return r && r.error ? null : r;");
  assertFails(await check(t), "C11", /test\.parse must return \{error\}/);
}));

test("C12: a result field the switches require that is missing fails; a custom downloads hook that lists files for {error} fails", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "return A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] });",
    "const r = A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] });\n    delete r.skippedRows;\n    return r;");
  assertFails(await check(t), "C12", /missing required field skippedRows/);
  edit(t, "providers/syn-sheet/test.js", "if (!result || result.error) return [];", "if (!result) return [];\n    if (result.error) return [{ trigger: \"zip\", account: null, kind: null, disabled: true }];");
  assertFails(await check(t), "C12", /must return \[\] for an \{error\} result/);
}));

// ---------------------------------------------------------------- C14-C18

test("C14: a page that does not build fails, and so does one over its size budget", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "\"use strict\";", "\"use strict\";\n  // </script> ends an inline script");
  assertFails(await check(t), "C14", /does not build: .*<\/script/);
  edit(t, "providers/syn-csv/parser.js", "\n  // </script> ends an inline script", "");
  const budget = { ...contract.BUDGET };
  contract.BUDGET.other = 1000;
  try {
    assertFails(await check(t), "C14", /over its budget of 1000/);
  } finally {
    Object.assign(contract.BUDGET, budget);
  }
  assert.deepEqual(tagged(await check(t), "C14"), []);
}));

test("C15: a pinned file whose sha256 differs from its pin fails", withTree(async (t) => {
  const file = t.read("core/zip.js");
  t.write({ "providers/syn-old/frozen.js": `${SPDX}module.exports = { legacyRepo: "synold2csv", legacyHead: "${"a".repeat(40)}" };\n` });
  const pin = { path: "core/zip.js", from: { repo: "synold2csv", head: "a".repeat(40), path: "src/zip.js", sha256: sha256(file) }, edits: [], sha256: sha256(file) };
  t.write({ "test/contract/provenance.js": `${SPDX}module.exports = ${JSON.stringify([pin])};\n` });
  assert.deepEqual(tagged(await check(t), "C15"), []);
  t.write({ "core/zip.js": `${file}// changed\n` });
  assertFails(await check(t), "C15", /sha256 is [0-9a-f]{64}, its pin says/);
}));

test("C15 with --old-root re-derives every pinned file from git, and fails on a file that differs from its re-derivation", withTree(async (t) => {
  const oldRoot = path.join(t.tmp, "old");
  const repo = path.join(oldRoot, "synold2csv");
  const blob = `${SPDX}const a = 1;\nconst b = 2;\n`;
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "copied.js"), blob);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))), GIT_CEILING_DIRECTORIES: oldRoot, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1" };
  const git = (...a) => execFileSync("git", ["-c", "user.name=synthetic", "-c", "user.email=synthetic", "-c", "commit.gpgsign=false", "-C", repo, ...a], { env, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "old");
  const head = git("rev-parse", "HEAD");
  const copy = blob.replace("const b = 2;", "const b = 3;");
  t.write({
    "providers/syn-old/frozen.js": `${SPDX}module.exports = { legacyRepo: "synold2csv", legacyHead: "${head}" };\n`,
    "core/copied.js": copy,
  });
  const writePin = (fileText) => {
    const pin = { path: "core/copied.js", from: { repo: "synold2csv", head, path: "src/copied.js", sha256: sha256(blob) }, edits: [{ line: 4, old: "const b = 2;", new: "const b = 3;" }], sha256: sha256(fileText) };
    t.write({ "test/contract/provenance.js": `${SPDX}module.exports = ${JSON.stringify([pin])};\n` });
  };
  writePin(copy);
  const ok = await check(t, { oldRoot });
  assert.deepEqual(tagged(ok, "C15"), []);
  assert.match(ok.tree.summary.C15, /1 re-derived byte for byte from 1 old repositories/);
  const changed = copy.replace("const a = 1;", "const a = 9;");
  t.write({ "core/copied.js": changed });
  writePin(changed);
  assert.deepEqual(tagged(await check(t), "C15"), [], "the hashes alone cannot see it");
  assertFails(await check(t, { oldRoot }), "C15", /differs from its re-derivation/);
}));

test("C16: a page.html with an unknown slot, or without a required one, fails", withTree(async (t) => {
  const rel = "providers/syn-csv/page.html";
  const base = t.read(rel);
  t.write({ [rel]: `${base}<template data-slot="colour">red</template>\n` });
  assertFails(await check(t), "C16", /unknown slot "colour"/);
  t.write({ [rel]: base.replace(/<template data-slot="hint">[^<]*<\/template>\n/, "") });
  assertFails(await check(t), "C16", /missing required slot "hint"/);
}));

test("C17: a source file without the SPDX lines fails", withTree(async (t) => {
  t.write({ "core/extra.js": "module.exports = 1;\n" });
  assertFails(await check(t), "C17", /core\/extra\.js: \[C17\]/);
}));

test("C18: a statement file type, a stray .json or a fixtures file without the marker fails", withTree(async (t) => {
  t.write({ "providers/syn-csv/fixtures/real.csv": "a,b\n", "core/data.json": "{}\n", "providers/syn-csv/fixtures/extra.js": `${SPDX}module.exports = {};\n` });
  const r = await check(t);
  assertFails(r, "C18", /real\.csv: \[C18\]/);
  assertFails(r, "C18", /core\/data\.json: \[C18\]/);
  assertFails(r, "C18", /fixtures\/extra\.js: \[C18\] a fixtures file must contain/);
}));

test("C18 with git: an ignored statement file is not tracked and passes; a force-added one fails", withTree(async (t) => {
  t.write({ "statement.pdf": "%PDF-1.4\n" });
  assert.deepEqual(tagged(await check(t), "C18"), []);
  t.git("add", "-f", "statement.pdf");
  assertFails(await check(t), "C18", /statement\.pdf: \[C18\]/);
}, { git: true }));

test("run.js: the exit status is 0 clean, 1 with problems, 2 on a usage error", withTree(async (t) => {
  const run = (...args) => spawnSync(process.execPath, [path.join(REPO, "test", "contract", "run.js"), ...args], { encoding: "utf8" });
  const ok = run("--root", t.root);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /contract \(node tier\): 5 providers, 0 problems/);
  t.write({ "core/extra.js": "x\n" });
  const bad = run("--root", t.root, "--tier", "node");
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /core\/extra\.js: \[C17\]/);
  assert.equal(run("--tier", "nope").status, 2);
  assert.equal(run("--root", t.root, "--provider", "nope").status, 2);
}));

// ---------------------------------------------------------------- C13 (browser tier)

test("C13: the fixtures read in Chrome parse in both branches; an unexpected errors entry fails", { skip: NO_CHROME }, withTree(async (t) => {
  const ok = await check(t, { tier: "browser" });
  assert.deepEqual(ok.problems, []);
  assert.deepEqual(ok.browser.ran, ["_syn-skel", "syn-csv", "syn-invest", "syn-pdf", "syn-sheet"]);
  const cache = path.join(process.env.S2C_PRIVATE, "extract", "cache");
  assert.ok(process.env.S2C_PRIVATE.startsWith(TMP) && fs.readdirSync(cache).length > 0, "the extraction cache of the synthetic fixtures is the temporary one");
  editData(t, "providers/syn-csv/fixtures/statements.js", (s) => ({ ...s, expectErrors: [] }));
  assertFails(await check(t, { tier: "browser" }), "C13", /errors entry for "notes\.csv", which the spec's expectErrors does not list/);
  editData(t, "providers/syn-csv/fixtures/statements.js", (s) => ({ ...s, expectErrors: ["notes.csv", "ledger-b-2026-02.csv"] }));
  assertFails(await check(t, { tier: "browser" }), "C13", /no errors entry for "ledger-b-2026-02\.csv"/);
}));

test("C13 fails, never skips, when Chrome cannot be launched", withTree(async (t) => {
  const chrome = process.env.CHROME;
  process.env.CHROME = path.join(t.tmp, "no-chrome-here");
  try {
    assertFails(await check(t, { tier: "browser" }), "C13", /Chrome cannot be launched/);
  } finally {
    if (chrome === undefined) delete process.env.CHROME;
    else process.env.CHROME = chrome;
  }
}));

// ---------------------------------------------------------------- the pages smoke

const smoke = (t, opts = {}) => require("../smoke/pages.js").runSmoke({ root: t.root, ...opts });

test("smoke: every page of the synthetic tree passes, dist pages and the skeleton's temporary build", { skip: NO_CHROME }, withTree(async (t) => {
  assert.equal(t.build().code, 0);
  const r = await smoke(t);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.pages.map((p) => `${p.id}:${p.source}:${p.instances}`), ["syn-skel:temporary build:4", "syn-csv:dist:4", "syn-invest:dist:4", "syn-pdf:dist:4", "syn-sheet:dist:4"]);
  assert.ok(r.pages.every((p) => p.downloads > 0));
  assert.equal(r.landing.links, 4, "the landing page links the four published pages");
  editData(t, "providers/syn-pdf/provider.js", (d) => ({ ...d, summary: "Another summary" }));
  const browser = await browserLib.launch();
  try {
    const stale = await require("../smoke/pages.js").smokeLanding(browser, t.root);
    assert.deepEqual(stale.problems, ["dist/index.html is stale: run node build/build.js (not tested)"], "only the landing page shows the summary");
  } finally {
    await browser.close();
  }
}));

test("smoke fails: a stale dist page, a page that never warns, a page error, an empty download, overflow, a CSP violation", { skip: NO_CHROME }, withTree(async (t) => {
  assert.equal(t.build().code, 0);
  const only = { providers: ["syn-csv"] };
  const rebuild = () => assert.equal(t.build(["--only", "syn-csv"]).code, 0);
  const has = (r, re) => assert.ok(r.problems.some((m) => re.test(m)), `no problem matches ${re}:\n${r.problems.join("\n") || "(none)"}`);
  edit(t, "providers/syn-csv/page.html", "Drop files here", "Drop your files here");
  has(await smoke(t, only), /dist\/syn-csv\/index\.html is stale/);
  rebuild();
  assert.deepEqual((await smoke(t, only)).problems, []);
  const app = "core/app/statement-app.js";
  const base = t.read(app);
  t.write({ [app]: swap(base, '`<p class="warn">${w}</p>`', '`<p class="note">${w}</p>`') });
  rebuild();
  const quiet = await smoke(t, only);
  has(quiet, /bogus csv file by picker: no #status \.warn line/);
  has(quiet, /bogus csv file by drop: no #status \.warn line/);
  t.write({ [app]: swap(base, "setMode(state.mode);\n}", "setMode(state.mode);\n  self.setTimeout(() => { throw new Error(\"synthetic failure\"); }, 0);\n}") });
  rebuild();
  has(await smoke(t, only), /empty state: (page|console) error: .*synthetic failure/);
  t.write({ [app]: swap(base, "download(f.name, new Blob([f.text], { type: \"text/csv\" }));\n  });\n\n  $(\"#combined\")", "download(f.name, new Blob([]));\n  });\n\n  $(\"#combined\")") });
  rebuild();
  has(await smoke(t, only), /fixtures: accounts: an empty download/);
  const style = t.read("core/page/style.css");
  t.write({ [app]: base, "core/page/style.css": `${style}main { min-width: 700px; }\n` });
  rebuild();
  has(await smoke(t, only), /empty state: horizontal overflow at 390 px/);
  t.write({ [app]: swap(base, "setMode(state.mode);\n}", "setMode(state.mode);\n  new Image().src = \"https://example.invalid/pixel.png\";\n}"), "core/page/style.css": style });
  rebuild();
  has(await smoke(t, only), /empty state: CSP violation: img-src/);
}));

// ---------------------------------------------------------------- the fixtures golden

const golden = (t, opts = {}) => require("../smoke/fixtures-golden.js").runGolden({ root: t.root, ...opts });

test("fixtures golden: without expected.js it asks for --update; --update writes it; then it passes", { skip: NO_CHROME }, withTree(async (t) => {
  assert.equal(t.build().code, 0);
  const first = await golden(t, { providers: ["syn-skel"] });
  assert.equal(first.providers.length, 1);
  assert.equal(first.problems.length, 1);
  assert.match(first.problems[0], /fixtures\/expected\.js is missing: run node test\/smoke\/fixtures-golden\.js --update --provider syn-skel/);
  const up = await golden(t, { update: true });
  assert.equal(up.providers.length, 5, "every provider with fixtures, the skeleton included");
  assert.deepEqual(up.problems, []);
  assert.ok(up.providers.every((p) => p.written));
  const text = t.read("providers/syn-sheet/fixtures/expected.js");
  assert.ok(text.startsWith(SPDX) && text.includes("SYNTHETIC TEST DATA"));
  assert.match(text, /\{ id: "monthly\/last", mode: "monthly", from: "2026-02", to: "2026-02", records: \[/);
  assert.ok(/^[\x09\x0a\x20-\x7e]*$/.test(text), "expected.js is plain ASCII");
  assert.deepEqual((await golden(t)).problems, []);
  assert.deepEqual((await contract.runContract({ root: t.root, tier: "node" })).problems, [], "expected.js passes C17 and C18");
  const again = await golden(t, { update: true, providers: ["syn-sheet"] });
  assert.deepEqual(again.problems, []);
  assert.equal(t.read("providers/syn-sheet/fixtures/expected.js"), text, "--update is reproducible");
}));

test("fixtures golden fails: a page that differs from the downloads hook (and --update refuses), stale fixtures, a changed record", { skip: NO_CHROME }, withTree(async (t) => {
  assert.equal(t.build().code, 0);
  const only = { providers: ["syn-csv"] };
  assert.deepEqual((await golden(t, { ...only, update: true })).problems, []);
  const has = (r, re) => assert.ok(r.problems.some((m) => re.test(m)), `no problem matches ${re}:\n${r.problems.join("\n") || "(none)"}`);
  const expected = t.read("providers/syn-csv/fixtures/expected.js");
  const at = expected.indexOf("states: [");
  t.write({ "providers/syn-csv/fixtures/expected.js": expected.slice(0, at) + expected.slice(at).replace(/size: (\d+),/, (all, n) => `size: ${Number(n) + 1},`) });
  has(await golden(t, only), /expected\.js: state balance\/full: record 0 \(card\) size differs/);
  t.write({ "providers/syn-csv/fixtures/expected.js": expected });
  const app = "core/app/statement-app.js";
  const base = t.read(app);
  t.write({ [app]: swap(base, "const files = [accountsFile()];", "const files = [];") });
  assert.equal(t.build(["--only", "syn-csv"]).code, 0);
  has(await golden(t, only), /the page differs from the downloads hook: record \d+ \(zip\)/);
  const refused = await golden(t, { ...only, update: true });
  has(refused, /expected\.js not written: the page differs from the downloads hook/);
  assert.equal(t.read("providers/syn-csv/fixtures/expected.js"), expected, "nothing was written");
  t.write({ [app]: base });
  assert.equal(t.build(["--only", "syn-csv"]).code, 0);
  editData(t, "providers/syn-csv/fixtures/statements.js", (s) => ({ ...s, files: s.files.map((f) => (f.name === "notes.csv" ? { ...f, text: "hello again\n" } : f)) }));
  has(await golden(t, only), /recorded for other fixture files \(stale: run --update\)/);
}));
