// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The new-provider dry run (docs/TESTING.md, dry run): proves that adding a provider needs no
// edit to core/, build/, test/ or tools/, and that a freshly scaffolded provider is green.
//
//   node test/contract/new-provider-dryrun.js [--keep]
//
// It copies the tree (the files a commit of this repository would hold, test/lint/files.js
// listFiles: in CI, the tracked files) into a temporary directory, makes the copy a git
// repository with one commit, links its test/node_modules to this repository's, and runs there,
// each step as its own process:
//   1. node tools/new-provider.js zz-dryrun-pdf --name "Dry Run Bank" --from pdf, and the same
//      for zz-dryrun-csv from csv;
//   2. checks that each new folder has frozen.js and a fixtures/expected.js that the scaffold
//      generated: it names "Dry Run Bank", never "Example Bank", and differs from the
//      template's;
//   3. node build/build.js, then node build/build.js --check;
//   4. the contract checks of both tiers for the two new providers; the harness with
//      --all-fixtures --browser (every provider with fixtures, the new ones and both templates
//      included); the pages smoke, the fixtures golden (no --update) and the injection smoke for
//      the two new providers; and the lints (headers, privacy, generic, sinks, invisible) on the
//      new providers' files and pages;
//   5. checks that git status --porcelain lists exactly the new providers' files
//      (providers/zz-dryrun-*/**), their pages (dist/zz-dryrun-*/index.html) and dist/index.html.
// The temporary directory is removed afterwards; --keep leaves it and prints where it is. Every
// step sees what CI sees (stepEnv): its own <private-dir> (S2C_PRIVATE), an empty <old-root>
// (S2C_OLD_ROOT) and an empty <config-dir> (XDG_CONFIG_HOME) inside the temporary directory, and
// no S2C_STATEMENTS, S2C_DENYLIST or S2C_APPS, so nothing reads the old repositories or writes
// outside it, and the developer's untracked user config (its refuse list, say) cannot change the
// result. The lints of step 4 run in this process and keep its environment, so the untracked
// denylist and app list apply to the new files. The inputs are the templates' synthetic
// fixtures; the console shows step names, exit statuses and the steps' own summary lines. Exit
// status: 0 green, 1 a step failed, 2 usage.
//
//   runDryRun({log, keep}) -> {ok, steps: [{step, ok, detail}], tmp}
//   stepEnv(tmp, base = process.env) -> the environment of every step (it makes the empty
//     <old-root> and <config-dir> folders)
//   porcelainProblems(lines, ids) -> string[]   step 5 on `git status --porcelain` lines
//   copyTree(to, from = this repository) -> the number of files copied (the files a commit would
//     hold, regular files only)
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const NAME = "Dry Run Bank";
const PLACEHOLDER = "Example Bank";
const NEW = [{ id: "zz-dryrun-pdf", from: "pdf" }, { id: "zz-dryrun-csv", from: "csv" }];
const LINTS = ["headers", "privacy", "generic", "sinks", "invisible"];

const describe = (e) => String(e && e.message ? e.message : e).split("\n")[0];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function git(root, ...args) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  env.GIT_CEILING_DIRECTORIES = path.dirname(root);
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = os.devNull;
  return execFileSync("git", ["-c", "user.name=dry-run", "-c", "user.email=dry-run", "-c", "commit.gpgsign=false", "-C", root, ...args],
    { env, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 26 }).toString("utf8");
}

// Step 5: every line of `git status --porcelain --untracked-files=all` must be one of the new
// providers' files (untracked), one of their pages (untracked) or dist/index.html (modified),
// and each new provider must have its folder and its page.
function porcelainProblems(lines, ids) {
  const out = [];
  const alt = ids.map(escRe).join("|");
  const folder = new RegExp(`^providers/(${alt})/[^\\s]+$`), page = new RegExp(`^dist/(${alt})/index\\.html$`);
  const seen = { folder: new Set(), page: new Set(), landing: false };
  for (const line of lines) {
    const status = line.slice(0, 2), file = line.slice(3);
    let m;
    if ((m = folder.exec(file)) && status === "??") seen.folder.add(m[1]);
    else if ((m = page.exec(file)) && status === "??") seen.page.add(m[1]);
    else if (file === "dist/index.html" && status === " M") seen.landing = true;
    else out.push(`git status lists ${JSON.stringify(line)}: only the new providers' folders and pages and dist/index.html may change`);
  }
  for (const id of ids) {
    if (!seen.folder.has(id)) out.push(`git status lists no file of providers/${id}/`);
    if (!seen.page.has(id)) out.push(`git status does not list dist/${id}/index.html`);
  }
  if (!seen.landing) out.push("git status does not list dist/index.html as modified (the landing page lists the new providers)");
  return out;
}

// The private-data settings a step must not inherit: CI has none of them.
const PRIVATE_SETTINGS = ["S2C_STATEMENTS", "S2C_DENYLIST", "S2C_APPS"];

function stepEnv(tmp, base = process.env) {
  const env = { ...base, S2C_PRIVATE: path.join(tmp, "private"), S2C_OLD_ROOT: path.join(tmp, "old-root"), XDG_CONFIG_HOME: path.join(tmp, "config") };
  for (const k of PRIVATE_SETTINGS) delete env[k];
  fs.mkdirSync(env.S2C_OLD_ROOT, { recursive: true });
  fs.mkdirSync(env.XDG_CONFIG_HOME, { recursive: true });
  return env;
}

function copyTree(to, root = REPO) {
  const { listFiles } = require(path.join(REPO, "test", "lint", "files.js"));
  const { files } = listFiles(root);
  for (const f of files) {
    const from = path.join(root, f), dest = path.join(to, f);
    const st = fs.lstatSync(from);
    if (!st.isFile()) throw new Error(`${f} is not a regular file; the dry run copies files only`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(from, dest);
  }
  return files.length;
}

async function runDryRun({ log = () => {}, keep = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-dryrun-"));
  const tree = path.join(tmp, "tree");
  const steps = [];
  const record = (step, ok, detail) => {
    steps.push({ step, ok, detail });
    log(`${ok ? "ok  " : "FAIL"} ${step}${detail ? `: ${detail}` : ""}`);
    return ok;
  };
  const env = stepEnv(tmp);
  // One step as its own process in the copy: it must exit 0 and print a line matching each of
  // `expect` (so a step that checked nothing, say for an unknown provider, fails). Its last
  // non-empty output line is the detail.
  const run = (step, args, expect = []) => {
    const r = spawnSync(process.execPath, args, { cwd: tree, env, encoding: "utf8", maxBuffer: 1 << 28 });
    const lines = `${r.stdout || ""}${r.stderr || ""}`.split("\n").filter((l) => l.trim());
    const missing = expect.filter((re) => !lines.some((l) => re.test(l)));
    const ok = r.status === 0 && !missing.length;
    if (!ok) for (const l of lines.slice(-40)) log(`  | ${l}`);
    for (const re of missing) log(`  | no output line matches ${re}`);
    return record(step, ok, `${r.status === 0 ? "" : `exit ${r.status === null ? r.signal : r.status}; `}${lines.length ? lines[lines.length - 1].trim() : "no output"}`);
  };
  try {
    const n = copyTree(tree);
    const modules = path.join(REPO, "test", "node_modules");
    if (!fs.existsSync(modules)) {
      record("copy", false, "this repository has no test/node_modules (cd test && npm ci --ignore-scripts)");
      return { ok: false, steps, tmp };
    }
    fs.symlinkSync(modules, path.join(tree, "test", "node_modules"), "dir");
    git(tree, "init", "-q");
    fs.appendFileSync(path.join(tree, ".git", "info", "exclude"), "/test/node_modules\n");
    git(tree, "add", "-A");
    git(tree, "commit", "-q", "--no-verify", "-m", "dry run");
    record("copy", true, `${n} files, committed in a temporary git repository`);

    // 1-2. Scaffold, then look at what the scaffold wrote.
    for (const { id, from } of NEW) {
      run(`scaffold ${id} --from ${from}`, ["tools/new-provider.js", id, "--name", NAME, "--from", from], [new RegExp(`^providers/${id}/fixtures/expected\\.js: generated`)]);
    }
    for (const { id, from } of NEW) {
      const dir = path.join(tree, "providers", id);
      const problems = [];
      if (!fs.existsSync(path.join(dir, "frozen.js"))) problems.push("no frozen.js");
      const file = path.join(dir, "fixtures", "expected.js");
      if (!fs.existsSync(file)) problems.push("no fixtures/expected.js");
      else {
        const text = fs.readFileSync(file, "utf8");
        const template = fs.readFileSync(path.join(REPO, "providers", `_template-${from}`, "fixtures", "expected.js"), "utf8");
        if (!text.includes(NAME)) problems.push(`fixtures/expected.js does not name "${NAME}"`);
        if (text.includes(PLACEHOLDER)) problems.push(`fixtures/expected.js names "${PLACEHOLDER}" (stale: the template's)`);
        if (text === template) problems.push("fixtures/expected.js is the template's");
      }
      record(`${id}: frozen.js and a fresh fixtures/expected.js`, !problems.length, problems.join("; "));
    }

    // 3. Build, and check that dist/ is current.
    run("build", ["build/build.js"]);
    run("build --check", ["build/build.js", "--check"]);

    // 4. The checks on the new providers.
    const ids = NEW.map((x) => x.id).join(",");
    const each = (re) => NEW.map(({ id }) => new RegExp(re.replace("<id>", escRe(id))));
    run("contract checks, both tiers", ["test/contract/run.js", "--tier", "all", "--provider", ids],
      [...each("^ok +<id>: C01-C12, C14, C16$"), ...each("^ok +<id>: C13$"), new RegExp(`^contract \\(all tier\\): ${NEW.length} providers, 0 problems$`)]);
    run("harness --all-fixtures --browser", ["test/harness/run.js", "--all-fixtures", "--browser"], each("^<id>: \\d+ passed, 0 failed"));
    run("pages smoke", ["test/smoke/pages.js", "--provider", ids], [...each("^ok +<id> \\(dist\\): "), new RegExp(`^smoke: ${NEW.length} pages, 0 problems$`)]);
    run("fixtures golden", ["test/smoke/fixtures-golden.js", "--provider", ids], [...each("^ok +<id>: [1-9]\\d* states"), new RegExp(`^fixtures golden: ${NEW.length} providers with fixtures, 0 problems$`)]);
    run("injection smoke", ["test/smoke/injection.js", "--provider", ids], [...each("^ok +<id>: configurator payloads"), new RegExp(`^injection: ${NEW.length} providers with fixtures, 0 problems$`)]);
    const lintFiles = require(path.join(tree, "test", "lint", "files.js"));
    const mine = lintFiles.listFiles(tree).files.filter((f) => NEW.some(({ id }) => f.startsWith(`providers/${id}/`) || f === `dist/${id}/index.html`));
    const providers = lintFiles.providerFacts(tree);
    const findings = [];
    for (const name of LINTS) {
      const lint = require(path.join(tree, "test", "lint", `${name}.js`));
      for (const f of lint.check(tree, { files: mine, providers })) findings.push(`${f.file}:${f.line}:${f.col} [${name}/${f.rule}] ${f.message}`);
    }
    for (const f of findings) log(`  | ${f}`);
    const pages = NEW.filter(({ id }) => mine.includes(`dist/${id}/index.html`)).length;
    record("lints on the new files", !findings.length && pages === NEW.length, `${mine.length} files (${pages} pages), ${findings.length} finding${findings.length === 1 ? "" : "s"}`);

    // 5. Nothing else changed.
    const lines = git(tree, "status", "--porcelain", "--untracked-files=all").split("\n").filter(Boolean);
    const problems = porcelainProblems(lines, NEW.map((x) => x.id));
    for (const p of problems) log(`  | ${p}`);
    record("git status: only the new providers and dist/index.html", !problems.length, `${lines.length} changed paths`);
  } catch (e) {
    record("dry run", false, describe(e));
  } finally {
    if (keep) log(`kept: ${tmp}`);
    else fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: steps.length > 0 && steps.every((s) => s.ok), steps, tmp };
}

async function main(argv) {
  const keep = argv.includes("--keep");
  const bad = argv.filter((a) => a !== "--keep");
  if (bad.length) {
    console.error(`dry run: unknown argument ${JSON.stringify(bad[0])}`);
    console.error("usage: node test/contract/new-provider-dryrun.js [--keep]");
    return 2;
  }
  const r = await runDryRun({ log: (m) => console.log(m), keep });
  const failed = r.steps.filter((s) => !s.ok).length;
  console.log(`dry run: ${r.steps.length} steps, ${failed} failed${failed ? " (FAILED)" : ""}`);
  return r.ok ? 0 : 1;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { runDryRun, stepEnv, porcelainProblems, copyTree, main, NAME, NEW, PRIVATE_SETTINGS };
