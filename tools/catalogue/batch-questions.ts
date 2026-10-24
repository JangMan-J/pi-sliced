// Split a round of pending judge questions into batches for the judge version that asks each class
// (panel judge-7: judge-10 for outside-skill-folders, judge-11 for skill-folder-only; prose-directory retains judge-8).
//   node tools/catalogue/batch-questions.ts <round> <questions.jsonl ...> [--size-10 100] [--size-11 10] [--size-8 100]
// Writes .pad/catalogue/judge/<round>/<judge>-<NNN>.q.jsonl and prints the batch list.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { JudgementStore, type Question } from "../trace/judge.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const args = process.argv.slice(2);
const opt = (k: string, d: number) => {
  const i = args.indexOf(k);
  if (i < 0) return d;
  const v = Number(args[i + 1]);
  args.splice(i, 2);
  return v;
};
const size: Record<string, number> = { "judge-8": opt("--size-8", 100), "judge-10": opt("--size-10", 100), "judge-11": opt("--size-11", 10) };
for (const [judge, n] of Object.entries(size)) {
  if (!Number.isSafeInteger(n) || n < 1 || (judge === "judge-11" && n > 10)) {
    throw new Error(`invalid batch size for ${judge}: ${n} (judge-11 maximum: 10)`);
  }
}
const [round, ...files] = args;
const store = new JudgementStore(ROOT);
const byJudge = new Map<string, Map<string, Question>>();
for (const f of files) {
  for (const l of readFileSync(f, "utf8").split("\n")) {
    if (!l.trim()) continue;
    const q = JSON.parse(l) as Question;
    if (store.decide(q) !== undefined) continue; // answered since the round was traced
    const j = store.asks(q.class);
    if (!byJudge.has(j)) byJudge.set(j, new Map());
    byJudge.get(j)!.set(q.id, q);
  }
}
const dir = join(ROOT, ".pad/catalogue/judge", round);
mkdirSync(dir, { recursive: true });
const list: string[] = [];
for (const [j, qs] of [...byJudge].sort()) {
  const sorted = [...qs.values()].sort((a, b) => a.source.localeCompare(b.source) || a.file.localeCompare(b.file) || a.line - b.line);
  const n = Math.ceil(sorted.length / size[j]);
  const per = Math.ceil(sorted.length / n);
  for (let k = 0; k < n; k++) {
    const p = join(dir, `${j}-${String(k).padStart(3, "0")}.q.jsonl`);
    writeFileSync(p, sorted.slice(k * per, (k + 1) * per).map((q) => JSON.stringify(q)).join("\n") + "\n");
    list.push(p);
  }
  console.log(`${j}: ${sorted.length} questions in ${n} batches of about ${per}`);
}
writeFileSync(join(dir, "batches.txt"), list.join("\n") + "\n");
