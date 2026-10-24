// Marker glyphs, the legend, and compact Footprint text shown by the Picker.

import { HEAVY_OUTSIDE_KINDS, type Footprint, type Listing, type Marker, type OutsideKind } from "./types.ts";

/** Every marker in display order, with its one-cell glyph and legend text. */
export const MARKERS: ReadonlyArray<{ marker: Marker; short: string; glyph: string; meaning: string; risky: boolean }> = [
  { marker: "shell", short: "shell", glyph: "$", meaning: "runs shell commands or CLIs", risky: false },
  { marker: "packages", short: "packages", glyph: "+", meaning: "needs packages or SDKs added to the system", risky: false },
  { marker: "network", short: "network", glyph: "⇅", meaning: "fetches from the network", risky: false },
  { marker: "credentials", short: "credentials", glyph: "¤", meaning: "needs credentials or API keys", risky: true },
  { marker: "mcp", short: "MCP", glyph: "◇", meaning: "needs an MCP server", risky: false },
  { marker: "chain", short: "chain-loads", glyph: "∞", meaning: "chain-loads sibling skills, or fetches more skills or code at run time", risky: false },
  { marker: "stub", short: "stub", glyph: "↪", meaning: "stub: thin router or wrapper whose content lives elsewhere", risky: false },
  { marker: "checkout", short: "checkout-only", glyph: "⎇", meaning: "has scripts that only work in a checkout of its repository", risky: false },
  { marker: "persistent", short: "persistent", glyph: "✎", meaning: "persistent side effects: writes outside the session", risky: true },
  { marker: "remote-code", short: "remote code", glyph: "↯", meaning: "fetches and runs unpinned remote code", risky: true },
  { marker: "opaque", short: "opaque", glyph: "▓", meaning: "opaque code: minified bundles, binaries, encoded blobs", risky: true },
  { marker: "untraced", short: "Untraced", glyph: "?", meaning: "Untraced: from skills.sh, no Trace, Footprint unknown", risky: true },
];

const ORDER = new Map(MARKERS.map((entry, index) => [entry.marker, index]));
const BY_MARKER = new Map(MARKERS.map((entry) => [entry.marker, entry]));

/** Markers implied by Outside requirements, so a Footprint's requirements always show as glyphs. */
const OUTSIDE_MARKER: Record<OutsideKind, Marker> = {
  cli: "shell",
  package: "packages",
  network: "network",
  credential: "credentials",
  "mcp-server": "mcp",
};

export function glyphOf(marker: Marker): string {
  return BY_MARKER.get(marker)?.glyph ?? "";
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

/** The Listing's own markers plus those its Outside requirements imply. */
export function listingMarkers(listing: Pick<Listing, "markers" | "footprint">): Marker[] {
  return sortMarkers([...(listing.markers ?? []), ...listing.footprint.outside.map((item) => OUTSIDE_MARKER[item.kind])]);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Compact Footprint for a listing row: `83 files · 5.3 MiB · 54 outside folder`. */
export function footprintRow(footprint: Footprint): string {
  const parts = [plural(footprint.files, "file", "files"), formatBytes(footprint.bytes)];
  if (footprint.outsideFolder.files > 0) parts.push(`${footprint.outsideFolder.files} outside folder`);
  return parts.join(" · ");
}

export const UNTRACED_FOOTPRINT = "Untraced · Footprint unknown";

const KIND_LABEL: Record<OutsideKind, string> = {
  cli: "CLI",
  package: "package",
  network: "network",
  credential: "credential",
  "mcp-server": "MCP server",
};

export function outsideLabel(item: { kind: OutsideKind; name: string }): string {
  return `${item.name} (${KIND_LABEL[item.kind]})`;
}

/** One line for Inspect: size, what it pulls in outside its folder, and every Outside requirement. */
export function footprintLine(footprint: Footprint): string {
  const parts = [plural(footprint.files, "file", "files"), formatBytes(footprint.bytes)];
  if (footprint.outsideFolder.files > 0) {
    parts.push(`${footprint.outsideFolder.files} outside its folder (${formatBytes(footprint.outsideFolder.bytes)})`);
  }
  const needs = footprint.outside.length ? ` · needs ${footprint.outside.map(outsideLabel).join(", ")}` : " · no Outside requirements";
  return parts.join(" · ") + needs;
}

/** The confirm text that names the cost of serving a Heavy skill. */
export function heavyConfirmLine(name: string, footprint: Footprint): string {
  const size = `${formatBytes(footprint.bytes)}, ${plural(footprint.files, "file", "files")}`;
  const heavyOutside = footprint.outside.filter((item) => HEAVY_OUTSIDE_KINDS.includes(item.kind));
  const needs = heavyOutside.length ? `; needs ${heavyOutside.map(outsideLabel).join(", ")}` : "";
  return `${name}: ${size}${needs}. Serve it?`;
}
