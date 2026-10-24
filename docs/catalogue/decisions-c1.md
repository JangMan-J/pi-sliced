# Proof 2 and proof 9: decisions needed (round c1)

Committed so far: `2535d14` (not pushed; proof 2 is not landed until these decisions are made).

- **Tracer `trace-3`** writes format `pi-sliced.trace/2` (`docs/contracts/trace.md`).
  - Evidence is by reference: `[fileIndex, line]` instead of line text.
  - Each file records the first edge it was reached by.
  - New `regions` and `signals` fields.
  - The zoom Trace drops from 609 KB to 131 KB. `scripts/check-trace` still passes against the nine fixtures (stored `trace-3+judge-4.json` beside the `trace-2` files).
- **Classifier `classify-1`** (`docs/contracts/classification.md`), the Determination store (`docs/contracts/determination.md`), and `scripts/rederive`.
  - `unshare -rn scripts/rederive` → `PASS rederive: every Classification re-derives byte-identical from the stored Traces` (9 of 9).
  - Tests: an edited Determination is detected, a tampered Classification fails the check, and a new Trace version flags the Determination.

## The nine, classified

| Candidate | Heavy | Markers | Listing-row Footprint |
| --- | --- | --- | --- |
| canvas-design | yes | — | 83 files, 5.3 MiB · 54 fonts |
| figma-generate-diagram | yes | runs-commands installs-packages credentials mcp-server chain-loads unpinned-code | 64 files, 1.2 MiB · +5 other skills · MCP figma · CLI figma · packages @figma/code-connect · 1 key |
| hyperframes-core | yes | runs-commands installs-packages network credentials chain-loads checkout-scripts unpinned-code sends-credentials | 405 files, 5.2 MiB · +12 other skills · +package (repo root) · +package packages/cli · +package packages/shader-transitions · 6 fonts, 19 media · CLI auto-editor, chrome-headless-shell +16 · packages @hyperframes/core +24 · 10 keys · 18 hosts |
| tdd | no | — | 3 files, 7.2 KiB |
| amc-run-video-calibration | yes | runs-commands installs-packages network credentials chain-loads | 7 files, 122 KiB · +3 other skills · CLI docker, hf +3 · packages huggingface_hub +4 · 2 keys · 2 hosts |
| debug-zoom-integration | yes | runs-commands installs-packages network credentials chain-loads stub unpinned-code sends-credentials | 646 files, 2.9 MiB · +44 other skills · CLI MSBuild.exe, adb +26 · packages @openapitools/openapi-generator-cli +85 · 38 keys · 12 hosts |
| game-ui-frontend | no | chain-loads | 17 files, 37 KiB · +2 other skills · +14 repo files |
| shadcn | yes | runs-commands installs-packages unpinned-code | 16 files, 136 KiB · CLI shadcn, tsc · packages @fontsource-variable/cormorant-garamond +3 |
| shopify | yes | runs-commands installs-packages network credentials unpinned-code opaque-code | 128 files, 7.2 MiB · CLI @shopify/hydrogen, gemini +2 · packages @shopify/cli +4 · 1 key · 4 hosts |

## Proof 2 decisions

**C1. Marker set and definitions.** The definitions are in the table in `docs/contracts/classification.md`. There are 13 markers. Two of them are my additions, so that security hits show as markers:
- `sends-credentials`: a secret-shaped variable and a non-loopback host on one command line;
- `agent-override-text`: override or hide-from-user phrases, or invisible or bidirectional Unicode.

One point needs a decision. `unpinned-code` fires on every `npx <pkg>` with no version, on `@latest`, on `curl … | sh`, and on `pip install git+…`. That makes it common: shadcn (`npx shadcn@latest`), figma and hyperframes all get it.
- Recommendation: keep it as defined, for transparency.
- Alternative: only `curl|sh`, `@latest` and URL installs.

**C2. Stub.** A stub has an own folder of at most 4 KiB, and either at least 4× its bytes outside that folder, or a lone `SKILL.md` that wraps a CLI or an MCP server. Of the nine, only debug-zoom-integration qualifies (905 B own folder, 2.9 MiB elsewhere).

**C3. Static security patterns.** These are the signal kinds and patterns in `docs/contracts/trace.md` and `tools/trace/signals.ts`:
- `fetch-run`: pipe to an interpreter; `npx`/`bunx`/`uvx`/`dlx` with no version or `@latest`; `pip install git+` or URL; `go … @latest`.
- `skill-fetch`: `skills add` / `install` / `update`.
- `persist-write`: a write verb or redirect whose target is a skill folder (`.claude`, `.agents`, `.codex`, `.cursor`, `.gemini`, `.pi`), a shell rc file, an autostart location or `~/.ssh`. Also `crontab`, `systemctl enable`, `launchctl load`, `schtasks /create`, and `skills add -g`.
- `secret-egress`.
- `injection`: phrase list.
- `invisible-unicode`: zero-width joiners inside emoji are skipped.
- `opaque`: executable magic numbers or extensions; minified scripts (a line of at least 2,000 characters that is under 10% whitespace); encoded runs (base64 or hex, at least 2,000 characters).

Note that `secret-egress` also fires on ordinary authenticated API calls, such as zoom's token calls to `api.zoom.us`. It marks the action for purpose-vs-action review; it is not a verdict.

**C4. Companions.** The glossary says a Classification comes "from its Trace alone". So forward edges stay in the Classification (named skills and pulled skill folders). Reverse edges go in `classifications/companions.json`, rebuilt by rederive from every current Trace. Confirm this placement.

**C5. Listing-row Footprint line.** The format is in the table above: `N files, size` · `+other skills / packages / repo files` · `assets` · `MCP · CLI · packages · keys · hosts`. Lists show 2 items, then "+n". Runtime can render from the structured `footprint` field instead.

**C6. Glossary `## Language` entries I propose.**
- **Marker:** a fixed label a Classification gives a skill, from its Trace, and the Picker shows as a glyph.
- **Signal:** a fact in a Trace about what a pulled-in file's text does.
- **Occasion:** a problem a user meets now and then, from `catalogue/occasions.tsv`; a Determination places a Catalogue skill under its occasions.
- **Companion:** a skill that another skill names or pulls in.

I write the entries after you confirm them.

**C7. `scripts/check`.** I would add two lines:
- `scripts/check-trace` (proof 1, about 5 minutes, using the clone cache);
- `unshare -rn scripts/rederive` (proof 2, when it lands).

## Proof 9 status and decisions

- **Candidates.** `catalogue/candidates.jsonl` holds 10,001 ids from `curation.sqlite` (sha256 `3a13f182…`). Only the id and the archive's path, Revision and drift hints are kept, with no scores (per your note 3).
- **Sources.** `catalogue/sources.jsonl` has 564 sources:
  - 129 pinned at the archive Revision; 60 of those also record the remote HEAD, for Candidates the archive Revision lacks;
  - 435 pinned at the remote HEAD (2026-10-24);
  - 33 unresolvable (repository not found).
- **Resolution.** `catalogue/resolved.jsonl`: 8,565 resolved and 1,436 unresolvable. Resolved, by how:

  | How resolved | Candidates |
  | --- | ---: |
  | archive path | 5,557 |
  | folder name | 2,580 |
  | frontmatter name | 175 |
  | folder name, first of several (alternatives recorded) | 253 |

**N1. Unresolvable.** 219 Candidates sit in the 33 dead repositories. The other 1,217 are named skills that are not at the pinned Revision or at HEAD. Examples:
- 40 of the `prisma/cursor-plugin` skills: the repository now holds 2;
- 187 in `nvidia/skills`;
- 63 in `flutter/skills`;
- 51 in `anthropics/knowledge-work-plugins`.

I record them as unresolvable and do not search history for older Revisions, which would list stale content. Confirm.

**N2. Name resolution rule.** The rule is in the header of `tools/catalogue/resolve.ts`. Where several folders share a name, it prefers a matching frontmatter name, then the shallowest path, and records the alternatives. Confirm.

**N3. Judge volume.**
- **Sample:** every 33rd Candidate, 304 in all. 223 were stored at once (39 of them unresolvable). 81 are pending, with 943 round-1 questions: 496 outside-skill-folders, 346 skill-folder-only, 102 prose-directory.
- **Estimate for all 10,001:** about 25–35k questions over several rounds. With `anthropic/claude-sonnet-5-5` at about 100 questions per run, that is about 300 runs.
- **Option:** `skill-folder-only` (346 of 943) is now only a user-project collision check, so it could go to a cheaper subscription model.
- **Decision needed:** the model and batch size.

**N4. Determination schema and author.** Proposed `decision` object:
```
{ "verdict": "admit" | "reject",
  "rejectFor"?: "malicious" | "hidden" | "unrelated" | "unresolvable" | "broken" | "fragment" | "duplicate",
  "duplicateOf"?: "<candidate id: the canonical copy by upstream origin>",
  "kind": "platform" | "style",
  "occasions": [{ "id": "<occ_id>", "role": "lead" | "alternative" | "superseded", "supersededBy"?: "<id>" }],
  "summary": "<one line: the problem it solves and the occasion it fits>",
  "set"?: ["<companion ids offered together>"],
  "triage": { "depth": "static" | "purpose-action" | "exercise", "addressed": ["<each security hit and why it is or is not a problem>"] } }
```
Decisions needed:
- **Model:** which model writes Determinations, and which one does the purpose-vs-action reading.
- **Skills fitting none of the 156 occasions:** admit them under the nearest domain without an occasion, or extend the map through you?
- **Platform "lead" choice:** one model decides per occasion after reading the Classifications of every Candidate for that occasion?

**N5. Popularity as scrutiny depth only.**
- The archive has skills.sh install counts for 6,372 skills, hydrated between 2026-02-02 and 2026-10-21.
- Proposal: store them as a dated Candidate fact in `catalogue/facts/popularity.jsonl` (source: skills.sh via the archive; as-of: the pack's `hydrated_at`). They are used only to set triage depth.
- Alternative: refresh them now from skills.sh through the proxy.

**N6. Repository weight (measured).**
- **Sample:** 223 new `/2` Traces plus the nine come to 884 KB raw; in a fresh repo after `git gc --aggressive`, the pack is 241 KB.
- **Estimate for all 10,001:**

  | Data | Raw | Packed |
  | --- | ---: | ---: |
  | Traces | about 25 MB | about 7 MB |
  | Classifications | about 20 MB | — |
  | Determinations | about 10 MB | — |
  | Total | — | about 15–20 MB |

**N7. Contract change for runtime.** The Trace format is now `pi-sliced.trace/2` (`docs/contracts/trace.md`). The served set is `files[].path` and `files[].blob` at `revision`, unchanged in meaning. Evidence lines are now `[fileIndex, line]`. Please pass it on.
