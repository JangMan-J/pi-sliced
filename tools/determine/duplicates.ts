// Ruling c2 E3: group resolved Candidates by the blob of their SKILL.md. Within a group, members whose
// whole traced file set matches are exact duplicates (own-folder files compared by path relative to the
// skill folder, every other file by blob alone); members that share SKILL.md but differ elsewhere are
// near-duplicates. Writes the groups and a reading packet per batch of groups for the duplicates run.
//   node tools/determine/duplicates.ts [--batch 15]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import { openRepo, readBlobs } from "../trace/git.ts";
import { currentTraces, ROOT } from "../classify/store.ts";
import type { StoredTrace } from "../classify/classify.ts";

const args = process.argv.slice(2);
const per = Number(args[args.indexOf("--batch") + 1] || 15);
const traces: StoredTrace[] = [];
for (const t of currentTraces()) {
  const s = JSON.parse(readFileSync(join(ROOT, t.file), "utf8")) as StoredTrace;
  if (s.status === "resolved") traces.push(s);
}

/** The comparable file set: own-folder files by relative path and blob, the rest by blob alone. */
function fileSet(t: StoredTrace): string[] {
  const own = t.skillPath + "/";
  return t.files.map((f) => (f.path.startsWith(own) ? `own:${f.path.slice(own.length)}:${f.blob}` : `other:${f.blob}`)).sort();
}

const bySkillMd = new Map<string, StoredTrace[]>();
for (const t of traces) {
  const root = t.files.find((f) => f.path === `${t.skillPath}/SKILL.md`);
  if (!root) continue;
  const list = bySkillMd.get(root.blob) ?? [];
  list.push(t);
  bySkillMd.set(root.blob, list);
}

interface Group {
  skillMd: string;
  members: { candidate: string; source: string; revision: string; skillPath: string; files: number; bytes: number }[];
  exact: string[][]; // classes of members with identical file sets
}
const groups: Group[] = [];
for (const [blob, ts] of bySkillMd) {
  if (ts.length < 2) continue;
  const classes = new Map<string, string[]>();
  for (const t of ts) {
    const k = fileSet(t).join("\n");
    classes.set(k, [...(classes.get(k) ?? []), t.candidate]);
  }
  groups.push({
    skillMd: blob,
    members: ts
      .map((t) => ({ candidate: t.candidate, source: t.source, revision: t.revision, skillPath: t.skillPath, files: t.totals.files, bytes: t.totals.bytes }))
      .sort((a, b) => a.candidate.localeCompare(b.candidate)),
    exact: [...classes.values()].map((c) => c.sort()).sort((a, b) => a[0].localeCompare(b[0])),
  });
}
groups.sort((a, b) => a.members[0].candidate.localeCompare(b.members[0].candidate));
const dir = join(ROOT, ".pad/catalogue/duplicates");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "groups.json"), JSON.stringify(groups, null, 1));

// Provenance evidence per source: README head, plugin manifests, licence head; per member: frontmatter.
const PROVENANCE = ["README.md", "readme.md", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json", ".codex-plugin/plugin.json", "package.json", "LICENSE", "LICENSE.md", "NOTICE"];
function sourceEvidence(source: string, revision: string, skillPath: string): string {
  const repo = openRepo(source, revision);
  const paths: string[] = [];
  for (let d = skillPath; ; d = posix.dirname(d)) {
    for (const p of PROVENANCE) {
      const full = d === "." || d === "" ? p : `${d}/${p}`;
      if (repo.tree.has(full) && !paths.includes(full)) paths.push(full);
    }
    if (d === "." || d === "") break;
  }
  const blobs = readBlobs(repo, paths.map((p) => repo.tree.get(p)!.blob));
  return paths
    .map((p) => {
      const s = blobs.get(repo.tree.get(p)!.blob)!.toString("utf8");
      return `#### ${p}\n\n\`\`\`\`\n${s.slice(0, 2500)}${s.length > 2500 ? `\n[… ${s.length - 2500} more characters]` : ""}\n\`\`\`\``;
    })
    .join("\n\n");
}

const tracesById = new Map(traces.map((t) => [t.candidate, t]));
const batches: string[] = [];
for (let b = 0; b * per < groups.length; b++) {
  const part = groups.slice(b * per, (b + 1) * per);
  const out: string[] = [];
  for (const [i, g] of part.entries()) {
    out.push(`## Group ${b * per + i}: SKILL.md blob ${g.skillMd}`, "");
    out.push(`Exact-duplicate classes (identical traced file sets): ${g.exact.map((c) => `[${c.join(", ")}]`).join(" ")}`, "");
    const base = fileSet(tracesById.get(g.members[0].candidate)!);
    for (const m of g.members) {
      const t = tracesById.get(m.candidate)!;
      const fs = fileSet(t);
      const missing = base.filter((x) => !fs.includes(x)).length;
      const extra = fs.filter((x) => !base.includes(x));
      out.push(`### ${m.candidate}`, "", `- source ${m.source} at ${m.revision}, skill folder \`${m.skillPath}\`; ${m.files} files, ${m.bytes} bytes`);
      if (m !== g.members[0]) out.push(`- against the first member: ${missing} of its files missing here; ${extra.length} files only here${extra.length ? `: ${extra.slice(0, 8).map((x) => t.files.find((f) => x.endsWith(f.blob))?.path ?? x).join(", ")}` : ""}`);
      out.push("", sourceEvidence(m.source, m.revision, m.skillPath), "");
    }
  }
  const p = join(dir, `batch-${String(b).padStart(3, "0")}.md`);
  writeFileSync(p, out.join("\n"));
  batches.push(p);
}
writeFileSync(join(dir, "batches.txt"), batches.join("\n") + "\n");
console.log(`${groups.length} groups (${groups.reduce((n, g) => n + g.members.length, 0)} members, ${groups.filter((g) => g.exact.length > 1).length} with near-duplicates) in ${batches.length} batches`);
