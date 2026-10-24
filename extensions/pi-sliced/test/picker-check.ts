// Drives the Picker in a real terminal (tui-test) for scripts/check-stranger (proof 3) and scripts/check-untraced (proof 8).
// Usage: node extensions/pi-sliced/test/picker-check.ts stranger|untraced
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { literalViolations, ownViolations } from "./picker-vocabulary.ts";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const mode = process.argv[2];
if (mode !== "stranger" && mode !== "untraced") {
  console.error("usage: picker-check.ts stranger|untraced");
  process.exit(2);
}

const SERVER = process.env.PI_SLICED_SERVER || "https://185.8.106.248:8790";
const CATALOGUE = process.env.PI_SLICED_CATALOGUE || "check-canvas";
const GATEWAY = process.env.PI_SLICED_GATEWAY_URL || "https://pi-sliced.vercel.app/api/skills";
const PACKAGE_SOURCE = process.env.PI_SLICED_PACKAGE_SOURCE || "npm:pi-sliced";
/** npm registry for `pi install npm:…` (server/local-npm-registry sets it; default: npm's own). */
const NPM_REGISTRY = process.env.PI_SLICED_NPM_REGISTRY;
const TERM_ID = process.env.PI_SLICED_CHECK_TERM || "canvas";
const COLS = 120;
const ROWS = 40;

const failures: string[] = [];
const passes: string[] = [];
function skip(what: string, why: string): void {
  console.log(`SKIP ${what} (${why})`);
}
function check(ok: boolean, what: string, detail = ""): boolean {
  (ok ? passes : failures).push(what + (ok || !detail ? "" : `\n    ${detail.replace(/\n/g, "\n    ")}`));
  console.log(`${ok ? "PASS" : "FAIL"} ${what}${ok || !detail ? "" : `\n    ${detail.replace(/\n/g, "\n    ")}`}`);
  return ok;
}

// ── the Author's server, pinned as the extension pins it ─────────────────────────────────────────────

function getJson(url: string, ca?: string): Promise<any> {
  return new Promise((accept, reject) => {
    const req = request(url, { ca, timeout: 20_000, headers: { accept: "application/json" } }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode !== 200) reject(new Error(`${url} → ${res.statusCode} ${text.slice(0, 200)}`));
        else accept(JSON.parse(text));
      });
    });
    req.on("timeout", () => req.destroy(new Error(`${url} timed out`)));
    req.on("error", reject);
    req.end();
  });
}

// ── terminal ─────────────────────────────────────────────────────────────────────────────────────────

const session = `pi-sliced-${mode}-${process.pid}`;
const artifacts = mkdtempSync(join(tmpdir(), `pi-sliced-check-${mode}-`));
const frames: Array<{ label: string; lines: string[] }> = [];

function tt(...args: string[]): string {
  return execFileSync("tui-test", ["--session", session, ...args], { encoding: "utf8", maxBuffer: 1 << 24 });
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const screenLines = () => tt("text").split("\n");

/** The Picker frame: 21 lines from the top rule; the line under it starts with "Select Skills". */
function pickerFrame(lines = screenLines()): string[] | undefined {
  const at = lines.findIndex((line) => /^ {2}Select Skills\b/.test(line));
  return at > 0 ? lines.slice(at - 1, at + 20) : undefined;
}

async function waitFrame(label: string, pred: (frame: string[]) => boolean, timeoutMs = 20_000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let last: string[] | undefined;
  while (Date.now() < deadline) {
    last = pickerFrame();
    if (last && pred(last)) {
      frames.push({ label, lines: last });
      return last;
    }
    await sleep(150);
  }
  frames.push({ label: `${label} (timed out)`, lines: last ?? screenLines() });
  throw new Error(`timed out waiting for: ${label}\n${(last ?? screenLines()).join("\n")}`);
}

async function waitScreen(label: string, pred: (text: string) => boolean, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (Date.now() < deadline) {
    text = tt("text");
    if (pred(text)) return text;
    await sleep(200);
  }
  throw new Error(`timed out waiting for: ${label}\n${text}`);
}

const key = (k: string) => (k.length === 1 ? tt("type", k) : tt("key", "press", k));
const cursorRow = (frame: string[]) => frame.slice(4, 16).find((line) => line.startsWith("›")) ?? "";
const positionLine = (frame: string[]) => frame[16] ?? "";
const statusLine = (frame: string[]) => frame[1] ?? "";

/** Presses a key and waits until the frame differs from before (or the predicate holds). */
async function press(k: string, label: string, pred?: (frame: string[]) => boolean): Promise<string[]> {
  const before = (pickerFrame() ?? []).join("\n");
  key(k);
  return waitFrame(label, (frame) => (pred ? pred(frame) : frame.join("\n") !== before), 10_000);
}

async function openPicker(): Promise<string[]> {
  tt("type", "/slices");
  await sleep(300);
  key("Enter");
  return waitFrame("Picker open", (frame) => /Domains/.test(frame.join("\n")) && /Skills\.sh/.test(frame.join("\n")));
}

/** Walks down from the top, expanding Domains groups, until the cursor is on the skill row for `name`. */
async function browseTo(name: string): Promise<string[]> {
  const rowRe = new RegExp(`\\] ${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  let frame = pickerFrame()!;
  for (let i = 0; i < 60; i++) {
    const row = cursorRow(frame);
    if (rowRe.test(row) && !/[▸▾]/.test(row)) return frame;
    if (/Skills\.sh/.test(row)) throw new Error(`reached the Skills.sh branch without finding ${name} in Domains`);
    frame = /▸/.test(row) ? await press("Right", `expand ${row.trim()}`) : await press("Down", "down");
  }
  throw new Error(`never reached ${name}`);
}

// ── files left behind ────────────────────────────────────────────────────────────────────────────────

/** Every regular file under `root` (symlinks not followed), optionally skipping some top-level names at any depth. */
function walk(root: string, skipNames: ReadonlySet<string> = new Set()): { files: string[]; dirs: string[] } {
  const files: string[] = [];
  const dirs: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (skipNames.has(name)) continue;
      const path = join(dir, name);
      const st = lstatSync(path);
      if (st.isDirectory()) {
        dirs.push(path);
        visit(path);
      } else if (st.isFile()) files.push(path);
    }
  };
  if (existsSync(root)) visit(root);
  return { files, dirs };
}

/** Files whose bytes contain any of `needles`, as `path: needle` lines. */
function filesContaining(files: string[], needles: string[]): string[] {
  const bufs = needles.filter(Boolean).map((n) => [n, Buffer.from(n)] as const);
  const hits: string[] = [];
  for (const file of files) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(file);
    } catch {
      continue;
    }
    for (const [needle, buf] of bufs) if (bytes.includes(buf)) hits.push(`${file}: ${needle.slice(0, 80)}`);
  }
  return hits;
}

/** Where `pi install` puts an npm source for the user scope: `<agentDir>/npm/node_modules/<name>`. */
function npmInstallDir(home: string, source: string): string | undefined {
  const m = /^npm:((?:@[^/@]+\/)?[^/@]+)(?:@.+)?$/.exec(source);
  return m ? join(home, ".pi/agent/npm/node_modules", m[1]) : undefined;
}

/** Where `pi install` puts a git source for the user scope: `<agentDir>/git/<host>/<path>`. */
function gitInstallDir(home: string, source: string): string | undefined {
  const m = /^git:([^/]+)\/([^@]+?)(?:\.git)?(?:@.+)?$/.exec(source);
  return m ? join(home, ".pi/agent/git", m[1], m[2]) : undefined;
}

function startPi(home: string, work: string, extra: string[], env: Record<string, string>): void {
  const envArgs = [
    `HOME=${home}`,
    `PATH=${dirname(process.execPath)}:/usr/bin:/bin:${dirname(realBin("pi"))}:${dirname(whichBin("pi"))}`,
    "TERM=xterm-256color",
    ...Object.entries(env).map(([k, v]) => `${k}=${v}`),
  ];
  tt("run", "--restart", "--cols", String(COLS), "--rows", String(ROWS), "--cwd", work, "--", "env", "-i", ...envArgs, "pi", ...extra);
}

function whichBin(name: string): string {
  return execFileSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" }).trim();
}
function realBin(name: string): string {
  return execFileSync("readlink", ["-f", whichBin(name)], { encoding: "utf8" }).trim();
}

function saveFrames(): void {
  writeFileSync(join(artifacts, "frames.txt"), frames.map((f) => `── ${f.label}\n${f.lines.join("\n")}`).join("\n\n") + "\n");
  console.log(`frames: ${join(artifacts, "frames.txt")}`);
}

// ── proof 3 ──────────────────────────────────────────────────────────────────────────────────────────

async function stranger(): Promise<void> {
  const ca = readFileSync(join(repo, "extensions/pi-sliced/author-server.pem"), "utf8");
  const catalogue = await getJson(`${SERVER}/v1/catalogues/${CATALOGUE}`, ca);
  const listing = catalogue.skills.find((s: any) => s.id === "anthropics/skills/canvas-design");
  if (!check(Boolean(listing), `the Author's server's Catalogue ${CATALOGUE} admits anthropics/skills/canvas-design`)) return;
  const size = `${(listing.footprint.bytes / 1_048_576).toFixed(1)} MiB`;
  if (!check(typeof listing.footprint.short === "string" && typeof listing.footprint.summary === "string" && Array.isArray(listing.heavyBecause), "the Listing carries footprint.short, footprint.summary and heavyBecause")) return;
  const footprintText: string = listing.footprint.short;
  const footprintSummary: string = listing.footprint.summary;
  if (!check(listing.licence !== undefined, "the Listing carries its licence notice (licence, or null when none was found)")) return;
  const licenceRef = listing.licence as { spdx: string | null; copyright: string | null; path: string; route: string } | null;
  // Inspect's compact licence line, as the Picker words it (picker.ts licenceLine).
  const licenceExpected = licenceRef === null
    ? "No licence found"
    : `${licenceRef.spdx ?? `unrecognised licence in \`${licenceRef.path}\``}${licenceRef.copyright ? ` · “${licenceRef.copyright}”` : ""}`;
  const licenceText = licenceRef ? await getJson(`${SERVER}${licenceRef.route}`, ca) : null;
  // Author text that rows and titles show bare: every listing's id, name, source and owner.
  const authorStrings: string[] = catalogue.skills.flatMap((s: any) => [s.id, s.name, s.source, String(s.source).split("/")[0]]);
  // Listing data that must stay in memory: ids and descriptions.
  const listingNeedles: string[] = catalogue.skills.flatMap((s: any) => [s.id, s.description]);

  const home = mkdtempSync(join(tmpdir(), "pi-sliced-stranger-home-"));
  const work = mkdtempSync(join(tmpdir(), "pi-sliced-stranger-work-"));
  const sessionTmp = mkdtempSync(join(tmpdir(), "pi-sliced-stranger-tmp-"));
  try {
    const path = `${dirname(process.execPath)}:/usr/bin:/bin:${dirname(realBin("pi"))}:${dirname(whichBin("pi"))}`;
    const registryEnv = NPM_REGISTRY ? [`npm_config_registry=${NPM_REGISTRY}`] : [];
    const install = spawnSync("env", ["-i", `HOME=${home}`, `PATH=${path}`, ...registryEnv, "pi", "install", PACKAGE_SOURCE], { cwd: work, encoding: "utf8", timeout: 180_000 });
    writeFileSync(join(artifacts, "pi-package.log"), `${install.stdout}\n${install.stderr}`);
    const settings = (() => { try { return readFileSync(join(home, ".pi/agent/settings.json"), "utf8"); } catch { return ""; } })();
    if (!check(install.status === 0 && settings.includes("pi-sliced"), `pi install ${PACKAGE_SOURCE} with an empty HOME`, `${install.stdout}\n${install.stderr}\nsettings: ${settings}`)) return;

    // (a) The package the stranger installed carries code only: no Traces, Classifications or listing data.
    const local = !PACKAGE_SOURCE.startsWith("git:") && !PACKAGE_SOURCE.startsWith("npm:") && !/^(?:https?|ssh):/.test(PACKAGE_SOURCE);
    const pkgDir = local ? resolve(work, PACKAGE_SOURCE) : PACKAGE_SOURCE.startsWith("npm:") ? npmInstallDir(home, PACKAGE_SOURCE) : gitInstallDir(home, PACKAGE_SOURCE);
    if (local) {
      skip("the installed package directory in HOME holds no traces/, classifications/ or listing data", `local source ${PACKAGE_SOURCE} is used in place, not copied into HOME`);
    } else if (check(Boolean(pkgDir) && existsSync(join(pkgDir!, "package.json")), `the package is installed in HOME (${pkgDir})`)) {
      const tree = walk(pkgDir!, new Set([".git"]));
      const dataDirs = tree.dirs.filter((d) => /^(?:traces|classifications|catalogue|determinations|tests|server|tools)$/.test(d.split("/").at(-1)!));
      const hits = filesContaining(tree.files, listingNeedles);
      check(dataDirs.length === 0 && hits.length === 0, `the installed package's files hold no trace, classification, Candidate or catalogue data, nor any Catalogue id or description (${tree.files.length} files${NPM_REGISTRY ? `; registry ${NPM_REGISTRY}` : ""})`, [...dataDirs, ...hits].join("\n"));
      if (existsSync(join(pkgDir!, ".git"))) {
        const paths = spawnSync("git", ["-C", pkgDir!, "rev-list", "--all", "--objects"], { encoding: "utf8", maxBuffer: 1 << 28 }).stdout
          .split("\n").map((l) => l.slice(41)).filter((p) => /^(?:traces|classifications)(?:\/|$)/.test(p));
        const objects = spawnSync("git", ["-C", pkgDir!, "cat-file", "--batch-all-objects", "--batch"], { maxBuffer: 1 << 30 }).stdout ?? Buffer.alloc(0);
        const inObjects = listingNeedles.filter((n) => n && objects.includes(Buffer.from(n)));
        check(paths.length === 0 && inObjects.length === 0, "the installed package's git store holds no traces/, classifications/, Catalogue id or description",
          `${paths.length} traces/ or classifications/ paths (e.g. ${paths.slice(0, 3).join(", ")}); listing data in objects: ${inObjects.map((n) => n.slice(0, 60)).join(" | ")}`);
      }
    }
    const sources = walk(join(pkgDir ?? repo, "extensions/pi-sliced"), new Set(["test", "node_modules"])).files.filter((f) => /\.[cm]?[jt]s$/.test(f));
    const literalHits = sources.flatMap((f) => literalViolations(readFileSync(f, "utf8")).map((l) => `${f}: ${JSON.stringify(l)}`));
    check(sources.length > 0 && literalHits.length === 0, `no string in pi-sliced's sources says "install" or "download" (${sources.length} files)`, literalHits.join("\n"));

    startPi(home, work, [], { PI_SLICED_CATALOGUE: CATALOGUE, PI_SLICED_SERVER: SERVER, PI_SLICED_CHECK_DRIVER: "1", TMPDIR: sessionTmp });
    await waitScreen("Pi started", (t) => /v\d+\.\d+\.\d+/.test(t), 30_000);
    let frame = await openPicker();
    check(/Nothing selected/.test(statusLine(frame)), "the status line at the top states the current selections (none)", statusLine(frame));

    frame = await browseTo("canvas-design");
    const row = cursorRow(frame);
    check(row.includes("[ ]") && row.includes(footprintText), `the listing row shows the Footprint (${footprintText}) while the skill is unserved`, row);

    frame = await press("Right", "Inspect, first frame", (f) => /Footprint/.test(f.join("\n")));
    check(frame.some((l) => l.includes(`Footprint  ${footprintSummary}`)), `Inspect shows the Footprint (${footprintSummary}) on its first frame, with no extra key press`, frame.join("\n"));
    frame = await waitFrame("Inspect, SKILL.md loaded", (f) => /name: canvas-design/.test(f.join("\n")));
    check(frame.some((l) => l.includes(`Footprint  ${footprintSummary}`)) && /name: canvas-design/.test(frame.join("\n")), "Inspect shows the SKILL.md with the Footprint", frame.join("\n"));
    check(frame.some((l) => /^ {2}│ name: canvas-design$/.test(l)) && frame.some((l) => /^── SKILL\.md, verbatim/.test(l)), "Inspect frames the SKILL.md as the author's text (titled rule, │ gutter)", frame.join("\n"));
    check(frame.some((l) => l.trimEnd() === `  Licence    ${licenceExpected}`), `Inspect's compact block shows the licence (${licenceExpected})`, frame.join("\n"));
    frame = await press("l", "Inspect, licence", (f) => /── Licence, verbatim/.test(f.join("\n")) && !/Loading the licence/.test(f.join("\n")));
    if (licenceText) {
      const shown = frame.filter((l) => /^ {2}│/.test(l)).map((l) => l.replace(/^ {2}│ ?/, "").trimEnd());
      const expected = String(licenceText.files[0].text).replace(/\r\n/g, "\n").split("\n").slice(0, shown.length).map((l: string) => l.trimEnd());
      check(shown.length > 3 && JSON.stringify(shown) === JSON.stringify(expected) && frame.some((l) => l.trimEnd() === `  \`${licenceText.files[0].path}\``),
        `the full licence text is one key away (l), verbatim as the author's text (${licenceText.files[0].path})`, frame.join("\n"));
    } else {
      check(/No licence found in its source/.test(frame.join("\n")), "the licence view says no licence was found", frame.join("\n"));
    }
    frame = await press("l", "Inspect, back to SKILL.md", (f) => /── SKILL\.md, verbatim/.test(f.join("\n")));
    frame = await press("d", "Inspect, details", (f) => /── Details ·/.test(f.join("\n")));
    frame = await press("d", "Inspect, details closed", (f) => /── SKILL\.md, verbatim/.test(f.join("\n")));
    frame = await press("Left", "back to the tree", (f) => /Search:/.test(f.join("\n")));

    frame = await press("Enter", "Heavy confirm", (f) => /Serve it\?/.test(f.join("\n")));
    check(frame.some((l) => l.includes(`canvas-design: ${size}, ${listing.footprint.files} files`) && l.includes("Serve it?")), `serving canvas-design shows a confirm naming its size (${size}, ${listing.footprint.files} files)`, frame.join("\n"));
    frame = await press("n", "declined", (f) => /Search:/.test(f.join("\n")));
    check(/\[ \] canvas-design/.test(cursorRow(frame)) && /Nothing selected/.test(statusLine(frame)), "declining leaves it unselected in the Picker", `${statusLine(frame)}\n${cursorRow(frame)}`);
    key("Escape");
    await sleep(800);
    tt("type", "/pi-sliced-check-state");
    await sleep(300);
    key("Enter");
    const state = await waitScreen("check-state", (t) => /"check":"state"/.test(t.replace(/\s+/g, "")), 15_000);
    const flat = state.replace(/\s+/g, "");
    check(/"slice":\[\]/.test(flat.slice(flat.lastIndexOf('"check":"state"'))), "declining leaves it unserved (the session's Slice is empty)", state.split("\n").filter((l) => l.includes("state") || l.includes("slice")).join("\n"));

    frame = await openPicker();
    frame = await browseTo("canvas-design");
    frame = await press("Enter", "Heavy confirm again", (f) => /Serve it\?/.test(f.join("\n")));
    frame = await press("y", "accepted", (f) => /Search:/.test(f.join("\n")));
    check(/Selected \(1\) · canvas-design/.test(statusLine(frame)) && /\[x\] canvas-design/.test(cursorRow(frame)), "the status line at the top states the current selections (canvas-design)", statusLine(frame));
    frame = await press("Right", "Inspect of a selected skill", (f) => /Footprint/.test(f.join("\n")));
    check(/Selected \(1\) · canvas-design/.test(statusLine(frame)), "the status line stays at the top in Inspect", statusLine(frame));
    frame = await press("Left", "back", (f) => /Search:/.test(f.join("\n")));
    frame = await press("?", "legend", (f) => /Untraced: from skills\.sh/.test(f.join("\n")));
    frame = await press("?", "legend closed", (f) => /Search:/.test(f.join("\n")));
    key("Ctrl+C");
    await waitScreen("Picker closed", (t) => !/^ {2}Select Skills\b/m.test(t), 10_000);

    const bad = frames.map((f) => ({ f, lines: ownViolations(f.lines, authorStrings) })).filter((b) => b.lines.length);
    const authorLines = frames.reduce((n, f) => n + f.lines.filter((l) => /^\s*│/.test(l)).length, 0);
    check(bad.length === 0, `no Picker screen contains "install" or "download" in pi-sliced's own text (${frames.length} screens; exempt as Author text: ${authorLines} lines behind the gutter, quoted names, bare skill names and ids)`, bad.map((b) => `${b.f.label}:\n${b.lines.join("\n")}`).join("\n\n"));

    // (b) Browsing kept listing data in memory: nothing in HOME or the session's temp dirs names a listing.
    const leftovers = [home, work, sessionTmp].flatMap((root) => walk(root).files);
    const leaked = filesContaining(leftovers, listingNeedles);
    check(leaked.length === 0, `after browsing (Domains expanded, Inspect, licence, details), no file in HOME or the temp dirs holds a Catalogue id or description (${leftovers.length} files)`, leaked.join("\n"));
  } finally {
    saveFrames();
    spawnSync("tui-test", ["--session", session, "close"]);
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
    rmSync(sessionTmp, { recursive: true, force: true });
  }
}

// ── proof 8 ──────────────────────────────────────────────────────────────────────────────────────────

async function untraced(): Promise<void> {
  const ca = readFileSync(join(repo, "extensions/pi-sliced/author-server.pem"), "utf8");
  const catalogue = await getJson(`${SERVER}/v1/catalogues/${CATALOGUE}`, ca);
  const catalogueIds = new Set<string>(catalogue.skills.map((s: any) => s.id.toLowerCase()));
  const shortOf = new Map<string, string>(catalogue.skills.map((s: any) => [s.id.toLowerCase(), String(s.footprint?.short ?? "")]));
  const registry = await getJson(`${GATEWAY}?action=search&query=${encodeURIComponent(TERM_ID)}&limit=50`);
  const registryIds: string[] = (registry?.data ?? []).map((r: any) => String(r.id));
  const inBoth = registryIds.filter((id) => catalogueIds.has(id.toLowerCase()));
  const outside = registryIds.filter((id) => !catalogueIds.has(id.toLowerCase()));
  if (!check(inBoth.length > 0 && outside.length > 0, `skills.sh search "${TERM_ID}" matches a Catalogue skill (${inBoth.join(", ") || "none"}) and ${outside.length} outside the Catalogue`)) return;
  const catalogueId = inBoth[0];

  const home = mkdtempSync(join(tmpdir(), "pi-sliced-untraced-home-"));
  const work = mkdtempSync(join(tmpdir(), "pi-sliced-untraced-work-"));
  try {
    startPi(home, work, ["-e", repo], { PI_SLICED_CATALOGUE: CATALOGUE, PI_SLICED_SERVER: SERVER, PI_SLICED_GATEWAY_URL: GATEWAY });
    await waitScreen("Pi started", (t) => /v\d+\.\d+\.\d+/.test(t), 30_000);
    await openPicker();
    tt("type", TERM_ID);
    let frame = await waitFrame("search results", (f) => {
      const text = f.join("\n");
      return text.includes(`> ${TERM_ID}`) && !/Searching skills\.sh/.test(text) && /Untraced · Footprint unknown/.test(text);
    }, 30_000);
    const total = Number(/\((\d+)\/(\d+)\)/.exec(positionLine(frame))?.[2] ?? 0);
    const rows: Array<{ index: number; row: string; id: string; frame: string[] }> = [];
    let skillsShAt = -1;
    for (let i = 0; i < total; i++) {
      if (i > 0) frame = await press("Down", `row ${i + 1}`, (f) => positionLine(f).includes(`(${i + 1}/${total})`));
      const row = cursorRow(frame);
      const id = /\(\d+\/\d+\) (.+?)(?: {2}|$)/.exec(positionLine(frame))?.[1] ?? "";
      if (/▸|▾/.test(row) && /Skills\.sh/.test(row)) skillsShAt = i;
      if (!/[▸▾]/.test(row) && /\[[ x-]\]/.test(row)) rows.push({ index: i, row, id, frame });
    }
    const asListing = rows.filter((r) => r.id.toLowerCase() === catalogueId.toLowerCase());
    check(
      asListing.length === 1 && asListing[0].index < skillsShAt && Boolean(shortOf.get(catalogueId.toLowerCase())) && asListing[0].row.includes(shortOf.get(catalogueId.toLowerCase())!) && !/Untraced/.test(asListing[0].row),
      `the Catalogue skill ${catalogueId} appears once, as its Catalogue listing (Domains, with its Footprint)`,
      asListing.map((r) => `#${r.index + 1} ${r.row}`).join("\n") || "not found",
    );
    const other = rows.find((r) => r.index > skillsShAt && !catalogueIds.has(r.id.toLowerCase()));
    if (!check(Boolean(other) && /Untraced/.test(other!.row), `an item outside the Catalogue is labelled Untraced (${other?.id ?? "none"})`, other?.row ?? "no Skills.sh row")) return;
    check(rows.filter((r) => r.index > skillsShAt).every((r) => /Untraced/.test(r.row)), "every Skills.sh branch row is labelled Untraced");

    // Back up to the Untraced item and select it.
    frame = pickerFrame()!;
    for (let i = total - 1; i > other!.index; i--) frame = await press("Up", "up", (f) => positionLine(f).includes(`(${i}/${total})`));
    frame = await press("Enter", "Untraced item selected", (f) => /Selected \(/.test(statusLine(f)));
    check(/includes 1 Untraced item/.test(statusLine(frame)), "selecting it makes the status line at the top state that an Untraced item is selected", statusLine(frame));
    key("Ctrl+C");
  } finally {
    saveFrames();
    spawnSync("tui-test", ["--session", session, "close"]);
    rmSync(home, { recursive: true, force: true });
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  await (mode === "stranger" ? stranger() : untraced());
} catch (error) {
  check(false, "check ran to completion", error instanceof Error ? error.message : String(error));
}
console.log(`${failures.length ? "FAIL" : "PASS"} ${mode}: ${passes.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
