// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Page templating (docs/ARCHITECTURE.md, templating) and page.html slots (docs/CONTRACT.md).
//
//   fill(template, values)              one pass over {{token}}s (a letter, then letters or
//                                       digits, as in {{h1}}) with a function replacer:
//                                       inserted text is never rescanned and "$&", "$1" in it
//                                       are never expanded. Unknown tokens, unused values and
//                                       malformed "{{" in the template are errors.
//   parseSlots(html)                    -> {slots: {name: raw content}, errors}
//   expandPartials(text, partialsDir)   -> {text, errors}: {{> name}} -> partials/<name>.html
//   lintSlots(slots, {configurator, toolbar}) -> errors (check C16)
//   readPageHtml(file, {partialsDir, configurator, toolbar}) -> {slots, errors}: all three
//   pageValues(D, slots, {csp, style, scripts}) -> the skeleton's token values
//   esc(s)                              HTML escape of & < > " '
"use strict";

const fs = require("fs");
const path = require("path");

// Slot table: kind, whether it is required, its default, and the skeleton token it fills.
// required: true | false | "configurator" (required iff the page has a configurator).
const SLOTS = {
  "title": { kind: "text", required: false, token: "title" },
  "h1": { kind: "text", required: true, token: "h1" },
  "lede": { kind: "inline", required: true, token: "lede" },
  "drop-title": { kind: "text", required: true, token: "dropTitle" },
  "drop-help": { kind: "text", required: true, token: "dropHelp" },
  "empty": { kind: "text", required: false, default: "No statements yet.", token: "empty" },
  "mode-label": { kind: "text", required: true, token: "modeLabel" },
  "hint": { kind: "inline", required: true, token: "hint" },
  "config-summary": { kind: "text", required: false, default: "Accounts", needs: "configurator" },
  "config-help": { kind: "inline", required: "configurator", needs: "configurator" },
  "accounts-title": { kind: "attribute", required: false, default: "One row per account: account type, name, starting balance and date", needs: "accounts" },
  "combined-title": { kind: "attribute", required: false, default: "All accounts in one file with an account column, for multi-account imports", needs: "combined" },
  "help-items": { kind: "list", required: true, token: "helpItems" },
  "help-extra": { kind: "block", required: false, default: "", token: "helpExtra" },
};

const ALLOWED_TAGS = new Set(["em", "strong", "code", "br", "span", "ul", "ol", "li", "p", "details", "summary"]);

const ACCEPT = {
  pdf: "application/pdf,.pdf",
  csv: "text/csv,.csv",
  xlsx: ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const NOTICE_LINE = "  Includes PDF.js (Mozilla Foundation, Apache-2.0), see NOTICE.\n";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- fill ----------

function fill(template, values) {
  const t = String(template);
  const bad = /\{\{(?![A-Za-z][A-Za-z0-9]*\}\})/.exec(t);
  if (bad) throw new Error(`template: malformed token at offset ${bad.index}: ${JSON.stringify(t.slice(bad.index, bad.index + 24))}`);
  const used = new Set();
  const out = t.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (_, k) => {
    if (!Object.prototype.hasOwnProperty.call(values, k)) throw new Error(`template: unknown token {{${k}}}`);
    const v = values[k];
    if (typeof v !== "string") throw new Error(`template: value of {{${k}}} must be a string`);
    used.add(k);
    return v;
  });
  const unused = Object.keys(values).filter((k) => !used.has(k));
  if (unused.length) throw new Error(`template: unused value(s): ${unused.join(", ")}`);
  return out;
}

// ---------- page.html ----------

// Leading lines that are whole HTML comments (the SPDX header) are dropped.
function stripHeaderComments(text) {
  const lines = String(text).split("\n");
  let i = 0;
  while (i < lines.length && /^\s*<!--.*-->\s*$/.test(lines[i])) i++;
  return lines.slice(i).join("\n");
}

function parseSlots(html) {
  const errors = [];
  const slots = {};
  let s = stripHeaderComments(html);
  if (s.charCodeAt(0) === 0xfeff) errors.push("starts with a byte order mark");
  if (s.includes("\r")) errors.push("contains a carriage return");
  let i = 0;
  const open = /<template data-slot="([^"]*)">/y;
  while (i < s.length) {
    const ws = /\s*/y;
    ws.lastIndex = i;
    ws.exec(s);
    i = ws.lastIndex;
    if (i >= s.length) break;
    open.lastIndex = i;
    const m = open.exec(s);
    if (!m) {
      errors.push(`expected <template data-slot="name"> at line ${s.slice(0, i).split("\n").length}, found ${JSON.stringify(s.slice(i, i + 30))}`);
      break;
    }
    const name = m[1];
    const close = s.indexOf("</template>", open.lastIndex);
    if (close < 0) {
      errors.push(`slot ${JSON.stringify(name)}: no </template>`);
      break;
    }
    const content = s.slice(open.lastIndex, close);
    if (/<template\b/i.test(content)) errors.push(`slot ${JSON.stringify(name)}: templates may not be nested`);
    if (Object.prototype.hasOwnProperty.call(slots, name)) errors.push(`slot ${JSON.stringify(name)} appears twice`);
    slots[name] = content;
    i = close + "</template>".length;
  }
  return { slots, errors };
}

function expandPartials(text, partialsDir) {
  const errors = [];
  const out = String(text).replace(/^([ \t]*)\{\{>\s*([^}\s]*)\s*\}\}|\{\{>\s*([^}\s]*)\s*\}\}/gm, (all, indent, n1, n2) => {
    const name = n1 !== undefined ? n1 : n2;
    const lead = n1 !== undefined ? indent : "";
    if (!/^[a-z0-9-]+$/.test(name || "")) {
      errors.push(`bad partial name ${JSON.stringify(name)}`);
      return all;
    }
    let body;
    try {
      body = fs.readFileSync(path.join(partialsDir, `${name}.html`), "utf8");
    } catch {
      errors.push(`unknown partial ${JSON.stringify(name)} (no core/page/partials/${name}.html)`);
      return all;
    }
    const lines = stripHeaderComments(body).replace(/\n+$/, "").split("\n");
    return lead + lines.join(`\n${lead}`);
  });
  return { text: out, errors };
}

// Removes leading and trailing blank lines and the common indentation, then indents every
// non-blank line with `indent`.
function reindent(text, indent) {
  const lines = String(text).split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const widths = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length);
  const cut = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => (l.trim() ? indent + l.slice(cut).replace(/\s+$/, "") : "")).join("\n");
}

function lintSlots(slots, { configurator = true, toolbar = ["accounts", "combined"] } = {}) {
  const errors = [];
  const present = (k) => Object.prototype.hasOwnProperty.call(slots, k);
  for (const name of Object.keys(slots)) {
    const spec = SLOTS[name];
    if (!spec) {
      errors.push(`unknown slot ${JSON.stringify(name)}`);
      continue;
    }
    if (spec.needs === "configurator" && !configurator) errors.push(`slot ${JSON.stringify(name)} is not used: this page has no configurator`);
    if ((spec.needs === "accounts" || spec.needs === "combined") && !toolbar.includes(spec.needs)) {
      errors.push(`slot ${JSON.stringify(name)} is not used: this page has no #${spec.needs} button`);
    }
    const v = slots[name];
    const at = `slot ${JSON.stringify(name)}`;
    if (v.includes("<!--")) errors.push(`${at}: HTML comments are not allowed in slots`);
    if (/\{\{/.test(v)) errors.push(`${at}: leftover {{…}} (partials are written {{> name}})`);
    if (spec.kind === "text" || spec.kind === "attribute") {
      if (v.includes("<")) errors.push(`${at}: a ${spec.kind} slot may not contain "<"`);
      if (spec.kind === "attribute" && v.includes('"')) errors.push(`${at}: an attribute slot may not contain '"'`);
      if (!v.trim()) errors.push(`${at}: is empty`);
      continue;
    }
    if (/<\s*\/?\s*(script|style)\b/i.test(v)) errors.push(`${at}: <script> and <style> are never allowed`);
    const tagRe = /<[^>]*>?/g;
    let m;
    while ((m = tagRe.exec(v))) {
      const tag = m[0];
      const t = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^\s>]+)*)\s*>$/.exec(tag.replace(/\s*\/>$/, ">"));
      if (!t) {
        if (!tag.startsWith("<!--")) errors.push(`${at}: not an allowed tag: ${JSON.stringify(tag.slice(0, 40))} (write a literal < as &lt;)`);
        continue;
      }
      const [, closing, rawName, attrs] = t;
      const name = rawName.toLowerCase();
      if (!ALLOWED_TAGS.has(name)) errors.push(`${at}: tag <${rawName}> is not allowed (allowed: ${[...ALLOWED_TAGS].join(" ")})`);
      const a = attrs.trim();
      if (/\bon[a-z]+\s*=/i.test(a) || /\bhref\b/i.test(a) || /\bsrc\b/i.test(a) || /\bstyle\s*=/i.test(a)) {
        errors.push(`${at}: event handlers, href, src and style attributes are never allowed: ${JSON.stringify(tag.slice(0, 60))}`);
      } else if (a && !(name === "span" && !closing && a === 'class="muted"')) {
        errors.push(`${at}: the only attribute allowed is class="muted" on <span>: ${JSON.stringify(tag.slice(0, 60))}`);
      }
    }
    const body = v.trim();
    if (spec.kind === "list" && !(body.startsWith("<li>") && body.endsWith("</li>"))) errors.push(`${at}: must be a list of <li> items`);
    if (spec.kind === "block" && body && !(body.startsWith("<details>") && body.endsWith("</details>"))) errors.push(`${at}: must be <details> blocks`);
    if (spec.kind !== "block" && !body) errors.push(`${at}: is empty`);
  }
  for (const [name, spec] of Object.entries(SLOTS)) {
    const req = spec.required === true || (spec.required === "configurator" && configurator);
    if (req && !present(name)) errors.push(`missing required slot ${JSON.stringify(name)}`);
  }
  return errors;
}

function readPageHtml(file, { partialsDir, configurator = true, toolbar = ["accounts", "combined"] } = {}) {
  let html;
  try {
    html = fs.readFileSync(file, "utf8");
  } catch (e) {
    return { slots: {}, errors: [`cannot be read (${e.code || e.message})`] };
  }
  const { slots: raw, errors } = parseSlots(html);
  const slots = {};
  for (const [name, content] of Object.entries(raw)) {
    const r = expandPartials(content, partialsDir);
    errors.push(...r.errors.map((m) => `slot ${JSON.stringify(name)}: ${m}`));
    slots[name] = r.text;
  }
  errors.push(...lintSlots(slots, { configurator, toolbar }));
  return { slots, errors };
}

// ---------- token values ----------

const hasConfigurator = (D) => D.app !== "custom" || !!(D.custom && D.custom.config);
const toolbarOf = (D) => (D.app !== "custom" ? ["accounts", "combined"] : ["accounts", "combined"].filter((b) => (D.custom.toolbar || []).includes(b)));

function pageValues(D, slots, { csp, style, scripts }) {
  const slot = (name) => {
    if (Object.prototype.hasOwnProperty.call(slots, name)) {
      const k = SLOTS[name].kind;
      if (k === "list") return reindent(slots[name], "        ");
      if (k === "block") {
        const r = reindent(slots[name], "    ");
        return r ? `${r}\n` : "";
      }
      return slots[name].trim();
    }
    if (name === "title") return esc(`${D.name} Statement Converter`);
    if (SLOTS[name].default !== undefined) return SLOTS[name].default;
    throw new Error(`page.html: missing slot ${JSON.stringify(name)}`);
  };
  const toolbar = toolbarOf(D);
  const buttons = {
    accounts: `      <button id="accounts" title="${slot("accounts-title")}">Accounts CSV</button>\n`,
    combined: `      <button id="combined" title="${slot("combined-title")}">Combined CSV</button>\n`,
  };
  const config = hasConfigurator(D)
    ? "    <details class=\"config\">\n" +
      `      <summary>${slot("config-summary")} <span id="config-count" class="muted"></span></summary>\n` +
      `      <p class="muted">${slot("config-help")}</p>\n` +
      "      <div id=\"config-list\"></div>\n" +
      "      <button id=\"config-reset\">Reset to detected</button>\n" +
      "    </details>\n"
    : "";
  return {
    noticeLine: D.inputs.includes("pdf") ? NOTICE_LINE : "",
    csp,
    title: slot("title"),
    style,
    h1: slot("h1"),
    lede: slot("lede"),
    dropTitle: slot("drop-title"),
    dropHelp: slot("drop-help"),
    accept: D.inputs.map((x) => ACCEPT[x]).join(","),
    multiple: D.multiple ? " multiple" : "",
    empty: slot("empty"),
    modeLabel: slot("mode-label"),
    modeButtons: D.modes.map((m) => `          <button role="radio" data-mode="${esc(m.id)}">${esc(m.label)}</button>\n`).join(""),
    toolbarButtons: toolbar.map((b) => buttons[b]).join(""),
    hint: slot("hint"),
    config,
    helpItems: slot("help-items"),
    helpExtra: slot("help-extra"),
    scripts,
  };
}

module.exports = {
  SLOTS,
  ALLOWED_TAGS,
  ACCEPT,
  esc,
  fill,
  parseSlots,
  expandPartials,
  reindent,
  lintSlots,
  readPageHtml,
  pageValues,
  hasConfigurator,
  toolbarOf,
  stripHeaderComments,
};
