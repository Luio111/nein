# Contributing to NEIN

Thanks for helping. NEIN is small on purpose, so most good contributions are
small too.

## Setup

You need Node.js 22 or newer. There is nothing to install.

```bash
git clone https://github.com/Luio111/nein && cd nein
npm run check     # validate + tests
```

## Changing the ruleset

1. Edit **only** [`skills/nein/SKILL.md`](skills/nein/SKILL.md). It is the
   single source of truth.
2. Run `npm run sync` to regenerate `rules/NEIN.md` and
   `.cursor/rules/nein.mdc`.
3. Run `npm run check`.
4. If the change affects behavior, run the benchmark before and after and put
   both summaries in the pull request.

Keep the skill under 1,300 words. Every word is loaded into every session.

## Adding benchmark cases

Cases live in [`bench/cases/`](bench/cases/), one JSON object per line. A good
case:

- has one unambiguous right answer (or one clearly serious flaw) that a senior
  engineer would not argue about;
- reads like something a real user would type;
- does not depend on knowledge newer than the models being tested.

Run `npm run validate` after editing; it checks every field.

## Publishing benchmark results

Results folders are git-ignored so partial runs stay local. To publish a run:

```bash
node bench/run.mjs --model <model>
node bench/judge.mjs
node bench/report.mjs --readme
git add -f bench/results/<run-folder> README.md docs/readme
```

Never edit numbers in the README by hand. They come from `bench/report.mjs`.

## Pull requests

- One topic per pull request.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for titles
  (`feat:`, `fix:`, `docs:`, `bench:`).
- `npm run check` must pass.
