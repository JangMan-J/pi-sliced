// Marker glyphs, the legend, and the Picker's own wording for Classification text.

import type { Footprint, Marker, MarkerEntry } from "./types.ts";

/** Every marker in the Classification's fixed order, then `untraced`, with a one-cell glyph and the Picker's wording. */
export const MARKERS: ReadonlyArray<{ marker: Marker; short: string; glyph: string; meaning: string; risky: boolean }> = [
  { marker: "runs-commands", short: "commands", glyph: "$", meaning: "runs shell commands or CLIs", risky: false },
  { marker: "installs-packages", short: "packages", glyph: "+", meaning: "adds packages or SDKs to the system", risky: false },
  { marker: "network", short: "network", glyph: "⇅", meaning: "fetches from the network", risky: false },
  { marker: "credentials", short: "credentials", glyph: "¤", meaning: "needs credentials or API keys", risky: false },
  { marker: "mcp-server", short: "MCP", glyph: "◇", meaning: "needs an MCP server", risky: false },
  { marker: "chain-loads", short: "chain-loads", glyph: "∞", meaning: "chain-loads: pulls in other skills' files, or fetches more skills at run time", risky: false },
  { marker: "stub", short: "stub", glyph: "↪", meaning: "stub: a thin wrapper whose content lives elsewhere", risky: false },
  { marker: "checkout-scripts", short: "checkout-only", glyph: "⎇", meaning: "has scripts that only work in a checkout of its repository", risky: false },
  { marker: "persistent-writes", short: "persistent", glyph: "✎", meaning: "persistent side effects: writes outside the session", risky: true },
  { marker: "unpinned-code", short: "remote code", glyph: "↯", meaning: "fetches and runs unpinned remote code", risky: true },
  { marker: "opaque-code", short: "opaque", glyph: "▓", meaning: "opaque code: minified bundles, binaries, encoded blobs", risky: true },
  { marker: "sends-credentials", short: "sends secrets", glyph: "↗", meaning: "sends credentials to a remote host", risky: true },
  { marker: "agent-override-text", short: "override text", glyph: "!", meaning: "text aimed at overriding the agent, or invisible Unicode", risky: true },
  { marker: "untraced", short: "Untraced", glyph: "?", meaning: "Untraced: from skills.sh, no Trace, Footprint unknown", risky: true },
];

const ORDER = new Map(MARKERS.map((entry, index) => [entry.marker, index]));
const BY_MARKER = new Map(MARKERS.map((entry) => [entry.marker, entry]));

export function glyphOf(marker: Marker): string {
  return BY_MARKER.get(marker)?.glyph ?? "";
}

export function shortOf(marker: Marker): string {
  return BY_MARKER.get(marker)?.short ?? marker;
}

export function meaningOf(marker: Marker): string {
  return BY_MARKER.get(marker)?.meaning ?? marker;
}

export function isRisky(marker: Marker): boolean {
  return BY_MARKER.get(marker)?.risky ?? false;
}

/** Distinct known markers in display order. */
export function sortMarkers(markers: Iterable<Marker>): Marker[] {
  return [...new Set(markers)].filter((marker) => ORDER.has(marker)).sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);
}

/** A branch shows the union of its children's markers. */
export function unionMarkers(lists: Iterable<Iterable<Marker>>): Marker[] {
  const all: Marker[] = [];
  for (const list of lists) all.push(...list);
  return sortMarkers(all);
}

/** The Listing's markers, as given. */
export function entryMarkers(entries: readonly MarkerEntry[] | undefined): Marker[] {
  return sortMarkers((entries ?? []).map((entry) => entry.marker));
}

const REWRITES: Array<[RegExp, string]> = [
  [/\binstallation(s?)\b/gi, "setup$1"],
  [/\binstaller(s?)\b/gi, "setup tool$1"],
  [/\binstalling\b/gi, "adding"],
  [/\binstalled\b/gi, "added"],
  [/\binstalls\s+(?=[@\w])/gi, "adds package "],
  [/\binstalls\b/gi, "adds"],
  [/\binstall\b/gi, "add"],
  [/\bdownloadable\b/gi, "fetchable"],
  [/\bdownloading\b/gi, "fetching"],
  [/\bdownloaded\b/gi, "fetched"],
  [/\bdownloads\b/gi, "fetches"],
  [/\bdownload\b/gi, "fetch"],
];

/**
 * The Picker's wording for text the Classification wrote in its own templates (`heavy.because`, and any
 * `because` or signal whose template is not known below): the two words the Picker never uses (see REWRITES)
 * become "add" and "fetch", deterministically and only as whole words.
 * Author text (SKILL.md, file paths, command, package and tool names) is never passed through this; it is quoted.
 */
export function ourWords(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REWRITES) out = out.replace(pattern, (...m) => matchCase(m[0], replacement.replace("$1", m[1] ?? "")));
  return out;
}

function matchCase(original: string, replacement: string): string {
  return /^[A-Z]/.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
}

// ── Author text inside the Picker's own lines ───────────────────────────────────────────────────────

/**
 * A name, path or excerpt from a skill's files, shown verbatim and marked as the author's: in backticks, or
 * in “ ” when it holds a backtick. Everything outside the quotes on a line is the Picker's own text.
 */
export function quote(text: string): string {
  return text.includes("`") ? `“${text}”` : `\`${text}\``;
}

/** Signal details the tracer writes in its own words (not excerpts), in the Picker's wording. */
const SIGNAL_LABELS: Record<string, string> = {
  "pipe to interpreter": "pipes a fetched script into an interpreter",
  "pip install from URL": "pip package from a URL",
  "go @latest": "Go module at @latest",
  "install @latest": "package at @latest",
  "skill folder": "skill folder",
  "shell rc": "shell startup file",
  autostart: "autostart entry",
  ssh: "SSH folder",
  "minified script": "minified script",
  "encoded blob": "encoded blob",
};

/** `a/b.md:12, c.md:5` (and an optional ` +N`) → each place quoted. */
function places(where: string): string {
  const more = / \+(\d+)$/.exec(where);
  const list = (more ? where.slice(0, more.index) : where).split(", ").filter(Boolean).map(quote).join(", ");
  return more ? `${list} and ${more[1]} more` : list;
}

/** One signal's detail by kind: the tracer's labels in the Picker's wording, excerpts and names quoted. */
function signalDetail(kind: string, detail: string): string {
  if (detail in SIGNAL_LABELS) return SIGNAL_LABELS[detail];
  switch (kind) {
    case "fetch-run":
    case "skill-fetch":
    case "injection":
      return quote(detail);
    case "secret-egress": {
      const arrow = detail.indexOf(" -> ");
      return arrow > 0 ? `${quote(detail.slice(0, arrow))} to ${quote(detail.slice(arrow + 4))}` : quote(detail);
    }
    case "invisible-unicode":
      return `invisible character ${detail}`;
    case "opaque": {
      const binary = /^binary (.+)$/.exec(detail);
      return binary ? `binary (${binary[1]})` : ourWords(detail);
    }
    case "persist-write":
      return ourWords(detail);
    default:
      return quote(detail);
  }
}

/** A Classification `security` signal (`<detail> @ <places>`), in the Picker's wording with Author text quoted. */
export function signalText(kind: string, signal: string): string {
  const at = signal.lastIndexOf(" @ ");
  if (at < 0) return signalDetail(kind, signal);
  return `${signalDetail(kind, signal.slice(0, at))} at ${places(signal.slice(at + 3))}`;
}

/** A marker's `because` line from classify-1's templates, in the Picker's wording with Author text quoted. */
export function reasonText(marker: Marker, because: string): string {
  const m = (re: RegExp) => re.exec(because);
  const split = (s: string) => {
    const at = s.indexOf(": ");
    return at < 0 ? undefined : [s.slice(0, at), s.slice(at + 2)];
  };
  let r: RegExpExecArray | null;
  switch (marker) {
    case "runs-commands":
      if ((r = m(/^runs (.+)$/))) return `runs ${quote(r[1])}`;
      break;
    case "installs-packages":
      if ((r = m(/^\S+ (.+)$/))) return `adds package ${quote(r[1])}`;
      break;
    case "network":
      if ((r = m(/^fetches from (.+)$/))) return `fetches from ${quote(r[1])}`;
      break;
    case "credentials":
      if ((r = m(/^needs (.+)$/))) return `needs ${quote(r[1])}`;
      break;
    case "mcp-server":
      if ((r = m(/^uses the (.+) MCP server$/))) return `uses the ${quote(r[1])} MCP server`;
      break;
    case "chain-loads":
      if ((r = m(/^pulls in (\d+ files?) of the skill at (.+)$/))) return `pulls in ${r[1]} of the skill at ${quote(r[2])}`;
      if ((r = m(/^fetches skills at run time: (.+)$/))) return `fetches skills at run time: ${quote(r[1])}`;
      break;
    case "stub":
      if ((r = m(/^content is the (.+) it wraps$/))) return `content is the ${r[1].split(", ").map(quote).join(", ")} it wraps`;
      if (/^own folder [\d.]+ \S+ \(\d+ files?\)$|^[\d.]+ \S+ outside it$/.test(because)) return because;
      break;
    case "checkout-scripts":
      if ((r = m(/^code reaches (.+) \((\d+ files?)\) in the repository checkout$/))) return `code reaches ${quote(r[1])} (${r[2]}) in the repository checkout`;
      break;
    case "persistent-writes":
      if ((r = m(/^writes to a (.+?): (.+)$/))) return `writes to a ${signalDetail("persist-write", r[1])}: ${places(r[2])}`;
      break;
    case "unpinned-code":
    case "opaque-code":
    case "sends-credentials": {
      const kind = { "unpinned-code": "fetch-run", "opaque-code": "opaque", "sends-credentials": "secret-egress" }[marker];
      const parts = split(because);
      if (parts) return `${signalDetail(kind, parts[0])} at ${places(parts[1])}`;
      break;
    }
    case "agent-override-text":
      if ((r = m(/^"(.*)": ([^"]+)$/))) return `text ${quote(r[1])} at ${places(r[2])}`;
      if ((r = m(/^invisible (.+?): (.+)$/))) return `invisible character ${r[1]} at ${places(r[2])}`;
      break;
  }
  return ourWords(because);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Compact Footprint for a listing row: the Classification's counts-only `footprint.short`. */
export function footprintRow(footprint: Footprint): string {
  return ourWords(footprint.short || formatBytes(footprint.bytes));
}

/**
 * The compact Footprint block of Inspect: the Classification's one-line `footprint.summary`, with the names it
 * lists (MCP servers, CLIs, packages, package paths) quoted as Author text.
 */
export function footprintLine(footprint: Footprint): string {
  if (!footprint.summary) return `${plural(footprint.files, "file", "files")}, ${formatBytes(footprint.bytes)}`;
  return footprint.summary
    .split(" · ")
    .map((part) => {
      const named = /^(MCP|CLI|packages|\+package) (.+?)( \+\d+)?$/.exec(part);
      if (!named || named[2] === "(repo root)") return ourWords(part);
      return `${named[1]} ${named[2].split(", ").map(quote).join(", ")}${named[3] ?? ""}`;
    })
    .join(" · ");
}

export const UNTRACED_FOOTPRINT = "Untraced · Footprint unknown";

const KIND_LABEL: Record<string, string> = {
  cli: "CLI",
  package: "package",
  network: "network",
  credential: "credential",
  "mcp-server": "MCP server",
};

export function outsideKindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

const SECURITY_LABEL: Record<string, string> = {
  "fetch-run": "fetches and runs remote code",
  "persist-write": "writes outside the session",
  "secret-egress": "sends credentials out",
  injection: "text aimed at overriding the agent",
  "invisible-unicode": "invisible or bidirectional Unicode",
  opaque: "opaque code",
  "skill-fetch": "fetches more skills at run time",
};

export function securityLabel(kind: string): string {
  return SECURITY_LABEL[kind] ?? ourWords(kind);
}

/** Why it is Heavy, in the Picker's wording. */
export function heavyReasons(heavyBecause: readonly string[] | undefined): string[] {
  return (heavyBecause ?? []).map(ourWords);
}

/** The confirm text: the cost from the Footprint (size, files), plus the other Heavy reasons. */
export function heavyConfirmLine(name: string, footprint: Footprint, heavyBecause: readonly string[] = []): string {
  const size = `${formatBytes(footprint.bytes)}, ${plural(footprint.files, "file", "files")}`;
  const others = heavyReasons(heavyBecause).filter((reason) => !/^files total\b/i.test(reason));
  return `${name}: ${size}${others.length ? `; ${others.join(", ")}` : ""}. Serve it?`;
}
