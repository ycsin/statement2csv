// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Storage-compatibility mutant "rename-config-key" (test only; injected as plan piece 12b with
// build --inject, never in dist/; test/storage-compat/run.js --self-test). It renames the
// runtime object's config key before the app reads it, so the new page keeps its configurator
// settings where the old page never looks. The run must fail with exactly the problems MUTANTS
// lists for it in run.js.
(function () {
  "use strict";
  const storage = self.StatementProvider.storage;
  if (storage.configKey !== null && storage.configKey !== undefined) storage.configKey += "-renamed";
})();
