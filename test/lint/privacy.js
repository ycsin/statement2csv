// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Lint: nothing private in the tree (docs/TESTING.md, lints; private data rules).
//
//   check(root, {files, denylist, pinned}) -> [{file, line, col, rule, message}]
//     denylist: string[] | null (default: privateList("S2C_DENYLIST", "denylist.txt"))
//     pinned:   Set of paths that are pinned and match their pin (default: from
//               tools/provenance.js pinnedFiles on root's pin list)
//
// Every listed file except vendor/** is read as UTF-8 text (a binary or non-UTF-8 file is
// reported: nothing in the tree is expected to be one). Rules:
//   home      no absolute home-directory path in Linux, macOS or Windows form, and no tilde
//             path: machine paths are computed at run time, docs write placeholders
//   email     no e-mail address
//   number    no number in either account-number format (3-4 digits, 5-8 digits, 1 digit, or
//             6 digits, 6 digits, separated by dashes)
//   denylist  no line of the untracked personal denylist, as a case-insensitive substring
// Exemptions, each narrow:
//   - every occurrence of the exact SPDX copyright string is blanked out before the email and
//     denylist rules, so the name and the address are allowed there and nowhere else;
//   - pinned files (path in the pin list and sha256 matching) and dist/** are exempt from the
//     number rule only: the former are proven byte copies of public files, the latter holds only
//     linted sources and vendor/;
//   - nothing is exempt from the home and denylist rules.
// Findings never quote what matched: a denylist hit names the entry by its number only.
// The patterns are built from escapes, so this file holds no literal match of its own rules.
"use strict";

const path = require("path");
const { readText, lineCol, privateList, COPYRIGHT, REPO } = require("./files.js");

const HOME = new RegExp([
  "\\/home\\/",
  "\\/Users\\/",
  "[A-Za-z]:\\\\[Uu][Ss][Ee][Rr][Ss]\\\\",
  "~\\/[\\w.$%{-]",
].join("|"), "g");
const EMAIL = new RegExp("[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,}", "g");
const NUMBER = new RegExp("\\b\\d{3,4}-\\d{5,8}-\\d\\b|\\b\\d{6}-\\d{6}\\b", "g");

const RULE_TEXT = {
  home: "an absolute home-directory path or a tilde path: compute machine paths at run time; docs use placeholders such as <old-root>",
  email: "an e-mail address (only the one in the SPDX copyright line is allowed)",
  number: "a number in an account-number format",
};

// The text with every copyright string replaced by spaces of the same length (positions kept).
function blankCopyright(text) {
  return text.split(COPYRIGHT).join(" ".repeat(COPYRIGHT.length));
}

function pinnedSet(root) {
  try {
    const prov = require(path.join(REPO, "tools", "provenance.js"));
    return new Set(prov.pinnedFiles({ root }).filter((f) => f.matches).map((f) => f.path));
  } catch {
    return new Set();
  }
}

function scan(text, re, rule, rel, out) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    const { line, col } = lineCol(text, m.index);
    out.push({ file: rel, line, col, rule, message: RULE_TEXT[rule] });
  }
}

function check(root, { files, denylist, pinned } = {}) {
  root = path.resolve(root);
  const deny = denylist === undefined ? privateList("S2C_DENYLIST", "denylist.txt") : denylist;
  const lowered = (deny || []).map((d) => d.toLowerCase());
  const pins = pinned || pinnedSet(root);
  const findings = [];
  for (const rel of files) {
    if (rel.startsWith("vendor/")) continue;
    const r = readText(root, rel);
    if (!r.ok) {
      findings.push({ file: rel, line: 1, col: 1, rule: "text", message: `${r.why}; the privacy lint reads every file as text` });
      continue;
    }
    scan(r.text, HOME, "home", rel, findings);
    if (!(rel.startsWith("dist/") || pins.has(rel))) scan(r.text, NUMBER, "number", rel, findings);
    const blanked = blankCopyright(r.text);
    scan(blanked, EMAIL, "email", rel, findings);
    if (lowered.length) {
      const low = blanked.toLowerCase();
      lowered.forEach((entry, k) => {
        for (let at = low.indexOf(entry); at !== -1; at = low.indexOf(entry, at + 1)) {
          const { line, col } = lineCol(low, at);
          findings.push({ file: rel, line, col, rule: "denylist", message: `matches entry ${k + 1} of the untracked denylist` });
        }
      });
    }
  }
  return findings;
}

module.exports = { check, blankCopyright, HOME, EMAIL, NUMBER };
