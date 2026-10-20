// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Waivers of the golden comparison (docs/TESTING.md, comparison and waivers). Two categories:
//   - UI waivers (W1-W3) normalise what the old page shows before it is compared with a new
//     page. They never touch downloads or storage.
//   - Download exceptions: exactly one member, SX1, limited to the S-break scenarios.
// There is never a storage waiver. Waivers apply only when an old page's golden is compared
// with a new page; two runs of the same page (G1 determinism) are compared with no waiver.
// Nothing here names a provider: legacy markup comes from frozen.legacyDom.
"use strict";

const { STANDARD_DOM } = require("../lib/page-driver.js");

// W1: the only v1 text change of the pages. The old QIF help item expands the abbreviation into
// a finance-app name; the new pages say "a QIF file". Static page snapshot only.
const W1 = Object.freeze({
  id: "W1",
  category: "ui",
  scope: "static",
  from: "a Quicken Interchange Format file",
  to: "a QIF file",
});

// W2: from M9 a parse exception is caught and shown. Allowed only in the page instances listed
// here (by their C value), from the first step where the old page's parse threw onwards: on that
// step the new page shows the error line and a hidden busy line instead of the stuck one; on
// later steps the old page's busy line stays stuck while the new page's is hidden. Downloads and
// storage must still match. `reviewed` lists further page ids accepted after review (none).
const W2 = Object.freeze({
  id: "W2",
  category: "ui",
  scope: "busy line and status, from the throwing step on",
  cValues: Object.freeze(["C-seed-badname"]),
  reviewed: Object.freeze([]),
  errorLine: /<p class="warn">Could not read these statements: [^<]*<\/p>/,
});

// W3: markup normalisations. A legacy configurator's ids and row class (frozen.legacyDom) are
// mapped to the standard ones, and the old inline style attribute of #empty is dropped from the
// static snapshot (the new stylesheet carries the rule).
const W3 = Object.freeze({
  id: "W3",
  category: "ui",
  scope: "legacy configurator markup; #empty style attribute (static snapshot)",
  emptyStyle: /(<[a-z]+\b[^>]*?\sid="empty"[^>]*?)\sstyle="margin-top: ?24px;?"/,
});

// SX1: markup-breaking payloads (from M8, S-break scenarios only). The old page's Download all
// follows its broken DOM there, so the new page's downloads are not compared with the old
// page's; its Download-all entries must equal the replayed allFiles() and its other downloads
// the downloads hook's rebuild instead. S-break is new page only (design §6.7.5): run.js never
// runs it on the old page and checks it on the new page alone (checkNewOnly), with one SX1 use
// counted per step. Download all = allFiles() holds for account names and portfolio ids that
// an attribute value gives back (data-account, data-id): all but those with CR or NUL, which
// the new page, like the old ones, cannot key (docs/MIGRATION.md decisions 64 and 176; no
// scenario holds one).
const SX1 = Object.freeze({
  id: "SX1",
  category: "download",
  cValues: Object.freeze(["S-break"]),
});

const UI_WAIVERS = Object.freeze([W1, W2, W3]);
const DOWNLOAD_EXCEPTIONS = Object.freeze([SX1]);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The [legacy, standard] selector pairs of a legacyDom, e.g. ["#list-old", "#config-list"].
function legacyPairs(legacyDom) {
  if (!legacyDom) return [];
  return Object.keys(STANDARD_DOM)
    .filter((k) => typeof legacyDom[k] === "string" && legacyDom[k] !== STANDARD_DOM[k])
    .map((k) => [legacyDom[k], STANDARD_DOM[k]]);
}

// W3 on serialised markup: id="<old>" becomes id="<new>" for "#" selectors, and the class token
// <old> becomes <new> for "." selectors. Only exact attribute values and whole class tokens
// change; text content is never touched.
function mapLegacyMarkup(html, legacyDom) {
  if (html == null) return html;
  let out = html;
  for (const [from, to] of legacyPairs(legacyDom)) {
    if (from[0] === "#" && to[0] === "#") {
      const re = new RegExp(`(\\sid=")${escapeRe(from.slice(1))}(")`, "g");
      out = out.replace(re, (m, a, b) => `${a}${to.slice(1)}${b}`);
    } else if (from[0] === "." && to[0] === ".") {
      const oldToken = from.slice(1);
      const newToken = to.slice(1);
      out = out.replace(/(\sclass=")([^"]*)(")/g, (m, a, v, b) => `${a}${v.split(" ").map((t) => (t === oldToken ? newToken : t)).join(" ")}${b}`);
    } else {
      throw new Error(`W3: cannot map selector ${from} to ${to}`);
    }
  }
  return out;
}

// The old page's static snapshot as the new page must show it: W1, then W3.
function normaliseStatic(html, { legacyDom = null } = {}) {
  if (html == null) return html;
  const w1 = html.split(W1.from).join(W1.to);
  return mapLegacyMarkup(w1, legacyDom).replace(W3.emptyStyle, "$1");
}

// One html part of the old page's UI snapshot (status, cards, diagnostics, configurator list)
// as the new page must show it: W3.
function normaliseUiPart(html, { legacyDom = null } = {}) {
  return mapLegacyMarkup(html, legacyDom);
}

// Whether W2 may apply to a page instance: its C value is listed, or its id was reviewed.
function w2Eligible(page) {
  return !!page && (W2.cValues.includes(page.c) || W2.reviewed.includes(page.id));
}

// The new page's #status on the throwing step, without the W2 error line. An empty result
// (only the empty count paragraph left over) equals the old page's empty status. Without an
// error line nothing is left over, and the status is compared as it is.
function stripW2Status(status, oldStatus) {
  if (status == null) return status;
  const stripped = status.replace(W2.errorLine, "");
  if (stripped === status) return status;
  return stripped === "<p></p>" && oldStatus === "" ? "" : stripped;
}

function sx1Applies(page) {
  return !!page && SX1.cValues.includes(page.c);
}

module.exports = {
  W1,
  W2,
  W3,
  SX1,
  UI_WAIVERS,
  DOWNLOAD_EXCEPTIONS,
  legacyPairs,
  mapLegacyMarkup,
  normaliseStatic,
  normaliseUiPart,
  w2Eligible,
  stripW2Status,
  sx1Applies,
};
