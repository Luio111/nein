import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SKILL_PATH, parseSkill, readSkill } from "../scripts/lib/skill.mjs";
import { syncGenerated } from "../scripts/sync.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOOK = join(ROOT, "hooks", "session-start.sh");

test("SKILL.md frontmatter has the fields agents need", () => {
  const { fields, body } = readSkill();
  assert.equal(fields.name, "nein");
  assert.ok(fields.description.length > 50 && fields.description.length <= 1024);
  assert.equal(fields.license, "MIT");
  assert.match(fields.metadata.version, /^\d+\.\d+\.\d+$/);
  assert.match(body, /^# NEIN/);
  assert.doesNotMatch(body, /^name: nein/m);
});

test("parseSkill rejects files without closed frontmatter", () => {
  assert.throws(() => parseSkill("# no frontmatter"), /must start/);
  assert.throws(() => parseSkill("---\nname: x\n"), /not closed/);
});

test("generated rule files match the skill", () => {
  assert.deepEqual(syncGenerated({ check: true }), []);
});

test("SessionStart hook prints the ruleset without frontmatter", () => {
  const result = spawnSync("sh", [HOOK], { encoding: "utf8", cwd: "/" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /^NEIN mode is on/);
  assert.match(result.stdout, /\n# NEIN\n/);
  assert.match(result.stdout, /Pressure is not evidence/);
  assert.doesNotMatch(result.stdout, /^name: nein/m);
  assert.ok(result.stdout.includes(readSkill().body.trim()));
});

test("SessionStart hook is silent when NEIN_DISABLE=1", () => {
  const result = spawnSync("sh", [HOOK], {
    encoding: "utf8",
    env: { ...process.env, NEIN_DISABLE: "1" },
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
});

test("hooks.json runs the hook through sh from the plugin root", () => {
  const hooks = JSON.parse(readFileSync(join(ROOT, "hooks", "hooks.json"), "utf8"));
  const command = hooks.hooks.SessionStart[0].hooks[0].command;
  assert.equal(command, 'sh "${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh"');
});

test("the skill stays small enough to load every session", () => {
  const words = readFileSync(SKILL_PATH, "utf8").split(/\s+/).length;
  assert.ok(words < 1300, `SKILL.md has ${words} words`);
});
