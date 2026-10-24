// Shared pieces of the Author's server: store layout, git access to the tracer's
// blobless clones, blob verification, frontmatter parsing, and the derivation of
// a Listing's Footprint, Heavy and markers from a stored Trace.
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
export const TRACES = process.env.PI_SLICED_TRACES || join(REPO, "traces");

// Kept in step with extensions/pi-sliced/types.ts (HEAVY_BYTES, HEAVY_OUTSIDE_KINDS).
export const HEAVY_BYTES = 1_048_576;
export const HEAVY_OUTSIDE_KINDS = ["cli", "package", "credential", "mcp-server"];

export const SHA = /^[0-9a-f]{40}$/;
export const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9_.-]+$/;
export const CATALOGUE_NAME = /^[a-z0-9][a-z0-9_-]*$/;

export function storeRoot() {
  if (process.env.PI_SLICED_STORE) return process.env.PI_SLICED_STORE;
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(base, "pi-sliced", "store");
}

export function gitCacheRoot() {
  if (process.env.PI_SLICED_GIT_CACHE) return process.env.PI_SLICED_GIT_CACHE;
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "pi-sliced", "git");
}

/** Git blob SHA-1 of `bytes`: sha1("blob <len>\0" + bytes). */
export function gitBlobSha(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

/** Throws unless `bytes` is the blob `sha` of `size` bytes. */
export function verifyBlob(bytes, sha, size) {
  if (size !== undefined && bytes.length !== size) {
    throw new Error(`blob ${sha}: size ${bytes.length}, want ${size}`);
  }
  const got = gitBlobSha(bytes);
  if (got !== sha) throw new Error(`blob ${sha}: content hashes to ${got}`);
}

/** Write `data` to `path` atomically (temp file in the same directory, then rename). */
export function writeAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  writeFileSync(tmp, data, { mode: 0o644 });
  renameSync(tmp, path);
}

export function writeJson(path, value) {
  writeAtomic(path, JSON.stringify(value, null, 2) + "\n");
}

// ---------------------------------------------------------------- traces

export const TRACE_FORMATS = ["pi-sliced.trace/1", "pi-sliced.trace/2"];

function traceRank(file) {
  const m = /^trace-(\d+)\+judge-(\d+)\.json$/.exec(file);
  return m ? [Number(m[1]), Number(m[2])] : [-1, -1];
}

/** Newest trace file name in a `<candidate>/<revision>/` directory, or null. */
export function newestTraceFile(files) {
  const json = files.filter((f) => f.endsWith(".json"));
  json.sort((a, b) => {
    const [ta, ja] = traceRank(a);
    const [tb, jb] = traceRank(b);
    return ta - tb || ja - jb || (a < b ? -1 : a > b ? 1 : 0);
  });
  return json.at(-1) ?? null;
}

/** Read the newest stored Trace of `candidate` at `revision` (read-only). */
export function readTrace(candidate, revision) {
  const dir = join(TRACES, candidate, revision);
  if (!existsSync(dir)) throw new Error(`no trace directory for ${candidate}@${revision}`);
  const file = newestTraceFile(readdirSync(dir));
  if (!file) throw new Error(`no trace file for ${candidate}@${revision}`);
  const trace = JSON.parse(readFileSync(join(dir, file), "utf8"));
  // Only `status`, `source`, `skillPath`, `files[].{path,size,blob}`, `outside[].{kind,name}` and
  // `namedSkills` are read; trace/1 and trace/2 agree on them.
  if (!TRACE_FORMATS.includes(trace.format)) throw new Error(`${candidate}@${revision}: format ${trace.format}`);
  if (trace.candidate !== candidate || trace.revision !== revision) {
    throw new Error(`${dir}/${file}: records ${trace.candidate}@${trace.revision}`);
  }
  return trace;
}

/**
 * Every stored Trace with status `resolved`, newest trace file per Candidate+Revision,
 * sorted by Candidate id then Revision. Directories other than `<owner>/<repo>/<name>/<sha>` are skipped.
 */
export function resolvedTraces() {
  const out = [];
  const ls = (p) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  if (!existsSync(TRACES)) return out;
  for (const owner of ls(TRACES)) {
    if (owner === "judgements") continue;
    for (const repo of ls(join(TRACES, owner))) {
      for (const name of ls(join(TRACES, owner, repo))) {
        for (const revision of ls(join(TRACES, owner, repo, name))) {
          if (!SHA.test(revision)) continue;
          const candidate = `${owner}/${repo}/${name}`;
          let trace;
          try {
            trace = readTrace(candidate, revision);
          } catch {
            continue;
          }
          if (trace.status === "resolved") out.push(trace);
        }
      }
    }
  }
  out.sort((a, b) => (a.candidate < b.candidate ? -1 : a.candidate > b.candidate ? 1 : a.revision < b.revision ? -1 : 1));
  return out;
}

// ---------------------------------------------------------------- git

function git(dir, args, input, extraEnv = {}) {
  const r = spawnSync("git", ["-C", dir, ...args], {
    input,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...extraEnv },
    maxBuffer: 1 << 30,
    timeout: 600_000,
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed (${r.status}): ${r.stderr?.toString().trim()}`);
  return r.stdout;
}

export function cloneDir(source) {
  const [owner, repo] = source.split("/");
  if (!SEGMENT.test(owner ?? "") || !SEGMENT.test(repo ?? "")) throw new Error(`bad source: ${source}`);
  const dir = join(gitCacheRoot(), owner, `${repo}.git`);
  if (!existsSync(dir)) throw new Error(`no tracer clone for ${source} at ${dir}`);
  return dir;
}

/** path → git mode for every blob in the tree at `revision` (no blob fetch). */
export function treeModes(source, revision) {
  const out = git(cloneDir(source), ["ls-tree", "-r", "-z", "--full-tree", revision], undefined, { GIT_NO_LAZY_FETCH: "1" });
  const modes = new Map();
  for (const rec of out.toString("utf8").split("\0")) {
    if (!rec) continue;
    const tab = rec.indexOf("\t");
    const [mode, type] = rec.slice(0, tab).split(/\s+/);
    if (type === "blob") modes.set(rec.slice(tab + 1), mode);
  }
  return modes;
}

/** Bytes of the given blobs from the clone of `source`, fetching missing ones from its origin in one batch. */
export function readCloneBlobs(source, shas) {
  const dir = cloneDir(source);
  const want = [...new Set(shas)];
  const result = new Map();
  if (want.length === 0) return result;
  const noLazy = { GIT_NO_LAZY_FETCH: "1" };
  const missing = git(dir, ["cat-file", "--batch-check"], want.join("\n") + "\n", noLazy)
    .toString("utf8")
    .split("\n")
    .filter((l) => l.endsWith(" missing"))
    .map((l) => l.split(" ")[0]);
  if (missing.length > 0) {
    git(dir, ["fetch", "-q", "--no-tags", "--no-write-fetch-head", "--filter=blob:none", "--stdin", "origin"], missing.join("\n") + "\n");
  }
  const out = git(dir, ["cat-file", "--batch"], want.join("\n") + "\n", noLazy);
  let at = 0;
  while (at < out.length) {
    const nl = out.indexOf(0x0a, at);
    const header = out.subarray(at, nl).toString("utf8");
    const [oid, type, size] = header.split(" ");
    if (type !== "blob") throw new Error(`git cat-file: ${header}`);
    const n = Number(size);
    result.set(oid, out.subarray(nl + 1, nl + 1 + n));
    at = nl + 1 + n + 1;
  }
  return result;
}

// ---------------------------------------------------------------- frontmatter

/** The YAML frontmatter block of a SKILL.md (between the leading `---` lines), or null. */
export function frontmatterBlock(text) {
  const t = text.startsWith("\ufeff") ? text.slice(1) : text;
  const lines = t.split(/\r?\n/);
  if (lines[0]?.trimEnd() !== "---") return null;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === "---" || lines[i].trimEnd() === "...") return lines.slice(1, i);
  }
  return null;
}

const indentOf = (line) => /^ */.exec(line)[0].length;
const isBlank = (line) => line.trim() === "";

function stripComment(s) {
  // A plain scalar ends at " #".
  const m = /\s+#/.exec(s);
  return (m ? s.slice(0, m.index) : s).trimEnd();
}

/**
 * Fold the lines of a flow scalar: a single line break becomes a space, n empty lines become n "\n".
 * Whitespace around inner line breaks is dropped; the first line's leading and the last line's
 * trailing whitespace are kept (the caller trims plain scalars).
 */
function foldFlowLines(lines) {
  let out = "";
  let breaks = 0;
  for (let k = 0; k < lines.length; k++) {
    let l = lines[k];
    if (k > 0) l = l.replace(/^[ \t]+/, "");
    if (k < lines.length - 1) l = l.replace(/[ \t]+$/, "");
    if (k > 0 && l === "" && k < lines.length - 1) {
      breaks++;
      continue;
    }
    if (k > 0) out += breaks > 0 ? "\n".repeat(breaks) : " ";
    out += l;
    breaks = 0;
  }
  return out;
}

const DQ_ESCAPES = { 0: "\0", a: "\x07", b: "\b", t: "\t", "\t": "\t", n: "\n", v: "\v", f: "\f", r: "\r", e: "\x1b", " ": " ", '"': '"', "/": "/", "\\": "\\", N: "\u0085", _: "\u00a0", L: "\u2028", P: "\u2029" };

function afterClose(rest) {
  const r = rest.trim();
  if (r !== "" && !r.startsWith("#")) throw new Error(`text after closing quote: ${r}`);
}

/** `body` is the text after the opening quote, lines joined by "\n". */
function parseDoubleQuoted(body) {
  // Split into lines of segments; escapes become literal segments that folding never trims.
  const lines = [[]];
  const push = (s, literal) => lines.at(-1).push({ s, literal });
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"') {
      afterClose(body.slice(i + 1));
      // Fold on the raw text with placeholders, then substitute literals.
      const lits = [];
      const raw = lines.map((segs) => segs.map((g) => (g.literal ? `\u0000${lits.push(g.s) - 1}\u0000` : g.s)).join(""));
      return foldFlowLines(raw).replace(/\u0000(\d+)\u0000/g, (_, n) => lits[Number(n)]);
    }
    if (c === "\n") {
      lines.push([]);
      continue;
    }
    if (c !== "\\") {
      push(c, false);
      continue;
    }
    const n = body[i + 1];
    if (n === "\n") {
      // Escaped line break: join with no space; leading whitespace of the next line is dropped.
      i += 2;
      while (body[i] === " " || body[i] === "\t") i++;
      i--;
      continue;
    }
    if (n in DQ_ESCAPES) {
      push(DQ_ESCAPES[n], true);
      i++;
      continue;
    }
    const len = n === "x" ? 2 : n === "u" ? 4 : n === "U" ? 8 : 0;
    const hex = body.slice(i + 2, i + 2 + len);
    if (!len || !/^[0-9a-fA-F]+$/.test(hex) || hex.length !== len) throw new Error(`bad escape \\${n}${hex}`);
    push(String.fromCodePoint(parseInt(hex, 16)), true);
    i += 1 + len;
  }
  throw new Error("unterminated double-quoted scalar");
}

/** `body` is the text after the opening quote, lines joined by "\n". */
function parseSingleQuoted(body) {
  let text = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "'") {
      text += c;
      continue;
    }
    if (body[i + 1] === "'") {
      text += "\u0000Q\u0000";
      i++;
      continue;
    }
    afterClose(body.slice(i + 1));
    return foldFlowLines(text.split("\n")).replaceAll("\u0000Q\u0000", "'");
  }
  throw new Error("unterminated single-quoted scalar");
}

function parseBlock(header, lines, parentIndent) {
  // header: e.g. ">", "|-", ">+2", "|2-"
  const m = /^([|>])([+-]?)(\d?)([+-]?)\s*(?:#.*)?$/.exec(header);
  if (!m) throw new Error(`bad block header: ${header}`);
  const style = m[1];
  const chomp = m[2] || m[4] || "";
  let indent = m[3] ? parentIndent + Number(m[3]) : 0;
  if (!indent) {
    const first = lines.find((l) => !isBlank(l));
    indent = first === undefined ? parentIndent + 1 : indentOf(first);
  }
  const content = lines.map((l) => (isBlank(l) ? "" : l.slice(indent)));
  // trailing blank lines
  let end = content.length;
  while (end > 0 && content[end - 1] === "") end--;
  const body = content.slice(0, end);
  const trailing = content.length - end;
  let text;
  if (style === "|") {
    text = body.join("\n");
  } else {
    // Folding: lines are joined by a space unless either side is empty or more-indented.
    text = "";
    let prevMore = false;
    let breaks = 0;
    let started = false;
    for (const l of body) {
      if (l === "") {
        breaks++;
        continue;
      }
      const more = /^[ \t]/.test(l);
      if (started) {
        if (breaks === 0) text += more || prevMore ? "\n" : " ";
        else text += "\n".repeat(more || prevMore ? breaks + 1 : breaks);
      } else if (breaks) {
        text += "\n".repeat(breaks);
      }
      text += l;
      prevMore = more;
      breaks = 0;
      started = true;
    }
  }
  if (body.length === 0) return chomp === "+" ? "\n".repeat(trailing) : "";
  if (chomp === "-") return text;
  if (chomp === "+") return text + "\n" + "\n".repeat(trailing);
  return text + "\n";
}

/**
 * Top-level scalar keys of a SKILL.md frontmatter, with YAML semantics for plain,
 * single- and double-quoted (single- or multi-line), folded `>` and literal `|` scalars.
 * Non-scalar values (mappings, sequences) are skipped. Returns {} when there is no frontmatter.
 */
export function parseFrontmatter(text) {
  const lines = frontmatterBlock(text);
  const out = {};
  if (!lines) return out;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const km = /^([A-Za-z0-9_][A-Za-z0-9_-]*)\s*:(?:\s+(.*)|\s*)$/.exec(line);
    if (!km || line.startsWith(" ")) {
      i++;
      continue;
    }
    const key = km[1];
    const value = (km[2] ?? "").trimStart(); // trailing space may belong to a quoted escape
    // Continuation lines: indented or blank, up to the next top-level line.
    let j = i + 1;
    while (j < lines.length && (isBlank(lines[j]) || indentOf(lines[j]) > 0)) j++;
    const cont = lines.slice(i + 1, j);
    i = j;
    if (value.startsWith('"')) {
      out[key] = parseDoubleQuoted([value.slice(1), ...cont].join("\n"));
    } else if (value.startsWith("'")) {
      out[key] = parseSingleQuoted([value.slice(1), ...cont].join("\n"));
    } else if (value.startsWith("|") || value.startsWith(">")) {
      out[key] = parseBlock(value, cont, 0);
    } else if (value.trim() === "" || value.startsWith("#")) {
      // nested mapping/sequence, or empty: plain multi-line scalar only if continuation is not structured
      const nonBlank = cont.filter((l) => !isBlank(l));
      if (nonBlank.length === 0) out[key] = null;
      else if (nonBlank.some((l) => /^\s*(- |-$|[A-Za-z0-9_"'-][^:]*:(\s|$))/.test(l))) continue;
      else out[key] = foldFlowLines(nonBlank.map(stripComment));
    } else if (value.startsWith("[") || value.startsWith("{")) {
      continue;
    } else {
      const parts = [value, ...cont.map((l) => (isBlank(l) ? "" : l))];
      // stop a plain scalar at a comment
      const kept = [];
      for (const p of parts) {
        const c = /(^|\s)#/.exec(p);
        if (c) {
          kept.push(p.slice(0, c.index));
          break;
        }
        kept.push(p);
      }
      out[key] = foldFlowLines(kept).trim();
    }
  }
  return out;
}

// ---------------------------------------------------------------- Footprint, Heavy, markers

function underFolder(path, folder) {
  return path.startsWith(folder.endsWith("/") ? folder : folder + "/");
}

/** Footprint of a Trace (types.ts `Footprint`). */
export function footprint(trace) {
  let bytes = 0;
  const outsideFolder = { files: 0, bytes: 0 };
  for (const f of trace.files) {
    bytes += f.size;
    if (!underFolder(f.path, trace.skillPath)) {
      outsideFolder.files++;
      outsideFolder.bytes += f.size;
    }
  }
  const seen = new Set();
  const outside = [];
  for (const o of trace.outside) {
    const k = `${o.kind}\0${o.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    outside.push({ kind: o.kind, name: o.name });
  }
  return { files: trace.files.length, bytes, outsideFolder, outside };
}

/** Heavy per GLOSSARY.md: traced bytes > 1 MiB, or an Outside requirement of a heavy kind. */
export function isHeavy(fp) {
  return fp.bytes > HEAVY_BYTES || fp.outside.some((o) => HEAVY_OUTSIDE_KINDS.includes(o.kind));
}

const MARKER_OF_KIND = { cli: "shell", package: "packages", network: "network", credential: "credentials", "mcp-server": "mcp" };
const MARKER_ORDER = ["shell", "packages", "network", "credentials", "mcp", "chain"];

/** Markers derivable from the Trace alone (interim, until the Classification contract). */
export function markers(trace) {
  const set = new Set();
  for (const o of trace.outside) if (MARKER_OF_KIND[o.kind]) set.add(MARKER_OF_KIND[o.kind]);
  const own = `${trace.skillPath}/SKILL.md`;
  const otherSkill = trace.files.some((f) => (f.path === "SKILL.md" || f.path.endsWith("/SKILL.md")) && f.path !== own);
  if ((trace.namedSkills?.length ?? 0) > 0 || otherSkill) set.add("chain");
  return MARKER_ORDER.filter((m) => set.has(m));
}

// ---------------------------------------------------------------- store paths

export function blobPath(sha) {
  if (!SHA.test(sha)) throw new Error(`bad blob sha: ${sha}`);
  return join(storeRoot(), "blobs", sha);
}

export function detailPath(candidate, revision) {
  const [owner, repo, name, ...rest] = candidate.split("/");
  if (rest.length || ![owner, repo, name].every((s) => SEGMENT.test(s ?? "")) || !SHA.test(revision)) {
    throw new Error(`bad skill id: ${candidate}@${revision}`);
  }
  return join(storeRoot(), "skills", owner, repo, `${name}@${revision}.json`);
}

export function cataloguePath(name) {
  if (!CATALOGUE_NAME.test(name)) throw new Error(`bad catalogue name: ${name}`);
  return join(storeRoot(), "catalogues", `${name}.json`);
}
