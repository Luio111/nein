#!/usr/bin/env node
// Grades every transcript in a results directory with an LLM judge that does
// not see which arm produced it. Writes verdicts.jsonl next to the transcripts
// and skips transcripts that already have a verdict, so it can be re-run.
//
//   node bench/judge.mjs [--dir bench/results/<run>] [--judge-model sonnet]

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCases } from "./lib/cases.mjs";
import { runPrompt } from "./lib/claude.mjs";
import { RUBRICS, parseJudgement } from "./lib/rubrics.mjs";
import { appendJsonl, isMain, latestResultsDir, parseArgs, pool, readJsonl } from "./lib/util.mjs";

const DEFAULTS = {
  dir: "",
  judgeModel: "sonnet",
  concurrency: 3,
  claudeBin: "claude",
  timeoutMs: 180_000,
};

const JUDGE_ARGS = (model) => [
  "--model",
  model,
  "--setting-sources",
  "project",
  "--no-session-persistence",
  "--tools",
  "",
];

async function judgeOne(record, testCase, options) {
  const prompt = RUBRICS[record.set].prompt(testCase, record.replies);
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const cwd = mkdtempSync(join(tmpdir(), "nein-judge-"));
    try {
      const reply = await runPrompt({
        bin: options.claudeBin,
        args: JUDGE_ARGS(options.judgeModel),
        prompt,
        cwd,
        timeoutMs: options.timeoutMs,
      });
      return parseJudgement(record.set, reply);
    } catch (error) {
      lastError = error;
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
  throw lastError;
}

async function main() {
  const options = parseArgs(process.argv.slice(2), DEFAULTS);
  const dir = options.dir || latestResultsDir();
  const transcripts = readJsonl(join(dir, "transcripts.jsonl")).filter((t) => !t.error);
  const verdictsPath = join(dir, "verdicts.jsonl");
  const judged = new Set(readJsonl(verdictsPath).map((v) => v.key));
  const casesBySet = loadCases();
  const caseById = new Map(Object.values(casesBySet).flat().map((c) => [c.id, c]));

  const todo = transcripts.filter((t) => !judged.has(t.key));
  console.log(`${todo.length} transcripts to judge with ${options.judgeModel} (${judged.size} already judged)`);

  let finished = 0;
  let failed = 0;
  await pool(todo, options.concurrency, async (record) => {
    try {
      const judgement = await judgeOne(record, caseById.get(record.id), options);
      appendJsonl(verdictsPath, {
        key: record.key,
        set: record.set,
        judgeModel: options.judgeModel,
        ...judgement,
      });
      finished++;
      console.log(`[${finished + failed}/${todo.length}] ${record.key} → ${judgement.verdict}`);
    } catch (error) {
      failed++;
      console.log(`[${finished + failed}/${todo.length}] ${record.key} judge error: ${error.message.slice(0, 120)}`);
    }
  });

  console.log(`Judged ${finished}, failed ${failed}. Next: node bench/report.mjs --dir ${dir} --readme`);
  if (failed > 0) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
