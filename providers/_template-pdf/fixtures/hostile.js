// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// SYNTHETIC TEST DATA. Hostile statements for the injection smoke (docs/TESTING.md, injection),
// in the fixture spec format: two invented statements in the PDF template's format whose text
// carries markup where the page prints it. The account's name is an element with a handler, so
// its label reaches every render target: the card's title, the configurator's row, the status
// (March opens with a balance, the earliest month) and the diagnostics (April is missing and May
// opens above March's close, a "not covered by statements" row under the account's name). March
// also lists a row without an amount whose description is markup, which the diagnostics list
// among the rows not exported. The page must show all of it as text and run nothing.
const X = { left: 50, text: 130, number: 420, right: 500 };
const NAME = "<b onmouseover=\"window.__pwned=1\">Prize</b> Saver";

const statement = (from, to, opening, rows, closing) => [[
  ["Example Bank", 800, X.left, 16], ["Monthly statement", 785, X.left], ["Statement period", 770, X.left], [`${from} to ${to}`, 770, 160],
  ["Account", 740, X.left], [NAME, 740, X.text], ["10209", 740, X.number], ["SGD", 740, X.right],
  ["Opening balance", 725, X.left], [opening, 725, X.right],
  ["Date", 710, X.left], ["Description", 710, X.text], ["Amount", 710, X.right],
  ...rows.flatMap(([date, text, amount], i) => [[date, 695 - 15 * i, X.left], [text, 695 - 15 * i, X.text], ...(amount === undefined ? [] : [[amount, 695 - 15 * i, X.right]])]),
  ["Closing balance", 680 - 15 * rows.length, X.left], [closing, 680 - 15 * rows.length, X.right],
].map(([text, y, x, size]) => (size ? { x, y, size, text } : { x, y, text }))];

module.exports = {
  marker: "SYNTHETIC TEST DATA",
  files: [
    {
      name: "example-statement-2026-03-hostile.pdf",
      pages: statement("01/03/2026", "31/03/2026", "50.00", [["02/03/2026", "Deposit", "25.00"], ["16/03/2026", "<img src=x onerror=\"window.__pwned=1\">"]], "75.00"),
    },
    {
      name: "example-statement-2026-05-hostile.pdf",
      pages: statement("01/05/2026", "31/05/2026", "80.00", [["04/05/2026", "Deposit", "10.00"]], "90.00"),
    },
  ],
};
