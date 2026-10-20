// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// SYNTHETIC TEST DATA. The workbook of statements.js with one change: the summary's Currency
// cell carries a markup payload, for the injection smoke (docs/TESTING.md, injection; enabled
// at step M8 of the migration, which moves the app's renders to html/setHtml). The currency is
// printed in the status line, on the card, in its note and in the activity list; from M8 the
// page must show it as literal text everywhere, run no handler (window.__pwned stays undefined)
// and offer the same downloads as the downloads hook's Node rebuild. Kept self-contained (no
// require), so any spec loader can read it; keep the rest equal to statements.js.
module.exports = {
  marker: "SYNTHETIC TEST DATA",
  files: [
    {
      name: "synthetic-account-statement-hostile.xlsx",
      sheets: {
        "Account Summary": [
          ["SYNTHETIC TEST DATA"],
          ["Currency", "<b onmouseover=\"window.__pwned=1\">USD</b>"],
          ["Start Date", "01/01/2025"],
          ["End Date", "31/03/2025"],
          ["Beginning Realized Equity", 0],
          ["Deposits", 1250],
          ["Withdrawals", -150],
          ["Ending Realized Equity", 1137.37],
          ["Beginning Unrealized Equity", 0],
          ["Ending Unrealized Equity", 1146.37],
        ],
        "Account Activity": [
          ["SYNTHETIC TEST DATA"],
          ["Date", "Type", "Details", "Amount", "Realized Equity Change", "Realized Equity", "Position ID"],
          ["02/01/2025 10:00:00", "Deposit", "Synthetic transfer in", 1000, 1000, 1000, null],
          ["03/01/2025 10:05:00", "Open Position", "XMPL/USD", 400, 0, 1000, "101"],
          ["03/01/2025 10:06:00", "Open Position", "SMPL/USD", 200, 0, 1000, "102"],
          ["15/01/2025 09:30:00", "Dividend", "XMPL/USD", 0, 1.2, 1001.2, "101"],
          ["20/01/2025 22:00:00", "Overnight fee", "SMPL/USD", 0, -0.35, 1000.85, "102"],
          ["05/02/2025 14:00:00", "Position closed", "XMPL/USD", 400, 36.4, 1037.25, "101"],
          ["12/02/2025 08:00:00", "Withdraw Request", "Synthetic transfer out", -150, -150, 887.25, null],
          ["14/02/2025 00:00:00", "Interest Payment", "Synthetic interest", 0, 0.62, 887.87, null],
          ["03/03/2025 11:00:00", "Deposit", "Synthetic transfer in", 250, 250, 1137.87, null],
          ["18/03/2025 15:00:00", "SDRT", "Synthetic stamp duty", 0, -0.5, 1137.37, "102"],
        ],
        "Holdings": [
          ["Snapshot Date", "Position ID", "Direction", "Leverage", "Units", "Open Rate", "Current Rate", "Value in USD"],
          ["31/01/2025", "101", "Buy", "x1", 2, 200, 205, 410],
          ["31/01/2025", "102", "Buy", "x1", 4, 50, 48.75, 195],
          ["28/02/2025", "102", "Buy", "x1", 4, 50, 50.75, 203],
          ["14/03/2025", "102", "Buy", "x1", 4, 50, 52, 208],
        ],
        "Closed Positions": [
          ["Position ID", "Close Date", "Amount"],
          ["101", "05/02/2025 14:00:00", 400],
        ],
      },
    },
  ],
};
