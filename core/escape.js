// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Escaping for the page's markup (docs/ARCHITECTURE.md, core/escape.js). Works in the browser
// (self.StatementEscape) and in Node (module.exports). Nothing here runs at load time.
//
//   esc(s)          String(s) with & < > " ' replaced by entities. Moved verbatim from the
//                   reference app's app.js:435 (identical in every old page; the derivation map
//                   in docs/MIGRATION.md names it).
//   html`…${v}…`    -> Html. The literal template text is markup; each interpolation renders as
//                     - an Html value: its markup, unchanged;
//                     - an Array whose elements are all Html values or such Arrays: their markup
//                       joined with "";
//                     - anything else: esc(String(v)), so it prints exactly as a template
//                       literal would (undefined -> "undefined", a data array -> "a,b"), escaped.
//   setHtml(el, h)  The only innerHTML assignment in core/ and providers/. Throws a TypeError
//                   unless h is an Html value.
//   cssToken(s)     String(s) when it is a plain class token (a-z, 0-9 and "-"), else "other".
//
// Html values are recognised by identity, never by shape: frozen instances of a module-private
// class, registered in a module-private WeakSet that only html adds to. A look-alike (an object
// from JSON.parse, a structural copy of a real Html value, an object whose toString returns
// markup) is escaped like any other value, and setHtml refuses it. There is no raw() escape
// hatch: markup only ever comes from literal template text.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StatementEscape = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]); }

  class Html { constructor(s) { this.s = s; } }
  const minted = new WeakSet();

  // An Array whose elements are all Html values or such Arrays. A hole, or an array that
  // contains itself, makes it data, rendered like any other value.
  function isMarkupList(v, path) {
    if (!Array.isArray(v) || path.has(v)) return false;
    path.add(v);
    try {
      for (let i = 0; i < v.length; i++) if (!minted.has(v[i]) && !isMarkupList(v[i], path)) return false;
      return true;
    } finally {
      path.delete(v);
    }
  }

  function joined(list) {
    let s = "";
    for (let i = 0; i < list.length; i++) s += minted.has(list[i]) ? list[i].s : joined(list[i]);
    return s;
  }

  function render(v) {
    if (minted.has(v)) return v.s;
    if (isMarkupList(v, new Set())) return joined(v);
    return esc(String(v));
  }

  // Only a template tag call passes the frozen strings array with its frozen raw copy.
  function html(strings, ...values) {
    if (!Array.isArray(strings) || !Object.isFrozen(strings) || !Array.isArray(strings.raw) || !Object.isFrozen(strings.raw)
        || strings.length !== values.length + 1) {
      throw new TypeError("html is a template tag: write html`…`");
    }
    let s = "";
    for (let i = 0; i < strings.length; i++) {
      if (typeof strings[i] !== "string") throw new TypeError("html: the template text has an invalid escape sequence");
      s += strings[i];
      if (i < values.length) s += render(values[i]);
    }
    const h = Object.freeze(new Html(s));
    minted.add(h);
    return h;
  }

  function setHtml(el, h) {
    if (!minted.has(h)) throw new TypeError("setHtml needs an Html value made by html`…`");
    el.innerHTML = h.s;
  }

  const cssToken = (s) => (/^[a-z0-9-]+$/.test(String(s)) ? String(s) : "other");

  return Object.freeze({ esc, html, setHtml, cssToken });
});
