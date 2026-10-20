// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Descriptor of the CSV template (docs/CONTRACT.md, descriptor): plain data only. This folder is
// a skeleton (its name starts with "_"): the contract checks, the harness and the smokes test it
// like any provider, and it is never published. node tools/new-provider.js copies it to a new
// provider and rewrites this header, the id, the name, the summary and the parser global; the
// storage keys (<id>-csv-mode, <id>-csv-accounts), the zip slug (<id>) and the brand (the name)
// follow from them as defaults.
module.exports = {
  contract: 1,
  id: "template-csv",
  name: "Example Bank",
  summary: "Example Bank transaction history CSV (synthetic template)",
  inputs: ["csv"],
  uses: ["assemble"],
  parserGlobal: "ExampleCsvParser",
  // The default gap warning asks for "the missing PDF"; these files are exports.
  ui: { text: { gapWarning: "Each account bridges the gap with one “not covered by statements” entry, so later balances stay right, but that month’s individual transactions are missing. Add an export that covers it to fix this." } },
  testing: { fixtures: "fixtures" },
};
