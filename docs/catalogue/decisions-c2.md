# Proof 9: decisions needed (round c2)

## State

- **Pushed:** `b295c53`.
- **Judge calibration (your rulings):** judge-8 (sonnet-5-5, adds the F1/F8 clarifications) agrees with judge-4 on outside-skill-folders 107/107 = 100% and on prose-directory 89/91 = 97.8%. judge-9 (haiku-5-5) agrees on skill-folder-only 141/141 = 100%. The judge-7 panel replays judge-4 first, then asks judge-8 or judge-9.
  - The two prose disagreements are both `visual-design.md:70`, "motion resolves in Step 5 from the local rules directory". judge-8 answers true, judge-4 answered false. True is the reading clarification (i) gives.
- **Round-1 tracing of all 10,001 Candidates (7 of 8 shards done):**
  - 6,000+ Traces stored; 1,111+ of them unresolvable.
  - 2,002 Candidates pending, with about 14.6k round-1 questions (shard 1 still running).
  - Later rounds will add fewer.
- **Static flags among the 4,856 resolved Traces checked so far:**

  | Signal | Traces with it |
  | --- | ---: |
  | `fetch-run` | 453 (mostly plain `npx pkg`) |
  | `skill-fetch` | 80 |
  | `secret-egress` | 63 |
  | `injection` | 45 |
  | `persist-write` | 25 |
  | `opaque` | 6 |
  | `invisible-unicode` | 4 |

  Most `injection` hits are legitimate on reading. Examples: security skills quoting "ignore previous instructions", and "do not tell the user X is broken".
- **Exact duplicates** (identical `SKILL.md` blob): 428 groups with 902 members so far, 404 of them across sources. Examples:
  - `openai/plugins/dispatching-parallel-agents` and `obra/superpowers/dispatching-parallel-agents`;
  - `openai/skills/gh-fix-ci` and `firecrawl/openai-skills/gh-fix-ci`.

## Decisions

**E1. Determination prompt `tools/determine/determine-1.md` (attached).** It turns your N4 rulings and the post-proof-1 policy into a prompt. Sonnet-5-5 reads a packet per Candidate, built by `tools/determine/dossier.ts`:
- the Trace and Classification, by path and sha256;
- the Footprint, markers, security hits, companions and files;
- the `SKILL.md` body, up to 30 KB, and the 3 largest own-folder text files plus the 2 largest other text files, 6 KB each;
- no popularity.

Batches are about 25 Candidates per run. Additions beyond the N4 schema, to confirm:
- `everyday: true|false`. A generic daily skill (commit messages, generic review or TDD) may be admitted but never leads (value direction).
- `proficiency: {level: deep|adequate|thin, note}`. These are the proficiency notes the opus occasion run compares.
- Occasion role `pending` for platform skills, until the opus occasion run writes `lead` or `superseded`. Style skills get `alternative` directly.
- `domain`, only when no occasion fits.
- Summary of at most 120 characters, naming the problem and the occasion.

**E2. Which Candidates are flagged for purpose-vs-action (opus-5-5).** I propose any of:
- `sends-credentials`
- `agent-override-text`
- `persistent-writes`
- `opaque-code`
- `unpinned-code` from a pipe to an interpreter, a pip install from a URL, or `go … @latest`

Plain `npx pkg`, `uvx pkg` or `@latest` installs, and `checkout-scripts`, do not flag on their own: they are markers, and the Determination still addresses them. That is about 4% so far (about 200 of 4,856).

Popularity (N5): every Trace is a first Trace, so there is no Revision diff yet and nothing is "nothing new". I propose that every flagged Candidate gets purpose-vs-action review. Popularity only orders the queue (lowest or no value first), and it sets depth later, for Revision diffs. The alternative is that a flagged Candidate with high installs whose only hit is `sends-credentials` stays at static depth.

**E3. Duplicates.** I propose:
- Exact duplicate groups (same `SKILL.md` blob) are decided first. One sonnet-5-5 run per batch of groups picks the canonical copy by upstream origin. It reads each member's provenance evidence: the repository README, plugin manifest, licence, frontmatter `source`/`author`, and "vendored from" notes. The choice and its reasoning are recorded.
- Each non-canonical member's Determination is then `reject` with `rejectFor: duplicate` and `duplicateOf`.
- Near-duplicates (edited copies) are left to the opus occasion comparison. It sees every Candidate for an occasion and may supersede or mark duplicates there.

**E4. Determinations for unresolvable Candidates** (about 1,436). Sonnet-5-5 writes them in large batches with the fixed template in `determine-1.md` (`reject`, `unresolvable`, quoting the Trace's reason). That keeps every Determination model-made, with a model id.
