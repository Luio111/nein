# Changelog

All notable changes to NEIN are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-03

### Added

- `skills/nein/SKILL.md`: the NEIN ruleset. Verdict first (Ja / Nein / Jein),
  no flattery openers, no caving to pressure without evidence, clean change of
  mind on real evidence, risk named before risky plans, warn once, honest
  status, calibrated certainty, reviews worst-problem-first.
- Claude Code plugin with a SessionStart hook that loads NEIN in every session
  (`NEIN_DISABLE=1` to opt out), plus marketplace manifest.
- Codex plugin manifest, generated Cursor rule and a plain `rules/NEIN.md` for
  any agent.
- Open benchmark: 60 cases in four sets (pushback, bad idea, valid correction,
  good idea), a headless Claude Code runner with an isolated baseline arm, a
  blind LLM judge and a report that writes the README numbers.
- `scripts/sync.mjs` and `scripts/validate.mjs`, node:test suites, and CI.

[0.1.0]: https://github.com/Luio111/nein/releases/tag/v0.1.0
