// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Injection smoke (docs/TESTING.md, injection; from migration step M8): markup payloads where
// the pages print untrusted values, on every page whose provider has testing.fixtures, in the
// pinned Chrome.
//
//   node test/smoke/injection.js [--root <dir>] [--provider <id>[,<id>...]]
//
// Payloads, each on a page of its own (a fresh context: E0, frozen clock):
//   - configurator pages (storage.configKey set): the fixtures are loaded once to read <p0>,
//     the data-id of the first #config-list .account-row; then a page seeded with
//     {<p0>: {name: NAME, kind: KIND}} (below; the configurator writes neither, a hand edit or
//     another page on the origin can) loads the fixtures again;
//   - providers with fixtures/hostile.js (the fixture spec format): its files, whose content
//     carries the payloads. Every markup tag in their strings (a workbook cell, a PDF text run,
//     a text file's line), with its text and end tag when it has them, is one payload.
// Each payload page is compared with its twin, the same page with plain stand-ins (the seed
// {<p0>: {name: "Plain name", kind: "plain"}}, or the hostile files with each payload replaced
// by its text), state by state: every mode, at the full range and the last month. A page with
// neither payload (no configurator, no hostile.js) is listed as such. A payload page must show
//   - no script run: window.__pwned stays undefined, also after the events the payloads'
//     handlers name (mouseover, error, …) are dispatched on every element of <main>, and the
//     page logs no console error, page error or CSP violation (the pdf.js worker fallback on
//     file:// aside). Since migration step M10 the pages' policy blocks inline handlers, so a
//     payload that became markup shows as a script-src-attr violation rather than as a run;
//   - no new element: no element carries an on* attribute, and no payload tag (img, b, …)
//     appears more often than on the twin;
//   - the payload as literal text: the seeded name as the title of p0's card (statement apps)
//     and as the value of its configurator row's name field, the kind as the class token
//     "other" on that card's tag; a hostile file's payload in the text of <main>, and in every
//     render target the page has (#cards, #config-list, #status, #diagnostics; a target's text
//     includes the values of its form fields) in some state, so a hostile.js exercises every
//     render;
//   - the hook's downloads: every captured download equals the downloads hook's Node rebuild
//     of the same state (test/lib/replay.js replayStep on the same files, read by the
//     production readers in Chrome), zip entries included, so for statement apps Download
//     all, which scans the rendered cards, equals allFiles(): the SX1 assertion of the
//     migration on synthetic data. That scan reads each card button's data-account back
//     through the HTML parser, which keeps every name but those with CR or NUL (docs/MIGRATION.md
//     decision 64 and the reviewed exception of decision 176), so p0's card buttons must carry
//     the seeded name exactly.
// Coverage (a full run, or coverage: true): every render target that a payload page has shows a
// payload as literal text on some page, so no render goes unexercised; a run restricted with
// --provider prints its coverage as a note. The Node side runs in UTC (E0) for the duration, so
// zip times match the page's. No provider is named here; inputs are synthetic, so the console
// holds no private data. Exit status: 0 clean, 1 problems, 2 usage.
//
//   runInjection({root, providers, log, coverage, csp}) -> Promise<{providers: [...], coverage,
//     problems}>; each provider's shown: {configurator, hostile} lists the targets where that
//     payload showed as literal text; coverage: {target: [provider id, ...]}; csp: the CSP mode
//     of the pages (default: build/csp.js DEFAULT_CSP_MODE; "legacy" lets a test run the smoke
//     on pages whose policy allows inline handlers, as before migration step M10)
//   payloadsOf(spec) -> [{text, tags, events}]; stripPayloads(spec) -> the twin spec
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const REPO = path.resolve(__dirname, "..", "..");
const lib = (m) => require(path.join(REPO, "test", "lib", m));
const smoke = require("./pages.js");

// The configurator payloads (design §6.5): a name that is an element with a handler, and a kind
// that closes the class attribute of the card's tag and adds one.
const NAME = "<img src=x onerror=\"window.__pwned=1\">";
const KIND = "x\" onmouseover=\"window.__pwned=1";
const PLAIN = { name: "Plain name", kind: "plain" };
const ENV = "E0";
const describe = (e) => String(e && e.message ? e.message : e).split("\n")[0];

// ---------------------------------------------------------------- payloads

// A markup tag, with its text and end tag when it has them: <b onmouseover="…">USD</b>, <i>,
// <img/src=x/onerror=…>.
const MARKUP = /<([A-Za-z][A-Za-z0-9-]*)\b[^<>]*>(?:[^<]*<\/\1\s*>)?/g;
const HANDLER = /\son([a-z]+)\s*=|\/on([a-z]+)\s*=/gi;

function describePayload(text) {
  const tags = [...text.matchAll(/<([A-Za-z][A-Za-z0-9-]*)/g)].map((m) => m[1].toLowerCase());
  const events = [...text.matchAll(HANDLER)].map((m) => (m[1] || m[2]).toLowerCase());
  return { text, tags: [...new Set(tags)], events: [...new Set(events)] };
}

// Every string of a spec's file bodies: text files whole, PDF text runs, workbook cells.
function strings(spec) {
  const out = [];
  const walk = (v) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  for (const f of spec.files) walk(f.text !== undefined ? f.text : f.pages !== undefined ? f.pages.map((p) => p.map((it) => it.text)) : f.sheets);
  return out;
}

function payloadsOf(spec) {
  const seen = new Map();
  for (const s of strings(spec)) for (const m of s.matchAll(MARKUP)) if (!seen.has(m[0])) seen.set(m[0], describePayload(m[0]));
  return [...seen.values()];
}

// The twin of a hostile spec: each payload replaced by its text (the markup's tags removed), or
// by the word PAYLOAD when it has none, so the twin's files read as the hostile ones do.
function stripPayloads(spec) {
  const strip = (s) => s.replace(MARKUP, (m) => m.replace(/<[^<>]*>/g, "") || "PAYLOAD");
  const copy = (v) => (typeof v === "string" ? strip(v) : Array.isArray(v) ? v.map(copy) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "name" ? x : copy(x)])) : v);
  return { ...spec, files: spec.files.map(copy) };
}

// ---------------------------------------------------------------- the page

// The render targets whose text the payloads must reach (the page's fixed ids, design §2.11).
const TARGETS = ["#cards", "#config-list", "#status", "#diagnostics"];

// In the page: dispatch the payloads' handler events on every element of <main>, then read what
// the checks need. targets: {selector: text or null when the page has no such element}, the text
// with the values of the target's form fields.
function inspect({ tags, events, p0, targets }) {
  const main = document.querySelector("main");
  for (const type of events) for (const el of main.querySelectorAll("*")) el.dispatchEvent(new Event(type));
  const onAttrs = [];
  for (const el of document.querySelectorAll("*")) for (const a of el.attributes) if (/^on/i.test(a.name)) onAttrs.push(`${el.tagName.toLowerCase()}[${a.name}]`);
  const counts = {};
  for (const t of tags) counts[t] = document.querySelectorAll(t).length;
  const cards = [...document.querySelectorAll("#cards .card")].map((c) => {
    const h3 = c.querySelector("h3"), tag = c.querySelector(".tag");
    return { title: h3 ? h3.textContent : null, tag: tag ? tag.getAttribute("class") : null, accounts: [...c.querySelectorAll("button.dl")].map((b) => b.dataset.account) };
  });
  const text = {};
  for (const sel of targets) {
    const el = document.querySelector(sel);
    text[sel] = el ? [el.textContent, ...[...el.querySelectorAll("input, textarea")].map((f) => f.value)].join("\n") : null;
  }
  let configName = null;
  if (p0 !== null) {
    const row = [...document.querySelectorAll("#config-list .account-row[data-id]")].find((r) => r.getAttribute("data-id") === p0);
    const input = row ? row.querySelector('input[data-field="name"]') : null;
    configName = input ? input.value : null;
  }
  return { pwned: typeof window.__pwned !== "undefined", onAttrs, counts, text: main ? main.textContent : "", cards, configName, targets: text };
}

// The targets where one of the texts shows, over the views of a page instance, and the targets
// the page has.
function shownIn(views, texts) {
  const present = TARGETS.filter((t) => views.some(({ view }) => view.targets[t] !== null));
  return { present, shown: present.filter((t) => views.some(({ view }) => view.targets[t] !== null && texts.some((x) => view.targets[t].includes(x)))) };
}

// One page instance in a fresh context with a storage seed: open, fn(driver), then the errors.
async function seeded(browser, file, seed, fn) {
  const { newContext, ENVS } = lib("browser.js");
  const context = await newContext(browser, ENVS[ENV], seed || {});
  const problems = [];
  try {
    let d;
    try {
      d = await lib("page-driver.js").open(context, pathToFileURL(file).href);
    } catch (e) {
      problems.push(`the page does not open: ${describe(e)}`);
      return problems;
    }
    try {
      await fn(d, problems);
    } catch (e) {
      problems.push(describe(e));
    }
    problems.push(...smoke.errorProblems(await d.errors()));
  } finally {
    await context.close().catch(() => {});
  }
  return problems;
}

// The states of a loaded page: [{id, mode, from, to}] for every mode at the full range and the
// last month (or one state without a range).
async function states(d, modes) {
  const months = await d.page.evaluate(() => [...document.getElementById("from").options].map((o) => o.value));
  const ranges = months.length ? [["full", months[0], months[months.length - 1]], ["last", months[months.length - 1], months[months.length - 1]]] : [["none", null, null]];
  const out = [];
  for (const mode of modes) for (const [label, from, to] of ranges) out.push({ id: `${mode}/${label}`, mode, from, to });
  return out;
}

async function setState(d, s) {
  await d.setMode(s.mode);
  if (s.from !== null) await d.setRange(s.from, s.to);
}

// Loads the files, then visits every state: inspect, and compare the downloads with the hook.
// Returns [{id, view}] (the inspections) and pushes problems to `out`.
async function visit(d, { D, handle, paths, spec, ex, inspectArgs, configKey, compare }, out) {
  for (const r of await smoke.loadFixtures(d, D, paths, spec)) if (r.busy !== "idle") out.push("the page stays busy after the files");
  const { replayStep, compareRecords } = lib("replay.js");
  const views = [];
  let records = 0;
  for (const s of await states(d, handle.modes)) {
    await setState(d, s);
    const view = await d.page.evaluate(inspect, inspectArgs);
    views.push({ id: s.id, view });
    if (!compare) continue;
    const got = await d.clickAll();
    records += got.length;
    const st = await d.page.evaluate(() => ({ from: document.getElementById("from").value, to: document.getElementById("to").value }));
    const config = configKey ? (await d.storage([configKey]))[configKey] : null;
    const rebuilt = replayStep(handle, ex.byPath, { config, mode: s.mode, from: st.from, to: st.to, paths: d.addOrder() }, {});
    if (rebuilt.threw) out.push(`state ${s.id}: the Node rebuild throws: ${rebuilt.threw}`);
    const m = compareRecords(got, rebuilt.records);
    if (m.length) out.push(`state ${s.id}: the page differs from the downloads hook: record ${m[0].index} (${m[0].trigger}) ${m[0].field} (${m.length} mismatch${m.length > 1 ? "es" : ""})`);
    if (!got.some((x) => !x.disabled)) out.push(`state ${s.id}: no download to compare`);
  }
  return { views, records };
}

// The inertness checks of one state against its twin.
function inertProblems(id, view, twin, payloads) {
  const out = [];
  if (view.pwned) out.push(`state ${id}: window.__pwned is set: a payload ran`);
  if (view.onAttrs.length) out.push(`state ${id}: ${view.onAttrs.length} element${view.onAttrs.length > 1 ? "s carry" : " carries"} an on* attribute (${[...new Set(view.onAttrs)].slice(0, 3).join(", ")})`);
  for (const t of [...new Set(payloads.flatMap((p) => p.tags))]) {
    const base = twin ? twin.counts[t] || 0 : 0;
    if ((view.counts[t] || 0) > base) out.push(`state ${id}: ${view.counts[t] - base} new <${t}> element${view.counts[t] - base > 1 ? "s" : ""}: a payload became markup`);
  }
  return out;
}

// ---------------------------------------------------------------- one provider

async function injectProvider(browser, t, { root, tmp }) {
  const problems = [];
  const D = t.entry.D;
  const fixtures = lib("fixtures.js");
  const handle = lib("load-provider.js").loadNode(t.entry.id, { root });
  const statementApp = handle.app === "statement";
  const configKey = handle.R.storage ? handle.R.storage.configKey : null;
  const fxDir = path.join(t.entry.dir, D.testing.fixtures);
  const hostileFile = path.join(fxDir, "hostile.js");
  const report = { configurator: !!configKey, hostile: fs.existsSync(hostileFile), instances: 0, states: 0, records: 0, present: [], shown: { configurator: [], hostile: [] } };
  if (!report.configurator && !report.hostile) return { problems, ...report };
  const extract = lib("extract.js").extract;
  const run = async (label, seed, fn) => {
    report.instances++;
    for (const m of await seeded(browser, t.file, seed, fn)) problems.push(`${label}: ${m}`);
  };

  if (report.configurator) {
    const spec = fixtures.loadSpec(fxDir);
    const dir = path.join(tmp, "fixtures", t.id);
    const paths = fixtures.renderFixtures(spec, dir);
    const ex = await extract(paths, { handle, browser, allowed: [dir] });
    let p0 = null;
    await run("configurator probe", {}, async (d, out) => {
      for (const r of await smoke.loadFixtures(d, D, paths, spec)) if (r.busy !== "idle") out.push("the page stays busy after the fixtures");
      p0 = await d.page.evaluate(() => {
        const row = document.querySelector("#config-list .account-row[data-id]");
        return row ? row.getAttribute("data-id") : null;
      });
      if (p0 === null) out.push("no #config-list .account-row[data-id] after the fixtures");
    });
    if (p0 !== null) {
      const payloads = [describePayload(NAME), describePayload(KIND)];
      const inspectArgs = { tags: [...new Set(payloads.flatMap((p) => p.tags))], events: [...new Set(payloads.flatMap((p) => p.events))], p0, targets: TARGETS };
      const ctx = { D, handle, paths, spec, ex, inspectArgs, configKey };
      let twin = null;
      await run("configurator twin", { [configKey]: JSON.stringify({ [p0]: PLAIN }) }, async (d, out) => {
        twin = new Map((await visit(d, { ...ctx, compare: false }, out)).views.map((v) => [v.id, v.view]));
      });
      await run("configurator payload", { [configKey]: JSON.stringify({ [p0]: { name: NAME, kind: KIND } }) }, async (d, out) => {
        const r = await visit(d, { ...ctx, compare: true }, out);
        report.states += r.views.length;
        report.records += r.records;
        for (const { id, view } of r.views) out.push(...inertProblems(id, view, twin && twin.get(id), payloads));
        const first = r.views[0];
        if (first && first.view.configName !== NAME) out.push(`state ${first.id}: p0's configurator row does not show the seeded name as its value`);
        if (statementApp) {
          // p0's account carries the seeded name, so its card is the one titled with it.
          const mine = r.views.flatMap(({ id, view }) => view.cards.filter((c) => c.title === NAME).map((c) => ({ id, c })));
          if (!mine.length) out.push("no card shows the seeded name as its title in any state");
          for (const { id, c } of mine) if (c.tag !== "tag other") out.push(`state ${id}: p0's card tag has the class ${JSON.stringify(c.tag)}, not "tag other"`);
          // Download all reads the account back from each button's data-account.
          for (const { id, c } of mine) if (c.accounts.some((a) => a !== NAME)) out.push(`state ${id}: p0's card buttons do not carry the seeded name as data-account (what Download all's scan reads)`);
        }
        const cov = shownIn(r.views, [NAME]);
        report.present = [...new Set([...report.present, ...cov.present])];
        report.shown.configurator = cov.shown;
      });
    }
  }

  if (report.hostile) {
    const spec = fixtures.loadSpec(hostileFile);
    const payloads = payloadsOf(spec);
    if (!payloads.length) problems.push("fixtures/hostile.js: no markup payload in its files");
    else {
      const dir = path.join(tmp, "hostile", t.id);
      const paths = fixtures.renderFixtures(spec, dir);
      const twinDir = path.join(tmp, "hostile-twin", t.id);
      const twinPaths = fixtures.renderFixtures(stripPayloads(spec), twinDir);
      const ex = await extract(paths, { handle, browser, allowed: [dir] });
      const inspectArgs = { tags: [...new Set(payloads.flatMap((p) => p.tags))], events: [...new Set(payloads.flatMap((p) => p.events))], p0: null, targets: TARGETS };
      let twin = null;
      await run("hostile twin", {}, async (d, out) => {
        twin = new Map((await visit(d, { D, handle, paths: twinPaths, spec, ex: null, inspectArgs, configKey, compare: false }, out)).views.map((v) => [v.id, v.view]));
      });
      await run("hostile files", {}, async (d, out) => {
        const r = await visit(d, { D, handle, paths, spec, ex, inspectArgs, configKey, compare: true }, out);
        report.states += r.views.length;
        report.records += r.records;
        for (const { id, view } of r.views) out.push(...inertProblems(id, view, twin && twin.get(id), payloads));
        const cov = shownIn(r.views, payloads.map((p) => p.text));
        report.present = [...new Set([...report.present, ...cov.present])];
        report.shown.hostile = cov.shown;
        if (!r.views.some(({ view }) => payloads.some((p) => view.text.includes(p.text)))) out.push("no payload of fixtures/hostile.js shows as literal text in <main> (the page never prints it)");
        else for (const t of cov.present.filter((x) => !cov.shown.includes(x))) out.push(`no payload of fixtures/hostile.js shows as literal text in ${t} in any state: that render goes unexercised`);
      });
    }
  }
  return { problems, ...report };
}

// ---------------------------------------------------------------- the run

async function runInjection({ root = REPO, providers = null, log = () => {}, coverage = providers === null, csp } = {}) {
  root = path.resolve(root);
  const tz = process.env.TZ;
  process.env.TZ = "UTC"; // E0: the Node rebuild's zip times use local getters, as the page's do
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-injection-"));
  const report = { providers: [], coverage: {}, problems: [] };
  try {
    const hasFixtures = (e) => !!(e.D.testing && e.D.testing.fixtures);
    const targets = smoke.pageTargets(root, { providers, tmp, filter: hasFixtures, csp });
    let browser = null;
    try {
      browser = await lib("browser.js").launch();
    } catch (e) {
      report.problems.push(`Chrome cannot be launched: ${describe(e)}`);
      return report;
    }
    try {
      for (const t of targets) {
        const p = { id: t.id, problems: t.problems.slice(), configurator: false, hostile: false, instances: 0, states: 0, records: 0, present: [], shown: { configurator: [], hostile: [] } };
        if (t.file) {
          try {
            const r = await injectProvider(browser, t, { root, tmp });
            Object.assign(p, { configurator: r.configurator, hostile: r.hostile, instances: r.instances, states: r.states, records: r.records, present: r.present, shown: r.shown });
            p.problems.push(...r.problems.map((m) => `${t.id}: ${m}`));
          } catch (e) {
            p.problems.push(`${t.id}: ${describe(e)}`);
          }
        }
        report.providers.push(p);
        report.problems.push(...p.problems);
        const kinds = [p.configurator && "configurator payloads", p.hostile && "hostile files"].filter(Boolean).join(" and ") || "no payload";
        const where = [p.configurator && `the seeded name in ${p.shown.configurator.join(", ") || "no target"}`, p.hostile && `the hostile payloads in ${p.shown.hostile.join(", ") || "no target"}`].filter(Boolean);
        log(`${p.problems.length ? "FAIL" : "ok  "} ${t.id}: ${kinds}, ${p.instances} page instances, ${p.states} payload states, ${p.records} downloads equal to the hook${where.length ? `; ${where.join("; ")}` : ""}${p.problems.length ? `, ${p.problems.length} problem${p.problems.length > 1 ? "s" : ""}` : ""}`);
      }
    } finally {
      await browser.close().catch(() => {});
    }
    // Coverage: every render target a payload page has shows a payload on some page.
    const present = TARGETS.filter((x) => report.providers.some((p) => p.present.includes(x)));
    for (const x of present) report.coverage[x] = report.providers.filter((p) => p.shown.configurator.includes(x) || p.shown.hostile.includes(x)).map((p) => p.id);
    const bare = present.filter((x) => !report.coverage[x].length);
    if (present.length) log(`${coverage && bare.length ? "FAIL" : coverage ? "ok  " : "note"} coverage: ${present.map((x) => `${x} ${report.coverage[x].length}`).join(", ")} page${report.providers.length === 1 ? "" : "s"} with a payload as literal text${coverage ? "" : " (a restricted run: not checked)"}`);
    if (coverage) for (const x of bare) report.problems.push(`coverage: no payload shows as literal text in ${x} on any page of this run: that render goes unexercised`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
  return report;
}

function parseArgs(argv) {
  const o = { root: REPO, providers: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--root") o.root = path.resolve(value());
    else if (a === "--provider") o.providers = [...(o.providers || []), ...value().split(",").map((s) => s.trim()).filter(Boolean)];
    else throw new Error(`unknown argument ${JSON.stringify(a)}`);
  }
  return o;
}

async function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`injection: ${e.message}`);
    console.error("usage: node test/smoke/injection.js [--root <dir>] [--provider <id>[,<id>...]]");
    return 2;
  }
  const r = await runInjection({ ...o, log: (m) => console.log(m) });
  for (const m of r.problems) console.log(`  ${m}`);
  console.log(`injection: ${r.providers.length} provider${r.providers.length === 1 ? "" : "s"} with fixtures, ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}${r.problems.length ? " (FAILED)" : ""}`);
  return r.problems.length ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { runInjection, payloadsOf, stripPayloads, describePayload, NAME, KIND, TARGETS, parseArgs };
