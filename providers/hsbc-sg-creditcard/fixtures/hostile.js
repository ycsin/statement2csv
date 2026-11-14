// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// SYNTHETIC TEST DATA. Hostile statements for the injection smoke (docs/TESTING.md, injection),
// in the fixture spec format: two invented credit card statements in the layout parser.js reads
// whose text carries markup where the page prints it. The card product's name is an element
// with a handler, so its label reaches every render target: the card's title, the
// configurator's row, the status and the diagnostics. A row without an amount (listed among the
// rows not exported, with its description) and a merchant's name (exported in the files) carry
// markup too. The first statement
// opens with a balance (the status lists it) and the second one's previous balance differs from
// the first one's Total Due with a period missing between them (a "not covered by statements"
// row in the diagnostics). The page must show all of it as text and run nothing.
const X = { posted: 60, made: 101, desc: 140, amount: 330 };
const NAME = "HSBC <b onmouseover=\"window.__pwned=1\">Prize</b> Card";

const statement = (from, to, previous, rows, total) => [[
  [NAME, 800, 55], ["HSBC Bank (Singapore) Limited", 787, 55], [`Statement From ${from} to ${to}`, 774, 55],
  ["DATE", 748, 57], ["DATE", 748, 102], ["DESCRIPTION", 748, X.desc], ["AMOUNT(SGD)", 748, 280],
  ["Previous Statement Balance", 735, X.desc], [previous, 735, X.amount],
  ...rows.flatMap(([posted, text, amount], i) => [[posted, 722 - 13 * i, X.posted], [posted, 722 - 13 * i, X.made], [text, 722 - 13 * i, X.desc],
    ...(amount === undefined ? [] : [[amount, 722 - 13 * i, X.amount]])]),
  ["Total Due", 709 - 13 * rows.length, X.desc], [total, 709 - 13 * rows.length, X.amount],
].map(([text, y, x]) => ({ x, y, text }))];

module.exports = {
  marker: "SYNTHETIC TEST DATA",
  files: [
    {
      name: "prize-20260301.pdf",
      pages: statement("02 FEB 2026", "01 MAR 2026", "50.00", [["10 Feb", "<b onmouseover=\"window.__pwned=1\">x</b>", "25.00"], ["16 Feb", "<img src=x onerror=\"window.__pwned=1\">"]], "75.00"),
    },
    {
      name: "prize-20260501.pdf",
      pages: statement("02 APR 2026", "01 MAY 2026", "80.00", [["04 Apr", "SHOP", "10.00"]], "90.00"),
    },
  ],
};
