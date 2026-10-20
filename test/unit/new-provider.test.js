// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// tools/new-provider.js (docs/ADDING_A_PROVIDER.md, step 1) on scratch copies of this repository
// (the dry run's copyTree, test/contract/new-provider-dryrun.js), never on the repository itself:
// its refusals, which write nothing; the folder it writes (provider.js, parser.js, page.html,
// README.md and frozen.js rewritten, the fixtures copied, fixtures/expected.js left out until
// the fixtures golden makes it); its stop after step (e) without test/node_modules or Chrome;
// that a template it cannot rewrite, or a new folder that fails the contract checks, leaves
// nothing behind; and, in Chrome, a fixtures/expected.js generated for the new name that the
// fixtures golden then passes on the built page. Also the dry run's git-status rule, and its
// steps' environment, which hides the developer's untracked user config. The browser test
// needs the pinned chrome-headless-shell and is skipped, with a message, without it.
// $S2C_PRIVATE points at a temporary directory, so nothing here can reach <private-dir>.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-new-provider-test-"));
process.env.S2C_PRIVATE = path.join(TMP, "private");
test.after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const np = require("../../tools/new-provider.js");
const dryrun = require("../contract/new-provider-dryrun.js");
const { loadDataModule, listProviders } = require("../../build/discover.js");
const { normalize, resolveRuntime } = require("../../core/contract/descriptor.js");
const C = require("../../core/contract/constants.js");
const browserLib = require("../lib/browser.js");

const CHROME_READY = fs.existsSync(browserLib.chromePath());
const NO_CHROME = !CHROME_READY && "the pinned chrome-headless-shell is not installed";
const MODULES = path.join(REPO, "test", "node_modules");

let trees = 0;
function copy({ modules = false } = {}) {
  const root = path.join(TMP, `tree-${++trees}`);
  dryrun.copyTree(root);
  if (modules) fs.symlinkSync(MODULES, path.join(root, "test", "node_modules"), "dir");
  return root;
}
const SHARED = copy();

async function scaffold(root, argv, env = {}) {
  const saved = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  const lines = [], errs = [];
  try {
    const code = await np.main([...argv, "--root", root], { log: (m) => lines.push(m), err: (m) => errs.push(m) });
    return { code, lines, errs };
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const folders = (root) => fs.readdirSync(path.join(root, "providers")).sort();
const template = (from) => `providers/${np.TEMPLATES[from]}`;

test("parseArgs: one id, --name and --from pdf|csv are required, and only the known flags", () => {
  assert.deepEqual(np.parseArgs(["zz-a", "--name", "A Bank", "--from", "csv"]), { id: "zz-a", name: "A Bank", from: "csv", root: REPO });
  assert.equal(np.parseArgs(["--from", "pdf", "zz-a", "--name", "A Bank", "--root", "x"]).root, path.resolve("x"));
  for (const [argv, re] of [
    [[], /give the new provider's id/],
    [["zz-a", "--from", "csv"], /give --name/],
    [["zz-a", "--name", "A Bank"], /--from pdf or --from csv/],
    [["zz-a", "--name", "A Bank", "--from", "xlsx"], /--from pdf or --from csv/],
    [["zz-a", "zz-b", "--name", "A Bank", "--from", "csv"], /one id only/],
    [["zz-a", "--name"], /--name needs a value/],
    [["zz-a", "--name", "A Bank", "--from", "csv", "--force"], /unknown argument "--force"/],
  ]) assert.throws(() => np.parseArgs(argv), re, JSON.stringify(argv));
});

test("the parser global is the id in PascalCase plus Parser", () => {
  assert.equal(`${np.pascal("zz-dryrun-pdf")}Parser`, "ZzDryrunPdfParser");
  assert.equal(np.pascal("a1-2b"), "A12b");
  assert.equal(np.pascal("abc"), "Abc");
});

test("refuses invalid, reserved and existing ids, writing nothing", async () => {
  const published = listProviders(SHARED).find((p) => !p.skeleton);
  const skeleton = listProviders(SHARED, { includeSkeletons: true }).find((p) => p.skeleton);
  fs.mkdirSync(path.join(SHARED, "dist", "zz-dist"), { recursive: true });
  const before = folders(SHARED);
  for (const [id, re] of [
    ["Bad", /is not a valid id/], ["1abc", /is not a valid id/], ["a_b", /is not a valid id/], [`a${"b".repeat(32)}`, /is not a valid id/],
    [C.RESERVED_IDS[0], /is reserved/],
    [published.id, new RegExp(`exists: providers/${published.folder} is there`)],
    [skeleton.id, new RegExp(`exists: providers/${skeleton.folder} is there`)],
    ["zz-dist", /exists: dist\/zz-dist is there/],
  ]) {
    const r = await scaffold(SHARED, [id, "--name", "Zz Refused Bank", "--from", "csv"]);
    assert.equal(r.code, 1, id);
    assert.match(r.errs.join("\n"), re, id);
  }
  fs.rmSync(path.join(SHARED, "dist", "zz-dist"), { recursive: true });
  assert.deepEqual(folders(SHARED), before);
});

test("refuses an id whose default storage keys, slug or parser global another provider uses (C04)", async () => {
  const root = copy();
  fs.mkdirSync(path.join(root, "providers", "zz-keys"));
  fs.writeFileSync(path.join(root, "providers", "zz-keys", "provider.js"), "// SPDX-License-Identifier: Apache-2.0\n// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>\n"
    + "module.exports = { contract: 1, id: \"zz-keys\", name: \"Zz Keys\", summary: \"keys\", inputs: [\"csv\"], parserGlobal: \"ZzClashParser\", "
    + "storage: { modeKey: \"zz-clash-csv-mode\", configKey: \"zz-clash-csv-accounts\" }, naming: { slug: \"zz-clash\" } };\n");
  const r = await scaffold(root, ["zz-clash", "--name", "Zz Clash Bank", "--from", "csv"]);
  assert.equal(r.code, 1);
  const msg = r.errs.join("\n");
  for (const re of [/would reuse another provider's keys/, /parserGlobal "ZzClashParser"/, /storage key "zz-clash-csv-mode"/, /storage key "zz-clash-csv-accounts"/, /naming\.slug "zz-clash"/]) assert.match(msg, re);
  assert.ok(!fs.existsSync(path.join(root, "providers", "zz-clash")));
  assert.deepEqual(folders(root).filter((f) => f.startsWith(".")), [], "no staging folder is left");
});

test("refuses a name that is not plain, and the templates' placeholder name", async () => {
  const before = folders(SHARED);
  for (const name of ["", " Lead Bank", "Trail Bank ", "<b>Bank</b>", "A/B Bank", "Quote \" Bank", "x".repeat(61), np.PLACEHOLDER, np.PLACEHOLDER.toUpperCase()]) {
    const r = await scaffold(SHARED, ["zz-named", "--name", name, "--from", "pdf"]);
    assert.equal(r.code, 1, JSON.stringify(name));
    assert.match(r.errs.join("\n"), /is not a plain name|placeholder name/, JSON.stringify(name));
  }
  assert.deepEqual(folders(SHARED), before);
});

for (const from of ["csv", "pdf"]) {
  test(`--from ${from} without the browser: the whole folder but fixtures/expected.js, exit 1 with what to run`, async () => {
    const id = `zz-nochrome-${from}`, name = "Zz & Co Bank", global = `ZzNochrome${from[0].toUpperCase()}${from.slice(1)}Parser`;
    const r = await scaffold(SHARED, [id, "--name", name, "--from", from]);
    assert.equal(r.code, 1, r.errs.join("\n"));
    const out = r.lines.join("\n");
    assert.match(out, /fixtures\/expected\.js not generated: test\/node_modules has no playwright-core \(cd test && npm ci --ignore-scripts\)/);
    assert.match(out, new RegExp(`node build/build\\.js && node test/smoke/fixtures-golden\\.js --provider ${id} --update`));
    const t = template(from), dir = `providers/${id}`;
    const tfiles = fs.readdirSync(path.join(SHARED, t), { recursive: true }).filter((f) => fs.statSync(path.join(SHARED, t, f)).isFile()).sort();
    const files = fs.readdirSync(path.join(SHARED, dir), { recursive: true }).filter((f) => fs.statSync(path.join(SHARED, dir, f)).isFile()).sort();
    assert.deepEqual(files, [...tfiles.filter((f) => f !== path.join("fixtures", "expected.js")), "frozen.js"].sort());
    // provider.js: the four values, the template's otherwise.
    const D = loadDataModule(path.join(SHARED, dir, "provider.js")), T = loadDataModule(path.join(SHARED, t, "provider.js"));
    assert.deepEqual(D, { ...T, id, name, summary: "TODO", parserGlobal: global });
    assert.match(read(SHARED, `${dir}/provider.js`), /^\/\/ SPDX-License-Identifier: Apache-2\.0\n\/\/ Copyright 2026 /);
    assert.ok(!/skeleton|never published/.test(read(SHARED, `${dir}/provider.js`)), "the header is the new provider's, not the template's");
    assert.ok(read(SHARED, `${dir}/provider.js`).includes(`Made by tools/new-provider.js from ${t}/.`));
    // parser.js: the global renamed, nothing else.
    assert.equal(read(SHARED, `${dir}/parser.js`), read(SHARED, `${t}/parser.js`).split(T.parserGlobal).join(global));
    assert.ok(read(SHARED, `${dir}/parser.js`).includes(`root.${global} = factory(`));
    // page.html and README.md: the name for the placeholder (escaped in the page).
    assert.equal(read(SHARED, `${dir}/page.html`), read(SHARED, `${t}/page.html`).split(np.PLACEHOLDER).join("Zz &amp; Co Bank"));
    assert.equal(read(SHARED, `${dir}/README.md`), read(SHARED, `${t}/README.md`).split(np.PLACEHOLDER).join(name));
    for (const f of ["page.html", "README.md"]) assert.ok(!read(SHARED, `${dir}/${f}`).includes(np.PLACEHOLDER), f);
    // The fixtures as they were; no expected.js yet.
    for (const f of tfiles.filter((x) => x.startsWith("fixtures") && !x.endsWith("expected.js"))) assert.equal(read(SHARED, `${dir}/${f}`), read(SHARED, `${t}/${f}`), f);
    assert.ok(!fs.existsSync(path.join(SHARED, dir, "fixtures", "expected.js")));
    // frozen.js: exactly the resolved values (C05), with the templates' id format.
    const R = resolveRuntime(normalize(D));
    assert.deepEqual(loadDataModule(path.join(SHARED, dir, "frozen.js")), {
      storage: { modeKey: `${id}-csv-mode`, configKey: `${id}-csv-accounts` }, modeValues: R.modes.map((m) => m.id), configKinds: [...C.CONFIG_KINDS],
      naming: { accountPrefix: "", brand: name, groupNoun: "accounts", slug: id }, configIdPattern: np.CONFIG_ID_PATTERN, kindModel: "standard",
    });
    assert.deepEqual(R.storage, { modeKey: `${id}-csv-mode`, configKey: `${id}-csv-accounts` });
    // The folder passes the node-tier contract checks, frozen.js included.
    const contract = require(path.join(SHARED, "test", "contract", "run.js"));
    assert.deepEqual((await contract.runContract({ root: SHARED, tier: "node", providers: [id] })).problems, []);
    assert.deepEqual(folders(SHARED).filter((f) => f.startsWith(".")), [], "no staging folder is left");
  });
}

test("without Chrome (test/node_modules present): the same stop, naming Chrome", async () => {
  const root = copy({ modules: true });
  const r = await scaffold(root, ["zz-nochrome", "--name", "Zz Shell Bank", "--from", "csv"], { CHROME: path.join(TMP, "no-such-chrome") });
  assert.equal(r.code, 1);
  assert.match(r.lines.join("\n"), /fixtures\/expected\.js not generated: the pinned Chrome headless shell is not installed/);
  assert.ok(fs.existsSync(path.join(root, "providers", "zz-nochrome", "frozen.js")));
  assert.ok(!fs.existsSync(path.join(root, "providers", "zz-nochrome", "fixtures", "expected.js")));
});

test("a template the scaffold cannot rewrite leaves nothing behind", async () => {
  const root = copy();
  const file = path.join(root, template("csv"), "provider.js");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^ {2}summary: .*\n/m, ""));
  const before = folders(root);
  const r = await scaffold(root, ["zz-broken", "--name", "Zz Broken Bank", "--from", "csv"]);
  assert.equal(r.code, 1);
  assert.match(r.errs.join("\n"), /the template's provider\.js has 0 lines for summary, not one/);
  assert.deepEqual(folders(root), before);
});

test("a new folder that fails the contract checks is removed again", async () => {
  const root = copy();
  const file = path.join(root, template("csv"), "parser.js");
  const text = fs.readFileSync(file, "utf8");
  const at = "  function parseStatements(statements, config = {}) {\n";
  assert.equal(text.split(at).length, 2);
  fs.writeFileSync(file, text.replace(at, () => `${at}    throw new Error("broken parser");\n`));
  const before = folders(root);
  const r = await scaffold(root, ["zz-throws", "--name", "Zz Throws Bank", "--from", "csv"]);
  assert.equal(r.code, 1);
  const msg = r.errs.join("\n");
  assert.match(msg, /the new folder fails the contract checks, so it was removed again/);
  assert.match(msg, /providers\/zz-throws\/parser\.js: \[C11\] .*parseStatements throws: broken parser/);
  assert.deepEqual(folders(root), before);
});

test("in Chrome: fixtures/expected.js generated for the new name, which the fixtures golden passes on the built page", { skip: NO_CHROME }, async () => {
  const root = copy({ modules: true });
  const id = "zz-full", name = "Zz Full Bank";
  const r = await scaffold(root, [id, "--name", name, "--from", "csv"]);
  assert.equal(r.code, 0, [...r.lines, ...r.errs].join("\n"));
  assert.ok(r.lines.some((l) => l === `providers/${id}/fixtures/expected.js: generated for the new name and slug; review it before committing`), r.lines.join("\n"));
  const text = read(root, `providers/${id}/fixtures/expected.js`);
  assert.ok(text.includes(`${name} accounts - `) && text.includes(`${id}-csv-`), "file names and zip names follow the name and the slug");
  assert.ok(!text.includes(np.PLACEHOLDER));
  assert.equal(loadDataModule(path.join(root, "providers", id, "fixtures", "expected.js")).marker, "SYNTHETIC TEST DATA");
  // The scaffold wrote nothing outside the folder: dist/ is the build's.
  assert.ok(!fs.existsSync(path.join(root, "dist", id)));
  const { run } = require(path.join(root, "build", "build.js"));
  assert.equal(run(["--root", root], { log: () => {}, err: () => {} }), 0);
  const golden = require(path.join(root, "test", "smoke", "fixtures-golden.js"));
  const g = await golden.runGolden({ root, providers: [id] });
  assert.deepEqual(g.problems, []);
  assert.equal(g.providers.length, 1);
});

test("the dry run's git status rule: only the new folders, their pages and the landing page", () => {
  const ids = ["zz-dryrun-pdf", "zz-dryrun-csv"];
  const good = ["?? providers/zz-dryrun-pdf/provider.js", "?? providers/zz-dryrun-csv/fixtures/expected.js", "?? dist/zz-dryrun-pdf/index.html", "?? dist/zz-dryrun-csv/index.html", " M dist/index.html"];
  assert.deepEqual(dryrun.porcelainProblems(good, ids), []);
  const has = (lines, re) => assert.ok(dryrun.porcelainProblems(lines, ids).some((m) => re.test(m)), lines.join("; "));
  has([...good, " M core/export.js"], /git status lists " M core\/export\.js"/);
  has([...good, "?? providers/zz-other/provider.js"], /git status lists "\?\? providers\/zz-other\/provider\.js"/);
  has([...good, " M providers/zz-dryrun-pdf/provider.js"], /only the new providers' folders/);
  has(good.filter((l) => !l.includes("dist/zz-dryrun-csv")), /does not list dist\/zz-dryrun-csv\/index\.html/);
  has(good.filter((l) => !l.includes("providers/zz-dryrun-csv")), /lists no file of providers\/zz-dryrun-csv\//);
  has(good.filter((l) => l !== " M dist/index.html"), /does not list dist\/index\.html as modified/);
});

test("the dry run's steps see CI's empty user config, whatever the developer's says", () => {
  const tmp = fs.mkdtempSync(path.join(TMP, "dryrun-env-"));
  // A developer's settings that refuse the dry run's folder: a refuse list that holds it, and a
  // statements root at it; and their own denylist and app list.
  const dev = fs.mkdtempSync(path.join(TMP, "dev-config-"));
  fs.mkdirSync(path.join(dev, "statement2csv"));
  fs.writeFileSync(path.join(dev, "statement2csv", "statements.js"), `module.exports = { refuse: [${JSON.stringify(tmp)}] };\n`);
  const base = { ...process.env, XDG_CONFIG_HOME: dev, S2C_STATEMENTS: tmp, S2C_DENYLIST: path.join(dev, "deny.txt"), S2C_APPS: path.join(dev, "apps.txt") };
  const env = dryrun.stepEnv(tmp, base);
  assert.equal(env.S2C_PRIVATE, path.join(tmp, "private"));
  assert.equal(env.S2C_OLD_ROOT, path.join(tmp, "old-root"));
  assert.equal(env.XDG_CONFIG_HOME, path.join(tmp, "config"));
  assert.deepEqual([fs.readdirSync(env.S2C_OLD_ROOT), fs.readdirSync(env.XDG_CONFIG_HOME)], [[], []], "both folders empty");
  assert.deepEqual(dryrun.PRIVATE_SETTINGS, ["S2C_STATEMENTS", "S2C_DENYLIST", "S2C_APPS"]);
  for (const k of dryrun.PRIVATE_SETTINGS) assert.ok(!(k in env), `${k} is not passed on`);
  const rest = (e) => Object.fromEntries(Object.entries(e).filter(([k]) => ![...dryrun.PRIVATE_SETTINGS, "S2C_PRIVATE", "S2C_OLD_ROOT", "XDG_CONFIG_HOME"].includes(k)));
  assert.deepEqual(rest(env), rest(base), "everything else is passed on as it is");
  // A step's own process, as the dry run starts it: the private-data guards read an empty user
  // config and let it write in its <private-dir>. With the developer's settings they refuse.
  const priv = path.join(REPO, "test", "lib", "private.js");
  const probe = `const p = require(${JSON.stringify(priv)}); console.log(JSON.stringify(p.userConfig())); p.assertSafeOutput(${JSON.stringify(path.join(tmp, "private", "x"))}); console.log("may write");`;
  const run = (e) => spawnSync(process.execPath, ["-e", probe], { env: e, encoding: "utf8" });
  const step = run(env);
  assert.equal(step.status, 0, step.stderr);
  assert.deepEqual(step.stdout.trim().split("\n"), ['{"providers":{},"refuse":[]}', "may write"]);
  const refused = (e, re) => {
    const r = run(e);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, re);
  };
  refused({ ...env, XDG_CONFIG_HOME: dev }, /refusing to write .*: it is inside a path in the user config's refuse list/);
  refused({ ...env, S2C_STATEMENTS: tmp }, /refusing to write .*: it is inside the statements folder/);
});
