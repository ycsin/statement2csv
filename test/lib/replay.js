// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Node replay (docs/TESTING.md, browser extraction and Node replay; gates G3b and G4). Every
// captured step of a golden page is rebuilt in Node from the extracted statements and compared
// with the old page's downloads, record by record and field by field. Replay sees a provider
// only through its ProviderHandle; nothing here names one.
//
//   replayStep(handle, statementsByPath, step, {now, prevResult, memo}) -> {result, records, threw}
//     step = {config: string | null, mode, from, to, paths}. The statements are the step's paths
//     that have one (a file the page could not read has none and is dropped, as the page never
//     added it), in that order. No statement: no result, as the pages show none. Otherwise
//     result = handle.parse(statements, {config, mode}) with config read as loadConfig reads
//     storage; if parse throws, the previous result stays (or none), as the pages leave
//     state.result alone, and `threw` has the message. records are the downloads hook's list,
//     each a capture record without `card`: texts as UTF-8 bytes, file lists as
//     StatementZip.zipParts(files, now), hashed and unzipped exactly as test/lib/capture.js does.
//     Statements, configs and results are deep-frozen, so a parser or writer that mutates them
//     throws instead of passing unnoticed; that is what makes re-using a result for steps with
//     the same inputs (memo: a Map) the same as parsing again.
//   compareRecords(captured, replayed) -> Mismatch[] {index, trigger, field, expected, actual}:
//     test/golden/compare.js's, so replay and the browser comparison report alike.
//   toRecords(downloads, now) -> CaptureRecord[] without card
//   replayPage(handle, statementsByPath, page, {now, memo, configKey}) -> [{key, records, threw, error, unmodelled}]
//     page.steps as a golden page stores them, expanded: {key, act, mode, range: {from, to},
//     order: [path], storage: {[key]: string | null}, records}.
//     The config of a step is its stored string, which is what the page parses, with one
//     exception: when storage holds a JSON array, a configurator change gives the page's
//     in-memory array a named property that JSON.stringify drops, so storage no longer shows
//     the config the page parses. From such a change until a reset, the steps cannot be
//     rebuilt: each gets unmodelled: "config" (no records), comparePage counts it apart, and
//     the replay command fails the environment instead of reporting a false mismatch.
//   runJobs(jobs, {parallel, onDone}) -> Promise<results>: each job in a child process (this file
//     with --child) with TZ = the environment's time zone and LC_ALL = its locale ("sv_SE.UTF-8").
//     The child checks both variables and that Node resolves exactly that time zone (else the job
//     fails); when Node's ICU cannot provide the locale (new Intl.Collator() resolves another),
//     the job is skipped with that reason.
//   ICU drift (icuRecorder, answerInPage, chromeAnswers; the golden run's replay command drives
//     them): a mismatching page is replayed again while the ICU-dependent built-ins are recorded
//     (collation, case mapping outside ASCII, normalisation, locale formatting and the
//     time-zone getters of Date); Chrome, in a context with the environment's locale and time
//     zone, answers the same calls; the page is replayed once more with Chrome's answers. A
//     mismatch that disappears then is ICU drift (Node's ICU differs from Chrome's, and the
//     browser stays the authority); every other one is a real mismatch.
//
// The console is never written to; results go back to the caller, which keeps names and diffs
// in <private-dir>.
"use strict";

const crypto = require("crypto");
const path = require("path");
const { fork } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const canon = require("./canon.js");
const unzip = require("./unzip.js");
const { FIXED_TIME } = require("./browser.js");
const { compareRecords } = require("../golden/compare.js");

const MEMO_MAX = 32;
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const describe = (e) => (e && typeof e === "object" && "message" in e ? `${e.name || "Error"}: ${e.message}` : String(e));

// ---------------------------------------------------------------- one step

function deepFreeze(v) {
  if (v === null || typeof v !== "object" || Object.isFrozen(v)) return v;
  Object.freeze(v);
  for (const k of Object.keys(v)) deepFreeze(v[k]);
  return v;
}

// What loadConfig makes of the stored string: JSON.parse(s) || {}, or {} on any exception.
function parseConfig(s) {
  try {
    return JSON.parse(s) || {};
  } catch {
    return {};
  }
}

let coreZip = null;
const zipModule = () => coreZip || (coreZip = require(path.join(REPO, "core", "zip.js")));

function zipBytes(files, now) {
  const parts = zipModule().zipParts(files, now);
  return Buffer.concat(parts.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
}

function toRecords(list, now = new Date(FIXED_TIME)) {
  if (!Array.isArray(list)) throw new TypeError("the downloads hook must return an array");
  return list.map((d, i) => {
    const base = { trigger: d.trigger === undefined ? null : d.trigger, account: d.account === undefined ? null : d.account, kind: d.kind === undefined ? null : d.kind };
    if (d.disabled) return { ...base, disabled: true };
    let bytes;
    if (Array.isArray(d.files)) bytes = zipBytes(d.files, now);
    else if (typeof d.text === "string") bytes = Buffer.from(d.text, "utf8");
    else throw new TypeError(`download ${i} (${d.trigger}) has neither text nor files`);
    const rec = { ...base, name: d.name, type: d.type, size: bytes.length, sha256: sha256(bytes) };
    // As capture.js: a zip by type or by its first four bytes is unpacked, every CRC checked.
    const isZip = d.type === "application/zip" || (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04);
    if (isZip) {
      try {
        const entries = unzip(bytes);
        rec.entries = entries.map((e) => ({ name: e.name, size: e.size, crc32: e.crc32, sha256: e.sha256, dosTime: e.dosTime, dosDate: e.dosDate }));
        const bad = entries.filter((e) => !e.crcOk).length;
        if (bad) rec.zipError = `CRC mismatch in ${bad} entr${bad > 1 ? "ies" : "y"}`;
      } catch (e) {
        rec.zipError = describe(e);
      }
    }
    return rec;
  });
}

function memoSet(memo, key, value) {
  memo.set(key, value);
  while (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
}

function replayStep(handle, statementsByPath, step, { now = new Date(FIXED_TIME), prevResult = null, memo = null } = {}) {
  if (!handle || typeof handle.parse !== "function" || typeof handle.downloads !== "function") throw new TypeError("replayStep needs a ProviderHandle");
  if (!step || typeof step !== "object") throw new TypeError("replayStep needs a step");
  const paths = (step.paths || []).filter((p) => statementsByPath.has(p));
  const mode = step.mode === undefined ? null : step.mode;
  const config = step.config === undefined ? null : step.config;
  let result = null;
  let threw = null;
  if (paths.length) {
    const key = memo ? canon([paths, config, mode]) : null;
    let hit = memo ? memo.get(key) : undefined;
    if (!hit) {
      const statements = paths.map((p) => deepFreeze(statementsByPath.get(p)));
      try {
        hit = { result: deepFreeze(handle.parse(statements, { config: deepFreeze(parseConfig(config)), mode })) };
      } catch (e) {
        hit = { threw: describe(e) };
      }
      if (memo) memoSet(memo, key, hit);
    }
    if (hit.threw !== undefined) {
      threw = hit.threw;
      result = prevResult === undefined ? null : prevResult;
    } else {
      result = hit.result;
    }
  }
  const list = handle.downloads(result, { mode, from: step.from, to: step.to });
  return { result, records: toRecords(list, now), threw };
}

// ---------------------------------------------------------------- one page

function stepOf(s, configKey) {
  const storage = s.storage || {};
  const config = configKey && Object.prototype.hasOwnProperty.call(storage, configKey) ? storage[configKey] : null;
  return { config, mode: s.mode, from: s.range ? s.range.from : null, to: s.range ? s.range.to : null, paths: s.order || [] };
}

// The configurator operations of a step's actions (["config", op]).
const configOps = (act) => (Array.isArray(act) ? act.filter((op) => Array.isArray(op) && op[0] === "config") : []);

function replayPage(handle, statementsByPath, page, { now = new Date(FIXED_TIME), memo = null, configKey } = {}) {
  const key = configKey !== undefined ? configKey : handle.R && handle.R.storage ? handle.R.storage.configKey : null;
  let prev = null;
  let prevKnown = true; // false: the page's last result came from a config replay cannot know
  let unknown = false; // the page's config is not what storage shows (see the header)
  let stored = null; // the stored config string before the step
  const out = [];
  page.steps.forEach((s, k) => {
    const step = stepOf(s, key);
    const before = k === 0 ? step.config : stored;
    for (const [, op] of configOps(s.act)) {
      if (op && op.reset) unknown = false;
      else if (Array.isArray(parseConfig(before))) unknown = true;
    }
    stored = step.config;
    const unmodelled = { key: s.key, records: null, threw: null, error: null, unmodelled: "config", result: null, step };
    if (unknown) {
      prevKnown = false;
      out.push(unmodelled);
      return;
    }
    try {
      const r = replayStep(handle, statementsByPath, step, { now, prevResult: prev, memo });
      if (r.threw && !prevKnown) {
        // The page keeps its previous result when parse throws, and replay does not know it.
        out.push(unmodelled);
        return;
      }
      prev = r.result;
      prevKnown = true;
      out.push({ key: s.key, records: r.records, threw: r.threw, error: null, result: r.result, step });
    } catch (e) {
      out.push({ key: s.key, records: null, threw: null, error: describe(e), result: prev, step });
    }
  });
  return out;
}

// The bytes of one replayed download (for the private diff folder), or null.
function replayedBytes(handle, replayedStep, index, now = new Date(FIXED_TIME)) {
  const { result, step } = replayedStep;
  const d = handle.downloads(result, { mode: step.mode, from: step.from, to: step.to })[index];
  if (!d || d.disabled) return null;
  return Array.isArray(d.files) ? zipBytes(d.files, now) : Buffer.from(d.text, "utf8");
}

// Compares a replayed page with its golden steps: {mismatches, counts, threw}. counts.records,
// disabled, zips and entries count the golden records of the steps compared; an unmodelled step
// is counted in steps and in unmodelled, and nothing of it is compared.
function comparePage(page, replayed) {
  const mismatches = [];
  const threw = [];
  const counts = { steps: 0, records: 0, disabled: 0, zips: 0, entries: 0, unmodelled: 0 };
  page.steps.forEach((g, k) => {
    const r = replayed[k];
    const tag = { page: page.id, step: g.key, scenario: `${page.id}/${g.key}` };
    counts.steps++;
    if (r && r.key === g.key && r.unmodelled) {
      counts.unmodelled++;
      return;
    }
    for (const rec of g.records || []) {
      if (rec.disabled) counts.disabled++;
      else counts.records++;
      if (rec.entries) {
        counts.zips++;
        counts.entries += rec.entries.length;
      }
    }
    if (!r || r.key !== g.key) {
      mismatches.push({ ...tag, category: "steps", field: "step", expected: g.key, actual: r ? r.key : null });
      return;
    }
    if (r.threw) threw.push({ ...tag, message: r.threw });
    if (r.error) {
      mismatches.push({ ...tag, category: "replay", field: "error", expected: null, actual: r.error });
      return;
    }
    for (const m of compareRecords(g.records, r.records)) mismatches.push({ ...tag, category: "downloads", ...m });
  });
  return { mismatches, counts, threw };
}

// ---------------------------------------------------------------- ICU calls (the drift check)

// [type, prototype, methods]: the built-ins whose results come from ICU data or the time zone.
const ICU_METHODS = [
  ["String", String.prototype, ["localeCompare", "toLocaleUpperCase", "toLocaleLowerCase", "normalize", "toUpperCase", "toLowerCase"]],
  ["Number", Number.prototype, ["toLocaleString"]],
  ["Date", Date.prototype, ["toLocaleString", "toLocaleDateString", "toLocaleTimeString", "toString", "toDateString", "toTimeString",
    "getFullYear", "getMonth", "getDate", "getDay", "getHours", "getMinutes", "getSeconds", "getMilliseconds", "getTimezoneOffset"]],
];
const INTL_GETTERS = [["Collator", "compare"], ["NumberFormat", "format"], ["DateTimeFormat", "format"]];
// Case mapping and normalisation can only differ outside ASCII; those calls are not recorded.
const ASCII_SAFE = new Set(["normalize", "toUpperCase", "toLowerCase"]);
const ASCII = /^[\u0000-\u007f]*$/;

// install({answers}) patches the built-ins: each call is recorded as [key, call, nodeResult];
// with answers (Map key -> canon text), an answered call returns Chrome's answer instead and an
// unanswered one is recorded in `unanswered`. uninstall() restores everything.
function icuRecorder({ answers = null } = {}) {
  const calls = new Map();
  const unanswered = new Map();
  const saved = [];
  const stats = { unrecordable: 0 };
  let busy = false; // the recorder's own canon() calls are not recorded
  const quiet = (fn) => {
    busy = true;
    try {
      return fn();
    } finally {
      busy = false;
    }
  };
  const handleCall = (call, run) => {
    if (busy) return run();
    let key;
    try {
      key = quiet(() => canon(call));
    } catch {
      stats.unrecordable++; // an argument that is not plain data: run it, unrecorded
      return run();
    }
    if (answers && answers.has(key)) return quiet(() => canon.parse(answers.get(key)));
    const r = run();
    quiet(() => {
      const map = answers ? unanswered : calls;
      if (!map.has(key)) map.set(key, { call, node: canon(r) });
    });
    return r;
  };
  const selfOf = (type, v) => (type === "Date" ? Date.prototype.getTime.call(v) : type === "Number" ? Number(v) : String(v));
  return {
    install() {
      for (const [type, proto, methods] of ICU_METHODS) {
        for (const m of methods) {
          const orig = proto[m];
          saved.push(() => Object.defineProperty(proto, m, { value: orig, writable: true, configurable: true, enumerable: false }));
          const wrapped = {
            [m](...args) {
              const self = this;
              if (type === "String" && ASCII_SAFE.has(m) && ASCII.test(String(self))) return orig.apply(self, args);
              if (type === "Date" && !(self instanceof Date)) return orig.apply(self, args);
              return handleCall([type, m, selfOf(type, self), args], () => orig.apply(self, args));
            },
          }[m];
          Object.defineProperty(proto, m, { value: wrapped, writable: true, configurable: true, enumerable: false });
        }
      }
      for (const [ctor, getter] of INTL_GETTERS) {
        const proto = Intl[ctor].prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, getter);
        saved.push(() => Object.defineProperty(proto, getter, desc));
        Object.defineProperty(proto, getter, {
          configurable: true,
          enumerable: desc.enumerable,
          get() {
            const f = desc.get.call(this);
            const ro = this.resolvedOptions();
            return (...args) => handleCall([`Intl.${ctor}`, getter, ro, args.map((a) => (a instanceof Date ? a.getTime() : a))], () => f(...args));
          },
        });
      }
    },
    uninstall() {
      while (saved.length) saved.pop()();
    },
    calls,
    unanswered,
    stats,
  };
}

// Runs in Chrome (page.evaluate): the answer to each recorded call, as canonical text.
function answerInPage({ calls, canonSource }) {
  // eslint-disable-next-line no-new-func
  const canonFn = new Function("module", `${canonSource}\nreturn module.exports;`)({ exports: {} });
  const run = ([type, m, self, args]) => {
    if (type === "String") return String.prototype[m].apply(self, args);
    if (type === "Number") return Number.prototype[m].apply(self, args);
    if (type === "Date") return Date.prototype[m].apply(new Date(self), args);
    const ctor = type.slice(5);
    const f = new Intl[ctor](self.locale, self)[m];
    return f(...(ctor === "DateTimeFormat" ? args.map((a) => (typeof a === "number" ? new Date(a) : a)) : args));
  };
  return calls.map((c) => {
    try {
      return canonFn(run(c));
    } catch (e) {
      return canonFn({ error: String(e && e.message ? e.message : e) });
    }
  });
}

// ---------------------------------------------------------------- child processes

// A job: {id, parser, runtime, root, oldRoot, env: {id, locale, timezoneId}, cacheDir, allowed,
// readers, paths, pages, keepActual, icu: null | {record: true} | {answers: [[key, canonText]]}}.
// The statements come from the extraction cache only (offline); readers "node" reads CSV and
// XLSX with the Node twins instead (tests without Chrome).
async function runJob(job) {
  const t0 = Date.now();
  // The child must run with the environment's TZ and LC_ALL, and Node must resolve exactly that
  // time zone. A locale that Node's ICU cannot provide skips the environment with a warning.
  const lcAll = localeVar(job.env.locale);
  if (process.env.TZ !== job.env.timezoneId || process.env.LC_ALL !== lcAll) {
    throw new Error(`the replay child runs with TZ ${JSON.stringify(process.env.TZ)} and LC_ALL ${JSON.stringify(process.env.LC_ALL)}, not ${JSON.stringify(job.env.timezoneId)} and ${JSON.stringify(lcAll)}`);
  }
  const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone !== job.env.timezoneId) throw new Error(`Node resolves the time zone ${zone} for TZ ${job.env.timezoneId}`);
  const locale = new Intl.Collator().resolvedOptions().locale;
  if (locale !== job.env.locale) return { skipped: `Node's ICU cannot provide the locale ${job.env.locale} of ${job.env.id} (it resolves ${locale})` };
  // The provider tree (providers/, core/) is job.root; the test library is this one.
  const { loadNode } = require("./load-provider.js");
  const { extract } = require("./extract.js");
  const loaded = loadNode(job.id, { root: job.root || REPO, parser: job.parser, oldRoot: job.oldRoot, runtime: job.runtime || null });
  const ex = await extract(job.paths, { handle: loaded, readers: job.readers || "chrome", cacheDir: job.cacheDir, offline: true, allowed: job.allowed || [], oldRoot: job.oldRoot });
  for (const s of ex.byPath.values()) deepFreeze(s);
  const now = new Date(FIXED_TIME);
  const out = { pages: 0, parses: 0, counts: { steps: 0, records: 0, disabled: 0, zips: 0, entries: 0, unmodelled: 0 }, mismatches: [], threw: [], actual: [], icu: null };
  // The handle as replay calls it, counting the parses (the memo's misses).
  const handle = { ...loaded, parse: (...args) => { out.parses++; return loaded.parse(...args); } };
  let recorder = null;
  if (job.icu) {
    recorder = icuRecorder({ answers: job.icu.answers ? new Map(job.icu.answers) : null });
    recorder.install();
  }
  try {
    // The memo stays on while ICU calls are recorded or answered: a (paths, config, mode) key
    // parsed again would only repeat the calls already recorded, and under the same answers it
    // gives the same result. The downloads hook runs on every step either way.
    const memo = new Map();
    for (const page of job.pages) {
      const replayed = replayPage(handle, ex.byPath, page, { now, memo });
      const r = comparePage(page, replayed);
      out.pages++;
      for (const k of Object.keys(out.counts)) out.counts[k] += r.counts[k];
      out.mismatches.push(...r.mismatches);
      out.threw.push(...r.threw);
      // The replayed bytes of the first mismatching records, for the private diff folder.
      for (const m of r.mismatches) {
        if (out.actual.length >= (job.keepActual || 0) || m.category !== "downloads" || m.index === undefined) continue;
        if (out.actual.some((a) => a.scenario === m.scenario && a.index === m.index)) continue;
        const step = replayed.find((x) => x.key === m.step);
        const rec = step && step.records ? step.records[m.index] : null;
        const bytes = rec && !rec.disabled ? replayedBytes(handle, step, m.index, now) : null;
        if (bytes) out.actual.push({ scenario: m.scenario, index: m.index, trigger: m.trigger, name: rec.name, type: rec.type, bytes });
      }
    }
  } finally {
    if (recorder) recorder.uninstall();
  }
  if (recorder) {
    out.icu = {
      calls: [...recorder.calls].map(([key, v]) => [key, v.call, v.node]),
      unanswered: [...recorder.unanswered].map(([key, v]) => [key, v.call, v.node]),
      unrecordable: recorder.stats.unrecordable,
    };
  }
  out.ms = Date.now() - t0;
  return out;
}

function childMain() {
  process.once("message", (job) => {
    runJob(job).then(
      (r) => process.send({ ok: true, ...r }, () => process.exit(0)),
      (e) => process.send({ ok: false, error: describe(e), stack: e && e.stack ? String(e.stack) : null }, () => process.exit(1)),
    );
  });
}

// LC_ALL for a BCP 47 locale: "sv-SE" -> "sv_SE.UTF-8".
const localeVar = (locale) => `${locale.replace(/-/g, "_")}.UTF-8`;

// The child's environment: the parent's, with the time zone and locale of the scenario.
function childEnv(env) {
  const out = { ...process.env, TZ: env.timezoneId, LC_ALL: localeVar(env.locale) };
  delete out.NODE_TEST_CONTEXT;
  return out;
}

function runChild(job) {
  return new Promise((resolve) => {
    const child = fork(__filename, ["--child"], {
      env: childEnv(job.env),
      execArgv: [],
      serialization: "advanced",
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let reply = null;
    let stderr = "";
    child.stderr.on("data", (d) => {
      if (stderr.length < 65536) stderr += d;
    });
    child.on("message", (m) => {
      reply = m;
    });
    child.on("error", (e) => {
      if (!reply) reply = { ok: false, error: describe(e) };
    });
    child.on("exit", (code, signal) => {
      if (!reply) reply = { ok: false, error: `the replay child exited with ${signal || code} and no reply`, stderr };
      resolve(reply);
    });
    child.send(job);
  });
}

// runJobs(jobs, {parallel, onDone(job, result, index)}) -> results in job order.
async function runJobs(jobs, { parallel = 2, onDone = null } = {}) {
  const results = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      results[i] = await runChild(jobs[i]);
      if (onDone) onDone(jobs[i], results[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(parallel, jobs.length)) }, worker));
  return results;
}

// Chrome's answers to recorded ICU calls, in a context with the environment's locale and time
// zone: [[key, canonText]] in call order.
async function chromeAnswers(browser, env, calls) {
  const browserLib = require("./browser.js");
  const fs = require("fs");
  const context = await browserLib.newContext(browser, env, {});
  try {
    const tab = await context.newPage();
    const canonSource = fs.readFileSync(path.join(__dirname, "canon.js"), "utf8");
    const out = [];
    for (let i = 0; i < calls.length; i += 5000) {
      const chunk = calls.slice(i, i + 5000);
      const got = await tab.evaluate(answerInPage, { calls: chunk.map((c) => c[1]), canonSource });
      chunk.forEach((c, k) => out.push([c[0], got[k]]));
    }
    return out;
  } finally {
    await context.close().catch(() => {});
  }
}

// icuCheck(job, {answer, rounds}) -> {calls, differing, rounds, converged, mismatches}: the ICU
// drift check of one job's pages. The pages are replayed while the ICU calls are recorded;
// answer(calls) -> Promise<[[key, canonText]]> gives the reference answers (Chrome's, in the
// environment's locale and time zone). When some differ from Node's, the pages are replayed with
// the reference answers, asking again for calls not seen before, until none is new (converged)
// or `rounds` replays have run. mismatches: those of the converged replay (null otherwise).
async function icuCheck(job, { answer, rounds = 3 } = {}) {
  if (typeof answer !== "function") throw new TypeError("icuCheck needs an answer(calls) function");
  const [rec] = await runJobs([{ ...job, icu: { record: true } }], { parallel: 1 });
  if (!rec.ok || !rec.icu) throw new Error(`the ICU recording failed: ${rec.error || rec.skipped || "no calls"}`);
  const answers = new Map(await answer(rec.icu.calls));
  const out = { calls: rec.icu.calls.length, differing: rec.icu.calls.filter(([k, , node]) => answers.get(k) !== node).length, rounds: 0, converged: false, mismatches: null };
  if (!out.differing) return { ...out, converged: true, mismatches: rec.mismatches };
  for (let round = 1; round <= rounds; round++) {
    out.rounds = round;
    const [res] = await runJobs([{ ...job, icu: { answers: [...answers] } }], { parallel: 1 });
    if (!res.ok || !res.icu) throw new Error(`the ICU oracle replay failed: ${res.error || res.skipped}`);
    if (!res.icu.unanswered.length) return { ...out, converged: true, mismatches: res.mismatches };
    for (const [k, v] of await answer(res.icu.unanswered)) answers.set(k, v);
  }
  return out;
}

if (require.main === module && process.argv.includes("--child")) childMain();

module.exports = {
  replayStep,
  compareRecords,
  toRecords,
  replayPage,
  replayedBytes,
  comparePage,
  parseConfig,
  deepFreeze,
  runJob,
  runJobs,
  childEnv,
  icuRecorder,
  answerInPage,
  chromeAnswers,
  icuCheck,
};
