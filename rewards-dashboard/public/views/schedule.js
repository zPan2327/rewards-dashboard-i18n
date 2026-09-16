import * as U from "../util.js";
import { t } from "../i18n/index.js";
import { localizeCronResult } from "../i18n/cronText.js";

const PRESETS = [
  ["schedule.preset.daily9", "0 9 * * *"],
  ["schedule.preset.twiceDaily", "0 9,21 * * *"],
  ["schedule.preset.every6h", "0 */6 * * *"],
  ["schedule.preset.every12h", "0 */12 * * *"],
  ["schedule.preset.weekdays8", "0 8 * * 1-5"],
];

const TARGET_LABEL = {
  local: "schedule.target.local",
  remote: "schedule.target.remote",
};

let rootEl = null;
let data = { local: null, remote: null, remoteSupported: false };
let target = "local";
let initialTargetChosen = false;
let current = null;
let dirty = false;
let accountOptions = [];

function syncCurrent() {
  current = data ? data[target] : null;
}

function fields() {
  const base = {
    enabled: U.$("#schedEnabled", rootEl).checked,
    cron: U.$("#schedCron", rootEl).value.trim(),
    skipIfRunning: U.$("#schedSkip", rootEl).checked,
    excludedAccountIndexes: U.$$(
      "input[data-exclude-account]:checked",
      rootEl,
    ).map((input) => Number(input.dataset.excludeAccount)),
  };
  if (target === "local") {
    base.misfirePolicy = U.$("#schedMisfire", rootEl).value;
    base.misfireGraceMinutes = Number(U.$("#schedGrace", rootEl).value);
  }
  return base;
}

function markDirty() {
  dirty = true;
  U.$("#schedSave", rootEl).disabled = false;
}

function paintTargetToggle() {
  const remoteBtn = U.$("#schedTargetRemote", rootEl);
  const localBtn = U.$("#schedTargetLocal", rootEl);
  if (!remoteBtn || !localBtn) return;

  remoteBtn.hidden = !data.remoteSupported;
  if (target === "remote" && !data.remoteSupported) target = "local";

  localBtn.setAttribute("aria-pressed", String(target === "local"));
  localBtn.classList.toggle("seg-btn--active", target === "local");
  remoteBtn.setAttribute("aria-pressed", String(target === "remote"));
  remoteBtn.classList.toggle("seg-btn--active", target === "remote");

  const bothActive = Boolean(
    data.local?.enabled && data.remote?.enabled && data.remoteSupported,
  );
  const warning = U.$("#schedDualWarning", rootEl);
  if (warning) warning.hidden = !bothActive;

  const note = U.$("#schedTargetNote", rootEl);
  if (note) {
    note.textContent =
      target === "remote"
        ? t("schedule.targetNote.remote")
        : t("schedule.targetNote.local");
  }
}

function paint() {
  syncCurrent();
  paintTargetToggle();

  const misfireGroup = U.$("#schedMisfireGroup", rootEl);
  if (misfireGroup) misfireGroup.hidden = target === "remote";

  if (!current) {
    U.$("#schedFormBody", rootEl).hidden = true;
    U.$("#schedUnavailable", rootEl).hidden = false;
    U.$("#schedSave", rootEl).disabled = true;
    return;
  }
  U.$("#schedFormBody", rootEl).hidden = false;
  U.$("#schedUnavailable", rootEl).hidden = true;

  U.$("#schedEnabled", rootEl).checked = Boolean(current.enabled);
  U.$("#schedCron", rootEl).value = current.cron || "";
  U.$("#schedSkip", rootEl).checked = current.skipIfRunning !== false;
  if (target === "local") {
    U.$("#schedMisfire", rootEl).value = current.misfirePolicy || "skip";
    U.$("#schedGrace", rootEl).value = current.misfireGraceMinutes || 60;
    U.$("#schedGraceField", rootEl).hidden =
      U.$("#schedMisfire", rootEl).value !== "grace-period";
  }
  renderAccountExclusions();

  U.$("#schedNext", rootEl).textContent = current.enabled
    ? current.nextRunAt
      ? `${U.fmtDateTime(current.nextRunAt)} (${U.fmtRelative(current.nextRunAt)})`
      : t("schedule.notScheduled")
    : t("common.disabled");

  if (target === "local") {
    U.$("#schedLast", rootEl).textContent = current.lastTriggeredAt
      ? U.fmtDateTime(current.lastTriggeredAt)
      : "\u2013";
    U.$("#schedResult", rootEl).textContent = current.lastResult || "\u2013";
  } else {
    U.$("#schedLast", rootEl).textContent = "\u2013";
    U.$("#schedResult", rootEl).textContent = t("schedule.notTracked");
  }

  const excluded = current.excludedAccountIndexes || [];
  U.$("#schedExcluded", rootEl).textContent = excluded.length
    ? excluded.map((index) => `ACCOUNT_${index}`).join(", ")
    : t("common.none");

  const tzLabel = U.$("#schedTz", rootEl);
  if (target === "local") {
    const offset = current.timezoneOffsetMinutes;
    const sign = offset >= 0 ? "+" : "-";
    const abs = Math.abs(offset || 0);
    tzLabel.textContent =
      offset == null
        ? "\u2013"
        : `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  } else {
    tzLabel.textContent = current.timezone || "\u2013";
  }

  dirty = false;
  U.$("#schedSave", rootEl).disabled = true;
  describe(current.cron || "");
}

function renderAccountExclusions() {
  const host = U.$("#schedAccounts", rootEl);
  if (!host) return;
  if (!accountOptions.length) {
    host.innerHTML = `<p class="empty-note">${U.escapeHtml(
      t("schedule.noAccounts"),
    )}</p>`;
    return;
  }
  const excluded = new Set(current?.excludedAccountIndexes || []);
  host.innerHTML = accountOptions
    .map(
      (account) => `<label class="check check--row">
                <input type="checkbox" data-exclude-account="${account.index}" ${excluded.has(account.index) ? "checked" : ""}>
                <span>${U.escapeHtml(
                  t("schedule.excludeAccount", {
                    index: account.index,
                    email: account.email,
                  }),
                )}</span>
            </label>`,
    )
    .join("");
  U.$$("input[data-exclude-account]", host).forEach((input) =>
    input.addEventListener("change", markDirty),
  );
}

async function describe(expr) {
  const out = U.$("#schedDesc", rootEl);
  if (!expr) {
    out.textContent = t("schedule.enterCron");
    out.className = "sched-desc";
    return;
  }
  try {
    const res = await (
      await fetch(`/api/cron?expr=${encodeURIComponent(expr)}`)
    ).json();
    out.textContent = localizeCronResult(res);
    out.className = `sched-desc ${res.valid ? "sched-desc--ok" : "sched-desc--bad"}`;
    U.$("#schedSave", rootEl).disabled = !res.valid || !dirty;
  } catch {
    out.textContent = "";
  }
}

export default {
  id: "schedule",
  labelKey: "tab.schedule",
  interval: 30000,

  mount(root, ctx) {
    rootEl = root;
    root.innerHTML = `
            <section class="panel" aria-labelledby="sched-heading">
                <div class="panel-head">
                    <h2 id="sched-heading" data-i18n="schedule.title">Automatic runs</h2>
                    <span class="panel-sub" data-i18n="schedule.subtitle">Two schedulers are available &mdash; pick the one that fits your setup</span>
                </div>

                <div class="seg" id="schedTargetToggle" role="radiogroup" aria-label="Scheduler location" data-i18n-aria-label="schedule.targetLabel">
                    <button type="button" class="seg-btn seg-btn--active" id="schedTargetLocal" data-target="local" aria-pressed="true" data-i18n="schedule.target.local">${U.escapeHtml(t(TARGET_LABEL.local))}</button>
                    <button type="button" class="seg-btn" id="schedTargetRemote" data-target="remote" aria-pressed="false" hidden data-i18n="schedule.target.remote">${U.escapeHtml(t(TARGET_LABEL.remote))}</button>
                </div>
                <p class="hint" id="schedTargetNote"></p>
                <p class="empty-note chart-empty" id="schedDualWarning" hidden data-i18n="schedule.dualWarning">
                    Both schedulers are currently enabled &mdash; runs may double-fire. Disable one of them below.
                </p>

                <div class="form" id="schedFormBody">
                    <label class="check check--row">
                        <input type="checkbox" id="schedEnabled">
                        <span><strong data-i18n="schedule.enabledLabel">Enabled</strong> &mdash; <span data-i18n="schedule.enabledHint">fire runs on the schedule below</span></span>
                    </label>

                    <div id="schedMisfireGroup">
                        <label class="field">
                            <span data-i18n="schedule.misfireLabel">If a run was missed while the dashboard was offline</span>
                            <select id="schedMisfire" class="input">
                                <option value="skip" data-i18n="schedule.misfire.skip">Skip it</option>
                                <option value="run-on-startup" data-i18n="schedule.misfire.runOnStartup">Run once after startup</option>
                                <option value="grace-period" data-i18n="schedule.misfire.gracePeriod">Run only within a grace period</option>
                            </select>
                        </label>

                        <label class="field" id="schedGraceField" hidden>
                            <span data-i18n="schedule.graceLabel">Grace period in minutes</span>
                            <input id="schedGrace" class="input" type="number" min="1" max="1440" value="60">
                        </label>
                    </div>

                    <fieldset class="field">
                        <legend data-i18n="schedule.excludedAccounts">Excluded accounts</legend>
                        <div id="schedAccounts" class="schedule-account-list">
                            <p class="empty-note" data-i18n="schedule.loadingAccounts">Loading configured accounts…</p>
                        </div>
                    </fieldset>

                    <label class="field">
                        <span data-i18n="schedule.cronLabel">Cron expression</span>
                        <input id="schedCron" class="input input--mono" type="text" placeholder="0 9 * * *"
                               spellcheck="false" autocomplete="off" aria-describedby="schedDesc">
                    </label>
                    <p class="sched-desc" id="schedDesc"></p>

                    <div class="preset-row" id="schedPresets">
                        ${PRESETS.map(
      ([label, expr]) =>
        `<button type="button" class="chip-btn" data-cron="${U.escapeAttr(expr)}" title="${U.escapeAttr(expr)}">${U.escapeHtml(t(label))}</button>`,
    ).join("")}
                    </div>

                    <label class="check check--row">
                        <input type="checkbox" id="schedSkip">
                        <span><strong data-i18n="schedule.skipIfRunning">Skip if already running</strong> &mdash; <span data-i18n="schedule.skipIfRunningHint">don&rsquo;t start a second run on top of one in progress</span></span>
                    </label>

                    <div class="form-actions">
                        <button type="button" id="schedSave" class="btn btn-primary" disabled data-i18n="schedule.save">Save schedule</button>
                        <button type="button" id="schedReset" class="btn" data-i18n="schedule.discard">Discard changes</button>
                    </div>
                </div>
                <p class="empty-note" id="schedUnavailable" hidden data-i18n="schedule.unavailable">
                    Could not read this scheduler&rsquo;s current state. It will refresh automatically &mdash; if this
                    persists, check that the bot's Control API is reachable and API_ALLOW_SCHEDULE_WRITE is set if you
                    want to edit it from here.
                </p>
            </section>

            <section class="panel" aria-labelledby="sched-state-heading">
                <div class="panel-head"><h2 id="sched-state-heading" data-i18n="schedule.stateHeading">Current state</h2></div>
                <dl class="kv">
                    <div><dt data-i18n="schedule.nextRun">Next run</dt><dd id="schedNext">\u2013</dd></div>
                    <div><dt data-i18n="schedule.lastTriggered">Last triggered</dt><dd id="schedLast">\u2013</dd></div>
                    <div><dt data-i18n="schedule.lastResult">Last result</dt><dd id="schedResult">\u2013</dd></div>
                    <div><dt data-i18n="schedule.excludedAccounts">Excluded accounts</dt><dd id="schedExcluded">\u2013</dd></div>
                    <div><dt data-i18n="schedule.timezone">Timezone</dt><dd id="schedTz">\u2013</dd></div>
                </dl>
                <p class="hint" data-i18n-html="schedule.footnote">Times are evaluated in the scheduler&rsquo;s own timezone (dashboard: its <code>TZ</code>;
                bot container: its own <code>TZ</code>). If a scheduler's host was offline, the local scheduler applies
                its missed-run policy at startup &mdash; the container scheduler simply didn&rsquo;t fire.</p>
            </section>`;

    const cronInput = U.$("#schedCron", root);
    cronInput.addEventListener(
      "input",
      U.debounce(() => {
        markDirty();
        describe(cronInput.value.trim());
      }, 250),
    );
    U.$("#schedEnabled", root).addEventListener("change", markDirty);
    U.$("#schedSkip", root).addEventListener("change", markDirty);
    U.$("#schedMisfire", root).addEventListener("change", (event) => {
      U.$("#schedGraceField", root).hidden =
        event.target.value !== "grace-period";
      markDirty();
    });
    U.$("#schedGrace", root).addEventListener("input", markDirty);

    U.$("#schedPresets", root).addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-cron]");
      if (!btn) return;
      cronInput.value = btn.dataset.cron;
      markDirty();
      describe(btn.dataset.cron);
    });

    U.$("#schedTargetToggle", root).addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-target]");
      if (!btn || btn.hidden) return;
      const next = btn.dataset.target;
      if (next === target) return;
      if (
        dirty &&
        !window.confirm(t("schedule.confirmDiscard"))
      ) {
        return;
      }
      target = next;
      paint();
    });

    U.$("#schedReset", root).addEventListener("click", () => paint());

    U.$("#schedSave", root).addEventListener("click", async () => {
      const patch = fields();
      const btn = U.$("#schedSave", root);
      if (
        accountOptions.length &&
        patch.excludedAccountIndexes.length >= accountOptions.length
      ) {
        U.toast(t("schedule.toast.needsAccount"), "error");
        return;
      }
      btn.disabled = true;
      try {
        data = await ctx.api.saveSchedule(patch, target);
        paint();
        U.toast(
          t(
            patch.enabled ? "schedule.toast.armed" : "schedule.toast.disabled",
            { target: t(TARGET_LABEL[target]) },
          ),
          "success",
        );
        ctx.invalidate();
      } catch (e) {
        btn.disabled = false;
        U.toast(e.message, "error");
      }
    });
  },

  async refresh(ctx) {
    if (dirty) return;
    const [scheduleResp, accountsPayload] = await Promise.all([
      ctx.api.schedule(),
      ctx.api.accounts(0),
    ]);
    data = scheduleResp;

    // Land on whichever scheduler is actually doing something, the first
    // time we have real data to look at. Only ever runs once — after that,
    // whatever the person clicked wins, including on later refreshes.
    if (!initialTargetChosen) {
      initialTargetChosen = true;
      target =
        data.remoteSupported && data.remote?.enabled && !data.local?.enabled
          ? "remote"
          : "local";
    }

    accountOptions = (accountsPayload.accounts || []).filter(
      (account) => account.configured && Number.isInteger(account.index),
    );
    paint();
  },
};
