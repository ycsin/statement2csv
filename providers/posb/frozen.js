// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface. Changing a value renames users' files or loses their saved settings.
// Written in migration step M0 from the old page at legacyHead (docs/MIGRATION.md).
module.exports = {
  storage: { modeKey: "posb-csv-mode", configKey: "posb-csv-accounts" },
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ["balance", "tradelog", "holdings"],
  // What the configurator's Type select may write (never "bank").
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "", brand: "POSB", groupNoun: "accounts", slug: "posb" },
  // Every portfolio id must match: <account no>:<CCY>.
  configIdPattern: "^[0-9-]+:.+$",
  // Which accounts follow the global mode: every non-investment account is forced to Balance only.
  kindModel: "standard",
  // The old page this provider reproduces, as published.
  legacyRepo: "posb2csv",
  legacyUrl: "https://ycsin.github.io/posb2csv/",
  legacyHead: "93c1778d6ec29d436d426889e4f5a430c53bb05f",
  legacyIndexSha256: "e2d008cc51c310ac62e85bb1445bd2d0c625c6d2675db13bd629691c0317a9e1",
  legacyDom: null,
};
