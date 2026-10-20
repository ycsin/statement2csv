// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// Saved settings in localStorage, under the provider's frozen keys: the export mode and the
// configurator's per-account settings. Every access sits inside try/catch, so a page without
// usable storage (blocked, private mode, quota) falls back to the defaults, as the old pages
// did. Moved from the old pages' app.js (docs/MIGRATION.md), with the key and the accepted
// mode ids as parameters instead of constants.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.StatementStorage = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ids: the mode ids, the default first. A stored value is used only if it is another of them.
  function loadMode(key, ids) {
    try { const m = localStorage.getItem(key); return ids.slice(1).includes(m) ? m : ids[0]; } catch { return ids[0]; }
  }
  function saveMode(key, mode) {
    try { localStorage.setItem(key, mode); } catch { /* storage unavailable */ }
  }

  // key == null: the app has no configurator, so nothing is read and nothing is written.
  function loadConfig(key) {
    if (key == null) return {};
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
  }
  function saveConfig(key, cfg) {
    if (key == null) return;
    try { localStorage.setItem(key, JSON.stringify(cfg)); } catch { /* storage unavailable */ }
  }

  return { loadMode, saveMode, loadConfig, saveConfig };
});
