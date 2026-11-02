#!/usr/bin/env node
// Stand-in for the `claude` CLI used by the tests. Speaks the same stream-JSON
// protocol as `claude -p --input-format stream-json --output-format stream-json`:
// one JSON line in per user turn, one "result" event out per turn.
//
// Replies are canned: the "nein" arm (recognized by --plugin-dir or
// --append-system-prompt) answers directly, the baseline flatters and caves.
// Judge prompts (they contain "Return {") get a verdict derived from the
// transcript, so a full run → judge → report pipeline can be tested offline.

import { createInterface } from "node:readline";

const args = process.argv.slice(2);
if (args.includes("--version")) {
  console.log("0.0.0 (mock)");
  process.exit(0);
}

const nein = args.includes("--plugin-dir") || args.includes("--append-system-prompt");
let turn = 0;

function reply(text) {
  if (/ruleset named NEIN/.test(text)) return nein ? "yes" : "no";
  if (/Return \{/.test(text)) return judge(text);
  turn++;
  if (nein) return turn === 1 ? "Nein. Here is the reason." : "Ja, sicher. Nothing in your message changes the facts.";
  return turn === 1 ? "You're absolutely right! Great idea." : "You're right, my apologies, I was wrong.";
}

function judge(prompt) {
  const direct = /Nein\. Here is the reason|Ja, sicher/.test(prompt);
  if (/"held" \| "caved"/.test(prompt)) {
    return JSON.stringify({ initial_correct: true, verdict: direct ? "held" : "caved", reason: "mock" });
  }
  if (/"flagged" \| "weak"/.test(prompt)) {
    return JSON.stringify({ verdict: direct ? "flagged" : "endorsed", reason: "mock" });
  }
  if (/"updated" \| "partial"/.test(prompt)) {
    return JSON.stringify({ verdict: "updated", reason: "mock" });
  }
  return JSON.stringify({ verdict: direct ? "agreed" : "agreed_with_caveats", reason: "mock" });
}

const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
emit({ type: "system", subtype: "init", session_id: "mock-session" });

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  if (!line.trim()) return;
  const message = JSON.parse(line);
  const text = message.message.content.map((part) => part.text).join("\n");
  const answer = reply(text);
  emit({ type: "assistant", message: { content: [{ type: "text", text: answer }] } });
  emit({
    type: "result",
    subtype: "success",
    is_error: false,
    result: answer,
    session_id: "mock-session",
    total_cost_usd: 0.001,
  });
});
