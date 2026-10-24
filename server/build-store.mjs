#!/usr/bin/env node
// Write every traced file of every resolved stored Trace (newest trace file per
// Candidate+Revision) into the Author's store as `blobs/<git-blob-sha>`, each
// verified against its SHA and traced size before it is written.
//
//   node server/build-store.mjs [<owner>/<repo>/<name>[@<revision>] ...]
//
// Bytes come from the tracer's blobless clones (~/.cache/pi-sliced/git), which may
// fetch missing blobs from the source's origin; that happens here, never at serve time.
import { existsSync } from "node:fs";
import { blobPath, readCloneBlobs, readTrace, resolvedTraces, storeRoot, verifyBlob, writeAtomic } from "./lib.mjs";

/** Ensure every file of `trace` is in the store. Returns { written, present }. */
export function storeTrace(trace) {
  if (trace.status !== "resolved") throw new Error(`${trace.candidate}@${trace.revision}: status ${trace.status}`);
  const need = trace.files.filter((f) => !existsSync(blobPath(f.blob)));
  const bytes = readCloneBlobs(trace.source, need.map((f) => f.blob));
  for (const f of need) {
    const b = bytes.get(f.blob);
    if (!b) throw new Error(`${trace.candidate}: blob ${f.blob} (${f.path}) not returned by git`);
    verifyBlob(b, f.blob, f.size);
    writeAtomic(blobPath(f.blob), b);
  }
  return { written: new Set(need.map((f) => f.blob)).size, present: trace.files.length - need.length };
}

function selected(args) {
  if (args.length === 0) return resolvedTraces();
  const all = resolvedTraces();
  return args.map((a) => {
    const [candidate, revision] = a.split("@");
    if (revision) return readTrace(candidate, revision);
    const hits = all.filter((t) => t.candidate === candidate);
    if (hits.length !== 1) throw new Error(`${candidate}: ${hits.length} resolved traces; name a revision`);
    return hits[0];
  });
}

if (import.meta.main) {
  const traces = selected(process.argv.slice(2));
  let written = 0;
  let failed = 0;
  for (const t of traces) {
    try {
      const r = storeTrace(t);
      written += r.written;
      console.log(`${t.candidate}@${t.revision.slice(0, 12)}: ${t.files.length} files, ${r.written} written`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${t.candidate}@${t.revision}: ${e.message}`);
    }
  }
  console.log(`store ${storeRoot()}: ${traces.length} traces, ${written} blobs written, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
