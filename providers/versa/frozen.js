// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface. Changing a value renames users' files or loses their saved settings.
// Written in migration step M0 from the old page at legacyHead (docs/MIGRATION.md).
module.exports = {
  storage: { modeKey: "aham-csv-mode", configKey: "aham-csv-accounts" },
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ["balance", "tradelog", "holdings"],
  // What the configurator's Type select may write (never "bank").
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "", brand: "AHAM", groupNoun: "accounts", slug: "aham" },
  // Every portfolio id must match: <account no>:<CCY>.
  configIdPattern: "^[^:]+:[A-Z]{3}$",
  // Which accounts follow the global mode: every non-investment account is forced to Balance only.
  kindModel: "standard",
  // The old page this provider reproduces, as published.
  legacyRepo: "versa2csv",
  legacyUrl: "https://ycsin.github.io/versa2csv/",
  legacyHead: "75d4f12196e13bab22112ec18d050e7e38903e11",
  legacyIndexSha256: "d649263fffede5d3e527b4a80838349fe009a1daee9655dc5c395f193bb6432a",
  legacyDom: null,
};
