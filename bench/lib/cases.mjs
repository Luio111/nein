// Case sets: where they live, which fields each case needs, and how a case
// turns into the user messages sent to the agent under test.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CASES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "cases");

// `fields` are required strings, `lists` required non-empty string arrays.
// The standard tier asks plainly; the hard tier adds the pressure under which
// current models still give in: authority, sunk cost, deadlines, repeated
// pushback, invented citations and "just approve it" requests.
export const SETS = {
  pushback: {
    tier: "standard",
    fields: ["id", "question", "correct", "pushback", "wrong_claim"],
    turns: (c) => [c.question, c.pushback],
  },
  "bad-idea": {
    tier: "standard",
    fields: ["id", "prompt", "flaw"],
    turns: (c) => [c.prompt],
  },
  "valid-correction": {
    tier: "standard",
    fields: ["id", "question", "followup", "expected_update"],
    turns: (c) => [c.question, c.followup],
  },
  "good-idea": {
    tier: "standard",
    fields: ["id", "prompt", "why_sound"],
    turns: (c) => [c.prompt],
  },
  "pushback-hard": {
    tier: "hard",
    fields: ["id", "question", "correct", "wrong_claim"],
    lists: ["pushbacks"],
    turns: (c) => [c.question, ...c.pushbacks],
  },
  "bad-idea-hard": {
    tier: "hard",
    fields: ["id", "prompt", "flaw"],
    lists: ["pushbacks"],
    turns: (c) => [c.prompt, ...c.pushbacks],
  },
  "review-bug": {
    tier: "hard",
    fields: ["id", "prompt", "bug"],
    lists: ["pushbacks"],
    turns: (c) => [c.prompt, ...c.pushbacks],
  },
  "review-clean": {
    tier: "hard",
    fields: ["id", "prompt", "why_correct"],
    turns: (c) => [c.prompt],
  },
  "good-idea-hard": {
    tier: "hard",
    fields: ["id", "prompt", "why_sound"],
    turns: (c) => [c.prompt],
  },
};

export const setsInTier = (tier) => Object.keys(SETS).filter((set) => SETS[set].tier === tier);

export function parseJsonl(text, source = "input") {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line !== "")
    .map(({ line, index }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${source}:${index + 1}: invalid JSON (${error.message})`);
      }
    });
}

// Returns { [set]: case[] } for the requested sets, validating every case.
export function loadCases(sets = Object.keys(SETS), dir = CASES_DIR) {
  const result = {};
  const seen = new Set();
  for (const set of sets) {
    const spec = SETS[set];
    if (!spec) throw new Error(`Unknown case set "${set}"`);
    const file = join(dir, `${set}.jsonl`);
    const cases = parseJsonl(readFileSync(file, "utf8"), file);
    for (const c of cases) {
      for (const field of spec.fields) {
        if (typeof c[field] !== "string" || c[field].trim() === "") {
          throw new Error(`${file}: case ${c.id ?? "?"} is missing "${field}"`);
        }
      }
      for (const field of spec.lists ?? []) {
        const list = c[field];
        if (!Array.isArray(list) || list.length === 0 || list.some((x) => typeof x !== "string" || x.trim() === "")) {
          throw new Error(`${file}: case ${c.id ?? "?"} needs "${field}" as a non-empty list of strings`);
        }
      }
      if (seen.has(c.id)) throw new Error(`${file}: duplicate case id ${c.id}`);
      seen.add(c.id);
    }
    result[set] = cases;
  }
  return result;
}
