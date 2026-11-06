// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The provider table of README.md (docs/ARCHITECTURE.md, output layout). The build writes it
// between two marker comments from the published providers' descriptors: the same rows as the
// landing page, in the same order, so the README can never list another set of providers.
//
//   renderReadme(text, providers) -> the README text with the table between START and END
//     replaced. providers: [{id, D}] (normalized descriptors; the caller passes the published
//     ones). Throws when a marker is missing, repeated or out of order.
//   START, END   the marker comments
//   SITE         the Pages site; each converter is at SITE + "<id>/"
"use strict";

const { byName } = require("./landing.js");

const SITE = "https://ycsin.github.io/statement2csv/";
const START = "<!-- providers:start -->";
const END = "<!-- providers:end -->";

// One table cell: whitespace collapsed, "|" escaped.
const cell = (s) => String(s).replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");

function renderReadme(text, providers) {
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < 0) throw new Error(`README.md: no ${a < 0 ? START : END} marker`);
  if (b < a || text.indexOf(START, a + 1) >= 0 || text.indexOf(END, b + 1) >= 0) throw new Error(`README.md: ${START} and ${END} must appear once, in that order`);
  const host = SITE.replace(/^https?:\/\//, "");
  const rows = [...providers].sort(byName).map((p) => `| ${cell(p.D.name)} | ${cell(p.D.summary)} | [${host}${p.id}/](${SITE}${p.id}/) |`);
  const table = ["| Provider | Statements | Converter |", "|---|---|---|", ...rows].join("\n");
  return `${text.slice(0, a + START.length)}\n${table}\n${text.slice(b)}`;
}

module.exports = { renderReadme, START, END, SITE };
