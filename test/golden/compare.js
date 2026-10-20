// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Comparison of the golden harness (docs/TESTING.md, comparison and waivers). Pure functions
// over expanded steps (see run.js for how manifests store them):
//   step = {key, act, busy?, threw?, mode, range, order: [path], storage: {[key]: string|null},
//           lsKeys: [key], ui: UiSnapshot, records: CaptureRecord[], passthrough?}
// Every mismatch is structured. Download mismatches have the frozen shape
// {index, trigger, field, expected, actual} (plus `entry` for zip entries), which the canary
// checks (G1b) and Node replay use too; comparePage adds {page, step, scenario, category}.
//
// Two modes:
//   strict  two runs of the same old page (G1 determinism): everything must be identical,
//           no waiver applies;
//   golden  an old page's golden against a new page: the waivers of waivers.js apply, new-page
//           errors must not exceed the old page's, and only frozen storage keys may be written.
//           On a statement app (ctx.w2Required) W2 is also required where the old page threw
//           (PageComparison): its absence is a "w2" mismatch.
//
// The console never prints `expected` or `actual` (they may hold private data); they go to the
// private diff directory.
"use strict";

const canon = require("../lib/canon.js");
const { isPdfWorkerFallback } = require("../lib/capture.js");
const waivers = require("./waivers.js");

const same = (a, b) => canon(a === undefined ? null : a) === canon(b === undefined ? null : b);
const RECORD_FIELDS = ["trigger", "account", "card", "kind", "name", "type", "size", "sha256"];
const ENTRY_FIELDS = ["name", "size", "crc32", "sha256", "dosTime", "dosDate"];
const ENTRY_IDENTITY = ["name", "size", "crc32", "sha256"];
const UI_FIELDS = ["status", "cards", "diagnostics", "config", "configCount", "from", "to", "modes", "modeFieldHidden",
  "emptyHidden", "resultsHidden", "busyHidden", "busyText", "toolbar"];
const UI_HTML = ["status", "cards", "diagnostics", "config"];

const entryKey = (e) => ENTRY_IDENTITY.map((f) => String(e[f])).join("\u0000");
const isZipRecord = (r) => !!r && !r.disabled && (Array.isArray(r.entries) || r.type === "application/zip");

// Zip entries of one record pair. Equal entry sets in another order give one entries.order
// mismatch (positional name, size, CRC and hash differences are then implied, not reported);
// DOS times are compared entry by entry, matched by identity. Different sets give entries.set
// (and entries.count) plus every positional difference.
function compareEntries(ea, eb, base) {
  const out = [];
  if (!Array.isArray(ea) || !Array.isArray(eb)) {
    if (Array.isArray(ea) !== Array.isArray(eb)) out.push({ ...base, field: "entries", expected: Array.isArray(ea) ? ea.length : null, actual: Array.isArray(eb) ? eb.length : null });
    return out;
  }
  const ka = ea.map(entryKey);
  const kb = eb.map(entryKey);
  const sortedA = ka.slice().sort();
  const sortedB = kb.slice().sort();
  if (canon(sortedA) === canon(sortedB)) {
    if (canon(ka) !== canon(kb)) out.push({ ...base, field: "entries.order", expected: ea.map((e) => e.name), actual: eb.map((e) => e.name) });
    const used = new Set();
    ea.forEach((e, k) => {
      let j = -1;
      for (let x = 0; x < eb.length; x++) {
        if (!used.has(x) && kb[x] === ka[k]) {
          j = x;
          break;
        }
      }
      used.add(j);
      for (const f of ["dosTime", "dosDate"]) {
        if (eb[j][f] !== e[f]) out.push({ ...base, entry: k, entryName: e.name, field: `entries.${f}`, expected: e[f], actual: eb[j][f] });
      }
    });
    return out;
  }
  if (ea.length !== eb.length) out.push({ ...base, field: "entries.count", expected: ea.length, actual: eb.length });
  const missing = [];
  const extra = kb.slice();
  for (const k of ka) {
    const at = extra.indexOf(k);
    if (at >= 0) extra.splice(at, 1);
    else missing.push(k);
  }
  out.push({ ...base, field: "entries.set", expected: missing.map((k) => k.split("\u0000")[0]), actual: extra.map((k) => k.split("\u0000")[0]) });
  for (let k = 0; k < Math.min(ea.length, eb.length); k++) {
    for (const f of ENTRY_FIELDS) {
      if (ea[k][f] !== eb[k][f]) out.push({ ...base, entry: k, entryName: ea[k].name, field: `entries.${f}`, expected: ea[k][f], actual: eb[k][f] });
    }
  }
  return out;
}

// compareRecords(captured, replayed) -> Mismatch[] {index, trigger, field, expected, actual}.
// Records are compared position by position; `card` only when both sides have it (replay has
// no card titles). Each mismatch also names the captured record (`name`, `kind`, `account`) so
// that checks can tell card files from toolbar files.
function compareRecords(captured, replayed) {
  const a = Array.isArray(captured) ? captured : [];
  const b = Array.isArray(replayed) ? replayed : [];
  const out = [];
  if (a.length !== b.length) {
    const at = Math.min(a.length, b.length);
    const r = a[at] || b[at];
    out.push({ index: at, trigger: r ? r.trigger : null, field: "count", expected: a.length, actual: b.length });
  }
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    const base = { index: i, trigger: x.trigger, record: x.disabled ? null : x.name, kind: x.kind, account: x.account };
    for (const f of ["trigger", "account", "kind"]) if (!same(x[f], y[f])) out.push({ ...base, field: f, expected: x[f], actual: y[f] });
    if ("card" in x && "card" in y && !same(x.card, y.card)) out.push({ ...base, field: "card", expected: x.card, actual: y.card });
    if (!!x.disabled !== !!y.disabled) {
      out.push({ ...base, field: "disabled", expected: !!x.disabled, actual: !!y.disabled });
      continue;
    }
    if (x.disabled) continue;
    for (const f of ["name", "type", "size", "sha256"]) if (!same(x[f], y[f])) out.push({ ...base, field: f, expected: x[f], actual: y[f] });
    if (!same(x.zipError || null, y.zipError || null)) out.push({ ...base, field: "zipError", expected: x.zipError || null, actual: y.zipError || null });
    if (x.entries || y.entries) out.push(...compareEntries(x.entries || null, y.entries || null, base));
  }
  return out;
}

// compareUi(expected, actual, {legacyDom, w2}) -> {mismatches: [{field, expected, actual}], used: [waiver ids],
//   w2: [parts]}. legacyDom: W3 maps the old page's markup. w2: "throwing" | "after" | null; the
//   parts W2 covered: "busy line" (busyHidden, busyText) and "error line" (the status).
function compareUi(g, c, { legacyDom = null, w2 = null } = {}) {
  const mismatches = [];
  const used = new Set();
  const parts = new Set();
  const gx = { ...(g || {}) };
  const cx = { ...(c || {}) };
  if (legacyDom) {
    for (const k of UI_HTML) {
      const mapped = waivers.normaliseUiPart(gx[k], { legacyDom });
      if (mapped !== gx[k] && same(mapped, cx[k]) && !same(gx[k], cx[k])) used.add("W3");
      gx[k] = mapped;
    }
  }
  if (w2) {
    for (const k of ["busyHidden", "busyText"]) {
      if (!same(gx[k], cx[k])) {
        used.add("W2");
        parts.add("busy line");
      }
      gx[k] = null;
      cx[k] = null;
    }
    if (w2 === "throwing") {
      const stripped = waivers.stripW2Status(cx.status, gx.status);
      if (stripped !== cx.status) {
        used.add("W2");
        parts.add("error line");
      }
      cx.status = stripped;
    }
  }
  for (const k of UI_FIELDS) if (!same(gx[k], cx[k])) mismatches.push({ field: `ui.${k}`, expected: gx[k] === undefined ? null : gx[k], actual: cx[k] === undefined ? null : cx[k] });
  return { mismatches, used: [...used], w2: [...parts] };
}

// Multiset difference: the entries of `b` that `a` does not account for.
function extraEntries(a, b) {
  const left = a.slice();
  const out = [];
  for (const x of b) {
    const at = left.indexOf(x);
    if (at >= 0) left.splice(at, 1);
    else out.push(x);
  }
  return out;
}

// Page errors. strict: identical lists. golden: the new page may log the pdf.js worker
// fallback (the same pdf.js set-up on file://), and otherwise only entries the old page logged
// in the same page instance; CSP violations are never allowed.
function comparePageErrors(g, c, { mode = "golden" } = {}) {
  const ge = g || { console: [], errors: [], violations: [] };
  const ce = c || { console: [], errors: [], violations: [] };
  const out = [];
  if (mode === "strict") {
    for (const k of ["console", "errors", "violations"]) if (!same(ge[k], ce[k])) out.push({ field: `errors.${k}`, expected: ge[k], actual: ce[k] });
    return out;
  }
  if (ce.violations.length) out.push({ field: "errors.violations", expected: [], actual: ce.violations });
  const errs = extraEntries(ge.errors.filter((e) => !isPdfWorkerFallback(e)), ce.errors.filter((e) => !isPdfWorkerFallback(e)));
  if (errs.length) out.push({ field: "errors.errors", expected: [], actual: errs });
  const cons = extraEntries(ge.console, ce.console);
  if (cons.length) out.push({ field: "errors.console", expected: [], actual: cons });
  return out;
}

// compareStep(g, c, ctx) -> {mismatches, used, w2}. ctx: {mode, legacyDom, keys: [allowed storage
// keys], w2, sx1}. Mismatches carry a category; w2 lists the parts W2 covered on the step ("busy
// line": the settle state, busyHidden or busyText; "error line": the status), in that order.
// ctx.sx1 (an SX1 page): the downloads are not compared with the old page's; a function
// sx1(g, c) returning the replay check's mismatches takes their place, and without one the step
// fails. run.js checks S-break, SX1's only scenario, on the new page alone instead
// (checkNewOnly), so this path only keeps a golden that holds such a page from passing
// unchecked.
function compareStep(g, c, ctx = {}) {
  const mode = ctx.mode || "golden";
  const out = [];
  const used = new Set();
  const w2 = new Set();
  const add = (category, m) => out.push({ category, ...m });
  if (!same(g.act, c.act)) add("act", { field: "act", expected: g.act, actual: c.act });
  if (!(ctx.w2 === "throwing" && g.busy === "stuck" && c.busy === "idle") && !same(g.busy || null, c.busy || null)) {
    add("busy", { field: "busy", expected: g.busy || null, actual: c.busy || null });
  } else if (ctx.w2 === "throwing" && g.busy !== c.busy) {
    used.add("W2");
    w2.add("busy line");
  }
  if (!same(g.order, c.order)) add("order", { field: "order", expected: g.order, actual: c.order });
  const keys = [...new Set([...Object.keys(g.storage || {}), ...Object.keys(c.storage || {})])];
  for (const k of keys) {
    const gv = (g.storage || {})[k];
    const cv = (c.storage || {})[k];
    if (!same(gv === undefined ? null : gv, cv === undefined ? null : cv)) add("storage", { field: `storage.${k}`, expected: gv === undefined ? null : gv, actual: cv === undefined ? null : cv });
  }
  if (mode === "strict") {
    if (!same(g.lsKeys, c.lsKeys)) add("keys", { field: "lsKeys", expected: g.lsKeys, actual: c.lsKeys });
    if (!!g.threw !== !!c.threw) add("threw", { field: "threw", expected: !!g.threw, actual: !!c.threw });
    if (!same(g.passthrough === undefined ? null : g.passthrough, c.passthrough === undefined ? null : c.passthrough)) {
      add("passthrough", { field: "passthrough", expected: g.passthrough === undefined ? null : g.passthrough, actual: c.passthrough === undefined ? null : c.passthrough });
    }
  } else if (Array.isArray(ctx.keys)) {
    const allowed = new Set(ctx.keys);
    const extra = (c.lsKeys || []).filter((k) => !allowed.has(k));
    if (extra.length) add("keys", { field: "lsKeys", expected: [...allowed], actual: extra });
  }
  if (!same(g.mode, c.mode)) add("ui", { field: "mode", expected: g.mode, actual: c.mode });
  if (!same(g.range, c.range)) add("ui", { field: "range", expected: g.range, actual: c.range });
  const ui = compareUi(g.ui, c.ui, mode === "strict" ? {} : { legacyDom: ctx.legacyDom || null, w2: ctx.w2 || null });
  for (const m of ui.mismatches) add("ui", m);
  for (const w of ui.used) used.add(w);
  for (const p of ui.w2 || []) w2.add(p);
  if (mode !== "strict" && ctx.sx1) {
    used.add("SX1");
    const extraCheck = typeof ctx.sx1 === "function" ? ctx.sx1(g, c) : null;
    if (!Array.isArray(extraCheck)) add("sx1", { field: "sx1", expected: "replay of the downloads hook", actual: "not available" });
    else for (const m of extraCheck) add("sx1", m);
  } else {
    for (const m of compareRecords(g.records, c.records)) add("downloads", m);
  }
  return { mismatches: out, used: [...used], w2: ["busy line", "error line"].filter((p) => w2.has(p)) };
}

// The W2 parts a statement app from M9 on must show on a W2 step of a page whose old page threw
// (design §8.1 M9, G8: "the busy line and the error line"): the error line on the throwing step,
// and the busy line wherever the old page's busy line shows (stuck after the throwing load, so
// on that step and every later one), since the new page clears it. g is the golden step, kind
// "throwing" or "after".
function w2Needs(g, kind) {
  const busyShown = g.busy === "stuck" || !!(g.ui && g.ui.busyHidden === false);
  return [...(busyShown ? ["busy line"] : []), ...(kind === "throwing" ? ["error line"] : [])];
}

// PageComparison: one page instance, compared step by step as the candidate runs.
//   new PageComparison(gPage, ctx); gPage = {id, c, keys: [step key], step(key) -> expanded
//   golden step, errors, static?}; ctx = {mode, legacyDom, keys: [allowed storage keys], sx1,
//   w2Required}.
//   .step(cStep) -> {mismatches, uses}; .finish({error, errors, static, keys}) -> {mismatches, uses,
//   w2Check}. A use is {waiver, page, step}; a W2 use also names its parts (compareStep).
// W2 applies (golden mode, eligible pages only) from the first golden step where the old page
// threw onwards. With ctx.w2Required (run.js sets it for statement apps: their catch is M9's)
// W2 is also a requirement on such a page: every W2 step must list the parts of w2Needs, or the
// page fails with a "w2" mismatch per step that lacks one. A new page that throws as the old one
// did (no catch), or catches but shows no error line, or keeps its busy line, therefore fails
// the comparison itself. w2Check is {page, steps, ok} for a required page, else null.
class PageComparison {
  constructor(gPage, ctx = {}) {
    this.g = gPage;
    this.ctx = ctx;
    this.mode = ctx.mode || "golden";
    this.seen = [];
    this.w2 = new Map();
    if (this.mode !== "strict" && waivers.w2Eligible(gPage)) {
      let threw = false;
      for (const key of gPage.keys) {
        const s = gPage.step(key);
        if (s.threw && !threw) this.w2.set(key, "throwing");
        else if (threw) this.w2.set(key, "after");
        if (s.threw) threw = true;
      }
    }
    this.w2Required = this.mode !== "strict" && !!ctx.w2Required && this.w2.size > 0;
    this.w2Parts = new Map();
    this.sx1 = this.mode !== "strict" && waivers.sx1Applies(gPage) ? (ctx.sx1 || true) : null;
  }

  tag(step, list) {
    return list.map((m) => ({ page: this.g.id, step, scenario: step ? `${this.g.id}/${step}` : this.g.id, ...m }));
  }

  step(c) {
    this.seen.push(c.key);
    if (!this.g.keys.includes(c.key)) return { mismatches: this.tag(c.key, [{ category: "steps", field: "step", expected: null, actual: c.key }]), uses: [] };
    const g = this.g.step(c.key);
    const r = compareStep(g, c, { mode: this.mode, legacyDom: this.ctx.legacyDom, keys: this.ctx.keys, w2: this.w2.get(c.key) || null, sx1: this.sx1 });
    if (this.w2.has(c.key)) this.w2Parts.set(c.key, r.w2);
    return { mismatches: this.tag(c.key, r.mismatches), uses: r.used.map((w) => ({ waiver: w, page: this.g.id, step: c.key, ...(w === "W2" ? { parts: r.w2 } : {}) })) };
  }

  // The W2 requirement (ctx.w2Required): one "w2" mismatch per W2 step without the parts it
  // needs; a step the new page never reached lacks them all (the step list fails too).
  w2Requirement() {
    const out = [];
    for (const [key, kind] of this.w2) {
      const need = w2Needs(this.g.step(key), kind);
      const parts = this.w2Parts.get(key) || [];
      if (need.some((p) => !parts.includes(p))) {
        out.push(...this.tag(key, [{ category: "w2", field: kind === "throwing" ? "w2.throwing" : "w2.after", expected: need, actual: parts }]));
      }
    }
    return out;
  }

  finish(c) {
    const out = [];
    const uses = [];
    if (c.error) out.push(...this.tag(null, [{ category: "page", field: "error", expected: null, actual: c.error }]));
    if (!same(this.g.keys, this.seen)) out.push(...this.tag(null, [{ category: "steps", field: "steps", expected: this.g.keys, actual: this.seen }]));
    out.push(...this.tag(null, comparePageErrors(this.g.errors, c.errors, { mode: this.mode }).map((m) => ({ category: "errors", ...m }))));
    if (this.g.static !== undefined || c.static !== undefined) {
      const raw = this.g.static === undefined ? null : this.g.static;
      const gs = this.mode === "strict" || raw === null ? raw : waivers.normaliseStatic(raw, { legacyDom: this.ctx.legacyDom || null });
      const cs = c.static === undefined ? null : c.static;
      if (!same(gs, cs)) out.push(...this.tag("@open", [{ category: "static", field: "static", expected: gs, actual: cs }]));
      else if (this.mode !== "strict" && raw !== null) {
        const afterW1 = raw.split(waivers.W1.from).join(waivers.W1.to);
        if (afterW1 !== raw) uses.push({ waiver: "W1", page: this.g.id, step: "@open" });
        if (gs !== afterW1) uses.push({ waiver: "W3", page: this.g.id, step: "@open" });
      }
    }
    let w2Check = null;
    if (this.w2Required) {
      const missing = this.w2Requirement();
      out.push(...missing);
      w2Check = { page: this.g.id, steps: this.w2.size, ok: missing.length === 0 };
    }
    return { mismatches: out, uses, w2Check };
  }
}

// comparePage(gPage, cPage, ctx) -> {mismatches, uses, w2Check?}, over complete pages
// {id, c, steps: [expanded step], errors, static?, error?}; w2Check only on a required page.
function comparePage(gPage, cPage, ctx = {}) {
  const byKey = new Map(gPage.steps.map((s) => [s.key, s]));
  const pc = new PageComparison({ ...gPage, keys: gPage.steps.map((s) => s.key), step: (k) => byKey.get(k) }, ctx);
  const mismatches = [];
  const uses = [];
  for (const s of cPage.steps) {
    const r = pc.step(s);
    mismatches.push(...r.mismatches);
    uses.push(...r.uses);
  }
  const f = pc.finish(cPage);
  return { mismatches: [...mismatches, ...f.mismatches], uses: [...uses, ...f.uses], ...(f.w2Check ? { w2Check: f.w2Check } : {}) };
}

// ---- canaries (G1b): each must fail, in exactly the expected way.

const CANARIES = Object.freeze(["brand", "cent", "zip-order", "zip-time"]);

// checkCanary(name, {mismatches, goldenSteps}) -> {ok, problems: string[]}.
// mismatches: comparePage output over the canary page; goldenSteps: the compared golden steps.
function checkCanary(name, { mismatches, goldenSteps }) {
  const problems = [];
  const dl = mismatches.filter((m) => m.category === "downloads");
  const other = mismatches.filter((m) => m.category !== "downloads");
  if (!mismatches.length) problems.push("the comparison passed: the canary was not detected");
  if (other.length) problems.push(`unexpected ${[...new Set(other.map((m) => m.category))].join(", ")} mismatches (${other.length})`);
  const has = (pred) => dl.some(pred);
  const rec = (m) => `${m.scenario}#${m.index}`;
  const fieldsOf = (m) => new Set(dl.filter((x) => rec(x) === rec(m)).map((x) => `${x.field}${x.entry === undefined ? "" : `@${x.entry}`}`));
  const forbid = (fields, why) => {
    const bad = dl.filter((m) => fields.includes(m.field));
    if (bad.length) problems.push(`${why}: ${[...new Set(bad.map((m) => `${m.trigger}:${m.field}`))].join(", ")}`);
  };
  const steps = goldenSteps || [];
  const zips = [];
  for (const s of steps) (s.records || []).forEach((r, index) => { if (isZipRecord(r) && Array.isArray(r.entries)) zips.push({ step: s.key, index, r }); });

  if (name === "brand") {
    if (!has((m) => m.trigger === "accounts" && m.field === "name")) problems.push("no name mismatch on the Accounts CSV");
    if (!has((m) => m.trigger === "combined" && (m.field === "name" || m.field === "entries.name"))) problems.push("no name mismatch on the Combined download");
    if (!has((m) => m.trigger === "zip" && m.field === "sha256")) problems.push("no sha256 mismatch on Download all");
    if (!has((m) => m.trigger === "zip" && m.field === "entries.name")) problems.push("no entry-name mismatch on Download all");
    const cards = dl.filter((m) => m.trigger === "card");
    if (cards.length) problems.push(`card-file mismatches (${cards.length})`);
  } else if (name === "cent") {
    const cardHits = dl.filter((m) => m.trigger === "card" && m.field === "sha256" && /\.csv$/i.test(m.record || "")
      && !["name", "size"].some((f) => fieldsOf(m).has(f)));
    if (!cardHits.length) problems.push("no card CSV with a sha256 mismatch and equal name and size");
    const matched = cardHits.some((c) => dl.some((m) => m.trigger === "zip" && m.page === c.page && m.step === c.step && m.field === "entries.sha256" && m.entryName === c.record)
      && dl.some((m) => m.trigger === "zip" && m.page === c.page && m.step === c.step && m.field === "sha256"));
    if (!matched) problems.push("no Download-all entry and zip sha256 mismatch matching a changed card CSV");
    forbid(["name", "size", "count", "entries.name", "entries.size", "entries.count"], "name or size mismatches");
  } else if (name === "zip-order") {
    const multi = zips.filter((z) => z.r.entries.length >= 2 && new Set(z.r.entries.map(entryKey)).size >= 2);
    const hit = (z) => dl.some((m) => m.step === z.step && m.index === z.index && m.field === "entries.order")
      && dl.some((m) => m.step === z.step && m.index === z.index && m.field === "sha256");
    const allZip = multi.filter((z) => z.r.trigger === "zip");
    if (!allZip.length) problems.push("the goldens have no Download all with two or more entries");
    else if (!allZip.some(hit)) problems.push("no Download all with a sha256 and an entry-order mismatch");
    const missed = multi.filter((z) => z.r.trigger === "combined" && !hit(z));
    if (missed.length) problems.push(`two-file Combined zips without an entry-order mismatch (${missed.length})`);
    forbid(["name", "size", "count", "entries.set", "entries.count", "entries.name", "entries.size", "entries.crc32", "entries.sha256"], "name, size or entry-set mismatches");
  } else if (name === "zip-time") {
    if (!zips.length) problems.push("the goldens have no zip");
    if (!has((m) => isZipTrigger(m) && m.field === "sha256")) problems.push("no zip with a sha256 mismatch");
    let missing = 0;
    for (const z of zips) z.r.entries.forEach((e, k) => { if (!dl.some((m) => m.step === z.step && m.index === z.index && m.field === "entries.dosTime" && m.entry === k)) missing++; });
    if (missing) problems.push(`zip entries without a DOS time mismatch (${missing})`);
    forbid(["name", "size", "count", "entries.order", "entries.set", "entries.count", "entries.name", "entries.size", "entries.crc32", "entries.sha256"], "order, name, size or CRC mismatches");
  } else {
    problems.push(`unknown canary ${JSON.stringify(name)}`);
  }
  return { ok: problems.length === 0, problems };
}
const isZipTrigger = (m) => m.trigger === "zip" || m.trigger === "combined";

// ---- diff helpers (the files written to the private diff directory)

// The first n differing lines of two texts, with 1-based line numbers.
function firstDifferingLines(a, b, n = 3) {
  const A = String(a).split("\n");
  const B = String(b).split("\n");
  const out = [];
  for (let i = 0; i < Math.max(A.length, B.length) && out.length < n; i++) {
    if (A[i] !== B[i]) out.push({ line: i + 1, expected: A[i] === undefined ? null : A[i], actual: B[i] === undefined ? null : B[i] });
  }
  return out;
}

// One line per zip entry: index, name, size, CRC, DOS time and date.
function entryTable(entries) {
  return (entries || []).map((e, k) => `${k}\t${e.name}\t${e.size}\t${(e.crc32 >>> 0).toString(16).padStart(8, "0")}\t${e.dosTime}\t${e.dosDate}`);
}

// Counts of mismatches by category.
function countByCategory(mismatches) {
  const out = {};
  for (const m of mismatches) out[m.category] = (out[m.category] || 0) + 1;
  return out;
}

module.exports = {
  w2Needs,
  compareRecords,
  compareEntries,
  compareUi,
  comparePageErrors,
  compareStep,
  comparePage,
  PageComparison,
  CANARIES,
  checkCanary,
  firstDifferingLines,
  entryTable,
  countByCategory,
  isZipRecord,
  UI_FIELDS,
  RECORD_FIELDS,
};
