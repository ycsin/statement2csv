// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The statement-app result contract (docs/CONTRACT.md, "Result shape"): every field the core
// reads, with its type. Node only: never inlined. Custom apps check their own results
// through test.js (test.checkResult).
//
//   checkResult(result, R, {strict, P}) -> {errors: string[], warnings: string[]}
//
// R is the runtime object (resolveRuntime); its ui switches decide which optional fields are
// required. With strict (every provider without frozen.legacyRepo), warnings are moved into
// errors. With P (the composed namespace), every account's P.adjustedEntries over the full
// range is also checked: an "adjustment" entry must be the last entry of its day (warning).
"use strict";

const C = require("./constants.js");

const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CCY_RE = /^[A-Z]{3}$/;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string";
const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);
const isMonth = (v) => isStr(v) && MONTH_RE.test(v);
const isDate = (v) => isStr(v) && DATE_RE.test(v);
const show = (v) => {
  try {
    return typeof v === "number" ? String(v) : JSON.stringify(v);
  } catch {
    return String(v);
  }
};

function checkResult(result, R, { strict = false, P = null } = {}) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);
  const U = (R && R.ui) || C.DEFAULT_UI;
  const diag = Array.isArray(U.diagnostics) ? U.diagnostics : [];

  if (!isObj(result)) {
    err("result must be an object");
    return { errors, warnings };
  }
  const need = (key, ok, what) => {
    if (!(key in result) || result[key] === undefined) err(`missing required field ${key} (${what})`);
    else if (!ok(result[key])) err(`${key} must be ${what}`);
  };

  // ---- always required ----
  need("accounts", isObj, "an object of accounts by export name");
  need("months", Array.isArray, "an array of {month, id?}");
  need("portfolios", Array.isArray, "an array of portfolios");
  need("errors", Array.isArray, "an array of {id, error}");
  need("gaps", Array.isArray, 'an array of "YYYY-MM"');
  need("firstOpenings", Array.isArray, "an array of {account, month, opening}");
  need("skippedRows", Array.isArray, "an array of {date, category, ...}");

  // ---- required by the resolved switches ----
  if (U.status === "statements" || U.status === "statements+downloads") need("statements", isFiniteNum, `a number (ui.status ${U.status})`);
  if (U.status === "statements+downloads") need("downloads", isFiniteNum, "a number (ui.status statements+downloads)");
  if (U.extraWarnings === "warnings") need("warnings", (v) => Array.isArray(v) && v.every(isStr), "an array of strings");
  if (U.extraWarnings === "unmapped") need("unmapped", (v) => isObj(v) && Object.values(v).every((x) => Array.isArray(x) && x.every(isStr)), "an object of {name: string[]}");
  if (diag.includes("reconciled")) need("reconciled", Array.isArray, "an array of {month, account, diff} (diagnostics reconciled)");
  if (U.openingsCurrency === "base" || diag.includes("reconciled")) need("baseCurrency", isStr, "a string (openingsCurrency base or diagnostics reconciled)");

  const accounts = isObj(result.accounts) ? result.accounts : {};

  // ---- accounts ----
  for (const [name, a] of Object.entries(accounts)) {
    const at = `accounts[${show(name)}]`;
    if (!isObj(a)) {
      err(`${at} must be an object`);
      continue;
    }
    if (!isStr(a.kind)) err(`${at}.kind must be a string`);
    if (!isStr(a.currency)) err(`${at}.currency must be a string`);
    else if (!CCY_RE.test(a.currency)) warn(`${at}.currency ${show(a.currency)} is not a three-letter currency code`);
    if (a.downloadOnly !== undefined && typeof a.downloadOnly !== "boolean") err(`${at}.downloadOnly must be a boolean`);
    if (!isObj(a.months)) err(`${at}.months must be an object of months`);
    else {
      for (const [key, m] of Object.entries(a.months)) {
        const mat = `${at}.months[${show(key)}]`;
        if (!MONTH_RE.test(key)) err(`${at}.months has a key that is not "YYYY-MM": ${show(key)}`);
        if (!isObj(m)) {
          err(`${mat} must be an object`);
          continue;
        }
        if (!isDate(m.monthEnd)) err(`${mat}.monthEnd must be "YYYY-MM-DD"`);
        else if (m.monthEnd.slice(0, 7) !== key) err(`${mat}.monthEnd ${m.monthEnd} is outside its month`);
        for (const k of ["opening", "closing"]) if (!isFiniteNum(m[k])) err(`${mat}.${k} must be a finite number, not ${show(m[k])}`);
        if (m.fx !== null && !isFiniteNum(m.fx)) err(`${mat}.fx must be a finite number or null, not ${show(m.fx)}`);
        if (m.partial !== undefined && typeof m.partial !== "boolean") err(`${mat}.partial must be a boolean`);
        if (m.startDate !== undefined && !isDate(m.startDate)) err(`${mat}.startDate must be "YYYY-MM-DD"`);
      }
    }
    if (!Array.isArray(a.valuations)) err(`${at}.valuations must be an array of [monthEnd, closing]`);
    else {
      a.valuations.forEach((v, i) => {
        if (!(Array.isArray(v) && v.length === 2 && isDate(v[0]) && isFiniteNum(v[1]))) err(`${at}.valuations[${i}] must be ["YYYY-MM-DD", finite number], not ${show(v)}`);
      });
      sortedBy(a.valuations, (v) => (Array.isArray(v) ? v[0] : ""), `${at}.valuations`, err);
    }
    if (!Array.isArray(a.trades)) err(`${at}.trades must be an array`);
    else {
      a.trades.forEach((t, i) => {
        const tat = `${at}.trades[${i}]`;
        if (!isObj(t)) return err(`${tat} must be an object`);
        if (!isDate(t.date)) err(`${tat}.date must be "YYYY-MM-DD"`);
        for (const k of ["ticker", "currency", "name"]) if (!isStr(t[k])) err(`${tat}.${k} must be a string`);
        for (const k of ["qty", "price"]) if (!isFiniteNum(t[k])) err(`${tat}.${k} must be a finite number, not ${show(t[k])}`);
        if (isStr(t.currency) && !CCY_RE.test(t.currency)) warn(`${tat}.currency ${show(t.currency)} is not a three-letter currency code`);
      });
      sortedBy(a.trades, (t) => (isObj(t) ? t.date : ""), `${at}.trades`, err);
    }
    if (!Array.isArray(a.cash)) err(`${at}.cash must be an array`);
    else {
      a.cash.forEach((c, i) => {
        const cat = `${at}.cash[${i}]`;
        if (!isObj(c)) return err(`${cat} must be an object`);
        if (!isDate(c.date)) err(`${cat}.date must be "YYYY-MM-DD"`);
        if (!isFiniteNum(c.amount)) err(`${cat}.amount must be a finite number, not ${show(c.amount)}`);
        for (const k of ["currency", "name", "kind"]) if (!isStr(c[k])) err(`${cat}.${k} must be a string`);
        if (c.notes !== undefined && !isStr(c.notes)) err(`${cat}.notes must be a string when present`);
        if (c.balancing !== undefined && typeof c.balancing !== "boolean") err(`${cat}.balancing must be a boolean when present`);
        if (C.RESERVED_KINDS.includes(c.kind)) err(`${cat}.kind ${show(c.kind)} is reserved for the export layer (${C.RESERVED_KINDS.join(", ")})`);
        if (isStr(c.currency) && !CCY_RE.test(c.currency)) warn(`${cat}.currency ${show(c.currency)} is not a three-letter currency code`);
      });
      sortedBy(a.cash, (c) => (isObj(c) ? c.date : ""), `${at}.cash`, err);
    }
  }

  // ---- months ----
  if (Array.isArray(result.months)) {
    result.months.forEach((m, i) => {
      if (!isObj(m) || !isMonth(m.month)) err(`months[${i}] must be {month: "YYYY-MM", id?}`);
    });
    const ms = result.months.map((m) => (isObj(m) ? m.month : ""));
    for (let i = 1; i < ms.length; i++) {
      if (ms[i] === ms[i - 1]) err(`months: ${ms[i]} is listed twice`);
      else if (ms[i] < ms[i - 1]) err(`months are not in ascending order at index ${i} (${ms[i - 1]} then ${ms[i]})`);
    }
  }

  // ---- portfolios ----
  if (Array.isArray(result.portfolios)) {
    const seen = new Set();
    result.portfolios.forEach((p, i) => {
      const pat = `portfolios[${i}]`;
      if (!isObj(p)) return err(`${pat} must be an object`);
      if (!isStr(p.id)) err(`${pat}.id must be a string`);
      else if (seen.has(p.id)) err(`portfolio id ${show(p.id)} is listed twice`);
      else seen.add(p.id);
      if (!isStr(p.label)) err(`${pat}.label must be a string`);
      if (!(Array.isArray(p.names) && p.names.every(isStr))) err(`${pat}.names must be an array of strings`);
      else if (isStr(p.label) && p.names[p.names.length - 1] !== p.label) warn(`${pat}.names does not end with its label ${show(p.label)}`);
      for (const k of ["firstMonth", "lastMonth"]) if (!isMonth(p[k])) err(`${pat}.${k} must be "YYYY-MM"`);
      if (!isStr(p.kind)) err(`${pat}.kind must be a string`);
      if (p.currency !== null && !isStr(p.currency)) err(`${pat}.currency must be a string or null`);
      else if (isStr(p.currency) && !CCY_RE.test(p.currency)) warn(`${pat}.currency ${show(p.currency)} is not a three-letter currency code`);
    });
  }

  // ---- errors, gaps, firstOpenings, skippedRows ----
  if (Array.isArray(result.errors)) {
    result.errors.forEach((x, i) => {
      if (!(isObj(x) && isStr(x.id) && isStr(x.error))) err(`errors[${i}] must be {id: string, error: string}`);
    });
  }
  if (Array.isArray(result.gaps)) result.gaps.forEach((g, i) => isMonth(g) || err(`gaps[${i}] must be "YYYY-MM"`));
  if (Array.isArray(result.firstOpenings)) {
    result.firstOpenings.forEach((o, i) => {
      const oat = `firstOpenings[${i}]`;
      if (!isObj(o)) return err(`${oat} must be an object`);
      if (!isStr(o.account) || !Object.prototype.hasOwnProperty.call(accounts, o.account)) err(`${oat}.account ${show(o.account)} is not an account`);
      if (!isMonth(o.month)) err(`${oat}.month must be "YYYY-MM"`);
      if (!isFiniteNum(o.opening)) err(`${oat}.opening must be a finite number, not ${show(o.opening)}`);
    });
  }
  if (Array.isArray(result.skippedRows)) {
    const owner = U.skippedOwner === "portfolio" ? "portfolio" : "account";
    result.skippedRows.forEach((x, i) => {
      const sat = `skippedRows[${i}]`;
      if (!isObj(x)) return err(`${sat} must be an object`);
      if (!isDate(x.date)) err(`${sat}.date must be "YYYY-MM-DD"`);
      if (!isStr(x.category)) err(`${sat}.category must be a string`);
      // detail and the owner field are optional: absent or null (the core reads
      // `x.detail || "(no description)"`), otherwise a string.
      if (x.detail !== undefined && x.detail !== null && !isStr(x.detail)) err(`${sat}.detail must be a string when present`);
      if (x[owner] !== undefined && x[owner] !== null && !isStr(x[owner])) err(`${sat}.${owner} must be a string when present`);
    });
  }

  // ---- optional, guarded ----
  if (result.partialMonths !== undefined) {
    if (!(Array.isArray(result.partialMonths) && result.partialMonths.every(isMonth))) err('partialMonths must be an array of "YYYY-MM"');
  }
  if (result.late !== undefined) {
    if (!Array.isArray(result.late)) err("late must be an array");
    else result.late.forEach((x, i) => {
      if (!(isObj(x) && isMonth(x.month) && isMonth(x.statement) && isStr(x.account) && isFiniteNum(x.amount))) {
        err(`late[${i}] must be {month: "YYYY-MM", statement: "YYYY-MM", account: string, amount: finite number}`);
      }
    });
  }
  if (result.closed !== undefined) {
    if (!Array.isArray(result.closed)) err("closed must be an array");
    else result.closed.forEach((x, i) => {
      if (!(isObj(x) && isStr(x.account) && isMonth(x.month) && isFiniteNum(x.balance))) err(`closed[${i}] must be {account: string, month: "YYYY-MM", balance: finite number}`);
    });
  }
  if (diag.includes("reconciled") && Array.isArray(result.reconciled)) {
    result.reconciled.forEach((x, i) => {
      if (!(isObj(x) && isMonth(x.month) && isStr(x.account) && isFiniteNum(x.diff))) err(`reconciled[${i}] must be {month: "YYYY-MM", account: string, diff: finite number}`);
    });
  }
  if (isStr(result.baseCurrency) && !CCY_RE.test(result.baseCurrency)) warn(`baseCurrency ${show(result.baseCurrency)} is not a three-letter currency code`);

  // ---- export-layer order (needs P) ----
  if (P && typeof P.adjustedEntries === "function" && Array.isArray(result.months)) {
    const earliest = result.months.length && isObj(result.months[0]) ? result.months[0].month : null;
    for (const [name, a] of Object.entries(accounts)) {
      if (!isObj(a) || !isObj(a.months) || !Array.isArray(a.cash) || !Array.isArray(a.trades)) continue;
      let entries;
      try {
        entries = P.adjustedEntries(a, null, null, earliest, false).entries;
      } catch (e) {
        err(`accounts[${show(name)}]: P.adjustedEntries throws: ${e && e.message}`);
        continue;
      }
      for (let i = 0; i + 1 < entries.length; i++) {
        const [x, y] = [entries[i], entries[i + 1]];
        if (x.kind === "adjustment" && y.kind !== "adjustment" && y.date === x.date) {
          warn(`accounts[${show(name)}]: the adjustment on ${x.date} is not the last entry of its day`);
        }
      }
    }
  }

  if (strict) {
    errors.push(...warnings.map((w) => `strict: ${w}`));
    warnings.length = 0;
  }
  return { errors, warnings };
}

// Non-decreasing by key (code-point order), reporting the first break only.
function sortedBy(list, key, at, err) {
  for (let i = 1; i < list.length; i++) {
    const a = key(list[i - 1]), b = key(list[i]);
    if (isStr(a) && isStr(b) && b < a) {
      err(`${at} is not in ascending date order at index ${i} (${a} then ${b})`);
      return;
    }
  }
}

module.exports = { checkResult };
