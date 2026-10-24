// Ruling c2 E4 (Jang via executive, 2026-10-24): every Candidate whose current Trace is unresolvable is
// rejected as unresolvable, by a human-authored Determination that applies the ruling. This script writes
// one record per such Candidate that has no Determination in force yet; it decides nothing itself.
//   node tools/determine/unresolvable.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { classificationPath, currentTraces, ROOT } from "../classify/store.ts";
import { appendDetermination, inForce, readDeterminations } from "./store.ts";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const have = readDeterminations(ROOT);
const time = new Date().toISOString().replace(/\.\d+Z$/, "Z");
let n = 0;
for (const t of currentTraces()) {
  const traceText = readFileSync(join(ROOT, t.file), "utf8");
  const trace = JSON.parse(traceText);
  if (trace.status !== "unresolvable") continue;
  if (have.get(t.candidate) && inForce(have.get(t.candidate)!)) continue;
  const cls = classificationPath(t);
  appendDetermination(ROOT, {
    candidate: t.candidate,
    revision: t.revision,
    trace: { path: t.file, sha256: sha(traceText) },
    classification: { path: cls, sha256: sha(readFileSync(join(ROOT, cls), "utf8")) },
    decision: {
      verdict: "reject",
      rejectFor: "unresolvable",
      kind: "platform",
      occasions: [],
      everyday: false,
      proficiency: { level: "thin", note: "nothing to read" },
      summary: `${t.candidate} did not resolve`,
      triage: { depth: "static", addressed: [] },
    },
    reason: `Rejected unresolvable under ruling c2 E4: "${trace.reason}"`,
    time,
    author: { kind: "human", id: "Jang (via executive)" },
  });
  n++;
}
console.log(`${n} unresolvable Determination(s) written`);
