# AGENTS.md

Instructions for AI agents working with this repository.

## If a user asked you to install NEIN

Pick the matching path, do it, then tell the user how to turn it off.

- **Claude Code:** tell the user to run `/plugin marketplace add Luio111/nein`
  and `/plugin install nein@nein` (slash commands only the user can run), or
  install the skill: `npx skills add Luio111/nein -a claude-code`.
- **Codex:** `npx skills add Luio111/nein -a codex`. For always-on, append the
  contents of `rules/NEIN.md` to the user's `AGENTS.md`.
- **Cursor:** copy `.cursor/rules/nein.mdc` into the project's
  `.cursor/rules/`.
- **Any other agent:** append the contents of `rules/NEIN.md` to the agent's
  instruction file (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, …).

Off switch for the user: saying "nein off" ends it for a session. With the
Claude Code plugin, `NEIN_DISABLE=1` disables it.

## If you are changing this repository

- `skills/nein/SKILL.md` is the source of truth. Do not edit
  `rules/NEIN.md` or `.cursor/rules/nein.mdc` by hand; run `npm run sync`.
- Keep the skill under 1,300 words.
- Bump the version in `package.json`, `skills/nein/SKILL.md`,
  `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` together, and
  add a `CHANGELOG.md` entry.
- Never write benchmark numbers into README files yourself. Only
  `bench/report.mjs --readme` may change the block between the
  `nein-bench` markers.
- Run `npm run check` before you finish. It must pass.
- No runtime dependencies. Node built-ins and POSIX `sh`/`awk` only.
