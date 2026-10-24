// Trace one Candidate at one Revision: walk from its SKILL.md through every
// reference that pulls a file in, and record each reached file with how it was
// reached, plus the skill's Outside requirements.
//
// The reading rules are the ones Jang confirmed on 2026-10-24 (F1–F11, H1, H2).
// Links and relative paths are settled mechanically. The boundary cases (a target
// outside every skill folder, a directory named in prose, a path that resolves only
// against the skill folder) are settled by a recorded judgement (judge.ts).
import { posix } from "node:path";
import { createHash } from "node:crypto";
import { blobSizes, openRepo, readBlobs, type Repo } from "./git.ts";
import { extractRefs, isText, type Ref } from "./refs.ts";
import { extractOutside, mergeOutside, type Outside } from "./outside.ts";
import { JudgementStore, questionId, type Question, type QuestionClass } from "./judge.ts";
import { namedSkills, type NamedSkill } from "./named.ts";
import { governingLicence, type Licence } from "./licence.ts";

export const TRACER = "trace-2";
export const FORMAT = "pi-sliced.trace/1";

export interface CandidateInput {
  candidate: string; // <owner>/<repo>/<name>
  source: string; // <owner>/<repo>
  revision: string;
  skillPath: string;
}

export type How = "root" | "link" | "path" | "variable-path" | "directory" | "script-read";

export interface Reach {
  how: How;
  from?: string;
  line?: number;
  ref?: string;
  judgement?: string; // id of the recorded judgement that admitted this edge
}

export interface TracedFile {
  path: string;
  size: number;
  blob: string;
  reached: Reach[];
}

export interface Trace {
  format: string;
  tracer: string;
  judge: string;
  candidate: string;
  source: string;
  revision: string;
  skillPath: string;
  status: "resolved" | "unresolvable" | "pending";
  reason?: string;
  files: TracedFile[];
  outside: Outside[];
  totals: { files: number; bytes: number };
  // Facts recorded alongside the Trace; proof 1 does not compare them.
  namedSkills: NamedSkill[];
  checkoutReach: CheckoutReach[];
  licence: Licence | null;
  pending: string[]; // ids of unanswered judgement questions (status "pending")
}

/** A code edge that leaves the skill folders and plugin root (ruling S1): disclosed, not served. */
export interface CheckoutReach {
  from: string;
  line: number;
  ref: string;
  target: string; // the repo path the code reaches
  package: string | null; // the code package around the target, when there is one
  files: number; // files under that package (or the target alone)
  bytes: number;
}

/** Directories whose root holds a SKILL.md: every skill folder in the tree. */
export function skillFolders(repo: Repo): string[] {
  const out: string[] = [];
  for (const p of repo.tree.keys()) if (p === "SKILL.md" || p.endsWith("/SKILL.md")) out.push(posix.dirname(p));
  return out.sort();
}

function inSkillFolder(path: string, folders: string[]): boolean {
  return folders.some((f) => f === "." || path === f || path.startsWith(f + "/"));
}

function filesUnder(repo: Repo, dir: string): string[] {
  const prefix = dir === "" ? "" : dir + "/";
  return [...repo.tree.keys()].filter((p) => p.startsWith(prefix)).sort();
}

// A path segment holding a placeholder (`<x>`, `{x}`, `*`) matches any one segment.
// `**` and malformed placeholders ({200}, <>) never match.
function segmentPattern(seg: string): RegExp | null {
  if (!/[<>{}*]/.test(seg)) return null;
  if (seg.includes("**")) return /(?!)/;
  if (/<(?![A-Za-z_][\w-]*>)|\{(?![A-Za-z_][\w-]*\})/.test(seg)) return /(?!)/;
  const re = seg
    .split(/(<[^>]*>|\{[^}]*\}|\*)/)
    .map((part, i) => (i % 2 === 1 ? "[^/]+" : part.replace(/[.+?^$()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${re}$`);
}

interface Lookup {
  files: string[];
  dir: boolean;
  target: string; // normalized repo path the reference names
}

/** Resolve a relative path against a base, returning matching files and whether it named a directory. */
function lookup(repo: Repo, base: string, rel: string): Lookup | null {
  const joined = posix.normalize(posix.join(base || ".", rel));
  if (joined.startsWith("..") || joined.startsWith("/")) return null;
  const target = joined === "." ? "" : joined.replace(/\/+$/, "");
  const segs = target.split("/");
  if (segs.some((s) => segmentPattern(s))) {
    const hits = new Set<string>();
    let dirHit = false;
    for (const p of repo.tree.keys()) {
      const ps = p.split("/");
      if (ps.length < segs.length) continue;
      let ok = true;
      for (let i = 0; i < segs.length && ok; i++) {
        const pat = segmentPattern(segs[i]);
        ok = pat ? pat.test(ps[i]) : ps[i] === segs[i];
      }
      if (!ok) continue;
      if (ps.length > segs.length) dirHit = true;
      hits.add(p);
    }
    return hits.size ? { files: [...hits].sort(), dir: dirHit, target } : null;
  }
  if (repo.tree.has(target)) return { files: [target], dir: false, target };
  if (repo.dirs.has(target)) return { files: filesUnder(repo, target), dir: true, target };
  return null;
}

// A leading variable (`$X`, `${X}`, `${X:+$X}`) or placeholder (`<skill-dir>`)
// stands for a directory the text does not name. Strip it and any `..` that
// follow, and resolve the remainder against the skill folder and its ancestors.
const LEADING_VAR = /^(?:\$\{[^}]*\}|\$[A-Za-z_][A-Za-z0-9_]*|<[^>/]+>|~)(?:\/|$)/;

function stripVariables(raw: string): string | null {
  let s = raw.replace(/^\$\{[A-Za-z_][A-Za-z0-9_]*:[+-]/, "").replace(/\}$/, "");
  if (!LEADING_VAR.test(s)) return null;
  while (LEADING_VAR.test(s)) s = s.replace(LEADING_VAR, "");
  while (s.startsWith("../")) s = s.slice(3);
  if (s.startsWith("./")) s = s.slice(2);
  if (!s || s.includes("$")) return null;
  return s;
}

// Listed direction verbs (Jang, 2026-10-24). A hint for the judge, never a gate.
export const DIRECTION_VERBS = [
  "read", "study", "follow", "run", "load", "open", "copy", "search", "consult", "use", "see",
  "refer to", "check out", "review", "execute", "invoke", "import", "source", "fetch", "view",
  "look at", "start with", "start from", "apply",
];
const VERB_RES = DIRECTION_VERBS.map((v) => [v, new RegExp(`\\b${v.replace(/ /g, "\\s+")}\\b`, "i")] as const);

export function directionVerbs(sentence: string): string[] {
  const s = sentence.replace(/`[^`]*`/g, " ").replace(/\[[^\]]*\]\([^)]*\)/g, " ");
  return VERB_RES.filter(([, re]) => re.test(s)).map(([v]) => v);
}

// Existence or location checks never pull anything in (ruling F10).
const EXISTENCE_RE = /\bcheck\b[^.;]*?\b(?:whether|for|if)\b|\bif\b.*\bexists?\b|\btest\s+-[efd]\b|\[\[?\s+!?\s*-[efd]\b/i;

export function isExistenceCheck(sentence: string): boolean {
  return EXISTENCE_RE.test(sentence.replace(/`[^`]*`/g, "X"));
}

const MANIFESTS = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod"];

// S1: a direction inside a contributor or maintenance workflow for the repo itself.
const CONTRIB_FILE = /^(?:contributing|maintain(?:ers|ing)?|releas(?:e|ing)|development|hacking)\b/i;
const CONTRIB_HEADING = /^#{1,6}\s.*\b(?:contribut\w*|maintainers?|maintenance|releas(?:e|ing)|publishing)\b/i;

export function isContributorWorkflow(file: string, context: string[]): boolean {
  return CONTRIB_FILE.test(posix.basename(file)) || context.some((l) => CONTRIB_HEADING.test(l));
}

function codePackage(repo: Repo, path: string, isDir: boolean): string | null {
  for (let d = isDir ? path : posix.dirname(path); ; d = posix.dirname(d)) {
    const dir = d === "." ? "" : d;
    if (MANIFESTS.some((m) => repo.tree.has(dir ? `${dir}/${m}` : m))) return dir;
    if (dir === "") return null;
  }
}

/** True when a template's placeholder stands for a whole skill (ruling F4 exception). */
function placeholderIsSkill(rel: string, base: string, folders: Set<string>): boolean {
  const target = posix.normalize(posix.join(base || ".", rel)).split("/");
  for (let i = 0; i < target.length; i++) {
    if (!/[<>{}*]/.test(target[i])) continue;
    const prefix = target.slice(0, i).join("/");
    for (const f of folders) if ((posix.dirname(f) === "." ? "" : posix.dirname(f)) === prefix && f !== ".") return true;
  }
  return false;
}

interface Hit {
  files: string[];
  how: How;
  judgement?: string;
}

interface Ctx {
  repo: Repo;
  input: CandidateInput;
  folders: string[];
  folderSet: Set<string>;
  store: JudgementStore;
  sizes: (blobs: string[]) => Map<string, number>;
  pending: Set<string>; // unanswered questions met in this trace
  checkout: Map<string, CheckoutReach>;
}

const PLUGIN_MANIFESTS = ["plugin.json", ".claude-plugin/plugin.json", "gemini-extension.json"];

/** The plugin root around a file: its nearest proper ancestor directory with a plugin manifest (S1). */
function pluginRoot(repo: Repo, file: string): string | null {
  for (let d = posix.dirname(file); d !== "." && d !== ""; d = posix.dirname(d)) {
    if (PLUGIN_MANIFESTS.some((m) => repo.tree.has(`${d}/${m}`)) || repo.dirs.has(`${d}/.codex-plugin`)) return d;
  }
  return null;
}

function recordCheckout(ctx: Ctx, ref: Ref, from: string, r: Lookup): void {
  const pkg = codePackage(ctx.repo, r.target, r.dir);
  const scope = pkg !== null && pkg !== "" ? filesUnder(ctx.repo, pkg) : r.files;
  const key = `${from}\0${ref.line}\0${r.target}`;
  if (ctx.checkout.has(key)) return;
  const sizes = blobSizes(ctx.repo, scope.map((f) => ctx.repo.tree.get(f)!.blob));
  ctx.checkout.set(key, {
    from,
    line: ref.line,
    ref: ref.raw,
    target: r.target,
    package: pkg !== null && pkg !== "" ? pkg : null,
    files: scope.length,
    bytes: scope.reduce((s, f) => s + (sizes.get(ctx.repo.tree.get(f)!.blob) ?? 0), 0),
  });
}

function resolveIn(ctx: Ctx, base: string, rel: string): Lookup | null {
  if (/[<>{}*]/.test(rel)) {
    // A template needs at least one wholly literal segment besides `.` and `..`.
    if (!rel.split("/").some((seg) => seg && seg !== "." && seg !== ".." && !/[<>{}*]/.test(seg))) return null;
    if (placeholderIsSkill(rel, base, ctx.folderSet)) return null;
  }
  const r = lookup(ctx.repo, base, rel);
  if (!r) return null;
  // F4b: a directory whose root holds a SKILL.md pulls in only that SKILL.md.
  if (r.dir && ctx.repo.tree.has(r.target ? `${r.target}/SKILL.md` : "SKILL.md") && !/[<>{}*]/.test(rel)) {
    return { files: [r.target ? `${r.target}/SKILL.md` : "SKILL.md"], dir: false, target: r.target };
  }
  return r;
}

function ask(ctx: Ctx, cls: QuestionClass, ref: Ref, from: string, r: Lookup, context: string[]): boolean | undefined {
  const sizes = ctx.sizes(r.files.map((f) => ctx.repo.tree.get(f)!.blob));
  const known = r.files.every((f) => sizes.has(ctx.repo.tree.get(f)!.blob));
  const q: Omit<Question, "id"> = {
    class: cls,
    source: ctx.input.source,
    revision: ctx.input.revision,
    file: from,
    line: ref.line,
    ref: ref.raw,
    sentence: ref.sentence,
    context,
    target: {
      path: r.target,
      isDirectory: r.dir,
      files: r.files.length,
      bytes: known ? r.files.reduce((s, f) => s + sizes.get(ctx.repo.tree.get(f)!.blob)!, 0) : null,
      codePackage: codePackage(ctx.repo, r.target, r.dir),
    },
    verbHint: directionVerbs(ref.sentence),
    workflow: isContributorWorkflow(from, context) ? "contributor" : null,
  };
  const id = questionId(q);
  const answer = ctx.store.decide({ ...q, id });
  if (answer === undefined) ctx.pending.add(id);
  return answer;
}

function resolveRef(ctx: Ctx, ref: Ref, from: string, context: string[]): Hit | null {
  const { repo, folders, folderSet } = ctx;
  const raw = ref.raw.replace(/[#?].*$/, "");
  if (!raw || /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || raw.startsWith("mailto:")) return null;
  // F10: in prose, an existence or location check pulls nothing in. In code, extraction already dropped
  // the test expressions themselves; the read or run they guard still counts.
  if (ref.kind !== "script" && ref.kind !== "fence" && isExistenceCheck(ref.sentence)) return null;
  const fromDir = posix.dirname(from);
  const prose = ref.kind === "code" || ref.kind === "bare" || ref.kind === "frontmatter";
  const how: How = ref.kind === "link" ? "link" : ref.kind === "script" ? "script-read" : "path";

  // Paths built from variables or placeholders: files only, inside a skill folder.
  const rest = stripVariables(raw);
  if (rest !== null) {
    for (let d = ctx.input.skillPath; ; d = posix.dirname(d)) {
      const b = d === "." ? "" : d;
      const r = resolveIn(ctx, b, rest);
      if (r && !r.dir && r.files.every((f) => inSkillFolder(f, folders))) return { files: r.files, how: "variable-path" };
      if (b === "") break;
    }
    if (!/[<>{}*]/.test(rest)) {
      const hits = folders.filter((f) => repo.tree.has(f === "." ? rest : `${f}/${rest}`));
      if (hits.length === 1) return { files: [hits[0] === "." ? rest : `${hits[0]}/${rest}`], how: "variable-path" };
    }
    return null;
  }
  if (raw.startsWith("/")) return null; // F6: absolute paths and site-root routes are not repository files

  // Decide one resolved target. `viaSkillFolder` marks a path that resolved only against the skill folder.
  const settle = (r: Lookup, viaSkillFolder: boolean): Hit | null => {
    if (ref.kind === "script") {
      // S1: code reach stays inside the skill folders and the file's plugin root; beyond, it is disclosed.
      const plugin = pluginRoot(repo, from);
      if (r.files.every((f) => inSkillFolder(f, folders) || (plugin !== null && f.startsWith(plugin + "/"))))
        return { files: r.files, how: r.dir ? "directory" : how };
      recordCheckout(ctx, ref, from, r);
      return null;
    }
    const outside = !r.files.every((f) => inSkillFolder(f, folders));
    if (r.dir && ref.kind === "fence") return null; // a directory in a code block is a location, not a read
    if (outside) {
      // H1: any reference that leaves every skill folder needs a direction, judged in context.
      const ok = ask(ctx, "outside-skill-folders", ref, from, r, context);
      return ok ? { files: r.files, how: r.dir ? "directory" : how, judgement: "outside-skill-folders" } : null;
    }
    if (r.dir && prose) {
      const ok = ask(ctx, "prose-directory", ref, from, r, context); // F8
      return ok ? { files: r.files, how: "directory", judgement: "prose-directory" } : null;
    }
    if (viaSkillFolder && prose) {
      const ok = ask(ctx, "skill-folder-only", ref, from, r, context); // F7 collisions
      return ok ? { files: r.files, how, judgement: "skill-folder-only" } : null;
    }
    return { files: r.files, how: r.dir ? "directory" : how };
  };

  // 1. Relative to the file that holds the reference (F7). A link resolves only here.
  const local = resolveIn(ctx, fromDir, raw);
  if (local) return settle(local, false);
  if (ref.kind === "link") return null;

  // A script resolves paths against its own directory (and the repository root, below), not the skill folder.
  const code = ref.kind === "script";
  // 2. Relative to the file's own skill folder (F7; judged when prose, see settle).
  const owner = folders.filter((f) => f === "." || from.startsWith(f + "/")).sort((a, b) => b.length - a.length)[0];
  const rel = raw.replace(/^\.\//, "");
  if (!code && owner !== undefined && owner !== "." && owner !== fromDir) {
    const own = resolveIn(ctx, owner, rel);
    if (own) return settle(own, true);
  }
  // 3. Skills-root-relative: against an enclosing directory where the first segment names a skill folder.
  const first = rel.split("/")[0];
  for (let d = fromDir; !code && d !== "." && d !== ""; d = posix.dirname(d)) {
    if (folderSet.has(`${d}/${first}`)) {
      const sib = resolveIn(ctx, d, rel);
      if (sib) return settle(sib, false);
    }
  }
  // 4. Relative to the repository root.
  if (rel.includes("/") && !raw.startsWith(".")) {
    const top = resolveIn(ctx, "", rel);
    if (top) return settle(top, false);
  }
  // 5. A script run by its bare name in a code block (`import_mock_shop_catalog.mjs --store …`):
  //    the one file of that name in the Candidate's own skill folder.
  if (ref.kind === "fence" && !rel.includes("/") && /\.(?:mjs|cjs|js|ts|py|sh)$/.test(rel)) {
    const prefix = ctx.input.skillPath + "/";
    const hits = [...repo.tree.keys()].filter((p) => p.startsWith(prefix) && posix.basename(p) === rel);
    if (hits.length === 1) return { files: hits, how: "path" };
  }
  return null;
}

/** For each line: the nearest heading above it and, for a list item or table row, the lead-in line. */
function contextOf(lines: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = n - 2; i >= 0; i--) {
    if (/^#{1,6}\s/.test(lines[i])) {
      out.push(lines[i].trim());
      break;
    }
  }
  const line = lines[n - 1] ?? "";
  if (/^\s*(?:[-*+]|\d+[.)]|\|)\s/.test(line)) {
    for (let i = n - 2; i >= 0; i--) {
      const l = lines[i];
      if (!l.trim() || /^\s*(?:[-*+]|\d+[.)]|\|)\s/.test(l)) continue;
      if (!out.includes(l.trim())) out.push(l.trim());
      break;
    }
  }
  if (n >= 2 && lines[n - 2].trim()) out.push(lines[n - 2].trim());
  out.push(line.trim());
  if (lines[n]?.trim()) out.push(lines[n].trim());
  return out.map((l) => l.slice(0, 400));
}

export function gitBlobSha(bytes: Buffer): string {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

export function trace(input: CandidateInput, store: JudgementStore): Trace {
  const repo = openRepo(input.source, input.revision);
  const base: Trace = {
    format: FORMAT,
    tracer: TRACER,
    judge: store.judge,
    candidate: input.candidate,
    source: input.source,
    revision: input.revision,
    skillPath: input.skillPath,
    status: "resolved",
    files: [],
    outside: [],
    totals: { files: 0, bytes: 0 },
    namedSkills: [],
    checkoutReach: [],
    licence: null,
    pending: [],
  };
  const root = posix.join(input.skillPath, "SKILL.md");
  if (!repo.tree.has(root)) {
    return { ...base, status: "unresolvable", reason: `${root} is not in the tree at ${input.revision}` };
  }
  const folders = skillFolders(repo);
  const sizeCache = new Map<string, number>();
  const ctx: Ctx = {
    repo,
    input,
    folders,
    folderSet: new Set(folders),
    store,
    pending: new Set(),
    checkout: new Map(),
    // Sizes of blobs already in the cache; never fetches (a judge question only needs a hint).
    sizes: (blobs) => {
      const want = blobs.filter((b) => !sizeCache.has(b));
      if (want.length) for (const [k, v] of blobSizes(repo, want, { fetch: false })) sizeCache.set(k, v);
      return sizeCache;
    },
  };
  const reached = new Map<string, Reach[]>();
  const outside: Outside[] = [];
  const texts = new Map<string, string>();
  reached.set(root, [{ how: "root" }]);
  let frontier = [root];
  const parsed = new Set<string>();
  while (frontier.length) {
    const blobs = readBlobs(repo, frontier.map((p) => repo.tree.get(p)!.blob));
    const next: string[] = [];
    for (const from of frontier) {
      if (parsed.has(from)) continue;
      parsed.add(from);
      const bytes = blobs.get(repo.tree.get(from)!.blob)!;
      if (!isText(from, bytes)) continue;
      const text = bytes.toString("utf8");
      texts.set(from, text);
      const lines = text.split("\n");
      outside.push(...extractOutside(from, text));
      for (const ref of extractRefs(from, text)) {
        const hit = resolveRef(ctx, ref, from, contextOf(lines, ref.line));
        if (!hit) continue;
        for (const f of hit.files) {
          if (f === from) continue;
          const r: Reach = { how: hit.how, from, line: ref.line, ref: ref.raw, ...(hit.judgement ? { judgement: hit.judgement } : {}) };
          const list = reached.get(f);
          if (list) {
            if (!list.some((x) => x.from === from && x.line === ref.line && x.ref === ref.raw)) list.push(r);
          } else {
            reached.set(f, [r]);
            next.push(f);
          }
        }
      }
    }
    frontier = next.filter((p) => isText(p));
  }
  const paths = [...reached.keys()].sort();
  const sizes = blobSizes(repo, paths.map((p) => repo.tree.get(p)!.blob));
  const files: TracedFile[] = paths.map((path) => {
    const e = repo.tree.get(path)!;
    const reach = reached.get(path)!.sort(
      (a, b) => (a.from ?? "").localeCompare(b.from ?? "") || (a.line ?? 0) - (b.line ?? 0) || (a.ref ?? "").localeCompare(b.ref ?? ""),
    );
    return { path, size: sizes.get(e.blob)!, blob: e.blob, reached: reach };
  });
  const pending = [...ctx.pending].sort();
  return {
    ...base,
    status: pending.length ? "pending" : "resolved",
    files,
    outside: mergeOutside(outside),
    totals: { files: files.length, bytes: files.reduce((s, f) => s + f.size, 0) },
    namedSkills: namedSkills(repo, folders, input.skillPath, texts),
    checkoutReach: [...ctx.checkout.values()].sort((a, b) => a.from.localeCompare(b.from) || a.line - b.line || a.target.localeCompare(b.target)),
    licence: governingLicence(repo, input.skillPath, texts.get(root) ?? ""),
    pending,
  };
}
