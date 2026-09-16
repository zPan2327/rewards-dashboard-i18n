/**
 * Minimal, dependency-free i18n runtime for the Rewards Dashboard.
 *
 * Design goals (see docs/i18n.md):
 *   - English stays the single source of truth; `locales/en.js` owns every key.
 *   - A translation is a *flat* dictionary of "namespace.key" -> string.
 *     Adding a language means adding one dictionary file and one entry in
 *     LOCALES below - no view or business code changes.
 *   - Lookups always fall back: active locale -> English -> the key itself.
 *     A missing or empty translation therefore renders English (never
 *     `undefined`, never blank).
 *   - The chosen locale is persisted in localStorage and applied to
 *     <html lang> so the browser (fonts, hyphenation, spelling) follows it.
 *
 * Only presentation text lives here. API paths, payload shapes and every
 * other behaviour of the dashboard are untouched by this module.
 */

import en from "./locales/en.js";
import zhCN from "./locales/zh-CN.js";

/** Every locale the dashboard can render. `dict` is a flat key/value map. */
export const LOCALES = [
  { id: "en", label: "English", dict: en },
  { id: "zh-CN", label: "简体中文", dict: zhCN },
];

/** Locale used until the visitor picks another one, and the final fallback. */
export const DEFAULT_LOCALE = "en";

const STORAGE_KEY = "rewards-dashboard:locale";

const listeners = new Set();
let currentId = DEFAULT_LOCALE;

function getDict(id) {
  const locale = LOCALES.find((l) => l.id === id);
  return locale ? locale.dict : null;
}

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && getDict(stored) ? stored : null;
  } catch {
    // storage unavailable (private browsing, disabled cookies) - the
    // dashboard simply starts in the default locale.
    return null;
  }
}

function writeStoredLocale(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable - the choice just won't persist */
  }
}

// Restore the remembered choice as early as possible: this module is the
// first import of app.js, so module-scope consumers of t() below it in the
// graph already see the right locale.
const storedLocale = readStoredLocale();
if (storedLocale) currentId = storedLocale;

/**
 * Resolves one dictionary entry for a given set of params.
 *
 * An entry is either a plain string, or - when the text depends on a count -
 * an object of the shape `{ one, other }`. `params.count` picks the variant.
 * Anything missing/empty resolves to null so the caller can fall back.
 */
function variantOf(entry, params) {
  if (entry == null) return null;
  if (typeof entry === "string") return entry === "" ? null : entry;
  const count = Number(params?.count);
  const variant = count === 1 ? "one" : "other";
  return entry[variant] ?? entry.other ?? entry.one ?? null;
}

function interpolate(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] == null ? match : String(params[name]),
  );
}

/**
 * Translate `key`. Falls back to English, then to the key itself, so a
 * caller can never end up rendering `undefined` or an empty string.
 */
export function t(key, params) {
  const own = variantOf(getDict(currentId)?.[key], params);
  if (own != null) return interpolate(own, params);

  const fallback = variantOf(en[key], params);
  if (fallback != null) return interpolate(fallback, params);

  return key;
}

/** Shorthand for count-based messages: tp("key", n) === t("key", { count: n }). */
export function tp(key, count, params) {
  return t(key, { ...params, count });
}

export function getLocale() {
  return currentId;
}

/**
 * The locale to hand to Intl/toLocaleString for dates and times, or null when
 * the dashboard is in its original English mode - callers then keep whatever
 * browser default they used before, so English output is byte-identical to
 * the pre-i18n dashboard. Numbers are deliberately excluded: `toLocaleString`
 * on a plain integer is identical in en and zh-CN, so fmtNumber/fmtSigned are
 * left untouched.
 */
export function dateLocale() {
  return currentId === DEFAULT_LOCALE ? null : currentId;
}

export function getLocaleLabel(id = currentId) {
  return LOCALES.find((l) => l.id === id)?.label || id;
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Switch locale, persist it, and notify every listener. */
export function setLocale(id, { persist = true } = {}) {
  const next = getDict(id) ? id : DEFAULT_LOCALE;
  if (persist) writeStoredLocale(next);
  if (next === currentId) return currentId;
  currentId = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  for (const fn of listeners) fn(next);
  return currentId;
}

/**
 * Applies translations to markup that lives in index.html or was written by
 * a view's mount():
 *   data-i18n="key"           -> textContent
 *   data-i18n-html="key"      -> innerHTML (for entries that intentionally
 *                               contain markup such as <code>)
 *   data-i18n-title="key"     -> title attribute
 *   data-i18n-aria-label="key"-> aria-label attribute
 *   data-i18n-placeholder     -> placeholder attribute
 * Dynamic (JS-built) text uses t() directly at render time instead.
 */
const ATTR_BINDINGS = [
  ["data-i18n-title", "title"],
  ["data-i18n-aria-label", "aria-label"],
  ["data-i18n-placeholder", "placeholder"],
];

export function applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key) node.textContent = t(key);
  });
  root.querySelectorAll("[data-i18n-html]").forEach((node) => {
    const key = node.getAttribute("data-i18n-html");
    if (key) node.innerHTML = t(key);
  });
  for (const [dataAttr, target] of ATTR_BINDINGS) {
    root.querySelectorAll(`[${dataAttr}]`).forEach((node) => {
      const key = node.getAttribute(dataAttr);
      if (key) node.setAttribute(target, t(key));
    });
  }
}

/** Called once at startup: mirrors the restored locale onto <html lang>. */
export function initI18n() {
  document.documentElement.lang = currentId;
  applyI18n(document);
}

/** Test/debug helper: does any locale define this key? */
export function hasKey(key) {
  return typeof en[key] !== "undefined";
}
