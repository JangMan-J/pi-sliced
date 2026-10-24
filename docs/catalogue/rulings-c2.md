# Rulings c2 (Jang via executive, 2026-10-24), answering `decisions-c2.md`

- **E1.** `determine-1` is confirmed, with the added fields `everyday`, `proficiency`, role `pending` and `domain`, and a summary of at most 120 characters. Three prompt edits come before any run:
  - The summary never starts with "Use this when…" and never addresses the agent. It is written for a person browsing.
  - `thin` proficiency is admitted, never rejected for being thin. A thin skill never leads an occasion, and the opus occasion run supersedes it wherever a deeper platform skill exists.
  - `set` lists the companions that resolve. If a companion is unresolvable, the reason says so.
- **E2.** Every flagged Candidate gets the opus purpose-vs-action review, with one exception.
  - **The exception:** a Candidate whose only hits are `sends-credentials`, or `sends-credentials` plus plain-runner `unpinned-code`, and whose dated popularity fact is in the top decile of Candidates that have one, stays at static depth.
  - **What the exception still requires:** the Determination still addresses each hit. It records the popularity band in `triage` as the reason for the depth, never in the decision's `reason`.
  - **What it never covers:** `agent-override-text`, `persistent-writes`, `opaque-code`, and pipe-to-interpreter, URL-install or `go @latest` always get full review.
  - **Order:** popularity orders the queue, obscure first.
- **E3.** Duplicates are decided this way:
  - **Grouping:** Candidates are grouped by `SKILL.md` blob.
  - **Exact duplicates:** members whose whole traced file set matches by blob. Own-folder files are compared by path relative to the skill's own folder; all other files by blob alone.
  - **Near-duplicates:** members that share `SKILL.md` but differ elsewhere. They go to the same sonnet run with the differing files listed, or to the opus occasion comparison.
  - **The canonical copy:** upstream origin wins. The exception is an upstream copy that is missing files the vendored copy has, or that is unresolvable; then the complete copy is canonical, and the reason says why.
  - **`duplicateOf`:** it must point at a Candidate whose record in force admits it. If the canonical copy is later rejected for another reason, its duplicates are re-decided.
  - **Plugin sets:** a vendored copy that is part of a plugin's companion set stays reachable through that plugin's Traces, so rejecting it as a listing does not break the plugin's served set.
- **E4.** Determinations for unresolvable Candidates are human-authored, not a model run.
  - **Author:** `{kind: "human", id: "Jang (via executive)"}`.
  - **Decision:** the template.
  - **Reason:** "Rejected unresolvable under ruling c2 E4: <the Trace's reason quoted>".
  - **How:** a script writes one record per Candidate, applying the ruling. The same author and wording apply to any later Candidate whose Trace is unresolvable.
- **Order of work:** judge rounds, then duplicates, then Determinations, then the opus occasion runs. The occasion-map extension batch goes to Jang when it is ready.

## Addendum (executive, 2026-10-24)

- Summaries avoid "install" and "download". They are pi-sliced's own text, so `determine-1` says so. Author text shown verbatim (skill bodies, file names) is exempt; see runtime's glossary entry "Author text".
- `scripts/check` must pass in the working tree at all times. In-progress Traces are therefore staged outside tracked paths (`.pad/catalogue/staging/`), and `tools/catalogue/publish.ts` moves them into `traces/` together with their Classifications.
