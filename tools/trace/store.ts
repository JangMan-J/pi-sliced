// Trace storage: one file per Candidate, Revision, tracer version, and judge
// version, committed in the repository. A Trace is never overwritten: writing
// the same bytes again is a no-op, and writing different bytes is an error.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Trace } from "./trace.ts";

export function tracePath(root: string, t: Pick<Trace, "candidate" | "revision" | "tracer" | "judge">): string {
  return join(root, "traces", t.candidate, t.revision, `${t.tracer}+${t.judge}.json`);
}

export function serialize(t: Trace): string {
  return JSON.stringify(t, null, 2) + "\n";
}

export type WriteResult = "written" | "unchanged";

export function writeTrace(root: string, t: Trace): WriteResult {
  if (t.status === "pending") throw new Error(`${t.candidate}: ${t.pending.length} judgement(s) pending; a pending Trace is not stored`);
  const p = tracePath(root, t);
  const body = serialize(t);
  if (existsSync(p)) {
    if (readFileSync(p, "utf8") === body) return "unchanged";
    throw new Error(`${p} exists with different content; a Trace is never overwritten (bump the tracer or judge version)`);
  }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, { flag: "wx" });
  return "written";
}

export function readTrace(root: string, t: Pick<Trace, "candidate" | "revision" | "tracer" | "judge">): string | null {
  const p = tracePath(root, t);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}
