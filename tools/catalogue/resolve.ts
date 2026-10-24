// Resolve each reused Candidate (proof 9) to its skill folder at its source's pinned Revision, into
// `catalogue/resolved.jsonl`. The rule, in order:
//   1. the folder the archive recorded, when it still holds a SKILL.md;
//   2. the one skill folder whose directory name is the Candidate's name;
//   3. the one skill folder whose SKILL.md frontmatter `name:` is the Candidate's name;
//   4. among several folders that match by directory name, the ones whose frontmatter name also matches,
//      then the shallowest path, then the first in path order. The others are recorded as alternatives.
// A source pinned at the archive's Revision is tried again at the remote HEAD recorded with the pin when the
// Candidate is not at the archive Revision (skills.sh listed it after the archive pinned the source).
// A Candidate that matches nothing, or whose source is unresolvable, is recorded as unresolvable with the reason.
//   node tools/catalogue/resolve.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { openRepo, readBlobs, type Repo } from "../trace/git.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const jsonl = (p: string) => readFileSync(join(ROOT, p), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const sources = new Map<string, { revision: string | null; error?: string; head?: string }>(jsonl("catalogue/sources.jsonl").map((s) => [s.source, s]));
const candidates = jsonl("catalogue/candidates.jsonl") as { id: string; source: string; name: string; archive: { skillPath?: string } }[];

export interface Resolved {
  id: string;
  source: string;
  revision: string | null;
  skillPath: string | null;
  by?: "archive" | "folder name" | "frontmatter name" | "folder name, first of several";
  alternatives?: string[];
  reason?: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function frontmatterName(text: string): string | null {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  const n = m?.[1].match(/^name:\s*["']?([^"'\n]+?)["']?\s*$/m);
  return n ? n[1].trim() : null;
}

const repos = new Map<string, { repo: Repo; folders: string[]; names: Map<string, string | null> }>();
function repoOf(source: string, revision: string) {
  const key = `${source}@${revision}`;
  let r = repos.get(key);
  if (!r) {
    const repo = openRepo(source, revision);
    const folders = [...repo.tree.keys()].filter((p) => p === "SKILL.md" || p.endsWith("/SKILL.md")).map((p) => posix.dirname(p)).sort();
    r = { repo, folders, names: new Map() };
    repos.set(key, r);
  }
  return r;
}

type Match = Omit<Resolved, "id" | "source" | "revision">;
function match(r: ReturnType<typeof repoOf>, c: (typeof candidates)[number], useHint: boolean): Match | null {
  const hint = c.archive.skillPath;
  if (useHint && hint && r.folders.includes(hint)) return { skillPath: hint, by: "archive" };
  const want = norm(c.name);
  const byDir = r.folders.filter((f) => norm(posix.basename(f === "." ? c.source.split("/")[1] : f)) === want);
  if (byDir.length === 1) return { skillPath: byDir[0], by: "folder name" };
  if (byDir.length > 1) {
    const n = names(r, byDir);
    const ranked = [...byDir].sort(
      (a, b) =>
        Number(norm(n.get(b) ?? "") === want) - Number(norm(n.get(a) ?? "") === want) || a.split("/").length - b.split("/").length || a.localeCompare(b),
    );
    return { skillPath: ranked[0], by: "folder name, first of several", alternatives: ranked.slice(1) };
  }
  const n = names(r, r.folders);
  const byName = r.folders.filter((f) => norm(n.get(f) ?? "") === want);
  if (byName.length >= 1) {
    const ranked = [...byName].sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
    return { skillPath: ranked[0], by: "frontmatter name", ...(ranked.length > 1 ? { alternatives: ranked.slice(1) } : {}) };
  }
  return null;
}

function names(r: ReturnType<typeof repoOf>, folders: string[]): Map<string, string | null> {
  const want = folders.filter((f) => !r.names.has(f));
  if (want.length) {
    const blobs = readBlobs(r.repo, want.map((f) => r.repo.tree.get(f === "." ? "SKILL.md" : `${f}/SKILL.md`)!.blob));
    for (const f of want) r.names.set(f, frontmatterName(blobs.get(r.repo.tree.get(f === "." ? "SKILL.md" : `${f}/SKILL.md`)!.blob)!.toString("utf8")));
  }
  return r.names;
}

const out: Resolved[] = [];
for (const c of candidates) {
  const s = sources.get(c.source)!;
  if (!s.revision) {
    out.push({ id: c.id, source: c.source, revision: null, skillPath: null, reason: `source does not resolve: ${s.error}` });
    continue;
  }
  const base = { id: c.id, source: c.source, revision: s.revision };
  let r: ReturnType<typeof repoOf>;
  try {
    r = repoOf(c.source, s.revision);
  } catch (e) {
    out.push({ ...base, skillPath: null, reason: `revision does not resolve: ${String((e as Error).message).slice(0, 200)}` });
    continue;
  }
  const m = match(r, c, true);
  if (m) {
    out.push({ ...base, ...m });
    continue;
  }
  if (s.head) {
    const h = match(repoOf(c.source, s.head), c, false);
    if (h) {
      out.push({ ...base, revision: s.head, ...h });
      continue;
    }
  }
  const hint = c.archive.skillPath;
  out.push({ ...base, skillPath: null, reason: `no skill folder named ${c.name} at ${s.revision}${s.head ? ` or at the remote HEAD ${s.head}` : ""}${hint ? ` (the archive had ${hint})` : ""}` });
}
writeFileSync(join(ROOT, "catalogue", "resolved.jsonl"), out.map((o) => JSON.stringify(o)).join("\n") + "\n");
const count = (f: (o: Resolved) => boolean) => out.filter(f).length;
console.log(`${out.length} Candidates: ${count((o) => !!o.skillPath)} resolved, ${count((o) => !o.skillPath)} unresolvable`);
for (const by of ["archive", "folder name", "frontmatter name", "folder name, first of several"]) console.log(`  by ${by}: ${count((o) => o.by === by)}`);
