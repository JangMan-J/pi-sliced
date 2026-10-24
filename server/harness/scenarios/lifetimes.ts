// Proof 5, in the sandbox: session 1 serves A and B and the agent reads a file of each; session 1
// exits; HOME and the temp dirs are compared with their state before session 1; session 2 starts
// and the agent tries to load A and B and read their old paths.
// args: { ids: [A, B] }
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Harness } from "../drive.ts";
import { blobSha, type WalkEntry } from "../lib.ts";
import { toolResults } from "../rpc.ts";
import { agentName, requireSeam, serve, state } from "./common.ts";

export default async function (h: Harness) {
  const ids: string[] = h.args.ids;
  const roots = [h.home, "/tmp", "/var/tmp", "/dev/shm", process.cwd()];
  const snap = () => Object.fromEntries(roots.map((r) => [r, h.walk(r)])) as Record<string, WalkEntry[]>;
  const before = snap();

  // Session 1.
  const pi1 = h.startPi();
  await requireSeam(h, pi1);
  const served1 = await serve(pi1, ids);
  const st1 = await state(pi1);

  // What was served: every file's blob, and text samples to find copies of it anywhere later.
  const servedBlobs = new Set<string>();
  const samples: string[] = [];
  const reads: Record<string, string> = {};
  for (const e of st1.slice) {
    const files = h.walk(e.root).filter((f) => f.kind === "file");
    for (const f of files) {
      servedBlobs.add(f.blob!);
      const text = readFileSync(join(e.root, f.path), "utf8");
      for (const line of text.split("\n")) if (line.trim().length >= 40 && samples.length < 400) samples.push(line.trim());
    }
    // The agent reads one file of each: a non-SKILL.md file when there is one.
    const pick = files.find((f) => !f.path.endsWith("/SKILL.md") && f.path !== "SKILL.md") ?? files[0];
    reads[e.id] = join(e.root, pick.path);
  }
  const names = Object.fromEntries(st1.slice.map((e) => [e.id, agentName(st1.slice, e)]));
  h.mock.script([
    {
      tools: [
        ...ids.map((id) => ({ name: "served_skill", input: { name: names[id] } })),
        ...ids.map((id) => ({ name: "read", input: { path: reads[id] } })),
      ],
    },
    { text: "done" },
  ]);
  const run1 = await pi1.prompt("Use both served skills.");
  const tools1 = toolResults(run1.records);
  const exit1 = await pi1.close();
  const after = snap();

  // Every entry that is new or changed since before session 1, and whether it holds served content.
  const changed: Array<WalkEntry & { root: string; abs: string; blobHit: boolean; sampleHits: number }> = [];
  for (const r of roots) {
    const prev = new Map(before[r].map((e) => [e.path, e]));
    for (const e of after[r]) {
      const p = prev.get(e.path);
      if (p && p.kind === e.kind && p.blob === e.blob && p.size === e.size) continue;
      const abs = join(r, e.path);
      let blobHit = false;
      let sampleHits = 0;
      if (e.kind === "file") {
        const bytes = readFileSync(abs);
        blobHit = servedBlobs.has(blobSha(bytes));
        const text = bytes.toString("utf8");
        sampleHits = samples.filter((s) => text.includes(s)).length;
      }
      changed.push({ ...e, root: r, abs, blobHit, sampleHits });
    }
  }

  // Session 2.
  const pi2 = h.startPi();
  const st2 = await state(pi2);
  h.mock.script([
    {
      tools: [
        ...ids.flatMap((id) => [
          { name: "served_skill", input: { name: names[id] } },
          { name: "served_skill", input: { name: id } },
        ]),
        ...ids.map((id) => ({ name: "read", input: { path: reads[id] } })),
      ],
    },
    { text: "done" },
  ]);
  const run2 = await pi2.prompt("Use the skills from before.");
  const tools2 = toolResults(run2.records).map((t) => ({ ...t, sampleHits: samples.filter((s) => t.text.includes(s)).length }));
  const exit2 = await pi2.close();

  h.write("result.json", {
    ids,
    served1,
    state1: st1,
    reads,
    tools1: tools1.map((t) => ({ toolName: t.toolName, args: t.args, isError: t.isError, bytes: t.text.length })),
    exit1,
    sessionDirExistsAfterExit: st1.sessionDir ? existsSync(st1.sessionDir) : null,
    roots,
    changed,
    servedFiles: servedBlobs.size,
    samples: samples.length,
    state2: st2,
    tools2,
    exit2,
  });
}
