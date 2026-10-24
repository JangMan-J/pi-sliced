// Triage depth for one Candidate (rulings c2 E2), from its Classification and the dated popularity fact.
// Flagged (purpose-vs-action review under ruling c3 by antigravity/gemini-4-argon or
// meta/muse-wonder-full-1.0): any of sends-credentials, agent-override-text,
// persistent-writes, opaque-code, or unpinned-code from a pipe to an interpreter, a pip install from a URL,
// or go @latest. The one exception stays at static depth: only sends-credentials, or sends-credentials plus
// plain-runner unpinned-code, with a popularity fact in the top decile of Candidates that have one. The
// popularity band is recorded in triage as the reason for the depth, never in a Determination's reason.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Classification } from "../classify/classify.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const STRONG_UNPINNED = /^(?:pipe to interpreter|pip install from URL|go @latest)\b/;

interface Popularity {
  installs: number;
  asOf: string | null;
}
let cache: { by: Map<string, Popularity>; topDecile: number } | null = null;
function popularity() {
  if (!cache) {
    const by = new Map<string, Popularity>();
    for (const l of readFileSync(join(ROOT, "catalogue/facts/popularity.jsonl"), "utf8").split("\n")) {
      if (!l.trim()) continue;
      const p = JSON.parse(l);
      by.set(p.id, { installs: p.installs, asOf: p.asOf });
    }
    const sorted = [...by.values()].map((p) => p.installs).sort((a, b) => a - b);
    cache = { by, topDecile: sorted[Math.floor(sorted.length * 0.9)] ?? Infinity };
  }
  return cache;
}

export interface Triage {
  depth: "static" | "purpose-action";
  flags: string[]; // the hits that flag it
  depthNote?: string; // the popularity band, when it set the depth
  queue: number; // purpose-action order: lower first (obscure first)
}

export function triage(c: Classification): Triage {
  const markers = new Map((c.markers ?? []).map((m) => [m.marker, m.because]));
  const flags: string[] = [];
  for (const m of ["sends-credentials", "agent-override-text", "persistent-writes", "opaque-code"]) if (markers.has(m as never)) flags.push(m);
  const strong = (markers.get("unpinned-code" as never) ?? []).filter((b) => STRONG_UNPINNED.test(b));
  if (strong.length) flags.push("unpinned-code (fetch and run)");
  const pop = popularity();
  const p = pop.by.get(c.candidate);
  const queue = p ? p.installs : -1;
  if (!flags.length) return { depth: "static", flags, queue };
  if (flags.length === 1 && flags[0] === "sends-credentials" && p && p.installs >= pop.topDecile)
    return {
      depth: "static",
      flags,
      depthNote: `popularity band: top decile of Candidates with a dated install count (skills.sh, as of ${p.asOf ?? "unknown"}); ruling c2 E2`,
      queue,
    };
  return { depth: "purpose-action", flags, queue };
}
