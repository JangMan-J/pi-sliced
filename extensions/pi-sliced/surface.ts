// What the agent sees of the Slice: one prompt section and one tool, both empty-Slice silent.

import { readFileSync } from "node:fs";
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

/** The served_skill tool's text for `name`. */
export function toolText(entries: readonly ServedEntry[], name: string): string {
  const entry = agentNames(entries).get(name);
  if (!entry) return unknownSkill(name);
  const md = readFileSync(entry.skillMdPath, "utf8");
  return `Skill "${name}". Relative paths in its SKILL.md resolve against ${entry.skillDir}/\n\n${md}`;
}
