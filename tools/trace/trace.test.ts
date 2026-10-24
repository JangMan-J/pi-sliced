// Unit tests for the reading rules that do not need a repository.
// Run: node --test tools/trace/
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DIRECTION_VERBS, directionVerbs, isExistenceCheck } from "./trace.ts";
import { clean, extractRefs, pathShaped } from "./refs.ts";
import { BASE_TOOLS, extractOutside } from "./outside.ts";
import { JudgementStore, questionId, type Question } from "./judge.ts";
import { writeTrace } from "./store.ts";

test("direction verbs: the committed list, matched as whole words outside code spans", () => {
  assert.deepEqual(DIRECTION_VERBS, [
    "read", "study", "follow", "run", "load", "open", "copy", "search", "consult", "use", "see",
    "refer to", "check out", "review", "execute", "invoke", "import", "source", "fetch", "view",
    "look at", "start with", "start from", "apply",
  ]);
  assert.deepEqual(directionVerbs("Read the package source for API details"), ["read", "source"]);
  assert.deepEqual(directionVerbs("Search the `./canvas-fonts` directory."), ["search"]);
  assert.deepEqual(directionVerbs("The helpers live in the skill's `scripts/` directory"), []);
  assert.deepEqual(directionVerbs("because it is used and reviewed"), []);
  assert.deepEqual(directionVerbs("Refer to `x` and look  at `y`"), ["refer to", "look at"]);
  assert.deepEqual(directionVerbs("`read` in a code span is not a verb"), []);
});

test("existence and location checks (F10)", () => {
  assert.ok(isExistenceCheck("Check the directory two levels above the loaded `SKILL.md` for `plugin.json`,"));
  assert.ok(isExistenceCheck('if [ -d "$REPO_ROOT/../../skills/x" ]; then'));
  assert.ok(isExistenceCheck("test -f scripts/x.sh && run it"));
  assert.ok(isExistenceCheck("If `GLOSSARY.md` exists, read it."));
  assert.ok(!isExistenceCheck("Read `references/x.md` before writing."));
});

test("path tokens", () => {
  assert.ok(pathShaped("references/x.md"));
  assert.ok(pathShaped("../../references/frontend-prompts.md"));
  assert.ok(pathShaped("house-style.md"));
  assert.ok(pathShaped("<PLUGIN_ROOT>/skills/<name>/SKILL.md"));
  assert.ok(pathShaped("$REPO_ROOT/../../skills/a/b.py"));
  assert.ok(!pathShaped("*/"));
  assert.ok(!pathShaped("https://example.com/x"));
  assert.ok(!pathShaped("1.2.3"));
  assert.ok(!pathShaped("a b/c"));
  assert.equal(clean("`<PLUGIN_ROOT>/skills/x.mjs`"), "<PLUGIN_ROOT>/skills/x.mjs");
  assert.equal(clean("(references/x.md)."), "references/x.md");
});

test("references: links, code spans, prose, fences; comments are skipped", () => {
  const md = [
    "---",
    "license: Complete terms in LICENSE.txt",
    "---",
    "See [tests](tests.md) and `references/a.md`; also ./canvas-fonts here.",
    "```bash",
    "node scripts/run.mjs # see scripts/ignored.mjs",
    "```",
  ].join("\n");
  const refs = extractRefs("skills/x/SKILL.md", md).map((r) => `${r.kind}:${r.raw}`);
  assert.deepEqual(refs, ["frontmatter:LICENSE.txt", "link:tests.md", "code:references/a.md", "bare:./canvas-fonts", "fence:scripts/run.mjs"]);
  const js = ['// read ./skipped.md', 'const p = path.join(dir, "..", "assets");', 'load("./x.json")'].join("\n");
  assert.deepEqual(
    extractRefs("skills/x/scripts/a.mjs", js).map((r) => r.raw).sort(),
    ["../assets", "./x.json"],
  );
  // A join call spread over lines, with nested calls, still yields its literal path.
  const multi = ["export const DIR = join(", "  dirname(fileURLToPath(import.meta.url)),", '  "..",', '  "assets",', '  "sfx",', ");"].join("\n");
  assert.deepEqual(extractRefs("skills/x/scripts/b.mjs", multi).map((r) => `${r.line}:${r.raw}`), ["1:../assets/sfx"]);
});

test("outside requirements: base tools never count; runners record what they run", () => {
  for (const t of ["ls", "grep", "sed", "git", "curl", "node", "python3", "npx", "pip", "apt", "brew"]) assert.ok(BASE_TOOLS.has(t), t);
  const md = [
    "Run `npx shadcn@latest add button` or `pnpm dlx shadcn@latest init`.",
    "```bash",
    "npm install @figma/code-connect@latest left-pad",
    "export FIGMA_ACCESS_TOKEN=abc",
    "grep -n foo bar | sort",
    "docker ps",
    "curl https://mock.shop/llms.txt http://localhost:8000/v1",
    "```",
    "The Figma MCP server must be connected.",
    "Read the [template](https://github.com/x/y) before you start; see [docs](https://docs.example.org/z).",
  ].join("\n");
  const got = extractOutside("skills/x/SKILL.md", md).map((o) => `${o.kind}:${o.name}`);
  assert.deepEqual(
    [...new Set(got)].sort(),
    [
      "cli:docker",
      "cli:shadcn",
      "credential:FIGMA_ACCESS_TOKEN",
      "mcp-server:figma",
      "network:github.com",
      "network:mock.shop",
      "package:@figma/code-connect",
      "package:left-pad",
    ],
  );
});

test("judgement store: append-only, versioned, conflicts rejected", () => {
  const root = mkdtempSync(join(tmpdir(), "judge-"));
  const base: Omit<Question, "id"> = {
    class: "outside-skill-folders",
    source: "o/r",
    revision: "a".repeat(40),
    file: "skills/x/SKILL.md",
    line: 3,
    ref: "../../packages/p/",
    sentence: "Read the package source.",
    context: [],
    target: { path: "packages/p", isDirectory: true, files: 2, bytes: 10, codePackage: "packages/p" },
    verbHint: ["read", "source"],
    workflow: null,
  };
  const q: Question = { ...base, id: questionId(base) };
  const s = new JudgementStore(root, "judge-test");
  assert.equal(s.decide(q), undefined);
  assert.equal(s.pending.size, 1);
  const qs = new Map([[q.id, q]]);
  assert.equal(s.append("o/r", q.revision, qs, [{ id: q.id, pullsIn: true, reason: "r", judge: "judge-test", model: "m" }]), 1);
  // A second, different answer for the same id is never written.
  assert.equal(s.append("o/r", q.revision, qs, [{ id: q.id, pullsIn: false, reason: "r2", judge: "judge-test", model: "m" }]), 0);
  assert.equal(new JudgementStore(root, "judge-test").decide(q), true);
  assert.throws(() => s.append("o/r", q.revision, qs, [{ id: q.id, pullsIn: true, reason: "r", judge: "other", model: "m" }]));
  // The same question under another judge version is unanswered.
  assert.equal(new JudgementStore(root, "judge-other").decide(q), undefined);
});

test("trace store: never overwrites", () => {
  const root = mkdtempSync(join(tmpdir(), "traces-"));
  const t = {
    format: "pi-sliced.trace/1", tracer: "trace-x", judge: "judge-x", candidate: "o/r/s", source: "o/r",
    revision: "b".repeat(40), skillPath: "s", status: "resolved" as const, files: [], outside: [],
    totals: { files: 0, bytes: 0 }, namedSkills: [], checkoutReach: [], licence: null, pending: [],
  };
  assert.equal(writeTrace(root, t), "written");
  assert.equal(writeTrace(root, t), "unchanged");
  assert.throws(() => writeTrace(root, { ...t, totals: { files: 1, bytes: 1 } }), /never overwritten/);
  assert.match(readFileSync(join(root, "traces/o/r/s", "b".repeat(40), "trace-x+judge-x.json"), "utf8"), /"tracer": "trace-x"/);
  assert.throws(() => writeTrace(root, { ...t, candidate: "o/r/p", status: "pending" as const, pending: ["q"] }), /pending/);
});
