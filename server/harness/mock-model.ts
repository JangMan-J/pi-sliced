// Mock model: enough of the Anthropic Messages API (streaming SSE) for Pi's `anthropic-messages` api.
// Records every request body verbatim (the wire payload Pi serialized) and replies from a script.
import { appendFileSync } from "node:fs";
import { createServer, type Server } from "node:http";

export interface ToolUse {
  name: string;
  input: Record<string, unknown>;
}
/** One scripted model reply: text, tool calls, or both. */
export interface Turn {
  text?: string;
  tools?: ToolUse[];
}
export interface Recorded {
  seq: number;
  method: string;
  path: string;
  /** The request body exactly as received. */
  body: string;
}

export interface MockModel {
  port: number;
  /** Requests recorded so far (also appended to the JSONL log). */
  requests: Recorded[];
  /** Queue scripted replies; each model request takes the next one, then plain "ok". */
  script(turns: Turn[]): void;
  close(): Promise<void>;
}

export async function startMockModel(logPath: string): Promise<MockModel> {
  const requests: Recorded[] = [];
  const queue: Turn[] = [];
  let toolSeq = 0;
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const rec: Recorded = { seq: requests.length, method: req.method ?? "", path: req.url ?? "", body };
      requests.push(rec);
      appendFileSync(logPath, `${JSON.stringify(rec)}\n`);
      if (req.method !== "POST" || !(req.url ?? "").includes("/messages")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "mock: not found" } }));
        return;
      }
      const turn = queue.shift() ?? { text: "ok" };
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
      const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send("message_start", {
        type: "message_start",
        message: {
          id: `msg_mock_${rec.seq}`,
          type: "message",
          role: "assistant",
          model: "mock",
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: body.length, output_tokens: 0 },
        },
      });
      let index = 0;
      if (turn.text !== undefined) {
        send("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } });
        send("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: turn.text } });
        send("content_block_stop", { type: "content_block_stop", index });
        index++;
      }
      for (const t of turn.tools ?? []) {
        const id = `toolu_mock_${toolSeq++}`;
        send("content_block_start", {
          type: "content_block_start",
          index,
          content_block: { type: "tool_use", id, name: t.name, input: {} },
        });
        send("content_block_delta", {
          type: "content_block_delta",
          index,
          delta: { type: "input_json_delta", partial_json: JSON.stringify(t.input) },
        });
        send("content_block_stop", { type: "content_block_stop", index });
        index++;
      }
      send("message_delta", {
        type: "message_delta",
        delta: { stop_reason: turn.tools?.length ? "tool_use" : "end_turn", stop_sequence: null },
        usage: { output_tokens: 1 },
      });
      send("message_stop", { type: "message_stop" });
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("mock model: no port");
  return {
    port: addr.port,
    requests,
    script(turns) {
      queue.push(...turns);
    },
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
