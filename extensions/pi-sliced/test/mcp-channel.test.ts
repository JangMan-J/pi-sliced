import { test } from "node:test";
import assert from "node:assert/strict";
import fs, { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { CONFIG_DIR_NAME, getAgentDir } from "@earendil-works/pi-coding-agent";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configuredMcpNames, createMcpChannel } from "../mcp-channel.ts";
import { createSlice } from "../slice.ts";
import piSliced from "../index.ts";

test("MCP is the only channel; it registers no native tools and does not alter prompt sections directly", () => {
  const tools: any[] = [], commands: string[] = [], handlers = new Map<string, Function>();
  const pi: any = {
    registerTool: (tool: any) => tools.push(tool),
    registerCommand: (name: string) => commands.push(name),
    on: (name: string, handler: Function) => handlers.set(name, handler),
  };
  piSliced(pi);
  assert.deepEqual(tools.map((t) => t.name), []);
  assert.ok(commands.includes("slices"), "Picker registration");
  const event = { systemPromptOptions: { sections: { unrelated: "preserved" } } };
  handlers.get("before_agent_start")!(event);
  assert.deepEqual(event.systemPromptOptions.sections, { unrelated: "preserved" });
  handlers.get("session_shutdown")!();
});

test("session reservations read user config and only trusted project config", (t) => {
  const originalRead = fs.readFileSync;
  const reads: string[] = [];
  t.mock.method(fs, "readFileSync", (path: any, ...args: any[]) => {
    if (String(path).endsWith("/mcp.json")) { reads.push(String(path)); return "{}"; }
    return (originalRead as any)(path, ...args);
  });
  syncBuiltinESMExports();
  try {
    for (const trusted of [false, true]) {
      reads.length = 0;
      const handlers = new Map<string, Function>();
      piSliced({ registerCommand: () => {}, on: (name: string, fn: Function) => handlers.set(name, fn) } as any);
      try {
        handlers.get("session_start")!({}, { mode: "tui", cwd: "/home/u/project", isProjectTrusted: () => trusted });
        assert.deepEqual(reads, [join(getAgentDir(), "mcp.json"), ...(trusted ? [join("/home/u/project", CONFIG_DIR_NAME, "mcp.json")] : [])]);
      } finally { handlers.get("session_shutdown")!(); }
    }
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

for (const collision of ["configured", "extension"] as const) {
  for (const occupiedName of ["pi_sliced", "pi-sliced"]) {
    test(`${collision} collision ${occupiedName} preserves other servers and uses a free name`, async () => {
      const tmp = mkdtempSync(join(tmpdir(), "mcp-collision-test-"));
      const configPath = join(tmp, "mcp.json");
      const original = JSON.stringify({ mcpServers: { [occupiedName]: { command: "untouched", enabled: false }, "pi-sliced-2": { command: "untouched" } } });
      writeFileSync(configPath, original);
      const other = { name: occupiedName, config: { command: "untouched" } };
      const registrations: string[] = [], removed: string[] = [];
      const pi: any = {
        getMcpServers: () => collision === "extension" ? [other, { name: "pi-sliced-2" }] : [],
        registerMcpServer: (name: string) => {
          assert.notEqual(name.replaceAll("-", "_"), occupiedName.replaceAll("-", "_"));
          registrations.push(name);
        },
        unregisterMcpServer: (name: string) => removed.push(name),
      };
      let channel: ReturnType<typeof createMcpChannel>;
      const slice = createSlice({ tmpdir: tmp, blob: async () => Buffer.alloc(0), snapshot: async () => ({ id: "o/r/test", files: [{ path: "SKILL.md", contents: "body" }] }), onChange: () => channel.sync() });
      channel = createMcpChannel(pi, slice, "https://example.test");
      if (collision === "configured") channel.reserveConfig([configPath]);
      try {
        await slice.serveUntraced({ id: "o/r/test", name: "test", source: "o/r" });
        assert.deepEqual(registrations, ["pi_sliced_3"]);
        channel.sync();
        assert.equal(registrations.length, 1);
        slice.unserve("o/r/test");
        assert.deepEqual(removed, ["pi_sliced_3"]);
        assert.equal(readFileSync(configPath, "utf8"), original);
        assert.deepEqual(other.config, { command: "untouched" });
      } finally { channel.close(); slice.cleanup(); rmSync(tmp, { recursive: true, force: true }); }
    });
  }
}

test("configured names are read without evaluating credentials; malformed reservations fail closed", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "mcp-config-test-"));
  const path = join(tmp, "mcp.json");
  let channel: ReturnType<typeof createMcpChannel>;
  const slice = createSlice({ tmpdir: tmp, blob: async () => Buffer.alloc(0), snapshot: async () => ({ id: "o/r/test", files: [{ path: "SKILL.md", contents: "body" }] }), onChange: () => channel.sync() });
  channel = createMcpChannel({ getMcpServers: () => [], registerMcpServer: () => assert.fail("must not register") } as any, slice, "https://example.test");
  try {
    assert.deepEqual(configuredMcpNames([path]), []);
    writeFileSync(path, '\uFEFF{"mcpServers":{"pi-sliced":{"env":{"TOKEN":"!false"}}}}');
    assert.deepEqual(configuredMcpNames([path]), ["pi-sliced"]);
    writeFileSync(path, "{");
    channel.reserveConfig([path]);
    await assert.rejects(slice.serveUntraced({ id: "o/r/test", name: "test", source: "o/r" }));
    assert.deepEqual(slice.entries(), []);
  } finally { channel.close(); slice.cleanup(); rmSync(tmp, { recursive: true, force: true }); }
});

for (const firstServe of [true, false]) test(`registration throw rolls back ${firstServe ? "first" : "additional"} serve and refreshes child state`, async () => {
  const tmp = mkdtempSync(join(tmpdir(), "mcp-rollback-test-"));
  let fail = false, statePath = "", rejectedRoot = "";
  let channel: ReturnType<typeof createMcpChannel>;
  const slice = createSlice({ tmpdir: tmp, blob: async () => Buffer.alloc(0), snapshot: async () => ({ id: "", files: [{ path: "SKILL.md", contents: "body" }] }), onChange: () => channel.sync() });
  const pi: any = {
    getMcpServers: () => [], unregisterMcpServer: () => {},
    registerMcpServer: (_name: string, config: any) => {
      statePath = config.args[1];
      if (fail) {
        rejectedRoot ||= slice.entries().at(-1)!.root;
        throw new Error("registration rejected");
      }
    },
  };
  channel = createMcpChannel(pi, slice, "https://example.test");
  try {
    if (!firstServe) await slice.serveUntraced({ id: "o/r/kept", name: "kept", source: "o/r" });
    fail = true;
    await assert.rejects(slice.serveUntraced({ id: "o/r/rejected", name: "rejected", source: "o/r" }));
    const expected = firstServe ? [] : ["o/r/kept"];
    assert.deepEqual(slice.entries().map((e) => e.id), expected);
    assert.deepEqual(JSON.parse(readFileSync(statePath, "utf8")).entries.map((e: any) => e.id), expected);
    assert.equal(existsSync(rejectedRoot), false);
    fail = false;
    await slice.serveUntraced({ id: "o/r/rejected", name: "rejected", source: "o/r" });
    assert.deepEqual(slice.entries().map((e) => e.id), [...expected, "o/r/rejected"]);
  } finally { fail = false; channel.close(); slice.cleanup(); rmSync(tmp, { recursive: true, force: true }); }
});

test("MCP registration follows Slice changes, reuses licence headers, and removes session state", async () => {
  const tmp = mkdtempSync(join(tmpdir(), "mcp-channel-test-"));
  const registrations: any[] = [], removed: string[] = [];
  const pi: any = { getMcpServers: () => [], registerMcpServer: (name: string, config: any) => registrations.push({ name, config }), unregisterMcpServer: (name: string) => removed.push(name) };
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
