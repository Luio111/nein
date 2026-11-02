// Reads skills/nein/SKILL.md and renders the generated rule files from it.
// SKILL.md is the single source of truth; everything else is derived here.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SKILL_PATH = join(ROOT, "skills", "nein", "SKILL.md");

const GENERATED_NOTE =
  "<!-- Generated from skills/nein/SKILL.md by scripts/sync.mjs. Edit the skill, then run `npm run sync`. -->";

// Splits a SKILL.md into its frontmatter fields and body. Only the flat
// `key: value` subset of YAML that SKILL.md uses is supported; nested blocks
// (metadata) are kept as raw text under their key.
export function parseSkill(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    throw new Error("SKILL.md must start with a --- frontmatter fence");
  }
  const end = lines.indexOf("---", 1);
  if (end === -1) throw new Error("SKILL.md frontmatter is not closed");

  const fields = {};
  let currentKey = null;
  for (const line of lines.slice(1, end)) {
    const top = /^([A-Za-z][\w-]*):\s?(.*)$/.exec(line);
    if (top) {
      currentKey = top[1];
      fields[currentKey] = parseScalar(top[2]);
    } else if (currentKey && /^\s+/.test(line)) {
      const nested = /^\s+([A-Za-z][\w-]*):\s?(.*)$/.exec(line);
      if (nested) {
        if (typeof fields[currentKey] !== "object" || fields[currentKey] === null) {
          fields[currentKey] = {};
        }
        fields[currentKey][nested[1]] = parseScalar(nested[2]);
      }
    }
  }

  const body = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\s*\n/, "")
    .trimEnd();
  return { fields, body: `${body}\n` };
}

function parseScalar(raw) {
  const value = raw.trim();
  if (value === "") return "";
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

export function readSkill() {
  return parseSkill(readFileSync(SKILL_PATH, "utf8"));
}

// Plain ruleset for CLAUDE.md, AGENTS.md or any agent's instruction file.
export function renderRules(body) {
  return `${GENERATED_NOTE}\n\n${body}`;
}

// Cursor project rule that is always applied.
export function renderCursorRule(body) {
  return [
    "---",
    "description: NEIN – direct, non-sycophantic answers (Ja / Nein / Jein)",
    "alwaysApply: true",
    "---",
    "",
    GENERATED_NOTE,
    "",
    body,
  ].join("\n");
}

export const GENERATED_FILES = [
  { path: join(ROOT, "rules", "NEIN.md"), render: renderRules },
  { path: join(ROOT, ".cursor", "rules", "nein.mdc"), render: renderCursorRule },
];
