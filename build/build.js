// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The build (docs/ARCHITECTURE.md, build system). Node >= 22, no dependencies.
//
//   node build/build.js                               validate every provider; write dist/<id>/index.html
//                                                     for the published ones, and dist/index.html
//   node build/build.js --check                       build in memory; exit 2 if dist/ differs
//   node build/build.js --only <id>[,<id>...]         build a subset (every provider is still validated)
//   node build/build.js --include-skeletons --out <d> also build providers/_* and unpublished providers
//   node build/build.js --out <dir>                   write elsewhere
//   node build/build.js --csp legacy|hash             CSP mode (default: DEFAULT_CSP_MODE in build/csp.js)
//   node build/build.js --root <dir>                  build another tree (default: this repository)
//   node build/build.js --inject <file> --out <dir>   test-only extra script piece (12b), see below
//
// Pipeline per page: discover -> validate -> plan scripts -> fill the skeleton -> CSP ->
// verify -> write (or compare). The landing page is rendered and verified the same way
// (build/csp.js verifyLanding). Every page is built and verified in memory before anything
// is written, so a failing build never leaves a partial dist/.
//
// --inject is for tests only and is refused unless --out resolves outside <root>/dist,
// --check is not given, and the file lies under <root>/test/. It is added after validation.
//
// Exit codes: 0 success; 1 validation, build or usage error; 2 --check found differences.
"use strict";

const fs = require("fs");
const path = require("path");
const { discover, DiscoverError } = require("./discover.js");
const { planScripts, readPiece, scriptTag, REPO } = require("./scripts.js");
const { fill, pageValues } = require("./page.js");
const { policy, verify, verifyLanding, DEFAULT_CSP_MODE } = require("./csp.js");
const { renderLanding, readStyle, styleElementText } = require("./landing.js");

const USAGE = "usage: node build/build.js [--check] [--only <id>[,<id>...]] [--include-skeletons] [--out <dir>]\n" +
  "                           [--csp legacy|hash] [--root <dir>] [--inject <file>]";

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { check: false, only: null, includeSkeletons: false, out: null, csp: DEFAULT_CSP_MODE, root: null, inject: null };
  const value = (i, flag) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new UsageError(`${flag} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--check") o.check = true;
    else if (a === "--include-skeletons") o.includeSkeletons = true;
    else if (a === "--only") o.only = value(i++, a).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--out") o.out = value(i++, a);
    else if (a === "--csp") o.csp = value(i++, a);
    else if (a === "--root") o.root = value(i++, a);
    else if (a === "--inject") o.inject = value(i++, a);
    else if (a === "--help" || a === "-h") throw new UsageError("");
    else throw new UsageError(`unknown argument ${JSON.stringify(a)}`);
  }
  if (o.csp !== "legacy" && o.csp !== "hash") throw new UsageError(`--csp must be legacy or hash, not ${JSON.stringify(o.csp)}`);
  if (o.only && !o.only.length) throw new UsageError("--only needs at least one id");
  return o;
}

const inside = (parent, child) => {
  const r = path.relative(parent, child);
  return r === "" || (!r.startsWith("..") && !path.isAbsolute(r));
};

// Builds one page in memory and verifies it. Returns {html, plan}.
function buildPage(entry, { root, mode = DEFAULT_CSP_MODE, inject = null }) {
  const plan = planScripts(entry.D, entry.dir, { inject, root });
  const pieces = plan.map((p) => ({ ...p, text: readPiece(p) }));
  const pageDir = path.join(root, "core", "page");
  const skeleton = fs.readFileSync(path.join(pageDir, "skeleton.html"), "utf8");
  const style = readStyle(path.join(pageDir, "style.css"));
  const pdf = entry.D.inputs.includes("pdf");
  const csp = policy(pieces, { pdf, mode, styleText: styleElementText(skeleton, style) });
  const scripts = pieces.map((p) => scriptTag(p, p.text)).join("\n");
  const html = fill(skeleton, pageValues(entry.D, entry.slots, { csp, style, scripts }));
  const problems = verify(html, plan, { mode, pdf });
  if (problems.length) throw new Error(`verify failed:\n  ${problems.join("\n  ")}`);
  return { html, plan };
}

// Renders the landing page in memory and verifies it. Returns its html.
function buildLanding(published, { root, mode = DEFAULT_CSP_MODE }) {
  const html = renderLanding(published, { root, mode });
  const problems = verifyLanding(html, { mode });
  if (problems.length) throw new Error(`verify failed:\n  ${problems.join("\n  ")}`);
  return html;
}

function walkFiles(dir, base = dir, out = []) {
  let names;
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of names) {
    const abs = path.join(dir, d.name);
    if (d.isDirectory()) walkFiles(abs, base, out);
    else out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}

// Runs the build with parsed options. Returns {code, files}; messages go to log/err.
function build(opts, { log = () => {}, err = () => {} } = {}) {
  const root = path.resolve(opts.root || REPO);
  const dist = path.join(root, "dist");
  const out = path.resolve(opts.out || dist);
  const show = (abs) => (inside(root, abs) ? path.relative(root, abs) || "." : abs);
  if (opts.includeSkeletons && inside(dist, out)) {
    err("--include-skeletons builds test pages: give an --out outside dist/");
    return { code: 1, files: [] };
  }
  if (opts.inject) {
    const file = path.resolve(opts.inject);
    if (!opts.out || inside(dist, out)) {
      err("--inject is for tests only: give an --out outside dist/");
      return { code: 1, files: [] };
    }
    if (opts.check) {
      err("--inject cannot be combined with --check");
      return { code: 1, files: [] };
    }
    if (!inside(path.join(root, "test"), file) || file === path.join(root, "test")) {
      err("--inject: the injected file must lie under test/");
      return { code: 1, files: [] };
    }
    if (!fs.existsSync(file)) {
      err(`--inject: ${show(file)} does not exist`);
      return { code: 1, files: [] };
    }
  }
  let entries;
  try {
    entries = discover(root, { includeSkeletons: opts.includeSkeletons });
  } catch (e) {
    if (!(e instanceof DiscoverError)) throw e;
    for (const m of e.errors) err(m);
    err(`build failed: ${e.errors.length} problem(s); nothing was written`);
    return { code: 1, files: [] };
  }
  const buildable = (e) => opts.includeSkeletons || (!e.skeleton && e.D.publish);
  let targets = entries.filter(buildable);
  if (opts.only) {
    const problems = [];
    for (const id of opts.only) {
      const e = entries.find((x) => x.id === id);
      if (!e) problems.push(`--only: no provider ${JSON.stringify(id)}${opts.includeSkeletons ? "" : " (skeletons need --include-skeletons)"}`);
      else if (!buildable(e)) problems.push(`--only: ${id} is not published; build it with --include-skeletons --out <dir>`);
    }
    if (problems.length) {
      problems.forEach((m) => err(m));
      return { code: 1, files: [] };
    }
    targets = targets.filter((e) => opts.only.includes(e.id));
  }
  const files = [];
  const failures = [];
  for (const e of targets) {
    try {
      const { html } = buildPage(e, { root, mode: opts.csp, inject: opts.inject });
      files.push({ rel: `${e.id}/index.html`, content: html });
    } catch (x) {
      failures.push(`providers/${e.folder}: ${x.message}`);
    }
  }
  try {
    const published = entries.filter((e) => !e.skeleton && e.D.publish);
    files.unshift({ rel: "index.html", content: buildLanding(published, { root, mode: opts.csp }) });
  } catch (x) {
    failures.push(`landing page: ${x.message}`);
  }
  if (failures.length) {
    failures.forEach((m) => err(m));
    err(`build failed: ${failures.length} problem(s); nothing was written`);
    return { code: 1, files: [] };
  }
  if (opts.check) {
    const diffs = [];
    for (const f of files) {
      const abs = path.join(out, f.rel);
      let cur = null;
      try {
        cur = fs.readFileSync(abs);
      } catch {
        cur = null;
      }
      if (cur === null) diffs.push(`missing: ${show(abs)}`);
      else if (!cur.equals(Buffer.from(f.content, "utf8"))) diffs.push(`stale: ${show(abs)}`);
    }
    if (!opts.only) {
      const want = new Set(files.map((f) => f.rel));
      for (const rel of walkFiles(out)) if (!want.has(rel)) diffs.push(`extra: ${show(path.join(out, rel))}`);
    }
    if (diffs.length) {
      diffs.forEach((m) => err(m));
      err(`${show(out)} is not current: ${diffs.length} difference(s); run node build/build.js`);
      return { code: 2, files };
    }
    log(`${show(out)} is current (${files.length} file(s))`);
    return { code: 0, files };
  }
  for (const f of files) {
    const abs = path.join(out, f.rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content);
    log(`wrote ${show(abs)} (${Math.ceil(Buffer.byteLength(f.content) / 1024)} KiB)`);
  }
  return { code: 0, files };
}

function run(argv, io = { log: (m) => console.log(m), err: (m) => console.error(m) }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    if (e.message) io.err(e.message);
    io.err(USAGE);
    return 1;
  }
  return build(opts, io).code;
}

if (require.main === module) process.exitCode = run(process.argv.slice(2));

module.exports = { run, build, buildPage, buildLanding, parseArgs };
