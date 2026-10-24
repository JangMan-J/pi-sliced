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
 * The Picker's wording for text the Classification wrote (`because`, `heavy.because`, security signals):
 * the two words the Picker never uses (see REWRITES) become "add" and "fetch", deterministically and only as whole words.
 * Skill content (SKILL.md, file paths, command and package names) is never passed through this.
 */
export function ourWords(text: string): string {
  let out = text;
  for (const [pattern, replacement] of REWRITES) out = out.replace(pattern, (...m) => matchCase(m[0], replacement.replace("$1", m[1] ?? "")));
  return out;
}

function matchCase(original: string, replacement: string): string {
  return /^[A-Z]/.test(original) ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
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

/** The compact Footprint block of Inspect: the Classification's one-line `footprint.summary`. */
export function footprintLine(footprint: Footprint): string {
  return ourWords(footprint.summary || `${plural(footprint.files, "file", "files")}, ${formatBytes(footprint.bytes)}`);
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
