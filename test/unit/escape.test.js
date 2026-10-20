// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// core/escape.js (docs/TESTING.md, unit tests): esc; the html tag's stringification, arrays of
// Html, nesting and no double escaping; setHtml refusing anything that is not Html; forged Html
// (an object shaped like one, an object whose toString returns markup, an object from
// JSON.parse, a structural copy of a real Html value) escaped and refused; cssToken. With the
// old repositories present, esc is also checked against the old pages' own line, byte for byte
// and on seeded random strings. Synthetic data only.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { esc, html, setHtml, cssToken } = require("../../core/escape.js");
const { mulberry32 } = require("../lib/prng.js");
const { frozenProviders } = require("../lib/load-provider.js");

const REPO = path.resolve(__dirname, "..", "..");
const SOURCE = fs.readFileSync(path.join(REPO, "core", "escape.js"), "utf8");
const oldRoot = process.env.S2C_OLD_ROOT || os.homedir();

// What an element shows after setHtml.
const markup = (h) => {
  const el = { innerHTML: "untouched" };
  setHtml(el, h);
  return el.innerHTML;
};
const render = (v) => markup(html`${v}`);

// ---------------------------------------------------------------- esc

test("esc replaces exactly & < > \" ' with entities", () => {
  assert.equal(esc(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  assert.equal(esc("a & b < c > d \"e\" 'f'"), "a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;");
  const plain = "plain text / ` = + - @ \\ é Ö 日本 \u00a0\t\n\r";
  assert.equal(esc(plain), plain);
  assert.equal(esc("&amp;"), "&amp;amp;", "esc itself always escapes, also an entity");
});

test("esc stringifies any value first", () => {
  assert.equal(esc(5), "5");
  assert.equal(esc(-0), "0");
  assert.equal(esc(null), "null");
  assert.equal(esc(undefined), "undefined");
  assert.equal(esc(true), "true");
  assert.equal(esc(["a", "<b>"]), "a,&lt;b&gt;");
  assert.equal(esc({ toString: () => "<i>" }), "&lt;i&gt;");
});

const legacy = frozenProviders({ root: REPO }).filter((p) => p.frozen.legacyRepo);
const oldApps = legacy.map(({ id, frozen }) => ({ id, file: path.join(oldRoot, frozen.legacyRepo, "src", "app.js") }));
const oldPresent = oldApps.length > 0 && oldApps.every((a) => fs.existsSync(a.file));

test("esc is the old pages' own line, byte for byte, and behaves the same", { skip: oldPresent ? false : "old repositories not present" }, () => {
  const mine = SOURCE.split("\n").filter((l) => l.startsWith("  function esc(s) "));
  assert.equal(mine.length, 1);
  const rand = mulberry32(20261016);
  const alphabet = ["&", "<", ">", '"', "'", "a", " ", "é", "\n", "&amp;", "=", "日"];
  const samples = Array.from({ length: 2000 }, () => Array.from({ length: Math.floor(rand() * 12) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join(""));
  for (const { id, file } of oldApps) {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.startsWith("  function esc(s) "));
    assert.deepEqual(lines, mine, `${id}: the esc line`);
    const old = vm.runInNewContext(`(function () { ${lines[0]} return esc; })()`);
    for (const s of samples) assert.equal(esc(s), old(s));
  }
});

// ---------------------------------------------------------------- html

test("html keeps the literal template text as markup", () => {
  assert.equal(markup(html`<b class="x">bold</b>`), '<b class="x">bold</b>');
  assert.equal(markup(html``), "");
  assert.equal(markup(html`a${"b"}c${"d"}e`), "abcde");
});

test("html escapes interpolated data", () => {
  assert.equal(render('<img src=x onerror="window.__pwned=1">'), "&lt;img src=x onerror=&quot;window.__pwned=1&quot;&gt;");
  assert.equal(markup(html`<p title="${'x" onmouseover="y'}">${"&"}</p>`), '<p title="x&quot; onmouseover=&quot;y">&amp;</p>');
});

test("html prints every value as a template literal would, then escapes it", () => {
  assert.equal(render(undefined), "undefined");
  assert.equal(render(null), "null");
  assert.equal(render(1.5), "1.5");
  assert.equal(render(-0), "0");
  assert.equal(render(NaN), "NaN");
  assert.equal(render(true), "true");
  assert.equal(render({}), "[object Object]");
  assert.equal(render(["a", "b"]), "a,b");
  assert.equal(render(["a", "<b>"]), "a,&lt;b&gt;");
  assert.equal(render([["a", "b"], "c"]), "a,b,c");
  assert.equal(render([null, 1]), ",1");
  assert.equal(render([]), "");
  for (const v of [undefined, null, 0, -0, 1e21, "x<y", ["a", ["b", "<c>"]], { toString: () => "<s>" }, [], [undefined], new Date(0)]) {
    assert.equal(render(v), esc(`${v}`), `as a template literal: ${String(v)}`);
  }
});

test("html renders arrays of Html values (to any depth) joined, and anything mixed as data", () => {
  const a = html`<i>1</i>`, b = html`<i>2</i>`, c = html`<i>3</i>`;
  assert.equal(render([a, b]), "<i>1</i><i>2</i>");
  assert.equal(render([[a], [b, [c]]]), "<i>1</i><i>2</i><i>3</i>");
  assert.equal(markup(html`<ul>${["x", "<y>"].map((s) => html`<li>${s}</li>`)}</ul>`), "<ul><li>x</li><li>&lt;y&gt;</li></ul>");
  // Not all Html: the whole array is data, printed and escaped.
  assert.equal(render([a, "x"]), "[object Object],x");
  // A hole is not Html, so the array is data.
  assert.equal(render([a, , b]), "[object Object],,[object Object]"); // eslint-disable-line no-sparse-arrays
  // An array shared twice is fine; an array that contains itself is data.
  const shared = [a];
  assert.equal(render([shared, shared]), "<i>1</i><i>1</i>");
  const cyclic = [a];
  cyclic.push(cyclic);
  assert.equal(render(cyclic), esc(`${cyclic}`));
});

test("html nests without double escaping", () => {
  const inner = html`<b>${"<x> & y"}</b>`;
  assert.equal(markup(html`<p>${inner}</p>`), "<p><b>&lt;x&gt; &amp; y</b></p>");
  assert.equal(markup(html`<div>${html`<p>${inner}</p>`}</div>`), "<div><p><b>&lt;x&gt; &amp; y</b></p></div>");
  assert.equal(render("&amp;"), "&amp;amp;", "data is escaped once, even when it looks like an entity");
  assert.equal(markup(html`${html`&amp;`}`), "&amp;", "markup is never escaped again");
});

test("Html values are frozen", () => {
  const h = html`<b>x</b>`;
  assert.ok(Object.isFrozen(h));
  assert.throws(() => { h.s = "<script>"; }, TypeError);
  assert.equal(markup(h), "<b>x</b>");
});

test("html only works as a template tag", () => {
  assert.throws(() => html(["<b>"]), TypeError);
  assert.throws(() => html("<b>"), TypeError);
  assert.throws(() => html(Object.assign(["<b>"], { raw: ["<b>"] })), TypeError, "a data array with a raw copy");
  assert.throws(() => html(JSON.parse('["<b>"]')), TypeError);
  assert.throws(() => html`\unicode`, TypeError, "an invalid escape sequence in the template text");
});

// ---------------------------------------------------------------- setHtml

test("setHtml assigns the markup of an Html value", () => {
  const el = { innerHTML: "" };
  setHtml(el, html`<p>${"<x>"}</p>`);
  assert.equal(el.innerHTML, "<p>&lt;x&gt;</p>");
});

test("setHtml refuses strings and every other non-Html value, and leaves the element alone", () => {
  for (const v of ["<b>x</b>", "", new String("<b>"), 5, null, undefined, [html`<b>`], { s: "<b>" }]) {
    const el = { innerHTML: "before" };
    assert.throws(() => setHtml(el, v), TypeError);
    assert.equal(el.innerHTML, "before");
  }
});

// ---------------------------------------------------------------- forged Html

test("forged Html is escaped and refused by setHtml", () => {
  const real = html`<b>real</b>`;
  const forgeries = {
    "an object shaped like Html": { __html: "<b>" },
    "an object whose toString returns markup": { toString: () => "<b>x</b>" },
    "an object from JSON.parse": JSON.parse(JSON.stringify(real)),
    "a structural copy with the same prototype": Object.assign(Object.create(Object.getPrototypeOf(real)), real),
    "a structuredClone": structuredClone(real),
    "an object inheriting from a real Html value": Object.create(real),
    "an instance of the private class made outside html": new (Object.getPrototypeOf(real).constructor)("<b>"),
  };
  for (const [what, forged] of Object.entries(forgeries)) {
    const shown = render(forged);
    assert.equal(shown, esc(String(forged)), what);
    assert.ok(!shown.includes("<"), `${what}: no markup gets through`);
    assert.throws(() => setHtml({ innerHTML: "" }, forged), TypeError, what);
    assert.equal(render([real, forged]), esc(String([real, forged])), `${what}: inside an array`);
  }
});

test("Html made by another copy of the module is not Html here", () => {
  const context = vm.createContext({});
  context.self = context;
  vm.runInContext(SOURCE, context, { filename: "core/escape.js" });
  const other = vm.runInContext("StatementEscape.html`<b>x</b>`", context);
  assert.throws(() => setHtml({ innerHTML: "" }, other), TypeError);
  assert.equal(render(other), "[object Object]");
});

// ---------------------------------------------------------------- cssToken

test("cssToken passes plain class tokens and turns anything else into other", () => {
  for (const ok of ["investment", "cash", "bank", "a-b-1", "x", "0", "-"]) assert.equal(cssToken(ok), ok);
  assert.equal(cssToken(5), "5");
  assert.equal(cssToken(undefined), "undefined", "as String(s), like the old class attribute");
  for (const bad of ["", "Investment", "a b", 'x" onmouseover="window.__pwned=1', "tag<x>", "é", "a\n", "a_b", "a.b", "x y", "İ"]) {
    assert.equal(cssToken(bad), "other", JSON.stringify(bad));
  }
  assert.equal(cssToken({ toString: () => "bank" }), "bank");
});

// ---------------------------------------------------------------- module

test("the module is frozen, and loading it touches nothing (browser branch)", () => {
  assert.ok(Object.isFrozen(require("../../core/escape.js")));
  const context = vm.createContext({});
  context.self = context;
  vm.runInContext(SOURCE, context, { filename: "core/escape.js" });
  assert.deepEqual(Object.keys(context.StatementEscape).sort(), ["cssToken", "esc", "html", "setHtml"]);
});
