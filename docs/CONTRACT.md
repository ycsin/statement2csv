<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->

# Provider contract

This is the normative contract between a provider (one folder under `providers/`) and the shared
code: the build, the core modules, the pages and the tests. It is contract version 1
(`contract: 1`). The core relies only on what is written here, and every rule below is checked:
by the build and the contract checks (`test/contract/run.js`, checks C01-C18), the lints and the
generic harness (docs/TESTING.md). `docs/ARCHITECTURE.md` describes the code on the other side
of the contract; `docs/ADDING_A_PROVIDER.md` is the step-by-step guide.

## Contract 1

- A folder is a provider if and only if it contains `provider.js`. Folders whose name starts with
  `_` are skeletons: checked and tested like any provider, never published. Folders starting with
  `.` are ignored.
- The descriptor is data. Everything that runs is in the parser module and its helpers, which
  the build inlines into the page and the tests load in Node.
- Unknown descriptor keys are errors, and the build refuses any `contract` other than 1. A
  change to this contract is a version bump, never a silent extension.

## What a provider folder contains

| File | Required | Inlined into the page | Purpose |
|---|---|---|---|
| `provider.js` | yes | its resolved runtime subset, as JSON | Descriptor, plain data (below) |
| `parser.js` (the `parserScript`) | yes | yes, at its place in `scripts` | UMD parser module (below) |
| other `scripts` entries | optional | yes, in `scripts` order | UMD helpers (a layout copy, a custom app's files module) |
| `page.html` | yes | slot contents | All user-visible page copy |
| `frozen.js` | every published provider (C05b); written by the scaffold | no | Compatibility surface, and the metadata of a migrated provider |
| `test.js` | custom apps: yes; otherwise optional | no (Node only) | Harness hooks |
| `app.js` (`appScript`) | custom apps only | yes, last | The provider's own UI controller |
| `fixtures/statements.js`, `fixtures/expected.js` | recommended | no | Synthetic inputs and expected outputs for the tests |
| `fixtures/hostile.js` | optional | no | Synthetic files with markup payloads for the injection smoke |
| `README.md`, any other `.js` | optional | only if listed in `scripts` | Notes, helpers |

Load-time rule: core and provider scripts must not touch the DOM, `localStorage`, the clock or
the network while they are evaluated. Only the app script runs at load time.

Every file carries the two SPDX lines (`SPDX-License-Identifier: Apache-2.0` and the copyright
line) in its comment syntax (C17), and no file in the repository is a statement or anything made
from one (C18, docs/TESTING.md).

## Descriptor

`providers/<id>/provider.js` is a CommonJS module whose `module.exports` is plain data: no
functions, Dates, `undefined`, RegExps or getters. C02 checks this with a JSON round trip. It
may not `require` anything. Unknown keys are errors (C01), which catches typos.

| Field | Type | Default | Rules and meaning |
|---|---|---|---|
| `contract` | `1` | required | The build refuses other values |
| `id` | string `/^[a-z][a-z0-9-]{0,31}$/` | required | Equals the folder name with one leading `_` removed. `all` is reserved for the combined page. Output is `dist/<id>/index.html` |
| `name` | string | required | Landing page; default `<title>` is `${name} Statement Converter` |
| `summary` | string | required | One generic line on the landing page |
| `app` | `"statement"` \| `"custom"` | `"statement"` | `statement` = the core multi-account app; `custom` = the provider's own app |
| `appScript` | string | `"app.js"` | Custom apps only; provider-relative path |
| `inputs` | non-empty array of `"pdf"`, `"csv"`, `"xlsx"`, no repeats | required | Readers inlined, picker `accept` (in this order), file filter, CSP worker entries |
| `multiple` | boolean | `true` | Statement app: must be `true`. Custom apps choose |
| `scripts` | string[] | `["parser.js"]` | Provider files inlined in this order. Must contain `parserScript`. Any other entry is a helper: in Node the provider `require`s its helpers itself |
| `parserScript` | string | `"parser.js"` | The one script that creates `self[parserGlobal]` (C10b). Node loaders `require` exactly this file; C08 reads its exports |
| `parserGlobal` | string `/^[A-Z][A-Za-z0-9]*$/` | required | Global the parser sets (`self[parserGlobal]`); unique across providers |
| `uses` | array of `"layout"`, `"assemble"` | `[]` | Core modules inlined before the provider scripts: `core/layout.js` (StatementLayout), `core/assemble.js` (StatementAssemble). `core/export.js` is always inlined |
| `exportOverrides` | string[] | `[]` | Core export names the parser deliberately replaces (below). Must equal the actual overlap of the `parserScript` exports (C08) and be closed under the export call graph that C08b derives from `core/export.js` |
| `pdf.pageTransform` | string \| null | `null` | Name of a parser export applied to each page's items at read time. Requires `"pdf"` in `inputs` |
| `storage.modeKey` | string | `` `${id}-csv-mode` `` | localStorage key for the mode; unique; frozen once released |
| `storage.configKey` | string \| null | statement app: `` `${id}-csv-accounts` ``; custom: `null` | Key for the configurator overrides; unique; frozen once released |
| `modes` | `{id, label}[]` | statement app: absent (fixed `LEDGER_MODES`); custom: required | Custom apps: the first id is the default; stored values outside the list read as the first |
| `naming.accountPrefix` | string | `""` | Prepended to every exported account name: file names, QIF `L[…]`, Accounts CSV `Name`, Combined `account` column |
| `naming.brand` | string | `name` | `<brand> accounts - <span>.csv`, `<brand> all <groupNoun> - …` |
| `naming.groupNoun` | string | `"accounts"` | As above |
| `naming.slug` | string `/^[a-z0-9-]+$/` | `id` | `<slug>-csv-<from>_to_<to>.zip`, `<slug>-combined-<from>_to_<to>.zip`; unique |
| `ui.notes.bank` | string | `"Every transaction, checked against the statement's starting and ending balance each month."` | Card note, balance mode, bank account |
| `ui.notes.bankDownloadOnly` | string | `"Every transaction from the download, with balances worked back from its ledger balance."` | Card note, bank account with `downloadOnly` |
| `ui.notes.other` | string | `"One file. A monthly returns adjustment puts the running balance on each statement's closing value."` | Card note, balance mode, other kinds |
| `ui.notes.tradelog` | string | `"One file, as Balance only, plus every buy and sell as a zero-amount line with units and price."` | Card note, trade-log mode |
| `ui.notes.holdings` | string | `"Trades and cash in separate files; month-end balances to record as balance updates."` | Card note, holdings mode |
| `ui.skipLabels` | `{category: label}` | `DEFAULT_SKIP_LABELS` (4 entries, below) | **Replaces** the default as a whole. Labels for `skippedRows` categories |
| `ui.skipDetailed` | string[] | `["unknown", "no amount"]` | Categories listed per description with ×n, accounts and months |
| `ui.diagnostics` | array of `"gaps"`, `"late"`, `"closed"` | `["gaps", "late"]` | Sections after "Rows not exported", in this order |
| `ui.status` | `"statements"` \| `"statements+downloads"` | `"statements"` | Status count source |
| `ui.text.gapWarning` | string | the default below | Follows `Missing statement(s): <months>. ` |
| `ui.text.partialWarning` | string | the default below | Follows `Statement(s) for <months> ` |
| `ui.text.downloadNoun` | string | `"transaction history download"` | Used with `ui.status: "statements+downloads"` |
| `custom.toolbar` | array of `"accounts"`, `"combined"` | `[]` | Custom apps only: optional toolbar buttons (Clear and Download all always exist) |
| `custom.config` | boolean | `false` | Custom apps only: include the configurator block (then `storage.configKey` is required) |
| `detect` | `{pdfText?: string[], csvText?: string[], xlsxSheets?: string[]}` \| null | `null` | Regex sources or sheet names, for the future combined page; validated (regexes compile) |
| `testing.reconcile` | `"statement"` \| `"custom"` | statement: `"statement"`; custom: `"custom"` | Harness reconciliation (H6) |
| `testing.allowWarnings` | boolean | `false` | The harness tolerates `warnings` |
| `testing.gapDrop` | boolean | `true` for statement apps | Harness gap-drop check (H7) |
| `testing.fixtures` | string \| null | `null` | Provider-relative fixtures folder (`statements.js`, `expected.js`, optional `hostile.js`) |
| `publish` | boolean | `true` | `false` = checked and tested but not built into `dist/`. Skeleton folders are never published |
| `legacy` | object | absent | Below. Accepted only when `frozen.js` has `legacyRepo` |

C04 makes `id`, `parserGlobal`, `storage.modeKey`, `storage.configKey` and `naming.slug` unique
across every provider, skeletons included.

## frozen.js

`providers/<id>/frozen.js` is a `.js` data module, so it carries the SPDX lines. It records what
saved settings and users' import mappings depend on. The scaffold (`tools/new-provider.js`)
writes it for a new provider, as a draft holding the id-derived values; until the first public
release, editing it is free. After that, changing any value is a deliberate migration, because
the pages share one origin and every user's settings live under these keys.

Every provider that is published (`publish: true`, not a skeleton) must have one (C05b). So must
any provider whose `dist/<id>/index.html` is tracked by git, even if `publish` is now `false`,
so that unpublishing cannot drop the guard.

```js
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface. Changing a value renames users' files or loses their saved settings.
module.exports = {
  storage: { modeKey: "example-csv-mode", configKey: "example-csv-accounts" },
  modeValues: ["balance", "tradelog", "holdings"],
  configKinds: ["", "investment", "cash"],              // what the configurator's Type select may write
  naming: { accountPrefix: "", brand: "Example", groupNoun: "accounts", slug: "example" },
  configIdPattern: "^[^:]+:[A-Z]{3}$",                  // every portfolio id must match (harness H11)
  kindModel: "standard",                                // which accounts follow the global mode
  // Present only for providers migrated from an old repository, all five or none:
  // legacyRepo, legacyUrl, legacyHead, legacyIndexSha256, legacyDom.
};
```

Schema per app type (`FROZEN_SCHEMA` in `core/contract/constants.js`). Unknown keys are errors.

| Key | Statement app | Custom app, no configurator | Custom app with `custom.config` |
|---|---|---|---|
| `storage.modeKey` | required | required | required |
| `storage.configKey` | required | required, `null` | required |
| `modeValues` | required (the `LEDGER_MODES` ids) | required (the `modes` ids) | required |
| `configKinds` | required (`CONFIG_KINDS`) | required, `null` | required |
| `configIdPattern` | required | required, `null` | required |
| `naming` | `{accountPrefix, brand, groupNoun, slug}`, all required | `{slug}` required; other naming keys optional | as the previous column |
| `kindModel` | required with `legacyRepo`; otherwise optional and must be `"standard"` | absent | absent |
| `legacyRepo`, `legacyUrl`, `legacyHead`, `legacyIndexSha256`, `legacyDom` | together or not at all | together or not at all | together or not at all |

Rules:
- **C05 matches the descriptor against frozen.js.** For every key present in `frozen.js`, the
  resolved value must deep-equal it: `storage`, the mode ids, `CONFIG_KINDS` (or `null` without a
  configurator), `naming` (only the keys listed) and `ui.kindModel`. Every key the schema marks
  as required for the app type must be present, and `configIdPattern` must compile.
- **C04 enforces uniqueness.** No other provider may reuse these keys or the slug.
- **Legacy knobs need `legacyRepo`.** The `legacy` block is rejected unless `frozen.legacyRepo`
  is present (C06). New providers therefore cannot opt into old quirks.
- **The golden-equivalence harness reads only frozen.js.** It applies to a provider iff
  `legacyRepo` is present, and takes every old-page fact from `frozen.js`. No test file names a
  provider.

The `legacy` block (precedence: core defaults < `legacy.preset` < explicit `legacy.*` < explicit
`ui.*`) reproduces the old pages of migrated providers exactly:

| Knob | Values | Effect |
|---|---|---|
| `legacy.preset` | `"gen1"` | Expands to `busyNoun: "statement"`, `status: "months"`, `openingsCurrency: "base"`, `diagnostics: ["reconciled"]` and the gen1 gap warning |
| `legacy.busyNoun` | `"statement"` | "Reading N statement(s)…" / "Reading statements… i/N" |
| `legacy.status` | `"months"` | The status count is `result.months.length` |
| `legacy.openingsCurrency` | `"base"` | The first-openings line prints `result.baseCurrency` |
| `legacy.diagnostics` | array with `"reconciled"` (may also contain gaps, late, closed) | The "Balancing entries…" list from `result.reconciled`. Mutually exclusive with `ui.diagnostics` |
| `legacy.hideModeWithoutInvestments` | `false` | Never hides the mode switch |
| `legacy.kindModel` | `"investment-cash"` | Balance only is forced for `kind === "cash"` only; the tag and "Auto (…)" label show Investment or else Cash-like; no bank branch in card stats and notes |
| `legacy.extraWarnings` | `"unmapped"` | `Unrecognised <noun>(s) (not exported): …` from `result.unmapped` in place of `result.warnings` |
| `legacy.unmappedNoun` | string | The `<noun>` above |
| `legacy.skippedOwner` | `"portfolio"` | The skipped-row owner is read from `row.portfolio` |

## The runtime object

`core/contract/descriptor.js` exports `normalize(D, frozen)` (fills the defaults above),
`validate(D, opts)` (the error strings of C01-C09) and `resolveRuntime(D)`, which folds `legacy`
and `ui` into one flat object. The build inlines that object as the script
`self.StatementProvider = <JSON>;`. Pages read only this object; they never see `legacy`,
`testing`, `detect` or `publish`.

```js
// self.StatementProvider (statement app); custom apps get the same object without `ui`
{
  id, app, inputs, multiple, parserGlobal,
  pdf: { pageTransform },
  storage: { modeKey, configKey },
  modes: [{ id, label }, ...],                     // statement app: LEDGER_MODES
  naming: { accountPrefix, brand, groupNoun, slug },
  ui: {
    busyNoun: "file" | "statement",
    kindModel: "standard" | "investment-cash",
    hideModeWithoutInvestments: boolean,
    status: "statements" | "statements+downloads" | "months",
    openingsCurrency: "account" | "base",
    extraWarnings: "warnings" | "unmapped",
    unmappedNoun: string,
    diagnostics: string[],                          // subset of gaps, late, closed, reconciled
    skippedOwner: "account" | "portfolio",
    skipDetailed: string[], skipLabels: { [category]: string },
    notes: { bank, bankDownloadOnly, other, tradelog, holdings },
    text: { gapWarning, partialWarning, downloadNoun },
  },
}
```

Constants in `core/contract/constants.js`. Their browser copies are literal constants in
`core/app/statement-app.js`, and `test/unit/constants.test.js` asserts the two are equal.

| Constant | Value |
|---|---|
| `CONTRACT_VERSION` | `1` |
| `LEDGER_MODES` | `[{id:"balance",label:"Balance only"},{id:"tradelog",label:"Balance + trade log"},{id:"holdings",label:"With holdings"}]` |
| `CONFIG_KINDS` | `["", "investment", "cash"]`, never `"bank"` (an old page would let a `bank` account follow the global mode) |
| `RESERVED_KINDS` | `["adjustment", "gap", "trade"]` (made by the export layer) |
| `KIND_LABEL` | `{investment:"Investment", cash:"Cash-like", bank:"Bank"}` |
| `CORE_EXPORT_NAMES` | the 19 names `core/export.js` returns |
| `APP_CALLED_EXPORTS` | the 11 core export functions the statement app calls on `P` (below) |
| `DEFAULT_SKIP_LABELS` | `{"no amount":"Rows the statement printed without an amount", "trade in cash-like account":"Buys and sells in accounts set to cash-like", "trade without qty/price":"Buys/sells without units or price", "unknown":"Unrecognised transaction types (not exported; please report)"}` |
| default `ui.text.gapWarning` | `Each account bridges the gap with one “not covered by statements” entry, so later balances stay right, but that month’s individual transactions are missing. Add the missing PDF to fix this.` |
| default `ui.text.partialWarning` | `are missing for some of your accounts. Those accounts bridge the gap the same way; add their statements for those months if you have them.` |
| `RESERVED_IDS` | `["all"]` |

The export call graph is not a hand-written constant: `core/contract/callgraph.js` derives it
from the source of `core/export.js` every time C08b runs, and `test/unit/callgraph.test.js` pins
its result on the pinned file.

## page.html

The file starts with the two SPDX lines as HTML comments. It then holds only
`<template data-slot="name">…</template>` blocks, not nested, separated by whitespace, so it
opens in a browser for proofreading. Inside slots, `{{> partial-name}}` includes
`core/page/partials/<partial-name>.html`, and HTML comments are errors.

| Slot | Kind | Required | Default | Goes to |
|---|---|---|---|---|
| `title` | text | no | `${name} Statement Converter` | `<title>` |
| `h1` | text | yes | – | `<h1>` |
| `lede` | inline | yes | – | `<p class="lede">` |
| `drop-title` | text | yes | – | `#drop > strong` |
| `drop-help` | text | yes | – | `#drop-help` |
| `empty` | text | no | `No statements yet.` | `#empty` |
| `mode-label` | text | yes | – | `#mode-label` |
| `hint` | inline | yes | – | `<p class="hint">` |
| `config-summary` | text | no | `Accounts` | `details.config > summary` (before `#config-count`) |
| `config-help` | inline | if the page has a configurator | – | `details.config > p.muted` |
| `accounts-title` | attribute | no | `One row per account: account type, name, starting balance and date` | `#accounts[title]` |
| `combined-title` | attribute | no | `All accounts in one file with an account column, for multi-account imports` | `#combined[title]` |
| `help-items` | list | yes | – | `<li>` items of "What the files contain" |
| `help-extra` | block | no | empty | Extra `<details>` blocks after it |

The shared partials are `help-qif-short`, `help-qif-long`, `help-accounts-combined`,
`help-columns-transactions` and `help-columns-full`.

The lint (C16) enforces these rules:
- **Text and attribute slots:** no `<`. Attribute slots also allow no `"`.
- **Allowed tags in inline, list and block slots:** `em strong code br span ul ol li p details
  summary`.
- **The only attribute:** `class="muted"` on `span`.
- **Never allowed:** any `<script` or `<style`, `on*=`, `href`, `src` or `style=`.
- **Unknown slot names** are errors, and so is a slot the page cannot use (the configurator slots
  without a configurator, a button title without its button).

## The parser module

A UMD module. The browser branch sets `self[parserGlobal]`, and the Node branch exports the same
object. The factory gets its dependencies explicitly:

```js
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../core/layout.js"), require("../../core/export.js"), require("../../core/assemble.js"));
  else root.ExampleBankParser = factory(root.StatementLayout, root.StatementExport, root.StatementAssemble);
})(typeof self !== "undefined" ? self : this, function (L, E, A) { "use strict"; /* … */ return { parseStatements }; });
```

- **Required export: `parseStatements(statements, config = {}) → Result`.**
  - It must be synchronous and must not throw for any input or config.
  - It must be a pure, deterministic function of `(statements in the given order, config)`: no
    DOM, storage, network, clock or randomness, and inputs are never mutated (the tests
    deep-freeze them).
  - New providers also follow these rules, which the lints and the harness enforce: compare
    strings by code point (`a < b`); never call `localeCompare()` without a locale; memoise
    per-statement work in a `WeakMap` keyed by the statement object (the app parses again on
    every configurator change).
- **Optional export: the page transform** named by `pdf.pageTransform`, `(items) → page`. It is
  pure.
- **Composition.** The app builds `P = Object.assign({}, self.StatementExport, self[parserGlobal])`.
  - A parser export with a core export name **replaces** that function for the app. This is how
    a provider changes a writer (for example 8-decimal quantities) without a core edit.
  - Such names must be listed in `exportOverrides` (C08).
  - Core functions call one another internally (the export call graph), not through `P`. So the
    override set must be closed: if a name is overridden, every function the app calls on `P`
    that uses that name internally, directly or transitively, must be overridden too (C08b). For
    example, overriding `adjustedEntries` requires overriding `adjustedCsv`; overriding `pad`
    requires overriding `adjustedEntries`, `openingBalance` and `adjustedCsv`, because
    `prevMonth` and `lastDayOf` call `pad`.
  - For a custom app the contract cannot see which functions the app calls, so C08b treats every
    core export as called.
- **The functions the app calls on `P`:** `inRange(date, from, to)`;
  `adjustedEntries(account, from, to, earliestMonth, withTrades = false) → {entries, problems}`;
  `openingBalance(account, from, to, earliestMonth, entries) → {balance, date} | null`;
  `qif(entries, start, accountName)`; `adjustedCsv(account, from, to, earliestMonth, withTrades)`;
  `tradesCsv(trades, from, to)`, `transactionsCsv(cash, from, to)`,
  `valuationsCsv(valuations, from, to, currency)`; `accountsCsv(rows)`;
  `combinedTradesCsv(groups)`, `combinedTransactionsCsv(groups)`; `parseStatements`; and the page
  transform, if any. Nothing else.

## Input statement objects

Statements reach `parseStatements` **in file-add order**: FileList order across drops and picks,
accumulated until Clear. They are de-duplicated by `` `${file.name}:${file.size}` `` (the first
copy is kept). On every parse the app passes **all** loaded statements. Each statement object has
**exactly** these keys, with no extra `type` field:

| Input | Object | Reader |
|---|---|---|
| PDF | `{ id: file.name, pages: Item[][] }`, Item = `{ str, x: transform[4], y: transform[5], w: width, h: height \|\| \|transform[3]\| }` in pdf.js order | `StatementPdf.read(file)`; `getDocument({ data, isEvalSupported: false })` |
| PDF with `pdf.pageTransform` | `{ id, pages: T[] }`, T = the transform's return value per page | the same; the transform is applied per page as `P[pageTransform](items)` |
| CSV | `{ id, csv: string }`, UTF-8 via `file.text()` (a leading BOM is stripped; CRLF kept) | `StatementCsv.read(file)` |
| XLSX | `{ id, workbook: { [sheetName]: (string\|number\|boolean\|null)[][] } }` (numbers stay numbers; date cells stay Excel serials) | `StatementXlsx.read(file)` |

Reader selection uses the fixed order **csv → xlsx → pdf**, restricted to the declared `inputs`.
The first reader whose `accepts(file)` is true reads the file:
- csv: `type === "text/csv" || /\.csv$/i`;
- xlsx: `/\.xlsx$/i` or the spreadsheetml MIME type;
- pdf: `type === "application/pdf" || /\.pdf$/i`.

A file that no declared reader accepts is ignored silently. A reader failure is listed in the
status as `<file name>: <message>`, and the file is not added.

## Config object

The configurator is core code; only it writes the config, under `storage.configKey`:

```
{ [portfolioId]: { name?: string (trimmed, non-empty), kind?: "investment" | "cash", mergeInto?: portfolioId, exclude?: true } }
```

- **Writes.** The configurator writes an empty field by deleting it, deletes empty entries, and
  writes `{}` on "Reset to detected".
- **Reads.** `loadConfig` returns `JSON.parse(stored) || {}`, or `{}` on any exception. A stored
  `5`, `[]` or `"x"` is passed through unchanged.
- **Parsers must tolerate without throwing:** unknown ids, `mergeInto` cycles and chains,
  hand-edited kinds (`"bank"`, `"foo"`), non-object configs, names with surrounding spaces, and
  non-string values in any field (`{name: 5}`, `{kind: 5}`, `{mergeInto: 5}`,
  `{exclude: "yes"}`). A non-string `name`, `kind` or `mergeInto` reads as absent; `exclude`
  counts when truthy. `StatementAssemble.build` implements exactly this, and C11 and C13 feed
  such configs to every provider without `legacyRepo`.
- **Portfolio ids** are the config's keys, so their format is part of the compatibility surface:
  `frozen.configIdPattern` describes it, and harness step H11 checks every id against it.
- **Known legacy exception.** The migrated statement parsers throw a TypeError on a non-string
  `name`. They stay verbatim; the app's parse-error path catches the throw (below, error
  conventions).

## Result shape

This is every field the core reads from a statement app's result.

| Field | Type | Required when | Read by |
|---|---|---|---|
| `accounts` | `{ [exportName]: Account }` | always | files, cards, Accounts and Combined files. **Insertion order is significant:** it gives the card order = Download-all entry order = Accounts CSV rows = Combined groups. JavaScript puts integer-like keys first |
| `Account.kind` | string (`investment`/`cash`/`bank`; others tolerated) | always | `modeOf`, the tag, bank branches, Accounts CSV type (`investment` → `Investment`, else `Savings`), mode-switch visibility |
| `Account.currency` | string | always | export base currency, valuations CSV, Accounts CSV, card balance, first openings |
| `Account.months` | `{ "YYYY-MM": Month }` | always | `adjustedEntries`, `openingBalance` |
| `Month.monthEnd` | `YYYY-MM-DD` inside that month | always | range filter, adjustment and gap dates, valuations |
| `Month.opening`, `Month.closing` | finite numbers | always | bridges, adjustments, openings |
| `Month.fx` | number \| null | always | converts the month's USD cash entries; other currencies give "cannot convert" problems |
| `Month.partial` | `true` | optional | bank accounts only: an unreconciled difference becomes a gap row instead of a problem |
| `Month.startDate` | `YYYY-MM-DD` | optional | first exported month: the opening is dated `dayBefore(startDate)`, or the day before the first entry when that is earlier |
| `Account.valuations` | `[monthEnd, closing][]` ascending | always | card balance stat, Month-end balances CSV, card visibility |
| `Account.trades` | `{date, ticker, qty (<0 = sell), price, currency, name}[]` ascending | always (`[]` allowed) | holdings Trades CSV, trade-log lines, Combined trades, Accounts CSV (holdings) |
| `Account.cash` | `{date, amount (inflow **negative**), currency, name, notes?, kind, balancing?}[]` ascending (stable) | always | every transactions file, QIF. `kind` ∉ `RESERVED_KINDS`; `balancing` counts in the card note |
| `Account.downloadOnly` | boolean | optional | bank card stat `Months` vs `Months reconciled` and the note |
| `months` | `{month: "YYYY-MM", id?}[]` ascending, unique | always | From/To options; `earliest = months[0].month` (gap bridges, opening balances); status span; count (`status: "months"`) |
| `portfolios` | `{id, label, names (oldest → newest), firstMonth, lastMonth, kind, currency (string\|null)}[]` | always | configurator rows in this order. `id` is the config key; `names.slice(0, -1)` gives "formerly …"; `kind` gives "Auto (…)" |
| `errors` | `{id, error}[]` | always | status lines `<id>: <error>` |
| `gaps` | `"YYYY-MM"[]` | always | status "Missing statement(s)" |
| `firstOpenings` | `{account, month, opening}[]` | always | status; `account` must be a key of `accounts` |
| `skippedRows` | `{date, category, detail?, account? \| portfolio?}[]` | always | diagnostics (owner field per `skippedOwner`) |
| `statements` | number | `status` is `statements` or `statements+downloads` | status count; first-openings noun |
| `downloads` | number | `status: "statements+downloads"` | status |
| `warnings` | `string[]` | `extraWarnings: "warnings"` | status "Check these against your statements: …" |
| `unmapped` | `{ [name]: string[] }` | `extraWarnings: "unmapped"` | status |
| `partialMonths` | `"YYYY-MM"[]` | optional (guarded) | status partial line |
| `late` | `{month, statement, account, amount}[]` | optional (guarded) | diagnostics `late` |
| `closed` | `{account, month, balance}[]` | optional (guarded) | diagnostics `closed` |
| `reconciled` | `{month, account, diff}[]` | diagnostics has `reconciled` | diagnostics |
| `baseCurrency` | string | `openingsCurrency: "base"` or diagnostics `reconciled` | status, diagnostics |

**The core reads no other field.** Providers and tests may use any other field freely (for
example `skipped`, `asAt`, `Month.cashflow`, `accounts[*].portfolios`, `portfolios[].account`).
`StatementAssemble.build` returns exactly this shape (docs/ARCHITECTURE.md, core/assemble.js).

`checkResult(result, runtime, {strict})` (`core/contract/result.js`) enforces this table:
- **Errors:** a missing required field or a wrong type; unsorted `months`, `valuations`, `cash`
  or `trades`; a reserved cash `kind`; NaN or Infinity; a `firstOpenings.account` that is not an
  account; duplicate portfolio ids; a `monthEnd` outside its month.
- **Warnings:** a currency that is not `/^[A-Z]{3}$/`; an `adjustment` that is not last within its
  day; a portfolio whose `names` does not end with its `label`. With `strict` (every provider
  without `legacyRepo`), warnings fail too.

This table and `checkResult` apply to statement apps only. A custom app's result shape is its own
business: the core never reads it, and the harness checks it only through the custom app's
`test.js` hooks, including the optional `test.checkResult`.

## Error conventions

| Situation | Provider does | Core shows |
|---|---|---|
| File is not this provider's format | `errors.push({id, error: "not a <X> statement …"})`, keeps going | `<id>: <error>` warning line |
| Same month loaded twice | `errors.push({id, error: "duplicate statement for YYYY-MM, ignored"})`; the first in a stable order (not the file-add order) wins | warning line |
| Data that doesn't add up | `warnings.push("YYYY-MM: …")`; never adjusts silently | "Check these against your statements: …" |
| Row not exported | `skippedRows` with a category; `"unknown"` is highlighted | diagnostics; the harness fails on `unknown` |
| Reader failure (corrupt PDF or xlsx) | – | `<file name>: <message>` |
| Export-time problem | – | `adjustedEntries().problems` as `.warn` lines on the card |
| Unexpected exception in `parseStatements` | must not happen; the contract checks (C11) and the harness (H5) enforce it | the app catches it, **keeps the previous result** (its cards, range and configurator), clears the busy line and adds `Could not read these statements: <message>`; the next parse that succeeds, or Clear, removes the line |

## Custom-app providers

A custom provider (`app: "custom"`) ships its own controller, `app.js`, which the build inlines
last. Use it when the input is not a multi-account monthly ledger: one account with parse-time
options, or a different file set. `providers/etoro/` is the worked example: one xlsx, one
account, modes that act at parse time, and its own file set. A custom app:
- reads `self.StatementProvider`;
- reads and writes storage only through `StatementStorage`, with its frozen keys;
- renders only through `StatementEscape.html` and `setHtml` (the sinks lint, docs/SECURITY.md);
- may use any core module (shell, zip, storage, readers, export, files);
- uses the fixed element ids `#drop #picker #busy #status #empty #results #from #to #mode #clear
  #zip #cards #diagnostics`, plus `#accounts`/`#combined` if listed in `custom.toolbar` and the
  configurator ids if `custom.config`;
- keeps its pure file assembly in a separate UMD helper listed in `scripts`; the app's click
  handlers and the downloads hook both call it, so the tests see exactly the files the page
  offers;
- must ship `test.js` with `parse`, `downloads` and `reconcile` (below).

## The downloads hook and the test.js hooks

**The downloads hook** is the one interface through which replay, the harness and the fixtures
golden learn what a page offers. It is a pure function from a state to the ordered list of
downloads that the page's triggers produce, in the page driver's click order: the card buttons
in DOM order, then `#accounts`, `#combined` and `#zip`.

```js
// Download: one record per trigger.
{ trigger: "card" | "accounts" | "combined" | "zip",
  account: string | null,       // the card's data-account (statement apps), else null
  kind: string | null,          // the button's data-kind, else null
  name: string,                 // the raw a.download name
  type: string,                 // the Blob MIME type
  text: string }                // a text file, written as UTF-8
| { trigger, account, kind, name, type: "application/zip",
  files: [{ name, text }] }     // a zip; the tests build it with StatementZip.zipParts(files, now)
| { trigger, account, kind, disabled: true }   // a trigger that is present but disabled
```

Rules:
- When the page shows no results (`#results` hidden), the list is empty, and the page driver
  clicks nothing either. That covers a null result and a custom app's `{error}` result.
- **Statement apps get the hook from the core:** `StatementFiles.create(ctx).downloads()`. It
  follows the page exactly: a card exists iff its account has files or month-end values, its
  buttons are `exportsFor(name).files`, and the three toolbar buttons are disabled iff there is
  no card.
- **Custom apps provide it in `test.js`,** delegating to their pure files module.

```js
// providers/<id>/test.js. ctx always carries the composed namespace and the runtime object:
//   ctx = { P, R, mode, config, from, to }   (from/to already swapped so that from <= to)
module.exports = {
  // Custom apps: required. Turns the statements into the app's result the way the app does, or { error }.
  parse(statements, ctx) { /* → result | { error } */ },
  // Custom apps: required. The downloads hook for (result, ctx.mode, ctx.from, ctx.to).
  downloads(result, ctx) { /* → Download[] */ },
  // Optional for statement apps, required for custom apps: extra reconciliation; problem strings.
  reconcile(result, ctx) { /* → string[] */ },
  // Custom apps, optional: structural checks of the app's own result; problem strings.
  checkResult(result, ctx) { /* → string[] */ },
  // Custom apps, optional: the exact CSV header line expected for a download (H8); null = none.
  expectedHeader(download, ctx) { /* → string | null */ },
  // Optional: compare with a private, hand-checked reference file (harness --reference <file>).
  reference(result, refPath, ctx) { /* → string[] */ },
};
```

The hooks never `require` the parser themselves; they use `ctx.P`. For statement apps,
`test/lib/load-provider.js` provides `parse` (`P.parseStatements(statements, config)`),
`downloads` (the core hook) and `expectedHeader` (`core/contract/headers.js`, derived from `P`),
so their `test.js` is optional.

## Example providers: the templates

Two skeletons are the starting points of every new provider; `tools/new-provider.js` copies
them (docs/ADDING_A_PROVIDER.md). Their formats and data are synthetic, and together they show a
working page with every core feature: the three modes, ranges and the configurator; QIF,
Accounts CSV, Combined CSV and Download all; gap bridges, first-opening warnings, duplicate
handling and the diagnostics.

**`providers/_template-csv/`: a transaction-history CSV export with a running balance.**

```js
// providers/_template-csv/provider.js (the module.exports part)
module.exports = {
  contract: 1,
  id: "template-csv",
  name: "Example Bank",
  summary: "Example Bank transaction history CSV (synthetic template)",
  inputs: ["csv"],
  uses: ["assemble"],
  parserGlobal: "ExampleCsvParser",
  ui: { text: { gapWarning: "Each account bridges the gap with one “not covered by statements” entry, so later balances stay right, but that month’s individual transactions are missing. Add an export that covers it to fix this." } },
  testing: { fixtures: "fixtures" },
};
```

Its storage keys default to `template-csv-csv-mode` and `template-csv-csv-accounts`, and its zips
to `template-csv-csv-…zip`; the scaffold derives all of these from the new id. Its `parser.js`
reads one export per file (`Example Bank transaction history`, `Account,<number>,<CCY>`, the
header `Date,Description,Amount,Balance`, then the rows oldest first, quoted as RFC 4180 allows),
checks every row against the export's running balance (a mismatch is a warning), counts each row
of overlapping exports once, treats the months inside an export's span as covered, and finishes
with `StatementAssemble.build`. Portfolio ids are `<number>:<CCY>`. Its fixtures hold three
accounts in two currencies, overlapping exports, a late-starting account, a missing month, a
first opening, descriptions with commas, quotes and a leading `=`, and one file that is not an
export (listed in `expectErrors`).

**`providers/_template-pdf/`: a monthly statement PDF with a section per account.** The
descriptor has `inputs: ["pdf"]`, `uses: ["layout", "assemble"]` and
`parserGlobal: "ExampleBankParser"`; the factory takes `(L, E, A)` ← `root.StatementLayout,
root.StatementExport, root.StatementAssemble`. `parseStatements` builds lines with
`L.pageLines(page)` (the cells of a line joined by two spaces) and reads the statement period and,
per account section, the account line, the opening and closing balances and the rows into
`raw[id].months[month] = {monthEnd, opening, closing, fx: null}` plus `cash`; a row without an
amount becomes a skipped row (`"no amount"`); a duplicate month is an error; a section whose rows
do not add up is a warning. Its fixtures cover three accounts in two currencies, three
statements with a missing middle month (gap bridges), a statement over two pages, a non-zero
first opening, an account renamed on a later statement ("formerly …"), one statement loaded
twice under another file name (the duplicate error, in `expectErrors`), and descriptions that
start with `=` and contain `,` and `"`. Its `fixtures/hostile.js` puts markup in an account name
and a description, which the injection smoke must find rendered as text on every render target.

The tests render each template's `fixtures/statements.js` (CSV text, or PDF pages through
`test/lib/minipdf.js`), run the contract checks, the harness and the smokes on them, and compare
the page's downloads with `fixtures/expected.js` (docs/TESTING.md).
