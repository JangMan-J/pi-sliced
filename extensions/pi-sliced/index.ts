// pi-sliced: serve skills the user picks, for this session only.

import { CONFIG_DIR_NAME, getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { type AuthorClient, createAuthorClient, DEFAULT_CATALOGUE, DEFAULT_SERVER, readPinnedCert } from "./author-client.ts";
import { registerCheckDriver } from "./check-driver.ts";
import { registerPicker } from "./picker-wiring.ts";
import { createMcpChannel } from "./mcp-channel.ts";
import { createSkillsShClient, DEFAULT_GATEWAY } from "./skills-sh.ts";
import { createSlice, sweepDeadSessions } from "./slice.ts";
import type { CatalogueApi } from "./types.ts";

export default function piSliced(pi: ExtensionAPI): void {
  const env = process.env;
  const server = env.PI_SLICED_SERVER || DEFAULT_SERVER;
  // Catalogue listings, Details and licence texts stay in the client's memory: nothing here writes them.
  let author: AuthorClient | undefined;
  const client = (): AuthorClient =>
    (author ??= createAuthorClient({
      server,
      catalogueName: env.PI_SLICED_CATALOGUE || DEFAULT_CATALOGUE,
      ca: readPinnedCert(),
    }));
  const catalogue: CatalogueApi = {
    catalogue: () => client().catalogue(),
    detail: (id, revision) => client().detail(id, revision),
    licence: (listing) => client().licence(listing),
  };
  const skillsSh = createSkillsShClient({ url: env.PI_SLICED_GATEWAY_URL || DEFAULT_GATEWAY });

  let live = false;
  const syncMcp = (): void => {
    if (!live) return;
    mcp.sync();
  };
  const slice = createSlice({
    blob: (sha) => client().blob(sha),
    snapshot: (item) => skillsSh.snapshot(item),
    onChange: syncMcp,
  });

  const mcp = createMcpChannel(pi, slice, server);

  pi.on("before_agent_start", () => {
    syncMcp();
  });

  const onExit = (): void => slice.cleanup();
  // Outside the TUI, Pi leaves SIGINT to its default (termination), which skips `exit` handlers.
  // Clean up, then re-raise so the signal still ends the process as it would have.
  const onSigint = (): void => {
    slice.cleanup();
    process.off("SIGINT", onSigint);
    process.kill(process.pid, "SIGINT");
  };
  pi.on("session_start", (_event, ctx) => {
    mcp.reserveConfig([
      join(getAgentDir(), "mcp.json"),
      ...(ctx.isProjectTrusted() ? [join(ctx.cwd, CONFIG_DIR_NAME, "mcp.json")] : []),
    ]);
    live = true;
    sweepDeadSessions();
    process.on("exit", onExit);
    if (ctx.mode !== "tui") process.on("SIGINT", onSigint);
  });
  pi.on("session_shutdown", () => {
    live = false;
    process.off("exit", onExit);
    process.off("SIGINT", onSigint);
    mcp.close();
    slice.cleanup();
    author?.close();
  });

  registerPicker(pi, { catalogue, skillsSh, slice });
  if (env.PI_SLICED_CHECK_DRIVER === "1") registerCheckDriver(pi, { catalogue, skillsSh, slice });
}
