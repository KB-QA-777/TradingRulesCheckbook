(() => {
  "use strict";

  const STORAGE_KEY = "trading-rules-checkbook:v1";

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
  };

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

  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const byId = (id) => state.strategies.find((s) => s.id === id);

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
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function verdictFor(pct, total) {
    if (total === 0) return { cls: "neutral", text: "Select a strategy to begin" };
    if (pct === 100) return { cls: "go", text: "✅ 100% met — you can take the trade" };
    if (pct >= 70) return { cls: "wait", text: `⚠️ ${pct}% met — wait, not all rules are met` };
    return { cls: "stop", text: `⛔ ${pct}% met — do NOT take this trade` };
  }

  function fillColor(pct) {
    if (pct === 100) return "var(--green)";
    if (pct >= 70) return "var(--yellow)";
    if (pct >= 40) return "var(--orange)";
    return "var(--red)";
  }

  // ---------- Tabs ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".view").forEach((v) =>
        v.classList.toggle("active", v.id === "view-" + tab.dataset.view)
      );
      render();
    });
  });

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

    renderGauge();
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

  $("#btn-reset").addEventListener("click", () => {
    ui.checked.clear();
    renderChecklist();
  });

  $("#btn-log-trade").addEventListener("click", () => {
    const { items, met, total, pct } = score();
    if (!total) return;
    if (pct < 100 && !confirm(`Only ${pct}% of your rules are met. Log this trade anyway?`)) return;

    state.trades.unshift({
      id: uid(),
      date: new Date().toISOString(),
      symbol: $("#trade-symbol").value.trim().toUpperCase() || "—",
      direction: $("#trade-direction").value,
      strategies: state.strategies.filter((s) => ui.selected.has(s.id)).map((s) => s.name),
      met,
      total,
      pct,
      missing: items.filter((i) => !ui.checked.has(i.key)).map((i) => i.rule.text),
      notes: $("#trade-notes").value.trim(),
    });
    save();

    ui.checked.clear();
    $("#trade-symbol").value = "";
    $("#trade-notes").value = "";
    renderChecklist();
    toast("Trade logged");
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

  $("#btn-delete-strategy").addEventListener("click", () => {
    const s = byId(ui.editingId);
    if (!s || !confirm(`Delete strategy "${s.name}" and all its rules?`)) return;
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
        const v = t.pct === 100 ? "go" : t.pct >= 70 ? "wait" : "stop";
        return el("tr", {},
          el("td", {}, new Date(t.date).toLocaleString()),
          el("td", {}, t.symbol),
          el("td", {}, t.direction),
          el("td", {}, t.strategies.join(", ")),
          el("td", { title: t.missing.length ? "Missing: " + t.missing.join("; ") : "All rules met" },
            el("span", { class: "pill " + v }, `${t.pct}%`), ` ${t.met}/${t.total}`
          ),
          el("td", {}, t.notes || ""),
          el("td", {},
            el("button", {
              class: "icon-btn del", type: "button", title: "Delete entry",
              onclick: () => {
                if (!confirm("Delete this trade entry?")) return;
                state.trades = state.trades.filter((x) => x.id !== t.id);
                save();
                renderJournal();
              },
            }, "✕")
          )
        );
      })
    );
  }

  $("#btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
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
      if (!confirm("Replace your current strategies and trade log with the imported file?")) return;
      state = data;
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
    renderChecklist();
    renderStrategies();
    renderJournal();
  }

  render();
})();
