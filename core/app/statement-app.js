// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Yong Cong Sin <yongcong.sin@gmail.com>
// The multi-account statement app (docs/ARCHITECTURE.md, core/app/statement-app.js). It is
// inlined last and runs at load; it defines no global. It reads the provider's runtime object
// self.StatementProvider (D, with the switches in D.ui), the shared modules (StatementShell,
// StatementEscape, StatementStorage, StatementZip, StatementFiles, the readers the provider
// declares) and the composed namespace P = StatementExport + the provider's parser global.
//
// Derivation. Line numbers are those of the reference statement app (src/app.js at its
// legacyHead; docs/MIGRATION.md names it and the other six apps). This file is that app minus
// the parts moved into core modules, in its source order, so the event listeners are
// registered in the old order: the configurator (:275, :289), the downloads (:365-389), the
// input listeners (:420-431, StatementShell.wireInput), then setMode (:439). The markup is the
// old one (rendered through html and setHtml since step M8, below); each old variant comes from
// a switch:
//   READERS (D.inputs)         csv -> xlsx -> pdf among the declared inputs (filter :66, reading
//                              :49-63; the PDF + CSV app's :49-51, :68)
//   D.pdf.pageTransform        applied to each page's items as it is read (the transform app's :55)
//   U.busyNoun                 "Reading N <noun>(s)…", "Reading <noun>s… i/N" (:68, :78)
//   U.kindModel                F.modeOf (:44), bank stats and notes (:206-207, :218), the tag
//                              (:214) and "Auto (…)" (:263): "standard" uses KIND_LABEL;
//                              "investment-cash" has no bank branch and labels Investment or
//                              Cash-like (the investment-cash app's :43, :200-204, :210, :214,
//                              :256)
//   bank stats and notes       a.downloadOnly picks "Months" and notes.bankDownloadOnly (the
//                              PDF + CSV app's :209, :220-221; no other parser sets it)
//   U.notes                    the card notes (:217-222)
//   U.hideModeWithoutInvestments  true: the mode switch hides without investments (:236-237)
//   U.status                   "statements" (:296-297), "months" (the gen1 apps' :294),
//                              "statements+downloads" (the PDF + CSV app's :299-301, with
//                              U.text.downloadNoun)
//   U.text.gapWarning, U.text.partialWarning   after the core prefixes (:299-302)
//   U.openingsCurrency         first openings in the account's currency (:304) or
//                              r.baseCurrency ("base", the gen1 apps' :300); the noun is
//                              "download" without statements under "statements+downloads" (the
//                              PDF + CSV app's :307)
//   U.extraWarnings, U.unmappedNoun   r.warnings (:307) or r.unmapped (the investment-cash
//                              app's :298)
//   U.diagnostics              sections after "Rows not exported", in the order it lists them:
//                              reconciled (the gen1 apps' :309, :341-342), gaps (:313-315,
//                              :348-349), late (:316, :350-351), closed (the PDF + CSV app's
//                              :357-358)
//   U.skipDetailed, U.skipLabels, U.skippedOwner   the skipped-rows list (:320-327, :336)
//   D.naming, D.storage        file names via StatementFiles; storage keys via StatementStorage
// Rendering (migration step M8, docs/SECURITY.md): every render builds its markup with
// StatementEscape.html, which escapes each interpolated value, and assigns it with setHtml, the
// one innerHTML sink; the kind's class token goes through cssToken. The template text is the old
// markup character for character, and each old esc(v) is now a plain ${v}, so ordinary data
// gives the old DOM. What the old renders printed raw now renders as text: the card balance's
// currency (:209), the kind's class token (:214), the configurator's currency (:258), the first
// openings' and the reconciled list's currency (:304, the gen1 apps' :300, :342) and the range's
// option values (:94). Page text from the descriptor (notes, warning texts, nouns) is
// interpolated, so it is escaped too.
// Parse errors (migration step M9, docs/ARCHITECTURE.md, error conventions): recompute catches
// an exception of parseStatements. The previous result stays in state.result, with its cards,
// range and configurator untouched, the status adds the warn line "Could not read these
// statements: <message>", and addFiles clears the busy line as usual. The old pages showed
// nothing, and after a load their busy line stuck. The next parse that succeeds, or Clear,
// removes the line.
(function () {
  "use strict";
  const D = self.StatementProvider, U = D.ui;
  const { $, setBusy, fmtInt, fmtMoney, monthLabel, download } = self.StatementShell;      // :7, :105, :356-363, :434-437
  const { html, setHtml, cssToken } = self.StatementEscape;                                 // :435 (esc), and M8's html, setHtml, cssToken
  const P = Object.assign({}, self.StatementExport, self[D.parserGlobal]);                   // :6

  // The readers of the declared inputs, in the fixed order csv -> xlsx -> pdf.
  const READERS = ["csv", "xlsx", "pdf"].filter((k) => D.inputs.includes(k))
    .map((k) => ({ csv: self.StatementCsv, xlsx: self.StatementXlsx, pdf: self.StatementPdf })[k]);

  // pdf.js worker: the worker source is embedded in the page, so it works from file:// (:9-13).
  if (D.inputs.includes("pdf")) self.StatementPdf.init();

  // Export mode for investment accounts: "balance" (one transactions file with
  // month-end adjustments, the default), "tradelog" (the same plus every buy/sell
  // as a zero-amount line) or "holdings" (trades + transactions + month-end
  // balances). Cash-like accounts always use "balance".
  const MODE_IDS = D.modes.map((m) => m.id);
  // statements keyed by name+size; config: per account id { name, kind, mergeInto, exclude } (:21-22);
  // parseError: the message of the last parse, if it threw (M9)
  const state = { statements: new Map(), failed: [], result: null, parseError: null,
    mode: self.StatementStorage.loadMode(D.storage.modeKey, MODE_IDS), config: self.StatementStorage.loadConfig(D.storage.configKey) };

  const saveConfig = () => self.StatementStorage.saveConfig(D.storage.configKey, state.config);   // :27-29

  // :34-42
  function setMode(mode) {
    state.mode = mode;
    self.StatementStorage.saveMode(D.storage.modeKey, mode);
    for (const b of document.querySelectorAll("#mode button")) {
      b.classList.toggle("on", b.dataset.mode === mode);
      b.setAttribute("aria-checked", String(b.dataset.mode === mode));
    }
    render();
  }
  // :45-46
  const KIND_LABEL = { investment: "Investment", cash: "Cash-like", bank: "Bank" };
  const label = (name) => name;
  // The tag and "Auto (…)" label of a kind (:214, :263; the investment-cash app's :210, :256).
  const kindLabel = (kind) => (U.kindModel === "investment-cash" ? KIND_LABEL[kind === "investment" ? "investment" : "cash"] : KIND_LABEL[kind]);
  // M8: the markup of list.join(sep), each element rendered as html renders a value (an Html
  // value as it is, anything else escaped); sep is page text. It replaces the old renders'
  // list.map(esc).join(sep) and the joins of markup strings. orNone: a list of items, or the
  // old "none" item when it is empty (the old renders' list.join("") || "<li>none</li>").
  const joinHtml = (list, sep) => list.map((x, i) => (i ? html`${sep}${x}` : html`${x}`));
  const orNone = (items) => (items.length ? items : html`<li>none</li>`);

  // ---------- reading (:49-63; the PDF + CSV app's :49-51) ----------
  async function readStatement(file) {
    const r = READERS.find((x) => x.accepts(file));
    return r === self.StatementPdf ? r.read(file, D.pdf.pageTransform ? (items) => P[D.pdf.pageTransform](items) : null) : r.read(file);
  }

  // :65-82
  async function addFiles(fileList) {
    const files = [...fileList].filter((f) => READERS.some((r) => r.accepts(f)));
    if (!files.length) return;
    setBusy(`Reading ${files.length} ${U.busyNoun}${files.length > 1 ? "s" : ""}…`);
    let done = 0;
    for (const f of files) {
      const key = `${f.name}:${f.size}`;
      if (state.statements.has(key)) { done++; continue; }
      try {
        state.statements.set(key, await readStatement(f));
      } catch (e) {
        state.failed.push({ id: f.name, error: e && e.message ? e.message : String(e) });
      }
      setBusy(`Reading ${U.busyNoun}s… ${++done}/${files.length}`);
    }
    recompute();
    setBusy(null);
  }

  // :84-88. M9: a parse that throws leaves state.result as it was (the assignment never
  // happens) and renders only the status, with the error line; the caller goes on as usual.
  function recompute() {
    try {
      state.result = state.statements.size ? P.parseStatements([...state.statements.values()], state.config) : null;
    } catch (e) {
      state.parseError = e && e.message ? e.message : String(e);
      renderStatus(state.result);
      return;
    }
    state.parseError = null;
    fillRange(state.result ? state.result.months.map((m) => m.month) : []);
    render();
  }

  // ---------- range ----------
  // :90-103
  function fillRange(months) {
    for (const [sel, pick] of [[$("#from"), months[0]], [$("#to"), months[months.length - 1]]]) {
      const prev = sel.value;
      setHtml(sel, html`${months.map((m) => html`<option value="${m}">${monthLabel(m)}</option>`)}`);
      sel.value = months.includes(prev) ? prev : pick || "";
      sel.disabled = !months.length;
    }
  }
  const range = () => {
    let from = $("#from").value, to = $("#to").value;
    if (from && to && from > to) [from, to] = [to, from];
    return { from, to };
  };

  // ---------- what each account exports, and its files (:44, :104, :107-186: core/files.js) ----------
  const F = self.StatementFiles.create({ P, result: () => state.result, mode: () => state.mode, range, naming: D.naming, kindModel: U.kindModel });
  const { modeOf, earliest, exportsFor, fileFor, accountsFile, combinedFiles } = F;

  // ---------- rendering ----------
  // :188-238
  function render() {
    const r = state.result;
    $("#empty").hidden = !!r;
    $("#results").hidden = !r;
    renderStatus(r);
    if (!r) return;
    const cards = [];
    for (const [name, a] of Object.entries(r.accounts)) {
      const ex = exportsFor(name);
      if (!ex.files.length && !ex.vals.length) continue;
      const mode = modeOf(name);
      // Bank accounts get their own stats and note (:206-207, :218); the investment-cash
      // kind model has no bank branch.
      const bank = U.kindModel === "standard" && a.kind === "bank";
      const last = ex.vals[ex.vals.length - 1];
      const count = (kind) => (ex.files.find((f) => f.kind === kind) || { count: 0 }).count;
      const stats = mode === "holdings"
        ? [["Trades", count("trades")], ["Transactions", count("transactions")], ["Month-ends", ex.vals.length]]
        : mode === "tradelog"
        ? [["Trade lines", ex.tradeLines], ["Transactions", count("transactions")], ["Monthly adjustments", ex.adjustments]]
        : bank
        ? [["Transactions", count("transactions")], [a.downloadOnly ? "Months" : "Months reconciled", ex.vals.length - ex.problems.length]]
        : [["Transactions", count("transactions")], ["Monthly adjustments", ex.adjustments]];
      stats.push([`Balance ${last ? monthLabel(last[0].slice(0, 7)) : ""}`, last ? `${a.currency} ${fmtMoney(last[1])}` : "–"]);
      cards.push(html`
        <article class="card">
          <header>
            <h3>${label(name)}</h3>
            <span class="tag ${cssToken(a.kind)}">${kindLabel(a.kind)}</span>
          </header>
          <dl>${stats.map(([k, v]) => html`<div><dt>${k}</dt><dd>${typeof v === "number" ? fmtInt(v) : v}</dd></div>`)}</dl>
          <p class="note">${{
              balance: bank ? (a.downloadOnly ? U.notes.bankDownloadOnly : U.notes.bank) : U.notes.other,
              tradelog: U.notes.tradelog,
              holdings: U.notes.holdings,
            }[mode]}
            ${ex.balancing ? html` ${ex.balancing} balancing deposit/withdrawal entr${ex.balancing > 1 ? "ies" : "y"} where the statement omitted rows.` : ""}</p>
          ${ex.problems.map((p) => html`<p class="warn">${p}</p>`)}
          <div class="buttons">
            ${ex.files.map((f) => html`<button class="dl" data-account="${name}" data-kind="${f.kind}">${f.label}</button>`)}
          </div>
        </article>`);
    }
    setHtml($("#cards"), cards.length ? html`${cards}` : html`<p class="muted">No activity in the selected months.</p>`);
    $("#zip").disabled = !cards.length;
    $("#accounts").disabled = !cards.length;
    $("#combined").disabled = !cards.length;
    renderDiagnostics(r);
    renderAccounts(r);
    // The mode switch only matters for investment accounts.
    if (U.hideModeWithoutInvestments) $("#mode").closest(".field").hidden = !Object.values(r.accounts).some((a) => a.kind === "investment");
  }

  // :240-273
  // Account configurator: rename, change type, merge into another account, or
  // exclude. Detection is automatic; this only overrides it.
  function renderAccounts(r) {
    const ps = r.portfolios;
    const changed = ps.filter((p) => Object.keys(state.config[p.id] || {}).length).length;
    $("#config-count").textContent = `${ps.length} detected${changed ? `, ${changed} adjusted` : ""}`;
    const opt = (v, t, sel) => html`<option value="${v}"${sel ? html` selected` : ""}>${t}</option>`;
    setHtml($("#config-list"), html`${ps.map((p) => {
      const c = state.config[p.id] || {};
      const earlier = p.names.slice(0, -1);
      const history = !earlier.length ? ""
        : earlier.length <= 3 ? html`formerly ${joinHtml(earlier, ", ")}`
        : html`<span title="${earlier.join(" → ")}">formerly ${joinHtml(earlier.slice(0, 2), ", ")} and ${earlier.length - 2} more</span>`;
      const others = ps.filter((o) => o.id !== p.id && (state.config[o.id] || {}).mergeInto !== p.id);
      return html`
        <div class="account-row${c.exclude ? html` excluded` : ""}" data-id="${p.id}">
          <div class="p-head">
            <strong>${p.label}</strong>
            <span class="muted">${joinHtml([history, `${monthLabel(p.firstMonth)} – ${monthLabel(p.lastMonth)}`, p.currency].filter(Boolean), " · ")}</span>
          </div>
          <div class="p-controls">
            <label>Export as <input data-field="name" value="${c.name || ""}" placeholder="${p.label}"></label>
            <label>Type <select data-field="kind">
              ${opt("", `Auto (${kindLabel(p.kind)})`, !c.kind)}
              ${opt("investment", "Investment", c.kind === "investment")}${opt("cash", "Cash-like", c.kind === "cash")}
            </select></label>
            <label>Merge into <select data-field="mergeInto">
              ${opt("", "—", !c.mergeInto)}${others.map((o) => opt(o.id, o.label, c.mergeInto === o.id))}
            </select></label>
            <label class="check"><input type="checkbox" data-field="include"${c.exclude ? "" : html` checked`}> Export</label>
          </div>
        </div>`;
    })}`);
  }

  // :275-289
  $("#config-list").addEventListener("change", (e) => {
    const el = e.target.closest("[data-field]");
    const row = e.target.closest(".account-row");
    if (!el || !row) return;
    const c = { ...(state.config[row.dataset.id] || {}) };
    const field = el.dataset.field;
    if (field === "include") { if (el.checked) delete c.exclude; else c.exclude = true; }
    else if (el.value.trim()) c[field] = el.value.trim();
    else delete c[field];
    if (Object.keys(c).length) state.config[row.dataset.id] = c;
    else delete state.config[row.dataset.id];
    saveConfig();
    recompute();
  });
  $("#config-reset").addEventListener("click", () => { state.config = {}; saveConfig(); recompute(); });

  // :291-309; M9 adds the parse error as the last warn line
  function renderStatus(r) {
    const el = $("#status");
    if (!r && !state.failed.length && !state.parseError) { setHtml(el, html``); return; }
    const months = r ? r.months.map((m) => m.month) : [];
    const parts = [];
    if (U.status === "months") {
      // The count is the number of months (the gen1 apps' :294).
      if (months.length) parts.push(html`<strong>${months.length}</strong> statement${months.length > 1 ? "s" : ""}, ${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`);
    } else if (U.status === "statements+downloads") {
      // Statements and downloads counted apart (the PDF + CSV app's :299-301).
      const n = r ? r.statements : 0, d = r ? r.downloads : 0;
      const loaded = [n && html`<strong>${n}</strong> statement${n > 1 ? "s" : ""}`, d && html`<strong>${d}</strong> ${U.text.downloadNoun}${d > 1 ? "s" : ""}`].filter(Boolean);
      if (months.length) parts.push(html`${joinHtml(loaded, " and ")}, ${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`);
    } else {
      const n = r ? r.statements : 0;
      if (months.length) parts.push(html`<strong>${n}</strong> statement${n > 1 ? "s" : ""}, ${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`);
    }
    const warn = [];
    if (r && r.gaps.length) warn.push(html`Missing statement${r.gaps.length > 1 ? "s" : ""}: ${r.gaps.map(monthLabel).join(", ")}. ${U.text.gapWarning}`);
    if (r && r.partialMonths && r.partialMonths.length) warn.push(html`Statement${r.partialMonths.length > 1 ? "s" : ""} for ${r.partialMonths.map(monthLabel).join(", ")} ${U.text.partialWarning}`);
    if (r && r.firstOpenings.length) warn.push(html`Your earliest ${U.status === "statements+downloads" ? (r.statements ? "statement" : "download") : "statement"} (${monthLabel(r.firstOpenings[0].month)}) opens with existing balances: ${
      joinHtml(r.firstOpenings.map((o) => html`${label(o.account)} ${U.openingsCurrency === "base" ? r.baseCurrency : r.accounts[o.account].currency} ${fmtMoney(o.opening)}`), ", ")
    }. Start those accounts at these balances in your app, or add earlier statements.`);
    for (const e of [...(r ? r.errors : []), ...state.failed]) warn.push(html`${e.id}: ${e.error}`);
    if (U.extraWarnings === "unmapped") {
      // Unrecognised names instead of warnings (the investment-cash app's :298).
      if (r && Object.keys(r.unmapped).length) warn.push(html`Unrecognised ${U.unmappedNoun}${Object.keys(r.unmapped).length > 1 ? "s" : ""} (not exported): ${joinHtml(Object.keys(r.unmapped), ", ")}`);
    } else if (r && r.warnings.length) warn.push(html`Check these against your statements: ${joinHtml(r.warnings, "; ")}`);
    if (state.parseError) warn.push(html`Could not read these statements: ${state.parseError}`);
    setHtml(el, html`<p>${parts}</p>${warn.map((w) => html`<p class="warn">${w}</p>`)}`);
  }

  // :311-353
  function renderDiagnostics(r) {
    const { from, to } = range();
    const has = (k) => U.diagnostics.includes(k);
    // Computed before the skipped rows, as the old apps did: reconciled (the gen1 apps' :309),
    // gaps (:313-315), late (:316). closed is read in its section (the PDF + CSV app's :358).
    const rec = !has("reconciled") ? [] : r.reconciled.filter((x) => P.inRange(x.month + "-01", from, to));
    const gapRows = !has("gaps") ? [] : Object.keys(r.accounts).filter((name) => exportsFor(name).files.length)
      .flatMap((name) => P.adjustedEntries(r.accounts[name], from, to, earliest()).entries.filter((e) => e.kind === "gap").map((e) => ({ ...e, account: name })))
      .sort((a, b) => a.date.localeCompare(b.date));
    const late = !has("late") ? [] : (r.late || []).filter((x) => P.inRange(x.month + "-01", from, to));
    // Skipped rows in the selected months, by category. Categories where the
    // description matters (unrecognised types, rows without an amount) list each
    // distinct description with its count and accounts.
    const DETAILED = new Set(U.skipDetailed);
    const LABELS = U.skipLabels;
    const groups = {};
    for (const row of r.skippedRows.filter((x) => P.inRange(x.date, from, to))) (groups[row.category] = groups[row.category] || []).push(row);
    const skipped = Object.entries(groups).sort(([a], [b]) => (a === "unknown") - (b === "unknown") || a.localeCompare(b)).map(([cat, rows]) => {
      let sub = "";
      if (DETAILED.has(cat)) {
        const byDetail = {};
        for (const x of rows) {
          const d = (byDetail[x.detail || "(no description)"] = byDetail[x.detail || "(no description)"] || { n: 0, where: new Set(), months: new Set() });
          d.n++; if (x[U.skippedOwner]) d.where.add(x[U.skippedOwner]); d.months.add(x.date.slice(0, 7));
        }
        sub = html`<ul>${Object.entries(byDetail).sort(([, a], [, b]) => b.n - a.n).map(([detail, d]) =>
          html`<li>${detail} ×${fmtInt(d.n)} <span class="muted">(${joinHtml([...d.where], ", ")}; ${[...d.months].sort().map(monthLabel).join(", ")})</span></li>`)}</ul>`;
      }
      return html`<li${cat === "unknown" ? html` class="warn-item"` : ""}>${LABELS[cat] || cat}: ${fmtInt(rows.length)}${sub}</li>`;
    });
    // The sections after "Rows not exported", each one's markup as its old template lines.
    const section = {
      reconciled: () => html`
        <p>Balancing entries, added where a statement's Cashflow figure differs from its itemised deposits and withdrawals:</p>
        <ul>${orNone(rec.map((x) => html`<li>${monthLabel(x.month)} · ${label(x.account)} · ${x.diff > 0 ? "+" : ""}${fmtMoney(x.diff)} ${r.baseCurrency}</li>`))}</ul>`,
      gaps: () => html`
        <p>Balance changes not covered by the loaded statements (one entry each, so later balances stay right):</p>
        <ul>${orNone(gapRows.map((x) => html`<li>${x.date} · ${label(x.account)} · ${-x.amount > 0 ? "+" : ""}${fmtMoney(-x.amount)} ${x.currency}</li>`))}</ul>`,
      late: () => html`
        <p>Rows dated in one month but first listed on a later statement (kept on their date, counted in that month):</p>
        <ul>${orNone(late.map((x) => html`<li>${monthLabel(x.month)} · ${x.account} · ${-x.amount > 0 ? "+" : ""}${fmtMoney(-x.amount)} <span class="muted">(on the ${monthLabel(x.statement)} statement)</span></li>`))}</ul>`,
      closed: () => html`
        <p>Accounts no longer on the statements with money left in them (taken to 0 by the first statement without them):</p>
        <ul>${orNone((r.closed || []).map((x) => html`<li>${x.account} · ${fmtMoney(x.balance)} <span class="muted">(gone from ${monthLabel(x.month)})</span></li>`))}</ul>`,
    };
    setHtml($("#diagnostics"), html`
      <details>
        <summary>What was skipped or adjusted</summary>
        <p>Rows not exported in the selected months:</p>
        <ul>${orNone(skipped)}</ul>${U.diagnostics.map((k) => section[k]())}
      </details>`);
  }

  // ---------- downloads (:355-389; the zip writer :391-418 is core/zip.js) ----------
  $("#cards").addEventListener("click", (e) => {
    const b = e.target.closest("button.dl");
    if (!b) return;
    const f = fileFor(b.dataset.account, b.dataset.kind);
    download(f.name, new Blob([f.text], { type: "text/csv" }));
  });

  $("#accounts").addEventListener("click", () => {
    const f = accountsFile();
    download(f.name, new Blob([f.text], { type: "text/csv" }));
  });

  $("#combined").addEventListener("click", () => {
    const files = combinedFiles();
    if (files.length === 1) return download(files[0].name, new Blob([files[0].text], { type: "text/csv" }));
    download(F.zipName("combined"), self.StatementZip.zip(files));
  });

  // Download all scans the rendered card buttons, as the old page did.
  $("#zip").addEventListener("click", () => {
    const files = [accountsFile()];
    for (const b of document.querySelectorAll("#cards button.dl")) files.push(fileFor(b.dataset.account, b.dataset.kind));
    download(F.zipName("csv"), self.StatementZip.zip(files));
  });

  // ---------- input (:420-431) ----------
  self.StatementShell.wireInput({ onFiles: addFiles, onMode: setMode, onRange: render,
    onClear: () => { state.statements.clear(); state.failed = []; recompute(); } });

  // :439
  setMode(state.mode);
})();
