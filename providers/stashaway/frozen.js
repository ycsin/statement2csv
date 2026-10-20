// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface. Changing a value renames users' files or loses their saved settings.
// Written in migration step M0 from the old page at legacyHead (docs/MIGRATION.md).
module.exports = {
  storage: { modeKey: "stashaway-csv-mode", configKey: "stashaway-csv-portfolios" },
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ["balance", "tradelog", "holdings"],
  // What the configurator's Type select may write (never "bank").
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "StashAway ", brand: "StashAway", groupNoun: "portfolios", slug: "stashaway" },
  // Every portfolio id must match: YYYY-MM:<normName>[:CCY][#n], or fixed-term.
  configIdPattern: "^(\\d{4}-\\d{2}:.+|fixed-term)$",
  // Which accounts follow the global mode: only kind "cash" is forced to Balance only.
  kindModel: "investment-cash",
  // The old page this provider reproduces, as published.
  legacyRepo: "stashaway2csv",
  legacyUrl: "https://ycsin.github.io/stashaway2csv/",
  legacyHead: "ed1879d267bdcd53cba5432b00b7d76ed6b1b76d",
  legacyIndexSha256: "887b1108c1a81709ea8e98bb58b7501d7bb1640ab6657d1d81ccba2b60901003",
  legacyDom: { list: "#portfolios", row: ".portfolio", count: "#portfolios-count", reset: "#portfolios-reset" },
};
