// Live subscription-backed Pi RPC measurement; no transcripts are written.
// Set PI_SLICED_SOURCE_COMMIT, PI_SLICED_PI_CLI and PI_SLICED_SERVER (fork port 8791).
// node server/measurements/discoverability-cache.ts tool|mcp [output.json]
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir, homedir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PiRpc, toolResults } from '../harness/rpc.ts';
import { serve, state } from '../harness/scenarios/common.ts';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const tasks = JSON.parse(readFileSync(new URL('./tasks.json', import.meta.url), 'utf8'));
const channel = process.argv[2];
if (!['tool', 'mcp'].includes(channel)) throw new Error('channel must be tool or mcp');
const server = process.env.PI_SLICED_SERVER;
if (!server || new URL(server).port !== '8791') throw new Error('Explicit fork server on port 8791 required');
const cli = process.env.PI_SLICED_PI_CLI;
if (!cli) throw new Error('PI_SLICED_PI_CLI required');
const output = resolve(process.argv[3] || `server/measurements/${channel}-results.json`);
const authSource = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), '.pi/agent'), 'auth.json');
const auth = JSON.parse(readFileSync(authSource, 'utf8'))['openai-codex'];
if (auth?.type !== 'oauth') throw new Error('Subscription OAuth required');
const sourceRef = process.env.PI_SLICED_SOURCE_COMMIT;
if (!sourceRef) throw new Error('PI_SLICED_SOURCE_COMMIT required: never measure the mutable working tree');
const sourceCommit = execFileSync('git', ['rev-parse', `${sourceRef}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
const snapshot = mkdtempSync(join(tmpdir(), 'pi-sliced-runtime-'));
const archive = execFileSync('git', ['archive', sourceCommit, 'extensions/pi-sliced', 'package.json'], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
execFileSync('tar', ['-xf', '-', '-C', snapshot], { input: archive });
const runtimeManifest = Object.fromEntries(readdirSync(join(snapshot, 'extensions/pi-sliced'), { recursive: true, withFileTypes: true })
  .filter(e => e.isFile()).map(e => join(e.parentPath, e.name)).sort()
  .map(p => [p.slice(snapshot.length + 1), createHash('sha256').update(readFileSync(p)).digest('hex')]));
runtimeManifest['package.json'] = createHash('sha256').update(readFileSync(join(snapshot, 'package.json'))).digest('hex');
const results: any = { sourceCommit, runtimeManifest, channel, provider: 'openai-codex', model: 'gpt-6-luna', thinking: 'low', catalogue: 'admitted', exploratory: false, started: new Date().toISOString(), discoverability: [], cache: [] };
const save = () => writeFileSync(output, JSON.stringify(results, null, 2) + '\n');
let active: PiRpc | undefined;
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { active?.proc.kill('SIGTERM'); process.exitCode = 1; });
async function session(run: (pi: PiRpc) => Promise<void>) {
  const home = mkdtempSync(join(tmpdir(), 'pi-sliced-measure-'));
  const config = join(home, '.pi/agent');
  mkdirSync(config, { recursive: true });
  writeFileSync(join(config, 'auth.json'), JSON.stringify({ 'openai-codex': auth }), { mode: 0o600 });
  const pi = active = new PiRpc({
    argv: [cli!, '--mode', 'rpc', '--no-session', '--provider', 'openai-codex', '--model', 'gpt-6-luna', '--thinking', 'low', '--no-extensions', '--no-skills', '--no-context-files', '--no-prompt-templates', '-e', 'builtin:mcp', '-e', 'builtin:codemode', '-e', join(snapshot, 'extensions/pi-sliced/index.ts'), '--tools', '+codemode', '--exclude-tools', 'bash,edit,write'],
    cwd: home,
    env: { HOME: home, PATH: process.env.PATH!, LANG: 'C.UTF-8', TERM: 'dumb', PI_CODING_AGENT_DIR: config, PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_SLICED_SERVER: server!, PI_SLICED_CATALOGUE: 'admitted', PI_SLICED_CHANNEL: channel, PI_SLICED_CHECK_DRIVER: '1' },
  });
  try {
    const s = await pi.request({ type: 'get_state' });
    if (s.data?.model?.id !== 'gpt-6-luna' || s.data?.model?.provider !== 'openai-codex') throw new Error('Wrong model');
    await pi.request({ type: 'set_auto_retry', enabled: false });
    await run(pi);
  } finally { await pi.close(15000); active = undefined; rmSync(home, { recursive: true, force: true }); }
}
async function choose(pi: PiRpc, ids: string[]) {
  const result = await serve(pi, ids);
  if (result.errors.length || result.served.length !== ids.length) throw new Error('Serving failed: ' + JSON.stringify(result.errors));
  return state(pi);
}
function usages(records: any[]) {
  return records.filter(r => r.type === 'message_end' && r.message.role === 'assistant').map(r => {
    const m = r.message;
    if (m.stopReason === 'error' || m.stopReason === 'aborted') throw new Error('Provider failure: ' + m.errorMessage);
    return { input: m.usage.input, output: m.usage.output, cacheRead: m.usage.cacheRead, cacheWrite: m.usage.cacheWrite, responseModel: m.responseModel ?? null };
  });
}
try {
  const limit = Number(process.env.MEASURE_TASKS || tasks.length);
  const repeats = Number(process.env.MEASURE_REPEATS || 3);
  for (let i = 0; i < limit; i++) for (let repeat = 0; repeat < repeats; repeat++) {
    const task = tasks[i];
    const ids = Array.from({ length: 5 }, (_, k) => tasks[(i + k) % tasks.length].skill);
    for (let k = 0; k < (i + repeat) % 5; k++) ids.push(ids.shift());
    await session(async pi => {
      const st = await choose(pi, ids);
      // Body evidence, not just a name from a list: require a long unique body line in successful tool output.
      const bodies = st.slice.map(e => ({ id: e.id, body: readFileSync(e.skillMdPath, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '') }));
      const started = Date.now();
      const { records } = await pi.prompt(task.prompt + '\nFirst consult the most relevant available skill, then give a short plan. Do not implement, run commands, or modify files.', 180000);
      const calls = toolResults(records);

      const loaded = bodies.filter(e => e.body.split('\n').map(x => x.trim()).filter(x => x.length >= 60 && bodies.every(b => b.id === e.id || !b.body.includes(x))).some(line => calls.some(c => !c.isError && c.text.includes(line)))).map(e => e.id);
      results.discoverability.push({ task: task.id, repeat: repeat + 1, target: task.skill, served: ids, loaded, correct: loaded.includes(task.skill), onlyCorrect: loaded.length === 1 && loaded[0] === task.skill, toolNames: calls.map(c => c.toolName), toolErrors: calls.filter(c => c.isError).length, usage: usages(records), durationMs: Date.now() - started });
      save(); console.log(channel, task.id, repeat + 1, loaded.includes(task.skill) ? 'correct' : 'miss');
    });
  }
  if (!process.env.MEASURE_SKIP_CACHE) for (let repeat = 1; repeat <= 3; repeat++) await session(async pi => {
    await choose(pi, [tasks[0].skill]);
    for (const phase of ['initial', 'warm', 'after-serve', 'warm-after-serve']) {
      if (phase === 'after-serve') await choose(pi, [tasks[7].skill]);
      const { records } = await pi.prompt('Reply only OK. Do not use tools.', 120000);
      const usage = usages(records);
      if (!usage.length) throw new Error('No assistant usage');
      results.cache.push({ repeat, phase, usage }); save();
    }
  });
  results.finished = new Date().toISOString(); save();
} catch (error) { results.error = String(error); save(); throw error; }
finally { rmSync(snapshot, { recursive: true, force: true }); }
