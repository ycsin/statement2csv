// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// test/lib/replay.js and the replay command of test/golden/run.js (docs/TESTING.md, browser
// extraction and Node replay). Synthetic data only: a throwaway provider tree whose "old"
// parser reads synthetic CSV statements, on the real core modules (export, files, zip).
// Covered: the capture records (UTF-8 bytes, zips unpacked with their DOS time and date, the
// zipError of a text that looks like a zip), loadConfig semantics, the step rules (dropped
// paths, no statement, a throwing parse keeps the previous result, the memo, frozen inputs and
// results), page replay against golden steps and the comparator's report, the child processes
// (TZ and LC_ALL per environment, the time-zone and locale checks), and the ICU drift check
// (recording, answering in Node, an oracle replay that turns a collation difference into a
// match; the memo stays on meanwhile). Steps whose config storage cannot show are unmodelled,
// and the scenario generator never makes them. The replay command runs end to end in a scratch
// tree (a real git old repository, no Chrome): a complete golden passes, pages with capture
// errors fail the environment, and the console masks statement names. With the pinned Chrome,
// the records equal what test/lib/capture.js takes in the page, and the compare command fails
// an environment whose golden has a page with a capture error.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-replay-"));
// Everything private (the extraction cache, temporary files) goes to a throwaway private dir.
process.env.S2C_PRIVATE = path.join(TMP, "private");
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const replay = require("../lib/replay.js");
const canon = require("../lib/canon.js");
const browserLib = require("../lib/browser.js");
const capture = require("../lib/capture.js");
const { loadNode } = require("../lib/load-provider.js");
const { extract } = require("../lib/extract.js");
const run = require("../golden/run.js");

const SPDX = "// SPDX-License-Identifier: Apache-2.0\n// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>\n";
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const NOW = new Date(browserLib.FIXED_TIME);
const CHROME_READY = fs.existsSync(browserLib.chromePath());

// Runs fn with process.env.TZ set (Node applies a TZ change at once).
function withTz(tz, fn) {
  const was = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
}

// ---------------------------------------------------------------- the synthetic provider

// The synthetic "old" parser: statements are CSV text "account,date,amount,kind"; accounts are
// sorted by label with localeCompare (as the old parsers do), configs are read as the old
// parsers read them (a non-string name throws), investments get a trade per row.
const PARSER = `${SPDX}"use strict";
function parseStatements(statements, config = {}) {
  const errors = [];
  const raw = {};
  const months = new Set();
  for (const s of statements) {
    const lines = String(s.csv == null ? "" : s.csv).split(/\\r?\\n/).filter(Boolean);
    if (lines[0] !== "account,date,amount,kind") { errors.push({ id: s.id, error: "not a synthetic statement" }); continue; }
    for (const l of lines.slice(1)) {
      const [label, date, amount, kind] = l.split(",");
      const p = raw[label] || (raw[label] = { id: label, label, kind, cash: [], trades: [] });
      p.cash.push({ date, amount: -Number(amount), currency: "SGD", name: "Payment " + date, kind: "transfer" });
      if (kind === "investment") p.trades.push({ date, ticker: "FUND", qty: 1, price: Number(amount), currency: "SGD", name: "Fund" });
      months.add(date.slice(0, 7));
    }
  }
  const ms = [...months].sort();
  const portfolios = Object.values(raw).sort((a, b) => a.label.localeCompare(b.label));
  const accounts = {};
  for (const p of portfolios) {
    const c = (config && typeof config === "object" ? config[p.id] : null) || {};
    if (c.exclude) continue;
    const name = (c.name || "").trim() || p.label;
    const kind = c.kind || p.kind;
    const mo = {};
    let prev = 0;
    for (const m of ms) {
      const flow = p.cash.filter((x) => x.date.slice(0, 7) === m).reduce((t, x) => t - x.amount, 0);
      const closing = Math.round((prev + flow + (kind === "investment" ? 0.5 : 0)) * 100) / 100;
      mo[m] = { monthEnd: m + "-28", opening: prev, closing, fx: null };
      prev = closing;
    }
    accounts[name] = { kind, currency: "SGD", months: mo, valuations: ms.map((m) => [m + "-28", mo[m].closing]), trades: p.trades, cash: p.cash };
  }
  return {
    accounts, months: ms.map((month) => ({ month })), errors, gaps: [], firstOpenings: [], skippedRows: [], statements: statements.length,
    portfolios: portfolios.map((p) => ({ id: p.id, label: p.label, names: [p.label], firstMonth: ms[0], lastMonth: ms[ms.length - 1], kind: p.kind, currency: "SGD" })),
  };
}
module.exports = { parseStatements };
`;

const FROZEN = {
  storage: { modeKey: "synth-csv-mode", configKey: "synth-csv-accounts" },
  modeValues: ["balance", "tradelog", "holdings"],
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "Synth ", brand: "Synth", groupNoun: "accounts", slug: "synth" },
  configIdPattern: "^.+$",
  kindModel: "standard",
  legacyRepo: "synth2csv",
  legacyUrl: "https://example.invalid/synth2csv/",
  legacyHead: "0".repeat(40),
  legacyIndexSha256: "0".repeat(64),
  legacyDom: null,
};

const STATEMENTS = {
  "a-2026-01.csv": "account,date,amount,kind\nbeta,2026-01-05,100.00,bank\nAlpha,2026-01-07,250.00,investment\nbeta,2026-01-20,-25.50,bank\n",
  "b-2026-02.csv": "account,date,amount,kind\r\nbeta,2026-02-03,10.00,bank\r\nAlpha,2026-02-10,50.00,investment\r\n",
  "c-2026-03.csv": "account,date,amount,kind\nAlpha,2026-03-02,75.25,investment\nbeta,2026-03-09,-5.00,bank\n",
  "zz-not-a-statement.csv": "hello",
};

function makeTree() {
  const root = path.join(TMP, "tree");
  const oldRoot = path.join(TMP, "old");
  const dir = path.join(TMP, "statements");
  if (fs.existsSync(root)) return { root, oldRoot, dir, paths: Object.keys(STATEMENTS).map((n) => path.join(dir, n)) };
  fs.mkdirSync(path.join(root, "providers", "synth"), { recursive: true });
  fs.symlinkSync(path.join(REPO, "core"), path.join(root, "core"));
  fs.writeFileSync(path.join(root, "providers", "synth", "frozen.js"), `${SPDX}module.exports = ${JSON.stringify(FROZEN, null, 2)};\n`);
  fs.mkdirSync(path.join(oldRoot, "synth2csv", "src"), { recursive: true });
  fs.writeFileSync(path.join(oldRoot, "synth2csv", "src", "parser.js"), PARSER);
  fs.writeFileSync(path.join(oldRoot, "synth2csv", "src", "index.template.html"), '<input id="picker" type="file" accept="text/csv,.csv" multiple hidden>\n');
  fs.mkdirSync(dir, { recursive: true });
  for (const [n, t] of Object.entries(STATEMENTS)) fs.writeFileSync(path.join(dir, n), t);
  return { root, oldRoot, dir, paths: Object.keys(STATEMENTS).map((n) => path.join(dir, n)) };
}

async function synth() {
  const t = makeTree();
  const handle = loadNode("synth", { root: t.root, parser: "old", oldRoot: t.oldRoot });
  const ex = await extract(t.paths, { handle, readers: "node", allowed: [t.dir], oldRoot: t.oldRoot });
  return { ...t, handle, byPath: ex.byPath, ex };
}

// A golden page from a list of steps: the records each step's state gives, in TZ=UTC (E0).
function goldenSteps(handle, byPath, steps) {
  const page = { id: "synth/E0/O0/I0/C0", steps: steps.map((s) => ({ ...s, records: [] })) };
  const replayed = withTz("UTC", () => replay.replayPage(handle, byPath, page, {}));
  page.steps.forEach((s, k) => {
    // An unmodelled step has no replayed records; a test sets its golden records itself.
    s.records = (replayed[k].records || []).map((r) => ({ ...r, card: r.trigger === "card" ? `Synth card ${r.account}` : null }));
  });
  return page;
}

const KEY = FROZEN.storage.configKey;
const st = (cfg) => ({ [FROZEN.storage.modeKey]: "balance", [KEY]: cfg });

// ---------------------------------------------------------------- records

test("toRecords: UTF-8 bytes, zips unpacked with the DOS time of now, disabled records, a text that looks like a zip", () => {
  const files = [{ name: "A - transactions - 2026-01.csv", text: "date,amount\n2026-01-05,1.00\n" }, { name: "é ü.csv", text: "x\r\ny" }];
  const list = [
    { trigger: "card", account: "Alpha", kind: "transactions", name: "a.csv", type: "text/csv", text: "é,日本,\ud800,😀\r\n" },
    { trigger: "accounts", account: null, kind: null, name: "b.csv", type: "text/csv", text: "" },
    { trigger: "zip", account: null, kind: null, name: "synth-csv-2026-01_to_2026-01.zip", type: "application/zip", files },
    { trigger: "combined", account: null, kind: null, name: "c.csv", type: "text/csv", text: "PK\u0003\u0004 not a zip" },
    { trigger: "combined", account: null, kind: null, disabled: true },
  ];
  const recs = withTz("UTC", () => replay.toRecords(list, NOW));
  const bytes = Buffer.from("é,日本,\ufffd,😀\r\n", "utf8");
  assert.deepEqual(recs[0], { trigger: "card", account: "Alpha", kind: "transactions", name: "a.csv", type: "text/csv", size: bytes.length, sha256: sha256(bytes) });
  assert.deepEqual(recs[1], { trigger: "accounts", account: null, kind: null, name: "b.csv", type: "text/csv", size: 0, sha256: sha256(Buffer.alloc(0)) });
  const z = recs[2];
  assert.equal(z.type, "application/zip");
  assert.equal(z.entries.length, 2);
  // 2026-01-02T03:04:06Z in UTC: 03:04:06 (seconds halved) on 2026-01-02.
  for (const e of z.entries) assert.deepEqual([e.dosTime, e.dosDate], [(3 << 11) | (4 << 5) | 3, ((2026 - 1980) << 9) | (1 << 5) | 2]);
  assert.deepEqual(z.entries.map((e) => [e.name, e.size, e.sha256]), files.map((f) => [f.name, Buffer.byteLength(f.text), sha256(Buffer.from(f.text))]));
  assert.equal(z.zipError, undefined);
  assert.match(recs[3].zipError, /^Error: unzip: /, "a text whose bytes start like a zip is unpacked, as capture.js does");
  assert.equal(recs[3].entries, undefined);
  assert.deepEqual(recs[4], { trigger: "combined", account: null, kind: null, disabled: true });
  // In Los Angeles the same instant is 19:04:06 on 2026-01-01.
  const la = withTz("America/Los_Angeles", () => replay.toRecords([list[2]], NOW))[0];
  for (const e of la.entries) assert.deepEqual([e.dosTime, e.dosDate], [(19 << 11) | (4 << 5) | 3, ((2026 - 1980) << 9) | (1 << 5) | 1]);
  assert.notEqual(la.sha256, z.sha256);
  assert.throws(() => replay.toRecords([{ trigger: "card", name: "x" }]), /neither text nor files/);
  assert.throws(() => replay.toRecords(null), /must return an array/);
});

test("parseConfig reads storage as loadConfig does", () => {
  const cases = [[null, {}], [undefined, {}], ["{not json", {}], ["null", {}], ["0", {}], ["false", {}], ['""', {}], ["[]", []], ["5", 5], ['"x"', "x"], ['{"a":{"name":"b"}}', { a: { name: "b" } }]];
  for (const [s, want] of cases) assert.deepEqual(replay.parseConfig(s), want, JSON.stringify(s));
});

test("compareRecords is the golden comparator's", () => {
  assert.equal(replay.compareRecords, require("../golden/compare.js").compareRecords);
});

// ---------------------------------------------------------------- one step

function spyHandle({ parse, downloads } = {}) {
  const seen = { parses: [], downloads: [] };
  return {
    seen,
    R: { storage: { configKey: "k" } },
    parse(statements, ctx) {
      seen.parses.push({ ids: statements.map((s) => s.id), ctx });
      return parse ? parse(statements, ctx) : { n: statements.length, ids: statements.map((s) => s.id) };
    },
    downloads(result, ctx) {
      seen.downloads.push({ result, ctx });
      if (downloads) return downloads(result, ctx);
      return result ? [{ trigger: "card", account: "a", kind: "transactions", name: "a.csv", type: "text/csv", text: result.ids.join(",") }] : [];
    },
  };
}

test("replayStep: dropped paths, no statement, the hook's context", () => {
  const byPath = new Map([["/s/a", { id: "a", csv: "1" }], ["/s/b", { id: "b", csv: "2" }]]);
  const h = spyHandle();
  const r = replay.replayStep(h, byPath, { config: '{"x":{"name":"y"}}', mode: "holdings", from: "2026-03", to: "2026-01", paths: ["/s/b", "/s/missing", "/s/a"] }, { now: NOW });
  assert.deepEqual(h.seen.parses, [{ ids: ["b", "a"], ctx: { config: { x: { name: "y" } }, mode: "holdings" } }], "paths without a statement are dropped, the others keep their order");
  assert.deepEqual(h.seen.downloads[0].ctx, { mode: "holdings", from: "2026-03", to: "2026-01" }, "the range is passed as captured (the handle swaps it)");
  assert.equal(r.records.length, 1);
  assert.equal(r.threw, null);
  const none = replay.replayStep(h, byPath, { config: null, mode: "balance", from: "", to: "", paths: ["/s/missing"] }, { prevResult: r.result });
  assert.equal(none.result, null, "no statement: no result, whatever came before");
  assert.deepEqual(none.records, []);
  assert.equal(h.seen.parses.length, 1, "parse is not called without statements");
});

test("replayStep: a throwing parse keeps the previous result; the memo; frozen inputs and results", () => {
  const byPath = new Map([["/s/a", { id: "a", list: [1] }]]);
  const h = spyHandle({ parse: (s, ctx) => {
    if (ctx.config.bad) throw new TypeError("(intermediate value).trim is not a function");
    return { n: s.length, ids: s.map((x) => x.id), config: ctx.config };
  } });
  const memo = new Map();
  const ok = replay.replayStep(h, byPath, { config: "{}", mode: "balance", paths: ["/s/a"] }, { memo });
  const bad = replay.replayStep(h, byPath, { config: '{"bad":1}', mode: "balance", paths: ["/s/a"] }, { memo, prevResult: ok.result });
  assert.equal(bad.result, ok.result, "the previous result stays");
  assert.equal(bad.threw, "TypeError: (intermediate value).trim is not a function");
  assert.deepEqual(bad.records, ok.records);
  const first = replay.replayStep(h, byPath, { config: '{"bad":1}', mode: "balance", paths: ["/s/a"] }, { memo, prevResult: null });
  assert.equal(first.result, null, "a throw before any result leaves none");
  assert.deepEqual(first.records, []);
  replay.replayStep(h, byPath, { config: "{}", mode: "balance", paths: ["/s/a"] }, { memo });
  assert.equal(h.seen.parses.length, 2, "the same paths, config and mode are parsed once");
  replay.replayStep(h, byPath, { config: "{}", mode: "tradelog", paths: ["/s/a"] }, { memo });
  assert.equal(h.seen.parses.length, 3, "another mode is another parse (a custom app's parse depends on it)");
  assert.ok(Object.isFrozen(ok.result) && Object.isFrozen(ok.result.config) && Object.isFrozen(ok.result.ids));
  assert.ok(Object.isFrozen(byPath.get("/s/a")) && Object.isFrozen(byPath.get("/s/a").list), "statements are frozen once used");
  // A parser that changes its input, and a hook that changes the result, are caught.
  const mut = spyHandle({ parse: (s) => { s[0].list.push(2); return { ids: [] }; } });
  assert.match(replay.replayStep(mut, byPath, { config: null, mode: "balance", paths: ["/s/a"] }).threw, /^TypeError: /);
  const mutHook = spyHandle({ downloads: (result) => { result.ids.push("x"); return []; } });
  assert.throws(() => replay.replayStep(mutHook, byPath, { config: null, mode: "balance", paths: ["/s/a"] }), TypeError);
  assert.throws(() => replay.replayStep({}, byPath, {}), /needs a ProviderHandle/);
});

// ---------------------------------------------------------------- pages

test("replayPage on the synthetic provider: config from storage, a throwing load, Clear, the prevResult rule", async () => {
  const { handle, byPath, paths } = await synth();
  const [a, b, c, bogus] = paths;
  const steps = [
    { key: "@open", act: [["open"]], mode: "balance", range: { from: "", to: "" }, order: [], storage: st(null) },
    { key: "@load1", act: [["load", [a, bogus, b, c], "picker"]], mode: "balance", range: { from: "2026-01", to: "2026-03" }, order: [a, bogus, b, c], storage: st('{"Alpha":{"name":5}}') },
    { key: "@reset", act: [["config", { reset: true }]], mode: "balance", range: { from: "2026-01", to: "2026-03" }, order: [a, bogus, b, c], storage: st("{}") },
    { key: "holdings/full", act: [["mode", "holdings"], ["range", "2026-01", "2026-03"]], mode: "holdings", range: { from: "2026-01", to: "2026-03" }, order: [a, bogus, b, c], storage: st("{}") },
    { key: "holdings/rev", act: [["range", "2026-03", "2026-01"]], mode: "holdings", range: { from: "2026-03", to: "2026-01" }, order: [a, bogus, b, c], storage: st("{}") },
    { key: "@config1", act: [["config", { rename: { index: 0, name: '=Renamed "A&B", <x>' } }]], mode: "tradelog", range: { from: "2026-02", to: "2026-02" }, order: [a, bogus, b, c], storage: st('{"Alpha":{"name":"=Renamed \\"A&B\\", <x>"}}') },
    { key: "@config2", act: [["config", { rename: { index: 1, name: 5 } }]], mode: "tradelog", range: { from: "2026-02", to: "2026-02" }, order: [a, bogus, b, c], storage: st('{"beta":{"name":5}}') },
    { key: "@clear", act: [["clear"]], mode: "tradelog", range: { from: "", to: "" }, order: [], storage: st('{"beta":{"name":5}}') },
  ];
  const golden = goldenSteps(handle, byPath, steps);
  const r = withTz("UTC", () => replay.replayPage(handle, byPath, golden, {}));
  const cmp = replay.comparePage(golden, r);
  assert.deepEqual(cmp.mismatches, []);
  assert.deepEqual(cmp.threw.map((t) => t.step), ["@load1", "@config2"]);
  const recs = (k) => golden.steps.find((s) => s.key === k).records;
  assert.deepEqual(recs("@open"), []);
  assert.deepEqual(recs("@load1"), [], "the first parse throws: no result, no downloads");
  assert.ok(recs("@reset").length > 3, "after the reset the page has cards and the toolbar");
  assert.deepEqual(recs("@config2").map((x) => x.sha256), recs("@config1").map((x) => x.sha256), "a throwing parse keeps the previous downloads");
  assert.deepEqual(recs("@clear"), [], "Clear: no statements, no result");
  const zip = recs("holdings/full").find((x) => x.trigger === "zip");
  assert.equal(zip.name, "synth-csv-2026-01_to_2026-03.zip");
  assert.equal(zip.entries[0].name, "Synth accounts - 2026-01_to_2026-03.csv", "Download all starts with the Accounts CSV");
  const combined = recs("holdings/full").find((x) => x.trigger === "combined");
  assert.equal(combined.type, "application/zip", "holdings with trades: the Combined download is a zip of two files");
  assert.deepEqual(recs("holdings/rev").map((x) => x.sha256), recs("holdings/full").map((x) => x.sha256), "a reversed range is the swapped one");
  assert.deepEqual(cmp.counts.steps, steps.length);
});

test("comparePage reports every kind of difference, field by field", async () => {
  const { handle, byPath, paths } = await synth();
  const order = paths.slice(0, 3);
  const steps = [
    { key: "@load1", act: [["load", order, "picker"]], mode: "holdings", range: { from: "2026-01", to: "2026-03" }, order, storage: st(null) },
    { key: "holdings/last", act: [["range", "2026-03", "2026-03"]], mode: "holdings", range: { from: "2026-03", to: "2026-03" }, order, storage: st(null) },
  ];
  const golden = goldenSteps(handle, byPath, steps);
  const fresh = () => withTz("UTC", () => replay.replayPage(handle, byPath, golden, {}));
  const edit = (fn) => {
    const g = JSON.parse(JSON.stringify(golden));
    fn(g.steps[0].records);
    return replay.comparePage(g, fresh()).mismatches.map((m) => `${m.category}:${m.field}`);
  };
  assert.deepEqual(replay.comparePage(golden, fresh()).mismatches, []);
  const zipAt = (recs) => recs.findIndex((r) => r.trigger === "zip");
  assert.deepEqual(edit((recs) => { recs[0].name += " "; }), ["downloads:name"]);
  assert.deepEqual(edit((recs) => { recs[0].sha256 = "0".repeat(64); }), ["downloads:sha256"]);
  assert.deepEqual(edit((recs) => { recs[zipAt(recs)].entries[1].dosTime ^= 1; }), ["downloads:entries.dosTime"]);
  assert.deepEqual(edit((recs) => { recs[zipAt(recs)].entries.reverse(); }), ["downloads:entries.order"]);
  assert.deepEqual(edit((recs) => { recs.pop(); }), ["downloads:count"]);
  assert.deepEqual(edit((recs) => { const z = recs[zipAt(recs)]; for (const k of ["name", "type", "size", "sha256", "entries"]) delete z[k]; z.disabled = true; }), ["downloads:disabled"]);
  assert.ok(edit((recs) => { recs[zipAt(recs)].entries[0].name = "other.csv"; }).includes("downloads:entries.set"));
  // card titles are UI text: replay has none, so they are not compared.
  assert.deepEqual(edit((recs) => { recs[0].card = "another title"; }), []);
  const shifted = { ...golden, steps: [golden.steps[1], golden.steps[0]] };
  assert.ok(replay.comparePage(shifted, fresh()).mismatches.some((m) => m.category === "steps"));
});

// The old pages keep the config in memory and store JSON.stringify(state.config). Seeded with
// "[]", loadConfig gives an array; a configurator change adds a named property to it, which
// JSON.stringify drops, so storage keeps saying "[]" while the page parses the change. Replay
// cannot rebuild those steps: they are unmodelled until a reset, never a (false) mismatch.
test("replayPage: a configurator change on a stored JSON array is unmodelled until a reset; objects and primitives are rebuilt from storage", async () => {
  const { handle, byPath, paths } = await synth();
  const order = paths.slice(0, 3);
  const at = (key, act, mode, cfg, extra = {}) => ({ key, act, mode, range: { from: "2026-01", to: "2026-03" }, order, storage: st(cfg), ...extra });
  const rename = ["config", { rename: { index: 0, name: "Renamed" } }];
  const steps = [
    { key: "@open", act: [["open"]], mode: "balance", range: { from: "", to: "" }, order: [], storage: st("[]") },
    at("@load1", [["load", order, "picker"]], "balance", "[]"),
    at("@config1", [rename], "balance", "[]"),
    at("balance/full", [["mode", "balance"], ["range", "2026-01", "2026-03"]], "balance", "[]"),
    at("@reset", [["config", { reset: true }]], "balance", "{}"),
    at("holdings/full", [["mode", "holdings"], ["range", "2026-01", "2026-03"]], "holdings", "{}"),
  ];
  const golden = goldenSteps(handle, byPath, steps);
  // What the page really showed after the rename is unknown here; any golden records will do,
  // and records that could never match show that nothing of those steps is compared.
  golden.steps[2].records = golden.steps[1].records.map((r) => ({ ...r, sha256: "0".repeat(64) }));
  assert.ok(golden.steps[2].records.length > 0);
  golden.steps[3].records = [];
  const r = withTz("UTC", () => replay.replayPage(handle, byPath, golden, {}));
  assert.deepEqual(r.map((x) => x.unmodelled || null), [null, null, "config", "config", null, null]);
  assert.equal(r[2].records, null);
  const cmp = replay.comparePage(golden, r);
  assert.deepEqual(cmp.mismatches, [], "unmodelled steps are not compared");
  assert.equal(cmp.counts.unmodelled, 2);
  assert.equal(cmp.counts.steps, 6);
  assert.equal(cmp.counts.records, [0, 1, 4, 5].reduce((n, k) => n + golden.steps[k].records.filter((x) => !x.disabled).length, 0), "records counts only the steps compared");
  // The steps around the window are compared: a changed record after the reset is caught.
  const bad = JSON.parse(JSON.stringify(golden));
  bad.steps[5].records[0].sha256 = "1".repeat(64);
  assert.deepEqual(replay.comparePage(bad, withTz("UTC", () => replay.replayPage(handle, byPath, bad, {}))).mismatches.map((m) => `${m.step}:${m.field}`), ["holdings/full:sha256"]);
  // An object config: the rename is in storage, so the step is rebuilt (and must match).
  const obj = goldenSteps(handle, byPath, [steps[0], at("@load1", steps[1].act, "balance", "{}"), at("@config1", [rename], "balance", '{"Alpha":{"name":"Renamed"}}')]);
  const objReplay = withTz("UTC", () => replay.replayPage(handle, byPath, obj, {}));
  assert.deepEqual(objReplay.map((x) => x.unmodelled || null), [null, null, null]);
  assert.deepEqual(replay.comparePage(obj, objReplay).mismatches, []);
  // A primitive config cannot take the change (the page's handler throws or does nothing), so
  // storage still shows the page's config.
  for (const cfg of ["5", '"x"', "null", "{not json"]) {
    const prim = goldenSteps(handle, byPath, [steps[0], at("@load1", steps[1].act, "balance", cfg), at("@config1", [rename], "balance", cfg)]);
    assert.deepEqual(withTz("UTC", () => replay.replayPage(handle, byPath, prim, {})).map((x) => x.unmodelled || null), [null, null, null], cfg);
  }
  // After a window, a step whose parse throws would show the page's unknown earlier result.
  const thrown = [...steps.slice(0, 4), at("@reset", [["config", { reset: true }]], "balance", '{"Alpha":{"name":5}}'), at("balance/last", [["range", "2026-03", "2026-03"]], "balance", "{}")];
  const tr = withTz("UTC", () => replay.replayPage(handle, byPath, { id: "synth/x", steps: thrown.map((s) => ({ ...s, records: [] })) }, {}));
  assert.deepEqual(tr.map((x) => x.unmodelled || null), [null, null, "config", "config", "config", null]);
});

// The scenario generator never gives the configurator a stored config that is not a JSON
// object: seeded configs get no configurator change except the reset, and changes run on pages
// that start from empty storage. So no golden step is unmodelled (replay.js).
test("the scenario generator never combines a stored config that is not a JSON object with configurator changes", () => {
  const scenarios = require("../golden/scenarios.js");
  const facts = { app: "statement", accept: "application/pdf,.pdf,text/csv,.csv", multiple: true, inputs: ["pdf", "csv"], modeKey: "x-mode", configKey: "x-accounts", modeValues: ["balance", "tradelog", "holdings"], configKinds: ["", "investment", "cash"], legacyDom: null };
  const portfolios = Array.from({ length: 4 }, (_, i) => ({ index: i, id: `p${i}:SGD`, label: `P${i}`, autoKind: i % 2 ? "Cash-like" : "Investment", currency: i === 3 ? "USD" : "SGD" }));
  const probe = { months: ["2026-01", "2026-02", "2026-03", "2026-04"], modeVisible: true, portfolios, cards: [] };
  let pages = 0;
  let changes = 0;
  for (const tier of scenarios.TIERS) {
    for (const security of [false, true]) {
      const list = scenarios.generate({ id: "x", tier, facts, probe, files: ["/s/a.pdf", "/s/b.pdf", "/s/c.pdf", "/s/d.csv"], synthetic: { bogus: "/p/zz.pdf", other: "/p/aa.txt" }, otherModeValues: ["month", "day"], security });
      const byId = new Map(list.pages.map((p) => [p.id, p]));
      for (const p of list.pages) {
        pages++;
        const ops = p.actions.filter((a) => a.config && !a.config.reset).length;
        changes += ops;
        if (!ops) continue;
        let seed = p.seed;
        if (seed && seed.fromPage) {
          const src = byId.get(seed.fromPage);
          assert.ok(src && src.seed === null, `${p.id}: a page seeded from another page's storage starts from a page with empty storage`);
          continue;
        }
        const raw = seed && seed.raw ? seed.raw[facts.configKey] : undefined;
        assert.ok(raw === undefined || (replay.parseConfig(raw) !== null && typeof replay.parseConfig(raw) === "object" && !Array.isArray(replay.parseConfig(raw))), `${p.id}: configurator changes on the stored config ${JSON.stringify(raw)}`);
      }
    }
  }
  assert.ok(pages > 100 && changes > 50, `${pages} pages, ${changes} configurator changes`);
});

// ---------------------------------------------------------------- child processes

function job(t, env, pages, extra = {}) {
  return { id: "synth", parser: "old", root: t.root, oldRoot: t.oldRoot, env: { ...env }, readers: "node", allowed: [t.dir], paths: t.paths, pages, keepActual: 3, ...extra };
}

test("runJobs: each environment in its own child with TZ and LC_ALL; zips carry that zone's DOS time", async () => {
  const t = await synth();
  const order = t.paths;
  const steps = [{ key: "@load1", act: [["load", order, "picker"]], mode: "holdings", range: { from: "2026-01", to: "2026-03" }, order, storage: st(null) }];
  const golden = goldenSteps(t.handle, t.byPath, steps); // E0: UTC
  const la = JSON.parse(JSON.stringify(golden));
  const laSteps = withTz("America/Los_Angeles", () => replay.replayPage(t.handle, t.byPath, la, {}));
  la.steps[0].records = laSteps[0].records;
  const [e0, e1, e1vsE0] = await replay.runJobs([job(t, browserLib.ENVS.E0, [golden]), job(t, browserLib.ENVS.E1, [la]), job(t, browserLib.ENVS.E1, [golden])], { parallel: 3 });
  for (const r of [e0, e1, e1vsE0]) assert.equal(r.ok, true, r.error);
  assert.deepEqual(e0.mismatches, []);
  assert.deepEqual(e1.mismatches, [], "the E1 child replays in America/Los_Angeles");
  const fields = new Set(e1vsE0.mismatches.map((m) => m.field));
  assert.ok(fields.has("entries.dosTime") && fields.has("entries.dosDate") && fields.has("sha256"), "E1 zips differ from E0's in time and date only");
  assert.ok(![...fields].some((f) => ["name", "size", "entries.name", "entries.size", "entries.sha256", "entries.crc32"].includes(f)));
  assert.ok(e1vsE0.actual.length > 0 && e1vsE0.actual[0].bytes.length > 0, "the replayed bytes of a mismatching record come back");
  assert.deepEqual(e0.counts, { steps: 1, records: golden.steps[0].records.length, disabled: 0, zips: 2, entries: golden.steps[0].records.filter((r) => r.entries).reduce((n, r) => n + r.entries.length, 0), unmodelled: 0 });
  assert.equal(e0.parses, 1);
  const env = replay.childEnv(browserLib.ENVS.E1);
  assert.deepEqual([env.TZ, env.LC_ALL], ["America/Los_Angeles", "sv_SE.UTF-8"]);
});

test("runJob checks the zone and the locale; a failing child is reported", async () => {
  const t = await synth();
  const page = { id: "synth/x", steps: [] };
  const saved = { TZ: process.env.TZ, LC_ALL: process.env.LC_ALL };
  try {
    process.env.TZ = "Asia/Singapore";
    process.env.LC_ALL = "de_DE.UTF-8";
    await assert.rejects(replay.runJob(job(t, { id: "E9", locale: "de-DE", timezoneId: "UTC" }, [page])), /runs with TZ "Asia\/Singapore"/);
    const startup = new Intl.Collator().resolvedOptions().locale;
    if (startup !== "de-DE") {
      const r = await replay.runJob(job(t, { id: "E9", locale: "de-DE", timezoneId: "Asia/Singapore" }, [page]));
      assert.match(r.skipped, /cannot provide the locale de-DE/, "a locale Node does not resolve skips the environment");
    }
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  const [r] = await replay.runJobs([job(t, browserLib.ENVS.E0, [page], { readers: "chrome", cacheDir: path.join(TMP, "private", "empty-cache") })]);
  assert.equal(r.ok, false);
  assert.match(r.error, /not in the extraction cache/);
  assert.ok(!Object.keys(STATEMENTS).some((n) => r.error.includes(n)), "the error names no statement file");
});

test("the memo stays on while ICU calls are recorded or answered: each (paths, config, mode) is parsed once", async () => {
  const t = await synth();
  const order = t.paths.slice(0, 3);
  const at = (key, mode, from, to) => ({ key, act: [["mode", mode], ["range", from, to]], mode, range: { from, to }, order, storage: st(null) });
  const steps = [at("balance/full", "balance", "2026-01", "2026-03"), at("balance/last", "balance", "2026-03", "2026-03"), at("tradelog/full", "tradelog", "2026-01", "2026-03"), at("tradelog/last", "tradelog", "2026-03", "2026-03")];
  const golden = goldenSteps(t.handle, t.byPath, steps);
  const base = job(t, browserLib.ENVS.E0, [golden], { keepActual: 0 });
  const [plain, recorded, answered] = await replay.runJobs([base, { ...base, icu: { record: true } }, { ...base, icu: { answers: [] } }], { parallel: 3 });
  for (const r of [plain, recorded, answered]) assert.equal(r.ok, true, r.error);
  assert.deepEqual([plain.parses, recorded.parses, answered.parses], [2, 2, 2], "two keys (one per mode), each parsed once");
  assert.deepEqual([plain.mismatches, recorded.mismatches, answered.mismatches], [[], [], []]);
  assert.ok(recorded.icu.calls.length > 0, "the recording saw the parser's and the writers' ICU calls");
  assert.equal(answered.icu.unanswered.length, recorded.icu.calls.length, "with no answers, every recorded call is asked for again");
});

// ---------------------------------------------------------------- ICU drift

test("icuRecorder records ICU calls, answers them, and restores every built-in", () => {
  const before = { lc: String.prototype.localeCompare, up: String.prototype.toUpperCase, gh: Date.prototype.getHours, cmp: Object.getOwnPropertyDescriptor(Intl.Collator.prototype, "compare") };
  const rec = replay.icuRecorder();
  rec.install();
  let results;
  try {
    results = ["b".localeCompare("a"), "abc".toUpperCase(), "straße".toUpperCase(), new Date(0).getHours(), new Intl.Collator("en").compare("a", "b")];
  } finally {
    rec.uninstall();
  }
  assert.deepEqual(results, ["b".localeCompare("a"), "ABC", "STRASSE", new Date(0).getHours(), -1]);
  const calls = [...rec.calls.values()].map((v) => v.call);
  assert.deepEqual(calls.map((c) => `${c[0]}.${c[1]}`), ["String.localeCompare", "String.toUpperCase", "Date.getHours", "Intl.Collator.compare"], "ASCII case mapping is not recorded");
  assert.deepEqual(calls[0].slice(2), ["b", ["a"]]);
  assert.equal(calls[2][2], 0, "a Date is recorded by its time value");
  assert.equal(String.prototype.localeCompare, before.lc);
  assert.equal(String.prototype.toUpperCase, before.up);
  assert.equal(Date.prototype.getHours, before.gh);
  assert.deepEqual(Object.getOwnPropertyDescriptor(Intl.Collator.prototype, "compare"), before.cmp);
  // In Node, answerInPage gives back Node's own results.
  const canonSource = fs.readFileSync(path.join(REPO, "test", "lib", "canon.js"), "utf8");
  assert.deepEqual(replay.answerInPage({ calls, canonSource }), [...rec.calls.values()].map((v) => v.node));
  // With answers, an answered call returns the answer and an unanswered one is recorded.
  const flip = new Map([...rec.calls].filter(([, v]) => v.call[1] === "localeCompare").map(([k, v]) => [k, canon(-canon.parse(v.node))]));
  const oracle = replay.icuRecorder({ answers: flip });
  oracle.install();
  let got;
  try {
    got = ["b".localeCompare("a"), "a".localeCompare("b")];
  } finally {
    oracle.uninstall();
  }
  assert.deepEqual(got, [-"b".localeCompare("a"), -1]);
  assert.deepEqual([...oracle.unanswered.values()].map((v) => v.call.slice(1, 4)), [["localeCompare", "a", ["b"]]]);
});

test("an oracle replay with flipped collation answers reproduces a golden made with flipped collation (ICU drift)", async () => {
  const t = await synth();
  const order = t.paths.slice(0, 3);
  const steps = [{ key: "@load1", act: [["load", order, "picker"]], mode: "balance", range: { from: "2026-01", to: "2026-03" }, order, storage: st(null) }];
  // The "browser's" golden: the same page with collation reversed.
  const orig = String.prototype.localeCompare;
  let golden;
  Object.defineProperty(String.prototype, "localeCompare", { value: function (o, ...r) { return -orig.call(this, o, ...r); }, writable: true, configurable: true });
  try {
    golden = goldenSteps(t.handle, t.byPath, steps);
  } finally {
    Object.defineProperty(String.prototype, "localeCompare", { value: orig, writable: true, configurable: true });
  }
  const base = job(t, browserLib.ENVS.E0, [golden], { keepActual: 0 });
  const [plain] = await replay.runJobs([base], { parallel: 1 });
  assert.equal(plain.ok, true, plain.error);
  assert.ok(plain.mismatches.some((m) => m.field === "entries.order" || m.field === "sha256"), "Node's collation gives another order");
  // The "browser" answers every collation call the other way round; dates sort the other way
  // too, so the oracle replay meets new pairs and asks again until none is new.
  const asked = [];
  const answer = async (calls) => {
    asked.push(calls.length);
    return calls.map(([k, call, node]) => [k, call[1] === "localeCompare" ? canon(-canon.parse(node)) : node]);
  };
  const r = await replay.icuCheck(base, { answer, rounds: 6 });
  assert.ok(r.calls > 0 && r.differing > 0, "some recorded calls are answered differently");
  assert.equal(r.converged, true);
  assert.ok(r.rounds >= 1 && asked.length === r.rounds, "one more question per round that met new calls");
  assert.deepEqual(r.mismatches, [], "with the browser's answers every step is identical: ICU drift");
  // Answers that agree with Node change nothing: the mismatches stay, and they are real.
  const same = await replay.icuCheck(base, { answer: async (calls) => calls.map(([k, , node]) => [k, node]) });
  assert.equal(same.differing, 0);
  assert.deepEqual(same.mismatches.length, plain.mismatches.length);
  await assert.rejects(replay.icuCheck(base, {}), /needs an answer/);
});

// ---------------------------------------------------------------- run.js

test("parseArgs: the extract and replay options", () => {
  assert.equal(run.parseArgs(["replay", "--parser", "old"]).parser, "old");
  assert.throws(() => run.parseArgs(["replay"]), /replay needs --parser old\|new/);
  assert.throws(() => run.parseArgs(["replay", "--parser", "older"]), /--parser must be old or new/);
  assert.equal(run.parseArgs(["replay", "--parser", "new", "--frozen-runtime"]).frozenRuntime, true);
  assert.throws(() => run.parseArgs(["replay", "--parser", "old", "--frozen-runtime"]), /--frozen-runtime goes with replay --parser new/);
  assert.throws(() => run.parseArgs(["extract", "--frozen-runtime"]), /--frozen-runtime/);
  assert.throws(() => run.parseArgs(["replay", "--parser", "old", "--tier", "nightly"]), /--tier must be one of/);
  const x = run.parseArgs(["extract", "--providers", "a"]);
  assert.deepEqual([x.command, x.parser, x.tier, x.providers], ["extract", undefined, null, ["a"]]);
});

test("the replay helpers: golden paths, page chunks, and where a parse may throw", () => {
  const h = run.replayHelpers;
  const m = { inputs: { files: [{ path: "/s/b" }, { path: "/s/a" }] }, pages: [{ orders: [[], ["/s/a", "/p/zz"]] }] };
  assert.deepEqual(h.goldenPaths({ E0: m, E1: m }), ["/p/zz", "/s/a", "/s/b"]);
  const pages = [3, 2, 4, 1].map((n, i) => ({ id: `p${i}`, steps: Array.from({ length: n }, (_, k) => ({ key: `s${k}` })) }));
  assert.deepEqual(h.chunkPages(pages, 5).map((c) => c.map((p) => p.id)), [["p0", "p1"], ["p2", "p3"]], "pages are never split");
  const page = { id: "x", steps: [{ key: "@load1", threw: true }, { key: "@reset" }, { key: "m/full" }, { key: "m/last" }] };
  assert.deepEqual(h.throwProblems([page], [{ scenario: "x/@load1", message: "m" }]), [], "the old page threw there too");
  const bad = h.throwProblems([page], [{ scenario: "x/m/full", message: "TypeError: frozen" }, { scenario: "x/m/last", message: "TypeError: frozen" }]);
  assert.deepEqual(bad.map((p) => [p.step, p.category]), [["m/full", "threw"]], "only the first step of a run of throws is held against the old page");
  assert.equal(h.captureErrorProblem({ pages: [{ id: "a" }, { id: "b" }] }), null);
  assert.equal(h.captureErrorProblem({ pages: [{ id: "a" }, { id: "b", error: "timeout" }, { id: "c", error: "the seed page a did not complete" }] }),
    "2 of 3 golden pages had a capture error and were not run, so this golden is incomplete (capture again)");
});

test("redact masks the statement files and folders a run has met, whole and with spaces, then every other path", () => {
  const { redact, notePrivate } = run.consoleHelpers;
  const dir = path.join(TMP, "My Statements");
  const file = path.join(dir, "Bank Jan 2026.csv");
  const text = `refusing to read ${file}: it is not inside a statement folder`;
  assert.match(redact(text), / Jan 2026\.csv:/, "paths alone are masked up to the first space, which is why names are noted");
  notePrivate(dir, { file: false });
  notePrivate(file);
  assert.equal(redact(text), "refusing to read <private>: it is not inside a statement folder");
  assert.equal(redact("extract: Bank Jan 2026.csv is not readable"), "extract: <private> is not readable");
  assert.equal(redact(`no files in ${dir} yet`), "no files in <private> yet");
  assert.equal(redact("cannot read /var/data/x.txt or file:///a/b"), "cannot read <path> or <path>");
  // A folder's own name stays (statement folders are often named after the provider).
  notePrivate(path.join(TMP, "synth"), { file: false });
  assert.equal(redact("synth full E0: identical"), "synth full E0: identical");
  assert.equal(redact("x".repeat(400)).length, 300);
});

// ---------------------------------------------------------------- the capture records in Chrome

test("in Chrome, capture.js records exactly what toRecords builds", { skip: !CHROME_READY && "the pinned chrome-headless-shell is not installed" }, async () => {
  const page = path.join(TMP, "capture.html");
  fs.writeFileSync(page, `<!doctype html>\n<meta charset="utf-8">\n<script src="${new URL(`file://${path.join(REPO, "core", "zip.js")}`).href}"></script>\n`);
  const files = [{ name: "a - transactions - 2026-01.csv", text: "date,amount\n2026-01-05,1.00\n" }, { name: "é ü - qif.qif", text: "!Type:Bank\r\nD2026-01-05\r\n^\r\n" }, { name: "empty.csv", text: "" }];
  const list = [
    { trigger: "card", account: "Alpha", kind: "transactions", name: "a.csv", type: "text/csv", text: "é,日本,\ud800,😀\r\n=1+2,\"q\"\n" },
    { trigger: "accounts", account: null, kind: null, name: "Synth accounts - 2026-01.csv", type: "text/csv", text: "" },
    { trigger: "combined", account: null, kind: null, name: "c.csv", type: "text/csv", text: "PK\u0003\u0004 not a zip" },
    { trigger: "zip", account: null, kind: null, name: "synth-csv-2026-01_to_2026-01.zip", type: "application/zip", files },
  ];
  const browser = await browserLib.launch();
  try {
    for (const env of [browserLib.ENVS.E0, browserLib.ENVS.E1]) {
      const context = await browserLib.newContext(browser, env, {});
      try {
        const tab = await context.newPage();
        await tab.goto(`file://${page}`);
        await tab.evaluate((items) => {
          for (const d of items) {
            const blob = d.files ? self.StatementZip.zip(d.files) : new Blob([d.text], { type: d.type });
            const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: d.name });
            window.__s2c.setContext({ trigger: d.trigger, account: d.account, card: null, kind: d.kind });
            try {
              a.click();
            } finally {
              window.__s2c.setContext(null);
            }
          }
        }, list);
        const taken = await capture.take(tab);
        const built = withTz(env.timezoneId, () => replay.toRecords(list, NOW));
        assert.deepEqual(replay.compareRecords(taken, built), [], `${env.id}: field by field`);
        assert.deepEqual(taken.map(({ card, ...r }) => r), built, `${env.id}: the very same records`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test("the synthetic statements are read like the page reads them", async () => {
  const { ex } = await synth();
  assert.deepEqual(ex.failed, []);
  assert.equal(ex.statements.length, 4, "the bogus CSV is read (and rejected by the parser), as the page reads it");
  assert.deepEqual(Object.keys(ex.statements[1]), ["id", "csv"]);
  assert.equal(ex.statements[1].csv, STATEMENTS["b-2026-02.csv"], "CRLF kept");
});

// ---------------------------------------------------------------- the replay command, end to end

// A scratch tree in which the real test/golden/run.js runs on the synthetic provider:
// test/golden, test/lib and test/pages copied (so their REPO is the tree), core/, build/ and
// vendor/ linked. Without {chrome: true} there is no test/node_modules, so nothing can start
// Chrome. The old repository is a real git repository with one commit, so the baseline and
// blob checks run as on the real ones. The statement folder and files have spaces in their
// names, as real ones often do.
const NAMES = { "Bank Jan 2026.csv": "a-2026-01.csv", "Bank Feb 2026.csv": "b-2026-02.csv", "Bank Mar 2026.csv": "c-2026-03.csv" };
const commandTrees = new Map();
function commandTree({ chrome = false } = {}) {
  if (commandTrees.has(chrome)) return commandTrees.get(chrome);
  const { execFileSync } = require("child_process");
  const base = path.join(TMP, chrome ? "command-chrome" : "command");
  const tree = path.join(base, "tree");
  const oldRoot = path.join(base, "old");
  const dir = path.join(base, "My Statements");
  const privDir = path.join(base, "private");
  for (const d of [path.join(tree, "test"), path.join(tree, "providers", "synth"), dir, path.join(base, "config"), path.join(base, "elsewhere")]) fs.mkdirSync(d, { recursive: true });
  for (const sub of ["golden", "lib", "pages"]) fs.cpSync(path.join(REPO, "test", sub), path.join(tree, "test", sub), { recursive: true });
  fs.copyFileSync(path.join(REPO, "test", "package.json"), path.join(tree, "test", "package.json"));
  for (const sub of ["core", "build", "vendor"]) fs.symlinkSync(path.join(REPO, sub), path.join(tree, sub));
  if (chrome) fs.symlinkSync(path.join(REPO, "test", "node_modules"), path.join(tree, "test", "node_modules"));
  const repo = path.join(oldRoot, "synth2csv");
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "parser.js"), PARSER);
  fs.writeFileSync(path.join(repo, "src", "index.template.html"), '<input id="picker" type="file" accept="text/csv,.csv" multiple hidden>\n');
  fs.writeFileSync(path.join(repo, "index.html"), "<!doctype html>\n<title>synthetic old page</title>\n");
  fs.writeFileSync(path.join(repo, "build.py"), "# synthetic\n");
  const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
  const git = (...args) => execFileSync("git", ["-C", repo, "-c", "user.name=synthetic", "-c", "user.email=synthetic", "-c", "commit.gpgsign=false", ...args],
    { env: { ...gitEnv, GIT_CEILING_DIRECTORIES: oldRoot }, stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
  git("init", "-q");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "synthetic");
  const frozen = { ...FROZEN, legacyHead: git("rev-parse", "HEAD"), legacyIndexSha256: sha256(fs.readFileSync(path.join(repo, "index.html"))) };
  fs.writeFileSync(path.join(tree, "providers", "synth", "frozen.js"), `${SPDX}module.exports = ${JSON.stringify(frozen, null, 2)};\n`);
  for (const [name, from] of Object.entries(NAMES)) fs.writeFileSync(path.join(dir, name), STATEMENTS[from]);
  const outside = path.join(base, "elsewhere", "Secret Feb 2026.csv");
  fs.writeFileSync(outside, STATEMENTS["b-2026-02.csv"]);
  const paths = Object.keys(NAMES).map((n) => path.join(dir, n)).sort();
  // The extraction cache as the extract command leaves it: what the page's CSV reader gives
  // (for these bytes, exactly the Node twin), under the key of the tree's extraction page.
  const key = require(path.join(tree, "test", "lib", "extract.js")).buildPage().key;
  const cacheDir = path.join(privDir, "extract", "cache", key.slice(0, 16));
  fs.mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  for (const p of [...paths, outside]) {
    const bytes = fs.readFileSync(p);
    fs.writeFileSync(path.join(cacheDir, `${sha256(bytes)}.csv.canon`), canon({ kind: "csv", statement: { id: path.basename(p), csv: bytes.toString("utf8") } }), { mode: 0o600 });
  }
  const ct = { base, tree, oldRoot, dir, privDir, frozen, paths, outside };
  commandTrees.set(chrome, ct);
  return ct;
}

// Writes a full-tier E0 golden of the synthetic provider where compare and replay look for it:
// `pages` in the stored form (steps as run.compactStep makes them, add orders in page.orders),
// `t` the tables (run.makeTables) their steps refer to.
function writeManifest(ct, t, pages) {
  const files = ct.paths.map((p) => {
    const bytes = fs.readFileSync(p);
    return { path: p, name: path.basename(p), size: bytes.length, sha256: sha256(bytes) };
  });
  const in12 = run.inputsSha12(files);
  const m = {
    format: run.FORMAT, provider: "synth", tier: "full", env: { ...browserLib.ENVS.E0 },
    versions: { playwright: browserLib.EXPECTED.playwright, chrome: browserLib.EXPECTED.chrome },
    page: { kind: "old", legacyRepo: "synth2csv", legacyHead: ct.frozen.legacyHead, sha256: ct.frozen.legacyIndexSha256 },
    inputs: { sha12: in12, files, synthetic: [] },
    facts: { app: "statement", accept: "text/csv,.csv", multiple: true, inputs: ["csv"], modeKey: FROZEN.storage.modeKey, configKey: FROZEN.storage.configKey, modeValues: FROZEN.modeValues, configKinds: FROZEN.configKinds, legacyDom: null },
    probe: { months: ["2026-01", "2026-02", "2026-03"], modeVisible: true, portfolios: [], cards: [] },
    security: false,
    skipped: [],
    pages,
    parts: t.parts,
    lists: t.lists,
  };
  const file = path.join(ct.privDir, "golden", "synth", ct.frozen.legacyIndexSha256.slice(0, 12), in12, "full", "E0", "manifest.json");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, run.manifestText(m), { mode: 0o600 });
}

// The golden of replayed pages ([{id, error?, steps: [{key, act, mode, range, order, storage,
// records}]}]); replay reads no UI, so every step stores an empty snapshot.
function writeGolden(ct, pages) {
  const t = run.makeTables();
  const ui = { status: null, cards: null, diagnostics: null, config: null, from: null, to: null, modes: [] };
  writeManifest(ct, t, pages.map((p) => {
    const orders = [];
    const steps = p.steps.map((s) => {
      let oi = orders.findIndex((o) => canon(o) === canon(s.order));
      if (oi < 0) oi = orders.push(s.order) - 1;
      return { key: s.key, act: s.act, mode: s.mode, range: s.range, order: oi, storage: s.storage, lsKeys: Object.keys(s.storage).sort(), ui, downloads: t.list(s.records) };
    });
    return { id: p.id, env: "E0", o: "O0", i: "I0", c: "C0", mseed: null, seed: null, actions: [], orders, steps, errors: null, ...(p.error ? { error: p.error } : {}) };
  }));
}

// Runs `node <tree>/test/golden/run.js <command> …` with the private dir, old root and user
// config of the scratch tree: {code, out (stdout and stderr), report}.
function runCommand(ct, command, args) {
  const { spawnSync } = require("child_process");
  const env = { ...process.env, S2C_PRIVATE: ct.privDir, S2C_OLD_ROOT: ct.oldRoot, XDG_CONFIG_HOME: path.join(ct.base, "config"), S2C_STATEMENTS: path.join(ct.base, "no-statements") };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, [path.join(ct.tree, "test", "golden", "run.js"), command, ...args, "--tier", "full", "--providers", "synth", "--no-live", "--jobs", "1",
    "--statements", `synth=${ct.dir}`, "--old-root", ct.oldRoot], { env, encoding: "utf8", timeout: 120000 });
  const reports = path.join(ct.privDir, "reports");
  const last = fs.readdirSync(reports).filter((n) => n.endsWith(`-${command}.json`)).sort().pop();
  return { code: r.status, out: `${r.stdout}${r.stderr}`, report: JSON.parse(fs.readFileSync(path.join(reports, last), "utf8")) };
}
const runReplay = (ct) => runCommand(ct, "replay", ["--parser", "old"]);

test("the replay command end to end: a complete golden passes; pages with capture errors fail the environment; the console names no statement file", async () => {
  const ct = commandTree();
  const t = await synth();
  const ex = await extract([...ct.paths, ct.outside], { inputs: ["csv"], readers: "node", allowed: [ct.dir, path.dirname(ct.outside)] });
  const order = ct.paths;
  const page = (id, ord) => {
    const at = (key, act, mode, o) => ({ key, act, mode, range: { from: "2026-01", to: "2026-03" }, order: o, storage: st(null) });
    const g = goldenSteps(t.handle, ex.byPath, [
      { key: "@open", act: [["open"]], mode: "balance", range: { from: "", to: "" }, order: [], storage: st(null) },
      at("@load1", [["load", ord, "picker"]], "balance", ord),
      at("balance/full", [["mode", "balance"], ["range", "2026-01", "2026-03"]], "balance", ord),
      at("holdings/full", [["mode", "holdings"], ["range", "2026-01", "2026-03"]], "holdings", ord),
    ]);
    return { id, steps: g.steps };
  };
  const a = page("synth/E0/O0/I0/C0", order);
  const b = page("synth/E0/O1/I0/C0", order.slice().reverse());
  const privateText = (out) => [...Object.keys(NAMES), path.basename(ct.outside), "My Statements", "Bank ", "Secret", ct.base].filter((x) => out.includes(x));

  // A complete golden: identical, exit 0.
  writeGolden(ct, [a, b]);
  let r = runReplay(ct);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /synth full E0: 2 pages, 8 steps, \d+ downloads .*: identical;/);
  assert.match(r.out, /replay total: 2 pages, 8 steps, \d+ downloads .*: 0 mismatches, 0 ICU drift; /);
  assert.deepEqual(privateText(r.out), []);
  assert.equal(r.report.ok, true);
  assert.equal(r.report.providers[0].envs[0].errorPages, 0);
  assert.equal(r.report.providers[0].envs[0].incomplete, undefined);

  // One page whose capture failed: the other is replayed, and the environment fails.
  writeGolden(ct, [a, { ...b, error: "synthetic capture failure" }]);
  r = runReplay(ct);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /synth full E0: 1 pages, 4 steps, \d+ downloads .*: identical on the steps replayed, INCOMPLETE;/);
  assert.match(r.out, / {2}FAILED: 1 of 2 golden pages had a capture error and were not run, so this golden is incomplete \(capture again\)/);
  assert.match(r.out, /replay total: 1 pages, 4 steps, .*, 1 golden pages with capture errors not run; INCOMPLETE in 1 environments; /);
  assert.equal(r.report.ok, false);
  assert.equal(r.report.providers[0].envs[0].errorPages, 1);
  assert.equal(r.report.providers[0].envs[0].incomplete.length, 1);
  assert.deepEqual(privateText(r.out), []);

  // A golden that reads a file outside the allowed folders: the refusal names the file, whose
  // path has spaces; the console masks it whole.
  const c = page("synth/E0/O0/I0/C0", [...order, ct.outside]);
  writeGolden(ct, [c]);
  r = runReplay(ct);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /synth: FAILED refusing to read <private>: it is not inside a statement folder/);
  assert.deepEqual(privateText(r.out), []);
  assert.ok(r.report.providers[0].error.includes(ct.outside), "the private report keeps the full text");
});

test("the compare command end to end: a golden with a page whose capture failed fails the environment", { skip: !CHROME_READY && "the pinned chrome-headless-shell is not installed" }, async () => {
  const { pathToFileURL } = require("url");
  const ct = commandTree({ chrome: true });
  // The candidate page (as --page <dir> serves it), inside the tree so the input guard allows it.
  const pageDir = path.join(ct.tree, "candidate", "synth");
  fs.mkdirSync(pageDir, { recursive: true });
  const pageFile = path.join(pageDir, "index.html");
  fs.writeFileSync(pageFile, '<!doctype html>\n<meta charset="utf-8">\n<title>synthetic</title>\n<main><input id="picker" type="file" accept="text/csv,.csv" multiple hidden><p id="busy" hidden></p><div id="status"></div><p id="empty">No statements yet.</p></main>\n');
  const keys = [FROZEN.storage.modeKey, FROZEN.storage.configKey];
  const def = (id) => ({ id, env: "E0", o: "O0", i: "I0", c: "C0", mseed: null, seed: null, actions: [] });
  const t = run.makeTables();
  const pages = [];
  const browser = await browserLib.launch();
  try {
    for (const id of ["synth/E0/O0/I0/C0", "synth/E0/O1/I0/C0"]) {
      const holder = { orders: [], orderKeys: [] };
      const res = await run.runPage(browser, def(id), { url: pathToFileURL(pageFile).href, keys, modes: FROZEN.modeValues, seed: {}, onStep: (s) => run.compactStep(s, holder, t) });
      assert.equal(res.error, null);
      delete holder.orderKeys;
      pages.push({ ...def(id), orders: holder.orders, steps: res.steps, errors: res.errors });
    }
  } finally {
    await browser.close();
  }
  const args = ["--page", path.join(ct.tree, "candidate")];
  writeManifest(ct, t, pages);
  let r = runCommand(ct, "compare", args);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /synth full E0: 2 steps, identical/);
  writeManifest(ct, t, [pages[0], { ...pages[1], error: "synthetic capture failure" }]);
  r = runCommand(ct, "compare", args);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /synth full E0: 1 steps, identical/);
  assert.match(r.out, / {2}FAILED: 1 of 2 golden pages had a capture error and were not run, so this golden is incomplete \(capture again\)/);
  assert.equal(r.report.ok, false);
  assert.deepEqual(r.report.providers[0].envs[0].incomplete, ["1 of 2 golden pages had a capture error and were not run, so this golden is incomplete (capture again)"]);
});
