/**
 * Localizes the control API's English cron description.
 *
 * `GET /api/cron` answers with `{ valid, description, error }`, where the
 * description is generated server-side (lib/cron.js) in English. Re-implementing
 * cron parsing in the dashboard would duplicate business logic and drift from
 * upstream, so this module does the opposite: it *reformats* the sentence the
 * server already produced, using only structural rules plus the locale
 * dictionaries. Anything it does not recognise is passed through untouched, so
 * the worst case is an English hint line - never a wrong or empty one.
 *
 * Validation, next-run calculation and the expression grammar all stay
 * server-side and are not touched by this file.
 */
import { getLocale, t, tp } from "./index.js";

// Locales that prefer a 24-hour clock in prose. Structural only.
const HOUR24 = new Set(["zh-CN"]);

const DAY_NAMES = {
  Sun: "schedule.day.sun",
  Mon: "schedule.day.mon",
  Tue: "schedule.day.tue",
  Wed: "schedule.day.wed",
  Thu: "schedule.day.thu",
  Fri: "schedule.day.fri",
  Sat: "schedule.day.sat",
};

const RE_EVERY_MIN = /^Every (\d+) minutes?$/;
const RE_EVERY_HOUR = /^Every (\d+) hours?$/;
const RE_DAILY_AT = /^Daily at (.+)$/;
const RE_DAYS_AT = /^(.+) at (.+)$/;
const RE_TIME = /^(\d{1,2}):(\d{2}) (AM|PM)$/;

// The control API reports a schedule that is switched off with this literal
// (server.js: `sched.enabled ? describeCron(...) : "Not scheduled"`).
const NOT_SCHEDULED = "Not scheduled";

/** "9:00 AM" -> "9:00 AM" (en) or "09:00" (zh-CN). */
function time(text) {
  const m = RE_TIME.exec(text);
  if (!m) return null;
  const [, h, mm, period] = m;
  if (!HOUR24.has(getLocale())) return `${Number(h)}:${mm} ${period}`;
  const hour = Number(h) % 12 + (period === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${mm}`;
}

/** Splits "9:00 AM, 12:00 PM, and 9:00 PM" the way lib/cron.js joined it. */
function splitList(text) {
  if (text.includes(", and ")) {
    const parts = text.split(", and ");
    const head = parts[0].split(", ");
    return [...head, parts.slice(1).join(", and ")];
  }
  if (text.includes(" and ")) return text.split(" and ");
  return text.split(", ");
}

function joinList(items) {
  if (items.length === 1) return items[0];
  if (items.length === 2) return t("schedule.cron.listAnd2", { a: items[0], b: items[1] });
  return t("schedule.cron.listAndN", {
    a: items.slice(0, -1).join(t("schedule.cron.listSep")),
    b: items[items.length - 1],
  });
}

function timesText(text) {
  const parts = splitList(text).map(time);
  if (parts.some((p) => p == null)) return null;
  return joinList(parts);
}

function daysText(text) {
  if (/^Weekdays$/.test(text)) return t("schedule.cron.weekdays");
  if (/^Weekends$/.test(text)) return t("schedule.cron.weekends");
  const every = /^every (\d+) day\(s\) of the week$/.exec(text);
  if (every) return t("schedule.cron.everyWeekdayN", { count: Number(every[1]) });

  // lib/cron.js joins the day names with a plain ", " (only *times* get an
  // "and"), so this list is joined with the separator alone.
  const names = splitList(text).map((name) => DAY_NAMES[name]);
  if (names.some((key) => !key)) return null;
  return names.map((key) => t(key)).join(t("schedule.cron.listSep"));
}

/**
 * Re-renders a server-produced description in the active language, or returns
 * it unchanged when its shape is not one this module knows how to reword.
 */
export function localizeCronDescription(description) {
  if (!description) return "";
  if (description === NOT_SCHEDULED) return t("schedule.notScheduled");

  let m = RE_EVERY_MIN.exec(description);
  if (m) return tp("schedule.cron.everyMinutes", Number(m[1]));

  m = RE_EVERY_HOUR.exec(description);
  if (m) return tp("schedule.cron.everyHours", Number(m[1]));

  m = RE_DAILY_AT.exec(description);
  if (m) {
    const t2 = timesText(m[1]);
    return t2 == null
      ? description
      : t("schedule.cron.dailyAt", { time: t2 });
  }

  m = RE_DAYS_AT.exec(description);
  if (m) {
    const t2 = timesText(m[2]);
    const d2 = daysText(m[1]);
    if (t2 == null || d2 == null) return description;
    return t("schedule.cron.daysAt", { days: d2, time: t2 });
  }

  return description;
}

/**
 * @param res the parsed `GET /api/cron` response
 * @returns the hint line to display (never empty for an invalid expression)
 */
export function localizeCronResult(res) {
  if (!res || !res.valid) return t("schedule.cron.needsFields");
  return localizeCronDescription(res.description);
}
