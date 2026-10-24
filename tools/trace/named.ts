// Bare-name references to other skills in the same repository (ruling F2): not
// part of the file set, recorded so the Footprint can say a skill expects company.
import { posix } from "node:path";
import type { Repo } from "./git.ts";

export interface NamedSkill {
  name: string;
  path: string; // the named skill's folder
  from: string;
  line: number;
  text: string;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function namedSkills(repo: Repo, folders: string[], skillPath: string, texts: Map<string, string>): NamedSkill[] {
  // Names are folder basenames that identify exactly one skill folder.
  const byName = new Map<string, string[]>();
  for (const f of folders) if (f !== ".") byName.set(posix.basename(f), [...(byName.get(posix.basename(f)) ?? []), f]);
  const own = posix.basename(skillPath);
  const found = new Map<string, NamedSkill>();
  for (const [from, text] of [...texts].sort(([a], [b]) => a.localeCompare(b))) {
    if (!/\.(?:md|mdx|mdc|txt)$/i.test(from)) continue;
    text.split("\n").forEach((line, i) => {
      for (const [name, paths] of byName) {
        if (!line.includes(name)) continue;
        if (name === own || paths.length !== 1) continue;
        const n = escape(name);
        // `name`, `/name`, "the name skill", "`name` skill".
        const re = new RegExp(`\`/?${n}\`|\\bthe\\s+${n}\\s+skill\\b|(?<![\\w/-])/${n}(?![\\w/-])`, "i");
        if (re.test(line)) found.set(`${name}\0${from}\0${i}`, { name, path: paths[0], from, line: i + 1, text: line.trim().slice(0, 400) });
      }
    });
  }
  // Every reference, with its line: Classification later derives a skill's companions from these.
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.from.localeCompare(b.from) || a.line - b.line);
}
