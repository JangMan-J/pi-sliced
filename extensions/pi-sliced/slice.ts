// The Slice: Served skills materialized into one session dir under the temp directory, and nowhere else.
// This is the extension's only writer: a Served skill's verified files, and removal of its own dirs.

import { createHash, randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import type { UntracedSnapshot } from "./skills-sh.ts";
import { frontmatter } from "./frontmatter.ts";
import type { Detail, LicenceRef, ServedSkill, SliceApi, UntracedItem } from "./types.ts";

/** Git blob SHA-1 of `bytes`: sha1("blob <len>\0" + bytes). */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

export interface SliceDeps {
  /** Raw bytes of a blob from the Author's server; verified here. */
  blob(sha: string): Promise<Buffer>;
  /** The Skills.sh snapshot the user inspected. */
  snapshot(item: UntracedItem): Promise<UntracedSnapshot>;
  tmpdir?: string;
  pid?: number;
  concurrency?: number;
  onChange?: () => void;
}

export interface ServedEntry extends ServedSkill {
  /** The skill's materialized root: repo-relative paths resolve against it. */
  root: string;
  /** The directory holding its SKILL.md: its relative links resolve against this. */
  skillDir: string;
  /**
   * Catalogue skills: the governing licence from the inspected Detail, or null when none was found.
   * Named only in the MCP load header; its files are never written unless the Trace lists them.
   */
  licence?: LicenceRef | null;
}

export interface Slice extends SliceApi {
  entries(): readonly ServedEntry[];
  sessionDir(): string | undefined;
  /** Remove the session dir and forget every Served skill. Idempotent. */
  cleanup(): void;
}

const PREFIX = "pi-sliced-";

/** Remove `pi-sliced-<pid>-*` dirs in `tmp` owned by this user whose pid is no longer running. */
export function sweepDeadSessions(tmp = os.tmpdir(), self = process.pid): string[] {
  const removed: string[] = [];
  let names: string[];
  try {
    names = readdirSync(tmp);
  } catch {
    return removed;
  }
  const uid = process.getuid?.();
  for (const name of names) {
    const m = /^pi-sliced-(\d+)-[^/]+$/.exec(name);
    if (!m) continue;
    const pid = Number(m[1]);
    if (pid === self || alive(pid)) continue;
    const path = join(tmp, name);
    try {
      const st = lstatSync(path);
      if (!st.isDirectory() || (uid !== undefined && st.uid !== uid)) continue;
      rmSync(path, { recursive: true, force: true });
      removed.push(path);
    } catch {
      // Raced with another sweeper or not ours: leave it.
    }
  }
  return removed;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM";
  }
}

/** A repo-relative POSIX path with no `.`/`..`/empty segments. */
export function safeRelPath(p: string): string {
  if (typeof p !== "string" || p === "" || p.startsWith("/") || p.includes("\\") || p.includes("\0")) {
    throw new Error(`unsafe path: ${JSON.stringify(p)}`);
  }
  const segs = p.split("/");
  if (segs.some((s) => s === "" || s === "." || s === "..")) throw new Error(`unsafe path: ${JSON.stringify(p)}`);
  return p;
}

const MODES: Record<string, number> = { "100644": 0o644, "100755": 0o755 };

interface Staged {
  path: string;
  bytes: Buffer;
  mode: number;
}

export function createSlice(deps: SliceDeps): Slice {
  const tmp = deps.tmpdir ?? os.tmpdir();
  const pid = deps.pid ?? process.pid;
  const served = new Map<string, ServedEntry>();
  const pending = new Map<string, Promise<ServedSkill>>();
  const cancelled = new Set<string>();
  let dir: string | undefined;
  let slots = 0;
  let closed = false;

  function sessionDir(): string {
    if (closed) throw new Error("the session has ended");
    if (!dir) {
      dir = join(tmp, `${PREFIX}${pid}-${randomBytes(6).toString("hex")}`);
      mkdirSync(dir, { mode: 0o700 });
      chmodSync(dir, 0o700);
    }
    return dir;
  }

  /** Write every staged file under a fresh slot, atomically: the slot appears whole or not at all. */
  function materialize(files: Staged[]): string {
    const base = sessionDir();
    const slot = String(++slots);
    const staging = join(base, `.${slot}.partial`);
    const root = join(base, slot);
    try {
      mkdirSync(staging, { mode: 0o755 });
      for (const f of files) {
        const target = join(staging, ...f.path.split("/"));
        mkdirSync(join(target, ".."), { recursive: true, mode: 0o755 });
        writeFileSync(target, f.bytes, { flag: "wx", mode: f.mode });
        chmodSync(target, f.mode);
      }
      renameSync(staging, root);
    } catch (e) {
      rmSync(staging, { recursive: true, force: true });
      throw e;
    }
    return root;
  }

  async function verified(detail: Detail): Promise<Staged[]> {
    const seen = new Set<string>();
    const files = detail.files.map((f) => {
      const path = safeRelPath(f.path);
      if (seen.has(path)) throw new Error(`${detail.id}: duplicate file ${path}`);
      seen.add(path);
      const mode = MODES[f.mode];
      if (mode === undefined) throw new Error(`${detail.id}: ${path} has unsupported git mode ${f.mode}`);
      return { ...f, path, mode };
    });
    const out: Staged[] = new Array(files.length);
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const i = next++;
        const f = files[i];
        const bytes = await deps.blob(f.blob);
        if (bytes.length !== f.size || gitBlobSha(bytes) !== f.blob) {
          throw new Error(`${detail.id}: blob ${f.blob} for ${f.path} failed verification (got ${bytes.length} bytes, sha ${gitBlobSha(bytes)})`);
        }
        out[i] = { path: f.path, bytes, mode: f.mode };
      }
    };
    await Promise.all(Array.from({ length: Math.min(deps.concurrency ?? 8, files.length) }, worker));
    return out;
  }

  function once(id: string, work: () => Promise<ServedEntry>): Promise<ServedSkill> {
    const existing = served.get(id);
    if (existing) return Promise.resolve(publicView(existing));
    const inFlight = pending.get(id);
    if (inFlight) return inFlight;
    if (closed) return Promise.reject(new Error("the session has ended"));
    const p = work()
      .then((entry) => {
        if (cancelled.has(id) || closed) {
          rmSync(entry.root, { recursive: true, force: true });
          throw new Error(`${id} was unserved before it was ready`);
        }
        served.set(id, entry);
        try {
          deps.onChange?.();
        } catch (error) {
          served.delete(id);
          rmSync(entry.root, { recursive: true, force: true });
          // Republish the restored Slice (including the MCP child's atomic state).
          try { deps.onChange?.(); }
          catch (rollbackError) { throw new AggregateError([error, rollbackError], "Serve failed and Slice refresh failed"); }
          throw error;
        }
        return publicView(entry);
      })
      .finally(() => {
        pending.delete(id);
        cancelled.delete(id);
      });
    pending.set(id, p);
    return p;
  }

  return {
    served: () => [...served.values()].map(publicView),
    entries: () => [...served.values()],
    sessionDir: () => dir,

    serveCatalogue(detail) {
      return once(detail.id, async () => {
        const skillPath = detail.skillPath === "" || detail.skillPath === "." ? "" : safeRelPath(detail.skillPath.replace(/\/+$/, ""));
        const skillMdRel = skillPath ? `${skillPath}/SKILL.md` : "SKILL.md";
        if (!detail.files.some((f) => f.path === skillMdRel)) throw new Error(`${detail.id}: ${skillMdRel} is not in its files`);
        const files = await verified(detail);
        const root = materialize(files);
        const skillDir = skillPath ? join(root, ...skillPath.split("/")) : root;
        return {
          id: detail.id,
          kind: "catalogue",
          name: detail.name,
          description: detail.description,
          revision: detail.revision,
          skillMdPath: join(skillDir, "SKILL.md"),
          root,
          skillDir,
          licence: detail.licence ?? null,
        };
      });
    },

    serveUntraced(item) {
      return once(item.id, async () => {
        const snap = await deps.snapshot(item);
        const seen = new Set<string>();
        const files = snap.files.map((f) => {
          const path = safeRelPath(f.path);
          if (seen.has(path)) throw new Error(`${item.id}: duplicate file ${path}`);
          seen.add(path);
          return { path, bytes: Buffer.from(f.contents, "utf8"), mode: 0o644 };
        });
        const md = files.find((f) => f.path === "SKILL.md");
        if (!md) throw new Error(`${item.id}: no SKILL.md in its snapshot`);
        const fm = frontmatter(md.bytes.toString("utf8"));
        const root = materialize(files);
        return {
          id: item.id,
          kind: "untraced",
          name: fm.name || item.name,
          description: fm.description ?? "",
          skillMdPath: join(root, "SKILL.md"),
          root,
          skillDir: root,
        };
      });
    },

    unserve(id) {
      if (pending.has(id)) cancelled.add(id);
      const entry = served.get(id);
      if (!entry) return;
      served.delete(id);
      rmSync(entry.root, { recursive: true, force: true });
      deps.onChange?.();
    },

    cleanup() {
      closed = true;
      const had = served.size > 0;
      served.clear();
      if (dir) rmSync(dir, { recursive: true, force: true });
      dir = undefined;
      if (had) deps.onChange?.();
    },
  };
}

function publicView(e: ServedEntry): ServedSkill {
  const v: ServedSkill = { id: e.id, kind: e.kind, name: e.name, description: e.description, skillMdPath: e.skillMdPath };
  if (e.revision !== undefined) v.revision = e.revision;
  return v;
}
