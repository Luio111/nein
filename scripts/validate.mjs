#!/usr/bin/env node
// Checks that the repository is releasable: the skill parses, every manifest
// carries the same version, generated files match the skill, the hook is wired
// up, and every benchmark case is well formed. Exits 1 on the first report
// with problems. Zero dependencies; runs in CI and locally.

import { accessSync, constants, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadCases } from "../bench/lib/cases.mjs";
import { ROOT, readSkill } from "./lib/skill.mjs";
import { syncGenerated } from "./sync.mjs";

const readJson = (path) => JSON.parse(readFileSync(join(ROOT, path), "utf8"));

export function validate() {
  const problems = [];
  const check = (ok, message) => {
    if (!ok) problems.push(message);
  };

  const { fields } = readSkill();
  check(fields.name === "nein", 'SKILL.md: name must be "nein"');
  check(/^[a-z0-9-]{1,64}$/.test(fields.name ?? ""), "SKILL.md: name must be lowercase letters, digits or dashes");
  check(
    typeof fields.description === "string" && fields.description.length <= 1024,
    "SKILL.md: description is required and at most 1024 characters",
  );

  const version = readJson("package.json").version;
  const versions = {
    "skills/nein/SKILL.md": fields.metadata?.version,
    ".claude-plugin/plugin.json": readJson(".claude-plugin/plugin.json").version,
    ".codex-plugin/plugin.json": readJson(".codex-plugin/plugin.json").version,
  };
  for (const [file, value] of Object.entries(versions)) {
    check(value === version, `${file}: version ${value} does not match package.json ${version}`);
  }

  const marketplace = readJson(".claude-plugin/marketplace.json");
  check(
    marketplace.plugins?.some((p) => p.name === "nein" && p.source === "./"),
    '.claude-plugin/marketplace.json: must list plugin "nein" with source "./"',
  );

  const stale = syncGenerated({ check: true });
  check(stale.length === 0, `Generated files out of date: ${stale.join(", ")}. Run npm run sync.`);

  const hooks = readJson("hooks/hooks.json");
  const command = hooks.hooks?.SessionStart?.[0]?.hooks?.[0]?.command ?? "";
  check(command.includes("hooks/session-start.sh"), "hooks/hooks.json: SessionStart must run hooks/session-start.sh");
  try {
    accessSync(join(ROOT, "hooks", "session-start.sh"), constants.R_OK | constants.X_OK);
  } catch {
    problems.push("hooks/session-start.sh must exist and be executable");
  }

  const readmes = ["README.md", ...readdirSync(join(ROOT, "docs", "readme")).map((f) => `docs/readme/${f}`)];
  for (const file of readmes.filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(join(ROOT, file), "utf8");
    check(
      text.includes("<!-- nein-bench:start -->") && text.includes("<!-- nein-bench:end -->"),
      `${file}: needs the nein-bench markers so bench/report.mjs can update it`,
    );
  }

  try {
    const cases = loadCases();
    for (const [set, list] of Object.entries(cases)) {
      check(list.length >= 10, `bench/cases/${set}.jsonl: needs at least 10 cases, has ${list.length}`);
    }
  } catch (error) {
    problems.push(error.message);
  }

  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = validate();
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    process.exit(1);
  }
  console.log("✓ skill, manifests, generated files, hook and benchmark cases are valid");
}
