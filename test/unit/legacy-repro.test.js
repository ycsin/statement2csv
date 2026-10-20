// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Gate G2: for every provider whose frozen.js names a legacyRepo, the old inlining algorithm,
// driven by that repository's own build.py marker table (parsed read-only), rebuilds its
// committed index.html byte for byte. Skipped when <old-root>/<legacyRepo> is absent (CI).
//
// Old repositories are only read: plain file reads, and git plumbing through
// test/lib/baseline.js (rev-parse HEAD, cat-file blob). A file manifest taken before and
// after each rebuild proves that nothing was written. No marker table is held here and no
// repository is named: everything comes from frozen.js and build.py.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { readLegacyBuild, inlineLegacy, readText } = require("../../build/legacy-inline.js");
const baseline = require("../lib/baseline.js");
const { frozenProviders } = require("../lib/load-provider.js");

const REPO = path.resolve(__dirname, "..", "..");
const oldRoot = process.env.S2C_OLD_ROOT || os.homedir();
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

const legacy = frozenProviders({ root: REPO }).filter((p) => p.frozen.legacyRepo);

test("there are legacy providers to check", () => {
  assert.ok(legacy.length > 0);
});

for (const { id, frozen } of legacy) {
  const repo = path.join(oldRoot, frozen.legacyRepo);
  const absent = !fs.existsSync(repo);
  test(`G2: ${id} rebuilds its old index.html byte for byte`, { skip: absent ? "old repository not present" : false }, async (t) => {
    const { problems, manifests } = await baseline.before([frozen], { live: false, oldRoot });
    try {
      assert.deepEqual(problems, [], "HEAD and index.html match frozen.js and their blobs");
      const build = readLegacyBuild(fs.readFileSync(path.join(repo, "build.py"), "utf8"));
      assert.equal(build.output, "index.html");
      // everything the algorithm reads equals its blob at legacyHead
      const files = ["build.py", build.template, ...build.parts.map(([, p]) => p)];
      assert.deepEqual(baseline.checkGit(frozen, { oldRoot, files }), [], "build inputs equal their blobs");
      const html = inlineLegacy(readText(path.join(repo, build.template)), build.parts, (p) => readText(path.join(repo, p)));
      const got = Buffer.from(html, "utf8");
      const want = fs.readFileSync(path.join(repo, build.output));
      assert.equal(sha256(got), frozen.legacyIndexSha256);
      assert.ok(got.equals(want), "byte for byte");
      t.diagnostic(`${id}: ${build.parts.length} markers, sha256 ${sha256(got)}`);
    } finally {
      assert.deepEqual(baseline.after(manifests), [], "nothing in the old repository changed");
    }
  });
}

// ---------- the algorithm itself, on synthetic input (always runs) ----------

const BUILD_PY = `# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
"""Assemble index.html."""
from pathlib import Path

HERE = Path(__file__).parent
parts = {
    "/*ONE*/": HERE / "src/one.js",
    "/*TWO*/": HERE / "src/two.js",
}
html = (HERE / "src/page.template.html").read_text()
for marker, path in parts.items():
    code = path.read_text()
    if "</script" in code.lower() or "<!--" in code:
        raise SystemExit(f"{path} contains a sequence that would break inline <script>")
    assert html.count(marker) == 1, marker
    html = html.replace(marker, code)
out = HERE / "index.html"
out.write_text(html)
print(f"wrote {out} ({out.stat().st_size // 1024} KiB)")
`;

test("readLegacyBuild: the template, the ordered parts table and the output", () => {
  assert.deepEqual(readLegacyBuild(BUILD_PY), {
    template: "src/page.template.html",
    parts: [["/*ONE*/", "src/one.js"], ["/*TWO*/", "src/two.js"]],
    output: "index.html",
  });
});

test("readLegacyBuild: refuses variants whose algorithm differs", () => {
  const variants = [
    [BUILD_PY.replace("    assert html.count(marker) == 1, marker\n", ""), /html\\.count/],
    [BUILD_PY.replace('html.replace(marker, code)', 'html.replace(marker, code, 1)'), /html\\.replace/],
    [BUILD_PY.replace('"/*TWO*/": HERE / "src/two.js",', '"/*TWO*/": Path("src/two.js"),'), /no parts/],
    [BUILD_PY.replace('"/*TWO*/": HERE / "src/two.js",', '"/*ONE*/": HERE / "src/two.js",'), /repeated marker/],
    [BUILD_PY.replace('HERE / "src/one.js"', 'HERE / "../one.js"'), /leaves the repository/],
    [BUILD_PY.replace("html = (HERE", "html = (THERE"), /read_text/],
    [BUILD_PY.replace('out = HERE / "index.html"', 'out = Path("index.html")'), /out = HERE/],
  ];
  for (const [src, re] of variants) assert.throws(() => readLegacyBuild(src), re);
});

test("inlineLegacy: sequential, literal, each marker exactly once in the text so far", () => {
  const files = { "a.js": "A($&, $1, $$)", "b.js": "B()" };
  const read = (p) => files[p];
  const tpl = "<script>/*ONE*/</script>\n<script>/*TWO*/</script>\n";
  assert.equal(inlineLegacy(tpl, [["/*ONE*/", "a.js"], ["/*TWO*/", "b.js"]], read), "<script>A($&, $1, $$)</script>\n<script>B()</script>\n");
  assert.throws(() => inlineLegacy("/*ONE*/", [["/*ONE*/", "a.js"], ["/*TWO*/", "b.js"]], read), /\/\*TWO\*\/ occurs 0 times/);
  assert.throws(() => inlineLegacy("/*ONE*//*ONE*/", [["/*ONE*/", "a.js"]], read), /occurs 2 times/);
  // a marker brought in by an earlier part counts, exactly as in build.py
  const sneaky = { "a.js": "/*TWO*/", "b.js": "B()" };
  assert.throws(() => inlineLegacy("/*ONE*/ /*TWO*/", [["/*ONE*/", "a.js"], ["/*TWO*/", "b.js"]], (p) => sneaky[p]), /occurs 2 times/);
  assert.equal(inlineLegacy("/*ONE*/", [["/*ONE*/", "a.js"], ["/*TWO*/", "b.js"]], (p) => sneaky[p]), "B()");
  assert.throws(() => inlineLegacy("/*ONE*/", [["/*ONE*/", "x.js"]], () => "a </SCRIPT> b"), /would break inline <script>/);
  assert.throws(() => inlineLegacy("/*ONE*/", [["/*ONE*/", "x.js"]], () => "a <!-- b"), /would break inline <script>/);
});

test("readText: strict UTF-8, BOM kept, universal newlines", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s2c-g2-"));
  try {
    const f = path.join(dir, "x.txt");
    fs.writeFileSync(f, Buffer.from([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x0a, 0x62, 0x0d, 0x63, 0x0a]));
    assert.equal(readText(f), `${String.fromCharCode(0xfeff)}a\nb\nc\n`);
    fs.writeFileSync(f, Buffer.from([0x61, 0xff]));
    assert.throws(() => readText(f));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
