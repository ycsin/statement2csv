// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Fixtures golden (docs/TESTING.md, smoke and fixtures golden): every provider with
// testing.fixtures, end to end in the pinned Chrome on its synthetic fixtures, against the
// reviewed fixtures/expected.js.
//
//   node test/smoke/fixtures-golden.js [--root <dir>] [--provider <id>[,<id>...]] [--update]
//
// For each such provider, the page (its dist page, which must be current, or a temporary build
// for skeletons and unpublished providers) is opened in environment E0 (en-US, UTC) with the
// frozen clock and empty storage, and the rendered fixtures are loaded (one picker batch, or
// one file at a time on a single-file picker). Then, for every mode in button order (statement
// apps: the ledger modes; custom apps: their modes) and the ranges full, first and last (the
// first and last month of #from), clickAll() records every download. Each state's records
// must
//   - equal the downloads hook's Node rebuild of the same state (test/lib/replay.js replayStep
//     on the same files read by the production readers in Chrome, the H12 check), so --update
//     can never record a page bug as the golden; and
//   - equal fixtures/expected.js, field by field: trigger, account, card, kind, the raw name,
//     the MIME type, size, sha256 and every zip entry (name, size, CRC-32, sha256, DOS time and
//     date).
// --update writes fixtures/expected.js (for review) once the page equals the hook in every
// state. Without it, a provider with fixtures but no expected.js fails with "run --update", and
// an expected.js recorded for other fixture files, another environment or another clock is
// stale. Also: no console error, page error or CSP violation (the pdf.js worker fallback on
// file:// aside). The Node side runs in UTC (E0) for the duration, so zip times match the
// page's. No provider is named here. Exit status: 0 clean, 1 problems, 2 usage.
//
// fixtures/expected.js (written by --update; data only, ASCII, with the SPDX lines and the
// marker):
//   module.exports = {
//     marker: "SYNTHETIC TEST DATA", env: "E0", clock: "<FIXED_TIME>",
//     inputs: [{ name, size, sha256 }],                       the rendered fixture files
//     states: [{ id: "<mode>/<full|first|last|none>", mode, from, to, records: [capture record] }],
//   };
//
//   runGolden({root, providers, update, log}) -> Promise<{providers: [...], problems}>
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const REPO = path.resolve(__dirname, "..", "..");
const lib = (m) => require(path.join(REPO, "test", "lib", m));
const { loadDataModule } = require(path.join(REPO, "build", "discover.js"));
const smoke = require("./pages.js");

const MARKER = "SYNTHETIC TEST DATA";
const ENV = "E0";
const describe = (e) => String(e && e.message ? e.message : e).split("\n")[0];
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

// ---------------------------------------------------------------- expected.js

// A JS string literal holding only printable ASCII (JSON escapes, every other character as
// a backslash-u escape), so the file stays plain ASCII.
function lit(v) {
  return [...JSON.stringify(v)].map((c) => {
    const cp = c.codePointAt(0);
    if (cp >= 0x20 && cp <= 0x7e) return c;
    const units = cp > 0xffff ? [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)] : [cp];
    return units.map((u) => `\\u${u.toString(16).padStart(4, "0")}`).join("");
  }).join("");
}
const fields = (o, keys) => keys.filter((k) => o[k] !== undefined).map((k) => `${k}: ${lit(o[k])}`).join(", ");
const ENTRY_KEYS = ["name", "size", "crc32", "sha256", "dosTime", "dosDate"];
const RECORD_KEYS = ["trigger", "account", "card", "kind", "name", "type", "size", "sha256"];

function recordText(r) {
  if (r.disabled) return `      { ${fields(r, ["trigger", "account", "card", "kind"])}, disabled: true },`;
  const head = fields(r, RECORD_KEYS) + (r.zipError ? `, zipError: ${lit(r.zipError)}` : "");
  if (!r.entries) return `      { ${head} },`;
  return [`      { ${head}, entries: [`, ...r.entries.map((e) => `        { ${fields(e, ENTRY_KEYS)} },`), "      ] },"].join("\n");
}

function expectedText(golden) {
  const lines = [
    "// SPDX-License-Identifier: Apache-2.0",
    "// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>",
    `// ${MARKER}. Expected downloads of the fixtures golden (docs/TESTING.md, fixtures`,
    "// golden) for fixtures/statements.js, written by node test/smoke/fixtures-golden.js",
    "// --update: the provider's page in environment E0 (en-US, UTC) with the frozen clock, loaded",
    "// with the rendered fixtures through the picker, then for each mode in button order the",
    "// ranges full, first and last, each followed by clickAll() (the card buttons in DOM order,",
    "// then the toolbar). Each record is a capture record; every one equalled the downloads",
    "// hook's Node rebuild of the same state when it was written. Review it before committing;",
    "// regenerate it with --update after any change to the fixtures or to the code the page runs.",
    "module.exports = {",
    `  marker: ${lit(MARKER)},`,
    `  env: ${lit(golden.env)},`,
    `  clock: ${lit(golden.clock)},`,
    "  inputs: [",
    ...golden.inputs.map((f) => `    { ${fields(f, ["name", "size", "sha256"])} },`),
    "  ],",
    "  states: [",
  ];
  for (const s of golden.states) {
    lines.push(`    { ${fields(s, ["id", "mode", "from", "to"])}, records: [`);
    for (const r of s.records) lines.push(recordText(r));
    lines.push("    ] },");
  }
  lines.push("  ],", "};", "");
  return lines.join("\n");
}

const plain = (v) => JSON.parse(JSON.stringify(v));

// The first difference between two goldens, as a short message; null when equal.
function goldenDiff(want, got) {
  for (const k of ["marker", "env", "clock"]) if (want[k] !== got[k]) return `${k} is ${JSON.stringify(want[k])} in expected.js, ${JSON.stringify(got[k])} now (stale: run --update)`;
  if (JSON.stringify(plain(want.inputs)) !== JSON.stringify(plain(got.inputs))) return "expected.js was recorded for other fixture files (stale: run --update)";
  const ids = (g) => (g.states || []).map((s) => s.id).join(",");
  if (ids(want) !== ids(got)) return `the states differ: expected.js has ${(want.states || []).length} (${ids(want)}), the page ${got.states.length} (${ids(got)})`;
  const { compareRecords } = lib("replay.js");
  for (let i = 0; i < got.states.length; i++) {
    const a = want.states[i], b = got.states[i];
    for (const k of ["mode", "from", "to"]) if (a[k] !== b[k]) return `state ${b.id}: ${k} is ${JSON.stringify(a[k])} in expected.js, ${JSON.stringify(b[k])} on the page`;
    const m = compareRecords(plain(a.records), plain(b.records));
    if (m.length) return `state ${b.id}: record ${m[0].index} (${m[0].trigger}) ${m[0].field} differs (${m.length} mismatch${m.length > 1 ? "es" : ""})`;
    if (JSON.stringify(plain(a.records)) !== JSON.stringify(plain(b.records))) return `state ${b.id}: the records differ`;
  }
  return null;
}

// ---------------------------------------------------------------- one provider

async function goldenProvider(browser, t, { root, tmp, update }) {
  const problems = [];
  const D = t.entry.D;
  const fixtures = lib("fixtures.js");
  const fxDir = path.join(t.entry.dir, D.testing.fixtures);
  const spec = fixtures.loadSpec(fxDir);
  const fxTmp = path.join(tmp, "fixtures", t.id);
  const paths = fixtures.renderFixtures(spec, fxTmp);
  const inputs = paths.map((p) => {
    const b = fs.readFileSync(p);
    return { name: path.basename(p), size: b.length, sha256: sha256(b) };
  });
  const handle = lib("load-provider.js").loadNode(t.entry.id, { root });
  const ex = await lib("extract.js").extract(paths, { handle, browser, allowed: [fxTmp] });
  const { replayStep, compareRecords } = lib("replay.js");
  const { newContext, ENVS, FIXED_TIME } = lib("browser.js");
  const configKey = handle.R.storage.configKey;
  const golden = { marker: MARKER, env: ENV, clock: FIXED_TIME, inputs, states: [] };
  let hookMismatches = 0;
  const context = await newContext(browser, ENVS[ENV], {});
  try {
    const d = await lib("page-driver.js").open(context, pathToFileURL(t.file).href);
    for (const r of await smoke.loadFixtures(d, D, paths, spec)) if (r.busy !== "idle") problems.push("the page stays busy after the fixtures");
    const months = await d.page.evaluate(() => [...document.getElementById("from").options].map((o) => o.value));
    const ranges = months.length
      ? [["full", months[0], months[months.length - 1]], ["first", months[0], months[0]], ["last", months[months.length - 1], months[months.length - 1]]]
      : [["none", null, null]];
    for (const mode of handle.modes) {
      await d.setMode(mode);
      for (const [label, from, to] of ranges) {
        if (from !== null) await d.setRange(from, to);
        const records = await d.clickAll();
        const st = await d.page.evaluate(() => {
          const on = document.querySelector("#mode button.on[data-mode]");
          return { mode: on ? on.dataset.mode : null, from: document.getElementById("from").value, to: document.getElementById("to").value };
        });
        const config = configKey ? (await d.storage([configKey]))[configKey] : null;
        const id = `${mode}/${label}`;
        if (st.mode !== mode) problems.push(`state ${id}: the mode button ${mode} is not on after its click`);
        const rebuilt = replayStep(handle, ex.byPath, { config, mode: st.mode, from: st.from, to: st.to, paths: d.addOrder() }, {});
        if (rebuilt.threw) problems.push(`state ${id}: the Node rebuild throws: ${rebuilt.threw}`);
        const m = compareRecords(records, rebuilt.records);
        if (m.length) {
          hookMismatches++;
          problems.push(`state ${id}: the page differs from the downloads hook: record ${m[0].index} (${m[0].trigger}) ${m[0].field} (${m.length} mismatch${m.length > 1 ? "es" : ""})`);
        }
        golden.states.push({ id, mode, from: st.from, to: st.to, records });
      }
    }
    problems.push(...smoke.errorProblems(await d.errors()));
  } finally {
    await context.close().catch(() => {});
  }
  const file = path.join(fxDir, "expected.js");
  const count = golden.states.reduce((n, s) => n + s.records.length, 0);
  if (update) {
    if (problems.length) problems.push(`fixtures/expected.js not written: ${hookMismatches ? "the page differs from the downloads hook" : "the run has problems"}`);
    else {
      fs.writeFileSync(file, expectedText(golden));
      return { problems, states: golden.states.length, records: count, written: true };
    }
    return { problems, states: golden.states.length, records: count, written: false };
  }
  if (!fs.existsSync(file)) {
    problems.push(`fixtures/expected.js is missing: run node test/smoke/fixtures-golden.js --update --provider ${t.entry.id}, then review it`);
  } else {
    let want;
    try {
      want = loadDataModule(file);
    } catch (e) {
      problems.push(`fixtures/expected.js cannot be loaded: ${describe(e)}`);
    }
    if (want) {
      const diff = goldenDiff(want, golden);
      if (diff) problems.push(`fixtures/expected.js: ${diff}`);
    }
  }
  return { problems, states: golden.states.length, records: count, written: false };
}

// ---------------------------------------------------------------- the run

async function runGolden({ root = REPO, providers = null, update = false, log = () => {} } = {}) {
  root = path.resolve(root);
  const tz = process.env.TZ;
  process.env.TZ = "UTC"; // E0: the Node rebuild's zip times use local getters, as the page's do
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-fixtures-golden-"));
  const report = { providers: [], problems: [] };
  try {
    const hasFixtures = (e) => !!(e.D.testing && e.D.testing.fixtures);
    const targets = smoke.pageTargets(root, { providers, tmp, filter: hasFixtures });
    let browser = null;
    try {
      browser = await lib("browser.js").launch();
    } catch (e) {
      report.problems.push(`Chrome cannot be launched: ${describe(e)}`);
      return report;
    }
    try {
      for (const t of targets) {
        const p = { id: t.id, problems: t.problems.slice(), states: 0, records: 0, written: false };
        if (t.file) {
          try {
            const r = await goldenProvider(browser, t, { root, tmp, update });
            Object.assign(p, { states: r.states, records: r.records, written: r.written });
            p.problems.push(...r.problems.map((m) => `${t.id}: ${m}`));
          } catch (e) {
            p.problems.push(`${t.id}: ${describe(e)}`);
          }
        }
        report.providers.push(p);
        report.problems.push(...p.problems);
        log(`${p.problems.length ? "FAIL" : "ok  "} ${t.id}: ${p.states} states, ${p.records} records${p.written ? ", fixtures/expected.js written" : ""}${p.problems.length ? `, ${p.problems.length} problem${p.problems.length > 1 ? "s" : ""}` : ""}`);
      }
    } finally {
      await browser.close().catch(() => {});
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  }
  return report;
}

function parseArgs(argv) {
  const o = { root: REPO, providers: null, update: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--root") o.root = path.resolve(value());
    else if (a === "--provider") o.providers = [...(o.providers || []), ...value().split(",").map((s) => s.trim()).filter(Boolean)];
    else if (a === "--update") o.update = true;
    else throw new Error(`unknown argument ${JSON.stringify(a)}`);
  }
  return o;
}

async function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`fixtures golden: ${e.message}`);
    console.error("usage: node test/smoke/fixtures-golden.js [--root <dir>] [--provider <id>[,<id>...]] [--update]");
    return 2;
  }
  const r = await runGolden({ ...o, log: (m) => console.log(m) });
  for (const m of r.problems) console.log(`  ${m}`);
  console.log(`fixtures golden: ${r.providers.length} provider${r.providers.length === 1 ? "" : "s"} with fixtures, ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}${r.problems.length ? " (FAILED)" : ""}`);
  return r.problems.length ? 1 : 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { runGolden, expectedText, goldenDiff, parseArgs };
