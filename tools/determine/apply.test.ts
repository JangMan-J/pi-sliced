// Regression tests for the ruling-c3 model gate in apply.ts: --model is required (even for
// --dry); only the three rotation ids are accepted; every output line must name the packet's
// assigned model. All runs use --dry, so the store is never touched.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const APPLY = join(ROOT, "tools/determine/apply.ts");
const C3 = ["muse-wonder-full-1.0", "grok-4.7", "gemini-4-argon"];

const PACKET = `## acme/widgets/foo

- trace: \`traces/acme/widgets/foo/abc/trace.json\` sha256 \`${"a".repeat(64)}\`
- classification: \`classifications/acme/widgets/foo.json\` sha256 \`${"b".repeat(64)}\`
- source: acme/widgets at ${"c".repeat(40)}, skill folder \`skills/foo\`
- footprint: 2 files, 3.0 KiB
- heavy: no
- triage depth: static
- files (2): SKILL.md (100), README.md (50)
`;

function line(model: string): string {
  return (
    JSON.stringify({
      candidate: "acme/widgets/foo",
      decision: {
        verdict: "admit",
        kind: "platform",
        occasions: [],
        domain: "PDF work",
        everyday: false,
        proficiency: { level: "adequate", note: "Shows the widget call sequence with one worked case." },
        summary: "Drives a widget through its test rig",
        triage: { depth: "static", addressed: [] },
      },
      reason: "The Trace shows two files that name the rig steps.",
      model,
    }) + "\n"
  );
}

const dir = mkdtempSync(join(tmpdir(), "apply-test-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const packet = join(dir, "packet.md");
writeFileSync(packet, PACKET);

function run(outModel: string, extra: string[]): { code: number; out: string } {
  const out = join(dir, `out-${Math.random().toString(36).slice(2)}.jsonl`);
  writeFileSync(out, line(outModel));
  try {
    const stdout = execFileSync(process.execPath, [APPLY, packet, out, ...extra], { encoding: "utf8" });
    return { code: 0, out: stdout };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("each rotation id applies its own packet output", () => {
  for (const m of C3) {
    const r = run(m, ["--dry", "--model", m]);
    assert.equal(r.code, 0, `${m}: ${r.out}`);
    assert.match(r.out, /valid \(dry run\)/);
  }
});

test("mismatched author fails", () => {
  const r = run("gemini-4-argon", ["--dry", "--model", "grok-4.7"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /packet assigned grok-4\.7/);
});

test("unknown, provider-qualified and legacy line models fail", () => {
  for (const m of ["gpt-xyz", "xai/grok-4.7", "claude-sonnet-5-5", "claude-opus-5-5"]) {
    const r = run(m, ["--dry", "--model", "grok-4.7"]);
    assert.equal(r.code, 1, `${m} should fail: ${r.out}`);
    assert.match(r.out, /FAIL acme\/widgets\/foo: model /);
  }
});

test("non-rotation --model values fail", () => {
  for (const m of ["gpt-xyz", "xai/grok-4.7", "claude-sonnet-5-5"]) {
    const r = run("grok-4.7", ["--dry", "--model", m]);
    assert.equal(r.code, 1, `${m} should fail: ${r.out}`);
    assert.match(r.out, /is not a determination-run model/);
  }
});

test("--model is required, even for --dry", () => {
  const r = run("grok-4.7", ["--dry"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /missing required --model/);
});

test("--model with a missing value or a flag as value fails", () => {
  const r1 = run("grok-4.7", ["--dry", "--model"]);
  assert.equal(r1.code, 1);
  assert.match(r1.out, /--model needs a value/);
  const r2 = run("grok-4.7", ["--model", "--dry"]);
  assert.equal(r2.code, 1);
  assert.match(r2.out, /--model needs a value/);
});
