// Proof 2: re-derive every Classification from the stored Traces, offline.
//
//   node tools/classify/rederive.ts           check: rebuild in memory, compare byte for byte with the
//                                             committed files, list Determinations whose inputs changed
//   node tools/classify/rederive.ts --write   write the Classifications and the companion index
//
// Reads only files in this repository (traces/, classifications/, determinations/): no git, no network,
// no model. Exits 0 when every Classification and the companion index are byte-identical.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { classify, serializeClassification, sha256, type StoredTrace } from "./classify.ts";
import { companionIndex, serializeIndex } from "./companions.ts";
import { ROOT, classificationPath, currentTraces, storedClassifications, storedTraces } from "./store.ts";
import { inForce, readDeterminations } from "../determine/store.ts";

const write = process.argv.includes("--write");
const root = process.env.PI_SLICED_ROOT ?? ROOT;
const problems: string[] = [];
const expected = new Set<string>();
const traces: StoredTrace[] = [];
const current = new Map<string, { trace: { path: string; sha256: string }; classification: { path: string; sha256: string } }>();
let same = 0;
let written = 0;

// Every stored Trace of format pi-sliced.trace/2 has a Classification (older formats are history).
const isCurrent = new Set(currentTraces(root).map((t) => t.file));
for (const t of storedTraces(root)) {
  const bytes = readFileSync(join(root, t.file), "utf8");
  const parsed = JSON.parse(bytes) as StoredTrace;
  if (parsed.format !== "pi-sliced.trace/2") continue;
  const rel = classificationPath(t);
  expected.add(rel);
  const body = serializeClassification(classify(bytes, t.file));
  if (isCurrent.has(t.file)) {
    traces.push(parsed);
    current.set(t.candidate, { trace: { path: t.file, sha256: sha256(bytes) }, classification: { path: rel, sha256: sha256(body) } });
  }
  const p = join(root, rel);
  const have = existsSync(p) ? readFileSync(p, "utf8") : null;
  if (have === body) same++;
  else if (write) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
    written++;
  } else problems.push(have === null ? `missing ${rel}` : `differs ${rel}`);
}
for (const rel of storedClassifications(root)) if (!expected.has(rel)) problems.push(`no stored Trace for ${rel}`);

const indexRel = join("classifications", "companions.json");
const index = serializeIndex(companionIndex(traces));
const haveIndex = existsSync(join(root, indexRel)) ? readFileSync(join(root, indexRel), "utf8") : null;
if (haveIndex !== index) {
  if (write) writeFileSync(join(root, indexRel), index);
  else problems.push(haveIndex === null ? `missing ${indexRel}` : `differs ${indexRel}`);
}

// Determinations are replayed, never regenerated: flag each whose Trace or Classification changed.
const changed: string[] = [];
let determinations = 0;
for (const [candidate, recs] of readDeterminations(root)) {
  const d = inForce(recs);
  if (!d) continue;
  determinations++;
  const now = current.get(candidate);
  if (!now) changed.push(`${candidate}: no current classified Trace (read ${d.trace.path})`);
  else {
    if (now.trace.sha256 !== d.trace.sha256) changed.push(`${candidate}: Trace changed (read ${d.trace.path}, now ${now.trace.path})`);
    if (now.classification.sha256 !== d.classification.sha256) changed.push(`${candidate}: Classification changed (read ${d.classification.path} ${d.classification.sha256.slice(0, 12)}, now ${now.classification.sha256.slice(0, 12)})`);
  }
}

for (const p of problems) console.log(`FAIL ${p}`);
console.log(`Classifications: ${same} byte-identical${write ? `, ${written} written` : ""}, ${problems.length} problem(s), from ${expected.size} stored Trace(s), ${current.size} current`);
console.log(`Determinations in force: ${determinations}; inputs changed: ${changed.length}`);
for (const c of changed) console.log(`  CHANGED ${c}`);
console.log(problems.length ? "FAIL rederive" : "PASS rederive: every Classification re-derives byte-identical from the stored Traces");
process.exit(problems.length ? 1 : 0);
