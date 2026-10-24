// Wire and in-process contract shared by the Author's server (server/), the serve core, and the Picker.

/** Kinds of Outside requirement recorded in a Trace (`pi-sliced.trace/1`). */
export type OutsideKind = "cli" | "package" | "network" | "credential" | "mcp-server";

/** Outside requirement kinds that make a skill Heavy (GLOSSARY.md, Heavy). */
export const HEAVY_OUTSIDE_KINDS: readonly OutsideKind[] = ["cli", "package", "credential", "mcp-server"];

/** Total traced bytes above which a skill is Heavy (GLOSSARY.md, Heavy). */
export const HEAVY_BYTES = 1_048_576;

/**
 * Marker keys shown as glyphs in the Picker (docs/trace/next-notes.md, Markers).
 * Until the Classification contract arrives, only the Trace-derivable ones are emitted.
 */
export type Marker =
  | "shell" // runs shell commands or CLIs
  | "packages" // installs packages
  | "network" // network fetches
  | "credentials" // needs credentials
  | "mcp" // MCP server
  | "chain" // chain-loads: pulls sibling skills, or fetches more skills/code at run time
  | "stub" // thin router or wrapper whose content lives elsewhere
  | "checkout" // checkout-only scripts
  | "persistent" // persistent side effects (writes outside the session)
  | "remote-code" // fetches unpinned remote code
  | "opaque" // minified bundles, binaries, encoded blobs
  | "untraced"; // Skills.sh branch item

export interface Footprint {
  /** Traced files and their total bytes. */
  files: number;
  bytes: number;
  /** Traced files outside the skill's own folder. */
  outsideFolder: { files: number; bytes: number };
  /** Outside requirements, one per distinct (kind, name). */
  outside: Array<{ kind: OutsideKind; name: string }>;
}

/** One Catalogue skill as listed by the Author's server. */
export interface Listing {
  /** `<owner>/<repo>/<name>` */
  id: string;
  /** Frontmatter `name` of its SKILL.md. */
  name: string;
  /** Frontmatter `description` of its SKILL.md, exactly. */
  description: string;
  /** Human listing text: the problem it solves and the occasion. Never "Use this when…". */
  summary: string;
  domain: string;
  /** `<owner>/<repo>` */
  source: string;
  /** Git commit SHA the Trace was taken at and the files are served at. */
  revision: string;
  /** The skill's own folder, repo-relative. */
  skillPath: string;
  footprint: Footprint;
  heavy: boolean;
  markers: Marker[];
}

export interface Catalogue {
  format: "pi-sliced.catalogue/1";
  name: string;
  /** Domain → one-line human summary. */
  domains: Record<string, string>;
  skills: Listing[];
}

export interface DetailFile {
  /** Repo-relative path. */
  path: string;
  size: number;
  /** Git blob SHA-1 at the Revision. */
  blob: string;
  /** Git tree mode at the Revision, e.g. "100644" or "100755". */
  mode: string;
}

/** A Listing plus everything needed to Serve and Inspect it, fixed at one Revision. */
export interface Detail extends Listing {
  format: "pi-sliced.detail/1";
  files: DetailFile[];
  /** The skill's SKILL.md, verbatim. */
  skillMd: string;
}

/** A Skills.sh branch item (Untraced): no Trace, Footprint unknown. */
export interface UntracedItem {
  /** skills.sh id, e.g. `<owner>/<repo>/<name>`. */
  id: string;
  name: string;
  source: string;
}

export type ServedKind = "catalogue" | "untraced";

export interface ServedSkill {
  id: string;
  kind: ServedKind;
  /** Frontmatter name, as listed to the agent. */
  name: string;
  description: string;
  /** Catalogue skills only. */
  revision?: string;
  /** Absolute path of its SKILL.md in the session dir. */
  skillMdPath: string;
}

/** The serve core's surface, used by the Picker wiring. Only the user's actions call serve*. */
export interface SliceApi {
  served(): readonly ServedSkill[];
  serveCatalogue(detail: Detail): Promise<ServedSkill>;
  serveUntraced(item: UntracedItem): Promise<ServedSkill>;
  unserve(id: string): void;
}

export interface CatalogueApi {
  catalogue(): Promise<Catalogue>;
  detail(id: string, revision: string): Promise<Detail>;
}

export interface SkillsShApi {
  search(query: string): Promise<UntracedItem[]>;
  /** SKILL.md text of an Untraced item, for Inspect. */
  skillMd(item: UntracedItem): Promise<string>;
}

/** What `registerPicker(pi, deps)` in picker-wiring.ts receives from index.ts. */
export interface PickerDeps {
  catalogue: CatalogueApi;
  skillsSh: SkillsShApi;
  slice: SliceApi;
}
