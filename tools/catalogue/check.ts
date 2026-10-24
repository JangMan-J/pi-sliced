// Proof 9: every Candidate in the reused set (the archive's 10,001 skills; and every later Candidate in
// catalogue/candidates.jsonl) has a current Trace, which records it as unresolvable when its source no longer
// resolves, and a Determination in force; and every Catalogue skill (admitted by its Determination in force)
// has a Classification with a Footprint. Reads only this repository.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classificationPath, currentTraces, ROOT } from "../classify/store.ts";
import { inForce, readDeterminations } from "../determine/store.ts";

const root = process.env.PI_SLICED_ROOT ?? ROOT;
const candidates = readFileSync(join(root, "catalogue/candidates.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { id: string; intake?: string });
const traces = new Map<string, ReturnType<typeof currentTraces>[number]>();
for (const t of currentTraces(root)) traces.set(t.candidate, t);
const dets = readDeterminations(root);
const problems: string[] = [];
let admitted = 0;
let rejected = 0;
let unresolvable = 0;
for (const c of candidates) {
  const t = traces.get(c.id);
  if (!t) {
    problems.push(`${c.id}: no Trace`);
    continue;
  }
  const trace = JSON.parse(readFileSync(join(root, t.file), "utf8"));
  if (trace.status === "unresolvable") unresolvable++;
  const recs = dets.get(c.id);
  const d = recs ? inForce(recs) : null;
  if (!d) {
    problems.push(`${c.id}: no Determination`);
    continue;
  }
  if (d.decision.verdict === "admit") {
    admitted++;
    const cls = join(root, classificationPath(t));
    if (!existsSync(cls)) problems.push(`${c.id}: admitted without a Classification`);
    else if (!JSON.parse(readFileSync(cls, "utf8")).footprint) problems.push(`${c.id}: admitted without a Footprint`);
  } else rejected++;
}
const reused = candidates.filter((c) => !c.intake).length;
for (const p of problems.slice(0, 50)) console.log(`FAIL ${p}`);
if (problems.length > 50) console.log(`FAIL … ${problems.length - 50} more`);
console.log(
  `${candidates.length} Candidates (${reused} reused): ${traces.size >= candidates.length ? "" : ""}${candidates.length - problems.filter((p) => p.endsWith("no Trace")).length} traced (${unresolvable} unresolvable), ` +
    `${admitted + rejected} determined (${admitted} admitted, ${rejected} rejected), ${problems.length} problem(s)`,
);
console.log(problems.length ? "FAIL catalogue" : "PASS catalogue: every Candidate is traced and determined, and every Catalogue skill has a Classification and a Footprint");
process.exit(problems.length ? 1 : 0);
