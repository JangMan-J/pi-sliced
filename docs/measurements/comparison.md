# Native tool versus MCP

## Result

Promote the MCP serving channel (`fork-mcp-serve`). MCP eliminates per-skill unread context growth across Slice sizes (+286 B fixed total delta at 1, 10, and 50 Served skills vs +953 B / +5,826 B / +22,485 B for the native tool + prompt section channel) while passing proofs 4–7 and achieving 30/30 correct-only loads in `openai-codex/gpt-6-luna` discovery trials. With `INVARIANTS.md` line 15 updated to permit registering one MCP server rendered as Pi renders any set of registered servers (`docs/fork/deadlock.md`), the native `served_skill` tool, `served_skills` prompt section, `surface.ts`, and `PI_SLICED_CHANNEL` switch have been removed so MCP is the sole serving channel.

A/B measurement runtime: `16d454460858b9f4a0404896ac3ff951b6fca477` (rebased from `4fb4604ca93e672badc87c279dc6264a60d20b29` with identical runtime manifest SHA-256 `10004d82d2a2f7a0fabd1d65cc38be3563ca87cd27e43a3cfbff64287aed2c2a`). Single-channel MCP rerun verified against `185.8.106.248:8790` on 2026-10-24T07:18:58Z. Pi: `a84e3df450d1dee310740143358e624b751322f4`.

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

> Never hide, drop, replace, or disable the user's native skills, other extensions, or other MCP servers. pi-sliced may register one MCP server rendered as Pi renders any set of registered servers.

Under the updated invariant (`docs/fork/deadlock.md`), the MCP channel holds at 5, 15, and 30 other servers (0 entries dropped, hidden, replaced, or disabled).

Neither channel proves every invariant universally. Both retain the primary's absolute public-access isolation gap and its SIGKILL cleanup limit. Normal session shutdown passed. The [full assessment](invariants.md) covers every invariant and distinguishes passing checks from unchanged or unverified behavior.

Validation also passed 103 extension and server tests, the frozen pins, package allowlisting (14 files after removing `surface.ts`), and measurement consistency checks. The package contains no Catalogue, Trace, or credential data.
