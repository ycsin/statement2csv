// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Read-only integrity checks of the old repos (docs/TESTING.md, baseline integrity):
//   - git plumbing only: `rev-parse HEAD` and `cat-file blob`, always run as
//     GIT_OPTIONAL_LOCKS=0 git --no-optional-locks -C <repo> ... (never status or diff);
//   - a file manifest taken with lstat (symlinks recorded, never followed), compared
//     before and after a run, so "nothing was written" is a checked fact;
//   - the sha256 of the page users actually load (the frozen legacyUrl).
// Nothing here writes anywhere. No provider is named here: every fact comes from the
// frozen.js objects passed in.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const LIVE_TIMEOUT_MS = 30000;
const MAX_REDIRECTS = 10;

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// <old-root>: $S2C_OLD_ROOT, else the home directory. A CLI's --old-root is passed in
// by the caller as { oldRoot }.
function defaultOldRoot() {
  return process.env.S2C_OLD_ROOT || os.homedir();
}

function firstLine(err) {
  const text = String((err && err.stderr && err.stderr.length ? err.stderr : err && err.message) || err);
  return text.split("\n").find((l) => l.trim()) || text;
}

// The only way this module runs git. Every inherited GIT_* variable is dropped (a
// GIT_DIR or GIT_INDEX_FILE from a hook must not redirect us), optional locks are off,
// and discovery may not climb above the repo's parent directory.
function git(repoDir, args) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  env.GIT_OPTIONAL_LOCKS = "0";
  env.GIT_CEILING_DIRECTORIES = path.dirname(path.resolve(repoDir));
  return execFileSync("git", ["--no-optional-locks", "-C", repoDir, ...args], {
    env,
    maxBuffer: 1 << 30,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function repoDirOf(frozen, oldRoot) {
  return path.join(oldRoot, frozen.legacyRepo);
}

// checkGit(frozen, {oldRoot, files}) -> string[] problems.
//   1. `rev-parse HEAD` equals frozen.legacyHead;
//   2. sha256(index.html) equals frozen.legacyIndexSha256 and the blob at legacyHead;
//   3. every extra repo-relative path in `files` equals its blob at legacyHead.
function checkGit(frozen, { oldRoot = defaultOldRoot(), files = [] } = {}) {
  const problems = [];
  if (!frozen || !frozen.legacyRepo) return ["frozen object has no legacyRepo"];
  const repo = frozen.legacyRepo;
  const dir = repoDirOf(frozen, oldRoot);
  let head;
  try {
    head = git(dir, ["rev-parse", "HEAD"]).toString("utf8").trim();
  } catch (e) {
    return [`${repo}: git rev-parse HEAD failed: ${firstLine(e)}`];
  }
  if (head !== frozen.legacyHead) {
    problems.push(`${repo}: HEAD is ${head}, frozen legacyHead is ${frozen.legacyHead}`);
  }
  const rels = ["index.html", ...files.filter((f) => f !== "index.html")];
  for (const rel of rels) {
    let disk = null;
    let blob = null;
    try {
      disk = sha256(fs.readFileSync(path.join(dir, rel)));
    } catch (e) {
      problems.push(`${repo}: cannot read ${rel}: ${e.code || e.message}`);
    }
    try {
      blob = sha256(git(dir, ["cat-file", "blob", `${frozen.legacyHead}:${rel}`]));
    } catch (e) {
      problems.push(`${repo}: git cat-file blob ${frozen.legacyHead}:${rel} failed: ${firstLine(e)}`);
    }
    if (disk && blob && disk !== blob) {
      problems.push(`${repo}: ${rel} on disk (${disk}) differs from its blob at legacyHead (${blob})`);
    }
    if (rel === "index.html") {
      if (disk && disk !== frozen.legacyIndexSha256) {
        problems.push(`${repo}: sha256(index.html) is ${disk}, frozen legacyIndexSha256 is ${frozen.legacyIndexSha256}`);
      }
      if (blob && blob !== frozen.legacyIndexSha256) {
        problems.push(`${repo}: sha256 of the index.html blob is ${blob}, frozen legacyIndexSha256 is ${frozen.legacyIndexSha256}`);
      }
    }
  }
  return problems;
}

function isUnderGitObjects(rel) {
  return rel.startsWith(".git/objects/");
}

// fsManifest(dir) -> Map<path, {type, size, mtimeMs, sha256?, link?}>.
// Paths are relative to `dir` with "/" separators, "." being `dir` itself, in code-point
// order. Every entry is recorded with lstat; regular files get their sha256, symlinks
// their target (never followed). `.git/objects` is recorded as a directory, but its
// contents (`.git/objects/**`) are not walked.
function fsManifest(dir) {
  const root = path.resolve(dir);
  const out = new Map();
  const record = (rel, abs) => {
    const st = fs.lstatSync(abs);
    let entry;
    if (st.isSymbolicLink()) {
      entry = { type: "symlink", size: st.size, mtimeMs: st.mtimeMs, link: fs.readlinkSync(abs) };
    } else if (st.isFile()) {
      entry = { type: "file", size: st.size, mtimeMs: st.mtimeMs, sha256: sha256(fs.readFileSync(abs)) };
    } else if (st.isDirectory()) {
      entry = { type: "dir", size: st.size, mtimeMs: st.mtimeMs };
    } else {
      entry = { type: "other", size: st.size, mtimeMs: st.mtimeMs };
    }
    out.set(rel, entry);
    return entry;
  };
  const walk = (rel, abs) => {
    const entry = record(rel, abs);
    if (entry.type !== "dir" || rel === ".git/objects") return;
    const names = fs.readdirSync(abs).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (const name of names) {
      const childRel = rel === "." ? name : `${rel}/${name}`;
      if (isUnderGitObjects(childRel)) continue;
      walk(childRel, path.join(abs, name));
    }
  };
  walk(".", root);
  return out;
}

const FIELDS = ["type", "size", "mtimeMs", "sha256", "link"];

// diffManifest(before, after) -> string[]: one line per added, removed or changed entry
// (a symlink whose target changed is reported as retargeted), in path order.
function diffManifest(before, after) {
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const out = [];
  for (const p of paths) {
    const a = before.get(p);
    const b = after.get(p);
    if (!b) {
      out.push(`removed: ${p}`);
      continue;
    }
    if (!a) {
      out.push(`added: ${p}`);
      continue;
    }
    if (a.type === "symlink" && b.type === "symlink" && a.link !== b.link) {
      out.push(`retargeted: ${p} (${a.link} -> ${b.link})`);
      continue;
    }
    const changed = FIELDS.filter((f) => a[f] !== b[f]);
    if (changed.length) out.push(`changed: ${p} (${changed.join(", ")})`);
  }
  return out;
}

// liveSha256(url) -> Promise<string>: GET with redirects followed and no compression
// requested (curl -fsSL). Every request uses a fresh connection (no keep-alive pool, so a
// socket the server already closed is never reused). Any network error, non-2xx status or
// timeout rejects; a failure is never a pass.
function liveSha256(url) {
  return new Promise((resolve, reject) => {
    const get = (target, left) => {
      let u;
      try {
        u = new URL(target);
      } catch (e) {
        reject(new Error(`bad URL ${target}`));
        return;
      }
      const mod = u.protocol === "https:" ? https : u.protocol === "http:" ? http : null;
      if (!mod) {
        reject(new Error(`unsupported protocol in ${target}`));
        return;
      }
      const req = mod.get(u, { headers: { "Accept-Encoding": "identity" }, agent: false }, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (left <= 0) {
            reject(new Error(`too many redirects from ${url}`));
            return;
          }
          get(new URL(res.headers.location, u).toString(), left - 1);
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status} for ${target}`));
          return;
        }
        const hash = crypto.createHash("sha256");
        res.on("data", (chunk) => hash.update(chunk));
        res.on("end", () => resolve(hash.digest("hex")));
        res.on("error", reject);
      });
      req.setTimeout(LIVE_TIMEOUT_MS, () => req.destroy(new Error(`timeout after ${LIVE_TIMEOUT_MS} ms for ${target}`)));
      req.on("error", reject);
    };
    get(url, MAX_REDIRECTS);
  });
}

function frozenList(frozens) {
  if (Array.isArray(frozens)) return frozens;
  if (frozens instanceof Map) return [...frozens.values()];
  return Object.values(frozens || {});
}

// before(frozens, {live}) -> Promise<{problems, manifests}>. For every frozen object
// with legacyRepo: the file manifest first (so a write by any later step is caught by
// after()), then the git checks, then the live page (unless live === false, which is
// for offline debugging only and never for a gate). `manifests` is a Map from the
// repo's absolute directory to its manifest; pass it to after(). Options may also
// carry { oldRoot } (a CLI's --old-root).
async function before(frozens, { live = true, oldRoot = defaultOldRoot() } = {}) {
  const problems = [];
  const manifests = new Map();
  for (const frozen of frozenList(frozens)) {
    if (!frozen || !frozen.legacyRepo) continue;
    const dir = repoDirOf(frozen, oldRoot);
    try {
      manifests.set(dir, fsManifest(dir));
    } catch (e) {
      problems.push(`${frozen.legacyRepo}: file manifest failed: ${e.code || e.message}`);
      continue;
    }
    problems.push(...checkGit(frozen, { oldRoot }));
    if (live) {
      try {
        const got = await liveSha256(frozen.legacyUrl);
        if (got !== frozen.legacyIndexSha256) {
          problems.push(`${frozen.legacyRepo}: live page ${frozen.legacyUrl} has sha256 ${got}, frozen legacyIndexSha256 is ${frozen.legacyIndexSha256}`);
        }
      } catch (e) {
        problems.push(`${frozen.legacyRepo}: live page ${frozen.legacyUrl} could not be fetched: ${e.message}`);
      }
    }
  }
  return { problems, manifests };
}

// after(manifests) -> string[]: walks every repo again and reports each difference
// from its `before` manifest, naming the repo and the path.
function after(manifests) {
  const problems = [];
  for (const [dir, was] of manifests) {
    const name = path.basename(dir);
    let now;
    try {
      now = fsManifest(dir);
    } catch (e) {
      problems.push(`${name}: file manifest failed: ${e.code || e.message}`);
      continue;
    }
    for (const line of diffManifest(was, now)) problems.push(`${name}: ${line}`);
  }
  return problems;
}

module.exports = { checkGit, fsManifest, diffManifest, liveSha256, before, after };
