// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Private-data rules (docs/TESTING.md): where the old repos, the statements, the private
// output directory and the untracked user config live; how a provider's statement folder
// is found; and the guards that keep every write, and every read, away from places it must
// not touch. Every machine path is computed at run time from the environment and the home
// directory; none is written in a tracked file. No dependencies beyond Node's own modules.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const CONFIG_FILE = "statements.js";
const PROVIDER_FIELDS = new Set(["dir", "expectErrors", "allowProblems"]);
const CONFIG_FIELDS = new Set(["providers", "refuse"]);

// An XDG base directory is used only when it is absolute (the XDG spec says to ignore
// relative values).
function xdg(name, fallback) {
  const v = process.env[name];
  return v && path.isAbsolute(v) ? v : fallback;
}

// <old-root>: a CLI's --old-root (passed in), else $S2C_OLD_ROOT, else the home directory.
// A CLI that takes --old-root should also set process.env.S2C_OLD_ROOT, so that the guards
// below see the same old repos.
function oldRoot(cli) {
  return path.resolve(cli || process.env.S2C_OLD_ROOT || os.homedir());
}

// <statements-dir>: $S2C_STATEMENTS, else the "statements" folder in the home directory.
function statementsRoot() {
  return path.resolve(process.env.S2C_STATEMENTS || path.join(os.homedir(), "statements"));
}

// <config-dir>: "statement2csv" under $XDG_CONFIG_HOME, else under the home directory's .config.
function configDir() {
  return path.resolve(xdg("XDG_CONFIG_HOME", path.join(os.homedir(), ".config")), "statement2csv");
}

// <private-dir>: $S2C_PRIVATE, else "statement2csv" under $XDG_CACHE_HOME or the home
// directory's .cache. Only computed here; privateDir() creates it.
function privateRoot() {
  return path.resolve(process.env.S2C_PRIVATE || path.join(xdg("XDG_CACHE_HOME", path.join(os.homedir(), ".cache")), "statement2csv"));
}

// True when `p` is `root` or lies below it. Both must be absolute and normalised.
function within(p, root) {
  const rel = path.relative(root, p);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

// The resolved path with every symlink in its longest existing prefix resolved, so a link
// cannot carry a write into a guarded directory. A dangling link is followed by hand (a write
// through it would create its target). The part that does not exist yet is kept.
function canonical(p, depth = 0) {
  let head = path.resolve(p);
  const tail = [];
  for (;;) {
    let st;
    try {
      st = fs.lstatSync(head, { throwIfNoEntry: false });
    } catch (e) {
      st = undefined; // ENOTDIR and the like: treat as missing
    }
    if (st) {
      let real = null;
      try {
        real = fs.realpathSync(head);
      } catch (e) {
        real = null;
      }
      if (real) return path.join(real, ...tail);
      if (st.isSymbolicLink() && depth < 40) {
        return canonical(path.join(path.resolve(path.dirname(head), fs.readlinkSync(head)), ...tail), depth + 1);
      }
      return path.join(head, ...tail);
    }
    const parent = path.dirname(head);
    if (parent === head) return path.join(head, ...tail);
    tail.unshift(path.basename(head));
    head = parent;
  }
}

// The lexical and the symlink-resolved form of a path.
function forms(p) {
  const a = path.resolve(p);
  const c = canonical(a);
  return a === c ? [a] : [a, c];
}

function insideForms(ps, rs) {
  return ps.some((a) => rs.some((b) => within(a, b)));
}

// True when `p` lies inside `root`, comparing the lexical and the symlink-resolved forms of both.
function inside(p, root) {
  return insideForms(forms(p), forms(root));
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// A CommonJS data module, read on every call but evaluated again only when its text changed
// (the guards run before every private write).
const evaluated = new Map(); // absolute file -> {text, value}
function loadModule(file) {
  const text = fs.readFileSync(file, "utf8");
  const hit = evaluated.get(file);
  if (hit && hit.text === text) return hit.value;
  delete require.cache[require.resolve(file)];
  const value = require(file);
  evaluated.set(file, { text, value });
  return value;
}

// The untracked user config <config-dir>/statements.js, read afresh on every call:
// {providers: {<id>: {dir?, expectErrors?, allowProblems?}}, refuse: [<absolute path>]}.
// A missing file gives the defaults. A file that exists but cannot be loaded, or that has an
// unknown key or a wrong type, throws: silently dropping a `refuse` entry would be unsafe.
function userConfig() {
  const file = path.join(configDir(), CONFIG_FILE);
  if (!fs.existsSync(file)) return { providers: {}, refuse: [] };
  let cfg;
  try {
    cfg = loadModule(file);
  } catch (e) {
    throw new Error(`cannot load the user config ${file}: ${e.message}`);
  }
  const bad = (msg) => new Error(`user config ${file}: ${msg}`);
  if (!isPlainObject(cfg)) throw bad("module.exports must be an object");
  for (const k of Object.keys(cfg)) if (!CONFIG_FIELDS.has(k)) throw bad(`unknown key "${k}"`);
  const providers = {};
  if (cfg.providers !== undefined) {
    if (!isPlainObject(cfg.providers)) throw bad("providers must be an object");
    for (const [id, p] of Object.entries(cfg.providers)) {
      if (!isPlainObject(p)) throw bad(`providers.${id} must be an object`);
      for (const k of Object.keys(p)) if (!PROVIDER_FIELDS.has(k)) throw bad(`unknown key providers.${id}.${k}`);
      if (p.dir !== undefined && (typeof p.dir !== "string" || !path.isAbsolute(p.dir))) throw bad(`providers.${id}.dir must be an absolute path`);
      if (p.expectErrors !== undefined && (!Array.isArray(p.expectErrors) || !p.expectErrors.every((x) => typeof x === "string"))) {
        throw bad(`providers.${id}.expectErrors must be an array of file names`);
      }
      if (p.allowProblems !== undefined && !(Number.isInteger(p.allowProblems) && p.allowProblems >= 0)) {
        throw bad(`providers.${id}.allowProblems must be a non-negative integer`);
      }
      providers[id] = {
        ...(p.dir !== undefined ? { dir: path.resolve(p.dir) } : {}),
        expectErrors: (p.expectErrors || []).slice(),
        allowProblems: p.allowProblems || 0,
      };
    }
  }
  if (cfg.refuse !== undefined && (!Array.isArray(cfg.refuse) || !cfg.refuse.every((r) => typeof r === "string" && path.isAbsolute(r)))) {
    throw bad("refuse must be an array of absolute paths");
  }
  return { providers, refuse: (cfg.refuse || []).map((r) => path.resolve(r)) };
}

// legacyRepo of every providers/*/frozen.js in this repository (the old repos to guard).
function legacyRepos() {
  const dir = path.join(REPO, "providers");
  let names;
  try {
    names = fs.readdirSync(dir).sort();
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const out = [];
  for (const name of names) {
    const file = path.join(dir, name, "frozen.js");
    if (!fs.existsSync(file)) continue;
    const frozen = loadModule(file);
    if (frozen && typeof frozen.legacyRepo === "string" && frozen.legacyRepo) out.push(frozen.legacyRepo);
  }
  return [...new Set(out)];
}

// The legacyRepo of one provider (its folder may be a skeleton's "_<id>"), or null.
function frozenLegacyRepo(id) {
  for (const name of [id, `_${id}`]) {
    const file = path.join(REPO, "providers", name, "frozen.js");
    if (fs.existsSync(file)) {
      const frozen = loadModule(file);
      return frozen && typeof frozen.legacyRepo === "string" ? frozen.legacyRepo : null;
    }
  }
  return null;
}

function oldRepoDirs() {
  const root = oldRoot();
  return legacyRepos().map((r) => path.join(root, r));
}

// Locations no output may enter: this repository, every old repo, the statements root, every
// configured statement folder, and every path in the user config's `refuse` list.
function guardedOutputRoots(cfg) {
  return [
    ["this repository", REPO],
    ...oldRepoDirs().map((d) => [`the old repository ${path.basename(d)}`, d]),
    ["the statements folder", statementsRoot()],
    ...Object.entries(cfg.providers).filter(([, p]) => p.dir).map(([id, p]) => [`the statement folder of ${id}`, p.dir]),
    ...cfg.refuse.map((r) => ["a path in the user config's refuse list", r]),
  ];
}

// Throws unless `p` is a safe place to write private output.
function assertSafeOutput(p) {
  if (typeof p !== "string" || !p) throw new TypeError("assertSafeOutput: path must be a non-empty string");
  const cfg = userConfig();
  const target = forms(p);
  for (const [what, root] of guardedOutputRoots(cfg)) {
    if (insideForms(target, forms(root))) throw new Error(`refusing to write ${path.resolve(p)}: it is inside ${what}`);
  }
}

// Throws unless `p` may be read: never inside a refused path; otherwise only inside one of
// `allowed` (the resolved statement folders), an old repo, this repository or the private
// directory (the harness's own goldens and caches).
function assertSafeInput(p, { allowed = [] } = {}) {
  if (typeof p !== "string" || !p) throw new TypeError("assertSafeInput: path must be a non-empty string");
  const cfg = userConfig();
  const target = forms(p);
  for (const r of cfg.refuse) {
    if (insideForms(target, forms(r))) throw new Error(`refusing to read ${path.resolve(p)}: it is inside a path in the user config's refuse list`);
  }
  // Both forms must be inside an allowed root, so a link cannot lead a read elsewhere.
  const roots = [...allowed, ...oldRepoDirs(), REPO, privateRoot()].map(forms);
  if (!target.every((t) => roots.some((rf) => rf.some((r) => within(t, r))))) {
    throw new Error(`refusing to read ${path.resolve(p)}: it is not inside a statement folder, an old repository, this repository or the private directory`);
  }
}

function ensurePrivateRoot(root) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const st = fs.statSync(root);
  if (!st.isDirectory()) throw new Error(`the private directory ${root} is not a directory`);
  if ((st.mode & 0o077) !== 0) fs.chmodSync(root, 0o700);
}

// privateDir(...parts) -> string: the path of `parts` under <private-dir>. Creates
// <private-dir> itself (mode 0700) but not the joined path, which may name a file.
function privateDir(...parts) {
  const root = privateRoot();
  assertSafeOutput(root);
  ensurePrivateRoot(root);
  const p = path.resolve(root, ...parts);
  if (!within(p, root)) throw new Error(`privateDir: ${parts.join("/")} leaves the private directory`);
  assertSafeOutput(p);
  return p;
}

// writePrivate(file, data) -> file: writes a file inside <private-dir>, creating its parent
// folders with mode 0700 and the file with mode 0600.
function writePrivate(file, data) {
  const root = privateRoot();
  const abs = path.resolve(file);
  if (!within(abs, root)) throw new Error(`writePrivate: ${abs} is not inside the private directory`);
  assertSafeOutput(abs);
  ensurePrivateRoot(root);
  fs.mkdirSync(path.dirname(abs), { recursive: true, mode: 0o700 });
  fs.writeFileSync(abs, data, { mode: 0o600 });
  fs.chmodSync(abs, 0o600);
  return abs;
}

// --statements values: an array of "<id>=<dir>" strings (repeatable flag), one such string,
// or an object {<id>: <dir>}.
function cliMap(cli) {
  if (cli === undefined || cli === null) return {};
  if (isPlainObject(cli)) return { ...cli };
  const list = Array.isArray(cli) ? cli : [cli];
  const out = {};
  for (const item of list) {
    const s = String(item);
    const eq = s.indexOf("=");
    if (eq <= 0 || eq === s.length - 1) throw new Error(`--statements expects <id>=<dir>, got "${s}"`);
    const id = s.slice(0, eq);
    if (Object.prototype.hasOwnProperty.call(out, id)) throw new Error(`--statements gives ${id} twice`);
    out[id] = s.slice(eq + 1);
  }
  return out;
}

function subdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return [];
    throw e;
  }
}

// statementsFor(id, {cli, legacyRepo}) -> {dir, expectErrors, allowProblems}. Resolution:
//   1. --statements <id>=<dir> (`cli`);
//   2. providers[<id>].dir in the user config;
//   3. a case-insensitive match of <id> among the folders of <statements-dir>, then of
//      legacyRepo without "2csv" (`legacyRepo` defaults to the provider's frozen.js);
//   4. otherwise an error that says how to give the mapping.
// The private declarations (expectErrors, allowProblems) come from the user config.
function statementsFor(id, { cli, legacyRepo } = {}) {
  if (typeof id !== "string" || !id) throw new TypeError("statementsFor: id must be a non-empty string");
  const cfg = userConfig();
  const entry = cfg.providers[id] || { expectErrors: [], allowProblems: 0 };
  const done = (dir, how) => {
    const abs = path.resolve(dir);
    let st;
    try {
      st = fs.statSync(abs);
    } catch (e) {
      throw new Error(`statement folder for ${id} (${how}) does not exist: ${abs}`);
    }
    if (!st.isDirectory()) throw new Error(`statement folder for ${id} (${how}) is not a directory: ${abs}`);
    for (const r of cfg.refuse) {
      if (inside(abs, r)) throw new Error(`statement folder for ${id} (${how}) is inside a path in the user config's refuse list`);
    }
    return { dir: abs, expectErrors: entry.expectErrors.slice(), allowProblems: entry.allowProblems };
  };
  const fromCli = cliMap(cli)[id];
  if (fromCli) return done(fromCli, "--statements");
  if (entry.dir) return done(entry.dir, "user config");
  const root = statementsRoot();
  const repo = legacyRepo === undefined ? frozenLegacyRepo(id) : legacyRepo;
  const names = subdirs(root);
  const wanted = [id];
  if (repo) wanted.push(repo.replace(/2csv$/, ""));
  for (const want of wanted) {
    const hits = names.filter((n) => n.toLowerCase() === want.toLowerCase());
    if (hits.length > 1) throw new Error(`several folders in ${root} match ${want}: give the folder with --statements ${id}=<dir>`);
    if (hits.length === 1) return done(path.join(root, hits[0]), "statements folder");
  }
  throw new Error(`no statement folder for ${id}: pass --statements ${id}=<dir>, set providers.${id}.dir in ${path.join(configDir(), CONFIG_FILE)}, or name a folder in ${root} after the provider`);
}

module.exports = {
  oldRoot,
  statementsRoot,
  configDir,
  privateDir,
  userConfig,
  statementsFor,
  assertSafeOutput,
  assertSafeInput,
  // Extras (not part of the frozen list, used by the other test/lib modules and the harnesses):
  privateRoot,
  writePrivate,
  inside,
  repoRoot: () => REPO,
};
