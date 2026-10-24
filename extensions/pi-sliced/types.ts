// Wire and in-process contract shared by the Author's server (server/), the serve core, and the Picker.

/** Kinds of Outside requirement recorded in a Trace (`pi-sliced.trace/1`). */
export type OutsideKind = "cli" | "package" | "network" | "credential" | "mcp-server";

/** Outside requirement kinds that make a skill Heavy (GLOSSARY.md, Heavy). */
export const HEAVY_OUTSIDE_KINDS: readonly OutsideKind[] = ["cli", "package", "credential", "mcp-server"];

/** Total traced bytes above which a skill is Heavy (GLOSSARY.md, Heavy). */
export const HEAVY_BYTES = 1_048_576;

/**
 * Marker keys: the 13 Classification markers of `classify-1` (docs/contracts/classification.md),
 * plus `untraced`, which belongs only to Skills.sh branch items.
 */
export type Marker =
  | "runs-commands"
  | "installs-packages"
  | "network"
  | "credentials"
  | "mcp-server"
  | "chain-loads"
  | "stub"
  | "checkout-scripts"
  | "persistent-writes"
  | "unpinned-code"
  | "opaque-code"
  | "sends-credentials"
  | "agent-override-text"
  | "untraced";

/** A marker with the Classification's reasons, shown on request in Inspect. */
export interface MarkerEntry {
  marker: Marker;
  because: string[];
}

export interface Footprint {
  /** Traced files and their total bytes. */
  files: number;
  bytes: number;
  /** Traced files outside the skill's own folder. */
  outsideFolder: { files: number; bytes: number };
  /** Outside requirements, one per distinct (kind, name). */
  outside: Array<{ kind: OutsideKind; name: string }>;
  /** Classification `footprint.summary`: the full one-line Footprint (Inspect's compact block). */
  summary: string;
  /** Classification `footprint.short`: counts only, for the listing row. */
  short: string;
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
  /** Classification `heavy.because`. */
  heavyBecause: string[];
  /** Classification markers, in its fixed order; only those that apply. */
  markers: MarkerEntry[];
  /** Classification `security` signals by kind, passed through for Inspect details. */
  security: Record<string, unknown>;
  /** Classification `companions`, passed through for Inspect details. */
  companions: { named: unknown[]; pulled: unknown[] };
  /** Repo path of the Classification this listing was built from. */
  classification: string;
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
