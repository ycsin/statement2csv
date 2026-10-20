// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
//
// Frozen copies of the old pages' storage functions, the oracles core/storage.js is compared
// with in test/unit/differential.test.js (never inlined into a page):
//   - statementApp: src/app.js:24-36 of the seven statement apps (the same lines in all seven;
//     copied from versa2csv at its legacyHead): loadConfig, saveConfig, loadMode and the
//     storage line of setMode;
//   - customApp: etoro2csv src/app.js:14-19 at its legacyHead: loadMode and the storage line
//     of setMode.
// The old lines are verbatim. Each block runs inside a function whose parameters stand for the
// page's key constants and its localStorage, so a test passes the keys and a fake storage;
// `state` stands for the page's state object (saveConfig writes state.config). Pinned and
// re-derived from git (test/contract/provenance.js).
"use strict";

// statementApp(MODE_KEY, CONFIG_KEY, localStorage) -> { loadConfig, saveConfig, loadMode, setMode, state }
function statementApp(MODE_KEY, CONFIG_KEY, localStorage) {
  const state = { config: {}, mode: null };
  function loadConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch { return {}; }
  }
  function saveConfig() {
    try { localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config)); } catch { /* storage unavailable */ }
  }

  function loadMode() {
    try { const m = localStorage.getItem(MODE_KEY); return ["tradelog", "holdings"].includes(m) ? m : "balance"; } catch { return "balance"; }
  }
  function setMode(mode) {
    state.mode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage unavailable */ }
  }
  return { loadConfig, saveConfig, loadMode, setMode, state };
}

// customApp(MODE_KEY, localStorage) -> { loadMode, setMode, state }
function customApp(MODE_KEY, localStorage) {
  const state = { mode: null };
  function loadMode() {
    try { const m = localStorage.getItem(MODE_KEY); return ["month", "day"].includes(m) ? m : "balance"; } catch { return "balance"; }
  }
  function setMode(mode) {
    state.mode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch { /* storage unavailable */ }
  }
  return { loadMode, setMode, state };
}

module.exports = { statementApp, customApp };
