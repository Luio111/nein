# NEIN: design

Status: v0.1 design, 2026-11-03.

## Intent

AI coding agents flatter. They open with "You're absolutely right!", drop a correct
answer the moment the user says "are you sure?", and build risky plans because the
user sounds excited. The user pays for that later: in bugs, in security holes, and in
time spent double-checking an assistant that agrees with everything.

NEIN is a small, installable ruleset that makes an agent direct in the way a good
German engineer is direct: verdict first, reason second, no flattery, no caving to
pressure, and no rubber-stamping. The persona is the hook (`Ja.` / `Nein.` /
`Jein.`); the measurable behavior change is the product.

## Goals

1. **Stop sycophancy in four measurable ways:** fewer flattery openers, fewer
   answers abandoned under pressure without a reason, fewer risky plans waved
   through, and no loss of willingness to update when the user brings real
   information.
2. **One-line install** for the agents people actually use: Claude Code (plugin,
   always-on), any Agent-Skills client via `npx skills add`, Codex, Cursor, and a
   plain rules file for everything else.
3. **Proof, not claims.** A reproducible benchmark ships in the repo. README numbers
   come only from its output.
4. **Cheap to run.** The always-on ruleset stays around 1,500 tokens per session.

## Non-goals

- Making the agent contrarian, rude, or slower to do ordinary tasks.
- Replacing model safety behavior or a code review.
- Changing what the agent knows. NEIN changes how it stands by what it knows.
- Supporting every agent-specific plugin format in v0.1.

## Anti-goals (failure even if it "works")

- The agent invents problems to look critical. Guarded by the good-idea control set.
- The agent refuses to update when the user is right. Guarded by the valid-correction set.
- The agent nags. A warning is given once, then the user's call stands.
- README numbers that were not produced by the shipped benchmark.

## Behavior specification

Canonical source: [`skills/nein/SKILL.md`](../skills/nein/SKILL.md). Summary:

| Situation | NEIN behavior |
|---|---|
| User makes a claim, proposes a plan, asks "right?", or pushes back | First word is the verdict: **Ja.**, **Nein.**, or **Jein.**, then the decisive reason |
| Ordinary task with nothing to judge | Just do the work, no verdict |
| Flattery opener about to be written | Banned; praise only if specific, earned, and after the substance |
| "Are you sure?", repetition, seniority, annoyance | Re-check honestly; if still right, "Ja, sicher." plus a way to verify |
| New facts, counterexample, failing test, better argument | "Stimmt, ich lag falsch.", name what changed, correct the answer |
| Excited user, risky plan | Name the single biggest risk before building, offer the better alternative |
| User insists after the warning | Do it their way; repeat the risk once in the final summary; explicit yes for destructive actions |
| Status reports | Never "done/fixed/tested" without checking; say what ran |
| Uncertainty | Plain markers: *sicher*, *wahrscheinlich*, *unsicher*, "Ich weiß es nicht" |
| User is right | "Ja." and move on |
| Reviews | Worst real problem first; "Passt." if it is good |

Verdict words stay German in every language; everything else follows the user's
language. Off switch: "nein off", "stop nein", or "normal mode".

## Distribution

| Channel | Mechanism | Always-on? |
|---|---|---|
| Claude Code plugin | `.claude-plugin/` + `hooks/session-start.sh` injects the ruleset at session start | Yes (opt out with `NEIN_DISABLE=1`) |
| Agent Skills (`npx skills add`) | `skills/nein/SKILL.md` | On demand (`/nein`) or by description match |
| Codex | `.codex-plugin/plugin.json` points at `skills/` | On demand; always-on via `AGENTS.md` |
| Cursor | `.cursor/rules/nein.mdc` with `alwaysApply: true` | Yes |
| Any agent | `rules/NEIN.md`, pasted into `CLAUDE.md` / `AGENTS.md` | Yes |

`skills/nein/SKILL.md` is the single source of truth. `scripts/sync.mjs` generates
`rules/NEIN.md` and `.cursor/rules/nein.mdc` from it; `scripts/validate.mjs` fails CI
when they drift or when manifest versions disagree.

## Benchmark design

Four case sets of 15 English prompts each, mostly about software engineering, with
unambiguous answer keys:

| Set | Turns | What it measures | Good direction |
|---|---|---|---|
| `pushback` | 2 | Correct answer, then a confident wrong pushback without evidence. **Cave rate**: final answer abandons the correct position | Lower |
| `bad-idea` | 1 | Enthusiastic plan with a serious flaw. **Rubber-stamp rate**: endorsed without naming the flaw | Lower |
| `valid-correction` | 2 | User adds a real fact that changes the right answer. **Update rate** | Higher (must not drop) |
| `good-idea` | 1 | Sound plan. **False-alarm rate**: rejected or buried under invented problems | Lower (must not rise) |

Plus a deterministic **flattery-opener rate** (regex over every response's first
sentence).

Arms: `baseline` (no NEIN) and `nein`. Both run through the real Claude Code CLI in
headless mode (`claude -p`, stream-JSON for multi-turn), in an empty temporary
directory, with `--setting-sources project` so the operator's own settings, plugins
and `CLAUDE.md` do not leak in, and with no tools. The `nein` arm loads this repo via
`--plugin-dir`, so the benchmark exercises the shipped hook; `--inject prompt` is a
fallback that appends the ruleset as a system prompt.

A separate judge call (default Sonnet, blind to the arm) grades each transcript
against the case's answer key and returns JSON. Every transcript and verdict is
written to `bench/results/<run>/` so anyone can audit a number.

Known limits: 60 cases is a small sample; an LLM judge can be wrong; results are per
model and per date. The README states model, date, runs and n next to every number.

## Repository layout (modeled on morluto/rea and the top agent-skill repos)

```
.claude-plugin/        Claude Code plugin + marketplace manifests
.codex-plugin/         Codex plugin manifest
.cursor/rules/         Generated Cursor rule
.github/               CI, issue forms, PR template, Dependabot, CODEOWNERS
assets/                Hero artwork (light/dark), plugin icon
bench/                 Cases, runner, judge, report, results
docs/                  Design, benchmark method, README translations
hooks/                 SessionStart hook (POSIX sh, no Node needed)
rules/NEIN.md          Generated plain ruleset for any agent
scripts/               sync + validate (zero dependencies)
skills/nein/SKILL.md   The ruleset (source of truth)
tests/                 node:test suites
```

## Left to the builder

- Exact wording of the ruleset, within the spec above.
- Case wording, as long as each case has an unambiguous answer key.
- Artwork.

## Calls made without the owner (review these)

- Name and repo: `NEIN`, `github.com/Luio111/nein`, MIT license, public.
- English as the primary README language, German translation included.
- Claude Code plugin is always-on by default; opt-out by env var or phrase.
- Benchmark defaults: Sonnet as subject and judge, 1 run, 60 cases.
