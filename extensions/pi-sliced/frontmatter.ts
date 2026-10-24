// Minimal YAML frontmatter reader for a SKILL.md: top-level scalar keys only (plain, quoted, block).
// Used for Untraced items, whose name and description no server has extracted.

export function frontmatter(text: string): Record<string, string> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const end = lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line));
  if (end < 0) return {};
  const body = lines.slice(1, end);
  const out: Record<string, string> = {};
  for (let i = 0; i < body.length; i++) {
    const m = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/.exec(body[i]);
    if (!m) continue;
    const key = m[1];
    const first = (m[2] ?? "").replace(/\s+#.*$/, "").trimEnd();
    // Continuation lines: indented (or blank) lines until the next top-level line.
    let j = i + 1;
    while (j < body.length && (body[j].trim() === "" || /^\s/.test(body[j]))) j++;
    const rest = body.slice(i + 1, j);
    i = j - 1;
    out[key] = scalar(first, rest, m[2] ?? "");
  }
  return out;
}

function scalar(first: string, rest: string[], raw: string): string {
  const block = /^([|>])([+-]?)\d*$/.exec(first);
  if (block) {
    const nonEmpty = rest.filter((l) => l.trim() !== "");
    const indent = Math.min(...nonEmpty.map((l) => /^\s*/.exec(l)![0].length));
    const ls = rest.map((l) => (l.trim() === "" ? "" : l.slice(indent)));
    while (block[2] !== "+" && ls.length && ls[ls.length - 1] === "") ls.pop();
    let text: string;
    if (block[1] === "|") text = ls.join("\n");
    else {
      text = "";
      for (let k = 0; k < ls.length; k++) {
        if (k === 0) text = ls[k];
        else if (ls[k] === "" || ls[k - 1] === "" || /^\s/.test(ls[k])) text += "\n" + ls[k];
        else text += " " + ls[k];
      }
    }
    return block[2] === "-" ? text : text + "\n";
  }
  const joined = [raw.trim(), ...rest.map((l) => l.trim())];
  if (raw.trim().startsWith('"')) {
    const src = foldQuoted(joined);
    try {
      return JSON.parse(src.slice(0, closingQuote(src, '"') + 1));
    } catch {
      return src.replace(/^"|"$/g, "");
    }
  }
  if (raw.trim().startsWith("'")) {
    const src = foldQuoted(joined);
    const end = closingQuote(src, "'");
    return src.slice(1, end).replace(/''/g, "'");
  }
  return foldQuoted([first, ...rest.map((l) => l.trim())]).trim();
}

/** YAML line folding: single newlines become spaces, blank lines become newlines. */
function foldQuoted(parts: string[]): string {
  let out = "";
  for (let k = 0; k < parts.length; k++) {
    if (k === 0) out = parts[k];
    else if (parts[k] === "") out += "\n";
    else out += out.endsWith("\n") ? parts[k] : " " + parts[k];
  }
  return out;
}

function closingQuote(s: string, q: string): number {
  for (let k = 1; k < s.length; k++) {
    if (q === '"' && s[k] === "\\") k++;
    else if (q === "'" && s[k] === "'" && s[k + 1] === "'") k++;
    else if (s[k] === q) return k;
  }
  return s.length;
}
