// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The custom xlsx app's files module and harness hooks (providers/etoro/files.js and test.js;
// docs/TESTING.md, unit tests). Synthetic workbooks only, written with test/lib/mkxlsx.js and
// read back with core/xlsx.js. They give a statement with entries and anchors in most months,
// a month with an anchor but no entries (in two of the three modes), a month with neither, a
// month that only one mode lists, a one-month statement, a workbook that is not a statement and
// bytes that are not a workbook.
//
// In CI: the exact records of a one-month statement (every name collapses, the zip's too); no
// card yet an enabled Download all holding only the Balances CSV when anchors but no entries
// are in range; #zip disabled with nothing in range; no records without a result or with an
// {error}; on every state of every workbook, the card and #zip rules, the names, and CSVs that
// parse back with the expected header; the browser branch, also after export and parser in the
// page's script order; the test.js hooks.
//
// With the old repositories present: files.js holds the old lines verbatim (the old sources are
// checked against their blobs at legacyHead first), and the old page's own src/app.js runs in a
// vm sandbox with a stub DOM, reading the same .xlsx bytes with its own reader, export layer and
// parser (read-only require). Every download it offers, in every mode and range, with the mode
// clicked before and after the range, across failed and replaced files and Clear, must equal
// downloads() on three paths: files.js on the old page's namespace, the test.js hooks on the new
// parser over core export, and loadNode with the old parser (the replay path). Under the same
// fixed clock, every zip it builds must equal zipParts(files, now) byte for byte.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const E = require("../../core/export.js");
const Xlsx = require("../../core/xlsx.js");
const { zipParts } = require("../../core/zip.js");
const { renderXlsx } = require("../lib/mkxlsx.js");
const unzip = require("../lib/unzip.js");
const { parseCsv } = require("../lib/csvread.js");
const baseline = require("../lib/baseline.js");
const { FIXED_TIME } = require("../lib/browser.js");
const { loadNode, frozenRuntime } = require("../lib/load-provider.js");

const REPO = path.resolve(__dirname, "..", "..");
const ID = "etoro";
const DIR = path.join(REPO, "providers", ID);
const EtoroFiles = require(path.join(DIR, "files.js"));
const hooks = require(path.join(DIR, "test.js"));
const parser = require(path.join(DIR, "parser.js"));
const frozen = require(path.join(DIR, "frozen.js"));
const R = frozenRuntime(ID, frozen);
const MODES = frozen.modeValues;
const SLUG = frozen.naming.slug;
// The page's composition: core export, then the parser (its openingBalance wins).
const P = Object.assign({}, E, parser);
const oldRoot = process.env.S2C_OLD_ROOT || os.homedir();

function deepFreeze(v) {
  if (v && typeof v === "object" && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

// ---------------------------------------------------------------- synthetic workbooks

const round2 = (n) => Math.round(n * 100) / 100;
const SERIAL0 = Date.UTC(1899, 11, 30);
const serial = (iso) => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - SERIAL0) / 864e5;
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const ACTIVITY = ["Date", "Type", "Details", "Amount", "Realized Equity Change", "Realized Equity", "Position ID"];
const HOLDINGS = ["Snapshot Date", "Position ID", "Direction", "Leverage", "Units", "Open Rate", "Current Rate", "Value in USD"];

// rows: [iso | null, type, details, amount, realized change, position id?, "serial"?]; the
// Realized Equity column is the running total. holdings: [iso, position id, value in USD,
// direction?, leverage?, units?, open rate?, current rate?]. endPl: open positions' P/L at the
// end, or null for no ending total.
function workbook(s) {
  let realized = s.beginRealized;
  const activity = [["SYNTHETIC TEST DATA"], ACTIVITY];
  for (const [iso, type, details, amount, change, pos = "", how = "text"] of s.rows) {
    realized = round2(realized + change);
    const date = iso === null ? null : how === "serial" ? serial(iso) + 0.5 : `${dmy(iso)} 10:00:00`;
    activity.push([date, type, details, amount, change, realized, pos]);
  }
  const summary = [["Account Summary", null], ["Currency", s.currency], ["Start Date", dmy(s.start)], ["End Date", dmy(s.end)],
    ["Beginning Realized Equity", s.beginRealized], ["Beginning Unrealized Equity", s.beginTotal]];
  if (s.endPl !== null) summary.push(["Ending Realized Equity", realized], ["Ending Unrealized Equity", round2(realized + s.endPl)]);
  const wb = { "Account Summary": summary, "Account Activity": activity };
  if (s.holdings) {
    wb.Holdings = [HOLDINGS, ...s.holdings.map(([iso, pos, value, dir = "Buy", lev = "x1", units = 1, open = 1, cur = 1]) => [dmy(iso), pos, dir, lev, units, open, cur, value])];
  }
  if (s.closed) wb["Closed Positions"] = [["Position ID", "Close Date", "Amount"], ...s.closed.map(([pos, iso, amount]) => [pos, dmy(iso), amount])];
  return wb;
}

const SPECS = {
  // Four months. March has one anchor (a month-end snapshot whose P/L did not change) and no
  // entries in balance and month modes; in day mode a mid-month snapshot gives it entries.
  basic: {
    currency: "USD", start: "2025-01-01", end: "2025-04-30", beginRealized: 1000, beginTotal: 1000, endPl: 8,
    rows: [
      ["2025-01-02", "Deposit", "Synthetic transfer in", 500, 500],
      ["2025-01-03", "Open Position", "AAA/USD", 300, 0, "1001"],
      ["2025-01-10", "Open Position", "BBB/USD", 100, 0, "1002", "serial"],
      ["2025-01-15", "Dividend", "AAA/USD", 0, 2.5, "1001"],
      ["2025-01-20", "Overnight fee", "BBB/USD", 0, -0.75, "1002"],
      ["2025-01-21", "Weekend fee", "BBB/USD", 0, -0.25, "1002", "serial"],
      ["2025-02-05", "Position closed", "AAA/USD", 300, 45.25, "1001"],
      ["2025-02-10", "Withdraw Request", "Synthetic transfer out", -200, -200],
      ["2025-02-11", "Adjustment", 'Synthetic, "quoted" note', 0, 1.5],
      ["2025-02-11", "Interest Payment", "Synthetic interest", 0, 0.4],
      ["2025-04-03", "Deposit", '=Synthetic +formula, "q"', 50, 50],
      ["2025-04-15", "Dividend", "BBB/USD", 0, 1.1, "1002"],
      ["2025-04-16", "SDRT", "Synthetic tax", 0, -0.3],
      ["2025-04-30", "Overnight refund", "BBB/USD", 0, 0.05, "1002"],
    ],
    holdings: [["2025-01-31", "1001", 320], ["2025-01-31", "1002", 110], ["2025-01-31", "9001", 50, "Sell", "x2", 10, 4, 5],
      ["2025-02-14", "1002", 112], ["2025-02-28", "1002", 110], ["2025-03-14", "1002", 115], ["2025-03-31", "1002", 110]],
    closed: [["1001", "2025-02-05", 300]],
  },
  // One month.
  single: {
    currency: "EUR", start: "2025-06-01", end: "2025-06-30", beginRealized: 0, beginTotal: 0, endPl: 5,
    rows: [["2025-06-02", "Deposit", "Synthetic transfer in", 1000, 1000], ["2025-06-15", "Dividend", "CCC/EUR", 0, 3]],
  },
  // The statement ends in a month without activity: March has only the ending anchor.
  endonly: {
    currency: "USD", start: "2025-01-01", end: "2025-03-10", beginRealized: 200, beginTotal: 200, endPl: 0,
    rows: [["2025-01-05", "Deposit", "Synthetic transfer in", 100, 100], ["2025-02-07", "Interest Payment", "Synthetic interest", 0, 0.6]],
  },
  // February has a row that changes nothing, and there are no anchors at all.
  gap: {
    currency: "USD", start: "2025-01-01", end: "2025-03-31", beginRealized: 0, beginTotal: 0, endPl: null,
    rows: [["2025-01-05", "Deposit", "Synthetic transfer in", 100, 100], ["2025-02-07", "Open Position", "DDD/USD", 50, 0, "3001"],
      ["2025-03-09", "Deposit", "Synthetic transfer in", 20, 20]],
  },
  // March is listed in day mode only (a mid-month snapshot); one row has no date (a warning).
  dayonly: {
    currency: "USD", start: "2025-01-01", end: "2025-03-31", beginRealized: 0, beginTotal: 0, endPl: null,
    rows: [["2025-01-05", "Deposit", "Synthetic transfer in", 300, 300], ["2025-01-06", "Open Position", "EEE/USD", 200, 0, "2001"],
      ["2025-02-07", "Dividend", "EEE/USD", 0, 0.9, "2001"], [null, "Unknown row", "Synthetic", 0, 0]],
    holdings: [["2025-01-31", "2001", 205], ["2025-03-14", "2001", 207]],
  },
};
const STATEMENTS = ["basic", "single", "endonly", "gap", "dayonly"];

const FILES = {
  ...Object.fromEntries(STATEMENTS.map((id) => [id, { name: `${id}.xlsx`, bytes: renderXlsx(workbook(SPECS[id]), { deflate: id === "basic" || id === "dayonly" }) }])),
  notstatement: { name: "notstatement.xlsx", bytes: renderXlsx({ "Account Summary": [["Currency", "USD"]] }) },
  bogus: { name: "bogus.xlsx", bytes: Buffer.from("SYNTHETIC TEST DATA, not a workbook\n") },
  notes: { name: "notes.txt", bytes: Buffer.from("SYNTHETIC TEST DATA\n") },
};

const readXlsx = (bytes) => Xlsx.read(new Uint8Array(bytes), async (d) => new Uint8Array(zlib.inflateRawSync(d)));

// What extraction gives for a file: its statement object, or nothing when the reader fails.
async function statementsOf(id) {
  const f = FILES[id];
  try {
    return [{ id: f.name, workbook: await readXlsx(f.bytes) }];
  } catch {
    return [];
  }
}

// The hooks' context: from <= to, as the page's range() returns them.
const swap = ([from, to]) => (from && to && from > to ? [to, from] : [from, to]);
function ctxOf(Pn, mode, range) {
  const [from, to] = swap(range);
  return { P: Pn, R, mode, config: null, from, to };
}
// Every (from, to) the page's two selects can show: all pairs of its months, reversed included.
const pairs = (months) => months.flatMap((a) => months.map((b) => [a, b]));

// ---------------------------------------------------------------- create, names, the rules

test("create checks its context and returns span, files, zipName and downloads", () => {
  const ok = { P, result: () => null, range: () => ({ from: "", to: "" }), naming: frozen.naming };
  assert.deepEqual(Object.keys(EtoroFiles), ["create"]);
  assert.deepEqual(Object.keys(EtoroFiles.create(ok)), ["span", "files", "zipName", "downloads"]);
  for (const [what, bad] of [
    ["no context", undefined],
    ["a string", "ctx"],
    ["no P", { ...ok, P: undefined }],
    ["P not an object", { ...ok, P: "P" }],
    ["result not a function", { ...ok, result: null }],
    ["range not a function", { ...ok, range: { from: "", to: "" } }],
    ["no naming", { ...ok, naming: undefined }],
    ["slug not a string", { ...ok, naming: { slug: 5 } }],
  ]) assert.throws(() => EtoroFiles.create(bad), TypeError, what);
});

test("one month: the exact records in the old order; every name collapses, the zip's too", async () => {
  const st = await statementsOf("single");
  const ctx = ctxOf(P, "balance", ["2025-06", "2025-06"]);
  const r = hooks.parse(st, ctx);
  const NAME = r.account.name;
  assert.ok(typeof NAME === "string" && NAME.length > 0);
  const T = [
    "date,amount,currency,name,notes",
    "2025-06-02,1000.00,EUR,Deposit,Synthetic transfer in",
    '2025-06-30,8.00,EUR,"Returns (month-end adjustment, 2025-06)",Dividends 3.00; Change in unrealized gain/loss 5.00',
    "",
  ].join("\n");
  const Q = [
    "!Type:Bank", "D2025-06-01", "T0.00", "POpening Balance", `L[${NAME}]`, "^",
    "D2025-06-02", "T1000.00", "PDeposit", "MSynthetic transfer in", "^",
    "D2025-06-30", "T8.00", "PReturns (month-end adjustment, 2025-06)", "MDividends 3.00; Change in unrealized gain/loss 5.00", "^", "",
  ].join("\n");
  const B = "date,balance,currency\n2025-06-30,1008.00,EUR\n";
  const A = `Account type,Name,Balance,Currency,Balance Date\nInvestment,${NAME},0.00,EUR,2025-06-01\n`;
  const files = [
    { kind: "transactions", name: `${NAME} - transactions - 2025-06.csv`, text: T },
    { kind: "qif", name: `${NAME} - 2025-06.qif`, text: Q },
    { kind: "balances", name: `${NAME} - balances - 2025-06.csv`, text: B },
    { kind: "accounts", name: `${NAME} accounts - 2025-06.csv`, text: A },
  ];
  assert.deepEqual(hooks.downloads(r, ctx), [
    ...files.map(({ kind, name, text }) => ({ trigger: "card", account: null, kind, name, type: "text/csv", text })),
    { trigger: "zip", account: null, kind: null, name: `${SLUG}-csv-2025-06.zip`, type: "application/zip", files: files.map(({ name, text }) => ({ name, text })) },
  ]);
  const F = EtoroFiles.create({ P, result: () => r, range: () => ({ from: "2025-06", to: "2025-06" }), naming: frozen.naming });
  assert.equal(F.span(), "2025-06");
  assert.equal(F.zipName(), `${SLUG}-csv-2025-06.zip`);
  const { out, entries, anchors, start } = F.files();
  assert.deepEqual(out.map((f) => [f.kind, f.label, f.count]), [["transactions", "Transactions CSV", 2], ["qif", "QIF", 2], ["balances", "Balances CSV", 1], ["accounts", "Accounts CSV", 1]]);
  assert.deepEqual([entries.length, anchors.length, start], [2, 1, { balance: 0, date: "2025-06-01" }]);
  // A range is <from>_to_<to> in every name, the zip's too.
  const [b] = await statementsOf("basic");
  const rb = hooks.parse([b], ctx);
  const G = EtoroFiles.create({ P, result: () => rb, range: () => ({ from: "2025-01", to: "2025-04" }), naming: frozen.naming });
  assert.deepEqual([G.span(), G.zipName()], ["2025-01_to_2025-04", `${SLUG}-csv-2025-01_to_2025-04.zip`]);
  assert.deepEqual(G.files().out.map((f) => f.name), [
    `${NAME} - transactions - 2025-01_to_2025-04.csv`, `${NAME} - 2025-01_to_2025-04.qif`,
    `${NAME} - balances - 2025-01_to_2025-04.csv`, `${NAME} accounts - 2025-01_to_2025-04.csv`,
  ]);
  // Only the slug is read: the resolved naming of a descriptor gives the same records.
  const full = { accountPrefix: "", brand: "Example", groupNoun: "accounts", slug: SLUG };
  assert.deepEqual(EtoroFiles.create({ P, result: () => rb, range: () => ({ from: "2025-01", to: "2025-04" }), naming: full }).downloads(), G.downloads());
});

test("anchors but no entries in range: no card, yet Download all holds the Balances CSV", async () => {
  const st = await statementsOf("endonly");
  for (const mode of MODES) {
    const ctx = ctxOf(P, mode, ["2025-03", "2025-03"]);
    const r = hooks.parse(st, ctx);
    assert.deepEqual(hooks.downloads(r, ctx), [{
      trigger: "zip", account: null, kind: null, name: `${SLUG}-csv-2025-03.zip`, type: "application/zip",
      files: [{ name: `${r.account.name} - balances - 2025-03.csv`, text: "date,balance,currency\n2025-03-10,300.60,USD\n" }],
    }], mode);
  }
  // The multi-month statement: March shows a card in day mode only.
  const sb = await statementsOf("basic");
  const kinds = (mode) => {
    const ctx = ctxOf(P, mode, ["2025-03", "2025-03"]);
    return hooks.downloads(hooks.parse(sb, ctx), ctx).map((d) => `${d.trigger} ${d.kind}`);
  };
  assert.deepEqual(kinds("balance"), ["zip null"]);
  assert.deepEqual(kinds("month"), ["zip null"]);
  assert.deepEqual(kinds("day"), ["card transactions", "card qif", "card balances", "card accounts", "zip null"]);
});

test("nothing in range: no card and #zip disabled; no result or an {error}: no records", async () => {
  const sg = await statementsOf("gap");
  for (const mode of MODES) {
    const ctx = ctxOf(P, mode, ["2025-02", "2025-02"]);
    assert.deepEqual(hooks.downloads(hooks.parse(sg, ctx), ctx), [{ trigger: "zip", account: null, kind: null, disabled: true }], mode);
  }
  const full = ctxOf(P, "balance", ["2025-01", "2025-03"]);
  assert.deepEqual(hooks.downloads(hooks.parse(sg, full), full).map((d) => d.kind), ["transactions", "qif", "accounts", null], "no anchors: no Balances CSV");
  for (const none of [null, undefined]) {
    assert.deepEqual(EtoroFiles.create({ P, result: () => none, range: () => ({ from: "", to: "" }), naming: frozen.naming }).downloads(), []);
  }
  const err = hooks.parse(await statementsOf("notstatement"), full);
  assert.equal(typeof err.error, "string");
  assert.deepEqual(hooks.downloads(err, full), []);
  assert.deepEqual(hooks.downloads(null, full), []);
  assert.deepEqual(await statementsOf("bogus"), [], "the reader fails on bytes that are not a workbook");
  assert.equal(hooks.parse([], full), null);
});

test("every state: one card iff entries are in range, with out as its buttons; #zip iff out; names and CSVs", async (t) => {
  let states = 0, cards = 0, d20 = 0, disabled = 0;
  for (const id of STATEMENTS) {
    const st = deepFreeze(await statementsOf(id));
    for (const mode of MODES) {
      const r = deepFreeze(hooks.parse(st, ctxOf(P, mode, ["", ""])));
      assert.deepEqual(r.months, [...new Set(r.months)].sort(), `${id} ${mode}: months sorted and unique`);
      for (const range of pairs(r.months)) {
        const ctx = ctxOf(P, mode, range);
        const at = `${id} ${mode} ${range.join("..")}`;
        const list = hooks.downloads(r, ctx);
        assert.deepEqual(hooks.downloads(r, ctx), list, `${at}: deterministic`);
        const within = (d) => d.slice(0, 7) >= ctx.from && d.slice(0, 7) <= ctx.to;
        const hasEntries = r.account.entries.some((e) => within(e.date));
        const hasAnchors = r.account.anchors.some((x) => within(x.date));
        const span = ctx.from === ctx.to ? ctx.from : `${ctx.from}_to_${ctx.to}`;
        const NAME = r.account.name;
        const want = { transactions: `${NAME} - transactions - ${span}.csv`, qif: `${NAME} - ${span}.qif`, balances: `${NAME} - balances - ${span}.csv`, accounts: `${NAME} accounts - ${span}.csv` };
        const card = list.filter((d) => d.trigger === "card");
        const zip = list[list.length - 1];
        assert.deepEqual(list.map((d) => d.trigger), [...card.map(() => "card"), "zip"], at);
        if (hasEntries) {
          cards++;
          assert.deepEqual(card.map((d) => d.kind), ["transactions", "qif", ...(hasAnchors ? ["balances"] : []), "accounts"], at);
          assert.deepEqual(zip.files, card.map(({ name, text }) => ({ name, text })), `${at}: Download all is the card's files`);
        } else if (hasAnchors) {
          d20++;
          assert.deepEqual([card.length, zip.files.map((f) => f.name)], [0, [want.balances]], at);
        } else {
          disabled++;
          assert.deepEqual(list, [{ trigger: "zip", account: null, kind: null, disabled: true }], at);
          continue;
        }
        assert.deepEqual([zip.account, zip.kind, zip.name, zip.type], [null, null, `${SLUG}-csv-${span}.zip`, "application/zip"], at);
        for (const d of card) {
          assert.deepEqual([d.account, d.type, d.name], [null, "text/csv", want[d.kind]], `${at}: ${d.kind}`);
        }
        for (const f of zip.files) {
          if (f.name.endsWith(".qif")) {
            assert.ok(f.text.startsWith("!Type:Bank\n") && f.text.endsWith("^\n"), `${at}: QIF`);
            continue;
          }
          const rows = parseCsv(f.text);
          const kind = Object.keys(want).find((k) => want[k] === f.name);
          assert.equal(rows[0].join(","), hooks.expectedHeader({ trigger: "card", account: null, kind, type: "text/csv", name: f.name, text: f.text }, ctx), `${at}: ${f.name} header`);
          assert.equal(f.text.split("\n")[0], rows[0].join(","), `${at}: ${f.name} header line`);
          const num = rows[0].map((h, i) => (["amount", "balance", "Balance"].includes(h) ? i : -1)).filter((i) => i >= 0);
          for (const row of rows.slice(1)) {
            assert.equal(row.length, rows[0].length, `${at}: ${f.name} row width`);
            for (const i of num) assert.ok(Number.isFinite(Number(row[i])), `${at}: ${f.name} number`);
          }
        }
        states++;
      }
    }
  }
  t.diagnostic(`${states + disabled} states: ${cards} with a card, ${d20} with anchors only, ${disabled} with #zip disabled`);
  assert.ok(states > 60 && cards > 50 && d20 >= 5 && disabled >= 3, `${states} states, ${cards} with a card, ${d20} anchors only, ${disabled} disabled`);
});

test("the browser branch defines only self.EtoroFiles, also after export and parser in the page's order", async () => {
  const lone = vm.createContext({});
  lone.self = lone;
  vm.runInContext(fs.readFileSync(path.join(DIR, "files.js"), "utf8"), lone, { filename: "files.js" });
  assert.deepEqual(Object.keys(lone), ["self", "EtoroFiles"]);
  assert.deepEqual(Object.keys(lone.EtoroFiles), ["create"]);
  // export, parser, files in one page-like context (self = window, no module).
  const page = vm.createContext({});
  page.self = page;
  page.window = page;
  for (const file of [path.join(REPO, "core", "export.js"), path.join(DIR, "parser.js"), path.join(DIR, "files.js")]) {
    vm.runInContext(fs.readFileSync(file, "utf8"), page, { filename: path.basename(file) });
  }
  const st = await statementsOf("basic");
  for (const mode of MODES) {
    const r = hooks.parse(st, ctxOf(P, mode, ["", ""]));
    const range = () => ({ from: "2025-01", to: "2025-04" });
    const node = EtoroFiles.create({ P, result: () => r, range, naming: R.naming }).downloads();
    const fromLone = lone.EtoroFiles.create({ P, result: () => r, range, naming: R.naming }).downloads();
    const Pp = vm.runInContext("Object.assign({}, self.StatementExport, self.EtoroParser)", page);
    const rp = Pp.parseWorkbook(st[0].workbook, { group: mode });
    const fromPage = page.EtoroFiles.create({ P: Pp, result: () => rp, range, naming: R.naming }).downloads();
    assert.deepEqual(JSON.parse(JSON.stringify(fromLone)), node, mode);
    assert.deepEqual(JSON.parse(JSON.stringify(fromPage)), node, mode);
  }
});

test("test.js hooks: parse as recompute(), reconcile at every anchor, expectedHeader by kind, ctx.P only", async () => {
  const c = ctxOf(P, "balance", ["", ""]);
  // Only ./files.js is required; files.js requires nothing.
  const mod = (f) => require.cache[require.resolve(path.join(DIR, f))];
  assert.deepEqual(mod("test.js").children.map((m) => path.relative(DIR, m.filename)), ["files.js"]);
  assert.deepEqual(mod("files.js").children, []);
  // parse: nothing read gives null; the mode is the parser's group; inputs are left alone.
  assert.equal(hooks.parse([], c), null);
  assert.equal(hooks.parse([{ id: "x.xlsx" }], c), null);
  const sd = deepFreeze(await statementsOf("dayonly"));
  assert.deepEqual(hooks.parse(sd, ctxOf(P, "day", ["", ""])).months, ["2025-01", "2025-02", "2025-03"]);
  assert.deepEqual(hooks.parse(sd, ctxOf(P, "balance", ["", ""])).months, ["2025-01", "2025-02"]);
  for (const mode of MODES) assert.deepEqual(hooks.parse(sd, ctxOf(P, mode, ["", ""])), P.parseWorkbook(sd[0].workbook, { group: mode }), mode);
  // reconcile: no problem on any synthetic statement in any mode; a wrong anchor is caught.
  for (const id of STATEMENTS) {
    const st = await statementsOf(id);
    for (const mode of MODES) {
      const ctx = ctxOf(P, mode, ["", ""]);
      assert.deepEqual(hooks.reconcile(hooks.parse(st, ctx), ctx), [], `${id} ${mode}`);
    }
  }
  const sb = await statementsOf("basic");
  const bad = structuredClone(hooks.parse(sb, ctxOf(P, "month", ["", ""])));
  bad.account.anchors[1].total = round2(bad.account.anchors[1].total + 1);
  const problems = hooks.reconcile(bad, ctxOf(P, "month", ["", ""]));
  assert.equal(problems.length, 1);
  assert.ok(problems[0].startsWith(`month: ${bad.account.anchors[1].date} balance `));
  assert.deepEqual(hooks.reconcile(null, c), []);
  assert.deepEqual(hooks.reconcile({ error: "synthetic error" }, c), ["balance: synthetic error"]);
  // expectedHeader: the first line of each writer on empty input; nothing for QIF, zip, disabled.
  const card = (kind) => ({ trigger: "card", account: null, kind, name: "n", type: "text/csv", text: "" });
  assert.equal(hooks.expectedHeader(card("transactions"), c), "date,amount,currency,name,notes");
  assert.equal(hooks.expectedHeader(card("balances"), c), "date,balance,currency");
  assert.equal(hooks.expectedHeader(card("accounts"), c), "Account type,Name,Balance,Currency,Balance Date");
  for (const d of [card("qif"), card("other"), { trigger: "zip", account: null, kind: null, name: "z.zip", type: "application/zip", files: [] },
    { trigger: "zip", account: null, kind: null, disabled: true }, null]) assert.equal(hooks.expectedHeader(d, c), null);
  // Everything goes through ctx.P: another namespace's writers show up in the hooks' output.
  const P2 = { ...P, transactionsCsv: () => "a,b\n", parseWorkbook: () => ({ error: "from ctx.P" }), balanceOn: () => -1 };
  const c2 = { ...c, P: P2 };
  assert.equal(hooks.expectedHeader(card("transactions"), c2), "a,b");
  assert.deepEqual(hooks.parse(sb, c2), { error: "from ctx.P" });
  const rb = hooks.parse(sb, c);
  assert.equal(hooks.reconcile(rb, c2).length, rb.account.anchors.length);
  assert.equal(hooks.downloads(rb, ctxOf(P2, "balance", ["2025-01", "2025-04"]))[0].text, "a,b\n");
});

// ---------------------------------------------------------------- against the old page

const LEGACY_FILES = ["src/app.js", "src/export.js", "src/parser.js", "src/xlsx.js"];
const oldFile = (rel) => path.join(oldRoot, frozen.legacyRepo, rel);
const oldPresent = LEGACY_FILES.every((rel) => fs.existsSync(oldFile(rel)));
const SKIP = oldPresent ? false : "old repositories not present";

test("files.js holds the old lines verbatim, one level deeper, with only the declared substitutions", { skip: SKIP }, () => {
  assert.deepEqual(baseline.checkGit(frozen, { oldRoot, files: LEGACY_FILES }), [], "HEAD and the old sources equal legacyHead");
  const old = fs.readFileSync(oldFile("src/app.js"), "utf8").split("\n");
  const neu = fs.readFileSync(path.join(DIR, "files.js"), "utf8").split("\n");
  const SUBS = { 71: ["state.result.account", "result().account"] };
  const moved = (n) => {
    let line = old[n - 1];
    if (SUBS[n]) {
      assert.ok(line.includes(SUBS[n][0]), `:${n} holds the substituted text`);
      line = line.replace(SUBS[n][0], SUBS[n][1]);
    }
    return `  ${line}`;
  };
  const blockAt = (nums) => {
    const want = nums.map(moved);
    for (let i = 0; i + want.length <= neu.length; i++) if (want.every((l, k) => neu[i + k] === l)) return i;
    return -1;
  };
  assert.ok(blockAt([67]) >= 0, "span, :67");
  assert.ok(blockAt([70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83]) >= 0, "files, :70-83");
  // :153: the zip name, with naming.slug for the literal slug, and the zip of files().out.
  assert.ok(old[152].includes("download(`" + SLUG + "-csv-${span()}.zip`, zip(files().out))"), ":153");
  assert.equal(neu.filter((l) => l.includes("`${naming.slug}-csv-${span()}.zip`")).length, 1);
  // The page rules downloads() restates: the card iff entries, its buttons, #zip, the click.
  assert.ok(old[98].includes('$("#cards").innerHTML = entries.length ? `'), ":99");
  assert.ok(old[103].includes('${out.map((f) => `<button class="dl" data-kind="${f.kind}">${f.label}</button>`).join("")}'), ":104");
  assert.equal(old[105].trim(), '$("#zip").disabled = !out.length;', ":106");
  assert.ok(old[149].includes("const f = files().out.find((x) => x.kind === b.dataset.kind);"), ":150");
  assert.ok(old[150].includes('if (f) download(f.name, new Blob([f.text], { type: "text/csv" }));'), ":151");
});

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITIES[e]);
const FIXED = new Date(FIXED_TIME);
class FixedDate extends Date {
  constructor(...args) {
    if (args.length) super(...args);
    else super(FIXED.getTime());
  }
}

// The old page in a vm sandbox. The stub DOM gives the old app what it reads and keeps what it
// writes: the selects keep their options, #cards parses the card's button.dl attributes, and an
// anchor click records the download. The old reader, export layer and parser are the old
// modules; the clock is fixed, so its zips can be compared byte for byte.
function oldPage(appSource, { exportModule, parserGlobal, parser, xlsx }) {
  const listeners = new Map();
  const on = (key) => (type, fn) => {
    if (!listeners.has(key)) listeners.set(key, {});
    const l = listeners.get(key);
    (l[type] = l[type] || []).push(fn);
  };
  const fire = async (key, type, event) => {
    const fns = ((listeners.get(key) || {})[type] || []).slice();
    await Promise.all(fns.map((fn) => fn(event)));
  };
  const DOC = {};
  const records = [];
  const blobs = new Map();
  let buttons = [];
  const els = new Map();
  function el(id) {
    if (els.has(id)) return els.get(id);
    let e;
    if (id === "from" || id === "to") {
      let options = [], value = "";
      e = {
        get value() { return value; },
        set value(v) { value = options.includes(String(v)) ? String(v) : ""; },
        get options() { return options.slice(); },
        get innerHTML() { return options.join(","); },
        set innerHTML(h) { options = [...String(h).matchAll(/<option value="([^"]*)">/g)].map((m) => decode(m[1])); value = options.length ? options[0] : ""; },
      };
    } else if (id === "cards") {
      let html = "";
      e = {
        get innerHTML() { return html; },
        set innerHTML(h) {
          html = String(h);
          buttons = [...html.matchAll(/<button class="dl"((?: [a-z-]+="[^"]*")*)>/g)].map((m) => {
            const attrs = Object.fromEntries([...m[1].matchAll(/ ([a-z-]+)="([^"]*)"/g)].map((a) => [a[1], decode(a[2])]));
            const b = { attrs, dataset: { kind: attrs["data-kind"] } };
            b.closest = (sel) => (sel === "button.dl" ? b : null);
            return b;
          });
        },
      };
    } else {
      e = { innerHTML: "", textContent: "", hidden: false, disabled: false, value: "" };
    }
    Object.assign(e, { id, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, addEventListener: on(e), click() {} });
    els.set(id, e);
    return e;
  }
  const modeButtons = MODES.map((mode) => ({ dataset: { mode }, classList: { toggle() {} }, setAttribute() {} }));
  const document = {
    querySelector(sel) {
      const m = /^#([\w-]+)$/.exec(sel);
      if (!m) throw new Error(`stub DOM: unexpected selector ${sel}`);
      return el(m[1]);
    },
    querySelectorAll(sel) {
      if (sel === "#mode button") return modeButtons;
      throw new Error(`stub DOM: unexpected selector ${sel}`);
    },
    createElement(tag) {
      if (tag !== "a") throw new Error(`stub DOM: unexpected element ${tag}`);
      const a = { click() { records.push({ name: a.download, blob: blobs.get(a.href) }); }, remove() {} };
      return a;
    },
    body: { appendChild() {} },
    documentElement: {},
    addEventListener: on(DOC),
  };
  let urls = 0;
  const store = new Map();
  const context = vm.createContext({
    document,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    URL: { createObjectURL: (blob) => { const u = `blob:stub/${++urls}`; blobs.set(u, blob); return u; }, revokeObjectURL() {} },
    Blob, Response, DecompressionStream, TextEncoder, TextDecoder, setTimeout: () => 0, console, Date: FixedDate,
  });
  context.window = context;
  context.self = context;
  context.StatementExport = exportModule;
  context[parserGlobal] = parser;
  context.Xlsx = xlsx;
  vm.runInContext(appSource, context, { filename: "old app.js" });
  let mode = MODES[0];

  return {
    mode: () => mode,
    storedMode: () => store.get(frozen.storage.modeKey),
    selects: () => ({ from: el("from").value, to: el("to").value, months: el("from").options }),
    async load(files) {
      const list = files.map((f) => ({ name: f.name, size: f.bytes.length, type: "", arrayBuffer: async () => f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.length) }));
      await fire(DOC, "drop", { preventDefault() {}, target: {}, dataTransfer: { files: list } });
      assert.equal(el("busy").hidden, true, "the busy line is cleared");
    },
    async setMode(m) {
      await fire(el("mode"), "click", { target: { closest: (sel) => (sel === "button[data-mode]" ? { dataset: { mode: m } } : null) } });
      mode = m;
    },
    async setRange(from, to) {
      el("from").value = from;
      el("to").value = to;
      assert.deepEqual([el("from").value, el("to").value], [from, to], "the selects offer these months");
      await fire(el("from"), "change", {});
    },
    async clear() {
      await fire(el("clear"), "click", {});
    },
    // The page driver's clicks: every card button in DOM order, then #zip. Nothing while
    // #results is hidden.
    async clickAll() {
      if (el("results").hidden) return { records: [], zips: [] };
      const raw = [];
      for (const b of buttons.slice()) {
        assert.deepEqual(Object.keys(b.attrs), ["data-kind"], "the card's buttons carry only data-kind");
        const before = records.length;
        await fire(el("cards"), "click", { target: b });
        assert.equal(records.length, before + 1, "one download per card button");
        raw.push({ trigger: "card", account: null, kind: b.dataset.kind, record: records[before] });
      }
      if (el("zip").disabled) {
        raw.push({ trigger: "zip", disabled: true });
      } else {
        const before = records.length;
        await fire(el("zip"), "click", {});
        assert.equal(records.length, before + 1, "one download from #zip");
        raw.push({ trigger: "zip", account: null, kind: null, record: records[before] });
      }
      const out = [], zips = [];
      for (const x of raw) {
        if (x.disabled) {
          out.push({ trigger: x.trigger, account: null, kind: null, disabled: true });
          continue;
        }
        const { name, blob } = x.record;
        const base = { trigger: x.trigger, account: x.account, kind: x.kind, name, type: blob.type };
        if (blob.type !== "application/zip") {
          out.push({ ...base, text: await blob.text() });
          continue;
        }
        const bytes = Buffer.from(await blob.arrayBuffer());
        const entries = unzip(new Uint8Array(bytes));
        assert.ok(entries.every((en) => en.crcOk), "the old zip's CRCs");
        out.push({ ...base, files: entries.map((en) => ({ name: en.name, text: Buffer.from(en.data).toString("utf8") })) });
        zips.push(bytes);
      }
      return { records: out, zips };
    },
  };
}

test("the old page offers exactly downloads() on all three paths, in every mode and range, in both orders", { skip: SKIP }, async (t) => {
  const { problems, manifests } = await baseline.before([frozen], { live: false, oldRoot });
  let states = 0, records = 0, zips = 0, hidden = 0, zipOnly = 0, disabled = 0;
  try {
    assert.deepEqual(problems, [], "HEAD and index.html match frozen.js");
    assert.deepEqual(baseline.checkGit(frozen, { oldRoot, files: LEGACY_FILES }), [], "the old sources equal their blobs");
    const appSource = fs.readFileSync(oldFile("src/app.js"), "utf8");
    const m = /const P = Object\.assign\(\{\}, window\.StatementExport, window\.([A-Za-z]+)\);/.exec(appSource);
    assert.ok(m, "the old app composes P from the export layer and a parser global");
    const oldExport = require(oldFile("src/export.js"));
    const oldParser = require(oldFile("src/parser.js"));
    const oldXlsx = require(oldFile("src/xlsx.js"));
    const Pold = Object.assign({}, oldExport, oldParser);
    const handle = loadNode(ID, { parser: "old", oldRoot });
    assert.deepEqual([handle.app, handle.modes], ["custom", MODES]);
    const page = oldPage(appSource, { exportModule: oldExport, parserGlobal: m[1], parser: oldParser, xlsx: oldXlsx });
    const oldWorkbook = async (f) => {
      try {
        return await oldXlsx.read(new Uint8Array(f.bytes), async (d) => new Uint8Array(zlib.inflateRawSync(d)));
      } catch {
        return null;
      }
    };

    let current = null; // the file the page read last (the first .xlsx of the batch, else its first file)
    const check = async (at) => {
      const old = await page.clickAll();
      const mode = page.mode();
      const { from, to } = page.selects();
      const [f, tt] = swap([from, to]);
      // 1. files.js on the old page's own namespace and parse: only the file logic differs.
      const wb = current ? await oldWorkbook(current) : null;
      const rOld = wb ? Pold.parseWorkbook(wb, { group: mode }) : null;
      const shown = rOld && rOld.error ? null : rOld;
      const iso = EtoroFiles.create({ P: Pold, result: () => shown, range: () => ({ from: f, to: tt }), naming: frozen.naming }).downloads();
      assert.deepEqual(iso, old.records, `${at}: files.js on the old namespace`);
      // 2. the test.js hooks on the new parser over core export.
      const st = current ? await statementsOf(Object.keys(FILES).find((k) => FILES[k] === current)) : [];
      const ctx = ctxOf(P, mode, [from, to]);
      const neu = hooks.downloads(hooks.parse(st, ctx), ctx);
      assert.deepEqual(neu, old.records, `${at}: the hooks on the new parser`);
      // 3. the replay path: loadNode with the old parser over core export.
      assert.deepEqual(handle.downloads(handle.parse(st, { config: null, mode }), { mode, from, to }), old.records, `${at}: loadNode old`);
      // Download all, byte for byte: zipParts(files, now) under the same clock.
      const zipRec = neu.find((d) => d.trigger === "zip" && !d.disabled);
      assert.equal(old.zips.length, zipRec ? 1 : 0, at);
      if (zipRec) {
        assert.ok(Buffer.from(await new Blob(zipParts(zipRec.files, FIXED)).arrayBuffer()).equals(old.zips[0]), `${at}: zip bytes`);
        zips++;
      }
      if (!old.records.length) hidden++;
      else if (old.records[0].trigger === "zip") old.records[0].disabled ? disabled++ : zipOnly++;
      states++;
      records += old.records.length;
    };
    const load = async (ids) => {
      const files = ids.map((id) => FILES[id]);
      await page.load(files);
      current = files.find((x) => /\.xlsx$/i.test(x.name)) || files[0];
    };

    await check("@open");
    for (const bad of ["bogus", "notstatement"]) {
      await load([bad]);
      await check(`${bad} @load`);
    }
    for (const id of STATEMENTS) {
      await load([id]);
      await check(`${id} @load`);
      // The mode clicked before the range.
      for (const mode of MODES) {
        await page.setMode(mode);
        assert.equal(page.storedMode(), mode);
        for (const [a, b] of pairs(page.selects().months)) {
          await page.setRange(a, b);
          await check(`${id} ${mode} ${a}..${b}`);
        }
      }
      // The mode clicked after the range: the page keeps a range the new months still offer.
      for (const first of MODES) {
        await page.setMode(first);
        for (const [a, b] of pairs(page.selects().months)) {
          for (const then of MODES.filter((x) => x !== first)) {
            await page.setMode(first);
            await page.setRange(a, b);
            await page.setMode(then);
            await check(`${id} ${first} ${a}..${b} then-${then}`);
          }
        }
      }
    }
    // A failed read discards the loaded statement; a new file replaces it; Clear empties it.
    await load(["basic"]);
    await load(["bogus"]);
    await check("basic then bogus");
    await load(["basic"]);
    await load(["single"]);
    await check("basic then single");
    await page.clear();
    current = null;
    await check("@clear");
    // A batch: the first .xlsx by name, not the first file.
    await load(["notes", "endonly"]);
    await page.setRange("2025-03", "2025-03");
    await check("notes + endonly, last month");
    t.diagnostic(`${states} states, ${records} downloads, ${zips} zips byte-equal; ${zipOnly} states with Download all but no card, ${disabled} with #zip disabled, ${hidden} without results`);
    assert.ok(states > 300 && zips > 250 && zipOnly >= 10 && disabled >= 6 && hidden >= 5, `${states} states, ${zips} zips, ${zipOnly} zip only, ${disabled} disabled, ${hidden} hidden`);
  } finally {
    assert.deepEqual(baseline.after(manifests), [], "nothing in the old repository changed");
  }
});
