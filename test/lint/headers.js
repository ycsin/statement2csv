// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Lint: the two SPDX lines at the top of every source file (contract check C17; design §1,
// docs/TESTING.md).
//
//   check(root, {files}) -> [{file, line, col, rule, message}]
//   headerProblem(rel, text) -> string | null: why the file's header is wrong, or null
//   isExempt(rel) -> boolean
//
// Every listed file except vendor/**, dist/**, LICENSE, NOTICE and the three package files
// starts with the lines "SPDX-License-Identifier: Apache-2.0" and the exact copyright line, in
// its type's comment syntax:
//   .js .cjs .mjs                               "// <line>", after an optional #! line
//   .yml .yaml .sh .py, .gitignore,             "# <line>", after an optional #! line
//   .gitattributes, .editorconfig
//   .css                                        "/* <line> */" twice, or a block comment opened
//                                               on the first line whose next two lines are them
//   .html .md                                   "<!-- <line> -->" twice, or a multi-line comment
//                                               "<!--" whose next two lines are them; an .html
//                                               file may put "<!doctype html>" first (the
//                                               generated pages' form, docs/MIGRATION.md)
// A file of any other type has no header rule and is reported, so a new type gets one.
"use strict";

const { readText, COPYRIGHT, SPDX_ID } = require("./files.js");

const EXEMPT_FILES = new Set(["LICENSE", "NOTICE", "package.json", "package-lock.json", "test/package.json", "test/package-lock.json"]);
const SLASH = new Set([".js", ".cjs", ".mjs"]);
const HASH = new Set([".yml", ".yaml", ".sh", ".py"]);
const HASH_FILES = new Set([".gitignore", ".gitattributes", ".editorconfig"]);
const MARKUP = new Set([".html", ".md"]);

function isExempt(rel) {
  return rel.startsWith("vendor/") || rel.startsWith("dist/") || EXEMPT_FILES.has(rel);
}

function typeOf(rel) {
  const base = rel.split("/").pop();
  if (HASH_FILES.has(base)) return "hash";
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot).toLowerCase() : "";
  if (SLASH.has(ext)) return "slash";
  if (HASH.has(ext)) return "hash";
  if (ext === ".css") return "css";
  if (MARKUP.has(ext)) return ext === ".html" ? "html" : "md";
  return null;
}

const WANT = `the lines "${SPDX_ID}" and "${COPYRIGHT}"`;

// lines[i] and lines[i + 1] are the two header lines in the line-comment syntax `open … close`.
function twoLines(lines, i, open, close = "") {
  return lines[i] === `${open}${SPDX_ID}${close}` && lines[i + 1] === `${open}${COPYRIGHT}${close}`;
}

// A block comment opened alone on lines[i] whose next two lines (trimmed, with an optional
// leading "*" for CSS) are the header lines, and which is closed somewhere after them.
function block(lines, i, open, close, star = false) {
  if ((lines[i] || "").trim() !== open) return false;
  const body = (s) => {
    let t = (s || "").trim();
    if (star && t.startsWith("* ")) t = t.slice(2);
    return t;
  };
  if (body(lines[i + 1]) !== SPDX_ID || body(lines[i + 2]) !== COPYRIGHT) return false;
  return lines.slice(i + 3).join("\n").includes(close);
}

function headerProblem(rel, text) {
  const type = typeOf(rel);
  if (!type) return "no SPDX header rule for this file type (add one to test/lint/headers.js, or exempt the file there)";
  const lines = text.split("\n");
  let i = 0;
  if ((type === "slash" || type === "hash") && lines[0] && lines[0].startsWith("#!")) i = 1;
  let ok = false;
  if (type === "slash") ok = twoLines(lines, i, "// ");
  else if (type === "hash") ok = twoLines(lines, i, "# ");
  else if (type === "css") ok = twoLines(lines, i, "/* ", " */") || block(lines, i, "/*", "*/", true);
  else {
    if (type === "html" && /^<!doctype html>$/i.test(lines[0] || "")) i = 1;
    ok = twoLines(lines, i, "<!-- ", " -->") || block(lines, i, "<!--", "-->");
  }
  if (ok) return null;
  const how = { slash: "// comments", hash: "# comments", css: "/* */ comments", html: "<!-- --> comments (after an optional <!doctype html>)", md: "<!-- --> comments" }[type];
  return `must start with ${WANT}, as ${how}`;
}

function check(root, { files }) {
  const findings = [];
  for (const rel of files) {
    if (isExempt(rel)) continue;
    const r = readText(root, rel);
    if (!r.ok) {
      findings.push({ file: rel, line: 1, col: 1, rule: "header", message: `${r.why}, so its header cannot be checked` });
      continue;
    }
    const p = headerProblem(rel, r.text);
    if (p) findings.push({ file: rel, line: 1, col: 1, rule: "header", message: p });
  }
  return findings;
}

module.exports = { check, headerProblem, isExempt, typeOf };
