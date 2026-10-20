// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The export call graph (docs/CONTRACT.md, C08b), derived from the source of core/export.js
// every time it is needed, never hand-maintained. Node only: never inlined.
//
//   exportCallGraph(source) -> { name: [callee, ...] }
//
// The UMD factory's body is scanned for its top-level declarations (function NAME(...) {...}
// and const/let/var NAME = ...). For each one, the code of its body, with comments, string
// literals, regex literals and the text parts of template literals removed (template
// interpolations are code and stay), is searched for the other top-level names used as
// whole identifiers that are not property accesses (not after "."). This over-approximates
// (a shadowing local or an object key counts as a use), which only makes C08b stricter.
// Callees are listed in order of first use.
"use strict";

const KEYWORDS_BEFORE_REGEX = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else",
  "yield", "await",
]);

// Returns `source` with every comment, string literal, regex literal and template text
// replaced by spaces (newlines kept), so positions and line structure survive. onLiteral, if
// given, is called with each literal in source order: {kind: "string", start, end} spans a quoted
// string with its quotes; {kind: "template", start, end, first, last} one text part of a template
// literal without its delimiters (first: it follows the opening backtick, last: the closing one
// follows it, so a template without interpolation is one part with both); {kind: "regex", start,
// end} a regex literal with its flags.
function blank(source, { onLiteral = null } = {}) {
  const s = source;
  const out = s.split("");
  const wipe = (from, to) => {
    for (let i = from; i < to; i++) if (out[i] !== "\n") out[i] = " ";
  };
  // Stack of brace depths at which a template interpolation `${` was opened.
  const tmpl = [];
  let depth = 0;
  let i = 0;
  // Last significant token, to tell a regex literal from a division.
  let prev = "";
  const regexAllowed = () => {
    if (prev === "") return true;
    if (/^[A-Za-z_$][\w$]*$/.test(prev)) return KEYWORDS_BEFORE_REGEX.has(prev);
    if (/^[\d.]/.test(prev)) return false;
    return !(prev === ")" || prev === "]" || prev === "}");
  };
  const readTemplate = (start) => {
    // s[start] is "`" or the "}" that closes an interpolation; scan template text.
    let j = start + 1;
    while (j < s.length) {
      if (s[j] === "\\") {
        j += 2;
        continue;
      }
      if (s[j] === "`") {
        wipe(start + 1, j);
        if (onLiteral) onLiteral({ kind: "template", start: start + 1, end: j, first: s[start] === "`", last: true });
        return { end: j + 1, open: false };
      }
      if (s[j] === "$" && s[j + 1] === "{") {
        wipe(start + 1, j);
        if (onLiteral) onLiteral({ kind: "template", start: start + 1, end: j, first: s[start] === "`", last: false });
        return { end: j + 2, open: true };
      }
      j++;
    }
    throw new Error("unterminated template literal");
  };
  while (i < s.length) {
    const c = s[i];
    if (c === "/" && s[i + 1] === "/") {
      const j = s.indexOf("\n", i);
      const end = j < 0 ? s.length : j;
      wipe(i, end);
      i = end;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const j = s.indexOf("*/", i + 2);
      if (j < 0) throw new Error("unterminated comment");
      wipe(i, j + 2);
      i = j + 2;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c) {
        if (s[j] === "\\") j++;
        else if (s[j] === "\n") throw new Error("unterminated string literal");
        j++;
      }
      if (j >= s.length) throw new Error("unterminated string literal");
      wipe(i, j + 1);
      if (onLiteral) onLiteral({ kind: "string", start: i, end: j + 1 });
      i = j + 1;
      prev = "str";
      continue;
    }
    if (c === "`") {
      const r = readTemplate(i);
      if (r.open) {
        tmpl.push(depth);
        depth++;
      }
      i = r.end;
      prev = r.open ? "{" : "str";
      continue;
    }
    if (c === "/" && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < s.length) {
        if (s[j] === "\\") {
          j += 2;
          continue;
        }
        if (s[j] === "\n") throw new Error("unterminated regex literal");
        if (inClass) {
          if (s[j] === "]") inClass = false;
        } else if (s[j] === "[") inClass = true;
        else if (s[j] === "/") break;
        j++;
      }
      j++;
      while (j < s.length && /[A-Za-z]/.test(s[j])) j++;
      wipe(i, j);
      if (onLiteral) onLiteral({ kind: "regex", start: i, end: j });
      i = j;
      prev = "str";
      continue;
    }
    if (c === "{") {
      depth++;
      prev = "{";
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      if (tmpl.length && tmpl[tmpl.length - 1] === depth) {
        // closes a template interpolation: continue the template text
        tmpl.pop();
        const r = readTemplate(i);
        if (r.open) {
          tmpl.push(depth);
          depth++;
        }
        i = r.end;
        prev = r.open ? "{" : "str";
        continue;
      }
      prev = "}";
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*|^\d[\w.]*/.exec(s.slice(i, i + 64));
    if (word) {
      prev = word[0];
      i += word[0].length;
      continue;
    }
    prev = c;
    i++;
  }
  return out.join("");
}

// Index of the bracket matching the opener at `open` in blanked code.
function matching(code, open) {
  const pairs = { "{": "}", "(": ")", "[": "]" };
  const stack = [];
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === "}" || c === ")" || c === "]") {
      if (stack.pop() !== c) throw new Error(`unbalanced ${c} at offset ${i}`);
      if (!stack.length) return i;
    }
  }
  throw new Error(`no match for ${code[open]} at offset ${open}`);
}

// The [start, end) range of the factory body: the last function expression passed to the
// UMD wrapper call `(function (root, factory) {...})(..., function (...) { BODY })`.
function factoryBody(code) {
  const call = code.indexOf("})(");
  if (call < 0) throw new Error("no UMD wrapper call found");
  const m = /function\s*\w*\s*\([^)]*\)\s*\{/g;
  m.lastIndex = call;
  const f = m.exec(code);
  if (!f) throw new Error("no factory function found");
  const open = f.index + f[0].length - 1;
  return [open + 1, matching(code, open)];
}

// Top-level declarations of the factory body: [{name, start, end}] with [start, end) the
// declaration's code (after the name).
function declarations(code, start, end) {
  const out = [];
  let i = start;
  const atDepth0 = [];
  // Walk the body at depth 0 and collect statement starts.
  while (i < end) {
    const c = code[i];
    if (c === "{" || c === "(" || c === "[") {
      i = matching(code, i) + 1;
      continue;
    }
    const rest = code.slice(i, i + 200);
    const fn = /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/.exec(rest);
    const v = /^(?:const|let|var)\s+/.exec(rest);
    const prevChar = i > start ? code[i - 1] : " ";
    const boundary = !/[\w$.]/.test(prevChar);
    if (boundary && fn) {
      const paren = i + fn[0].length - 1;
      const close = matching(code, paren);
      const brace = code.indexOf("{", close);
      const bodyEnd = matching(code, brace) + 1;
      atDepth0.push({ name: fn[1], start: i + fn[0].indexOf(fn[1]) + fn[1].length, end: bodyEnd });
      i = bodyEnd;
      continue;
    }
    if (boundary && v) {
      // const a = ..., b = ...; : split declarators at depth-0 commas, end at ";" or at a
      // line that starts a new declaration (no semicolon).
      let j = i + v[0].length;
      for (;;) {
        const nm = /^\s*([A-Za-z_$][\w$]*)/.exec(code.slice(j, j + 100));
        if (!nm) break;
        const nameEnd = j + nm[0].length;
        let k = nameEnd;
        let stop = null;
        while (k < end) {
          const ch = code[k];
          if (ch === "{" || ch === "(" || ch === "[") {
            k = matching(code, k) + 1;
            continue;
          }
          if (ch === ";" || ch === ",") {
            stop = ch;
            break;
          }
          if (ch === "\n" && /^\s*(?:(?:async\s+)?function\b|const\b|let\b|var\b|return\b)/.test(code.slice(k + 1, k + 40))) {
            stop = "\n";
            break;
          }
          k++;
        }
        atDepth0.push({ name: nm[1], start: nameEnd, end: k });
        j = k + 1;
        if (stop !== ",") break;
      }
      i = j;
      continue;
    }
    i++;
  }
  out.push(...atDepth0);
  return out;
}

function exportCallGraph(source) {
  const code = blank(String(source));
  const [start, end] = factoryBody(code);
  const decls = declarations(code, start, end);
  const names = new Set(decls.map((d) => d.name));
  const graph = {};
  for (const d of decls) {
    const body = code.slice(d.start, d.end);
    const seen = [];
    const re = /[A-Za-z_$][\w$]*/g;
    let m;
    while ((m = re.exec(body))) {
      const w = m[0];
      const before = body.slice(0, m.index).replace(/\s+$/, "");
      if (before.endsWith(".") && !before.endsWith("..")) continue; // property access (a.b, a?.b)
      if (/[\w$]$/.test(body.slice(0, m.index))) continue;
      if (w !== d.name && names.has(w) && !seen.includes(w)) seen.push(w);
    }
    graph[d.name] = seen;
  }
  return graph;
}

module.exports = { exportCallGraph, blank };
