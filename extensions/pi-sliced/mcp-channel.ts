// Session-only MCP registration and atomic Served-state handoff to the stdio child.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Slice, ServedEntry } from "./slice.ts";
import { licenceLine } from "./surface.ts";

export const MCP_SERVER = "pi_sliced";

function filesUnder(root: string, prefix = ""): string[] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((e) => {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) return filesUnder(root, rel);
    if (e.isFile()) return [rel];
    throw new Error("Slice materialization contains a non-regular file");
  });
}

export function createMcpChannel(pi: ExtensionAPI, slice: Slice, server: string) {
  // Capture each exact materialization once, before agent access. Never advertise later-added files.
  const snapshots = new WeakMap<ServedEntry, object>();
  let signature = "";
  let registered = false;
  let generation = 0;
  function close(): void {
    if (registered) pi.unregisterMcpServer(MCP_SERVER);
    registered = false;
    signature = "";
  }
  return {
    close,
    sync(): void {
      const entries = slice.entries();
      const next = JSON.stringify(entries.map((e) => [e.id, e.root]));
      if (next === signature) return;
      const dir = slice.sessionDir();
      if (!dir) { close(); return; }
      const statePath = join(dir, ".mcp-state.json");
      const state = entries.map((e) => {
        let snapshot = snapshots.get(e);
        if (!snapshot) {
          snapshot = { ...e, licenceLine: licenceLine(e, server), files: filesUnder(e.root) };
          snapshots.set(e, snapshot);
        }
        return snapshot;
      });
      writeFileSync(`${statePath}.next`, JSON.stringify({ entries: state }), { mode: 0o600 });
      renameSync(`${statePath}.next`, statePath);
      if (!entries.length) { close(); signature = next; return; }
      // Changing configuration makes Pi reconnect and refresh its tool list. Old children also read
      // the latest atomic state, so withdrawn loads fail even while the reconnect is in progress.
      pi.registerMcpServer(MCP_SERVER, {
        command: process.execPath,
        args: [fileURLToPath(new URL("./mcp-server.mjs", import.meta.url)), statePath],
        env: { PI_SLICED_MCP_GENERATION: String(++generation) },
        exposure: "codemode",
        description: "Read-only skills the user served for this session. Search for the task and load the matching skill instructions.",
      });
      registered = true;
      signature = next;
    },
  };
}
