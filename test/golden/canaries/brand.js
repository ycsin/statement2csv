// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// G1b canary "brand" (test only; injected as plan piece 12b with build --inject, never in
// dist/). It appends a space to the runtime object's brand before the app reads it, so the
// Accounts and Combined file names change and with them the Download-all entry names and bytes,
// while every card file stays the same. The comparison against the quick goldens must report
// exactly that (test/golden/compare.js, checkCanary).
(function () {
  "use strict";
  self.StatementProvider.naming.brand += " ";
})();
