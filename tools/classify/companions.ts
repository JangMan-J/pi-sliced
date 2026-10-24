// The companion index: reverse edges between skills, derived from every current classified Trace.
// A Classification describes one skill from its own Trace; which other skills name it or pull it in
// needs every Trace, so it lives here, rebuilt by rederive like the Classifications.
import type { StoredTrace } from "./classify.ts";

export interface CompanionEntry {
  folder: string; // <owner>/<repo>:<skill folder path>
  candidate: string | null; // the Candidate whose own folder this is, when one is traced
  namedBy: string[]; // Candidates whose pulled-in files name it by bare name
  pulledBy: string[]; // Candidates that pull in files of it
}

export function companionIndex(traces: StoredTrace[]): CompanionEntry[] {
  const map = new Map<string, CompanionEntry>();
  const get = (folder: string) => {
    let e = map.get(folder);
    if (!e) map.set(folder, (e = { folder, candidate: null, namedBy: [], pulledBy: [] }));
    return e;
  };
  for (const t of traces) {
    if (t.status !== "resolved") continue;
    const own = get(`${t.source}:${t.skillPath}`);
    own.candidate = own.candidate === null || t.candidate < own.candidate ? t.candidate : own.candidate;
    for (const n of t.namedSkills) get(`${t.source}:${n.path}`).namedBy.push(t.candidate);
    for (const r of t.regions) if (r.kind === "skill") get(`${t.source}:${r.path}`).pulledBy.push(t.candidate);
  }
  return [...map.values()]
    .filter((e) => e.namedBy.length || e.pulledBy.length)
    .map((e) => ({ ...e, namedBy: [...new Set(e.namedBy)].sort(), pulledBy: [...new Set(e.pulledBy)].sort() }))
    .sort((a, b) => a.folder.localeCompare(b.folder));
}

export function serializeIndex(entries: CompanionEntry[]): string {
  return `{"format":"pi-sliced.companions/1","entries":[\n${entries.map((e) => JSON.stringify(e)).join(",\n")}\n]}\n`;
}
