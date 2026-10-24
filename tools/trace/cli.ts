// Command line for the tracer.
//
//   node tools/trace/cli.ts questions [--out FILE] [CANDIDATE...]  write unanswered judgement questions (JSON lines)
//   node tools/trace/cli.ts import QUESTIONS ANSWERS               append judge answers to traces/judgements/
//   node tools/trace/cli.ts record [CANDIDATE...]                  write Traces to traces/ (never overwrites)
//   node tools/trace/cli.ts check                                  proof 1: compare with the confirmed fixtures
//
// Candidates come from tests/trace/cases.json; CANDIDATE filters by substring.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JUDGE, JudgementStore, type Answer, type Question } from "./judge.ts";
import { trace, gitBlobSha, type CandidateInput } from "./trace.ts";
import { readTrace, serialize, writeTrace } from "./store.ts";
import { compare, isEmpty, type Expected } from "./compare.ts";
import { openRepo, readBlobs } from "./git.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// The nine Candidates proof 1 names (KERNEL.md).
export const PROOF_1 = [
  "openai/plugins/debug-zoom-integration",
  "openai/plugins/game-ui-frontend",
  "heygen-com/hyperframes/hyperframes-core",
  "figma/mcp-server-guide/figma-generate-diagram",
  "shopify/shopify-ai-toolkit/shopify",
  "anthropics/skills/canvas-design",
  "nvidia/skills/amc-run-video-calibration",
  "shadcn-ui/ui/shadcn",
  "mattpocock/skills/tdd",
];

function cases(filter: string[]): CandidateInput[] {
  const all = JSON.parse(readFileSync(join(ROOT, "tests/trace/cases.json"), "utf8")) as CandidateInput[];
  return filter.length ? all.filter((c) => filter.some((f) => c.candidate.includes(f))) : all;
}

export function fixturePath(candidate: string): string {
  return join(ROOT, "tests/trace/fixtures", `${candidate.replaceAll("/", "__")}.json`);
}

function questions(args: string[]): number {
  let out = join(ROOT, ".pad/trace/judge/questions.jsonl");
  const i = args.indexOf("--out");
  if (i >= 0) {
    out = args[i + 1];
    args.splice(i, 2);
  }
  const store = new JudgementStore(ROOT);
  const all: Question[] = [];
  for (const c of cases(args)) {
    const t = trace(c, store);
    const qs = t.pending.map((id) => store.pending.get(id)!);
    console.log(`${c.candidate}: ${t.files.length} files, ${qs.length} pending question(s)`);
    for (const q of qs) if (!all.some((x) => x.id === q.id)) all.push(q);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, all.map((q) => JSON.stringify(q)).join("\n") + (all.length ? "\n" : ""));
  console.log(`${all.length} question(s) -> ${out}`);
  return 0;
}

function readJsonl<T>(p: string): T[] {
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
}

function importAnswers(args: string[]): number {
  const [qPath, aPath] = args;
  const qs = new Map(readJsonl<Question>(qPath).map((q) => [q.id, q]));
  const answers = readJsonl<Answer>(aPath);
  const missing = [...qs.keys()].filter((id) => !answers.some((a) => a.id === id));
  if (missing.length) console.error(`warning: ${missing.length} question(s) have no answer`);
  const store = new JudgementStore(ROOT, JUDGE);
  const bySource = new Map<string, Answer[]>();
  for (const a of answers) {
    const q = qs.get(a.id);
    if (!q) throw new Error(`answer ${a.id} matches no question in ${qPath}`);
    const k = `${q.source}@${q.revision}`;
    bySource.set(k, [...(bySource.get(k) ?? []), a]);
  }
  let n = 0;
  for (const [k, list] of bySource) {
    const [source, revision] = k.split("@");
    n += store.append(source, revision, qs, list);
  }
  console.log(`appended ${n} answer(s) under traces/judgements/${JUDGE}/`);
  return 0;
}

function record(args: string[]): number {
  const store = new JudgementStore(ROOT);
  let status = 0;
  for (const c of cases(args)) {
    const t = trace(c, store);
    if (t.status === "pending") {
      console.error(`${c.candidate}: ${t.pending.length} judgement(s) pending; run questions, judge, import`);
      status = 1;
      continue;
    }
    console.log(`${c.candidate}: ${writeTrace(ROOT, t)} (${t.files.length} files, ${t.totals.bytes} bytes, ${t.outside.length} outside)`);
  }
  return status;
}

function check(): number {
  const store = new JudgementStore(ROOT);
  const list = cases([]);
  let status = 0;
  const fail = (msg: string) => {
    console.log(`FAIL ${msg}`);
    status = 1;
  };
  for (const id of PROOF_1) if (!list.some((c) => c.candidate === id)) fail(`${id}: not in tests/trace/cases.json`);
  for (const c of list.filter((c) => PROOF_1.includes(c.candidate))) {
    const fx = fixturePath(c.candidate);
    if (!existsSync(fx)) {
      fail(`${c.candidate}: no confirmed fixture at ${fx.slice(ROOT.length + 1)}`);
      continue;
    }
    const e = JSON.parse(readFileSync(fx, "utf8")) as Expected;
    if (e.revision !== c.revision || e.skillPath !== c.skillPath) {
      fail(`${c.candidate}: fixture is for ${e.revision}:${e.skillPath}, case is ${c.revision}:${c.skillPath}`);
      continue;
    }
    const t = trace(c, store);
    if (t.status !== "resolved") {
      fail(`${c.candidate}: trace ${t.status}${t.pending.length ? ` (${t.pending.length} judgement(s) missing)` : ""}`);
      continue;
    }
    const d = compare(t, e);
    if (!isEmpty(d)) {
      for (const p of d.missingFiles) fail(`${c.candidate}: missing file ${p}`);
      for (const p of d.extraFiles) fail(`${c.candidate}: extra file ${p}`);
      for (const k of d.missingOutside) fail(`${c.candidate}: missing outside ${k}`);
      for (const k of d.extraOutside) fail(`${c.candidate}: extra outside ${k}`);
      for (const m of d.metadata) fail(`${c.candidate}: ${m}`);
      continue;
    }
    // Every traced file's bytes must hash to its git blob SHA at the Revision.
    const repo = openRepo(c.source, c.revision);
    const bytes = readBlobs(repo, t.files.map((f) => f.blob));
    const bad = t.files.filter((f) => f.blob !== repo.tree.get(f.path)?.blob || gitBlobSha(bytes.get(f.blob)!) !== f.blob);
    if (bad.length) {
      for (const f of bad) fail(`${c.candidate}: blob mismatch ${f.path}`);
      continue;
    }
    const stored = readTrace(ROOT, t);
    if (stored === null) {
      fail(`${c.candidate}: no stored Trace for ${t.tracer}+${t.judge} (run record)`);
      continue;
    }
    if (stored !== serialize(t)) {
      fail(`${c.candidate}: stored Trace differs from a fresh trace`);
      continue;
    }
    console.log(`PASS ${c.candidate}: ${t.files.length} files, ${t.totals.bytes} bytes, ${t.outside.length} outside requirements, blobs verified`);
  }
  console.log(status === 0 ? `PASS trace: ${PROOF_1.length} Candidates match their confirmed fixtures` : "FAIL trace");
  return status;
}

const [cmd, ...rest] = process.argv.slice(2);
const run: Record<string, (a: string[]) => number> = { questions, import: importAnswers, record, check: () => check() };
if (!run[cmd]) {
  console.error("usage: cli.ts questions|import|record|check …");
  process.exit(2);
}
process.exit(run[cmd](rest));
