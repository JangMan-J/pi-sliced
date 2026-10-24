// Build the `admitted` catalogue in the Author's store from current, hash-matching admitted Determinations.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildDetail, buildLicence, listingOf } from '../build-catalogue.mjs';
import { storeTrace } from '../build-store.mjs';
import { REPO, blobPath, cataloguePath, detailPath, licencePath, readClassification, readCloneBlobs, treeEntries, verifyBlob, writeAtomic, writeJson } from '../lib.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
const files = readdirSync(join(REPO, 'determinations'), { recursive: true }).filter(p => p.endsWith('.jsonl')).sort();
const skills = [], evidence = [];
for (const path of files) {
  const lines = readFileSync(join(REPO, 'determinations', path), 'utf8').trim().split('\n');
  const d = JSON.parse(lines.at(-1));
  if (d.decision.verdict !== 'admit') continue;
  for (const ref of [d.trace, d.classification]) {
    if (sha(readFileSync(join(REPO, ref.path))) !== ref.sha256) throw new Error(`stale Determination: ${path}`);
  }
  const trace = JSON.parse(readFileSync(join(REPO, d.trace.path), 'utf8'));
  const c = readClassification(trace);
  if (sha(readFileSync(join(REPO, c.path))) !== d.classification.sha256) throw new Error(`current Classification differs: ${path}`);
  storeTrace(trace);
  const tree = treeEntries(trace.source, trace.revision);
  const licence = buildLicence(trace, tree, shas => readCloneBlobs(trace.source, shas));
  if (licence) {
    for (const f of licence.files) {
      if (existsSync(blobPath(f.blob))) continue;
      const bytes = Buffer.from(f.text, 'utf8');
      verifyBlob(bytes, f.blob);
      writeAtomic(blobPath(f.blob), bytes);
    }
    writeJson(licencePath(trace.candidate, trace.revision), licence);
  }
  const detail = buildDetail(trace, c, { domain: 'admitted', summary: d.decision.summary }, new Map([...tree].map(([p,e]) => [p,e.mode])), sha => readFileSync(blobPath(sha)), licence);
  writeJson(detailPath(trace.candidate, trace.revision), detail);
  skills.push(listingOf(detail));
  evidence.push({ candidate: d.candidate, determination: d.id, trace: d.trace, classification: d.classification });
}
if (skills.length < 50) throw new Error(`only ${skills.length} admitted Candidates`);
writeJson(cataloguePath('admitted'), { format: 'pi-sliced.catalogue/1', name: 'admitted', domains: { admitted: 'Candidates admitted by current Determinations' }, skills });
console.log(JSON.stringify({ skills: skills.length, evidence }, null, 2));
