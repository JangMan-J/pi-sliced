// Fill the clone cache for every pinned source (commit and trees only; blobs come on demand while tracing).
//   node tools/catalogue/fetch.ts <shard> <shards>
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openRepo } from "../trace/git.ts";

const [shard, shards] = process.argv.slice(2).map(Number);
const ROOT = join(import.meta.dirname, "..", "..");
const sources = readFileSync(join(ROOT, "catalogue", "sources.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
sources.forEach((s, i) => {
  if (i % shards !== shard || !s.revision) return;
  const t = Date.now();
  try {
    const r = openRepo(s.source, s.revision);
    console.log(`ok ${s.source} ${r.tree.size} blobs ${Date.now() - t}ms`);
  } catch (e) {
    console.log(`FAIL ${s.source}: ${String((e as Error).message).slice(0, 300)}`);
  }
});
