# Native tool versus MCP

## Result

Keep the primary. MCP reduces unread context but adds a discovery turn and changes other MCP servers' prompt summaries. The fork is not eligible to land under the unchanged invariants.

Runtime for both final measurement sets: `4fb4604ca93e672badc87c279dc6264a60d20b29`. Pi: `a84e3df450d1dee310740143358e624b751322f4`. The fork rebased onto primary `a3c52d9e`. All commits remain local.

## Side-by-side measurements

| Measurement | Native tool | MCP |
|---|---:|---:|
| Proof 4: exact files, Author-only origin | PASS, 1,369 files | PASS, 1,369 files |
| Proof 5: normal shutdown and empty next session | PASS | PASS |
| Proof 6: unserved context/load/search checks | PASS | PASS |
| Proof 7: unread payload bound, real admits | PASS | PASS |
| Request bytes, Slice 0 | 7,891 | 7,891 |
| Request bytes, Slice 1 | 8,844 | 8,177 |
| Request bytes, Slice 10 | 13,717 | 8,177 |
| Request bytes, Slice 50 | 30,376 | 8,177 |
| Fixed unread overhead, bytes | 511 | 286 |
| Correct-only loads, 10 tasks × 3 | 30/30 | 30/30 |
| Discovery model turns | 60 | 90 |
| Discovery input tokens, excluding cached input | 137,932 | 181,130 |
| Discovery output tokens | 5,086 | 7,149 |
| Discovery cache-read tokens | 34,816 | 101,376 |
| Discovery Pi-reported cache-write tokens | 0 | 0 |
| Summed task wall time | 118.746 s | 139.148 s |
| Tool errors during discovery | 0 | 0 |
| Existing summaries changed, 5 other servers | 0 | 0 |
| Existing summaries changed, 15 other servers | 0 | 15 |
| Existing summaries changed, 30 other servers | 0 | 30 |
| Existing entries dropped, 5/15/30 other servers | 0/0/0 | 0/0/0 |
| Cache reads immediately after serve, three repeats | 1,408 / 1,408 / 1,408 | 0 / 1,152 / 1,152 |
| Cache writes immediately after serve | Pi reports 0, upstream unknown | Pi reports 0, upstream unknown |
| game-ui-frontend supporting reference | PASS, 3,712 bytes | PASS, 3,712 bytes |
| amc-run-video-calibration bundled script | PASS, 22,577 bytes | PASS, 22,577 bytes |

The discovery model was `openai-codex/gpt-6-luna` through subscription OAuth, with low thinking. Each task explicitly requested a relevant skill. Each Slice held the target and four distractors. Both channels used the same immutable runtime and matching session settings.

The other-server test reproduces Pi's renderer from source. It does not run 30 live server connections. The script test reads the bundled script without executing it. Cache-write zeros are Pi-normalized values, not evidence that the provider wrote nothing.

## Invariants

> Never hide, replace, or alter the user's native skills, other extensions, or other MCP servers. They stay exactly as Pi provides them.

The MCP channel fails this invariant at 15 and 30 other servers in the measured fixture. The native channel avoids that failure.

Neither channel proves every invariant. Both retain the primary's absolute public-access isolation gap and its SIGKILL cleanup limit. Normal session shutdown passed. The [full assessment](invariants.md) covers every invariant and distinguishes passing checks from unchanged or unverified behavior.

No combination is proposed. A future whole fork can test MCP after Pi provides an independent prompt budget and effective server-name introspection. This fork changes neither Pi nor the frozen set.

## Evidence

- [Proofs 4–7 and supporting files](proofs-channels.md): commands, exact bytes, blob SHAs, isolation, and proof limits.
- [Discoverability and cache](discoverability-cache.md): all ten tasks, per-task latency, turns and tokens, all cache phases, runtime hashes, and reproduction.
- [Other MCP servers](mcp-server-budget.md): full fixture, before/after character and byte counts, and reproducible renderer script.
- [Invariant assessment](invariants.md): all 21 invariants, anti-goals, and remaining collision limits.

Validation also passed 67 extension tests, the frozen pins, package allowlisting, and measurement consistency checks. The package contains 15 allowed files and no Catalogue, Trace, or credential data.
