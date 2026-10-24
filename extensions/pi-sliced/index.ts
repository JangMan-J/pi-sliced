// pi-sliced: serve skills the user picks, for this session only.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type AuthorClient, createAuthorClient, DEFAULT_CATALOGUE, DEFAULT_SERVER, readPinnedCert } from "./author-client.ts";
import { registerCheckDriver } from "./check-driver.ts";
import { registerPicker } from "./picker-wiring.ts";
import { createSkillsShClient, DEFAULT_GATEWAY } from "./skills-sh.ts";
import { createSlice, sweepDeadSessions } from "./slice.ts";
import { SECTION, sectionText, TOOL, TOOL_DESCRIPTION, toolText } from "./surface.ts";
import type { CatalogueApi } from "./types.ts";

export default function piSliced(pi: ExtensionAPI): void {
  const env = process.env;
  let author: AuthorClient | undefined;
  const client = (): AuthorClient =>
    (author ??= createAuthorClient({
      server: env.PI_SLICED_SERVER || DEFAULT_SERVER,
      catalogueName: env.PI_SLICED_CATALOGUE || DEFAULT_CATALOGUE,
      ca: readPinnedCert(),
    }));
  const catalogue: CatalogueApi = {
    catalogue: () => client().catalogue(),
    detail: (id, revision) => client().detail(id, revision),
  };
  const skillsSh = createSkillsShClient({ url: env.PI_SLICED_GATEWAY_URL || DEFAULT_GATEWAY });

  let live = false;
  /** The tool is active exactly while the Slice is non-empty; every other tool is left as it is. */
  const syncTools = (): void => {
    if (!live) return;
    const active = pi.getActiveTools();
    const want = slice.entries().length > 0;
    if (want && !active.includes(TOOL)) pi.setActiveTools([...active, TOOL]);
    if (!want && active.includes(TOOL)) pi.setActiveTools(active.filter((n) => n !== TOOL));
  };
  const slice = createSlice({
    blob: (sha) => client().blob(sha),
    snapshot: (item) => skillsSh.snapshot(item),
    onChange: syncTools,
  });

  pi.registerTool({
    name: TOOL,
    label: "Served skill",
    description: TOOL_DESCRIPTION,
    parameters: Type.Object({ name: Type.String({ description: "Skill name" }) }),
    defaultActive: false,
    annotations: { readOnlyHint: true, openWorldHint: false },
    async execute(_id, params) {
      return { content: [{ type: "text", text: toolText(slice.entries(), params.name) }], details: undefined };
    },
  });

  pi.on("before_agent_start", (event) => {
    syncTools();
    const text = sectionText(slice.entries());
    if (text) event.systemPromptOptions.sections[SECTION] = text;
    else delete event.systemPromptOptions.sections[SECTION];
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
    live = true;
    sweepDeadSessions();
    process.on("exit", onExit);
    if (ctx.mode !== "tui") process.on("SIGINT", onSigint);
  });
  pi.on("session_shutdown", () => {
    live = false;
    process.off("exit", onExit);
    process.off("SIGINT", onSigint);
    slice.cleanup();
    author?.close();
  });

  registerPicker(pi, { catalogue, skillsSh, slice });
  if (env.PI_SLICED_CHECK_DRIVER === "1") registerCheckDriver(pi, { catalogue, skillsSh, slice });
}
