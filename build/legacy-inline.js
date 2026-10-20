// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The old inlining algorithm, test-only (gate G2): never used for dist/.
//
//   readLegacyBuild(buildPyText) -> {template, parts: [[marker, path], ...], output}
//     Parses an old build.py (read-only). Every variant runs the same algorithm and differs
//     only in its `parts` table; anything else is refused, so the algorithm replayed here
//     is the one the file runs.
//   inlineLegacy(templateText, parts, readFile) -> html
//     For each [marker, path] in table order: refuse code containing "</script" (any case)
//     or "<!--", assert that the marker occurs exactly once in the text so far, and replace
//     it with the code (a literal replacement, no "$" patterns).
//   readText(file) -> string
//     Python's Path.read_text() on a UTF-8 system: strict UTF-8 (a BOM is kept as U+FEFF)
//     and universal newlines ("\r\n" and "\r" become "\n").
"use strict";

const fs = require("fs");

// The algorithm lines every supported build.py must contain, verbatim.
const ALGORITHM = [
  /^from pathlib import Path$/m,
  /^HERE = Path\(__file__\)\.parent$/m,
  /^for marker, path in parts\.items\(\):$/m,
  /^ {4}code = path\.read_text\(\)$/m,
  /^ {4}if "<\/script" in code\.lower\(\) or "<!--" in code:$/m,
  /^ {8}raise SystemExit\(.*\)$/m,
  /^ {4}assert html\.count\(marker\) == 1, marker$/m,
  /^ {4}html = html\.replace\(marker, code\)$/m,
  /^out\.write_text\(html\)$/m,
];

function readLegacyBuild(text) {
  const src = String(text);
  for (const re of ALGORITHM) {
    if (!re.test(src)) throw new Error(`unsupported build.py: no line matching ${re}`);
  }
  const table = /^parts = \{\n((?: {4}"[^"\n]+": HERE \/ "[^"\n]+",\n)+)\}$/m.exec(src);
  if (!table) throw new Error("unsupported build.py: no parts = {...} table of \"MARKER\": HERE / \"path\" lines");
  const parts = table[1].trimEnd().split("\n").map((line) => {
    const m = /^ {4}"([^"]+)": HERE \/ "([^"]+)",$/.exec(line);
    if (!m) throw new Error(`unsupported build.py: parts line ${JSON.stringify(line)}`);
    return [m[1], m[2]];
  });
  const markers = parts.map(([m]) => m);
  if (new Set(markers).size !== markers.length) throw new Error("unsupported build.py: repeated marker");
  const tpl = /^html = \(HERE \/ "([^"]+)"\)\.read_text\(\)$/m.exec(src);
  if (!tpl) throw new Error("unsupported build.py: no html = (HERE / \"...\").read_text() line");
  const out = /^out = HERE \/ "([^"]+)"$/m.exec(src);
  if (!out) throw new Error("unsupported build.py: no out = HERE / \"...\" line");
  for (const p of [tpl[1], out[1], ...parts.map(([, p]) => p)]) {
    if (p.startsWith("/") || p.split("/").some((s) => s === ".." || s === "")) throw new Error(`unsupported build.py: path ${p} leaves the repository`);
  }
  return { template: tpl[1], parts, output: out[1] };
}

// Python: str.count (non-overlapping), str.lower, str.replace.
const count = (hay, needle) => hay.split(needle).length - 1;

function inlineLegacy(templateText, parts, readFile) {
  let html = String(templateText);
  for (const [marker, file] of parts) {
    const code = String(readFile(file));
    if (code.toLowerCase().includes("</script") || code.includes("<!--")) {
      throw new Error(`${file} contains a sequence that would break inline <script>`);
    }
    const n = count(html, marker);
    if (n !== 1) throw new Error(`marker ${marker} occurs ${n} times in the text so far (build.py asserts exactly once)`);
    html = html.split(marker).join(code);
  }
  return html;
}

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

function readText(file) {
  return decoder.decode(fs.readFileSync(file)).replace(/\r\n?/g, "\n");
}

module.exports = { readLegacyBuild, inlineLegacy, readText };
