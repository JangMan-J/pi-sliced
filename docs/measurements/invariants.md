# Channel invariant assessment

## Recommendation

Keep the primary. Do not land this fork or combine its MCP surface with the primary.

The MCP channel reduces unread context, but it changes other servers' prompt summaries under Pi's shared section budget. That conflicts with the unchanged frozen set:

> Never hide, replace, or alter the user's native skills, other extensions, or other MCP servers. They stay exactly as Pi provides them.

The source-level reproduction changes every existing summary at 15 and 30 servers. It changes none at five servers and drops none in these fixtures. See [the budget measurement](mcp-server-budget.md). Pi still exposes the underlying tools, but that does not restore their previous prompt descriptions.

Neither channel establishes every invariant. The native channel avoids the new displacement failure. Both retain the primary's unresolved absolute-isolation and forced-termination limits. A passing bounded check does not erase those limits.

## Coverage

Rows follow the invariant order in `INVARIANTS.md`. “Unchanged” means this fork preserves the relevant primary code, not that this experiment proves the invariant universally.

| Invariant | Tool channel | MCP channel | Evidence or limit |
|---|---|---|---|
| 1. No access to unserved skills | Bounded pass, absolute claim open | Bounded pass, absolute claim open | Proof 6 covers context and extension access, not arbitrary public Internet access |
| 2. Unserved skills add no context | Bounded pass | Bounded pass | Proof 6 scans held Catalogue and live search items |
| 3. Preserve native skills, extensions, MCP servers | No new displacement mechanism | FAIL | Other summaries shrink at 15/30 servers |
| 4. No residue, empty later Slice | Normal-exit pass, forced-exit limit | Normal-exit pass, forced-exit limit | Proof 5. SIGKILL bypasses cleanup until a later startup sweep |
| 5. Every listing has a Trace | Unchanged | Unchanged | Catalogue construction remains outside the channel |
| 6. Exact traced files at Revision | Proof 4 pass | Proof 4 pass | Nine Candidates, 1,369 files by blob SHA. Resource edge cases have regression tests |
| 7. Author-only serving origin | Proof 4 pass | Proof 4 pass | Isolated network and packet capture |
| 8. Footprint before choice, Heavy confirm | Unchanged, unit tests pass | Unchanged, unit tests pass | Picker unchanged. Public-package stranger proof not rerun here |
| 9. Untraced disclosure | Unchanged | Unchanged | Picker unchanged, status-line unit tests pass |
| 10. Inspected Revision preserved | Pass in tested paths | Pass in tested paths | Detail materialization and Picker Revision tests |
| 11. Never execute skill scripts | Holds in serving path | Holds in serving path | Both surfaces only read files. Calibration script was read, not executed |
| 12. Never alter skill content/frontmatter | Pass in tested paths | Pass in tested paths | Blob verification, verbatim load body, lossless resource fallback |
| 13. Never overwrite a Trace | Unchanged | Unchanged | No Trace edits |
| 14. Derived records require Trace | Unchanged | Unchanged | No Classification or Determination edits |
| 15. Never drop a Candidate | Unchanged | Unchanged | No Candidate edits |
| 16. No admission by publisher status | Unchanged | Unchanged | No admission-policy edits |
| 17. No rejection by size | Unchanged | Unchanged | No admission-policy edits |
| 18. No popularity rank or display | Unchanged, unit tests pass | Unchanged, unit tests pass | Picker unchanged |
| 19. Uniform Catalogue presentation | Unchanged | Unchanged | Picker and Catalogue construction unchanged |
| 20. No shared user session state | Holds in tested sessions | Holds in tested sessions | Private session directories and independent fresh sessions |
| 21. Source of truth in repo/public sources | Preserved by changes | Preserved by changes | Code, task inputs and sanitized measurements retained. No credentials committed |

The anti-goals remain unchanged. Neither channel adds a package manager, permanent skill storage, aggregation, or authoring. Neither writes to Native skill folders. Measurement files contain counts and identifiers, not session transcripts or raw wire dumps.

## Additional MCP limits

Standard user and trusted-project MCP configurations reserve their normalized names. Extension registrations reserve names too. The channel selects another name on collision and rolls back failed registration.

Pi exposes no public list of effective SDK-injected configuration. Those collisions remain unsupported. Collision tests use API doubles, not live SDK collision sessions. The empty-HOME measurements use the default free name `pi_sliced`.

A future MCP approach needs a Pi surface that does not consume other servers' prompt budget. It also needs effective-configuration introspection. Neither change belongs to this fork's frozen scope. No frozen file changed.
