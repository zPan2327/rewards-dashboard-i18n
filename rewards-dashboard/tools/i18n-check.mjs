#!/usr/bin/env node
/**
 * Translation key checker for the Rewards Dashboard i18n layer.
 *
 *   node tools/i18n-check.mjs            # human-readable report
 *   node tools/i18n-check.mjs --json     # machine-readable
 *   node tools/i18n-check.mjs --strict   # also fail on unused keys
 *
 * Run this after every upstream sync. It answers the only two questions that
 * matter when new upstream code lands:
 *
 *   1. Did upstream add UI text that has no translation yet?
 *      -> "ENGLISH FALLBACK" (keys with no zh-CN entry: still render English)
 *      -> "UNKNOWN t() KEY"  (used in code, missing from en.js)
 *   2. Did a key's placeholders change, so an existing translation would now
 *      be wrong (a missing {param} would leak into the UI literally)?
 *      -> "PLACEHOLDER MISMATCH"
 *
 * Exit code is 1 when something needs attention, so it can gate a build.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");
const LOCALES_DIR = join(PUBLIC_DIR, "i18n", "locales");
const BACKSLASH = String.fromCharCode(92);

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const strict = args.includes("--strict");

const en = (await import(pathToFileURL(join(LOCALES_DIR, "en.js")).href)).default;
const zh = (await import(pathToFileURL(join(LOCALES_DIR, "zh-CN.js")).href)).default;

/** Every translatable string of one entry (plain string, or plural variants). */
function variantsOf(entry) {
  if (entry == null) return [];
  if (typeof entry === "string") return [entry];
  return Object.values(entry).filter((v) => typeof v === "string");
}

/** Named placeholders of an entry, across every plural variant. */
function paramsOf(entry) {
  const out = new Set();
  for (const text of variantsOf(entry)) {
    for (const m of text.matchAll(/\{(\w+)\}/g)) out.add(m[1]);
  }
  return [...out].sort();
}

function walk(dir, filter, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, filter, out);
    else if (filter(full)) out.push(full);
  }
  return out;
}

const enKeys = Object.keys(en);
const zhKeys = Object.keys(zh);

const missingInZh = enKeys.filter((k) => !(k in zh));
const orphanInZh = zhKeys.filter((k) => !(k in en));
const emptyValues = [];
const placeholderMismatch = [];

for (const [locale, dict] of [["en", en], ["zh-CN", zh]]) {
  for (const key of Object.keys(dict)) {
    const texts = variantsOf(dict[key]);
    if (texts.length === 0) emptyValues.push(locale + ":" + key);
    for (const text of texts) {
      if (String(text).trim() === "") emptyValues.push(locale + ":" + key);
    }
  }
}

for (const key of enKeys) {
  if (!(key in zh)) continue;
  const expected = paramsOf(en[key]);
  const actual = paramsOf(zh[key]);
  const missing = expected.filter((p) => !actual.includes(p));
  const extra = actual.filter((p) => !expected.includes(p));
  if (missing.length || extra.length) {
    placeholderMismatch.push({
      key,
      missing,
      extra,
      en: variantsOf(en[key])[0],
      zh: variantsOf(zh[key])[0],
    });
  }
}

const pluralVariantGaps = [];
for (const key of enKeys) {
  const enEntry = en[key];
  const zhEntry = zh[key];
  if (typeof enEntry !== "object" || enEntry === null) continue;
  if (typeof zhEntry !== "object" || zhEntry === null) continue;
  for (const variant of Object.keys(enEntry)) {
    if (!(variant in zhEntry)) pluralVariantGaps.push(key + "." + variant);
  }
}

const localesDir = join("i18n", "locales");
const sourceFiles = walk(PUBLIC_DIR, (f) => {
  if (!/\.(js|html)$/.test(f)) return false;
  return !f.includes(localesDir);
});

const KEY_LITERAL = /["']([a-z][\w-]*(?:\.[\w-]+)+)["']/g;
const T_CALL = /(?:^|[^\w.])(?:t|tp)\(\s*["']([a-z][\w-]*(?:\.[\w-]+)+)["']/g;

const usedKeys = new Map();
const tCallSites = [];
const unknownTKeys = [];

for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  const rel = relative(ROOT, file).split(BACKSLASH).join("/");

  text.split("\n").forEach((line, i) => {
    const where = rel + ":" + (i + 1);
    for (const m of line.matchAll(T_CALL)) {
      tCallSites.push({ key: m[1], where });
      if (!(m[1] in en)) unknownTKeys.push({ key: m[1], where });
    }
    for (const m of line.matchAll(KEY_LITERAL)) {
      if (m[1] in en && !usedKeys.has(m[1])) usedKeys.set(m[1], where);
    }
  });
}

const DYNAMIC_PREFIXES = [
  "config.toggle.",
  "config.field.",
  "config.option.",
  "config.delay.",
];

const unusedKeys = enKeys.filter((k) => {
  if (usedKeys.has(k)) return false;
  return !DYNAMIC_PREFIXES.some((p) => k.startsWith(p));
});

const problems =
  missingInZh.length +
  orphanInZh.length +
  emptyValues.length +
  placeholderMismatch.length +
  pluralVariantGaps.length +
  unknownTKeys.length +
  (strict ? unusedKeys.length : 0);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        summary: {
          enKeys: enKeys.length,
          zhKeys: zhKeys.length,
          translated: enKeys.length - missingInZh.length,
          tCallSites: tCallSites.length,
          problems,
        },
        missingInZh,
        orphanInZh,
        emptyValues,
        placeholderMismatch,
        pluralVariantGaps,
        unknownTKeys,
        unusedKeys,
      },
      null,
      2,
    ),
  );
} else {
  const out = (s) => console.log(s);
  out("Rewards Dashboard i18n check");
  out("  en.js keys     : " + enKeys.length);
  out("  zh-CN.js keys  : " + zhKeys.length);
  out("  translated     : " + (enKeys.length - missingInZh.length) + "/" + enKeys.length);
  out("  t() call sites : " + tCallSites.length);
  out("");

  const section = (title, items, format) => {
    if (!items.length) return;
    out(title + " (" + items.length + "):");
    items.forEach((i) => out(format ? format(i) : "  - " + i));
    out("");
  };

  section("ENGLISH FALLBACK - no zh-CN entry yet, renders English", missingInZh);
  section("ORPHAN - in zh-CN.js but not in en.js", orphanInZh);
  section("EMPTY VALUE", emptyValues);
  section("PLACEHOLDER MISMATCH - translation would render wrong", placeholderMismatch, (p) => {
    let s = "  - " + p.key + "\n      en: " + p.en + "\n      zh: " + p.zh;
    if (p.missing.length) s += "\n      missing in zh: " + p.missing.join(", ");
    if (p.extra.length) s += "\n      not in en    : " + p.extra.join(", ");
    return s;
  });
  section("PLURAL VARIANT MISSING", pluralVariantGaps);
  section("UNKNOWN t() KEY - used in code, missing from en.js", unknownTKeys, (u) => "  - " + u.key + "  (" + u.where + ")");
  section("UNUSED KEY - in en.js, not referenced by a view", unusedKeys);

  if (!problems) {
    out("OK - every key is translated and every placeholder matches.");
  } else {
    out(problems + " item(s) need attention." + (strict ? "" : "  (--strict also fails on unused keys)"));
  }
}

process.exit(problems ? 1 : 0);
