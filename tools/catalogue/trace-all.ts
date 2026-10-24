// Trace the Candidates of catalogue/resolved.jsonl (proof 9) and store every Trace that is settled:
// resolved, or unresolvable with its reason. A Trace still waiting on judgements is not stored; its
// questions are written out for a judge round instead.
//
//   node tools/catalogue/trace-all.ts [--shard k/n] [--only <id substring>] [--ids <file>] [--questions <out.jsonl>]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { trace, TRACER, FORMAT, type Trace } from "../trace/trace.ts";
import { JudgementStore, JUDGE, type Question } from "../trace/judge.ts";
import { writeTrace, tracePath } from "../trace/store.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const [k, n] = (opt("--shard") ?? "0/1").split("/").map(Number);
const only = opt("--only");
const idsFile = opt("--ids");
const qOut = opt("--questions") ?? join(ROOT, ".pad/catalogue/questions", `${TRACER}+${JUDGE}`, `shard-${k}-of-${n}.jsonl`);
const ids = idsFile ? new Set(readFileSync(idsFile, "utf8").split("\n").filter(Boolean)) : null;

interface Resolved {
  id: string;
  source: string;
  revision: string | null;
  skillPath: string | null;
  reason?: string;
}
const all = readFileSync(join(ROOT, "catalogue/resolved.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Resolved);
// Shard by source so that one process keeps one repository's tree and blobs warm.
const sources = [...new Set(all.map((c) => c.source))].sort();
const mine = new Set(sources.filter((_, i) => i % n === k));
const todo = all.filter((c) => mine.has(c.source) && (!only || c.id.includes(only)) && (!ids || ids.has(c.id)));

const store = new JudgementStore(ROOT);
const questions = new Map<string, Question>();
const stats = { stored: 0, unchanged: 0, unresolvable: 0, pending: 0, failed: 0 };
mkdirSync(dirname(qOut), { recursive: true });
const t0 = Date.now();

function unresolvable(c: Resolved): Trace {
  return {
    format: FORMAT,
    tracer: TRACER,
    judge: JUDGE,
    candidate: c.id,
    source: c.source,
    revision: c.revision ?? "none",
    skillPath: c.skillPath ?? "",
    status: "unresolvable",
    reason: c.reason ?? "unresolvable",
    files: [],
    outside: [],
    totals: { files: 0, bytes: 0 },
    namedSkills: [],
    checkoutReach: [],
    licence: null,
    signals: [],
    regions: [],
    pending: [],
  };
}

for (const c of todo) {
  try {
    const t = c.skillPath && c.revision ? trace({ candidate: c.id, source: c.source, revision: c.revision, skillPath: c.skillPath }, store) : unresolvable(c);
    if (t.status === "pending") {
      stats.pending++;
      for (const id of t.pending) questions.set(id, store.pending.get(id)!);
      continue;
    }
    if (t.status === "unresolvable") stats.unresolvable++;
    if (writeTrace(ROOT, t) === "written") stats.stored++;
    else stats.unchanged++;
  } catch (e) {
    stats.failed++;
    appendFileSync(join(dirname(qOut), `failures-${k}-of-${n}.log`), `${c.id}\t${String((e as Error).message).slice(0, 500)}\n`);
  }
}
writeFileSync(qOut, [...questions.values()].map((q) => JSON.stringify(q)).join("\n") + (questions.size ? "\n" : ""));
console.log(
  `shard ${k}/${n}: ${todo.length} Candidates in ${((Date.now() - t0) / 1000).toFixed(0)} s: ${stats.stored} stored, ${stats.unchanged} unchanged, ` +
    `${stats.unresolvable} unresolvable, ${stats.pending} pending (${questions.size} questions), ${stats.failed} failed`,
);
void existsSync;
void tracePath;
