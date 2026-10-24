// What the agent sees of the Slice: one prompt section and one tool, both empty-Slice silent.
//
// pi-sliced never advertises the Author's server or its routes to the agent: the section and the tool
// definition name no URL, so no catalogue route reaches its context. The licence URL in toolText's load
// header is the only server URL the agent sees, and only for a skill it loads from the Slice.

import { readFileSync } from "node:fs";
import { licenceUrl } from "./author-client.ts";
import type { ServedEntry } from "./slice.ts";

export const SECTION = "served_skills";
export const TOOL = "served_skill";

export const TOOL_DESCRIPTION =
  "Load the SKILL.md of a skill the user served for this session, by its name as listed in served_skills.";

export const PREAMBLE =
  `The user served these skills for this session. Before using one, call ${TOOL} with its name to read its SKILL.md.`;

/**
 * The name each Served skill is listed under. A frontmatter name shared by several Served skills
 * is replaced by each one's id, so every listed name is unique whatever the serve order.
 */
export function agentNames(entries: readonly ServedEntry[]): Map<string, ServedEntry> {
  const count = new Map<string, number>();
  for (const e of entries) count.set(e.name, (count.get(e.name) ?? 0) + 1);
  const byName = new Map<string, ServedEntry>();
  for (const e of entries) byName.set(count.get(e.name)! > 1 || e.name === "" ? e.id : e.name, e);
  return byName;
}

/** The served_skills section, or undefined for an empty Slice. */
export function sectionText(entries: readonly ServedEntry[]): string | undefined {
  if (entries.length === 0) return undefined;
  const lines = [...agentNames(entries)].map(([name, e]) => `- ${name}: ${e.description}`);
  return [PREAMBLE, ...lines].join("\n");
}

export function unknownSkill(name: string): string {
  return `No served skill is named "${name}".`;
}

/** One line, so the header never holds the blank line that separates it from SKILL.md. */
const oneLine = (s: string, max = 200): string => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/**
 * The licence line of a load header. Kept out of the served_skills section, so a Served skill the
 * agent has not loaded costs nothing for it (proof 7). The URL is `<server><route>`: the only
 * Author's server URL the agent ever sees.
 */
export function licenceLine(entry: ServedEntry, server: string): string {
  if (entry.kind === "untraced") return "Licence: unknown (Untraced).";
  const ref = entry.licence;
  if (!ref) return "Licence: none was found in its source.";
  const url = licenceUrl(server, ref.route);
  const parts = [oneLine(ref.spdx ?? "unrecognised licence"), ref.copyright ? oneLine(ref.copyright) : undefined];
  return `Licence: ${parts.filter(Boolean).join("; ")}.${url ? ` Full text: ${url}` : ""}`;
}

/** The served_skill tool's text for `name`: a short header, a blank line, then SKILL.md verbatim. */
export function toolText(entries: readonly ServedEntry[], name: string, server: string): string {
  const entry = agentNames(entries).get(name);
  if (!entry) return unknownSkill(name);
  const md = readFileSync(entry.skillMdPath, "utf8");
  return `Skill "${name}". Relative paths in its SKILL.md resolve against ${entry.skillDir}/\n${licenceLine(entry, server)}\n\n${md}`;
}
