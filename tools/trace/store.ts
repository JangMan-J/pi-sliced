// Trace storage: one file per Candidate, Revision, tracer version, and judge
// version, committed in the repository. A Trace is never overwritten: writing
// the same bytes again is a no-op, and writing different bytes is an error.
//
// Stored format `pi-sliced.trace/2` (docs/contracts/trace.md): compact, evidence by reference.
// Every place a fact was seen is `[fileIndex, line]`, an index into the sorted `files` list;
// the line's text is recoverable from the file's blob at the Revision. One array element per line.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Trace } from "./trace.ts";

export function tracePath(root: string, t: Pick<Trace, "candidate" | "revision" | "tracer" | "judge">): string {
  return join(root, "traces", t.candidate, t.revision, `${t.tracer}+${t.judge}.json`);
}

/** The stored form of a Trace. */
export function storedForm(t: Trace): Record<string, unknown> {
  const index = new Map(t.files.map((f, i) => [f.path, i]));
  const at = (from: string, line: number): [number, number] => {
    const i = index.get(from);
    if (i === undefined) throw new Error(`${t.candidate}: evidence from ${from}, which is not a traced file`);
    return [i, line];
  };
  const uniq = (xs: [number, number][]) =>
    xs.filter((x, k) => xs.findIndex((y) => y[0] === x[0] && y[1] === x[1]) === k).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const named = new Map<string, { name: string; path: string; at: [number, number][] }>();
  for (const n of t.namedSkills) {
    const k = `${n.name}\0${n.path}`;
    const cur = named.get(k) ?? { name: n.name, path: n.path, at: [] };
    cur.at.push(at(n.from, n.line));
    named.set(k, cur);
  }
  return {
    format: t.format,
    tracer: t.tracer,
    judge: t.judge,
    candidate: t.candidate,
    source: t.source,
    revision: t.revision,
    skillPath: t.skillPath,
    status: t.status,
    ...(t.reason ? { reason: t.reason } : {}),
    totals: t.totals,
    files: t.files.map((f) => ({
      path: f.path,
      size: f.size,
      blob: f.blob,
      how: f.via.how,
      ...(f.via.from !== undefined ? { from: index.get(f.via.from)!, line: f.via.line } : {}),
      ...(f.via.judgement ? { judged: f.via.judgement } : {}),
    })),
    outside: t.outside.map((o) => ({ kind: o.kind, name: o.name, at: uniq(o.evidence.map((e) => at(e.from, e.line))) })),
    regions: t.regions,
    signals: t.signals.map((s) => ({ kind: s.kind, detail: s.detail, at: uniq(s.at.map(([f, l]) => at(f, l))) })),
    namedSkills: [...named.values()].map((n) => ({ ...n, at: uniq(n.at) })).sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)),
    checkoutReach: t.checkoutReach.map((c) => ({ at: at(c.from, c.line), ref: c.ref, target: c.target, package: c.package, files: c.files, bytes: c.bytes })),
    licence: t.licence,
  };
}

/** JSON with one array element per line: compact, and a change shows as a line diff. */
export function serialize(t: Trace): string {
  const o = storedForm(t);
  const parts = Object.entries(o).map(([k, v]) => {
    if (Array.isArray(v)) return v.length ? `${JSON.stringify(k)}:[\n${v.map((x) => JSON.stringify(x)).join(",\n")}\n]` : `${JSON.stringify(k)}:[]`;
    return `${JSON.stringify(k)}:${JSON.stringify(v)}`;
  });
  return `{\n${parts.join(",\n")}\n}\n`;
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
