// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// SYNTHETIC TEST DATA. Invented transaction-history exports in the CSV template's format (see
// parser.js), in the fixture spec format (docs/TESTING.md, fixture spec format): each file is
// written as UTF-8 text at test time. Every account number, description and amount is made up.
//
// Four accounts, January to June 2026:
//   - Example #245 SGD, in two overlapping exports. January opens at 1,250.00, so the status
//     names it among the accounts the earliest month opens with a balance. The second export
//     repeats two February rows (each counts once) and has no March row: March is covered,
//     with no entry. Descriptions hold a quoted comma and quotes, and one starts with "=" (the
//     writers' formula guard).
//   - Example #245 USD: the same account number in another currency, from March, starting at
//     0. Both portfolios would be labelled Example #245, and portfolios with one label make one
//     account, so both labels add the currency, and they stay two accounts.
//   - Example #378 (SGD) appears in February with 300.00 already in it: one "not covered by
//     statements" entry for January brings it there from 0.
//   - Example #511 (USD), in January and in June. No export covers May (the missing month), and
//     February to April are covered for the other accounts only: the June export opens with one
//     entry bridging February to May.
// budget-notes.csv is not an export, and its errors entry is expected (expectErrors).
const csv = (...rows) => `${rows.join("\n")}\n`;
const head = (number, currency) => ["Example Bank transaction history", `Account,${number},${currency}`, "Date,Description,Amount,Balance"];

module.exports = {
  marker: "SYNTHETIC TEST DATA",
  files: [
    {
      name: "example-history-245-2026-01.csv",
      text: csv(...head("1100245", "SGD"),
        "2026-01-05,Salary,2500.00,3750.00",
        "2026-01-12,\"Card payment, \"\"Corner\"\" Cafe\",-12.50,3737.50",
        "2026-01-28,Rent,-1200.00,2537.50",
        "2026-02-02,Coffee,-4.80,2532.70",
        "2026-02-09,Salary,2500.00,5032.70"),
    },
    {
      name: "example-history-245-2026-04.csv",
      text: csv(...head("1100245", "SGD"),
        "2026-02-02,Coffee,-4.80,2532.70",
        "2026-02-09,Salary,2500.00,5032.70",
        "2026-02-14,=Refund,25.00,5057.70",
        "2026-02-27,Transfer to Example #378,-200.00,4857.70",
        "2026-04-02,Interest,1.25,4858.95",
        "2026-04-08,Groceries,-86.40,4772.55"),
    },
    {
      name: "example-history-245-usd-2026-03.csv",
      text: csv(...head("1100245", "USD"),
        "2026-03-03,Transfer in,400.00,400.00",
        "2026-03-20,\"Card payment, online\",-25.30,374.70",
        "2026-04-15,Interest,0.12,374.82"),
    },
    {
      name: "example-history-378-2026-02.csv",
      text: csv(...head("1100378", "SGD"),
        "2026-02-27,Transfer from Example #245,200.00,500.00",
        "2026-02-28,Interest,0.42,500.42"),
    },
    {
      name: "example-history-511-2026-01.csv",
      text: csv(...head("2200511", "USD"),
        "2026-01-08,Transfer in,500.00,500.00",
        "2026-01-19,Hotel,-180.25,319.75",
        "2026-01-30,Card fee,-1.50,318.25"),
    },
    {
      name: "example-history-511-2026-06.csv",
      text: csv(...head("2200511", "USD"),
        "2026-06-02,\"Refund, airline\",120.00,760.00",
        "2026-06-24,Taxi,-35.60,724.40"),
    },
    {
      name: "budget-notes.csv",
      text: csv("Category,Amount", "Groceries,300", "Travel,150"),
    },
  ],
  expectErrors: ["budget-notes.csv"],
};
