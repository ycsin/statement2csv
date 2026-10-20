// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The contract checks (docs/TESTING.md, contract checks): C01-C18 for every discovered provider,
// skeletons included.
//
//   node test/contract/run.js [--tier node|browser|all] [--provider <id>[,<id>...]]
//                             [--old-root <dir>] [--root <dir>] [--csp legacy|hash]
//
//   --tier node     C01-C12 and C14-C18 (the default; no Chrome, no old repositories)
//   --tier browser  C13: fixtures rendered, read by the production readers in Chrome, parsed in
//                   both branches. It fails, never skips, when Chrome cannot be launched.
//   --provider      only these providers' checks (by id or folder); C04 still compares them with
//                   every provider, C17 and C18 look at their folders only, C15 runs in full
//   --old-root      C15 also re-derives every pinned file from the old repositories
//                   (tools/provenance.js rederive); without it C15 checks the hashes only (CI)
//   --root          check another tree (a scratch copy, a stub tree); default: this repository
//   --csp           the CSP mode C14 builds with (default: build/csp.js DEFAULT_CSP_MODE)
//
// Per provider:
//   C01-C09  core/contract/descriptor.js validate(), given the parserScript's exports (C08, C09),
//            the export call graph of <root>/core/export.js (C08b), the other providers (C04)
//            and whether dist/<id>/index.html is tracked by git (C05b)
//   C10a     test/lib/load-provider.js loadNode: the Node branch requires exactly the
//            parserScript and finds parseStatements, or the custom app's test.js hooks
//   C10b     loadPage: the plan pieces 3-12 in a page-like vm sandbox; self[parserGlobal]
//            appears right after the parserScript piece, with the Node branch's export names
//   C11      garbage per declared input, in both branches, inputs deep-frozen: no throw, and an
//            errors entry naming the input (custom apps: test.parse returns {error}); providers
//            without frozen.legacyRepo also get the garbage configs
//   C12      checkResult on the garbage results (strict without legacyRepo); custom apps:
//            test.checkResult, if any, finds nothing and the downloads hook gives [] for {error}
//   C14      the page builds and verifies (build/build.js buildPage, build/csp.js verify) within
//            the size budget: 2 MiB with pdf.js, 256 KiB without
//   C16      page.html: slots and the slot lint (build/page.js)
// For the tree: C15 provenance, C17 SPDX headers (test/lint/headers.js), C18 no private file
// types or stray .json among the tracked files, and the marker in every fixtures/*.js.
// C10-C14 run only for a descriptor that passes C01-C09, so one mistake is reported once.
//
// Messages read "<path>: [Cnn] <message>". The garbage and fixtures are synthetic, so no
// message can carry private data. Exit status: 0 clean, 1 problems, 2 usage.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const lib = (m) => require(path.join(REPO, "test", "lib", m));
const { listProviders, loadDataModule } = require(path.join(REPO, "build", "discover.js"));
const { normalize, validate, resolveRuntime } = require(path.join(REPO, "core", "contract", "descriptor.js"));
const { checkResult } = require(path.join(REPO, "core", "contract", "result.js"));
const { readPageHtml, hasConfigurator, toolbarOf } = require(path.join(REPO, "build", "page.js"));
const { buildPage } = require(path.join(REPO, "build", "build.js"));
const { DEFAULT_CSP_MODE } = require(path.join(REPO, "build", "csp.js"));
const lintFiles = require(path.join(REPO, "test", "lint", "files.js"));
const headersLint = require(path.join(REPO, "test", "lint", "headers.js"));

const TIERS = ["node", "browser", "all"];
const MARKER = "SYNTHETIC TEST DATA";
const BUDGET = { pdf: 2 * 1024 * 1024, other: 256 * 1024 };
const PRIVATE_TYPES = [".pdf", ".xlsx", ".xls", ".qif", ".zip", ".png", ".jpg", ".csv"];
const PACKAGE_FILES = new Set(["package.json", "test/package.json", "test/package-lock.json"]);

// C11: the garbage statement objects per declared input (docs/CONTRACT.md, input statement objects).
const GARBAGE = {
  pdf: [{ id: "garbage.pdf", pages: [[{ str: "hello", x: 10, y: 10, w: 20, h: 10 }]] }, { id: "garbage.pdf", pages: [[]] }],
  csv: [{ id: "garbage.csv", csv: "hello\n" }, { id: "garbage.csv", csv: "" }],
  xlsx: [{ id: "garbage.xlsx", workbook: {} }, { id: "garbage.xlsx", workbook: { Sheet1: [["hello"]] } }],
};
// C11/C13: configs a hand edit of storage can produce; "x" stands for a portfolio id.
const garbageConfigs = (id) => [5, [], "x", { [id]: 5 }, { [id]: { name: 5, kind: 5, mergeInto: 5, exclude: "yes" } }];

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const describe = (e) => String(e && e.message ? e.message : e).split("\n")[0];
const clone = (v) => JSON.parse(JSON.stringify(v));

function deepFreeze(v) {
  if (v === null || typeof v !== "object" || Object.isFrozen(v)) return v;
  Object.freeze(v);
  for (const k of Object.keys(v)) deepFreeze(v[k]);
  return v;
}

function requireFresh(file) {
  const resolved = require.resolve(file);
  delete require.cache[resolved];
  return require(resolved);
}

// Forget the modules a previous run loaded from root's providers/ and core/ (the checker's own
// core/contract modules stay), so a changed tree is never checked against stale copies.
function forgetModules(root) {
  const prefixes = [path.join(root, "providers") + path.sep, path.join(root, "core") + path.sep];
  const keep = path.join(REPO, "core", "contract") + path.sep;
  for (const k of Object.keys(require.cache)) {
    if (prefixes.some((p) => k.startsWith(p)) && !k.startsWith(keep)) delete require.cache[k];
  }
}

// ---------------------------------------------------------------- discovery

// Every folder of <root>/providers with provider.js, skeletons included, with its data.
function loadProviders(root) {
  return listProviders(root, { includeSkeletons: true }).map((p) => {
    const out = { ...p, raw: null, frozen: null, loadErrors: [] };
    try {
      out.raw = loadDataModule(path.join(p.dir, "provider.js"));
    } catch (e) {
      out.loadErrors.push(`provider.js: [C01] cannot be loaded: ${describe(e)}`);
    }
    if (fs.existsSync(path.join(p.dir, "frozen.js"))) {
      try {
        out.frozen = loadDataModule(path.join(p.dir, "frozen.js"));
      } catch (e) {
        out.loadErrors.push(`frozen.js: [C05] cannot be loaded: ${describe(e)}`);
      }
    }
    return out;
  });
}

// The build's entry for a provider: normalized descriptor, runtime object and page slots.
function entryFor(root, p) {
  const D = normalize(p.raw, p.frozen);
  const R = resolveRuntime(D);
  const page = readPageHtml(path.join(p.dir, "page.html"), {
    partialsDir: path.join(root, "core", "page", "partials"),
    configurator: hasConfigurator(D),
    toolbar: toolbarOf(D),
  });
  return { id: D.id, folder: p.folder, dir: p.dir, skeleton: p.skeleton, raw: p.raw, D, R, frozen: p.frozen, slots: page.slots, pageErrors: page.errors };
}

const isLegacy = (p) => isObj(p.frozen) && typeof p.frozen.legacyRepo === "string" && p.frozen.legacyRepo !== "";

// ---------------------------------------------------------------- per provider, node tier

function garbageFor(handle, input, k, transform) {
  const s = clone(GARBAGE[input][k]);
  if (input === "pdf" && transform) s.pages = s.pages.map((items) => handle.P[transform](items));
  return deepFreeze(s);
}

function c11c12(p, N, handles, add) {
  const legacy = isLegacy(p);
  const transform = isObj(N.pdf) ? N.pdf.pageTransform : null;
  for (const [branch, h] of handles) {
    for (const input of N.inputs) {
      for (let k = 0; k < GARBAGE[input].length; k++) {
        const what = `${branch} branch, garbage ${input} input ${k + 1}`;
        let s;
        try {
          s = garbageFor(h, input, k, transform);
        } catch (e) {
          add("C11", `${what}: the page transform ${transform} throws: ${describe(e)}`);
          continue;
        }
        if (N.app === "custom") {
          for (const mode of h.modes) {
            let r;
            try {
              r = h.parse([s], { config: deepFreeze({}), mode });
            } catch (e) {
              add("C11", `${what}, mode ${mode}: test.parse throws: ${describe(e)}`, "test.js");
              continue;
            }
            if (!(isObj(r) && typeof r.error === "string" && r.error)) add("C11", `${what}, mode ${mode}: test.parse must return {error} for input it cannot read`, "test.js");
            const ctx = { P: h.P, R: h.R, mode, config: {}, from: null, to: null };
            if (h.test && typeof h.test.checkResult === "function") {
              let probs;
              try {
                probs = h.test.checkResult(r, ctx);
              } catch (e) {
                probs = [`throws: ${describe(e)}`];
              }
              for (const m of Array.isArray(probs) ? probs : ["does not return an array"]) add("C12", `${what}, mode ${mode}: test.checkResult: ${m}`, "test.js");
            }
            let dl;
            try {
              dl = h.test.downloads(r, ctx);
            } catch (e) {
              add("C12", `${what}, mode ${mode}: the downloads hook throws on an {error} result: ${describe(e)}`, "test.js");
              continue;
            }
            if (!Array.isArray(dl) || dl.length) add("C12", `${what}, mode ${mode}: the downloads hook must return [] for an {error} result (the page shows no results)`, "test.js");
          }
          continue;
        }
        let r;
        try {
          r = h.parse([s], { config: deepFreeze({}) });
        } catch (e) {
          add("C11", `${what}: parseStatements throws: ${describe(e)}`, N.parserScript);
          continue;
        }
        if (!isObj(r) || !Array.isArray(r.errors) || !r.errors.some((x) => isObj(x) && x.id === s.id)) {
          add("C11", `${what}: the result has no errors entry with id ${JSON.stringify(s.id)}`, N.parserScript);
        }
        const cr = checkResult(r, h.R, { strict: !legacy, P: h.P });
        for (const m of cr.errors) add("C12", `${what}: ${m}`, N.parserScript);
        if (legacy) continue;
        for (const cfg of garbageConfigs("x")) {
          try {
            h.parse([s], { config: deepFreeze(clone(cfg)) });
          } catch (e) {
            add("C11", `${what}, config ${JSON.stringify(cfg)}: parseStatements throws: ${describe(e)}`, N.parserScript);
          }
        }
      }
    }
  }
}

function nodeChecks(p, ctx) {
  const problems = [];
  const where = `providers/${p.folder}`;
  const add = (check, msg, file = null) => problems.push(`${where}${file ? `/${file}` : ""}: [${check}] ${msg}`);
  problems.push(...p.loadErrors.map((m) => `${where}/${m}`));
  if (!p.raw) return problems;
  let N;
  try {
    N = normalize(p.raw, p.frozen);
  } catch (e) {
    add("C01", `the descriptor cannot be normalized: ${describe(e)}`, "provider.js");
    return problems;
  }
  // The parserScript's exports, for C08 and C09.
  let parser = null;
  const parserFile = typeof N.parserScript === "string" ? path.resolve(p.dir, N.parserScript) : null;
  const inFolder = parserFile && path.relative(p.dir, parserFile).split(path.sep)[0] !== "..";
  if (inFolder && fs.existsSync(parserFile) && fs.statSync(parserFile).isFile()) {
    try {
      parser = requireFresh(parserFile);
    } catch (e) {
      add("C10a", `the parserScript cannot be required in Node: ${describe(e)}`, N.parserScript);
    }
  }
  const tracked = ctx.tracked ? ctx.tracked.has(`dist/${N.id}/index.html`) : false;
  const errs = validate(p.raw, { frozen: p.frozen, all: ctx.raws, dir: p.dir, skeleton: p.skeleton, tracked, parser, root: ctx.root });
  problems.push(...errs.map((m) => `${where}/${m}`));
  // C16 (page.html), whenever the file exists (C07 reports a missing one).
  let entry = null;
  if (fs.existsSync(path.join(p.dir, "page.html"))) {
    try {
      entry = entryFor(ctx.root, p);
      for (const m of entry.pageErrors) add("C16", m, "page.html");
    } catch (e) {
      add("C16", `page.html cannot be read with this descriptor: ${describe(e)}`, "page.html");
    }
  }
  if (errs.length || !parser) return problems;
  // C10a / C10b
  let nodeH = null, pageH = null;
  try {
    nodeH = lib("load-provider.js").loadNode(N.id, { root: ctx.root });
  } catch (e) {
    add("C10a", describe(e), N.parserScript);
  }
  try {
    pageH = lib("load-provider.js").loadPage(N.id, { root: ctx.root });
  } catch (e) {
    add("C10b", describe(e), N.parserScript);
  }
  if (nodeH && pageH) {
    const a = Object.keys(nodeH.parser).sort(), b = Object.keys(pageH.parser).sort();
    if (a.join(",") !== b.join(",")) add("C10b", `self.${N.parserGlobal} exports ${b.join(", ") || "nothing"} in the page, ${a.join(", ") || "nothing"} in Node`, N.parserScript);
  }
  // C11 / C12
  const handles = [["Node", nodeH], ["page", pageH]].filter(([, h]) => h);
  if (handles.length) c11c12(p, N, handles, add);
  // C14
  if (entry && !entry.pageErrors.length) {
    let built = null;
    try {
      built = buildPage(entry, { root: ctx.root, mode: ctx.csp });
    } catch (e) {
      add("C14", `the page does not build: ${String(e && e.message ? e.message : e).replace(/\n\s*/g, "; ")}`);
    }
    if (built) {
      const bytes = Buffer.byteLength(built.html, "utf8");
      const pdf = N.inputs.includes("pdf");
      const limit = pdf ? BUDGET.pdf : BUDGET.other;
      if (bytes > limit) add("C14", `the page has ${bytes} bytes, over its budget of ${limit} (${pdf ? "2 MiB with pdf.js" : "256 KiB without pdf.js"})`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- the tree, node tier

function treeChecks(root, { oldRoot, folders }) {
  const problems = [];
  // C15
  const prov = require(path.join(REPO, "tools", "provenance.js"));
  const c = prov.check({ root });
  problems.push(...c.problems.map((m) => `${prov.PIN_LIST}: [C15] ${m}`));
  let summary = `${c.pins} pins checked`;
  if (oldRoot) {
    const r = prov.rederive({ root, oldRoot });
    problems.push(...r.problems.map((m) => `${prov.PIN_LIST}: [C15] ${m}`));
    summary += `, ${r.results.filter((x) => x.status === "reproduced").length} re-derived byte for byte from ${r.repos} old repositories`;
  }
  // C17, C18
  let { files } = lintFiles.listFiles(root);
  if (folders) files = files.filter((f) => folders.some((d) => f.startsWith(`providers/${d}/`)));
  for (const f of headersLint.check(root, { files })) problems.push(`${f.file}: [C17] ${f.message}`);
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (PRIVATE_TYPES.includes(ext)) problems.push(`${f}: [C18] a ${ext} file is never tracked: statements and what is made from them stay private`);
    if (ext === ".json" && !PACKAGE_FILES.has(f)) problems.push(`${f}: [C18] no .json file besides the three package files: repository data lives in .js modules`);
    if (ext === ".js" && f.split("/").slice(0, -1).includes("fixtures")) {
      const t = lintFiles.readText(root, f);
      if (!t.ok || !t.text.includes(MARKER)) problems.push(`${f}: [C18] a fixtures file must contain "${MARKER}"`);
    }
  }
  return { problems, summary: { C15: summary, C17: `${files.length} files`, C18: `${files.length} files` } };
}

// ---------------------------------------------------------------- browser tier (C13)

async function c13(p, ctx, browser) {
  const problems = [];
  const where = `providers/${p.folder}`;
  const add = (msg, file = null) => problems.push(`${where}${file ? `/${file}` : ""}: [C13] ${msg}`);
  const N = normalize(p.raw, p.frozen);
  const fx = isObj(N.testing) ? N.testing.fixtures : null;
  if (!fx) return { problems, ran: false };
  const fixtures = lib("fixtures.js");
  let spec;
  try {
    spec = fixtures.loadSpec(path.join(p.dir, fx));
  } catch (e) {
    add(`the fixture spec cannot be loaded: ${describe(e)}`, `${fx}/statements.js`);
    return { problems, ran: true };
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-contract-"));
  try {
    const paths = fixtures.renderFixtures(spec, tmp);
    const LP = lib("load-provider.js");
    const handles = [["Node", LP.loadNode(N.id, { root: ctx.root })], ["page", LP.loadPage(N.id, { root: ctx.root })]];
    const ex = await lib("extract.js").extract(paths, { handle: handles[0][1], browser, allowed: [tmp] });
    for (const f of ex.failed) if (!spec.expectErrors.includes(f.id)) add(`fixture ${f.id}: the reader fails: ${f.error}`);
    const statements = ex.statements.map((s) => deepFreeze(s));
    const failedIds = new Set(ex.failed.map((f) => f.id));
    const expected = spec.expectErrors.filter((n) => !failedIds.has(n));
    const canon = lib("canon.js");
    const results = [];
    for (const [branch, h] of handles) {
      const out = [];
      if (N.app === "custom") {
        for (const mode of h.modes) {
          let r;
          try {
            r = h.parse(statements, { config: deepFreeze({}), mode });
          } catch (e) {
            add(`${branch} branch, mode ${mode}: test.parse throws: ${describe(e)}`, "test.js");
            continue;
          }
          if (isObj(r) && "error" in r) add(`${branch} branch, mode ${mode}: the fixtures give {error: ${JSON.stringify(r.error)}}`, "test.js");
          else if (h.test && typeof h.test.checkResult === "function") {
            const probs = h.test.checkResult(r, { P: h.P, R: h.R, mode, config: {}, from: null, to: null });
            for (const m of probs) add(`${branch} branch, mode ${mode}: test.checkResult: ${m}`, "test.js");
          }
          out.push(r);
        }
      } else {
        let r;
        try {
          r = h.parse(statements, { config: deepFreeze({}) });
        } catch (e) {
          add(`${branch} branch: parseStatements throws on the fixtures: ${describe(e)}`, N.parserScript);
          continue;
        }
        const ids = new Set((isObj(r) && Array.isArray(r.errors) ? r.errors : []).map((x) => x && x.id));
        for (const id of ids) if (!expected.includes(id)) add(`${branch} branch: an errors entry for ${JSON.stringify(id)}, which the spec's expectErrors does not list`, N.parserScript);
        for (const id of expected) if (!ids.has(id)) add(`${branch} branch: no errors entry for ${JSON.stringify(id)}, which the spec's expectErrors lists`, N.parserScript);
        const cr = checkResult(r, h.R, { strict: true, P: h.P });
        for (const m of cr.errors) add(`${branch} branch: ${m}`, N.parserScript);
        if (!isLegacy(p)) {
          const p0 = isObj(r) && Array.isArray(r.portfolios) && isObj(r.portfolios[0]) && typeof r.portfolios[0].id === "string" ? r.portfolios[0].id : "x";
          for (const cfg of garbageConfigs(p0)) {
            try {
              h.parse(statements, { config: deepFreeze(clone(cfg)) });
            } catch (e) {
              add(`${branch} branch, a garbage config on the first portfolio: parseStatements throws: ${describe(e)}`, N.parserScript);
            }
          }
        }
        out.push(r);
      }
      results.push(out);
    }
    if (results.length === 2 && canon(results[0]) !== canon(results[1])) add("the Node and the page branch give different results for the fixtures");
  } catch (e) {
    add(describe(e));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { problems, ran: true };
}

// ---------------------------------------------------------------- the run

async function runContract({ root = REPO, tier = "node", providers = null, oldRoot = null, csp = DEFAULT_CSP_MODE, log = () => {} } = {}) {
  if (!TIERS.includes(tier)) throw new Error(`--tier must be one of ${TIERS.join(", ")}`);
  root = path.resolve(root);
  forgetModules(root);
  const all = loadProviders(root);
  let selected = all;
  if (providers) {
    const unknown = providers.filter((x) => !all.some((p) => p.id === x || p.folder === x));
    if (unknown.length) throw new Error(`--provider: no provider ${unknown.join(", ")} under providers/`);
    selected = all.filter((p) => providers.includes(p.id) || providers.includes(p.folder));
  }
  const ctx = { root, raws: all.map((p) => p.raw).filter(Boolean), tracked: lintFiles.trackedFiles(root), csp };
  const report = { root, tier, providers: [], tree: null, browser: null, problems: [] };
  if (tier !== "browser") {
    for (const p of selected) {
      const problems = nodeChecks(p, ctx);
      report.providers.push({ id: p.id, folder: p.folder, skeleton: p.skeleton, problems });
      report.problems.push(...problems);
      log(`${problems.length ? "FAIL" : "ok  "} ${p.folder}: C01-C12, C14, C16${problems.length ? `: ${problems.length} problem${problems.length > 1 ? "s" : ""}` : ""}`);
    }
    const t = treeChecks(root, { oldRoot, folders: providers ? selected.map((p) => p.folder) : null });
    report.tree = t;
    report.problems.push(...t.problems);
    for (const [k, v] of Object.entries(t.summary)) {
      const n = t.problems.filter((m) => m.includes(`[${k}]`)).length;
      log(`${n ? "FAIL" : "ok  "} ${k}: ${v}${n ? `: ${n} problem${n > 1 ? "s" : ""}` : ""}`);
    }
  }
  if (tier !== "node") {
    const b = { ran: [], problems: [] };
    let browser = null;
    try {
      browser = await lib("browser.js").launch();
    } catch (e) {
      b.problems.push(`test/lib/browser.js: [C13] Chrome cannot be launched (the browser tier fails, never skips): ${describe(e)}`);
    }
    if (browser) {
      try {
        for (const p of selected) {
          if (!p.raw || p.loadErrors.length) continue;
          let r;
          try {
            r = await c13(p, ctx, browser);
          } catch (e) {
            r = { problems: [`providers/${p.folder}: [C13] ${describe(e)}`], ran: true };
          }
          if (r.ran) b.ran.push(p.folder);
          b.problems.push(...r.problems);
          log(`${r.problems.length ? "FAIL" : "ok  "} ${p.folder}: C13${r.ran ? "" : " (no fixtures)"}${r.problems.length ? `: ${r.problems.length} problem${r.problems.length > 1 ? "s" : ""}` : ""}`);
        }
      } finally {
        await browser.close().catch(() => {});
      }
    }
    report.browser = b;
    report.problems.push(...b.problems);
  }
  return report;
}

function parseArgs(argv) {
  const o = { root: REPO, tier: "node", providers: null, oldRoot: null, csp: DEFAULT_CSP_MODE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--tier") o.tier = value();
    else if (a === "--provider") o.providers = [...(o.providers || []), ...value().split(",").map((s) => s.trim()).filter(Boolean)];
    else if (a === "--old-root") o.oldRoot = path.resolve(value());
    else if (a === "--root") o.root = path.resolve(value());
    else if (a === "--csp") o.csp = value();
    else throw new Error(`unknown argument ${JSON.stringify(a)}`);
  }
  if (!TIERS.includes(o.tier)) throw new Error(`--tier must be one of ${TIERS.join(", ")}`);
  if (o.csp !== "legacy" && o.csp !== "hash") throw new Error("--csp must be legacy or hash");
  return o;
}

async function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`contract: ${e.message}`);
    console.error("usage: node test/contract/run.js [--tier node|browser|all] [--provider <id>[,<id>...]] [--old-root <dir>] [--root <dir>] [--csp legacy|hash]");
    return 2;
  }
  if (o.oldRoot) process.env.S2C_OLD_ROOT = o.oldRoot; // the same old repositories for every guard
  let r;
  try {
    r = await runContract({ ...o, log: (m) => console.log(m) });
  } catch (e) {
    console.error(`contract: ${e.message}`);
    return 2;
  }
  const n = r.providers.length || (r.browser ? r.browser.ran.length : 0);
  for (const m of r.problems) console.log(`  ${m}`);
  console.log(`contract (${o.tier} tier): ${n} provider${n === 1 ? "" : "s"}, ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}${r.problems.length ? " (FAILED)" : ""}`);
  return r.problems.length ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { runContract, loadProviders, entryFor, nodeChecks, treeChecks, parseArgs, GARBAGE, garbageConfigs, BUDGET, deepFreeze };
