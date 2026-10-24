// Read-only access to one source repository at one Revision, through a bare,
// shallow, blobless clone in a cache directory. The cache is derived state:
// deleting it costs only a refetch. Blobs are fetched in batches on demand.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface TreeEntry {
  path: string;
  mode: string;
  blob: string;
}

export interface Repo {
  source: string; // "owner/repo"
  revision: string;
  dir: string;
  tree: Map<string, TreeEntry>; // blobs only, keyed by repo-relative path
  dirs: Set<string>; // every directory that holds at least one blob ("" is the root)
}

const REVISION = /^[0-9a-f]{40}$/;
const SOURCE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function cacheRoot(): string {
  if (process.env.PI_SLICED_GIT_CACHE) return process.env.PI_SLICED_GIT_CACHE;
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "pi-sliced", "git");
}

function git(dir: string, args: string[], input?: string | Buffer, env?: NodeJS.ProcessEnv): Buffer {
  const r = spawnSync("git", ["-C", dir, ...args], {
    input,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
    maxBuffer: 1 << 30,
    timeout: 600_000,
  });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${r.status}): ${r.stderr?.toString().trim()}`);
  }
  return r.stdout;
}

export function remoteUrl(source: string): string {
  return process.env.PI_SLICED_GIT_REMOTE_PREFIX
    ? `${process.env.PI_SLICED_GIT_REMOTE_PREFIX}/${source}.git`
    : `https://github.com/${source}.git`;
}

// A Revision's tree never changes, so an opened Repo is kept for the life of the process.
const opened = new Map<string, Repo>();

/** Open `source` at `revision`, fetching the commit and its trees if needed. */
export function openRepo(source: string, revision: string): Repo {
  const key = `${source}@${revision}`;
  const have = opened.get(key);
  if (have) return have;
  const repo = openRepoUncached(source, revision);
  opened.set(key, repo);
  return repo;
}

function openRepoUncached(source: string, revision: string): Repo {
  if (!SOURCE.test(source)) throw new Error(`bad source: ${source}`);
  if (!REVISION.test(revision)) throw new Error(`bad revision (want 40 hex): ${revision}`);
  const dir = join(cacheRoot(), `${source}.git`);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    execFileSync("git", ["init", "-q", "--bare", dir]);
    git(dir, ["remote", "add", "origin", remoteUrl(source)]);
    git(dir, ["config", "remote.origin.promisor", "true"]);
    git(dir, ["config", "remote.origin.partialclonefilter", "blob:none"]);
  }
  const have = spawnSync("git", ["-C", dir, "cat-file", "-e", `${revision}^{commit}`], {
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1" },
  });
  if (have.status !== 0) {
    git(dir, ["fetch", "-q", "--no-tags", "--depth", "1", "--filter=blob:none", "origin", revision]);
  }
  // No -l: sizes would force a lazy fetch of every blob. Sizes come from blobSizes().
  const out = git(dir, ["ls-tree", "-r", "-z", "--full-tree", revision], undefined, { GIT_NO_LAZY_FETCH: "1" }).toString("utf8");
  const tree = new Map<string, TreeEntry>();
  const dirs = new Set<string>([""]);
  for (const rec of out.split("\0")) {
    if (!rec) continue;
    const tab = rec.indexOf("\t");
    const [mode, type, blob] = rec.slice(0, tab).split(/\s+/);
    const path = rec.slice(tab + 1);
    if (type !== "blob") continue; // submodule commits are not files of this repo
    tree.set(path, { path, mode, blob });
    for (let i = path.indexOf("/"); i !== -1; i = path.indexOf("/", i + 1)) dirs.add(path.slice(0, i));
  }
  return { source, revision, dir, tree, dirs };
}

/** Fetch, in one batch, whichever of the given blobs are not yet in the cache. */
function ensureBlobs(repo: Repo, want: string[]): void {
  if (want.length === 0) return;
  const check = git(repo.dir, ["cat-file", "--batch-check"], want.join("\n") + "\n", { GIT_NO_LAZY_FETCH: "1" })
    .toString("utf8")
    .split("\n")
    .filter(Boolean);
  const missing = check.filter((l) => l.endsWith(" missing")).map((l) => l.split(" ")[0]);
  if (missing.length > 0) {
    git(repo.dir, ["fetch", "-q", "--no-tags", "--no-write-fetch-head", "--filter=blob:none", "--stdin", "origin"], missing.join("\n") + "\n");
  }
}

/** Sizes in bytes of the given blobs, fetching any that are missing unless `fetch` is false. */
export function blobSizes(repo: Repo, blobs: string[], opts: { fetch?: boolean } = {}): Map<string, number> {
  const want = [...new Set(blobs)];
  const result = new Map<string, number>();
  if (want.length === 0) return result;
  if (opts.fetch !== false) ensureBlobs(repo, want);
  const out = git(repo.dir, ["cat-file", "--batch-check=%(objectname) %(objectsize)"], want.join("\n") + "\n", { GIT_NO_LAZY_FETCH: "1" });
  for (const l of out.toString("utf8").split("\n")) {
    const [oid, size] = l.split(" ");
    if (oid && size && size !== "missing") result.set(oid, Number(size));
  }
  return result;
}

/** Return the bytes of the given blobs, fetching any that are missing in one batch. */
export function readBlobs(repo: Repo, blobs: string[]): Map<string, Buffer> {
  const want = [...new Set(blobs)];
  const result = new Map<string, Buffer>();
  if (want.length === 0) return result;
  ensureBlobs(repo, want);
  const out = git(repo.dir, ["cat-file", "--batch"], want.join("\n") + "\n", { GIT_NO_LAZY_FETCH: "1" });
  let at = 0;
  while (at < out.length) {
    const nl = out.indexOf(10, at);
    const header = out.subarray(at, nl).toString("utf8");
    const [oid, type, size] = header.split(" ");
    if (type !== "blob") throw new Error(`object ${oid}: ${header}`);
    const n = Number(size);
    result.set(oid, out.subarray(nl + 1, nl + 1 + n));
    at = nl + 1 + n + 1;
  }
  return result;
}
