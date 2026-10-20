// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Lint: generic text (requirement 7, principle P3; docs/TESTING.md, lints).
//
//   check(root, {files, apps, providers}) -> [{file, line, col, rule, message}]
//     apps:      string[] | null (default: privateList("S2C_APPS", "apps.txt"))
//     providers: providerFacts(root) by default
//
// Two rules:
//   app-name       Pages and docs (dist/**, core/page/**, providers/*/page.html,
//                  providers/*/README.md, README.md, NOTICE, docs/**) name no finance app: not
//                  the first word of the old QIF expansion (any case), and no entry of the
//                  untracked app list, as a whole word, case-sensitively. test/legacy/ is not in
//                  this scope: its verbatim copies keep the old wording in comments.
//   provider-name  Shared code, tests and top-level texts (core/**, build/**, tools/**, test/**
//                  apart from test/legacy/** and the pin list test/contract/provenance.js,
//                  .github/**, README.md, NOTICE) do not contain the name, brand, trimmed
//                  account prefix or legacyRepo of any provider that is not a skeleton, as a
//                  whole word, case-sensitively. Ids are not matched (an id can be an ordinary
//                  word). This is what keeps every test provider-neutral; shared code cites old
//                  code through the derivation map in docs/MIGRATION.md. providers/, docs/,
//                  test/legacy/ and dist/ are outside this scope.
// Findings never quote an app-list entry (it is untracked): it is named by its number only.
"use strict";

const path = require("path");
const { readText, lineCol, privateList, providerFacts } = require("./files.js");

const OLD_QIF_WORD = new RegExp("\\bquicken\\b", "gi");
const WORD = /[A-Za-z0-9_]/;

function inPagesAndDocs(rel) {
  return rel.startsWith("dist/") || rel.startsWith("core/page/") || rel.startsWith("docs/") || rel === "README.md" || rel === "NOTICE"
    || /^providers\/[^/]+\/(page\.html|README\.md)$/.test(rel);
}

function inShared(rel) {
  if (rel === "README.md" || rel === "NOTICE") return true;
  if (rel.startsWith("test/legacy/") || rel === "test/contract/provenance.js") return false;
  return /^(core|build|tools|test|\.github)\//.test(rel);
}

// Every whole-word, case-sensitive occurrence of `word` in `text`.
function wholeWord(text, word) {
  const out = [];
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    const before = at > 0 ? text[at - 1] : "";
    const after = text[at + word.length] || "";
    const edge = (c, w) => c === "" || !WORD.test(c) || !WORD.test(w);
    if (edge(before, word[0]) && edge(after, word[word.length - 1])) out.push(at);
  }
  return out;
}

function check(root, { files, apps, providers } = {}) {
  root = path.resolve(root);
  const appList = apps === undefined ? privateList("S2C_APPS", "apps.txt") : apps;
  const facts = (providers || providerFacts(root)).filter((p) => !p.skeleton);
  const findings = [];
  for (const rel of files) {
    const pages = inPagesAndDocs(rel), shared = inShared(rel);
    if (!pages && !shared) continue;
    const r = readText(root, rel);
    if (!r.ok) continue; // the privacy lint reports files that are not text
    const text = r.text;
    if (pages) {
      OLD_QIF_WORD.lastIndex = 0;
      let m;
      while ((m = OLD_QIF_WORD.exec(text))) {
        const { line, col } = lineCol(text, m.index);
        findings.push({ file: rel, line, col, rule: "app-name", message: "names a finance app (the old QIF expansion): write \"a QIF file\"" });
      }
      (appList || []).forEach((name, k) => {
        for (const at of wholeWord(text, name)) {
          const { line, col } = lineCol(text, at);
          findings.push({ file: rel, line, col, rule: "app-name", message: `names a finance app: entry ${k + 1} of the untracked app list` });
        }
      });
    }
    if (shared) {
      for (const p of facts) {
        for (const { field, value } of p.names) {
          for (const at of wholeWord(text, value)) {
            const { line, col } = lineCol(text, at);
            findings.push({ file: rel, line, col, rule: "provider-name", message: `names provider ${p.id} (its ${field}): shared code and tests stay provider-neutral` });
          }
        }
      }
    }
  }
  return findings;
}

module.exports = { check, inPagesAndDocs, inShared, wholeWord };
