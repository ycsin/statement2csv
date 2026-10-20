// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Provider descriptors (docs/CONTRACT.md): defaults, validation (checks C01-C09) and the
// runtime object the build inlines as self.StatementProvider. Node only: never inlined.
//
//   normalize(D, frozen)        -> D with every default filled in (D itself is not changed).
//                                  D.ui is kept exactly as written: explicit ui values outrank
//                                  the legacy knobs, which outrank the core defaults, so the
//                                  ui defaults are applied by resolveRuntime.
//   validate(D, opts)           -> string[], each "<file>: [Cnn] <message>".
//   resolveRuntime(D)           -> the runtime object, keys in contract order.
//   checkFrozen(frozen, type)   -> string[]: frozen.js against FROZEN_SCHEMA (part of C05).
//   checkUnique(list)           -> string[]: C04 over every provider at once.
//   frozenType(D)               -> "statement" | "custom" | "custom-config".
//   overrideClosure(...)        -> string[]: C08b, also usable on its own.
"use strict";

const fs = require("fs");
const path = require("path");
const C = require("./constants.js");

const INPUTS = ["pdf", "csv", "xlsx"];
const USES = ["layout", "assemble"];
const TOOLBAR = ["accounts", "combined"];
const UI_DIAGNOSTICS = ["gaps", "late", "closed"];
const LEGACY_DIAGNOSTICS = ["reconciled", "gaps", "late", "closed"];
const UI_STATUS = ["statements", "statements+downloads"];
const NOTE_KEYS = Object.keys(C.DEFAULT_UI.notes);
const TEXT_KEYS = Object.keys(C.DEFAULT_UI.text);
const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const GLOBAL_RE = /^[A-Z][A-Za-z0-9]*$/;
const SLUG_RE = /^[a-z0-9-]+$/;
const MODE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const HEAD_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const REPO_RE = /^[A-Za-z0-9._-]+$/;

const TOP_KEYS = [
  "contract", "id", "name", "summary", "app", "appScript", "inputs", "multiple", "scripts",
  "parserScript", "parserGlobal", "uses", "exportOverrides", "pdf", "storage", "modes", "naming",
  "ui", "custom", "detect", "testing", "publish", "legacy",
];
const UI_KEYS = ["notes", "skipLabels", "skipDetailed", "diagnostics", "status", "text"];
const TESTING_KEYS = ["reconcile", "allowWarnings", "gapDrop", "fixtures"];

// ---------- small helpers ----------

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string";
const isNonEmptyStr = (v) => typeof v === "string" && v.length > 0;
const isStrArray = (v) => Array.isArray(v) && v.every(isStr);
const json = (v) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
const dupes = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);

// Copies plain objects and arrays; anything else (functions, Dates, ...) is kept by
// reference, so normalize never throws on input that validate is about to reject.
function clone(v) {
  if (Array.isArray(v)) return v.map(clone);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {};
    for (const k of Object.keys(v)) o[k] = clone(v[k]);
    return o;
  }
  return v;
}

// Order-insensitive structural equality of JSON-like values.
function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

// A provider-relative path: forward slashes, no empty, "." or ".." segment.
function isRelPath(p) {
  return isNonEmptyStr(p) && !p.startsWith("/") && !/[\\\0]/.test(p) &&
    p.split("/").every((s) => s && s !== "." && s !== ".." && /^[A-Za-z0-9._-]+$/.test(s));
}

function compiles(src) {
  try {
    new RegExp(src);
    return true;
  } catch {
    return false;
  }
}

// C02: data only. A JSON round trip must give the same value, and no property may be an
// accessor (a getter would survive the round trip).
function dataOnlyProblems(value, where = "provider.js") {
  const out = [];
  const walk = (v, at) => {
    if (v === null || typeof v !== "object") return;
    for (const k of Object.getOwnPropertyNames(v)) {
      const d = Object.getOwnPropertyDescriptor(v, k);
      if (d && (d.get || d.set)) out.push(`${at}.${k} is an accessor (getter/setter); descriptors are plain data`);
      else if (d) walk(d.value, `${at}.${k}`);
    }
  };
  walk(value, "module.exports");
  let same = false;
  try {
    same = strictEqual(JSON.parse(JSON.stringify(value)), value);
  } catch (e) {
    out.push(`cannot be written as JSON: ${e.message}`);
    return out.map((m) => `${where}: [C02] ${m}`);
  }
  if (!same) out.push("is not plain data: a JSON round trip changes it (functions, Dates, RegExps, undefined, NaN, -0 or non-plain objects)");
  return out.map((m) => `${where}: [C02] ${m}`);
}

// Strict structural equality (prototypes, -0 and NaN distinguished, key order ignored).
function strictEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && Object.keys(a).length === Object.keys(b).length && a.every((x, i) => strictEqual(x, b[i]));
  const ka = Object.keys(a), kb = Object.keys(b);
  if (Object.getOwnPropertySymbols(a).length || Object.getOwnPropertySymbols(b).length) return false;
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && strictEqual(a[k], b[k]));
}

// ---------- normalize ----------

function normalize(D /* , frozen: reserved, defaults do not depend on it */) {
  const d = isObj(D) ? clone(D) : {};
  const id = d.id;
  if (d.app === undefined) d.app = "statement";
  const custom = d.app === "custom";
  if (custom && d.appScript === undefined) d.appScript = "app.js";
  if (d.multiple === undefined) d.multiple = true;
  if (d.scripts === undefined) d.scripts = ["parser.js"];
  if (d.parserScript === undefined) d.parserScript = "parser.js";
  if (d.uses === undefined) d.uses = [];
  if (d.exportOverrides === undefined) d.exportOverrides = [];
  if (d.pdf === undefined) d.pdf = {};
  if (isObj(d.pdf) && d.pdf.pageTransform === undefined) d.pdf.pageTransform = null;
  if (d.storage === undefined) d.storage = {};
  if (isObj(d.storage)) {
    if (d.storage.modeKey === undefined) d.storage.modeKey = `${id}-csv-mode`;
    if (d.storage.configKey === undefined) d.storage.configKey = custom ? null : `${id}-csv-accounts`;
  }
  if (!custom) d.modes = clone(C.LEDGER_MODES);
  if (d.naming === undefined) d.naming = {};
  if (isObj(d.naming)) {
    if (d.naming.accountPrefix === undefined) d.naming.accountPrefix = "";
    if (d.naming.brand === undefined) d.naming.brand = d.name;
    if (d.naming.groupNoun === undefined) d.naming.groupNoun = "accounts";
    if (d.naming.slug === undefined) d.naming.slug = id;
  }
  if (!custom && d.ui === undefined) d.ui = {};
  if (custom) {
    if (d.custom === undefined) d.custom = {};
    if (isObj(d.custom)) {
      if (d.custom.toolbar === undefined) d.custom.toolbar = [];
      if (d.custom.config === undefined) d.custom.config = false;
    }
  }
  if (d.detect === undefined) d.detect = null;
  if (d.testing === undefined) d.testing = {};
  if (isObj(d.testing)) {
    if (d.testing.reconcile === undefined) d.testing.reconcile = custom ? "custom" : "statement";
    if (d.testing.allowWarnings === undefined) d.testing.allowWarnings = false;
    if (d.testing.gapDrop === undefined) d.testing.gapDrop = !custom;
    if (d.testing.fixtures === undefined) d.testing.fixtures = null;
  }
  if (d.publish === undefined) d.publish = true;
  return d;
}

// ---------- runtime object ----------

const RUNTIME_LEGACY = ["busyNoun", "status", "openingsCurrency", "diagnostics", "hideModeWithoutInvestments",
  "kindModel", "extraWarnings", "unmappedNoun", "skippedOwner"];

// core defaults < legacy.preset < explicit legacy.* < explicit ui.*
function resolveUi(ui, legacy) {
  const u = clone(C.DEFAULT_UI);
  const lg = isObj(legacy) ? legacy : {};
  if (lg.preset === "gen1") {
    const p = C.GEN1_PRESET;
    for (const k of ["busyNoun", "status", "openingsCurrency", "diagnostics"]) u[k] = clone(p[k]);
    Object.assign(u.text, clone(p.text));
  }
  for (const k of RUNTIME_LEGACY) if (lg[k] !== undefined) u[k] = clone(lg[k]);
  const x = isObj(ui) ? ui : {};
  if (isObj(x.notes)) for (const k of NOTE_KEYS) if (x.notes[k] !== undefined) u.notes[k] = x.notes[k];
  if (x.skipLabels !== undefined) u.skipLabels = clone(x.skipLabels);
  if (x.skipDetailed !== undefined) u.skipDetailed = clone(x.skipDetailed);
  if (x.diagnostics !== undefined) u.diagnostics = clone(x.diagnostics);
  if (x.status !== undefined) u.status = x.status;
  if (isObj(x.text)) for (const k of TEXT_KEYS) if (x.text[k] !== undefined) u.text[k] = x.text[k];
  return u;
}

function resolveRuntime(D) {
  const d = normalize(D);
  const pick = (o, keys) => {
    const src = isObj(o) ? o : {};
    const out = {};
    for (const k of keys) out[k] = clone(src[k]);
    return out;
  };
  const R = {
    id: d.id,
    app: d.app,
    inputs: clone(d.inputs),
    multiple: d.multiple,
    parserGlobal: d.parserGlobal,
    pdf: pick(d.pdf, ["pageTransform"]),
    storage: pick(d.storage, ["modeKey", "configKey"]),
    modes: (Array.isArray(d.modes) ? d.modes : []).map((m) => pick(m, ["id", "label"])),
    naming: pick(d.naming, ["accountPrefix", "brand", "groupNoun", "slug"]),
  };
  if (d.app !== "custom") R.ui = resolveUi(d.ui, d.legacy);
  return R;
}

// ---------- frozen.js ----------

function frozenType(D) {
  const d = normalize(D);
  if (d.app === "custom") return isObj(d.custom) && d.custom.config === true ? "custom-config" : "custom";
  return "statement";
}

// The FROZEN_SCHEMA part of C05: keys, types and the per-type null rules.
function checkFrozen(frozen, type) {
  const out = [];
  const S = C.FROZEN_SCHEMA;
  const T = S.types[type];
  if (!T) return [`frozen.js: [C05] unknown app type ${json(type)}`];
  if (!isObj(frozen)) return ["frozen.js: [C05] must export a plain object"];
  const allowed = new Set([...S.common, "kindModel", ...S.legacy]);
  for (const k of Object.keys(frozen)) if (!allowed.has(k)) out.push(`unknown key ${json(k)}`);
  for (const k of S.common) if (!(k in frozen)) out.push(`missing required key ${json(k)}`);
  const st = frozen.storage;
  if ("storage" in frozen) {
    if (!isObj(st)) out.push("storage must be an object {modeKey, configKey}");
    else {
      for (const k of Object.keys(st)) if (k !== "modeKey" && k !== "configKey") out.push(`unknown key storage.${k}`);
      if (!isNonEmptyStr(st.modeKey)) out.push("storage.modeKey must be a non-empty string");
      if (!("configKey" in st)) out.push("missing required key storage.configKey");
      else if (T.configurator ? !isNonEmptyStr(st.configKey) : st.configKey !== null) {
        out.push(`storage.configKey must be ${T.configurator ? "a non-empty string" : "null"} for app type ${type}`);
      }
    }
  }
  if ("modeValues" in frozen && !(isStrArray(frozen.modeValues) && frozen.modeValues.length)) out.push("modeValues must be a non-empty string array");
  if ("configKinds" in frozen) {
    if (T.configurator ? !isStrArray(frozen.configKinds) : frozen.configKinds !== null) {
      out.push(`configKinds must be ${T.configurator ? "a string array" : "null"} for app type ${type}`);
    }
  }
  if ("configIdPattern" in frozen) {
    const p = frozen.configIdPattern;
    if (T.configurator) {
      if (!isNonEmptyStr(p)) out.push("configIdPattern must be a regex source string");
      else if (!compiles(p)) out.push(`configIdPattern does not compile: ${json(p)}`);
    } else if (p !== null) out.push(`configIdPattern must be null for app type ${type}`);
  }
  if ("naming" in frozen) {
    const n = frozen.naming;
    if (!isObj(n)) out.push("naming must be an object");
    else {
      const ok = new Set([...T.naming.required, ...T.naming.optional]);
      for (const k of Object.keys(n)) if (!ok.has(k)) out.push(`unknown key naming.${k}`);
      for (const k of T.naming.required) if (!(k in n)) out.push(`missing required key naming.${k}`);
      for (const [k, v] of Object.entries(n)) if (!isStr(v)) out.push(`naming.${k} must be a string`);
    }
  }
  const hasLegacy = S.legacy.filter((k) => k in frozen);
  if (hasLegacy.length && hasLegacy.length !== S.legacy.length) {
    out.push(`${S.legacy.join(", ")} come together or not at all (missing: ${S.legacy.filter((k) => !(k in frozen)).join(", ")})`);
  }
  if (hasLegacy.length) {
    if (!(isStr(frozen.legacyRepo) && REPO_RE.test(frozen.legacyRepo))) out.push("legacyRepo must be a repository name");
    if (!(isStr(frozen.legacyUrl) && frozen.legacyUrl.startsWith("https://"))) out.push("legacyUrl must be an https URL");
    if (!(isStr(frozen.legacyHead) && HEAD_RE.test(frozen.legacyHead))) out.push("legacyHead must be a 40-digit commit id");
    if (!(isStr(frozen.legacyIndexSha256) && SHA256_RE.test(frozen.legacyIndexSha256))) out.push("legacyIndexSha256 must be a sha256 in hex");
    const dom = frozen.legacyDom;
    if (dom !== null && !(isObj(dom) && deepEqual(Object.keys(dom).sort(), [...S.legacyDomKeys].sort()) && Object.values(dom).every(isNonEmptyStr))) {
      out.push(`legacyDom must be null or {${S.legacyDomKeys.join(", ")}} with selector strings`);
    }
  }
  const legacyRepo = isStr(frozen.legacyRepo) && frozen.legacyRepo.length > 0;
  if (T.kindModel === "absent") {
    if ("kindModel" in frozen) out.push(`kindModel must be absent for app type ${type}`);
  } else if ("kindModel" in frozen) {
    if (!S.kindModels.includes(frozen.kindModel)) out.push(`kindModel must be one of ${S.kindModels.join(", ")}`);
    else if (!legacyRepo && frozen.kindModel !== "standard") out.push('kindModel must be "standard" without legacyRepo');
  } else if (legacyRepo) out.push("missing required key kindModel (required with legacyRepo)");
  return out.map((m) => `frozen.js: [C05] ${m}`);
}

// ---------- C08b: overrides closed under the export call graph ----------

// For every called function that is not overridden, nothing it reaches through the call
// graph may be overridden: the core function would keep calling the core version.
function overrideClosure(overrides, called, graph) {
  const out = [];
  const O = new Set(overrides);
  for (const c of called) {
    if (O.has(c)) continue;
    // breadth-first search from c, keeping one path per reached name
    const prev = new Map([[c, null]]);
    const queue = [c];
    while (queue.length) {
      const n = queue.shift();
      for (const m of (graph && graph[n]) || []) {
        if (prev.has(m)) continue;
        prev.set(m, n);
        queue.push(m);
      }
    }
    for (const o of overrides) {
      if (o === c || !prev.has(o)) continue;
      const chain = [];
      for (let n = o; n !== null; n = prev.get(n)) chain.unshift(n);
      out.push(`${c} uses the overridden ${o} internally (${chain.join(" -> ")}), so ${c} must be overridden too`);
    }
  }
  return out;
}

// ---------- validate ----------

// opts:
//   frozen      frozen.js exports or null
//   all         every provider's descriptor (raw or normalized); D itself is skipped by
//               identity (C04)
//   dir         the provider folder: enables C03's folder rule and C07's file checks
//   skeleton    the folder name starts with "_" (default: from dir)
//   tracked     dist/<id>/index.html is tracked by git (C05b)
//   parser      the parserScript exports (enables C08 and C09's export check)
//   callGraph   the export call graph (C08b); derived from <root>/core/export.js when
//               root is given and callGraph is not
//   root        repository root for the call graph
function validate(D, opts = {}) {
  const { frozen = null, all = [], dir = null, tracked = false, parser = null, root = null } = opts;
  const folder = dir ? path.basename(dir) : null;
  const skeleton = opts.skeleton !== undefined ? !!opts.skeleton : !!(folder && folder.startsWith("_"));
  const errs = [];
  const e = (check, msg, file = "provider.js") => errs.push(`${file}: [${check}] ${msg}`);

  if (!isObj(D)) {
    e("C01", "module.exports must be a plain object");
    return errs;
  }
  errs.push(...dataOnlyProblems(D));

  // ---- C01: schema ----
  for (const k of Object.keys(D)) if (!TOP_KEYS.includes(k)) e("C01", `unknown key ${json(k)}`);
  for (const k of ["contract", "id", "name", "summary", "inputs", "parserGlobal"]) if (D[k] === undefined) e("C01", `missing required key ${json(k)}`);
  const app = D.app === undefined ? "statement" : D.app;
  if (!["statement", "custom"].includes(app)) e("C01", `app must be "statement" or "custom", not ${json(D.app)}`);
  const custom = app === "custom";
  if (D.name !== undefined && !isNonEmptyStr(D.name)) e("C01", "name must be a non-empty string");
  if (D.summary !== undefined && !isNonEmptyStr(D.summary)) e("C01", "summary must be a non-empty string");
  if (D.inputs !== undefined) {
    if (!Array.isArray(D.inputs) || !D.inputs.length) e("C01", "inputs must be a non-empty array");
    else {
      for (const x of D.inputs) if (!INPUTS.includes(x)) e("C01", `inputs: unknown input ${json(x)} (allowed: ${INPUTS.join(", ")})`);
      if (dupes(D.inputs).length) e("C01", `inputs: repeated ${json(dupes(D.inputs))}`);
    }
  }
  if (D.multiple !== undefined && typeof D.multiple !== "boolean") e("C01", "multiple must be a boolean");
  if (!custom && D.multiple === false) e("C01", "multiple must be true for a statement app");
  if (D.parserGlobal !== undefined && !(isStr(D.parserGlobal) && GLOBAL_RE.test(D.parserGlobal))) e("C01", `parserGlobal must match ${GLOBAL_RE}`);
  const scripts = D.scripts === undefined ? ["parser.js"] : D.scripts;
  const parserScript = D.parserScript === undefined ? "parser.js" : D.parserScript;
  if (!Array.isArray(scripts) || !scripts.length) e("C01", "scripts must be a non-empty array of provider-relative .js paths");
  else {
    for (const s of scripts) if (!(isRelPath(s) && s.endsWith(".js"))) e("C01", `scripts: ${json(s)} is not a provider-relative .js path`);
    if (dupes(scripts).length) e("C01", `scripts: repeated ${json(dupes(scripts))}`);
  }
  if (!(isRelPath(parserScript) && parserScript.endsWith(".js"))) e("C01", "parserScript must be a provider-relative .js path");
  else if (Array.isArray(scripts) && !scripts.includes(parserScript)) e("C01", `scripts must contain parserScript ${json(parserScript)}`);
  if (custom) {
    const appScript = D.appScript === undefined ? "app.js" : D.appScript;
    if (!(isRelPath(appScript) && appScript.endsWith(".js"))) e("C01", "appScript must be a provider-relative .js path");
    else if (Array.isArray(scripts) && scripts.includes(appScript)) e("C01", "appScript is inlined last on its own; do not list it in scripts");
  } else if (D.appScript !== undefined) e("C01", "appScript is for custom apps only");
  if (D.uses !== undefined) {
    if (!Array.isArray(D.uses)) e("C01", "uses must be an array");
    else {
      for (const u of D.uses) if (!USES.includes(u)) e("C01", `uses: unknown module ${json(u)} (allowed: ${USES.join(", ")})`);
      if (dupes(D.uses).length) e("C01", `uses: repeated ${json(dupes(D.uses))}`);
    }
  }
  if (D.exportOverrides !== undefined) {
    if (!isStrArray(D.exportOverrides)) e("C01", "exportOverrides must be a string array");
    else {
      for (const n of D.exportOverrides) if (!C.CORE_EXPORT_NAMES.includes(n)) e("C01", `exportOverrides: ${json(n)} is not a core export name`);
      if (dupes(D.exportOverrides).length) e("C01", `exportOverrides: repeated ${json(dupes(D.exportOverrides))}`);
    }
  }
  if (D.pdf !== undefined) {
    if (!isObj(D.pdf)) e("C01", "pdf must be an object {pageTransform}");
    else {
      for (const k of Object.keys(D.pdf)) if (k !== "pageTransform") e("C01", `unknown key pdf.${k}`);
      const t = D.pdf.pageTransform;
      if (t !== undefined && t !== null && !isNonEmptyStr(t)) e("C01", "pdf.pageTransform must be a string or null");
    }
  }
  if (D.storage !== undefined) {
    if (!isObj(D.storage)) e("C01", "storage must be an object {modeKey, configKey}");
    else {
      for (const k of Object.keys(D.storage)) if (k !== "modeKey" && k !== "configKey") e("C01", `unknown key storage.${k}`);
      if (D.storage.modeKey !== undefined && !isNonEmptyStr(D.storage.modeKey)) e("C01", "storage.modeKey must be a non-empty string");
      const ck = D.storage.configKey;
      if (ck !== undefined && ck !== null && !isNonEmptyStr(ck)) e("C01", "storage.configKey must be a non-empty string or null");
      if (!custom && ck === null) e("C01", "storage.configKey cannot be null for a statement app (it has a configurator)");
    }
  }
  if (custom) {
    if (D.modes === undefined) e("C01", "modes is required for a custom app");
    else if (!Array.isArray(D.modes) || !D.modes.length) e("C01", "modes must be a non-empty array of {id, label}");
    else {
      D.modes.forEach((m, i) => {
        if (!isObj(m)) return e("C01", `modes[${i}] must be {id, label}`);
        for (const k of Object.keys(m)) if (k !== "id" && k !== "label") e("C01", `unknown key modes[${i}].${k}`);
        if (!(isStr(m.id) && MODE_ID_RE.test(m.id))) e("C01", `modes[${i}].id must match ${MODE_ID_RE}`);
        if (!isNonEmptyStr(m.label)) e("C01", `modes[${i}].label must be a non-empty string`);
      });
      const ids = D.modes.filter(isObj).map((m) => m.id);
      if (dupes(ids).length) e("C01", `modes: repeated id ${json(dupes(ids))}`);
    }
  } else if (D.modes !== undefined) e("C01", "modes is fixed for a statement app (LEDGER_MODES); remove it");
  if (D.naming !== undefined) {
    if (!isObj(D.naming)) e("C01", "naming must be an object");
    else {
      for (const k of Object.keys(D.naming)) if (!["accountPrefix", "brand", "groupNoun", "slug"].includes(k)) e("C01", `unknown key naming.${k}`);
      const n = D.naming;
      if (n.accountPrefix !== undefined && !isStr(n.accountPrefix)) e("C01", "naming.accountPrefix must be a string");
      if (n.brand !== undefined && !isNonEmptyStr(n.brand)) e("C01", "naming.brand must be a non-empty string");
      if (n.groupNoun !== undefined && !isNonEmptyStr(n.groupNoun)) e("C01", "naming.groupNoun must be a non-empty string");
      if (n.slug !== undefined && !(isStr(n.slug) && SLUG_RE.test(n.slug))) e("C01", `naming.slug must match ${SLUG_RE}`);
    }
  }
  if (custom && D.ui !== undefined) e("C01", "ui is for statement apps only");
  if (!custom && D.ui !== undefined) {
    const u = D.ui;
    if (!isObj(u)) e("C01", "ui must be an object");
    else {
      for (const k of Object.keys(u)) if (!UI_KEYS.includes(k)) e("C01", `unknown key ui.${k}`);
      if (u.notes !== undefined) {
        if (!isObj(u.notes)) e("C01", "ui.notes must be an object");
        else for (const [k, v] of Object.entries(u.notes)) {
          if (!NOTE_KEYS.includes(k)) e("C01", `unknown key ui.notes.${k}`);
          else if (!isNonEmptyStr(v)) e("C01", `ui.notes.${k} must be a non-empty string`);
        }
      }
      if (u.skipLabels !== undefined && !(isObj(u.skipLabels) && Object.values(u.skipLabels).every(isNonEmptyStr))) {
        e("C01", "ui.skipLabels must be an object of {category: label} strings");
      }
      if (u.skipDetailed !== undefined) {
        if (!isStrArray(u.skipDetailed)) e("C01", "ui.skipDetailed must be a string array");
        else if (dupes(u.skipDetailed).length) e("C01", `ui.skipDetailed: repeated ${json(dupes(u.skipDetailed))}`);
      }
      if (u.diagnostics !== undefined) {
        if (!isStrArray(u.diagnostics)) e("C01", "ui.diagnostics must be a string array");
        else {
          for (const x of u.diagnostics) if (!UI_DIAGNOSTICS.includes(x)) e("C01", `ui.diagnostics: unknown section ${json(x)} (allowed: ${UI_DIAGNOSTICS.join(", ")})`);
          if (dupes(u.diagnostics).length) e("C01", `ui.diagnostics: repeated ${json(dupes(u.diagnostics))}`);
        }
      }
      if (u.status !== undefined && !UI_STATUS.includes(u.status)) e("C01", `ui.status must be one of ${UI_STATUS.join(", ")}`);
      if (u.text !== undefined) {
        if (!isObj(u.text)) e("C01", "ui.text must be an object");
        else for (const [k, v] of Object.entries(u.text)) {
          if (!TEXT_KEYS.includes(k)) e("C01", `unknown key ui.text.${k}`);
          else if (!isNonEmptyStr(v)) e("C01", `ui.text.${k} must be a non-empty string`);
        }
      }
    }
  }
  if (D.custom !== undefined) {
    if (!custom) e("C01", "custom is for custom apps only");
    else if (!isObj(D.custom)) e("C01", "custom must be an object {toolbar, config}");
    else {
      for (const k of Object.keys(D.custom)) if (k !== "toolbar" && k !== "config") e("C01", `unknown key custom.${k}`);
      const t = D.custom.toolbar;
      if (t !== undefined) {
        if (!isStrArray(t)) e("C01", "custom.toolbar must be a string array");
        else {
          for (const x of t) if (!TOOLBAR.includes(x)) e("C01", `custom.toolbar: unknown button ${json(x)} (allowed: ${TOOLBAR.join(", ")})`);
          if (dupes(t).length) e("C01", `custom.toolbar: repeated ${json(dupes(t))}`);
        }
      }
      if (D.custom.config !== undefined && typeof D.custom.config !== "boolean") e("C01", "custom.config must be a boolean");
      if (D.custom.config === true && !(isObj(D.storage) && isNonEmptyStr(D.storage.configKey))) {
        e("C01", "custom.config needs an explicit storage.configKey");
      }
    }
  }
  if (D.detect !== undefined && D.detect !== null) {
    if (!isObj(D.detect)) e("C01", "detect must be null or {pdfText, csvText, xlsxSheets}");
    else {
      for (const [k, v] of Object.entries(D.detect)) {
        if (!["pdfText", "csvText", "xlsxSheets"].includes(k)) e("C01", `unknown key detect.${k}`);
        else if (!isStrArray(v)) e("C01", `detect.${k} must be a string array`);
        else if (k !== "xlsxSheets") for (const src of v) if (!compiles(src)) e("C01", `detect.${k}: regex does not compile: ${json(src)}`);
      }
    }
  }
  if (D.testing !== undefined) {
    if (!isObj(D.testing)) e("C01", "testing must be an object");
    else {
      const t = D.testing;
      for (const k of Object.keys(t)) if (!TESTING_KEYS.includes(k)) e("C01", `unknown key testing.${k}`);
      if (t.reconcile !== undefined && !["statement", "custom"].includes(t.reconcile)) e("C01", 'testing.reconcile must be "statement" or "custom"');
      if (custom && t.reconcile === "statement") e("C01", 'testing.reconcile "statement" needs a statement app');
      if (t.allowWarnings !== undefined && typeof t.allowWarnings !== "boolean") e("C01", "testing.allowWarnings must be a boolean");
      if (t.gapDrop !== undefined && typeof t.gapDrop !== "boolean") e("C01", "testing.gapDrop must be a boolean");
      if (custom && t.gapDrop === true) e("C01", "testing.gapDrop applies to statement apps only");
      if (t.fixtures !== undefined && t.fixtures !== null && !isRelPath(t.fixtures)) e("C01", "testing.fixtures must be a provider-relative folder or null");
    }
  }
  if (D.publish !== undefined && typeof D.publish !== "boolean") e("C01", "publish must be a boolean");
  if (custom && D.legacy !== undefined) e("C01", "legacy is for statement apps only");

  // ---- C03: id, folder, contract version ----
  if (D.contract !== undefined && D.contract !== C.CONTRACT_VERSION) e("C03", `contract must be ${C.CONTRACT_VERSION}; this build does not know contract ${json(D.contract)}`);
  if (D.id !== undefined) {
    if (!(isStr(D.id) && ID_RE.test(D.id))) e("C03", `id must match ${ID_RE}`);
    else {
      if (C.RESERVED_IDS.includes(D.id)) e("C03", `id ${json(D.id)} is reserved`);
      if (folder !== null && folder.replace(/^_/, "") !== D.id) e("C03", `id ${json(D.id)} must equal the folder name ${json(folder)} without its leading "_"`);
    }
  }

  // Everything below works on the resolved values.
  const N = normalize(D);
  let R = null;
  try {
    R = resolveRuntime(D);
  } catch {
    R = null;
  }
  if (isObj(N.storage) && isStr(N.storage.modeKey) && N.storage.modeKey === N.storage.configKey) e("C01", "storage.modeKey and storage.configKey must differ");

  // ---- C04: uniqueness against the other providers ----
  if (Array.isArray(all) && all.length) {
    for (const m of uniqueProblems(all.filter((x) => x !== D), N)) e("C04", m);
  }

  // ---- C05 / C05b: frozen.js ----
  if (frozen !== null && frozen !== undefined) {
    const type = frozenType(D);
    const schema = checkFrozen(frozen, type);
    errs.push(...schema);
    if (R && isObj(frozen)) {
      const T = C.FROZEN_SCHEMA.types[type];
      const cmp = (key, want, got) => {
        if (!deepEqual(want, got)) e("C05", `${key} is ${json(got)} in the descriptor but ${json(want)} in frozen.js`, "frozen.js");
      };
      if ("storage" in frozen) cmp("storage", frozen.storage, R.storage);
      if ("modeValues" in frozen) cmp("mode ids", frozen.modeValues, R.modes.map((m) => m.id));
      if ("configKinds" in frozen) cmp("configKinds", frozen.configKinds, T && T.configurator ? [...C.CONFIG_KINDS] : null);
      if (isObj(frozen.naming)) for (const k of Object.keys(frozen.naming)) cmp(`naming.${k}`, frozen.naming[k], R.naming[k]);
      if ("kindModel" in frozen && R.ui) cmp("ui.kindModel", frozen.kindModel, R.ui.kindModel);
    }
  } else if (!skeleton && (N.publish === true || tracked)) {
    e("C05", `a ${tracked ? "provider whose dist page is tracked" : "published provider"} needs frozen.js (C05b)`, "frozen.js");
  }

  // ---- C06: the legacy block ----
  if (D.legacy !== undefined && !custom) {
    if (!(isObj(frozen) && isNonEmptyStr(frozen.legacyRepo))) e("C06", "a legacy block needs frozen.js with legacyRepo (providers migrated from an old repository only)");
    if (!isObj(D.legacy)) e("C06", "legacy must be an object");
    else {
      for (const [k, v] of Object.entries(D.legacy)) {
        const allowed = C.LEGACY_KNOBS[k];
        if (allowed === undefined) e("C06", `unknown legacy knob ${json(k)}`);
        else if (allowed === "string") {
          if (!isNonEmptyStr(v)) e("C06", `legacy.${k} must be a non-empty string`);
        } else if (allowed === "diagnostics") {
          if (!isStrArray(v) || !v.includes("reconciled") || v.some((x) => !LEGACY_DIAGNOSTICS.includes(x)) || dupes(v).length) {
            e("C06", `legacy.diagnostics must be an array with "reconciled" and only ${LEGACY_DIAGNOSTICS.join(", ")}, without repeats`);
          }
        } else if (!allowed.includes(v)) e("C06", `legacy.${k} must be ${allowed.map(json).join(" or ")}, not ${json(v)}`);
      }
      if (D.legacy.diagnostics !== undefined && isObj(D.ui) && D.ui.diagnostics !== undefined) e("C06", "give ui.diagnostics or legacy.diagnostics, not both");
    }
  }

  // ---- C07: referenced files ----
  if (dir) {
    const has = (rel) => {
      try {
        return fs.statSync(path.join(dir, rel)).isFile();
      } catch {
        return false;
      }
    };
    if (Array.isArray(scripts)) for (const s of scripts) if (isRelPath(s) && !has(s)) e("C07", `scripts: ${s} does not exist`);
    if (custom && isRelPath(N.appScript) && !has(N.appScript)) e("C07", `appScript ${N.appScript} does not exist`);
    if (!has("page.html")) e("C07", "page.html does not exist", "page.html");
    const needTest = custom || (isObj(N.testing) && N.testing.reconcile === "custom");
    if (needTest) {
      const hooks = custom ? ["parse", "downloads", "reconcile"] : ["reconcile"];
      if (!has("test.js")) e("C07", `${custom ? "a custom app" : 'testing.reconcile "custom"'} needs test.js exporting ${hooks.join(", ")}`, "test.js");
      else {
        let t = null;
        try {
          const file = require.resolve(path.join(dir, "test.js"));
          delete require.cache[file];
          t = require(file);
        } catch (err) {
          e("C07", `cannot be loaded: ${err && err.message}`, "test.js");
        }
        if (t) for (const h of hooks) if (typeof t[h] !== "function") e("C07", `must export ${h}()`, "test.js");
      }
    }
    if (isObj(N.testing) && isRelPath(N.testing.fixtures)) {
      let ok = false;
      try {
        ok = fs.statSync(path.join(dir, N.testing.fixtures)).isDirectory();
      } catch {
        ok = false;
      }
      if (!ok) e("C07", `testing.fixtures: folder ${N.testing.fixtures} does not exist`);
      else if (!has(`${N.testing.fixtures}/statements.js`)) e("C07", `testing.fixtures: ${N.testing.fixtures}/statements.js does not exist`);
    }
  }

  // ---- C08 / C08b / C09 with the parser's exports ----
  const inputs = Array.isArray(D.inputs) ? D.inputs : [];
  const transform = isObj(N.pdf) ? N.pdf.pageTransform : null;
  if (isNonEmptyStr(transform) && !inputs.includes("pdf")) e("C09", 'pdf.pageTransform needs "pdf" in inputs');
  if (parser && typeof parser === "object") {
    const names = Object.keys(parser);
    const overlap = names.filter((n) => C.CORE_EXPORT_NAMES.includes(n));
    const declared = isStrArray(N.exportOverrides) ? N.exportOverrides : [];
    for (const n of overlap) if (!declared.includes(n)) e("C08", `${parserScript} exports the core name ${n}; list it in exportOverrides or rename it`);
    for (const n of declared) if (!overlap.includes(n)) e("C08", `exportOverrides lists ${n}, but ${parserScript} does not export it`);
    let graph = opts.callGraph || null;
    if (!graph && root) {
      try {
        graph = require("./callgraph.js").exportCallGraph(fs.readFileSync(path.join(root, "core", "export.js"), "utf8"));
      } catch (err) {
        e("C08", `cannot derive the export call graph from core/export.js: ${err && err.message}`);
      }
    }
    if (graph) {
      const called = custom ? C.CORE_EXPORT_NAMES : C.APP_CALLED_EXPORTS;
      for (const m of overrideClosure(declared.filter((n) => overlap.includes(n)), called, graph)) e("C08", `C08b: ${m}`);
    }
    if (isNonEmptyStr(transform) && typeof parser[transform] !== "function") e("C09", `pdf.pageTransform ${json(transform)} is not a function exported by ${parserScript}`);
  }
  return errs;
}

// C04 helper: the problems of `d` (normalized) against `others` (raw or normalized).
function uniqueProblems(others, d) {
  const out = [];
  const keysOf = (x) => (isObj(x.storage) ? [x.storage.modeKey, x.storage.configKey].filter(isNonEmptyStr) : []);
  for (const raw of others) {
    if (!isObj(raw)) continue;
    const o = normalize(raw);
    const who = isStr(o.id) ? o.id : "?";
    if (isStr(d.id) && o.id === d.id) out.push(`id ${json(d.id)} is also used by another provider folder`);
    if (isStr(d.parserGlobal) && o.parserGlobal === d.parserGlobal) out.push(`parserGlobal ${json(d.parserGlobal)} is also used by ${who}`);
    const mine = keysOf(d), theirs = keysOf(o);
    for (const k of mine) if (theirs.includes(k)) out.push(`storage key ${json(k)} is also used by ${who}`);
    if (isObj(d.naming) && isObj(o.naming) && isStr(d.naming.slug) && o.naming.slug === d.naming.slug) out.push(`naming.slug ${json(d.naming.slug)} is also used by ${who}`);
  }
  return out;
}

// C04 over a whole list: [{id, D}] or raw descriptors. Each clash is reported once per pair.
function checkUnique(list) {
  const items = list.map((x) => (x && x.D ? x.D : x)).filter(isObj).map((D) => normalize(D));
  const out = [];
  for (let i = 0; i < items.length; i++) {
    for (const m of uniqueProblems(items.slice(i + 1), items[i])) out.push(`provider.js: [C04] ${items[i].id}: ${m}`);
  }
  return out;
}

module.exports = {
  normalize,
  validate,
  resolveRuntime,
  checkFrozen,
  checkUnique,
  frozenType,
  overrideClosure,
  dataOnlyProblems,
  deepEqual,
};
