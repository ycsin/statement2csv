// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The build on stub trees (--root): script plan, guards, reproducibility, --check, --only,
// --include-skeletons, --inject, and test/lib/load-provider.js on the same trees.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { run, parseArgs } = require("../../build/build.js");
const { planScripts, runtimeScript, guard } = require("../../build/scripts.js");
const { discover } = require("../../build/discover.js");
const { verify, verifyLanding, LEGACY_PDF, LEGACY_OTHER } = require("../../build/csp.js");
const LP = require("../lib/load-provider.js");
const { makeStubTree, SPDX, TRICKY, umd, parserUmd, PAGE, CONFIG_HELP } = require("./stub-tree.js");

function cli(args) {
  const out = [], err = [];
  const code = run(args, { log: (m) => out.push(m), err: (m) => err.push(m) });
  return { code, out, err };
}
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");
const scriptsOf = (html) => [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => ({ attrs: m[1], text: m[2] }));
const withTree = (fn, opts) => () => {
  const t = makeStubTree(opts);
  try {
    return fn(t);
  } finally {
    t.cleanup();
  }
};

test("a stub tree builds into <root>/dist: published pages and the landing page only", withTree((t) => {
  const r = cli(["--root", t.root]);
  assert.equal(r.code, 0, r.err.join("\n"));
  const dist = path.join(t.root, "dist");
  const files = fs.readdirSync(dist).sort();
  assert.deepEqual(files, ["index.html", "stub-csv", "stub-custom", "stub-pdf"]);
  const landing = read(dist, "index.html");
  const items = [...landing.matchAll(/<li><a href="([^"]+)">([^<]+)<\/a> — ([^<]+)<\/li>/g)].map((m) => m[1]);
  assert.deepEqual(items, ["stub-csv/", "stub-pdf/", "stub-custom/"], "sorted by name in code-point order");
  assert.ok(!/<script/.test(landing));
  assert.match(landing, /content="default-src 'none'; style-src 'sha256-[A-Za-z0-9+/=]+'"/, "hash mode by default");
  assert.deepEqual(verifyLanding(landing), []);
  for (const id of ["stub-csv", "stub-custom", "stub-pdf"]) {
    const html = read(dist, id, "index.html");
    assert.ok(html.startsWith("<!doctype html>\n<!--\n  SPDX-License-Identifier: Apache-2.0\n"), id);
  }
}));

test("the script plan follows the documented piece order", withTree((t) => {
  const entries = Object.fromEntries(discover(t.root, { includeSkeletons: true }).map((e) => [e.id, e]));
  const plan = (id) => planScripts(entries[id].D, entries[id].dir, { root: t.root }).map((p) => `${p.n}:${p.kind === "text" ? "text:" : ""}${p.label}`);
  assert.deepEqual(plan("stub-pdf"), [
    "1:vendor/pdf.min.js", "2:text:vendor/pdf.worker.min.js",
    "3:core/escape.js", "3:core/shell.js", "3:core/zip.js", "3:core/storage.js",
    "6:core/readers/pdf.js", "7:core/layout.js", "8:core/export.js", "10:core/files.js",
    "11:self.StatementProvider", "12:providers/stub-pdf/parser.js", "13:core/app/statement-app.js",
  ]);
  assert.deepEqual(plan("stub-csv"), [
    "3:core/escape.js", "3:core/shell.js", "3:core/zip.js", "3:core/storage.js",
    "4:core/readers/csv.js", "8:core/export.js", "9:core/assemble.js", "10:core/files.js",
    "11:self.StatementProvider", "12:providers/stub-csv/helper.js", "12:providers/stub-csv/parser.js", "13:core/app/statement-app.js",
  ]);
  assert.deepEqual(plan("stub-custom"), [
    "3:core/escape.js", "3:core/shell.js", "3:core/zip.js", "3:core/storage.js",
    "5:core/xlsx.js", "5:core/readers/xlsx.js", "8:core/export.js",
    "11:self.StatementProvider", "12:providers/stub-custom/parser.js", "12:providers/stub-custom/files.js", "13:providers/stub-custom/app.js",
  ]);
  assert.deepEqual(plan("stub-skel").slice(6, 8), ["4:core/readers/csv.js", "6:core/readers/pdf.js"], "csv reader before the pdf reader");
  const parserPieces = planScripts(entries["stub-csv"].D, entries["stub-csv"].dir, { root: t.root }).filter((p) => p.parser);
  assert.deepEqual(parserPieces.map((p) => p.label), ["providers/stub-csv/parser.js"], "the parserScript piece is marked");
  assert.throws(() => planScripts(entries["stub-pdf"].R, entries["stub-pdf"].dir, { root: t.root }), /normalized descriptor/);
}));

test("built pages: every piece byte-equal to its source; tricky text survives; tokens filled", withTree((t) => {
  assert.equal(cli(["--root", t.root]).code, 0);
  const html = read(t.root, "dist", "stub-pdf", "index.html");
  const scripts = scriptsOf(html);
  assert.equal(scripts[0].text, read(t.root, "vendor", "pdf.min.js"));
  assert.equal(scripts[1].attrs, ' type="text/plain" id="pdf-worker-src"');
  assert.equal(scripts[1].text, read(t.root, "vendor", "pdf.worker.min.js"));
  assert.ok(html.includes(TRICKY), "$&, $1, {{csp}}, a partial token and a mid-file U+FEFF survive");
  assert.equal(html.split(TRICKY).length - 1, 2, "in pdf.min.js and in the parser");
  const runtime = scripts.find((s) => s.text.startsWith("self.StatementProvider = "));
  const R = JSON.parse(runtime.text.slice("self.StatementProvider = ".length, -1));
  assert.deepEqual(Object.keys(R), ["id", "app", "inputs", "multiple", "parserGlobal", "pdf", "storage", "modes", "naming", "ui"]);
  assert.equal(R.storage.modeKey, "stub-pdf-csv-mode");
  assert.match(html, /<title>Stub Bank Statement Converter<\/title>/);
  assert.match(html, /\n  Includes PDF\.js \(Mozilla Foundation, Apache-2\.0\), see NOTICE\.\n-->/);
  assert.ok(!/\{\{/.test(html.replace(/<script[\s\S]*?<\/script>/g, "")), "no token left in the markup");
  const custom = read(t.root, "dist", "stub-custom", "index.html");
  assert.ok(!custom.includes("PDF.js"), "no notice line without pdf");
  assert.ok(!custom.includes('id="config-list"') && !custom.includes('id="accounts"'), "no configurator or toolbar buttons");
  assert.match(custom, /<input id="picker" type="file" accept="\.xlsx,application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet" hidden>/);
  assert.ok(scriptsOf(custom).every((s) => s.attrs === ""), "no worker piece without pdf");
}));

test("the runtime JSON escapes <, U+2028 and U+2029 and round-trips", () => {
  const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
  const R = { id: "x", ui: { notes: { other: `a </script><!-- b ${LS} c ${PS} d` } } };
  const code = runtimeScript(R);
  assert.ok(!code.includes("<") && !code.includes(LS) && !code.includes(PS));
  assert.ok(code.includes("\\u003c/script>\\u003c!--") && code.includes("\\u2028") && code.includes("\\u2029"));
  assert.deepEqual(JSON.parse(code.slice("self.StatementProvider = ".length, -1)), R);
  guard(code, "runtime");
});

test("guards: </script, <!--, CR, NUL and a leading BOM stop the build", withTree((t) => {
  const parser = path.join(t.root, "providers", "stub-csv", "parser.js");
  const good = fs.readFileSync(parser, "utf8");
  for (const [bad, re] of [
    [good.replace("return {", "return '</SCRIPT>' && {"), /contains "<\/script"/],
    [good.replace("return {", "return '<!--' && {"), /contains "<!--"/],
    [good.replace("\n", "\r\n"), /carriage return/],
    [good.replace("return {", "return '\0' && {"), /NUL/],
    [String.fromCharCode(0xfeff) + good, /byte order mark/],
  ]) {
    fs.writeFileSync(parser, bad);
    const r = cli(["--root", t.root, "--out", path.join(t.tmp, "out")]);
    assert.equal(r.code, 1);
    assert.ok(r.err.some((m) => re.test(m)), `${re}: ${r.err.join(" | ")}`);
    assert.ok(!fs.existsSync(path.join(t.tmp, "out")), "nothing written");
  }
  fs.writeFileSync(parser, Buffer.concat([Buffer.from(good), Buffer.from([0x2f, 0x2f, 0xff, 0x0a])]));
  const invalid = cli(["--root", t.root, "--out", path.join(t.tmp, "out")]);
  assert.equal(invalid.code, 1);
  assert.ok(invalid.err.some((m) => /is not valid UTF-8/.test(m)), invalid.err.join(" | "));
  fs.writeFileSync(parser, good);
  assert.equal(cli(["--root", t.root, "--out", path.join(t.tmp, "out")]).code, 0);
}));

test("two builds give the same bytes, and --check accepts them", withTree((t) => {
  const a = path.join(t.tmp, "a"), b = path.join(t.tmp, "b");
  assert.equal(cli(["--root", t.root, "--out", a, "--include-skeletons"]).code, 0);
  assert.equal(cli(["--root", t.root, "--out", b, "--include-skeletons"]).code, 0);
  for (const f of ["index.html", "stub-pdf/index.html", "stub-csv/index.html", "stub-custom/index.html", "stub-skel/index.html"]) {
    assert.ok(fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))), f);
  }
  const r = cli(["--root", t.root, "--out", a, "--include-skeletons", "--check"]);
  assert.equal(r.code, 0, r.err.join("\n"));
}));

test("--check: missing, stale and extra files exit 2 with their paths", withTree((t) => {
  assert.equal(cli(["--root", t.root]).code, 0);
  assert.equal(cli(["--root", t.root, "--check"]).code, 0);
  const dist = path.join(t.root, "dist");
  fs.appendFileSync(path.join(dist, "stub-pdf", "index.html"), "\n");
  fs.rmSync(path.join(dist, "stub-csv"), { recursive: true });
  fs.mkdirSync(path.join(dist, "gone"));
  fs.writeFileSync(path.join(dist, "gone", "index.html"), "old");
  const r = cli(["--root", t.root, "--check"]);
  assert.equal(r.code, 2);
  assert.ok(r.err.includes("stale: dist/stub-pdf/index.html"), r.err.join("\n"));
  assert.ok(r.err.includes("missing: dist/stub-csv/index.html"));
  assert.ok(r.err.includes("extra: dist/gone/index.html"));
  const only = cli(["--root", t.root, "--check", "--only", "stub-custom"]);
  assert.equal(only.code, 0, "with --only, only those pages (and the landing page) are compared");
}));

test("--only builds a subset and still validates every provider", withTree((t) => {
  const out = path.join(t.tmp, "out");
  const r = cli(["--root", t.root, "--out", out, "--only", "stub-pdf"]);
  assert.equal(r.code, 0);
  assert.deepEqual(fs.readdirSync(out).sort(), ["index.html", "stub-pdf"]);
  assert.match(read(out, "index.html"), /stub-csv\//, "the landing page still lists every published provider");
  assert.equal(cli(["--root", t.root, "--out", out, "--only", "nope"]).code, 1);
  assert.ok(cli(["--root", t.root, "--out", out, "--only", "stub-skel"]).err.some((m) => /skeletons need --include-skeletons/.test(m)));
  fs.appendFileSync(path.join(t.root, "providers", "stub-csv", "provider.js"), "module.exports.colour = 1;\n");
  const bad = cli(["--root", t.root, "--out", path.join(t.tmp, "out2"), "--only", "stub-pdf"]);
  assert.equal(bad.code, 1);
  assert.ok(bad.err.some((m) => m === 'providers/stub-csv/provider.js: [C01] unknown key "colour"'), bad.err.join("\n"));
  assert.ok(!fs.existsSync(path.join(t.tmp, "out2")));
}));

test("--include-skeletons needs an --out outside dist/ and builds skeletons and unpublished providers", withTree((t) => {
  assert.equal(cli(["--root", t.root, "--include-skeletons"]).code, 1);
  assert.equal(cli(["--root", t.root, "--include-skeletons", "--out", path.join(t.root, "dist", "x")]).code, 1);
  t.write({ "providers/stub-csv/provider.js": read(t.root, "providers", "stub-csv", "provider.js").replace("naming:", "publish: false, naming:") });
  const out = path.join(t.tmp, "out");
  assert.equal(cli(["--root", t.root, "--out", out]).code, 0);
  assert.ok(!fs.existsSync(path.join(out, "stub-csv")), "unpublished: not built by default");
  assert.ok(!/stub-csv/.test(read(out, "index.html")), "and not on the landing page");
  assert.equal(cli(["--root", t.root, "--out", out, "--only", "stub-csv"]).code, 1);
  const out2 = path.join(t.tmp, "out2");
  assert.equal(cli(["--root", t.root, "--out", out2, "--include-skeletons"]).code, 0);
  assert.deepEqual(fs.readdirSync(out2).sort(), ["index.html", "stub-csv", "stub-custom", "stub-pdf", "stub-skel"]);
  assert.match(read(out2, "stub-skel", "index.html"), /accept="text\/csv,\.csv,application\/pdf,\.pdf"/);
  assert.ok(!/stub-skel/.test(read(out2, "index.html")), "skeletons never reach the landing page");
}));

test("--inject: refused unless --out is outside dist/, without --check, for a file under test/", withTree((t) => {
  const inj = path.join(t.root, "test", "inject", "canary.js");
  const out = path.join(t.tmp, "out");
  const refused = [
    [["--inject", inj], /give an --out outside dist/],
    [["--inject", inj, "--out", path.join(t.root, "dist")], /give an --out outside dist/],
    [["--inject", inj, "--out", path.join(t.root, "dist", "sub")], /give an --out outside dist/],
    [["--inject", inj, "--out", out, "--check"], /cannot be combined with --check/],
    [["--inject", path.join(t.root, "providers", "stub-pdf", "parser.js"), "--out", out], /must lie under test\//],
    [["--inject", path.join(t.root, "test"), "--out", out], /must lie under test\//],
    [["--inject", path.join(t.root, "test", "inject", "missing.js"), "--out", out], /does not exist/],
  ];
  for (const [args, re] of refused) {
    const r = cli(["--root", t.root, ...args]);
    assert.equal(r.code, 1, args.join(" "));
    assert.ok(r.err.some((m) => re.test(m)), `${args.join(" ")}: ${r.err.join(" | ")}`);
  }
  assert.ok(!fs.existsSync(out));
  const r = cli(["--root", t.root, "--only", "stub-pdf", "--inject", inj, "--out", out]);
  assert.equal(r.code, 0, r.err.join("\n"));
  const scripts = scriptsOf(read(out, "stub-pdf", "index.html"));
  const at = scripts.findIndex((s) => s.text.includes("INJECTED CANARY PIECE"));
  assert.equal(at, scripts.length - 2, "piece 12b: right before the app script");
  assert.ok(scripts[at - 1].text.includes("StubPdfParser"), "after the provider scripts");
  assert.equal(scripts[at].text, read(inj));
  const hashed = cli(["--root", t.root, "--only", "stub-pdf", "--inject", inj, "--out", path.join(t.tmp, "h"), "--csp", "hash"]);
  assert.equal(hashed.code, 0, hashed.err.join("\n"));
}));

test("hash mode, the default: every executable piece is hashed and the page verifies", withTree((t) => {
  const out = path.join(t.tmp, "out"), flagged = path.join(t.tmp, "flagged");
  assert.equal(cli(["--root", t.root, "--out", out]).code, 0);
  assert.equal(cli(["--root", t.root, "--out", flagged, "--csp", "hash"]).code, 0);
  for (const id of ["stub-pdf", "stub-csv", "stub-custom"]) {
    const html = read(out, id, "index.html");
    assert.equal(html, read(flagged, id, "index.html"), `${id}: --csp hash changes nothing`);
    const csp = /Content-Security-Policy" content="([^"]*)"/.exec(html)[1];
    assert.ok(!/'unsafe-inline'/.test(csp), id);
    assert.match(csp, /form-action 'none'; base-uri 'none'$/);
    const entry = discover(t.root).find((e) => e.id === id);
    const plan = planScripts(entry.D, entry.dir, { root: t.root });
    assert.equal((csp.match(/'sha256-/g) || []).length, plan.filter((p) => p.kind === "exec").length + 1, `${id}: one hash per executable piece, and the style's`);
    assert.deepEqual(verify(html, plan), [], id);
  }
  assert.match(read(out, "index.html"), /style-src 'sha256-[A-Za-z0-9+/=]+'"/);
  assert.equal(read(out, "index.html"), read(flagged, "index.html"));
}));

test("--csp legacy: the old policy strings, and the pages verify in legacy mode", withTree((t) => {
  const out = path.join(t.tmp, "out");
  assert.equal(cli(["--root", t.root, "--out", out, "--csp", "legacy"]).code, 0);
  for (const [id, want] of [["stub-pdf", LEGACY_PDF], ["stub-csv", LEGACY_OTHER], ["stub-custom", LEGACY_OTHER]]) {
    const html = read(out, id, "index.html");
    assert.equal(/Content-Security-Policy" content="([^"]*)"/.exec(html)[1], want, id);
    const entry = discover(t.root).find((e) => e.id === id);
    assert.deepEqual(verify(html, planScripts(entry.D, entry.dir, { root: t.root }), { mode: "legacy" }), [], id);
    assert.ok(verify(html, planScripts(entry.D, entry.dir, { root: t.root })).length, `${id}: a legacy page fails hash-mode verify`);
  }
  const landing = read(out, "index.html");
  assert.match(landing, /content="default-src 'none'; style-src 'unsafe-inline'"/);
  assert.deepEqual(verifyLanding(landing, { mode: "legacy" }), []);
}));

test("the landing page is verified: a style attribute or a script in landing.html stops the build", withTree((t) => {
  const file = path.join(t.root, "core", "page", "landing.html");
  const good = fs.readFileSync(file, "utf8");
  for (const [bad, re, modes] of [
    [good.replace("<main>", '<main style="color: red">'), /landing page: verify failed:[^]*hash mode: style attribute/, ["hash"]],
    [good.replace("</main>", "</main>\n<script>x()</script>"), /landing page: verify failed:[^]*1 <script> elements, the plan 0/, ["hash", "legacy"]],
    [good.replace("<main>", '<main onclick="x()">'), /landing page: verify failed:[^]*inline event handler/, ["hash", "legacy"]],
  ]) {
    fs.writeFileSync(file, bad);
    for (const mode of modes) {
      const out = path.join(t.tmp, `out-${mode}`);
      const r = cli(["--root", t.root, "--out", out, "--csp", mode]);
      assert.equal(r.code, 1, `${mode}: ${re}`);
      assert.ok(r.err.some((m) => re.test(m)), `${mode} ${re}: ${r.err.join(" | ")}`);
      assert.ok(!fs.existsSync(out), "nothing written");
    }
  }
  fs.writeFileSync(file, good.replace("<main>", '<main style="color: red">'));
  assert.equal(cli(["--root", t.root, "--out", path.join(t.tmp, "legacy-ok"), "--csp", "legacy"]).code, 0, "style attributes are allowed in legacy mode");
  fs.writeFileSync(file, good);
  assert.equal(cli(["--root", t.root, "--out", path.join(t.tmp, "ok")]).code, 0);
}));

test("validation errors name the provider folder and file, and nothing is written", withTree((t) => {
  t.write({
    "providers/stub-pdf/provider.js": `${SPDX}module.exports = { contract: 1, id: "stub-pdf", name: "Stub Bank", summary: "x", inputs: ["pdf"], uses: ["layout"], parserGlobal: "StubPdfParser", ui: { status: "months" } };\n`,
    "providers/stub-csv/page.html": `${PAGE(CONFIG_HELP)}<template data-slot="extra">x</template>\n`,
    "providers/stub-custom/provider.js": `${SPDX}const x = require("fs");\nmodule.exports = {};\n`,
    "providers/stub-skel2/provider.js": `${SPDX}module.exports = { contract: 1, id: "stub-skel", name: "Twin", summary: "x", inputs: ["csv"], parserGlobal: "StubTwinParser", publish: false };\n`,
  });
  const out = path.join(t.tmp, "out");
  const r = cli(["--root", t.root, "--out", out]);
  assert.equal(r.code, 1);
  const has = (re) => assert.ok(r.err.some((m) => re.test(m)), `${re}: ${r.err.join("\n")}`);
  has(/^providers\/stub-pdf\/provider\.js: \[C01\] ui\.status must be one of/);
  has(/^providers\/stub-csv\/page\.html: \[C16\] unknown slot "extra"/);
  has(/^providers\/stub-custom\/provider\.js: cannot be loaded: provider\.js is data only and may not require anything/);
  has(/^providers\/stub-skel2\/provider\.js: \[C03\] id "stub-skel" must equal the folder name "stub-skel2"/);
  has(/build failed: \d+ problem\(s\); nothing was written/);
  assert.ok(!fs.existsSync(out));
}));

test("parseArgs: flags and usage errors", () => {
  assert.deepEqual(parseArgs(["--only", "a,b", "--csp", "hash"]).only, ["a", "b"]);
  assert.throws(() => parseArgs(["--csp", "strict"]), /--csp must be legacy or hash/);
  assert.throws(() => parseArgs(["--only"]), /--only needs a value/);
  assert.throws(() => parseArgs(["--out", "--check"]), /--out needs a value/);
  assert.throws(() => parseArgs(["--mutate", "brand"]), /unknown argument "--mutate"/);
  assert.equal(cli(["--nope"]).code, 1);
});

// ---------- test/lib/load-provider.js on stub trees ----------

const STATEMENT = { id: "jan.pdf", pages: [[{ str: "hello", x: 1, y: 2, w: 3, h: 4 }]] };

test("load-provider: discover and frozenProviders", withTree((t) => {
  assert.deepEqual(LP.discover({ root: t.root }).map((p) => p.id), ["stub-csv", "stub-custom", "stub-pdf"]);
  assert.deepEqual(LP.discover({ root: t.root, includeSkeletons: true }).map((p) => p.id), ["stub-skel", "stub-csv", "stub-custom", "stub-pdf"]);
  assert.deepEqual(LP.frozenProviders({ root: t.root }).map((p) => p.id), ["stub-csv", "stub-custom", "stub-frozen-only", "stub-pdf"]);
}));

test("load-provider: loadNode and loadPage give the same statement-app handle", withTree((t) => {
  const node = LP.loadNode("stub-pdf", { root: t.root });
  const page = LP.loadPage("stub-pdf", { root: t.root });
  for (const h of [node, page]) {
    assert.equal(h.app, "statement");
    assert.deepEqual(h.modes, ["balance", "tradelog", "holdings"]);
    assert.equal(h.R.storage.configKey, "stub-pdf-csv-accounts");
    assert.equal(h.frozen.naming.slug, "stub-pdf");
    assert.equal(typeof h.P.parseStatements, "function");
    assert.equal(typeof h.P.transactionsCsv, "function", "P = core export + parser");
  }
  assert.deepEqual(Object.keys(page.parser), Object.keys(node.parser), "same export names in both branches");
  const a = node.parse([STATEMENT], { config: {} });
  const b = page.parse([STATEMENT], { config: {} });
  assert.equal(JSON.stringify(b), JSON.stringify(a));
  const d = node.downloads(a, { mode: "holdings", from: "2026-02", to: "2026-01" });
  assert.equal(d.length, 1);
  assert.equal(d[0].name, "Stub Savings - transactions - 2026-01_to_2026-02.csv", "from/to swapped as range() does");
  assert.equal(d[0].mode, "holdings");
  assert.equal(JSON.stringify(page.downloads(b, { mode: "holdings", from: "2026-02", to: "2026-01" })), JSON.stringify(d));
  assert.deepEqual(node.downloads(null, { mode: "balance" }), []);
  assert.equal(node.expectedHeader(d[0], { mode: "balance" }), "date,amount,currency,name,notes");
  assert.equal(node.expectedHeader({ trigger: "card", kind: "qif" }, { mode: "balance" }), null);
}));

test("load-provider: custom apps go through test.js", withTree((t) => {
  for (const h of [LP.loadNode("stub-custom", { root: t.root }), LP.loadPage("stub-custom", { root: t.root })]) {
    assert.equal(h.app, "custom");
    assert.deepEqual(h.modes, ["balance", "month"]);
    const r = h.parse([{ id: "a.xlsx", workbook: { Sheet1: [["x"]] } }], { mode: "month" });
    assert.deepEqual(JSON.parse(JSON.stringify(r)), { rows: ["Sheet1"], group: "month" }, "page-branch values come from the vm realm");
    assert.deepEqual(h.parse([], {}), { error: "no workbook" });
    assert.deepEqual(h.downloads({ error: "no workbook" }, { mode: "balance" }), [], "no hook call for an {error} result");
    assert.deepEqual(h.downloads(r, { mode: "day" })[0].group, "day");
    assert.equal(h.expectedHeader({ kind: "balances" }, {}), "date,balance,currency");
    assert.deepEqual(h.reconcile(r, {}), []);
    assert.equal(typeof h.P.openingBalance, "function");
  }
}));

test("load-provider: loadPage catches parserGlobal and load-time mistakes (C10b)", withTree((t) => {
  const pdir = path.join(t.root, "providers", "stub-pdf");
  const desc = read(pdir, "provider.js");
  fs.writeFileSync(path.join(pdir, "provider.js"), desc.replace('parserGlobal: "StubPdfParser"', 'parserGlobal: "WrongParser"'));
  assert.throws(() => LP.loadPage("stub-pdf", { root: t.root }), /does not define self\.WrongParser/);
  // a factory that uses its layout dependency at load time, with "layout" missing from uses
  fs.writeFileSync(path.join(pdir, "provider.js"), desc.replace('uses: ["layout"], ', ""));
  const layoutAtLoad = parserUmd("StubPdfParser", [{ path: "../../core/layout.js", global: "StatementLayout" }, { path: "../../core/export.js", global: "StatementExport" }], "  const lines = d0.pageLines;\n  void lines;\n");
  t.write({ "providers/stub-pdf/parser.js": layoutAtLoad });
  assert.throws(() => LP.loadPage("stub-pdf", { root: t.root }), /providers\/stub-pdf\/parser\.js throws while it is evaluated: Cannot read properties of undefined/);
  fs.writeFileSync(path.join(pdir, "provider.js"), desc);
  assert.equal(LP.loadPage("stub-pdf", { root: t.root }).app, "statement", "with uses: [\"layout\"] it loads");
  t.write({ "providers/stub-pdf/parser.js": parserUmd("StubPdfParser", [{ path: "../../core/export.js", global: "StatementExport" }], "  document.title = 'x';\n") });
  assert.throws(() => LP.loadPage("stub-pdf", { root: t.root }), /providers\/stub-pdf\/parser\.js throws while it is evaluated/);
  t.write({ "providers/stub-csv/helper.js": umd("StubCsvParser", [], "  return { early: true };") });
  assert.throws(() => LP.loadPage("stub-csv", { root: t.root }), /self\.StubCsvParser is already defined before providers\/stub-csv\/parser\.js/);
}));

test("load-provider: parser \"old\" works from frozen.js alone", withTree((t) => {
  const oldRoot = path.join(t.tmp, "old");
  const fake = { legacyRepo: "stub-old2csv", legacyUrl: "https://example.invalid/", legacyHead: "0".repeat(40), legacyIndexSha256: "0".repeat(64), legacyDom: null };
  t.write({
    "providers/stub-old/frozen.js": `${SPDX}module.exports = ${JSON.stringify({
      storage: { modeKey: "old-mode", configKey: "old-accounts" }, modeValues: ["balance", "tradelog", "holdings"], configKinds: ["", "investment", "cash"],
      naming: { accountPrefix: "Old ", brand: "Old Bank", groupNoun: "accounts", slug: "old" }, configIdPattern: "^x$", kindModel: "investment-cash", ...fake,
    })};\n`,
    "providers/stub-oldx/frozen.js": `${SPDX}module.exports = ${JSON.stringify({
      storage: { modeKey: "oldx-mode", configKey: null }, modeValues: ["balance", "day"], configKinds: null, configIdPattern: null, naming: { slug: "oldx" }, ...fake, legacyRepo: "stub-oldx2csv",
    })};\n`,
    "providers/stub-oldx/test.js": `${SPDX}module.exports = { parse: (s, ctx) => ({ slug: ctx.R.naming.slug, mode: ctx.mode, n: ctx.P.oldOnly() }), downloads: (r, ctx) => [{ trigger: "zip", disabled: true, from: ctx.from }], reconcile: () => [] };\n`,
  });
  fs.mkdirSync(path.join(oldRoot, "stub-old2csv", "src"), { recursive: true });
  fs.mkdirSync(path.join(oldRoot, "stub-oldx2csv", "src"), { recursive: true });
  fs.writeFileSync(path.join(oldRoot, "stub-old2csv", "src", "parser.js"), `${SPDX}module.exports = { parseStatements: (s) => ({ accounts: {}, n: s.length }) };\n`);
  fs.writeFileSync(path.join(oldRoot, "stub-oldx2csv", "src", "parser.js"), `${SPDX}module.exports = { oldOnly: () => 7 };\n`);
  const h = LP.loadNode("stub-old", { root: t.root, parser: "old", oldRoot });
  assert.equal(h.D, null);
  assert.deepEqual(h.R, {
    id: "stub-old", app: "statement", storage: { modeKey: "old-mode", configKey: "old-accounts" },
    naming: { accountPrefix: "Old ", brand: "Old Bank", groupNoun: "accounts", slug: "old" },
    modes: [{ id: "balance" }, { id: "tradelog" }, { id: "holdings" }], ui: { kindModel: "investment-cash" },
  });
  assert.deepEqual(h.parse([1, 2]), { accounts: {}, n: 2 });
  assert.equal(typeof h.P.csv, "function", "the new core export underneath");
  const x = LP.loadNode("stub-oldx", { root: t.root, parser: "old", oldRoot });
  assert.equal(x.app, "custom");
  assert.deepEqual(x.parse([], { mode: "day" }), { slug: "oldx", mode: "day", n: 7 });
  assert.deepEqual(x.downloads({}, { from: "2026-03", to: "2026-01" }), [{ trigger: "zip", disabled: true, from: "2026-01" }]);
  assert.throws(() => LP.loadNode("stub-pdf", { root: t.root, parser: "old", oldRoot }), /needs frozen\.js with legacyRepo/);
  assert.throws(() => LP.loadNode("stub-frozen-only", { root: t.root }), /no provider\.js/);
  assert.throws(() => LP.loadNode("nobody", { root: t.root }), /no provider folder/);
  assert.throws(() => LP.loadNode("stub-pdf", { root: t.root, parser: "older" }), /parser must be "new" or "old"/);
}));
