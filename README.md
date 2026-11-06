<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->

# statement2csv

Converters that turn account statements (PDF, CSV or XLSX, depending on the provider) into CSV and
QIF files you can import into a personal finance app.

Each converter is one self-contained page that works offline. Your statements are read in your
browser and never leave it: the pages make no network requests, nothing is uploaded, and the only
thing a page remembers is your settings, in your browser's local storage.

The converters: <https://ycsin.github.io/statement2csv/>, deployed from `dist/` on every push to
`main` once CI passes. They replace the old single-provider repositories, whose pages still work
on the same site and share your saved settings with these (`docs/MIGRATION.md` records how they
became this one: derivation map, decisions and gate log). You can also save a page from
`dist/<id>/index.html` and open it from disk.

## Supported providers

One converter per provider. `node build/build.js` writes this table between its two marker
comments from each published provider's descriptor (`name` and `summary`, the same text and
order as the landing page), and `node build/build.js --check` fails when it is stale. Each
converter's page says exactly which statement formats it reads and what it exports.

<!-- providers:start -->
| Provider | Statements | Converter |
|---|---|---|
| Chocolate | Chocolate Finance monthly account statement PDFs, one account per currency | [ycsin.github.io/statement2csv/chocolate/](https://ycsin.github.io/statement2csv/chocolate/) |
| MariBank | MariBank Deposit and Investment Statement PDFs, one set of files for the savings account and one per fund | [ycsin.github.io/statement2csv/maribank/](https://ycsin.github.io/statement2csv/maribank/) |
| Maybank | Maybank account statement PDFs | [ycsin.github.io/statement2csv/maybank/](https://ycsin.github.io/statement2csv/maybank/) |
| POSB | POSB and DBS monthly statement PDFs and transaction history CSVs, one account per deposit account and currency | [ycsin.github.io/statement2csv/posb/](https://ycsin.github.io/statement2csv/posb/) |
| StashAway | StashAway monthly statement PDFs, one set of files per portfolio | [ycsin.github.io/statement2csv/stashaway/](https://ycsin.github.io/statement2csv/stashaway/) |
| Versa | AHAM Capital (Versa) Statement of Account PDFs, one investment account per account number and fund currency | [ycsin.github.io/statement2csv/versa/](https://ycsin.github.io/statement2csv/versa/) |
| eToro | eToro account statement .xlsx downloads, as one account that follows total equity | [ycsin.github.io/statement2csv/etoro/](https://ycsin.github.io/statement2csv/etoro/) |
| moomoo | moomoo monthly account statement PDFs, one account per currency for securities and cash, and one per fund | [ycsin.github.io/statement2csv/moomoo/](https://ycsin.github.io/statement2csv/moomoo/) |
<!-- providers:end -->

## Development

The build needs Node 22 or later and has no dependencies. The browser tests use one pinned
package, installed inside `test/` only, and one pinned browser:

```sh
node build/build.js                  # build every page into dist/ and the provider table in README.md
node build/build.js --check          # verify that dist/ and the table are current
cd test && npm ci --ignore-scripts && PLAYWRIGHT_SKIP_BROWSER_GC=1 node node_modules/playwright-core/cli.js install --only-shell chromium && cd ..
npm run contract && npm run contract-browser && npm run lint && npm run unit && npm run smoke
node test/harness/run.js --all-fixtures --browser
node test/contract/new-provider-dryrun.js
```

To add a provider:

```sh
node tools/new-provider.js <id> --name "<Name>" --from pdf|csv
```

then follow `docs/ADDING_A_PROVIDER.md`. A provider is one folder under `providers/`; nothing in
the shared code, the build or the tests needs to change. `providers/_template-pdf/` and
`providers/_template-csv/` are the two templates, with synthetic data.

| Document | What it covers |
|---|---|
| `docs/ADDING_A_PROVIDER.md` | the step-by-step guide to a new provider |
| `docs/CONTRACT.md` | the provider contract: descriptor, frozen.js, page copy, parser, result |
| `docs/ARCHITECTURE.md` | the core modules, the pages' scripts and data flow, the build |
| `docs/TESTING.md` | every test layer, its commands, and the private-data rules |
| `docs/SECURITY.md` | the content security policy, escaping, pdf.js, storage keys |
| `docs/MIGRATION.md` | how the old repositories became this one: derivation map, decisions, gate log |

Statements are private. Never commit one, or anything made from one: `.gitignore`, the contract
checks and the privacy lint guard against it, and the tests read real statements only from paths
outside this repository.

## License

Apache-2.0; see `LICENSE` and `NOTICE`.
