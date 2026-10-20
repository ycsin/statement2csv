// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Frozen copy of the old pages' ZIP writer as a module: versa2csv src/app.js:391-418 at its
// legacyHead (the same lines in all eight old apps). It is the oracle core/zip.js is compared
// with in test/unit/differential.test.js, and is never inlined into a page. The old lines are
// verbatim apart from one edit, on two lines: `now` is a parameter instead of the current time,
// so a test can fix it. Pinned and re-derived from git (test/contract/provenance.js).
"use strict";

module.exports = (function () {
  // Minimal store-only ZIP writer.
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files, now) {
    const enc = new TextEncoder();
    const chunks = [], central = [];
    let offset = 0;
    // now: the caller's Date (the page used the current time here)
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const put = (view, fields) => fields.forEach(([o, v, s]) => (s === 4 ? view.setUint32(o, v, true) : view.setUint16(o, v, true)));
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.text), crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      put(local, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, dosTime, 2], [12, dosDate, 2], [14, crc, 4],
        [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]);
      const cen = new DataView(new ArrayBuffer(46));
      put(cen, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, dosTime, 2], [14, dosDate, 2], [16, crc, 4],
        [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]);
      chunks.push(local, name, data);
      central.push(cen, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, c) => s + c.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    put(end, [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, size, 4], [16, offset, 4], [20, 0, 2]]);
    return new Blob([...chunks, ...central, end], { type: "application/zip" });
  }
  return { CRC, crc32, zip };
})();
