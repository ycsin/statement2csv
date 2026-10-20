// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Content-Security-Policy of the built pages, and the self-check of every written page.
//
//   policy(pieces, {pdf, mode, styleText, stylePolicy}) -> the CSP string
//     pieces: the plan pieces with their text ({kind, text}); executable ones are hashed.
//   landingPolicy({mode, styleText, stylePolicy}) -> the landing page's CSP
//   hashSource(text) -> "'sha256-<base64>'"
//   verify(html, plan, {mode, pdf, stylePolicy}) -> string[] problems (empty: the page is good):
//     - the <script> elements are exactly the plan pieces, in order, each byte-equal to its
//       source (re-read from disk);
//     - the policy is exactly the one the page's own inline scripts and its one <style> give:
//       policy() over their text as the page holds it. So every executable script and the
//       style are listed (hash mode), and the policy lists no hash, source or directive
//       beyond them;
//     - in hash mode, read from the page alone (so a fault in policy() cannot pass): the
//       script-src in force lists the hash of every script the page runs and nothing else but
//       blob: on a PDF page, and under the hash style policy the style-src in force lists the
//       style's hash and nothing else;
//     - the browser hashes the text the build hashed: the page holds no CR (the parser turns
//       it into LF) and no NUL (replaced in script and style text), and declares UTF-8 in its
//       first 1024 bytes, where the browser looks for the encoding;
//     - exactly one CSP meta, inside <head> (a policy elsewhere is ignored) and before any
//       script and the <style> (a policy governs only what follows it), with default-src 'none'
//       and no http:/https:;
//     - no on* attribute outside scripts, and no style attribute in hash mode, with tags read as
//       the browser's tokenizer reads them (tags()); no <svg> or <math> element, whose foreign
//       content that reading does not follow;
//     - isEvalSupported: false present when pdf is an input.
//   verifyLanding(html, {mode, stylePolicy}) -> string[]: the same checks for the landing
//     page, which has no script and carries landingPolicy().
//   tags(html) -> [{text, name, end, attrs}]: the page's tags as the browser's HTML tokenizer
//     reads them (the markup check's reading).
"use strict";

const crypto = require("crypto");
const fs = require("fs");

// "hash" since step M10 of the migration; "legacy", the old pages' policies, until then.
const DEFAULT_CSP_MODE = "hash";
// "hash", or "unsafe-inline" as the documented fallback. Gate G9 of step M10 found no
// style-src violation, so "hash" stays (docs/MIGRATION.md decision 187).
const STYLE_POLICY = "hash";

const LEGACY_PDF = "default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline'; img-src data: blob:; connect-src blob: data:";
const LEGACY_OTHER = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src blob: data:";

// The bytes the browser's encoding prescan reads for a <meta charset> (HTML, encoding sniffing).
const PRESCAN_BYTES = 1024;

function hashSource(text) {
  return `'sha256-${crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("base64")}'`;
}

function styleSource(styleText, stylePolicy) {
  return stylePolicy === "unsafe-inline" ? "'unsafe-inline'" : hashSource(styleText);
}

function checkMode(mode) {
  if (mode !== "legacy" && mode !== "hash") throw new Error(`unknown CSP mode ${JSON.stringify(mode)} (legacy or hash)`);
}

function checkStylePolicy(stylePolicy) {
  if (stylePolicy !== "hash" && stylePolicy !== "unsafe-inline") throw new Error(`unknown style policy ${JSON.stringify(stylePolicy)} (hash or unsafe-inline)`);
}

function policy(pieces, { pdf, mode = DEFAULT_CSP_MODE, styleText = "", stylePolicy = STYLE_POLICY } = {}) {
  checkMode(mode);
  checkStylePolicy(stylePolicy);
  if (mode === "legacy") return pdf ? LEGACY_PDF : LEGACY_OTHER;
  const hashes = [];
  for (const p of pieces) {
    if (p.kind !== "exec") continue;
    const h = hashSource(p.text);
    if (!hashes.includes(h)) hashes.push(h);
  }
  const script = `script-src ${hashes.join(" ")}${pdf ? " blob:" : ""}`;
  return [
    "default-src 'none'",
    script,
    ...(pdf ? ["worker-src blob:"] : []),
    `style-src ${styleSource(styleText, stylePolicy)}`,
    "img-src data: blob:",
    "connect-src blob: data:",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

function landingPolicy({ mode = DEFAULT_CSP_MODE, styleText = "", stylePolicy = STYLE_POLICY } = {}) {
  checkMode(mode);
  checkStylePolicy(stylePolicy);
  return `default-src 'none'; style-src ${mode === "legacy" ? "'unsafe-inline'" : styleSource(styleText, stylePolicy)}`;
}

// The page with every <script> body blanked out; markupOnly blanks the <style> bodies too, so
// the searches for the CSP meta, <head>, the first <script> and the <style> see markup only.
const blankScripts = (html) => html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi, "$1$2");
const markupOnly = (html) => blankScripts(html).replace(/(<style\b[^>]*>)[\s\S]*?(<\/style\s*>)/gi, "$1$2");

// Elements whose text the browser reads as text, not markup (in HTML content, with scripting
// on): the tokenizer passes over it to the element's end tag. After <plaintext>, everything is
// text. <svg> and <math> start foreign content, which tags() does not follow (there a <title>
// or <style> holds markup, and "<![CDATA[" runs to "]]>"), so verify refuses them.
const RAW_TEXT = new Set(["script", "style", "title", "textarea", "xmp", "iframe", "noembed", "noframes", "noscript"]);
const FOREIGN = new Set(["svg", "math"]);
const isSpace = (c) => c === " " || c === "\t" || c === "\n" || c === "\f" || c === "\r";
const isLetter = (c) => c !== undefined && /[A-Za-z]/.test(c);
// The tokenizer lower-cases ASCII letters only.
const lower = (s) => s.replace(/[A-Z]+/g, (m) => m.toLowerCase());

// Where the text of a raw-text element `name` that starts at `from` ends: its end tag ("</name"
// in any case, then a space, "/" or ">"), or the end of the page.
function rawTextEnd(html, name, from) {
  for (let k = html.indexOf("</", from); k >= 0; k = html.indexOf("</", k + 2)) {
    const after = html[k + 2 + name.length];
    if (lower(html.slice(k + 2, k + 2 + name.length)) === name && after !== undefined && (isSpace(after) || after === "/" || after === ">")) return k;
  }
  return html.length;
}

// The page's tags as the browser's HTML tokenizer reads them: [{text, name, end, attrs}], the
// names with ASCII letters lower-cased. Comments ("<!--" to "-->" or "--!>"; "<!-->" and "<!--->" are empty),
// doctypes and other "<!", "<?" and "</" + non-letter declarations (to ">") are passed over,
// and so is the text of the raw-text elements. As in the browser, an attribute starts after a
// space or "/", or right after a quoted value with no space; a quoted value ends at its own
// quote only (it may hold ">" or "/"), an unquoted one at a space or ">"; a name ends at a
// space, "/", ">" or "=" (it may start with "="). A tag the page ends inside is kept.
function tags(html) {
  const out = [];
  const n = html.length;
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    i = lt + 1;
    if (html.startsWith("!--", i)) {
      const p = i + 3;
      if (html[p] === ">") i = p + 1;
      else if (html.startsWith("->", p)) i = p + 2;
      else {
        const a = html.indexOf("-->", p), b = html.indexOf("--!>", p);
        i = a >= 0 && (b < 0 || a < b) ? a + 3 : b >= 0 ? b + 4 : n;
      }
      continue;
    }
    const end = html[i] === "/";
    if (html[i] === "!" || html[i] === "?" || (end && i + 1 < n && html[i + 1] !== ">" && !isLetter(html[i + 1]))) {
      const gt = html.indexOf(">", i);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    if (end && html[i + 1] === ">") {
      i += 2; // "</>" is dropped
      continue;
    }
    const start = end ? i + 1 : i;
    if (!isLetter(html[start])) continue; // "<" before anything else is text
    let k = start;
    while (k < n && !isSpace(html[k]) && html[k] !== "/" && html[k] !== ">") k++;
    const name = lower(html.slice(start, k));
    const attrs = [];
    i = k;
    for (;;) {
      while (i < n && (isSpace(html[i]) || html[i] === "/")) i++;
      if (i >= n) break;
      if (html[i] === ">") {
        i++;
        break;
      }
      let e = i + 1;
      while (e < n && !isSpace(html[e]) && html[e] !== "/" && html[e] !== ">" && html[e] !== "=") e++;
      attrs.push(lower(html.slice(i, e)));
      i = e;
      while (i < n && isSpace(html[i])) i++;
      if (html[i] !== "=") continue;
      i++;
      while (i < n && isSpace(html[i])) i++;
      if (html[i] === '"' || html[i] === "'") {
        const close = html.indexOf(html[i], i + 1);
        i = close < 0 ? n : close + 1;
      } else {
        while (i < n && !isSpace(html[i]) && html[i] !== ">") i++;
      }
    }
    out.push({ text: html.slice(lt, i), name, end, attrs });
    if (end) continue;
    if (name === "plaintext") break;
    if (RAW_TEXT.has(name)) i = rawTextEnd(html, name, i);
  }
  return out;
}

function unescapeAttr(s) {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" })[e]);
}

// Whether the browser runs a <script> with these attributes: without a type, or with a
// JavaScript one. The worker's type="text/plain" element is a data block, never run or hashed.
function runs(attrs) {
  const m = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
  if (!m) return true;
  const type = (m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]).trim().toLowerCase();
  return ["", "text/javascript", "application/javascript", "module"].includes(type);
}

// A policy's directives in order: [{name, sources}].
function directives(text) {
  return text.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...sources] = d.split(/\s+/);
    return { name: name.toLowerCase(), sources };
  });
}

// How the policy a page carries differs from the one it must carry, as problems.
function policyProblems(actual, expected, { mode, scripts, plan, stylePolicy }) {
  if (actual === expected) return [];
  const out = [];
  const got = directives(actual), want = directives(expected);
  const seen = new Set();
  for (const g of got) {
    if (seen.has(g.name)) out.push(`the policy has ${g.name} more than once (the browser uses the first)`);
    seen.add(g.name);
  }
  const label = (i) => (plan[i] ? ` (${plan[i].label})` : "");
  for (const w of want) {
    const g = got.find((d) => d.name === w.name);
    if (!g) {
      out.push(`the policy lacks ${w.name}`);
      continue;
    }
    const missing = w.sources.filter((s) => !g.sources.includes(s));
    const extra = g.sources.filter((s) => !w.sources.includes(s));
    const isHash = (s) => /^'sha256-/.test(s);
    if (mode === "hash" && w.name === "script-src") {
      scripts.forEach((s, i) => {
        if (s.runs && missing.includes(hashSource(s.text))) out.push(`hash mode: script ${i + 1}${label(i)} is not listed in script-src`);
      });
      for (const m of missing) if (!isHash(m)) out.push(`script-src lacks ${m}`);
      for (const x of extra) {
        if (x === "'unsafe-inline'") out.push("hash mode: script-src allows 'unsafe-inline'");
        else if (isHash(x)) out.push(`script-src lists ${x}, which is the hash of no script the page runs`);
        else out.push(`script-src allows ${x}, which the policy must not`);
      }
    } else if (mode === "hash" && w.name === "style-src") {
      for (const m of missing) out.push(isHash(m) ? "hash mode: the <style> is not listed in style-src" : `style-src lacks ${m} (the style policy is ${JSON.stringify(stylePolicy)})`);
      for (const x of extra) {
        if (x === "'unsafe-inline'") out.push(`style-src allows 'unsafe-inline', but the style policy is ${JSON.stringify(stylePolicy)}`);
        else if (isHash(x)) out.push(`style-src lists ${x}, which is the hash of no <style> the page has`);
        else out.push(`style-src allows ${x}, which the policy must not`);
      }
    } else if (missing.length || extra.length) {
      out.push(`${w.name} is ${JSON.stringify(g.sources.join(" "))}, expected ${JSON.stringify(w.sources.join(" "))}`);
    }
    if (!missing.length && !extra.length && g.sources.join(" ") !== w.sources.join(" ")) {
      out.push(`${w.name} lists its sources in another order, or repeats one: ${JSON.stringify(g.sources.join(" "))}, expected ${JSON.stringify(w.sources.join(" "))}`);
    }
  }
  for (const g of got) if (!want.some((w) => w.name === g.name)) out.push(`the policy has ${g.name}, which it must not have`);
  if (!out.length) out.push(`the policy is ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)} (the directives in this order)`);
  return out;
}

// Hash mode, read from the page alone: policy() plays no part, so a fault in it cannot pass
// (policyProblems compares the page with policy(), which the build used too). The browser
// enforces the first script-src and the first style-src. Messages are policyProblems' wording
// for the same defect, so check() reports each once.
function listingProblems(csp, { scripts, plan, pdf, styleText, stylePolicy }) {
  const out = [];
  const got = directives(csp);
  const sources = (name) => (got.find((d) => d.name === name) || { sources: [] }).sources;
  const label = (i) => (plan[i] ? ` (${plan[i].label})` : "");
  const isHash = (s) => /^'sha256-/.test(s);
  const script = sources("script-src");
  const run = new Set(scripts.filter((s) => s.runs).map((s) => hashSource(s.text)));
  scripts.forEach((s, i) => {
    if (s.runs && !script.includes(hashSource(s.text))) out.push(`hash mode: script ${i + 1}${label(i)} is not listed in script-src`);
  });
  for (const x of script) {
    if (x === "'unsafe-inline'") out.push("hash mode: script-src allows 'unsafe-inline'");
    else if (isHash(x)) {
      if (!run.has(x)) out.push(`script-src lists ${x}, which is the hash of no script the page runs`);
    } else if (!(pdf && x === "blob:")) out.push(`script-src allows ${x}, which the policy must not`);
  }
  if (stylePolicy === "hash") {
    const style = sources("style-src"), want = hashSource(styleText);
    if (!style.includes(want)) out.push("hash mode: the <style> is not listed in style-src");
    for (const x of style) {
      if (x === want) continue;
      if (x === "'unsafe-inline'") out.push(`style-src allows 'unsafe-inline', but the style policy is ${JSON.stringify(stylePolicy)}`);
      else if (isHash(x)) out.push(`style-src lists ${x}, which is the hash of no <style> the page has`);
      else out.push(`style-src allows ${x}, which the policy must not`);
    }
  }
  return out;
}

function check(html, plan, { mode, pdf, stylePolicy, landing }) {
  const problems = [];
  try {
    checkMode(mode);
    checkStylePolicy(stylePolicy);
  } catch (e) {
    return [e.message];
  }

  // the browser hashes the text the build hashed
  if (html.includes("\r")) problems.push("the page holds a carriage return, which the browser turns into a line feed before it hashes a script or the style");
  if (html.includes("\0")) problems.push("the page holds a NUL character, which the browser replaces in script and style text before it hashes");
  const prescan = Buffer.from(html, "utf8").subarray(0, PRESCAN_BYTES).toString("latin1");
  if (!/<meta\s+charset\s*=\s*"?utf-8"?\s*\/?>/i.test(prescan)) problems.push(`the page does not declare <meta charset="utf-8"> in its first ${PRESCAN_BYTES} bytes, where the browser looks for its encoding`);

  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = re.exec(html))) scripts.push({ attrs: m[1], text: m[2], index: m.index, runs: runs(m[1]) });

  // the scripts are exactly the plan, in order, byte-equal to their sources
  if (scripts.length !== plan.length) problems.push(`the page has ${scripts.length} <script> elements, the plan ${plan.length}`);
  const n = Math.min(scripts.length, plan.length);
  for (let i = 0; i < n; i++) {
    const p = plan[i], s = scripts[i];
    const wantAttrs = p.kind === "text" ? ` type="text/plain" id="${p.id}"` : "";
    if (s.attrs !== wantAttrs) problems.push(`script ${i + 1} (${p.label}): attributes ${JSON.stringify(s.attrs)}, expected ${JSON.stringify(wantAttrs)}`);
    let source;
    try {
      source = p.code !== undefined ? p.code : fs.readFileSync(p.path, "utf8");
    } catch (e) {
      problems.push(`script ${i + 1} (${p.label}): source cannot be read (${e.code || e.message})`);
      continue;
    }
    if (s.text !== source) {
      let at = 0;
      while (at < s.text.length && s.text[at] === source[at]) at++;
      problems.push(`script ${i + 1} (${p.label}): text differs from its source at offset ${at} (${s.text.length} vs ${source.length} characters)`);
    }
  }

  // exactly one <style>, whose text the style hash covers (script bodies blanked first)
  const styles = [...blankScripts(html).matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi)];
  if (styles.length !== 1) problems.push(`the page has ${styles.length} <style> elements, expected 1`);
  const styleText = styles.length ? styles[0][2] : "";

  // exactly one CSP meta, inside <head>, before any script and the <style> (searched in the
  // markup, script and style bodies blanked)
  const markup = markupOnly(html);
  const metas = [...markup.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*>/gi)];
  const anyCsp = (markup.match(/http-equiv\s*=\s*["']?content-security-policy/gi) || []).length;
  if (metas.length !== 1 || anyCsp !== 1) problems.push(`expected exactly one Content-Security-Policy meta, found ${anyCsp}`);
  if (metas.length) {
    const csp = unescapeAttr(metas[0][1]);
    const at = metas[0].index;
    const firstScript = markup.search(/<script\b/i);
    if (firstScript >= 0 && at > firstScript) problems.push("the Content-Security-Policy meta comes after a <script>");
    const firstStyle = markup.search(/<style\b/i);
    if (firstStyle >= 0 && at > firstStyle) problems.push("the Content-Security-Policy meta comes after the <style>, so the policy does not govern it");
    const headOpen = markup.search(/<head\b[^>]*>/i), headClose = markup.search(/<\/head\s*>/i);
    if (!(headOpen >= 0 && headOpen < at && (headClose < 0 || at < headClose))) problems.push("the Content-Security-Policy meta is not inside <head>, so the browser ignores it");
    const list = csp.split(";").map((d) => d.trim());
    if (!list.includes("default-src 'none'")) problems.push("the policy lacks default-src 'none'");
    if (/https?:/i.test(csp)) problems.push("the policy names an http: or https: source");
    const expected = landing
      ? landingPolicy({ mode, styleText, stylePolicy })
      : policy(scripts.map((s) => ({ kind: s.runs ? "exec" : "text", text: s.text })), { pdf, mode, styleText, stylePolicy });
    problems.push(...policyProblems(csp, expected, { mode, scripts, plan, stylePolicy }));
    if (mode === "hash") problems.push(...listingProblems(csp, { scripts, plan, pdf, styleText, stylePolicy }));
  }

  // markup, read as the browser's tokenizer reads it: no inline handlers; no style attributes
  // in hash mode; no foreign content
  for (const t of tags(html)) {
    if (!t.end && FOREIGN.has(t.name)) problems.push(`the page has a <${t.name}> element: verify reads HTML content only, and the browser reads foreign content otherwise`);
    if (t.attrs.some((a) => /^on[a-z]+$/.test(a))) problems.push(`inline event handler in ${JSON.stringify(t.text.slice(0, 60))}`);
    if (mode === "hash" && t.attrs.includes("style")) problems.push(`hash mode: style attribute in ${JSON.stringify(t.text.slice(0, 60))}`);
  }

  if (pdf && !/isEvalSupported\s*:\s*false/.test(html)) problems.push("pdf is an input, but isEvalSupported: false is missing");
  return [...new Set(problems)];
}

function verify(html, plan, { mode = DEFAULT_CSP_MODE, pdf = null, stylePolicy = STYLE_POLICY } = {}) {
  const isPdf = pdf !== null ? pdf : plan.some((p) => p.n === "1");
  return check(html, plan, { mode, pdf: isPdf, stylePolicy, landing: false });
}

function verifyLanding(html, { mode = DEFAULT_CSP_MODE, stylePolicy = STYLE_POLICY } = {}) {
  return check(html, [], { mode, pdf: false, stylePolicy, landing: true });
}

module.exports = { DEFAULT_CSP_MODE, STYLE_POLICY, LEGACY_PDF, LEGACY_OTHER, PRESCAN_BYTES, policy, landingPolicy, hashSource, verify, verifyLanding, tags };
