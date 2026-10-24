// Proof 7: the cost of a Served skill the agent has not read is measured.
// Payload of one identical prompt for Slices of 0, 1, 10 and 50 genuinely admitted skills.
// Pass: Δ(N) = |payload(N)| − |payload(0)| ≤ F + Σ(len(name) + len(description) + 128), with F the
// fixed overhead measured from the 1-skill Slice and the same for every size, and no payload holds
// a Served skill's body or reference file text.
import { fetchCatalogue, readJson, Verdict, writeOut } from "./host.ts";
import { runSandbox, serverUrl } from "./sandbox.ts";

const v = new Verdict("check-cost", 7);
const CATALOGUE = process.env.PI_SLICED_COST_CATALOGUE || "admitted";
const SIZES = [0, 1, 10, 50];
const FRAMING = 128;
const bytes = (s: string) => Buffer.byteLength(s, "utf8");

const cat = await fetchCatalogue(CATALOGUE).catch((e) => v.abort(`catalogue ${CATALOGUE} unavailable: ${e.message}`));
const ids = cat.skills.map((s) => s.id);
const sizes = SIZES.filter((n) => n <= ids.length);
if (ids.length < 50)
  v.fail(
    `${CATALOGUE} lists ${ids.length} skills, fewer than the 50 proof 7 needs (the Author's server has not admitted 50 traced skills to it); Slices of ${SIZES.filter((n) => n > ids.length).join(", ")} not measured, and no smaller Slice is substituted`,
  );

const run = await runSandbox({
  name: "cost",
  scenario: "server/harness/scenarios/cost.ts",
  net: "isolated",
  sessionEnv: { PI_SLICED_CHECK_DRIVER: "1", PI_SLICED_SERVER: serverUrl(), PI_SLICED_CATALOGUE: CATALOGUE },
  args: { sizes, ids },
});
try {
  const err = readJson(`${run.out}/error.json`);
  const r = readJson(`${run.out}/result.json`);
  if (err || !r) v.abort(`sessions did not complete (drive exit ${run.code}): ${err?.error ?? "no result"}`);
  const runs: any[] = r.runs;
  const empty = runs.find((x) => x.n === 0);
  const B0 = bytes(empty.body);
  const parse = (body: string) => JSON.parse(body);
  const sys = (p: any) => (Array.isArray(p.system) ? p.system.map((b: any) => b.text).join("") : String(p.system ?? ""));
  const p0 = parse(empty.body);

  const rows: any[] = [];
  let F: number | undefined;
  for (const x of runs) {
    for (const e of x.errors) v.fail(`N=${x.n}: serve ${e.id}: ${e.message}`);
    v.ok(x.served === x.n && x.slice.length === x.n, `N=${x.n}: Slice holds ${x.slice.length} skills`);
    v.ok(x.requests === 1, `N=${x.n}: ${x.requests} model requests, expected 1`);
    v.ok(x.exit === 0, `N=${x.n}: pi exited ${x.exit}`);
    for (const h of x.hits) v.fail(`N=${x.n}: payload holds ${h.id} ${h.file} text: ${JSON.stringify(h.line.slice(0, 80))}`);
    const B = bytes(x.body);
    const delta = B - B0;
    const nameDesc = x.slice.reduce((s: number, e: any) => s + bytes(e.name) + bytes(e.description), 0);
    const fixed = delta; // codemode MCP defers per-skill metadata until discovery, so the entire unread delta is fixed
    if (x.n === 1) F = fixed;
    const p = parse(x.body);
    rows.push({
      n: x.n,
      payloadBytes: B,
      deltaBytes: delta,
      namesAndDescriptions: nameDesc,
      perSkillFramingMax: 0,
      fixedOverhead: x.n ? fixed : 0,
      toolsDelta: bytes(JSON.stringify(p.tools ?? [])) - bytes(JSON.stringify(p0.tools ?? [])),
      systemDelta: bytes(JSON.stringify(sys(p))) - bytes(JSON.stringify(sys(p0))),
      bodyLinesProbed: x.probed,
      bodyLinesFound: x.hits.length,
    });
  }
  v.ok(F !== undefined, "no 1-skill Slice measured; F cannot be derived");
  if (F !== undefined) {
    for (const row of rows) {
      if (row.n === 0) continue;
      const bound = F + row.namesAndDescriptions + FRAMING * row.n;
      row.bound = bound;
      v.ok(row.fixedOverhead === F, `N=${row.n}: fixed overhead ${row.fixedOverhead} B ≠ F = ${F} B (not the same for every Slice size)`);
      v.ok(row.deltaBytes <= bound, `N=${row.n}: Δ ${row.deltaBytes} B > F + Σ(name+description+${FRAMING}) = ${bound} B`);
    }
  }
  const one = rows.find((x) => x.n === 1);
  const report = {
    catalogue: CATALOGUE,
    channel: "mcp",
    measured: new Date().toISOString(),
    emptySlicePayloadBytes: B0,
    F,
    F_parts: one ? { toolDefinitions: one.toolsDelta, promptSectionFixedText: (F ?? 0) - one.toolsDelta } : undefined,
    framingPerSkillAllowed: FRAMING,
    rows,
    missingSizes: SIZES.filter((n) => !sizes.includes(n)),
  };
  writeOut("cost.json", report);
  console.log(JSON.stringify(report, null, 2));
  v.note(`F = ${F} B: tool definitions ${one?.toolsDelta} B + fixed prompt-section text ${(F ?? 0) - (one?.toolsDelta ?? 0)} B (measured from N=1)`);
  for (const row of rows)
    v.note(
      `N=${row.n}: payload ${row.payloadBytes} B, Δ ${row.deltaBytes} B${row.n ? ` ≤ bound ${row.bound} B; fixed ${row.fixedOverhead} B; per-skill framing ≤ ${row.perSkillFramingMax} B` : ""}; ${row.bodyLinesProbed} body/reference lines probed, ${row.bodyLinesFound} found`,
    );
  run.cleanup();
  v.finish(`payload sizes for Slices of ${sizes.join(", ")} written to server/harness/out/cost.json`);
} catch (e) {
  v.fail(String((e as Error).stack ?? e));
  v.finish(`harness error (work dir ${run.work})`);
}
