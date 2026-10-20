// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Smoke test of every built page in the pinned Chrome (docs/TESTING.md, smoke).
//
//   node test/smoke/pages.js [--root <dir>] [--provider <id>[,<id>...]]
//
// Pages: dist/<id>/index.html of every published provider, which must equal a fresh build
// (else it is reported as stale, and not tested), plus every skeleton and unpublished provider
// built into a temporary directory. Each page is opened from file:// in a fresh context (E0,
// frozen clock, empty storage) per check:
//   - the empty state: #empty shown, #results hidden, no horizontal overflow at 390 px width;
//   - one bogus file per declared input (zz-not-a-statement.<ext>: "not a pdf", "not a zip",
//     "hello"), once through the picker and once, in a fresh page, by a synthetic drop on
//     document: the page settles and #status shows a .warn line;
//   - with testing.fixtures: the rendered fixtures (one picker batch, or one file at a time on
//     a single-file picker, skipping the spec's expectErrors there): #results shown with at
//     least one .card, every card button and every enabled toolbar button gives one non-empty
//     download (zips unpack with valid CRCs), and no overflow at 390 px;
//   - always: no console error, no page error and no CSP violation. The pdf.js worker
//     fallback on file:// (docs/MIGRATION.md) is the one page error that does not count.
// Without --provider, the landing page dist/index.html too: equal to a fresh render, no error
// or violation, no overflow at 390 px, and every link leads to a built page.
// No provider is named here: everything comes from the descriptor and its fixtures folder.
// Inputs are synthetic, so the console output holds no private data. Exit status: 0 clean,
// 1 problems, 2 usage.
//
//   runSmoke({root, providers, log}) -> Promise<{pages: [{id, problems, instances}], problems}>
//   pageTargets(root, {providers, tmp, filter, csp}) -> [{id, folder, skeleton, entry, file, source,
//     problems}]: the pages to open (shared with fixtures-golden.js and injection.js); csp is the
//     CSP mode the pages are built in and compared with (default: DEFAULT_CSP_MODE)
//   loadFixtures(driver, D, paths, spec) -> Promise<settle results>
//   errorProblems({console, errors, violations}) -> string[]
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const REPO = path.resolve(__dirname, "..", "..");
const lib = (m) => require(path.join(REPO, "test", "lib", m));
const { buildPage } = require(path.join(REPO, "build", "build.js"));
const { DEFAULT_CSP_MODE } = require(path.join(REPO, "build", "csp.js"));
const contract = require(path.join(REPO, "test", "contract", "run.js"));

const NARROW = { width: 390, height: 844 };
const BOGUS = { pdf: ["zz-not-a-statement.pdf", "not a pdf"], xlsx: ["zz-not-a-statement.xlsx", "not a zip"], csv: ["zz-not-a-statement.csv", "hello"] };
const describe = (e) => String(e && e.message ? e.message : e).split("\n")[0];

// The pages to open. Published providers: their dist page, if it is current. Skeletons and
// unpublished providers: a build written to <tmp>/<id>/index.html.
function pageTargets(root, { providers = null, tmp, filter = null, csp = DEFAULT_CSP_MODE } = {}) {
  root = path.resolve(root);
  const out = [];
  for (const p of contract.loadProviders(root)) {
    if (providers && !providers.includes(p.id) && !providers.includes(p.folder)) continue;
    const t = { id: p.id, folder: p.folder, skeleton: p.skeleton, entry: null, file: null, source: null, problems: [] };
    const fail = (m) => {
      t.problems.push(`providers/${p.folder}: ${m}`);
      out.push(t);
    };
    if (!p.raw || p.loadErrors.length) {
      fail("the descriptor cannot be loaded (see the contract checks)");
      continue;
    }
    let entry;
    try {
      entry = contract.entryFor(root, p);
    } catch (e) {
      fail(`the descriptor cannot be resolved: ${describe(e)} (see the contract checks)`);
      continue;
    }
    if (filter && !filter(entry)) continue;
    t.entry = entry;
    if (entry.pageErrors.length) {
      fail(`page.html: ${entry.pageErrors[0]} (see the contract checks)`);
      continue;
    }
    let html;
    try {
      html = buildPage(entry, { root, mode: csp }).html;
    } catch (e) {
      fail(`the page does not build: ${describe(e)}`);
      continue;
    }
    if (!p.skeleton && t.entry.D.publish) {
      t.source = "dist";
      t.file = path.join(root, "dist", t.entry.id, "index.html");
      let cur = null;
      try {
        cur = fs.readFileSync(t.file, "utf8");
      } catch {
        cur = null;
      }
      if (cur !== html) {
        t.problems.push(`dist/${t.entry.id}/index.html is ${cur === null ? "missing" : "stale"}: run node build/build.js (not tested)`);
        t.file = null;
      }
    } else {
      t.source = "temporary build";
      t.file = path.join(tmp, t.entry.id, "index.html");
      fs.mkdirSync(path.dirname(t.file), { recursive: true });
      fs.writeFileSync(t.file, html);
    }
    out.push(t);
  }
  return out;
}

function errorProblems(errs) {
  const capture = lib("capture.js");
  const out = [];
  for (const c of errs.console) out.push(`console error: ${c.slice(0, 200)}`);
  for (const e of errs.errors) if (!capture.isPdfWorkerFallback(e)) out.push(`page error: ${e.slice(0, 200)}`);
  for (const v of errs.violations) out.push(`CSP violation: ${v.directive} (${v.blockedURI})`);
  return out;
}

const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function overflow(page) {
  await page.setViewportSize(NARROW);
  await frames(page);
  const o = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  return o.scroll > o.client ? `horizontal overflow at ${NARROW.width} px: the page is ${o.scroll} px wide` : null;
}

// Loads the rendered fixtures the way a user would: one picker batch, or one file at a time on
// a single-file picker (the spec's expectErrors are left out there, as each load replaces the
// last).
async function loadFixtures(d, D, paths, spec) {
  if (D.multiple) return [await d.load(paths, { via: "picker" })];
  const out = [];
  for (const p of paths) if (!spec.expectErrors.includes(path.basename(p))) out.push(await d.load([p], { via: "picker" }));
  return out;
}

// One page instance: a fresh context, the page, fn(driver), then its error log.
async function instance(browser, file, fn) {
  const { newContext, ENVS } = lib("browser.js");
  const context = await newContext(browser, ENVS.E0, {});
  const problems = [];
  try {
    let d;
    try {
      d = await lib("page-driver.js").open(context, pathToFileURL(file).href);
    } catch (e) {
      problems.push(`the page does not open: ${describe(e)}`);
      return problems;
    }
    try {
      await fn(d, problems);
    } catch (e) {
      problems.push(describe(e));
    }
    problems.push(...errorProblems(await d.errors()));
  } finally {
    await context.close().catch(() => {});
  }
  return problems;
}

async function smokePage(browser, t, { tmp, bogus }) {
  const D = t.entry.D;
  const problems = [];
  let instances = 0, downloads = 0;
  const run = async (label, fn) => {
    instances++;
    for (const m of await instance(browser, t.file, fn)) problems.push(`${label}: ${m}`);
  };
  await run("empty state", async (d, out) => {
    const s = await d.page.evaluate(() => {
      const empty = document.getElementById("empty"), results = document.getElementById("results");
      return { empty: !!empty && !empty.hidden && empty.getClientRects().length > 0, results: !!results && results.hidden };
    });
    if (!s.empty) out.push("#empty is not shown");
    if (!s.results) out.push("#results is not hidden");
    const o = await overflow(d.page);
    if (o) out.push(o);
  });
  for (const input of D.inputs) {
    for (const via of ["picker", "drop"]) {
      await run(`bogus ${input} file by ${via}`, async (d, out) => {
        const r = await d.load([bogus[input]], { via });
        if (r.busy !== "idle") out.push("the page stays busy");
        const warn = await d.page.evaluate(() => document.querySelectorAll("#status .warn").length);
        if (!warn) out.push("no #status .warn line");
      });
    }
  }
  const fx = D.testing && D.testing.fixtures;
  if (fx) {
    const fixtures = lib("fixtures.js");
    let spec, paths;
    try {
      spec = fixtures.loadSpec(path.join(t.entry.dir, fx));
      paths = fixtures.renderFixtures(spec, path.join(tmp, "fixtures", t.id));
    } catch (e) {
      problems.push(`fixtures: cannot be rendered: ${describe(e)}`);
    }
    if (paths) {
      await run("fixtures", async (d, out) => {
        for (const r of await loadFixtures(d, D, paths, spec)) if (r.busy !== "idle") out.push("the page stays busy");
        const s = await d.page.evaluate(() => {
          const results = document.getElementById("results");
          const enabled = ["accounts", "combined", "zip"].map((id) => document.getElementById(id)).filter((b) => b && !b.disabled).length;
          return { shown: !!results && !results.hidden, cards: document.querySelectorAll("#cards .card").length, buttons: document.querySelectorAll("#cards button.dl").length, enabled };
        });
        if (!s.shown) out.push("#results is not shown");
        if (!s.cards) out.push("no card in #cards");
        const records = await d.clickAll();
        const live = records.filter((r) => !r.disabled);
        downloads += live.length;
        if (live.length !== s.buttons + s.enabled) out.push(`${s.buttons} card buttons and ${s.enabled} enabled toolbar buttons gave ${live.length} downloads`);
        for (const r of live) {
          if (!(r.size > 0)) out.push(`${r.trigger}${r.kind ? ` ${r.kind}` : ""}: an empty download`);
          if (r.zipError) out.push(`${r.trigger}: the zip does not unpack (${r.zipError})`);
          if (r.entries && !r.entries.length) out.push(`${r.trigger}: an empty zip`);
        }
        const o = await overflow(d.page);
        if (o) out.push(`with results: ${o}`);
      });
    }
  }
  return { problems, instances, downloads };
}

// The landing page dist/index.html: equal to a fresh render, no error or CSP violation, no
// overflow at 390 px, and every link leads to a built page. Without it (a tree whose dist/ has
// not been built) there is nothing to check.
async function smokeLanding(browser, root) {
  const file = path.join(root, "dist", "index.html");
  if (!fs.existsSync(file)) return { problems: ["dist/index.html is missing: run node build/build.js"], links: 0 };
  const published = [];
  for (const p of contract.loadProviders(root)) {
    if (p.skeleton) continue;
    try {
      const e = contract.entryFor(root, p);
      if (e.D.publish) published.push({ id: e.id, D: e.D });
    } catch (e) {
      return { problems: [`dist/index.html not checked: providers/${p.folder} does not resolve (see the contract checks)`], links: 0 };
    }
  }
  const { renderLanding } = require(path.join(REPO, "build", "landing.js"));
  if (fs.readFileSync(file, "utf8") !== renderLanding(published, { root, mode: DEFAULT_CSP_MODE })) {
    return { problems: ["dist/index.html is stale: run node build/build.js (not tested)"], links: 0 };
  }
  let links = 0;
  const problems = await instance(browser, file, async (d, out) => {
    const hrefs = await d.page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
    links = hrefs.length;
    for (const h of hrefs) {
      const m = /^([a-z][a-z0-9-]*)\/$/.exec(h);
      if (!m || !fs.existsSync(path.join(root, "dist", m[1], "index.html"))) out.push(`the link ${JSON.stringify(h)} leads to no built page`);
    }
    const o = await overflow(d.page);
    if (o) out.push(o);
  });
  return { problems: problems.map((m) => `landing page: ${m}`), links };
}

function writeBogus(dir) {
  const out = {};
  for (const [input, [name, text]] of Object.entries(BOGUS)) {
    const p = path.join(dir, "bogus", name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, text);
    out[input] = p;
  }
  return out;
}

async function runSmoke({ root = REPO, providers = null, log = () => {} } = {}) {
  root = path.resolve(root);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-smoke-"));
  const report = { pages: [], problems: [] };
  try {
    const targets = pageTargets(root, { providers, tmp });
    const bogus = writeBogus(tmp);
    let browser = null;
    try {
      browser = await lib("browser.js").launch();
    } catch (e) {
      report.problems.push(`Chrome cannot be launched: ${describe(e)}`);
      return report;
    }
    try {
      for (const t of targets) {
        const page = { id: t.id, source: t.source, problems: t.problems.slice(), instances: 0, downloads: 0 };
        if (t.file) {
          const r = await smokePage(browser, t, { tmp, bogus });
          page.problems.push(...r.problems.map((m) => `${t.id}: ${m}`));
          page.instances = r.instances;
          page.downloads = r.downloads;
        }
        report.pages.push(page);
        report.problems.push(...page.problems);
        log(`${page.problems.length ? "FAIL" : "ok  "} ${t.id}${t.source ? ` (${t.source})` : ""}: ${page.instances} page instances, ${page.downloads} fixture downloads${page.problems.length ? `, ${page.problems.length} problem${page.problems.length > 1 ? "s" : ""}` : ""}`);
      }
      if (!providers) {
        const l = await smokeLanding(browser, root);
        report.landing = l;
        report.problems.push(...l.problems);
        log(`${l.problems.length ? "FAIL" : "ok  "} landing page: ${l.links} links${l.problems.length ? `, ${l.problems.length} problem${l.problems.length > 1 ? "s" : ""}` : ""}`);
      }
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return report;
}

function parseArgs(argv) {
  const o = { root: REPO, providers: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--root") o.root = path.resolve(value());
    else if (a === "--provider") o.providers = [...(o.providers || []), ...value().split(",").map((s) => s.trim()).filter(Boolean)];
    else throw new Error(`unknown argument ${JSON.stringify(a)}`);
  }
  return o;
}

async function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`smoke: ${e.message}`);
    console.error("usage: node test/smoke/pages.js [--root <dir>] [--provider <id>[,<id>...]]");
    return 2;
  }
  const r = await runSmoke({ ...o, log: (m) => console.log(m) });
  for (const m of r.problems) console.log(`  ${m}`);
  console.log(`smoke: ${r.pages.length} page${r.pages.length === 1 ? "" : "s"}, ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}${r.problems.length ? " (FAILED)" : ""}`);
  return r.problems.length ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { runSmoke, pageTargets, loadFixtures, errorProblems, instance, smokeLanding, BOGUS };
