import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { entryMarkers } from "./markers.ts";
import { SlicesPicker, type PickerResult, type PickerSkill } from "./picker.ts";
import type { Catalogue, Detail, Listing, PickerDeps, ServedSkill, UntracedItem } from "./types.ts";

/** A Picker row plus what serving it needs: the Listing (Catalogue) or the skills.sh item (Untraced). */
export interface PoolEntry {
  skill: PickerSkill;
  listing?: Listing;
  item?: UntracedItem;
}

/** Detail documents fetched for Inspect, reused to serve so a skill is served at the Revision inspected. */
export class DetailCache {
  private readonly details = new Map<string, Promise<Detail>>();
  private readonly deps: PickerDeps;
  constructor(deps: PickerDeps) {
    this.deps = deps;
  }

  get(id: string, revision: string): Promise<Detail> {
    const key = `${id}@${revision}`;
    let detail = this.details.get(key);
    if (!detail) {
      detail = this.deps.catalogue.detail(id, revision).then((value) => {
        if (value.id !== id || value.revision !== revision) {
          throw new Error(`the Author's server answered ${value.id}@${value.revision} for ${id}@${revision}`);
        }
        return value;
      });
      detail.catch(() => this.details.delete(key));
      this.details.set(key, detail);
    }
    return detail;
  }
}

export function catalogueEntry(listing: Listing, details: DetailCache): PoolEntry {
  return {
    listing,
    skill: {
      id: listing.id,
      name: listing.name,
      description: listing.description,
      summary: listing.summary,
      author: listing.source.split("/")[0],
      source: listing.source,
      sourceUrl: `https://github.com/${listing.source}/tree/${listing.revision}/${listing.skillPath}`,
      domain: listing.domain,
      revision: listing.revision,
      skillPath: listing.skillPath,
      footprint: listing.footprint,
      heavy: listing.heavy,
      heavyBecause: listing.heavyBecause,
      markers: entryMarkers(listing.markers),
      markerEntries: listing.markers,
      security: listing.security,
      companions: listing.companions,
      loadInspect: async () => {
        const detail = await details.get(listing.id, listing.revision);
        return { skillMd: detail.skillMd, files: detail.files };
      },
    },
  };
}

export function untracedEntry(item: UntracedItem, deps: PickerDeps): PoolEntry {
  return {
    item,
    skill: {
      id: item.id,
      name: item.name,
      author: item.source.split("/")[0],
      source: item.source,
      sourceUrl: `https://skills.sh/${item.id}`,
      untraced: true,
      markers: ["untraced"],
      loadInspect: async () => ({ skillMd: await deps.skillsSh.skillMd(item) }),
    },
  };
}

/** Rows for a Picker session: the Catalogue's listings, plus whatever is already Served, checked. */
export function buildPool(catalogue: Catalogue | undefined, served: readonly ServedSkill[], deps: PickerDeps, details: DetailCache): Map<string, PoolEntry> {
  const pool = new Map<string, PoolEntry>();
  for (const listing of catalogue?.skills ?? []) pool.set(listing.id, catalogueEntry(listing, details));
  for (const skill of served) {
    const existing = pool.get(skill.id);
    if (existing) {
      existing.skill.checked = true;
      continue;
    }
    if (skill.kind === "untraced") {
      const source = skill.id.split("/").slice(0, 2).join("/");
      const entry = untracedEntry({ id: skill.id, name: skill.name, source }, deps);
      entry.skill.checked = true;
      pool.set(skill.id, entry);
    } else {
      // Served earlier from a Catalogue that no longer lists it: shown so it can be unserved.
      pool.set(skill.id, {
        skill: { id: skill.id, name: skill.name, description: skill.description, revision: skill.revision, checked: true },
      });
    }
  }
  return pool;
}

export interface ApplyReport {
  served: string[];
  unserved: string[];
  failed: string[];
}

/** Applies the user's selection: unserves what they cleared, serves what they added. Only the user's actions reach here. */
export async function applySelection(
  deps: PickerDeps,
  pool: Map<string, PoolEntry>,
  before: ReadonlySet<string>,
  result: PickerResult,
  details: DetailCache,
): Promise<ApplyReport> {
  const after = new Set(result.served);
  const report: ApplyReport = { served: [], unserved: [], failed: [] };
  const nameOf = (id: string) => pool.get(id)?.skill.name ?? id;
  for (const id of before) {
    if (after.has(id)) continue;
    try {
      deps.slice.unserve(id);
      report.unserved.push(nameOf(id));
    } catch (error) {
      report.failed.push(`${nameOf(id)} (${error instanceof Error ? error.message : error})`);
    }
  }
  for (const id of after) {
    if (before.has(id)) continue;
    const entry = pool.get(id);
    try {
      if (entry?.listing) {
        await deps.slice.serveCatalogue(await details.get(entry.listing.id, entry.listing.revision));
      } else if (entry?.item) {
        await deps.slice.serveUntraced(entry.item);
      } else {
        throw new Error("not in the Catalogue or the skills.sh results");
      }
      report.served.push(nameOf(id));
    } catch (error) {
      report.failed.push(`${nameOf(id)} (${error instanceof Error ? error.message : error})`);
    }
  }
  return report;
}

export function reportText(report: ApplyReport, sliceSize: number): string {
  const parts = [`pi-sliced: ${sliceSize} ${sliceSize === 1 ? "skill" : "skills"} served`];
  if (report.served.length) parts.push(`added ${report.served.join(", ")}`);
  if (report.unserved.length) parts.push(`removed ${report.unserved.join(", ")}`);
  if (report.failed.length) parts.push(`failed: ${report.failed.join("; ")}`);
  return parts.join("; ") + ".";
}

/** Registers the Picker (`/slices`). */
export function registerPicker(pi: ExtensionAPI, deps: PickerDeps): void {
  pi.registerCommand("slices", {
    description:
      "Choose skills to serve for this session: the traced Catalogue (Domains) or live skills.sh search (Untraced). /slices <query> opens with a search.",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/slices needs the interactive terminal UI", "error");
        return;
      }
      const details = new DetailCache(deps);
      let catalogue: Catalogue | undefined;
      let catalogueError: string | undefined;
      try {
        catalogue = await deps.catalogue.catalogue();
      } catch (error) {
        catalogueError = error instanceof Error ? error.message : String(error);
      }
      const pool = buildPool(catalogue, deps.slice.served(), deps, details);
      const before = new Set(deps.slice.served().map((skill) => skill.id));
      const result = await ctx.ui.custom<PickerResult | null>(
        (tui, theme, keybindings, done) =>
          new SlicesPicker([...pool.values()].map((entry) => entry.skill), theme, tui, keybindings, done, {
            domainSummaries: catalogue?.domains,
            catalogueError,
            initialQuery: args.trim(),
            searchSkillsSh: async (query) => {
              const items = await deps.skillsSh.search(query);
              return items.map((item) => {
                const existing = pool.get(item.id);
                if (existing) return existing.skill;
                const entry = untracedEntry(item, deps);
                pool.set(item.id, entry);
                return entry.skill;
              });
            },
          }),
      );
      if (result === null) {
        ctx.ui.notify("pi-sliced: cancelled; the Slice is unchanged.", "info");
        return;
      }
      const report = await applySelection(deps, pool, before, result, details);
      if (!report.served.length && !report.unserved.length && !report.failed.length) return;
      ctx.ui.notify(reportText(report, deps.slice.served().length), report.failed.length ? "warning" : "info");
    },
  });
}
