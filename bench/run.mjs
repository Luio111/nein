#!/usr/bin/env node
// Runs every benchmark case through Claude Code, once without NEIN (baseline)
// and once with it, and writes the raw transcripts to bench/results/<run>/.
//
//   node bench/run.mjs [--model sonnet] [--runs 1] [--concurrency 3]
//                      [--inject plugin|prompt] [--sets pushback,bad-idea]
//                      [--limit 3] [--out bench/results/my-run]
//
// Both arms run in a fresh empty directory with `--setting-sources project`,
// `--strict-mcp-config`, no tools and no session persistence, so your own
// settings, plugins, MCP servers and CLAUDE.md stay out of the measurement. A probe checks that before starting.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { ROOT, readSkill } from "../scripts/lib/skill.mjs";
import { SETS, loadCases } from "./lib/cases.mjs";
import { claudeVersion, runConversation, runPrompt } from "./lib/claude.mjs";
import { appendJsonl, isMain, parseArgs, pool, readJsonl } from "./lib/util.mjs";

const DEFAULTS = {
  model: "sonnet",
  arms: "baseline,nein",
  sets: Object.keys(SETS).join(","),
  runs: 1,
  concurrency: 3,
  inject: "plugin",
  out: "",
  claudeBin: "claude",
  limit: 0,
  timeoutMs: 180_000,
  skipProbe: false,
  help: false,
};

const PROBE =
  "Does your context contain a ruleset named NEIN (verdict words Ja / Nein / Jein)? Answer with one word: yes or no.";

export function armArgs(arm, { model, inject }) {
  // --strict-mcp-config: without it, MCP servers that finish connecting after
  // turn one (e.g. claude.ai connectors) add their tools to turn two.
  const args = ["--model", model, "--setting-sources", "project", "--strict-mcp-config", "--no-session-persistence"];
  if (arm === "nein") {
    if (inject === "plugin") args.push("--plugin-dir", ROOT);
    else if (inject === "prompt") args.push("--append-system-prompt", readSkill().body);
    else throw new Error(`--inject must be "plugin" or "prompt", got "${inject}"`);
  } else if (arm !== "baseline") {
    throw new Error(`Unknown arm "${arm}"`);
  }
  // Last on purpose: --tools takes a variadic list.
  args.push("--tools", "");
  return args;
}

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "nein-bench-"));
  return fn(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
}

async function probe(arm, options) {
  const reply = await withTempDir((cwd) =>
    runPrompt({
      bin: options.claudeBin,
      args: armArgs(arm, options),
      prompt: PROBE,
      cwd,
      timeoutMs: options.timeoutMs,
    }),
  );
  const saysYes = /^\W*(yes|ja)\b/i.test(reply.trim());
  const expected = arm === "nein";
  if (saysYes !== expected) {
    const hint =
      arm === "nein"
        ? 'The NEIN arm does not see the ruleset. Try --inject prompt.'
        : "The baseline arm already sees NEIN. Is it installed in a place --setting-sources project still loads?";
    throw new Error(`Probe failed for arm "${arm}" (reply: ${JSON.stringify(reply.slice(0, 80))}). ${hint}`);
  }
  console.log(`probe ${arm}: ok`);
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2), DEFAULTS);
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const arms = options.arms.split(",").map((a) => a.trim());
  const sets = options.sets.split(",").map((s) => s.trim());
  const cases = loadCases(sets);

  const version = claudeVersion(options.claudeBin);
  if (!version) {
    throw new Error(`Could not run "${options.claudeBin} --version". Install Claude Code and log in first.`);
  }

  const date = new Date().toISOString().slice(0, 10);
  const out = options.out || join(ROOT, "bench", "results", `${date}-${options.model}-${options.inject}`);
  mkdirSync(out, { recursive: true });
  const transcriptsPath = join(out, "transcripts.jsonl");

  writeFileSync(
    join(out, "meta.json"),
    `${JSON.stringify(
      {
        started: new Date().toISOString(),
        model: options.model,
        arms,
        sets,
        runs: options.runs,
        inject: options.inject,
        claudeCode: version,
        neinCommit: gitCommit(),
        node: process.version,
        cases: Object.fromEntries(sets.map((s) => [s, cases[s].length])),
        limit: options.limit || null,
      },
      null,
      2,
    )}\n`,
  );

  if (!options.skipProbe) {
    for (const arm of arms) await probe(arm, options);
  }

  const done = new Set(readJsonl(transcriptsPath).filter((t) => !t.error).map((t) => t.key));
  const jobs = [];
  for (let run = 1; run <= options.runs; run++) {
    for (const set of sets) {
      const selected = options.limit ? cases[set].slice(0, options.limit) : cases[set];
      for (const c of selected) {
        for (const arm of arms) {
          const key = `${arm}/${set}/${c.id}/r${run}`;
          if (!done.has(key)) jobs.push({ key, arm, set, c, run });
        }
      }
    }
  }

  console.log(`${jobs.length} conversations to run (${done.size} already done) → ${relative(ROOT, out)}`);
  let finished = 0;
  await pool(jobs, options.concurrency, async ({ key, arm, set, c, run }) => {
    const started = Date.now();
    const record = { key, arm, set, id: c.id, run, model: options.model };
    try {
      const result = await withTempDir((cwd) =>
        runConversation({
          bin: options.claudeBin,
          args: armArgs(arm, options),
          turns: SETS[set].turns(c),
          cwd,
          timeoutMs: options.timeoutMs,
        }),
      );
      if (result.maxTools > 0) {
        throw new Error(`${result.maxTools} tools were loaded; the arm is not isolated`);
      }
      Object.assign(record, { replies: result.replies, costUsd: result.costUsd, modelId: result.model });
    } catch (error) {
      record.error = error.message;
    }
    record.durationMs = Date.now() - started;
    appendJsonl(transcriptsPath, record);
    finished++;
    const status = record.error ? `error: ${record.error.slice(0, 120)}` : "ok";
    console.log(`[${finished}/${jobs.length}] ${key} ${status} ${(record.durationMs / 1000).toFixed(1)}s`);
  });

  console.log(`Done. Next: node bench/judge.mjs --dir ${relative(process.cwd(), out)}`);
}

const USAGE =
  "Usage: node bench/run.mjs [--model sonnet] [--runs 1] [--concurrency 3] [--inject plugin|prompt] [--sets a,b] [--limit n] [--out dir] [--claude-bin claude] [--skip-probe]";

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
