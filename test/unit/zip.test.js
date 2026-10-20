// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// core/zip.js (docs/ARCHITECTURE.md): the CRC-32 check value, a fixed-time zip pinned by sha256,
// and the zips read back by the independent reader test/lib/unzip.js. The DOS time and date come
// from the local getters of `now`, so a fixed instant gives the same bytes in Node as in the page
// under the same time zone (the golden environments' zones and frozen clock are used below).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const path = require("path");
const zlib = require("zlib");
const unzip = require("../lib/unzip.js");
const { ENVS, FIXED_TIME } = require("../lib/browser.js");
const { mulberry32 } = require("../lib/prng.js");

const Z = require(path.join(__dirname, "..", "..", "core", "zip.js"));
const old = require(path.join(__dirname, "..", "..", "test", "legacy", "zip-old.js"));

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const bytesOf = async (parts) => Buffer.from(await new Blob(parts).arrayBuffer());
const dosTime = (h, m, s) => (h << 11) | (m << 5) | (s >> 1);
const dosDate = (y, mo, d) => ((y - 1980) << 9) | (mo << 5) | d;

const FILES = [
  { name: "Example accounts - 2026-01_to_2026-03.csv", text: "Account type,Name,Balance,Currency,Balance Date\nSavings,Example Saver,1234.50,SGD,2025-12-31\n" },
  { name: "Example Saver - transactions - 2026-01_to_2026-03.csv", text: "date,amount,currency,name,notes\n2026-01-05,\"1,000.00\",SGD,\"Deposit \"\"A\"\"\",\n" },
  { name: "é – 日本 💰.qif", text: "!Type:Bank\nD2025-12-31\nT0.00\nPOpening Balance\nL[é – 日本 💰]\n^\n" },
  { name: "empty.csv", text: "" },
];
// sha256 of zipParts(FILES, new Date(2026, 0, 2, 3, 4, 6)): a local time, so the same in every zone.
const PINNED = "272d356ece334914ec66ede4d76e6a0733e199ef2d6443d6df18ba0fbd235ab5";

function withTz(tz, fn) {
  const saved = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
}

test("exports exactly crc32, zipParts and zip", () => {
  assert.deepEqual(Object.keys(Z), ["crc32", "zipParts", "zip"]);
});

test("crc32: the CRC-32 check value and zlib's CRC-32 on random bytes", () => {
  assert.equal(Z.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(Z.crc32(new Uint8Array(0)), 0);
  const next = mulberry32(42);
  for (let i = 0; i < 200; i++) {
    const data = Uint8Array.from({ length: Math.floor(next() * 3000) }, () => Math.floor(next() * 256));
    assert.equal(Z.crc32(data), zlib.crc32(data));
  }
});

test("zipParts at a fixed local time gives the pinned bytes, equal to the old writer's", async () => {
  const now = new Date(2026, 0, 2, 3, 4, 6);
  const bytes = await bytesOf(Z.zipParts(FILES, now));
  assert.equal(sha256(bytes), PINNED);
  assert.ok(bytes.equals(Buffer.from(await old.zip(FILES, now).arrayBuffer())));
  // Fields other than name and text are ignored.
  const extra = FILES.map((f) => ({ ...f, kind: "transactions", label: "Transactions CSV", count: 3, type: "text/csv" }));
  assert.equal(sha256(await bytesOf(Z.zipParts(extra, now))), PINNED);
});

test("the zip reads back: names, contents, CRCs, DOS time and date, stored entries with the UTF-8 flag", async () => {
  const bytes = await bytesOf(Z.zipParts(FILES, new Date(2026, 0, 2, 3, 4, 7)));
  const entries = unzip(bytes);
  assert.deepEqual(entries.map((e) => e.name), FILES.map((f) => f.name));
  entries.forEach((e, i) => {
    const data = Buffer.from(FILES[i].text, "utf8");
    assert.ok(e.data.equals(data), e.name);
    assert.equal(e.size, data.length);
    assert.equal(e.crc32, zlib.crc32(data));
    assert.equal(e.crcOk, true);
    assert.equal(e.dosTime, dosTime(3, 4, 7)); // 2-second resolution: 7 s is stored as 6
    assert.equal(e.dosDate, dosDate(2026, 1, 2));
  });
  // Header fields the reader does not report: version 20, flag 0x0800 (UTF-8 names), method 0.
  let p = 0;
  for (const f of FILES) {
    const name = Buffer.from(f.name, "utf8");
    assert.equal(bytes.readUInt32LE(p), 0x04034b50);
    assert.deepEqual([bytes.readUInt16LE(p + 4), bytes.readUInt16LE(p + 6), bytes.readUInt16LE(p + 8)], [20, 0x0800, 0]);
    p += 30 + name.length + Buffer.byteLength(f.text, "utf8");
  }
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.deepEqual([bytes.readUInt16LE(end + 8), bytes.readUInt16LE(end + 10), bytes.readUInt32LE(end + 16)], [FILES.length, FILES.length, p]);
  for (let c = p; c < end;) {
    assert.equal(bytes.readUInt32LE(c), 0x02014b50);
    assert.deepEqual([bytes.readUInt16LE(c + 4), bytes.readUInt16LE(c + 6), bytes.readUInt16LE(c + 8), bytes.readUInt16LE(c + 10)], [20, 20, 0x0800, 0]);
    c += 46 + bytes.readUInt16LE(c + 28);
  }
});

test("an empty file list is the 22-byte end record alone", async () => {
  const bytes = await bytesOf(Z.zipParts([], new Date(2026, 0, 2)));
  assert.equal(bytes.length, 22);
  assert.equal(bytes.readUInt32LE(0), 0x06054b50);
  assert.deepEqual(unzip(bytes), []);
});

test("the golden environments: the frozen clock gives each zone's local DOS time and date", async () => {
  // FIXED_TIME is 2026-01-02T03:04:06Z: 03:04:06 in UTC, 11:04:06 in Singapore, and
  // 19:04:06 on 2026-01-01 in Los Angeles.
  const wall = { UTC: [2026, 1, 2, 3, 4, 6], "Asia/Singapore": [2026, 1, 2, 11, 4, 6], "America/Los_Angeles": [2026, 1, 1, 19, 4, 6] };
  for (const env of Object.values(ENVS)) {
    const [y, mo, d, h, mi, s] = wall[env.timezoneId];
    const parts = withTz(env.timezoneId, () => Z.zipParts(FILES, new Date(FIXED_TIME)));
    const bytes = await bytesOf(parts);
    for (const e of unzip(bytes)) assert.deepEqual([e.dosTime, e.dosDate], [dosTime(h, mi, s), dosDate(y, mo, d)], env.id);
    // The same bytes as the same wall time built from local components in any zone.
    assert.ok(bytes.equals(await bytesOf(Z.zipParts(FILES, new Date(y, mo - 1, d, h, mi, s)))), env.id);
  }
});

test("zip(files) is the parts at the current time, as a zip Blob", async () => {
  for (let attempt = 0; ; attempt++) {
    const t0 = new Date();
    const blob = Z.zip(FILES);
    const t1 = new Date();
    const tick = (t) => [t.getFullYear(), t.getMonth(), t.getDate(), t.getHours(), t.getMinutes(), t.getSeconds() >> 1].join();
    if (tick(t0) !== tick(t1)) {
      assert.ok(attempt < 5, "the clock kept crossing a 2-second boundary");
      continue;
    }
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, "application/zip");
    const bytes = Buffer.from(await blob.arrayBuffer());
    assert.ok(bytes.equals(await bytesOf(Z.zipParts(FILES, t0))));
    assert.ok(bytes.equals(Buffer.from(await old.zip(FILES, t0).arrayBuffer())));
    return;
  }
});
