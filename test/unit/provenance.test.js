// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// tools/provenance.js and the pin list (contract check C15). The real pin list must check clean
// and, where the old repositories are present, re-derive byte for byte. The tool itself is tested
// on a synthetic tree whose "old repository" is a git repository made in a temporary directory.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const TOOL = path.join(REPO, "tools", "provenance.js");
const prov = require(TOOL);
const priv = require(path.join(REPO, "test", "lib", "private.js"));

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-provenance-"));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const SPDX = "// SPDX-License-Identifier: Apache-2.0\n// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>\n";

// ---------------------------------------------------------------- the real pin list

test("the pin list checks clean: sha256, sentinels, placements and frozen heads", () => {
  const r = prov.check({ root: REPO });
  assert.deepEqual(r.problems, []);
  const paths = prov.loadPins(REPO).map((p) => p.path);
  for (const p of ["core/export.js", "core/layout.js", "core/xlsx.js", "vendor/pdf.min.js", "vendor/pdf.worker.min.js", "LICENSE",
    "test/legacy/export-A.js", "test/legacy/export-B.js", "test/legacy/export-C.js", "test/legacy/layout-L1.js", "test/legacy/layout-L3.js",
    "test/legacy/zip-old.js", "test/legacy/storage-old.js"]) assert.ok(paths.includes(p), `${p} is pinned`);
  assert.ok(prov.pinnedFiles({ root: REPO }).every((f) => f.matches));
});

const oldRepos = () => [...new Set(prov.loadPins(REPO).flatMap((p) => (p.parts ? p.parts.filter((x) => typeof x !== "string") : [p]).map((x) => x.from.repo)))];
const missingOld = () => oldRepos().filter((r) => !fs.existsSync(path.join(priv.oldRoot(), r, ".git")));

test("every pinned file re-derives byte for byte from git (skipped without the old repositories)", { skip: missingOld().length ? `old repositories not under <old-root>: ${missingOld().length}` : false }, () => {
  const r = prov.rederive({ root: REPO, oldRoot: priv.oldRoot() });
  assert.deepEqual(r.problems, []);
  assert.equal(r.results.length, prov.loadPins(REPO).length);
  assert.ok(r.results.every((x) => x.status === "reproduced"));
});

// ---------------------------------------------------------------- lines

test("splitLines and joinLines are exact inverses on bytes", () => {
  for (const s of ["", "\n", "a", "a\n", "a\nb", "a\r\nb\n", "\uFEFFa\n\n", "\n\n"]) {
    const buf = Buffer.from(s, "utf8");
    assert.ok(prov.joinLines(prov.splitLines(buf)).equals(buf), JSON.stringify(s));
  }
  assert.deepEqual(prov.splitLines(Buffer.from("a\nb\n")).map(String), ["a", "b", ""]);
});

// ---------------------------------------------------------------- a synthetic tree

function git(dir, args) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith("GIT_")) env[k] = v;
  Object.assign(env, { GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_CEILING_DIRECTORIES: path.dirname(dir) });
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t", "-c", "commit.gpgsign=false", "-C", dir, ...args], { env, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
}

let treeCount = 0;
// A tree with providers/x/frozen.js naming the old repository <old>/legacy-x, which holds
// src/a.js (a line with a literal U+FEFF) and src/b.bin (no final newline) in one commit.
function makeTree() {
  const base = path.join(TMP, `t${++treeCount}`);
  const root = path.join(base, "repo");
  const oldRoot = path.join(base, "old");
  const repo = path.join(oldRoot, "legacy-x");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  const a = Buffer.from(`${SPDX}const x = 1; // first\nconst bom = /^\uFEFF/;\nmodule.exports = { x, bom };\n`, "utf8");
  const b = Buffer.from("binary-ish\u0000data\nlast line without newline", "utf8");
  fs.writeFileSync(path.join(repo, "src", "a.js"), a);
  fs.writeFileSync(path.join(repo, "src", "b.bin"), b);
  git(repo, ["init", "-q"]);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "x"]);
  const head = git(repo, ["rev-parse", "HEAD"]);
  fs.mkdirSync(path.join(root, "providers", "x"), { recursive: true });
  fs.mkdirSync(path.join(root, "test", "contract"), { recursive: true });
  fs.writeFileSync(path.join(root, "providers", "x", "frozen.js"), `${SPDX}module.exports = ${JSON.stringify({ legacyRepo: "legacy-x", legacyHead: head })};\n`);
  const from = (p, buf) => ({ repo: "legacy-x", head, path: p, sha256: sha256(buf) });
  const pins = [
    { path: "lib/a.js", from: from("src/a.js", a), edits: [{ line: 3, old: "const x = 1; // first", new: "const x = 1; // edited" }],
      sha256: "0".repeat(64), sentinels: [{ line: 4, contains: "\uFEFF" }] },
    { path: "b.bin", from: from("src/b.bin", b), edits: [], sha256: sha256(b) },
    { path: "lib/part.js", parts: ["// header", { from: from("src/a.js", a), lines: [3, 4], edits: [{ line: 4, old: "const bom = /^\uFEFF/;", new: "const bom = 0;" }] }, "// end"],
      sha256: "0".repeat(64) },
  ];
  const writePins = (list) => fs.writeFileSync(path.join(root, "test", "contract", "provenance.js"), `${SPDX}module.exports = ${JSON.stringify(list, null, 2)};\n`);
  writePins(pins);
  return { root, oldRoot, repo, head, a, b, pins, writePins };
}

// Writes the files from git, records their sha256 values: a clean tree.
function cleanTree() {
  const t = makeTree();
  const w = prov.rederive({ root: t.root, oldRoot: t.oldRoot, write: true });
  assert.equal(w.results.filter((x) => x.status === "written").length, 3);
  for (const x of w.results) t.pins.find((p) => p.path === x.path).sha256 = x.sha256;
  t.writePins(t.pins);
  return t;
}

test("rederive --write creates each file from its blob; check and rederive then pass", () => {
  const t = makeTree();
  assert.deepEqual(prov.check({ root: t.root }).problems, ["lib/a.js: missing", "b.bin: missing", "lib/part.js: missing"]);
  const w = prov.rederive({ root: t.root, oldRoot: t.oldRoot, write: true });
  assert.equal(w.problems.length, 2); // the two placeholder sha256 values
  assert.match(w.problems[0], /^lib\/a\.js: written; record its sha256 [0-9a-f]{64} in the pin/);
  const read = (p) => fs.readFileSync(path.join(t.root, p));
  assert.equal(read("lib/a.js").toString(), t.a.toString().replace("// first", "// edited"));
  assert.ok(read("b.bin").equals(t.b));
  assert.equal(read("lib/part.js").toString(), "// header\nconst x = 1; // first\nconst bom = 0;\n// end\n");
  const c = cleanTree();
  assert.deepEqual(prov.check({ root: c.root }).problems, []);
  const r = prov.rederive({ root: c.root, oldRoot: c.oldRoot });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.results.map((x) => x.status), ["reproduced", "reproduced", "reproduced"]);
  assert.equal(r.repos, 1);
  assert.deepEqual(prov.rederive({ root: c.root, oldRoot: c.oldRoot, only: ["b.bin", "nope"] }).problems, ["--only nope: not in the pin list"]);
});

test("check catches a changed byte, a lost sentinel, a moved line and a non-file; rederive names the line", () => {
  const t = cleanTree();
  const file = path.join(t.root, "lib", "a.js");
  const good = fs.readFileSync(file);
  fs.writeFileSync(file, Buffer.from(good.toString().replace("module.exports", "module.exports ")));
  assert.match(prov.check({ root: t.root }).problems.join("\n"), /^lib\/a\.js: sha256 is [0-9a-f]{64}, its pin says/);
  assert.match(prov.rederive({ root: t.root, oldRoot: t.oldRoot }).problems.join("\n"), /lib\/a\.js: differs from its re-derivation from line 5/);
  // A file whose sha256 was re-recorded after a hand edit still fails on its sentinel and placements.
  const noBom = Buffer.from(good.toString().replace("\uFEFF", "").replace("const x = 1; // edited\n", "\nconst x = 1; // edited"));
  fs.writeFileSync(file, noBom);
  t.pins[0].sha256 = sha256(noBom);
  t.writePins(t.pins);
  const problems = prov.check({ root: t.root }).problems;
  assert.ok(problems.includes("lib/a.js: sentinel: line 4 must contain \"\\uFEFF\""), problems.join("\n"));
  assert.ok(problems.includes("lib/a.js: line 3 is not the edited line its pin declares"), problems.join("\n"));
  fs.rmSync(file);
  fs.symlinkSync(path.join(t.root, "b.bin"), file);
  assert.ok(prov.check({ root: t.root }).problems.includes("lib/a.js: not a regular file"));
});

test("rederive refuses a wrong old text, a line past the end, a wrong blob hash and a missing repository", () => {
  const t = cleanTree();
  const variants = [
    [(p) => { p[0].edits[0].old = "const x = 2; // first"; }, /lib\/a\.js: line 3 of legacy-x@[0-9a-f]{12}:src\/a\.js is not the declared old text/],
    [(p) => { p[0].edits = [{ line: 9, old: "x", new: "y" }]; }, /lib\/a\.js: legacy-x@[0-9a-f]{12}:src\/a\.js has 5 lines; no line 9 to edit/],
    [(p) => { p[2].parts[1].lines = [4, 6]; p[2].parts[1].edits = []; }, /lib\/part\.js: legacy-x@[0-9a-f]{12}:src\/a\.js has 5 lines; no lines 4-6/],
    [(p) => { p[1].from.sha256 = "1".repeat(64); }, /b\.bin: blob legacy-x@[0-9a-f]{12}:src\/b\.bin has sha256 [0-9a-f]{64}, its pin says 1{64}/],
  ];
  for (const [mutate, want] of variants) {
    const pins = structuredClone(t.pins);
    mutate(pins);
    t.writePins(pins);
    assert.match(prov.rederive({ root: t.root, oldRoot: t.oldRoot }).problems.join("\n"), want);
  }
  t.writePins(t.pins);
  assert.match(prov.rederive({ root: t.root, oldRoot: path.join(t.oldRoot, "elsewhere") }).problems.join("\n"), /<old-root>\/legacy-x does not exist/);
});

test("validatePins rejects malformed pins and heads that are not the frozen legacyHead", () => {
  const t = cleanTree();
  const base = structuredClone(t.pins);
  const cases = [
    [(p) => { p[0].from.head = "a".repeat(40); }, /lib\/a\.js: head a{40} is not the frozen legacyHead [0-9a-f]{40} of legacy-x/],
    [(p) => { p[0].from.repo = "other-repo"; }, /no providers\/\*\/frozen\.js has legacyRepo other-repo/],
    [(p) => { p.push(structuredClone(p[1])); }, /b\.bin: pinned twice/],
    [(p) => { p[1].path = "../b.bin"; }, /path must be a relative/],
    [(p) => { p[1].path = "/abs/b.bin"; }, /path must be a relative/],
    [(p) => { p[1].path = "test/contract/provenance.js"; }, /the pin list cannot pin itself/],
    [(p) => { p[1].sha256 = "ABC"; }, /sha256 must be 64 hex digits/],
    [(p) => { p[1].extra = 1; }, /unknown key "extra"/],
    [(p) => { delete p[1].edits; }, /missing edits/],
    [(p) => { p[0].edits.push({ line: 2, old: "a", new: "b" }); }, /lines must be in ascending order/],
    [(p) => { p[0].edits[0].new = p[0].edits[0].old; }, /old and new are the same/],
    [(p) => { p[0].edits[0].new = "two\nlines"; }, /without "\\n"/],
    [(p) => { p[0].sentinels = [{ line: 0, contains: "" }]; }, /line must be an integer >= 1[\s\S]*contains must be a non-empty string/],
    [(p) => { p[2].parts[1].edits[0].line = 7; }, /line 7 is outside lines 3-4/],
    [(p) => { p[2].parts.push("two\nlines"); }, /a literal line cannot hold/],
    [(p) => { p[2].from = p[1].from; }, /a pin has either from and edits, or parts/],
  ];
  for (const [mutate, want] of cases) {
    const pins = structuredClone(base);
    mutate(pins);
    assert.match(prov.validatePins(pins, { root: t.root }).join("\n"), want);
  }
  assert.deepEqual(prov.validatePins({}, { root: t.root }), ["test/contract/provenance.js: module.exports must be an array of pins"]);
  // A verbatim copy must carry its blob's sha256 (checkable without the old repository).
  const pins = structuredClone(base);
  pins[1].from.sha256 = "2".repeat(64);
  t.writePins(pins);
  assert.ok(prov.check({ root: t.root }).problems.includes("b.bin: a verbatim copy must have its blob's sha256"));
});

test("--write never writes into an old repository", () => {
  const t = cleanTree();
  // The old root is the tree itself, so a pin path can point into the old repository.
  const repoInTree = path.join(t.root, "legacy-x");
  fs.renameSync(t.repo, repoInTree);
  const pins = [{ ...structuredClone(t.pins[1]), path: "legacy-x/src/b.bin" }];
  t.writePins(pins);
  const before = fs.readFileSync(path.join(repoInTree, "src", "b.bin"));
  const r = prov.rederive({ root: t.root, oldRoot: t.root, write: true });
  assert.deepEqual(r.problems, ["legacy-x/src/b.bin: refusing to write outside this repository or into an old repository"]);
  assert.ok(fs.readFileSync(path.join(repoInTree, "src", "b.bin")).equals(before));
});

test("the CLI: exit 0 when clean, 1 with problems, 2 on usage errors; counts and hashes only", () => {
  const t = cleanTree();
  const run = (...args) => spawnSync(process.execPath, [TOOL, ...args], { encoding: "utf8" });
  let r = run("check", "--root", t.root);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.stdout, "provenance check: 3 pins, 0 problems\n");
  assert.equal(run("verify", "--root", t.root).status, 0);
  r = run("rederive", "--root", t.root, "--old-root", t.oldRoot);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^ok {6}lib\/a\.js [0-9a-f]{16} \(legacy-x@[0-9a-f]{12}:src\/a\.js, 1 edit\)$/m);
  assert.match(r.stdout, /provenance rederive: 3 pins from 1 old repositories, 3 reproduced byte for byte, 0 problems\n$/);
  assert.ok(!r.stdout.includes(t.oldRoot) && !r.stdout.includes(os.tmpdir()), "no machine path on the console");
  fs.appendFileSync(path.join(t.root, "b.bin"), "x");
  assert.equal(run("check", "--root", t.root).status, 1);
  r = run("rederive", "--root", t.root, "--old-root", path.join(t.oldRoot, "elsewhere"));
  assert.equal(r.status, 1);
  assert.ok(!r.stdout.includes(t.oldRoot), "a git failure is reported without the path");
  assert.equal(run("bogus").status, 2);
  assert.equal(run("check", "--write").status, 2);
  assert.equal(run("rederive", "--only").status, 2);
});
