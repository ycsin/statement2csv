// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// SYNTHETIC TEST DATA. Hostile statements for the injection smoke (docs/TESTING.md, injection),
// in the fixture spec format: two invented credit card statements in the layout parser.js reads
// whose text carries markup where the page prints it. The card's name is an element with a
// handler, so its label reaches every render target: the card's title, the configurator's row,
// the status (December opens with a balance, the earliest month) and the diagnostics (February's
// statement is missing and March's previous balance differs from January's new balance, a "not
// covered by statements" row under the card's name). January also lists a row without an amount
// whose description is markup, which the diagnostics list among the rows not exported. The page
// must show all of it as text and run nothing.
const X = { posted: 42, done: 113, desc: 167, amount: 530 };
const NAME = "<b onmouseover=\"window.__pwned=1\">Prize</b> Card";

const statement = (date, previous, rows, total) => [[
  ["Malayan Banking Berhad (0000-X)", 800, 25], ["Statement Date/", 787, 300], [date, 774, 300], [date.replace(/^06/, "26"), 774, 400],
  [NAME, 748, 25], [":", 748, 440], ["5000 9999 8888 0009", 748, 455],
  ["YOUR PREVIOUS STATEMENT BALANCE", 735, X.desc], [previous, 735, X.amount],
  ...rows.flatMap(([posted, text, amount], i) => [[posted, 722 - 13 * i, X.posted], [posted, 722 - 13 * i, X.done], [text, 722 - 13 * i, X.desc],
    ...(amount === undefined ? [] : [[amount, 722 - 13 * i, X.amount]])]),
  ["SUB TOTAL/JUMLAH", 709 - 13 * rows.length, X.desc], [total, 709 - 13 * rows.length, X.amount],
].map(([text, y, x]) => ({ x, y, text }))];

module.exports = {
  marker: "SYNTHETIC TEST DATA",
  files: [
    {
      name: "9001_20260106.pdf",
      pages: statement("06 JAN 26", "50.00", [["10/12", "SHOP", "25.00"], ["16/12", "<img src=x onerror=\"window.__pwned=1\">"]], "75.00"),
    },
    {
      name: "9003_20260306.pdf",
      pages: statement("06 MAR 26", "80.00", [["04/03", "SHOP", "10.00"]], "90.00"),
    },
  ],
};
