// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Unit tests of the shared test library (test/lib). Synthetic data only; every path is a
// temporary directory, and the private-data roots are pointed at temporary directories too.
// The browser part drives a synthetic page that uses the apps' fixed element ids; it needs the
// pinned chrome-headless-shell and is skipped (with a message) only when that is not installed.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const LIB = path.join(REPO, "test", "lib");
const unzip = require(path.join(LIB, "unzip.js"));
const { parseCsv } = require(path.join(LIB, "csvread.js"));
const canon = require(path.join(LIB, "canon.js"));
const { mulberry32 } = require(path.join(LIB, "prng.js"));
const { renderPdf } = require(path.join(LIB, "minipdf.js"));
const { renderXlsx, crc32 } = require(path.join(LIB, "mkxlsx.js"));
const fixtures = require(path.join(LIB, "fixtures.js"));
const priv = require(path.join(LIB, "private.js"));
const serve = require(path.join(LIB, "serve.js"));
const baseline = require(path.join(LIB, "baseline.js"));
const { reconcileStatement } = require(path.join(LIB, "reconcile.js"));
const capture = require(path.join(LIB, "capture.js"));
const browserLib = require(path.join(LIB, "browser.js"));
const driverLib = require(path.join(LIB, "page-driver.js"));

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-testlib-"));
let tmpCount = 0;
const tmpDir = (label) => {
  const d = path.join(TMP, `${label}-${++tmpCount}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
};
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));

// Runs fn with environment variables set (undefined deletes), restoring them afterwards.
async function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) saved[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// The legacy repository names of this repo's frozen.js files (read, never spelled out here).
function frozenRepos() {
  const dir = path.join(REPO, "providers");
  return fs.readdirSync(dir).sort()
    .map((n) => path.join(dir, n, "frozen.js"))
    .filter((f) => fs.existsSync(f))
    .map((f) => require(f).legacyRepo)
    .filter(Boolean);
}

// A reference store-only ZIP writer in the pages' format (UTF-8 flag, DOS time from the local
// getters of `now`), written here independently of the library under test.
function refZip(files, now) {
  const enc = new TextEncoder();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(enc.encode(f.name));
    const data = Buffer.from(enc.encode(f.text));
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(dosTime, 12);
    cen.writeUInt16LE(dosDate, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    chunks.push(local, name, data);
    central.push(cen, name);
    offset += 30 + name.length + data.length;
  }
  const size = central.reduce((s, c) => s + c.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...central, end]);
}

// ---------------------------------------------------------------- unzip

test("unzip reads mkxlsx output", () => {
  const entries = unzip(renderXlsx({ Data: [["a", 1, true, null]] }));
  assert.deepEqual(entries.map((e) => e.name), ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml"]);
  for (const e of entries) {
    assert.equal(e.crcOk, true);
    assert.equal(e.size, e.data.length);
    assert.equal(e.sha256, sha256(e.data));
    assert.equal(e.crc32, zlib.crc32(e.data));
    assert.ok(e.data.toString("utf8").startsWith("<?xml"));
    assert.deepEqual([e.dosTime, e.dosDate], [0, 33]);
  }
  assert.deepEqual(Object.keys(entries[0]), ["name", "size", "crc32", "crcOk", "sha256", "dosTime", "dosDate", "data"]);
});

test("unzip reads the pages' store-only zips (reference writer and core zipParts)", () => {
  const files = [{ name: "a – é.csv", text: "date,amount\n2026-01-01,1.00\n" }, { name: "b.qif", text: "!Type:Bank\n^\n" }, { name: "empty.csv", text: "" }];
  const now = new Date(2026, 0, 2, 3, 4, 6);
  const dosTime = (3 << 11) | (4 << 5) | 3;
  const dosDate = (46 << 9) | (1 << 5) | 2;
  const check = (bytes) => {
    const entries = unzip(bytes);
    assert.deepEqual(entries.map((e) => e.name), files.map((f) => f.name));
    entries.forEach((e, i) => {
      assert.equal(e.data.toString("utf8"), files[i].text);
      assert.equal(e.crcOk, true);
      assert.equal(e.dosTime, dosTime);
      assert.equal(e.dosDate, dosDate);
      assert.equal(e.sha256, sha256(Buffer.from(files[i].text, "utf8")));
    });
  };
  const ref = refZip(files, now);
  check(ref);
  const parts = require(path.join(REPO, "core", "zip.js")).zipParts(files, now);
  const bytes = Buffer.concat(parts.map((p) => Buffer.from(p.buffer ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength) : p)));
  assert.equal(sha256(bytes), sha256(ref), "core zipParts must match the pages' format");
  check(bytes);
});

test("unzip reports CRC mismatches and rejects damaged or unsupported archives", () => {
  const good = refZip([{ name: "x.csv", text: "hello\n" }], new Date(2026, 0, 2));
  const flipped = Buffer.from(good);
  flipped[30 + "x.csv".length] ^= 0x01; // first data byte
  const [e] = unzip(flipped);
  assert.equal(e.crcOk, false);
  assert.throws(() => unzip(good.subarray(0, good.length - 1)), /unzip:/);
  assert.throws(() => unzip(Buffer.from("not a zip")), /unzip:/);
  const badLocal = Buffer.from(good);
  badLocal[0] = 0;
  assert.throws(() => unzip(badLocal), /bad local header/);
  assert.throws(() => unzip(Buffer.concat([good, Buffer.from("x")])), /unzip:/);
  assert.throws(() => unzip(renderXlsx({ S: [["a"]] }, { deflate: true })), /compression method 8/);
});

test("unzipEntries is self-contained, so the init script can inline it", () => {
  const bytes = new Uint8Array(refZip([{ name: "x.csv", text: "a,b\n" }], new Date(2026, 0, 2)));
  const fn = vm.runInNewContext(`(${unzip.unzipEntries.toString()})`, { TextDecoder });
  const [e] = fn(bytes);
  assert.equal(e.name, "x.csv");
  assert.equal(e.crcOk, true);
  assert.equal(Buffer.from(e.data).toString("utf8"), "a,b\n");
  assert.doesNotThrow(() => new vm.Script(capture.INIT_SCRIPT));
});

// ---------------------------------------------------------------- csvread

test("parseCsv handles RFC 4180 quoting", () => {
  assert.deepEqual(parseCsv(""), []);
  assert.deepEqual(parseCsv("a,b\n"), [["a", "b"]]);
  assert.deepEqual(parseCsv("a,b"), [["a", "b"]]);
  assert.deepEqual(parseCsv("\n"), [[""]]);
  assert.deepEqual(parseCsv("a\n\nb\n"), [["a"], [""], ["b"]]);
  assert.deepEqual(parseCsv(",,\n"), [["", "", ""]]);
  assert.deepEqual(parseCsv("a,\n"), [["a", ""]]);
  assert.deepEqual(parseCsv('"a,b","c""d",""\n'), [["a,b", 'c"d', ""]]);
  assert.deepEqual(parseCsv('"line\nbreak","cr\r\nlf",x\n'), [["line\nbreak", "cr\r\nlf", "x"]]);
  assert.deepEqual(parseCsv('"""quoted"""\n'), [['"quoted"']]);
  assert.deepEqual(parseCsv("a,b\r\nc,d\r\n"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseCsv("'=1+2,x\n"), [["'=1+2", "x"]]);
  assert.deepEqual(parseCsv("é,–\n"), [["é", "–"]]);
});

test("parseCsv throws on malformed input, naming the line but not the content", () => {
  const cases = [
    ['a"b\n', /quote inside an unquoted field \(line 1\)/],
    ['x\n"abc\n', /unterminated quoted field \(line 2\)/],
    ['"a"b\n', /text after a closing quote \(line 1\)/],
    ["a\rb\n", /carriage return outside quotes/],
    ['x\n"multi\nline"y\n', /text after a closing quote \(line 3\)/],
    [' "a"\n', /quote inside an unquoted field/],
  ];
  for (const [text, re] of cases) {
    assert.throws(() => parseCsv(text), (e) => re.test(e.message) && !e.message.includes("abc") && !e.message.includes("multi"));
  }
  assert.throws(() => parseCsv(5), TypeError);
});

test("parseCsv reads back what an RFC 4180 writer writes (seeded)", () => {
  const rnd = mulberry32(20261016);
  const alphabet = ["a", "Z", "0", " ", ",", '"', "\n", "\r\n", "=", "+", "-", "@", "é", "–"];
  const cell = () => {
    let s = "";
    const n = Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(rnd() * alphabet.length)];
    return s;
  };
  const write = (rows) => rows.map((r) => r.map((c) => (/[",\r\n]/.test(c) || c === "" ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";
  for (let k = 0; k < 500; k++) {
    const width = 1 + Math.floor(rnd() * 4);
    const rows = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => Array.from({ length: width }, cell));
    assert.deepEqual(parseCsv(write(rows)), rows);
  }
});

// ---------------------------------------------------------------- canon

test("canon round trips -0, NaN, ±Infinity and undefined", () => {
  const values = [-0, 0, NaN, Infinity, -Infinity, undefined, null, 1.5e-7, -12.34, 1e21, "", "a\"b\\c\n\u2028\ud800", true, false];
  for (const v of values) {
    const back = canon.parse(canon(v));
    assert.ok(Object.is(back, v), `round trip of ${String(v)}`);
  }
  const nested = { a: [-0, NaN, undefined, { b: Infinity, c: -Infinity }], d: undefined, "": null, 10: "ten", 2: "two" };
  const back = canon.parse(canon(nested));
  assert.deepStrictEqual(back, nested);
  assert.ok(Object.is(back.a[0], -0));
  assert.deepEqual(Object.keys(back), Object.keys(nested));
  assert.equal(canon(nested), '{"2":"two","10":"ten","a":[-0,NaN,undefined,{"b":Infinity,"c":-Infinity}],"d":undefined,"":null}');
});

test("canon tells apart what JSON merges, and keeps key order", () => {
  assert.notEqual(canon(-0), canon(0));
  assert.notEqual(canon({ a: undefined }), canon({}));
  assert.notEqual(canon([undefined]), canon([null]));
  assert.notEqual(canon({ a: 1, b: 2 }), canon({ b: 2, a: 1 }));
  assert.equal(canon([1, , 3]), "[1,undefined,3]"); // eslint-disable-line no-sparse-arrays
  const proto = canon.parse('{"__proto__":{"x":1}}');
  assert.equal(Object.getPrototypeOf(proto), Object.prototype);
  assert.deepEqual(Object.keys(proto), ["__proto__"]);
  assert.equal(canon(proto), '{"__proto__":{"x":1}}');
  const foreign = vm.runInNewContext('({a: [1, {b: "c"}], n: Object.create(null)})');
  assert.equal(canon(foreign), '{"a":[1,{"b":"c"}],"n":{}}');
  const shared = { x: 1 };
  assert.equal(canon([shared, shared]), '[{"x":1},{"x":1}]');
});

test("canon refuses what is not plain data, and parse is strict", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  for (const v of [cyclic, new Map(), new Date(0), () => 1, 1n, Symbol("s"), new Uint8Array(1), /x/]) {
    assert.throws(() => canon(v), TypeError);
  }
  for (const bad of ["", " 1", "1 ", "[1,]", '{"a":1,"a":2}', "{a:1}", "nul", "01", "'x'", "[undefined", '"\u0001"']) {
    assert.throws(() => canon.parse(bad), SyntaxError, bad);
  }
});

// ---------------------------------------------------------------- prng

test("mulberry32 is the reference generator, seeded and reproducible", () => {
  const first = (seed, n) => {
    const r = mulberry32(seed);
    return Array.from({ length: n }, () => r());
  };
  assert.deepEqual(first(1, 3), [0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  assert.deepEqual(first(42, 2), [0.6011037519201636, 0.44829055899754167]);
  assert.deepEqual(first(2 ** 32 + 1, 3), first(1, 3));
  assert.notDeepEqual(first(1, 3), first(2, 3));
  const r = mulberry32(7);
  for (let i = 0; i < 10000; i++) {
    const x = r();
    assert.ok(x >= 0 && x < 1);
  }
});

// ---------------------------------------------------------------- minipdf

test("renderPdf writes a well-formed, deterministic, ASCII-only PDF", () => {
  const pages = [[{ x: 50, y: 800, size: 12, text: "Example (Bank) \\ statement" }], []];
  const buf = renderPdf(pages);
  assert.deepEqual(buf, renderPdf(pages));
  const text = buf.toString("latin1");
  assert.ok(/^[\x0a\x20-\x7e]*$/.test(text), "ASCII only");
  assert.ok(text.startsWith("%PDF-1.4\n") && text.endsWith("%%EOF\n"));
  const startxref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)[1]);
  assert.equal(text.slice(startxref, startxref + 5), "xref\n");
  const xref = text.slice(startxref).split("\n");
  const count = Number(xref[1].split(" ")[1]);
  assert.equal(count, 3 + 2 * pages.length + 1);
  for (let k = 1; k < count; k++) {
    const off = Number(xref[2 + k].slice(0, 10));
    assert.equal(text.slice(off, off + `${k} 0 obj`.length), `${k} 0 obj`);
  }
  for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
    const start = m.index + m[0].length;
    assert.equal(text.slice(start + Number(m[1]), start + Number(m[1]) + "\nendstream".length), "\nendstream");
  }
  assert.ok(text.includes("(Example \\(Bank\\) \\\\ statement) Tj"));
});

test("renderPdf output reads back through the vendored pdf.js with the given text and positions", async () => {
  const pdfjs = require(path.join(REPO, "vendor", "pdf.min.js"));
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(REPO, "vendor", "pdf.worker.min.js");
  const pages = [
    [{ x: 50, y: 800, size: 10, text: "Example Bank statement" }, { x: 300.25, y: 700.5, text: "Price (USD) \\ 1,234.50 – ’q’ € × é" }],
    [],
    [{ x: 10, y: 10, size: 7.5, text: "page three" }],
  ];
  const doc = await pdfjs.getDocument({ data: new Uint8Array(renderPdf(pages)), isEvalSupported: false, verbosity: 0 }).promise;
  try {
    assert.equal(doc.numPages, 3);
    for (let i = 0; i < pages.length; i++) {
      const content = await (await doc.getPage(i + 1)).getTextContent();
      const items = content.items.filter((it) => it.str !== "").map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], h: it.height || Math.abs(it.transform[3]) }));
      assert.deepEqual(items, pages[i].map((p) => ({ str: p.text, x: p.x, y: p.y, h: p.size || 10 })));
    }
  } finally {
    await doc.destroy();
  }
});

test("renderPdf refuses what it cannot write", () => {
  assert.throws(() => renderPdf([]), TypeError);
  assert.throws(() => renderPdf([[{ x: 1, y: 1, text: "日本" }]]), /cannot be written in WinAnsiEncoding/);
  assert.throws(() => renderPdf([[{ x: 1, y: 1, text: "a", font: "bold" }]]), /unknown key "font"/);
  assert.throws(() => renderPdf([[{ x: NaN, y: 1, text: "a" }]]), /finite/);
  assert.throws(() => renderPdf([[{ x: 1, y: 1, text: 5 }]]), /text string/);
  assert.throws(() => renderPdf([[{ x: 1, y: 1, text: "a", size: 0 }]]), /positive/);
});

// ---------------------------------------------------------------- mkxlsx

const WORKBOOK = {
  "Account Summary": [["Currency", "USD"], ["Opening", -0], [], [null, "x", null]],
  "Account Activity": [["Date", "Type", "Amount"], [46023.5, "Deposit & <fee> \"q\" 'a'", 100], [46024, "  padded  ", 0.1 + 0.2], [true, false, 1e21],
    ["tab\there", "line\nbreak", "cr\rhere"], ["ünïcödé €–’", "", 0]],
  2024: [["integer-like sheet name"]],
  "": [],
  "Sheet \"quoted\" & <x>": [[1, null, null]],
};

test("renderXlsx writes a stored, deterministic workbook with inline strings", () => {
  const buf = renderXlsx(WORKBOOK);
  assert.deepEqual(buf, renderXlsx(WORKBOOK));
  const entries = unzip(buf);
  assert.ok(entries.every((e) => e.crcOk));
  const byName = Object.fromEntries(entries.map((e) => [e.name, e.data.toString("utf8")]));
  const sheets = [...byName["xl/workbook.xml"].matchAll(/<sheet name="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(sheets, ["2024", "Account Summary", "Account Activity", "", "Sheet &quot;quoted&quot; &amp; &lt;x&gt;"]);
  const summary = byName["xl/worksheets/sheet2.xml"];
  assert.ok(summary.includes('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Currency</t></is></c>'));
  assert.ok(summary.includes('<c r="B2"><v>-0</v></c>'));
  assert.ok(summary.includes('<row r="3"/>'));
  assert.ok(summary.includes('<c r="A4"/><c r="B4" t="inlineStr">'));
  const activity = byName["xl/worksheets/sheet3.xml"];
  assert.ok(activity.includes('<c r="A4" t="b"><v>1</v></c><c r="B4" t="b"><v>0</v></c><c r="C4"><v>1e+21</v></c>'));
  assert.ok(activity.includes("Deposit &amp; &lt;fee&gt; \"q\" 'a'"));
  assert.ok(activity.includes("cr&#13;here"));
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
});

test("renderXlsx with deflate holds the same parts, raw-deflated", () => {
  const stored = unzip(renderXlsx(WORKBOOK));
  const deflated = renderXlsx(WORKBOOK, { deflate: true });
  assert.throws(() => unzip(deflated), /compression method 8/);
  // Walk the central directory by hand and inflate each entry with zlib.
  const eocd = deflated.length - 22;
  let p = deflated.readUInt32LE(eocd + 16);
  for (const want of stored) {
    const csize = deflated.readUInt32LE(p + 20);
    const nameLen = deflated.readUInt16LE(p + 28);
    const local = deflated.readUInt32LE(p + 42);
    assert.equal(deflated.readUInt16LE(p + 10), 8);
    assert.equal(deflated.toString("utf8", p + 46, p + 46 + nameLen), want.name);
    const start = local + 30 + deflated.readUInt16LE(local + 26) + deflated.readUInt16LE(local + 28);
    const data = zlib.inflateRawSync(deflated.subarray(start, start + csize));
    assert.deepEqual(data, want.data);
    assert.equal(deflated.readUInt32LE(p + 16), want.crc32);
    p += 46 + nameLen;
  }
});

test("renderXlsx round trips through core/xlsx.js", async () => {
  const Xlsx = require(path.join(REPO, "core", "xlsx.js"));
  for (const deflate of [false, true]) {
    const got = await Xlsx.read(new Uint8Array(renderXlsx(WORKBOOK, { deflate })), async (d) => new Uint8Array(zlib.inflateRawSync(d)));
    assert.deepStrictEqual(got, WORKBOOK);
  }
});

test("renderXlsx refuses values a workbook cannot hold", () => {
  assert.throws(() => renderXlsx({}), /at least one sheet/);
  assert.throws(() => renderXlsx([]), TypeError);
  assert.throws(() => renderXlsx({ S: [[undefined]] }), /no value at column 0/);
  assert.throws(() => renderXlsx({ S: [[1, , 2]] }), /no value at column 1/); // eslint-disable-line no-sparse-arrays
  assert.throws(() => renderXlsx({ S: [[NaN]] }), /finite/);
  assert.throws(() => renderXlsx({ S: [[{}]] }), /string, number, boolean or null/);
  assert.throws(() => renderXlsx({ S: [["bad\u0001char"]] }), /XML cannot hold/);
  assert.throws(() => renderXlsx({ S: ["row"] }), /must be an array/);
});

// ---------------------------------------------------------------- fixtures

const SPEC_TEXT = `// SYNTHETIC TEST DATA
module.exports = {
  marker: "SYNTHETIC TEST DATA",
  files: [
    { name: "example-2026-01.pdf", pages: [[{ x: 50, y: 800, size: 10, text: "Example Bank statement" }]] },
    { name: "example-history.csv", text: "\\uFEFFdate,amount\\r\\n2026-02-01,1.00\\r\\n" },
    { name: "example-2026.xlsx", sheets: { "Account Summary": [["Currency", "USD"]], "Account Activity": [["Date", "Amount"], [46023, 100]] } },
  ],
  expectErrors: ["example-history.csv"],
};
`;

test("loadSpec validates a spec and renderFixtures writes it in spec order", () => withEnv(privateSandbox().env, () => {
  const dir = tmpDir("spec");
  fs.writeFileSync(path.join(dir, "statements.js"), SPEC_TEXT);
  fs.writeFileSync(path.join(dir, "hostile.js"), SPEC_TEXT.replace("Example Bank statement", "<b>x</b>"));
  const spec = fixtures.loadSpec(dir);
  assert.equal(spec.marker, "SYNTHETIC TEST DATA");
  assert.deepEqual(spec.files.map((f) => f.name), ["example-2026-01.pdf", "example-history.csv", "example-2026.xlsx"]);
  assert.deepEqual(spec.expectErrors, ["example-history.csv"]);
  assert.equal(fixtures.loadSpec(path.join(dir, "hostile.js")).files[0].pages[0][0].text, "<b>x</b>");
  const out = path.join(tmpDir("render"), "nested");
  const paths = fixtures.renderFixtures(spec, out);
  assert.deepEqual(paths, spec.files.map((f) => path.join(out, f.name)));
  assert.ok(fs.readFileSync(paths[0]).toString("latin1").startsWith("%PDF-1.4"));
  assert.deepEqual(fs.readFileSync(paths[1]), Buffer.from("\ufeffdate,amount\r\n2026-02-01,1.00\r\n", "utf8"));
  assert.ok(unzip(fs.readFileSync(paths[2])).some((e) => e.name === "xl/worksheets/sheet2.xml"));
}));

test("loadSpec rejects malformed specs", () => {
  const dir = tmpDir("badspec");
  const file = path.join(dir, "statements.js");
  const bad = (body, re) => {
    fs.writeFileSync(file, body);
    assert.throws(() => fixtures.loadSpec(dir), re);
  };
  const ok = (files, extra = "") => `// SYNTHETIC TEST DATA\nmodule.exports = { marker: "SYNTHETIC TEST DATA", files: ${files}${extra} };\n`;
  bad("module.exports = { files: [] };\n", /does not contain/);
  bad(ok('[{ name: "a.csv", text: "x" }]').replace('marker: "SYNTHETIC TEST DATA"', 'marker: "other"'), /marker must be/);
  bad(ok("[]"), /non-empty array/);
  bad(ok('[{ name: "a.csv", text: "x" }]', ", extra: 1"), /unknown key "extra"/);
  bad(ok('[{ name: "a.csv", text: "x", note: 1 }]'), /unknown key "note"/);
  bad(ok('[{ name: "a.csv", text: "x" }, { name: "A.CSV", text: "y" }]'), /appears twice/);
  bad(ok('[{ name: "../a.csv", text: "x" }]'), /plain file name/);
  bad(ok('[{ name: "a/b.csv", text: "x" }]'), /plain file name/);
  bad(ok('[{ name: "a.csv", text: "x", sheets: {} }]'), /exactly one of/);
  bad(ok('[{ name: "a.csv" }]'), /exactly one of/);
  bad(ok('[{ name: "a.pdf", pages: [] }]'), /non-empty array of pages/);
  bad(ok('[{ name: "a.csv", text: "x" }]', ', expectErrors: ["b.csv"]'), /not in files/);
});

test("renderFixtures refuses to write inside this repository", () => withEnv(privateSandbox().env, () => {
  const spec = { marker: "SYNTHETIC TEST DATA", files: [{ name: "a.csv", text: "x\n" }] };
  assert.throws(() => fixtures.renderFixtures(spec, path.join(REPO, "test", "zz-out")), /inside this repository/);
  assert.equal(fs.existsSync(path.join(REPO, "test", "zz-out")), false);
}));

// ---------------------------------------------------------------- private

// A sandbox for the private-data roots: old root, statements, private dir, config dir.
function privateSandbox() {
  const root = tmpDir("private");
  const dirs = {
    home: path.join(root, "home"),
    old: path.join(root, "old"),
    statements: path.join(root, "statements"),
    cache: path.join(root, "cache"),
    config: path.join(root, "config"),
  };
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
  const env = {
    HOME: dirs.home,
    S2C_OLD_ROOT: dirs.old,
    S2C_STATEMENTS: dirs.statements,
    S2C_PRIVATE: undefined,
    XDG_CACHE_HOME: dirs.cache,
    XDG_CONFIG_HOME: dirs.config,
  };
  const writeConfig = (text) => {
    fs.mkdirSync(path.join(dirs.config, "statement2csv"), { recursive: true });
    fs.writeFileSync(path.join(dirs.config, "statement2csv", "statements.js"), text);
  };
  return { dirs, env, writeConfig };
}

test("private roots come from the environment, else the home directory", async () => {
  const { dirs, env } = privateSandbox();
  await withEnv({ ...env, S2C_OLD_ROOT: undefined, S2C_STATEMENTS: undefined, XDG_CACHE_HOME: undefined, XDG_CONFIG_HOME: undefined }, () => {
    assert.equal(priv.oldRoot(), dirs.home);
    assert.equal(priv.statementsRoot(), path.join(dirs.home, "statements"));
    assert.equal(priv.configDir(), path.join(dirs.home, ".config", "statement2csv"));
    assert.equal(priv.privateRoot(), path.join(dirs.home, ".cache", "statement2csv"));
  });
  await withEnv({ ...env, XDG_CONFIG_HOME: "relative/ignored" }, () => {
    assert.equal(priv.oldRoot(), dirs.old);
    assert.equal(priv.oldRoot(path.join(dirs.old, "cli")), path.join(dirs.old, "cli"));
    assert.equal(priv.statementsRoot(), dirs.statements);
    assert.equal(priv.configDir(), path.join(dirs.home, ".config", "statement2csv"));
    assert.equal(priv.privateRoot(), path.join(dirs.cache, "statement2csv"));
  });
  await withEnv({ ...env, S2C_PRIVATE: path.join(dirs.cache, "elsewhere") }, () => {
    assert.equal(priv.privateRoot(), path.join(dirs.cache, "elsewhere"));
  });
});

test("privateDir creates the private directory with mode 0700 and keeps paths inside it", async () => {
  const { dirs, env } = privateSandbox();
  await withEnv(env, () => {
    const root = path.join(dirs.cache, "statement2csv");
    assert.equal(priv.privateDir(), root);
    assert.equal(fs.statSync(root).mode & 0o777, 0o700);
    fs.chmodSync(root, 0o755);
    assert.equal(priv.privateDir("golden", "x"), path.join(root, "golden", "x"));
    assert.equal(fs.statSync(root).mode & 0o777, 0o700, "a wider mode is tightened");
    assert.equal(fs.existsSync(path.join(root, "golden")), false, "the joined path is not created");
    assert.throws(() => priv.privateDir("..", "out"), /leaves the private directory/);
    const file = priv.writePrivate(path.join(root, "reports", "r.json"), "{}");
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
    assert.throws(() => priv.writePrivate(path.join(dirs.home, "x.json"), "{}"), /not inside the private directory/);
  });
  await withEnv({ ...env, S2C_PRIVATE: path.join(REPO, "zz-private") }, () => {
    assert.throws(() => priv.privateDir(), /inside this repository/);
    assert.equal(fs.existsSync(path.join(REPO, "zz-private")), false);
  });
});

test("userConfig reads the untracked config afresh, with defaults, and rejects mistakes", async () => {
  const { dirs, env, writeConfig } = privateSandbox();
  await withEnv(env, () => {
    assert.deepEqual(priv.userConfig(), { providers: {}, refuse: [] });
    const dir = path.join(dirs.statements, "x");
    writeConfig(`module.exports = { providers: { demo: { dir: ${JSON.stringify(dir)}, expectErrors: ["a.pdf"], allowProblems: 2 } }, refuse: [${JSON.stringify(dirs.home)}] };`);
    assert.deepEqual(priv.userConfig(), { providers: { demo: { dir, expectErrors: ["a.pdf"], allowProblems: 2 } }, refuse: [dirs.home] });
    writeConfig("module.exports = { providers: { demo: {} } };");
    assert.deepEqual(priv.userConfig(), { providers: { demo: { expectErrors: [], allowProblems: 0 } }, refuse: [] });
    for (const [text, re] of [
      ["module.exports = { refuses: [] };", /unknown key "refuses"/],
      ['module.exports = { refuse: ["relative/path"] };', /absolute paths/],
      ['module.exports = { providers: { demo: { dir: "rel" } } };', /absolute path/],
      ["module.exports = { providers: { demo: { allowProblems: -1 } } };", /non-negative integer/],
      ["module.exports = { providers: { demo: { expectErrors: [1] } } };", /array of file names/],
      ["module.exports = { providers: { demo: { typo: 1 } } };", /unknown key providers.demo.typo/],
      ["module.exports = [];", /must be an object/],
      ["module.exports = {", /cannot load the user config/],
    ]) {
      writeConfig(text);
      assert.throws(() => priv.userConfig(), re, text);
    }
  });
});

test("statementsFor resolves --statements, then the config, then a folder match", async () => {
  const { dirs, env, writeConfig } = privateSandbox();
  const mk = (...p) => {
    const d = path.join(...p);
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  const cliDir = mk(dirs.home, "cli-statements");
  const cfgDir = mk(dirs.home, "configured");
  const byId = mk(dirs.statements, "DEMO");
  const byRepo = mk(dirs.statements, "Older");
  await withEnv(env, () => {
    writeConfig(`module.exports = { providers: { demo: { dir: ${JSON.stringify(cfgDir)}, expectErrors: ["x.pdf"], allowProblems: 1 } } };`);
    const want = (dir) => ({ dir, expectErrors: ["x.pdf"], allowProblems: 1 });
    assert.deepEqual(priv.statementsFor("demo", { cli: [`demo=${cliDir}`, `other=${dirs.home}`] }), want(cliDir));
    assert.deepEqual(priv.statementsFor("demo", { cli: `demo=${cliDir}` }), want(cliDir));
    assert.deepEqual(priv.statementsFor("demo", { cli: { demo: cliDir } }), want(cliDir));
    assert.deepEqual(priv.statementsFor("demo"), want(cfgDir));
    writeConfig("module.exports = {};");
    assert.deepEqual(priv.statementsFor("demo"), { dir: byId, expectErrors: [], allowProblems: 0 });
    assert.deepEqual(priv.statementsFor("zz-new", { legacyRepo: "older2csv" }), { dir: byRepo, expectErrors: [], allowProblems: 0 });
    assert.throws(() => priv.statementsFor("zz-none", { legacyRepo: null }), /no statement folder for zz-none: pass --statements zz-none=<dir>/);
    mk(dirs.statements, "demo");
    assert.throws(() => priv.statementsFor("demo"), /several folders/);
    assert.throws(() => priv.statementsFor("demo", { cli: ["demo"] }), /expects <id>=<dir>/);
    assert.throws(() => priv.statementsFor("demo", { cli: [`demo=${cliDir}`, `demo=${cfgDir}`] }), /twice/);
    assert.throws(() => priv.statementsFor("demo", { cli: { demo: path.join(dirs.home, "missing") } }), /does not exist/);
    writeConfig(`module.exports = { refuse: [${JSON.stringify(cliDir)}] };`);
    assert.throws(() => priv.statementsFor("demo", { cli: { demo: cliDir } }), /refuse list/);
  });
});

test("assertSafeOutput refuses each guarded root", async () => {
  const { dirs, env, writeConfig } = privateSandbox();
  const repos = frozenRepos();
  assert.ok(repos.length > 0, "the repo has frozen.js files with legacyRepo");
  const refused = path.join(dirs.home, "private-project");
  const configured = path.join(dirs.home, "elsewhere-statements");
  fs.mkdirSync(refused);
  fs.mkdirSync(configured);
  const link = path.join(dirs.home, "link-into-repo");
  fs.symlinkSync(REPO, link);
  const dangling = path.join(dirs.home, "dangling-into-repo");
  fs.symlinkSync(path.join(REPO, "zz-not-there"), dangling);
  await withEnv(env, () => {
    writeConfig(`module.exports = { providers: { demo: { dir: ${JSON.stringify(configured)} } }, refuse: [${JSON.stringify(refused)}] };`);
    const no = (p, re) => assert.throws(() => priv.assertSafeOutput(p), re, p);
    no(REPO, /inside this repository/);
    no(path.join(REPO, "test", "out", "x.json"), /inside this repository/);
    no(path.join(link, "x.json"), /inside this repository/);
    no(dangling, /inside this repository/);
    no(path.join(dangling, "x.json"), /inside this repository/);
    for (const r of repos) {
      no(path.join(dirs.old, r), /inside the old repository/);
      no(path.join(dirs.old, r, "test", "out.csv"), /inside the old repository/);
    }
    no(dirs.statements, /inside the statements folder/);
    no(path.join(dirs.statements, "a", "b.csv"), /inside the statements folder/);
    no(path.join(configured, "x"), /statement folder of demo/);
    no(path.join(refused, "deep", "x"), /refuse list/);
    for (const ok of [path.join(dirs.cache, "statement2csv", "x"), path.join(dirs.home, "out"), path.join(dirs.old, "not-an-old-repo", "x"), `${dirs.statements}-sibling`]) {
      assert.doesNotThrow(() => priv.assertSafeOutput(ok), ok);
    }
    assert.throws(() => priv.assertSafeOutput(""), TypeError);
  });
});

test("assertSafeInput allows only statement folders, old repos, this repo and the private dir", async () => {
  const { dirs, env, writeConfig } = privateSandbox();
  const [repo] = frozenRepos();
  const allowed = path.join(dirs.statements, "demo");
  const refusedInside = path.join(allowed, "secret");
  fs.mkdirSync(refusedInside, { recursive: true });
  fs.writeFileSync(path.join(dirs.home, "outside.pdf"), "x");
  fs.symlinkSync(path.join(dirs.home, "outside.pdf"), path.join(allowed, "link-out.pdf"));
  fs.symlinkSync(path.join(allowed, "secret"), path.join(dirs.statements, "link-to-secret"));
  await withEnv(env, () => {
    writeConfig(`module.exports = { refuse: [${JSON.stringify(refusedInside)}] };`);
    const yes = (p) => assert.doesNotThrow(() => priv.assertSafeInput(p, { allowed: [allowed] }), p);
    const no = (p, re) => assert.throws(() => priv.assertSafeInput(p, { allowed: [allowed] }), re, p);
    yes(path.join(allowed, "a.pdf"));
    yes(path.join(REPO, "vendor", "pdf.min.js"));
    yes(path.join(dirs.old, repo, "index.html"));
    yes(path.join(dirs.cache, "statement2csv", "golden", "m.json"));
    no(path.join(dirs.statements, "other", "a.pdf"), /not inside a statement folder/);
    no(path.join(dirs.home, "a.pdf"), /not inside/);
    no(path.join(refusedInside, "a.pdf"), /refuse list/);
    no(path.join(allowed, "link-out.pdf"), /not inside/);
    no(path.join(dirs.statements, "link-to-secret", "a.pdf"), /refuse list/);
  });
});

// ---------------------------------------------------------------- serve

function request(origin, rawPath, method = "GET") {
  return new Promise((resolve, reject) => {
    const u = new URL(origin);
    const req = http.request({ host: u.hostname, port: u.port, path: rawPath, method, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("serve answers only its allowlist, with no-store", async () => {
  const dir = tmpDir("serve");
  const page = path.join(dir, "index.html");
  fs.writeFileSync(page, "<!doctype html><p>old</p>\n");
  fs.writeFileSync(path.join(dir, "secret.txt"), "secret\n");
  const srv = await serve({ "/old/demo/": page, "/old/demo/index.html": page });
  try {
    assert.match(srv.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
    for (const p of ["/old/demo/", "/old/demo/index.html", "/old/demo/?x=1"]) {
      const r = await request(srv.origin, p);
      assert.equal(r.status, 200, p);
      assert.equal(r.body.toString(), "<!doctype html><p>old</p>\n");
      assert.equal(r.headers["cache-control"], "no-store");
      assert.equal(r.headers["content-type"], "text/html; charset=utf-8");
    }
    const head = await request(srv.origin, "/old/demo/", "HEAD");
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    for (const p of ["/", "/old/demo", "/old/demo/secret.txt", "/old/demo/../demo/index.html", "/old/demo/%2e%2e/demo/index.html",
      "/old/demo/%2E%2E/x", "/old/demo%2findex.html", "/old/demo/%5cindex.html", "/old\\demo/", "/old/demo/index.html%00", "/%E0%A4%A"]) {
      const r = await request(srv.origin, p);
      assert.equal(r.status, 404, p);
      assert.equal(r.headers["cache-control"], "no-store");
    }
    assert.equal((await request(srv.origin, "/old/demo/", "POST")).status, 405);
  } finally {
    await srv.close();
    await srv.close();
  }
  await assert.rejects(request(srv.origin, "/old/demo/"), /ECONNREFUSED/);
  await assert.rejects(serve({ "no-slash": page }), TypeError);
  await assert.rejects(serve({ "/x": "relative.html" }), TypeError);
  await assert.rejects(serve({ "/a/../b": page }), TypeError);
});

// ---------------------------------------------------------------- baseline

test("diffManifest reports added, removed and changed entries and symlink retargets", () => {
  const m = (entries) => new Map(entries);
  const file = (sha, size = 1, mtimeMs = 1) => ({ type: "file", size, mtimeMs, sha256: sha });
  const link = (to) => ({ type: "symlink", size: to.length, mtimeMs: 1, link: to });
  const before = m([[".", { type: "dir", size: 4096, mtimeMs: 1 }], ["a", file("aa")], ["b", file("bb")], ["l", link("x")], ["t", file("tt")], ["m", file("mm", 1, 1)]]);
  assert.deepEqual(baseline.diffManifest(before, new Map(before)), []);
  const after = m([[".", { type: "dir", size: 4096, mtimeMs: 2 }], ["a", file("a2", 2)], ["c", file("cc")], ["l", link("y")], ["t", link("tt")], ["m", file("mm", 1, 5)]]);
  assert.deepEqual(baseline.diffManifest(before, after), [
    "changed: . (mtimeMs)",
    "changed: a (size, sha256)",
    "removed: b",
    "added: c",
    "retargeted: l (x -> y)",
    "changed: m (mtimeMs)",
    "changed: t (type, size, sha256, link)",
  ]);
});

test("fsManifest records entries with lstat, never follows links and skips .git/objects contents", () => {
  const dir = tmpDir("manifest");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "a.js"), "a\n");
  fs.mkdirSync(path.join(dir, ".git", "objects", "ab"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".git", "objects", "ab", "cdef"), "blob");
  fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
  const outside = tmpDir("outside");
  fs.writeFileSync(path.join(outside, "big.txt"), "outside\n");
  fs.symlinkSync(outside, path.join(dir, "node_modules"));
  const m = baseline.fsManifest(dir);
  assert.deepEqual([...m.keys()], [".", ".git", ".git/HEAD", ".git/objects", "node_modules", "src", "src/a.js"]);
  assert.equal(m.get("src/a.js").sha256, sha256("a\n"));
  assert.equal(m.get("src/a.js").size, 2);
  assert.equal(m.get("src").type, "dir");
  assert.deepEqual({ type: m.get("node_modules").type, link: m.get("node_modules").link }, { type: "symlink", link: outside });
  assert.equal(m.get("node_modules").sha256, undefined);
  fs.writeFileSync(path.join(dir, ".git", "objects", "ab", "new"), "x");
  fs.writeFileSync(path.join(dir, "src", "a.js"), "b\n");
  fs.writeFileSync(path.join(dir, "added.txt"), "");
  const diff = baseline.diffManifest(m, baseline.fsManifest(dir));
  assert.ok(diff.includes("added: added.txt"));
  assert.ok(diff.some((l) => l.startsWith("changed: src/a.js (") && l.includes("sha256")));
  assert.ok(!diff.some((l) => l.includes(".git/objects/")));
});

// A throwaway git repository with one commit of index.html (never one of the old repos).
function gitRepo(root, name, html) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "app.js"), "// app\n");
  const env = { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "t", GIT_COMMITTER_NAME: "t",
    GIT_AUTHOR_EMAIL: ["t", "example.invalid"].join("@"), GIT_COMMITTER_EMAIL: ["t", "example.invalid"].join("@") };
  const git = (...args) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  git("init", "-q");
  git("add", "index.html", "src/app.js");
  git("commit", "-q", "-m", "init");
  return { dir, head: git("rev-parse", "HEAD") };
}

test("checkGit compares HEAD and index.html with the frozen values through plumbing only", () => {
  const root = tmpDir("gitroot");
  const html = "<!doctype html><p>page</p>\n";
  const { dir, head } = gitRepo(root, "demo-repo", html);
  const frozen = { legacyRepo: "demo-repo", legacyHead: head, legacyIndexSha256: sha256(html), legacyUrl: "http://127.0.0.1:9/" };
  const before = baseline.fsManifest(dir);
  assert.deepEqual(baseline.checkGit(frozen, { oldRoot: root, files: ["src/app.js"] }), []);
  assert.deepEqual(baseline.diffManifest(before, baseline.fsManifest(dir)), [], "the checks write nothing, not even .git/index");
  const wrongHead = baseline.checkGit({ ...frozen, legacyHead: "0".repeat(40) }, { oldRoot: root });
  assert.ok(wrongHead.some((p) => p.includes(`HEAD is ${head}`)));
  assert.ok(baseline.checkGit({ ...frozen, legacyIndexSha256: "f".repeat(64) }, { oldRoot: root }).some((p) => p.includes("legacyIndexSha256")));
  fs.writeFileSync(path.join(dir, "src", "app.js"), "// edited\n");
  assert.ok(baseline.checkGit(frozen, { oldRoot: root, files: ["src/app.js"] }).some((p) => p.includes("src/app.js on disk")));
  assert.ok(baseline.checkGit(frozen, { oldRoot: root, files: ["missing.js"] }).some((p) => p.includes("cannot read missing.js")));
  assert.ok(baseline.checkGit({ ...frozen, legacyRepo: "absent" }, { oldRoot: root })[0].includes("git rev-parse HEAD failed"));
  assert.deepEqual(baseline.checkGit({}, { oldRoot: root }), ["frozen object has no legacyRepo"]);
});

// A local HTTP server for the live-page check.
async function liveServer(body) {
  const server = http.createServer((req, res) => {
    if (req.url === "/page") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(body);
    } else if (req.url === "/encoding") {
      res.end(String(req.headers["accept-encoding"]));
    } else if (req.url === "/redirect") {
      res.writeHead(301, { Location: "/page" });
      res.end();
    } else if (req.url === "/loop") {
      res.writeHead(302, { Location: "/loop" });
      res.end();
    } else {
      res.writeHead(req.url === "/error" ? 500 : 404);
      res.end("no");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}

test("liveSha256 follows redirects, asks for no compression and never passes on failure", async () => {
  const live = await liveServer("live page\n");
  try {
    assert.equal(await baseline.liveSha256(`${live.origin}/page`), sha256("live page\n"));
    assert.equal(await baseline.liveSha256(`${live.origin}/redirect`), sha256("live page\n"));
    assert.equal(await baseline.liveSha256(`${live.origin}/encoding`), sha256("identity"));
    await assert.rejects(baseline.liveSha256(`${live.origin}/missing`), /HTTP 404/);
    await assert.rejects(baseline.liveSha256(`${live.origin}/error`), /HTTP 500/);
    await assert.rejects(baseline.liveSha256(`${live.origin}/loop`), /too many redirects/);
    await assert.rejects(baseline.liveSha256("ftp://127.0.0.1/x"), /unsupported protocol/);
  } finally {
    await live.close();
  }
  await assert.rejects(baseline.liveSha256(`${live.origin}/page`), /ECONNREFUSED/, "a fresh connection per request, never a stale pooled socket");
});

test("before and after catch a write anywhere in an old repo", async () => {
  const html = "<!doctype html><p>live</p>\n";
  const live = await liveServer(html);
  const root = tmpDir("oldroot");
  try {
    const { dir, head } = gitRepo(root, "demo-repo", html);
    const frozen = { legacyRepo: "demo-repo", legacyHead: head, legacyIndexSha256: sha256(html), legacyUrl: `${live.origin}/page` };
    const run = await baseline.before([frozen, { legacyRepo: null }], { live: true, oldRoot: root });
    assert.deepEqual(run.problems, []);
    assert.deepEqual([...run.manifests.keys()], [dir]);
    assert.deepEqual(baseline.after(run.manifests), []);
    fs.writeFileSync(path.join(dir, "src", "new.js"), "x");
    const found = baseline.after(run.manifests);
    assert.ok(found.includes("demo-repo: added: src/new.js"), JSON.stringify(found));
    assert.ok(found.every((l) => l === "demo-repo: added: src/new.js" || l === "demo-repo: changed: src (mtimeMs)"), JSON.stringify(found));
    const wrong = await baseline.before({ demo: { ...frozen, legacyUrl: `${live.origin}/missing` } }, { live: true, oldRoot: root });
    assert.ok(wrong.problems.some((p) => p.includes("could not be fetched")));
    const offline = await baseline.before(new Map([["demo", { ...frozen, legacyUrl: `${live.origin}/missing` }]]), { live: false, oldRoot: root });
    assert.deepEqual(offline.problems, []);
  } finally {
    await live.close();
  }
});

// ---------------------------------------------------------------- reconcile

// A small ledger with the export layer's contract: entries per month plus a month-end
// adjustment onto the closing; the opening is the previous month's closing.
function ledgerP({ dropTrades = false, wrongMonthOpening = false } = {}) {
  const inRange = (d, from, to) => (!from || d.slice(0, 7) >= from) && (!to || d.slice(0, 7) <= to);
  const sorted = (a) => Object.keys(a.months).sort();
  return {
    adjustedEntries(a, from, to, earliest, withTrades = false) {
      const out = [];
      sorted(a).forEach((m, i, keys) => {
        const mo = a.months[m];
        if (!inRange(mo.monthEnd, from, to)) return;
        const base = i ? a.months[keys[i - 1]].closing : mo.opening;
        const cash = a.cash.filter((c) => c.date.startsWith(m));
        out.push(...cash);
        if (withTrades && !dropTrades) out.push(...a.trades.filter((t) => t.date.startsWith(m)).map((t) => ({ date: t.date, amount: 0, kind: "trade" })));
        const adj = Math.round((mo.closing - base - cash.reduce((s, c) => s - c.amount, 0)) * 100) / 100;
        if (Math.abs(adj) >= 0.005) out.push({ date: mo.monthEnd, amount: -adj, kind: "adjustment" });
      });
      out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
      return { entries: out, problems: (a.problems || []).slice() };
    },
    openingBalance(a, from, to) {
      const keys = sorted(a);
      const i = keys.findIndex((m) => inRange(a.months[m].monthEnd, from, to));
      if (i < 0) return null;
      const balance = i ? a.months[keys[i - 1]].closing : a.months[keys[i]].opening;
      return { balance: wrongMonthOpening && from && from === to ? balance + 1 : balance, date: `${keys[i]}-00` };
    },
  };
}

function ledgerResult() {
  const account = {
    kind: "investment",
    currency: "SGD",
    months: {
      "2026-01": { monthEnd: "2026-01-31", opening: 100, closing: 160 },
      "2026-02": { monthEnd: "2026-02-28", opening: 160, closing: 150.5 },
    },
    cash: [{ date: "2026-01-05", amount: -50, kind: "deposit" }, { date: "2026-02-10", amount: 20, kind: "withdrawal" }],
    trades: [{ date: "2026-01-06", ticker: "FUND", qty: 1, price: 50, currency: "SGD", name: "Fund" }],
    valuations: [["2026-01-31", 160], ["2026-02-28", 150.5]],
  };
  return { accounts: { Demo: account, Empty: { kind: "cash", currency: "SGD", months: {}, cash: [], trades: [], valuations: [] } }, months: [{ month: "2026-01" }, { month: "2026-02" }] };
}

test("reconcileStatement passes a ledger that reconciles", () => {
  assert.deepEqual(reconcileStatement({ P: ledgerP() }, ledgerResult(), { mode: "balance" }), []);
  assert.deepEqual(reconcileStatement({ P: ledgerP() }, null), []);
  assert.throws(() => reconcileStatement({}, ledgerResult()), TypeError);
});

test("reconcileStatement reports each kind of problem, one line each", () => {
  const r = ledgerResult();
  r.accounts.Demo.valuations[1][1] = 151.5;
  assert.deepEqual(reconcileStatement({ P: ledgerP() }, r), [
    "Demo (balance only): the running balance misses 1 of 2 month-end values (max diff 1.00)",
    "Demo (trade log): the running balance misses 1 of 2 month-end values (max diff 1.00)",
  ]);
  const p = ledgerResult();
  p.accounts.Demo.problems = ["2026-02: cannot convert EUR entry"];
  assert.deepEqual(reconcileStatement({ P: ledgerP() }, p), ["Demo: 2026-02: cannot convert EUR entry"]);
  assert.deepEqual(reconcileStatement({ P: ledgerP({ dropTrades: true }) }, ledgerResult()), ["Demo (trade log): 0 trade lines for 1 trades"]);
  assert.deepEqual(reconcileStatement({ P: ledgerP({ wrongMonthOpening: true }) }, ledgerResult()), [
    "Demo: 2026-01: opening 101.00 plus its entries gives 161.00, the closing is 160.00",
    "Demo: 2026-02: opening 161.00 plus its entries gives 151.50, the closing is 150.50",
  ]);
});

// ---------------------------------------------------------------- page driver (pure parts)

test("isPdfWorkerFallback recognises exactly the pdf.js worker fallback entry", () => {
  const text = "error: Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'blob:null/<id>' failed to load.";
  assert.equal(capture.isPdfWorkerFallback(text), true);
  assert.equal(capture.isPdfWorkerFallback(text.replace("blob:null/<id>", "blob:http://127.0.0.1:8/<id>")), true);
  assert.equal(capture.isPdfWorkerFallback(`pageerror: ${text.slice(7)}`), false);
  assert.equal(capture.isPdfWorkerFallback(text.replace("importScripts", "fetch")), false);
  assert.equal(capture.isPdfWorkerFallback("unhandledrejection: TypeError: x"), false);
});

test("page-driver helpers: normalise and the picker filter", () => {
  assert.equal(driverLib.normalise("\n  <p>a</p>\n  <p> b\t c </p>\n"), "<p>a</p><p> b c </p>");
  assert.equal(driverLib.normalise("a\u00a0 \u202fb"), "a\u00a0 \u202fb");
  assert.equal(driverLib.normalise(null), null);
  assert.equal(driverLib.acceptsFile("application/pdf,.pdf,text/csv,.csv", "/x/A.PDF"), true);
  assert.equal(driverLib.acceptsFile("application/pdf,.pdf", "/x/a.csv"), false);
  assert.equal(driverLib.acceptsFile("text/csv", "/x/a.csv"), true);
  assert.equal(driverLib.acceptsFile(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "/x/a.txt"), false);
});

// ---------------------------------------------------------------- browser, capture, page driver

// A synthetic page with the apps' fixed ids, download pattern and store-only zip writer.
// It never runs in Node; its source text is the page's script.
function exampleApp() {
  const $ = (s) => document.querySelector(s);
  const MODE_KEY = "example-csv-mode";
  const CONFIG_KEY = "example-csv-accounts";
  const single = !$("#picker").multiple;
  const state = { statements: new Map(), failed: [], result: null, mode: "balance", config: {} };
  try {
    state.mode = localStorage.getItem(MODE_KEY) === "tradelog" ? "tradelog" : "balance";
    state.config = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {};
  } catch (e) {
    state.config = {};
  }
  const KIND = { investment: "Investment", cash: "Cash-like" };
  const setBusy = (msg) => {
    $("#busy").textContent = msg || "";
    $("#busy").hidden = !msg;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const monthLabel = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // What pdf.js does on a file:// page: a blob worker whose importScripts of another blob fails.
  const startWorker = () => {
    const inner = URL.createObjectURL(new Blob(["self.loaded = 1;"], { type: "text/javascript" }));
    return new Worker(URL.createObjectURL(new Blob([`importScripts('${inner}');`], { type: "text/javascript" })));
  };

  function parse(list, config) {
    const raw = {};
    for (const s of list) {
      if (s.text.includes("THROW")) throw new TypeError("injected failure");
      if (s.text.includes("VIOLATE")) new Image().src = "http://127.0.0.1:9/blocked.png";
      if (s.text.includes("CONSOLE")) console.error("example console error");
      const id = s.id.replace(/\.[^.]+$/, "");
      const rows = s.text.split("\n").filter((l) => /^\d{4}-\d{2},/.test(l)).map((l) => l.split(",")).map(([m, v]) => [m, Number(v)]);
      raw[id] = { id, label: id, kind: rows.length > 1 ? "investment" : "cash", currency: "SGD", rows };
    }
    const ids = Object.keys(raw).sort();
    const rootOf = (id) => {
      const seen = new Set();
      while (config[id] && config[id].mergeInto && raw[config[id].mergeInto] && !seen.has(id)) {
        seen.add(id);
        id = config[id].mergeInto;
      }
      return id;
    };
    const accounts = {};
    for (const id of ids) {
      const root = rootOf(id);
      if ((config[root] || {}).exclude || (config[id] || {}).exclude) continue;
      const name = ((config[root] || {}).name || "").trim() || raw[root].label;
      if (name === "THROW") throw new TypeError("injected failure");
      const a = (accounts[name] = accounts[name] || { kind: (config[root] || {}).kind || raw[root].kind, currency: raw[root].currency, rows: [] });
      a.rows.push(...raw[id].rows);
    }
    const months = [...new Set(ids.flatMap((id) => raw[id].rows.map(([m]) => m)))].sort();
    const portfolios = ids.map((id) => ({ id, label: raw[id].label, kind: raw[id].kind, currency: raw[id].currency, months: raw[id].rows.map(([m]) => m).sort() }));
    return { accounts, months, portfolios };
  }

  const range = () => {
    let from = $("#from").value;
    let to = $("#to").value;
    if (from && to && from > to) [from, to] = [to, from];
    return { from, to };
  };
  const span = () => {
    const { from, to } = range();
    return from === to ? from : `${from}_to_${to}`;
  };
  const rowsOf = (name) => {
    const { from, to } = range();
    return state.result.accounts[name].rows.filter(([m]) => m >= from && m <= to);
  };
  const kindsOf = (name) => (!rowsOf(name).length ? []
    : state.mode === "tradelog" && state.result.accounts[name].kind === "investment" ? ["transactions", "trades", "qif"] : ["transactions", "qif"]);
  const fileFor = (name, kind) => (kind === "qif"
    ? { name: `${name} - ${span()}.qif`, text: `!Type:Bank\n${rowsOf(name).map(([m, v]) => `D${m}-01\nT${v.toFixed(2)}\n^\n`).join("")}` }
    : { name: `${name} - ${kind} - ${span()}.csv`, text: `date,amount\n${rowsOf(name).map(([m, v]) => `${m}-01,${v.toFixed(2)}\n`).join("")}` });
  const withFiles = () => Object.keys(state.result.accounts).filter((n) => kindsOf(n).length);
  const accountsFile = () => ({ name: `Example accounts - ${span()}.csv`, text: `Name,Currency\n${withFiles().map((n) => `${n},${state.result.accounts[n].currency}\n`).join("")}` });

  function fillRange(months) {
    for (const [sel, pick] of [[$("#from"), months[0]], [$("#to"), months[months.length - 1]]]) {
      const prev = sel.value;
      sel.innerHTML = months.map((m) => `<option value="${m}">${monthLabel(m)}</option>`).join("");
      sel.value = months.includes(prev) ? prev : pick || "";
      sel.disabled = !months.length;
    }
  }
  function recompute() {
    state.result = state.statements.size ? parse([...state.statements.values()], state.config) : null;
    fillRange(state.result ? state.result.months : []);
    render();
  }
  function render() {
    const r = state.result;
    $("#empty").hidden = !!r;
    $("#results").hidden = !r;
    $("#status").innerHTML = r || state.failed.length
      ? `<p>${r ? r.months.length : 0} months</p>${state.failed.map((f) => `<p class="warn">${esc(f.id)}: ${esc(f.error)}</p>`).join("")}` : "";
    if (!r) return;
    const cards = withFiles().map((name) => `
      <article class="card">
        <header><h3>${esc(name)}</h3><span class="tag ${r.accounts[name].kind}">${KIND[r.accounts[name].kind] || ""}</span></header>
        <div class="buttons">${kindsOf(name).map((k) => `<button class="dl" data-account="${esc(name)}" data-kind="${k}">${k}</button>`).join("")}</div>
      </article>`);
    $("#cards").innerHTML = cards.join("") || '<p class="muted">No activity in the selected months.</p>';
    for (const id of ["accounts", "combined", "zip"]) $(`#${id}`).disabled = !cards.length;
    $("#diagnostics").innerHTML = "<details>\n  <summary>Skipped</summary>\n  <ul><li>none</li></ul>\n</details>";
    const ps = r.portfolios;
    $("#config-count").textContent = `${ps.length} detected`;
    const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(t)}</option>`;
    $("#config-list").innerHTML = ps.map((p) => {
      const c = state.config[p.id] || {};
      return `
        <div class="account-row${c.exclude ? " excluded" : ""}" data-id="${esc(p.id)}">
          <div class="p-head"><strong>${esc(p.label)}</strong>
            <span class="muted">${[`${monthLabel(p.months[0])} – ${monthLabel(p.months[p.months.length - 1])}`, p.currency].join(" · ")}</span></div>
          <div class="p-controls">
            <label>Export as <input data-field="name" value="${esc(c.name || "")}" placeholder="${esc(p.label)}"></label>
            <label>Type <select data-field="kind">${opt("", `Auto (${KIND[p.kind]})`, !c.kind)}${opt("investment", "Investment", c.kind === "investment")}${opt("cash", "Cash-like", c.kind === "cash")}</select></label>
            <label>Merge into <select data-field="mergeInto">${opt("", "—", !c.mergeInto)}${ps.filter((o) => o.id !== p.id).map((o) => opt(o.id, o.label, c.mergeInto === o.id)).join("")}</select></label>
            <label class="check"><input type="checkbox" data-field="include"${c.exclude ? "" : " checked"}> Export</label>
          </div>
        </div>`;
    }).join("");
  }
  function setMode(mode) {
    state.mode = mode;
    localStorage.setItem(MODE_KEY, mode);
    for (const b of document.querySelectorAll("#mode button")) {
      b.classList.toggle("on", b.dataset.mode === mode);
      b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    }
    render();
  }
  async function addFiles(fileList) {
    if (single) {
      const file = [...fileList].find((f) => /\.xlsx$/i.test(f.name)) || fileList[0];
      if (!file) return;
      setBusy(`Reading ${file.name}…`);
      await wait(30);
      state.statements = new Map([[file.name, { id: file.name, text: "2026-01,1\n" }]]);
      setBusy("");
      recompute();
      return;
    }
    const files = [...fileList].filter((f) => f.type === "text/csv" || /\.csv$/i.test(f.name));
    if (!files.length) return;
    setBusy(`Reading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    let done = 0;
    for (const f of files) {
      const key = `${f.name}:${f.size}`;
      if (state.statements.has(key)) {
        done++;
        continue;
      }
      try {
        const text = await f.text();
        if (text.includes("WORKER")) startWorker();
        await wait(text.includes("SLOW") ? 1500 : 30);
        if (text.startsWith("BAD")) throw new Error("not an example statement");
        state.statements.set(key, { id: f.name, text });
      } catch (e) {
        state.failed.push({ id: f.name, error: e.message });
      }
      setBusy(`Reading files… ${++done}/${files.length}`);
    }
    recompute();
    setBusy(null);
  }

  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (b) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  function zip(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const put = (view, fields) => fields.forEach(([o, v, s]) => (s === 4 ? view.setUint32(o, v, true) : view.setUint16(o, v, true)));
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = enc.encode(f.text);
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      put(local, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dosTime, 2], [12, dosDate, 2], [14, crc, 4],
        [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]);
      const cen = new DataView(new ArrayBuffer(46));
      put(cen, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dosTime, 2], [14, dosDate, 2], [16, crc, 4],
        [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]);
      chunks.push(local, name, data);
      central.push(cen, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, c) => s + c.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    put(end, [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4], [20, 0, 2]]);
    return new Blob([...chunks, ...central, end], { type: "application/zip" });
  }

  $("#cards").addEventListener("click", (e) => {
    const b = e.target.closest("button.dl");
    if (!b) return;
    const f = fileFor(b.dataset.account, b.dataset.kind);
    download(f.name, new Blob([f.text], { type: "text/csv" }));
  });
  $("#accounts").addEventListener("click", () => {
    const f = accountsFile();
    download(f.name, new Blob([f.text], { type: "text/csv" }));
  });
  $("#combined").addEventListener("click", () => {
    const files = withFiles().map((n) => fileFor(n, "transactions"));
    if (files.length === 1) return download(files[0].name, new Blob([files[0].text], { type: "text/csv" }));
    const { from, to } = range();
    return download(`example-combined-${from}_to_${to}.zip`, zip(files));
  });
  $("#zip").addEventListener("click", () => {
    const files = [accountsFile()];
    for (const b of document.querySelectorAll("#cards button.dl")) files.push(fileFor(b.dataset.account, b.dataset.kind));
    const { from, to } = range();
    download(`example-csv-${from}_to_${to}.zip`, zip(files));
  });
  $("#config-list").addEventListener("change", (e) => {
    const el = e.target.closest("[data-field]");
    const row = e.target.closest(".account-row");
    if (!el || !row) return;
    const c = { ...(state.config[row.dataset.id] || {}) };
    const field = el.dataset.field;
    if (field === "include") {
      if (el.checked) delete c.exclude;
      else c.exclude = true;
    } else if (el.value.trim()) c[field] = el.value.trim();
    else delete c[field];
    if (Object.keys(c).length) state.config[row.dataset.id] = c;
    else delete state.config[row.dataset.id];
    localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
    recompute();
  });
  $("#config-reset").addEventListener("click", () => {
    state.config = {};
    localStorage.setItem(CONFIG_KEY, "{}");
    recompute();
  });
  const drop = $("#drop");
  const picker = $("#picker");
  drop.addEventListener("click", () => picker.click());
  picker.addEventListener("change", () => {
    addFiles(picker.files);
    picker.value = "";
  });
  for (const ev of ["dragenter", "dragover"]) document.addEventListener(ev, (e) => e.preventDefault());
  for (const ev of ["dragleave", "drop"]) document.addEventListener(ev, (e) => e.preventDefault());
  document.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
  $("#mode").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b) setMode(b.dataset.mode);
  });
  $("#from").addEventListener("change", render);
  $("#to").addEventListener("change", render);
  $("#clear").addEventListener("click", () => {
    state.statements.clear();
    state.failed = [];
    recompute();
  });
  setMode(state.mode);
}

function examplePage({ single = false } = {}) {
  const picker = single
    ? '<input id="picker" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>'
    : '<input id="picker" type="file" accept="text/csv,.csv" multiple hidden>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'">
<title>Example converter</title>
<style>[hidden] { display: none !important; }</style>
</head>
<body>
<main>
  <h1>Example statement converter</h1>
  <div id="drop" role="button" tabindex="0"><strong>Drop files here</strong></div>
  ${picker}
  <p id="busy" hidden></p>
  <div id="status"></div>
  <p id="empty">No statements yet.</p>
  <section id="results" hidden>
    <div class="toolbar">
      <label>From <select id="from"></select></label>
      <label>To <select id="to"></select></label>
      <div class="field">
        <span id="mode-label">Mode</span>
        <div id="mode" role="radiogroup"><button role="radio" data-mode="balance">Balance only</button> <button role="radio" data-mode="tradelog">Trade log</button></div>
      </div>
      <button id="clear">Clear</button>
      <button id="accounts">Accounts CSV</button>
      <button id="combined">Combined CSV</button>
      <button id="zip">Download all (.zip)</button>
    </div>
    <details class="config"><summary>Accounts <span id="config-count"></span></summary><div id="config-list"></div><button id="config-reset">Reset to detected</button></details>
    <div id="cards"></div>
    <div id="diagnostics"></div>
  </section>
</main>
<script>
(${exampleApp.toString()})();
</script>
</body>
</html>
`;
}

const CHROME_READY = fs.existsSync(browserLib.chromePath());

test("browser, capture and page driver on a synthetic page", { skip: !CHROME_READY && "the pinned chrome-headless-shell is not installed" }, async (t) => {
  const dir = tmpDir("browser");
  const pageFile = path.join(dir, "index.html");
  const singleFile = path.join(dir, "single.html");
  fs.writeFileSync(pageFile, examplePage());
  fs.writeFileSync(singleFile, examplePage({ single: true }));
  const url = `file://${pageFile}`;
  const files = {};
  const statements = {
    "a.csv": "2026-01,100\n2026-02,250.5\n",
    "b.csv": "2026-02,10\n",
    "c.csv": "2026-03,5\n",
    "bad.csv": "BAD\n",
    "throw.csv": "2026-01,1\nTHROW\n",
    "violate.csv": "2026-01,1\nVIOLATE\n",
    "console.csv": "2026-01,2\nCONSOLE\n",
    "worker.csv": "2026-01,4\nWORKER SLOW\n",
    "ignored.txt": "2026-01,3\n",
    "x.xlsx": "not a workbook",
    "y.xlsx": "not a workbook either",
  };
  for (const [name, text] of Object.entries(statements)) {
    files[name] = path.join(dir, name);
    fs.writeFileSync(files[name], text);
  }
  const CONFIG_KEY = "example-csv-accounts";
  const MODE_KEY = "example-csv-mode";
  const browser = await browserLib.launch();
  // Storage that must carry over to the next document (a reload, a second tab) is tested on the
  // page served over http://127.0.0.1, as the one-origin storage test serves its pages. On
  // file:// pages the pinned Chrome now and then gives a document a storage area of its own:
  // its writes reach no other document and are gone after a reload, and waiting does not help
  // (docs/MIGRATION.md). The other subtests use one document and stay on file://.
  const server = await serve({ "/index.html": pageFile });
  const httpUrl = `${server.origin}/index.html`;
  let context = null;
  t.after(async () => {
    if (context) await context.close().catch(() => {});
    await browser.close();
    await server.close();
  });

  await t.test("launch asserts and reports the pinned versions", () => {
    assert.deepEqual(browserLib.versions(browser), { playwright: browserLib.EXPECTED.playwright, chrome: browserLib.EXPECTED.chrome });
  });

  await t.test("newContext fixes clock, locale and time zone, and seeds storage once per tab", async () => {
    const context = await browserLib.newContext(browser, browserLib.ENVS.E1, { [MODE_KEY]: "tradelog" });
    try {
      const d = await driverLib.open(context, httpUrl);
      assert.deepEqual(await d.page.evaluate(() => [new Date().toISOString(), Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language]),
        ["2026-01-02T03:04:06.000Z", Date.parse(browserLib.FIXED_TIME), "America/Los_Angeles", "sv-SE"]);
      assert.deepEqual((await d.snapshot()).modes.map((m) => [m.mode, m.on, m.ariaChecked]), [["balance", false, "false"], ["tradelog", true, "true"]]);
      await d.setMode("balance");
      assert.deepEqual(await d.storage([MODE_KEY, null]), { [MODE_KEY]: "balance" });
      await d.reload();
      assert.deepEqual(await d.storage([MODE_KEY]), { [MODE_KEY]: "balance" }, "a reload does not reseed");
      await d.close();
    } finally {
      await context.close();
    }
    await assert.rejects(browserLib.newContext(browser, { id: "E9" }, null), TypeError);
    await assert.rejects(browserLib.newContext(browser, browserLib.ENVS.E0, { k: 5 }), TypeError);
    const plain = await browser.newContext();
    try {
      await assert.rejects(driverLib.open(plain, url), /capture init script is not installed/);
      assert.equal(plain.pages().length, 0, "the page is closed again");
    } finally {
      await plain.close();
    }
  });

  await t.test("seed null leaves storage to the pages of one context", async () => {
    const context = await browserLib.newContext(browser, browserLib.ENVS.E0, null);
    try {
      const a = await driverLib.open(context, httpUrl);
      await a.setMode("tradelog");
      const b = await driverLib.open(context, httpUrl);
      assert.deepEqual(await b.storage([MODE_KEY]), { [MODE_KEY]: "tradelog" });
      assert.equal((await b.snapshot()).modes.find((m) => m.on).mode, "tradelog");
    } finally {
      await context.close();
    }
  });

  context = await browserLib.newContext(browser, browserLib.ENVS.E1, {});
  const d = await driverLib.open(context, url);

  await t.test("load through the picker and by drop, with name:size de-duplication", async () => {
    assert.deepEqual(await d.load([files["a.csv"], files["b.csv"]]), { busy: "idle" });
    assert.deepEqual(d.addOrder(), [files["a.csv"], files["b.csv"]]);
    assert.deepEqual(await d.load([files["b.csv"], files["a.csv"], files["ignored.txt"]], { via: "picker" }), { busy: "idle" });
    assert.deepEqual(d.addOrder(), [files["a.csv"], files["b.csv"]]);
    assert.deepEqual(await d.load([files["ignored.txt"], files["c.csv"]], { via: "drop" }), { busy: "idle" });
    assert.deepEqual(d.addOrder(), [files["a.csv"], files["b.csv"], files["c.csv"]]);
    await assert.rejects(d.load([files["a.csv"]], { via: "mail" }), TypeError);
    const s = await d.snapshot();
    assert.equal(s.busyHidden, true);
    assert.equal(s.resultsHidden, false);
    assert.equal(s.status, "<p>3 months</p>");
    assert.deepEqual([s.from.value, s.to.value], ["2026-01", "2026-02"], "a later batch keeps the selected range, as the pages do");
  });

  await t.test("probe reads months, mode visibility, configurator rows and cards", async () => {
    await d.setRange("2026-01", "2026-03");
    assert.deepEqual(await d.probe(), {
      months: ["2026-01", "2026-02", "2026-03"],
      modeVisible: true,
      portfolios: [
        { index: 0, id: "a", label: "a", autoKind: "Investment", currency: "SGD" },
        { index: 1, id: "b", label: "b", autoKind: "Cash-like", currency: "SGD" },
        { index: 2, id: "c", label: "c", autoKind: "Cash-like", currency: "SGD" },
      ],
      cards: ["a", "b", "c"],
    });
  });

  await t.test("clickAll captures every download in the fixed order, hashed and unzipped in the page", async () => {
    await d.setRange("2026-01", "2026-02");
    const records = await d.clickAll({ keepBytes: true });
    assert.deepEqual(records.map((r) => [r.trigger, r.account, r.card, r.kind, r.name, r.type]), [
      ["card", "a", "a", "transactions", "a - transactions - 2026-01_to_2026-02.csv", "text/csv"],
      ["card", "a", "a", "qif", "a - 2026-01_to_2026-02.qif", "text/csv"],
      ["card", "b", "b", "transactions", "b - transactions - 2026-01_to_2026-02.csv", "text/csv"],
      ["card", "b", "b", "qif", "b - 2026-01_to_2026-02.qif", "text/csv"],
      ["accounts", null, null, null, "Example accounts - 2026-01_to_2026-02.csv", "text/csv"],
      ["combined", null, null, null, "example-combined-2026-01_to_2026-02.zip", "application/zip"],
      ["zip", null, null, null, "example-csv-2026-01_to_2026-02.zip", "application/zip"],
    ]);
    for (const r of records) {
      assert.equal(r.sha256, sha256(r.bytes), r.name);
      assert.equal(r.size, r.bytes.length);
      if (r.type !== "application/zip") {
        assert.equal(r.entries, undefined);
        continue;
      }
      const entries = unzip(r.bytes);
      assert.deepEqual(r.entries, entries.map((e) => ({ name: e.name, size: e.size, crc32: e.crc32, sha256: e.sha256, dosTime: e.dosTime, dosDate: e.dosDate })));
      // The fixed instant 2026-01-02T03:04:06Z is 2026-01-01 19:04:06 in Los Angeles.
      for (const e of r.entries) assert.deepEqual([e.dosTime, e.dosDate], [(19 << 11) | (4 << 5) | 3, (46 << 9) | (1 << 5) | 1]);
    }
    assert.equal(records[4].bytes.toString("utf8"), "Name,Currency\na,SGD\nb,SGD\n");
    assert.equal(records[0].bytes.toString("utf8"), "date,amount\n2026-01-01,100.00\n2026-02-01,250.50\n");
    assert.deepEqual(records[6].entries.map((e) => e.name), [records[4], ...records.slice(0, 4)].map((r) => r.name));
    const plain = await d.clickAll();
    assert.deepEqual(plain, records.map(({ bytes, ...r }) => r));
    assert.equal(plain.some((r) => "bytes" in r), false);
    assert.deepEqual(Object.keys(plain[0]), ["trigger", "account", "card", "kind", "name", "type", "size", "sha256"]);
    assert.deepEqual(Object.keys(plain[6]), ["trigger", "account", "card", "kind", "name", "type", "size", "sha256", "entries"]);
    assert.deepEqual(await capture.take(d.page), [], "take() drains");
  });

  await t.test("pass-through downloads for real, with the same bytes and name", async () => {
    await d.page.evaluate(() => {
      window.__s2cPassThrough = true;
    });
    const [dl] = await Promise.all([d.page.waitForEvent("download"), d.page.evaluate(() => document.getElementById("accounts").click())]);
    const [rec] = await capture.take(d.page);
    await d.page.evaluate(() => {
      window.__s2cPassThrough = false;
    });
    assert.equal(dl.suggestedFilename(), rec.name);
    assert.equal(sha256(fs.readFileSync(await dl.path())), rec.sha256);
    assert.equal(rec.trigger, null, "a click outside clickAll has no trigger");
  });

  await t.test("a revoked download URL is forgotten, so an anchor to it records nothing", async () => {
    const got = await d.page.evaluate(() => {
      const url = URL.createObjectURL(new Blob(["x"], { type: "text/csv" }));
      URL.revokeObjectURL(url);
      Object.assign(document.createElement("a"), { href: url, download: "late.csv" }).click();
      return window.__s2c.pending;
    });
    assert.equal(got, 0);
    assert.deepEqual(await capture.take(d.page), []);
  });

  await t.test("snapshot and staticSnapshot normalise the markup", async () => {
    await d.setMode("tradelog");
    const s = await d.snapshot();
    assert.deepEqual(s.from, { options: [["2026-01", "jan. 2026"], ["2026-02", "feb. 2026"], ["2026-03", "mars 2026"]], value: "2026-01", disabled: false });
    assert.equal(s.to.value, "2026-02");
    assert.deepEqual(s.modes.map((m) => [m.mode, m.on]), [["balance", false], ["tradelog", true]]);
    assert.equal(s.modeFieldHidden, false);
    assert.equal(s.configCount, "3 detected");
    assert.deepEqual(s.toolbar, { accounts: { present: true, disabled: false }, combined: { present: true, disabled: false }, zip: { present: true, disabled: false } });
    assert.equal(s.diagnostics, "<details><summary>Skipped</summary><ul><li>none</li></ul></details>");
    for (const k of ["status", "cards", "diagnostics", "config"]) assert.ok(!/[\n\t]|> </.test(s[k]), k);
    assert.ok(s.cards.includes('data-kind="trades"'));
    const st = await d.staticSnapshot();
    assert.ok(st.startsWith("<main><h1>Example statement converter</h1>"));
    assert.ok(!st.includes("\n"));
    await d.setMode("balance");
    await assert.rejects(d.setRange("2025-12", "2026-01"), /has no option 2025-12/);
    await assert.rejects(d.setMode("holdings"), /no mode button holdings/);
  });

  await t.test("config ops drive the configurator and storage records them", async () => {
    const cfg = async () => JSON.parse((await d.storage([CONFIG_KEY]))[CONFIG_KEY]);
    await d.setRange("2026-01", "2026-03");
    await d.config({ rename: { index: 0, name: "  Renamed  " } });
    assert.deepEqual(await cfg(), { a: { name: "Renamed" } });
    assert.deepEqual((await d.probe()).cards, ["Renamed", "b", "c"]);
    await d.config({ kind: { index: 1, value: "investment" } });
    await d.config({ merge: { from: 2, into: 0 } });
    await d.config({ exclude: { index: 1 } });
    assert.deepEqual(await cfg(), { a: { name: "Renamed" }, b: { kind: "investment", exclude: true }, c: { mergeInto: "a" } });
    await assert.rejects(d.config({ exclude: { index: 1 } }), /already excluded/);
    await assert.rejects(d.config({ kind: { index: 0, value: "bank" } }), /no option bank/);
    await assert.rejects(d.config({ rename: { index: 9, name: "x" } }), /no configurator row 9/);
    await assert.rejects(d.config({ rename: { index: 0, name: "x" }, kind: { index: 0, value: "" } }), TypeError);
    await d.config({ exclude: { index: 0 } });
    assert.deepEqual(await d.clickAll(), [
      { trigger: "accounts", account: null, card: null, kind: null, disabled: true },
      { trigger: "combined", account: null, card: null, kind: null, disabled: true },
      { trigger: "zip", account: null, card: null, kind: null, disabled: true },
    ]);
    await d.config({ reset: true });
    assert.equal((await d.storage([CONFIG_KEY]))[CONFIG_KEY], "{}");
    assert.deepEqual((await d.probe()).cards, ["a", "b", "c"]);
  });

  await t.test("errors: read failures, CSP violations, console errors, uncaught errors", async () => {
    assert.deepEqual(await d.load([files["bad.csv"]]), { busy: "idle" });
    assert.ok((await d.snapshot()).status.includes('<p class="warn">bad.csv: not an example statement</p>'));
    assert.deepEqual(await d.load([files["violate.csv"], files["console.csv"]]), { busy: "idle" });
    let e = await d.errors();
    assert.deepEqual(e.violations, [{ directive: "img-src", blockedURI: "http://127.0.0.1:9/blocked.png" }]);
    assert.ok(e.console.includes("example console error"));
    assert.deepEqual(e.errors, []);
    await d.config({ rename: { index: 0, name: "THROW" } });
    e = await d.errors();
    assert.ok(e.errors.some((x) => x.startsWith("error: ") && x.includes("injected failure")), JSON.stringify(e.errors));
    assert.ok(e.errors.some((x) => x.startsWith("pageerror: ") && x.includes("injected failure")));
    await d.config({ reset: true });
  });

  await t.test("the pdf.js worker fallback is logged, with a stable blob id, but is not a stuck load", async () => {
    const errorsBefore = await d.page.evaluate(() => window.__s2c.errorCount);
    const t0 = Date.now();
    assert.deepEqual(await d.load([files["worker.csv"]]), { busy: "idle" });
    assert.ok(Date.now() - t0 >= 1500, "the load waited for the busy line to clear");
    const e = await d.errors();
    const fallback = e.errors.filter(capture.isPdfWorkerFallback);
    assert.equal(fallback.length, 1, JSON.stringify(e.errors));
    assert.match(fallback[0], /The script at 'blob:null\/<id>' failed to load\.$/);
    assert.deepEqual(await d.page.evaluate(() => [window.__s2c.workerFallbackCount, window.__s2c.errorCount]), [1, errorsBefore]);
  });

  await t.test("a parse that throws during a load settles as stuck after a quiet second", async () => {
    const t0 = Date.now();
    assert.deepEqual(await d.load([files["throw.csv"]]), { busy: "stuck" });
    const took = Date.now() - t0;
    assert.ok(took >= 1000 && took < 15000, `${took} ms`);
    const s = await d.snapshot();
    assert.deepEqual([s.busyHidden, s.busyText], [false, "Reading files… 1/1"]);
    assert.ok((await d.errors()).errors.some((x) => x === "unhandledrejection: TypeError: injected failure"));
  });

  await t.test("clear forgets the statements and clickAll then records nothing", async () => {
    await d.clear();
    assert.deepEqual(d.addOrder(), []);
    const s = await d.snapshot();
    assert.deepEqual([s.resultsHidden, s.emptyHidden, s.status], [true, false, ""]);
    assert.deepEqual(await d.clickAll(), []);
    await d.close();
  });

  await t.test("without crypto.subtle in the page, the bytes are hashed and unpacked in Node", async () => {
    const bare = await browser.newContext({ ...browserLib.CONTEXT_OPTIONS, locale: "en-US", timezoneId: "UTC" });
    try {
      await bare.addInitScript(() => {
        Object.defineProperty(Crypto.prototype, "subtle", { configurable: true, get: () => undefined });
      });
      await capture.install(bare);
      await bare.clock.setFixedTime(new Date(browserLib.FIXED_TIME));
      const p = await driverLib.open(bare, url);
      assert.equal(await p.page.evaluate(() => typeof crypto.subtle), "undefined");
      assert.deepEqual(await p.load([files["a.csv"], files["b.csv"]]), { busy: "idle" });
      const recs = await p.clickAll({ keepBytes: true });
      assert.equal(recs.length, 7);
      for (const r of recs) {
        assert.equal(r.sha256, sha256(r.bytes), r.name);
        if (r.type === "application/zip") {
          assert.deepEqual(r.entries, unzip(r.bytes).map((e) => ({ name: e.name, size: e.size, crc32: e.crc32, sha256: e.sha256, dosTime: e.dosTime, dosDate: e.dosDate })));
          for (const e of r.entries) assert.deepEqual([e.dosTime, e.dosDate], [(3 << 11) | (4 << 5) | 3, (46 << 9) | (1 << 5) | 2]);
        }
      }
      assert.deepEqual(Object.keys(await p.clickAll().then((x) => x[0])), ["trigger", "account", "card", "kind", "name", "type", "size", "sha256"]);
    } finally {
      await bare.close();
    }
  });

  await t.test("single-file pickers take one file per batch, the first accepted one", async () => {
    const one = await driverLib.open(context, `file://${singleFile}`);
    assert.deepEqual(await one.load([files["x.xlsx"]]), { busy: "idle" });
    assert.deepEqual(one.addOrder(), [files["x.xlsx"]]);
    assert.deepEqual(await one.load([files["ignored.txt"], files["y.xlsx"]], { via: "drop" }), { busy: "idle" });
    assert.deepEqual(one.addOrder(), [files["y.xlsx"]]);
    assert.deepEqual(await one.load([files["ignored.txt"]], { via: "drop" }), { busy: "idle" });
    assert.deepEqual(one.addOrder(), [files["ignored.txt"]]);
    assert.deepEqual((await one.probe()).cards, ["ignored"]);
    await assert.rejects(one.load([files["x.xlsx"], files["y.xlsx"]]), /single file/i);
    await one.close();
  });
});
