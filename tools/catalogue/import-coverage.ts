// Take the coverage research's new Candidates (263, 2026-10-24) into catalogue/candidates.jsonl, after the
// reused set. skills.sh ids are <owner>/<repo>/<name>; a GitHub row gives <owner>/<repo>/<path to the skill
// folder>, kept as a location hint; a site-hosted (well-known) row whose first segment is a domain has no git
// source and is recorded with that fact, so it traces as unresolvable. Ids already in the list are skipped.
//   node tools/catalogue/import-coverage.ts <candidates-new.tsv>
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const LIST = join(ROOT, "catalogue/candidates.jsonl");
const have = new Set(readFileSync(LIST, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id as string));
let added = 0;
const skipped: string[] = [];
const out: string[] = [];
for (const row of readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean)) {
  const [raw, , kind] = row.split("\t");
  const segs = raw.split("/");
  let rec: Record<string, unknown>;
  if (kind === "well-known" && segs[0].includes(".")) {
    rec = { id: raw.toLowerCase(), source: segs[0].toLowerCase(), name: segs.slice(1).join("/"), intake: "coverage 2026-10-24", siteHosted: true };
  } else {
    const [owner, repo, ...path] = segs;
    const source = `${owner}/${repo}`.toLowerCase();
    const name = path[path.length - 1];
    rec = {
      id: `${source}/${name}`.toLowerCase(),
      source,
      name,
      intake: "coverage 2026-10-24",
      ...(kind === "github" && path.length > 1 ? { hint: { skillPath: path.join("/") } } : {}),
    };
  }
  if (have.has(rec.id as string)) {
    skipped.push(rec.id as string);
    continue;
  }
  have.add(rec.id as string);
  out.push(JSON.stringify({ ...rec, archive: {} }));
  added++;
}
if (out.length) appendFileSync(LIST, out.join("\n") + "\n");
console.log(`${added} Candidates added; ${skipped.length} already listed: ${skipped.join(", ")}`);
