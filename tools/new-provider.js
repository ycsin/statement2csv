// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Scaffold a new provider from a template (docs/ADDING_A_PROVIDER.md, step 1).
//
//   node tools/new-provider.js <id> --name "<Name>" --from pdf|csv [--root <dir>]
//
// (a) Refuses an invalid id (the contract's id rule), a reserved one, and one that exists: a
//     folder providers/<id> or providers/_<id>, a provider with that id, or dist/<id>; and an id
//     whose default storage keys, zip slug or parser global another provider uses (contract
//     check C04). Refuses a name that is not a plain name (letters and digits, with spaces and
//     . , & ' ( ) + -) and the templates' placeholder name, which shared code holds (the
//     generic lint's provider-name rule would fail).
// (b) Copies providers/_template-<from>/ to providers/<id>/, except fixtures/expected.js, which
//     would be stale.
// (c) provider.js: a new header comment, and the id, the name, summary "TODO" and parserGlobal
//     "<PascalId>Parser". parser.js: the template's parser global renamed (the browser branch of
//     the UMD lines and the header comment). page.html and README.md: the templates' placeholder
//     name replaced by the name (HTML-escaped in page.html).
// (d) The storage keys (<id>-csv-mode, <id>-csv-accounts), the zip slug (<id>) and the brand
//     (the name) are the defaults that follow from the id and the name.
// (e) frozen.js: a draft holding exactly those resolved values (storage, modeValues,
//     configKinds, naming, configIdPattern "^[^:]+:[A-Z]{3}$" for the templates'
//     "<account number>:<CCY>" ids, kindModel "standard"), so contract check C05 holds from the
//     first commit. The new folder must pass the node-tier contract checks; if it does not, it
//     is removed again.
// (f) Builds the new page in a temporary tree (copies of core/, vendor/ and the new folder) and
//     runs node test/smoke/fixtures-golden.js --root <that tree> --provider <id> --update there,
//     then copies the fresh fixtures/expected.js into providers/<id>/fixtures/. This needs
//     test/node_modules (cd test && npm ci --ignore-scripts) and the pinned Chrome; without them
//     the scaffold stops after (e) with that message, and the provider has no expected.js yet
//     (the fixtures golden then reports "run --update"; it never compares against stale data).
//
// Nothing outside providers/<id>/ is written; dist/ is left to node build/build.js. --root
// scaffolds into another tree (tests); the default is this repository. Exit status: 0 done, 1
// refused or not complete (the message says which; after a failure in (f) the folder stays,
// without fixtures/expected.js), 2 usage.
//
//   scaffold({root, id, name, from, log}) -> {code, dir, expected: "written" | "missing" | null}
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const TEMPLATES = { pdf: "_template-pdf", csv: "_template-csv" };
const PLACEHOLDER = "Example Bank";
const ID_RE = /^[a-z][a-z0-9-]{0,31}$/;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .,&'()+-]*$/u;
const NAME_MAX = 60;
const CONFIG_ID_PATTERN = "^[^:]+:[A-Z]{3}$";
const SPDX = "// SPDX-License-Identifier: Apache-2.0\n// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>\n";
const USAGE = "usage: node tools/new-provider.js <id> --name \"<Name>\" --from pdf|csv [--root <dir>]";

class UsageError extends Error {}
class Refusal extends Error {}

const describe = (e) => String(e && e.message ? e.message : e).split("\n")[0];
const rel = (root, abs) => path.relative(root, abs).split(path.sep).join("/");
const pascal = (id) => id.split("-").filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join("");
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);
// A flat object as JS source: { key: "value", ... }.
const flat = (o) => `{ ${Object.entries(o).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")} }`;

function parseArgs(argv) {
  const o = { id: null, name: null, from: null, root: REPO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new UsageError(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--name") o.name = value();
    else if (a === "--from") o.from = value();
    else if (a === "--root") o.root = path.resolve(value());
    else if (a === "--help" || a === "-h") throw new UsageError("");
    else if (a.startsWith("--")) throw new UsageError(`unknown argument ${JSON.stringify(a)}`);
    else if (o.id !== null) throw new UsageError(`one id only (got ${JSON.stringify(o.id)} and ${JSON.stringify(a)})`);
    else o.id = a;
  }
  if (o.id === null) throw new UsageError("give the new provider's id");
  if (o.name === null) throw new UsageError("give --name \"<Name>\"");
  if (!Object.prototype.hasOwnProperty.call(TEMPLATES, o.from || "")) throw new UsageError("give --from pdf or --from csv");
  return o;
}

// ---------------------------------------------------------------- (a) the refusals

function checkId(root, id, { discover }) {
  const C = require(path.join(root, "core", "contract", "constants.js"));
  if (!ID_RE.test(id)) throw new Refusal(`${JSON.stringify(id)} is not a valid id: a lowercase letter, then up to 31 lowercase letters, digits or "-" (docs/CONTRACT.md, descriptor)`);
  if (C.RESERVED_IDS.includes(id)) throw new Refusal(`the id ${JSON.stringify(id)} is reserved`);
  for (const p of [`providers/${id}`, `providers/_${id}`, `dist/${id}`]) {
    if (fs.existsSync(path.join(root, p))) throw new Refusal(`the id ${JSON.stringify(id)} exists: ${p} is there`);
  }
  for (const p of discover(root)) if (p.id === id) throw new Refusal(`the id ${JSON.stringify(id)} exists: providers/${p.folder} has it`);
}

function checkName(name) {
  if (name !== name.trim() || !name || name.length > NAME_MAX || !NAME_RE.test(name)) {
    throw new Refusal(`${JSON.stringify(name)} is not a plain name: up to ${NAME_MAX} characters, starting with a letter or digit, then letters, digits, spaces and . , & ' ( ) + -`);
  }
  if (name.toLowerCase() === PLACEHOLDER.toLowerCase()) throw new Refusal(`"${PLACEHOLDER}" is the templates' placeholder name: give the provider's own name`);
}

// ---------------------------------------------------------------- (b)-(e) the new folder

// The template's files, provider-relative, except fixtures/expected.js.
function templateFiles(dir, base = dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const abs = path.join(dir, d.name);
    const r = rel(base, abs);
    if (d.isDirectory()) templateFiles(abs, base, out);
    else if (d.isFile() && r !== "fixtures/expected.js") out.push(r);
  }
  return out;
}

// `text` with the one line matching `re` replaced; the template must hold exactly one.
function swapLine(text, re, line, what) {
  const lines = text.split("\n");
  const at = lines.map((l, i) => (re.test(l) ? i : -1)).filter((i) => i >= 0);
  if (at.length !== 1) throw new Error(`the template's provider.js has ${at.length} lines for ${what}, not one`);
  lines[at[0]] = line;
  return lines.join("\n");
}

function providerText(template, { id, name, from, global }) {
  const start = template.indexOf("module.exports = {");
  if (start < 0) throw new Error("the template's provider.js has no \"module.exports = {\" line");
  let body = template.slice(start);
  body = swapLine(body, /^ {2}id: "[^"]*",$/, `  id: ${JSON.stringify(id)},`, "id");
  body = swapLine(body, /^ {2}name: "[^"]*",$/, `  name: ${JSON.stringify(name)},`, "name");
  body = swapLine(body, /^ {2}summary: "[^"]*",$/, "  summary: \"TODO\",", "summary");
  body = swapLine(body, /^ {2}parserGlobal: "[^"]*",$/, `  parserGlobal: ${JSON.stringify(global)},`, "parserGlobal");
  return `${SPDX}// Descriptor (docs/CONTRACT.md, descriptor): plain data only, no functions and no require.
// Made by tools/new-provider.js from providers/${TEMPLATES[from]}/. The storage keys, the zip
// slug and the brand are the defaults that follow from the id and the name; frozen.js records
// them. The summary is the one line the landing page shows.
${body}`;
}

function parserText(template, oldGlobal, global) {
  const re = new RegExp(`\\b${oldGlobal}\\b`, "g");
  const out = template.replace(re, () => global);
  if (!out.includes(`root.${global} = factory(`)) throw new Error(`the template's parser.js has no browser branch "root.${oldGlobal} = factory(" to rename`);
  return out;
}

function frozenText(R) {
  return `${SPDX}// Compatibility surface (docs/CONTRACT.md, frozen.js). Changing a value renames users' files or
// loses their saved settings. A draft written by tools/new-provider.js with the descriptor's
// resolved values: until the first public release it may change freely (provider.js must still
// resolve to it); after that, every change is a deliberate migration.
module.exports = {
  storage: ${flat(R.storage)},
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ${JSON.stringify(R.modes.map((m) => m.id)).replace(/,/g, ", ")},
  // What the configurator's Type select may write (never "bank").
  configKinds: ${JSON.stringify(R.configKinds).replace(/,/g, ", ")},
  naming: ${flat(R.naming)},
  // Every portfolio id must match: <account number>:<CCY>, the ids of the template's parser.
  // Change it together with the id format of your parser.
  configIdPattern: ${JSON.stringify(CONFIG_ID_PATTERN)},
  // Which accounts follow the global mode: every non-investment account is forced to Balance only.
  kindModel: ${JSON.stringify(R.ui.kindModel)},
};
`;
}

// The new folder's files: {provider-relative path: Buffer | string}.
function newFolder(root, { id, name, from }) {
  const tdir = path.join(root, "providers", TEMPLATES[from]);
  if (!fs.existsSync(path.join(tdir, "provider.js"))) throw new Refusal(`the template providers/${TEMPLATES[from]}/ is missing`);
  const { loadDataModule } = require(path.join(root, "build", "discover.js"));
  const oldGlobal = loadDataModule(path.join(tdir, "provider.js")).parserGlobal;
  const global = `${pascal(id)}Parser`;
  const files = {};
  for (const f of templateFiles(tdir)) {
    const bytes = fs.readFileSync(path.join(tdir, f));
    if (f === "provider.js") files[f] = providerText(bytes.toString("utf8"), { id, name, from, global });
    else if (f === "parser.js") files[f] = parserText(bytes.toString("utf8"), oldGlobal, global);
    else if (f === "page.html") files[f] = bytes.toString("utf8").split(PLACEHOLDER).join(escHtml(name));
    else if (f === "README.md") files[f] = bytes.toString("utf8").split(PLACEHOLDER).join(name);
    else files[f] = bytes;
  }
  return { files, global };
}

function writeFiles(dir, files) {
  for (const [f, data] of Object.entries(files)) {
    const abs = path.join(dir, ...f.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, data);
  }
}

// The resolved values frozen.js records, from the new descriptor.
function resolved(root, raw) {
  const { normalize, resolveRuntime } = require(path.join(root, "core", "contract", "descriptor.js"));
  const C = require(path.join(root, "core", "contract", "constants.js"));
  const R = resolveRuntime(normalize(raw));
  return { ...R, configKinds: [...C.CONFIG_KINDS] };
}

// C04 for the new descriptor against every provider (skeletons included), before anything is
// written.
function checkUnique(root, raw) {
  const { validate } = require(path.join(root, "core", "contract", "descriptor.js"));
  const { listProviders, loadDataModule } = require(path.join(root, "build", "discover.js"));
  const all = [];
  for (const p of listProviders(root, { includeSkeletons: true })) {
    try {
      all.push(loadDataModule(path.join(p.dir, "provider.js")));
    } catch {
      // the contract checks report a descriptor that does not load
    }
  }
  const clash = validate(raw, { all }).filter((m) => m.includes("[C04]"));
  if (clash.length) throw new Refusal(`the id ${JSON.stringify(raw.id)} would reuse another provider's keys: ${clash.map((m) => m.replace(/^provider\.js: \[C04\] /, "")).join("; ")}`);
}

// ---------------------------------------------------------------- (f) fixtures/expected.js

// Why the fixtures golden cannot run here, or null.
function browserMissing(root) {
  if (!fs.existsSync(path.join(root, "test", "node_modules", "playwright-core", "package.json"))) {
    return "test/node_modules has no playwright-core (cd test && npm ci --ignore-scripts)";
  }
  const { chromePath } = require(path.join(root, "test", "lib", "browser.js"));
  if (!fs.existsSync(chromePath())) return "the pinned Chrome headless shell is not installed (set CHROME, or cd test && PLAYWRIGHT_SKIP_BROWSER_GC=1 node node_modules/playwright-core/cli.js install --only-shell chromium)";
  return null;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const d of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, d.name), b = path.join(to, d.name);
    if (d.isDirectory()) copyDir(a, b);
    else if (d.isFile()) fs.copyFileSync(a, b);
  }
}

// Builds the page in a temporary tree and runs the fixtures golden there with --update.
// Returns {ok, lines, why}.
function generateExpected(root, id) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-new-provider-"));
  try {
    const tree = path.join(tmp, "tree");
    for (const d of ["core", "vendor", path.join("providers", id)]) copyDir(path.join(root, d), path.join(tree, d));
    const errs = [];
    const code = require(path.join(root, "build", "build.js")).run(["--root", tree, "--only", id], { log: () => {}, err: (m) => errs.push(m) });
    if (code !== 0) return { ok: false, lines: errs, why: "the new page does not build" };
    const r = spawnSync(process.execPath, [path.join(root, "test", "smoke", "fixtures-golden.js"), "--root", tree, "--provider", id, "--update"], { encoding: "utf8", maxBuffer: 1 << 26 });
    const lines = `${r.stdout || ""}${r.stderr || ""}`.split("\n").filter((l) => l.trim());
    const fresh = path.join(tree, "providers", id, "fixtures", "expected.js");
    if (r.status !== 0 || !fs.existsSync(fresh)) return { ok: false, lines, why: "the fixtures golden did not write fixtures/expected.js" };
    fs.copyFileSync(fresh, path.join(root, "providers", id, "fixtures", "expected.js"));
    return { ok: true, lines };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- the run

async function scaffold({ root = REPO, id, name, from, log = () => {} }) {
  root = path.resolve(root);
  const { listProviders } = require(path.join(root, "build", "discover.js"));
  checkId(root, id, { discover: (r) => listProviders(r, { includeSkeletons: true }) });
  checkName(name);
  const { files, global } = newFolder(root, { id, name, from });
  const stage = path.join(root, "providers", `.${id}.new-${process.pid}`);
  const dir = path.join(root, "providers", id);
  fs.rmSync(stage, { recursive: true, force: true });
  try {
    writeFiles(stage, files);
    const { loadDataModule } = require(path.join(root, "build", "discover.js"));
    const raw = loadDataModule(path.join(stage, "provider.js"));
    checkUnique(root, raw);
    const R = resolved(root, raw);
    fs.writeFileSync(path.join(stage, "frozen.js"), frozenText(R));
    fs.renameSync(stage, dir);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  // The new folder against the node-tier contract checks (the template passes them; the id and
  // the name are what changed).
  const contract = require(path.join(root, "test", "contract", "run.js"));
  const r = await contract.runContract({ root, tier: "node", providers: [id] });
  const problems = r.problems.filter((m) => m.startsWith(`providers/${id}/`));
  if (problems.length) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Refusal(`the new folder fails the contract checks, so it was removed again:\n  ${problems.join("\n  ")}`);
  }
  log(`providers/${id}/: copied from providers/${TEMPLATES[from]}/ (${Object.keys(files).length} files), parser global ${global}, frozen.js drafted`);
  const missing = browserMissing(root);
  if (missing) {
    log(`fixtures/expected.js not generated: ${missing}.`);
    log(`Then run: node build/build.js && node test/smoke/fixtures-golden.js --provider ${id} --update`);
    return { code: 1, dir, expected: "missing" };
  }
  const g = generateExpected(root, id);
  for (const l of g.lines) log(`  ${l}`);
  if (!g.ok) {
    log(`fixtures/expected.js not generated: ${g.why}; the folder stays, without it`);
    return { code: 1, dir, expected: "missing" };
  }
  log(`providers/${id}/fixtures/expected.js: generated for the new name and slug; review it before committing`);
  log("next: docs/ADDING_A_PROVIDER.md, step 2");
  return { code: 0, dir, expected: "written" };
}

async function main(argv, io = { log: (m) => console.log(m), err: (m) => console.error(m) }) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    if (e.message) io.err(`new-provider: ${e.message}`);
    io.err(USAGE);
    return 2;
  }
  try {
    const r = await scaffold({ ...o, log: io.log });
    return r.code;
  } catch (e) {
    if (e instanceof Refusal) {
      io.err(`new-provider: ${e.message}`);
      return 1;
    }
    io.err(`new-provider: ${describe(e)}`);
    return 1;
  }
}

if (require.main === module) main(process.argv.slice(2)).then((code) => { process.exitCode = code; });

module.exports = { scaffold, main, parseArgs, pascal, providerText, parserText, frozenText, TEMPLATES, PLACEHOLDER, CONFIG_ID_PATTERN, Refusal, UsageError };
