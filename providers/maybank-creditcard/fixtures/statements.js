// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// SYNTHETIC TEST DATA. Invented credit card statements in the layout parser.js reads, in the
// fixture spec format (docs/TESTING.md, fixture spec format): test/lib/minipdf.js renders each
// one at test time, and pdf.js reads it back in the page. Every name, card number, merchant and
// amount is made up.
//
// Two cards, one statement per card per cycle (the 7th to the 6th):
//   - Example Platinum Mastercard 3001: statements dated 6 January, 6 February and 6 April 2026;
//     March is missing, so April's previous balance differs from February's new balance and
//     March gets one "not covered by statements" entry. January opens at 0.00, lists a notice
//     without an amount (the interest rate line, counted as skipped), a foreign transaction with
//     its "TRANSACTED AMOUNT" line, rows posted a day after the transaction, and descriptions
//     with a comma, quotes and a leading "=". February runs over two pages (the table header
//     repeated, the totals split from their Malay labels) and holds a payment and a refund
//     ("CR"). The January statement is loaded twice, the second time as …_copy.pdf, whose
//     duplicate-month errors entry is expected (expectErrors).
//   - Example Gold Visa 7002: opens January with a credit balance (20.00CR), so the status names
//     it among the accounts the earliest statement opens with a balance, and ends February with
//     a credit balance again.
const X = { posted: 42, done: 113, desc: 167, place: 404, amount: 530 };

// A page: one array of [x, text] cells per line, from the top, 13 points apart.
const page = (lines) => lines.flatMap((cells, i) => cells.map(([x, text]) => ({ x, y: 800 - 13 * i, text })));
const head = (date, due) => [
  [[25, "Malayan Banking Berhad (0000-X)"]],
  [[25, "MR  EXAMPLE CARDHOLDER"], [300, "Statement Date/"], [400, "Payment Due Date/"]],
  [[25, "1 JALAN CONTOH"], [300, date], [400, due]],
  [[X.posted, "Posting Date /"], [X.done, "Transaction Date /"], [X.desc + 30, "Transaction Description /"], [X.amount, "Amount(RM) /"]],
  [[X.posted, "Tarikh Pos"], [X.done, "Tarikh Transaksi"], [X.desc + 30, "Huraian Transaksi"], [X.amount, "Amaun(RM)"]],
];
const card = (name, number, previous) => [
  [[X.desc, name], [440, ":"], [455, number]],
  [[X.desc, "YOUR COMBINED CREDIT LIMIT (RM)"], [X.amount, "10,000"]],
  [[X.desc, "YOUR PREVIOUS STATEMENT BALANCE"], [X.amount, previous]],
  [[X.desc, "JUMLAH PENYATA TERAKHIR"]],
];
// [posted, done, merchant, place?, amount?, foreign?]
const rows = (...list) => list.flatMap(([posted, done, merchant, place, amount, foreign]) => [
  [[X.posted, posted], [X.done, done], [X.desc, merchant], ...(place ? [[X.place, place]] : []), ...(amount ? [[X.amount, amount]] : [])],
  ...(foreign ? [[[X.desc, "TRANSACTED AMOUNT"], [X.desc + 127, foreign[0]], [X.desc + 175, foreign[1]]]] : []),
]);
const totals = (credit, debit, total, split) => (split
  ? [[[X.desc, "TOTAL CREDIT THIS MONTH"], [X.amount, credit]], [[X.desc, "(JUMLAH KREDIT)"]], [[X.desc, "TOTAL DEBIT THIS MONTH"], [X.amount, debit]], [[X.desc, "(JUMLAH DEBIT)"]]]
  : [[[X.desc, "TOTAL CREDIT THIS MONTH(JUMLAH KREDIT)"], [X.amount, credit]], [[X.desc, "TOTAL DEBIT THIS MONTH(JUMLAH DEBIT)"], [X.amount, debit]]])
  .concat([[[X.desc, "SUB TOTAL/JUMLAH"], [X.amount, total]], [], [[25, "Total TreatsPoints"], [400, "1,234"]]]);

const PLATINUM = ["MAYBANK EXAMPLE PLATINUM MASTERCARD", "5000 1111 2222 3001"];
const GOLD = ["MAYBANK EXAMPLE GOLD VISA", "4000 5555 6666 7002"];

const platinumJanuary = [page([
  ...head("06 JAN 26", "26 JAN 26"),
  ...card(...PLATINUM, "0.00"),
  ...rows(
    ["07/12", "07/12", "RETAIL INTEREST RATE = 15.00%"],
    ["08/12", "08/12", "CAFE \"CORNER\", LTD", "KUALA LUMPUR MY", "12.50"],
    ["16/12", "15/12", "=CASHBACK SHOP SP", "JOHOR BAHRU MY", "100.00"],
    ["21/12", "20/12", "EXAMPLE* RIDE 1234", "Singapore SG", "45.00", ["SGD", "13.20"]],
    ["03/01", "03/01", "BOOKSHOP", "PETALING JAYA MY", "30.00"],
  ),
  ...totals("0.00", "187.50", "187.50"),
])];

module.exports = {
  marker: "SYNTHETIC TEST DATA",
  files: [
    { name: "1001_20260106.pdf", pages: platinumJanuary },
    {
      name: "1002_20260206.pdf",
      pages: [
        page([
          ...head("06 FEB 26", "26 FEB 26"),
          ...card(...PLATINUM, "187.50"),
          ...rows(
            ["10/01", "10/01", "PAYMENT - THANK YOU", null, "187.50CR"],
            ["12/01", "11/01", "GROCER, \"FRESH\" MART", "SKUDAI MY", "64.20"],
          ),
        ]),
        page([
          ...head("06 FEB 26", "26 FEB 26").slice(3),
          ...rows(
            ["25/01", "25/01", "REFUND GROCER", "SKUDAI MY", "4.20CR"],
            ["05/02", "04/02", "PETROL STATION SP", "JOHOR MY", "80.00"],
          ),
          ...totals("191.70", "144.20", "140.00", true),
        ]),
      ],
    },
    {
      name: "1004_20260406.pdf",
      pages: [page([
        ...head("06 APR 26", "26 APR 26"),
        ...card(...PLATINUM, "210.00"),
        ...rows(
          ["07/03", "07/03", "RETAIL INTEREST RATE = 15.00%"],
          ["09/03", "09/03", "PAYMENT - THANK YOU", null, "210.00CR"],
          ["20/03", "19/03", "BAKERY", "KUALA LUMPUR MY", "18.40"],
          ["02/04", "02/04", "PHARMACY", "JOHOR BAHRU MY", "25.60"],
        ),
        ...totals("210.00", "44.00", "44.00"),
      ])],
    },
    {
      name: "2001_20260106.pdf",
      pages: [page([
        ...head("06 JAN 26", "26 JAN 26"),
        ...card(...GOLD, "20.00CR"),
        ...rows(["14/12", "13/12", "MUSIC STREAMING", "Stockholm SE", "15.90"]),
        ...totals("0.00", "15.90", "4.10CR"),
      ])],
    },
    {
      name: "2002_20260206.pdf",
      pages: [page([
        ...head("06 FEB 26", "26 FEB 26"),
        ...card(...GOLD, "4.10CR"),
        ...rows(["14/01", "13/01", "MUSIC STREAMING", "Stockholm SE", "15.90"], ["20/01", "20/01", "CASHBACK", null, "15.00CR"]),
        ...totals("15.00", "15.90", "3.20CR"),
      ])],
    },
    { name: "1001_20260106_copy.pdf", pages: platinumJanuary },
  ],
  expectErrors: ["1001_20260106_copy.pdf"],
};
