// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// The parse-error smoke's injected piece (test only; plan piece 12b with build --inject, never in
// dist/; test/smoke/parse-error.js). It runs after the provider's scripts and before the app
// composes P = Object.assign({}, StatementExport, self[parserGlobal]), and replaces the parser
// global by a copy whose parseStatements throws new Error("injected failure") when the id of
// any statement contains THROW. Every other call goes to the parser's own function, with the
// same this and arguments.
(function () {
  "use strict";
  const id = self.StatementProvider.parserGlobal;
  const parser = self[id];
  const parse = parser.parseStatements;
  self[id] = Object.assign({}, parser, {
    parseStatements(statements) {
      if ([...statements].some((s) => s && String(s.id).includes("THROW"))) throw new Error("injected failure");
      return parse.apply(this, arguments);
    },
  });
})();
