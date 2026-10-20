// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// UI for the eToro statement → CSV converter. Everything runs in the browser.
//
// The custom app's controller (docs/CONTRACT.md, custom-app providers), inlined last into the
// page; it reads self.StatementProvider. Derived from the old page's src/app.js at
// frozen.legacyHead (docs/MIGRATION.md): its lines in their source order, with their markup,
// except for what moved into the core modules and the files module and is used from there (old
// line numbers):
//   $ :7, monthLabel :66, download :139-146, setBusy, fmtInt and fmtMoney :197-200
//       -> StatementShell, bound under the same names; esc :198 -> StatementEscape (below)
//   MODE_KEY :11, loadMode :14-16 and setMode's storage line :19
//       -> StatementStorage, with D.storage.modeKey and the ids of D.modes
//   inflateRaw :28-32 and the Xlsx.read call :39 -> (await StatementXlsx.read(file)).workbook
//   span :67, files :70-83 and the zip name of :153
//       -> F = EtoroFiles.create(...): F.files(), and F.zipName() (the same string)
//   CRC, crc32 and zip :155-181 -> StatementZip.zip
//   the input block :184-194 -> StatementShell.wireInput, with the old #clear body as onClear
// P is still Object.assign({}, StatementExport, EtoroParser), so the parser's openingBalance
// shadows the core one (exportOverrides). Rendering (migration step M8): every render builds
// its markup with StatementEscape.html, which escapes each interpolated value, and assigns it
// with setHtml, the one innerHTML sink. The template text is the old markup, and each old
// esc(v) is now a plain ${v}; the explanations of the activity list are template text too. What
// the old renders printed raw now renders as text: the account currency on the card (:98, :103),
// the dates of the card, the status line and the checkpoints (:98, :103, :115, :134) and the
// range's option values (:55).
(function () {
  "use strict";
  const P = Object.assign({}, window.StatementExport, window.EtoroParser);
  const D = self.StatementProvider;
  const { $, setBusy, fmtInt, fmtMoney, monthLabel, download } = self.StatementShell;
  const { html, setHtml } = self.StatementEscape;

  // Detail: "balance" (one returns row per month, the default), or rows by kind per
  // "month" or "day"; remembered in this browser.
  const state = { workbook: null, file: null, error: null, result: null, mode: StatementStorage.loadMode(D.storage.modeKey, D.modes.map((m) => m.id)) };

  function setMode(mode) {
    state.mode = mode;
    StatementStorage.saveMode(D.storage.modeKey, mode);
    for (const b of document.querySelectorAll("#mode button")) {
      b.classList.toggle("on", b.dataset.mode === mode);
      b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    }
    recompute(true);
  }

  // ---------- reading the .xlsx ----------
  async function addFiles(fileList) {
    const file = [...fileList].find((f) => /\.xlsx$/i.test(f.name)) || fileList[0];
    if (!file) return;
    setBusy(`Reading ${file.name}…`);
    try {
      state.workbook = (await StatementXlsx.read(file)).workbook;
      state.file = file.name; state.error = null;
    } catch (e) {
      state.workbook = null; state.file = file.name; state.error = String(e.message || e);
    }
    setBusy("");
    recompute(false);
  }

  function recompute(keepRange) {
    const prev = keepRange ? range() : null;
    state.result = state.workbook ? P.parseWorkbook(state.workbook, { group: state.mode }) : null;
    if (state.result && state.result.error) { state.error = state.result.error; state.result = null; }
    const months = state.result ? state.result.months : [];
    for (const id of ["from", "to"]) {
      const sel = $("#" + id), keep = prev && prev[id];
      setHtml(sel, html`${months.map((m) => html`<option value="${m}">${monthLabel(m)}</option>`)}`);
      sel.value = keep && months.includes(keep) ? keep : id === "from" ? months[0] || "" : months[months.length - 1] || "";
    }
    render();
  }

  function range() {
    let from = $("#from").value, to = $("#to").value;
    if (from && to && from > to) [from, to] = [to, from];
    return { from, to };
  }

  // ---------- files ----------
  const F = EtoroFiles.create({ P, result: () => state.result, range, naming: D.naming });

  // ---------- rendering ----------
  function render() {
    const r = state.result;
    $("#empty").hidden = !!r || !!state.error;
    $("#results").hidden = !r;
    renderStatus();
    if (!r) return;
    const a = r.account;
    const { out, entries, anchors, start } = F.files();
    const n = (k) => entries.filter((e) => e.kind === k).length;
    const last = anchors[anchors.length - 1];
    const stats = [["Deposits / withdrawals", n("transfer")], ...(state.mode === "balance" ? [["Monthly adjustments", n("adjustment")]]
                     : [[state.mode === "day" ? "Daily rows" : "Monthly rows", n("income") + n("fee")], ["Unrealized updates", n("adjustment")]]),
                   [`Total equity ${last ? last.date : ""}`, last ? `${a.currency} ${fmtMoney(last.total)}` : "–"]];
    setHtml($("#cards"), entries.length ? html`
      <article class="card">
        <header><h3>${a.name}</h3><span class="tag investment">Investment</span></header>
        <dl>${stats.map(([k, v]) => html`<div><dt>${k}</dt><dd>${typeof v === "number" ? fmtInt(v) : v}</dd></div>`)}</dl>
        <p class="note">Starts at ${a.currency} ${fmtMoney(start.balance)} on ${start.date}. The balance equals total equity at each holdings snapshot and at the statement end, and follows realized equity in between.</p>
        <div class="buttons">${out.map((f) => html`<button class="dl" data-kind="${f.kind}">${f.label}</button>`)}</div>
      </article>` : html`<p class="muted">No activity in the selected months.</p>`);
    $("#zip").disabled = !out.length;
    renderDiagnostics(r);
  }

  function renderStatus() {
    const el = $("#status");
    if (state.error) { setHtml(el, html`<p class="warn">${state.file || "File"}: ${state.error}</p>`); return; }
    const r = state.result;
    if (!r) { setHtml(el, html``); return; }
    setHtml(el, html`<p><strong>${state.file}</strong>, ${r.period.start || "?"} to ${r.period.end || "?"}, ${r.account.currency}</p>${
      r.warnings.map((w) => html`<p class="warn">${w}</p>`)}`);
  }

  function renderDiagnostics(r) {
    const how = (type, t) => {
      if (Math.abs(t.total) < 0.005) return html`not exported (doesn't change realized equity)`;
      const g = P.groupOf(type);
      if (g === null) return html`exported one by one`;
      return state.mode === "balance" ? html`in the monthly returns row` : html`summed into "${g}"`;
    };
    const rows = Object.entries(r.types).sort(([, a], [, b]) => b.count - a.count);
    setHtml($("#diagnostics"), html`
      <details>
        <summary>Activity types in the statement</summary>
        <ul>${rows.map(([type, t]) => html`<li>${type}: ${fmtInt(t.count)} rows, ${fmtMoney(t.total)} ${r.account.currency} <span class="muted">(${how(type, t)})</span></li>`)}</ul>
      </details>
      <details>
        <summary>Total equity checkpoints</summary>
        <ul>${r.account.anchors.map((x) => html`<li>${x.date}: realized ${fmtMoney(x.realized)} + open positions ${fmtMoney(x.unrealized)} = ${fmtMoney(x.total)} <span class="muted">(${x.source})</span></li>`)}</ul>
      </details>`);
  }

  // ---------- downloads ----------
  $("#cards").addEventListener("click", (e) => {
    const b = e.target.closest("button.dl");
    if (!b) return;
    const f = F.files().out.find((x) => x.kind === b.dataset.kind);
    if (f) download(f.name, new Blob([f.text], { type: "text/csv" }));
  });
  $("#zip").addEventListener("click", () => download(F.zipName(), StatementZip.zip(F.files().out)));

  // ---------- input ----------
  StatementShell.wireInput({ onFiles: addFiles, onMode: setMode, onRange: render,
    onClear: () => { state.workbook = null; state.file = null; state.error = null; recompute(false); } });

  setMode(state.mode);
})();
