<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->

# Example Bank

A provider folder made from the PDF template, `providers/_template-pdf/` (or that template
itself): a monthly statement PDF with a section per account, read through the shared layout
module. `node tools/new-provider.js <id> --name "<Name>" --from pdf` copies it. Until you change
them, `parser.js` reads the template's synthetic format and `fixtures/` holds invented
statements in it, so the copy builds, passes every check and shows a working page from the
start.

| File | What it is |
|---|---|
| `provider.js` | The descriptor: data only (docs/CONTRACT.md) |
| `parser.js` | `parseStatements(statements, config)`: the PDF pages' text items in, the result out |
| `page.html` | Every text the page shows, as `<template data-slot>` blocks |
| `frozen.js` | Written by the scaffold (not in the template): the storage keys, file naming and portfolio id format that users' settings and imports depend on |
| `fixtures/statements.js` | Synthetic statements for the tests (PDF pages as positioned text runs), with the marker `SYNTHETIC TEST DATA` |
| `fixtures/hostile.js` | Synthetic statements with markup where the page prints text, for the injection smoke |
| `fixtures/expected.js` | The downloads the fixtures must give; generated, then reviewed |

What to change after copying, in order (docs/ADDING_A_PROVIDER.md has the details):

1. `parser.js`: read your bank's statements instead of the template's. Look at them first with
   the harness's `--dump`, which writes each page as the text lines `parseStatements` sees. Keep
   the two UMD lines at the top (the browser branch sets the parser global named in
   `provider.js`), return an `errors` entry for every file that is not yours, never throw, and
   finish with `StatementAssemble.build`. Amounts are stored with inflows negative. Give each
   portfolio a label of its own: portfolios with one label become one account (the template's
   `distinctLabels` adds the currency, then the whole number, where two labels would be equal).
2. `frozen.js`: if your portfolio ids are not `<account number>:<CCY>`, change
   `configIdPattern` to match the ids `parseStatements` returns.
3. `fixtures/statements.js` and `fixtures/hostile.js`: invented statements in your format, still
   marked `SYNTHETIC TEST DATA`; list in `expectErrors` the files that must give an `errors`
   entry. Put markup in `hostile.js` wherever your page prints text from a statement, or delete
   the file.
4. `page.html`: the texts, in your bank's words; keep the shared partials (`{{> …}}`).
5. `provider.js`: write the `summary` (the landing page shows it), and override `ui` only where
   the defaults do not fit.
6. `fixtures/expected.js`: regenerate it with
   `node test/smoke/fixtures-golden.js --provider <id> --update` once `dist/<id>/index.html` is
   built, and review it before committing.
