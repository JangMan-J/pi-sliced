// Helpers shared by the in-sandbox driver and the host-side checks.
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Git blob SHA-1 of `bytes`. */
export const blobSha = (bytes: Buffer) =>
  createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");

export interface WalkEntry {
  /** Path relative to the walked root. */
  path: string;
  kind: "file" | "dir" | "symlink" | "other";
  size: number;
  mode: number;
  blob?: string;
}

/** Every entry under `root` (not following symlinks), sorted by path. Missing root → []. */
export function walk(root: string, withBlobs = true): WalkEntry[] {
  const out: WalkEntry[] = [];
  const visit = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(dir, n);
      const st = lstatSync(p);
      const rel = relative(root, p);
      if (st.isDirectory()) {
        out.push({ path: rel, kind: "dir", size: 0, mode: st.mode & 0o7777 });
        visit(p);
      } else if (st.isFile()) {
        out.push({
          path: rel,
          kind: "file",
          size: st.size,
          mode: st.mode & 0o7777,
          ...(withBlobs ? { blob: blobSha(readFileSync(p)) } : {}),
        });
      } else out.push({ path: rel, kind: st.isSymbolicLink() ? "symlink" : "other", size: st.size, mode: st.mode & 0o7777 });
    }
  };
  visit(root);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Leaf strings of a JSON value, joined; JSON escaping can hide a match in the raw text. */
export function jsonStrings(v: unknown, acc: string[] = []): string[] {
  if (typeof v === "string") acc.push(v);
  else if (Array.isArray(v)) for (const x of v) jsonStrings(x, acc);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
    acc.push(k);
    jsonStrings(x, acc);
  }
  return acc;
}

/** The text a model request carries: the raw body plus its decoded string leaves. */
export function payloadText(body: string): string {
  try {
    return `${body}\n${jsonStrings(JSON.parse(body)).join("\n")}`;
  } catch {
    return body;
  }
}
