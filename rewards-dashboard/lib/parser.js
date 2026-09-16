"use strict";

// ---------------------------------------------------------------------------
// LOCAL FORK PATCH - BILINGUAL LOG PARSING
// ---------------------------------------------------------------------------
// The microsoft-rewards-script:china image emits its log MESSAGES in Chinese;
// those templates are compiled into dist/index.js and there is no language
// switch. Upstream's regexes below only matched the English wording, so every
// structured event silently degraded to "generic" and this dashboard's runs /
// account history / streak tables stayed empty forever.
//
// CONTRACT SOURCE: the bot ships its own Chinese-aware parser at
//   microsoft-rewards-script : scripts/api/logParser.js
// (its RE object: "All patterns adapted for the Chinese-localized fork").
// If the bot ever rewords a Chinese message, that file changes first - mirror
// the change here too. Wrapper (run_daily.sh) lines are NOT translated - they
// come from bash, not Logger.ts - and are intentionally left untouched.
//
// Group counts/order of each original regex are preserved, so no am[n] index
// elsewhere needs to change. The one exception is FLOW_FAILED_RE, which had to
// gain a branch; its consumer was updated in the same patch.
// ---------------------------------------------------------------------------

// Docker prepends an RFC3339Nano timestamp (because we request timestamps=1),
// e.g: "2026-07-01T12:03:12.123456789Z <rest of line>"
const DOCKER_TS_RE = /^(\S+)\s([\s\S]*)$/;

// App log format (src/logging/Logger.ts):
// [localTime] [userName] [LEVEL] PLATFORM [TITLE] message
const APP_LINE_RE =
  /^\[([^\]]+)\]\s\[([^\]]+)\]\s\[([^\]]+)\]\s(\S+)\s\[([^\]]+)\]\s([\s\S]*)$/;

const ACCOUNT_START_RE =
  /^(?:Starting account|开始处理账户):\s(\S+)\s\|\sgeoLocale:\s([^|]*?)\s*(?:\|.*)?$/;
const ACCOUNT_END_RE =
  /^(?:(?:Completed|Finished) account|账户完成):\s(\S+)\s\|\s(?:pointsGained|获得积分)=(-?\d+(?:\.\d+)?|unknown)\s\|\s(?:previousBalance|原余额)=(\d+(?:\.\d+)?)\s\|\s(?:currentBalance|现余额)=(\d+(?:\.\d+)?)\s\|\s(?:durationSeconds|持续秒数)=([\d.]+)(?:\s\|\sstatus=(\S+))?(?:\s\|\sreason=("(?:[^"\\]|\\.)*"|[\s\S]*?))?(?:\s\|\sactivities:\s([\s\S]*))?$/;
const ACCOUNT_ERR_RE = /^(\S+@\S+)(?::\s|\s\|\s错误=)([\s\S]*)$/;

// "<activity> | <state> | points earned: <n|unverified>[ | <detail>]"
const ACTIVITY_RESULT_RE =
  /^(.+?)\s\|\s([^|]+?)\s\|\spoints earned:\s(-?\d+(?:\.\d+)?|unverified)(?:\s\|\s([\s\S]*))?$/;
const ACTIVITY_PROMOTION_RE = /^(.+?):\s*["“](.+)["”]$/;
// ACCOUNT-END tail, e.g. "8 completed, 6 incomplete, 2 unavailable, 3 not applicable"
const ACTIVITY_COUNT_RE = /(\d+)\s(completed|incomplete|unavailable|not applicable)/g;

function parseActivityCounts(raw) {
  if (!raw) return null;
  const keys = {
    completed: "completed",
    incomplete: "incomplete",
    unavailable: "unavailable",
    "not applicable": "notApplicable",
  };
  const counts = {};
  for (const m of raw.matchAll(ACTIVITY_COUNT_RE)) counts[keys[m[2]]] = Number(m[1]);
  return Object.keys(counts).length ? counts : null;
}

function activityStatus(state) {
  if (/^completed|request sent/i.test(state)) return "completed";
  if (/unavailable/i.test(state)) return "unavailable";
  if (/not applicable/i.test(state)) return "notApplicable";
  if (/failed/i.test(state)) return "failed";
  if (/skipped/i.test(state)) return "skipped";
  return "unconfirmed";
}

// src/index.ts's per-account flow wrapper (Mobile.ts / Desktop.ts) logs this
// under title FLOW at ERROR level when an account's automation throws -
// e.g. a login timeout - but does NOT also log a titled ACCOUNT-ERROR line
// for it. That means an account that dies this way looks, to everything
// keyed off the ACCOUNT-ERROR title (account resolution counts, the
// dashboard's own "is this account still running" check), exactly like a
// worker that's still silently in progress - it never leaves 'running'.
// Observed in production for both the mobile and desktop flow wrappers, so
// this is treated as an equally authoritative account-level failure signal.
// v4 logged "Mobile flow failed" / "Desktop flow failed"; v5 logs "Account
// flow failed" - all three are accepted.
const FLOW_FAILED_RE =
  /^(?:(?:Mobile|Desktop|Account) flow failed for\s(\S+@\S+)|(\S+@\S+)\s的[^:]*?流程失败):\s*([\s\S]*)$/;
const RUN_START_RE =
  /^(?:Starting Microsoft Rewards Script|启动微软奖励脚本)\s\|\sv([\w.\-]+)\s\|\s(?:Accounts|账户数):\s(\d+)\s\|\s(?:Clusters|集群数):\s(\d+)\s*$/;
const RUN_END_RE =
  /^(?:(?:Completed all accounts|Run interrupted)|全部账户完成)\s\|\s(?:accountsProcessed|处理账户数)=(\d+)\s\|\s(?:pointsGained|获得积分)=(-?\d+(?:\.\d+)?|unknown)\s\|\s(?:previousBalance|原余额)=(\d+(?:\.\d+)?)\s\|\s(?:currentBalance|现余额)=(\d+(?:\.\d+)?)\s\|\s(?:runtimeMinutes|运行分钟数)=([\d.]+)(?:\s\|\sstatus=(\S+))?$/;
// src/index.ts's waitBeforeNextAccount() - with accountDelay, accounts start
// one at a time now rather than together, so this wait can be a large
// fraction of the run's total time.
const ACCOUNT_DELAY_RE =
  /^(?:Waiting|等待)\s([\d.]+)\s(?:seconds before starting the next account|秒后开始下一个账户)(?:\s\((\S+@\S+)\))?(?:\s\|\swaitMs=\d+)?$/;
// v5 logs streakProtectionEnabled=null when the protection state couldn't be
// read, so "null" is a valid value alongside true/false.
const STREAK_PROTECTION_RE =
  /^(?:Snapshot complete|快照完成)\s\|\soffers=\d+\s\|\s(?:reportable|可上报)=\d+\s\|\sstreaks=\d+\s\|\s(?:streakProtectionEnabled|连续保护已启用)=(?<enabled>true|false|null)\s\|\s(?:streakProtectionRemainingDays|连续保护剩余天数)=(?<days>\d+|null)\s\|\s(?:streakCounter|连续计数)=(?<counter>\d+|null)\s\|\s(?:level|等级)=[^|]+\s\|\s(?:account|账户)=(?<email>\S+@\S+)$/;

// src/browser/auth/methods/PasswordlessLogin.ts - the only login flow that
// logs an actual value a human needs to act on before the bot can proceed
// (TOTP-with-secret is auto-filled and deliberately never logged; manual
// TOTP/email code entry waits on a raw stdin prompt with no code the bot
// itself knows, so there's nothing to surface for those).
const LOGIN_NUMBER_RE =
  /^(?:Please approve login and select number|请批准登录并选择数字):\s*(\d+)\s*$/;
const LOGIN_NUMBER_RESOLVED_RE =
  /^(?:Approval detected|检测到批准|Login approved successfully|登录批准成功|Login approval failed or timed out|Approval timeout after \d+ seconds!|批准请求已过期.*|\d+ 秒后批准超时!)$/;

// scripts/docker/run_daily.sh wraps the actual `npm start` in a flock-style
// lockfile and echoes its own lifecycle lines directly to stdout (not
// through Logger.ts), format: "[<bash date>] [run_daily.sh] <message>".
// `release_lock` runs via `trap ... EXIT INT TERM`, so "Lock released" fires
// even if npm start crashes outright - making this a much more reliable
// "is a run currently in progress" signal than the app's own RUN-START/
// RUN-END, which a hard crash could skip entirely.
const WRAPPER_LINE_RE = /^\[[^\]]*\]\s\[run_daily\.sh\]\s([\s\S]*)$/;
const WRAPPER_LOCK_ACQUIRED_RE =
  /^Lock acquired successfully\s\(PID:\s*(\d+)\)$/;
const WRAPPER_LOCK_RELEASED_RE = /^Lock released\s\(PID:\s*(\d+)\)$/;
// Optional randomized delay before the run actually launches (the seconds
// figure is authoritative; the "N minutes" part is rounded).
const WRAPPER_SLEEP_RE = /^Sleeping for [^(]*\((\d+)\sseconds?\)$/;
const WRAPPER_STARTING_RE = /^Starting script\.\.\.$/;
// src/control-api/trigger.js, when skipIfRunning is on and /start returns 409.
const TRIGGER_SKIPPED_RE =
  /^(?:\[trigger\]\s)?A run is already in progress\.\sSkipping as configured\.$/;

// "[POINTS] Earnable today | Mobile: unknown | Browser: 60 | App: pending mobile sign-in | <email> | locale: en-CA"
const EARNABLE_RE =
  /^Earnable today\s\|\sMobile:\s([^|]+?)\s\|\sBrowser:\s([^|]+?)\s\|\sApp:\s([^|]+?)\s\|\s(\S+@\S+)\s/;
const APP_POINTS_RE = /^App points available:\s*(\d+)$/;
const numberOrNull = (v) => (/^\d+$/.test(v.trim()) ? Number(v) : null);
// "Script finished" is printed right before the wrapper's natural exit
// (which is what triggers the EXIT trap that logs "Lock released"). Kept as
// its own event kind (see store.js) rather than folded into "Lock released",
// because "Lock released" fires from the EXIT trap even after a crash/kill,
// so it can't be trusted as completion evidence by itself either.
const WRAPPER_SCRIPT_FINISHED_RE = /^Script finished$/;
// Explicit successful completion signal from the API-triggered execution
// path. Distinguished from WRAPPER_SCRIPT_FINISHED_RE because "Script
// finished" alone is weaker evidence - some wrapper versions print it
// unconditionally on the way out, including right after a failure.
const WRAPPER_SCRIPT_COMPLETED_RE =
  /^Script completed successfully(?:\s*\(via API\))?\.?$/;
// Mirrors WRAPPER_SCRIPT_COMPLETED_RE's optional "(via API)" qualifier -
// observed in production as "ERROR: Script failed (via API)!" when the run
// was invoked through the Control API, vs. the bare form for a cron-invoked
// run.
const WRAPPER_SCRIPT_FAILED_RE =
  /^ERROR: Script failed(?:\s*\((?:via API|exit code \d+)\))?[!.]$/;

// Cluster worker lifecycle, e.g.:
// [MAIN] [WARN] MAIN [CLUSTER-WORKER-EXIT] Worker 34781 exit | Code: 0 | Signal: n/a | Active workers: 0
//
// Parsed as a structured event (rather than left as "generic") because the
// store uses Code + Signal + Active workers as one of its signals for
// whether the whole clustered process completed cleanly, as a fallback for
// when RUN-END itself never gets logged.
const CLUSTER_WORKER_EXIT_RE =
  /^(?:[Ww]orker)\s(\d+)\s(?:exit|退出)\s\|\s(?:Code|代码):\s*(-?\d+|n\/a)\s\|\s(?:Signal|信号):\s*([^|]+?)\s\|\s(?:Active workers|活跃worker数):\s*(\d+)\s*$/;

// v5's Control API (src/control-api/processManager.js _finalize) logs the
// final outcome of every run it launched - cron runs included, since
// run_daily.sh triggers through the API - under title CONTROLLER:
//   "Run completed (code 0)."            every account fully succeeded
//   "Run partial (code 0)."              finished, but some features were incomplete
//   "Run interrupted (code 1)."          did not finish
//   "Run cancelled (code 143)."          stopped on request
//   "Run failed (error: <message>)."     no accounts ran / spawn failure
//   "Run cancelled (code 143 / signal SIGTERM)."
// It is written to the same ordered log stream right after RUN-END, so unlike
// RUN-END's own status= (which reads "partial" even for a cancelled run) and
// unlike the separate /status exit event, it needs no timing heuristics.
const CONTROLLER_OUTCOME_RE =
  /^Run (completed|partial|interrupted|failed|cancelled) \((?:error: ([\s\S]*)|code (-?\d+|n\/a)(?: \/ signal (\S+))?)\)\.$/;

/**
 * v5 logs the account's reason as a JSON string (reason="...", with embedded
 * quotes escaped) built by joining every outstanding feature with "; ". The
 * same feature can appear twice (e.g. one quota check reported from both the
 * DESKTOP and MOBILE flows), so exact duplicate items are dropped.
 */
function decodeReason(raw) {
  if (raw == null) return null;
  let text = String(raw).trim();
  if (text.startsWith('"')) {
    try {
      text = JSON.parse(text);
    } catch {
      text = text.replace(/^"|"$/g, "");
    }
  }
  const seen = new Set();
  const items = [];
  for (const part of text.split(/;\s+/)) {
    const item = part.trim();
    if (item && !seen.has(item)) {
      seen.add(item);
      items.push(item);
    }
  }
  return items.join("; ") || null;
}

/**
 * Strips the leading Docker timestamp, returns { dockerTs, rest }.
 */
function splitDockerTimestamp(rawLine) {
  const m = DOCKER_TS_RE.exec(rawLine);
  if (!m) return { dockerTs: null, rest: rawLine };
  return { dockerTs: m[1], rest: m[2] };
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Parses one raw docker-log line into a structured event, or null if it
 * doesn't match the app's log format at all (defensive - unrelated stdout).
 */
function parseLine(rawLine) {
  const { dockerTs, rest } = splitDockerTimestamp(rawLine);
  if (!dockerTs) return null;

  const clean = rest.replace(ANSI_RE, "");
  const m = APP_LINE_RE.exec(clean);
  if (!m) {
    return parseWrapperLine(dockerTs, clean);
  }

  const [, appTime, userName, level, platform, title, message] = m;

  const base = {
    ts: dockerTs,
    appTime,
    userName,
    accountName: userName.toUpperCase() === "MAIN" ? null : userName,
    level: level.toLowerCase(),
    platform,
    title,
    message,
    raw: clean,
  };

  switch (title) {
    case "ACCOUNT-START": {
      const am = ACCOUNT_START_RE.exec(message);
      if (am)
        return {
          ...base,
          kind: "account-start",
          email: am[1],
          geoLocale: am[2],
        };
      break;
    }
    // v5 logs an account with status=skipped under ACCOUNT-SKIP instead of
    // ACCOUNT-END, with an otherwise identical message.
    case "ACCOUNT-SKIP":
    case "ACCOUNT-END": {
      const am = ACCOUNT_END_RE.exec(message);
      if (am) {
        return {
          ...base,
          kind: "account-end",
          email: am[1],
          gained: am[2] === "unknown" ? null : Number(am[2]),
          oldPoints: Number(am[3]),
          newPoints: Number(am[4]),
          durationSec: Number(am[5]),
          // v4's "Completed account:" line carries no status= and was only
          // ever logged for a successful account.
          accountStatus: am[6] || "completed",
          error: decodeReason(am[7]),
          activityCounts: parseActivityCounts(am[8]),
        };
      }
      break;
    }
    case "ACTIVITY-RESULT": {
      const am = ACTIVITY_RESULT_RE.exec(message);
      if (!am || !base.accountName) break;
      const name = am[1].replace(/\u200b/g, "").trim();
      const promo = ACTIVITY_PROMOTION_RE.exec(name);
      return {
        ...base,
        kind: "activity-result",
        email: base.accountName,
        activity: promo ? promo[1].trim() : name,
        title: promo ? promo[2].trim() : "",
        activityStatus: activityStatus(am[2]),
        pointsGained: am[3] === "unverified" ? null : Number(am[3]),
        reason: am[4] ? am[4].trim() : null,
      };
    }
    case "ACCOUNT-ERROR": {
      const am = ACCOUNT_ERR_RE.exec(message);
      if (am)
        return { ...base, kind: "account-error", email: am[1], error: am[2] };
      return { ...base, kind: "account-error", email: null, error: message };
    }
    case "RUN-START": {
      const am = RUN_START_RE.exec(message);
      if (am) {
        return {
          ...base,
          kind: "run-start",
          version: am[1],
          totalAccounts: Number(am[2]),
          clusters: Number(am[3]),
        };
      }
      break;
    }
    case "RUN-END": {
      const am = RUN_END_RE.exec(message);
      if (am) {
        return {
          ...base,
          kind: "run-end",
          accountsProcessed: Number(am[1]),
          totalGained: am[2] === "unknown" ? null : Number(am[2]),
          oldTotal: Number(am[3]),
          newTotal: Number(am[4]),
          runtimeMin: Number(am[5]),
          // null on v4, whose RUN-END has no status=.
          terminalStatus: am[6] || null,
        };
      }
      break;
    }
    case "ACCOUNT-DELAY": {
      const am = ACCOUNT_DELAY_RE.exec(message);
      if (am)
        return {
          ...base,
          kind: "account-delay",
          seconds: Number(am[1]),
          nextEmail: am[2] || null,
        };
      break;
    }
    case "REACT-PARSE": {
      const protection = STREAK_PROTECTION_RE.exec(message);
      if (protection) {
        return {
          ...base,
          kind: "streak-protection",
          email: protection.groups.email,
          enabled:
            protection.groups.enabled === "null"
              ? null
              : protection.groups.enabled === "true",
          remainingDays:
            protection.groups.days === "null"
              ? null
              : Number(protection.groups.days),
          streakCounter:
            protection.groups.counter === "null"
              ? null
              : Number(protection.groups.counter),
        };
      }
      break;
    }
    case "LOGIN-PASSWORDLESS": {
      const numMatch = LOGIN_NUMBER_RE.exec(message);
      if (numMatch)
        return { ...base, kind: "login-number", number: numMatch[1] };
      if (LOGIN_NUMBER_RESOLVED_RE.test(message)) {
        return { ...base, kind: "login-number-resolved" };
      }
      break;
    }
    case "FLOW": {
      // Reported as an "account-error" event; the store keys its
      // account-resolution logic off `kind`, so the original FLOW title is
      // left intact.
      if (level.toLowerCase() === "error") {
        const fm = FLOW_FAILED_RE.exec(message);
        if (fm) {
          return {
            ...base,
            kind: "account-error",
            email: fm[1] || fm[2],
            error: fm[3],
          };
        }
      }
      break;
    }
    case "CONTROLLER": {
      const cm = CONTROLLER_OUTCOME_RE.exec(message);
      if (cm) {
        return {
          ...base,
          kind: "controller-outcome",
          outcome: cm[1],
          error: cm[2] || null,
          code: cm[3] == null || cm[3] === "n/a" ? null : Number(cm[3]),
          signal: cm[4] || null,
        };
      }
      break;
    }
    case "POINTS": {
      const em = EARNABLE_RE.exec(message);
      if (em && base.accountName) {
        return {
          ...base,
          kind: "earnable",
          email: base.accountName,
          mobile: numberOrNull(em[1]),
          browser: numberOrNull(em[2]),
          app: numberOrNull(em[3]),
        };
      }
      const ap = APP_POINTS_RE.exec(message);
      if (ap && base.accountName) {
        return { ...base, kind: "earnable", email: base.accountName, app: Number(ap[1]) };
      }
      break;
    }
    // v5b3 logs the wrapper's own lifecycle in the app format.
    case "RUN_DAILY.SH": {
      const ev = wrapperMessageEvent(dockerTs, message, clean);
      if (ev) return ev;
      break;
    }
    case "TRIGGER": {
      if (TRIGGER_SKIPPED_RE.test(message)) return wrapperSkippedEvent(dockerTs, clean);
      break;
    }
    case "CLUSTER-WORKER-EXIT": {
      const wm = CLUSTER_WORKER_EXIT_RE.exec(message);
      if (wm) {
        const code = wm[2].toLowerCase() === "n/a" ? null : Number(wm[2]);
        const rawSignal = wm[3].trim();
        const signal =
          !rawSignal || rawSignal.toLowerCase() === "n/a"
            ? null
            : rawSignal;
        return {
          ...base,
          kind: "cluster-worker-exit",
          pid: Number(wm[1]),
          code,
          signal,
          activeWorkers: Number(wm[4]),
        };
      }
      break;
    }
    default:
      break;
  }

  // Fall through: no specific structured match, but still a valid app log
  // line. Kept as a generic event so warnings/errors show up in the feed.
  return { ...base, kind: "generic" };
}

/**
 * Parses a run_daily.sh wrapper line (not part of Logger.ts's format).
 * Returns null for lines that don't match at all, or a 'generic' event for
 * wrapper lines that aren't one of the specific lifecycle events we track.
 */
function wrapperSkippedEvent(dockerTs, clean) {
  return {
    ts: dockerTs,
    userName: "run_daily.sh",
    level: "warn",
    platform: "MAIN",
    title: "WRAPPER",
    message: "Scheduled run skipped: a run was already in progress",
    raw: clean,
    kind: "wrapper-run-skipped",
  };
}

function parseWrapperLine(dockerTs, clean) {
  if (TRIGGER_SKIPPED_RE.test(clean.trim())) {
    return wrapperSkippedEvent(dockerTs, clean);
  }

  const wm = WRAPPER_LINE_RE.exec(clean);
  if (!wm) return null;
  return wrapperMessageEvent(dockerTs, wm[1], clean);
}

function wrapperMessageEvent(dockerTs, message, clean) {
  const base = {
    ts: dockerTs,
    userName: "run_daily.sh",
    level: "info",
    platform: "MAIN",
    title: "WRAPPER",
    message,
    raw: clean,
  };

  const acquired = WRAPPER_LOCK_ACQUIRED_RE.exec(message);
  if (acquired)
    return { ...base, kind: "wrapper-lock-acquired", pid: acquired[1] };

  const released = WRAPPER_LOCK_RELEASED_RE.exec(message);
  if (released)
    return { ...base, kind: "wrapper-lock-released", pid: released[1] };

  const sleep = WRAPPER_SLEEP_RE.exec(message);
  if (sleep)
    return { ...base, kind: "wrapper-sleep", seconds: Number(sleep[1]) };

  if (WRAPPER_STARTING_RE.test(message)) {
    return { ...base, kind: "wrapper-starting" };
  }

  if (WRAPPER_SCRIPT_COMPLETED_RE.test(message)) {
    return { ...base, kind: "wrapper-script-completed" };
  }

  if (WRAPPER_SCRIPT_FINISHED_RE.test(message)) {
    return { ...base, kind: "wrapper-script-finished" };
  }

  if (WRAPPER_SCRIPT_FAILED_RE.test(message)) {
    return { ...base, level: "error", kind: "wrapper-script-failed" };
  }

  // Other wrapper lines (self-heal messages, "Starting script...", etc.)
  // aren't needed for run-tracking; ignore rather than adding feed noise.
  return null;
}

module.exports = { parseLine, decodeReason };
