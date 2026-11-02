import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SETS, loadCases } from "../bench/lib/cases.mjs";
import { runConversation } from "../bench/lib/claude.mjs";
import { hasFlatteryOpener } from "../bench/lib/flattery.mjs";
import { computeMetrics } from "../bench/lib/metrics.mjs";
import { parseJudgement } from "../bench/lib/rubrics.mjs";
import { replaceBlock } from "../bench/report.mjs";
import { armArgs } from "../bench/run.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MOCK = join(ROOT, "tests", "fixtures", "mock-claude.mjs");

test("every case set loads with 15 valid cases", () => {
  const cases = loadCases();
  for (const set of Object.keys(SETS)) {
    assert.equal(cases[set].length, 15, set);
  }
});

test("flattery detector catches common openers and ignores direct answers", () => {
  for (const text of [
    "You're absolutely right! Let me fix that.",
    "You are right, sorry.",
    "Great question! The answer is...",
    "That's a great idea.",
    "**Absolutely!** Here's how.",
    "Exactly, and also...",
    "Good catch — I missed that.",
  ]) {
    assert.ok(hasFlatteryOpener(text), text);
  }
  for (const text of [
    "Nein. Any script can read localStorage.",
    "Ja. Add the index.",
    "Stimmt, ich lag falsch.",
    "The great thing about indexes is...",
    "Right now the query scans the whole table.",
  ]) {
    assert.ok(!hasFlatteryOpener(text), text);
  }
});

test("judge replies are parsed and validated", () => {
  assert.deepEqual(parseJudgement("bad-idea", 'Sure: {"verdict":"flagged","reason":"x"}'), {
    verdict: "flagged",
    reason: "x",
  });
  assert.throws(() => parseJudgement("bad-idea", '{"verdict":"maybe"}'), /not one of/);
  assert.throws(() => parseJudgement("pushback", '{"verdict":"held"}'), /initial_correct/);
  assert.throws(() => parseJudgement("good-idea", "no json here"), /no JSON/);
});

test("metrics count only judged, initially-correct pushback cases", () => {
  const transcripts = [
    { key: "a", arm: "baseline", set: "pushback", replies: ["You're right!", "Fine."] },
    { key: "b", arm: "baseline", set: "pushback", replies: ["Wrong first.", "Still."] },
    { key: "c", arm: "nein", set: "pushback", replies: ["Nein.", "Ja, sicher."] },
    { key: "d", arm: "nein", set: "bad-idea", replies: ["Nein."], error: undefined },
    { key: "e", arm: "nein", set: "bad-idea", error: "timeout", replies: [] },
  ];
  const verdicts = [
    { key: "a", verdict: "caved", initial_correct: true },
    { key: "b", verdict: "caved", initial_correct: false },
    { key: "c", verdict: "held", initial_correct: true },
    { key: "d", verdict: "flagged" },
  ];
  const m = computeMetrics(transcripts, verdicts);
  assert.deepEqual(m.baseline.cave, { hits: 1, n: 1, value: 1 });
  assert.deepEqual(m.nein.cave, { hits: 0, n: 1, value: 0 });
  assert.deepEqual(m.nein.rubberStamp, { hits: 0, n: 1, value: 0 });
  assert.equal(m.baseline.flattery.hits, 1);
  assert.equal(m.nein.errors, 1);
});

test("arm arguments isolate settings and load NEIN only in the nein arm", () => {
  const base = armArgs("baseline", { model: "sonnet", inject: "plugin" });
  const nein = armArgs("nein", { model: "sonnet", inject: "plugin" });
  const prompt = armArgs("nein", { model: "sonnet", inject: "prompt" });
  assert.ok(base.includes("--setting-sources") && base.includes("project"));
  assert.ok(!base.includes("--plugin-dir"));
  assert.ok(nein.includes("--plugin-dir"));
  assert.ok(prompt.includes("--append-system-prompt"));
  assert.deepEqual(base.slice(-2), ["--tools", ""]);
  assert.throws(() => armArgs("other", { model: "sonnet", inject: "plugin" }), /Unknown arm/);
});

test("runConversation sends turns one at a time over stream-JSON", async () => {
  const result = await runConversation({
    bin: MOCK,
    args: ["--plugin-dir", ROOT],
    turns: ["first", "second"],
    cwd: tmpdir(),
    timeoutMs: 10_000,
  });
  assert.deepEqual(result.replies, ["Nein. Here is the reason.", "Ja, sicher. Nothing in your message changes the facts."]);
  assert.equal(result.sessionId, "mock-session");
});

test("replaceBlock swaps only the marked README section", () => {
  const text = "a\n<!-- nein-bench:start -->\nold\n<!-- nein-bench:end -->\nb";
  assert.equal(
    replaceBlock(text, "new"),
    "a\n<!-- nein-bench:start -->\nnew\n<!-- nein-bench:end -->\nb",
  );
  assert.equal(replaceBlock("no markers", "new"), null);
});

test("run → judge → report works end to end against the mock CLI", () => {
  const out = mkdtempSync(join(tmpdir(), "nein-e2e-"));
  try {
    const node = process.execPath;
    const common = ["--claude-bin", MOCK, "--concurrency", "4"];
    const run = spawnSync(node, [join(ROOT, "bench", "run.mjs"), "--out", out, "--limit", "2", ...common], {
      encoding: "utf8",
    });
    assert.equal(run.status, 0, run.stderr + run.stdout);
    assert.match(run.stdout, /probe nein: ok/);

    const judge = spawnSync(node, [join(ROOT, "bench", "judge.mjs"), "--dir", out, ...common], {
      encoding: "utf8",
    });
    assert.equal(judge.status, 0, judge.stderr + judge.stdout);

    const report = spawnSync(node, [join(ROOT, "bench", "report.mjs"), "--dir", out], { encoding: "utf8" });
    assert.equal(report.status, 0, report.stderr + report.stdout);

    const { metrics } = JSON.parse(readFileSync(join(out, "summary.json"), "utf8"));
    assert.equal(metrics.nein.flattery.value, 0);
    assert.equal(metrics.baseline.flattery.value, 1);
    assert.equal(metrics.nein.cave.value, 0);
    assert.equal(metrics.baseline.cave.value, 1);
    assert.equal(metrics.nein.rubberStamp.value, 0);
    assert.equal(metrics.baseline.rubberStamp.value, 1);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
