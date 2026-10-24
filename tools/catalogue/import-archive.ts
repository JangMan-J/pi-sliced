// One-time import of the reused Candidate set (proof 9): the archive's 10,001 skills, from its
// `.handoff/curation.sqlite`, into `catalogue/candidates.jsonl`, the source of truth from now on.
// Only identity and the archive's own location hints are kept: no scores, summaries, or install counts.
//   node tools/catalogue/import-archive.ts <path to curation.sqlite>
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const db = process.argv[2];
if (!db) {
  console.error("usage: import-archive.ts <curation.sqlite>");
  process.exit(2);
}
const sha = createHash("sha256").update(readFileSync(db)).digest("hex");
const rows = new DatabaseSync(db, { readOnly: true })
  .prepare(
    `select s.id, s.repo_slug, s.slug, s.skill_path, coalesce(s.revision, p.revision) as revision, s.drift_status
       from skills s left join packs p on p.repo_slug = s.repo_slug order by s.id`,
  )
  .all() as { id: string; repo_slug: string; slug: string; skill_path: string | null; revision: string | null; drift_status: string | null }[];
const out = rows.map((r) =>
  JSON.stringify({
    id: r.id,
    source: r.repo_slug,
    name: r.slug,
    archive: {
      ...(r.skill_path ? { skillPath: r.skill_path } : {}),
      ...(r.revision ? { revision: r.revision } : {}),
      ...(r.drift_status ? { drift: r.drift_status } : {}),
    },
  }),
);
const root = join(import.meta.dirname, "..", "..");
writeFileSync(join(root, "catalogue", "candidates.jsonl"), out.join("\n") + "\n");
console.log(`${out.length} Candidates from curation.sqlite sha256 ${sha}`);
