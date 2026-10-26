(() => {
  "use strict";

  const STORAGE_KEY = "trading-rules-checkbook:v1";
  const MAX_SHOT_WIDTH = 1920;

  // ---------- State ----------
  const defaultState = () => ({
    strategies: [
      {
        id: uid(),
        name: "Trend Pullback",
        description: "Example strategy — edit or delete it.",
        rules: [
          "Higher-timeframe trend is clear",
          "Price pulled back to key level / moving average",
          "Confirmation candle formed",
          "Risk:Reward is at least 1:2",
          "Position size within max risk per trade",
        ].map((text) => ({ id: uid(), text })),
      },
    ],
    trades: [],
  });

  let state = load();
  const ui = {
    selected: new Set(), // strategy ids selected on the checklist
    checked: new Set(), // "strategyId:ruleId" keys that are ticked
    editingId: state.strategies[0]?.id ?? null,
    pendingShots: [], // data URLs attached to the trade being prepared
    view: "checklist",
    tradeId: null, // trade shown in the detail view
  };
  const shots = new Map(); // screenshot id -> data URL (mirrors IndexedDB)

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.strategies) && Array.isArray(parsed.trades)) return parsed;
      }
    } catch (_) { /* storage unavailable or corrupt — fall back to defaults */ }
    return defaultState();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      toast("Could not save — browser storage is unavailable");
    }
  }

  // ---------- Screenshot storage (IndexedDB; images are too big for localStorage) ----------
  const idb = new Promise((resolve) => {
    try {
      const req = indexedDB.open("trading-rules-checkbook", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("screenshots");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });

  async function idbRun(mode, fn) {
    const db = await idb;
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction("screenshots", mode);
      const req = fn(tx.objectStore("screenshots"));
      tx.oncomplete = () => resolve(req?.result ?? null);
      tx.onerror = () => resolve(null);
    });
  }

  async function loadShots() {
    const db = await idb;
    if (!db) return;
    await new Promise((resolve) => {
      const req = db.transaction("screenshots").objectStore("screenshots").openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve();
        shots.set(cur.key, cur.value);
        cur.continue();
      };
      req.onerror = () => resolve();
    });
  }

  async function putShot(dataUrl) {
    const id = uid();
    shots.set(id, dataUrl);
    const db = await idb;
    if (!db) toast("Screenshot storage is unavailable — images last only until you close the page");
    await idbRun("readwrite", (store) => store.put(dataUrl, id));
    return id;
  }

  function deleteShot(id) {
    shots.delete(id);
    idbRun("readwrite", (store) => store.delete(id));
  }

  // Downscale big screenshots so storage doesn't fill up.
  async function imageToDataUrl(file) {
    const src = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = src;
      });
      const scale = Math.min(1, MAX_SHOT_WIDTH / img.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const jpeg = canvas.toDataURL("image/jpeg", 0.85);
      return jpeg.length < src.length ? jpeg : src;
    } catch (_) {
      return src;
    }
  }

  async function readImages(files) {
    const images = [...files].filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      toast("Only image files can be added as screenshots");
      return [];
    }
    return Promise.all(images.map(imageToDataUrl));
  }

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const byId = (id) => state.strategies.find((s) => s.id === id);
  const tradeById = (id) => state.trades.find((t) => t.id === id);

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null) continue;
      node.append(c instanceof Node ? c : document.createTextNode(c));
    }
    return node;
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function askConfirm(msg) {
    return new Promise((resolve) => {
      const modal = $("#modal");
      $("#modal-msg").textContent = msg;
      modal.hidden = false;
      $("#modal-ok").focus();
      const done = (val) => {
        modal.hidden = true;
        $("#modal-ok").onclick = $("#modal-cancel").onclick = null;
        resolve(val);
      };
      $("#modal-ok").onclick = () => done(true);
      $("#modal-cancel").onclick = () => done(false);
    });
  }

  function openLightbox(src) {
    $("#lightbox-img").src = src;
    $("#lightbox").hidden = false;
  }
  $("#lightbox").addEventListener("click", () => { $("#lightbox").hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") $("#lightbox").hidden = true;
  });

  function verdictFor(pct, total) {
    if (total === 0) return { cls: "neutral", text: "Select a strategy to begin" };
    if (pct === 100) return { cls: "go", text: "✅ 100% met — you can take the trade" };
    if (pct >= 70) return { cls: "wait", text: `⚠️ ${pct}% met — wait, not all rules are met` };
    return { cls: "stop", text: `⛔ ${pct}% met — do NOT take this trade` };
  }
  const pillClass = (pct) => (pct === 100 ? "go" : pct >= 70 ? "wait" : "stop");

  function fillColor(pct) {
    if (pct === 100) return "var(--green)";
    if (pct >= 70) return "var(--yellow)";
    if (pct >= 40) return "var(--orange)";
    return "var(--red)";
  }

  const shareBase = () => location.href.split("#")[0];
  const tradeLink = (id) => `${shareBase()}#trade-${id}`;

  // Renders a grid of screenshot tiles; onRemove is optional.
  function shotGrid(sources, onRemove, large = false) {
    return el("div", { class: "shots" + (large ? " large" : "") },
      sources.map((src, i) =>
        el("div", { class: "shot" },
          el("img", { src, alt: `Screenshot ${i + 1}`, onclick: () => openLightbox(src) }),
          onRemove
            ? el("button", {
                class: "remove", type: "button", title: "Remove screenshot",
                onclick: (e) => { e.stopPropagation(); onRemove(i); },
              }, "✕")
            : null
        )
      )
    );
  }

  // ---------- Routing (each view and each trade has its own #link) ----------
  function route() {
    const hash = location.hash.slice(1);
    if (hash.startsWith("trade-")) {
      ui.view = "trade";
      ui.tradeId = hash.slice(6);
    } else {
      ui.view = ["checklist", "strategies", "journal"].includes(hash) ? hash : "checklist";
    }
    const tabView = ui.view === "trade" ? "journal" : ui.view;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === tabView));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === "view-" + ui.view));
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);

  // ---------- Checklist view ----------
  function activeRules() {
    const items = [];
    for (const s of state.strategies) {
      if (!ui.selected.has(s.id)) continue;
      for (const r of s.rules) items.push({ key: `${s.id}:${r.id}`, strategy: s, rule: r });
    }
    return items;
  }

  function score() {
    const items = activeRules();
    const met = items.filter((i) => ui.checked.has(i.key)).length;
    const total = items.length;
    const pct = total ? Math.round((met / total) * 100) : 0;
    return { items, met, total, pct };
  }

  function renderChecklist() {
    // drop selections that point at deleted strategies / rules
    for (const id of [...ui.selected]) if (!byId(id)) ui.selected.delete(id);
    const validKeys = new Set(activeRules().map((i) => i.key));
    for (const k of [...ui.checked]) if (!validKeys.has(k)) ui.checked.delete(k);

    const picker = $("#strategy-picker");
    picker.replaceChildren();
    if (!state.strategies.length) {
      picker.append(el("p", { class: "hint" }, "No strategies yet — add one in the Strategies & Rules tab."));
    }
    for (const s of state.strategies) {
      picker.append(
        el("button", {
          class: "chip" + (ui.selected.has(s.id) ? " selected" : ""),
          type: "button",
          onclick: () => {
            ui.selected.has(s.id) ? ui.selected.delete(s.id) : ui.selected.add(s.id);
            renderChecklist();
          },
        }, s.name, el("span", { class: "count" }, `${s.rules.length}`))
      );
    }

    const list = $("#checklist");
    list.replaceChildren();
    const selected = state.strategies.filter((s) => ui.selected.has(s.id));
    if (!selected.length) {
      list.append(el("p", { class: "hint" }, "Your rules will appear here once you select a strategy."));
    }
    for (const s of selected) {
      const done = s.rules.filter((r) => ui.checked.has(`${s.id}:${r.id}`)).length;
      const group = el("div", { class: "checklist-group" },
        el("div", { class: "checklist-group-title" },
          el("span", {}, s.name),
          el("span", { class: "muted" }, `${done}/${s.rules.length}`)
        )
      );
      if (!s.rules.length) group.append(el("p", { class: "hint" }, "This strategy has no rules yet."));
      for (const r of s.rules) {
        const key = `${s.id}:${r.id}`;
        const isChecked = ui.checked.has(key);
        group.append(
          el("label", { class: "check-item" + (isChecked ? " checked" : "") },
            el("input", {
              type: "checkbox",
              checked: isChecked,
              onchange: (e) => {
                e.target.checked ? ui.checked.add(key) : ui.checked.delete(key);
                renderChecklist();
              },
            }),
            el("span", {}, r.text)
          )
        );
      }
      list.append(group);
    }

    renderPendingShots();
    renderGauge();
  }

  function renderPendingShots() {
    $("#shot-previews").replaceWith(
      Object.assign(shotGrid(ui.pendingShots, (i) => { ui.pendingShots.splice(i, 1); renderPendingShots(); }), {
        id: "shot-previews",
      })
    );
  }

  function renderGauge() {
    const { items, met, total, pct } = score();
    $("#gauge-fill").style.width = pct + "%";
    $("#gauge-fill").style.background = fillColor(pct);
    $("#gauge-pct").textContent = pct;
    $("#gauge-count").textContent = `${met} / ${total} rules`;

    const v = verdictFor(pct, total);
    const verdict = $("#verdict");
    verdict.className = "verdict " + v.cls;
    verdict.textContent = v.text;

    const missing = items.filter((i) => !ui.checked.has(i.key));
    const wrap = $("#missing-wrap");
    wrap.classList.toggle("hidden", !total || !missing.length);
    $("#missing-list").replaceChildren(
      ...missing.map((i) =>
        el("li", {}, i.rule.text, " ", ui.selected.size > 1 ? el("small", {}, `(${i.strategy.name})`) : null)
      )
    );

    $("#btn-log-trade").disabled = total === 0;
  }

  async function addPendingShots(files) {
    ui.pendingShots.push(...(await readImages(files)));
    renderPendingShots();
  }

  $("#shot-input").addEventListener("change", (e) => {
    addPendingShots(e.target.files);
    e.target.value = "";
  });

  const drop = $("#shot-drop");
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    addPendingShots(e.dataTransfer.files);
  });

  // Paste a screenshot straight from the clipboard (e.g. after Win+Shift+S / Cmd+Ctrl+Shift+4)
  document.addEventListener("paste", (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    if (ui.view === "checklist") {
      e.preventDefault();
      addPendingShots(files).then(() => toast("Screenshot added"));
    } else if (ui.view === "trade" && tradeById(ui.tradeId)) {
      e.preventDefault();
      addShotsToTrade(tradeById(ui.tradeId), files).then(() => toast("Screenshot added"));
    }
  });

  $("#btn-reset").addEventListener("click", () => {
    ui.checked.clear();
    renderChecklist();
  });

  $("#btn-log-trade").addEventListener("click", async () => {
    const { items, met, total, pct } = score();
    if (!total) return;
    if (pct < 100 && !(await askConfirm(`Only ${pct}% of your rules are met. Log this trade anyway?`))) return;

    const timeInput = $("#trade-time").value;
    const selected = state.strategies.filter((s) => ui.selected.has(s.id));
    const trade = {
      id: uid(),
      date: (timeInput ? new Date(timeInput) : new Date()).toISOString(),
      symbol: $("#trade-symbol").value.trim().toUpperCase() || "—",
      direction: $("#trade-direction").value,
      strategies: selected.map((s) => s.name),
      // snapshot of every rule and whether it was met, so later rule edits don't change history
      checks: selected.map((s) => ({
        strategy: s.name,
        rules: s.rules.map((r) => ({ text: r.text, met: ui.checked.has(`${s.id}:${r.id}`) })),
      })),
      met,
      total,
      pct,
      missing: items.filter((i) => !ui.checked.has(i.key)).map((i) => i.rule.text),
      notes: $("#trade-notes").value.trim(),
      screenshots: [],
    };
    for (const src of ui.pendingShots) trade.screenshots.push(await putShot(src));
    state.trades.unshift(trade);
    save();

    ui.checked.clear();
    ui.pendingShots = [];
    $("#trade-symbol").value = "";
    $("#trade-notes").value = "";
    $("#trade-time").value = "";
    renderChecklist();
    toast("Trade logged — open it from the Trade Log");
  });

  // ---------- Strategies view ----------
  function renderStrategies() {
    if (ui.editingId && !byId(ui.editingId)) ui.editingId = state.strategies[0]?.id ?? null;

    const list = $("#strategy-list");
    list.replaceChildren();
    if (!state.strategies.length) list.append(el("li", { class: "muted" }, "No strategies yet."));
    for (const s of state.strategies) {
      list.append(
        el("li", {
          class: s.id === ui.editingId ? "active" : "",
          onclick: () => { ui.editingId = s.id; renderStrategies(); },
        },
          el("span", {}, s.name),
          el("span", { class: "meta" }, `${s.rules.length} rule${s.rules.length === 1 ? "" : "s"}`)
        )
      );
    }

    const s = byId(ui.editingId);
    $("#rules-empty").classList.toggle("hidden", !!s);
    $("#rules-panel").classList.toggle("hidden", !s);
    if (!s) return;

    const nameInput = $("#strategy-name-edit");
    if (document.activeElement !== nameInput) nameInput.value = s.name;
    const descInput = $("#strategy-desc-edit");
    if (document.activeElement !== descInput) descInput.value = s.description || "";

    const rules = $("#rule-list");
    rules.replaceChildren();
    if (!s.rules.length) rules.append(el("p", { class: "hint" }, "No rules yet — add your first one above."));
    s.rules.forEach((r, idx) => {
      rules.append(
        el("li", {},
          el("input", {
            type: "text",
            value: r.text,
            "aria-label": "Rule text",
            onchange: (e) => {
              const text = e.target.value.trim();
              if (text) r.text = text; else e.target.value = r.text;
              save();
            },
          }),
          el("button", {
            class: "icon-btn", type: "button", title: "Move up", disabled: idx === 0,
            onclick: () => { move(s.rules, idx, -1); save(); renderStrategies(); },
          }, "↑"),
          el("button", {
            class: "icon-btn", type: "button", title: "Move down", disabled: idx === s.rules.length - 1,
            onclick: () => { move(s.rules, idx, 1); save(); renderStrategies(); },
          }, "↓"),
          el("button", {
            class: "icon-btn del", type: "button", title: "Delete rule",
            onclick: () => { s.rules.splice(idx, 1); save(); renderStrategies(); },
          }, "✕")
        )
      );
    });
  }

  function move(arr, idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
  }

  $("#form-add-strategy").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#new-strategy-name");
    const name = input.value.trim();
    if (!name) return;
    const s = { id: uid(), name, description: "", rules: [] };
    state.strategies.push(s);
    ui.editingId = s.id;
    input.value = "";
    save();
    renderStrategies();
    $("#new-rule-text").focus();
  });

  $("#form-add-rule").addEventListener("submit", (e) => {
    e.preventDefault();
    const s = byId(ui.editingId);
    const input = $("#new-rule-text");
    const text = input.value.trim();
    if (!s || !text) return;
    s.rules.push({ id: uid(), text });
    input.value = "";
    save();
    renderStrategies();
    input.focus();
  });

  $("#strategy-name-edit").addEventListener("input", (e) => {
    const s = byId(ui.editingId);
    if (!s) return;
    const name = e.target.value.trim();
    if (name) { s.name = name; save(); renderStrategies(); }
  });

  $("#strategy-desc-edit").addEventListener("input", (e) => {
    const s = byId(ui.editingId);
    if (!s) return;
    s.description = e.target.value;
    save();
  });

  $("#btn-delete-strategy").addEventListener("click", async () => {
    const s = byId(ui.editingId);
    if (!s || !(await askConfirm(`Delete strategy "${s.name}" and all its rules?`))) return;
    state.strategies = state.strategies.filter((x) => x.id !== s.id);
    ui.selected.delete(s.id);
    ui.editingId = state.strategies[0]?.id ?? null;
    save();
    renderStrategies();
  });

  // ---------- Journal view ----------
  function renderJournal() {
    const trades = state.trades;
    $("#journal-empty").classList.toggle("hidden", trades.length > 0);
    $("#journal-table").classList.toggle("hidden", trades.length === 0);

    const followed = trades.filter((t) => t.pct === 100).length;
    $("#journal-stats").replaceChildren(
      ...(trades.length
        ? [
            el("div", { class: "stat" }, el("b", {}, String(trades.length)), el("span", {}, "Trades logged")),
            el("div", { class: "stat" }, el("b", {}, String(followed)), el("span", {}, "All rules met")),
            el("div", { class: "stat" },
              el("b", {}, Math.round((followed / trades.length) * 100) + "%"),
              el("span", {}, "Discipline score")
            ),
          ]
        : [])
    );

    $("#journal-body").replaceChildren(
      ...trades.map((t) => {
        const ids = (t.screenshots || []).filter((id) => shots.has(id));
        return el("tr", { onclick: () => { location.hash = "trade-" + t.id; } },
          el("td", {}, new Date(t.date).toLocaleString()),
          el("td", {}, el("b", {}, t.symbol)),
          el("td", {}, t.direction),
          el("td", {}, t.strategies.join(", ")),
          el("td", { title: t.missing.length ? "Missing: " + t.missing.join("; ") : "All rules met" },
            el("span", { class: "pill " + pillClass(t.pct) }, `${t.pct}%`), ` ${t.met}/${t.total}`
          ),
          el("td", {},
            ids.length
              ? el("div", { class: "thumbs" },
                  ids.slice(0, 2).map((id) => el("img", { src: shots.get(id), alt: "" })),
                  ids.length > 2 ? el("span", { class: "more" }, `+${ids.length - 2}`) : null
                )
              : el("span", { class: "muted" }, "—")
          ),
          el("td", {},
            el("a", { class: "view-link", href: "#trade-" + t.id, onclick: (e) => e.stopPropagation() }, "View →")
          )
        );
      })
    );
  }

  // ---------- Trade detail view ----------
  async function addShotsToTrade(trade, files) {
    const added = await readImages(files);
    trade.screenshots = trade.screenshots || [];
    for (const src of added) trade.screenshots.push(await putShot(src));
    save();
    renderTrade();
  }

  function renderTrade() {
    const root = $("#trade-detail");
    const t = tradeById(ui.tradeId);
    if (!t) {
      root.replaceChildren(
        el("a", { class: "back-link", href: "#journal" }, "← Back to trade log"),
        el("div", { class: "card empty" }, "This trade doesn't exist in this browser. It may have been deleted.")
      );
      return;
    }

    const idx = state.trades.indexOf(t);
    const newer = state.trades[idx - 1];
    const older = state.trades[idx + 1];
    const date = new Date(t.date);
    const ids = (t.screenshots || []).filter((id) => shots.has(id));
    const link = tradeLink(t.id);
    const v = verdictFor(t.pct, t.total);

    const linkInput = el("input", { type: "text", readonly: true, value: link, id: "trade-link", "aria-label": "Link to this trade" });

    // Older trades were logged before the full rule snapshot existed; show what we have.
    const checks = t.checks || [{
      strategy: t.strategies.join(", "),
      rules: t.missing.map((text) => ({ text, met: false })),
    }];

    root.replaceChildren(
      el("a", { class: "back-link", href: "#journal" }, "← Back to trade log"),
      el("div", { class: "card" },
        el("div", { class: "detail-head" },
          el("div", {},
            el("h2", {}, t.symbol, el("span", { class: "pill " + pillClass(t.pct) }, `${t.pct}% met`)),
            el("div", { class: "when" }, date.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" }))
          ),
          el("button", {
            class: "btn danger small", type: "button",
            onclick: async () => {
              if (!(await askConfirm(`Delete the ${t.symbol} trade and its screenshots?`))) return;
              (t.screenshots || []).forEach(deleteShot);
              state.trades = state.trades.filter((x) => x.id !== t.id);
              save();
              location.hash = "journal";
            },
          }, "Delete trade")
        ),

        el("div", { class: "facts" },
          el("div", { class: "fact" }, el("span", {}, "Direction"), el("b", {}, t.direction)),
          el("div", { class: "fact" }, el("span", {}, "Strategies"), el("b", {}, t.strategies.join(", ") || "—")),
          el("div", { class: "fact" }, el("span", {}, "Rules met"), el("b", {}, `${t.met} of ${t.total}`)),
          el("div", { class: "fact" }, el("span", {}, "Screenshots"), el("b", {}, String(ids.length)))
        ),
        el("div", { class: "verdict " + v.cls }, v.text.replace(/ — .*/, "") + (t.pct === 100 ? " — taken with all rules met" : " — taken without all rules met")),

        el("label", { for: "trade-link" }, "Link to this trade"),
        el("div", { class: "link-row" },
          linkInput,
          el("button", {
            class: "btn small", type: "button",
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(link);
                toast("Link copied");
              } catch (_) {
                linkInput.select();
                toast("Press Ctrl+C to copy the selected link");
              }
            },
          }, "Copy link")
        )
      ),

      el("div", { class: "detail-grid" },
        el("div", { class: "card" },
          el("h2", {}, "Rules checklist"),
          checks.map((c) =>
            el("div", {},
              el("h3", {}, c.strategy),
              el("ul", { class: "rule-result" },
                c.rules.map((r) =>
                  el("li", { class: r.met ? "ok" : "no" },
                    el("span", { class: "mark" }, r.met ? "✓" : "✗"),
                    el("span", { class: "txt" }, r.text)
                  )
                )
              )
            )
          ),

          el("h2", {}, "Notes"),
          el("textarea", {
            id: "detail-notes", rows: 5, placeholder: "Add notes: entry, exit, result, lessons…",
            oninput: (e) => { t.notes = e.target.value; save(); },
          }, t.notes || "")
        ),

        el("div", { class: "card" },
          el("h2", {}, "Screenshots"),
          ids.length
            ? shotGrid(ids.map((id) => shots.get(id)), async (i) => {
                if (!(await askConfirm("Remove this screenshot?"))) return;
                const id = ids[i];
                t.screenshots = t.screenshots.filter((x) => x !== id);
                deleteShot(id);
                save();
                renderTrade();
              }, true)
            : el("p", { class: "hint" }, "No screenshots for this trade yet."),
          el("label", { class: "dropzone", style: "margin-top: 0.75rem" },
            el("input", {
              type: "file", accept: "image/*", multiple: true, id: "detail-shot-input",
              onchange: (e) => { addShotsToTrade(t, e.target.files); e.target.value = ""; },
            }),
            el("span", {}, el("b", {}, "Add screenshot"), " — click, or paste (Ctrl+V) while on this page")
          )
        )
      ),

      el("div", { class: "pager" },
        newer ? el("a", { class: "btn ghost small", href: "#trade-" + newer.id }, `← Newer: ${newer.symbol}`) : el("span"),
        older ? el("a", { class: "btn ghost small", href: "#trade-" + older.id }, `Older: ${older.symbol} →`) : el("span")
      )
    );
  }

  // ---------- Export / import ----------
  function exportPayload() {
    const screenshots = {};
    for (const t of state.trades) {
      for (const id of t.screenshots || []) if (shots.has(id)) screenshots[id] = shots.get(id);
    }
    return JSON.stringify({ ...state, screenshots }, null, 2);
  }

  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([exportPayload()], { type: "application/json" });
    const a = el("a", {
      href: URL.createObjectURL(blob),
      download: `trading-rules-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  });

  $("#file-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.strategies) || !Array.isArray(data.trades)) throw new Error("bad shape");
      if (!(await askConfirm("Replace your current strategies and trade log with the imported file?"))) return;
      const { screenshots = {}, ...rest } = data;
      for (const id of [...shots.keys()]) deleteShot(id);
      for (const [id, src] of Object.entries(screenshots)) {
        shots.set(id, src);
        await idbRun("readwrite", (store) => store.put(src, id));
      }
      state = rest;
      ui.selected.clear();
      ui.checked.clear();
      ui.editingId = state.strategies[0]?.id ?? null;
      save();
      render();
      toast("Data imported");
    } catch (_) {
      toast("That file is not a valid checkbook export");
    }
  });

  // ---------- Boot ----------
  function render() {
    if (ui.view === "checklist") renderChecklist();
    if (ui.view === "strategies") renderStrategies();
    if (ui.view === "journal") renderJournal();
    if (ui.view === "trade") renderTrade();
  }

  loadShots().finally(route);
})();
