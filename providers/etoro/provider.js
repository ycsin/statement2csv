// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Descriptor of the custom xlsx app (docs/CONTRACT.md, descriptor). Plain data only.
// One workbook, one account, modes that act at parse time and the app's own file set, so the
// provider ships its own app.js (inlined last) and a pure files module (files.js, a helper
// script inlined after the parser). The storage key, mode ids and slug equal frozen.js (C05);
// the configurator key is null because the page has no configurator. The parser's own
// openingBalance shadows the core one when the app composes its namespace (exportOverrides).
// Page copy is in page.html; the synthetic workbook for CI is in fixtures/.
module.exports = {
  contract: 1,
  id: "etoro",
  name: "eToro",
  summary: "eToro account statement .xlsx downloads, as one account that follows total equity",
  app: "custom",
  appScript: "app.js",
  inputs: ["xlsx"],
  multiple: false,
  scripts: ["parser.js", "files.js"],
  parserScript: "parser.js",
  parserGlobal: "EtoroParser",
  exportOverrides: ["openingBalance"],
  storage: { modeKey: "etoro-csv-group", configKey: null },
  modes: [
    { id: "balance", label: "Balance only" },
    { id: "month", label: "By kind, monthly" },
    { id: "day", label: "By kind, daily" },
  ],
  naming: { slug: "etoro" },
  custom: { toolbar: [], config: false },
  testing: { allowWarnings: true, fixtures: "fixtures" },
};
