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
const INSTALL_ANY = new RegExp(
  "(?<![\\w-])(?:(?:npm|pnpm|yarn|bun)\\s+(?:install|i|add)|(?:pip3?|uv\\s+pip|pipx)\\s+install|uv\\s+add|poetry\\s+add|gem\\s+install|cargo\\s+(?:install|add)|(?:apt|apt-get|yum|dnf|zypper)\\s+install|apk\\s+add|brew\\s+install|conda\\s+install)\\b[^\"'`;&|)#\\n]*",
  "g",
);

/** Packages named by an install command written anywhere in a line: a message, a comment, a quoted hint. */
function installsIn(l: string, ev: Evidence, out: Collected[]): void {
  for (const m of l.matchAll(INSTALL_ANY)) {
    const words = m[0].trim().split(/\s+/);
    const head = words[0] === "uv" && words[1] === "pip" ? 3 : 2;
    const ws = words.slice(head);
    for (let i = 0; i < ws.length; i++) {
      const r = ws[i];
      if (/^(?:-r|--requirement|-c|--constraint|-e|--editable|-t|--target|-i|--index-url|--extra-index-url|-f|--find-links)$/.test(r)) {
        i++;
        continue;
      }
      if (r.startsWith("-") || r === "\\") continue;
      if (/^(?:in|the|and|or|to|then|first|it|a|an|with|for|from|on|your|via)$/i.test(r) || r.startsWith("(")) break; // prose resumes
      const tok = r.replace(/\\n$/, "");
      const n = pkgName(tok.replace(/[.,:]$/, ""));
      if (n) out.push({ kind: "package", name: n, ev });
      if (/[.,:]$|\\n$/.test(r)) break; // the sentence or the message line ends
    }
  }
}
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
const ENV_HEADING = /\benv\b|\.env|environment|variables?|secrets?|credentials?/i;
// O4: a secret name alone in an inline span, as a table row's first cell or a list item's lead (an env-var table).
const SECRET_LISTED = new RegExp(`^\\s*(?:\\|\\s*\`${SECRET_NAME}\`\\s*\\||[-*]\\s+\`${SECRET_NAME}\`\\s*(?:$|[-:—(]))`);

/** An inline span holds a command when it reads as one: a program word, then arguments with a flag, a path,
 *  a URL, a pipe, a substitution, or a subcommand word. */
function isCommandSpan(s: string, line: string, before: string): boolean {
  if (/\\\||->|<-|=>|[!=]==/.test(s)) return false; // a type union, a diagram edge, code
  if (/^(?:if|for|while|const|let|var|return|function|await|new|import|export|def|class|elif|else)\b/.test(s)) return false; // program code
  const w = s.split(/\s+/);
  if (w.length < 2 || !/^[a-z][a-z0-9._+-]*$/.test(w[0]) || SUBCOMMAND.test(w[0])) return false;
  if (/^(?:[-+*/%<>=!]=?|==|&&|\|\|)$/.test(w[1])) return false; // arithmetic or a comparison
  const segs = s.split(/\s\|\s/);
  if (segs.length > 1 && segs.every((g) => g.trim().split(/\s+/).length <= 2 && !/(?:^|\s)-/.test(g))) return false; // `a | b | c`: a list of choices
  if (/\$\(|\s(?:&&|\|\||\|)\s/.test(s)) return true; // a substitution, a command list, or a pipe is shell
  if (w.filter((a) => /^-{1,2}[A-Za-z]/.test(a)).length >= 2) return true; // several flags: a command line
  // Otherwise a run word must govern the span ("Use `rg -n …`", "Calls `sam delete --no-prompts`"); a URL argument
  // may take its run word from anywhere in the line ("`gemini extensions install https://…` (run in terminal)").
  const near = before.split(/\s+/).slice(-4).join(" ");
  if (!RUN_WORD.test(w.some((a) => /^https?:/.test(a)) ? line : near)) return false;
  return w.slice(1).some((a) => /^-{1,2}[A-Za-z]|^https?:|^(?:run|install|add|create|init|build|deploy|start|serve|login|auth|delete|download|upload|exec|publish|update|upgrade|remove)(?:-[a-z]+)?$/.test(a));
}
// A span that opens with a subcommand (`info --json`, `init --preset x`) is the skill's own CLI, written short.
const SUBCOMMAND = /^(?:info|init|add|build|list|view|search|docs|diff|migrate|update|create|run|start|dev|test|deploy|login|logout|auth|status|get|set|remove|delete|publish|preview|render|lint|check|doctor|upgrade|install)$/;
const RUN_WORD = /\b(?:run|runs|running|execute[sd]?|executing|call|calls|calling|invoke[sd]?|use|uses|using|with|via|verify|download)\b/i;

// O5: "<Name> MCP server", "<Name> MCP tool(s)".
const MCP = /\b([A-Z][A-Za-z0-9.-]*) MCP (?:server|tools?)\b/g;

export function isPlaceholderHost(host: string): boolean {
  if (/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/i.test(host)) return true;
  if (/(?:^|[.-])example(?:[.-]|$)/i.test(host)) return true;
  if (/(?:^|[.-])(?:your|my)[-.]|^your|x{3,}|placeholder/i.test(host)) return true;
  if (/[<>{}$]/.test(host) || !host.includes(".")) return true; // a template host, or no literal domain
  return false;
}

/** A URL that is itself a placeholder (`https://api.npoint.io/abc123`), or an identifier that is never fetched (an OAuth scope). */
function placeholderUrl(url: string): boolean {
  if (/^https?:\/\/[^/]+\/(?:abc123|xyz|foo|bar|your[-_][\w-]*|<[^>]*>)\/?$/i.test(url)) return true;
  return /^https?:\/\/www\.googleapis\.com\/auth\//.test(url);
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
  code = code.replace(/(^|\s)([A-Za-z_]\w*)=(?:"[^"]*"|'[^']*')/g, "$1$2=__v__"); // assignment values
  code = code.replace(/(^|&&|\|\||;|\||\(|\$\(|\bthen|\bdo|\belse)((?:\s*[A-Za-z_]\w*=\S*)*\s*)(?:"([^"]*)"|'([^']*)')|"[^"]*"|'[^']*'/g, (m, pre, sp, a, b) =>
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
  // A program run by relative path is the user's build output or a script in a checkout, not an outside CLI;
  // what it installs still counts.
  const relative = /^\.{1,2}\//.test(prog);
  // `"$HF_BIN" download …`: a variable named for its program.
  const named = prog.match(/^\$([A-Z][A-Z0-9]*)_(?:BIN|CLI|EXE|CMD)$/);
  const cmd = named ? named[1].toLowerCase() : prog.replace(/^.*\//, "");
  if (cmd === "__q__" || cmd === "__v__") return;
  if (/\.(?:sh|bash|py|js|mjs|cjs|ts|bat|cmd|ps1)$/i.test(cmd)) return;
  w[0] = cmd;
  if (!/^[A-Za-z][A-Za-z0-9._+-]*$/.test(cmd) || /^[A-Z][A-Z0-9_]*$/.test(cmd)) return;
  if (w[1] === "=" || w[1]?.startsWith("=")) return; // `x = y` is not a command
  const line = w.join(" ");
  if (INSTALL.test(line)) {
    // An installer outside the base set is itself a CLI the skill runs (yum, dnf, choco, …).
    if (!BASE_TOOLS.has(cmd) && !strict && !relative) out.push({ kind: "cli", name: cmd, ev });
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
  if (strict || relative) return;
  if (BASE_TOOLS.has(cmd) || local.has(cmd) || cmd === "__q__" || cmd === "__v__") return;
  out.push({ kind: "cli", name: cmd, ev });
  // `docker run [options] image command…`: the image's command runs too.
  if (cmd === "docker" && w[1] === "run") {
    let i = 2;
    while (i < w.length && w[i].startsWith("-")) i += !w[i].includes("=") && DOCKER_VALUE_OPTS.has(w[i]) ? 2 : 1;
    if (i + 1 < w.length) fromCommand(w.slice(i + 1), ev, out, false, local);
  }
}

const DOCKER_VALUE_OPTS = new Set(
  "-v --volume -e --env --env-file -p --publish --name -w --workdir -u --user --network --entrypoint --mount --gpus --runtime --shm-size --ipc --platform -m --memory --cpus -h --hostname --add-host --label -l --device".split(" "),
);

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
    "aifc array atexit audioop bdb bz2 cgi cmath cmd code codecs colorsys compileall configparser contextvars copyreg crypt curses dbm dis doctest " +
    "encodings filecmp fileinput formatter ftplib genericpath gettext graphlib grp imaplib imghdr keyword linecache locale mailbox marshal " +
    "mmap modulefinder netrc nntplib ntpath optparse pdb pkgutil plistlib poplib posix posixpath pty pwd py_compile pyclbr pydoc quopri " +
    "reprlib resource rlcompleter runpy sched selectors shelve site smtplib sndhdr socketserver spwd stringprep sunau symtable sysconfig " +
    "syslog tabnanny telnetlib termios tkinter token tokenize tomllib trace tracemalloc tty turtle unittest uu venv wave webbrowser winreg " +
    "winsound wsgiref xdrlib xmlrpc zipapp zipimport zoneinfo _thread " +
    "__future__ abc argparse ast asyncio base64 binascii bisect builtins calendar collections concurrent contextlib copy csv ctypes " +
    "dataclasses datetime decimal difflib email enum errno fnmatch fractions functools gc getpass glob gzip hashlib heapq hmac html " +
    "http importlib inspect io ipaddress itertools json logging lzma math mimetypes multiprocessing numbers operator os pathlib pickle " +
    "platform pprint queue random re secrets select shlex shutil signal socket sqlite3 ssl stat statistics string struct subprocess sys " +
    "tarfile tempfile textwrap threading time timeit traceback types typing unicodedata unittest urllib uuid warnings weakref xml zipfile zlib"
  ).split(/\s+/),
);

// `google.*` modules by distribution: google.auth and google.oauth2 ship in google-auth.
const GOOGLE_PACKAGES: Record<string, string> = { auth: "google-auth", oauth2: "google-auth", protobuf: "protobuf", api_core: "google-api-core" };
const PY_REGISTRY: Record<string, string> = {
  dotenv: "python-dotenv",
  PIL: "pillow",
  cv2: "opencv-python",
  yaml: "pyyaml",
  sklearn: "scikit-learn",
  bs4: "beautifulsoup4",
  skimage: "scikit-image",
  dateutil: "python-dateutil",
};

const NODE_BUILTINS = new Set(
  "assert buffer child_process cluster crypto dgram dns events fs http http2 https module net os path perf_hooks process querystring readline stream string_decoder timers tls tty url util v8 vm worker_threads zlib".split(" "),
);

function scriptImports(path: string, lines: string[], out: Collected[]): void {
  const py = /\.py$/.test(path);
  lines.forEach((l, i) => {
    const ev = { from: path, line: i + 1, text: l.trim().slice(0, 300) };
    if (py) {
      const m = l.match(/^\s*(?:from\s+([A-Za-z_][\w.]*)\s+import\s+([\w]+)|import\s+([A-Za-z_][\w.]*))/);
      if (!m) return;
      const full = m[1] ?? m[3];
      const top = full.split(".")[0];
      if (PY_STDLIB.has(top)) return;
      // Name by registry name: namespace packages (`google.auth`, `from google import genai`) and known renames.
      let name = PY_REGISTRY[top] ?? top;
      if (top === "google") {
        const parts = full.split(".");
        const sub = parts[1] ?? (m[1] !== undefined ? m[2] : undefined);
        if (!sub) return;
        name = GOOGLE_PACKAGES[sub] ?? (sub === "cloud" ? `google-cloud-${parts[2] ?? m[2]}` : `google-${sub.replace(/_/g, "-")}`);
      }
      out.push({ kind: "package", name, ev });
      return;
    }
    const code = l.replace(/(["'`])\s*(?:import|export)\s(?:(?!\1)[^\\]|\\.)*\1/g, " "); // generated code in a string
    for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"'\s]+)["']/g)) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("node:") || NODE_BUILTINS.has(spec.split("/")[0])) continue;
      const n = pkgName(spec);
      if (n) out.push({ kind: "package", name: n.startsWith("@") ? n.split("/").slice(0, 2).join("/") : n.split("/")[0], ev });
    }
  });
}

/** Programs a JS or Python script starts (`execFileSync("ffprobe", …)`, `subprocess.run(["ffmpeg", …])`), and pip installs it runs. */
function scriptProcesses(path: string, text: string, out: Collected[]): void {
  const lines = text.split("\n");
  const lineOf = (pos: number) => text.slice(0, pos).split("\n").length;
  const ev = (pos: number) => ({ from: path, line: lineOf(pos), text: lines[lineOf(pos) - 1].trim().slice(0, 300) });
  const comment = (pos: number) => /^\s*(?:#|\/\/|\*)/.test(lines[lineOf(pos) - 1] ?? "");
  const direct = /\b(?:execFileSync|execFile|spawnSync|spawn|execa|execaSync|subprocess\.(?:run|call|check_call|check_output|Popen))\(\s*\[?\s*["'`]([^"'`\s$]+)["'`]/g;
  for (const m of text.matchAll(direct)) {
    if (comment(m.index!)) continue;
    fromCommand([m[1]], ev(m.index!), out, false);
  }
  const shell = /\b(?:execSync|exec|os\.system|subprocess\.(?:run|call|check_call|check_output|Popen))\(\s*["'`]([^"'`]+)["'`]/g;
  for (const m of text.matchAll(shell)) {
    if (comment(m.index!)) continue;
    for (const c of commands(m[1])) fromCommand(c, ev(m.index!), out, false);
  }
  // An array of scoped package names handed to a loader (`["@hyperframes/producer", "@hyperframes/core"]`).
  for (const m of text.matchAll(/\[\s*((?:["'`]@[\w.-]+\/[\w./-]+["'`]\s*,\s*)+["'`]@[\w.-]+\/[\w./-]+["'`])\s*,?\s*\]/g)) {
    if (comment(m.index!)) continue;
    for (const q of m[1].matchAll(/["'`](@[\w.-]+\/[\w.-]+)/g)) out.push({ kind: "package", name: q[1], ev: ev(m.index!) });
  }
  // A program picked per platform (`win32 ? "chrome-headless-shell.exe" : "chrome-headless-shell"`) is one the script launches.
  for (const m of text.matchAll(/["'`]([A-Za-z][\w.-]*)\.exe["'`]/g)) {
    if (comment(m.index!)) continue;
    fromCommand([m[1]], ev(m.index!), out, false);
  }
  // `pipInstall(DEPS)` with `const DEPS = ["a", "b"]`, or an array literal argument.
  const arrays = new Map<string, string>();
  for (const m of text.matchAll(/\b([A-Za-z_]\w*)\s*=\s*\[([^\]]*)\]/g)) arrays.set(m[1], m[2]);
  for (const m of text.matchAll(/\bpip_?install\w*\s*\(\s*(\[[^\]]*\]|[A-Za-z_]\w*)/gi)) {
    if (comment(m.index!)) continue;
    const list = m[1].startsWith("[") ? m[1].slice(1, -1) : arrays.get(m[1]);
    if (!list) continue;
    const at = m[1].startsWith("[") ? m.index! : text.search(new RegExp(`\\b${m[1]}\\s*=\\s*\\[`));
    for (const q of list.matchAll(/["']([^"']+)["']/g)) {
      const n = pkgName(q[1]);
      if (n) out.push({ kind: "package", name: n, ev: ev(at) });
    }
  }
}

function secrets(l: string, ev: Evidence, out: Collected[], props: boolean): void {
  for (const m of l.matchAll(SECRET_USE)) {
    const name = m.slice(1).find(Boolean);
    if (name) out.push({ kind: "credential", name, ev });
  }
  if (props) for (const m of l.matchAll(SECRET_PROP)) out.push({ kind: "credential", name: m[1], ev });
}

function hosts(l: string, ev: Evidence, out: Collected[]): void {
  for (const m of l.matchAll(URL_RE)) {
    const url = l.slice(m.index!).match(/^\S+/)![0].replace(/["'`),;\]]+$/, "");
    if (!isPlaceholderHost(m[1]) && !placeholderUrl(url)) out.push({ kind: "network", name: m[1].toLowerCase(), ev });
  }
}

/** Hosts in a run-script line: a URL counts when it is code or a whole string value, not when it sits inside
 *  a message or description ("as specified by https://commonmark.org/"). */
function scriptHosts(l: string, ev: Evidence, out: Collected[], shell: boolean): void {
  if (shell) return hosts(l, ev, out);
  for (const m of l.matchAll(/["'`]\s*(https?:\/\/[^"'`\s]+)/g)) hosts(m[1], ev, out);
}

export function extractOutside(path: string, text: string): Outside[] {
  const out: Collected[] = [];
  const lines = text.split("\n");
  if (/\.d\.ts$/.test(path)) {
    // A declaration file is read as a reference, not run: its doc comments are documentation.
  } else if (isScript(path, text)) {
    scriptImports(path, lines, out);
    if (!/\.(?:sh|bash|zsh)$/.test(path)) scriptProcesses(path, text, out);
    const shell = /\.(?:sh|bash|zsh)$/.test(path) || /^#!.*\b(?:ba|z)?sh\b/.test(text);
    const fns = shellFunctions(text);
    for (const { n, text: l } of logicalLines(lines, 0, lines.length)) {
      const ev = { from: path, line: n, text: l.trim().slice(0, 300) };
      if (/^\s*(?:#|\/\/)/.test(l)) continue;
      if (shell) for (const c of commands(l)) fromCommand(c, ev, out, false, fns);
      installsIn(l, ev, out);
      scriptHosts(l, ev, out, shell);
      secrets(l, ev, out, true);
    }
  } else if (isMarkup(path)) {
    const fns = shellFunctions(text);
    let i = 0;
    let heading = "";
    while (i < lines.length) {
      const f = lines[i].match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)/);
      if (!f) {
        if (/^#{1,6}\s/.test(lines[i])) heading = lines[i];
        prose(lines[i], { from: path, line: i + 1, text: lines[i].trim().slice(0, 300) }, out, heading);
        i++;
        continue;
      }
      const marker = f[1];
      const lang = f[2].toLowerCase();
      let end = i + 1;
      while (end < lines.length && !lines[end].trim().startsWith(marker)) end++;
      if (SHELL_LANGS.has(lang)) {
        for (const { n, text: l } of logicalLines(lines, i + 1, end)) {
          const ev = { from: path, line: n, text: l.trim().slice(0, 300) };
          installsIn(l, ev, out); // also `# pip install x` beside a command, or a quoted install hint
          if (/^\s*#/.test(l)) continue;
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

function prose(l: string, ev: Evidence, out: Collected[], heading = ""): void {
  for (const m of l.matchAll(/`([^`]+)`/g)) {
    const inner = m[1].trim();
    if (/^\s|\s$/.test(m[1])) continue; // a mispaired span: text between two code spans
    if (/\s/.test(inner)) {
      const cmd = isCommandSpan(inner, l, l.slice(0, m.index!));
      for (const c of commands(inner)) fromCommand(c, ev, out, !cmd);
      installsIn(inner, ev, out);
      if (cmd) hosts(inner, ev, out);
    }
    secrets(inner, ev, out, false);
    if (new RegExp(`^${SECRET_NAME}$`).test(inner) && SECRET_LISTED.test(l) && (ENV_HEADING.test(heading) || /env/i.test(ev.from.split("/").pop()!)) && !/runtime[- ]only/i.test(heading))
      out.push({ kind: "credential", name: inner, ev });
  }
  for (const m of l.matchAll(MCP)) out.push({ kind: "mcp-server", name: m[1].toLowerCase(), ev });
  // The verb must come before the URL it governs ("Fetch `https://…`", "from the [download page](…)").
  for (const m of l.matchAll(URL_RE)) {
    const before = l.slice(0, m.index!);
    const w = before
      .replace(/\]\([^)]*$/, "]")
      .replace(/\[[^\]]*\]\([^)]*\)/g, (x) => x.replace(/\([^)]*\)$/, ""))
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/\bopen(?:ing)?\s+(?:a|an|the)?\s*(?:[\w-]+\s+){0,2}(?:ticket|issue|case|bug|request|PR)\b/gi, " ");
    if (FETCH_VERB.test(w)) hosts(l.slice(m.index!).match(/^\S+/)![0], ev, out);
  }
}

/** Words a runner-run CLI takes as its subcommands in this text (`npx hyperframes media-use resolve` → media-use, resolve). */
export function runnerSubcommands(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(?:npx|bunx|uvx|pnpm\s+dlx|yarn\s+dlx)\s+(?:-\S+\s+)*[@\w./-]+\s+([a-z][\w-]*)(?:\s+([a-z][\w-]*))?/g)) {
    out.add(m[1]);
    if (m[2]) out.add(m[2]);
  }
  return out;
}

/** Drop CLIs that are a runner-run CLI's subcommand written short in an inline span (`resolve -t grade`). */
export function dropShorthand(list: Outside[], subcommands: Set<string>): Outside[] {
  const esc = (n: string) => n.replace(/[.+]/g, "\\$&");
  return list.filter(
    (o) =>
      !(
        o.kind === "cli" &&
        subcommands.has(o.name) &&
        !o.evidence.some((e) => new RegExp(`\\b(?:npx|bunx|uvx|dlx)\\s+(?:-\\S+\\s+)*${esc(o.name)}\\b`).test(e.text))
      ),
  );
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
