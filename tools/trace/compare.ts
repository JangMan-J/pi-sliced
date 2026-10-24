// Compare a Trace with an expected set: the file paths and the (kind, name)
// pairs of the Outside requirements must be equal, in both directions.
import type { Trace } from "./trace.ts";

export interface Expected {
  candidate: string;
  source?: string;
  revision: string;
  skillPath: string;
  files: { path: string; size?: number; blob?: string }[];
  outside: { kind: string; name: string }[];
}

export interface Diff {
  missingFiles: string[]; // expected, not traced
  extraFiles: string[]; // traced, not expected
  missingOutside: string[];
  extraOutside: string[];
  metadata: string[]; // size or blob disagreements on shared files
}

export function sourceOf(e: Expected): string {
  return e.source ?? e.candidate.split("/").slice(0, 2).join("/");
}

export function compare(t: Trace, e: Expected): Diff {
  const tf = new Map(t.files.map((f) => [f.path, f]));
  const ef = new Map(e.files.map((f) => [f.path, f]));
  const key = (o: { kind: string; name: string }) => `${o.kind}:${o.name}`;
  const to = new Set(t.outside.map(key));
  const eo = new Set(e.outside.map(key));
  const metadata: string[] = [];
  for (const [p, f] of ef) {
    const g = tf.get(p);
    if (!g) continue;
    if (f.size !== undefined && f.size !== g.size) metadata.push(`${p}: size ${g.size}, expected ${f.size}`);
    if (f.blob !== undefined && f.blob !== g.blob) metadata.push(`${p}: blob ${g.blob}, expected ${f.blob}`);
  }
  return {
    missingFiles: [...ef.keys()].filter((p) => !tf.has(p)).sort(),
    extraFiles: [...tf.keys()].filter((p) => !ef.has(p)).sort(),
    missingOutside: [...eo].filter((k) => !to.has(k)).sort(),
    extraOutside: [...to].filter((k) => !eo.has(k)).sort(),
    metadata,
  };
}

export function isEmpty(d: Diff): boolean {
  return !d.missingFiles.length && !d.extraFiles.length && !d.missingOutside.length && !d.extraOutside.length && !d.metadata.length;
}
