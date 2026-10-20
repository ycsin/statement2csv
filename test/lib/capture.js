// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Download capture (docs/TESTING.md, capture method). INIT_SCRIPT is installed with
// addInitScript on every page, old and new alike, before any page script runs. It:
//   - wraps URL.createObjectURL to remember url -> Blob;
//   - defines HTMLAnchorElement.prototype.click, shadowing HTMLElement.prototype.click, so an
//     anchor with `download` and a known Blob URL is recorded as {name: a.download, blob}
//     instead of downloading (unless window.__s2cPassThrough is set, when it does both);
//   - logs `error`, `unhandledrejection` and `securitypolicyviolation`;
//   - offers window.__s2c.clickAll(), the fixed click order of the page driver, and
//     window.__s2c.take(), which hashes every recorded Blob with crypto.subtle and unpacks
//     every zip with the reader of unzip.js (its source is inlined below).
// The capture record (frozen): {trigger, account, card, kind, name, type, size, sha256,
// entries?} or {trigger, account, card, kind, disabled: true}; entries are
// [{name, size, crc32, sha256, dosTime, dosDate}] in central-directory order.
//
// A known benign error: on a file:// page (an opaque origin) pdf.js 3.11.174 first starts its
// worker through an importScripts wrapper, which fails ("NetworkError: Failed to execute
// 'importScripts' ..."); the failure reaches the page as a window error event (Playwright's
// pageerror and console do not see it), and pdf.js then reads on its main-thread fallback. It
// happens once per page instance on every PDF page, old and new alike. It is still logged (see
// isPdfWorkerFallback), but it does not count for the page driver's "stuck" rule, which is about
// a failed parse. Logged texts have blob: URL ids replaced by "<id>", so logs are reproducible.
"use strict";

const crypto = require("crypto");
const unzip = require("./unzip.js");

const { unzipEntries } = unzip;

// Runs in the page only (its source text is part of INIT_SCRIPT); never called in Node.
function installHooks(unzipEntriesInPage) {
  if (window.__s2c) return;
  const blobs = new Map();
  const records = [];
  const state = { ctx: null, errors: 0, workerFallbacks: 0, violations: 0, deliveries: 0 };
  const WORKER_FALLBACK = /^Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'blob:[^']+' failed to load\.$/;
  const report = (kind, data) => {
    try {
      const f = window.__s2cReport;
      if (typeof f === "function") {
        const p = f(kind, data);
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
    } catch (e) {
      // The binding is missing or the page is closing: the in-page counters still count.
    }
  };
  const describe = (v) => {
    try {
      return v && typeof v === "object" && "message" in v ? `${v.name || "Error"}: ${v.message}` : String(v);
    } catch (e) {
      return "(unprintable)";
    }
  };

  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = function (obj) {
    const url = createObjectURL.call(URL, obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  // The pages revoke each download URL after a second; forgetting it then keeps memory bounded
  // over a long run (a recorded Blob lives on in its record until take()).
  URL.revokeObjectURL = function (url) {
    blobs.delete(String(url));
    return revokeObjectURL.call(URL, url);
  };
  const nativeClick = HTMLElement.prototype.click;
  Object.defineProperty(HTMLAnchorElement.prototype, "click", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: function click() {
      const blob = this.hasAttribute("download") ? blobs.get(this.href) : undefined;
      if (blob) {
        records.push({ ctx: state.ctx, name: this.download, blob });
        if (!window.__s2cPassThrough) return undefined;
      }
      return nativeClick.call(this);
    },
  });

  window.addEventListener("error", (e) => {
    if (!(e instanceof ErrorEvent)) return;
    const message = e.message || describe(e.error);
    if (WORKER_FALLBACK.test(message)) state.workerFallbacks++;
    else state.errors++;
    report("error", message);
  });
  window.addEventListener("unhandledrejection", (e) => {
    state.errors++;
    report("unhandledrejection", describe(e.reason));
  });
  window.addEventListener("securitypolicyviolation", (e) => {
    state.violations++;
    report("violation", { directive: e.effectiveDirective || e.violatedDirective, blockedURI: e.blockedURI });
  }, true);
  // Deliveries: the picker's change event and a drop on the document. These capture-phase
  // listeners run before the page's own, so once the count has moved the page's handlers
  // have run too (the driver reads it from a later task).
  window.addEventListener("change", (e) => {
    if (e.target && e.target.id === "picker") state.deliveries++;
  }, true);
  window.addEventListener("drop", () => {
    state.deliveries++;
  }, true);

  const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
  const base64 = (bytes) => {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const subtle = typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : null;
  const sha256 = async (bytes) => hex(await subtle.digest("SHA-256", bytes));
  const ctxFields = (c) => ({
    trigger: c && c.trigger != null ? c.trigger : null,
    account: c && c.account != null ? c.account : null,
    card: c && c.card != null ? c.card : null,
    kind: c && c.kind != null ? c.kind : null,
  });

  const api = {
    // The driver's click order, inside the page: every #cards button.dl in DOM order, then
    // #accounts, #combined and #zip when present. Nothing when #results is hidden. A disabled
    // control is recorded, not clicked. Returns the number of controls visited.
    clickAll() {
      const results = document.getElementById("results");
      if (!results || results.hidden) return 0;
      let visited = 0;
      const visit = (el, ctx) => {
        visited++;
        if (el.disabled) {
          records.push({ ctx, disabled: true });
          return;
        }
        state.ctx = ctx;
        try {
          el.click();
        } finally {
          state.ctx = null;
        }
      };
      for (const b of document.querySelectorAll("#cards button.dl")) {
        const card = b.closest(".card");
        const h3 = card ? card.querySelector("h3") : null;
        visit(b, { trigger: "card", account: b.getAttribute("data-account"), card: h3 ? h3.textContent : null, kind: b.getAttribute("data-kind") });
      }
      for (const id of ["accounts", "combined", "zip"]) {
        const el = document.getElementById(id);
        if (el) visit(el, { trigger: id, account: null, card: null, kind: null });
      }
      return visited;
    },
    // Drains the records: hashes each Blob, unpacks zips. Bytes come back (base64) only on
    // request, or when crypto.subtle is missing so that Node must hash them.
    async take(opts) {
      const keepBytes = !!(opts && opts.keepBytes);
      const list = records.splice(0, records.length);
      const out = [];
      for (const r of list) {
        const base = ctxFields(r.ctx);
        if (r.disabled) {
          out.push({ ...base, disabled: true });
          continue;
        }
        const bytes = new Uint8Array(await r.blob.arrayBuffer());
        const rec = { ...base, name: r.name, type: r.blob.type, size: r.blob.size, sha256: subtle ? await sha256(bytes) : null };
        const isZip = r.blob.type === "application/zip"
          || (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04);
        if (isZip && subtle) {
          try {
            const entries = unzipEntriesInPage(bytes);
            rec.entries = [];
            for (const e of entries) {
              rec.entries.push({ name: e.name, size: e.size, crc32: e.crc32, sha256: await sha256(e.data), dosTime: e.dosTime, dosDate: e.dosDate });
            }
            const bad = entries.filter((e) => !e.crcOk).map((e) => e.name);
            if (bad.length) rec.zipError = `CRC mismatch in ${bad.length} entr${bad.length > 1 ? "ies" : "y"}`;
          } catch (e) {
            rec.zipError = describe(e);
          }
        }
        if (isZip) rec.isZip = true;
        if (keepBytes || !subtle) rec.bytes = base64(bytes);
        out.push(rec);
      }
      return out;
    },
    setContext(ctx) {
      state.ctx = ctx || null;
    },
    // Errors and unhandled rejections, not counting the pdf.js worker fallback.
    get errorCount() {
      return state.errors;
    },
    get workerFallbackCount() {
      return state.workerFallbacks;
    },
    get violationCount() {
      return state.violations;
    },
    get deliveries() {
      return state.deliveries;
    },
    get pending() {
      return records.length;
    },
  };
  Object.defineProperty(window, "__s2c", { value: Object.freeze(api), configurable: false, enumerable: false, writable: false });
}

const INIT_SCRIPT = `(() => {
"use strict";
const unzipEntries = ${unzipEntries.toString()};
(${installHooks.toString()})(unzipEntries);
})();
`;

const BINDING = "__s2cReport";
const logs = new WeakMap(); // Page -> {console, errors, violations}
const attached = new WeakSet();
const installed = new WeakSet();

// blob: URLs carry a random id; logs keep "<id>" instead, so two runs log the same text.
const BLOB_ID = /\b(blob:[^\s'"/]*(?:\/\/[^\s'"/]*)?\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const tidy = (s) => String(s).replace(BLOB_ID, "$1<id>");

// True for the logged text of the pdf.js worker fallback described above (an `errors` entry).
const PDF_WORKER_FALLBACK = /^error: Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'blob:[^']+' failed to load\.$/;
function isPdfWorkerFallback(text) {
  return PDF_WORKER_FALLBACK.test(String(text));
}

function logOf(page) {
  let l = logs.get(page);
  if (!l) {
    l = { console: [], errors: [], violations: [] };
    logs.set(page, l);
  }
  return l;
}

// attach(page): Node-side listeners for Playwright's console errors and page errors.
// Idempotent; install() calls it for every page of the context.
function attach(page) {
  if (attached.has(page)) return;
  attached.add(page);
  const l = logOf(page);
  page.on("console", (m) => {
    if (m.type() === "error") l.console.push(tidy(m.text()));
  });
  page.on("pageerror", (e) => l.errors.push(`pageerror: ${tidy(e)}`));
}

// install(context): the init script, the reporting binding for in-page errors and CSP
// violations (it survives reloads, unlike in-page state), and the page listeners.
async function install(context) {
  if (installed.has(context)) return;
  installed.add(context);
  await context.exposeBinding(BINDING, (source, kind, data) => {
    if (!source || !source.page) return;
    const l = logOf(source.page);
    if (kind === "violation") {
      l.violations.push({ directive: String(data && data.directive), blockedURI: tidy(data && data.blockedURI) });
    } else if (kind === "error" || kind === "unhandledrejection") {
      l.errors.push(`${kind}: ${tidy(data)}`);
    }
  });
  await context.addInitScript({ content: INIT_SCRIPT });
  context.on("page", attach);
  for (const p of context.pages()) attach(p);
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// take(page, {keepBytes}) -> Promise<CaptureRecord[]>: drains the page's records. With
// keepBytes each download record also gets `bytes` (a Buffer).
async function take(page, { keepBytes = false } = {}) {
  const raw = await page.evaluate((opts) => window.__s2c.take(opts), { keepBytes });
  return raw.map((r) => {
    if (r.disabled) return { trigger: r.trigger, account: r.account, card: r.card, kind: r.kind, disabled: true };
    const bytes = r.bytes != null ? Buffer.from(r.bytes, "base64") : null;
    const rec = { trigger: r.trigger, account: r.account, card: r.card, kind: r.kind, name: r.name, type: r.type, size: r.size, sha256: r.sha256 };
    if (rec.sha256 == null) {
      // crypto.subtle was missing in the page: hash and unpack here, with the same reader.
      rec.sha256 = sha256(bytes);
      if (r.isZip) {
        try {
          const entries = unzip(bytes);
          rec.entries = entries.map((e) => ({ name: e.name, size: e.size, crc32: e.crc32, sha256: e.sha256, dosTime: e.dosTime, dosDate: e.dosDate }));
          const bad = entries.filter((e) => !e.crcOk).length;
          if (bad) rec.zipError = `CRC mismatch in ${bad} entr${bad > 1 ? "ies" : "y"}`;
        } catch (e) {
          rec.zipError = String(e && e.message ? e.message : e);
        }
      }
    } else if (r.entries) {
      rec.entries = r.entries;
    }
    if (r.zipError && !rec.zipError) rec.zipError = r.zipError;
    if (keepBytes) rec.bytes = bytes;
    return rec;
  });
}

// clickAll(page, {keepBytes}) -> Promise<CaptureRecord[]>: the fixed click order (in the
// page), then take().
async function clickAll(page, opts) {
  await page.evaluate(() => window.__s2c.clickAll());
  return take(page, opts);
}

// pageErrors(page) -> Promise<{console, errors, violations}>, cumulative since the page
// opened (reloads included). A round trip to the page first lets pending reports arrive.
async function pageErrors(page) {
  try {
    await page.evaluate(() => 0);
  } catch (e) {
    // A closed page has nothing pending.
  }
  const l = logOf(page);
  return { console: l.console.slice(), errors: l.errors.slice(), violations: l.violations.map((v) => ({ ...v })) };
}

module.exports = { INIT_SCRIPT, take, pageErrors, install, attach, clickAll, isPdfWorkerFallback, BINDING };
