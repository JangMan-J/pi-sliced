// Outside requirements stated by one pulled-in file (rulings O1–O5, Jang 2026-10-24):
// CLIs it runs, packages it installs or its run scripts import, credentials it
// sets or reads, MCP servers it names, and hosts it fetches from.
import { isMarkup, isScript } from "./refs.ts";

export type OutsideKind = "cli" | "package" | "mcp-server" | "credential" | "network";

export interface Evidence {
  from: string;
  line: number;
  text: string;
}

export interface Outside {
  kind: OutsideKind;
  name: string;
  evidence: Evidence[];
}

// O1 base set: tools every shell environment is assumed to have. They never count.
// Runners and installers are here too; what they run or install is recorded instead.
export const BASE_TOOLS = new Set(
  (
    "if then else elif fi for while until do done case esac function return export unset set source . cd echo printf read " +
    "test [ [[ ]] exit trap eval exec local declare typeset true false shift wait time alias type command builtin let " +
    "pushd popd break continue select disown umask ulimit getopts hash jobs fg bg wait shopt trap readarray mapfile " +
    // cmd.exe and PowerShell builtins
    "call setlocal endlocal del dir copy move ren rd md cls pause goto start title " +
    "Write-Host Write-Output Set-Location Get-ChildItem New-Item Remove-Item Copy-Item Test-Path " +
    "ls cat cp mv rm mkdir rmdir touch chmod chown chgrp ln head tail grep egrep fgrep sed awk sort uniq wc cut tr tee " +
    "find xargs basename dirname pwd date sleep env printenv which whoami id hostname uname kill ps du df stat readlink " +
    "realpath mktemp seq yes diff cmp file tar gzip gunzip zip unzip less more nl od sha256sum sha1sum md5sum shasum nproc " +
    "base64 sudo nohup timeout watch newgrp usermod groupadd useradd su clear " +
    "bash sh zsh git curl wget python python3 node " +
    "npx pnpm bunx uvx npm pip pip3 apt apt-get yarn bun uv brew pipx"
  ).split(/\s+/),
);

// O2: install commands; the words after them (minus flags) are packages.
const INSTALL =
  /^(?:(?:npm|pnpm|yarn|bun)\s+(?:install|i|add)|(?:pip3?|uv\s+pip|pipx)\s+install|uv\s+add|poetry\s+add|gem\s+install|cargo\s+(?:install|add)|go\s+(?:install|get)|(?:apt|apt-get|yum|dnf|zypper|choco|winget|vcpkg)\s+install|apk\s+add|brew\s+install|conda\s+install|dotnet\s+add\s+package|flutter\s+pub\s+add|dart\s+pub\s+add|composer\s+require)\b/;

const SHELL_LANGS = new Set(["bash", "sh", "shell", "console", "zsh", "terminal", "shellsession", "sh-session", "powershell", "pwsh", "ps1", "ps", "cmd", "bat", "batch"]);

const HTTP_METHOD = /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/;

// O4: env-var-shaped names ending in _KEY, _TOKEN, _SECRET, or PASSWORD, set or read.
const SECRET_NAME = "[A-Z][A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|PASSWORD)";
const SECRET_USE = new RegExp(
  [
    `(?:^|[\\s;(])(?:export\\s+)?(${SECRET_NAME})=`, // shell assignment
    `\\$\\{?(${SECRET_NAME})\\b`, // shell expansion
    `\\benv\\.(${SECRET_NAME})\\b`, // process.env.X, import.meta.env.X
    `\\benv\\[\\s*["'](${SECRET_NAME})["']`, // process.env["X"], ENV["X"]
    `\\benviron(?:\\.get)?\\s*[([]\\s*["'](${SECRET_NAME})["']`, // os.environ["X"], os.environ.get("X")
    `\\bgetenv\\s*\\(\\s*["'](${SECRET_NAME})["']`, // os.getenv("X"), Getenv("X")
    `<(${SECRET_NAME})>`, // a placeholder the user supplies in a command
    `%(${SECRET_NAME})%`, // cmd.exe
    `\\$env:(${SECRET_NAME})\\b`, // PowerShell
  ].join("|"),
  "g",
);
// A minified or compact read: `e.MINERVA_TOKEN` where e is the environment object.
const SECRET_PROP = new RegExp(`\\b(?:process\\.env|env|e)\\.(${SECRET_NAME})\\b`, "g");

const URL_RE = /\bhttps?:\/\/([A-Za-z0-9.${}<>_-]+)(?::\d+)?/g;
// O3: a prose line that tells the agent to fetch, download, open, read, or follow a URL.
const FETCH_VERB = /\b(?:fetch|download|open|read|follow)\b/i;
// O5: "<Name> MCP server", "<Name> MCP tool(s)".
const MCP = /\b([A-Z][A-Za-z0-9.-]*) MCP (?:server|tools?)\b/g;

export function isPlaceholderHost(host: string): boolean {
  if (/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/i.test(host)) return true;
  if (/(?:^|[.-])example(?:[.-]|$)/i.test(host)) return true;
  if (/(?:^|[.-])(?:your|my)[-.]|^your|x{3,}|placeholder/i.test(host)) return true;
  if (/^[<{$]/.test(host) || !host.includes(".")) return true; // a placeholder with no literal domain
  return false;
}

function pkgName(spec: string): string | null {
  const s = spec.replace(/^["']|["']$/g, "").replace(/\\$/, "");
  if (!s || s.startsWith("-") || s.startsWith(".") || s.startsWith("/") || s.includes("://")) return null;
  const m = s.match(/^(@[^/@\s]+\/[^@\s]+|[^@\s=<>~^[]+)/);
  if (!m) return null;
  const name = m[1].replace(/[,;]$/, "");
  if (!/^[@A-Za-z0-9]/.test(name) || /[<>{}$*]/.test(name)) return null;
  return name;
}

interface Collected {
  kind: OutsideKind;
  name: string;
  ev: Evidence;
}

/** Split a shell line into simple commands, returning each command's words. Quoted text is data, not commands. */
function commands(line: string): string[][] {
  let code = line.replace(/\s#.*$/, "").replace(/^\s*[$>]\s+/, "");
  if (/^\s*[\w.-]+\s*\(\)\s*\{?\s*$/.test(code) || /^\s*function\s/.test(code)) return []; // a function definition
  code = code.replace(/^\s*[^\s()"']+\)(?=\s|$)/, " "); // a case-arm label `a|b|c)`
  code = code.replace(/\$\{[^}]*\}/g, "__v__").replace(/\$\(\(.*?\)\)/g, "__v__").replace(/\{[\w.-]+\}/g, "__v__");
  // Command substitutions inside quotes are still code: lift them out before quoted text is dropped.
  const lifted: string[] = [];
  code = code.replace(/\$\(([^()]*)\)/g, (_m, inner: string) => {
    if (!/^[A-Z]\w*$/.test(inner.trim())) lifted.push(inner); // `$(OutDir)` is a build macro, not a command
    return "__v__";
  });
  // A quoted word at command position may name the program ("$HF_VENV/bin/pip"); other quoted text is data.
  code = code.replace(/(^|&&|\|\||;|\||\(|\$\(|\bthen|\bdo|\belse)(\s*)(?:"([^"]*)"|'([^']*)')|"[^"]*"|'[^']*'/g, (m, pre, sp, a, b) =>
    pre !== undefined ? `${pre}${sp}${(a ?? b ?? "").replace(/[\s()]+/g, "_")}` : " __q__ ",
  );
  code = code.replace(/\[\[?\s[^\]]*\]\]?/g, " true ");
  code = code.replace(/(?:^|\s)\d*[<>]{1,2}&?\S*/g, " "); // redirections
  const parts = code.split(/\s*(?:&&|\|\||;|\||\$\(|`|\(|\)|(?<=^|\s)\{(?=\s|$)|(?<=^|\s)\}(?=\s|$))\s*/);
  const out = parts.map((p) => p.trim().split(/\s+/).filter(Boolean)).filter((w) => w.length > 0);
  for (const l of lifted) out.push(...commands(l));
  return out;
}

/** Names of shell functions a file defines; calling them runs no outside program. */
function shellFunctions(text: string): Set<string> {
  const names = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)\s*\{?/gm)) names.add(m[1]);
  for (const m of text.matchAll(/^\s*function\s+([A-Za-z_][\w-]*)/gm)) names.add(m[1]);
  return names;
}

const RUNNER_WORDS = ["sudo", "exec", "time", "nohup", "env", "command", "if", "then", "else", "elif", "while", "until", "do", "!"];

function fromCommand(words: string[], ev: Evidence, out: Collected[], strict: boolean, local: Set<string> = new Set()): void {
  const w = [...words];
  while (w.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || RUNNER_WORDS.includes(w[0]))) w.shift();
  if (!w.length) return;
  if (HTTP_METHOD.test(w[0])) return; // an HTTP request line, not a command
  // A program named by path runs as its basename (`"$HF_VENV/bin/pip"` → pip). A relative path, a
  // script file, or a single-segment `/word` (a chat slash command) is not an outside program.
  const prog = w[0].replace(/^["']|["']$/g, "").replace(/\\/g, "/");
  if (/^\/[^/]+$/.test(prog)) return; // a chat slash command
  const cmd = prog.replace(/^.*\//, "");
  if (cmd === "__q__" || cmd === "__v__") return;
  if (/\.(?:sh|bash|py|js|mjs|cjs|ts|bat|cmd|ps1)$/i.test(cmd)) return;
  w[0] = cmd;
  if (!/^[A-Za-z][A-Za-z0-9._+-]*$/.test(cmd) || /^[A-Z][A-Z0-9_]*$/.test(cmd)) return;
  if (w[1] === "=" || w[1]?.startsWith("=")) return; // `x = y` is not a command
  const line = w.join(" ");
  if (INSTALL.test(line)) {
    // An installer outside the base set is itself a CLI the skill runs (yum, dnf, choco, …).
    if (!BASE_TOOLS.has(cmd) && !strict) out.push({ kind: "cli", name: cmd, ev });
    for (const r of line.replace(INSTALL, "").trim().split(/\s+/)) {
      if (r.startsWith("-") || r === "\\") continue;
      const n = pkgName(r.replace(/:(?:x64|x86|arm64|arm)-[\w-]+$/, "")); // vcpkg triplets
      if (n) out.push({ kind: "package", name: n, ev });
    }
    return;
  }
  const runner =
    cmd === "npx" || cmd === "bunx" || cmd === "uvx"
      ? 1
      : (cmd === "pnpm" || cmd === "yarn") && w[1] === "dlx"
        ? 2
        : cmd === "pipx" && w[1] === "run"
          ? 2
          : 0;
  if (runner) {
    const args = w.slice(runner).filter((a) => !a.startsWith("-"));
    const n = args.length ? pkgName(args[0]) : null;
    if (n) out.push({ kind: "cli", name: n, ev });
    return;
  }
  if (strict) return; // an inline code span counts only as a runner or install command
  if (BASE_TOOLS.has(cmd) || local.has(cmd) || cmd === "__q__" || cmd === "__v__") return;
  out.push({ kind: "cli", name: cmd, ev });
}

/** Join backslash-continued lines, keeping the first line number. */
function logicalLines(lines: string[], from: number, to: number): { n: number; text: string }[] {
  const out: { n: number; text: string }[] = [];
  let cur: { n: number; text: string } | null = null;
  for (let i = from; i < to; i++) {
    const l = lines[i];
    if (cur) cur.text += " " + l.trim();
    else cur = { n: i + 1, text: l };
    if (/(?:\\|\s\^|\s`)\s*$/.test(l)) {
      // Line continuation: `\` (sh), `^` (cmd), a backtick (PowerShell).
      cur.text = cur.text.replace(/(?:\\|\^|`)\s*$/, "");
      continue;
    }
    out.push(cur);
    cur = null;
  }
  if (cur) out.push(cur);
  return out;
}

const PY_STDLIB = new Set(
  (
    "__future__ abc argparse ast asyncio base64 binascii bisect builtins calendar collections concurrent contextlib copy csv ctypes " +
    "dataclasses datetime decimal difflib email enum errno fnmatch fractions functools gc getpass glob gzip hashlib heapq hmac html " +
    "http importlib inspect io ipaddress itertools json logging lzma math mimetypes multiprocessing numbers operator os pathlib pickle " +
    "platform pprint queue random re secrets select shlex shutil signal socket sqlite3 ssl stat statistics string struct subprocess sys " +
    "tarfile tempfile textwrap threading time timeit traceback types typing unicodedata unittest urllib uuid warnings weakref xml zipfile zlib"
  ).split(/\s+/),
);

const NODE_BUILTINS = new Set(
  "assert buffer child_process cluster crypto dgram dns events fs http http2 https module net os path perf_hooks process querystring readline stream string_decoder timers tls tty url util v8 vm worker_threads zlib".split(" "),
);

function scriptImports(path: string, lines: string[], out: Collected[]): void {
  const py = /\.py$/.test(path);
  lines.forEach((l, i) => {
    const ev = { from: path, line: i + 1, text: l.trim().slice(0, 300) };
    if (py) {
      const m = l.match(/^\s*(?:from\s+([A-Za-z_][\w]*)[\w.]*\s+import|import\s+([A-Za-z_][\w]*))/);
      const mod = m?.[1] ?? m?.[2];
      if (mod && !PY_STDLIB.has(mod)) out.push({ kind: "package", name: mod, ev });
      return;
    }
    for (const m of l.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"'\s]+)["']/g)) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:") || NODE_BUILTINS.has(spec.split("/")[0])) continue;
      const n = pkgName(spec);
      if (n) out.push({ kind: "package", name: n.startsWith("@") ? n.split("/").slice(0, 2).join("/") : n.split("/")[0], ev });
    }
  });
}

function secrets(l: string, ev: Evidence, out: Collected[], props: boolean): void {
  for (const m of l.matchAll(SECRET_USE)) {
    const name = m.slice(1).find(Boolean);
    if (name) out.push({ kind: "credential", name, ev });
  }
  if (props) for (const m of l.matchAll(SECRET_PROP)) out.push({ kind: "credential", name: m[1], ev });
}

function hosts(l: string, ev: Evidence, out: Collected[]): void {
  for (const m of l.matchAll(URL_RE)) if (!isPlaceholderHost(m[1])) out.push({ kind: "network", name: m[1].toLowerCase(), ev });
}

export function extractOutside(path: string, text: string): Outside[] {
  const out: Collected[] = [];
  const lines = text.split("\n");
  if (/\.d\.ts$/.test(path)) {
    // A declaration file is read, not run: only its comments' prose directions count.
    lines.forEach((l, i) => prose(l.replace(/^\s*(?:\/\*\*?|\*\/?|\/\/)\s?/, ""), { from: path, line: i + 1, text: l.trim().slice(0, 300) }, out));
  } else if (isScript(path, text)) {
    scriptImports(path, lines, out);
    const shell = /\.(?:sh|bash|zsh)$/.test(path) || /^#!.*\b(?:ba|z)?sh\b/.test(text);
    const fns = shellFunctions(text);
    for (const { n, text: l } of logicalLines(lines, 0, lines.length)) {
      const ev = { from: path, line: n, text: l.trim().slice(0, 300) };
      if (/^\s*(?:#|\/\/)/.test(l)) continue;
      if (shell) for (const c of commands(l)) fromCommand(c, ev, out, false, fns);
      hosts(l, ev, out);
      secrets(l, ev, out, true);
    }
  } else if (isMarkup(path)) {
    const fns = shellFunctions(text);
    let i = 0;
    while (i < lines.length) {
      const f = lines[i].match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)/);
      if (!f) {
        prose(lines[i], { from: path, line: i + 1, text: lines[i].trim().slice(0, 300) }, out);
        i++;
        continue;
      }
      const marker = f[1];
      const lang = f[2].toLowerCase();
      let end = i + 1;
      while (end < lines.length && !lines[end].trim().startsWith(marker)) end++;
      if (SHELL_LANGS.has(lang)) {
        for (const { n, text: l } of logicalLines(lines, i + 1, end)) {
          if (/^\s*#/.test(l)) continue;
          const ev = { from: path, line: n, text: l.trim().slice(0, 300) };
          for (const c of commands(l)) fromCommand(c, ev, out, false, fns);
          hosts(l, ev, out);
          secrets(l, ev, out, false);
        }
      }
      // Other fences are code examples written into the user's project; they state no requirement.
      i = end + 1;
    }
  }
  return out.map((c) => ({ kind: c.kind, name: c.name, evidence: [c.ev] }));
}

function prose(l: string, ev: Evidence, out: Collected[]): void {
  for (const m of l.matchAll(/`([^`]+)`/g)) {
    const inner = m[1].trim();
    if (/\s/.test(inner)) for (const c of commands(inner)) fromCommand(c, ev, out, true);
    secrets(inner, ev, out, false);
  }
  for (const m of l.matchAll(MCP)) out.push({ kind: "mcp-server", name: m[1].toLowerCase(), ev });
  const words = l.replace(/\[[^\]]*\]\([^)]*\)/g, (s) => s.replace(/\([^)]*\)$/, "")).replace(/https?:\/\/\S+/g, " ");
  if (FETCH_VERB.test(words)) hosts(l, ev, out);
}

/** Merge duplicate (kind, name) entries, keeping every distinct evidence line, sorted. */
export function mergeOutside(list: Outside[]): Outside[] {
  const map = new Map<string, Outside>();
  for (const o of list) {
    const k = `${o.kind}\0${o.name}`;
    const cur = map.get(k);
    if (!cur) map.set(k, { kind: o.kind, name: o.name, evidence: [...o.evidence] });
    else for (const e of o.evidence) if (!cur.evidence.some((x) => x.from === e.from && x.line === e.line)) cur.evidence.push(e);
  }
  return [...map.values()]
    .map((o) => ({ ...o, evidence: o.evidence.sort((a, b) => a.from.localeCompare(b.from) || a.line - b.line) }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}
