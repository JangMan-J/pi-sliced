# Discoverability and prompt-cache measurement

## Conditions

- Immutable runtime snapshot: `4fb4604ca93e672badc87c279dc6264a60d20b29`, extracted with git archive independently of the mutable checkout. Both result files contain the identical per-file SHA-256 runtime manifest (including tests); its JSON SHA-256 is `10004d82d2a2f7a0fabd1d65cc38be3563ca87cd27e43a3cfbff64287aed2c2a`. Pi source: `a84e3df450d1dee310740143358e624b751322f4`.
- Both channels: subscription OAuth, `openai-codex/gpt-6-luna`, thinking low; Pi RPC, fresh temporary HOME/config/cwd, no persisted session, no discovered extensions/skills/context. Explicit built-in MCP and codemode loaded in both. Read and codemode available; bash/edit/write disabled. No other MCP servers.
- Fork-owned Author server on port 8791, catalogue `admitted` (57 current hash-matching admitted Determinations, built by `server/harness/build-admitted.mjs`). No primary server used.
- Each task has its correct skill and four distinct distractors: the next four tasks cyclically. Identical serve order in each paired trial, rotated by (task index + repeat index) modulo five. Three fresh sessions per task/channel; channels ran concurrently, trials sequentially within each channel.
- Exact task prompts are in `server/measurements/tasks.json`. Each adds: “First consult the most relevant available skill, then give a short plan. Do not implement, run commands, or modify files.” This measures **prompted discovery and loading**, not unsolicited discovery or solution quality.
- Success requires a successful tool result containing a body line of at least 60 characters unique among that session's five SKILL.md bodies. Listing names/descriptions alone do not count. “Only correct” also requires no distractor body observed. No model judge.
- Raw events remain in memory only; sanitized measurement files contain task IDs, served/loaded IDs, tool names, token counts and durations. No credentials or transcripts are retained in the repository.
- Tool run: 2026-10-24T04:35:22.314Z to 2026-10-24T04:38:04.434Z. MCP run: 2026-10-24T04:35:22.298Z to 2026-10-24T04:38:33.494Z.

## Discoverability

Cells show correct / trials (only correct / trials).

| Task | Target skill | Native tool | MCP |
| --- | --- | ---: | ---: |
| fhir | anthropics/healthcare/fhir-developer-skill | 3/3 (3/3) | 3/3 (3/3) |
| compliance | anthropics/knowledge-work-plugins/compliance-tracking | 3/3 (3/3) | 3/3 (3/3) |
| charts | anthropics/knowledge-work-plugins/data-visualization | 3/3 (3/3) | 3/3 (3/3) |
| docx | anthropics/skills/docx | 3/3 (3/3) | 3/3 (3/3) |
| xlsx | anthropics/skills/xlsx | 3/3 (3/3) | 3/3 (3/3) |
| otel | dash0hq/agent-skills/otel-instrumentation | 3/3 (3/3) | 3/3 (3/3) |
| speech | deepgram/skills/speech-to-text | 3/3 (3/3) | 3/3 (3/3) |
| ci | openhands/extensions/github-actions | 3/3 (3/3) | 3/3 (3/3) |
| mongo | mongodb/agent-skills/mongodb-schema-design | 3/3 (3/3) | 3/3 (3/3) |
| python | wshobson/agents/python-performance-optimization | 3/3 (3/3) | 3/3 (3/3) |

| Channel | Correct | Only correct | Tool errors | Summed task latency (ms) | Model turns | Input | Output | Cache read | Cache write |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tool | 30/30 | 30/30 | 0 | 118746 | 60 | 137932 | 5086 | 34816 | 0 |
| mcp | 30/30 | 30/30 | 0 | 139148 | 90 | 181130 | 7149 | 101376 | 0 |

Per-task token aggregates across three trials. Model turns count completed assistant responses, including responses that call tools; input excludes cached tokens.

| Task | Channel | Summed latency (ms) | Model turns | Input | Output | Cache read | Cache write |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| fhir | tool | 11098 | 6 | 14092 | 606 | 5376 | 0 |
| fhir | mcp | 14352 | 9 | 18135 | 716 | 10368 | 0 |
| compliance | tool | 13446 | 6 | 10933 | 902 | 1792 | 0 |
| compliance | mcp | 17425 | 9 | 14927 | 1094 | 8960 | 0 |
| charts | tool | 10760 | 6 | 15311 | 442 | 5376 | 0 |
| charts | mcp | 12293 | 9 | 21757 | 578 | 9344 | 0 |
| docx | tool | 14787 | 6 | 13833 | 286 | 3584 | 0 |
| docx | mcp | 12371 | 9 | 16125 | 562 | 12544 | 0 |
| xlsx | tool | 8798 | 6 | 12779 | 357 | 5376 | 0 |
| xlsx | mcp | 13496 | 9 | 20045 | 634 | 9344 | 0 |
| otel | tool | 10927 | 6 | 13488 | 488 | 1664 | 0 |
| otel | mcp | 12790 | 9 | 18653 | 753 | 8320 | 0 |
| speech | tool | 15018 | 6 | 22816 | 457 | 1664 | 0 |
| speech | mcp | 13505 | 9 | 25546 | 705 | 8576 | 0 |
| ci | tool | 10407 | 6 | 10376 | 391 | 1664 | 0 |
| ci | mcp | 14045 | 9 | 10980 | 649 | 11520 | 0 |
| mongo | tool | 12250 | 6 | 15987 | 607 | 3328 | 0 |
| mongo | mcp | 16108 | 9 | 19005 | 818 | 12288 | 0 |
| python | tool | 11255 | 6 | 8317 | 550 | 4992 | 0 |
| python | mcp | 12763 | 9 | 15957 | 640 | 10112 | 0 |

All measured turns, including the cache sequences:

| Channel | Model turns | Input | Output | Cache read | Cache write |
| --- | ---: | ---: | ---: | ---: | ---: |
| tool | 72 | 144788 | 5146 | 46592 | 0 |
| mcp | 102 | 187038 | 7209 | 110848 | 0 |

## Mid-session serve cache

Three fresh sessions/channel. Start with the FHIR skill served; send “Reply only OK. Do not use tools.” twice (initial, warm). Serve the GitHub Actions skill without ending the session, then send the identical prompt twice (after-serve, warm-after-serve). No skill body is intentionally loaded. Values below come from each assistant message's Pi usage, not estimated prompt sizes. Input excludes cache-read/write tokens.

**Write caveat:** Pi maps absent provider `cache_write_tokens` to zero (`packages/ai/src/api/openai-responses-shared.ts:642–649` at the Pi commit above). These are Pi-reported writes; actual upstream cache writes are unknown, not proven zero. Cache reads are provider-reported cached input. This is an observational run: provider routing/cache state and cross-session cache reuse were not controlled.

| Channel | Repeat | Phase | Input | Output | Cache read | Cache write (normalized) |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| tool | 1 | initial | 1415 | 5 | 0 | 0 |
| tool | 1 | warm | 155 | 5 | 1280 | 0 |
| tool | 1 | after-serve | 265 | 5 | 1408 | 0 |
| tool | 1 | warm-after-serve | 29 | 5 | 1664 | 0 |
| tool | 2 | initial | 1413 | 5 | 0 | 0 |
| tool | 2 | warm | 153 | 5 | 1280 | 0 |
| tool | 2 | after-serve | 263 | 5 | 1408 | 0 |
| tool | 2 | warm-after-serve | 27 | 5 | 1664 | 0 |
| tool | 3 | initial | 1413 | 5 | 0 | 0 |
| tool | 3 | warm | 1433 | 5 | 0 | 0 |
| tool | 3 | after-serve | 263 | 5 | 1408 | 0 |
| tool | 3 | warm-after-serve | 27 | 5 | 1664 | 0 |
| mcp | 1 | initial | 1251 | 5 | 0 | 0 |
| mcp | 1 | warm | 119 | 5 | 1152 | 0 |
| mcp | 1 | after-serve | 1291 | 5 | 0 | 0 |
| mcp | 1 | warm-after-serve | 159 | 5 | 1152 | 0 |
| mcp | 2 | initial | 1252 | 5 | 0 | 0 |
| mcp | 2 | warm | 120 | 5 | 1152 | 0 |
| mcp | 2 | after-serve | 140 | 5 | 1152 | 0 |
| mcp | 2 | warm-after-serve | 32 | 5 | 1280 | 0 |
| mcp | 3 | initial | 1252 | 5 | 0 | 0 |
| mcp | 3 | warm | 120 | 5 | 1152 | 0 |
| mcp | 3 | after-serve | 140 | 5 | 1152 | 0 |
| mcp | 3 | warm-after-serve | 32 | 5 | 1280 | 0 |

## Interpretation and limits

These trials test whether an explicitly requested skill can be found and loaded among five Served choices. Distractors mostly cross domains; this is not a near-neighbor ambiguity test. A perfect score here does not establish equal performance on unsolicited discovery, longer sessions, or actual task execution. Model turns and latency include planning after the load. Cache samples are too few, and provider cache state too variable, to infer a stable hit-rate advantage. Actual upstream cache-write counts remain unknown because only Pi's normalized usage was available.

## Reproduce and verify

Set `PI_SLICED_SOURCE_COMMIT` to the immutable runtime commit above, `PI_SLICED_PI_CLI` to the installed Pi CLI JavaScript path and `PI_SLICED_SERVER` to the fork-owned HTTPS endpoint on port 8791. The runner requires a subscription OAuth entry in the current Pi auth file; it copies only that entry into temporary config and removes it on normal completion.

`node server/measurements/discoverability-cache.ts tool`

`node server/measurements/discoverability-cache.ts mcp`

`node server/measurements/report.mjs`

The report command rejects missing trials, unpaired distractor orders, incomplete cache phases and provider failures. Initial discarded smoke runs exposed an overly restrictive tool allowlist; the final runs use additive codemode selection so native served_skill remains callable. Smoke results are not included. The first full run (04:29:58–04:33:27Z) was also discarded because runtime files changed during it. Only the later immutable-snapshot rerun is reported.

Sanitized evidence SHA-256:

- tool-results.json: `04637bc0fca506c17f5dcb008edeb5d273ceb2d1ebd489b4f93115107589e68e`
- mcp-results.json: `7d12c6b3a20c3bfdc7405f2a854536e671e219e6e15ccfa613350489f0537ccb`
- tasks.json: `ff6ca2c5dafa2b541b966abc60868789bce581d53bf15c5e8e64c242f25a5f81`
