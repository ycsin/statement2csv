// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Lint: pin sentinels (docs/TESTING.md, lints). A pin in test/contract/provenance.js may declare
// sentinels: [{line, contains}], text that must stay on that line of the pinned file (such as
// an invisible character that an editor could drop). The provenance hash catches the same
// change; this lint names it directly, with its own message, and names no provider.
//
//   check(root) -> [{file, line, col, rule, message}]
"use strict";

const fs = require("fs");
const path = require("path");
const { REPO } = require("./files.js");

function check(root) {
  root = path.resolve(root);
  const prov = require(path.join(REPO, "tools", "provenance.js"));
  let pins;
  try {
    pins = prov.loadPins(root);
  } catch (e) {
    if (!fs.existsSync(path.join(root, ...prov.PIN_LIST.split("/")))) return [];
    return [{ file: prov.PIN_LIST, line: 1, col: 1, rule: "sentinel", message: `the pin list cannot be loaded: ${e.message}` }];
  }
  const findings = [];
  for (const pin of Array.isArray(pins) ? pins : []) {
    if (!pin || !Array.isArray(pin.sentinels) || typeof pin.path !== "string") continue;
    let buf;
    try {
      buf = fs.readFileSync(path.join(root, ...pin.path.split("/")));
    } catch (e) {
      findings.push({ file: pin.path, line: 1, col: 1, rule: "sentinel", message: `pinned file with sentinels cannot be read (${e.code || e.message})` });
      continue;
    }
    for (const s of pin.sentinels) {
      for (const p of prov.sentinelProblems({ path: pin.path, sentinels: [s] }, buf)) {
        findings.push({ file: pin.path, line: Number.isInteger(s.line) ? s.line : 1, col: 1, rule: "sentinel", message: p.replace(`${pin.path}: `, "") });
      }
    }
  }
  return findings;
}

module.exports = { check };
