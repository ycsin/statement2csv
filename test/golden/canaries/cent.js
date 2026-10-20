// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// G1b canary "cent" (test only; injected as plan piece 12b with build --inject, never in
// dist/). It wraps the two writers of the card transactions files, adjustedCsv and
// transactionsCsv: in the first data row matching \n<date>,<amount with two decimals>, the last
// cent digit d becomes (d + 1) % 10. Names and sizes stay the same; only contents change, so the
// comparison must report sha256 mismatches with equal names and sizes on card CSVs, on the
// matching Download-all entries and on the zip (test/golden/compare.js, checkCanary).
// The app composes P = Object.assign({}, StatementExport, self[parserGlobal]), so a parser that
// overrides these writers has its own copies wrapped too.
(function () {
  "use strict";
  const ROW = /\n(\d{4}-\d{2}-\d{2},-?\d+\.\d)(\d)/;
  const bump = (text) => (typeof text === "string" ? text.replace(ROW, (m, head, d) => `\n${head}${(Number(d) + 1) % 10}`) : text);
  const NAMES = ["adjustedCsv", "transactionsCsv"];
  const wrapped = (obj) => {
    const out = Object.assign({}, obj);
    for (const name of NAMES) {
      if (typeof obj[name] !== "function") continue;
      const original = obj[name];
      out[name] = function () {
        return bump(original.apply(this, arguments));
      };
    }
    return out;
  };
  self.StatementExport = wrapped(self.StatementExport);
  const id = self.StatementProvider.parserGlobal;
  const parser = self[id];
  if (parser && NAMES.some((name) => Object.prototype.hasOwnProperty.call(parser, name))) self[id] = wrapped(parser);
})();
