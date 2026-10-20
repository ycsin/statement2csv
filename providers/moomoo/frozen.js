// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface. Changing a value renames users' files or loses their saved settings.
// Written in migration step M0 from the old page at legacyHead (docs/MIGRATION.md).
module.exports = {
  storage: { modeKey: "moomoo-csv-mode", configKey: "moomoo-csv-accounts" },
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ["balance", "tradelog", "holdings"],
  // What the configurator's Type select may write (never "bank").
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "moomoo ", brand: "moomoo", groupNoun: "accounts", slug: "moomoo" },
  // Every portfolio id must match: cash:<CCY> or fund:<ISIN>.
  configIdPattern: "^(cash:[A-Z]{3}|fund:.+)$",
  // Which accounts follow the global mode: every non-investment account is forced to Balance only.
  kindModel: "standard",
  // The old page this provider reproduces, as published.
  legacyRepo: "moomoo2csv",
  legacyUrl: "https://ycsin.github.io/moomoo2csv/",
  legacyHead: "7bd9b9d794643dbfbd9e84bf26a32b71ca5661ef",
  legacyIndexSha256: "eee74a3a012f4cdb86920482753e1421276e17542a086fa38f6de18eee19ea40",
  legacyDom: null,
};
