// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface (docs/CONTRACT.md, frozen.js). Changing a value renames users' files or
// loses their saved settings. A draft written by tools/new-provider.js with the descriptor's
// resolved values: until the first public release it may change freely (provider.js must still
// resolve to it); after that, every change is a deliberate migration.
module.exports = {
  storage: { modeKey: "hsbc-sg-creditcard-csv-mode", configKey: "hsbc-sg-creditcard-csv-accounts" },
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ["balance", "tradelog", "holdings"],
  // What the configurator's Type select may write (never "bank").
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "", brand: "HSBC SG Credit Card", groupNoun: "accounts", slug: "hsbc-sg-creditcard" },
  // Every portfolio id must match: the card product's name, lowercase words joined by "-".
  configIdPattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
  // Which accounts follow the global mode: every non-investment account is forced to Balance only.
  kindModel: "standard",
};
