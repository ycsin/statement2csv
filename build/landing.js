// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The landing page dist/index.html: no script, one link per published provider, sorted by
// name in code-point order.
//
//   renderLanding(providers, {root, mode}) -> html
//     providers: [{id, D}] (normalized descriptors; the caller passes the published ones).
"use strict";

const fs = require("fs");
const path = require("path");
const { fill, esc } = require("./page.js");
const { landingPolicy } = require("./csp.js");
const { guard } = require("./scripts.js");

function renderLanding(providers, { root, mode } = {}) {
  const pageDir = path.join(root, "core", "page");
  const skeleton = fs.readFileSync(path.join(pageDir, "landing.html"), "utf8");
  const style = readStyle(path.join(pageDir, "style.css"));
  const items = [...providers]
    .sort((a, b) => (a.D.name < b.D.name ? -1 : a.D.name > b.D.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) => `    <li><a href="${esc(p.id)}/">${esc(p.D.name)}</a> — ${esc(p.D.summary)}</li>\n`)
    .join("");
  const styleText = styleElementText(skeleton, style);
  return fill(skeleton, { csp: landingPolicy({ mode, styleText }), style, items });
}

// The stylesheet, guarded like a script piece (and against "</style").
function readStyle(file) {
  const text = fs.readFileSync(file, "utf8");
  if (text.charCodeAt(0) === 0xfeff) throw new Error(`${path.basename(file)}: starts with a byte order mark`);
  if (/<\/style/i.test(text)) throw new Error(`${path.basename(file)}: contains "</style"`);
  return guard(text, path.basename(file));
}

// The exact text of the page's <style> element once {{style}} is filled in: what the CSP
// style hash covers.
function styleElementText(skeleton, style) {
  const m = /<style>([\s\S]*?)<\/style>/.exec(skeleton);
  if (!m) throw new Error("skeleton has no <style> element");
  const parts = m[1].split("{{style}}");
  if (parts.length !== 2) throw new Error("the skeleton's <style> must hold {{style}} exactly once");
  return parts[0] + style + parts[1];
}

module.exports = { renderLanding, readStyle, styleElementText };
