#!/usr/bin/env node
// Regenerates rules/NEIN.md and .cursor/rules/nein.mdc from skills/nein/SKILL.md.
// `--check` reports drift and exits 1 instead of writing.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { GENERATED_FILES, ROOT, readSkill } from "./lib/skill.mjs";

export function syncGenerated({ check = false } = {}) {
  const { body } = readSkill();
  const stale = [];
  for (const file of GENERATED_FILES) {
    const want = file.render(body);
    const have = existsSync(file.path) ? readFileSync(file.path, "utf8") : null;
    if (have === want) continue;
    stale.push(relative(ROOT, file.path));
    if (!check) {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, want);
    }
  }
  return stale;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes("--check");
  const stale = syncGenerated({ check });
  if (check && stale.length > 0) {
    console.error(`Out of date: ${stale.join(", ")}. Run \`npm run sync\`.`);
    process.exit(1);
  }
  console.log(
    stale.length === 0 ? "Generated files are up to date." : `Updated: ${stale.join(", ")}`,
  );
}
