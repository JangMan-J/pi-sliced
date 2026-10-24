/**
 * The Picker: a collapsible tree with two top-level branches, Domains (the Catalogue, grouped by domain) and
 * Skills.sh (live skills.sh search, every item Untraced). Every branch starts collapsed; search reveals matches
 * without mutating the browsing expansion state.
 *
 * Vendored from the archive's `extensions/slices/checklist.ts` at 29610c7. Changed: the Domains and Skills.sh
 * tabs are two top-level tree branches. Removed: pinning, local slices, popularity ordering and counts, and the
 * Platform/Portfolio views. Added: Footprint and marker columns, the Heavy confirm, the selection status line,
 * the marker legend, and a body-first Inspect with the licence one key away.
 *
 * Author text (GLOSSARY.md): text from a skill's files is shown verbatim and visibly as the author's. Whole
 * files (SKILL.md, licence texts) and the frontmatter description sit behind a `│` gutter; names, paths and
 * excerpts inside the Picker's own lines are quoted (markers.ts `quote`). Everything else is the Picker's text.
 */

import {
  hyperlink,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type KeybindingsManager,
  type TUI,
} from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  MARKERS,
  UNTRACED_FOOTPRINT,
  formatBytes,
  footprintLine,
  footprintRow,
  glyphOf,
  heavyConfirmLine,
  heavyReasons,
  isRisky,
  outsideKindLabel,
  quote,
  reasonText,
  securityLabel,
  shortOf,
  signalText,
  sortMarkers,
  unionMarkers,
} from "./markers.ts";
import type { DetailFile, Footprint, LicenceRef, LicenceText, Marker, MarkerEntry } from "./types.ts";

/** What Inspect shows once loaded: the SKILL.md verbatim and, for Catalogue skills, its traced files. */
export interface InspectContent {
  skillMd: string;
  files?: DetailFile[];
}

export interface PickerSkill {
  /** `<owner>/<repo>/<name>` */
  id: string;
  /** Frontmatter name. */
  name: string;
  /** Verbatim frontmatter description. */
  description?: string;
  /** Human listing text: the problem it solves and the occasion. */
  summary?: string;
  /** Repository owner. */
  author?: string;
  /** `<owner>/<repo>` */
  source?: string;
  /** Clickable source for Inspect. */
  sourceUrl?: string;
  domain?: string;
  /** A Skills.sh branch item: no Trace, Footprint unknown. */
  untraced?: boolean;
  /** Catalogue skills: the Revision listed, inspected and served. */
  revision?: string;
  /** Catalogue skills: the skill's own folder, repo-relative. */
  skillPath?: string;
  /** Catalogue skills only. */
  footprint?: Footprint;
  heavy?: boolean;
  /** Classification `heavy.because`, shown in the Picker's wording. */
  heavyBecause?: string[];
  markers?: Marker[];
  /** Classification markers with their reasons, for Inspect details. */
  markerEntries?: MarkerEntry[];
  /** Classification security signals by kind, for Inspect details. */
  security?: Record<string, unknown>;
  /** Classification companions, for Inspect details. */
  companions?: { named: unknown[]; pulled: unknown[] };
  /** Catalogue skills: the source's governing licence at the Revision; null when none was found. */
  licence?: LicenceRef | null;
  /** Selected when the Picker opens (already Served). */
  checked?: boolean;
  loadInspect?: () => Promise<InspectContent>;
  /** Catalogue skills with a licence: its full text, for Inspect's licence view. */
  loadLicence?: () => Promise<LicenceText>;
}

/** The left gutter that marks a line of Author text: a whole file or the frontmatter description, verbatim. */
export const AUTHOR_GUTTER = "│";

/** One Inspect body line before wrapping: the Picker's own text, or a line of Author text (drawn behind the gutter). */
interface BodyLine {
  text: string;
  author?: boolean;
}

/** Wraps one of the Picker's own lines so every quoted name opens and closes on the same line. */
function wrapQuoted(text: string, width: number): string[] {
  const lines = wrapTextWithAnsi(text, Math.max(1, width - 2));
  for (let i = 0; i + 1 < lines.length; i++) {
    if ((lines[i].match(/`/g) ?? []).length % 2 === 1) {
      lines[i] += "`";
      lines[i + 1] = "`" + lines[i + 1];
    }
  }
  return lines;
}

/** The compact licence line of Inspect: SPDX id and copyright line (quoted, the author's), or why there is none. */
export function licenceLine(skill: Pick<PickerSkill, "untraced" | "licence">): string {
  if (skill.untraced) return "unknown: Untraced";
  if (skill.licence === undefined) return "not listed";
  if (skill.licence === null) return "No licence found";
  const { spdx, copyright, path } = skill.licence;
  const id = spdx ?? `unrecognised licence in ${quote(path)}`;
  return copyright ? `${id} · “${copyright}”` : id;
}

export interface PickerResult {
  /** Ids the user left selected: the Slice to serve. */
  served: string[];
}

export interface PickerOptions {
  /** One-line human summaries of the Catalogue's domains. */
  domainSummaries?: Record<string, string>;
  /** Live skills.sh search for the Skills.sh branch (queries of 2 or more characters). */
  searchSkillsSh?: (query: string) => Promise<PickerSkill[]>;
  /** Why the Catalogue could not be listed, shown inside the Domains branch. */
  catalogueError?: string;
  /** Search text the Picker opens with (`/slices <query>`). */
  initialQuery?: string;
}

type RootId = "domains" | "skills.sh";
const ROOT_LABELS: Record<RootId, string> = { domains: "Domains", "skills.sh": "Skills.sh" };
const ROOT_SUMMARIES: Record<RootId, string> = {
  domains: "The Catalogue: traced skills at fixed Revisions, by occasion",
  "skills.sh": "Live skills.sh search · Untraced, Footprint unknown",
};
export const MAX_ROWS = 12;
const TITLE = "Select Skills";
/** Hard cap on the label column (pointer + indent + marker + name) so one long slug never moves the detail columns. */
const LABEL_COL_MAX = 40;
const LABEL_COL_MIN = 14;
/** Label room kept for Skills.sh names that arrive after the Picker opens. */
const LABEL_COL_RESERVED = 34;
/** Detail column is shown only when at least this many cells remain for it. */
const DETAIL_MIN = 12;
const FOOTPRINT_COL_MAX = 30;
const SKILL_PREFIX = 7;
const GROUP_PREFIX = 8;
/** Rows of the Inspect area under the title and above the position line: header, Footprint, rule, body. */
const INSPECT_ROWS = MAX_ROWS + 1;

interface SkillNode {
  kind: "skill";
  key: string;
  skill: PickerSkill;
}

interface GroupNode {
  kind: "group";
  key: string;
  label: string;
  root?: RootId;
  skills: PickerSkill[];
  children: TreeNode[];
  summary: string;
  markers: Marker[];
}

interface InfoNode {
  kind: "info";
  key: string;
  text: string;
}

type TreeNode = SkillNode | GroupNode;

interface TreeRow {
  node: TreeNode | InfoNode;
  depth: number;
  parentKey?: string;
  /** Matching descendants, for group counts during search. */
  skills: PickerSkill[];
}

const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "vs", "cf", "approx", "inc", "no"]);

/**
 * Non-destructively extracts a human-readable lead clause from a verbatim
 * SKILL.md description at render time. Guaranteed to return a prefix of the
 * whitespace-normalized description (minus trailing punctuation).
 */
export function leadClause(rawDescription: string): string {
  if (!rawDescription) return "";
  const lines = rawDescription.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const base = (lines.length > 1 && lines[0].length >= 20 ? lines[0] : lines.join(" ")).replace(/\s+/g, " ").trim();
  if (!base) return "";

  const triggerPrefix = base.match(
    /^(?:use\s+(?:this\s+skill\s+|this\s+|it\s+)?(?:when|whenever|to|for|if|before|after)\s+|trigger(?:s|ed)?\s+(?:when|on)\s+|load\s+(?:this\s+)?when\s+|activate(?:s)?\s+when\s+|invoke\s+when\s+)/i,
  );
  if (triggerPrefix) {
    const rest = base.slice(triggerPrefix[0].length);
    return (rest.charAt(0).toUpperCase() + rest.slice(1)).replace(/[.;,]+$/, "").trim() || base;
  }

  const startsWithTrigger =
    /^(?:use\s+(?:when|this|for|it|if|to)|trigger(?:s|ed)?(?:\s+when|:)|load\s+(?:this|when)|activate(?:s)?\s+when|appl(?:y|ies)\s+when|invoke\s+when)\b/i.test(
      base,
    );

  const findBoundary = (minIndex: number): number => {
    const candidates: number[] = [];
    const sentenceRegex = /[.!?](?=\s|$)/g;
    let m: RegExpExecArray | null;
    while ((m = sentenceRegex.exec(base)) !== null) {
      const idx = m.index;
      if (idx < minIndex) continue;
      const before = base.slice(0, idx);
      const tokenMatch = before.match(/([A-Za-z0-9._-]+)$/);
      const token = tokenMatch ? tokenMatch[1] : "";
      const tokenLower = token.toLowerCase().replace(/\.$/, "");
      if (ABBREVIATIONS.has(tokenLower)) continue;
      if (/^[A-Z]$/.test(token)) continue;
      if (/^v\d+$/i.test(tokenLower)) continue;
      candidates.push(idx);
      break;
    }
    for (const sep of [" — ", " – ", " - ", ": ", " | "]) {
      let pos = base.indexOf(sep);
      while (pos !== -1 && pos < minIndex) pos = base.indexOf(sep, pos + 1);
      if (pos >= minIndex && pos <= 60) candidates.push(pos);
    }
    if (!startsWithTrigger) {
      const triggerRegex =
        /\b(?:use\s+(?:when|this|for|it|if|to)|trigger(?:s|ed)?(?:\s+when|:)|load\s+(?:this|when)|activate(?:s)?\s+when|appl(?:y|ies)\s+when|invoke\s+when)\b/gi;
      while ((m = triggerRegex.exec(base)) !== null) {
        if (m.index >= minIndex) {
          candidates.push(m.index);
          break;
        }
      }
    }
    return candidates.length > 0 ? Math.min(...candidates) : -1;
  };

  const cut = findBoundary(12);
  let out = cut >= 0 ? base.slice(0, cut) : base;
  out = out.replace(/(?:\s+and|\s*[—–\-]|[,;:.!?])+$/i, "").trim();
  if (out.length < 12 && cut >= 0 && cut + 1 < base.length) {
    const nextCut = findBoundary(cut + 1);
    out = (nextCut >= 0 ? base.slice(0, nextCut) : base).replace(/(?:\s+and|\s*[—–\-]|[,;:.!?])+$/i, "").trim();
  }
  return out || base;
}

/** Listing text for a row: the human summary, never a "Use this when…" trigger preamble. */
export function rowSummary(skill: Pick<PickerSkill, "summary" | "description">): string {
  const summary = skill.summary?.trim();
  if (summary) return /^(?:use\s|trigger|load\s+(?:this|when)|activate|invoke\s+when)/i.test(summary) ? leadClause(summary) : summary;
  return leadClause(skill.description ?? "");
}

function subsequenceMatch(token: string, term: string): boolean {
  const haystack = token.toLowerCase();
  let index = 0;
  for (const char of term) {
    index = haystack.indexOf(char, index);
    if (index === -1) return false;
    index++;
  }
  return true;
}

const DANGLING_TAIL_WORDS = new Set([
  "a", "an", "the", "and", "or", "with", "for", "to", "in", "of", "on", "by", "from", "at", "as", "into", "via",
  "across", "over", "plus", "under", "between", "without", "using", "spanning",
]);

const CLAUSE_SEPS = [
  " — ", " – ", " - ", "; ", ", and ", ", or ", ", plus ", ", with ", ", including ", " with ", " for ", " in ",
  " via ", " using ", " across ", " through ", " plus ", " under ", " over ", " between ", " without ",
  " spanning ", " from ", " on ", " at ", " into ", " by ", ", ",
];

function isBalancedParens(str: string): boolean {
  let depth = 0;
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") {
      if (depth === 0) return false;
      depth--;
    }
  }
  return depth === 0;
}

/** Truncate detail text cleanly at a clause or word boundary without mid-word fragments. */
function fitDetail(detail: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (visibleWidth(detail) <= maxWidth) return detail;
  if (maxWidth <= 8) return truncateToWidth(detail, maxWidth, "…");

  const minClauseLen = Math.max(18, Math.floor(maxWidth * 0.52));
  let bestClause = "";
  for (const sep of CLAUSE_SEPS) {
    let pos = detail.lastIndexOf(sep, maxWidth);
    while (pos >= minClauseLen) {
      let candidate = detail.slice(0, pos).replace(/[,;:.!?\s—–\-&/]+$/g, "");
      while (true) {
        const match = candidate.match(/^(.*)\s+([A-Za-z0-9&-]+)$/);
        if (!match) break;
        const word = match[2].toLowerCase();
        if (!DANGLING_TAIL_WORDS.has(word) && word !== "&") break;
        if (visibleWidth(match[1]) < minClauseLen) break;
        candidate = match[1].replace(/[,;:.!?\s—–\-&/]+$/g, "");
      }
      const w = visibleWidth(candidate);
      if (w >= minClauseLen && w <= maxWidth && isBalancedParens(candidate)) {
        if (w > visibleWidth(bestClause)) bestClause = candidate;
        break;
      }
      pos = detail.lastIndexOf(sep, pos - 1);
    }
  }
  if (bestClause) return bestClause;

  const budget = maxWidth - 1;
  const raw = truncateToWidth(detail, budget, "");
  const minWordCut = Math.max(8, Math.floor(budget * 0.55));
  const lastSpace = raw.lastIndexOf(" ");
  let cut = lastSpace >= minWordCut ? raw.slice(0, lastSpace) : raw;
  cut = cut.replace(/[,;:.!?\s—–\-&/]+$/g, "");
  while (true) {
    const match = cut.match(/^(.*)\s+([A-Za-z0-9&-]+)$/);
    if (!match) break;
    const word = match[2].toLowerCase();
    if (!DANGLING_TAIL_WORDS.has(word) && word !== "&") break;
    if (visibleWidth(match[1]) < minWordCut) break;
    cut = match[1].replace(/[,;:.!?\s—–\-&/]+$/g, "");
  }
  return cut ? `${cut}…` : truncateToWidth(detail, maxWidth, "…");
}

/** One line for a passed-through Classification value (a companion): its name and path quoted, then its size. */
function describe(value: unknown): string {
  if (typeof value === "string") return quote(value);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const name = typeof v.name === "string" && v.name ? quote(v.name) : "";
    const path = typeof v.path === "string" && v.path ? quote(v.path) : "";
    const label = (name && path ? `${name} (${path})` : name || path) || quote(JSON.stringify(value));
    const size = typeof v.files === "number" ? ` (${v.files} ${v.files === 1 ? "file" : "files"}${typeof v.bytes === "number" ? `, ${formatBytes(v.bytes)}` : ""})` : "";
    return label + size;
  }
  return String(value);
}

/** Markers a row shows: the Listing's (with its Outside requirements) or `untraced`. */
export function skillMarkers(skill: PickerSkill): Marker[] {
  if (skill.untraced) return ["untraced"];
  return sortMarkers(skill.markers ?? []);
}

/** The status line text: the current selections, with the Untraced disclaimer first so it is never cut. */
export function statusText(selected: readonly PickerSkill[]): string {
  if (selected.length === 0) return "Nothing selected · the Slice is empty";
  const untraced = selected.filter((skill) => skill.untraced).length;
  const parts = [`Selected (${selected.length})`];
  if (untraced > 0) {
    parts.push(`includes ${untraced} Untraced ${untraced === 1 ? "item" : "items"}: Footprint unknown`);
  }
  parts.push(selected.map((skill) => skill.name).join(", "));
  return parts.join(" · ");
}

export class SlicesPicker {
  focused = false;

  private readonly catalogueIds: Set<string>;
  private readonly remoteSkills = new Map<string, PickerSkill>();
  /** Skills.sh ids returned for each loaded query. */
  private readonly remoteResults = new Map<string, Set<string>>();
  private remoteLoading = false;
  private remoteError: string | undefined;
  private remoteRequestId = 0;
  private roots: GroupNode[];
  private detailColumn: number;
  private markerWidth: number;
  private footprintWidth: number;
  private readonly expanded = new Set<string>();
  private readonly searchCollapsed = new Set<string>();
  private query = "";
  private typingQuery = false;
  private cursor = 0;
  private browseKey: string | undefined;
  private readonly served: Set<string>;
  private inspect: {
    skill: PickerSkill;
    content?: InspectContent;
    loading: boolean;
    error?: string;
    scroll: number;
    full: boolean;
    details: boolean;
    view: "skill" | "licence";
    licence?: LicenceText;
    licenceLoading: boolean;
    licenceError?: string;
    /** Body rows at the last render, for paging. */
    rows: number;
  } | null = null;
  private confirm: { add: PickerSkill[]; heavy: PickerSkill[] } | null = null;
  private legend = false;
  private readonly inspectCache = new Map<string, InspectContent>();
  private readonly licenceCache = new Map<string, LicenceText>();
  private removeInputInterceptor?: () => void;

  private readonly skills: PickerSkill[];
  private readonly theme: Theme;
  private readonly tui: TUI;
  private readonly done: (result: PickerResult | null) => void;
  private readonly options: PickerOptions;

  constructor(
    skills: PickerSkill[],
    theme: Theme,
    tui: TUI,
    _keybindings: KeybindingsManager | undefined,
    done: (result: PickerResult | null) => void,
    options: PickerOptions = {},
  ) {
    this.skills = skills;
    this.theme = theme;
    this.tui = tui;
    this.done = done;
    this.options = options;
    this.catalogueIds = new Set(skills.filter((skill) => !skill.untraced).map((skill) => skill.id.toLowerCase()));
    for (const skill of skills) if (skill.untraced) this.remoteSkills.set(skill.id, skill);
    this.served = new Set(skills.filter((skill) => skill.checked).map((skill) => skill.id));
    this.roots = this.buildTree();
    this.detailColumn = this.measureDetailColumn();
    this.markerWidth = this.measureMarkerWidth();
    this.footprintWidth = this.measureFootprintWidth();
    this.addInputInterceptor();
    if (options.initialQuery?.trim()) {
      this.typingQuery = true;
      this.changeQuery(options.initialQuery.trim());
    }
  }

  /**
   * Prepend a listener ahead of TuiAltScreen's viewport scroll handler so Ctrl+Up/Down and
   * PageUp/Down reach the picker instead of scrolling the background session transcript.
   */
  private addInputInterceptor(): void {
    const tuiAny = this.tui as unknown as {
      inputListeners?: Set<(data: string) => { consume?: boolean; data?: string } | undefined>;
      shouldDeferViewportInputToOverlay?: () => boolean;
      getFocusedComponent?: () => unknown;
      requestImmediateRender?: () => void;
    };
    const origDefer =
      typeof tuiAny?.shouldDeferViewportInputToOverlay === "function"
        ? tuiAny.shouldDeferViewportInputToOverlay.bind(tuiAny)
        : undefined;
    if (origDefer) {
      tuiAny.shouldDeferViewportInputToOverlay = () => tuiAny.getFocusedComponent?.() === this || origDefer();
    }
    const listeners = tuiAny?.inputListeners;
    let interceptor: ((data: string) => { consume?: boolean } | undefined) | undefined;
    if (listeners instanceof Set) {
      interceptor = (data: string): { consume?: boolean } | undefined => {
        if (
          matchesKey(data, "ctrl+up") ||
          matchesKey(data, "ctrl+down") ||
          matchesKey(data, "pageUp") ||
          matchesKey(data, "pageDown")
        ) {
          if (!/:3[~A-Za-z]$/.test(data)) {
            this.handleInput(data);
            tuiAny.requestImmediateRender?.();
          }
          return { consume: true };
        }
        return undefined;
      };
      const existing = [...listeners];
      listeners.clear();
      listeners.add(interceptor);
      for (const fn of existing) listeners.add(fn);
    }
    this.removeInputInterceptor = () => {
      if (origDefer) tuiAny.shouldDeferViewportInputToOverlay = origDefer;
      if (interceptor && listeners instanceof Set) listeners.delete(interceptor);
    };
  }

  dispose(): void {
    this.removeInputInterceptor?.();
    this.removeInputInterceptor = undefined;
  }

  private finish(result: PickerResult | null): void {
    this.dispose();
    this.done(result);
  }

  // ── tree ─────────────────────────────────────────────────────────────

  private authorOf(skill: PickerSkill): string {
    return skill.author || skill.source?.split("/")[0] || skill.id.split("/")[0] || "unknown";
  }

  private sourceOf(skill: PickerSkill): string {
    return skill.source || skill.id.split("/").slice(0, 2).join("/");
  }

  private domainOf(skill: PickerSkill): string {
    return skill.domain?.trim() || "Other";
  }

  private catalogueSkills(): PickerSkill[] {
    return this.skills.filter((skill) => !skill.untraced);
  }

  /** Skills.sh items, deduplicated against the Catalogue: a Catalogue skill appears once, as its listing. */
  private registrySkills(): PickerSkill[] {
    return [...this.remoteSkills.values()].filter((skill) => !this.catalogueIds.has(skill.id.toLowerCase()));
  }

  private allSkills(): PickerSkill[] {
    return [...this.catalogueSkills(), ...this.registrySkills()];
  }

  private triggerSkillsShFetch(): void {
    const fetcher = this.options.searchSkillsSh;
    if (!fetcher) return;
    const q = this.query.trim();
    if (q.length < 2) return;
    if (this.remoteResults.has(q)) return;
    const reqId = ++this.remoteRequestId;
    this.remoteLoading = true;
    this.remoteError = undefined;
    fetcher(q)
      .then((items) => {
        const ids = new Set<string>();
        for (const item of items) {
          const skill = { ...item, untraced: true };
          if (!this.remoteSkills.has(skill.id)) this.remoteSkills.set(skill.id, skill);
          ids.add(skill.id);
        }
        this.remoteResults.set(q, ids);
        if (reqId === this.remoteRequestId) {
          this.remoteLoading = false;
          this.roots = this.buildTree();
          this.clampCursor();
          this.tui.requestRender();
        }
      })
      .catch((error) => {
        if (reqId === this.remoteRequestId) {
          this.remoteLoading = false;
          this.remoteError = error instanceof Error ? error.message : String(error);
          this.tui.requestRender();
        }
      });
  }

  private buildTree(): GroupNode[] {
    const makeRoot = (root: RootId): GroupNode => ({
      kind: "group",
      key: `group:${JSON.stringify([root])}`,
      label: ROOT_LABELS[root],
      root,
      skills: [],
      children: [],
      summary: ROOT_SUMMARIES[root],
      markers: [],
    });
    const roots = [makeRoot("domains"), makeRoot("skills.sh")];
    const place = (root: GroupNode, rootId: RootId, skill: PickerSkill, labels: string[]) => {
      root.skills.push(skill);
      let children = root.children;
      for (let depth = 0; depth < labels.length; depth++) {
        const key = `group:${JSON.stringify([rootId, ...labels.slice(0, depth + 1)])}`;
        let group = children.find((node): node is GroupNode => node.kind === "group" && node.key === key);
        if (!group) {
          group = { kind: "group", key, label: labels[depth], skills: [], children: [], summary: "", markers: [] };
          children.push(group);
        }
        if (!group.skills.some((candidate) => candidate.id === skill.id)) group.skills.push(skill);
        children = group.children;
      }
      if (!children.some((node) => node.kind === "skill" && node.skill.id === skill.id)) {
        children.push({ kind: "skill", key: `skill:${JSON.stringify([rootId, ...labels, skill.id])}`, skill });
      }
    };
    for (const skill of this.catalogueSkills()) {
      place(roots[0], "domains", skill, [this.domainOf(skill), this.authorOf(skill), this.sourceOf(skill)]);
    }
    for (const skill of this.registrySkills()) {
      place(roots[1], "skills.sh", skill, [this.authorOf(skill), this.sourceOf(skill)]);
    }
    const domainSummaries = this.options.domainSummaries ?? {};
    // depth counts levels below a root branch: 0 = domain (Domains) or author (Skills.sh).
    const compact = (nodes: TreeNode[], rootId: RootId, depth: number): TreeNode[] =>
      nodes
        .map((node) => {
          if (node.kind === "skill") return node;
          if (rootId === "domains" && depth === 0) node.summary = domainSummaries[node.label] ?? "";
          node.children = compact(node.children, rootId, depth + 1);
          node.markers = unionMarkers(node.skills.map(skillMarkers));
          // Keep the named domain/author, but skip a source menu when it is the only choice.
          while (node.children.length === 1 && node.children[0].kind === "group") {
            node.children = node.children[0].children;
          }
          const keepGroup = depth === 0 || (rootId === "domains" && depth === 1);
          // A nested source menu for one skill adds no choice either.
          return !keepGroup && node.children.length === 1 ? node.children[0] : node;
        })
        // Alphabetical, the same for every source: never ordered by popularity.
        .sort((a, b) => {
          const labelA = a.kind === "group" ? a.label : a.skill.name;
          const labelB = b.kind === "group" ? b.label : b.skill.name;
          return labelA.localeCompare(labelB) || a.key.localeCompare(b.key);
        });
    for (const root of roots) {
      root.children = compact(root.children, root.root!, 0);
      root.markers = root.root === "skills.sh" ? ["untraced"] : unionMarkers(root.skills.map(skillMarkers));
    }
    return roots;
  }

  private measureDetailColumn(): number {
    let widest = visibleWidth(`  ${TITLE}`);
    const measure = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        const label = node.kind === "group" ? node.label : node.skill.name;
        const prefix = (node.kind === "group" ? GROUP_PREFIX : SKILL_PREFIX) + depth;
        widest = Math.max(widest, prefix + visibleWidth(label));
        if (node.kind === "group") measure(node.children, depth + 1);
      }
    };
    // Include folded and filtered-out rows so the column never jumps while browsing.
    measure(this.roots, 0);
    // Skills.sh rows arrive after opening; reserve room for their names so the column never jumps.
    return Math.min(Math.max(widest, LABEL_COL_RESERVED), LABEL_COL_MAX) + 2;
  }

  /** Widest marker set over every node, folded or not; Skills.sh always holds the Untraced glyph. */
  private measureMarkerWidth(): number {
    let widest = 1;
    const measure = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        widest = Math.max(widest, node.kind === "group" ? node.markers.length : skillMarkers(node.skill).length);
        if (node.kind === "group") measure(node.children);
      }
    };
    measure(this.roots);
    return widest;
  }

  private measureFootprintWidth(): number {
    let widest = visibleWidth(UNTRACED_FOOTPRINT);
    for (const skill of this.catalogueSkills()) {
      if (skill.footprint) widest = Math.max(widest, visibleWidth(footprintRow(skill.footprint)));
    }
    return Math.min(widest, FOOTPRINT_COL_MAX);
  }

  private isExpanded(key: string): boolean {
    return this.query.trim() ? !this.searchCollapsed.has(key) : this.expanded.has(key);
  }

  private setExpanded(key: string, expanded: boolean): void {
    if (this.query.trim()) {
      if (expanded) this.searchCollapsed.delete(key);
      else this.searchCollapsed.add(key);
    } else if (expanded) {
      this.expanded.add(key);
    } else {
      this.expanded.delete(key);
      const prefix = key.endsWith("]") ? `${key.slice(0, -1)},` : key;
      for (const item of [...this.expanded]) {
        if (item.startsWith(prefix)) this.expanded.delete(item);
      }
    }
  }

  private matchesSearch(skill: PickerSkill, query: string): boolean {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return true;
    const name = skill.name.toLowerCase();
    const author = this.authorOf(skill).toLowerCase();
    const fields = [
      name,
      skill.id.toLowerCase(),
      author,
      (skill.source ?? "").toLowerCase(),
      (skill.domain ?? "").toLowerCase(),
      (skill.summary ?? "").toLowerCase(),
      ...(query.trim().length >= 3 ? [(skill.description ?? "").toLowerCase()] : []),
    ];
    return terms.every((term) => {
      if (fields.some((field) => field.includes(term))) return true;
      if (term.length >= 4) {
        const collapsedTerm = term.replace(/[\s_-]+/g, "");
        if (collapsedTerm.length >= 4 && fields.some((field) => field.replace(/[\s_-]+/g, "").includes(collapsedTerm))) {
          return true;
        }
      }
      if (term.length <= 4) return subsequenceMatch(name, term) || subsequenceMatch(author, term);
      return false;
    });
  }

  private infoText(root: RootId): string {
    const query = this.query.trim();
    if (root === "domains") {
      if (this.options.catalogueError) return `Catalogue unavailable: ${this.options.catalogueError}`;
      return query ? `No Catalogue skills match "${query}"` : "No Catalogue skills";
    }
    if (this.remoteLoading) return "Searching skills.sh…";
    if (this.remoteError) return `skills.sh unavailable: ${this.remoteError}`;
    if (query.length < 2) return this.options.searchSkillsSh ? "Type to search skills.sh" : "skills.sh search is not available";
    return `No skills.sh results for "${query}" outside the Catalogue`;
  }

  private visibleRows(): TreeRow[] {
    const query = this.query.trim();
    const returned = this.remoteResults.get(query);
    const matching = new Set(
      this.allSkills()
        .filter((skill) => !query || this.matchesSearch(skill, query) || (skill.untraced && returned?.has(skill.id)))
        .map((skill) => skill.id),
    );
    const rows: TreeRow[] = [];
    const visit = (nodes: TreeNode[], depth: number, parentKey?: string) => {
      for (const node of nodes) {
        const skills =
          node.kind === "group"
            ? node.skills.filter((skill) => matching.has(skill.id))
            : matching.has(node.skill.id)
              ? [node.skill]
              : [];
        if (!skills.length) continue;
        rows.push({ node, depth, parentKey, skills });
        if (node.kind === "group" && this.isExpanded(node.key)) visit(node.children, depth + 1, node.key);
      }
    };
    for (const root of this.roots) {
      const skills = root.skills.filter((skill) => matching.has(skill.id));
      rows.push({ node: root, depth: 0, skills });
      if (!this.isExpanded(root.key)) continue;
      const before = rows.length;
      visit(root.children, 1, root.key);
      const searching = root.root === "skills.sh" && this.remoteLoading;
      if (rows.length === before || searching) {
        rows.push({ node: { kind: "info", key: `info:${root.root}`, text: this.infoText(root.root!) }, depth: 1, parentKey: root.key, skills: [] });
      }
    }
    return rows;
  }

  private clampCursor(): void {
    this.cursor = Math.max(0, Math.min(this.cursor, this.visibleRows().length - 1));
  }

  private changeQuery(query: string): void {
    if (!this.query.trim() && query.trim()) {
      this.browseKey = this.visibleRows()[this.cursor]?.node.key;
    }
    this.query = query;
    this.searchCollapsed.clear();
    this.cursor = 0;
    if (!query.trim() && this.browseKey) {
      this.cursor = Math.max(0, this.visibleRows().findIndex((row) => row.node.key === this.browseKey));
      this.browseKey = undefined;
    }
    this.triggerSkillsShFetch();
  }

  /** Tab moves between the two top-level branches. */
  private jumpBranch(): void {
    const rows = this.visibleRows();
    const roots = rows.map((row, index) => ({ row, index })).filter(({ row }) => row.depth === 0);
    const next = roots.find(({ index }) => index > this.cursor) ?? roots[0];
    if (next) this.cursor = next.index;
  }

  private collapseAll(): void {
    const rows = this.visibleRows();
    let rootRow = rows[this.cursor];
    while (rootRow?.parentKey) {
      const parent = rows.find((r) => r.node.key === rootRow!.parentKey);
      if (!parent) break;
      rootRow = parent;
    }
    const rootKey = rootRow?.node.key;
    this.typingQuery = false;
    this.expanded.clear();
    if (this.query.trim()) {
      const collectGroups = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          if (node.kind === "group") {
            this.searchCollapsed.add(node.key);
            collectGroups(node.children);
          }
        }
      };
      collectGroups(this.roots);
    }
    const nextRows = this.visibleRows();
    const nextIdx = rootKey ? nextRows.findIndex((r) => r.node.key === rootKey) : -1;
    this.cursor = nextIdx >= 0 ? nextIdx : 0;
  }

  // ── inspect ──────────────────────────────────────────────────────────

  private openInspect(skill: PickerSkill): void {
    const cached = this.inspectCache.get(skill.id);
    this.inspect = {
      skill,
      content: cached,
      loading: !cached && Boolean(skill.loadInspect),
      scroll: 0,
      full: true,
      details: false,
      view: "skill",
      licence: this.licenceCache.get(skill.id),
      licenceLoading: false,
      rows: INSPECT_ROWS - 2,
    };
    if (!cached && skill.loadInspect) this.fetchInspect(skill);
  }

  /** `l`: the licence view and back. The full text is fetched once, when first asked for. */
  private toggleLicence(): void {
    const inspect = this.inspect!;
    inspect.view = inspect.view === "licence" ? "skill" : "licence";
    inspect.scroll = 0;
    const { skill } = inspect;
    if (inspect.view !== "licence" || inspect.licence || inspect.licenceLoading || !skill.licence || !skill.loadLicence) return;
    inspect.licenceLoading = true;
    inspect.licenceError = undefined;
    skill
      .loadLicence()
      .then((text) => {
        this.licenceCache.set(skill.id, text);
        if (this.inspect?.skill === skill) {
          this.inspect.licence = text;
          this.inspect.licenceLoading = false;
          this.tui.requestRender();
        }
      })
      .catch((error) => {
        if (this.inspect?.skill === skill) {
          this.inspect.licenceError = error instanceof Error ? error.message : String(error);
          this.inspect.licenceLoading = false;
          this.tui.requestRender();
        }
      });
  }

  private fetchInspect(skill: PickerSkill): void {
    skill
      .loadInspect!()
      .then((content) => {
        this.inspectCache.set(skill.id, content);
        if (this.inspect?.skill === skill) {
          this.inspect.content = content;
          this.inspect.loading = false;
          this.tui.requestRender();
        }
      })
      .catch((error) => {
        if (this.inspect?.skill === skill) {
          this.inspect.error = error instanceof Error ? error.message : String(error);
          this.inspect.loading = false;
          this.tui.requestRender();
        }
      });
  }

  /** Details on request: why Heavy, each marker with its reasons, security signals, companions, Outside requirements, files outside its folder. */
  private detailLines(skill: PickerSkill, content?: InspectContent): string[] {
    if (skill.untraced) {
      return [
        "Untraced: skills.sh lists it, pi-sliced has no Trace of it, so what it pulls in is unknown.",
        "It is served as skills.sh shows it.",
      ];
    }
    const footprint = skill.footprint;
    if (!footprint) return ["Footprint not listed."];
    const lines: string[] = [];
    const heavy = heavyReasons(skill.heavyBecause);
    lines.push(skill.heavy ? `Heavy because: ${heavy.join("; ") || "listed as Heavy"}` : "Not Heavy");
    const entries = skill.markerEntries ?? [];
    lines.push(entries.length ? "Markers:" : "Markers: none");
    for (const entry of entries) {
      lines.push(`  ${glyphOf(entry.marker)} ${shortOf(entry.marker)}`);
      for (const reason of entry.because) lines.push(`      ${reasonText(entry.marker, reason)}`);
    }
    const security = Object.entries(skill.security ?? {});
    lines.push(security.length ? "Security signals:" : "Security signals: none");
    for (const [kind, signals] of security) {
      lines.push(`  ${securityLabel(kind)}`);
      for (const signal of Array.isArray(signals) ? signals : [signals]) {
        lines.push(`      ${typeof signal === "string" ? signalText(kind, signal) : describe(signal)}`);
      }
    }
    const named = skill.companions?.named ?? [];
    const pulled = skill.companions?.pulled ?? [];
    lines.push(named.length || pulled.length ? "Companions:" : "Companions: none");
    for (const item of named) lines.push(`  named by bare name: ${describe(item)}`);
    for (const item of pulled) lines.push(`  pulls in files of ${describe(item)}`);
    lines.push(footprint.outside.length ? "Outside requirements:" : "Outside requirements: none");
    const byKind = new Map<string, string[]>();
    for (const item of footprint.outside) byKind.set(item.kind, [...(byKind.get(item.kind) ?? []), item.name]);
    for (const [kind, names] of byKind) lines.push(`  ${outsideKindLabel(kind)}: ${names.map(quote).join(", ")}`);
    if (footprint.outsideFolder.files === 0) {
      lines.push(`Files outside its folder: none`);
    } else {
      lines.push(`Files outside its folder: ${footprint.outsideFolder.files} (${formatBytes(footprint.outsideFolder.bytes)})`);
      if (content?.files && skill.skillPath !== undefined) {
        const own = skill.skillPath ? `${skill.skillPath.replace(/\/$/, "")}/` : "";
        for (const file of content.files) {
          if (own && file.path.startsWith(own)) continue;
          lines.push(`  ${quote(file.path)} (${formatBytes(file.size)})`);
        }
      } else if (this.inspect?.loading) {
        lines.push("  Loading the file list…");
      }
    }
    return lines;
  }

  /** The body under the compact block: details on request, then the SKILL.md (or summary) or the licence view. */
  private bodyLines(): BodyLine[] {
    const inspect = this.inspect!;
    const { skill, content } = inspect;
    const own = (text: string): BodyLine => ({ text });
    const author = (text: string): BodyLine[] =>
      text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n").map((line) => ({ text: line, author: true }));
    const lines: BodyLine[] = [];
    if (inspect.details) lines.push(...this.detailLines(skill, content).map(own), own(""));
    if (inspect.view === "licence") {
      if (skill.untraced) lines.push(own("Untraced: no licence was looked for. See its source."));
      else if (skill.licence === undefined) lines.push(own("No licence is listed for this skill."));
      else if (skill.licence === null) lines.push(own("No licence found in its source at this Revision."));
      else if (inspect.licence) {
        for (const [index, file] of inspect.licence.files.entries()) {
          if (index > 0) lines.push(own(""));
          lines.push(own(quote(file.path)), ...author(file.text));
        }
      } else if (inspect.licenceLoading) lines.push(own("Loading the licence…"));
      else if (!skill.loadLicence) lines.push(own(`The licence text is not available here: ${quote(skill.licence.path)}`));
      if (inspect.licenceError) lines.push(own(""), own(`Licence unavailable: ${inspect.licenceError}`));
      return lines;
    }
    if (inspect.full && content) {
      lines.push(...author(content.skillMd));
    } else {
      const summary = rowSummary(skill);
      if (summary) lines.push(own(summary), own(""));
      if (skill.description) lines.push(...author(skill.description));
      else lines.push(own("No description listed."));
      if (inspect.full && inspect.loading) lines.push(own(""), own("Loading SKILL.md…"));
    }
    if (inspect.error) lines.push(own(""), own(`SKILL.md unavailable: ${inspect.error}`));
    return lines;
  }

  /** What the body shows, named in the rule above it. */
  private bodyTitle(): string {
    const inspect = this.inspect!;
    const what =
      inspect.view === "licence"
        ? "Licence, verbatim"
        : inspect.full && inspect.content
          ? "SKILL.md, verbatim"
          : "Summary · description, verbatim";
    return `${inspect.details ? "Details · " : ""}${what}`;
  }

  // ── input ────────────────────────────────────────────────────────────

  private result(): PickerResult {
    return { served: [...this.served] };
  }

  handleInput(data: string): void {
    if (matchesKey(data, "ctrl+c")) {
      this.finish(null);
      return;
    }
    if (this.confirm) {
      if (data === "y" || data === "Y" || matchesKey(data, "enter") || matchesKey(data, "return")) {
        for (const skill of this.confirm.add) this.served.add(skill.id);
        this.confirm = null;
      } else if (data === "n" || data === "N" || matchesKey(data, "escape") || matchesKey(data, "left")) {
        this.confirm = null;
      } else {
        return;
      }
      this.tui.requestRender();
      return;
    }
    if (this.legend) {
      if (data === "?" || matchesKey(data, "escape") || matchesKey(data, "left") || data === " ") {
        this.legend = false;
        this.tui.requestRender();
      }
      return;
    }
    if (matchesKey(data, "escape")) {
      if (this.inspect) {
        this.inspect = null;
        this.tui.requestRender();
        return;
      }
      this.finish(this.result());
      return;
    }
    if (matchesKey(data, "ctrl+s")) {
      this.finish(this.result());
      return;
    }
    const isServeKey = matchesKey(data, "enter") || matchesKey(data, "return");
    if (this.inspect) {
      const page = Math.max(1, this.inspect.rows - 1);
      if (matchesKey(data, "left") || data === " ") {
        this.inspect = null;
      } else if ((data === "f" || data === "F" || matchesKey(data, "tab")) && this.inspect.view === "skill") {
        this.inspect.full = !this.inspect.full;
        this.inspect.scroll = 0;
      } else if (data === "l" || data === "L") {
        this.toggleLicence();
      } else if (data === "d" || data === "D") {
        this.inspect.details = !this.inspect.details;
        this.inspect.scroll = 0;
      } else if (matchesKey(data, "up")) {
        this.inspect.scroll = Math.max(0, this.inspect.scroll - 1);
      } else if (matchesKey(data, "down")) {
        this.inspect.scroll += 1;
      } else if (matchesKey(data, "pageUp") || matchesKey(data, "ctrl+up")) {
        this.inspect.scroll = Math.max(0, this.inspect.scroll - page);
      } else if (matchesKey(data, "pageDown") || matchesKey(data, "ctrl+down")) {
        this.inspect.scroll += page;
      } else if (matchesKey(data, "home")) {
        this.inspect.scroll = 0;
      } else if (matchesKey(data, "end")) {
        this.inspect.scroll = Number.MAX_SAFE_INTEGER;
      } else if (isServeKey) {
        this.toggleServe(this.inspect.skill);
      } else {
        return;
      }
      this.tui.requestRender();
      return;
    }

    const rows = this.visibleRows();
    const current = rows[this.cursor];
    const node = current?.node;
    if (matchesKey(data, "tab")) {
      this.typingQuery = false;
      this.jumpBranch();
    } else if (matchesKey(data, "shift+tab")) {
      this.collapseAll();
    } else if (matchesKey(data, "up")) {
      this.typingQuery = false;
      if (rows.length) this.cursor = (this.cursor - 1 + rows.length) % rows.length;
    } else if (matchesKey(data, "down")) {
      this.typingQuery = false;
      if (rows.length) this.cursor = (this.cursor + 1) % rows.length;
    } else if (matchesKey(data, "ctrl+up") || matchesKey(data, "pageUp")) {
      this.typingQuery = false;
      if (rows.length) this.cursor = Math.max(0, this.cursor - MAX_ROWS);
    } else if (matchesKey(data, "ctrl+down") || matchesKey(data, "pageDown")) {
      this.typingQuery = false;
      if (rows.length) this.cursor = Math.min(rows.length - 1, this.cursor + MAX_ROWS);
    } else if (matchesKey(data, "right")) {
      this.typingQuery = false;
      if (node?.kind === "group") {
        if (this.isExpanded(node.key)) this.cursor++;
        else this.setExpanded(node.key, true);
      } else if (node?.kind === "skill") {
        this.openInspect(node.skill);
      }
    } else if (matchesKey(data, "left")) {
      this.typingQuery = false;
      if (node?.kind === "group" && this.isExpanded(node.key)) {
        this.setExpanded(node.key, false);
      } else if (current?.parentKey) {
        this.cursor = rows.findIndex((row) => row.node.key === current.parentKey);
      }
    } else if (data === " ") {
      if (this.typingQuery && this.query.length > 0 && !this.query.endsWith(" ")) {
        this.changeQuery(this.query + " ");
      } else {
        this.typingQuery = false;
        if (node?.kind === "group") this.setExpanded(node.key, !this.isExpanded(node.key));
        else if (node?.kind === "skill") this.openInspect(node.skill);
      }
    } else if (isServeKey) {
      if (node?.kind === "group") this.toggleGroupServe(current.skills);
      else if (node?.kind === "skill") this.toggleServe(node.skill);
    } else if (matchesKey(data, "backspace")) {
      const next = this.query.slice(0, -1);
      this.typingQuery = next.length > 0;
      this.changeQuery(next);
    } else if (data === "?" && !this.query) {
      this.legend = true;
    } else if (data.length === 1 && data >= "!" && data <= "~") {
      this.typingQuery = true;
      this.changeQuery(this.query + data);
    } else {
      return;
    }
    this.clampCursor();
    this.tui.requestRender();
  }

  /** Selecting a Heavy skill asks first; deselecting never does. */
  private select(skills: PickerSkill[]): void {
    const add = skills.filter((skill) => !this.served.has(skill.id));
    const heavy = add.filter((skill) => !skill.untraced && skill.heavy);
    if (heavy.length > 0) {
      this.confirm = { add, heavy };
      return;
    }
    for (const skill of add) this.served.add(skill.id);
  }

  private toggleServe(skill: PickerSkill): void {
    if (this.served.has(skill.id)) this.served.delete(skill.id);
    else this.select([skill]);
  }

  private toggleGroupServe(skills: PickerSkill[]): void {
    if (!skills.length) return;
    if (skills.every((skill) => this.served.has(skill.id))) {
      for (const skill of skills) this.served.delete(skill.id);
      return;
    }
    this.select(skills);
  }

  private selectedSkills(): PickerSkill[] {
    const byId = new Map(this.allSkills().map((skill) => [skill.id, skill]));
    for (const skill of this.remoteSkills.values()) if (!byId.has(skill.id)) byId.set(skill.id, skill);
    return [...this.served].map(
      (id) => byId.get(id) ?? { id, name: id.split("/").at(-1) || id },
    );
  }

  /** Group checkbox: [ ] none, [-] some, [x] all selected. */
  private groupMarkerFor(skills: PickerSkill[], isSelected = false): string {
    const open = this.theme.fg(isSelected ? "accent" : "muted", "[");
    const close = this.theme.fg(isSelected ? "accent" : "muted", "]");
    const active = skills.filter((skill) => this.served.has(skill.id)).length;
    if (active === 0) return isSelected ? this.theme.fg("accent", "[ ]") : this.theme.fg("dim", "[ ]");
    if (active < skills.length) return `${open}${this.theme.fg("accent", this.theme.bold("-"))}${close}`;
    return `${open}${this.theme.fg("success", this.theme.bold("x"))}${close}`;
  }

  private markerFor(skill: PickerSkill, isSelected = false): string {
    const open = this.theme.fg(isSelected ? "accent" : "muted", "[");
    const close = this.theme.fg(isSelected ? "accent" : "muted", "]");
    if (this.served.has(skill.id)) return `${open}${this.theme.fg("success", this.theme.bold("x"))}${close}`;
    return isSelected ? this.theme.fg("accent", "[ ]") : this.theme.fg("dim", "[ ]");
  }

  invalidate(): void {}

  // ── rendering ────────────────────────────────────────────────────────

  private glyphs(markers: Marker[]): string {
    return markers.map((marker) => this.theme.fg(isRisky(marker) ? "warning" : "muted", glyphOf(marker))).join("");
  }

  private highlightWords(text: string, baseColor?: "muted" | "dim"): string {
    const terms = new Set(
      this.query
        .toLowerCase()
        .split(/[\s/_-]+/)
        .filter((t) => t.length >= 2),
    );
    const wrapBase = (segment: string) => (!segment ? "" : baseColor ? this.theme.fg(baseColor, segment) : segment);
    if (terms.size === 0) return wrapBase(text);
    const wordRegex = /[A-Za-z0-9]+/g;
    let lastIndex = 0;
    let out = "";
    let matchedAny = false;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(text)) !== null) {
      const word = match[0];
      if (!terms.has(word.toLowerCase())) continue;
      matchedAny = true;
      if (match.index > lastIndex) out += wrapBase(text.slice(lastIndex, match.index));
      out += this.theme.fg("warning", this.theme.bold(word));
      lastIndex = match.index + word.length;
    }
    if (!matchedAny) return wrapBase(text);
    if (lastIndex < text.length) out += wrapBase(text.slice(lastIndex));
    return out;
  }

  /** Columns for this width: the label column gives way first so the Footprint is never shed. */
  private columns(width: number): { label: number; markers: number; footprint: number } {
    const markers = this.markerWidth + 1;
    const footprint = this.footprintWidth + 2;
    const label = Math.max(LABEL_COL_MIN, Math.min(this.detailColumn, width - markers - footprint));
    return { label, markers, footprint };
  }

  private renderRows(width: number): string[] {
    const rows = this.visibleRows();
    const lines: string[] = [];
    const cols = this.columns(width);
    const half = Math.floor(MAX_ROWS / 2);
    const start = Math.max(0, Math.min(this.cursor - half, rows.length - MAX_ROWS));
    const visible = rows.slice(start, start + MAX_ROWS);
    const pad = (text: string, column: number) => text + " ".repeat(Math.max(1, column - visibleWidth(text)));

    for (const [index, row] of visible.entries()) {
      const node = row.node;
      const isSelected = start + index === this.cursor;
      const pointer = isSelected ? this.theme.fg("accent", this.theme.bold("›")) : " ";
      if (node.kind === "info") {
        const text = `${pointer} ${" ".repeat(row.depth + 1)}${this.theme.fg("muted", node.text)}`;
        lines.push(truncateToWidth(text, width));
        continue;
      }
      const indent = " ".repeat(node.kind === "group" ? row.depth : row.depth + 1);
      const labelBudget = (prefix: number) => Math.max(1, cols.label - 2 - prefix - row.depth);
      let left: string;
      let markers: Marker[];
      let footprint = "";
      let detail: string;
      if (node.kind === "group") {
        const expanded = this.isExpanded(node.key);
        const caretGlyph = expanded ? "▾" : "▸";
        const caret = isSelected
          ? this.theme.fg("accent", this.theme.bold(caretGlyph))
          : expanded
            ? this.theme.fg("accent", caretGlyph)
            : this.theme.fg("muted", caretGlyph);
        const rawLabel = truncateToWidth(node.label, labelBudget(GROUP_PREFIX), "…");
        const label = isSelected
          ? this.theme.fg("accent", this.theme.bold(rawLabel))
          : row.depth <= 1
            ? this.theme.bold(rawLabel)
            : rawLabel;
        left = `${pointer} ${indent}${caret} ${this.groupMarkerFor(row.skills, isSelected)} ${label}`;
        markers = node.markers;
        detail =
          node.root === "skills.sh" && this.remoteLoading ? "Searching skills.sh…" : node.summary;
      } else {
        const skill = node.skill;
        const box = this.markerFor(skill, isSelected);
        const rawLabel = truncateToWidth(skill.name, labelBudget(SKILL_PREFIX), "…");
        const boldLabel = isSelected || this.served.has(skill.id) ? this.theme.bold(rawLabel) : rawLabel;
        const label = isSelected ? this.theme.fg("accent", boldLabel) : boldLabel;
        left = `${pointer} ${indent}${box} ${label}`;
        markers = skillMarkers(skill);
        footprint = skill.untraced
          ? this.theme.fg("warning", UNTRACED_FOOTPRINT)
          : skill.footprint
            ? this.theme.fg(skill.heavy ? "warning" : isSelected ? "text" : "muted", footprintRow(skill.footprint))
            : this.theme.fg("warning", "Footprint not listed");
        detail = rowSummary(skill);
      }
      let line = pad(truncateToWidth(left, cols.label - 1), cols.label) + pad(this.glyphs(markers), cols.markers);
      // Group rows have no Footprint; their summary starts in the Footprint column.
      if (node.kind === "skill") line += pad(footprint, cols.footprint);
      const detailRoom = width - visibleWidth(line);
      if (detail && detailRoom >= DETAIL_MIN) {
        const fitted = fitDetail(detail, detailRoom);
        line += node.kind === "skill"
          ? this.highlightWords(fitted, isSelected ? "muted" : "dim")
          : this.theme.fg(isSelected ? "muted" : "dim", fitted);
      }
      lines.push(truncateToWidth(line.trimEnd(), width));
    }
    for (let i = visible.length; i < MAX_ROWS; i++) lines.push("");
    const current = rows[this.cursor]?.node;
    const position = rows.length ? this.cursor + 1 : 0;
    const label = current?.kind === "skill" ? current.skill.id : current?.kind === "group" ? current.label : "";
    const currentMarkers = current?.kind === "skill" ? skillMarkers(current.skill) : current?.kind === "group" ? current.markers : [];
    const legend = currentMarkers.length
      ? this.theme.fg("dim", "  ") +
        currentMarkers
          .map((marker) => `${this.glyphs([marker])} ${this.theme.fg("dim", shortOf(marker))}`)
          .join(this.theme.fg("dim", " · "))
      : "";
    const posText =
      this.theme.fg("dim", `  (${position}/${rows.length})`) + (label ? this.theme.fg("muted", ` ${label}`) : "") + legend;
    lines.push(truncateToWidth(posText, width));
    return lines;
  }

  /** Author text keeps every character; only colour is added. */
  private styleAuthorLine(line: string): string {
    if (!line) return "";
    if (/^#{1,6}\s+/.test(line)) return this.theme.fg("accent", this.theme.bold(line));
    if (/^---+$/.test(line.trim())) return this.theme.fg("dim", line);
    return this.highlightWords(line);
  }

  private styleOwnLine(line: string): string {
    if (!line) return "";
    if (/^(?:Outside requirements|Files outside its folder|Untraced|It is served)/.test(line)) return this.theme.fg("muted", line);
    return this.highlightWords(line);
  }

  /** Inspect: a compact header (name, id, Footprint) and the SKILL.md body in the remaining room. */
  private renderInspect(width: number): string[] {
    const inspect = this.inspect!;
    const { skill } = inspect;
    const box = this.markerFor(skill, true);
    const markers = skillMarkers(skill);
    const titleName = this.theme.fg("accent", this.theme.bold(skill.name));
    const idParts = [skill.id];
    if (skill.domain) idParts.push(skill.domain);
    if (skill.revision) idParts.push(`Revision ${skill.revision.slice(0, 12)}`);
    const title =
      `  ${box} ${titleName}` +
      (markers.length ? `  ${this.glyphs(markers)}` : "") +
      this.theme.fg("muted", `  ${idParts.join(" · ")}`) +
      (skill.sourceUrl ? this.theme.fg("muted", " · ") + hyperlink("source", skill.sourceUrl) : "");
    const footprintText = skill.untraced
      ? this.theme.fg("warning", "Footprint unknown: Untraced, no Trace of what it pulls in")
      : skill.footprint
        ? footprintLine(skill.footprint) + (skill.heavy ? this.theme.fg("warning", " · Heavy") : "")
        : this.theme.fg("warning", "Footprint not listed");
    const footprintRows = wrapQuoted(`${this.theme.fg("muted", "Footprint")}  ${footprintText}`, Math.max(1, width - 2))
      .slice(0, 2)
      .map((line) => `  ${line}`);
    const licenceText = licenceLine(skill);
    const licenceRow =
      `  ${this.theme.fg("muted", "Licence")}    ` +
      (skill.licence ? licenceText : this.theme.fg(skill.untraced ? "warning" : "muted", licenceText));
    const bodyRows = INSPECT_ROWS - footprintRows.length - 1;
    inspect.rows = bodyRows;
    const gutter = this.theme.fg("dim", AUTHOR_GUTTER);
    const wrapped = this.bodyLines().flatMap(({ text, author }) => {
      if (author) {
        if (!text) return [gutter];
        return wrapTextWithAnsi(this.styleAuthorLine(text), Math.max(1, width - 4)).map((line) => `${gutter} ${line}`);
      }
      return text === "" ? [""] : wrapQuoted(this.styleOwnLine(text), Math.max(1, width - 2));
    });
    const maxScroll = Math.max(0, wrapped.length - bodyRows);
    inspect.scroll = Math.min(inspect.scroll, maxScroll);
    const body = wrapped.slice(inspect.scroll, inspect.scroll + bodyRows).map((line) => (line ? "  " + line : ""));
    while (body.length < bodyRows) body.push("");
    const last = Math.min(wrapped.length, inspect.scroll + bodyRows);
    const position =
      wrapped.length <= bodyRows
        ? `  (all ${wrapped.length} lines)`
        : `  (lines ${inspect.scroll + 1}–${last} of ${wrapped.length})${last < wrapped.length ? " ↓ more" : " end"}`;
    const ruleTitle = this.bodyTitle();
    const rule =
      width >= visibleWidth(ruleTitle) + 6
        ? this.theme.fg("border", "── ") +
          this.theme.fg("muted", ruleTitle) +
          this.theme.fg("border", " " + "─".repeat(Math.max(0, width - visibleWidth(ruleTitle) - 4)))
        : this.theme.fg("border", "─".repeat(width));
    return [
      truncateToWidth(title, width),
      ...footprintRows.map((line) => truncateToWidth(line, width)),
      truncateToWidth(licenceRow, width),
      rule,
      ...body,
      this.theme.fg("dim", truncateToWidth(position, width)),
    ];
  }

  /** The Heavy confirm names the cost; declining leaves the skill unserved. */
  private renderConfirm(width: number): string[] {
    const confirm = this.confirm!;
    const lines: string[] = [];
    const wrap = (text: string) => wrapQuoted(text, Math.max(1, width - 2)).map((line) => `  ${line}`);
    lines.push(...wrap(this.theme.fg("warning", this.theme.bold(confirm.heavy.length === 1 ? "Heavy skill" : `${confirm.heavy.length} Heavy skills`))), "");
    for (const skill of confirm.heavy) {
      lines.push(...wrap(this.theme.bold(heavyConfirmLine(skill.name, skill.footprint!, skill.heavyBecause))));
      lines.push(...wrap(this.theme.fg("muted", `Footprint  ${footprintLine(skill.footprint!)}`)), "");
    }
    if (confirm.add.length > confirm.heavy.length) {
      lines.push(...wrap(this.theme.fg("muted", `Also selects ${confirm.add.length - confirm.heavy.length} more that are not Heavy.`)));
    }
    const rows = lines.slice(0, INSPECT_ROWS + 2);
    while (rows.length < INSPECT_ROWS + 2) rows.push("");
    return rows.map((line) => truncateToWidth(line, width));
  }

  private renderLegend(width: number): string[] {
    const lines = MARKERS.map(({ marker, meaning }) => `  ${this.glyphs([marker])}  ${meaning}`);
    lines.push(
      `  ${this.theme.fg("success", "[x]")} selected · ${this.theme.fg("accent", "[-]")} some selected · ${this.theme.fg("dim", "[ ]")} not selected`,
      this.theme.fg("muted", "  A branch shows every marker of the skills under it."),
    );
    const rows = lines.slice(0, INSPECT_ROWS + 2);
    while (rows.length < INSPECT_ROWS + 2) rows.push("");
    return rows.map((line) => truncateToWidth(line, width));
  }

  /** Counts for the group under the cursor; on a skill row, its parent group. */
  private scopeSummary(): string {
    const rows = this.visibleRows();
    const current = rows[this.cursor];
    const scope =
      current?.node.kind === "group" ? current : (rows.find((row) => row.node.key === current?.parentKey) ?? current);
    const skills = scope?.skills ?? [];
    const selected = skills.filter((skill) => this.served.has(skill.id)).length;
    const totalPart = this.theme.fg("muted", `${skills.length} ${skills.length === 1 ? "skill" : "skills"}`);
    const sep = this.theme.fg("dim", " · ");
    const selectedPart = this.theme.fg(selected > 0 ? "success" : "muted", `${selected} selected`);
    return `${totalPart}${sep}${selectedPart}`;
  }

  /** Title and the status line stating the current selections; the first line under the top rule on every screen. */
  private renderTitle(width: number): string {
    const title = "  " + this.theme.fg("accent", this.theme.bold(TITLE));
    const selected = this.selectedSkills();
    const text = statusText(selected);
    const untraced = selected.some((skill) => skill.untraced);
    const status = untraced
      ? this.theme.fg("warning", text)
      : this.theme.fg(selected.length ? "success" : "muted", text);
    const column = Math.max(visibleWidth(title) + 2, Math.min(this.columns(width).label, width));
    return truncateToWidth(title + " ".repeat(Math.max(2, column - visibleWidth(title))) + status, width, "…");
  }

  private renderHintBar(items: Array<[string, string]>): string {
    const sep = this.theme.fg("dim", " · ");
    return "  " + items.map(([key, action]) => `${this.theme.fg("muted", key)} ${this.theme.fg("dim", action)}`).join(sep);
  }

  render(width: number): string[] {
    width = Math.max(0, width);
    this.clampCursor();
    const top = this.theme.fg("accent", "─".repeat(width));
    const rule = this.theme.fg("border", "─".repeat(width));
    if (this.confirm) {
      return [
        top,
        this.renderTitle(width),
        rule,
        ...this.renderConfirm(width),
        rule,
        this.renderHintBar([
          ["y/Enter", "serve"],
          ["n/Esc", "keep unserved"],
          ["Ctrl+C", "cancel"],
        ]),
        top,
      ].map((line) => truncateToWidth(line, width));
    }
    if (this.legend) {
      return [
        top,
        this.renderTitle(width),
        rule,
        ...this.renderLegend(width),
        rule,
        this.renderHintBar([
          ["?/←/Esc", "back"],
          ["Ctrl+C", "cancel"],
        ]),
        top,
      ].map((line) => truncateToWidth(line, width));
    }
    if (this.inspect) {
      return [
        top,
        this.renderTitle(width),
        ...this.renderInspect(width),
        rule,
        this.renderHintBar([
          ["↑↓/Ctrl+↑↓", "scroll"],
          ...(this.inspect.view === "skill" ? [["f", this.inspect.full ? "summary" : "full body"] as [string, string]] : []),
          ["d", this.inspect.details ? "hide details" : "details"],
          ["l", this.inspect.view === "licence" ? "SKILL.md" : "licence"],
          ["←/Esc", "back"],
          ["Enter", "serve"],
          ["Ctrl+C", "cancel"],
        ]),
        top,
      ].map((line) => truncateToWidth(line, width));
    }
    const searchLine =
      this.theme.fg("muted", "  Search: ") +
      this.theme.fg("accent", "> ") +
      (this.query ? this.theme.bold(this.query) : "") +
      this.theme.fg("accent", "█");
    return [
      top,
      this.renderTitle(width),
      truncateToWidth("  " + this.scopeSummary(), width),
      rule,
      ...this.renderRows(width),
      rule,
      truncateToWidth(searchLine, width),
      this.renderHintBar([
        ["Space", "open"],
        ["Enter", "serve"],
        ["Tab", "branch"],
        ["?", "legend"],
        ["Esc", "save & close"],
        ["Ctrl+C", "cancel"],
      ]),
      top,
    ].map((line) => truncateToWidth(line, width));
  }
}
