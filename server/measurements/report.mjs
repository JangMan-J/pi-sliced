// Render only completed measurements; never substitutes zero for missing trials.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const tasks = read('./tasks.json');
const runs = ['tool', 'mcp'].map(c => read(`./${c}-results.json`));
if (!runs[0].sourceCommit || runs[0].sourceCommit !== runs[1].sourceCommit || JSON.stringify(runs[0].runtimeManifest) !== JSON.stringify(runs[1].runtimeManifest)) throw Error('Runtime snapshot mismatch');
for (const run of runs) {
  if (run.error || !run.finished || run.discoverability.length !== 30 || run.cache.length !== 12) throw Error(`Incomplete ${run.channel}`);
  for (const task of tasks) for (let repeat = 1; repeat <= 3; repeat++) {
    const rows = run.discoverability.filter(r => r.task === task.id && r.repeat === repeat);
    if (rows.length !== 1 || rows[0].served.length !== 5 || new Set(rows[0].served).size !== 5 || !rows[0].served.includes(task.skill) || !rows[0].usage.length) throw Error('Invalid discovery row');
    const peer = runs.find(x => x !== run).discoverability.find(r => r.task === task.id && r.repeat === repeat);
    if (JSON.stringify(peer.served) !== JSON.stringify(rows[0].served)) throw Error('Unpaired trials');
  }
  for (let repeat = 1; repeat <= 3; repeat++) for (const phase of ['initial', 'warm', 'after-serve', 'warm-after-serve']) {
    const row = run.cache.filter(r => r.repeat === repeat && r.phase === phase);
    if (row.length !== 1 || row[0].usage.length !== 1) throw Error('Invalid cache row');
  }
}
const sum = (rows, key) => rows.reduce((n, r) => n + r[key], 0);
const rows = tasks.map(t => `| ${t.id} | ${t.skill} | ${runs.map(r => { const a = r.discoverability.filter(x => x.task === t.id); return `${a.filter(x => x.correct).length}/3 (${a.filter(x => x.onlyCorrect).length}/3)`; }).join(' | ')} |`);
const aggregate = a => { const u = a.flatMap(x => x.usage); return `${u.length} | ${sum(u, 'input')} | ${sum(u, 'output')} | ${sum(u, 'cacheRead')} | ${sum(u, 'cacheWrite')}`; };
const taskUsage = tasks.flatMap(t => runs.map(r => { const rows = r.discoverability.filter(x => x.task === t.id); return `| ${t.id} | ${r.channel} | ${sum(rows, 'durationMs')} | ${aggregate(rows)} |`; }));
const totals = runs.map(r => `| ${r.channel} | ${r.discoverability.filter(x => x.correct).length}/30 | ${r.discoverability.filter(x => x.onlyCorrect).length}/30 | ${sum(r.discoverability, 'toolErrors')} | ${sum(r.discoverability, 'durationMs')} | ${aggregate(r.discoverability)} |`);
const allUsage = runs.map(r => `| ${r.channel} | ${aggregate([...r.discoverability, ...r.cache])} |`);
const cache = runs.flatMap(r => r.cache.map(x => { const u = x.usage[0]; return `| ${r.channel} | ${x.repeat} | ${x.phase} | ${u.input} | ${u.output} | ${u.cacheRead} | ${u.cacheWrite} |`; }));
const hash = p => createHash('sha256').update(readFileSync(new URL(p, import.meta.url))).digest('hex');
const head = runs[0].sourceCommit;
const manifestHash = createHash('sha256').update(JSON.stringify(runs[0].runtimeManifest)).digest('hex');
const text = `# Discoverability and prompt-cache measurement

## Conditions

- Immutable runtime snapshot: \`${head}\` (rebased onto \`upstream/main\` \`8754e649\` as \`16d454460858b9f4a0404896ac3ff951b6fca477\` with identical files), extracted with git archive independently of the mutable checkout. Both result files contain the identical per-file SHA-256 runtime manifest (including tests); its JSON SHA-256 is \`${manifestHash}\`. Pi source: \`a84e3df450d1dee310740143358e624b751322f4\`.
- Both channels: subscription OAuth, \`openai-codex/gpt-6-luna\`, thinking low; Pi RPC, fresh temporary HOME/config/cwd, no persisted session, no discovered extensions/skills/context. Explicit built-in MCP and codemode loaded in both. Read and codemode available; bash/edit/write disabled. No other MCP servers.
- Fork-owned Author server on port 8791, catalogue \`admitted\` (57 current hash-matching admitted Determinations, built by \`server/harness/build-admitted.mjs\`). No primary server used.
- Each task has its correct skill and four distinct distractors: the next four tasks cyclically. Identical serve order in each paired trial, rotated by (task index + repeat index) modulo five. Three fresh sessions per task/channel; channels ran concurrently, trials sequentially within each channel.
- Exact task prompts are in \`server/measurements/tasks.json\`. Each adds: “First consult the most relevant available skill, then give a short plan. Do not implement, run commands, or modify files.” This measures **prompted discovery and loading**, not unsolicited discovery or solution quality.
- Success requires a successful tool result containing a body line of at least 60 characters unique among that session's five SKILL.md bodies. Listing names/descriptions alone do not count. “Only correct” also requires no distractor body observed. No model judge.
- Raw events remain in memory only; sanitized measurement files contain task IDs, served/loaded IDs, tool names, token counts and durations. No credentials or transcripts are retained in the repository.
- Tool run: ${runs[0].started} to ${runs[0].finished}. MCP run: ${runs[1].started} to ${runs[1].finished}.

## Discoverability

Cells show correct / trials (only correct / trials).

| Task | Target skill | Native tool | MCP |
| --- | --- | ---: | ---: |
${rows.join('\n')}

| Channel | Correct | Only correct | Tool errors | Summed task latency (ms) | Model turns | Input | Output | Cache read | Cache write |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${totals.join('\n')}

Per-task token aggregates across three trials. Model turns count completed assistant responses, including responses that call tools; input excludes cached tokens.

| Task | Channel | Summed latency (ms) | Model turns | Input | Output | Cache read | Cache write |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
${taskUsage.join('\n')}

All measured turns, including the cache sequences:

| Channel | Model turns | Input | Output | Cache read | Cache write |
| --- | ---: | ---: | ---: | ---: | ---: |
${allUsage.join('\n')}

## Mid-session serve cache

Three fresh sessions/channel. Start with the FHIR skill served; send “Reply only OK. Do not use tools.” twice (initial, warm). Serve the GitHub Actions skill without ending the session, then send the identical prompt twice (after-serve, warm-after-serve). No skill body is intentionally loaded. Values below come from each assistant message's Pi usage, not estimated prompt sizes. Input excludes cache-read/write tokens.

**Write caveat:** Pi maps absent provider \`cache_write_tokens\` to zero (\`packages/ai/src/api/openai-responses-shared.ts:642–649\` at the Pi commit above). These are Pi-reported writes; actual upstream cache writes are unknown, not proven zero. Cache reads are provider-reported cached input. This is an observational run: provider routing/cache state and cross-session cache reuse were not controlled.

| Channel | Repeat | Phase | Input | Output | Cache read | Cache write (normalized) |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
${cache.join('\n')}

## Interpretation and limits

These trials test whether an explicitly requested skill can be found and loaded among five Served choices. Distractors mostly cross domains; this is not a near-neighbor ambiguity test. A perfect score here does not establish equal performance on unsolicited discovery, longer sessions, or actual task execution. Model turns and latency include planning after the load. Cache samples are too few, and provider cache state too variable, to infer a stable hit-rate advantage. Actual upstream cache-write counts remain unknown because only Pi's normalized usage was available.

## Reproduce and verify

Set \`PI_SLICED_SOURCE_COMMIT\` to the immutable runtime commit above, \`PI_SLICED_PI_CLI\` to the installed Pi CLI JavaScript path and \`PI_SLICED_SERVER\` to the fork-owned HTTPS endpoint on port 8791. The runner requires a subscription OAuth entry in the current Pi auth file; it copies only that entry into temporary config and removes it on normal completion.

\`node server/measurements/discoverability-cache.ts tool\`

\`node server/measurements/discoverability-cache.ts mcp\`

\`node server/measurements/report.mjs\`

The report command rejects missing trials, unpaired distractor orders, incomplete cache phases and provider failures. Initial discarded smoke runs exposed an overly restrictive tool allowlist; the final runs use additive codemode selection so native served_skill remains callable. Smoke results are not included. The first full run (04:29:58–04:33:27Z) was also discarded because runtime files changed during it. Only the later immutable-snapshot rerun is reported.

Sanitized evidence SHA-256:

- tool-results.json: \`${hash('./tool-results.json')}\`
- mcp-results.json: \`${hash('./mcp-results.json')}\`
- tasks.json: \`${hash('./tasks.json')}\`
`;
writeFileSync(new URL('../../docs/measurements/discoverability-cache.md', import.meta.url), text);
console.log('PASS: 60 paired discovery trials and 24 cache turns validated; report rendered');
