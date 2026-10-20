// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Descriptor of the PDF template (docs/CONTRACT.md, descriptor): plain data only. This folder is
// a skeleton (its name starts with "_"): the contract checks, the harness and the smokes test it
// like any provider, and it is never published. node tools/new-provider.js copies it to a new
// provider and rewrites this header, the id, the name, the summary and the parser global; the
// storage keys (<id>-csv-mode, <id>-csv-accounts), the zip slug (<id>) and the brand (the name)
// follow from them as defaults.
module.exports = {
  contract: 1,
  id: "template-pdf",
  name: "Example Bank",
  summary: "Example Bank monthly statement PDFs, several accounts each (synthetic template)",
  inputs: ["pdf"],
  uses: ["layout", "assemble"],
  parserGlobal: "ExampleBankParser",
  testing: { fixtures: "fixtures" },
};
