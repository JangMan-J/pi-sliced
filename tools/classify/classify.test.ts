import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { classify, serializeClassification, sha256 } from "./classify.ts";
import { appendDetermination, readDeterminations, inForce } from "../determine/store.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const TDD = "traces/mattpocock/skills/tdd/5beb35b040e3de97e54fa9e386d7e42d15c295c2/trace-3+judge-4.json";
const CANVAS = "traces/anthropics/skills/canvas-design/dbd4588f9e1033efb41dad4bef2f7947c8993d44/trace-3+judge-4.json";

test("classification: deterministic, Heavy as the glossary defines it", () => {
  const canvas = readFileSync(join(ROOT, CANVAS), "utf8");
  const a = serializeClassification(classify(canvas, CANVAS));
  assert.equal(a, serializeClassification(classify(canvas, CANVAS)));
  const c = classify(canvas, CANVAS);
  assert.equal(c.heavy!.heavy, true); // 5.3 MiB of files
  assert.match(c.footprint!.summary, /^83 files, 5\.3 MiB · 54 fonts$/);
  assert.equal(c.footprint!.short, "5.3 MiB");
  const tdd = classify(readFileSync(join(ROOT, TDD), "utf8"), TDD);
  assert.equal(tdd.heavy!.heavy, false);
  assert.deepEqual(tdd.markers, []);
  assert.deepEqual(tdd.companions!.named.map((n) => n.name).includes("code-review"), true);
});

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "rederive-"));
  mkdirSync(join(root, TDD, ".."), { recursive: true });
  cpSync(join(ROOT, TDD), join(root, TDD)); // one Trace, so that it is the current one
  return root;
}

const rederive = (root: string) =>
  spawnSync("node", [join(ROOT, "tools/classify/rederive.ts")], { env: { ...process.env, PI_SLICED_ROOT: root }, encoding: "utf8" });

test("determinations: append-only, pinned to the bytes they read; rederive flags changed inputs", () => {
  const root = scratch();
  execFileSync("node", [join(ROOT, "tools/classify/rederive.ts"), "--write"], { env: { ...process.env, PI_SLICED_ROOT: root } });
  assert.equal(rederive(root).status, 0);
  const cls = "classifications/mattpocock/skills/tdd/5beb35b040e3de97e54fa9e386d7e42d15c295c2/trace-3+judge-4+classify-1.json";
  const ref = (p: string) => ({ path: p, sha256: sha256(readFileSync(join(root, p))) });
  const d = {
    candidate: "mattpocock/skills/tdd",
    revision: "5beb35b040e3de97e54fa9e386d7e42d15c295c2",
    trace: ref(TDD),
    classification: ref(cls),
    decision: { verdict: "test" },
    reason: "a test record",
    time: "2026-10-24T00:00:00Z",
    author: { kind: "human" as const, id: "test" },
  };
  const r1 = appendDetermination(root, d);
  assert.equal(appendDetermination(root, d).id, r1.id); // the same record twice is a no-op
  assert.throws(() => appendDetermination(root, { ...d, trace: { ...d.trace, sha256: "0".repeat(64) } }), /does not have sha256/);
  assert.throws(() => appendDetermination(root, { ...d, reason: " " }), /reason/);
  const r2 = appendDetermination(root, { ...d, reason: "second thoughts", supersedes: r1.id });
  assert.equal(inForce(readDeterminations(root).get("mattpocock/skills/tdd")!)!.id, r2.id);
  assert.match(rederive(root).stdout, /inputs changed: 0/);

  // An edited record is detected.
  const file = join(root, "determinations/mattpocock/skills/tdd.jsonl");
  writeFileSync(file, readFileSync(file, "utf8").replace("second thoughts", "edited"));
  assert.throws(() => readDeterminations(root), /does not hash to its id/);
  writeFileSync(file, readFileSync(file, "utf8").replace("edited", "second thoughts"));

  // A tampered Classification fails the check; a new Trace version flags the Determination.
  const clsFile = join(root, cls);
  const good = readFileSync(clsFile, "utf8");
  writeFileSync(clsFile, good.replace('"heavy":false', '"heavy":true'));
  assert.equal(rederive(root).status, 1);
  writeFileSync(clsFile, good);
  const next = join(root, TDD.replace("trace-3+judge-4", "trace-3+judge-5"));
  writeFileSync(next, readFileSync(join(root, TDD), "utf8").replace('"judge":"judge-4"', '"judge":"judge-5"'));
  execFileSync("node", [join(ROOT, "tools/classify/rederive.ts"), "--write"], { env: { ...process.env, PI_SLICED_ROOT: root } });
  const out = rederive(root);
  assert.equal(out.status, 0); // both Traces keep their Classifications
  assert.match(out.stdout, /CHANGED mattpocock\/skills\/tdd: Trace changed/);
});
