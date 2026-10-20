// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Storage-compatibility mutant "clear-storage" (test only; injected as plan piece 12b with
// build --inject, never in dist/; test/storage-compat/run.js --self-test). It clears the whole
// localStorage as the page starts, before the app reads its settings: every other page's
// settings on the origin go with it. The run must fail with exactly the problems MUTANTS lists
// for it in run.js.
(function () {
  "use strict";
  try {
    localStorage.clear();
  } catch (e) {
    // no storage
  }
})();
