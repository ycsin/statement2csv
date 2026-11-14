// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// SYNTHETIC TEST DATA. Invented credit card statements in the two layouts parser.js reads, in
// the fixture spec format (docs/TESTING.md, fixture spec format): test/lib/minipdf.js renders
// each one at test time, and pdf.js reads it back in the page. Every name, card number,
// merchant and amount is made up.
//
// Two card products, one statement per product per period (the 2nd to the 1st):
//   - HSBC Example Platinum: periods ending 1 February, 1 March and 1 May 2026; the period
//     ending 1 April is missing, so May's previous balance differs from March's Total Due and
//     April gets one "not covered by statements" entry. February is in the older layout (the
//     period on its own line, the table over two pages, the first page's right column holding
//     the account summary beside the rows) and opens at 0.00. It lists a foreign transaction
//     whose place and amount wrap onto the next line, rows posted after the transaction date, a
//     row without an amount (not exported, listed as skipped), and descriptions with a comma,
//     quotes and a leading "=". March and May are in the newer layout (the period beside the
//     totals); in March the card is replaced, so its rows come under two card numbers in one
//     account, with a payment and a refund ("CR"). The February statement is loaded twice, the
//     second time as …_copy.pdf, whose duplicate-month errors entry is expected (expectErrors).
//   - HSBC Example Cashback: opens with a credit balance (20.00CR), so the status names it
//     among the accounts the earliest statement opens with a balance, and ends with a credit
//     balance again.
const X = { posted: 60, made: 101, desc: 140, city: 270, amount: 330, label: 389, value: 540 };

// A page: one array of [x, text] cells per line, from the top, 13 points apart.
const page = (lines) => lines.flatMap((cells, i) => cells.map(([x, text]) => ({ x, y: 800 - 13 * i, text })));
const top = (product) => [[[55, `HSBC ${product}`]], [[55, "HSBC Bank (Singapore) Limited (Company Registration No. 000000000X)"]], [[55, "EXAMPLE CARDHOLDER"]]];
const tableHead = [[[57, "POST"], [102, "TRAN"]], [[57, "DATE"], [102, "DATE"], [X.desc, "DESCRIPTION"], [280, "AMOUNT(SGD)"]]];
const masked = (last4) => [[[X.posted, `Example Cardholder 4000-XXXX-XXXX-${last4}`]]];
// [posted, made, merchant, city?, amount?, wrapped cells?]
const rows = (...list) => list.flatMap(([posted, made, merchant, city, amount, wrapped]) => [
  [[X.posted, posted], [X.made, made], [X.desc, merchant], ...(city ? [[X.city, city]] : []), ...(amount ? [[X.amount, amount]] : [])],
  ...(wrapped ? [wrapped.map((s, i) => [X.desc + 100 * i, s])] : []),
]);
const opening = (amount) => [[[X.desc, "Previous Statement Balance"], [X.amount, amount]]];
const totalDue = (amount) => [[[X.desc, "Total Due"], [X.amount, amount]]];
// Right-column summary cells, laid beside the given left-column lines.
const beside = (left, right) => left.map((cells, i) => [...cells, ...(right[i] || [])]);
const summary = (previous, credits, debits) => [
  [[X.label, "ACCOUNT SUMMARY"], [X.value, "SGD"]],
  [[X.label, "Previous Statement Balance"], [X.value, previous]],
  [[X.label, "Payments & Credits"], [X.value, credits]],
  [[X.label, "Purchases & Debits"], [X.value, debits]],
  [[X.label, "GST Charges"], [X.value, "0.00"]],
];
// The newer layout: one page, the period beside the totals, the summary beside the table.
const newer = (product, card, from, to, previous, credits, debits, body, total) => [page([
  ...top(product),
  [[59, card]],
  [[59, "Statement period"], [239, "Total Due"], [328, "Minimum Payment"]],
  [[59, `From ${from} to ${to}`], [239, total], [328, "0.00"]],
  [],
  ...beside([...tableHead, ...body, ...totalDue(total)], summary(previous, credits, debits)),
])];

const PLATINUM = "EXAMPLE PLATINUM";
const platinumFebruary = [
  page([
    ...top(PLATINUM),
    [[55, "Statement From 02 JAN 2026 to 01 FEB 2026"]],
    [],
    ...beside([
      ...tableHead,
      ...masked("0002"),
      ...opening("0.00"),
      ...rows(
        ["05 Jan", "04 Jan", "CAFE \"CORNER\", LTD", "Singapore", "12.50", ["SG"]],
        ["10 Jan", "08 Jan", "=CASHBACK SHOP", null, "100.00", ["SINGAPORE", "SG"]],
        ["14 Jan", "12 Jan", "BORDER TOLL", "JOHOR", "2.07", ["BAHRU", "MY MYR 7.00"]],
      ),
    ], summary("0.00", "0.00", "130.47")),
    [[X.desc, "Continued on next page"]],
    [],
    [[274, `HSBC ${PLATINUM} 4000-1111-2222-0002`]],
  ]),
  page([
    [[55, "Bill payment"]],
    [[55, "Pay your credit card bills easily."]],
  ]),
  page([
    ...top(PLATINUM),
    [[55, "Statement From 02 JAN 2026 to 01 FEB 2026"]],
    ...tableHead,
    ...masked("0002"),
    ...rows(
      ["20 Jan", "20 Jan", "STREAMING SERVICE", null, "15.90", ["SG"]],
      ["28 Jan", "27 Jan", "CARD FEE WAIVED"],
    ),
    ...totalDue("130.47"),
  ]),
];

module.exports = {
  marker: "SYNTHETIC TEST DATA",
  files: [
    { name: "20260201.pdf", pages: platinumFebruary },
    {
      name: "20260301.pdf",
      pages: newer(PLATINUM, "4000-1111-2222-0003", "02 FEB 2026", "01 MAR 2026", "130.47", "134.67CR", "144.20", [
        ...masked("0002"),
        ...opening("130.47"),
        ...rows(
          ["10 Feb", "09 Feb", "PAYMENT - THANK YOU", null, "130.47CR", ["SG"]],
          ["15 Feb", "14 Feb", "GROCER, \"FRESH\" MART", "Singapore", "64.20", ["SG"]],
        ),
        ...masked("0003"),
        ...rows(
          ["25 Feb", "24 Feb", "REFUND GROCER", null, "4.20CR", ["Singapore", "SG"]],
          ["28 Feb", "27 Feb", "PETROL STATION", null, "80.00", ["SINGAPORE 123", "SG"]],
        ),
      ], "140.00"),
    },
    {
      name: "20260501.pdf",
      pages: newer(PLATINUM, "4000-1111-2222-0003", "02 APR 2026", "01 MAY 2026", "210.00", "210.00CR", "18.40", [
        ...masked("0003"),
        ...opening("210.00"),
        ...rows(
          ["05 Apr", "05 Apr", "PAYMENT - THANK YOU", null, "210.00CR", ["SG"]],
          ["20 Apr", "19 Apr", "BAKERY", null, "18.40", ["Singapore", "SG"]],
        ),
      ], "18.40"),
    },
    {
      name: "cashback-20260201.pdf",
      pages: newer("EXAMPLE CASHBACK", "4000-5555-6666-0007", "02 JAN 2026", "01 FEB 2026", "20.00CR", "0.00", "15.90", [
        ...masked("0007"),
        ...opening("20.00CR"),
        ...rows(["14 Jan", "13 Jan", "MUSIC STREAMING", "Stockholm", "15.90", ["SE"]]),
      ], "4.10CR"),
    },
    { name: "20260201_copy.pdf", pages: platinumFebruary },
  ],
  expectErrors: ["20260201_copy.pdf"],
};
