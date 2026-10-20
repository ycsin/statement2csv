// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Browser extraction (docs/TESTING.md, browser extraction and Node replay): statement files
// become the statement objects a page hands to parseStatements (docs/CONTRACT.md, input
// statement objects), read by the production readers in the pinned Chrome.
//
//   extract(paths, {handle, readers = "chrome", cacheDir, browser, offline, allowed, inputs,
//           pageTransform}) -> Promise<{statements, failed: [{id, error}], byPath, skipped, cache}>
//     One statement object per accepted file, in path order, without the page's name:size
//     de-duplication. A file that no declared reader accepts is skipped silently, as the pages
//     ignore it; a reader failure is listed in `failed` and gives no statement, as on the pages.
//     Extras: byPath (Map: path -> its statement, the first one for a repeated path), skipped
//     (the paths no reader accepts), cache ({hits, misses}: Chrome reads).
//     - The declared inputs and the page transform come from the handle (readingOf): the
//       descriptor with the new parser, the old page itself with the old one. `inputs` and
//       `pageTransform` override them (pageTransform names a function of handle.P).
//     - readers "chrome" (the default, and always for PDFs): the extraction page, built from
//       test/pages/extract.template.html with build/page.js. "node": the Node twins (readNode),
//       uncached: CSV as new Blob([bytes]).text(), refusing a file that starts with a UTF-16
//       byte order mark (Chrome decodes it as UTF-16); XLSX as core/xlsx.js with
//       inflateRawNode, zlib held to Chrome's DecompressionStream: a stream that is damaged,
//       cut short or followed by more bytes fails as in Chrome, with TypeError "Failed to
//       fetch" (Chrome's reader reads the stream through Response, which reports any stream
//       error so). test/unit/readers.test.js compares the twins with Chrome.
//     - Errors name a file by its position and sha256 prefix ("file 3 of 12 (sha256 …)"),
//       never by name: callers print them, and statement file names can be private.
//     - Chrome results are cached in <cacheDir>/cache/<page key>/<sha256 of the bytes>.<kind>.canon
//       (test/lib/canon.js text, the statement or the reader's error message). The page key is
//       the sha256 of the built page (reader sources, vendor pdf.js, extraction script) and the
//       Chrome version, so any change to them reads again. offline: true never starts Chrome and
//       throws on a cache miss (the replay children). `browser` reuses a launched browser.
//     - The page transform runs in Node on the cached items, as handle.P[name](items) per page.
//   readingOf(handle, {oldRoot}) -> {inputs, pageTransform, source}
//   legacyReading(frozen, {oldRoot}) -> {inputs, pageTransform}: from the old page's sources:
//     the inputs from its picker's accept attribute (src/index.template.html), the transform
//     from the page push of its readStatement (src/app.js): pages.push(P.<name>(...)) or none.
//   buildPage({root}) -> {html, key}; writePage(cacheDir, built) -> the page's path
//   kindFor(inputs, name) -> "csv" | "xlsx" | "pdf" | null: the page's reader for a file name
//   readNode(kind, name, bytes) -> Promise<statement>: the Node twin of the csv or xlsx reader;
//     a reader failure rejects with the page's message, a file the twin cannot read as Chrome
//     does rejects with a TwinRefusal (extract then fails as a whole)
//   inflateRawNode(bytes) -> Uint8Array: raw inflate with Chrome's DecompressionStream rules
//
// Files are read by path and never copied; the cache lives in <private-dir> (0700/0600). The
// console is never written to. Nothing here names a provider.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { pathToFileURL } = require("url");

const REPO = path.resolve(__dirname, "..", "..");
const priv = require("./private.js");
const canon = require("./canon.js");
const browserLib = require("./browser.js");
const capture = require("./capture.js");

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ORDER = ["csv", "xlsx", "pdf"];
// The MIME type Chrome gives a picked file, by extension (for the reader prediction; the page
// reports the reader it actually used, and a difference is an error).
const MIME_BY_EXT = { ".pdf": "application/pdf", ".csv": "text/csv", ".xlsx": XLSX_MIME, ".txt": "text/plain" };
const CHUNK = 4; // files per page.evaluate
const PIECES = [
  { path: "vendor/pdf.min.js", kind: "exec" },
  { path: "vendor/pdf.worker.min.js", kind: "text", id: "pdf-worker-src" },
  { path: "core/escape.js", kind: "exec" },
  { path: "core/shell.js", kind: "exec" },
  { path: "core/readers/csv.js", kind: "exec" },
  { path: "core/xlsx.js", kind: "exec" },
  { path: "core/readers/xlsx.js", kind: "exec" },
  { path: "core/readers/pdf.js", kind: "exec" },
];

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const fromRoot = (root, rel) => require(path.join(root, rel));

// ---------------------------------------------------------------- reading facts

// accept token -> declared input, from the build's own accept strings.
function acceptTokens() {
  const { ACCEPT } = require(path.join(REPO, "build", "page.js"));
  const map = new Map();
  for (const [input, accept] of Object.entries(ACCEPT)) for (const t of accept.split(",")) map.set(t.trim().toLowerCase(), input);
  return map;
}

function inputsOfAccept(accept) {
  const tokens = acceptTokens();
  const out = [];
  for (const raw of String(accept).split(",")) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    const input = tokens.get(t);
    if (!input) throw new Error(`unknown accept token ${JSON.stringify(t)}`);
    if (!out.includes(input)) out.push(input);
  }
  if (!out.length) throw new Error("the picker accepts no declared input");
  return out;
}

const PUSH_TRANSFORM = /pages\.push\(P\.([A-Za-z_$][\w$]*)\(content\.items\.map\(/;
const PUSH_PLAIN = /pages\.push\(\(content\.items\.map\(/;

function legacyReading(frozen, { oldRoot } = {}) {
  if (!frozen || !frozen.legacyRepo) throw new TypeError("legacyReading needs a frozen.js object with legacyRepo");
  const src = (f) => path.join(priv.oldRoot(oldRoot), frozen.legacyRepo, "src", f);
  const template = fs.readFileSync(src("index.template.html"), "utf8");
  const pickers = template.match(/<input\b[^>]*\bid="picker"[^>]*>/g) || [];
  if (pickers.length !== 1) throw new Error(`${frozen.legacyRepo}: expected one #picker in the old template, found ${pickers.length}`);
  const accept = /\baccept="([^"]*)"/.exec(pickers[0]);
  const inputs = inputsOfAccept(accept ? accept[1] : "");
  let pageTransform = null;
  if (inputs.includes("pdf")) {
    const app = fs.readFileSync(src("app.js"), "utf8");
    const pushes = (app.match(/pages\.push\(/g) || []).length;
    const t = PUSH_TRANSFORM.exec(app);
    if (pushes !== 1 || !(t || PUSH_PLAIN.test(app))) {
      throw new Error(`${frozen.legacyRepo}: cannot tell how the old reader builds its pages (${pushes} page pushes in src/app.js)`);
    }
    pageTransform = t ? t[1] : null;
  }
  return { inputs, pageTransform };
}

function readingOf(handle, { oldRoot } = {}) {
  if (!handle || typeof handle !== "object") throw new TypeError("readingOf needs a ProviderHandle");
  if (handle.D) {
    const R = handle.R || {};
    const inputs = Array.isArray(R.inputs) ? R.inputs : handle.D.inputs;
    const pdf = R.pdf || handle.D.pdf || {};
    return { inputs: inputs.slice(), pageTransform: pdf.pageTransform || null, source: "descriptor" };
  }
  if (handle.frozen && handle.frozen.legacyRepo) return { ...legacyReading(handle.frozen, { oldRoot }), source: "old page" };
  throw new Error(`${handle.id}: no descriptor and no legacyRepo, so the declared inputs are unknown`);
}

let nodeReaders = null;
function readersOf() {
  if (!nodeReaders) {
    nodeReaders = {
      csv: require(path.join(REPO, "core", "readers", "csv.js")),
      xlsx: require(path.join(REPO, "core", "readers", "xlsx.js")),
      pdf: require(path.join(REPO, "core", "readers", "pdf.js")),
    };
  }
  return nodeReaders;
}

// The reader the page picks for a file name: csv, xlsx, pdf in that order among the declared
// inputs, the first whose accepts() is true; null when none does.
function kindFor(inputs, name) {
  const R = readersOf();
  const f = { name, type: MIME_BY_EXT[path.extname(name).toLowerCase()] || "" };
  return ORDER.filter((k) => inputs.includes(k)).find((k) => R[k].accepts(f)) || null;
}

// ---------------------------------------------------------------- the extraction page

function buildPage({ root = REPO } = {}) {
  root = path.resolve(root);
  const { readPiece, scriptTag, guard } = require(path.join(root, "build", "scripts.js"));
  const { fill } = require(path.join(root, "build", "page.js"));
  const { policy } = require(path.join(root, "build", "csp.js"));
  const tags = PIECES.map((p) => {
    const piece = { ...p, label: p.path, path: path.join(root, p.path) };
    return scriptTag(piece, readPiece(piece));
  });
  const canonText = fs.readFileSync(path.join(__dirname, "canon.js"), "utf8");
  const serializer = guard(`self.__s2cCanon = (function () {\n  const module = { exports: {} };\n${canonText}\n  return module.exports;\n})();`, "test/lib/canon.js");
  tags.push(`<script>${serializer}</script>`);
  const template = fs.readFileSync(path.join(root, "test", "pages", "extract.template.html"), "utf8");
  // The policy the PDF pages have before M10. Reading does not depend on the policy mode, as long
  // as blob: scripts may run (pdf.js's fallback worker on file://).
  const html = fill(template, { csp: policy([], { pdf: true, mode: "legacy" }), scripts: tags.join("\n") });
  const key = sha256(`${html}\nchrome ${browserLib.EXPECTED.chrome}\n`);
  return { html, key };
}

// A private file written whole or not at all (parallel runs read the same cache).
function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  priv.writePrivate(tmp, data);
  fs.renameSync(tmp, file);
}

function writePage(cacheDir, built) {
  const file = path.join(cacheDir, "page.html");
  let current = null;
  try {
    current = fs.readFileSync(file, "utf8");
  } catch {
    current = null;
  }
  if (current !== built.html) writeAtomic(file, built.html);
  return file;
}

const entryFile = (cacheDir, key, sha, kind) => path.join(cacheDir, "cache", key.slice(0, 16), `${sha}.${kind}.canon`);

// Reads the queued files in Chrome on the extraction page, CHUNK files per evaluate, and
// returns their entries in queue order: {kind, text} or {kind, error}.
async function readInChrome(queue, { browser, pageFile, inputs }) {
  const own = !browser;
  const b = browser || (await browserLib.launch());
  const out = [];
  try {
    const context = await browserLib.newContext(b, browserLib.ENVS.E0, {});
    try {
      const tab = await context.newPage();
      capture.attach(tab);
      await tab.goto(pathToFileURL(pageFile).href, { waitUntil: "load" });
      if (!(await tab.evaluate(() => typeof self.__s2cExtract === "object" && self.__s2cExtract !== null))) {
        throw new Error("the extraction page did not load its script");
      }
      for (let i = 0; i < queue.length; i += CHUNK) {
        const chunk = queue.slice(i, i + CHUNK);
        await tab.setInputFiles("#picker", chunk.map((q) => q.path));
        const got = await tab.evaluate((list) => self.__s2cExtract.read(list), inputs);
        if (!Array.isArray(got) || got.length !== chunk.length) throw new Error(`the extraction page returned ${Array.isArray(got) ? got.length : "no"} entries for ${chunk.length} files`);
        chunk.forEach((q, k) => {
          const g = got[k];
          if (g.name !== q.name || g.size !== q.size) throw new Error(`the extraction page read another file than the one given (entry ${i + k})`);
          if (g.kind !== q.kind) throw new Error(`the page chose the ${g.kind} reader where ${q.kind} was predicted (entry ${i + k})`);
          out.push(g.error !== undefined ? { kind: g.kind, error: g.error } : { kind: g.kind, text: g.text });
        });
      }
      const errors = await capture.pageErrors(tab);
      if (errors.violations.length) throw new Error(`the extraction page had ${errors.violations.length} CSP violations`);
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    if (own) await b.close().catch(() => {});
  }
  return out;
}

// ---------------------------------------------------------------- the Node twins

// A file the Node twin cannot read the way Chrome does. extract() fails as a whole on one,
// rather than give a statement the page would not have.
class TwinRefusal extends Error {}
TwinRefusal.prototype.name = "TwinRefusal";

// The production XLSX reader inflates with DecompressionStream("deflate-raw") and reads the
// stream through new Response(stream).arrayBuffer(). In the pinned Chrome every stream error
// rejects that read with TypeError "Failed to fetch": damaged data, a stream that ends early
// (or is empty), and bytes after the end of the deflate stream ("junk", which zlib alone
// ignores). So the twin succeeds only when zlib ends the stream exactly at the end of the
// entry's data, and fails with Chrome's error otherwise.
const CHROME_STREAM_ERROR = "Failed to fetch";
function inflateRawNode(data) {
  let r = null;
  try {
    r = zlib.inflateRawSync(data, { info: true });
  } catch {
    r = null;
  }
  if (!r || r.engine.bytesWritten !== data.length) throw new TypeError(CHROME_STREAM_ERROR);
  return new Uint8Array(r.buffer);
}

const startsUtf16 = (b) => b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff));

async function readNode(kind, name, bytes) {
  if (kind === "csv") {
    if (startsUtf16(bytes)) {
      throw new TwinRefusal("starts with a UTF-16 byte order mark, which Chrome's file.text() decodes as UTF-16 and the Node twin does not; read it with readers: \"chrome\"");
    }
    return { id: name, csv: await new Blob([bytes]).text() };
  }
  if (kind === "xlsx") {
    const Xlsx = require(path.join(REPO, "core", "xlsx.js"));
    return { id: name, workbook: await Xlsx.read(new Uint8Array(bytes), async (d) => inflateRawNode(d)) };
  }
  throw new TypeError(`readNode: the ${kind} reader has no Node twin`);
}

// ---------------------------------------------------------------- extract

// The statement of a cached or Node-read entry under its file name, with the page transform.
function finish(entry, name, transform) {
  if (entry.error !== undefined) return { error: entry.error };
  const s = entry.statement;
  const statement = { ...s, id: name };
  if (transform && entry.kind === "pdf") statement.pages = s.pages.map((items) => transform(items));
  return { statement };
}

async function extract(paths, opts = {}) {
  const { handle = null, readers = "chrome", browser = null, offline = false, allowed = [], root = REPO } = opts;
  if (!Array.isArray(paths) || !paths.every((p) => typeof p === "string" && p)) throw new TypeError("extract: paths must be an array of file paths");
  if (readers !== "chrome" && readers !== "node") throw new TypeError(`extract: readers must be "chrome" or "node", not ${JSON.stringify(readers)}`);
  const reading = opts.inputs ? { inputs: opts.inputs.slice(), pageTransform: opts.pageTransform || null } : readingOf(handle, { oldRoot: opts.oldRoot });
  let transform = null;
  if (reading.pageTransform) {
    const P = handle && handle.P;
    if (!P || typeof P[reading.pageTransform] !== "function") throw new Error(`extract: the page transform ${reading.pageTransform} is not a function of the composed namespace`);
    transform = (items) => P[reading.pageTransform](items);
  }
  const cacheDir = path.resolve(opts.cacheDir || priv.privateDir("extract"));
  priv.assertSafeOutput(cacheDir);
  const built = buildPage({ root });
  const files = paths.map((p) => {
    const abs = path.resolve(p);
    priv.assertSafeInput(abs, { allowed });
    const bytes = fs.readFileSync(abs);
    const name = path.basename(abs);
    return { path: abs, name, size: bytes.length, sha: sha256(bytes), bytes, kind: kindFor(reading.inputs, name) };
  });
  const entries = new Array(files.length).fill(null);
  const queue = [];
  const queued = new Map(); // cache file -> queue index (a repeated file is read once)
  let hits = 0;
  // A file in an error message: its position and sha256 prefix, never its name.
  const fileRef = (i) => `file ${i + 1} of ${files.length} (sha256 ${files[i].sha.slice(0, 16)})`;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    if (!f.kind) continue;
    if (readers === "node" && f.kind !== "pdf") {
      try {
        entries[i] = { kind: f.kind, statement: await readNode(f.kind, f.name, f.bytes) };
      } catch (e) {
        if (e instanceof TwinRefusal) throw new Error(`extract: ${fileRef(i)} ${e.message}`);
        entries[i] = { kind: f.kind, error: e && e.message ? e.message : String(e) };
      }
      continue;
    }
    const file = entryFile(cacheDir, built.key, f.sha, f.kind);
    if (fs.existsSync(file)) {
      priv.assertSafeInput(file, { allowed: [cacheDir] });
      entries[i] = canon.parse(fs.readFileSync(file, "utf8"));
      hits++;
      continue;
    }
    if (offline) throw new Error(`extract: ${fileRef(i)} is not in the extraction cache (run the extract command first)`);
    if (!queued.has(file)) {
      queued.set(file, queue.length);
      queue.push({ ...f, file });
    }
  }
  if (queue.length) {
    const pageFile = writePage(cacheDir, built);
    const got = await readInChrome(queue, { browser, pageFile, inputs: reading.inputs });
    got.forEach((g, k) => {
      const q = queue[k];
      const entry = g.error !== undefined ? { kind: g.kind, error: g.error } : { kind: g.kind, statement: canon.parse(g.text) };
      writeAtomic(q.file, canon(entry));
    });
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (entries[i] || !f.kind) continue;
      const file = entryFile(cacheDir, built.key, f.sha, f.kind);
      entries[i] = canon.parse(fs.readFileSync(file, "utf8"));
    }
  }
  const statements = [];
  const failed = [];
  const skipped = [];
  const byPath = new Map();
  files.forEach((f, i) => {
    if (!f.kind) {
      skipped.push(f.path);
      return;
    }
    const r = finish(entries[i], f.name, transform);
    if (r.error !== undefined) {
      failed.push({ id: f.name, error: r.error });
      return;
    }
    statements.push(r.statement);
    if (!byPath.has(f.path)) byPath.set(f.path, r.statement);
  });
  return { statements, failed, byPath, skipped, cache: { hits, misses: queue.length, key: built.key.slice(0, 16) } };
}

module.exports = { extract, readingOf, legacyReading, buildPage, writePage, kindFor, inputsOfAccept, readNode, inflateRawNode, TwinRefusal, PIECES };
