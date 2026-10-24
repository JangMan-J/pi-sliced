import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { after, before, test } from "node:test";
import { createAuthorClient } from "../author-client.ts";
import { frontmatter } from "../frontmatter.ts";
import { createSkillsShClient } from "../skills-sh.ts";
import { createSlice, gitBlobSha, type ServedEntry, sweepDeadSessions } from "../slice.ts";
import { agentNames, PREAMBLE, sectionText, toolText } from "../surface.ts";
import { makeDetail, REVISION, startFake, throwawayCert } from "./fake-server.ts";

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
const tdd = makeDetail("owner/repo/tdd", "skills/tdd", tddFiles);
const bad = makeDetail("owner/repo/bad", "skills/bad", badFiles);

let fake: Awaited<ReturnType<typeof startFake>>;
let tmp: string;

before(async () => {
  const blobs = new Map<string, Buffer>();
  for (const f of [...tddFiles, ...badFiles]) blobs.set(gitBlobSha(f.bytes), f.bytes);
  // The data.txt blob is served tampered: same length, different bytes.
  blobs.set(bad.files[1].blob, Buffer.from("tampers\n"));
  fake = await startFake([tdd, bad], blobs);
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

test("tool output: header naming the directory, then SKILL.md verbatim; unknown name says only that", async () => {
  const c = client();
  const slice = newSlice(c);
  await slice.serveCatalogue(await c.detail("owner/repo/tdd", REVISION));
  const [e] = slice.entries();
  const md = readFileSync(e.skillMdPath, "utf8");
  assert.equal(
    toolText(slice.entries(), "tdd"),
    `Skill "tdd". Relative paths in its SKILL.md resolve against ${e.skillDir}/\n\n${md}`,
  );
  assert.equal(toolText(slice.entries(), "canvas-design"), 'No served skill is named "canvas-design".');
  assert.equal(toolText([], "tdd"), 'No served skill is named "tdd".');
  slice.cleanup();
  c.close();
});

test("frontmatter: plain, quoted, folded and literal scalars", () => {
  assert.deepEqual(frontmatter("---\nname: a\ndescription: one\n  two\n---\n"), { name: "a", description: "one two" });
  assert.equal(frontmatter('---\ndescription: "q \\"x\\" y"\n---\n').description, 'q "x" y');
  assert.equal(frontmatter("---\ndescription: 'it''s'\n---\n").description, "it's");
  assert.equal(frontmatter("---\ndescription: |\n  l1\n  l2\n---\n").description, "l1\nl2\n");
  assert.equal(frontmatter("---\ndescription: >-\n  l1\n  l2\n---\n").description, "l1 l2");
  assert.deepEqual(frontmatter("no frontmatter"), {});
});
