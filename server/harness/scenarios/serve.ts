// Proof 4, in the sandbox: the user serves the nine Candidates; record what the agent can read.
// args: { ids: string[], probes: Array<[host, port]>, allow: [host, port] }
import type { Harness } from "../drive.ts";
import { toolResults } from "../rpc.ts";
import { agentName, requireSeam, serve, state } from "./common.ts";

export default async function (h: Harness) {
  const { ids, probes, allow } = h.args as { ids: string[]; probes: Array<[string, number]>; allow: [string, number] };

  // The sandbox itself: the Author's local files are invisible; only the Author's server is reachable.
  const hidden = h.hidden.map((p) => ({ path: p, visible: h.walk(p, false).length > 0 }));
  const reach: Record<string, string> = {};
  for (const [host, port] of [...probes, allow]) reach[`${host}:${port}`] = await h.probe(host, port);
  h.write("sandbox.json", { hidden, reach });

  const pi = h.startPi();
  await requireSeam(h, pi);
  const served = await serve(pi, ids);
  const st = await state(pi);

  // The agent loads each Served skill's SKILL.md through its tool.
  h.mock.script([{ tools: st.slice.map((e) => ({ name: "served_skill", input: { name: agentName(st.slice, e) } })) }, { text: "done" }]);
  const run = await pi.prompt("Load every served skill.");
  const loads = toolResults(run.records).map((r) => ({ ...r }));

  // Everything readable in the session dir, by path and git blob SHA.
  const files = st.sessionDir ? h.walk(st.sessionDir) : [];
  const exit = await pi.close();
  h.write("result.json", {
    served,
    state: st,
    loads,
    files,
    exit,
    afterExit: st.sessionDir ? h.walk(st.sessionDir, false).length : 0,
  });
}
