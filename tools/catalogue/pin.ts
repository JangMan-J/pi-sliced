// Pin one Revision per source repository of the reused Candidate set (proof 9) into `catalogue/sources.jsonl`.
// A source keeps the Revision the archive recorded for it; any other source is pinned at its remote HEAD now.
// A source whose remote no longer answers is recorded as unresolvable, with the error. Existing pins never change.
//   node tools/catalogue/pin.ts
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { remoteUrl } from "../trace/git.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const SOURCES = join(ROOT, "catalogue", "sources.jsonl");
export interface Source {
  source: string;
  revision: string | null;
  pinned: string; // UTC date the pin was taken
  from: "archive" | "remote HEAD" | "site-hosted";
  error?: string;
  head?: string; // for an archive pin: the remote HEAD when pinned, tried when a Candidate is not at the archive Revision
  headPinned?: string;
}

const lines = (p: string) => (existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean) : []);
const have = new Map(lines(SOURCES).map((l) => [JSON.parse(l).source as string, JSON.parse(l) as Source]));
const archive = new Map<string, string>();
const sources = new Set<string>();
const siteHosted = new Set<string>();
for (const l of lines(join(ROOT, "catalogue", "candidates.jsonl"))) {
  const c = JSON.parse(l);
  sources.add(c.source);
  if (c.archive.revision) archive.set(c.source, c.archive.revision);
  if (c.siteHosted) siteHosted.add(c.source);
}
const today = new Date().toISOString().slice(0, 10);

function lsRemote(source: string): Promise<{ sha?: string; error?: string }> {
  return new Promise((resolve) => {
    const p = spawn("git", ["ls-remote", remoteUrl(source), "HEAD"], { env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    let out = "";
    let err = "";
    const t = setTimeout(() => p.kill("SIGKILL"), 60_000);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => {
      clearTimeout(t);
      const sha = out.match(/^([0-9a-f]{40})\s+HEAD$/m)?.[1];
      resolve(sha ? { sha } : { error: (err.trim().split("\n").pop() || `exit ${code}`).slice(0, 200) });
    });
  });
}

const todo = [...sources].filter((s) => !have.has(s)).sort();
let i = 0;
async function worker() {
  while (i < todo.length) {
    const s = todo[i++];
    if (siteHosted.has(s)) {
      have.set(s, { source: s, revision: null, pinned: today, from: "site-hosted", error: "site-hosted skill (well-known); it has no git source, and a Revision is a git commit SHA" });
      continue;
    }
    if (archive.has(s)) {
      have.set(s, { source: s, revision: archive.get(s)!, pinned: today, from: "archive" });
      continue;
    }
    const r = await lsRemote(s);
    have.set(s, r.sha ? { source: s, revision: r.sha, pinned: today, from: "remote HEAD" } : { source: s, revision: null, pinned: today, from: "remote HEAD", error: r.error });
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
// Archive pins also record the remote HEAD once, for Candidates the archive Revision does not hold.
for (const s of have.values()) {
  if (s.from !== "archive" || s.head !== undefined || s.headPinned !== undefined) continue;
  const r = await lsRemote(s.source);
  if (r.sha && r.sha !== s.revision) Object.assign(s, { head: r.sha, headPinned: today });
}
const out = [...have.values()].sort((a, b) => a.source.localeCompare(b.source)).map((s) => JSON.stringify(s));
writeFileSync(SOURCES, out.join("\n") + "\n");
const bad = [...have.values()].filter((s) => !s.revision);
console.log(`${have.size} sources pinned; ${bad.length} unresolvable`);
for (const b of bad) console.log(`  ${b.source}: ${b.error}`);
