// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Storage compatibility on one origin (docs/TESTING.md, storage compatibility; migration step
// M11, gate G10). The deployed site serves the old pages and the new pages from one origin, so
// they share one localStorage, and settings saved by either must work in the other. Here the
// old pages (read only, <old-root>/<legacyRepo>/index.html) and the new pages
// (dist/<id>/index.html) are served by test/lib/serve.js on http://127.0.0.1:<ephemeral port>:
//   /old/<legacyRepo>/ and /old/<legacyRepo>/index.html  -> <old-root>/<legacyRepo>/index.html
//   /new/<id>/ and /new/<id>/index.html                  -> dist/<id>/index.html (or --page <dir>)
//   /storage-compat/observer.html                         a blank page without script (below)
// and nothing else. One browser context (E0, the frozen clock) holds the whole run, like one
// user's browser on that origin. Its storage starts with every frozen provider's keys and one
// key of an unrelated page on the origin. Then, for each provider with frozen.legacyRepo, in
// turn (each phase starts with the provider's own keys removed, the rest as left before):
//   (a) new writes, old reads: on the new page the statements are loaded, the configurator is
//       driven through the UI (rename, kind, merge and exclude: the golden harness's C-ui-combo
//       operations) and the last mode is picked; then the old page is opened in the same
//       context and loads the same statements. At the full range both pages must show the same
//       UI (W3 maps a legacy configurator's ids), so the same configurator state and the same
//       mode, give the same downloads (zip entries included), and the old page must have read
//       exactly the strings the new page left, changing nothing;
//   (b) the reverse: the old page writes, the new page reads;
//   (c) allowed writes only: every storage call of a new page is a localStorage call on one of
//       the provider's frozen keys, never a removal or a clear; every mode written is in
//       frozen.modeValues; every config written is a JSON object of detected ids, each with
//       only name (a trimmed, non-empty string), kind (in frozen.configKinds, "" excepted),
//       mergeInto (another detected id) and exclude: true; no key changes without a call;
//   keys: the old and the new page made the same storage calls with the same strings: the two
//       writers (same steps), and the two readers;
//   one origin: no page reads or changes another provider's key or the unrelated key, and at
//       the end every key holds what its owner left.
// A setting that no download or configurator state shows would make the comparison blind, so
// the settings must change the writer's configurator and downloads (or, without a
// configurator, the mode must change the downloads). With both pages open, the last writer
// wins, exactly as with two old tabs (design D9): documented, not tested and not changed.
//
// How storage is observed: an init script of the run's context (storageHooks) wraps
// Storage.prototype.getItem, setItem, removeItem and clear in every document, so each page's
// storage calls are logged in order, reads with the value returned; after every step of a page
// (open, load, a configurator operation, the mode, the range, the downloads) the harness drains
// that log and reads the whole of localStorage in the same page with the original methods. A
// change that no logged call explains (a write through a property) still shows in that read.
// After a page closes, the observer page (a blank page served on the origin, which runs no
// script) must see what the page last showed; a page that wrote as it closed would fail there.
// The observer also seeds the storage and resets it between phases.
//
//   node test/storage-compat/run.js [--providers a,b] [--old-root <dir>] [--statements <id>=<dir>]
//                                   [--page dist|<dir>] [--no-live] [--verbose]
//   node test/storage-compat/run.js --self-test [--mutants a,b] [--providers a,b] [...]
//
// --self-test checks the run itself: each mutant of MUTANTS is a new page with one test-only
// piece injected (build --inject, never in dist/) that renames the config key, renames the
// mode key, or clears the storage as the page starts. Each mutant runs on a site of its own
// against the real old pages and must fail in exactly its expected way (the categories it must
// show and those it must not), like the golden canaries.
//
// Every invocation checks the old repositories before and after the run (git plumbing, file
// manifest and, unless --no-live, the live page), and a run on dist/ first checks that dist/ is
// current. The console shows provider ids, counts, problem categories, step names, storage key
// names, mode ids and a digest of the results (resultsDigest: the run is deterministic, so two
// runs on the same statements give the same one), never a statement name, an account or a
// stored value; the report (<private-dir>/reports/<run>.json) holds the details. The browser's
// profile and temporary files live in <private-dir>/tmp/<run>, removed at the end. Exit status:
// 0 pass, 1 anything else. Nothing here names a provider: every fact comes from frozen.js.
//
//   runSite(browser, {pairs, seeds, owners, tmp, log}) -> Promise<{origin, results, final}>: the
//     run on one origin for `pairs` [{id, legacyRepo, frozen, legacyDom, oldFile, newFile,
//     dir | files}], starting from `seeds` with `owners` (seedsFor); log(result) after each
//     provider. test/unit/storage-compat.test.js runs it on synthetic pages. storageHooks is the
//     in-page init script; the other exports are the pure helpers of the checks.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const lib = (m) => require(path.join(REPO, "test", "lib", m));
const priv = lib("private.js");
const baseline = lib("baseline.js");
const browserLib = lib("browser.js");
const driverLib = lib("page-driver.js");
const serve = lib("serve.js");
const canon = lib("canon.js");
const { isPdfWorkerFallback } = lib("capture.js");
const compare = require("../golden/compare.js");
const { HOSTILE_NAME } = require("../golden/scenarios.js");

const OBSERVER_PATH = "/storage-compat/observer.html";
const OBSERVER_HTML = "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<title>observer</title>\n</head>\n<body></body>\n</html>\n";
// A setting of another page on the same origin, which no page of this repository may touch.
const UNRELATED = Object.freeze({ key: "storage-compat-unrelated", value: "{\"kept\":true}", owner: "an unrelated page" });
const SETTLE_MS = 1000;
const POLL_MS = 25;
const CONFIG_FIELDS = Object.freeze(["name", "kind", "mergeInto", "exclude"]);
const PHASES = Object.freeze({ a: Object.freeze({ writer: "new", reader: "old" }), b: Object.freeze({ writer: "old", reader: "new" }) });

// The self-test's mutants: a test-only piece injected into the new page (plan piece 12b), what
// it applies to, and the problem categories its run must show (require; requireWithRows when
// the configurator had rows to drive) and must not show (forbid).
const MUTANTS = Object.freeze({
  "rename-config-key": Object.freeze({
    piece: "test/storage-compat/inject/rename-config-key.js",
    applies: (frozen) => frozen.storage.configKey !== null && frozen.storage.configKey !== undefined,
    require: Object.freeze(["c.key", "c.read", "keys", "b.read"]),
    requireWithRows: Object.freeze(["a.config", "b.config"]),
    forbid: Object.freeze(["a.mode", "b.mode", "a.read", "a.storage", "b.storage", "cross", "errors", "page", "probe", "vacuous", "frozen", "c.mode", "c.config", "c.remove", "c.area", "c.unlogged"]),
  }),
  "rename-mode-key": Object.freeze({
    piece: "test/storage-compat/inject/rename-mode-key.js",
    applies: () => true,
    require: Object.freeze(["c.key", "c.read", "keys", "a.mode", "b.mode", "b.read"]),
    requireWithRows: Object.freeze([]),
    forbid: Object.freeze(["a.config", "b.config", "a.read", "cross", "errors", "page", "probe", "vacuous", "frozen", "c.mode", "c.config", "c.remove", "c.area", "c.unlogged"]),
  }),
  "clear-storage": Object.freeze({
    piece: "test/storage-compat/inject/clear-storage.js",
    applies: () => true,
    require: Object.freeze(["cross", "c.remove", "keys", "b.mode", "b.read", "b.storage"]),
    requireWithRows: Object.freeze(["b.config"]),
    forbid: Object.freeze(["a.ui", "a.mode", "a.config", "a.downloads", "a.read", "a.storage", "errors", "page", "probe", "vacuous", "frozen", "c.key", "c.read", "c.mode", "c.config", "c.area", "c.unlogged"]),
  }),
});

const USAGE = "usage: node test/storage-compat/run.js [--self-test [--mutants a,b]] [--providers a,b] [--old-root <dir>]\n"
  + "                                       [--statements <id>=<dir>] [--page dist|<dir>] [--no-live] [--verbose]";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const describe = (e) => (e && typeof e === "object" && "message" in e ? `${e.name || "Error"}: ${e.message}` : String(e));
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------- arguments

class UsageError extends Error {}

function parseArgs(argv) {
  const o = { selfTest: false, mutants: null, providers: null, oldRoot: null, statements: [], page: "dist", live: true, verbose: false };
  const value = (i, flag) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new UsageError(`${flag} needs a value`);
    return argv[i + 1];
  };
  const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--self-test") o.selfTest = true;
    else if (a === "--mutants") o.mutants = list(value(i++, a));
    else if (a === "--providers") o.providers = list(value(i++, a));
    else if (a === "--old-root") o.oldRoot = value(i++, a);
    else if (a === "--statements") o.statements.push(value(i++, a));
    else if (a === "--page") o.page = value(i++, a);
    else if (a === "--no-live") o.live = false;
    else if (a === "--verbose") o.verbose = true;
    else throw new UsageError(`unknown argument ${JSON.stringify(a)}`);
  }
  if (o.mutants && !o.selfTest) throw new UsageError("--mutants goes with --self-test");
  if (o.mutants) for (const m of o.mutants) if (!has(MUTANTS, m)) throw new UsageError(`unknown mutant ${JSON.stringify(m)} (mutants: ${Object.keys(MUTANTS).join(", ")})`);
  if (o.selfTest && o.page !== "dist") throw new UsageError("--self-test builds its own pages: --page does not apply");
  if (o.providers && !o.providers.length) throw new UsageError("--providers needs at least one id");
  return o;
}

// ---------------------------------------------------------------- in-page storage hooks

// Runs in every document of the run's context before any page script (an init script). Every
// call of Storage.prototype.getItem, setItem, removeItem and clear is logged in order as {op:
// "get" | "set" | "remove" | "clear", area: "local" | "session" | "other", key, value} (get: the
// value returned; set: the value written; a call that throws is marked threw). The page gets
// window.__s2cStorage: drain() returns the log so far and empties it; dump() returns every
// localStorage key and value, read with the original methods (not logged); apply(changes) sets
// ([key, value]) or removes ([key, null]) keys with the original methods (the observer's resets).
function storageHooks() {
  if (window.__s2cStorage) return;
  const proto = Storage.prototype;
  const orig = { getItem: proto.getItem, setItem: proto.setItem, removeItem: proto.removeItem, clear: proto.clear, key: proto.key };
  const lengthOf = Object.getOwnPropertyDescriptor(proto, "length").get;
  const calls = [];
  const local = () => {
    try {
      return window.localStorage;
    } catch (e) {
      return null; // an opaque origin has no storage
    }
  };
  const areaOf = (s) => {
    try {
      if (s === window.localStorage) return "local";
      if (s === window.sessionStorage) return "session";
    } catch (e) {
      // no storage here
    }
    return "other";
  };
  const define = (name, value) => Object.defineProperty(proto, name, { configurable: true, enumerable: true, writable: true, value });
  const logged = (entry, run) => {
    calls.push(entry);
    try {
      return run();
    } catch (e) {
      entry.threw = true;
      throw e;
    }
  };
  define("getItem", function getItem(key) {
    const value = orig.getItem.apply(this, arguments);
    calls.push({ op: "get", area: areaOf(this), key: String(key), value });
    return value;
  });
  define("setItem", function setItem(key, value) {
    return logged({ op: "set", area: areaOf(this), key: String(key), value: String(value) }, () => orig.setItem.apply(this, arguments));
  });
  define("removeItem", function removeItem(key) {
    return logged({ op: "remove", area: areaOf(this), key: String(key), value: null }, () => orig.removeItem.apply(this, arguments));
  });
  define("clear", function clear() {
    return logged({ op: "clear", area: areaOf(this), key: null, value: null }, () => orig.clear.apply(this, arguments));
  });
  const dump = () => {
    const s = local();
    if (!s) return null;
    const out = {};
    const n = lengthOf.call(s);
    for (let i = 0; i < n; i++) {
      const k = orig.key.call(s, i);
      out[k] = orig.getItem.call(s, k);
    }
    return out;
  };
  const apply = (changes) => {
    const s = local();
    for (const [k, v] of changes) {
      if (v === null) orig.removeItem.call(s, k);
      else orig.setItem.call(s, k, v);
    }
  };
  Object.defineProperty(window, "__s2cStorage", {
    value: Object.freeze({ drain: () => calls.splice(0, calls.length), dump, apply }),
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

// ---------------------------------------------------------------- pure helpers

// The provider's own keys: its frozen mode key and, with a configurator, its config key.
function ownKeys(frozen) {
  return [frozen.storage.modeKey, frozen.storage.configKey].filter((k) => k !== null && k !== undefined);
}

// The mode a writer picks: the last of frozen.modeValues (the first is the default).
const targetMode = (frozen) => frozen.modeValues[frozen.modeValues.length - 1];

// The object with its keys in code-point order (localStorage lists keys in no fixed order).
function sortedObject(o) {
  const out = {};
  for (const k of Object.keys(o || {}).sort(byCodePoint)) out[k] = o[k];
  return out;
}

function without(o, keys) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) if (!keys.includes(k)) out[k] = v;
  return out;
}

// diffStorage(before, after) -> [{key, before, after}]: every key whose value differs (null:
// absent), in code-point order.
function diffStorage(before, after) {
  const a = before || {};
  const b = after || {};
  const out = [];
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(byCodePoint)) {
    const x = has(a, k) ? a[k] : null;
    const y = has(b, k) ? b[k] : null;
    if (x !== y) out.push({ key: k, before: x, after: y });
  }
  return out;
}

// The seeded storage of a run: every frozen provider's keys (a non-default mode where there is
// one, an empty config) and the unrelated page's key. owners maps each key to its owner.
function seedsFor(frozens) {
  const seeds = { [UNRELATED.key]: UNRELATED.value };
  const owners = new Map([[UNRELATED.key, UNRELATED.owner]]);
  for (const { id, frozen } of frozens) {
    if (!frozen || !frozen.storage) continue;
    const { modeKey, configKey } = frozen.storage;
    if (typeof modeKey === "string") {
      seeds[modeKey] = frozen.modeValues[Math.min(1, frozen.modeValues.length - 1)];
      owners.set(modeKey, id);
    }
    if (typeof configKey === "string") {
      seeds[configKey] = "{}";
      owners.set(configKey, id);
    }
  }
  return { seeds: sortedObject(seeds), owners };
}

// configProblems(text, {kinds, ids}) -> string[]: what (c) refuses in a stored config. kinds: the
// kinds the configurator may write (frozen.configKinds without ""); ids: the detected ids.
function configProblems(text, { kinds = ["investment", "cash"], ids = null } = {}) {
  let cfg;
  try {
    cfg = JSON.parse(text);
  } catch (e) {
    return ["the config is not JSON"];
  }
  if (!isPlainObject(cfg)) return ["the config is not a JSON object"];
  const out = [];
  for (const [id, c] of Object.entries(cfg)) {
    if (ids && !ids.includes(id)) out.push("an entry for an id the page did not detect");
    if (!isPlainObject(c)) {
      out.push("an entry that is not an object");
      continue;
    }
    const fields = Object.keys(c);
    if (!fields.length) out.push("an empty entry");
    for (const f of fields) if (!CONFIG_FIELDS.includes(f)) out.push(`an entry with a field other than ${CONFIG_FIELDS.join(", ")}`);
    if (has(c, "name") && !(typeof c.name === "string" && c.name !== "" && c.name === c.name.trim())) out.push("a name that is not a trimmed, non-empty string");
    if (has(c, "kind") && !kinds.includes(c.kind)) out.push(`a kind other than ${kinds.join(" or ")}`);
    if (has(c, "mergeInto") && !(typeof c.mergeInto === "string" && c.mergeInto !== "" && c.mergeInto !== id && (!ids || ids.includes(c.mergeInto)))) {
      out.push("a mergeInto that is not another detected id");
    }
    if (has(c, "exclude") && c.exclude !== true) out.push("an exclude that is not true");
  }
  return out;
}

// callProblems(trace, frozen, {kind, owners, ids}) -> [{category, message, detail}] for the
// logged storage calls of one page (trace: [{action, entries}]). A new page is held to (c) and to
// the one-origin rule; an old page to what frozen.js says of it (category "frozen": frozen.js does
// not describe the old page) and to the one-origin rule. Messages hold key names and step names,
// never a stored value (values go to detail).
function callProblems(trace, frozen, { kind, owners = new Map(), ids = null }) {
  const own = ownKeys(frozen);
  const kinds = (frozen.configKinds || []).filter(Boolean);
  const out = [];
  const add = (category, message, detail) => out.push({ category, message, ...(detail === undefined ? {} : { detail }) });
  for (const step of trace) {
    for (const e of step.entries) {
      const where = `the ${kind} page (${step.action})`;
      const mine = e.key !== null && own.includes(e.key);
      const owner = e.key !== null && owners.has(e.key) && !mine ? owners.get(e.key) : null;
      if (e.area !== "local") {
        add(kind === "new" ? "c.area" : "frozen", `${where} used ${e.area === "session" ? "sessionStorage" : "a storage other than localStorage"}`, e);
        continue;
      }
      if (e.op === "clear") {
        if (kind === "new") add("c.remove", `${where} cleared the storage`, e);
        else add("frozen", `${where} cleared the storage`, e);
        add("cross", `${where} cleared the storage, every other key on the origin with it`, e);
        continue;
      }
      if (!mine) {
        const verb = e.op === "get" ? "read" : e.op === "set" ? "wrote" : "removed";
        if (owner !== null) add("cross", `${where} ${verb} ${e.key}, a key of ${owner}`, e);
        else if (kind === "new") add(e.op === "get" ? "c.read" : "c.key", `${where} ${verb} ${e.key}, which is not a frozen key of the provider`, e);
        else add("frozen", `${where} ${verb} ${e.key}, which frozen.js does not list`, e);
        continue;
      }
      if (e.op === "remove") {
        add(kind === "new" ? "c.remove" : "frozen", `${where} removed ${e.key}`, e);
        continue;
      }
      if (e.op !== "set") continue;
      if (e.key === frozen.storage.modeKey && !frozen.modeValues.includes(e.value)) {
        add(kind === "new" ? "c.mode" : "frozen", `${where} wrote a mode value outside frozen.modeValues to ${e.key}`, e);
      }
      if (kind === "new" && e.key === frozen.storage.configKey) {
        for (const m of configProblems(e.value, { kinds, ids })) add("c.config", `${where} wrote a config with ${m}`, e);
      }
    }
  }
  return out;
}

// diffProblems(steps, frozen, {kind, owners}) -> [{category, message, detail}] for the storage
// changes seen after each step of one page and as it closed (steps: [{action, entries, diff}]).
// A change that a logged call of the same step explains was judged by callProblems; any other
// change is a problem: of another owner's key (cross), of an own key (a new page: c.unlogged), or
// of another key (a new page: c.key); an old page's changes are measured against frozen.js.
function diffProblems(steps, frozen, { kind, owners = new Map() }) {
  const own = ownKeys(frozen);
  const out = [];
  const add = (category, message, detail) => out.push({ category, message, detail });
  for (const s of steps) {
    const cleared = s.entries.some((e) => e.op === "clear" && e.area === "local");
    for (const c of s.diff) {
      const explained = cleared || s.entries.some((e) => e.area === "local" && (e.op === "set" || e.op === "remove") && e.key === c.key);
      if (explained) continue;
      const where = `the ${kind} page (${s.action})`;
      if (!own.includes(c.key) && owners.has(c.key)) add("cross", `${c.key}, a key of ${owners.get(c.key)}, changed at ${where} without a storage call the log saw`, c);
      else if (own.includes(c.key)) add(kind === "new" ? "c.unlogged" : "frozen", `${c.key} changed at ${where} without a storage call the log saw`, c);
      else add(kind === "new" ? "c.key" : "frozen", `${c.key}, which is not a frozen key of the provider, changed at ${where}`, c);
    }
  }
  return out;
}

// traceMismatches(oldTrace, newTrace) -> [{field, step?, expected, actual}]: the two pages must
// have taken the same steps and made the same storage calls with the same strings in each.
function traceMismatches(oldTrace, newTrace) {
  const a = oldTrace || [];
  const b = newTrace || [];
  const out = [];
  const actions = (t) => t.map((s) => s.action);
  if (canon(actions(a)) !== canon(actions(b))) out.push({ field: "steps", expected: actions(a), actual: actions(b) });
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (canon(a[i].entries) !== canon(b[i].entries)) out.push({ field: "calls", step: a[i].action, expected: a[i].entries, actual: b[i].entries });
  }
  return out;
}

// pickOps(portfolios) -> configurator operations by row index: the golden harness's C-ui-combo
// (rename p0 to the hostile name; the first non-investment row to investment and the first
// investment row to cash; with two rows or more, a row of p0's currency, else p1, merged into
// p0; then the last row excluded).
function pickOps(ps) {
  const n = ps.length;
  if (!n) return [];
  const ops = [{ rename: { index: 0, name: HOSTILE_NAME } }];
  const nonInv = ps.findIndex((p) => p.autoKind !== "Investment");
  const inv = ps.findIndex((p) => p.autoKind === "Investment");
  if (nonInv >= 0) ops.push({ kind: { index: nonInv, value: "investment" } });
  if (inv >= 0) ops.push({ kind: { index: inv, value: "cash" } });
  if (n >= 2) {
    const ccy = ps[0].currency;
    const same = ccy === null ? -1 : ps.findIndex((p, k) => k > 0 && p.currency === ccy);
    ops.push({ merge: { from: same > 0 ? same : 1, into: 0 } });
    ops.push({ exclude: { index: n - 1 } });
  }
  return ops;
}

const opLabel = (op, i) => `config ${i + 1} (${Object.keys(op)[0]})`;
const onMode = (snap) => ((snap && snap.modes) || []).filter((m) => m.on).map((m) => m.mode).join(",") || null;

// The UI mismatches of one phase, sorted into its categories: the configurator (config,
// configCount), the mode (the mode buttons) and the rest of the UI.
function uiCategory(field, label) {
  if (field === "ui.config" || field === "ui.configCount") return `${label}.config`;
  if (field === "ui.modes") return `${label}.mode`;
  return `${label}.ui`;
}

// categoriesOf(problems) -> {category: count}
function categoriesOf(problems) {
  const out = {};
  for (const p of problems) out[p.category] = (out[p.category] || 0) + 1;
  return sortedObject(out);
}

// checkMutant(name, result) -> {ok, problems}: a mutant's provider result must fail with every
// required category and none of the forbidden ones.
function checkMutant(name, r) {
  const spec = MUTANTS[name];
  if (!spec) return { ok: false, problems: [`unknown mutant ${JSON.stringify(name)}`] };
  const cats = r.categories || {};
  const problems = [];
  if (r.ok) problems.push("the run passed: the mutant was not detected");
  const required = [...spec.require, ...(r.settings > 0 ? spec.requireWithRows : [])];
  for (const c of required) if (!cats[c]) problems.push(`no ${c} problem`);
  for (const c of spec.forbid) if (cats[c]) problems.push(`unexpected ${c} problems (${cats[c]})`);
  return { ok: problems.length === 0, problems };
}

// The serve allowlist of a run: each pair's old and new page under its two paths, and the
// observer page.
function allowlist(pairs, observerFile) {
  const out = { [OBSERVER_PATH]: observerFile };
  for (const p of pairs) {
    for (const u of [oldPath(p), `${oldPath(p)}index.html`]) out[u] = p.oldFile;
    for (const u of [newPath(p), `${newPath(p)}index.html`]) out[u] = p.newFile;
  }
  return out;
}
const oldPath = (p) => `/old/${p.legacyRepo}/`;
const newPath = (p) => `/new/${p.id}/`;

// ---------------------------------------------------------------- the run on one origin

// The observer's view of the storage, once it equals `want` or SETTLE_MS have passed: another
// document's last changes reach it through the browser, a moment later.
async function settledDump(observer, want) {
  const target = canon(sortedObject(want));
  const deadline = Date.now() + SETTLE_MS;
  for (;;) {
    const now = sortedObject(await observer.evaluate(() => window.__s2cStorage.dump()));
    if (canon(now) === target || Date.now() >= deadline) return now;
    await sleep(POLL_MS);
  }
}

// Sets the storage to exactly `want` through the observer; returns how many keys it changed.
async function resetTo(env, want) {
  const now = await settledDump(env.observer, env.last);
  const changes = diffStorage(now, want).map((c) => [c.key, c.after]);
  if (changes.length) await env.observer.evaluate((list) => window.__s2cStorage.apply(list), changes);
  const got = await settledDump(env.observer, want);
  if (diffStorage(got, want).length) throw new Error("the observer page could not set the storage");
  env.last = got;
  return changes.length;
}

async function fullRange(d) {
  const months = await d.page.evaluate(() => {
    const s = document.getElementById("from");
    return s ? [...s.options].map((o) => o.value) : [];
  });
  if (months.length) await d.setRange(months[0], months[months.length - 1]);
  return months.length;
}

// The statement files of a pair: pair.files, or the files of pair.dir that the page's picker
// accepts, in JS string order (each checked as a safe input); a single-file picker takes the
// first.
function statementFiles(pair, picker) {
  let files;
  if (pair.files) files = pair.files.filter((f) => driverLib.acceptsFile(picker.accept, f));
  else {
    files = [];
    for (const name of fs.readdirSync(pair.dir)) {
      const p = path.join(pair.dir, name);
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (!st.isFile() || !driverLib.acceptsFile(picker.accept, p)) continue;
      priv.assertSafeInput(p, { allowed: [pair.dir] });
      files.push(p);
    }
    files.sort();
  }
  if (!files.length) throw new Error(`${pair.id}: no statement file is accepted by the page`);
  return picker.multiple ? files : [files[0]];
}

// Opens one page (old or new) of a pair in the run's context. Each step (open included) drains
// the page's call log and reads the storage in the page; the step's diff is measured from what
// the run saw last. close() keeps the page's errors and measures what the observer then sees.
async function openPage(env, pair, kind) {
  const url = `${env.origin}${kind === "old" ? oldPath(pair) : newPath(pair)}`;
  const d = await driverLib.open(env.context, url, { legacyDom: kind === "old" ? pair.legacyDom || null : null });
  const p = { kind, d, trace: [], steps: [], errors: null, picker: null };
  p.step = async (action, fn) => {
    const value = fn ? await fn() : undefined;
    const entries = await d.page.evaluate(() => window.__s2cStorage.drain());
    const now = sortedObject(await d.page.evaluate(() => window.__s2cStorage.dump()));
    p.trace.push({ action, entries });
    p.steps.push({ action, entries, diff: diffStorage(env.last, now) });
    env.last = now;
    return value;
  };
  p.close = async () => {
    p.errors = await d.errors().catch(() => null);
    await d.close().catch(() => {});
    const after = await settledDump(env.observer, env.last);
    p.steps.push({ action: "close", entries: [], diff: diffStorage(env.last, after) });
    env.last = after;
  };
  try {
    await p.step("open");
    p.picker = await d.page.evaluate(() => {
      const el = document.getElementById("picker");
      return el ? { accept: el.getAttribute("accept") || "", multiple: !!el.multiple } : null;
    });
    if (!p.picker) throw new Error(`the ${kind} page has no #picker`);
  } catch (e) {
    await d.close().catch(() => {});
    throw e;
  }
  return p;
}

// One phase: the writer loads the statements, applies the settings and picks the mode; then the
// reader opens in the same context and loads the same statements.
async function runPhase(env, pair, label) {
  const { writer, reader } = PHASES[label];
  const keys = ownKeys(pair.frozen);
  const target = targetMode(pair.frozen);
  const ph = { label, writer, reader, target, files: 0, resetKeys: 0, probe: null, ops: [], before: null, after: null, read: null, written: null, pages: {}, busy: [] };
  ph.resetKeys = await resetTo(env, without(env.known, keys));
  const w = await openPage(env, pair, writer);
  ph.pages.writer = w;
  let files;
  try {
    files = statementFiles(pair, w.picker);
    ph.files = files.length;
    const load = await w.step("load", () => w.d.load(files));
    if (load.busy !== "idle") ph.busy.push(`the ${writer} page did not settle after the load`);
    ph.probe = await w.d.probe();
    ph.before = { snapshot: await w.d.snapshot(), records: await w.step("downloads", () => w.d.clickAll()) };
    ph.ops = pair.frozen.storage.configKey === null || pair.frozen.storage.configKey === undefined ? [] : pickOps(ph.probe.portfolios);
    for (const [i, op] of ph.ops.entries()) await w.step(opLabel(op, i), () => w.d.config(op));
    await w.step("mode", () => w.d.setMode(target));
    await w.step("range", () => fullRange(w.d));
    ph.after = { snapshot: await w.d.snapshot(), records: await w.step("downloads", () => w.d.clickAll()) };
    ph.written = {};
    for (const k of keys) ph.written[k] = has(env.last, k) ? env.last[k] : null;
  } finally {
    await w.close();
  }
  const r = await openPage(env, pair, reader);
  ph.pages.reader = r;
  try {
    if (canon(r.picker) !== canon(w.picker)) ph.busy.push(`the ${reader} page's picker differs from the ${writer} page's`);
    const load = await r.step("load", () => r.d.load(files));
    if (load.busy !== "idle") ph.busy.push(`the ${reader} page did not settle after the load`);
    await r.step("range", () => fullRange(r.d));
    ph.read = { snapshot: await r.d.snapshot(), records: await r.step("downloads", () => r.d.clickAll()) };
  } finally {
    await r.close();
  }
  return ph;
}

// The checks of one phase, (a) or (b): the reader against the writer.
function phaseProblems(pair, ph) {
  const out = [];
  const L = ph.label;
  const add = (category, message, detail) => out.push({ category, message, ...(detail === undefined ? {} : { detail }) });
  for (const m of ph.busy) add("page", m);
  const oldState = ph.writer === "old" ? ph.after : ph.read;
  const newState = ph.writer === "new" ? ph.after : ph.read;
  // the same UI (W3 maps the old page's legacy configurator markup), so the same configurator
  const ui = compare.compareUi(oldState.snapshot, newState.snapshot, { legacyDom: pair.legacyDom || null });
  for (const m of ui.mismatches) add(uiCategory(m.field, L), `(${L}) the old and new pages differ in ${m.field}`, m);
  // the same mode, the one the writer picked
  const om = onMode(oldState.snapshot);
  const nm = onMode(newState.snapshot);
  if (om !== ph.target || nm !== ph.target) add(`${L}.mode`, `(${L}) the mode shown is ${om} on the old page and ${nm} on the new page; ${ph.target} was picked`);
  // the same downloads
  const dl = compare.compareRecords(oldState.records, newState.records);
  for (const m of dl) add(`${L}.downloads`, `(${L}) download ${m.index} (${m.trigger}) differs in ${m.field}`, m);
  // the reader read exactly the strings the writer left, and changed nothing
  const r = ph.pages.reader;
  for (const k of ownKeys(pair.frozen)) {
    const read = r.trace.flatMap((s) => s.entries).find((e) => e.op === "get" && e.key === k);
    if (!read) add(`${L}.read`, `(${L}) the ${ph.reader} page never read ${k}`);
    else if (read.value !== ph.written[k]) add(`${L}.read`, `(${L}) the ${ph.reader} page read ${k} as other than the ${ph.writer} page left it`, { key: k, read: read.value, written: ph.written[k] });
  }
  for (const s of r.steps) if (s.diff.length) add(`${L}.storage`, `(${L}) the ${ph.reader} page changed ${plural(s.diff.length, "key")} at ${s.action}`, s.diff);
  // the comparison can see the settings: they change the writer's configurator and downloads
  const changed = compare.compareRecords(ph.before.records, ph.after.records).length > 0;
  if (ph.ops.length) {
    if (ph.before.snapshot.config === ph.after.snapshot.config) add("vacuous", `(${L}) the settings do not change the ${ph.writer} page's configurator`);
    if (!changed) add("vacuous", `(${L}) the settings do not change the ${ph.writer} page's downloads`);
  } else if (pair.frozen.storage.configKey === null || pair.frozen.storage.configKey === undefined) {
    if (!changed) add("vacuous", `(${L}) the mode does not change the ${ph.writer} page's downloads`);
  } else {
    add("vacuous", `(${L}) the configurator has no rows to drive`);
  }
  if (onMode(ph.before.snapshot) === ph.target) add("vacuous", `(${L}) the ${ph.writer} page already showed mode ${ph.target}`);
  if (!newState.records.some((x) => !x.disabled)) add("vacuous", `(${L}) the pages offer no download to compare`);
  return out;
}

// The checks across the two phases of a pair, and the pair's summary counts.
function pairProblems(pair, A, B, owners) {
  const out = [];
  const add = (category, message, detail) => out.push({ category, message, ...(detail === undefined ? {} : { detail }) });
  out.push(...phaseProblems(pair, A), ...phaseProblems(pair, B));
  // (c) and one origin: every call and change of the new pages; frozen.js against the old pages
  const ids = (p) => (p ? p.portfolios.map((x) => x.id) : null);
  for (const ph of [A, B]) {
    for (const role of ["writer", "reader"]) {
      const p = ph.pages[role];
      out.push(...callProblems(p.trace, pair.frozen, { kind: p.kind, owners, ids: ids(ph.probe) }));
      out.push(...diffProblems(p.steps, pair.frozen, { kind: p.kind, owners }));
      const errs = p.errors || { console: [], errors: [], violations: [] };
      const n = errs.console.length + errs.errors.filter((e) => !isPdfWorkerFallback(e)).length + errs.violations.length;
      if (n) add("errors", `(${ph.label}) the ${p.kind} page logged ${plural(n, "error")} (console errors, page errors or CSP violations)`, errs);
    }
  }
  // keys: the old and new pages made the same calls (the writers, and the readers)
  for (const [role, x, y] of [["writer", B.pages.writer, A.pages.writer], ["reader", A.pages.reader, B.pages.reader]]) {
    for (const m of traceMismatches(x.trace, y.trace)) add("keys", `the old and new ${role}s differ in their storage calls${m.step ? ` at ${m.step}` : ""} (${m.field})`, m);
  }
  // both writers saw the same rows (the operations are chosen by row index)
  if (canon(A.probe && A.probe.portfolios) !== canon(B.probe && B.probe.portfolios) || canon(A.probe && A.probe.months) !== canon(B.probe && B.probe.months)) {
    add("probe", "the old and new pages detect other configurator rows or months", { a: A.probe, b: B.probe });
  }
  return out;
}

// One provider: (a), then (b). A phase that throws is a "page" problem; the run goes on.
async function runPair(env, pair) {
  const keys = ownKeys(pair.frozen);
  const res = { id: pair.id, statements: 0, rows: 0, settings: 0, ops: [], mode: targetMode(pair.frozen), downloads: 0, calls: { reads: 0, writes: 0 }, problems: [], phases: {} };
  const phases = {};
  for (const label of ["a", "b"]) {
    try {
      phases[label] = await runPhase(env, pair, label);
    } catch (e) {
      phases[label] = null;
      res.problems.push({ category: "page", message: `(${label}) the phase did not complete`, detail: describe(e) });
    }
  }
  const A = phases.a;
  const B = phases.b;
  if (A && B) res.problems.push(...pairProblems(pair, A, B, env.owners));
  for (const ph of [A, B]) {
    if (!ph) continue;
    res.statements = Math.max(res.statements, ph.files);
    res.rows = Math.max(res.rows, ph.probe ? ph.probe.portfolios.length : 0);
    res.settings = Math.max(res.settings, ph.ops.length);
    if (ph.ops.length >= res.ops.length) res.ops = ph.ops.map((op) => Object.keys(op)[0]);
    res.downloads = Math.max(res.downloads, ph.after ? ph.after.records.filter((x) => !x.disabled).length : 0);
    for (const p of [ph.pages.writer, ph.pages.reader]) {
      if (!p || p.kind !== "new") continue;
      for (const s of p.trace) for (const e of s.entries) res.calls[e.op === "get" ? "reads" : "writes"]++;
    }
    res.phases[ph.label] = {
      writer: ph.writer, reader: ph.reader, target: ph.target, files: ph.files, resetKeys: ph.resetKeys, ops: ph.ops, written: ph.written,
      traces: { writer: ph.pages.writer ? ph.pages.writer.steps : null, reader: ph.pages.reader ? ph.pages.reader.steps : null },
      errors: { writer: ph.pages.writer ? ph.pages.writer.errors : null, reader: ph.pages.reader ? ph.pages.reader.errors : null },
    };
  }
  // what the provider leaves on the origin: the next providers must leave it alone
  for (const k of keys) {
    if (has(env.last, k)) env.known[k] = env.last[k];
    else delete env.known[k];
  }
  res.left = keys.filter((k) => has(env.known, k)).length;
  res.categories = categoriesOf(res.problems);
  res.ok = res.problems.length === 0;
  return res;
}

// runSite(browser, {pairs, seeds, owners, tmp, log}) -> {origin, results, final}. seeds: the
// storage the run starts with (seedsFor); tmp: a private folder for the observer page.
async function runSite(browser, { pairs, seeds, owners, tmp, log: say = () => {} }) {
  const observerFile = path.join(tmp, "observer.html");
  fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(observerFile, OBSERVER_HTML);
  for (const p of pairs) for (const f of [p.oldFile, p.newFile]) if (!fs.existsSync(f)) throw new Error(`${p.id}: a page to serve does not exist`);
  const server = await serve(allowlist(pairs, observerFile));
  let context = null;
  try {
    context = await browserLib.newContext(browser, browserLib.ENVS.E0, null);
    await context.addInitScript(storageHooks);
    const observer = await context.newPage();
    await observer.goto(`${server.origin}${OBSERVER_PATH}`, { waitUntil: "load" });
    const env = { context, observer, origin: server.origin, known: { ...seeds }, last: {}, owners };
    await resetTo(env, env.known);
    const results = [];
    for (const pair of pairs) {
      const r = await runPair(env, pair);
      results.push(r);
      say(r);
    }
    const now = await settledDump(observer, env.known);
    const final = { keys: Object.keys(now).length, problems: diffStorage(env.known, now).map((c) => ({ category: "cross", message: `${c.key} is not what ${owners.get(c.key) || "its provider"} left at the end of the run`, detail: c })) };
    return { origin: server.origin, results, final };
  } finally {
    if (context) await context.close().catch(() => {});
    await server.close();
  }
}

// The sha256 of a site's canonical results (every check's counts, calls, strings and records):
// the run is deterministic under the frozen clock, so two runs on the same statements and pages
// give the same digest. The console shows a digest, never what it covers.
function resultsDigest(site) {
  return crypto.createHash("sha256").update(canon({ results: site.results, final: site.final })).digest("hex");
}

// ---------------------------------------------------------------- console lines

function summaryLines(r) {
  const c = r.categories;
  const n = (prefix) => Object.entries(c).filter(([k]) => k === prefix || k.startsWith(`${prefix}.`)).reduce((s, [, v]) => s + v, 0);
  const verdict = (label) => {
    const bad = Object.entries(c).filter(([k]) => k.startsWith(`${label}.`));
    return bad.length ? `FAIL (${bad.map(([k, v]) => `${k} ${v}`).join(", ")})` : `same configurator and mode, ${plural(r.downloads, "download")} equal, the values left read back, nothing changed by the reader`;
  };
  const ops = r.ops && r.ops.length ? ` (${r.ops.join(", ")})` : "";
  const lines = [`${r.id}: ${plural(r.statements, "statement")}, ${plural(r.rows, "configurator row")}, ${plural(r.settings, "setting")}${ops}, mode ${r.mode}`];
  lines.push(`  (a) new writes, old reads: ${verdict("a")}`);
  lines.push(`  (b) old writes, new reads: ${verdict("b")}`);
  lines.push(`  (c) the new pages' ${plural(r.calls.reads, "read")} and ${plural(r.calls.writes, "write")}: ${n("c") ? `FAIL (${Object.entries(c).filter(([k]) => k.startsWith("c.")).map(([k, v]) => `${k} ${v}`).join(", ")})` : "frozen keys and allowed values only"}`);
  lines.push(`  keys: ${c.keys || c.frozen ? `FAIL (keys ${c.keys || 0}, frozen ${c.frozen || 0})` : "the old and new pages made the same storage calls with the same strings"}`);
  lines.push(`  one origin: ${c.cross ? `FAIL (cross ${c.cross})` : "no other key read or changed"}`);
  const rest = ["page", "probe", "vacuous", "errors"].filter((k) => c[k]);
  if (rest.length) lines.push(`  also: ${rest.map((k) => `${k} ${c[k]}`).join(", ")}`);
  lines.push(`  ${r.ok ? "pass" : "FAIL"}`);
  return lines;
}

// Problem messages hold fixed text, step names, key names and counts only.
function problemLines(r, max = 12) {
  const out = r.problems.slice(0, max).map((p) => `    [${p.category}] ${p.message}`);
  if (r.problems.length > max) out.push(`    … ${r.problems.length - max} more (see the report)`);
  return out;
}

// ---------------------------------------------------------------- commands

function selectProviders(ids) {
  const { frozenProviders } = lib("load-provider.js");
  const all = frozenProviders({ root: REPO }).filter((p) => p.frozen && p.frozen.legacyRepo && !path.basename(p.dir).startsWith("_"));
  if (!ids) return all;
  return ids.map((id) => {
    const p = all.find((x) => x.id === id);
    if (!p) throw new UsageError(`no provider ${JSON.stringify(id)} with frozen.legacyRepo`);
    return p;
  });
}

function allFrozen() {
  const { frozenProviders } = lib("load-provider.js");
  return frozenProviders({ root: REPO }).map((p) => ({ id: p.id, frozen: p.frozen }));
}

function pairOf(prov, { newFile, statements }) {
  const { dir } = priv.statementsFor(prov.id, { cli: statements, legacyRepo: prov.frozen.legacyRepo });
  return {
    id: prov.id,
    legacyRepo: prov.frozen.legacyRepo,
    frozen: prov.frozen,
    legacyDom: prov.frozen.legacyDom || null,
    oldFile: path.join(priv.oldRoot(), prov.frozen.legacyRepo, "index.html"),
    newFile,
    dir,
  };
}

function pageDir(page) {
  return page === "dist" ? path.join(REPO, "dist") : path.resolve(page);
}

function buildCheck() {
  try {
    execFileSync(process.execPath, [path.join(REPO, "build", "build.js"), "--check"], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    throw new Error("build --check failed: the new pages are not current (run node build/build.js)");
  }
}

async function withBaseline(provs, opts, report, fn) {
  const { problems, manifests } = await baseline.before(provs.map((p) => p.frozen), { live: opts.live, oldRoot: priv.oldRoot() });
  let entries = 0;
  for (const m of manifests.values()) entries += m.size;
  report.baseline = { repos: manifests.size, entries, live: opts.live, before: problems.length, beforeProblems: problems, after: null };
  log(`baseline before: ${plural(manifests.size, "old repository", "old repositories")}, ${entries} manifest entries, ${plural(problems.length, "problem")}${opts.live ? ", live pages checked" : " (--no-live: not a gate run)"}`);
  if (problems.length) throw new Error("baseline integrity failed before the run");
  let failure = null;
  let result;
  try {
    result = await fn();
  } catch (e) {
    failure = e;
  }
  const after = baseline.after(manifests);
  report.baseline.after = after.length;
  report.baseline.afterProblems = after;
  log(`baseline after: ${plural(after.length, "difference")}`);
  if (after.length && !failure) failure = new Error("an old repository changed during the run");
  if (failure) throw failure;
  return result;
}

async function withBrowser(report, fn) {
  const browser = await browserLib.launch();
  report.versions = browserLib.versions(browser);
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function cmdCheck(opts, report, tmp) {
  const provs = selectProviders(opts.providers);
  if (opts.page === "dist") buildCheck();
  const pairs = provs.map((p) => pairOf(p, { newFile: path.join(pageDir(opts.page), p.id, "index.html"), statements: opts.statements }));
  const { seeds, owners } = seedsFor(allFrozen());
  report.seeds = Object.keys(seeds).length;
  log(`storage-compat: ${plural(pairs.length, "provider")}, old and new pages on one origin (127.0.0.1, an ephemeral port); ${plural(Object.keys(seeds).length, "key")} on the origin before the run (every frozen provider's and an unrelated page's)`);
  let ok = false;
  let passed = 0;
  let total = pairs.length;
  await withBaseline(provs, opts, report, () => withBrowser(report, async (browser) => {
    log(`browser: playwright-core ${report.versions.playwright}, Chrome ${report.versions.chrome}`);
    const site = await runSite(browser, {
      pairs, seeds, owners, tmp: path.join(tmp, "site"),
      log: (r) => {
        for (const l of summaryLines(r)) log(l);
        if (!r.ok) for (const l of problemLines(r)) log(l);
      },
    });
    report.providers = site.results;
    report.final = site.final;
    report.digest = resultsDigest(site);
    log(`results digest: ${report.digest.slice(0, 16)} (sha256 of the canonical results; two runs on the same statements give the same one)`);
    log(`final: ${plural(site.final.keys, "key")} on the origin, ${site.final.problems.length ? `${plural(site.final.problems.length, "key")} NOT as its owner left it` : "each as its owner left it"}`);
    passed = site.results.filter((r) => r.ok).length;
    total = site.results.length;
    ok = passed === total && !site.final.problems.length;
  }));
  log(`storage-compat: ${ok ? "PASS" : "FAIL"}, ${passed} of ${plural(total, "provider")} pass (a), (b), (c), keys and one origin`);
  return ok;
}

async function cmdSelfTest(opts, report, tmp) {
  const provs = selectProviders(opts.providers);
  const names = opts.mutants || Object.keys(MUTANTS);
  const buildRun = require(path.join(REPO, "build", "build.js")).run;
  const built = {};
  for (const m of names) {
    const ids = provs.filter((p) => MUTANTS[m].applies(p.frozen)).map((p) => p.id);
    if (!ids.length) continue;
    const out = path.join(tmp, "mutants", m);
    const errs = [];
    const code = buildRun(["--only", ids.join(","), "--inject", path.join(REPO, MUTANTS[m].piece), "--out", out], { log: () => {}, err: (x) => errs.push(x) });
    if (code !== 0) throw new Error(`the build of the ${m} pages failed: ${errs.join("; ")}`);
    built[m] = { out, ids };
  }
  const { seeds, owners } = seedsFor(allFrozen());
  log(`storage-compat self-test: ${plural(names.length, "mutant")} of the new pages, each on a site of its own against the old pages`);
  let ok = true;
  report.mutants = {};
  await withBaseline(provs, opts, report, () => withBrowser(report, async (browser) => {
    log(`browser: playwright-core ${report.versions.playwright}, Chrome ${report.versions.chrome}`);
    for (const m of names) {
      const entry = { providers: [] };
      report.mutants[m] = entry;
      if (!built[m]) {
        log(`mutant ${m}: applies to none of the providers`);
        continue;
      }
      const pairs = provs.filter((p) => built[m].ids.includes(p.id)).map((p) => pairOf(p, { newFile: path.join(built[m].out, p.id, "index.html"), statements: opts.statements }));
      const site = await runSite(browser, {
        pairs, seeds, owners, tmp: path.join(tmp, "site", m),
        log: (r) => {
          const v = checkMutant(m, r);
          entry.providers.push({ ...r, verdict: v });
          if (!v.ok) ok = false;
          log(`mutant ${m}, ${r.id}: ${Object.entries(r.categories).map(([k, n]) => `${k} ${n}`).join(", ") || "no problem"} -> ${v.ok ? "fails exactly as expected" : `WRONG: ${v.problems.join("; ")}`}`);
        },
      });
      entry.final = site.final;
      const skipped = provs.filter((p) => !built[m].ids.includes(p.id)).map((p) => p.id);
      if (skipped.length) log(`mutant ${m}: not applicable to ${skipped.join(", ")}`);
    }
  }));
  log(`storage-compat self-test: ${ok ? "PASS, every mutant detected exactly as expected" : "FAIL"}`);
  return ok;
}

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(e.message);
      console.error(USAGE);
      return 1;
    }
    throw e;
  }
  if (opts.oldRoot) process.env.S2C_OLD_ROOT = path.resolve(opts.oldRoot);
  const started = new Date();
  const run = `${started.toISOString().replace(/[:.]/g, "-")}-storage-compat${opts.selfTest ? "-self-test" : ""}`;
  // The browser's profile holds the stored settings: keep it and every temporary file private.
  const tmp = priv.privateDir("tmp", run);
  fs.mkdirSync(tmp, { recursive: true, mode: 0o700 });
  for (const k of ["TMPDIR", "TMP", "TEMP"]) process.env[k] = tmp;
  const report = { run, command: opts.selfTest ? "self-test" : "check", providers: [], started: started.toISOString() };
  let code = 1;
  try {
    const ok = opts.selfTest ? await cmdSelfTest(opts, report, tmp) : await cmdCheck(opts, report, tmp);
    code = ok ? 0 : 1;
  } catch (e) {
    if (e instanceof UsageError) console.error(e.message);
    else console.error("storage-compat: FAILED (the run stopped; see the report)");
    report.error = describe(e);
    if (opts.verbose && e && e.stack) console.error(e.stack);
    code = 1;
  } finally {
    report.finished = new Date().toISOString();
    report.ok = code === 0;
    try {
      priv.writePrivate(priv.privateDir("reports", `${run}.json`), `${JSON.stringify(report, null, 2)}\n`);
      log(`report: <private-dir>/reports/${run}.json`);
    } catch (e) {
      console.error("storage-compat: the report could not be written");
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return code;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }, () => {
    console.error("storage-compat: FAILED");
    process.exitCode = 1;
  });
}

module.exports = {
  MUTANTS,
  UNRELATED,
  OBSERVER_PATH,
  parseArgs,
  storageHooks,
  ownKeys,
  targetMode,
  diffStorage,
  seedsFor,
  configProblems,
  callProblems,
  diffProblems,
  traceMismatches,
  pickOps,
  uiCategory,
  categoriesOf,
  checkMutant,
  allowlist,
  runSite,
  summaryLines,
  resultsDigest,
  main,
};
