// Skills.sh branch client, through the skills.sh proxy. Install counts are never kept or passed on.

import type { SkillsShApi, UntracedItem } from "./types.ts";

export const DEFAULT_GATEWAY = "https://pi-sliced.vercel.app/api/skills";

/** The proxy's `action=detail` snapshot: the skill folder's files, paths relative to it. */
export interface UntracedSnapshot {
  id: string;
  files: Array<{ path: string; contents: string }>;
}

export interface SkillsShClient extends SkillsShApi {
  /** The snapshot Inspect showed; fetched once per session and held in memory. */
  snapshot(item: UntracedItem): Promise<UntracedSnapshot>;
}

export interface SkillsShOptions {
  url: string;
  timeoutMs?: number;
  limit?: number;
  fetch?: typeof globalThis.fetch;
}

export function createSkillsShClient(opts: SkillsShOptions): SkillsShClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const snapshots = new Map<string, Promise<UntracedSnapshot>>();

  async function call(params: Record<string, string>): Promise<any> {
    const url = new URL(opts.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await doFetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    if (!res.ok) throw new Error(`skills.sh proxy: ${params.action} → ${res.status} ${text.slice(0, 200)}`);
    return JSON.parse(text);
  }

  const client: SkillsShClient = {
    async search(query) {
      const q = query.trim();
      if (q.length < 2) return [];
      const data = await call({ action: "search", query: q, limit: String(opts.limit ?? 50) });
      const seen = new Set<string>();
      const items: UntracedItem[] = [];
      for (const r of Array.isArray(data?.data) ? data.data : []) {
        if (typeof r?.id !== "string" || seen.has(r.id)) continue;
        seen.add(r.id);
        items.push({
          id: r.id,
          name: typeof r.name === "string" ? r.name : r.id.split("/").pop()!,
          source: typeof r.source === "string" ? r.source : r.id.split("/").slice(0, -1).join("/"),
        });
      }
      return items;
    },
    snapshot(item) {
      let p = snapshots.get(item.id);
      if (!p) {
        p = call({ action: "detail", id: item.id }).then((d) => {
          const files = (Array.isArray(d?.files) ? d.files : [])
            .filter((f: any) => typeof f?.path === "string" && typeof f?.contents === "string")
            .map((f: any) => ({ path: f.path, contents: f.contents }));
          if (!files.some((f: { path: string }) => f.path === "SKILL.md")) {
            throw new Error(`skills.sh proxy: ${item.id} has no SKILL.md`);
          }
          return { id: item.id, files };
        });
        snapshots.set(item.id, p);
        p.catch(() => snapshots.delete(item.id));
      }
      return p;
    },
    async skillMd(item) {
      return (await client.snapshot(item)).files.find((f) => f.path === "SKILL.md")!.contents;
    },
  };
  return client;
}
