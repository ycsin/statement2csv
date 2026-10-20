// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface. Changing a value renames users' files or loses their saved settings.
// Written in migration step M0 from the old page at legacyHead (docs/MIGRATION.md).
module.exports = {
  storage: { modeKey: "chocolate-csv-mode", configKey: "chocolate-csv-accounts" },
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ["balance", "tradelog", "holdings"],
  // What the configurator's Type select may write (never "bank").
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "Chocolate ", brand: "Chocolate", groupNoun: "accounts", slug: "chocolate" },
  // Every portfolio id must match: account:<CCY>.
  configIdPattern: "^account:[A-Z]{3}$",
  // Which accounts follow the global mode: every non-investment account is forced to Balance only.
  kindModel: "standard",
  // The old page this provider reproduces, as published.
  legacyRepo: "chocolate2csv",
  legacyUrl: "https://ycsin.github.io/chocolate2csv/",
  legacyHead: "eff3c0d7c60aa8410a5216ddd6bdc6c3846b6241",
  legacyIndexSha256: "5b79b2d531ae67605d8d94e0cfcb8cc34689165caea2ca49e7a54f9c493b8edd",
  legacyDom: null,
};
