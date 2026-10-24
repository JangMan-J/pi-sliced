// Build the reading packet a Determination author reads for each Candidate: its current Trace and
// Classification (by path and sha256), the Footprint, markers and security hits, and the content that
// proficiency and the summary need: the SKILL.md body and the key pulled-in files, read by blob from the
// clone cache at the Trace's Revision. No popularity figure is ever put in a packet.
//
//   node tools/determine/dossier.ts --ids <file> --out <packet.md> [--key-bytes 6000]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { openRepo, readBlobs } from "../trace/git.ts";
import { classificationPath, currentTraces, ROOT } from "../classify/store.ts";
import type { Classification, StoredTrace } from "../classify/classify.ts";
import { triage } from "./triage.ts";
import { existsSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const ids = readFileSync(opt("--ids")!, "utf8").split("\n").filter(Boolean);
const keyBytes = Number(opt("--key-bytes", "6000"));
const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");
const current = new Map(currentTraces().map((t) => [t.candidate, t]));
// Purpose-vs-action findings (evidence for the Determination), keyed by Candidate and Trace sha256
// (the Classification is derived from the Trace; its bytes may be re-serialized).
const findings = new Map<string, { concern: string; note: string; hits: { hit: string; explained: boolean; note: string }[]; model: string }>();
const PA = join(ROOT, "catalogue/triage/purpose-action.jsonl");
if (existsSync(PA)) for (const l of readFileSync(PA, "utf8").split("\n")) if (l.trim()) {
  const f = JSON.parse(l);
  findings.set(`${f.candidate}@${f.trace}`, f);
}

const TEXT = /\.(?:md|mdx|txt|rst|ya?ml|json|toml|py|m?js|cjs|ts|sh)$/i;
const out: string[] = [];
for (const id of ids) {
  const ref = current.get(id);
  if (!ref) {
    out.push(`## ${id}\n\nNo current Trace.\n`);
    continue;
  }
  const traceText = readFileSync(join(ROOT, ref.file), "utf8");
  const clsRel = classificationPath(ref);
  const clsText = readFileSync(join(ROOT, clsRel), "utf8");
  const t = JSON.parse(traceText) as StoredTrace;
  const c = JSON.parse(clsText) as Classification;
  const head = [
    `## ${id}`,
    "",
    `- trace: \`${ref.file}\` sha256 \`${sha(traceText)}\``,
    `- classification: \`${clsRel}\` sha256 \`${sha(clsText)}\``,
    `- source: ${t.source} at ${t.revision}, skill folder \`${t.skillPath}\``,
  ];
  if (c.status !== "resolved") {
    out.push([...head, `- status: UNRESOLVABLE: ${c.reason}`, ""].join("\n"));
    continue;
  }
  const fp = c.footprint!;
  head.push(
    `- footprint: ${fp.summary}`,
    `- heavy: ${c.heavy!.heavy ? `yes (${c.heavy!.because.join("; ")})` : "no"}`,
    `- markers: ${c.markers!.length ? c.markers!.map((m) => `${m.marker} [${m.because.slice(0, 3).join("; ")}${m.because.length > 3 ? `; +${m.because.length - 3}` : ""}]`).join(" · ") : "none"}`,
    `- security hits: ${Object.keys(c.security!).length ? Object.entries(c.security!).map(([k, v]) => `${k}: ${v.slice(0, 4).join(" | ")}${v.length > 4 ? ` | +${v.length - 4}` : ""}`).join(" ;; ") : "none"}`,
    `- companions named: ${c.companions!.named.map((n) => n.name).join(", ") || "none"}; pulled skill folders: ${c.companions!.pulled.map((p) => p.path).join(", ") || "none"}`,
    ...(() => {
      const tr = triage(c);
      const f = findings.get(`${id}@${sha(traceText)}`);
      return [
        `- triage depth: ${tr.depth}${tr.flags.length ? ` (flagged: ${tr.flags.join(", ")})` : ""}`,
        ...(tr.depthNote ? [`- depth note: ${tr.depthNote}`] : []),
        ...(f ? [`- purpose-vs-action finding (${f.model}): concern ${f.concern}. ${f.note} Hits: ${f.hits.map((h) => `${h.hit}: ${h.explained ? "explained" : "NOT explained"} (${h.note})`).join("; ")}`] : []),
      ];
    })(),
    `- files (${t.files.length}): ${t.files.slice(0, 40).map((f) => `${f.path.startsWith(t.skillPath + "/") ? f.path.slice(t.skillPath.length + 1) : f.path} (${f.size})`).join(", ")}${t.files.length > 40 ? `, … +${t.files.length - 40}` : ""}`,
  );
  // Content: SKILL.md in full (up to 30 KB), then the largest text files of the own folder, then others, up to keyBytes each.
  const repo = openRepo(t.source, t.revision);
  const root = `${t.skillPath}/SKILL.md`;
  const own = t.files.filter((f) => f.path !== root && TEXT.test(f.path) && f.path.startsWith(t.skillPath + "/")).sort((a, b) => b.size - a.size);
  const other = t.files.filter((f) => !f.path.startsWith(t.skillPath + "/") && TEXT.test(f.path)).sort((a, b) => b.size - a.size);
  const keys = [...own.slice(0, 3), ...other.slice(0, 2)];
  const want = [t.files.find((f) => f.path === root)!, ...keys].filter(Boolean);
  const blobs = readBlobs(repo, want.map((f) => f.blob));
  const body = (f: { path: string; blob: string }, max: number) => {
    const s = blobs.get(f.blob)!.toString("utf8");
    return s.length > max ? s.slice(0, max) + `\n[… ${s.length - max} more characters]` : s;
  };
  // The lines behind each security hit (plain package runners left out: they are markers, not flags).
  const hitSigs = t.signals.filter((s) => s.kind !== "fetch-run" || /^(?:pipe to interpreter|pip install from URL|go @latest)/.test(s.detail)).filter((s) => s.kind !== "skill-fetch");
  const hitFiles = [...new Set(hitSigs.flatMap((s) => s.at.slice(0, 3).map(([i]) => t.files[i])))].filter((f) => f && !want.includes(f));
  const hitBlobs = hitFiles.length ? readBlobs(repo, hitFiles.map((f) => f.blob)) : new Map<string, Buffer>();
  const lineOf = (i: number, n: number) => {
    const f = t.files[i];
    const b = blobs.get(f.blob) ?? hitBlobs.get(f.blob);
    if (!b || n < 1) return `${f.path}`;
    return `${f.path}:${n}: ${b.toString("utf8").split("\n")[n - 1]?.trim().slice(0, 300) ?? ""}`;
  };
  const hitLines = hitSigs.map((s) => `- ${s.kind} (${s.detail}):\n${s.at.slice(0, 3).map(([i, n]) => `    - ${lineOf(i, n)}`).join("\n")}`);
  const parts = [...head, ...(hitLines.length ? ["", "### Lines behind the security hits", "", ...hitLines] : []), "", `### SKILL.md`, "", "````", body(want[0], 30000), "````"];
  for (const f of keys) parts.push("", `### ${f.path} (${f.size} bytes)`, "", "````", body(f, keyBytes), "````");
  out.push(parts.join("\n") + "\n");
}
writeFileSync(opt("--out")!, out.join("\n"));
console.log(`${ids.length} dossier(s) -> ${opt("--out")}`);
