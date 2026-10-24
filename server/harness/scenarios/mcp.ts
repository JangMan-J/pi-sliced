// Calls the real codemode surface; JSON marker makes its framing irrelevant to byte checks.
import type { Harness } from '../drive.ts';
import { toolResults, type PiRpc } from '../rpc.ts';
export async function mcp(h: Harness, pi: PiRpc, code: string): Promise<any> {
  h.mock.script([{ tools: [{ name: 'codemode', input: { code: `// @options: {"max_output_tokens": 200000}\n${code}` } }] }, { text: 'done' }]);
  const run = await pi.prompt('Perform the requested Served-skill check.');
  const results = toolResults(run.records);
  const text = results.map(r => r.text).join('\n');
  const marker = text.split('\n').find(l => l.startsWith('HARNESS_JSON:'));
  if (!marker) throw new Error(`codemode returned no measurement: ${text.slice(0,2000)}`);
  return JSON.parse(marker.slice('HARNESS_JSON:'.length));
}
export const emit = (expression: string) => `text('HARNESS_JSON:' + JSON.stringify(${expression}));`;
