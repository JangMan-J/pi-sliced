// Proof 6, in the sandbox: a session holding Skills.sh search results and a Slice of one skill.
// Turn 1: the agent uses the Served skill. Turn 2: it searches HOME and the temp dirs for every
// unserved skill by id and by name. Turn 3: it tries to load every unserved skill by name and by id.
// args: { serve: string, term: string, catalogue: Array<{ id, name }> }
import type { Harness } from "../drive.ts";
import { toolResults } from "../rpc.ts";
import { agentName, requireSeam, serve, state, untraced } from "./common.ts";

/** Shell word for `s` with `''` inserted in every segment, so the needle never appears whole in the transcript. */
function split(s: string): string {
  if (!/^[\w.@:+\/-]+$/.test(s)) throw new Error(`unexpected characters in ${JSON.stringify(s)}`);
  return `'${s
    .split("/")
    .map((seg) => (seg.length > 1 ? `${seg[0]}''${seg.slice(1)}` : seg))
    .join("/")}'`;
}

export default async function (h: Harness) {
  const { serve: sid, term, catalogue } = h.args as { serve: string; term: string; catalogue: Array<{ id: string; name: string }> };
  const pi = h.startPi();
  await requireSeam(h, pi);

  const held = await untraced(pi, term);
  const served = await serve(pi, [sid]);
  const st = await state(pi);
  const mark = () => h.mock.requests.length;

  // Turn 1: the Served skill, used normally.
  const e = st.slice.find((x) => x.id === sid);
  const t1from = mark();
  h.mock.script([
    { tools: e ? [{ name: "served_skill", input: { name: agentName(st.slice, e) } }] : [] },
    { text: "done" },
  ]);
  const r1 = await pi.prompt("Use the served skill.");

  // Every unserved skill the session knows of: the Catalogue's others and the Skills.sh results it holds.
  const unserved = [
    ...catalogue.filter((c) => c.id !== sid),
    ...held.items.filter((i: any) => i.id !== sid).map((i: any) => ({ id: i.id, name: i.name })),
  ];
  const dirs = `"$HOME" /tmp /var/tmp /dev/shm "$PWD"`;
  const ids = unserved.map((u) => split(u.id)).join(" ");
  const names = [...new Set(unserved.map((u) => u.name))].map(split).join(" ");
  const search =
    `for n in ${ids}; do grep -rIlF -- "$n" ${dirs} 2>/dev/null; done; ` +
    `for n in ${names}; do find ${dirs} -name "*$n*" 2>/dev/null; done; ` +
    // Control: the same search finds the Served skill's folder.
    `echo CONTROL; find ${dirs} -name ${split(e?.skillDir.split("/").pop() ?? sid)} 2>/dev/null; echo SEARCH-END`;
  h.mock.script([{ tools: [{ name: "bash", input: { command: search } }] }, { text: "done" }]);
  const r2 = await pi.prompt("Look for the other skills on disk.");

  h.mock.script([
    { tools: unserved.flatMap((u) => [{ name: "served_skill", input: { name: u.name } }, { name: "served_skill", input: { name: u.id } }]) },
    { text: "done" },
  ]);
  const r3 = await pi.prompt("Load the other skills.");
  const exit = await pi.close();

  h.write("result.json", {
    held,
    served,
    state: st,
    unserved,
    turn1: { from: t1from, tools: toolResults(r1.records) },
    search: toolResults(r2.records),
    loads: toolResults(r3.records),
    requests: h.mock.requests.length,
    exit,
  });
}
