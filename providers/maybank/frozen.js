// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface. Changing a value renames users' files or loses their saved settings.
// Written in migration step M0 from the old page at legacyHead (docs/MIGRATION.md).
module.exports = {
  storage: { modeKey: "maybank-csv-mode", configKey: "maybank-csv-accounts" },
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ["balance", "tradelog", "holdings"],
  // What the configurator's Type select may write (never "bank").
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "", brand: "Maybank", groupNoun: "accounts", slug: "maybank" },
  // Every portfolio id must match: <account no>, six digits, a dash, six digits.
  configIdPattern: "^\\d{6}-\\d{6}$",
  // Which accounts follow the global mode: every non-investment account is forced to Balance only.
  kindModel: "standard",
  // The old page this provider reproduces, as published.
  legacyRepo: "maybank2csv",
  legacyUrl: "https://ycsin.github.io/maybank2csv/",
  legacyHead: "27f42f7bcfef9cf4f8823458c73902d4d4831de7",
  legacyIndexSha256: "4038854aeaa5c60bf9e561cba41c598df9bdfa6b04ab099bdebc1247b60151c2",
  legacyDom: null,
};
