# Security

NEIN is a set of instructions plus one shell hook. It makes no network calls,
stores nothing, and has no runtime dependencies.

What runs on your machine:

- **Claude Code plugin:** `hooks/session-start.sh` runs at session start. It
  reads `skills/nein/SKILL.md` from the plugin folder and prints it. Nothing
  else. Read it before installing; it is short.
- **Benchmark (optional):** `bench/*.mjs` start the `claude` CLI you already
  have, in temporary directories, with no tools enabled. They use your own
  Claude account or API key and therefore your usage limits.

## Reporting a vulnerability

Please use GitHub's [private vulnerability reporting](https://github.com/Luio111/nein/security/advisories/new)
instead of a public issue. You will get an answer within a week.

Relevant reports include anything in the hook or scripts that executes
unexpected code, reads files outside the repository, or could be abused through
a crafted skill or case file.
