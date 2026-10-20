// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// What the lints and the contract checks C17/C18 look at (docs/TESTING.md, lints). Not a lint
// itself: test/lint/run.js runs the lints, each of which takes the list made here.
//
//   listFiles(root) -> {files: string[], source: "git" | "walk"}
//     The files of the tree, as "/"-separated paths relative to root, in code-point order.
//     In a git work tree whose top is root: every tracked file plus every untracked file that
//     .gitignore does not exclude (`git ls-files --cached --others --exclude-standard`), that
//     is, what a commit of the tree would hold, so files not yet committed are checked too.
//     Files deleted from the work tree are left out. Elsewhere (a scratch tree without git):
//     every file under root except .git/, node_modules/ and out/.
//   trackedFiles(root) -> Set<string> | null   `git ls-files --cached` only; null without git
//   readText(root, rel) -> {text, ok} | {ok: false, why}: UTF-8 text, or why it is not text
//   lineCol(text, index) -> {line, col}  (1-based)
//   privateList(envName, fileName) -> string[] | null
//     One literal string per line of $<envName>, else <config-dir>/<fileName> (untracked, see
//     test/lib/private.js); null when the file does not exist (CI has none). Blank lines are
//     skipped. Callers never print an entry: they name it by its 1-based number.
//   providerFacts(root) -> [{folder, id, skeleton, legacy, names: [{field, value}], app,
//                           appScript, raw, frozen}]
//     What the generic and sinks lints need from providers/*/provider.js and frozen.js, read
//     as data (a file that cannot be loaded counts as absent; the contract checks report it).
//
// Git runs as plumbing only (no status or diff), with optional locks off, inherited GIT_*
// variables dropped and discovery stopped at root's parent.
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const COPYRIGHT = "Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>";
const SPDX_ID = "SPDX-License-Identifier: Apache-2.0";
const WALK_SKIP = new Set([".git", "node_modules"]);

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function git(root, args) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  env.GIT_OPTIONAL_LOCKS = "0";
  env.GIT_CEILING_DIRECTORIES = path.dirname(root);
  return execFileSync("git", ["--no-optional-locks", "-C", root, ...args], { env, maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] });
}

// True when root is the top of a git work tree.
function isGitTop(root) {
  try {
    const top = git(root, ["rev-parse", "--show-toplevel"]).toString("utf8").trim();
    return fs.realpathSync(top) === fs.realpathSync(root);
  } catch {
    return false;
  }
}

const splitZ = (buf) => buf.toString("utf8").split("\0").filter(Boolean);

function walk(root, dir = "", out = []) {
  let names;
  try {
    names = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of names) {
    const rel = dir ? `${dir}/${d.name}` : d.name;
    if (WALK_SKIP.has(d.name) || rel === "out") continue;
    if (d.isDirectory()) walk(root, rel, out);
    else out.push(rel);
  }
  return out;
}

function listFiles(root) {
  root = path.resolve(root);
  if (isGitTop(root)) {
    const files = splitZ(git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]));
    const unique = [...new Set(files)].filter((f) => {
      const st = fs.lstatSync(path.join(root, f), { throwIfNoEntry: false });
      return st && (st.isFile() || st.isSymbolicLink());
    });
    return { files: unique.sort(byCodePoint), source: "git" };
  }
  return { files: walk(root).sort(byCodePoint), source: "walk" };
}

function trackedFiles(root) {
  root = path.resolve(root);
  if (!isGitTop(root)) return null;
  return new Set(splitZ(git(root, ["ls-files", "-z", "--cached"])));
}

function readText(root, rel) {
  let buf;
  try {
    buf = fs.readFileSync(path.join(root, rel));
  } catch (e) {
    return { ok: false, why: `cannot be read (${e.code || e.message})` };
  }
  if (buf.includes(0)) return { ok: false, why: "is binary (it holds a NUL byte)" };
  const text = buf.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(buf)) return { ok: false, why: "is not valid UTF-8" };
  return { ok: true, text };
}

function lineCol(text, index) {
  let line = 1, last = -1;
  for (let i = text.indexOf("\n"); i !== -1 && i < index; i = text.indexOf("\n", i + 1)) {
    line++;
    last = i;
  }
  return { line, col: index - last };
}

function privateList(envName, fileName) {
  const file = process.env[envName] || path.join(require(path.join(REPO, "test", "lib", "private.js")).configDir(), fileName);
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw new Error(`the list in $${envName} (or <config-dir>/${fileName}) cannot be read: ${e.code || e.message}`);
  }
  return text.split("\n").map((l) => l.replace(/\r$/, "")).filter((l) => l.trim() !== "");
}

function loadData(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return require(path.join(REPO, "build", "discover.js")).loadDataModule(file);
  } catch {
    return null;
  }
}

function providerFacts(root) {
  root = path.resolve(root);
  const base = path.join(root, "providers");
  let folders = [];
  try {
    folders = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name).sort(byCodePoint);
  } catch {
    folders = [];
  }
  return folders.map((folder) => {
    const raw = loadData(path.join(base, folder, "provider.js"));
    const frozen = loadData(path.join(base, folder, "frozen.js"));
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    const names = [];
    const add = (field, v) => {
      if (typeof v !== "string") return;
      const value = v.trim();
      if (value && !names.some((n) => n.value === value)) names.push({ field, value });
    };
    add("name", obj(raw).name);
    add("naming.brand", obj(obj(raw).naming).brand);
    add("naming.accountPrefix", obj(obj(raw).naming).accountPrefix);
    add("naming.brand", obj(obj(frozen).naming).brand);
    add("naming.accountPrefix", obj(obj(frozen).naming).accountPrefix);
    add("legacyRepo", obj(frozen).legacyRepo);
    const app = obj(raw).app === "custom" ? "custom" : "statement";
    return {
      folder,
      id: folder.replace(/^_/, ""),
      skeleton: folder.startsWith("_"),
      legacy: typeof obj(frozen).legacyRepo === "string" && obj(frozen).legacyRepo !== "",
      names,
      app,
      appScript: app === "custom" ? (typeof obj(raw).appScript === "string" ? obj(raw).appScript : "app.js") : null,
      raw,
      frozen,
    };
  });
}

module.exports = { listFiles, trackedFiles, readText, lineCol, privateList, providerFacts, isGitTop, COPYRIGHT, SPDX_ID, REPO };
