// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface. Changing a value renames users' files or loses their saved settings.
// Written in migration step M0 from the old page at legacyHead (docs/MIGRATION.md).
module.exports = {
  storage: { modeKey: "maribank-csv-mode", configKey: "maribank-csv-accounts" },
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ["balance", "tradelog", "holdings"],
  // What the configurator's Type select may write (never "bank").
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "MariBank ", brand: "MariBank", groupNoun: "accounts", slug: "maribank" },
  // Every portfolio id must match: savings:<CCY> or fund:<name>.
  configIdPattern: "^(savings:[A-Z]{3}|fund:.+)$",
  // Which accounts follow the global mode: every non-investment account is forced to Balance only.
  kindModel: "standard",
  // The old page this provider reproduces, as published.
  legacyRepo: "maribank2csv",
  legacyUrl: "https://ycsin.github.io/maribank2csv/",
  legacyHead: "bc79c6919cc9420e149b36fec3ad25e4bbafe2b7",
  legacyIndexSha256: "ad8a22d49b33a9cbddb556230313604dfa36eb7cbfdd3e812f0e9c00426fdf35",
  legacyDom: null,
};
