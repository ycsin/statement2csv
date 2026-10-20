// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// core/app/statement-app.js against the seven old statement apps it replaces (docs/TESTING.md,
// unit tests): for every provider with frozen.legacyRepo and a statement app, the old page's
// scripts (its build.py parts at legacyHead: layout, export, parser, app) and the new page's
// plan pieces 3-13 (core modules, the provider's runtime object and scripts, the statement app)
// run in two vm contexts with the same recording stub DOM. The parser globals keep their real
// functions; only parseStatements is a synthetic stub shared by both sides, whose results are
// limited to what each old parser can return. Seeded scripts load files (drop and picker),
// switch modes, set ranges, drive the configurator (hostile names included), reset, clear and
// click every download. Every DOM write, storage access, listener registration, pdf.js call
// and download (its bytes' sha256) is logged, and the two logs must be identical; the old
// legacy configurator ids are mapped as waiver W3 maps them, and the markup the old apps
// printed raw is compared in the escaped form migration step M8 gives it (M8_EXPECTED below).
// From migration step M9 the statement app catches a parse that throws, which the old apps
// did not: the old side runs with the design's M9 edit applied to its app.js (M9_EDIT below),
// and every script ends with loads of a file on which the stub parser throws, with a previous
// result and without one, so both sides must also handle the throw in the same way.
//
// Synthetic data only; no provider is named (each is found by its frozen.js). The old
// repositories are read only, from files that first equal their blobs at legacyHead, between
// the baseline's before and after manifests; without them (CI) the tests are skipped.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const REPO = path.resolve(__dirname, "..", "..");
const { frozenProviders } = require("../lib/load-provider.js");
const baseline = require("../lib/baseline.js");
const { mulberry32 } = require("../lib/prng.js");
const canon = require("../lib/canon.js");
const { mapLegacyMarkup } = require("../golden/waivers.js");
const { loadDataModule } = require("../../build/discover.js");
const { normalize, resolveRuntime } = require("../../core/contract/descriptor.js");
const { planScripts, readPiece } = require("../../build/scripts.js");
const { readLegacyBuild } = require("../../build/legacy-inline.js");
const E = require("../../core/export.js");

const oldRoot = process.env.S2C_OLD_ROOT || os.homedir();
const SEEDS = 8;
const FIXED = Date.parse("2026-01-02T03:04:06Z");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

const statementApps = frozenProviders({ root: REPO })
  .filter((p) => p.frozen.legacyRepo && p.frozen.kindModel && fs.existsSync(path.join(REPO, "providers", p.id, "provider.js")));
const oldPresent = statementApps.length > 0 && statementApps.every((p) => fs.existsSync(path.join(oldRoot, p.frozen.legacyRepo, "build.py")));
const SKIP = oldPresent ? false : "old repositories not present";

// ---------------------------------------------------------------- each provider's facts

// The provider's descriptor, runtime and old page parts, and what its old parser can return:
//   partialMonths  the pinned parser returns partialMonths (gen1 parsers never do)
//   partialStart   the old export layer handles partial and startDate months (export B and C)
//   downloadOnly   the pinned parser sets downloadOnly (the PDF + CSV parser)
//   csv            the descriptor declares csv inputs
//   investmentCash the investment-cash kind model (kinds are investment or cash)
function providerFacts({ id, frozen }) {
  const dir = path.join(REPO, "providers", id);
  const D = normalize(loadDataModule(path.join(dir, "provider.js")));
  const R = resolveRuntime(D);
  const repoDir = path.join(oldRoot, frozen.legacyRepo);
  const { parts } = readLegacyBuild(fs.readFileSync(path.join(repoDir, "build.py"), "utf8"));
  const oldFiles = parts.map(([, p]) => p).filter((p) => !p.startsWith("vendor/"));
  const parser = fs.readFileSync(path.join(dir, D.parserScript), "utf8");
  const oldExport = oldFiles.find((p) => path.basename(p) === "export.js");
  const exportText = oldExport ? fs.readFileSync(path.join(repoDir, oldExport), "utf8") : "";
  return {
    id, frozen, dir, D, R, repoDir, oldFiles,
    reach: {
      partialMonths: parser.includes("partialMonths"),
      partialStart: exportText.includes("startDate") && /\.partial\b/.test(exportText),
      downloadOnly: parser.includes("downloadOnly"),
      csv: R.inputs.includes("csv"),
      investmentCash: R.ui.kindModel === "investment-cash",
    },
  };
}

// ---------------------------------------------------------------- a synthetic universe

const ym = (n) => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
const lastDay = (m) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo, 0)).getUTCDate();
};
const HOSTILE = ["A&B", "<b>x</b>", "Q\"uote", "it's", "=Sum(1)", "Ünïcödé", "Ö-konto", "a, b"];
// A currency that breaks markup, as a raw-text fallback can produce (design §3.12, SX1). About
// half the universes give it to an account (every app gets at least two of its eight seeds),
// and every old app prints it raw.
const HOSTILE_CCY = "<i>X";
const ESCAPED_CCY = "&lt;i&gt;X";

function universe(rng, reach, labels) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const int = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const money = (a, b) => Math.round((a + rng() * (b - a)) * 100) / 100;
  const start = 2022 * 12 + int(0, 30);
  const months = Array.from({ length: int(3, 9) }, (_, i) => ym(start + i));
  const ccys = ["SGD", "USD", "MYR", rng() < 0.75 ? HOSTILE_CCY : "SGD"];
  const ps = [];
  for (let i = 0, n = int(1, 5); i < n; i++) {
    const kind = reach.investmentCash ? pick(["investment", "investment", "cash"]) : pick(["investment", "investment", "cash", "bank"]);
    const label = rng() < 0.3 ? `${pick(HOSTILE)} ${i}` : `Account ${i}`;
    const names = [...Array.from({ length: int(0, 5) }, (_, k) => `Old ${pick(HOSTILE)} ${i}.${k}`), label];
    const currency = pick(ccys);
    const p = { id: `${i}:${currency}${rng() < 0.2 ? "&\"'" : ""}`, label, names, kind, currency, months: {}, cash: [], trades: [] };
    let bal = rng() < 0.5 ? 0 : money(-500, 5000);
    const from = int(0, months.length - 1), to = int(from, months.length - 1);
    for (let k = from; k <= to; k++) {
      const m = months[k];
      const opening = bal;
      let net = 0;
      for (let c = int(0, 4); c > 0; c--) {
        const amount = money(-900, 900);
        const row = { date: `${m}-${String(int(1, lastDay(m))).padStart(2, "0")}`, amount, currency: rng() < 0.15 ? "USD" : currency,
          name: rng() < 0.2 ? pick(HOSTILE) : `Row ${c}`, kind: pick(["deposit", "withdrawal", "dividend", "fee"]) };
        if (rng() < 0.3) row.notes = rng() < 0.5 ? pick(HOSTILE) : "note";
        if (rng() < 0.1) row.balancing = true;
        p.cash.push(row);
        net += amount;
      }
      if (kind === "investment" || rng() < 0.1) {
        for (let t = int(0, 3); t > 0; t--) {
          p.trades.push({ date: `${m}-${String(int(1, lastDay(m))).padStart(2, "0")}`, ticker: pick(["FUND A", "FUND B", HOSTILE[0]]), qty: money(-50, 80) || 1,
            price: money(0.5, 20), currency, name: pick(["Buy", "Sell", "Switch"]) });
        }
      }
      const closing = Math.round((opening - net + (kind === "investment" ? money(-100, 300) : 0)) * 100) / 100;
      const mo = { monthEnd: `${m}-${String(rng() < 0.85 ? lastDay(m) : int(1, lastDay(m))).padStart(2, "0")}`, opening, closing, fx: rng() < 0.5 ? null : money(1.2, 1.5) };
      if (reach.partialStart && kind === "bank" && rng() < 0.3) mo.partial = true;
      if (reach.partialStart && k === from && rng() < 0.3) mo.startDate = `${m}-${String(int(2, 20)).padStart(2, "0")}`;
      p.months[m] = mo;
      bal = closing;
    }
    if (reach.downloadOnly && kind === "bank") p.fromStatements = rng() < 0.5;
    p.cash.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    p.trades.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    ps.push(p);
  }
  // Files: each PDF covers one to three consecutive months; a CSV provider also gets downloads.
  const files = [];
  for (let k = 0; k < months.length;) {
    const ms = months.slice(k, k + int(1, 3));
    files.push({ name: `statement-${ms[0]}.pdf`, type: rng() < 0.9 ? "application/pdf" : "", months: ms, kind: "pdf" });
    k += ms.length;
  }
  if (reach.csv) for (let c = int(0, 2); c > 0; c--) files.push({ name: `history-${c}.csv`, type: rng() < 0.7 ? "text/csv" : "", months: months.slice(int(0, months.length - 1)), kind: "csv" });
  const extras = [
    { name: "zz-not-a-statement.pdf", type: "application/pdf", months: [], kind: "pdf", error: "not a statement of this provider (ignored)" },
    { name: "zz-broken.pdf", type: "application/pdf", months: [], kind: "pdf", fail: "Invalid PDF structure." },
    { name: "notes.txt", type: "text/plain", months: [], kind: "txt" },
    { name: "UPPER.PDF", type: "", months: [months[months.length - 1]], kind: "pdf" },
    reach.csv ? { name: "both.csv", type: "application/pdf", months: [months[0]], kind: "csv" } : { name: "other.csv", type: "text/csv", months: [], kind: "csv" },
  ];
  const cats = Object.keys(labels).concat(["unknown", "no amount", "custom & <cat>", "not settled"]);
  const skipped = Array.from({ length: int(0, 12) }, () => {
    const p = pick(ps);
    const row = { date: `${pick(months)}-${String(int(1, 28)).padStart(2, "0")}`, category: pick(cats) };
    if (rng() < 0.8) row.detail = rng() < 0.3 ? pick(HOSTILE) : pick(["Interest", "Transfer", "Fee", ""]);
    if (rng() < 0.7) row.account = p.label;
    if (rng() < 0.5) row.portfolio = p.label;
    return row;
  });
  return { months, ps, files, extras, skipped, extra: { warnings: rng() < 0.6, unmapped: rng() < 0.6, late: rng() < 0.6, closed: rng() < 0.6, reconciled: rng() < 0.6 }, thrower: THROWER };
}

// The file the scripts' M9 phase loads: the stub parser throws whenever it is among the
// statements. Its message holds markup, so the status must escape it like any other value. It
// takes no draw from the generator, so the universes are those of the scripts before M9.
const THROWER = Object.freeze({ name: "zz-throws.pdf", type: "application/pdf", months: Object.freeze([]), kind: "pdf", throws: "cannot read <b>row 3</b> & \"x\" (synthetic)" });

// The stub parser: a deterministic result from the loaded files and the config, with the old
// parsers' config semantics (mergeInto followed with a cycle guard; a non-string name throws).
// It also throws a TypeError whenever U.thrower is among the statements; counts.threw counts
// every throw.
function makeParse(U, reach, log, counts = { threw: 0 }) {
  const byName = new Map([...U.files, ...U.extras, U.thrower].map((f) => [f.name, f]));
  return function parseStatements(statements, config = {}) {
    log(["parse", canon(statements.map((s) => JSON.parse(JSON.stringify(s)))), canon(JSON.parse(JSON.stringify(config === undefined ? null : config)))]);
    try {
      return parseOnce(statements, config);
    } catch (e) {
      counts.threw++;
      throw e;
    }
  };
  function parseOnce(statements, config) {
    if (statements.some((s) => s.id === U.thrower.name)) throw new TypeError(U.thrower.throws);
    const errors = [], covered = new Map();
    let nPdf = 0, nCsv = 0;
    for (const s of statements) {
      const f = byName.get(s.id);
      if (!f) {
        errors.push({ id: s.id, error: "unknown file" });
        continue;
      }
      if (f.error) {
        errors.push({ id: s.id, error: f.error });
        continue;
      }
      if (s.csv != null) nCsv++;
      else nPdf++;
      for (const m of f.months) if (!covered.has(m)) covered.set(m, s.id);
    }
    const ms = [...covered.keys()].sort();
    const inCov = (d) => covered.has(d.slice(0, 7));
    const byId = Object.fromEntries(U.ps.map((p) => [p.id, p]));
    const cfg = (id) => (config && typeof config === "object" ? config[id] : undefined) || {};
    const rootOf = (id) => {
      let cur = id;
      const seen = new Set([id]);
      for (;;) {
        const t = cfg(cur).mergeInto;
        if (!t || !byId[t] || seen.has(t)) return cur;
        seen.add(t);
        cur = t;
      }
    };
    const accounts = {}, portfolios = [];
    for (const p of U.ps) {
      const pm = Object.keys(p.months).filter((m) => covered.has(m)).sort();
      if (!pm.length) continue;
      portfolios.push({ id: p.id, label: p.label, names: p.names, firstMonth: pm[0], lastMonth: pm[pm.length - 1], kind: p.kind, currency: p.currency });
      const root = rootOf(p.id);
      if (cfg(root).exclude || cfg(p.id).exclude) continue;
      const name = (cfg(root).name || "").trim() || byId[root].label;
      const kind = cfg(root).kind || byId[root].kind;
      const a = (accounts[name] = accounts[name] || { kind, currency: byId[root].currency, months: {}, valuations: [], trades: [], cash: [] });
      for (const m of pm) {
        const src = p.months[m], t = a.months[m];
        if (!t) a.months[m] = { ...src };
        else {
          t.opening = E.round2(t.opening + src.opening);
          t.closing = E.round2(t.closing + src.closing);
          if (src.partial) t.partial = true;
        }
      }
      a.cash.push(...p.cash.filter((c) => inCov(c.date)));
      a.trades.push(...p.trades.filter((c) => inCov(c.date)));
      if (reach.downloadOnly && p.kind === "bank") a.downloadOnly = (a.downloadOnly !== false) && !p.fromStatements;
    }
    for (const a of Object.values(accounts)) {
      a.cash.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
      a.trades.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
      a.valuations = Object.keys(a.months).sort().map((m) => [a.months[m].monthEnd, a.months[m].closing]);
    }
    const first = ms[0];
    const firstOpenings = first ? Object.entries(accounts).filter(([, a]) => a.months[first] && Math.abs(a.months[first].opening) >= 0.005)
      .map(([name, a]) => ({ account: name, month: first, opening: a.months[first].opening })) : [];
    const names = Object.keys(accounts), x = U.extra;
    const r = {
      accounts, months: ms.map((m) => ({ month: m, id: covered.get(m) })), errors, gaps: E.monthGaps(ms), firstOpenings, portfolios,
      skippedRows: U.skipped.map((s) => ({ ...s })),
      statements: nPdf, downloads: nCsv, baseCurrency: "SGD",
      warnings: x.warnings && ms.length ? [`${ms[0]}: total <b>off</b> & "x"`, `${ms[ms.length - 1]}: it's fine`] : [],
      unmapped: x.unmapped && ms.length ? { [`Fund <${ms[0]}>`]: [ms[0]], "Other & Co": ms.slice(0, 2) } : {},
      reconciled: x.reconciled ? ms.slice(0, 2).map((m, i) => ({ month: m, account: names[i % Math.max(names.length, 1)] || "none", diff: i ? -12.5 : 7.25 })) : [],
      late: x.late ? ms.slice(1, 3).map((m) => ({ month: m, statement: ms[ms.length - 1], account: names[0] || "<none>", amount: -42.1 })) : [],
      closed: x.closed ? ms.slice(0, 1).map((m) => ({ account: names[0] || "gone & co", month: m, balance: 1234.5 })) : [],
    };
    if (reach.partialMonths) r.partialMonths = ms.length > 2 ? [ms[1]] : [];
    return r;
  }
}

// ---------------------------------------------------------------- the recording stub DOM

// The intended markup change of migration step M8 (design §3.12): the new app renders through
// html`…` and setHtml, so values the old apps printed raw now render as text. The universe's one
// markup-breaking value is the hostile currency, which the old cards, configurator and
// first-openings line print raw: in the old side's innerHTML strings it is replaced by its
// escaped form before the comparison (M8_EXPECTED). Everywhere else the strings stay
// byte-identical, with one reading rule for both sides: html escapes every interpolated value,
// the descriptor's page text included, where the old apps inserted that text raw, so the
// apostrophe of a card note or warning text is written &#39; now; the HTML parser reads &#39; and
// ' as the same character, in text and in the apps' double-quoted attributes, so &#39; is read as
// ' on both sides (PARSED_SAME). The browser's serialisation, which the golden UI snapshots
// compare, is the same for both forms.
const M8_EXPECTED = (v) => v.split(HOSTILE_CCY).join(ESCAPED_CCY);
const PARSED_SAME = (v) => v.split("&#39;").join("'");

// The intended behaviour change of migration step M9 (design §2.10, §3.12): the statement app
// catches a parse that throws and keeps the previous result (it renders the status alone, so
// the cards, the range and the configurator stay as they were), the status adds the warn line
// "Could not read these statements: <message>" as its last line, and addFiles goes on to clear
// the busy line; the next recompute that succeeds (a parse, or Clear) removes the line. The old
// apps let the exception escape. The old side runs with exactly that edit applied to its
// app.js: three swaps of lines that all seven old apps hold verbatim, each asserted to occur
// once. So the two logs must stay identical, throws included.
function M9_EDIT(text, where) {
  const swaps = [
    ["    state.result = state.statements.size ? P.parseStatements([...state.statements.values()], state.config) : null;\n",
      "    try {\n      state.result = state.statements.size ? P.parseStatements([...state.statements.values()], state.config) : null;\n"
      + "    } catch (e) {\n      state.parseError = e && e.message ? e.message : String(e);\n      renderStatus(state.result);\n      return;\n    }\n"
      + "    state.parseError = null;\n"],
    ["    if (!r && !state.failed.length) { el.innerHTML = \"\"; return; }\n", "    if (!r && !state.failed.length && !state.parseError) { el.innerHTML = \"\"; return; }\n"],
    ["    el.innerHTML = `<p>${parts.join(\"\")}</p>", "    if (state.parseError) warn.push(`Could not read these statements: ${esc(state.parseError)}`);\n    el.innerHTML = `<p>${parts.join(\"\")}</p>"],
  ];
  let out = text;
  for (const [from, to] of swaps) {
    assert.equal(out.split(from).length, 2, `${where}: the M9 edit's line ${JSON.stringify(from.trim().slice(0, 60))} occurs once`);
    out = out.replace(from, () => to);
  }
  return out;
}

function makeDom(log, { idMap = {}, legacyDom = null, side = "new", m8 = { raw: 0 } }) {
  const listeners = [], els = new Map();
  let cardButtons = [];
  const keyOf = (id) => `#${idMap[id] || id}`;
  const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'" };
  const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENT[e]);
  const field = {};
  let fieldHidden = false;
  Object.defineProperty(field, "hidden", { get: () => fieldHidden, set: (v) => {
    fieldHidden = !!v;
    log(["set", ".field", "hidden", fieldHidden]);
  } });
  function element(id) {
    const key = keyOf(id);
    if (els.has(key)) return els.get(key);
    const st = { innerHTML: "", textContent: "", hidden: false, disabled: false, value: "", options: [] };
    const isSelect = key === "#from" || key === "#to";
    const e = {
      id,
      get innerHTML() { return st.innerHTML; },
      set innerHTML(v) {
        v = String(v);
        st.innerHTML = v;
        const raw = v.split(HOSTILE_CCY).length - 1;
        m8.raw += raw;
        const shown = side === "old" && raw ? M8_EXPECTED(v) : v;
        log(["set", key, "innerHTML", PARSED_SAME(legacyDom && key === "#config-list" ? mapLegacyMarkup(shown, legacyDom) : shown)]);
        if (isSelect) {
          st.options = [...v.matchAll(/<option value="([^"]*)">/g)].map((m) => decode(m[1]));
          st.value = st.options.length ? st.options[0] : "";
        }
        if (key === "#cards") {
          cardButtons = v.split("<article class=\"card\">").slice(1).flatMap((a) => [...a.matchAll(/<button class="dl" data-account="([^"]*)" data-kind="([^"]*)">/g)].map((m) => {
            const b = { dataset: { account: decode(m[1]), kind: decode(m[2]) } };
            b.closest = (sel) => (sel === "button.dl" ? b : null);
            return b;
          }));
        }
      },
      get textContent() { return st.textContent; },
      set textContent(v) {
        st.textContent = String(v);
        log(["set", key, "textContent", st.textContent]);
      },
      get hidden() { return st.hidden; },
      set hidden(v) {
        st.hidden = !!v;
        log(["set", key, "hidden", st.hidden]);
      },
      get disabled() { return st.disabled; },
      set disabled(v) {
        st.disabled = !!v;
        log(["set", key, "disabled", st.disabled]);
      },
      get value() { return st.value; },
      set value(v) {
        v = String(v);
        st.value = isSelect ? (st.options.includes(v) ? v : "") : v;
        log(["set", key, "value", st.value]);
      },
      harnessSet(v) {
        st.value = isSelect ? (st.options.includes(String(v)) ? String(v) : "") : String(v);
      },
      options: () => st.options.slice(),
      classList: {
        add: (c) => log(["classList.add", key, c]),
        remove: (c) => log(["classList.remove", key, c]),
        toggle: (c, f) => log(["classList.toggle", key, c, f]),
      },
      setAttribute: (a, v) => log(["setAttribute", key, a, String(v)]),
      addEventListener: (type, fn) => {
        log(["listen", key, type]);
        listeners.push({ key, type, fn });
      },
      closest: (sel) => (key === "#mode" && sel === ".field" ? field : null),
      click: () => log(["click", key]),
      files: [],
    };
    els.set(key, e);
    return e;
  }
  const modeButtons = ["balance", "tradelog", "holdings"].map((mode) => ({
    dataset: { mode },
    classList: { toggle: (c, f) => log(["classList.toggle", `mode:${mode}`, c, f]) },
    setAttribute: (a, v) => log(["setAttribute", `mode:${mode}`, a, String(v)]),
  }));
  const blobs = new Map(), downloads = [];
  let urls = 0;
  const documentElement = { tag: "html" };
  const document = {
    querySelector(sel) {
      const m = /^#([\w-]+)$/.exec(sel);
      if (!m) throw new Error(`stub DOM: selector ${sel}`);
      return element(m[1]);
    },
    querySelectorAll(sel) {
      if (sel === "#mode button") return modeButtons;
      if (sel === "#cards button.dl") return cardButtons.slice();
      throw new Error(`stub DOM: selectorAll ${sel}`);
    },
    getElementById(id) {
      if (id === "pdf-worker-src") {
        log(["getElementById", id]);
        return { textContent: "/* worker */" };
      }
      return element(id);
    },
    createElement(tag) {
      if (tag !== "a") throw new Error(`stub DOM: createElement ${tag}`);
      const a = { href: "", download: "", click() {
        log(["anchor.click", a.download, a.href]);
        downloads.push({ name: a.download, blob: blobs.get(a.href) });
      }, remove() { log(["anchor.remove"]); } };
      return a;
    },
    body: { appendChild: (a) => log(["body.appendChild", a.download]) },
    documentElement,
    addEventListener: (type, fn) => {
      log(["listen", "document", type]);
      listeners.push({ key: "document", type, fn });
    },
  };
  const URLs = {
    createObjectURL: (blob) => {
      const u = `blob:stub/${++urls}`;
      blobs.set(u, blob);
      log(["createObjectURL", blob.type, blob.size]);
      return u;
    },
    revokeObjectURL: (u) => log(["revokeObjectURL", u]),
  };
  return { document, element, URL: URLs, listeners, downloads, cardButtons: () => cardButtons.slice(), documentElement };
}

// ---------------------------------------------------------------- one side, one seed

// The log of one page (side "old" or "new") through the seeded script. appText replaces the
// statement app (plan piece 13) for the sensitivity test; the old app runs with M9_EDIT.
// counts.threw counts the stub parser's throws.
async function runSide(side, prov, seed, U, { appText = null, m8 = { raw: 0 }, counts = { threw: 0 } } = {}) {
  const entries = [];
  const log = (x) => entries.push(x);
  const { frozen, reach } = prov;
  const legacyDom = side === "old" ? frozen.legacyDom : null;
  const idMap = legacyDom ? Object.fromEntries([["list", "config-list"], ["count", "config-count"], ["reset", "config-reset"]].map(([k, v]) => [legacyDom[k].slice(1), v])) : {};
  const dom = makeDom(log, { idMap, legacyDom, side, m8 });
  const store = new Map();
  const rng = mulberry32(seed * 7919 + 13);
  const pick = (a) => a[Math.floor(rng() * a.length)];
  // Storage seeds (raw strings), as an earlier session or another page may have left them.
  const mk = frozen.storage.modeKey, ck = frozen.storage.configKey;
  const modeSeed = pick([null, null, "tradelog", "holdings", "balance", "garbage", ""]);
  if (modeSeed !== null) store.set(mk, modeSeed);
  const p0 = U.ps[0].id, p1 = (U.ps[1] || U.ps[0]).id, p2 = (U.ps[2] || U.ps[0]).id;
  const cfgSeed = pick([null, null, null, "{}", "{not json", "null", "[]", "5", "\"x\"",
    JSON.stringify({ [p0]: { name: "  Renamed & <b>  " } }), JSON.stringify({ [p0]: { kind: "bank" } }), JSON.stringify({ [p0]: { kind: "foo" } }),
    JSON.stringify({ [p0]: { kind: "cash" }, [p1]: { kind: "investment" } }), JSON.stringify({ [p1]: { mergeInto: p0 } }), JSON.stringify({ [p0]: { mergeInto: p1 }, [p1]: { mergeInto: p0 } }),
    JSON.stringify({ [p2]: { mergeInto: p1 }, [p1]: { mergeInto: p0 } }), JSON.stringify({ [p0]: { exclude: true } }), JSON.stringify({ [p0]: { mergeInto: "nope" } }),
    JSON.stringify({ [p0]: { name: 5 } })]);
  if (cfgSeed !== null) store.set(ck, cfgSeed);
  const localStorage = {
    getItem: (k) => {
      log(["ls.get", k]);
      return store.has(k) ? store.get(k) : null;
    },
    setItem: (k, v) => {
      log(["ls.set", k, String(v)]);
      store.set(k, String(v));
    },
  };
  const pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument(o) {
      log(["pdf.getDocument", o.isEvalSupported, o.data.length]);
      const spec = JSON.parse(Buffer.from(o.data).toString("utf8"));
      if (spec.fail) return { promise: Promise.reject(new Error(spec.fail)) };
      return { promise: Promise.resolve({
        numPages: spec.pages.length,
        getPage: async (i) => ({ getTextContent: async () => ({ items: spec.pages[i - 1] }) }),
        destroy: async () => log(["pdf.destroy"]),
      }) };
    },
  };
  Object.defineProperty(pdfjsLib.GlobalWorkerOptions, "workerSrc", { set: (v) => log(["pdf.workerSrc", String(v)]) });
  const context = vm.createContext({
    document: dom.document, localStorage, pdfjsLib, URL: dom.URL, Blob, TextEncoder, TextDecoder, console,
    setTimeout: (fn, ms) => {
      log(["setTimeout", ms]);
      return 0;
    },
  });
  context.window = context;
  context.self = context;
  vm.runInContext(`(() => { const R = Date; const F = ${FIXED}; globalThis.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(F); } static now() { return F; } }; })();`, context);
  const parse = makeParse(U, reach, log, counts);
  const run = (code, label) => {
    try {
      vm.runInContext(code, context, { filename: label });
    } catch (e) {
      log(["load-throw", String(e && e.message)]);
    }
  };
  if (side === "old") {
    for (const p of prov.oldFiles) {
      const app = path.basename(p) === "app.js";
      const text = fs.readFileSync(path.join(prov.repoDir, p), "utf8");
      if (app) {
        // The old app composes P from its parser's window global; its name is read from that line.
        const m = /const P = (?:Object\.assign\(\{\}, window\.StatementExport, )?window\.([A-Za-z]+)\)?;/.exec(text);
        assert.ok(m, `${p}: the old app composes P from a window global`);
        context[m[1]] = Object.assign({}, context[m[1]], { parseStatements: parse });
      }
      run(app ? M9_EDIT(text, p) : text, `old ${p}`);
    }
  } else {
    for (const piece of planScripts(prov.D, prov.dir)) {
      if (piece.n === "1" || piece.n === "2") continue;
      if (piece.n === "13") context[prov.D.parserGlobal] = Object.assign({}, context[prov.D.parserGlobal], { parseStatements: parse });
      run(piece.n === "13" && appText !== null ? appText : readPiece(piece), `new ${piece.label}`);
    }
  }
  // ---- actions
  const fire = async (key, type, event) => {
    for (const l of dom.listeners.filter((x) => x.key === key && x.type === type)) {
      try {
        await l.fn(event);
      } catch (e) {
        log(["throw", key, type, String(e && e.message)]);
      }
    }
  };
  const flush = async () => {
    for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
  };
  const fileOf = (f) => {
    const content = f.kind === "csv" ? `Date,Amount\n${f.months.join("\n")}\n` : JSON.stringify(f.fail ? { fail: f.fail } : { pages: [[
      { str: `Statement ${f.name}`, transform: [1, 0, 0, 10, 40, 700], width: 80, height: 10 },
      { str: f.months.join(" "), transform: [1, 0, 0, 10, 140, 700.2], width: 60, height: 0 },
    ], [{ str: "Page two", transform: [1, 0, 0, 12, 50, 650], width: 30, height: 12 }]] });
    const bytes = Buffer.from(content, "utf8");
    return { name: f.name, type: f.type, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), text: async () => content };
  };
  const all = [...U.files, ...U.extras];
  const batchA = U.files.filter(() => rng() < 0.6).concat([pick(U.extras)]);
  const batchB = [...U.files.slice().reverse(), ...U.extras.filter(() => rng() < 0.5)];
  const clickAll = async () => {
    const before = dom.downloads.length;
    for (const b of dom.cardButtons()) await fire("#cards", "click", { target: b });
    await fire("#cards", "click", { target: { closest: () => null } });
    for (const t of ["#accounts", "#combined", "#zip"]) if (!dom.element(t.slice(1)).disabled) await fire(t, "click", {});
    for (const d of dom.downloads.slice(before)) {
      const bytes = d.blob ? Buffer.from(await d.blob.arrayBuffer()) : Buffer.alloc(0);
      log(["blob", d.name, d.blob && d.blob.type, bytes.length, sha(bytes)]);
    }
  };
  const setRange = async (a, b) => {
    dom.element("from").harnessSet(a);
    dom.element("to").harnessSet(b);
    await fire(rng() < 0.5 ? "#from" : "#to", "change", { type: "change" });
  };
  const modeClick = async (mode) => fire("#mode", "click", { target: { closest: (sel) => (sel === "button[data-mode]" ? { dataset: { mode } } : null) } });
  const drop = async (files) => {
    await fire("document", "dragenter", { preventDefault() {}, target: dom.documentElement });
    await fire("document", "dragover", { preventDefault() {}, target: {} });
    await fire("document", "dragleave", { preventDefault() {}, target: rng() < 0.5 ? dom.documentElement : {} });
    await fire("document", "drop", { preventDefault() {}, target: {}, dataTransfer: { files: files.map(fileOf) } });
    await flush();
  };
  const pickFiles = async (files) => {
    dom.element("picker").files = files.map(fileOf);
    await fire("#picker", "change", {});
    await flush();
  };
  const ranges = () => {
    const o = dom.element("from").options();
    if (!o.length) return [["", ""]];
    const r = [[o[0], o[o.length - 1]], [o[o.length - 1], o[0]], [o[0], o[0]], [o[o.length - 1], o[o.length - 1]]];
    if (o.length > 2) r.push([o[1], o[o.length - 2]], [o[Math.floor(o.length / 2)], o[o.length - 1]]);
    return r;
  };
  const config = async (fieldName, value, checked) => {
    const row = pick(U.ps);
    const el = { dataset: { field: fieldName }, value, checked };
    const target = { closest: (sel) => (sel === "[data-field]" ? el : sel === ".account-row" || sel === ".portfolio" ? { dataset: { id: row.id } } : null) };
    await fire("#config-list", "change", { target });
    if (rng() < 0.2) await fire("#config-list", "change", { target: { closest: () => null } });
  };
  // The script.
  await drop(batchA);
  await pickFiles(batchB);
  await fire("#drop", "keydown", { key: "Enter", preventDefault() { log(["preventDefault"]); } });
  await fire("#drop", "keydown", { key: "x", preventDefault() { log(["preventDefault"]); } });
  await fire("#drop", "click", {});
  for (const mode of ["tradelog", "holdings", "balance"].sort(() => rng() - 0.5)) {
    await modeClick(mode);
    for (const [a, b] of ranges()) {
      await setRange(a, b);
      if (rng() < 0.5) await clickAll();
    }
    await clickAll();
  }
  for (let i = Math.floor(rng() * 5); i >= 0; i--) {
    const op = pick(["name", "kind", "mergeInto", "include"]);
    const other = pick(U.ps).id;
    if (op === "name") await config("name", pick(["  New & <name>  ", "", "Merged", "=Renamed \"A&B\", <x>"]), false);
    else if (op === "kind") await config("kind", pick(["", "investment", "cash"]), false);
    else if (op === "mergeInto") await config("mergeInto", pick(["", other]), false);
    else await config("include", "on", rng() < 0.5);
    await modeClick(pick(["balance", "tradelog", "holdings"]));
    await clickAll();
  }
  await fire("#config-reset", "click", {});
  await clickAll();
  await fire("#clear", "click", {});
  await clickAll();
  const csvOnly = U.files.filter((f) => f.kind === "csv");
  if (csvOnly.length) {
    await pickFiles(csvOnly);
    await modeClick("balance");
    await clickAll();
    await fire("#clear", "click", {});
  }
  await pickFiles(all.filter(() => rng() < 0.7));
  await setRange(...pick(ranges()));
  await clickAll();
  // M9: parses that throw (the stub throws while U.thrower is loaded). With a previous result:
  // every statement file, then the thrower; downloads, a mode, a range, a configurator change
  // (which parses again and throws again) and downloads; Clear ends the error. Then the thrower
  // alone, with no previous result, a mode, and Clear. The thrower comes by a drop, whose
  // listener returns the load's promise, so a throw that escapes the app (a mutant's) is
  // logged as a "throw" entry instead of being left unhandled.
  await fire("#clear", "click", {});
  await pickFiles(U.files);
  await clickAll();
  await drop([U.thrower]);
  await clickAll();
  await modeClick(pick(["balance", "tradelog", "holdings"]));
  await setRange(...pick(ranges()));
  await clickAll();
  await config("name", "Renamed after the error", false);
  await clickAll();
  await fire("#clear", "click", {});
  await drop([U.thrower]);
  await modeClick("balance");
  await clickAll();
  await fire("#clear", "click", {});
  await flush();
  return entries;
}

// Both sides for one seed; the index of the first differing log entry, or -1. threw: the stub
// parser's throws on each side.
async function compareSeed(prov, seed, opts = {}) {
  const U = universe(mulberry32(seed * 104729 + prov.id.length), prov.reach, prov.R.ui.skipLabels);
  const unhandled = [];
  const onRejection = (e) => unhandled.push(String(e && e.message));
  process.on("unhandledRejection", onRejection);
  try {
    const m8 = { old: { raw: 0 }, new: { raw: 0 } };
    const threw = { old: { threw: 0 }, new: { threw: 0 } };
    const a = await runSide("old", prov, seed, U, { m8: m8.old, counts: threw.old });
    a.push(["unhandled", unhandled.splice(0).join("|")]);
    const b = await runSide("new", prov, seed, U, { ...opts, m8: m8.new, counts: threw.new });
    b.push(["unhandled", unhandled.splice(0).join("|")]);
    const n = Math.max(a.length, b.length);
    let i = 0;
    while (i < n && canon(a[i] === undefined ? null : a[i]) === canon(b[i] === undefined ? null : b[i])) i++;
    return { a, b, at: i < n ? i : -1, m8, threw: { old: threw.old.threw, new: threw.new.threw } };
  } finally {
    process.removeListener("unhandledRejection", onRejection);
  }
}

const show = (x) => (x === undefined ? "(end)" : JSON.stringify(x).slice(0, 800));

// ---------------------------------------------------------------- the tests

test("every old statement app and the statement app on the same seeded scripts write the same DOM, storage and downloads", { skip: SKIP }, async (t) => {
  const { problems, manifests } = await baseline.before(statementApps.map((p) => p.frozen), { live: false, oldRoot });
  assert.deepEqual(problems, [], "the old repositories are at their legacyHead");
  try {
    const provs = statementApps.map(providerFacts);
    for (const prov of provs) assert.deepEqual(baseline.checkGit(prov.frozen, { oldRoot, files: ["build.py", ...prov.oldFiles] }), [], `${prov.id}: the old page's parts equal their blobs`);
    assert.equal(provs.length, 7, "seven statement apps");
    const totals = { runs: 0, entries: 0, downloads: 0, parses: 0, rawOld: 0, rawNew: 0, appsRaw: 0, threw: 0 };
    for (const prov of provs) {
      let appRaw = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const { a, b, at, m8, threw } = await compareSeed(prov, seed);
        totals.runs++;
        // M9: every script makes the parse throw at least three times (a drop, a configurator
        // change, a picker load), and on the same calls on both sides.
        assert.ok(threw.old >= 3 && threw.new === threw.old, `${prov.id} seed ${seed}: the stub parser threw ${threw.old} times on the old side, ${threw.new} on the new`);
        totals.threw += threw.old;
        totals.entries += a.length;
        totals.downloads += a.filter((x) => x[0] === "blob").length;
        totals.parses += a.filter((x) => x[0] === "parse").length;
        totals.rawOld += m8.old.raw;
        totals.rawNew += m8.new.raw;
        appRaw += m8.old.raw;
        if (at >= 0) {
          const context = a.slice(Math.max(0, at - 2), at).map((x) => `  same ${show(x)}`).join("\n");
          assert.fail(`${prov.id} seed ${seed}: the logs differ at entry ${at} of ${a.length}/${b.length}\n${context}\n  old  ${show(a[at])}\n  new  ${show(b[at])}`);
        }
      }
      if (appRaw) totals.appsRaw++;
    }
    // Not vacuous: the scripts reach downloads and parses on every run.
    assert.ok(totals.downloads > 50 * totals.runs && totals.parses > 4 * totals.runs, JSON.stringify(totals));
    // M8: the old apps printed the hostile currency raw, the statement app never does.
    assert.equal(totals.rawNew, 0, "the statement app writes no raw markup of the hostile currency");
    assert.equal(totals.appsRaw, provs.length, "every old app printed the hostile currency raw, so M8_EXPECTED is exercised for each");
    t.diagnostic(`${provs.length} apps, ${totals.runs} runs, ${totals.entries} log entries, ${totals.downloads} downloads, ${totals.parses} parses (${totals.threw} of them throwing): 0 differences; `
      + `the hostile currency printed raw ${totals.rawOld} times by ${totals.appsRaw} old apps, escaped by the statement app every time`);
  } finally {
    assert.deepEqual(baseline.after(manifests), [], "nothing in the old repositories changed");
  }
});

test("the comparison is sensitive: a statement app with one changed text, label or rule differs from every old app", { skip: SKIP }, async () => {
  const { problems, manifests } = await baseline.before(statementApps.map((p) => p.frozen), { live: false, oldRoot });
  assert.deepEqual(problems, []);
  try {
    const provs = statementApps.map(providerFacts);
    const app = fs.readFileSync(path.join(REPO, "core", "app", "statement-app.js"), "utf8");
    const mutants = [
      ["the configurator's Cash-like label", "cash: \"Cash-like\"", "cash: \"Cash like\""],
      ["the empty-range card text", "No activity in the selected months.", "No activity in these months."],
      ["Download all without the Accounts file", "const files = [accountsFile()];", "const files = [];"],
      ["the skipped-row order", "(a === \"unknown\") - (b === \"unknown\")", "(b === \"unknown\") - (a === \"unknown\")"],
      // Renders that bypass escaping, as before M8: every value raw, arrays joined with "".
      ["renders without escaping", "const { html, setHtml, cssToken } = self.StatementEscape;",
        "const raw = (v) => (Array.isArray(v) ? v.map(raw).join(\"\") : String(v)); const html = (s, ...v) => s.reduce((o, x, i) => o + x + (i < v.length ? raw(v[i]) : \"\"), \"\"); "
        + "const setHtml = (el, h) => { el.innerHTML = h; }; const cssToken = (k) => k;"],
      // M9: the parse error uncaught, as before M9; the error line never removed; the previous
      // result dropped on the error.
      ["a parse error uncaught", "    try {\n      state.result = state.statements.size ? P.parseStatements([...state.statements.values()], state.config) : null;\n"
        + "    } catch (e) {\n      state.parseError = e && e.message ? e.message : String(e);\n      renderStatus(state.result);\n      return;\n    }\n    state.parseError = null;\n",
      "    state.result = state.statements.size ? P.parseStatements([...state.statements.values()], state.config) : null;\n"],
      ["the error line kept after a parse that succeeds", "    state.parseError = null;\n", ""],
      ["the previous result dropped on a parse error", "      renderStatus(state.result);\n      return;\n", "      state.result = null;\n      fillRange([]);\n      render();\n      return;\n"],
    ];
    for (const [what, from, to] of mutants) {
      assert.equal(app.split(from).length, 2, `${what}: the app holds the text once`);
      const appText = app.replace(from, () => to);
      for (const prov of provs) {
        let caught = false;
        for (let seed = 1; seed <= SEEDS && !caught; seed++) caught = (await compareSeed(prov, seed, { appText })).at >= 0;
        assert.ok(caught, `${what}: no difference for ${prov.id}`);
      }
    }
  } finally {
    assert.deepEqual(baseline.after(manifests), []);
  }
});

test("the reachability facts come from each provider's files, not from a table", { skip: SKIP }, () => {
  const provs = statementApps.map(providerFacts);
  const count = (k) => provs.filter((p) => p.reach[k]).length;
  // What the pinned parsers and old export layers show (decision 111's supersets).
  assert.deepEqual({ partialMonths: count("partialMonths"), partialStart: count("partialStart"), downloadOnly: count("downloadOnly"), csv: count("csv"), investmentCash: count("investmentCash") },
    { partialMonths: 3, partialStart: 3, downloadOnly: 1, csv: 1, investmentCash: 1 });
  for (const p of provs) {
    if (p.reach.downloadOnly) assert.ok(p.reach.csv && p.reach.partialMonths && p.reach.partialStart, `${p.id}: the PDF + CSV app's parser is the superset`);
    if (p.reach.investmentCash) assert.ok(!p.reach.partialMonths && !p.reach.partialStart, `${p.id}: a gen1 parser`);
  }
});
