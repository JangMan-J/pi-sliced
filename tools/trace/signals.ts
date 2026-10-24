// Signals: facts about what a pulled-in file's text does, recorded in the Trace so that a Classification
// can be derived from the Trace alone (no file contents, no network). Each signal is one kind, a short
// detail, and where it was seen. They are facts, not verdicts: a signal says "this line pipes curl into sh",
// and the Classification and the Determination decide what that means.

export type SignalKind =
  | "fetch-run" // fetches remote code and runs it unpinned: curl|sh, npx pkg (no version), pkg@latest, pip install git+…
  | "skill-fetch" // fetches more skills at run time: `npx skills add`, `<cli> skills update`
  | "persist-write" // writes somewhere that outlives the session: skill folders, shell rc, autostart, ~/.ssh
  | "secret-egress" // a secret-shaped variable and a non-loopback host on one command line
  | "injection" // text aimed at overriding the agent or hiding actions from the user
  | "invisible-unicode" // zero-width, bidirectional-control, or tag characters
  | "opaque"; // code a reader cannot read: an executable binary, a minified script, an encoded blob

export interface Signal {
  kind: SignalKind;
  detail: string;
  from: string;
  line: number;
}

// ---- file-level facts ----------------------------------------------------------------------------

const EXECUTABLE_EXT = /\.(?:exe|dll|so|dylib|bin|wasm|jar|class|pyc|pyo|o|a|node|msi|deb|rpm|apk|appimage)$/i;

/** Magic numbers of executable formats: ELF, PE (MZ), Mach-O (both byte orders, fat), wasm, Java class. */
function executableMagic(b: Buffer): string | null {
  if (b.length < 4) return null;
  const m = b.readUInt32BE(0);
  if (m === 0x7f454c46) return "ELF";
  if (b[0] === 0x4d && b[1] === 0x5a) return "PE";
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(m)) return m === 0xcafebabe ? "Mach-O fat or Java class" : "Mach-O";
  if (m === 0x0061736d) return "wasm";
  return null;
}

const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|\uDB40[\uDC00-\uDC7F]/g;
const OVERRIDE = [
  /\bignore (?:all |any )?(?:the )?(?:previous|prior|above|earlier|preceding) (?:instructions|prompts|rules|messages)\b/i,
  /\bdisregard (?:all |any )?(?:the )?(?:previous|prior|above|system|earlier) (?:instructions|prompts|rules)\b/i,
  /\b(?:forget|override) (?:all |any |your )?(?:previous |prior |system )?(?:instructions|system prompt|guidelines|rules)\b/i,
  /\byou are no longer\b/i,
  /\b(?:do not|don't|never) (?:tell|inform|show|reveal to|mention (?:this |it )?to|notify) the user\b/i,
  /\bwithout (?:telling|informing|notifying|asking) the user\b/i,
  /\b(?:hide|conceal) (?:this|these|it|them) from the user\b/i,
  /\breveal (?:your|the) system prompt\b/i,
];

/** Facts about one pulled-in file as a whole: opacity, invisible characters, override phrases. */
export function fileSignals(path: string, bytes: Buffer, text: string | null): Signal[] {
  const out: Signal[] = [];
  if (text === null) {
    const magic = executableMagic(bytes);
    if (magic || EXECUTABLE_EXT.test(path)) out.push({ kind: "opaque", detail: `binary ${magic ?? path.split(".").pop()}`, from: path, line: 0 });
    return out;
  }
  const lines = text.split("\n");
  const script = /\.(?:m?js|cjs|ts|mts|cts|jsx|tsx|py|sh|bash|zsh|rb|ps1|php|pl|lua)$/i.test(path) && !/\.d\.[mc]?ts$/i.test(path);
  let minified = 0;
  let encoded = 0;
  lines.forEach((l, i) => {
    const n = i + 1;
    // Minified: a very long line that is almost all code, not a long prose comment.
    if (script && !minified && l.length >= 2000 && (l.match(/\s/g)?.length ?? 0) / l.length < 0.1) minified = n;
    if (!encoded && /[A-Za-z0-9+/]{2000,}={0,2}|[0-9a-fA-F]{2000,}/.test(l)) encoded = n;
    for (const m of l.matchAll(ZERO_WIDTH)) {
      if (m[0] === "\uFEFF" && i === 0 && m.index === 0) continue; // a byte-order mark
      // A zero-width joiner inside an emoji sequence (👩\u200D💻) is ordinary text.
      if (m[0] === "\u200D" && /[^\x00-\x7F]/.test(l[m.index! - 1] ?? "") && /[^\x00-\x7F]/.test(l[m.index! + 1] ?? "")) continue;
      const cp = m[0].codePointAt(0)!;
      out.push({ kind: "invisible-unicode", detail: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`, from: path, line: n });
    }
    for (const re of OVERRIDE) {
      const m = l.match(re);
      if (m) out.push({ kind: "injection", detail: m[0].toLowerCase(), from: path, line: n });
    }
  });
  if (minified) out.push({ kind: "opaque", detail: "minified script", from: path, line: minified });
  if (encoded) out.push({ kind: "opaque", detail: "encoded blob", from: path, line: encoded });
  return out;
}

// ---- command-line facts ----------------------------------------------------------------------------

// A write: a redirect, a copying or creating command, or a file-writing call, before the target.
const WRITE = /(?:^|[^-<>=])>>?|\b(?:cp|mv|ln|install|rsync|tee|mkdir|touch|unzip|ditto|New-Item|Copy-Item|Set-Content|Add-Content|Out-File|cpSync|mkdirSync)\b|\btar\s+-?x|\bgit\s+clone\b|\b(?:writeFile|appendFile|copyFile|symlink)\w*|\bshutil\.(?:copy\w*|move)\b|\bopen\([^)]*["'][wa]["']|\b(?:curl\s[^|;]*-o|wget\s[^|;]*-O)\s/;
const PERSIST_TARGETS: [RegExp, string][] = [
  [/(?:~|\$\{?HOME\}?|%USERPROFILE%|\$env:USERPROFILE)?[/\\]\.(?:claude|agents|codex|cursor|gemini|windsurf|opencode|pi[/\\]agent|pi)[/\\](?:skills|rules|commands|agents|plugins)\b/i, "skill folder"],
  [/(?:^|[\s"'=(])\.(?:claude|agents|pi)[/\\]skills\b/, "skill folder"],
  [/["']\.(?:claude|agents|codex|cursor|pi)["']\s*,\s*["'](?:skills|agent)["']/, "skill folder"],
  [/(?:~|\$\{?HOME\}?)[/\\]\.(?:bashrc|zshrc|profile|bash_profile|zprofile|zshenv|config[/\\]fish[/\\]config\.fish)\b/, "shell rc"],
  [/\/etc\/cron|[/\\]systemd[/\\](?:user|system)\b|LaunchAgents|LaunchDaemons|\\CurrentVersion\\Run\b/, "autostart"],
  [/(?:~|\$\{?HOME\}?)[/\\]\.ssh\b|\bauthorized_keys\b/, "ssh"],
];
// Commands that install something to start on its own; no target path needed.
const AUTOSTART = /\bcrontab\s+(?!-l\b)\S|\bsystemctl\s+(?:--user\s+)?enable\b|\blaunchctl\s+(?:load|bootstrap)\b|\bschtasks\s+\/create\b/i;

const PIPE_TO_SHELL = [
  /\b(?:curl|wget|fetch)\b[^|;&]*\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/,
  /\b(?:curl|wget)\b[^|;&]*\|\s*(?:sudo\s+)?(?:python3?|node|perl|ruby)\b/,
  /\b(?:ba|z)?sh\s+(?:-c\s+)?["']?\$\(\s*(?:curl|wget)\b/,
  /\b(?:ba|z)?sh\s+<\(\s*(?:curl|wget)\b/,
  /\b(?:iex|Invoke-Expression)\b[^;]*\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod|DownloadString)\b/i,
  /\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|;]*\|\s*(?:iex|Invoke-Expression)\b/i,
];

const SECRET_REF = /\$\{?([A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|PASSWORD|_CREDS|_CREDENTIALS))\b|\benv\.([A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|PASSWORD|_CREDS|_CREDENTIALS))\b|\benviron(?:\.get)?\s*[([]\s*["']([A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|PASSWORD|_CREDS|_CREDENTIALS))["']/g;
const HOST = /\bhttps?:\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
const LOOPBACK = /^(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0)$|(?:^|\.)example\.(?:com|org|net)$/i;

/** Facts about one command line (a shell-fence line, an inline command span, or a run-script line). */
export function lineSignals(l: string, from: string, line: number, out: Signal[]): void {
  for (const re of PIPE_TO_SHELL) if (re.test(l)) {
    out.push({ kind: "fetch-run", detail: "pipe to interpreter", from, line });
    break;
  }
  if (/\bpip3?\s+install\b[^;&|]*\bgit\+/.test(l) || /\bpip3?\s+install\s+(?:-\S+\s+)*https?:\/\//.test(l)) out.push({ kind: "fetch-run", detail: "pip install from URL", from, line });
  if (/\bgo\s+(?:run|install)\s+\S+@latest\b/.test(l)) out.push({ kind: "fetch-run", detail: "go @latest", from, line });
  if (/\b(?:npm|pnpm|yarn|bun)\s+(?:install|i|add)\b[^;&|]*@(?:latest|next|canary)\b/.test(l)) out.push({ kind: "fetch-run", detail: "install @latest", from, line });
  for (const [re, what] of PERSIST_TARGETS) {
    const m = l.match(re);
    if (m && WRITE.test(l.slice(0, m.index!))) out.push({ kind: "persist-write", detail: what, from, line });
  }
  if (AUTOSTART.test(l)) out.push({ kind: "persist-write", detail: "autostart", from, line });
  const secrets = new Set<string>();
  for (const m of l.matchAll(SECRET_REF)) secrets.add(m[1] ?? m[2] ?? m[3]);
  if (secrets.size) {
    for (const m of l.matchAll(HOST)) {
      if (LOOPBACK.test(m[1])) continue;
      for (const s of [...secrets].sort()) out.push({ kind: "secret-egress", detail: `${s} -> ${m[1].toLowerCase()}`, from, line });
    }
  }
}

/** Facts about one runner invocation (`npx pkg`, `uvx pkg`, `pnpm dlx pkg`), from its parsed words. */
export function runnerSignals(runner: string, spec: string, args: string[], from: string, line: number, out: Signal[]): void {
  const bare = spec.replace(/^["']|["']$/g, "");
  const at = bare.startsWith("@") ? bare.indexOf("@", 1) : bare.indexOf("@");
  const version = at > 0 ? bare.slice(at + 1) : runner === "uvx" ? (bare.match(/==(.+)$/)?.[1] ?? "") : "";
  const name = (at > 0 ? bare.slice(0, at) : bare).replace(/==.*$/, "");
  if (!version || /^(?:latest|next|canary|beta|alpha)$/.test(version)) out.push({ kind: "fetch-run", detail: `${runner} ${name}${version ? "@" + version : ""}`, from, line });
  const rest = args.filter((a) => !a.startsWith("-"));
  if (name === "skills" && /^(?:add|install|update)$/.test(rest[0] ?? "")) out.push({ kind: "skill-fetch", detail: `${runner} skills ${rest[0]}`, from, line });
  else if (rest[0] === "skills" && /^(?:add|install|update)$/.test(rest[1] ?? "")) out.push({ kind: "skill-fetch", detail: `${name} skills ${rest[1]}`, from, line });
  if ((name === "skills" || rest[0] === "skills") && args.some((a) => a === "-g" || a === "--global")) out.push({ kind: "persist-write", detail: "skill folder", from, line });
}

/** Merge signals with the same kind and detail, keeping every place they were seen, in a stable order. */
export function mergeSignals(list: Signal[]): { kind: SignalKind; detail: string; at: [string, number][] }[] {
  const map = new Map<string, { kind: SignalKind; detail: string; at: [string, number][] }>();
  for (const s of list) {
    const k = `${s.kind}\0${s.detail}`;
    const cur = map.get(k) ?? { kind: s.kind, detail: s.detail, at: [] };
    if (!cur.at.some(([f, n]) => f === s.from && n === s.line)) cur.at.push([s.from, s.line]);
    map.set(k, cur);
  }
  return [...map.values()]
    .map((s) => ({ ...s, at: s.at.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]) }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.detail.localeCompare(b.detail));
}
