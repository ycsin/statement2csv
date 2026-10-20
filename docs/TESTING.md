<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->

# Testing

The tests prove three things: every provider keeps the contract (docs/CONTRACT.md); every page
works and offers exactly the downloads its data gives; and, for the providers migrated from the
old converter repositories, every download is byte for byte what the old page gave. Everything
that runs in CI uses synthetic data only. Tests that need real statements or the old
repositories are local gates, and they keep every private thing out of the repository and out of
the console (private data rules, below).

Machine paths are written as placeholders: `<old-root>` (the folder that holds the old
repositories), `<statements-dir>`, `<private-dir>` and `<config-dir>` (below).

## Layers

| Layer | Data | In CI | Command |
|---|---|---|---|
| Contract checks, Node tier (C01-C12, C14-C18) | descriptors, synthetic garbage | yes | `node test/contract/run.js --tier node [--provider <id>] [--old-root <dir>]` (`npm run contract`) |
| Contract checks, browser tier (C13) | fixtures rendered and read in Chrome | yes | `node test/contract/run.js --tier browser` (`npm run contract-browser`); fails, never skips, without Chrome |
| Lints | the files a commit would hold | yes | `node test/lint/run.js` (`npm run lint`) |
| Unit and differential tests | synthetic, seeded | yes | `node --test "test/unit/*.test.js"` (`npm run unit`) |
| Smoke, fixtures golden, injection, parse error | built pages, synthetic fixtures | yes | `node test/smoke/pages.js`, `fixtures-golden.js`, `injection.js`, `parse-error.js` (`npm run smoke` runs all four) |
| New-provider dry run | the templates | yes | `node test/contract/new-provider-dryrun.js` |
| Generic per-provider harness | any statement folder | on fixtures only | `node test/harness/run.js --provider <id> [--statements <dir>] [--browser]`; CI: `--all-fixtures --browser` |
| Golden equivalence (old pages against new) | private statements, old pages | **no** (local gate) | `node test/golden/run.js …` |
| Storage compatibility | private statements, old pages | no (local gate) | `node test/storage-compat/run.js` |

The browser layers need `test/node_modules` and the pinned browser:

```sh
cd test && npm ci --ignore-scripts                                  # playwright-core 1.57.0, exact pin
PLAYWRIGHT_SKIP_BROWSER_GC=1 node node_modules/playwright-core/cli.js install --only-shell chromium   # chrome-headless-shell revision 1200
```

(`PLAYWRIGHT_SKIP_BROWSER_GC=1` keeps the installer from deleting other projects' browsers in
the shared browser folder.)

`test/lib/browser.js` launches `$CHROME` or the revision-1200 headless shell under the home
directory's `.cache/ms-playwright`, after checking both versions (Chrome 143.0.7499.4 and
playwright-core 1.57.0, from this repository's `test/node_modules` only).

## Contract checks

`test/contract/run.js` runs these for every discovered provider, skeletons included. Messages
read `<path>: [Cnn] <message>`.

| Check | Verifies |
|---|---|
| C01 | Descriptor schema: types, enums, required and forbidden fields per `app`; **unknown keys are errors** |
| C02 | Data only: `JSON.parse(JSON.stringify(D))` deep-equals `D`, and no accessors |
| C03 | `id` = folder name minus a leading `_`; the id rule; not in `RESERVED_IDS`; `contract === 1` |
| C04 | `id`, `parserGlobal`, the storage keys and `naming.slug` unique across providers |
| C05 | With `frozen.js`: it follows `FROZEN_SCHEMA` for the app type; every key present deep-equals the resolved descriptor; `configIdPattern` compiles. **C05b:** a non-skeleton provider with `publish: true`, or one whose `dist/<id>/index.html` is tracked by git, has a `frozen.js` |
| C06 | A `legacy` block only with `frozen.legacyRepo`; legacy values from the allowed sets; `ui.diagnostics` and `legacy.diagnostics` not both given |
| C07 | Every referenced file exists (`scripts`, `appScript`, `page.html`, `test.js` for custom apps with `parse`, `downloads` and `reconcile`, `testing.fixtures` with its `statements.js`) |
| C08 | Overrides: (`parserScript` exports ∩ `CORE_EXPORT_NAMES`) = `exportOverrides` exactly. **C08b:** the override set is closed under the export call graph derived from `core/export.js` |
| C09 | `pdf.pageTransform`, if set, names an exported function, and `pdf` ∈ inputs |
| C10a | Node branch: `test/lib/load-provider.js` `loadNode` requires exactly `parserScript`, composes `P` and finds `parseStatements` (or the custom app's `test.js` hooks) |
| C10b | Page branch: `loadPage` runs exactly the plan pieces 3-12 in a `vm` context where `self = window`; `self[parserGlobal]` is undefined before the `parserScript` piece and defined right after it, with the Node branch's export names |
| C11 | Garbage per declared input, in both branches, inputs deep-frozen: pdf `{id: "garbage.pdf", pages: [[{str: "hello", …}]]}` and `pages: [[]]`; csv `"hello\n"` and `""`; xlsx `{}` and `{Sheet1: [["hello"]]}`. No throw, and `errors` names the input (custom apps: `test.parse` returns `{error}`). Providers without `legacyRepo` also get the garbage configs `5`, `[]`, `"x"`, `{x: 5}` and `{x: {name: 5, kind: 5, mergeInto: 5, exclude: "yes"}}` |
| C12 | Statement apps: `checkResult` on the garbage results (strict without `legacyRepo`). Custom apps: `test.checkResult`, if exported, finds nothing, and the downloads hook returns `[]` for `{error}` |
| C13 | **Browser tier.** Fixtures, if any: rendered, read by the production readers in Chrome (`test/lib/extract.js`), parsed in both branches with no `errors` other than the spec's `expectErrors`; `checkResult` clean in strict mode; providers without `legacyRepo` parsed again with the garbage configs on their first portfolio; both branches give the same result |
| C14 | The page builds and verifies (docs/SECURITY.md); size budget: 2 MiB with pdf.js, 256 KiB without |
| C15 | Provenance: each pinned file's sha256 equals `test/contract/provenance.js`. With `--old-root`, `tools/provenance.js rederive` reapplies the declared edits to the old repositories' git blobs and must reproduce every pinned file byte for byte |
| C16 | `page.html`: required slots present, no unknown slots, and the slot lint (docs/CONTRACT.md, page.html) |
| C17 | The SPDX lines in every source file |
| C18 | Privacy of the tree: no `*.pdf *.xlsx *.xls *.qif *.zip *.png *.jpg *.csv`, no `*.json` besides the three package files, and the marker `SYNTHETIC TEST DATA` in every `fixtures/*.js` |

C10-C14 run only for a descriptor that passes C01-C09, so one mistake is reported once.
`--provider <id>[,<id>…]` restricts the per-provider checks (C04 still compares with every
provider); `--root <dir>` checks another tree; `--csp legacy|hash` is the mode C14 builds with.

## Lints

`node test/lint/run.js [--only <lint>,…]` runs every lint over the files a commit of the tree
would hold (tracked files plus untracked files that `.gitignore` does not exclude). A finding
reads `<file>:<line>:<col> [<lint>/<rule>] <message>` and never quotes private text.

- **headers** (C17): the two lines `SPDX-License-Identifier: Apache-2.0` and the exact copyright
  line at the top of every file except `vendor/**`, `dist/**`, `LICENSE`, `NOTICE` and the package
  files: `// …` in `.js`, `# …` in `.yml` and the dotfiles, `/* … */` in `.css`, `<!-- … -->` in
  `.html` and `.md` (after an optional `<!doctype html>`). A file type without a rule is reported.
- **privacy**: every file except `vendor/**`, read as UTF-8 text. No absolute home-directory paths
  in Linux, macOS or Windows form, and no tilde paths; no e-mail address other than the one in
  the copyright line; no numbers in the two account-number formats; no line of the untracked
  personal denylist (`$S2C_DENYLIST`, default `<config-dir>/denylist.txt`), which holds personal
  names, account numbers and private project names and is never committed. The copyright string
  is blanked out before the e-mail and denylist rules; pinned files that match their pins and
  `dist/**` are exempt from the number rule only. So tracked code computes every machine path at
  run time, and the docs write placeholders.
- **generic**: pages and docs (`dist/**`, `core/page/**`, `providers/*/page.html`,
  `providers/*/README.md`, `README.md`, `NOTICE`, `docs/**`) name no finance app: neither the
  first word of the old QIF expansion (in any case) nor any entry of the untracked app list
  (`$S2C_APPS`, default `<config-dir>/apps.txt`). Shared code, tests and the top-level texts
  (`core/`, `build/`, `tools/`, `test/` apart from `test/legacy/` and the pin list, `.github/`,
  `README.md`, `NOTICE`) do not contain the name, brand, trimmed account prefix or `legacyRepo` of any provider
  that is not a skeleton, as a whole word, case-sensitively: no test file names a provider, and a
  provider's name must not be a word that shared code uses. `docs/` may use provider names as
  examples.
- **sinks** (`core/**`, `providers/**`): the one innerHTML sink, the banned names, clock and
  randomness purity and the `localeCompare` rule (docs/SECURITY.md).
- **sentinels**: a pin may declare `sentinels: [{line, contains}]`, text that must stay on that
  line of the pinned file; each is checked with its own message.
- **invisible**: no literal invisible characters (controls other than tab and line feed, format
  characters, unusual spaces, the byte order mark, private-use characters and the like) outside
  `vendor/**` and `dist/**`; write such a character as an escape.

`test/unit/lint.test.js` gives every rule and every exemption a failing and a passing sample.

## Unit tests

`npm run unit` runs every `test/unit/*.test.js` with `node --test`; synthetic data only. The
browser parts need the pinned headless shell and are skipped, with a message, without it; tests
that need the old repositories skip themselves without them (as in CI).

| File | Tests |
|---|---|
| `differential.test.js` | core modules against the frozen copies of old code in `test/legacy/` (export A, B and C, layout L3, the old ZIP writer and storage functions), 10 000 seeded cases per comparison |
| `files.test.js`, `assemble.test.js`, `escape.test.js`, `zip.test.js`, `readers.test.js` | the core modules: file names and spans, Download all = `allFiles()`, the downloads hook; merges, cycles, code-point order; escaping and forged Html; the ZIP writer; the readers, BOM stripping and every `sheets` fixture of the tree read back exactly |
| `descriptor.test.js`, `result.test.js`, `constants.test.js`, `callgraph.test.js`, `headers.test.js` | the contract code: defaults, precedence and validation; `checkResult`; the app's literal constants equal `core/contract/constants.js`; the derived export call graph; expected headers |
| `page.test.js`, `csp.test.js`, `build.test.js`, `legacy-repro.test.js` | templating and the slot lint; the CSP modes and `verify` (each defect caught, and blocked by Chrome; a fault in `policy()` caught; tags read as Chrome's parser reads them); the build on stub trees (`--root`, `--check`, `--only`, `--inject`); gate G2, the old pages rebuilt byte for byte from each old `build.py` (skipped without the old repositories) |
| `contract.test.js`, `injection.test.js`, `parse-error.test.js`, `harness.test.js`, `storage-compat.test.js` | the contract checks, the smokes, the harness and the storage-compatibility run on the synthetic tree of `test/unit/synthetic-tree.js`: everything passes, and every check has a failing sample |
| `statement-app.test.js`, `etoro-files.test.js` | the statement app against the seven old apps it replaces (skipped without the old repositories); the custom app's files module and hooks |
| `extract.test.js`, `replay.test.js`, `golden.test.js`, `provenance.test.js`, `testlib.test.js` | the test library, extraction and replay, the golden harness and its waivers and canaries, the provenance tool |
| `new-provider.test.js` | the scaffold on scratch copies of the repository: its refusals, the folder it writes, its stop without the browser, and a generated `fixtures/expected.js` that the fixtures golden passes; the dry run's git-status rule and its steps' environment |
| `templates.test.js` | the templates' account labels: one per portfolio id, the currency and then the whole number added where two would be equal, in any input order |

`test/unit/synthetic-tree.js` builds a complete synthetic tree (the real core modules and
statement app, five synthetic providers, a skeleton) that the contract, lint, smoke and harness
tests change one thing at a time; `test/unit/stub-tree.js` builds trees with stub core modules
for the build tests.

## Smoke, fixtures golden, injection, parse error and dry run

No file in `test/smoke/` names a provider: everything provider-specific comes from the
descriptor and the provider's `fixtures/` folder. Each smoke opens the pages from `file://` in a
fresh browser context per page instance (environment E0, the frozen clock, empty storage), and a
page instance fails on any console error, page error or CSP violation (pdf.js's worker fallback
on `file://` aside). The published pages are `dist/<id>/index.html`, which must equal a fresh
build (a stale page is reported, not tested); skeletons and unpublished providers are built into
a temporary directory. `--provider <id>[,<id>…]` restricts each smoke; `--root <dir>` runs it on
another tree.

### Smoke

`node test/smoke/pages.js`: every page has
- the empty state visible and no horizontal overflow at 390 px width;
- a `#status .warn` line after one bogus file per declared input (`zz-not-a-statement.pdf` with
  bytes `not a pdf`, `.xlsx` with `not a zip`, `.csv` with `hello`), delivered once through the
  picker and once, in a fresh page, by a synthetic drop on `document`;
- with `testing.fixtures`: the rendered fixtures load, `#results` shows at least one card, and
  every card button and every enabled toolbar button gives one non-empty download (zips unpack
  with valid CRCs).

Without `--provider` it also checks the landing page: equal to a fresh render, every link leads
to a built page, no overflow.

### Fixtures golden

`node test/smoke/fixtures-golden.js [--provider <id>] [--update]`: for each provider with
`testing.fixtures`, the page is loaded with its rendered fixtures (one picker batch, or one file
at a time on a single-file picker), and for every mode (statement apps: balance, tradelog,
holdings; custom apps: their `modes`) × the ranges full, first and last, every download is
captured. Every captured record (trigger, account, card, kind, raw name, MIME type, size, sha256,
zip entries) must equal the downloads hook's Node rebuild of the same state, so `--update` can
never record a page bug, and must equal `fixtures/expected.js`. `--update` regenerates
`expected.js` for review once the page equals the hook. A provider with fixtures but no
`expected.js` fails with "run --update"; an `expected.js` recorded for other inputs is stale. For
a published provider the page is its `dist/` page, so run `node build/build.js` first.

### Fixture spec format

`fixtures/statements.js` and `fixtures/hostile.js` are `.js` modules with the SPDX lines and the
marker `SYNTHETIC TEST DATA`; `test/lib/fixtures.js` validates them strictly. One entry per file,
in one of three forms:

```js
module.exports = {
  marker: "SYNTHETIC TEST DATA",
  files: [
    // PDF: rendered by test/lib/minipdf.js (Helvetica text runs; size defaults to 10)
    { name: "example-2026-01.pdf", pages: [[{ x: 50, y: 800, size: 16, text: "Example Bank" } /* … */]] },
    // CSV or other text: written as a UTF-8 file
    { name: "example-history-2026-02.csv", text: "Example Bank transaction history\n…" },
    // XLSX: rendered by test/lib/mkxlsx.js; the value is exactly the workbook object the reader returns
    { name: "example-2026.xlsx", sheets: { "Account Summary": [["Currency", "USD"]], "Account Activity": [["Date", "Amount"], [46023, 100]] } },
  ],
  expectErrors: ["example-2026-03-copy.pdf"],   // inputs that must produce an errors entry
};
```

For `sheets`, strings become inline strings, numbers stay numbers, booleans become `t="b"` cells
and `null` an empty cell. File names must differ even ignoring case. Each PDF text run becomes one
pdf.js item with `transform [size, 0, 0, size, x, y]`; the text must be WinAnsi-encodable. The
spec may build its files with small helper functions, as both templates do.

### Injection

`node test/smoke/injection.js`, on every page whose provider has `testing.fixtures`:
- **Configurator pages:** the fixtures are loaded once to read `<p0>`, the first portfolio id;
  then a fresh page seeded with `{<p0>: {name: "<img src=x onerror=\"window.__pwned=1\">", kind:
  "x\" onmouseover=\"window.__pwned=1"}}` loads them again.
- **Providers with `fixtures/hostile.js`:** its files, which carry markup in their content (every
  markup tag in their strings is a payload).

Each payload page is compared with its twin (the same page with plain stand-ins), state by state:
every mode at the full range and the last month. A payload page must show no script run
(`window.__pwned` stays undefined after the payloads' events are dispatched on every element of
`<main>`), no CSP violation, no element with an `on*` attribute and no extra payload tag, the
payload as literal text (the seeded name on p0's card and in its configurator field, the kind as
the class token `other`; a hostile file's payload in every render target the page has, `#cards`,
`#config-list`, `#status` and `#diagnostics`, in some state), and every download equal to the
hook's rebuild (for statement apps, Download all = `allFiles()`). A full run also requires every
render target that some payload page has to show a payload as literal text on some page.

### Parse error

`node test/smoke/parse-error.js`: the first skeleton, in folder order, with a statement app whose
inputs include csv and that has `testing.fixtures` (in this repository the CSV template), is built
with `--include-skeletons --only <id> --inject test/smoke/inject/throw-on-marker.js --out <tmp>`.
The injected piece makes `parseStatements` throw `new Error("injected failure")` when a statement
id contains `THROW`. Steps:
1. Load the fixtures and capture every download (list A).
2. Add a copy of the spec's first CSV fixture outside `expectErrors`, named `THROW.csv`: `#busy`
   must be hidden; `#status` must show the warn line `Could not read these statements: injected
   failure` exactly once and be otherwise unchanged; the cards, the range, the configurator, the
   diagnostics, `#results` and `#empty` unchanged; the downloads exactly list A.
3. Clear: the empty state shows, with no warn line.

A tree without such a skeleton fails: a smoke that checks nothing is not green.

### Dry run

`node test/contract/new-provider-dryrun.js [--keep]` proves that adding a provider needs no edit
to `core/`, `build/`, `test/` or `tools/`, and that a freshly scaffolded provider is green. It
copies the tree (the files a commit would hold) into a temporary directory, makes it a git
repository with one commit, links its `test/node_modules` to this repository's, and runs there,
each step as its own process, with what CI has: its own `<private-dir>`, an empty `<old-root>`
and an empty `<config-dir>`, and no `S2C_STATEMENTS`, `S2C_DENYLIST` or `S2C_APPS`, so your
untracked user config (a `refuse` list, say) cannot change the result. The lints of step 4 run in
the dry run's own process, so your untracked denylist and app list still apply to the new files:
1. `node tools/new-provider.js zz-dryrun-pdf --name "Dry Run Bank" --from pdf`, and the same for
   `zz-dryrun-csv` from csv;
2. each new folder must have a `frozen.js` and a `fixtures/expected.js` the scaffold generated: it
   names "Dry Run Bank", never "Example Bank", and differs from the template's;
3. `node build/build.js`, then `node build/build.js --check`;
4. the contract checks of both tiers for the two new providers, the harness with `--all-fixtures
   --browser` (both templates and the new providers included), the pages smoke, the fixtures
   golden (no `--update`) and the injection smoke for the two new providers, and the lints on the
   new providers' files and pages; each step must also print the lines that show it checked them;
5. `git status --porcelain` must list exactly the new providers' files, `dist/zz-dryrun-*/index.html`
   and a modified `dist/index.html`.

## Generic harness

```
node test/harness/run.js --provider <id> [--statements <dir> | --statements <id>=<dir>] [--browser] [--dump]
                         [--reference <file>] [--allow-unknown] [--strict | --no-strict] [--out <dir>]
                         [--only H5,H8,…] [--node-readers] [--root <dir>]
node test/harness/run.js --all-fixtures [--browser] …   # every provider with testing.fixtures, on its rendered fixtures (CI)
```

It works for any provider and any statement folder, with no per-provider test code beyond the
optional `test.js`, and reaches the provider only through its handle (test library API, below).
The statement folder is resolved by the private data rules (below); a folder that holds a fixture
spec (`statements.js`) is a fixtures folder, whose files are rendered first and whose errors are
the spec's `expectErrors`. The console shows each step's status and counts only, never a file
name, an account name or an amount; the details go to `<out>/<id>/report.json`, where `<out>` is
`--out` or `<private-dir>/harness/<run>`. It exits 1 on any failure. `--strict` (warnings fail,
and H6b, H7, H9 and H10's reversed order gate) is the default for providers without
`frozen.legacyRepo`.

"Modes" means the ledger modes for statement apps and the descriptor's `modes` for custom apps.

| Step | Applies to | What |
|---|---|---|
| H1 | all | Load: normalise and resolve the descriptor; `loadNode` and `loadPage` |
| H2 | all | Inputs: the files of the folder a declared reader accepts, in JavaScript string order (rendered fixtures keep the spec's order) |
| H3 | all | Extract: the production readers in Chrome (cached), or with `--node-readers` the Node twins for CSV and XLSX (PDF always in Chrome); then the page transform |
| H4 | all | Per file: parse alone in the first mode, reported as recognised or with an error |
| H5 | all | Parse all in every mode: no throw; statement apps: `checkResult` (strict for new providers), errors exactly the declared ones, no warnings unless `testing.allowWarnings`, no skipped rows of category `unknown` unless `--allow-unknown`; custom apps: no `{error}`, `test.checkResult` finds nothing |
| H6 | all | Reconcile. Statement apps: for each account and `withTrades ∈ {false, true}`, the running balance from `openingBalance` must meet every month-end value within 0.005, with no export problems beyond the declaration. **H6b:** for each month with entries, opening + Σ entries = closing. Custom apps: `test.reconcile` in every mode finds nothing |
| H7 | statement apps with `testing.gapDrop` | Gap drop (3 months or more): drop the inputs whose parsed months include a middle month, two consecutive months, the first month an account appears, the first month, the last month; bridges plus `firstOpenings` must still reach every loaded closing |
| H8 | all | Files, for every mode × {full range, each single month}, from the downloads hook: CSV parse-back (RFC 4180), cell counts, numeric columns and the expected header; QIF records; zips (valid CRCs, unique names); statement apps also the span rules of the names, Download all = [Accounts, card files], the Accounts rows and the Combined rows |
| H9 | statement apps | Config contract: rename the first portfolio, exclude the last, flip a kind, merge two portfolios of the same currency (month-end values are the sums within 0.01), give two the same name |
| H10 | all | Determinism: two parses equal; inputs deep-frozen (deep-compared for legacy providers); reversed input order gives the same result (skipped with one input, a single-file picker or duplicate-statement errors) |
| H11 | providers with a configurator | `frozen.configIdPattern` matches every portfolio id (skipped without frozen.js) |
| H12 | all, with `--browser` | The built page, served from 127.0.0.1: for each mode × {full, last month}, every captured download equals the hook's rebuild, and the range offers the hook's months; the bogus file warns (alone, by picker and by drop, and first and last in the full batch); no errors, violations or overflow; configurator settings survive a reload, then Reset |
| H13 | all, with `--dump` | Write the extracted items, each PDF page's `StatementLayout.pageLines` text, the page transform's output, the CSV texts and the workbooks to `<out>/<id>/dump/` |
| H14 | `--reference <file>` | `test.reference(result, file, ctx)` finds nothing |

**Private declarations for real statements.** Real folders can legitimately produce errors or
card problems. Declaring them in a tracked file would leak private file names, so the untracked
user config may give, per provider, `expectErrors` (file names whose `errors` entry is expected)
and `allowProblems` (the number of problem lines H6 may see). H5 and H6 then require exactly
those errors and at most that many problems, and the report prints only the counts. Fixture
folders never use the private declarations.

## Golden-equivalence harness

`test/golden/run.js` drives each migrated provider's old page (read only, from
`<old-root>/<legacyRepo>/index.html`) and its new page with the same scenario list, under the
same determinism controls, and compares every download, every stored setting and the UI. It is a
local gate: it needs the old repositories and real statements.

```
node test/golden/run.js determinism --tier quick [--providers a,b]            # old pages twice
node test/golden/run.js capture --tier quick|full|exhaustive [--providers a,b] [--env E0,E1,E2] [--jobs N]
node test/golden/run.js compare --tier T [--providers a,b] [--page dist|<dir>]   # new pages against the stored goldens
node test/golden/run.js live --tier T [--providers a,b]                       # old and new side by side
node test/golden/run.js canary --provider <id>                                # the four canaries
node test/golden/run.js baseline [--providers a,b] [--no-live]                # baseline integrity alone
node test/golden/run.js extract [--providers a,b]                             # the Chrome extraction cache
node test/golden/run.js replay --parser old|new [--providers a,b]             # Node replay
```

### Baseline integrity

Every invocation checks each old repository before and after the run, read-only: git plumbing
only (`rev-parse HEAD` equals `frozen.legacyHead`; `cat-file blob` for the files it reads), the
sha256 of `index.html` against `frozen.legacyIndexSha256`, a file manifest (type, size, mtime,
sha256, link targets; symlinks never followed) taken before and after and compared, and, unless
`--no-live`, the live page at `frozen.legacyUrl`. Any difference fails the run. Nothing writes
inside an old repository, and npm never runs there.

### Determinism controls

1. **Browser:** one binary and one client, their versions written into every golden.
2. **A fresh context per page instance,** with a fixed viewport (1100 × 900), scale, colour
   scheme, reduced motion, blocked service workers.
3. **Clock:** fixed at `2026-01-02T03:04:06Z` before the page loads; timers keep running. This
   fixes the zip DOS time.
4. **Environments:** E0 `en-US` / `UTC`; E1 `sv-SE` / `America/Los_Angeles`; E2 `en-SG` /
   `Asia/Singapore`.
5. **Storage:** seeded by an init script with a `sessionStorage` guard, so reloads do not reseed.
6. **Inputs:** each batch is an explicit, ordered list of paths; a synthetic extra file is placed
   explicitly first or last. A batch is delivered through the picker, or by a synthetic drop on
   `document` built from a hidden helper input's `FileList`.
7. **Settle:** after file input, poll until `#busy` is hidden (or, where a parse threw, until the
   busy text has stood still for 1 s), then two animation frames.

### Capture method

`test/lib/capture.js` is installed as an init script on both pages. It remembers every object
URL's Blob and records `{name: a.download, blob}` when an anchor with `download` is clicked,
without downloading; `take()` returns the raw name, the MIME type, the size and the sha256, and
every zip is unpacked by the store-only reader of `test/lib/unzip.js` into its entries (name,
size, CRC-32 checked, sha256, DOS time and date). It also logs CSP violations, errors and
unhandled rejections. On the quick tier, a second pass lets the downloads through, and the real
download events must give the same bytes. The driver clicks every `#cards button.dl` in DOM
order, then `#accounts`, `#combined` and `#zip`; a disabled control is recorded as disabled. The
capture record is `{trigger, account, card, kind, name, type, size, sha256, entries?}`.

### Scenario matrix

One load of the old page with empty storage (the probe) records the months, the mode switch, the
portfolios and the card titles; the scenario list is derived from it deterministically and
stored with the goldens. Scenario ids follow `<id>/<E>/<O>/<I>/<C>/<M>/<R>` and use indexes
(`p0`, `p1`), never account names.

| Axis | Values |
|---|---|
| **I** inputs | all; one middle file left out; the last file only; a bogus file first or last; per input type alone when there are several. Single-file pickers: replace sequences instead |
| **O** order and delivery | sorted, one batch; reversed; two batches plus re-adding; load, Clear, load; the sorted list by drop |
| **C** config, through the UI | none; rename p0 to `=Renamed "A&B", <x>`; kinds; exclude; merge; all at once; in the full tier each portfolio renamed, retyped, excluded and merged, two given the same name, a cross-currency merge |
| **C** config, seeded | `kind: "bank"`, `kind: "foo"`, an unknown `mergeInto`, a cycle, a chain, an excluded root, a padded name, raw strings `{not json`, `null`, `[]`, `5`, `"x"`, and **C-seed-badname** (`{"<p0>": {"name": 5}}`), on which the migrated parsers throw |
| **M** mode | every mode, clicked from JavaScript; seeded mode values, including other providers' ids, `""` and `garbage` |
| **R** range | full, first, last, middle, reversed; in the full tier every single month, prefix and suffix, and the range after each gap; in the exhaustive tier every pair |
| **E** environment | E0 everywhere; E1 and E2 for a subset |
| **X** cross-load | the final storage of each page seeded into a fresh page of the other kind |
| **S** security (configurator pages) | **S-benign**, a markup name the old sinks already escape, compared like any scenario; **S-break**, a kind that breaks the old card's markup, run on the new page only and checked against the hook (SX1) |

Tiers: **quick** (minutes per provider), **full** (every axis; the migration gate) and
**exhaustive** (full plus every range pair).

### Comparison and waivers

For each scenario and each step:
1. the step lists must be identical;
2. **downloads** (hard failure): the ordered capture records, zip entries included, must be
   identical, apart from SX1;
3. **storage** (hard failure): the provider's mode and config strings must be identical after
   load and after every action, and the new page may write no other key;
4. **UI snapshot** (hard failure, apart from waivers): the serialised `#status`, `#cards`,
   `#diagnostics` and configurator list, `#config-count`, the range selects, the mode buttons, the
   hidden states and busy text, the toolbar buttons; once per provider, a static snapshot of
   `<main>` in the empty state;
5. **new page errors** (hard failure): no console error, page error or CSP violation.

On a mismatch both versions are saved under `<private-dir>/diff/<run>/`; the console prints only
scenario ids, triggers and counts. `test/golden/waivers.js` holds the only allowed differences,
and the report lists every use:
- **W1:** in the static snapshot, the old QIF expansion is read as "a QIF file", the one text
  change of the new pages;
- **W2:** where the old page's parse threw (C-seed-badname), the new page shows the
  `Could not read these statements: …` line and a hidden busy line; downloads and storage must
  still match, and the harness requires W2 on exactly those pages and steps;
- **W3:** one legacy configurator's old element ids mapped to the new ones, and the old inline
  style of `#empty`;
- **SX1** (the one download exception, S-break only): the new page's Download all must equal the
  replayed `allFiles()` and its other downloads the hook's rebuild.

There is never a storage waiver.

### Self-tests of the harness

- **Determinism:** the quick tier of every old page captured twice must be identical.
- **Canaries:** `canary --provider <id>` builds four deliberately broken pages (`--inject
  test/golden/canaries/<c>.js`: a brand changed by a space, a cent changed in a CSV, the zip
  entries reversed, the zip time moved) and each comparison must fail in exactly the expected
  way, read from the comparator's structured report.
- **Baseline integrity** on every invocation.

### Browser extraction and Node replay

`extract` builds `test/pages/extract.template.html` with the production readers and pdf.js into
`<private-dir>/extract/` and reads statements in Chrome, with the app's reader selection; results
are cached by the sha256 of the file and of the reader sources. `replay` rebuilds every captured
step in Node through the downloads hook only: the captured config, mode, range and add order,
`handle.parse`, `handle.downloads`, every zip built with `zipParts(files, now)`. `--parser old`
uses the old repository's parser with the runtime from `frozen.js` alone; `--parser new` the
provider's own. A matching Download-all record proves that `allFiles()` equals the page's scan of
the rendered cards for that step.

### Golden store and privacy

`<private-dir>` holds `extract/`, `golden/<id>/…/manifest.json` (versions, scenario list, step
records, UI snapshots, storage strings), `reports/<run>.json` (counts and hashes) and
`diff/<run>/`. The goldens contain private data; `test/lib/private.js` guarantees they never land
in the repository, and `docs/MIGRATION.md` records only tiers, dates, counts and hashes.

## Storage compatibility

`node test/storage-compat/run.js [--self-test]` serves the old and the new pages from one
origin (`test/lib/serve.js`: an explicit allowlist on 127.0.0.1, nothing else) and, in one browser
context, for each provider:
- **(a) new writes, old reads:** the new page loads the statements, takes the golden harness's
  combined configurator operations and a mode; then the old page, in the same context, must show
  the same configurator state and mode, read exactly the strings the new page left, change
  nothing, and give the same downloads;
- **(b)** the reverse;
- **(c)** every storage call of a new page is on its own frozen keys, with mode values from
  `frozen.modeValues` and configs holding only `name`, `kind ∈ {investment, cash}`, `mergeInto`
  and `exclude: true`; no page reads or changes another provider's key or an unrelated page's;
- **keys:** the old and the new page make the same storage calls with the same strings (the two
  writers, after the same steps, and the two readers). This is the check that catches a value
  written in another format with the same meaning, such as re-indented or reordered JSON.

A setting that no download or configurator state shows would make the comparison blind, so the
run reports `vacuous` unless the settings change the writer's configurator and downloads
(without a configurator, the mode must change the downloads).

`--self-test` builds three mutants (a renamed config key, a renamed mode key, a page that clears
storage) and requires each to fail in its expected categories.

## Private data rules

`test/lib/private.js`:
- **Roots, computed at run time and never written in tracked files:** `<old-root>` = `--old-root`,
  else `$S2C_OLD_ROOT`, else the home directory; `<statements-dir>` = `$S2C_STATEMENTS`, else the
  `statements` folder in the home directory; `<private-dir>` = `$S2C_PRIVATE`, else `statement2csv`
  under `$XDG_CACHE_HOME` or under the home directory's `.cache`, created with mode 0700;
  `<config-dir>` = `statement2csv` under `$XDG_CONFIG_HOME` or under the home directory's
  `.config`.
- **The untracked user config** `<config-dir>/statements.js`, never in the repository:

  ```js
  module.exports = {
    providers: {                       // per provider id; every field optional
      example: { dir: "<absolute path>", expectErrors: ["<file name>"], allowProblems: 0 },
    },
    refuse: ["<absolute path>"],       // extra folders no harness may read or write
  };
  ```

  A file that exists but does not load, or that has an unknown key or a wrong type, stops every
  harness.
- **Statement folders** are resolved in this order: `--statements <id>=<dir>`; `providers[<id>].dir`
  in the user config; a case-insensitive match of the id (then of the old repository's name
  without `2csv`) among the folders of `<statements-dir>`; otherwise an error that says how to give
  the mapping. Files are read by path and never copied into the repository.
- **Outputs and reads.** Every output path is checked: no output in this repository, an old
  repository, `<statements-dir>`, a configured statement folder or a refused path. No harness
  reads a refused path.
- **Logs** show counts and hashes; names, amounts and diffs appear only in files under
  `<private-dir>`.
- **CI has no private data:** no user config, no old repositories, so every private gate is
  local.

## CI scope

Two workflows in `.github/workflows/`, each on a clean checkout on `ubuntu-24.04` with Node 22,
with no secrets and synthetic data only:

- **`build-check.yml`** (CI, permission `contents: read`) runs on every push to a branch other
  than `main` and on every pull request; `pages.yml` runs it on every push to `main`. Its steps,
  in order:
  1. `node --check` on every tracked `.js` file;
  2. `node build/build.js --check`;
  3. `node test/contract/run.js --tier node` (C15 checks hashes only: the old repositories are
     absent);
  4. `node test/lint/run.js`;
  5. `cd test && npm ci --ignore-scripts` and the headless-shell install;
  6. `npm run unit`, after the install, so that its tests that need Chrome run: without Chrome
     they would skip, but steps 7 to 10 would then fail, so such a skip cannot pass unnoticed;
     the tests that need the old repositories skip themselves;
  7. `node test/contract/run.js --tier browser`;
  8. `npm run smoke`;
  9. `node test/harness/run.js --all-fixtures --browser`;
  10. `node test/contract/new-provider-dryrun.js`.
- **`pages.yml`** runs on every push to `main`: `build-check.yml` on the same commit, then, only
  if it passed, `node build/build.js --check` once more and the deploy of the committed `dist/`
  to GitHub Pages (docs/ARCHITECTURE.md, output layout and GitHub Pages; docs/SECURITY.md, CI
  and deployment). One deployment runs at a time; a run still waiting when a newer push arrives
  is replaced by the newer one, whose commit includes it.

The golden harness, the real-statement harness, replay and storage compatibility stay local
gates.

## Test library API

Several tools code against these modules of `test/lib/`, so their signatures are fixed. All are
CommonJS modules; nothing in `test/lib/` names a provider.

- **`private.js`:** `oldRoot()`, `statementsRoot()`, `configDir()`; `privateDir(...parts)`;
  `userConfig()`; `statementsFor(id, {cli})` → `{dir, expectErrors, allowProblems}`;
  `assertSafeOutput(path)`; `assertSafeInput(path, {allowed})`.
- **`baseline.js`:** `checkGit(frozen, {oldRoot, files})`; `fsManifest(dir)`;
  `diffManifest(before, after)`; `liveSha256(url)`; `before(frozens, {live})`; `after(manifests)`.
- **`browser.js`:** `launch()`; `versions(browser)`; `newContext(browser, env, seed)`, which
  installs the capture script, the storage seed and the fixed clock; `chromePath()`; `ENVS`,
  `FIXED_TIME`.
- **`capture.js`:** `INIT_SCRIPT`; `take(page)`; `pageErrors(page)`.
- **`page-driver.js`:** `open(context, url, {legacyDom})` → a driver with `load(paths, {via:
  "picker" | "drop"})`, `clear()`, `setRange(from, to)`, `setMode(id)`, `config(op)`, `probe()`,
  `clickAll()`, `storage(keys)`, `snapshot()`, `staticSnapshot()`, `addOrder()`, `errors()` and
  `close()`.
- **`load-provider.js`:** `discover({root, includeSkeletons})`; `loadNode(id, {root, parser:
  "new" | "old", oldRoot})` and `loadPage(id, {root})` → a `ProviderHandle`:

  ```js
  ProviderHandle = {
    id, dir, app,              // "statement" | "custom"
    D, R, frozen,              // normalised descriptor, runtime object, frozen.js (or null)
    parser, P, test,           // parserScript exports, composed namespace, test.js exports (or null)
    modes,                     // mode ids
    parse(statements, { config, mode }),        // → result | { error }
    downloads(result, { mode, from, to }),      // → Download[] ([] for a null result)
    expectedHeader(download, { mode }),         // → string | null
    reconcile(result, { mode }),                // → string[]
  }
  ```

- **`extract.js`:** `extract(paths, {handle, readers: "chrome" | "node", cacheDir, browser,
  allowed})` → `{statements, byPath, failed}`.
- **`replay.js`:** `replayStep(handle, statementsByPath, step, {now, prevResult})` → `{result,
  records}`; `compareRecords(captured, replayed)` → mismatches `{index, trigger, field, expected,
  actual}`.
- **Helpers:** `fixtures.js` (`loadSpec(dir)`, `renderFixtures(spec, outDir)`), `canon.js`,
  `csvread.js` (`parseCsv`), `unzip.js`, `minipdf.js` (`renderPdf(pages)`), `mkxlsx.js`
  (`renderXlsx(sheets)`), `prng.js` (`mulberry32(seed)`), `serve.js` (`serve(allowlist)`),
  `reconcile.js`.
