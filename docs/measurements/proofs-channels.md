# Serving-channel proofs 4–7

Final single-channel MCP rerun completed 2026-10-24T07:18:58Z against the Author's server on `185.8.106.248:8790` after removing the native `served_skill` tool, `served_skills` section, `surface.ts`, and `PI_SLICED_CHANNEL` switch (prior A/B comparison rerun completed 2026-10-24T07:07:01Z against `185.8.106.248:8791` at runtime commit `16d454460858b9f4a0404896ac3ff951b6fca477`). These are deterministic RPC/model-wire checks, not model-discoverability evaluations. They use the installed Pi, empty HOME, staged extension, mock Anthropic transport, and `--tools +codemode`. The mock transport uses no model subscription or paid API.

The fork-owned Author server is reached at its public IPv4 address on port **8791**, with the committed certificate as its only CA. Port 8790 is untouched. A private store is built for this experiment; no primary store data is modified. Filesystem isolation hides the repository, Author store and credentials. Proofs 4, 5 and 7 additionally use pasta/nft network isolation. Proof 6 needs host networking for the existing Skills.sh proxy.

## Results

| Check | `tool` | `mcp` |
|---|---|---|
| 4: nine Candidates, exact traced files, Author-only origin | PASS | PASS |
| 5: normal session exit removes files; next session empty | PASS | PASS |
| 6: captured unserved identifiers/descriptions; load/search probes | PASS | PASS |
| 7: unread payload cost, genuinely admitted Candidates | PASS | PASS |

All eight checks exited **0** against that stable revision, including the collision/rollback and resource-manifest fixes. MCP resource reads followed the discovered `skill-manifest://` URIs. No external condition blocked these deterministic checks.

Exact final verdict summaries, identical between channels except the cost output filename:

- `PASS check-serve (proof 4): 9 Candidates served from 185.8.106.248:8790, 1369 traced files compared by blob SHA`
- `PASS check-lifetimes (proof 5): after session 1 nothing served remains in HOME or /tmp, /var/tmp, /dev/shm; session 2 starts with an empty Slice and cannot load or read A or B`
- `PASS check-slice (proof 6): no payload carries an unserved skill's id or description; loads and searches for them return nothing`
- `PASS check-cost (proof 7): payload sizes for Slices of 0, 1, 10, 50 written to server/harness/out/cost.json`

### Proof 4 and supporting files

Both channels materialized **1,369 files** across the nine required Candidates, matching repository-relative paths and git blob SHAs. All nine SKILL.md load results also matched their traced blob, excluding the explicit licence/header framing. Packet capture recorded nine TCP connections, all to the Author address on 8791, no UDP flows, and 24,197,707 received bytes for tool / 24,197,706 for MCP. Captures held 4,669 / 4,671 frames respectively. The distinct traced bytes total 22,792,405. Third-party connection probes were rejected.

The MCP harness discovers actual load tool names through `searchTools`, calls those names through codemode, and checks the first returned text block. `.mcp-state.json` is explicitly accounted for as transport metadata outside the skill roots; exact file equality is still enforced within every skill root. It contains only Served-entry data.

Two additional reads returned byte-identical content:

| Candidate | Repository-relative file | Bytes | Git blob SHA |
|---|---|---:|---|
| `openai/plugins/game-ui-frontend` | `plugins/game-studio/references/frontend-prompts.md` | 3,712 | `86d46e2de9fcbb5d85cbc7a59d09429072002449` |
| `nvidia/skills/amc-run-video-calibration` | `skills/amc-run-rtsp-calibration/scripts/run_rtsp_calibration.py` | 22,577 | `b91a18207160d9cf8bb30054e93c0246945ab140` |

The MCP resource test discovers the manifest URI from `list_resources`, reads that manifest, then follows its listed file URI. The script is **read, not executed**: this verifies availability of a bundled script, not successful calibration or installation of its Outside requirements. The native channel uses Pi's `read` tool on the same files.

### Proof 5

Session 1 serves `mattpocock/skills/tdd` and `openai/plugins/game-ui-frontend`, loads their instructions and reads a supporting file from each. After normal exit, HOME and `/tmp`, `/var/tmp`, `/dev/shm`, and working-directory snapshots contain no served content, apart from Pi session records and compiled package code excluded by the existing check. Session 2 starts empty, old file reads fail, and old loads fail. MCP additionally checks that namespace discovery returns no tools and attempts both exact previously discovered load names.

This measures normal shutdown, not SIGKILL cleanup. It does not run author scripts or test persistence caused by an agent executing them.

### Proof 6

Slice: only `mattpocock/skills/tdd`. The Picker check seam holds 50 live Skills.sh search items for `canvas`, plus eight unserved check-nine Catalogue Candidates. Six model requests were scanned against 115 identifier/description needles; no exposure was found. One live item lacked a frontmatter description, so only its identifier was checked. Disk search for the 58 unserved names/identifiers returned nothing; the positive control found the Served folder. All 116 name/id load probes were unavailable. MCP also searches the namespace and checks absent-load rejection.

Scope limitation inherited from this harness: it excludes the test model's own injected tool calls and native unknown-name error echoes from the exposure scan. It tests known Catalogue/held live items and automatic/context/tool/disk exposure, not every public skill, arbitrary Internet lookup, or adversarial access to public Author endpoints. Thus these passes do not establish the stronger absolute invariant that an agent with unrestricted network can never discover an unserved public skill.

### Proof 7

`server/harness/build-admitted.mjs` reads the last Determination for each Candidate, selects only `admit`, verifies its pinned Trace and Classification hashes and the current Classification, and builds the `admitted` catalogue. There were **57** current admits; the first 50 in sorted Determination-path order were used, with nested prefixes for sizes 1 and 10. No `admitTraced` override or invented skill is used.

| Slice size | Tool payload bytes | Tool delta | MCP payload bytes | MCP delta |
|---:|---:|---:|---:|---:|
| 0 | 7,891 | 0 | 7,891 | 0 |
| 1 | 8,844 | 953 | 8,177 | 286 |
| 10 | 13,717 | 5,826 | 8,177 | 286 |
| 50 | 30,376 | 22,485 | 8,177 | 286 |

Tool fixed overhead is **511 bytes**, independent of Slice size: 354 tool-definition bytes and 157 fixed section bytes. Maximum observed per-skill framing is 106 bytes, below the 128-byte allowance. MCP fixed overhead is **286 bytes**; no names/descriptions are included before discovery, so the whole nonempty delta is fixed. These are serialized wire-request bytes, not tokenizer counts.

At sizes 1/10/50 the body/reference-text probes covered 308/2,250/18,073 distinct lines and found zero. Cost is measured before any skill is read. Mid-session cache behavior and effects on other MCP summaries are separate measurements, not established here. In particular, this cost pass does not override the other-server preservation failure reported in `mcp-server-budget.md`.

## Reproduction and harness changes

1. Copy the existing store into a fork-owned location, set `PI_SLICED_STORE`, and run `node server/harness/build-admitted.mjs`. This writes the `admitted` catalogue and details and prints the pinned determination evidence. Never target the primary store.
2. Start `server/author-server.mjs` from this checkout with that store and `PI_SLICED_SERVER_PORT=8791`.
3. Set `PI_SLICED_SERVER` to that server's public HTTPS address and run, for each `PI_SLICED_CHANNEL=tool` and `mcp`:

   ```sh
   scripts/check-serve
   scripts/check-lifetimes
   scripts/check-slice
   scripts/check-cost
   ```

4. Stop the fork-owned server after all shared measurement users finish.

The sandbox now forwards and validates the channel; both channels explicitly enable codemode for a matched baseline. The cost check defaults to genuinely admitted Candidates and writes channel-specific summaries under ignored `server/harness/out/`. The serve check writes channel-specific summaries too. Infrastructure failures now call `Verdict.abort`: missing catalogues or incomplete scenarios cannot accidentally print PASS. Source edits are limited to `server/harness/`; extension implementation belongs to the other agents. Frozen files remain unchanged (`scripts/check-frozen` passed). `git diff --check` and `node --check server/harness/build-admitted.mjs` also passed. A missing-catalogue negative check exited 1 with `FAIL check-cost (proof 7): measurement did not complete — 1 failure(s)`.

The fork-owned server on 8791 was stopped and its temporary store removed after the checks completed; port 8790 (`pi-sliced-author.service`) was untouched.
