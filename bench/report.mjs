#!/usr/bin/env node
// Computes the headline numbers for one or more results directories, writes
// summary.json and summary.md into each, and with --readme replaces the block
// between the nein-bench markers in README.md and every translated README.
// Several directories (one per model) become one table with a column each.
//
//   node bench/report.mjs [--dir bench/results/<run>[,<run>...]] [--readme]

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ROOT } from "../scripts/lib/skill.mjs";
import { SETS } from "./lib/cases.mjs";
import { METRICS, computeMetrics, formatRate } from "./lib/metrics.mjs";
import { isMain, latestResultsDir, parseArgs, readJsonl } from "./lib/util.mjs";

const START = "<!-- nein-bench:start -->";
const END = "<!-- nein-bench:end -->";
// Absolute, so the link also works from translated READMEs in docs/readme/.
const REPO_TREE = "https://github.com/Luio111/nein/tree/main";

const SECTIONS = {
  standard: "**Standard tier:** one plain question or pushback",
  hard: "**Hard tier:** three rounds of pressure",
};

// Metric rows for every metric any run measured, with a heading row before
// each tier. `cells(metric)` returns the cells between label and "Better".
function metricRows(runs, cells, width) {
  const measured = METRICS.filter((m) =>
    runs.some(({ metrics }) => Object.values(metrics).some((arm) => arm[m.key]?.n > 0)),
  );
  const rows = [];
  let tier = null;
  for (const m of measured) {
    const metricTier = m.set ? SETS[m.set].tier : null;
    if (metricTier && metricTier !== tier) {
      rows.push(`| ${SECTIONS[metricTier]} |${" |".repeat(width)}`);
      tier = metricTier;
    }
    rows.push(`| ${m.label} | ${cells(m).join(" | ")} | ${m.better} |`);
  }
  return rows;
}

const modelName = (meta) => meta.modelId ?? meta.model;
const resultsLink = (meta) => `[\`${meta.resultsPath}\`](${REPO_TREE}/${meta.resultsPath})`;
const judgeText = (meta) => (meta.judgeModel ? `, judge ${meta.judgeModel}` : "");

export function renderTable(metrics, meta) {
  const cases = Object.entries(meta.cases ?? {})
    .map(([set, n]) => `${n} ${set}`)
    .join(", ");
  return [
    "| | Without NEIN | With NEIN | Better |",
    "|---|---|---|---|",
    ...metricRows([{ metrics }], (m) => [formatRate(metrics.baseline?.[m.key]), `**${formatRate(metrics.nein?.[m.key])}**`], 3),
    "",
    `<sub>Measured ${meta.started?.slice(0, 10)} with ${meta.claudeCode ?? "Claude Code"}, model ${modelName(meta)}${judgeText(meta)}, ` +
      `${meta.runs} run(s) of ${cases} cases, NEIN loaded via ${meta.inject}. ` +
      `Every transcript and verdict: ${resultsLink(meta)}.</sub>`,
  ].join("\n");
}

// One column per run: "without → **with**".
export function renderComparison(runs) {
  const cell = (metrics, key) => `${formatRate(metrics.baseline?.[key])} → **${formatRate(metrics.nein?.[key])}**`;
  const first = runs[0].meta;
  const perSet = [...new Set(runs.flatMap(({ meta }) => Object.values(meta.cases ?? {})))].join(" or ");
  return [
    `| | ${runs.map(({ meta }) => modelName(meta)).join(" | ")} | Better |`,
    `|---|${"---|".repeat(runs.length)}---|`,
    ...metricRows(runs, (m) => runs.map(({ metrics }) => cell(metrics, m.key)), runs.length + 1),
    "",
    `<sub>Each cell: without NEIN → **with NEIN**. Measured ${first.started?.slice(0, 10)} with ` +
      `${first.claudeCode ?? "Claude Code"}${judgeText(first)}, ${first.runs} run(s) of ${perSet} cases per set, ` +
      `NEIN loaded via ${first.inject}. Every transcript and verdict: ` +
      `${runs.map(({ meta }) => resultsLink(meta)).join(", ")}.</sub>`,
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

// Reads a results folder, computes its metrics and writes its summaries.
function summarize(dir) {
  const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
  const transcripts = readJsonl(join(dir, "transcripts.jsonl"));
  const verdicts = readJsonl(join(dir, "verdicts.jsonl"));
  meta.judgeModel = verdicts[0]?.judgeModel ?? null;
  meta.modelId = transcripts.find((t) => t.modelId)?.modelId ?? meta.modelId ?? null;
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
  return { meta, metrics, table };
}

function main() {
  const options = parseArgs(process.argv.slice(2), { dir: "", readme: false });
  const dirs = options.dir ? options.dir.split(",").map((d) => resolve(d.trim())) : [latestResultsDir()];
  const runs = dirs.map(summarize);
  const block = runs.length === 1 ? runs[0].table : renderComparison(runs);
  console.log(block);

  if (options.readme) {
    for (const file of readmeFiles()) {
      const updated = replaceBlock(readFileSync(file, "utf8"), block);
      if (updated) {
        writeFileSync(file, updated);
        console.log(`Updated ${relative(ROOT, file)}`);
      }
    }
  }
}

if (isMain(import.meta.url)) main();
