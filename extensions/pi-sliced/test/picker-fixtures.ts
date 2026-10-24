// Fake deps and a fixture Catalogue for the Picker tests.
import type { Catalogue, Detail, Listing, PickerDeps, ServedSkill, UntracedItem } from "../types.ts";

const listing = (over: Partial<Listing> & Pick<Listing, "id" | "domain">): Listing => {
  const [owner, repo, name] = over.id.split("/");
  return {
    name,
    description: `${name} frontmatter description.`,
    summary: `${name} summary`,
    source: `${owner}/${repo}`,
    revision: "dbd4588f9e1033efb41dad4bef2f7947c8993d44",
    skillPath: `skills/${name}`,
    footprint: { files: 1, bytes: 2048, outsideFolder: { files: 0, bytes: 0 }, outside: [], summary: "1 file, 2.0 KiB", short: "2.0 KiB" },
    heavy: false,
    heavyBecause: [],
    markers: [],
    security: {},
    companions: { named: [], pulled: [] },
    classification: `classifications/${over.id}/x.json`,
    ...over,
  };
};

export const CANVAS = listing({
  id: "anthropics/skills/canvas-design",
  domain: "Visual Art & Print",
  description: "Create beautiful visual art in .png and .pdf documents using design philosophy.",
  summary: "Original posters and visual art as PNG or PDF, when a piece needs a designed look",
  footprint: { files: 83, bytes: 5_554_003, outsideFolder: { files: 0, bytes: 0 }, outside: [], summary: "83 files, 5.3 MiB · 54 fonts", short: "5.3 MiB" },
  heavy: true,
  heavyBecause: ["files total 5.3 MiB (> 1 MiB)"],
});

export const TDD = listing({
  id: "mattpocock/skills/tdd",
  domain: "Craft & Workflow",
  summary: "Red-green-refactor loop for a feature or bug fix",
  footprint: { files: 3, bytes: 9_216, outsideFolder: { files: 0, bytes: 0 }, outside: [], summary: "3 files, 9 KiB", short: "9 KiB" },
});

export const SHADCN = listing({
  id: "shadcn-ui/ui/shadcn",
  domain: "Frontend UI",
  summary: "Add and theme shadcn/ui components in a React app",
  footprint: {
    files: 16,
    bytes: 139_387,
    outsideFolder: { files: 0, bytes: 0 },
    outside: [{ kind: "cli", name: "shadcn" }, { kind: "cli", name: "tsc" }, { kind: "package", name: "date-fns" }, { kind: "network", name: "ui.shadcn.com" }],
    summary: "16 files, 136 KiB · CLI shadcn, tsc · packages date-fns · 1 host",
    short: "136 KiB · 2 CLI · 1 pkg · 1 host",
  },
  heavy: true,
  heavyBecause: ["1 package to install", "2 CLIs"],
  markers: [
    { marker: "runs-commands", because: ["runs shadcn", "runs tsc"] },
    { marker: "installs-packages", because: ["installs date-fns"] },
    { marker: "network", because: ["fetches ui.shadcn.com"] },
    { marker: "unpinned-code", because: ["npx shadcn@latest: skills/shadcn/SKILL.md:12", "install @latest: skills/shadcn/cli.md:5"] },
  ],
  security: { "fetch-run": ["npx shadcn@latest @ skills/shadcn/SKILL.md:12", "install @latest @ skills/shadcn/cli.md:5"] },
});

export const GAME = listing({
  id: "openai/plugins/game-ui-frontend",
  domain: "Frontend UI",
  summary: "Use this when building a game HUD in the browser",
  skillPath: "plugins/game-studio/skills/game-ui-frontend",
  footprint: { files: 17, bytes: 210_000, outsideFolder: { files: 4, bytes: 30_000 }, outside: [], summary: "17 files, 205 KiB · +1 other skill · 4 repo files", short: "205 KiB · +1 skill" },
  markers: [{ marker: "chain-loads", because: ["pulls plugins/game-studio/skills/web-game-foundations"] }],
  companions: { named: [{ name: "web-game-foundations", path: "plugins/game-studio/skills/web-game-foundations" }], pulled: [{ path: "plugins/game-studio/skills/web-game-foundations", files: 1, bytes: 4_000 }] },
});

export const LISTINGS = [CANVAS, TDD, SHADCN, GAME];

export const CATALOGUE: Catalogue = {
  format: "pi-sliced.catalogue/1",
  name: "test",
  domains: {
    "Visual Art & Print": "Posters, prints and visual pieces",
    "Craft & Workflow": "How the work itself is done",
    "Frontend UI": "Interfaces in the browser",
  },
  skills: LISTINGS,
};

export const SKILLS_SH: UntracedItem[] = [
  { id: "anthropics/skills/canvas-design", name: "canvas-design", source: "anthropics/skills" },
  { id: "someone/art-skills/canvas-poster", name: "canvas-poster", source: "someone/art-skills" },
];

export function longSkillMd(name: string, lines = 300): string {
  const body = Array.from({ length: lines }, (_, i) => `Body line ${i + 1} of ${name}.`);
  return ["---", `name: ${name}`, `description: ${name} frontmatter description.`, "---", "", `# ${name}`, "", ...body, ""].join("\n");
}

export function detailOf(item: Listing, skillMd = longSkillMd(item.name)): Detail {
  return {
    ...item,
    format: "pi-sliced.detail/1",
    skillMd,
    files: [
      { path: `${item.skillPath}/SKILL.md`, size: skillMd.length, blob: "0".repeat(40), mode: "100644" },
      ...(item.footprint.outsideFolder.files ? [{ path: "plugins/game-studio/references/frontend-prompts.md", size: 30_000, blob: "1".repeat(40), mode: "100644" }] : []),
    ],
  };
}

export interface FakeDeps extends PickerDeps {
  calls: string[];
  servedList: ServedSkill[];
}

export function fakeDeps(opts: { skillMd?: string; searchResults?: UntracedItem[] } = {}): FakeDeps {
  const calls: string[] = [];
  const servedList: ServedSkill[] = [];
  return {
    calls,
    servedList,
    catalogue: {
      catalogue: async () => CATALOGUE,
      detail: async (id, revision) => {
        calls.push(`detail ${id}@${revision}`);
        const item = LISTINGS.find((l) => l.id === id);
        if (!item) throw new Error(`no ${id}`);
        return detailOf(item, opts.skillMd);
      },
    },
    skillsSh: {
      search: async (query) => {
        calls.push(`search ${query}`);
        return (opts.searchResults ?? SKILLS_SH).filter((item) => item.id.includes(query));
      },
      skillMd: async (item) => {
        calls.push(`skillMd ${item.id}`);
        return longSkillMd(item.name, 20);
      },
    },
    slice: {
      served: () => servedList,
      serveCatalogue: async (detail) => {
        calls.push(`serveCatalogue ${detail.id}@${detail.revision}`);
        const skill: ServedSkill = { id: detail.id, kind: "catalogue", name: detail.name, description: detail.description, revision: detail.revision, skillMdPath: `/tmp/x/${detail.skillPath}/SKILL.md` };
        servedList.push(skill);
        return skill;
      },
      serveUntraced: async (item) => {
        calls.push(`serveUntraced ${item.id}`);
        const skill: ServedSkill = { id: item.id, kind: "untraced", name: item.name, description: "", skillMdPath: "/tmp/x/SKILL.md" };
        servedList.push(skill);
        return skill;
      },
      unserve: (id) => {
        calls.push(`unserve ${id}`);
        const index = servedList.findIndex((s) => s.id === id);
        if (index >= 0) servedList.splice(index, 1);
      },
    },
  };
}
