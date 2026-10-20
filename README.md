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

## Development

The build needs Node 22 or later and has no dependencies. The browser tests use one pinned
package, installed inside `test/` only, and one pinned browser:

```sh
node build/build.js                  # build every page into dist/
node build/build.js --check          # verify that dist/ is current
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
