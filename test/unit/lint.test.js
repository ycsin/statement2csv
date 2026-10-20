// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The lints (test/lint/): for every rule and every exemption, a sample that must fail and one
// that must pass, each in a small tree written to a temporary directory. Every failing sample is
// put together at run time (home paths, addresses, numbers, invisible characters, the copyright
// name), so this file passes the lints it tests.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const files = require("../lint/files.js");
const headers = require("../lint/headers.js");
const privacy = require("../lint/privacy.js");
const generic = require("../lint/generic.js");
const sinks = require("../lint/sinks.js");
const sentinels = require("../lint/sentinels.js");
const invisible = require("../lint/invisible.js");
const { runLints } = require("../lint/run.js");

const { COPYRIGHT, SPDX_ID } = files;
const SPDX = `// ${SPDX_ID}\n// ${COPYRIGHT}\n`;
const HASH = `# ${SPDX_ID}\n# ${COPYRIGHT}\n`;
const HTML = `<!-- ${SPDX_ID} -->\n<!-- ${COPYRIGHT} -->\n`;
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const ch = (cp) => String.fromCodePoint(cp);

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-lint-"));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
let n = 0;
// A tree with the given files; returns its root.
function tree(content) {
  const root = path.join(TMP, `t${++n}`);
  for (const [rel, text] of Object.entries(content)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  fs.mkdirSync(root, { recursive: true });
  return root;
}
const listed = (root) => files.listFiles(root).files;
const rules = (findings) => findings.map((f) => `${f.file}:${f.rule}`);

// The pieces of the copyright line, taken apart at run time.
const NAME = COPYRIGHT.slice("Copyright 2026 ".length, COPYRIGHT.indexOf(" <"));
const ADDRESS = COPYRIGHT.slice(COPYRIGHT.indexOf("<") + 1, COPYRIGHT.indexOf(">"));
const at = "@";
const slash = "/";

// ---------------------------------------------------------------- the file list

test("files: the git list holds tracked and untracked files but not ignored ones; a walk skips .git and node_modules", () => {
  const root = tree({ ".gitignore": `${HASH}*.csv\nout/\n`, "a.js": SPDX, "b.js": SPDX, "x.csv": "a,b\n", "out/o.js": SPDX, "node_modules/m/i.js": SPDX });
  assert.deepEqual(files.listFiles(root), { files: [".gitignore", "a.js", "b.js", "x.csv"], source: "walk" }, "without git: every file but .git/, node_modules/ and out/");
  assert.equal(files.trackedFiles(root), null);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_"))), GIT_CEILING_DIRECTORIES: path.dirname(root) };
  const git = (...a) => execFileSync("git", ["-c", "user.name=lint", "-c", "user.email=lint", "-c", "commit.gpgsign=false", "-C", root, ...a], { env, stdio: "pipe" });
  git("init", "-q");
  git("add", "a.js", ".gitignore");
  git("commit", "-q", "-m", "x");
  fs.rmSync(path.join(root, "a.js"));
  assert.deepEqual(files.listFiles(root), { files: [".gitignore", "b.js", "node_modules/m/i.js"], source: "git" }, "deleted files are left out, ignored ones too");
  assert.deepEqual([...files.trackedFiles(root)].sort(), [".gitignore", "a.js"]);
  fs.writeFileSync(path.join(root, ".gitignore"), `${HASH}*.csv\nout/\nnode_modules/\n`);
  assert.deepEqual(files.listFiles(root).files, [".gitignore", "b.js"]);
});

test("files: privateList reads the untracked list only when it exists", () => {
  const dir = tree({ "list.txt": "first entry\n\nsecond\n" });
  const before = process.env.S2C_TEST_LIST;
  process.env.S2C_TEST_LIST = path.join(dir, "list.txt");
  try {
    assert.deepEqual(files.privateList("S2C_TEST_LIST", "unused.txt"), ["first entry", "second"]);
    process.env.S2C_TEST_LIST = path.join(dir, "missing.txt");
    assert.equal(files.privateList("S2C_TEST_LIST", "unused.txt"), null);
  } finally {
    if (before === undefined) delete process.env.S2C_TEST_LIST;
    else process.env.S2C_TEST_LIST = before;
  }
});

// ---------------------------------------------------------------- headers (C17)

test("headers: each comment syntax, with a failing and a passing sample", () => {
  const ok = {
    "a.js": `${SPDX}x();\n`,
    "tool.js": `#!/usr/bin/env node\n${SPDX}x();\n`,
    "w.yml": `${HASH}on: push\n`,
    ".gitignore": `${HASH}out/\n`,
    "s.css": `/* ${SPDX_ID} */\n/* ${COPYRIGHT} */\nbody {}\n`,
    "b.css": `/*\n * ${SPDX_ID}\n * ${COPYRIGHT}\n */\nbody {}\n`,
    "p.html": HTML + "<li>x</li>\n",
    "q.html": `<!doctype html>\n<!--\n  ${SPDX_ID}\n  ${COPYRIGHT}\n{{noticeLine}}-->\n<html></html>\n`,
    "r.html": `<!DOCTYPE html>\n${HTML}<html></html>\n`,
    "d.md": `${HTML}\n# Title\n`,
  };
  const bad = {
    "a.js": `// ${SPDX_ID}\nx();\n`,
    "c.js": `${SPDX.replace("2026", "2025")}x();\n`,
    "w.yml": `${SPDX}on: push\n`,
    ".editorconfig": "root = true\n",
    "s.css": `body {}\n/* ${SPDX_ID} */\n`,
    "p.html": `<p>${SPDX_ID}</p>\n`,
    "q.html": `<!--\n  ${SPDX_ID}\n  ${COPYRIGHT}\n`,
    "d.md": `# Title\n${HTML}`,
    "notes.txt": "plain text\n",
  };
  const rootOk = tree(ok), rootBad = tree(bad);
  assert.deepEqual(headers.check(rootOk, { files: listed(rootOk) }), []);
  assert.deepEqual(rules(headers.check(rootBad, { files: listed(rootBad) })).sort(), Object.keys(bad).map((f) => `${f}:header`).sort());
  assert.match(headers.headerProblem("notes.txt", "x"), /no SPDX header rule/);
});

test("headers: vendor/, dist/, LICENSE, NOTICE and the package files are exempt; nothing else is", () => {
  const root = tree({ "vendor/v.js": "x\n", "dist/a/index.html": "<html>\n", LICENSE: "Apache\n", NOTICE: "n\n", "package.json": "{}\n",
    "test/package.json": "{}\n", "test/package-lock.json": "{}\n", "providers/x/package.json": "{}\n" });
  assert.deepEqual(rules(headers.check(root, { files: listed(root) })), ["providers/x/package.json:header"]);
});

// ---------------------------------------------------------------- privacy

test("privacy rule home: Linux, macOS, Windows and tilde paths fail; placeholders pass", () => {
  const bad = {
    "a.md": `${HTML}see ${slash}home${slash}someone${slash}x\n`,
    "b.js": `${SPDX}const p = "${slash}Users${slash}someone";\n`,
    "c.js": `${SPDX}const p = "C:\\${"Users"}\\someone";\n`,
    "d.md": `${HTML}run ~${slash}.cache${slash}x\n`,
  };
  const root = tree(bad);
  assert.deepEqual(rules(privacy.check(root, { files: listed(root), denylist: null })), ["a.md:home", "b.js:home", "c.js:home", "d.md:home"]);
  const good = tree({ "a.md": `${HTML}the folder <old-root>/<repo> and <private-dir>; home${slash}work; a ~ b\n` });
  assert.deepEqual(privacy.check(good, { files: listed(good), denylist: null }), []);
});

test("privacy rule email, and the SPDX copyright exemption: only the exact copyright line may hold the address", () => {
  const root = tree({
    "a.js": `${SPDX}// ${COPYRIGHT}\n`,
    "b.js": `${SPDX}// mail ${ADDRESS}\n`,
    "c.js": `${SPDX}// someone${at}example.org\n`,
    "d.js": `${SPDX}// Copyright 2025 ${NAME} <${ADDRESS}>\n`,
    "e.js": `${SPDX}const scope = "@playwright/test"; const v = "pkg${at}1.57.0";\n`,
  });
  assert.deepEqual(rules(privacy.check(root, { files: listed(root), denylist: null })), ["b.js:email", "c.js:email", "d.js:email"]);
});

test("privacy rule number: both account-number formats fail; pinned files (intact) and dist/ are exempt from it", () => {
  const num1 = ["123", "4567890", "1"].join("-"), num2 = ["123456", "654321"].join("-");
  const pinnedText = `${SPDX}// e.g. ${num1}\n`;
  const root = tree({
    "a.js": `${SPDX}// ${num1}\n`,
    "b.md": `${HTML}id ${num2}\n`,
    "c.js": `${SPDX}// 2026-10-16 and 1234-5678-9 and 12345-123456\n`,
    "lib/pinned.js": pinnedText,
    "lib/changed.js": pinnedText,
    "dist/p/index.html": `<p>${num1}</p>\n`,
    "test/contract/provenance.js": `${SPDX}module.exports = ${JSON.stringify([{ path: "lib/pinned.js", sha256: sha256(pinnedText) }, { path: "lib/changed.js", sha256: "0".repeat(64) }])};\n`,
  });
  assert.deepEqual(rules(privacy.check(root, { files: listed(root), denylist: null })), ["a.js:number", "b.md:number", "lib/changed.js:number"]);
});

test("privacy rule denylist: case-insensitive substrings fail, named by number only; the copyright line is exempt; no list, no rule", () => {
  const root = tree({
    "a.md": `${HTML}Written by ${NAME.toUpperCase()}.\n`,
    "b.js": `${SPDX}// ${COPYRIGHT}\n`,
    "c.js": `${SPDX}// account ZZTOP-SECRET\n`,
    "vendor/v.js": `x ${NAME}\n`,
  });
  const found = privacy.check(root, { files: listed(root), denylist: [NAME, "zztop-secret"] });
  assert.deepEqual(rules(found), ["a.md:denylist", "c.js:denylist"]);
  assert.deepEqual(found.map((f) => f.message), ["matches entry 1 of the untracked denylist", "matches entry 2 of the untracked denylist"]);
  for (const f of found) assert.ok(!f.message.toLowerCase().includes("zztop"), "a finding never quotes the entry");
  assert.deepEqual(privacy.check(root, { files: listed(root), denylist: null }), []);
  const env = process.env.S2C_DENYLIST;
  process.env.S2C_DENYLIST = path.join(tree({ "deny.txt": "zztop-secret\n" }), "deny.txt");
  try {
    assert.deepEqual(rules(privacy.check(root, { files: listed(root) })), ["c.js:denylist"], "read from $S2C_DENYLIST");
  } finally {
    if (env === undefined) delete process.env.S2C_DENYLIST;
    else process.env.S2C_DENYLIST = env;
  }
});

test("privacy: a binary or non-UTF-8 file fails (outside vendor/)", () => {
  const root = tree({ "a.bin": Buffer.from([0x61, 0x00, 0x62]), "b.txt": Buffer.from([0x61, 0xff, 0x0a]), "vendor/w.js": Buffer.from([0x00]) });
  assert.deepEqual(rules(privacy.check(root, { files: listed(root), denylist: null })), ["a.bin:text", "b.txt:text"]);
});

// ---------------------------------------------------------------- generic

function providerTree(extra = {}) {
  return tree({
    "providers/acme/provider.js": `${SPDX}module.exports = { contract: 1, id: "acme", name: "Acme Savings", naming: { accountPrefix: "AcmeCo ", brand: "AcmeBrand" } };\n`,
    "providers/acme/frozen.js": `${SPDX}module.exports = { naming: { brand: "AcmeBrand", accountPrefix: "AcmeCo " }, legacyRepo: "acme2csv" };\n`,
    "providers/_skel/provider.js": `${SPDX}module.exports = { contract: 1, id: "skel", name: "Example Bank" };\n`,
    ...extra,
  });
}

test("generic rule provider-name: name, brand, trimmed prefix and legacyRepo fail in shared code and tests, as whole words", () => {
  const root = providerTree({
    "core/a.js": `${SPDX}// for Acme Savings\n`,
    "build/b.js": `${SPDX}// AcmeBrand files\n`,
    "tools/c.js": `${SPDX}// prefix AcmeCo\n`,
    "test/d.js": `${SPDX}// from acme2csv\n`,
    "README.md": `${HTML}AcmeBrand\n`,
    ".github/workflows/ci.yml": `${HASH}# acme2csv\n`,
  });
  assert.deepEqual(rules(generic.check(root, { files: listed(root), apps: null })).sort(),
    ["build/b.js:provider-name", "core/a.js:provider-name", "test/d.js:provider-name", "tools/c.js:provider-name", "README.md:provider-name", ".github/workflows/ci.yml:provider-name"].sort());
});

test("generic rule provider-name passes: ids, other words, skeleton placeholders, and the exempt places", () => {
  const root = providerTree({
    "core/a.js": `${SPDX}// the acme folder; AcmeBrandX and xAcmeCo; Acme savings; Example Bank\n`,
    "test/legacy/l.js": `${SPDX}// copied from acme2csv\n`,
    "test/contract/provenance.js": `${SPDX}module.exports = []; // acme2csv\n`,
    "docs/X.md": `${HTML}AcmeBrand, as an example\n`,
    "providers/acme/page.html": `${HTML}<template data-slot="h1">Acme Savings</template>\n`,
    "dist/acme/index.html": "<h1>Acme Savings</h1>\n",
  });
  assert.deepEqual(generic.check(root, { files: listed(root), apps: null }), []);
});

test("generic rule app-name: the old QIF wording and app-list entries fail in pages and docs, not elsewhere", () => {
  const old = ["Quick", "en"].join("");
  const root = providerTree({
    "docs/A.md": `${HTML}a ${old} Interchange Format file\n`,
    "core/page/partials/p.html": `${HTML}<li>${old.toUpperCase()}</li>\n`,
    "providers/acme/page.html": `${HTML}<template data-slot="h1">Import into Moneyapp</template>\n`,
    "providers/acme/README.md": `${HTML}Moneyapp\n`,
    "dist/acme/index.html": "<p>Moneyapp</p>\n",
    "NOTICE": "Moneyapp\n",
    "README.md": `${HTML}fine\n`,
    "test/golden/w.js": `${SPDX}// ${old}\n`,
    "test/legacy/l.js": `${SPDX}// ${old} Interchange Format\n`,
    "docs/B.md": `${HTML}moneyapp in lower case, Moneyapps as another word, ${old}ed\n`,
  });
  const found = generic.check(root, { files: listed(root), apps: ["Moneyapp"] });
  assert.deepEqual(rules(found).sort(), ["NOTICE:app-name", "core/page/partials/p.html:app-name", "dist/acme/index.html:app-name", "docs/A.md:app-name",
    "providers/acme/README.md:app-name", "providers/acme/page.html:app-name"].sort());
  assert.ok(found.every((f) => !f.message.includes("Moneyapp")), "an app-list entry is never quoted");
});

// ---------------------------------------------------------------- sinks

test("sinks rule banned: every banned API fails in core/ and providers/, not in comments or strings, not outside the scope", () => {
  const calls = ["eval(x)", "new Function(\"x\")", "fetch(u)", "new XMLHttpRequest()", "new WebSocket(u)", "navigator.sendBeacon(u)", "importScripts(u)",
    "document.write(x)", "el.insertAdjacentHTML(\"x\", y)", "el.outerHTML = x", "Date.now()", "Math.random()"];
  const content = {};
  calls.forEach((c, i) => {
    content[`core/m${i}.js`] = `${SPDX}${c};\n`;
  });
  content["providers/p/parser.js"] = `${SPDX}const t = Date.now();\n`;
  content["core/ok.js"] = `${SPDX}// eval(x) fetch(u) Date.now()\nconst s = "Math.random() new Function";\nconst re = /importScripts/;\nconst t = \`document.write(\${a})\`;\nprefetch(u); el.outerHTMLx === x;\n`;
  content["test/x.js"] = `${SPDX}Date.now();\n`;
  content["build/y.js"] = `${SPDX}Math.random();\n`;
  const root = tree(content);
  const found = sinks.check(root, { files: listed(root) });
  assert.deepEqual(rules(found).sort(), [...calls.map((c, i) => `core/m${i}.js:banned`), "providers/p/parser.js:banned"].sort());
});

test("sinks rule clock: an argument-less new Date() only inside zip() in core/zip.js", () => {
  const root = tree({
    "core/zip.js": `${SPDX}function zipParts(files, now) { return [now]; }\nfunction zip(files) {\n  return zipParts(files, new Date());\n}\nconst t = new Date();\n`,
    "core/a.js": `${SPDX}const t = new Date ( );\nconst u = new Date(0), v = new Date(\`\${m}-01T00:00:00\`);\n`,
  });
  const found = sinks.check(root, { files: listed(root) });
  assert.deepEqual(found.map((f) => `${f.file}:${f.line}:${f.rule}`), ["core/a.js:3:clock", "core/zip.js:7:clock"]);
});

test("sinks rule innerHTML: only inside setHtml in core/escape.js, and a read counts", () => {
  const root = tree({
    "core/escape.js": `${SPDX}function setHtml(el, h) {\n  el.innerHTML = h.s;\n}\nfunction other(el) { el.innerHTML = "x"; }\n`,
    "providers/p/app.js": `${SPDX}el.innerHTML += x; if (el.innerHTML == y) {}\n`,
  });
  const found = sinks.check(root, { files: listed(root) });
  assert.deepEqual(found.map((f) => `${f.file}:${f.line}:${f.col}:${f.rule}`), ["core/escape.js:6:25:innerHTML", "providers/p/app.js:3:4:innerHTML", "providers/p/app.js:3:27:innerHTML"]);
});

test("sinks rule localeCompare: fewer than two arguments fail in core/assemble.js and non-legacy providers only", () => {
  const body = `${SPDX}a.sort((x, y) => x.localeCompare(y));\nb.sort((x, y) => x.localeCompare(y, "en"));\nc.localeCompare();\nd.localeCompare(f(x, y));\n`;
  const root = tree({
    "core/assemble.js": body,
    "core/export.js": body,
    "providers/fresh/parser.js": body,
    "providers/old/parser.js": body,
    "providers/old/frozen.js": `${SPDX}module.exports = { legacyRepo: "old2csv" };\n`,
  });
  const found = sinks.check(root, { files: listed(root) });
  assert.deepEqual(found.map((f) => `${f.file}:${f.line}`), ["core/assemble.js:3", "core/assemble.js:5", "core/assemble.js:6", "providers/fresh/parser.js:3",
    "providers/fresh/parser.js:5", "providers/fresh/parser.js:6"]);
  assert.equal(sinks.argCount("f(a, [b, c], { d, e })", 1), 3);
});

test("sinks rule compose: Object.assign({}, StatementExport, …) only in the statement app and custom app scripts", () => {
  const line = `${SPDX}const P = Object.assign({}, self.StatementExport, self.X);\n`;
  const root = tree({
    "core/app/statement-app.js": line,
    "providers/c/provider.js": `${SPDX}module.exports = { app: "custom", appScript: "main.js" };\n`,
    "providers/c/main.js": line,
    "providers/c/app.js": line,
    "providers/s/provider.js": `${SPDX}module.exports = { inputs: ["csv"] };\n`,
    "providers/s/app.js": line,
    "core/files.js": `${SPDX}const P = Object.assign({}, window.StatementExport);\n`,
  });
  const found = sinks.check(root, { files: listed(root) });
  assert.deepEqual(rules(found), ["core/files.js:compose", "providers/c/app.js:compose", "providers/s/app.js:compose"]);
});

test("sinks rule banned: the markup parsers, the other clock and random sources, and outerHTML by another route", () => {
  const calls = ["el.setHTMLUnsafe(s)", "Document.parseHTMLUnsafe(s)", "document.createRange().createContextualFragment(s)", "new DOMParser().parseFromString(s, t)",
    "performance.now()", "crypto.getRandomValues(a)", "self.crypto.randomUUID()", "Object.assign(el, { outerHTML: s })", "el[\"outerHTML\"] = s", "el['outerHTML'] = s",
    "Reflect.set(el, `outerHTML`, s)"];
  const content = {};
  calls.forEach((c, i) => {
    content[`core/m${i}.js`] = `${SPDX}${c};\n`;
  });
  content["core/ok.js"] = `${SPDX}// el.setHTMLUnsafe(s); el["outerHTML"] = s\nconst a = "parseFromString performance.now()";\nconst b = 'the outerHTML';\nconst c = el.outerHTMLx, d = el?.xouterHTML;\nconst e = { text: "outerHTML is not set here" };\n`;
  const root = tree(content);
  const found = sinks.check(root, { files: listed(root) });
  assert.deepEqual(rules(found).sort(), calls.map((c, i) => `core/m${i}.js:banned`).sort());
  assert.ok(found.every((f) => !f.reportOnly), "banned findings count now");
});

test("sinks rule clock: Date() called without new and new Date without parentheses read the clock too", () => {
  const root = tree({
    "core/a.js": `${SPDX}const s = Date();\nconst t = new Date;\nconst u = (new Date).getTime();\nconst v = new Date\n;\n`,
    "core/b.js": `${SPDX}const a = new Date(0), b = Date.UTC(2026, 0, 2), c = Date.parse(s);\nif (x instanceof Date || typeof Date === "function") y.Date(1);\nconst d = new Date(s), e = { Date: 1 };\n`,
    "core/zip.js": `${SPDX}function zip(files) {\n  return zipParts(files, new Date);\n}\n`,
  });
  const found = sinks.check(root, { files: listed(root) });
  assert.deepEqual(found.map((f) => `${f.file}:${f.line}:${f.rule}`), ["core/a.js:3:clock", "core/a.js:4:clock", "core/a.js:5:clock", "core/a.js:6:clock"]);
  assert.match(found[0].message, /Date\(\) called without new/);
  assert.match(found[1].message, /new Date without arguments/);
});

test("sinks rule innerHTML: an object key, a bare name or a string literal (a computed key) counts as an assignment; comments and strings do not", () => {
  const writes = ["Object.assign(el, { innerHTML: s })", "Object.assign(el, { innerHTML })", "el[\"innerHTML\"] = s", "el['innerHTML'] = s", "el[`innerHTML`] = s",
    "Reflect.set(el, \"innerHTML\", s)", "const k = \"innerHTML\"; el[k] = s"];
  const content = {};
  writes.forEach((w, i) => {
    content[`providers/p/w${i}.js`] = `${SPDX}${w};\n`;
  });
  content["providers/p/ok.js"] = `${SPDX}// el["innerHTML"] = s; Object.assign(el, { innerHTML: s })\nconst a = "set the innerHTML here", b = el.innerHTMLx, c = el?.myinnerHTML;\nconst re = /"innerHTML"/;\nconst t = \`no "innerHTML" here\`;\n`;
  content["core/escape.js"] = `${SPDX}function setHtml(el, h) {\n  Object.assign(el, { innerHTML: h.s });\n}\n`;
  const root = tree(content);
  const found = sinks.check(root, { files: listed(root) });
  assert.deepEqual(rules(found).sort(), writes.map((w, i) => `providers/p/w${i}.js:innerHTML`).sort());
  assert.ok(found.every((f) => !f.reportOnly), "innerHTML findings count since M8");
  assert.deepEqual(sinks.stringKeys("x[\"innerHTML\"]; // \"innerHTML\"\nconst s = 'a \"innerHTML\" b';", ["innerHTML"]).map((k) => k.index), [2], "only the real string token");
});

test("sinks rule localeCompare: an undefined, void or empty locale, and Intl.Collator without a locale, fail where code-point order is required", () => {
  const body = `${SPDX}a.localeCompare(b, undefined);\na.localeCompare(b, void 0, { numeric: true });\na.localeCompare(b, []);\nconst c1 = new Intl.Collator();\nconst c2 = Intl.Collator(undefined, { sensitivity: "base" });\nconst c3 = new Intl.Collator;\nconst c4 = new Intl.Collator([]).compare;\na.localeCompare("b");\na.localeCompare(b,);\n`
    + `a.localeCompare(b, "en");\na.localeCompare(b, ["en"]);\nconst k1 = new Intl.Collator("en"), k2 = Intl.Collator(["en"], {}), k3 = Intl.Collator.supportedLocalesOf(["en"]);\na.localeCompare(b, locale);\n`;
  const root = tree({
    "providers/fresh/parser.js": body,
    "providers/old/parser.js": body,
    "providers/old/frozen.js": `${SPDX}module.exports = { legacyRepo: "old2csv" };\n`,
    "core/assemble.js": body,
    "core/export.js": body,
  });
  const found = sinks.check(root, { files: listed(root) });
  const lines = [3, 4, 5, 6, 7, 8, 9, 10, 11];
  assert.deepEqual(found.map((f) => `${f.file}:${f.line}`), [...lines.map((l) => `core/assemble.js:${l}`), ...lines.map((l) => `providers/fresh/parser.js:${l}`)]);
  assert.match(found.find((f) => f.line === 6).message, /Intl\.Collator without a locale/);
  assert.equal(sinks.argCount("f(\"en\")", 1, "f(\"en\")"), 1, "a string argument counts");
  assert.equal(sinks.argCount("f(    )", 1, "f(\"en\")"), 1, "also when blanked");
  assert.equal(sinks.argCount("f(a, )", 1), 1, "a trailing comma adds none");
});

// Each sample in a file of its own; returns the rules found per sample, in sample order.
function perSample(samples, { dir = "core", extra = {} } = {}) {
  const content = { ...extra };
  samples.forEach((code, i) => {
    content[`${dir}/s${i}.js`] = `${SPDX}${code}\n`;
  });
  const root = tree(content);
  const found = sinks.check(root, { files: listed(root) });
  return samples.map((code, i) => ({ code, rules: found.filter((f) => f.file === `${dir}/s${i}.js`).map((f) => f.rule) }));
}
const caught = (rows, rule) => rows.filter((r) => !r.rules.includes(rule)).map((r) => r.code);
const clean = (rows) => rows.filter((r) => r.rules.length).map((r) => `${r.code} [${r.rules.join(",")}]`);

test("sinks rule innerHTML and banned outerHTML: every member access counts, reads, logical assignments, destructuring and for-of targets included", () => {
  const forms = (p) => [`el.${p} ||= s`, `el.${p} &&= s`, `el.${p} ??= s`, `[el.${p}] = [s]`, `({ x: el.${p} } = o)`, `for (el.${p} of [s]);`, `const t = el.${p}`,
    `const t = el?.${p}`, `el\n  .${p} = s`, `class X { set ${p}(v) {} }`];
  assert.deepEqual(caught(perSample(forms("innerHTML"), { dir: "providers/p" }), "innerHTML"), []);
  assert.deepEqual(caught(perSample(forms("outerHTML")), "banned"), []);
  // setHtml's own assignment, and prose, are not uses.
  const ok = perSample(["// el.innerHTML ||= s; [el.outerHTML] = [s]", "const t = \"read el.innerHTML\", u = `the outerHTML of ${x}`;", "const innerHTMLx = 1, myouterHTML = 2;"],
    { extra: { "core/escape.js": `${SPDX}function setHtml(el, h) {\n  [el.innerHTML] = [h.s];\n}\n` } });
  assert.deepEqual(clean(ok), []);
  const root = tree({ "core/escape.js": `${SPDX}function setHtml(el, h) {\n  [el.innerHTML] = [h.s];\n}\n` });
  assert.deepEqual(sinks.check(root, { files: listed(root) }), [], "inside setHtml every form is the sink itself");
});

test("sinks rule escape: an identifier written with a \\u escape fails; escapes in strings, templates, regexes and comments do not", () => {
  const bad = ["el.inner\\u0048TML = s", "el.inner\\u{48}TML = s", "const \\u0061b = 1", "self.ev\\u0061l(s)"];
  const rows = perSample(bad);
  assert.deepEqual(caught(rows, "escape"), []);
  assert.ok(rows.every((r) => r.rules.every((x) => x === "escape")), "the escape alone: the lint cannot read the name it spells");
  assert.deepEqual(clean(perSample(["const s = \"\\u0041\\x42\", t = `\\u{43}`;", "const re = /[\\u0000-\\u001f]/g;", "// el.inner\\u0048TML = s"])), []);
});

test("sinks: a constant string is read as JavaScript reads it (every escape decoded, literals joined by + folded)", () => {
  const keys = ["el[\"inner\\x48TML\"] = s", "el['inner\\u0048TML'] = s", "el[\"inner\\u{48}TML\"] = s", "el[\"inner\\HTML\"] = s", "el[\"inner\\\nHTML\"] = s",
    "el[`inner\\x48TML`] = s", "el[\"inner\\110TML\"] = s", "el[\"inner\" + \"HTML\"] = s", "el[(\"inner\") + (\"HT\" + \"ML\")] = s", "el[\"in\" + `nerHTML`] = s",
    "el[\"inner\" /* a */ +\n \"HTML\"] = s", "el[String.raw`innerHTML`] = s"];
  assert.deepEqual(caught(perSample(keys, { dir: "providers/p" }), "innerHTML"), []);
  // Out of a lint's reach, as its header says: a name put together at run time.
  assert.deepEqual(clean(perSample(["el[\"inner\" + x + \"HTML\"] = s", "el[[\"inner\", \"HTML\"].join(\"\")] = s", "el[`inner${\"HTML\"}`] = s"], { dir: "providers/p" })), []);
  assert.equal(sinks.decode("a\\x41\\u0042\\u{43}\\104\\0\\8\\q\\\nz"), "aABCD\u00008qz");
  assert.equal(sinks.decode("\\101\\477\\0"), "A'7\u0000", "an octal escape takes three digits up to \\377, else two");
  assert.equal(sinks.decode("a\r\nb\\x4", { template: true }), null, "an invalid escape");
  assert.equal(sinks.decode("a\r\nb\rc", { template: true }), "a\nb\nc", "a template reads CR and CRLF as LF");
  assert.deepEqual(sinks.literals("f(\"a\", `b${c}d`, `e`, /f\"/)").map((l) => [l.kind, l.foldable, l.values]),
    [["string", true, ["a"]], ["template", false, ["b"]], ["template", false, ["d"]], ["template", true, ["e"]]]);
  assert.deepEqual(sinks.stringKeys("x[\"inner\" + 'HTML'] = 1; y[`outer\\x48TML`];", ["innerHTML", "outerHTML"]).map((k) => [k.index, k.name]), [[2, "innerHTML"], [27, "outerHTML"]]);
});

test("sinks rule banned: every banned name in any form, a member, a name, a key or a constant string; the global Function too", () => {
  const forms = [
    "const d = document; d.write(s)", "document.writeln(s)", "const { write } = document", "document[\"write\"](s)", "document[\"wr\" + \"ite\"](s)",
    "(0, eval)(s)", "const e = eval", "self[\"eval\"](s)", "self[\"ev\\x61l\"](s)",
    "Function(\"return 1\")()", "const F = Function", "self[\"Function\"](s)",
    "document.execCommand(\"insertHTML\", false, s)", "document[\"execCommand\"](\"insertHTML\", false, s)", "frame.srcdoc = s", "frame.setAttribute(\"srcdoc\", s)",
    "el.setHTML(s)", "el[\"insertAdjacentHTML\"](\"beforeend\", s)", "el[\"setHTMLUnsafe\"](s)", "const a = document.createAttribute(\"onclick\")", "el.setAttributeNode(a)",
    "el.setAttributeNodeNS(a)", "document.createAttributeNS(null, \"onclick\")", "self[\"fetch\"](u)", "const { fetch } = self", "new self[\"WebSocket\"](u)",
    "const b = navigator.sendBeacon", "crypto[\"getRandomValues\"](a)", "const u = crypto.randomUUID",
  ];
  assert.deepEqual(caught(perSample(forms), "banned"), []);
  assert.deepEqual(clean(perSample(["fs.writeFileSync(p, s)", "const writer = 1, evaluate = 2, fetched = 3", "const t = \"write the file\", u = \"evalu\" + \"ate\"",
    "if (typeof f === \"function\") x.Function = 1", "const o = { Functional: 1 }"])), []);
});

test("sinks rule banned: setAttribute and setAttributeNS only when called with a constant name that is not an event handler's", () => {
  const bad = ["el.setAttribute(\"onclick\", s)", "el.setAttribute(\"ONCLICK\", s)", "el.setAttribute(\"on\" + \"click\", s)", "el.setAttribute(\"o\\x6eclick\", s)",
    "el.setAttribute(name, s)", "el.setAttribute(`on${x}`, s)", "el.setAttribute(f(), s)", "el.setAttribute()", "el.setAttributeNS(null, \"onload\", s)",
    "el.setAttributeNS(null, n, s)", "el[\"setAttribute\"](\"onclick\", s)", "const f = el.setAttribute; f.call(el, \"onclick\", s)", "el.setAttribute.call(el, \"onclick\", s)"];
  assert.deepEqual(caught(perSample(bad), "banned"), []);
  assert.deepEqual(clean(perSample(["b.setAttribute(\"aria-checked\", String(on))", "b.setAttribute(`aria-checked`, v)", "el.setAttributeNS(null, \"class\", c)",
    "el.setAttribute(\"data-\" + \"x\", v)", "el.setAttribute((\"role\"), \"button\")", "el.setAttribute(\"title\", \"on\" + s)"])), []);
});

test("sinks rule banned: setTimeout and setInterval with a string to run", () => {
  assert.deepEqual(caught(perSample(["setTimeout(\"x()\", 0)", "window.setInterval(`x()`, 9)", "setTimeout((\"x()\"), 0)", "self.setTimeout('a' + b, 0)"]), "banned"), []);
  assert.deepEqual(clean(perSample(["setTimeout(() => URL.revokeObjectURL(url), 1000)", "setTimeout(f, 0)", "setInterval(function () { tick(\"x\"); }, 5)", "clearTimeout(t)"])), []);
});

test("sinks: since M8 every rule fails the run, innerHTML included (REPORT_ONLY is empty); a report-only finding would be a note", () => {
  assert.deepEqual([...sinks.REPORT_ONLY], [], "M8 emptied REPORT_ONLY");
  const sink = tree({ "core/a.js": `${SPDX}el.innerHTML = x;\n` });
  const r = runLints(sink, { only: ["sinks"] });
  assert.equal(r.results[0].findings.length, 1);
  assert.deepEqual(r.results[0].failing.map((f) => f.rule), ["innerHTML"], "an innerHTML assignment counts");
  assert.equal(r.failed, true);
  assert.equal(runLints(sink, { only: ["sinks"], enforceSinks: true }).failed, true, "--enforce-sinks changes nothing now");
  // The note path of the runner, for a rule staged that way again: a finding marked reportOnly
  // is listed but does not fail, unless --enforce-sinks.
  const check = sinks.check;
  sinks.check = (...a) => check(...a).map((f) => ({ ...f, reportOnly: true }));
  try {
    const note = runLints(sink, { only: ["sinks"] });
    assert.deepEqual([note.failed, note.results[0].findings.length, note.results[0].failing.length], [false, 1, 0], "a report-only finding is a note");
    assert.equal(runLints(sink, { only: ["sinks"], enforceSinks: true }).failed, true);
  } finally {
    sinks.check = check;
  }
  const samples = {
    banned: `${SPDX}fetch(u);\n`,
    clock: `${SPDX}const t = new Date();\n`,
    compose: `${SPDX}const P = Object.assign({}, self.StatementExport, self.X);\n`,
    innerHTML: `${SPDX}document.body.innerHTML = s;\n`,
    escape: `${SPDX}document.body.inner\\u0048TML = s;\n`,
    tokenize: `${SPDX}const s = "unterminated;\n`,
  };
  for (const [rule, text] of Object.entries(samples)) {
    const t = tree({ "core/m.js": text });
    const x = runLints(t, { only: ["sinks"] });
    assert.deepEqual(x.results[0].failing.map((f) => f.rule), [rule], `${rule} counts now`);
    assert.equal(x.failed, true, `${rule} fails the run`);
  }
  const lc = tree({ "providers/fresh/parser.js": `${SPDX}a.sort((x, y) => x.localeCompare(y));\n` });
  assert.equal(runLints(lc, { only: ["sinks"] }).failed, true, "localeCompare counts now");
});

// ---------------------------------------------------------------- pin sentinels

// JSON with every character outside printable ASCII written as an escape, as the real pin list
// writes its sentinel.
const asciiJson = (v) => [...JSON.stringify(v)].map((c) => {
  const cp = c.codePointAt(0);
  if (cp <= 0x7e) return c;
  const units = cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)] : [cp];
  return units.map((u) => `\\u${u.toString(16).padStart(4, "0")}`).join("");
}).join("");

function sentinelTree(fileText, sentinel) {
  const pins = [{ path: "lib/p.js", sha256: sha256(fileText), sentinels: [sentinel] }];
  return tree({ "lib/p.js": fileText, "test/contract/provenance.js": `${SPDX}module.exports = ${asciiJson(pins)};\n` });
}

test("sentinels: a declared sentinel present passes; missing, or the line gone, fails with its own message", () => {
  const mark = ch(0xfeff);
  const text = `${SPDX}const re = /^${mark}/;\n`;
  assert.deepEqual(sentinels.check(sentinelTree(text, { line: 3, contains: mark })), []);
  const gone = sentinels.check(sentinelTree(`${SPDX}const re = /^/;\n`, { line: 3, contains: mark }));
  assert.deepEqual(gone.map((f) => `${f.file}:${f.line}:${f.rule}`), ["lib/p.js:3:sentinel"]);
  assert.match(gone[0].message, /sentinel: line 3 must contain "\\uFEFF"/);
  assert.equal(sentinels.check(sentinelTree(text, { line: 9, contains: mark })).length, 1);
  assert.deepEqual(sentinels.check(tree({ "a.js": SPDX })), [], "no pin list, nothing to check");
});

// ---------------------------------------------------------------- invisible characters

test("invisible: literal invisible characters fail anywhere; escapes, tabs and visible non-ASCII pass", () => {
  const bad = [0x200b, 0x00a0, 0x2028, 0x202e, 0xfeff, 0xfffd, 0xfe0f, 0x0007, 0x000d, 0xe000, 0xfffe, 0xe0041];
  const content = { "ok.js": `${SPDX}const s = "\\u200B \\uFEFF";\n\tconst q = "“quotes” — dash ×";\n` };
  bad.forEach((cp, i) => {
    content[`test/b${i}.js`] = `${SPDX}const s = "a${ch(cp)}b";\n`;
  });
  const root = tree(content);
  const found = invisible.check(root, { files: listed(root) });
  assert.deepEqual(found.map((f) => f.file).sort(), bad.map((_, i) => `test/b${i}.js`).sort());
  assert.ok(found.every((f) => f.line === 3 && f.col === 13), "line and column of the character");
  assert.match(found.find((f) => f.file === "test/b0.js").message, /U\+200B/);
});

test("invisible: vendor/ and dist/ are exempt; a pinned sentinel is allowed only on its line, only while the file matches its pin", () => {
  const mark = ch(0xfeff);
  const text = `${SPDX}const re = /^${mark}/;\nconst x = "${mark}";\n`;
  const root = sentinelTree(text, { line: 3, contains: mark });
  fs.mkdirSync(path.join(root, "vendor"), { recursive: true });
  fs.writeFileSync(path.join(root, "vendor", "w.js"), `x${ch(0x0003)}\n`);
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", "index.html"), `x${mark}\n`);
  assert.deepEqual(invisible.check(root, { files: listed(root) }).map((f) => `${f.file}:${f.line}`), ["lib/p.js:4"], "line 4 is not the sentinel line");
  fs.appendFileSync(path.join(root, "lib", "p.js"), "// changed\n");
  assert.deepEqual(invisible.check(root, { files: listed(root) }).map((f) => `${f.file}:${f.line}`), ["lib/p.js:3", "lib/p.js:4"], "no allowance once the file differs from its pin");
});

// ---------------------------------------------------------------- the runner, and this repository

test("run.js: findings fail the run; the exit status and the output name no private text", () => {
  const root = tree({ "a.js": `${SPDX}x();\n`, "b.js": "no header\n" });
  const r = runLints(root, {});
  assert.equal(r.failed, true);
  assert.deepEqual(r.results.find((x) => x.name === "headers").findings.map((f) => f.file), ["b.js"]);
  const clean = tree({ "a.js": `${SPDX}x();\n` });
  assert.equal(runLints(clean, { denylist: null, apps: null }).failed, false);
});

test("the lint files hold no literal match of their own rules (the patterns are written with escapes)", () => {
  const dir = path.join(REPO, "test", "lint");
  const names = fs.readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => `test/lint/${f}`);
  assert.deepEqual(privacy.check(REPO, { files: [...names, "test/unit/lint.test.js"], denylist: null, pinned: new Set() }), []);
  assert.deepEqual(invisible.check(REPO, { files: [...names, "test/unit/lint.test.js"] }), []);
  assert.deepEqual(headers.check(REPO, { files: [...names, "test/unit/lint.test.js"] }), []);
});
