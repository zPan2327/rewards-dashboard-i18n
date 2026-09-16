// Imported first on purpose: ES modules evaluate their imports depth-first in
// source order, so every view module below already sees the locale restored
// from localStorage by the time it runs module-scope code.
import {
  LOCALES,
  applyI18n,
  getLocale,
  initI18n,
  onLocaleChange,
  setLocale,
  t,
  tp,
} from "./i18n/index.js";

import { themes } from "./themes/index.js";
import {
  applyTheme,
  getStoredThemeId,
  setStoredThemeId,
  getStoredMode,
  setStoredMode,
  systemPrefersDark,
} from "./themeManager.js";

import { api, invalidate } from "./api.js";
import * as U from "./util.js";

import overview from "./views/overview.js";
import accounts from "./views/accounts.js";
import logs from "./views/logs.js";
import runs from "./views/runs.js";
import schedule from "./views/schedule.js";
import configView from "./views/config.js";
import diagnostics from "./views/diagnostics.js";

function initVersion() {
  const version = window.APP_VERSION || "Development";

  if (els.footerVersion) {
    els.footerVersion.textContent = t("app.footerDashboard", { version });
  }
}

const VIEWS = [
  overview,
  accounts,
  logs,
  runs,
  schedule,
  configView,
  diagnostics,
];

const els = {
  statusBadge: U.$("#statusBadge"),
  statusText: U.$("#statusText"),
  modeToggle: U.$("#modeToggle"),
  modeIcon: U.$("#modeIcon"),
  themeSelect: U.$("#themeSelect"),
  langSelect: U.$("#langSelect"),
  tabBar: U.$("#tabBar"),
  tabPanels: U.$("#tabPanels"),
  ctlPill: U.$("#ctlPill"),
  ctlDetail: U.$("#ctlDetail"),
  btnStart: U.$("#btnStart"),
  btnStop: U.$("#btnStop"),
  btnRestart: U.$("#btnRestart"),
  btnMore: U.$("#btnMore"),
  ctlMenu: U.$("#ctlMenu"),
  btnForceStop: U.$("#btnForceStop"),
  btnShutdown: U.$("#btnShutdown"),
  loginCodesSection: U.$("#loginCodesSection"),
  loginCodesList: U.$("#loginCodesList"),
  loginCodesAnnounce: U.$("#loginCodesAnnounce"),
  footerStatus: U.$("#footerStatus"),
  footerScriptVersion: U.$("#footerScriptVersion"),
  footerVersion: U.$("#footerVersion"),
};

const state = {
  status: null,
  codes: [],
  activeTab: null,
  streamOpen: false,
};

const mounted = new Set();
let refreshTimer = null;
let knownCodeKeys = new Set();

const ctx = {
  api,
  invalidate,
  toast: U.toast,
  get status() {
    return state.status;
  },
  refresh: () => refreshActive(true),
};

// theme

let currentThemeId = null;
let currentMode = "light";

const findTheme = (id) => themes.find((t) => t.id === id) || themes[0] || null;

function setMode(mode, persist) {
  currentMode = mode;
  els.modeIcon.textContent = mode === "dark" ? "\u2600" : "\u263D";
  const label =
    mode === "dark"
      ? t("app.themeSwitchToLight")
      : t("app.themeSwitchToDark");
  els.modeToggle.setAttribute("aria-label", label);
  els.modeToggle.title = label;
  if (persist) setStoredMode(mode);
  const theme = findTheme(currentThemeId);
  if (theme) applyTheme(theme, currentMode);
  redrawActive();
}

function setTheme(id, persist) {
  const theme = findTheme(id);
  if (!theme) return;
  currentThemeId = theme.id;
  els.themeSelect.value = theme.id;
  if (persist) setStoredThemeId(theme.id);
  applyTheme(theme, currentMode);
}

function initTheme() {
  if (!themes.length) return;
  els.themeSelect.innerHTML = themes
    .map(
      (t) =>
        `<option value="${U.escapeAttr(t.id)}">${U.escapeHtml(t.name)}</option>`,
    )
    .join("");

  const storedThemeId = getStoredThemeId();
  currentMode = getStoredMode() || (systemPrefersDark() ? "dark" : "light");
  setTheme(
    storedThemeId && findTheme(storedThemeId) ? storedThemeId : themes[0].id,
    false,
  );
  setMode(currentMode, false);

  els.themeSelect.addEventListener("change", () =>
    setTheme(els.themeSelect.value, true),
  );
  els.modeToggle.addEventListener("click", () =>
    setMode(currentMode === "dark" ? "light" : "dark", true),
  );
}

// language

// The picker is built from the locale registry, so adding a locale file plus
// one LOCALES entry is all it takes for it to show up here.
function initLanguage() {
  if (!els.langSelect) return;

  els.langSelect.innerHTML = LOCALES.map(
    (l) =>
      `<option value="${U.escapeAttr(l.id)}">${U.escapeHtml(l.label)}</option>`,
  ).join("");
  els.langSelect.value = getLocale();
  els.langSelect.addEventListener("change", () =>
    setLocale(els.langSelect.value),
  );

  onLocaleChange((id) => {
    els.langSelect.value = id;
    applyI18n(document); // static markup from index.html
    relabelTabs(); // tab buttons
    renderStatusBadge(); // status badge
    renderControlStrip(); // run controls + ticker
    renderFooter(); // footer
    renderCodes(); // login codes
    setMode(currentMode, false); // theme button label + redraw
    remountActive(); // the active view, whose markup is built by JS
  });
}

// A view builds its markup in mount(), so switching language re-runs it. No
// view registers global listeners or timers, so this cannot double up.
function remountActive() {
  const view = currentView();
  if (!view) return;
  const panel = U.$(`#tab-panel-${view.id}`);
  if (!panel) return;
  view.mount(panel, ctx);
  applyI18n(panel);
  mounted.add(view.id);
  refreshActive(true);
}

function relabelTabs() {
  for (const v of VIEWS) {
    const btn = U.$(`#tab-btn-${v.id}`);
    if (btn) btn.textContent = v.labelKey ? t(v.labelKey) : v.label;
  }
}

// tabs

function initTabs() {
  els.tabBar.innerHTML = VIEWS.map(
    (v) => `<button type="button" role="tab" class="tab" id="tab-btn-${v.id}"
                 aria-controls="tab-panel-${v.id}" aria-selected="false" data-tab="${v.id}">${U.escapeHtml(
      v.labelKey ? t(v.labelKey) : v.label,
    )}</button>`,
  ).join("");

  els.tabPanels.innerHTML = VIEWS.map(
    (v) =>
      `<div class="tab-panel" id="tab-panel-${v.id}" role="tabpanel" aria-labelledby="tab-btn-${v.id}" hidden></div>`,
  ).join("");

  els.tabBar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (btn) location.hash = btn.dataset.tab;
  });

  els.tabBar.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = VIEWS.findIndex((v) => v.id === state.activeTab);
    const next =
      VIEWS[
      (i + (e.key === "ArrowRight" ? 1 : VIEWS.length - 1)) % VIEWS.length
      ];
    location.hash = next.id;
    U.$(`#tab-btn-${next.id}`)?.focus();
    e.preventDefault();
  });

  window.addEventListener("hashchange", () => activate(location.hash.slice(1)));
  activate(location.hash.slice(1));
}

function activate(id) {
  const view = VIEWS.find((v) => v.id === id) || VIEWS[0];
  if (state.activeTab === view.id) return;
  state.activeTab = view.id;

  for (const v of VIEWS) {
    const on = v.id === view.id;
    U.$(`#tab-btn-${v.id}`).setAttribute("aria-selected", String(on));
    U.$(`#tab-btn-${v.id}`).classList.toggle("tab--active", on);
    U.$(`#tab-panel-${v.id}`).hidden = !on;
  }

  const panel = U.$(`#tab-panel-${view.id}`);
  if (!mounted.has(view.id)) {
    view.mount(panel, ctx);
    // A view builds its own markup, so its data-i18n attributes have to be
    // resolved *after* mount; the initial applyI18n() only saw index.html.
    applyI18n(panel);
    mounted.add(view.id);
  }

  refreshActive(true);

  clearInterval(refreshTimer);
  if (view.interval)
    refreshTimer = setInterval(() => refreshActive(false), view.interval);
}

function currentView() {
  return VIEWS.find((v) => v.id === state.activeTab);
}

async function refreshActive(force) {
  const view = currentView();
  if (!view || !view.refresh) return;
  if (force) invalidate();
  try {
    await view.refresh(ctx);
    // Views rewrite parts of their markup on refresh; re-resolving the
    // declarative bindings keeps those parts in the current language.
    applyI18n(U.$(`#tab-panel-${view.id}`));
    renderFooter();
  } catch (e) {
    console.error(`[${view.id}] refresh failed`, e);
  }
}

function redrawActive() {
  const view = currentView();
  if (view?.redraw) view.redraw(ctx);
}

// live

function connectStream() {
  const es = new EventSource("/api/events");

  es.addEventListener("open", () => {
    state.streamOpen = true;
  });

  es.addEventListener("state", (e) => {
    state.streamOpen = true;
    applyState(JSON.parse(e.data));
  });

  es.addEventListener("log", (e) => {
    const entry = JSON.parse(e.data);
    currentView()?.onLog?.(entry, ctx);
  });

  es.addEventListener("codes", (e) => {
    setCodes(JSON.parse(e.data).codes || []);
  });

  es.addEventListener("reset", () => {
    for (const v of VIEWS) v.onReset?.(ctx);
    U.toast(t("toast.controlRestarted"), "warn");
  });

  es.onerror = () => {
    state.streamOpen = false;
    renderStatusBadge();
  };
}

function applyState(next) {
  state.status = next;
  U.setTimeZone(next.timezone);
  setCodes(next.codes || []);
  renderStatusBadge();
  renderControlStrip();
  renderFooter();
  currentView()?.onState?.(next, ctx);
}

// status
function renderStatusBadge() {
  const s = state.status;
  const badge = els.statusBadge;
  badge.classList.remove(
    "status-live",
    "status-warn",
    "status-down",
    "status-unknown",
  );

  if (!state.streamOpen && !s) {
    badge.classList.add("status-down");
    els.statusText.textContent = t("status.dashboardUnreachable");
  } else if (!s) {
    badge.classList.add("status-unknown");
    els.statusText.textContent = t("status.connecting");
  } else if (!s.reachable) {
    badge.classList.add("status-down");
    els.statusText.textContent = t("status.botOffline");
  } else if (s.authOk === false) {
    badge.classList.add("status-warn");
    els.statusText.textContent = t("status.tokenRejected");
  } else if (s.botRunning) {
    badge.classList.add("status-live");
    els.statusText.textContent = t("status.runningNow");
  } else {
    badge.classList.add("status-live");
    els.statusText.textContent = t("status.connected");
  }
  badge.title = s?.lastError || "";
}

function renderFooter() {
    // Use the els object instead of querying the DOM every time
    const { footerStatus, footerScriptVersion } = els;

    if (!footerStatus) return;

    const s = state.status;

    footerStatus.textContent =
        !s
            ? t("status.connecting")
            : !s.reachable
                ? t("status.disconnected")
                : s.botRunning
                    ? t("status.running")
                    : t("status.connected");

    footerScriptVersion.textContent = t("app.footerScript", {
        version: s?.version || "\u2013",
    });
}

function renderControlStrip() {
  const s = state.status;
  const botState = s?.botState || "unknown";
  const usable = Boolean(s?.reachable && s?.authOk !== false);
  const running = botState !== "idle" && botState !== "unknown";

  const { cls, label } = U.pillParts(
    botState === "unknown" ? "idle" : botState,
  );
  els.ctlPill.className = `pill ${cls}`;
  els.ctlPill.textContent = label;

  const bot = s?.bot;
  const bits = [];
  if (running && bot?.pid) bits.push(t("ctl.pid", { pid: bot.pid }));
  if (running && bot?.startedAt)
    bits.push(t("ctl.startedAt", { time: U.fmtRelative(bot.startedAt) }));
  if (bot?.run?.accountsTotal)
    bits.push(
      t("ctl.accounts", {
        seen: bot.run.accountsSeen || 0,
        total: bot.run.accountsTotal,
      }),
    );
  if (running && bot?.run?.collected != null)
    bits.push(t("ctl.points", { points: U.fmtSigned(bot.run.collected) }));
  if (!running && s?.schedule?.enabled && s.schedule.nextRunAt) {
    bits.push(t("ctl.nextRun", { time: U.fmtDateTime(s.schedule.nextRunAt) }));
  }
  if (!running && !bits.length && bot?.lastExit) {
    const code = bot.lastExit.code ?? "n/a";
    bits.push(
      bot.lastExit.signal
        ? t("ctl.lastExitSignal", { code, signal: bot.lastExit.signal })
        : t("ctl.lastExit", { code }),
    );
  }
  U.renderTicker(
    els.ctlDetail,
    bits.join(" \u00b7 ") ||
      t(usable ? "ctl.ready" : "ctl.unavailable"),
  );

  els.btnStart.disabled = !usable || running;
  els.btnStop.disabled = !usable || !running;
  els.btnRestart.disabled = !usable;
  els.btnForceStop.disabled = !usable || !running;
  els.btnShutdown.disabled = !usable;
}

async function control(action, body, { confirm: confirmMsg, success } = {}) {
  if (confirmMsg && !window.confirm(confirmMsg)) return;
  try {
    await api.control(action, body || {});
    U.toast(success || t("toast.actionSent", { action }), "success");
  } catch (e) {
    U.toast(e.message, e.status === 409 ? "warn" : "error");
  }
}

function initControls() {
  els.btnStart.addEventListener("click", () =>
    control("start", {}, { success: t("toast.runStarted") }),
  );
  els.btnStop.addEventListener("click", () =>
    control("stop", { force: false }, { success: t("toast.stopSent") }),
  );
  els.btnRestart.addEventListener("click", () =>
    control(
      "restart",
      {},
      {
        confirm: t("confirm.restart"),
        success: t("toast.restarting"),
      },
    ),
  );
  els.btnForceStop.addEventListener("click", () => {
    closeMenu();
    control(
      "stop",
      { force: true },
      {
        confirm: t("confirm.forceStop"),
        success: t("toast.forceStopSent"),
      },
    );
  });
  els.btnShutdown.addEventListener("click", () => {
    closeMenu();
    control(
      "shutdown",
      {},
      {
        confirm: t("confirm.shutdown"),
        success: t("toast.shutdownSent"),
      },
    );
  });

  els.btnMore.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = els.ctlMenu.hidden;
    els.ctlMenu.hidden = !open;
    els.btnMore.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
}

function closeMenu() {
  els.ctlMenu.hidden = true;
  els.btnMore.setAttribute("aria-expanded", "false");
}

// login code

const codeKey = (c) => `${c.userName}:${c.number}:${c.issuedAt}`;

function setCodes(codes) {
  state.codes = codes;
  const fresh = codes.filter((c) => !knownCodeKeys.has(codeKey(c)));
  if (fresh.length) {
    els.loginCodesAnnounce.textContent = fresh
      .map(
        (c) =>
          t("loginCodes.announce", { user: c.userName, number: c.number }),
      )
      .join(" ");
  }
  knownCodeKeys = new Set(codes.map(codeKey));
  renderCodes();
}

function renderCodes() {
  state.codes = state.codes.filter((c) => Date.parse(c.expiresAt) > Date.now());
  els.loginCodesSection.hidden = state.codes.length === 0;
  if (!state.codes.length) return;

  els.loginCodesList.innerHTML = state.codes
    .map((c) => {
      const secsLeft = Math.max(
        0,
        Math.round((Date.parse(c.expiresAt) - Date.now()) / 1000),
      );
      return `
                <div class="login-code-card">
                    <div class="login-code-number">${U.escapeHtml(c.number)}</div>
                    <div class="login-code-info">
                        <span class="login-code-name">${U.escapeHtml(c.userName)}</span>
                        <span class="login-code-countdown ${secsLeft <= 15 ? "urgent" : ""}">${U.escapeHtml(
                            t("loginCodes.expiresIn", { seconds: secsLeft }),
                        )}</span>
                    </div>
                </div>`;
    })
    .join("");
}

// init

initI18n(); // mirrors the restored locale onto <html lang> and resolves the
// data-i18n attributes in index.html
initVersion();
initTheme();
initLanguage();
initControls();
initTabs();
connectStream();

setInterval(renderCodes, 1000);
window.addEventListener("focus", () => refreshActive(true));
window.addEventListener(
  "resize",
  U.debounce(() => {
    redrawActive();
    renderControlStrip();
  }, 200),
);
