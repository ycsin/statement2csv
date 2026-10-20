// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Store-only ZIP reader for the test harnesses: the pages' Download-all and Combined zips and
// the synthetic workbooks of mkxlsx.js. Entries come back in central-directory order with
// their DOS time and date, and every CRC-32 is checked. Structural damage throws; a CRC
// mismatch is reported in `crcOk` so a comparison can name the entry.
//
// unzipEntries() is self-contained (it uses nothing outside its own body apart from the
// standard Uint8Array, Uint32Array and TextDecoder), because capture.js inlines its source
// text into the page's init script: the page and Node unpack zips with the same code.
"use strict";

const crypto = require("crypto");

// unzipEntries(bytes) -> [{name, size, crc32, crcOk, dosTime, dosDate, data: Uint8Array}].
function unzipEntries(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const fail = (msg) => {
    throw new Error(`unzip: ${msg}`);
  };
  const u16 = (o) => b[o] | (b[o + 1] << 8);
  const u32 = (o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const crc32 = (d) => {
    let c = 0xffffffff;
    for (let i = 0; i < d.length; i++) c = table[(c ^ d[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const sameBytes = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);

  if (b.length < 22) fail("too short for a zip file");
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (u32(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail("no end of central directory record");
  const count = u16(eocd + 10);
  const cdSize = u32(eocd + 12);
  const cdOffset = u32(eocd + 16);
  if (u16(eocd + 4) !== 0 || u16(eocd + 6) !== 0 || u16(eocd + 8) !== count) fail("multi-disk archives are not supported");
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) fail("ZIP64 is not supported");
  if (eocd + 22 + u16(eocd + 20) !== b.length) fail("bytes after the end of central directory record");
  if (cdOffset + cdSize !== eocd) fail("central directory offset or size is wrong");

  const dec = new TextDecoder("utf-8", { fatal: true });
  const out = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || u32(p) !== 0x02014b50) fail(`entry ${n}: bad central directory header`);
    const flags = u16(p + 8);
    const method = u16(p + 10);
    const time = u16(p + 12);
    const date = u16(p + 14);
    const crc = u32(p + 16);
    const csize = u32(p + 20);
    const usize = u32(p + 24);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    const local = u32(p + 42);
    if (p + 46 + nameLen + extraLen + commentLen > eocd) fail(`entry ${n}: central directory header runs past its end`);
    const nameBytes = b.subarray(p + 46, p + 46 + nameLen);
    let name;
    try {
      name = dec.decode(nameBytes);
    } catch (e) {
      fail(`entry ${n}: name is not UTF-8`);
    }
    if (flags & 0x0001) fail(`entry ${n}: encrypted entries are not supported`);
    if (flags & 0x0008) fail(`entry ${n}: data descriptors are not supported`);
    if (method !== 0) fail(`entry ${n}: compression method ${method} (only stored entries are supported)`);
    if (csize !== usize) fail(`entry ${n}: stored entry with different compressed and uncompressed sizes`);
    if (local + 30 > cdOffset || u32(local) !== 0x04034b50) fail(`entry ${n}: bad local header`);
    const lNameLen = u16(local + 26);
    const lExtraLen = u16(local + 28);
    if (u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 10) !== time || u16(local + 12) !== date
      || u32(local + 14) !== crc || u32(local + 18) !== csize || u32(local + 22) !== usize) {
      fail(`entry ${n}: local header differs from the central directory`);
    }
    if (!sameBytes(b.subarray(local + 30, local + 30 + lNameLen), nameBytes)) fail(`entry ${n}: local name differs from the central directory`);
    const start = local + 30 + lNameLen + lExtraLen;
    if (start + csize > cdOffset) fail(`entry ${n}: data runs into the central directory`);
    const data = b.slice(start, start + csize);
    out.push({ name, size: usize, crc32: crc, crcOk: crc32(data) === crc, dosTime: time, dosDate: date, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (p !== eocd) fail("central directory has bytes after its last entry");
  return out;
}

// unzip(bytes) -> [{name, size, crc32, crcOk, sha256, dosTime, dosDate, data: Buffer}].
function unzip(bytes) {
  return unzipEntries(bytes).map((e) => {
    const data = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    return {
      name: e.name,
      size: e.size,
      crc32: e.crc32,
      crcOk: e.crcOk,
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
      dosTime: e.dosTime,
      dosDate: e.dosDate,
      data,
    };
  });
}

module.exports = unzip;
unzip.unzip = unzip;
unzip.unzipEntries = unzipEntries;
