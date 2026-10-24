// Validate a determine-1 run's output against its packet and the policy checks, then append one
// Determination per line to the store, authored by the model that wrote it.
//   node tools/determine/apply.ts <packet.md> <output.jsonl> --model <id> [--dry]
// `--model` is required, including for `--dry`. It pins the packet's assigned run model (the id
// without the provider, as the run list gave it); every output line must name it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appendDetermination } from "./store.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const [packetPath, outPath, ...rest] = process.argv.slice(2);
const dry = rest.includes("--dry");
const fail = (m: string): never => {
  console.log(`FAIL ${m}`);
  process.exit(1);
};
const mi = rest.indexOf("--model");
if (mi < 0) fail("missing required --model <id> (the packet's assigned run model, without the provider)");
const wantModel = rest[mi + 1];
if (wantModel === undefined || wantModel.startsWith("--")) fail(`--model needs a value, got ${wantModel ?? "nothing"}`);
// Ruling c3 (Jang via executive, 2026-10-24): runs rotate across muse-wonder-full-1.0, grok-4.7 and
// gemini-4-argon, and each record's author.id names the model that wrote it. No Anthropic run was
// in flight in this pipeline when c3 arrived, so claude-* ids are rejected for new inputs; stored
// records keep their provenance untouched. Never antigravity/claude-*.
const MODELS_C3 = ["muse-wonder-full-1.0", "grok-4.7", "gemini-4-argon"];
if (!MODELS_C3.includes(wantModel)) fail(`--model ${wantModel} is not a determination-run model`);
const occasions = new Map<string, string>();
for (const l of readFileSync(join(ROOT, "catalogue/occasions.tsv"), "utf8").split("\n").slice(1)) {
  const [id, , domain] = l.split("\t");
  if (id) occasions.set(id, domain);
}
const domains = new Set(occasions.values());

// What each packet entry pinned: Trace and Classification by path and sha256, and the triage depth.
const pinned = new Map<string, { trace: { path: string; sha256: string }; classification: { path: string; sha256: string }; depth: string | null; depthNote: string | null; revision: string }>();
let cur: string | null = null;
for (const l of readFileSync(packetPath, "utf8").split("\n")) {
  const h = l.match(/^## ([^\s/]+\/[^\s/]+\/\S+)$/); // a Candidate id: <owner>/<repo>/<name>
  if (h) {
    cur = h[1];
    pinned.set(cur, { trace: { path: "", sha256: "" }, classification: { path: "", sha256: "" }, depth: null, depthNote: null, revision: "" });
    continue;
  }
  if (!cur) continue;
  const p = pinned.get(cur)!;
  let m = l.match(/^- trace: `([^`]+)` sha256 `([0-9a-f]{64})`/);
  if (m) p.trace = { path: m[1], sha256: m[2] };
  m = l.match(/^- classification: `([^`]+)` sha256 `([0-9a-f]{64})`/);
  if (m) p.classification = { path: m[1], sha256: m[2] };
  m = l.match(/^- source: \S+ at ([0-9a-f]{40})/);
  if (m) p.revision = m[1];
  m = l.match(/^- triage depth: (static|purpose-action)/);
  if (m) p.depth = m[1];
  m = l.match(/^- depth note: (.+)$/);
  if (m) p.depthNote = m[1];
}

const FORBIDDEN_SUMMARY = /\b(?:install(?:s|ed|ing)?|download(?:s|ed|ing)?)\b|^use this when/i;
const POPULARITY = /\b(?:popular(?:ity)?|install counts?|star counts?|github stars|trending|widely used|most used)\b|\b\d[\d,.]*\s*k?\s*(?:installs|downloads|stars)\b/i;
const problems: string[] = [];
const lines = readFileSync(outPath, "utf8").split("\n").filter((l) => l.trim());
const seen = new Set<string>();
const records: Parameters<typeof appendDetermination>[1][] = [];
const time = new Date().toISOString().replace(/\.\d+Z$/, "Z");
for (const [k, l] of lines.entries()) {
  let o: { candidate: string; decision: Record<string, any>; reason: string; model: string };
  try {
    o = JSON.parse(l);
  } catch {
    problems.push(`line ${k + 1}: not JSON`);
    continue;
  }
  const p = pinned.get(o.candidate);
  const bad = (m: string) => problems.push(`${o.candidate}: ${m}`);
  if (!p) {
    bad("not in the packet");
    continue;
  }
  if (seen.has(o.candidate)) bad("decided twice");
  seen.add(o.candidate);
  const d = o.decision ?? {};
  if (!["admit", "reject"].includes(d.verdict)) bad(`verdict ${d.verdict}`);
  if (d.verdict === "reject" && !["malicious", "hidden", "unrelated", "broken", "fragment", "duplicate"].includes(d.rejectFor)) bad(`rejectFor ${d.rejectFor}`);
  if (d.verdict === "admit" && d.rejectFor) bad("admit with rejectFor");
  if (d.rejectFor === "duplicate" && !d.duplicateOf) bad("duplicate without duplicateOf");
  if (!["platform", "style"].includes(d.kind)) bad(`kind ${d.kind}`);
  if (!Array.isArray(d.occasions)) bad("occasions not a list");
  for (const oc of d.occasions ?? []) {
    if (!occasions.has(oc.id)) bad(`unknown occasion ${oc.id}`);
    const want = d.kind === "style" ? "alternative" : "pending";
    if (oc.role !== want) bad(`occasion ${oc.id} role ${oc.role}, want ${want} for a ${d.kind} skill`);
  }
  if ((d.occasions ?? []).length === 0 && d.verdict === "admit" && !domains.has(d.domain)) bad(`no occasion and domain ${d.domain} is not a map domain`);
  if (typeof d.everyday !== "boolean") bad("everyday not boolean");
  if (!["deep", "adequate", "thin"].includes(d.proficiency?.level) || !d.proficiency?.note) bad("proficiency");
  if (typeof d.summary !== "string" || !d.summary.trim() || d.summary.length > 120) bad(`summary length ${d.summary?.length}`);
  if (FORBIDDEN_SUMMARY.test(d.summary ?? "")) bad(`summary wording: ${d.summary}`);
  if (d.triage?.depth !== p.depth) bad(`triage depth ${d.triage?.depth}, packet ${p.depth}`);
  if ((p.depthNote ?? null) !== (d.triage?.depthNote ?? null)) bad("triage depthNote does not match the packet");
  if (!Array.isArray(d.triage?.addressed)) bad("triage.addressed not a list");
  if (!o.reason?.trim()) bad("no reason");
  if (POPULARITY.test(o.reason ?? "")) bad(`reason mentions popularity: ${o.reason}`);
  if (!MODELS_C3.includes(o.model ?? "")) bad(`model ${o.model} is not a determination-run model`);
  else if (o.model !== wantModel) bad(`model ${o.model}, packet assigned ${wantModel}`);
  records.push({ candidate: o.candidate, revision: p.revision, trace: p.trace, classification: p.classification, decision: d, reason: o.reason, time, author: { kind: "model", id: o.model } });
}
for (const id of pinned.keys()) if (!seen.has(id)) problems.push(`${id}: no decision`);
if (problems.length) {
  for (const p of problems) console.log(`FAIL ${p}`);
  process.exit(1);
}
if (!dry) for (const r of records) appendDetermination(ROOT, r);
console.log(`${records.length} Determination(s) ${dry ? "valid (dry run)" : "appended"}: ${records.filter((r) => r.decision.verdict === "admit").length} admit, ${records.filter((r) => r.decision.verdict === "reject").length} reject`);
