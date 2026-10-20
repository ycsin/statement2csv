// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// The one browser and the one client (docs/TESTING.md, determinism controls):
// chrome-headless-shell revision 1200 (Chrome 143.0.7499.4), driven by playwright-core 1.57.0
// from this repository's test/node_modules, never from anywhere else. Every page gets a fresh
// context with the fixed locale, time zone, viewport and clock, the capture init script and,
// when given, the scenario's storage seed.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const capture = require("./capture.js");

const TEST_DIR = path.resolve(__dirname, "..");
const EXPECTED = Object.freeze({ playwright: "1.57.0", chrome: "143.0.7499.4", headlessShellRevision: "1200" });
const FIXED_TIME = "2026-01-02T03:04:06Z";
const ENVS = Object.freeze({
  E0: Object.freeze({ id: "E0", locale: "en-US", timezoneId: "UTC" }),
  E1: Object.freeze({ id: "E1", locale: "sv-SE", timezoneId: "America/Los_Angeles" }),
  E2: Object.freeze({ id: "E2", locale: "en-SG", timezoneId: "Asia/Singapore" }),
});
const CONTEXT_OPTIONS = Object.freeze({
  viewport: Object.freeze({ width: 1100, height: 900 }),
  deviceScaleFactor: 1,
  colorScheme: "light",
  reducedMotion: "reduce",
  serviceWorkers: "block",
  acceptDownloads: true,
});
const SEED_GUARD = "__s2cSeeded";

function within(p, root) {
  const rel = path.relative(root, p);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

// playwright-core, resolved from test/node_modules and checked: the real path must lie inside
// it, the version must be the exact pin, and the pin in test/package.json and the headless
// shell listed in its browsers.json must be the ones expected here.
function loadPlaywright() {
  const entry = require.resolve("playwright-core", { paths: [TEST_DIR] });
  const real = fs.realpathSync(entry);
  const modules = fs.realpathSync(path.join(TEST_DIR, "node_modules"));
  if (!within(real, modules)) throw new Error(`playwright-core resolves outside test/node_modules (${real})`);
  const dir = path.dirname(real);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
  if (pkg.version !== EXPECTED.playwright) throw new Error(`playwright-core is ${pkg.version}, expected ${EXPECTED.playwright}`);
  const pin = JSON.parse(fs.readFileSync(path.join(TEST_DIR, "package.json"), "utf8")).devDependencies["playwright-core"];
  if (pin !== EXPECTED.playwright) throw new Error(`test/package.json pins playwright-core ${pin}; update test/lib/browser.js together with the pin`);
  const shell = JSON.parse(fs.readFileSync(path.join(dir, "browsers.json"), "utf8")).browsers.find((b) => b.name === "chromium-headless-shell");
  if (!shell || shell.revision !== EXPECTED.headlessShellRevision || shell.browserVersion !== EXPECTED.chrome) {
    throw new Error("playwright-core's browsers.json does not list the expected chromium-headless-shell");
  }
  return { playwright: require(real), version: pkg.version };
}

// $CHROME, else the revision-1200 headless shell under the home directory's
// .cache/ms-playwright (the same path locally and in CI).
function chromePath() {
  return process.env.CHROME || path.join(os.homedir(), ".cache", "ms-playwright", `chromium_headless_shell-${EXPECTED.headlessShellRevision}`,
    "chrome-headless-shell-linux64", "chrome-headless-shell");
}

const versionOf = new WeakMap();

// launch() -> Promise<Browser>, after asserting both versions. Chrome gets its own temporary
// directory (its shared-memory files land there instead of loose in the system one), removed
// when the browser closes.
async function launch() {
  const { playwright, version } = loadPlaywright();
  const executablePath = chromePath();
  if (!fs.existsSync(executablePath)) throw new Error(`Chrome not found at ${executablePath} (set CHROME, or install the headless shell)`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-chrome-"));
  const removeTmp = () => fs.rmSync(tmp, { recursive: true, force: true });
  let browser;
  try {
    browser = await playwright.chromium.launch({ executablePath, headless: true, env: { ...process.env, TMPDIR: tmp, TMP: tmp, TEMP: tmp } });
  } catch (e) {
    removeTmp();
    throw e;
  }
  browser.on("disconnected", removeTmp);
  const chrome = browser.version();
  if (chrome !== EXPECTED.chrome) {
    await browser.close().catch(() => {});
    throw new Error(`Chrome reports ${chrome}, expected ${EXPECTED.chrome}`);
  }
  versionOf.set(browser, version);
  return browser;
}

// versions(browser) -> {playwright, chrome}: written into every golden.
function versions(browser) {
  return { playwright: versionOf.get(browser) || loadPlaywright().version, chrome: browser.version() };
}

// Runs in the page (as an init script): seeds localStorage once per tab, so reloads within a
// scenario keep what the page wrote.
function seedStorage({ guard, entries }) {
  try {
    if (sessionStorage.getItem(guard)) return;
    sessionStorage.setItem(guard, "1");
    localStorage.clear();
    for (const [k, v] of entries) localStorage.setItem(k, v);
  } catch (e) {
    // about:blank and other opaque origins have no storage.
  }
}

// newContext(browser, env, seed) -> Promise<BrowserContext>. env = {id, locale, timezoneId}
// (see ENVS). seed = {[storageKey]: string}: localStorage is cleared and seeded with these raw
// strings once per tab ({} clears only). seed = null: storage is left alone (a fresh context
// starts empty), so pages opened one after another in the same context share what they write.
async function newContext(browser, env, seed) {
  if (!env || typeof env.locale !== "string" || typeof env.timezoneId !== "string") {
    throw new TypeError("newContext: env must be {id, locale, timezoneId}");
  }
  if (seed !== null && seed !== undefined) {
    if (typeof seed !== "object" || Array.isArray(seed)) throw new TypeError("newContext: seed must be an object or null");
    for (const [k, v] of Object.entries(seed)) {
      if (typeof v !== "string") throw new TypeError(`newContext: seed value for ${k} must be a string`);
    }
  }
  const context = await browser.newContext({ ...CONTEXT_OPTIONS, locale: env.locale, timezoneId: env.timezoneId });
  try {
    await capture.install(context);
    if (seed) await context.addInitScript(seedStorage, { guard: SEED_GUARD, entries: Object.entries(seed) });
    await context.clock.setFixedTime(new Date(FIXED_TIME));
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
  return context;
}

module.exports = { launch, versions, newContext, EXPECTED, ENVS, FIXED_TIME, CONTEXT_OPTIONS, chromePath };
