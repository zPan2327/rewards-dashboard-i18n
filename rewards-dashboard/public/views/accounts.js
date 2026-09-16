import * as U from "../util.js";
import { cached } from "../api.js";
import { t, tp } from "../i18n/index.js";

let accountsPayload = null;
let rootEl = null;
let mounted = false;
let context = null;

const launching = new Set();
const selectedForBatch = new Set();
const expandedAccounts = new Set();
const expandedFeatures = new Set();
let batchRunning = false;

// Two-step delete: a key must be "armed" by a first click before a second
// click on the confirm button actually deletes anything, so there's no way
// to remove an account's dashboard data with a single accidental click.
const deleteArmed = new Set();
const deleting = new Set();

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
  "daily-set": "accounts.source.dailySet",
  "more-promotions": "accounts.source.morePromotions",
  "punchcard-child": "accounts.source.punchcardChild",
  "punchcard-data": "accounts.source.punchcardData",
  "app-data": "accounts.source.appData",
  "daily-check-in": "accounts.source.dailyCheckIn",
  "read-to-earn": "accounts.source.readToEarn",
  "visual-search": "accounts.source.visualSearchDash",
  "visual search": "accounts.source.visualSearchPlain",
  "bonus-search": "accounts.source.bonusSearch",
  "browser-search-api-report": "accounts.source.experimentalApi",
  "search-on-bing": "accounts.source.exploreOnBing",
  "url-reward": "accounts.source.websiteReward",
  "doEnsureStreakProtection": "accounts.source.streakProtection",
  doActivateSearchPerk: "accounts.source.searchPerk",
  doClaimBonusPoints: "accounts.source.bonusPointClaim",
  doVisualSearch: "accounts.source.visualSearchTask",
};

function controlState() {
  const status = context?.status;
  const usable = Boolean(status?.reachable && status?.authOk !== false);
  const running = Boolean(status?.botRunning);
  return { usable, running };
}

function selectableAccounts() {
  return (accountsPayload?.accounts || []).filter(
    (account) => account.configured && Number.isInteger(account.index),
  );
}

async function runAccount(account) {
  if (!context || !account.configured || !Number.isInteger(account.index)) return;

  launching.add(account.index);
  render(rootEl);
  try {
    await context.api.control("start", { accountIndex: account.index });
    context.toast(
      t("accounts.toast.runOnlyStarted", {
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

async function deleteAccount(account) {
  if (!context) return;

  deleteArmed.delete(account.key);
  expandedFeatures.delete(account.key);
  deleting.add(account.key);
  render(rootEl);
  try {
    await context.api.deleteDashboardAccount(account.email);
    context.toast(t("accounts.toast.deleted", { email: account.email }), "success");
    context.invalidate();
    await context.refresh();
  } catch (error) {
    context.toast(error.message, error.status === 409 ? "warn" : "error");
  } finally {
    deleting.delete(account.key);
    render(rootEl);
  }
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
  const startBody = excludedAccountIndexes.length ? { excludedAccountIndexes } : {};

  batchRunning = true;
  render(rootEl);
  try {
    await context.api.control("start", startBody);
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
  U.$(".accounts-run-selected-label", runBtn).textContent = batchRunning
    ? t("common.starting")
    : t("accounts.batch.runSelected");
}

function featureLabel(activity) {
  const name = cleanFeatureText(activity.activity || activity.name || "Activity");
  const legacyPromotion = /^(Daily set|More promotions):\s*["“](.+?)["”]$/i.exec(name);
  const sourceKey = name.charAt(0).toLowerCase() + name.slice(1);
  const labelKey =
    SOURCE_LABELS[name] ||
    SOURCE_LABELS[sourceKey] ||
    SOURCE_LABELS[name.toLowerCase()];
  const category = labelKey
    ? t(labelKey)
    : legacyPromotion?.[1] ||
      name
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
  const title = cleanFeatureText(activity.title || legacyPromotion?.[2] || "");
  return cleanFeatureText(title ? `${category}: ${title}` : category);
}

function cleanFeatureText(value) {
  return String(value).trim().replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "");
}

function featureState(reason, status) {
  if (/unavailable|not available|quota unavailable|perk unavailable/i.test(reason)) return "unavailable";
  if (status === "failed" || /\bfailed\b/i.test(reason)) return "failed";
  if (status === "skipped" || /\bskipped\b/i.test(reason)) return "skipped";
  return "unconfirmed";
}

function partialReasonFeatures(reason) {
  if (!reason) return [];
  return reason.split(/;\s*/).map(item => {
    const promotion = /^More promotions:\s*["“](.+?)["”]:\s*(.*)$/i.exec(item);
    const match = /^([^:]+):\s*(.*)$/.exec(item);
    if (!match) return null;
    const promotionTitle = /^More promotions\s*\((.+)\)$/i.exec(match[1].trim());
    const label = promotion?.[1] || promotionTitle?.[1] || match[1].trim();
    const detail = promotion?.[2] || match[2];
    return { label, state: featureState(detail, "unconfirmed"), reason: detail };
  }).filter(Boolean);
}

// last_error holds the list of incomplete features only for an account that
// finished "partial" (or, for rows recorded before outcomes were stored, one
// that succeeded with a reason). For failed/cancelled accounts it is a plain
// error message and must not be split into pseudo-features.
function partialReason(account) {
  if (account.lastOutcome === "partial") return account.lastError;
  if (account.lastOutcome == null && account.status === "success") return account.lastError;
  return null;
}

function featureChips(account, afterEarned = "") {
  const activities = Array.isArray(account.activities) ? account.activities : [];
  const earned = new Map();
  const outstanding = new Map();
  const activityLabels = new Set();

  function addChip(collection, key, label, detail, reason) {
    let chip = collection.get(key);
    if (!chip) {
      chip = { label, detail, count: 0, reasons: new Set() };
      collection.set(key, chip);
    }
    chip.count += 1;
    if (reason) chip.reasons.add(reason);
  }

  for (const activity of activities) {
    const label = featureLabel(activity);
    const key = label.toLowerCase();
    const reason = [activity.reason, activity.message].filter(Boolean).join("; ");
    const alreadyComplete = activity.status === "skipped" && /already[- ]complete|offer-state-confirmed/i.test(reason);
    if (activity.status === "confirmed" || activity.status === "completed" || alreadyComplete) {
      const points = alreadyComplete
        ? t("accounts.activity.alreadyComplete")
        : activity.pointsKnown === false || activity.pointsGained == null
        ? t("accounts.activity.pointsUnverified")
        : t("accounts.activity.points", {
            points: U.fmtSigned(Number(activity.pointsGained)),
          });
      addChip(earned, `${key}|${points.toLowerCase()}`, label, points, reason);
      activityLabels.add(key);
    } else if (["unconfirmed", "skipped", "failed", "unavailable"].includes(activity.status)) {
      const state = featureState(reason, activity.status);
      addChip(outstanding, `${key}|${state}`, label, state, reason);
      activityLabels.add(key);
    }
  }

  for (const item of partialReasonFeatures(account.lastError)) {
    const label = cleanFeatureText(item.label);
    const key = label.toLowerCase();
    if (activityLabels.has(key)) continue;
    addChip(outstanding, `${key}|${item.state}`, label, item.state, item.reason);
  }

  if (!earned.size) {
    for (const [source, points] of Object.entries(account.live?.bySource || {})) {
      if (Number(points) <= 0) continue;
      const label = SOURCE_LABELS[source]
        ? t(SOURCE_LABELS[source])
        : source
            .replace(/[-_]/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());
      addChip(
        earned,
        `${label.toLowerCase()}|${points}`,
        label,
        t("accounts.activity.points", { points: U.fmtSigned(Number(points)) }),
      );
    }
  }

  const renderChips = (chips, className) => [...chips.values()].map((chip) => {
    const count = chip.count > 1 ? ` x${chip.count}` : "";
    const title = [...chip.reasons].join("; ") || chip.label;
    return `<span class="point-source ${className}" title="${U.escapeAttr(title)}"><strong>${U.escapeHtml(chip.label)}</strong> ${U.escapeHtml(chip.detail + count)}</span>`;
  });

  return [...renderChips(earned, "point-source--complete"), afterEarned, ...renderChips(outstanding, "point-source--target")].join("");
}

// Day totals the per-activity chips can't show: script points no activity line
// accounts for, and balance movement from outside the script (e.g. Xbox).
function reconciliationChips(account, activities) {
  const history = (accountsPayload?.histories || {})[account.key] || [];
  if (!history.length) return "";
  const todayKey = U.tzDayKey(new Date());
  const scriptToday = history
    .filter((h) => U.tzDayKey(h.ts) === todayKey)
    .reduce((sum, h) => sum + (h.gained ?? 0), 0);
  const trueToday = U.bucketByDay(history).find((d) => d.dayKey === todayKey)?.gained;
  if (trueToday == null) return "";

  const chips = [];
  const list = Array.isArray(activities) ? activities : [];
  if (list.length) {
    const attributed = list.reduce(
      (sum, a) => sum + (a.status === "completed" || a.status === "confirmed" ? Number(a.pointsGained) || 0 : 0),
      0,
    );
    const unattributed = scriptToday - attributed;
    if (unattributed > 0) {
      chips.push(`<span class="point-source point-source--complete" title="${U.escapeAttr(t("accounts.activity.otherScriptPointsTitle"))}"><strong>${U.escapeHtml(t("accounts.activity.otherScriptPoints"))}</strong> ${U.escapeHtml(t("accounts.activity.points", { points: U.fmtSigned(unattributed) }))}</span>`);
    }
  }
  const outside = trueToday - scriptToday;
  if (outside !== 0) {
    chips.push(`<span class="point-source point-source--complete" title="${U.escapeAttr(t("accounts.activity.outsideScriptTitle"))}"><strong>${U.escapeHtml(t("accounts.activity.outsideScript"))}</strong> ${U.escapeHtml(t("accounts.activity.points", { points: U.fmtSigned(outside) }))}</span>`);
  }
  return chips.join("");
}

function earnableChips(account) {
  const earnable = account.earnable || account.live?.earnable;
  if (!earnable) return "";
  const labels = {
    mobile: "accounts.earnable.mobile",
    browser: "accounts.earnable.desktop",
    app: "accounts.earnable.app",
  };
  return Object.entries(labels)
    .filter(([key]) => Number(earnable[key]) > 0)
    .map(
      ([key, labelKey]) =>
        `<span class="point-source point-source--target"><strong>${U.escapeHtml(
          t(labelKey),
        )}</strong> ${U.escapeHtml(U.fmtNumber(earnable[key]))} ${U.escapeHtml(
          t("accounts.earnable.suffix"),
        )}</span>`,
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
        `<div><dt>${U.escapeHtml(k)}</dt><dd>${U.escapeHtml(String(v))}</dd></div>`,
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
function renderAccountPanel(a, live) {
  const protection = protectionPresentation(a);
  // The API's live activity list is memory-only; the log-derived one survives restarts.
  const usingLoggedActivities =
    !(Array.isArray(live?.activities) && live.activities.length) &&
    Array.isArray(a.activities) &&
    a.activities.length > 0;
  const { usable, running } = controlState();
  const displayStatus = U.accountDisplayStatus(
    a,
    live,
    Boolean(context?.status?.botRunning),
  );

  // Accounts now start one at a time (accountDelay), so mid-run there can be
  // several accounts that already finished this run while another is still
  // going - `live` just means "has a record in this run", true for both.
  // The stored account status remains the outcome source. A pending account
  // in the active Control API run can override only the watchdog's synthetic
  // stalled error for display, so finished account outcomes stay intact.
  // Mirrors overview.js: while waiting between accounts, the one named by
  // pendingDelay.nextEmail is up next, so it reads as "pending" rather than
  // whatever its last-observed status happened to be.
  const nextAccountEmail = context?.status?.pendingDelay?.nextEmail || null;
  const statusKey = launching.has(a.index)
    ? "starting"
    : U.sleepRemainingSec(context?.status) != null && a.configured
      ? "sleeping"
      : displayStatus !== "running" && nextAccountEmail && a.email === nextAccountEmail
      ? "pending"
      : displayStatus;

  const runButton =
    a.configured && Number.isInteger(a.index)
      ? `<button type="button" class="btn btn-primary btn-small acc-run-button" data-run-account="${a.index}" aria-label="${U.escapeAttr(
        t("common.runOnlyTitle", { index: a.index }),
      )}" ${!usable || running || launching.has(a.index) ? "disabled" : ""
      } title="${U.escapeAttr(
        t("common.runOnlyTitle", { index: a.index }),
      )}"><i class="ph ph-play acc-run-icon" aria-hidden="true"></i><span class="acc-run-label">${launching.has(a.index) ? U.escapeHtml(t("common.starting")) : U.escapeHtml(t("common.runOnly"))}</span></button>`
      : "";

  const selectCheckbox =
    a.configured && Number.isInteger(a.index)
      ? `<label class="check acc-batch-select" title="${U.escapeAttr(
          t("accounts.batch.selectTitle", { index: a.index }),
        )}">
          <input type="checkbox" data-select-account="${a.index}" aria-label="${U.escapeAttr(
            t("accounts.batch.selectTitle", { index: a.index }),
          )}" ${selectedForBatch.has(a.index) ? "checked" : ""}>
          <span>${U.escapeHtml(t("common.select"))}</span>
        </label>`
      : "";

  const isExpanded = expandedAccounts.has(a.key);
  const detailsId = `acc-details-${U.escapeAttr(a.key)}`;

  const isDeleting = deleting.has(a.key);
  const deleteBlocked = displayStatus === "running" || launching.has(a.index);
  const deleteButton = deleteArmed.has(a.key)
    ? `<span class="acc-delete-confirm">
        <button type="button" class="btn btn-icon btn-small" data-cancel-delete="${U.escapeAttr(a.key)}" aria-label="${U.escapeAttr(t("accounts.delete.cancel"))}" ${isDeleting ? "disabled" : ""} title="${U.escapeAttr(t("accounts.delete.cancel"))}"><i class="ph ph-x" aria-hidden="true"></i></button>
        <button type="button" class="btn btn-danger btn-icon btn-small" data-confirm-delete="${U.escapeAttr(a.key)}" aria-label="${U.escapeAttr(t("accounts.delete.confirm"))}" ${isDeleting ? "disabled" : ""} title="${U.escapeAttr(t("accounts.delete.confirmTitle"))}">
          <i class="ph ph-trash" aria-hidden="true"></i>
        </button>
      </span>`
    : `<button type="button" class="btn btn-danger btn-icon btn-small" data-arm-delete="${U.escapeAttr(a.key)}" aria-label="${U.escapeAttr(t("accounts.delete.arm"))}" ${deleteBlocked ? "disabled" : ""} title="${U.escapeAttr(deleteBlocked ? t("accounts.delete.blocked") : t("accounts.delete.armTitle"))}"><i class="ph ph-trash" aria-hidden="true"></i></button>`;

  const protectionChip = protection
    ? `<span class="account-rail-icon ${protection.pillClass}" role="img" aria-label="${U.escapeAttr(t("accounts.protection.chip", { state: protection.state, days: protection.days }))}" title="${U.escapeAttr(t(protection.enabled ? "accounts.protection.chipTitleOn" : "accounts.protection.chipTitleOff", { streak: protection.streak, days: protection.daysLong }))}"><i class="ph ${a.streakProtectionEnabled ? "ph-shield-check" : "ph-shield"}" aria-hidden="true"></i></span>`
    : "";
  const status = U.pillParts(statusKey);
  const statusIcons = {
    full: "ph-check-circle",
    success: "ph-check-circle",
    partial: "ph-warning-circle",
    skipped: "ph-skip-forward-circle",
    done: "ph-check-circle",
    error: "ph-x-circle",
    crashed: "ph-x-circle",
    interrupted: "ph-pause-circle",
    stopped: "ph-pause-circle",
    running: "ph-circle-notch",
    starting: "ph-circle-notch",
    stopping: "ph-stop-circle",
    pending: "ph-clock",
    sleeping: "ph-moon",
    stalled: "ph-pause-circle",
    idle: "ph-minus-circle",
  };
  const statusRail = `
    <aside class="account-status-rail" aria-label="${U.escapeAttr(t("accounts.statusRail"))}">
      <span class="account-rail-icon ${status.cls}" role="img" aria-label="${U.escapeAttr(status.label)}" title="${U.escapeAttr(status.label)}"><i class="ph ${statusIcons[statusKey] || statusIcons.idle}" aria-hidden="true"></i></span>
    </aside>`;
  const featureChipsHtml = [
    featureChips({
      ...(live || {}),
      ...(usingLoggedActivities ? { activities: a.activities } : {}),
      lastError: usingLoggedActivities
        ? null
        : displayStatus !== a.status
          ? live?.error || null
          : partialReason(a) || live?.error,
    }, reconciliationChips(a, usingLoggedActivities ? a.activities : live?.activities)),
    earnableChips({ ...(live || {}), earnable: live?.earnable || a.earnable }),
  ].filter(Boolean).join("");
  const counts = a.activityCounts;
  const countsParts = counts
    ? [
        ["accounts.activity.completed", counts.completed],
        ["accounts.activity.incomplete", counts.incomplete],
        ["accounts.activity.unavailable", counts.unavailable],
        ["accounts.activity.notApplicable", counts.notApplicable],
      ]
        .filter(([, n]) => n != null)
        .map(([key, n]) => t(key, { count: n }))
        .join(", ")
    : "";
  const countsTitle = countsParts
    ? t("accounts.activity.countsTitle", { counts: countsParts })
    : "";
  const featuresOpen = expandedFeatures.has(a.key);
  const featureDetails = `<details class="account-feature-details" data-feature-details="${U.escapeAttr(a.key)}" ${featuresOpen ? "open" : ""}>
      <summary${countsTitle ? ` title="${U.escapeAttr(countsTitle)}"` : ""}><span class="acc-detail-toggle account-feature-caret" aria-hidden="true"><i class="ph ph-caret-right"></i></span><span>${U.escapeHtml(t("accounts.activity.heading"))}</span></summary>
      <div class="account-feature-chips">${featureChipsHtml || `<span class="point-source">${U.escapeHtml(t("accounts.activity.empty"))}</span>`}</div>
    </details>`;

  return `
    <div class="panel account-detail-panel">
      <div class="account-primary-row">
        ${statusRail}
        <div class="account-card-main">
          <div class="panel-head">
            <h2>
                <button type="button" class="acc-detail-toggle" data-toggle-details="${U.escapeAttr(a.key)}" aria-expanded="${isExpanded}" aria-controls="${detailsId}" title="${U.escapeAttr(isExpanded ? t("accounts.collapseDetails") : t("accounts.expandDetails"))}"><i class="ph ph-caret-right" aria-hidden="true"></i></button>
              ${U.escapeHtml(a.email)}
            </h2>
            ${a.index != null ? `<span class="tag-mini acc-tag-account-id">ACCOUNT_${a.index}</span>` : ""}
            ${a.configured ? "" : `<span class="tag-mini">${U.escapeHtml(t("common.unconfigured"))}</span>`}
          </div>
        </div>
        <span class="acc-detail-actions">${selectCheckbox}${runButton}</span>
      </div>
      <div class="panel-body account-detail-body" id="${detailsId}" ${isExpanded ? "" : "hidden"}>
        ${detailGroups(a, protection)}
      </div>
      <div class="account-secondary-row">
        <aside class="account-protection-rail" aria-label="${U.escapeAttr(t("accounts.protection.railLabel"))}">${protectionChip}</aside>
        ${featureDetails}
        <div class="acc-feature-actions">${deleteButton}</div>
      </div>
    </div>`;
}

function render(root) {
  const container = U.$("#accountsContainer", root);
  const accounts = accountsPayload?.accounts || [];

  const liveByEmail = U.runAccountMap(context?.status);
  const errEl = U.$("#accountsError", root);
  if (errEl) {
    errEl.hidden = !accountsPayload?.apiError;
    if (accountsPayload?.apiError) errEl.textContent = accountsPayload.apiError;
  }

  if (!accounts.length) {
    container.innerHTML = `<p class="empty-note" style="padding:1.25rem">${U.escapeHtml(t("common.noAccountsConfigured"))}</p>`;
    renderBatchToolbar(root);
    return;
  }

  container.innerHTML = accounts.map(a => {
    const live = liveByEmail.get(a.email.trim().toLowerCase()) || null;
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

  container.querySelectorAll("details[data-feature-details]").forEach((details) =>
    details.addEventListener("toggle", () => {
      const key = details.dataset.featureDetails;
      if (details.open) expandedFeatures.add(key);
      else expandedFeatures.delete(key);
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

  container.querySelectorAll("button[data-arm-delete]").forEach((btn) =>
    btn.addEventListener("click", () => {
      deleteArmed.add(btn.dataset.armDelete);
      render(root);
    }),
  );

  container.querySelectorAll("button[data-cancel-delete]").forEach((btn) =>
    btn.addEventListener("click", () => {
      deleteArmed.delete(btn.dataset.cancelDelete);
      render(root);
    }),
  );

  container.querySelectorAll("button[data-confirm-delete]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const key = btn.dataset.confirmDelete;
      const account = accounts.find((a) => a.key === key);
      if (account) deleteAccount(account);
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
                  <button type="button" class="btn btn-primary btn-small accounts-run-selected" id="accountsRunSelected" aria-label="Run selected accounts" title="Run selected accounts" data-i18n-aria-label="accounts.batch.runSelected" data-i18n-title="accounts.batch.runSelected" disabled><i class="ph ph-play accounts-run-selected-icon" aria-hidden="true"></i><span class="accounts-run-selected-label" data-i18n="accounts.batch.runSelected">Run selected</span></button>
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