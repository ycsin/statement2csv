// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The script plan of a page (docs/ARCHITECTURE.md, script plan): which pieces are inlined,
// in which order, each as its own <script>.
//
//   planScripts(D, dir, {inject, root}) -> [{n, kind: "exec" | "text", label, path | code, id?}]
//     D is the normalized descriptor (the runtime object lacks scripts, uses and appScript);
//     piece 11 is built from resolveRuntime(D). n is the piece number ("1".."13", "12b").
//   readPiece(piece) -> the piece's text, guarded.
//   guard(text, label) -> text, or throws on "</script" (any case), "<!--", CR or NUL.
//   runtimeScript(R) -> 'self.StatementProvider = {...};' (every "<", U+2028, U+2029 escaped).
//   scriptTag(piece, text) -> '<script>…</script>' or the text/plain worker element.
"use strict";

const fs = require("fs");
const path = require("path");
const { resolveRuntime } = require("../core/contract/descriptor.js");

const REPO = path.resolve(__dirname, "..");

function guard(text, label) {
  if (/<\/script/i.test(text)) throw new Error(`${label}: contains "</script", which would end the inline <script>`);
  if (text.includes("<!--")) throw new Error(`${label}: contains "<!--", which changes how an inline <script> is parsed`);
  if (text.includes("\r")) throw new Error(`${label}: contains a carriage return (keep LF line endings, so the CSP hashes stay stable)`);
  if (text.includes("\0")) throw new Error(`${label}: contains a NUL character`);
  return text;
}

// The runtime object as one statement. JSON.stringify keeps the contract key order of
// resolveRuntime; "<" and the two JavaScript line terminators are escaped, so the JSON can
// never contain "</script" or "<!--".
function runtimeScript(R) {
  const json = JSON.stringify(R)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `self.StatementProvider = ${json};`;
}

function planScripts(D, dir, { inject = null, root = REPO } = {}) {
  if (!D || !Array.isArray(D.scripts) || !Array.isArray(D.inputs)) {
    throw new Error("planScripts needs the normalized descriptor (with inputs and scripts)");
  }
  const R = resolveRuntime(D);
  dir = path.resolve(dir);
  root = path.resolve(root);
  const rel = (abs) => path.relative(root, abs).split(path.sep).join("/");
  const plan = [];
  const file = (n, p, kind = "exec", extra = {}) => {
    const abs = path.isAbsolute(p) ? p : path.join(root, p);
    plan.push({ n, kind, label: rel(abs), path: abs, ...extra });
  };
  const has = (x) => D.inputs.includes(x);
  const uses = (x) => Array.isArray(D.uses) && D.uses.includes(x);
  if (has("pdf")) {
    file("1", "vendor/pdf.min.js");
    file("2", "vendor/pdf.worker.min.js", "text", { id: "pdf-worker-src" });
  }
  for (const m of ["escape", "shell", "zip", "storage"]) file("3", `core/${m}.js`);
  if (has("csv")) file("4", "core/readers/csv.js");
  if (has("xlsx")) {
    file("5", "core/xlsx.js");
    file("5", "core/readers/xlsx.js");
  }
  if (has("pdf")) file("6", "core/readers/pdf.js");
  if (uses("layout")) file("7", "core/layout.js");
  file("8", "core/export.js");
  if (uses("assemble")) file("9", "core/assemble.js");
  if (D.app !== "custom") file("10", "core/files.js");
  plan.push({ n: "11", kind: "exec", label: "self.StatementProvider", code: runtimeScript(R) });
  for (const s of D.scripts) file("12", path.join(dir, s), "exec", s === D.parserScript ? { parser: true } : {});
  if (inject) file("12b", path.resolve(inject), "exec", { inject: true });
  if (D.app === "custom") file("13", path.join(dir, D.appScript));
  else file("13", "core/app/statement-app.js");
  return plan;
}

function readPiece(piece) {
  if (piece.code !== undefined) return guard(piece.code, piece.label);
  let bytes;
  try {
    bytes = fs.readFileSync(piece.path);
  } catch (e) {
    throw new Error(`${piece.label}: cannot be read (${e.code || e.message})`);
  }
  const text = bytes.toString("utf8");
  // readFileSync(p, "utf8") would silently replace invalid bytes; the page must hold the file as is.
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error(`${piece.label}: is not valid UTF-8`);
  if (text.charCodeAt(0) === 0xfeff) throw new Error(`${piece.label}: starts with a byte order mark`);
  return guard(text, piece.label);
}

function scriptTag(piece, text) {
  return piece.kind === "text" ? `<script type="text/plain" id="${piece.id}">${text}</script>` : `<script>${text}</script>`;
}

module.exports = { planScripts, readPiece, guard, runtimeScript, scriptTag, REPO };
