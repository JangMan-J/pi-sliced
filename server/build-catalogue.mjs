#!/usr/bin/env node
// Build an interim test Catalogue from a committed spec file and the stored Traces.
//
//   node server/build-catalogue.mjs <name>
//
// Reads server/catalogues/<name>.json, either
//   { "name", "admit": [{ "candidate", "revision", "domain", "summary" }], "domains": { "<domain>": "<one line>" } }
// or
//   { "name", "admitTraced": { "limit": N } }  (first N resolved Candidates by id, newest Revision each)
// and writes, under the store, `skills/<owner>/<repo>/<name>@<revision>.json` (Detail) for each
// admitted skill, then `catalogues/<name>.json` (Catalogue). Admission here ignores Determinations;
// Footprint, Heavy and markers derive from the stored Trace alone.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { storeTrace } from "./build-store.mjs";
import {
  REPO,
  blobPath,
  cataloguePath,
  cloneDir,
  detailPath,
  footprint,
  isHeavy,
  markers,
  parseFrontmatter,
  readTrace,
  resolvedTraces,
  treeModes,
  writeJson,
} from "./lib.mjs";

const SPECS = join(REPO, "server", "catalogues");
const CHECK_DOMAIN = "check";
const CHECK_DOMAIN_LINE = "Traced Candidates admitted for checks, whatever their Determinations say.";

/** Listing + Detail for one Trace. `modes` maps path → git mode at the Revision. */
export function buildDetail(trace, { domain, summary }, modes, readBlob) {
  const own = `${trace.skillPath}/SKILL.md`;
  const md = trace.files.find((f) => f.path === own);
  if (!md) throw new Error(`${trace.candidate}: ${own} is not in its Trace`);
  const skillMd = readBlob(md.blob).toString("utf8");
  const fm = parseFrontmatter(skillMd);
  if (typeof fm.name !== "string" || typeof fm.description !== "string") {
    throw new Error(`${trace.candidate}: SKILL.md frontmatter lacks a string name or description`);
  }
  const fp = footprint(trace);
  const files = trace.files.map((f) => {
    const mode = modes.get(f.path);
    if (!mode) throw new Error(`${trace.candidate}: ${f.path} is not in the tree at ${trace.revision}`);
    return { path: f.path, size: f.size, blob: f.blob, mode };
  });
  return {
    format: "pi-sliced.detail/1",
    id: trace.candidate,
    name: fm.name,
    description: fm.description,
    summary,
    domain,
    source: trace.source,
    revision: trace.revision,
    skillPath: trace.skillPath,
    footprint: fp,
    heavy: isHeavy(fp),
    markers: markers(trace),
    files,
    skillMd,
  };
}

export function listingOf(detail) {
  const { format: _f, files: _files, skillMd: _md, ...listing } = detail;
  return listing;
}

function commitTime(source, revision) {
  const r = spawnSync("git", ["-C", cloneDir(source), "log", "-1", "--format=%ct", revision], {
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
  });
  return r.status === 0 ? Number(r.stdout.toString().trim()) : 0;
}

/** Resolve a spec into [{ trace, domain, summary }] and its domains. */
export function admissions(spec) {
  if (spec.admitTraced) {
    const limit = spec.admitTraced.limit;
    if (!Number.isInteger(limit) || limit < 1) throw new Error("admitTraced.limit must be a positive integer");
    const byCandidate = new Map();
    for (const t of resolvedTraces()) {
      const prev = byCandidate.get(t.candidate);
      if (!prev || commitTime(t.source, t.revision) > commitTime(prev.source, prev.revision)) byCandidate.set(t.candidate, t);
    }
    const ids = [...byCandidate.keys()].sort().slice(0, limit);
    return {
      domains: spec.domains ?? { [CHECK_DOMAIN]: CHECK_DOMAIN_LINE },
      admit: ids.map((id) => ({ trace: byCandidate.get(id), domain: CHECK_DOMAIN, summary: "" })),
    };
  }
  if (!Array.isArray(spec.admit) || typeof spec.domains !== "object") throw new Error("spec needs admit[] and domains{}");
  const seen = new Set();
  const admit = spec.admit.map((a) => {
    if (seen.has(a.candidate)) throw new Error(`${a.candidate}: admitted twice`);
    seen.add(a.candidate);
    if (!(a.domain in spec.domains)) throw new Error(`${a.candidate}: domain "${a.domain}" not in domains`);
    if (typeof a.summary !== "string") throw new Error(`${a.candidate}: summary must be a string`);
    if (/^\s*use (this|it) when/i.test(a.summary)) throw new Error(`${a.candidate}: summary starts with "Use this when"`);
    const trace = readTrace(a.candidate, a.revision);
    if (trace.status !== "resolved") throw new Error(`${a.candidate}@${a.revision}: status ${trace.status}`);
    return { trace, domain: a.domain, summary: a.summary };
  });
  return { domains: spec.domains, admit };
}

export function buildCatalogue(name) {
  const spec = JSON.parse(readFileSync(join(SPECS, `${name}.json`), "utf8"));
  if (spec.name !== name) throw new Error(`server/catalogues/${name}.json names itself "${spec.name}"`);
  cataloguePath(name); // validates the name
  const { domains, admit } = admissions(spec);
  const modesBySourceRev = new Map();
  const readBlob = (sha) => readFileSync(blobPath(sha));
  const skills = [];
  for (const { trace, domain, summary } of admit) {
    storeTrace(trace);
    const key = `${trace.source}@${trace.revision}`;
    if (!modesBySourceRev.has(key)) modesBySourceRev.set(key, treeModes(trace.source, trace.revision));
    const detail = buildDetail(trace, { domain, summary }, modesBySourceRev.get(key), readBlob);
    writeJson(detailPath(trace.candidate, trace.revision), detail);
    skills.push(listingOf(detail));
  }
  const catalogue = { format: "pi-sliced.catalogue/1", name, domains, skills };
  writeJson(cataloguePath(name), catalogue);
  return catalogue;
}

if (import.meta.main) {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error("usage: node server/build-catalogue.mjs <name>...");
    process.exit(2);
  }
  for (const name of names) {
    const c = buildCatalogue(name);
    const heavy = c.skills.filter((s) => s.heavy).length;
    console.log(`${cataloguePath(name)}: ${c.skills.length} skills (${heavy} Heavy), ${Object.keys(c.domains).length} domains`);
  }
}
