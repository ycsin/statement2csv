// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Unit tests of the golden harness (test/golden): the scenario generator, the comparator and
// its waivers, the four G1b canaries and their expectation checks, and the manifest helpers of
// run.js. Synthetic data only. The canaries are evaluated in a vm sandbox that stands in for a
// page (the runtime object, StatementExport, StatementZip and a parser global), and a small model
// of the statement app turns the sandbox into downloads, so each canary's effect goes through the
// same comparator and checks as on a real page. The browser part (a synthetic page driven by
// run.js) needs the pinned chrome-headless-shell and is skipped without it.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..", "..");
const GOLDEN = path.join(REPO, "test", "golden");
const scenarios = require(path.join(GOLDEN, "scenarios.js"));
const compare = require(path.join(GOLDEN, "compare.js"));
const waivers = require(path.join(GOLDEN, "waivers.js"));
const run = require(path.join(GOLDEN, "run.js"));
const canon = require(path.join(REPO, "test", "lib", "canon.js"));
const unzip = require(path.join(REPO, "test", "lib", "unzip.js"));

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-golden-"));
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// ---------------------------------------------------------------- scenarios

const MONTHS = ["2025-11", "2025-12", "2026-02", "2026-03", "2026-04"]; // one gap (2026-01)

test("inputsFromAccept reads the declared inputs in accept order", () => {
  assert.deepEqual(scenarios.inputsFromAccept("application/pdf,.pdf,text/csv,.csv"), ["pdf", "csv"]);
  assert.deepEqual(scenarios.inputsFromAccept(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), ["xlsx"]);
  assert.deepEqual(scenarios.inputsFromAccept("text/csv, .PDF"), ["csv", "pdf"]);
  assert.throws(() => scenarios.inputsFromAccept("image/png"), /unknown token/);
  assert.throws(() => scenarios.inputsFromAccept(""), /accepts no declared input/);
  assert.deepEqual(scenarios.syntheticFiles(["csv", "pdf"]).map((f) => [f.use, f.name, f.text]), [
    ["bogus", "zz-not-a-statement.csv", "hello"],
    ["other", "aa-not-a-csv.txt", "not a statement"],
  ]);
});

test("rangesFor builds every tier's ranges once, under the first label", () => {
  const labels = (set) => scenarios.rangesFor(MONTHS, set).map((r) => `${r.label}=${r.from}..${r.to}`);
  assert.deepEqual(labels("quick"), ["full=2025-11..2026-04", "first=2025-11..2025-11", "last=2026-04..2026-04", "mid=2026-02..2026-02", "rev=2026-04..2025-11"]);
  assert.deepEqual(labels("full+last"), ["full=2025-11..2026-04", "last=2026-04..2026-04"]);
  assert.deepEqual(labels("full-only"), ["full=2025-11..2026-04"]);
  const full = scenarios.rangesFor(MONTHS, "full");
  assert.deepEqual(full.map((r) => r.label), ["full", "first", "last", "mid", "rev", "m1", "m3", "p1", "p2", "p3", "s1", "s2", "s3"]);
  // The gap range [next(gap), last] is the suffix from 2026-02, so it is listed as s2 only.
  assert.ok(full.some((r) => r.label === "s2" && r.from === "2026-02" && r.to === "2026-04"));
  const pairs = new Set(full.map((r) => `${r.from}:${r.to}`));
  assert.equal(pairs.size, full.length, "no (from, to) pair twice");
  const ex = scenarios.rangesFor(MONTHS, "exhaustive");
  assert.equal(ex.length, full.length + (15 - 13 + 1), "every i <= j pair, plus the reversed range");
  assert.ok(ex.every((r, i) => ex.findIndex((x) => x.from === r.from && x.to === r.to) === i));
  assert.deepEqual(scenarios.rangesFor([], "full"), []);
  assert.deepEqual(scenarios.rangesFor(["2026-01"], "quick").map((r) => r.label), ["full"]);
  // A gap is any missing calendar month, across a year end too.
  assert.deepEqual(scenarios.rangesFor(["2025-11", "2026-01", "2026-02", "2026-03"], "full").filter((r) => r.label.startsWith("g")).map((r) => r.label), []);
  assert.equal(scenarios.nextMonth("2025-12"), "2026-01");
  assert.throws(() => scenarios.rangesFor(MONTHS, "some"), /unknown range set/);
});

test("iterationSteps clicks modes and sets ranges in the declared order", () => {
  const mr = scenarios.iterationSteps({ order: "mr", ranges: "full+last" }, ["balance", "month"], MONTHS);
  assert.deepEqual(mr, [
    { key: "balance/full", act: [["mode", "balance"], ["range", "2025-11", "2026-04"]] },
    { key: "balance/last", act: [["range", "2026-04", "2026-04"]] },
    { key: "month/full", act: [["mode", "month"], ["range", "2025-11", "2026-04"]] },
    { key: "month/last", act: [["range", "2026-04", "2026-04"]] },
  ]);
  const rm = scenarios.iterationSteps({ order: "rm", ranges: "full+last" }, ["balance", "month"], MONTHS);
  assert.deepEqual(rm.map((s) => s.key), ["then-balance/full", "then-month/full", "then-balance/last", "then-month/last"]);
  assert.deepEqual(rm[0].act, [["range", "2025-11", "2026-04"], ["mode", "balance"]]);
  assert.deepEqual(rm[1].act, [["mode", "month"]]);
  assert.deepEqual(scenarios.iterationSteps({ order: "mr", ranges: "quick" }, ["balance"], []), [{ key: "balance/none", act: [["mode", "balance"]] }]);
  assert.throws(() => scenarios.iterationSteps({ order: "xy", ranges: "quick" }, ["balance"], MONTHS), /unknown iteration order/);
});

// A synthetic probe: three portfolios, two currencies, kinds Investment / Cash-like / Bank.
const PORTFOLIOS = [
  { index: 0, id: "acct-a:SGD", label: "Alpha", autoKind: "Investment", currency: "SGD" },
  { index: 1, id: "acct-b:USD", label: "Beta", autoKind: "Cash-like", currency: "USD" },
  { index: 2, id: "acct-c:SGD", label: "Gamma", autoKind: "Bank", currency: "SGD" },
];
const STATEMENT_FACTS = {
  app: "statement", inputs: ["pdf", "csv"], multiple: true, modeKey: "example-csv-mode", configKey: "example-csv-accounts",
  modeValues: ["balance", "tradelog", "holdings"], configKinds: ["", "investment", "cash"],
};
const FILES = ["/s/0-history.csv", "/s/a-2025-11.pdf", "/s/b-2025-12.pdf", "/s/c-2026-02.pdf"];
const SYNTHETIC = { bogus: "/p/zz-not-a-statement.pdf", other: "/p/aa-not-a-pdf.txt" };
const statementList = (tier, extra = {}) => scenarios.generate({
  id: "example", tier, facts: { ...STATEMENT_FACTS, ...extra.facts }, probe: { months: MONTHS, modeVisible: true, portfolios: extra.portfolios || PORTFOLIOS, cards: [] },
  files: extra.files || FILES, synthetic: SYNTHETIC, otherModeValues: ["balance", "month", "day", "tradelog"], security: extra.security,
});

test("generate: the quick tier of a statement app", () => {
  const list = statementList("quick");
  assert.deepEqual(list.pages.map((p) => p.id), [
    "example/E0/O0/I0/C0",
    "example/E0/O4-dnd/I0/C0",
    "example/E0/O0/I0/C-ui-kind",
    "example/E0/O0/I0/C-ui-merge",
    "example/E0/O0/I0/C-seed-bank",
    "example/E0/O0/I0/C-seed-badname",
    "example/E0/O0/I0/S-benign",
    "example/E0/O0/I0/S-break",
    "example/E1/O0/I0/C0",
    "example/E2/O0/I0/C0",
  ]);
  assert.deepEqual(list.skipped, []);
  const byId = Object.fromEntries(list.pages.map((p) => [p.id, p]));
  const base = byId["example/E0/O0/I0/C0"];
  assert.equal(base.static, true);
  assert.deepEqual(base.actions, [{ load: { files: FILES, via: "picker" } }, { iterate: { order: "mr", ranges: "quick" } }]);
  assert.deepEqual(byId["example/E0/O4-dnd/I0/C0"].actions[0], { load: { files: FILES, via: "drop" } });
  assert.deepEqual(byId["example/E0/O0/I0/C-ui-kind"].actions.filter((a) => a.config), [
    { config: { kind: { index: 1, value: "investment" } } },
    { config: { kind: { index: 0, value: "cash" } } },
    { config: { reset: true } },
  ]);
  assert.deepEqual(byId["example/E0/O0/I0/C-ui-merge"].actions.filter((a) => a.config)[0], { config: { merge: { from: 2, into: 0 } } }, "same currency as p0");
  assert.deepEqual(byId["example/E0/O0/I0/C-seed-bank"].seed, { raw: { "example-csv-accounts": '{"acct-a:SGD":{"kind":"bank"}}' } });
  const bad = byId["example/E0/O0/I0/C-seed-badname"];
  assert.deepEqual(bad.seed, { raw: { "example-csv-accounts": '{"acct-a:SGD":{"name":5}}' } });
  assert.deepEqual(bad.actions.map((a) => Object.keys(a)[0]), ["load", "config", "iterate"], "load, reset, then every mode x quick range");
  assert.deepEqual(byId["example/E1/O0/I0/C0"].actions[1], { iterate: { order: "mr", ranges: "full+last" } });
  // The S scenarios (from M8): seeded payloads on p0; S-break runs on the new page only.
  const benign = byId["example/E0/O0/I0/S-benign"];
  const brk = byId["example/E0/O0/I0/S-break"];
  assert.deepEqual(benign.seed, { raw: { "example-csv-accounts": JSON.stringify({ "acct-a:SGD": { name: scenarios.SECURITY_PAYLOADS.benign } }) } });
  assert.deepEqual(brk.seed, { raw: { "example-csv-accounts": JSON.stringify({ "acct-a:SGD": { kind: scenarios.SECURITY_PAYLOADS.breaking } }) } });
  assert.deepEqual([benign.newOnly, brk.newOnly], [undefined, true]);
  assert.deepEqual(brk.actions, [{ load: { files: FILES, via: "picker" } }, { iterate: { order: "mr", ranges: "quick" } }]);
  assert.equal(canon(statementList("quick")), canon(list), "deterministic");
});

test("generate: the full tier covers every axis value, one factor at a time", () => {
  const list = statementList("full");
  const ids = list.pages.map((p) => p.id);
  for (const id of ["E0/O1/I0/C0", "E0/O2/I0/C0", "E0/O3/I0/C0", "E0/O4-dnd/I0/C0", "E0/O0/I-omit-mid/C0", "E0/O0/I-last/C0",
    "E0/O0/I-bogus-first/C0", "E0/O0/I-bogus-last/C0", "E0/O0/I-pdf-only/C0", "E0/O0/I-csv-only/C0", "E0/O0/I0/C-ui-rename",
    "E0/O0/I0/C-ui-exclude", "E0/O0/I0/C-ui-combo", "E0/O0/I0/C-ui-rename-p1", "E0/O0/I0/C-ui-kind-p0-cash", "E0/O0/I0/C-ui-kind-p1-investment",
    "E0/O0/I0/C-ui-kind-p2-investment", "E0/O0/I0/C-ui-kind-p2-cash", "E0/O0/I0/C-ui-exclude-p0", "E0/O0/I0/C-ui-merge-p0",
    "E0/O0/I0/C-ui-same-name", "E0/O0/I0/C-seed-foo", "E0/O0/I0/C-seed-unknown", "E0/O0/I0/C-seed-cycle",
    "E0/O0/I0/C-seed-chain", "E0/O0/I0/C-seed-exclude-root", "E0/O0/I0/C-seed-spaces", "E0/O0/I0/C-seed-str-badjson",
    "E0/O0/I0/C-seed-str-null", "E0/O0/I0/C-seed-str-array", "E0/O0/I0/C-seed-str-number", "E0/O0/I0/C-seed-str-string",
    "E0/O0/I0/X-combo", "E0/O0/I0/C0/M-seed-balance", "E0/O0/I0/C0/M-seed-day", "E0/O0/I0/C0/M-seed-month", "E0/O0/I0/C0/M-seed-empty",
    "E0/O0/I0/C0/M-seed-garbage", "E1/O0/I0/C-ui-combo", "E2/O0/I0/C-ui-combo"]) {
    assert.ok(ids.includes(`example/${id}`), id);
  }
  // No kind scenario for a portfolio's own auto kind; duplicates of other pages are skipped.
  assert.ok(!ids.includes("example/E0/O0/I0/C-ui-kind-p0-investment"));
  const skipped = Object.fromEntries(list.skipped.map((s) => [s.id, s.reason]));
  assert.equal(skipped["example/E0/O0/I0/C-ui-rename-p0"], "same steps as example/E0/O0/I0/C-ui-rename");
  assert.equal(skipped["example/E0/O0/I0/C-ui-exclude-p2"], "same steps as example/E0/O0/I0/C-ui-exclude");
  // The cross-currency merge (p1 into p0) is the per-portfolio merge of p1, so it runs once.
  assert.equal(skipped["example/E0/O0/I0/C-ui-cross-ccy"], "same steps as example/E0/O0/I0/C-ui-merge-p1");
  // Ids use indexes, never portfolio ids or labels.
  for (const p of list.pages) for (const x of PORTFOLIOS) assert.ok(!p.id.includes(x.id) && !p.id.includes(x.label), p.id);
  const byId = Object.fromEntries(list.pages.map((p) => [p.id, p]));
  assert.deepEqual(byId["example/E0/O0/I0/X-combo"].seed, { fromPage: "example/E0/O0/I0/C-ui-combo" });
  assert.deepEqual(byId["example/E0/O0/I0/C0/M-seed-empty"].seed, { raw: { "example-csv-mode": "" } });
  assert.deepEqual(byId["example/E0/O0/I0/C0/M-seed-empty"].actions, [{ load: { files: FILES, via: "picker" } }], "one load, no clicks");
  assert.deepEqual(ids.filter((i) => i.includes("M-seed-")).map((i) => i.split("/").pop()),
    ["M-seed-balance", "M-seed-tradelog", "M-seed-holdings", "M-seed-day", "M-seed-month", "M-seed-empty", "M-seed-garbage"]);
  assert.deepEqual(byId["example/E0/O2/I0/C0"].actions.slice(0, 3).map((a) => a.load.files), [FILES.slice(0, 2), FILES.slice(2), FILES]);
  assert.deepEqual(byId["example/E0/O3/I0/C0"].actions.slice(0, 3).map((a) => Object.keys(a)[0]), ["load", "clear", "load"]);
  assert.deepEqual(byId["example/E0/O1/I0/C0"].actions[0].load.files, FILES.slice().reverse());
  assert.deepEqual(byId["example/E0/O0/I-omit-mid/C0"].actions[0].load.files, [FILES[0], FILES[1], FILES[3]]);
  assert.deepEqual(byId["example/E0/O0/I-pdf-only/C0"].actions[0].load.files, FILES.slice(1));
  assert.deepEqual(byId["example/E0/O0/I-last/C0"].actions[0].load.files, [FILES[3]]);
  assert.deepEqual(byId["example/E0/O0/I-bogus-first/C0"].actions[0].load.files, [SYNTHETIC.bogus, ...FILES]);
  assert.deepEqual(byId["example/E0/O0/I-bogus-last/C0"].actions[0].load.files, [...FILES, SYNTHETIC.bogus]);
  assert.deepEqual(byId["example/E0/O0/I-csv-only/C0"].actions[0].load.files, [FILES[0]]);
  assert.deepEqual(byId["example/E0/O0/I0/C-ui-merge-p1"].actions.filter((a) => a.config)[0], { config: { merge: { from: 1, into: 0 } } });
  assert.deepEqual(byId["example/E0/O0/I0/C-ui-merge-p0"].actions.filter((a) => a.config)[0], { config: { merge: { from: 0, into: 1 } } });
  assert.deepEqual(byId["example/E0/O0/I0/C-seed-chain"].seed.raw["example-csv-accounts"], '{"acct-c:SGD":{"mergeInto":"acct-b:USD"},"acct-b:USD":{"mergeInto":"acct-a:SGD"}}');
  const combo = byId["example/E0/O0/I0/C-ui-combo"];
  assert.deepEqual(combo.actions.filter((a) => a.config).map((a) => Object.keys(a.config)[0]), ["rename", "kind", "kind", "merge", "exclude", "reset"]);
  assert.deepEqual(combo.actions.find((a) => a.iterate), { iterate: { order: "mr", ranges: "full" } });
  assert.deepEqual(byId["example/E0/O0/I0/C-ui-kind"].actions.find((a) => a.iterate).iterate.ranges, "quick", "other C values keep the quick ranges");
  assert.deepEqual(byId["example/E0/O0/I0/C0"].actions.find((a) => a.iterate).iterate.ranges, "full");
  assert.equal(statementList("exhaustive").pages.find((p) => p.id === "example/E0/O0/I0/C0").actions[1].iterate.ranges, "exhaustive");
  assert.equal(statementList("exhaustive").pages.find((p) => p.id === "example/E0/O1/I0/C0").actions[1].iterate.ranges, "full");
});

test("generate: skips are deterministic and recorded", () => {
  const one = statementList("full", { portfolios: [PORTFOLIOS[0]], files: FILES.slice(1, 3) });
  const skipped = Object.fromEntries(one.skipped.map((s) => [s.id.split("/").slice(1).join("/"), s.reason]));
  assert.equal(skipped["E0/O0/I-omit-mid/C0"], "fewer than 3 inputs");
  assert.equal(skipped["E0/O0/I0/C-ui-merge"], "fewer than 2 portfolios");
  assert.equal(skipped["E0/O0/I0/C-ui-exclude"], "only one portfolio");
  assert.equal(skipped["E0/O0/I0/C-ui-cross-ccy"], "a single currency");
  assert.equal(skipped["E0/O0/I0/C-seed-chain"], "fewer than 3 portfolios");
  assert.equal(skipped["E0/O0/I-csv-only/C0"], "no csv input");
  for (const tier of ["quick", "full", "exhaustive"]) {
    const sec = statementList(tier).pages.filter((p) => p.c.startsWith("S-"));
    assert.deepEqual(sec.map((p) => `${p.id}:${!!p.newOnly}`), ["example/E0/O0/I0/S-benign:false", "example/E0/O0/I0/S-break:true"], `${tier}: the S scenarios by default since M8`);
    assert.ok(!statementList(tier, { security: false }).pages.some((p) => p.c.startsWith("S-")), `${tier}: security false gives the list from before M8`);
  }
  assert.deepEqual(one.pages.filter((p) => p.newOnly).map((p) => p.c), ["S-break"], "one portfolio is enough");
  assert.throws(() => statementList("nightly"), /unknown tier/);
});

test("generate: a single-file picker without a configurator", () => {
  const facts = { app: "custom", inputs: ["xlsx"], multiple: false, modeKey: "example-csv-group", configKey: null, modeValues: ["balance", "month", "day"], configKinds: null };
  const gen = (tier) => scenarios.generate({ id: "single", tier, facts, probe: { months: MONTHS, modeVisible: true, portfolios: [], cards: [] },
    files: ["/s/book.xlsx"], synthetic: { bogus: "/p/zz-not-a-statement.xlsx", other: "/p/aa-not-a-xlsx.txt" }, otherModeValues: ["tradelog", "holdings"] });
  const quick = gen("quick");
  assert.deepEqual(quick.pages.map((p) => p.id), ["single/E0/O0/I0/C0", "single/E0/O4-dnd/I0/C0", "single/E0/O4b-dnd/I0/C0", "single/E1/O0/I0/C0", "single/E2/O0/I0/C0"]);
  assert.deepEqual(quick.pages[0].actions.slice(1), [{ iterate: { order: "mr", ranges: "quick" } }, { iterate: { order: "rm", ranges: "quick" } }], "custom apps: both orders");
  assert.deepEqual(quick.pages[2].actions[0], { load: { files: ["/p/aa-not-a-xlsx.txt", "/s/book.xlsx"], via: "drop" } });
  assert.deepEqual(quick.skipped.map((s) => s.id.split("/").pop()), ["C-ui-kind", "C-ui-merge", "C-seed-bank", "C-seed-badname", "S-benign", "S-break"]);
  assert.ok(quick.skipped.every((s) => s.reason === "no configurator"));
  const full = gen("full");
  const ids = full.pages.map((p) => p.id);
  for (const i of ["I-replace-twice", "I-replace-bogus-real", "I-replace-real-bogus"]) assert.ok(ids.includes(`single/E0/O0/${i}/C0`), i);
  assert.deepEqual(full.pages.find((p) => p.id === "single/E0/O0/I-replace-bogus-real/C0").actions.slice(0, 2).map((a) => a.load.files),
    [["/p/zz-not-a-statement.xlsx"], ["/s/book.xlsx"]]);
  const reasons = Object.fromEntries(full.skipped.map((s) => [s.id.split("/").slice(1).join("/"), s.reason]));
  for (const k of ["E0/O1/I0/C0", "E0/O2/I0/C0", "E0/O3/I0/C0", "E0/O0/I-omit-mid/C0", "E0/O0/I-last/C0", "E0/O0/I-bogus-first/C0", "E0/O0/I-bogus-last/C0"]) {
    assert.equal(reasons[k], "single-file picker", k);
  }
  assert.equal(reasons["E0/O0/I0/X-combo"], "no configurator");
  assert.deepEqual(ids.filter((i) => i.includes("M-seed-")).map((i) => i.split("/").pop()),
    ["M-seed-balance", "M-seed-month", "M-seed-day", "M-seed-holdings", "M-seed-tradelog", "M-seed-empty", "M-seed-garbage"]);
});

// ---------------------------------------------------------------- waivers

const LEGACY = { list: "#plist", row: ".prow", count: "#plist-count", reset: "#plist-reset" };

test("W1 and W3 normalise the old page's static snapshot", () => {
  // The old QIF expansion comes from waivers.js, the one file that spells it out.
  assert.ok(waivers.W1.from.startsWith("a ") && waivers.W1.from.endsWith(" Interchange Format file"));
  const old = `<main><p id="empty" class="muted" style="margin-top:24px">No statements yet.</p><li>as ${waivers.W1.from} per account</li>`
    + '<span id="plist-count" class="muted"></span><div id="plist"></div><button id="plist-reset">Reset</button></main>';
  assert.equal(waivers.normaliseStatic(old, { legacyDom: LEGACY }),
    '<main><p id="empty" class="muted">No statements yet.</p><li>as a QIF file per account</li>'
    + '<span id="config-count" class="muted"></span><div id="config-list"></div><button id="config-reset">Reset</button></main>');
  assert.equal(waivers.normaliseStatic('<p id="empty" style="margin-top:24px">x</p>'), '<p id="empty">x</p>');
  assert.equal(waivers.normaliseStatic('<p id="other" style="margin-top:24px">x</p>'), '<p id="other" style="margin-top:24px">x</p>', "only #empty");
  assert.equal(waivers.normaliseStatic(null), null);
});

test("W3 maps whole ids and class tokens only, never text", () => {
  const html = '<div class="prow excluded" data-id="x"><div class="prowx">.prow #plist</div></div><p id="plistx">plist</p>';
  assert.equal(waivers.mapLegacyMarkup(html, LEGACY), '<div class="account-row excluded" data-id="x"><div class="prowx">.prow #plist</div></div><p id="plistx">plist</p>');
  assert.equal(waivers.mapLegacyMarkup(html, null), html);
  assert.deepEqual(waivers.legacyPairs(LEGACY), [["#plist", "#config-list"], [".prow", ".account-row"], ["#plist-count", "#config-count"], ["#plist-reset", "#config-reset"]]);
});

test("W2 and SX1 apply only where declared", () => {
  assert.equal(waivers.w2Eligible({ id: "x/E0/O0/I0/C-seed-badname", c: "C-seed-badname" }), true);
  assert.equal(waivers.w2Eligible({ id: "x/E0/O0/I0/C0", c: "C0" }), false);
  assert.equal(waivers.sx1Applies({ c: "S-break" }), true);
  assert.equal(waivers.sx1Applies({ c: "S-benign" }), false);
  assert.equal(waivers.stripW2Status('<p></p><p class="warn">Could not read these statements: boom</p>', ""), "");
  assert.equal(waivers.stripW2Status("<p></p>", ""), "<p></p>", "without the error line nothing is left over");
  assert.equal(waivers.stripW2Status('<p>2 statements</p><p class="warn">Could not read these statements: boom</p><p class="warn">a.pdf: x</p>', "<p>2 statements</p>"),
    '<p>2 statements</p><p class="warn">a.pdf: x</p>');
  assert.equal(waivers.UI_WAIVERS.map((w) => w.id).join(), "W1,W2,W3");
  assert.equal(waivers.DOWNLOAD_EXCEPTIONS.map((w) => w.id).join(), "SX1");
});

// ---------------------------------------------------------------- comparator

const rec = (o) => ({ trigger: "card", account: "A", card: "A", kind: "transactions", name: "A - transactions - 2026-01.csv", type: "text/csv", size: 10, sha256: "a".repeat(64), ...o });
const entry = (name, sha, o = {}) => ({ name, size: 5, crc32: parseInt(sha.slice(0, 8), 16), sha256: sha.repeat(64 / sha.length), dosTime: 100, dosDate: 200, ...o });

test("compareRecords reports each field, and treats zip entries by set, order and time", () => {
  assert.deepEqual(compare.compareRecords([rec()], [rec()]), []);
  assert.deepEqual(compare.compareRecords([rec()], [rec({ name: "B.csv", size: 11 })]).map((m) => [m.index, m.trigger, m.field, m.expected, m.actual]),
    [[0, "card", "name", "A - transactions - 2026-01.csv", "B.csv"], [0, "card", "size", 10, 11]]);
  assert.deepEqual(compare.compareRecords([rec(), rec()], [rec()]).map((m) => m.field), ["count"]);
  const noCard = rec();
  delete noCard.card;
  assert.deepEqual(compare.compareRecords([rec()], [noCard]), [], "card only when both sides have it");
  assert.deepEqual(compare.compareRecords([{ trigger: "zip", account: null, card: null, kind: null, disabled: true }], [rec({ trigger: "zip", account: null, card: null, kind: null })])
    .map((m) => m.field), ["disabled"]);
  const z = (entries, o) => rec({ trigger: "zip", account: null, card: null, kind: null, type: "application/zip", entries, ...o });
  const e1 = entry("a.csv", "11");
  const e2 = entry("b.csv", "22");
  const order = compare.compareRecords([z([e1, e2])], [z([e2, e1], { sha256: "b".repeat(64) })]);
  assert.deepEqual(order.map((m) => m.field), ["sha256", "entries.order"], "a reordering is one entries.order mismatch");
  const time = compare.compareRecords([z([e1, e2])], [z([{ ...e1, dosTime: 101 }, { ...e2, dosTime: 101 }], { sha256: "b".repeat(64) })]);
  assert.deepEqual(time.map((m) => [m.field, m.entry]), [["sha256", undefined], ["entries.dosTime", 0], ["entries.dosTime", 1]]);
  const renamed = compare.compareRecords([z([e1, e2])], [z([{ ...e1, name: "x.csv" }, e2])]);
  assert.deepEqual(renamed.map((m) => [m.field, m.entry]), [["entries.set", undefined], ["entries.name", 0]]);
  assert.deepEqual(renamed[0].expected, ["a.csv"]);
  assert.deepEqual(renamed[0].actual, ["x.csv"]);
  const lost = compare.compareRecords([z([e1, e2])], [z([e1])]);
  assert.deepEqual(lost.map((m) => m.field), ["entries.count", "entries.set"]);
  assert.deepEqual(compare.compareRecords([z([e1])], [z([e1], { zipError: "CRC mismatch in 1 entry" })]).map((m) => m.field), ["zipError"]);
});

const ui = (o) => ({
  status: "<p>3 statements</p>", cards: '<article class="card"></article>', diagnostics: "<details></details>", config: '<div class="account-row" data-id="a"></div>',
  configCount: "1 detected", from: { options: [["2026-01", "Jan 2026"]], value: "2026-01", disabled: false }, to: { options: [["2026-01", "Jan 2026"]], value: "2026-01", disabled: false },
  modes: [{ mode: "balance", on: true, ariaChecked: "true" }], modeFieldHidden: false, emptyHidden: true, resultsHidden: false, busyHidden: true, busyText: "", toolbar: {}, ...o,
});
const step = (key, o = {}) => ({ key, act: [["open"]], mode: "balance", range: { from: "2026-01", to: "2026-01" }, order: ["/s/a.pdf"], storage: { k: "balance" }, lsKeys: ["k"], ui: ui(), records: [rec()], ...o });

test("compareUi applies W3 to the old markup and W2 to the busy line and status", () => {
  const old = ui({ config: '<div class="prow" data-id="a"></div>' });
  assert.deepEqual(compare.compareUi(old, ui()).mismatches.map((m) => m.field), ["ui.config"]);
  assert.deepEqual(compare.compareUi(old, ui(), { legacyDom: LEGACY }), { mismatches: [], used: ["W3"], w2: [] });
  const stuck = ui({ status: "", busyHidden: false, busyText: "Reading files… 1/1", resultsHidden: true });
  const caught = ui({ status: '<p></p><p class="warn">Could not read these statements: boom</p>', busyHidden: true, busyText: "", resultsHidden: true });
  assert.deepEqual(compare.compareUi(stuck, caught).mismatches.map((m) => m.field), ["ui.status", "ui.busyHidden", "ui.busyText"]);
  assert.deepEqual(compare.compareUi(stuck, caught, { w2: "throwing" }), { mismatches: [], used: ["W2"], w2: ["busy line", "error line"] });
  assert.deepEqual(compare.compareUi(stuck, caught, { w2: "after" }).mismatches.map((m) => m.field), ["ui.status"], "the error line only on the throwing step");
  // A status that lost the error line but kept its empty paragraph is not W2's: a mismatch, and no error line part.
  const lineless = compare.compareUi(stuck, ui({ status: "<p></p>", busyHidden: true, busyText: "", resultsHidden: true }), { w2: "throwing" });
  assert.deepEqual(lineless.mismatches.map((m) => m.field), ["ui.status"]);
  assert.deepEqual(lineless.w2, ["busy line"]);
  // The parts are those that differed: a stuck busy line alone after the throw; nothing on equal UIs.
  assert.deepEqual(compare.compareUi(ui({ busyHidden: false, busyText: "Reading… 1/1" }), ui(), { w2: "after" }), { mismatches: [], used: ["W2"], w2: ["busy line"] });
  assert.deepEqual(compare.compareUi(ui(), ui(), { w2: "throwing" }), { mismatches: [], used: [], w2: [] });
});

test("comparePageErrors: identical lists when strict; no new errors on a new page", () => {
  const fallback = "error: Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'blob:null/<id>' failed to load.";
  const old = { console: [], errors: [fallback, "unhandledrejection: TypeError: boom"], violations: [] };
  assert.deepEqual(compare.comparePageErrors(old, { console: [], errors: [fallback], violations: [] }), []);
  assert.deepEqual(compare.comparePageErrors(old, { console: [], errors: [fallback, fallback], violations: [] }), [], "worker fallbacks never count");
  assert.deepEqual(compare.comparePageErrors(old, { console: [], errors: ["error: Uncaught ReferenceError: x"], violations: [] }).map((m) => m.field), ["errors.errors"]);
  assert.deepEqual(compare.comparePageErrors(old, { console: ["oops"], errors: [], violations: [{ directive: "img-src", blockedURI: "x" }] }).map((m) => m.field),
    ["errors.violations", "errors.console"]);
  assert.deepEqual(compare.comparePageErrors(old, { console: [], errors: [fallback], violations: [] }, { mode: "strict" }).map((m) => m.field), ["errors.errors"]);
});

test("comparePage: step lists, storage, keys and W2 eligibility", () => {
  const g = { id: "x/E0/O0/I0/C0", c: "C0", errors: { console: [], errors: [], violations: [] }, steps: [step("@open"), step("balance/full")] };
  const same = { ...g, steps: g.steps.map((s) => ({ ...s })) };
  assert.deepEqual(compare.comparePage(g, same, { keys: ["k"] }), { mismatches: [], uses: [] });
  const short = compare.comparePage(g, { ...g, steps: [step("@open")] });
  assert.deepEqual(short.mismatches.map((m) => [m.category, m.field]), [["steps", "steps"]]);
  const stored = compare.comparePage(g, { ...g, steps: [step("@open"), step("balance/full", { storage: { k: "tradelog" }, lsKeys: ["k", "z"] })] }, { keys: ["k"] });
  assert.deepEqual(stored.mismatches.map((m) => [m.category, m.field, m.scenario]), [["storage", "storage.k", "x/E0/O0/I0/C0/balance/full"], ["keys", "lsKeys", "x/E0/O0/I0/C0/balance/full"]]);
  const strict = compare.comparePage(g, { ...g, steps: [step("@open"), step("balance/full", { threw: true })] }, { mode: "strict" });
  assert.deepEqual(strict.mismatches.map((m) => m.field), ["threw"]);
  // W2: the old page threw on the load; the new page caught it.
  const oldSteps = [step("@open"), step("@load1", { busy: "stuck", threw: true, ui: ui({ status: "", busyHidden: false, busyText: "Reading… 1/1" }), records: [] }),
    step("@reset", { ui: ui({ busyHidden: false, busyText: "Reading… 1/1" }) })];
  const newSteps = [step("@open"), step("@load1", { busy: "idle", ui: ui({ status: '<p></p><p class="warn">Could not read these statements: boom</p>' }), records: [] }), step("@reset")];
  const badname = { ...g, id: "x/E0/O0/I0/C-seed-badname", c: "C-seed-badname", steps: oldSteps };
  const r = compare.comparePage(badname, { ...badname, steps: newSteps });
  assert.deepEqual(r.mismatches, []);
  assert.deepEqual(r.uses.map((u) => [u.waiver, u.step]), [["W2", "@load1"], ["W2", "@reset"]], "one use per step");
  assert.deepEqual(r.uses.map((u) => u.parts), [["busy line", "error line"], ["busy line"]], "the error line on the throwing step; the busy state and line there and the stuck line after it");
  // The report lists each use, and the console line per page names where the error line showed.
  const listed = run.waiverHelpers.w2Uses([...r.uses, { waiver: "W3", page: "x/E0/O0/I0/C0", step: "@open" }]);
  assert.deepEqual(listed.list, [{ page: badname.id, step: "@load1", parts: ["busy line", "error line"] }, { page: badname.id, step: "@reset", parts: ["busy line"] }]);
  assert.deepEqual(listed.lines, [`${badname.id}: 2 steps, the error line on @load1, the busy line on 2`]);
  assert.deepEqual(run.waiverHelpers.w2Uses([{ waiver: "W2", page: badname.id, step: "@reset", parts: ["busy line"] }]).lines, [`${badname.id}: 1 step, the error line on none, the busy line on 1`]);
  // A new page that throws like the old page (before M9) uses no waiver.
  const asOld = compare.comparePage(badname, { ...badname, steps: oldSteps });
  assert.deepEqual(asOld, { mismatches: [], uses: [] });
  const elsewhere = compare.comparePage({ ...badname, id: "x/E0/O0/I0/C0", c: "C0" }, { ...badname, steps: newSteps });
  assert.ok(elsewhere.mismatches.length > 0, "W2 never applies outside its pages");
  // SX1: downloads are not compared with the old page; a replay check must take their place.
  const sb = { ...g, id: "x/E0/O0/I0/S-break", c: "S-break" };
  const sx = compare.comparePage(sb, { ...sb, steps: [step("@open"), step("balance/full", { records: [] })] });
  assert.deepEqual([...new Set(sx.mismatches.map((m) => m.category))], ["sx1"]);
  assert.deepEqual(compare.comparePage(sb, { ...sb, steps: [step("@open"), step("balance/full", { records: [] })] }, { sx1: () => [] }).mismatches, []);
});

test("comparePage: on a statement app W2 is required where the old page threw (from M9 on), and run.js asks for it", () => {
  const busyStuck = { busyHidden: false, busyText: "Reading… 1/1" };
  const line = '<p></p><p class="warn">Could not read these statements: boom</p>';
  const oldSteps = [step("@open"), step("@load1", { busy: "stuck", threw: true, ui: ui({ status: "", ...busyStuck }), records: [] }),
    step("@reset", { ui: ui(busyStuck) }), step("balance/full", { ui: ui(busyStuck) })];
  const badname = { id: "x/E0/O0/I0/C-seed-badname", c: "C-seed-badname", errors: { console: [], errors: [], violations: [] }, steps: oldSteps };
  const page = (steps) => ({ ...badname, steps });
  const req = { keys: ["k"], w2Required: true };
  const fields = (r) => r.mismatches.map((m) => [m.category, m.field, m.step, m.expected, m.actual]);
  // The M9 page: the error line on the throwing step, the busy line cleared from there on.
  const m9 = [step("@open"), step("@load1", { busy: "idle", ui: ui({ status: line }), records: [] }), step("@reset"), step("balance/full")];
  const ok = compare.comparePage(badname, page(m9), req);
  assert.deepEqual(ok.mismatches, []);
  assert.deepEqual(ok.w2Check, { page: badname.id, steps: 3, ok: true });
  assert.deepEqual(ok.uses.map((u) => u.parts), [["busy line", "error line"], ["busy line"], ["busy line"]]);
  assert.deepEqual(compare.w2Needs(oldSteps[1], "throwing"), ["busy line", "error line"]);
  assert.deepEqual(compare.w2Needs(oldSteps[2], "after"), ["busy line"]);
  assert.deepEqual(compare.w2Needs(step("@x"), "after"), [], "nothing where the old page's busy line is hidden");
  // A page that throws as the old page does (no catch): identical, so no waiver applies, and the
  // requirement fails on every step from the throw on.
  const asOld = compare.comparePage(badname, page(oldSteps.map((s) => ({ ...s }))), req);
  assert.deepEqual(fields(asOld), [["w2", "w2.throwing", "@load1", ["busy line", "error line"], []], ["w2", "w2.after", "@reset", ["busy line"], []],
    ["w2", "w2.after", "balance/full", ["busy line"], []]]);
  assert.deepEqual(asOld.w2Check, { page: badname.id, steps: 3, ok: false });
  assert.deepEqual(compare.comparePage(badname, page(oldSteps), { keys: ["k"] }), { mismatches: [], uses: [] }, "without the requirement it passes, as before");
  // A catch that leaves #status untouched (no error line): W2 covers the busy line only.
  const silent = [step("@open"), step("@load1", { busy: "idle", ui: ui({ status: "" }), records: [] }), step("@reset"), step("balance/full")];
  assert.deepEqual(fields(compare.comparePage(badname, page(silent), req)), [["w2", "w2.throwing", "@load1", ["busy line", "error line"], ["busy line"]]]);
  assert.deepEqual(compare.comparePage(badname, page(silent), { keys: ["k"] }).mismatches, [], "the review's case: it passed the comparison before");
  // The error line shown, but the busy line left stuck after the throwing step.
  const stuckAfter = [step("@open"), step("@load1", { busy: "idle", ui: ui({ status: line }), records: [] }), step("@reset", { ui: ui(busyStuck) }), step("balance/full")];
  assert.deepEqual(fields(compare.comparePage(badname, page(stuckAfter), req)), [["w2", "w2.after", "@reset", ["busy line"], []]]);
  // The busy line stuck on the throwing step too (the load never settles), with the error line.
  const neverSettles = [step("@open"), step("@load1", { busy: "stuck", ui: ui({ status: line, ...busyStuck }), records: [] }), step("@reset"), step("balance/full")];
  assert.deepEqual(fields(compare.comparePage(badname, page(neverSettles), req)), [["w2", "w2.throwing", "@load1", ["busy line", "error line"], ["error line"]]]);
  // A step the new page never reached lacks every part (the step list fails as well).
  const short = compare.comparePage(badname, page(m9.slice(0, 3)), req);
  assert.deepEqual(short.mismatches.map((m) => [m.category, m.field]), [["steps", "steps"], ["w2", "w2.after"]]);
  // No requirement where W2 does not apply, nor where the old page never threw.
  const calm = page(oldSteps.map((s, i) => (i === 1 ? { ...s, busy: "idle", threw: false, ui: ui({ status: "" }) } : { ...s, ui: ui() })));
  assert.deepEqual(compare.comparePage(calm, { ...calm, steps: calm.steps.map((s) => ({ ...s })) }, req), { mismatches: [], uses: [] });
  const c0 = { ...badname, id: "x/E0/O0/I0/C0", c: "C0" };
  assert.equal(compare.comparePage(c0, { ...c0, steps: oldSteps }, req).w2Check, undefined);
  assert.equal(compare.comparePage(badname, page(oldSteps), { mode: "strict", w2Required: true }).w2Check, undefined, "never in determinism");
  // run.js: statement apps get the requirement, a custom app does not; the summary line.
  const facts = (app) => ({ app, legacyDom: null, modeKey: "m", configKey: app === "custom" ? null : "c" });
  assert.equal(run.waiverHelpers.comparisonCtx(facts("statement")).w2Required, true);
  assert.equal(run.waiverHelpers.comparisonCtx(facts("custom")).w2Required, false);
  assert.equal(run.waiverHelpers.comparisonCtx({ legacyDom: null, modeKey: "m", configKey: "c" }).w2Required, true, "a manifest without the app fact errs on the strict side");
  assert.deepEqual(run.waiverHelpers.comparisonCtx(facts("statement"), { sx1: null }).keys, ["m", "c"]);
  const sum = run.waiverHelpers.w2CheckSummary([ok.w2Check, asOld.w2Check]);
  assert.deepEqual([sum.pages, sum.ok, sum.failed], [2, 1, [badname.id]]);
  assert.match(sum.line, /^required on 2 pages whose old page threw: 1 with the error line on the throwing step and the busy line wherever the old page's stuck one shows; FAILED on x\/E0\/O0\/I0\/C-seed-badname$/);
});

test("comparePage: the static snapshot, with W1 and W3 counted", () => {
  const g = { id: "x/E0/O0/I0/C0", c: "C0", errors: null, steps: [step("@open")], static: `<main><p id="empty" style="margin-top:24px">${waivers.W1.from}</p></main>` };
  const r = compare.comparePage(g, { ...g, static: '<main><p id="empty">a QIF file</p></main>' });
  assert.deepEqual(r.mismatches, []);
  assert.deepEqual(r.uses.map((u) => u.waiver), ["W1", "W3"]);
  assert.deepEqual(compare.comparePage(g, { ...g, static: "<main></main>" }).mismatches.map((m) => m.category), ["static"]);
  assert.deepEqual(compare.comparePage(g, { ...g, static: g.static }, { mode: "strict" }).mismatches, []);
});

test("diff helpers", () => {
  assert.deepEqual(compare.firstDifferingLines("a\nb\nc\nd\ne\n", "a\nB\nc\nD\nE\nF"), [
    { line: 2, expected: "b", actual: "B" }, { line: 4, expected: "d", actual: "D" }, { line: 5, expected: "e", actual: "E" },
  ]);
  assert.deepEqual(compare.entryTable([{ name: "a.csv", size: 3, crc32: 255, dosTime: 1, dosDate: 2 }]), ["0\ta.csv\t3\t000000ff\t1\t2"]);
  assert.deepEqual(compare.countByCategory([{ category: "ui" }, { category: "ui" }, { category: "downloads" }]), { ui: 2, downloads: 1 });
});

// ---------------------------------------------------------------- canaries

// A store-only zip writer in the pages' format (UTF-8 flag, DOS time from the local getters).
function zipParts(files, now) {
  const enc = new TextEncoder();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(enc.encode(f.name));
    const data = Buffer.from(enc.encode(f.text));
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(dosTime, 12);
    cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    chunks.push(local, name, data);
    central.push(cen, name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return [...chunks, ...central, end];
}

const FIXED = Date.parse("2026-01-02T03:04:06Z");

// A sandbox standing in for a page at plan piece 12b: the runtime object, the export layer, the
// zip module and a parser global, with the page's frozen clock. `override` gives the parser its
// own adjustedCsv (an exportOverrides provider).
function sandbox({ override = false } = {}) {
  class FrozenDate extends Date {
    constructor(...a) {
      super(...(a.length ? a : [FIXED]));
    }
    static now() {
      return FIXED;
    }
  }
  const rows = (a, from) => `date,amount,name,notes\n${from}-05,-100.25,Deposit ${a},\n${from}-28,12.30,Fee ${a},\n`;
  const ctx = {
    Date: FrozenDate,
    Blob,
    StatementProvider: { app: "statement", parserGlobal: "ExampleParser", naming: { accountPrefix: "Ex ", brand: "Example", groupNoun: "accounts", slug: "example" } },
    StatementExport: {
      adjustedCsv: (a, from) => rows(a, from),
      transactionsCsv: (a, from) => rows(a, from),
      qif: (a) => `!Type:Bank\nD2026-01-05\nT100.25\nP${a}\n^\n`,
      accountsCsv: (names) => `Type,Name\n${names.map((n) => `Investment,${n}`).join("\n")}\n`,
      combinedTradesCsv: () => "date,account,ticker,qty,price\n2026-01-06,Ex A,FUND,1.5,10.00\n",
      combinedTransactionsCsv: () => "date,account,amount\n2026-01-05,Ex A,-100.25\n",
    },
    StatementZip: {
      zipParts,
      zip(files) {
        return new Blob(zipParts(files, new FrozenDate()), { type: "application/zip" });
      },
    },
    ExampleParser: override ? { parseStatements() {}, adjustedCsv: (a, from) => rows(a, from).replace("Deposit", "Paid in") } : { parseStatements() {} },
  };
  ctx.self = ctx;
  return vm.createContext(ctx);
}

// The statement app's downloads for one state, from a sandbox (after any canary ran): two
// cards (transactions CSV and QIF each), Accounts, a two-file Combined zip, Download all.
async function downloadsOf(S, from, to) {
  const P = Object.assign({}, S.StatementExport, S[S.StatementProvider.parserGlobal]);
  const N = S.StatementProvider.naming;
  const span = from === to ? from : `${from}_to_${to}`;
  const out = [];
  const cardFiles = [];
  for (const a of ["A", "B"]) {
    const files = [{ kind: "transactions", name: `${N.accountPrefix}${a} - transactions - ${span}.csv`, text: P.adjustedCsv(a, from) },
      { kind: "qif", name: `${N.accountPrefix}${a} - ${span}.qif`, text: P.qif(a) }];
    for (const f of files) {
      out.push({ trigger: "card", account: a, card: a, kind: f.kind, name: f.name, blob: new Blob([f.text], { type: "text/csv" }) });
      cardFiles.push(f);
    }
  }
  const accounts = { name: `${N.brand} accounts - ${span}.csv`, text: P.accountsCsv(["Ex A", "Ex B"]) };
  out.push({ trigger: "accounts", account: null, card: null, kind: null, name: accounts.name, blob: new Blob([accounts.text], { type: "text/csv" }) });
  const combined = [{ name: `${N.brand} all ${N.groupNoun} - trades - ${span}.csv`, text: P.combinedTradesCsv() },
    { name: `${N.brand} all ${N.groupNoun} - transactions - ${span}.csv`, text: P.combinedTransactionsCsv() }];
  out.push({ trigger: "combined", account: null, card: null, kind: null, name: `${N.slug}-combined-${from}_to_${to}.zip`, blob: S.StatementZip.zip(combined) });
  out.push({ trigger: "zip", account: null, card: null, kind: null, name: `${N.slug}-csv-${from}_to_${to}.zip`, blob: S.StatementZip.zip([accounts, ...cardFiles]) });
  const records = [];
  for (const d of out) {
    const bytes = Buffer.from(await d.blob.arrayBuffer());
    const r = { trigger: d.trigger, account: d.account, card: d.card, kind: d.kind, name: d.name, type: d.blob.type, size: bytes.length, sha256: sha256(bytes) };
    if (d.blob.type === "application/zip") r.entries = unzip(bytes).map((e) => ({ name: e.name, size: e.size, crc32: e.crc32, sha256: e.sha256, dosTime: e.dosTime, dosDate: e.dosDate }));
    records.push(r);
  }
  return records;
}

const STATES = [["balance/full", "2026-01", "2026-02"], ["balance/first", "2026-01", "2026-01"]];

async function canaryMismatches(name, opts = {}) {
  const golden = sandbox(opts);
  const page = sandbox(opts);
  if (name) vm.runInContext(fs.readFileSync(path.join(GOLDEN, "canaries", `${name}.js`), "utf8"), page, { filename: `${name}.js` });
  const goldenSteps = [];
  const mismatches = [];
  for (const [key, from, to] of STATES) {
    const g = await downloadsOf(golden, from, to);
    const c = await downloadsOf(page, from, to);
    goldenSteps.push({ key, records: g });
    for (const m of compare.compareRecords(g, c)) mismatches.push({ page: "x/E0/O0/I0/C0", step: key, scenario: `x/E0/O0/I0/C0/${key}`, category: "downloads", ...m });
  }
  return { mismatches, goldenSteps };
}

test("each canary fails in exactly its expected way, and in no other canary's way", async () => {
  const results = {};
  for (const c of compare.CANARIES) results[c] = await canaryMismatches(c);
  for (const c of compare.CANARIES) {
    for (const check of compare.CANARIES) {
      const r = compare.checkCanary(check, results[c]);
      assert.equal(r.ok, c === check, `${c} checked as ${check}: ${r.problems.join("; ")}`);
    }
  }
  const nothing = await canaryMismatches(null);
  assert.deepEqual(nothing.mismatches, []);
  for (const check of compare.CANARIES) assert.equal(compare.checkCanary(check, nothing).ok, false, `${check} must not pass on an unchanged page`);
  assert.equal(compare.checkCanary("other", nothing).ok, false);
});

test("the canaries change only what they declare", async () => {
  const brand = await canaryMismatches("brand");
  assert.deepEqual([...new Set(brand.mismatches.map((m) => `${m.trigger}:${m.field}`))].sort(),
    ["accounts:name", "combined:entries.name", "combined:entries.set", "combined:sha256", "combined:size", "zip:entries.name", "zip:entries.set", "zip:sha256", "zip:size"]);
  const cent = await canaryMismatches("cent");
  assert.deepEqual([...new Set(cent.mismatches.map((m) => `${m.trigger}:${m.field}`))].sort(),
    ["card:sha256", "zip:entries.crc32", "zip:entries.set", "zip:entries.sha256", "zip:sha256"]);
  const order = await canaryMismatches("zip-order");
  assert.deepEqual([...new Set(order.mismatches.map((m) => `${m.trigger}:${m.field}`))].sort(), ["combined:entries.order", "combined:sha256", "zip:entries.order", "zip:sha256"]);
  const time = await canaryMismatches("zip-time");
  assert.deepEqual([...new Set(time.mismatches.map((m) => `${m.trigger}:${m.field}`))].sort(), ["combined:entries.dosTime", "combined:sha256", "zip:entries.dosTime", "zip:sha256"]);
  // DOS time 03:04:06 becomes 03:04:08 (two-second units 3 -> 4) on every entry.
  const t = time.mismatches.find((m) => m.field === "entries.dosTime");
  assert.equal(t.actual - t.expected, 1);
});

test("the cent canary also wraps a parser's own writers, keeping sizes", async () => {
  const r = await canaryMismatches("cent", { override: true });
  assert.equal(compare.checkCanary("cent", r).ok, true, compare.checkCanary("cent", r).problems.join("; "));
  const S = sandbox({ override: true });
  vm.runInContext(fs.readFileSync(path.join(GOLDEN, "canaries", "cent.js"), "utf8"), S);
  assert.equal(S.ExampleParser.adjustedCsv("A", "2026-01"), "date,amount,name,notes\n2026-01-05,-100.26,Paid in A,\n2026-01-28,12.30,Fee A,\n");
  assert.equal(S.StatementExport.transactionsCsv("A", "2026-01"), "date,amount,name,notes\n2026-01-05,-100.26,Deposit A,\n2026-01-28,12.30,Fee A,\n");
  assert.equal(typeof S.ExampleParser.parseStatements, "function", "the parser keeps its other exports");
  const T = sandbox();
  vm.runInContext(fs.readFileSync(path.join(GOLDEN, "canaries", "cent.js"), "utf8"), T);
  assert.equal(Object.prototype.hasOwnProperty.call(T.ExampleParser, "adjustedCsv"), false, "a parser without overrides is left alone");
  assert.equal(T.StatementExport.adjustedCsv("A", "2026-09"), "date,amount,name,notes\n2026-09-05,-100.26,Deposit A,\n2026-09-28,12.30,Fee A,\n", "only the first data row");
  assert.equal(T.StatementExport.qif("A"), "!Type:Bank\nD2026-01-05\nT100.25\nPA\n^\n", "other writers are untouched");
});

test("canary pieces pass the build's piece guards", () => {
  const { guard } = require(path.join(REPO, "build", "scripts.js"));
  for (const c of compare.CANARIES) {
    const file = path.join(GOLDEN, "canaries", `${c}.js`);
    const bytes = fs.readFileSync(file);
    assert.notEqual(bytes[0], 0xef, `${c}: no byte order mark`);
    assert.doesNotThrow(() => guard(bytes.toString("utf8"), c));
  }
});

// ---------------------------------------------------------------- run.js helpers

test("parseArgs: commands, tiers and defaults", () => {
  const o = run.parseArgs(["capture", "--tier", "full", "--providers", "a,b", "--env", "E0,E2", "--keep-bytes", "--statements", "a=/x"]);
  assert.deepEqual([o.command, o.tier, o.providers, o.envs, o.keepBytes, o.statements, o.live, o.passthrough], ["capture", "full", ["a", "b"], ["E0", "E2"], true, ["a=/x"], true, true]);
  assert.ok(o.jobs >= 1 && o.jobs <= 4);
  assert.equal(run.parseArgs(["determinism"]).tier, "quick");
  assert.throws(() => run.parseArgs(["capture"]), /needs --tier/);
  assert.throws(() => run.parseArgs(["capture", "--tier", "nightly"]), /--tier must be one of/);
  assert.throws(() => run.parseArgs(["canary"]), /needs --provider/);
  assert.throws(() => run.parseArgs(["frobnicate"]), /unknown command/);
  assert.throws(() => run.parseArgs(["baseline", "--env", "E7"]), /unknown environment/);
  assert.throws(() => run.parseArgs(["baseline", "--jobs", "0"]), /positive integer/);
  assert.equal(run.parseArgs(["baseline", "--no-live"]).live, false);
  assert.equal(o.security, true, "the S scenarios by default since M8");
  assert.equal(run.parseArgs(["capture", "--tier", "quick", "--no-security"]).security, false);
  assert.equal(run.parseArgs(["capture", "--tier", "quick", "--security"]).security, true);
});

test("manifest steps round trip through the content-addressed tables", () => {
  const t = run.makeTables();
  const page = { orders: [], orderKeys: [], steps: [] };
  const raw = step("balance/full", { busy: "idle", threw: true, passthrough: 1, ui: ui({ from: { options: [["2026-01", "Jan 2026"], ["2026-02", "Feb 2026"]], value: "2026-01", disabled: false } }) });
  const a = run.compactStep(raw, page, t);
  const b = run.compactStep({ ...raw, key: "balance/last" }, page, t);
  const open = run.compactStep(step("@open", { ui: ui({ config: null, from: null, to: null }), order: [] }), page, t);
  assert.equal(a.downloads, b.downloads, "equal record lists are stored once");
  assert.equal(a.ui.cards, b.ui.cards);
  assert.deepEqual(page.orders, [["/s/a.pdf"], []], "equal add orders are stored once");
  delete page.orderKeys;
  const m = { parts: t.parts, lists: t.lists };
  const back = run.expandStep(m, page, a);
  assert.deepEqual(back, { ...raw, threw: true });
  assert.equal(canon(back.ui), canon(raw.ui));
  const openBack = run.expandStep(m, page, open);
  assert.deepEqual([openBack.ui.config, openBack.ui.from, openBack.order, openBack.busy, openBack.threw], [null, null, [], undefined, false]);
  const files = [{ name: "a.pdf", size: 1, sha256: "x" }, { name: "b.pdf", size: 2, sha256: "y" }];
  assert.match(run.inputsSha12(files), /^[0-9a-f]{12}$/);
  assert.notEqual(run.inputsSha12(files), run.inputsSha12(files.slice(0, 1)));
});

test("manifest bytes do not depend on the order in which parallel pages finished", () => {
  const fill = (order) => {
    const t = run.makeTables();
    for (const text of order) t.part(text);
    for (const r of order) t.list([rec({ name: r })]);
    return { format: run.FORMAT, provider: "x", pages: [], parts: t.parts, lists: t.lists, ms: order.length };
  };
  const a = fill(["one", "two", "three"]);
  const b = fill(["three", "one", "two"]);
  assert.notEqual(JSON.stringify(a.parts), JSON.stringify(b.parts), "the tables were filled in another order");
  assert.equal(run.manifestText(a), run.manifestText(b));
  assert.ok(!run.manifestText(a).includes('"ms"'), "timings are not part of a manifest");
});

test("compareStrict finds any difference between two captures", () => {
  const t = run.makeTables();
  const mk = (records) => {
    const page = { id: "x/E0/O0/I0/C0", c: "C0", actions: [], seed: null, orders: [], orderKeys: [], steps: [], errors: { console: [], errors: [], violations: [] } };
    page.steps = [run.compactStep(step("@open"), page, t), run.compactStep(step("balance/full", { records }), page, t)];
    delete page.orderKeys;
    return { format: run.FORMAT, provider: "x", tier: "quick", env: { id: "E0" }, versions: {}, page: {}, inputs: {}, facts: {}, probe: null, skipped: [], pages: [page], parts: t.parts, lists: t.lists };
  };
  assert.deepEqual(run.compareStrict(mk([rec()]), mk([rec()])), []);
  const extra = mk([rec()]);
  extra.parts = { ...extra.parts, ffffffffffffffff: "<p>unreferenced</p>" };
  assert.deepEqual(run.compareStrict(mk([rec()]), extra).map((m) => [m.category, m.field]), [["meta", "parts"]], "the tables are compared too");
  const diff = run.compareStrict(mk([rec()]), mk([rec({ sha256: "c".repeat(64) })]));
  assert.deepEqual(diff.map((m) => [m.category, m.field, m.scenario]), [["downloads", "sha256", "x/E0/O0/I0/C0/balance/full"]]);
  assert.equal(run.manifestStats(mk([rec()])).records, 2);
  // A new-page-only page (S-break) is recorded with no steps and counted apart.
  const withNew = mk([rec()]);
  withNew.pages.push({ id: "x/E0/O0/I0/S-break", c: "S-break", actions: [], seed: null, newOnly: true, orders: [], steps: [] });
  const st = run.manifestStats(withNew);
  assert.deepEqual([st.pages, st.newOnly, st.steps], [1, 1, 2]);
});

test("new-page-only scenarios: which pages, and what each step must show", () => {
  const { isNewOnly, newOnlyStepProblems } = run.newOnlyHelpers;
  assert.equal(isNewOnly({ c: "S-break", newOnly: true }), true);
  assert.equal(isNewOnly({ c: "S-break" }), true, "an S-break page of a golden captured otherwise");
  assert.equal(isNewOnly({ c: "S-benign" }), false);
  assert.equal(isNewOnly({ c: "C0" }), false);
  assert.equal(isNewOnly(null), false);
  const keys = ["k-mode", "k-config"];
  const seed = { "k-config": "{\"p\":{\"kind\":\"x\\\" y\"}}" };
  const good = { key: "balance/full", busy: undefined, storage: { "k-mode": "balance", "k-config": seed["k-config"] }, lsKeys: ["k-config", "k-mode"] };
  const inert = { pwned: false, onAttrs: [], tags: ["tag other"] };
  const check = (step, view) => newOnlyStepProblems(step, view, { keys, configKey: "k-config", seed }).map((m) => `${m.category}:${m.field}`);
  assert.deepEqual(check(good, inert), []);
  assert.deepEqual(check(good, { ...inert, tags: [] }), [], "p0's card need not show in every step");
  assert.deepEqual(check(good, { pwned: true, onAttrs: ["span[onmouseover]"], tags: ["tag x"] }), ["security:pwned", "security:on-attributes", "security:tag"]);
  assert.deepEqual(check({ ...good, busy: "stuck" }, inert), ["busy:busy"]);
  assert.deepEqual(check({ ...good, storage: { ...good.storage, "k-config": "{}" } }, inert), ["storage:storage.k-config"]);
  assert.deepEqual(check({ ...good, lsKeys: [...good.lsKeys, "other"] }, inert), ["keys:lsKeys"]);
});

// ---------------------------------------------------------------- run.js on a synthetic page

const browserLib = require(path.join(REPO, "test", "lib", "browser.js"));
const driverLib = require(path.join(REPO, "test", "lib", "page-driver.js"));
const CHROME_READY = fs.existsSync(browserLib.chromePath());

// A small statement app with the apps' element ids: one account per CSV file ("YYYY-MM,amount"
// lines), a configurator, two modes, cards with two or three files, the three toolbar
// downloads and the pages' store-only zip writer. A non-string configured name throws in the
// parse, like the legacy parsers. It never runs in Node; its source text is the page's script.
function syntheticApp(BRAND) {
  const $ = (s) => document.querySelector(s);
  const MODE_KEY = "synthetic-csv-mode";
  const CONFIG_KEY = "synthetic-csv-accounts";
  let mode = "balance";
  let config = {};
  try {
    mode = localStorage.getItem(MODE_KEY) === "tradelog" ? "tradelog" : "balance";
    config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch (e) {
    config = {};
  }
  const statements = new Map();
  let result = null;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const setBusy = (m) => {
    $("#busy").textContent = m || "";
    $("#busy").hidden = !m;
  };
  function parse(list, cfg) {
    const raw = list.map((s) => ({ id: s.id.replace(/\.csv$/, ""), rows: s.text.split("\n").filter((l) => /^\d{4}-\d{2},/.test(l)).map((l) => l.split(",")) }));
    const accounts = {};
    for (const p of raw) {
      const c = cfg[p.id] || {};
      if (c.exclude) continue;
      const name = (c.name || "").trim() || p.id;
      accounts[name] = { kind: c.kind || (p.rows.length > 1 ? "investment" : "cash"), rows: p.rows };
    }
    const months = [...new Set(raw.flatMap((p) => p.rows.map((r) => r[0])))].sort();
    return { accounts, months, portfolios: raw.map((p) => ({ id: p.id, label: p.id, kind: p.rows.length > 1 ? "investment" : "cash" })) };
  }
  const range = () => {
    let from = $("#from").value;
    let to = $("#to").value;
    if (from && to && from > to) [from, to] = [to, from];
    return { from, to };
  };
  const span = () => (range().from === range().to ? range().from : `${range().from}_to_${range().to}`);
  const rowsOf = (n) => result.accounts[n].rows.filter((r) => r[0] >= range().from && r[0] <= range().to);
  const kinds = (n) => (!rowsOf(n).length ? [] : mode === "tradelog" && result.accounts[n].kind === "investment" ? ["transactions", "trades", "qif"] : ["transactions", "qif"]);
  const fileFor = (n, k) => (k === "qif" ? { name: `${n} - ${span()}.qif`, text: `!Type:Bank\n${rowsOf(n).map((r) => `D${r[0]}-01\nT${r[1]}\n^\n`).join("")}` }
    : { name: `${n} - ${k} - ${span()}.csv`, text: `date,amount\n${rowsOf(n).map((r) => `${r[0]}-01,${r[1]}\n`).join("")}` });
  const names = () => Object.keys(result.accounts).filter((n) => kinds(n).length);
  const accountsFile = () => ({ name: `${BRAND} accounts - ${span()}.csv`, text: `Name\n${names().join("\n")}\n` });
  function render() {
    $("#empty").hidden = !!result;
    $("#results").hidden = !result;
    $("#status").innerHTML = result ? `<p>${result.months.length} months</p>` : "";
    if (!result) return;
    const cards = names().map((n) => `<article class="card"><header><h3>${esc(n)}</h3></header><div class="buttons">${kinds(n).map((k) => `<button class="dl" data-account="${esc(n)}" data-kind="${k}">${k}</button>`).join("")}</div></article>`);
    $("#cards").innerHTML = cards.join("") || '<p class="muted">No activity in the selected months.</p>';
    for (const id of ["accounts", "combined", "zip"]) $(`#${id}`).disabled = !cards.length;
    $("#config-count").textContent = `${result.portfolios.length} detected`;
    $("#config-list").innerHTML = result.portfolios.map((p, i) => `<div class="account-row" data-id="${esc(p.id)}"><div class="p-head"><strong>${esc(p.label)}</strong><span class="muted">${i} · SGD</span></div>`
      + `<input data-field="name" value="${esc((config[p.id] || {}).name || "")}"><select data-field="kind"><option value="">Auto (${p.kind === "investment" ? "Investment" : "Cash-like"})</option>`
      + '<option value="investment">Investment</option><option value="cash">Cash-like</option></select><select data-field="mergeInto"><option value="">—</option></select>'
      + `<input type="checkbox" data-field="include"${(config[p.id] || {}).exclude ? "" : " checked"}></div>`).join("");
  }
  function recompute() {
    result = statements.size ? parse([...statements.values()], config) : null;
    const months = result ? result.months : [];
    for (const [sel, pick] of [[$("#from"), months[0]], [$("#to"), months[months.length - 1]]]) {
      const prev = sel.value;
      sel.innerHTML = months.map((m) => `<option value="${m}">${m}</option>`).join("");
      sel.value = months.includes(prev) ? prev : pick || "";
    }
    render();
  }
  function setMode(m) {
    mode = m;
    localStorage.setItem(MODE_KEY, m);
    for (const b of document.querySelectorAll("#mode button")) {
      b.classList.toggle("on", b.dataset.mode === m);
      b.setAttribute("aria-checked", String(b.dataset.mode === m));
    }
    render();
  }
  async function addFiles(list) {
    const files = [...list].filter((f) => /\.csv$/i.test(f.name));
    if (!files.length) return;
    setBusy(`Reading ${files.length} files…`);
    for (const f of files) {
      const key = `${f.name}:${f.size}`;
      if (!statements.has(key)) statements.set(key, { id: f.name, text: await f.text() });
      await new Promise((r) => setTimeout(r, 5));
    }
    recompute();
    setBusy(null);
  }
  function zip(files) {
    const crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    const crc32 = (b) => {
      let c = 0xffffffff;
      for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const put = (view, fields) => fields.forEach(([o, v, s]) => (s === 4 ? view.setUint32(o, v, true) : view.setUint16(o, v, true)));
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = enc.encode(f.text);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      put(local, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dosTime, 2], [12, dosDate, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]);
      const cen = new DataView(new ArrayBuffer(46));
      put(cen, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dosTime, 2], [14, dosDate, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4],
        [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]);
      chunks.push(local, name, data);
      central.push(cen, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, c) => s + c.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    put(end, [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4], [20, 0, 2]]);
    return new Blob([...chunks, ...central, end], { type: "application/zip" });
  }
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("#cards").addEventListener("click", (e) => {
    const b = e.target.closest("button.dl");
    if (b) download(fileFor(b.dataset.account, b.dataset.kind).name, new Blob([fileFor(b.dataset.account, b.dataset.kind).text], { type: "text/csv" }));
  });
  $("#accounts").addEventListener("click", () => download(accountsFile().name, new Blob([accountsFile().text], { type: "text/csv" })));
  $("#combined").addEventListener("click", () => download(`synthetic-combined-${range().from}_to_${range().to}.zip`, zip(names().map((n) => fileFor(n, "transactions")))));
  $("#zip").addEventListener("click", () => {
    const files = [accountsFile()];
    for (const b of document.querySelectorAll("#cards button.dl")) files.push(fileFor(b.dataset.account, b.dataset.kind));
    download(`synthetic-csv-${range().from}_to_${range().to}.zip`, zip(files));
  });
  $("#config-list").addEventListener("change", (e) => {
    const el = e.target.closest("[data-field]");
    const row = e.target.closest(".account-row");
    const c = { ...(config[row.dataset.id] || {}) };
    if (el.dataset.field === "include") {
      if (el.checked) delete c.exclude;
      else c.exclude = true;
    } else if (el.value.trim()) c[el.dataset.field] = el.value.trim();
    else delete c[el.dataset.field];
    if (Object.keys(c).length) config[row.dataset.id] = c;
    else delete config[row.dataset.id];
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    recompute();
  });
  $("#config-reset").addEventListener("click", () => {
    config = {};
    localStorage.setItem(CONFIG_KEY, "{}");
    recompute();
  });
  $("#picker").addEventListener("change", () => {
    addFiles($("#picker").files);
    $("#picker").value = "";
  });
  for (const ev of ["dragenter", "dragover", "drop"]) document.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  $("#mode").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b) setMode(b.dataset.mode);
  });
  $("#from").addEventListener("change", render);
  $("#to").addEventListener("change", render);
  $("#clear").addEventListener("click", () => {
    statements.clear();
    recompute();
  });
  setMode(mode);
}

const syntheticPage = (brand) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<title>Synthetic</title><style>[hidden] { display: none !important; }</style></head>
<body><main><h1>Synthetic statement converter</h1>
<div id="drop" role="button" tabindex="0">Drop files</div><input id="picker" type="file" accept="text/csv,.csv" multiple hidden>
<p id="busy" hidden></p><div id="status"></div><p id="empty">No statements yet.</p>
<section id="results" hidden><select id="from"></select><select id="to"></select>
<div class="field"><div id="mode"><button data-mode="balance">Balance</button><button data-mode="tradelog">Trade log</button></div></div>
<button id="clear">Clear</button><button id="accounts">Accounts</button><button id="combined">Combined</button><button id="zip">All</button>
<details><summary>Accounts <span id="config-count"></span></summary><div id="config-list"></div><button id="config-reset">Reset</button></details>
<div id="cards"></div><div id="diagnostics"></div></section></main>
<script>(${syntheticApp.toString()})(${JSON.stringify(brand)});</script></body></html>
`;

test("run.js on a synthetic page: steps, pass-through, determinism and comparison", { skip: !CHROME_READY && "the pinned chrome-headless-shell is not installed" }, async () => {
  const dir = fs.mkdtempSync(path.join(TMP, "page-"));
  const page = path.join(dir, "index.html");
  const variant = path.join(dir, "variant.html");
  fs.writeFileSync(page, syntheticPage("Synthetic"));
  fs.writeFileSync(variant, syntheticPage("Synthetic "));
  const files = [];
  for (let i = 0; i < 6; i++) {
    const f = path.join(dir, `acct-${i}.csv`);
    fs.writeFileSync(f, i % 2 ? "2026-01,1.00\n" : `2026-01,${i}.25\n2026-02,${i}.50\n2026-03,${i}.75\n`);
    files.push(f);
  }
  const url = `file://${page}`;
  const keys = ["synthetic-csv-mode", "synthetic-csv-accounts"];
  const browser = await browserLib.launch();
  try {
    const ctx = await browserLib.newContext(browser, browserLib.ENVS.E0, {});
    const d = await driverLib.open(ctx, url);
    await d.load(files);
    const probe = await d.probe();
    await ctx.close();
    const facts = { app: "statement", inputs: ["csv"], multiple: true, modeKey: keys[0], configKey: keys[1], modeValues: ["balance", "tradelog"], configKinds: ["", "investment", "cash"] };
    const list = scenarios.generate({ id: "synthetic", tier: "quick", facts, probe, files, synthetic: { bogus: path.join(dir, "zz-not-a-statement.csv"), other: path.join(dir, "aa.txt") } });
    const def = (id) => list.pages.find((p) => p.id === `synthetic/${id}`);
    const capture = async (p, o = {}) => {
      const t = run.makeTables();
      const holder = { orders: [], orderKeys: [] };
      const res = await run.runPage(browser, p, { url, keys, modes: facts.modeValues, seed: p.seed ? p.seed.raw : {}, ...o, onStep: (s) => run.compactStep(s, holder, t) });
      delete holder.orderKeys;
      const m = { parts: t.parts, lists: t.lists };
      return { ...p, ...res, orders: holder.orders, expanded: res.steps.map((s) => run.expandStep(m, holder, s)), static: res.static };
    };
    const base = def("E0/O0/I0/C0");
    const a = await capture(base, { passthrough: true });
    assert.equal(a.error, null);
    assert.deepEqual(a.expanded.map((s) => s.key), ["@open", "@load1", "balance/full", "balance/first", "balance/last", "balance/mid", "balance/rev",
      "tradelog/full", "tradelog/first", "tradelog/last", "tradelog/mid", "tradelog/rev"]);
    const full = a.expanded.find((s) => s.key === "tradelog/full");
    assert.equal(full.records.length, 6 * 2 + 3 + 3, "six cards, three of them with trades, plus the toolbar");
    assert.equal(full.passthrough, full.records.length, "every download also downloaded for real, paced past the per-page limit");
    assert.deepEqual(full.storage, { "synthetic-csv-mode": "tradelog", "synthetic-csv-accounts": null });
    assert.match(a.static, /^<main><h1>Synthetic statement converter<\/h1>/);
    const b = await capture(base);
    const strict = compare.comparePage({ ...a, steps: a.expanded }, { ...b, steps: b.expanded.map((s) => ({ ...s, passthrough: s.key === "@open" ? 0 : s.passthrough })) }, { mode: "strict" });
    assert.deepEqual([...new Set(strict.mismatches.map((m) => m.field))], ["passthrough"], "two runs differ only where one cross-checked");
    // The seeded bad name throws in the parse: the load is stuck, then the reset recovers.
    const bad = await capture(def("E0/O0/I0/C-seed-badname"));
    assert.equal(bad.expanded[1].key, "@load1");
    assert.deepEqual([bad.expanded[1].busy, bad.expanded[1].threw, bad.expanded[1].records], ["stuck", true, []]);
    assert.equal(bad.expanded[2].key, "@reset");
    assert.ok(bad.expanded[3].records.length > 0);
    assert.ok(bad.errors.errors.some((e) => e.includes("TypeError")), "the throw is logged");
    // A candidate page with a changed brand, replaying the golden plan.
    const pc = new compare.PageComparison({ id: base.id, c: base.c, keys: a.expanded.map((s) => s.key), step: (k) => a.expanded.find((s) => s.key === k), errors: a.errors, static: a.static },
      { mode: "golden", keys });
    const mism = [];
    const res = await run.runPage(browser, base, { url: `file://${variant}`, keys, modes: facts.modeValues, seed: {}, plan: a.expanded, onStep: (s) => {
      mism.push(...pc.step(s).mismatches);
      return s.key;
    } });
    mism.push(...pc.finish(res).mismatches);
    assert.deepEqual([...new Set(mism.map((m) => `${m.trigger}:${m.field}`))].sort(), ["accounts:name", "zip:entries.name", "zip:entries.set", "zip:sha256", "zip:size"]);
    assert.equal(compare.checkCanary("brand", { mismatches: mism, goldenSteps: a.expanded }).ok, false, "no Combined name change on this page");
  } finally {
    await browser.close();
  }
});

test("inspectNewOnly reads a handler that ran, every on* attribute and the tag of p0's card", { skip: !CHROME_READY && "the pinned chrome-headless-shell is not installed" }, async () => {
  const { inspectNewOnly } = run.newOnlyHelpers;
  const card = (title, tag) => `<article class="card"><header><h3>${title}</h3>${tag}</header></article>`;
  const browser = await browserLib.launch();
  try {
    const ctx = await browserLib.newContext(browser, browserLib.ENVS.E0, {});
    const view = async (html, label) => {
      const page = await ctx.newPage();
      await page.setContent(html);
      const v = await page.evaluate(inspectNewOnly, { label });
      await page.close();
      return v;
    };
    // The S-break payload as an old page renders it: the kind closes the class attribute.
    const broken = `<main><div id="cards">${card("Alpha", "<span class=\"tag x\" onmouseover=\"window.__pwned=1\">undefined</span>")}${card("Beta", "<span class=\"tag cash\">Cash-like</span>")}</div></main>`;
    assert.deepEqual(await view(broken, "Alpha"), { pwned: true, onAttrs: ["span[onmouseover]"], tags: ["tag x"] }, "the dispatched mouseover runs the handler");
    const inert = `<main><div id="cards">${card("Alpha", "<span class=\"tag other\">undefined</span>")}${card("Beta", "<span class=\"tag cash\">Cash-like</span>")}</div></main>`;
    assert.deepEqual(await view(inert, "Alpha"), { pwned: false, onAttrs: [], tags: ["tag other"] });
    assert.deepEqual(await view(inert, null), { pwned: false, onAttrs: [], tags: [] });
    assert.deepEqual((await view(inert, "Gamma")).tags, [], "no card with that title");
    await ctx.close();
  } finally {
    await browser.close();
  }
});
