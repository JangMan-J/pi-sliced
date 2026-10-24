import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMcpChannel } from "../mcp-channel.ts";
import { createSlice } from "../slice.ts";
import piSliced from "../index.ts";

test("native channel remains the default; MCP does not register native tools or alter prompt sections", () => {
  const previous = process.env.PI_SLICED_CHANNEL;
  try {
    for (const channel of [undefined, "tool", "mcp"]) {
      if (channel === undefined) delete process.env.PI_SLICED_CHANNEL;
      else process.env.PI_SLICED_CHANNEL = channel;
      const tools: any[] = [], commands: string[] = [], handlers = new Map<string, Function>();
      const pi: any = {
        registerTool: (tool: any) => tools.push(tool),
        registerCommand: (name: string) => commands.push(name),
        on: (name: string, handler: Function) => handlers.set(name, handler),
      };
      piSliced(pi);
      assert.deepEqual(tools.map((t) => t.name), channel === "mcp" ? [] : ["served_skill"]);
      assert.ok(commands.includes("slices"), "same Picker registration in both channels");
      const event = { systemPromptOptions: { sections: { unrelated: "preserved" } } };
      handlers.get("before_agent_start")!(event);
      assert.deepEqual(event.systemPromptOptions.sections, { unrelated: "preserved" });
      handlers.get("session_shutdown")!();
    }
    process.env.PI_SLICED_CHANNEL = "invalid";
    assert.throws(() => piSliced({} as any), /must be tool or mcp/);
  } finally {
    if (previous === undefined) delete process.env.PI_SLICED_CHANNEL;
    else process.env.PI_SLICED_CHANNEL = previous;
  }
});

test("MCP registration follows Slice changes, reuses licence headers, and removes session state", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "mcp-channel-test-"));
  const registrations: any[] = [], removed: string[] = [];
  const pi: any = { registerMcpServer: (name: string, config: any) => registrations.push({ name, config }), unregisterMcpServer: (name: string) => removed.push(name) };
  let channel: ReturnType<typeof createMcpChannel>;
  const slice = createSlice({ tmpdir: tmp, blob: async () => { throw new Error("unexpected fetch"); }, snapshot: async () => ({ files: [{ path: "SKILL.md", contents: "---\nname: test\ndescription: exact description\n---\nbody" }] }) as any, onChange: () => channel.sync() });
  channel = createMcpChannel(pi, slice, "https://example.test");
  try {
    channel.sync();
    assert.equal(registrations.length, 0);
    await slice.serveUntraced({ id: "o/r/test", name: "test", source: "o/r" });
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].name, "pi_sliced");
    assert.equal(registrations[0].config.exposure, "codemode");
    const statePath = registrations[0].config.args[1];
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    assert.equal(state.entries[0].licenceLine, "Licence: unknown (Untraced).");
    assert.deepEqual(state.entries[0].files, ["SKILL.md"]);
    channel.sync();
    assert.equal(registrations.length, 1, "unchanged prompts do not reconnect");
    writeFileSync(join(slice.entries()[0].root, "not-traced.txt"), "not served");
    await slice.serveUntraced({ id: "o/r/second", name: "second", source: "o/r" });
    assert.equal(registrations.length, 2);
    assert.notDeepEqual(registrations[0].config.env, registrations[1].config.env);
    assert.deepEqual(JSON.parse(readFileSync(statePath, "utf8")).entries[0].files, ["SKILL.md"]);
    slice.unserve("o/r/test");
    assert.equal(JSON.parse(readFileSync(statePath, "utf8")).entries.length, 1);
    slice.unserve("o/r/second");
    assert.deepEqual(JSON.parse(readFileSync(statePath, "utf8")).entries, []);
    assert.deepEqual(removed, ["pi_sliced"]);
    channel.close();
    slice.cleanup();
    assert.equal(existsSync(statePath), false);
    assert.deepEqual(removed, ["pi_sliced"]);
  } finally { channel.close(); slice.cleanup(); rmSync(tmp, { recursive: true, force: true }); }
});
