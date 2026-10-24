// Proof 4, in the sandbox: the user serves the nine Candidates; record what the agent can read.
// args: { ids: string[], probes: Array<[host, port]>, allow: [host, port] }
import type { Harness } from "../drive.ts";
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mcp, emit } from './mcp.ts';
import { toolResults } from "../rpc.ts";
import { requireSeam, serve, state } from "./common.ts";

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

  // The agent loads each Served skill's SKILL.md through its MCP tool.
  const loads: any[] = await mcp(h, pi, `
    const entries = ${JSON.stringify(st.slice.map(e => ({id:e.id,name:e.name,description:e.description})))};
    const out = [];
    for (const e of entries) {
      const found = await searchTools(e.name, {namespace:'pi_sliced', limit:100});
      const t = found.find(t => t.name.includes('__load_' + e.name.replace(/[^A-Za-z0-9_]/g,'_').slice(0,38) + '_') && t.description.startsWith(e.description));
      if (!t) throw new Error('load tool not discovered: '+e.id+' candidates='+JSON.stringify(found));
      const r = await tools[t.name]({});
      out.push({toolName:t.name, args:{name:e.id}, isError:!!r.isError, text:r.content[0].text});
    }
    ${emit('out')}`);
  const supporting = [];
  for (const id of ['openai/plugins/game-ui-frontend','nvidia/skills/amc-run-video-calibration']) {
    const e = st.slice.find(e => e.id === id)!;
    const f = h.walk(e.root).find(f => f.kind === 'file' && (id.startsWith('openai/') ? f.path.endsWith('/frontend-prompts.md') : f.path.endsWith('.py')))!;
    if (!f) throw new Error('supporting file missing: '+id);
    const expected = readFileSync(join(e.root, f.path), 'utf8');
    const text: string = await mcp(h,pi, `
      const found = await searchTools('resource', {namespace:'pi_sliced',limit:100});
      const t = found.find(t => t.name.endsWith('__read_resource'));
      const list = found.find(t => t.name.endsWith('__list_resources'));
      const listed = JSON.parse((await tools[list.name]({})).content[0].text).resources;
      const manifest = listed.find(r=>r.name===${JSON.stringify(e.name+'/_manifest')});
      const entries = JSON.parse((await tools[t.name]({uri:manifest.uri})).content[0].text);
      const uri = entries.files.find(uri=>decodeURIComponent(uri.split('/').at(-1))===${JSON.stringify(f.path)});
      if(!uri)throw new Error('supporting file not in manifest');
      const r = await tools[t.name]({uri});
      ${emit('r.content[0].text')}`);
    supporting.push({id,path:f.path,blob:f.blob,matched:text === expected, bytes:Buffer.byteLength(expected)});
  }

  // Everything readable in the session dir, by path and git blob SHA.
  const files = st.sessionDir ? h.walk(st.sessionDir) : [];
  const exit = await pi.close();
  h.write("result.json", {
    served,
    state: st,
    loads,
    supporting,
    files,
    exit,
    afterExit: st.sessionDir ? h.walk(st.sessionDir, false).length : 0,
  });
}
