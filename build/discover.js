// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Provider discovery and validation (docs/ARCHITECTURE.md, discovery).
//
//   listProviders(root, {includeSkeletons}) -> [{id, folder, dir, skeleton}]
//     Folders of <root>/providers, in code-point order, that contain provider.js. Names
//     starting with "." are ignored; names starting with "_" (skeletons) only with
//     includeSkeletons.
//   discover(root, {includeSkeletons}) -> [{id, folder, dir, skeleton, raw, D, R, frozen, slots}]
//     Loads provider.js and frozen.js (fresh, and they may not require anything), runs
//     normalize and validate (C01-C07, uniqueness included), resolves the runtime object,
//     and parses and lints page.html (C16). Throws a DiscoverError listing every problem as
//     "providers/<folder>/<file>: <message>".
//   loadDataModule(file) -> module.exports of a data-only .js module.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { normalize, validate, resolveRuntime } = require("../core/contract/descriptor.js");
const { readPageHtml, hasConfigurator, toolbarOf } = require("./page.js");

class DiscoverError extends Error {
  constructor(errors) {
    super(`${errors.length} problem(s):\n${errors.join("\n")}`);
    this.errors = errors;
  }
}

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function listProviders(root, { includeSkeletons = false } = {}) {
  const base = path.join(path.resolve(root), "providers");
  let names;
  try {
    names = fs.readdirSync(base);
  } catch {
    return [];
  }
  const out = [];
  for (const folder of names.sort(byCodePoint)) {
    if (folder.startsWith(".")) continue;
    const skeleton = folder.startsWith("_");
    if (skeleton && !includeSkeletons) continue;
    const dir = path.join(base, folder);
    let isProvider = false;
    try {
      isProvider = fs.statSync(dir).isDirectory() && fs.statSync(path.join(dir, "provider.js")).isFile();
    } catch {
      isProvider = false;
    }
    if (isProvider) out.push({ id: folder.replace(/^_/, ""), folder, dir, skeleton });
  }
  return out;
}

// Evaluates a CommonJS data module in this realm (so its objects are ordinary objects) with
// a fresh module object and a require that refuses everything.
function loadDataModule(file) {
  const src = fs.readFileSync(file, "utf8");
  const fn = vm.compileFunction(src, ["module", "exports", "require", "__filename", "__dirname"], { filename: file });
  const module = { exports: {} };
  const refuse = (what) => {
    throw new Error(`${path.basename(file)} is data only and may not require anything (require(${JSON.stringify(what)}))`);
  };
  fn.call(module.exports, module, module.exports, refuse, file, path.dirname(file));
  return module.exports;
}

function discover(root, { includeSkeletons = false } = {}) {
  root = path.resolve(root);
  const errors = [];
  const found = [];
  for (const p of listProviders(root, { includeSkeletons })) {
    const where = `providers/${p.folder}`;
    let raw = null, frozen = null;
    try {
      raw = loadDataModule(path.join(p.dir, "provider.js"));
    } catch (e) {
      errors.push(`${where}/provider.js: cannot be loaded: ${e.message}`);
      continue;
    }
    if (fs.existsSync(path.join(p.dir, "frozen.js"))) {
      try {
        frozen = loadDataModule(path.join(p.dir, "frozen.js"));
      } catch (e) {
        errors.push(`${where}/frozen.js: cannot be loaded: ${e.message}`);
        continue;
      }
    }
    found.push({ ...p, raw, frozen });
  }
  const all = found.map((f) => f.raw);
  const out = [];
  for (const f of found) {
    const where = `providers/${f.folder}`;
    const errs = validate(f.raw, { frozen: f.frozen, all, dir: f.dir, skeleton: f.skeleton });
    errors.push(...errs.map((m) => `${where}/${m}`));
    if (errs.length) continue;
    const D = normalize(f.raw, f.frozen);
    const R = resolveRuntime(D);
    const page = readPageHtml(path.join(f.dir, "page.html"), {
      partialsDir: path.join(root, "core", "page", "partials"),
      configurator: hasConfigurator(D),
      toolbar: toolbarOf(D),
    });
    errors.push(...page.errors.map((m) => `${where}/page.html: [C16] ${m}`));
    if (page.errors.length) continue;
    out.push({ id: D.id, folder: f.folder, dir: f.dir, skeleton: f.skeleton, raw: f.raw, D, R, frozen: f.frozen, slots: page.slots });
  }
  if (errors.length) throw new DiscoverError(errors);
  return out;
}

module.exports = { discover, listProviders, loadDataModule, DiscoverError };
