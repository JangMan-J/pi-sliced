// Classification v1 (proof 2): a description of what a skill pulls in, computed by deterministic code
// from its stored Trace alone (format pi-sliced.trace/2). No model, no network, no file contents:
// re-deriving it from the same Trace gives byte-identical output.
//
// Output format pi-sliced.classification/1 (docs/contracts/classification.md).
import { createHash } from "node:crypto";

export const CLASSIFIER = "classify-1";
export const FORMAT = "pi-sliced.classification/1";
const MiB = 1_048_576;

type At = [number, number];
export interface StoredTrace {
  format: string;
  tracer: string;
  judge: string;
  candidate: string;
  source: string;
  revision: string;
  skillPath: string;
  status: "resolved" | "unresolvable";
  reason?: string;
  totals: { files: number; bytes: number };
  files: { path: string; size: number; blob: string; how: string; from?: number; line?: number; judged?: string }[];
  outside: { kind: string; name: string; at: At[] }[];
  regions: { kind: "own" | "skill" | "package" | "repo"; path: string; files: number; bytes: number }[];
  signals: { kind: string; detail: string; at: At[] }[];
  namedSkills: { name: string; path: string; at: At[] }[];
  checkoutReach: { at: At; ref: string; target: string; package: string | null; files: number; bytes: number }[];
  licence: unknown;
}

// The marker set, in display order. Definitions: docs/contracts/classification.md.
export const MARKERS = [
  "runs-commands",
  "installs-packages",
  "network",
  "credentials",
  "mcp-server",
  "chain-loads",
  "stub",
  "checkout-scripts",
  "persistent-writes",
  "unpinned-code",
  "opaque-code",
  "sends-credentials",
  "agent-override-text",
] as const;
export type Marker = (typeof MARKERS)[number];

const ASSET_EXT = /\.(?:ttf|otf|woff2?|eot|png|jpe?g|gif|webp|bmp|ico|tiff?|psd|mp3|wav|ogg|flac|m4a|mp4|mov|webm|avi|mkv|pdf|zip|gz|tgz|bz2|xz|7z|cube|glb|gltf|bin|onnx|pt|safetensors)$/i;
const FONT_EXT = /\.(?:ttf|otf|woff2?|eot)$/i;
const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|bmp|ico|tiff?|psd)$/i;
const MEDIA_EXT = /\.(?:mp3|wav|ogg|flac|m4a|mp4|mov|webm|avi|mkv)$/i;

export function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MiB) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KiB`;
  return `${(bytes / MiB).toFixed(bytes < 10 * MiB ? 1 : 0)} MiB`;
}

export function sha256(s: string | Buffer): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface Classification {
  format: string;
  classifier: string;
  candidate: string;
  revision: string;
  trace: { path: string; sha256: string };
  status: "resolved" | "unresolvable";
  reason?: string;
  footprint?: Footprint;
  heavy?: { heavy: boolean; because: string[] };
  markers?: { marker: Marker; because: string[] }[];
  security?: Record<string, string[]>;
  companions?: { named: { name: string; path: string }[]; pulled: { path: string; files: number; bytes: number }[] };
  checkoutReach?: { edges: number; targets: string[]; files: number; bytes: number };
}

export interface Footprint {
  files: number;
  bytes: number;
  own: { files: number; bytes: number };
  otherSkills: { count: number; files: number; bytes: number };
  packages: { path: string; files: number; bytes: number }[];
  repoFiles: { files: number; bytes: number };
  assets: { fonts: number; images: number; media: number; other: number; bytes: number };
  outside: Record<"cli" | "package" | "mcp-server" | "credential" | "network", string[]>;
  summary: string; // the full one-line Footprint, for Inspect's compact Footprint block
  short: string; // counts only, for a listing row: `2.9 MiB · +44 skills · 28 CLI · 86 pkg · 38 keys · 12 hosts · MCP 1`
}

function footprint(t: StoredTrace): Footprint {
  const sum = (rs: StoredTrace["regions"]) => ({ files: rs.reduce((n, r) => n + r.files, 0), bytes: rs.reduce((n, r) => n + r.bytes, 0) });
  const skills = t.regions.filter((r) => r.kind === "skill");
  const assets = { fonts: 0, images: 0, media: 0, other: 0, bytes: 0 };
  for (const f of t.files) {
    if (!ASSET_EXT.test(f.path)) continue;
    assets.bytes += f.size;
    if (FONT_EXT.test(f.path)) assets.fonts++;
    else if (IMAGE_EXT.test(f.path)) assets.images++;
    else if (MEDIA_EXT.test(f.path)) assets.media++;
    else assets.other++;
  }
  const outside = { cli: [] as string[], package: [] as string[], "mcp-server": [] as string[], credential: [] as string[], network: [] as string[] };
  for (const o of t.outside) (outside as Record<string, string[]>)[o.kind]?.push(o.name);
  for (const k of Object.keys(outside)) (outside as Record<string, string[]>)[k].sort();
  const fp: Omit<Footprint, "summary" | "short"> = {
    files: t.totals.files,
    bytes: t.totals.bytes,
    own: sum(t.regions.filter((r) => r.kind === "own")),
    otherSkills: { count: skills.length, ...sum(skills) },
    packages: t.regions.filter((r) => r.kind === "package").map((r) => ({ path: r.path, files: r.files, bytes: r.bytes })),
    repoFiles: sum(t.regions.filter((r) => r.kind === "repo")),
    assets,
    outside,
  };
  return { ...fp, summary: summaryLine(fp), short: shortLine(fp) };
}

/** The listing-row Footprint: counts only; the markers carry the meaning. */
function shortLine(f: Omit<Footprint, "summary" | "short">): string {
  const o = f.outside;
  return [
    size(f.bytes),
    f.otherSkills.count ? `+${f.otherSkills.count} ${f.otherSkills.count === 1 ? "skill" : "skills"}` : null,
    o.cli.length ? `${o.cli.length} CLI` : null,
    o.package.length ? `${o.package.length} pkg` : null,
    o.credential.length ? `${o.credential.length} ${o.credential.length === 1 ? "key" : "keys"}` : null,
    o.network.length ? `${o.network.length} ${o.network.length === 1 ? "host" : "hosts"}` : null,
    o["mcp-server"].length ? `MCP ${o["mcp-server"].length}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The listing-row Footprint: size, what it pulls in, Outside requirements. */
function summaryLine(f: Omit<Footprint, "summary" | "short">): string {
  const parts = [`${f.files} ${f.files === 1 ? "file" : "files"}, ${size(f.bytes)}`];
  if (f.otherSkills.count) parts.push(`+${f.otherSkills.count} other ${f.otherSkills.count === 1 ? "skill" : "skills"}`);
  for (const p of f.packages) parts.push(`+package ${p.path || "(repo root)"}`);
  if (f.repoFiles.files) parts.push(`+${f.repoFiles.files} repo ${f.repoFiles.files === 1 ? "file" : "files"}`);
  const a = f.assets;
  const assetBits = [a.fonts && `${a.fonts} fonts`, a.images && `${a.images} images`, a.media && `${a.media} media`, a.other && `${a.other} other binaries`].filter(Boolean);
  if (assetBits.length) parts.push(assetBits.join(", "));
  const o = f.outside;
  const list = (label: string, xs: string[], max = 2) => (xs.length ? `${label} ${xs.slice(0, max).join(", ")}${xs.length > max ? ` +${xs.length - max}` : ""}` : null);
  for (const s of [list("MCP", o["mcp-server"]), list("CLI", o.cli), list("packages", o.package, 1), o.credential.length ? `${o.credential.length} ${o.credential.length === 1 ? "key" : "keys"}` : null, o.network.length ? `${o.network.length} ${o.network.length === 1 ? "host" : "hosts"}` : null])
    if (s) parts.push(s);
  return parts.join(" · ");
}

function heavy(t: StoredTrace): { heavy: boolean; because: string[] } {
  const because: string[] = [];
  if (t.totals.bytes > MiB) because.push(`files total ${size(t.totals.bytes)} (> 1 MiB)`);
  for (const [kind, one, many] of [["package", "package to install", "packages to install"], ["mcp-server", "MCP server", "MCP servers"], ["cli", "CLI", "CLIs"], ["credential", "credential", "credentials"]] as const) {
    const n = t.outside.filter((o) => o.kind === kind).length;
    if (n) because.push(`${n} ${n === 1 ? one : many}`);
  }
  return { heavy: because.length > 0, because };
}

const where = (t: StoredTrace, at: At[]) => at.slice(0, 3).map(([i, l]) => `${t.files[i]?.path ?? "?"}${l ? `:${l}` : ""}`);

function markers(t: StoredTrace, fp: Footprint): { marker: Marker; because: string[] }[] {
  const out: { marker: Marker; because: string[] }[] = [];
  const add = (marker: Marker, because: string[]) => because.length && out.push({ marker, because });
  const names = (kind: string) => t.outside.filter((o) => o.kind === kind).map((o) => o.name);
  const sig = (kind: string) => t.signals.filter((s) => s.kind === kind);
  add("runs-commands", names("cli").map((n) => `runs ${n}`));
  add("installs-packages", names("package").map((n) => `installs ${n}`));
  add("network", names("network").map((n) => `fetches from ${n}`));
  add("credentials", names("credential").map((n) => `needs ${n}`));
  add("mcp-server", names("mcp-server").map((n) => `uses the ${n} MCP server`));
  add("chain-loads", [
    ...t.regions.filter((r) => r.kind === "skill").map((r) => `pulls in ${r.files} ${r.files === 1 ? "file" : "files"} of the skill at ${r.path}`),
    ...sig("skill-fetch").map((s) => `fetches skills at run time: ${s.detail}`),
  ]);
  // Stub: a thin router or wrapper whose content lives elsewhere.
  const skillMd = t.files.find((f) => f.path === `${t.skillPath}/SKILL.md`);
  const elsewhere = fp.bytes - fp.own.bytes;
  if (skillMd && fp.own.bytes <= 4096 && (elsewhere >= 4 * fp.own.bytes || (fp.own.files === 1 && (names("cli").length > 0 || names("mcp-server").length > 0))))
    add("stub", [
      `own folder ${size(fp.own.bytes)} (${fp.own.files} ${fp.own.files === 1 ? "file" : "files"})`,
      elsewhere ? `${size(elsewhere)} outside it` : `content is the ${[...names("cli"), ...names("mcp-server")].slice(0, 2).join(", ")} it wraps`,
    ]);
  add("checkout-scripts", t.checkoutReach.map((c) => `code reaches ${c.target} (${c.files} files) in the repository checkout`));
  add("persistent-writes", sig("persist-write").map((s) => `writes to a ${s.detail}: ${where(t, s.at).join(", ")}`));
  add("unpinned-code", sig("fetch-run").map((s) => `${s.detail}: ${where(t, s.at).join(", ")}`));
  add("opaque-code", sig("opaque").map((s) => `${s.detail}: ${where(t, s.at).join(", ")}`));
  add("sends-credentials", sig("secret-egress").map((s) => `${s.detail}: ${where(t, s.at).join(", ")}`));
  add("agent-override-text", [...sig("injection"), ...sig("invisible-unicode")].map((s) => `${s.kind === "injection" ? `"${s.detail}"` : `invisible ${s.detail}`}: ${where(t, s.at).join(", ")}`));
  return out;
}

export function classify(traceBytes: string, tracePath: string): Classification {
  const t = JSON.parse(traceBytes) as StoredTrace;
  if (t.format !== "pi-sliced.trace/2") throw new Error(`${tracePath}: format ${t.format}; classify-1 reads pi-sliced.trace/2`);
  const base = { format: FORMAT, classifier: CLASSIFIER, candidate: t.candidate, revision: t.revision, trace: { path: tracePath, sha256: sha256(traceBytes) } };
  if (t.status !== "resolved") return { ...base, status: "unresolvable", reason: t.reason ?? "unresolvable" };
  const fp = footprint(t);
  const security: Record<string, string[]> = {};
  for (const s of t.signals) (security[s.kind] ??= []).push(`${s.detail} @ ${where(t, s.at).join(", ")}${s.at.length > 3 ? ` +${s.at.length - 3}` : ""}`);
  return {
    ...base,
    status: "resolved",
    footprint: fp,
    heavy: heavy(t),
    markers: markers(t, fp),
    security,
    companions: {
      named: t.namedSkills.map((n) => ({ name: n.name, path: n.path })),
      pulled: t.regions.filter((r) => r.kind === "skill").map((r) => ({ path: r.path, files: r.files, bytes: r.bytes })),
    },
    checkoutReach: {
      edges: t.checkoutReach.length,
      targets: [...new Set(t.checkoutReach.map((c) => c.package ?? c.target))].sort(),
      files: t.checkoutReach.reduce((n, c) => n + c.files, 0),
      bytes: t.checkoutReach.reduce((n, c) => n + c.bytes, 0),
    },
  };
}

/** JSON with one top-level key per line: compact, and a change shows as a line diff. */
export function serializeClassification(c: Classification): string {
  return `{\n${Object.entries(c).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(",\n")}\n}\n`;
}
