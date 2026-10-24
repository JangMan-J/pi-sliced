// Proof 4: Catalogue skills are served exactly as traced, from the Author's server only.
import { blobSha } from "./lib.ts";
import { fetchCatalogue, PROOF_NINE, readJson, traceFor, Verdict, writeOut } from "./host.ts";
import { readPcap } from "./pcap.ts";
import { runSandbox, serverUrl } from "./sandbox.ts";

const v = new Verdict("check-serve", 4);
const CATALOGUE = "check-nine";
/** Third parties the sandbox must not reach: GitHub, Cloudflare DNS, Vercel (skills.sh proxy), Google. */
const PROBES: Array<[string, number]> = [
  ["140.82.112.3", 443],
  ["140.82.112.4", 22],
  ["1.1.1.1", 443],
  ["76.76.21.21", 443],
  ["8.8.8.8", 53],
];

const cat = await fetchCatalogue(CATALOGUE).catch((e) => v.finish(`catalogue ${CATALOGUE} unavailable: ${e.message}`));
const listed = new Map(cat.skills.map((s) => [s.id, s]));
for (const id of PROOF_NINE) v.ok(listed.has(id), `${CATALOGUE} does not admit ${id}`);
if (v.fails.length) v.finish(`${CATALOGUE} does not admit the nine Candidates`);

const run = await runSandbox({
  name: "serve",
  scenario: "server/harness/scenarios/serve.ts",
  net: "isolated",
  sessionEnv: { PI_SLICED_CHECK_DRIVER: "1", PI_SLICED_SERVER: serverUrl(), PI_SLICED_CATALOGUE: CATALOGUE },
  args: { ids: PROOF_NINE, probes: PROBES, allow: [new URL(serverUrl()).hostname, Number(new URL(serverUrl()).port || 443)] },
});
try {
  const err = readJson(`${run.out}/error.json`);
  const sb = readJson(`${run.out}/sandbox.json`);
  const res = readJson(`${run.out}/result.json`);
  if (err || !res || !sb) v.finish(`session did not complete (drive exit ${run.code}): ${err?.error ?? "no result"}`);
  const allowKey = `${run.allow!.host}:${run.allow!.port}`;

  // The sandbox: no Author's local files, no third party, the Author's server reachable.
  for (const hdn of sb.hidden) v.ok(!hdn.visible, `Author's local path visible in the sandbox: ${hdn.path}`);
  for (const [k, r] of Object.entries<string>(sb.reach)) {
    if (k === allowKey) v.ok(r === "connected", `Author's server ${k} unreachable from the sandbox: ${r}`);
    else v.ok(r !== "connected", `third party ${k} reachable from the sandbox`);
  }
  v.note(`sandbox: hidden ${sb.hidden.map((x: any) => x.path).join(", ")}; reach ${JSON.stringify(sb.reach)}`);

  // Each of the nine: Served at its listed Revision; files readable == the Trace's files by path and blob SHA.
  const bySlice = new Map<string, any>(res.state.slice.map((e: any) => [e.id, e]));
  for (const e of res.served.errors) v.fail(`serve ${e.id}: ${e.message}`);
  const files: Array<{ path: string; kind: string; blob?: string }> = res.files;
  const claimed = new Set<string>();
  let traced = 0;
  const blobs = new Map<string, number>();
  for (const id of PROOF_NINE) {
    const e = bySlice.get(id);
    if (!v.ok(e, `${id} is not in the Slice`)) continue;
    const listing = listed.get(id)!;
    v.ok(e.revision === listing.revision, `${id} served at ${e.revision}, listed at ${listing.revision}`);
    let trace;
    let traceName = "";
    try {
      const t = traceFor(id, e.revision);
      trace = t.trace;
      traceName = t.file.split("/").pop()!;
    } catch (x) {
      v.fail((x as Error).message);
      continue;
    }
    const rel = e.root.slice(res.state.sessionDir.length + 1);
    const want = new Map(trace.files.map((f) => [f.path, f.blob]));
    const got = new Map<string, string>();
    for (const f of files) {
      if (!(f.path === rel || f.path.startsWith(`${rel}/`))) continue;
      claimed.add(f.path);
      if (f.kind === "dir") continue;
      const p = f.path.slice(rel.length + 1);
      if (!v.ok(f.kind === "file", `${id}: ${p} is a ${f.kind}, not a file`)) continue;
      got.set(p, f.blob!);
    }
    for (const [p, b] of want) {
      if (!got.has(p)) v.fail(`${id}: traced file missing: ${p}`);
      else if (got.get(p) !== b) v.fail(`${id}: ${p} blob ${got.get(p)} ≠ traced ${b}`);
    }
    for (const p of got.keys()) if (!want.has(p)) v.fail(`${id}: file not in the Trace: ${p}`);
    traced += want.size;
    for (const f of trace.files) blobs.set(f.blob, f.size);
    // The agent's load returns its SKILL.md byte for byte.
    const md = trace.files.find((f) => f.path === `${trace.skillPath}/SKILL.md`);
    const load = res.loads.find((l: any) => l.toolName === "served_skill" && (l.args.name === e.name || l.args.name === id));
    if (v.ok(load && !load.isError, `${id}: served_skill load failed: ${load?.text?.slice(0, 200)}`) && md) {
      const body = load.text.slice(load.text.indexOf("\n\n") + 2);
      v.ok(blobSha(Buffer.from(body, "utf8")) === md.blob, `${id}: served_skill text is not its traced SKILL.md`);
    }
    v.note(`${id}@${e.revision.slice(0, 12)}: ${got.size}/${want.size} files match the Trace (${traceName}) by path and blob SHA`);
  }
  // Nothing else readable in the session dir.
  for (const f of files) if (!claimed.has(f.path)) v.fail(`session dir holds an unclaimed entry: ${f.path}`);

  // Every connection that left the sandbox went to the Author's server.
  const pc = readPcap(run.pcap!, run.local!);
  for (const c of pc.connects) v.ok(`${c.dst}:${c.dport}` === allowKey, `connection to ${c.dst}:${c.dport} (not the Author's server)`);
  for (const u of pc.udp) v.fail(`UDP flow to ${u.dst}:${u.dport}`);
  for (const p of pc.otherProtocols.filter((n) => n !== 0)) v.fail(`IP protocol ${p} left the sandbox`);
  const inBytes = Object.entries(pc.bytes).reduce((s, [k, b]) => s + (k === allowKey ? b.in : 0), 0);
  const fileBytes = [...blobs.values()].reduce((a, b) => a + b, 0);
  v.ok(pc.connects.length > 0, "no connection to the Author's server recorded");
  v.ok(inBytes >= fileBytes, `received ${inBytes} B from the Author's server, less than the ${fileBytes} B of distinct traced files`);
  v.note(
    `pcap: ${pc.packets} frames; TCP connections: ${pc.connects.length}, all to ${[...new Set(pc.connects.map((c) => `${c.dst}:${c.dport}`))].join(", ") || "none"}; UDP flows: ${pc.udp.length}; ${inBytes} B in from ${allowKey} (distinct traced bytes ${fileBytes})`,
  );
  v.ok(res.exit === 0, `pi exited ${res.exit}`);
  writeOut("serve.json", { files: traced, connects: pc.connects, bytes: pc.bytes, sandbox: sb });
  run.cleanup();
  v.finish(`${PROOF_NINE.length} Candidates served from ${allowKey}, ${traced} traced files compared by blob SHA`);
} catch (e) {
  v.fail(String((e as Error).stack ?? e));
  v.finish(`harness error (work dir ${run.work})`);
}
