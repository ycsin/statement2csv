// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The injection smoke (test/smoke/injection.js) on the synthetic tree of
// test/unit/synthetic-tree.js, whose statement app is a byte copy of the real
// core/app/statement-app.js: its four statement-app pages take the configurator payloads, its
// PDF provider's hostile statements print a markup currency and a markup row description, and
// its custom app has neither. On the PDF provider both payloads reach every render target, the
// diagnostics included. The whole tree passes, and every check has a failing sample, made by
// changing one thing in a fresh copy: renders that bypass escaping (the sinks of the pages before
// migration step M8; their payloads' handlers are blocked and reported as CSP violations by the
// hash policy of step M10, and run under the legacy policy, which the samples also build), a
// diagnostics render alone that does (the M8/M9 review's mutant), a kind
// class token without cssToken, a Download all that differs from the downloads hook, a hostile
// file without a payload, one whose payload the page never prints, one whose payloads miss a
// render target, and a run whose payloads leave targets unexercised (coverage). The boundary of
// Download all's scan (which values an attribute gives back) is pinned in Chrome. The pure
// payload helpers are tested without Chrome. The browser parts need the pinned
// chrome-headless-shell and are skipped, with a message, without it. The smoke reads the
// fixtures through test/lib/extract.js, whose cache lives in <private-dir>, so $S2C_PRIVATE
// points at a temporary directory here.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-injection-test-"));
process.env.S2C_PRIVATE = path.join(TMP, "private");
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const { makeSyntheticTree, SPDX, MARKER, HOSTILE_CURRENCY, pdfPage } = require("./synthetic-tree.js");
const injection = require("../smoke/injection.js");
const browserLib = require("../lib/browser.js");

const CHROME_READY = fs.existsSync(browserLib.chromePath());
const NO_CHROME = !CHROME_READY && "the pinned chrome-headless-shell is not installed";

const withTree = (fn) => async () => {
  const t = makeSyntheticTree();
  try {
    assert.equal(t.build().code, 0, "the synthetic tree builds");
    return await fn(t);
  } finally {
    t.cleanup();
  }
};

// text with `from` replaced by `to`, asserting that `from` occurs exactly once.
function swap(text, from, to) {
  assert.equal(text.split(from).length, 2, `expected exactly one ${JSON.stringify(from.slice(0, 40))}`);
  return text.replace(from, () => to);
}

const run = (t, opts = {}) => injection.runInjection({ root: t.root, ...opts });
const has = (r, re) => assert.ok(r.problems.some((m) => re.test(m)), `no problem matches ${re}:\n${r.problems.join("\n") || "(none)"}`);
const APP = "core/app/statement-app.js";
// Renders that bypass escaping, as the pages did before M8: every value raw, arrays joined.
const RAW_RENDER = "const raw = (v) => (Array.isArray(v) ? v.map(raw).join(\"\") : String(v)); "
  + "const html = (s, ...v) => s.reduce((o, x, i) => o + x + (i < v.length ? raw(v[i]) : \"\"), \"\"); "
  + "const setHtml = (el, h) => { el.innerHTML = h; }; const cssToken = (k) => k;";

// ---------------------------------------------------------------- payload helpers (no Chrome)

test("payloadsOf finds every markup tag in a spec's strings, with its handlers' events; stripPayloads leaves the text", () => {
  const spec = {
    marker: MARKER,
    files: [
      { name: "a.xlsx", sheets: { S: [["Currency", "<b onmouseover=\"window.__pwned=1\">USD</b>"], ["n", 1, null]] } },
      { name: "b.pdf", pages: [[{ x: 1, y: 2, text: `Account S7 ${HOSTILE_CURRENCY}` }, { x: 1, y: 3, text: "plain" }]] },
      { name: "c.csv", text: "Date,Name\n2026-01-01,<i>x\n2026-01-02,a < b and c > d\n" },
    ],
  };
  assert.deepEqual(injection.payloadsOf(spec), [
    { text: "<b onmouseover=\"window.__pwned=1\">USD</b>", tags: ["b"], events: ["mouseover"] },
    { text: HOSTILE_CURRENCY, tags: ["img"], events: ["error"] },
    { text: "<i>", tags: ["i"], events: [] },
  ]);
  const twin = injection.stripPayloads(spec);
  assert.equal(twin.files[0].sheets.S[0][1], "USD", "the payload's text stays");
  assert.equal(twin.files[1].pages[0][0].text, "Account S7 PAYLOAD", "a payload without text becomes a word");
  assert.equal(twin.files[2].text, "Date,Name\n2026-01-01,PAYLOADx\n2026-01-02,a < b and c > d\n");
  assert.deepEqual(twin.files.map((f) => f.name), ["a.xlsx", "b.pdf", "c.csv"], "file names are kept");
  assert.deepEqual(injection.payloadsOf(twin), [], "the twin carries no payload");
  assert.deepEqual(injection.describePayload(injection.NAME), { text: injection.NAME, tags: ["img"], events: ["error"] });
  assert.deepEqual(injection.describePayload(injection.KIND), { text: injection.KIND, tags: [], events: ["mouseover"] });
});

// ---------------------------------------------------------------- the synthetic tree

test("injection: every page of the synthetic tree with fixtures passes", { skip: NO_CHROME }, withTree(async (t) => {
  const r = await run(t);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.providers.map((p) => `${p.id}:${p.configurator}:${p.hostile}`),
    ["syn-skel:true:false", "syn-csv:true:false", "syn-invest:true:false", "syn-pdf:true:true", "syn-sheet:false:false"], "the custom app has neither payload");
  for (const p of r.providers.filter((x) => x.configurator || x.hostile)) assert.ok(p.states >= 6 && p.records > 0, `${p.id}: ${p.states} states, ${p.records} records`);
  assert.equal(r.providers.find((p) => p.id === "syn-sheet").instances, 0);
  // Every render target shows a payload as literal text. On the PDF provider both payloads reach
  // all four: the seeded name through p0's first opening and its gap row, the hostile currency
  // through the first openings and the gap row, the hostile row description among the rows not
  // exported. Elsewhere the seeded name shows on p0's card and in its configurator row.
  const all = injection.TARGETS;
  assert.deepEqual(all, ["#cards", "#config-list", "#status", "#diagnostics"]);
  assert.deepEqual(r.providers.find((p) => p.id === "syn-pdf").shown, { configurator: all, hostile: all });
  for (const id of ["syn-skel", "syn-csv", "syn-invest"]) assert.deepEqual(r.providers.find((p) => p.id === id).shown, { configurator: ["#cards", "#config-list"], hostile: [] }, id);
  const four = ["syn-skel", "syn-csv", "syn-invest", "syn-pdf"];
  assert.deepEqual(r.coverage, { "#cards": four, "#config-list": four, "#status": ["syn-pdf"], "#diagnostics": ["syn-pdf"] });
}));

test("injection fails: renders that bypass escaping show markup, break Download all and log CSP violations; the payloads' handlers run under the legacy policy", { skip: NO_CHROME }, withTree(async (t) => {
  t.write({ [APP]: swap(t.read(APP), "const { html, setHtml, cssToken } = self.StatementEscape;", RAW_RENDER) });
  assert.equal(t.build(["--only", "syn-pdf"]).code, 0);
  const r = await run(t, { providers: ["syn-pdf"] });
  // The configurator payloads. The page's policy (hash mode, since migration step M10) has no
  // 'unsafe-inline' for scripts: Chrome blocks every handler a payload brings and reports it.
  assert.ok(!r.problems.some((m) => /a payload ran/.test(m)), "the hash policy blocks the handlers");
  has(r, /configurator payload: CSP violation: script-src-attr/);
  has(r, /configurator payload: state balance\/full: \d+ elements? carr(y|ies) an on\* attribute \(.*img\[onerror\]/);
  has(r, /configurator payload: state balance\/full: .*span\[onmouseover\]/);
  has(r, /configurator payload: state balance\/full: \d+ new <img> elements?: a payload became markup/);
  has(r, /configurator payload: state balance\/full: p0's configurator row does not show the seeded name as its value/);
  has(r, /configurator payload: no card shows the seeded name as its title in any state/);
  has(r, /configurator payload: state balance\/full: the page differs from the downloads hook/);
  has(r, /configurator payload: (console error|CSP violation): .*img-src/);
  // The hostile statement's currency.
  has(r, /hostile files: CSP violation: script-src-attr/);
  has(r, /hostile files: state balance\/full: \d+ new <img> elements?: a payload became markup/);
  has(r, /hostile files: no payload of fixtures\/hostile\.js shows as literal text in <main>/);
  // The same page under the legacy policy (the pages before M10), whose script-src
  // 'unsafe-inline' lets the handlers run: the smoke reports the run.
  assert.equal(t.build(["--only", "syn-pdf", "--csp", "legacy"]).code, 0);
  const legacy = await run(t, { providers: ["syn-pdf"], csp: "legacy" });
  has(legacy, /configurator payload: state balance\/full: window\.__pwned is set: a payload ran/);
  has(legacy, /hostile files: state balance\/full: window\.__pwned is set: a payload ran/);
  has(legacy, /configurator payload: state balance\/full: \d+ new <img> elements?: a payload became markup/);
}));

test("injection fails: a diagnostics render that bypasses escaping (the review's mutant), through the payloads that reach #diagnostics", { skip: NO_CHROME }, withTree(async (t) => {
  // renderDiagnostics alone renders raw (its own html and setHtml); every other render escapes.
  t.write({ [APP]: swap(t.read(APP), "  function renderDiagnostics(r) {\n", `  function renderDiagnostics(r) {\n    ${RAW_RENDER}\n`) });
  assert.equal(t.build(["--only", "syn-pdf"]).code, 0);
  const r = await run(t, { providers: ["syn-pdf"] });
  // The seeded name, in p0's gap row; Chrome blocks its handler (hash mode, since M10).
  assert.ok(!r.problems.some((m) => /a payload ran/.test(m)), "the hash policy blocks the handlers");
  has(r, /configurator payload: CSP violation: script-src-attr/);
  has(r, /configurator payload: state balance\/full: \d+ new <img> elements?: a payload became markup/);
  // The hostile currency in the gap row, and the row description among the rows not exported.
  has(r, /hostile files: CSP violation: script-src-attr/);
  has(r, /hostile files: state balance\/full: \d+ new <img> elements?: a payload became markup/);
  has(r, /hostile files: state balance\/last: \d+ new <b> elements?: a payload became markup/);
  has(r, /hostile files: state balance\/full: \d+ elements? carr(y|ies) an on\* attribute \(.*b\[onmouseover\]/);
  // The cards, the configurator and the status still escape: no problem names them.
  assert.ok(!r.problems.some((m) => /title|configurator row|tag other|data-account|differs from the downloads hook/.test(m)), r.problems.join("\n"));
  // Under the legacy policy the handlers in the diagnostics run.
  assert.equal(t.build(["--only", "syn-pdf", "--csp", "legacy"]).code, 0);
  const legacy = await run(t, { providers: ["syn-pdf"], csp: "legacy" });
  has(legacy, /configurator payload: state balance\/full: window\.__pwned is set: a payload ran/);
  has(legacy, /hostile files: state balance\/full: window\.__pwned is set: a payload ran/);
}));

test("injection fails: a hostile.js whose payloads miss a render target, and a run whose payloads reach no #status or #diagnostics", { skip: NO_CHROME }, withTree(async (t) => {
  // One hostile statement: its currency shows on the card, in the configurator and in the first
  // openings, but no gap row or skipped row carries a payload into the diagnostics.
  t.write({ "providers/syn-pdf/fixtures/hostile.js": `${SPDX}// ${MARKER}: synthetic.\nmodule.exports = ${JSON.stringify({ marker: MARKER,
    files: [{ name: "one-2026-03.pdf", pages: pdfPage("2026-03", "175.50", "200.50", [["2026-03-02", "Deposit", "25.00"]], HOSTILE_CURRENCY) }] }, null, 2)};\n` });
  const one = await run(t, { providers: ["syn-pdf"] });
  assert.deepEqual(one.problems, ["syn-pdf: hostile files: no payload of fixtures/hostile.js shows as literal text in #diagnostics in any state: that render goes unexercised"]);
  assert.deepEqual(one.providers[0].shown.hostile, ["#cards", "#config-list", "#status"]);
  // Coverage: the configurator payloads alone reach the cards and the configurator only.
  const csv = await run(t, { providers: ["syn-csv"], coverage: true });
  assert.deepEqual(csv.problems, ["#status", "#diagnostics"].map((x) => `coverage: no payload shows as literal text in ${x} on any page of this run: that render goes unexercised`));
  assert.deepEqual(csv.coverage, { "#cards": ["syn-csv"], "#config-list": ["syn-csv"], "#status": [], "#diagnostics": [] });
  assert.deepEqual((await run(t, { providers: ["syn-csv"] })).problems, [], "a restricted run notes its coverage, it does not check it");
}));

test("the SX1 boundary (decisions 64, 176): esc and the HTML parser give back every UTF-16 code unit in an attribute value but CR and NUL", { skip: NO_CHROME }, async () => {
  const browser = await browserLib.launch();
  try {
    const context = await browserLib.newContext(browser, browserLib.ENVS.E0, {});
    const page = await context.newPage();
    await page.setContent("<!doctype html><div id=\"x\"></div>");
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "..", "..", "core", "escape.js"), "utf8") });
    // In the page, so no string crosses the protocol: every code unit written as the apps write
    // data-account and data-id (esc between double quotes), read back through dataset.
    const probe = (values) => {
      const { esc } = self.StatementEscape;
      const box = document.getElementById("x");
      box.innerHTML = values.map((v) => `<button data-account="${esc(v)}"></button>`).join("");
      return [...box.children].map((b, i) => (b.dataset.account === values[i] ? null : [...b.dataset.account].map((c) => c.charCodeAt(0)))).map((got, i) => (got ? [i, got] : null)).filter(Boolean);
    };
    const changed = await page.evaluate(`(${probe})(Array.from({ length: 65536 }, (_, c) => "A" + String.fromCharCode(c) + "B"))`);
    assert.deepEqual(changed, [[0, [65, 0xfffd, 66]], [13, [65, 10, 66]]], "NUL reads as U+FFFD and CR as LF; nothing else changes");
    const pairs = await page.evaluate(`(${probe})(["A\\r\\nB", "\\r", ${JSON.stringify(injection.NAME)}, ${JSON.stringify(injection.KIND)}, "Plain name", "Ledger L100"])`);
    assert.deepEqual(pairs, [[0, [65, 10, 66]], [1, [10]]], "CRLF reads as LF too; the injection smoke's payloads come back exactly");
    await context.close();
  } finally {
    await browser.close();
  }
});

test("injection fails: a kind class token without cssToken, and a Download all that differs from the hook", { skip: NO_CHROME }, withTree(async (t) => {
  const base = t.read(APP);
  t.write({ [APP]: swap(base, "<span class=\"tag ${cssToken(a.kind)}\">", "<span class=\"tag ${a.kind}\">") });
  assert.equal(t.build(["--only", "syn-csv"]).code, 0);
  const kind = await run(t, { providers: ["syn-csv"] });
  has(kind, /configurator payload: state balance\/full: p0's card tag has the class "tag x\\" onmouseover=\\"window\.__pwned=1", not "tag other"/);
  assert.ok(!kind.problems.some((m) => /pwned is set|on\* attribute/.test(m)), "html still escapes the quote, so nothing runs");
  t.write({ [APP]: swap(base, "const files = [accountsFile()];", "const files = [];") });
  assert.equal(t.build(["--only", "syn-csv"]).code, 0);
  const zip = await run(t, { providers: ["syn-csv"] });
  has(zip, /configurator payload: state balance\/full: the page differs from the downloads hook: record \d+ \(zip\)/);
}));

test("injection fails: a hostile.js without a payload, and one whose payload the page never prints", { skip: NO_CHROME }, withTree(async (t) => {
  const write = (files) => t.write({ "providers/syn-pdf/fixtures/hostile.js": `${SPDX}// ${MARKER}: synthetic.\nmodule.exports = ${JSON.stringify({ marker: MARKER, files }, null, 2)};\n` });
  write([{ name: "plain-2026-03.pdf", pages: pdfPage("2026-03", "175.50", "200.50", [["2026-03-02", "Deposit", "25.00"]]) }]);
  has(await run(t, { providers: ["syn-pdf"] }), /syn-pdf: fixtures\/hostile\.js: no markup payload in its files/);
  // The payload sits in a row description, which only the CSV files carry: the page never shows it.
  write([{ name: "quiet-2026-03.pdf", pages: pdfPage("2026-03", "175.50", "200.50", [["2026-03-02", "<b>Deposit</b>", "25.00"]]) }]);
  has(await run(t, { providers: ["syn-pdf"] }), /syn-pdf: hostile files: no payload of fixtures\/hostile\.js shows as literal text in <main> \(the page never prints it\)/);
}));

test("injection fails, never skips, when Chrome cannot be launched", withTree(async (t) => {
  const chrome = process.env.CHROME;
  process.env.CHROME = path.join(TMP, "no-such-chrome");
  try {
    const r = await run(t, { providers: ["syn-csv"] });
    has(r, /Chrome cannot be launched/);
  } finally {
    if (chrome === undefined) delete process.env.CHROME;
    else process.env.CHROME = chrome;
  }
}));
