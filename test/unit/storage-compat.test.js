// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The storage-compatibility run (test/storage-compat/run.js) on synthetic pages. Its pure
// checks are tested without Chrome, each rule with a passing and a failing sample: the config
// rules of (c), the storage calls of a new page and of an old one, the changes no logged call
// explains, the comparison of two pages' calls, the configurator operations, the seeds and the
// owners of the keys on the origin, and the mutants' verdicts. In Chrome (skipped, with a
// message, without the pinned chrome-headless-shell) the whole run goes over the synthetic tree
// of test/unit/synthetic-tree.js, whose statement app is a byte copy of the real
// core/app/statement-app.js, on one origin: a statement app with a configurator and a custom app
// with a mode only, each page served as its own "old" page. Identical pages pass every check;
// each self-test mutant (a renamed config key, a renamed mode key, a page that clears the
// storage) fails in exactly its expected way; and a page that writes a field the configurator
// never writes, one that writes another provider's key and one that writes a key through a
// property fail too. $S2C_PRIVATE points at a temporary directory, so nothing here can reach
// <private-dir>.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-storage-compat-test-"));
process.env.S2C_PRIVATE = path.join(TMP, "private");
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const { makeSyntheticTree, SPDX } = require("./synthetic-tree.js");
const sc = require("../storage-compat/run.js");
const browserLib = require("../lib/browser.js");
const serve = require("../lib/serve.js");
const { loadSpec, renderFixtures } = require("../lib/fixtures.js");

const REPO = path.resolve(__dirname, "..", "..");
const CHROME_READY = fs.existsSync(browserLib.chromePath());
const NO_CHROME = !CHROME_READY && "the pinned chrome-headless-shell is not installed";

const FROZEN = Object.freeze({
  storage: { modeKey: "demo-csv-mode", configKey: "demo-csv-accounts" },
  modeValues: ["balance", "tradelog", "holdings"],
  configKinds: ["", "investment", "cash"],
});
const CUSTOM = Object.freeze({ storage: { modeKey: "demo-sheet-mode", configKey: null }, modeValues: ["plain", "monthly"], configKinds: null });
const owners = new Map([["other-csv-mode", "other"], ["other-csv-accounts", "other"], [sc.UNRELATED.key, sc.UNRELATED.owner]]);
const cats = (problems) => problems.map((p) => p.category);
const get = (key, value) => ({ op: "get", area: "local", key, value });
const set = (key, value) => ({ op: "set", area: "local", key, value });

// ---------------------------------------------------------------- pure checks (no Chrome)

test("parseArgs: the defaults, the flags and their errors", () => {
  assert.deepEqual(sc.parseArgs([]), { selfTest: false, mutants: null, providers: null, oldRoot: null, statements: [], page: "dist", live: true, verbose: false });
  const o = sc.parseArgs(["--providers", "a,b", "--statements", "a=/x", "--statements", "b=/y", "--old-root", "/r", "--page", "/p", "--no-live", "--verbose"]);
  assert.deepEqual([o.providers, o.statements, o.oldRoot, o.page, o.live, o.verbose], [["a", "b"], ["a=/x", "b=/y"], "/r", "/p", false, true]);
  assert.deepEqual(sc.parseArgs(["--self-test", "--mutants", "rename-mode-key"]).mutants, ["rename-mode-key"]);
  assert.throws(() => sc.parseArgs(["--mutants", "rename-mode-key"]), /goes with --self-test/);
  assert.throws(() => sc.parseArgs(["--self-test", "--mutants", "nope"]), /unknown mutant/);
  assert.throws(() => sc.parseArgs(["--self-test", "--page", "/p"]), /--page does not apply/);
  assert.throws(() => sc.parseArgs(["--providers"]), /needs a value/);
  assert.throws(() => sc.parseArgs(["--bogus"]), /unknown argument/);
});

test("diffStorage lists every key whose value changed, absent as null, in code-point order", () => {
  assert.deepEqual(sc.diffStorage({ b: "1", a: "x", c: "same" }, { a: "y", c: "same", d: "new" }), [
    { key: "a", before: "x", after: "y" },
    { key: "b", before: "1", after: null },
    { key: "d", before: null, after: "new" },
  ]);
  assert.deepEqual(sc.diffStorage({}, {}), []);
  assert.deepEqual(sc.diffStorage(null, { k: "" }), [{ key: "k", before: null, after: "" }]);
});

test("seedsFor: every frozen key and the unrelated page's, each with its owner", () => {
  const { seeds, owners: o } = sc.seedsFor([{ id: "demo", frozen: FROZEN }, { id: "sheet", frozen: CUSTOM }, { id: "none", frozen: null }]);
  assert.deepEqual(seeds, { "demo-csv-accounts": "{}", "demo-csv-mode": "tradelog", "demo-sheet-mode": "monthly", [sc.UNRELATED.key]: sc.UNRELATED.value });
  assert.deepEqual([...o.entries()].sort(), [["demo-csv-accounts", "demo"], ["demo-csv-mode", "demo"], ["demo-sheet-mode", "sheet"], [sc.UNRELATED.key, sc.UNRELATED.owner]].sort());
  assert.deepEqual(sc.ownKeys(FROZEN), ["demo-csv-mode", "demo-csv-accounts"]);
  assert.deepEqual(sc.ownKeys(CUSTOM), ["demo-sheet-mode"]);
  assert.equal(sc.targetMode(FROZEN), "holdings");
});

test("configProblems: what the configurator writes passes; anything else is refused", () => {
  const ids = ["a:SGD", "b:SGD"];
  const ok = (cfg) => assert.deepEqual(sc.configProblems(JSON.stringify(cfg), { ids }), [], JSON.stringify(cfg));
  ok({});
  ok({ "a:SGD": { name: "=Renamed \"A&B\", <x>" } });
  ok({ "a:SGD": { kind: "investment" }, "b:SGD": { kind: "cash", mergeInto: "a:SGD", exclude: true } });
  const bad = (text, re, opts = { ids }) => {
    const p = sc.configProblems(text, opts);
    assert.ok(p.some((m) => re.test(m)), `${text}: ${p.join("; ") || "(none)"}`);
  };
  bad("{not json", /not JSON/);
  for (const t of ["null", "[]", "5", "\"x\""]) bad(t, /not a JSON object/);
  bad(JSON.stringify({ "a:SGD": "x" }), /not an object/);
  bad(JSON.stringify({ "a:SGD": {} }), /empty entry/);
  bad(JSON.stringify({ "a:SGD": { note: "x" } }), /a field other than/);
  bad(JSON.stringify({ "a:SGD": { kind: "bank" } }), /a kind other than investment or cash/);
  bad(JSON.stringify({ "a:SGD": { kind: "" } }), /a kind other than/);
  bad(JSON.stringify({ "a:SGD": { name: "" } }), /trimmed, non-empty string/);
  bad(JSON.stringify({ "a:SGD": { name: " padded " } }), /trimmed, non-empty string/);
  bad(JSON.stringify({ "a:SGD": { name: 5 } }), /trimmed, non-empty string/);
  bad(JSON.stringify({ "a:SGD": { exclude: false } }), /exclude that is not true/);
  bad(JSON.stringify({ "a:SGD": { exclude: "true" } }), /exclude that is not true/);
  bad(JSON.stringify({ "a:SGD": { mergeInto: "a:SGD" } }), /mergeInto that is not another detected id/);
  bad(JSON.stringify({ "a:SGD": { mergeInto: "zz" } }), /mergeInto that is not another detected id/);
  bad(JSON.stringify({ "a:SGD": { mergeInto: 7 } }), /mergeInto that is not another detected id/);
  bad(JSON.stringify({ "zz:SGD": { name: "x" } }), /an id the page did not detect/);
  assert.deepEqual(sc.configProblems(JSON.stringify({ "zz:SGD": { name: "x" } })), [], "without ids any id passes");
  assert.deepEqual(sc.configProblems(JSON.stringify({ x: { kind: "bank" } }), { kinds: ["bank"] }), [], "the kinds come from the caller");
});

test("callProblems: a new page may use only its frozen keys, with allowed values", () => {
  const step = (entries, action = "open") => [{ action, entries }];
  const newPage = (entries, extra = {}) => sc.callProblems(step(entries), FROZEN, { kind: "new", owners, ids: ["a:SGD"], ...extra });
  assert.deepEqual(newPage([get("demo-csv-mode", null), get("demo-csv-accounts", null), set("demo-csv-mode", "balance"),
    set("demo-csv-accounts", JSON.stringify({ "a:SGD": { name: "N", kind: "cash" } })), set("demo-csv-mode", "holdings")]), []);
  assert.deepEqual(cats(newPage([get("demo-csv-accounts-renamed", null)])), ["c.read"]);
  assert.deepEqual(cats(newPage([set("demo-csv-mode-renamed", "balance")])), ["c.key"]);
  assert.deepEqual(cats(newPage([{ op: "remove", area: "local", key: "demo-csv-mode-renamed", value: null }])), ["c.key"]);
  assert.deepEqual(cats(newPage([{ op: "remove", area: "local", key: "demo-csv-mode", value: null }])), ["c.remove"]);
  assert.deepEqual(cats(newPage([{ op: "clear", area: "local", key: null, value: null }])), ["c.remove", "cross"]);
  assert.deepEqual(cats(newPage([{ ...set("demo-csv-mode", "balance"), area: "session" }])), ["c.area"]);
  assert.deepEqual(cats(newPage([set("demo-csv-mode", "garbage")])), ["c.mode"]);
  assert.deepEqual(cats(newPage([set("demo-csv-accounts", JSON.stringify({ "a:SGD": { kind: "bank" } }))])), ["c.config"]);
  assert.deepEqual(cats(newPage([set("demo-csv-accounts", JSON.stringify({ "b:SGD": { name: "x" } }))])), ["c.config"], "an id the page did not detect");
  assert.deepEqual(cats(newPage([get("other-csv-mode", "x")])), ["cross"]);
  assert.deepEqual(cats(newPage([set("other-csv-accounts", "{}")])), ["cross"]);
  assert.deepEqual(cats(newPage([set(sc.UNRELATED.key, "{}")])), ["cross"]);
  const msgs = newPage([set("demo-csv-accounts", JSON.stringify({ "a:SGD": { name: "PRIVATE-NAME", note: 1 } }))]).map((p) => p.message);
  assert.ok(msgs.length && msgs.every((m) => !m.includes("PRIVATE-NAME")), "messages never hold a stored value");
  // an old page: frozen.js must describe it; values are not policed beyond the mode values
  const oldPage = (entries) => cats(sc.callProblems(step(entries), FROZEN, { kind: "old", owners }));
  assert.deepEqual(oldPage([get("demo-csv-mode", null), set("demo-csv-accounts", "{\"x\":{\"note\":1}}"), set("demo-csv-mode", "tradelog")]), []);
  assert.deepEqual(oldPage([set("demo-csv-other", "x")]), ["frozen"]);
  assert.deepEqual(oldPage([set("demo-csv-mode", "garbage")]), ["frozen"]);
  assert.deepEqual(oldPage([get("other-csv-mode", null)]), ["cross"]);
  assert.deepEqual(oldPage([{ op: "clear", area: "local", key: null, value: null }]), ["frozen", "cross"]);
  // a custom app without a configurator has the mode key only
  assert.deepEqual(cats(sc.callProblems(step([get("demo-sheet-mode", null), set("demo-sheet-mode", "monthly")]), CUSTOM, { kind: "new", owners })), []);
  assert.deepEqual(cats(sc.callProblems(step([set("demo-sheet-mode", "balance")]), CUSTOM, { kind: "new", owners })), ["c.mode"]);
});

test("diffProblems: a change no logged call of its step explains is a problem", () => {
  const steps = (diff, entries = []) => [{ action: "load", entries, diff }];
  const ch = (key, before, after) => ({ key, before, after });
  const newPage = (diff, entries) => cats(sc.diffProblems(steps(diff, entries), FROZEN, { kind: "new", owners }));
  assert.deepEqual(newPage([ch("demo-csv-mode", null, "balance")], [set("demo-csv-mode", "balance")]), [], "explained by a set");
  assert.deepEqual(newPage([ch("demo-csv-mode", "x", null), ch("other-csv-mode", "y", null)], [{ op: "clear", area: "local", key: null, value: null }]), [], "explained by a clear (callProblems reports it)");
  assert.deepEqual(newPage([ch("demo-csv-mode", null, "balance")]), ["c.unlogged"]);
  assert.deepEqual(newPage([ch("other-csv-mode", "y", "z")]), ["cross"]);
  assert.deepEqual(newPage([ch("some-new-key", null, "1")]), ["c.key"]);
  assert.deepEqual(newPage([ch("demo-csv-mode", null, "balance")], [{ ...set("demo-csv-mode", "balance"), area: "session" }]), ["c.unlogged"], "a sessionStorage call explains nothing");
  const oldPage = (diff) => cats(sc.diffProblems(steps(diff), FROZEN, { kind: "old", owners }));
  assert.deepEqual(oldPage([ch("demo-csv-mode", null, "x")]), ["frozen"]);
  assert.deepEqual(oldPage([ch("some-new-key", null, "1")]), ["frozen"]);
  assert.deepEqual(oldPage([ch(sc.UNRELATED.key, sc.UNRELATED.value, null)]), ["cross"]);
});

test("traceMismatches: the same steps with the same calls, or the difference", () => {
  const t = [{ action: "open", entries: [get("k", null), set("k", "balance")] }, { action: "load", entries: [] }];
  assert.deepEqual(sc.traceMismatches(t, JSON.parse(JSON.stringify(t))), []);
  const other = [{ action: "open", entries: [get("k", null), set("k2", "balance")] }, { action: "load", entries: [] }];
  assert.deepEqual(sc.traceMismatches(t, other).map((m) => [m.field, m.step]), [["calls", "open"]]);
  assert.deepEqual(sc.traceMismatches(t, t.slice(0, 1)).map((m) => m.field), ["steps"]);
});

test("pickOps: the golden harness's C-ui-combo operations, by row index", () => {
  const row = (index, autoKind, currency) => ({ index, id: `r${index}`, label: `R${index}`, autoKind, currency });
  assert.deepEqual(sc.pickOps([]), []);
  const one = sc.pickOps([row(0, "Investment", "SGD")]);
  assert.deepEqual(one.map((o) => Object.keys(o)[0]), ["rename", "kind"]);
  assert.deepEqual(one[1], { kind: { index: 0, value: "cash" } });
  assert.deepEqual(sc.pickOps([row(0, "Cash-like", "SGD")])[1], { kind: { index: 0, value: "investment" } });
  const three = sc.pickOps([row(0, "Investment", "SGD"), row(1, "Cash-like", "USD"), row(2, "Bank", "SGD")]);
  assert.deepEqual(three, [
    { rename: { index: 0, name: require("../golden/scenarios.js").HOSTILE_NAME } },
    { kind: { index: 1, value: "investment" } },
    { kind: { index: 0, value: "cash" } },
    { merge: { from: 2, into: 0 } },
    { exclude: { index: 2 } },
  ]);
  assert.deepEqual(sc.pickOps([row(0, "Investment", null), row(1, "Investment", null)]).slice(-2), [{ merge: { from: 1, into: 0 } }, { exclude: { index: 1 } }]);
});

test("categories and the mutants' verdicts", () => {
  assert.equal(sc.uiCategory("ui.config", "a"), "a.config");
  assert.equal(sc.uiCategory("ui.configCount", "b"), "b.config");
  assert.equal(sc.uiCategory("ui.modes", "a"), "a.mode");
  assert.equal(sc.uiCategory("ui.cards", "a"), "a.ui");
  assert.deepEqual(sc.categoriesOf([{ category: "keys" }, { category: "c.key" }, { category: "keys" }]), { "c.key": 1, keys: 2 });
  const result = (categories, settings = 4) => ({ ok: !Object.keys(categories).length, settings, categories });
  const want = { "c.key": 1, "c.read": 1, keys: 1, "b.read": 1, "a.config": 2, "b.config": 2, "a.downloads": 3 };
  assert.deepEqual(sc.checkMutant("rename-config-key", result(want)), { ok: true, problems: [] });
  assert.deepEqual(sc.checkMutant("rename-config-key", result({})).problems.slice(0, 2), ["the run passed: the mutant was not detected", "no c.key problem"]);
  assert.ok(sc.checkMutant("rename-config-key", result({ ...want, "a.mode": 1 })).problems.includes("unexpected a.mode problems (1)"));
  const noRows = { "c.key": 1, "c.read": 1, keys: 1, "b.read": 1 };
  assert.equal(sc.checkMutant("rename-config-key", result(noRows, 0)).ok, true, "the config categories need rows");
  assert.equal(sc.checkMutant("rename-config-key", result(noRows, 4)).ok, false);
  assert.equal(sc.checkMutant("nope", result({})).ok, false);
  assert.deepEqual(Object.keys(sc.MUTANTS), ["rename-config-key", "rename-mode-key", "clear-storage"]);
  for (const m of Object.values(sc.MUTANTS)) {
    assert.ok(fs.existsSync(path.join(REPO, m.piece)), m.piece);
    for (const c of m.require.concat(m.requireWithRows)) assert.ok(!m.forbid.includes(c), `${m.piece}: ${c} both required and forbidden`);
  }
  assert.equal(sc.MUTANTS["rename-config-key"].applies(CUSTOM), false);
  assert.equal(sc.MUTANTS["rename-config-key"].applies(FROZEN), true);
});

test("allowlist: each page under its two paths, and the observer", () => {
  const pairs = [{ id: "demo", legacyRepo: "demo-old", oldFile: "/o/demo.html", newFile: "/n/demo.html" }];
  assert.deepEqual(sc.allowlist(pairs, "/t/observer.html"), {
    [sc.OBSERVER_PATH]: "/t/observer.html",
    "/old/demo-old/": "/o/demo.html",
    "/old/demo-old/index.html": "/o/demo.html",
    "/new/demo/": "/n/demo.html",
    "/new/demo/index.html": "/n/demo.html",
  });
});

test("summaryLines hold counts, categories and key names only", () => {
  const r = { id: "demo", statements: 3, rows: 2, settings: 4, mode: "holdings", downloads: 9, calls: { reads: 4, writes: 7 }, categories: {}, ok: true, problems: [] };
  const pass = sc.summaryLines(r).join("\n");
  assert.ok(pass.includes("demo: 3 statements, 2 configurator rows, 4 settings, mode holdings"));
  assert.ok(pass.endsWith("pass"));
  assert.ok(sc.summaryLines({ ...r, ops: ["rename", "kind", "merge", "exclude"] })[0].endsWith("4 settings (rename, kind, merge, exclude), mode holdings"));
  const fail = sc.summaryLines({ ...r, ok: false, categories: { "a.config": 2, "c.key": 1, cross: 1, page: 1 } }).join("\n");
  assert.match(fail, /\(a\) new writes, old reads: FAIL \(a\.config 2\)/);
  assert.match(fail, /\(c\) .*FAIL \(c\.key 1\)/);
  assert.match(fail, /one origin: FAIL \(cross 1\)/);
  assert.match(fail, /also: page 1/);
});

// ---------------------------------------------------------------- in Chrome, on synthetic pages

// A page of its own for the hooks: its script makes every kind of storage call.
const HOOK_PAGE = `<!doctype html><meta charset="utf-8"><title>hooks</title><script>
localStorage.setItem("k1", "v1");
localStorage.getItem("k1");
localStorage.getItem("missing");
sessionStorage.setItem("s1", "x");
localStorage.removeItem("k1");
localStorage["k2"] = "via a property";
localStorage.setItem("k3", 3);
</script>`;

test("the storage hooks log every call in order and dump the storage unlogged", { skip: NO_CHROME }, async () => {
  const dir = fs.mkdtempSync(path.join(TMP, "hooks-"));
  fs.writeFileSync(path.join(dir, "index.html"), HOOK_PAGE);
  const server = await serve({ "/hooks/": path.join(dir, "index.html") });
  const browser = await browserLib.launch();
  try {
    const context = await browserLib.newContext(browser, browserLib.ENVS.E0, null);
    await context.addInitScript(sc.storageHooks);
    const page = await context.newPage();
    await page.goto(`${server.origin}/hooks/`, { waitUntil: "load" });
    const calls = await page.evaluate(() => window.__s2cStorage.drain());
    assert.deepEqual(calls, [
      { op: "set", area: "local", key: "k1", value: "v1" },
      { op: "get", area: "local", key: "k1", value: "v1" },
      { op: "get", area: "local", key: "missing", value: null },
      { op: "set", area: "session", key: "s1", value: "x" },
      { op: "remove", area: "local", key: "k1", value: null },
      { op: "set", area: "local", key: "k3", value: "3" },
    ], "a write through a property is not logged");
    const dump = await page.evaluate(() => window.__s2cStorage.dump());
    assert.deepEqual(Object.keys(dump).sort(), ["k2", "k3"], "the dump shows it");
    assert.deepEqual(await page.evaluate(() => window.__s2cStorage.drain()), [], "drained, and the dump is not logged");
    await page.evaluate(() => window.__s2cStorage.apply([["k2", null], ["k4", "x"]]));
    assert.deepEqual(await page.evaluate(() => window.__s2cStorage.dump()), { k3: "3", k4: "x" });
    assert.deepEqual(await page.evaluate(() => window.__s2cStorage.drain()), [], "apply is not logged");
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
});

// The synthetic site: syn-invest (a statement app whose configurator has an investment and a
// cash-like row of one currency) and syn-sheet (a custom app with a mode only), each page also
// served as its own old page; the other providers' keys and the unrelated key are on the origin.
const PROVIDERS = ["syn-invest", "syn-sheet"];

function frozenOf(t, id) {
  const file = path.join(t.root, "providers", id, "frozen.js");
  delete require.cache[require.resolve(file)];
  return require(file);
}

function site(t) {
  const frozens = ["syn-csv", "syn-invest", "syn-pdf", "syn-sheet"].map((id) => ({ id, frozen: frozenOf(t, id) }));
  const { seeds, owners: o } = sc.seedsFor(frozens);
  const files = {};
  for (const id of PROVIDERS) {
    const spec = loadSpec(path.join(t.root, "providers", id, "fixtures"));
    const out = path.join(t.tmp, "fixtures", id);
    files[id] = renderFixtures(spec, out).filter((p) => !spec.expectErrors.includes(path.basename(p)));
  }
  const pairs = (newDir, ids = PROVIDERS) => ids.map((id) => ({
    id, legacyRepo: `${id}-old`, frozen: frozenOf(t, id), legacyDom: null,
    oldFile: path.join(t.root, "dist", id, "index.html"), newFile: path.join(newDir, id, "index.html"), files: files[id],
  }));
  return { seeds, owners: o, pairs };
}

// Builds the new pages with one injected piece (written into the tree's test/) into a folder.
function mutantPages(t, name, text, ids = PROVIDERS) {
  const rel = `test/storage-compat/inject/${name}.js`;
  t.write({ [rel]: text });
  const out = path.join(t.tmp, "mutants", name);
  const r = t.build(["--only", ids.join(","), "--inject", path.join(t.root, rel), "--out", out]);
  assert.equal(r.code, 0, r.err.join("\n"));
  return out;
}
const pieceOf = (m) => fs.readFileSync(path.join(REPO, sc.MUTANTS[m].piece), "utf8");

test("the run on one origin, in Chrome", { skip: NO_CHROME }, async (tt) => {
  const t = makeSyntheticTree();
  const browser = await browserLib.launch();
  tt.after(async () => {
    await browser.close();
    t.cleanup();
  });
  assert.equal(t.build().code, 0, "the synthetic tree builds");
  const s = site(t);
  const run = (newDir, ids) => sc.runSite(browser, { pairs: s.pairs(newDir, ids), seeds: s.seeds, owners: s.owners, tmp: fs.mkdtempSync(path.join(t.tmp, "site-")) });

  await tt.test("identical pages pass (a), (b), (c), keys and one origin", async () => {
    const r = await run(path.join(t.root, "dist"));
    assert.deepEqual(r.final.problems, []);
    const [inv, sheet] = r.results;
    for (const x of r.results) assert.deepEqual(x.problems, [], `${x.id}: ${x.problems.map((p) => `[${p.category}] ${p.message}`).join("\n")}`);
    assert.deepEqual([inv.id, inv.rows, inv.settings, inv.mode, inv.ok], ["syn-invest", 2, 5, "holdings", true], "rename, two kinds, merge and exclude");
    assert.ok(inv.downloads > 0 && inv.statements === 4);
    assert.deepEqual([sheet.id, sheet.rows, sheet.settings, sheet.mode, sheet.ok], ["syn-sheet", 0, 0, "monthly", true]);
    assert.equal(sheet.statements, 1, "a single-file picker takes one file");
    // what the new pages did: 2 reads per page instance (1 for the custom app) and the writes
    assert.deepEqual(inv.calls, { reads: 4, writes: 1 + 5 + 1 + 1 }, "the new writer's mode at open, five settings, the mode; the new reader's mode at open");
    assert.deepEqual(sheet.calls, { reads: 2, writes: 3 });
    assert.equal(r.final.keys, Object.keys(s.seeds).length, "every key on the origin is a known one");
    assert.deepEqual(inv.ops, ["rename", "kind", "kind", "merge", "exclude"]);
    // deterministic: a second run on the same pages gives the same results, digest included
    const again = await run(path.join(t.root, "dist"));
    assert.equal(sc.resultsDigest(again), sc.resultsDigest(r));
    assert.match(sc.resultsDigest(r), /^[0-9a-f]{64}$/);
  });

  await tt.test("a renamed config key fails exactly as expected", async () => {
    const r = await run(mutantPages(t, "rename-config-key", pieceOf("rename-config-key"), ["syn-invest"]), ["syn-invest"]);
    const v = sc.checkMutant("rename-config-key", r.results[0]);
    assert.deepEqual(v.problems, [], JSON.stringify(r.results[0].categories));
    assert.ok(r.results[0].categories["a.downloads"], "the renamed account's files differ");
  });

  await tt.test("a renamed mode key fails exactly as expected, on both apps", async () => {
    const r = await run(mutantPages(t, "rename-mode-key", pieceOf("rename-mode-key")));
    for (const x of r.results) assert.deepEqual(sc.checkMutant("rename-mode-key", x).problems, [], `${x.id}: ${JSON.stringify(x.categories)}`);
  });

  await tt.test("a page that clears the storage fails exactly as expected", async () => {
    const r = await run(mutantPages(t, "clear-storage", pieceOf("clear-storage")));
    for (const x of r.results) assert.deepEqual(sc.checkMutant("clear-storage", x).problems, [], `${x.id}: ${JSON.stringify(x.categories)}`);
    assert.ok(r.final.problems.length, "the last reader cleared the other keys");
  });

  await tt.test("a config field the configurator never writes fails (c)", async () => {
    const piece = `${SPDX}(function () {
  const S = self.StatementStorage;
  self.StatementStorage = Object.assign({}, S, {
    saveConfig(key, cfg) {
      const out = {};
      for (const [k, v] of Object.entries(cfg)) out[k] = Object.assign({}, v, { note: "x" });
      return S.saveConfig(key, out);
    },
  });
})();
`;
    const r = await run(mutantPages(t, "extra-field", piece, ["syn-invest"]), ["syn-invest"]);
    const c = r.results[0].categories;
    assert.ok(c["c.config"] && c.keys, JSON.stringify(c));
    assert.ok(!c.cross && !c["c.key"], JSON.stringify(c));
  });

  await tt.test("a page that writes another provider's key fails one origin", async () => {
    const other = frozenOf(t, "syn-csv").storage.modeKey;
    const piece = `${SPDX}(function () {
  localStorage.setItem(${JSON.stringify(other)}, "holdings");
})();
`;
    const r = await run(mutantPages(t, "foreign-write", piece, ["syn-sheet"]), ["syn-sheet"]);
    const x = r.results[0];
    assert.ok(x.categories.cross, JSON.stringify(x.categories));
    assert.ok(x.problems.some((p) => p.category === "cross" && p.message.includes(`wrote ${other}, a key of syn-csv`)));
  });

  await tt.test("a key written through a property, with no call to log, fails (c)", async () => {
    const piece = `${SPDX}(function () {
  localStorage["storage-compat-test-extra"] = "1";
})();
`;
    const r = await run(mutantPages(t, "property-write", piece, ["syn-sheet"]), ["syn-sheet"]);
    const x = r.results[0];
    assert.ok(x.problems.some((p) => p.category === "c.key" && p.message.startsWith("storage-compat-test-extra, which is not a frozen key")), JSON.stringify(x.categories));
  });

  await tt.test("a UI difference with equal storage and downloads fails (a) and (b) as ui", async () => {
    const piece = `${SPDX}(function () {
  const n = self.StatementProvider.ui.notes;
  for (const k of ["other", "tradelog", "holdings"]) n[k] += " (changed)";
})();
`;
    const r = await run(mutantPages(t, "card-notes", piece, ["syn-invest"]), ["syn-invest"]);
    assert.deepEqual(r.results[0].categories, { "a.ui": 1, "b.ui": 1 }, "the cards alone differ");
    assert.ok(r.results[0].problems.every((p) => p.message.includes("ui.cards")));
  });

  await tt.test("a mode that changes no download is reported as vacuous", async () => {
    const piece = `${SPDX}(function () {
  const id = self.StatementProvider.parserGlobal;
  const p = self[id];
  self[id] = Object.assign({}, p, { parseSheet(wb, o) { return p.parseSheet(wb, Object.assign({}, o, { mode: "plain" })); } });
})();
`;
    const r = await run(mutantPages(t, "mode-ignored", piece, ["syn-sheet"]), ["syn-sheet"]);
    const x = r.results[0];
    assert.ok(x.problems.some((p) => p.category === "vacuous" && p.message === "(a) the mode does not change the new page's downloads"), JSON.stringify(x.categories));
    assert.ok(x.categories["a.downloads"] && x.categories["b.downloads"], "and the old page's monthly files differ");
  });

  await tt.test("rows the pages detect in another order fail probe (and keys)", async () => {
    const piece = `${SPDX}(function () {
  const id = self.StatementProvider.parserGlobal;
  const p = self[id];
  self[id] = Object.assign({}, p, {
    parseStatements() {
      const r = p.parseStatements.apply(this, arguments);
      if (r && Array.isArray(r.portfolios)) r.portfolios = r.portfolios.slice().reverse();
      return r;
    },
  });
})();
`;
    const r = await run(mutantPages(t, "rows-reversed", piece, ["syn-invest"]), ["syn-invest"]);
    const c = r.results[0].categories;
    assert.ok(c.probe && c.keys, JSON.stringify(c));
  });

  await tt.test("a page error fails errors", async () => {
    const piece = `${SPDX}(function () {
  console.error("injected console error");
})();
`;
    const r = await run(mutantPages(t, "console-error", piece, ["syn-sheet"]), ["syn-sheet"]);
    assert.deepEqual(r.results[0].categories, { errors: 2 }, "the new writer of (a) and the new reader of (b)");
  });

  await tt.test("a phase that cannot run is a page problem, and the run goes on", async () => {
    const pairs = s.pairs(path.join(t.root, "dist"));
    pairs[0] = { ...pairs[0], files: [] };
    const r = await sc.runSite(browser, { pairs, seeds: s.seeds, owners: s.owners, tmp: fs.mkdtempSync(path.join(t.tmp, "site-")) });
    assert.deepEqual(r.results[0].categories, { page: 2 });
    assert.equal(r.results[0].ok, false);
    assert.equal(r.results[1].ok, true, "the next provider still runs");
    assert.deepEqual(r.final.problems, []);
  });

  await tt.test("frozen.js that does not describe the old page fails frozen (and c)", async () => {
    // Both pages use the real config key; this frozen.js names another one, and the seeds and
    // owners of the run follow it, so the real key belongs to no one.
    const pairs = s.pairs(path.join(t.root, "dist"), ["syn-invest"]);
    const f = pairs[0].frozen;
    const wrong = { ...f, storage: { ...f.storage, configKey: `${f.storage.configKey}-elsewhere` } };
    pairs[0] = { ...pairs[0], frozen: wrong };
    const frozens = ["syn-csv", "syn-pdf", "syn-sheet"].map((id) => ({ id, frozen: frozenOf(t, id) })).concat([{ id: "syn-invest", frozen: wrong }]);
    const { seeds, owners: o } = sc.seedsFor(frozens);
    const r = await sc.runSite(browser, { pairs, seeds, owners: o, tmp: fs.mkdtempSync(path.join(t.tmp, "site-")) });
    const c = r.results[0].categories;
    assert.ok(c.frozen && c["c.key"] && c["c.read"], JSON.stringify(c));
    assert.ok(!c.cross, JSON.stringify(c));
  });
});
