import assert from "node:assert/strict";
import fs, { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { after, before, test } from "node:test";
import { createAuthorClient, licenceUrl } from "../author-client.ts";
import { frontmatter } from "../frontmatter.ts";
import { createSkillsShClient } from "../skills-sh.ts";
import { createSlice, gitBlobSha, type ServedEntry, sweepDeadSessions } from "../slice.ts";
import { agentNames, PREAMBLE, SECTION, sectionText, TOOL_DESCRIPTION, toolText } from "../surface.ts";
import { makeDetail, makeLicence, REVISION, startFake, throwawayCert } from "./fake-server.ts";

const tddFiles = [
  { path: "skills/tdd/SKILL.md", bytes: Buffer.from("---\nname: tdd\ndescription: Red, green.\n---\nSee [x](../../references/x.md).\n") },
  { path: "skills/tdd/run.sh", bytes: Buffer.from("#!/bin/sh\necho hi\n"), mode: "100755" },
  { path: "references/x.md", bytes: Buffer.from("# x\n") },
  { path: "assets/bin.dat", bytes: Buffer.from([0, 1, 2, 255, 254]) },
];
const badFiles = [
  { path: "skills/bad/SKILL.md", bytes: Buffer.from("---\nname: bad\ndescription: Bad.\n---\n") },
  { path: "skills/bad/data.txt", bytes: Buffer.from("genuine\n") },
];
const licenceRef = (name: string) => ({
  spdx: "MIT",
  copyright: "Copyright (c) 2025 Owner",
  path: "LICENSE",
  route: `/v1/licences/owner/repo/${name}@${REVISION}`,
});
const tdd = makeDetail("owner/repo/tdd", "skills/tdd", tddFiles, licenceRef("tdd"));
const bad = makeDetail("owner/repo/bad", "skills/bad", badFiles, licenceRef("bad"));
const LICENCE_TEXT = "MIT License\n\nCopyright (c) 2025 Owner\n";

let fake: Awaited<ReturnType<typeof startFake>>;
let tmp: string;

before(async () => {
  const blobs = new Map<string, Buffer>();
  for (const f of [...tddFiles, ...badFiles]) blobs.set(gitBlobSha(f.bytes), f.bytes);
  // The data.txt blob is served tampered: same length, different bytes.
  blobs.set(bad.files[1].blob, Buffer.from("tampers\n"));
  const tampered = makeLicence(bad, [{ path: "LICENSE", text: LICENCE_TEXT }]);
  tampered.files[0].text = LICENCE_TEXT.replace("MIT", "XYZ");
  fake = await startFake([tdd, bad], blobs, [makeLicence(tdd, [{ path: "LICENSE", text: LICENCE_TEXT }]), tampered]);
  tmp = mkdtempSync(join(os.tmpdir(), "pi-sliced-unit-"));
});
after(async () => {
  await fake.close();
  rmSync(tmp, { recursive: true, force: true });
});

function client() {
  return createAuthorClient({ server: fake.url, catalogueName: "test", ca: fake.ca, timeoutMs: 5000 });
}

function newSlice(c = client()) {
  return createSlice({ blob: (sha) => c.blob(sha), snapshot: async () => ({ id: "", files: [] }), tmpdir: tmp });
}

function walk(root: string): string[] {
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((p) => !statSync(join(root, p)).isDirectory())
    .sort();
}

test("the pinned cert is the only CA: another CA is refused", async () => {
  const other = throwawayCert().cert;
  const c = createAuthorClient({ server: fake.url, catalogueName: "test", ca: other, timeoutMs: 5000 });
  await assert.rejects(c.catalogue());
  c.close();
});

test("materialized tree equals the Detail's files by blob SHA and mode", async () => {
  const c = client();
  const cat = await c.catalogue();
  assert.deepEqual(cat.skills.map((s) => s.id), ["owner/repo/tdd", "owner/repo/bad"]);
  const detail = await c.detail("owner/repo/tdd", REVISION);
  const slice = newSlice(c);
  const s = await slice.serveCatalogue(detail);
  const [entry] = slice.entries();
  assert.equal(s.skillMdPath, join(entry.root, "skills/tdd/SKILL.md"));
  assert.equal(s.revision, REVISION);
  assert.equal(s.kind, "catalogue");
  assert.deepEqual(walk(entry.root), detail.files.map((f) => f.path).sort());
  for (const f of detail.files) {
    const p = join(entry.root, f.path);
    assert.equal(gitBlobSha(readFileSync(p)), f.blob, f.path);
    assert.equal(statSync(p).mode & 0o777, f.mode === "100755" ? 0o755 : 0o644, f.path);
  }
  // The relative link in SKILL.md resolves inside the root.
  assert.ok(existsSync(resolve(dirname(s.skillMdPath), "../../references/x.md")));
  assert.equal(statSync(slice.sessionDir()!).mode & 0o777, 0o700);
  assert.ok(slice.sessionDir()!.startsWith(join(tmp, `pi-sliced-${process.pid}-`)));
  slice.cleanup();
  c.close();
});

test("a tampered blob fails the serve and leaves nothing behind", async () => {
  const c = client();
  const slice = newSlice(c);
  const detail = await c.detail("owner/repo/bad", REVISION);
  await assert.rejects(slice.serveCatalogue(detail), /failed verification/);
  assert.deepEqual(slice.served(), []);
  const dir = slice.sessionDir();
  if (dir) assert.deepEqual(readdirSync(dir), []);
  // A wrong size is caught too.
  const short = { ...detail, files: detail.files.map((f, i) => (i === 0 ? { ...f, size: f.size + 1 } : f)) };
  await assert.rejects(slice.serveCatalogue(short), /failed verification/);
  if (dir) assert.deepEqual(readdirSync(dir), []);
  slice.cleanup();
  c.close();
});

test("unsafe paths and unsupported modes are refused before anything is fetched", async () => {
  const slice = newSlice();
  for (const path of ["../x", "/etc/passwd", "a/../../x", "a//b"]) {
    const d = { ...tdd, files: [...tdd.files, { path, size: 0, blob: gitBlobSha(Buffer.alloc(0)), mode: "100644" }] };
    await assert.rejects(slice.serveCatalogue(d), /unsafe path/);
  }
  const link = { ...tdd, files: tdd.files.map((f, i) => (i === 1 ? { ...f, mode: "120000" } : f)) };
  await assert.rejects(slice.serveCatalogue(link), /unsupported git mode/);
  assert.deepEqual(slice.served(), []);
  slice.cleanup();
});

test("unserve removes the root; cleanup removes the session dir", async () => {
  const c = client();
  const slice = newSlice(c);
  await slice.serveCatalogue(await c.detail("owner/repo/tdd", REVISION));
  const [entry] = slice.entries();
  assert.ok(existsSync(entry.root));
  slice.unserve("owner/repo/tdd");
  assert.equal(existsSync(entry.root), false);
  assert.deepEqual(slice.served(), []);
  await slice.serveCatalogue(await c.detail("owner/repo/tdd", REVISION));
  const dir = slice.sessionDir()!;
  slice.cleanup();
  assert.equal(existsSync(dir), false);
  assert.deepEqual(slice.served(), []);
  await assert.rejects(slice.serveCatalogue(tdd), /session has ended/);
  assert.equal(existsSync(dir), false);
  c.close();
});

test("startup sweep removes dead-pid session dirs only", () => {
  const dead = join(tmp, "pi-sliced-2147483646-abc");
  const live = join(tmp, `pi-sliced-${process.ppid}-abc`);
  const other = join(tmp, "pi-sliced-unrelated");
  for (const d of [dead, live, other]) mkdirSync(join(d, "1"), { recursive: true });
  const removed = sweepDeadSessions(tmp, process.pid);
  assert.deepEqual(removed, [dead]);
  assert.ok(existsSync(live) && existsSync(other));
  for (const d of [live, other]) rmSync(d, { recursive: true });
});

test("Untraced items are served from the proxy snapshot; search drops install counts", async () => {
  const calls: string[] = [];
  const fetch = async (url: URL | string) => {
    const u = new URL(String(url));
    calls.push(u.search);
    if (u.searchParams.get("action") === "search") {
      return Response.json({ data: [{ id: "a/b/c", name: "c", source: "a/b", installs: 99, installUrl: "x" }] });
    }
    return Response.json({
      id: "a/b/c",
      installs: 99,
      files: [
        { path: "SKILL.md", contents: "---\nname: cobol\ndescription: >-\n  Read COBOL\n  copybooks.\n---\nBody\n" },
        { path: "refs/r.md", contents: "r\n" },
      ],
    });
  };
  const sh = createSkillsShClient({ url: "https://proxy.invalid/api/skills", fetch: fetch as typeof globalThis.fetch });
  const items = await sh.search("cobol");
  assert.deepEqual(items, [{ id: "a/b/c", name: "c", source: "a/b" }]);
  assert.match(await sh.skillMd(items[0]), /^---\nname: cobol/);
  const slice = createSlice({ blob: async () => Buffer.alloc(0), snapshot: (i) => sh.snapshot(i), tmpdir: tmp });
  const s = await slice.serveUntraced(items[0]);
  assert.deepEqual(
    { kind: s.kind, name: s.name, description: s.description },
    { kind: "untraced", name: "cobol", description: "Read COBOL copybooks." },
  );
  assert.equal(readFileSync(join(dirname(s.skillMdPath), "refs/r.md"), "utf8"), "r\n");
  assert.equal(calls.filter((q) => q.includes("detail")).length, 1, "Inspect's snapshot is reused");
  slice.cleanup();
});

function entry(id: string, name: string, description: string, skillMdPath = "/x/SKILL.md"): ServedEntry {
  return { id, kind: "catalogue", name, description, skillMdPath, root: "/x", skillDir: dirname(skillMdPath) };
}

test("section text: fixed preamble plus one line per Served skill; empty Slice adds nothing", () => {
  assert.equal(sectionText([]), undefined);
  const text = sectionText([entry("o/r/tdd", "tdd", "Red, green."), entry("o/r/zoom", "zoom", "Debug Zoom.")]);
  assert.equal(text, `${PREAMBLE}\n- tdd: Red, green.\n- zoom: Debug Zoom.`);
  // Per-skill framing beyond name and description.
  const one = sectionText([entry("o/r/tdd", "tdd", "Red, green.")])!;
  const two = sectionText([entry("o/r/tdd", "tdd", "Red, green."), entry("o/r/z", "z", "D.")])!;
  assert.ok(Buffer.byteLength(two) - Buffer.byteLength(one) - "z".length - "D.".length <= 8);
});

test("colliding names get the id as a deterministic qualifier", () => {
  const a = entry("o/r1/tdd", "tdd", "A.");
  const b = entry("o/r2/tdd", "tdd", "B.");
  assert.deepEqual([...agentNames([a, b]).keys()], ["o/r1/tdd", "o/r2/tdd"]);
  assert.deepEqual([...agentNames([b, a]).keys()].sort(), ["o/r1/tdd", "o/r2/tdd"]);
  assert.deepEqual([...agentNames([a]).keys()], ["tdd"]);
});

const SERVER = "https://author.invalid:8790";

test("tool output: short header naming the directory and licence, then SKILL.md verbatim; unknown name says only that", async () => {
  const c = client();
  const slice = newSlice(c);
  await slice.serveCatalogue(await c.detail("owner/repo/tdd", REVISION));
  const [e] = slice.entries();
  const md = readFileSync(e.skillMdPath, "utf8");
  assert.equal(
    toolText(slice.entries(), "tdd", SERVER),
    `Skill "tdd". Relative paths in its SKILL.md resolve against ${e.skillDir}/\n` +
      `Licence: MIT; Copyright (c) 2025 Owner. Full text: ${SERVER}/v1/licences/owner/repo/tdd@${REVISION}\n\n${md}`,
  );
  // The header has no blank line: everything after the first one is SKILL.md, byte for byte.
  const text = toolText(slice.entries(), "tdd", SERVER);
  assert.equal(text.slice(text.indexOf("\n\n") + 2), md);
  assert.equal(toolText(slice.entries(), "canvas-design", SERVER), 'No served skill is named "canvas-design".');
  assert.equal(toolText([], "tdd", SERVER), 'No served skill is named "tdd".');
  // No licence found, an unrecognised one with a multi-line copyright, and an Untraced item.
  const none = { ...e, licence: null };
  assert.equal(toolText([none], "tdd", SERVER).split("\n")[1], "Licence: none was found in its source.");
  const odd = { ...e, licence: { ...e.licence!, spdx: null, copyright: "Copyright\n\n (c) X" } };
  assert.equal(
    toolText([odd], "tdd", SERVER).split("\n")[1],
    `Licence: unrecognised licence; Copyright (c) X. Full text: ${SERVER}/v1/licences/owner/repo/tdd@${REVISION}`,
  );
  const untraced = { ...e, kind: "untraced" as const, licence: undefined };
  assert.equal(toolText([untraced], "tdd", SERVER).split("\n")[1], "Licence: unknown (Untraced).");
  // Nothing licence-related, and no server URL, enters the served_skills section or the tool definition.
  const section = sectionText(slice.entries())!;
  for (const t of [section, TOOL_DESCRIPTION, SECTION]) assert.doesNotMatch(t, /licen|https?:|MIT|Copyright|\/v1\//i);
  slice.cleanup();
  c.close();
});

test("licence: fetched over the pinned client, each file verified by blob SHA; nothing written into the served root", async () => {
  const c = client();
  const cat = await c.catalogue();
  const listing = cat.skills.find((s) => s.id === "owner/repo/tdd")!;
  const t = await c.licence(listing);
  assert.deepEqual(t.files.map((f) => [f.path, f.text]), [["LICENSE", LICENCE_TEXT]]);
  assert.equal(t.spdx, "MIT");
  await assert.rejects(c.licence(cat.skills.find((s) => s.id === "owner/repo/bad")!), /failed verification/);
  await assert.rejects(c.licence({ ...listing, licence: null }), /no licence/);
  // A route for another skill, or anything not a licence route, is never fetched.
  for (const route of [`/v1/licences/owner/repo/bad@${REVISION}`, "/v1/catalogues/test", "//evil.invalid/x", `/v1/licences/../x/y@${REVISION}`]) {
    await assert.rejects(c.licence({ ...listing, licence: { ...listing.licence!, route } }), /not its licence route/);
  }
  assert.equal(licenceUrl("https://h:1/", `/v1/licences/a/b/c@${REVISION}`), `https://h:1/v1/licences/a/b/c@${REVISION}`);
  assert.equal(licenceUrl("https://h:1", "/v1/catalogues/main"), undefined);
  const slice = newSlice(c);
  await slice.serveCatalogue(await c.detail("owner/repo/tdd", REVISION));
  const [e] = slice.entries();
  assert.deepEqual(walk(e.root), tdd.files.map((f) => f.path).sort(), "LICENSE is not in the Trace, so it is not served");
  slice.cleanup();
  c.close();
});

/** Record every path a mutating fs call names, through the builtin's live ESM bindings. */
function spyFsWrites(): { paths: string[]; restore(): void } {
  const paths: string[] = [];
  const names = [
    "writeFileSync", "appendFileSync", "mkdirSync", "mkdtempSync", "renameSync", "copyFileSync", "cpSync",
    "symlinkSync", "linkSync", "truncateSync", "chmodSync", "chownSync", "utimesSync", "rmSync", "rmdirSync",
    "unlinkSync", "createWriteStream", "writeFile", "appendFile", "mkdir", "mkdtemp", "rename", "copyFile", "cp",
    "symlink", "link", "truncate", "chmod", "rm", "rmdir", "unlink",
  ] as const;
  const opens = ["openSync", "open"] as const;
  const saved = new Map<string, unknown>();
  const savedP = new Map<string, unknown>();
  const note = (...args: unknown[]) => {
    for (const a of args) if (typeof a === "string" || a instanceof URL) paths.push(resolve(String(a instanceof URL ? a.pathname : a)));
  };
  const target = fs as unknown as Record<string, (...a: unknown[]) => unknown>;
  const promises = fs.promises as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const n of names) {
    const orig = target[n];
    saved.set(n, orig);
    target[n] = function (this: unknown, ...a: unknown[]) {
      note(a[0], n.startsWith("rename") || n.includes("ink") || n.startsWith("cp") || n.startsWith("copy") ? a[1] : undefined);
      return orig.apply(this, a);
    };
  }
  for (const n of opens) {
    const orig = target[n];
    saved.set(n, orig);
    target[n] = function (this: unknown, ...a: unknown[]) {
      if (a[1] !== undefined && a[1] !== "r" && a[1] !== fs.constants.O_RDONLY && typeof a[1] !== "function") note(a[0]);
      return orig.apply(this, a);
    };
  }
  for (const n of ["writeFile", "appendFile", "mkdir", "mkdtemp", "rename", "copyFile", "cp", "symlink", "link", "rm", "rmdir", "unlink", "open"]) {
    const orig = promises[n];
    savedP.set(n, orig);
    promises[n] = function (this: unknown, ...a: unknown[]) {
      if (n !== "open" || (a[1] !== undefined && a[1] !== "r")) note(a[0], n === "rename" || n === "copyFile" || n === "cp" ? a[1] : undefined);
      return orig.apply(this, a);
    };
  }
  syncBuiltinESMExports();
  return {
    paths,
    restore() {
      for (const [n, f] of saved) target[n] = f as never;
      for (const [n, f] of savedP) promises[n] = f as never;
      syncBuiltinESMExports();
    },
  };
}

test("catalogue, detail and licence fetches and serving write nothing outside the session dir", async () => {
  const home = mkdtempSync(join(tmp, "home-"));
  const tdir = mkdtempSync(join(tmp, "tmpdir-"));
  const env = { HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
  process.env.HOME = home;
  process.env.TMPDIR = tdir;
  const spy = spyFsWrites();
  let sessionDir: string | undefined;
  try {
    assert.equal(os.tmpdir(), tdir);
    const c = client();
    const cat = await c.catalogue();
    const listing = cat.skills.find((s) => s.id === "owner/repo/tdd")!;
    const detail = await c.detail(listing.id, listing.revision);
    await c.licence(listing);
    assert.deepEqual(spy.paths, [], "fetching listings, a Detail and a licence wrote nothing");
    const slice = createSlice({ blob: (sha) => c.blob(sha), snapshot: async () => ({ id: "", files: [] }) });
    await slice.serveCatalogue(detail);
    sessionDir = slice.sessionDir()!;
    assert.equal(dirname(sessionDir), tdir);
    const [e] = slice.entries();
    toolText(slice.entries(), "tdd", SERVER);
    sectionText(slice.entries());
    assert.deepEqual(readdirSync(home), [], "HOME is untouched");
    assert.deepEqual(readdirSync(tdir), [sessionDir.slice(tdir.length + 1)], "the temp dir holds only the session dir");
    assert.deepEqual(readdirSync(sessionDir), ["1"]);
    assert.deepEqual(walk(e.root), detail.files.map((f) => f.path).sort());
    slice.unserve(detail.id);
    slice.cleanup();
    c.close();
  } finally {
    spy.restore();
    process.env.HOME = env.HOME;
    if (env.TMPDIR === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = env.TMPDIR;
  }
  assert.ok(spy.paths.length > 0, "the fs spy saw the serve (spy broken?)");
  for (const p of spy.paths) assert.ok(p === sessionDir || p.startsWith(sessionDir + "/"), `write outside the session dir: ${p}`);
  assert.deepEqual(readdirSync(tdir), [], "cleanup left nothing in the temp dir");
  assert.deepEqual(readdirSync(home), []);
});

test("frontmatter: plain, quoted, folded and literal scalars", () => {
  assert.deepEqual(frontmatter("---\nname: a\ndescription: one\n  two\n---\n"), { name: "a", description: "one two" });
  assert.equal(frontmatter('---\ndescription: "q \\"x\\" y"\n---\n').description, 'q "x" y');
  assert.equal(frontmatter("---\ndescription: 'it''s'\n---\n").description, "it's");
  assert.equal(frontmatter("---\ndescription: |\n  l1\n  l2\n---\n").description, "l1\nl2\n");
  assert.equal(frontmatter("---\ndescription: >-\n  l1\n  l2\n---\n").description, "l1 l2");
  assert.deepEqual(frontmatter("no frontmatter"), {});
});
