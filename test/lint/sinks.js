// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Lint: sinks and purity of the code that runs in the pages (docs/TESTING.md, lints).
//
//   check(root, {files, providers}) -> [{file, line, col, rule, message, reportOnly?}]
//   REPORT_ONLY: the rules whose findings are a report only, not a failure. Design §6.3 delayed
//   only the innerHTML rule ("From M8, innerHTML may be assigned only inside
//   StatementEscape.setHtml"); migration step M8 moved every render to html`…` and setHtml and
//   emptied the list, so every rule fails test/lint/run.js. A finding of a report-only rule
//   would carry reportOnly: true, which run.js prints as a note (and --enforce-sinks counts).
//   literals(text) -> the file's string literals with their spans and values (below);
//   stringKeys(text, names) -> the constant strings (a literal, or literals joined by +) whose
//   value is one of names: [{index, name, length}].
//
// Scope: the .js files under core/ and providers/. Each file is scanned with its comments,
// strings, regex literals and template text blanked out (core/contract/callgraph.js `blank`),
// so a rule never fires on prose. Its string literals are read as well, with their values as
// JavaScript reads them (every escape decoded: \x, \u, \u{…}, octal, line continuations and the
// identity escapes such as \H), and literals joined by + (with parentheses) are folded into one
// constant string. Rules:
//   banned        new Function, Date.now(, Math.random(, performance.now(; every name of NAMES
//                 below in any form: an identifier anywhere (a call, a member read or written,
//                 a key, a binding: `el.outerHTML ||= s`, `[el.outerHTML] = [s]`, `const d =
//                 document; d.write(s)`, `(0, eval)(s)`), and a constant string with that value
//                 (a computed key such as el["inner\x48TML"] or document["wr" + "ite"]); the global
//                 Function anywhere (Function(s) without new included); setTimeout and
//                 setInterval with a string as the code to run; setAttribute and setAttributeNS
//                 other than called with a constant name that does not start with "on" (an
//                 event handler), and their names as constant strings
//   escape        an identifier written with a \u escape (el.inner\u0048TML): it could hide any
//                 name above, and page code never needs one
//   clock         a read of the clock through Date: new Date() or new Date with no arguments,
//                 or Date() called without new; only zip() in core/zip.js may
//   innerHTML     innerHTML in any form, as for the names of NAMES (reads included: page code
//                 never needs to read it), except inside setHtml in core/escape.js (since M8 the
//                 only sink, docs/SECURITY.md)
//   localeCompare in core/assemble.js and the providers without frozen.legacyRepo (new code
//                 compares by code point): localeCompare( without a locale, that is with fewer
//                 than two arguments or with undefined, void … or [] as the second, and
//                 Intl.Collator without a locale (no first argument, or undefined, void … or [])
//   compose       Object.assign({}, <global>.StatementExport outside core/app/statement-app.js
//                 and the custom apps' app scripts: only an app composes the namespace
//   tokenize      the comments and strings could not be stripped; the file is scanned as is
// A lint is not a sandbox: a name put together at run time (from a variable, a call such as
// String.fromCharCode or join, a regex's source) is out of its reach. The injection smoke
// (test/smoke/injection.js) checks that every render target prints its payloads as text.
"use strict";

const path = require("path");
const { readText, lineCol, providerFacts, REPO } = require("./files.js");

const REPORT_ONLY = Object.freeze([]);

// Patterns on the blanked code (the names below have their own rule).
const BANNED = [
  ["new Function", /\bnew\s+Function\b/g],
  ["Date.now(", /\bDate\s*\.\s*now\s*\(/g],
  ["Math.random(", /\bMath\s*\.\s*random\s*\(/g],
  ["performance.now(", /\bperformance\s*\.\s*now\s*\(/g],
];
// The names banned in every form (design §6.3's list, the markup parsers and the other markup
// and code sinks of the same kind), each with what it does.
const NAMES = {
  eval: "runs a string as code",
  fetch: "reaches the network",
  XMLHttpRequest: "reaches the network",
  WebSocket: "reaches the network",
  sendBeacon: "reaches the network",
  importScripts: "loads code",
  outerHTML: "writes markup",
  insertAdjacentHTML: "writes markup",
  setHTML: "writes markup",
  setHTMLUnsafe: "writes markup",
  parseHTMLUnsafe: "parses markup",
  createContextualFragment: "parses markup",
  parseFromString: "parses markup",
  srcdoc: "writes a document's markup",
  execCommand: "writes markup (insertHTML)",
  write: "writes markup (document.write)",
  writeln: "writes markup (document.writeln)",
  setAttributeNode: "sets any attribute, event handlers included",
  setAttributeNodeNS: "sets any attribute, event handlers included",
  createAttribute: "makes any attribute, event handlers included",
  createAttributeNS: "makes any attribute, event handlers included",
  getRandomValues: "reads randomness",
  randomUUID: "reads randomness",
};
const SET_ATTRIBUTE = { setAttribute: 0, setAttributeNS: 1 }; // the name argument's index
const TIMERS = ["setTimeout", "setInterval"];
const LOCALE_COMPARE = /\.\s*localeCompare\s*\(/g;
const COLLATOR = /\bIntl\s*\.\s*Collator\b/g;
const COMPOSE = /\bObject\s*\.\s*assign\s*\(\s*\{\s*\}\s*,\s*(?:self|window|globalThis|root)\s*\.\s*StatementExport\b/g;
// An argument that leaves the locale to the browser: missing, undefined, void …, or [].
const NO_LOCALE = /^(?:undefined|void\b[\s\S]*|\[\s*\])$/;
// Between two literals of one constant string: a + with whitespace and parentheses.
const JOIN = /^[\s()]*\+[\s()]*$/;

let blankFn = null;
function blankText(text, opts) {
  if (!blankFn) blankFn = require(path.join(REPO, "core", "contract", "callgraph.js")).blank;
  return blankFn(text, opts);
}
function blanked(text) {
  try {
    const found = [];
    const code = blankText(text, { onLiteral: (l) => found.push(l) });
    return { code, ok: true, literals: readLiterals(text, found) };
  } catch (e) {
    return { code: text, ok: false, why: e.message, literals: [] };
  }
}

// ---------------------------------------------------------------- string literals

// The value of a string literal's body (between its quotes) or of a template part, as
// JavaScript reads it; null for an escape that is invalid there (only a tagged template may
// hold one). In a template, CR and CRLF read as LF.
function decode(body, { template = false } = {}) {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") {
      if (template && c === "\r") {
        if (body[i + 1] === "\n") i++;
        out += "\n";
      } else out += c;
      continue;
    }
    const n = body[++i];
    if (n === undefined) return null;
    const simple = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", v: "\v" };
    if (Object.prototype.hasOwnProperty.call(simple, n)) out += simple[n];
    else if (n === "\r") {
      if (body[i + 1] === "\n") i++; // a line continuation
    } else if (n === "\n" || n === "\u2028" || n === "\u2029") {
      // a line continuation
    } else if (n === "x") {
      const h = body.slice(i + 1, i + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(h)) return null;
      out += String.fromCharCode(parseInt(h, 16));
      i += 2;
    } else if (n === "u") {
      const m = /^\{([0-9a-fA-F]+)\}/.exec(body.slice(i + 1)) || /^([0-9a-fA-F]{4})/.exec(body.slice(i + 1));
      if (!m || parseInt(m[1], 16) > 0x10ffff) return null;
      out += String.fromCodePoint(parseInt(m[1], 16));
      i += m[0].length;
    } else if (/[0-7]/.test(n)) {
      // \0, or a legacy octal escape (sloppy code; a template rejects it): at most three digits,
      // two when the first is 4-7.
      let digits = /^[0-7]{1,3}/.exec(body.slice(i))[0];
      if (parseInt(digits, 8) > 255) digits = digits.slice(0, 2);
      if (template && digits !== "0") return null;
      out += String.fromCharCode(parseInt(digits, 8));
      i += digits.length - 1;
    } else out += n; // \8, \9 and every other character stand for themselves
  }
  return out;
}

// The literals blank() reported, as {start, end, values, foldable, kind}: a quoted string (its
// span with the quotes) or a template without interpolation (with the backticks) is foldable
// into a constant string; a template part next to ${…} stands alone. values: the cooked value,
// and a template's raw text (String.raw reads it) when it differs. Regex literals are left out.
function readLiterals(text, found) {
  const out = [];
  for (const l of found) {
    if (l.kind === "string") {
      out.push({ kind: "string", start: l.start, end: l.end, foldable: true, values: [decode(text.slice(l.start + 1, l.end - 1))].filter((v) => v !== null) });
    } else if (l.kind === "template") {
      const body = text.slice(l.start, l.end);
      const raw = body.replace(/\r\n?/g, "\n");
      const cooked = decode(body, { template: true });
      const values = [...new Set([cooked, raw].filter((v) => v !== null))];
      const whole = l.first && l.last;
      out.push({ kind: "template", start: whole ? l.start - 1 : l.start, end: whole ? l.end + 1 : l.end, foldable: whole, values });
    }
  }
  return out;
}

function literals(text) {
  return blanked(text).literals;
}

// The constant strings of a file: every run of foldable literals joined by + (each literal
// alone, and every longer run, since a + chain may start or end with a value the lint cannot
// see), and every other literal alone: [{start, end, value}].
function constants(code, lits) {
  const out = [];
  const chains = [];
  for (const l of lits) {
    if (!l.foldable) {
      for (const value of l.values) out.push({ start: l.start, end: l.end, value });
      continue;
    }
    const last = chains.length ? chains[chains.length - 1] : null;
    const prev = last ? last[last.length - 1] : null;
    if (prev && JOIN.test(code.slice(prev.end, l.start))) last.push(l);
    else chains.push([l]);
  }
  for (const chain of chains) {
    for (let i = 0; i < chain.length; i++) {
      let acc = [""];
      for (let j = i; j < chain.length; j++) {
        acc = acc.flatMap((a) => chain[j].values.map((v) => a + v)).slice(0, 8);
        for (const value of acc) out.push({ start: chain[i].start, end: chain[j].end, value });
      }
    }
  }
  return out;
}

// The constant string an argument span [s, e) holds, or null when it holds anything else.
function constantIn(code, lits, s, e) {
  const inside = lits.filter((l) => l.start >= s && l.end <= e);
  if (!inside.length || inside.some((l) => !l.foldable || !l.values.length)) return null;
  let rest = code.slice(s, inside[0].start);
  for (let k = 0; k < inside.length; k++) {
    if (k && !JOIN.test(code.slice(inside[k - 1].end, inside[k].start))) return null;
  }
  rest += code.slice(inside[inside.length - 1].end, e);
  if (!/^[\s()]*$/.test(rest)) return null;
  return inside.map((l) => l.values[0]).join("");
}

function stringKeys(text, names) {
  const b = blanked(text);
  if (!b.ok) {
    // cannot tell strings from prose, so every quoted candidate counts
    const re = new RegExp(`(["'\`])(${names.join("|")})\\1`, "g");
    return [...text.matchAll(re)].map((m) => ({ index: m.index, name: m[2], length: m[0].length }));
  }
  const seen = new Set();
  const out = [];
  for (const c of constants(b.code, b.literals)) {
    if (!names.includes(c.value) || seen.has(`${c.start}:${c.value}`)) continue;
    seen.add(`${c.start}:${c.value}`);
    out.push({ index: c.start, name: c.value, length: c.end - c.start });
  }
  return out;
}

// ---------------------------------------------------------------- code

// The index range of the body of `function <name>(…) {…}` in blanked code, or null.
function functionBody(code, name) {
  const m = new RegExp(`\\bfunction\\s+${name}\\s*\\(`).exec(code);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  for (; i < code.length && depth; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")") depth--;
  }
  const open = code.indexOf("{", i);
  if (open < 0) return null;
  depth = 0;
  for (let j = open; j < code.length; j++) {
    if (code[j] === "{") depth++;
    else if (code[j] === "}" && --depth === 0) return [open, j];
  }
  return null;
}

// The argument spans [start, end) of the call whose "(" is at code[open], split at its own
// commas. Blanking keeps every index of the source, so a span reads both texts.
function argSpans(code, open) {
  const spans = [];
  let depth = 0, start = open + 1;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === "(" || c === "[" || c === "{") {
      depth++;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) {
        spans.push([start, i]);
        return spans;
      }
      continue;
    }
    if (depth === 1 && c === ",") {
      spans.push([start, i]);
      start = i + 1;
    }
  }
  spans.push([start, code.length]);
  return spans;
}

// The arguments of that call as {code, text, span}: the blanked and the source slice. Empty
// slots at the end (no argument at all, or a trailing comma) are dropped; a string literal
// counts as an argument although blanking turned it into spaces.
function argList(code, open, text = code) {
  const args = argSpans(code, open).map(([s, e]) => ({ code: code.slice(s, e), text: text.slice(s, e), span: [s, e] }));
  const present = (a) => a.code.trim() !== "" || /^\s*["'`]/.test(a.text);
  while (args.length && !present(args[args.length - 1])) args.pop();
  return args;
}

// The number of arguments of the call whose "(" is at code[open].
function argCount(code, open, text = code) {
  return argList(code, open, text).length;
}

// True when the argument leaves the locale to the browser: missing, undefined, void … or [].
// The source must hold no string there (blanked, ["en"] would read as []).
const noLocale = (a) => !a || (NO_LOCALE.test(a.code.trim()) && !/["'`]/.test(a.text));

function inside(range, at) {
  return !!range && at > range[0] && at < range[1];
}

// The last non-space character before index, and the word that ends there.
function before(code, index) {
  let i = index - 1;
  while (i >= 0 && /\s/.test(code[i])) i--;
  const m = /[\w$]+$/.exec(code.slice(Math.max(0, i - 40), i + 1));
  return { char: i >= 0 ? code[i] : "", word: m ? m[0] : "" };
}

// The first non-space character at or after index.
function after(code, index) {
  let i = index;
  while (i < code.length && /\s/.test(code[i])) i++;
  return { char: i < code.length ? code[i] : "", at: i };
}

// Every use of `name` as an identifier in blanked code (a member after "." or "?.", a key, a
// shorthand property, a variable, a binding): indexes.
function identifiers(code, name) {
  const out = [];
  const re = new RegExp(`(?<![\\w$])${name}(?![\\w$])`, "g");
  for (let m; (m = re.exec(code));) out.push(m.index);
  return out;
}

function check(root, { files, providers } = {}) {
  root = path.resolve(root);
  const facts = providers || providerFacts(root);
  const byFolder = new Map(facts.map((p) => [p.folder, p]));
  const findings = [];
  for (const rel of files) {
    if (!rel.endsWith(".js") || !(rel.startsWith("core/") || rel.startsWith("providers/"))) continue;
    const r = readText(root, rel);
    if (!r.ok) continue; // the privacy lint reports files that are not text
    const b = blanked(r.text);
    const code = b.code;
    const mine = [];
    const at = (index, rule, message) => {
      const { line, col } = lineCol(code, index);
      const f = { file: rel, line, col, rule, message };
      if (REPORT_ONLY.includes(rule)) f.reportOnly = true;
      mine.push([index, f]);
    };
    if (!b.ok) at(0, "tokenize", `comments and strings could not be stripped (${b.why}); scanned as is`);
    for (const [name, re] of BANNED) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(code))) at(m.index, "banned", `${name} is not allowed in page code`);
    }
    // An escaped identifier: outside literals and comments a backslash can only be one.
    if (b.ok) for (let i = code.indexOf("\\"); i >= 0; i = code.indexOf("\\", i + 1)) at(i, "escape", "an identifier written with a \\u escape can hide a banned name from this lint; write it plainly");

    const setHtmlBody = rel === "core/escape.js" ? functionBody(code, "setHtml") : null;
    const markup = (index, message) => {
      if (!inside(setHtmlBody, index)) at(index, "innerHTML", `${message} outside StatementEscape.setHtml (render through html\`…\` and setHtml)`);
    };
    for (const [name, what] of Object.entries(NAMES)) {
      for (const i of identifiers(code, name)) at(i, "banned", `${name} ${what}: it is not allowed in page code in any form (a call, a member, a key or a name)`);
    }
    for (const i of identifiers(code, "innerHTML")) markup(i, "innerHTML in any form (an assignment, a read, a key or a name)");
    for (const i of identifiers(code, "Function")) {
      if (before(code, i).char !== "." && before(code, i).word !== "new") at(i, "banned", "the global Function makes code from a string (Function(s) as new Function(s)): it is not allowed in page code");
    }
    const consts = b.ok ? constants(code, b.literals) : [];
    const strings = new Map(); // one finding per literal start and value
    for (const c of consts) if (!strings.has(`${c.start}:${c.value}`)) strings.set(`${c.start}:${c.value}`, c);
    for (const c of strings.values()) {
      if (c.value === "innerHTML") markup(c.start, "\"innerHTML\" as a string (a computed key)");
      else if (Object.prototype.hasOwnProperty.call(NAMES, c.value) || c.value === "Function" || Object.prototype.hasOwnProperty.call(SET_ATTRIBUTE, c.value)) {
        at(c.start, "banned", `"${c.value}" as a string (a computed key, also when escaped or put together with +) is not allowed in page code`);
      }
    }
    // setAttribute and setAttributeNS: only called, with a constant name that is not an event
    // handler's.
    for (const [name, k] of Object.entries(SET_ATTRIBUTE)) {
      for (const i of identifiers(code, name)) {
        const next = after(code, i + name.length);
        if (before(code, i).char !== "." || next.char !== "(") {
          at(i, "banned", `${name} other than called (el.${name}(…)) is not allowed in page code: its name argument must be checked`);
          continue;
        }
        const arg = argList(code, next.at, r.text)[k];
        const value = arg && b.ok ? constantIn(code, b.literals, arg.span[0], arg.span[1]) : null;
        if (value === null) at(i, "banned", `${name} with a name that is not a constant string is not allowed in page code (it could set an event handler)`);
        else if (/^on/i.test(value)) at(i, "banned", `${name} of an event handler attribute (on…) is not allowed in page code`);
      }
    }
    // setTimeout and setInterval: a string as the code to run is eval.
    for (const name of TIMERS) {
      for (const i of identifiers(code, name)) {
        const next = after(code, i + name.length);
        if (next.char !== "(") continue;
        const first = argList(code, next.at, r.text)[0];
        if (first && /^[\s(]*["'`]/.test(first.text)) at(i, "banned", `${name} with a string runs it as code: it is not allowed in page code (pass a function)`);
      }
    }

    const zipBody = rel === "core/zip.js" ? functionBody(code, "zip") : null;
    const clock = (index, message) => {
      if (!inside(zipBody, index)) at(index, "clock", `${message} reads the clock; only zip() in core/zip.js may`);
    };
    const DATE = /\bDate\b/g;
    for (let m; (m = DATE.exec(code));) {
      const prev = before(code, m.index), next = after(code, m.index + m[0].length);
      if (prev.char === "." || prev.word === "function" || prev.word === "class") continue;
      if (prev.word === "new") {
        if (next.char === "(") {
          if (!argList(code, next.at, r.text).length) clock(m.index, "new Date() without arguments");
        } else if (next.char !== ".") clock(m.index, "new Date without arguments");
      } else if (next.char === "(") clock(m.index, "Date() called without new");
    }

    const folder = rel.startsWith("providers/") ? rel.split("/")[1] : null;
    const p = folder ? byFolder.get(folder) : null;
    const strictCompare = rel === "core/assemble.js" || (folder !== null && !(p && p.legacy));
    if (strictCompare) {
      LOCALE_COMPARE.lastIndex = 0;
      for (let m; (m = LOCALE_COMPARE.exec(code));) {
        const args = argList(code, m.index + m[0].length - 1, r.text);
        if (args.length < 2 || noLocale(args[1])) at(m.index, "localeCompare", "localeCompare without a locale depends on the browser's language: compare strings by code point (a < b)");
      }
      COLLATOR.lastIndex = 0;
      for (let m; (m = COLLATOR.exec(code));) {
        const next = after(code, m.index + m[0].length);
        if (next.char === ".") continue; // a static method such as Intl.Collator.supportedLocalesOf
        const args = next.char === "(" ? argList(code, next.at, r.text) : [];
        if (noLocale(args[0])) at(m.index, "localeCompare", "Intl.Collator without a locale depends on the browser's language: compare strings by code point (a < b)");
      }
    }
    const appScript = p && p.app === "custom" && p.appScript ? `providers/${folder}/${p.appScript}` : null;
    if (rel !== "core/app/statement-app.js" && rel !== appScript) {
      COMPOSE.lastIndex = 0;
      for (let m; (m = COMPOSE.exec(code));) at(m.index, "compose", "only the app script composes Object.assign({}, StatementExport, parser)");
    }
    // In source order within the file (a stable sort keeps the rule order at one index).
    findings.push(...mine.sort((x, y) => x[0] - y[0]).map(([, f]) => f));
  }
  return findings;
}

module.exports = { check, REPORT_ONLY, NAMES, functionBody, argCount, argList, stringKeys, literals, decode };
