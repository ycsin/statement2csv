<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->

# Adding a provider

A provider is one new folder, `providers/<id>/`. Adding one needs no edit to `core/`, `build/`,
`test/` or `tools/`; the new-provider dry run proves that (docs/TESTING.md, dry run), and CI runs
it on every push. This guide takes you from nothing to a tested page, in order. Run every command
from the repository's top folder. The contract the folder must keep is `docs/CONTRACT.md`.

Placeholders: `<id>` is your provider's id, `<Name>` its name, `<template>` the template you
start from (`pdf` or `csv`), `<dir>` the absolute path of the folder that holds your statements
(outside the repository), and `<private-dir>` and `<config-dir>` the folders of docs/TESTING.md
(private data rules): `<private-dir>` is `$S2C_PRIVATE`, else `statement2csv` in
`$XDG_CACHE_HOME`, else `$HOME/.cache/statement2csv`; `<config-dir>` is `statement2csv` in
`$XDG_CONFIG_HOME`, else `$HOME/.config/statement2csv`. The tools print `<private-dir>` as it
stands, never the real path.

## Before you start

- **Tools.** Node 22 or later, git, and the test browser, installed once:

  ```sh
  cd test && npm ci --ignore-scripts && PLAYWRIGHT_SKIP_BROWSER_GC=1 node node_modules/playwright-core/cli.js install --only-shell chromium && cd ..
  ```

  This installs playwright-core 1.57.0 into `test/node_modules` and chrome-headless-shell
  revision 1200 under `$HOME/.cache/ms-playwright` (with Playwright's ffmpeg beside it),
  downloading only what is not there yet. `PLAYWRIGHT_SKIP_BROWSER_GC=1` keeps the installer
  from deleting the browsers of other projects in that folder, which it does when it cannot see
  who uses them. If the browser lives elsewhere, set `CHROME` to its executable.
- **Pick the id.** A lowercase letter, then up to 31 lowercase letters, digits or `-`; not `all`;
  not the id of another provider or skeleton. It becomes the page's URL (`<id>/`), the default
  storage keys (`<id>-csv-mode`, `<id>-csv-accounts`) and the zip names (`<id>-csv-….zip`), which
  are frozen once the page is released.
- **Pick the name.** The provider's own name, as users know it: letters and digits, with spaces
  and `. , & ' ( ) + -`, at most 60 characters. It is the brand in file names (`<Name> accounts -
  ….csv`) and the landing page's link text. Shared code must not already contain it as a whole
  word or phrase (the generic lint checks every provider name against `core/`, `build/`,
  `tools/`, `test/`, `README.md` and `NOTICE`), so a plain `Bank` would not do.
- **Pick the template.** `--from pdf` for PDF statements (`providers/_template-pdf/`: a monthly
  statement with a section per account, read as positioned text lines); `--from csv` for CSV
  exports (`providers/_template-csv/`: a transaction history with a running balance). For
  spreadsheets in the same ledger shape, or files that are not a monthly multi-account ledger at
  all, read "Unusual shapes" at the end first.

## 1. Scaffold

```sh
node tools/new-provider.js <id> --name "<Name>" --from <template>
```

For example `node tools/new-provider.js my-bank --name "My Bank" --from pdf`. The scaffold:
- refuses an invalid, reserved or existing id, an id whose default storage keys, zip slug or
  parser global another provider uses, and a name that is not a plain name, writing nothing;
- copies the template to `providers/<id>/`, except `fixtures/expected.js`;
- in `provider.js`, writes a new header and sets `id`, `name`, `summary: "TODO"` and
  `parserGlobal: "<PascalId>Parser"` (for `my-bank`, `MyBankParser`); renames the template's
  parser global in `parser.js`; and puts `<Name>` in place of "Example Bank" in `page.html` and
  `README.md`;
- writes `frozen.js` with the values that follow from the id and the name (storage keys, mode
  values, configurator kinds, naming, the portfolio id pattern `^[^:]+:[A-Z]{3}$` of the
  templates' `<account number>:<CCY>` ids, and `kindModel: "standard"`), and checks the folder
  with the contract checks;
- builds the page in a temporary copy and runs the fixtures golden there with `--update`, which
  writes `providers/<id>/fixtures/expected.js` for the new name and slug.

It prints what it did and exits 0. Nothing outside `providers/<id>/` is written.

If it says `fixtures/expected.js not generated` because `test/node_modules` or the browser is
missing, it exits 1 after writing everything else. Install them (Before you start), then run the
two commands it prints:

```sh
node build/build.js && node test/smoke/fixtures-golden.js --provider <id> --update
```

Your folder now holds a working copy of the template:

| File | What it is |
|---|---|
| `provider.js` | the descriptor (docs/CONTRACT.md, descriptor) |
| `frozen.js` | the compatibility surface (docs/CONTRACT.md, frozen.js) |
| `parser.js` | the parser, still reading the template's synthetic format |
| `page.html` | the page's texts, with your name |
| `README.md` | this list of what to change, for the folder |
| `fixtures/statements.js` | the template's synthetic files, in the template's format |
| `fixtures/hostile.js` | (PDF template only) synthetic files with markup, for the injection smoke |
| `fixtures/expected.js` | the downloads those fixtures give on your page |

`node test/contract/run.js --provider <id>` passes on it, and the steps below change it into
your provider.

## 2. Keep your statements private

Put your statement files in a folder outside the repository, `<dir>`. Then tell the harness
where it is, in one of three ways:
- give `--statements <dir>` on every harness command below; or
- use `$HOME/statements/<id>/` (or `$S2C_STATEMENTS/<id>/`) as `<dir>`, which the harness finds
  by itself; or
- add it to the untracked user config `<config-dir>/statements.js`, creating the file if needed:

  ```js
  module.exports = {
    providers: {
      "<id>": { dir: "<dir>" },        // an absolute path
    },
  };
  ```

  (Keep any `providers` and `refuse` entries the file already has; docs/TESTING.md describes the
  rest of the file.)

The commands below are written with `--statements <dir>`; with the second or third way, leave it
out. Never copy a statement, or anything made from one, into the repository: `.gitignore`,
contract check C18 and the privacy lint guard against it.

## 3. Look at the input

```sh
node test/harness/run.js --provider <id> --statements <dir> --dump
```

The harness prints its steps and, on its last line, the folder its details went to,
`<private-dir>/harness/<run>` (`<run>` is a time stamp and a short id). Your parser is still the
template's, so the run fails (exit 1) for
every file the template does not know; that is expected. Step H13 writes the dump anyway, to
`<private-dir>/harness/<run>/<id>/dump/`, one set per file, numbered in input order:
- PDF: `NNN-<file>.items.json` (pdf.js's text items) and `NNN-<file>.lines.txt` (each page as the
  text lines `StatementLayout.pageLines` gives the parser, cells joined by two spaces);
- CSV: `NNN-<file>.csv.txt`, the text the parser gets;
- XLSX: `NNN-<file>.sheets.json`, the workbook object the parser gets.

These files hold your statements' content: they stay in `<private-dir>`.

## 4. Write parser.js

Change `parser.js` to read your format. The template's parser is the model: it recognises its
files, reads each into a small object, puts the accounts into `raw` portfolios, and finishes with
`StatementAssemble.build`.

- **Keep the UMD lines at the top.** The browser branch sets the global that `parserGlobal` names
  (`root.<PascalId>Parser = factory(…)`), and the Node branch requires the core modules by their
  relative paths (`../../core/export.js`, `../../core/assemble.js` and, for PDF,
  `../../core/layout.js`). The factory's arguments must match `uses` in `provider.js`.
- **Recognise your files.** Return an `errors` entry `{id: s.id, error: "not a <Name> statement"}`
  for every file that is not yours, and keep going.
- **Read each statement:** the period, each account's number, currency, opening and closing
  balance, its cash rows and its trades. A PDF statement object is `{id, pages}`, each page the
  list of its text items `{str, x, y, w, h}` (the dump's `items.json`); a CSV one `{id, csv}`; an
  XLSX one `{id, workbook}` (docs/CONTRACT.md, input statement objects). For a PDF page,
  `L.pageLines(items)` returns its lines from the top, each `{y, h, text, items}`: `text` is
  what the dump's `lines.txt` shows (the cells joined by two spaces), and `items` the cells
  `{s, x, w}` with their positions, which tell columns apart where the text cannot (a withdrawal
  from a deposit, say; compare a cell's `x` with the column headings').
- **Build `raw`:** one portfolio per account, keyed by a stable portfolio id, with
  `{label, names, kind, currency, months: {"YYYY-MM": {monthEnd, opening, closing, fx: null}},
  cash, trades}`. A cash row is `{date: "YYYY-MM-DD", amount, currency, name, notes, kind}`, with
  the amount **inflow negative** (a deposit of 100 is `amount: -100`). `names` lists the account's
  names oldest to newest, its `label` last. The label is the account's default export name, and
  portfolios with equal labels merge into one account, as a rename to the same name would: give
  each portfolio a label of its own. The templates add the currency, then the whole number, to a
  label that two portfolios would share (`distinctLabels`), so one number in two currencies, or
  two numbers that end alike, stay apart.
- **Choose the portfolio id format with care.** Ids are the keys of users' saved settings, frozen
  once released. Keep `configIdPattern` in `frozen.js` matching every id you return (harness step
  H11 checks it); the templates use `<account number>:<CCY>`.
- **Choose the kind:** `bank` for accounts whose every month must reconcile exactly (opening +
  rows = closing), `investment` or `cash` for accounts valued by the statement (a monthly
  adjustment then meets each closing).
- **Report, never adjust.** Data that does not add up goes to `warnings` as `"YYYY-MM: …"`. A row
  you do not export goes to `skippedRows` as `{date, category, detail, account}`; category
  `"unknown"` means a row type you do not recognise yet, and the harness fails on it. A second
  statement for the same month is an `errors` entry `duplicate statement for YYYY-MM, ignored`,
  decided in a stable order (the templates sort by month, then by file name), never by the order
  the files were added in. File names compare by code point, where `-` and ` ` come before `.`:
  of `x-2026-01.csv` and `x-2026-01-copy.csv` the copy comes first and wins, and the original
  gets the error (the templates name their copies `…_copy`, which comes after).
- **Finish with `A.build({raw, config, months, statements, errors, warnings, skippedRows})`**:
  `months` lists `{month, id}` for every month a statement covers; `statements` counts the files
  you used. `build` applies the configurator's settings and returns the result
  (docs/CONTRACT.md, Result shape).
- **Rules for every new parser:** never throw, whatever the input or the config; never mutate the
  statement objects; never use the cash kinds `adjustment`, `gap` or `trade`; compare strings by
  code point (`a < b`), never with `localeCompare()` without a locale; no clock, randomness, DOM,
  storage or network; keep per-statement work in a `WeakMap` keyed by the statement object, as the
  templates do (the page parses again on every settings change).

## 5. Iterate

```sh
node test/harness/run.js --provider <id> --statements <dir>
```

Repeat until it ends with `<id>: … 0 failed`: steps H1-H11 pass in strict mode (contract,
reconciliation per account and per month, gap drop, the files, the config contract, determinism,
the id pattern, no `unknown` rows). Each failing step's problems are in
`<private-dir>/harness/<run>/<id>/report.json`. `--only H5,H6` runs fewer steps (H1-H3 always
run), and `--node-readers` reads CSV and XLSX in Node, which is quicker (PDF is always read in
Chrome).

**Errors your folder is meant to give.** A real folder may hold files that rightly give an
`errors` entry: a file that is not a statement, or a second copy of a month. H5 fails on every
`errors` entry it was not told about ("an error that the private declaration expectErrors does
not list"), and H6 on export problems beyond a declared count. Declare them by file name in the
untracked user config (step 2), never in the repository; the harness then requires exactly
those errors and prints only their count:

```js
module.exports = {
  providers: {
    "<id>": { dir: "<dir>", expectErrors: ["<file name>", "<file name>"], allowProblems: 0 },
  },
};
```

(`dir` may be left out when you give `--statements`.) Or take those files out of the folder.

## 6. Page copy and options

- **`page.html`:** write each slot in your provider's words (the slots and their rules are in
  docs/CONTRACT.md, page.html). Keep the shared help items through the partials:
  `{{> help-qif-short}}`, `{{> help-accounts-combined}}` and `{{> help-columns-transactions}}` (or
  `help-qif-long` and `help-columns-full` when your accounts have trades). Name no finance app:
  the pages say "a personal finance app".
- **`provider.js`:** replace `summary: "TODO"` with the one line the landing page shows. Override
  `ui.*` only where needed (docs/CONTRACT.md, descriptor): `ui.skipLabels` for your skipped-row
  categories (it replaces the default labels as a whole, so repeat the ones you still use),
  `ui.text.gapWarning` (by default it asks for "the missing PDF"), `ui.diagnostics:
  ["gaps", "late", "closed"]`, or `ui.status: "statements+downloads"` if you count downloads
  apart from statements.
- **`frozen.js`:** if you change `storage`, `naming` or the id format, change `frozen.js` to the
  same values; until the first release that is free (contract check C05 keeps the two equal).

## 7. Synthetic fixtures

The fixtures are the CI test of your provider: CI has no statements, so without them it would
run your parser on garbage input only and open your page only empty or with a bogus file, and
nothing would check what they make of a statement.

- **Replace the template's fixtures** with invented files in your own format in
  `fixtures/statements.js` (PDF pages as positioned text runs, CSV text, or XLSX `sheets`;
  docs/TESTING.md, fixture spec format). Keep the marker `SYNTHETIC TEST DATA` in the file. Make
  up every name, number and amount; copy nothing from a real statement. Cover what your parser
  does: several accounts and currencies, a missing month, an opening balance, a duplicate (listed
  in `expectErrors`), descriptions with `,`, `"` and a leading `=`.
- **`fixtures/hostile.js`** (optional; the PDF template has one): invented files with markup, such
  as `<b onmouseover="window.__pwned=1">x</b>`, in every field your page prints (an account name,
  a description of a skipped row). The injection smoke requires its payloads to reach every part
  of the page that shows text: the cards, the configurator, the status and the diagnostics.
  Rewrite it in your format, or delete it. To see what your parser makes of these files, copy
  `hostile.js` as `statements.js` into a scratch folder outside the repository and run
  `node test/harness/run.js --provider <id> --statements <that folder> --dump --only H4,H13`:
  H4 counts the files your parser recognises, and the dump shows their lines (a long payload
  can run into the next cell of a PDF line).
- **Rebuild the page, then regenerate the expected downloads:**

  ```sh
  node build/build.js
  node test/smoke/fixtures-golden.js --provider <id> --update
  ```

  The fixtures golden runs your built page `dist/<id>/index.html`, so build first; it refuses to
  write `fixtures/expected.js` while the page and the downloads hook disagree. Read the new
  `expected.js` before you commit it. Regenerate it after every change to the parser, the
  fixtures, the page or the naming.
- **Run the checks on the fixtures:**

  ```sh
  node test/harness/run.js --provider <id> --statements providers/<id>/fixtures --browser
  node test/smoke/injection.js --provider <id>
  ```

## 8. Build and look

```sh
node build/build.js
```

It writes `dist/<id>/index.html` and refreshes `dist/index.html`. Open
`dist/<id>/index.html` in a browser (it works from disk), load your statements, and read the
cards, the status and the diagnostics. Then run the harness on the built page too:

```sh
node test/harness/run.js --provider <id> --statements <dir> --browser
```

## 9. Check and commit

Run what CI runs:

```sh
git ls-files -z -- '*.js' | xargs -0 -n 1 node --check
npm run check && npm run contract && npm run contract-browser && npm run lint && npm run unit && npm run smoke
node test/harness/run.js --all-fixtures --browser
node test/contract/new-provider-dryrun.js
```

Commit `providers/<id>/` (with `frozen.js` and `fixtures/expected.js`), `dist/<id>/index.html`
and `dist/index.html`. Never commit a statement.

CI (`.github/workflows/build-check.yml`) runs the same checks on every push. A push to `main`
publishes: `pages.yml` deploys the committed `dist/`, your page and its link on the landing page
included, once those checks pass on that commit (docs/TESTING.md, CI scope).

## 10. After the first public release

`frozen.js` is binding from then on. Changing any value in it (storage keys, mode values, naming,
the id format) renames users' files or loses their saved settings, so it is a deliberate
migration. Contract check C05b keeps the file required for as long as `dist/<id>/index.html` is
tracked.

## When a check fails

| Message | What to do |
|---|---|
| `fixtures/expected.js is missing: run … --update` | step 7: build, then `--update` |
| `dist/<id>/index.html is missing` or `is stale: run node build/build.js` | `node build/build.js` |
| `fixtures/expected.js: …` (a state or a record differs) | your page's downloads changed: if that is intended, step 7's `--update`, then read the difference |
| `[C04] … is also used by …` | your storage keys, slug or parser global clash with another provider's: change the id (or set `storage`, `naming.slug` and `frozen.js` explicitly) |
| `[C05] … in the descriptor but … in frozen.js` | `provider.js` and `frozen.js` disagree: make them equal (step 6) |
| `[C11] … parseStatements throws` | the parser throws on garbage input or a garbage config: guard it (step 4) |
| H11 `the portfolio id … does not match` | your ids changed format: update `configIdPattern` in `frozen.js` |
| `[generic/provider-name] names provider <id>` | your provider's name is a word of shared code: choose a more distinctive name |
| `no payload of fixtures/hostile.js shows as literal text in #…` | your hostile files miss a part of the page: put markup where that part prints text |

## Unusual shapes

- **Different writers** (for example 8-decimal quantities, or extra columns): export functions
  with core names from your parser and list them in `exportOverrides`; keep the set closed
  (C08b; for example `adjustedCsv` together with `adjustedEntries`); reuse
  `StatementExport.csv` and `csvCell` for quoting and the formula guard.
- **Spreadsheet statements** in the ledger shape: start from `--from csv`, set
  `inputs: ["xlsx"]`, read `s.workbook` instead of `s.csv`, and write the fixtures with `sheets`.
- **Two input types** (PDF statements and CSV downloads): list both in `inputs`, and tell the
  statement objects apart by their keys (`s.csv` or `s.pages`).
- **Not a multi-account monthly ledger** (one account with parse-time options, or a different file
  set): use `app: "custom"` with your own `app.js` and a pure files helper listed in `scripts`
  whose `downloads()` lists exactly what the page offers, and add a `test.js` exporting `parse`,
  `downloads` and `reconcile` (optionally `checkResult` and `expectedHeader`), all working through
  `ctx.P` (docs/CONTRACT.md, custom-app providers). The harness, replay and the fixtures golden
  then need no test edit. `providers/etoro/` is the worked example.
- **A new input format** (OFX, XML): a new core reader is a core change with a contract version
  bump, not provider work.
