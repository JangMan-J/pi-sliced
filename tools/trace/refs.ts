// Extract candidate references from one text file. Extraction is deliberately
// generous: every path-shaped token is a candidate, tagged with where it
// appeared and the sentence around it. Whether a candidate is pulled in is
// decided in trace.ts, against the repository tree and the reading rules.

export type RefKind =
  | "link" // markdown link or reference-definition target
  | "code" // inline code span in prose
  | "bare" // path-shaped token in prose
  | "frontmatter" // value in YAML frontmatter
  | "fence" // token inside a fenced code block
  | "script"; // string literal or path expression in a script file

export interface Ref {
  line: number;
  raw: string; // the token as written
  kind: RefKind;
  text: string; // the whole source line, for evidence
  sentence: string; // the sentence holding the token (the line, for code)
}

const SCRIPT_EXT = /\.(?:py|js|mjs|cjs|ts|mts|cts|sh|bash|zsh|rb|ps1)$/i;
const MARKUP_EXT = /\.(?:md|mdx|mdc|markdown|txt|rst)$/i;
const TEXT_EXT = /\.(?:md|mdx|mdc|markdown|txt|rst|py|js|mjs|cjs|ts|mts|cts|tsx|jsx|sh|bash|zsh|rb|ps1|json|ya?ml|toml|html?|css|xml|svg|ini|cfg|env|liquid)$/i;

export function isText(path: string, bytes?: Buffer): boolean {
  if (TEXT_EXT.test(path)) return true;
  if (/\.[^/]+$/.test(path.split("/").pop() ?? "")) return false;
  // No extension: text if the first 8 KB has no NUL byte.
  return bytes ? !bytes.subarray(0, 8192).includes(0) : false;
}

export function isScript(path: string, text: string): boolean {
  return SCRIPT_EXT.test(path) || (!/\.[^/]+$/.test(path.split("/").pop() ?? "") && text.startsWith("#!"));
}

export function isMarkup(path: string): boolean {
  return MARKUP_EXT.test(path);
}

// A token is path-shaped when it names a file or directory: it has a slash, or
// ends in a short extension, and holds no spaces or URL scheme.
const PATHISH = /^(?:\$\{?[A-Za-z_][A-Za-z0-9_]*(?::[-+=?][^}]*)?\}?|~|\.{1,2}|[\w@<>{}*.+-]+)(?:\/[\w@<>{}*.+$-]*)*$/;

export function pathShaped(tok: string): boolean {
  if (!tok || tok.length > 300) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(tok) && !/^\$\{/.test(tok)) return false; // URL or scheme, but not ${VAR:...}
  if (tok.startsWith("//") || tok.startsWith("#")) return false;
  if (!PATHISH.test(tok)) return false;
  const last = tok.replace(/\/+$/, "").split("/").pop() ?? "";
  if (tok.includes("/")) {
    const literal = tok.replace(/<[^>]*>|\{[^}]*\}|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/g, "x").replace(/[./*]/g, "");
    return /[A-Za-z0-9_]/.test(literal);
  }
  return /^[\w@.<>{}*-]+\.[A-Za-z][A-Za-z0-9]{0,5}$/.test(last) && !/^\d+\.\d+/.test(last);
}

export function clean(tok: string): string {
  let t = tok.trim();
  // Strip wrapping punctuation, but keep a leading or trailing <placeholder>.
  t = t.replace(/^[("'`[]+/, "").replace(/^<(?![A-Za-z_][\w-]*>)/, "");
  for (let prev = ""; prev !== t; ) {
    prev = t;
    t = t.replace(/[)"'`\],;:!?]+$/, "").replace(/(?<!<[A-Za-z_][\w-]*)>$/, "");
    if (/[^./]\.$/.test(t)) t = t.slice(0, -1); // sentence full stop
  }
  return t;
}

const LINK = /!?\[(?:[^\]\\]|\\.)*\]\(\s*<?([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REFDEF = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/;
const CODESPAN = /(`+)([^`]|[^`].*?[^`])\1(?!`)/g;
const BARE = /(?:^|[\s(,;:])((?:\.{1,2}\/)?[\w@.-]+(?:\/[\w@.*<>{}-]+)+\/?|\.{1,2}\/[\w@.*<>{}-]+\/?)/g;
// A bare filename in prose, with a document or script extension.
const BARE_FILE = /(?:^|[\s(,;:])([\w@-][\w@.-]*\.(?:md|mdx|txt|json|ya?ml|py|js|mjs|cjs|ts|sh))(?=$|[\s),;:.!?])/g;

/** Drop shell test expressions (`[ -f x ]`, `[[ -d x ]]`, `test -e x`): an existence check pulls nothing in (F10). */
export function dropShellTests(line: string): string {
  return line.replace(/\[\[?\s[^\]]*\]\]?/g, " ").replace(/\btest\s+!?\s*-[a-zA-Z]\s+\S+/g, " ");
}

function splitShellTokens(line: string): string[] {
  // Rough shell tokenization: whitespace, quotes, and operators separate tokens.
  return line
    .split(/[\s"'`|&;()=,]+/)
    .map(clean)
    .filter(Boolean);
}

/** The sentence of `line` that holds the token at `index`. */
function sentenceAt(line: string, index: number): string {
  // Sentences end at . ! ? followed by space; a dot inside a path or name is not an end.
  const bounds = [...line.matchAll(/[.!?](?=\s+\S)/g)].map((m) => m.index! + 1);
  let start = 0;
  let end = line.length;
  for (const b of bounds) {
    if (b <= index) start = b;
    else {
      end = b;
      break;
    }
  }
  return line.slice(start, end).trim();
}

export function extractRefs(path: string, text: string): Ref[] {
  const refs: Ref[] = [];
  const lines = text.split("\n");
  if (isScript(path, text)) {
    lines.forEach((l, i) => scriptRefs(l, i + 1, refs));
    joinCalls(text, lines, refs);
    return refs;
  }
  if (!isMarkup(path)) return refs; // data files (json, yaml, …) direct nothing
  let fence: string | null = null;
  let front = lines[0]?.trim() === "---";
  lines.forEach((line, i) => {
    const n = i + 1;
    if (front) {
      if (i > 0 && line.trim() === "---") front = false;
      else if (i > 0 && /^\s*(?:-\s*)?command:\s/.test(line)) {
        // A hook command in frontmatter is shell code.
        const code = dropShellTests(line);
        for (const tok of splitShellTokens(code)) if (pathShaped(tok)) refs.push({ line: n, raw: tok, kind: "fence", text: line, sentence: code });
      } else if (i > 0) proseRefs(line, n, refs, "frontmatter");
      return;
    }
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f) {
      if (fence === null) fence = f[1][0].repeat(f[1].length);
      else if (line.trim().startsWith(fence)) fence = null;
      return;
    }
    if (fence !== null) {
      const code = dropShellTests(line.replace(/^\s*(?:#|\/\/).*$/, "").replace(/\s(?:#|\/\/)\s.*$/, ""));
      for (const tok of splitShellTokens(code)) if (pathShaped(tok)) refs.push({ line: n, raw: tok, kind: "fence", text: line, sentence: code });
      return;
    }
    proseRefs(line, n, refs, null);
  });
  return refs;
}

function proseRefs(line: string, n: number, refs: Ref[], forced: RefKind | null): void {
  let rest = line;
  const push = (raw: string, kind: RefKind, at: number) =>
    refs.push({ line: n, raw, kind: forced ?? kind, text: line, sentence: sentenceAt(line, Math.max(0, at)) });
  const d = line.match(REFDEF);
  if (d) push(d[1], "link", 0);
  for (const m of line.matchAll(LINK)) {
    push(m[1], "link", m.index!);
    rest = rest.replace(m[0], " ".repeat(m[0].length));
  }
  // "`/pr-to-video` → `references/`": a skill named by slash-name, then a path inside it (F2's name-plus-path form).
  for (const m of rest.matchAll(/`\/?([a-z0-9][\w-]*)`\s*(?:→|->)\s*`([^`\s]+)`/g)) {
    const tok = `${m[1]}/${clean(m[2]).replace(/^\.\//, "")}`;
    if (pathShaped(tok)) push(tok, "code", m.index!);
    rest = rest.slice(0, m.index!) + " ".repeat(m[0].length) + rest.slice(m.index! + m[0].length);
  }
  for (const m of rest.matchAll(CODESPAN)) {
    const inner = m[2].trim();
    if (pathShaped(clean(inner))) push(clean(inner), "code", m.index!);
    else for (const tok of splitShellTokens(inner)) if (pathShaped(tok)) push(tok, "code", m.index!);
    rest = rest.slice(0, m.index!) + " ".repeat(m[0].length) + rest.slice(m.index! + m[0].length);
  }
  rest = rest.replace(/https?:\/\/\S+/g, (u) => " ".repeat(u.length));
  const seen = new Set<string>();
  for (const m of rest.matchAll(BARE)) {
    const tok = clean(m[1]);
    if (pathShaped(tok)) {
      seen.add(tok);
      push(tok, "bare", m.index!);
    }
  }
  for (const m of rest.matchAll(BARE_FILE)) {
    const tok = clean(m[1]);
    if (!seen.has(tok) && pathShaped(tok)) push(tok, "bare", m.index!);
  }
}

const STRING = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;

/** path.join / path.resolve calls, across lines and with nested calls: their literal arguments form a relative path. */
function joinCalls(text: string, lines: string[], refs: Ref[]): void {
  const starts = [0];
  for (const l of lines) starts.push(starts[starts.length - 1] + l.length + 1);
  const lineAt = (pos: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  for (const m of text.matchAll(/\b(?:join|resolve)\(/g)) {
    let depth = 1;
    let i = m.index! + m[0].length;
    const args: string[] = [];
    let cur = "";
    let quote = "";
    for (; i < text.length && depth > 0; i++) {
      const c = text[i];
      if (quote) {
        cur += c;
        if (c === "\\") cur += text[++i] ?? "";
        else if (c === quote) quote = "";
        continue;
      }
      if (c === '"' || c === "'" || c === "`") quote = c;
      if (c === "(" || c === "[" || c === "{") depth++;
      if (c === ")" || c === "]" || c === "}") depth--;
      if (depth === 0) break;
      if (c === "," && depth === 1) {
        args.push(cur.trim());
        cur = "";
      } else cur += c;
      if (i - m.index! > 2000) break; // not a call we can read
    }
    if (depth !== 0) continue;
    args.push(cur.trim());
    const parts = args.map((a) => a.match(/^(["'])(.*)\1$/)?.[2]).filter((x): x is string => x !== undefined);
    if (!parts.length) continue;
    const joined = parts.join("/");
    const n = lineAt(m.index!);
    if (/^\s*(?:#|\/\/|\*)/.test(lines[n - 1] ?? "")) continue;
    if (pathShaped(joined) && !refs.some((r) => r.line === n && r.raw === joined)) refs.push({ line: n, raw: joined, kind: "script", text: lines[n - 1] ?? "", sentence: lines[n - 1] ?? "" });
  }
}

function scriptRefs(rawLine: string, n: number, refs: Ref[]): void {
  // Comments direct nothing at run time.
  const line = dropShellTests(rawLine.replace(/^\s*(?:#|\/\/|\*|\/\*).*$/, "").replace(/\s(?:#|\/\/)\s.*$/, ""));
  if (!line.trim()) return;
  const push = (raw: string) => refs.push({ line: n, raw, kind: "script", text: rawLine, sentence: line });
  for (const m of line.matchAll(STRING)) {
    const s = clean(m[2]);
    if (pathShaped(s)) push(s);
  }
  // Shell scripts: unquoted path tokens too.
  for (const tok of splitShellTokens(line.replace(STRING, " "))) {
    if (tok.includes("/") && pathShaped(tok)) push(tok);
  }
}
