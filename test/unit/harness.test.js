// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The generic per-provider harness (test/harness/run.js) on the synthetic tree of
// test/unit/synthetic-tree.js: every fixtures folder passes, and every rule of every step has a
// failing sample, made by changing one thing (or a few independent things, each asserted by its
// own message) in a fresh copy of the tree, or by giving it another statement folder. The
// private declarations of real statement folders (expectErrors, allowProblems) are tested
// through a temporary user config, and so are the console's privacy and the output guards.
// Synthetic data only: $S2C_PRIVATE, $XDG_CONFIG_HOME and $S2C_STATEMENTS point at a temporary
// directory for this file. The CSV and XLSX providers run with the Node readers; the PDF
// provider, H12 and the PDF dump need the pinned chrome-headless-shell and are skipped, with a
// message, without it.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-harness-"));
process.env.S2C_PRIVATE = path.join(TMP, "private");
process.env.XDG_CONFIG_HOME = path.join(TMP, "config");
process.env.S2C_STATEMENTS = path.join(TMP, "statements");
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const { makeSyntheticTree, SPDX, pdfPage } = require("./synthetic-tree.js");
const harness = require("../harness/run.js");
const browserLib = require("../lib/browser.js");
const { renderXlsx } = require("../lib/mkxlsx.js");
const { renderPdf } = require("../lib/minipdf.js");
const { loadDataModule } = require("../../build/discover.js");
const coreExport = require("../../core/export.js");
const coreFiles = require("../../core/files.js");

const CHROME_READY = fs.existsSync(browserLib.chromePath());
const NO_CHROME = !CHROME_READY && "the pinned chrome-headless-shell is not installed";
const { checks } = harness;

// ---------------------------------------------------------------- helpers

const withTree = (fn) => async () => {
  const t = makeSyntheticTree();
  try {
    return await fn(t);
  } finally {
    t.cleanup();
  }
};

// text with `from` replaced by `to` in a file of the tree, asserting that `from` occurs once.
function edit(t, rel, from, to) {
  const before = t.read(rel);
  assert.equal(before.split(from).length, 2, `expected exactly one ${JSON.stringify(from.slice(0, 50))} in ${rel}`);
  t.write({ [rel]: before.replace(from, () => to) });
}

function editData(t, rel, fn) {
  const obj = loadDataModule(path.join(t.root, rel));
  const next = fn(obj) || obj;
  t.write({ [rel]: `${SPDX}module.exports = ${JSON.stringify(next, null, 2)};\n` });
}

const ledger = (number, currency, rows) => ["Synthetic ledger export", `Account,${number},${currency}`, "Date,Description,Amount,Balance", ...rows].join("\n") + "\n";

// Three ledger accounts in one currency over four months, one file per account and month, a
// file that is not a ledger (junk.csv) and one no reader accepts.
const LEDGERS = {
  "a-2026-01.csv": ledger("L100", "SGD", ["2026-01-05,Salary,1000.00,1000.00", "2026-01-20,Rent,-400.00,600.00"]),
  "a-2026-02.csv": ledger("L100", "SGD", ["2026-02-03,Groceries,-50.00,550.00"]),
  "a-2026-03.csv": ledger("L100", "SGD", ["2026-03-10,Refund,25.00,575.00"]),
  "a-2026-04.csv": ledger("L100", "SGD", ["2026-04-02,Fee,-5.00,570.00"]),
  "b-2026-02.csv": ledger("L200", "SGD", ["2026-02-15,Deposit,200.00,200.00"]),
  "b-2026-03.csv": ledger("L200", "SGD", ["2026-03-15,Interest,1.00,201.00"]),
  "c-2026-03.csv": ledger("L300", "SGD", ["2026-03-20,Deposit,50.00,50.00"]),
  "junk.csv": "hello\n",
  "notes.txt": "not a statement\n",
};
// A ledger month whose balance column does not follow its amounts (off by 5.00).
const BROKEN = { "d-2026-02.csv": ledger("L400", "SGD", ["2026-02-10,Deposit,100.00,100.00", "2026-02-12,Fee,-10.00,95.00"]) };

let folders = 0;
function folder(files) {
  const dir = path.join(TMP, "statements", `set-${++folders}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

// The untracked user config (<config-dir>/statements.js) with these provider entries.
function userConfig(providers = {}) {
  const dir = path.join(process.env.XDG_CONFIG_HOME, "statement2csv");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "statements.js"), `module.exports = ${JSON.stringify({ providers })};\n`);
}

async function run(opts) {
  const lines = [];
  const r = await harness.runHarness({ nodeReaders: true, log: (m) => lines.push(m), ...opts });
  const steps = (id) => Object.fromEntries(r.providers.find((p) => p.id === id).steps.map((s) => [s.id, s]));
  const report = (id) => JSON.parse(fs.readFileSync(path.join(r.out, id, "report.json"), "utf8"));
  const details = (id) => Object.fromEntries(report(id).steps.map((s) => [s.id, s]));
  return { r, lines, steps, report, details };
}

// The one console line of a run-level error: "harness: FAILED: <summary> (details in
// <private-dir>/harness/<run>/error.txt)". Returns the error file's text, after checking that it
// is private (0600 in a 0700 folder).
function errorFileOf(line, summary) {
  const m = /^harness: FAILED: (.+) \(details in <private-dir>\/harness\/([^/ ]+)\/error\.txt\)$/.exec(line);
  assert.ok(m, `not the fixed failure line: ${line}`);
  assert.equal(m[1], summary);
  const file = path.join(process.env.S2C_PRIVATE, "harness", m[2], "error.txt");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  return fs.readFileSync(file, "utf8");
}

// One provider on a statement folder (the declarations come from the user config).
const runOn = (t, id, dir, opts = {}) => run({ root: t.root, provider: id, statements: [dir], ...opts });
const fixturesOf = (t, id) => path.join(t.root, "providers", id === "syn-skel" ? "_syn-skel" : id, "fixtures");

function assertStatus(res, id, step, status, re) {
  const s = res.steps(id)[step];
  assert.ok(s, `no ${step} in the run of ${id}`);
  const d = res.details(id)[step];
  assert.equal(s.status, status, `${id} ${step}: ${s.summary}\n${d.problems.join("\n")}`);
  if (re) assert.ok(d.problems.some((m) => re.test(m)) || re.test(s.summary), `${id} ${step}: no problem matches ${re}:\n${d.problems.join("\n")}\n${s.summary}`);
}

test.beforeEach(() => userConfig({}));

// ---------------------------------------------------------------- arguments

test("parseArgs: the CLI of the design, and its usage errors", () => {
  const o = harness.parseArgs(["--provider", "syn-csv", "--statements", "x", "--browser", "--dump", "--reference", "r.json", "--allow-unknown", "--no-strict", "--out", "o", "--only", "h5,H8,h6b", "--node-readers"]);
  assert.equal(o.provider, "syn-csv");
  assert.deepEqual(o.statements, ["x"]);
  assert.equal(o.browser && o.dump && o.allowUnknown && o.nodeReaders, true);
  assert.equal(o.strict, false);
  assert.equal(o.reference, path.resolve("r.json"));
  assert.equal(o.out, path.resolve("o"));
  assert.deepEqual([...o.only].sort(), ["H5", "H6b", "H8"]);
  assert.equal(harness.parseArgs(["--all-fixtures", "--strict"]).strict, true);
  for (const [argv, re] of [
    [[], /--provider <id> or --all-fixtures/],
    [["--provider", "a", "--all-fixtures"], /not both/],
    [["--all-fixtures", "--statements", "x"], /--statements goes with --provider/],
    [["--all-fixtures", "--reference", "x"], /--reference goes with --provider/],
    [["--provider", "a", "--strict", "--no-strict"], /exclude each other/],
    [["--provider", "a", "--only", "H15"], /unknown step/],
    [["--provider", "a", "--only", "H12"], /needs --browser/],
    [["--provider", "a", "--only", "H13"], /needs --dump/],
    [["--provider", "a", "--only", "H14"], /needs --reference/],
    [["--provider", "Not An Id"], /not a provider id/],
    [["--provider"], /needs a value/],
    [["--provider", "a", "--bogus"], /unknown argument/],
  ]) assert.throws(() => harness.parseArgs(argv), (e) => e instanceof harness.UsageError && re.test(e.message), argv.join(" "));
});

test("main: exit 0 on a pass, 1 on a failure, 2 for a usage error; nothing private on the console", withTree(async (t) => {
  const out = [], err = [];
  const io = { log: (m) => out.push(m), err: (m) => err.push(m) };
  assert.equal(await harness.main(["--provider", "syn-csv", "--root", t.root, "--statements", fixturesOf(t, "syn-csv"), "--node-readers"], io), 0);
  assert.match(out[out.length - 1], /^harness: 1 provider, 0 failed; details in <private-dir>\/harness\//);
  assert.equal(await harness.main(["--provider", "syn-csv", "--root", t.root, "--statements", folder(LEDGERS), "--node-readers"], io), 1, "junk.csv is not declared");
  assert.equal(await harness.main(["--bogus"], io), 2);
  assert.equal(await harness.main(["--provider", "nope", "--root", t.root], io), 2);
  assert.match(err.join("\n"), /no provider "nope"/);
  // An output folder inside this repository is refused: one fixed console line, the message in a
  // private file.
  err.length = 0;
  assert.equal(await harness.main(["--provider", "syn-csv", "--root", t.root, "--statements", fixturesOf(t, "syn-csv"), "--node-readers", "--out", path.join(REPO, "out-harness")], io), 1);
  assert.equal(err.length, 1, err.join("\n"));
  assert.match(errorFileOf(err[0], "the output folder cannot be used"), /refusing to write .*out-harness: it is inside this repository/);
  assert.equal(fs.existsSync(path.join(REPO, "out-harness")), false);
  // main's temporary folder is gone, and so is runHarness's.
  assert.deepEqual(fs.readdirSync(path.join(process.env.S2C_PRIVATE, "tmp")), []);
}));

// ---------------------------------------------------------------- the passing tree

test("--all-fixtures: every fixtures folder of the synthetic tree passes (Node readers for CSV and XLSX)", withTree(async (t) => {
  const res = await run({ root: t.root, allFixtures: true });
  const ids = res.r.providers.map((p) => p.id);
  assert.deepEqual(ids, ["syn-skel", "syn-csv", "syn-invest", "syn-pdf", "syn-sheet"], "skeletons included, code-point order of the folders");
  for (const p of res.r.providers) {
    if (p.id === "syn-pdf" && !CHROME_READY) continue; // its PDFs are read in Chrome
    assert.equal(p.ok, true, `${p.id}:\n${res.lines.join("\n")}`);
  }
  const csv = res.steps("syn-csv");
  for (const s of ["H1", "H2", "H3", "H4", "H5", "H6", "H6b", "H7", "H8", "H9", "H10", "H11"]) assert.equal(csv[s].status, "pass", `${s}: ${csv[s].summary}`);
  assert.equal(csv.H5.counts.declared, 1, "the spec's expectErrors (notes.csv)");
  assert.equal(csv.H10.counts.reversed, "same");
  const invest = res.steps("syn-invest");
  assert.equal(invest.H8.counts.entryHeaders, 6, "the Combined zip's two entries in the 3 holdings states, each against its writer");
  assert.equal(invest.H9.counts.checks, 5, "rename, exclude, kind, merge and same name");
  const sheet = res.steps("syn-sheet");
  for (const s of ["H6b", "H7", "H9", "H11"]) assert.equal(sheet[s].status, "n/a", `${s} does not apply to a custom app without a configurator`);
  assert.equal(sheet.H10.counts.reversed, "skipped");
  assert.match(res.steps("syn-skel").H10.summary, /reversed order: skipped \(one input\)/, "a multiple-file picker with one input");
  assert.equal(res.steps("syn-skel").H11.status, "skip", "a skeleton without frozen.js");
  // Every report is private: 0600 in 0700 folders under <private-dir>/harness/<run>.
  assert.ok(res.r.out.startsWith(path.join(process.env.S2C_PRIVATE, "harness") + path.sep));
  assert.equal(fs.statSync(res.r.out).mode & 0o777, 0o700);
  assert.equal(fs.statSync(path.join(res.r.out, "syn-csv", "report.json")).mode & 0o777, 0o600);
  assert.equal(res.report("syn-csv").source, "fixtures folder");
}));

test("a real statement folder with its private declaration passes every step", withTree(async (t) => {
  const dir = folder(LEDGERS);
  userConfig({ "syn-csv": { dir, expectErrors: ["junk.csv"] } });
  const res = await run({ root: t.root, provider: "syn-csv" });
  assert.equal(res.r.ok, true, res.lines.join("\n"));
  const s = res.steps("syn-csv");
  assert.equal(s.H2.counts.inputs, 8);
  assert.equal(s.H2.counts.ignored, 1, "notes.txt");
  assert.equal(s.H5.counts.errors, 1);
  assert.equal(s.H7.counts.ran, 5, "all five gap cases run on four months");
  assert.equal(s.H9.counts.checks, 5, "rename, exclude, kind, merge and same name");
  assert.equal(s.H10.counts.reversed, "same");
  assert.equal(res.report("syn-csv").source, "user config");
}));

// ---------------------------------------------------------------- private declarations

test("private declarations: H5 requires exactly the declared errors", withTree(async (t) => {
  const dir = folder(LEDGERS);
  let res = await runOn(t, "syn-csv", dir, { only: new Set(["H5"]) });
  assertStatus(res, "syn-csv", "H5", "fail", /junk\.csv: an error that the private declaration expectErrors does not list/);
  userConfig({ "syn-csv": { expectErrors: ["junk.csv", "a-2026-01.csv"] } });
  res = await runOn(t, "syn-csv", dir, { only: new Set(["H5"]) });
  assertStatus(res, "syn-csv", "H5", "fail", /a-2026-01\.csv: listed in the private declaration expectErrors, but gives no error/);
  assert.equal(res.steps("syn-csv").H5.counts.missing, 1);
  userConfig({ "syn-csv": { expectErrors: ["junk.csv"] } });
  res = await runOn(t, "syn-csv", dir, { only: new Set(["H5"]) });
  assertStatus(res, "syn-csv", "H5", "pass");
  assert.match(res.details("syn-csv").H5.notes.join("\n"), /junk\.csv: a declared error/);
}));

test("private declarations: H6 allows at most allowProblems lines; in strict mode H6b counts against the rest", withTree(async (t) => {
  const dir = folder({ ...LEDGERS, ...BROKEN });
  const only = new Set(["H6", "H6b"]);
  const go = async (allowProblems, opts = {}) => {
    userConfig({ "syn-csv": { expectErrors: ["junk.csv"], allowProblems } });
    return runOn(t, "syn-csv", dir, { only, ...opts });
  };
  // The broken month gives 3 H6 lines (the card problem and two running balances) and 1 H6b line.
  let res = await go(2);
  assertStatus(res, "syn-csv", "H6", "fail", /entries don't add up/);
  assert.equal(res.steps("syn-csv").H6.counts.lines, 3);
  res = await go(3);
  assertStatus(res, "syn-csv", "H6", "pass");
  assertStatus(res, "syn-csv", "H6b", "fail", /opening .* plus its entries gives/);
  res = await go(4);
  assertStatus(res, "syn-csv", "H6", "pass");
  assertStatus(res, "syn-csv", "H6b", "pass");
  res = await go(3, { strict: false });
  assertStatus(res, "syn-csv", "H6b", "report");
  assert.equal(res.r.ok, true, "a reported step does not fail the run");
}));

test("a fixtures folder never uses the private declarations", withTree(async (t) => {
  userConfig({ "syn-csv": { expectErrors: ["no-such-file.csv"], allowProblems: 7 } });
  const res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H5", "H6"]) });
  assertStatus(res, "syn-csv", "H5", "pass");
  assert.deepEqual(res.report("syn-csv").expectErrors, ["notes.csv"]);
  assert.equal(res.report("syn-csv").allowProblems, 0);
  assert.equal(res.steps("syn-csv").H6.counts.allowed, 0);
}));

test("the console shows counts only; names and amounts stay in the report", withTree(async (t) => {
  const dir = folder({
    "secret-name-2026-01.csv": ledger("SECRETNO7", "SGD", ["2026-01-05,Secret payee,1000.00,1000.00", "2026-01-20,Secret rent,-400.00,612.34"]),
    "secret-junk.csv": "hello\n",
  });
  const res = await runOn(t, "syn-csv", dir);
  assert.equal(res.r.ok, false);
  const text = res.lines.join("\n");
  for (const s of ["secret", "SECRET", "612.34", "Secret payee"]) assert.ok(!text.includes(s), `the console shows ${s}:\n${text}`);
  const report = JSON.stringify(res.report("syn-csv"));
  assert.ok(report.includes("secret-junk.csv") && report.includes("SECRETNO7"), "the report keeps the details");
}));

test("a run-level error prints one fixed line, whatever its message holds; the message goes to a private file", withTree(async (t) => {
  // A configured folder that does not exist, named with spaces (no mask can tell where such a
  // path ends).
  const missing = path.join(process.env.S2C_STATEMENTS, "Jane Q Public savings");
  userConfig({ "syn-csv": { dir: missing } });
  const out = [], err = [];
  const io = { log: (m) => out.push(m), err: (m) => err.push(m) };
  assert.equal(await harness.main(["--provider", "syn-csv", "--root", t.root, "--node-readers"], io), 1);
  assert.deepEqual(out, []);
  assert.equal(err.length, 1, err.join("\n"));
  for (const word of ["Jane", "Public", "savings", TMP]) assert.ok(!err[0].includes(word), `the console shows ${word}: ${err[0]}`);
  assert.match(errorFileOf(err[0], "the statement folder cannot be resolved"), /statement folder for syn-csv \(user config\) does not exist: .*Jane Q Public savings/);
  // A user config that does not load: every private write reads its refuse list, so the line
  // names the file and nothing is written.
  fs.writeFileSync(path.join(process.env.XDG_CONFIG_HOME, "statement2csv", "statements.js"), "module.exports = { providers: { \"syn-csv\": { dir: \"Jane Q Public\" } } };\n");
  err.length = 0;
  assert.equal(await harness.main(["--provider", "syn-csv", "--root", t.root, "--node-readers"], io), 1);
  assert.deepEqual(err, ["harness: FAILED: the user config (<config-dir>/statements.js) cannot be loaded"]);
  await assert.rejects(run({ root: t.root, provider: "syn-csv" }), (e) => e instanceof harness.RunError && e.summary === "the user config cannot be loaded" && /providers\.syn-csv\.dir must be an absolute path/.test(e.message));
}));

test("a <private-dir> the guards refuse: a fixed line that names the guard, and nothing written", async () => {
  const saved = process.env.S2C_PRIVATE;
  process.env.S2C_PRIVATE = path.join(REPO, "harness-private-test");
  try {
    const err = [];
    assert.equal(await harness.main(["--provider", "syn-csv", "--root", TMP], { log() {}, err: (m) => err.push(m) }), 1);
    assert.deepEqual(err, ["harness: FAILED: the private directory cannot be used (it is inside this repository)"]);
    assert.equal(fs.existsSync(process.env.S2C_PRIVATE), false);
    assert.equal(checks.failureLine(new Error("x"), "run-1"), "harness: FAILED (the details cannot be written to <private-dir>)");
  } finally {
    process.env.S2C_PRIVATE = saved;
  }
  assert.equal(checks.privateDirReason(new Error("refusing to write /a b/c d: it is inside the statement folder of syn-csv")), "it is inside the statement folder of syn-csv");
  assert.equal(checks.privateDirReason(new Error("refusing to write /a b/c d: it is inside a path in the user config's refuse list")), "it is inside a path in the user config's refuse list");
  assert.equal(checks.privateDirReason(Object.assign(new Error("EACCES: permission denied, mkdir '/a b/c'"), { code: "EACCES" })), "EACCES");
  assert.equal(checks.privateDirReason(new Error("cannot load the user config /a b/statements.js: boom")), "the user config cannot be loaded");
  assert.equal(checks.privateDirReason(new Error("refusing to write /a b: it is inside Jane's folder")), "set $S2C_PRIVATE to a usable folder");
});

test("no output goes inside a statement folder the run reads, wherever that folder lies", withTree(async (t) => {
  // A --statements folder outside <statements-dir> and every configured folder.
  const dir = path.join(TMP, "elsewhere", "my bank folder");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "a-2026-01.csv"), LEDGERS["a-2026-01.csv"]);
  const refused = (summary) => (e) => e instanceof harness.RunError && e.summary === summary && /inside a statement folder this run reads/.test(e.message);
  await assert.rejects(run({ root: t.root, provider: "syn-csv", statements: [dir], out: path.join(dir, "harness-out"), dump: true, only: new Set(["H13"]) }), refused("the output folder cannot be used"));
  await assert.rejects(run({ root: t.root, provider: "syn-csv", statements: [dir], work: path.join(dir, "tmp") }), refused("the folder for the run's temporary files cannot be used"));
  // A fixtures folder is read too.
  const fx = fixturesOf(t, "syn-csv");
  await assert.rejects(run({ root: t.root, provider: "syn-csv", statements: [fx], out: path.join(fx, "out") }), refused("the output folder cannot be used"));
  const err = [];
  assert.equal(await harness.main(["--provider", "syn-csv", "--root", t.root, "--statements", dir, "--node-readers", "--dump", "--out", path.join(dir, "harness-out")], { log() {}, err: (m) => err.push(m) }), 1);
  assert.match(errorFileOf(err[0], "the output folder cannot be used"), /inside a statement folder this run reads/);
  assert.deepEqual(fs.readdirSync(dir), ["a-2026-01.csv"], "nothing was written in the statement folder");
  assert.deepEqual(fs.readdirSync(fx).sort(), ["statements.js"]);
  // Next to it is fine.
  const res = await run({ root: t.root, provider: "syn-csv", statements: [dir], out: path.join(TMP, "elsewhere", "harness-out"), dump: true, only: new Set(["H13"]) });
  assertStatus(res, "syn-csv", "H13", "pass");
}));

// ---------------------------------------------------------------- one sample per step

test("H1: the Node branch must load (fatal), and the page branch must define the parser global", withTree(async (t) => {
  t.remove("providers/syn-sheet/test.js");
  let res = await runOn(t, "syn-sheet", fixturesOf(t, "syn-sheet"));
  assertStatus(res, "syn-sheet", "H1", "fail", /a custom app needs test\.js/);
  assertStatus(res, "syn-sheet", "H5", "fail", /blocked: H1 did not complete/);
  editData(t, "providers/syn-csv/provider.js", (D) => ({ ...D, parserGlobal: "SynCsvElsewhere" }));
  res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H1", "H5"]) });
  assertStatus(res, "syn-csv", "H1", "fail", /does not define self\.SynCsvElsewhere/);
  assertStatus(res, "syn-csv", "H5", "pass", null);
}));

test("H1: the parser global exports the same names in Node and in the page", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "return { parseStatements };", 'return typeof module === "object" && module.exports ? { parseStatements, nodeOnly: 1 } : { parseStatements };');
  const res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H1"]) });
  assertStatus(res, "syn-csv", "H1", "fail", /the parser global exports parseStatements in the page, nodeOnly, parseStatements in Node/);
}));

test("--all-fixtures: a descriptor that cannot be loaded is a failing target, never left out", withTree(async (t) => {
  t.write({ "providers/syn-broken/provider.js": `${SPDX}module.exports = {\n` });
  const res = await run({ root: t.root, allFixtures: true, only: new Set(["H1"]) });
  assert.deepEqual(res.r.providers.map((p) => p.id), ["syn-skel", "syn-broken", "syn-csv", "syn-invest", "syn-pdf", "syn-sheet"]);
  assertStatus(res, "syn-broken", "H1", "fail", /the descriptor cannot be loaded: SyntaxError/);
  assert.equal(res.r.ok, false);
}));

test("H2: a folder without an accepted file fails (fatal); other entries are counted and ignored", withTree(async (t) => {
  const res = await runOn(t, "syn-csv", folder({ "readme.txt": "x", "statement.pdf": "not ours" }));
  assertStatus(res, "syn-csv", "H2", "fail", /the folder has no input file/);
  assert.equal(res.steps("syn-csv").H2.counts.ignored, 2);
  assertStatus(res, "syn-csv", "H8", "fail", /blocked: H2/);
}));

test("H2: a file in the statement folder that links outside it is refused", withTree(async (t) => {
  const outside = path.join(TMP, "outside-ledger.csv");
  fs.writeFileSync(outside, LEDGERS["a-2026-01.csv"]);
  const dir = folder({ "b-2026-02.csv": LEDGERS["b-2026-02.csv"] });
  fs.symlinkSync(outside, path.join(dir, "a-2026-01.csv"));
  const res = await runOn(t, "syn-csv", dir, { only: new Set(["H2", "H5"]) });
  assertStatus(res, "syn-csv", "H2", "fail", /refusing to read .*: it is not inside a statement folder/);
  assertStatus(res, "syn-csv", "H5", "fail", /blocked: H2 did not complete/);
}));

test("H2: a real folder is read in code-point order, which decides which of two copies is the duplicate", withTree(async (t) => {
  // The parser keeps the first of two identical exports and names the later one.
  edit(t, "providers/syn-csv/parser.js", "const st = parseExport(s.csv);",
    'if (seen.has(`text|${s.csv}`)) { errors.push({ id: s.id, error: "duplicate export, ignored" }); continue; } seen.add(`text|${s.csv}`); const st = parseExport(s.csv);');
  // "-" sorts before ".": the copy is read first, and the original is the duplicate.
  const dir = folder({ "a-2026-01.csv": LEDGERS["a-2026-01.csv"], "a-2026-01-copy.csv": LEDGERS["a-2026-01.csv"] });
  userConfig({ "syn-csv": { expectErrors: ["a-2026-01.csv"] } });
  const res = await runOn(t, "syn-csv", dir, { only: new Set(["H2", "H5"]) });
  assertStatus(res, "syn-csv", "H5", "pass");
  assert.deepEqual(res.report("syn-csv").inputs.map((i) => i.name), ["a-2026-01-copy.csv", "a-2026-01.csv"]);
}));

test("H3: a reader failure must be declared", withTree(async (t) => {
  const good = renderXlsx({ "Synthetic Ledger": [["Date", "Description", "Amount", "Currency"], ["2026-01-05", "Deposit", 500, "USD"], ["2026-02-10", "Fee", -5, "USD"]] });
  const dir = folder({ "good.xlsx": good, "broken.xlsx": "not a zip" });
  let res = await runOn(t, "syn-sheet", dir, { only: new Set(["H3", "H5"]) });
  assertStatus(res, "syn-sheet", "H3", "fail", /broken\.xlsx: the reader fails/);
  userConfig({ "syn-sheet": { expectErrors: ["broken.xlsx"] } });
  res = await runOn(t, "syn-sheet", dir, { only: new Set(["H3", "H5"]) });
  assertStatus(res, "syn-sheet", "H3", "pass");
  assertStatus(res, "syn-sheet", "H5", "pass");
  assert.equal(res.steps("syn-sheet").H3.counts.readerFailures, 1);
}));

test("H4: a parser that throws on a file fails", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "const st = parseExport(s.csv);", 'if (String(s.csv).includes("BOOM")) throw new Error("synthetic failure"); const st = parseExport(s.csv);');
  let res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H4"]) });
  assertStatus(res, "syn-csv", "H4", "pass");
  assert.equal(res.steps("syn-csv").H4.counts.errors, 1, "notes.csv alone has an errors entry");
  const dir = folder({ ...LEDGERS, "boom.csv": ledger("L900", "SGD", ["2026-01-05,BOOM,1.00,1.00"]) });
  userConfig({ "syn-csv": { expectErrors: ["junk.csv"] } });
  res = await runOn(t, "syn-csv", dir, { only: new Set(["H4", "H5"]) });
  assertStatus(res, "syn-csv", "H4", "fail", /boom\.csv: parse throws on this file alone: Error: synthetic failure/);
  assertStatus(res, "syn-csv", "H5", "fail", /parseStatements throws/);
}));

test("H5: warnings fail unless testing.allowWarnings; unknown rows fail unless --allow-unknown", withTree(async (t) => {
  const dir = folder({ ...LEDGERS, "e-2026-02.csv": ledger("L500", "SGD", ["2026-02-05,Deposit,10.00,10.00", "not a row"]) });
  userConfig({ "syn-csv": { expectErrors: ["junk.csv"] } });
  const only = new Set(["H5"]);
  let res = await runOn(t, "syn-csv", dir, { only });
  assertStatus(res, "syn-csv", "H5", "fail", /warning: e-2026-02\.csv: row not understood/);
  editData(t, "providers/syn-csv/provider.js", (D) => ({ ...D, testing: { ...D.testing, allowWarnings: true } }));
  res = await runOn(t, "syn-csv", dir, { only });
  assertStatus(res, "syn-csv", "H5", "pass");
  assert.equal(res.steps("syn-csv").H5.counts.warnings, 1);
  edit(t, "providers/syn-csv/parser.js", "skippedRows: [] });", 'skippedRows: [{ date: "2026-01-05", category: "unknown", detail: "mystery" }] });');
  res = await runOn(t, "syn-csv", dir, { only });
  assertStatus(res, "syn-csv", "H5", "fail", /a skipped row of category "unknown"/);
  res = await runOn(t, "syn-csv", dir, { only, allowUnknown: true });
  assertStatus(res, "syn-csv", "H5", "pass");
  assert.equal(res.steps("syn-csv").H5.counts.unknown, 1);
}));

test("H5: checkResult warnings fail in strict mode only; a custom app's {error} fails", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "names: [label]", 'names: [label, "Renamed later"]');
  let res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H5"]) });
  assertStatus(res, "syn-csv", "H5", "fail", /checkResult: strict: portfolios\[0\]\.names does not end with its label/);
  res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H5"]), strict: false });
  assertStatus(res, "syn-csv", "H5", "pass");
  assert.ok(res.steps("syn-csv").H5.counts.checkWarnings > 0);
  const wrong = renderXlsx({ "Another Sheet": [["Date"], ["2026-01-05"]] });
  const dir = folder({ "wrong.xlsx": wrong });
  res = await runOn(t, "syn-sheet", dir, { only: new Set(["H4", "H5"]) });
  assertStatus(res, "syn-sheet", "H5", "fail", /mode plain: the inputs give \{error\}: not a synthetic ledger workbook/);
  assert.equal(res.steps("syn-sheet").H4.counts.errors, 1);
  userConfig({ "syn-sheet": { expectErrors: ["wrong.xlsx"] } });
  res = await runOn(t, "syn-sheet", dir, { only: new Set(["H5"]) });
  assertStatus(res, "syn-sheet", "H5", "pass");
}));

test("H5 (custom app): warnings fail unless testing.allowWarnings; test.checkResult problems fail", withTree(async (t) => {
  edit(t, "providers/syn-sheet/parser.js", 'return { account: { name: "Synthetic Sheet"', 'return { warnings: ["synthetic informational warning"], account: { name: "Synthetic Sheet"');
  const fx = fixturesOf(t, "syn-sheet");
  let res = await runOn(t, "syn-sheet", fx, { only: new Set(["H5"]) });
  assertStatus(res, "syn-sheet", "H5", "fail", /mode plain: warning: synthetic informational warning/);
  editData(t, "providers/syn-sheet/provider.js", (D) => ({ ...D, testing: { ...D.testing, allowWarnings: true } }));
  res = await runOn(t, "syn-sheet", fx, { only: new Set(["H5"]) });
  assertStatus(res, "syn-sheet", "H5", "pass");
  assert.equal(res.steps("syn-sheet").H5.counts.warnings, 2, "one per mode");
  edit(t, "providers/syn-sheet/test.js", "  reconcile() {", "  checkResult(result, ctx) {\n    return [`${ctx.mode}: synthetic check problem`];\n  },\n  reconcile() {");
  res = await runOn(t, "syn-sheet", fx, { only: new Set(["H5"]) });
  assertStatus(res, "syn-sheet", "H5", "fail", /mode monthly: test\.checkResult: monthly: synthetic check problem/);
  assert.equal(res.steps("syn-sheet").H5.counts.checkErrors, 2);
}));

test("H5 (statement app) in Chrome: a declared reader failure is the declared error, both ways", { skip: NO_CHROME }, withTree(async (t) => {
  const good = renderPdf(pdfPage("2026-01", "100.00", "180.00", [["2026-01-04", "Deposit", "100.00"], ["2026-01-18", "Card payment", "-20.00"]]));
  const dir = folder({ "statement-2026-01.pdf": good, "broken.pdf": "not a pdf" });
  const only = new Set(["H3", "H5"]);
  let res = await runOn(t, "syn-pdf", dir, { only, nodeReaders: false });
  assertStatus(res, "syn-pdf", "H3", "fail", /broken\.pdf: the reader fails/);
  assertStatus(res, "syn-pdf", "H5", "fail", /broken\.pdf: an error that the private declaration expectErrors does not list: the reader fails/);
  userConfig({ "syn-pdf": { expectErrors: ["broken.pdf"] } });
  res = await runOn(t, "syn-pdf", dir, { only, nodeReaders: false });
  assertStatus(res, "syn-pdf", "H3", "pass");
  assertStatus(res, "syn-pdf", "H5", "pass");
  assert.match(res.details("syn-pdf").H5.notes.join("\n"), /broken\.pdf: a declared error: the reader fails/);
}));

test("H6: a custom app's test.reconcile lines count against the declaration", withTree(async (t) => {
  edit(t, "providers/syn-sheet/test.js", "reconcile() {\n    return [];", 'reconcile(result, ctx) {\n    return [`${ctx.mode}: synthetic problem`];');
  let res = await runOn(t, "syn-sheet", fixturesOf(t, "syn-sheet"), { only: new Set(["H6"]) });
  assertStatus(res, "syn-sheet", "H6", "fail", /plain: synthetic problem/);
  assert.equal(res.steps("syn-sheet").H6.counts.lines, 2, "one line per mode");
  const good = renderXlsx({ "Synthetic Ledger": [["Date", "Description", "Amount", "Currency"], ["2026-01-05", "Deposit", 500, "USD"]] });
  userConfig({ "syn-sheet": { allowProblems: 2 } });
  res = await runOn(t, "syn-sheet", folder({ "good.xlsx": good }), { only: new Set(["H6"]) });
  assertStatus(res, "syn-sheet", "H6", "pass");
}));

test("H6: a statement app's test.reconcile lines count; an investment needs one trade line per trade", withTree(async (t) => {
  t.write({ "providers/syn-csv/test.js": `${SPDX}module.exports = { reconcile(result, ctx) { return [\`synthetic reconcile line (\${ctx.mode})\`]; } };\n` });
  let res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H6"]) });
  assertStatus(res, "syn-csv", "H6", "fail", /synthetic reconcile line \(balance\)/);
  assert.equal(res.steps("syn-csv").H6.counts.lines, 1);
  // testing.reconcile "custom": test.reconcile in every mode instead, and H6b does not apply.
  editData(t, "providers/syn-csv/provider.js", (D) => ({ ...D, testing: { ...D.testing, reconcile: "custom" } }));
  res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H6", "H6b"]) });
  assertStatus(res, "syn-csv", "H6", "fail", /synthetic reconcile line \(holdings\)/);
  assert.equal(res.steps("syn-csv").H6.counts.lines, 3, "one line in each of the 3 modes");
  assert.equal(res.steps("syn-csv").H6b.status, "n/a");
  t.remove("providers/syn-csv/test.js");
  res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H6"]) });
  assertStatus(res, "syn-csv", "H6", "fail", /test\.js exports no reconcile hook/);
  res = await runOn(t, "syn-invest", fixturesOf(t, "syn-invest"), { only: new Set(["H6"]) });
  assertStatus(res, "syn-invest", "H6", "pass");
  // An adjustedEntries override whose trade log has no trade lines.
  edit(t, "providers/syn-invest/parser.js", "return { parseStatements };",
    'return { parseStatements, adjustedEntries(a, from, to, e, withTrades) { const r = E.adjustedEntries(a, from, to, e, withTrades); return { ...r, entries: r.entries.filter((x) => x.kind !== "trade") }; } };');
  res = await runOn(t, "syn-invest", fixturesOf(t, "syn-invest"), { only: new Set(["H6"]) });
  assertStatus(res, "syn-invest", "H6", "fail", /Brokerage B1 \(trade log\): 0 trade lines for 4 trades/);
  assert.equal(res.steps("syn-invest").H6.counts.lines, 1);
}));

test("H6b: a month whose opening plus entries is not its closing (strict: fails; not strict: reported)", withTree(async (t) => {
  // An openingBalance override that is wrong for single months after the first: the running
  // balance over the full range (H6) is right, the per-month check (H6b) is not.
  edit(t, "providers/syn-csv/parser.js", "return { parseStatements };",
    'return { parseStatements, openingBalance(a, from, to, e, entries) { const r = E.openingBalance(a, from, to, e, entries); return r && from && from === to && from > "2026-01" ? { balance: r.balance + 1, date: r.date } : r; } };');
  const dir = folder(LEDGERS);
  userConfig({ "syn-csv": { expectErrors: ["junk.csv"] } });
  let res = await runOn(t, "syn-csv", dir, { only: new Set(["H6", "H6b"]) });
  assertStatus(res, "syn-csv", "H6", "pass");
  assertStatus(res, "syn-csv", "H6b", "fail", /2026-02: opening .* plus its entries gives/);
  res = await runOn(t, "syn-csv", dir, { only: new Set(["H6b"]), strict: false });
  assertStatus(res, "syn-csv", "H6b", "report");
}));

test("H7: bridges plus firstOpenings must reach every loaded closing after a drop", withTree(async (t) => {
  const dir = folder(LEDGERS);
  userConfig({ "syn-csv": { expectErrors: ["junk.csv"] } });
  let res = await runOn(t, "syn-csv", dir, { only: new Set(["H7"]) });
  assertStatus(res, "syn-csv", "H7", "pass");
  // A parser that leaves out firstOpenings: dropping the first month leaves an account opening
  // with a balance nothing accounts for.
  edit(t, "providers/syn-csv/parser.js", "return A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] });",
    "const out = A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] }); out.firstOpenings = []; return out;");
  res = await runOn(t, "syn-csv", dir, { only: new Set(["H7"]) });
  assertStatus(res, "syn-csv", "H7", "fail", /the first month \(2026-01\).*misses 3 of 3 loaded closings/);
  res = await runOn(t, "syn-csv", dir, { only: new Set(["H7"]), strict: false });
  assertStatus(res, "syn-csv", "H7", "report");
  res = await runOn(t, "syn-csv", folder({ "a-2026-01.csv": LEDGERS["a-2026-01.csv"], "a-2026-02.csv": LEDGERS["a-2026-02.csv"] }), { only: new Set(["H7"]) });
  assertStatus(res, "syn-csv", "H7", "skip");
  // One input that holds every month: no case can drop it and keep another.
  const all = ledger("L100", "SGD", ["2026-01-05,Salary,1000.00,1000.00", "2026-02-03,Groceries,-50.00,950.00", "2026-03-10,Refund,25.00,975.00"]);
  res = await runOn(t, "syn-csv", folder({ "all-2026.csv": all }), { only: new Set(["H7"]) });
  assertStatus(res, "syn-csv", "H7", "skip");
  assert.match(res.details("syn-csv").H7.notes.join("\n"), /every input has those months; nothing would be left/);
}));

test("H8: a writer's CSV must have the header's cell count and numbers in numeric columns", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "return { parseStatements };",
    'return { parseStatements, accountsCsv: (rows) => E.csv(["Account type", "Name", "Balance", "Currency", "Balance Date"], rows.map((r) => [r.type, r.name, "n/a", r.currency, r.date, "extra"])) };');
  const res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H8"]) });
  assertStatus(res, "syn-csv", "H8", "fail", /accounts: row 1 has 6 cells, the header 5/);
}));

test("H8: Download all must be the Accounts CSV plus the card files, and the zip names keep _to_", withTree(async (t) => {
  edit(t, "core/files.js", "const files = [accountsFile()];", "const files = [/* no Accounts CSV */];");
  let res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H8"]) });
  assertStatus(res, "syn-csv", "H8", "fail", /Download all holds the Accounts CSV 0 times/);
  assert.match(res.details("syn-csv").H8.problems.join("\n"), /Download all is not the Accounts CSV followed by every card file/);
  edit(t, "core/files.js", "const files = [/* no Accounts CSV */];", "const files = [accountsFile()];");
  edit(t, "core/files.js", "return `${slug}-${which}-${from}_to_${to}.zip`;", "return `${slug}-${which}-${from === to ? from : `${from}_to_${to}`}.zip`;");
  res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H8"]) });
  assertStatus(res, "syn-csv", "H8", "fail", /Download all is named "syn-csv-csv-2026-01\.zip"/);
}));

test("H8: a custom app's zip entries need unique names, and its QIF its header", withTree(async (t) => {
  edit(t, "providers/syn-sheet/files.js", "files: fs.map(({ name, text }) => ({ name, text }))", "files: [...fs, ...fs].map(({ name, text }) => ({ name, text }))");
  let res = await runOn(t, "syn-sheet", fixturesOf(t, "syn-sheet"), { only: new Set(["H8"]) });
  assertStatus(res, "syn-sheet", "H8", "fail", /duplicate entry names/);
  edit(t, "providers/syn-sheet/files.js", "files: [...fs, ...fs].map(", "files: fs.map(");
  edit(t, "providers/syn-sheet/files.js", "ctx.P.qif(entries, start, a.name)", 'ctx.P.qif(entries, start, a.name).replace("!Type:Bank\\n", "")');
  res = await runOn(t, "syn-sheet", fixturesOf(t, "syn-sheet"), { only: new Set(["H8"]) });
  assertStatus(res, "syn-sheet", "H8", "fail", /does not start with !Type:Bank/);
}));

test("H8: a downloads hook that throws, or that returns no array, fails", withTree(async (t) => {
  edit(t, "providers/syn-sheet/test.js", "if (!result || result.error) return [];",
    'if (!result || result.error) return [];\n    if (ctx.mode === "monthly") throw new Error("synthetic hook failure");\n    if (ctx.from !== ctx.to) return null;');
  const res = await runOn(t, "syn-sheet", fixturesOf(t, "syn-sheet"), { only: new Set(["H8"]) });
  assertStatus(res, "syn-sheet", "H8", "fail", /monthly 2026-01 to 2026-02: the downloads hook throws: Error: synthetic hook failure/);
  assertStatus(res, "syn-sheet", "H8", "fail", /plain 2026-01 to 2026-02: the downloads hook does not return an array/);
}));

test("H8: every header comes from the handle: a writer whose header on data is not its empty one, a custom app's hook", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "return { parseStatements };",
    'return { parseStatements, adjustedCsv(a, ...rest) { const text = E.adjustedCsv(a, ...rest); return a.cash.length ? text.replace(/^date,/, "day,") : text; } };');
  let res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H8"]) });
  assertStatus(res, "syn-csv", "H8", "fail", /card transactions of Ledger L100: the header line is not the one the composed writer gives/);
  edit(t, "providers/syn-sheet/test.js", "  reconcile() {", '  expectedHeader(d) {\n    return d.trigger === "card" && d.kind === "transactions" ? "date,amount,currency,payee,notes" : null;\n  },\n  reconcile() {');
  res = await runOn(t, "syn-sheet", fixturesOf(t, "syn-sheet"), { only: new Set(["H8"]) });
  assertStatus(res, "syn-sheet", "H8", "fail", /plain 2026-01 to 2026-02: card transactions: the header line is not the one the composed writer gives/);
}));

test("H8: the names of the Accounts CSV, the Combined CSV and zip and a card QIF; the Combined rows and its entries' headers", withTree(async (t) => {
  const F = "core/files.js";
  edit(t, F, "name: `${brand} accounts - ${span}.csv`", "name: `${brand} account list - ${span}.csv`");
  edit(t, F, "return { name: `${accountPrefix}${label(name)} - ${span}.qif`", "return { name: `${accountPrefix}${label(name)} - qif - ${span}.qif`");
  edit(t, F, "name: combined[0].name,", "name: `x${combined[0].name}`,");
  edit(t, F, 'name: zipName("combined"),', 'name: `x${zipName("combined")}`,');
  // One trade twice in the Combined trades file; both Combined files written with the
  // per-account writers, which have no account column.
  edit(t, F, "trades.push({ account, rows: a.trades.filter((t) => P.inRange(t.date, from, to)) });",
    "{ const rows = a.trades.filter((t) => P.inRange(t.date, from, to)); trades.push({ account, rows: rows.concat(rows.slice(0, 1)) }); }");
  edit(t, F, "text: P.combinedTradesCsv(trades)", "text: P.tradesCsv(trades.flatMap((g) => g.rows), null, null)");
  edit(t, F, "text: P.combinedTransactionsCsv(cash)", "text: P.transactionsCsv(cash.flatMap((g) => g.rows), null, null)");
  let res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H8"]) });
  for (const re of [
    /the Accounts CSV is named "Synthetic Ledger account list - 2026-01_to_2026-03\.csv"/,
    /a card qif file is named "Ledger L100 - qif - 2026-01_to_2026-03\.qif", the span rule gives/,
    /the Combined CSV is named "xSynthetic Ledger all accounts - transactions - 2026-01_to_2026-03\.csv"/,
    /balance 2026-01 to 2026-03: combined: the header line is not the one the composed writer gives/,
  ]) assertStatus(res, "syn-csv", "H8", "fail", re);
  res = await runOn(t, "syn-invest", fixturesOf(t, "syn-invest"), { only: new Set(["H8"]) });
  for (const re of [
    /holdings 2026-01 to 2026-02: the Combined zip is named "xsyn-invest-combined-2026-01_to_2026-02\.zip"/,
    /holdings 2026-01 to 2026-02: the Combined trades file has 5 rows, the cards' trades files 4/,
    /holdings 2026-01 to 2026-02: combined: entry 1: the header line is not the one the composed writer gives/,
    /holdings 2026-01 to 2026-02: combined: entry 2: the header line is not the one the composed writer gives/,
  ]) assertStatus(res, "syn-invest", "H8", "fail", re);
}));

test("H9: the config contract (strict: fails; not strict: reported)", withTree(async (t) => {
  const dir = folder(LEDGERS);
  userConfig({ "syn-csv": { expectErrors: ["junk.csv"] } });
  edit(t, "providers/syn-csv/parser.js", "A.build({ raw, config, months", "A.build({ raw, config: {}, months");
  let res = await runOn(t, "syn-csv", dir, { only: new Set(["H9"]) });
  assertStatus(res, "syn-csv", "H9", "fail", /rename: no account has the new name/);
  const d = res.details("syn-csv").H9.problems.join("\n");
  for (const re of [/exclude: the excluded portfolio's account is still there/, /kind: the account's kind is "bank"/, /merge: the merged portfolio's account is still there/, /same name: no account has the shared name/]) assert.match(d, re);
  res = await runOn(t, "syn-csv", dir, { only: new Set(["H9"]), strict: false });
  assertStatus(res, "syn-csv", "H9", "report");
}));

test("H9: each config check has its own failure: rename, exclude, kind, merge and same name", withTree(async (t) => {
  // Card file names that drop quotes (the rename is a hostile name with quotes).
  edit(t, "core/files.js", "const label = (name) => name;", "const label = (name) => name.replace(/\"/g, \"'\");");
  // Every account follows the mode, whatever its kind.
  edit(t, "core/files.js", ': (name) => (ctx.result().accounts[name].kind !== "investment" ? "balance" : ctx.mode());', ": () => ctx.mode();");
  // A merged month keeps the last member's closing instead of the sum.
  edit(t, "core/assemble.js", "t.closing = E.round2(t.closing + v.closing);", "t.closing = E.round2(v.closing);");
  // An exclusion also drops the first account.
  edit(t, "providers/syn-csv/parser.js", "return A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] });",
    "if (Object.values(config || {}).some((x) => x && x.exclude)) delete raw[Object.keys(raw)[0]]; return A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] });");
  userConfig({ "syn-csv": { expectErrors: ["junk.csv"] } });
  let res = await runOn(t, "syn-csv", folder(LEDGERS), { only: new Set(["H9"]) });
  for (const re of [
    /rename: 2 card files before, 0 named after the new name/,
    /exclude: 1 accounts, 2 expected/,
    /merge: 2026-02: the merged month-end value is 200\.00, the sum 750\.00/,
    /same name: 2026-03: the merged month-end value is 201\.00, the sum 776\.00/,
  ]) assertStatus(res, "syn-csv", "H9", "fail", re);
  res = await runOn(t, "syn-invest", fixturesOf(t, "syn-invest"), { only: new Set(["H9"]) });
  assertStatus(res, "syn-invest", "H9", "fail", /kind: as cash, the account offers valuations files in holdings mode/);
}));

test("H10: two parses must agree; the reversed order must give the same result (strict)", withTree(async (t) => {
  const dir = folder(LEDGERS);
  userConfig({ "syn-csv": { expectErrors: ["junk.csv"] } });
  const build = "return A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] });";
  edit(t, "providers/syn-csv/parser.js", build, "const out = A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] }); out.firstInput = statements.length ? statements[0].id : null; return out;");
  let res = await runOn(t, "syn-csv", dir, { only: new Set(["H10"]) });
  assertStatus(res, "syn-csv", "H10", "fail", /the reversed input order gives another result/);
  res = await runOn(t, "syn-csv", dir, { only: new Set(["H10"]), strict: false });
  assertStatus(res, "syn-csv", "H10", "report");
  edit(t, "providers/syn-csv/parser.js", "out.firstInput = statements.length ? statements[0].id : null;", "out.parses = (globalThis.__harnessTestParses = (globalThis.__harnessTestParses || 0) + 1);");
  res = await runOn(t, "syn-csv", dir, { only: new Set(["H10"]), strict: false });
  assertStatus(res, "syn-csv", "H10", "fail", /two parses of the same inputs give different results/);
}));

test("H10: inputs are deep-frozen for new providers and deep-compared for legacy ones", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "const st = parseExport(s.csv);", "s.touched = true; const st = parseExport(s.csv);");
  let res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H4", "H10"]) });
  assertStatus(res, "syn-csv", "H4", "fail", /Cannot add property touched, object is not extensible/);
  editData(t, "providers/syn-csv/frozen.js", (f) => ({ ...f, legacyRepo: "synthetic-old", legacyUrl: "https://example.invalid/", legacyHead: "0".repeat(40), legacyIndexSha256: "0".repeat(64), legacyDom: null }));
  res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H4", "H10"]) });
  assertStatus(res, "syn-csv", "H4", "pass");
  assertStatus(res, "syn-csv", "H10", "fail", /the parser changed its input statements/);
  assert.match(res.lines[0], /legacy provider, not strict/);
  edit(t, "providers/syn-csv/parser.js", "s.touched = true; const st = parseExport(s.csv);", "const st = parseExport(s.csv);");
  res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H10"]) });
  assertStatus(res, "syn-csv", "H10", "pass");
  assert.match(res.steps("syn-csv").H10.summary, /inputs deep-compared/);
}));

test("H10: a single-file picker skips the reversed order; a parser that writes to its config throws", withTree(async (t) => {
  // Two workbooks on a single-file picker: the hook parses the first only, so the reversed
  // order would give the other workbook's result.
  const sheet = (rows) => renderXlsx({ "Synthetic Ledger": [["Date", "Description", "Amount", "Currency"], ...rows] });
  const dir = folder({ "one.xlsx": sheet([["2026-01-05", "Deposit", 500, "USD"]]), "two.xlsx": sheet([["2026-02-05", "Deposit", 70, "USD"]]) });
  let res = await runOn(t, "syn-sheet", dir, { only: new Set(["H10"]) });
  assertStatus(res, "syn-sheet", "H10", "pass");
  assert.match(res.steps("syn-sheet").H10.summary, /reversed order: skipped \(a single-file picker\)/);
  // Configs are deep-frozen for providers without legacyRepo.
  edit(t, "providers/syn-csv/parser.js", "function parseStatements(statements, config = {}) {", "function parseStatements(statements, config = {}) {\n    config.seenByParser = true;");
  res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H5"]) });
  assertStatus(res, "syn-csv", "H5", "fail", /parseStatements throws: TypeError: Cannot add property seenByParser, object is not extensible/);
}));

test("H11: frozen.configIdPattern must match every portfolio id; null skips", withTree(async (t) => {
  editData(t, "providers/syn-csv/frozen.js", (f) => ({ ...f, configIdPattern: "^X\\d+$" }));
  let res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H11"]) });
  assertStatus(res, "syn-csv", "H11", "fail", /the portfolio id "L100:SGD" does not match/);
  editData(t, "providers/syn-csv/frozen.js", (f) => ({ ...f, configIdPattern: null }));
  res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H11"]) });
  assertStatus(res, "syn-csv", "H11", "skip");
}));

test("H11: a portfolio id that is not a string fails; a pattern that does not compile fails", withTree(async (t) => {
  edit(t, "providers/syn-csv/parser.js", "return A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] });",
    "const out = A.build({ raw, config, months, statements: used, errors, warnings, skippedRows: [] }); if (out.portfolios.length) out.portfolios[0].id = 7; return out;");
  let res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H11"]) });
  assertStatus(res, "syn-csv", "H11", "fail", /the portfolio id 7 does not match/);
  editData(t, "providers/syn-csv/frozen.js", (f) => ({ ...f, configIdPattern: "([" }));
  res = await runOn(t, "syn-csv", fixturesOf(t, "syn-csv"), { only: new Set(["H11"]) });
  assertStatus(res, "syn-csv", "H11", "fail", /frozen\.configIdPattern does not compile/);
}));

test("H13: --dump writes the inputs to the output folder; a blocked folder fails", withTree(async (t) => {
  const out = path.join(TMP, "dump-out");
  let res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], dump: true, out, only: new Set(["H13"]) });
  assertStatus(res, "syn-csv", "H13", "pass");
  const files = fs.readdirSync(path.join(out, "syn-csv", "dump")).sort();
  assert.deepEqual(files, ["001-ledger-a-2026-01.csv.csv.txt", "002-ledger-a-2026-02.csv.csv.txt", "003-ledger-b-2026-02.csv.csv.txt", "004-notes.csv.csv.txt"]);
  assert.equal(fs.statSync(path.join(out, "syn-csv", "dump")).mode & 0o777, 0o700);
  res = await run({ root: t.root, provider: "syn-sheet", statements: [fixturesOf(t, "syn-sheet")], dump: true, out, only: new Set(["H13"]) });
  const sheets = JSON.parse(fs.readFileSync(path.join(out, "syn-sheet", "dump", "001-synthetic-ledger.xlsx.sheets.json"), "utf8"));
  assert.deepEqual(Object.keys(sheets), ["Synthetic Ledger"]);
  // A reader failure is dumped too.
  const good = renderXlsx({ "Synthetic Ledger": [["Date", "Description", "Amount", "Currency"], ["2026-01-05", "Deposit", 500, "USD"]] });
  res = await run({ root: t.root, provider: "syn-sheet", statements: [folder({ "good.xlsx": good, "broken.xlsx": "not a zip" })], dump: true, out, only: new Set(["H13"]) });
  assertStatus(res, "syn-sheet", "H13", "pass");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, "syn-sheet", "dump", "reader-failures.json"), "utf8")).map((f) => f.id), ["broken.xlsx"]);
  fs.rmSync(path.join(out, "syn-csv", "dump"), { recursive: true });
  fs.writeFileSync(path.join(out, "syn-csv", "dump"), "a file in the way");
  res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], dump: true, out, only: new Set(["H13"]) });
  assertStatus(res, "syn-csv", "H13", "fail");
}));

test("H14: --reference runs test.reference; a provider without the hook fails; the file must be a safe input", withTree(async (t) => {
  // The reference is private: it may lie in the statement folder or <private-dir>, never elsewhere.
  const ref = path.join(process.env.S2C_PRIVATE, "reference.json");
  fs.mkdirSync(path.dirname(ref), { recursive: true });
  fs.writeFileSync(ref, "{}");
  let res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], reference: ref, only: new Set(["H14"]) });
  assertStatus(res, "syn-csv", "H14", "fail", /--reference needs test\.js exporting reference/);
  t.write({ "providers/syn-csv/test.js": `${SPDX}const fs = require("fs");\nmodule.exports = { reference(result, file, ctx) { const want = JSON.parse(fs.readFileSync(file, "utf8")); return Object.keys(result.accounts).filter((n) => !(n in want)).map((n) => \`\${n}: not in the reference (\${ctx.mode})\`); } };\n` });
  const elsewhere = path.join(folder({ "reference.json": "{}" }), "reference.json");
  res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], reference: elsewhere, only: new Set(["H14"]) });
  assertStatus(res, "syn-csv", "H14", "fail", /refusing to read .*: it is not inside a statement folder/);
  res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], reference: ref, only: new Set(["H14"]) });
  assertStatus(res, "syn-csv", "H14", "fail", /Ledger L100: not in the reference \(balance\)/);
  fs.writeFileSync(ref, JSON.stringify({ "Ledger L100": {}, "Ledger L200": {} }));
  res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], reference: ref, only: new Set(["H14"]) });
  assertStatus(res, "syn-csv", "H14", "pass");
}));

// ---------------------------------------------------------------- H12, the page (Chrome)

test("H12 and H3 in Chrome: every fixtures folder of the built synthetic tree passes with --browser", { skip: NO_CHROME }, withTree(async (t) => {
  assert.equal(t.build().code, 0);
  const res = await run({ root: t.root, allFixtures: true, browser: true, nodeReaders: false });
  for (const p of res.r.providers) assert.equal(p.ok, true, `${p.id}:\n${res.lines.join("\n")}`);
  const csv = res.steps("syn-csv").H12;
  assert.equal(csv.counts.mismatches, 0);
  assert.equal(csv.counts.states, 14, "3 modes x 2 ranges, the configurator states, then the full batch with a bogus file first and last");
  assert.equal(csv.counts.ranges, 0);
  assert.equal(csv.counts.persistence, "kept across a reload, then reset");
  assert.equal(csv.counts.warned, 4, "the bogus CSV alone by picker and drop, then first and last in the full batch");
  assert.equal(res.steps("syn-invest").H12.counts.mismatches, 0, "the investment provider's holdings files and Combined zip");
  assert.equal(res.steps("syn-sheet").H12.counts.persistence, "n/a");
  assert.equal(res.steps("syn-skel").H12.status, "pass", "a skeleton is tested from a temporary build");
}));

test("H12: the page must equal the downloads hook's Node rebuild", { skip: NO_CHROME }, withTree(async (t) => {
  assert.equal(t.build().code, 0);
  // test.js is not inlined, so the page is still current while the hook renames every file.
  edit(t, "providers/syn-sheet/test.js", "range: () => ({ from: ctx.from, to: ctx.to }), naming: ctx.R.naming }).downloads();",
    'range: () => ({ from: ctx.from, to: ctx.to }), naming: ctx.R.naming }).downloads().map((d) => (d.name ? { ...d, name: `x${d.name}` } : d));');
  const res = await run({ root: t.root, provider: "syn-sheet", statements: [fixturesOf(t, "syn-sheet")], browser: true, only: new Set(["H12"]) });
  assertStatus(res, "syn-sheet", "H12", "fail", /record 0 \(card\) name: the page has "Synthetic Sheet - transactions/);
  assert.ok(res.steps("syn-sheet").H12.counts.mismatches > 0);
}));

test("H12: configurator settings must survive a reload; a bogus file must warn and leave the page idle", { skip: NO_CHROME }, withTree(async (t) => {
  edit(t, "core/storage.js", "try { localStorage.setItem(key, JSON.stringify(cfg)); }", "try { void cfg; }");
  edit(t, "providers/syn-sheet/app.js", "state.error ? E.html`<p class=\"warn\">${state.file || \"File\"}: ${state.error}</p>` : ", "state.error ? E.html`<p>${state.error}</p>` : ");
  // The bogus CSV in a batch with real files makes the parser return a result the app cannot
  // render: the page stays busy (the rejection lets the driver call it stuck after a second
  // instead of its backstop). A parser that throws would not do: since migration step M9 the app
  // catches that, shows the error and clears the busy line; the render's exception escapes.
  edit(t, "providers/syn-csv/parser.js", "const st = parseExport(s.csv);", 'if (s.csv === "hello" && statements.length > 1) return { months: null }; const st = parseExport(s.csv);');
  // A reader failure leaves the busy line up.
  edit(t, "providers/syn-sheet/app.js", "state.error = String(e && e.message ? e.message : e);", 'state.error = String(e && e.message ? e.message : e);\n      throw new Error("synthetic stuck reader");');
  assert.equal(t.build().code, 0);
  let res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], browser: true, only: new Set(["H12"]) });
  assertStatus(res, "syn-csv", "H12", "fail", /configurator: the rows show other settings after the reload/);
  assertStatus(res, "syn-csv", "H12", "fail", /configurator: the downloads differ after the reload \(\d+ mismatches\)/);
  assertStatus(res, "syn-csv", "H12", "fail", /a bogus file first in the full batch: the page stays busy/);
  assertStatus(res, "syn-csv", "H12", "fail", /a bogus file last in the full batch: the page stays busy/);
  assert.equal(res.steps("syn-csv").H12.counts.persistence, "failed");
  res = await run({ root: t.root, provider: "syn-sheet", statements: [fixturesOf(t, "syn-sheet")], browser: true, only: new Set(["H12"]) });
  assertStatus(res, "syn-sheet", "H12", "fail", /a bogus xlsx file by picker: no #status \.warn line names it/);
  assertStatus(res, "syn-sheet", "H12", "fail", /a bogus xlsx file by drop: the page stays busy/);
  // A parse that always returns such a result: the real inputs leave the page busy too (the
  // skeleton, from a temporary build).
  edit(t, "providers/_syn-skel/parser.js", "const st = parseExport(s.csv);", "return { months: null }; const st = parseExport(s.csv);");
  res = await run({ root: t.root, provider: "syn-skel", statements: [fixturesOf(t, "syn-skel")], browser: true, only: new Set(["H12"]) });
  assertStatus(res, "syn-skel", "H12", "fail", /the inputs: Error: the page stays busy after loading the inputs/);
}));

test("H12: console and page errors, CSP violations, overflow at 390 px, and a range that hides a month", { skip: NO_CHROME }, withTree(async (t) => {
  const app = "core/app/statement-app.js";
  // (A throw in a timer would reach the console only: the fixed clock runs the timers.)
  edit(t, app, "setMode(state.mode);\n}", 'setMode(state.mode);\n  console.error("synthetic console error");\n  queueMicrotask(() => { throw new Error("synthetic page error"); });\n  new Image().src = "https://example.invalid/pixel.png";\n}');
  edit(t, app, "fillRange(state.result ? state.result.months.map((m) => m.month) : []);", "fillRange(state.result ? state.result.months.map((m) => m.month).slice(0, -1) : []);");
  t.write({ "core/page/style.css": `${t.read("core/page/style.css")}main { min-width: 700px; }\n` });
  assert.equal(t.build().code, 0);
  const res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], browser: true, only: new Set(["H12"]) });
  for (const re of [
    /the inputs: console error: synthetic console error/,
    /the inputs: page error: .*synthetic page error/,
    /the inputs: CSP violation: img-src/,
    /empty state: horizontal overflow at 390 px/,
    /with results: horizontal overflow at 390 px/,
    /balance\/full: the range offers 2 months, the hook's result has 3 \(not offered: 2026-03; not in the result: none\)/,
  ]) assertStatus(res, "syn-csv", "H12", "fail", re);
  assert.ok(res.steps("syn-csv").H12.counts.ranges > 0);
}));

test("H12: the mode buttons, a bogus file's warning in a full batch, the stored settings across a reload, Reset", { skip: NO_CHROME }, withTree(async (t) => {
  const app = "core/app/statement-app.js";
  // The holdings button never lights.
  edit(t, app, 'b.classList.toggle("on", b.dataset.mode === mode);', 'b.classList.toggle("on", b.dataset.mode === mode && mode !== "holdings");');
  // Errors entries warn only when nothing was recognised.
  edit(t, app, "for (const e of [...(r ? r.errors : []), ...state.failed])", "for (const e of [...(r && !r.months.length ? r.errors : []), ...state.failed])");
  // Reset stores "null" and keeps the settings in use.
  edit(t, app, '$("#config-reset").addEventListener("click", () => { state.config = {}; saveConfig(); recompute(); });', '$("#config-reset").addEventListener("click", () => { localStorage.setItem(D.storage.configKey, "null"); render(); });');
  // A stored config is written back, pretty-printed, when it is read.
  edit(t, "core/storage.js", "try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }",
    "try { const v = localStorage.getItem(key); const c = JSON.parse(v) || {}; if (v !== null) localStorage.setItem(key, JSON.stringify(c, null, 1)); return c; } catch { return {}; }");
  assert.equal(t.build().code, 0);
  const res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], browser: true, only: new Set(["H12"]) });
  for (const re of [
    /holdings\/full: the mode button holdings is not on after its click/,
    /a bogus file first in the full batch: no #status \.warn line names it/,
    /a bogus file last in the full batch: no #status \.warn line names it/,
    /configurator: the stored settings changed across the reload/,
    /configurator: Reset does not store \{\}/,
    /configurator: after Reset the downloads are not the first ones/,
  ]) assertStatus(res, "syn-csv", "H12", "fail", re);
  assert.equal(res.steps("syn-csv").H12.counts.warned, 2, "the bogus file alone still warns");
}));

test("H12: with a bogus file in the full batch, the real files must still give the hook's downloads", { skip: NO_CHROME }, withTree(async (t) => {
  // A parser whose labels depend on the input's position: an account first seen in the first
  // input is labelled "(first)". The page reads the bogus file first, with the others; the Node
  // rebuild has no statement for it.
  edit(t, "providers/syn-csv/parser.js", "label = `Ledger ${st.number}`;", 'label = `Ledger ${st.number}${statements.indexOf(s) ? "" : " (first)"}`;');
  assert.equal(t.build().code, 0);
  const res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], browser: true, only: new Set(["H12"]) });
  assertStatus(res, "syn-csv", "H12", "fail", /a bogus file first in the full batch: record 0 \(card\) name: the page has "Ledger L100 - transactions - 2026-01_to_2026-03\.csv", the hook "Ledger L100 \(first\) - transactions/);
  const problems = res.details("syn-csv").H12.problems;
  assert.ok(!problems.some((m) => /^(balance|tradelog|holdings)\/|^configurator:/.test(m)), `only the batch with the bogus file first differs:\n${problems.join("\n")}`);
}));

test("H12: a stale dist page is not tested", { skip: NO_CHROME }, withTree(async (t) => {
  assert.equal(t.build().code, 0);
  edit(t, "providers/syn-csv/page.html", "Drop files here", "Drop your files here");
  const res = await run({ root: t.root, provider: "syn-csv", statements: [fixturesOf(t, "syn-csv")], browser: true, only: new Set(["H12"]) });
  assertStatus(res, "syn-csv", "H12", "fail", /dist\/syn-csv\/index\.html is stale/);
}));

test("H13 in Chrome: a PDF dump has the raw items, their page lines and the page transform's output", { skip: NO_CHROME }, withTree(async (t) => {
  const out = path.join(TMP, "dump-pdf");
  let res = await run({ root: t.root, provider: "syn-pdf", statements: [fixturesOf(t, "syn-pdf")], dump: true, out, nodeReaders: false, only: new Set(["H13"]) });
  assertStatus(res, "syn-pdf", "H13", "pass");
  const dump = path.join(out, "syn-pdf", "dump");
  const read = (name) => fs.readFileSync(path.join(dump, name), "utf8");
  assert.deepEqual(read("001-statement-2026-01.pdf.lines.txt").split("\n").slice(0, 3), ["--- page 1 ---", "SYNTHETIC STAMP", "Synthetic Pdf Bank statement"], "the raw items, stamp included");
  const items = JSON.parse(read("001-statement-2026-01.pdf.items.json"));
  assert.ok(items[0].some((it) => it.str === "SYNTHETIC STAMP") && items[0].some((it) => it.str === "Period 2026-01"));
  const transformed = JSON.parse(read("001-statement-2026-01.pdf.transform.json"));
  assert.ok(!transformed[0].some((it) => it.str === "SYNTHETIC STAMP") && transformed[0].some((it) => it.str === "Period 2026-01"), "the transform drops the stamp");
  assert.equal(res.steps("syn-pdf").H13.counts.files, 12, "items, lines and the transform's output for each of the 4 PDFs");
  // The parse needs the transform: without it no statement is recognised.
  editData(t, "providers/syn-pdf/provider.js", (D) => { const { pdf, ...rest } = D; void pdf; return rest; });
  res = await run({ root: t.root, provider: "syn-pdf", statements: [fixturesOf(t, "syn-pdf")], nodeReaders: false, only: new Set(["H5"]) });
  assertStatus(res, "syn-pdf", "H5", "fail", /statement-2026-01\.pdf: an error that the fixture spec's expectErrors does not list: not a synthetic PDF statement/);
}));

// ---------------------------------------------------------------- the pure checks

test("csvProblems: parse-back, cell counts, numeric columns and the header", () => {
  assert.deepEqual(checks.csvProblems("date,amount,currency\n2026-01-05,-1.50,SGD\n", { header: "date,amount,currency" }), []);
  assert.deepEqual(checks.csvProblems('date,name\n2026-01-05,"a ""quoted"", name"\n'), []);
  assert.match(checks.csvProblems('date,name\n2026-01-05,"open\n')[0], /does not parse back as CSV: parseCsv: unterminated quoted field/);
  assert.deepEqual(checks.csvProblems("date,amount\n2026-01-05\n"), ["row 1 has 1 cells, the header 2"]);
  for (const bad of ["", " 1", "abc", "Infinity", "NaN"]) assert.deepEqual(checks.csvProblems(`date,amount\n2026-01-05,${bad}\n`), ["row 1, column amount: not a finite number"], JSON.stringify(bad));
  assert.deepEqual(checks.csvProblems("Account type,Name,Balance\nSavings,X,1e3\n"), []);
  assert.deepEqual(checks.csvProblems("date,qty,price\n2026-01-05,1,-\n"), ["row 1, column price: not a finite number"]);
  assert.deepEqual(checks.csvProblems("a,b\n1,2\n", { header: "a,c" }), ["the header line is not the one the composed writer gives"]);
  assert.deepEqual(checks.csvProblems(""), ["is empty (no header line)"]);
  const many = checks.csvProblems(`date,amount\n${Array.from({ length: 9 }, () => "2026-01-05,x").join("\n")}\n`);
  assert.equal(many.length, 6, "five lines and a count of the rest");
  assert.match(many[5], /4 more cells/);
});

test("qifProblems and fileProblems: the QIF records, and a file type without a rule", () => {
  const good = coreExport.qif([{ date: "2026-01-05", amount: -5, name: "Deposit", notes: "n" }], { balance: 1, date: "2026-01-04" }, "Acct");
  assert.deepEqual(checks.qifProblems(good), []);
  assert.deepEqual(checks.qifProblems("!Type:Bank\n"), []);
  assert.deepEqual(checks.qifProblems("Type:Bank\n"), ["does not start with !Type:Bank"]);
  assert.match(checks.qifProblems("!Type:Bank\nD2026-01-05\nT1.00").join("\n"), /does not end with a line break/);
  assert.deepEqual(checks.qifProblems("!Type:Bank\nD2026-01-05\nT1.00\n"), ["the last record does not end with ^"]);
  assert.deepEqual(checks.qifProblems("!Type:Bank\nPx\n^\n"), ["line 3: a record without a D or T line"]);
  assert.deepEqual(checks.qifProblems("!Type:Bank\n^\n"), ["line 2: an empty record"]);
  assert.deepEqual(checks.qifProblems("!Type:Bank\nD2026-01-05\nT1\nlower\n^\n"), ["line 4: not a QIF field line"]);
  assert.deepEqual(checks.fileProblems("x.json", "{}"), ["no rule for a .json file (CSV, QIF and zip downloads have rules)"]);
  assert.deepEqual(checks.fileProblems("x.CSV", "a\n1\n"), []);
});

test("downloadProblems: zips are built, unpacked and checked entry by entry", () => {
  const counts = { zips: 0, entries: 0, csv: 0, qif: 0 };
  const zip = { trigger: "zip", name: "z.zip", type: "application/zip", files: [{ name: "a.csv", text: "a,amount\nx,1\n" }, { name: "b.qif", text: "!Type:Bank\n" }] };
  assert.deepEqual(checks.downloadProblems(zip, { counts }), []);
  assert.deepEqual(counts, { zips: 1, entries: 2, csv: 0, qif: 0 });
  assert.deepEqual(checks.downloadProblems({ ...zip, files: [zip.files[0], zip.files[0]] }), ["1 duplicate entry name"]);
  assert.deepEqual(checks.downloadProblems({ ...zip, files: [] }), ["an empty zip"]);
  assert.deepEqual(checks.downloadProblems({ ...zip, files: [{ name: "a.csv", text: "a,amount\nx,y\n" }] }), ["entry 1: row 1, column amount: not a finite number"]);
  assert.deepEqual(checks.downloadProblems({ name: "z.zip", type: "application/zip" }), ["a zip record without its file list"]);
  assert.deepEqual(checks.downloadProblems({ name: "a.csv", type: "text/csv" }), ["a download record with neither text nor files"]);
  assert.deepEqual(checks.downloadProblems({ type: "text/csv", text: "" }), ["a download record without a name"]);
});

test("downloadProblems: each entry against its expected header; a zip whose CRC does not verify", () => {
  const zip = { trigger: "combined", name: "z.zip", type: "application/zip", files: [{ name: "t.csv", text: "account,date\nA,2026-01-05\n" }, { name: "x.csv", text: "a,amount\nx,1\n" }] };
  const counts = { zips: 0, entries: 0, entryHeaders: 0, csv: 0, qif: 0 };
  assert.deepEqual(checks.downloadProblems(zip, { entryHeader: (f) => (f.name === "t.csv" ? "account,date" : null), counts }), []);
  assert.equal(counts.entryHeaders, 1);
  assert.deepEqual(checks.downloadProblems(zip, { entryHeader: (f) => (f.name === "t.csv" ? "date" : null) }), ["entry 1: the header line is not the one the composed writer gives"]);
  assert.deepEqual(checks.downloadProblems(zip, { entryHeader: () => { throw new Error("boom"); } }), ["entry 1: expectedHeader throws: Error: boom", "entry 2: expectedHeader throws: Error: boom"]);
  // core/zip.js, patched for this test only, flips a stored byte after computing its CRC.
  const Z = require("../../core/zip.js");
  const zipParts = Z.zipParts;
  Z.zipParts = (files, now) => {
    const parts = zipParts(files, now);
    parts[2][0] ^= 0xff;
    return parts;
  };
  try {
    assert.deepEqual(checks.downloadProblems(zip), ["the zip does not unpack: CRC mismatch in 1 entry"]);
  } finally {
    Z.zipParts = zipParts;
  }
  assert.deepEqual(checks.downloadProblems(zip), []);
});

// A synthetic statement-app result with two accounts and a trade, and its downloads hook.
function stateOf(mode, from, to) {
  const a = {
    kind: "investment", currency: "SGD",
    months: { "2026-01": { monthEnd: "2026-01-31", opening: 0, closing: 100, fx: null }, "2026-02": { monthEnd: "2026-02-28", opening: 100, closing: 130, fx: null } },
    valuations: [["2026-01-31", 100], ["2026-02-28", 130]],
    trades: [{ date: "2026-01-06", ticker: "FUND", qty: 1, price: 50, currency: "SGD", name: "Fund" }],
    cash: [{ date: "2026-01-05", amount: -100, currency: "SGD", name: "Deposit", kind: "deposit" }, { date: "2026-02-05", amount: -20, currency: "SGD", name: "Deposit", kind: "deposit" }],
  };
  const b = { kind: "cash", currency: "SGD", months: { "2026-02": { monthEnd: "2026-02-28", opening: 0, closing: 10, fx: null } }, valuations: [["2026-02-28", 10]], trades: [], cash: [{ date: "2026-02-10", amount: -10, currency: "SGD", name: "Top-up", kind: "deposit" }] };
  const result = { accounts: { Fund: a, Wallet: b }, months: [{ month: "2026-01" }, { month: "2026-02" }] };
  const naming = { accountPrefix: "Bank ", brand: "Bank", groupNoun: "accounts", slug: "bank" };
  const list = coreFiles.create({ P: coreExport, result: () => result, mode: () => mode, range: () => ({ from, to }), naming, kindModel: "standard" }).downloads();
  return { list, opts: { naming, from, to, mode, result, P: coreExport, kindModel: "standard" } };
}

test("statementStateProblems: the core's own downloads pass in every mode and range; each rule has a failing sample", () => {
  for (const mode of ["balance", "tradelog", "holdings"]) {
    for (const [from, to] of [["2026-01", "2026-02"], ["2026-01", "2026-01"], ["2026-02", "2026-02"]]) {
      const { list, opts } = stateOf(mode, from, to);
      assert.deepEqual(checks.statementStateProblems(list, opts), [], `${mode} ${from}-${to}`);
    }
  }
  const { list, opts } = stateOf("holdings", "2026-01", "2026-02");
  const mutate = (fn) => checks.statementStateProblems(fn(JSON.parse(JSON.stringify(list))), opts).join("\n");
  assert.match(mutate((l) => { l[0].name = l[0].name.replace("2026-01_to_2026-02", "2026-01"); return l; }), /the span rule gives/);
  assert.match(mutate((l) => { const z = l.find((d) => d.trigger === "zip"); z.files.shift(); return l; }), /Download all holds the Accounts CSV 0 times/);
  assert.match(mutate((l) => { const z = l.find((d) => d.trigger === "zip"); z.files.push(z.files[1]); return l; }), /Download all has duplicate names/);
  assert.match(mutate((l) => { const z = l.find((d) => d.trigger === "zip"); z.files.reverse(); return l; }), /holds the Accounts CSV 1 times, not first/);
  assert.match(mutate((l) => { const z = l.find((d) => d.trigger === "zip"); z.name = "bank-csv.zip"; return l; }), /Download all is named "bank-csv\.zip"/);
  assert.match(mutate((l) => { const a = l.find((d) => d.trigger === "accounts"); a.text = a.text.split("\n").slice(0, 2).join("\n") + "\n"; return l; }), /the Accounts CSV has 1 rows, 2 accounts have files and an opening/);
  assert.match(mutate((l) => { const c = l.find((d) => d.trigger === "combined"); c.files[1].text += "Bank Fund,2026-02-01,1.00,SGD,Extra,\n"; return l; }), /the Combined transactions file has 4 rows, the cards' transactions files 3/);
  assert.match(mutate((l) => { const c = l.find((d) => d.trigger === "combined"); c.files.reverse(); return l; }), /does not hold the trades and the transactions file, in that order/);
  assert.match(mutate((l) => l.filter((d) => d.trigger !== "combined")), /0 combined records \(one expected\)/);
  assert.match(mutate((l) => l.map((d) => (d.trigger === "zip" ? { trigger: "zip", account: null, kind: null, disabled: true } : d))), /the toolbar is disabled although cards offer files/);
});

test("gapCases, closingMisses and orderCanon", () => {
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];
  const result = { accounts: { A: { months: { "2026-01": {} } }, B: { months: { "2026-03": {}, "2026-04": {} } } } };
  assert.deepEqual(checks.gapCases(result, months).map((k) => [k.label, k.drop]), [
    ["a middle month", ["2026-03"]],
    ["two consecutive months", ["2026-03", "2026-04"]],
    ["the first month an account appears", ["2026-03"]],
    ["the first month", ["2026-01"]],
    ["the last month", ["2026-05"]],
  ]);
  assert.equal(checks.gapCases({ accounts: { A: { months: { "2026-01": {} } } } }, months.slice(0, 3)).length, 4, "no later first month");
  // closingMisses: the first opening plus the balance-only entries reach each closing.
  const acct = { kind: "bank", currency: "SGD", months: { "2026-02": { monthEnd: "2026-02-28", opening: 50, closing: 60, fx: null } }, valuations: [["2026-02-28", 60]], trades: [], cash: [{ date: "2026-02-03", amount: -10, currency: "SGD", name: "In", kind: "deposit" }] };
  const r = { accounts: { A: acct }, months: [{ month: "2026-02" }], firstOpenings: [{ account: "A", month: "2026-02", opening: 50 }] };
  assert.deepEqual(checks.closingMisses(coreExport, r), []);
  assert.deepEqual(checks.closingMisses(coreExport, { ...r, firstOpenings: [] }), ["A: misses 1 of 1 loaded closings (max diff 50.00)"]);
  // orderCanon: input-ordered lists are multisets, and which input a month came from is ignored.
  const x = { accounts: {}, months: [{ month: "2026-01", id: "a.csv" }], errors: [{ id: "a", error: "e" }, { id: "b", error: "f" }], warnings: ["w1", "w2"], skippedRows: [] };
  const y = { accounts: {}, months: [{ month: "2026-01", id: "b.csv" }], errors: [{ id: "b", error: "f" }, { id: "a", error: "e" }], warnings: ["w2", "w1"], skippedRows: [] };
  assert.equal(checks.orderCanon(x), checks.orderCanon(y));
  assert.notEqual(checks.orderCanon(x), checks.orderCanon({ ...y, warnings: ["w2"] }));
  assert.deepEqual(checks.monthsOf({ months: ["2026-02", { month: "2026-01" }, "bad", { month: "2026-02" }] }), ["2026-01", "2026-02"]);
});
