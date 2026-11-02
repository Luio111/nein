// Drives the Claude Code CLI in headless mode.
//
// runConversation() keeps one `claude -p` process open in stream-JSON mode and
// sends the user turns one at a time, so the second turn really follows the
// agent's own first answer. runPrompt() is a single-turn call used by the judge.

import { spawn, spawnSync } from "node:child_process";

// Variables set by a parent Claude Code host (desktop app, IDE, a running
// session). Inherited by a child `claude`, they can force bare mode or point
// it at the host's private endpoints, so the benchmark removes them.
const HOST_VARIABLES = [
  "CLAUDECODE",
  "CLAUDE_CODE_SIMPLE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_HOST_SESSION_ID",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN",
  "CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH",
  "ANTHROPIC_BASE_URL",
];

export function cleanEnv(env = process.env) {
  const copy = { ...env };
  for (const name of HOST_VARIABLES) delete copy[name];
  return copy;
}

export function claudeVersion(bin = "claude") {
  const result = spawnSync(bin, ["--version"], { env: cleanEnv(), encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function userMessage(text) {
  return `${JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text }] },
  })}\n`;
}

// Sends `turns` (strings) one after another and resolves with
// { replies: string[], costUsd, sessionId }.
export function runConversation({ bin = "claude", args, turns, cwd, timeoutMs = 180_000 }) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        ...args,
      ],
      { cwd, env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] },
    );

    const replies = [];
    let costUsd = 0;
    let sessionId = null;
    let buffer = "";
    let stderr = "";
    let settled = false;
    let timer = null;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdin.end();
      if (error) {
        child.kill("SIGTERM");
        reject(error);
      } else {
        resolve({ replies, costUsd, sessionId });
      }
    };

    const armTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => finish(new Error(`Turn ${replies.length + 1} timed out after ${timeoutMs} ms`)),
        timeoutMs,
      );
    };

    const sendNext = () => {
      if (replies.length === turns.length) return finish();
      armTimer();
      child.stdin.write(userMessage(turns[replies.length]));
    };

    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.session_id) sessionId = event.session_id;
        if (event.type !== "result") continue;
        if (event.is_error || (event.subtype && event.subtype !== "success")) {
          return finish(new Error(`claude returned ${event.subtype ?? "an error"}: ${event.result ?? ""}`));
        }
        replies.push(typeof event.result === "string" ? event.result : "");
        costUsd += Number(event.total_cost_usd ?? 0);
        sendNext();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (!settled) {
        finish(new Error(`claude exited with code ${code} after ${replies.length} replies. ${stderr.trim()}`));
      }
    });

    sendNext();
  });
}

// Single prompt, returns the final text.
export function runPrompt({ bin = "claude", args, prompt, cwd, timeoutMs = 180_000 }) {
  return runConversation({ bin, args, turns: [prompt], cwd, timeoutMs }).then((r) => r.replies[0]);
}
