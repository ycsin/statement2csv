<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->

# core

The code every page shares, and the Node-only contract code. Where each file comes from (the
old file and lines it moved from, the pinned copies and their declared edits) is recorded in
`docs/MIGRATION.md`; this file only maps the modules.

## Browser modules

Every browser module is UMD: in a page it sets one global on `self`, and in Node
`module.exports` holds the same object, so the unit tests run the files the pages run. No
module touches the DOM, storage, the clock or the network while it is evaluated; only the app
script runs at load.

| File | Global | Public API |
|---|---|---|
| `escape.js` | `StatementEscape` | `esc`, `html`, `setHtml`, `cssToken`; since migration step M8 every render builds its markup with `html` and assigns it with `setHtml`, the one `innerHTML` assignment |
| `shell.js` | `StatementShell` | `$`, `setBusy`, `fmtInt`, `fmtMoney`, `monthLabel`, `download`, `wireInput` |
| `zip.js` | `StatementZip` | `crc32`, `zipParts(files, now)`, `zip(files)` (store-only writer) |
| `storage.js` | `StatementStorage` | `loadMode`, `saveMode`, `loadConfig`, `saveConfig`, each taking the provider's frozen key |
| `export.js` (pinned) | `StatementExport` | the export writers listed as `CORE_EXPORT_NAMES` in `contract/constants.js` |
| `layout.js` (pinned) | `StatementLayout` | `pageLines`, `tableRows` |
| `xlsx.js` (pinned) | `Xlsx` | `read(bytes, inflateRaw)` |
| `readers/csv.js` | `StatementCsv` | `accept`, `accepts`, `read` |
| `readers/xlsx.js` | `StatementXlsx` | `accept`, `accepts`, `inflateRaw`, `read` |
| `readers/pdf.js` | `StatementPdf` | `accept`, `accepts`, `init`, `read` |
| `assemble.js` | `StatementAssemble` | `build`: account assembly (merge, exclude, rename, kinds, months) for new providers |
| `files.js` | `StatementFiles` | `create(ctx)`: each account's files, the Accounts and Combined files, the zip names, `allFiles()` and `downloads()` (the statement app's downloads hook) |
| `app/statement-app.js` | none | the multi-account statement app; it runs at load and defines no global. Since migration step M9 it catches a parse that throws: the previous result stays, and the status shows the error |

A pinned file is a byte copy of an old file, apart from its declared edits, whose sha256
`test/contract/provenance.js` records (contract check C15). It changes only through
`node tools/provenance.js rederive` with a declared edit.

## Load order

`build/scripts.js` inlines each page's pieces in this order, each in its own `<script>`:

| # | When | Piece |
|---|---|---|
| 1 | PDF inputs | `vendor/pdf.min.js` |
| 2 | PDF inputs | `vendor/pdf.worker.min.js` as `text/plain` (`#pdf-worker-src`, never executed) |
| 3 | always | `escape.js`, `shell.js`, `zip.js`, `storage.js` |
| 4 | CSV inputs | `readers/csv.js` |
| 5 | XLSX inputs | `xlsx.js`, `readers/xlsx.js` |
| 6 | PDF inputs | `readers/pdf.js` |
| 7 | `uses` has `layout` | `layout.js` |
| 8 | always | `export.js` |
| 9 | `uses` has `assemble` | `assemble.js` |
| 10 | statement apps | `files.js` |
| 11 | always | `self.StatementProvider = <the provider's runtime object>;` |
| 12 | always | the provider's `scripts`, in order |
| 12b | tests only (`build --inject`), never `dist/` | the injected test file |
| 13 | always | `app/statement-app.js`, or a custom app's `appScript` |

Parser factories capture `StatementLayout`, `StatementExport` and `StatementAssemble` when they
run, so those come before the provider's scripts. The app reads `self.StatementProvider` and
composes `P = Object.assign({}, StatementExport, self[parserGlobal])`.

## Page files (`page/`)

- `skeleton.html`: the page, with the `{{tokens}}` that `build/page.js` fills.
- `style.css`: the one stylesheet of every page.
- `landing.html`: the landing page that lists the published providers.
- `partials/`: shared help items that a provider's `page.html` may include.

## Contract code (`contract/`, Node only, never inlined)

- `constants.js`: the contract constants and `FROZEN_SCHEMA`; the statement app's literal
  copies are compared with them by `test/unit/constants.test.js`.
- `descriptor.js`: `normalize`, `validate` (checks C01-C09) and `resolveRuntime`, the object a
  page sees as `self.StatementProvider`.
- `result.js`: `checkResult`, every result field the core reads.
- `headers.js`: `expectedHeader`, the first line each download must start with.
- `callgraph.js`: `exportCallGraph`, derived from `export.js` for check C08b, and `blank`, the
  tokenizer the sinks lint uses (its `onLiteral` callback gives the lint each string, template
  part and regex literal with its span).
