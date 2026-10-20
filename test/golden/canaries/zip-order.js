// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// G1b canary "zip-order" (test only; injected as plan piece 12b with build --inject, never in
// dist/). It wraps StatementZip.zip to zip the files in reverse order. Every zip keeps its name,
// size and entry set; only the order, and so the bytes, change. The comparison must report a
// sha256 and an entry-order mismatch on Download all and on every two-file Combined zip, and no
// entry name, size, CRC or hash difference as a set (test/golden/compare.js, checkCanary).
(function () {
  "use strict";
  const Z = self.StatementZip;
  self.StatementZip = Object.assign({}, Z, {
    zip(files) {
      return Z.zip(files.slice().reverse());
    },
  });
})();
