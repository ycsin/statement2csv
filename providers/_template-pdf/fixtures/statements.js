// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// SYNTHETIC TEST DATA. Invented monthly statements in the PDF template's format (see parser.js),
// in the fixture spec format (docs/TESTING.md, fixture spec format): test/lib/minipdf.js renders
// each one at test time, and pdf.js reads it back in the page. Every account name, number,
// description and amount is made up.
//
// Four accounts in two currencies, on statements for January, February and April 2026:
//   - Everyday Account 0201 SGD opens January at 1,000.00, so the status names it among the
//     accounts the earliest statement opens with a balance. Descriptions hold a comma and quotes,
//     and one starts with "=" (the writers' formula guard). April lists a row without an amount:
//     it is not exported, and the diagnostics list it.
//   - Everyday Account 0201 USD: the same name and number in another currency, a section of its
//     own on each statement. Both portfolios would be labelled Everyday Account 0201, and
//     portfolios with one label make one account, so both labels add the currency, and they
//     stay two accounts.
//   - Bonus Saver 0202 (SGD) is renamed Bonus Saver Plus in April: the configurator shows the old
//     name as "formerly".
//   - Travel Account 0303 (USD); its April section has no rows.
// March is missing: each account whose April opening differs from its February closing gets one
// "not covered by statements" entry. February runs over two pages, its Everyday section across
// the page break, with the header repeated and a footer on each page. The January statement is
// loaded twice, the second time as example-statement-2026-01_copy.pdf, whose duplicate-month
// errors entry is expected (expectErrors).
const X = { left: 50, text: 130, number: 420, right: 500 };

// A page: one array of [x, text, size?] cells per line, from the top, 15 points apart.
const page = (lines, footer) => [
  ...lines.flatMap((cells, i) => cells.map(([x, text, size]) => (size ? { x, y: 800 - 15 * i, size, text } : { x, y: 800 - 15 * i, text }))),
  ...(footer ? [{ x: X.left, y: 40, text: footer }] : []),
];
const header = (from, to) => [[[X.left, "Example Bank", 16]], [[X.left, "Monthly statement"]], [[X.left, "Statement period"], [160, `${from} to ${to}`]], []];
const account = (name, number, currency, opening) => [
  [[X.left, "Account"], [X.text, name], [X.number, number], [X.right, currency]],
  [[X.left, "Opening balance"], [X.right, opening]],
  [[X.left, "Date"], [X.text, "Description"], [X.right, "Amount"]],
];
const rows = (...list) => list.map(([date, text, amount]) => [[X.left, date], [X.text, text], ...(amount === undefined ? [] : [[X.right, amount]])]);
const closing = (amount) => [[[X.left, "Closing balance"], [X.right, amount]], []];

const january = [page([
  ...header("01/01/2026", "31/01/2026"),
  ...account("Everyday Account", "10201", "SGD", "1,000.00"),
  ...rows(["03/01/2026", "Salary", "2,500.00"], ["10/01/2026", "Card payment, \"Corner\" Cafe", "-12.50"], ["26/01/2026", "Rent", "-1,200.00"]),
  ...closing("2,287.50"),
  ...account("Everyday Account", "10201", "USD", "0.00"),
  ...rows(["12/01/2026", "Transfer in", "150.00"]),
  ...closing("150.00"),
  ...account("Bonus Saver", "10202", "SGD", "0.00"),
  ...rows(["05/01/2026", "Transfer in", "500.00"], ["31/01/2026", "Interest", "0.42"]),
  ...closing("500.42"),
  ...account("Travel Account", "20303", "USD", "0.00"),
  ...rows(["15/01/2026", "Deposit", "300.00"]),
  ...closing("300.00"),
])];

module.exports = {
  marker: "SYNTHETIC TEST DATA",
  files: [
    { name: "example-statement-2026-01.pdf", pages: january },
    {
      name: "example-statement-2026-02.pdf",
      pages: [
        page([
          ...header("01/02/2026", "28/02/2026"),
          ...account("Everyday Account", "10201", "SGD", "2,287.50"),
          ...rows(["02/02/2026", "Coffee", "-4.80"], ["09/02/2026", "Salary", "2,500.00"]),
        ], "Page 1 of 2"),
        page([
          ...header("01/02/2026", "28/02/2026"),
          ...rows(["14/02/2026", "=Cashback", "25.00"]),
          ...closing("4,807.70"),
          ...account("Everyday Account", "10201", "USD", "150.00"),
          ...rows(["18/02/2026", "Card payment, online", "-45.20"]),
          ...closing("104.80"),
          ...account("Bonus Saver", "10202", "SGD", "500.42"),
          ...rows(["28/02/2026", "Interest", "0.38"]),
          ...closing("500.80"),
          ...account("Travel Account", "20303", "USD", "300.00"),
          ...rows(["20/02/2026", "Hotel \"Lakeside\", 2 nights", "-180.25"]),
          ...closing("119.75"),
        ], "Page 2 of 2"),
      ],
    },
    {
      name: "example-statement-2026-04.pdf",
      pages: [page([
        ...header("01/04/2026", "30/04/2026"),
        ...account("Everyday Account", "10201", "SGD", "4,650.00"),
        ...rows(["01/04/2026", "Salary", "2,500.00"], ["15/04/2026", "Groceries", "-86.40"], ["20/04/2026", "Card replaced"]),
        ...closing("7,063.60"),
        ...account("Everyday Account", "10201", "USD", "104.80"),
        ...rows(["08/04/2026", "Refund", "20.00"]),
        ...closing("124.80"),
        ...account("Bonus Saver Plus", "10202", "SGD", "501.20"),
        ...rows(["30/04/2026", "Interest", "0.45"]),
        ...closing("501.65"),
        ...account("Travel Account", "20303", "USD", "119.75"),
        ...closing("119.75"),
      ])],
    },
    { name: "example-statement-2026-01_copy.pdf", pages: january },
  ],
  expectErrors: ["example-statement-2026-01_copy.pdf"],
};
