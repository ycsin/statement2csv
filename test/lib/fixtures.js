// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Synthetic fixture specs (docs/TESTING.md). A spec is a CommonJS module carrying the marker
// string, one entry per file in one of three forms:
//   {name, pages: [[{x, y, text, size?}, ...], ...]}  rendered by minipdf.js
//   {name, text: "..."}                                written as UTF-8
//   {name, sheets: {<sheet>: [[cell, ...], ...]}}      rendered by mkxlsx.js
// plus an optional expectErrors list of file names. loadSpec validates it strictly;
// renderFixtures writes the files, in spec order, to a directory outside the guarded places.
"use strict";

const fs = require("fs");
const path = require("path");
const { renderPdf } = require("./minipdf.js");
const { renderXlsx } = require("./mkxlsx.js");
const { assertSafeOutput } = require("./private.js");

const MARKER = "SYNTHETIC TEST DATA";
const SPEC_FILE = "statements.js";
const SPEC_KEYS = new Set(["marker", "files", "expectErrors"]);
const FILE_KEYS = new Set(["name", "pages", "text", "sheets"]);
const BODY_KEYS = ["pages", "text", "sheets"];

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function safeName(name) {
  return typeof name === "string" && name !== "" && name !== "." && name !== ".."
    && !/[/\\\u0000]/.test(name) && name === name.trim();
}

// Throws on any problem; returns a normalised copy {marker, files, expectErrors}.
function validateSpec(spec, where = "fixture spec") {
  const bad = (msg) => new Error(`${where}: ${msg}`);
  if (!isPlainObject(spec)) throw bad("module.exports must be an object");
  for (const k of Object.keys(spec)) if (!SPEC_KEYS.has(k)) throw bad(`unknown key "${k}"`);
  if (spec.marker !== MARKER) throw bad(`marker must be "${MARKER}"`);
  if (!Array.isArray(spec.files) || !spec.files.length) throw bad("files must be a non-empty array");
  const seen = new Set();
  const files = spec.files.map((f, i) => {
    if (!isPlainObject(f)) throw bad(`files[${i}] must be an object`);
    for (const k of Object.keys(f)) if (!FILE_KEYS.has(k)) throw bad(`files[${i}] has unknown key "${k}"`);
    if (!safeName(f.name)) throw bad(`files[${i}].name must be a plain file name`);
    const folded = f.name.toLowerCase();
    if (seen.has(folded)) throw bad(`file name ${f.name} appears twice (names must differ even ignoring case)`);
    seen.add(folded);
    const bodies = BODY_KEYS.filter((k) => f[k] !== undefined);
    if (bodies.length !== 1) throw bad(`files[${i}] (${f.name}) needs exactly one of pages, text or sheets`);
    if (f.text !== undefined && typeof f.text !== "string") throw bad(`files[${i}].text must be a string`);
    if (f.pages !== undefined && !(Array.isArray(f.pages) && f.pages.length && f.pages.every(Array.isArray))) {
      throw bad(`files[${i}].pages must be a non-empty array of pages`);
    }
    if (f.sheets !== undefined && !isPlainObject(f.sheets)) throw bad(`files[${i}].sheets must be an object`);
    return { ...f };
  });
  const expectErrors = spec.expectErrors === undefined ? [] : spec.expectErrors;
  if (!Array.isArray(expectErrors) || !expectErrors.every((n) => typeof n === "string")) throw bad("expectErrors must be an array of file names");
  for (const n of expectErrors) if (!files.some((f) => f.name === n)) throw bad(`expectErrors names ${n}, which is not in files`);
  return { marker: MARKER, files, expectErrors: expectErrors.slice() };
}

// loadSpec(dir) -> spec: <dir>/statements.js, or the .js file `dir` names (e.g. hostile.js).
function loadSpec(dir) {
  const abs = path.resolve(dir);
  const file = abs.endsWith(".js") ? abs : path.join(abs, SPEC_FILE);
  const text = fs.readFileSync(file, "utf8");
  if (!text.includes(MARKER)) throw new Error(`${file}: does not contain "${MARKER}"`);
  delete require.cache[require.resolve(file)];
  return validateSpec(require(file), file);
}

// renderFixtures(spec, outDir) -> absolute paths, in spec order.
function renderFixtures(spec, outDir) {
  const s = validateSpec(spec);
  const out = path.resolve(outDir);
  assertSafeOutput(out);
  fs.mkdirSync(out, { recursive: true });
  return s.files.map((f) => {
    const p = path.join(out, f.name);
    const bytes = f.pages ? renderPdf(f.pages) : f.sheets ? renderXlsx(f.sheets) : Buffer.from(f.text, "utf8");
    fs.writeFileSync(p, bytes);
    return p;
  });
}

module.exports = { loadSpec, renderFixtures, validateSpec, MARKER };
