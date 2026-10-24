// Proof 6, in the sandbox: a session holding Skills.sh search results and a Slice of one skill.
// Turn 1: the agent uses the Served skill. Turn 2: it searches HOME and the temp dirs for every
// unserved skill by id and by name. Turn 3: it tries to load every unserved skill by name and by id.
// args: { serve: string, term: string, catalogue: Array<{ id, name }> }
import type { Harness } from "../drive.ts";
import { mcp, emit } from './mcp.ts';
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
  const text = await mcp(h,pi, `const ts=await searchTools('tdd',{namespace:'pi_sliced'}); const t=ts.find(t=>t.name.includes('__load_')); const r=await tools[t.name]({}); ${emit('r.content[0].text')}`);
  const firstTools = [{toolName:'codemode',isError:false,text,args:{}}];

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

  const queries = unserved.flatMap(u=>[u.name,u.id]);
  const observations = await mcp(h,pi, `const queries=${JSON.stringify(queries)}; const out=[];
    for(const q of queries) {
      const ts=await searchTools(q,{namespace:'pi_sliced',limit:100});
      const exact=ts.filter(t=>t.name.includes('__load_'+q.replace(/[^A-Za-z0-9_]/g,'_').slice(0,38)+'_') || t.description.includes(q));
      let error=false; try { await tools['mcp__pi_sliced__load_'+q.replace(/[^A-Za-z0-9_]/g,'_')]({}); } catch {error=true;}
      out.push({matches:exact.length,rejected:error});
    } ${emit('out')}`);
  const loads = observations.map((o:any,i:number)=>({args:{name:queries[i]},text:o.matches===0&&o.rejected?'unavailable':JSON.stringify(o)}));
  const exit = await pi.close();

  h.write("result.json", {
    held,
    served,
    state: st,
    unserved,
    turn1: { from: t1from, tools: firstTools },
    search: toolResults(r2.records),
    loads,
    requests: h.mock.requests.length,
    exit,
  });
}
