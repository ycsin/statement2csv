// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Compatibility surface (docs/CONTRACT.md, frozen.js). Changing a value renames users' files or
// loses their saved settings. A draft written by tools/new-provider.js with the descriptor's
// resolved values: until the first public release it may change freely (provider.js must still
// resolve to it); after that, every change is a deliberate migration.
module.exports = {
  storage: { modeKey: "maybank-creditcard-csv-mode", configKey: "maybank-creditcard-csv-accounts" },
  // Stored mode values; anything else stored reads as "balance".
  modeValues: ["balance", "tradelog", "holdings"],
  // What the configurator's Type select may write (never "bank").
  configKinds: ["", "investment", "cash"],
  naming: { accountPrefix: "", brand: "Maybank Credit Card", groupNoun: "accounts", slug: "maybank-creditcard" },
  // Every portfolio id must match: the card number, 16 digits.
  configIdPattern: "^\\d{16}$",
  // Which accounts follow the global mode: every non-investment account is forced to Balance only.
  kindModel: "standard",
};
