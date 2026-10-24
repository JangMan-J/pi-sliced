// node --test server/
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request, createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";

const tmp = mkdtempSync(join(tmpdir(), "pi-sliced-server-test-"));
process.env.PI_SLICED_STORE = join(tmp, "store");
after(() => rmSync(tmp, { recursive: true, force: true }));

const lib = await import("./lib.mjs");
const { storeTrace } = await import("./build-store.mjs");
const buildCatalogueModule = await import("./build-catalogue.mjs");
const { route, handler } = await import("./author-server.mjs");

describe("blob SHA", () => {
  test("git blob SHA-1 of known contents", () => {
    assert.equal(lib.gitBlobSha(Buffer.alloc(0)), "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    assert.equal(lib.gitBlobSha(Buffer.from("hello\n")), "ce013625030ba8dba906f756967f9e9ca394464a");
  });
  test("verifyBlob rejects wrong size and wrong content", () => {
    const sha = "ce013625030ba8dba906f756967f9e9ca394464a";
    lib.verifyBlob(Buffer.from("hello\n"), sha, 6);
    assert.throws(() => lib.verifyBlob(Buffer.from("hello\n"), sha, 7), /size 6, want 7/);
    assert.throws(() => lib.verifyBlob(Buffer.from("hellO\n"), sha, 6), /hashes to/);
  });

  describe("storeTrace against a local clone", () => {
    let trace;
    before(() => {
      const cache = join(tmp, "git");
      process.env.PI_SLICED_GIT_CACHE = cache;
      const work = join(tmp, "work");
      mkdirSync(join(work, "skills", "x"), { recursive: true });
      writeFileSync(join(work, "skills", "x", "SKILL.md"), "---\nname: x\ndescription: An x.\n---\nbody\n");
      writeFileSync(join(work, "run.sh"), "#!/bin/sh\necho hi\n", { mode: 0o755 });
      const g = (...a) => execFileSync("git", ["-C", work, ...a], { env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } }).toString().trim();
      g("init", "-q");
      g("add", ".");
      g("commit", "-qm", "x");
      const revision = g("rev-parse", "HEAD");
      mkdirSync(join(cache, "o"), { recursive: true });
      execFileSync("git", ["clone", "-q", "--bare", work, join(cache, "o", "r.git")]);
      const blob = (p) => g("rev-parse", `HEAD:${p}`);
      const size = (p) => readFileSync(join(work, p)).length;
      trace = {
        candidate: "o/r/x",
        source: "o/r",
        revision,
        skillPath: "skills/x",
        status: "resolved",
        files: [
          { path: "run.sh", size: size("run.sh"), blob: blob("run.sh") },
          { path: "skills/x/SKILL.md", size: size("skills/x/SKILL.md"), blob: blob("skills/x/SKILL.md") },
        ],
        outside: [],
        namedSkills: [],
      };
    });
    test("writes verified blobs, and modes come from the tree", () => {
      const r = storeTrace(trace);
      assert.equal(r.written, 2);
      for (const f of trace.files) assert.equal(lib.gitBlobSha(readFileSync(lib.blobPath(f.blob))), f.blob);
      const modes = lib.treeModes("o/r", trace.revision);
      assert.equal(modes.get("run.sh"), "100755");
      assert.equal(modes.get("skills/x/SKILL.md"), "100644");
      assert.equal(storeTrace(trace).written, 0);
    });
    test("a size that differs from the Trace fails and writes nothing", () => {
      rmSync(join(process.env.PI_SLICED_STORE, "blobs"), { recursive: true, force: true });
      const f = trace.files[0];
      const bad = { ...trace, files: [{ ...f, size: f.size + 1 }] };
      assert.throws(() => storeTrace(bad), new RegExp(`size ${f.size}, want ${f.size + 1}`));
      assert.equal(existsSync(lib.blobPath(trace.files[0].blob)), false);
    });
  });
});

describe("frontmatter", () => {
  const fm = (yaml) => lib.parseFrontmatter(`---\n${yaml}\n---\nbody\n`);
  // Expected values agree with the `yaml` npm package (YAML 1.2) on the same inputs, except the
  // first case: strict YAML rejects ": " inside a plain scalar; many SKILL.md files have it, so it is read as text.
  const cases = [
    ["plain (lenient on ': ')", "description: Make a thing: fast, and well.", "Make a thing: fast, and well."],
    ["plain with comment", "description: plain text # a comment", "plain text"],
    ["plain trailing space", "description: text   ", "text"],
    ["plain keeps #tag", "description: C# and F#tags", "C# and F#tags"],
    ["plain multi-line", "description: first line\n  second line\n\n  after blank", "first line second line\nafter blank"],
    ["single-quoted", "description: 'It''s a \"quote\" # not a comment'", 'It\'s a "quote" # not a comment'],
    ["single-quoted multi-line", "description: 'one\n  two\n\n  three'", "one two\nthree"],
    ["double-quoted escapes", 'description: "tab\\there \\"q\\" \\u00e9 \\x41 back\\\\slash"', 'tab\there "q" é A back\\slash'],
    ["double-quoted multi-line", 'description: "one\n  two\\\n  three\n\n  four"', "one twothree\nfour"],
    ["double-quoted escaped space survives folding", 'description: "a\\ \n  b"', "a  b"],
    ["folded", "description: >\n  one\n  two\n\n  three\n", "one two\nthree\n"],
    ["folded strip", "description: >-\n  one\n  two\n", "one two"],
    ["folded more-indented", "description: >\n  a\n    b\n  c\n", "a\n  b\nc\n"],
    ["literal", "description: |\n  one\n  two\n", "one\ntwo\n"],
    ["literal strip", "description: |-\n  one\n   two", "one\n two"],
    ["literal keep", "description: |+\n  one\n\nnext: x", "one\n\n"],
    ["block with indentation indicator", "description: |2\n    lead\n  base\n", "  lead\nbase\n"],
  ];
  for (const [label, yaml, want] of cases) {
    test(label, () => assert.equal(fm(yaml).description, want));
  }
  test("keys after a nested mapping and quoted name", () => {
    const r = fm('name: "n"\nmetadata:\n  version: "1"\n  tags: [a, b]\ndescription: d\nlist:\n  - a');
    assert.equal(r.name, "n");
    assert.equal(r.description, "d");
    assert.equal("metadata" in r, false);
    assert.equal("version" in r, false);
  });
  test("CRLF and no frontmatter", () => {
    assert.equal(lib.parseFrontmatter("---\r\nname: a\r\ndescription: b\r\n---\r\n").description, "b");
    assert.deepEqual(lib.parseFrontmatter("# no frontmatter\n"), {});
  });
  test("unterminated quote is an error", () => {
    assert.throws(() => fm('description: "open'), /unterminated/);
  });
});

describe("Listings from the current Trace and its Classification", () => {
  const { buildDetail } = buildCatalogueModule;
  const fakeMd = () => Buffer.from("---\nname: x\ndescription: y\n---\n");
  const allModes = (t) => new Map(t.files.map((f) => [f.path, "100644"]));
  const trace = (candidate) => {
    const t = lib.resolvedTraces().find((x) => x.candidate === candidate);
    assert.ok(t, `stored Trace for ${candidate}`);
    return t;
  };
  const listing = (candidate) => {
    const t = trace(candidate);
    return buildDetail(t, lib.readClassification(t), { domain: "d", summary: "s" }, allModes(t), fakeMd);
  };
  test("anthropics/skills/canvas-design", () => {
    const l = listing("anthropics/skills/canvas-design");
    assert.equal(l.footprint.files, 83);
    assert.equal(l.footprint.bytes, 5_554_003);
    assert.deepEqual(l.footprint.outside, []);
    assert.equal(l.heavy, true);
    assert.deepEqual(l.heavyBecause, ["files total 5.3 MiB (> 1 MiB)"]);
    assert.deepEqual(l.markers, []);
    assert.match(l.classification, /^classifications\/anthropics\/skills\/canvas-design\/[0-9a-f]{40}\/trace-\d+\+judge-\d+\+classify-\d+\.json$/);
  });
  test("mattpocock/skills/tdd", () => {
    const l = listing("mattpocock/skills/tdd");
    assert.equal(l.footprint.files, 3);
    assert.equal(l.footprint.bytes, 7_324);
    assert.deepEqual(l.footprint.outsideFolder, { files: 0, bytes: 0 });
    assert.equal(l.heavy, false);
  });
  test("openai/plugins/game-ui-frontend", () => {
    const l = listing("openai/plugins/game-ui-frontend");
    assert.equal(l.footprint.files, 17);
    assert.equal(l.footprint.bytes, 38_028);
    assert.equal(l.footprint.outsideFolder.files, 16);
    assert.deepEqual(l.footprint.outside, []);
    assert.equal(l.heavy, false);
  });
  test("shadcn-ui/ui/shadcn", () => {
    const l = listing("shadcn-ui/ui/shadcn");
    assert.ok(l.footprint.outside.some((o) => o.kind === "cli" && o.name === "shadcn"));
    assert.ok(l.footprint.bytes <= lib.HEAVY_BYTES);
    assert.equal(l.heavy, true);
    assert.deepEqual(l.markers.map((m) => m.marker), ["runs-commands", "installs-packages", "unpinned-code"]);
    assert.ok(l.markers.every((m) => m.because.length > 0));
    assert.equal(l.footprint.short, "136 KiB · 2 CLI · 4 pkg");
    assert.ok(l.footprint.summary.startsWith("16 files, 136 KiB"));
    assert.deepEqual(Object.keys(l.companions).sort(), ["named", "pulled"]);
    assert.ok("fetch-run" in l.security);
  });
  test("fails loudly: Heavy disagreement, missing short, no Classification", () => {
    const t = trace("mattpocock/skills/tdd");
    const cl = lib.readClassification(t);
    const build = (c) => buildDetail(t, { ...cl, classification: c }, { domain: "d", summary: "s" }, allModes(t), fakeMd);
    assert.throws(() => build({ ...cl.classification, heavy: { heavy: true, because: ["x"] } }), /glossary rule/);
    const { short: _s, ...noShort } = cl.classification.footprint;
    assert.throws(() => build({ ...cl.classification, footprint: noShort }), /footprint.short/);
    assert.throws(() => lib.readClassification({ ...t, candidate: "nobody/none/x" }), /no trace directory|no Classification/);
  });
  test("Heavy boundary and kinds (GLOSSARY.md Heavy _Check_)", () => {
    const fp = (bytes, outside = []) => ({ files: 1, bytes, outsideFolder: { files: 0, bytes: 0 }, outside });
    assert.equal(lib.isHeavy(fp(1_048_576)), false);
    assert.equal(lib.isHeavy(fp(1_048_577)), true);
    assert.equal(lib.isHeavy(fp(10, [{ kind: "network", name: "example.com" }])), false);
    for (const kind of ["cli", "package", "credential", "mcp-server"]) assert.equal(lib.isHeavy(fp(10, [{ kind, name: "x" }])), true);
  });
  test("outside is distinct by (kind, name); outsideFolder excludes the own folder only", () => {
    const t = {
      skillPath: "s/a",
      files: [
        { path: "s/a/SKILL.md", size: 1 },
        { path: "s/ab/x.md", size: 2 },
        { path: "s/b/SKILL.md", size: 4 },
      ],
      outside: [
        { kind: "cli", name: "jq", at: [] },
        { kind: "cli", name: "jq" },
        { kind: "package", name: "jq" },
      ],
    };
    const fp = lib.footprint(t);
    assert.deepEqual(fp.outsideFolder, { files: 2, bytes: 6 });
    assert.deepEqual(fp.outside, [{ kind: "cli", name: "jq" }, { kind: "package", name: "jq" }]);
  });
});

describe("HTTP surface", () => {
  test("routes accept only the three shapes and never traverse", () => {
    const rev = "a".repeat(40);
    assert.ok(route("/v1/catalogues/check-nine"));
    assert.ok(route(`/v1/skills/o/r/n@${rev}`));
    assert.ok(route(`/v1/blobs/${rev}`));
    for (const bad of [
      "/v1/catalogues/../x",
      "/v1/catalogues/a/b",
      "/v1/catalogues/A",
      "/v1/catalogues/x?y",
      `/v1/skills/../r/n@${rev}`,
      `/v1/skills/o/../n@${rev}`,
      `/v1/skills/o/r/..@${rev}`,
      `/v1/skills/o/r/n%2f@${rev}`,
      `/v1/skills/o/r/n@${rev.slice(1)}`,
      `/v1/blobs/${rev.toUpperCase()}`,
      `/v1/blobs/${rev}/`,
      "/v1/blobs/%2e%2e",
      "/",
    ]) {
      assert.equal(route(bad), null, bad);
    }
  });
  test("serves a stored blob; 404 and 405 otherwise", async () => {
    const bytes = Buffer.from("hello\n");
    const sha = lib.gitBlobSha(bytes);
    lib.writeAtomic(lib.blobPath(sha), bytes);
    const server = createServer(handler);
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const { port } = server.address();
    const get = (path, method = "GET") =>
      new Promise((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port, path, method }, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
        });
        req.on("error", reject);
        req.end();
      });
    try {
      const ok = await get(`/v1/blobs/${sha}`);
      assert.equal(ok.status, 200);
      assert.equal(ok.headers["content-type"], "application/octet-stream");
      assert.match(ok.headers["cache-control"], /immutable/);
      assert.deepEqual(ok.body, bytes);
      assert.equal((await get(`/v1/blobs/${"0".repeat(40)}`)).status, 404);
      assert.equal((await get("/v1/blobs/../../etc/passwd")).status, 404);
      assert.equal((await get(`/v1/blobs/${sha}`, "POST")).status, 405);
      assert.equal((await get("/v1/catalogues/none")).status, 404);
    } finally {
      server.close();
    }
  });
});
