// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Canonical serializer for parse results, statement objects and caches. canon(value) is JSON
// with key order kept (insertion order, as Object.keys gives it) and five extra literals for
// what JSON loses: -0, NaN, Infinity, -Infinity and undefined (array holes too). There is no
// whitespace. Two values have the same canon text exactly when they are the same data, so the
// text can be compared or hashed. canon.parse(text) reads it back: parse(canon(v)) equals v.
// Only plain data is accepted: plain objects (from any realm), arrays, strings, numbers,
// booleans, null and undefined. Anything else, and cycles, throw.
"use strict";

function isPlainObject(v) {
  const proto = Object.getPrototypeOf(v);
  if (proto === null) return true;
  // Object.prototype of this or another realm (vm contexts have their own).
  return Object.getPrototypeOf(proto) === null && typeof proto.constructor === "function" && proto.constructor.name === "Object"
    && Object.prototype.toString.call(v) === "[object Object]";
}

function canon(value) {
  const path = new Set();
  const enc = (v) => {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    switch (typeof v) {
      case "boolean":
        return v ? "true" : "false";
      case "number":
        if (Number.isNaN(v)) return "NaN";
        if (v === Infinity) return "Infinity";
        if (v === -Infinity) return "-Infinity";
        if (Object.is(v, -0)) return "-0";
        return JSON.stringify(v);
      case "string":
        return JSON.stringify(v);
      case "object": {
        if (path.has(v)) throw new TypeError("canon: cyclic value");
        path.add(v);
        let s;
        if (Array.isArray(v)) {
          const parts = new Array(v.length);
          for (let i = 0; i < v.length; i++) parts[i] = i in v ? enc(v[i]) : "undefined";
          s = `[${parts.join(",")}]`;
        } else if (isPlainObject(v)) {
          s = `{${Object.keys(v).map((k) => `${JSON.stringify(k)}:${enc(v[k])}`).join(",")}}`;
        } else {
          throw new TypeError(`canon: unsupported object (${Object.prototype.toString.call(v)})`);
        }
        path.delete(v);
        return s;
      }
      default:
        throw new TypeError(`canon: unsupported type ${typeof v}`);
    }
  };
  return enc(value);
}

const STRING = /"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"/y;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const WORDS = [["undefined", undefined], ["null", null], ["true", true], ["false", false], ["NaN", NaN], ["Infinity", Infinity], ["-Infinity", -Infinity]];

function parse(text) {
  if (typeof text !== "string") throw new TypeError("canon.parse: text must be a string");
  let i = 0;
  const fail = (msg) => {
    throw new SyntaxError(`canon.parse: ${msg} at offset ${i}`);
  };
  const str = () => {
    STRING.lastIndex = i;
    const m = STRING.exec(text);
    if (!m) fail("bad string");
    i = STRING.lastIndex;
    return JSON.parse(m[0]);
  };
  const value = () => {
    const c = text[i];
    if (c === "{") {
      i++;
      const obj = {};
      if (text[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        if (text[i] !== '"') fail("expected a key");
        const k = str();
        if (text[i] !== ":") fail("expected ':'");
        i++;
        if (Object.prototype.hasOwnProperty.call(obj, k)) fail(`duplicate key ${JSON.stringify(k)}`);
        Object.defineProperty(obj, k, { value: value(), enumerable: true, writable: true, configurable: true });
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          return obj;
        }
        fail("expected ',' or '}'");
      }
    }
    if (c === "[") {
      i++;
      const arr = [];
      if (text[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(value());
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          return arr;
        }
        fail("expected ',' or ']'");
      }
    }
    if (c === '"') return str();
    for (const [word, v] of WORDS) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return v;
      }
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) fail("unexpected character");
    i = NUMBER.lastIndex;
    return Number(m[0]);
  };
  const v = value();
  if (i !== text.length) fail("trailing characters");
  return v;
}

module.exports = canon;
canon.canon = canon;
canon.parse = parse;
