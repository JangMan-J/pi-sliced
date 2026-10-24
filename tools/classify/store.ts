// Where Traces, Classifications, and Determinations live, and which stored Trace is current.
// A Candidate at a Revision may hold several Traces (one per tracer and judge version); the current
// one is the highest tracer version, then the highest judge version. Only current Traces of
// format pi-sliced.trace/2 are classified.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CLASSIFIER } from "./classify.ts";

export const ROOT = join(import.meta.dirname, "..", "..");

export interface TraceRef {
  candidate: string;
  revision: string;
  file: string; // repo-relative path of the Trace
  tracer: string;
  judge: string;
}

const NAME = /^(trace-(\d+))\+(judge-(\d+))\.json$/;

/** Every stored Trace under traces/ (judgement stores excluded), current ones first per Candidate and Revision. */
export function storedTraces(root = ROOT): TraceRef[] {
  const out: TraceRef[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (relative(root, p) !== "traces/judgements") walk(p);
      } else if (NAME.test(e.name)) {
        const rel = relative(join(root, "traces"), dir).split("/");
        const revision = rel.pop()!;
        out.push({ candidate: rel.join("/"), revision, file: relative(root, p), tracer: e.name.match(NAME)![1], judge: e.name.match(NAME)![3] });
      }
    }
  };
  if (existsSync(join(root, "traces"))) walk(join(root, "traces"));
  return out;
}

const num = (s: string) => Number(s.split("-")[1]);

/** The current Trace for each Candidate and Revision. */
export function currentTraces(root = ROOT): TraceRef[] {
  const best = new Map<string, TraceRef>();
  for (const t of storedTraces(root)) {
    const k = `${t.candidate}@${t.revision}`;
    const b = best.get(k);
    if (!b || num(t.tracer) > num(b.tracer) || (num(t.tracer) === num(b.tracer) && num(t.judge) > num(b.judge))) best.set(k, t);
  }
  return [...best.values()].sort((a, b) => a.candidate.localeCompare(b.candidate) || a.revision.localeCompare(b.revision));
}

export function classificationPath(t: TraceRef): string {
  return join("classifications", t.candidate, t.revision, `${t.tracer}+${t.judge}+${CLASSIFIER}.json`);
}

/** Every committed Classification file (repo-relative). */
export function storedClassifications(root = ROOT): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".json") && e.name.includes("+classify-")) out.push(relative(root, p));
    }
  };
  if (existsSync(join(root, "classifications"))) walk(join(root, "classifications"));
  return out.sort();
}

export function read(root: string, rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

export function isFile(p: string): boolean {
  return existsSync(p) && statSync(p).isFile();
}
