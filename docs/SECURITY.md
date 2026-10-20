<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com> -->

# Security

The pages read bank and broker statements, so they are built to keep them in the browser and
to treat everything they read as untrusted: the files, and the settings in localStorage, which
every page on the same origin can write. This document lists the rules that do that and the
checks that enforce them. The code is described in `docs/ARCHITECTURE.md`, the checks in
`docs/TESTING.md`.

## No network, nothing uploaded

- Each page is one self-contained file: scripts, the stylesheet and, for PDF inputs, pdf.js and
  its worker are inlined. It loads nothing and sends nothing: the policy below has
  `default-src 'none'` and allows `connect-src` only for `blob:` and `data:` URLs. That
  `connect-src`, and `img-src data: blob:`, are kept from the old pages' policy; the pages do not
  need them (the readers use `File.text()` and `File.arrayBuffer()`, and a download is a link to
  a Blob URL, which `connect-src` does not govern). Dropping them is left for a later change.
- `<meta name="referrer" content="no-referrer">` is on every page, and `form-action 'none'` and
  `base-uri 'none'` are in every provider page's policy (the landing page, which has no script
  and no form, carries only `default-src 'none'` and its style hash).
- The sinks lint (below) bans the network APIs in `core/` and `providers/`: `fetch`,
  `XMLHttpRequest`, `WebSocket`, `sendBeacon` and `importScripts`, in every form the code can
  write a name.
- A file is read with the browser's `File` API (`text()`, `arrayBuffer()`); the downloads are
  Blobs made in the page.

## Content Security Policy

`build/csp.js` writes one `<meta http-equiv="Content-Security-Policy">` into the `<head>` of
every page, before the `<style>` and every script (a meta policy governs only what follows it).
`DEFAULT_CSP_MODE` is `"hash"`:

| Page | Policy (hash mode) |
|---|---|
| PDF inputs | `default-src 'none'; script-src 'sha256-…' … blob:; worker-src blob:; style-src 'sha256-S'; img-src data: blob:; connect-src blob: data:; form-action 'none'; base-uri 'none'` |
| CSV and XLSX inputs only | the same without `blob:` in `script-src` and without `worker-src` |
| landing page | `default-src 'none'; style-src 'sha256-S'` |

- **Script hashes.** `'sha256-' + base64(sha256(utf8(text)))` over the exact text of every
  executable piece of the script plan, in plan order, duplicates removed. There is no
  `'unsafe-inline'` for scripts, so an inline handler cannot run even if an escape is missed: the
  browser blocks it and reports a `script-src-attr` violation, which every smoke and the golden
  harness count as a failure.
- **Style hash.** `'sha256-S'` is the hash of the one `<style>`'s text. No page writes a style
  attribute. `STYLE_POLICY` in `build/csp.js` is `"hash"`; `"unsafe-inline"` is the documented
  fallback should a style violation ever appear (it has not).
- **`blob:`** stays in `script-src` of PDF pages for pdf.js's fake-worker fallback, which it takes
  when a page is opened from `file://`; `worker-src blob:` lets it start its real worker
  otherwise. pdf.js text extraction needs no `'unsafe-eval'`.
- **`--csp legacy`** builds the policies of the old pages (with `'unsafe-inline'`); only the tests
  use it, to show that a payload which became markup would run under it.

**Verification.** The build re-parses every page before it writes it (`verify` and
`verifyLanding` in `build/csp.js`), and contract check C14 does it again in CI:
- the `<script>` elements, in document order, are exactly the plan's pieces, each byte for byte
  its source (the file on disk, the runtime JSON, the worker text);
- the policy equals the one recomputed from the page itself: every executable script and the
  style listed, nothing else, no repeated or extra directive or source;
- in hash mode, read from the page alone, so that a fault in the policy code itself cannot pass:
  the `script-src` in force (the first) lists the hash of every script the page runs and nothing
  else but `blob:` on PDF pages, and under the hash style policy the `style-src` in force lists
  the style's hash and nothing else;
- no `on…` attribute outside scripts and, in hash mode, no `style` attribute, with every tag read
  as the browser's HTML tokenizer reads it: an attribute after a `/` or right after a quoted value,
  a quoted value that holds `>`, comments that `--!>` ends, and the text of raw-text elements such
  as `<textarea>` passed over to their end tag. `<svg>` and `<math>` are refused, since the browser
  reads their foreign content otherwise;
- exactly one CSP meta, inside `<head>`, before the style and every script; exactly one
  `<style>`; `<meta charset="utf-8">` within the first 1024 bytes; no carriage return and no NUL
  anywhere in the page (the browser would hash other text);
- `isEvalSupported: false` present when PDF is an input;
- no `http:` or `https:` source in the policy.

## Rendering: one sink, escaped by construction

- Every render in `core/app/statement-app.js` and in a custom app builds its markup with the
  `StatementEscape.html` tagged template, which escapes every interpolated value, and assigns it
  with `StatementEscape.setHtml`, **the only `innerHTML` assignment** in `core/` and
  `providers/`. `setHtml` refuses anything but an `html` value, and an `html` value is recognised
  by identity, so a stored object that merely looks like one is escaped.
- A value interpolated into a class attribute (the account kind's tag) goes through
  `cssToken`, which passes `[a-z0-9-]` tokens and writes anything else as `other`.
- Page copy (`page.html`) is checked by contract check C16: no `<script`, `<style`, `on…=`,
  `href`, `src` or `style=`, a short tag list, and `class="muted"` on `span` as the only
  attribute (docs/CONTRACT.md, page.html).

**The sinks lint** (`test/lint/sinks.js`, scope `core/**` and `providers/**`) holds the rule:
- `innerHTML` may appear only inside `setHtml`, as any identifier, key or binding, read or
  written; `outerHTML` nowhere;
- banned in every form the code can write a name (an identifier, a computed key, a constant
  string, escapes decoded, concatenations folded): `eval`, the network APIs above,
  `insertAdjacentHTML`, `setHTML`, `setHTMLUnsafe`, `parseHTMLUnsafe`,
  `createContextualFragment`, `parseFromString`, `srcdoc`, `execCommand`, `write`, `writeln`,
  `setAttributeNode(NS)`, `createAttribute(NS)`, `getRandomValues` and `randomUUID`;
- the global `Function`, `setTimeout` or `setInterval` with a string, and `setAttribute` or
  `setAttributeNS` with a name that starts with "on" or is not a constant string;
- an escaped identifier (a backslash outside literals and comments);
- the clock and randomness: `Date.now(`, `Math.random(`, and `new Date()` without arguments
  outside the zip writer;
- `localeCompare(` with one argument in new providers and `core/assemble.js`;
- `Object.assign({}, self.StatementExport` outside the apps.

What a lint cannot see (a name put together at run time) the injection smoke checks by effect:
markup in a stored setting and in a provider's `fixtures/hostile.js` must render as text in every
render target, with no element or handler added and no violation (docs/TESTING.md, injection).

## pdf.js

- pdf.js 3.11.174, pinned by sha256 in `test/contract/provenance.js` (`vendor/pdf.min.js` and
  `vendor/pdf.worker.min.js`, byte copies; NOTICE names it).
- `getDocument({data, isEvalSupported: false})`: pdf.js never evaluates code from a font
  (CVE-2024-4367); the build refuses a PDF page without the option.
- The worker source is embedded as a `text/plain` script (never executed or hashed) and started
  from a Blob URL, so the page works from `file://` with no external worker file.
- Each document is destroyed after its pages are read.

## Storage keys and stored values

- **The keys are frozen.** A provider's mode key and config key are recorded in its `frozen.js`
  and checked against the descriptor (C05); no two providers share a key or a zip slug (C04). The
  new pages share one origin with the old converters' pages, so these keys are what lets settings
  carry over; changing one after release loses users' settings.
- **What is written.** The app writes the mode key at start-up with the value it loaded (or a
  clicked mode's id), and the configurator writes only `name`, `kind` (`investment` or `cash`),
  `mergeInto` and `exclude: true`, under the config key. No other key is ever written. Writes are
  whole-object, and the last writer wins, as with two old tabs.
- **What is read is untrusted.** `loadMode` accepts only the provider's mode ids; `loadConfig`
  returns `{}` for anything that does not parse. Parsers tolerate unknown ids, cycles, wrong
  types and junk (docs/CONTRACT.md, config object), and the renders escape every stored value.
- The storage-compatibility run (`test/storage-compat/run.js`, docs/TESTING.md) checks, with the
  old and the new pages on one origin, that each reads what the other wrote, and that a new page
  makes storage calls on its own frozen keys only, with allowed values only.

## CI and deployment

- **Permissions.** `.github/workflows/build-check.yml` runs with `contents: read` only, no
  secrets and synthetic data only. `.github/workflows/pages.yml` gives `pages: write` and
  `id-token: write` to its deploy job alone, which runs only on `main` and only after
  `build-check.yml` has passed on the same commit. No step puts event data (a title, a branch
  name, a commit message) into a shell command, and checkout keeps no credentials
  (`persist-credentials: false`).
- **Pinned actions.** Only GitHub's own actions are used (checkout, setup-node, configure-pages,
  upload-pages-artifact, deploy-pages), and every action's `uses:` names the full commit of a
  release, with the release's tag in a comment: a tag can be moved to other code, a commit cannot
  (`pages.yml` calls `build-check.yml` by its path, which runs from the caller's own commit). To
  update one, take the commit of a release at least two weeks old and change the commit and the
  comment together.
- **What is served is what is committed.** `.gitattributes` keeps `dist/` out of line-ending
  conversion, the deploy checks again that `dist/` is current and uploads it as it is, and the
  Pages source "GitHub Actions" means no Jekyll processing. After the first deployment,
  migration gate G12 checks that every served page equals its file in `dist/` by sha256
  (docs/MIGRATION.md, gate log).
- **The test package and the browser.** `npm ci --ignore-scripts` installs
  `test/package-lock.json` (integrity hashes checked, no install scripts run). Playwright's
  installer then fetches headless-shell revision 1200 (the one playwright-core 1.57.0 pins) and
  ffmpeg revision 1011 over HTTPS from Playwright's CDN, and checks neither against a hash, so
  their bytes are trusted to the CDN. They run only in the check job, whose token can only read
  the repository, and `test/lib/browser.js` refuses a Chrome that does not report 143.0.7499.4;
  the deploy job never installs them.

## Reviewed exceptions

- **Markup-breaking stored values on the old pages (SX1).** A hand-edited `kind` containing `"`,
  or a currency containing `<`, could restructure an old page's card markup and so change what
  its Download all (which scans the rendered cards) contains. The new pages render such values
  as text, and their Download all equals the data-built `allFiles()`; the golden harness's
  S-break scenarios assert that this is the only difference from the old pages.
- **Names an attribute cannot carry.** The card buttons carry the account name in
  `data-account`, which the HTML parser reads back with CR turned into LF and NUL into U+FFFD.
  An account name or portfolio id holding either character cannot be downloaded from its card
  or included in Download all, as on the old pages; the configurator cannot write one. It is
  scheduled with the switch of Download all to `allFiles()` (docs/MIGRATION.md, decision 176).
- **A parse that throws** keeps the previous result and shows `Could not read these statements:
  <message>` (docs/ARCHITECTURE.md, error conventions); the message is escaped like every value.

## Private data during development

- Statements are read by path from folders outside the repository and never copied into it;
  everything derived from them (extraction caches, goldens, reports, dumps) goes to
  `<private-dir>`, created with mode 0700, and the test library refuses outputs in this
  repository, an old repository, the statements folders and any path the untracked user config
  refuses (docs/TESTING.md, private data rules).
- `.gitignore` excludes every statement-like file type; contract check C18 fails on a tracked
  `.pdf`, `.csv`, `.xlsx`, `.xls`, `.qif`, `.zip`, `.png`, `.jpg` or a `.json` other than the
  package files, and on a fixtures file without the marker `SYNTHETIC TEST DATA`; the privacy lint
  fails on home-directory paths, e-mail addresses, numbers in account-number formats and any entry
  of the untracked personal denylist.
- Console output of the harnesses holds ids, counts and hashes only.
