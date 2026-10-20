// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// G1b canary "zip-time" (test only; injected as plan piece 12b with build --inject, never in
// dist/). It wraps StatementZip.zip to write every entry with a time two seconds after the
// page's (frozen) clock. Names, sizes, order and contents stay the same; the comparison must
// report a sha256 mismatch on every zip and a DOS time mismatch on every entry, and nothing else
// (test/golden/compare.js, checkCanary).
(function () {
  "use strict";
  const Z = self.StatementZip;
  self.StatementZip = Object.assign({}, Z, {
    zip(files) {
      return new Blob(Z.zipParts(files, new Date(Date.now() + 2000)), { type: "application/zip" });
    },
  });
})();
