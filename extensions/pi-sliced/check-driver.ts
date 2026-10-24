// Check seam for scripts/check-*: present only when PI_SLICED_CHECK_DRIVER=1.
// Every result is one JSON notify, so it reaches `pi --mode rpc` clients as an extension_ui_request.

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SkillsShClient } from "./skills-sh.ts";
import type { Slice } from "./slice.ts";
import type { CatalogueApi, UntracedItem } from "./types.ts";

export interface CheckDeps {
  catalogue: CatalogueApi;
  skillsSh: SkillsShClient;
  slice: Slice;
}

function say(ctx: ExtensionCommandContext, value: Record<string, unknown>, type: "info" | "error" = "info"): void {
  ctx.ui.notify(JSON.stringify(value), type);
}

export function registerCheckDriver(pi: ExtensionAPI, deps: CheckDeps): void {
  /** Skills.sh results held as the Picker holds them: in memory, for this session only. */
  let untraced: UntracedItem[] = [];

  pi.registerCommand("pi-sliced-check-serve", {
    description: "check seam: serve <id[@revision]>... from the configured catalogue",
    handler: async (args, ctx) => {
      for (const arg of args.split(/\s+/).filter(Boolean)) {
        const at = arg.lastIndexOf("@");
        const id = at > 0 ? arg.slice(0, at) : arg;
        try {
          const listing = (await deps.catalogue.catalogue()).skills.find((s) => s.id === id);
          if (!listing) throw new Error(`${id} is not in the catalogue`);
          const detail = await deps.catalogue.detail(id, at > 0 ? arg.slice(at + 1) : listing.revision);
          say(ctx, {
            check: "footprint",
            id,
            revision: detail.revision,
            footprint: detail.footprint,
            heavy: detail.heavy,
            markers: detail.markers,
          });
          say(ctx, { check: "served", ...(await deps.slice.serveCatalogue(detail)) });
        } catch (e) {
          say(ctx, { check: "error", id, message: (e as Error).message }, "error");
        }
      }
    },
  });

  pi.registerCommand("pi-sliced-check-untraced", {
    description: "check seam: Skills.sh search <query> [--serve <id>]",
    handler: async (args, ctx) => {
      const m = /^(.*?)(?:\s+--serve\s+(\S+))?\s*$/.exec(" " + args.trim())!;
      const query = m[1].trim();
      try {
        if (query) {
          untraced = await deps.skillsSh.search(query);
          say(ctx, { check: "untraced", query, items: untraced });
        }
        if (m[2]) {
          const item = untraced.find((i) => i.id === m[2]);
          if (!item) throw new Error(`${m[2]} is not among the Skills.sh results`);
          say(ctx, { check: "served", ...(await deps.slice.serveUntraced(item)) });
        }
      } catch (e) {
        say(ctx, { check: "error", query, message: (e as Error).message }, "error");
      }
    },
  });

  pi.registerCommand("pi-sliced-check-state", {
    description: "check seam: print the Slice and session dir",
    handler: async (_args, ctx) => {
      say(ctx, {
        check: "state",
        sessionDir: deps.slice.sessionDir() ?? null,
        slice: deps.slice.entries().map((e) => ({ ...e })),
        untraced: untraced.length,
        activeTools: pi.getActiveTools(),
      });
    },
  });
}
