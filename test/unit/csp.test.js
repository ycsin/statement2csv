// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// build/csp.js: the two policy modes, the landing policy, and verify(html, plan) and
// verifyLanding(html), which re-parse a written page and must catch every way it can go wrong,
// also when policy() itself is at fault (build/csp.js compiled with a faulty policy()). The
// browser parts open hash-mode pages of a stub tree in the pinned chrome-headless-shell: a page
// that verifies runs every script, with its style applied and no CSP violation, and each hash
// defect verify reports is a violation that Chrome reports too; and the markup check reads
// tags as Chrome's parser does (no attribute it misses). They are skipped, with a message,
// without Chrome.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { pathToFileURL } = require("url");
const CSP = require("../../build/csp.js");
const { buildPage, buildLanding } = require("../../build/build.js");
const { discover } = require("../../build/discover.js");
const browserLib = require("../lib/browser.js");
const capture = require("../lib/capture.js");
const { makeStubTree } = require("./stub-tree.js");

const CHROME_READY = fs.existsSync(browserLib.chromePath());
const NO_CHROME = !CHROME_READY && "the pinned chrome-headless-shell is not installed";
const sha = (t) => `'sha256-${crypto.createHash("sha256").update(t, "utf8").digest("base64")}'`;
const META = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(">)/;
// The page with its policy rewritten by fn.
const editPolicy = (html, fn) => html.replace(META, (_, a, c, b) => a + fn(c) + b);
const policyOf = (html) => META.exec(html)[2];
const withTree = (fn) => async () => {
  const t = makeStubTree();
  try {
    return await fn(t);
  } finally {
    t.cleanup();
  }
};

test("the defaults: hash mode, with the style hashed (migration step M10)", () => {
  assert.equal(CSP.DEFAULT_CSP_MODE, "hash");
  assert.equal(CSP.STYLE_POLICY, "hash");
  const pieces = [{ kind: "exec", text: "a()" }];
  assert.equal(CSP.policy(pieces, { pdf: true, styleText: "S" }), CSP.policy(pieces, { pdf: true, mode: "hash", styleText: "S", stylePolicy: "hash" }));
  assert.equal(CSP.landingPolicy({ styleText: "S" }), `default-src 'none'; style-src ${sha("S")}`);
  assert.throws(() => CSP.policy(pieces, { pdf: true, stylePolicy: "unsafe_inline" }), /unknown style policy "unsafe_inline"/);
  assert.throws(() => CSP.landingPolicy({ stylePolicy: "none" }), /unknown style policy/);
});

test("legacy mode: the exact old policy strings", () => {
  assert.equal(CSP.policy([], { pdf: true, mode: "legacy" }),
    "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src blob: data:");
  assert.equal(CSP.policy([], { pdf: false, mode: "legacy" }),
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src blob: data:");
  assert.equal(CSP.landingPolicy({ mode: "legacy" }), "default-src 'none'; style-src 'unsafe-inline'");
  assert.throws(() => CSP.policy([], { pdf: true, mode: "strict" }), /unknown CSP mode/);
});

test("hash mode: script hashes in plan order, duplicates removed, text pieces not hashed", () => {
  const pieces = [
    { kind: "exec", text: "a()" },
    { kind: "text", text: "worker" },
    { kind: "exec", text: "b()" },
    { kind: "exec", text: "a()" },
  ];
  assert.equal(CSP.hashSource("a()"), sha("a()"));
  const pdf = CSP.policy(pieces, { pdf: true, mode: "hash", styleText: "\nS\n" });
  assert.equal(pdf, `default-src 'none'; script-src ${sha("a()")} ${sha("b()")} blob:; worker-src blob:; style-src ${sha("\nS\n")}; img-src data: blob:; connect-src blob: data:; form-action 'none'; base-uri 'none'`);
  const other = CSP.policy(pieces, { pdf: false, mode: "hash", styleText: "\nS\n" });
  assert.equal(other, `default-src 'none'; script-src ${sha("a()")} ${sha("b()")}; style-src ${sha("\nS\n")}; img-src data: blob:; connect-src blob: data:; form-action 'none'; base-uri 'none'`);
  assert.ok(!other.includes("worker"));
  assert.match(CSP.policy(pieces, { pdf: false, mode: "hash", stylePolicy: "unsafe-inline" }), /style-src 'unsafe-inline';/);
  assert.equal(CSP.landingPolicy({ mode: "hash", styleText: "x" }), `default-src 'none'; style-src ${sha("x")}`);
  assert.equal(CSP.landingPolicy({ mode: "hash", styleText: "x", stylePolicy: "unsafe-inline" }), "default-src 'none'; style-src 'unsafe-inline'");
});

// Builds the stub PDF page once per mode; the variants below break it in one way each.
function stubPage(mode) {
  const tree = makeStubTree();
  try {
    const entry = discover(tree.root).find((e) => e.id === "stub-pdf");
    const { html, plan } = buildPage(entry, { root: tree.root, mode });
    // keep the plan's sources readable after cleanup: inline them as code
    const frozenPlan = plan.map((p) => (p.code !== undefined ? p : { ...p, code: fs.readFileSync(p.path, "utf8"), path: undefined }));
    return { html, plan: frozenPlan };
  } finally {
    tree.cleanup();
  }
}

function swapScripts(html, i, j) {
  const re = /<script>[^]*?<\/script>/g;
  const all = html.match(re);
  const out = [...all];
  [out[i], out[j]] = [out[j], out[i]];
  let k = 0;
  return html.replace(re, () => out[k++]);
}

function moveCspAfterFirstScript(html) {
  const meta = /<meta http-equiv="Content-Security-Policy" content="[^"]*">\n/.exec(html)[0];
  const without = html.replace(meta, "");
  const end = without.indexOf("</script>") + "</script>".length;
  return `${without.slice(0, end)}\n${meta}${without.slice(end)}`;
}

function moveCspAfterStyle(html) {
  const meta = /<meta http-equiv="Content-Security-Policy" content="[^"]*">\n/.exec(html)[0];
  return html.replace(meta, "").replace("</style>\n", `</style>\n${meta}`);
}

function moveCspIntoBody(html) {
  const meta = /<meta http-equiv="Content-Security-Policy" content="[^"]*">\n/.exec(html)[0];
  return html.replace(meta, "").replace("<body>\n", `<body>\n${meta}`);
}

// The page with `markup` where <p id="busy" hidden> was.
const busy = (html, markup) => html.replace('<p id="busy" hidden>', markup);

// The cases every mode must catch, on a page built in that mode.
function commonCases(html) {
  return [
    ["inline handler", html.replace('<div id="drop" ', '<div id="drop" onclick="x()" '), /inline event handler/],
    ["a handler after a slash", busy(html, '<p id="busy"/onmouseover="x()" hidden>'), /inline event handler/],
    ["a handler after a quoted \">\"", busy(html, '<p id="busy" title="a>b" onmouseover="x()" hidden>'), /inline event handler/],
    ["a handler right after a quoted value", busy(html, '<p id="busy"onmouseover="x()" hidden>'), /inline event handler/],
    ["a handler after an unquoted value holding a quote", busy(html, '<p id=busy" onmouseover=x() hidden>'), /inline event handler/],
    ["an upper-case handler", busy(html, '<p id="busy" ONMOUSEOVER="x()" hidden>'), /inline event handler/],
    ["a handler after a comment that --!> ends", html.replace("<main>\n", '<main>\n<!-- note --!><p onclick="x()"></p>\n'), /inline event handler/],
    ["a handler after a <textarea> holding a quote", html.replace("<main>\n", '<main>\n<textarea><b title="</textarea><p onclick="x()">"></textarea>\n'), /inline event handler/],
    ["foreign content", html.replace("<main>\n", "<main>\n<svg></svg>\n"), /the page has a <svg> element: verify reads HTML content only/],
    ["missing script", html.replace(/<script>[^]*?<\/script>\n/, ""), /<script> elements, the plan/],
    ["extra script", html.replace("</body>", "<script>extra()</script>\n</body>"), /<script> elements, the plan/],
    ["reordered scripts", swapScripts(html, 2, 3), /text differs from its source/],
    ["one byte off", html.replace("StubPdfParser = factory", "StubPdfParser= factory"), /text differs from its source at offset/],
    ["second CSP meta", html.replace("<title>", '<meta http-equiv="Content-Security-Policy" content="default-src *">\n<title>'), /exactly one Content-Security-Policy meta/],
    ["CSP after a script", moveCspAfterFirstScript(html), /comes after a <script>/],
    ["CSP outside <head>", moveCspIntoBody(html), /not inside <head>, so the browser ignores it/],
    ["CSP after the <style>", moveCspAfterStyle(html), /comes after the <style>, so the policy does not govern it/],
    ["no default-src none", html.replace("default-src 'none'; ", ""), /lacks default-src 'none'/],
    ["remote source", html.replace("img-src data: blob:", "img-src https://example.com"), /http: or https: source/],
    ["a source dropped", html.replace("img-src data: blob:", "img-src data:"), /img-src is "data:", expected "data: blob:"/],
    ["a directive dropped", html.replace("; connect-src blob: data:", ""), /the policy lacks connect-src/],
    ["a directive added", editPolicy(html, (c) => `${c}; frame-src 'none'`), /the policy has frame-src, which it must not have/],
    ["a directive twice", editPolicy(html, (c) => `${c}; img-src *`), /the policy has img-src more than once/],
    ["no isEvalSupported", html.split("isEvalSupported: false").join("isEvalSupported: true"), /isEvalSupported: false is missing/],
    ["worker attributes", html.replace('type="text/plain" id="pdf-worker-src"', 'id="pdf-worker-src"'), /attributes/],
    ["a second <style>", html.replace("</head>", "<style>p { color: red; }</style>\n</head>"), /the page has 2 <style> elements, expected 1/],
    ["a carriage return", html.replace("<main>\n", "<main>\r\n"), /carriage return/],
    ["a NUL character", html.replace("<main>", "<main>\0"), /NUL character/],
    ["charset declared late", html.replace('<meta charset="utf-8">', `<!-- ${"x".repeat(CSP.PRESCAN_BYTES)} -->\n<meta charset="utf-8">`), /does not declare <meta charset="utf-8"> in its first 1024 bytes/],
    ["no charset", html.replace('<meta charset="utf-8">\n', ""), /does not declare <meta charset="utf-8">/],
  ];
}

for (const mode of ["legacy", "hash"]) {
  test(`verify (${mode}): a built page passes, and each defect is caught`, () => {
    const { html, plan } = stubPage(mode);
    assert.deepEqual(CSP.verify(html, plan, { mode }), []);
    const cases = commonCases(html);
    if (mode === "hash") {
      const csp = policyOf(html);
      const hashes = csp.match(/'sha256-[^']+'/g);
      const worker = /<script type="text\/plain" id="pdf-worker-src">([^]*?)<\/script>/.exec(html)[1];
      cases.push(
        ["style attribute", html.replace('<p id="busy" hidden>', '<p id="busy" style="color:red" hidden>'), /style attribute/],
        ["a style attribute after a slash", busy(html, '<p id="busy"/style="color:red" hidden>'), /hash mode: style attribute/],
        ["a style attribute after a quoted \">\"", busy(html, '<p id="busy" title="a>b" style="color:red" hidden>'), /hash mode: style attribute/],
        ["unhashed script", html.replace(/script-src 'sha256-[^']+' /, "script-src "), /script 1 \(vendor\/pdf\.min\.js\) is not listed in script-src/],
        ["unsafe-inline scripts", html.replace("script-src ", "script-src 'unsafe-inline' "), /allows 'unsafe-inline'/],
        ["style not hashed", html.replace(/style-src 'sha256-[^']+'/, "style-src 'none'"), /<style> is not listed/],
        ["a stale script hash", editPolicy(html, (c) => c.replace("script-src ", `script-src ${sha("gone()")} `)), /script-src lists 'sha256-[^']+', which is the hash of no script the page runs/],
        ["the worker text hashed", editPolicy(html, (c) => c.replace(" blob:;", ` ${sha(worker)} blob:;`)), /which is the hash of no script the page runs/],
        ["hashes reordered", editPolicy(html, (c) => c.replace(`${hashes[0]} ${hashes[1]}`, `${hashes[1]} ${hashes[0]}`)), /script-src lists its sources in another order/],
        ["a hash repeated", editPolicy(html, (c) => c.replace(hashes[0], `${hashes[0]} ${hashes[0]}`)), /script-src lists its sources in another order, or repeats one/],
        ["no blob: for pdf.js", editPolicy(html, (c) => c.replace(" blob:; worker-src", "; worker-src")), /script-src lacks blob:/],
        ["a source script-src must not have", editPolicy(html, (c) => c.replace(" blob:; worker-src", " blob: data:; worker-src")), /script-src allows data:, which the policy must not/],
        ["style edited after hashing", html.replace("<style>\n", "<style>\n "), /hash mode: the <style> is not listed in style-src/],
        ["the style hash of other text", editPolicy(html, (c) => c.replace(/style-src 'sha256-[^']+'/, `style-src ${sha("other")}`)), /style-src lists 'sha256-[^']+', which is the hash of no <style> the page has/],
        ["unsafe-inline style beside its hash", editPolicy(html, (c) => c.replace(/(style-src 'sha256-[^']+')/, "$1 'unsafe-inline'")), /style-src allows 'unsafe-inline', but the style policy is "hash"/],
        ["the legacy policy in hash mode", editPolicy(html, () => CSP.LEGACY_PDF), /the policy lacks form-action/],
      );
    } else {
      cases.push(
        ["a legacy source dropped", editPolicy(html, (c) => c.replace("script-src 'unsafe-inline' blob:", "script-src blob:")), /script-src is "blob:", expected "'unsafe-inline' blob:"/],
        ["a hash policy in legacy mode", editPolicy(html, () => CSP.policy([], { pdf: true, mode: "hash", styleText: "" })), /the policy has form-action, which it must not have/],
      );
    }
    for (const [name, bad, re] of cases) {
      assert.notEqual(bad, html, `${name}: the mutation applies`);
      const problems = CSP.verify(bad, plan, { mode });
      assert.ok(problems.some((p) => re.test(p)), `${name}: expected ${re}, got ${JSON.stringify(problems)}`);
    }
    // Text that only looks like an attribute is not one: the browser reads it as text or as a
    // value, and so does verify.
    for (const [name, ok] of [
      ["handler text in a quoted value", busy(html, '<p id="busy" title=" onclick=x() style=y" hidden>')],
      ["handler text in a <textarea>", html.replace("<main>\n", '<main>\n<textarea><p onclick="x()" style="y"></textarea>\n')],
      ["handler text in a comment", html.replace("<main>\n", '<main>\n<!-- <p onclick="x()" style="y"> -->\n')],
      ["handler text after a \"<\" and a space", html.replace("<main>\n", '<main>\n< p onclick="x()" style="y">\n')],
    ]) {
      assert.notEqual(ok, html, `${name}: the change applies`);
      assert.deepEqual(CSP.verify(ok, plan, { mode }), [], name);
    }
    assert.deepEqual(CSP.verify(html, plan, { mode: "strict" }), ['unknown CSP mode "strict" (legacy or hash)']);
  });
}

test("verify reports each defect once, where both of its readings of the policy see it", () => {
  const { html, plan } = stubPage("hash");
  const problems = CSP.verify(html.replace(/script-src 'sha256-[^']+' /, "script-src "), plan, { mode: "hash" });
  assert.deepEqual(problems.filter((p) => /is not listed in script-src/.test(p)), ["hash mode: script 1 (vendor/pdf.min.js) is not listed in script-src"]);
  assert.equal(new Set(problems).size, problems.length);
});

// build/csp.js compiled afresh, with every call of its policy() (verify's own included) going
// to fault(policy): what verify does when the build's policy() is wrong.
function withFaultyPolicy(fault) {
  const file = path.join(__dirname, "..", "..", "build", "csp.js");
  const source = fs.readFileSync(file, "utf8");
  const at = "\nmodule.exports = ";
  assert.equal(source.split(at).length, 2, "build/csp.js has one module.exports line");
  const fn = vm.compileFunction(source.replace(at, `\npolicy = (${fault})(policy);${at}`), ["exports", "require", "module", "__filename", "__dirname"], { filename: file });
  const m = { exports: {} };
  fn(m.exports, require, m, file, path.dirname(file));
  return m.exports;
}

test("hash mode: verify reads the listing from the page itself, so a fault in policy() fails it", () => {
  const { html, plan } = stubPage("hash");
  const pieces = plan.map((p) => ({ kind: p.kind, text: p.code }));
  const styleText = /<style>([^]*?)<\/style>/.exec(html)[1];
  const runtime = plan.findIndex((p) => p.label === "self.StatementProvider");
  assert.ok(runtime >= 0 && pieces[runtime].text.startsWith("self.StatementProvider = "));
  const faults = [
    ["drops the runtime object's hash", (policy) => (pieces, o) => policy(pieces.filter((p) => !p.text.startsWith("self.StatementProvider = ")), o),
      [new RegExp(`^hash mode: script ${runtime + 1} \\(self\\.StatementProvider\\) is not listed in script-src$`)]],
    ["drops the style hash", (policy) => (pieces, o) => policy(pieces, o).replace(/style-src 'sha256-[^']+'/, "style-src 'none'"),
      [/^hash mode: the <style> is not listed in style-src$/, /^style-src allows 'none', which the policy must not$/]],
    ["allows 'unsafe-inline' scripts", (policy) => (pieces, o) => policy(pieces, o).replace("script-src ", "script-src 'unsafe-inline' "),
      [/^hash mode: script-src allows 'unsafe-inline'$/]],
    ["hashes the worker text too", (policy) => (pieces, o) => policy(pieces.map((p) => ({ ...p, kind: "exec" })), o),
      [/^script-src lists 'sha256-[^']+', which is the hash of no script the page runs$/]],
    ["allows data: scripts", (policy) => (pieces, o) => policy(pieces, o).replace(" blob:;", " blob: data:;"),
      [/^script-src allows data:, which the policy must not$/]],
    ["adds 'unsafe-inline' beside the style hash", (policy) => (pieces, o) => policy(pieces, o).replace(/(style-src 'sha256-[^']+')/, "$1 'unsafe-inline'"),
      [/^style-src allows 'unsafe-inline', but the style policy is "hash"$/]],
  ];
  for (const [name, fault, want] of faults) {
    const faulty = withFaultyPolicy(fault);
    const bad = faulty.policy(pieces, { pdf: true, mode: "hash", styleText });
    assert.notEqual(bad, policyOf(html), `${name}: the fault changes the policy`);
    // The page as a build with the faulty policy() writes it: its policy is policy()'s.
    const page = editPolicy(html, () => bad);
    const problems = faulty.verify(page, plan, { mode: "hash" });
    assert.deepEqual(problems.map((p) => want.findIndex((re) => re.test(p))).sort(), want.map((_, i) => i), `${name}: got ${JSON.stringify(problems)}`);
    assert.ok(CSP.verify(page, plan, { mode: "hash" }).length, `${name}: the real verify refuses the page too`);
  }
});

test("the unsafe-inline style fallback: verify follows the style policy it is given", () => {
  const { html, plan } = stubPage("hash");
  const fallback = editPolicy(html, (c) => c.replace(/style-src 'sha256-[^']+'/, "style-src 'unsafe-inline'"));
  assert.deepEqual(CSP.verify(fallback, plan, { mode: "hash", stylePolicy: "unsafe-inline" }), []);
  assert.ok(CSP.verify(fallback, plan, { mode: "hash" }).some((p) => /style-src allows 'unsafe-inline', but the style policy is "hash"/.test(p)));
  assert.ok(CSP.verify(html, plan, { mode: "hash", stylePolicy: "unsafe-inline" }).some((p) => /style-src lacks 'unsafe-inline' \(the style policy is "unsafe-inline"\)/.test(p)));
  const styled = fallback.replace('<p id="busy" hidden>', '<p id="busy" style="color:red" hidden>');
  assert.ok(CSP.verify(styled, plan, { mode: "hash", stylePolicy: "unsafe-inline" }).some((p) => /hash mode: style attribute/.test(p)), "style attributes stay refused");
  assert.deepEqual(CSP.verify(html, plan, { mode: "hash", stylePolicy: "x" }), ['unknown style policy "x" (hash or unsafe-inline)']);
});

test("verify re-reads sources from disk: a piece changed after inlining is caught", withTree((t) => {
  const entry = discover(t.root).find((e) => e.id === "stub-csv");
  for (const mode of ["hash", "legacy"]) {
    const { html, plan } = buildPage(entry, { root: t.root, mode });
    assert.deepEqual(CSP.verify(html, plan, { mode }), [], mode);
  }
  const { html, plan } = buildPage(entry, { root: t.root });
  fs.appendFileSync(path.join(t.root, "core", "zip.js"), "// changed\n");
  assert.ok(CSP.verify(html, plan).some((p) => /core\/zip\.js\): text differs/.test(p)));
}));

test("verifyLanding: the landing page passes in both modes, and each defect is caught", withTree((t) => {
  const published = discover(t.root).filter((e) => !e.skeleton && e.D.publish);
  for (const mode of ["legacy", "hash"]) {
    const html = buildLanding(published, { root: t.root, mode });
    assert.deepEqual(CSP.verifyLanding(html, { mode }), [], mode);
    const cases = [
      ["a script", html.replace("</main>", "</main>\n<script>x()</script>"), /the page has 1 <script> elements, the plan 0/],
      ["inline handler", html.replace("<main>", '<main onclick="x()">'), /inline event handler/],
      ["a handler after a quoted \">\"", html.replace("<main>", '<main title="a>b" onclick="x()">'), /inline event handler/],
      ["a handler after a slash", html.replace("<main>", '<main/onclick="x()">'), /inline event handler/],
      ["second CSP meta", html.replace("<title>", '<meta http-equiv="Content-Security-Policy" content="default-src *">\n<title>'), /exactly one Content-Security-Policy meta/],
      ["CSP outside <head>", moveCspIntoBody(html), /not inside <head>/],
      ["CSP after the <style>", moveCspAfterStyle(html), /comes after the <style>/],
      ["a directive added", editPolicy(html, (c) => `${c}; img-src data:`), /the policy has img-src, which it must not have/],
      ["a carriage return", html.replace("<main>\n", "<main>\r\n"), /carriage return/],
      ["no style", html.replace(/<style>[^]*?<\/style>\n/, ""), /the page has 0 <style> elements, expected 1/],
    ];
    if (mode === "hash") {
      cases.push(
        ["style edited after hashing", html.replace("<style>\n", "<style>\n "), /hash mode: the <style> is not listed in style-src/],
        ["unsafe-inline style", editPolicy(html, (c) => c.replace(/'sha256-[^']+'/, "'unsafe-inline'")), /style-src allows 'unsafe-inline', but the style policy is "hash"/],
        ["style attribute", html.replace("<main>", '<main style="color:red">'), /hash mode: style attribute/],
        ["a style attribute after a quoted \">\"", html.replace("<main>", '<main title="a>b" style="color:red">'), /hash mode: style attribute/],
      );
    } else {
      cases.push(["a hashed style in legacy mode", editPolicy(html, (c) => c.replace("'unsafe-inline'", sha("x"))), /style-src is "'sha256-[^']+'", expected "'unsafe-inline'"/]);
    }
    for (const [name, bad, re] of cases) {
      assert.notEqual(bad, html, `${mode} ${name}: the mutation applies`);
      const problems = CSP.verifyLanding(bad, { mode });
      assert.ok(problems.some((p) => re.test(p)), `${mode} ${name}: expected ${re}, got ${JSON.stringify(problems)}`);
    }
  }
}));

// ---------------------------------------------------------------- in Chrome

// The globals the stub tree's pieces set, in plan order; the stub app sets none.
const GLOBALS = ["pdfjsLib", "StatementEscape", "StatementShell", "StatementZip", "StatementStorage", "StatementCsv",
  "Xlsx", "StatementXlsx", "StatementPdf", "StatementLayout", "StatementExport", "StatementAssemble", "StatementFiles",
  "StatementProvider", "StubCsvHelper", "StubPdfParser", "StubCsvParser", "StubSheetParser", "StubSheetFiles", "__injected", "__handler"];

test("in Chrome: a page that verifies runs every script with its style and no violation, and Chrome blocks each hash defect verify reports", { skip: NO_CHROME }, withTree(async (t) => {
  const inject = path.join(t.root, "test", "inject", "canary.js");
  const entries = discover(t.root);
  const built = (id) => buildPage(entries.find((e) => e.id === id), { root: t.root, mode: "hash", inject });
  const browser = await browserLib.launch();
  let k = 0;
  const open = async (html) => {
    const file = path.join(t.tmp, "chrome", `page-${k++}.html`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, html);
    const context = await browserLib.newContext(browser, browserLib.ENVS.E0, {});
    try {
      const tab = await context.newPage();
      await tab.goto(pathToFileURL(file).href, { waitUntil: "load" });
      await tab.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const s = await tab.evaluate((names) => ({
        globals: names.filter((g) => self[g] !== undefined),
        styled: getComputedStyle(document.querySelector("main")).maxWidth === "980px",
      }), GLOBALS);
      const errs = await capture.pageErrors(tab);
      return { ...s, directives: errs.violations.map((v) => v.directive) };
    } finally {
      await context.close().catch(() => {});
    }
  };
  try {
    const want = {
      "stub-pdf": ["pdfjsLib", "StatementEscape", "StatementShell", "StatementZip", "StatementStorage", "StatementPdf", "StatementLayout", "StatementExport", "StatementFiles", "StatementProvider", "StubPdfParser", "__injected"],
      "stub-csv": ["StatementEscape", "StatementShell", "StatementZip", "StatementStorage", "StatementCsv", "StatementExport", "StatementAssemble", "StatementFiles", "StatementProvider", "StubCsvHelper", "StubCsvParser", "__injected"],
      "stub-custom": ["StatementEscape", "StatementShell", "StatementZip", "StatementStorage", "Xlsx", "StatementXlsx", "StatementExport", "StatementProvider", "StubSheetParser", "StubSheetFiles", "__injected"],
    };
    for (const [id, globals] of Object.entries(want)) {
      const { html, plan } = built(id);
      assert.deepEqual(CSP.verify(html, plan), [], id);
      const r = await open(html);
      assert.deepEqual(r.directives, [], `${id}: no violation`);
      assert.deepEqual(r.globals, globals, `${id}: every script ran`);
      assert.ok(r.styled, `${id}: the style applies`);
    }
    const landing = buildLanding(entries.filter((e) => !e.skeleton && e.D.publish), { root: t.root, mode: "hash" });
    const l = await open(landing);
    assert.deepEqual([l.directives, l.styled], [[], true], "the landing page: its style applies, no violation");

    // The defects, on the PDF page: verify reports each, and Chrome blocks what it names.
    const { html, plan } = built("stub-pdf");
    const defects = [
      ["the style edited after hashing", html.replace("<style>\n", "<style>\n "), /the <style> is not listed in style-src/, /^style-src/, (r) => !r.styled],
      ["the parser edited after hashing", html.replace("StubPdfParser = factory", "StubPdfParser= factory"), /providers\/stub-pdf\/parser\.js\) is not listed in script-src/, /^script-src/, (r) => !r.globals.includes("StubPdfParser")],
      ["a style attribute", html.replace('<p id="busy" hidden>', '<p id="busy" style="color: red" hidden>'), /style attribute/, /^style-src/, () => true],
      ["an inline handler", html.replace("<body>", '<body onload="self.__handler = 1">'), /inline event handler/, /^script-src/, (r) => !r.globals.includes("__handler")],
    ];
    for (const [name, bad, verifyRe, directiveRe, blocked] of defects) {
      assert.ok(CSP.verify(bad, plan).some((p) => verifyRe.test(p)), `${name}: verify reports it`);
      const r = await open(bad);
      assert.ok(r.directives.length && r.directives.every((d) => directiveRe.test(d)), `${name}: Chrome reports ${directiveRe}, got ${JSON.stringify(r.directives)}`);
      assert.ok(blocked(r), `${name}: Chrome blocked it`);
    }
    // A policy outside <head> is not in force: the edited parser runs with no violation.
    const ignored = moveCspIntoBody(html.replace("StubPdfParser = factory", "StubPdfParser= factory"));
    assert.ok(CSP.verify(ignored, plan).some((p) => /not inside <head>/.test(p)));
    const ri = await open(ignored);
    assert.deepEqual(ri.directives, [], "no violation: the policy is ignored");
    assert.ok(ri.globals.includes("StubPdfParser"), "the edited parser ran");
    // A policy after the <style> does not govern it: the edited style applies with no violation.
    const late = moveCspAfterStyle(html.replace("<style>\n", "<style>\n "));
    assert.ok(CSP.verify(late, plan).some((p) => /comes after the <style>/.test(p)));
    const rl = await open(late);
    assert.deepEqual([rl.directives, rl.styled], [[], true], "no violation: the style comes before the policy");
    // The documented fallback: with style-src 'unsafe-inline', a style attribute is no violation.
    const fallback = editPolicy(html, (c) => c.replace(/style-src 'sha256-[^']+'/, "style-src 'unsafe-inline'"));
    assert.deepEqual(CSP.verify(fallback, plan, { stylePolicy: "unsafe-inline" }), []);
    const rf = await open(fallback.replace('<p id="busy" hidden>', '<p id="busy" style="color: red" hidden>'));
    assert.deepEqual([rf.directives, rf.styled], [[], true], "the fallback: no style-src violation");
  } finally {
    await browser.close().catch(() => {});
  }
}));

// Markup samples, each put into a page's <main>, with what the markup check must say of it:
// "handler" (an inline event handler), "style" (a style attribute), "foreign" (an <svg>
// element), or null (nothing). "chrome" is what Chrome's parser makes of it: whether some
// element has an on* attribute or a style attribute. They differ in one sample, where verify
// refuses what the browser drops (an end tag's attribute).
const MARKUP = [
  ["a handler", '<p onclick="x()">t</p>', "handler", "handler"],
  ["a handler after a slash", '<p id="a"/onclick="x()">t</p>', "handler", "handler"],
  ["a handler after a quoted \">\"", '<p title="a>b" onclick="x()">t</p>', "handler", "handler"],
  ["a handler right after a quoted value", '<p id="a"onclick="x()">t</p>', "handler", "handler"],
  ["a handler after an unquoted value holding a quote", '<p id=a"b onclick=x()>t</p>', "handler", "handler"],
  ["an upper-case handler", '<P ONCLICK="x()">t</P>', "handler", "handler"],
  ["a handler after a comment that --!> ends", '<!-- c --!><p onclick="x()">t</p>', "handler", "handler"],
  ["a handler after an empty comment", '<!--><p onclick="x()">t</p>', "handler", "handler"],
  ["a handler after a declaration, which ends at its first \">\"", '<!x a=">"><p onclick="x()">t</p>', "handler", "handler"],
  ["a handler after a <textarea> holding a quote", '<textarea><b title="</textarea><p onclick="x()">"></textarea>', "handler", "handler"],
  ["a handler after a <title> holding a quote", '<title><b title="</title><p onclick="x()">"></title>', "handler", "handler"],
  ["a handler in an SVG <title>, which holds markup", '<svg><title><a onclick="x()">t</a></title></svg>', "foreign", "handler"],
  ["a style attribute after a slash", '<p id="a"/style="color:red">t</p>', "style", "style"],
  ["a style attribute after a quoted \">\"", '<p title="a>b" style="color:red">t</p>', "style", "style"],
  ["handler text in a quoted value", '<p title=" onclick=x() style=y">t</p>', null, null],
  ["handler text in a <textarea>", '<textarea><p onclick="x()" style="y"></textarea>', null, null],
  ["handler text in a comment", '<!-- <p onclick="x()" style="y"> -->', null, null],
  ["handler text after a \"<\" and a space", '< p onclick="x()" style="y">t', null, null],
  ["an end tag's attribute", '<p>t</p onclick="x()">', "handler", null],
];

// What verify says of a sample's markup, in hash mode: "handler", "style", "foreign" or null.
function markupVerdict(html, plan, sample) {
  const problems = CSP.verify(html.replace("<main>\n", `<main>\n${sample}\n`), plan, { mode: "hash" });
  if (problems.some((p) => /the page has a <(svg|math)> element/.test(p))) return "foreign";
  if (problems.some((p) => /^inline event handler in /.test(p))) return "handler";
  if (problems.some((p) => /^hash mode: style attribute in /.test(p))) return "style";
  assert.deepEqual(problems, [], "nothing else is wrong with the page");
  return null;
}

test("the markup check reads tags as the browser's tokenizer does", () => {
  const { html, plan } = stubPage("hash");
  for (const [name, sample, want] of MARKUP) assert.equal(markupVerdict(html, plan, sample), want, name);
  const read = (h) => CSP.tags(h).map((t) => `${t.end ? "/" : ""}${t.name}[${t.attrs.join(" ")}]`).join(" ");
  assert.equal(read('<p id="a"/onclick="x()" title=\'b>c\'data-x=y"z hidden>'), "p[id onclick title data-x hidden]");
  assert.equal(read("<!DOCTYPE html><!-- <p a> --><?pi <p b>?><a href=x/></a></>"), "a[href] /a[]");
  assert.equal(read('<script>"<p onclick=1>"</SCRIPT ><p =x y>'), "script[] /script[] p[=x y]");
  assert.equal(read("<plaintext><p onclick=1>"), "plaintext[]");
  assert.equal(read("<p onclick"), "p[onclick]", "a tag the page ends inside is kept");
});

test("in Chrome: no sample has an attribute that verify misses", { skip: NO_CHROME }, async () => {
  const { html, plan } = stubPage("hash");
  const browser = await browserLib.launch();
  try {
    const context = await browserLib.newContext(browser, browserLib.ENVS.E0, {});
    const tab = await context.newPage();
    for (const [name, sample, want, chrome] of MARKUP) {
      await tab.setContent(`<!doctype html><main>${sample}</main>`);
      const got = await tab.evaluate(() => {
        const all = [...document.querySelectorAll("*")];
        if (all.some((e) => [...e.attributes].some((a) => /^on[a-z]+$/.test(a.name)))) return "handler";
        return all.some((e) => e.hasAttribute("style")) ? "style" : null;
      });
      assert.equal(got, chrome, `${name}: Chrome's parse`);
      assert.equal(markupVerdict(html, plan, sample), want, name);
      if (got) assert.ok(want, `${name}: Chrome has a ${got} attribute, and verify refuses the page`);
    }
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
});
