// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Scenario generator of the golden harness (docs/TESTING.md, scenario matrix). Pure functions:
// the same probe and facts always give the same list, so old and new runs execute the same steps.
//
// Ids (frozen grammar):
//   page id      <id>/<E>/<O>/<I>/<C>            one page load (fresh context) per (E, O, I, C);
//                <id>/<E>/<O>/<I>/<C>/<Mseed>    a page whose mode key is seeded (M-seed-<value>)
//   step id      <page id>/<M>/<R>              a state of the mode x range iteration
//                <page id>/@<action>            a state after open, a load, Clear or a configurator op
//   Indexes stand for portfolios (p0, p1, ...) and months (m3 = the fourth month of the page),
//   never account names or dates.
//
// Axis values:
//   E  E0 en-US/UTC; E1 sv-SE/America/Los_Angeles; E2 en-SG/Asia/Singapore
//   O  O0 sorted, one batch, picker; O1 reversed; O2 first half, the rest, then all again;
//      O3 all, Clear, all; O4-dnd the O0 list by a synthetic drop; O4b-dnd (single-file pickers)
//      a text file and the statement by drop
//   I  I0 all; I-omit-mid; I-last; I-bogus-first; I-bogus-last; I-<input>-only; single-file
//      pickers: I-replace-twice, I-replace-bogus-real, I-replace-real-bogus
//   C  C0; C-ui-rename, C-ui-kind, C-ui-exclude, C-ui-merge, C-ui-combo; full tier: per portfolio
//      C-ui-rename-p<i>, C-ui-kind-p<i>-<kind>, C-ui-exclude-p<i>, C-ui-merge-p<i>, plus
//      C-ui-same-name, C-ui-cross-ccy; seeded: C-seed-bank, C-seed-foo, C-seed-unknown,
//      C-seed-cycle, C-seed-chain, C-seed-exclude-root, C-seed-spaces, C-seed-str-badjson,
//      C-seed-str-null, C-seed-str-array, C-seed-str-number, C-seed-str-string, C-seed-badname;
//      X-combo (cross-load, full tier); S-benign and S-break (security, from M8, every tier;
//      S-break is new page only: newOnly, never run on the old page)
//   M  the mode ids (button clicked, then each range set); then-<mode> (custom apps: range set,
//      then the mode clicked); M-seed-<value> pages (a seeded mode key, one load)
//   R  quick: full, first, last, mid, rev; full adds m<i> (single month), p<i> (prefix),
//      s<i> (suffix), g<k> (from the month after gap k to the last); exhaustive adds r<i>-<j>;
//      "none" when the page has no months
//
// Nothing here names a provider: everything comes from the probe of the old page, the page's
// picker and frozen.js.
"use strict";

const { acceptsFile } = require("../lib/page-driver.js");

const TIERS = Object.freeze(["quick", "full", "exhaustive"]);
const ENV_IDS = Object.freeze(["E0", "E1", "E2"]);
const RANGE_SETS = Object.freeze(["quick", "full", "exhaustive", "full+last", "full-only"]);
const MAX_PORTFOLIOS = 12;

const HOSTILE_NAME = '=Renamed "A&B", <x>';
const SAME_NAME = "Merged";
const PADDED_NAME = "  padded  ";
const SECURITY_PAYLOADS = Object.freeze({
  benign: '<img src=x onerror="window.__pwned=1">',
  breaking: 'x" onmouseover="window.__pwned=1',
});

// The declared inputs as the picker's accept attribute lists them.
const INPUT_ACCEPT = Object.freeze({
  pdf: "application/pdf,.pdf",
  csv: "text/csv,.csv",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});
const ACCEPT_TOKEN = Object.freeze({
  "application/pdf": "pdf",
  ".pdf": "pdf",
  "text/csv": "csv",
  ".csv": "csv",
  ".xlsx": "xlsx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
});
// The synthetic files: a bogus statement for the first declared input, and (single-file
// pickers) a text file that a drop delivers before the statement.
const BOGUS_TEXT = Object.freeze({ pdf: "not a pdf", csv: "hello", xlsx: "not a zip" });
const OTHER_TEXT = "not a statement";

const RAW_SEEDS = Object.freeze([
  ["C-seed-str-badjson", "{not json"],
  ["C-seed-str-null", "null"],
  ["C-seed-str-array", "[]"],
  ["C-seed-str-number", "5"],
  ["C-seed-str-string", '"x"'],
]);
const AUTO_KIND_VALUE = Object.freeze({ Investment: "investment", "Cash-like": "cash", Bank: "bank" });

// The declared inputs, in the order of the picker's accept attribute.
function inputsFromAccept(accept) {
  const out = [];
  for (const raw of String(accept || "").split(",")) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    const input = ACCEPT_TOKEN[t];
    if (!input) throw new Error(`scenarios: unknown token ${JSON.stringify(t)} in the picker's accept attribute`);
    if (!out.includes(input)) out.push(input);
  }
  if (!out.length) throw new Error("scenarios: the picker accepts no declared input");
  return out;
}

const bogusName = (input) => `zz-not-a-statement.${input}`;
const otherName = (input) => `aa-not-a-${input}.txt`;

// The synthetic files of a provider: [{name, text, use}] (use: "bogus" | "other").
function syntheticFiles(inputs) {
  const first = inputs[0];
  return [
    { use: "bogus", name: bogusName(first), text: BOGUS_TEXT[first] },
    { use: "other", name: otherName(first), text: OTHER_TEXT },
  ];
}

const isMonth = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
function nextMonth(m) {
  let y = Number(m.slice(0, 4));
  let mo = Number(m.slice(5, 7)) + 1;
  if (mo > 12) {
    mo = 1;
    y++;
  }
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`;
}

// rangesFor(months, set) -> [{label, from, to}], months being the page's #from values in order.
// A (from, to) pair appears once, under the first label that produced it.
function rangesFor(months, set) {
  if (!RANGE_SETS.includes(set)) throw new Error(`scenarios: unknown range set ${JSON.stringify(set)}`);
  const n = months.length;
  if (!n) return [];
  const out = [];
  const seen = new Set();
  const add = (label, a, b) => {
    const key = `${a}:${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, from: months[a], to: months[b] });
  };
  const last = n - 1;
  const mid = Math.floor(n / 2);
  if (set === "full-only") {
    add("full", 0, last);
    return out;
  }
  if (set === "full+last") {
    add("full", 0, last);
    add("last", last, last);
    return out;
  }
  add("full", 0, last);
  add("first", 0, 0);
  add("last", last, last);
  add("mid", mid, mid);
  add("rev", last, 0);
  if (set === "quick") return out;
  for (let i = 0; i < n; i++) add(`m${i}`, i, i);
  for (let i = 0; i < n; i++) add(`p${i}`, 0, i);
  for (let i = 0; i < n; i++) add(`s${i}`, i, last);
  let k = 0;
  for (let i = 1; i < n; i++) {
    if (isMonth(months[i - 1]) && isMonth(months[i]) && nextMonth(months[i - 1]) !== months[i]) add(`g${k++}`, i, last);
  }
  if (set === "exhaustive") {
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) add(`r${i}-${j}`, i, j);
  }
  return out;
}

// The steps of one iteration action on a page whose #from offers `months`:
// [{key, act}] with act an ordered list of ["mode", id] and ["range", from, to] operations.
//   order "mr": for each mode, the mode button is clicked, then each range is set;
//   order "rm": for each range, the range is set, then each mode button is clicked.
function iterationSteps({ order, ranges }, modes, months) {
  const list = rangesFor(months, ranges);
  const steps = [];
  if (order === "mr") {
    for (const m of modes) {
      if (!list.length) {
        steps.push({ key: `${m}/none`, act: [["mode", m]] });
        continue;
      }
      list.forEach((r, k) => steps.push({ key: `${m}/${r.label}`, act: k === 0 ? [["mode", m], ["range", r.from, r.to]] : [["range", r.from, r.to]] }));
    }
  } else if (order === "rm") {
    if (!list.length) for (const m of modes) steps.push({ key: `then-${m}/none`, act: [["mode", m]] });
    for (const r of list) {
      modes.forEach((m, k) => steps.push({ key: `then-${m}/${r.label}`, act: k === 0 ? [["range", r.from, r.to], ["mode", m]] : [["mode", m]] }));
    }
  } else {
    throw new Error(`scenarios: unknown iteration order ${JSON.stringify(order)}`);
  }
  return steps;
}

const opRename = (index, name) => ({ rename: { index, name } });
const opKind = (index, value) => ({ kind: { index, value } });
const opExclude = (index) => ({ exclude: { index } });
const opMerge = (from, into) => ({ merge: { from, into } });
const OP_RESET = Object.freeze({ reset: true });

// generate({id, tier, facts, probe, files, synthetic, otherModeValues, security = true})
//   -> {pages: Page[], skipped: [{id, reason}]}
//   facts: {app: "statement" | "custom", inputs, multiple, modeKey, configKey, modeValues, configKinds}
//   probe: the page driver's probe() of the old page with I0 loaded
//   files: the I0 statement paths in JS string order
//   synthetic: {bogus: path, other: path} (the files of syntheticFiles(), written by the caller)
//   otherModeValues: the mode values of every other frozen provider (any order)
//   security: include the S scenarios (the default since M8; false gives the earlier list)
// Page = {id, env, o, i, c, mseed, seed, actions, static?, newOnly?}
//   seed: null | {raw: {[storageKey]: string}} | {fromPage: <page id>} (the final storage of that
//   page, resolved when it has run); actions: {load: {files, via}} | {clear: true} |
//   {config: op} | {iterate: {order, ranges}}. newOnly: true marks a scenario that runs on the
//   new page alone (S-break): capture never runs it on the old page, and compare and live check
//   it on the new page by itself (design §6.7.5).
function generate({ id, tier, facts, probe, files, synthetic, otherModeValues = [], security = true }) {
  if (!TIERS.includes(tier)) throw new Error(`scenarios: unknown tier ${JSON.stringify(tier)}`);
  if (!files.length) throw new Error(`scenarios: ${id} has no statement files`);
  const quick = tier === "quick";
  const custom = facts.app !== "statement";
  const single = !facts.multiple;
  const configurator = facts.configKey !== null && facts.configKey !== undefined;
  const ps = probe.portfolios || [];
  const n = ps.length;
  const pages = [];
  const skipped = [];
  const signatures = new Map(); // canonical seed + actions -> page id (per env)

  const pageId = (env, o, i, c, mseed) => [id, env, o, i, c, ...(mseed ? [mseed] : [])].join("/");
  const iterate = (ranges) => (custom
    ? [{ iterate: { order: "mr", ranges } }, { iterate: { order: "rm", ranges } }]
    : [{ iterate: { order: "mr", ranges } }]);
  const skip = (pid, reason) => skipped.push({ id: pid, reason });
  const push = (p) => {
    const sig = JSON.stringify([p.env, p.seed, p.actions]);
    const same = signatures.get(sig);
    if (same) {
      skip(p.id, `same steps as ${same}`);
      return;
    }
    signatures.set(sig, p.id);
    pages.push(p);
  };
  const page = (env, o, i, c, { seed = null, actions, mseed = null, isStatic = false, newOnly = false }) => {
    const p = { id: pageId(env, o, i, c, mseed), env, o, i, c, mseed, seed, actions };
    if (isStatic) p.static = true;
    if (newOnly) p.newOnly = true;
    push(p);
  };

  // ---- loads for (O, I): a list of actions, or a skip reason
  const real = files[0];
  const loadsFor = (o, i) => {
    const load = (list, via = "picker") => ({ load: { files: list, via } });
    if (single) {
      if (o === "O0") {
        if (i === "I0") return [load([real])];
        if (i === "I-replace-twice") return [load([real]), load([real])];
        if (i === "I-replace-bogus-real") return [load([synthetic.bogus]), load([real])];
        if (i === "I-replace-real-bogus") return [load([real]), load([synthetic.bogus])];
        return "single-file picker";
      }
      if (i !== "I0") return "single-file picker";
      if (o === "O4-dnd") return [load([real], "drop")];
      if (o === "O4b-dnd") return [load([synthetic.other, real], "drop")];
      return "single-file picker";
    }
    let list;
    if (i === "I0") list = files.slice();
    else if (i === "I-omit-mid") {
      if (files.length < 3) return "fewer than 3 inputs";
      list = files.filter((f, k) => k !== Math.floor(files.length / 2));
    } else if (i === "I-last") list = [files[files.length - 1]];
    else if (i === "I-bogus-first") list = [synthetic.bogus, ...files];
    else if (i === "I-bogus-last") list = [...files, synthetic.bogus];
    else if (i.startsWith("I-") && i.endsWith("-only")) {
      const input = i.slice(2, -5);
      list = files.filter((f) => acceptsFile(INPUT_ACCEPT[input], f));
      if (!list.length) return `no ${input} input`;
    } else if (i.startsWith("I-replace-")) return "multiple-file picker";
    else throw new Error(`scenarios: unknown I value ${i}`);
    if (o === "O0") return [load(list)];
    if (o === "O1") return [load(list.slice().reverse())];
    if (o === "O2") {
      const h = Math.ceil(list.length / 2);
      return [list.slice(0, h), list.slice(h), list].filter((b) => b.length).map((b) => load(b));
    }
    if (o === "O3") return [load(list), { clear: true }, load(list)];
    if (o === "O4-dnd") return [load(list, "drop")];
    if (o === "O4b-dnd") return "multiple-file picker";
    throw new Error(`scenarios: unknown O value ${o}`);
  };
  const withLoads = (env, o, i, c, build) => {
    const loads = loadsFor(o, i);
    if (typeof loads === "string") return skip(pageId(env, o, i, c), loads);
    return build(loads);
  };

  // ---- configurator operations, from the probe (indexes only)
  const autoValue = (p) => (Object.prototype.hasOwnProperty.call(AUTO_KIND_VALUE, p.autoKind) ? AUTO_KIND_VALUE[p.autoKind] : null);
  const kindOps = () => {
    const ops = [];
    const nonInv = ps.findIndex((p) => p.autoKind !== "Investment");
    const inv = ps.findIndex((p) => p.autoKind === "Investment");
    if (nonInv >= 0) ops.push(opKind(nonInv, "investment"));
    if (inv >= 0) ops.push(opKind(inv, "cash"));
    return ops;
  };
  const mergeOp = () => {
    const ccy = ps[0].currency;
    const same = ccy === null ? -1 : ps.findIndex((p, k) => k > 0 && p.currency === ccy);
    return opMerge(same > 0 ? same : 1, 0);
  };
  const crossPair = () => {
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        if (ps[a].currency !== null && ps[b].currency !== null && ps[a].currency !== ps[b].currency) return [a, b];
      }
    }
    return null;
  };
  const kinds = (facts.configKinds || []).filter((k) => k);

  // ---- the page list, one factor at a time around E0/O0/I0/C0
  const baseRanges = quick ? "quick" : tier;
  const c0Ranges = quick ? "quick" : "full";
  const comboRanges = quick ? "quick" : tier;

  // E0, base page: the static snapshot is taken on it.
  withLoads("E0", "O0", "I0", "C0", (loads) => page("E0", "O0", "I0", "C0", { actions: [...loads, ...iterate(baseRanges)], isStatic: true }));

  // O variations (I0, C0).
  const oValues = single ? ["O4-dnd", "O4b-dnd"] : quick ? ["O4-dnd"] : ["O1", "O2", "O3", "O4-dnd"];
  for (const o of oValues) withLoads("E0", o, "I0", "C0", (loads) => page("E0", o, "I0", "C0", { actions: [...loads, ...iterate(c0Ranges)] }));
  if (!quick && single) for (const o of ["O1", "O2", "O3"]) skip(pageId("E0", o, "I0", "C0"), "single-file picker");

  // I variations (O0, C0), full tier.
  if (!quick) {
    const iValues = single
      ? ["I-replace-twice", "I-replace-bogus-real", "I-replace-real-bogus"]
      : ["I-omit-mid", "I-last", "I-bogus-first", "I-bogus-last", ...(facts.inputs.length > 1 ? facts.inputs.map((x) => `I-${x}-only`) : [])];
    for (const i of iValues) withLoads("E0", "O0", i, "C0", (loads) => page("E0", "O0", i, "C0", { actions: [...loads, ...iterate(c0Ranges)] }));
    if (single) for (const i of ["I-omit-mid", "I-last", "I-bogus-first", "I-bogus-last"]) skip(pageId("E0", "O0", i, "C0"), "single-file picker");
  }

  // C variations (O0, I0), configurator pages only.
  const uiPage = (c, ops, ranges = "quick", env = "E0") => withLoads(env, "O0", "I0", c, (loads) => page(env, "O0", "I0", c, {
    actions: [...loads, ...ops.map((op) => ({ config: op })), ...iterate(ranges), { config: OP_RESET }],
  }));
  const seedPage = (c, raw, { reset = false, newOnly = false } = {}) => withLoads("E0", "O0", "I0", c, (loads) => page("E0", "O0", "I0", c, {
    seed: { raw: { [facts.configKey]: raw } },
    actions: [...loads, ...(reset ? [{ config: OP_RESET }] : []), ...iterate("quick")],
    newOnly,
  }));
  const json = (o) => JSON.stringify(o);
  const comboOps = () => (n ? [opRename(0, HOSTILE_NAME), ...kindOps(), ...(n >= 2 ? [mergeOp()] : []), ...(n > 1 ? [opExclude(n - 1)] : [])] : null);
  const cPage = (c, need, buildFn) => {
    if (!configurator) return skip(pageId("E0", "O0", "I0", c), "no configurator");
    if (need) return skip(pageId("E0", "O0", "I0", c), need);
    return buildFn();
  };
  const atLeast = (k, what) => (n < k ? what : null);
  const p0 = () => ps[0].id;

  if (!quick) cPage("C-ui-rename", atLeast(1, "no portfolio"), () => uiPage("C-ui-rename", [opRename(0, HOSTILE_NAME)]));
  cPage("C-ui-kind", atLeast(1, "no portfolio"), () => uiPage("C-ui-kind", kindOps()));
  if (!quick) cPage("C-ui-exclude", atLeast(2, "only one portfolio"), () => uiPage("C-ui-exclude", [opExclude(n - 1)]));
  cPage("C-ui-merge", atLeast(2, "fewer than 2 portfolios"), () => uiPage("C-ui-merge", [mergeOp()]));
  if (!quick) {
    cPage("C-ui-combo", atLeast(1, "no portfolio"), () => uiPage("C-ui-combo", comboOps(), comboRanges));
    for (let i = 0; i < Math.min(n, MAX_PORTFOLIOS); i++) {
      cPage(`C-ui-rename-p${i}`, null, () => uiPage(`C-ui-rename-p${i}`, [opRename(i, HOSTILE_NAME)]));
      for (const k of kinds) {
        if (k === autoValue(ps[i])) continue;
        cPage(`C-ui-kind-p${i}-${k}`, null, () => uiPage(`C-ui-kind-p${i}-${k}`, [opKind(i, k)]));
      }
      cPage(`C-ui-exclude-p${i}`, atLeast(2, "only one portfolio"), () => uiPage(`C-ui-exclude-p${i}`, [opExclude(i)]));
      cPage(`C-ui-merge-p${i}`, atLeast(2, "fewer than 2 portfolios"), () => uiPage(`C-ui-merge-p${i}`, [opMerge(i, i === 0 ? 1 : 0)]));
    }
    cPage("C-ui-same-name", atLeast(2, "fewer than 2 portfolios"), () => uiPage("C-ui-same-name", [opRename(0, SAME_NAME), opRename(1, SAME_NAME)]));
    const cross = crossPair();
    cPage("C-ui-cross-ccy", cross ? null : "a single currency", () => uiPage("C-ui-cross-ccy", [opMerge(cross[1], cross[0])]));
  }
  cPage("C-seed-bank", atLeast(1, "no portfolio"), () => seedPage("C-seed-bank", json({ [p0()]: { kind: "bank" } })));
  if (!quick) {
    cPage("C-seed-foo", atLeast(1, "no portfolio"), () => seedPage("C-seed-foo", json({ [p0()]: { kind: "foo" } })));
    cPage("C-seed-unknown", atLeast(1, "no portfolio"), () => seedPage("C-seed-unknown", json({ [p0()]: { mergeInto: "nope" } })));
    cPage("C-seed-cycle", atLeast(2, "fewer than 2 portfolios"), () => seedPage("C-seed-cycle", json({ [ps[0].id]: { mergeInto: ps[1].id }, [ps[1].id]: { mergeInto: ps[0].id } })));
    cPage("C-seed-chain", atLeast(3, "fewer than 3 portfolios"), () => seedPage("C-seed-chain", json({ [ps[2].id]: { mergeInto: ps[1].id }, [ps[1].id]: { mergeInto: ps[0].id } })));
    cPage("C-seed-exclude-root", atLeast(2, "fewer than 2 portfolios"), () => seedPage("C-seed-exclude-root", json({ [ps[1].id]: { mergeInto: ps[0].id }, [ps[0].id]: { exclude: true } })));
    cPage("C-seed-spaces", atLeast(1, "no portfolio"), () => seedPage("C-seed-spaces", json({ [p0()]: { name: PADDED_NAME } })));
    for (const [c, raw] of RAW_SEEDS) cPage(c, null, () => seedPage(c, raw));
  }
  cPage("C-seed-badname", atLeast(1, "no portfolio"), () => seedPage("C-seed-badname", json({ [p0()]: { name: 5 } }), { reset: true }));

  // S scenarios (from M8, every tier): seeded markup payloads on p0. S-benign is compared with the
  // old page like any page; S-break restructures the old page's card, so it is new page only.
  if (security) {
    cPage("S-benign", atLeast(1, "no portfolio"), () => seedPage("S-benign", json({ [p0()]: { name: SECURITY_PAYLOADS.benign } })));
    cPage("S-break", atLeast(1, "no portfolio"), () => seedPage("S-break", json({ [p0()]: { kind: SECURITY_PAYLOADS.breaking } }), { newOnly: true }));
  }

  // X: the final storage of C-ui-combo seeded into a fresh page (full tier).
  if (!quick) {
    const combo = pageId("E0", "O0", "I0", "C-ui-combo");
    const xId = pageId("E0", "O0", "I0", "X-combo");
    if (!configurator) skip(xId, "no configurator");
    else if (!pages.some((p) => p.id === combo)) skip(xId, "no C-ui-combo page");
    else withLoads("E0", "O0", "I0", "X-combo", (loads) => page("E0", "O0", "I0", "X-combo", { seed: { fromPage: combo }, actions: [...loads, ...iterate("full-only")] }));
  }

  // M seeds (full tier): one load each, no clicks.
  if (!quick) {
    const own = facts.modeValues.slice();
    const others = [...new Set(otherModeValues)].filter((m) => !own.includes(m)).sort();
    for (const value of [...own, ...others, "", "garbage"]) {
      const mseed = `M-seed-${value === "" ? "empty" : value}`;
      withLoads("E0", "O0", "I0", "C0", (loads) => page("E0", "O0", "I0", "C0", { mseed, seed: { raw: { [facts.modeKey]: value } }, actions: loads }));
    }
  }

  // E1 and E2: C0 (and C-ui-combo in the full tier) x every mode x {full, last}.
  for (const env of ["E1", "E2"]) {
    withLoads(env, "O0", "I0", "C0", (loads) => page(env, "O0", "I0", "C0", { actions: [...loads, ...iterate("full+last")] }));
    if (!quick) {
      const pid = pageId(env, "O0", "I0", "C-ui-combo");
      if (!configurator) skip(pid, "no configurator");
      else if (!n) skip(pid, "no portfolio");
      else uiPage("C-ui-combo", comboOps(), "full+last", env);
    }
  }
  return { pages, skipped };
}

// The pages of one environment.
const pagesFor = (list, env) => list.pages.filter((p) => p.env === env);

// The files a page reads, in first-use order.
function pageFiles(p) {
  const out = [];
  for (const a of p.actions) if (a.load) for (const f of a.load.files) if (!out.includes(f)) out.push(f);
  return out;
}

module.exports = {
  TIERS,
  ENV_IDS,
  RANGE_SETS,
  MAX_PORTFOLIOS,
  HOSTILE_NAME,
  SAME_NAME,
  PADDED_NAME,
  SECURITY_PAYLOADS,
  INPUT_ACCEPT,
  BOGUS_TEXT,
  OTHER_TEXT,
  RAW_SEEDS,
  inputsFromAccept,
  bogusName,
  otherName,
  syntheticFiles,
  nextMonth,
  rangesFor,
  iterationSteps,
  generate,
  pagesFor,
  pageFiles,
};
