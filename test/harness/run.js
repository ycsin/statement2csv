// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The generic per-provider harness (docs/TESTING.md, generic harness): steps H1-H14 for any
// provider on any statement folder, with no per-provider test code beyond the optional test.js.
//
//   node test/harness/run.js --provider <id> [--statements <dir> | --statements <id>=<dir>]
//                            [--browser] [--dump] [--reference <file>] [--allow-unknown]
//                            [--strict | --no-strict] [--out <dir>] [--only H5,H8,...]
//                            [--node-readers] [--root <dir>]
//   node test/harness/run.js --all-fixtures [--browser] [--dump] [--allow-unknown]
//                            [--strict | --no-strict] [--out <dir>] [--only ...]
//                            [--node-readers] [--root <dir>]
//
// The provider is reached only through its ProviderHandle (test/lib/load-provider.js): parse,
// downloads and expectedHeader come from the core for statement apps and from test.js for custom
// apps. Nothing here names a provider.
//
// Statements. With --provider, the folder is resolved by test/lib/private.js statementsFor:
// --statements (a folder, or <id>=<folder>), the user config, then a folder of <statements-dir>
// named after the provider. A folder holding a fixture spec (statements.js) is a fixtures folder:
// its files are rendered first, and its errors are the spec's expectErrors. Any other folder is
// a real statement folder, whose private declarations come from the untracked user config:
// expectErrors (the file names whose errors entry is expected; H5 requires exactly these) and
// allowProblems (the number of reconciliation lines H6 may see). --all-fixtures runs every
// discovered provider with testing.fixtures (skeletons included) on its own fixtures folder.
//
// Steps ("modes": the ledger modes of a statement app, the descriptor's modes of a custom app):
//   H1   load: normalise and resolve the descriptor; loadNode and loadPage (C10a/b)
//   H2   inputs: the files of the folder a declared reader accepts, in JS string order (rendered
//        fixtures keep the spec's order, which its expectErrors are written for)
//   H3   extract with test/lib/extract.js (cached): the production readers in Chrome, or with
//        --node-readers the Node twins for CSV and XLSX (PDF always in Chrome); the page
//        transform is applied. A reader failure must be a declared error
//   H4   per file: parse([s]) in the first mode, reported as recognised or with an error
//   H5   parse(all) in every mode must not throw. Statement apps: checkResult (strict in strict
//        mode); the errors are exactly the declared ones; warnings fail unless
//        testing.allowWarnings; skippedRows of category "unknown" fail unless --allow-unknown.
//        Custom apps: no {error} (on the inputs minus the declared ones), test.checkResult (if
//        exported) finds nothing, the same warnings rule, and the files that give {error} alone
//        are exactly the declared ones
//   H6   reconcile: statement apps the running balance of test/lib/reconcile.js plus
//        test.reconcile (if exported); custom apps (and testing.reconcile "custom")
//        test.reconcile in every mode. At most allowProblems lines (0 for fixtures)
//   H6b  statement apps: per month, opening + entries = closing (within what H6 left of the
//        declaration)
//   H7   statement apps with testing.gapDrop and 3 months or more: drop the inputs whose parsed
//        months include a middle month, two consecutive months, the first month an account
//        appears, the first month, the last month; bridges plus firstOpenings must still reach
//        every loaded closing
//   H8   files: every mode x {full range, each single month}, the downloads hook: CSV parse-back,
//        cell counts, numeric columns, the expected header; QIF records; zips (zipParts, CRCs,
//        unique names). Statement apps also: the span rules of the names, Download all =
//        [Accounts, card files], Accounts rows, Combined rows, and the header of each entry of
//        the Combined zip (its kind known from its name)
//   H9   statement apps: rename, exclude, kind, merge and same-name merge through the config
//   H10  determinism: two parses canon-equal; inputs deep-frozen (deep-compared for legacy
//        providers); reversed input order gives the same result (skipped with one input, a
//        single-file picker or duplicate-statement errors)
//   H11  providers with a configurator: frozen.configIdPattern matches every portfolio id
//   H12  with --browser: the built page, served from 127.0.0.1, compared with the downloads
//        hook's Node rebuild in every mode x {full, last month}: every captured record, and the
//        months the range offers; no console or page error or CSP violation; a bogus file warns
//        (alone through the picker and by drop, and first and last in the full batch on a
//        multiple-file picker, where the real files must still give the hook's downloads); no
//        overflow at 390 px; configurator settings survive a reload, then Reset
//   H13  with --dump: the extracted items, the page lines, the page transform's output, the CSV
//        text and the workbooks, written to --out
//   H14  with --reference <file>: test.reference(result, file, ctx) finds nothing
//
// Gating. --strict (warnings fail, and H6b, H7, H9 and H10's reversed order gate) is the default
// for providers without frozen.legacyRepo; for legacy providers those checks are reported and do
// not fail the run unless --strict is given. --no-strict turns strict mode off.
//
// Output. The console shows the provider ids, each step's status and counts only; never a file
// name, an account name or an amount. The details (problem lines, the input list, the dumps) go to
// <out>/<id>/report.json, where <out> is --out or <private-dir>/harness/<run>, written 0600 in
// 0700 folders after the private-data guards, and never inside a folder the run reads. A
// run-level error (a folder that cannot be resolved, a refused output path) prints one fixed line
// that names <private-dir>/harness/<run>/error.txt, where its message goes. Exit status: 0 when
// every selected step passed or only reported, 1 on any failure, 2 for a usage error.
//
//   runHarness(opts) -> Promise<{run, ok, out, providers: [{id, ok, steps}]}>
//   parseArgs(argv) -> opts;  main(argv, io) -> Promise<exit code>
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const lib = (m) => require(path.join(REPO, "test", "lib", m));
const priv = lib("private.js");
const canon = lib("canon.js");
const LP = lib("load-provider.js");
const extractLib = lib("extract.js");
const fixturesLib = lib("fixtures.js");
const replay = lib("replay.js");
const { parseCsv } = lib("csvread.js");
const { reconcileParts } = lib("reconcile.js");
const { FIXED_TIME } = lib("browser.js");
const { checkResult } = require(path.join(REPO, "core", "contract", "result.js"));
const { effectiveMode } = require(path.join(REPO, "core", "contract", "headers.js"));
const { normalize } = require(path.join(REPO, "core", "contract", "descriptor.js"));
const { KIND_LABEL } = require(path.join(REPO, "core", "contract", "constants.js"));
const { listProviders, loadDataModule } = require(path.join(REPO, "build", "discover.js"));

const STEPS = ["H1", "H2", "H3", "H4", "H5", "H6", "H6b", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "H14"];
const PREREQUISITES = ["H1", "H2", "H3"];
const NUMERIC_COLUMNS = new Set(["amount", "balance", "Balance", "qty", "price"]);
const RENAME = '=Renamed "A&B", <x>';
const SAME_NAME = "Merged by the harness";
const CENT = 0.005;
const MERGE_TOLERANCE = 0.01;
const MAX_LINES = 500; // problem and note lines kept per step in the report (the counts are exact)
const BALANCE_FILES = new Set(["transactions", "qif"]);
const HOLDINGS_FILES = new Set(["trades", "transactions", "valuations"]);
const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const NARROW = { width: 390, height: 844 };
const USAGE = "usage: node test/harness/run.js --provider <id> [--statements <dir>] [--browser] [--dump] [--reference <file>] [--allow-unknown] [--strict|--no-strict] [--out <dir>] [--only H5,H8,...] [--node-readers] [--root <dir>]\n"
  + "       node test/harness/run.js --all-fixtures [--browser] [--dump] [--allow-unknown] [--strict|--no-strict] [--out <dir>] [--only ...] [--node-readers] [--root <dir>]";

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const own = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);
const describe = (e) => (e && typeof e === "object" && "message" in e ? `${e.name || "Error"}: ${e.message}` : String(e));
const round2 = (n) => Math.round(n * 100) / 100;
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byName = (a, b) => byCodePoint(path.basename(a), path.basename(b));
const plural = (n, word, words = `${word}s`) => `${n} ${n === 1 ? word : words}`;
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function deepFreeze(v) {
  if (v === null || typeof v !== "object" || Object.isFrozen(v)) return v;
  Object.freeze(v);
  for (const k of Object.keys(v)) deepFreeze(v[k]);
  return v;
}

function canonOrNull(v) {
  try {
    return canon(v);
  } catch {
    return null;
  }
}

class UsageError extends Error {}
class Blocked extends Error {}

// ---------------------------------------------------------------- console privacy

// Console lines are fixed texts and counts. A run-level error (a statement folder that cannot be
// resolved, a refused output path, an unexpected throw) can carry a path or a statement name in
// its message, and no masking can tell where a path with spaces ends. So the console gets one
// fixed line: "harness: FAILED", the RunError's fixed summary when the harness raised it, and
// the private file that holds the message (failureLine).
class RunError extends Error {
  constructor(summary, cause) {
    super(`${summary}: ${describe(cause)}`);
    this.summary = summary;
    this.cause = cause;
  }
}

function failureLine(e, run) {
  const what = e instanceof RunError ? `: ${e.summary}` : "";
  try {
    const file = priv.privateDir("harness", run, "error.txt");
    const stack = e && typeof e === "object" && typeof (e.cause || e).stack === "string" ? `\n${(e.cause || e).stack}` : "";
    priv.writePrivate(file, `${describe(e)}${stack}\n`);
    return `harness: FAILED${what} (details in <private-dir>/harness/${run}/error.txt)`;
  } catch {
    return `harness: FAILED${what} (the details cannot be written to <private-dir>)`;
  }
}

// Why <private-dir> itself cannot be used, without the path: the guarded location it lies in
// (test/lib/private.js words them with ids and repository names only), the user config that does
// not load, or the system error code.
const GUARDED = /: it is inside (this repository|the statements folder|the statement folder of [a-z0-9-]+|the old repository [A-Za-z0-9._-]+|a path in the user config's refuse list)$/;
function privateDirReason(e) {
  const msg = String(e && e.message);
  const m = GUARDED.exec(msg);
  if (m) return `it is inside ${m[1]}`;
  if (/^(cannot load the user config|user config) /.test(msg)) return "the user config cannot be loaded";
  if (e && typeof e.code === "string" && /^E[A-Z]+$/.test(e.code)) return e.code;
  return "set $S2C_PRIVATE to a usable folder";
}

// ---------------------------------------------------------------- arguments

function parseOnly(text, prev) {
  const out = new Set(prev || []);
  for (const raw of String(text).split(",")) {
    const t = raw.trim();
    if (!t) continue;
    const m = /^h(\d+)(b?)$/i.exec(t);
    const id = m ? `H${Number(m[1])}${m[2].toLowerCase()}` : null;
    if (!id || !STEPS.includes(id)) throw new UsageError(`--only: unknown step ${JSON.stringify(t)} (steps: ${STEPS.join(", ")})`);
    out.add(id);
  }
  if (!out.size) throw new UsageError("--only needs at least one step");
  return out;
}

function parseArgs(argv) {
  const o = {
    provider: null, allFixtures: false, statements: [], browser: false, dump: false, reference: null, allowUnknown: false,
    strict: null, out: null, only: null, nodeReaders: false, root: REPO,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new UsageError(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--provider") {
      if (o.provider) throw new UsageError("--provider is given twice");
      o.provider = value();
    } else if (a === "--all-fixtures") o.allFixtures = true;
    else if (a === "--statements") o.statements.push(value());
    else if (a === "--browser") o.browser = true;
    else if (a === "--dump") o.dump = true;
    else if (a === "--reference") o.reference = path.resolve(value());
    else if (a === "--allow-unknown") o.allowUnknown = true;
    else if (a === "--strict" || a === "--no-strict") {
      const v = a === "--strict";
      if (o.strict !== null && o.strict !== v) throw new UsageError("--strict and --no-strict exclude each other");
      o.strict = v;
    } else if (a === "--out") o.out = path.resolve(value());
    else if (a === "--only") o.only = parseOnly(value(), o.only);
    else if (a === "--node-readers") o.nodeReaders = true;
    else if (a === "--root") o.root = path.resolve(value());
    else throw new UsageError(`unknown argument ${JSON.stringify(a)}`);
  }
  if (!!o.provider === o.allFixtures) throw new UsageError("give --provider <id> or --all-fixtures, not both and not neither");
  if (o.provider && !ID_RE.test(o.provider.replace(/^_/, ""))) throw new UsageError(`--provider: ${JSON.stringify(o.provider)} is not a provider id`);
  if (o.allFixtures && o.statements.length) throw new UsageError("--statements goes with --provider (--all-fixtures reads each provider's fixtures folder)");
  if (o.allFixtures && o.reference) throw new UsageError("--reference goes with --provider");
  if (o.only) {
    if (o.only.has("H12") && !o.browser) throw new UsageError("--only H12 needs --browser");
    if (o.only.has("H13") && !o.dump) throw new UsageError("--only H13 needs --dump");
    if (o.only.has("H14") && !o.reference) throw new UsageError("--only H14 needs --reference");
  }
  return o;
}

// ---------------------------------------------------------------- targets

const isFixturesFolder = (dir) => fs.existsSync(path.join(dir, "statements.js"));

// --statements values for one provider: a folder, or <id>=<folder>.
function statementsCli(id, values) {
  const out = {};
  for (const v of values || []) {
    const m = /^([a-z][a-z0-9-]{0,31})=(.+)$/.exec(v);
    const [k, dir] = m ? [m[1], m[2]] : [id, v];
    if (own(out, k)) throw new UsageError(`--statements gives ${k} twice`);
    out[k] = path.resolve(dir);
  }
  return out;
}

function providerTarget(root, wanted, opts) {
  const found = listProviders(root, { includeSkeletons: true }).find((p) => p.id === wanted || p.folder === wanted);
  if (!found) throw new UsageError(`no provider ${JSON.stringify(wanted)} under providers/`);
  const cli = statementsCli(found.id, opts.statements);
  const given = cli[found.id];
  if (given && fs.existsSync(given) && isFixturesFolder(given)) {
    return { id: found.id, folder: found.folder, source: "fixtures folder", fixtures: true, dir: given, expectErrors: null, allowProblems: 0 };
  }
  let configured, s;
  try {
    configured = priv.userConfig().providers[found.id];
  } catch (e) {
    throw new RunError("the user config cannot be loaded", e);
  }
  try {
    s = priv.statementsFor(found.id, { cli });
  } catch (e) {
    throw new RunError("the statement folder cannot be resolved", e);
  }
  const source = given ? "--statements" : configured && configured.dir ? "user config" : "statements folder";
  return { id: found.id, folder: found.folder, source, fixtures: false, dir: s.dir, expectErrors: s.expectErrors, allowProblems: s.allowProblems };
}

// Every provider (skeletons included) whose descriptor names a fixtures folder. A descriptor that
// cannot be loaded is a failing target, so a broken provider never passes by being left out.
function fixtureTargets(root) {
  const out = [];
  for (const p of listProviders(root, { includeSkeletons: true })) {
    let fx = null;
    try {
      const raw = loadDataModule(path.join(p.dir, "provider.js"));
      const frozenFile = path.join(p.dir, "frozen.js");
      const N = normalize(raw, fs.existsSync(frozenFile) ? loadDataModule(frozenFile) : null);
      fx = isObj(N.testing) && typeof N.testing.fixtures === "string" ? N.testing.fixtures : null;
    } catch (e) {
      out.push({ id: p.id, folder: p.folder, source: "fixtures folder", fixtures: true, dir: null, error: `the descriptor cannot be loaded: ${describe(e)}` });
      continue;
    }
    if (fx) out.push({ id: p.id, folder: p.folder, source: "fixtures folder", fixtures: true, dir: path.join(p.dir, fx), expectErrors: null, allowProblems: 0 });
  }
  return out;
}

// ---------------------------------------------------------------- shared pieces of a run

// Forget the modules a previous run loaded from root's providers/ and core/ (the harness's own
// core/contract modules stay), so a changed tree is never checked against stale copies.
function forgetModules(root) {
  const prefixes = [path.join(root, "providers") + path.sep, path.join(root, "core") + path.sep];
  const keep = path.join(REPO, "core", "contract") + path.sep;
  for (const k of Object.keys(require.cache)) {
    if (prefixes.some((p) => k.startsWith(p)) && !k.startsWith(keep)) delete require.cache[k];
  }
}

// Every write: the private-data guards, and never inside a folder the run reads (`reads`: its
// statement folders and fixture specs). assertSafeOutput refuses <statements-dir> and the
// configured folders, but a --statements folder can lie anywhere.
function assertOutside(p, reads) {
  for (const r of reads || []) {
    if (priv.inside(p, r)) throw new Error(`refusing to write ${path.resolve(p)}: it is inside a statement folder this run reads`);
  }
}

function writeOut(file, data, reads) {
  priv.assertSafeOutput(file);
  assertOutside(file, reads);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, data, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

function makeDir(dir, reads) {
  priv.assertSafeOutput(dir);
  assertOutside(dir, reads);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

const newRunId = () => `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;

// The parse a step asks for: the config deep-frozen for providers without legacyRepo (their
// statements were frozen at H3), a fresh copy for legacy ones.
function parseWith(c, statements, { config = {}, mode = c.modes[0] } = {}) {
  const cfg = c.legacy ? clone(config) : deepFreeze(clone(config));
  return c.handle.parse(statements, { config: cfg, mode });
}

// The statements every whole-folder parse uses: all of them for a statement app (its errors
// entries are checked against the declaration); for a custom app, whose result is one {error}
// for any bad input, those that are not declared errors.
const baseStatements = (c) => (c.app === "statement" ? c.statements : c.statements.filter((s) => !c.expectErrors.has(s.id)));

// The result with no config in a mode, parsed once. A statement app's parse does not depend on
// the mode (the handle passes only the config), so it is parsed once for all modes.
function base(c, mode = c.modes[0]) {
  const key = c.app === "statement" ? "*" : mode;
  if (!c.memo.base) c.memo.base = new Map();
  if (!c.memo.base.has(key)) {
    let entry;
    try {
      entry = { result: parseWith(c, baseStatements(c), { mode }) };
    } catch (e) {
      entry = { threw: describe(e) };
    }
    c.memo.base.set(key, entry);
  }
  return c.memo.base.get(key);
}

function need(c, mode) {
  const b = base(c, mode);
  if (b.threw !== undefined) throw new Blocked("the parse of the inputs throws (H5)");
  return b.result;
}

const parseModes = (c) => (c.app === "statement" ? [c.modes[0]] : c.modes);

// Each input parsed alone in the first mode (H4, and the parsed months of H7).
function perFile(c) {
  if (!c.memo.perFile) {
    c.memo.perFile = c.paths.filter((p) => c.byPath.has(p)).map((p) => {
      const s = c.byPath.get(p);
      try {
        return { path: p, id: s.id, result: parseWith(c, [s], { mode: c.modes[0] }) };
      } catch (e) {
        return { path: p, id: s.id, threw: describe(e) };
      }
    });
  }
  return c.memo.perFile;
}

// True when a file parsed alone has an error: an errors entry with its id (statement apps), or
// {error} or no result (custom apps).
function fileError(c, f) {
  if (f.threw !== undefined) return true;
  if (c.app === "statement") return isObj(f.result) && Array.isArray(f.result.errors) && f.result.errors.some((e) => isObj(e) && e.id === f.id);
  return f.result === null || f.result === undefined || (isObj(f.result) && "error" in f.result);
}

function errorText(c, f) {
  if (f.threw !== undefined) return `throws: ${f.threw}`;
  if (c.app === "statement") return f.result.errors.filter((e) => isObj(e) && e.id === f.id).map((e) => String(e.error)).join("; ");
  return isObj(f.result) && "error" in f.result ? String(f.result.error) : "no result";
}

// The months of a result: {month} objects (statement apps) or "YYYY-MM" strings, in order.
function monthsOf(result) {
  if (!isObj(result) || !Array.isArray(result.months)) return [];
  const list = result.months.map((m) => (typeof m === "string" ? m : isObj(m) ? m.month : null)).filter((m) => typeof m === "string" && MONTH_RE.test(m));
  return [...new Set(list)].sort(byCodePoint);
}

const hookLines = (v, what) => (Array.isArray(v) ? v.map(String) : [`the ${what} hook returned ${v === null ? "null" : typeof v}, not an array of problem lines`]);
const ctxOf = (c, mode, extra = {}) => ({ P: c.handle.P, R: c.handle.R, mode, config: {}, from: null, to: null, ...extra });
const declaredWhere = (c) => (c.t.fixtures ? "the fixture spec's expectErrors" : "the private declaration expectErrors");

// ---------------------------------------------------------------- H1 load

function stepH1(c) {
  if (c.t.error) return { status: "fail", fatal: true, summary: "the descriptor cannot be loaded", problems: [c.t.error] };
  try {
    c.handle = LP.loadNode(c.t.id, { root: c.root });
  } catch (e) {
    return { status: "fail", fatal: true, summary: "the Node branch does not load", problems: [`loadNode: ${describe(e)}`] };
  }
  const h = c.handle;
  c.app = h.app;
  c.modes = h.modes.slice();
  c.legacy = isObj(h.frozen) && typeof h.frozen.legacyRepo === "string" && h.frozen.legacyRepo !== "";
  c.strict = c.run.opts.strict === null ? !c.legacy : c.run.opts.strict;
  c.testing = isObj(h.D) && isObj(h.D.testing) ? h.D.testing : { reconcile: h.app === "statement" ? "statement" : "custom", allowWarnings: false, gapDrop: h.app === "statement", fixtures: null };
  c.multiple = !(isObj(h.D) && h.D.multiple === false);
  c.configurator = h.app === "statement" || !!(isObj(h.D) && isObj(h.D.custom) && h.D.custom.config);
  c.inputs = (Array.isArray(h.R.inputs) ? h.R.inputs : h.D.inputs).slice();
  const problems = [];
  const exportsN = Object.keys(h.parser || {}).length;
  try {
    c.pageHandle = LP.loadPage(c.t.id, { root: c.root });
    const a = Object.keys(h.parser).sort(), b = Object.keys(c.pageHandle.parser).sort();
    if (a.join(",") !== b.join(",")) problems.push(`the parser global exports ${b.join(", ") || "nothing"} in the page, ${a.join(", ") || "nothing"} in Node`);
  } catch (e) {
    problems.push(`loadPage: ${describe(e)}`);
  }
  return { status: problems.length ? "fail" : "pass", summary: `the Node and page branches load (${plural(exportsN, "parser export")}, ${plural(c.modes.length, "mode")})`, counts: { exports: exportsN, modes: c.modes.length }, problems };
}

// ---------------------------------------------------------------- H2 inputs

function stepH2(c) {
  const t = c.t;
  c.expectErrors = new Set(t.expectErrors || []);
  c.allowProblems = t.allowProblems || 0;
  let paths = [];
  let ignored = 0;
  if (t.fixtures) {
    let spec;
    try {
      spec = fixturesLib.loadSpec(t.dir);
    } catch (e) {
      return { status: "fail", fatal: true, summary: "the fixture spec cannot be loaded", problems: [describe(e)] };
    }
    const dir = makeDir(path.join(c.work, "fixtures"), c.run.reads);
    const rendered = fixturesLib.renderFixtures(spec, dir);
    c.spec = spec;
    c.expectErrors = new Set(spec.expectErrors);
    c.allowProblems = 0;
    c.allowed = [dir];
    c.inputDir = dir;
    for (const p of rendered) {
      if (extractLib.kindFor(c.inputs, path.basename(p))) paths.push(p);
      else ignored++;
    }
  } else {
    c.allowed = [t.dir];
    c.inputDir = t.dir;
    for (const name of fs.readdirSync(t.dir)) {
      const p = path.join(t.dir, name);
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        st = null;
      }
      if (!st || !st.isFile() || !extractLib.kindFor(c.inputs, name)) {
        ignored++;
        continue;
      }
      priv.assertSafeInput(p, { allowed: [t.dir] });
      paths.push(p);
    }
  }
  // A real folder in JS string order; rendered fixtures in the spec's order, the order C13, the
  // smoke and the fixtures golden load them in, which a spec's expectErrors are written for (a
  // duplicate is the later file of the two).
  c.paths = t.fixtures ? paths : paths.sort(byName);
  c.ignored = ignored;
  const counts = { inputs: c.paths.length, ignored, declaredErrors: c.expectErrors.size, allowProblems: c.allowProblems };
  if (!c.paths.length) return { status: "fail", fatal: true, summary: `no file that a declared reader accepts (${ignored} other entries)`, counts, problems: ["the folder has no input file"] };
  return { status: "pass", summary: `${plural(c.paths.length, "input file")}${t.fixtures ? " rendered from the fixture spec" : ""}, ${ignored} other ${ignored === 1 ? "entry" : "entries"} ignored`, counts };
}

// ---------------------------------------------------------------- H3 extract

async function stepH3(c) {
  const readers = c.run.opts.nodeReaders ? "node" : "chrome";
  const browser = c.run.opts.browser && readers === "chrome" ? await c.run.browserOrNull() : c.run.browser;
  const ex = await extractLib.extract(c.paths, { handle: c.handle, readers, browser, allowed: c.allowed });
  c.statements = ex.statements;
  c.byPath = ex.byPath;
  c.failed = ex.failed;
  // Providers without legacyRepo get deep-frozen inputs, so a parser that changes them throws;
  // legacy parsers are verbatim and get a deep compare instead (H10).
  if (c.legacy) c.inputCanon = canonOrNull(c.statements);
  else for (const s of c.statements) deepFreeze(s);
  const undeclared = ex.failed.filter((f) => !c.expectErrors.has(f.id));
  const counts = { statements: ex.statements.length, readerFailures: ex.failed.length, undeclared: undeclared.length, cacheHits: ex.cache.hits, chromeReads: ex.cache.misses, readers };
  const how = readers === "node" ? "Node readers for CSV and XLSX" : `${ex.cache.hits} from the extraction cache, ${ex.cache.misses} read in Chrome`;
  return {
    status: undeclared.length ? "fail" : "pass",
    summary: `${plural(ex.statements.length, "statement")}, ${plural(ex.failed.length, "reader failure")} (${ex.failed.length - undeclared.length} declared); ${how}`,
    counts,
    problems: undeclared.map((f) => `${f.id}: the reader fails (not in ${declaredWhere(c)}): ${f.error}`),
    notes: ex.failed.filter((f) => c.expectErrors.has(f.id)).map((f) => `${f.id}: the reader fails, as declared: ${f.error}`),
  };
}

// ---------------------------------------------------------------- H4 per file

function stepH4(c) {
  const files = perFile(c);
  const threw = files.filter((f) => f.threw !== undefined);
  const errs = files.filter((f) => f.threw === undefined && fileError(c, f));
  const recognised = files.length - threw.length - errs.length;
  return {
    status: threw.length ? "fail" : "pass",
    summary: `${recognised} recognised, ${errs.length} with an error, ${threw.length} throwing (each file parsed alone, in the first mode)`,
    counts: { files: files.length, recognised, errors: errs.length, threw: threw.length },
    problems: threw.map((f) => `${f.id}: parse throws on this file alone: ${f.threw}`),
    notes: errs.map((f) => `${f.id}: ${errorText(c, f)}`),
  };
}

// ---------------------------------------------------------------- H5 parse

function stepH5(c) {
  const problems = [];
  const notes = [];
  const counts = { modes: 0, errors: 0, declared: c.expectErrors.size, missing: 0, undeclared: 0, warnings: 0, checkErrors: 0, checkWarnings: 0, unknown: 0 };
  const seen = new Map(c.failed.map((f) => [f.id, `the reader fails: ${f.error}`]));
  const allowWarnings = !!c.testing.allowWarnings;
  const warningsOf = (r, where) => {
    const w = isObj(r) && Array.isArray(r.warnings) ? r.warnings : [];
    counts.warnings += w.length;
    (allowWarnings ? notes : problems).push(...w.map((x) => `${where}warning${allowWarnings ? " (allowed)" : ""}: ${x}`));
  };
  if (c.app === "statement") {
    counts.modes = c.modes.length;
    const b = base(c);
    if (b.threw !== undefined) return { status: "fail", summary: "the parse of the inputs throws", counts, problems: [`parseStatements throws: ${b.threw}`] };
    const r = b.result;
    const cr = checkResult(r, c.handle.R, { strict: c.strict, P: c.handle.P });
    counts.checkErrors = cr.errors.length;
    counts.checkWarnings = cr.warnings.length;
    problems.push(...cr.errors.map((m) => `checkResult: ${m}`));
    notes.push(...cr.warnings.map((m) => `checkResult warning (not strict): ${m}`));
    for (const e of isObj(r) && Array.isArray(r.errors) ? r.errors : []) {
      if (isObj(e) && typeof e.id === "string" && !seen.has(e.id)) seen.set(e.id, String(e.error));
    }
    warningsOf(r, "");
    const unknown = (isObj(r) && Array.isArray(r.skippedRows) ? r.skippedRows : []).filter((x) => isObj(x) && x.category === "unknown");
    counts.unknown = unknown.length;
    const lines = unknown.map((x) => `a skipped row of category "unknown"${c.run.opts.allowUnknown ? " (allowed)" : ""}: ${x.date} ${x.detail === undefined ? "" : x.detail}`);
    (c.run.opts.allowUnknown ? notes : problems).push(...lines);
  } else {
    const hook = c.handle.test && typeof c.handle.test.checkResult === "function" ? c.handle.test.checkResult : null;
    for (const mode of c.modes) {
      counts.modes++;
      const b = base(c, mode);
      if (b.threw !== undefined) {
        problems.push(`mode ${mode}: test.parse throws: ${b.threw}`);
        continue;
      }
      const r = b.result;
      if (isObj(r) && "error" in r) {
        problems.push(`mode ${mode}: the inputs give {error}: ${r.error}`);
        continue;
      }
      if (r === null || r === undefined) {
        if (baseStatements(c).length) problems.push(`mode ${mode}: the inputs give no result`);
        continue;
      }
      if (hook) {
        const found = hookLines(hook(r, ctxOf(c, mode)), "checkResult");
        counts.checkErrors += found.length;
        problems.push(...found.map((m) => `mode ${mode}: test.checkResult: ${m}`));
      }
      warningsOf(r, `mode ${mode}: `);
    }
    for (const f of perFile(c)) if (fileError(c, f) && !seen.has(f.id)) seen.set(f.id, errorText(c, f));
  }
  counts.errors = seen.size;
  for (const [id, text] of seen) {
    if (c.expectErrors.has(id)) notes.push(`${id}: a declared error: ${text}`);
    else {
      counts.undeclared++;
      problems.push(`${id}: an error that ${declaredWhere(c)} does not list: ${text}`);
    }
  }
  for (const id of c.expectErrors) {
    if (seen.has(id)) continue;
    counts.missing++;
    problems.push(`${id}: listed in ${declaredWhere(c)}, but gives no error`);
  }
  const check = c.app === "statement" ? `${counts.checkErrors} checkResult errors, ${counts.checkWarnings} checkResult warnings` : `${counts.checkErrors} test.checkResult problems`;
  const scope = c.app === "statement" ? "every input, one parse for all modes" : plural(counts.modes, "mode");
  return {
    status: problems.length ? "fail" : "pass",
    summary: `${scope}: ${plural(counts.errors, "error")} (${counts.declared} declared, ${counts.missing} missing, ${counts.undeclared} undeclared), ${plural(counts.warnings, "warning")}${allowWarnings ? " (allowed)" : ""}, ${check}, ${counts.unknown} unknown rows${c.run.opts.allowUnknown ? " (allowed)" : ""}`,
    counts,
    problems,
    notes,
  };
}

// ---------------------------------------------------------------- H6 and H6b reconcile

// The statement reconciliation of the base result, computed once for H6 and H6b.
function statementParts(c) {
  if (!c.memo.parts) {
    const r = need(c);
    const parts = reconcileParts(c.handle, r);
    const hook = c.handle.test && typeof c.handle.test.reconcile === "function" ? c.handle.test.reconcile : null;
    const extra = hook ? hookLines(hook(r, ctxOf(c, c.modes[0])), "reconcile") : [];
    c.memo.parts = {
      counts: parts.counts,
      h6: [...parts.lines.filter((x) => x.part !== "monthly").map((x) => x.line), ...extra],
      monthly: parts.lines.filter((x) => x.part === "monthly").map((x) => x.line),
    };
  }
  return c.memo.parts;
}

function stepH6(c) {
  let lines = [];
  const counts = { lines: 0, allowed: c.allowProblems, accounts: 0, valuations: 0 };
  let how;
  if (c.app === "statement" && c.testing.reconcile === "statement") {
    const parts = statementParts(c);
    lines = parts.h6;
    counts.accounts = parts.counts.accounts;
    counts.valuations = parts.counts.valuations;
    how = `${plural(counts.accounts, "account")}, ${counts.valuations} month-end values`;
  } else {
    const hook = c.handle.test && typeof c.handle.test.reconcile === "function" ? c.handle.test.reconcile : null;
    if (!hook) return { status: "fail", summary: "test.js exports no reconcile hook", counts, problems: ['testing.reconcile "custom" needs test.js exporting reconcile()'] };
    for (const mode of c.modes) {
      const r = need(c, mode);
      lines.push(...(c.app === "statement" ? hookLines(hook(r, ctxOf(c, mode)), "reconcile") : hookLines(c.handle.reconcile(r, { mode, config: {} }), "reconcile")));
    }
    how = `test.reconcile in ${plural(c.modes.length, "mode")}`;
  }
  counts.lines = lines.length;
  const ok = lines.length <= c.allowProblems;
  return {
    status: ok ? "pass" : "fail",
    summary: `${plural(lines.length, "problem line")} (${c.allowProblems} allowed); ${how}`,
    counts,
    problems: ok ? [] : lines,
    notes: ok ? lines.map((l) => `within the declaration: ${l}`) : [],
  };
}

function stepH6b(c) {
  if (c.app !== "statement") return { status: "n/a", summary: "statement apps only" };
  if (c.testing.reconcile !== "statement") return { status: "n/a", summary: 'testing.reconcile is "custom"' };
  const parts = statementParts(c);
  const room = Math.max(0, c.allowProblems - parts.h6.length);
  const over = parts.monthly.length > room;
  const status = !over ? "pass" : c.strict ? "fail" : "report";
  return {
    status,
    summary: `${plural(parts.counts.months, "month")} checked, ${plural(parts.monthly.length, "problem")} (${room} left of the declaration)${c.strict ? "" : "; not strict: reported, not gating"}`,
    counts: { months: parts.counts.months, problems: parts.monthly.length, room },
    problems: over ? parts.monthly : [],
    notes: over ? [] : parts.monthly.map((l) => `within the declaration: ${l}`),
  };
}

// ---------------------------------------------------------------- H7 gap drop

// The months to drop (stashaway's old gaps.js, by parsed month instead of file-name prefix).
function gapCases(result, months) {
  const n = months.length;
  const mid = Math.floor(n / 2);
  const starts = Object.values(isObj(result) && isObj(result.accounts) ? result.accounts : {})
    .filter((a) => isObj(a) && isObj(a.months))
    .map((a) => Object.keys(a.months).sort(byCodePoint)[0])
    .filter((m) => m && m > months[0])
    .sort(byCodePoint);
  return [
    { label: "a middle month", drop: [months[mid]] },
    { label: "two consecutive months", drop: [months[mid], months[mid + 1]] },
    { label: "the first month an account appears", drop: starts.length ? [starts[0]] : null },
    { label: "the first month", drop: [months[0]] },
    { label: "the last month", drop: [months[n - 1]] },
  ].filter((k) => k.drop && k.drop.every(Boolean));
}

// Bridges plus firstOpenings: each account starts at its first opening (0 without one), then
// its balance-only entries must bring the running balance to every loaded closing.
function closingMisses(P, r) {
  const out = [];
  const months = monthsOf(r);
  const earliest = months.length ? months[0] : null;
  const firsts = isObj(r) && Array.isArray(r.firstOpenings) ? r.firstOpenings : [];
  for (const [name, a] of Object.entries(isObj(r) && isObj(r.accounts) ? r.accounts : {})) {
    const { entries } = P.adjustedEntries(a, null, null, earliest, false);
    const fo = firsts.find((o) => isObj(o) && o.account === name);
    const start = fo ? fo.opening : 0;
    let missed = 0;
    let worst = 0;
    for (const [date, value] of a.valuations) {
      const bal = start + entries.filter((e) => e.date <= date).reduce((s, e) => s - e.amount, 0);
      const diff = Math.abs(round2(bal) - value);
      if (!(diff < CENT)) missed++;
      if (!(diff <= worst)) worst = diff;
    }
    if (missed) out.push(`${name}: misses ${missed} of ${a.valuations.length} loaded closings (max diff ${worst.toFixed(2)})`);
  }
  return out;
}

function stepH7(c) {
  if (c.app !== "statement") return { status: "n/a", summary: "statement apps only" };
  if (!c.testing.gapDrop) return { status: "n/a", summary: "testing.gapDrop is off" };
  const r = need(c);
  const months = monthsOf(r);
  if (months.length < 3) return { status: "skip", summary: `fewer than 3 months (${months.length})`, counts: { months: months.length } };
  const cases = gapCases(r, months);
  const monthsByPath = new Map(perFile(c).map((f) => [f.path, new Set(f.threw === undefined ? monthsOf(f.result) : [])]));
  const problems = [];
  const notes = [];
  let ran = 0;
  let missing = 0;
  for (const k of cases) {
    const where = `${k.label} (${k.drop.join(", ")})`;
    const keep = c.paths.filter((p) => c.byPath.has(p) && !k.drop.some((m) => monthsByPath.get(p).has(m)));
    if (keep.length === c.statements.length) {
      notes.push(`${where}: no input has those months when parsed alone; nothing to drop`);
      continue;
    }
    if (!keep.length) {
      notes.push(`${where}: every input has those months; nothing would be left`);
      continue;
    }
    let rr;
    try {
      rr = parseWith(c, keep.map((p) => c.byPath.get(p)));
    } catch (e) {
      problems.push(`${where}: the parse without those inputs throws: ${describe(e)}`);
      continue;
    }
    ran++;
    const miss = closingMisses(c.handle.P, rr);
    if (miss.length) missing++;
    problems.push(...miss.map((m) => `${where}, ${keep.length} of ${c.statements.length} inputs kept: ${m}`));
  }
  const status = problems.length ? (c.strict ? "fail" : "report") : ran ? "pass" : "skip";
  return {
    status,
    summary: ran || problems.length
      ? `${ran} of ${plural(cases.length, "gap case")} run, ${missing} missing a loaded closing${c.strict ? "" : "; not strict: reported, not gating"}`
      : `none of ${plural(cases.length, "gap case")} drops an input and keeps another`,
    counts: { months: months.length, cases: cases.length, ran, missing },
    problems,
    notes,
  };
}

// ---------------------------------------------------------------- H8 files

// A CSV text: parses back (RFC 4180), every row has the header's cell count, the numeric columns
// hold finite numbers, and the header line is the expected one (when there is an expectation).
function csvProblems(text, { header = null } = {}) {
  let rows;
  try {
    rows = parseCsv(text);
  } catch (e) {
    return [`does not parse back as CSV: ${e.message}`];
  }
  if (!rows.length) return ["is empty (no header line)"];
  const out = [];
  const head = rows[0];
  const numeric = head.map((h, k) => (NUMERIC_COLUMNS.has(h) ? k : -1)).filter((k) => k >= 0);
  let badCells = 0;
  let badNumbers = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length !== head.length) {
      if (badCells++ < 5) out.push(`row ${i} has ${rows[i].length} cells, the header ${head.length}`);
      continue;
    }
    for (const k of numeric) {
      const cell = rows[i][k];
      if (cell === "" || cell.trim() !== cell || !Number.isFinite(Number(cell))) {
        if (badNumbers++ < 5) out.push(`row ${i}, column ${head[k]}: not a finite number`);
      }
    }
  }
  if (badCells > 5) out.push(`… ${badCells - 5} more rows with another cell count`);
  if (badNumbers > 5) out.push(`… ${badNumbers - 5} more cells that are not finite numbers`);
  if (header !== null && header !== undefined && text.split("\n")[0] !== header) out.push("the header line is not the one the composed writer gives");
  return out;
}

// A QIF text: "!Type:Bank", then records of field lines, each record ending with "^".
function qifProblems(text) {
  const out = [];
  const lines = String(text).split("\n");
  if (lines[0] !== "!Type:Bank") out.push("does not start with !Type:Bank");
  if (lines[lines.length - 1] !== "") out.push("does not end with a line break");
  let record = [];
  let bad = 0;
  lines.slice(1, -1).forEach((l, i) => {
    if (l === "^") {
      if (!record.length) out.push(`line ${i + 2}: an empty record`);
      else if (!record.some((x) => x[0] === "D") || !record.some((x) => x[0] === "T")) out.push(`line ${i + 2}: a record without a D or T line`);
      record = [];
      return;
    }
    if (!/^[A-Z$%]/.test(l) && bad++ < 5) out.push(`line ${i + 2}: not a QIF field line`);
    record.push(l);
  });
  if (record.length) out.push("the last record does not end with ^");
  return out;
}

// One file by its name: CSV and QIF have rules; any other type is reported, so a new type gets a
// rule rather than a silent pass.
function fileProblems(name, text, { header = null } = {}) {
  if (typeof text !== "string") return ["has no text"];
  const ext = path.extname(String(name)).toLowerCase();
  if (ext === ".csv") return csvProblems(text, { header });
  if (ext === ".qif") return qifProblems(text);
  return [`no rule for a ${ext || "nameless"} file (CSV, QIF and zip downloads have rules)`];
}

// One download record: a zip (built with zipParts, unpacked with CRCs checked, unique names, each
// entry checked by its name, against entryHeader(entry) when that gives a header) or a text file.
function downloadProblems(d, { header = null, entryHeader = null, now = new Date(FIXED_TIME), counts = null } = {}) {
  if (!isObj(d)) return ["a download record that is not an object"];
  if (typeof d.name !== "string" || !d.name) return ["a download record without a name"];
  if (Array.isArray(d.files) || d.type === "application/zip") {
    if (!Array.isArray(d.files)) return ["a zip record without its file list"];
    const out = [];
    let rec;
    try {
      [rec] = replay.toRecords([d], now);
    } catch (e) {
      return [`the zip cannot be built: ${describe(e)}`];
    }
    if (rec.zipError) out.push(`the zip does not unpack: ${rec.zipError}`);
    const names = (rec.entries || []).map((e) => e.name);
    const dup = names.filter((n, i) => names.indexOf(n) !== i);
    if (dup.length) out.push(`${plural(dup.length, "duplicate entry name")}`);
    if (!d.files.length) out.push("an empty zip");
    if (counts) {
      counts.zips++;
      counts.entries += names.length;
    }
    d.files.forEach((f, i) => {
      if (!isObj(f)) {
        out.push(`entry ${i + 1}: not a {name, text} object`);
        return;
      }
      let h = null;
      if (entryHeader) {
        try {
          h = entryHeader(f);
        } catch (e) {
          out.push(`entry ${i + 1}: expectedHeader throws: ${describe(e)}`);
        }
      }
      if (counts && h !== null && h !== undefined) counts.entryHeaders++;
      for (const m of fileProblems(f.name, f.text, { header: h })) out.push(`entry ${i + 1}: ${m}`);
    });
    return out;
  }
  if (typeof d.text !== "string") return ["a download record with neither text nor files"];
  if (counts) {
    const ext = path.extname(d.name).toLowerCase();
    if (ext === ".csv") counts.csv++;
    else if (ext === ".qif") counts.qif++;
  }
  return fileProblems(d.name, d.text, { header });
}

const dataRows = (text) => {
  try {
    return Math.max(0, parseCsv(text).length - 1);
  } catch {
    return null;
  }
};

// The Combined files' names (core/files.js): the trades file, then the transactions file.
const combinedNamesOf = ({ brand, groupNoun }, span) => [`${brand} all ${groupNoun} - trades - ${span}.csv`, `${brand} all ${groupNoun} - transactions - ${span}.csv`];

// The statement-app rules of one state's downloads (design: core/files.js): the span rules of
// every name, Download all = [Accounts CSV, every card file in card and button order] with unique
// names and the Accounts entry once and first, the Accounts rows, and the Combined rows.
function statementStateProblems(list, { naming, from, to, mode, result, P, kindModel = "standard" }) {
  const out = [];
  const span = from === to ? from : `${from}_to_${to}`;
  const zspan = `${from}_to_${to}`;
  const { accountPrefix, brand, groupNoun, slug } = naming;
  const cards = list.filter((d) => isObj(d) && d.trigger === "card" && !d.disabled);
  const one = (t) => {
    const all = list.filter((d) => isObj(d) && d.trigger === t);
    if (all.length !== 1) out.push(`${all.length} ${t} records (one expected)`);
    return all[0] || null;
  };
  const acc = one("accounts");
  const comb = one("combined");
  const zip = one("zip");
  for (const d of cards) {
    const want = d.kind === "qif" ? `${accountPrefix}${d.account} - ${span}.qif` : `${accountPrefix}${d.account} - ${d.kind} - ${span}.csv`;
    if (d.name !== want) out.push(`a card ${d.kind} file is named ${JSON.stringify(d.name)}, the span rule gives ${JSON.stringify(want)}`);
  }
  const enabled = (d) => d && !d.disabled;
  if (cards.length && ![acc, comb, zip].every(enabled)) out.push("the toolbar is disabled although cards offer files");
  if (enabled(acc) && acc.name !== `${brand} accounts - ${span}.csv`) out.push(`the Accounts CSV is named ${JSON.stringify(acc.name)}`);
  const combinedNames = combinedNamesOf({ brand, groupNoun }, span);
  if (enabled(comb)) {
    if (Array.isArray(comb.files)) {
      if (comb.name !== `${slug}-combined-${zspan}.zip`) out.push(`the Combined zip is named ${JSON.stringify(comb.name)}`);
      if (comb.files.map((f) => f.name).join("\n") !== combinedNames.join("\n")) out.push("the Combined zip does not hold the trades and the transactions file, in that order");
    } else if (comb.name !== combinedNames[1]) out.push(`the Combined CSV is named ${JSON.stringify(comb.name)}`);
  }
  if (enabled(zip)) {
    if (zip.name !== `${slug}-csv-${zspan}.zip`) out.push(`Download all is named ${JSON.stringify(zip.name)}`);
    const files = Array.isArray(zip.files) ? zip.files : [];
    const names = files.map((f) => f.name);
    if (new Set(names).size !== names.length) out.push("Download all has duplicate names");
    if (enabled(acc)) {
      const n = names.filter((x) => x === acc.name).length;
      if (n !== 1 || names[0] !== acc.name) out.push(`Download all holds the Accounts CSV ${n} times${n ? ", not first" : ""} (once, first, expected)`);
    }
    const want = [acc, ...cards].filter(enabled).map((d) => `${d.name}\u0000${d.text}`);
    const got = files.map((f) => `${f.name}\u0000${f.text}`);
    if (want.join("\u0001") !== got.join("\u0001")) out.push("Download all is not the Accounts CSV followed by every card file in card and button order");
  }
  if (enabled(acc)) {
    const earliest = isObj(result) && Array.isArray(result.months) && result.months.length ? result.months[0].month : null;
    const names = [...new Set(cards.map((d) => d.account))];
    let expected = 0;
    for (const name of names) {
      const a = result.accounts[name];
      if (!a) continue;
      const eff = effectiveMode(mode, result, name, kindModel) || mode;
      const entries = eff === "holdings" ? [...a.trades, ...a.cash].filter((e) => P.inRange(e.date, from, to)) : P.adjustedEntries(a, from, to, earliest, eff === "tradelog").entries;
      if (P.openingBalance(a, from, to, earliest, entries)) expected++;
    }
    const rows = dataRows(acc.text);
    if (rows !== null && rows !== expected) out.push(`the Accounts CSV has ${rows} rows, ${expected} accounts have files and an opening`);
  }
  if (enabled(comb)) {
    const sum = (kind) => cards.filter((d) => d.kind === kind).reduce((s, d) => s + (dataRows(d.text) || 0), 0);
    const tx = sum("transactions");
    const tr = sum("trades");
    const files = Array.isArray(comb.files) ? comb.files : [{ name: comb.name, text: comb.text }];
    const txFile = files.find((f) => f.name === combinedNames[1]);
    const trFile = files.find((f) => f.name === combinedNames[0]);
    const txRows = txFile ? dataRows(txFile.text) : null;
    const trRows = trFile ? dataRows(trFile.text) : 0;
    if (txRows !== null && txRows !== tx) out.push(`the Combined transactions file has ${txRows} rows, the cards' transactions files ${tx}`);
    if (trRows !== null && trRows !== tr) out.push(`the Combined trades file has ${trRows} rows, the cards' trades files ${tr}`);
  }
  return out;
}

function stepH8(c) {
  const problems = [];
  const counts = { states: 0, records: 0, disabled: 0, csv: 0, qif: 0, zips: 0, entries: 0, entryHeaders: 0, problems: 0 };
  const now = new Date(FIXED_TIME);
  const kindModel = c.handle.R.ui ? c.handle.R.ui.kindModel : "standard";
  for (const mode of c.modes) {
    const r = need(c, mode);
    const months = monthsOf(r);
    const ranges = !months.length ? [[null, null]] : months.length === 1 ? [[months[0], months[0]]] : [[months[0], months[months.length - 1]], ...months.map((m) => [m, m])];
    for (const [from, to] of ranges) {
      counts.states++;
      const where = `${mode} ${from === to ? from || "(no months)" : `${from} to ${to}`}`;
      let list;
      try {
        list = c.handle.downloads(r, { mode, from, to });
      } catch (e) {
        problems.push(`${where}: the downloads hook throws: ${describe(e)}`);
        continue;
      }
      if (!Array.isArray(list)) {
        problems.push(`${where}: the downloads hook does not return an array`);
        continue;
      }
      for (const d of list) {
        if (isObj(d) && d.disabled) {
          counts.disabled++;
          continue;
        }
        counts.records++;
        let header = null;
        try {
          header = c.handle.expectedHeader(d, { mode, result: r });
        } catch (e) {
          problems.push(`${where}: expectedHeader throws: ${describe(e)}`);
        }
        // A statement app's Combined zip: each entry against the writer of its kind, which its
        // name gives (core/contract/headers.js describes an entry as {trigger, kind}).
        const names = c.app === "statement" && isObj(d) && d.trigger === "combined" ? combinedNamesOf(c.handle.R.naming, from === to ? from : `${from}_to_${to}`) : null;
        const entryHeader = names ? (f) => {
          const kind = f.name === names[0] ? "trades" : f.name === names[1] ? "transactions" : null;
          return kind ? c.handle.expectedHeader({ trigger: "combined", account: null, kind, name: f.name, type: "text/csv" }, { mode, result: r }) : null;
        } : null;
        const what = isObj(d) ? `${d.trigger}${d.kind ? ` ${d.kind}` : ""}${d.account ? ` of ${d.account}` : ""}` : "a record";
        problems.push(...downloadProblems(d, { header, entryHeader, now, counts }).map((m) => `${where}: ${what}: ${m}`));
      }
      if (c.app === "statement") {
        try {
          problems.push(...statementStateProblems(list, { naming: c.handle.R.naming, from, to, mode, result: r, P: c.handle.P, kindModel }).map((m) => `${where}: ${m}`));
        } catch (e) {
          problems.push(`${where}: the statement-app rules cannot be checked: ${describe(e)}`);
        }
      }
    }
  }
  counts.problems = problems.length;
  return {
    status: problems.length ? "fail" : "pass",
    summary: `${plural(counts.states, "state")}, ${counts.records} downloads (${counts.csv} CSV, ${counts.qif} QIF, ${counts.zips} zips with ${counts.entries} entries, ${counts.entryHeaders} of them with a header to match), ${counts.disabled} disabled, ${plural(problems.length, "problem")}`,
    counts,
    problems,
  };
}

// ---------------------------------------------------------------- H9 config contract

function stepH9(c) {
  if (c.app !== "statement") return { status: "n/a", summary: "statement apps only" };
  const r = need(c);
  const ps = (Array.isArray(r.portfolios) ? r.portfolios : []).filter((p) => isObj(p) && typeof p.id === "string" && typeof p.label === "string");
  if (!ps.length) return { status: "skip", summary: "no portfolios", counts: { portfolios: 0 } };
  const problems = [];
  const notes = [];
  const ran = [];
  const labelCount = new Map();
  for (const p of ps) labelCount.set(p.label, (labelCount.get(p.label) || 0) + 1);
  const names = (x) => Object.keys(isObj(x) && isObj(x.accounts) ? x.accounts : {});
  const months = monthsOf(r);
  const [from, to] = months.length ? [months[0], months[months.length - 1]] : [null, null];
  const prefix = c.handle.R.naming.accountPrefix;
  const parse = (config, what) => {
    try {
      const out = parseWith(c, c.statements, { config });
      if (!isObj(out) || !isObj(out.accounts)) throw new Error("no accounts in the result");
      return out;
    } catch (e) {
      problems.push(`${what}: the parse throws: ${describe(e)}`);
      return null;
    }
  };
  const cards = (res, mode, account) => c.handle.downloads(res, { mode, from, to }).filter((d) => isObj(d) && d.trigger === "card" && !d.disabled && d.account === account);
  const byMonth = (a) => {
    const m = new Map();
    for (const [date, v] of isObj(a) && Array.isArray(a.valuations) ? a.valuations : []) m.set(String(date).slice(0, 7), (m.get(String(date).slice(0, 7)) || 0) + v);
    return m;
  };
  const sums = (what, merged, x, y) => {
    const mm = byMonth(merged), mx = byMonth(x), my = byMonth(y);
    let bad = 0;
    for (const k of new Set([...mm.keys(), ...mx.keys(), ...my.keys()])) {
      const want = (mx.get(k) || 0) + (my.get(k) || 0);
      if (!(Math.abs((mm.get(k) || 0) - want) <= MERGE_TOLERANCE)) {
        bad++;
        if (bad <= 5) problems.push(`${what}: ${k}: the merged month-end value is ${(mm.get(k) || 0).toFixed(2)}, the sum ${want.toFixed(2)}`);
      }
    }
    if (bad > 5) problems.push(`${what}: … ${bad - 5} more months`);
  };
  const p0 = ps[0];
  // 1. Rename the first portfolio: its account and its export name follow.
  if (!own(r.accounts, p0.label)) problems.push(`rename: the first portfolio's label ${JSON.stringify(p0.label)} is not an account of the result with no config`);
  else {
    const r1 = parse({ [p0.id]: { name: RENAME } }, "rename");
    if (r1) {
      ran.push("rename");
      if (!own(r1.accounts, RENAME)) problems.push("rename: no account has the new name");
      if (labelCount.get(p0.label) === 1 && own(r1.accounts, p0.label)) problems.push("rename: the old name is still an account");
      const before = cards(r, c.modes[0], p0.label).length;
      const after = cards(r1, c.modes[0], RENAME).filter((d) => d.name.startsWith(`${prefix}${RENAME} - `)).length;
      if (before !== after) problems.push(`rename: ${before} card files before, ${after} named after the new name`);
    }
  }
  // 2. Exclude the last portfolio (only with more than one): its account disappears.
  if (ps.length > 1) {
    const pl = ps[ps.length - 1];
    const r2 = parse({ [pl.id]: { exclude: true } }, "exclude");
    if (r2) {
      ran.push("exclude");
      if (labelCount.get(pl.label) === 1) {
        if (own(r2.accounts, pl.label)) problems.push("exclude: the excluded portfolio's account is still there");
        if (names(r2).length !== names(r).length - 1) problems.push(`exclude: ${names(r2).length} accounts, ${names(r).length - 1} expected`);
      } else notes.push("exclude: the last portfolio shares its label with another one; only the parse was checked");
    }
  } else notes.push("exclude: one portfolio only (guarded)");
  // 3. Flip the first portfolio's kind: the account's kind follows, and a cash-like account
  //    exports Balance only in every mode while an investment follows the mode.
  if (own(r.accounts, p0.label)) {
    const kind = p0.kind === "investment" ? "cash" : "investment";
    const r3 = parse({ [p0.id]: { kind } }, "kind");
    if (r3) {
      ran.push("kind");
      const a = r3.accounts[p0.label];
      if (!isObj(a) || a.kind !== kind) problems.push(`kind: the account's kind is ${JSON.stringify(isObj(a) ? a.kind : null)}, the config sets ${JSON.stringify(kind)}`);
      else if (c.modes.includes("holdings")) {
        const allowed = kind === "investment" ? HOLDINGS_FILES : BALANCE_FILES;
        const bad = cards(r3, "holdings", p0.label).filter((d) => !allowed.has(d.kind)).map((d) => d.kind);
        if (bad.length) problems.push(`kind: as ${kind}, the account offers ${bad.join(", ")} files in holdings mode`);
        if (kind === "cash") notes.push(`kind: ${plural(a.trades.length, "trade")} kept on the account set to cash-like (reported, not asserted)`);
      }
    }
  }
  // 4-5. Merge two portfolios of the same currency, then give two the same name: the month-end
  //      values of the merged account are the per-month sums.
  let pair = null;
  for (let i = 0; i < ps.length && !pair; i++) {
    for (let j = i + 1; j < ps.length && !pair; j++) {
      const [a, b] = [ps[i], ps[j]];
      if (typeof a.currency === "string" && a.currency === b.currency && a.label !== b.label && labelCount.get(a.label) === 1 && labelCount.get(b.label) === 1) pair = [a, b];
    }
  }
  if (!pair) notes.push("merge and same name: no two portfolios with the same currency and their own accounts");
  else {
    const [pa, pb] = pair;
    const r4 = parse({ [pb.id]: { mergeInto: pa.id } }, "merge");
    if (r4) {
      ran.push("merge");
      if (!own(r4.accounts, pa.label)) problems.push("merge: the target's account is gone");
      else if (own(r4.accounts, pb.label)) problems.push("merge: the merged portfolio's account is still there");
      else sums("merge", r4.accounts[pa.label], r.accounts[pa.label], r.accounts[pb.label]);
    }
    const r5 = parse({ [pa.id]: { name: SAME_NAME }, [pb.id]: { name: SAME_NAME } }, "same name");
    if (r5) {
      ran.push("same name");
      if (!own(r5.accounts, SAME_NAME)) problems.push("same name: no account has the shared name");
      else {
        if (own(r5.accounts, pa.label) || own(r5.accounts, pb.label)) problems.push("same name: an old name is still an account");
        if (names(r5).length !== names(r).length - 1) problems.push(`same name: ${names(r5).length} accounts, ${names(r).length - 1} expected`);
        sums("same name", r5.accounts[SAME_NAME], r.accounts[pa.label], r.accounts[pb.label]);
      }
    }
  }
  const status = !problems.length ? "pass" : c.strict ? "fail" : "report";
  return {
    status,
    summary: `${ran.length} config checks run (${ran.join(", ") || "none"}), ${plural(problems.length, "problem")}${c.strict ? "" : "; not strict: reported, not gating"}`,
    counts: { portfolios: ps.length, checks: ran.length, problems: problems.length },
    problems,
    notes,
  };
}

// ---------------------------------------------------------------- H10 determinism

// The canonical text of a result for the reversed-order comparison: the lists that follow the
// input order by contract (errors, warnings, skippedRows) compared as multisets, and months[].id
// (which input a month was first seen in; the core reads only the month) left out.
function orderCanon(r) {
  if (!isObj(r)) return canonOrNull(r);
  const x = { ...r };
  for (const k of ["errors", "warnings", "skippedRows"]) {
    if (Array.isArray(x[k])) x[k] = x[k].map((e) => canonOrNull(e)).sort(byCodePoint);
  }
  if (Array.isArray(x.months)) x.months = x.months.map((m) => (isObj(m) ? { month: m.month } : m));
  return canonOrNull(x);
}

const DUPLICATE = /duplicate/i;
function hasDuplicateErrors(r) {
  if (!isObj(r)) return false;
  if (typeof r.error === "string" && DUPLICATE.test(r.error)) return true;
  return Array.isArray(r.errors) && r.errors.some((e) => isObj(e) && DUPLICATE.test(String(e.error)));
}

function stepH10(c) {
  const problems = [];
  const reversed = [];
  let repeats = 0;
  const statements = baseStatements(c);
  for (const mode of parseModes(c)) {
    const b = base(c, mode);
    if (b.threw !== undefined) {
      problems.push(`mode ${mode}: the parse of the inputs throws (H5)`);
      continue;
    }
    let again;
    try {
      again = parseWith(c, statements, { mode });
    } catch (e) {
      problems.push(`mode ${mode}: the second parse throws: ${describe(e)}`);
      continue;
    }
    const [x, y] = [canonOrNull(b.result), canonOrNull(again)];
    if (x === null || y === null) problems.push(`mode ${mode}: the result is not plain data (canon cannot write it)`);
    else if (x !== y) problems.push(`mode ${mode}: two parses of the same inputs give different results`);
    else repeats++;
  }
  if (c.legacy && canonOrNull(c.statements) !== c.inputCanon) problems.push("the parser changed its input statements (deep compare before and after)");
  let skipped = null;
  if (statements.length < 2) skipped = "one input";
  else if (!c.multiple) skipped = "a single-file picker";
  else if (parseModes(c).some((m) => hasDuplicateErrors(base(c, m).result))) skipped = "duplicate-statement errors";
  if (!skipped) {
    for (const mode of parseModes(c)) {
      const b = base(c, mode);
      if (b.threw !== undefined) continue;
      let rr;
      try {
        rr = parseWith(c, statements.slice().reverse(), { mode });
      } catch (e) {
        reversed.push(`mode ${mode}: the parse of the reversed inputs throws: ${describe(e)}`);
        continue;
      }
      if (orderCanon(b.result) !== orderCanon(rr)) reversed.push(`mode ${mode}: the reversed input order gives another result`);
    }
  }
  const status = problems.length ? "fail" : !reversed.length ? "pass" : c.strict ? "fail" : "report";
  const rev = skipped ? `skipped (${skipped})` : reversed.length ? `differs${c.strict ? "" : " (not strict: reported, not gating)"}` : "the same result";
  return {
    status,
    summary: `${repeats} of ${plural(parseModes(c).length, "repeated parse")} equal; inputs ${c.legacy ? "deep-compared" : "deep-frozen"}; reversed order: ${rev}`,
    counts: { repeats, inputs: c.legacy ? "deep-compared" : "deep-frozen", reversed: skipped ? "skipped" : reversed.length ? "differs" : "same" },
    problems: [...problems, ...reversed],
  };
}

// ---------------------------------------------------------------- H11 portfolio ids

function stepH11(c) {
  if (!c.configurator) return { status: "n/a", summary: "no configurator" };
  const pattern = isObj(c.handle.frozen) ? c.handle.frozen.configIdPattern : undefined;
  if (pattern === null || pattern === undefined) return { status: "skip", summary: isObj(c.handle.frozen) ? "frozen.configIdPattern is null" : "no frozen.js" };
  let re;
  try {
    re = new RegExp(pattern);
  } catch (e) {
    return { status: "fail", summary: "frozen.configIdPattern does not compile", problems: [describe(e)] };
  }
  const ids = new Set();
  for (const mode of parseModes(c)) {
    const r = need(c, mode);
    for (const p of isObj(r) && Array.isArray(r.portfolios) ? r.portfolios : []) if (isObj(p)) ids.add(p.id);
  }
  const bad = [...ids].filter((id) => typeof id !== "string" || !re.test(id));
  return {
    status: bad.length ? "fail" : "pass",
    summary: `${plural(ids.size, "portfolio id")}, ${bad.length} not matching frozen.configIdPattern`,
    counts: { ids: ids.size, bad: bad.length },
    problems: bad.map((id) => `the portfolio id ${JSON.stringify(id)} does not match ${pattern}`),
  };
}

// ---------------------------------------------------------------- H12 the page

const BOGUS = { pdf: ["zz-not-a-statement.pdf", "not a pdf"], xlsx: ["zz-not-a-statement.xlsx", "not a zip"], csv: ["zz-not-a-statement.csv", "hello"] };

function writeBogus(dir, reads) {
  const out = {};
  for (const [input, [name, text]] of Object.entries(BOGUS)) out[input] = writeOut(path.join(dir, name), text, reads);
  return out;
}

async function overflow(page) {
  await page.setViewportSize(NARROW);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  return o.scroll > o.client ? `horizontal overflow at ${NARROW.width} px: the page is ${o.scroll} px wide` : null;
}

async function stepH12(c) {
  if (!c.run.opts.browser) return { status: "skip", summary: "needs --browser" };
  const smoke = require(path.join(REPO, "test", "smoke", "pages.js"));
  const serve = lib("serve.js");
  const browserLib = lib("browser.js");
  const driverLib = lib("page-driver.js");
  const problems = [];
  const counts = { states: 0, records: 0, mismatches: 0, ranges: 0, instances: 0, pageErrors: 0, bogus: 0, warned: 0, overflow: 0, settings: 0, persistence: "n/a" };
  // The page: dist/<id>/index.html when it equals a fresh build, else (skeletons, unpublished
  // providers) a temporary build. A stale dist page is not tested.
  const target = smoke.pageTargets(c.root, { providers: [c.t.id], tmp: makeDir(path.join(c.work, "page"), c.run.reads) }).find((t) => t.id === c.t.id);
  if (!target || !target.file) return { status: "fail", summary: "no page to open (see the report)", counts, problems: target ? target.problems : ["the provider has no page"] };
  // Everything that can throw before the server starts: once it listens, only the finally
  // below closes it, and an open server would keep the process alive.
  const bogus = writeBogus(path.join(c.work, "bogus"), c.run.reads);
  const D = c.handle.D;
  const spec = { expectErrors: [...c.expectErrors] };
  const configKey = c.handle.R.storage.configKey;
  const browser = await c.run.browserLaunch();
  // Served from 127.0.0.1, so storage carries across the reload (on file:// Chrome now and then
  // gives a document a storage area of its own; docs/MIGRATION.md).
  const server = await serve({ [`/${c.t.id}/index.html`]: target.file });
  const url = `${server.origin}/${c.t.id}/index.html`;
  const instance = async (label, fn) => {
    counts.instances++;
    const context = await browserLib.newContext(browser, browserLib.ENVS.E0, {});
    try {
      let d;
      try {
        d = await driverLib.open(context, url);
      } catch (e) {
        problems.push(`${label}: the page does not open: ${describe(e)}`);
        return;
      }
      try {
        await fn(d);
      } catch (e) {
        problems.push(`${label}: ${describe(e)}`);
      }
      const errs = smoke.errorProblems(await d.errors());
      counts.pageErrors += errs.length;
      problems.push(...errs.map((m) => `${label}: ${m}`));
    } finally {
      await context.close().catch(() => {});
    }
  };
  const loadInputs = async (d) => {
    for (const r of await smoke.loadFixtures(d, D, c.paths, spec)) if (r.busy !== "idle") throw new Error("the page stays busy after loading the inputs");
  };
  const pageMonths = (d) => d.page.evaluate(() => [...document.getElementById("from").options].map((o) => o.value));
  const pageState = (d) => d.page.evaluate(() => {
    const on = document.querySelector("#mode button.on[data-mode]");
    return { mode: on ? on.dataset.mode : null, from: document.getElementById("from").value || null, to: document.getElementById("to").value || null };
  });
  // The captured records against the downloads hook's Node rebuild of the same state, and the
  // months the range offers against that rebuild's months: every state takes its range from the
  // page, so a page that hid or added a month would otherwise compare equal.
  const compare = async (d, label, records) => {
    const st = await pageState(d);
    const config = configKey ? (await d.storage([configKey]))[configKey] : null;
    const rebuilt = replay.replayStep(c.handle, c.byPath, { config, mode: st.mode, from: st.from, to: st.to, paths: d.addOrder() }, {});
    counts.states++;
    counts.records += records.length;
    if (rebuilt.threw) problems.push(`${label}: the Node rebuild throws: ${rebuilt.threw}`);
    const shown = await pageMonths(d);
    const want = monthsOf(rebuilt.result);
    if (shown.join(" ") !== want.join(" ")) {
      counts.ranges++;
      const missing = want.filter((m) => !shown.includes(m));
      const extra = shown.filter((m) => !want.includes(m));
      problems.push(`${label}: the range offers ${plural(shown.length, "month")}, the hook's result has ${want.length} (not offered: ${missing.join(", ") || "none"}; not in the result: ${extra.join(", ") || "none"}${missing.length || extra.length ? "" : "; in another order"})`);
    }
    const m = replay.compareRecords(records, rebuilt.records);
    counts.mismatches += m.length;
    for (const x of m.slice(0, 20)) problems.push(`${label}: record ${x.index} (${x.trigger}) ${x.field}: the page has ${JSON.stringify(x.expected)}, the hook ${JSON.stringify(x.actual)}`);
    if (m.length > 20) problems.push(`${label}: … ${m.length - 20} more mismatches`);
  };
  const warned = (d, name) => d.page.evaluate((n) => [...document.querySelectorAll("#status .warn")].some((p) => p.textContent.includes(n)), name);
  try {
    await instance("the inputs", async (d) => {
      await loadInputs(d);
      const months = await pageMonths(d);
      const last = months[months.length - 1];
      const ranges = months.length ? [["full", months[0], last], ["last month", last, last]] : [["no months", null, null]];
      for (const mode of c.modes) {
        await d.setMode(mode);
        for (const [label, from, to] of ranges) {
          if (from !== null) await d.setRange(from, to);
          const st = await pageState(d);
          if (st.mode !== mode) problems.push(`${mode}/${label}: the mode button ${mode} is not on after its click`);
          await compare(d, `${mode}/${label}`, await d.clickAll());
        }
      }
      const o = await overflow(d.page);
      if (o) {
        counts.overflow++;
        problems.push(`with results: ${o}`);
      }
      await d.page.setViewportSize(browserLib.CONTEXT_OPTIONS.viewport);
      if (!c.configurator || !configKey) return;
      // Configurator settings: rename, kind, exclude (with more than one row), merge (two rows of
      // the same currency); a reload keeps all of them; then Reset stores {}.
      const rows = (await d.probe()).portfolios;
      if (!rows.length) {
        counts.persistence = "no rows";
        return;
      }
      await d.setMode(c.modes[0]);
      if (months.length) await d.setRange(months[0], last);
      const before = await d.clickAll();
      await compare(d, "configurator: before", before);
      const ops = [{ rename: { index: 0, name: RENAME } }, { kind: { index: 0, value: rows[0].autoKind === KIND_LABEL.investment ? "cash" : "investment" } }];
      const excluded = rows.length > 1 ? rows.length - 1 : null;
      if (excluded !== null) ops.push({ exclude: { index: excluded } });
      const open = rows.filter((x) => x.index !== excluded);
      outer: for (let i = 0; i < open.length; i++) {
        for (let j = i + 1; j < open.length; j++) {
          if (open[i].currency && open[i].currency === open[j].currency) {
            ops.push({ merge: { from: open[j].index, into: open[i].index } });
            break outer;
          }
        }
      }
      for (const op of ops) {
        await d.config(op);
        await compare(d, `configurator: ${Object.keys(op)[0]}`, await d.clickAll());
      }
      counts.settings = ops.length;
      const stored = (await d.storage([configKey]))[configKey];
      const snapA = await d.snapshot();
      const recA = await d.clickAll();
      await d.reload();
      await loadInputs(d);
      if (months.length) await d.setRange(months[0], last);
      const snapB = await d.snapshot();
      const recB = await d.clickAll();
      await compare(d, "configurator: after the reload", recB);
      const ok = [];
      if ((await d.storage([configKey]))[configKey] !== stored) problems.push("configurator: the stored settings changed across the reload");
      else ok.push("storage");
      if (snapB.config !== snapA.config || snapB.configCount !== snapA.configCount) problems.push("configurator: the rows show other settings after the reload");
      else ok.push("rows");
      const m = replay.compareRecords(recA, recB);
      if (m.length) problems.push(`configurator: the downloads differ after the reload (${m.length} mismatches)`);
      else ok.push("downloads");
      await d.config({ reset: true });
      if ((await d.storage([configKey]))[configKey] !== "{}") problems.push("configurator: Reset does not store {}");
      const recC = await d.clickAll();
      await compare(d, "configurator: after Reset", recC);
      const back = replay.compareRecords(before, recC);
      if (back.length) problems.push(`configurator: after Reset the downloads are not the first ones (${back.length} mismatches)`);
      counts.persistence = ok.length === 3 && !back.length ? "kept across a reload, then reset" : "failed";
    });
    let first = true;
    for (const input of c.inputs) {
      for (const via of ["picker", "drop"]) {
        await instance(`a bogus ${input} file by ${via}`, async (d) => {
          if (first) {
            first = false;
            const o = await overflow(d.page);
            if (o) {
              counts.overflow++;
              problems.push(`empty state: ${o}`);
            }
            await d.page.setViewportSize(browserLib.CONTEXT_OPTIONS.viewport);
          }
          counts.bogus++;
          const r = await d.load([bogus[input]], { via });
          if (r.busy !== "idle") problems.push(`a bogus ${input} file by ${via}: the page stays busy`);
          if (await warned(d, path.basename(bogus[input]))) counts.warned++;
          else problems.push(`a bogus ${input} file by ${via}: no #status .warn line names it`);
        });
      }
    }
    if (c.multiple) {
      const b = bogus[c.inputs[0]];
      for (const where of ["first", "last"]) {
        const label = `a bogus file ${where} in the full batch`;
        await instance(label, async (d) => {
          counts.bogus++;
          const r = await d.load(where === "first" ? [b, ...c.paths] : [...c.paths, b], { via: "picker" });
          if (r.busy !== "idle") problems.push(`${label}: the page stays busy`);
          if (await warned(d, path.basename(b))) counts.warned++;
          else problems.push(`${label}: no #status .warn line names it`);
          // The real files must still give the hook's downloads. The rebuild leaves the bogus file
          // out (it has no statement), as the page does where its reader fails on it; a bogus CSV
          // reaches the parser and gives an errors entry, which no download carries.
          await compare(d, label, await d.clickAll());
        });
      }
    }
  } finally {
    await server.close();
  }
  return {
    status: problems.length ? "fail" : "pass",
    summary: `${plural(counts.states, "state")}, ${counts.records} records, ${plural(counts.mismatches, "mismatch", "mismatches")} with the hook, ${counts.ranges} ranges unlike its months; ${counts.warned} of ${counts.bogus} bogus loads warn; ${plural(counts.pageErrors, "page error")}; ${plural(counts.overflow, "overflow")}; configurator: ${counts.persistence}${counts.settings ? ` (${counts.settings} settings)` : ""}; ${counts.instances} page instances`,
    counts,
    problems,
  };
}

// ---------------------------------------------------------------- H13 dump

const safeName = (s) => String(s).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);

async function stepH13(c) {
  if (!c.run.opts.dump) return { status: "skip", summary: "needs --dump" };
  const dir = path.join(c.outDir, "dump");
  makeDir(dir, c.run.reads);
  const transform = isObj(c.handle.R.pdf) ? c.handle.R.pdf.pageTransform : null;
  let raw = c.statements;
  if (transform) {
    const readers = c.run.opts.nodeReaders ? "node" : "chrome";
    raw = (await extractLib.extract(c.paths, { inputs: c.inputs, pageTransform: null, readers, browser: c.run.browser, allowed: c.allowed })).statements;
  }
  const L = require(path.join(REPO, "core", "layout.js"));
  const transformed = new Map(c.statements.map((s) => [s.id, s]));
  const counts = { statements: raw.length, pdf: 0, csv: 0, xlsx: 0, files: 0 };
  const put = (name, data) => {
    writeOut(path.join(dir, name), data, c.run.reads);
    counts.files++;
  };
  raw.forEach((s, i) => {
    const stem = `${String(i + 1).padStart(3, "0")}-${safeName(s.id)}`;
    if (Array.isArray(s.pages)) {
      counts.pdf++;
      put(`${stem}.items.json`, `${JSON.stringify(s.pages, null, 1)}\n`);
      put(`${stem}.lines.txt`, `${s.pages.map((items, k) => [`--- page ${k + 1} ---`, ...L.pageLines(items).map((l) => l.text)].join("\n")).join("\n")}\n`);
      if (transform && transformed.has(s.id)) put(`${stem}.transform.json`, `${JSON.stringify(transformed.get(s.id).pages, null, 1)}\n`);
    } else if (typeof s.csv === "string") {
      counts.csv++;
      put(`${stem}.csv.txt`, s.csv);
    } else if (isObj(s.workbook)) {
      counts.xlsx++;
      put(`${stem}.sheets.json`, `${JSON.stringify(s.workbook, null, 1)}\n`);
    }
  });
  if (c.failed.length) put("reader-failures.json", `${JSON.stringify(c.failed, null, 2)}\n`);
  return {
    status: "pass",
    summary: `${plural(raw.length, "statement")} dumped (${counts.pdf} PDF, ${counts.csv} CSV, ${counts.xlsx} XLSX) in ${plural(counts.files, "file")}`,
    counts,
  };
}

// ---------------------------------------------------------------- H14 reference

function stepH14(c) {
  const ref = c.run.opts.reference;
  if (!ref) return { status: "skip", summary: "needs --reference" };
  const hook = c.handle.test && typeof c.handle.test.reference === "function" ? c.handle.test.reference : null;
  if (!hook) return { status: "fail", summary: "test.js exports no reference hook", problems: ["--reference needs test.js exporting reference(result, file, ctx)"] };
  priv.assertSafeInput(ref, { allowed: [c.inputDir] });
  const r = need(c, c.modes[0]);
  const lines = hookLines(hook(r, ref, ctxOf(c, c.modes[0])), "reference");
  return { status: lines.length ? "fail" : "pass", summary: `${plural(lines.length, "difference")} from the reference`, counts: { differences: lines.length }, problems: lines };
}

// ---------------------------------------------------------------- the run

const STEP_FNS = { H1: stepH1, H2: stepH2, H3: stepH3, H4: stepH4, H5: stepH5, H6: stepH6, H6b: stepH6b, H7: stepH7, H8: stepH8, H9: stepH9, H10: stepH10, H11: stepH11, H12: stepH12, H13: stepH13, H14: stepH14 };

const capLines = (list) => (list.length > MAX_LINES ? [...list.slice(0, MAX_LINES), `… ${list.length - MAX_LINES} more`] : list);

async function runStep(c, id) {
  let r;
  try {
    r = await STEP_FNS[id](c);
  } catch (e) {
    r = e instanceof Blocked
      ? { status: "fail", summary: `blocked: ${e.message}`, problems: [] }
      : { status: "fail", summary: "the step throws (the report has the message)", problems: [describe(e)], fatal: PREREQUISITES.includes(id) };
  }
  const problems = r.problems || [];
  const notes = r.notes || [];
  return { id, status: r.status, summary: r.summary || "", counts: r.counts || {}, problemCount: problems.length, problems: capLines(problems), notes: capLines(notes), fatal: !!r.fatal };
}

function inputList(c) {
  return (c.paths || []).map((p) => {
    try {
      const b = fs.readFileSync(p);
      return { name: path.basename(p), size: b.length, sha256: sha256(b) };
    } catch {
      return { name: path.basename(p), size: null, sha256: null };
    }
  });
}

async function runProvider(t, run) {
  const c = { t, run, root: run.root, memo: {}, outDir: path.join(run.out, t.id), work: path.join(run.work, t.id) };
  const selected = (id) => !run.opts.only || run.opts.only.has(id);
  const results = new Map();
  let blockedBy = null;
  // H1-H3 run first whatever --only selects: every other step needs the handle, the inputs and
  // the statements. A fatal failure among them blocks the steps after it.
  for (const id of PREREQUISITES) {
    const r = await runStep(c, id);
    results.set(id, r);
    if (r.fatal) {
      blockedBy = id;
      break;
    }
  }
  const kind = c.handle ? `${c.app} app, ${c.legacy ? "legacy" : "new"} provider, ${c.strict ? "strict" : "not strict"}` : "not loaded";
  run.log(`harness ${t.id}: ${kind}; ${t.source}${c.paths ? `, ${plural(c.paths.length, "input")}` : ""}`);
  const steps = [];
  for (const id of STEPS) {
    if (!selected(id)) continue;
    let r = results.get(id);
    if (!r) r = blockedBy ? { id, status: "fail", summary: `blocked: ${blockedBy} did not complete`, counts: {}, problemCount: 0, problems: [], notes: [], fatal: false } : await runStep(c, id);
    steps.push(r);
    run.log(`  ${r.status.padEnd(6)} ${r.id.padEnd(4)} ${r.summary}`);
  }
  const ok = !steps.some((s) => s.status === "fail");
  const tally = (st) => steps.filter((s) => s.status === st).length;
  run.log(`${t.id}: ${tally("pass")} passed, ${tally("fail")} failed, ${tally("report")} reported, ${tally("skip") + tally("n/a")} skipped or not applicable${ok ? "" : " (FAILED)"}`);
  const report = {
    id: t.id, ok, app: c.app || null, legacy: c.handle ? c.legacy : null, strict: c.handle ? c.strict : null, source: t.source,
    folder: t.dir, inputs: inputList(c), expectErrors: c.expectErrors ? [...c.expectErrors] : [], allowProblems: c.allowProblems === undefined ? null : c.allowProblems,
    only: run.opts.only ? [...run.opts.only] : null, steps,
  };
  writeOut(path.join(c.outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, run.reads);
  return { id: t.id, ok, steps: steps.map(({ id, status, summary, counts, problemCount }) => ({ id, status, summary, counts, problemCount })) };
}

async function runHarness(options = {}) {
  const opts = {
    provider: null, allFixtures: false, statements: [], browser: false, dump: false, reference: null, allowUnknown: false,
    strict: null, out: null, only: null, nodeReaders: false, root: REPO, ...options,
  };
  const root = path.resolve(opts.root || REPO);
  const log = opts.log || ((m) => console.log(m));
  const runId = opts.run || newRunId();
  forgetModules(root);
  const targets = opts.allFixtures ? fixtureTargets(root) : [providerTarget(root, opts.provider, opts)];
  // The folders the run reads (statement folders, fixture specs): no output goes inside one.
  const reads = targets.map((t) => t.dir).filter(Boolean);
  let out, work;
  try {
    out = makeDir(opts.out ? path.resolve(opts.out) : priv.privateDir("harness", runId), reads);
  } catch (e) {
    throw new RunError("the output folder cannot be used", e);
  }
  try {
    work = makeDir(opts.work || priv.privateDir("tmp", `harness-${runId}`), reads);
  } catch (e) {
    throw new RunError("the folder for the run's temporary files cannot be used", e);
  }
  const tz = process.env.TZ;
  // E0: the page runs in UTC, and the Node rebuild's zip times use local getters.
  process.env.TZ = "UTC";
  let launching = null;
  const run = {
    opts, root, out, work, reads, log, browser: null,
    browserLaunch() {
      if (!launching) launching = lib("browser.js").launch().then((b) => (run.browser = b));
      return launching;
    },
    async browserOrNull() {
      try {
        return await run.browserLaunch();
      } catch {
        return null;
      }
    },
  };
  const report = { run: runId, ok: true, out, providers: [] };
  try {
    if (!targets.length) log("harness: no provider has testing.fixtures");
    for (const t of targets) {
      const p = await runProvider(t, run);
      report.providers.push(p);
      if (!p.ok) report.ok = false;
    }
  } finally {
    if (launching) await launching.then((b) => b.close(), () => {}).catch(() => {});
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
    if (!opts.work) fs.rmSync(work, { recursive: true, force: true });
  }
  const failed = report.providers.filter((p) => !p.ok).length;
  log(`harness: ${plural(report.providers.length, "provider")}, ${failed} failed${failed ? " (FAILED)" : ""}; details in ${opts.out ? "the --out folder" : `<private-dir>/harness/${runId}`}`);
  return report;
}

async function main(argv, io = { log: (m) => console.log(m), err: (m) => console.error(m) }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    io.err(`harness: ${e.message}`);
    io.err(USAGE);
    return 2;
  }
  const run = newRunId();
  // Browser profiles hold the pages' storage (configurator settings name accounts): keep every
  // temporary file of the run inside <private-dir>. runHarness creates the folder once it knows
  // the folders the run reads; privateDir checks <private-dir> itself now.
  const saved = {};
  // Every private write consults the user config's refuse list, so a config that does not load
  // leaves nowhere to put the message: one fixed line, which names the file.
  try {
    priv.userConfig();
  } catch {
    io.err("harness: FAILED: the user config (<config-dir>/statements.js) cannot be loaded");
    return 1;
  }
  let work;
  try {
    work = priv.privateDir("tmp", `harness-${run}`);
  } catch (e) {
    io.err(`harness: FAILED: the private directory cannot be used (${privateDirReason(e)})`);
    return 1;
  }
  for (const k of ["TMPDIR", "TMP", "TEMP"]) {
    saved[k] = process.env[k];
    process.env[k] = work;
  }
  try {
    const r = await runHarness({ ...opts, run, work, log: io.log });
    return r.ok ? 0 : 1;
  } catch (e) {
    if (e instanceof UsageError) {
      io.err(`harness: ${e.message}`);
      return 2;
    }
    io.err(failureLine(e, run));
    return 1;
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }, (e) => {
    console.error(failureLine(e, newRunId()));
    process.exitCode = 1;
  });
}

module.exports = {
  STEPS, parseArgs, runHarness, main, UsageError, RunError,
  // Pure checks, for test/unit/harness.test.js.
  checks: { csvProblems, qifProblems, fileProblems, downloadProblems, statementStateProblems, gapCases, closingMisses, orderCanon, monthsOf, failureLine, privateDirReason },
};
