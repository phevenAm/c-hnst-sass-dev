#!/usr/bin/env node
/**
 * add-testids.mjs
 *
 * Adds data-testid attributes to interactive elements in changed/new TSX files.
 * Run against git-changed files:   node scripts/add-testids.mjs
 * Run against specific files:       node scripts/add-testids.mjs src/pages/Foo/Foo.tsx
 *
 * Rules (from .testidrc.json):
 *  - Targets: button, input, select, textarea, a, form, nav, header, main, section
 *  - Skips elements that already have data-testid, aria-hidden="true", or
 *    match the ignore.patterns list
 *  - ID format: {component-name}-{element}-{index}  e.g. "login-form-button-0"
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, relative, basename, dirname } from "path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const RC_PATH = resolve(ROOT, ".testidrc.json");

// ── Load config ──────────────────────────────────────────────────────────────

const rc = existsSync(RC_PATH) ? JSON.parse(readFileSync(RC_PATH, "utf8")) : {};
const ATTR = rc.attribute ?? "data-testid";
const TARGET_ELEMENTS = new Set(rc.elements ?? ["button", "input", "select", "textarea", "a", "form"]);
const IGNORE_PATTERNS = rc.ignore?.patterns ?? [];
const IGNORE_ATTRS = rc.ignore?.attributes ?? ["aria-hidden"];

// ── Determine files to process ───────────────────────────────────────────────

function getChangedFiles() {
  try {
    const staged = execSync("git diff --name-only --diff-filter=ACM HEAD", { cwd: ROOT })
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
    const unstaged = execSync("git diff --name-only --diff-filter=ACM", { cwd: ROOT })
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean);
    return [...new Set([...staged, ...unstaged])].filter((f) => f.endsWith(".tsx") || f.endsWith(".jsx"));
  } catch {
    return [];
  }
}

const explicitFiles = process.argv.slice(2);
const files = explicitFiles.length > 0
  ? explicitFiles.map((f) => relative(ROOT, resolve(f)))
  : getChangedFiles();

if (files.length === 0) {
  console.log("No TSX/JSX files changed. Nothing to do.");
  process.exit(0);
}

console.log(`Processing ${files.length} file(s)…\n`);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a component name slug from the file path. */
function componentSlug(filePath) {
  const name = basename(filePath, ".tsx").replace(/\.jsx$/, "");
  // PascalCase → kebab-case
  return name
    .replace(/([A-Z])/g, (m, c, i) => (i === 0 ? c : "-" + c))
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Check whether a JSX opening tag already has the target attribute. */
function hasAttr(tagContent, attr) {
  return new RegExp(`\\b${attr}=`).test(tagContent);
}

/** Check whether a JSX opening tag has any of the ignore attributes. */
function hasIgnoreAttr(tagContent) {
  return IGNORE_ATTRS.some((a) => new RegExp(`\\b${a}=["']true["']`).test(tagContent));
}

/** Check whether the line/context matches any ignore pattern. */
function matchesIgnorePattern(tagContent) {
  return IGNORE_PATTERNS.some((p) => tagContent.includes(p));
}

// ── Main processing ───────────────────────────────────────────────────────────

let totalAdded = 0;

for (const relPath of files) {
  const absPath = resolve(ROOT, relPath);
  if (!existsSync(absPath)) continue;

  const original = readFileSync(absPath, "utf8");
  const slug = componentSlug(relPath);
  const counters = {};

  // Regex: matches self-closing or opening JSX tags for target elements.
  // Group 1: element name. Group 2: existing attributes.
  const tagRe = new RegExp(
    `<(${[...TARGET_ELEMENTS].join("|")})((?:\\s[^>]*)?)(?:\\s*/>|>)`,
    "g",
  );

  let modified = original;
  let offset = 0;

  for (const match of original.matchAll(tagRe)) {
    const [full, elem, attrs] = match;
    const idx = match.index + offset;

    if (hasAttr(attrs, ATTR)) continue;
    if (hasIgnoreAttr(attrs)) continue;
    if (matchesIgnorePattern(full)) continue;

    // Derive a unique testid
    counters[elem] = (counters[elem] ?? -1) + 1;
    const n = counters[elem];
    const testid = `${slug}-${elem}${n > 0 ? `-${n}` : ""}`;

    // Insert the attribute right after the element name
    const insertAt = idx + 1 + elem.length; // after "<button"
    const insertion = ` ${ATTR}="${testid}"`;

    modified = modified.slice(0, insertAt) + insertion + modified.slice(insertAt);
    offset += insertion.length;
    totalAdded++;
  }

  if (modified !== original) {
    writeFileSync(absPath, modified, "utf8");
    console.log(`  ✓ ${relPath} — added ${totalAdded} id(s)`);
  }
}

console.log(`\nDone. ${totalAdded} attribute(s) added across ${files.length} file(s).`);
