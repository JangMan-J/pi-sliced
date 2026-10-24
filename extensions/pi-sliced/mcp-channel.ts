// Session-only MCP registration and atomic Served-state handoff to the stdio child.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { licenceUrl } from "./author-client.ts";
import type { Slice, ServedEntry } from "./slice.ts";

export const MCP_SERVER = "pi_sliced";
const namespace = (name: string): string => name.replace(/-/g, "_");

const oneLine = (s: string, max = 200): string => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * The licence line of a load header. Kept out of the prompt before discovery, so a Served skill the
 * agent has not loaded costs nothing for it (proof 7). The URL is `<server><route>`: the only
 * Author's server URL the agent ever sees.
 */
export function licenceLine(entry: ServedEntry, server: string): string {
  if (entry.kind === "untraced") return "Licence: unknown (Untraced).";
  const ref = entry.licence;
  if (!ref) return "Licence: none was found in its source.";
  const url = licenceUrl(server, ref.route);
  const parts = [oneLine(ref.spdx ?? "unrecognised licence"), ref.copyright ? oneLine(ref.copyright) : undefined];
  return `Licence: ${parts.filter(Boolean).join("; ")}.${url ? ` Full text: ${url}` : ""}`;
}

// Reserve even disabled/invalid entries conservatively; retain only names, never evaluate credentials.
// Pi exposes only extension registrations, not effective configured servers. SDK-injected custom
// MCP configurations are unsupported here: their collisions cannot be checked through public APIs.
export function configuredMcpNames(paths: string[]): string[] {
  return paths.flatMap((path) => {
    let text: string;
    try { text = readFileSync(path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
        (parsed.mcpServers !== undefined && (!parsed.mcpServers || typeof parsed.mcpServers !== "object" || Array.isArray(parsed.mcpServers)))) {
      throw new Error("Cannot reserve MCP names: invalid mcp.json shape");
    }
    return Object.keys(parsed.mcpServers ?? {});
  });
}

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
  let serverName = MCP_SERVER;
  let reserved: string[] = [];
  let reservationError: unknown;
  let generation = 0;
  function close(): void {
    if (registered) pi.unregisterMcpServer(serverName);
    registered = false;
    signature = "";
  }
  return {
    close,
    reserveConfig(paths: string[]): void {
      // Keep the session-start names even if the files are later edited: Pi reloads separately.
      try { reserved = configuredMcpNames(paths); reservationError = undefined; }
      catch (error) { reservationError = error; }
    },
    sync(): void {
      const entries = slice.entries();
      const next = JSON.stringify(entries.map((e) => [e.id, e.root]));
      if (next === signature) return;
      if (entries.length && reservationError) throw reservationError;
      if (entries.length && !registered) {
        const occupied = new Set([...reserved, ...pi.getMcpServers().map((s) => s.name)].map(namespace));
        serverName = MCP_SERVER;
        for (let n = 2; occupied.has(namespace(serverName)); n++) serverName = `${MCP_SERVER}_${n}`;
      }
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
      // Force rollback to rewrite state even when it restores the previous Slice signature.
      signature = "";
      writeFileSync(`${statePath}.next`, JSON.stringify({ entries: state }), { mode: 0o600 });
      renameSync(`${statePath}.next`, statePath);
      if (!entries.length) { close(); signature = next; return; }
      // Changing configuration makes Pi reconnect and refresh its tool list. Old children also read
      // the latest atomic state, so withdrawn loads fail even while the reconnect is in progress.
      pi.registerMcpServer(serverName, {
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
