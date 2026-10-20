// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// core/readers/{csv,xlsx,pdf}.js (docs/TESTING.md, unit tests): accept tokens and the accepts
// truth table; the reader order csv -> xlsx -> pdf over the declared inputs; BOM stripping by
// file.text() and new Blob([buf]).text(); Xlsx.read on mkxlsx workbooks with zlib inflate, and
// every sheets fixture in the tree (plus synthetic ones with strings, numbers, booleans, nulls
// and gaps) read back to the identical workbook object; the PDF reader's worker set-up, item
// mapping and transform hook. The Node twins of test/lib/extract.js (readNode, inflateRawNode):
// the XLSX twin reads like Xlsx.read with zlib, and fails a damaged deflate stream (bytes after
// its end, cut short, empty, damaged) with Chrome's TypeError "Failed to fetch". When the
// pinned headless shell is installed, the production readers also run in Chrome on the same
// bytes and must give exactly what the Node twins give, failures included: the well-formed
// workbooks, every kind of damage above, and 120 seeded random damages. Synthetic data only.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const StatementCsv = require("../../core/readers/csv.js");
const StatementXlsx = require("../../core/readers/xlsx.js");
const StatementPdf = require("../../core/readers/pdf.js");
const Xlsx = require("../../core/xlsx.js");
const { ACCEPT } = require("../../build/page.js");
const { renderXlsx } = require("../lib/mkxlsx.js");
const { renderPdf } = require("../lib/minipdf.js");
const { loadSpec } = require("../lib/fixtures.js");
const { mulberry32 } = require("../lib/prng.js");
const browserLib = require("../lib/browser.js");
const { readNode, inflateRawNode } = require("../lib/extract.js");

const REPO = path.resolve(__dirname, "..", "..");
const READER_FILES = { csv: "core/readers/csv.js", xlsx: "core/readers/xlsx.js", pdf: "core/readers/pdf.js" };
const READERS = { csv: StatementCsv, xlsx: StatementXlsx, pdf: StatementPdf };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const zlibInflate = async (d) => new Uint8Array(zlib.inflateRawSync(d));

// ---------------------------------------------------------------- accept and accepts

test("each reader's accept tokens are the picker's", () => {
  for (const k of Object.keys(READERS)) assert.equal(READERS[k].accept, ACCEPT[k], k);
  assert.equal(StatementXlsx.accept, `.xlsx,${XLSX_MIME}`);
});

// [name, type, csv, xlsx, pdf]
const CASES = [
  ["a.pdf", "", false, false, true],
  ["A.PDF", "", false, false, true],
  ["a.Pdf", "application/octet-stream", false, false, true],
  ["statement", "application/pdf", false, false, true],
  [".pdf", "", false, false, true],
  ["a.csv.pdf", "", false, false, true],
  ["a.pdf.txt", "text/plain", false, false, false],
  ["a.pdfx", "", false, false, false],
  ["a.pdf ", "", false, false, false],
  ["a.csv", "", true, false, false],
  ["A.CSV", "application/vnd.ms-excel", true, false, false],
  ["export", "text/csv", true, false, false],
  ["a.xlsx", "", false, true, false],
  ["A.XLSX", "application/octet-stream", false, true, false],
  ["book", XLSX_MIME, false, true, false],
  ["a.xls", "application/vnd.ms-excel", false, false, false],
  ["a.xlsm", "", false, false, false],
  ["a.txt", "text/plain", false, false, false],
  ["noext", "", false, false, false],
  ["a.pdf", "text/csv", true, false, true],
  ["a.csv", "application/pdf", true, false, true],
  ["a.xlsx", "text/csv", true, true, false],
  ["a.csv", XLSX_MIME, true, true, false],
  ["a.xlsx", "application/pdf", false, true, true],
  ["a.txt", "TEXT/CSV", false, false, false],
];

test("accepts: the truth table by name and MIME type", () => {
  for (const [name, type, csv, xlsx, pdf] of CASES) {
    const f = { name, type };
    assert.deepEqual([StatementCsv.accepts(f), StatementXlsx.accepts(f), StatementPdf.accepts(f)], [csv, xlsx, pdf], `${JSON.stringify(name)} ${type}`);
  }
  // A real File lowercases its type, as the browser's do.
  assert.equal(StatementCsv.accepts(new File([], "a.txt", { type: "TEXT/CSV" })), true);
});

// The app's reader selection: the fixed order csv -> xlsx -> pdf, restricted to the declared
// inputs; the first reader that accepts the file reads it; a file no declared reader accepts is
// ignored.
const ORDER = ["csv", "xlsx", "pdf"];
const pick = (inputs, f) => ORDER.filter((k) => inputs.includes(k)).find((k) => READERS[k].accepts(f)) || null;

test("reader order csv -> xlsx -> pdf, over the declared inputs only", () => {
  // The old PDF + CSV page: its filter, then isCsv before pdf.js.
  const isCsv = (f) => f.type === "text/csv" || /\.csv$/i.test(f.name);
  const oldPdfCsv = (f) => (f.type === "application/pdf" || /\.pdf$/i.test(f.name) || isCsv(f) ? (isCsv(f) ? "csv" : "pdf") : null);
  // The old PDF-only pages: their filter.
  const oldPdf = (f) => (f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? "pdf" : null);
  for (const [name, type] of CASES) {
    const f = { name, type };
    assert.equal(pick(["pdf", "csv"], f), oldPdfCsv(f), `pdf+csv: ${name} ${type}`);
    assert.equal(pick(["csv", "pdf"], f), oldPdfCsv(f), "the declared order does not matter");
    assert.equal(pick(["pdf"], f), oldPdf(f), `pdf: ${name} ${type}`);
    assert.equal(pick(["xlsx"], f), StatementXlsx.accepts(f) ? "xlsx" : null);
    const all = StatementCsv.accepts(f) ? "csv" : StatementXlsx.accepts(f) ? "xlsx" : StatementPdf.accepts(f) ? "pdf" : null;
    assert.equal(pick(["pdf", "xlsx", "csv"], f), all);
  }
  assert.equal(pick(["pdf", "csv"], { name: "a.csv", type: "application/pdf" }), "csv", "CSV wins over PDF");
  assert.equal(pick(["xlsx", "pdf"], { name: "a.xlsx", type: "application/pdf" }), "xlsx", "XLSX wins over PDF");
  assert.equal(pick(["csv", "xlsx"], { name: "a.xlsx", type: "text/csv" }), "csv", "CSV wins over XLSX");
});

// ---------------------------------------------------------------- CSV

const CSV_CASES = [
  ["a BOM", Buffer.from([0xef, 0xbb, 0xbf, 0x41]), "A"],
  ["two BOMs", Buffer.from("\ufeff\ufeffa,b\r\n1,2\r\n", "utf8"), "\ufeffa,b\r\n1,2\r\n"],
  ["an inner BOM", Buffer.from("a\ufeffb\n", "utf8"), "a\ufeffb\n"],
  ["CRLF and blank lines", Buffer.from("x,y\r\n\r\n1,2\r\n", "utf8"), "x,y\r\n\r\n1,2\r\n"],
  ["lone CR", Buffer.from("x\ry\r", "utf8"), "x\ry\r"],
  ["invalid UTF-8", Buffer.from([0x61, 0xff, 0x62, 0xc3]), "a\ufffdb\ufffd"],
  ["FE then text", Buffer.from([0xfe, 0x41]), "\ufffdA"],
  ["empty", Buffer.alloc(0), ""],
  ["non-ASCII", Buffer.from('é,日本,😀,"=1+2"\n', "utf8"), 'é,日本,😀,"=1+2"\n'],
];

// Bytes that start with a UTF-16 byte order mark: Chrome's file.text() (like its FileReader)
// decodes them as UTF-16, while Node's Blob.text() and every TextDecoder decode UTF-8. This is
// the one place where the Node twin differs from the page (docs/MIGRATION.md); the pages are
// not affected, because the old and the new page both call file.text() in Chrome.
const CSV_UTF16_CASES = [
  ["a UTF-16LE BOM", Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]), { chrome: "AB", node: "\ufffd\ufffdA\u0000B\u0000" }],
  ["a UTF-16BE BOM", Buffer.from([0xfe, 0xff, 0x00, 0x41]), { chrome: "A", node: "\ufffd\ufffd\u0000A" }],
  ["a UTF-16LE BOM alone", Buffer.from([0xff, 0xfe]), { chrome: "", node: "\ufffd\ufffd" }],
];

test("the CSV reader: file.text() strips one leading BOM, keeps CRLF, replaces invalid bytes; the Node twin is identical", async () => {
  for (const [what, bytes, want] of [...CSV_CASES, ...CSV_UTF16_CASES.map(([w, b, v]) => [w, b, v.node])]) {
    assert.equal(await new Blob([bytes]).text(), want, `${what}: new Blob([buf]).text()`);
    const s = await StatementCsv.read(new File([bytes], "history.csv", { type: "text/csv" }));
    assert.deepEqual(s, { id: "history.csv", csv: want }, what);
    assert.deepEqual(Object.keys(s), ["id", "csv"], "exactly id and csv");
  }
});

test("the CSV reader passes a read failure on unchanged", async () => {
  const failure = new Error("could not be read");
  await assert.rejects(StatementCsv.read({ name: "x.csv", type: "text/csv", text: () => Promise.reject(failure) }), (e) => e === failure);
});

// ---------------------------------------------------------------- XLSX

// Synthetic workbooks: strings (markup, quotes, whitespace, newlines, numbers as text), numbers
// (-0, large, small, fractions, an Excel date serial), booleans, nulls and gaps (empty rows, rows
// of nulls, leading, inner and trailing nulls), an empty sheet, sheet names with specials.
const WORKBOOKS = [
  {
    "Account Summary": [["Currency", "USD"], ["Name", "  padded  "], [], ["Opening", 1234.5]],
    "Account Activity": [
      ["Date", "Type", "Details", "Amount", "Position ID"],
      [46023, "Deposit", "<b>x</b> & \"q\" 'a'", 100, null],
      [46024.25, "Buy", "line 1\nline 2\ttab", -0, "007"],
      [null, null, null],
      [46025, "Sell", "", 1e21, true],
      [46026, "Fee", "=SUM(A1)", 1e-7, false, null],
      [null, "Dividend", "0.1+0.2", 0.30000000000000004],
    ],
  },
  { "A & B": [["x"]], "Ö \"quoted\" 'name'": [[1, null, 3]], Empty: [] },
  { Sheet1: [["hello"]] },
];

async function treeSheetsFixtures() {
  const out = [];
  const base = path.join(REPO, "providers");
  for (const folder of fs.readdirSync(base).sort()) {
    for (const spec of ["statements.js", "hostile.js"]) {
      const file = path.join(base, folder, "fixtures", spec);
      if (!fs.existsSync(file)) continue;
      for (const f of loadSpec(file).files) if (f.sheets) out.push({ where: `providers/${folder}/fixtures/${spec}: ${f.name}`, sheets: f.sheets });
    }
  }
  return out;
}

test("Xlsx.read with zlib inflate gives back every synthetic and every fixture workbook exactly", async () => {
  const fixtures = await treeSheetsFixtures();
  const all = [...WORKBOOKS.map((sheets, i) => ({ where: `synthetic ${i}`, sheets })), ...fixtures];
  for (const { where, sheets } of all) {
    for (const deflate of [false, true]) {
      const got = await Xlsx.read(new Uint8Array(renderXlsx(sheets, { deflate })), zlibInflate);
      assert.deepStrictEqual(got, sheets, `${where} (${deflate ? "deflated" : "stored"})`);
    }
  }
});

test("the XLSX reader: {id, workbook} through DecompressionStream equals the zlib twin", async () => {
  for (const sheets of WORKBOOKS) {
    for (const deflate of [false, true]) {
      const bytes = renderXlsx(sheets, { deflate });
      const s = await StatementXlsx.read(new File([bytes], "account.xlsx", { type: XLSX_MIME }));
      assert.deepEqual(Object.keys(s), ["id", "workbook"]);
      assert.equal(s.id, "account.xlsx");
      assert.deepStrictEqual(s.workbook, await Xlsx.read(new Uint8Array(bytes), zlibInflate));
      assert.deepStrictEqual(s.workbook, sheets);
    }
  }
});

test("inflateRaw equals zlib.inflateRawSync", async () => {
  const rand = mulberry32(7);
  for (const n of [0, 1, 100, 70000]) {
    const data = Buffer.from(Array.from({ length: n }, () => Math.floor(rand() * 8)));
    const got = await StatementXlsx.inflateRaw(new Uint8Array(zlib.deflateRawSync(data)));
    assert.ok(got instanceof Uint8Array);
    assert.deepEqual(Buffer.from(got), data, `${n} bytes`);
  }
});

// Damaged copies of a deflated workbook: one entry's stored bytes changed (mkxlsx entryBytes).
const SHEET = "xl/worksheets/sheet1.xml";
const damaged = (sheets, fn, entry = SHEET) => renderXlsx(sheets, { deflate: true, entryBytes: (name, stored) => (name === entry ? fn(stored) : stored) });
// One stored (uncompressed) final deflate block holding the bytes: a valid stream.
const storedBlock = (data) => {
  const head = Buffer.alloc(5);
  head[0] = 0x01;
  head.writeUInt16LE(data.length, 1);
  head.writeUInt16LE(~data.length & 0xffff, 3);
  return Buffer.concat([head, data]);
};
// [what, fn(stored) -> bytes, valid deflate]
const DAMAGE = [
  ["4 bytes after the stream", (s) => Buffer.concat([s, Buffer.from([1, 2, 3, 4])]), false],
  ["one zero byte after the stream", (s) => Buffer.concat([s, Buffer.alloc(1)]), false],
  ["a second stream after the first", (s) => Buffer.concat([s, zlib.deflateRawSync(Buffer.from("x"))]), false],
  ["cut by one byte", (s) => s.subarray(0, s.length - 1), false],
  ["cut in half", (s) => s.subarray(0, s.length >> 1), false],
  ["empty", () => Buffer.alloc(0), false],
  ["a damaged first byte", (s) => Buffer.concat([Buffer.from([0xff]), s.subarray(1)]), false],
  ["the data as one stored block", (s) => storedBlock(zlib.inflateRawSync(s)), true],
];
const outcome = async (fn) => {
  try {
    return { ok: await fn() };
  } catch (e) {
    return { error: e && e.message !== undefined ? e.message : String(e) };
  }
};

test("inflateRawNode keeps to Chrome's DecompressionStream: a stream that is damaged, cut, empty or followed by more bytes fails with TypeError \"Failed to fetch\"", async () => {
  const rand = mulberry32(19);
  const data = Buffer.from(Array.from({ length: 5000 }, () => Math.floor(rand() * 12)));
  const good = zlib.deflateRawSync(data);
  assert.deepEqual(Buffer.from(inflateRawNode(good)), data);
  assert.ok(inflateRawNode(good) instanceof Uint8Array);
  assert.deepEqual(Buffer.from(inflateRawNode(new Uint8Array(storedBlock(data.subarray(0, 300))))), data.subarray(0, 300), "a stored block");
  assert.deepEqual(Buffer.from(inflateRawNode(Buffer.from([0x03, 0x00]))), Buffer.alloc(0), "an empty final block");
  for (const [what, fn, valid] of DAMAGE) {
    if (valid) continue;
    const bad = fn(good);
    assert.throws(() => inflateRawNode(bad), (e) => e instanceof TypeError && e.message === "Failed to fetch", what);
  }
  // zlib alone takes the bytes after the end; that is the difference the twin removes.
  assert.deepEqual(zlib.inflateRawSync(Buffer.concat([good, Buffer.from([1, 2, 3, 4])])), data);
  // Big entries: the stream's end is found across zlib's output chunks too.
  const big = Buffer.from(Array.from({ length: 400000 }, (_, i) => (i * 7919) % 251));
  const bigGood = zlib.deflateRawSync(big);
  assert.deepEqual(Buffer.from(inflateRawNode(bigGood)), big);
  assert.throws(() => inflateRawNode(Buffer.concat([bigGood, Buffer.from([0])])), /^TypeError: Failed to fetch$/);
});

test("readNode: the XLSX twin is Xlsx.read with inflateRawNode, so a damaged entry fails with Chrome's error", async () => {
  for (const sheets of WORKBOOKS) {
    for (const deflate of [false, true]) {
      const bytes = renderXlsx(sheets, { deflate });
      assert.deepStrictEqual(await readNode("xlsx", "account.xlsx", bytes), { id: "account.xlsx", workbook: await Xlsx.read(new Uint8Array(bytes), zlibInflate) });
    }
  }
  for (const [what, fn, valid] of DAMAGE) {
    const got = await outcome(() => readNode("xlsx", "account.xlsx", damaged(WORKBOOKS[0], fn)));
    if (valid) assert.deepStrictEqual(got, { ok: { id: "account.xlsx", workbook: WORKBOOKS[0] } }, what);
    else assert.deepEqual(got, { error: "Failed to fetch" }, what);
  }
  assert.deepEqual(await outcome(() => readNode("xlsx", "account.xlsx", damaged(WORKBOOKS[0], DAMAGE[0][1], "xl/workbook.xml"))), { error: "Failed to fetch" }, "the workbook part");
  // An entry that is never read may be damaged.
  assert.deepEqual((await readNode("xlsx", "a.xlsx", damaged(WORKBOOKS[2], DAMAGE[0][1], "[Content_Types].xml"))).workbook, WORKBOOKS[2]);
  assert.deepEqual(await readNode("csv", "a.csv", Buffer.from("\ufeffx,y\r\n")), { id: "a.csv", csv: "x,y\r\n" });
  await assert.rejects(readNode("csv", "a.csv", Buffer.from([0xff, 0xfe, 0x41, 0x00])), (e) => e.name === "TwinRefusal" && /UTF-16 byte order mark/.test(e.message) && !e.message.includes("a.csv"));
  await assert.rejects(readNode("pdf", "a.pdf", Buffer.from("%PDF")), /has no Node twin/);
  assert.throws(() => renderXlsx(WORKBOOKS[2], { entryBytes: () => "x" }), /must return a Buffer/);
});

test("without DecompressionStream, inflateRaw fails with the old message", async () => {
  const context = vm.createContext({});
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(REPO, "core", "xlsx.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(REPO, READER_FILES.xlsx), "utf8"), context);
  await assert.rejects(context.StatementXlsx.inflateRaw(new Uint8Array(1)),
    (e) => e.message === "this browser can't decompress .xlsx files (no DecompressionStream); try a current Chrome, Edge, Firefox or Safari");
});

// A store-only zip of [name, text] entries (CRCs left 0: the reader does not check them).
function storedZip(entries) {
  const chunks = [], central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const n = Buffer.from(name), d = Buffer.from(text);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(d.length, 18);
    local.writeUInt32LE(d.length, 22);
    local.writeUInt16LE(n.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt32LE(d.length, 20);
    cen.writeUInt32LE(d.length, 24);
    cen.writeUInt16LE(n.length, 28);
    cen.writeUInt32LE(offset, 42);
    chunks.push(local, n, d);
    central.push(cen, n);
    offset += 30 + n.length + d.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

test("the XLSX reader passes errors on unchanged", async () => {
  await assert.rejects(StatementXlsx.read(new File([Buffer.from("not a zip")], "x.xlsx")), { message: "not a zip file (no end of central directory)" });
  await assert.rejects(StatementXlsx.read(new File([storedZip([["readme.txt", "hello"]])], "x.xlsx")), { message: "not an Excel workbook" });
  const failure = new Error("unreadable");
  await assert.rejects(StatementXlsx.read({ name: "x.xlsx", type: "", arrayBuffer: () => Promise.reject(failure) }), (e) => e === failure);
});

// ---------------------------------------------------------------- PDF

// Swaps globals for the duration of fn (the readers look them up when they run).
async function withGlobals(values, fn) {
  const saved = {};
  for (const k of Object.keys(values)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: values[k], configurable: true, writable: true });
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(values)) {
      if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
      else delete globalThis[k];
    }
  }
}

// A pdf.js stand-in that records what the reader asks for.
function fakePdfjs(pages, log) {
  return {
    GlobalWorkerOptions: {},
    getDocument(options) {
      log.push(["getDocument", options]);
      return {
        promise: Promise.resolve({
          numPages: pages.length,
          async getPage(i) {
            log.push(["getPage", i]);
            return { getTextContent: async () => { log.push(["getTextContent", i]); return { items: pages[i - 1] }; } };
          },
          async destroy() { log.push(["destroy"]); },
        }),
      };
    },
  };
}

const RAW_PAGES = [
  [
    { str: "Statement", transform: [10, 0, 0, 10, 50, 800], width: 44.5, height: 10, dir: "ltr", hasEOL: false },
    { str: "", transform: [1, 0, 0, 1, 0, 0], width: 0, height: 0, hasEOL: true },
    { str: "Balance 1,234.50", transform: [9, 0, 0, -9, 300.25, 700.5], width: 70, height: 0 },
  ],
  [],
  [{ str: "page three", transform: [7.5, 0, 0, 7.5, 10, 10], width: 33, height: 7.5 }],
];
const MAPPED = [
  [
    { str: "Statement", x: 50, y: 800, w: 44.5, h: 10 },
    { str: "", x: 0, y: 0, w: 0, h: 1 },
    { str: "Balance 1,234.50", x: 300.25, y: 700.5, w: 70, h: 9 },
  ],
  [],
  [{ str: "page three", x: 10, y: 10, w: 33, h: 7.5 }],
];

test("the PDF reader asks pdf.js for {data, isEvalSupported: false} and maps every item, page by page", async () => {
  const log = [];
  const bytes = Buffer.from("%PDF-1.4 synthetic");
  const s = await withGlobals({ pdfjsLib: fakePdfjs(RAW_PAGES, log) }, () => StatementPdf.read(new File([bytes], "statement.pdf", { type: "application/pdf" })));
  assert.deepEqual(s, { id: "statement.pdf", pages: MAPPED });
  assert.deepEqual(Object.keys(s), ["id", "pages"]);
  for (const page of s.pages) for (const item of page) assert.deepEqual(Object.keys(item), ["str", "x", "y", "w", "h"]);
  const [first, ...rest] = log;
  assert.equal(first[0], "getDocument");
  assert.deepEqual(Object.keys(first[1]), ["data", "isEvalSupported"]);
  assert.equal(first[1].isEvalSupported, false);
  assert.ok(first[1].data instanceof Uint8Array);
  assert.deepEqual(Buffer.from(first[1].data), bytes);
  assert.deepEqual(rest, [["getPage", 1], ["getTextContent", 1], ["getPage", 2], ["getTextContent", 2], ["getPage", 3], ["getTextContent", 3], ["destroy"]]);
});

test("the PDF reader applies the transform to each page's items, once and in order", async () => {
  const seen = [];
  const transform = (items) => { seen.push(items); return items.map((i) => i.str).join("|"); };
  const s = await withGlobals({ pdfjsLib: fakePdfjs(RAW_PAGES, []) }, () => StatementPdf.read(new File([Buffer.from("x")], "s.pdf"), transform));
  assert.deepEqual(s, { id: "s.pdf", pages: ["Statement||Balance 1,234.50", "", "page three"] });
  assert.deepEqual(seen, MAPPED);
  for (const t of [null, undefined]) {
    const plain = await withGlobals({ pdfjsLib: fakePdfjs(RAW_PAGES, []) }, () => StatementPdf.read(new File([Buffer.from("x")], "s.pdf"), t));
    assert.deepEqual(plain.pages, MAPPED);
  }
});

test("the PDF reader passes pdf.js errors on unchanged", async () => {
  const failure = new Error("Invalid PDF structure.");
  const pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(failure) }) };
  await withGlobals({ pdfjsLib }, () => assert.rejects(StatementPdf.read(new File([Buffer.from("not a pdf")], "x.pdf")), (e) => e === failure));
});

test("init points pdf.js at a text/javascript blob of #pdf-worker-src, and does nothing without it", async () => {
  const made = [];
  const URLStub = { createObjectURL: (blob) => { made.push(blob); return `blob:worker-${made.length}`; } };
  const pdfjsLib = { GlobalWorkerOptions: {} };
  const worker = { textContent: "self.onmessage = () => {};" };
  await withGlobals({ pdfjsLib, URL: URLStub, document: { getElementById: (id) => (id === "pdf-worker-src" ? worker : null) } }, () => StatementPdf.init());
  assert.equal(pdfjsLib.GlobalWorkerOptions.workerSrc, "blob:worker-1");
  assert.equal(made.length, 1);
  assert.equal(made[0].type, "text/javascript");
  assert.equal(await made[0].text(), worker.textContent);
  const untouched = { GlobalWorkerOptions: {} };
  await withGlobals({ pdfjsLib: untouched, URL: URLStub, document: { getElementById: () => null } }, () => StatementPdf.init());
  assert.deepEqual(untouched.GlobalWorkerOptions, {});
  assert.equal(made.length, 1);
});

const PDF_PAGES = [
  [{ x: 50, y: 800, size: 10, text: "Example Bank statement" }, { x: 300.25, y: 700.5, text: "Balance (SGD) 1,234.50 – ’q’ € × é" }],
  [],
  [{ x: 10, y: 10, size: 7.5, text: "page three" }],
];

// The vendored pdf.js in Node (its in-process worker). Node has no standard font data, which
// pdf.js reports as a warning per document; getDocument is wrapped only to add verbosity: 0,
// which silences that and changes nothing it reads.
let vendorPdfjs = null;
function vendoredPdfjs() {
  if (!vendorPdfjs) {
    const lib = require(path.join(REPO, "vendor", "pdf.min.js"));
    lib.GlobalWorkerOptions.workerSrc = path.join(REPO, "vendor", "pdf.worker.min.js");
    vendorPdfjs = { GlobalWorkerOptions: lib.GlobalWorkerOptions, getDocument: (options) => lib.getDocument({ ...options, verbosity: 0 }) };
  }
  return vendorPdfjs;
}

test("the PDF reader on the vendored pdf.js reads a synthetic statement's text and positions", async () => {
  const pdfjsLib = vendoredPdfjs();
  const file = new File([renderPdf(PDF_PAGES)], "example.pdf", { type: "application/pdf" });
  const s = await withGlobals({ pdfjsLib }, () => StatementPdf.read(file));
  assert.equal(s.id, "example.pdf");
  assert.equal(s.pages.length, 3);
  s.pages.forEach((items, i) => {
    assert.deepEqual(items.filter((it) => it.str !== "").map(({ str, x, y, h }) => ({ str, x, y, h })),
      PDF_PAGES[i].map((p) => ({ str: p.text, x: p.x, y: p.y, h: p.size || 10 })), `page ${i + 1}`);
    for (const it of items) assert.ok(Number.isFinite(it.w) && Number.isFinite(it.h), "w and h are numbers");
  });
  const joined = await withGlobals({ pdfjsLib }, () => StatementPdf.read(file, (items) => items.filter((it) => it.str).map((it) => it.str).join(" | ")));
  assert.deepEqual(joined.pages, PDF_PAGES.map((p) => p.map((r) => r.text).join(" | ")));
});

// ---------------------------------------------------------------- load time and the browser branch

test("loading the readers touches nothing; each sets its global (browser branch, page order)", () => {
  const context = vm.createContext({});
  context.self = context;
  for (const file of ["core/readers/csv.js", "core/xlsx.js", "core/readers/xlsx.js", "core/readers/pdf.js"]) {
    vm.runInContext(fs.readFileSync(path.join(REPO, file), "utf8"), context, { filename: file });
  }
  assert.deepEqual(Object.keys(context.StatementCsv).sort(), ["accept", "accepts", "read"]);
  assert.deepEqual(Object.keys(context.StatementXlsx).sort(), ["accept", "accepts", "inflateRaw", "read"]);
  assert.deepEqual(Object.keys(context.StatementPdf).sort(), ["accept", "accepts", "init", "read"]);
  for (const k of Object.keys(READERS)) assert.equal(context[`Statement${k[0].toUpperCase()}${k.slice(1)}`].accept, ACCEPT[k]);
});

// ---------------------------------------------------------------- the same bytes in Chrome

const CHROME_READY = fs.existsSync(browserLib.chromePath());

test("in Chrome, the production readers give what the Node twins give (CSV: unless the bytes start with a UTF-16 byte order mark)", { skip: !CHROME_READY && "the pinned chrome-headless-shell is not installed" }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-readers-"));
  const browser = await browserLib.launch();
  try {
    const src = (rel) => `<script src="${new URL(`file://${path.join(REPO, rel)}`).href}"></script>`;
    const worker = fs.readFileSync(path.join(REPO, "vendor", "pdf.worker.min.js"), "utf8");
    const page = path.join(dir, "readers.html");
    fs.writeFileSync(page, `<!doctype html>\n<meta charset="utf-8">\n<script type="text/plain" id="pdf-worker-src">${worker}</script>\n`
      + ["vendor/pdf.min.js", "core/xlsx.js", "core/readers/csv.js", "core/readers/xlsx.js", "core/readers/pdf.js"].map(src).join("\n") + "\n");
    const context = await browserLib.newContext(browser, browserLib.ENVS.E0, {});
    const tab = await context.newPage();
    await tab.goto(`file://${page}`);
    // Reads the bytes as a File in the page with the production reader of that kind.
    const inPage = (kind, name, type, bytes, joinPages = false) => tab.evaluate(async ({ kind, name, type, b64, joinPages }) => {
      const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type });
      if (kind === "csv") return self.StatementCsv.read(file);
      if (kind === "xlsx") return self.StatementXlsx.read(file);
      self.StatementPdf.init();
      return self.StatementPdf.read(file, joinPages ? (items) => items.map((i) => i.str).join("|") : null);
    }, { kind, name, type, b64: Buffer.from(bytes).toString("base64"), joinPages });

    for (const [what, bytes] of CSV_CASES) {
      assert.deepEqual(await inPage("csv", "history.csv", "text/csv", bytes), await StatementCsv.read(new File([bytes], "history.csv", { type: "text/csv" })), `CSV: ${what}`);
    }
    for (const [what, bytes, { chrome }] of CSV_UTF16_CASES) {
      assert.deepEqual(await inPage("csv", "history.csv", "text/csv", bytes), { id: "history.csv", csv: chrome }, `CSV: ${what} is decoded as UTF-16 in Chrome`);
    }
    // Seeded random bytes, many of them with a UTF-8 BOM and broken sequences: Chrome and the
    // Node twin agree on every input that does not start with a UTF-16 byte order mark.
    const rand = mulberry32(4367);
    const pool = [0xef, 0xbb, 0xbf, 0xff, 0xfe, 0xc3, 0xa9, 0xe6, 0x97, 0xa5, 0xf0, 0x9f, 0x98, 0x80, 0x0d, 0x0a, 0x2c, 0x22, 0x41, 0x00];
    const inputs = Array.from({ length: 400 }, (_, i) => {
      const body = Array.from({ length: Math.floor(rand() * 16) }, () => pool[Math.floor(rand() * pool.length)]);
      return i % 3 === 0 ? [0xef, 0xbb, 0xbf, ...body] : body;
    });
    const utf16 = (b) => (b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff);
    const chromeTexts = await tab.evaluate((list) => Promise.all(list.map((b) => new File([new Uint8Array(b)], "x.csv", { type: "text/csv" }).text())), inputs);
    let compared = 0;
    for (let i = 0; i < inputs.length; i++) {
      if (utf16(inputs[i])) continue;
      compared++;
      assert.equal(chromeTexts[i], await new Blob([Buffer.from(inputs[i])]).text(), `random input ${i}`);
    }
    assert.ok(compared > 300);
    for (const sheets of WORKBOOKS) {
      for (const deflate of [false, true]) {
        const bytes = renderXlsx(sheets, { deflate });
        const chromeRead = await inPage("xlsx", "account.xlsx", XLSX_MIME, bytes);
        assert.deepStrictEqual(chromeRead, { id: "account.xlsx", workbook: await Xlsx.read(new Uint8Array(bytes), zlibInflate) }, `XLSX (${deflate ? "deflated" : "stored"})`);
        assert.deepStrictEqual(chromeRead, await readNode("xlsx", "account.xlsx", bytes), `XLSX twin (${deflate ? "deflated" : "stored"})`);
      }
    }
    // Damaged workbooks: Chrome's reader and the XLSX twin give the same statement or fail with
    // the same message. First every kind of damage, then seeded random damage to one entry
    // (bytes added at the end, cut, changed or inserted) of a deflated workbook.
    const chromeOutcome = (bytes) => tab.evaluate(async ({ b64, type }) => {
      const file = new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], "account.xlsx", { type });
      try {
        return { ok: await self.StatementXlsx.read(file) };
      } catch (e) {
        return { error: e && e.message !== undefined ? e.message : String(e) };
      }
    }, { b64: Buffer.from(bytes).toString("base64"), type: XLSX_MIME });
    const twinOutcome = (bytes) => outcome(() => readNode("xlsx", "account.xlsx", bytes));
    for (const [what, fn, valid] of DAMAGE) {
      const bytes = damaged(WORKBOOKS[0], fn);
      const got = await chromeOutcome(bytes);
      assert.deepStrictEqual(got, valid ? { ok: { id: "account.xlsx", workbook: WORKBOOKS[0] } } : { error: "Failed to fetch" }, `Chrome: ${what}`);
      assert.deepStrictEqual(await twinOutcome(bytes), got, `twin: ${what}`);
    }
    const entries = [SHEET, "xl/workbook.xml", "xl/_rels/workbook.xml.rels"];
    const r2 = mulberry32(2026);
    const pick = (n) => Math.floor(r2() * n);
    const tally = { ok: 0, failed: 0, messages: new Set() };
    for (let k = 0; k < 120; k++) {
      const op = k % 4;
      const bytes = damaged(WORKBOOKS[0], (s) => {
        const b = Buffer.from(s);
        if (op === 0) return Buffer.concat([b, Buffer.from(Array.from({ length: 1 + pick(8) }, () => pick(256)))]);
        if (op === 1) return b.subarray(0, pick(b.length));
        if (op === 2) {
          b[pick(b.length)] ^= 1 + pick(255);
          return b;
        }
        const at = pick(b.length + 1);
        return Buffer.concat([b.subarray(0, at), Buffer.from([pick(256)]), b.subarray(at)]);
      }, entries[pick(entries.length)]);
      const got = await chromeOutcome(bytes);
      assert.deepStrictEqual(await twinOutcome(bytes), got, `random damage ${k} (op ${op})`);
      if (got.error !== undefined) {
        tally.failed++;
        tally.messages.add(got.error);
      } else tally.ok++;
    }
    assert.ok(tally.failed >= 60 && tally.ok >= 3, `both outcomes occur: ${tally.ok} read, ${tally.failed} failed`);
    assert.ok(tally.messages.has("Failed to fetch"));
    const pdf = renderPdf(PDF_PAGES);
    const node = await withGlobals({ pdfjsLib: vendoredPdfjs() }, () => StatementPdf.read(new File([pdf], "example.pdf", { type: "application/pdf" })));
    assert.deepEqual(await inPage("pdf", "example.pdf", "application/pdf", pdf), node, "PDF items");
    const nodeJoined = await withGlobals({ pdfjsLib: vendoredPdfjs() }, () => StatementPdf.read(new File([pdf], "example.pdf"), (items) => items.map((i) => i.str).join("|")));
    assert.deepEqual(await inPage("pdf", "example.pdf", "application/pdf", pdf, true), nodeJoined, "PDF with a transform");
    assert.match(await tab.evaluate(() => pdfjsLib.GlobalWorkerOptions.workerSrc), /^blob:/, "init made a blob: worker URL");
    await context.close();
  } finally {
    await browser.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
