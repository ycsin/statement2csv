// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// The golden-equivalence harness (docs/TESTING.md). It drives the old pages (read only, from
// <old-root>/<legacyRepo>/index.html) and the new pages with the same scenario list, under the
// same determinism controls, and compares every download, every stored setting and the UI.
//
//   node test/golden/run.js determinism --tier quick [--providers a,b]         G1: old pages twice
//   node test/golden/run.js capture --tier quick|full|exhaustive [--providers a,b] [--env E0,E1,E2]
//                           [--jobs N] [--keep-bytes]                          the stored goldens
//   node test/golden/run.js compare --tier T [--providers a,b] [--page dist|<dir>] [--env …]
//   node test/golden/run.js live --tier T [--providers a,b] [--page dist|<dir>]  old and new side by side
//   node test/golden/run.js canary --provider <id>                             G1b, four canaries
//   node test/golden/run.js baseline [--providers a,b] [--no-live]             baseline integrity alone
//   node test/golden/run.js extract [--providers a,b] [--tier T] [--parser old|new]  Chrome extraction cache
//   node test/golden/run.js replay --parser old|new [--tier full] [--providers a,b] [--env …] [--jobs N]
//                           [--frozen-runtime]                                 Node replay (G3b, G4)
//
// Options: --old-root <dir>; --statements <id>=<dir> (repeatable); --jobs N (parallel page
// instances, default min(4, cores/2)); --keep-bytes (keep download bytes in the private store);
// --no-security (the scenario list without the S scenarios, as before M8; --security, their
// default since M8, is still accepted); --no-live (offline debugging only, never a gate);
// --no-passthrough (debugging only); --parser old|new (extract, replay: whose parser and reading
// facts; extract defaults to old); --frozen-runtime (replay --parser new before provider.js
// exists: the provider's parser.js with the frozen runtime; an early signal, never a gate).
//
// Every invocation checks the old repos before and after the run (git plumbing, file manifest
// and, unless --no-live, the live page). Goldens, reports, diffs and every temporary file of the
// browser (its profile and downloads) live in <private-dir>; the console shows ids, counts and
// hashes only, with statement file names and folders masked. compare and replay fail an
// environment whose golden has pages with capture errors (they cannot be run), and replay fails
// one with steps it cannot model (test/lib/replay.js); both still run everything else. A
// new-page-only scenario (S-break, from M8) is never run on the old page: capture records its
// definition, and compare and live run it on the new page alone (checkNewOnly). From M9 on,
// compare and live also require W2 on a statement app's page where it applies and the old page
// threw (C-seed-badname): the error line on the throwing step and the busy line cleared from there
// on, or the page fails with "w2" mismatches; each environment reports that check (w2Check).
// Nothing here names a provider.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");

const REPO = path.resolve(__dirname, "..", "..");
const lib = (m) => require(path.join(REPO, "test", "lib", m));
const priv = lib("private.js");
const baseline = lib("baseline.js");
const browserLib = lib("browser.js");
const capture = lib("capture.js");
const driverLib = lib("page-driver.js");
const canon = lib("canon.js");
const unzip = lib("unzip.js");
const scenarios = require("./scenarios.js");
const compare = require("./compare.js");
const waivers = require("./waivers.js");

const FORMAT = "s2c-golden-1";
const COMMANDS = ["determinism", "capture", "compare", "live", "canary", "baseline", "extract", "replay"];
const PASS_GAP_MS = 150; // Chrome drops real downloads beyond about ten per second per page
const PASS_TIMEOUT_MS = 20000;
const UNSAFE_NAME = /["*:<>?\\/|\u0000-\u001f\u007f]/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const ref16 = (text) => sha256(text).slice(0, 16);
const log = (...a) => console.log(...a);
const describeError = (e) => String(e && e.message ? e.message : e).split("\n")[0];
// Console text never shows a path or a statement file name (file names can be private); reports
// keep the full text. Every statement file and folder this run meets is noted, and redact()
// masks those first, whole (a path with spaces included), then every other absolute path.
const privateNames = new Set();
function notePrivate(p, { file = true } = {}) {
  if (typeof p !== "string" || !p) return;
  privateNames.add(p);
  if (file && path.basename(p).length >= 3) privateNames.add(path.basename(p));
}
const redact = (text) => {
  let s = String(text);
  for (const n of [...privateNames].sort((a, b) => b.length - a.length)) if (s.includes(n)) s = s.split(n).join("<private>");
  return s.replace(/(?:file:\/\/)?\/[^\s'",)]+/g, "<path>").slice(0, 300);
};

// ---------------------------------------------------------------- arguments

class UsageError extends Error {}

function parseArgs(argv) {
  const o = {
    command: argv[0], tier: null, providers: null, provider: null, envs: null, jobs: null, oldRoot: null,
    statements: [], keepBytes: false, live: true, passthrough: true, page: "dist", security: true, verbose: false,
  };
  if (!COMMANDS.includes(o.command)) throw new UsageError(`unknown command ${JSON.stringify(o.command || "")}; one of ${COMMANDS.join(", ")}`);
  const value = (i, flag) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new UsageError(`${flag} needs a value`);
    return argv[i + 1];
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tier") o.tier = value(i++, a);
    else if (a === "--providers") o.providers = value(i++, a).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--provider") o.provider = value(i++, a);
    else if (a === "--env") o.envs = value(i++, a).split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--jobs") o.jobs = Number(value(i++, a));
    else if (a === "--old-root") o.oldRoot = value(i++, a);
    else if (a === "--statements") o.statements.push(value(i++, a));
    else if (a === "--page") o.page = value(i++, a);
    else if (a === "--parser") o.parser = value(i++, a);
    else if (a === "--keep-bytes") o.keepBytes = true;
    else if (a === "--no-live") o.live = false;
    else if (a === "--no-passthrough") o.passthrough = false;
    else if (a === "--security") o.security = true;
    else if (a === "--no-security") o.security = false;
    else if (a === "--verbose") o.verbose = true;
    else if (a === "--frozen-runtime") o.frozenRuntime = true;
    else throw new UsageError(`unknown argument ${JSON.stringify(a)}`);
  }
  if (o.command === "determinism") o.tier = o.tier || "quick";
  if (["capture", "compare", "live", "determinism"].includes(o.command)) {
    if (!o.tier) throw new UsageError(`${o.command} needs --tier quick|full|exhaustive`);
    if (!scenarios.TIERS.includes(o.tier)) throw new UsageError(`--tier must be one of ${scenarios.TIERS.join(", ")}`);
  }
  if (o.command === "canary" && !o.provider) throw new UsageError("canary needs --provider <id>");
  if (o.parser !== undefined && o.parser !== "old" && o.parser !== "new") throw new UsageError("--parser must be old or new");
  if (o.command === "replay" && !o.parser) throw new UsageError("replay needs --parser old|new");
  if (o.frozenRuntime && !(o.command === "replay" && o.parser === "new")) throw new UsageError("--frozen-runtime goes with replay --parser new");
  if ((o.command === "extract" || o.command === "replay") && o.tier && !scenarios.TIERS.includes(o.tier)) throw new UsageError(`--tier must be one of ${scenarios.TIERS.join(", ")}`);
  if (o.envs) for (const e of o.envs) if (!scenarios.ENV_IDS.includes(e)) throw new UsageError(`unknown environment ${e}`);
  if (o.jobs !== null && !(Number.isInteger(o.jobs) && o.jobs >= 1)) throw new UsageError("--jobs must be a positive integer");
  if (o.jobs === null) o.jobs = Math.max(1, Math.min(4, Math.floor((os.availableParallelism ? os.availableParallelism() : os.cpus().length) / 2)));
  return o;
}

// ---------------------------------------------------------------- providers and paths

// Every provider whose frozen.js has legacyRepo (the golden harness applies to exactly these),
// optionally narrowed by --providers.
function selectProviders(ids) {
  const { frozenProviders } = lib("load-provider.js");
  const all = frozenProviders({ root: REPO }).filter((p) => p.frozen && p.frozen.legacyRepo && !path.basename(p.dir).startsWith("_"));
  if (!ids) return all;
  const out = [];
  for (const id of ids) {
    const p = all.find((x) => x.id === id);
    if (!p) throw new UsageError(`no provider ${JSON.stringify(id)} with frozen.legacyRepo`);
    out.push(p);
  }
  return out;
}

// The mode values of every other provider's frozen.js (skeletons excluded), for the seeded
// mode-key scenarios.
function otherModeValues(id) {
  const { frozenProviders } = lib("load-provider.js");
  return frozenProviders({ root: REPO })
    .filter((p) => p.id !== id && !path.basename(p.dir).startsWith("_") && p.frozen && Array.isArray(p.frozen.modeValues))
    .flatMap((p) => p.frozen.modeValues);
}

const oldPagePath = (frozen) => path.join(priv.oldRoot(), frozen.legacyRepo, "index.html");
const fileUrl = (p) => pathToFileURL(p).href;

function newPagePath(id, page) {
  const dir = page === "dist" ? path.join(REPO, "dist") : path.resolve(page);
  return path.join(dir, id, "index.html");
}

const facts = (frozen, picker) => ({
  app: frozen.kindModel !== undefined ? "statement" : "custom",
  accept: picker.accept,
  multiple: picker.multiple,
  inputs: scenarios.inputsFromAccept(picker.accept),
  modeKey: frozen.storage.modeKey,
  configKey: frozen.storage.configKey,
  modeValues: frozen.modeValues.slice(),
  configKinds: frozen.configKinds ? frozen.configKinds.slice() : null,
  legacyDom: frozen.legacyDom || null,
});
const storageKeys = (f) => [f.modeKey, f.configKey].filter((k) => k !== null && k !== undefined);
// A scenario that runs on the new page alone: marked newOnly by the generator, or an S-break page
// (SX1's scenarios) of a golden captured otherwise.
const isNewOnly = (p) => !!p && (p.newOnly === true || waivers.sx1Applies(p));

// The statement files a page accepts, in JS string order, each checked as a safe input.
function listInputs(dir, accept) {
  notePrivate(dir, { file: false });
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    notePrivate(p);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (!st.isFile() || !driverLib.acceptsFile(accept, p)) continue;
    priv.assertSafeInput(p, { allowed: [dir] });
    out.push(p);
  }
  return out.sort();
}

// The statement folder of a provider (noted as private for the console).
function statementDir(prov, opts) {
  const { dir } = priv.statementsFor(prov.id, { cli: opts.statements, legacyRepo: prov.frozen.legacyRepo });
  notePrivate(dir, { file: false });
  return dir;
}

const describeFile = (p) => {
  notePrivate(p);
  const bytes = fs.readFileSync(p);
  return { path: p, name: path.basename(p), size: bytes.length, sha256: sha256(bytes) };
};
const inputsSha12 = (files) => sha256(canon(files.map((f) => [f.name, f.size, f.sha256]))).slice(0, 12);

// The synthetic files (a bogus statement, and a text file for single-file pickers), written to
// <private-dir>/inputs with fixed contents so that every run uses the same files.
function writeSynthetic(inputs) {
  const out = {};
  const meta = [];
  for (const f of scenarios.syntheticFiles(inputs)) {
    const file = priv.privateDir("inputs", f.name);
    let current = null;
    try {
      current = fs.readFileSync(file, "utf8");
    } catch {
      current = null;
    }
    if (current !== f.text) priv.writePrivate(file, f.text);
    out[f.use] = file;
    meta.push({ use: f.use, ...describeFile(file) });
  }
  return { paths: out, meta };
}

const goldenRoot = (id, frozen) => priv.privateDir("golden", id, frozen.legacyIndexSha256.slice(0, 12));
const goldenFile = (id, frozen, in12, tier, env) => path.join(goldenRoot(id, frozen), in12, tier, env, "manifest.json");
const blobDir = (id, frozen, in12) => path.join(goldenRoot(id, frozen), in12, "blobs");

// ---------------------------------------------------------------- manifests

// Content-addressed tables: UI html parts and download record lists are stored once per
// manifest and referenced by a 16-hex-digit hash.
function makeTables() {
  const parts = {};
  const lists = {};
  return {
    parts,
    lists,
    part(text) {
      if (text === null || text === undefined) return null;
      const r = ref16(text);
      if (parts[r] !== undefined && parts[r] !== text) throw new Error("manifest: hash collision in the parts table");
      parts[r] = text;
      return r;
    },
    list(records) {
      const text = canon(records);
      const r = ref16(text);
      if (lists[r] !== undefined && canon(lists[r]) !== text) throw new Error("manifest: hash collision in the lists table");
      lists[r] = records;
      return r;
    },
  };
}

const HTML_PARTS = ["status", "cards", "diagnostics", "config"];
function compactUi(ui, t) {
  const out = { ...ui };
  for (const k of HTML_PARTS) out[k] = t.part(ui[k]);
  for (const k of ["from", "to"]) out[k] = ui[k] ? { options: t.part(canon(ui[k].options)), value: ui[k].value, disabled: ui[k].disabled } : null;
  return out;
}
function expandUi(ui, m) {
  const out = { ...ui };
  for (const k of HTML_PARTS) out[k] = ui[k] === null ? null : m.parts[ui[k]];
  for (const k of ["from", "to"]) out[k] = ui[k] ? { options: canon.parse(m.parts[ui[k].options]), value: ui[k].value, disabled: ui[k].disabled } : null;
  return out;
}

// One raw step -> its manifest form (the page keeps its add orders in page.orders).
function compactStep(step, page, t) {
  const orderKey = canon(step.order);
  let oi = page.orderKeys.indexOf(orderKey);
  if (oi < 0) {
    page.orderKeys.push(orderKey);
    page.orders.push(step.order);
    oi = page.orders.length - 1;
  }
  const out = { key: step.key, act: step.act };
  if (step.busy) out.busy = step.busy;
  if (step.threw) out.threw = true;
  Object.assign(out, { mode: step.mode, range: step.range, order: oi, storage: step.storage, lsKeys: step.lsKeys, ui: compactUi(step.ui, t), downloads: t.list(step.records) });
  if (step.passthrough !== undefined) out.passthrough = step.passthrough;
  return out;
}
function expandStep(m, page, s) {
  return {
    key: s.key, act: s.act, busy: s.busy, threw: !!s.threw, mode: s.mode, range: s.range, order: page.orders[s.order] || [],
    storage: s.storage, lsKeys: s.lsKeys, ui: expandUi(s.ui, m), records: m.lists[s.downloads], passthrough: s.passthrough,
  };
}

// The golden side of a page comparison, steps expanded on demand.
function goldenPage(m, page) {
  const byKey = new Map(page.steps.map((s) => [s.key, s]));
  return {
    id: page.id, c: page.c, keys: page.steps.map((s) => s.key), errors: page.errors,
    ...(page.static !== undefined ? { static: page.static === null ? null : m.parts[page.static] } : {}),
    step: (k) => expandStep(m, page, byKey.get(k)),
  };
}

// New-page-only scenarios hold no old-page steps; they are counted apart (newOnly).
function manifestStats(m) {
  const s = { pages: 0, skipped: m.skipped.length, steps: 0, records: 0, disabled: 0, zips: 0, entries: 0, passthrough: 0, failed: 0, newOnly: 0 };
  for (const p of m.pages) {
    if (p.newOnly) {
      s.newOnly++;
      continue;
    }
    s.pages++;
    if (p.error) s.failed++;
    for (const st of p.steps) {
      s.steps++;
      for (const r of m.lists[st.downloads] || []) {
        if (r.disabled) s.disabled++;
        else s.records++;
        if (r.entries) {
          s.zips++;
          s.entries += r.entries.length;
        }
      }
      if (st.passthrough) s.passthrough += st.passthrough;
    }
  }
  return s;
}

// ---------------------------------------------------------------- the page runner

// The in-page control list of the driver's click order: card buttons, then #accounts,
// #combined and #zip when present. CONTROL_STATES gives their disabled flags; PASS_CLICK clicks
// one with the capture context set and returns how many downloads it recorded.
const CONTROLS = `(() => {
  const results = document.getElementById("results");
  if (!results || results.hidden) return [];
  const list = [];
  for (const b of document.querySelectorAll("#cards button.dl")) {
    const card = b.closest(".card");
    const h3 = card ? card.querySelector("h3") : null;
    list.push([b, { trigger: "card", account: b.getAttribute("data-account"), card: h3 ? h3.textContent : null, kind: b.getAttribute("data-kind") }]);
  }
  for (const id of ["accounts", "combined", "zip"]) {
    const el = document.getElementById(id);
    if (el) list.push([el, { trigger: id, account: null, card: null, kind: null }]);
  }
  return list;
})()`;
const CONTROL_STATES = new Function(`return ${CONTROLS}.map(([el]) => !!el.disabled);`);
const PASS_CLICK = new Function("k", `const item = ${CONTROLS}[k];
  if (!item || item[0].disabled) return 0;
  const before = window.__s2c.pending;
  window.__s2c.setContext(item[1]);
  try { item[0].click(); } finally { window.__s2c.setContext(null); }
  return window.__s2c.pending - before;`);

function makePacer(gap = PASS_GAP_MS) {
  let last = 0;
  return async () => {
    const wait = last + gap - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };
}

// The cross-check of the quick tier: the same clicks again with __s2cPassThrough set, paced, so
// that Chrome performs real downloads. Their bytes must equal the captured records, and
// suggestedFilename() must equal the raw name whenever the name has no character that Chrome
// replaces. Returns the number of downloads verified; throws on any difference.
async function passThrough(d, records, pacer) {
  const live = records.filter((r) => !r.disabled);
  if (!live.length) return 0;
  const page = d.page;
  const events = [];
  const onDownload = (dl) => events.push(dl);
  page.on("download", onDownload);
  let produced = 0;
  try {
    await page.evaluate(() => {
      window.__s2cPassThrough = true;
    });
    const states = await page.evaluate(CONTROL_STATES);
    for (let k = 0; k < states.length; k++) {
      if (states[k]) continue;
      await pacer();
      produced += await page.evaluate(PASS_CLICK, k);
    }
    const deadline = Date.now() + PASS_TIMEOUT_MS;
    while (events.length < produced && Date.now() < deadline) await sleep(20);
  } finally {
    page.off("download", onDownload);
    await page.evaluate(() => {
      window.__s2cPassThrough = false;
    }).catch(() => {});
  }
  const problems = [];
  const again = await capture.take(page);
  if (canon(again) !== canon(stripBytes(live))) problems.push("the pass-through clicks recorded other downloads than the capture");
  if (events.length !== live.length) problems.push(`${events.length} real downloads for ${live.length} records`);
  const got = [];
  for (const dl of events) {
    let hash = null;
    try {
      hash = sha256(fs.readFileSync(await dl.path()));
    } catch (e) {
      problems.push(`a real download failed: ${describeError(e)}`);
    }
    got.push({ hash, name: dl.suggestedFilename() });
    await dl.delete().catch(() => {});
  }
  const used = new Set();
  live.forEach((r, i) => {
    const j = got.findIndex((g, k) => !used.has(k) && g.hash === r.sha256);
    if (j < 0) {
      problems.push(`record ${i} (${r.trigger}): no real download has its bytes`);
      return;
    }
    used.add(j);
    if (!UNSAFE_NAME.test(r.name) && got[j].name !== r.name) problems.push(`record ${i} (${r.trigger}): suggestedFilename() differs from the raw name`);
  });
  if (problems.length) throw new Error(`pass-through cross-check failed: ${problems.join("; ")}`);
  return live.length;
}

async function perform(d, act) {
  let busy;
  for (const op of act) {
    if (op[0] === "open") continue;
    else if (op[0] === "load") busy = (await d.load(op[1], { via: op[2] })).busy;
    else if (op[0] === "clear") await d.clear();
    else if (op[0] === "config") await d.config(op[1]);
    else if (op[0] === "mode") await d.setMode(op[1]);
    else if (op[0] === "range") await d.setRange(op[1], op[2]);
    else throw new Error(`unknown step operation ${op[0]}`);
  }
  return { busy };
}

const errorCount = (d) => d.page.evaluate(() => window.__s2c.errorCount);
const pageMonths = (d) => d.page.evaluate(() => {
  const s = document.getElementById("from");
  return s ? [...s.options].map((x) => x.value) : [];
});
const lsKeysOf = (d) => d.page.evaluate(() => {
  try {
    return Object.keys(localStorage).sort();
  } catch (e) {
    return null;
  }
});

// runPage(browser, def, o) -> {id, error, errors, static?, steps: [whatever o.onStep returns]}
//   def: a scenario page; o: {url, legacyDom, keys, modes, seed, plan, passthrough, keepBytes,
//   onStep(rawStep, driver)}. Without a plan the steps come from def.actions (an old page: the
//   iteration's ranges are read from the page's own months); with a plan (a golden page's steps)
//   exactly those steps are replayed.
async function runPage(browser, def, o) {
  const env = browserLib.ENVS[def.env];
  const res = { id: def.id, error: null, errors: null, steps: [] };
  if (def.static) res.static = null;
  const context = await browserLib.newContext(browser, env, o.seed || {});
  let d = null;
  try {
    d = await driverLib.open(context, o.url, { legacyDom: o.legacyDom || null });
    const pacer = makePacer();
    if (def.static) res.static = await d.staticSnapshot();
    let errors = await errorCount(d);
    const run = async (key, act) => {
      const extra = await perform(d, act);
      const now = await errorCount(d);
      const step = { key, act };
      if (extra.busy) step.busy = extra.busy;
      if (extra.busy === "stuck" || now > errors) step.threw = true;
      errors = now;
      step.ui = await d.snapshot();
      step.mode = (step.ui.modes.find((m) => m.on) || {}).mode || null;
      step.range = { from: step.ui.from ? step.ui.from.value : null, to: step.ui.to ? step.ui.to.value : null };
      step.storage = await d.storage(o.keys);
      step.lsKeys = await lsKeysOf(d);
      step.records = await d.clickAll({ keepBytes: !!o.keepBytes });
      if (o.passthrough) step.passthrough = await passThrough(d, step.records, pacer);
      step.order = d.addOrder();
      const kept = o.onStep ? await o.onStep(step, d) : step;
      if (kept !== undefined) res.steps.push(kept);
    };
    await run("@open", [["open"]]);
    if (o.plan) {
      for (const s of o.plan) if (s.key !== "@open") await run(s.key, s.act);
    } else {
      let loads = 0;
      let configs = 0;
      let clears = 0;
      for (const a of def.actions) {
        if (a.load) await run(`@load${++loads}`, [["load", a.load.files, a.load.via]]);
        else if (a.clear) await run(++clears > 1 ? `@clear${clears}` : "@clear", [["clear"]]);
        else if (a.config) await run(a.config.reset ? "@reset" : `@config${++configs}`, [["config", a.config]]);
        else if (a.iterate) {
          const months = await pageMonths(d);
          for (const s of scenarios.iterationSteps(a.iterate, o.modes, months)) await run(s.key, s.act);
        } else throw new Error(`unknown scenario action ${Object.keys(a)[0]}`);
      }
    }
    res.errors = await d.errors();
  } catch (e) {
    res.error = describeError(e);
    if (d) res.errors = await d.errors().catch(() => null);
  } finally {
    await context.close().catch(() => {});
  }
  return res;
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return results;
}

// The storage a page ended with (for X: seeded into a fresh page).
const finalStorage = (page) => {
  const last = page.steps[page.steps.length - 1];
  const out = {};
  for (const [k, v] of Object.entries(last ? last.storage : {})) if (v !== null && v !== undefined) out[k] = v;
  return out;
};
const seedOf = (def) => (def.seed && def.seed.raw ? def.seed.raw : {});

function writeBlobs(dir, records) {
  for (const r of records) {
    if (!r.bytes) continue;
    const file = path.join(dir, r.sha256);
    if (!fs.existsSync(file)) priv.writePrivate(file, r.bytes);
  }
}
const stripBytes = (records) => records.map(({ bytes, ...r }) => r);

// ---------------------------------------------------------------- capture (old pages)

// Probe of the old page: one load with empty storage records the picker, the configurator and
// what the scenario generator needs.
async function probeOld(browser, prov, opts) {
  const { frozen } = prov;
  const url = fileUrl(oldPagePath(frozen));
  const context = await browserLib.newContext(browser, browserLib.ENVS.E0, {});
  try {
    const d = await driverLib.open(context, url, { legacyDom: frozen.legacyDom || null });
    const picker = await d.page.evaluate((list) => {
      const p = document.getElementById("picker");
      return { accept: p ? p.getAttribute("accept") || "" : "", multiple: !!(p && p.multiple), configurator: !!document.querySelector(list) };
    }, (frozen.legacyDom && frozen.legacyDom.list) || driverLib.STANDARD_DOM.list);
    const f = facts(frozen, picker);
    if (picker.configurator !== (f.configKey !== null)) throw new Error(`${prov.id}: the old page's configurator does not match frozen.storage.configKey`);
    const dir = statementDir(prov, opts);
    const files = listInputs(dir, f.accept);
    if (!files.length) throw new Error(`${prov.id}: no statement file in the statement folder is accepted by the page`);
    const load = await d.load(f.multiple ? files : [files[0]]);
    if (load.busy !== "idle") throw new Error(`${prov.id}: the probe load did not settle`);
    const probe = await d.probe();
    return { url, facts: f, dir, files, probe };
  } finally {
    await context.close().catch(() => {});
  }
}

// captureProvider(browser, prov, opts) -> {manifests: {env: manifest}, in12, failures}
async function captureProvider(browser, prov, opts) {
  const { frozen } = prov;
  const t0 = Date.now();
  const pr = await probeOld(browser, prov, opts);
  const files = pr.files.map(describeFile);
  const in12 = inputsSha12(files);
  const synthetic = writeSynthetic(pr.facts.inputs);
  const others = otherModeValues(prov.id);
  const list = scenarios.generate({
    id: prov.id, tier: opts.tier, facts: pr.facts, probe: pr.probe, files: pr.files, synthetic: synthetic.paths,
    otherModeValues: others, security: opts.security,
  });
  const envs = (opts.envs || scenarios.ENV_IDS).filter((e) => list.pages.some((p) => p.env === e));
  const versions = browserLib.versions(browser);
  const blobs = opts.keepBytes ? (opts.blobDir ? opts.blobDir : blobDir(prov.id, frozen, in12)) : null;
  const manifests = {};
  const failures = [];
  for (const env of envs) {
    const t1 = Date.now();
    const t = makeTables();
    const m = {
      format: FORMAT,
      provider: prov.id,
      tier: opts.tier,
      env: { ...browserLib.ENVS[env] },
      versions,
      page: { kind: "old", legacyRepo: frozen.legacyRepo, legacyHead: frozen.legacyHead, sha256: frozen.legacyIndexSha256 },
      inputs: { sha12: in12, files, synthetic: synthetic.meta },
      facts: pr.facts,
      probe: env === "E0" ? pr.probe : undefined,
      security: !!opts.security,
      skipped: list.skipped.filter((s) => s.id.split("/")[1] === env),
      pages: [],
      parts: t.parts,
      lists: t.lists,
    };
    const defs = scenarios.pagesFor(list, env);
    const runOne = async (def, seed) => {
      const page = { ...def, orders: [], orderKeys: [], steps: [] };
      if (seed) page.seedResolved = seed;
      const res = await runPage(browser, def, {
        url: pr.url, legacyDom: pr.facts.legacyDom, keys: storageKeys(pr.facts), modes: pr.facts.modeValues, seed: seed || seedOf(def),
        passthrough: opts.passthrough && opts.tier === "quick", keepBytes: !!blobs,
        onStep: (step) => {
          if (blobs) writeBlobs(blobs, step.records);
          return compactStep({ ...step, records: stripBytes(step.records) }, page, t);
        },
      });
      page.steps = res.steps;
      page.errors = res.errors;
      if (res.error) page.error = res.error;
      if (def.static) page.static = t.part(res.static);
      delete page.orderKeys;
      return page;
    };
    // A new-page-only scenario (S-break) is recorded with no steps and never run on the old page.
    const oldDefs = defs.filter((d) => !isNewOnly(d));
    const first = oldDefs.filter((d) => !(d.seed && d.seed.fromPage));
    const done = await pool(first, opts.jobs, (def) => runOne(def, null));
    const byId = new Map(done.map((p) => [p.id, p]));
    const second = oldDefs.filter((d) => d.seed && d.seed.fromPage);
    const dependent = await pool(second, opts.jobs, async (def) => {
      const src = byId.get(def.seed.fromPage);
      if (!src || src.error) return { ...def, orders: [], steps: [], errors: null, error: `the seed page ${def.seed.fromPage} did not complete` };
      return runOne(def, finalStorage(src));
    });
    for (const p of [...done, ...dependent]) byId.set(p.id, p);
    m.pages = defs.map((d) => (isNewOnly(d) ? { ...d, newOnly: true, orders: [], steps: [] } : byId.get(d.id)));
    for (const p of m.pages) if (p.error) failures.push(`${p.id}: ${p.error}`);
    m.ms = Date.now() - t1; // not part of the manifest identity (removed before writing)
    manifests[env] = m;
  }
  return { manifests, in12, failures, ms: Date.now() - t0, probe: pr };
}

// The manifest as stored: the tables are filled in the order parallel pages finish, so their
// keys are sorted here; everything else is already in scenario order. Two captures of the same
// page therefore give the same bytes however the pages were scheduled.
const sortedKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const manifestText = (m) => {
  const { ms, ...rest } = m;
  return JSON.stringify({ ...rest, parts: sortedKeys(m.parts || {}), lists: sortedKeys(m.lists || {}) });
};
const manifestHash = (m) => sha256(manifestText(m));

function printStats(prefix, m) {
  const s = manifestStats(m);
  log(`${prefix}: ${s.pages} pages (${s.skipped} skipped), ${s.steps} steps, ${s.records} downloads (${s.zips} zips, ${s.entries} entries), ${s.disabled} disabled`
    + `${s.passthrough ? `, ${s.passthrough} real downloads cross-checked` : ""}${s.newOnly ? `, ${s.newOnly} new-page-only (not run on the old page)` : ""}`
    + `${s.failed ? `, ${s.failed} FAILED` : ""}, ${(m.ms / 1000).toFixed(1)} s`);
  return s;
}

// ---------------------------------------------------------------- comparison against goldens

// Diff files for one mismatching step: the structured mismatches and, for downloads whose bytes
// are at hand on both sides, the first differing lines (CSV, QIF) or the entry tables and the
// first differing entry (zips). Everything goes to <private-dir>/diff/<run>/<scenario>/.
const DIFF_BUDGET = 500; // detailed diff folders per run; the report counts the rest
const diffsWritten = new Map();
function writeStepDiff(runId, mismatches, golden, cRecords, gBlobDir) {
  if (!mismatches.length) return;
  const n = diffsWritten.get(runId) || 0;
  diffsWritten.set(runId, n + 1);
  if (n >= DIFF_BUDGET) return;
  const scenario = mismatches[0].scenario;
  const dir = priv.privateDir("diff", runId, ...scenario.split("/"));
  priv.writePrivate(path.join(dir, "mismatches.json"), JSON.stringify(mismatches, null, 2));
  if (!golden || !cRecords) return;
  const indexes = [...new Set(mismatches.filter((m) => m.category === "downloads" && m.index !== undefined).map((m) => m.index))];
  for (const i of indexes) {
    const g = golden.records[i];
    const c = cRecords[i];
    if (!c || !c.bytes) continue;
    const ext = c.type === "application/zip" ? "zip" : /\.qif$/i.test(c.name) ? "qif" : "csv";
    priv.writePrivate(path.join(dir, `actual-${i}.${ext}`), c.bytes);
    const gFile = g && !g.disabled && gBlobDir ? path.join(gBlobDir, g.sha256) : null;
    const gBytes = gFile && fs.existsSync(gFile) ? fs.readFileSync(gFile) : null;
    if (!gBytes) {
      priv.writePrivate(path.join(dir, `diff-${i}.txt`), "the golden bytes were not kept (capture with --keep-bytes to compare contents)\n");
      continue;
    }
    priv.writePrivate(path.join(dir, `expected-${i}.${ext}`), gBytes);
    const lines = [`record ${i} (${c.trigger}${c.kind ? `/${c.kind}` : ""})`];
    for (const m of mismatches.filter((x) => x.category === "downloads" && x.index === i)) {
      lines.push(`  ${m.field}${m.entry === undefined ? "" : ` (entry ${m.entry})`}: ${JSON.stringify(m.expected)} -> ${JSON.stringify(m.actual)}`);
    }
    if (gBytes.equals(c.bytes)) lines.push("contents identical");
    if (ext === "zip") {
      let ge = [];
      let ce = [];
      try {
        ge = unzip(gBytes);
        ce = unzip(c.bytes);
      } catch (e) {
        lines.push(`unzip failed: ${describeError(e)}`);
      }
      lines.push("expected entries:", ...compare.entryTable(ge), "actual entries:", ...compare.entryTable(ce));
      const k = ge.findIndex((e, x) => !ce[x] || ce[x].sha256 !== e.sha256 || ce[x].name !== e.name);
      if (k >= 0 && ce[k]) {
        lines.push(`first differing entry ${k}:`);
        for (const l of compare.firstDifferingLines(ge[k].data.toString("utf8"), ce[k].data.toString("utf8"))) lines.push(`  line ${l.line}: - ${l.expected}`, `  line ${l.line}: + ${l.actual}`);
      }
    } else {
      for (const l of compare.firstDifferingLines(gBytes.toString("utf8"), c.bytes.toString("utf8"))) lines.push(`line ${l.line}: - ${l.expected}`, `line ${l.line}: + ${l.actual}`);
    }
    priv.writePrivate(path.join(dir, `diff-${i}.txt`), `${lines.join("\n")}\n`);
  }
}

// The context of an old page's golden compared with a new page: the waivers' inputs, and W2's
// requirement on statement apps (their catch is M9's). Only a page known to be a custom app is
// spared it (it has no configurator, so no C-seed-badname page either), so a manifest without
// the app fact errs on the strict side.
const comparisonCtx = (f, o = {}) => ({ mode: "golden", legacyDom: f.legacyDom, keys: storageKeys(f), sx1: o.sx1 || null, w2Required: f.app !== "custom" });

// comparePages(browser, golden manifest, o) -> {mismatches, uses, steps, w2Checks}. Replays every
// golden page on the candidate page (o.url) and compares each step as it is captured. On a
// statement app W2 is required where the old page threw (compare.js, PageComparison, from M9 on:
// the busy line and the error line, design §8.1 M9); w2Checks lists those pages' checks.
async function compareManifest(browser, m, o) {
  const f = m.facts;
  const mismatches = [];
  const uses = [];
  const w2Checks = [];
  let steps = 0;
  await pool(m.pages.filter((p) => !p.error && !isNewOnly(p)), o.jobs, async (page) => {
    const gp = goldenPage(m, page);
    const pc = new compare.PageComparison(gp, comparisonCtx(f, o));
    const def = { ...page };
    const res = await runPage(o.browser || browser, def, {
      url: o.url, legacyDom: null, keys: storageKeys(f), modes: f.modeValues, seed: page.seedResolved || seedOf(page), plan: page.steps,
      passthrough: o.passthrough, keepBytes: false,
      onStep: async (step, d) => {
        steps++;
        const r = pc.step(step);
        mismatches.push(...r.mismatches);
        uses.push(...r.uses);
        if (r.mismatches.length && o.runId) {
          const withBytes = r.mismatches.some((x) => x.category === "downloads") ? await d.clickAll({ keepBytes: true }) : null;
          writeStepDiff(o.runId, r.mismatches, gp.keys.includes(step.key) ? gp.step(step.key) : null, withBytes, o.blobDir);
        }
        return undefined;
      },
    });
    const fin = pc.finish(res);
    mismatches.push(...fin.mismatches);
    uses.push(...fin.uses);
    if (fin.w2Check) w2Checks.push(fin.w2Check);
    if (fin.mismatches.length && o.runId) writeStepDiff(o.runId, fin.mismatches, null, null, null);
  });
  w2Checks.sort((a, b) => (a.page < b.page ? -1 : a.page > b.page ? 1 : 0));
  return { mismatches, uses, steps, w2Checks };
}

// ---------------------------------------------------------------- new-page-only scenarios

// In the new page, after a step: dispatch mouseover on every element of <main> (the S-break
// payload's handler event), then read whether a handler ran, every on* attribute in the document
// and the class of each card tag whose card is titled `label` (p0's account).
function inspectNewOnly({ label }) {
  const main = document.querySelector("main");
  if (main) for (const el of main.querySelectorAll("*")) el.dispatchEvent(new Event("mouseover"));
  const onAttrs = [];
  for (const el of document.querySelectorAll("*")) for (const a of el.attributes) if (/^on/i.test(a.name)) onAttrs.push(`${el.tagName.toLowerCase()}[${a.name}]`);
  const tags = label === null ? [] : [...document.querySelectorAll("#cards .card")].filter((c) => {
    const h = c.querySelector("h3");
    return !!h && h.textContent === label;
  }).map((c) => {
    const t = c.querySelector(".tag");
    return t ? t.getAttribute("class") : null;
  });
  return { pwned: typeof window.__pwned !== "undefined", onAttrs, tags };
}

// newOnlyStepProblems(step, view, {keys, configKey, seed}) -> [{category, field, expected,
// actual}]: what one step of an S-break page on the new page must show (design §6.7.5). view is
// inspectNewOnly's; keys the frozen storage keys; seed the page's raw storage seed.
//   - no handler ran (window.__pwned undefined) and no element carries an on* attribute;
//   - p0's card, whenever it is shown, has the tag class "tag other" (cssToken of the payload);
//   - a load settles (the busy line clears);
//   - storage: only the frozen keys are written, and the seeded config string stays as it was
//     (the scenario changes no setting, so the page has no reason to write it).
function newOnlyStepProblems(step, view, { keys, configKey, seed }) {
  const out = [];
  if (view.pwned) out.push({ category: "security", field: "pwned", expected: false, actual: true });
  if (view.onAttrs.length) out.push({ category: "security", field: "on-attributes", expected: [], actual: [...new Set(view.onAttrs)] });
  for (const t of view.tags) if (t !== "tag other") out.push({ category: "security", field: "tag", expected: "tag other", actual: t });
  if (step.busy && step.busy !== "idle") out.push({ category: "busy", field: "busy", expected: "idle", actual: step.busy });
  if (configKey && seed && Object.prototype.hasOwnProperty.call(seed, configKey)) {
    const got = (step.storage || {})[configKey];
    if (got !== seed[configKey]) out.push({ category: "storage", field: `storage.${configKey}`, expected: seed[configKey], actual: got === undefined ? null : got });
  }
  const extra = (step.lsKeys || []).filter((k) => !keys.includes(k));
  if (extra.length) out.push({ category: "keys", field: "lsKeys", expected: keys, actual: extra });
  return out;
}

// checkNewOnly(browser, prov, m, o) -> {mismatches, uses, steps, pages, counts}: the new-page-only pages
// of a manifest (S-break). Each runs on the new page (o.url) by itself, under the same
// determinism controls, its steps from its actions and the new page's own months; nothing is
// compared with an old page. Every step must pass newOnlyStepProblems, the page must log no
// error or CSP violation (the pdf.js worker fallback aside), p0's card must show at least once,
// and every download must equal the downloads hook's rebuild of the same state: SX1 (design
// §6.7.6), checked by Node replay with the new parser in a child process with the environment's
// time zone and locale, as the replay command does, so Download all must equal
// zipParts(allFiles(), now). o = {url, dir (the statement folder), runId}. counts: the captured
// records the replay child compared ({records, disabled, zips, entries}), or null.
async function checkNewOnly(browser, prov, m, o) {
  const pages = m.pages.filter((p) => !p.error && isNewOnly(p));
  const out = { mismatches: [], uses: [], steps: 0, pages: pages.length, counts: null };
  if (!pages.length) return out;
  const f = m.facts;
  const keys = storageKeys(f);
  const label = m.probe && m.probe.portfolios && m.probe.portfolios[0] ? m.probe.portfolios[0].label : null;
  const tag = (page, step, list) => list.map((x) => ({ page: page.id, step, scenario: step ? `${page.id}/${step}` : page.id, ...x }));
  const captured = [];
  for (const page of pages) {
    const seed = seedOf(page);
    const steps = [];
    let shown = 0;
    const res = await runPage(browser, page, {
      url: o.url, legacyDom: null, keys, modes: f.modeValues, seed, plan: null, passthrough: false, keepBytes: false,
      onStep: async (step, d) => {
        const view = await d.page.evaluate(inspectNewOnly, { label });
        if (view.tags.length) shown++;
        out.mismatches.push(...tag(page, step.key, newOnlyStepProblems(step, view, { keys, configKey: f.configKey, seed })));
        steps.push(step);
        return undefined;
      },
    });
    if (res.error) out.mismatches.push(...tag(page, null, [{ category: "page", field: "error", expected: null, actual: res.error }]));
    out.mismatches.push(...tag(page, null, compare.comparePageErrors(null, res.errors).map((x) => ({ category: "errors", ...x }))));
    if (!shown && label !== null) out.mismatches.push(...tag(page, null, [{ category: "security", field: "tag", expected: "p0's card in some step", actual: null }]));
    out.steps += steps.length;
    captured.push({ page, steps });
  }
  // SX1: every captured download against the hook's rebuild, in a replay child (E0 only: the S
  // scenarios run in E0).
  const handle = lib("load-provider.js").loadNode(prov.id, { root: REPO, parser: "new" });
  const paths = [...new Set(captured.flatMap((c) => c.steps.flatMap((s) => s.order || [])))].sort();
  await lib("extract.js").extract(paths, { handle, browser, allowed: [o.dir] });
  const jobPages = captured.map((c) => ({
    id: c.page.id,
    steps: c.steps.map((s) => ({ key: s.key, act: s.act, threw: !!s.threw, mode: s.mode, range: s.range, order: s.order, storage: s.storage, records: stripBytes(s.records) })),
  }));
  const job = makeJob(prov, m.env.id, jobPages, o.dir, { parser: "new" }, { keepActual: 0 });
  const [r] = await lib("replay.js").runJobs([job], { parallel: 1 });
  if (!r || !r.ok) out.mismatches.push({ page: pages[0].id, step: null, scenario: pages[0].id, category: "sx1", field: "replay", expected: "the hook's rebuild", actual: r ? r.error : "no reply" });
  else if (r.skipped) out.mismatches.push({ page: pages[0].id, step: null, scenario: pages[0].id, category: "sx1", field: "replay", expected: "the hook's rebuild", actual: r.skipped });
  else {
    out.counts = { records: r.counts.records, disabled: r.counts.disabled, zips: r.counts.zips, entries: r.counts.entries };
    for (const mm of r.mismatches) out.mismatches.push({ ...mm, category: mm.category === "downloads" ? "sx1" : mm.category });
    for (const t of r.threw) out.mismatches.push({ page: t.page, step: t.step, scenario: t.scenario, category: "sx1", field: "threw", expected: null, actual: t.message });
  }
  for (const c of captured) for (const s of c.steps) out.uses.push({ waiver: "SX1", page: c.page.id, step: s.key });
  if (out.mismatches.length && o.runId) {
    const byScenario = new Map();
    for (const mm of out.mismatches) {
      if (!byScenario.has(mm.scenario)) byScenario.set(mm.scenario, []);
      byScenario.get(mm.scenario).push(mm);
    }
    for (const list of byScenario.values()) writeStepDiff(o.runId, list, null, null, null);
  }
  return out;
}

// Strict comparison of two captures of the same old page (G1).
function compareStrict(a, b) {
  const mismatches = [];
  for (const k of ["format", "provider", "tier", "env", "versions", "page", "inputs", "facts", "probe", "security", "skipped"]) {
    if (canon(a[k] === undefined ? null : a[k]) !== canon(b[k] === undefined ? null : b[k])) mismatches.push({ category: "meta", field: k, scenario: a.provider });
  }
  for (const k of ["parts", "lists"]) {
    if (canon(sortedKeys(a[k] || {})) !== canon(sortedKeys(b[k] || {}))) mismatches.push({ category: "meta", field: k, scenario: a.provider });
  }
  const bp = new Map(b.pages.map((p) => [p.id, p]));
  if (canon(a.pages.map((p) => p.id)) !== canon(b.pages.map((p) => p.id))) mismatches.push({ category: "steps", field: "pages", scenario: a.provider });
  for (const pa of a.pages) {
    const pb = bp.get(pa.id);
    if (!pb) continue;
    for (const k of ["actions", "seed", "seedResolved", "orders", "error", "mseed", "static"]) {
      if (canon(pa[k] === undefined ? null : pa[k]) !== canon(pb[k] === undefined ? null : pb[k])) mismatches.push({ category: "steps", field: k, page: pa.id, scenario: pa.id });
    }
    const ga = { ...pa, steps: pa.steps.map((s) => expandStep(a, pa, s)), ...(pa.static !== undefined ? { static: pa.static === null ? null : a.parts[pa.static] } : {}) };
    const gb = { ...pb, steps: pb.steps.map((s) => expandStep(b, pb, s)), ...(pb.static !== undefined ? { static: pb.static === null ? null : b.parts[pb.static] } : {}) };
    mismatches.push(...compare.comparePage(ga, gb, { mode: "strict" }).mismatches);
  }
  return mismatches;
}

// The goldens of a provider and tier for the current statements: the input-hash folder whose
// recorded files are all on disk unchanged, with no other accepted file in the folder.
function findGoldens(prov, tier, opts) {
  const root = goldenRoot(prov.id, prov.frozen);
  let dirs = [];
  try {
    dirs = fs.readdirSync(root).filter((n) => /^[0-9a-f]{12}$/.test(n)).sort();
  } catch {
    dirs = [];
  }
  const dir = statementDir(prov, opts);
  for (const in12 of dirs) {
    const envDir = path.join(root, in12, tier);
    let envs;
    try {
      envs = fs.readdirSync(envDir).filter((e) => scenarios.ENV_IDS.includes(e)).sort();
    } catch {
      continue;
    }
    const manifests = {};
    for (const env of envs) {
      const file = path.join(envDir, env, "manifest.json");
      if (!fs.existsSync(file)) continue;
      priv.assertSafeInput(file);
      manifests[env] = JSON.parse(fs.readFileSync(file, "utf8"));
    }
    const any = Object.values(manifests)[0];
    if (!any) continue;
    const current = listInputs(dir, any.facts.accept);
    const recorded = any.inputs.files;
    for (const x of recorded) notePrivate(x.path);
    const ok = canon(current) === canon(recorded.map((x) => x.path)) && recorded.every((x) => fs.existsSync(x.path) && describeFile(x.path).sha256 === x.sha256);
    if (ok) return { in12, manifests };
  }
  throw new Error(`${prov.id}: no ${tier} goldens for the current statements (run: node test/golden/run.js capture --tier ${tier} --providers ${prov.id})`);
}

// ---------------------------------------------------------------- commands

async function withBaseline(provs, opts, report, fn) {
  const frozens = provs.map((p) => p.frozen);
  const { problems, manifests } = await baseline.before(frozens, { live: opts.live, oldRoot: priv.oldRoot() });
  let entries = 0;
  for (const m of manifests.values()) entries += m.size;
  report.baseline = { repos: manifests.size, entries, live: opts.live, before: problems.length, after: null };
  log(`baseline before: ${manifests.size} old repositories, ${entries} manifest entries, ${problems.length} problems${opts.live ? "" : " (--no-live: not a gate run)"}`);
  for (const p of problems) log(`  ${p}`);
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
  log(`baseline after: ${after.length} differences`);
  for (const p of after) log(`  ${p}`);
  if (after.length && !failure) failure = new Error("an old repository changed during the run");
  if (failure) throw failure;
  return result;
}

async function withBrowser(fn) {
  const browser = await browserLib.launch();
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}

function buildCheck(opts) {
  if (opts.page !== "dist") return;
  try {
    execFileSync(process.execPath, [path.join(REPO, "build", "build.js"), "--check"], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    const text = String((e.stderr && e.stderr.length ? e.stderr : e.stdout) || e.message).trim();
    throw new Error(`build --check failed; the new pages are not current:\n${text}`);
  }
}

async function cmdBaseline(opts, report) {
  const provs = selectProviders(opts.providers);
  await withBaseline(provs, opts, report, async () => {
    for (const p of provs) log(`${p.id}: HEAD, index.html and blob checked${opts.live ? ", live page checked" : ""}`);
  });
  return true;
}

async function cmdCapture(opts, report) {
  const provs = selectProviders(opts.providers);
  let ok = true;
  await withBaseline(provs, opts, report, () => withBrowser(async (browser) => {
    report.versions = browserLib.versions(browser);
    for (const prov of provs) {
      const r = await captureProvider(browser, prov, opts);
      const entry = { id: prov.id, in12: r.in12, failures: r.failures.length, envs: [] };
      for (const [env, m] of Object.entries(r.manifests)) {
        const s = printStats(`${prov.id} ${opts.tier} ${env}`, m);
        const file = goldenFile(prov.id, prov.frozen, r.in12, opts.tier, env);
        priv.writePrivate(file, manifestText(m));
        const hash = manifestHash(m);
        entry.envs.push({ env, ...s, ms: m.ms, manifestSha256: hash });
        log(`  manifest ${hash.slice(0, 16)}`);
      }
      for (const f of r.failures) log(`  FAILED ${redact(f)}`);
      entry.failureDetails = r.failures;
      if (r.failures.length) ok = false;
      report.providers.push(entry);
    }
  }));
  return ok;
}

async function cmdDeterminism(opts, report) {
  const provs = selectProviders(opts.providers);
  let ok = true;
  await withBaseline(provs, opts, report, async () => {
    const runs = [];
    for (const label of ["first", "second"]) {
      const blobs = opts.keepBytes ? priv.privateDir("determinism", report.run, "blobs") : null;
      runs.push(await withBrowser(async (browser) => {
        report.versions = browserLib.versions(browser);
        const out = {};
        for (const prov of provs) {
          const r = await captureProvider(browser, prov, { ...opts, keepBytes: !!blobs, blobDir: blobs });
          for (const [env, m] of Object.entries(r.manifests)) printStats(`${prov.id} ${opts.tier} ${env} (${label} run)`, m);
          for (const f of r.failures) log(`  FAILED ${redact(f)}`);
          out[prov.id] = r;
        }
        return out;
      }));
    }
    for (const prov of provs) {
      const a = runs[0][prov.id];
      const b = runs[1][prov.id];
      const entry = { id: prov.id, envs: [], failures: a.failures.length + b.failures.length, failureDetails: [...a.failures, ...b.failures] };
      if (entry.failures) ok = false;
      const envs = [...new Set([...Object.keys(a.manifests), ...Object.keys(b.manifests)])];
      for (const env of envs) {
        const ma = a.manifests[env];
        const mb = b.manifests[env];
        const identical = !!ma && !!mb && manifestText(ma) === manifestText(mb);
        const mismatches = identical ? [] : ma && mb ? compareStrict(ma, mb) : [{ category: "meta", field: "env", scenario: prov.id }];
        if (!identical && !mismatches.length) mismatches.push({ category: "meta", field: "manifest bytes", scenario: prov.id });
        const s = ma ? manifestStats(ma) : {};
        entry.envs.push({ env, identical, mismatches: compare.countByCategory(mismatches), ...s, manifestSha256: ma ? manifestHash(ma) : null });
        log(`${prov.id} ${env}: ${identical ? "identical" : `DIFFERENT (${mismatches.length} mismatches: ${JSON.stringify(compare.countByCategory(mismatches))})`}${ma ? `, manifest ${manifestHash(ma).slice(0, 16)}` : ""}`);
        if (!identical) {
          ok = false;
          const byScenario = new Map();
          for (const mm of mismatches) {
            const k = mm.scenario || prov.id;
            if (!byScenario.has(k)) byScenario.set(k, []);
            byScenario.get(k).push(mm);
          }
          for (const [k, list] of byScenario) {
            if (opts.verbose) log(`  ${k}: ${list.map((x) => `${x.category}:${x.field}${x.trigger ? `@${x.trigger}` : ""}`).join(", ")}`);
            writeStepDiff(report.run, list.map((x) => ({ ...x, scenario: k })), null, null, null);
          }
        }
      }
      report.providers.push(entry);
    }
  });
  return ok;
}

// W2's uses, each listed (design: every use is in the report): {page, step, parts}, and per
// page the line the console prints, e.g. "<page>: 17 steps, the error line on @load1, the busy
// line on 17". Page ids and step keys hold indexes only, never names.
function w2Uses(uses) {
  const list = uses.filter((u) => u.waiver === "W2").map((u) => ({ page: u.page, step: u.step, parts: u.parts || [] }));
  const pages = new Map();
  for (const u of list) {
    const p = pages.get(u.page) || { steps: 0, errorLine: [], busyLine: 0 };
    p.steps++;
    if (u.parts.includes("error line")) p.errorLine.push(u.step);
    if (u.parts.includes("busy line")) p.busyLine++;
    pages.set(u.page, p);
  }
  const lines = [...pages].map(([page, p]) => `${page}: ${p.steps} step${p.steps > 1 ? "s" : ""}, the error line ${p.errorLine.length ? `on ${p.errorLine.join(", ")}` : "on none"}, the busy line on ${p.busyLine}`);
  return { list, lines };
}

// The W2 requirement's report (compare.js, PageComparison): the statement-app pages where W2
// applies and the old page threw, those that show the parts W2 must cover (the error line on the
// throwing step, the busy line wherever the old page's stuck one shows), and those that fail.
// Page ids hold indexes only.
function w2CheckSummary(checks) {
  const failed = checks.filter((c) => !c.ok).map((c) => c.page);
  const line = `required on ${checks.length} page${checks.length === 1 ? "" : "s"} whose old page threw: ${checks.length - failed.length} with the error line on the throwing step and the busy line wherever the old page's stuck one shows${failed.length ? `; FAILED on ${failed.join(", ")}` : ""}`;
  return { pages: checks.length, ok: checks.length - failed.length, failed, line };
}

function summariseComparison(prefix, r, entry) {
  const counts = compare.countByCategory(r.mismatches);
  const uses = {};
  for (const u of r.uses) uses[u.waiver] = (uses[u.waiver] || 0) + 1;
  entry.steps = (entry.steps || 0) + r.steps;
  entry.mismatches = { ...(entry.mismatches || {}) };
  for (const [k, v] of Object.entries(counts)) entry.mismatches[k] = (entry.mismatches[k] || 0) + v;
  entry.waivers = { ...(entry.waivers || {}) };
  for (const [k, v] of Object.entries(uses)) entry.waivers[k] = (entry.waivers[k] || 0) + v;
  const w2 = w2Uses(r.uses);
  if (w2.list.length) entry.w2 = [...(entry.w2 || []), ...w2.list];
  const required = r.w2Checks && r.w2Checks.length ? w2CheckSummary(r.w2Checks) : null;
  if (required) entry.w2Check = { pages: required.pages, ok: required.ok, failed: required.failed };
  log(`${prefix}: ${r.steps} steps, ${r.mismatches.length ? `${r.mismatches.length} MISMATCHES ${JSON.stringify(counts)}` : "identical"}${Object.keys(uses).length ? `, waivers ${JSON.stringify(uses)}` : ""}`);
  for (const line of w2.lines) log(`  W2 ${line}`);
  if (required) log(`  W2 ${required.line}`);
  const scen = [...new Set(r.mismatches.map((m) => m.scenario))];
  for (const s of scen.slice(0, 20)) log(`  ${s}: ${[...new Set(r.mismatches.filter((m) => m.scenario === s).map((m) => `${m.category}:${m.field}${m.trigger ? `@${m.trigger}` : ""}`))].join(", ")}`);
  if (scen.length > 20) log(`  … ${scen.length - 20} more scenarios (see the diff directory)`);
  return r.mismatches.length === 0;
}

// The report entry and console line of an environment's new-page-only pages.
function newOnlySummary(prefix, n) {
  const c = n.counts || { records: 0, disabled: 0, zips: 0, entries: 0 };
  log(`${prefix}: ${n.pages} new-page-only page${n.pages > 1 ? "s" : ""}, ${n.steps} steps, ${c.records} downloads (${c.zips} zips, ${c.entries} entries, ${c.disabled} disabled) against the downloads hook (SX1)`);
  return { pages: n.pages, steps: n.steps, ...c };
}

async function cmdCompare(opts, report) {
  const provs = selectProviders(opts.providers);
  buildCheck(opts);
  let ok = true;
  await withBaseline(provs, opts, report, () => withBrowser(async (browser) => {
    report.versions = browserLib.versions(browser);
    for (const prov of provs) {
      const { in12, manifests } = findGoldens(prov, opts.tier, opts);
      const url = fileUrl(newPagePath(prov.id, opts.page));
      priv.assertSafeInput(newPagePath(prov.id, opts.page));
      const dir = statementDir(prov, opts);
      const entry = { id: prov.id, in12, envs: [] };
      const e0 = manifests.E0;
      if (e0 && e0.facts.configKey !== null && e0.facts.configKey !== undefined && !e0.security) {
        entry.security = "not in these goldens";
        log(`${prov.id}: note: the ${opts.tier} goldens were captured without the S scenarios (before M8), so this run checks neither S-benign nor S-break; live --tier ${opts.tier} runs them`);
      }
      for (const env of Object.keys(manifests).filter((e) => !opts.envs || opts.envs.includes(e))) {
        const m = manifests[env];
        if (canon(m.versions) !== canon(report.versions)) throw new Error(`${prov.id} ${env}: the goldens were recorded with ${JSON.stringify(m.versions)}, this run uses ${JSON.stringify(report.versions)}`);
        const c = await compareManifest(browser, m, { url, jobs: opts.jobs, passthrough: opts.passthrough && opts.tier === "quick", runId: report.run, blobDir: blobDir(prov.id, prov.frozen, in12) });
        const n = await checkNewOnly(browser, prov, m, { url, dir, runId: report.run });
        const r = { mismatches: [...c.mismatches, ...n.mismatches], uses: [...c.uses, ...n.uses], steps: c.steps + n.steps, w2Checks: c.w2Checks };
        const e = { env };
        if (n.pages) e.newOnly = newOnlySummary(`${prov.id} ${opts.tier} ${env}`, n);
        if (!summariseComparison(`${prov.id} ${opts.tier} ${env}`, r, e)) ok = false;
        const gap = captureErrorProblem(m);
        if (gap) {
          ok = false;
          e.incomplete = [gap];
          log(`  FAILED: ${gap}`);
        }
        entry.envs.push(e);
      }
      report.providers.push(entry);
    }
  }));
  return ok;
}

async function cmdLive(opts, report) {
  const provs = selectProviders(opts.providers);
  buildCheck(opts);
  let ok = true;
  await withBaseline(provs, opts, report, () => withBrowser(async (browser) => {
    report.versions = browserLib.versions(browser);
    for (const prov of provs) {
      const blobs = priv.privateDir("live", report.run, prov.id, "blobs");
      const old = await captureProvider(browser, prov, { ...opts, keepBytes: true, blobDir: blobs });
      for (const f of old.failures) log(`  FAILED (old page) ${redact(f)}`);
      if (old.failures.length) ok = false;
      const url = fileUrl(newPagePath(prov.id, opts.page));
      const entry = { id: prov.id, envs: [] };
      for (const [env, m] of Object.entries(old.manifests)) {
        const c = await compareManifest(browser, m, { url, jobs: opts.jobs, passthrough: opts.passthrough && opts.tier === "quick", runId: report.run, blobDir: blobs });
        const n = await checkNewOnly(browser, prov, m, { url, dir: old.probe.dir, runId: report.run });
        const r = { mismatches: [...c.mismatches, ...n.mismatches], uses: [...c.uses, ...n.uses], steps: c.steps + n.steps, w2Checks: c.w2Checks };
        const e = { env };
        if (n.pages) e.newOnly = newOnlySummary(`${prov.id} ${opts.tier} ${env} (live)`, n);
        if (!summariseComparison(`${prov.id} ${opts.tier} ${env} (live)`, r, e)) ok = false;
        entry.envs.push(e);
      }
      fs.rmSync(blobs, { recursive: true, force: true });
      report.providers.push(entry);
    }
  }));
  return ok;
}

// G1b: build the provider four times, each with one canary injected (plan piece 12b), replay
// the quick golden E0/O0/I0/C0 page on each and require exactly the expected mismatches.
async function cmdCanary(opts, report) {
  const [prov] = selectProviders([opts.provider]);
  if (prov.frozen.kindModel === undefined) throw new UsageError(`${prov.id} is not a statement-app provider; the canaries apply to statement apps`);
  const { in12, manifests } = findGoldens(prov, "quick", opts);
  const m = manifests.E0;
  if (!m) throw new Error(`${prov.id}: no quick E0 goldens`);
  const base = m.pages.find((p) => p.id === `${prov.id}/E0/O0/I0/C0`);
  if (!base || base.error) throw new Error(`${prov.id}: the quick goldens have no complete E0/O0/I0/C0 page`);
  const pages = {};
  for (const c of compare.CANARIES) {
    const out = priv.privateDir("canary", c);
    const piece = path.join(__dirname, "canaries", `${c}.js`);
    try {
      execFileSync(process.execPath, [path.join(REPO, "build", "build.js"), "--only", prov.id, "--inject", piece, "--out", out], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      throw new Error(`build of the ${c} canary failed: ${String((e.stderr && e.stderr.length ? e.stderr : e.stdout) || e.message).trim()}`);
    }
    pages[c] = path.join(out, prov.id, "index.html");
  }
  let ok = true;
  await withBaseline([prov], opts, report, () => withBrowser(async (browser) => {
    report.versions = browserLib.versions(browser);
    if (canon(m.versions) !== canon(report.versions)) throw new Error(`${prov.id}: the goldens were recorded with other versions`);
    const only = { ...m, pages: [base] };
    const gp = goldenPage(m, base);
    const goldenSteps = gp.keys.map((k) => gp.step(k));
    const entry = { id: prov.id, in12, canaries: {} };
    for (const c of compare.CANARIES) {
      const r = await compareManifest(browser, only, { url: fileUrl(pages[c]), jobs: 1, passthrough: false, runId: `${report.run}-${c}`, blobDir: blobDir(prov.id, prov.frozen, in12) });
      const check = compare.checkCanary(c, { mismatches: r.mismatches, goldenSteps });
      entry.canaries[c] = { mismatches: compare.countByCategory(r.mismatches), ok: check.ok, problems: check.problems };
      log(`canary ${c}: ${r.mismatches.length} mismatches ${JSON.stringify(compare.countByCategory(r.mismatches))} -> ${check.ok ? "fails exactly as expected" : `WRONG: ${check.problems.join("; ")}`}`);
      if (!check.ok) ok = false;
    }
    report.providers.push(entry);
  }));
  return ok;
}

// ---------------------------------------------------------------- extraction and Node replay

const REPLAY_STEPS_PER_JOB = 1500; // steps per child process (pages are never split)
const KEEP_ACTUAL = 20; // replayed bytes per child kept for the private diff folder
const ICU_ROUNDS = 3; // oracle rounds of the ICU drift check
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

// The goldens of a provider for the current statements, per tier present: {tier: {in12, manifests}}.
function goldenSets(prov, tiers, opts) {
  const out = {};
  for (const tier of tiers) {
    try {
      out[tier] = findGoldens(prov, tier, opts);
    } catch (e) {
      if (!describeError(e).includes(`no ${tier} goldens for the current statements`)) throw e;
    }
  }
  return out;
}

// Every statement path a set of goldens uses: the recorded files and each page's add orders.
function goldenPaths(manifests) {
  const out = new Set();
  for (const m of Object.values(manifests)) {
    for (const f of m.inputs.files) {
      out.add(f.path);
      notePrivate(f.name);
    }
    for (const p of m.pages) for (const o of p.orders || []) for (const x of o) out.add(x);
  }
  for (const p of out) notePrivate(p);
  return [...out].sort();
}

// A golden page whose capture failed (page.error) keeps only the steps before the failure, and
// compare and replay do not run it, so a golden with such pages does not cover its scenarios.
// Both commands run the other pages and then fail the environment with this problem.
function captureErrorProblem(m) {
  const n = m.pages.filter((p) => p.error).length;
  return n ? `${n} of ${m.pages.length} golden pages had a capture error and were not run, so this golden is incomplete (capture again)` : null;
}

// The synthetic files (the bogus statement) are rewritten with their fixed contents and must
// then equal what the goldens recorded.
function checkSynthetic(manifests) {
  const problems = new Set();
  for (const m of Object.values(manifests)) {
    const { meta } = writeSynthetic(m.facts.inputs);
    for (const rec of m.inputs.synthetic || []) {
      const now = meta.find((x) => x.use === rec.use);
      if (!now || now.path !== rec.path || now.sha256 !== rec.sha256) problems.add(`the synthetic ${rec.use} file is not the one the goldens recorded`);
    }
  }
  return [...problems];
}

function checkVersions(prov, manifests) {
  const want = canon({ playwright: browserLib.EXPECTED.playwright, chrome: browserLib.EXPECTED.chrome });
  for (const [env, m] of Object.entries(manifests)) {
    if (canon(m.versions) !== want) throw new Error(`${prov.id} ${env}: the goldens were recorded with ${JSON.stringify(m.versions)}, not the pinned versions`);
  }
}

// The handle of extraction and replay: the old parser, or the new one (with --frozen-runtime
// before provider.js exists).
function replayHandle(prov, opts) {
  const { loadNode } = lib("load-provider.js");
  return loadNode(prov.id, { root: REPO, parser: opts.parser || "old", oldRoot: priv.oldRoot(), runtime: opts.frozenRuntime ? "frozen" : null });
}

// The declared inputs (of the handle, or reading facts given as such) must be the old page's:
// the picker the goldens recorded.
function checkReading(prov, handleOrReading, manifests) {
  const reading = handleOrReading.inputs ? handleOrReading : lib("extract.js").readingOf(handleOrReading, { oldRoot: priv.oldRoot() });
  const want = reading.inputs.slice().sort().join(",");
  for (const [k, m] of Object.entries(manifests)) {
    if (m.facts.inputs.slice().sort().join(",") !== want) throw new Error(`${prov.id} ${k}: the declared inputs (${want}) are not the old page's (${m.facts.inputs.join(",")})`);
  }
  return reading;
}

// Baseline step 3: the old sources that replay reads (the old parser and its modules, or the
// old page's reading facts) must equal their blobs at legacyHead.
function oldSourceProblems(provs) {
  const problems = [];
  for (const p of provs) {
    const src = path.join(priv.oldRoot(), p.frozen.legacyRepo, "src");
    let names = [];
    try {
      names = fs.readdirSync(src).filter((n) => /\.js$/.test(n)).sort();
    } catch (e) {
      problems.push(`${p.frozen.legacyRepo}: cannot list src: ${e.code || e.message}`);
      continue;
    }
    problems.push(...baseline.checkGit(p.frozen, { oldRoot: priv.oldRoot(), files: [...names.map((n) => `src/${n}`), "src/index.template.html", "build.py"] }));
  }
  return problems;
}

// A golden page as replay needs it: each step's action, add order, storage, mode, range and
// download records.
function replayPages(m, pages) {
  return pages.map((page) => {
    const gp = goldenPage(m, page);
    const steps = gp.keys.map((k) => {
      const s = gp.step(k);
      return { key: s.key, act: s.act, threw: s.threw, mode: s.mode, range: s.range, order: s.order, storage: s.storage, records: s.records };
    });
    return { id: page.id, steps };
  });
}

function chunkPages(pages, size = REPLAY_STEPS_PER_JOB) {
  const out = [];
  let cur = [];
  let n = 0;
  for (const p of pages) {
    cur.push(p);
    n += p.steps.length;
    if (n >= size) {
      out.push(cur);
      cur = [];
      n = 0;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

function makeJob(prov, env, pages, dir, opts, extra = {}) {
  const paths = new Set();
  for (const p of pages) for (const s of p.steps) for (const x of s.order || []) paths.add(x);
  return {
    id: prov.id, parser: opts.parser, runtime: opts.frozenRuntime ? "frozen" : null, root: REPO, oldRoot: priv.oldRoot(),
    env: { ...browserLib.ENVS[env] }, cacheDir: priv.privateDir("extract"), allowed: [dir], paths: [...paths].sort(), pages,
    keepActual: KEEP_ACTUAL, ...extra,
  };
}

// The first replay step of each run of throwing steps must be one where the old page threw too
// (a stuck load or a new uncaught error): a parse that throws anywhere else, for example on a
// frozen input it tried to change, is a problem even when the downloads agree.
function throwProblems(pages, threw) {
  const by = new Map(threw.map((t) => [t.scenario, t]));
  const out = [];
  for (const p of pages) {
    let before = false;
    for (const s of p.steps) {
      const t = by.has(`${p.id}/${s.key}`);
      if (t && !before && !s.threw) out.push({ page: p.id, step: s.key, scenario: `${p.id}/${s.key}`, category: "threw", field: "threw", expected: false, actual: by.get(`${p.id}/${s.key}`).message });
      before = t;
    }
  }
  return out;
}

async function cmdExtract(opts, report) {
  const provs = selectProviders(opts.providers);
  const parser = opts.parser || "old";
  report.parser = parser;
  let ok = true;
  await withBaseline(provs, opts, report, async () => {
    const problems = oldSourceProblems(provs);
    for (const p of problems) log(`  ${redact(p)}`);
    if (problems.length) throw new Error("the old sources are not their blobs at legacyHead");
    let browser = null;
    try {
      for (const prov of provs) {
        const t0 = Date.now();
        const entry = { id: prov.id };
        report.providers.push(entry);
        try {
          const sets = goldenSets(prov, opts.tier ? [opts.tier] : scenarios.TIERS, opts);
          const tiers = Object.keys(sets);
          if (!tiers.length) throw new Error(`no goldens for the current statements (run: node test/golden/run.js capture --tier full --providers ${prov.id})`);
          const manifests = {};
          for (const t of tiers) for (const [env, m] of Object.entries(sets[t].manifests)) manifests[`${t}/${env}`] = m;
          const synth = checkSynthetic(manifests);
          if (synth.length) throw new Error(synth.join("; "));
          // The cache holds the statements before any page transform, so the old page's reading
          // facts are all the old side needs (no parser, no test.js); the new side reads its
          // descriptor through the handle.
          const extractLib = lib("extract.js");
          const reading = parser === "old" ? extractLib.legacyReading(prov.frozen, { oldRoot: priv.oldRoot() }) : extractLib.readingOf(replayHandle(prov, { ...opts, parser }));
          checkReading(prov, reading, manifests);
          entry.inputs = reading.inputs;
          const dir = statementDir(prov, opts);
          const paths = goldenPaths(manifests);
          if (!browser) {
            browser = await browserLib.launch();
            report.versions = browserLib.versions(browser);
          }
          const r = await extractLib.extract(paths, { inputs: reading.inputs, browser, allowed: [dir] });
          Object.assign(entry, { tiers, files: paths.length, statements: r.statements.length, failed: r.failed.length, skipped: r.skipped.length, ...r.cache, ms: Date.now() - t0 });
          log(`${prov.id}: ${paths.length} files (${tiers.join(", ")} goldens), ${r.statements.length} statements, ${r.failed.length} reader failures, ${r.skipped.length} not accepted; `
            + `${r.cache.hits} cached, ${r.cache.misses} read in Chrome (page key ${r.cache.key}), ${secs(Date.now() - t0)}`);
        } catch (e) {
          ok = false;
          entry.error = describeError(e);
          log(`${prov.id}: FAILED ${redact(describeError(e))}`);
        }
      }
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  });
  return ok;
}

// ICU drift check of the groups with mismatches: replay their mismatching pages again while
// recording the ICU-dependent calls, let Chrome answer the same calls in the environment's
// locale and time zone, and replay once more with those answers. Sets m.class on every
// mismatch: "icu-drift" when its step is identical under Chrome's answers, else "real".
async function classifyIcu(groups, opts) {
  const replay = lib("replay.js");
  const suspects = [...groups.values()].filter((g) => g.mismatches.length);
  for (const g of groups.values()) for (const m of g.mismatches) m.class = "real";
  if (!suspects.length) return;
  const browser = await browserLib.launch();
  try {
    for (const g of suspects) {
      const ids = new Set(g.mismatches.filter((m) => m.category === "downloads").map((m) => m.page));
      g.icu = { pages: ids.size, calls: 0, differing: 0, rounds: 0, converged: false, newMismatches: 0 };
      if (!ids.size) continue;
      const pages = replayPages(g.manifest, g.manifest.pages.filter((p) => ids.has(p.id)));
      const job = makeJob(g.prov, g.env, pages, g.dir, opts, { keepActual: 0 });
      const env = browserLib.ENVS[g.env];
      const r = await replay.icuCheck(job, { answer: (calls) => replay.chromeAnswers(browser, env, calls), rounds: ICU_ROUNDS });
      Object.assign(g.icu, { calls: r.calls, differing: r.differing, rounds: r.rounds, converged: r.converged });
      if (!r.differing || !r.converged) continue;
      // Chrome's answers must not break a step that Node replayed identically; if they do, the
      // answers do not describe the old page and nothing is reclassified.
      const still = new Set(r.mismatches.map((m) => m.scenario));
      const before = new Set(g.mismatches.map((m) => m.scenario));
      g.icu.newMismatches = [...still].filter((x) => !before.has(x)).length;
      if (!g.icu.newMismatches) for (const m of g.mismatches) if (m.category === "downloads" && !still.has(m.scenario)) m.class = "icu-drift";
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

async function cmdReplay(opts, report) {
  const tier = opts.tier || "full";
  const provs = selectProviders(opts.providers);
  const replay = lib("replay.js");
  Object.assign(report, {
    tier, parser: opts.parser, frozenRuntime: !!opts.frozenRuntime, gate: !opts.frozenRuntime && opts.live,
    node: { version: process.version, icu: process.versions.icu, unicode: process.versions.unicode, tz: process.versions.tz },
  });
  if (opts.frozenRuntime) log("--frozen-runtime: the providers' parser.js with the frozen runtime (an early signal, not a gate run)");
  let ok = true;
  await withBaseline(provs, opts, report, async () => {
    const t0 = Date.now();
    const problems = oldSourceProblems(provs);
    for (const p of problems) log(`  ${redact(p)}`);
    if (problems.length) throw new Error("the old sources are not their blobs at legacyHead");
    const groups = new Map();
    const jobs = [];
    for (const prov of provs) {
      const entry = { id: prov.id, envs: [] };
      report.providers.push(entry);
      try {
        const { in12, manifests } = findGoldens(prov, tier, opts);
        entry.in12 = in12;
        checkVersions(prov, manifests);
        const synth = checkSynthetic(manifests);
        if (synth.length) throw new Error(synth.join("; "));
        const handle = replayHandle(prov, opts);
        entry.reading = checkReading(prov, handle, manifests);
        const dir = statementDir(prov, opts);
        const t1 = Date.now();
        const ex = await lib("extract.js").extract(goldenPaths(manifests), { handle, allowed: [dir], oldRoot: priv.oldRoot() });
        entry.extraction = { statements: ex.statements.length, failed: ex.failed.length, skipped: ex.skipped.length, ...ex.cache, ms: Date.now() - t1 };
        for (const env of Object.keys(manifests).filter((e) => !opts.envs || opts.envs.includes(e))) {
          const m = manifests[env];
          const live = m.pages.filter((p) => !p.error && !isNewOnly(p));
          const pages = replayPages(m, live);
          const g = {
            prov, env, manifest: m, dir, pages, jobs: [], results: [], mismatches: [], threw: [],
            goldenProblem: captureErrorProblem(m), entry: { env, errorPages: m.pages.filter((p) => p.error).length },
          };
          entry.envs.push(g.entry);
          groups.set(`${prov.id}/${env}`, g);
          for (const chunk of chunkPages(pages)) {
            const job = makeJob(prov, env, chunk, dir, opts);
            job.group = `${prov.id}/${env}`;
            g.jobs.push(job);
            jobs.push(job);
          }
        }
      } catch (e) {
        ok = false;
        entry.error = describeError(e);
        log(`${prov.id}: FAILED ${redact(describeError(e))}`);
      }
    }
    log(`replay --parser ${opts.parser}${opts.frozenRuntime ? " --frozen-runtime" : ""}, ${tier} tier: ${jobs.length} child processes for ${groups.size} provider environments, ${opts.jobs} at a time`);
    const t2 = Date.now();
    const results = await replay.runJobs(jobs, { parallel: opts.jobs });
    jobs.forEach((job, i) => groups.get(job.group).results.push({ job, r: results[i] }));
    for (const g of groups.values()) {
      const e = g.entry;
      Object.assign(e, { pages: 0, steps: 0, records: 0, disabled: 0, zips: 0, entries: 0, unmodelled: 0, parses: 0, ms: 0 });
      for (const { r } of g.results) {
        if (!r.ok) {
          e.error = r.error;
          if (r.stderr) e.stderr = r.stderr;
          continue;
        }
        if (r.skipped) {
          e.skipped = r.skipped;
          continue;
        }
        e.pages += r.pages;
        for (const k of ["steps", "records", "disabled", "zips", "entries", "unmodelled"]) e[k] += r.counts[k] || 0;
        e.parses += r.parses || 0;
        e.ms += r.ms;
        g.mismatches.push(...r.mismatches);
        g.threw.push(...r.threw);
        g.actual = [...(g.actual || []), ...r.actual];
      }
      if (!e.error && !e.skipped && e.pages !== g.pages.length) e.error = `${e.pages} of ${g.pages.length} pages replayed`;
      g.mismatches.push(...throwProblems(g.pages, g.threw));
    }
    await classifyIcu(groups, opts);
    const total = { pages: 0, steps: 0, records: 0, zips: 0, entries: 0, real: 0, drift: 0, errorPages: 0, unmodelled: 0, incompleteEnvs: 0 };
    for (const g of groups.values()) {
      const e = g.entry;
      const real = g.mismatches.filter((m) => m.class !== "icu-drift");
      const drift = g.mismatches.filter((m) => m.class === "icu-drift");
      e.mismatches = { real: real.length, icuDrift: drift.length, byCategory: compare.countByCategory(real) };
      e.realSteps = new Set(real.map((m) => m.scenario)).size;
      e.driftSteps = new Set(drift.map((m) => m.scenario)).size;
      e.threw = { steps: g.threw.length, pages: new Set(g.threw.map((t) => t.page)).size };
      if (g.icu) e.icu = g.icu;
      const head = `${g.prov.id} ${tier} ${g.env}`;
      if (e.error) {
        ok = false;
        log(`${head}: FAILED ${redact(e.error)}`);
        continue;
      }
      if (e.skipped) {
        log(`${head}: SKIPPED (warning) ${redact(e.skipped)}`);
        continue;
      }
      for (const k of Object.keys(total)) if (typeof e[k] === "number") total[k] += e[k];
      total.real += real.length;
      total.drift += drift.length;
      if (real.length) ok = false;
      // What replay could not check makes the environment fail: a golden with pages that were
      // not run, or steps whose config storage cannot show (replay.js, unmodelled).
      const gaps = [];
      if (g.goldenProblem) gaps.push(g.goldenProblem);
      if (e.unmodelled) gaps.push(`${e.unmodelled} steps were not replayed: the page's config cannot be rebuilt from storage there (a configurator change on a stored JSON array)`);
      if (gaps.length) {
        ok = false;
        e.incomplete = gaps;
        total.incompleteEnvs++;
      }
      const verdict = real.length || drift.length ? `${real.length} MISMATCHES on ${e.realSteps} steps, ${drift.length} ICU drift on ${e.driftSteps} steps` : gaps.length ? "identical on the steps replayed, INCOMPLETE" : "identical";
      log(`${head}: ${e.pages} pages, ${e.steps} steps${e.unmodelled ? ` (${e.unmodelled} unmodelled)` : ""}, ${e.records} downloads (${e.zips} zips, ${e.entries} entries), ${e.disabled} disabled: `
        + `${verdict}; `
        + `parse threw on ${e.threw.steps} steps of ${e.threw.pages} pages${g.icu ? `; ICU calls ${g.icu.calls}, differing ${g.icu.differing}` : ""}; ${secs(e.ms)} in children`);
      for (const x of gaps) log(`  FAILED: ${x}`);
      const scen = [...new Set(g.mismatches.map((m) => m.scenario))];
      for (const s of scen.slice(0, 20)) {
        const ms = g.mismatches.filter((m) => m.scenario === s);
        log(`  ${s}: ${[...new Set(ms.map((m) => `${m.class === "icu-drift" ? "icu-drift " : ""}${m.category}:${m.field}${m.trigger ? `@${m.trigger}` : ""}`))].join(", ")}`);
      }
      if (scen.length > 20) log(`  … ${scen.length - 20} more steps (see the diff directory)`);
      for (const s of scen) {
        const ms = g.mismatches.filter((m) => m.scenario === s);
        writeStepDiff(report.run, ms.map((m) => ({ ...m, scenario: s })), null, null, null);
      }
      for (const a of g.actual || []) {
        if (!scen.includes(a.scenario)) continue;
        const ext = a.type === "application/zip" ? "zip" : /\.qif$/i.test(a.name) ? "qif" : "csv";
        priv.writePrivate(path.join(priv.privateDir("diff", report.run, ...a.scenario.split("/")), `replayed-${a.index}.${ext}`), Buffer.from(a.bytes));
      }
    }
    report.totals = { ...total, ms: Date.now() - t0, childMs: Date.now() - t2 };
    log(`replay total: ${total.pages} pages, ${total.steps} steps, ${total.records} downloads (${total.zips} zips, ${total.entries} entries): `
      + `${total.real ? `${total.real} MISMATCHES` : "0 mismatches"}, ${total.drift} ICU drift`
      + `${total.errorPages ? `, ${total.errorPages} golden pages with capture errors not run` : ""}${total.unmodelled ? `, ${total.unmodelled} unmodelled steps` : ""}`
      + `${total.incompleteEnvs ? `; INCOMPLETE in ${total.incompleteEnvs} environments` : ""}; ${secs(Date.now() - t0)}`);
  });
  return ok;
}

// ---------------------------------------------------------------- main

async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(e.message);
      console.error("usage: node test/golden/run.js determinism|capture|compare|live|canary|baseline|extract|replay [options] (see the header of this file)");
      return 1;
    }
    throw e;
  }
  if (opts.oldRoot) process.env.S2C_OLD_ROOT = path.resolve(opts.oldRoot);
  const started = new Date();
  const run = `${started.toISOString().replace(/[:.]/g, "-")}-${opts.command}`;
  // The browser's profile and downloads hold private data: keep them inside <private-dir>.
  const tmp = priv.privateDir("tmp", run);
  fs.mkdirSync(tmp, { recursive: true, mode: 0o700 });
  for (const k of ["TMPDIR", "TMP", "TEMP"]) process.env[k] = tmp;
  const report = { run, command: opts.command, tier: opts.tier, providers: [], started: started.toISOString() };
  let ok = false;
  let code = 1;
  try {
    const fn = { baseline: cmdBaseline, capture: cmdCapture, determinism: cmdDeterminism, compare: cmdCompare, live: cmdLive, canary: cmdCanary, extract: cmdExtract, replay: cmdReplay }[opts.command];
    ok = await fn(opts, report);
    code = ok ? 0 : 1;
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(e.message);
      code = 1;
    } else {
      console.error(`FAILED: ${redact(describeError(e))}`);
      report.error = describeError(e);
      if (opts.verbose && e && e.stack) console.error(e.stack);
      code = 1;
    }
  } finally {
    report.finished = new Date().toISOString();
    report.ok = code === 0;
    try {
      priv.writePrivate(priv.privateDir("reports", `${run}.json`), `${JSON.stringify(report, null, 2)}\n`);
      log(`report: <private-dir>/reports/${run}.json`);
    } catch (e) {
      console.error(`could not write the report: ${describeError(e)}`);
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return code;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }, (e) => {
    console.error(`FAILED: ${redact(describeError(e))}`);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  runPage,
  passThrough,
  makeTables,
  compactStep,
  expandStep,
  goldenPage,
  manifestStats,
  manifestText,
  compareStrict,
  inputsSha12,
  FORMAT,
  main,
  // The replay command's helpers (test/unit/replay.test.js).
  replayHelpers: { goldenPaths, chunkPages, throwProblems, replayPages, captureErrorProblem },
  // The new-page-only scenarios (test/unit/golden.test.js).
  newOnlyHelpers: { isNewOnly, inspectNewOnly, newOnlyStepProblems, checkNewOnly },
  // Console redaction (test/unit/replay.test.js).
  consoleHelpers: { redact, notePrivate },
  // The listing of W2's uses and the summary of its requirement (test/unit/golden.test.js).
  waiverHelpers: { w2Uses, w2CheckSummary, comparisonCtx },
};
