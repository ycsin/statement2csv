// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// build/page.js: single-pass templating, page.html slots, partials and the slot lint (C16).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("../../build/page.js");
const { normalize } = require("../../core/contract/descriptor.js");

const REPO = path.resolve(__dirname, "..", "..");
const PARTIALS = path.join(REPO, "core", "page", "partials");
const BOM = String.fromCharCode(0xfeff);
// Built at run time: only test/lint/generic.js and test/golden/waivers.js may spell it.
const W1_OLD_WORD = ["Quick", "en"].join("");
const HEADER = "<!-- SPDX-License-Identifier: Apache-2.0 -->\n<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->\n";

test("fill: one pass, function replacer, nothing rescanned", () => {
  const tricky = "a $& b $1 c $$ d $' e $` f {{other}} g " + BOM + " h";
  const out = P.fill("<x>{{one}}</x><y>{{other}}</y>", { one: tricky, other: "2" });
  assert.equal(out, `<x>${tricky}</x><y>2</y>`);
  assert.equal(P.fill("{{a}}{{a}}", { a: "$&" }), "$&$&");
});

test("fill: unknown tokens, unused values, non-strings and malformed tokens fail", () => {
  assert.throws(() => P.fill("{{a}}{{b}}", { a: "1" }), /unknown token \{\{b\}\}/);
  assert.throws(() => P.fill("{{a}}", { a: "1", b: "2" }), /unused value\(s\): b/);
  assert.throws(() => P.fill("{{a}}", { a: 1 }), /must be a string/);
  assert.throws(() => P.fill("{{ a }}", { a: "1" }), /malformed token/);
  assert.throws(() => P.fill("{{a-b}}", {}), /malformed token/);
});

test("parseSlots: header comments, slot order, structure errors", () => {
  const ok = P.parseSlots(`${HEADER}<template data-slot="h1">Title</template>\n\n<template data-slot="lede">A <em>b</em></template>\n`);
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(Object.keys(ok.slots), ["h1", "lede"]);
  assert.equal(ok.slots.lede, "A <em>b</em>");
  assert.match(P.parseSlots(`${HEADER}<p>x</p>`).errors[0], /expected <template data-slot/);
  assert.match(P.parseSlots(`${HEADER}<template data-slot="h1">x`).errors[0], /no <\/template>/);
  assert.match(P.parseSlots(`${HEADER}<template data-slot="h1">a</template><template data-slot="h1">b</template>`).errors[0], /appears twice/);
  assert.match(P.parseSlots(`${HEADER}<template data-slot="h1"><template data-slot="x">a</template>`).errors[0], /nested/);
  assert.match(P.parseSlots(`${HEADER}<template data-slot="h1">a</template>\n<!-- late comment -->\n`).errors[0], /expected <template/);
  assert.ok(P.parseSlots(`${HEADER}<template data-slot="h1">a\r\n</template>`).errors.some((e) => /carriage return/.test(e)));
});

test("expandPartials: shared help items, indentation kept, unknown names fail", () => {
  const r = P.expandPartials("<li>a</li>\n  {{> help-columns-transactions}}\nx {{> help-qif-short}}", PARTIALS);
  assert.deepEqual(r.errors, []);
  const lines = r.text.split("\n");
  assert.equal(lines[1].slice(0, 13), "  <li>Columns");
  assert.ok(lines[2].startsWith("x <li><strong>QIF</strong>"));
  assert.ok(!r.text.includes("SPDX"), "partial header comments are stripped");
  assert.match(P.expandPartials("{{> nope}}", PARTIALS).errors[0], /unknown partial "nope"/);
  assert.match(P.expandPartials("{{> ../x}}", PARTIALS).errors[0], /bad partial name/);
});

test("every shared partial is one clean list item without the old QIF expansion", () => {
  for (const f of fs.readdirSync(PARTIALS)) {
    const text = fs.readFileSync(path.join(PARTIALS, f), "utf8");
    assert.ok(text.startsWith(HEADER), `${f}: SPDX header`);
    const body = P.stripHeaderComments(text).trim();
    assert.ok(body.startsWith("<li>") && body.endsWith("</li>") && !body.includes("\n"), `${f}: one <li> line`);
    assert.deepEqual(P.lintSlots({ "help-items": body }, { configurator: true }).filter((e) => !/missing required/.test(e)), [], f);
    assert.ok(!body.includes(W1_OLD_WORD), `${f}: W1 applied`);
  }
});

const BASE = {
  "h1": "Example Bank statement to CSV and QIF",
  "lede": "Turns <em>Example Bank</em> statements into CSV files.",
  "drop-title": "Drop statement PDFs here",
  "drop-help": "or click to choose files.",
  "mode-label": "Funds",
  "hint": "Export only months you haven't imported yet.",
  "config-help": "Detected from the statements. Saved in this browser.",
  "help-items": "<li>One file per account.</li>",
};
const lint = (over, opts = {}) => P.lintSlots({ ...BASE, ...over }, opts);

test("lintSlots: a complete statement page is clean", () => {
  assert.deepEqual(lint({}), []);
  assert.deepEqual(lint({ "help-extra": "<details><summary>More</summary><ul><li>x</li></ul></details>" }), []);
  assert.deepEqual(lint({ "lede": 'A <span class="muted">quiet</span> word<br>and<br/>more' }), []);
});

test("lintSlots: required slots, unknown and unused slots", () => {
  const { h1, ...noH1 } = BASE;
  void h1;
  assert.ok(P.lintSlots(noH1, {}).some((e) => /missing required slot "h1"/.test(e)));
  const { "config-help": ch, ...noConfig } = BASE;
  void ch;
  assert.ok(P.lintSlots(noConfig, { configurator: true }).some((e) => /missing required slot "config-help"/.test(e)));
  assert.deepEqual(P.lintSlots(noConfig, { configurator: false, toolbar: [] }), []);
  assert.ok(P.lintSlots(BASE, { configurator: false, toolbar: [] }).some((e) => /"config-help" is not used/.test(e)));
  assert.ok(lint({ "accounts-title": "x" }, { configurator: true, toolbar: [] }).some((e) => /no #accounts button/.test(e)));
  assert.ok(lint({ "nonsense": "x" }).some((e) => /unknown slot "nonsense"/.test(e)));
});

test("lintSlots: text and attribute slots", () => {
  assert.ok(lint({ "h1": "a <b>c</b>" }).some((e) => /text slot may not contain "<"/.test(e)));
  assert.ok(lint({ "accounts-title": 'say "hi"' }).some((e) => /attribute slot may not contain '"'/.test(e)));
  assert.ok(lint({ "accounts-title": "a <b" }).some((e) => /may not contain "<"/.test(e)));
  assert.deepEqual(lint({ "accounts-title": "One row per account & more" }), []);
  assert.ok(lint({ "drop-help": "   " }).some((e) => /is empty/.test(e)));
});

test("lintSlots: the tag and attribute allowlist", () => {
  const bad = [
    ["<a>x</a>", /tag <a> is not allowed/],
    ['<span class="x">x</span>', /only attribute allowed is class="muted" on <span>/],
    ['<em class="muted">x</em>', /only attribute allowed/],
    ['<em onclick="x()">x</em>', /event handlers, href, src and style/],
    ['<span style="color:red">x</span>', /event handlers, href, src and style/],
    ['<p title="x" src="y">x</p>', /event handlers, href, src and style/],
    ["<script>x</script>", /<script> and <style> are never allowed/],
    ["<style>x</style>", /never allowed/],
    ["a <!-- note --> b", /HTML comments are not allowed/],
    ["a < b", /not an allowed tag/],
    ["{{> help-qif-short}}", /leftover/],
  ];
  for (const [v, re] of bad) assert.ok(lint({ "lede": v }).some((e) => re.test(e)), `${v} should fail with ${re}`);
  assert.ok(lint({ "help-items": "<p>not a list</p>" }).some((e) => /list of <li> items/.test(e)));
  assert.ok(lint({ "help-extra": "<p>x</p>" }).some((e) => /must be <details> blocks/.test(e)));
});

test("readPageHtml: parse, expand partials, lint", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-page-"));
  try {
    const file = path.join(dir, "page.html");
    const slots = Object.entries(BASE).map(([k, v]) => `<template data-slot="${k}">${k === "help-items" ? `\n${v}\n{{> help-qif-short}}\n` : v}</template>`).join("\n");
    fs.writeFileSync(file, `${HEADER}${slots}\n`);
    const r = P.readPageHtml(file, { partialsDir: PARTIALS, configurator: true });
    assert.deepEqual(r.errors, []);
    assert.ok(r.slots["help-items"].includes("<li><strong>QIF</strong>"));
    fs.writeFileSync(file, `${HEADER}<template data-slot="h1">x</template><template data-slot="help-items">{{> nope}}</template>`);
    const bad = P.readPageHtml(file, { partialsDir: PARTIALS, configurator: true });
    assert.ok(bad.errors.some((e) => /unknown partial/.test(e)));
    assert.ok(bad.errors.some((e) => /missing required slot "lede"/.test(e)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("reindent: blank edges dropped, common indentation replaced", () => {
  assert.equal(P.reindent("\n\n    <li>a</li>\n      <li>b</li>  \n\n", "  "), "  <li>a</li>\n    <li>b</li>");
  assert.equal(P.reindent("<li>a</li>\n\n<li>b</li>", "        "), "        <li>a</li>\n\n        <li>b</li>");
  assert.equal(P.reindent("   \n", "  "), "");
});

const skeleton = fs.readFileSync(path.join(REPO, "core", "page", "skeleton.html"), "utf8");

test("pageValues: statement app tokens fill the skeleton exactly", () => {
  const D = normalize({ contract: 1, id: "example", name: "Example & Co", summary: "x", inputs: ["pdf", "csv"], parserGlobal: "ExampleParser" });
  const v = P.pageValues(D, { ...BASE, "help-items": "\n<li>a</li>\n<li>b</li>\n" }, { csp: "CSP", style: "STYLE\n", scripts: "<script>x</script>" });
  const html = P.fill(skeleton, v);
  assert.equal(v.title, "Example &amp; Co Statement Converter");
  assert.equal(v.accept, "application/pdf,.pdf,text/csv,.csv");
  assert.equal(v.multiple, " multiple");
  assert.equal(v.empty, "No statements yet.");
  assert.equal(v.noticeLine, "  Includes PDF.js (Mozilla Foundation, Apache-2.0), see NOTICE.\n");
  assert.equal(v.helpItems, "        <li>a</li>\n        <li>b</li>");
  assert.equal(v.helpExtra, "");
  assert.ok(html.includes('<input id="picker" type="file" accept="application/pdf,.pdf,text/csv,.csv" multiple hidden>'));
  assert.ok(html.includes('          <button role="radio" data-mode="balance">Balance only</button>\n          <button role="radio" data-mode="tradelog">Balance + trade log</button>\n          <button role="radio" data-mode="holdings">With holdings</button>\n        </div>'));
  assert.ok(html.includes('      <button id="clear">Clear</button>\n      <button id="accounts" title="One row per account: account type, name, starting balance and date">Accounts CSV</button>\n      <button id="combined" title="All accounts in one file with an account column, for multi-account imports">Combined CSV</button>\n      <button id="zip" class="primary">Download all (.zip)</button>'));
  assert.ok(html.includes('    <details class="config">\n      <summary>Accounts <span id="config-count" class="muted"></span></summary>\n      <p class="muted">Detected from the statements. Saved in this browser.</p>\n      <div id="config-list"></div>\n      <button id="config-reset">Reset to detected</button>\n    </details>\n    <div id="cards"></div>'));
  assert.ok(html.includes('<p id="empty" class="muted">No statements yet.</p>'));
  assert.ok(!/style=/.test(html.replace(/<style>[\s\S]*<\/style>/, "")), "no style attribute in the skeleton");
});

test("pageValues: custom app without configurator or toolbar buttons", () => {
  const D = normalize({
    contract: 1, id: "sheet", name: "Sheet", summary: "x", app: "custom", inputs: ["xlsx"], multiple: false, parserGlobal: "SheetParser",
    modes: [{ id: "balance", label: "Balance only" }, { id: "day", label: "By <day> & \"kind\"" }],
  });
  const slots = { ...BASE, "help-extra": "<details>\n  <summary>x</summary>\n</details>" };
  delete slots["config-help"];
  const v = P.pageValues(D, slots, { csp: "CSP", style: "S\n", scripts: "" });
  P.fill(skeleton, v);
  assert.equal(v.accept, ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(v.multiple, "");
  assert.equal(v.config, "");
  assert.equal(v.toolbarButtons, "");
  assert.equal(v.noticeLine, "");
  assert.ok(v.modeButtons.includes('data-mode="day">By &lt;day&gt; &amp; &quot;kind&quot;</button>'));
  assert.equal(v.helpExtra, "    <details>\n      <summary>x</summary>\n    </details>\n");
  const withToolbar = normalize({ ...D, custom: { toolbar: ["combined", "accounts"], config: false } });
  const tv = P.pageValues(withToolbar, slots, { csp: "", style: "", scripts: "" }).toolbarButtons;
  assert.ok(tv.indexOf('id="accounts"') < tv.indexOf('id="combined"'), "toolbar buttons in page order");
});
