// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// RFC 4180 parse-back of downloaded CSV files. parseCsv(text) -> string[][]. Records end in
// LF or CRLF (the writers use LF); a final line ending is optional and adds no record. A field
// is quoted when it starts with a double quote; inside it, "" is a quote and anything else,
// line breaks included, is literal. Malformed input throws, naming only the line number (never
// the content): a quote inside an unquoted field, text after a closing quote, an unterminated
// quoted field, or a carriage return outside quotes that is not part of CRLF.
"use strict";

function parseCsv(text) {
  if (typeof text !== "string") throw new TypeError("parseCsv: text must be a string");
  const rows = [];
  const n = text.length;
  let i = 0;
  let line = 1;
  const fail = (msg) => {
    throw new Error(`parseCsv: ${msg} (line ${line})`);
  };
  while (i < n) {
    const row = [];
    for (;;) {
      let field;
      if (text.charCodeAt(i) === 34) {
        field = "";
        let j = i + 1;
        for (;;) {
          const q = text.indexOf('"', j);
          if (q < 0) fail("unterminated quoted field");
          const chunk = text.slice(j, q);
          for (let k = chunk.indexOf("\n"); k >= 0; k = chunk.indexOf("\n", k + 1)) line++;
          field += chunk;
          if (text.charCodeAt(q + 1) === 34) {
            field += '"';
            j = q + 2;
            continue;
          }
          i = q + 1;
          break;
        }
        if (i < n) {
          const c = text.charCodeAt(i);
          if (c !== 44 && c !== 10 && !(c === 13 && text.charCodeAt(i + 1) === 10)) fail("text after a closing quote");
        }
      } else {
        let j = i;
        while (j < n) {
          const c = text.charCodeAt(j);
          if (c === 44 || c === 10 || c === 13 || c === 34) break;
          j++;
        }
        field = text.slice(i, j);
        i = j;
        if (i < n) {
          const c = text.charCodeAt(i);
          if (c === 34) fail("quote inside an unquoted field");
          if (c === 13 && text.charCodeAt(i + 1) !== 10) fail("carriage return outside quotes");
        }
      }
      row.push(field);
      if (i >= n) {
        rows.push(row);
        return rows;
      }
      if (text.charCodeAt(i) === 44) {
        i++;
        continue;
      }
      i += text.charCodeAt(i) === 13 ? 2 : 1;
      line++;
      rows.push(row);
      break;
    }
  }
  return rows;
}

module.exports = { parseCsv };
