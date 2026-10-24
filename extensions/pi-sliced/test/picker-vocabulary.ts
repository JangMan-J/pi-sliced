// The vocabulary rule (INVARIANTS.md "Will not be"; GLOSSARY.md Author text), made mechanical for the unit tests
// and scripts/check-stranger: pi-sliced's own text never says "install" or "download"; Author text is exempt and
// is recognised only by how the Picker marks it (the `│` gutter, quotes), never by guessing.

export const FORBIDDEN = /install|download/i;

/**
 * String literals that are keys of other components' output, matched by the Picker and never shown:
 * the classify-1 marker key and two signal details the tracer writes (tools/trace/signals.ts).
 */
export const FOREIGN_KEYS: ReadonlySet<string> = new Set(["installs-packages", "pip install from URL", "install @latest"]);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The pi-sliced-authored text of a screen. Dropped: every line drawn behind the Author gutter (`│` as the first
 * non-blank cell: whole files and the frontmatter description); quoted spans (`…` and “…”: names, paths, excerpts,
 * the copyright line); and whole-token occurrences of `authorStrings` (the skill names, ids and sources that rows
 * and titles show bare).
 */
export function ownText(lines: readonly string[], authorStrings: readonly string[] = []): string {
  const tokens = [...new Set(authorStrings.filter((s) => s.length > 0))].sort((a, b) => b.length - a.length);
  const bare = tokens.length ? new RegExp(`(?<![\\w./@-])(?:${tokens.map(escape).join("|")})(?![\\w/@-])`, "g") : undefined;
  return lines
    .map((line) => {
      if (/^\s*│/.test(line)) return "";
      let out = line.replace(/`[^`\n]*`/g, "``").replace(/“[^”\n]*”/g, "“”");
      if (bare) out = out.replace(bare, "");
      return out;
    })
    .join("\n");
}

/** Lines of a screen that hold a forbidden word in pi-sliced-authored text. */
export function ownViolations(lines: readonly string[], authorStrings: readonly string[] = []): string[] {
  const own = ownText(lines, authorStrings).split("\n");
  return lines.filter((_, i) => FORBIDDEN.test(own[i] ?? ""));
}

/**
 * Every string literal in a TypeScript/JavaScript source, including the static parts of template literals.
 * Comments and regular expression literals are skipped (patterns are not shown text).
 */
export function stringLiterals(src: string): string[] {
  const out: string[] = [];
  const n = src.length;
  let prev = ""; // last significant token, to tell a regex literal from division

  const regexAllowed = () => prev === "" || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /^(?:return|typeof|case|in|of|void|delete|throw|new|yield|await|else|do)$/.test(prev);

  function readQuoted(i: number, q: string): number {
    let buf = "";
    while (i < n && src[i] !== q) {
      if (src[i] === "\\") {
        buf += src[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (src[i] === "\n") break;
      buf += src[i++];
    }
    out.push(buf);
    return i + 1;
  }

  function readTemplate(i: number): number {
    let buf = "";
    while (i < n) {
      const c = src[i];
      if (c === "\\") {
        buf += src[i + 1] ?? "";
        i += 2;
      } else if (c === "`") {
        out.push(buf);
        return i + 1;
      } else if (c === "$" && src[i + 1] === "{") {
        out.push(buf);
        buf = "";
        i = readCode(i + 2, true);
      } else {
        buf += c;
        i++;
      }
    }
    out.push(buf);
    return i;
  }

  function readRegex(i: number): number {
    let inClass = false;
    while (i < n && src[i] !== "\n") {
      const c = src[i];
      if (c === "\\") i += 2;
      else if (c === "[") (inClass = true), i++;
      else if (c === "]") (inClass = false), i++;
      else if (c === "/" && !inClass) {
        i++;
        while (i < n && /[a-z]/i.test(src[i])) i++;
        return i;
      } else i++;
    }
    return i;
  }

  function readCode(i: number, untilBrace: boolean): number {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") {
        while (i < n && src[i] !== "\n") i++;
      } else if (c === "/" && src[i + 1] === "*") {
        const end = src.indexOf("*/", i + 2);
        i = end < 0 ? n : end + 2;
      } else if (c === '"' || c === "'") {
        i = readQuoted(i + 1, c);
        prev = "str";
      } else if (c === "`") {
        i = readTemplate(i + 1);
        prev = "str";
      } else if (c === "/" && regexAllowed()) {
        i = readRegex(i + 1);
        prev = "re";
      } else if (/\s/.test(c)) {
        i++;
      } else if (/[\w$]/.test(c)) {
        let j = i;
        while (j < n && /[\w$]/.test(src[j])) j++;
        prev = src.slice(i, j);
        i = j;
      } else {
        if (c === "{") depth++;
        if (c === "}") {
          if (untilBrace && depth === 0) {
            prev = "str";
            return i + 1;
          }
          depth--;
        }
        prev = c;
        i++;
      }
    }
    return i;
  }

  readCode(0, false);
  return out;
}

/** String literals of a source that hold a forbidden word, apart from FOREIGN_KEYS. */
export function literalViolations(src: string): string[] {
  return stringLiterals(src).filter((s) => FORBIDDEN.test(s) && !FOREIGN_KEYS.has(s));
}
