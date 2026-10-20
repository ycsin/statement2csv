// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Provenance of the pinned files (contract check C15, docs/TESTING.md). The pin list is
// test/contract/provenance.js; its header documents the entry format.
//
//   node tools/provenance.js check [--root <dir>]
//       Needs no old repository (CI). Every pin is well formed; every pinned file is a regular
//       file whose sha256 equals its pin and whose declared sentinels hold; every edited line
//       and every literal line stands where its pin puts it; a verbatim copy has its blob's
//       sha256; and each pin's head is the frozen legacyHead of its repository
//       (providers/*/frozen.js). `verify` is another name for `check`.
//   node tools/provenance.js rederive [--old-root <dir>] [--only <path>]... [--write] [--root <dir>]
//       Rebuilds every pinned file (or only the listed ones) from
//       `git cat-file blob <head>:<path>` in <old-root>/<repo> by re-applying its declared
//       whole-line edits, checks each blob's sha256, and requires the result to equal the file
//       byte for byte and its pin. --write writes the rebuilt bytes instead: that is how a
//       pinned file is created or changed (never with an editor); the sha256 it reports goes
//       into the pin. <old-root> is --old-root, else $S2C_OLD_ROOT, else the home directory.
//
// The old repositories are only read, with git plumbing (optional locks off, inherited GIT_*
// variables dropped, discovery stopped at the repository's parent), never with `status` or
// `diff`. Nothing is ever written there. The console shows paths in this repository,
// repository folder names, counts and hashes only. Exit status: 0 when there is no problem,
// 1 with problems, 2 on a usage error.
//
// API, for test/contract/run.js and the lints:
//   loadPins(root) -> pins                      the pin list (data only, loaded without require)
//   validatePins(pins, {root}) -> string[]      structure, unique paths, heads vs frozen.js
//   check({root}) -> {pins, problems}
//   rederive({root, oldRoot, only, write}) -> {pins, repos, results, problems}
//   derive(pin, readBlob) -> Buffer             pure: the file a pin describes, given
//                                               readBlob(from) -> Buffer
//   pinnedFiles({root}) -> [{path, sha256, matches}]   which tracked paths are pinned and intact
//   sentinelProblems(pin, buf) -> string[]
//   splitLines(buf) -> Buffer[], joinLines(lines) -> Buffer
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const PIN_LIST = "test/contract/provenance.js";
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const FOLDER = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NL = Buffer.from("\n");

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const short = (hex) => String(hex).slice(0, 16);

class PinError extends Error {}

// ---------------------------------------------------------------- lines

// The bytes split at "\n" (0x0a). A buffer that ends with "\n" gives a last, empty element;
// joinLines is the exact inverse.
function splitLines(buf) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0a) {
      lines.push(buf.subarray(start, i));
      start = i + 1;
    }
  }
  lines.push(buf.subarray(start));
  return lines;
}

function joinLines(lines) {
  const out = [];
  lines.forEach((l, i) => {
    if (i) out.push(NL);
    out.push(l);
  });
  return Buffer.concat(out);
}

// Number of real lines: a final empty element after the last "\n" is not a line.
function lineCount(lines) {
  return lines.length && lines[lines.length - 1].length === 0 ? lines.length - 1 : lines.length;
}

const sourceName = (from) => `${from.repo}@${String(from.head).slice(0, 12)}:${from.path}`;

// ---------------------------------------------------------------- loading and validation

function loadDataModule(file) {
  return require(path.join(REPO, "build", "discover.js")).loadDataModule(file);
}

function loadPins(root = REPO) {
  return loadDataModule(path.join(path.resolve(root), ...PIN_LIST.split("/")));
}

// legacyRepo -> legacyHead from every providers/*/frozen.js under root.
function frozenHeads(root) {
  const base = path.join(path.resolve(root), "providers");
  const heads = new Map();
  let names = [];
  try {
    names = fs.readdirSync(base).sort();
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (const name of names) {
    const file = path.join(base, name, "frozen.js");
    if (!fs.existsSync(file)) continue;
    const f = loadDataModule(file);
    if (f && typeof f.legacyRepo === "string" && f.legacyRepo) heads.set(f.legacyRepo, f.legacyHead);
  }
  return heads;
}

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isLine = (s) => typeof s === "string" && !s.includes("\n");
const isRelPath = (p) => typeof p === "string" && p !== "" && !p.includes("\\") && !p.includes("\0")
  && !path.posix.isAbsolute(p) && path.posix.normalize(p) === p && !p.split("/").some((s) => s === ".." || s === ".");

function keysProblem(where, obj, allowed, required) {
  const problems = [];
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) problems.push(`${where}: unknown key ${JSON.stringify(k)}`);
  for (const k of required) if (!(k in obj)) problems.push(`${where}: missing ${k}`);
  return problems;
}

function fromProblems(where, from, heads) {
  if (!isObject(from)) return [`${where}: from must be an object`];
  const problems = keysProblem(`${where}: from`, from, ["repo", "head", "path", "sha256"], ["repo", "head", "path", "sha256"]);
  if (typeof from.repo !== "string" || !FOLDER.test(from.repo)) problems.push(`${where}: from.repo must be a folder name`);
  if (typeof from.head !== "string" || !HEX40.test(from.head)) problems.push(`${where}: from.head must be 40 hex digits`);
  if (!isRelPath(from.path)) problems.push(`${where}: from.path must be a relative "/"-separated path`);
  if (typeof from.sha256 !== "string" || !HEX64.test(from.sha256)) problems.push(`${where}: from.sha256 must be 64 hex digits`);
  if (problems.length) return problems;
  if (!heads.has(from.repo)) problems.push(`${where}: no providers/*/frozen.js has legacyRepo ${from.repo}`);
  else if (heads.get(from.repo) !== from.head) problems.push(`${where}: head ${from.head} is not the frozen legacyHead ${heads.get(from.repo)} of ${from.repo}`);
  return problems;
}

function editsProblems(where, edits, range) {
  if (!Array.isArray(edits)) return [`${where}: edits must be an array`];
  const problems = [];
  let prev = 0;
  edits.forEach((e, i) => {
    const at = `${where}: edits[${i}]`;
    if (!isObject(e)) return problems.push(`${at} must be an object`);
    problems.push(...keysProblem(at, e, ["line", "old", "new"], ["line", "old", "new"]));
    if (!Number.isInteger(e.line) || e.line < 1) problems.push(`${at}: line must be an integer >= 1`);
    else {
      if (e.line <= prev) problems.push(`${at}: lines must be in ascending order, each edited once`);
      if (range && (e.line < range[0] || e.line > range[1])) problems.push(`${at}: line ${e.line} is outside lines ${range[0]}-${range[1]}`);
      prev = e.line;
    }
    if (!isLine(e.old) || !isLine(e.new)) problems.push(`${at}: old and new must be strings without "\\n"`);
    else if (e.old === e.new) problems.push(`${at}: old and new are the same`);
  });
  return problems;
}

function validatePins(pins, { root = REPO } = {}) {
  if (!Array.isArray(pins)) return [`${PIN_LIST}: module.exports must be an array of pins`];
  const heads = frozenHeads(root);
  const problems = [];
  const seen = new Set();
  pins.forEach((pin, i) => {
    let where = `${PIN_LIST}: pin ${i}`;
    if (!isObject(pin)) return problems.push(`${where} must be an object`);
    if (typeof pin.path === "string") where = `${PIN_LIST}: ${pin.path}`;
    const whole = "from" in pin || "edits" in pin;
    problems.push(...keysProblem(where, pin, whole ? ["path", "from", "edits", "sha256", "sentinels"] : ["path", "parts", "sha256", "sentinels"],
      whole ? ["path", "from", "edits", "sha256"] : ["path", "parts", "sha256"]));
    if (!isRelPath(pin.path)) problems.push(`${where}: path must be a relative "/"-separated path`);
    else if (pin.path === PIN_LIST) problems.push(`${where}: the pin list cannot pin itself`);
    else if (seen.has(pin.path)) problems.push(`${where}: pinned twice`);
    seen.add(pin.path);
    if (typeof pin.sha256 !== "string" || !HEX64.test(pin.sha256)) problems.push(`${where}: sha256 must be 64 hex digits`);
    if (whole && "parts" in pin) problems.push(`${where}: a pin has either from and edits, or parts`);
    if (whole) {
      problems.push(...fromProblems(where, pin.from, heads));
      problems.push(...editsProblems(where, pin.edits, null));
    } else if (!Array.isArray(pin.parts) || !pin.parts.length) {
      problems.push(`${where}: parts must be a non-empty array`);
    } else {
      pin.parts.forEach((part, j) => {
        const at = `${where}: parts[${j}]`;
        if (typeof part === "string") {
          if (!isLine(part)) problems.push(`${at}: a literal line cannot hold "\\n"`);
          return;
        }
        if (!isObject(part)) return problems.push(`${at} must be a string or an excerpt object`);
        problems.push(...keysProblem(at, part, ["from", "lines", "edits"], ["from", "lines"]));
        problems.push(...fromProblems(at, part.from, heads));
        const ok = Array.isArray(part.lines) && part.lines.length === 2 && part.lines.every((n) => Number.isInteger(n) && n >= 1) && part.lines[0] <= part.lines[1];
        if (!ok) problems.push(`${at}: lines must be [first, last] with 1 <= first <= last`);
        problems.push(...editsProblems(at, part.edits === undefined ? [] : part.edits, ok ? part.lines : null));
      });
    }
    if ("sentinels" in pin) {
      if (!Array.isArray(pin.sentinels) || !pin.sentinels.length) problems.push(`${where}: sentinels must be a non-empty array`);
      else {
        pin.sentinels.forEach((s, j) => {
          const at = `${where}: sentinels[${j}]`;
          if (!isObject(s)) return problems.push(`${at} must be an object`);
          problems.push(...keysProblem(at, s, ["line", "contains"], ["line", "contains"]));
          if (!Number.isInteger(s.line) || s.line < 1) problems.push(`${at}: line must be an integer >= 1`);
          if (typeof s.contains !== "string" || !s.contains) problems.push(`${at}: contains must be a non-empty string`);
        });
      }
    }
  });
  return problems;
}

// ---------------------------------------------------------------- derivation

function applyEdits(lines, edits, from) {
  const real = lineCount(lines);
  for (const e of edits) {
    if (e.line > real) throw new PinError(`${sourceName(from)} has ${real} lines; no line ${e.line} to edit`);
    if (!lines[e.line - 1].equals(Buffer.from(e.old, "utf8"))) throw new PinError(`line ${e.line} of ${sourceName(from)} is not the declared old text`);
    lines[e.line - 1] = Buffer.from(e.new, "utf8");
  }
  return lines;
}

// The file a pin describes. readBlob(from) returns the blob's bytes (rederive checks their
// sha256 before they get here).
function derive(pin, readBlob) {
  if (!pin.parts) return joinLines(applyEdits(splitLines(readBlob(pin.from)), pin.edits || [], pin.from));
  const out = [];
  for (const part of pin.parts) {
    if (typeof part === "string") {
      out.push(Buffer.from(part, "utf8"));
      continue;
    }
    const lines = splitLines(readBlob(part.from));
    const [first, last] = part.lines;
    if (last > lineCount(lines)) throw new PinError(`${sourceName(part.from)} has ${lineCount(lines)} lines; no lines ${first}-${last}`);
    out.push(...applyEdits(lines, part.edits || [], part.from).slice(first - 1, last));
  }
  out.push(Buffer.alloc(0));
  return joinLines(out);
}

// ---------------------------------------------------------------- checks without old repos

// A string as a JS literal with every character outside printable ASCII escaped, so an
// invisible sentinel such as U+FEFF shows in a message.
const visible = (s) => JSON.stringify(s).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);

function sentinelProblems(pin, buf) {
  const problems = [];
  const lines = splitLines(buf);
  for (const s of pin.sentinels || []) {
    if (s.line > lineCount(lines) || !lines[s.line - 1].toString("utf8").includes(s.contains)) {
      problems.push(`${pin.path}: sentinel: line ${s.line} must contain ${visible(s.contains)}`);
    }
  }
  return problems;
}

// Lines whose text the pin itself states: edited lines, and literal lines of a parts pin.
function placementProblems(pin, buf) {
  const lines = splitLines(buf);
  const real = lineCount(lines);
  const at = (n, text, what) => (n > real || !lines[n - 1].equals(Buffer.from(text, "utf8")) ? [`${pin.path}: line ${n} is not the ${what} its pin declares`] : []);
  const problems = [];
  if (!pin.parts) {
    for (const e of pin.edits) problems.push(...at(e.line, e.new, "edited line"));
    if (!pin.edits.length && pin.sha256 !== pin.from.sha256) problems.push(`${pin.path}: a verbatim copy must have its blob's sha256`);
    return problems;
  }
  let n = 0;
  for (const part of pin.parts) {
    if (typeof part === "string") {
      problems.push(...at(++n, part, "literal line"));
      continue;
    }
    const [first, last] = part.lines;
    for (const e of part.edits || []) problems.push(...at(n + e.line - first + 1, e.new, "edited line"));
    n += last - first + 1;
  }
  if (lines.length !== n + 1 || lines[n].length) problems.push(`${pin.path}: has ${real} lines and must end with a newline; its pin makes ${n}`);
  return problems;
}

function readPinned(root, pin) {
  const file = path.join(root, ...pin.path.split("/"));
  const st = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!st) throw new PinError(`${pin.path}: missing`);
  if (!st.isFile()) throw new PinError(`${pin.path}: not a regular file`);
  return fs.readFileSync(file);
}

function check({ root = REPO } = {}) {
  root = path.resolve(root);
  let pins;
  try {
    pins = loadPins(root);
  } catch (e) {
    return { pins: 0, problems: [`${PIN_LIST}: cannot be loaded: ${e.message}`] };
  }
  const problems = validatePins(pins, { root });
  if (problems.length) return { pins: Array.isArray(pins) ? pins.length : 0, problems };
  for (const pin of pins) {
    let buf;
    try {
      buf = readPinned(root, pin);
    } catch (e) {
      problems.push(e.message);
      continue;
    }
    const got = sha256(buf);
    if (got !== pin.sha256) problems.push(`${pin.path}: sha256 is ${got}, its pin says ${pin.sha256}`);
    problems.push(...sentinelProblems(pin, buf), ...placementProblems(pin, buf));
  }
  return { pins: pins.length, problems };
}

// Which paths are pinned, and whether each file still matches its pin (the privacy lint's
// exemption for pinned files needs both).
function pinnedFiles({ root = REPO } = {}) {
  root = path.resolve(root);
  return loadPins(root).map((pin) => {
    let matches = false;
    try {
      matches = sha256(readPinned(root, pin)) === pin.sha256;
    } catch {
      matches = false;
    }
    return { path: pin.path, sha256: pin.sha256, matches };
  });
}

// ---------------------------------------------------------------- re-derivation from git

// The only way this tool runs git: plumbing in <old-root>/<repo>, inherited GIT_* variables
// dropped, optional locks off, and no discovery above the repository's parent.
function git(repoDir, args) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  env.GIT_OPTIONAL_LOCKS = "0";
  env.GIT_CEILING_DIRECTORIES = path.dirname(path.resolve(repoDir));
  return execFileSync("git", ["--no-optional-locks", "-C", repoDir, ...args], { env, maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
}

function firstLine(err) {
  const text = String((err && err.stderr && err.stderr.length ? err.stderr : err && err.message) || err);
  return (text.split("\n").find((l) => l.trim()) || text).replace(/(?:\/[^\s'":]+)+/g, "<path>");
}

function blobReader(oldRoot) {
  const cache = new Map();
  return (from) => {
    const key = `${from.repo}\0${from.head}\0${from.path}`;
    if (!cache.has(key)) {
      const dir = path.join(oldRoot, from.repo);
      if (!fs.existsSync(dir)) throw new PinError(`<old-root>/${from.repo} does not exist`);
      let buf;
      try {
        buf = git(dir, ["cat-file", "blob", `${from.head}:${from.path}`]);
      } catch (e) {
        throw new PinError(`git cat-file blob ${sourceName(from)} failed: ${firstLine(e)}`);
      }
      const got = sha256(buf);
      if (got !== from.sha256) throw new PinError(`blob ${sourceName(from)} has sha256 ${got}, its pin says ${from.sha256}`);
      cache.set(key, buf);
    }
    return cache.get(key);
  };
}

function sources(pin) {
  return pin.parts ? pin.parts.filter((p) => typeof p !== "string").map((p) => p.from) : [pin.from];
}

function editCount(pin) {
  return pin.parts ? pin.parts.reduce((n, p) => n + (typeof p === "string" ? 0 : (p.edits || []).length), 0) : pin.edits.length;
}

function within(p, dir) {
  const rel = path.relative(dir, p);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function rederive({ root = REPO, oldRoot, only = null, write = false } = {}) {
  root = path.resolve(root);
  if (!oldRoot) oldRoot = require(path.join(REPO, "test", "lib", "private.js")).oldRoot();
  oldRoot = path.resolve(oldRoot);
  let pins;
  try {
    pins = loadPins(root);
  } catch (e) {
    return { pins: 0, repos: 0, results: [], problems: [`${PIN_LIST}: cannot be loaded: ${e.message}`] };
  }
  const problems = validatePins(pins, { root });
  if (problems.length) return { pins: Array.isArray(pins) ? pins.length : 0, repos: 0, results: [], problems };
  let chosen = pins;
  if (only && only.length) {
    const want = new Set(only);
    chosen = pins.filter((p) => want.delete(p.path));
    for (const p of want) problems.push(`--only ${p}: not in the pin list`);
  }
  const oldDirs = [...frozenHeads(root).keys()].map((r) => path.join(oldRoot, r));
  const readBlob = blobReader(oldRoot);
  const results = [];
  const repos = new Set();
  for (const pin of chosen) {
    const result = { path: pin.path, sources: sources(pin).map(sourceName), edits: editCount(pin), sha256: null, status: "failed" };
    results.push(result);
    let derived;
    try {
      derived = derive(pin, readBlob);
    } catch (e) {
      if (!(e instanceof PinError)) throw e;
      problems.push(`${pin.path}: ${e.message}`);
      continue;
    }
    for (const s of sources(pin)) repos.add(s.repo);
    result.sha256 = sha256(derived);
    if (write) {
      const file = path.join(root, ...pin.path.split("/"));
      if (!within(file, root) || oldDirs.some((d) => within(file, d))) {
        problems.push(`${pin.path}: refusing to write outside this repository or into an old repository`);
        continue;
      }
      const st = fs.lstatSync(file, { throwIfNoEntry: false });
      if (st && !st.isFile()) {
        problems.push(`${pin.path}: refusing to replace something that is not a regular file`);
        continue;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, derived);
      result.status = "written";
      if (result.sha256 !== pin.sha256) problems.push(`${pin.path}: written; record its sha256 ${result.sha256} in the pin (it says ${pin.sha256})`);
      continue;
    }
    let buf;
    try {
      buf = readPinned(root, pin);
    } catch (e) {
      problems.push(e.message);
      continue;
    }
    if (!buf.equals(derived)) {
      const a = splitLines(buf);
      const b = splitLines(derived);
      let n = 0;
      while (n < a.length && n < b.length && a[n].equals(b[n])) n++;
      problems.push(`${pin.path}: differs from its re-derivation from line ${n + 1} (file sha256 ${short(sha256(buf))}, derived ${short(result.sha256)})`);
      continue;
    }
    if (result.sha256 !== pin.sha256) {
      problems.push(`${pin.path}: re-derived bytes have sha256 ${result.sha256}, its pin says ${pin.sha256}`);
      continue;
    }
    result.status = "reproduced";
  }
  return { pins: chosen.length, repos: repos.size, results, problems };
}

// ---------------------------------------------------------------- CLI

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { command: argv[0], root: REPO, oldRoot: null, only: [], write: false };
  if (!["check", "verify", "rederive"].includes(o.command)) throw new UsageError(`unknown command ${JSON.stringify(o.command || "")}; one of check, verify, rederive`);
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new UsageError(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--root") o.root = path.resolve(value());
    else if (a === "--old-root" && o.command === "rederive") o.oldRoot = path.resolve(value());
    else if (a === "--only" && o.command === "rederive") o.only.push(...value().split(",").map((s) => s.trim()).filter(Boolean));
    else if (a === "--write" && o.command === "rederive") o.write = true;
    else throw new UsageError(`unknown option ${a} for ${o.command}`);
  }
  return o;
}

function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`provenance: ${e.message}`);
    console.error("usage: node tools/provenance.js check|verify [--root <dir>]");
    console.error("       node tools/provenance.js rederive [--old-root <dir>] [--only <path>]... [--write] [--root <dir>]");
    return 2;
  }
  if (o.command === "rederive") {
    if (o.oldRoot) process.env.S2C_OLD_ROOT = o.oldRoot; // the same old repos for every guard
    const r = rederive({ root: o.root, oldRoot: o.oldRoot || undefined, only: o.only, write: o.write });
    for (const x of r.results) {
      const how = x.status === "written" ? "written" : x.status === "reproduced" ? "ok" : "FAILED";
      console.log(`${how.padEnd(7)} ${x.path} ${x.sha256 ? short(x.sha256) : "-".repeat(16)} (${x.sources.join(" + ")}, ${x.edits} edit${x.edits === 1 ? "" : "s"})`);
    }
    for (const p of r.problems) console.log(`problem: ${p}`);
    const done = r.results.filter((x) => x.status === (o.write ? "written" : "reproduced")).length;
    console.log(`provenance rederive: ${r.pins} pins from ${r.repos} old repositories, ${done} ${o.write ? "written" : "reproduced byte for byte"}, ${r.problems.length} problems`);
    return r.problems.length ? 1 : 0;
  }
  const r = check({ root: o.root });
  for (const p of r.problems) console.log(`problem: ${p}`);
  console.log(`provenance check: ${r.pins} pins, ${r.problems.length} problems`);
  return r.problems.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { loadPins, validatePins, check, rederive, derive, pinnedFiles, sentinelProblems, splitLines, joinLines, PIN_LIST };
