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
// admitted skill, then `catalogues/<name>.json` (Catalogue). Admission here ignores Determinations.
// Each Listing comes from the current Trace (highest tracer, then judge) plus its Classification
// (docs/contracts/classification.md); a Candidate without one fails the build. Footprint counts
// come from the Trace; summary, short, heavy, markers, security and companions from the
// Classification, whose Heavy must agree with the glossary rule applied to the Trace.
// The governing licence named by the Trace's `licence.path`, with any NOTICE beside it or at the
// repo root, is written to `licences/<owner>/<repo>/<name>@<revision>.json` (LicenceText) and
// referenced from the Listing (`licence`); it accompanies the skill and is not in its `files`.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, posix } from "node:path";
import { storeTrace } from "./build-store.mjs";
import {
  REPO,
  blobPath,
  cataloguePath,
  cloneDir,
  copyrightLine,
  detailPath,
  footprint,
  hasClassification,
  isHeavy,
  licencePath,
  NOTICE_NAMES,
  parseFrontmatter,
  readCloneBlobs,
  readClassification,
  readTrace,
  resolvedTraces,
  treeEntries,
  verifyBlob,
  writeAtomic,
  writeJson,
} from "./lib.mjs";

const SPECS = join(REPO, "server", "catalogues");
const CHECK_DOMAIN = "check";
const CHECK_DOMAIN_LINE = "Traced Candidates admitted for checks, whatever their Determinations say.";

/**
 * LicenceText of the Trace's governing licence (`licence.path`) at its Revision, or null when the
 * Trace names none: the licence file, then NOTICE files beside it and at the repo root, verbatim.
 * `tree` maps path → { mode, blob } at the Revision; `readBlobs(shas)` returns sha → bytes.
 * Every blob is verified against its SHA and must be UTF-8.
 */
export function buildLicence(trace, tree, readBlobs) {
  const lic = trace.licence;
  if (!lic?.path) return null;
  if (!tree.has(lic.path)) throw new Error(`${trace.candidate}: licence ${lic.path} is not in the tree at ${trace.revision}`);
  const dir = posix.dirname(lic.path);
  const paths = [lic.path];
  for (const d of new Set([dir === "." ? "" : dir, ""])) {
    for (const n of NOTICE_NAMES) {
      const p = d ? `${d}/${n}` : n;
      if (tree.has(p) && !paths.includes(p)) paths.push(p);
    }
  }
  const shas = paths.map((p) => tree.get(p).blob);
  const bytes = readBlobs(shas);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const files = paths.map((path, i) => {
    const b = bytes.get(shas[i]);
    if (!b) throw new Error(`${trace.candidate}: blob ${shas[i]} (${path}) not returned by git`);
    verifyBlob(b, shas[i]);
    let text;
    try {
      text = decoder.decode(b);
    } catch {
      throw new Error(`${trace.candidate}: ${path} is not UTF-8`);
    }
    return { path, blob: shas[i], text };
  });
  let copyright = null;
  for (const f of [...files.slice(1), files[0]]) {
    copyright = copyrightLine(f.text);
    if (copyright) break;
  }
  return {
    format: "pi-sliced.licence/1",
    id: trace.candidate,
    source: trace.source,
    revision: trace.revision,
    spdx: lic.spdx ?? null,
    copyright,
    files,
  };
}

/** The Listing's LicenceRef for a LicenceText, or null. */
export function licenceRef(text) {
  if (!text) return null;
  return {
    spdx: text.spdx,
    copyright: text.copyright,
    path: text.files[0].path,
    route: `/v1/licences/${text.id}@${text.revision}`,
  };
}

/**
 * Listing + Detail for one Trace and its Classification (`{ classification, path }` from
 * readClassification). `modes` maps path → git mode at the Revision; `licence` is its LicenceText or null.
 */
export function buildDetail(trace, { classification: c, path: classificationPath }, { domain, summary }, modes, readBlob, licence) {
  if (licence === undefined) throw new Error(`${trace.candidate}: buildDetail needs its licence (LicenceText or null)`);
  const own = `${trace.skillPath}/SKILL.md`;
  const md = trace.files.find((f) => f.path === own);
  if (!md) throw new Error(`${trace.candidate}: ${own} is not in its Trace`);
  const skillMd = readBlob(md.blob).toString("utf8");
  const fm = parseFrontmatter(skillMd);
  if (typeof fm.name !== "string" || typeof fm.description !== "string") {
    throw new Error(`${trace.candidate}: SKILL.md frontmatter lacks a string name or description`);
  }
  const fail = (what) => {
    throw new Error(`${trace.candidate}: ${classificationPath}: ${what}`);
  };
  const fp = footprint(trace);
  const cf = c.footprint ?? fail("no footprint");
  if (cf.files !== fp.files || cf.bytes !== fp.bytes) fail(`footprint ${cf.files} files/${cf.bytes} B, Trace ${fp.files}/${fp.bytes}`);
  if (typeof cf.summary !== "string" || cf.summary === "") fail("no footprint.summary");
  if (typeof cf.short !== "string" || cf.short === "") fail("no footprint.short");
  if (typeof c.heavy?.heavy !== "boolean" || !Array.isArray(c.heavy.because)) fail("no heavy {heavy, because}");
  if (c.heavy.heavy !== isHeavy(fp)) fail(`heavy ${c.heavy.heavy}, but the glossary rule on the Trace says ${isHeavy(fp)}`);
  if (!Array.isArray(c.markers) || !c.markers.every((m) => typeof m.marker === "string" && Array.isArray(m.because))) fail("bad markers");
  if (typeof c.security !== "object" || c.security === null) fail("no security");
  if (!Array.isArray(c.companions?.named) || !Array.isArray(c.companions?.pulled)) fail("no companions {named, pulled}");
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
    footprint: { ...fp, summary: cf.summary, short: cf.short },
    heavy: c.heavy.heavy,
    heavyBecause: c.heavy.because,
    markers: c.markers.map((m) => ({ marker: m.marker, because: m.because })),
    security: c.security,
    companions: c.companions,
    classification: classificationPath,
    licence: licenceRef(licence),
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
    let unclassified = 0;
    for (const t of resolvedTraces()) {
      if (!hasClassification(t)) {
        unclassified++;
        continue;
      }
      const prev = byCandidate.get(t.candidate);
      if (!prev || commitTime(t.source, t.revision) > commitTime(prev.source, prev.revision)) byCandidate.set(t.candidate, t);
    }
    const ids = [...byCandidate.keys()].sort().slice(0, limit);
    if (unclassified) process.stderr.write(`${spec.name}: skipped ${unclassified} resolved Traces without a Classification\n`);
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
  const trees = new Map();
  const readBlob = (sha) => readFileSync(blobPath(sha));
  const skills = [];
  for (const { trace, domain, summary } of admit) {
    storeTrace(trace);
    const key = `${trace.source}@${trace.revision}`;
    if (!trees.has(key)) trees.set(key, treeEntries(trace.source, trace.revision));
    const tree = trees.get(key);
    const modes = new Map([...tree].map(([p, e]) => [p, e.mode]));
    const licence = buildLicence(trace, tree, (shas) => readCloneBlobs(trace.source, shas));
    if (licence) {
      for (const f of licence.files) {
        if (existsSync(blobPath(f.blob))) continue;
        const bytes = Buffer.from(f.text, "utf8");
        verifyBlob(bytes, f.blob);
        writeAtomic(blobPath(f.blob), bytes);
      }
      writeJson(licencePath(trace.candidate, trace.revision), licence);
    } else {
      rmSync(licencePath(trace.candidate, trace.revision), { force: true });
    }
    const detail = buildDetail(trace, readClassification(trace), { domain, summary }, modes, readBlob, licence);
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
