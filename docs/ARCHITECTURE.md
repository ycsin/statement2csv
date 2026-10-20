<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->

# Architecture

Every converter is one self-contained HTML page, `dist/<id>/index.html`, that works offline and
from disk. The build assembles it from the shared core (`core/`), the provider's folder
(`providers/<id>/`, docs/CONTRACT.md) and, for PDF inputs, the pinned pdf.js in `vendor/`. This
document describes the core modules, their globals, the order the build inlines them in, the data
flow, and the build itself. Where each piece of code comes from (the old file and lines it moved
from, the pinned copies and their declared edits) is in the derivation map of
`docs/MIGRATION.md`; security matters (CSP, escaping, storage keys) are in `docs/SECURITY.md`.

## Core modules

Every browser module is UMD: `(function (root, factory) { if (typeof module === "object" &&
module.exports) module.exports = factory(…); else root.X = factory(…); })(typeof self !==
"undefined" ? self : this, …)`. In a page it sets one global on `self`; in Node `module.exports`
holds the same object, so the unit tests run the files the pages run. No module touches the DOM,
storage, the clock or the network while it is evaluated; only the app script runs at load.

A **pinned** module is a byte copy of an old file, apart from its declared edits, whose sha256
`test/contract/provenance.js` records (contract check C15); it changes only through
`node tools/provenance.js rederive` with a declared edit. A **moved** module keeps the old
function bodies, with only the substitutions the derivation map lists.

| File | Global | Public API | Kind |
|---|---|---|---|
| `core/escape.js` | `StatementEscape` | `esc, html, setHtml, cssToken` | moved (`esc`), new (`html`, `setHtml`, `cssToken`) |
| `core/shell.js` | `StatementShell` | `$, setBusy, fmtInt, fmtMoney, monthLabel, download, wireInput` | moved |
| `core/zip.js` | `StatementZip` | `crc32, zipParts, zip` | moved; `zipParts(files, now)` split out |
| `core/storage.js` | `StatementStorage` | `loadMode, saveMode, loadConfig, saveConfig` | moved, parameterised by key |
| `core/export.js` | `StatementExport` | the 19 functions of `CORE_EXPORT_NAMES` | pinned (export layer C, four declared edits) |
| `core/layout.js` | `StatementLayout` | `pageLines, tableRows` | pinned (layout L3, no edits) |
| `core/xlsx.js` | `Xlsx` | `read(bytes, inflateRaw)` | pinned (no edits) |
| `core/readers/pdf.js` | `StatementPdf` | `accept, accepts, init, read` | moved; page transform hook |
| `core/readers/csv.js` | `StatementCsv` | `accept, accepts, read` | moved |
| `core/readers/xlsx.js` | `StatementXlsx` | `accept, accepts, inflateRaw, read` | moved |
| `core/files.js` | `StatementFiles` | `create(ctx)`, including the downloads hook `downloads()` | moved; `cards`, `allFiles`, `downloads` new |
| `core/assemble.js` | `StatementAssemble` | `build(input)` | new; used by new providers only |
| `core/app/statement-app.js` | (none) | runs at load | the multi-account app |
| `core/contract/*.js` | (Node only) | descriptor, result, constants, call graph, headers | never inlined |

### core/escape.js

```js
StatementEscape.esc(s)        // String(s) with & < > " ' replaced by entities
StatementEscape.html`…${v}…`  // → Html. Each interpolation renders as:
                              //   - an Html value → its markup unchanged;
                              //   - an Array whose elements are all Html values or such Arrays → their markup joined with "";
                              //   - anything else → esc(String(v)): undefined → "undefined", a data array → "a,b",
                              //     exactly like a template literal
StatementEscape.setHtml(el, h) // the ONLY innerHTML assignment in core/ and providers/; throws TypeError unless h is Html
StatementEscape.cssToken(s)   // /^[a-z0-9-]+$/.test(String(s)) ? String(s) : "other"   (for class="tag ${…}")
```

Html values are recognised by identity, never by shape: `escape.js` declares a module-private
`class Html` and a module-private `WeakSet`; only the `html` tag creates instances, freezes each
one and adds it to the set. An object from `JSON.parse` (localStorage is writable by every page
on the origin), an object with a custom `toString`, or a look-alike such as `{__html: "<b>"}` is
therefore escaped like any other value. `html` has no `raw()` escape hatch: markup can only come
from literal template text. docs/SECURITY.md has the rule this enforces.

### core/shell.js

- `$(sel)` returns `document.querySelector(sel)`.
- `setBusy(msg)` sets the `#busy` text and `hidden = !msg`.
- `fmtInt(n)` and `fmtMoney(n)` use `toLocaleString`. They are UI only and never reach a file.
- `monthLabel("YYYY-MM")` returns the month in the browser's locale (`{month: "short", year:
  "numeric"}`).
- `download(name, blob)`: an anchor with `download` and an object URL, revoked after 1 s.
- `wireInput({onFiles, onMode, onRange, onClear})` registers, in this order: `#drop` click and
  keydown; `#picker` change (`onFiles(picker.files)`, then the picker is reset); the document's
  `dragenter`/`dragover`, `dragleave`/`drop` and a second `drop` that calls
  `onFiles(e.dataTransfer.files)`; `#mode` clicks (`button[data-mode]`); `#from` and `#to`
  changes; `#clear` click. `onFiles` receives the `FileList` itself.

### core/zip.js

- `crc32(bytes)` is the table-driven CRC-32.
- `zipParts(files, now)` returns the parts of a store-only zip: the UTF-8 name flag, the DOS time
  from the local getters of `now`, no ZIP64. `files` are `{name, text}`; other fields are ignored.
- `zip(files)` returns `new Blob(zipParts(files, new Date()), {type: "application/zip"})`, the
  only clock read in the core. Node builds the same bytes with a fixed `now` under the page's
  time zone.

### core/export.js

The export layer (pinned). API: `qif, round2, pad, monthGaps, prevMonth, lastDayOf, dayBefore,
inRange, tradesCsv, transactionsCsv, valuationsCsv, adjustedEntries, adjustedCsv, openingBalance,
accountsCsv, combinedTradesCsv, combinedTransactionsCsv, csvCell, csv`.

- `adjustedEntries(account, from, to, earliestMonth, withTrades)` is the heart of every
  transactions file: the account's cash entries per month, a "Balance change not covered by
  statements" entry where a month is missing (or the account starts after the earliest loaded
  month), a "Returns (month-end adjustment)" entry so that the running balance of a non-bank
  account meets each month's closing, and, for a bank account, a `problem` when a month does not
  reconcile exactly. With `withTrades`, every trade is a zero-amount line.
- `openingBalance` is the balance just before the first exported entry, the start of the QIF and
  the Accounts CSV.
- `csv(header, rows)` and `csvCell(v)` quote as RFC 4180 does (a cell with `"`, `,` or a line
  break) and guard formulas: a text cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage
  return, and is not a number, gets a leading `'`. Providers that write their own files reuse
  them.

### core/layout.js and the provider copies

`pageLines(items)` returns the lines of one PDF page, top to bottom: `[{y, h, text, items: [{s, x,
w}]}]`. It drops fake-bold duplicates (same text, |dx| < 1, |dy| < 0.5), groups items into lines
at |dy| ≤ 0.4·min(h), merges fragments closer than 0.6·h (adding a space above 0.15·h), and joins
the cells of a line with two spaces. `tableRows(lines, start, end, rowGap)` is kept because the
file is pinned. PDF providers declare `uses: ["layout"]`. Two migrated providers keep their own
layout variants as `providers/<id>/layout.js` (global `MariLayout`), because the shared one is not
proven neutral on their statements.

### core/storage.js

```js
loadMode(key, ids)     // the stored value if it is one of ids.slice(1), else ids[0]; ids[0] on any exception
saveMode(key, mode)    // localStorage.setItem(key, mode), ignoring a storage that is unavailable
loadConfig(key)        // key == null → {} ; JSON.parse(localStorage.getItem(key)) || {} ; {} on any exception
saveConfig(key, cfg)   // localStorage.setItem(key, JSON.stringify(cfg)), ignoring a storage that is unavailable
```

The app writes the mode key at start-up (the loaded value), and the configurator writes only
`name`, `kind ∈ {investment, cash}`, `mergeInto` and `exclude: true`. No other key is ever
written (docs/SECURITY.md, storage keys).

### Readers

- **`StatementPdf`**: `accept = "application/pdf,.pdf"`; `accepts(f) = f.type ===
  "application/pdf" || /\.pdf$/i.test(f.name)`. `init()` starts pdf.js's worker from a Blob of
  the embedded `#pdf-worker-src` text (`text/javascript`), so it works from `file://`. `read(file,
  transform = null)` reads every page's text items with `getDocument({data, isEvalSupported:
  false})` and pushes `transform ? transform(items) : items` per page; it destroys the document
  afterwards.
- **`StatementCsv`**: `accept = "text/csv,.csv"`; `accepts(f) = f.type === "text/csv" ||
  /\.csv$/i.test(f.name)`; `read(f) = {id: f.name, csv: await f.text()}` (`text()` strips a
  leading BOM).
- **`StatementXlsx`**: `accept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`;
  `accepts(f)` tests the name and that MIME type; `inflateRaw(data)` uses `DecompressionStream`;
  `read(f) = {id: f.name, workbook: await Xlsx.read(bytes, inflateRaw)}`.

Errors thrown by `read` propagate unchanged; the apps list them as `<file name>: <message>`.
Reader selection is csv → xlsx → pdf among the declared inputs (docs/CONTRACT.md, input
statement objects).

### core/xlsx.js

The workbook reader: the zip central directory, stored and deflated entries, shared strings,
`inlineStr`, no ZIP64, `r=` column references honoured. Pages use it through `StatementXlsx`;
`test/lib/mkxlsx.js` and the Node side of the tests use it with `zlib.inflateRawSync`.

### core/files.js

The statement app's file assembly, as a pure function of the app's state:

```js
const F = StatementFiles.create({
  P,                                   // composed namespace (docs/CONTRACT.md, the parser module)
  result: () => state.result,          // current Result (non-null when any method is called)
  mode: () => state.mode,              // "balance" | "tradelog" | "holdings"
  range: () => ({ from, to }),         // already swapped so that from <= to
  naming: { accountPrefix, brand, groupNoun, slug },
  kindModel: "standard" | "investment-cash",
});
F.modeOf(name)        // standard: kind !== "investment" ? "balance" : mode(); investment-cash: kind === "cash" ? "balance" : mode()
F.earliest()          // result().months[0].month
F.span()              // from === to ? from : `${from}_to_${to}`
F.exportsFor(name)    // { vals, problems, adjustments, tradeLines, files: [{kind, label, count}], balancing }
F.fileFor(name, kind) // QIF `${accountPrefix}${name} - ${span}.qif`, CSV `${accountPrefix}${name} - ${kind} - ${span}.csv`
F.accountsFile()      // `${brand} accounts - ${span}.csv`; Name column `${accountPrefix}${name}`
F.combinedFiles()     // `${brand} all ${groupNoun} - transactions - ${span}.csv`, and a trades file first when an account in holdings mode has trades in range
F.zipName(which)      // which ∈ {"csv", "combined"} → `${slug}-${which}-${from}_to_${to}.zip` (always _to_)
F.cards()             // [{name, files}] for each account with files or month-end values, in result order
F.allFiles()          // THE Download-all entry list: [accountsFile(), …each card's files in button order]
F.downloads()         // the downloads hook (docs/CONTRACT.md), in the page driver's click order; [] without a result
```

The page's `#zip` handler still scans the rendered `#cards button.dl` (as the old pages did);
replay and the smokes prove on every captured state that the scan equals `allFiles()`
(docs/TESTING.md). Account names that an HTML attribute cannot carry back (with a CR or a NUL)
are the one reviewed exception (docs/SECURITY.md).

### core/assemble.js

For new providers: the configurator's overrides applied to the portfolios a parser found, and the
statement-app result built (docs/CONTRACT.md, Result shape).

```js
StatementAssemble.build({
  raw,              // { [portfolioId]: { label, names (oldest → newest, label last), kind, currency,
                    //   months: { "YYYY-MM": { monthEnd, opening, closing, fx, partial?, startDate? } },
                    //   cash: Cash[], trades: Trade[], fromStatements?: boolean /* default true; false → downloadOnly */ } }
  config,           // as loaded; non-objects are treated as {}
  months,           // [{ month, id? }] months covered by the loaded inputs; any order, repeats allowed
  statements,       // number
  downloads,        // number | undefined
  errors, warnings, skippedRows,   // copied into the result
  cashLikeTrades = "strip",        // "strip" | "keep"
  order,                           // optional comparator over raw portfolios; default: code-point order
}) → Result (with late: [] and closed: [])
```

1. Raw portfolios with no cash, no trades and every month's |opening| and |closing| < 0.005 are
   dropped.
2. `firstMonth`/`lastMonth` are the min/max month keys. The default portfolio order is
   `firstMonth`, then `label`, then the id, **by code point**; the result's account order,
   Download-all entry order, Accounts CSV rows and Combined groups all follow it.
3. `rootOf(id)` follows `config[id].mergeInto` while the target exists, with a cycle guard.
4. A portfolio is excluded if its root's or its own config has a truthy `exclude`. The account
   name is the root's trimmed config `name`, else the root's label; the kind is the root's config
   `kind`, else the root's kind; a non-string `name`, `kind` or `mergeInto` reads as absent.
5. Accounts are created in portfolio order. Merged members concatenate `cash` and `trades`; month
   `opening` and `closing` are summed (`round2`); `monthEnd` and `fx` come from the first member
   with that month; `partial` is OR'ed; the earliest `startDate` wins; `downloadOnly` holds when
   every member has `fromStatements === false`.
6. `cash` and `trades` get a stable code-point sort by date; `valuations` are the sorted months'
   `[monthEnd, closing]`.
7. With `cashLikeTrades: "strip"`, trades on non-investment accounts become `skippedRows` of
   category `trade in cash-like account`.
8. `months` is de-duplicated and sorted; `gaps = StatementExport.monthGaps(months)`.
9. `partialMonths` lists loaded months that leave out a portfolio open before and after them;
   `firstOpenings` lists the accounts that have the earliest loaded month with |opening| ≥ 0.005.
10. `portfolios = [{id, label, names, firstMonth, lastMonth, kind, currency, account}]`.

It is pure and locale-independent, never mutates its inputs and never throws on a config value.
`test/unit/assemble.test.js` pins its behaviour.

### core/app/statement-app.js

The multi-account app, an IIFE that defines no global. It reads `self.StatementProvider` (`D`,
with the switches in `D.ui`), composes `P = Object.assign({}, self.StatementExport,
self[D.parserGlobal])`, and wires: reading (the declared readers, the page transform), the
statements map keyed by `name:size`, `recompute()` (one `P.parseStatements(all, config)`), the
range, the cards, the status, the diagnostics, the configurator and the download handlers. Every
render builds `html` values and assigns them with `setHtml`; the kind's class token goes through
`cssToken`.

Where each switch acts:

| Switch | Behaviour per value |
|---|---|
| `D.inputs` | the file filter and the reader: csv → xlsx → pdf among the declared inputs |
| `D.pdf.pageTransform` | `P[name](items)` per page as it is read |
| `U.busyNoun` | `` `Reading ${n} ${noun}${n > 1 ? "s" : ""}…` ``, `` `Reading ${noun}s… ${i}/${n}` `` |
| `U.kindModel` | `F.modeOf`, the bank stats and notes, the tag and the "Auto (…)" label: `standard` uses `KIND_LABEL` with a bank branch; `investment-cash` labels Investment or Cash-like and has no bank branch |
| bank stats | `[["Transactions", n], [a.downloadOnly ? "Months" : "Months reconciled", vals − problems]]` |
| `U.notes` | balance mode: `bank ? (a.downloadOnly ? notes.bankDownloadOnly : notes.bank) : notes.other`; `tradelog: notes.tradelog`; `holdings: notes.holdings` |
| `U.hideModeWithoutInvestments` | `true`: the mode switch hides while no account is an investment; `false`: it always shows |
| `U.status` | `statements`: `result.statements`; `statements+downloads`: statements and downloads counted apart, with `U.text.downloadNoun`; `months`: `result.months.length` |
| `U.text.gapWarning`, `U.text.partialWarning` | after the core prefixes `Missing statement(s): <months>. ` and `Statement(s) for <months> ` |
| `U.openingsCurrency` | the first openings in the account's currency, or `result.baseCurrency` |
| `U.extraWarnings`, `U.unmappedNoun` | `result.warnings` as "Check these against your statements: …", or `result.unmapped` |
| `U.diagnostics` | the sections after "Rows not exported", in array order: reconciled, gaps, late, closed |
| `U.skipDetailed`, `U.skipLabels`, `U.skippedOwner` | the skipped-rows list |
| `D.naming`, `D.storage` | file names via `StatementFiles`; storage keys via `StatementStorage` |

The download handlers: a card button gives `F.fileFor(account, kind)` as a `text/csv` Blob;
`#accounts` gives `F.accountsFile()`; `#combined` one file, or `F.zipName("combined")` as a zip of
two; `#zip` the Accounts CSV plus every rendered card button's file, as `F.zipName("csv")`. The
configurator's DOM ids are `#config-count #config-list .account-row #config-reset` for every
provider.

### Error conventions

How the app shows each situation of docs/CONTRACT.md (error conventions):
- `result.errors` and the reader failures (`state.failed`) are warn lines `<id>: <error>` in
  `#status`; `result.warnings` one line "Check these against your statements: …".
- `adjustedEntries().problems` are `.warn` lines on the account's card.
- **A parse that throws.** `recompute()` wraps `parseStatements` in `try`. On a throw it sets
  `state.parseError`, renders the status alone and returns, so `state.result`, the cards, the
  range, the configurator and the diagnostics stay as the previous result drew them; the status
  adds `Could not read these statements: <message>` as its last warn line, and `addFiles` clears
  the busy line as usual. On the next successful parse (or Clear) the line goes. A throw while a
  result is drawn is not caught. The parse-error smoke checks all of this in CI
  (docs/TESTING.md, parse error).

### The custom app's files module

A custom app keeps its pure file assembly in a UMD helper listed in `scripts` (for the worked
example, `providers/etoro/files.js`, global `EtoroFiles`):
`create({P, result, range, naming}) → {span, files, zipName, downloads}`. The app's click
handlers and its `test.js` downloads hook both call it, so replay and the harness see exactly the
files the page offers. Its `app.js` reads `self.StatementProvider`, uses `StatementShell`,
`StatementStorage` (its frozen keys), `StatementXlsx` and `StatementZip`, and renders through
`html` and `setHtml` like the statement app.

### Node-only contract modules

- `core/contract/descriptor.js`: `normalize(D, frozen)` fills defaults; `validate(D, opts)`
  returns the C01-C09 error strings; `resolveRuntime(D)` returns the runtime object.
- `core/contract/result.js`: `checkResult(result, runtime, {strict, P})` returns `{errors,
  warnings}` (docs/CONTRACT.md, Result shape).
- `core/contract/callgraph.js`: `exportCallGraph(source)` derives the export call graph that C08b
  reads; `blank(source, {onLiteral})` is the tokenizer the sinks lint uses.
- `core/contract/headers.js`: `expectedHeader(P, {trigger, kind, mode})`, the first line the
  composed writers produce on empty input (harness step H8), so providers with
  `exportOverrides` get their own headers with no test edit.
- `core/contract/constants.js`: the contract constants and `FROZEN_SCHEMA`.

The build, the contract checks and the harnesses share these modules. They are never inlined.

### Data flow

```
File[] ─▶ READERS (csv▸xlsx▸pdf, transform) ─▶ Map name:size ─▶ P.parseStatements(all, config) ─▶ Result
               ▲ StatementStorage.loadConfig                                   │
mode ◀── StatementStorage.loadMode                                             ▼
range ◀── #from/#to ──────────▶ StatementFiles(P, result, mode, range, naming, kindModel) ─▶ {name,text} ─▶ Blob / zipParts
                                                                               └─▶ render (cards, status, diagnostics, configurator)
```

## Build system

The build runs on Node 22 or later and has no npm dependencies (only `fs`, `path`, `crypto` and
`vm`).

```
node build/build.js                               # validate every provider; write dist/<id>/index.html for published ones + dist/index.html
node build/build.js --check                       # build in memory; exit 2 if dist/ differs (missing, stale or extra files), listing paths
node build/build.js --only <id>[,<id>…]           # build a subset (all providers are still validated; dist/index.html rewritten)
node build/build.js --include-skeletons --out <d> # also build providers/_* and unpublished providers (tests only; never into dist/)
node build/build.js --out <dir>                   # write elsewhere
node build/build.js --csp legacy|hash             # the CSP mode; default DEFAULT_CSP_MODE in build/csp.js ("hash")
node build/build.js --root <dir>                  # build another tree (tests, scratch copies); default: this repository
node build/build.js --only <id> --inject <file> --out <dir>   # tests only: one extra script piece (12b, below)
```

Exit status: 0 success; 1 a validation, build or usage error (nothing is written); 2 `--check`
found differences. Every page is built and verified in memory before anything is written, so a
failing build never leaves a partial `dist/`.

`--inject` exists only for tests (the golden canaries, the parse-error smoke, the storage
self-test). The build refuses it unless `--out` is given and lies outside `dist/`, `--check` is
not given, and the injected file lies under the tree's `test/`. It runs after validation, and the
piece is hashed like any other in hash CSP mode.

### Discovery

`build/discover.js`:
1. Lists `<root>/providers/*` in code-point order. A folder is a provider iff it contains
   `provider.js`. Names starting with `.` are ignored; names starting with `_` are included only
   with `--include-skeletons` (the contract checks always include them).
2. Loads each `provider.js` and, if present, `frozen.js` as data modules (a fresh module object,
   and a `require` that refuses everything), runs `normalize`, then `validate` (C01-C07, the
   uniqueness of C04 included), resolves the runtime object, and parses and lints `page.html`
   (C16).
3. Reports every error as `providers/<folder>/<file>: [Cnn] <message>`, then exits 1.

### Script plan

`build/scripts.js` `planScripts(D, dir, {inject, root})` returns the inline pieces in this order;
each is its own `<script>`:

| # | When | Piece |
|---|---|---|
| 1 | `pdf` ∈ inputs | vendor/pdf.min.js |
| 2 | `pdf` ∈ inputs | `<script type="text/plain" id="pdf-worker-src">` vendor/pdf.worker.min.js (not executed, not hashed) |
| 3 | always | core/escape.js, core/shell.js, core/zip.js, core/storage.js |
| 4 | `csv` ∈ inputs | core/readers/csv.js |
| 5 | `xlsx` ∈ inputs | core/xlsx.js, core/readers/xlsx.js |
| 6 | `pdf` ∈ inputs | core/readers/pdf.js |
| 7 | `layout` ∈ uses | core/layout.js |
| 8 | always | core/export.js |
| 9 | `assemble` ∈ uses | core/assemble.js |
| 10 | statement app | core/files.js |
| 11 | always | `self.StatementProvider = <JSON>;` |
| 12 | always | the provider's `scripts`, in order |
| 12b | only with `--inject` (tests, never `dist/`) | the injected test file |
| 13 | always | core/app/statement-app.js, or `providers/<id>/<appScript>` |

- Parser factories capture `StatementLayout`, `StatementExport` and `StatementAssemble` when they
  run, so those come first; the app reads `self.StatementProvider`.
- Files are read as UTF-8 and inserted unchanged; a file that starts with a byte order mark, or
  that is not valid UTF-8, is an error.
- Each piece is guarded before hashing: `</script` in any case, `<!--`, a carriage return and NUL
  are refused.
- The runtime object is `JSON.stringify` in the contract's key order, with every `<` and U+2028,
  U+2029 written as `\u` escapes, so it can never contain `</script` or `<!--`.

### Templating

`build/page.js` `fill(skeleton, values)` makes one pass over the `{{token}}`s of
`core/page/skeleton.html` with a function replacer, so `$&` or `$1` in pdf.js are never expanded;
it fails on an unknown token or an unused value and never rescans inserted text. The skeleton is
the page structure with the fixed element ids (docs/CONTRACT.md, custom-app providers); its tokens
are:

| Token | Value |
|---|---|
| `noticeLine` | a line pointing at NOTICE when `pdf` ∈ inputs, else empty |
| `csp` | the policy (docs/SECURITY.md) |
| `title`, `h1`, `lede`, `dropTitle`, `dropHelp`, `empty`, `modeLabel`, `hint`, `helpItems`, `helpExtra` | the `page.html` slots, after partial expansion; the SPDX comment lines stripped |
| `style` | core/page/style.css with its comment header |
| `accept` | per input, in `inputs` order, joined with `,`: pdf `application/pdf,.pdf`, csv `text/csv,.csv`, xlsx `.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `multiple` | ` multiple` or empty |
| `modeButtons` | one `<button role="radio" data-mode="ID">LABEL</button>` per mode (escaped) |
| `toolbarButtons` | statement app: `#accounts` and `#combined` with their titles; custom apps: per `custom.toolbar` |
| `config` | statement app or `custom.config`: the configurator `<details class="config">` with `#config-count`, the help, `#config-list` and `#config-reset`; else empty |
| `scripts` | the script plan's pieces, one `<script>` each |

### CSP and verification

`build/csp.js` writes one `<meta http-equiv="Content-Security-Policy">` per page. In the default
`hash` mode a provider page's policy has a `sha256-` hash of every executable script piece and
of the one `<style>`, no `'unsafe-inline'`, `default-src 'none'`, and `form-action 'none';
base-uri 'none'`; the landing page's has only `default-src 'none'` and its style hash.
`verify(html, plan)` re-parses every page the build writes: its scripts must be exactly the plan's
pieces, byte for byte, its policy must equal the one recomputed from the page and, in hash mode,
list every inline script and the style as read from the page alone, and its markup, read as the
browser's tokenizer reads it, must carry no inline handler; the landing page has its own
`verifyLanding`. docs/SECURITY.md has the details.

### Output layout and GitHub Pages

- `dist/<id>/index.html` per published provider: one self-contained offline file, about 1.5 MB
  with pdf.js, about 70 KB without.
- `dist/index.html` is the landing page: no script, the heading "Statement converters, in your
  browser", and one `<li><a href="<id>/">name</a> — summary</li>` per published provider, sorted
  by `name` in code-point order.
- `dist/` is committed, and `node build/build.js --check` proves it current. On every push to
  `main`, `.github/workflows/pages.yml` deploys the committed `dist/` to GitHub Pages once CI
  (`build-check.yml`) has passed on that commit and `--check` passes again. The repository's
  Pages source is "GitHub Actions", so nothing is processed with Jekyll: the site,
  `https://ycsin.github.io/statement2csv/` with each page at `<id>/`, serves `dist/` byte for
  byte.
- The pages share one origin with the old converters' pages, so localStorage is shared, which is
  why every storage key is frozen (docs/SECURITY.md).
- Users can save a page and open it from disk.

### Later

- **Redirects for the old URLs.** After the new pages are live and in use, each old repository's
  `index.html` can be replaced by a stub that redirects to `<id>/`; that changes the old
  repositories and needs its own approval.
- **A combined page** (`dist/all/index.html`) that detects each file's provider is prepared: the
  `detect` field is validated, the id `all` is reserved, readers are shared, and no core module
  touches the DOM at load. The apps would first become mountable under goldens.
