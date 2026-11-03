#!/usr/bin/env node
// Computes the headline numbers for a results directory, writes summary.json
// and summary.md there, and with --readme replaces the block between the
// nein-bench markers in README.md and every translated README.
//
//   node bench/report.mjs [--dir bench/results/<run>] [--readme]

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT } from "../scripts/lib/skill.mjs";
import { METRICS, computeMetrics, formatRate } from "./lib/metrics.mjs";
import { isMain, latestResultsDir, parseArgs, readJsonl } from "./lib/util.mjs";

const START = "<!-- nein-bench:start -->";
const END = "<!-- nein-bench:end -->";
// Absolute, so the link also works from translated READMEs in docs/readme/.
const REPO_TREE = "https://github.com/Luio111/nein/tree/main";

export function renderTable(metrics, meta) {
  // Rows for sets this run did not include would only say "n/a".
  const measured = METRICS.filter((m) => Object.values(metrics).some((arm) => arm[m.key]?.n > 0));
  const rows = measured.map(
    (m) =>
      `| ${m.label} | ${formatRate(metrics.baseline?.[m.key])} | **${formatRate(metrics.nein?.[m.key])}** | ${m.better} |`,
  );
  const judge = meta.judgeModel ? `, judge ${meta.judgeModel}` : "";
  const cases = Object.entries(meta.cases ?? {})
    .map(([set, n]) => `${n} ${set}`)
    .join(", ");
  return [
    "| | Without NEIN | With NEIN | Better |",
    "|---|---|---|---|",
    ...rows,
    "",
    `<sub>Measured ${meta.started?.slice(0, 10)} with ${meta.claudeCode ?? "Claude Code"}, model ${meta.model}${judge}, ` +
      `${meta.runs} run(s) of ${cases} cases, NEIN loaded via ${meta.inject}. ` +
      `Every transcript and verdict: [\`${meta.resultsPath}\`](${REPO_TREE}/${meta.resultsPath}).</sub>`,
  ].join("\n");
}

export function replaceBlock(text, block) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start === -1 || end === -1 || end < start) return null;
  return `${text.slice(0, start + START.length)}\n${block}\n${text.slice(end)}`;
}

function readmeFiles() {
  const files = [join(ROOT, "README.md")];
  const translations = join(ROOT, "docs", "readme");
  if (existsSync(translations)) {
    for (const name of readdirSync(translations)) {
      if (name.endsWith(".md")) files.push(join(translations, name));
    }
  }
  return files;
}

function main() {
  const options = parseArgs(process.argv.slice(2), { dir: "", readme: false });
  const dir = options.dir || latestResultsDir();
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const transcripts = readJsonl(join(dir, "transcripts.jsonl"));
  const verdicts = readJsonl(join(dir, "verdicts.jsonl"));
  meta.judgeModel = verdicts[0]?.judgeModel ?? null;
  meta.resultsPath = relative(ROOT, dir);

  const metrics = computeMetrics(transcripts, verdicts);
  const table = renderTable(metrics, meta);

  writeFileSync(join(dir, "summary.json"), `${JSON.stringify({ meta, metrics }, null, 2)}\n`);
  writeFileSync(
    join(dir, "summary.md"),
    `# NEIN benchmark, ${meta.started?.slice(0, 10)}\n\n${table}\n\nErrors: ${Object.entries(metrics)
      .map(([arm, m]) => `${arm} ${m.errors}`)
      .join(", ")}.\n`,
  );
  console.log(table);

  if (options.readme) {
    for (const file of readmeFiles()) {
      const updated = replaceBlock(readFileSync(file, "utf8"), table);
      if (updated) {
        writeFileSync(file, updated);
        console.log(`Updated ${relative(ROOT, file)}`);
      }
    }
  }
}

if (isMain(import.meta.url)) main();
