// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Runs every lint (docs/TESTING.md, lints) over the files a commit of the tree would hold.
//
//   node test/lint/run.js [--root <dir>] [--only <lint>[,<lint>...]] [--enforce-sinks]
//
// Lints: headers (contract check C17), privacy, generic, sinks, sentinels, invisible. Every
// finding fails the run, except those of a sinks rule listed in test/lint/sinks.js REPORT_ONLY
// (empty since migration step M8, which enforced the innerHTML rule): such a finding carries
// reportOnly: true and is printed as a note, and --enforce-sinks makes it count. Each finding
// is printed as "<file>:<line>:<col> [<lint>/<rule>] <message>"; no finding quotes private
// text. Exit status: 0 clean, 1 findings, 2 usage.
//
//   runLints(root, {only, enforceSinks, denylist, apps}) -> {files, source, results: [{name,
//     findings, failing}], failed}   (failing: the findings that count)
"use strict";

const path = require("path");
const { listFiles, providerFacts, REPO } = require("./files.js");

const LINTS = ["headers", "privacy", "generic", "sinks", "sentinels", "invisible"];

function runLints(root, { only = null, enforceSinks = false, denylist, apps } = {}) {
  root = path.resolve(root);
  const { files, source } = listFiles(root);
  const providers = providerFacts(root);
  const want = only ? LINTS.filter((l) => only.includes(l)) : LINTS;
  const results = [];
  for (const name of want) {
    const lint = require(`./${name}.js`);
    let findings;
    if (name === "privacy") findings = lint.check(root, { files, denylist });
    else if (name === "generic") findings = lint.check(root, { files, apps, providers });
    else if (name === "sinks") findings = lint.check(root, { files, providers });
    else if (name === "sentinels") findings = lint.check(root);
    else findings = lint.check(root, { files });
    const failing = findings.filter((f) => enforceSinks || !f.reportOnly);
    results.push({ name, findings, failing });
  }
  return { files, source, results, failed: results.some((r) => r.failing.length) };
}

function parseArgs(argv) {
  const o = { root: REPO, only: null, enforceSinks: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--root") o.root = path.resolve(value());
    else if (a === "--only") {
      o.only = value().split(",").map((s) => s.trim()).filter(Boolean);
      for (const l of o.only) if (!LINTS.includes(l)) throw new Error(`unknown lint ${JSON.stringify(l)} (lints: ${LINTS.join(", ")})`);
    } else if (a === "--enforce-sinks") o.enforceSinks = true;
    else throw new Error(`unknown argument ${JSON.stringify(a)}`);
  }
  return o;
}

function main(argv) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    console.error(`lint: ${e.message}`);
    console.error("usage: node test/lint/run.js [--root <dir>] [--only <lint>[,<lint>...]] [--enforce-sinks]");
    return 2;
  }
  const r = runLints(o.root, o);
  console.log(`lint: ${r.files.length} files (${r.source === "git" ? "tracked and to be tracked" : "every file, no git"})`);
  for (const x of r.results) {
    const notes = x.findings.length - x.failing.length;
    const tag = notes ? `${x.failing.length ? ", and" : ";"} ${notes} report-only` : "";
    console.log(`${x.failing.length ? "FAIL" : notes ? "note" : "ok  "} ${x.name}: ${x.failing.length} finding${x.failing.length === 1 ? "" : "s"}${tag}`);
    for (const f of x.findings) console.log(`  ${f.file}:${f.line}:${f.col} [${x.name}/${f.rule}] ${f.message}${x.failing.includes(f) ? "" : " (report only)"}`);
  }
  console.log(r.failed ? "lint: FAILED" : "lint: ok");
  return r.failed ? 1 : 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));

module.exports = { runLints, LINTS, parseArgs };
