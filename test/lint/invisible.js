// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Lint: no literal invisible characters (docs/MIGRATION.md, decisions 90 and 91). Such a
// character cannot be seen in review, a tool can add or drop it silently, and V8 counts some of
// them as line breaks. Write it as an escape (a backslash, "u" and four hex digits) instead.
//
//   check(root, {files}) -> [{file, line, col, rule, message}]
//   INVISIBLE: [[first, last], ...] code point ranges
//
// Flagged: control characters other than tab and line feed (so a carriage return too), format
// characters (zero-width spaces and joiners, bidirectional controls, the byte order mark, the
// soft hyphen, ...), the line and paragraph separators, every space other than U+0020,
// variation selectors and other characters that render as nothing, the replacement character
// (the trace of a decoding error), private-use characters and noncharacters.
// Scope: every listed text file except vendor/** (byte copies of pdf.js; its worker holds
// control characters) and dist/** (generated from the linted sources and vendor/).
// The one allowance: on a line that the pin list declares as a sentinel of a pinned file that
// matches its pin, the declared text may hold such characters (the pinned parser's literal
// U+FEFF, which the copy must keep byte for byte). Files that are not UTF-8 text are reported by
// the privacy lint. Every range below is written as a number, so this file holds none of them.
"use strict";

const path = require("path");
const { readText, REPO } = require("./files.js");

const INVISIBLE = [
  [0x0000, 0x0008], [0x000b, 0x001f], [0x007f, 0x009f], // controls other than tab and line feed
  [0x00a0, 0x00a0], [0x00ad, 0x00ad], [0x034f, 0x034f], [0x061c, 0x061c], [0x115f, 0x1160],
  [0x1680, 0x1680], [0x17b4, 0x17b5], [0x180b, 0x180f], [0x2000, 0x200f], [0x2028, 0x202f],
  [0x205f, 0x206f], [0x2800, 0x2800], [0x3000, 0x3000], [0x3164, 0x3164], [0xd800, 0xdfff],
  [0xe000, 0xf8ff], [0xfdd0, 0xfdef], [0xfe00, 0xfe0f], [0xfeff, 0xfeff], [0xffa0, 0xffa0],
  [0xfff0, 0xfffb], [0xfffd, 0xffff], [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a], [0xe0000, 0xe0fff],
  [0xf0000, 0x10ffff],
];
const isInvisible = (cp) => INVISIBLE.some(([a, b]) => cp >= a && cp <= b) || (cp & 0xfffe) === 0xfffe;
const hex = (cp) => `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;

// {path: Map(line -> [texts])} for the sentinels of pins whose files match them.
function allowances(root) {
  const out = new Map();
  let pins = [], intact = new Set();
  try {
    const prov = require(path.join(REPO, "tools", "provenance.js"));
    pins = prov.loadPins(root);
    intact = new Set(prov.pinnedFiles({ root }).filter((f) => f.matches).map((f) => f.path));
  } catch {
    return out;
  }
  for (const pin of Array.isArray(pins) ? pins : []) {
    if (!pin || !intact.has(pin.path) || !Array.isArray(pin.sentinels)) continue;
    const lines = out.get(pin.path) || new Map();
    for (const s of pin.sentinels) {
      if (!s || typeof s.contains !== "string" || !Number.isInteger(s.line)) continue;
      lines.set(s.line, [...(lines.get(s.line) || []), s.contains]);
    }
    out.set(pin.path, lines);
  }
  return out;
}

function check(root, { files } = {}) {
  root = path.resolve(root);
  const allowed = allowances(root);
  const findings = [];
  for (const rel of files) {
    if (rel.startsWith("vendor/") || rel.startsWith("dist/")) continue;
    const r = readText(root, rel);
    if (!r.ok) continue;
    const sentinelLines = allowed.get(rel) || new Map();
    const lines = r.text.split("\n");
    lines.forEach((text, i) => {
      let line = text;
      for (const s of sentinelLines.get(i + 1) || []) line = line.split(s).join(" ".repeat(s.length));
      let col = 0;
      for (const ch of line) {
        col++;
        const cp = ch.codePointAt(0);
        if (isInvisible(cp)) {
          findings.push({ file: rel, line: i + 1, col, rule: "invisible", message: `literal ${hex(cp)}: write it as an escape` });
        }
      }
    });
  }
  return findings;
}

module.exports = { check, INVISIBLE, isInvisible };
