// Proof 5: a Served skill is gone when its session ends.
import { readJson, Verdict } from "./host.ts";
import { runSandbox, serverUrl } from "./sandbox.ts";

const v = new Verdict("check-lifetimes", 5);
const A = "mattpocock/skills/tdd";
const B = "openai/plugins/game-ui-frontend";
const CATALOGUE = "check-nine";

const run = await runSandbox({
  name: "lifetimes",
  scenario: "server/harness/scenarios/lifetimes.ts",
  net: "isolated",
  sessionEnv: { PI_SLICED_CHECK_DRIVER: "1", PI_SLICED_SERVER: serverUrl(), PI_SLICED_CATALOGUE: CATALOGUE },
  args: { ids: [A, B] },
});
try {
  const err = readJson(`${run.out}/error.json`);
  const r = readJson(`${run.out}/result.json`);
  if (err || !r) v.abort(`session did not complete (drive exit ${run.code}): ${err?.error ?? "no result"}`);
  const [home, tmp] = r.roots as string[];

  // Session 1 served A and B, and the agent loaded and read a file of each.
  for (const e of r.served1.errors) v.fail(`session 1: serve ${e.id}: ${e.message}`);
  for (const id of [A, B]) v.ok(r.state1.slice.some((e: any) => e.id === id), `session 1: ${id} not in the Slice`);
  for (const t of r.tools1) v.ok(!t.isError && t.bytes > 0, `session 1: ${t.toolName} ${JSON.stringify(t.args)} failed`);
  v.ok(r.tools1.length === 4, `session 1: expected 4 tool results, got ${r.tools1.length}`);
  v.ok(r.exit1 === 0, `session 1: pi exited ${r.exit1}`);
  v.note(`session 1: served ${[A, B].join(", ")} in ${r.state1.sessionDir}; agent loaded both and read ${Object.values(r.reads).join(", ")}`);

  // After session 1: HOME and the temp dirs vs before it.
  v.ok(r.sessionDirExistsAfterExit === false, `session dir ${r.state1.sessionDir} remains after session 1`);
  const piSession = (p: string) => p.startsWith(`${home}/.pi/agent/sessions/`);
  const piPackage = (p: string) => /^\/tmp\/jiti\/pi-sliced-[\w-]+\.[0-9a-f]+\.mjs$/.test(p); // Pi's compiled copy of the pi-sliced extension
  const harness = (p: string) => /^\/tmp\/jiti\/harness-[\w-]+\.[0-9a-f]+\.mjs$/.test(p); // the check's mock provider
  const piOwn = (p: string) => p === `${home}/.pi` || p.startsWith(`${home}/.pi/agent`) || p === "/tmp/jiti";
  const rows: string[] = [];
  for (const c of r.changed) {
    const cls = piSession(c.abs)
      ? "Pi session file (excluded)"
      : piPackage(c.abs)
        ? "pi-sliced package, compiled by Pi (excluded)"
        : harness(c.abs)
          ? "check harness mock provider"
          : piOwn(c.abs)
            ? "Pi's own state"
            : "UNEXPLAINED";
    rows.push(`${c.kind} ${c.abs} (${c.size} B) — ${cls}${c.blobHit ? ", equals a served file" : ""}${c.sampleHits ? `, contains ${c.sampleHits} served line(s)` : ""}`);
    if (cls === "UNEXPLAINED") v.fail(`after session 1: ${c.kind} ${c.abs} is new or changed and is not Pi's own`);
    if (/\/pi-sliced-\d+-/.test(c.abs)) v.fail(`after session 1: pi-sliced session dir entry remains: ${c.abs}`);
    if (!piSession(c.abs) && (c.blobHit || c.sampleHits)) v.fail(`after session 1: ${c.abs} holds served content`);
  }
  v.note(`diff of ${r.roots.join(", ")} after session 1 vs before (${r.servedFiles} served files, ${r.samples} served lines searched):`);
  for (const row of rows) v.note(`  ${row}`);

  // Session 2: empty Slice; A and B cannot be loaded or read.
  v.ok(r.mcpAfter?.tools.length === 0, "session 2: MCP tools remain discoverable");
  v.ok(r.mcpAfter.rejected.length === 2 && r.mcpAfter.rejected.every(Boolean), "session 2: old MCP load calls were not rejected");
  v.ok(r.state2.slice.length === 0, `session 2: Slice not empty: ${r.state2.slice.map((e: any) => e.id).join(", ")}`);
  v.ok(r.state2.sessionDir === null, `session 2: has a session dir at start: ${r.state2.sessionDir}`);
  for (const t of r.tools2) {
    v.ok(t.isError && t.sampleHits === 0, `session 2: ${t.toolName} ${JSON.stringify(t.args)} returned served content: ${t.text.slice(0, 160)}`);
  }
  v.ok(r.tools2.length === 2, `session 2: expected 2 tool results, got ${r.tools2.length}`);
  for (const t of r.tools2) v.note(`session 2: ${t.toolName} ${JSON.stringify(t.args)} → ${t.isError ? "error" : "ok"}: ${t.text.split("\n")[0].slice(0, 120)}`);
  v.ok(r.exit2 === 0, `session 2: pi exited ${r.exit2}`);
  run.cleanup();
  v.finish(`after session 1 nothing served remains in HOME or ${[tmp, "/var/tmp", "/dev/shm"].join(", ")}; session 2 starts with an empty Slice and cannot load or read A or B`);
} catch (e) {
  v.fail(String((e as Error).stack ?? e));
  v.finish(`harness error (work dir ${run.work})`);
}
