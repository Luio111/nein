// Small helpers shared by the bench scripts: argument parsing, JSONL files and
// a bounded-concurrency task pool.

import { appendFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseJsonl } from "./cases.mjs";

export const RESULTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "results");

// True when the module with this import.meta.url is the script node was started with.
export const isMain = (metaUrl) =>
  Boolean(process.argv[1]) && metaUrl === pathToFileURL(process.argv[1]).href;

// Most recently modified run directory under bench/results.
export function latestResultsDir(root = RESULTS_DIR) {
  const runs = existsSync(root)
    ? readdirSync(root)
        .map((name) => join(root, name))
        .filter((path) => statSync(path).isDirectory() && existsSync(join(path, "transcripts.jsonl")))
    : [];
  if (runs.length === 0) throw new Error(`No benchmark runs in ${root}. Run node bench/run.mjs first.`);
  return runs.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

// Parses `--name value` and `--flag` pairs into an object, applying defaults.
export function parseArgs(argv, defaults) {
  const options = { ...defaults };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument "${arg}"`);
    const name = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!(name in defaults)) throw new Error(`Unknown option ${arg}`);
    if (typeof defaults[name] === "boolean") {
      options[name] = true;
    } else {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Option ${arg} needs a value`);
      options[name] = typeof defaults[name] === "number" ? Number(value) : value;
    }
  }
  return options;
}

export function readJsonl(path) {
  return existsSync(path) ? parseJsonl(readFileSync(path, "utf8"), path) : [];
}

export function appendJsonl(path, record) {
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}

// Runs async `task(item)` for every item with at most `limit` in flight.
export async function pool(items, limit, task) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await task(item);
    }
  });
  await Promise.all(workers);
}
