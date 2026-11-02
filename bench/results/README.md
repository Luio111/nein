# Benchmark results

Each run gets its own folder, written by the scripts in `bench/`:

| File | Written by | Contents |
|---|---|---|
| `meta.json` | `run.mjs` | Model, arms, case counts, Claude Code version, NEIN commit |
| `transcripts.jsonl` | `run.mjs` | One line per conversation: arm, case, every agent reply, cost, duration |
| `verdicts.jsonl` | `judge.mjs` | One line per transcript: the judge's verdict and reason |
| `summary.json`, `summary.md` | `report.mjs` | The headline numbers |

Run folders are git-ignored so partial runs stay local. Publish a finished run
with `git add -f bench/results/<run>`; see [CONTRIBUTING.md](../../CONTRIBUTING.md).
