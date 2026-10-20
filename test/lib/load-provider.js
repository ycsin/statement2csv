// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Loads a provider for the Node-side tests (docs/TESTING.md, test library API).
//
//   discover({root, includeSkeletons}) -> [{id, dir}]   folders with provider.js
//   frozenProviders({root}) -> [{id, dir, frozen}]       folders with frozen.js (with or
//                                                         without provider.js)
//   loadNode(id, {root, parser: "new" | "old", oldRoot, runtime}) -> ProviderHandle
//     The Node branch: requires exactly the parserScript (new) or the old repository's
//     src/parser.js (old), and composes P = Object.assign({}, core StatementExport, parser).
//     With parser "old", D is null and R is the frozen runtime built from frozen.js alone
//     ({id, app, storage, naming, modes: [{id}], ui: {kindModel}}), so it works before any
//     provider.js exists. The app type is "statement" iff frozen.js has kindModel.
//     runtime: "frozen" (with parser "new" only) takes the provider's parser.js with that
//     frozen runtime and D null: replay's early signal before provider.js exists.
//   loadPage(id, {root}) -> ProviderHandle
//     The page branch (contract check C10b): runs exactly the plan pieces 3-12 of the build
//     (no vendor, no app) one at a time in a vm context where self = window = the context
//     and there is no module. self[parserGlobal] must be undefined before the parserScript
//     piece and defined right after it; loadPage throws otherwise.
//
// ProviderHandle = {id, dir, app, D, R, frozen, parser, P, test, modes,
//   parse(statements, {config, mode}), downloads(result, {mode, from, to, config}),
//   expectedHeader(download, {mode, result}), reconcile(result, {mode, config})}.
// Hook contexts are ctx = {P, R, mode, config, from, to}, with from/to swapped so that
// from <= to, as the page's range() returns them. downloads() is [] for a null result and
// for a custom app's {error} result, without calling the hook.
//
// Nothing here names a provider.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const REPO = path.resolve(__dirname, "..", "..");

const lazy = (root, rel) => require(path.join(root, rel));
const build = (rel) => require(path.join(REPO, "build", rel));
const contract = (rel) => require(path.join(REPO, "core", "contract", rel));

function defaultOldRoot() {
  return process.env.S2C_OLD_ROOT || os.homedir();
}

function discover({ root = REPO, includeSkeletons = false } = {}) {
  return build("discover.js").listProviders(root, { includeSkeletons }).map(({ id, dir }) => ({ id, dir }));
}

function providerDir(root, id) {
  for (const folder of [id, `_${id}`]) {
    const dir = path.join(path.resolve(root), "providers", folder);
    if (fs.existsSync(path.join(dir, "provider.js")) || fs.existsSync(path.join(dir, "frozen.js"))) return dir;
  }
  throw new Error(`no provider folder for ${JSON.stringify(id)} under providers/`);
}

function frozenProviders({ root = REPO } = {}) {
  const { loadDataModule } = build("discover.js");
  const base = path.join(path.resolve(root), "providers");
  let names = [];
  try {
    names = fs.readdirSync(base);
  } catch {
    names = [];
  }
  const out = [];
  for (const folder of names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (folder.startsWith(".")) continue;
    const file = path.join(base, folder, "frozen.js");
    if (!fs.existsSync(file)) continue;
    out.push({ id: folder.replace(/^_/, ""), dir: path.join(base, folder), frozen: loadDataModule(file) });
  }
  return out;
}

function readDescriptor(dir) {
  const { loadDataModule } = build("discover.js");
  const file = path.join(dir, "provider.js");
  if (!fs.existsSync(file)) throw new Error(`${path.relative(REPO, dir) || dir}: no provider.js (use parser: "old" before provider.js exists)`);
  return loadDataModule(file);
}

function readFrozen(dir) {
  const { loadDataModule } = build("discover.js");
  const file = path.join(dir, "frozen.js");
  return fs.existsSync(file) ? loadDataModule(file) : null;
}

function requireFresh(file) {
  const resolved = require.resolve(file);
  delete require.cache[resolved];
  return require(resolved);
}

function frozenRuntime(id, frozen) {
  const app = frozen.kindModel !== undefined ? "statement" : "custom";
  const R = {
    id,
    app,
    storage: { ...frozen.storage },
    naming: { ...frozen.naming },
    modes: frozen.modeValues.map((m) => ({ id: m })),
  };
  if (app === "statement") R.ui = { kindModel: frozen.kindModel };
  return R;
}

const swap = (from, to) => (from && to && from > to ? [to, from] : [from, to]);

// The handle around a composed namespace; `files` builds the statement-app downloads hook.
function makeHandle({ id, dir, app, D, R, frozen, parser, P, test, files }) {
  const modes = R.modes.map((m) => m.id);
  const ctxOf = (o = {}) => {
    const [from, to] = swap(o.from === undefined ? null : o.from, o.to === undefined ? null : o.to);
    return { P, R, mode: o.mode === undefined ? modes[0] : o.mode, config: o.config === undefined ? null : o.config, from, to };
  };
  const kindModel = R.ui ? R.ui.kindModel : "standard";
  const handle = {
    id, dir, app, D, R, frozen, parser, P, test, modes,
    parse(statements, { config = {}, mode } = {}) {
      if (app === "statement") return P.parseStatements(statements, config);
      return test.parse(statements, ctxOf({ config, mode }));
    },
    downloads(result, opts = {}) {
      if (result === null || result === undefined) return [];
      if (app !== "statement" && typeof result === "object" && "error" in result) return [];
      const ctx = ctxOf(opts);
      if (app !== "statement") return test.downloads(result, ctx);
      return files().create({
        P,
        result: () => result,
        mode: () => ctx.mode,
        range: () => ({ from: ctx.from, to: ctx.to }),
        naming: R.naming,
        kindModel,
      }).downloads();
    },
    expectedHeader(download, opts = {}) {
      const ctx = ctxOf(opts);
      if (app !== "statement") return test && typeof test.expectedHeader === "function" ? test.expectedHeader(download, ctx) : null;
      return contract("headers.js").expectedHeader(P, { ...download, mode: ctx.mode, result: opts.result, kindModel });
    },
    reconcile(result, opts = {}) {
      const ctx = ctxOf(opts);
      if (app !== "statement") return test.reconcile(result, ctx);
      const out = require(path.join(__dirname, "reconcile.js")).reconcileStatement(handle, result, { mode: ctx.mode });
      if (test && typeof test.reconcile === "function") out.push(...test.reconcile(result, ctx));
      return out;
    },
  };
  return handle;
}

function loadNode(id, { root = REPO, parser = "new", oldRoot = defaultOldRoot(), runtime = null } = {}) {
  root = path.resolve(root);
  const dir = providerDir(root, id);
  const frozen = readFrozen(dir);
  const testFile = path.join(dir, "test.js");
  const test = fs.existsSync(testFile) ? requireFresh(testFile) : null;
  const coreExport = lazy(root, "core/export.js");
  let D = null, R, app, parserExports;
  if (runtime !== null && !(runtime === "frozen" && parser === "new")) throw new Error(`runtime "frozen" goes with parser "new" only, not ${JSON.stringify({ parser, runtime })}`);
  if (parser === "old") {
    if (!frozen || !frozen.legacyRepo) throw new Error(`${id}: parser "old" needs frozen.js with legacyRepo`);
    R = frozenRuntime(id, frozen);
    app = R.app;
    parserExports = requireFresh(path.join(oldRoot, frozen.legacyRepo, "src", "parser.js"));
  } else if (parser === "new" && runtime === "frozen") {
    // The provider's parser.js (the default parserScript) with the frozen runtime: an early
    // signal for replay --parser new before provider.js exists, never a gate (docs/MIGRATION.md).
    if (!frozen || !frozen.legacyRepo) throw new Error(`${id}: runtime "frozen" needs frozen.js with legacyRepo`);
    R = frozenRuntime(id, frozen);
    app = R.app;
    parserExports = requireFresh(path.join(dir, "parser.js"));
  } else if (parser === "new") {
    const { normalize, resolveRuntime } = contract("descriptor.js");
    D = normalize(readDescriptor(dir), frozen);
    R = resolveRuntime(D);
    app = D.app;
    parserExports = requireFresh(path.join(dir, D.parserScript));
  } else {
    throw new Error(`parser must be "new" or "old", not ${JSON.stringify(parser)}`);
  }
  if (app === "statement" && typeof (parserExports && parserExports.parseStatements) !== "function") {
    throw new Error(`${id}: the parser exports no parseStatements()`);
  }
  if (app !== "statement") {
    for (const h of ["parse", "downloads", "reconcile"]) {
      if (!test || typeof test[h] !== "function") throw new Error(`${id}: a custom app needs test.js exporting ${h}()`);
    }
  }
  const P = Object.assign({}, coreExport, parserExports);
  return makeHandle({ id, dir, app, D, R, frozen, parser: parserExports, P, test, files: () => lazy(root, "core/files.js") });
}

function loadPage(id, { root = REPO } = {}) {
  root = path.resolve(root);
  const dir = providerDir(root, id);
  const { normalize, resolveRuntime } = contract("descriptor.js");
  const { planScripts, readPiece } = build("scripts.js");
  const frozen = readFrozen(dir);
  const D = normalize(readDescriptor(dir), frozen);
  const R = resolveRuntime(D);
  const context = vm.createContext({});
  context.self = context;
  context.window = context;
  const plan = planScripts(D, dir, { root }).filter((p) => p.kind === "exec" && !p.inject && Number(p.n) >= 3 && Number(p.n) <= 12);
  for (const piece of plan) {
    const before = context[D.parserGlobal];
    if (piece.parser && before !== undefined) throw new Error(`${id}: self.${D.parserGlobal} is already defined before ${piece.label}`);
    try {
      vm.runInContext(readPiece(piece), context, { filename: piece.label });
    } catch (e) {
      throw new Error(`${id}: ${piece.label} throws while it is evaluated: ${e && e.message}`);
    }
    if (piece.parser && context[D.parserGlobal] === undefined) {
      throw new Error(`${id}: ${piece.label} does not define self.${D.parserGlobal} (check parserGlobal, parserScript, uses and scripts against its UMD line)`);
    }
  }
  const parser = context[D.parserGlobal];
  if (parser === undefined) throw new Error(`${id}: self.${D.parserGlobal} is not defined after the provider scripts`);
  const testFile = path.join(dir, "test.js");
  const test = fs.existsSync(testFile) ? requireFresh(testFile) : null;
  const P = Object.assign({}, context.StatementExport, parser);
  return makeHandle({ id, dir, app: D.app, D, R, frozen, parser, P, test, files: () => context.StatementFiles });
}

module.exports = { discover, frozenProviders, loadNode, loadPage, frozenRuntime };
