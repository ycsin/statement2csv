// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface. Changing a value renames users' files or loses their saved settings.
// Written in migration step M0 from the old page at legacyHead (docs/MIGRATION.md).
// Custom app without a configurator: no config key, kinds or id pattern, and no kindModel.
module.exports = {
  storage: { modeKey: "etoro-csv-group", configKey: null },
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ["balance", "month", "day"],
  configKinds: null,
  configIdPattern: null,
  // File names use the parser's account name and the slug only.
  naming: { slug: "etoro" },
  // The old page this provider reproduces, as published.
  legacyRepo: "etoro2csv",
  legacyUrl: "https://ycsin.github.io/etoro2csv/",
  legacyHead: "add9f42ac11f196ecd01061bfd4dac1ab1d3e231",
  legacyIndexSha256: "47f7746b398b0ea502f4b960256b0a6e1d0ea79aa21b248d8dbef63df58f8978",
  legacyDom: null,
};
