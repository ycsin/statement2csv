// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Page driver (docs/TESTING.md): drives an old or a new page through the same fixed element
// ids, so the golden harness, the generic harness, the smoke tests and the storage test all
// act on pages the same way. Every action happens inside the page (JavaScript clicks and
// events), so hidden controls work too. Settle rules:
//   - after a file batch: poll every 50 ms until #busy is hidden; "stuck" when an error or an
//     unhandled rejection was logged since the action and the busy text has not changed for
//     1 s, or after the 180 s backstop; then two animation frames;
//   - after a synchronous action (mode, range, configurator, Clear): one animation frame.
// The page must have been opened in a context prepared by browser.newContext (capture
// installed). Nothing here names a provider: the configurator selectors come from `legacyDom`
// or are the standard ids.
"use strict";

const fs = require("fs");
const path = require("path");
const capture = require("./capture.js");

const POLL_MS = 50;
const STUCK_QUIET_MS = 1000;
const BACKSTOP_MS = 180000;
const DELIVERY_TIMEOUT_MS = 30000;
const STANDARD_DOM = Object.freeze({ list: "#config-list", row: ".account-row", count: "#config-count", reset: "#config-reset" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Waits for n animation frames in the page.
function frames(page, n) {
  return page.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const step = () => (--left > 0 ? requestAnimationFrame(step) : resolve());
    requestAnimationFrame(step);
  }), n);
}

// HTML whitespace runs (ASCII only) collapsed to one space, "> <" folded to "><".
function normalise(html) {
  return html == null ? null : html.replace(/[\t\n\f\r ]+/g, " ").replace(/> </g, "><").trim();
}

// The page's picker filter, from its accept attribute: a file passes when its extension or
// the MIME type Chrome gives it (by extension) is listed. Single-file pickers (no `multiple`)
// take the first accepted file of a batch, else its first file, and replace what was loaded.
const MIME = { ".pdf": "application/pdf", ".csv": "text/csv", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".txt": "text/plain" };
function acceptsFile(accept, file) {
  const tokens = String(accept || "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const ext = path.extname(file).toLowerCase();
  return tokens.some((t) => (t.startsWith(".") ? t === ext : t === MIME[ext]));
}

async function open(context, url, { legacyDom = null } = {}) {
  const dom = { ...STANDARD_DOM, ...(legacyDom || {}) };
  const page = await context.newPage();
  capture.attach(page);
  let picker = { accept: "", multiple: true };
  let order = [];
  let keys = new Set();

  const resetOrder = () => {
    order = [];
    keys = new Set();
  };
  const readPicker = async () => {
    picker = await page.evaluate(() => {
      const p = document.getElementById("picker");
      return p ? { accept: p.getAttribute("accept") || "", multiple: p.multiple } : { accept: "", multiple: true };
    });
  };
  const track = (paths) => {
    if (!picker.multiple) {
      const chosen = paths.find((p) => acceptsFile(picker.accept, p)) || paths[0];
      order = [chosen];
      keys = new Set();
      return;
    }
    for (const p of paths) {
      if (!acceptsFile(picker.accept, p)) continue;
      const key = `${path.basename(p)}:${fs.statSync(p).size}`;
      if (keys.has(key)) continue;
      keys.add(key);
      order.push(p);
    }
  };
  const counters = () => page.evaluate(() => ({ errors: window.__s2c.errorCount, deliveries: window.__s2c.deliveries }));

  const settle = async (errorsBefore) => {
    const start = Date.now();
    let lastText = null;
    let lastChange = start;
    for (;;) {
      const s = await page.evaluate(() => {
        const b = document.getElementById("busy");
        return { hidden: !b || b.hidden, text: b ? b.textContent : "", errors: window.__s2c.errorCount };
      });
      const now = Date.now();
      if (s.hidden) {
        await frames(page, 2);
        return { busy: "idle" };
      }
      if (s.text !== lastText) {
        lastText = s.text;
        lastChange = now;
      }
      if ((s.errors > errorsBefore && now - lastChange >= STUCK_QUIET_MS) || now - start >= BACKSTOP_MS) {
        await frames(page, 2);
        return { busy: "stuck" };
      }
      await sleep(POLL_MS);
    }
  };

  const dropFiles = async (abs) => {
    const helper = await page.evaluateHandle(() => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.hidden = true;
      for (const t of ["input", "change"]) input.addEventListener(t, (e) => e.stopImmediatePropagation());
      document.documentElement.appendChild(input);
      return input;
    });
    try {
      await helper.setInputFiles(abs);
      await helper.evaluate((input) => {
        const dt = new DataTransfer();
        for (const f of input.files) dt.items.add(f);
        input.remove();
        for (const type of ["dragenter", "dragover", "drop"]) {
          document.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
        }
      });
    } finally {
      await helper.evaluate((input) => input.remove()).catch(() => {});
      await helper.dispose().catch(() => {});
    }
  };

  const driver = {
    page,

    // One batch in the given order, through the picker or a synthetic drop, then settle.
    async load(paths, { via = "picker" } = {}) {
      if (!Array.isArray(paths) || !paths.length) throw new TypeError("load: paths must be a non-empty array");
      const abs = paths.map((p) => path.resolve(p));
      const before = await counters();
      if (via === "picker") await page.setInputFiles("#picker", abs);
      else if (via === "drop") await dropFiles(abs);
      else throw new TypeError(`load: via must be "picker" or "drop", got ${via}`);
      const deadline = Date.now() + DELIVERY_TIMEOUT_MS;
      while ((await counters()).deliveries <= before.deliveries) {
        if (Date.now() > deadline) throw new Error(`load: the page did not receive the batch (${via})`);
        await sleep(10);
      }
      track(abs);
      return settle(before.errors);
    },

    async clear() {
      await page.evaluate(() => {
        const b = document.getElementById("clear");
        if (!b) throw new Error("no #clear");
        b.click();
      });
      resetOrder();
      await frames(page, 1);
    },

    // Sets #from, then #to, firing input and change only for a value that changes.
    async setRange(from, to) {
      await page.evaluate(([f, t]) => {
        for (const [id, v] of [["from", f], ["to", t]]) {
          const s = document.getElementById(id);
          if (!s) throw new Error(`no #${id}`);
          if (![...s.options].some((o) => o.value === v)) throw new Error(`#${id} has no option ${v}`);
          if (s.value === v) continue;
          s.value = v;
          s.dispatchEvent(new Event("input", { bubbles: true }));
          s.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }, [from, to]);
      await frames(page, 1);
    },

    // A JavaScript click on button[data-mode=id], which works even when the switch is hidden.
    async setMode(id) {
      await page.evaluate((mode) => {
        const b = [...document.querySelectorAll("#mode button[data-mode]")].find((x) => x.dataset.mode === mode);
        if (!b) throw new Error(`no mode button ${mode}`);
        b.click();
      }, id);
      await frames(page, 1);
    },

    // op: {rename: {index, name}} | {kind: {index, value}} | {exclude: {index}} |
    //     {merge: {from, into}} | {reset: true}. Indexes count configurator rows in order.
    async config(op) {
      if (!op || typeof op !== "object" || Object.keys(op).length !== 1) throw new TypeError("config: op must have exactly one key");
      await page.evaluate(({ op: o, dom: d }) => {
        const rows = () => [...document.querySelectorAll(`${d.list} ${d.row}[data-id]`)];
        const row = (i) => {
          const r = rows()[i];
          if (!r) throw new Error(`no configurator row ${i}`);
          return r;
        };
        const field = (r, f) => {
          const el = r.querySelector(`[data-field="${f}"]`);
          if (!el) throw new Error(`configurator row has no ${f} field`);
          return el;
        };
        const fire = (el) => {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const choose = (el, v) => {
          if (![...el.options].some((x) => x.value === v)) throw new Error(`no option ${v}`);
          el.value = v;
          fire(el);
        };
        if (o.rename) {
          const el = field(row(o.rename.index), "name");
          el.value = o.rename.name;
          fire(el);
        } else if (o.kind) {
          choose(field(row(o.kind.index), "kind"), o.kind.value);
        } else if (o.exclude) {
          const el = field(row(o.exclude.index), "include");
          if (!el.checked) throw new Error(`configurator row ${o.exclude.index} is already excluded`);
          el.click();
        } else if (o.merge) {
          const target = row(o.merge.into).getAttribute("data-id");
          choose(field(row(o.merge.from), "mergeInto"), target);
        } else if (o.reset) {
          const b = document.querySelector(d.reset);
          if (!b) throw new Error(`no ${d.reset}`);
          b.click();
        } else {
          throw new Error(`unknown config op ${Object.keys(o)[0]}`);
        }
      }, { op, dom });
      await frames(page, 1);
    },

    // What the scenario generator needs from one load of the old page.
    async probe() {
      return page.evaluate((d) => {
        const from = document.getElementById("from");
        const mode = document.getElementById("mode");
        const rows = [...document.querySelectorAll(`${d.list} ${d.row}[data-id]`)];
        return {
          months: from ? [...from.options].map((o) => o.value) : [],
          modeVisible: !!mode && mode.getClientRects().length > 0,
          portfolios: rows.map((r, index) => {
            const strong = r.querySelector(".p-head strong") || r.querySelector("strong");
            const auto = r.querySelector('select[data-field="kind"] option');
            const m = auto ? /^Auto \((.*)\)$/.exec(auto.textContent) : null;
            const muted = r.querySelector(".p-head .muted");
            const segs = muted ? muted.textContent.split(" · ") : [];
            const last = segs.length ? segs[segs.length - 1] : "";
            return {
              index,
              id: r.getAttribute("data-id"),
              label: strong ? strong.textContent : "",
              autoKind: m ? m[1] : null,
              currency: segs.length > 1 && !last.includes(" – ") ? last : null,
            };
          }),
          cards: [...document.querySelectorAll("#cards .card h3")].map((h) => h.textContent),
        };
      }, dom);
    },

    clickAll(opts) {
      return capture.clickAll(page, opts);
    },

    storage(keys) {
      return page.evaluate((ks) => {
        const out = {};
        for (const k of ks) out[k] = localStorage.getItem(k);
        return out;
      }, keys.filter((k) => k != null));
    },

    // The UI snapshot of a state (docs/TESTING.md, comparison step 4).
    async snapshot() {
      const raw = await page.evaluate((d) => {
        const $ = (s) => document.querySelector(s);
        const inner = (s) => {
          const el = $(s);
          return el ? el.innerHTML : null;
        };
        const select = (id) => {
          const s = document.getElementById(id);
          return s ? { options: [...s.options].map((o) => [o.value, o.textContent]), value: s.value, disabled: s.disabled } : null;
        };
        const hidden = (id) => {
          const el = document.getElementById(id);
          return el ? el.hidden : null;
        };
        const button = (id) => {
          const el = document.getElementById(id);
          return { present: !!el, disabled: el ? el.disabled : null };
        };
        const mode = $("#mode");
        const field = mode ? mode.closest(".field") : null;
        const count = $(d.count);
        const busy = document.getElementById("busy");
        return {
          status: inner("#status"),
          cards: inner("#cards"),
          diagnostics: inner("#diagnostics"),
          config: inner(d.list),
          configCount: count ? count.textContent : null,
          from: select("from"),
          to: select("to"),
          modes: [...document.querySelectorAll("#mode button[data-mode]")].map((b) => ({
            mode: b.dataset.mode,
            on: b.classList.contains("on"),
            ariaChecked: b.getAttribute("aria-checked"),
          })),
          modeFieldHidden: field ? field.hidden : null,
          emptyHidden: hidden("empty"),
          resultsHidden: hidden("results"),
          busyHidden: hidden("busy"),
          busyText: busy ? busy.textContent : null,
          toolbar: { accounts: button("accounts"), combined: button("combined"), zip: button("zip") },
        };
      }, dom);
      for (const k of ["status", "cards", "diagnostics", "config"]) raw[k] = normalise(raw[k]);
      return raw;
    },

    // The normalised outerHTML of <main>, taken in the empty state.
    async staticSnapshot() {
      return normalise(await page.evaluate(() => {
        const m = document.querySelector("main");
        return m ? m.outerHTML : null;
      }));
    },

    // The statement paths in the page's effective add order (after name:size de-duplication
    // and Clear). A file the page failed to read is listed too; replay has no statement for it.
    addOrder() {
      return order.slice();
    },

    errors() {
      return capture.pageErrors(page);
    },

    // Reload the page (storage stays); the page forgets its statements. On a file:// page the
    // pinned Chrome now and then gives a document a storage area of its own, so what one
    // document wrote can be missing in the next one (after a reload, or in a second tab):
    // checks that need storage to carry across documents serve the page over http with
    // test/lib/serve.js (docs/MIGRATION.md). Waiting does not help.
    async reload() {
      await page.reload({ waitUntil: "load" });
      resetOrder();
      await readPicker();
      await frames(page, 1);
    },

    close() {
      return page.close();
    },
  };

  try {
    await page.goto(url, { waitUntil: "load" });
    if (!(await page.evaluate(() => typeof window.__s2c === "object" && window.__s2c !== null))) {
      throw new Error("open: the capture init script is not installed in this context (create it with browser.newContext)");
    }
    await readPicker();
    await frames(page, 1);
  } catch (e) {
    await page.close().catch(() => {});
    throw e;
  }
  return driver;
}

module.exports = { open, normalise, STANDARD_DOM, acceptsFile };
