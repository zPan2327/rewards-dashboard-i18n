import * as U from "../util.js";
import { t, tp } from "../i18n/index.js";
import { localizeCronDescription } from "../i18n/cronText.js";
import { cached } from "../api.js";
// Import BOTH chart builders
import { buildAccumBarHtml, buildHeatmapHtml, lineChart } from "../charts.js";

let data = null;
let accountsPayload = null;
let rootEl = null;
let mounted = false;
let context = null;

let selected = null;

// Persistent view mode storage helpers
const VIEW_STORAGE_KEY = "rewards_dashboard_view_mode";
let viewMode = localStorage.getItem(VIEW_STORAGE_KEY) || "accum"; // Load stored view or default to 'accum'

const launching = new Set();

const NUMERIC = /^[+\-\u2013]?[\d,.]*$/;

function statCard(id, value, unit, label, iconClass = "stat-icon-check", icon = "\u2713") {
  const small = NUMERIC.test(String(value).trim()) ? "" : " stat-value-sm";
  return `
        <div class="stat-card">
            <div class="stat-block-chip${small ? " chip-sm-wrap" : ""}">
                <span class="stat-num-val${small}" id="${id}">${value}</span>
                <span class="stat-block-unit">${U.escapeHtml(unit)}</span>
            </div>
            <div class="stat-title-row">
                <span class="${iconClass}" aria-hidden="true">${icon}</span>
                <span class="stat-label">${U.escapeHtml(label)}</span>
            </div>
        </div>`;
}

function activeSchedule(status) {
  const local = status?.schedule || null;
  const remote = status?.remoteScheduleSupported ? status?.remoteSchedule : null;
  const localOn = Boolean(local?.enabled);
  const remoteOn = Boolean(remote?.enabled);

  if (localOn && remoteOn) {
    return {
      description: `${localizeCronDescription(
        local.description,
      )} + ${localizeCronDescription(remote.description)}`,
      enabled: true,
      both: true,
      timezone: status?.timezone || "UTC",
    };
  }
  if (remoteOn) {
    return {
      description: localizeCronDescription(remote.description),
      enabled: true,
      timezone: remote.timezone || status?.timezone || "UTC",
    };
  }
  if (localOn) {
    return {
      description: localizeCronDescription(local.description),
      enabled: true,
      timezone: status?.timezone || "UTC",
    };
  }
  return {
    description:
      localizeCronDescription(local?.description) ||
      localizeCronDescription(remote?.description) ||
      t("overview.schedule.notScheduled"),
    enabled: false,
    timezone: status?.timezone || "UTC",
  };
}

function checkVariant(status) {
  return (
    { success: "ok", error: "error", running: "running", idle: "idle" }[status] ?? "idle"
  );
}

// pendingDelay is only ever forward-looking (cleared the moment the next
// account actually starts), so a stale/expired one just yields null here.
function pendingDelayLabel(pendingDelay) {
  if (!pendingDelay) return null;
  const elapsedSec = (Date.now() - Date.parse(pendingDelay.sinceTs)) / 1000;
  const remaining = Math.round(pendingDelay.seconds - elapsedSec);
  if (remaining <= 0) return null;
  const who = pendingDelay.nextEmail
    ? t("overview.run.pendingDelayAccount", {
        email: pendingDelay.nextEmail.split("@")[0],
      })
    : "";
  return t("overview.run.pendingDelay", { seconds: remaining }) + who;
}

function controlState() {
  const status = context?.status;
  const usable = Boolean(status?.reachable && status?.authOk !== false);
  const running = Boolean(status?.botRunning);
  return { usable, running };
}

async function runAccount(account) {
  if (!context || !account.configured || !Number.isInteger(account.index)) return;

  launching.add(account.index);
  renderAccountRows(rootEl);
  try {
    await context.api.control("start", { accountIndex: account.index });
    context.toast(
      t("overview.toast.runOnlyStarted", {
        index: account.index,
        email: account.email,
      }),
      "success",
    );
    context.invalidate();
    await context.refresh();
  } catch (error) {
    context.toast(error.message, error.status === 409 ? "warn" : "error");
  } finally {
    launching.delete(account.index);
    renderAccountRows(rootEl);
  }
}

function renderStats(root, status) {
  const accounts = data?.accounts || [];
  const runs = data?.runs || [];
  const lastRun = runs.find((r) => r.status === "done") || runs[0] || null;

  const errorCount = accounts.filter((a) => a.status === "error").length;
  const anyRunning = accounts.some((a) => a.status === "running");
  const combined = accounts.reduce((sum, a) => sum + (a.lastPoints || 0), 0);
  const sched = activeSchedule(status);

  U.$("#statGrid", root).innerHTML = [
    statCard(
      "statAccounts",
      U.fmtNumber(accounts.length),
      t("overview.stat.accountsUnit"),
      t("overview.stat.accountsLabel"),
    ),
    statCard(
      "statCombined",
      U.fmtNumber(combined),
      t("overview.stat.combinedUnit"),
      t("overview.stat.combinedLabel"),
    ),
    statCard(
      "statLastGained",
      lastRun ? U.fmtSigned(lastRun.totalGained) : "\u2013",
      t("overview.stat.lastGainedUnit"),
      t("overview.stat.lastGainedLabel"),
    ),
    statCard(
      "statLastRun",
      anyRunning
        ? t("overview.stat.runningNow")
        : lastRun
          ? U.fmtRelative(lastRun.endTs || lastRun.startTs)
          : "\u2013",
      anyRunning ? "" : t("overview.stat.lastRunUnit"),
      t("overview.stat.lastRunLabel"),
      anyRunning ? "stat-icon-running" : "stat-icon-check",
      anyRunning ? "\u25CF" : "\u2713",
    ),
    statCard(
      "statErrors",
      U.fmtNumber(errorCount),
      t("overview.stat.errorsUnit"),
      t("overview.stat.errorsLabel"),
      errorCount > 0 ? "stat-icon-alert icon-alert-active" : "stat-icon-check",
      errorCount > 0 ? "!" : "\u2713",
    ),
    statCard(
      "statSchedule",
      U.escapeHtml(sched.description || "\u2013"),
      sched.timezone || "UTC",
      sched.both
        ? t("overview.stat.scheduleBothLabel")
        : t("overview.stat.scheduleLabel"),
      sched.both ? "stat-icon-alert icon-alert-active" : sched.enabled ? "stat-icon-check" : "stat-icon-idle",
      sched.both ? "!" : sched.enabled ? "\u2713" : "\u2013",
    ),
  ].join("");
}

function renderAccountRows(root) {
  const container = U.$("#overviewHeroRows", root);
  const accounts = accountsPayload?.accounts || [];
  const histories = accountsPayload?.histories || {};
  const { usable, running } = controlState();

  const errEl = U.$("#ovwAccountsError", root);
  if (errEl) {
    errEl.hidden = !accountsPayload?.apiError;
    if (accountsPayload?.apiError) errEl.textContent = accountsPayload.apiError;
  }

  if (!accounts.length) {
    container.innerHTML = `<p class="empty-note" style="padding:1.25rem">${U.escapeHtml(
      t("overview.accountsEmpty"),
    )}</p>`;
    return;
  }

  const bucketed = accounts
    .map((a) => ({ key: a.key, days: U.bucketByDay(histories[a.key] || []) }))
    .filter((x) => x.days.length);

  // Require global max for the original accumulation bar view
  const globalMax = bucketed.length
    ? Math.max(1, ...bucketed.flatMap((b) => b.days.map((d) => d.gained)))
    : 1;

  const daysByKey = Object.fromEntries(bucketed.map((b) => [b.key, b.days]));
  const todayKey = U.tzDayKey(new Date());
  const isMobile = window.matchMedia("(max-width: 768px)").matches;

  // While waiting between accounts, mark the account that's up next as
  // 'pending' rather than plain 'idle'/'success'/'error'. index.ts's
  // ACCOUNT-DELAY log line names the upcoming account directly, so this
  // reads that identity straight off pendingDelay rather than inferring it
  // from run.accounts (which only ever contains accounts that have already
  // started).
  const pendingDelay = context?.status?.pendingDelay;
  const nextAccountEmail = pendingDelay?.nextEmail || null;

  // hide email for screenshots by toggling mask = true
  const MASK_EMAILS = false;

  container.innerHTML = accounts
    .map((a) => {
      const days = daysByKey[a.key] || null;
      let barCell = `<p class="empty-note" style="font-size:0.78rem;margin:0">${U.escapeHtml(
        t("overview.noHistoryYet"),
      )}</p>`;
      
      if (days) {
        // Toggle view logic
        if (viewMode === "heatmap") {
            barCell = `<div class="heatmap-wrap">${buildHeatmapHtml(days)}</div>`;
        } else {
            barCell = `<div class="accum-track"><div class="accum-bar">${buildAccumBarHtml(days, globalMax, isMobile ? 7 : null)}</div></div>`;
        }
      }

      const todayGained = days?.find((d) => d.dayKey === todayKey)?.gained ?? null;
      const variant = checkVariant(a.status);
      let badgeStatus = { ok: "success", error: "error", running: "running", idle: "idle" }[variant];
      if (badgeStatus !== "running" && nextAccountEmail && a.email === nextAccountEmail) {
        badgeStatus = "pending";
      }

      const todayText =
        todayGained != null
          ? t("overview.todayGained", {
              points: todayGained.toLocaleString(),
            })
          : a.status === "running"
            ? t("overview.runningNow")
            : t("overview.noRunToday");

      const accountHistory = histories[a.key] || [];
      let gainHtml = "";
      if (accountHistory.length >= 2) {
        const latest = accountHistory[accountHistory.length - 1];
        const previous = accountHistory[accountHistory.length - 2];
        const trueGain = latest.points - previous.points;
        const selfReported = latest.gained ?? 0;
        const other = trueGain - selfReported;
        const gainText =
          other !== 0
            ? t("common.pointsSuffix", {
                points: `${U.fmtSigned(selfReported)}${other >= 0 ? "+" : "-"}${Math.abs(other).toLocaleString()}`,
              })
            : t("common.pointsSuffix", { points: U.fmtSigned(trueGain) });
        gainHtml = ` \u00b7 <span class="gain-val" title="${U.escapeAttr(
                t("overview.gainTitle"),
              )}">${gainText}</span>`;
      }

      const dur = a.lastDurationSec != null ? U.fmtDuration(a.lastDurationSec) : null;

      const sub =
        a.status === "running"
          ? `<span class="hero-sub-running">${U.escapeHtml(
              t("overview.runningNow")
            )} ${U.escapeHtml(U.fmtRelative(a.lastStartAt))}</span>`
          : `${U.escapeHtml(
              t("overview.lastRunAt", {
                time: U.fmtRelative(a.lastEndAt || a.lastStartAt),
              }),
            )}${
              dur
                ? ` \u00b7 <span title="${U.escapeAttr(
                    t("overview.lastRunDurationTitle"),
                  )}">⏱ ${U.escapeHtml(dur)}</span>`
                : ""
            }${gainHtml}`;

      return `<div class="hero-row">
            <div class="hero-bar-cell">${barCell}</div>
            <div class="hero-acc-card">
                <div class="hero-acc-pts">
                    <span class="hero-pts-num">${a.lastPoints != null ? U.fmtNumber(a.lastPoints) : "\u2013"}</span>
                    <span class="hero-pts-unit">${U.escapeHtml(t("common.points"))}</span>
                </div>
                <div class="hero-acc-info">
                    <div class="hero-acc-name">
                        ${MASK_EMAILS ? `ACCOUNT_${a.index}` : U.escapeHtml(a.email)}
                        ${a.configured
                          ? ""
                          : ` <span class="tag-mini">${U.escapeHtml(
                              t("common.unconfigured"),
                            )}</span>`}
                    </div>
                    <div class="hero-acc-meta">
                        <span class="hero-acc-today">
                            ${U.statusPill(badgeStatus)}
                            <span>${U.escapeHtml(todayText)}</span>
                            ${a.streakCounter != null ? `<span> \u00b7 🔥\u202f${U.fmtNumber(a.streakCounter)}</span>` : ""}
                        </span>
                    </div>
                    <div class="hero-acc-sub">${sub}</div>
                    ${a.lastError ? `<div class="hero-acc-error">${U.escapeHtml(a.lastError)}</div>` : ""}
                </div>
                <div class="hero-acc-actions">
                    ${a.configured && Number.isInteger(a.index)
                      ? `<button type="button" class="link-btn" data-run-account="${a.index}" ${!usable || running || launching.has(a.index) ? "disabled" : ""} title="${U.escapeAttr(
                            t("common.runOnlyTitle", { index: a.index }),
                          )}">${launching.has(a.index) ? U.escapeHtml(t("common.starting")) : U.escapeHtml(t("common.runOnly"))}</button>`
                      : ""
                    }
                    <button type="button" class="link-btn" data-trend="${U.escapeAttr(a.key)}" aria-pressed="${selected === a.key}">${U.escapeHtml(t("common.trend"))}</button>
                </div>
            </div>
        </div>`;
    })
    .join("");

  // The timeline view is a rolling recent-history strip, so scrolling it to
  // its end shows the most recent days by default - that's still correct.
  // The heatmap is intentionally left-anchored to where the account's data
  // starts, with empty "coming up" cells trailing off to the right, so it
  // must NOT be force-scrolled to its end - that would undo the fix and put
  // the user right back at a mostly-empty future edge instead of their data.
  container.querySelectorAll(".accum-track").forEach((track) => {
    track.scrollLeft = track.scrollWidth;
  });

  container.querySelectorAll("button[data-run-account]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.runAccount);
      const account = accounts.find((a) => a.index === index);
      if (account) runAccount(account);
    }),
  );

  container.querySelectorAll("button[data-trend]").forEach((btn) =>
    btn.addEventListener("click", () => {
      selected = selected === btn.dataset.trend ? null : btn.dataset.trend;
      renderAccountRows(root);
      if (selected) {
        U.$("#ovwTrendSection", root).scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }),
  );

  renderTrend();
}

function renderTrend() {
  const section = U.$("#ovwTrendSection", rootEl);
  section.hidden = !selected;
  if (!selected) return;

  const history = (accountsPayload?.histories || {})[selected] || [];
  U.$("#ovwTrendName", rootEl).textContent = selected;

  lineChart(
    U.$("#ovwTrendChart", rootEl),
    history.map((h) => ({
      key: h.ts.slice(0, 10),
      value: h.points,
      label: U.fmtDateTime(h.ts),
    })),
    { emptyMessage: t("overview.trendEmpty") },
  );
}

function renderRunHeader(root, status) {
  const bot = status?.bot;
  const run = bot?.run;

  const active =
    bot &&
    bot.state !== "idle" &&
    bot.state !== "unknown";

  const progressBox = U.$("#runProgressBox", root);
  const titleEl = U.$("#run-progress-heading", root);
  const metaEl = U.$("#currentRunMeta", root);
  const bar = U.$("#currentRunBar", root);

  if (!bar) return;

  progressBox.hidden = false;

  const progressWrap = bar.parentElement;
  const total = Number(run?.accountsTotal) || 0;
  const runAccounts = Array.isArray(run?.accounts) ? run.accounts : [];

  // run.accounts only ever contains accounts that have started (see
  // logParser.js's ensureAccount) - success stays null until it finishes,
  // so this is the one reliable way to tell "finished" from "still running"
  // rather than trusting accountsSeen, which counts starts, not completions.
  const doneCount = runAccounts.filter((a) => a.success != null).length;
  const seenCount = Number.isFinite(Number(run?.accountsSeen))
    ? Number(run.accountsSeen)
    : runAccounts.length;
  const runningCount = Math.max(0, seenCount - doneCount);
  const pendingCount = Math.max(0, total - seenCount);

  const done = Math.min(doneCount, total);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  titleEl.textContent = active
    ? t("overview.runInProgress")
    : t("overview.lastRun");

  U.renderTicker(
    metaEl,
    [
      run?.version ? `v${run.version}` : null,
      total
        ? t("overview.run.done", { done, total })
        : t("overview.run.seen", { count: seenCount }),
      total && runningCount
        ? t("overview.run.runningCount", { count: runningCount })
        : null,
      total && pendingCount
        ? t("overview.run.pendingCount", { count: pendingCount })
        : null,
      run?.clusters != null
        ? tp("overview.run.clusters", run.clusters)
        : null,
      run?.collected != null
        ? t("overview.run.points", { points: U.fmtSigned(run.collected) })
        : null,
      pendingDelayLabel(status?.pendingDelay),
    ]
      .filter(Boolean)
      .join(" \u00b7 "),
  );

  bar.style.width = `${pct}%`;
  progressWrap.setAttribute("aria-valuenow", String(pct));
    
  if (!active) {
    progressBox.classList.add("idle");
  } else {
    progressBox.classList.remove("idle");
  }
}

export default {
  id: "overview",
  labelKey: "tab.overview",
  interval: 10000,

  mount(root, ctx) {
    rootEl = root;
    context = ctx;
    root.innerHTML = `
            <p class="notice notice--warn" id="ovwAccountsError" hidden></p>

            <section aria-labelledby="stats-heading" class="stats">
                <h2 id="stats-heading" class="visually-hidden" data-i18n="overview.summaryHeading">Summary</h2>
                <div class="stat-grid" id="statGrid"></div>
            </section>

            <section class="panel run-progress-box" id="runProgressBox" aria-labelledby="run-progress-heading">
                <div class="run-progress-header">
                    <h2 class="run-progress-title" id="run-progress-heading" data-i18n="overview.runInProgress">Run in progress</h2>
                    <span id="currentRunMeta" class="run-progress-meta"></span>
                </div>
                <div class="progress" id="currentRunProgressWrap" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                    <div class="progress-bar" id="currentRunBar"></div>
                </div>
            </section>

            <section class="panel hero-panel" id="currentRun" aria-labelledby="current-run-heading">
                <div class="hero-panel-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                    <div>
                        <h2 id="current-run-heading" style="margin:0;" data-i18n="overview.accountsOverview">Accounts Overview</h2>
                    </div>
                    <div class="seg" id="ovwViewToggle">
                        <button type="button" class="seg-btn ${viewMode === 'accum' ? 'seg-btn--active' : ''}" data-view="accum" data-i18n="overview.viewTimeline">Timeline</button>
                        <button type="button" class="seg-btn ${viewMode === 'heatmap' ? 'seg-btn--active' : ''}" data-view="heatmap" data-i18n="overview.viewHeatmap">Heatmap</button>
                    </div>
                </div>
                <div class="hero-layout" id="overviewHeroRows">
                    <p class="empty-note" style="padding:1.25rem" data-i18n="common.loading">Loading…</p>
                </div>
            </section>

            <section class="panel" id="ovwTrendSection" hidden aria-labelledby="ovw-trend-heading">
                <div class="panel-head">
                    <h2 id="ovw-trend-heading"><span data-i18n="overview.trendHeading">Point total</span> &mdash; <span id="ovwTrendName"></span></h2>
                    <span class="panel-sub" data-i18n="overview.trendSub">Every recorded balance, oldest to newest</span>
                </div>
                <div id="ovwTrendChart" class="chart-wrap"></div>
            </section>`;
    mounted = true;

    // Attach event listeners for the toggle and save selection to localStorage
    const toggleBtns = root.querySelectorAll("#ovwViewToggle .seg-btn");
    toggleBtns.forEach((btn) => {
        btn.addEventListener("click", (e) => {
            toggleBtns.forEach((b) => b.classList.remove("seg-btn--active"));
            e.target.classList.add("seg-btn--active");
            viewMode = e.target.dataset.view;
            localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
            renderAccountRows(rootEl);
        });
    });
  },
  
  async refresh(ctx) {
    context = ctx;
    [data, accountsPayload] = await Promise.all([
      cached("summary", ctx.api.summary, 3000),
      cached("accounts", ctx.api.accounts, 5000),
    ]);
    this.redraw(ctx);
  },

  redraw(ctx) {
    context = ctx || context;
    if (!mounted || !data) return;
    renderStats(rootEl, context.status);
    renderRunHeader(rootEl, context.status);
    renderAccountRows(rootEl);
  },

  onState(status, ctx) {
    context = ctx || context;
    if (!mounted || !data) return;
    renderRunHeader(rootEl, status);
    renderStats(rootEl, status);
    renderAccountRows(rootEl);
  },
};