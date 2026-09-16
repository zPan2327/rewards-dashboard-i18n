import * as U from "../util.js";
import { cached } from "../api.js";
import { hasKey, t, tp } from "../i18n/index.js";

let accountsPayload = null;
let rootEl = null;
let mounted = false;
let context = null;

const launching = new Set();
const selectedForBatch = new Set();
const expandedAccounts = new Set();
let batchRunning = false;

const SOURCE_LABELS = {
  search: "accounts.source.search",
  bonus: "accounts.source.bonus",
  read: "accounts.source.read",
  checkIn: "accounts.source.checkIn",
  claimReward: "accounts.source.claimReward",
  claimBonus: "accounts.source.claimBonus",
  urlReward: "accounts.source.urlReward",
  visualSearch: "accounts.source.visualSearch",
  appReward: "accounts.source.appReward",
  punchcard: "accounts.source.punchcard",
  searchOnBing: "accounts.source.searchOnBing",
};

function controlState() {
  const status = context?.status;
  const usable = Boolean(status?.reachable && status?.authOk !== false);
  const running = Boolean(status?.botRunning);
  return { usable, running };
}

async function runAccount(account) {
  if (!context || !account.configured || !Number.isInteger(account.index)) return;

  launching.add(account.index);
  render(rootEl);
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
    render(rootEl);
  }
}

function selectableAccounts() {
  return (accountsPayload?.accounts || []).filter(
    (a) => a.configured && Number.isInteger(a.index),
  );
}

async function runSelectedAccounts() {
  if (!context) return;
  const configured = selectableAccounts();
  const selectedIndexes = configured
    .filter((a) => selectedForBatch.has(a.index))
    .map((a) => a.index);
  if (!selectedIndexes.length) return;

  // The control API only accepts an exclusion list, so a "run these x of y"
  // request is expressed as "exclude everyone else".
  const excludedAccountIndexes = configured
    .filter((a) => !selectedForBatch.has(a.index))
    .map((a) => a.index);

  batchRunning = true;
  render(rootEl);
  try {
    await context.api.control("start", { excludedAccountIndexes });
    context.toast(
      t("accounts.toast.batchStarted", {
        selected: selectedIndexes.length,
        total: configured.length,
      }),
      "success",
    );
    context.invalidate();
    await context.refresh();
  } catch (error) {
    context.toast(error.message, error.status === 409 ? "warn" : "error");
  } finally {
    batchRunning = false;
    render(rootEl);
  }
}

function renderBatchToolbar(root) {
  const configured = selectableAccounts();
  const configuredIndexes = new Set(configured.map((a) => a.index));
  // Drop selections for accounts that disappeared (e.g. .env edited).
  for (const index of [...selectedForBatch]) {
    if (!configuredIndexes.has(index)) selectedForBatch.delete(index);
  }

  const { usable, running } = controlState();
  const count = selectedForBatch.size;
  const total = configured.length;

  U.$("#accountsSelectedCount", root).textContent = t(
    "accounts.batch.selectedCount",
    { selected: count, total },
  );

  const allBtn = U.$("#accountsSelectAll", root);
  allBtn.checked = total > 0 && count === total;
  allBtn.indeterminate = count > 0 && count < total;
  allBtn.disabled = total === 0;

  const runBtn = U.$("#accountsRunSelected", root);
  runBtn.disabled = !usable || running || batchRunning || count === 0;
  runBtn.textContent = batchRunning
    ? t("common.starting")
    : t("accounts.batch.runSelected");
}

function earnableBadge(account) {
  const earnable = account.earnable || account.live?.earnable;
  const total = earnable
    ? Object.values(earnable).reduce((sum, points) => sum + (Number(points) || 0), 0)
    : 0;
  if (total <= 0) return "";
  return `<span class="point-source point-source--target"><strong>${U.escapeHtml(
    t("accounts.earnable"),
  )}</strong> ${U.escapeHtml(U.fmtNumber(total))}</span>`;
}

// Only sources that actually earned something today — ten "+0" chips per
// account is noise, not detail.
function sourceBreakdown(account) {
  const bySource = account.live?.bySource || {};
  return Object.entries(SOURCE_LABELS)
    .filter(([source]) => Number(bySource[source]) > 0)
    .map(
      ([source, labelKey]) =>
        `<span class="point-source"><strong>${U.escapeHtml(
          t(labelKey),
        )}</strong> ${U.escapeHtml(U.fmtSigned(Number(bySource[source])))}</span>`,
    )
    .join("");
}

function protectionPresentation(account) {
  if (account.streakProtectionEnabled == null) return null;

  const remaining = account.streakProtectionRemainingDays;
  const days =
    remaining == null
      ? t("accounts.protection.daysUnavailable")
      : tp("accounts.protection.daysLeft", remaining);
  // The chip reads "180 days left" while its tooltip reads "180 protection
  // days left" - two lengths of the same figure, kept apart on purpose so
  // the English output matches the original dashboard exactly.
  const daysLong =
    remaining == null
      ? t("accounts.protection.daysUnavailable")
      : tp("accounts.protection.daysLeftLong", remaining);
  const stateLabel = account.streakProtectionEnabled
    ? t("common.on")
    : t("common.off");
  const streak =
    account.streakCounter == null
      ? t("accounts.protection.streakUnavailable")
      : tp("accounts.protection.streakCurrent", account.streakCounter, {
          count: U.fmtNumber(account.streakCounter),
        });

  return {
    daysLong,
    enabled: Boolean(account.streakProtectionEnabled),
    state: stateLabel,
    days,
    streak,
    pillClass:
      account.streakProtectionEnabled && remaining !== 0
        ? "pill-success"
        : remaining === 0
          ? "pill-warn"
          : "pill-idle",
  };
}

function kv(items) {
  return `<dl class="kv">${items
    .map(
      ([k, v]) =>
        `<div><dt>${U.escapeHtml(hasKey(k) ? t(k) : k)}</dt><dd>${U.escapeHtml(String(v))}</dd></div>`,
    )
    .join("")}</dl>`;
}

function detailGroups(a, protection) {
  const groups = [];

  groups.push([
    "accounts.detail.configuration",
    [
      [
        "accounts.kv.configuredInEnv",
        a.configured ? t("common.yes") : t("accounts.kv.seenInLogsOnly"),
      ],
      ...(a.geoLocale
        ? [["accounts.kv.geoLocale", a.geoLocale]]
        : []),
      ...(a.langCode ? [["accounts.kv.language", a.langCode]] : []),
      ...(a.hasTotp != null
        ? [
            [
              "accounts.kv.totpSecret",
              a.hasTotp ? t("common.set") : t("common.notSet"),
            ],
          ]
        : []),
      ...(a.hasRecoveryEmail != null
        ? [
            [
              "accounts.kv.recoveryEmail",
              a.hasRecoveryEmail ? t("common.set") : t("common.notSet"),
            ],
          ]
        : []),
      [
        "accounts.kv.proxy",
        a.proxy
          ? `${a.proxy.url}${a.proxy.port ? `:${a.proxy.port}` : ""}${a.proxy.hasCredentials ? t("accounts.kv.proxyAuthenticated") : ""}`
          : t("common.none"),
      ],
    ],
  ]);

  groups.push([
    "accounts.detail.streakProtection",
    [
      [
        "accounts.kv.successStreak",
        tp("accounts.streak.runs", a.successStreak),
      ],
      ...(protection
        ? [
          [
            "accounts.kv.currentStreak",
            a.streakCounter == null
              ? t("common.unavailable")
              : tp("accounts.streak.days", a.streakCounter, {
                  count: U.fmtNumber(a.streakCounter),
                }),
          ],
          [
            "accounts.kv.streakProtection",
            protection.enabled ? t("common.enabled") : t("common.disabled"),
          ],
          [
            "accounts.kv.protectionDaysRemaining",
            a.streakProtectionRemainingDays == null
              ? t("common.unavailable")
              : tp(
                  "accounts.streak.days",
                  a.streakProtectionRemainingDays,
                ),
          ],
          ...(a.streakProtectionUpdatedAt
            ? [
                [
                  "accounts.kv.protectionChecked",
                  U.fmtRelative(a.streakProtectionUpdatedAt),
                ],
              ]
            : []),
        ]
        : []),
    ],
  ]);

  groups.push([
    "accounts.detail.runHistory",
    [
      ["accounts.kv.runsRecorded", U.fmtNumber(a.apiRuns)],
      ["accounts.kv.pointsCollected", U.fmtSigned(a.apiTotalCollected)],
      ["accounts.kv.lastDuration", U.fmtDuration(a.lastDurationSec)],
      ["accounts.kv.historyPointsLoaded", U.fmtNumber(a.historyCount)],
    ],
  ]);

  return `<div class="acc-detail-groups">${groups
    .map(
      ([titleKey, items]) => `
        <div class="acc-detail-group">
            <h3 class="acc-detail-group-title">${t(titleKey)}</h3>
            ${kv(items)}
        </div>`,
    )
    .join("")}</div>`;
}

// Mirrors overview.js's statCard icon convention (stat-icon-check /
// -running / -alert icon-alert-active / -idle with \u2713 / \u25CF / ! / \u2013)
// so an account's live status reads the same way here as it does there.
function statusIconParts(statusKey) {
  switch (statusKey) {
    case "success":
    case "done":
      return {
        cls: "stat-icon-check",
        icon: "\u2713",
        label: t("pill.success"),
      };
    case "running":
    case "starting":
    case "stopping":
      return { cls: "stat-icon-running", icon: "\u25CF", label: U.pillParts(statusKey).label };
    case "pending":
      return { cls: "stat-icon-pending", icon: "\u25CF", label: U.pillParts(statusKey).label };
    case "error":
    case "crashed":
    case "interrupted":
    case "stopped":
      return { cls: "stat-icon-alert icon-alert-active", icon: "!", label: U.pillParts(statusKey).label };
    default:
      return { cls: "stat-icon-idle", icon: "\u2013", label: t("pill.idle") };
  }
}

function renderAccountPanel(a, live) {
  const protection = protectionPresentation(a);
  const { usable, running } = controlState();

  // Accounts now start one at a time (accountDelay), so mid-run there can be
  // several accounts that already finished this run while another is still
  // going - `live` just means "has a record in this run", true for both.
  // a.status is this account's own last-observed outcome (idle/running/
  // success/error), so it correctly tells finished accounts apart from the
  // one actually in progress right now.
  // Mirrors overview.js: while waiting between accounts, the one named by
  // pendingDelay.nextEmail is up next, so it reads as "pending" rather than
  // whatever its last-observed status happened to be.
  const nextAccountEmail = context?.status?.pendingDelay?.nextEmail || null;
  const statusKey = launching.has(a.index)
    ? "starting"
    : a.status !== "running" && nextAccountEmail && a.email === nextAccountEmail
      ? "pending"
      : a.status;

  const runButton =
    a.configured && Number.isInteger(a.index)
      ? `<button type="button" class="btn btn-primary btn-small" data-run-account="${a.index}" ${!usable || running || launching.has(a.index) ? "disabled" : ""
      } title="${U.escapeAttr(
        t("common.runOnlyTitle", { index: a.index }),
      )}">${launching.has(a.index) ? U.escapeHtml(t("common.starting")) : U.escapeHtml(t("common.runOnly"))}</button>`
      : "";

  const selectCheckbox =
    a.configured && Number.isInteger(a.index)
      ? `<label class="check acc-batch-select" title="${U.escapeAttr(
          t("accounts.batch.selectTitle", { index: a.index }),
        )}">
          <input type="checkbox" data-select-account="${a.index}" ${selectedForBatch.has(a.index) ? "checked" : ""}>
          <span>${U.escapeHtml(t("common.select"))}</span>
        </label>`
      : "";

  const { cls: statusIconCls, icon: statusIcon, label: statusLabel } = statusIconParts(statusKey);
  const isExpanded = expandedAccounts.has(a.key);
  const detailsId = `acc-details-${U.escapeAttr(a.key)}`;

  const chips = [
    protection
      ? `<span class="pill ${protection.pillClass}" title="${U.escapeAttr(
          t(protection.enabled
            ? "accounts.protection.chipTitleOn"
            : "accounts.protection.chipTitleOff", {
            streak: protection.streak,
            days: protection.daysLong,
          }),
        )}">${U.escapeHtml(
          t("accounts.protection.chip", {
            state: protection.state,
            days: protection.days,
          }),
        )}</span>`
      : "",
    earnableBadge(live || {}),
    sourceBreakdown(live || {}),
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="panel account-detail-panel">
        <div class="panel-head">
            <h2>
                <button type="button" class="acc-detail-toggle" data-toggle-details="${U.escapeAttr(a.key)}" aria-expanded="${isExpanded}" aria-controls="${detailsId}" title="${U.escapeAttr(
                  isExpanded
                    ? t("accounts.collapseDetails")
                    : t("accounts.expandDetails"),
                )}">\u25b8</button>
                <span class="acc-status-icon ${statusIconCls}" role="img" aria-label="${U.escapeAttr(
                  statusLabel,
                )}" title="${U.escapeAttr(statusLabel)}">${statusIcon}</span>${U.escapeHtml(a.email)}
            </h2>
            ${a.index != null ? `<span class="tag-mini acc-tag-account-id">ACCOUNT_${a.index}</span>` : ""}
            ${a.configured
              ? ""
              : `<span class="tag-mini">${U.escapeHtml(
                  t("common.unconfigured"),
                )}</span>`}
            <span class="acc-detail-actions">
                <span class="acc-status-pill">${U.statusPill(statusKey)}</span>
                ${selectCheckbox}
                ${runButton}
            </span>
        </div>
        <div class="panel-body" id="${detailsId}" ${isExpanded ? "" : "hidden"}>
            ${detailGroups(a, protection)}
        </div>
        ${chips ? `<div class="account-today-row">
            <span class="account-today-label">${U.escapeHtml(t("common.today"))}</span>
            <div class="account-today-chips">${chips}</div>
        </div>` : ""}
    </div>`;
}

function render(root) {
  const container = U.$("#accountsContainer", root);
  const accounts = accountsPayload?.accounts || [];

  const liveByEmail = new Map(
    (context?.status?.bot?.run?.accounts || []).map((la) => [la.email, la]),
  );

  const errEl = U.$("#accountsError", root);
  if (errEl) {
    errEl.hidden = !accountsPayload?.apiError;
    if (accountsPayload?.apiError) errEl.textContent = accountsPayload.apiError;
  }

  if (!accounts.length) {
    container.innerHTML = `<p class="empty-note" style="padding:1.25rem">${U.escapeHtml(
      t("common.noAccountsConfigured"),
    )}</p>`;
    renderBatchToolbar(root);
    return;
  }

  container.innerHTML = accounts.map(a => {
    const live = liveByEmail.get(a.email) || null;
    return renderAccountPanel(a, live);
  }).join("");

  container.querySelectorAll("button[data-run-account]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.runAccount);
      const account = accounts.find((a) => a.index === index);
      if (account) runAccount(account);
    }),
  );

  container.querySelectorAll("input[data-select-account]").forEach((input) =>
    input.addEventListener("change", () => {
      const index = Number(input.dataset.selectAccount);
      if (input.checked) selectedForBatch.add(index);
      else selectedForBatch.delete(index);
      renderBatchToolbar(root);
    }),
  );

  container.querySelectorAll("button[data-toggle-details]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.toggleDetails;
      if (expandedAccounts.has(key)) expandedAccounts.delete(key);
      else expandedAccounts.add(key);
      render(root);
    }),
  );

  renderBatchToolbar(root);
}

export default {
  id: "accounts",
  labelKey: "tab.accounts",
  interval: 10000,

  mount(root, ctx) {
    rootEl = root;
    context = ctx;
    root.innerHTML = `
      <p class="notice notice--warn" id="accountsError" hidden></p>
      <div class="panel batch-select-box" id="accountsBatchToolbar">
          <div class="batch-select-header">
              <h2 class="batch-select-title" data-i18n="accounts.batch.title">Batch run</h2>
              <div class="batch-select-controls">
                  <label class="check">
                      <input type="checkbox" id="accountsSelectAll">
                      <span data-i18n="accounts.batch.selectAll">Select all</span>
                  </label>
                  <span class="hint" id="accountsSelectedCount">${U.escapeHtml(
                    t("accounts.batch.selectedCount", { selected: 0, total: 0 }),
                  )}</span>
                  <button type="button" class="btn btn-primary btn-small" id="accountsRunSelected" disabled data-i18n="accounts.batch.runSelected">Run selected</button>
              </div>
          </div>
      </div>
      <div id="accountsContainer">
          <p class="empty-note" style="padding:1.25rem" data-i18n="accounts.loadingDetails">Loading accounts configuration details…</p>
      </div>
      <p class="hint" style="margin-top: 1.5rem;" data-i18n-html="accounts.footnote">Accounts are configured in the bot&rsquo;s <code>.env</code> (<code>ACCOUNT_N_*</code>).
      The control API exposes full local email addresses but never sends passwords, recovery addresses, TOTP secrets, or proxy credentials.</p>
    `;
    mounted = true;

    U.$("#accountsSelectAll", root).addEventListener("change", (e) => {
      const configured = selectableAccounts();
      if (e.target.checked) configured.forEach((a) => selectedForBatch.add(a.index));
      else selectedForBatch.clear();
      render(root);
    });

    U.$("#accountsRunSelected", root).addEventListener("click", () => {
      runSelectedAccounts();
    });
  },

  async refresh(ctx) {
    context = ctx;
    accountsPayload = await cached("accounts", ctx.api.accounts, 5000);
    this.redraw(ctx);
  },

  redraw(ctx) {
    context = ctx || context;
    if (!mounted || !accountsPayload) return;
    render(rootEl);
  }
};