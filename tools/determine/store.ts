// The Determination store: append-only records, one JSON line each, in determinations/<candidate>.jsonl.
// A Determination is never edited or regenerated in place; a new decision is a new record, which may name
// the record it supersedes. Each record pins the exact Trace and Classification it read by path and sha256.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { createHash } from "node:crypto";

export const FORMAT = "pi-sliced.determination/1";

export interface Determination {
  format: string;
  id: string; // sha256 of the record without `id`, in this key order
  candidate: string;
  revision: string;
  trace: { path: string; sha256: string };
  classification: { path: string; sha256: string };
  decision: Record<string, unknown>;
  reason: string;
  time: string; // ISO 8601 UTC
  author: { kind: "model" | "human"; id: string };
  supersedes?: string; // id of an earlier Determination of the same Candidate
}

const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export function determinationPath(candidate: string): string {
  return join("determinations", `${candidate}.jsonl`);
}

/** Append one Determination after checking that the Trace and Classification it read exist with those bytes. */
export function appendDetermination(root: string, d: Omit<Determination, "format" | "id">): Determination {
  for (const [what, ref] of [["Trace", d.trace], ["Classification", d.classification]] as const) {
    const p = join(root, ref.path);
    if (!existsSync(p)) throw new Error(`${d.candidate}: the ${what} it read, ${ref.path}, is not stored`);
    if (sha(readFileSync(p)) !== ref.sha256) throw new Error(`${d.candidate}: ${ref.path} does not have sha256 ${ref.sha256}`);
  }
  if (!d.reason.trim()) throw new Error(`${d.candidate}: a Determination needs a reason`);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(d.time)) throw new Error(`${d.candidate}: time must be ISO 8601 UTC`);
  if (!d.author?.id || !["model", "human"].includes(d.author.kind)) throw new Error(`${d.candidate}: author needs kind model|human and an id`);
  const body = { format: FORMAT, candidate: d.candidate, revision: d.revision, trace: d.trace, classification: d.classification, decision: d.decision, reason: d.reason, time: d.time, author: d.author, ...(d.supersedes ? { supersedes: d.supersedes } : {}) };
  const rec: Determination = { format: FORMAT, id: sha(JSON.stringify(body)), ...body } as Determination;
  const file = join(root, determinationPath(d.candidate));
  const prior = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Determination) : [];
  if (prior.some((p) => p.id === rec.id)) return rec; // the same record twice is a no-op
  if (d.supersedes && !prior.some((p) => p.id === d.supersedes)) throw new Error(`${d.candidate}: supersedes ${d.supersedes}, which is not one of its records`);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(rec) + "\n");
  return rec;
}

/** Every Determination, per Candidate in append order. */
export function readDeterminations(root: string): Map<string, Determination[]> {
  const out = new Map<string, Determination[]>();
  const base = join(root, "determinations");
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jsonl")) {
        const recs = readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Determination);
        for (const r of recs) {
          const { id, ...rest } = r;
          const { format, ...fields } = rest as Determination;
          const body = { format, ...fields };
          if (sha(JSON.stringify(body)) !== id) throw new Error(`${relative(root, p)}: record ${id} does not hash to its id (edited?)`);
        }
        out.set(relative(base, p).replace(/\.jsonl$/, ""), recs);
      }
    }
  };
  if (existsSync(base)) walk(base);
  return out;
}

/** The record in force: the last record that no later record supersedes. */
export function inForce(recs: Determination[]): Determination | null {
  const superseded = new Set(recs.map((r) => r.supersedes).filter(Boolean));
  for (let i = recs.length - 1; i >= 0; i--) if (!superseded.has(recs[i].id)) return recs[i];
  return null;
}
