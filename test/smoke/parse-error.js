// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Parse-error smoke (docs/TESTING.md, parse error; from migration step M9): a parse that throws
// keeps the previous result, in the pinned Chrome.
//
//   node test/smoke/parse-error.js [--root <dir>]
//
// The page: by discovery, the first skeleton (providers/_*, in folder order) with a statement
// app whose inputs include csv and that has testing.fixtures, built into a temporary directory
// with
//   node build/build.js --root <dir> --include-skeletons --only <id>
//     --inject test/smoke/inject/throw-on-marker.js --out <tmp>
// The injected piece (plan piece 12b, the tree's own file under test/) wraps the parser's
// parseStatements before the app composes P, so that it throws new Error("injected failure")
// when the id of a statement contains THROW. One page instance, in a fresh context (E0, frozen
// clock, empty storage):
//   1. the rendered fixtures in one picker batch: the page settles with #results shown and at
//      least one card, and clicking every download gives list A (at least one download);
//   2. a copy of the spec's first CSV fixture outside expectErrors, named THROW.csv, through the
//      picker: the page settles with #busy hidden; #status shows the warn line "Could not read
//      these statements: injected failure" exactly once and, without that line, is as before;
//      the cards, the range (#from and #to: options, value, disabled), the configurator and the
//      diagnostics are as before, and so are #results and #empty; clicking every download gives
//      exactly A again;
//   3. Clear: the empty state shows (#empty shown, #results hidden), and #status is empty, with
//      no warn line.
// Throughout: no console error, no page error and no CSP violation (the pdf.js worker fallback
// on file:// aside). A tree without such a skeleton fails: a smoke with nothing to check is not
// green. Without --root the tree is this repository, where discovery finds the CSV template
// (since migration step M12; docs/MIGRATION.md decision 167 and its amendments), so npm run smoke
// drives the statement app's catch in CI on a real skeleton; the unit tests run the same checks
// on the synthetic tree of test/unit/synthetic-tree.js with --root. No provider is named here;
// inputs are synthetic, so the console holds no private data. Exit status: 0 clean, 1 problems
// or nothing to check, 2 usage.
//
//   runParseError({root, log}) -> Promise<{target: id | null, tree, instances, downloads,
//     problems}>; tree: "given" (the page is the root's skeleton) or null (nothing found)
//   findTarget(root) -> the discovered skeleton's build entry {id, folder, dir, D, ...}, or null;
//     throws when the providers do not validate
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const REPO = path.resolve(__dirname, "..", "..");
const lib = (m) => require(path.join(REPO, "test", "lib", m));
const smoke = require("./pages.js");
const { discover } = require(path.join(REPO, "build", "discover.js"));
const build = require(path.join(REPO, "build", "build.js"));

const INJECT = ["test", "smoke", "inject", "throw-on-marker.js"];
const THROW_FILE = "THROW.csv";
const ERROR_LINE = "Could not read these statements: injected failure";
const describe = (e) => String(e && e.message ? e.message : e).split("\n")[0];

function findTarget(root) {
  return discover(path.resolve(root), { includeSkeletons: true })
    .find((e) => e.skeleton && e.D.app !== "custom" && e.D.inputs.includes("csv") && !!(e.D.testing && e.D.testing.fixtures)) || null;
}

// In the page: what the steps compare. statusRest is #status without the error line (read from
// a copy, so the page is not touched).
function readState(errorLine) {
  const inner = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.innerHTML : null;
  };
  const select = (id) => {
    const s = document.getElementById(id);
    return s ? { options: [...s.options].map((o) => [o.value, o.textContent]), value: s.value, disabled: s.disabled } : null;
  };
  const status = document.getElementById("status");
  let statusRest = null;
  if (status) {
    const copy = status.cloneNode(true);
    for (const p of copy.querySelectorAll(".warn")) if (p.textContent === errorLine) p.remove();
    statusRest = copy.innerHTML;
  }
  const empty = document.getElementById("empty"), results = document.getElementById("results"), busy = document.getElementById("busy");
  const count = document.getElementById("config-count");
  return {
    status: status ? status.innerHTML : null,
    statusRest,
    warns: status ? [...status.querySelectorAll(".warn")].map((p) => p.textContent) : [],
    cards: inner("#cards"),
    cardCount: document.querySelectorAll("#cards .card").length,
    diagnostics: inner("#diagnostics"),
    config: inner("#config-list"),
    configCount: count ? count.textContent : null,
    from: select("from"),
    to: select("to"),
    emptyShown: !!empty && !empty.hidden && empty.getClientRects().length > 0,
    resultsHidden: !!results && results.hidden,
    busyHidden: !busy || busy.hidden,
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The three steps on one page instance; problems and the number of downloads in list A.
async function checkPage(browser, file, { D, paths, spec, throwPath }) {
  const problems = [];
  let downloads = 0;
  const { newContext, ENVS } = lib("browser.js");
  const { compareRecords } = lib("replay.js");
  const context = await newContext(browser, ENVS.E0, {});
  try {
    let d;
    try {
      d = await lib("page-driver.js").open(context, pathToFileURL(file).href);
    } catch (e) {
      problems.push(`the page does not open: ${describe(e)}`);
      return { problems, downloads };
    }
    try {
      // 1. The fixtures, and list A.
      for (const r of await smoke.loadFixtures(d, D, paths, spec)) if (r.busy !== "idle") problems.push("fixtures: the page stays busy");
      const before = await d.page.evaluate(readState, ERROR_LINE);
      if (before.resultsHidden || !before.cardCount) problems.push("fixtures: #results is not shown with a card");
      const listA = await d.clickAll();
      downloads = listA.filter((r) => !r.disabled).length;
      if (!downloads) problems.push("fixtures: no download to compare");
      // 2. THROW.csv: the parse throws; the previous result stays.
      const loaded = await d.load([throwPath], { via: "picker" });
      const after = await d.page.evaluate(readState, ERROR_LINE);
      if (loaded.busy !== "idle" || !after.busyHidden) problems.push(`${THROW_FILE}: #busy is not hidden (the page stays busy)`);
      const lines = after.warns.filter((x) => x === ERROR_LINE).length;
      if (lines !== 1) problems.push(`${THROW_FILE}: #status shows the warn line "${ERROR_LINE}" ${lines} times, not once`);
      if (after.statusRest !== before.status) problems.push(`${THROW_FILE}: #status, without the error line, differs from before`);
      for (const [k, what] of [["cards", "the cards"], ["from", "the range (#from)"], ["to", "the range (#to)"], ["config", "the configurator"],
        ["configCount", "the configurator count"], ["diagnostics", "the diagnostics"], ["resultsHidden", "#results"], ["emptyShown", "#empty"]]) {
        if (!same(after[k], before[k])) problems.push(`${THROW_FILE}: ${what} changed`);
      }
      const listB = await d.clickAll();
      const m = compareRecords(listA, listB);
      if (m.length) problems.push(`${THROW_FILE}: the downloads differ from those before: record ${m[0].index} (${m[0].trigger}) ${m[0].field} (${m.length} mismatch${m.length > 1 ? "es" : ""})`);
      // 3. Clear.
      await d.clear();
      const cleared = await d.page.evaluate(readState, ERROR_LINE);
      if (!cleared.emptyShown) problems.push("Clear: #empty is not shown");
      if (!cleared.resultsHidden) problems.push("Clear: #results is not hidden");
      if (cleared.warns.length) problems.push(`Clear: #status still shows ${cleared.warns.length} warn line${cleared.warns.length > 1 ? "s" : ""}`);
      else if (cleared.status !== "") problems.push("Clear: #status is not empty");
    } catch (e) {
      problems.push(describe(e));
    }
    problems.push(...smoke.errorProblems(await d.errors()));
  } finally {
    await context.close().catch(() => {});
  }
  return { problems, downloads };
}

const NOTHING = "no skeleton has a statement app with csv inputs and testing.fixtures: nothing to check";

async function runParseError({ root = REPO, log = () => {} } = {}) {
  root = path.resolve(root);
  const report = { target: null, tree: null, instances: 0, downloads: 0, problems: [] };
  let target;
  try {
    target = findTarget(root);
  } catch (e) {
    report.problems.push(`the providers do not validate (see the contract checks): ${describe(e)}`);
    return report;
  }
  if (!target) {
    report.problems.push(`${NOTHING}, which fails: a smoke that checks nothing is not green`);
    log(`FAIL parse-error: ${NOTHING}`);
    return report;
  }
  report.target = target.id;
  report.tree = "given";
  const fail = (m) => report.problems.push(`${target.id}: ${m}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-parse-error-"));
  try {
    const out = path.join(tmp, "build");
    const errs = [];
    const code = build.run(["--root", root, "--include-skeletons", "--only", target.id, "--inject", path.join(root, ...INJECT), "--out", out], { log: () => {}, err: (m) => errs.push(m) });
    if (code !== 0) {
      fail(`the page does not build with the injected piece: ${errs[0] || `exit ${code}`}`);
      return report;
    }
    const fixtures = lib("fixtures.js");
    let spec, paths;
    try {
      spec = fixtures.loadSpec(path.join(target.dir, target.D.testing.fixtures));
      paths = fixtures.renderFixtures(spec, path.join(tmp, "fixtures"));
    } catch (e) {
      fail(`fixtures: cannot be rendered: ${describe(e)}`);
      return report;
    }
    const k = spec.files.findIndex((f) => /\.csv$/i.test(f.name) && !spec.expectErrors.includes(f.name));
    if (k < 0) {
      fail("fixtures: no CSV file outside expectErrors to copy as THROW.csv");
      return report;
    }
    const throwPath = path.join(tmp, "throw", THROW_FILE);
    fs.mkdirSync(path.dirname(throwPath), { recursive: true });
    fs.copyFileSync(paths[k], throwPath);
    let browser;
    try {
      browser = await lib("browser.js").launch();
    } catch (e) {
      report.problems.push(`Chrome cannot be launched: ${describe(e)}`);
      return report;
    }
    try {
      const r = await checkPage(browser, path.join(out, target.id, "index.html"), { D: target.D, paths, spec, throwPath });
      report.instances = 1;
      report.downloads = r.downloads;
      for (const m of r.problems) fail(m);
    } finally {
      await browser.close().catch(() => {});
    }
    log(`${report.problems.length ? "FAIL" : "ok  "} ${target.id} (temporary build, injected piece): ${report.instances} page instance, ${report.downloads} downloads kept through the parse error`
      + `${report.problems.length ? `, ${report.problems.length} problem${report.problems.length > 1 ? "s" : ""}` : ""}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return report;
}

// Without --root: this repository.
function parseArgs(argv) {
  const o = { root: REPO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--root") o.root = path.resolve(value());
    else throw new Error(`unknown argument ${JSON.stringify(a)}`);
  }
  return o;
}

async function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`parse-error: ${e.message}`);
    console.error("usage: node test/smoke/parse-error.js [--root <dir>]");
    return 2;
  }
  const r = await runParseError({ ...o, log: (m) => console.log(m) });
  for (const m of r.problems) console.log(`  ${m}`);
  console.log(`parse-error: ${r.target ? `1 page (${r.target})` : "no page"}, ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}${r.problems.length ? " (FAILED)" : ""}`);
  return r.problems.length ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { runParseError, findTarget, parseArgs, main, ERROR_LINE, THROW_FILE, NOTHING };
