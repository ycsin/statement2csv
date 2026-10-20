<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->

# Migration log

This file records how the eight old converter repositories become this one. It has four parts: the
derivation map (old file → new file), provenance of copied files, decisions taken where the design
left a choice open, and the gate log. Gate results are verdicts, dates and hashes, and counts about
the code and the synthetic data only: no figure computed from the real statements (how many
statements, months, accounts or records, or run sizes that follow from them) is recorded here; those
stay in the reports under `<private-dir>`. Machine paths are written as placeholders: `<old-root>`
(the folder holding the old repositories), `<statements-dir>`, `<private-dir>` and `<config-dir>`.
The commits this file names up to M12 belong to the development history, which is kept private; the
public repository starts at M13 with one commit (decision 214).

The old repositories are read-only. Nothing in this migration writes to them, runs npm in them, or
runs `git status`/`git diff` there. Their integrity is checked with `rev-parse HEAD`, `cat-file blob`
and a before/after file manifest (`test/lib/baseline.js`).

## Old repositories (frozen at M0)

| id | old repository | legacyHead | sha256(index.html) |
|---|---|---|---|
| stashaway | stashaway2csv | `ed1879d267bdcd53cba5432b00b7d76ed6b1b76d` | `887b1108c1a81709…` |
| maribank | maribank2csv | `bc79c6919cc9420e149b36fec3ad25e4bbafe2b7` | `ad8a22d49b33a9cb…` |
| chocolate | chocolate2csv | `eff3c0d7c60aa8410a5216ddd6bdc6c3846b6241` | `5b79b2d531ae6760…` |
| moomoo | moomoo2csv | `7bd9b9d794643dbfbd9e84bf26a32b71ca5661ef` | `eee74a3a012f4cdb…` |
| etoro | etoro2csv | `add9f42ac11f196ecd01061bfd4dac1ab1d3e231` | `47f7746b398b0ea5…` |
| posb | posb2csv | `93c1778d6ec29d436d426889e4f5a430c53bb05f` | `e2d008cc51c310ac…` |
| maybank | maybank2csv | `27f42f7bcfef9cf4f8823458c73902d4d4831de7` | `4038854aeaa5c60b…` |
| versa | versa2csv | `75d4f12196e13bab22112ec18d050e7e38903e11` | `d649263fffede5d3…` |

The full hashes are in each `providers/<id>/frozen.js`.

## Derivation map

| New file | Derived from | How |
|---|---|---|
| `LICENSE` | posb2csv `LICENSE` at its legacyHead (identical in all 8) | byte copy; sha256 equals the git blob |
| `vendor/pdf.min.js` | posb2csv `vendor/pdf.min.js` (pdf.js 3.11.174, identical in the 7 PDF repos) | byte copy; sha256 equals the git blob |
| `vendor/pdf.worker.min.js` | posb2csv `vendor/pdf.worker.min.js` | byte copy; sha256 equals the git blob |
| `providers/<id>/frozen.js` (8) | design §4.1; each value re-read from the old `src/app.js` at legacyHead | written in M0, before any other provider file (see below) |
| `core/page/style.css` | versa2csv `src/index.template.html`:14-102 (the `<style>` body; stylesheet variant `6ac4f3bfba`, the one with `[hidden] { display: none !important; }`) | SPDX comment lines, then those lines byte for byte, then `#empty { margin-top: 24px; }` (the old inline `style` attribute of `#empty`) appended |
| `core/page/skeleton.html` | versa2csv `src/index.template.html` (page structure and whitespace) | the design's tokens (§5.4) in place of the provider texts; `#empty` without its `style` attribute; `<meta name="referrer" content="no-referrer">` added |
| `core/page/partials/help-qif-short.html` | versa2csv `src/index.template.html`:156 | W1 (the old QIF expansion becomes "a QIF file") |
| `core/page/partials/help-qif-long.html` | maribank2csv `src/index.template.html`:155 | W1 |
| `core/page/partials/help-accounts-combined.html` | versa2csv template:157 (= maribank2csv template:156) | verbatim |
| `core/page/partials/help-columns-transactions.html` | versa2csv template:158 | verbatim |
| `core/page/partials/help-columns-full.html` | maribank2csv template:157 | verbatim |
| texts in `core/contract/constants.js` | notes: maybank2csv `src/app.js`:218-221; `bankDownloadOnly`: posb2csv app.js:220; gen2 gap and partial warnings: versa2csv app.js:300, :302; gen1 gap warning: maribank2csv app.js:297-298; default skip labels: moomoo2csv app.js:315-317 plus versa2csv app.js:324 (`trade without qty/price`) | character for character, typographic quotes included (scratch check: every text found verbatim in an old `app.js`; the mode labels come from the templates' mode buttons) |
| `build/legacy-inline.js` | the shared algorithm of every old `build.py` (versa2csv build.py:15-24) | reimplemented for gate G2 only; the marker tables are read from each `build.py` at test time |
| `core/export.js` | versa2csv `src/export.js` (export layer C) | pinned copy with edits E1-E4: lines 3, 78 and 203 made generic (comments only), `csvCell, csv` added to the returned API on line 221 |
| `core/layout.js` | versa2csv `src/layout.js` (layout L3) | pinned byte copy |
| `core/xlsx.js` | etoro2csv `src/xlsx.js` | pinned byte copy |
| `core/zip.js` | versa2csv `src/app.js`:392-418, the ZIP writer (the same lines in all 8 apps) | moved. Lines 14-15 are :392-393 (`CRC`, `crc32`). `zipParts(files, now)`, lines 20-43, is :394-418 with :394 renamed, :398 (`const now = new Date();`) dropped for the parameter, and :417 returning the parts instead of the Blob. `zip(files)`, lines 46-48, makes the Blob of :417 from `zipParts(files, new Date())` |
| `core/storage.js` | versa2csv `src/app.js`:24-36 (the same in the 7 statement apps); etoro2csv `src/app.js`:14-19 | moved, with the key and the mode ids as parameters. `loadMode` (lines 15-17) is :31-33, accepting `ids.slice(1)` with `ids[0]` as the default; `saveMode` (18-20) is :36, the storage line of `setMode`; `loadConfig` and `saveConfig` (23-30) are :24-29 with the config as a parameter, plus a `key == null` guard (decision 54). The custom app's :14-16 and :19 are `loadMode` and `saveMode` with the ids `balance, month, day` |
| `test/legacy/export-A.js`, `export-B.js`, `export-C.js` | maribank2csv `src/export.js` (A), posb2csv `src/export.js` (B), versa2csv `src/export.js` (C) | pinned byte copies, written from the git blobs by `tools/provenance.js rederive --write` |
| `test/legacy/layout-L1.js`, `layout-L3.js` | maribank2csv `src/layout.js` (L1), versa2csv `src/layout.js` (L3) | pinned byte copies, written the same way |
| `test/legacy/zip-old.js` | versa2csv `src/app.js`:391-418 | pinned excerpt (decision 52): the old lines inside a module wrapper, with one edit on two lines (:394 takes `now`; :398 no longer reads the clock) |
| `test/legacy/storage-old.js` | versa2csv `src/app.js`:24-36; etoro2csv `src/app.js`:14-19 | pinned excerpts (decision 52): the old lines verbatim, each block inside a function whose parameters stand for the key constants and `localStorage` |
| `core/escape.js` | `esc`: versa2csv `src/app.js`:435 (the same line in all 8 apps) | moved verbatim; `html`, `setHtml`, `cssToken` are new (design §3.2, decision 61), and both apps render through them since M8 (decision 157) |
| `core/shell.js` | versa2csv `src/app.js`: `$` :7, `monthLabel` :105, `download` :355-363, the input block :420-431, `setBusy` :434, `fmtInt`/`fmtMoney` :436-437 (the same lines in all 8 apps; etoro2csv's input block, :183-194, differs only in its `#clear` body) | moved. The input block is the body of `wireInput`, one level deeper, with `addFiles` → `onFiles`, `setMode` → `onMode`, `render` → `onRange` and the `#clear` body → `onClear()` (decision 60) |
| `core/readers/pdf.js` | versa2csv `src/app.js`:9-13 (`init`), :49-63 (`read`); stashaway2csv `src/app.js`:55 for the page transform; versa2csv app.js:66 for `accepts` | moved. `init` is :10-13 one level deeper; in `read` the page push of :57-59 becomes the `items` mapping (:58 verbatim) and `transform ? transform(items) : items` |
| `core/readers/csv.js` | posb2csv `src/app.js`:49 (`isCsv` → `accepts`), :51 (the CSV branch of `readStatement` → `read`) | moved |
| `core/readers/xlsx.js` | etoro2csv `src/app.js`:28-32 (`inflateRaw`), :39 (the `Xlsx.read` call → `read`) | moved; `accepts` adds the spreadsheetml MIME type to etoro2csv app.js:35's name test (design §3.8) |
| `core/files.js` | versa2csv `src/app.js`: `modeOf` :44, `label` :46, `earliest` :104, `exportsFor` :108-127, `fileFor` :129-146, `accountsFile` :148-164, `combinedFiles` :166-186, the zip names :380-381 and :387-388. Restated as data: the card rule :195-198 with its buttons :225-227, the toolbar rule :231-233 and the download handlers :365-389. Variants: stashaway2csv app.js:43 (`modeOf` for `investment-cash`); the account prefix and group noun at stashaway2csv app.js:136, :143, :158, :161, :171, :181-182 (maribank2csv, chocolate2csv and moomoo2csv: :138, :145, :160, :163, :173, :183-184); posb2csv and maybank2csv equal versa2csv here apart from the brand | moved with the substitutions of design §3.9 (`state.result` → `ctx.result()`, `state.mode` → `ctx.mode()`, `range()` → `ctx.range()`, the provider strings → `naming`), each body one level deeper inside `create`; `cards`, `allFiles` and `downloads` are new |
| `core/assemble.js` | posb2csv `src/parser.js`:474-507 and the portfolio rows of :510 (the newest accumulator; a superset of maybank2csv `src/parser.js`:203-238) | new code with the semantics of design §3.10. The changes from those lines: code-point order with an id tiebreak; own-property lookups; non-string `name`, `kind` and `mergeInto` read as absent; trades concatenated (and stripped from non-investment accounts unless `cashLikeTrades: "keep"`); `fx` from the first member; the drop rule also looks at trades; inputs never mutated; `months` de-duplicated. `assemble.test.js` embeds :474-507 verbatim and pins `build` to them (decision 63) |
| `providers/<id>/parser.js` (8) | `<legacyRepo>` `src/parser.js` at its legacyHead | pinned copies with one declared whole-line edit each (design §4.3), written from the git blobs by `tools/provenance.js rederive --write`. The edit points the Node branch's `require` line at `../../core/export.js`, and at `../../core/layout.js` for moomoo, posb, maybank and versa; maribank and chocolate keep `./layout.js`, their own copy. stashaway2csv's factory takes no dependencies, so its edit is the comment on line 579 instead (the old QIF expansion dropped). The browser branch (`root.X = factory(root.…)`) is unchanged in all 8 |
| `providers/maribank/layout.js`, `providers/chocolate/layout.js` | maribank2csv `src/layout.js` (L1), chocolate2csv `src/layout.js` (L2) | pinned byte copies, written the same way. L2 differs from L1 only in its line 3 comment, and both set `root.MariLayout`; the maribank copy is byte-identical to `test/legacy/layout-L1.js` |
| `providers/etoro/files.js` | etoro2csv `src/app.js`: `span` :67, `files` :70-83, the zip name of :153. Restated as data: render's card rule :99-105 (one card iff there are entries in range, one button per element of `out`), the `#zip` rule :106 and the click handlers :147-153 | moved, one level deeper inside `create`, with `state.result` → `result()` on :71 and the zip name's literal slug → `naming.slug` (the same string); `range` is the context's. `downloads` is new (decision 69) |
| `providers/etoro/test.js` | etoro2csv `src/app.js`:48-51 (what `recompute` leaves in `state.result`); etoro2csv `test/reconcile.js`:14-21 (the anchor check) | new: the hooks of design §2.12 and §4.5 (decision 70) |
| `providers/etoro/app.js` | etoro2csv `src/app.js` (the custom app's controller) | moved line by line (decision 92): 117 of its 203 lines stood verbatim in their order until M8 rewrote its 17 render lines (:55, :99, :101, :102, :104, :105, :112, :114-:116, :121, :123, :124, :127, :130, :134, :135) to `html` and `setHtml`, which leaves 100 (decision 157). Moved to the core: `$` :7, `MODE_KEY` and `loadMode` :11, :14-16, `inflateRaw` :28-32, `monthLabel` :66, `download` :139-146, `CRC`, `crc32` and `zip` :155-181, the input block :184-194 (now one `StatementShell.wireInput` call at its place), `setBusy`, `esc`, `fmtInt` and `fmtMoney` :197-200. Moved to `files.js`: `span` :67, `files` :70-83. Rewritten in place: :12 and :19 (`StatementStorage.loadMode`, `saveMode`), :39 (`StatementXlsx.read`), :93 and :150 (`F.files()`), :153 (`F.zipName()`, `StatementZip.zip`) |
| `providers/etoro/page.html` | etoro2csv `src/index.template.html`: :105 (`h1`), :106 (`lede`), :109-110 (the drop texts), :116 (`empty`), :123 (`mode-label`), :134 (`hint`), :141-149 (`help-items`) | the texts verbatim, with W1 on :147 (decision 93) |
| `providers/etoro/provider.js` | design §4.2's eToro row, checked against etoro2csv `src/app.js`:11 and :15 (the mode key and ids) and the template's picker :112 and mode buttons :125-127 (the labels) | data (decision 94) |
| `providers/etoro/fixtures/statements.js`, `expected.js`, `hostile.js` | – (synthetic) | new (decision 95) |
| `core/app/statement-app.js` | versa2csv `src/app.js` (the reference statement app). The variant lines its switches reproduce: stashaway2csv app.js:43, :55, :200-204, :210, :214, :256, :298, :325, and its gen1 lines :66, :76, :289, :292-293, :295, :304, :337-338; maribank2csv app.js:68, :78, :294, :297-298, :300, :309, :341-342; chocolate2csv app.js:68, :78, :296, :299-300, :302, :311, :343-344; moomoo2csv app.js as maribank2csv's except the balancing-entries section, :339-340; the mode-switch hiding :236-237 that maribank2csv, moomoo2csv and stashaway2csv lack; posb2csv app.js:49-51, :68, :209, :220-223, :299-301, :304, :306-307, :324, :357-358 | moved (decisions 110, 111, 126, 128, 157, 165): of the 414 non-blank old lines, 204 stood verbatim in their order until M8 rewrote 32 of them, the render lines, to `html` and `setHtml` (decision 157), and M9 put :85 inside the parse's `try` (decision 165; an exact LCS now gives 171), and 2 more stand verbatim inside the diagnostics section functions (:348, :350); 167 moved to the core (`$` :7, the worker :9-13, storage :19-33, `modeOf` :44, reading :48-63, `earliest` and `monthLabel` :104-105, the file assembly :107-186, `download` :355-363, the zip writer :391-418, the input block :420-431, now one `StatementShell.wireInput` call at its place, the helpers :433-437: 169 non-blank lines, of which `readStatement`'s first and last lines, :49 and :63, still stand verbatim); 39 are the switch points of design §3.12, rewritten in place (:6, :36, :66, :68, :78, :206-207, :214, :218-221, :237, :263, :296-297, :300, :302-304, :307, :313, :316, :320-327, :336, :347, :349, :351, :380-381, :387-388); 2 comments were dropped (:3, the file's description, and :43, the comment above the moved `modeOf`) |
| `providers/versa/provider.js` | design §4.2's versa row, checked against versa2csv `src/app.js`:19-20 (the storage keys), :163, :183-184, :381, :388 (brand and slug), :219-220 (`notes.other`, `notes.tradelog`) and :321-327 (`skipLabels`) | data (decision 112) |
| `providers/versa/page.html` | versa2csv `src/index.template.html`: :107 (`h1`), :108 (`lede`), :111-112 (the drop texts), :125 (`mode-label`), :138 (`hint`), :141 (`config-help`), :151-158 (`help-items`) | the texts verbatim, with W1 on :156 (decision 112) |
| `providers/maybank/provider.js` | design §4.2's maybank descriptor, checked against maybank2csv `src/app.js`:19-20 (the storage keys), :163, :183-184, :382, :389 (brand and slug) and :321-328 (`skipLabels`); the defaults are its :68, :78, :218-221, :237, :297, :299-302, :320 and :349-352 | data (decision 116) |
| `providers/maybank/page.html` | maybank2csv `src/index.template.html`: :107 (`h1`), :108 (`lede`), :111-112 (the drop texts), :125 (`mode-label`), :138 (`hint`), :141 (`config-help`), :151-158 (`help-items`) | the texts verbatim, with W1 on :156 (decision 117) |
| `providers/posb/provider.js` | design §4.2's posb row, checked against posb2csv `src/app.js`:19-20, :49-51 and :68 (the inputs), :165, :185-186, :388, :395 (brand and slug), :299-301 (`status`), :303-307 (the warning texts and the first-openings noun), :324-332 (`skipDetailed`, `skipLabels`) and :353-358 (`diagnostics`); the card notes and the bank months label (:209, :220-223) are the defaults | data (decisions 116, 118) |
| `providers/posb/page.html` | posb2csv `src/index.template.html`: :107 (`h1`), :108 (`lede`), :111-112 (the drop texts), :125 (`mode-label`), :138 (`hint`), :141 (`config-help`), :151-159 (`help-items`) | the texts verbatim, with W1 on :157 (decision 117) |
| `providers/moomoo/provider.js` | design §4.2's moomoo row, checked against moomoo2csv `src/app.js`:19-20, :138, :145, :160, :173 (the account prefix), :163, :183-184, :370, :377 (brand and slug), :313-318 (`skipLabels`), the gen1 lines :68, :78, :294, :296-298, :300, :309 and :339-340, and the mode-switch hiding it lacks (the reference app's :236-237) | data (decisions 116, 119) |
| `providers/moomoo/page.html` | moomoo2csv `src/index.template.html`: :106 (`h1`), :107 (`lede`), :110-111 (the drop texts), :124 (`mode-label`), :137 (`hint`), :140 (`config-help`), :150-158 (`help-items`) | the texts verbatim, with W1 on :156 (decision 117) |
| `providers/chocolate/provider.js` | design §4.2's chocolate row, checked against chocolate2csv `src/app.js`:19-20 (the storage keys), :138, :145, :160, :173 (the account prefix), :163, :183-184, :374, :381 (brand, group noun and slug), :316-322 (`skipLabels`), the gen1 lines :68, :78, :296, :298-300, :301-302, :311 and :343-344, and the mode-switch hiding :236-237 | data (decision 120) |
| `providers/chocolate/page.html` | chocolate2csv `src/index.template.html`: :107 (`h1`), :108 (`lede`), :111-112 (the drop texts), :125 (`mode-label`), :138 (`hint`), :141 (`config-help`), :151-156 (`help-items`) | the texts verbatim, with W1 on :154 (decision 121) |
| `providers/maribank/provider.js` | design §4.2's maribank row, checked against maribank2csv `src/app.js`:19-20 (the storage keys), :138, :145, :160, :173 (the account prefix), :163, :183-184, :372, :379 (brand, group noun and slug), :314-320 (`skipLabels`), the gen1 lines :68, :78, :294, :296-298, :299-300, :309 and :341-342, and the mode-switch hiding it lacks (the reference app's :236-237) | data (decision 120) |
| `providers/maribank/page.html` | maribank2csv `src/index.template.html`: :106 (`h1`), :107 (`lede`), :110-111 (the drop texts), :124 (`mode-label`), :137 (`hint`), :140 (`config-help`), :150-157 (`help-items`) | the texts verbatim, with W1 on :155 (decision 121) |
| `providers/stashaway/provider.js` | design §4.2's stashaway descriptor, checked against stashaway2csv `src/app.js`:19-20 (the storage keys), :55 (the page transform), :136, :143, :158, :171 (the account prefix), :161, :181-182, :368, :375 (brand, group noun and slug), :43, :200-204, :210 and :256 (the kind model), :298 (the unrecognised portfolios), :308-316 (`skipDetailed`, `skipLabels`), :325 (the skipped-row owner), the gen1 lines :66, :76, :289, :291-293, :294-295, :304 and :337-338, and the mode-switch hiding it lacks | data (decision 120) |
| `providers/stashaway/page.html` | stashaway2csv `src/index.template.html`: :106 (`h1`), :107 (`lede`), :110-111 (the drop texts), :124 (`mode-label`), :133-134 (`accounts-title`, `combined-title`), :137 (`hint`), :139 (`config-summary`), :140 (`config-help`), :150-157 (`help-items`), :160-170 (`help-extra`) | the texts verbatim, with W1 on :155 (decision 121) |
| `providers/stashaway/test.js` | stashaway2csv `test/compare.js`:26 (`key`), :28-41 (`diffMultiset`), :56-69 (the comparison) | ported as the `reference` hook of design §2.12 and §4.5 (decision 123) |
| `providers/_template-csv/*` | design §2.13 (the CSV template, complete in the design) | the design's descriptor and `page.html` verbatim, its parser with three additions (decision 196) and labels of their own (decision 206); fixtures synthetic, `expected.js` generated (decisions 198, 206) |
| `providers/_template-pdf/*` | design §2.13's three differences and fixture list, design §1 (`hostile.js`) | new (decisions 197, 206); fixtures synthetic, `expected.js` generated (decisions 198, 206) |
| `tools/new-provider.js` | design §7 step 1 (a)-(f) | new (decision 199) |
| `test/contract/new-provider-dryrun.js` | design §6.5 (the dry run) | new (decisions 200, 209) |
| `docs/CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/ADDING_A_PROVIDER.md`, `docs/SECURITY.md` | design §2, §3 and §5, §6, §7, and §5.5 with §3.2, §3.7, §3.8 | written for the implemented state, with the decisions that amended the design (decision 203) |

Values in `frozen.js`, as checked in each old `src/app.js` (lines at legacyHead):

- `storage`: the `MODE_KEY` / `CONFIG_KEY` constants (app.js:19-20; eToro app.js:11, mode key only).
- `modeValues`: what `loadMode` accepts (app.js:32: `tradelog`, `holdings`, else `balance`; eToro app.js:15: `month`, `day`, else `balance`).
- `configKinds`: the configurator's Type select options `""`, `investment`, `cash` (versa app.js:263-264 and the copies in the other six).
- `naming`: card file prefixes (`StashAway `, `MariBank `, `Chocolate `, `moomoo `; none for posb, maybank and versa), the brand and group noun of the Accounts and Combined files (`<brand> accounts - …`, `<brand> all <noun> - …`), and the zip slug (`<slug>-csv-…`, `<slug>-combined-…`).
- `kindModel`: `modeOf` forces Balance only for `kind === "cash"` in stashaway (app.js:43, `investment-cash`) and for `kind !== "investment"` in the six others (app.js:44, `standard`).
- `legacyDom` (stashaway only): `#portfolios`, `.portfolio`, `#portfolios-count`, `#portfolios-reset` (template:139-142, app.js:238-282).

## Provenance of copied files

| File | sha256 |
|---|---|
| `LICENSE` | `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` |
| `vendor/pdf.min.js` | `5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946` |
| `vendor/pdf.worker.min.js` | `feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b` |

These three are pins in `test/contract/provenance.js` (C15) since WP4a, with every other copied file.
That list, not this table, is what `node tools/provenance.js check` and `rederive` verify.

## Decisions

Choices made where the design was ambiguous or did not cover a detail. Each takes the simplest option
that satisfies the design.

1. **`npm run unit` uses a glob.** Node 22 treats a directory argument to `--test` as a module path
   and fails (checked on 22.23.1 with `node --test test/unit/`). The script is
   `node --test "test/unit/*.test.js"`; the CI step of §6.10 should use the same form.
2. **`npm run smoke` grows with the steps.** It runs `pages.js` and `fixtures-golden.js`. The
   packages that add `injection.js` (WP13, M8) and `parse-error.js` (WP14, M9) append them, so the
   script works at every step.
3. **Dotfiles carry the SPDX lines as `#` comments.** `.gitignore`, `.gitattributes` and
   `.editorconfig` all accept `#` comments; C17 should treat them like `.yml` files.
4. **`.editorconfig` leaves `vendor/` alone.** The pdf.js byte copies end without a newline, so
   `[vendor/**]` sets `insert_final_newline = unset`; otherwise the file is exactly §1.
5. **`test/lib/baseline.js` is written in WP1** (WP0 owns it in §8.2) so that G0 runs on the
   library rather than by hand. It follows the §6.11 signatures. Details the design left open:
   - `before(frozens, {live})` also accepts `{oldRoot}` (a CLI's `--old-root`; default
     `$S2C_OLD_ROOT`, else the home directory). `frozens` may be an array, a Map or an object.
   - `manifests` is a `Map` from the old repository's absolute directory to its manifest, which is
     what `after(manifests)` re-walks.
   - Manifest paths are relative, with `/` separators, and `.` is the repository root.
     `.git/objects` is recorded as a directory, but its contents are not walked.
   - Diff lines read `added: <path>`, `removed: <path>`, `changed: <path> (<fields>)` or
     `retargeted: <path> (<old> -> <new>)`.
   - Every git call drops inherited `GIT_*` variables, sets `GIT_OPTIONAL_LOCKS=0`, passes
     `--no-optional-locks` and sets `GIT_CEILING_DIRECTORIES` to the repository's parent, so it
     cannot fall through to another repository.
   - `liveSha256` sends `Accept-Encoding: identity`, follows up to 10 redirects and times out after
     30 s. Any error or non-2xx status rejects.
6. **Untracked config formats** (`<config-dir>` is `statement2csv` under `$XDG_CONFIG_HOME` or the
   home directory's `.config`; directory 0700, files 0600):
   - `statements.js` exports `{providers: {<id>: {dir}}, refuse: [...]}` as in §6.9. All eight
     providers are mapped explicitly (resolution step 2), even though step 3, the case-insensitive
     folder match, would also find them. `refuse` lists the user's private project directories.
     `expectErrors` and `allowProblems` are left for M7, when the harness first runs on real
     statements.
   - `denylist.txt` and `apps.txt` hold one literal string per line: UTF-8, no comments, no blank
     lines, with a final newline. Suggested matching for WP10: denylist lines as case-insensitive
     substrings, after the SPDX copyright string is removed; app names as whole words,
     case-sensitively, like the provider-name rule, because some app names are ordinary words in
     lower case.
7. **How the denylist was generated.** It was built locally from the real statements and has never
   been printed or committed. Each statement was read by the pinned Chrome with `vendor/pdf.js` (the
   same reading code as the pages). Text was grouped into lines by the old layout module, and the
   old parsers were run through read-only `require`. Its entries come from these sources:
   - personal names: the user's own name in both word orders and three cases, plus the forms
     seen in statements;
   - account numbers: labelled values, bank-format numbers, numbers inside the old parsers'
     portfolio ids, and numbers of 10 or more digits that recur in at least 2 statements;
   - address entries: the address block under the name, or under or beside an Address label,
     on page 1;
   - transfer counterparty names: from `TO:`/`FROM:` lines, person-like names only, with
     business words filtered out;
   - private project directory names.

   Two kinds of candidate were left out on purpose because they would match ordinary text: address
   fragments shorter than 8 characters, and numbers that occur alone on a line in only one statement
   (transaction references). Every entry was checked, case-insensitively, against `vendor/`,
   every old `src/` and template, and this repository: 0 collisions. The app list (35 names) was
   checked as whole words against the same files: 0 collisions.
8. **The `configIdPattern` drafts were checked early.** The old parsers were run on the
   Chrome-extracted statements with an empty config, and every real portfolio id matched its draft.
   No pattern was changed. H11 checks again in M7.
9. **`frozen.js` comments describe id formats in words or placeholders,** never as example numbers,
   so the privacy lint's number rule needs no exemption for them.
10. **G0b's "lints pass" was checked by hand.** The lint tool (`test/lint/`, WP10) does not exist at
    M1. A throwaway script applied the §6.3 rules (headers, privacy rules 1–4, generic) and C18 to
    every file that would be tracked. WP10's lints re-check all of it.

11. **`planScripts` takes the normalized descriptor.** The runtime object lacks `scripts`, `uses`
    and `appScript`, so `planScripts(D, dir, {inject, root})` takes `normalize(D)` and builds piece 11
    itself with `resolveRuntime`. Each piece carries its number `n` (`"1"`…`"13"`, `"12b"`), and the
    `parserScript` piece is marked `parser: true`; `loadPage` uses both.
12. **Template tokens may contain digits.** The design's pattern `[A-Za-z]+` cannot match its own
    `{{h1}}`, so a token is a letter followed by letters or digits. Any other `{{` in a skeleton is an
    error.
13. **`normalize` keeps `D.ui` as written.** The precedence defaults < preset < legacy < ui needs to
    know which ui values are explicit, so `resolveRuntime` applies the ui defaults; `normalize` fills
    every other default. The default `ui.unmappedNoun` is `"account"` (read only with
    `extraWarnings: "unmapped"`).
14. **`validate(D, opts)` takes optional facts.** `dir` enables C03's folder rule and C07; `skeleton`
    and `tracked` feed C05b; `parser` (the `parserScript` exports) enables C08 and C09's export check;
    `callGraph`, or `root` to derive it, enables C08b. The build runs C01-C07 without loading parsers;
    the contract runner passes `parser`. Messages read `<file>: [Cnn] <message>`, and the build
    prefixes `providers/<folder>/`. Further choices:
    - storage keys share one namespace across providers (a mode key may not equal another provider's
      config key);
    - statement apps may not set `appScript`, `modes`, `custom` or `multiple: false`; custom apps may
      not set `ui`, `legacy` or `testing.gapDrop: true`;
    - each legacy knob accepts only its non-default value, as listed in §2.3.
15. **`checkResult` strict mode moves warnings into errors** (prefixed `strict:`). The "adjustment not
    last within its day" warning needs the composed namespace (option `P`): adjustments exist only in
    `P.adjustedEntries` output, and a reserved kind in `result.cash` is already an error. "Ascending"
    means non-decreasing in code-point order.
16. **`expectedHeader` needs the account in holdings mode.** A card's transactions file comes from
    `adjustedCsv` or `transactionsCsv` depending on whether its account exports as balance, so the
    caller passes `result` and `account` (and `kindModel`). Without them the header is checked only
    when both writers agree. QIF files, zips and disabled records give null. A writer that throws on
    empty input propagates the error.
17. **Slots.** Text, inline and attribute slots are trimmed. The list slot (`help-items`) and the block
    slot (`help-extra`) are re-indented (common indentation removed, 8 and 4 spaces added), so pages keep
    the old layout; partial lines take the indentation of the token's line. A slot the page type does
    not use (configurator slots without a configurator, a toolbar title without its button) is an
    error, like an unknown slot. A list slot must run from `<li>` to `</li>`, a block slot from
    `<details>` to `</details>`. The default title is HTML-escaped.
18. **The landing page reuses `core/page/style.css`**, with its own CSP (`default-src 'none'` plus the
    style source).
19. **`verify` stays in `build/csp.js`** as §1 lists it (no separate module). It also checks
    `default-src 'none'`, the worker element's attributes and, in hash mode, the style hash. The style
    hash covers the exact `<style>` element text, worked out from the skeleton around `{{style}}`.
    Amended by decisions 181-183 (M10): the policy is rebuilt from the page and must equal it, the
    page must let the browser hash the same text under a policy in force, and the landing page is
    verified too.
20. **Pieces must be valid UTF-8.** Besides the BOM, `</script`, `<!--`, CR and NUL guards, a piece whose
    bytes do not survive a UTF-8 round trip is refused: decoding would replace them silently, and the
    page would no longer hold the file.
21. **Build CLI details.** `--root` alone writes to `<root>/dist`. `--include-skeletons` also builds
    unpublished providers (tests only) and needs an `--out` outside `dist/`. `--check --only` compares
    those pages and the landing page only (no extra-file listing). The build never deletes files;
    `--check` lists extra ones. `--inject` applies to every page of that run and must name an existing
    file under `<root>/test/`. Exit codes: 1 for usage, validation or build errors, 2 for `--check`
    differences.
22. **`test/lib/load-provider.js` details.**
    - With `parser: "old"`, the old `<old-root>/<legacyRepo>/src/parser.js` is composed over the new
      `core/export.js`. The app type is `statement` iff `frozen.js` has `kindModel`. The frozen runtime
      is `{id, app, storage, naming, modes: [{id}], ui: {kindModel}}`: mode labels are unknown
      without `provider.js`.
    - Added `frozenProviders({root})`: every folder with a `frozen.js`, with or without `provider.js`.
      G2 uses it; the golden harness can too.
    - `expectedHeader(download, {mode, result})` also takes the result (decision 16).
    - `loadPage` throws on a C10b violation: the parser global defined before the `parserScript`
      piece, undefined after it, or any piece throwing while it is evaluated.
23. **G2 replays only the shared algorithm.** `readLegacyBuild` refuses a `build.py` whose algorithm
    lines differ, so the replayed algorithm is the one the file runs. `readText` behaves like Python's
    `Path.read_text()`: strict UTF-8, BOM kept, universal newlines (no old source contains CR). G2 also
    blob-checks `build.py`, the template and every part, and compares before/after manifests.
24. **No `dist/` yet.** With no `provider.js` in the tree, the build writes only the landing page. The
    first package that adds published providers runs `node build/build.js` and commits `dist/`.
25. **Unit tests use stub trees.** `test/unit/stub-tree.js` (a helper, not a test) writes stub core
    modules and synthetic providers under the OS temp directory. The two tests that need the real
    `core/export.js` (the pinned call graph and the core headers) skip until WP4 adds it. On a scratch
    copy of export C with edits E1-E4 both pass: the graph equals §2.4, and the 19 exports come in
    `CORE_EXPORT_NAMES` order.
26. **`test/lib` keeps the §6.11 signatures; the extras are optional.** No listed signature changes.
    Additions:
    - `private`: `oldRoot(cli)` takes an optional `--old-root` value (a CLI that accepts the flag also
      sets `S2C_OLD_ROOT`, so the guards see the same old repositories); `privateRoot()`,
      `writePrivate(file, data)` (parents 0700, file 0600), `inside(p, root)`, `repoRoot()`.
      `statementsFor(id, {cli, legacyRepo})`: `cli` is the list of `--statements` values
      (`"<id>=<dir>"`), one such value, or an object; `legacyRepo` defaults to the provider's
      `frozen.js`. The private declarations (`expectErrors`, `allowProblems`) apply whichever step
      found the folder.
    - `capture`: `take(page, {keepBytes})` adds `bytes` (a Buffer) to each download record;
      `install(context)`, `attach(page)`, `clickAll(page, opts)` and `isPdfWorkerFallback(text)`
      (decision 30).
    - `page-driver`: the `Driver` also has `page` and `reload()` (H12 and the golden scenarios reload a
      page), and `clickAll({keepBytes})`.
    - `browser`: `ENVS` (E0-E2), `FIXED_TIME`, `EXPECTED` (both versions and the shell revision,
      cross-checked against `test/package.json` and playwright-core's `browsers.json`), `chromePath()`.
    - `fixtures.loadSpec` also takes the path of a `.js` spec (for `hostile.js`);
      `mkxlsx.renderXlsx(sheets, {deflate: true})` raw-deflates the entries, to exercise a reader's
      inflate path.
27. **Private-data guards, the details.**
    - `privateDir()` creates `<private-dir>` itself (0700; a wider mode is tightened), not the joined
      path, which may name a file.
    - `assertSafeOutput` also refuses every `providers.<id>.dir` of the user config (it may lie outside
      `<statements-dir>`). Both guards compare the lexical and the symlink-resolved form of each path;
      a dangling link is followed by hand, because a write through it would create its target.
    - `assertSafeInput` also allows `<private-dir>`, where the harnesses read back their own goldens
      and caches. It requires both forms of a path to lie inside an allowed root, so a link in a
      statement folder cannot lead a read elsewhere.
    - `userConfig()` reads the file on every call (and evaluates it again only when its text changed).
      It throws on an unknown key, a wrong type or a relative path: silently dropping a `refuse` entry
      would be unsafe. XDG variables count only when absolute.
28. **Storage seeds.** `newContext(browser, env, {})` clears `localStorage` once per tab.
    `newContext(browser, env, null)` installs no storage script, so pages opened one after another in
    one context share what they write (the storage test of §6.8 needs this).
29. **Capture details.**
    - The in-page click loop sets `trigger`, `account`, `card` and `kind` for the download it causes; a
      download outside `clickAll` has them null. With `__s2cPassThrough` a download is both recorded
      and performed, so one pass gives both sides of the cross-check.
    - A zip that cannot be parsed, or whose CRC check fails, gets an extra `zipError` field. It can only
      make a comparison fail.
    - `pageErrors` is cumulative over the page's life, reloads included (in-page reports go through a
      context binding). Entries in `errors` start with `error:`, `unhandledrejection:` or `pageerror:`;
      Playwright reports an uncaught error in both forms. The random id of every `blob:` URL is logged
      as `<id>`, so two runs log the same text.
    - `load()` first waits until the page has received the batch (the picker's `change` or the
      document's `drop`, seen by a capture-phase listener), then applies the settle rule.
30. **pdf.js logs one error per page on `file://`.** Found while driving the eight old pages: on a
    `file://` page (an opaque origin) pdf.js 3.11.174 first starts its worker through an
    `importScripts` wrapper. That fails (`NetworkError: Failed to execute 'importScripts' …`), the
    failure reaches the page as a window `error` event (Playwright's `pageerror` and console do not see
    it), and pdf.js then reads on its main-thread fallback. It happens once per page instance on all
    seven PDF pages, also with no capture hooks and no clock. The library logs it
    (`isPdfWorkerFallback` identifies the entry) but does not count it for the "stuck" rule, which
    would otherwise fire on any PDF that takes more than a second to read. The new pages keep the same
    pdf.js set-up, so they will log it too: the "zero page errors" rule for new pages (§6.7.6 step 5,
    the smoke tests) has to say whether this entry counts. WP2 and WP10 decide; this library does not
    filter it.
31. **Playwright's clock owns the timers.** `clock.setFixedTime` replaces the page's timers with
    Playwright's controller, which keeps them running in real time. An exception thrown inside a timer
    or animation-frame callback is then printed by the controller as a console error instead of an
    `error` event. It still counts, as a console error.
32. **`testlib.test.js` needs no Chrome in CI step 5** (amended by decision 212). Its browser part
    drives a synthetic page with the apps' element ids and runs only when the pinned headless shell
    exists (otherwise it is skipped with a message; CI installs the browser in step 6). Its
    `core/xlsx.js` round trip and its `core/zip.js` comparison start running once WP4 writes those
    files.
33. **`liveSha256` opens a fresh connection per request** (`agent: false`): Node's keep-alive pool
    could hand back a socket the server has already closed.

Decisions of the golden harness (WP2, `test/golden/`):

34. **Declared inputs come from the old page's picker.** WP2 runs before any `provider.js` exists,
    so the scenario generator reads the declared inputs (the `accept` tokens mapped to `pdf`, `csv`,
    `xlsx`, in accept order) and the single-file rule (`multiple`) from the old page's `#picker`,
    which is the page form of the descriptor's `inputs` and `multiple`. Storage keys, mode values,
    config kinds and `legacyDom` come from `frozen.js`. The probe fails if the page's configurator
    and `frozen.storage.configKey` disagree.
35. **Scenario ids.** A page instance (one fresh context, one page load) is
    `<id>/<E>/<O>/<I>/<C>`, or `<id>/<E>/<O>/<I>/C0/M-seed-<value>` for a seeded mode key
    (`M-seed-empty` for `""`). Its steps are `<page>/<M>/<R>` for the mode × range iteration and
    `<page>/@open`, `@load<n>`, `@clear`, `@config<n>` and `@reset` for the states after the other
    actions; every step captures storage, the UI snapshot and the downloads.
    - `M` is the mode id when the button is clicked before the ranges are set, and `then-<mode>`
      when it is clicked after the range (custom apps run both orders).
    - `R` is `full`, `first`, `last`, `mid` (the single month at index ⌊n/2⌋), `rev`, `m<i>`, `p<i>`,
      `s<i>`, `g<k>`, `r<i>-<j>`, or `none` when the page has no months. Indexes count the page's
      own `#from` months. A (from, to) pair is listed once, under its first label, so
      `[next(g), last]` appears as the suffix `s<i>`.
    - The X and S values sit in the C slot (`X-combo`, `S-benign`, `S-break`). The seeded raw
      strings are `C-seed-str-badjson`, `-null`, `-array`, `-number` and `-string`.
36. **The full tier varies one axis at a time; it does not cross them.** Around E0/O0/I0/C0 it
    varies O (O1–O4, with I0 and C0), I (every I value, with O0 and C0) and C (every C value, with
    O0 and I0).
    - The full ranges (single months, prefixes, suffixes and gap suffixes) run on the C0 pages and
      on C-ui-combo. The other C values keep the quick ranges. E1 and E2 use {full, last}, X uses
      {full}, and a seeded mode key captures the state after one load.
    - Exhaustive adds every pair i ≤ j (the reversed pair is `rev`) for E0/O0/I0/C0 and C-ui-combo.
    - This is the reading under which the exhaustive tier's "for C0 and C-ui-combo" fits. Giving
      every C value the full ranges as well would make the full tier several times larger, and
      crossing O and I with C would multiply it again.
    - Two pages with the same environment, seed and actions (for example C-ui-rename-p0 and
      C-ui-rename) run once; the second is recorded as skipped, naming the first.
37. **C axis details.** Every UI-driven C page is its own page load, and its last step clicks
    `#config-reset` (the design's "`#config-reset` between"), so the reset and its stored `{}` are
    compared too.
    - C-ui-kind sets the first non-investment row to Investment and the first investment row to
      Cash-like. C-ui-merge merges into p0 the first other row with p0's currency, else p1.
    - Per portfolio (the first 12): rename to the hostile name; one page per kind the Type select
      offers other than the row's Auto kind (`C-ui-kind-p<i>-<kind>`); exclude; merge into the first
      other row.
    - C-ui-cross-ccy merges the second row of the first pair with different currencies into the
      first. C-ui-combo does the rename, the kind changes, the merge and the exclusion of the last
      row, in that order.
    - E1 and E2 use the E0 probe's indexes; the driver finds rows by index on the page itself.
38. **X is a seeded page.** X-combo seeds a fresh page with the storage that E0/O0/I0/C-ui-combo
    ended with, loads the statements and captures every mode at the full range. The golden records
    the old page with its own storage; `compare` seeds the new page with the golden's (the old
    page's) storage. The other direction, the old page seeded with the new page's storage, adds
    nothing: C-ui-combo's storage strings must already be identical, so the old page would get the
    same seed as in the golden.
39. **The pass-through cross-check paces real downloads.** chrome-headless-shell 143 silently drops
    real downloads beyond ten within about one second on one page; the limit is per page, not per
    browser (only ten arrived at 0–50 ms spacing, all at 100 ms or more). On every quick-tier
    step, capture and compare click every enabled control again with `__s2cPassThrough` set, 150 ms
    apart. They match Playwright's `download` events to the records by sha256, and compare
    `suggestedFilename()` with the raw name whenever it contains none of `" * : < > ? \ / |` or a
    control character. Any difference fails the run.
40. **Browser temp files stay private.** The browser profile holds the pages' localStorage
    (configurator strings), and Playwright keeps real downloads in a temporary folder; both default
    to the OS temp directory. `run.js` points `TMPDIR`, `TMP` and `TEMP` at `<private-dir>/tmp/<run>`
    (mode 0700) before it launches the browser, and deletes that folder at the end.
41. **Manifest format.** One `manifest.json` per provider × tier × environment holds the facts, the
    probe (E0), the scenario list (pages with their actions; skips with their reasons) and, per
    page, its steps (action, busy and threw flags, mode, range, add-order index, storage strings,
    localStorage keys, UI snapshot, download records) and its page errors.
    - UI html parts and download record lists are stored once each, in content-addressed tables
      keyed by 16-hex-digit sha256 prefixes. The tables are written with sorted keys: parallel
      pages fill them in the order they finish, and a first G1 run showed E0 manifests that
      differed only in that order (every step record was identical).
    - Manifests hold no time or run id, so two captures compare byte for byte. The strict
      comparison also compares the tables and every stored page field.
    - `<inputsSha12>` is the sha256 of `canon([[name, size, sha256], …])` over the accepted
      statement files.
    - Bytes are written only with `--keep-bytes`, to
      `golden/<id>/<legacyIndexSha12>/<inputsSha12>/blobs/<sha256>`. Without them, a mismatch
      report has hashes and the new page's bytes only.
42. **Which goldens `compare` uses.** The input-hash folder whose recorded statement files are all
    on disk with the same sha256, with no other accepted file in the statement folder; otherwise it
    asks for a new capture. Goldens recorded with other playwright-core or Chrome versions are
    refused.
43. **New-page errors (decision 30's open point).** On a new page a pdf.js worker-fallback entry
    never counts. Every other console error or page error must also be among the old page's
    entries for the same page instance (as a multiset), and a CSP violation always fails. A new
    page may therefore log nothing the old page did not, so C-seed-badname's TypeError (thrown by
    the verbatim parsers, and caught by the new page from M9 on, decision 165) does not fail G5.
    In determinism the error lists must be identical.
44. **How the waivers work.**
    - W1 replaces the old QIF expansion with "a QIF file" in the old static snapshot.
    - W3 maps the `legacyDom` ids (exact `id` values) and row class (a whole class token) to the
      standard ones in the old page's html parts and static snapshot, and drops the `#empty` style
      attribute from the static snapshot.
    - W2 applies only on C-seed-badname pages (and reviewed page ids; none), from the first golden
      step marked `threw` (a stuck load, or a new uncaught error since the previous step). From
      there busy-line differences are ignored; on the throwing step one
      "Could not read these statements: …" warn line is also removed from the new status, and an
      empty count paragraph left over equals the old empty status (only after a removed line:
      decision 171). Decision 170 lists each use with its parts.
    - SX1 skips the old-versus-new download comparison on S-break pages and requires a replay check
      in its place (WP6, WP13); without one the step fails. Amended by decision 162: S-break runs
      on the new page alone, and its replay check is `checkNewOnly`'s.
    - Uses are counted per step and reported. The S scenarios are generated only with
      `--security` until M8 (by default since then, decision 162).
45. **How the canaries work.**
    - `cent` also wraps the parser global's own `adjustedCsv` and `transactionsCsv` when it defines
      them (an `exportOverrides` provider): the app composes
      `P = Object.assign({}, StatementExport, parser)`, so otherwise the canary could not fire there.
    - The canaries replace `self.StatementExport` and `self.StatementZip` with wrapped copies
      instead of mutating them, so a frozen module object cannot stop them.
    - `checkCanary` also fails a canary on any non-download mismatch, on no mismatch at all, and
      when the goldens cannot show the effect (zip-order without a Download all of two or more
      entries). `canary` refuses custom-app providers.
46. **Download mismatches have the §6.11 shape.** `compare.compareRecords(captured, replayed)`
    returns `{index, trigger, field, expected, actual}`, plus `entry`, `entryName`, `record`, `kind`
    and `account` for context; WP6's `replay.compareRecords` can re-export it. Two zips with the same
    entries (name, size, CRC, sha256) in another order give one `entries.order` mismatch, plus DOS
    time and date per entry matched by identity. Otherwise there is an `entries.set` (and
    `entries.count`) mismatch and every positional difference.
47. **Every command checks the old repos.** §6.7.2 runs before and after every command: manifests,
    git, and the live page unless `--no-live` (then the report marks the run as not a gate run).
    `extract` and `replay` are reserved for WP6 and exit with a message. Console lines show ids,
    counts and hashes; error texts are shown with paths redacted, and kept in full in
    `<private-dir>/reports`. A run writes at most 500 diff folders.
48. **`test/unit/golden.test.js` is a new unit file** (not in the §6.4 list), for WP2's "unit-test
    the canaries' construction". It covers the generator, the waivers, the comparator and the run.js
    helpers. The four canaries run in a vm sandbox modelling a statement-app page: each passes its
    own check and fails the other three, and an unchanged page fails all four. With Chrome it also
    runs `runPage` on a synthetic page: more than ten downloads per step (the pacing), the throwing
    parse, two runs compared strictly, and a changed brand caught by the comparator.
49. **HTML templates put the SPDX comment after `<!doctype html>`.** `core/page/skeleton.html`,
    `core/page/landing.html` and so every generated page open with the doctype and then one
    multi-line comment holding the SPDX lines, as the old templates do. A comment before the doctype
    is valid HTML, but the doctype-first form keeps the generated pages next to the old ones in
    diffs. C17 (WP10) accepts both forms for `.html` files: a leading `<!-- -->` comment, or
    `<!doctype html>` followed directly by that comment.
50. **Chrome gets its own temporary directory.** `test/lib/browser.js` `launch()` makes a fresh
    directory under the current temporary directory, passes it to Chrome as `TMPDIR`, `TMP` and
    `TEMP`, and removes it when the browser disconnects. Chrome's shared-memory files no longer
    collect in the system temporary directory; `run.js` still points the whole run at
    `<private-dir>/tmp/<run>` (decision 40).

Decisions of the core pins (WP4a: `core/zip.js`, `core/storage.js`, `test/legacy/`, the provenance
tool and pin list, the differential and zip tests):

51. **The pin list is an array with two entry forms.** `test/contract/provenance.js` exports an
    array; its header documents both forms. A copy of a whole file is
    `{path, from: {repo, head, path, sha256}, edits: [{line, old, new}], sha256, sentinels?}` (the
    §6.2 shape, with `edits: []` for a verbatim copy). A test-only module built around old lines has
    `parts` instead: literal lines and blob excerpts `{from, lines: [first, last], edits}`. Edits are
    always whole-line replacements, so an edited line keeps its number. WP5 appends its entries in
    the first form, with the posb parser's `sentinels: [{line: 243, contains: "\uFEFF"}]`.
52. **`test/legacy/zip-old.js` and `storage-old.js` are pinned too,** though §1 marks only the
    verbatim copies `[P]`. They are the oracles of the differential tests, so C15 re-derives them from
    the old lines (their wrapper lines are literal lines in the pin list), and the chain from old
    blob to oracle to core module is checked end to end. §1's "one edit" of `zip-old.js` takes two
    lines: :394 takes `now`, and :398 (`const now = new Date();`) becomes a comment. `storage-old.js`
    also holds the custom app's mode functions (etoro2csv `src/app.js`:14-19), so the storage
    comparison covers both sets of mode ids.
53. **`tools/provenance.js`.** The commands are `check` (the CI command; `verify`, §1's name, is the
    same) and `rederive [--old-root <dir>] [--only <path>] [--write]`.
    - Without an old repository, `check` verifies more than the sha256: the pin structure, that each
      `from.head` is the frozen `legacyHead` of its `legacyRepo`, the sentinels, that every edited
      and literal line stands where its pin says, and that a verbatim copy has its blob's sha256.
    - `rederive --write` is how a pinned file is created or changed. It writes only inside this
      repository, never into an old one, and reports the sha256 to record in the pin.
    - Git runs as in `baseline.js`: plumbing only, optional locks off, inherited `GIT_*` dropped,
      discovery stopped at the repository's parent. The console shows no machine path.
    - API for WP10: `check`, `rederive`, `pinnedFiles` (the privacy lint's pinned-file exemption),
      `sentinelProblems` (the pin-sentinel lint), `loadPins`, `validatePins` and `derive`.
54. **`core/storage.js` `saveConfig(null, …)` writes nothing.** This mirrors `loadConfig`'s
    `key == null` guard; §3.7 gives the guard for `loadConfig` only. Without it, an app with no
    configurator could store a key named `null`, against "no other key is ever written". No old
    page has a null config key, so no old behaviour changes. The four functions read the global
    `localStorage` inside their `try`, as the old pages did, so a throwing getter also gives the
    defaults.
55. **Differential test details** (`test/unit/differential.test.js`).
    - Export cases have 1-3 accounts and every §6.4 axis. Ranges include reversed pairs passed as
      is and pairs swapped as the page's `range()` does. A malformed value appears in about 2% of the
      cases. Calls are compared one by one, a thrown error by type and message, and the inputs are
      compared after the calls.
    - Additions to §6.4, each cheap:
      - a fourth export run gives A the truthy `partial`/`startDate` inputs and requires every
        difference to be one of the two that make C a superset. This re-proves the superset
        argument mechanically;
      - L1 against L3 on clouds without near-duplicates, where they must be equal (the premise of
        D2);
      - the zip run sets `TZ` per case from ten zones (whole, half and quarter-hour offsets,
        daylight saving in both hemispheres), so a UTC getter in place of a local one is caught;
      - storage is compared only for providers with `legacyRepo`, since new providers have no old
        page. Statement apps use the `statementApp` oracle and the custom app `customApp`. The values
        are those of §6.4 plus the mode ids, case and space variants, prototype-key names and junk.
        Storage is normal, throwing on read, throwing on write, throwing on access to
        `localStorage`, undefined or missing. The storage call log and the final contents are
        compared too.
    - Generator counters have lower bounds of about half of what the seeds give, so a degenerate
      generator fails.
    - A mutation check on scratch copies of the four core modules (never on the repository) caught
      18 of 18 mutations: the formula guard, the QIF notes line, adjustment order, `startDate`,
      the number format, the conversion test, the gap-list cap, the CSV notes cell, three layout
      thresholds, four DOS time and date getters or flags, and three storage fallbacks.
56. **`testlib.test.js`'s core checks are unconditional** (decision 32). The `core/zip.js` comparison
    and the `core/xlsx.js` round trip no longer test whether the files exist, so a missing core
    module fails instead of skipping.
57. **`test/unit/provenance.test.js` is a new unit file** (not in the §6.4 list), like decision 48.
    The real pin list must check clean. Where the old repositories exist, it must also re-derive
    byte for byte; otherwise that test is skipped, as G2 is. The tool itself is tested on a synthetic
    tree whose old repository is a temporary git repository: writing, checking, re-deriving, each
    failure message, the `--write` guard, the CLI exit codes, and no machine path in the output.
    `zip.test.js` takes the golden environments' zones and frozen clock from `test/lib/browser.js`.

Decisions of the core runtime modules, part b (WP4b: escape, shell, the readers, files,
assemble):

58. **The readers find their dependencies as the old pages did.** The PDF reader uses the global
    `pdfjsLib` only when `init` or `read` runs, never while it loads, so it loads without pdf.js
    (contract check C10b's sandbox has no vendor piece). The XLSX reader takes `self.Xlsx` when it
    loads, which piece 5 of the script plan inlines just before it; in Node it requires
    `core/xlsx.js`. All five modules touch nothing while they load.
59. **Chrome's `file.text()` decodes a UTF-16 byte order mark; Node's `Blob.text()` does not.**
    `readers.test.js` found this in the pinned Chrome 143.
    - Chrome: bytes that start with FF FE (or FE FF) are decoded as UTF-16LE (or BE) by
      `File.text()` and by `FileReader.readAsText`.
    - Node: `Blob.text()` and every `TextDecoder` decode them as UTF-8, starting with two U+FFFD.
    - Every other input decodes identically: the test cases, plus 400 seeded random byte strings
      with UTF-8 BOMs and broken sequences.
    - The pages are not affected, because the old and the new page both call `file.text()` in
      Chrome. Only the Node CSV twin of `extract.js` (design §6.11) differs, and only for such
      files. WP6 should read CSVs in Chrome (the default), or refuse the Node twin for a file that
      starts with FF FE or FE FF.
60. **`wireInput` gives each callback what the old listener gave its code.**
    - `onRange` is registered directly on `#from` and `#to`, as `render` was, so it gets the
      change event.
    - `onClear()` is called with no argument from an arrow listener, as the old `#clear` body ran.
    - `onMode` gets the clicked button's mode, and `onFiles` the `FileList`, from both the picker
      and the drop.
    - The registration order is the old one.
61. **`html` accepts only a real template-tag call.** Besides the Html identity rule (design §3.2),
    `html` checks that its first argument is a frozen array with a frozen `raw` array of the right
    length. Every tagged template passes that, and no data can produce it, so `html(someArray)`
    cannot turn a runtime string into markup. An invalid escape sequence in the template text (its
    cooked string is undefined) throws. An array that contains itself, or has a hole, renders as
    data. The module object is frozen.
62. **`StatementFiles.create` checks its context.**
    - It requires `result`, `mode` and `range` to be functions, a `P` object, the four naming
      strings, and `kindModel` to be one of the two values. `zipName` accepts only `"csv"` or
      `"combined"`. Anything else throws a TypeError, so a wiring mistake fails at page load (smoke)
      instead of producing misnamed files.
    - `allFiles()` returns exactly `[accountsFile(), …fileFor(…)]`, as design §3.9 states. The zip
      records of `downloads()` copy the entries as `{name, text}`, so the Accounts file's `count` is
      not part of a Download record.
63. **`StatementAssemble.build`: the details design §3.10 left open.**
    - The key of `raw` is the portfolio id; an entry's own `id` field is not read.
    - Missing `cash`, `trades` or `months` count as empty, and a missing `fx` as null. A portfolio
      with no months, which step 1 keeps only when it has cash or trades, gets null
      `firstMonth`/`lastMonth`; `checkResult` reports that.
    - Portfolio ids, account names and config keys are looked up as own properties only. So
      `__proto__`, `constructor` and the like are ordinary ids and names; the old accumulators
      throw on such a rename.
    - Every account has `downloadOnly` (true or false), as in the accumulator it comes from.
    - The stripped trades go to `skippedRows` after the provider's rows: per account in account
      order, each account's in date order.
    - A `months` entry without a string `month` is skipped. `downloads` is in the result only when
      it is given, and `statements` defaults to 0. `order` is called with the raw portfolio objects.
    - An unknown `cashLikeTrades` or a non-function `order` throws a TypeError. Both come from
      provider code, never from user data.
    - `assemble.test.js` embeds the old accumulator (posb2csv `src/parser.js`:474-507, and :510's
      portfolio rows) verbatim. With the old repositories present, it checks that exactly one old
      parser contains those lines. On 2000 seeded inputs, `build` equals it wherever the two must
      agree: string config fields, labels whose locale order is their code-point order, no trades,
      `fx` null.
64. **Download all's DOM scan and `allFiles()` differ only for names an attribute cannot carry.**
    - The old scan reads each `data-account` back through the HTML parser. In the pinned Chrome,
      over all 65,536 UTF-16 code units, only two change: CR becomes LF (CRLF too) and NUL becomes
      U+FFFD.
    - For an account name with CR or NUL, the old `fileFor` throws on the changed name, so the
      page offers no download, while `allFiles()` names the file.
    - Only hand-edited storage can produce such a name: an `<input>` strips line breaks, and the
      parsers' names come from PDF text. Such names are outside SX1's payloads, and D3 should note
      this boundary.
    - Everything else agrees on synthetic data (decision 65).
    - Amended by decision 176: the new page keeps this behaviour as a reviewed exception, SX1's
      claim is narrowed to names an attribute gives back, and the fix is scheduled with D3.
65. **`files.test.js` runs the old statement apps in a sandbox.**
    - Each old `src/app.js` runs unmodified in a `vm` context. It gets a stub DOM, plus stubs for
      `localStorage`, `pdfjsLib` (every file is a document with no pages), `URL.createObjectURL`
      and the anchor click.
    - Its parser global is the old parser module, with `parseStatements` returning the synthetic
      result. `P` is composed as that app does it. The global's name is read from the app's own
      `const P = …` line, so no test names a provider.
    - The stub `#cards` parses the card markup the old render writes (titles and `button.dl`
      attributes, with entities decoded as the HTML parser does). The driver clicks every card
      button, then `#accounts`, `#combined` and `#zip`.
    - Every download, Download all's DOM scan included, must equal `downloads()` with the frozen
      naming and kind model. A second test checks the replay path, `loadNode(id, {parser: "old"})`,
      in the same way, on data without `partial` or `startDate`, where the export variants agree.
    - Both tests are skipped without the old repositories (CI). Each is wrapped in the
      baseline's before/after manifests.

Decisions of the parser and layout copies (WP5: the 8 `providers/<id>/parser.js`, the maribank and
chocolate `layout.js`, and their pins):

66. **The ten pins hold whole lines.** WP5 appended ten whole-file entries to
    `test/contract/provenance.js`, after the `test/legacy/` ones and in the order of design §4.3's
    table. §4.3 names only the changed paths; each pin's `old` and `new` are the complete lines:
    maribank2csv :7 and chocolate2csv :10 change `./export.js` only; moomoo2csv :9, posb2csv :11,
    maybank2csv :10 and versa2csv :13 change both paths; etoro2csv :11 changes its one path; and
    stashaway2csv :579 is the comment. The two layout copies have `edits: []`. The posb entry
    declares the sentinel `{line: 243, contains: "\uFEFF"}`, written as the six-character escape:
    the pin list holds no literal U+FEFF (byte check). Each copy's sha256 was computed first with
    `derive()` from its blob, the complete pins were appended, and then
    `rederive --write --only <path>...` wrote the ten files and printed the same sha256s, so the
    shared pin list never held a placeholder sha256 while other packages ran `check`.
67. **C10a waits for `provider.js`, so WP5 checked the copies by hand.**
    `loadNode(id, {parser: "new"})` reads `provider.js`, so on this tree it stops with "no
    provider.js" for all 8. The real C10a and C10b run from M5, when WP9 and WP7b write the
    descriptors; eToro's Node branch also needs WP7a's `test.js`. Until then a scratch check (not
    tracked) covered the same ground:
    - Node branch: each copy, required on its own, loads exactly the modules its edited line names
      (`module.children`), and `P` composed over core export has `parseStatements` (eToro:
      `parseWorkbook`).
    - Browser branch: in a `vm` context with `self = window = context` and no `module`, each
      parser's global (StashParser, MariParser, ChocParser, MooParser, EtoroParser, PosbParser,
      MaybankParser, AhamParser) is undefined before its piece and defined right after it, with
      the Node branch's export names.
    - Through `test/lib/load-provider.js`: on a scratch tree outside the repository, made of
      symlinks to this repository's files plus synthetic descriptors with the §4.2 values,
      `loadNode(id, {root, parser: "new"})` works for the 7 statement apps and `loadPage` (plan
      pieces 3-12) for all 8. eToro's descriptor there lists only `parser.js` in `scripts`,
      because `files.js` is WP7a's.
    - `validate` with each copy's real exports and those descriptors finds no C08, C08b or C09
      problem: stashaway's 11 overrides are closed, eToro's one override is `openingBalance`, and
      `itemsToPageText` is an exported function.
68. **What the lints will find in the copies** (for WP10; every page that inlines a copy inherits
    it):
    - Rule 3 (statement-like numbers) matches exactly the comment lines design §4.3 lists: posb
      :69, :151, :296, :308 and maybank :132. `pinnedFiles()` lists all ten copies as pinned and
      intact, so the pinned-file exemption applies.
    - No copy has a home path, an e-mail address besides the SPDX line, a denylist entry or an
      app name. The old QIF expansion is gone from `providers/` (stashaway's edit). It remains
      only in the pin list's `old` texts, which the page-and-doc rule of the generic lint does
      not scan.
    - No banned API and no argument-less `new Date()`. Every parser calls `localeCompare` with
      one argument (on 2 to 14 lines each). §6.3 allows this because all 8 are legacy
      providers, so the sinks lint has to take "legacy" from `frozen.legacyRepo`.

Decisions of the custom app's files and hooks (WP7a: `providers/etoro/files.js` and `test.js`):

69. **`EtoroFiles` records have the Download shape of design §2.12.**
    - The zip record lists its entries as `{name, text}`, as `StatementFiles` does (decision 62),
      not as the `out` objects with their `kind`, `label` and `count`. The bytes are the same:
      the zip writer reads only `name` and `text`.
    - A disabled `#zip` is `{trigger: "zip", account: null, kind: null, disabled: true}`. That is
      design §3.13's `{trigger: "zip", disabled: true}` in the §2.12 type: the capture record
      without `card`.
    - Card records have `account: null`. The old card's buttons carry only `data-kind`, so the
      capture records `null` for `data-account`.
    - `create` throws a TypeError unless `P` is an object, `result` and `range` are functions and
      `naming.slug` is a string, as `StatementFiles.create` does. Only the slug is read, so the
      frozen runtime's `{slug}` and a descriptor's resolved naming give the same downloads.
70. **`test.js` mirrors what `recompute()` leaves in `state.result`.**
    - `parse` returns null when there is no statement, or it has no workbook: nothing loaded,
      after Clear, or after a file the reader failed on. Design §3.13's one-liner would throw on
      `statements[0]` there, and replay keeps the previous step's result when `parse` throws,
      while the page has none. `parse` takes `statements[0]`, because the page reads one file
      and the page driver records a single-file picker's chosen file as the whole add order.
    - `downloads` treats an `{error}` result as null, as the page moves the error to the status
      and shows no results. A direct call therefore gives `[]`, like the ProviderHandle. The
      range is `{from: ctx.from, to: ctx.to}`, the values of design §3.13's `range: () => ctx`.
    - `reconcile` checks the result it is given; the harness calls it once per mode (H6). An
      `{error}` result gives one problem line, `<mode>: <error>`, as the old test counted it; a
      null result gives none. Lines name dates and amounts, like `test/lib/reconcile.js`'s.
    - `expectedHeader` keys on the card's kind (`transactions`, `balances`, `accounts`). It is
      null for the QIF (served as `text/csv` too), the zip, a disabled trigger and any other
      kind.
71. **`test/unit/etoro-files.test.js` is a new unit file** (not in the design §6.4 list), like
    decisions 48 and 57.
    - It finds the provider by its folder id, which the generic lint does not match. It holds no
      provider or old repository name: the account name comes from the parser's result, the
      slug and the old repository from `frozen.js`.
    - Its synthetic workbooks (written with `mkxlsx`, read back with `core/xlsx.js`) also reach
      states a real statement need not: a step with anchors but no entries in range, and one
      with `#zip` disabled. So this test covers those two rules whatever the stored eToro
      goldens hold.
    - Two tests need the old repository and are skipped without it, as in `files.test.js`: the
      moved-lines check, and the old page in a `vm` sandbox. The sandbox runs the old
      `src/app.js` unmodified with a stub DOM, the old reader, export layer and parser
      (read-only `require`), and a `Date` fixed at the golden clock, so its zips are compared
      byte for byte with `zipParts(files, now)`. Both run between the baseline's before and
      after manifests, and first check the old sources against their blobs with `checkGit`.

Decisions of the extraction and replay (WP6: `test/pages/extract.template.html`,
`test/lib/extract.js`, `test/lib/replay.js`, the golden `extract` and `replay` commands):

72. **The extraction page.** `build/page.js` `fill` fills two tokens of the template: `csp` and
    `scripts`. `scripts` holds plan pieces 1-6 (pdf.js, its worker as `text/plain`, core escape
    and shell, the three readers, `core/xlsx.js`), each read with `build/scripts.js` `readPiece`
    (its guards apply), plus `test/lib/canon.js` wrapped as one more piece. The page's own
    script runs the app's reader order and calls `StatementPdf.init()` at load, as the apps do.
    - The policy is the legacy PDF one, which the old pages have and the new ones keep until
      M10. Reading does not depend on the mode, as long as `blob:` scripts may run.
    - The page opens on `file://`, in a context from `browser.newContext` (E0, capture
      installed, clock fixed), so pdf.js takes the pages' fallback-worker path (decision 30).
    - Files arrive through `setInputFiles` on the page's `#picker`, 4 per `page.evaluate`, so
      names, sizes and MIME types are Chrome's.
    - Statements come back as canonical text, so -0, NaN, the infinities and lone surrogates
      survive the protocol.
    - The page reports the reader it chose. A difference from Node's prediction (`kindFor`, by
      extension) is an error.
73. **The extraction cache.** Each entry is
    `<private-dir>/extract/cache/<page key>/<sha256 of the bytes>.<reader>.canon`, holding
    `canon({kind, statement})` or `canon({kind, error})`.
    - The page key is the sha256 of the built page and the pinned Chrome version (16 hex digits
      in the path), so a change to a reader, pdf.js or the extraction script reads again.
    - A reader failure is deterministic and cached; a harness failure is not.
    - The statement is cached before any page transform, and its `id` is replaced by the file
      name at use. One cache therefore serves both parsers and renamed copies.
    - Entries are written whole (temporary file, then rename), 0600 in 0700 folders.
    - Extraction runs in E0 only: the cache key has no environment, and G3b's E1 and E2 runs
      replay identically on the same entries.
    - `extract(…, {offline: true})` never starts Chrome and throws on a miss. The replay
      children run so; the parent fills the cache first.
74. **Without a descriptor, the reading facts come from the old page.** With the old parser
    (and with `--frozen-runtime`, decision 80), D is null, so `legacyReading` reads two old
    files:
    - the declared inputs: the old template's `#picker` accept tokens, mapped through the
      build's own accept table;
    - the page transform, from the one page push of its `readStatement`:
      `pages.push(P.<name>(content.items.map(` gives `<name>`, and `pages.push((content.items.map(`
      gives none. Anything else is an error. One old page has a transform.
    - Both files, every `src/*.js` and `build.py` are checked against their blobs at legacyHead
      before `extract` or `replay` reads them (§6.7.2 step 3). The inputs must equal the
      goldens' recorded picker facts, as sets.
    - The `extract` command needs no handle for the old side. That let it fill the cache for the
      custom app before that app's hooks existed.
75. **Replay's step rules.** `replayStep` follows what the pages leave in `state.result`:
    - Paths without a statement are dropped (a failed or ignored file never enters the page's
      map). With no statement left, the result is null and `parse` is not called (the pages
      parse only a non-empty map; the custom app has no workbook then).
    - If `parse` throws, the previous step's result stays, and the step records `threw`.
    - The config is the step's stored string under the handle's `R.storage.configKey`, read
      with `loadConfig` semantics. The mode is the captured "on" button, and the range the
      captured selects, swapped by the handle.
    - Statements, configs and results are deep-frozen. Every old module runs in strict mode, so
      a parser or writer that changed them would throw instead of depending on how long the
      page keeps its objects.
    - Freezing is what makes the memo exact: results are re-used by (paths, config string,
      mode), 32 per child, which equals parsing at the page's own recompute points. The mode is
      part of the key because a custom app parses per mode.
    - `act` is kept for the reports; no rule depends on it.
76. **Records.** `toRecords` builds capture records without `card`:
    - texts as UTF-8 bytes (a lone surrogate becomes U+FFFD, as in a Blob);
    - file lists as `core/zip.js` `zipParts(files, now)`, with `now` the golden clock in the
      child's time zone;
    - every zip, by type or by its first four bytes (as `capture.js`), unpacked by
      `test/lib/unzip.js`: entries, CRC check, and the page's `zipError` text.

    In the pinned Chrome, `capture.take()` gives exactly these records for the same downloads
    in E0 and E1 (`replay.test.js`). Records are compared with `compare.js`'s `compareRecords`
    (decision 46). `card` is UI text, which replay does not have, so it is never compared.
77. **One child process per job, in the scenario's environment.**
    - A job holds whole pages, up to 1500 steps. It is forked from `test/lib/replay.js` with no
      inherited `execArgv` (so `--test` stays out), advanced serialization, `TZ` and `LC_ALL`
      (`sv_SE.UTF-8` for `sv-SE`), and without `NODE_TEST_CONTEXT`. The child's stdout is
      dropped; its stderr goes only to the private report.
    - The child fails unless `TZ` and `LC_ALL` are the environment's and Node resolves exactly
      that time zone. It skips the job, with a warning, only when `new Intl.Collator()` resolves
      another locale. Node 22.23.1 (ICU 78.2, CLDR 48.0, tz 2026a) resolves all three
      environments.
    - `--jobs` children run at a time (the capture default, `min(4, cores/2)`).
78. **ICU drift, made checkable.** For each provider environment with mismatches, `icuCheck`
    replays the mismatching pages again while recording the built-ins whose results come from
    ICU data or the time zone:
    - `localeCompare`, the locale and non-ASCII case mappings, `normalize` outside ASCII,
      `toLocale*String`, `Intl.Collator`/`NumberFormat`/`DateTimeFormat` and the local `Date`
      getters.

    Then:
    - Chrome answers the same calls in a context with the environment's locale and time zone.
    - When some answers differ from Node's, the pages are replayed with Chrome's answers, asking
      again for calls not seen before, for at most 3 rounds.
    - A mismatch whose step is identical in that converged replay is ICU drift. Every other one
      is real. So is every mismatch when nothing differs, when the rounds do not converge, or
      when Chrome's answers break a step Node replayed identically.
    - Real mismatches, failed jobs and throw problems (decision 79) fail the command. ICU drift
      and skipped environments are reported but do not fail it: the browser stays the
      authority.
79. **Replay may throw only where the old page threw.** The first step of each run of
    consecutive throwing steps must be a golden step marked `threw` (a stuck load, or a new
    uncaught error). Otherwise the step gets a `threw` mismatch, even when its downloads agree.
    On the full goldens, replay throws on exactly one step per statement app: the C-seed-badname
    load.
80. **`test/lib/load-provider.js`: `runtime: "frozen"`.** `loadNode(id, {parser: "new", runtime:
    "frozen"})` loads the provider's `parser.js` (the default `parserScript`) with the frozen
    runtime, and D is null. The option is accepted with `parser: "new"` only. It exists only for
    `replay --parser new --frozen-runtime`, an early signal before any `provider.js` exists, and
    reports mark such runs as not gate runs. G4 uses the descriptor. This is the one change to
    the loader; its other paths are untouched.
81. **Golden checks before replay.** `replay` refuses goldens recorded with other versions than
    the pinned playwright-core and Chrome (as `compare` does). It rewrites the synthetic files,
    which must then have the sha256 the goldens recorded. Mismatches go to
    `<private-dir>/diff/<run>/<scenario>/mismatches.json`, with the replayed bytes of up to 20
    mismatching records per child; the console shows ids and fields only.
82. **Two new unit files,** `test/unit/replay.test.js` and `test/unit/extract.test.js` (not in
    the design §6.4 list, like decisions 48 and 57).
    - They use synthetic data only: a throwaway provider tree (`frozen.js`, a synthetic old
      parser over CSV statements, the real core through a symlink), with `S2C_PRIVATE` pointing
      at a temporary directory.
    - The child-process, ICU-oracle and Node-twin tests need neither Chrome nor the old
      repositories. Tests that need either are skipped without them.
    - `test/golden/run.js` exports `replayHelpers` (`goldenPaths`, `chunkPages`,
      `throwProblems`, `replayPages`) for them.

Decisions of the G3b gate run over all eight providers:

83. **The custom app's mutation checks run on a scratch copy, on the quick tier through the
    normal path.** When a replay has mismatches, `classifyIcu` replays every mismatching page
    with the ICU recorder installed, and `runJob` turns the memo off while it records. One parse
    of the custom app's workbook is slow, and a mutant that breaks every page therefore makes
    every E0 full-tier step parse again, once per recording or oracle round. A first full-tier
    attempt was still classifying when it was stopped.
    - So the mutants ran on the quick tier with the classification. On the full tier they ran
      with the classification turned off in the scratch copy's `test/golden/run.js` only (one
      line, behind an environment variable). The repository's files are unchanged.
    - A passing run never classifies, so gate runs are not affected.
    - For WP6/WP10: the recording runs could keep the memo. Each (paths, config, mode) key would
      still be parsed once and its calls recorded then; parsing it again only repeats calls
      already recorded, and with the oracle's answers it gives the same result.

Decisions of the stage B fixes (the findings of the stage B verification):

84. **The XLSX twin keeps to Chrome's DecompressionStream** (finding xlsx-node-twin-junk).
    - In the pinned Chrome, the production reader inflates with `DecompressionStream`
      (`deflate-raw`) through `new Response(stream).arrayBuffer()`. Every stream error rejects
      that read with `TypeError: Failed to fetch`: bytes after the end of the deflate stream,
      a second stream after the first, a stream cut short, an empty one, damaged data. Checked
      on 13 synthetic inputs.
    - `zlib.inflateRawSync` alone accepts the trailing bytes, and names its own errors
      (`unexpected end of file`, `invalid block type`), so the old twin also gave other failure
      texts than the page for a cut or damaged entry. Node's `DecompressionStream` accepts the
      trailing bytes too.
    - `test/lib/extract.js` `inflateRawNode` uses `zlib.inflateRawSync(data, {info: true})` and
      succeeds only when zlib ends the stream exactly at the end of the entry's data
      (`engine.bytesWritten` equals its length); otherwise it throws `TypeError("Failed to
      fetch")`. `readNode` (the twins) and `inflateRawNode` are exported.
    - `test/unit/readers.test.js` compares the twin with Chrome on the well-formed workbooks,
      on 8 kinds of damage and on 120 seeded random damages to one entry (40 read, 80 failed,
      every outcome equal). `test/unit/extract.test.js` compares `extract({readers: "node"})`
      with `extract({readers: "chrome"})` on damaged workbooks. `test/lib/mkxlsx.js`
      `renderXlsx` gained the option `entryBytes(name, stored)` to write such entries.
85. **Errors name a file by position and sha256 prefix; the console masks statement names**
    (finding privacy-filename-console).
    - `extract.js` errors read `extract: file <i> of <n> (sha256 <16 hex digits>) …` for the
      cache miss and the UTF-16 refusal (a `TwinRefusal`), never the file name.
    - `test/golden/run.js` notes every statement file and folder it meets (`listInputs`,
      `describeFile`, the statement folder, the goldens' recorded files and `goldenPaths`).
      `redact()` replaces each, whole, by `<private>` before it masks the remaining absolute
      paths. The old `redact()` masked a path only up to its first space, so a name with spaces
      showed in part. A folder's own name is not masked: statement folders are often named
      after the provider. Reports keep the full text.
86. **compare and replay fail an environment whose golden has pages with capture errors**
    (finding replay-skips-error-pages). Such a page keeps only the steps before its failure and
    neither command runs it. Both run the other pages, then print
    `FAILED: <n> of <m> golden pages had a capture error and were not run, so this golden is
    incomplete (capture again)`, record it under `incomplete` in the report and exit 1. The
    replay totals line shows the counts.
87. **Replay marks steps whose config storage cannot show as unmodelled** (finding
    replay-config-from-storage).
    - The old pages parse `state.config` and store `JSON.stringify(state.config)`. Seeded with
      `[]`, `loadConfig` gives an array; a configurator change adds a named property to it,
      which `JSON.stringify` drops, so storage keeps `[]` while the page parses the change
      (checked in the old reference app's handler and in Node). For an object, `null`, a
      primitive or bad JSON, storage stays exact: a primitive cannot take the change (the
      strict-mode handler throws before saving).
    - So in `test/lib/replay.js` `replayPage`, a configurator change other than the reset, on
      a stored config that is a JSON array, starts an unmodelled stretch that ends at the next
      reset. A step whose parse throws right after it is unmodelled too, because the page then
      keeps a result replay does not know. Unmodelled steps are not compared; `comparePage`
      counts them apart and counts only compared steps' records. The replay command fails the
      environment with their count.
    - The scenario generator never makes such steps. Seeded configs get no configurator change
      but the reset, and changes run on pages that start from empty storage.
      `test/unit/replay.test.js` checks this over every tier, with and without the S scenarios.
88. **The memo stays on while ICU calls are recorded or answered** (verifier problem; decision
    83's suggestion). A key parsed again would only repeat calls already recorded, and under
    the same answers it gives the same result. The downloads hook still runs on every step.
    `runJob` now reports `parses`, its memo misses, per job.
89. **On `file://`, Chrome can give a document a DOM storage area of its own** (finding
    testlib-parallel-flake). The cause is not late writes.
    - Scratch experiments in the pinned Chrome, at normal load, with three file:// tabs in one
      context (an observer, a writer, then a new reader): in 4 of 400 cases one document had a
      separate storage area, twice the writer and twice the new reader. Such a document started
      empty, never saw the other tabs' writes (polled for 2 s), its own writes reached no other
      document, and after a reload it was back on the shared area without them.
    - The two subtests' own logic, 300 times each: file:// gave 2 failures in 300 second tabs
      and 0 in 300 reloads; http://127.0.0.1 (`test/lib/serve.js`) gave 0 in 600 and, in a
      second experiment, 0 in 1,200 tabs, against 2 in 800 on file://.
    - Under load the rate rises: with the CPU fully loaded, 3 of 4 parallel `testlib.test.js`
      runs failed one of the two subtests. Waiting or polling cannot help, and running the
      files serially only lowers the rate.
    - So `testlib.test.js` runs the two subtests that need storage across documents (a reload,
      a second tab) on the synthetic page served over http://127.0.0.1, as the one-origin
      storage test (WP16) serves its pages. The other browser subtests use one document and
      stay on file://.
    - The goldens are not affected: each page instance is one context with one document, and
      storage is read from that document.
    - H12's "reload keeps all of them" (WP11) is affected. It must serve the page over http, or
      it fails about once in a few hundred reloads. The note is at `page-driver.js` `reload()`.
90. **Literal invisible characters in the tests are escapes now** (verifier problem):
    `test/unit/readers.test.js` (14), `test/unit/testlib.test.js` (6),
    `test/unit/escape.test.js` (1) and `test/lib/mkxlsx.js` (2, the noncharacters U+FFFE and
    U+FFFF), all inside string or regex literals, rewritten byte-level.
    - The writing tool turns a typed `\u` escape of such a character into the character itself
      (as in WP6), so every edited file was re-scanned. The only literal one left in the tree is
      the pinned sentinel U+FEFF of `providers/posb/parser.js`:243.
    - V8 counts a literal U+2028 as a line break, so `testlib.test.js` stack traces after its
      line 243 were one line off; they are right now.
91. **Verifier problems left as they are, with the reason:**
    - C15 in `test/contract/run.js`: that file is WP10's.
    - `test/unit/storage.test.js`: design §1 lists it, but §6.4 gives the storage tests to
      `differential.test.js`, which has them (G3a). No separate file is needed.
    - eToro's D20 rule and its disabled-`#zip` rule: `test/unit/etoro-files.test.js` covers them
      (G3b entry).
    - A disabled-record count the verifier found wrong in the "Quick and full goldens" entry:
      that entry no longer gives such counts (decision 214).
    - A sibling agent's scratch directory: synthetic data outside the repository; nothing to
      change here.
    - The `test/legacy/zip-old.js` header's "the same lines in all eight old apps": the 27 code
      lines are, the comment line before them is not in the custom app. It is a literal line of
      a pinned excerpt, so it changes only with its pin-list entry and a re-derivation, which is
      the pin list's owner's change. The derivation map above is accurate.

Decisions of the custom app's page (WP7b: `providers/etoro/{provider,app}.js`, `page.html` and
`fixtures/`):

92. **The custom app's `app.js` is derived line by line.**
    - A scratch script built it from the old `src/app.js` (first checked against its blob) by
      whole-line operations only, so every kept line is byte-identical. 117 of the 203 old
      lines stand in their order, 86 moved out (the ranges in the derivation map), and 30 lines
      are new: an 18-line derivation comment and 12 lines that replace old ones. A separate
      check confirms this from the two files (scratch; it caught 5 of 5 mutants).
    - The core helpers are bound under their old names where old :7 stood
      (`const { $, setBusy, fmtInt, fmtMoney, monthLabel, download } = self.StatementShell;` and
      `esc` from `self.StatementEscape`), so the renders keep their call sites. `P` is old :6
      verbatim, `window.` included.
    - `setMode`'s storage line :19 becomes `StatementStorage.saveMode(D.storage.modeKey, mode)`.
      Design §3.13 names only `loadMode`, but §2.11 has a custom app write storage only through
      `StatementStorage`, and `saveMode` is that line with the key as a parameter.
    - `F = EtoroFiles.create({P, result: () => state.result, range, naming: D.naming})` is made
      once, where `files()` stood. `range` is a hoisted function declaration, and the first
      call comes from `setMode` at start-up, after `F` exists. `files()` becomes `F.files()`,
      and the `#zip` name becomes `F.zipName()`, the same string from the frozen slug.
    - The input block becomes one `wireInput` call at its place, so the listeners keep the old
      order: `#cards` and `#zip`, then the input listeners, then `setMode(state.mode)`.
    - The renders keep `innerHTML` and the old `esc` calls (design §3.12, M5). With sinks
      enforced early, the sinks lint finds exactly the six old sinks (old :55, :99, :112, :114,
      :115, :127), which M8 replaces.
93. **`page.html` opens with two comment lines.** The build's slot parser drops leading lines
    that are whole HTML comments, and the partials use the same two lines. Decision 49's
    doctype form is for complete documents (the skeleton and the landing page); a `page.html`
    that started with a doctype would not parse. The slot texts were cut from the old
    template's lines by a scratch script (read only), with W1 on :147 only. `empty` is the old
    text, "No statement yet.", not the default.
94. **`provider.js` writes out the defaults that design §4.2 lists for the custom app:**
    `appScript`, `parserScript`, `storage` with `configKey: null`, `naming.slug` and
    `custom: {toolbar: [], config: false}`, so the app's shape reads from the file alone. The
    resolved runtime equals `frozen.js` in every key that file holds (C05): the storage keys,
    the three mode ids and the slug; `configKinds` and `configIdPattern` are null without a
    configurator. `summary` is a new generic line for the landing page.
95. **The fixtures.**
    - `statements.js` holds one synthetic workbook, rendered by `mkxlsx`. Beyond design §4.5's
      two sheets (`Account Summary` with `Currency`; `Account Activity` with its header, two
      deposits, a withdrawal and position rows) it has a `Holdings` and a `Closed Positions`
      sheet, so every mode has anchors: all four card files in the full range and in the first
      and the last month, no warnings, and `reconcile` clean in each mode. The marker is also a
      cell of two sheets, outside the rows the parser reads.
    - `hostile.js` is the same workbook with the Currency cell
      `<b onmouseover="window.__pwned=1">USD</b>` and its own file name. It is self-contained
      data without `require`, so a loader that refuses `require` reads it too; the two differ in
      exactly that cell (checked).
    - `expected.js`: the fixtures golden's tool (`test/smoke/fixtures-golden.js`, WP10) did not
      exist yet, so a scratch generator did what design §6.5 describes: the page from `dist/`
      in E0 with the frozen clock, the rendered workbook through the picker, then each mode in
      button order with the ranges full, first and last, and `clickAll()` after each. The module
      is `{marker, env, clock, inputs: [{name, size, sha256}], states: [{id: "<mode>/<range>",
      mode, from, to, records}]}`, the records as `capture.take()` returns them (`card`
      included). All 45 records equal the downloads hook's Node rebuild (`test.js` through
      `files.js`, zipped by `zipParts` at the frozen clock under `TZ=UTC`), and two generator
      runs wrote identical bytes. WP10 may read this format or rewrite the file with `--update`.
96. **The hostile workbook on the pure-move page.** The page still prints the currency raw on
    the card (old :98 and :103, now `app.js`:93 and :98), so the hostile file puts two `<b>`
    elements into `#cards`. The old page does exactly the same (compared side by side), and no
    handler runs without a hover. The injection smoke is enabled at M8, where WP13 renders
    these values through `html` and `setHtml`.

Decisions of the contract checks, lints and smoke (WP10: `test/contract/run.js`, `test/lint/`,
`test/smoke/pages.js`, `test/smoke/fixtures-golden.js` and their unit tests):

97. **The lints and C17/C18 look at what a commit of the tree would hold.** `test/lint/files.js`
    lists the tracked files plus the untracked ones that `.gitignore` does not exclude
    (`git ls-files --cached --others --exclude-standard`, plumbing only, optional locks off),
    so files not yet committed are checked too. An ignored statement lying in the tree is not
    listed, and once it is forced in, C18 reports it. A tree without git (a scratch copy) lists
    every file except `.git/`, `node_modules/` and `out/`.
98. **Three lint files besides design §6.3's four.** `files.js` is that shared list (not a lint),
    `sentinels.js` is §6.3's pin-sentinel rule, and `invisible.js` is the invisible-character
    rule of decisions 90 and 91. `node test/lint/run.js [--root] [--only] [--enforce-sinks]`
    runs headers, privacy, generic, sinks, sentinels and invisible.
99. **SPDX header forms (C17).**
    - `.js`, `.cjs`, `.mjs`: `//` lines. `.yml`, `.yaml`, `.sh`, `.py` and `.gitignore`,
      `.gitattributes`, `.editorconfig`: `#` lines. A `#!` line may come first in both.
    - `.css`, `.html`, `.md`: two one-line comments, or a block comment opened alone on the first
      line whose next two lines are the SPDX lines. An `.html` file may start with
      `<!doctype html>` (decision 49).
    - A file of any other type is reported, so a new type gets a rule rather than a silent pass.
    - Exempt: `vendor/**`, `dist/**`, `LICENSE`, `NOTICE` and the three package files.
100. **Privacy lint details.**
     - Denylist lines match as case-insensitive substrings and app-list names as whole words,
       case-sensitively (decision 6). A finding names a list entry by its number and never
       quotes what matched. The patterns are built from escapes, so the lint files hold no
       literal match (unit-tested).
     - Exactly the copyright string is blanked before the e-mail and denylist rules. No other
       exemption applies to the e-mail rule, so a synthetic address at a reserved domain fails
       too: `test/unit/replay.test.js`:688 (WP6's) is reported, not fixed.
     - A binary or non-UTF-8 file outside `vendor/` is reported (rule `text`).
     - The denylist is read only when it exists (`$S2C_DENYLIST`, else `<config-dir>`), so CI has
       no denylist rule.
101. **Generic lint scope and sources.** The provider-name rule also covers `.github/**`, since
     design §6.10 says no provider is named in the workflow. Names come from `provider.js` and
     `frozen.js` alike (`name`, `naming.brand`, the trimmed `naming.accountPrefix`, `legacyRepo`),
     so the rule works before a `provider.js` exists. The first word of the old QIF expansion is
     matched as a whole word in any case ("…ened" does not match).
102. **Sinks lint.** It scans code with comments, strings and regex literals blanked
     (`core/contract/callgraph.js` `blank`). Only its innerHTML rule is a report until M8
     (`REPORT_ONLY` in `test/lint/sinks.js`, which WP13 empties; `--enforce-sinks` applies it
     earlier); every other rule fails the run. Amended by decision 129, which replaced the
     lint-wide `ENFORCED = false` this decision first set.
     - The localeCompare rule flags fewer than two arguments, zero included.
     - "Legacy" means `frozen.legacyRepo` (decision 68).
     - The compose rule matches `Object.assign({}, <self|window|globalThis|root>.StatementExport`.
       It is allowed in `core/app/statement-app.js` and in each custom app's `appScript`.
     - Until M8 it reports the old renders' `innerHTML` assignments in the two app scripts, which
       M8 replaces (the WP10 gate-log entry has the counts).
103. **Invisible characters.**
     - Flagged: the controls other than tab and line feed (so a carriage return too), the
       format characters, the line and paragraph separators, every space but U+0020, the
       variation selectors and fillers, U+FFFD, private-use characters, noncharacters and
       surrogates.
     - Exempt: `vendor/**` (the pdf.js worker holds control characters) and `dist/**`.
     - The one allowance is a pin's declared sentinel text, on its line, in a pinned file that
       still matches its pin. That is the posb parser's U+FEFF; any other line or a changed file
       loses it.
104. **Contract runner details.**
     - `--tier` defaults to `node`.
     - C10-C14 run only for a descriptor with no C01-C09 problem, so one mistake is reported
       once. C16 runs whenever `page.html` exists.
     - `--provider` limits the per-provider checks, and C17/C18 to those folders. C04 still
       compares with every provider, and C15 runs in full.
     - Each run forgets the module cache of the checked tree's `providers/` and `core/` (not the
       checker's own `core/contract/`), so a changed tree is never checked against old copies.
     - C12 is strict without `legacyRepo`.
     - C13 is strict for every provider (design §6.2). Its errors entries must equal the spec's
       `expectErrors` both ways (minus reader failures, which must be listed there). Beyond §6.2,
       the Node and the page branch must give canon-equal results.
     - The size budget is in binary units: 2 MiB with pdf.js, 256 KiB without.
105. **C13 and the extraction.** C13 reads the rendered fixtures with this repository's production
     readers (`test/lib/extract.js`), whose cache lives in `<private-dir>/extract` (synthetic
     files only). Without Chrome, C13 reports `[C13] Chrome cannot be launched`: it fails, never
     skips.
106. **Pages smoke details.**
     - A published page is tested from `dist/` only when it equals a fresh in-memory build;
       otherwise it is reported as stale and not tested. Skeletons and unpublished providers
       get a temporary build.
     - Every check opens a fresh context (E0, frozen clock, empty storage).
     - On a single-file picker the fixtures load one file at a time, without the spec's
       `expectErrors`.
     - "Every button gives a non-empty download" also requires as many downloads as card
       buttons plus enabled toolbar buttons, and zips that unpack.
     - Page errors follow decision 43: only the pdf.js worker fallback is ignored.
107. **`fixtures/expected.js` keeps the layout WP7b chose** (decision 95): `marker`, `env`,
     `clock`, `inputs`, and `states` with `<mode>/<range>` ids. The range is `full`, `first`,
     `last`, or `none` without months.
     - On a scratch copy of the tree, `--update` rewrote the custom app's file with data lines
       byte-identical to WP7b's. Only the header comment differs, and the file in the
       repository was left as it is.
     - The writer escapes everything outside printable ASCII. `--update` writes only when the
       page equals the hook in every state.
     - The Node rebuild runs in the same process with `TZ=UTC` for the run, in the process's
       locale. Collation-sensitive synthetic data would show as a mismatch, never as a false
       pass.
108. **The synthetic tree.** `test/unit/synthetic-tree.js` (a helper) and
     `test/unit/contract.test.js` and `test/unit/lint.test.js` (new unit files, like decisions
     48, 57, 71 and 82) test the tools.
     - The tree: this repository's core modules, page files and `vendor/`, byte-copied; the
       real statement app, byte-copied too since decision 131 (first a stub built on
       `StatementFiles` and `setHtml`); and four synthetic providers (CSV, PDF, custom xlsx,
       skeleton).
     - It builds with `build --root`, and every check, lint, smoke and fixtures golden passes
       on it. Each test then changes one thing in a fresh copy to see one check fail.
     - WP3's stub tree cannot be the green tree: its stub parsers give no errors entry for
       garbage (C11), and its stub app renders nothing (smoke).
109. **`package.json` is unchanged.** The scripts WP1 wrote (`contract`, `contract-browser`,
     `lint`, `smoke` = pages and fixtures golden) fit the CLIs as they are.

Decisions of the statement app and the reference provider (WP8 + WP9a:
`core/app/statement-app.js`, `test/unit/constants.test.js`, `providers/versa/{provider.js,page.html}`):

110. **`core/app/statement-app.js` is the reference app moved, line for line where it can be.**
     - It was written from the reference app's `src/app.js` blob at legacyHead. Of its 414
       non-blank lines, 204 stand verbatim in their order and 2 more verbatim inside the
       diagnostics section functions, 167 moved to the core (the derivation map), 39 are the
       switch points of design §3.12, rewritten in place (decision 111), and 2 comments were
       dropped (counts corrected by decision 126). A scratch check lists these sets from the two
       files; every template literal and `esc` call outside the switch points is byte-identical,
       indentation included, so the strings assigned to `innerHTML` are the old ones.
     - The moved functions keep their old names, so the bodies around them stay verbatim: the
       shell helpers and `esc` are bound where :7 stood; `F = StatementFiles.create(…)` is made
       once and its `modeOf`, `earliest`, `exportsFor`, `fileFor`, `accountsFile` and
       `combinedFiles` are bound right after it; `saveConfig` is a one-line constant over
       `StatementStorage.saveConfig`. `F` needs `range`, so `range` stands just before it; both
       are constants, first used by `setMode` at start-up.
     - The listeners are registered in the old order: the configurator (:275, :289), the
       downloads (:365-389), then the input listeners through one `wireInput` call where
       :420-431 stood, then `setMode(state.mode)` (:439). `#zip` keeps the DOM scan of
       `#cards button.dl`; the zip names come from `F.zipName`.
     - The module globals are read from `self` when the app runs, after plan piece 12b, so the G1b
       canaries' wrapped `StatementExport` and `StatementZip` take effect.
     - No `parseError` field yet: design §3.12's sketch shows the M9 state, which WP14 adds with
       the try/catch. WP14 added both (decision 165).
111. **How the switches reproduce the seven old apps.**
     - `bank = U.kindModel === "standard" && a.kind === "bank"` picks the bank stats and note;
       `a.downloadOnly` then picks "Months" and `notes.bankDownloadOnly` (the PDF + CSV app's
       superset). `kindLabel(kind)` gives the tag and the "Auto (…)" label: `KIND_LABEL[kind]`,
       or under `investment-cash` `KIND_LABEL.investment` when `kind === "investment"` and
       `KIND_LABEL.cash` otherwise, which are the old literals.
     - `U.status` has three branches with the three old status lines; the first-openings noun is
       "download" without statements only under `statements+downloads`; the openings currency is
       `r.baseCurrency` under `openingsCurrency: "base"`.
     - The diagnostics sections are template functions, rendered in the order `U.diagnostics`
       lists them; each returns its two old template lines with their line break and
       indentation. Reconciled, gaps and late are computed before the skipped rows, as the old
       apps did; closed is read inside its section, as in the PDF + CSV app. A section that is
       not listed computes nothing, so the gap scan runs only with `gaps`.
     - The supersets rest on what the pinned parsers return (their return statements checked):
       only the PDF + CSV parser sets `downloadOnly`; no gen1 parser returns `partialMonths`; the
       investment-cash parser returns no `warnings`, and the app does not read them under
       `extraWarnings: "unmapped"`.
112. **The reference provider.** `provider.js` sets what design §4.2's row lists:
     `uses: ["layout"]` (the parser's browser branch reads `StatementLayout`), the old storage
     keys, `naming: {brand, slug}` (the prefix and group noun are the defaults), the five skip
     labels of :321-327 and `notes.other` and `notes.tradelog` from :219-220; everything else is a
     default. The resolved runtime equals `frozen.js` in every key it holds (C05). `summary` is a
     new generic line for the landing page. `page.html` was cut from the template lines of
     design §4.4 by a scratch script (read only), byte for byte, with W1 once (:156); the help
     items are indented two spaces (the build re-indents them), and the file opens with the two
     comment lines of decision 93.
113. **`test/unit/constants.test.js` checks a little more than design §6.4's two items.** Besides
     the literal constants (every `const NAME = …;` of the app whose name is a contract constant,
     evaluated with no globals; `KIND_LABEL` must be one) and `FROZEN_SCHEMA` against every
     `frozen.js` (keys, storage and naming keys, `legacyDom` keys, `kindModel`, `configKinds`,
     statement-app mode values, `checkFrozen` clean, and exactly 8 with `legacyRepo`), it checks
     that the configurator's Type select offers exactly `CONFIG_KINDS` labelled as `KIND_LABEL`,
     that the app reads exactly the `DEFAULT_UI` keys (with `notes` and `text`, each one at least
     once), that every `D.` field it reads is a runtime field, and that its diagnostics sections
     are the allowed values. Mutations of a scratch copy of the app (a changed label, an unread
     or an unknown ui key, `bank` offered, a renamed section) each fail it (5 of 5).
114. **The switches were checked for all seven apps before WP9 starts (scratch, never the
     repository).**
     - A differential in Node: each old `src/app.js` with its own layout, export and parser
       scripts (in its `build.py` order) against the new plan's pieces 3-13, in a vm with the same
       recording stub DOM, with the draft descriptors of design §4.2 for the six other apps. Only
       `parseStatements` is a synthetic stub, shared by both sides; its results are limited to
       what each old parser can return (no `partial` or `startDate` for the export-A apps,
       `downloadOnly` only for the PDF + CSV app, no `partialMonths` for the gen1 apps) and carry
       hostile names, currencies and kinds; storage is seeded with junk, hand-edited kinds,
       cycles and a non-string name. Every DOM write, storage access, listener registration,
       pdf.js call and download (bytes hashed) is logged, and the two logs must be identical.
     - The same drafts on real data: a scratch tree outside the repository (symlinks to `core/`,
       `vendor/` and the pinned copies, page.html cut from the old templates per design §4.4),
       built with `--root` into `<private-dir>` and compared with the stored goldens.
115. **`compare --page dist` checks the whole tree.** `test/golden/run.js` runs a full
     `build --check` before comparing `dist/`, which fails while other packages' pages are missing
     or stale. WP8 ran `build --check --only versa`, then `compare --page <the absolute path of
     dist>`: that skips the whole-tree check and reads the same `dist/versa/index.html`. Every
     `build --only <id>` also rewrites `dist/index.html`, the landing page of every published
     provider.

Decisions of the statement providers, group A (WP9: `providers/{maybank,posb,moomoo}/{provider.js,page.html}`):

116. **The descriptors hold design §4.2's values, and their texts were copied, not typed.**
     maybank's `provider.js` is §4.2's descriptor verbatim, `summary` included; posb's and
     moomoo's follow their §4.2 rows, with a new generic `summary` line each (as decision 112).
     All three set `uses: ["layout"]`, because each parser's browser branch reads
     `StatementLayout`.
     - A scratch script wrote the ui texts from each old `src/app.js` blob at legacyHead (equal
       to the working-tree file): every skip-label entry is the old `LABELS` line byte for byte,
       in the old key order, and posb's `text.gapWarning` and `text.partialWarning` are the
       string literals of its :304 and :306.
     - Everything else is a default, and the defaults are these apps' own lines: the card notes
       (maybank and moomoo :218-221; posb :220-223, the download-only bank note included), the
       bank months label (posb :209), maybank's busy noun, status, gen2 warnings and diagnostics
       sections, and the skipped-row owner of all three.
     - The resolved runtime equals `frozen.js` in every key it holds (C05), and equals the
       runtime of decision 114's scratch drafts key for key, so WP8's differential and its
       real-data runs of these three apps were made with these runtime objects.
117. **`page.html` is cut from the template blob, and five slots stay out.** A scratch script cut
     the slots of design §4.4 from each `src/index.template.html` blob at legacyHead (equal to the
     working-tree file), byte for byte, with W1 once (maybank :156, posb :157, moomoo :156). The
     help items are indented two spaces and the file opens with the two comment lines of decision
     93. `title`, `empty`, `config-summary`, `accounts-title` and `combined-title` are not
     written: their defaults are the old texts.
118. **posb lists its inputs in the old picker's order, `["pdf", "csv"]`.** The order only builds
     the `accept` string, which then equals the old `application/pdf,.pdf,text/csv,.csv`. Reading
     uses the app's fixed csv → pdf order (design §2.7), as old :49-51 and :68 did.
119. **moomoo keeps exactly its three skip labels.** `ui.skipLabels` replaces the four defaults as
     a whole, so a "trade without qty/price" row would show its category, as on the old page
     (:314-318 have no label for it). `legacy: {preset: "gen1", hideModeWithoutInvestments: false}`
     gives the rest of its variant: the busy noun "statement" (:68, :78), the month count (:294),
     the gen1 gap warning (:296-298), the first openings in `r.baseCurrency` (:300), the
     balancing-entries section (:309, :339-340) and a mode switch that never hides (the reference
     app's :236-237 are absent). It has no partial-months line, and its parser never returns
     `partialMonths` (checked), so the app's guarded line never shows.

Decisions of the statement providers, group B (WP9: `providers/{chocolate,maribank,stashaway}/{provider.js,page.html}` and `providers/stashaway/test.js`):

120. **The three descriptors hold design §4.2's values, checked against the old apps.** stashaway's
     `provider.js` is §4.2's descriptor verbatim, `summary` included; chocolate's and maribank's
     follow their §4.2 rows, with a new generic `summary` line each (as decision 112).
     - chocolate and maribank set `scripts: ["layout.js", "parser.js"]`, so their own layout copy
       (which sets `MariLayout`) runs before the parser, and no `uses`: their parsers read
       neither `StatementLayout` nor `StatementAssemble`. stashaway's factory takes no
       dependencies, so it has no `uses` either; core export is inlined and fully shadowed by its
       11 overrides (C08, C08b).
     - The skip labels are written out: chocolate's and maribank's five equal their old
       `LABELS` (:316-322 and :314-320) and stashaway's six its :309-316, keys in the old order.
       Everything else is the gen1 preset, the legacy knobs §4.2 lists, or a default.
     - A scratch check compared each resolved runtime with the old `src/app.js` and template
       blobs at legacyHead: the `LABELS` and `DETAILED` objects, the storage keys, the title, the
       busy texts, the month-count status line, the gen1 gap sentence, the first openings in
       `r.baseCurrency`, the balancing-entries section as the only section after the skipped
       rows, the extra line (`r.warnings`, or `r.unmapped` with the noun "portfolio"), the
       skipped-row owner, the mode-switch hiding (only chocolate has it, :236-237), the kind
       model (the `modeOf`, tag and "Auto (…)" lines), the card notes, the page transform and the
       parser global; none of the three old apps reads `partialMonths` or `downloadOnly`. 28, 28
       and 27 checks pass, and 12 of 12 scratch mutants of the descriptors fail them.
     - The resolved runtime equals `frozen.js` in every key it holds (C05), and equals the
       runtime of decision 114's scratch drafts key for key, so WP8's differential and its
       real-data runs of these three apps were made with these runtime objects.
121. **`page.html` is cut from the template blob, with the old whitespace kept.** As decision 117:
     a scratch script cut the slots of design §4.4 from each `src/index.template.html` blob at
     legacyHead (equal to the working-tree file), byte for byte, with W1 once (chocolate :154,
     maribank :155, stashaway :155), and the file opens with the two comment lines of decision
     93.
     - stashaway writes the slots whose defaults are not its texts: `config-summary`
       ("Portfolios", :139), `accounts-title` and `combined-title` (:133-134, the "portfolio"
       wording) and `help-extra` (:160-170, "How portfolios are grouped"). chocolate and
       maribank leave out `title`, `empty`, `config-summary`, `accounts-title` and
       `combined-title`: their defaults are the old texts.
     - In the list and block slots the common indentation becomes two spaces and the relative
       indentation is kept, so the build's re-indentation gives back the old lines. The raw text
       of each built `<main>` differs from the old `index.html`'s on the W1 line and the `#empty`
       line only (its style attribute), plus, for stashaway, the three configurator lines with
       the legacy ids (W3).
122. **Four old stylesheets lack the `[hidden]` rule; nothing renders differently** (amended by
     decision 127, which found the other two). maribank's, moomoo's, stashaway's and the custom
     app's old `<style>` have no `[hidden] { display: none !important; }` (maribank's, moomoo's
     and the custom app's bodies are byte-identical; stashaway's also styles `.portfolio` and
     `#portfolios-reset`, the W3 names); the core stylesheet has it, as chocolate's, posb's,
     maybank's and the reference app's do. The rule only matters for a hidden element with an
     author `display` rule. Of the elements these pages can hide (`#picker`, `#busy`, `#empty`,
     `#results`, and on the three statement pages the mode switch's `.field`), only `.field` has
     one (`.toolbar .field`), and none of the four hides it: the three statement pages have
     `hideModeWithoutInvestments: false`, and the custom app never touches it. The goldens do not
     see CSS, so this argument, with decision 127's computed-style check, is the check.
123. **stashaway's `test.js` ports `test/compare.js` as the `reference` hook.**
     - The reference file is the old reference JSON, `{accounts: {<name>: {valuations, trades,
       cash}}}`, which may also hold the old map file's `names` and `config`. The harness parses
       with its own config, so a `config` in the file must equal `ctx.config` (key order
       ignored); otherwise one problem line says so, rather than comparing a result the
       reference was not written for.
     - The problems are compare.js's failing lines: unmatched reference accounts,
       `<name>: not in reference`, and per account and category the multiset count line plus up
       to 5 rows per side (numbers with 6 decimals, valuations joined as written). Its
       informational lines (statement count, errors, gaps, unmapped, skipped, balancing count)
       are left to the harness. The lines name accounts, dates and amounts, so callers keep them
       private. A read failure gives the error code, never the path, and a damaged file gives
       problem lines, never a TypeError.
     - `loadNode` loads a provider's `test.js` for the old and the new parser, so this file needs
       only `fs` and exports no hook the statement-app handle calls (no `reconcile`).
     - Checks (scratch): 18 synthetic cases; a seeded differential against the old compare.js
       (its blob run in a vm with stubbed `require` and `process`, its parse a stub returning
       the synthetic result): 400 cases, 211 of them with differences, give the same pass or
       fail and the same difference lines; 10 of 10 scratch mutants of the hook are caught. On
       the real statements (counts only), a reference built in memory from the old parser's
       result, written 0600 to `<private-dir>` and removed afterwards, compares clean with the
       new parser's result, and five mutated references give the expected problem-line counts.

Decisions of the G4 gate run (design §8.1 M5, all eight providers):

124. **The privacy lint's one finding is fixed where it was** (decision 100).
     `test/unit/replay.test.js`:688 gave git a synthetic e-mail address in its `-c user.email=`
     argument. git needs a non-empty identity there, not an address, so the value is now
     `synthetic`, as in the other unit files that make repositories (`provenance.test.js`,
     `lint.test.js`, `contract.test.js` and `synthetic-tree.js`). The test still commits (21 of 21
     pass), and the lint of the whole tree finds nothing apart from the sinks report, which stays
     a report until M8.
125. **How G4's parts were run.**
     - The static page snapshot has no tracked command before M6, where `compare` takes it at
       `@open`. G4 used a scratch check that opens each page as `runPage` does (E0, empty
       storage, frozen clock, then `staticSnapshot()`), compares it with the stored quick and full
       E0 goldens' snapshot after `waivers.normaliseStatic`, and counts W1 and W3 as `compare.js`
       does: W1 when the old text changed, W3 when the normalised text differs from the text with
       W1 alone. It also compares the raw `<main>` of each built page with the old `index.html`,
       line by line.
     - C13 runs on fixtures, and only the custom app has them: the seven legacy statement
       providers keep the default `testing.fixtures: null` (design §4.2). Their pages are covered
       by the smoke (the empty state, and a bogus file through the picker and by a drop), the
       static snapshot and the replay.
     - `dist/` was not rebuilt: the whole-tree `build --check` found all 9 files current, the
       landing page included, so the last `--only` build had already written it with all eight
       providers.
     - No statement-app switch or descriptor value was missing. The page packages reported none,
       and the replay with the descriptors, the static snapshots and a browser comparison of the
       quick tier on the final tree confirm it, so no provider file changed.

Decisions of the stage C1 fixes (the findings and problems of the stage C part 1 verification):

126. **Decision 110's line counts, recomputed** (verifier problem). The partition of the reference
     app's 414 non-blank lines is now exact: an exact longest common subsequence of the non-blank
     lines of its `src/app.js` blob and of `core/app/statement-app.js` gives the lines that stand
     verbatim in their order, and every other line lies in exactly one of the other sets.
     - 204 verbatim in their order (224 counting blank lines), and :348 and :350 verbatim but
       now inside the diagnostics section functions, before the "Rows not exported" lines they
       used to follow.
     - 167 moved to the core: the derivation map's ranges hold 169 non-blank lines, of which
       `readStatement`'s first and last lines (:49, :63) still stand verbatim.
     - 39 switch points rewritten in place: the 35 listed before, plus :6 (`P` from
       `D.parserGlobal`), :327 (the end of the old `LABELS` object, now `U.skipLabels`), and
       :380 and :387 (the `range()` reads that the zip names, :381 and :388, no longer need).
     - 2 comments dropped: :3, the file's description, and :43, the comment above the moved
       `modeOf`.

     The first counts (233, 146 and 35) did not reproduce. Decision 110 and the derivation map
     now give these. The substance holds: no line outside these sets differs, so every template
     literal and `esc` call outside the switch points is byte-identical.
127. **Decision 122 covered two of the four stylesheets without the `[hidden]` rule** (finding
     decision-122-incomplete). In the old templates' blobs, maribank's, moomoo's and the custom
     app's `<style>` bodies are byte-identical and lack the rule, stashaway's lacks it too, and
     chocolate's, posb's, maybank's and the reference app's have it. The argument holds for all
     four: their apps hide only `#picker`, `#busy`, `#empty` and `#results` (checked in the old
     apps' and templates' blobs; no rendered markup holds `hidden`), none of which has an author
     `display` rule, and `.field`, the one hideable element with such a rule, is never hidden
     there. A scratch check in the pinned Chrome compared the computed `display` of every element
     of `<main>`, old page (read only, from `file://`) against the new one, by position: 4 pages,
     10 states (the empty state, a bogus file, and the custom app's synthetic fixture and hostile
     workbooks), 819 elements, 0 differences. Decision 122 is amended in place.
128. **The derivation map's statement-app row names each gen1 app's own lines** (finding
     derivation-map-gen1-lines). "The same lines in chocolate2csv and moomoo2csv" was wrong:
     chocolate2csv's status, gap text, openings currency, reconciled filter and balancing-entries
     section are 2 lines later (:296, :299-300, :302, :311, :343-344; :68 and :78 agree), and
     moomoo2csv's balancing-entries section is at :339-340, because its `LABELS` block is two
     lines shorter. The row now lists them, and stashaway2csv's own gen1 lines (:66, :76, :289,
     :292-293, :295, :304, :337-338), all read from the blobs. The per-provider rows were right.
129. **Only the sinks lint's innerHTML rule waits for M8** (finding sinks-report-only-all-rules).
     Design §6.3 delays only "innerHTML may be assigned only inside StatementEscape.setHtml"; the
     banned APIs, the clock and random rules, the localeCompare rule and the compose rule hold
     from the start, so §8.1's "sinks lint enforced" at M8 is read as that one rule.
     - `test/lint/sinks.js` exports `REPORT_ONLY = ["innerHTML"]` in place of `ENFORCED`, and a
       finding of a report-only rule carries `reportOnly: true`. `runLints` returns each lint's
       `failing` findings (those that count) and fails on any; `--enforce-sinks` counts the
       report-only ones too. The tokenize finding (a file the blanker cannot read) counts now.
     - WP13 empties `REPORT_ONLY` at M8.
     - The tree has no finding of a counting rule; the 12 old `innerHTML` assignments stay notes.
       Decision 102 is amended in place.
130. **The sinks lint's blind spots** (finding sinks-blind-spots; amended by decision 174, which
     bans every form of these names).
     - Banned too: the markup parsers `setHTMLUnsafe`, `parseHTMLUnsafe`,
       `createContextualFragment` and `parseFromString`, and, beyond the finding's list but of
       the same kind, `performance.now(` (a clock), `crypto.getRandomValues(` and
       `crypto.randomUUID(` (randomness). `outerHTML` as an object key, a bare name or a string
       literal is banned along with `.outerHTML =`.
     - The innerHTML rule also counts `innerHTML` as an object key (`Object.assign(el,
       {innerHTML: s})`), a shorthand property, a bare name, or a string literal
       (`el["innerHTML"] = s`, `Reflect.set(el, "innerHTML", s)`, a key kept in a variable). A
       string counts only as a real token: the literal is replaced by an identifier of the same
       length and the text blanked again, which keeps the identifier only outside comments,
       regexes and other strings.
     - The clock rule counts `Date()` called without `new` and `new Date` without parentheses
       (still allowed inside `zip()` in `core/zip.js`).
     - The localeCompare rule counts `undefined`, `void …` and `[]` as no locale, as the second
       argument of `localeCompare` and the first of `Intl.Collator` (also without arguments or
       parentheses). Arguments are split on the blanked code, but whether one is present, and
       whether it holds a string, is read from the source at the same indexes: blanking turns
       `"en"` into spaces and `["en"]` into what looks like `[]`.
     - Findings come in source order within a file. The tree holds none of these constructs.
131. **The synthetic tree runs the real statement app** (finding statement-app-no-ci-coverage,
     first part). `test/unit/synthetic-tree.js` copies `core/app/statement-app.js` byte for byte,
     like the other core modules, instead of writing its stub. In CI the smoke therefore renders
     the real app's cards on real parse results of the three synthetic statement-app providers
     (CSV through `StatementAssemble`, PDF through `StatementLayout`, and the skeleton) and clicks
     every button, and the fixtures golden compares every download in every mode and range,
     Download all's scan of the rendered cards included, with the downloads hook. That is what
     the M12 templates would add, brought forward. `contract.test.js`'s app mutations now edit
     the real app's lines, and a check asserts the copy.
     - The synthetic providers use the default switches; the seven legacy variants rest on
       decision 132 and the goldens.
     - M8's injection smoke can run its configurator half on this tree in CI. On `dist/` pages
       it has no configurator page with fixtures until M12; G7's S scenarios cover those pages
       locally. Decision 108 is amended in place.
132. **`test/unit/statement-app.test.js` keeps WP8's old-against-new app differential** (finding
     statement-app-no-ci-coverage, second part; a new unit file, like decisions 48, 57, 71 and
     82). It is decision 114's Node differential as a tracked test.
     - For every provider with `frozen.legacyRepo` and a statement app: the old page's build.py
       parts (layout, export, parser, app) against the new plan's pieces 3-13 with the real
       descriptor, in two `vm` contexts with the same recording stub DOM; only `parseStatements`
       is a shared synthetic stub.
     - What each old parser can return comes from the files, never a table: `partialMonths` and
       `downloadOnly` when the pinned parser mentions them, partial and start-date months when
       the old export layer handles them (B and C), CSV inputs from the descriptor, and the
       investment-cash kind model from the runtime.
     - 8 seeds per app: 56 runs, 73,820 log entries, 7,110 downloads and 397 parses, 0
       differences (13 s in the parallel unit glob). A second test edits the app four ways (a
       label, a card text, Download all's Accounts entry, the skipped-row order), and each edit
       is caught for all 7 apps.
     - The old files are read only after `checkGit` finds them equal to their blobs, between the
       baseline's before and after manifests. Without the old repositories (CI) the tests are
       skipped. No provider is named.

     At M8 the markup of hostile values changes on purpose: the universe gives some accounts the
     currency `<i>X` (about 8% of the seeds), which the old cards, configurator and first-openings
     line print raw. WP13 adjusts the comparison for exactly those values, so that everything else
     stays byte-identical (decision 159). At M9 the statement app catches a parse that throws: the
     old side runs with the design's M9 edit, and every script ends with throwing parses (decision
     166).
133. **`constants.test.js` walks every nested runtime path** (verifier problem: a scratch app
     reading `D.storage.modeKeyX` passed). Every `D.…` and `U.…` path the app reads is walked
     through a resolved runtime object: each step into a plain object must name one of its own
     keys, and a step into an array, a string or null ends the walk (`D.inputs.includes`). A
     declaration that binds a fixed-key runtime object to another name (`const S = D.storage`)
     is reported, since reads through it escape the walk; `U = D.ui` and `LABELS =
     U.skipLabels` (a map read by category) are allowed. A sample test checks seven wrong paths
     and aliases, and the valid forms.
134. **`contract.test.js` keeps its extraction cache to itself** (verifier problem). C13 reads the
     synthetic fixtures through `test/lib/extract.js`, whose cache lives in
     `<private-dir>/extract`. The file now points `S2C_PRIVATE` at a temporary directory, as
     `extract.test.js` and `replay.test.js` do (decision 82), and its C13 test asserts that the
     cache landed there. The 8 entries that earlier unit runs had written to the real cache (the
     synthetic tree's 8 distinct fixture files, matched by sha256, under the one page key
     `6d6461f60bb73ed0`; synthetic data only) were removed. The custom app's fixture entry, which
     the real tree's C13 writes by design (decision 105), stays. A full run afterwards left no
     synthetic-tree entry there.
135. **`core/README.md` exists now** (verifier problem: design §1 lists it, and no package owned
     it). It maps the modules with their globals and public APIs, the script plan's load order,
     the page files and the Node-only contract modules, names no provider, and points here for
     provenance.
136. **G5's exhaustive tier runs as `live --tier exhaustive`** (M6; verifier note). Design §8.1
     says `compare` for every tier, but only the quick and full goldens were captured at M2, and
     capturing exhaustive goldens first would run every old page through the same scenarios
     anyway. `live` drives the old page and the new page side by side under the same
     determinism controls and compares every download, stored setting and UI snapshot, which is
     the same equivalence check without a stored manifest. It ran once per provider, as §8.1
     asks; no exhaustive goldens are stored, so a later exhaustive check repeats the live run.

Decisions of the generic harness (WP11: `test/harness/run.js`, `test/unit/harness.test.js` and an
extra in `test/lib/reconcile.js`):

137. **The harness CLI, beyond design §6.6's synopsis.**
     - `--statements` takes a folder for the one `--provider`, or `<id>=<folder>` (§6.9's form).
       Without it the folder comes from `statementsFor`: the user config, then a folder of
       `<statements-dir>` named after the provider.
     - `--node-readers` (named in H3) and `--root <dir>` (as the contract runner, the smoke and
       the fixtures golden have it; the unit tests run the harness on the synthetic tree).
     - `--only` takes step ids in any case (`h6b`). `--only H12`, `H13` or `H14` without
       `--browser`, `--dump` or `--reference` is a usage error, as are `--statements` and
       `--reference` with `--all-fixtures`, and `--strict` with `--no-strict`.
     - Exit status 0, 1 when a step fails, 2 for a usage error (an unknown option or provider), as
       the contract runner and the smoke use 2.
     - H1, H2 and H3 always run, because every other step needs the handle, the inputs and the
       statements; they are printed only when `--only` selects them. A fatal failure among them
       (no Node branch, no input file, an extraction that throws) blocks the steps after it, and
       each selected one is reported as failed (`blocked`).
     - A step is pass, fail, report (problems in a check that does not gate), skip (not run: a
       flag is missing, or the data cannot exercise it) or n/a (not for this app type). Only fail
       fails the run.
138. **Fixtures folders and real folders.**
     - A folder holding `statements.js` is a fixtures folder. Its files are rendered into the
       run's temporary folder and keep the spec's order: C13, the smoke and the fixtures golden
       load fixtures in that order, and a spec's `expectErrors` is written for it. In JS string
       order a copy named `…-copy.pdf` sorts before its original (`-` before `.`), so a
       duplicate error would land on the other file; design §6.5's own example spec has that
       shape, and so has the synthetic tree's PDF spec. A real folder is read in JS string order,
       as H2 says.
     - A fixtures folder uses its spec's `expectErrors` and allows no reconciliation lines. A real
       folder uses the private declarations of the user config, whichever resolution step found
       it (decision 26).
     - `--all-fixtures` runs every discovered provider whose descriptor names
       `testing.fixtures`, skeletons included, in folder order. A descriptor that cannot be loaded
       is a failing target, not a provider left out (its unit sample came with decision 152).
139. **What H4 and H5 parse, and which errors they expect.**
     - A statement app's parse does not depend on the mode (the handle passes only the config), so
       "for every mode" is one parse per config; custom apps parse in every mode.
     - Statement apps: the batch result's `errors` entries plus the reader failures must equal the
       declared file names, both ways (C13's rule).
     - Custom apps: one `{error}` is the whole result, so the whole-folder parses use the inputs
       minus the declared errors, and the declared names must equal, both ways, the files whose own
       parse (H4's) gives `{error}` or no result, plus the reader failures.
     - H4 reports the files that give an error alone and fails only on a throw: a file can be an
       error only in company (a duplicate month), which H5 checks.
     - `testing.allowWarnings` governs a result's `warnings` for both app types (the custom app's
       informational warnings). `checkResult` errors fail for every provider, as H5 says; its
       warnings fail in strict mode and are reported otherwise.
140. **H6 and H6b count against one declaration.** `test/lib/reconcile.js` gains
     `reconcileParts(handle, result)`, an extra (decision 26): the lines of `reconcileStatement`,
     which is unchanged, in the same order, each tagged `problems` (adjustedEntries' card
     problems), `running`, `trades` or `monthly` (H6b), with counts.
     - H6 counts every line but the monthly ones, plus `test.reconcile`'s lines when the provider
       exports it, against `allowProblems` (0 for fixtures).
     - H6b counts the monthly lines against what H6 left of the declaration, and gates in strict
       mode only.
     - `testing.reconcile: "custom"` on a statement app makes H6 call `test.reconcile` in every
       mode, as for custom apps, and H6b does not apply.
141. **H7 is the old gap test, by parsed month.** The cases are the old test's: the middle month
     (index ⌊n/2⌋), that month and the next, the earliest first month of an account after the
     first loaded month, the first month and the last.
     - An input's months are those of its own parse (H4's); a case drops every input that has one
       of its months.
     - The check is the old test's too: each account starts at its `firstOpenings` entry (the
       first one, else 0), and its balance-only entries must bring the running balance to every
       loaded closing within 0.005.
     - A case that would drop nothing or everything is noted and not run. When no case can run
       (one input holds every month), the step is skip.
142. **H8's rules** (amended by decision 151, which gave the Combined zip's entries their header).
     - The file type comes from the name: `.csv` and `.qif` have rules, a zip is a record with a
       file list (or of type `application/zip`), and any other extension is a problem, so a new
       file type gets a rule rather than a silent pass (as C17 treats file headers).
     - A numeric cell is non-empty, has no surrounding spaces, and `Number()` makes it finite. Zip
       entries get the CSV and QIF checks. The entries of a statement app's Combined zip also get
       the header check, each against the writer its name gives (decision 151; "an entry has no
       trigger or kind" was wrong for them, since the name tells the kind). Download all's
       entries are the Accounts CSV and the card files, each checked as its own record and
       required equal to it below; a custom app's zip entries have no header expectation.
     - The statement-app rules restate design §3.9 without `core/files.js`: the span rules of the
       names; Download all = the Accounts CSV followed by every card file in card and button
       order; the Accounts rows = the card accounts with a non-null opening (worked out as
       `accountsFile` does); the Combined rows = the sums of the cards' transactions and trades
       rows.
     - The states: every mode × (the full range, each single month); with one month that is one
       state, and a result without months gives one state without a range.
143. **H9's choices.**
     - The rename uses the hostile name of the plugin-API design (`=Renamed "A&B", <x>`). A
       portfolio's account with no config is its label; a check that rests on a label is skipped
       when two portfolios share it.
     - The kind flip sets `cash` on an investment and `investment` on anything else. The forced
       Balance only is checked through the account's card files in holdings mode.
     - The merge pair is the first two portfolios, in portfolio order, with the same non-null
       currency and accounts of their own. Month-end values are compared per month within 0.01:
       the merged account keeps the first member's `monthEnd` for a month (design §3.10 step 5),
       so a comparison per date would compare different dates.
     - The trades kept on the account set to cash-like are counted in the report's notes, not
       asserted.
144. **H10's comparisons.**
     - Two parses must give the same `canon` text, in every parse mode.
     - New providers' statements are deep-frozen from H3 on, and their configs at every parse, so a
       parser that writes to them throws, which H4 and H5 report. Legacy providers' statements are
       compared by `canon` text at H3 and after H10's parses.
     - The reversed order is skipped with one input, on a single-file picker (the hook parses the
       first file only), and when an errors entry or an `{error}` says "duplicate". The results
       are compared with `errors`, `warnings` and `skippedRows` as multisets and without
       `months[].id`: by contract these follow the input order, and the core reads only
       `months[].month`.
145. **H12 runs on http** (amended by decisions 153 and 156: the range and the full batches with a
     bogus file are compared with the hook too).
     - The page is served by `test/lib/serve.js` from 127.0.0.1 for the whole step: its reload
       check needs storage that survives a reload, which `file://` does not always give (decision
       89). It is `dist/<id>/index.html` when that equals a fresh build (the smoke's
       `pageTargets`), else a temporary build; a stale dist page is reported and not tested.
     - The inputs load as the smoke loads fixtures: one batch, or one file at a time without the
       declared errors on a single-file picker. Every state is compared with `replayStep` on the
       page's own state (the "on" mode, the selects, the stored config and the driver's add
       order), as the fixtures golden does, with `TZ=UTC` for the run, in the process's locale
       (decision 107). The months the range offers are compared with that rebuild's months too
       (decision 153).
     - The bogus files are the smoke's, one per declared input, each alone through the picker and
       by drop; on a multiple-file picker the first input's file also goes first and last in the
       full batch, and the downloads of those two loads are compared with the hook (decision
       156). The check looks for a `#status .warn` line that names the bogus file, because
       real data warns anyway (first openings, gaps).
     - The errors are the smoke's: console errors, page errors other than the pdf.js worker
       fallback, and CSP violations. Overflow is checked in the empty state and with results.
     - Configurator: the first row renamed (the hostile name) and set to the other of investment
       and cash-like, the last row excluded when there are two or more, and the first two of the
       other rows with one currency merged, the later into the earlier; each setting is compared
       with the hook. After a reload and the inputs again, the stored string, the rows' markup and
       count, and the downloads must be equal; Reset must store `{}` and give back the first
       downloads.
146. **Output and privacy** (amended by decisions 154 and 155). Each provider's details go to
     `<out>/<id>/report.json`, 0600 in 0700 folders after `assertSafeOutput`: the steps with their
     counts, up to 500 problem lines and 500 notes each (the counts stay exact), the inputs with
     sizes and sha256, and the declarations. The console shows step ids, statuses and counts only.
     A run-level error prints one fixed line that names `<private-dir>/harness/<run>/error.txt`,
     which holds its message (decision 154; the masking first described here left on the console
     the words after a space in a path), and no output goes inside a folder the run reads (decision
     155). The run's temporary files (browser profiles, rendered fixtures, bogus files) live in
     `<private-dir>/tmp/harness-<run>`, where `TMPDIR` points for the run, and are removed at the
     end (decision 40).
147. **`test/unit/harness.test.js` is a new unit file** (not in the design §6.4 list, like decisions
     48, 57, 71 and 82; amended by decisions 152 and 212). It runs the harness on the synthetic
     tree, with `$S2C_PRIVATE`, `$XDG_CONFIG_HOME` and `$S2C_STATEMENTS` pointing at a temporary
     directory, so the private declarations come from a temporary user config. Every step had a
     passing and a failing sample, each made by changing one thing in a fresh copy of the tree or by
     giving it another synthetic statement folder, but most rules within a step had none (decision
     152 adds one per rule); the private declarations have their own (an undeclared error, a
     declared error that does not occur, `allowProblems` one short and just enough, and a fixtures
     folder that ignores the user config). The CSV and XLSX providers use the Node readers, so CI
     step 5 runs most of it without Chrome; the PDF provider, H12 and the PDF dump are skipped
     without it.

Decisions of the real-statement harness gate (M7, G6: `core/contract/result.js` and
`test/unit/result.test.js`):

148. **`checkResult` reads a null skipped-row `detail` as absent** (WP11's open failure,
     stashaway's H5).
     - The verbatim stashaway parser writes `detail: null` on a skipped row whose reason has no
       `": "` part. The real statements have such rows. `checkResult` accepted a null owner field
       but required a string `detail` whenever the key was there, so H5 failed on each of them.
     - Design §2.9 gives both as optional (`detail?`, `account? | portfolio?`), and the core's
       one reader of `detail`, `x.detail || "(no description)"` (`core/app/statement-app.js`:304;
       the reference app's :335 and stashaway2csv app.js:324), shows null and absent alike.
     - So `core/contract/result.js` now accepts a `detail` that is absent, null or a string; any
       other value is still an error, strict mode included. The result table is unchanged, and
       the module is Node-only (never inlined), so no page, download or golden can change:
       `build --check` finds `dist/` current, and a quick golden compare of stashaway is
       identical (G6 entry).
     - The block was in the contract checker that H5 calls, not in the data, so the parser is
       untouched, nothing is declared, and `test/harness/run.js` is unchanged.
       `test/unit/result.test.js` gains one test: null and absent pass, strict mode too; a
       number, a boolean and a non-string owner fail, with their messages. It fails on the old
       rule (scratch mutation check) and passes on the new.
149. **How G6 reads "H1–H12 pass", and the private declarations it needed: none.**
     - A provider passes when its run exits 0: no step fails, and each skip or n/a is one that
       decision 137 allows (the step is not for the app type, or the data cannot exercise it),
       with its reason logged. On the real folders these are steps that a folder's data cannot
       exercise, and the custom app's reversed order (decision 144), H6b, H7, H9 and H11 (no
       ledger, no configurator).
     - Every provider gives 0 errors entries and 0 reader failures (H5), and 0 reconciliation
       lines (H6, and no monthly line for H6b). So the private declarations stay the defaults
       for all 8 (no `expectErrors`, `allowProblems` 0), and the user config was not changed.
       posb's duplicate-download and "nothing after" errors (design §6.6's examples) need two
       downloads of one account with the same as-at date, or a download dated no later than its
       account's last loaded statement; the folder gives neither.
     - The real path enforces a declaration both ways: with `$XDG_CONFIG_HOME` pointing at a
       scratch copy of the user config in `<private-dir>` (removed afterwards) that declared one
       posb file which gives no error, H5 failed with "1 declared, 1 missing" (exit 1), and the
       console named no file.
150. **No `allowWarnings` and no `configIdPattern` change.**
     - `testing.allowWarnings` stays the default on the seven statement apps: their parses give
       0 `warnings`. The custom app keeps design §4.2's `allowWarnings: true`; its real workbook
       gives informational warnings, the case that setting is for.
     - Design §4.1 corrects a draft pattern only when a real id fails it, and none does: H11
       matches every real portfolio id, as in decision 8. The parsers' id construction agrees
       (source check): where a pattern asks for a currency code, the parser writes a capture of
       `[A-Z]{3}` or a three-letter default (versa, posb, moomoo's cash, chocolate, maribank's
       savings); maybank's id is the account number, read with the pattern's own
       `^\d{6}-\d{6}$`; and the tails written `.+` are free text (moomoo's ISIN, maribank's fund
       name, stashaway's normalised name). posb's `.+` is looser than its ids, which always end
       in a three-letter code; looser is not wrong, so the frozen value is kept.

Decisions of the M7 review fixes (stage D1: `test/harness/run.js`, `core/contract/headers.js`,
`test/unit/harness.test.js`, `test/unit/headers.test.js`, `test/unit/synthetic-tree.js` and
`test/unit/contract.test.js`):

151. **H8 checks the header of each Combined zip entry** (finding combined-entry-headers).
     - `core/contract/headers.js` gains an entry case. An entry of the Combined zip is described as
       `{trigger: "combined", kind}`: kind `"trades"` expects the first line of
       `P.combinedTradesCsv([])`, kind `"transactions"` that of `P.combinedTransactionsCsv([])`.
       The Combined record itself keeps kind null and, as one CSV, the transactions header. The
       `combinedTrades` writer, dead code before, is used now. The handle's signature is unchanged
       (design §6.11): the entry reaches `expectedHeader(download, {mode})` as that record.
     - The harness takes the kind from the entry's name. `core/files.js` writes the two names as
       `<brand> all <groupNoun> - <kind> - <span>.csv`, the rule `statementStateProblems` already
       checks (now one helper, `combinedNamesOf`). An entry with another name has no expectation;
       the name rule reports it.
     - The other zips need no entry header of their own. Download all must hold the Accounts CSV
       and the card files with their names and texts (decision 142), and each of those records is
       checked with its header. A custom app's zip entries keep the CSV and QIF checks only: its
       hook describes downloads (design §2.12) and has no form for an entry, adding one would
       change a frozen hook (§8.3), and the custom app's zip holds its card files.
     - The finding's experiment (the Combined trades entry written by the per-account writer, so
       without the `account` column), run through H8 on the synthetic investment provider of
       decision 152, passed before and fails now in its 3 holdings states with "entry 1: the
       header line is not the one the composed writer gives". The H8 summary counts the entries
       with a header to match. `headers.js` is Node-only and never inlined, so `build --check`
       finds `dist/` current.
152. **Every rule of the harness has a failing sample, and the mutation counts are honest**
     (finding harness-unit-coverage).
     - The review found 34 of 43 single-rule mutants of `test/harness/run.js` surviving the 37
       tests. Each step had a failing sample, but most rules within a step had none. The WP11
       mutation check had about one mutant per step, and its "H8's header" mutant changed
       `csvProblems`, not the wiring that asks for the header. Decision 147 and the WP11 entry
       are corrected in place.
     - The synthetic tree gains `syn-invest`, a statement app on CSV broker exports with an
       investment account (cash rows, buys and sells, month-end values) and a cash-like account.
       It brings holdings files, the Combined zip, trade lines and the investment-to-cash kind
       flip into CI: the contract checks (both tiers), the pages smoke, the fixtures golden and
       the harness all run on it, and pass. `contract.test.js` now expects 5 providers and 4
       published pages.
     - `syn-pdf` gains a page transform, `dropStamp`. Each synthetic PDF statement carries a stamp
       line above its title, which the transform drops, so the parse depends on it: without the
       transform H5 fails with "not a synthetic PDF statement". H13's PDF dump now shows the raw
       items with the stamp and the transform's output without it.
     - `test/unit/harness.test.js` grows from 37 to 56 tests. Each rule the review listed has a
       failing sample now, and so does each rule a rule-by-rule pass of `run.js` found without
       one: a symlink that leads out of the statement folder (H2), a passing legacy deep compare
       (H10), `testing.reconcile: "custom"` on a statement app (H6), a case that would leave
       nothing (H7), a downloads hook that throws or returns no array (H8), one input on a
       multiple-file picker (H10), the page busy after the inputs or a full batch (H12), and the
       dumped reader failures (H13). A sample changes one thing in a fresh tree, or a few
       independent things, each asserted by its own message.
     - The mutation check of the stage D1 entry has one mutant per rule of `run.js` (the review's
       43 on the current code, then the rest rule by rule, the fixes' own checks included) and two
       of `headers.js`'s entry case. A mutant counts as caught only when a test fails; the entry
       gives the counts and each survivor's reason.
     - The check also found a defect. H12 started its local server before the last setup steps
       that can throw (writing the bogus files, reading the handle's fields), so a throw there
       left the server open and kept the process alive; under one mutant (H1-H3 run only when
       `--only` selects them) the test run hung until the runner's 15-minute limit, though its
       tests had failed. That setup now comes before the browser and the server.
153. **H12 compares the range with the hook's months** (finding h12-range-months). Every state
     takes its range from the page's own `#from` options, so a page that hid or added a month
     compared equal. Now every comparison with the hook (each mode at the full range and the last
     month, each configurator state, after the reload and after Reset, and the full batches of
     decision 156) also requires those options to equal, in order, the months of the hook's
     rebuild of the same state (`monthsOf` of `replayStep`'s result). The rebuild is used rather
     than the whole-folder parse because a single-file picker shows the last file it was given,
     and the rebuild parses the page's own add order, config and mode. The finding's experiment
     (the range given every month but the last) now fails H12 in every state with "the range
     offers 2 months, the hook's result has 3 (not offered: 2026-03; …)". The summary counts the
     ranges unlike the hook's months.
154. **A run-level error prints one fixed line, and its message goes to a private file** (finding
     privacy-run-error).
     - Masking cannot tell where a path with spaces ends: in the finding's experiment, a
       configured folder that does not exist, named with spaces, put the words after its first
       space on stderr. `redact` and the list of noted private texts are removed. A run-level
       error now prints `harness: FAILED: <summary> (details in
       <private-dir>/harness/<run>/error.txt)`. The summary is one of the harness's own fixed
       texts (the statement folder cannot be resolved, the user config cannot be loaded, the
       output folder cannot be used, the folder for the run's temporary files cannot be used),
       and it is left out for an unexpected throw. `error.txt` (0600 in a 0700 folder) holds the
       message and the stack.
     - Two failures leave nowhere to write the message. A user config that does not load blocks
       every private write, since each one reads its `refuse` list; it is checked first and
       prints `harness: FAILED: the user config (<config-dir>/statements.js) cannot be loaded`. A
       `<private-dir>` that the guards refuse or the system cannot create prints `harness:
       FAILED: the private directory cannot be used (<reason>)`, where the reason is the guarded
       location in `test/lib/private.js`'s own words (ids and repository names only) or the
       system error code.
     - Usage errors print as before: they quote option names, provider ids and step ids. The
       finding's experiment now exits 1 with the one fixed line and no word of the folder's name.
155. **No output goes inside a folder the run reads** (finding out-in-statement-folder).
     `assertSafeOutput` refuses `<statements-dir>` and the configured folders, but a
     `--statements` folder can lie anywhere. `runHarness` now collects the folders its targets
     read (statement folders and fixture spec folders) before it creates anything. Every write
     (the output folder, the temporary folder, the reports, the dumps, the bogus files and the
     temporary page build) refuses a path inside one of them. `main` no longer creates the
     temporary folder before the targets are known; it checks `<private-dir>` only. The finding's
     experiment now stops with "the output folder cannot be used" and leaves the folder as it was.
156. **H12 compares the full batches with a bogus file with the hook** (finding
     h12-bogus-batch-compare). After the load with the bogus file first, and again with it last,
     on a multiple-file picker, the captured records (and the range, decision 153) are compared
     with the hook's rebuild of the page's state. The rebuild has no statement for the bogus file
     and leaves it out, as the page does when its reader fails on it: every real multiple-file
     picker takes PDFs first, so the bogus file is a PDF the reader rejects. A bogus CSV (the
     synthetic tree's) reaches the parser and gives an errors entry, which no download carries.
     This adds two states per multiple-file provider.

Decisions of the rendering safety step (WP13, M8: `core/app/statement-app.js`,
`providers/etoro/app.js`, `test/lint/sinks.js`, `test/smoke/injection.js`, the S scenarios of the
golden harness and their unit tests):

157. **Both apps render through `html` and `setHtml`, with the old markup as template text.**
     - Every `innerHTML` assignment became `setHtml(el, html`…`)`: 6 in each app, the range
       options included. The template text is the old markup character for character, and each
       old `esc(v)` is a plain `${v}`, which `html` escapes with the same `esc`. The `.join("")`
       of fragments is gone (`html` joins an array of Html values), and so is every inner `esc`.
     - A list the old renders escaped element by element and joined with a separator
       (`list.map(esc).join(", ")`) goes through `joinHtml(list, sep)`, which renders each element
       as `html` renders a value and puts the separator between them: the same string, for any
       element type (`esc` and `html` both call `String`). The mixed list of the configurator's
       muted line (the history markup, the month range, the currency) and the status line's
       "N statements and M downloads" go the same way. `list.join("") || "<li>none</li>"`
       became `orNone(list)`, which keeps the old `.map` on the parser's `r.closed`, so a
       malformed value still throws where it threw. Markup chosen at run time (` selected`,
       ` checked`, ` excluded`, ` class="warn-item"`) is `html` text, so it is never escaped.
     - The kind's class token goes through `cssToken`; the custom app has no such token (its tag
       is literal). The custom app's activity explanations (`how`) return `html` text, so the
       apostrophe of "doesn't change realized equity" stays as the old page wrote it.
     - What the old renders printed raw, and the new ones print as text: in the statement app the
       card balance's currency (the reference app's :209), the class token (:214), the
       configurator's currency (:258), the first openings' currency (:304; the gen1 apps' base
       currency, :300), the reconciled list's base currency (the gen1 apps' :342) and the range's
       option values (:94); in the custom app the account currency (:98, :103), the dates of the
       card, the status line and the checkpoints (:98, :103, :115, :134) and the range's option
       values (:55).
     - Page text from the descriptor (the card notes, the warning texts, the nouns) is
       interpolated, so it is escaped as well. Three texts hold an ASCII apostrophe (the default
       `notes.bank` and `notes.other`, posb's `text.partialWarning`), now written `&#39;`. The
       HTML parser reads both forms as the same character, in text and in the apps' double-quoted
       attributes, so the DOM and its serialisation (the golden UI snapshot) are unchanged.
     - The line counts of the derivation map, recomputed with decision 126's exact longest common
       subsequence. Statement app: of the reference app's 414 non-blank lines, 172 stand verbatim
       in their order (192 counting blank lines), down from 204 (224). The 33 lines that left
       are the 32 render lines M8 rewrote (:94, :210, :213, :216, :223, :224, :226, :230, :246,
       :247, :251, :252, :254, :255, :257, :258, :261, :267, :269, :272, :293, :299, :301, :305,
       :306, :308, :338, :339, :341, :342, :343, :352) and the closing brace :353, while the
       closing brace :363 joined as the alignment moved. Custom app: 100 of the old 203 lines
       stand verbatim in their order (88 of 188 non-blank), down from 117; the 17 that left are
       its render lines (:55, :99, :101, :102, :104, :105, :112, :114-:116, :121, :123, :124,
       :127, :130, :134, :135). The derivation map rows are amended.
158. **The sinks lint enforces the innerHTML rule: `REPORT_ONLY` is empty** (decisions 102,
     129). The only `innerHTML` assignment in `core/` and `providers/` is the one inside
     `setHtml`, so the lint finds nothing that counts, and an assignment anywhere else now fails
     `node test/lint/run.js`. The report-only mechanism (the `reportOnly` flag, the note lines and
     `--enforce-sinks`) stays for a rule staged that way again; `run.js` no longer mentions M8.
     `lint.test.js` asserts the empty list, an innerHTML assignment and its object-key forms
     failing, and the note path through a wrapped `check` that marks its findings report-only.
     Decision 174 makes the rule count every form of the name, reads included.
159. **`statement-app.test.js` compares the markup M8 intends** (the stage D1 note in decision
     132).
     - The hostile currency `<i>X` never reached a render: it is a candidate in 8% of the
       universes and then one of four currencies per portfolio, which gave it to an account in 0
       of the 56 universes of the 8 seeds per app (13 of 448 over 64 seeds, counted in scratch).
       Its share is now 75%, which gives it to an account in 28 of the 56 universes, at least 2
       per app. Every other draw consumes the generator as before, so only those portfolios'
       currencies and ids change.
     - On the old side, every raw `<i>X` in an `innerHTML` string is replaced by its escaped
       form before the comparison (`M8_EXPECTED`); on both sides `&#39;` is read as `'`
       (`PARSED_SAME`, decision 157). Everything else must stay byte-identical. The test asserts
       that the statement app writes the raw currency 0 times and that every old app wrote it at
       least once (2,142 times by the 7 old apps).
     - A fifth sensitivity mutant renders without escaping (an `html` that joins raw values, a
       `setHtml` that assigns strings), as before M8; it is caught for all 7 apps. A scratch run
       without either normalisation fails in the first app's first seed (at log entry 94 without
       `M8_EXPECTED`, at entry 53 without `PARSED_SAME`).
160. **The injection smoke, made concrete** (`test/smoke/injection.js`, design §6.5; amended by
     decision 175: every render target, and coverage; and by decision 185: under the hash policy
     of M10 a payload's handler is blocked and reported, not run).
     - Each payload page has a twin: the same page seeded with plain stand-ins (`{<p0>: {name:
       "Plain name", kind: "plain"}}`), or the hostile files with each payload replaced by its
       text (or the word `PAYLOAD` when it has none). Both visit every mode at the full range and
       the last month.
     - "No script runs": `window.__pwned` stays undefined after the events the payloads'
       handlers name (`mouseover`, `error`) are dispatched on every element of `<main>`, and the
       page logs no console error, page error or CSP violation (the pdf.js worker fallback
       aside). The pages keep the legacy CSP until M10, whose `script-src 'unsafe-inline'`
       allows inline handlers, so a payload that became markup would run.
     - "No new element": no element carries an `on*` attribute, and no payload tag appears more
       often than on the twin. "Literal text": the seeded name is the title of p0's card and the
       value of its configurator row's name field; p0's card tag has the class `tag other`; a
       hostile file's payload is in the text of `<main>`.
     - The payloads of `hostile.js` are found in its files' strings (every markup tag, with its
       text and end tag when it has them), so the fixture spec format is unchanged.
     - A page whose provider has fixtures but neither a configurator nor `hostile.js` is listed
       as having no payload; it does not fail, because design §2.1 makes `hostile.js` optional.
     - The Node side runs in UTC for the duration, as the fixtures golden does (decision 107).
     - `package.json`'s `smoke` script appends `node test/smoke/injection.js` (decision 2).
     - `test/unit/injection.test.js` is a new unit file (not in the design §6.4 list, like
       decisions 48, 57, 71 and 82): the whole synthetic tree passes, and each check has a
       failing sample (renders that bypass escaping, a class token without `cssToken`, a Download
       all that differs from the hook, a `hostile.js` without a payload or with one the page never
       prints, Chrome missing).
161. **The synthetic tree's PDF provider reads its currency as printed and has a hostile
     statement.** Its parser takes any token as the account line's currency (as a raw-text
     fallback does) instead of three capitals, which its fixtures already met, and
     `fixtures/hostile.js` holds one statement whose currency is
     `<img/src/onerror=window.__pwned=1>`, an element with a handler and no space (a PDF text
     token). The statement app prints it on the card, in the configurator and in the first
     openings, so its currency sinks are exercised in CI. (`<img/src=x/onerror=…>` would not do:
     the parser reads `x/onerror=…` as the `src` value, so no handler exists; the empty `src`
     here fires `error` by itself.) Decision 175 adds a second hostile statement, a missing
     month (a gap row) and a row without an amount, so the payloads reach the diagnostics.
162. **The S scenarios are on by default, and S-break runs on the new page only** (design
     §6.7.5; amends decision 44's SX1 and `--security` bullets).
     - `scenarios.generate` takes `security = true`, so every tier holds S-benign and S-break on
       a configurator page; `--no-security` gives the list from before M8, and `--security` is
       still accepted.
     - S-break carries `newOnly`. Its payload closes the class attribute of the old card's tag,
       so the old page's UI differs from the new page's by design, and decision 44's SX1 (the
       downloads replaced by a replay check, the UI still compared) could not pass it. `capture`
       records its definition with no steps and never runs it on the old page; `compare` and
       `live` run it on the new page alone (`checkNewOnly`), its steps from its actions and the
       new page's months.
     - Each step must show no handler run after a `mouseover` on every element of `<main>`, no
       `on*` attribute, the class `tag other` on p0's card (found by the probe's label) whenever
       it shows, a settled load, only frozen storage keys and the seeded config string
       unchanged; p0's card must show in some step, and the page must log no error or CSP
       violation. Under SX1 every download must equal the downloads hook's rebuild: the steps go
       to a replay child (the new parser, the environment's time zone and locale, as the replay
       command runs them), so Download all must be `zipParts(allFiles(), now)`. One SX1 use is
       counted per step, and its mismatches have the category `sx1`. The report entry of the
       environment and a console line give the pages, steps and the downloads the child
       compared (`newOnly: {pages, steps, records, zips, entries, disabled}`).
     - An S-break page of a golden captured otherwise (with steps) is routed the same way
       (`isNewOnly`). `manifestStats` counts new-page-only pages apart, `replay` skips them, and
       `compare` notes a configurator provider whose goldens were captured without the S
       scenarios. `compare.js`'s `sx1` branch stays as the safety net decision 44 made it.
     - `golden.test.js` covers the default, `newOnly`, the options, the counts, each step check
       with a failing sample, and `inspectNewOnly` in Chrome on a card as the old page renders
       the payload and as the new page does.
163. **G7's S scenarios run as `live --tier quick`.** The stored goldens were captured before
     M8 without S pages, and their manifest hashes are cited in this log, so they are kept as
     they are. `live` captures S-benign on the old page and compares it in the same run (as
     decision 136 did for the exhaustive tier), and S-break needs no golden. `compare --tier
     quick` and `--tier full` against the stored goldens check everything else. Capturing new
     goldens with the S pages is left to the next capture.

Decisions of the M8 gate (G7; no file but this one changed):

164. **How G7's parts were run** (design §8.1 M8).
     - The golden tiers are `compare --tier quick` and `compare --tier full` against the stored
       goldens, all 8 in one run each (decision 163). "No new waiver" is read from the reports'
       waiver counts: W1 and W3 as in G5, and nothing else. W2 is eligible on the C-seed-badname
       pages as it has been since WP2, but a use is counted only where it hides a difference, and
       before M9 the new page's parse throws there as the old page's does.
     - The S scenarios ran as `live --tier quick --security` for the 7 configurator providers
       (decision 163). `--security` is the default since decision 162; it is given because the
       gate names it, and it changes nothing. The S pages do not depend on the tier:
       `scenarios.generate` makes S-benign and S-break as E0/O0/I0 pages with the quick ranges in
       every tier, and on a synthetic probe it gives the same two pages, seeds and actions for
       quick, full and exhaustive (scratch check). So that run is the full tier's S check too,
       and the full compare's note ("live --tier full runs them") needs no full-tier live run.
     - "Injection smoke green on every page with fixtures": in `dist/` only the custom app has
       `testing.fixtures`, so `node test/smoke/injection.js` runs its hostile workbook alone. The
       configurator payloads need a statement-app page with fixtures, which only the synthetic
       tree has (decision 131): `injection.test.js` runs the smoke on it in `npm run unit`, and a
       scratch run of the same `runInjection` on a fresh synthetic tree printed its counts. The
       payloads are the S scenarios' own (`SECURITY_PAYLOADS.benign` and `.breaking` equal the
       smoke's `NAME` and `KIND`), so the 7 configurator pages of `dist/` take them on the real
       statements in S-benign and S-break.
     - "The M7 harness on all 8 real-statement folders" is G6's command list: `node
       test/harness/run.js --provider <id> --browser` once per provider, in M7's order, on the
       folder the user config names, with its private declarations (none, decision 149).
     - Beyond the gate's list, one sensitivity run of the S-break checks on the pre-M8 page, as
       the WP13 entry made it: a scratch copy of the M7 commit's `dist/versa/index.html` (from
       `git show`), never `dist/`.
     - Every gate command passed at its first attempt, so there was no mismatch to diagnose and
       nothing to fix.

Decisions of the parse-error step (WP14, M9: `core/app/statement-app.js`,
`test/smoke/parse-error.js` and its injected piece `test/smoke/inject/throw-on-marker.js`, the W2
listing and W2's leftover rule in the golden harness, and their unit tests):

165. **`recompute()` catches the parse, and the error line comes last** (design §2.10, §3.12).
     - The reference app's :85 stands inside `try`, one level deeper, so a throw leaves
       `state.result` as it was: the assignment never happens. The catch sets `state.parseError`
       to `e && e.message ? e.message : String(e)` (addFiles' expression for a reader failure,
       :76), renders the status alone and returns, so the cards, the range, the configurator and
       the diagnostics stay as the previous result drew them. On success `state.parseError =
       null`, then `fillRange` and `render` as before; Clear takes that path with no statements,
       so it removes the line too. The state object gains `parseError: null`.
     - `renderStatus` treats `!r && !state.failed.length && !state.parseError` as empty and adds
       `Could not read these statements: <message>` as its last warn line: the design says the
       core "adds" it, and the kept result's lines then come first, as the old page printed them.
       The line stays on every render (a mode, a range) until a recompute succeeds. The message
       is interpolated in `html` like any other value, so it is escaped.
     - `addFiles` is unchanged: `recompute` returns, so `setBusy(null)` runs. A configurator
       change whose parse throws shows the line the same way, and nothing throws out of its
       listener.
     - Only `parseStatements` is guarded, as the design scopes it: an exception while a result is
       drawn (a malformed result) still escapes, and the busy line stays (decision 169 relies on
       that).
     - The derivation map's counts, with decision 126's exact longest common subsequence against
       the reference app's blob at legacyHead: :85 left the verbatim lines and none joined, so 171
       of the 414 non-blank lines stand verbatim in their order (191 counting blank lines), down
       from 172 (192). The derivation map row and decision 110 are amended.
166. **`statement-app.test.js` compares the behaviour M9 intends** (as decision 159 did for M8).
     - The stub parser's throw on a non-string name never ran: a script's stored config depends
       on its seed alone, and none of the 8 seeds draws `{<p0>: {name: 5}}` (one of 19 config
       seeds; scratch check). A scratch count found no throwing parse in the 56 runs; the logs'
       throw entries were click handlers that run without a result and configurator changes
       written into a stored `5`, the same on both sides. So the differential passed on the M9
       app unchanged, and could never see the catch.
     - Every script now ends with an M9 phase: Clear, every statement file, then `zz-throws.pdf`,
       on which the stub parser throws a TypeError whose message holds markup and quotes;
       downloads, a mode, a range, a configurator change (which parses again and throws again)
       and downloads; Clear; then `zz-throws.pdf` alone, without a previous result, a mode, and
       Clear. The file takes no draw from the generator, so the universes and every earlier log
       entry are those of WP13's scripts. Both throwing loads come by a drop, whose listener
       returns the load's promise: a throw that escapes the app (a mutant's) is logged as a
       `throw` entry instead of being left unhandled, which node:test would charge to the test.
     - The old side runs with `M9_EDIT`: the design's M9 rule applied to its app.js as three swaps
       of lines that all seven old apps hold verbatim (:85 into the try and catch, the
       empty-status test, and the error line before the status assignment), each asserted to
       occur once. The logs must stay identical, the throws included: 7 apps, 56 runs, 92,331
       log entries, 8,906 downloads and 621 parses, 168 of them throwing (3 per run, the same
       calls on both sides), 0 differences. A scratch run without `M9_EDIT` differs in all 56
       runs, the first at entry 2,048 of 2,336 of the first app's first seed (the old app's
       throw out of the drop, where the statement app writes the status).
     - Three more sensitivity mutants, each caught for all 7 apps: the catch removed (WP13's
       `recompute`), the error line never removed (no `state.parseError = null`), and the
       previous result dropped on the error.
167. **The parse-error smoke, made concrete** (`test/smoke/parse-error.js`, design §6.5; amended
     by decision 178: nothing to check fails, and a synthetic skeleton runs until M12).
     - Discovery takes the first skeleton, in folder order, with a statement app whose inputs
       include csv and that has `testing.fixtures`. "With a statement app" is added to the
       design's rule: the injected piece wraps `parseStatements`, which a custom app's parser
       need not have, and the catch is the statement app's.
     - The page is built by the build's own `run` with `--root <tree> --include-skeletons --only
       <id> --inject <tree>/test/smoke/inject/throw-on-marker.js --out <tmp>`, so the CLI's
       guards apply and the piece is the tree's own file.
     - The piece replaces the parser global by a copy whose `parseStatements` throws `new
       Error("injected failure")` when a statement id contains THROW, and otherwise calls the
       parser's own function with the same `this` and arguments.
     - The checks, beyond the design's words: after the fixtures, `#results` with a card and at
       least one download in list A; after THROW.csv (a copy of the spec's first CSV fixture
       outside `expectErrors`, through the picker), the warn line exactly once, `#status` without
       it equal to before, and the cards, the range (options, values, disabled), the
       configurator and its count, the diagnostics, `#results` and `#empty` unchanged; the second
       list equal to A record by record, zip entries included; after Clear, `#status` empty. No
       console error, page error or CSP violation in the page instance.
     - A tree without such a skeleton has nothing to check: the smoke says so and exits 0. That
       is this repository until M12 brings the CSV template (WP12). Until then the smoke's CI half
       runs in `npm run unit` on the synthetic tree's skeleton (decision 168), as decision 164 did
       for the injection smoke's configurator half; on the real pages its local half is golden
       C-seed-badname, with W2.
     - `package.json`'s `smoke` script appends `node test/smoke/parse-error.js` (decision 2).
168. **`test/unit/parse-error.test.js` is a new unit file** (not in the design §6.4 list, like
     decisions 48, 57, 71, 82 and 160), and the synthetic tree byte-copies the injected piece,
     since `--inject` takes a file under the tree's own `test/`.
     - Without Chrome: discovery finds the CSV skeleton, skips a PDF skeleton and a custom app on
       CSV that sort before it, and finds nothing once the skeleton has no fixtures (the
       published CSV providers with fixtures never count); a tree without the skeleton has
       nothing to check and needs no browser; providers that do not validate are a problem;
       `parseArgs`.
     - In Chrome: the synthetic tree passes (its skeleton keeps 5 downloads through the error),
       and every check has a failing sample: the catch removed (the busy line, no error line,
       the page errors), the previous result dropped (the cards, the range, the configurator,
       `#results`, `#empty`, the status and the downloads), no error line, a line that Clear
       keeps, an injected piece that never throws or is missing, fixtures without a CSV to copy,
       and Chrome missing (a failure, never a skip). 11 tests, 3 s.
     - Amended by decision 178: a tree without the skeleton fails, and the fallback to a
       synthetic tree has its test (12 tests).
169. **H12's busy-page samples return a result the app cannot draw** (`test/unit/harness.test.js`,
     decision 152). They made the CSV parser throw on a full batch with the bogus file, and the
     skeleton's parser throw on every batch, so that the page stayed busy. Since M9 the app
     catches both and clears the busy line, so the sample failed in another way. Both parsers
     now return `{months: null}` instead: `fillRange` throws outside the catch, the load's
     promise rejects, and the page stays busy as before. H12 is unchanged.
170. **The golden report lists every W2 use** (design §6.7.6: "every use is listed in the
     report"; decision 44 counted them, and before M9 there was none).
     - `compareStep` returns the parts W2 covered on the step: "busy line" (the settle state stuck
       against idle, or `busyHidden` and `busyText`) and "error line" (the status line removed on
       the throwing step); `PageComparison` passes them on with each W2 use.
     - Each environment's report entry gets `w2: [{page, step, parts}]`, and the console prints
       one line per page: `W2 <page>: <n> steps, the error line on <steps>, the busy line on
       <n>`. Page ids and step keys hold indexes only.
     - Where W2 may apply is unchanged, and so is what it removes but for decision 171.
       `golden.test.js` asserts the parts and the listing, and that a new page that throws like the
       old one uses no waiver.
171. **W2's leftover paragraph counts only after its line** (`test/golden/waivers.js`, design
     §6.7.6; decision 44 says "an empty count paragraph left over").
     - `stripW2Status` removed the error line and then read a status of exactly `<p></p>` as the
       old page's empty status, whether or not a line had been removed. A sensitivity page, the
       M9 versa page without the error line (scratch, in `<private-dir>`), therefore passed
       `compare --tier quick --providers versa`, and the listing of decision 170 credited it with
       the error line on `@load1`.
     - The paragraph now counts as left over only when the line was removed. That page fails with
       a `ui.status` mismatch on `@load1` and is listed with "the error line on none"; the "error
       line" part is set exactly when the line was there.
     - For the M9 pages nothing changes: their throwing step always shows the line. The first
       golden pass (with the listing, before this change) and the second (on the final files)
       give the same results (the WP14 entry). `golden.test.js` holds both samples.
172. **How WP14's golden runs read W2** (design §6.7.6, §8.1 M9; decision 177 makes this reading
     a requirement of the harness).
     - The runs are `compare --tier quick` and `compare --tier full` against the stored goldens
       (all 8), and `live --tier quick` for the 7 configurator providers, which captures each old
       page in the same run, so it compares C-seed-badname and S-benign afresh and runs S-break on
       the new page alone (decisions 162, 163). The canary and replay runs follow the WP13 entry;
       they never reach the code decision 171 changed (canary pages are C0 pages, where W2 does
       not apply, and replay compares downloads only), so they ran once.
     - "W2 exactly in C-seed-badname on all 7 statement apps (the busy line and the error line)"
       is read from the listing of decision 170: every W2 use is on one of the seven
       C-seed-badname pages, and each of them lists `@load1` (where the old page threw) with both
       parts, then `@reset` and the mode and range steps with the busy line alone, since the old
       page's busy line stays stuck. W2's eligibility alone keeps it off every other page; the
       listing shows that it is used on each of the seven, in both parts.
     - "Downloads and storage identical, before and after the reset": 0 mismatches of any
       category on those pages. From the stored goldens (scratch, counts only), `@load1` has no
       download on the old page (no results) and keeps the seeded config string, and from
       `@reset` on, the steps store `{}` and hold downloads, in each tier.
     - Sensitivity, beyond the list (decision 171): the WP13 versa page (`552493b37237ec8f`, the
       WP13 entry's) is identical with no W2 use, since it throws as the old page does; the M9
       versa page without the error line fails on `@load1`'s status.

Decisions of the M9 gate (G8; no file but this one changed):

173. **How G8's parts were run** (design §8.1 M9; decisions 177 and 178 put the scratch reader's
     W2 requirement into the harness and make the parse-error smoke check the catch).
     - The golden tiers are `compare --tier quick` and `compare --tier full` against the stored
       goldens, all 8 in one run each (decisions 163, 172). "Identical apart from W2" is read from
       the reports: 0 mismatches of any category, W1 and W3 as in G5, W2 as below, and no other
       waiver.
     - "W2 exactly in C-seed-badname on all 7 statement apps (the busy line and the error line)"
       is read from the listing of decision 170, as decision 172 reads it, and a scratch reader
       checks the listing against the stored goldens: every W2 use is on one of the seven
       `<id>/E0/O0/I0/C-seed-badname` pages; each of them lists exactly its golden's steps from
       the one where the old page threw (`@load1`, its busy line stuck) on; `@load1` names both
       parts and every later step the busy line alone; each environment's W2 count equals its
       listing, and the custom app has none. The reader fails on six edited copies of a WP14 report
       (a use moved to another page, `@load1` without the error line, a later step with it, a use
       dropped, a mismatch added, a use on the custom app; written to `<private-dir>/tmp` and
       removed) and on WP14's two sensitivity reports (decision 172: the pre-M9 page, which uses no
       W2, and the page without the error line).
     - "Downloads and storage identical, before and after the reset": on a W2 step the comparison
       leaves out only the busy line (the two busy fields of the UI snapshot, and on the throwing
       step the settle state, stuck against idle) and, on the throwing step, the error line, while
       `compareStep` compares every step's records and stored strings whatever waiver applies; so
       0 mismatches on those pages is that identity. From the stored goldens the reader adds what
       the steps hold: before the reset (`@open`, `@load1`) no download and the seeded config
       string; from the reset on, `{}` and downloads, in each tier.
     - The S scenarios belong to the quick tier since M8, and the stored goldens hold none
       (decision 163), so the gate also ran `live --tier quick --security` for the 7 configurator
       providers, as WP14 did (decision 172). It checks S-benign and S-break on the M9 pages and
       compares C-seed-badname with a fresh capture of each old page.
     - "CI parse-error smoke green": `node test/smoke/parse-error.js` has nothing to check in this
       repository until M12 brings the CSV template, and says so with exit 0 (decision 167). Its
       CI half is `parse-error.test.js` in `npm run unit` (decision 168), and a scratch run of the
       same `runParseError` on a fresh synthetic tree printed its counts. That tree's statement
       app and injected piece are byte copies of the repository's files (the run compares their
       hashes), so the smoke drives the statement app of the seven pages.
     - "The injection smoke still green" is read as decision 164 reads it: `node
       test/smoke/injection.js` on `dist/` (the custom app's hostile workbook), and a scratch run
       of the same `runInjection` on a fresh synthetic tree for the configurator payloads, which
       `injection.test.js` also runs in `npm run unit`.
     - "The M7 harness on all 8 real-statement folders" is G6's command list (decision 164).
     - Beyond the gate's list, one sensitivity run of the W2 reading on the pre-M9 versa page (the
       WP13 entry's `552493b37237ec8f`; a scratch copy in `<private-dir>/tmp`, never `dist/`):
       `compare` alone passes it, so the listing is what tells a page without the catch apart.
     - Every gate command passed at its first attempt, so there was no mismatch to diagnose and
       nothing to fix.

Decisions of the M8/M9 review fixes (stage D2: `test/lint/sinks.js`, `core/contract/callgraph.js`,
`test/smoke/injection.js`, `test/smoke/parse-error.js`, `test/golden/compare.js`,
`test/golden/run.js`, `test/golden/waivers.js` (a comment), `test/unit/synthetic-tree.js`, their
unit tests and `core/README.md`; no page code changed):

174. **The sinks lint reads a banned name in every form the code can write it** (finding
     sinks-forms; amends decisions 130 and 158).
     - The innerHTML rule caught four forms (`.innerHTML =`, `+=`, a bare name, a plain string
       key). It missed `||=`, `&&=`, `??=`, destructuring and for-of targets, escaped identifiers,
       escaped or concatenated keys and the same forms of outerHTML, and the markup sinks outside
       its list (`execCommand("insertHTML")`, `srcdoc`, `setAttribute("onclick", s)`, `write` on an
       alias of `document`). The review's `[$("#cards").innerHTML] = [...]` passed the lint.
     - Now every identifier `innerHTML` in the code counts outside `setHtml`, wherever it stands
       (a member read or written, a key, a binding): reads too, since page code never reads markup
       back. That one rule covers the assignment operators, destructuring and for-of targets.
       `outerHTML` is banned the same way everywhere.
     - The other names, each banned in every form (`NAMES`): eval, fetch, XMLHttpRequest,
       WebSocket, sendBeacon, importScripts, outerHTML, insertAdjacentHTML, setHTML, setHTMLUnsafe,
       parseHTMLUnsafe, createContextualFragment, parseFromString, srcdoc, execCommand, write,
       writeln, setAttributeNode(NS), createAttribute(NS), getRandomValues and randomUUID. A name
       counts as an identifier anywhere (`const d = document; d.write(s)`, `(0, eval)(s)`, `const {
       fetch } = self`) and as a constant string with that value (a computed key).
     - A constant string is a literal read as JavaScript reads it, every escape decoded (`\x`, `\u`,
       `\u{…}`, octal, line continuations, identity escapes such as `\H`), a template's parts with
       their cooked and raw values, and literals joined by `+` (with parentheses) folded, every run
       of a chain counted. So `el["inner\x48TML"]`, `el["inner" + "HTML"]` and `document["wr" +
       "ite"]` fail.
     - A new rule, `escape`: outside literals and comments a backslash can only start an escaped
       identifier (`el.inner\u0048TML`), which could hide any name; page code needs none.
     - `setAttribute` and `setAttributeNS` only as a call whose name argument is a constant string
       not starting with "on" (any case): an event handler, or a name the lint cannot read, fails,
       and so does the method taken without a call or by a computed key. The global `Function`
       fails anywhere (`Function(s)` without new too), and `setTimeout` or `setInterval` with a
       string to run. These go beyond the finding's list, as decision 130 did, with the computed
       keys of the network and eval names and the markup names `setHTML`,
       `setAttributeNode(NS)` and `createAttribute(NS)`.
     - `blank()` (`core/contract/callgraph.js`, Node only, never inlined) takes an `onLiteral`
       callback that reports each string, template part and regex literal with its span; its
       output is unchanged (a test asserts it), and the lint reads the literals through it, so
       there is one tokenizer. Every single-name pattern of `BANNED` (`eval(`, `fetch(`,
       `document.write`, `.outerHTML =`, the markup parsers, the randomness calls) moved to the
       name rule; `BANNED` keeps `new Function` and the clock and random member calls.
     - Out of a lint's reach, as its header says: a name put together at run time (a variable, a
       call such as `String.fromCharCode` or `join`, a regex's source). The injection smoke checks
       the renders' effect (decision 175).
     - The tree has no finding of any rule. The review's 23 probes are all caught (4 before),
       and so are 41 scratch probes with the review's list and more (none missed); 10 probes of
       safe code (a constant attribute name, `writeFileSync`, escapes in strings and regexes)
       stay clean. The `#cards` render written as `[$("#cards").innerHTML] = […]` gives 1
       innerHTML finding and exit 1 (0 and exit 0 before).
     - `lint.test.js` gives each new rule failing and passing samples (33 tests, 6 new); the
       samples that read `innerHTML` or `outerHTML` moved from the passing to the failing side.
       `callgraph.test.js` checks the callback (6 tests, 1 new).
175. **Payloads reach the diagnostics, and the injection smoke checks every render target**
     (finding diagnostics-payloads; amends decisions 160 and 161).
     - No payload printed in `#diagnostics`: the synthetic parsers returned no skipped row and
       p0's account had no gap, late or closed row. A diagnostics render without escaping passed
       every CI check, since `statement-app.test.js` is skipped without the old repositories.
     - The synthetic PDF provider: a row "<date>  <description>" without an amount is a skipped
       row of category "no amount", its description the detail and the account's label the
       owner, as the real parsers fill owners. Its fixtures add `statement-2026-04.pdf`: March is
       missing and April opens above February's close, so p0's account has a gap row, which the
       diagnostics list under the account's name (the seeded name on the payload page); its first
       opening already put the name in the status. `fixtures/hostile.js` now holds two
       statements, March and May with April missing (a gap row that prints the markup currency),
       and May lists a row without an amount whose description is `<b
       onmouseover="window.__pwned=1">Pending</b>`, which the rows not exported print.
     - The smoke's render targets are `#cards`, `#config-list`, `#status` and `#diagnostics`; a
       target's text includes its form fields' values (the configurator's name field). A
       `hostile.js` must reach every target its page has, in some state, or the smoke reports the
       render it leaves unexercised. A full run (or `coverage: true`) also needs every target that
       some payload page has to show a payload on some page; a run restricted with `--provider`
       prints its coverage as a note. Each provider reports the targets each payload reached, and
       the run its coverage.
     - p0's card buttons must carry the seeded name as `data-account`, which Download all's scan
       reads back (decision 176).
     - On the synthetic tree the PDF provider's two payloads both reach all four targets; the
       other statement-app pages show the seeded name on p0's card and in its configurator row.
       On `dist/` the custom app's hostile currency reaches `#cards`, `#status` and
       `#diagnostics` (its page has no configurator): coverage holds there too.
     - `injection.test.js` (9 tests, 3 new): the full tree asserts the targets and the coverage;
       a diagnostics render that bypasses escaping (the review's mutant) fails through both
       payloads, the seeded name in the gap row and the hostile currency and description, while
       no problem names the cards, the configurator or the status; a `hostile.js` without the gap
       and the skipped row misses `#diagnostics`; a coverage run of one configurator page without
       a hostile file misses `#status` and `#diagnostics`. `harness.test.js` counts the PDF
       dump's 12 files (4 PDFs, was 3), the one other test that counted these fixtures.
     - The review's experiment, rerun on a scratch copy of the tree with the old repositories out
       of reach (`S2C_OLD_ROOT` an empty folder, as in CI): see decision 179.
176. **Names an attribute cannot carry: a reviewed exception, scheduled with D3** (finding
     data-account-roundtrip; amends decision 64).
     - The cards' buttons and Download all key accounts by `data-account`, the configurator's rows
       by `data-id`, and both read the value back through the HTML parser, which turns CR (and
       CRLF) into LF and NUL into U+FFFD (decision 64). For such a name `fileFor` throws (a page
       error), the card's buttons and the whole Download all give nothing, and Download all is not
       `allFiles()`; a configurator change is stored under a key the parser never reads. The old
       pages behave the same way.
     - Not changed in v1. The review's fix (an index into `F.cards()` for the buttons, `#zip` from
       `allFiles()`, configurator rows by index) changes the cards' and the configurator's markup
       on every page, which the golden UI snapshot compares, and its `#zip` half is D3 (design
       §10, opt-in after G12 with the user's approval); M8 and M9 may add no waiver. The new page
       keeps the old pages' behaviour for these names, so neither a golden nor a waiver changes.
     - The claim, narrowed: SX1's "Download all = `allFiles()`" (design §3.12, §6.7.6) and D3's
       "identical" hold for account names and portfolio ids that an attribute value gives back:
       every UTF-16 code unit but CR and NUL. `test/golden/waivers.js` (the SX1 comment) and the
       injection smoke's header say so. When D3 is taken up it changes downloads for such names
       (their files appear in Download all) and needs index keys for their buttons to work at
       all, so its row must list that difference instead of "identical".
     - Where such a name can come from: a hand edit of the stored config or another page on the
       origin (SX1's threat), or statement text; the configurator cannot write a CR (an `<input>`
       strips line breaks). No scenario holds one: the 48 stored golden manifests' distinct account
       and card values hold no CR or NUL (scratch count), and on the real statements H12 found every
       page's Download all equal to `allFiles()` (G8: 0 mismatches), which such a name would break.
     - `injection.test.js` pins the boundary in Chrome: every UTF-16 code unit, written as the
       apps write `data-account` (`esc` between double quotes), comes back unchanged but NUL
       (U+FFFD) and CR (LF), CRLF reads as LF, and the smoke's payloads come back exactly. The
       smoke checks p0's buttons (decision 175).
177. **The golden harness requires W2 where the old page threw** (finding
     parse-error-requirement, first part; amends decisions 172 and 173).
     - G8's "W2 with the busy line and the error line on all 7" was read by an untracked scratch
       reader (decision 173): `compare` alone passed a page without the catch (it throws as the
       old page does, so no waiver applies), and one with the catch but no error line.
     - `PageComparison` takes `w2Required`. On a page where W2 applies and the old page threw,
       every step from the throw on must list the parts of `w2Needs`: the error line on the
       throwing step, and the busy line wherever the old page's busy line shows (stuck from the
       throwing load on, so on every later step), since the new page clears it. A step without
       them is a `w2` mismatch (`w2.throwing` or `w2.after`), and a step the new page never
       reached lacks them all. `finish` returns the page's `w2Check` (`{page, steps, ok}`).
     - `run.js` asks for it on every app but a known custom one (`comparisonCtx`; the 48 stored
       manifests all carry `facts.app`, and a custom app has no configurator, so no
       C-seed-badname page). `compare` and `live` report each environment's `w2Check` (`{pages,
       ok, failed}`) and print `W2 required on 1 page whose old page threw: 1 with the error line
       on the throwing step and the busy line wherever the old page's stuck one shows`.
     - The harness holds the requirement from now on (M9 is done): a page without M9's catch, or
       without its error line, fails `compare` itself (decision 179's sensitivity runs). The
       listing of decision 170 stays.
     - `golden.test.js` (28 tests, 1 new): the M9 page passes with its check; a page that throws
       as the old one does fails on each of the sample's 3 W2 steps; so do a catch without the
       error line, the busy line left stuck after the throw, the busy line stuck on the throwing
       step and a step never reached; nothing is required where W2 does not apply, where the old
       page never threw, or in determinism; `comparisonCtx` and the summary line.
178. **The parse-error smoke fails when it checks nothing, and runs on a synthetic skeleton until
     M12** (finding parse-error-requirement, second part; amends decisions 167, 168 and 173).
     - A tree without a skeleton that has a statement app, csv inputs and `testing.fixtures` is a
       problem now ("nothing to check, which fails"), never an exit 0.
     - Without `--root` (`npm run smoke`) the tree is this repository, which has no such skeleton
       until M12 brings the CSV template. Until then the smoke builds a fresh synthetic tree
       (`test/unit/synthetic-tree.js`), checks that its statement app and injected piece are byte
       copies of this repository's (it prints their hashes) and runs on its skeleton, so `npm run
       smoke` drives the statement app's catch in CI. Once this repository has the skeleton,
       discovery finds it and the synthetic tree is never used. With `--root` there is no
       fallback.
     - `parse-error.test.js` (12 tests, 1 new): a tree without the skeleton fails without a
       browser; with the fallback it runs on a fresh synthetic tree's skeleton and passes;
       `parseArgs` gives the fallback without `--root` only.
179. **How the stage D2 fixes' gates were run.**
     - No page changed, so the golden runs check the harness's new requirement (decision 177) on
       the M9 pages: `compare --tier quick` for all 8 against the stored goldens, and `live --tier
       quick --security` for the 7 configurator providers (S-benign, S-break, and C-seed-badname
       against a fresh capture of each old page), between two baselines, one after another in one
       script. The full tier was not rerun: no page changed since G8's full run, and the
       requirement reads the C-seed-badname pages, the same scenario with the same steps in both
       tiers (decision 172).
     - Beyond that list, three sensitivity runs of the requirement, `compare --tier quick
       --providers versa --page <scratch>` on pages in `<private-dir>/tmp`, never `dist/`: the WP13
       versa page (`552493b37237ec8f`, before M9's catch; `compare` passed it at G8), the M9 versa
       page with its catch removed (`43602d08529962a5`, the review's mutant, rebuilt from a copy of
       the tree) and the M9 versa page without the error line (`abcaaec9ee1309a8`, WP14's, rebuilt
       the same way). Each must now fail on C-seed-badname with `w2` mismatches, and nowhere else.
     - The review's experiments ran again on a scratch copy of the tree (never this repository),
       with the old repositories out of reach (`S2C_OLD_ROOT` an empty folder, as in CI): lint,
       build check, contract, unit, the harness on the fixtures and the smokes, once per mutant.
     - The standing matrix ran after the golden runs (it uses Chrome too), `npm run unit` also
       without Chrome and the old repositories, and a scratch run printed the counts of the
       injection and parse-error smokes on a fresh synthetic tree.

Decisions of the CSP step (WP15, M10: `build/csp.js`, `build/build.js`, an option in
`test/smoke/pages.js` and `test/smoke/injection.js`, the unit tests `csp.test.js`, `build.test.js`
and `injection.test.js`, and the nine pages):

180. **Hash mode is the default, and the style stays hashed** (design §5.5, §8.1 M10).
     `build/csp.js` sets `DEFAULT_CSP_MODE = "hash"`. `STYLE_POLICY` was `"hash"` already and stays
     so, since G9 found no `style-src` violation (decision 187).
     - Every tool that builds a page takes the default: `node build/build.js` and `--check`, C14,
       the smokes' and the harness's temporary builds, the canaries and the parse-error smoke's
       injected build (piece 12b is hashed like any other piece). `--csp legacy` still builds the
       old strings, and the tests use it.
     - In `dist/` only the CSP meta changed. Scratch check: each hash-mode page equals the `--csp
       legacy` build of the same tree with the meta's content swapped (9 files), and that legacy
       build equals G8's pages byte for byte.
     - A provider page lists one hash per executable piece: 12 on chocolate, maribank, maybank,
       moomoo and versa, 13 on posb (its CSV reader), 11 on stashaway (no core layout) and on the
       custom app (no pdf.js). Then come `blob:` and `worker-src blob:` on the seven PDF pages, the
       style hash, `img-src data: blob:`, `connect-src blob: data:`, `form-action 'none'` and
       `base-uri 'none'`. The landing page has `default-src 'none'; style-src <hash>`.
181. **`verify` rebuilds the policy from the page** (WP15's "verify extended"; amends decision 19;
     amended by decision 207: in hash mode it also reads the listing from the page alone).
     - Before M10, `verify` asked that every executable script's hash be listed in `script-src`,
       and the style's in `style-src` unless that held `'unsafe-inline'`. A stale hash, an extra
       source or directive, a repeated directive, or `'unsafe-inline'` beside the style hash
       passed.
     - Now it computes the policy the page must carry with `policy()` (for the landing page,
       `landingPolicy()`) from the page itself: its `<script>` elements as the browser runs them
       (all but those whose type is not JavaScript, so the worker's `text/plain` element is never
       hashed) and its one `<style>`, under the style policy it is given (`stylePolicy`, default
       `STYLE_POLICY`). The emitted policy must equal it as a string, so every inline script and
       the style are listed, and nothing else is.
     - The problems name the difference: an executable script that is not listed; a hash that is
       no script's (a stale one, the worker text's) or not the style's; sources out of order or
       repeated; a directive missing, added or repeated (the browser uses the first); a source
       added or dropped; `'unsafe-inline'` in `script-src`, or in `style-src` while the style
       policy is `hash`; a style hash where the fallback wants `'unsafe-inline'`. In legacy mode
       the same comparison pins the exact old strings.
     - `policy()` and `landingPolicy()` refuse an unknown style policy; before, anything but
       `"unsafe-inline"` was read as `"hash"`.
182. **The browser hashes the text the build hashed, under a policy in force** (WP15).
     - Three page-wide checks: no CR (the HTML parser turns CR and CRLF into LF before a script or
       the style is hashed), no NUL (replaced in script and style text), and `<meta
       charset="utf-8">` within the first 1024 bytes, where the encoding prescan looks (another
       decoding would hash other text). The guards of `build/scripts.js` keep CR and NUL out of
       every piece already; these checks cover the skeleton and the page copy around them.
     - Exactly one `<style>`: the text the style hash covers.
     - The CSP meta lies inside `<head>`, since a policy meta anywhere else is ignored (Chrome logs
       that it ignored it), and a page with no policy in force shows no violation at all, which
       would empty G9's zero count of meaning. It comes before every script, as before, and since
       the WP15 entry's last change also before the `<style>`: a meta policy governs only what
       follows it.
     - `csp.test.js` pins these claims in Chrome (decision 184).
183. **The landing page is verified** (`verifyLanding` in `build/csp.js`; `buildLanding` in
     `build/build.js`, which the build uses for `dist/index.html`): no script, exactly the landing
     policy for its style, one CSP meta in `<head>` before the style, the page-wide checks and the
     markup rules (no inline handler; no style attribute in hash mode). Before M10 it was rendered
     unchecked; `test/smoke/pages.js` compared it with a fresh render and opened it in Chrome.
184. **The unit tests** (design §6.4: CSP hashes match the inlined text; `verify` catches each
     defect; amended by decisions 207 and 208, which bring `csp.test.js` to 13 tests).
     - `csp.test.js` (5 → 9 tests): the defaults; the legacy strings; the hash policy; each mode's
       defects, each mutation with its own message; the style-policy fallback (a page with
       `'unsafe-inline'` for its style passes under it and fails under `hash`, and style attributes
       stay refused); sources re-read from disk in both modes; the landing page in both modes,
       with its own defects.
     - In Chrome (skipped without it): the stub tree's three provider pages, built in hash mode
       with an injected piece, run every script (each sets its global) with the style applied and
       no violation, and so does the landing page. Defects that `verify` reports are blocked by
       Chrome with the violation they name: the style edited after hashing (`style-src-elem`, the
       style not applied), the parser edited after hashing (`script-src-elem`, its global
       missing), a style attribute (`style-src-attr`) and an inline handler (`script-src-attr`, the
       handler not run). A policy meta moved into `<body>` is not in force: the edited parser runs
       with no violation, and `verify` reports the meta; a meta after the `<style>` does not
       govern it either. With the fallback's `style-src 'unsafe-inline'` a style attribute causes
       no violation.
     - `build.test.js` (18 → 20 tests): hash mode is the default (`--csp hash` changes nothing,
       one hash per executable piece plus the style's, and the landing page passes
       `verifyLanding`); `--csp legacy` gives the old strings, and its pages verify in legacy mode
       and fail in hash mode; a style attribute, a script or an inline handler in `landing.html`
       stops the build (the style attribute in hash mode only).
185. **The injection smoke under the hash policy** (amends decision 160, whose "a payload that
     became markup would run" holds for the legacy policy).
     - The policy has no `'unsafe-inline'` for scripts, so Chrome blocks every inline handler a
       payload brings and reports a `script-src-attr` violation. `window.__pwned` can no longer be
       set that way; the smoke fails on the violation, the new elements and the `on*` attributes
       instead. The two failing samples that bypass escaping (`injection.test.js`) now assert the
       violation and that no payload ran.
     - "A payload ran" keeps its failing samples: the same mutants built with `--csp legacy` and
       smoked with `csp: "legacy"`, where the handlers run. `csp` is a new option of
       `runInjection`, passed to `pageTargets` (`test/smoke/pages.js`), which builds and compares
       the pages in that mode; the default stays `DEFAULT_CSP_MODE`.
     - The smoke's header says so. On the real pages, the injection smoke on `dist/` and the S
       scenarios check the payloads under the hash policy (G9).
186. **The extraction page keeps the legacy PDF policy** (decision 72). It is a test page, never
     published, and its cache key covers its HTML, so another policy would re-key the whole
     extraction cache for no gain: reading does not depend on the mode while `blob:` scripts may
     run, and G9 reads every statement on the hash-mode pages themselves.

Decisions of the M10 gate (G9):

187. **How G9's parts were run, and D10** (design §8.1 M10, §10 D10).
     - "Zero `securitypolicyviolation` in smoke": `npm run smoke` on the hash-mode `dist/`. Each
       of the four smokes fails a page instance on any violation in its capture log; the pages
       smoke opens every page and the landing page.
     - "In golden quick and full for all 8": `compare --tier quick` and `--tier full` against the
       stored goldens, all 8 in one run each. `compare` fails a new page instance on any CSP
       violation in its log (`comparePageErrors`, category `errors`, reloads included), and Chrome
       also prints each violation as a console error, which fails it again. So 0 mismatches is 0
       violations on every new page instance of the tier, and "downloads identical" is the same 0
       mismatches.
     - The S scenarios belong to the quick tier since M8, and the stored goldens hold none
       (decision 163), so the gate also ran `live --tier quick --security` for the 7 configurator
       providers, as G8 did. Under the hash policy a payload that became markup would show as a
       `script-src-attr` violation (decision 185), and S-break allows none.
     - Beyond the gate's list: the real-statement harness (G6's commands), whose H12 opens the
       pages on http (decision 145), where pdf.js runs its real worker from the `blob:` URL under
       `worker-src blob:`, as the deployed pages will; `canary --provider versa` (G1b on hash-mode
       canary builds); and one sensitivity run, a `style-src` violation on a real page: a scratch
       copy of the versa page with one byte added to its `<style>` text must fail `compare` on its
       violations alone.
     - D10: no `style-src` violation appeared in any run, so `STYLE_POLICY` stays `"hash"`, and
       D10's first half (hash the style after a fallback) has nothing to do. Its second half (drop
       `blob:` from `script-src` once pdf.js never uses its fake worker) stays deferred: on
       `file://` pdf.js takes its fallback on every PDF page (decision 30), and the fallback loads
       the worker source as a `blob:` script. Two scratch experiments on synthetic data (one
       synthetic PDF, `<private-dir>/tmp`, removed afterwards) showed it. Served on http as H12
       serves it, the versa page started pdf.js's worker and logged no fallback; from `file://` it
       logged the fallback once and read the PDF through it; 0 violations either way. A copy
       without `blob:` in `script-src`, from `file://`, logged one `script-src-elem` violation for
       the blob script and failed with a fake-worker error.

Decisions of the storage-compatibility step (WP16, M11: `test/storage-compat/run.js`, its three
injected pieces in `test/storage-compat/inject/` and the unit tests
`test/unit/storage-compat.test.js`):

188. **The run on one origin, made concrete** (`test/storage-compat/run.js`, design §6.8).
     - `test/lib/serve.js` (WP0, unchanged) serves design §6.8's allowlist for the providers
       under test, and one path more: `/storage-compat/observer.html`, a blank page without
       script that the run writes into its private temporary folder (decision 189). The pages
       open at their folder URLs, `/old/<legacyRepo>/` and `/new/<id>/`, as users open them.
     - One browser context holds the whole run (E0, the frozen clock, no seed), like one user's
       browser on the deployed site, where the old and the new pages share one origin. The
       providers run one after another in folder order, each with phase (a), then (b). A phase
       starts with the provider's own keys removed, as on a first visit, and every other key as
       the run left it.
     - The pages are served over http because storage must carry from one document to the next
       (decision 89: on `file://` the pinned Chrome now and then gives a document a storage area
       of its own).
     - The old pages are read from `<old-root>` and never written: serve.js reads each file on
       each request and builds no path from a request. Every invocation checks the old
       repositories before and after itself with `test/lib/baseline.js` (HEAD, the blobs,
       `legacyIndexSha256`, the file manifest and, unless `--no-live`, the live pages), as the
       golden harness does; a run on `dist/` first runs `build --check`.
     - The browser's temporary files go to `<private-dir>/tmp/<run>` (decision 40), the details to
       `<private-dir>/reports/<run>.json`. The console shows provider ids, counts, problem
       categories, step names, storage key names and mode ids (both from `frozen.js`) and a digest
       of the results, never a statement name, an account or a stored value.
189. **How the run sees the storage.**
     - An init script of the run's context (`storageHooks`) wraps `Storage.prototype.getItem`,
       `setItem`, `removeItem` and `clear` in every document before any page script, so each
       page's storage calls are logged in order, each read with the value it returned. The
       wrappers call the originals with the same arguments and return their results, so no page
       behaves otherwise, and only this run's context installs them.
     - After every step of a page (the open, the load, each configurator operation, the mode, the
       range, the downloads) the harness drains the log and reads all of localStorage in the same
       page with the original methods, unlogged. A change that no logged call explains, such as a
       write through a property, still shows in that read.
     - The reads come from the page that acted, because a document sees another document's
       writes only a moment later, when the browser passes them on. The observer page, open
       throughout, seeds the storage, resets it between phases and, after a page closes, must
       see what that page last showed (polled for up to 1 s); a page that wrote as it closed
       would fail there.
190. **What (a) and (b) compare** (design §6.8 items 2a and 2b).
     - The writer loads every statement of the provider's folder that its picker accepts, in JS
       string order and in one batch (a single-file picker takes the first), as the golden
       harness's I0 does. It records its configurator and downloads, then applies the golden
       harness's C-ui-combo operations, chosen by row index from its own probe (decision 37): p0
       renamed to the hostile name, the first non-investment row set to investment and the first
       investment row to cash, and, with two rows or more, a row merged into p0 (one of p0's
       currency, else p1) and the last row excluded. Then it picks the last mode of
       `frozen.modeValues` (the first is the default) and sets the full range.
     - The reader opens in the same context, loads the same statements and sets the full range.
     - The two must show the same UI snapshot (design §6.7.6 step 4): the configurator's rows and
       count, the mode buttons, the cards, the status, the diagnostics, the range and the
       toolbar, with W3 mapping a legacy configurator's ids and row class. W1 concerns the static
       snapshot, which this run does not take, and W2 a parse that throws, which no step here
       does. Both must show the mode the writer picked, and every download must be equal
       (`compareRecords`: name, MIME type, size, sha256 and zip entries).
     - The reader must have read exactly the string the writer left under each frozen key (null
       where it left none), and must change nothing: its one write, the mode it read at start-up
       (design §3.7), is the same string.
     - The comparison must be able to see the settings, or the phase is "vacuous": they must
       change the writer's configurator and downloads (without a configurator, the mode must
       change the downloads), the writer must not have shown the picked mode before, and the
       pages must offer a download. Merge and exclude need two rows, so with one row the settings
       are the rename and a kind; the custom app has no configurator, so its one setting is the
       mode.
191. **(c), the keys and one origin** (design §6.8 item 2c; the task's "keys unchanged" and "no
     cross-provider interference").
     - (c) holds for every storage call of a new page, the writer of (a) and the reader of (b):
       localStorage only (`c.area`); the provider's frozen keys only (`c.key` for a write or a
       removal, `c.read` for a read); never a removal or a clear (`c.remove`); mode values in
       `frozen.modeValues` (`c.mode`); and configs (`c.config`) that are JSON objects of ids the
       page detected, each a non-empty object with only `name` (a trimmed, non-empty string),
       `kind` (in `frozen.configKinds`, `""` excepted), `mergeInto` (another detected id) and
       `exclude: true`. No key may change without a logged call (`c.unlogged`).
     - Keys: the old and the new writer took the same steps and made the same storage calls with
       the same strings, and so did the two readers. With (c) this shows the keys and the strings
       unchanged: the new pages write what the old pages wrote, where they wrote it. The old
       pages' calls are held against `frozen.js` (`frozen`: a key, a removal or a mode value that
       `frozen.js` does not describe).
     - One origin: the storage starts with every frozen provider's keys (a non-default mode and
       an empty config each) and a key of an unrelated page on the same origin. A page that reads
       or changes another owner's key fails (`cross`), and at the end of the run every key must
       hold what its owner left.
     - With both pages open, the last writer wins, exactly as with two old tabs (design §6.8 item
       3, D9): `run.js` documents it and does not test it.
192. **The self-test fails on a renamed key** (`--self-test`; like the golden canaries, design
     §6.7.7).
     - Three mutants of the new pages, each a test-only piece in `test/storage-compat/inject/`
       built in with `build --inject` into the run's private folder, never `dist/`:
       `rename-config-key` appends `-renamed` to the runtime object's config key before the app
       reads it, `rename-mode-key` does the same to the mode key, and `clear-storage` clears
       localStorage as the page starts.
     - Each mutant runs on a site of its own against the real old pages, for every provider it
       applies to (the config key's rename skips the custom app, which has none). Each result
       must show every category the mutant requires and none it forbids (`MUTANTS` in `run.js`):
       - `rename-config-key`: `c.key` and `c.read` (the renamed key), `keys`, `b.read` (the new
         reader never reads the frozen key) and, with configurator rows, `a.config` and
         `b.config` (each reader shows the rows as detected); never a mode problem, `a.read` (the
         old reader reads the frozen key's absence, which is what the new writer left there),
         `cross` or `vacuous`;
       - `rename-mode-key`: `c.key`, `c.read`, `keys`, `a.mode`, `b.mode` and `b.read`; never a
         configurator problem;
       - `clear-storage`: `cross` and `c.remove` (the clear), `keys`, and in (b) `b.mode`,
         `b.read`, `b.storage` and, with rows, `b.config`: the new reader throws away what the
         old writer left. (a) passes whole, since the new writer clears before it writes.
193. **The unit tests** (`test/unit/storage-compat.test.js`, a new unit file not in the design
     §6.4 list, like decisions 48, 57, 71, 82, 160 and 168; CI runs it in `npm run unit`).
     - Without Chrome, each rule with passing and failing samples: the options, the storage
       diff, the seeds and owners, the config rule, a new page's and an old page's calls, the
       changes no call explains, two pages' calls compared, the operations, the categories, the
       mutants' verdicts, the allowlist and the console lines.
     - In Chrome, on the synthetic tree (its statement app a byte copy of the real one): the hooks
       log every kind of call and dump unlogged; a statement app with an investment and a
       cash-like row of one currency (all five operations) and the custom app, each page served
       as its own old page, pass everything, twice with the same digest; each mutant fails
       exactly as expected; and the other checks have their failing samples: a config field the
       configurator never writes (`c.config`), another provider's key written (`cross`), a key
       written through a property (`c.key`, seen in the storage read after the step), a
       difference in the UI alone (`a.ui`, `b.ui`), a mode that changes no download (`vacuous`),
       rows detected in another order (`probe`, `keys`), a console error (`errors`), a phase that
       cannot run (`page`, and the run goes on) and a `frozen.js` that does not describe the old
       page (`frozen`, `c.key`, `c.read`). 13 tests (26 with the subtests), about 15 s.
194. **`package.json` is unchanged.** Design §1's script list has no storage-compatibility entry:
     the run is a local gate (design §6.10), started as `node test/storage-compat/run.js`.

Decisions of the M11 gate (G10):

195. **How G10's parts were run** (design §8.1 M11).
     - "§6.8 (a), (b) and (c) pass for all 8": `node test/storage-compat/run.js` on `dist/` (after
       its `build --check`), with each provider's statement folder as the user config names it
       and the live pages checked; all 8 in one run, on one origin in one context, in folder
       order. Every check of decisions 189-191 is part of it, the keys and the one-origin checks
       included.
     - Beyond the gate's list: the same command a second time, which must give the same results
       digest (the run is deterministic under the frozen clock), and `--self-test` (decision 192)
       against the real old pages, which shows that the gate's run fails on a renamed key.
     - The golden harness's baseline before and after, and a scratch session check of the old
       repositories' and this repository's file manifests around the whole script, as the G9
       entry did.
     - No golden run: nothing under `core/`, `build/` or `providers/` changed (design §8.3), and
       the pages are G9's, byte for byte.

Decisions of the extensibility step (WP12, M12: the two templates `providers/_template-csv/` and
`providers/_template-pdf/`, `tools/new-provider.js`, `test/contract/new-provider-dryrun.js`, the
parse-error smoke's target, the unit tests `new-provider.test.js` and `parse-error.test.js`, the
docs `docs/CONTRACT.md`, `ARCHITECTURE.md`, `TESTING.md`, `SECURITY.md` and
`ADDING_A_PROVIDER.md`, and `README.md`):

196. **The CSV template is design §2.13's, with three additions to its parser** (amended by
     decision 206: every portfolio gets a label of its own, and the fixtures a fourth account).
     - `provider.js` holds §2.13's values exactly (`id` template-csv, `name` Example Bank, the
       summary, csv inputs, `uses: ["assemble"]`, `parserGlobal` ExampleCsvParser, the export
       gap warning, `testing.fixtures`), under a header for a skeleton. `page.html` is §2.13's
       slots verbatim (its `mode-label` "Funds" included). There is no `frozen.js`: a skeleton
       needs none (C05b), and the scaffold writes one for each copy (decision 199).
     - `parser.js` keeps §2.13's format, portfolio ids (`<number>:<CCY>`), labels (`Example
       #<last 3 digits>`), order (the first row's date, then the file name, by code point), the
       one-row-once rule for overlapping exports and the covered months of an export's span.
       Added: (a) cells are read as RFC 4180 allows on one line (quoted, `""` for a quote), since
       the design's `split(",")` cannot read a quoted description, which real exports hold; (b)
       every row is checked against its export's running balance and order, and what does not
       add up is a warning (design §2.10's "data that doesn't add up", never adjusted); (c)
       per-statement work is kept in a `WeakMap` (design §2.6's rule for new parsers). Guards:
       a statement that is not an object reads as an unknown file, and an account number with
       `:` (which would break the id format) is not an account line.
     - The fixtures: three accounts in two currencies in six files: two overlapping exports of
       one account (two rows counted once) with a covered month without rows, a late-starting
       account (one "not covered by statements" entry from 0), a missing month (May) with
       partial months for one account, a first opening, descriptions with a quoted comma, quotes
       and a leading `=`, and a file that is not an export (`expectErrors`). No `hostile.js`:
       design §1 lists none for this template, and the configurator payloads reach all four
       render targets on its page.
197. **The PDF template, made concrete** (design §1; §2.13's three differences and its fixture
     list; amended by decision 206: every portfolio gets a label of its own, and the fixtures a
     fourth account).
     - The format: `Example Bank`, `Monthly statement`, `Statement period DD/MM/YYYY to
       DD/MM/YYYY`, then per account a section `Account <name> <number> <CCY>`, `Opening
       balance`, the table header, rows `DD/MM/YYYY <description> <amount>` and `Closing
       balance`; amounts with thousands separators. The parser reads the lines of every page
       through `L.pageLines` (a section may cross a page break; other lines, a repeated header
       or a footer, are ignored), with the factory `(L, E, A)` of §2.13.
     - The result: one bank portfolio per account number and currency (id `<number>:<CCY>`,
       the format the scaffold's `configIdPattern` describes), label `<name> <last 4 digits>`,
       its names oldest to newest (a renamed account shows "formerly …"); a row without an
       amount is a skipped row of category "no amount", which the diagnostics list; a section
       whose rows do not reach its closing balance is a warning; a second statement of a month
       is an error, the first in the order month, then file name (code point) winning, so the
       loaded-twice fixture is named `…_copy.pdf`, which sorts after the original.
     - The fixtures cover §2.13's list: three accounts in two currencies; three statements with
       the middle month (March) missing, which bridges two accounts; a first opening; January
       loaded twice (`expectErrors`); descriptions with `=`, `,` and `"`. Also a statement over
       two pages with a section across the break, an account renamed in April, an empty section
       and a row without an amount.
     - `fixtures/hostile.js` (design §1, optional): two statements whose account name is an
       element with a handler (it reaches the cards, the configurator, the status through the
       first opening and the diagnostics through a gap row) and a row without an amount whose
       description is markup (the rows not exported).
198. **The templates' `fixtures/expected.js` were generated, then reviewed** (design §6.5,
     "generated by `--update`, reviewed"; regenerated by decision 206 for its fixtures): `node
     test/smoke/fixtures-golden.js --provider template-csv,template-pdf --update`, which writes a
     file only once the page equals the downloads hook in every state: 9 states and 63 records for
     the CSV template, 9 states and 75 records for the PDF one. The review read the downloads
     through the hook in Node (scratch, counts only): the names follow the brand and the slug, `=`
     descriptions carry the formula guard's apostrophe, quoted descriptions are quoted, the bridges
     are dated and named as the export layer does, and the Accounts CSV starts each account where
     `openingBalance` says.
199. **The scaffold, made concrete** (design §7 step 1, (a)-(f)).
     - (a) It refuses an invalid id (the contract's rule), a reserved one and one that exists
       (`providers/<id>`, `providers/_<id>`, a provider with that id, or `dist/<id>`). Beyond the
       design: an id whose default storage keys, zip slug or parser global another provider
       uses (C04, checked before anything is written), a name that is not a plain name (up to 60
       letters, digits, spaces and `. , & ' ( ) + -`; the name goes into file names, page text
       and the descriptor) and the placeholder "Example Bank" (shared code holds it, so the
       generic lint's provider-name rule would fail). A wider check of the name against all of
       shared code was tried and dropped: it refused the dry run's own name, which the dry-run
       script, shared code in its copy, spells out, and the generic lint reports such a name
       anyway (the guide says so).
     - (b)-(e) The folder is written to a staging folder `providers/.<id>.new-<pid>` (discovery
       ignores names starting with `.`) and renamed into place; the node-tier contract checks
       then run on it, and on a problem of its own it is removed again. A template it cannot
       rewrite (each of the four `provider.js` lines must occur once; `parser.js` must have the
       browser branch to rename) leaves nothing behind. `provider.js` keeps the template's
       `module.exports` text with the four lines set and gets a new header; `parser.js` gets the
       template's global renamed as a whole word (the browser branch and the header comment);
       `page.html` (HTML-escaped) and `README.md` get the name for "Example Bank"; `frozen.js`
       is written from `resolveRuntime` of the new descriptor and `CONFIG_KINDS`, so C05 holds.
     - (f) The page is built in a temporary tree with copies of `core/`, `vendor/` and the new
       folder: the fixtures golden takes a published provider's `dist/` page, which must be
       current, and the scaffold writes nothing outside the folder. There
       `test/smoke/fixtures-golden.js --root <tree> --provider <id> --update` runs as a child
       process, and the fresh `expected.js` is copied back. Without playwright-core in
       `test/node_modules` or the pinned Chrome it stops after (e), exit 1, and prints the two
       commands to run (the build, then `--update`).
     - Exit status 0 done, 1 refused or not complete, 2 usage; `--root` scaffolds into another
       tree (the tests).
200. **The dry run, made concrete** (design §6.5; the task's harness with `--all-fixtures`;
     amended by decision 209: the steps see CI's empty user config).
     - It copies the files a commit would hold (`test/lint/files.js` `listFiles`), not the
       tracked files alone: in CI from a clean clone the two are the same, and before a commit
       the new files must be in the copy. A file that is not a regular file stops it.
     - The copy becomes a git repository with one commit (isolated git configuration, no `GIT_*`
       variables); `test/node_modules` is a link to this repository's, excluded in
       `.git/info/exclude` (`.gitignore`'s `node_modules/` does not match a link).
     - Each step is its own process in the copy, with `S2C_PRIVATE` and an empty `S2C_OLD_ROOT`
       inside the temporary directory, as in CI. Beyond the design's list: the harness runs
       with `--all-fixtures --browser` (both templates and the new providers), the injection
       smoke runs for the new providers (design §7 step 7 lists it), and the lints run on the new
       providers' files and pages only (the full lint fails in the copy on the dry run's own
       file, which spells out the dry-run name of providers that exist there). Every step must
       also print the lines that show it checked the new providers: a first version passed
       with "0 pages" after both scaffolds had refused.
     - Step 5 reads `git status --porcelain --untracked-files=all`: each line one of the new
       folders' files or pages (untracked) or `dist/index.html` (modified), and each of them
       present.
201. **The parse-error smoke runs on the CSV template; the synthetic fallback is gone** (amends
     decisions 167, 168 and 178).
     - Discovery finds `_template-csv` (the PDF template has no csv input), so `npm run smoke`
       drives the statement app's catch on a real skeleton. The fallback to a fresh synthetic
       tree, which decision 178 kept for the time before M12, is removed: a repository that
       loses its CSV template fails with "nothing to check", as decision 178 asks of every tree
       without such a skeleton. `parseArgs` takes `--root` only.
     - `parse-error.test.js` (12 tests): the fallback's test removed, and one added: this
       repository has a target, found by discovery (the test names no provider).
202. **`test/unit/new-provider.test.js` is a new unit file** (not in the design §6.4 list, like
     decisions 48, 57, 71, 82, 160, 168 and 193; amended by decision 209, which adds a 13th test):
     12 tests on scratch copies of the repository, never on it: the arguments; the parser global;
     refused ids (writing nothing), a C04 clash and refused names; for each template, the whole
     folder without the browser (every file's content, frozen.js against `resolveRuntime`, the
     contract checks); the stop without Chrome; a template it cannot rewrite and a folder that fails
     the contract checks, both leaving nothing; and, in Chrome, a generated `expected.js` that the
     fixtures golden passes once the copy is built. The dry run's git-status rule has its samples
     there too.
203. **The docs are written for the implemented state** (design §0: §2, §3 with §5, §6 and §7
     become `docs/CONTRACT.md`, `ARCHITECTURE.md`, `TESTING.md` and `ADDING_A_PROVIDER.md`; design
     §1 adds `SECURITY.md`).
     - They follow the design's sections, amended by the decisions that changed them: the hash
       policy as the default (decisions 180-183), the catch of a parse error (165), the sinks
       lint (174), names an attribute cannot carry (176), the harness (137-156), the storage
       run (188-193), the templates, the scaffold and the dry run (196-201). Old line numbers stay
       in this file's derivation map. Section headings are the names the code's comments cite
       (`docs/ARCHITECTURE.md, readers`, `docs/TESTING.md, fixture spec format`, …); "error
       conventions" is a section of `CONTRACT.md` (what a provider does) and of `ARCHITECTURE.md`
       (how the app shows it), which the statement app's comment cites.
     - They hold the lints' rules: no finance-app name (the old QIF expansion is described, never
       spelled), no machine path (placeholders, and `$HOME/…` forms), no number in an
       account-number format, and placeholders for every private folder.
     - Design §7 put the fixtures golden's `--update` (step 7) before the build (step 8); for a
       published provider the golden takes the `dist/` page, so the guide builds first (the
       scaffold's own run builds in its temporary tree). The reader test's fixes are decision
       205's.
     - `README.md` gains the documents' list and the check commands; `core/README.md` is
       unchanged.
204. **`package.json` is unchanged** (as decision 194): design §1's scripts already hold
     `new-provider`, and none runs the dry run, which CI starts as `node
     test/contract/new-provider-dryrun.js` (design §6.10 step 10).

Decisions of the M12 gate (G11):

205. **How G11's parts were run, and the reader test** (design §8.1 M12).
     - "Dry run green (including the fixtures golden of the scaffolded providers)": `node
       test/contract/new-provider-dryrun.js` on the final tree. "Fixtures goldens green": `node
       test/smoke/fixtures-golden.js` (every provider with fixtures: both templates and the
       custom app). "Generic and privacy lints green": `node test/lint/run.js` (all six lints,
       with the untracked denylist and app list). The standing matrix ran with them.
     - "A reviewer completes ADDING_A_PROVIDER.md literally for a throwaway id": two passes in
       scratch copies of the tree (git repositories with one commit, never this repository),
       by this work package's author following the text literally (no other reviewer was at
       hand). Pass 1: `--from csv`, a throwaway id and name, and a made-up export format
       (semicolons, European numbers, debit and credit columns); pass 2: `--from pdf` and a
       made-up statement layout (withdrawal and deposit told apart by position, dates without a
       year). Each pass had invented statements in a folder outside its copy, playing the
       private statements, with `S2C_PRIVATE` and `XDG_CONFIG_HOME` pointed at scratch folders
       (the user config was never touched) and the denylist and app list given through
       `S2C_DENYLIST` and `S2C_APPS`. Each pass took every step, wrote a parser, fixtures and page
       copy, and ended with step 9's commands green.
     - What was unclear or wrong, each fixed in the docs (or the scaffold) before the pass went
       on: (1) the install command ran Playwright's browser clean-up, which deleted a browser of
       another installation from the shared browser folder (below): the command now sets
       `PLAYWRIGHT_SKIP_BROWSER_GC=1`, in the guide, `README.md`, `TESTING.md` and the scaffold's
       hint; (2) step 1's command hard-coded `--from pdf`: now a `<template>` placeholder and an
       example; (3) the tools print `<private-dir>` as it stands, and the guide only named a
       default: the placeholders now give `$S2C_PRIVATE` and the XDG and home forms; (4) step 2's
       statements folder was vague: now its path; (5) step 5 never said how a real folder's
       rightful errors (a non-statement file, a month twice) are declared, so H5 could not pass:
       a paragraph on `expectErrors` and `allowProblems` in the user config; (6) which file of a
       duplicate pair gets the error (code-point order puts `x-2026-01-z.csv` before
       `x-2026-01.csv`): a sentence with the example and the templates' `…_copy` naming; (7)
       the scaffold's `provider.js` header kept a "TODO" after the summary was written: the
       header states what the summary is; (8, pass 2) the dump's lines lose a number's column,
       and the guide did not say that `pageLines` gives each cell's position: the line object's
       shape and how to tell columns apart; (9, pass 2) a hostile file the parser did not
       recognise showed only as "the page never prints it": how to dump `hostile.js` through a
       scratch folder.
     - The side effect of finding (1): pass 1's literal install removed `firefox-1447` from the
       shared Playwright browser folder in the home directory (no playwright-core installation
       found under the home folder referenced it) and downloaded `ffmpeg-1011` there. Pass 2,
       with the variable set, deleted and downloaded nothing. The scratch runs' own additions
       (ffmpeg and the two scratch links) were removed afterwards; the removed browser is not
       restored (the installation that wants it downloads it again). `chromium_headless_shell-1200`,
       the tests' browser, was never touched. The investigation read `browsers.json` of the
       playwright-core copies under the home folder, three of them in old repositories'
       `test/node_modules` (reads only); the golden harness's baseline afterwards found the old
       repositories unchanged.

Decisions of the M10-M12 review fixes (stage E: `providers/_template-csv/parser.js` and
`providers/_template-pdf/parser.js` with their `fixtures/statements.js`, `fixtures/expected.js` and
`README.md`, `build/csp.js`, `test/contract/new-provider-dryrun.js`, the unit tests `csp.test.js`
and `new-provider.test.js` and the new `templates.test.js`, and `docs/ADDING_A_PROVIDER.md`,
`TESTING.md`, `SECURITY.md` and `ARCHITECTURE.md`; no page changed):

206. **Each template gives every portfolio a label of its own** (finding label-collision; amends
     decisions 196, 197 and 198).
     - A label is its account's default export name (in the file names and the Accounts CSV), and
       `StatementAssemble.build` names an account after its label (design §3.10 step 4), so
       portfolios with equal labels become one account, as two renamed to one name do. The
       templates' labels, `Example #<last 3 digits>` and `<name> <last 4 digits>`, are equal for one
       number in two currencies and for two numbers that end alike. The review's three CSV exports
       (one number in SGD and in USD, a second number in SGD with the same last digits) gave 3
       portfolios and 1 account, in SGD, whose cash mixed SGD and USD and whose valuation summed all
       three, and `checkResult` (strict) found nothing; two of them in one currency merged with no
       warning and no problem anywhere. The PDF template merged one name and number in two
       currencies the same way. Neither template's fixtures held such an account.
     - Now each parser's `distinctLabels` gives every portfolio the first of its label forms that no
       other portfolio of the parse has: the short label, then with the currency, then with the
       whole number and the currency, which is the id's own (the id is the number and the currency).
       Every portfolio whose label another one shares takes its next form, so the input order never
       matters (H10), and a label nobody shares stays short, so the fixtures' other accounts keep
       their names. The review's three exports now give 3 accounts (`Example #234 USD` and the two
       SGD ones with their whole numbers), and its two PDF sections 2 (`… 5501 SGD`, `… 5501 USD`).
     - The PDF template decides the form before it reads the sections, from each account's newest
       name, and gives the account's older names, its warnings and its skipped rows in that form;
       its statement count is the number of statements it used, as before. A name only an older
       statement had can still equal another account's label (it shows as "formerly …"); accounts
       merge by their labels, which differ.
     - Not taken: the review's first option alone, the currency in every label, which leaves two
       numbers that end alike in one currency with one label. Nothing changes in `core/assemble.js`:
       merging by equal names is its documented rule (design §3.10, docs/ARCHITECTURE.md), the one a
       rename to one name uses, and a provider may rely on it on purpose. So the guide says it:
       docs/ADDING_A_PROVIDER.md (Build raw) gives the review's sentence, that the label is the
       default export name and that equal labels merge, with how the templates keep them apart, and
       both templates' `README.md` say so in step 1.
     - A default name now depends on the other portfolios of the parse where it would otherwise be
       shared: adding an export of the number's second currency turns `Example #245` into `Example
       #245 SGD`. Settings are keyed by portfolio id, so a rename, kind, merge or exclusion made in
       the configurator is kept.
     - The review's optional check, a `checkResult` warning when an account's cash currencies differ
       from its currency, is not added. Export layer C converts a USD entry at the month's `fx`
       (design §3.5), so such an entry is not wrong in itself for a provider that gives `fx`;
       without `fx` the export layer reports `cannot convert`, a problem that H6 fails on (the
       review's own run shows it for the merged account); and the silent case, two accounts of one
       currency, shows no difference in currency at all.
     - The fixtures hold such an account now. CSV: number 1100245 also in USD (`Example #245 USD`,
       from March, from 0, a description with a quoted comma), so the SGD one is `Example #245 SGD`.
       PDF: Everyday Account 10201 also in USD, a section of its own on each statement (`Everyday
       Account 0201 USD` beside `… SGD`). Both `expected.js` were regenerated with `--update` and
       reviewed as decision 198 says: 9 states and 69 records for the CSV template (63 before) and 9
       states and 93 for the PDF one (75 before). Record by record (scratch), 39 of the old records
       are byte-identical in each once the renamed account's new name is read for its old one (the
       other accounts' files and the renamed account's transactions CSVs); the rest changed where
       the names or the new account appear (the renamed account's QIF with its `L[…]` line, the
       Accounts CSV, the Combined CSV and the zips); none is gone; and the new account adds its
       transactions CSV and QIF in each state where it has entries (6 and 18 records). In the hook's
       Node rebuild the new account has its own currency, rows and Accounts CSV line.
     - `test/unit/templates.test.js` is a new unit file (not in the design §6.4 list, like decisions
       48, 57, 71, 82, 160, 168, 193 and 202), 2 tests: for each template, a parse with one number
       in two currencies, two numbers that end alike in one currency and one other account gives one
       account per portfolio, each with its own currency, cash and valuations, the forms above in
       every input order (24 orders of the CSV template's four exports, 2 of the PDF's two
       statements); one number in two currencies takes the currency only; a label nobody shares
       stays short, also beside an export without rows; a rename of two to one name still merges;
       the PDF template's older names and skipped rows take the account's form.
207. **`verify` reads the hash listing from the page itself** (finding verify-policy-trust; amends
     decision 181).
     - Since decision 181, `verify` compares the page's policy with `policy()` over the page's own
       scripts and style, exactly. The build writes the page with that `policy()` too, so a fault in
       it passed both: the review's mutant, a `policy()` that skips the runtime object's piece,
       built every page with one hash missing (versa's `script-src` 11 hashes, not 12), exit 0, and
       the node-tier contract checks passed C14; only `build.test.js` and the Chrome test of
       `csp.test.js` failed.
     - Now `listingProblems`, in hash mode, reads the page's own policy, whatever `policy()` gives:
       the first `script-src`, the one the browser enforces, must list the hash of every script the
       browser runs (not the worker's `text/plain` element) and nothing else but `blob:` on a PDF
       page; under the hash style policy the first `style-src` must list the style's hash and
       nothing else. Its messages are `policyProblems`' for the same defects, and `check()` returns
       each message once. Design §5.5's "every executable `<script>` hash is listed" is again a
       check of its own.
     - `csp.test.js` compiles `build/csp.js` afresh with every call of its `policy()`, `verify`'s
       own included, going to a fault (`vm.compileFunction` on the file's text, which stays as it
       is), and builds the page a build with that `policy()` writes. Six faults: the runtime
       object's hash dropped, the style hash dropped, `'unsafe-inline'` scripts, the worker text
       hashed, `data:` scripts, `'unsafe-inline'` beside the style hash. The faulty module's own
       `verify` refuses each page with exactly the listing's messages. A defect both readings see is
       reported once.
208. **The markup check reads tags as the browser's tokenizer does** (finding markup-scan-bypass;
     design §5.5's "no `on[a-z]+=` attribute outside scripts and, in hash mode, no `style=`
     attribute").
     - The check split the markup into tags at their first `>` and looked for `on…=` and `style=`
       after a space, so `<p id="busy"/onmouseover="x()" hidden>` and `<p id="busy" title="a>b"
       onmouseover="x()" hidden>`, and the same two with `style=`, passed in both modes, while the
       browser reads each attribute. Under the hash policy Chrome blocks such a handler anyway
       (`script-src-attr`), and page copy may carry `class="muted"` only (C16); the gap was in the
       skeleton, the landing template and `--csp legacy` builds.
     - The review's suggested pattern was tried and not taken: it wants a space or `/` before every
       attribute, so it matches no tag at all where an attribute follows a quoted value with no
       space (`<p id="a"onclick="x()">`) or an unquoted value holds a quote (`<p id=a"b
       onclick=x()>`), both of which the browser reads as two attributes, and such a tag would go
       unchecked.
     - Now `tags(html)` reads the page as the tokenizer does in HTML content: comments to `-->` or
       `--!>` (`<!-->` and `<!--->` are empty), doctypes and the other `<!`, `<?` and
       `</`-non-letter declarations to the first `>`; attribute names after a space, a `/` or a
       quoted value, quoted values to their own quote, unquoted ones to a space or `>`, ASCII
       letters lower-cased; and the text of `script`, `style`, `title`, `textarea`, `xmp`, `iframe`,
       `noembed`, `noframes` and `noscript` (scripting is on) passed over to their end tag, and
       everything after `plaintext`. A tag with an `on[a-z]+` attribute fails, and one with `style`
       in hash mode; an end tag's attributes count too, although the browser drops them. `tags` is
       exported for the tests.
     - `<svg>` and `<math>` are refused: in their foreign content a `<title>` or `<style>` holds
       markup and `<![CDATA[` runs to `]]>`, which this reading does not follow (a handler in an SVG
       `<title>` would pass). No page has either; a page that needs one must extend the check first.
     - The searches for the CSP meta, `<head>`, the first script and the style are unchanged: each
       looks for one exact form, and any other form fails them.
     - `csp.test.js`: eight new defects in both modes (the slash, the quoted `>`, no space after a
       quoted value, a quote in an unquoted value, an upper-case name, a comment that `--!>` ends, a
       `<textarea>` holding a quote, an `<svg>`), two style attributes in hash mode and three
       defects on the landing page; four samples that only look like attributes (in a quoted value,
       a `<textarea>`, a comment, after `< `) pass in both modes; a list of 19 samples with what
       `verify` must say of each; and, in Chrome, each sample parsed by `page.setContent`: Chrome's
       DOM has an `on…` or `style` attribute exactly where the list says, and `verify` refuses every
       page where it has one (the one sample where `verify` refuses more is an end tag's attribute).
209. **The dry run's steps see CI's empty user config** (finding dryrun-config-isolation; amends
     decision 200).
     - A step's process had the dry run's environment with only `S2C_PRIVATE` and `S2C_OLD_ROOT`
       set, so the developer's untracked `<config-dir>/statements.js` applied there: a `refuse` list
       that holds the temporary root failed 9 of the 14 steps, and a malformed file would fail every
       step that writes private output. CI has no such file.
     - `stepEnv(tmp)` gives every step what CI has: its own `<private-dir>`, an empty `<old-root>`
       and now an empty `<config-dir>` (`XDG_CONFIG_HOME`) inside the temporary directory, and no
       `S2C_STATEMENTS`, `S2C_DENYLIST` or `S2C_APPS`. The two lists' variables go beyond the
       review's fix: no step reads them, since the lints run in the dry run's own process, and a
       step that did would see CI's lists. The lints keep the dry run's environment, so the
       untracked denylist and app list apply to the new files. The script's header and
       docs/TESTING.md (dry run) say so.
     - `new-provider.test.js` (12 → 13 tests): `stepEnv` against a developer environment whose
       config refuses the temporary root and whose statements root is that root, with lists of its
       own: the three folders, both of them made empty, the three variables gone, everything else
       passed on as it was; a step's own process then reads an empty user config and may write in
       its `<private-dir>`, and it refuses once the developer's config, or the statements root, is
       put back.
210. **How the stage E fixes' gates were run.**
     - No page changed: `verify` reads, `policy()` gives what it gave, and the templates are
       skeletons, so `node build/build.js --check` finds `dist/` current and the nine pages are G9's
       byte for byte. Design §8.3 asks for `compare --tier quick` before a change under `build/`
       merges, for the providers it affects: all 8 here, in one run between two baselines and two
       session checks. The full tier, the S scenarios, the canary, the real-statement harness and
       the storage run are not rerun: they read the eight providers' pages and parsers, which are
       G9's and G10's.
     - G11's parts on the fixed tree: the dry run, also under a developer config that refuses its
       temporary root (the review's experiment), the fixtures goldens, and the generic and privacy
       lints; the standing matrix with them, once all files were final.
     - The findings' experiments ran again on scratch copies of the tree (never this repository),
       with the old repositories out of reach (`S2C_OLD_ROOT` an empty folder, as in CI), and every
       new test ran once on the files it fixes, the review's versions put back, where it must fail.
211. **The workflows' actions and runner** (design §5.6 and §6.10; WP17).
     - Only GitHub's own actions, each at its current release and pinned to that release's commit,
       with the tag in a comment: checkout v7.0.1, setup-node v7.0.0, configure-pages v6.0.0,
       upload-pages-artifact v5.0.0 (which pins its own upload-artifact by commit) and deploy-pages
       v5.0.1. The design named checkout v4, setup-node v4, configure-pages v5,
       upload-pages-artifact v3 and deploy-pages v4, the majors of its writing, which run on Node
       20; the five chosen releases run on Node 24. A tag can be moved to other code, a commit
       cannot. Each release is at least two weeks old; setup-node v7.1.0, of 2026-10-08, was not
       yet, so v7.0.0.
     - No `actions/cache` (design §6.10, step 6): its `path` would be a tilde or home-directory
       path, which the privacy lint refuses in tracked text, and the headless shell downloads in
       seconds. `CHROME` is not set either: `test/lib/browser.js` defaults to the path where the
       installer puts the shell, under the runner's home, as on a developer's machine.
     - `ubuntu-24.04` rather than `ubuntu-latest`, so the image changes only when the workflow does,
       and Node 22 (design R20). Checkout with `persist-credentials: false`, since no later step
       uses the token; setup-node with `package-manager-cache: false`, so nothing is cached;
       `PLAYWRIGHT_SKIP_BROWSER_GC=1`, as in the documented install command (the G11 entry).
     - The syntax check is `git ls-files -z -- '*.js' | xargs -0 -n 1 node --check`; the design's
       `for f in $(git ls-files '*.js')` would split a file name at a space.
212. **The unit tests run after the browser install** (amends design §6.10 and decisions 32 and 147,
     which put them before it, as CI step 5).
     - Seven unit test files have tests that need Chrome (csp, injection, parse-error, contract,
       harness, new-provider and storage-compat); before the install they would all skip in CI.
       After it they run, and the only tests that skip are those that need the old repositories.
     - A test that skipped for want of Chrome would not fail its step, but the browser steps after
       it fail when Chrome cannot be launched, so such a skip cannot pass unnoticed.
213. **The deploy waits for CI** (amends design §5.6, where `pages.yml` ran `build --check` alone
     before deploying).
     - The first job of `pages.yml` runs `build-check.yml` on the same commit (`workflow_call`), and
       the deploy job needs it, so a commit whose checks fail is never deployed. To run the checks
       once per push to `main`, `build-check.yml` runs on pushes to the other branches and on pull
       requests, not on pushes to `main`. A branch of this repository with an open pull request gets
       both a push run and a pull-request run; that is accepted.
     - A push to `main` is the only trigger, and the deploy job checks `github.ref` as well. The
       review found that a manual run (`workflow_dispatch`) on another branch would join the `pages`
       concurrency group and replace a waiting run of `main`, so the workflow has none; a failed run
       can be re-run from the Actions page.
     - Permissions: none by default, `contents: read` for the check, and `pages: write` with
       `id-token: write` for the deploy job alone. One concurrency group, `pages`, that never
       cancels a run in progress; a run still waiting when a newer push arrives is replaced by the
       newer one, whose commit includes it.
214. **A public repository that starts with one commit** (the user's decisions of 2026-10-20).
     - GitHub Pages on the account's plan serves public repositories only (the Pages API answered
       422 "Your current plan does not support GitHub Pages for this repository" while the
       repository was private), so M13 makes the repository public, which the user approved with
       M13.
     - The review before publication read the whole history. It found no name, account number,
       amount, address, secret or domain, but this file, in every commit, and one commit message
       recorded figures computed from the real statements: per provider, counts of statements,
       months, accounts and records, and run sizes that decode to them, and the denylist's size and
       breakdown. The user chose a clean public copy. Those figures are gone from this file, whose
       header now states the rule for every entry; the development history up to M12 stays in a
       private repository; and the public repository starts from one commit. It is a new repository
       rather than the old one squashed in place, because GitHub can keep serving commits that a
       force-push removed by their ids.
     - The commit dates keep the author's time zone, which the old public repositories already show.
215. **How G12 is run** (design §8.1 M13).
     - CI from a clean clone: the run steps of `build-check.yml`, read from the workflow, on a fresh
       clone with the M13 changes committed, in an empty home (no old repositories, no user config,
       no browser, no npm cache) under `env -i`; then GitHub's own runs, `build-check.yml` on a
       branch while the new repository is still private and `pages.yml` on `main`.
     - Every deployed page's sha256, fetched with `curl` (redirects followed, no compression asked
       for), against `dist/`, the landing page included.
     - The settings on `ycsin.github.io`: the storage run itself (`test/storage-compat/run.js`:
       G10's checks (a), (b), (c), keys and one origin) on the deployed site rather than on a local
       server. A scratch copy loads the old pages from `/<legacyRepo>/` and the new pages from
       `/statement2csv/<id>/` on `https://ycsin.github.io`, fulfils only its blank observer page
       locally on that origin, and checks every document the browser fetched against `dist/` and
       `legacyIndexSha256`. That is more than the design's spot check. It was rehearsed first on a
       local server laid out like the site, where it gave G10's results digest.
     - The old repositories: the baseline with live pages (§6.7.2) before and after, and the session
       check of their file manifests at the start of M13 and after G12.
     - The `github-pages` environment accepts deployments from `main` only: checked once Pages is
       enabled, and set if not.

## Gate log

### G0 — baseline freeze (2026-10-16)

- `rev-parse HEAD` equals legacyHead: 8/8.
- `sha256(index.html)` equals legacyIndexSha256 and the blob at legacyHead: 8/8.
- The live page at each legacyUrl has sha256 = legacyIndexSha256: 8/8.
- File manifests of the 8 old repositories: 4347 entries (677 directories, 3,641 files, 29
  symlinks recorded as links). The before and after manifests are identical (0 differences) for the
  G0 run itself, and also across the whole WP1 session. That snapshot was taken after only plain
  file reads, before any git command, npm run, browser run or statement read, and was compared after
  WP1's last step. Snapshot manifest sha256 prefix:
  `37129a6881e70529` (kept in `<private-dir>`).
- Problems: 0.

### G0b — bootstrap (2026-10-16)

- `fs.realpathSync(require.resolve("playwright-core", {paths: ["test"]}))` lies inside
  `test/node_modules` (playwright-core 1.57.0).
- `npm install --ignore-scripts` (npm 10.9.8, Node 22.23.1) installed 1 package. Then
  `npm ci --ignore-scripts` succeeded. `test/package-lock.json` sha256 `9855cc9d1c6bda98…`
  (lockfileVersion 3, playwright-core 1.57.0, integrity `sha512-agTcKlMw…`).
- chrome-headless-shell revision 1200 launches through playwright-core and reports `143.0.7499.4`.
- Lints (applied by hand, decision 10): 0 findings over every file that would be tracked.
- `git status`: only the bootstrap files are untracked; no private file type; `test/node_modules`
  is ignored.

### G2 — legacy page reproduction (2026-10-16)

- `node --test test/unit/legacy-repro.test.js`: 8/8 old `index.html` files rebuilt byte for byte by
  `build/legacy-inline.js` from each repository's own `build.py` parts table (6 markers in six
  repositories, 4 in two).
- sha256 of every rebuild equals `legacyIndexSha256`: stashaway `887b1108c1a81709…`, maribank
  `ad8a22d49b33a9cb…`, chocolate `5b79b2d531ae6760…`, moomoo `eee74a3a012f4cdb…`, etoro
  `47f7746b398b0ea5…`, posb `e2d008cc51c310ac…`, maybank `4038854aeaa5c60b…`, versa
  `d649263fffede5d3…`.
- HEAD equals legacyHead, and `build.py`, the template and every part equal their blobs: 0 problems.
  Before/after manifest per repository: 0 differences.
- Session check: a manifest snapshot of the 8 old repositories (4347 entries), taken before WP3's
  first git or `require` access to them, equals the one taken after WP3's last step: 0 differences.
- Extra check ahead of WP9: fed each old template's own texts, the new skeleton reproduces all 8 old
  `<main>` elements byte for byte (W1 and W3 applied), with the same CSP (legacy mode) and title.
- WP3 unit tests: 86 tests, 84 pass, 2 skipped (they need `core/export.js`, WP4).

### WP0 — shared test library (2026-10-16)

- `node --test test/unit/testlib.test.js`: 54 tests, 53 pass, 1 skipped (the `core/xlsx.js` round
  trip, WP4). Without Chrome: 38 tests, 36 pass, 2 skipped. The same results with the process time
  zone set to `Pacific/Chatham` or `America/Los_Angeles` and an `sv_SE` locale. The whole unit glob:
  140 tests, 137 pass, 0 fail, 3 skipped.
- Checked against old code, read only: `mkxlsx` workbooks read back identically through the old xlsx
  reader (stored and deflated); `minipdf` text reads back through the vendored pdf.js with the given
  strings and positions; `unzip` reads the old pages' zip writer output, with correct CRCs and DOS
  times.
- The eight old pages, driven read-only with the real statements through `page-driver.js` (counts
  only): every load settles idle; two independent runs give identical capture records in every mode,
  for the last month and with a bogus file (8/8); drop delivery equals picker delivery (8/8); E1
  runs equal each other and differ from E0 (8/8); the configurator ops (rename with the hostile
  name, kind, merge, exclude) work on all seven configurators, legacy ids included, repeat
  identically, survive a reload and reset to `{}` with the first downloads back (7/7); every
  portfolio id matches its `configIdPattern` (7/7). The only page errors are the pdf.js worker
  fallbacks of decision 30.
- Session check: manifests of the 8 old repositories (4347 entries), taken before WP0's first
  browser run and after its last step: 0 differences (snapshot sha256 prefix `be22dcba3f669ab2`,
  kept in `<private-dir>`); git checks 0 problems; live pages 8/8 equal to `legacyIndexSha256`.
- Lints applied by hand to the WP0 files (headers, privacy rules 1-4 with the untracked denylist,
  the generic rules): 0 findings.

### G1 — golden harness determinism (2026-10-16)

`node test/golden/run.js determinism --tier quick`: the quick tier of all 8 old pages captured
twice, in two independent runs (separate browser launches and profiles, 4 parallel page instances
each), then compared byte for byte and field by field.

- Result: 24/24 manifests (8 providers × E0, E1, E2) identical, every step record included:
  downloads with their zip entry lists (name, size, CRC, sha256, DOS time and date), storage
  strings, localStorage keys, UI snapshots, the static page snapshot, page errors, and the
  pass-through cross-check. Exit 0.
- Per run, every page instance either ran or was skipped with its reason, and every captured
  download was cross-checked against its real download (bytes and name).
- A first attempt passed field by field but showed E0 manifests whose bytes differed: the
  content-addressed tables were filled in page-completion order. They are now written sorted
  (decision 41), and the rerun above is clean.
- Baseline (§6.7.2) before and after the run: 8 old repositories, 4347 manifest entries, 0 problems,
  0 differences, live pages 8/8.

### Quick and full goldens (2026-10-16)

Stored with `node test/golden/run.js capture --tier quick` and `--tier full`, in
`<private-dir>/golden/<id>/<legacyIndexSha12>/<inputsSha12>/<tier>/<env>/manifest.json` (no
`--keep-bytes`).

- Quick: a third independent run. All 24 stored manifests have the same sha256 as both G1 runs.
  Baseline 0 problems, 0 differences.
- Full: captured over E0-E2 with 4 parallel page instances, each skipped page instance with its
  reason. Baseline before and after: 0 problems, 0 differences, live pages 8/8. maybank's three
  full manifests also equal those of an earlier separate run byte for byte. eToro takes longest
  per step because its mode buttons re-parse the workbook, and custom apps run the mode × range
  iteration in both orders.
- Comparison path, self-tested against these quick goldens with scratch copies of the old pages
  (written to `<private-dir>`, never to the repo). In the copies, W1 and W3 were pre-applied the way
  a pure-move page would show them, including the standard configurator ids for the one
  legacy-markup page. Result: `compare --tier quick --page <copies>` gives 24/24 identical, with
  waiver uses W1 1 and W3 1 per E0 static snapshot, and W3 on every step that shows the legacy
  configurator. A copy with one changed download name fails at every step that offers it (name,
  plus the zip's size, sha256, entry set and entry name; exit 1). `live` on that copy writes both
  sides' bytes and the line diffs.
- Full-tier determinism (G1 asks only for quick): `determinism --tier full` gave 24/24 manifests
  identical across two more independent runs. All 24 stored full goldens have the same sha256 as
  both runs, so three captures agree. Baseline 0 problems, 0 differences, live 8/8.

### WP2 — golden harness (2026-10-16)

- `node --test test/unit/golden.test.js`: 25 tests pass. 24 are pure (generator, waivers,
  comparator, the four canaries in a vm sandbox, the run.js helpers). One drives `runPage` on a
  synthetic page with Chrome, about 26 s. With `testlib.test.js`: 79 tests, 78 pass, 1 skipped.
  WP0's synthetic-page test failed once while two browser test files and a golden run shared the
  CPU, and passed in 5 other runs, so its timing assertions are load-sensitive. The whole unit glob
  without Chrome: 149 tests, 144 pass, 0 fail, 5 skipped.
- `canary` cannot run before the providers' `provider.js` exist: it stops at the build with
  `--only: no provider …`, and it refuses a custom-app provider. G1b runs in M6.
- Session check: a manifest snapshot of the 8 old repositories (4347 entries, sha256 prefix
  `be22dcba3f669ab2`, the same as at the end of WP0) was taken before WP2's first browser run and
  compared after its last one: 0 differences. git checks 0 problems; live pages 8/8 equal to
  `legacyIndexSha256`. Every golden-harness invocation also checked §6.7.2 before and after itself.
- Lints applied by hand to the WP2 files (headers, privacy rules 1-4 with the untracked denylist,
  the generic rules; the old QIF expansion appears only in `test/golden/waivers.js`): 0 findings.
- The private store (`<private-dir>/golden`, `inputs`, `reports`, `baseline`): every directory 0700
  and every file 0600. Browser profiles and real downloads went to `<private-dir>/tmp/<run>`, which
  each run deletes at the end.

### G3a (core pins) (2026-10-16)

- `node --test test/unit/differential.test.js`: 10 tests pass, 0 differences, about 27 s.
  - Export: 4 × 10,000 cases through all 17 shared functions. Core equals C and B on every input,
    and A on months without a truthy `partial` or `startDate`. In the fourth run, every difference
    from A is one of the two superset changes: a partial bank month changed `adjustedEntries` in
    710 cases, a `startDate` changed `openingBalance` in 2,382.
  - Layout: 10,000 clouds with near-duplicates, core equal to L3; L1 differs from L3 in 9,166 of
    them. 10,000 clouds without near-duplicates, L1 equal to L3.
  - ZIP: 10,000 cases, 32,758 entries, in ten time zones. The local date differs from the UTC date
    in 3,193 cases. Byte-identical to the old writer, and so is `crc32`.
  - Storage: 10,000 cases over the keys of the 8 migrated providers (1,208 to 1,287 each).
- Mutation check of the differential test (scratch copies of the core modules): 18/18 caught.
- `node tools/provenance.js check`: 13 pins, 0 problems.
- `node tools/provenance.js rederive --old-root <old-root>`: 13 pins from 4 old repositories, 13
  reproduced byte for byte, 0 problems. That includes `core/export.js` `ac38e64a96e38161` (4
  edits), `core/layout.js` `8fabad66d4426a02`, `core/xlsx.js` `e1560a53f680a3ca`, the 2 vendor
  files, `LICENSE` and the 7 `test/legacy/` files (`zip-old.js` `342eaa6e0e867121`,
  `storage-old.js` `01ca7fb50cd115d7`).
- Unit results:
  - `zip.test.js` 7/7, `provenance.test.js` 9/9, `testlib.test.js` 54/54 (0 skipped: the two core
    checks now run), `callgraph.test.js` and `headers.test.js` 5/5 each;
  - the whole glob: 246 tests, 244 pass, 2 fail, both in `assemble.test.js` (WP4b, in progress,
    not touched here).
- Lints applied by hand to the 15 WP4a files: headers, privacy rules 1-4 with the untracked
  denylist, the generic rules, and the sinks rules for `core/`. 0 findings.
- Baseline (`node test/golden/run.js baseline`) before WP4a's first step and after its last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked.

### WP4b — core runtime modules, part b (2026-10-16)

The files are `core/escape.js` `e7bb921c5a0f8688`, `core/shell.js` `1f65d8866cd1eaf0`,
`core/readers/pdf.js` `b931796feb0ce6e0`, `core/readers/csv.js` `693211e7fce64469`,
`core/readers/xlsx.js` `641c64821523ec89`, `core/files.js` `cc57f482a8f91292` and
`core/assemble.js` `5c212c54a77da192`, with their four unit test files.

- Unit tests, with the old repositories and the pinned Chrome present: 71/71 pass, 0 skipped.
  `files.test.js` 16, `assemble.test.js` 22, `escape.test.js` 16, `readers.test.js` 17. In CI
  conditions (no old repositories, no Chrome) the result is 66 pass, 5 skipped, 0 fail.
- Old pages against `downloads()` on synthetic data (decision 65): 7 old statement apps, 441
  states (4 results × 3 modes × each app's ranges), and 3,799 downloads equal record for record.
  That covers every Download all built by the old DOM scan, every Combined zip and every disabled
  toolbar. The replay path (`loadNode` with the old parser) equals the old pages in every state
  of the variant without `partial`/`startDate`. The baseline's before/after manifests around both
  tests show 0 differences.
- `StatementAssemble.build` against the embedded old accumulator: 2000 seeded inputs, all equal.
  Among them are 728 with merges, 511 with exclusions, 691 with rename collisions, 444 with
  partial months, 602 with gaps and 229 with portfolios left out. With the old repositories
  present, exactly 1 old parser holds the embedded lines.
- Readers in Chrome against the Node twins: the CSV cases and 400 seeded random byte strings are
  equal, except for the UTF-16 byte-order-mark case of decision 59, which is pinned in the test.
  XLSX (stored and deflated, through `DecompressionStream`) equals `Xlsx.read` with zlib. PDF
  items from a synthetic statement are equal between Chrome's and Node's vendored pdf.js, and the
  page transform and `init`'s blob worker URL work.
- `esc` is byte-identical to the line in all 8 old apps, and agrees with them on 2000 seeded
  strings.
- Moved-code check (scratch): 19 old line blocks (shell 6, escape 1, readers 6, files 6) appear
  verbatim in the new files after the declared substitutions and re-indentation. The pdf `init`
  is checked in two parts, because only its body moved one level deeper. The only other lines
  are the declared changes (the transform hook, the function wrappers, the naming fields).
- Mutation check (scratch copies, never the repository): 25/25 mutants caught.
  - `core/files.js`, 9/9, each one by the old-page comparison too: no Accounts CSV in Download
    all, cards needing files, Combined always a zip, a collapsed zip name, the standard
    `modeOf` swapped, the QIF account without its prefix, the group noun in the Accounts name,
    cards sorted by name, and the toolbar enabled without cards.
  - `core/assemble.js`, 10/10: no `round2`, `downloadOnly` for a missing `fromStatements`, a
    non-string name trimmed, stripping only `cash`, `fx` always null, a locale tiebreak, no id
    tiebreak, a member's kind winning, months not de-duplicated, and prototype lookups.
  - `core/escape.js`, 6/6: Html by shape, `setHtml` taking strings, unfrozen Html, arrays always
    joined, `html` callable as a function, and `cssToken` allowing capitals.
- Pinned core files are consistent with the design. `core/export.js` differs from the export.js
  blob at the reference app's legacyHead in exactly lines 3, 78, 203 and 221 (E1-E4).
  `core/layout.js` `8fabad66d4426a02` and `core/xlsx.js` `e1560a53f680a3ca` equal their blobs.
- The whole unit glob: 262 tests, 262 pass, 0 fail, 0 skipped.
- Lints applied by hand to the 11 WP4b files and to this file: headers, privacy rules 1-4 with
  the untracked denylist, the generic rules (17 provider names; 35 app names for this file), and
  the sinks rules for `core/` (the one `innerHTML` assignment is `setHtml`'s; no `localeCompare`
  in `core/assemble.js`). 0 findings.
- Baseline before WP4b's first step and after its last: 8 old repositories, 4347 manifest
  entries, 0 problems, 0 differences, live pages checked. Session check: the old repositories'
  manifests at the end equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries, mtimes
  included): 0 differences.

### WP5 — parser and layout copies (2026-10-16)

- Source blobs at each legacyHead (`cat-file`): all 10 sha256 prefixes equal design §4.3. For
  `src/parser.js`: stashaway2csv `0753034a`, maribank2csv `035e01c4`, chocolate2csv `d5fbca02`,
  moomoo2csv `ad655933`, etoro2csv `3d424114`, posb2csv `af6853fe`, maybank2csv `99064079`,
  versa2csv `5a11c7e9`. For `src/layout.js`: maribank2csv `f653e7fe` (L1), chocolate2csv
  `5363850d` (L2).
- `node tools/provenance.js rederive --old-root <old-root> --write --only <the 10 paths>`: 10
  written, 0 problems. The files under `providers/`: `stashaway/parser.js` `3a7c85ee767589bb`,
  `maribank/parser.js` `b1bef05cd7ccdf97`, `maribank/layout.js` `f653e7fee46bb7bb`,
  `chocolate/parser.js` `e3d04c72ad13c823`, `chocolate/layout.js` `5363850d4d01eae3`,
  `moomoo/parser.js` `d08ea27054e7a35c`, `posb/parser.js` `e5c06148e222debf`,
  `maybank/parser.js` `1b564d4b50ada910`, `versa/parser.js` `8225696ea9ad70b3`,
  `etoro/parser.js` `5d5291ea85639949`.
- C15: `node tools/provenance.js check`: 23 pins, 0 problems. `rederive --old-root <old-root>`:
  23 pins from 8 old repositories, 23 reproduced byte for byte, 0 problems.
- Byte checks: each copy differs from its blob only on its declared line, keeps LF line endings,
  its final newline and its two SPDX lines, and passes `node --check`. posb's copy holds exactly
  one U+FEFF (bytes EF BB BF), on line 243, and does not start with one. Its sentinel holds, and a
  scratch buffer with the character removed gives 1 sentinel problem.
- C10a and C10b by hand (decision 67): 8/8 Node branches load exactly their declared modules; 8/8
  browser branches define their global right after the parser piece, with the Node export names.
  Through `load-provider.js` on the scratch tree, `loadNode` (new) works for 7/7 statement apps
  and `loadPage` for 8/8; `validate` reports 0 problems. On this tree,
  `loadNode(id, {parser: "new"})` stops at the missing `provider.js` for 8/8 (M5).
- C11-style garbage inputs (design §6.2, deep-frozen) through the Node branch, the browser branch
  and the old parser (read-only `require`, composed over core export): identical canonical
  results for all 8 (2 cases each; posb 4, with its CSV pair). Every statement-app result has an
  `errors` entry naming the input, and eToro returns `{error}` in each of its 3 modes. None
  throws.
- Unit: `provenance.test.js` 9/9, including its re-derivation of the 23 pins from the old
  repositories. The whole unit glob: 262 tests, 262 pass, 0 fail, 0 skipped.
- Lints applied by hand to the 10 copies, the pin list and this file's additions (decision 68):
  headers, privacy rules 1, 2 and 4 with the untracked denylist, rule 3 (only the 5 exempt
  comment lines), the generic rules (35 app names; `providers/` and the pin list are exempt from
  the provider-name rule) and the sinks rules. 0 findings.
- Baseline (`node test/golden/run.js baseline`) before WP5's first step and after its last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. Session
  check: the old repositories' manifests equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347
  entries, mtimes included): 0 differences.

### WP7a — eToro files and hooks (2026-10-16)

The files are `providers/etoro/files.js` `c3a7802762d3cfea`, `providers/etoro/test.js`
`65c48b6b39bf4b38` and `test/unit/etoro-files.test.js` `d7e3358acce584ed`.

- Moved code: etoro2csv `src/app.js`:67 and :70-83 (15 lines) stand in `files.js` verbatim, one
  level deeper, apart from :71's `state.result` → `result()`. The zip name of :153, with the
  frozen slug in place of its literal, equals the name `files.js` builds from `naming.slug`. The
  old `src/` files equal their blobs at legacyHead (`checkGit`).
- `node --test test/unit/etoro-files.test.js`: 9/9 pass, 0 skipped, about 1 s. Without the old
  repositories (CI): 7 pass, 2 skipped. The same results with `TZ` set to `Pacific/Chatham`,
  `America/Los_Angeles` or `Asia/Singapore` and an `sv_SE` locale.
  - Synthetic, in CI: 5 workbooks × 3 modes × every range the selects offer give 122 states: 114
    with a card, 5 with anchors only (no card, and Download all holding the Balances CSV), 3
    with `#zip` disabled. Also the exact records of a one-month statement, the browser branch
    (alone, and after export and parser in the page's order) and the four hooks.
  - The old page in a sandbox against `downloads()` on three paths (`files.js` on the old page's
    namespace, the hooks on the new parser over core export, `loadNode` with the old parser):
    378 states (the mode clicked before and after the range; failed, replaced and batched
    files; Clear), 1,643 downloads equal record for record, and 364 zips byte-equal to
    `zipParts(files, now)`. Of these states, 16 have Download all but no card, 9 have `#zip`
    disabled and 5 show no results.
- Mutation check (scratch copies, never the repository): 19/19 mutants caught.
  - `files.js`, 12/12: a card with anchors only, `#zip` needing a card, the zip name always
    `_to_`, a QIF MIME type, the QIF appended instead of spliced in at 1, a card account, the
    disabled record without `account` and `kind`, zip entries with their extra fields, a span
    that never collapses, no null-result guard, entries filtered on `from` only, and the
    Accounts name with a dash.
  - `test.js`, 7/7: `parse` ignoring the mode, the range reversed, an `{error}` result not
    hidden, `reconcile` never failing, the Balances header from the transactions writer, `parse`
    without a statement, and the hooks requiring the parser.
- Replay (WP6's command; an early check, since the G3b gate run comes later): `replay --parser old
  --tier quick --providers etoro`: 0 mismatches, 0 ICU drift. As early signals, `--tier full`: 0
  mismatches, 0 ICU drift; and `replay --parser new --frozen-runtime --tier full`: the same pages
  and steps, 0 mismatches. Every run's baseline: 0 problems, 0 differences.
- C10a and C10b by hand, on a scratch tree outside the repository (symlinks plus a synthetic
  §4.2 descriptor with `scripts: ["parser.js", "files.js"]`): the script plan puts `files.js`
  right after the parser in piece 12; `loadPage` and `loadNode` (new) load and give the same
  downloads (45 records); `validate` reports only C07, the missing `page.html` (WP7b).
- The whole unit glob: 271 tests, 271 pass, 0 fail, 0 skipped.
- Lints applied by hand to the three files and to this file's additions: headers, privacy rules
  1-4 with the untracked denylist, the generic rules (no provider or old repository name in the
  test; the 35 app names and the old QIF expansion for this file), and the sinks rules for the
  two provider files. 0 findings. The three files are ASCII only.
- Baseline (`node test/golden/run.js baseline`) before WP7a's first step and after its last: 8
  old repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked.
  Session check: the old repositories' manifests equal the WP2 session snapshot
  (`be22dcba3f669ab2`, 4347 entries, mtimes included): 0 differences.

### G3b (statement apps) (2026-10-16)

`node test/golden/run.js extract`, then `node test/golden/run.js replay --parser old --tier full
--providers versa,maybank,posb,moomoo,chocolate,maribank,stashaway`. The old parsers run through
`loadNode(id, {parser: "old"})`, with naming, mode ids and kind model from `frozen.js`; no
`provider.js` exists yet.

- Result: 100% equal. 21 provider environments (7 statement apps, E0-E2) ran in child
  processes, 4 at a time.
  - The downloads were compared record by record and field by field, plus any disabled toolbar
    records.
  - Among them, the zips and their entries were compared by entry order, name, size, CRC, sha256
    and DOS time and date.
  - 0 mismatches, 0 ICU drift, 0 skipped environments, 0 throw problems.
  - Each Download all was rebuilt as `zipParts(allFiles(), now)` under `zipName("csv")`. So
    `allFiles()` equals the old pages' DOM scan on every full-tier step of these 7 apps, which
    is the evidence D3 needs.
  - Parse threw on 7 steps: each app's C-seed-badname load (E0), where the old page threw too.
  - A first run on earlier code gave the same result.
- Goldens: the 21 full-tier manifests, recorded with playwright-core 1.57.0 and Chrome
  143.0.7499.4. Their digest is `b33c678a600529e9` (sha256 over the `<id>/<env> <sha256>`
  lines). The quick tier replays too: 0 mismatches (digest `dcd4869c4640c72e`).
- Extraction: the files the 7 apps' goldens use give their statements, 7 reader failures (each
  app's synthetic bogus file, one cache entry) and 0 files not accepted. The page key is
  `6d6461f60bb73ed0`. After the first reads in Chrome, every later run hit the cache.
- Environments: Node 22.23.1 with ICU 78.2, CLDR 48.0 and tz 2026a. Every child resolved its
  locale and zone: en-US / UTC, sv-SE / America/Los_Angeles, en-SG / Asia/Singapore.
- Early signal, not a gate: `replay --parser new --frozen-runtime --tier full` for the same 7 gave
  0 mismatches and 0 ICU drift on the same steps. So the pinned parser copies, on core layout L3,
  core export C and the two own layout copies, give the old downloads on every full-tier step.
- Sensitivity, on scratch copies of the tree (never the repository), mostly on the quick tier:
  13/13 mutations caught.
  - Caught as mismatches: a brand in a file name, the zip seconds, an export decimal, the
    Download-all entry order, the config ignored, the mode ignored, no range swap, no page
    transform, and a result kept without statements (full tier: the O3 Clear step).
  - Caught before replay: the child's `TZ` missing, and the child's `TZ` wrong.
  - Reported as a replay error: a writer that changes the frozen result.
  - A collation flipped in the child: its mismatches all classified as ICU drift after
    Chrome's answers, exit 0. Every other mutation's mismatches went through the same check and
    stayed real.
- Unit tests: `replay.test.js` 15 and `extract.test.js` 7, 22/22 pass, 0 skipped (Chrome and the
  old repositories present). In CI conditions: 19 pass, 3 skipped. Unit-test mutations on
  scratch copies: 19/19 caught. The whole unit glob: 293 tests, 293 pass. One earlier glob run
  had WP0's load-sensitive synthetic-page test fail (see WP2's entry); it passed on reruns.
- Files: `test/lib/extract.js` `f2cd20c7c8d22c32`, `test/lib/replay.js` `46f8c129a722d476`,
  `test/pages/extract.template.html` `fc49ca8c2932b27a`, `test/unit/replay.test.js`
  `0b0290f0daf1b682`, `test/unit/extract.test.js` `a94b393453d8b7ab`,
  `test/lib/load-provider.js` `db6c3ea971b31381` (decision 80), and `test/golden/run.js`
  `e640f3dc13ea3bec` (the `extract` and `replay` commands).
- Lints applied by hand to these files: headers, privacy rules 1-4 with the untracked denylist,
  the 35 app names, home paths, the generic provider-name rule and invisible characters. 0
  findings. In the two test files, the writing tool had turned two escapes into literal U+FEFF
  and U+FFFD characters; both escapes were restored byte-level.
- Baseline before WP6's first step and after its last: 8 old repositories, 4347 manifest entries,
  0 problems, 0 differences, live pages checked. Every `extract` and `replay` run also checked
  its old repositories before and after itself: 0 differences. Session check: the old
  repositories' manifests equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries,
  mtimes included): 0 differences. The mutation runs' diff folders were removed from
  `<private-dir>`.

### G3b (all 8) (2026-10-16)

The gate run of design §8.1 M4 covers all eight providers in one run:
`node test/golden/run.js extract`, then `node test/golden/run.js replay --parser old --tier full`.
No `provider.js` existed. Each provider loads through `loadNode(id, {parser: "old"})`, with D
null:
- the 7 statement apps take naming, mode ids and kind model from `frozen.js`;
- the custom app takes its hooks from `providers/etoro/test.js`, which builds the downloads with
  `providers/etoro/files.js`.

This run is the G3b gate. The statement-app run above (WP6) and WP7a's custom-app run were early
runs of the same command.

- Result: 100% equal.
  - 24 provider environments (8 providers × E0-E2) ran in child processes, 4 at a time. They
    covered every page and step of the stored full goldens. No page was left out (0 capture
    errors).
  - The downloads were compared record by record and field by field, plus any disabled toolbar
    records.
  - Among them, the zips and their entries were compared by entry order, name, size, CRC, sha256
    and DOS time and date.
  - 0 mismatches, 0 ICU drift, 0 skipped environments, 0 failed jobs, 0 throw problems.
  - Every statement-app Download all was rebuilt as `zipParts(allFiles(), now)` under
    `zipName("csv")`. The custom app's was rebuilt as `zipParts(out, now)` under its
    `zipName()`.
  - Parse threw on 7 steps: each statement app's C-seed-badname load (E0), where the old page
    threw too. The custom app has no configurator and never threw.
- Every count equals the goldens' own count, recomputed separately with `manifestStats` over
  the 24 manifests.
- Goldens: the 24 full-tier manifests, recorded with playwright-core 1.57.0 and Chrome
  143.0.7499.4. Their digest is `62f355cacf3dcc77`, computed as in WP6's entry: the sha256 of the
  sorted `<id>/<env> <sha256>` lines, each ending in a newline. The same computation gives WP6's
  `b33c678a600529e9` for the 7 statement apps.
- Extraction: every file the full goldens use was a cache hit (page key `6d6461f60bb73ed0`);
  none was read in Chrome. They give the statements and 8 reader failures (each provider's
  synthetic bogus file). 0 files were not accepted.
- Quick tier, all 8 (`replay --parser old --tier quick`): 0 mismatches, 0 ICU drift. It covers
  the same pages, steps and downloads as each G1 run. Digest `30b593ca030f2b3a`.
- Early signal, not a gate: `replay --parser new --frozen-runtime --tier full` for all 8 gave 0
  mismatches and 0 ICU drift on the same steps. So the pinned parser copies, on core export C, core
  layout L3 and the two own layout copies, give the old downloads on every full-tier step, the
  custom app's included. G4 repeats this with the descriptors once `provider.js` exists.
- Sensitivity of the custom app's replay on real data (decision 83), on a scratch copy of the
  tree, never the repository. A control run on the unmodified copy was identical. Of 9 mutants
  of `providers/etoro/files.js` and `test.js`, 7 were caught on both the quick and the full tier,
  each in the expected fields:
  - the QIF appended instead of spliced in at index 1: card kind, name, size and sha256, and
    the zip's entry order;
  - the zip name never collapsed: zip name only, one mismatch per single-month step;
  - a QIF MIME type: card type only, one mismatch per QIF card record;
  - the Accounts name with a dash: card name and zip entry names;
  - the opening taken at the range's end: card and zip entry contents;
  - `parse` ignoring the mode: card and zip entry contents;
  - the range reversed in `downloads`: no card, and a disabled `#zip` record where the card's
    records were (record count, trigger, kind and disabled).

  Two mutants were not caught, as expected:
  - the D20 rule (a card with anchors only), which rests on `test/unit/etoro-files.test.js`
    (WP7a);
  - the opening computed over `[from, from]`, which is equivalent on the stored goldens.

  The mutation runs' diff folders were removed from `<private-dir>`.
- Unit and provenance:
  - The whole unit glob: 293 tests, 293 pass, 0 fail, 0 skipped (32 s).
  - `node tools/provenance.js check`: 23 pins, 0 problems.
  - `rederive --old-root <old-root>`: 23 pins from 8 old repositories, 23 reproduced byte for
    byte, 0 problems.
- Code the gate ran on, as sha256 prefixes. Each equals what the package that wrote the file
  logged, and no file changed for this gate: `core/files.js` `cc57f482a8f91292`,
  `core/export.js` `ac38e64a96e38161`, `core/zip.js` `1883d44e23106170`, `core/layout.js`
  `8fabad66d4426a02`, `providers/etoro/files.js` `c3a7802762d3cfea`, `providers/etoro/test.js`
  `65c48b6b39bf4b38`, `test/lib/replay.js` `46f8c129a722d476`, `test/lib/extract.js`
  `f2cd20c7c8d22c32`, `test/lib/load-provider.js` `db6c3ea971b31381`, `test/golden/run.js`
  `e640f3dc13ea3bec`, `test/golden/compare.js` `2b9ad6c339f5ef9e`.
- Environment: Node 22.23.1 with ICU 78.2 and tz 2026a. Every child resolved its locale and
  time zone.
- Baseline (`node test/golden/run.js baseline`) before the first step and after the last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked.
  - Every `extract` and `replay` run also checked its old repositories before and after itself
    (0 differences), and checked that the old sources equal their blobs at legacyHead.
  - Session check: the old repositories' manifests equal the WP2 session snapshot
    (`be22dcba3f669ab2`, 4347 entries, mtimes included): 0 differences.

### Stage B fixes (2026-10-16)

The findings of the stage B verification, each reproduced first, then fixed (decisions 84-91):
xlsx-node-twin-junk (84), privacy-filename-console (85), replay-skips-error-pages (86),
replay-config-from-storage (87) and testlib-parallel-flake (89), plus the verifier's problems
on the ICU memo (88) and the literal invisible characters (90). The other problems are listed
in decision 91.

- Files, as sha256 prefixes: `test/lib/extract.js` `2a7de0730fe5619a`, `test/lib/replay.js`
  `e5846aba84cf3c1f`, `test/golden/run.js` `6f89ede8cdf73138`, `test/lib/mkxlsx.js`
  `a399d1a9b9d41471`, `test/lib/page-driver.js` `bffeac59066e8d49` (a comment),
  `test/unit/extract.test.js` `b30d5e6cc05bfbe3`, `test/unit/replay.test.js`
  `a03469cbf6520de1`, `test/unit/readers.test.js` `bc572e5e664fbec4`,
  `test/unit/testlib.test.js` `8475c30def879063`, `test/unit/escape.test.js`
  `378e250c276a5d99`. No core, provider, build, pinned or pin-list file changed.
- New tests: 10.
  - `readers.test.js` +2: the strict inflate, and the twin on damaged workbooks; its Chrome
    test also compares the twin on the damaged and the random cases.
  - `extract.test.js` +2: the damaged workbooks with the Node twin, and in Chrome against it;
    its twin test now also checks the name-free messages.
  - `replay.test.js` +6: unmodelled steps, the scenario generator's guard, the memo during
    ICU recording, `redact`, and the replay command (no Chrome) and the compare command
    (Chrome) end to end in a scratch tree with a real git old repository.
  - Per file: `extract.test.js` 9, `replay.test.js` 21, `readers.test.js` 19, `testlib.test.js`
    54 and `escape.test.js` 16, all pass. Without Chrome and the old repositories (CI): 6+3,
    19+2, 18+1, 37+1 and 15+1 pass+skipped, 0 fail.
- Mutation check on a scratch mirror of the repository (never the repository): 13/13 mutants
  caught, and the unmutated mirror passes. Each mutant reverts one fix:
  - the twin: zlib alone, no end-of-stream check, zlib's own error texts;
  - the messages: the cache miss and the UTF-16 refusal naming the file;
  - unmodelled steps: arrays read from storage, the unknown previous result kept, unmodelled
    steps compared;
  - the memo turned off while recording;
  - capture errors passing in replay, and in compare;
  - `redact` masking paths only, and the golden paths not noted.
- The whole unit glob (`node --test "test/unit/*.test.js"`, default concurrency): 303 tests,
  303 pass, 0 fail, 0 skipped, 36 s.
- `node tools/provenance.js check`: 23 pins, 0 problems. `rederive --old-root <old-root>`: 23
  pins from 8 old repositories, 23 reproduced byte for byte, 0 problems.
- `replay --parser old --tier full` for all 8: 24 provider environments in child processes,
  covering the same pages, steps and downloads as G3b.
  - 0 mismatches, 0 ICU drift, 0 golden pages with capture errors, 0 unmodelled steps, 0
    incomplete environments; parse threw on the 7 C-seed-badname loads only.
- `replay --parser old --tier quick` for all 8: 0 mismatches, 0 ICU drift, 0 unmodelled steps.
- The goldens are unchanged: the full-tier digest is `62f355cacf3dcc77` and the quick-tier one
  `30b593ca030f2b3a`, as in the G3b (all 8) entry. The extraction cache was hit for every file
  (page key `6d6461f60bb73ed0`).
- The storage experiments of decision 89 ran from the scratchpad on synthetic pages, with no
  statement.
- Lints applied by hand to the changed files and this file's additions: SPDX lines, privacy
  rules 1-4 with the untracked denylist, the 35 app names, home paths, e-mail addresses,
  provider names in shared code, and invisible characters. 0 findings.
- Baseline (`node test/golden/run.js baseline`) before the first step and after the last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. Every
  replay run also checked the old repositories and old sources before and after itself.
  Session check: the old repositories' manifests equal the WP2 session snapshot
  (`be22dcba3f669ab2`, 4347 entries, mtimes included): 0 differences.

### WP7b — eToro page (2026-10-17)

The files are `providers/etoro/provider.js` `31f6423ad1db36f2`, `providers/etoro/app.js`
`069c2188b4f8f6d0`, `providers/etoro/page.html` `73299e435010eebb`,
`providers/etoro/fixtures/statements.js` `1c3fabadca095d4a`, `fixtures/expected.js`
`bf5bf5e3cd76c2e0` and `fixtures/hostile.js` `263d8425ebe0095b` (decisions 92-96). WP7a's
`files.js` (`c3a7802762d3cfea`) and `test.js` (`65c48b6b39bf4b38`) and the pinned parser
(`5d5291ea85639949`) are unchanged: no defect was found in them.

- Build: `node build/build.js --only etoro --csp legacy` wrote `dist/etoro/index.html`, 69,600
  bytes, sha256 `7f36c42228fabf7b` (and the landing page, which every build rewrites).
  `build --check --only etoro` still passes at the end.
- C14 (scratch, with the build's own functions): `verify(html, plan)` reports 0 problems. All
  11 plan pieces (3 four times, 5 twice, 8, 11, 12 twice with `parser.js` before `files.js`,
  and 13) are byte-equal to their sources (58,590 bytes). The policy is the old page's legacy
  string. 69,600 bytes against the 262,144-byte budget. Two builds give the same bytes, and
  `dist/` holds them. A hash-mode build verifies too (a forward check for M10).
- Contract checks by hand, since WP10's runner did not exist yet. When it appeared, near the
  end, `test/contract/run.js --provider etoro` gave 0 problems on both tiers (node: C01-C12,
  C14-C18; browser: C13).
  - C01-C09: `validate` with the parser's exports and the call graph derived from
    `core/export.js`: 0 problems. C08: the parser's only core name is `openingBalance`, which
    `exportOverrides` lists; C08b holds with every core export treated as called.
  - C10a and C10b: `loadNode` and `loadPage` both load; the parser global appears right after
    its piece; both branches export the same 5 names.
  - C11 and C12: 12 garbage parses (2 workbooks, 3 modes, both branches, inputs deep-frozen)
    each give `{error}` and no downloads; none throws.
  - C13: the fixture, read by the production reader in Chrome, parses clean in each mode in
    both branches, `reconcile` is clean, and the two branches give equal downloads for every
    (from, to) pair.
  - C16 through the build's discovery; C17 and C18 on the six files.
- Static page snapshot (empty state, E0, Chrome): equal to the stored goldens' (quick and full,
  E0) after `normaliseStatic`, with W1 once and W3 once and nothing else. A text diff of
  `<main>` against the old `index.html` shows the same two lines; the head adds only the
  referrer meta. The page logs 0 console errors, page errors and CSP violations.
- G4, the custom app's part: `replay --parser new --tier full --providers etoro`, a gate run
  with the reading facts from the descriptor: 0 mismatches, 0 ICU drift, 0 golden pages with
  capture errors, 0 unmodelled steps, and parse threw on no step. It covers the same pages,
  steps and downloads as G3b. The quick tier: 0 mismatches.
- Early G5 signal: `compare --tier quick --providers etoro` against `dist/` (`build --check`
  current): E0 identical, with the waivers W1 1 and W3 1 (the static snapshot); E1 and E2
  identical. That covers the downloads with their zip entries, storage, the UI snapshots, page
  errors and the pass-through cross-check with real downloads.
- The old page against the new one on synthetic workbooks (scratch; the old page read only,
  from `file://`), in E0 and E1: 9 scenarios (the fixture; the hostile file; a last month with
  only the ending anchor; a range without files; a currency with quotes, an ampersand and an
  apostrophe; replace with a bogus file in between; a drop with a text file first; the seeded
  mode values `day` and `holdings`), every mode clicked before and after the range over every
  (from, to) pair, then Clear: 910 steps and 4,022 records, 0 differences in downloads, storage
  and UI snapshots. Those steps include no card with Download all enabled (D20) and a disabled
  `#zip`.
- Smoke by hand: the empty state, with no errors; the bogus `.xlsx` gives a `#status .warn`
  through the picker and through a drop; no horizontal overflow at 390 px, empty or with
  results; the fixture gives one card and 5 non-empty downloads (the four card files and the
  zip) through the picker and through a drop.
- The fixtures golden (`expected.js`, decision 95): 9 states, 45 records, each equal to the
  downloads hook's Node rebuild; two runs gave identical bytes.
- Unit: `readers.test.js` 19/19 (it now also reads back both eToro fixture workbooks, stored
  and deflated) and `etoro-files.test.js` 9/9. The whole unit glob
  (`node --test "test/unit/*.test.js"`): 326 tests, 326 pass, 0 fail, 0 skipped, 37 s.
- Lints by hand on the six files and the two generated pages: SPDX lines, privacy rules 1-4 with the
  untracked denylist, the generic rules (the old QIF expansion and the 35 app names), the sinks
  rules (no banned API; the six old `innerHTML` sinks stay until M8) and invisible characters: 0
  findings. `app.js` keeps the old file's three visible non-ASCII characters (an arrow, an ellipsis
  and a dash). The in-progress `test/lint/run.js` agrees: 0 findings in these files, apart from the
  six sinks when it enforces sinks early.
- Baseline (`node test/golden/run.js baseline`) before the first step and after the last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. Every
  replay and compare run also checked the old repository before and after itself. Session
  check: the old repositories' manifests equal the WP2 session snapshot (`be22dcba3f669ab2`,
  4347 entries, mtimes included): 0 differences.

### WP10 — contract checks, lints, smoke (2026-10-17)

The files: `test/contract/run.js` `d8d01d5572968d05`, `test/lint/files.js` `ff17251d31e1d146`,
`headers.js` `1a00a7695747d701`, `privacy.js` `70ab761c9a81cc40`, `generic.js` `bbff0638f2d2aef4`,
`sinks.js` `ae93b5ad3bf52c49`, `sentinels.js` `5ec284be4a2c1510`, `invisible.js`
`45933879fb87f7fa`, `run.js` `b87367417fdcd901`, `test/smoke/pages.js` `226cf1194003853e`,
`test/smoke/fixtures-golden.js` `d59e18f194dd1c2f`, `test/unit/lint.test.js`
`4e186ee325c7a922`, `test/unit/contract.test.js` `39eaeaba81888900` and
`test/unit/synthetic-tree.js` `1286d9fecb263a0f` (decisions 97-109). `core/contract/` and
`package.json` did not need a change.

- Unit tests, with Chrome: `lint.test.js` 23/23 and `contract.test.js` 31/31. Without Chrome (CI
  step 5): 49 pass, 5 skipped, 0 fail. The whole unit glob (`node --test "test/unit/*.test.js"`):
  364 tests, 364 pass, 0 fail, 0 skipped, 71 s.
- Every check and every rule has a failing and a passing sample:
  - C01-C18, with C13 also failing when Chrome is missing;
  - headers (10 forms);
  - privacy rules home, email, number, denylist and text, with their exemptions;
  - generic provider-name and app-name, with their exemptions;
  - sinks banned, clock, innerHTML, localeCompare and compose, and the report-only status;
  - sentinels and invisible characters;
  - the smoke: a stale page, a page that never warns, a page error, an empty download, overflow,
    a CSP violation and a stale landing page;
  - the fixtures golden: no `expected.js`, a page that differs from the hook (`--update`
    refuses), stale fixtures and a changed record.
- Mutation check on a scratch mirror of the repository (never the repository): 27/27 mutants
  caught: privacy 3, generic 2, sinks 3, invisible 2, headers 2, the file list 1, contract 8,
  smoke 4, fixtures golden 2. The C10b export-name comparison was missed at first; it now has
  its own sample and is caught.
- The synthetic tree (decision 108), built with `build --root`: every command exits 0.
  - build: 3 pages and the landing page.
  - `contract --tier all`: 4 providers (1 skeleton), C15 0 pins, C17 and C18 55 files, C13 4/4.
  - `lint --enforce-sinks`: 0 findings in each of the six lints.
  - smoke: 4 pages (16 page instances, 20 fixture downloads) and the landing page (3 links).
  - fixtures golden, `--update` and then a check: 4 providers, 33 states, 159 records.
- WP3's stub tree, through the same checks: C11 24, C12 8 and C15 1 problems (decision 108).
- The repository at the end of WP10. Only the custom app and versa have a `provider.js`; the
  other six providers are still parser copies, so the checks do not discover them yet.
  - `contract --tier all --old-root <old-root>`: 0 problems. C01-C12, C14 and C16 for both.
    C15: 23 pins, 23 re-derived byte for byte from 8 old repositories. C17 and C18: 147 files.
    C13: the custom app's fixtures (versa has none).
  - lint: headers 0, generic 0, sentinels 0, invisible 0. Privacy 1:
    `test/unit/replay.test.js`:688 (WP6's file) holds an e-mail address in a git `-c` argument;
    reported, not fixed. Sinks (a report until M8) 12: the old renders' `innerHTML`
    assignments, 6 in `core/app/statement-app.js` (WP8) and 6 in the custom app's `app.js`
    (WP7b), which M8 replaces.
  - smoke: 2 pages (7 page instances, 5 fixture downloads) and the landing page (2 links): 0
    problems.
  - fixtures golden: the custom app, 9 states and 45 records, equal to WP7b's `expected.js` and
    to the downloads hook.
  - `build --check`: `dist/` is current (3 files).
- On a scratch copy, `--update` rewrote the custom app's `expected.js` with data lines identical
  to WP7b's; only the header comment differs. The file in the repository is unchanged.
- The lint tool on the WP10 files and this file's additions: 0 findings (headers; privacy with
  the untracked denylist; the generic rules with the 35 app names; invisible characters).
- Baseline (`node test/golden/run.js baseline`) before the first step and after the last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. C15's
  re-derivation read the old repositories with git plumbing only. Session check: the old
  repositories' manifests equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries,
  mtimes included): 0 differences.

### WP8 + versa — statement app and reference provider (2026-10-17)

The files are `core/app/statement-app.js` `d940ca86a6c244ba`, `test/unit/constants.test.js`
`76e36980c373726c`, `providers/versa/provider.js` `f4b53af7cc517a28` and
`providers/versa/page.html` `a5e0220c4971fe76` (decisions 110-115). Besides them only `dist/`
(the build) and this file changed; the pinned parser copy and the core modules are unchanged.

- Build: `node build/build.js --only versa --csp legacy` wrote `dist/versa/index.html`,
  1,501,845 bytes, sha256 `bb534e5b3ca67051` (and the landing page). `build --check --only versa`
  passes at the end.
- C14 (scratch, with the build's own functions): `verify(html, plan)` reports 0 problems. All 13
  plan pieces (1, 2, 3 four times, 6, 7, 8, 10, 11, 12, 13) are byte-equal to their sources. The
  policy is the old page's legacy PDF string, and the title and policy equal the old page's.
  1,501,845 bytes against the 2,097,152-byte budget; `dist/` holds the in-memory build.
  WP10's runner, when it appeared: `test/contract/run.js --tier node --provider versa --csp
  legacy` gave C01-C12, C14 and C16 clean, C15 23 pins, C17 and C18 on the 4 files, 0
  problems; `--tier browser`: C13 (no fixtures), 0 problems. `test/smoke/pages.js --provider
  versa`: 3 page instances, 0 problems.
- Static page snapshot (empty state, E0, Chrome): equal to the stored quick E0 golden's after
  `normaliseStatic`, with W1 once and W3 once and nothing else.
- G4, versa's part: `replay --parser new --tier full --providers versa`, a gate run with the
  descriptor: 0 mismatches, 0 ICU drift, 0 golden pages with capture errors, 0 unmodelled steps;
  parse threw on 1 step (the C-seed-badname load, as on the old page). It covers the same pages,
  steps and downloads as G3b. The quick tier: 0 mismatches.
- Early G5 signal on the final page (`build --check --only versa` current, then `compare --page`
  with the absolute path of `dist`, decision 115): `--tier quick` E0 identical with W1 1 and W3 1
  (the static snapshot), E1 and E2 identical, with the pass-through cross-check of real
  downloads. `--tier full`: E0, E1 and E2 identical.
- The switches of all seven apps (decision 114), scratch:
  - The Node differential against the old apps: 60 seeds per app, 420 runs, 518,377 log entries
    (48,908 downloads, 2,883 parses), 0 differences; on the final file, 10 seeds per app: 70
    runs, 84,089 entries, 0 differences. A mutation check of the harness, one mutant of the app
    per switch or moved block (busy noun, bank branch, kind label, both `downloadOnly`
    supersets, notes, hiding on and off, the three status branches, both warning texts, the
    openings currency and noun, extra warnings, section order and the reconciled and late
    sections, owner, detailed set, labels, page transform, reader order, listener order, the
    mode and config writes, the zip name, the null result): 28 of 28 caught.
  - The six other apps on real data, scratch pages built from the draft descriptors and
    page.html drafts (app revision `7bcacef756973529`, which differs from the final file in
    comments only: the two give the same 262 code lines once comments are removed): static
    snapshots equal with W1 and W3 only, titles and policies equal; `--tier quick` identical
    (W3 also on the legacy-markup app's configurator markup); `--tier full`, all identical (W3
    again on the legacy-markup app's configurator markup). With versa's full run, the seven
    statement apps are identical over the pages, steps and records of G3b's statement-app run.
- Unit: `constants.test.js` 7/7. The whole unit glob (`node --test "test/unit/*.test.js"`):
  364 tests, 364 pass, 0 fail, 0 skipped, 39 s.
- Lints: by hand on the four files (SPDX lines, privacy rules 1-4 with the untracked denylist, the
  35 app names and the old QIF expansion, provider names in shared code, the sinks rules, invisible
  characters): 0 findings. The in-progress `test/lint/run.js` agrees for these files, apart from the
  six `innerHTML` sinks of the app, which it reports only until M8 (the old renders, design §3.12).
  Its one failure is outside WP8's files: the e-mail address in `test/unit/replay.test.js`:688 of
  decision 100.
- Baseline (`node test/golden/run.js baseline`) before the first step and after the last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. Every
  replay and compare run also checked its old repositories before and after itself: 0
  differences.

### WP9 A — maybank, posb, moomoo (2026-10-17)

The files are `providers/maybank/provider.js` `e0498f72618fb424`, `providers/maybank/page.html`
`e80f86a2beac841e`, `providers/posb/provider.js` `f840e779b9fb6746`, `providers/posb/page.html`
`306ac04d8b4ad5c1`, `providers/moomoo/provider.js` `e39e5cade7672d15` and
`providers/moomoo/page.html` `6c461a053d7d8713` (decisions 116-119). Besides them only `dist/`
(the build) and this file changed; the pinned parser copies, `core/app/statement-app.js` and the
core modules are unchanged, and the statement app needed nothing new.

- Build: `node build/build.js --only maybank,posb,moomoo --csp legacy` wrote
  `dist/maybank/index.html` (1,500,001 bytes, sha256 `6ffa7ebc214a0b6e`),
  `dist/posb/index.html` (1,521,141 bytes, `b8851d14e954f669`) and `dist/moomoo/index.html`
  (1,509,027 bytes, `0d9066dbd6809844`), and the landing page. `build --check --only
  maybank,posb,moomoo` passes at the end.
- C14 (scratch, with the build's own functions): `verify(html, plan)` reports 0 problems for
  each page. Every plan piece is byte-equal to its source: 13 for maybank and moomoo (1, 2, 3
  four times, 6, 7, 8, 10, 11, 12, 13), 14 for posb (with 4, the CSV reader). The policy, the
  title and the picker (`accept` and `multiple`) equal the old page's, each page is within the
  2,097,152-byte budget, two builds give the same bytes, and `dist/` holds them.
  `test/contract/run.js --tier node --provider maybank,posb,moomoo --csp legacy`: C01-C12, C14
  and C16 clean for all three, C15 23 pins, C17 and C18 on the 12 files, 0 problems; `--tier
  browser`: C13 (no fixtures), 0 problems. `test/smoke/pages.js --provider maybank,posb,moomoo`:
  11 page instances, 0 problems.
- Static page snapshot (empty state, E0, Chrome): equal to the stored quick and full E0 goldens'
  after `normaliseStatic`, with W1 once and W3 once per page and nothing else; 0 console errors,
  page errors and CSP violations.
- G4, the three providers' part: `replay --parser new --tier full --providers <id>`, one gate run
  per provider with the reading facts from the descriptor. Each: 0 mismatches, 0 ICU drift, 0
  golden pages with capture errors, 0 unmodelled steps, 0 incomplete environments; parse threw
  only on the C-seed-badname load, as on the old page. The runs cover the same pages, steps and
  downloads as G3b. The quick tier (`--providers maybank,posb,moomoo`): 0 mismatches.
- Early G5 signal on the final pages (`build --check --only` current, then `compare --page` with the
  absolute path of `dist`, decision 115): identical in every environment on `--tier quick` and on
  `--tier full`, with W1 1 and W3 1 on each E0 static snapshot; on the quick tier, every record was
  also cross-checked against a real download. That covers the downloads with their zip entries,
  storage, the UI snapshots and page errors.
- The descriptors against the old apps (scratch): for each provider the resolved runtime was
  compared, switch by switch, with what the old `src/app.js` blob does (busy noun, kind model,
  mode-switch hiding, status, openings currency and noun, extra warnings, diagnostics sections in
  their order, skipped-row owner, detailed categories, skip labels in their order, the five card
  notes and the bank months label, both warning texts, the download noun): 0 differences. It
  also equals the runtime of WP8's draft descriptors (decision 114) key for key. 22 mutants of
  the three descriptors (scratch copies) were all caught, also with that WP8 comparison turned
  off.
- Lints: `test/lint/run.js` finds nothing in the six files, the three pages or the landing page
  (headers, privacy with the untracked denylist, the generic rules with the 35 app names, invisible
  characters). Its findings are those of earlier entries: the e-mail address in
  `test/unit/replay.test.js`:688 (decision 100) and the 12 report-only sinks. `posb/provider.js`
  holds the old warning text's three typographic characters (“ ” ’); the other five files are ASCII
  only.
- Unit: the whole glob (`node --test "test/unit/*.test.js"`): 364 tests, 364 pass, 0 fail, 0
  skipped, 65 s. No unit file changed.
- Baseline (`node test/golden/run.js baseline`) before the first step and after the last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. Every
  replay and compare run also checked its old repositories before and after itself: 0
  differences.

### WP9 B — chocolate, maribank, stashaway (2026-10-17)

The files are `providers/chocolate/provider.js` `4c32a9172bd14326`, `providers/chocolate/page.html`
`d37b7c64df614c4b`, `providers/maribank/provider.js` `980feaaac02c93cb`,
`providers/maribank/page.html` `3841798d3cb45b1c`, `providers/stashaway/provider.js`
`648b64a36a2169d9`, `providers/stashaway/page.html` `cb6008e961d84727` and
`providers/stashaway/test.js` `7c6546b432b3ae0f` (decisions 120-123). Besides them only `dist/` (the
build) and this file changed. The pinned parser and layout copies, the core modules and
`core/app/statement-app.js` (`d940ca86a6c244ba`) are unchanged: no provider needed behaviour the
statement app lacks.

- Build: `node build/build.js --only chocolate,maribank,stashaway --csp legacy` wrote
  `dist/chocolate/index.html` (1,493,928 bytes, sha256 `81e166fc5857207f`),
  `dist/maribank/index.html` (1,504,641 bytes, `a0850227a5d7a65d`) and `dist/stashaway/index.html`
  (1,516,604 bytes, `9ce4e27409cc9069`), and the landing page. `build --check --only
  chocolate,maribank,stashaway` passes at the end.
- C14 (scratch, with the build's own functions): `verify(html, plan)` reports 0 problems for each
  page. Every plan piece is byte-equal to its source: chocolate and maribank 13 pieces (1, 2, 3 four
  times, 6, 8, 10, 11, 12 twice with `layout.js` before `parser.js`, 13), stashaway 12 (one piece
  12, no piece 7). The policy is the old page's legacy PDF string and the title the old page's;
  1,493,928, 1,504,641 and 1,516,604 bytes against the 2,097,152-byte budget; two builds give the
  same bytes, and `dist/` holds them. `test/contract/run.js --tier all --provider
  chocolate,maribank,stashaway --csp legacy --old-root <old-root>`: C01-C12, C14 and C16 clean for
  each, C13 (no fixtures), C15 23 pins re-derived byte for byte from 8 old repositories, C17 and C18
  on the 15 files: 0 problems.
- Static page snapshot (empty state, E0, Chrome): equal to the stored quick and full E0 goldens'
  after `normaliseStatic`, with W1 once and W3 once and nothing else (golden → normalised = new:
  chocolate `0ca759f6b76b1f0d` → `4250162e7829c74a`, maribank `02d358ff0bc4e57d` →
  `70a0d5e6b67010a2`, stashaway `fbb4460d9f653bc1` → `fe740d351584307f`); 0 console errors, page
  errors and CSP violations. The raw text of `<main>` against the old `index.html`: 2, 2 and 5
  differing lines, each one W1 or W3 (decision 121).
- G4, these three providers' part: `replay --parser new --tier full --providers
  chocolate,maribank,stashaway`, a gate run with the reading facts from the descriptors (stashaway's
  page transform included): 0 mismatches, 0 ICU drift, 0 golden pages with capture errors, 0
  unmodelled steps, 0 incomplete environments; parse threw on 1 step each, the C-seed-badname
  load, where the old page threw too. It covers the same pages, steps and downloads as G3b. The
  quick tier: 0 mismatches. A first full run, before `test.js` existed, gave the same result; the
  run reported here is on the final files.
- Early G5 signal on the final pages (`build --check --only …` current, then `compare --page` with
  the absolute path of `dist`, decision 115): `--tier quick`: identical in E0, E1 and E2, with W1 1
  and W3 1 (the static snapshot) for chocolate and maribank; for stashaway W1 1, and W3 also on
  its legacy configurator markup in every environment, as in the goldens' self-test. That
  includes the pass-through cross-check of real downloads, storage, UI snapshots and page errors.
  `--tier full`: E0, E1 and E2 all identical (stashaway with W1 1 and W3 on its legacy
  configurator markup).
- The descriptors against the old apps (decision 120): 28, 28 and 27 scratch checks pass; 12/12
  descriptor mutants caught. The `reference` hook (decision 123): 18 synthetic cases, 400 seeded
  cases equal to the old compare.js, 10/10 mutants caught, and the real-data check clean.
- Smoke: `test/smoke/pages.js --provider chocolate,maribank,stashaway`: 3 page instances each, 0
  problems.
- Lints: `node test/lint/run.js` finds nothing in these files or their pages (headers; privacy with
  the untracked denylist; generic with the 35 app names; sinks; sentinels; invisible characters).
  The run fails only on the e-mail address of decision 100 (`test/unit/replay.test.js`:688), and
  the sinks report (until M8) lists the 12 old `innerHTML` assignments of the two app scripts. The
  non-ASCII characters in these files are the old texts' `−` and `™` in stashaway's `page.html`.
- Unit: the whole glob (`node --test "test/unit/*.test.js"`): 364 tests, 364 pass, 0 fail, 0
  skipped, 38 s. No unit file changed; the checks of this package's own files are scratch.
- Baseline (`node test/golden/run.js baseline`) before the first step and after the last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. Every replay
  and compare run also checked its old repositories before and after itself: 0 differences.
  Session check: the old repositories' manifests equal the WP2 session snapshot
  (`be22dcba3f669ab2`, 4347 entries, mtimes included): 0 differences.

### G4 — pages, pure move (2026-10-17)

The gate of design §8.1 M5 over all eight providers, on the tree the page packages left (WP7b,
WP8 + versa, WP9 A, WP9 B and WP10). One file changed for the gate: `test/unit/replay.test.js`
(`d66b33fe25c9042c`, decision 124). Every other file the gate ran on has the sha256 its package
logged, among them `core/app/statement-app.js` `d940ca86a6c244ba`, the eight `provider.js` and
`page.html` files, `providers/stashaway/test.js` `7c6546b432b3ae0f`, the custom app's six files,
`test/contract/run.js` `d8d01d5572968d05`, `test/smoke/pages.js` `226cf1194003853e`,
`test/smoke/fixtures-golden.js` `d59e18f194dd1c2f`, `test/golden/run.js` `6f89ede8cdf73138`,
`test/lib/replay.js` `e5846aba84cf3c1f` and `test/lib/load-provider.js` `db6c3ea971b31381`. No
statement-app switch or descriptor value was missing (decision 125).

- Pages: `node build/build.js --check`: `dist/` is current (9 files), built in the default CSP
  mode, `legacy`. As sha256 prefixes and sizes: chocolate `81e166fc5857207f` (1,493,928 bytes),
  etoro `7f36c42228fabf7b` (69,600), maribank `a0850227a5d7a65d` (1,504,641), maybank
  `6ffa7ebc214a0b6e` (1,500,001), moomoo `0d9066dbd6809844` (1,509,027), posb
  `b8851d14e954f669` (1,521,141), stashaway `9ce4e27409cc9069` (1,516,604) and versa
  `bb534e5b3ca67051` (1,501,845), and the landing page `6a6211c925b8f86d`. A scratch check
  against each old `index.html` (read only): the CSP, the title and the picker's `accept` and
  `multiple` are equal, 8/8.
- Contract checks: `node test/contract/run.js --tier all --old-root <old-root> --csp legacy`: 8
  providers, 0 problems, 0.6 s.
  - Node tier: C01-C12, C14 and C16 clean for each provider; C15 23 pins, all re-derived byte for
    byte from the 8 old repositories; C17 and C18 on 166 files.
  - Browser tier: C13 on the custom app's fixtures; the seven statement providers have none
    (decision 125).
  - Run apart, `--tier node` and `--tier browser` took 0.3 s each, 0 problems each.
- Lints: `node test/lint/run.js`, 166 files, exit 0, 1.0 s. Headers, privacy (with the untracked
  denylist), generic (35 app names), sentinels and invisible characters: 0 findings each. Sinks,
  a report until M8: the 12 old `innerHTML` assignments, 6 in `core/app/statement-app.js` and 6
  in the custom app's `app.js`.
- Unit: `node --test "test/unit/*.test.js"`: 364 tests, 364 pass, 0 fail, 0 skipped, 36 s.
  Without Chrome and the old repositories (`CHROME` and `S2C_OLD_ROOT` pointed at nothing): 348
  tests, 320 pass, 28 skipped, 0 fail, 35 s.
- Smoke: `node test/smoke/pages.js`: 8 pages (27 page instances, 5 fixture downloads) and the
  landing page (8 links), 0 problems, 5.9 s. `node test/smoke/fixtures-golden.js`: the custom
  app, 9 states and 45 records, equal to its `expected.js` and to the downloads hook, 0 problems,
  0.7 s.
- Provenance: `node tools/provenance.js check`: 23 pins, 0 problems. `rederive --old-root
  <old-root>`: 23 pins from 8 old repositories, 23 reproduced byte for byte, 0 problems.
- Replay: `node test/golden/run.js replay --parser new --tier full`, a gate run with the reading
  facts and the runtime from the descriptors (not the frozen runtime). 24 provider environments
  ran in child processes, 4 at a time. 100% equal:
  - 0 mismatches, 0 ICU drift, 0 golden pages with capture errors, 0 unmodelled steps, 0
    incomplete environments. Parse threw only on each statement app's C-seed-badname load (E0),
    where the old page threw too.
  - It covers the same pages, steps and downloads as G3b. Every statement-app Download all was
    rebuilt as `zipParts(allFiles(), now)` under `zipName("csv")`, and the custom app's through
    its `files.js`.
  - The quick tier: 0 mismatches, 0 ICU drift, 0 unmodelled steps.
  - Extraction: every file was a cache hit (page key `6d6461f60bb73ed0`): the statements and 8
    reader failures (each provider's synthetic bogus file). The goldens are unchanged: full-tier
    digest `62f355cacf3dcc77`, quick-tier `30b593ca030f2b3a`.
- Static page snapshot (scratch, decision 125), 2.4 s: each page equals the stored quick and full
  E0 goldens' after `normaliseStatic`, with W1 once and W3 once and nothing else. Golden →
  normalised = new: chocolate `0ca759f6b76b1f0d` → `4250162e7829c74a`, etoro
  `22b538742584e3b6` → `554ae4350ef0115e`, maribank `02d358ff0bc4e57d` → `70a0d5e6b67010a2`,
  maybank `a4f04f091d48f77b` → `50a048814abe507f`, moomoo `328a58d2efb85274` →
  `b8237ad8ba966592`, posb `807588d75af8b634` → `d3988d878a124834`, stashaway
  `fbb4460d9f653bc1` → `fe740d351584307f`, versa `ea1f436b67f0d14d` → `5542d9288dba2fce`. 0
  console errors, page errors and CSP violations. The raw `<main>` differs from the old
  `index.html` on 2 lines per page (W1, and W3's `#empty` style), and on 5 for stashaway (W3 also
  on its three legacy configurator lines).
- Early G5 signal, not a gate (M6 runs G5 after the canaries): `compare --tier quick --page dist`
  on the final tree, all eight: 24 environments identical, with the pass-through cross-check of
  real downloads (downloads with their zip entries, storage, UI snapshots and page errors).
  Waivers: W1 1 and W3 1 on each E0 static snapshot; stashaway's W3 also maps its legacy
  configurator markup, in E0, E1 and E2. The packages' full-tier compares (their entries above)
  ran on the same page bytes.
- Baseline (`node test/golden/run.js baseline`) before the first step and after the last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. Every
  replay and compare run also checked the old repositories before and after itself. Session
  check: the old repositories' manifests equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347
  entries, mtimes included): 0 differences.

### Stage C1 fixes (2026-10-17)

The findings of the stage C part 1 verification, each checked first, then fixed (decisions
126-135): sinks-report-only-all-rules (129), sinks-blind-spots (130),
statement-app-no-ci-coverage (131, 132), decision-122-incomplete (127) and
derivation-map-gen1-lines (128), plus the verifier's problems on decision 110's counts (126),
nested runtime paths (133), the private extraction cache (134) and the missing `core/README.md`
(135). Its other problems need no change: the 12 report-only `innerHTML` sinks are expected until
M8, and statement-app.js's equivalence no longer rests on browser compares alone (decision 132).

- Files, as sha256 prefixes: `test/lint/sinks.js` `2d556b4d09510501`, `test/lint/run.js`
  `3a844351b76b7c89`, `test/unit/lint.test.js` `8afc7141bc647a86`,
  `test/unit/constants.test.js` `d70f2c0f6944bb5a`, `test/unit/contract.test.js`
  `ce56cd24e1343cd7`, `test/unit/synthetic-tree.js` `32be67d520942dd7`, and two new files,
  `test/unit/statement-app.test.js` `59a7a1d0c67a7e0e` and `core/README.md`
  `19b1fe4967f6c07c`; besides them only this file changed. No page code changed:
  `core/app/statement-app.js` is still `d940ca86a6c244ba`, and no core module, provider, build,
  pinned or pin-list file and nothing in `dist/` changed.
- New tests: 8. `lint.test.js` 27 (+4: the banned, clock, innerHTML and localeCompare samples,
  and the per-rule enforcement test in place of the old report-only one), `constants.test.js` 8
  (+1), `statement-app.test.js` 3 (new); `contract.test.js` 31, with the copy and cache checks
  added to two tests. All pass.
- Mutation check on a scratch mirror of the repository (never the repository): 17/17 mutants
  caught. 12 of the sinks lint and runner (each new rule dropped, every rule report-only, a string
  argument read as none, the runner's old lint-wide switch), 3 of the app's runtime paths (a
  misspelt nested storage key, an alias of `D.storage`, a misspelt pdf key), the extraction cache
  not isolated (run with a scratch cache home, so nothing reached the real one), and a stub app in
  the synthetic tree. The differential's own sensitivity test catches 4 app mutants in all 7
  apps.
- The whole unit glob (`node --test "test/unit/*.test.js"`): 372 tests, 372 pass, 0 fail, 0
  skipped, 42 s. Without Chrome and the old repositories: 356 tests, 325 pass, 31 skipped, 0
  fail, 32 s.
- Lints: `node test/lint/run.js`, 168 files, exit 0. Headers, privacy (with the untracked
  denylist), generic (35 app names), sentinels and invisible characters: 0 findings each. Sinks:
  0 findings that count, and the 12 old `innerHTML` assignments as report-only notes (6 in
  `core/app/statement-app.js`, 6 in the custom app's `app.js`); `--enforce-sinks` fails on
  exactly those 12.
- Contract checks: `node test/contract/run.js --tier all --old-root <old-root> --csp legacy`: 8
  providers, 0 problems; C15 23 pins re-derived byte for byte; C17 and C18 on 168 files.
  `node build/build.js --check`: `dist/` is current (9 files).
- Smoke: 8 pages (27 page instances, 5 fixture downloads) and the landing page (8 links), 0
  problems. Fixtures golden: the custom app, 9 states and 45 records, 0 problems.
- Provenance: `check` 23 pins, 0 problems; `rederive --old-root <old-root>` 23 reproduced byte
  for byte from 8 old repositories.
- Replay, as confirmation (no provider's code path changed): `replay --parser new --tier full`
  for all 8: 0 mismatches, 0 ICU drift, parse threw only on the 7 C-seed-badname loads. It
  covers the same pages, steps and downloads as G4.
- Static page snapshots (G4's scratch check): all 8 equal to the stored quick and full E0
  goldens' after `normaliseStatic`, with W1 once and W3 once each, and the same hashes as in the
  G4 entry; 0 page errors.
- The computed-style check of decision 127: 4 pages, 10 states, 819 elements, 0 differences.
- Extraction cache: the 8 synthetic-tree entries removed (decision 134); after the unit runs,
  still 0. Page key `6d6461f60bb73ed0` unchanged.
- Baseline (`node test/golden/run.js baseline`) before the first step and after the last: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. The
  replay also checked the old repositories before and after itself. Session check: the old
  repositories' manifests equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries,
  mtimes included): 0 differences.

### G1b — harness sensitivity, versa (2026-10-17)

M6's first step (design §6.7.7, §8.1): `node test/golden/run.js canary --provider versa`, on the
tree of the stage C part 1 commit with no file changed. The runner built versa four times with
`--only versa --inject test/golden/canaries/<c>.js --out <private-dir>/canary/<c>/`, in the
default CSP mode, `legacy`, and compared each build against the quick golden page
`versa/E0/O0/I0/C0` (E0 manifest `3a2466c7991517f6`): its steps, its download records and the
static page snapshot, recorded with playwright-core 1.57.0 and Chrome 143.0.7499.4, the versions
of the run. Files, as sha256 prefixes:
`test/golden/run.js` `6f89ede8cdf73138`, `test/golden/compare.js` `2b9ad6c339f5ef9e`,
`build/build.js` `ad4ee1228a320efc`, and the canaries `brand.js` `0ecc81e85dc504ed`, `cent.js`
`e9dcd2e1c88d7160`, `zip-order.js` `8abbdd7036d5072f` and `zip-time.js` `4b8bcc7982b17fcc`.

- Result: all four canaries fail, each exactly as expected. The runner's check
  (`compare.checkCanary` over the comparator's structured mismatches) reports only `downloads`
  mismatches and no problem for each. Exit 0.
- Re-derived independently (scratch) from the structured mismatch records in each canary's
  private diff folder and the golden steps; the folders hold exactly the report's counts.
  Mismatches by trigger and field:
  - brand: `name` on every Accounts CSV and Combined CSV, whose size and sha256 stay equal; on
    every zip, `entries.name` and `entries.set` for each entry with the brand in its name, plus
    `sha256` and `size`. Card files: 0.
  - cent: `sha256` with equal name and size on every card transactions CSV. On each one's
    Download-all zip: `sha256`, and on the same entry `entries.sha256` and `entries.crc32`, with
    `entries.set` naming exactly that file on both sides. Name or size mismatches (records or
    entries): 0. The other card files and the Accounts and Combined downloads: 0.
  - zip-order: `sha256` and `entries.order`, with equal name and size, on every zip. Entry-set,
    entry name, size, CRC, sha256 and DOS time mismatches: 0; non-zip records: 0.
  - zip-time: `sha256` with equal name and size on every zip; `entries.dosTime` on every entry;
    DOS date 0; order, name, size, CRC and entry sha256 mismatches 0; non-zip records 0.
  - No UI, storage, step, page-error or static-snapshot mismatch in any canary. The mismatches
    lie on the steps that offer the downloads each canary changes (step 0 has none).
- Canary pages: each is `dist/versa/index.html` (`bb534e5b3ca67051`) with one more `<script>`
  block holding its own piece, at the same offset in all four (plan piece 12b), and no other
  byte changed: brand `0fab100a9c78c713` (1,502,474 bytes), cent `165c1cd391633f4a`
  (1,503,501), zip-order `daec63e91e1b7d00` (1,502,626) and zip-time `dc0749639cfd2a59`
  (1,502,625). The landing page each build also writes equals `dist/index.html`. They stay in
  `<private-dir>/canary/<c>/`, which `build/build.js` writes with its default modes
  (directories 0755, files 0644) inside the 0700 private directory; they are builds of the
  repository's sources and hold no statement data. The diff folders are 0700 and their files
  0600.
- Nothing reached the repository. A file manifest of the repository (`fsManifest` of
  `test/lib/baseline.js`, 625 entries with mtimes, `dist/` and `.git/index` included), taken
  before the run and again after it, before any git command: 0 differences. No file in `dist/`
  holds a canary piece. `node build/build.js --check`: `dist/` is current (9 files) before and
  after, with the sha256 prefixes of the G4 entry. `git status`: clean apart from this file.
- Baseline: the canary run checked versa's old repository before and after itself (68 manifest
  entries, 0 problems, live page checked, 0 differences). `node test/golden/run.js baseline`
  after the run: 8 old repositories, 4347 manifest entries, 0 problems, 0 differences, live
  pages checked. Session check: the old repositories' manifests equal the WP2 session snapshot
  (`be22dcba3f669ab2`, 4347 entries, mtimes included): 0 differences.
- With this entry in place: `node test/lint/run.js`, 168 files, exit 0 (headers, privacy,
  generic, sentinels and invisible characters 0 findings each; sinks 0 that count, plus the 12
  report-only notes until M8); `node test/contract/run.js --tier node`: 8 providers, 0
  problems, C17 and C18 on 168 files.

### G5 — golden equivalence, versa and maybank (2026-10-17)

M6's per-provider gate (design §6.7.2 step 5, §6.7.5, §6.7.6, §8.1) for the first two providers
of M6's order, after G1b, on the tree of the stage C part 1 commit with only this file changed.
As sha256 prefixes: `dist/versa/index.html` `bb534e5b3ca67051`, `dist/maybank/index.html`
`6ffa7ebc214a0b6e`, the landing page `6a6211c925b8f86d`, `core/app/statement-app.js`
`d940ca86a6c244ba`, the four provider files with the hashes of the WP8 and WP9 A entries, and
`test/golden/run.js` `6f89ede8cdf73138`, `compare.js` `2b9ad6c339f5ef9e`, `scenarios.js`
`b8d5a618de70d477` and `waivers.js` `fc802f2fee5e2780`; playwright-core 1.57.0 and Chrome
143.0.7499.4, the goldens' versions. Each provider ran the five steps in order (live check,
`build --check`, quick, full, exhaustive). Each of the four golden-harness steps is one
invocation that also checked the provider's old repository before and after itself (68
manifest entries, 0 problems, live page checked, 0 differences). Reports are the sha256 prefixes
of `<private-dir>/reports/<run>.json`.

| provider | tier | report |
|---|---|---|
| versa | quick | `5e2764f57405d5bd` |
| versa | full | `44eeefd774952a8d` |
| versa | exhaustive (live) | `adc08fd878f4563f` |
| maybank | quick | `53e872ec43af6130` |
| maybank | full | `1aee484a0e4848bf` |
| maybank | exhaustive (live) | `79489acefec217a3` |

- Result: G5 passes for both. Every step of every run is identical in all three environments: 0
  mismatches of any category (steps, downloads with their zip entries, storage, UI snapshots, page
  errors, the static page snapshot), with no CSP violation and no page or console error that the old
  page lacks. Waivers: W1 1 and W3 1 per run, both on the E0 static snapshot, and nothing else.
  Disabled records, where there are any, are compared like the others (trigger, account, card, kind
  and the disabled flag, in order) and are equal. Exit 0 each; no diff folder was written.
- Live check (step 1), `node test/golden/run.js baseline --providers <id>`, first attempt each:
  HEAD equals legacyHead, `index.html` equals its blob and `legacyIndexSha256`, and the live
  page at `legacyUrl` has that sha256 (versa `d649263fffede5d3…`, 0.3 s, report
  `a3aaa0026eeb8672`; maybank `4038854aeaa5c60b…`, 0.4 s, report `1e840b36d3563dcb`). Step 2,
  `node build/build.js --check`: `dist/` is current (9 files) for each provider, and again
  after the last run.
- Quick (step 3) against the stored quick goldens (versa E0 `3a2466c7991517f6`, E1
  `679fe30b8106ecb7`, E2 `66ea1e165147089e`; maybank `b662fcbc2134a71d`, `709c43c9c3f470f2`,
  `a56a000886c6f7bc`), with the pass-through cross-check of real downloads, each step's count equal
  to the golden's. Full (step 4) against the stored full goldens (versa `3dc18d3c5850d835`,
  `10f6ac3d74265b3b`, `009cf10d9cdaff4a`; maybank `d3c75779d43db2ce`, `ec92e9e629f22c6e`,
  `16ce6dfe29169342`), over the same pages, steps and downloads as G4.
- Exhaustive (step 5): no exhaustive goldens are stored, so `live --tier exhaustive` captured each
  old page (read only, from `file://`) and compared the new page with it in the same run. The tier
  differs from full on two E0 pages, `<id>/E0/O0/I0/C0` and `<id>/E0/O0/I0/C-ui-combo`, which
  iterate every range pair. The lists, regenerated in scratch from the stored probes, give exactly
  the runs' pages and steps. The old pages' download bytes stayed in
  `<private-dir>/live/<run>/<id>/blobs` during each run and were deleted at its end; the empty
  `<id>` folders (0700) remain. Both runs were well under design §6.7.5's "overnight".
- Counts: quick and full from the stored goldens with the harness's own `manifestStats` (scratch).
  The `live` report holds steps, mismatches and waivers only, so the exhaustive pages, records, zips
  and entries come from a passive counter preloaded into the same two runs (`node --require
  <scratch>/live-counter.js test/golden/run.js live …`): it wraps `PageComparison.prototype.step`
  and `finish`, calls them first and returns their results unchanged, and tallies the records on
  both sides of every step; old and new gave the same counts, and the verdict, report and exit code
  are the harness's own. On `compare --tier quick --providers versa` (identical, report
  `debb8f54a0b92fab`) the counter gave exactly the stored goldens' counts.
- Nothing reached the repository. A file manifest of the repository (`fsManifest` of
  `test/lib/baseline.js`, 625 entries with mtimes, `dist/` and `.git/index` included), taken
  after versa's live check and again after the last run, before any git command: 0
  differences. A first manifest, taken before versa's live check, differs from both only in
  the mtime of the repository's root folder: the scratch helper that ran that check wrote its
  log (the command's console lines, counts only) into the root folder, from where it was
  moved to the scratch folder shortly after, and the helper now writes there.
- Baseline: `node test/golden/run.js baseline` after the last run: 8 old repositories, 4347
  manifest entries, 0 problems, 0 differences, live pages checked (3.6 s, report
  `e9826a5cf6be89e4`). Session check: the old repositories' manifests before the first run and
  after the last equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries, mtimes
  included): 0 differences.
- With this entry in place: `node test/lint/run.js`, 168 files, exit 0 (headers, privacy,
  generic, sentinels and invisible characters 0 findings each; sinks 0 that count, plus the 12
  report-only notes until M8); `node test/contract/run.js --tier node`: 8 providers, 0
  problems, C17 and C18 on 168 files.

### G5 — golden equivalence, posb and moomoo (2026-10-17)

M6's per-provider gate (design §6.7.2 step 5, §6.7.5, §6.7.6, §8.1) for the next two providers
of M6's order, posb then moomoo, on the tree of the previous entry: the stage C part 1 commit
with only this file changed. As sha256 prefixes: `dist/posb/index.html` `b8851d14e954f669`,
`dist/moomoo/index.html` `0d9066dbd6809844`, the landing page `6a6211c925b8f86d`,
`core/app/statement-app.js` `d940ca86a6c244ba`, the four provider files with the hashes of the
WP9 A entry, and the harness files with the hashes of the previous entry; playwright-core
1.57.0 and Chrome 143.0.7499.4, the goldens' versions. Each provider ran the five steps in order
(live check, `build --check`, quick, full, exhaustive), one run at a time. Each of the four
golden-harness steps is one invocation that also checked the provider's old repository before
and after itself (posb 68 manifest entries, moomoo 69; 0 problems, live page checked, 0
differences). E1 and E2 run the `O0/I0/C0` page in the quick tier, and it and `O0/I0/C-ui-combo`
in the full and exhaustive tiers; E0 runs every page. Reports are the sha256 prefixes of
`<private-dir>/reports/<run>.json`.

| provider | tier | report |
|---|---|---|
| posb | quick | `df93b3e2ba51eb28` |
| posb | full | `b7aa6083ca95cbbd` |
| posb | exhaustive (live) | `b82a59be68e8617c` |
| moomoo | quick | `33340a25246284e8` |
| moomoo | full | `49b2e50518c81899` |
| moomoo | exhaustive (live) | `abe1668d44100ef8` |

- Result: G5 passes for both. Every step of every run is identical in all three environments: 0
  mismatches of any category (steps, downloads with their zip entries, storage, UI snapshots, page
  errors, the static page snapshot), with no CSP violation and no page or console error that the old
  page lacks. Waivers: W1 1 and W3 1 per run, both on the E0 static snapshot, and nothing else.
  Disabled records, where there are any, are compared like the others (trigger, account, card, kind
  and the disabled flag, in order) and are equal. Exit 0 each; no diff folder was written.
- Live check (step 1), `node test/golden/run.js baseline --providers <id>`, first attempt each:
  HEAD equals legacyHead, `index.html` equals its blob and `legacyIndexSha256`, and the live
  page at `legacyUrl` has that sha256 (posb `e2d008cc51c310ac…`, 0.5 s, report
  `0cbd5def8b52063a`; moomoo `eee74a3a012f4cdb…`, 0.6 s, report `fad7474070a7e7a9`). Step 2,
  `node build/build.js --check`: `dist/` is current (9 files) for each provider, and again
  after the last run.
- Quick (step 3) against the stored quick goldens (posb E0 `1eb5205e4ef28867`, E1
  `d4c93fdf512a2901`, E2 `48695bf5c4804cac`; moomoo `92a1b046a4b68fdb`, `2c66cae11e49ff37`,
  `945a0df6de3c64d8`), with the pass-through cross-check of real downloads, one for every record, as
  in the goldens. Full (step 4) against the stored full goldens (posb `cfa08f89e7e85fc7`,
  `54f2357a0051deba`, `8451f064cd39489f`; moomoo `6b8fea155727765a`, `9769db99857645e0`,
  `14ec84208f027b8c`), over the same pages, steps and downloads as G4.
- Exhaustive (step 5): no exhaustive goldens are stored, so `live --tier exhaustive` captured each
  old page (read only, from `file://`) and compared the new page with it in the same run. The tier
  differs from full on two E0 pages, `<id>/E0/O0/I0/C0` and `<id>/E0/O0/I0/C-ui-combo`, which
  iterate every range pair in each of the 3 modes. The lists, regenerated in scratch from the stored
  probes before the runs, give exactly the runs' pages and steps. The old pages' download bytes
  stayed in `<private-dir>/live/<run>/<id>/blobs` during each run and were deleted at its end; the
  empty `<id>` folders (0700) remain. Both runs were well under design §6.7.5's "overnight".
- Counts: quick and full from the stored goldens with the harness's own `manifestStats`
  (scratch). The exhaustive pages, records, zips and entries come from the passive counter of
  the previous entry, preloaded into the same two runs (`node --require
  <scratch>/live-counter.js test/golden/run.js live …`): old and new gave the same counts in
  every environment, the counter reported no failure of its own, and the verdict, report and
  exit code are the harness's own.
- Nothing reached the repository. A file manifest of the repository (`fsManifest` of
  `test/lib/baseline.js`, 625 entries with mtimes, `dist/` and `.git/index` included), taken
  before posb's live check and again after the last run, before any git command: 0
  differences.
- Baseline: `node test/golden/run.js baseline` after the last run: 8 old repositories, 4347
  manifest entries, 0 problems, 0 differences, live pages checked (7.1 s, report
  `854f6c85c606467e`). Session check: the old repositories' manifests before the first run and
  after the last equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries, mtimes
  included): 0 differences.
- With this entry in place: `node test/lint/run.js`, 168 files, exit 0 (headers, privacy,
  generic, sentinels and invisible characters 0 findings each; sinks 0 that count, plus the 12
  report-only notes until M8); `node test/contract/run.js --tier node`: 8 providers, 0
  problems, C17 and C18 on 168 files.

### G5 — golden equivalence, chocolate and maribank (2026-10-17)

M6's per-provider gate (design §6.7.2 step 5, §6.7.5, §6.7.6, §8.1) for the next two providers
of M6's order, chocolate then maribank, on the tree of the previous entry: the stage C part 1
commit with only this file changed. As sha256 prefixes: `dist/chocolate/index.html`
`81e166fc5857207f`, `dist/maribank/index.html` `a0850227a5d7a65d`, the landing page
`6a6211c925b8f86d`, `core/app/statement-app.js` `d940ca86a6c244ba`, the four provider files
with the hashes of the WP9 B entry, and the harness files with the hashes of the versa and
maybank entry; playwright-core 1.57.0 and Chrome 143.0.7499.4, the goldens' versions. Each
provider ran the five steps in order (live check, `build --check`, quick, full, exhaustive), one
run at a time. Each of the four golden-harness steps is one invocation that also checked the
provider's old repository before and after itself (chocolate 1,259 manifest entries, maribank
1,260; 0 problems, live page checked, 0 differences). E1 and E2 run the `O0/I0/C0` page in the
quick tier, and it and `O0/I0/C-ui-combo` in the full and exhaustive tiers; E0 runs every page.
Reports are the sha256 prefixes of `<private-dir>/reports/<run>.json`.

| provider | tier | report |
|---|---|---|
| chocolate | quick | `0ca68de825280a14` |
| chocolate | full | `cdbf86a69dd3ddc6` |
| chocolate | exhaustive (live) | `e1265a61d7bce7e0` |
| maribank | quick | `cfba9dff123d4ceb` |
| maribank | full | `3fe661298f86cfbc` |
| maribank | exhaustive (live) | `81e0e6277b2e2985` |

- Result: G5 passes for both. Every step of every run is identical in all three environments: 0
  mismatches of any category (steps, downloads with their zip entries, storage, UI snapshots, page
  errors, the static page snapshot), with no CSP violation and no page or console error that the old
  page lacks. Waivers: W1 1 and W3 1 per run, both on the E0 static snapshot, and nothing else.
  Disabled records, where there are any, are compared like the others (trigger, account, card, kind
  and the disabled flag, in order) and are equal. Exit 0 each; no diff folder was written.
- Live check (step 1), `node test/golden/run.js baseline --providers <id>`, first attempt each:
  HEAD equals legacyHead, `index.html` equals its blob and `legacyIndexSha256`, and the live
  page at `legacyUrl` has that sha256 (chocolate `5b79b2d531ae6760…`, 0.4 s, report
  `4ac2470eef6febf8`; maribank `ad8a22d49b33a9cb…`, 0.4 s, report `c25f33c05f4274ab`). Step 2,
  `node build/build.js --check`: `dist/` is current (9 files) for each provider, and again
  after the last run.
- Quick (step 3) against the stored quick goldens (chocolate E0 `7138f09dc7b1b220`, E1
  `df301131a21e98fb`, E2 `a4441d180c7b8169`; maribank `0bb2e0030de5ed32`, `5aa89070e34edb4f`,
  `2ec4f54f2cb7e2d3`), with the pass-through cross-check of real downloads, one for every record, as
  in the goldens. Full (step 4) against the stored full goldens (chocolate `0b083d0dfab6d539`,
  `748579cb274fab54`, `18bced697f17ee12`; maribank `5f6d39a113959a71`, `84916ba2cea75502`,
  `8e8e27bef600708c`), over the same pages, steps and downloads as G4.
- Exhaustive (step 5): no exhaustive goldens are stored, so `live --tier exhaustive` captured each
  old page (read only, from `file://`) and compared the new page with it in the same run. The tier
  differs from full on two E0 pages, `<id>/E0/O0/I0/C0` and `<id>/E0/O0/I0/C-ui-combo`, which
  iterate every range pair in each of the 3 modes. The lists, regenerated in scratch from the stored
  probes before the runs, give exactly the runs' pages and steps. The old pages' download bytes
  stayed in `<private-dir>/live/<run>/<id>/blobs` during each run and were deleted at its end; the
  empty `<id>` folders (0700) remain. Both runs were well under design §6.7.5's "overnight".
- Counts: quick and full from the stored goldens with the harness's own `manifestStats`
  (scratch). The exhaustive pages, records, zips and entries come from the passive counter of
  the versa and maybank entry, preloaded into the same two runs (`node --require
  <scratch>/live-counter.js test/golden/run.js live …`): old and new gave the same counts in
  every environment, the counter reported no failure of its own, and the verdict, report and
  exit code are the harness's own.
- Nothing reached the repository. A file manifest of the repository (`fsManifest` of
  `test/lib/baseline.js`, 625 entries with mtimes, `dist/` and `.git/index` included), taken
  before chocolate's live check and again after the last run and the final baseline, before
  any git command: 0 differences.
- Baseline: `node test/golden/run.js baseline` after the last run: 8 old repositories, 4347
  manifest entries, 0 problems, 0 differences, live pages checked (3.2 s, report
  `86a1d75ccfe3f56a`). Session check: the old repositories' manifests before the first run and
  after the last equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries, mtimes
  included): 0 differences.
- With this entry in place: `node test/lint/run.js`, 168 files, exit 0 (headers, privacy,
  generic, sentinels and invisible characters 0 findings each; sinks 0 that count, plus the 12
  report-only notes until M8); `node test/contract/run.js --tier node`: 8 providers, 0
  problems, C17 and C18 on 168 files.

### G5 — golden equivalence, stashaway and etoro (2026-10-17)

M6's per-provider gate (design §6.7.2 step 5, §6.7.5, §6.7.6, §8.1) for the last two providers
of M6's order, stashaway then etoro, on the tree of the previous entry: the stage C part 1
commit with only this file changed. As sha256 prefixes: `dist/stashaway/index.html`
`9ce4e27409cc9069`, `dist/etoro/index.html` `7f36c42228fabf7b`, the landing page
`6a6211c925b8f86d`, `core/app/statement-app.js` `d940ca86a6c244ba`, stashaway's three files
with the hashes of the WP9 B entry, the custom app's six files with the hashes of the WP7b
entry, and the harness files with the hashes of the versa and maybank entry; playwright-core
1.57.0 and Chrome 143.0.7499.4, the goldens' versions. Each provider ran the five steps in order
(live check, `build --check`, quick, full, exhaustive), one run at a time. Each of the four
golden-harness steps is one invocation that also checked the provider's old repository before
and after itself (stashaway 1,491 manifest entries, etoro 64; 0 problems, live page checked, 0
differences). E0 runs every page; E1 and E2 run the `O0/I0/C0` page in every tier, and
stashaway's `O0/I0/C-ui-combo` too in the full and exhaustive tiers (etoro has no configurator,
so its E1 and E2 `C-ui-combo` pages are skipped). Reports are the sha256 prefixes of
`<private-dir>/reports/<run>.json`.

| provider | tier | report |
|---|---|---|
| stashaway | quick | `6b0f4a8a3e231415` |
| stashaway | full | `d327fbc22f6b8d5a` |
| stashaway | exhaustive (live) | `695b48687a813694` |
| etoro | quick | `957d024ae66a272e` |
| etoro | full | `0c93a1ecc04dd424` |
| etoro | exhaustive (live) | `88f6f9807cb5d155` |

- Result: G5 passes for both. Every step of every run is identical in all three environments: 0
  mismatches of any category (steps, downloads with their zip entries, storage, UI snapshots, page
  errors, the static page snapshot), with no CSP violation and no page or console error that the old
  page lacks. Disabled records, where there are any, are compared like the others (trigger, account,
  card, kind and the disabled flag, in order) and are equal. Exit 0 each; no diff folder was
  written.
- Waivers: etoro W1 1 and W3 1 per run, both on the E0 static snapshot, and nothing else.
  stashaway W1 1 per run (the E0 static snapshot), and W3 on that snapshot plus every step that
  shows its legacy configurator (`frozen.legacyDom`: `#portfolios`, `.portfolio`,
  `#portfolios-count`, `#portfolios-reset`), in every tier and environment. That is W3 as
  designed (§6.7.6), no new waiver, and its quick and full uses match G4's early signal. A
  scratch check with the harness's own `normaliseUiPart` over the stored goldens finds the
  legacy markup only in the configurator list, on every step but each page's `@open` (an empty
  list) and the C-seed-badname load, where the old page throws before the list is drawn; each
  tier's W3 count is those steps plus the E0 static snapshot (its `#empty` style and three
  legacy configurator lines). The exhaustive E0 count follows the same rule: its steps less the
  `@open` steps and that load, plus the static snapshot. The same check on etoro's goldens finds
  no legacy markup. The C-seed-badname load throws on the new page too (busy line stuck, no
  results), as it must before M9, so W2 has no use.
- Live check (step 1), `node test/golden/run.js baseline --providers <id>`, first attempt each:
  HEAD equals legacyHead, `index.html` equals its blob and `legacyIndexSha256`, and the live
  page at `legacyUrl` has that sha256 (stashaway `887b1108c1a81709…`, 0.6 s, report
  `2ddc5c5c972f0553`; etoro `47f7746b398b0ea5…`, 0.3 s, report `dc80af38e8729d65`). Step 2,
  `node build/build.js --check`: `dist/` is current (9 files) for each provider, and again
  after the last run.
- Quick (step 3) against the stored quick goldens (stashaway E0 `0d7869222275870f`, E1
  `c4e0447d772b0f6c`, E2 `bd3988c9c494fc2a`; etoro `673ef54ea15bae78`, `62d9422b281b2579`,
  `9bcccaff82174424`), with the pass-through cross-check of real downloads, one for every record, as
  in the goldens. Full (step 4) against the stored full goldens (stashaway `0c2f2709b6c98e2f`,
  `eb11db663d53bbd2`, `50d6e97478e2162a`; etoro `cd85d4e790037719`, `50f86015502635a6`,
  `a3575d161763634c`), over the same pages, steps and downloads as G4. The skipped pages are the
  goldens' own: stashaway's full-tier E0 pages with the same steps as another page; etoro's 4
  quick-tier pages without a configurator, and in the full tier 21 + 1 + 1 without a configurator
  and 7 that a single-file picker cannot take.
- Exhaustive (step 5): no exhaustive goldens are stored, so `live --tier exhaustive` captured each
  old page (read only, from `file://`) and compared the new page with it in the same run. The tier
  differs from full on the pages that iterate every range pair. For stashaway these are
  `stashaway/E0/O0/I0/C0` and `stashaway/E0/O0/I0/C-ui-combo`. For etoro it is `etoro/E0/O0/I0/C0`
  alone (there is no `C-ui-combo` page), and a custom app iterates the ranges in both orders (each
  mode, then every range; each range, then every mode). The lists, regenerated in scratch from the
  stored probes before the runs, give exactly the runs' pages and steps. The scratch estimate of the
  earlier entries counts the modes but not the two orders, which only custom apps have, so etoro's
  step count was taken from the generator's own `iterationSteps` instead. The old pages' download
  bytes stayed in `<private-dir>/live/<run>/<id>/blobs` during each run and were deleted at its end;
  the empty `<id>` folders (0700) remain. Both runs were well under design §6.7.5's "overnight". The
  custom app's long page takes most of etoro's run: on its range-then-mode half every step is a mode
  click, which re-parses the workbook (old and new alike).
- Counts: quick and full from the stored goldens with the harness's own `manifestStats`
  (scratch). The exhaustive pages, records, zips and entries come from the passive counter of
  the versa and maybank entry, preloaded into the same two runs (`node --require
  <scratch>/live-counter.js test/golden/run.js live …`): old and new gave the same counts in
  every environment, the counter reported no failure of its own, and the verdict, report and
  exit code are the harness's own. A second passive preload, `<scratch>/live-progress.js`,
  followed the long runs: it wraps the page driver's `open()` to count each driver's
  `snapshot()` calls (one per step, old and new pages alike) after the original has returned,
  returns every result unchanged, and appends the counts to a scratch log once a minute. Its
  final counts are the runs' own: a page instance for the probe and for each old and new page,
  and a snapshot per step on each side. It was preloaded into etoro's full compare (step 4) as
  well, to time the long page before the exhaustive run, and there too counted that run's own
  page instances and snapshots.
- Nothing reached the repository. A file manifest of the repository (`fsManifest` of
  `test/lib/baseline.js`, 625 entries with mtimes, `dist/` and `.git/index` included), taken
  before stashaway's live check and again after the last run and the final baseline, before
  any git command and before this entry was written: 0 differences.
- Baseline: `node test/golden/run.js baseline` after the last run: 8 old repositories, 4347
  manifest entries, 0 problems, 0 differences, live pages checked (4.9 s, report
  `dd9260dccc944fe3`). Session check: the old repositories' manifests before the first run and
  after the last equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries, mtimes
  included): 0 differences.
- M6 is complete: G1b passed (versa), and G5 has passed for all eight providers in M6's order
  (versa → maybank → posb → moomoo → chocolate → maribank → stashaway → etoro), each with the
  live check and the quick, full and exhaustive tiers 100% identical. Every M6 run was on the
  tree of the stage C part 1 commit, with only this file changed.
- With this entry in place: `node test/lint/run.js`, 168 files, exit 0 (headers, privacy,
  generic, sentinels and invisible characters 0 findings each; sinks 0 that count, plus the 12
  report-only notes until M8); `node test/contract/run.js --tier node`: 8 providers, 0
  problems, C17 and C18 on 168 files.

### M6 — independent verification (2026-10-17)

An independent re-run of M6's gates (design §6.7.2, §6.7.5-§6.7.7, §8.1) after the G1b and G5
entries, taking none of their figures on trust, on the tree they ran on: the stage C part 1
commit with only this file changed. Against that commit, `git diff --stat` lists this file
alone (before this entry: 405 lines added and none removed, all in the gate log; the decisions
section is unchanged), and nothing is staged or untracked, so there is no fix file and no new
decision. As sha256 prefixes, the eight pages and the landing page have the hashes of the G4
entry, `core/app/statement-app.js` is `d940ca86a6c244ba`, and the harness, build and canary
files have the hashes of the G1b and the versa and maybank entries; playwright-core 1.57.0 and
Chrome 143.0.7499.4, the goldens' versions. Reports are the sha256 prefixes of
`<private-dir>/reports/<run>.json`, and times are the reports' own.

- Baseline: `node test/golden/run.js baseline` (all 8, live) before the first compare: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked (2.6 s,
  report `e1a99092f3b56d37`); the same after the unit, lint and contract runs (4.4 s, report
  `86f2207d2bb7ddbc`) and after the last run (3.5 s, report `8c63a5602b350ded`). Without the
  harness (scratch: `curl -fsSL`, `rev-parse HEAD` and the on-disk `index.html`): 8/8 live
  pages, HEADs and `index.html` hashes equal `frozen.js`. `node build/build.js --check`:
  `dist/` is current (9 files), before the first compare and after the last.
- Quick: `node test/golden/run.js compare --tier quick`, all 8 in one run: 24 environments
  identical, each environment's step count equal to its golden's; every download also
  cross-checked as a real download. 0 mismatches of any category (steps, downloads with their
  zip entries, storage, UI snapshots, page errors, static page snapshots). Waivers: W1 1 and W3 1
  on each E0 static snapshot, plus W3 on stashaway's legacy configurator steps, as in the G5
  entries. Exit 0, report `5d05530b8a61ce98`; no diff folder was written.
- Full, as a spot check: `node test/golden/run.js compare --tier full --providers
  versa,etoro`: both identical, with the goldens' downloads; 0 mismatches; waivers W1 1 and W3 1
  per provider, on the E0 static snapshot. Exit 0, report `9cfdd4b6736e6e5b`; no diff folder was
  written.
- G1b once more (seconds; beyond the commands this check had to run): `node
  test/golden/run.js canary --provider versa`: only `downloads` mismatches, each canary failing
  exactly as expected, 0 problems (exit 0, report `ff037678585296b0`). The four canary pages were
  rebuilt byte for byte with the G1b entry's hashes, and the structured mismatches in the private
  diff folders equal the G1b run's, record for record.
- `npm run unit`: 372 tests, 372 pass, 0 fail, 0 skipped, 66 s. `npm run lint`: 168 files, exit
  0 (headers, privacy, generic, sentinels and invisible characters 0 findings each; sinks 0
  that count, plus the 12 report-only notes until M8). `npm run contract`: 8 providers, 0
  problems; C15 23 pins; C17 and C18 on 168 files.
- The gate log against the private store (scratch, with the harness's own `manifestStats` and
  `scenarios.generate`):
  - the 24 runs of the four G5 tables: each row's report records the run the row names
    (command, tier, provider) and agrees with its entry (0 mismatches, the waivers, the baseline
    fields); the quick and full runs' counts equal the stored goldens per environment (pages,
    skipped, steps, records, disabled, zips, entries); the exhaustive runs' pages, skips and
    steps, per environment, equal the lists regenerated from the stored probes;
  - all 48 quick and full manifest hashes are cited in their provider's entry and equal their
    files; the canary pages and the G1b golden page are as the G1b entry gives them;
  - the 39 harness reports from the canary run to the last G5 baseline all passed (the canaries
    as expected, 0 mismatches in every compare and live run; baseline 0 problems and 0
    differences, live pages checked), in M6's order: the live check, quick, full and
    exhaustive per provider, versa → maybank → posb → moomoo → chocolate → maribank →
    stashaway → etoro. The G5 entries cite 37 of them. The other two
    belong to the G1b entry, which gives their results without the reports: the canary run
    (`709d9d8a558a7dc5`) and the baseline after it (`4f0b857732790959`);
  - not re-derivable without a new exhaustive run: the exhaustive runs' records, disabled, zips and
    entries, which come from the G5 entries' passive counter (the `live` reports hold steps,
    mismatches and waivers only, and the old pages' bytes were deleted).
- Nothing reached the repository. A file manifest of the repository (`fsManifest` of
  `test/lib/baseline.js`, 625 entries with mtimes, `dist/` and `.git/index` included), taken
  before the first run and again after the last, before this entry was written: 0
  differences. Against the manifests the G1b and G5 sessions took before their runs, only this
  file and folder mtimes differ.
- Session check: the old repositories' manifests before the first run and after the last equal
  the WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries, mtimes included): 0 differences.
- Result: M6 holds. G1b reproduces; the live checks and the quick tier are 100% identical for
  all 8, and the full tier for versa and etoro; the G1b and G5 entries agree with the reports,
  goldens and scenario lists they cite.
- With this entry in place: `node test/lint/run.js`, 168 files, exit 0 (headers, privacy,
  generic, sentinels and invisible characters 0 findings each; sinks 0 that count, plus the 12
  report-only notes until M8); `node test/contract/run.js --tier node`: 8 providers, 0
  problems, C17 and C18 on 168 files.

### WP11 — generic harness (2026-10-17)

The files are `test/harness/run.js` `897b9fff85368e2e` (new), `test/unit/harness.test.js`
`419f9f94db4a766f` (new) and `test/lib/reconcile.js` `1bdce15825e4c0ce`, which gains the extra
`reconcileParts` while `reconcileStatement` gives the same lines as before (decisions 137-147).
Nothing else changed: no core module, provider, build or page file, and `package.json` already
had the `harness` script.

- Unit: `node --test test/unit/harness.test.js`: 37 tests, 37 pass, 12 s. Without Chrome and the
  old repositories (`CHROME` and `S2C_OLD_ROOT` pointed at nothing): 32 pass, 5 skipped (H12 four
  times and the PDF dump). The whole glob (`npm run unit`): 409 tests, 409 pass, 0 fail, 0
  skipped, 48 s; without Chrome and the old repositories: 393 tests, 357 pass, 36 skipped, 0
  fail, 42 s. `testlib.test.js`'s two reconcile tests pass unchanged.
- Samples on the synthetic tree (decision 147): H1-H11 pass on every fixtures folder and on a
  real folder of 8 CSV files (one of them not a ledger, declared) with its private declaration;
  H12 passes on every fixtures folder of the built tree. Each step fails once: H1 (no `test.js`,
  a wrong parser global), H2 (no accepted file), H3 (an undeclared reader failure), H4 (a
  throw), H5 (an undeclared error, a missing one, warnings, an unknown row, a strict
  `checkResult` warning, a custom app's `{error}`), H6 (one line over `allowProblems`), H6b (an
  `openingBalance` override wrong for single months), H7 (no `firstOpenings`), H8 (a writer with
  an extra cell, Download all without the Accounts CSV, a collapsed zip name, duplicate zip
  entries, a QIF without its header), H9 (a parser that ignores the config), H10 (an
  order-dependent field, a parse counter, a parser that writes to its input, frozen and legacy),
  H11 (a pattern that does not match), H12 (a hook that differs from the page, settings lost on a
  reload, a bogus file that does not warn, a stale page), H13 (a blocked dump folder) and H14 (no
  hook, an unsafe reference path, a difference). The reports are 0600 in 0700 folders, and the
  console of a run on folders and accounts named with a marker never shows the marker.
- Mutation check on a scratch mirror of the repository (never the repository): 29/29 mutants of
  `test/harness/run.js` caught, one per rule (corrected by the stage D1 entry: these were about one
  per step, not one per rule; the M7 review's 43 single-rule mutants left 34 surviving the 37
  tests, and the header mutant below changed `csvProblems`, not the wiring that asks for the
  header): H5's undeclared and missing errors, strict `checkResult`, warnings and unknown rows;
  H3's undeclared reader failure; H4's throw; H6's declaration and H6b's remainder; H7's first
  openings; H8's cell count, header, Download all and zip names; H9's gating; H10's `months[].id`,
  reversed order, repeated parse and legacy deep compare; H11's pattern; H12's comparison with the
  hook, reload and bogus-file warning; H13's writes; H14's hook result; strict mode; the fixtures'
  spec order and their isolation from the private declarations; the console's privacy. The first
  form of the reversed-order mutant left a dangling `else` (a syntax error, so no test ran); with a
  valid edit it is caught by 3 tests.
- `--all-fixtures` on this repository, where only the custom app has `testing.fixtures`: exit 0
  without `--browser` (8 steps pass; H6b, H7, H9 and H11 do not apply to a custom app without a
  configurator; H12, H13 and H14 are not asked) and with it (9 pass; H12: 6 states, 30 records,
  0 mismatches with the hook, 2 of 2 bogus loads warn, 0 page errors, no overflow, 3 page
  instances), 3 s together. On the built synthetic tree (the unit test), `--all-fixtures
  --browser` passes for its 4 providers, the skeleton from a temporary build; the CSV provider's
  H12 compares 12 states and keeps 3 settings across a reload.
- Real statements: one run per provider with `--browser`, on the final files, with no private
  declaration yet (the user config declares none; M7 sets them). Every other step passed or was
  skipped with its reason:

  | provider | fail | reported |
  |---|---|---|
  | versa | 0 | 0 |
  | maybank | 0 | 0 |
  | posb | 0 | 0 |
  | moomoo | 0 | 0 |
  | chocolate | 0 | 0 |
  | maribank | 0 | 0 |
  | stashaway | 1 | 0 |
  | etoro | 0 | 0 |

  - The one failure, open for M7: stashaway's H5, whose `checkResult` errors are all
    "skippedRows[i] .detail must be a string when present". The verbatim parser writes
    `detail: null` on the skipped rows of its two internal categories, and `checkResult` accepts
    a null owner field but not a null detail. G6 needs H1-H12 to pass, and this is a contract
    question rather than a private declaration, so no setting was tuned here.
  - Reported, not gating (every legacy provider runs not strict): `checkResult` warnings on
    legacy providers whose parsers build labels their own way (the G6 entry). H6b, H7, H9 and
    H10's reversed order found nothing on any provider.
  - Skipped or n/a: the steps a provider's data cannot exercise, the custom app's reversed order
    (one workbook) and the checks it has no ledger or configurator for, and H13 and H14 (not
    asked).
  - H12 on all 8: every captured record equals the hook's Node rebuild; every bogus load warns; no
    console or page error, CSP violation or overflow; on the 7 configurator pages the settings
    survive a reload and Reset gives back the first downloads. Served over http the pages log no
    pdf.js worker fallback (from `file://` each logs one; scratch check), so they read the PDFs
    through pdf.js's worker, while the extraction reads them on `file://` with the main-thread
    fallback; the results agree everywhere.
  - Two earlier runs on the same statements, before the last edit to the console output, gave the
    same statuses and counts.
- Lints: `node test/lint/run.js`, 170 files, exit 0 (headers, privacy with the untracked
  denylist, generic, sentinels and invisible characters 0 findings each; sinks 0 that count, plus
  the 12 report-only notes until M8). `node test/contract/run.js --tier node`: 8 providers, 0
  problems, C17 and C18 on 170 files. `node build/build.js --check`: `dist/` is current (9 files).
- Nothing reached the repository: `git status` lists only the three files and this one. The
  private reports are under `<private-dir>/harness/<run>`, and every run removed its
  `<private-dir>/tmp/harness-<run>`. The harness reads no old repository: H1 loads the new
  parser, and `assertSafeInput` admits the statement folder and the private directory.
- Baseline (`node test/golden/run.js baseline`) after the last run: 8 old repositories, 4347
  manifest entries, 0 problems, 0 differences, live pages checked (report `5f33df9c272eece9`).

### G6 — real-statement harness (2026-10-17)

M7's gate (design §6.6, §6.9, §8.1) on the tree of the WP11 entry plus decision 148's fix: only
`core/contract/result.js` (`dc0f6faeb7a840b8`, was `e8580e9d7820bb2a`),
`test/unit/result.test.js` (`85fe98504e5b4b7a`, was `c7e66e8a765b9068`) and this file changed.
The harness files keep the WP11 entry's hashes (`test/harness/run.js` `897b9fff85368e2e`,
`test/unit/harness.test.js` `419f9f94db4a766f`, `test/lib/reconcile.js` `1bdce15825e4c0ce`),
and the eight pages, the landing page and `core/app/statement-app.js` (`d940ca86a6c244ba`) those
of the G4 entry; playwright-core 1.57.0 and Chrome 143.0.7499.4. Each provider ran
`node test/harness/run.js --provider <id> --browser` once, in M7's order (versa → maybank →
posb → moomoo → chocolate → maribank → stashaway → etoro), on the folder the user config names
(design §6.9 step 2; no `--statements`) and with its private declarations (none, decision 149).
A final run of all 8, the same eight commands in the same order after the last code change,
gave the same step lines and the same eight reports byte for byte. Reports are the sha256
prefixes of `<private-dir>/harness/<run>/<id>/report.json`; times are wall-clock per
invocation.

| provider | fail | reported | report |
|---|---|---|---|
| versa | 0 | 0 | `b73aefab1a80f756` |
| maybank | 0 | 0 | `c5f34de0d384503c` |
| posb | 0 | 0 | `31228c62b6cccf24` |
| moomoo | 0 | 0 | `55cbbd6935297fe6` |
| chocolate | 0 | 0 | `5b8156e73314ae09` |
| maribank | 0 | 0 | `09a9cb6a255c6645` |
| stashaway | 0 | 0 | `2a810eb8a2442ea2` |
| etoro | 0 | 0 | `8dc2d2c99f0b16f0` |

- Result: G6 passes. H1-H12 pass for all 8 as decision 149 reads it: every run exits 0, with
  no failing and no reported step. The skips and n/a are the steps a provider's data cannot
  exercise, the custom app's reversed order (one workbook) and its H6b, H7, H9 and H11 (no ledger,
  no configurator), and H13 and H14 everywhere (not asked). H5's errors and
  H6's lines are exactly the private declarations: 0 and 0 everywhere, against no `expectErrors`
  and `allowProblems` 0, with 0 reader failures. H12's page-against-hook comparison is 100%
  equal: 0 mismatches.
- The one fix: stashaway's H5, which failed in the WP11 entry with `checkResult` errors on null
  skipped-row details, passes after decision 148. The block was in the contract checker that H5
  calls; the harness, the parser and the declarations are unchanged, and it is the only code
  change. Before merging it under `core/` (design §8.3),
  `node test/golden/run.js compare --tier quick --providers stashaway` was identical in E0, E1
  and E2 (waivers W1 and W3, as in G5), with its old repository checked before and after (1,491
  manifest entries, 0 problems, live page checked, 0 differences); exit 0, report
  `b657a88be6366e16`.
- H5 beyond the errors: the seven statement apps give 0 `warnings` (so no `allowWarnings`,
  decision 150), and etoro's informational warnings are allowed by design §4.2. No skipped row
  has the category `unknown`. `checkResult` reports warnings, all
  "portfolios[i].names does not end with its label", from legacy parsers that build a label their
  own way (a name plus part of the account number, or a label not taken from `names`); they do
  not gate because legacy providers run not strict.

  These are the verbatim parsers' shapes. The configurator's "formerly …" line reads
  `names.slice(0, -1)` on the old page and the new page alike (posb2csv app.js:252,
  `core/app/statement-app.js`:204), and G5's UI snapshots are identical, so none is a
  discrepancy. A provider without `legacyRepo` would fail H5 on them (strict mode).
- H11 (decision 150): every real portfolio id matches its `configIdPattern`; no draft changed.
- H12 on all 8: every captured record equals the downloads hook's Node rebuild of the same
  state (each mode at the full range and the last month, plus the configurator states); 32 of
  32 bogus loads warn; no console or page error, CSP violation or overflow at 390 px; on the 7
  configurator pages the settings survive a reload, and Reset stores `{}` and gives back the
  first downloads; 40 page instances.
- The legacy-only checks (design §6.6: reported for legacy providers and reviewed in M7), on
  the real folders: H6b, H7's gap cases, H9 and H10's reversed order found 0 problems on every
  provider, wherever its data exercises them; the custom app has none of them (no ledger, no
  configurator).

  - In all: H6b checked every month with entries, H7 ran its gap cases and H9 its config checks,
    and the reversed order gave the same result wherever it ran. No real discrepancy, so there is
    no finding to record and no parser was touched.
  - The partial runs are the data's: H9's exclusion needs two portfolios, and its merge and
    same-name checks need two portfolios of one currency with accounts of their own; a single
    account that starts in the first month gives H7 no "first month an account appears" case.
  - H9's kind flip counts the trades kept on the account set to cash-like (the versa accumulator
    keeps them; critic gap 6): reported, not asserted.
- Nothing reached the repository. `git status` lists the WP11 entry's files, decision 148's
  two files and this one. The user config is unchanged (sha256 prefix `b01b9b6a7cde945f`,
  modified 2026-10-16); decision 149's scratch copy lived in `<private-dir>/tmp` and was
  removed. Every harness run removed its `<private-dir>/tmp/harness-<run>`, and the reports
  (0600 in 0700 folders) are under `<private-dir>/harness/<run>`. Each run's console showed
  step ids, statuses and counts only, never a file or account name or an amount.
- Baseline: `node test/golden/run.js baseline` before the final run (two invocations, reports
  `6d9ee06eb115887a` and `e7c9f377112103c9`) and after it (3.1 s, report
  `98102d1061245bcc`): 8 old repositories, 4347 manifest entries, 0 problems, 0 differences,
  live pages checked. Session check: the old repositories' manifests after the last run, with
  mtimes, equal the WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries).
- M7 is complete: G6 passes for all eight providers in M7's order, on the real statements,
  with no private declaration, no `allowWarnings` and no pattern change, and the legacy-only
  checks reviewed.
- With this entry in place: `npm run unit`: 410 tests, 410 pass, 0 fail, 0 skipped, 40 s (the
  WP11 entry's 409 plus decision 148's test). `node test/lint/run.js`: 170 files, exit 0
  (headers, privacy with the untracked denylist, generic, sentinels and invisible characters 0
  findings each; sinks 0 that count, plus the 12 report-only notes until M8). `npm run
  contract`: 8 providers, 0 problems; C15 23 pins; C17 and C18 on 170 files.
  `node build/build.js --check`: `dist/` is current (9 files).

### Stage D1 fixes (2026-10-17)

The six findings of the M7 review, each confirmed first with its experiment, then fixed
(decisions 151-156): combined-entry-headers (151), harness-unit-coverage (152),
h12-range-months (153), privacy-run-error (154), out-in-statement-folder (155) and
h12-bogus-batch-compare (156). Decisions 138, 142, 145, 146 and 147 and the WP11 entry's
mutation count are corrected in place. The review reported no verification failures.

- Files, as sha256 prefixes: `test/harness/run.js` `7c94ba49c9d6cc69` (was `897b9fff85368e2e`),
  `core/contract/headers.js` `44b8cc4181c20c78` (was `13449c8ba2e75f28`),
  `test/unit/harness.test.js` `64e1309e31931045` (was `419f9f94db4a766f`),
  `test/unit/headers.test.js` `8117172c8fcc8348` (was `d0e3d015d1b283fe`),
  `test/unit/synthetic-tree.js` `96422b0bd415c658` (was `32be67d520942dd7`),
  `test/unit/contract.test.js` `94f6a10c4db0a591` (was `ce56cd24e1343cd7`), and this file. No
  page code changed: `core/app/statement-app.js` is still `d940ca86a6c244ba`, `headers.js` is
  Node-only, and no provider, build, pinned or pin-list file changed. `test/lib/` is unchanged
  (`reconcile.js` `1bdce15825e4c0ce`, `private.js` `4d3ba77c225853b4`).
- The findings' experiments, rerun on the fixed tree (synthetic data; scratch copies pointed at
  this repository): the Combined trades entry written by the per-account writer, run through H8
  on `syn-invest`, fails in its 3 holdings states, where it passed before; the page whose range
  hides its last month fails H12 in all 14 states with "14 ranges unlike its months", where it
  passed with "0 mismatches"; the configured folder that does not exist, named with spaces, gives
  exit 1 and one fixed line with no word of the folder's name; `--out` inside a `--statements`
  folder outside `<statements-dir>` stops with "the output folder cannot be used" and writes
  nothing there. The full-batch comparison has its sample in the unit tests (a parser whose labels
  depend on the input's position), and the page with a console error and a 2000 px element still
  fails H12 with both.
- Tests: `test/unit/harness.test.js` 56 (was 37; 19 new and 6 extended), `headers.test.js` 6
  (+1: the Combined entries), `contract.test.js` 31 with its expectations moved to five
  providers. The new samples, by step: H1 the parser's export names in Node and in the page, and
  an unloadable descriptor under `--all-fixtures`; H2 a symlink out of the statement folder, and
  the code-point order that decides which copy is the duplicate; H5 a custom app's warnings and
  `test.checkResult`, and a statement app's declared reader failure (Chrome); H6 a statement
  app's `test.reconcile`, `testing.reconcile: "custom"` and missing trade lines; H7 one input
  holding every month; H8 a downloads hook that throws or returns no array, the header wiring
  (a writer whose header on data is not its empty one, a custom app's hook), the names of the
  Accounts CSV, the Combined CSV and zip and a card QIF, the Combined trades rows, the Combined
  entries' headers, and a zip whose CRC does not verify; H9 the rename's card files, the exclude
  count, the kind's holdings files and the merge and same-name sums; H10 a single-file picker,
  one input, a legacy pass and a parser that writes to its config; H11 a non-string id and a
  pattern that does not compile; H12 console and page errors, a CSP violation, overflow in both
  states, a range that hides a month, the mode button, the stored string and the downloads across
  a reload, Reset's `{}` and downloads, the full-batch warning, busy after a bogus file, a full
  batch and the inputs, and the full-batch comparison; H13 the page transform's output and the
  dumped reader failures; the console's fixed failure lines and the output guard.
- Mutation check on a scratch mirror of the repository (never the repository), with
  `test/unit/harness.test.js` and `test/unit/headers.test.js` (62 tests) run for each mutant: 117
  mutants, 115 caught, 2 survivors, both equivalent by construction.
  - The review's 43 single-rule mutants, on the current code: 43 caught. One was rewritten: the
    noted-texts mutant's code is gone (decision 154), so it is now the fixed failure line that
    also prints the message.
  - 74 more: 72 for the remaining rules of `run.js` (every check's failure branch, its gating
    and its fatal flag, the targets, the console lines, the output guard and the fixes' own
    checks) and 2 for `headers.js`'s entry case. 72 caught. The 2 survivors are `run.js`
    mutants. One drops the read folders from the report's write, but `report.json` lies in the
    output folder, which is refused first. The other drops H2's fixtures isolation, but the
    target of a fixtures folder never carries the user config's declarations; a mutant of both
    places is caught by the fixtures-isolation test.
  - The first pass (4,298 s) ran before H12's setup moved ahead of its server (decision 152).
    Under the mutant "H1-H3 run only when `--only` selects them" its test run hung on the open
    server until the runner's 15-minute limit, after its tests had failed. The 21 H12 mutants,
    that one, the two-place mutant and the H2 isolation mutant were rerun on the final file: the
    first 23 caught (that one in 10 s; the two-place mutant once a runner slip that had applied
    only one of its two edits was fixed), and the last survives as described.
- Unit: `npm run unit`: 430 tests, 430 pass, 0 fail, 0 skipped, 47 s (the G6 entry's 410, plus
  19 harness tests and 1 headers test); without Chrome and the old repositories: 414 tests, 374
  pass, 40 skipped, 0 fail, 33 s. (A first run on the loaded machine took 132 s and gave the
  same counts.)
- Lints: `node test/lint/run.js`, 170 files, exit 0 (headers, privacy with the untracked
  denylist, generic, sentinels and invisible characters 0 findings each; sinks 0 that count, plus
  the 12 report-only notes until M8). `npm run contract`: 8 providers, 0 problems; C15 23 pins;
  C17 and C18 on 170 files. `node build/build.js --check`: `dist/` is current (9 files).
- Golden, for the change under `core/` (design §8.3; `headers.js` is never inlined, so no page
  can differ): `node test/golden/run.js compare --tier quick`, all 8 in one run: 24
  environments, every step identical, waivers W1 and W3 as in the M6 verification, with the old
  repositories checked before and after (4347 manifest entries, 0 problems, 0 differences); exit
  0, report `b624a68847db1b30`.
- G6 re-run: `node test/harness/run.js --provider <id> --browser` once per provider, in M7's
  order, on the folder the user config names, with its private declarations (none). Reports are
  the sha256 prefixes of `<private-dir>/harness/<run>/<id>/report.json`.

  | provider | fail | reported | report |
  |---|---|---|---|
  | versa | 0 | 0 | `d5e65bb87bf2e22e` |
  | maybank | 0 | 0 | `d5a79f6450b622df` |
  | posb | 0 | 0 | `06c6e3d40dcebbf1` |
  | moomoo | 0 | 0 | `d713ed4c575de398` |
  | chocolate | 0 | 0 | `a4f927665c75f0b0` |
  | maribank | 0 | 0 | `c63a916ad88748c6` |
  | stashaway | 0 | 0 | `f0a1cf1f0961eb23` |
  | etoro | 0 | 0 | `4ebdbc6f0249a2ad` |

  - Result: G6 still passes, now with the new checks. Every run exits 0, with no failing and no
    reported step, and the skips and n/a are those of the G6 entry. H5's errors and H6's lines
    are again exactly the private declarations: 0 and 0 everywhere, with 0 reader failures, so
    the user config stays unchanged (sha256 prefix `b01b9b6a7cde945f` before and after).
  - The new checks on the real statements: H8 compared the Combined zip entries with their
    writers' headers (maybank, posb and chocolate offer no Combined zip because they have no
    trades), 0 problems. H12 compared the states and records with the hook (the G6 entry's, plus
    the 2 full batches with a bogus file on each of the 7 multiple-file pickers): 0 mismatches,
    and the range equals the hook's months in every state. 32 of 32 bogus loads warn; no console
    or page error, CSP violation or overflow; on the 7 configurator pages the settings survive a
    reload and Reset gives back the first downloads; 40 page instances.
  - The legacy-only checks give the same results as in the G6 entry, with 0 problems.
  - `--all-fixtures` (the CI command; only the custom app has fixtures): exit 0 without
    `--browser` (8 steps pass) and with it (9 pass; H12: 6 states, 30 records, 0 mismatches, 0
    ranges unlike the months, 2 of 2 bogus loads warn).
  - Nothing reached the repository: its file manifest is 628 entries with digest
    `71ea9798ba9138ab` before and after the runs, 0 differences. `git status` lists only the
    files above, decision 148's two files and `test/lib/reconcile.js`; `test/harness/run.js` and
    `test/unit/harness.test.js` are still untracked, as the WP11 entry left them. Every run
    removed its `<private-dir>/tmp/harness-<run>` (0 left), and each console showed step ids,
    statuses and counts only.
  - Baseline: `node test/golden/run.js baseline` before the first run (report
    `0cf6ac546f82081a`) and after the last (report `31b518a2b2aa373c`): 8 old repositories, 4347
    manifest entries, 0 problems, 0 differences, live pages checked. Session check: the old
    repositories' manifests before and after, mtimes included, equal the WP2 session snapshot
    (`be22dcba3f669ab2`, 4347 entries), 0 differences.

### WP13 — rendering safety (2026-10-19)

M8's work package (design §3.2, §3.12, §3.13, §6.3, §6.5, §6.7.5, §6.7.6, §8.1 M8, §8.2 WP13;
decisions 157-163), on the M7 harness commit (`13f8576`). The files, as sha256 prefixes (was →
now): `core/app/statement-app.js` `d940ca86a6c244ba` → `48928fdd216d7c74`,
`providers/etoro/app.js` `069c2188b4f8f6d0` → `7e18de533217a420`, `test/lint/sinks.js`
`2d556b4d09510501` → `33ccaaab54fa8f4f`, `test/lint/run.js` `3a844351b76b7c89` →
`6724fb7f790fbdff`, `test/golden/scenarios.js` `b8d5a618de70d477` → `298c6ddb76482ff2`,
`test/golden/run.js` `6f89ede8cdf73138` → `bd69b41d0743f81a`, `test/golden/compare.js`
`2b9ad6c339f5ef9e` → `f534c0f835ee1b1d` and `test/golden/waivers.js` `fc802f2fee5e2780` →
`33b53e69d1eaa341` (comments), `test/unit/statement-app.test.js` `59a7a1d0c67a7e0e` →
`66a61f00cccc07f1`, `test/unit/lint.test.js` `8afc7141bc647a86` → `e8c35cc6e2ad8fc1`,
`test/unit/golden.test.js` `0aff7c45bf380113` → `837220577893c5c2`, `test/unit/synthetic-tree.js`
`96422b0bd415c658` → `6d3fd37b5580d8f5`, `core/README.md` `19b1fe4967f6c07c` →
`55fb330f2d293ea5`, `package.json` `20923050e6b275d8` → `d312df1476450858`, two new files,
`test/smoke/injection.js` `9bf7ead3a6c5f6f2` and `test/unit/injection.test.js`
`8ac91c410928beb9`, the eight provider pages and this file. `core/escape.js` and every other core
module, the parsers and pins, the descriptors and page copy, the build, the fixtures and the test
library are unchanged.

- Pages: `node build/build.js` (the default CSP mode, `legacy`) rewrote the eight provider pages;
  the landing page is unchanged (`6a6211c925b8f86d`). As sha256 prefixes and sizes: chocolate
  `3c33bb4ec3a96b90` (1,495,117 bytes), etoro `71b43248b4f8b938` (70,046), maribank
  `aa521a24828f6d63` (1,505,830), maybank `1ffd208b1e7e32a3` (1,501,190), moomoo
  `c6e56b133001a8bf` (1,510,216), posb `11fbaf02dc11ab7b` (1,522,330), stashaway
  `2d9ed823fb1bf29f` (1,517,793) and versa `552493b37237ec8f` (1,503,034): each statement page
  1,189 bytes larger, the custom app's 446. `node build/build.js --check`: `dist/` is current (9
  files).
- Lints: `node test/lint/run.js`, 172 files, exit 0: headers, privacy (with the untracked
  denylist), generic, sinks, sentinels and invisible characters 0 findings each. The sinks lint has
  no report-only rule left; the 12 old `innerHTML` notes are gone, and the one assignment left is
  `setHtml`'s, which the rule allows.
- Contract checks: `npm run contract`: 8 providers, 0 problems; C15 23 pins; C17 and C18 on 172
  files. `npm run contract-browser`: 0 problems (C13 on the custom app's fixtures).
- Unit: `npm run unit`: 438 tests, 438 pass, 0 fail, 0 skipped, 116 s (the stage D1 entry's 430,
  plus `injection.test.js`'s 6 and 2 in `golden.test.js`). Without Chrome and the old
  repositories (`CHROME` and `S2C_OLD_ROOT` pointed at nothing): 422 tests, 377 pass, 45 skipped,
  0 fail, 70 s (of the new tests, the payload helpers, the step checks and the injection smoke's
  "Chrome cannot be launched" failure run there and pass).
  - `statement-app.test.js`: 7 apps, 56 runs, 73,820 log entries, 7,110 downloads and 397 parses,
    0 differences; the old apps printed the hostile currency raw 2,142 times, the statement app
    escaped it every time; the 5 mutants are caught for all 7 apps (decision 159).
  - `injection.test.js` on the synthetic tree: the four statement-app pages pass the configurator
    payloads (24 payload states, 138 downloads equal to the hook), the PDF provider also its
    hostile statement (6 states, 30 downloads), and the custom app has no payload. Each failing
    sample fails with its own message; renders that bypass escaping fail every check, Download
    all included: the raw name breaks the card's markup, the DOM scan follows the broken DOM, and
    its clicks throw on an account that does not exist (the SX1 case, on synthetic data).
- Smoke: `node test/smoke/pages.js`: 8 pages (27 page instances, 5 fixture downloads) and the
  landing page (8 links), 0 problems. `node test/smoke/fixtures-golden.js`: the custom app, 9
  states and 45 records, equal to its `expected.js` (unchanged) and to the hook, 0 problems.
  `node test/smoke/injection.js`: the custom app's hostile workbook, 2 page instances, 6 payload
  states, 30 downloads equal to the hook, 0 problems. The same smoke on the pre-M8 pages (scratch:
  the M7 commit's tree from `git archive`) fails with 18 problems, 3 per state: `window.__pwned`
  is set by the dispatched `mouseover`, 2 elements carry `onmouseover`, 2 new `<b>` elements; its
  downloads still equal the hook (the payload adds elements and takes no button away).
- Harness: `node test/harness/run.js --all-fixtures --browser`: the custom app, 9 pass, 0 fail
  (H12: 6 states, 30 records, 0 mismatches, 2 of 2 bogus loads warn).
- Golden, as design §8.3 asks for changes under `core/` and `providers/`, in two phases: the
  first ran `compare --tier quick`, a `live` run and a first `compare --tier full`, the second
  the final `live`, the sensitivity runs and `compare --tier full`, with `canary` and `replay`
  between them. Between the phases `checkNewOnly` began to report its replay counts, the only
  later change to `test/golden/run.js`; it touches no page the stored goldens hold, so the first
  phase's `compare --tier quick` stands for the final file too.
  - `compare --tier quick`, all 8: 24 environments, every step identical (downloads with their
    zip entries, storage, UI snapshots, page errors, static snapshots, and the pass-through
    cross-check of real downloads), waivers W1 and W3 as in M6, and no other waiver. The 7
    configurator providers are noted as goldens captured without the S scenarios (decision 163).
    Exit 0, report `1c1f9927e36922eb`.
  - `compare --tier full`, all 8: 24 environments, every step identical, waivers W1 and W3 as in
    G5, and no other waiver; exit 0, report `27b6da4002283f9b`. A first full run (report
    `08d2e6ba65dc0abb`) spanned a suspend of the host of about two days: it was identical but for
    one field, `busy` on `etoro/E1/O0/I0/C0/@load1`, where the settle loop's 180 s backstop ran
    out across the clock jump while the UI snapshot and downloads of that step were identical.
    That environment alone again (`compare --tier full --providers etoro --env E1`, report
    `5dd381d69f924d29`) and the whole tier again (above) are identical.
  - `live --tier quick` for the 7 configurator providers (decision 163), on the final harness:
    21 environments, every step identical (each old page captured in the same run), waivers W1,
    W3 and SX1, exit 0, report `6fbcf6714cfe215f`. S-benign: 7 pages compared with the old pages,
    identical (downloads with their zip entries, storage, UI). S-break, new page only: 7 pages,
    each with no handler run, no `on*` attribute, p0's tag `tag other` and the seeded config
    string kept, and the downloads equal to the downloads hook's rebuild, every Download all
    `zipParts(allFiles(), now)`, with SX1 the only exception and 0 mismatches. (A first run,
    before `checkNewOnly` reported its replay counts, gave the same steps and waivers; report
    `d19090ee7e333d99`.)
  - `canary --provider versa`, on canary builds of the M8 page: brand, cent, zip-order and
    zip-time `downloads` mismatches, each failing exactly as expected (as in G1b); exit 0, report
    `c661564259d2e799`.
  - `replay --parser new --tier full`: 0 mismatches, 0 ICU drift, parse threw only on the 7
    C-seed-badname loads, as in G4 (the parsers and the hook are unchanged; replay skips
    new-page-only pages, and the stored goldens have none). Exit 0, report `745b13e036850162`.
  - Sensitivity of the S-break checks (scratch pages, never `dist/`): `live --tier quick
    --providers versa` on the pre-M8 page (the M7 commit's `dist/versa/index.html`) fails with
    `security` mismatches, all on S-break, 3 on each of its steps after `@open` (the payload's
    handler runs on the dispatched `mouseover`, the tag carries `onmouseover`, its class is
    `tag x`), and nothing else: S-benign and every other page identical, and that payload takes
    no button away, so its downloads equal the hook (report `1af8bf163e2a775b`). The same on a
    canary build of the M8 page that reverses every zip
    (`build --inject test/golden/canaries/zip-order.js --out <scratch>`) fails with `downloads`
    mismatches on the compared pages and `sx1` mismatches on S-break (Download all's sha256 and
    entry order on each of its steps): the SX1 check reads the downloads (report
    `802c445b56f930a5`).
- Baseline: `node test/golden/run.js baseline` before the first golden run (report
  `136949061159f729`) and after the phase-one runs (report `bf97d94e01ef82fa`): 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. Every
  golden invocation also checked its old repositories before and after itself, with 0 problems
  and 0 differences. Session check: the old repositories' manifests, mtimes included, equal the
  WP2 session snapshot (`be22dcba3f669ab2`, 4347 entries): 0 differences.
- Nothing private reached the repository: the console of every run showed ids, statuses, counts
  and hashes, the diff folders and reports are in `<private-dir>`, and the repository's file
  manifest (`fsManifest`, this file left out) over the golden runs differs only in
  `test/golden/run.js` (the replay counts of `checkNewOnly`, written between the two phases)
  and in git's own index refresh by a `git status`; over the second phase: 627 entries, 0
  differences.
- With this entry in place: `node test/lint/run.js`, 172 files, exit 0 (the six lints 0 findings
  each); `npm run contract`: 8 providers, 0 problems, C15 23 pins, C17 and C18 on 172 files;
  `npm run contract-browser`, the three smokes and `node test/harness/run.js --all-fixtures
  --browser` exit 0 with the counts above; `npm run unit`: 438 tests, 438 pass, 95 s;
  `node build/build.js --check`: `dist/` is current (9 files).

### G7 — rendering safety (2026-10-19)

M8's gate (design §3.2, §3.12, §3.13, §6.5, §6.7.5, §6.7.6, §8.1 M8; decision 164) on the WP13
tree: the M7 harness commit (`13f8576`) with WP13's files, each with the hash the WP13 entry
gives. As sha256 prefixes: `core/app/statement-app.js` `48928fdd216d7c74`,
`providers/etoro/app.js` `7e18de533217a420`, `test/golden/run.js` `bd69b41d0743f81a`,
`test/smoke/injection.js` `9bf7ead3a6c5f6f2`, and the eight provider pages chocolate
`3c33bb4ec3a96b90`, etoro `71b43248b4f8b938`, maribank `aa521a24828f6d63`, maybank
`1ffd208b1e7e32a3`, moomoo `c6e56b133001a8bf`, posb `11fbaf02dc11ab7b`, stashaway
`2d9ed823fb1bf29f` and versa `552493b37237ec8f`; the landing page (`6a6211c925b8f86d`) and
`core/escape.js` (`e7bb921c5a0f8688`, the WP4b entry's) are unchanged. playwright-core 1.57.0
and Chrome 143.0.7499.4, the goldens' versions. `git status` lists WP13's files and this one,
nothing else. The gate's commands ran once each, one after another in one script: the baseline,
the standing matrix (the injection smoke on `dist/` included), the quick compare, the S
scenarios, the full compare, the eight harness runs and the baseline again. The scratch run of
the injection smoke on the synthetic tree ran beside the quick compare, and the sensitivity run
after the script. Each golden-harness invocation also checked its old repositories before and
after itself (0 problems, live pages checked, 0 differences). The bullets below follow the
subjects, not that order. Reports are the sha256 prefixes of `<private-dir>/reports/<run>.json`
(golden harness) and `<private-dir>/harness/<run>/<id>/report.json` (harness); times are
wall-clock per invocation.

- Result: G7 passes. Golden quick and full are 100% identical for all 8, with W1 and W3 alone, as
  in G5. S-benign is identical to the old pages on all 7 configurator pages. S-break is inert on
  all 7, with SX1 its only exception, and every one of its downloads, Download all included,
  equals the downloads hook's rebuild (`zipParts(allFiles(), now)`). The injection smoke is green
  on every page with fixtures, and the real-statement harness passes for all 8 with G6's results.
  Every gate command passed at its first attempt; nothing needed a fix, so no file but this one
  changed (decision 164).
- Baseline before: `node test/golden/run.js baseline`: 8 old repositories, 4347 manifest
  entries, 0 problems, 0 differences, live pages checked (4.3 s, report `13a076a9d0272fee`).
- The standing matrix, first: `node test/lint/run.js`, 172 files, exit 0 (the six lints 0
  findings each); `node build/build.js --check`: `dist/` is current (9 files); `npm run
  contract`: 8 providers, 0 problems, C15 23 pins, C17 and C18 on 172 files; `npm run
  contract-browser`: 0 problems (C13 on the custom app's fixtures); `node test/smoke/pages.js`:
  8 pages (27 page instances, 5 fixture downloads) and the landing page (8 links), 0 problems;
  `node test/smoke/fixtures-golden.js`: the custom app, 9 states and 45 records, 0 problems;
  `node test/harness/run.js --all-fixtures --browser`: the custom app, 9 pass, 0 fail (H12: 6
  states, 30 records, 0 mismatches, 2 of 2 bogus loads warn); `npm run unit`: 438 tests, 438
  pass, 0 fail, 0 skipped, 68 s. In it, `statement-app.test.js` (decision 159): 7 apps, 56 runs,
  73,820 log entries, 7,110 downloads and 397 parses, 0 differences; the old apps printed the
  hostile currency raw 2,142 times, and the statement app escaped it every time.
- Golden quick: `node test/golden/run.js compare --tier quick`, all 8 in one run: 24
  environments, every page and step identical, each environment's step count its golden's; every
  download also cross-checked as a real download; 0 mismatches of any category (steps, downloads
  with their zip entries, storage, UI snapshots, page errors, static page snapshots). Waivers: W1
  and W3 (on each E0 static snapshot, plus W3 on stashaway's legacy configurator steps), as in
  M6, and no other; W2 has no use. Exit 0, report `283eba702f58bbfa`.
- S scenarios: `node test/golden/run.js live --tier quick --security --providers
  versa,maybank,posb,moomoo,chocolate,maribank,stashaway`, each old page captured (read only,
  from `file://`) in the same run: 21 environments, every step identical; waivers W1, W3 and SX1,
  and no other. Exit 0, report `24a64cd8a781d02e`.
  - S-benign, compared with the old pages like any page: 7 pages identical (downloads with their
    zip entries, storage, UI). Each provider's E0 holds its quick golden's steps plus those of
    S-benign and S-break, and stashaway's W3 grows by S-benign's steps after `@open`.
  - S-break, new page only: 7 pages, each with no handler run after a `mouseover` on every
    element of `<main>`, no `on*` attribute, p0's tag `tag other`, a settled load, only frozen
    storage keys and the seeded config string kept; no page error or CSP violation. Its downloads
    equal the downloads hook's rebuild in the replay child (the new parser, E0's time zone and
    locale), every Download all `zipParts(allFiles(), now)`. SX1 has one use per S-break step and
    is the only exception; 0 mismatches.
  - These are the results of the WP13 entry's final `live` run (report `6fbcf6714cfe215f`).
- Golden full: `node test/golden/run.js compare --tier full`, all 8 in one run: 24 environments,
  every page and step identical, with the goldens' downloads; 0 mismatches. Waivers: W1 and W3
  (W3 on stashaway in each environment and on each other provider's E0 static snapshot), as in
  G5, and no other; W2 has no use. Exit 0, report `14efa996ad839656`. The stored goldens are
  those of M2: the 48 quick and full manifest files have the sha256 prefixes the G5 entries cite
  (scratch check with the harness's own `manifestStats`, which gave the page, step and download
  counts of both tiers).
- Injection smoke: `node test/smoke/injection.js` (the `dist/` pages with fixtures): the custom
  app's hostile workbook, 2 page instances, 6 payload states, 30 downloads equal to the hook, 0
  problems. On the synthetic tree (decision 164): 5 providers with fixtures, 14 page instances,
  0 problems; the four statement-app pages take the configurator payloads (24 payload states,
  138 downloads equal to the hook), the PDF provider also its hostile statement (6 states, 30
  downloads), and the custom app has no payload. `injection.test.js` asserts the same run and
  its failing samples in `npm run unit`.
- Real-statement harness (G6's commands, decision 164): `node test/harness/run.js --provider
  <id> --browser` once per provider, in M7's order, on the folder the user config names, with
  its private declarations (none).

  | provider | fail | reported | report |
  |---|---|---|---|
  | versa | 0 | 0 | `d5e65bb87bf2e22e` |
  | maybank | 0 | 0 | `d5a79f6450b622df` |
  | posb | 0 | 0 | `06c6e3d40dcebbf1` |
  | moomoo | 0 | 0 | `d713ed4c575de398` |
  | chocolate | 0 | 0 | `a4f927665c75f0b0` |
  | maribank | 0 | 0 | `c63a916ad88748c6` |
  | stashaway | 0 | 0 | `f0a1cf1f0961eb23` |
  | etoro | 0 | 0 | `4ebdbc6f0249a2ad` |

  - Every run exits 0, with no failing and no reported step; the skips and n/a are G6's
    (decision 149). H5's errors and H6's lines are exactly the private declarations: 0 and 0
    everywhere, with 0 reader failures.
  - H12 on the M8 pages: the states and captured records equal to the downloads hook's rebuild,
    Download all included, with the range equal to the hook's months in every state; 32 of 32
    bogus loads warn; no console or page error, CSP violation or overflow at 390 px; on the 7
    configurator pages the settings survive a reload, and Reset gives back the first downloads;
    40 page instances. The legacy-only checks give G6's results with 0 problems.
  - The eight reports equal the stage D1 entry's byte for byte (the same sha256 prefixes, two
    days apart, so they hold no time or run id): on the real statements the M8 pages give the
    harness results of the M7 pages.
  - The user config is unchanged (sha256 prefix `b01b9b6a7cde945f` before and after, modified
    2026-10-16), and every run removed its `<private-dir>/tmp/harness-<run>` (0 left).
- Sensitivity, beyond the gate's list (decision 164): `node test/golden/run.js live --tier
  quick --security --providers versa --page <scratch>`, on a copy of the M7 commit's
  `dist/versa/index.html` (`bb534e5b3ca67051`), fails (exit 1) with `security` mismatches, all on
  S-break, 3 on each of its steps after `@open`: the payload's handler runs on the dispatched
  `mouseover`, a `span` carries `onmouseover`, and p0's tag has the class `tag x`. Nothing else
  differs: S-benign and every other page are identical, and that payload takes no button away, so
  S-break's downloads equal the hook (report `947e64400eb0655a`; as in the WP13 entry's
  sensitivity run).
- Baseline after: `node test/golden/run.js baseline`, after the last harness run: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked (3.1 s,
  report `c834c51ec682ea16`). Session check: the old repositories' manifests, mtimes included,
  taken during the quick compare and again after the sensitivity run, equal the WP2 session
  snapshot (`be22dcba3f669ab2`, 4347 entries): 0 differences.
- Nothing private reached the repository. The console of every run showed ids, statuses,
  counts and hashes; reports, harness details and diff folders are in `<private-dir>`, and the
  only diff folder these runs wrote is the sensitivity run's. The repository's file manifest
  (`fsManifest` with mtimes, `dist/` and `.git/index` included, this file left out), taken
  before the first command and again after the sensitivity run: 627 entries, digest
  `db04362d1e93c916`, 0 differences.
- M8 is complete: G7 passes for all eight providers on the WP13 tree, with no fix.
- With this entry in place: `node test/lint/run.js`, 172 files, exit 0 (the six lints 0 findings
  each); `npm run contract`: 8 providers, 0 problems, C15 23 pins, C17 and C18 on 172 files;
  `npm run contract-browser`, `npm run smoke` (the three smokes) and `node test/harness/run.js
  --all-fixtures --browser` exit 0 with the counts above; `npm run unit`: 438 tests, 438 pass,
  0 fail, 0 skipped, 41 s; `node build/build.js --check`: `dist/` is current (9 files).

### WP14 — parse-error handling (2026-10-20)

M9's work package (design §2.10, §3.12, §6.5, §6.7.5, §6.7.6, §8.1 M9, §8.2 WP14; decisions
165-172), on the WP13 tree: the M7 harness commit (`13f8576`) with WP13's files, each with the
hash the WP13 entry gives. The files, as sha256 prefixes (was → now): `core/app/statement-app.js`
`48928fdd216d7c74` → `aae82c5c1c36eff3`, `test/golden/compare.js` `f534c0f835ee1b1d` →
`f7e0728a07c330a7`, `test/golden/waivers.js` `33b53e69d1eaa341` → `572dea7f07e2c308`,
`test/golden/run.js` `bd69b41d0743f81a` → `f049bebe329c4e31`, `test/unit/statement-app.test.js`
`66a61f00cccc07f1` → `9a79991b71bff46d`, `test/unit/golden.test.js` `837220577893c5c2` →
`224514fc6fccec0e`, `test/unit/harness.test.js` `64e1309e31931045` (the M7 commit's) →
`e95239673110c63d`, `test/unit/synthetic-tree.js` `6d3fd37b5580d8f5` → `55f08d413709558c`,
`core/README.md` `55fb330f2d293ea5` → `d5ec429f6c98164a`, `package.json` `d312df1476450858` →
`cef7f215edb7412f`, three new files, `test/smoke/parse-error.js` `e5deb279d9bfd00d`,
`test/smoke/inject/throw-on-marker.js` `5b014bedc97692a3` and `test/unit/parse-error.test.js`
`475dbde66e1e88b8`, the seven statement pages and this file. `core/escape.js` and every other
core module, `providers/etoro/app.js`, the parsers and pins, the descriptors and page copy, the
build, the fixtures, the scenarios of the golden harness, the other smokes and the test library
are unchanged.

- Pages: `node build/build.js` (the default CSP mode, `legacy`) rewrote the seven statement pages;
  the custom app's page (`71b43248b4f8b938`) and the landing page (`6a6211c925b8f86d`) are
  unchanged. As sha256 prefixes and sizes: chocolate `8ca61f2c4a5c664e` (1,496,199 bytes),
  maribank `6f2bd3886d793f1d` (1,506,912), maybank `94b044a1836c0f02` (1,502,272), moomoo
  `27bffc8fda91618f` (1,511,298), posb `c17d6e7845e9f5a1` (1,523,412), stashaway
  `fdba2159d6f79a90` (1,518,875) and versa `f20c451d43fd7a20` (1,504,116): each 1,082 bytes
  larger, which is the statement app's growth (380 → 396 lines). `node build/build.js --check`:
  `dist/` is current (9 files).
- Lints: `node test/lint/run.js`, 175 files (the three new ones included), exit 0: headers,
  privacy (with the untracked denylist), generic, sinks, sentinels and invisible characters 0
  findings each.
- Contract checks: `npm run contract`: 8 providers, 0 problems; C15 23 pins; C17 and C18 on 175
  files. `npm run contract-browser`: 0 problems (C13 on the custom app's fixtures).
- Unit: `npm run unit`: 449 tests, 449 pass, 0 fail, 0 skipped, 47 s (the WP13 entry's 438, plus
  `parse-error.test.js`'s 11).
  - `statement-app.test.js` (decision 166): 7 apps, 56 runs, 92,331 log entries, 8,906 downloads
    and 621 parses, 168 of them throwing, 0 differences; the old apps printed the hostile
    currency raw 2,370 times, and the statement app escaped it every time; the 8 mutants (WP13's
    5 and M9's 3) are caught for all 7 apps.
  - `parse-error.test.js` (decision 168): the synthetic tree's skeleton keeps its 5 downloads
    through the injected failure, and every check's failing sample fails with its own message;
    11 tests, 3 s.
  - `harness.test.js` (decision 169) and `golden.test.js` (decision 170) pass with their
    changed samples.
- Smoke: `node test/smoke/pages.js`: 8 pages (27 page instances, 5 fixture downloads) and the
  landing page (8 links), 0 problems. `node test/smoke/fixtures-golden.js`: the custom app, 9
  states and 45 records, 0 problems. `node test/smoke/injection.js`: the custom app's hostile
  workbook, 2 page instances, 6 payload states, 30 downloads equal to the hook, 0 problems.
  `node test/smoke/parse-error.js`: no skeleton of this repository has a statement app with csv
  inputs and `testing.fixtures` yet, so there is nothing to check, exit 0 (decision 167). On a
  fresh synthetic tree (scratch, the same `runParseError`): `syn-skel`, 1 page instance, 5
  downloads kept through the error, 0 problems; with WP13's statement app copied into that tree,
  4 problems: the busy line stays, the error line shows 0 times, and the `injected failure`
  reaches the page twice (an unhandled rejection and a page error).
- Harness: `node test/harness/run.js --all-fixtures --browser`: the custom app, 9 pass, 0 fail
  (H12: 6 states, 30 records, 0 mismatches, 2 of 2 bogus loads warn).
- Golden, as design §8.3 asks for changes under `core/`, in two passes, each a script that ran its
  commands one after another; each golden-harness invocation also checked its old repositories
  before and after itself (0 problems, live pages checked, 0 differences). Reports are the sha256
  prefixes of `<private-dir>/reports/<run>.json`.
  - The first pass ran with the W2 listing (decision 170), before decision 171: the baseline
    (report `0576a2dd2b33c4ba`), `compare --tier quick` (`19e014dc0d57541a`),
    `compare --tier full` (`e1afc659aad382d1`), `live --tier quick` for the 7 configurator
    providers (`fea73f16e0735514`), `canary --provider versa` (`61513089d7a56a53`),
    `replay --parser new --tier full` (`520e9f0a5b5b806b`) and the baseline again
    (`b9d34d6895beb72b`). Every command exited 0.
  - The sensitivity runs below then found the gap that decision 171 closes in `waivers.js` (the
    first pass ran with WP13's file). The second pass repeated, on the final files, the baseline
    (`0bc82db7c4d0bc7b`), both compares, the live run and the baseline again
    (`f60a7253df92ff44`): every command exited 0, with the first pass's results throughout. The
    canary and replay runs stand for the final files (decision 172).
  - `compare --tier quick`, all 8 in one run: 24 environments, every page and step identical
    (downloads with their zip entries, storage, UI snapshots, page errors, static snapshots, and
    the pass-through cross-check of real downloads); 0 mismatches. Waivers: W1 and W3 as in G7,
    and W2. Second pass: exit 0, report `a039cddb32b93790`.
  - `compare --tier full`, all 8 in one run: 24 environments, every page and step identical, with
    the goldens' downloads; 0 mismatches. Waivers: W1 and W3 as in G7, and W2. Second pass: exit
    0 (the host's load average was near 15 then), report `0e5b180122bec7ff`. The stored goldens
    are those of M2 and G7 (scratch check with the harness's own `manifestStats`, on both tiers).
  - `live --tier quick --security` for the 7 configurator providers, each old page captured (read
    only, from `file://`) in the same run: 21 environments, every step identical; waivers W1, W3
    and SX1 as in G7, and W2. S-benign is identical to the old pages, and S-break, on the new
    page alone, keeps G7's results: 7 pages with no handler run, no `on*` attribute and p0's tag
    `tag other`, and the downloads equal to the downloads hook's rebuild. Second pass: exit 0,
    report `db8bf9204e3ee6c2`.
  - W2, in every one of these runs (decision 172): its uses, listed in the reports, are all on
    the seven statement apps' C-seed-badname pages (`<id>/E0/O0/I0/C-seed-badname`): `@load1`,
    where the old page's parse threw and its busy line stuck, with the busy line and the error
    line, then `@reset` and the mode and range steps with the busy line alone. No other page uses
    it, and the custom app's pages use none. Downloads and storage are identical on all of those
    steps: before the reset neither page offers a download and both keep the seeded config
    string; from the reset on, both store `{}` and give the same downloads.
  - `canary --provider versa`, on canary builds of the M9 page: brand, cent, zip-order and
    zip-time `downloads` mismatches, each failing exactly as expected (as in G1b).
  - `replay --parser new --tier full`: 0 mismatches, 0 ICU drift; parse threw only on the 7
    C-seed-badname loads, where the old pages threw too, as in G4 (the parsers and the hook are
    unchanged, and replay runs no page).
  - Sensitivity (decisions 171, 172; scratch pages in `<private-dir>`, never `dist/`, removed
    afterwards): `compare --tier quick --providers versa --page <scratch>` on the WP13 versa page
    (`552493b37237ec8f`, rebuilt from WP13's statement app) is identical, with W1 and W3 and no
    W2 use, since it throws as the old page does (reports `ecf2ad6b335661fc` and, after decision
    171, `ed0581ad473f9870`). On the M9 versa page without the error line (`abcaaec9ee1309a8`),
    the first pass's comparison passed and credited it with the error line on `@load1` (report
    `ba90210ecda8a964`); after decision 171 it fails (exit 1) on that step's `ui.status`, listed
    with "the error line on none" (report `0624b25cbbd3e01b`).
- Baseline: `node test/golden/run.js baseline` before and after each pass (reports
  `0576a2dd2b33c4ba`, `b9d34d6895beb72b`, `0bc82db7c4d0bc7b` and `f60a7253df92ff44`): 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked. Session
  check: the old repositories' manifests (`fsManifest`, mtimes included), taken before the first
  pass and after the second, are identical: 4347 entries, digest `cd387d1c4d4a6634`, 0
  differences.
- Nothing private reached the repository. The console of every run showed ids, statuses, counts
  and hashes; reports, harness details and diff folders are in `<private-dir>`, and the only diff
  folders these runs wrote are the four canaries' (which fail by design) and the failing
  sensitivity run's. The two scratch pages were removed from `<private-dir>` afterwards, and its
  `tmp` folder is empty. The repository's file manifest (`fsManifest` with mtimes, `dist/` and
  `.git/index` included, this file left out): over the first pass 633 entries and 2 differences,
  `test/unit/parse-error.test.js` and its folder, from a comment line written into that file
  during the pass (its hash above is the final one); over the second pass 633 entries, digest
  `fba4c82c85c802d9`, 0 differences. The user config is unchanged (sha256 prefix
  `b01b9b6a7cde945f`, modified 2026-10-16).
- M9's work package is complete. G8 (design §8.1 M9) is left to its gate run on this tree.
- With this entry in place: `node test/lint/run.js`, 175 files, exit 0 (the six lints 0 findings
  each); `npm run contract`: 8 providers, 0 problems, C15 23 pins, C17 and C18 on 175 files;
  `npm run contract-browser`, `npm run smoke` (the four smokes; the parse-error smoke has nothing
  to check) and `node test/harness/run.js --all-fixtures --browser` exit 0 with the counts above;
  `npm run unit`: 449 tests, 449 pass, 0 fail, 0 skipped, 44 s; `node build/build.js --check`:
  `dist/` is current (9 files).

### G8 — parse-error handling (2026-10-20)

M9's gate (design §2.10, §3.12, §6.5, §6.7.5, §6.7.6, §8.1 M9; decision 173) on the WP14 tree:
the M7 harness commit (`13f8576`) with WP13's and WP14's files, each with the hash of the last
entry that changed it (WP14's, or WP13's for the files WP14 left alone). As sha256 prefixes:
`core/app/statement-app.js` `aae82c5c1c36eff3`, `providers/etoro/app.js` `7e18de533217a420`,
`test/golden/run.js` `f049bebe329c4e31`, `test/golden/compare.js` `f7e0728a07c330a7`,
`test/golden/waivers.js` `572dea7f07e2c308`, `test/smoke/parse-error.js` `e5deb279d9bfd00d`,
`test/smoke/inject/throw-on-marker.js` `5b014bedc97692a3`, `test/smoke/injection.js`
`9bf7ead3a6c5f6f2`, and the eight provider pages chocolate `8ca61f2c4a5c664e`, etoro
`71b43248b4f8b938`, maribank `6f2bd3886d793f1d`, maybank `94b044a1836c0f02`, moomoo
`27bffc8fda91618f`, posb `c17d6e7845e9f5a1`, stashaway `fdba2159d6f79a90` and versa
`f20c451d43fd7a20`; the landing page (`6a6211c925b8f86d`) and `core/escape.js`
(`e7bb921c5a0f8688`, the WP4b entry's) are unchanged. playwright-core 1.57.0 and Chrome
143.0.7499.4, the goldens' versions. `git status` lists WP13's and WP14's files and this one,
nothing else. The gate's commands ran once each, one after another in one script: the baseline,
the standing matrix (both smokes the gate names included), the two smokes on fresh synthetic
trees, the quick compare, the full compare, the S scenarios, the eight harness runs and the
baseline again; the sensitivity run came after the script. Each golden-harness invocation also
checked its old repositories before and after itself (0 problems, live pages checked, 0
differences). The bullets below follow the subjects, not that order. Reports are the sha256
prefixes of `<private-dir>/reports/<run>.json` (golden harness) and
`<private-dir>/harness/<run>/<id>/report.json` (harness); times are wall-clock per invocation. In
the second half of the script the host also carried an unrelated workload (load average near 20),
which lengthened the times of the live run and the harness runs.

- Result: G8 passes. Golden quick and full are identical for all 8 apart from W2, with W1 and W3
  as in G5 and no other waiver. W2 is used on exactly the seven statement apps' C-seed-badname
  pages: on each, the busy line and the error line on the step where the old page's parse threw,
  and the busy line alone on every later step. Downloads and storage are identical on all of
  those steps, before and after the reset. The S scenarios keep G7's results on the M9 pages, the
  CI parse-error smoke is green (the error line, the busy line cleared, the previous downloads
  kept), the injection smoke still is, and the real-statement harness passes for all 8 with G6's
  results. Every gate command passed at its first attempt; nothing needed a fix, so no file but
  this one changed (decision 173).
- Baseline before: `node test/golden/run.js baseline`: 8 old repositories, 4347 manifest
  entries, 0 problems, 0 differences, live pages checked (3.2 s, report `a22771226703212a`).
- The standing matrix, first: `node test/lint/run.js`, 175 files, exit 0 (the six lints 0
  findings each); `node build/build.js --check`: `dist/` is current (9 files); `npm run
  contract`: 8 providers, 0 problems, C15 23 pins, C17 and C18 on 175 files; `npm run
  contract-browser`: 0 problems (C13 on the custom app's fixtures); `node test/smoke/pages.js`:
  8 pages (27 page instances, 5 fixture downloads) and the landing page (8 links), 0 problems;
  `node test/smoke/fixtures-golden.js`: the custom app, 9 states and 45 records, 0 problems;
  `node test/harness/run.js --all-fixtures --browser`: the custom app, 9 pass, 0 fail (H12: 6
  states, 30 records, 0 mismatches, 2 of 2 bogus loads warn); `npm run unit`: 449 tests, 449
  pass, 0 fail, 0 skipped, 44 s. In it, `statement-app.test.js` (decision 166): 7 apps, 56 runs,
  92,331 log entries, 8,906 downloads and 621 parses, 168 of them throwing, 0 differences; the
  old apps printed the hostile currency raw 2,370 times, and the statement app escaped it every
  time.
- Golden quick: `node test/golden/run.js compare --tier quick`, all 8 in one run: 24
  environments, every page and step identical, each environment's step count its golden's; every
  download also cross-checked as a real download; 0 mismatches of any category (steps, downloads
  with their zip entries, storage, UI snapshots, page errors, static page snapshots). Waivers: W1
  and W3 (as in G7) and W2, and no other. Exit 0, report `724cb5eaea4a0660`.
- Golden full: `node test/golden/run.js compare --tier full`, all 8 in one run: 24
  environments, every page and step identical, with the goldens' downloads; 0 mismatches.
  Waivers: W1 and W3 (as in G7) and W2, and no other. Exit 0, report `5d2fc5ede1187853`. The
  stored goldens are those of M2: the 48 quick and full manifest files have the sha256 prefixes
  the G5 entries cite (scratch check with the harness's own `manifestStats`, which gave the page,
  step and download counts of both tiers).
- W2, read as decision 173 says, in the quick, full and live runs alike (the scratch reader: 0
  deviations in each): all its uses are on the seven statement apps'
  `<id>/E0/O0/I0/C-seed-badname` pages, on exactly the stored golden's steps from `@load1` on.
  `@load1`, where the old page's parse threw and its busy line stuck, has the busy line and the
  error line; `@reset` and the mode and range steps after it have the busy line alone. No other
  page uses W2, the custom app's pages use none, and each environment's W2 count equals its
  listing. Downloads and storage are identical on all of those steps (0 mismatches): before the
  reset (`@open`, `@load1`) neither page offers a download and both keep the seeded config
  string; from the reset on, both store `{}` and give the same downloads, in each tier.
- S scenarios: `node test/golden/run.js live --tier quick --security --providers
  versa,maybank,posb,moomoo,chocolate,maribank,stashaway`, each old page captured (read only,
  from `file://`) in the same run: 21 environments, every step identical; waivers W1, W3 and SX1
  (as in G7) and W2, and no other. Exit 0, report `c945bd9f2556541c`.
  - S-benign, compared with the old pages like any page: 7 pages identical (downloads with their
    zip entries, storage, UI). Each provider's E0 holds its quick golden's steps plus those of
    S-benign and S-break, and stashaway's W3 is as at G7.
  - S-break, new page only: 7 pages, each with no handler run after a `mouseover` on every
    element of `<main>`, no `on*` attribute, p0's tag `tag other`, a settled load, only frozen
    storage keys and the seeded config string kept; no page error or CSP violation. Its downloads
    equal the downloads hook's rebuild, every Download all `zipParts(allFiles(), now)`. SX1 has
    one use per S-break step and is the only exception; 0 mismatches. These are G7's results.
  - C-seed-badname, against a fresh capture of each old page, gives the W2 listing above.
- Parse-error smoke (decision 173): `node test/smoke/parse-error.js` on this repository: no
  skeleton has a statement app with csv inputs and `testing.fixtures`, so there is nothing to
  check, exit 0 (decision 167). On a fresh synthetic tree (scratch, the same `runParseError`):
  `syn-skel`, built with the injected piece, 1 page instance with 5 downloads kept through the
  parse error, 0 problems (0.4 s): the error line once, the busy line hidden, the cards, range,
  configurator and diagnostics as before, every download equal to list A, and Clear back to the
  empty state with no warn line. The tree's statement app (`aae82c5c1c36eff3`) and injected
  piece (`5b014bedc97692a3`) are byte copies of the repository's. `parse-error.test.js` asserts
  the same run and the failing sample of each check in `npm run unit`: 11 tests, 11 pass.
- Injection smoke: `node test/smoke/injection.js` (the `dist/` pages with fixtures): the custom
  app's hostile workbook, 2 page instances, 6 payload states, 30 downloads equal to the hook, 0
  problems. On a fresh synthetic tree (scratch, the same `runInjection`): 5 providers with
  fixtures, 14 page instances, 0 problems; the four statement-app pages take the configurator
  payloads (24 payload states, 138 downloads equal to the hook), the PDF provider also its
  hostile statement (6 states, 30 downloads), and the custom app has no payload.
  `injection.test.js` asserts the same run and its failing samples in `npm run unit`. These are
  G7's counts.
- Real-statement harness (G6's commands, decision 173): `node test/harness/run.js --provider
  <id> --browser` once per provider, in M7's order, on the folder the user config names, with
  its private declarations (none).

  | provider | fail | reported | report |
  |---|---|---|---|
  | versa | 0 | 0 | `d5e65bb87bf2e22e` |
  | maybank | 0 | 0 | `d5a79f6450b622df` |
  | posb | 0 | 0 | `06c6e3d40dcebbf1` |
  | moomoo | 0 | 0 | `d713ed4c575de398` |
  | chocolate | 0 | 0 | `a4f927665c75f0b0` |
  | maribank | 0 | 0 | `c63a916ad88748c6` |
  | stashaway | 0 | 0 | `f0a1cf1f0961eb23` |
  | etoro | 0 | 0 | `4ebdbc6f0249a2ad` |

  - Every run exits 0, with no failing and no reported step; the skips and n/a are G6's
    (decision 149). H5's errors and H6's lines are exactly the private declarations: 0 and 0
    everywhere, with 0 reader failures.
  - H12 on the M9 pages: the states and captured records equal to the downloads hook's rebuild,
    Download all included, with the range equal to the hook's months in every state; 32 of 32
    bogus loads warn; no console or page error, CSP violation or overflow at 390 px; on the 7
    configurator pages the settings survive a reload, and Reset gives back the first downloads;
    40 page instances. The legacy-only checks give G6's results with 0 problems.
  - The eight reports equal G7's byte for byte, and so the stage D1 entry's: on the real
    statements the M9 pages give the harness results of the M7 and M8 pages. Only the times
    differ, with the host's other workload.
  - The user config is unchanged (sha256 prefix `b01b9b6a7cde945f` before and after, modified
    2026-10-16), and every run removed its `<private-dir>/tmp/harness-<run>` (0 left).
- Sensitivity, beyond the gate's list (decision 173): `node test/golden/run.js compare --tier
  quick --providers versa --page <scratch>`, on a copy in `<private-dir>/tmp` of the WP13
  entry's `dist/versa/index.html` (`552493b37237ec8f`, the statement app before M9's catch): 3
  environments identical, waivers W1 and W3 and no W2 use, exit 0 (report `1392b0e34ae9d144`),
  since that page's parse throws on C-seed-badname as the old page's does. The gate's reader
  rejects it: no W2 use on `versa/E0/O0/I0/C-seed-badname`. The copy was removed afterwards, and
  `<private-dir>/tmp` is empty.
- Baseline after: `node test/golden/run.js baseline`, after the last harness run: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked (6.4 s,
  report `4f3ee3152151483c`). Session check: the old repositories' manifests, mtimes included,
  taken before the first baseline and again after the last, equal the WP2 session snapshot
  (`be22dcba3f669ab2`, 4347 entries): 0 differences.
- Nothing private reached the repository. The console of every run showed ids, statuses,
  counts and hashes; reports, harness details and diff folders are in `<private-dir>`, and these
  runs wrote no diff folder. The repository's file manifest (`fsManifest` with mtimes, `dist/`
  and `.git/index` included, this file left out), taken before the first command and again
  after the last baseline: 631 entries, digest `d78501acd09be6de`, 0 differences. Taken once
  more after the sensitivity run and the `git status` above, it differs in one entry, the mtime
  of the `.git` folder itself, from git's lock file; `.git/index` is unchanged.
- M9 is complete: G8 passes for all eight providers on the WP14 tree, with no fix.
- With this entry in place: `node test/lint/run.js`, 175 files, exit 0 (the six lints 0
  findings each); `npm run contract`: 8 providers, 0 problems, C15 23 pins, C17 and C18 on 175
  files; `npm run contract-browser`, `npm run smoke` (the four smokes; the parse-error smoke has
  nothing to check) and `node test/harness/run.js --all-fixtures --browser` exit 0 with the
  counts above; `npm run unit`: 449 tests, 449 pass, 0 fail, 0 skipped, 141 s (with the host's
  other workload); `node build/build.js --check`: `dist/` is current (9 files).

### Stage D2 fixes (2026-10-20)

The four findings of the M8/M9 review, each confirmed first (its experiment, or the gate record it
cites), then fixed (decisions 174-178): sinks-forms (174), diagnostics-payloads (175),
data-account-roundtrip (176, a reviewed exception with no page change) and
parse-error-requirement (177, 178). Decisions 64, 130, 158, 160, 161, 167, 168, 172 and 173 are
amended in place. The review reported no verification failures.

- Files, as sha256 prefixes (was → now; the "was" values are the WP13 and WP14 entries' and
  equal the review's copy of the tree): `test/lint/sinks.js` `33ccaaab54fa8f4f` →
  `009202218baef4c9`, `core/contract/callgraph.js` `e6b8e3f54c1ba198` → `1baa422b35c394ef`,
  `core/README.md` `d5ec429f6c98164a` → `2563135d2abf4150`, `test/smoke/injection.js`
  `9bf7ead3a6c5f6f2` → `051a1e1cd6d8614c`, `test/smoke/parse-error.js` `e5deb279d9bfd00d` →
  `bc88c699b55048c5`, `test/golden/compare.js` `f7e0728a07c330a7` → `9741dad53bd6f430`,
  `test/golden/run.js` `f049bebe329c4e31` → `e434b2a28e3fa59f`, `test/golden/waivers.js`
  `572dea7f07e2c308` → `5337d4b4f372963a` (the SX1 comment), `test/unit/synthetic-tree.js`
  `55f08d413709558c` → `330e94e82684b232`, `test/unit/lint.test.js` `e8c35cc6e2ad8fc1` →
  `913c36a008e63ae3`, `test/unit/callgraph.test.js` `edad496d4af0079f` → `829c41d8502a9f61`,
  `test/unit/injection.test.js` `8ac91c410928beb9` → `0069420812c4f779`,
  `test/unit/parse-error.test.js` `475dbde66e1e88b8` → `efd786416678fdd2`,
  `test/unit/golden.test.js` `224514fc6fccec0e` → `4820c2fed404691c`,
  `test/unit/harness.test.js` `e95239673110c63d` → `f91ced9518141f09`, and this file. No page
  code changed: `core/app/statement-app.js` is still `aae82c5c1c36eff3`, `providers/etoro/app.js`
  `7e18de533217a420` and `core/escape.js` `e7bb921c5a0f8688`; `callgraph.js` is Node-only and
  never inlined, so `dist/` holds G8's pages (`node build/build.js --check`: current, 9 files).
  `package.json` is unchanged (`npm run smoke` still ends with `node test/smoke/parse-error.js`,
  which now falls back to the synthetic skeleton).
- The findings' experiments, rerun on the fixed tree (a scratch copy of it with one mutant at a
  time, never this repository; synthetic data; the old repositories out of reach, as in CI):
  - Sinks: the review's 23 probes are all caught (4 before); the `#cards` render written as
    `[$("#cards").innerHTML] = […]` gives 1 innerHTML finding, lint exit 1 (0 findings, exit 0
    before).
  - Diagnostics: the review's mutant, `renderDiagnostics` with its own raw `html` and a setHtml
    written `[el.innerHTML] = [h.__raw]` (statement app `3b566b11cf91470c`): the lint now fails
    on it (1 innerHTML finding), and `npm run unit` fails: 461 tests, 439 pass, 3 fail, 19
    skipped, the full synthetic tree's injection test among the failures (before: 449 tests, 430
    pass, 0 fail). A variant the lint cannot see, raw markup through a forged template array
    passed to the real `html` (`138398d172c32336`): lint, build check and contract exit 0, and
    `npm run unit` fails the same way: the seeded name's gap row and the hostile currency and
    description become markup on the PDF provider in every state (`window.__pwned` set, new
    `<img>` and `<b>` elements, `on*` attributes). The harness on the fixtures and `npm run
    smoke` exit 0 on both: `dist/` has no statement page with fixtures until M12, so the CI half
    is `npm run unit`, as decision 164 put it.
  - Parse error: M9's catch removed (`96f10b007fb4b15b`; its versa page is `43602d08529962a5`):
    lint, build check, contract and the harness exit 0, `npm run unit` fails in
    `parse-error.test.js` (5 tests: the synthetic tree's skeleton, the fallback, and three
    samples whose edits no longer apply to the changed app), and `npm run smoke` now fails (exit
    1; it exited 0 before): the parse-error smoke runs on the synthetic tree's skeleton and
    reports 4 problems, the busy line kept, no error line, and the unhandled rejection and page
    error of the `injected failure`. The golden sensitivity runs below show `compare` failing it.
  - Data-account: decision 176's boundary test in Chrome (every UTF-16 code unit through `esc` and
    `data-account`: NUL and CR change, nothing else) is the review's probe made a test.
- Tests: `npm run unit`: 461 tests, 461 pass, 0 fail, 0 skipped, 96 s (the WP14 entry's 449,
  plus 6 in `lint.test.js`, 3 in `injection.test.js` and 1 each in `callgraph.test.js`,
  `golden.test.js` and `parse-error.test.js`). Without Chrome and the old repositories (`CHROME`
  and `S2C_OLD_ROOT` pointed at nothing): 445 tests, 390 pass, 55 skipped, 0 fail, 66 s.
- Lints: `node test/lint/run.js`, 175 files, exit 0 (headers, privacy with the untracked
  denylist, generic, sinks, sentinels and invisible characters 0 findings each; the sinks lint's
  new forms and its `escape` rule find nothing in the tree). Contract checks: `npm run contract`:
  8 providers, 0 problems, C15 23 pins, C17 and C18 on 175 files; `npm run contract-browser`: 0
  problems (C13 on the custom app's fixtures). `node build/build.js --check`: `dist/` is current
  (9 files).
- Smoke: `npm run smoke`, exit 0. `test/smoke/pages.js`: 8 pages (27 page instances, 5 fixture
  downloads) and the landing page (8 links), 0 problems. `fixtures-golden.js`: the custom app, 9
  states and 45 records, 0 problems. `injection.js` on `dist/`: the custom app's hostile workbook,
  2 page instances, 6 payload states, 30 downloads equal to the hook, its payloads in `#cards`,
  `#status` and `#diagnostics`, coverage met (the page has no configurator), 0 problems.
  `parse-error.js`: no skeleton of this repository qualifies yet, so it ran on a fresh synthetic
  tree's skeleton, whose statement app (`aae82c5c1c36eff3`) and injected piece
  (`5b014bedc97692a3`) are byte copies of this repository's: `syn-skel`, 1 page instance, 5
  downloads kept through the parse error, 0 problems (decision 178).
- The two smokes on a fresh synthetic tree (scratch, the same `runInjection` and
  `runParseError` that the unit tests run): injection, 5 providers with fixtures, 14 page
  instances, 30 payload states, 168 downloads equal to the hook, 0 problems; the PDF provider's
  seeded name and its hostile payloads each reach `#cards`, `#config-list`, `#status` and
  `#diagnostics`, the other three statement-app pages show the seeded name on p0's card and in
  its configurator row, the custom app has no payload, and coverage counts 4, 4, 1 and 1 pages
  for the four targets. Parse error: `syn-skel`, 1 page instance, 5 downloads kept, 0 problems.
- Harness: `node test/harness/run.js --all-fixtures --browser`: the custom app, 9 pass, 0 fail
  (H12: 6 states, 30 records, 0 mismatches, 0 ranges unlike its months, 2 of 2 bogus loads
  warn).
- Golden, one script (decision 179): the baseline, `compare --tier quick`, the S scenarios, the
  three sensitivity runs and the baseline again. Each golden-harness invocation also checked its
  old repositories before and after itself (0 problems, live pages checked, 0 differences).
  Reports are the sha256 prefixes of `<private-dir>/reports/<run>.json`; times are wall-clock per
  invocation.
  - Baseline before: `node test/golden/run.js baseline`: 8 old repositories, 4347 manifest
    entries, 0 problems, 0 differences, live pages checked (3.7 s, report `ac6ce3a8c75c10f4`).
  - `node test/golden/run.js compare --tier quick`, all 8 in one run: 24 environments, every step
    identical (the goldens' pages and downloads, each download also cross-checked as a real
    download), 0 mismatches of any category. Waivers: W1, W3 and W2, as in G8, and no other. W2's
    listing: the seven statement apps' `<id>/E0/O0/I0/C-seed-badname` pages, `@load1` with the
    busy line and the error line and the later steps with the busy line. The new requirement
    (decision 177): on each of the 7 statement apps' E0, `W2 required on 1 page whose old page
    threw: 1 with the error line on the throwing step and the busy line wherever the old page's
    stuck one shows`, so 7 pages checked, 7 passing, 0 failing; the custom app has none. Exit 0,
    report `4660e85194a08827`. The stored goldens give G8's results (the harness's own
    `manifestStats` over the 24 quick manifests, digest `d64feb28f33adf99`).
  - S scenarios: `node test/golden/run.js live --tier quick --security --providers
    versa,maybank,posb,moomoo,chocolate,maribank,stashaway`, each old page captured (read only,
    from `file://`) in the same run: 21 environments, every step identical, 0 mismatches; waivers
    W1, W3, SX1 and W2, as in G8, and no other. S-benign is identical to the old pages; S-break,
    on the new page alone, has 7 pages with no handler run, no `on*` attribute and p0's tag
    `tag other`, and its downloads equal the downloads hook's rebuild, every Download all
    `zipParts(allFiles(), now)`. C-seed-badname against the fresh captures gives the W2 listing
    above and passes the requirement on all 7 (7 pages checked, 7 passing). Exit 0, report
    `e3dbe23f9704912a`.
  - Sensitivity (decision 179; scratch pages in `<private-dir>/tmp`, removed afterwards): `compare
    --tier quick --providers versa --page <scratch>` on the WP13 versa page (`552493b37237ec8f`)
    fails (exit 1) with `w2` mismatches, all on `versa/E0/O0/I0/C-seed-badname` (`w2.throwing` on
    `@load1`, `w2.after` on every later step), no W2 use and nothing else (waivers W1 and W3; at
    G8 the same page passed; report `9389a47e2202d029`). The M9 page with its catch removed
    (`43602d08529962a5`) fails the same way (report `155fbb78e6305123`). The M9 page without the
    error line (`abcaaec9ee1309a8`) fails on `@load1` with `ui.status` (decision 171) and
    `w2.throwing` mismatches, its W2 listing with the error line on none of the steps from
    `@load1` on and the busy line on all of them (report `0494834c1f748c0d`). Their other
    environments are identical.
  - Baseline after: 8 old repositories, 4347 manifest entries, 0 problems, 0 differences, live
    pages checked (4.2 s, report `a19d16eaf10a6292`). Session check: the old repositories'
    manifests (`fsManifest`, mtimes included), taken before the first baseline and after the
    last, are identical: 4347 entries, digest `cd387d1c4d4a6634` (the WP14 entry's), 0
    differences.
- Nothing private reached the repository. The console of every run showed ids, statuses, counts
  and hashes; reports and diff folders are in `<private-dir>`, and the only diff folders these
  runs wrote are the three sensitivity runs'. The repository's file manifest (`fsManifest` with
  mtimes, `dist/` and `.git/index` included, this file left out), taken before the golden script
  and after it: 633 entries, 1 difference, the mtime of the `.git` folder itself, from a `git
  status` during the script; `.git/index` is unchanged. The scratch copies of the tree and the
  scratch pages were removed, and `<private-dir>/tmp` is empty. The user config is unchanged
  (sha256 prefix `b01b9b6a7cde945f`, modified 2026-10-16).
- With these fixes, the M8 and M9 checks the review found missing are part of the tracked tests:
  a raw render of any target fails `npm run unit` in CI through the synthetic payloads, a page
  without M9's catch or its error line fails `npm run smoke` and the golden `compare`, and the
  sinks lint sees every form of a banned name it can read.
- With this entry in place: `node test/lint/run.js`, 175 files, exit 0 (the six lints 0 findings
  each); `node build/build.js --check`: `dist/` is current (9 files); `npm run contract`: 8
  providers, 0 problems, C15 23 pins, C17 and C18 on 175 files; `npm run contract-browser`,
  `npm run smoke` (the four smokes, the parse-error smoke on the synthetic skeleton) and `node
  test/harness/run.js --all-fixtures --browser` exit 0 with the counts above; `npm run unit`:
  461 tests, 461 pass, 0 fail, 0 skipped, 99 s.

### WP15 — CSP hashes (2026-10-20)

M10's work package (design §5.5, §6.4, §8.1 M10, §8.2 WP15; decisions 180-186), on the stage D2
tree (commit `7356120`, M8 and M9 with the stage D2 fixes). The files, as sha256 prefixes (was →
now): `build/csp.js` `4ee2d30d51f81dc0` → `604bf7e5b46f2550`, `build/build.js`
`ad4ee1228a320efc` → `231fba3c6286b79a`, `test/unit/csp.test.js` `930dc1a42fdfcf49` →
`d834672b46ec94c0`, `test/unit/build.test.js` `b8b46aee8993156d` → `1c89c2ac745b874f`,
`test/unit/injection.test.js` `0069420812c4f779` → `838598d95c9ddddc`, `test/smoke/pages.js`
`226cf1194003853e` → `57b1ba4c6adcce3b`, `test/smoke/injection.js` `051a1e1cd6d8614c` →
`e5ec32bcb17286fd`, the nine pages and this file. The G9 script ran with `build/csp.js`
`e05fee2ae59827ae` and `test/unit/csp.test.js` `d329f36fa99c8723`; the one change after it is
decision 182's style-order check with its tests and the `STYLE_POLICY` comment, which changes no
page. The page skeleton (`30f70d15c9ecd2c1`), the stylesheet (`21723d9dcccc54ff`), the landing
skeleton (`99285a6214462c93`), `build/landing.js`, `build/scripts.js` and `build/page.js`, every
core module and app (`core/app/statement-app.js` `aae82c5c1c36eff3`, `providers/etoro/app.js`
`7e18de533217a420`, `core/escape.js` `e7bb921c5a0f8688`), the parsers and pins, the descriptors
and page copy, the fixtures, the golden harness, the generic harness, the test library and the
other smokes are unchanged; so is `package.json`.

- Pages: `node build/build.js` (the default CSP mode, now `hash`) rewrote all nine pages, and only
  their CSP meta changed (decision 180). As sha256 prefixes and sizes (was → now): landing
  `6a6211c925b8f86d` → `eed3292bd95c3f8f` (7,684 → 7,722 bytes), chocolate `8ca61f2c4a5c664e` →
  `05a057e13bd588bb` (1,496,199 → 1,496,906), etoro `71b43248b4f8b938` → `b6147c4fdb3357f8`
  (70,046 → 70,699), maribank `6f2bd3886d793f1d` → `83e799fc12fb85c1` (1,506,912 → 1,507,619),
  maybank `94b044a1836c0f02` → `1cba9ecd37cd7969` (1,502,272 → 1,502,979), moomoo
  `27bffc8fda91618f` → `bd803c381873c854` (1,511,298 → 1,512,005), posb `c17d6e7845e9f5a1` →
  `9adb85fff141147b` (1,523,412 → 1,524,173), stashaway `fdba2159d6f79a90` → `c54e94692768633d`
  (1,518,875 → 1,519,528) and versa `f20c451d43fd7a20` → `d4791d91ce808a02` (1,504,116 →
  1,504,823). Each provider page grows by 653 to 761 bytes (11 to 13 script hashes and the
  style's, the two new directives), the landing page by 38. A `--csp legacy` build of the same
  tree (scratch) equals G8's pages byte for byte, 9 of 9. `node build/build.js --check`: `dist/` is
  current (9 files).
- The first standing-matrix run on the new default, before decision 185, failed 2 of
  `injection.test.js`'s 9 tests: its two samples whose renders bypass escaping asserted
  `window.__pwned is set: a payload ran`, and Chrome now blocked the handlers instead and the
  smoke reported `script-src-attr` violations, besides the markup and download problems it
  reported before. Everything else in that run passed: the lints, `--check`, both contract tiers,
  the four smokes (the pages smoke: 8 pages, 27 page instances, and the landing page, 0
  problems) and the harness on the fixtures; `npm run unit`: 467 tests, 465 pass, 2 fail.
- Lints: `node test/lint/run.js`, 175 files, exit 0 (headers, privacy with the untracked
  denylist, generic, sinks, sentinels and invisible characters 0 findings each).
- Contract checks: `npm run contract`: 8 providers, 0 problems (C14 builds and verifies each page
  in hash mode); C15 23 pins; C17 and C18 on 175 files. `npm run contract-browser`: 0 problems
  (C13 on the custom app's fixtures).
- Unit: `npm run unit`: 467 tests, 467 pass, 0 fail, 0 skipped, 103 s (the stage D2 entry's 461,
  plus 4 in `csp.test.js` and 2 in `build.test.js`, decision 184). In it, `csp.test.js`'s Chrome
  test (about 1 s) and `injection.test.js`'s two changed samples, each with its legacy build
  (decision 185). Without Chrome and the old repositories (`CHROME` and `S2C_OLD_ROOT` pointed at
  nothing): 451 tests, 395 pass, 56 skipped, 0 fail, 70 s (the stage D2 entry's 445, 390 and 55,
  plus the 6 new tests, the Chrome one skipped).
- Smoke: `npm run smoke`, exit 0, on the hash-mode pages. `test/smoke/pages.js`: 8 pages (27 page
  instances, 5 fixture downloads) and the landing page (8 links), 0 problems.
  `fixtures-golden.js`: the custom app, 9 states and 45 records, 0 problems. `injection.js` on
  `dist/`: the custom app's hostile workbook, 2 page instances, 6 payload states, 30 downloads
  equal to the hook, its payloads in `#cards`, `#status` and `#diagnostics`, coverage met, 0
  problems. `parse-error.js`: the synthetic tree's skeleton (its statement app
  `aae82c5c1c36eff3` and injected piece `5b014bedc97692a3` byte copies of this repository's), built
  in hash mode with the injected piece hashed, 1 page instance, 5 downloads kept through the parse
  error, 0 problems.
- Harness: `node test/harness/run.js --all-fixtures --browser`: the custom app, 9 pass, 0 fail
  (H12: 6 states, 30 records, 0 mismatches, 0 ranges unlike its months, 2 of 2 bogus loads warn,
  0 page errors).
- Golden: the gate's runs on this tree are the G9 entry's (design §8.3: changes under `build/`
  are compared before they merge); they found nothing to fix.
- Nothing private reached the repository: the changed files hold code, synthetic samples and this
  log's counts and hashes. The scratch builds, the scratch copy of the tree on which decision 182's
  last change was tried first, and the scratch pages were removed.
- M10's work package is complete; G9 follows.

### G9 — CSP hashes (2026-10-20)

M10's gate (design §5.5, §6.5, §6.7.6, §8.1 M10; decision 187) on the WP15 tree, with the files
the WP15 entry gives for the script (`build/csp.js` `e05fee2ae59827ae`) and the nine hash-mode
pages: landing `eed3292bd95c3f8f`, chocolate `05a057e13bd588bb`, etoro `b6147c4fdb3357f8`,
maribank `83e799fc12fb85c1`, maybank `1cba9ecd37cd7969`, moomoo `bd803c381873c854`, posb
`9adb85fff141147b`, stashaway `c54e94692768633d` and versa `d4791d91ce808a02`. playwright-core
1.57.0 and Chrome 143.0.7499.4, the goldens' versions. The gate's commands ran once each, one
after another in one script: the baseline, the quick compare, the full compare, the S scenarios,
the canary, the sensitivity run, the eight harness runs and the baseline again. The smokes ran in
the standing matrix before the script and again after the WP15 entry's last change, with the same
counts. Each golden-harness invocation also checked its old repositories before and after itself
(0 problems, live pages checked, 0 differences). Reports are the sha256 prefixes of
`<private-dir>/reports/<run>.json` (golden harness) and
`<private-dir>/harness/<run>/<id>/report.json` (harness); times are wall-clock per invocation.
From the full compare on, the host also carried an unrelated workload (load average near 20),
which lengthened the times.

- Result: G9 passes. No `securitypolicyviolation` in the smokes or in golden quick and full for
  all 8, where every new page instance's log is compared: 0 mismatches of any category. Downloads
  with their zip entries, storage and UI are identical, with G8's waivers. No `style-src`
  violation appeared in any run, so `STYLE_POLICY` stays `"hash"` and D10 is not taken
  (decision 187). The S scenarios, the canaries and the real-statement harness keep G8's results
  under the hash policy. Every gate command passed at its first attempt, so nothing needed a fix.
- Baseline before: `node test/golden/run.js baseline`: 8 old repositories, 4347 manifest
  entries, 0 problems, 0 differences, live pages checked (3.6 s, report `488f54adf50d2f65`).
- Smoke (the WP15 entry's runs): `node test/smoke/pages.js`: 8 pages, 27 page instances, and the
  landing page, 0 problems; in each instance 0 console errors, 0 page errors apart from pdf.js's
  worker fallback on `file://`, and 0 CSP violations. The fixtures golden (9 states, 45 records),
  the injection smoke (2 page instances, 6 payload states) and the parse-error smoke (1 page
  instance) apply the same rule, with 0 problems.
- Golden quick: `node test/golden/run.js compare --tier quick`, all 8 in one run: 24
  environments, every page and step identical; every download also cross-checked as a real
  download; 0 mismatches of any category (steps, downloads with their zip entries, storage, UI
  snapshots, page errors with the CSP violations and console errors, static page snapshots).
  Waivers: W1, W3 and W2, as in G8, and no other; the W2 requirement on 7 pages, 7 passing. Exit
  0, report `28454fc322bcf508`. The stored goldens are unchanged: the 24 quick manifests' digest
  is `d64feb28f33adf99`, the stage D2 entry's (sha256 over the manifests' sha256s in path order).
- Golden full: `node test/golden/run.js compare --tier full`, all 8 in one run: 24
  environments, every page and step identical, with the goldens' downloads; 0 mismatches.
  Waivers: W1, W3 and W2, as in G8, and no other; the W2 requirement on 7 pages, 7 passing. Exit
  0, report `0d011e658b8806fe`. The 24 full manifests' digest, by the same rule, is
  `29c750fed48dde02`.
- S scenarios: `node test/golden/run.js live --tier quick --security --providers
  versa,maybank,posb,moomoo,chocolate,maribank,stashaway`, each old page captured (read only,
  from `file://`) in the same run: 21 environments, every step identical, 0 mismatches; waivers
  W1, W3, SX1 and W2, as in G8, and no other. Exit 0, report `231ed71711136e0c`.
  - S-benign, compared with the old pages like any page: 7 pages identical.
  - S-break, new page only: 7 pages, each with no handler run after a `mouseover` on every
    element of `<main>`, no `on*` attribute, p0's tag `tag other`, a settled load, only frozen
    storage keys and the seeded config string kept, and no page error or CSP violation. Its
    downloads equal the downloads hook's rebuild, every Download all `zipParts(allFiles(), now)`.
    SX1 has one use per S-break step.
  - C-seed-badname against the fresh captures gives G8's W2 listing and passes the W2
    requirement on all 7 (7 pages checked, 7 passing).
- Canary (beyond the gate's list): `node test/golden/run.js canary --provider versa`, four
  hash-mode canary builds (the injected piece hashed as piece 12b): brand, cent, zip-order and
  zip-time mismatches, all of category `downloads`, each failing exactly as expected (as in G1b).
  No canary page logged a violation, which would have added `errors` mismatches. Exit 0, report
  `e3ba09c2faf0dead`.
- Sensitivity (beyond the gate's list; decision 187): `node test/golden/run.js compare --tier
  quick --providers versa --page <scratch>`, on a copy in `<private-dir>/tmp` of the new versa
  page with one space added after the line break that follows `<style>` (`db2c22c0b6992e3d`;
  `verify` reports its style hash and nothing else). Exit 1 with mismatches, all of category
  `errors`, on every page instance of the 3 environments: in each, one `style-src-elem` violation
  of the inline style and the console error Chrome prints for it. Downloads, storage and UI are
  identical, and W1, W3 and W2 are as in the quick run. So `compare` sees a `style-src` violation
  on a real page whatever else holds, which is what G9's D10 rule reads. Report
  `35ff8214246756ae`. The copy was removed afterwards.
- Real-statement harness (G6's commands, beyond the gate's list): `node test/harness/run.js
  --provider <id> --browser` once per provider, in M7's order, on the folder the user config
  names, with its private declarations (none).

  | provider | fail | reported | report |
  |---|---|---|---|
  | versa | 0 | 0 | `d5e65bb87bf2e22e` |
  | maybank | 0 | 0 | `d5a79f6450b622df` |
  | posb | 0 | 0 | `06c6e3d40dcebbf1` |
  | moomoo | 0 | 0 | `d713ed4c575de398` |
  | chocolate | 0 | 0 | `a4f927665c75f0b0` |
  | maribank | 0 | 0 | `c63a916ad88748c6` |
  | stashaway | 0 | 0 | `f0a1cf1f0961eb23` |
  | etoro | 0 | 0 | `4ebdbc6f0249a2ad` |

  - Every run exits 0, with no failing and no reported step; the skips and n/a are G6's
    (decision 149). H5's errors and H6's lines are exactly the private declarations: 0 and 0
    everywhere, with 0 reader failures.
  - H12 on the hash-mode pages, opened on http (decision 145), where pdf.js runs its real worker
    from the `blob:` URL under `worker-src blob:`: the states and captured records equal to the
    downloads hook's rebuild, Download all included, with the range equal to the hook's months in
    every state; 32 of 32 bogus loads warn; no console or page error, CSP violation or overflow
    at 390 px.
  - The eight reports equal G8's byte for byte (the prefixes of its table), so every result G8
    gives for them holds: on the real statements the hash-mode pages give the M9 pages' harness
    results. Only the times differ, with the host's other workload.
  - The user config is unchanged (sha256 prefix `b01b9b6a7cde945f`, modified 2026-10-16), and
    every run removed its `<private-dir>/tmp/harness-<run>` (0 left).
- Baseline after: `node test/golden/run.js baseline`, after the last harness run: 8 old
  repositories, 4347 manifest entries, 0 problems, 0 differences, live pages checked (4.2 s,
  report `446cc7d0a6da262b`). Session check: the old repositories' manifests (`fsManifest`, mtimes
  included), taken before the first baseline and again after the last, are identical: 4347
  entries, 0 differences (digest `2dd2155ab3c3719a`, the serialisation of this entry's scratch
  reader, not comparable with the digests earlier entries give).
- D10 (decision 187): no `style-src` violation in the compares, the S scenarios, the canaries,
  the harness or the smokes, so `STYLE_POLICY` stays `"hash"`, and its comment in `build/csp.js`
  says so since the WP15 entry's last change. D10's second half stays deferred, for the reason the
  scratch experiments of decision 187 show: a page opened from `file://` needs `blob:` in
  `script-src` for pdf.js's fallback worker.
- Nothing private reached the repository. The console of every run showed ids, statuses, counts
  and hashes; reports, harness details and diff folders are in `<private-dir>`, and the only diff
  folders these runs wrote are the four canaries' (which fail by design) and the sensitivity
  run's. `<private-dir>/tmp` is empty. The repository's file manifest (`fsManifest` with mtimes,
  `dist/` and `.git/index` included, this file left out), taken before the script and after it:
  633 entries, 1 difference, the mtime of the `docs` folder itself, from this file's being
  rewritten during the script; `.git/index` is unchanged.
- M10 is complete: G9 passes for all eight providers on the WP15 tree, with no fix.
- With this entry in place: `node test/lint/run.js`, 175 files, exit 0 (the six lints 0 findings
  each); `node build/build.js --check`: `dist/` is current (9 files); `npm run contract`: 8
  providers, 0 problems, C15 23 pins, C17 and C18 on 175 files; `npm run contract-browser`, `npm
  run smoke` (the four smokes, the parse-error smoke on the synthetic skeleton) and `node
  test/harness/run.js --all-fixtures --browser` exit 0 with the counts above; `npm run unit`:
  467 tests, 467 pass, 0 fail, 0 skipped, 103 s.

### WP16 — storage compatibility (2026-10-20)

M11's work package (design §6.8, §8.1 M11, §8.2 WP16; decisions 188-194), on the WP15 tree:
commit `7356120` (M8 and M9 with the stage D2 fixes) with WP15's files, each with the hash the
WP15 entry gives. Five new files, as sha256 prefixes: `test/storage-compat/run.js`
`f27f6222d9200102`, its injected pieces `test/storage-compat/inject/rename-config-key.js`
`03d6b5df7f7c69cf`, `rename-mode-key.js` `aaa006d7eaaf7840` and `clear-storage.js`
`0afe35a9656c7a07`, and `test/unit/storage-compat.test.js` `94ebfafe4ebd1f6a`; and this file.
Nothing else changed. The nine pages are the WP15 entry's (landing `eed3292bd95c3f8f`, chocolate
`05a057e13bd588bb`, etoro `b6147c4fdb3357f8`, maribank `83e799fc12fb85c1`, maybank
`1cba9ecd37cd7969`, moomoo `bd803c381873c854`, posb `9adb85fff141147b`, stashaway
`c54e94692768633d` and versa `d4791d91ce808a02`), and so are the build (`build/csp.js`
`604bf7e5b46f2550`, `build/build.js` `231fba3c6286b79a`), every core module and app
(`core/app/statement-app.js` `aae82c5c1c36eff3`), the parsers and pins, the descriptors, the
fixtures, the test library (`test/lib/serve.js` `862af9a217bc18a6`, `page-driver.js`
`bffeac59066e8d49`, `browser.js` `2f6cb312add0aee5`, `capture.js` `3492f53807610a3d`), the golden
harness, whose UI and download comparison (`test/golden/compare.js` `9741dad53bd6f430`) and
hostile name (`test/golden/scenarios.js` `298c6ddb76482ff2`) the run reuses, the generic harness,
the smokes, the synthetic tree and `package.json` (`cef7f215edb7412f`, decision 194).

- First runs on the real statements, before the last edits (scratch runs with `--no-live`, so
  not gate runs): the check passed all 8 providers, and the self-test found every mutant exactly
  as expected on its 23 provider runs. The edits after them touched the console and the report
  only (the settings' names, the self-test's verdicts printed as each provider finishes, the
  run's verdict printed after the baseline, the results digest), never a check, and added unit
  tests; the gate ran on the final files (the G10 entry).
- Lints: `node test/lint/run.js`, 180 files (the five new ones included), exit 0 (headers,
  privacy with the untracked denylist, generic, sinks, sentinels and invisible characters 0
  findings each).
- Contract checks: `npm run contract`: 8 providers, 0 problems; C15 23 pins; C17 and C18 on 180
  files. `npm run contract-browser`: 0 problems (C13 on the custom app's fixtures).
- Unit: `npm run unit`: 493 tests, 493 pass, 0 fail, 0 skipped, 54 s (the WP15 entry's 467, plus
  `storage-compat.test.js`'s 26: 13 tests, one of them with 13 subtests; decision 193). Without
  Chrome and the old repositories (`CHROME` and `S2C_OLD_ROOT` pointed at nothing): 464 tests,
  406 pass, 58 skipped, 0 fail, 30 s (the WP15 entry's 451, 395 and 56, plus the new file's 13
  tests, its two Chrome tests skipped).
- Smoke: `node test/smoke/pages.js`: 8 pages (27 page instances, 5 fixture downloads) and the
  landing page (8 links), 0 problems. `fixtures-golden.js`: the custom app, 9 states and 45
  records, 0 problems. `injection.js` on `dist/`: the custom app's hostile workbook, 2 page
  instances, 6 payload states, 30 downloads equal to the hook, coverage met, 0 problems.
  `parse-error.js`: the synthetic tree's skeleton (its statement app `aae82c5c1c36eff3` and
  injected piece `5b014bedc97692a3` byte copies of this repository's), 1 page instance, 5
  downloads kept through the parse error, 0 problems.
- Harness: `node test/harness/run.js --all-fixtures --browser`: the custom app, 9 pass, 0 fail.
- `node build/build.js --check`: `dist/` is current (9 files).
- Golden: no page, core module, build file or provider file changed, so design §8.3 asks for no
  golden run; the G9 entry's runs stand for these pages.
- Nothing private reached the repository: the new files hold code and synthetic samples, and this
  file counts and hashes. The scratch runs' reports are in `<private-dir>/reports`; their
  temporary folders (the browser profile, the mutant pages and the observer page) went with
  `<private-dir>/tmp/<run>`.
- M11's work package is complete; G10 follows.

### G10 — storage compatibility (2026-10-20)

M11's gate (design §6.8, §8.1 M11; decision 195) on the WP16 tree, with the files the WP16 entry
gives (`test/storage-compat/run.js` `f27f6222d9200102`) and the nine pages of the WP15 entry.
playwright-core 1.57.0 and Chrome 143.0.7499.4, the goldens' versions. The gate's commands ran
once each, one after another in one script: a session check, the baseline, the check twice, the
self-test, the baseline again and the session check again. Each run of
`test/storage-compat/run.js` also checked the old repositories before and after itself (0
problems, live pages checked, 0 differences). Reports are the sha256 prefixes of
`<private-dir>/reports/<run>.json`; times are wall-clock per invocation.

- Result: G10 passes. For all 8 providers, on one origin, what the new page saves the old page
  reads and the other way round: in (a) and in (b) the reader shows the writer's configurator
  and mode and gives the same downloads, reads exactly the strings the writer left and changes
  nothing; (c) every storage call of a new page is on one of its frozen keys, with allowed values
  only; the old and the new pages made the same calls with the same strings, so the keys are
  unchanged; and no page read or changed another provider's key or the unrelated page's. Every
  command passed at its first attempt, so nothing needed a fix.
- Baseline before: `node test/golden/run.js baseline`: 8 old repositories, 4347 manifest entries,
  0 problems, 0 differences, live pages checked (4 s, report `60c8dd7e8ca8ddeb`).
- Check: `node test/storage-compat/run.js`, all 8 on one origin in one context, its storage
  seeded with every frozen provider's keys and the unrelated page's (16 keys): exit 0, report
  `b151664881ba87c6`, results digest `dc10f6109ba9e88e`. 0 problems of any category, and at the
  end the 16 keys each as its owner left it.

  The mode the writer picks is holdings on the seven statement apps and day on the custom app.

  - In each provider's two phases: the UI snapshots equal (W3 on stashaway's legacy
    configurator), the picked mode shown on both pages, every download equal with its zip
    entries, the reader's start-up reads equal to what the writer left, and no change by the
    reader. The settings changed the writer's configurator and downloads (the custom app's mode
    changed its downloads), so no phase was vacuous. No console error, page error or CSP
    violation on any of the 32 page instances.
  - Every read and write of the new pages was on a frozen key of its provider with an allowed
    value; for every provider the old and the new writer made the same calls, step by step, and
    so did the two readers.
  - The settings are those of the golden harness's C-ui-combo (decision 190): merge and exclude
    need two rows, so where a configurator has one row the settings are the rename and a kind
    only, and the custom app's is the mode.
- Check again (beyond the gate's list): the same command, exit 0, report `9ebcb3fa9eb219ea`, with
  the same results and the same results digest `dc10f6109ba9e88e`: the run is deterministic on
  these statements.
- Self-test (beyond the gate's list; decision 192): `node test/storage-compat/run.js
  --self-test`, each mutant on a site of its own against the real old pages: exit 0, report
  `ead2666f8d0ac0b8`. Every mutant failed exactly as expected on every provider it applies to (23
  provider runs):
  - `rename-config-key`, on the 7 configurator providers (the custom app has no config key):
    `a.config`, `b.config`, `b.read`, `c.read`, `c.key` and `keys`, with the readers' cards and
    status (UI fields) and downloads differing too, and no mode, `a.read`, `cross` or `vacuous`
    problem;
  - `rename-mode-key`, on all 8: `a.mode`, `b.mode`, `b.read`, `c.read`, `c.key` and `keys`, and
    no configurator problem; the downloads differ wherever an account follows the mode, and where
    none does, the mode buttons alone show the mutant;
  - `clear-storage`, on all 8: `cross`, `c.remove` and `keys`, and in (b) `b.mode`, `b.read`,
    `b.storage` and, on the 7 configurator providers, `b.config`; (a) passed whole.
- Baseline after: `node test/golden/run.js baseline`: 8 old repositories, 4347 manifest entries,
  0 problems, 0 differences, live pages checked (4 s, report `988789c2facfc296`). Session check
  (a scratch reader with `fsManifest`, mtimes included): the old repositories' 4347 entries are
  identical before the first command and after the last (digest `268d8fea635eb05a`), and so are
  this repository's 263 (`test/node_modules` and this file left out, `dist/` and `.git/index`
  included; digest `920fe10375a2b478`). The digests are this entry's serialisation, not
  comparable with earlier entries'. The user config is unchanged (sha256 prefix
  `b01b9b6a7cde945f`, modified 2026-10-16).
- Nothing private reached the repository. The console of every run showed ids, counts, problem
  categories, step and key names and digests; the reports are in `<private-dir>`, and every run
  removed its `<private-dir>/tmp/<run>` (0 left).
- M11 is complete: G10 passes for all eight providers on the WP16 tree, with no fix.
- With this entry in place: `node test/lint/run.js`, 180 files, exit 0 (the six lints 0 findings
  each); `node build/build.js --check`: `dist/` is current (9 files); `npm run contract`: 8
  providers, 0 problems, C15 23 pins, C17 and C18 on 180 files; `npm run contract-browser`, the
  four smokes (the parse-error smoke on the synthetic skeleton) and `node test/harness/run.js
  --all-fixtures --browser` exit 0 with the WP16 entry's counts; `npm run unit`: 493 tests, 493
  pass, 0 fail, 0 skipped, 49 s.

### WP12 — templates, scaffold and docs (2026-10-20)

M12's work package (design §2.13, §6.5, §7, §8.1 M12, §8.2 WP12; decisions 196-204), on the WP16
tree: commit `7356120` (M8 and M9 with the stage D2 fixes) with WP15's and WP16's files, each
with the hash their entries give. New files, as sha256 prefixes: the CSV template
`providers/_template-csv/provider.js` `907ef1fab9cb3011`, `parser.js` `5f42da9a90c13891`,
`page.html` `6f47c7ee3666510c`, `README.md` `6da76f571c566495`, `fixtures/statements.js`
`7924609ede9d4600` and `fixtures/expected.js` `e9111b0db131872d`; the PDF template
`providers/_template-pdf/provider.js` `3bc22e5685c3fbf6`, `parser.js` `ede01fc1479a9c4f`,
`page.html` `b94126cf3477bd7a`, `README.md` `cc5da2ded7037744`, `fixtures/statements.js`
`646d2bd6ffab973b`, `fixtures/hostile.js` `8fa3e2589bf856c4` and `fixtures/expected.js`
`06b33fd1a9cda729`; `tools/new-provider.js` `4e112ca1d7ef1382`;
`test/contract/new-provider-dryrun.js` `ffcc244a93bd4835`; `test/unit/new-provider.test.js`
`d14918d8b6eec9a2`; `docs/CONTRACT.md` `374ab371bff55765`, `docs/ARCHITECTURE.md`
`943159a4f06090ed`, `docs/TESTING.md` `891f15e19291174c`, `docs/SECURITY.md` `8bff56762a569036`
and `docs/ADDING_A_PROVIDER.md` `e2051f0b5ac04850`. Changed (was → now):
`test/smoke/parse-error.js` `bc88c699b55048c5` → `c451697928d10260`,
`test/unit/parse-error.test.js` `efd786416678fdd2` → `f8515ec943ea2b42`, `README.md`
`8973782223d9051d` → `e4f49c2e461e3e97`, and this file. Nothing else changed: every core module
and app (`core/app/statement-app.js` `aae82c5c1c36eff3`), the build (`build/build.js`
`231fba3c6286b79a`, `build/csp.js` `604bf7e5b46f2550`), the eight providers' files and pins,
eToro's fixtures, the test library, the golden harness, the generic harness
(`test/harness/run.js` `7c94ba49c9d6cc69`), the contract checks (`test/contract/run.js`
`d8d01d5572968d05`), the other smokes (`test/smoke/pages.js` `57b1ba4c6adcce3b`,
`fixtures-golden.js` `d59e18f194dd1c2f`, `injection.js` `e5ec32bcb17286fd`), the storage run, the
synthetic tree (`test/unit/synthetic-tree.js` `330e94e82684b232`) and `package.json`
(`cef7f215edb7412f`, decision 204). The templates are skeletons, so `dist/` is unchanged: the nine
pages are the WP15 entry's, byte for byte (landing `eed3292bd95c3f8f`, chocolate
`05a057e13bd588bb`, etoro `b6147c4fdb3357f8`, maribank `83e799fc12fb85c1`, maybank
`1cba9ecd37cd7969`, moomoo `bd803c381873c854`, posb `9adb85fff141147b`, stashaway
`c54e94692768633d` and versa `d4791d91ce808a02`).

- Templates (decisions 196-198): both pass the contract checks of both tiers and the harness in
  strict mode on their fixtures with `--browser`. CSV: 6 inputs (1 declared error), 3 accounts,
  7 month-end values; H7 5 of 5 gap cases, H8 18 states and 108 downloads, H9 5 config checks,
  H10's reversed order the same result, H12 14 states and 110 records equal to the hook; 12
  passed, 3 skipped (H11 without frozen.js, H13, H14). PDF: 4 inputs (1 declared error), 3
  accounts, 9 month-end values; H7 4 of 4, H8 12 states and 102 downloads, H9 5 checks, H10's
  reversed order skipped (the duplicate), H12 15 states and 119 records; 12 passed, 3 skipped
  (H11, H13, H14), and H13 passes on a `--dump` run (8 files). `fixtures/expected.js`: 9 states
  and 63 records (CSV), 9 states and 75 records (PDF).
- Scaffold and dry run (decisions 199, 200): during development the dry run's first version
  passed with "0 pages" after both scaffolds had refused (the wider name check, since dropped),
  which is why each step now has to print what it checked; on the final files it passes, 14
  steps (below).
- The parse-error smoke on the CSV template (decision 201): `ok template-csv (temporary build,
  injected piece): 1 page instance, 9 downloads kept through the parse error`.
- Lints: `node test/lint/run.js`, 201 files, exit 0 (headers, privacy with the untracked
  denylist, generic with the untracked app list, sinks, sentinels and invisible characters, 0
  findings each). `node --check` on the 155 `.js` files a commit would hold: exit 0.
- Contract checks: `npm run contract`: 10 providers (the eight, both templates), 0 problems; C15
  23 pins; C17 and C18 on 201 files. `npm run contract-browser`: 3 providers with fixtures (C13 on
  the custom app's and both templates' fixtures), 0 problems.
- Unit: `npm run unit`: 505 tests, 505 pass, 0 fail, 0 skipped, 48 s (the WP16 entry's 493, plus
  `new-provider.test.js`'s 12; `parse-error.test.js` stays at 12, one removed and one added,
  decision 201). Without Chrome and the old repositories (`CHROME` and `S2C_OLD_ROOT` pointed at
  nothing): 476 tests, 418 pass, 58 skipped, 0 fail, 32 s.
- Smoke: `npm run smoke`, exit 0. `test/smoke/pages.js`: 10 pages (8 from `dist/`, both
  templates as temporary builds; 35 page instances, 23 fixture downloads) and the landing page (8
  links), 0 problems. `fixtures-golden.js`: 3 providers, 27 states and 183 records (both
  templates 9 states each, 63 and 75 records; the custom app 9 and 45), 0 problems.
  `injection.js`: 3 providers, 10 page instances, 24 payload states and 150 downloads equal to the
  hook; the seeded name reaches `#cards`, `#config-list` and `#status` on the CSV template and
  `#cards`, `#config-list` and `#diagnostics` on the PDF one, the PDF template's hostile payloads
  all four targets, the custom app's `#cards`, `#status` and `#diagnostics`; coverage met
  (`#cards` 3, `#config-list` 2, `#status` 3, `#diagnostics` 2 pages), 0 problems.
  `parse-error.js`: the CSV template, 1 page instance, 9 downloads kept, 0 problems.
- Harness: `node test/harness/run.js --all-fixtures --browser`: 3 providers, 0 failed (both
  templates 12 passed each, the custom app 9), 6 s.
- `node build/build.js --check`: `dist/` is current (9 files).
- Golden: no page, core module, build file or published provider changed, so design §8.3 asks for
  no golden run; the G9 entry's runs stand for these pages.
- Nothing private reached the repository: the new files hold code, synthetic data and docs with
  placeholders, and this file counts and hashes. The scratch copies, the invented statements of
  the reader test and their outputs stayed in the session's scratch folder.
- M12's work package is complete; G11 follows.

### G11 — extensibility (2026-10-20)

M12's gate (design §6.5, §7, §8.1 M12; decision 205) on the WP12 tree, with the files the WP12
entry gives. playwright-core 1.57.0 and Chrome 143.0.7499.4. Times are wall-clock per
invocation.

- Result: G11 passes. A provider is added as one folder: the dry run scaffolds one from each
  template into a copy of the tree, and with no edit to `core/`, `build/`, `test/` or `tools/` both
  build, pass the contract checks of both tiers, the harness, the smokes and their fixtures
  golden, and change nothing but their own files and pages. The templates' and the custom app's
  fixtures goldens pass, and so do the generic and privacy lints. A literal reading of
  `docs/ADDING_A_PROVIDER.md` took a throwaway provider from nothing to step 9's checks, in two
  passes, after the nine fixes of decision 205.
- Dry run: `node test/contract/new-provider-dryrun.js`, exit 0, 22 s: 14 steps, 0 failed. The copy
  held 201 files; both scaffolds wrote their folders (`frozen.js` and a fresh `expected.js` that
  names the dry-run brand and not the templates'); the build wrote 11 files and `--check` found
  them current; the contract checks of both tiers passed for the 2 new providers; the harness
  with `--all-fixtures --browser` passed 5 providers (both templates, the custom app and the two
  new ones); the pages smoke 2 pages, the fixtures golden 2 providers (no `--update`), the
  injection smoke 2 providers; the lints found nothing in the 17 new files and pages; `git status`
  listed 18 paths, the new folders' 15 files, their 2 pages and `dist/index.html`.
- Fixtures goldens: `node test/smoke/fixtures-golden.js`, exit 0, 2 s: 3 providers, 27 states and
  183 records equal to `fixtures/expected.js` and to the downloads hook, 0 problems.
- Lints: `node test/lint/run.js`, exit 0: 201 files, the privacy lint (with the untracked
  denylist) and the generic lint (with the untracked app list) 0 findings each, and the other four
  lints 0 findings.
- The reader test (decision 205): two passes in scratch git copies of the tree, each through
  every step with invented statements outside the copy.
  - Pass 1 (`--from csv`, a made-up export format with semicolons, European numbers and debit and
    credit columns; 9 input files, of which 2 rightly give errors): the scaffold, the dump, a new
    parser, the harness green with the 2 errors declared in a scratch user config (12 passed),
    page copy, fixtures (8 files, one duplicate) with a generated `expected.js` (9 states, 69
    records), the harness on the fixtures and the statements with `--browser` (13 passed each), the
    injection smoke, the page opened and read, and step 9's commands: `npm run check`, `contract`
    (11 providers), `contract-browser` (4), `lint` (209 files), `unit` (505 tests), `smoke` (11
    pages; the parse-error smoke on the CSV template), the harness with `--all-fixtures --browser`
    (4 providers) and the dry run (14 steps), all exit 0. Apart from the scaffold, copied in again
    with the fixes, `git status` listed the provider's 7 files, its page and `dist/index.html`:
    the guide's list to commit.
  - Pass 2 (`--from pdf`, a made-up statement layout whose withdrawal and deposit columns differ
    only by position; 6 input files, 1 rightly an error), on a fresh copy with pass 1's fixes in
    the guide: the same steps with a parser on `pageLines` cell positions, fixtures (6 files)
    with a generated `expected.js` (9 states, 57 records), a rewritten `hostile.js` whose payloads
    reach all four render targets, and step 9's commands, all exit 0 (harness 13 passed; 4
    providers with fixtures; 505 unit tests; 210 files linted; the dry run 14 steps).
  - Nine findings, each fixed before the pass went on (decision 205): seven in pass 1, two in pass
    2, which then followed the fixed text to the end.
- Side effect (decision 205): pass 1's literal install, before the fix, removed `firefox-1447`
  from the shared Playwright browser folder and downloaded `ffmpeg-1011`; the run's own additions
  were removed afterwards, the removed browser is not restored, and the tests' browser was never
  touched.
- Baseline after the reader test: `node test/golden/run.js baseline`: 8 old repositories, 4347
  manifest entries, 0 problems, 0 differences, live pages checked (report `423911196e4985f0`).
- Standing matrix on the final tree (the WP12 entry's counts): `node --check` on 155 files, the
  lints, `node build/build.js --check`, `npm run contract`, `npm run contract-browser`, `npm run
  unit` (also without Chrome and the old repositories), the four smokes one by one and as `npm
  run smoke`, `node test/harness/run.js --all-fixtures --browser` and the dry run: every command
  exit 0, 14 of 14. Three docs had wording fixes after it (no code changed); the lints and the
  node-tier contract checks ran again on them, 201 files, 0 findings and 0 problems.
- Nothing private reached the repository; the console of every run showed ids, statuses, counts
  and hashes. The reader test's scratch copies, invented statements, scratch user config and
  private folder stayed in the session's scratch folder.
- M12 is complete: G11 passes on the WP12 tree.

### Stage E fixes (2026-10-20)

The four findings of the M10-M12 review, each confirmed first (its experiment run again on this
tree), then fixed (decisions 206-209): label-collision (206, major), verify-policy-trust (207),
markup-scan-bypass (208) and dryrun-config-isolation (209). Decisions 181, 184, 196, 197, 198, 200
and 202 are amended in place, and the derivation map's rows of the templates and the dry run name
the new decisions. The review reported no verification failures.

- Files, as sha256 prefixes (was → now; the "was" values are the WP12 and WP15 entries' and equal
  the review's copy of the tree): the CSV template's `parser.js` `5f42da9a90c13891` →
  `28e12c936c28170b`, `fixtures/statements.js` `7924609ede9d4600` → `a92efa4c284a3b98`,
  `fixtures/expected.js` `e9111b0db131872d` → `bba50d77f231a743` and `README.md` `6da76f571c566495`
  → `bc8a4861da8e8557`; the PDF template's `parser.js` `ede01fc1479a9c4f` → `701be01e4ed2ccb6`,
  `fixtures/statements.js` `646d2bd6ffab973b` → `a74e32b3cd52941e`, `fixtures/expected.js`
  `06b33fd1a9cda729` → `8a42980cf1aa9b68` and `README.md` `cc5da2ded7037744` → `8a2b9f1b74035adf`;
  `build/csp.js` `604bf7e5b46f2550` → `3bb687ea799e9d8a`; `test/contract/new-provider-dryrun.js`
  `ffcc244a93bd4835` → `9880d229b82de2a5`; `test/unit/csp.test.js` `d834672b46ec94c0` →
  `bb0c612bd683139d`, `test/unit/new-provider.test.js` `d14918d8b6eec9a2` → `a5df0ec4dae99307` and
  the new `test/unit/templates.test.js` `ed80fddabcf0d2c3`; `docs/ADDING_A_PROVIDER.md`
  `e2051f0b5ac04850` → `9d5dff959059273c`, `docs/TESTING.md` `891f15e19291174c` →
  `d18108b7192ac083`, `docs/SECURITY.md` `8bff56762a569036` → `34130186ebdfe726` and
  `docs/ARCHITECTURE.md` `943159a4f06090ed` → `213d2ccc971d0a5b`; and this file. Nothing else
  changed: `build/build.js` (`231fba3c6286b79a`) and `policy()`, every core module and app
  (`core/assemble.js` `5c212c54a77da192`, `core/contract/result.js` `dc0f6faeb7a840b8`,
  `core/app/statement-app.js` `aae82c5c1c36eff3`), the eight providers, the PDF template's
  `fixtures/hostile.js` (`8fa3e2589bf856c4`), the scaffold, the test library, the golden harness,
  the generic harness, the smokes, the storage run, `docs/CONTRACT.md` and `package.json`. `dist/`
  holds G9's nine pages byte for byte (landing `eed3292bd95c3f8f`, chocolate `05a057e13bd588bb`,
  etoro `b6147c4fdb3357f8`, maribank `83e799fc12fb85c1`, maybank `1cba9ecd37cd7969`, moomoo
  `bd803c381873c854`, posb `9adb85fff141147b`, stashaway `c54e94692768633d`, versa
  `d4791d91ce808a02`); a build of this tree with the skeletons into a scratch folder gives the same
  eight provider pages.
- The findings' experiments, run again on the fixed tree (scratch copies of it, never this
  repository; synthetic data; `S2C_OLD_ROOT` an empty folder, as in CI), and each new test on the
  review's files (put back into a scratch copy), where it must fail:
  - Labels: the review's three CSV exports give 3 portfolios and 3 accounts, each in its own
    currency with its own cash and valuation (`checkResult` strict 0 errors and 0 warnings,
    `adjustedEntries` 0 problems), and its two PDF sections 2 accounts. With the review's parsers,
    `templates.test.js` fails both tests, and the new fixtures catch the merge in CI: the harness on
    the fixtures fails H6, H6b and H7 on both templates (7 and 8 H6 lines: the merged account's
    `cannot convert USD entry`, its months off by the USD amounts and its running balance missing
    month-end values), and the fixtures golden fails both templates (63 and 75 records against
    `expected.js`'s 69 and 93).
  - Policy: the review's mutant, `policy()` skipping the runtime object's piece, on the fixed tree:
    `node build/build.js` exits 1 with "8 problem(s); nothing was written", each published page's
    runtime object "not listed in script-src", `dist/` untouched; `node test/contract/run.js --tier
    node` exits 1, C14 failing on all 10 providers. With the review's `build/csp.js`, `csp.test.js`
    fails 6 of its 13 tests: the fault test ("drops the runtime object's hash: got []"), both modes'
    defect lists (the first sample missed: the handler after a slash) and the landing page's (the
    handler after a quoted `>`), and the markup tests, in Node and in Chrome.
  - Markup: the review's probe on the versa page now reports each of its four forms in hash mode (1
    problem each), the two handler forms in legacy mode too (the style attribute being hash mode's
    rule there, as before), and its control as before.
  - Dry run: under a developer config that refuses the temporary root, with the statements root
    there too (a scratch `XDG_CONFIG_HOME` and `TMPDIR`): the fixed dry run passes all 14 steps
    (exit 0, 21 s), and the review's version fails 9 of 14 (exit 1, 4 s), as the review found; the
    scratch temporary root is empty afterwards. `new-provider.test.js`'s new test fails on the
    review's dry run (`stepEnv` is not there).
- Tests: `npm run unit`: 512 tests, 512 pass, 0 fail, 0 skipped, 48 s (the WP12 entry's 505, plus 4
  in `csp.test.js`, 2 in the new `templates.test.js` and 1 in `new-provider.test.js`). Without
  Chrome and the old repositories (`CHROME` and `S2C_OLD_ROOT` pointed at nothing): 483 tests, 424
  pass, 59 skipped, 0 fail, 31 s (the WP12 entry's 476, 418 and 58, plus the 7 new tests, the Chrome
  one skipped).
- Lints: `node test/lint/run.js`, 202 files, exit 0 (headers, privacy with the untracked denylist,
  generic with the untracked app list, sinks, sentinels and invisible characters, 0 findings each).
  `node --check` on the 156 `.js` files a commit would hold: exit 0.
- Contract checks: `npm run contract`: 10 providers, 0 problems (C14 builds and verifies every page
  with the new checks); C15 23 pins; C17 and C18 on 202 files. `npm run contract-browser`: 3
  providers with fixtures (C13 on the custom app's and both templates' fixtures), 0 problems. `node
  build/build.js --check`: `dist/` is current (9 files).
- Smoke: `npm run smoke`, exit 0, and the four smokes one by one with the same counts.
  `test/smoke/pages.js`: 10 pages (8 from `dist/`, both templates as temporary builds; 35 page
  instances, 27 fixture downloads, the WP12 entry's 23 plus the new accounts' 2 on each template)
  and the landing page (8 links), 0 problems. `fixtures-golden.js`: 3 providers, 27 states and 207
  records (69, 93 and the custom app's 45), 0 problems. `injection.js`: 3 providers, 10 page
  instances, 24 payload states and 168 downloads equal to the hook (48, 90 and 30); the seeded name
  and the hostile payloads reach the WP12 entry's targets, coverage met (`#cards` 3, `#config-list`
  2, `#status` 3, `#diagnostics` 2 pages), 0 problems. `parse-error.js`: the CSV template, 1 page
  instance, 11 downloads kept through the parse error, 0 problems.
- Harness: `node test/harness/run.js --all-fixtures --browser`: 3 providers, 0 failed, 6 s. CSV
  template: 7 inputs (1 declared error), 4 accounts, 9 month-end values; H7 5 of 5 gap cases; H8 18
  states and 126 downloads; H9 5 config checks; H10's reversed order the same result; H12 15 states
  and 137 records equal to the hook; 12 passed, 3 skipped (H11 without `frozen.js`, H13, H14). PDF
  template: 4 inputs (1 declared error), 4 accounts, 12 month-end values; H7 4 of 4; H8 12 states
  and 126 downloads; H9 5 checks; H10's reversed order skipped (the duplicate); H12 15 states and
  149 records; 12 passed, 3 skipped. The custom app: 9 passed, as before.
- Dry run: `node test/contract/new-provider-dryrun.js`, exit 0, 22 s: 14 steps, 0 failed. The copy
  held 202 files; both scaffolds wrote their folders with `frozen.js` and a fresh `expected.js`; the
  build wrote 11 files and `--check` found them current; the contract checks of both tiers passed
  for the 2 new providers; the harness passed 5 providers; the pages smoke 2 pages, the fixtures
  golden 2 providers, the injection smoke 2 providers; the lints found nothing in the 17 new files
  and pages; `git status` listed 18 paths. Under the developer config that refuses its temporary
  root: the same 14 steps, 0 failed (above).
- Golden, one script (decision 210): a session check, the baseline, `compare --tier quick`, the
  baseline again and the session check again. Each golden-harness invocation also checked its old
  repositories before and after itself (0 problems, live pages checked, 0 differences). Reports
  are the sha256 prefixes of `<private-dir>/reports/<run>.json`.
  - Baseline before: `node test/golden/run.js baseline`: 8 old repositories, 4347 manifest entries,
    0 problems, 0 differences, live pages checked (4 s, report `52a9edb891b995ff`).
  - `node test/golden/run.js compare --tier quick`, all 8 in one run: 24 environments, every step
    identical (the goldens' pages and downloads, each download also cross-checked as a real
    download), 0 mismatches of any category. Waivers: W1, W3 and W2, as in G8 and G9, and no
    other; the W2 requirement on 7 pages, 7 passing. Exit 0, report `fab2172723709598`. The
    stored goldens are unchanged: the 24 quick manifests' digest is `d64feb28f33adf99`, the G9
    entry's.
  - Baseline after: 8 old repositories, 4347 manifest entries, 0 problems, 0 differences, live pages
    checked (4 s, report `ca9be1c83f79f5c7`). Session check (the G10 entry's scratch reader,
    `fsManifest` with mtimes): the old repositories' 4347 entries are identical before the first
    command and after the last (digest `268d8fea635eb05a`, the G10 entry's), and this repository's
    289 (`test/node_modules` and this file left out, `dist/` and `.git/index` included) differ in
    one entry only, the mtime of the `.git` folder itself, from a `git status` during the script;
    `.git/index` is unchanged. The user config is unchanged (sha256 prefix `b01b9b6a7cde945f`,
    modified 2026-10-16).
- Nothing private reached the repository: the changed files hold code, synthetic data and docs with
  placeholders, and this file counts and hashes. The console of every run showed ids, statuses,
  counts and hashes; reports and harness details are in `<private-dir>`. The scratch copies of the
  tree, the scratch user config, the scratch temporary roots and the scratch private folder stayed
  in the session's scratch folder and were removed afterwards.
- With these fixes, the M10-M12 checks the review found missing are part of the tracked tests: both
  templates' fixtures hold one number in two currencies, so a parser that merges such portfolios
  fails the harness and the fixtures golden in CI; a fault in `policy()` fails the build and C14; an
  attribute the browser reads after a `/`, a quoted `>` or a quoted value fails `verify` in both
  modes; and the dry run gives the same result with or without an untracked user config.
- With this entry in place: `node test/lint/run.js`, 202 files, exit 0 (the six lints 0 findings
  each); `node build/build.js --check`: `dist/` is current (9 files); `npm run contract`: 10
  providers, 0 problems, C15 23 pins, C17 and C18 on 202 files; `npm run contract-browser`, `npm run
  smoke`, `node test/harness/run.js --all-fixtures --browser` and the dry run exit 0 with the counts
  above; `npm run unit`: 512 tests, 512 pass, 0 fail, 0 skipped.

### Stage E commit check (2026-10-20)

The orchestrator's own re-run before the stage E commit, on the tree of the Stage E fixes entry,
in one script, one command after another. Reports are the sha256 prefixes of
`<private-dir>/reports/<run>.json`.

- Session check (the G10 entry's scratch reader) before the first command and after the last: the
  old repositories' 4347 entries identical (digest `268d8fea635eb05a`), this repository's 289
  entries identical (`9db674998821c626`; `test/node_modules` and this file left out, `dist/` and
  `.git/index` included), and the user config unchanged (`b01b9b6a7cde945f`).
- Baseline before and after: 8 old repositories, 4347 manifest entries, 0 problems, 0 differences,
  live pages checked (reports `1c1b74cc91108b7b` and `1ad64907fda183c7`).
- Exit 0 each: `node --check` on the 156 `.js` files a commit would hold; `node test/lint/run.js`;
  `node build/build.js --check` (9 files current); `node tools/provenance.js check` (23 pins, 0
  problems) and `rederive` (23 pins from 8 old repositories, 23 reproduced byte for byte); `npm
  run contract` (10 providers, 0 problems) and `npm run contract-browser` (3 providers, 0
  problems).
- `npm run unit`: 512 tests, 512 pass, 0 fail, 0 skipped, 53 s; without Chrome and the old
  repositories: 483 tests, 424 pass, 59 skipped, 0 fail. `npm run smoke`, `node test/harness/run.js
  --all-fixtures --browser` (3 providers, 0 failed) and the dry run (14 steps, 0 failed) exit 0
  with the Stage E fixes entry's counts.
- `node test/storage-compat/run.js`: PASS, 8 of 8 providers ((a), (b), (c), keys and one origin),
  results digest `dc10f6109ba9e88e` (G10's), report `b2982cafbb3225c7`.
- `node test/golden/run.js compare --tier quick`, all 8 in one run: 24 environments, every step
  identical, 0 mismatches; waivers W1, W3 and W2 (as in G8 and G9); report `e7c842403c6cba8c`.
- `node test/harness/run.js --provider <id> --browser` on the real statements of all 8: 0 failed;
  H12 0 mismatches with the hook, 32 of 32 bogus loads warn, 0 page errors (as in the G6 and G8
  entries).
- Privacy scan (the stage B scratch scanner: the working tree and every git object against the
  untracked denylist, the statement file names, and the distinctive strings and amounts of the
  goldens and the extraction cache; counts and hashes only): 0 denylist hits; of the tokens not
  seen at the stage D2 commit, most match only the 15 extraction-cache entries written during
  this stage, which hold the two templates' synthetic fixtures (every token of the 7 CSV entries
  is in the fixture sources, and so is every token of the 8 PDF entries but three structural ones
  of 1 to 3 characters), and the others are generic: common English words, period file-name
  endings, and invented amounts, or sums of them, in the PDF template's fixtures. All 325 git
  objects are reachable.
- The review's nits that the fix round left, fixed here (docs only): docs/SECURITY.md said that
  `form-action 'none'` and `base-uri 'none'` are in every policy (now every provider page's; the
  landing page carries `default-src 'none'` and its style hash) and that the readers and the
  downloads use `connect-src blob: data:` (now: kept from the old pages' policy and not needed);
  docs/ARCHITECTURE.md's CSP paragraph, likewise; docs/ADDING_A_PROVIDER.md said that the dry run
  and the fixtures run on every push (now: CI comes with M13); docs/TESTING.md now describes the
  storage run's `keys` check and `vacuous`; and the blank line before the WP16 heading.
- Left open, for M13 or later: nothing refuses the scaffold's `summary: "TODO"` before a page is
  published (C05b's condition would fit); no unit sample makes the storage run's `keys` check fail
  alone (a value written in another format with the same meaning); and dropping `connect-src blob:
  data:` and `img-src data: blob:` would be an opt-in change, like D10.
- Outside the repository: the first, literal run of the old install command in the WP12 reader
  test let Playwright's installer delete `firefox-1447` from `$HOME/.cache/ms-playwright` (the G11
  entry). No Playwright installation on the machine uses that revision, and the install commands
  now set `PLAYWRIGHT_SKIP_BROWSER_GC=1`.
- With this entry in place: `node test/lint/run.js`, 202 files, exit 0 (the six lints 0 findings
  each); `node build/build.js --check`: `dist/` is current (9 files); `npm run contract`: 10
  providers, 0 problems, C15 23 pins, C17 and C18 on 202 files; `npm run unit`: 512 tests, 512
  pass, 0 fail, 0 skipped.

### WP17 — CI and Pages (2026-10-20)

The files are `.github/workflows/build-check.yml` and `.github/workflows/pages.yml` (decisions
211-213) and the docs that describe them: docs/TESTING.md's CI scope, docs/ARCHITECTURE.md's output
layout and GitHub Pages, docs/ADDING_A_PROVIDER.md's checks, docs/SECURITY.md's new "CI and
deployment" section and README.md's link to the site. This file's header now says which counts an
entry may hold, the earlier entries no longer give the figures computed from the real statements,
and decisions 211-215 are new (decision 214).

- actionlint 1.7.12 on both workflows: 0 findings.
- CI from a clean clone (decision 215): the ten run steps of `build-check.yml`, read from the
  workflow, on a fresh clone with these changes committed in scratch, each under `env -i` in an
  empty home: exit 0 each. Its unit step: 512 tests, 493 pass, 19 skipped, 0 fail; every skipped
  test is one that needs the old repositories.
- The review (security, runtime and docs, read only) found, and this entry fixes: docs/SECURITY.md
  giving G12 as done before it ran; the browser and ffmpeg downloads read as hash-checked
  (Playwright's CDN gives no hash; `test/lib/browser.js` checks Chrome's version instead); a manual
  trigger that could replace a waiting deploy of `main` (removed, decision 213); and wording in the
  docs and the workflows' comments. Accepted: a branch of this repository with an open pull
  request runs CI twice (decision 213). Left to G12 after a check: the `github-pages`
  environment's branch rule, which only exists once Pages is enabled (decision 215).
- This file (decision 214): the figures computed from the real statements were removed in four
  parts, each checked by a second reader; the whole file was then read once more and reviewed
  again before this entry. Verdicts, hashes and dates are unchanged.
- With this entry in place: `node test/lint/run.js`, 204 files, exit 0 (the six lints 0 findings
  each); `node build/build.js --check`: `dist/` is current (9 files); `npm run contract`: 10
  providers, 0 problems; `npm run unit`: 512 tests, 512 pass, 0 fail, 0 skipped.

### G12 — CI and deployment (2026-10-20)

The public repository `ycsin/statement2csv` was created with one commit, `b58aa7ccbde2`, the tree of
the WP17 entry (decision 214); the development history moved to the private repository
`ycsin/statement2csv-history`. Reports are the sha256 prefixes of
`<private-dir>/reports/<run>.json`.

- Actions settings before the first push: only actions GitHub owns may run, each pinned to a full
  commit (`sha_pinning_required`), and the default workflow token can only read.
- CI on GitHub: `build-check.yml` on a branch holding the same commit, while the repository was
  still private (run 39501323868): every step passed. The repository was then made public, the
  Pages source set to "GitHub Actions", and the `github-pages` environment, which Pages had given
  the default branch of that time, set to deploy from `main` only. `pages.yml` on the push of
  `main` (run 39502266176): the check job and the deploy job passed, every step. The branch was
  deleted and `main` made the default.
- What is served: each of the nine pages fetched with `curl` from
  `https://ycsin.github.io/statement2csv/` (redirects followed, no compression asked for): HTTP
  200 and the sha256 of its file in `dist/`, the WP15 entry's nine pages.
- Storage on the deployed site (decision 215): the storage run's checks with the old and the new
  pages on `https://ycsin.github.io`, playwright-core 1.57.0 and Chrome 143.0.7499.4: PASS, 8 of 8
  providers ((a), (b), (c), keys and one origin); the 16 keys on the origin at the end each as its
  owner left it; 32 documents fetched (16 distinct URLs), each with the expected bytes; results
  digest `dc10f6109ba9e88e`, G10's; report `4fe5f1cebb265166`.
- The old repositories: the baseline with live pages before and after that run, and once more
  afterwards (report `aa16cd75a149af55`): 8 old repositories, 4347 manifest entries, 0 problems,
  0 differences. The session check against the start of M13: 4347 entries, digest
  `268d8fea635eb05a`, 0 differences; the user config unchanged.
- Result: G12 passes.
