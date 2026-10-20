// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// test/lib/extract.js and test/pages/extract.template.html (docs/TESTING.md, browser extraction
// and Node replay). Synthetic data only. Covered: the reading facts of an old page (its picker's
// inputs and its readStatement's page transform) and of a descriptor; the reader the page picks
// for a file; the extraction page built from the production sources; the Node twins (CSV and
// XLSX), the UTF-16 refusal, skipped and failed files, path order; the offline mode; errors that
// name a file by position and sha256 prefix only; damaged XLSX entries failing as in Chrome. With
// the pinned Chrome: PDF, CSV and XLSX files read on the extraction page, the cache (misses, then
// hits with the same objects; 0700/0600), Chrome's UTF-16 decoding, the page transform, and the
// damaged workbooks giving the same statements and failures with either reader. Where the old
// repositories exist, every old page's reading facts are checked against its own files.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-extract-"));
process.env.S2C_PRIVATE = path.join(TMP, "private");
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

const ex = require("../lib/extract.js");
const canon = require("../lib/canon.js");
const browserLib = require("../lib/browser.js");
const { renderPdf } = require("../lib/minipdf.js");
const { renderXlsx } = require("../lib/mkxlsx.js");
const { frozenProviders } = require("../lib/load-provider.js");
const { readPiece } = require("../../build/scripts.js");
const { ACCEPT } = require("../../build/page.js");

const CHROME_READY = fs.existsSync(browserLib.chromePath());
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

function write(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  return Object.entries(files).map(([name, bytes]) => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, bytes);
    return p;
  });
}

// ---------------------------------------------------------------- reading facts

function oldPage(name, { accept, push }) {
  const src = path.join(TMP, "old", name, "src");
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, "index.template.html"), accept === null ? "<main></main>\n" : `<main>\n  <input id="picker" type="file" accept="${accept}" multiple hidden>\n</main>\n`);
  if (push !== undefined) fs.writeFileSync(path.join(src, "app.js"), `async function readStatement(file) {\n${push}\n}\n`);
  return { legacyRepo: name };
}

test("legacyReading: the old page's picker gives the inputs, its page push the transform", () => {
  const oldRoot = path.join(TMP, "old");
  const read = (name, o) => ex.legacyReading(oldPage(name, o), { oldRoot });
  const PLAIN = "      pages.push((content.items.map((it) => ({";
  const TRANSFORMED = "      pages.push(P.itemsToPageText(content.items.map((it) => ({";
  assert.deepEqual(read("a2csv", { accept: "application/pdf,.pdf", push: PLAIN }), { inputs: ["pdf"], pageTransform: null });
  assert.deepEqual(read("b2csv", { accept: "application/pdf,.pdf", push: TRANSFORMED }), { inputs: ["pdf"], pageTransform: "itemsToPageText" });
  assert.deepEqual(read("c2csv", { accept: "application/pdf,.pdf,text/csv,.csv", push: PLAIN }), { inputs: ["pdf", "csv"] , pageTransform: null });
  assert.deepEqual(read("d2csv", { accept: ACCEPT.xlsx }), { inputs: ["xlsx"], pageTransform: null }, "no PDF input: app.js is not read");
  assert.throws(() => read("e2csv", { accept: "application/pdf,.pdf", push: `${PLAIN}\n${PLAIN}` }), /cannot tell how the old reader builds its pages \(2 page pushes/);
  assert.throws(() => read("f2csv", { accept: "application/pdf,.pdf", push: "      pages.push(transform(items));" }), /cannot tell/);
  assert.throws(() => read("g2csv", { accept: "image/png", push: PLAIN }), /unknown accept token/);
  assert.throws(() => read("h2csv", { accept: null, push: PLAIN }), /expected one #picker/);
  assert.throws(() => ex.legacyReading({}, { oldRoot }), /needs a frozen.js object with legacyRepo/);
  assert.deepEqual(ex.inputsOfAccept(" .CSV, text/csv ,.pdf"), ["csv", "pdf"]);
});

test("readingOf: the descriptor with the new parser, the old page with the old one", () => {
  const oldRoot = path.join(TMP, "old");
  oldPage("r2csv", { accept: "application/pdf,.pdf", push: "      pages.push(P.toText(content.items.map((it) => ({" });
  const D = { inputs: ["pdf", "csv"], pdf: { pageTransform: "t" } };
  assert.deepEqual(ex.readingOf({ id: "x", D, R: { inputs: ["pdf", "csv"], pdf: { pageTransform: "t" } } }), { inputs: ["pdf", "csv"], pageTransform: "t", source: "descriptor" });
  assert.deepEqual(ex.readingOf({ id: "x", D: { inputs: ["xlsx"], pdf: { pageTransform: null } }, R: {} }), { inputs: ["xlsx"], pageTransform: null, source: "descriptor" });
  assert.deepEqual(ex.readingOf({ id: "x", D: null, frozen: { legacyRepo: "r2csv" } }, { oldRoot }), { inputs: ["pdf"], pageTransform: "toText", source: "old page" });
  assert.throws(() => ex.readingOf({ id: "x", D: null, frozen: {} }), /declared inputs are unknown/);
  assert.throws(() => ex.readingOf(null), /needs a ProviderHandle/);
});

test("kindFor: the fixed order csv, xlsx, pdf over the declared inputs, by name", () => {
  const cases = [
    ["a.pdf", ["pdf"], "pdf"], ["A.PDF", ["pdf"], "pdf"], ["a.csv", ["pdf"], null], ["a.csv", ["pdf", "csv"], "csv"], ["a.CSV", ["csv", "pdf"], "csv"],
    ["a.xlsx", ["xlsx"], "xlsx"], ["a.xlsx", ["pdf", "csv"], null], ["a.txt", ["pdf", "csv", "xlsx"], null], ["a.pdf.txt", ["pdf"], null],
    ["noext", ["pdf", "csv", "xlsx"], null], ["zz-not-a-statement.pdf", ["pdf"], "pdf"],
  ];
  for (const [name, inputs, want] of cases) assert.equal(ex.kindFor(inputs, name), want, `${name} with ${inputs}`);
});

// ---------------------------------------------------------------- the extraction page

test("buildPage: the template filled with the production pieces, the serializer and the PDF policy", () => {
  const a = ex.buildPage();
  const b = ex.buildPage();
  assert.equal(a.html, b.html);
  assert.equal(a.key, sha256(`${a.html}\nchrome ${browserLib.EXPECTED.chrome}\n`));
  assert.ok(a.html.startsWith("<!doctype html>\n<!--\n  SPDX-License-Identifier: Apache-2.0\n"));
  assert.ok(!/\{\{/.test(a.html.replace(/<script[\s\S]*?<\/script>/g, "")), "no token is left outside the scripts");
  const metas = a.html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g) || [];
  assert.equal(metas.length, 1);
  assert.match(metas[0], /default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:/);
  // Every piece is inlined byte for byte, in plan order, the worker as text/plain.
  let at = 0;
  for (const p of ex.PIECES) {
    const text = readPiece({ label: p.path, path: path.join(REPO, p.path) });
    const tag = p.kind === "text" ? `<script type="text/plain" id="${p.id}">${text}</script>` : `<script>${text}</script>`;
    const i = a.html.indexOf(tag, at);
    assert.ok(i >= at, `${p.path} is inlined unchanged, after the pieces before it`);
    at = i + tag.length;
  }
  assert.ok(a.html.indexOf("self.__s2cCanon = (function () {", at) > 0, "the serializer follows the pieces");
  assert.ok(a.html.indexOf("self.StatementPdf.init();") > a.html.indexOf("self.__s2cCanon"), "the extraction script comes last");
});

// ---------------------------------------------------------------- extract, Node twins

test("extract with the Node twins: path order, skipped and failed files, the UTF-16 refusal", async () => {
  const dir = path.join(TMP, "twins");
  const sheets = { Summary: [["Currency", "USD"]], Activity: [["Date", "Amount"], [46023, -0], [46024.5, 1e-7]] };
  const [csv1, bom, txt, xlsx, badXlsx] = write(dir, {
    "history.csv": "a,b\r\n1,2\r\n",
    "bom.csv": Buffer.from([0xef, 0xbb, 0xbf, 0x78]),
    "notes.txt": "x",
    "book.xlsx": renderXlsx(sheets, { deflate: true }),
    "broken.xlsx": "not a zip",
  });
  const r = await ex.extract([xlsx, txt, csv1, badXlsx, bom, csv1], { inputs: ["csv", "xlsx"], readers: "node", allowed: [dir] });
  assert.deepEqual(r.statements.map((s) => s.id), ["book.xlsx", "history.csv", "bom.csv", "history.csv"], "path order, no de-duplication");
  assert.deepEqual(r.statements[1], { id: "history.csv", csv: "a,b\r\n1,2\r\n" });
  assert.deepEqual(r.statements[2], { id: "bom.csv", csv: "x" }, "a UTF-8 byte order mark is stripped");
  assert.deepStrictEqual(r.statements[0], { id: "book.xlsx", workbook: sheets });
  assert.notEqual(r.statements[1], r.statements[3], "a repeated path gives its own object");
  assert.equal(r.byPath.get(csv1), r.statements[1]);
  assert.deepEqual(r.skipped, [txt]);
  assert.deepEqual(r.failed, [{ id: "broken.xlsx", error: "not a zip file (no end of central directory)" }]);
  assert.deepEqual([r.cache.hits, r.cache.misses], [0, 0], "the twins are not cached");
  // The UTF-16 refusal fails the whole call. Errors name a file by its position and sha256
  // prefix, never by name (callers print them; statement file names can be private).
  const [utf16] = write(dir, { "Private Name 2026.csv": Buffer.from([0xff, 0xfe, 0x41, 0x00]) });
  const ref = (p, i, n) => `file ${i} of ${n} (sha256 ${sha256(fs.readFileSync(p)).slice(0, 16)})`;
  await assert.rejects(ex.extract([csv1, utf16], { inputs: ["csv"], readers: "node", allowed: [dir] }), (e) => e.message === `extract: ${ref(utf16, 2, 2)} starts with a UTF-16 byte order mark, which Chrome's file.text() decodes as UTF-16 and the Node twin does not; read it with readers: "chrome"`);
  await assert.rejects(ex.extract([path.join(os.homedir(), "not-allowed.csv")], { inputs: ["csv"], readers: "node", allowed: [dir] }), /refusing to read/);
  await assert.rejects(ex.extract([csv1], { inputs: ["csv"], readers: "fast" }), /readers must be/);
  // A PDF is always read in Chrome: offline, a cache miss throws.
  const [pdf] = write(dir, { "Private Name 2026.pdf": renderPdf([[{ x: 10, y: 10, text: "x" }]]) });
  await assert.rejects(ex.extract([csv1, pdf], { inputs: ["csv", "pdf"], readers: "node", offline: true, allowed: [dir] }),
    (e) => e.message === `extract: ${ref(pdf, 2, 2)} is not in the extraction cache (run the extract command first)` && !e.message.includes("Private Name"));
});

// Damaged workbooks: the sheet entry's deflate stream followed by more bytes, or cut short.
function damagedBooks(dir) {
  const sheets = { Sheet1: [["SYNTHETIC", 1]], Other: [[2, "x"]] };
  const edit = (fn) => renderXlsx(sheets, { deflate: true, entryBytes: (name, s) => (name === "xl/worksheets/sheet1.xml" ? fn(s) : s) });
  const paths = write(dir, {
    "good.xlsx": renderXlsx(sheets, { deflate: true }),
    "junk.xlsx": edit((s) => Buffer.concat([s, Buffer.from([1, 2, 3, 4])])),
    "cut.xlsx": edit((s) => s.subarray(0, s.length - 2)),
    "stored.xlsx": renderXlsx(sheets),
  });
  return { sheets, paths };
}

test("the XLSX twin fails a damaged deflate stream as Chrome's reader does (bytes after the end, cut short)", async () => {
  const { sheets, paths } = damagedBooks(path.join(TMP, "damaged-node"));
  const r = await ex.extract(paths, { inputs: ["xlsx"], readers: "node", allowed: [path.join(TMP, "damaged-node")] });
  assert.deepStrictEqual(r.statements, [{ id: "good.xlsx", workbook: sheets }, { id: "stored.xlsx", workbook: sheets }]);
  assert.deepEqual(r.failed, [{ id: "junk.xlsx", error: "Failed to fetch" }, { id: "cut.xlsx", error: "Failed to fetch" }]);
});

// ---------------------------------------------------------------- extract in Chrome

const PAGES = [
  [{ x: 50, y: 800, size: 10, text: "Example Bank statement" }, { x: 300.25, y: 700.5, text: "Balance (SGD) 1,234.50 – ’q’ € × é" }],
  [],
  [{ x: 10, y: 10, size: 7.5, text: "page three" }],
];

test("extract in Chrome: the production readers, the cache, the transform", { skip: !CHROME_READY && "the pinned chrome-headless-shell is not installed" }, async () => {
  const dir = path.join(TMP, "chrome");
  const sheets = { Sheet1: [["a", 1, true, null], [], [2.5]] };
  const [pdf, csv, utf16, book, bogus, txt] = write(dir, {
    "statement.pdf": renderPdf(PAGES),
    "history.csv": "\ufeffa,b\r\n1,2\r\n",
    "utf16.csv": Buffer.from([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]),
    "book.xlsx": renderXlsx(sheets),
    "zz-not-a-statement.pdf": "not a pdf",
    "aa-not-a-pdf.txt": "not a statement",
  });
  const cacheDir = path.join(TMP, "private", "extract");
  const inputs = ["pdf", "csv", "xlsx"];
  const first = await ex.extract([pdf, csv, utf16, book, bogus, txt], { inputs, allowed: [dir], cacheDir });
  assert.deepEqual([first.cache.hits, first.cache.misses], [0, 5]);
  assert.deepEqual(first.statements.map((s) => s.id), ["statement.pdf", "history.csv", "utf16.csv", "book.xlsx"]);
  assert.deepEqual(first.skipped, [txt]);
  assert.equal(first.failed.length, 1);
  assert.equal(first.failed[0].id, "zz-not-a-statement.pdf");
  assert.match(first.failed[0].error, /PDF/);
  const s = first.statements[0];
  assert.deepEqual(Object.keys(s), ["id", "pages"]);
  assert.equal(s.pages.length, 3);
  for (const items of s.pages) for (const it of items) assert.deepEqual(Object.keys(it), ["str", "x", "y", "w", "h"]);
  assert.deepEqual(s.pages.map((items) => items.filter((it) => it.str).map((it) => it.str)), PAGES.map((p) => p.map((r) => r.text)));
  assert.deepEqual(first.statements[1], { id: "history.csv", csv: "a,b\r\n1,2\r\n" });
  assert.deepEqual(first.statements[2], { id: "utf16.csv", csv: "AB" }, "Chrome's file.text() decodes a UTF-16 byte order mark as UTF-16 (the page's behaviour)");
  assert.deepStrictEqual(first.statements[3], { id: "book.xlsx", workbook: sheets });
  // The cache: 0700 folders, 0600 files, one entry per (bytes, reader), hit on the second call.
  const keyDir = path.join(cacheDir, "cache", first.cache.key);
  const entries = fs.readdirSync(keyDir).sort();
  assert.equal(entries.length, 5);
  for (const n of entries) assert.equal(fs.statSync(path.join(keyDir, n)).mode & 0o777, 0o600, n);
  for (const d of [cacheDir, path.join(cacheDir, "cache"), keyDir]) assert.equal(fs.statSync(d).mode & 0o777, 0o700, d);
  assert.equal(fs.statSync(path.join(cacheDir, "page.html")).mode & 0o777, 0o600);
  assert.ok(entries.includes(`${sha256(fs.readFileSync(pdf))}.pdf.canon`));
  const second = await ex.extract([pdf, csv, utf16, book, bogus, txt], { inputs, allowed: [dir], cacheDir, offline: true });
  assert.deepEqual([second.cache.hits, second.cache.misses], [5, 0]);
  assert.deepStrictEqual(second.statements, first.statements);
  assert.deepEqual(second.failed, first.failed);
  // The same bytes under another name: the cached statement with that name as its id.
  const [copy] = write(dir, { "copy.pdf": fs.readFileSync(pdf) });
  const renamed = await ex.extract([copy], { inputs: ["pdf"], allowed: [dir], cacheDir, offline: true });
  assert.deepStrictEqual(renamed.statements[0], { ...s, id: "copy.pdf" });
  // The page transform runs in Node on the cached items, as handle.P[name](items), PDFs only.
  const handle = { id: "x", D: { inputs }, R: { inputs, pdf: { pageTransform: "join" } }, P: { join(items) { return `${this === handle.P}:${items.map((i) => i.str).join("|")}`; } } };
  const t = await ex.extract([pdf, csv], { handle, allowed: [dir], cacheDir, offline: true });
  assert.deepEqual(t.statements[0].pages, PAGES.map((p) => `true:${p.map((r) => r.text).join("|")}`));
  assert.deepEqual(t.statements[1], first.statements[1]);
  await assert.rejects(ex.extract([pdf], { handle: { ...handle, P: {} }, allowed: [dir], cacheDir }), /not a function of the composed namespace/);
  // A declared input decides: with PDF only, the CSV is ignored.
  const pdfOnly = await ex.extract([csv, pdf], { inputs: ["pdf"], allowed: [dir], cacheDir, offline: true });
  assert.deepEqual([pdfOnly.statements.map((x) => x.id), pdfOnly.skipped], [["statement.pdf"], [csv]]);
  // The cached text is the canonical serialisation of the entry.
  const cached = canon.parse(fs.readFileSync(path.join(keyDir, `${sha256(fs.readFileSync(book))}.xlsx.canon`), "utf8"));
  assert.deepStrictEqual(cached, { kind: "xlsx", statement: { id: "book.xlsx", workbook: sheets } });
});

test("in Chrome, extract gives the same statements and failures with the production XLSX reader as with the Node twin, damaged workbooks included", { skip: !CHROME_READY && "the pinned chrome-headless-shell is not installed" }, async () => {
  const dir = path.join(TMP, "damaged-chrome");
  const { paths } = damagedBooks(dir);
  const node = await ex.extract(paths, { inputs: ["xlsx"], readers: "node", allowed: [dir] });
  const chrome = await ex.extract(paths, { inputs: ["xlsx"], allowed: [dir], cacheDir: path.join(TMP, "private", "extract-damaged") });
  assert.deepEqual([chrome.cache.hits, chrome.cache.misses], [0, paths.length]);
  assert.deepStrictEqual(chrome.statements, node.statements);
  assert.deepEqual(chrome.failed, node.failed);
  assert.equal(chrome.failed.length, 2);
});

// ---------------------------------------------------------------- the old pages (local)

const OLD_ROOT = process.env.S2C_OLD_ROOT || os.homedir();
const OLD = frozenProviders({ root: REPO }).filter((p) => p.frozen && p.frozen.legacyRepo && fs.existsSync(path.join(OLD_ROOT, p.frozen.legacyRepo, "src", "index.template.html")));

test("every old page's reading facts agree with its own page and parser", { skip: OLD.length ? false : "old repositories not present" }, async () => {
  const baseline = require("../lib/baseline.js");
  const { problems, manifests } = await baseline.before(OLD.map((p) => p.frozen), { live: false, oldRoot: OLD_ROOT });
  assert.deepEqual(problems, [], "HEAD and index.html match frozen.js");
  let transforms = 0;
  try {
    for (const { id, frozen } of OLD) {
      const r = ex.legacyReading(frozen, { oldRoot: OLD_ROOT });
      // The built page users load has the same picker.
      const html = fs.readFileSync(path.join(OLD_ROOT, frozen.legacyRepo, "index.html"), "utf8");
      const picker = /<input\b[^>]*\bid="picker"[^>]*>/.exec(html);
      assert.ok(picker, id);
      assert.deepEqual(r.inputs, ex.inputsOfAccept(/\baccept="([^"]*)"/.exec(picker[0])[1]), `${id}: inputs`);
      if (r.pageTransform) {
        transforms++;
        const parser = require(path.join(OLD_ROOT, frozen.legacyRepo, "src", "parser.js"));
        assert.equal(typeof parser[r.pageTransform], "function", `${id}: the transform is a parser export`);
      }
    }
    assert.ok(transforms <= OLD.length);
  } finally {
    assert.deepEqual(baseline.after(manifests), [], "nothing in the old repositories changed");
  }
});
