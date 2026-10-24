---
type: glossary
created: 2026-10-23T22:26:14Z
created_by: claude-opus-5-5
created_session: 01a16ad8-e553-7570-944c-08638df8729d
updated: 2026-10-23T22:26:14Z
updated_by: claude-opus-5-5
updated_session: 01a16ad8-e553-7570-944c-08638df8729d
---

# pi-sliced

The terms of pi-sliced: a Pi package through which a user picks skills from a traced Catalogue and serves them to the agent for one session, without downloading or keeping them.

## kernel

Frozen with KERNEL.md.

**Skill**:
An agent skill: a directory in a source repository whose root holds a `SKILL.md` (frontmatter and body), identified as `<owner>/<repo>/<name>`. The directory is the skill's own folder.
_Example_: `mattpocock/skills/tdd`, whose own folder is `skills/tdd/` in `mattpocock/skills`.
_Not_: a Pi extension or MCP server; a single `SKILL.md` file apart from its folder.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Catalogue**:
The skills pi-sliced lists after its own Trace, Classification, and Determination admitted them. Each is listed at one Revision and served only from the Author's server.
_Example_: `mattpocock/skills/tdd` at Revision `<sha>`, shown in the Picker's Domains branch with its Footprint.
_Not_: the skills.sh registry; Skills.sh branch items; rejected Candidates.
_Avoid_: marketplace, registry, store
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Candidate**:
A skill considered for the Catalogue, from skills.sh or any public git repository, whether admitted, rejected, or not yet determined. A Candidate is never dropped.
_Example_: each of the archive's 10,001 skills; `nvidia/skills/vss-deploy-detection-tracking-2d`, whose path no longer exists upstream, stays a Candidate with an unresolvable Trace.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Revision**:
The git commit SHA of the source repository at which a Trace was taken and at which the traced files are served.
_Example_: `openai/plugins` at `0722921d5542…` for `openai/plugins/game-ui-frontend`.
_Not_: a skills.sh snapshot hash.
_Avoid_: pinned revision, version
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Pull in**:
A skill pulls in a file when its `SKILL.md`, or a file it already pulls in, directs the agent to read, run, or load that file, by link, path, path built from variables, or directory reference, at any depth. A file that is only mentioned and never used is not pulled in.
_Example_: `openai/plugins/game-ui-frontend` pulls in `plugins/game-studio/references/frontend-prompts.md` through `../../references/frontend-prompts.md`.
_Not_: test outputs or a docs catalogue reached only by a directory mention the skill never uses, such as `packages/producer/tests/*/output/compiled.html` for `heygen-com/hyperframes/hyperframes-core`.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Trace**:
The recorded facts about one Candidate at one Revision: every file it pulls in, each with its path, size, git blob SHA, and how it was reached; and its Outside requirements. A Candidate whose source no longer resolves gets a Trace recording that. A Trace is exact in both directions: a missed file and a file not pulled in are both defects.
_Example_: the Trace of `openai/plugins/game-ui-frontend` at `0722921d5542…`, which includes `plugins/game-studio/references/frontend-prompts.md` and the sibling skill file `plugins/game-studio/skills/web-game-foundations/SKILL.md`.
_Not_: a Classification or a Determination; a skills.sh detail response.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Outside requirement**:
Something a skill needs that is not a file in its source repository: a package or SDK to install, an MCP server, a CLI, an API key or other credential, or a network fetch. Disclosed in the Footprint, never served.
_Example_: `shadcn-ui/ui/shadcn` runs the `shadcn` CLI through `npx shadcn@latest`.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Footprint**:
What the user is really choosing, shown before they choose: the total size of the skill's traced files, what it pulls in (files outside its own folder, an SDK, a monorepo package, assets), and its Outside requirements.
_Example_: `anthropics/skills/canvas-design`: 83 files, 5.3 MiB, of which 54 are font files in `canvas-fonts/`.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Heavy**:
A skill whose traced files total more than 1 MiB (1,048,576 bytes), or that has an Outside requirement of the kind package or SDK to install, MCP server, CLI, or API key or credential. Heavy decides only the extra confirm; every Footprint is shown in full.
_Example_: `anthropics/skills/canvas-design` (5.3 MiB of files) is Heavy.
_Not_: a skill whose only weight is files outside its own folder totalling 1 MiB or less, or plain network fetches. Both are disclosed in its Footprint and are not Heavy.
_Check_: from the Trace, total file bytes > 1,048,576, or any Outside requirement of kind package, SDK, MCP server, CLI, or credential.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Classification**:
A description of what a skill pulls in, computed by deterministic code from its Trace alone, with no model and no network, so re-deriving it gives byte-identical output.
_Example_: `openai/plugins/debug-zoom-integration` classified as reaching sibling skills' files.
_Not_: a Determination.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Determination**:
A stored decision about where a Candidate fits in the Catalogue, or that it fits nowhere, with its reason, time, author (model id or human), and the Trace and Classification it read. It may come from a model or a human, and is never silently regenerated; re-deriving replays it and flags it when its inputs changed.
_Example_: a model-made Determination rejecting a Candidate as a thin wrapper of a CLI's `--help` output, with its reason, time, and model id.
_Not_: a Classification; a popularity or install-count ranking.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Served**:
In the session's Slice and available to the agent, for that session only.
_Example_: the user serves `mattpocock/skills/tdd`; it is Served until the session ends and absent from the next session.
_Avoid_: installed, enabled, downloaded
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Slice**:
The skills a session is currently serving to the agent: its Served skills. The user alone chooses it; the agent cannot widen it. A new session starts with an empty Slice.
_Example_: a session in which the user served `mattpocock/skills/tdd` and `shadcn-ui/ui/shadcn` has a Slice of those two skills.
_Not_: a build slice, the bounded unit of development work.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Picker**:
The tree view in Pi where the user browses the Catalogue, in the Domains branch, and the Skills.sh branch, and chooses what is Served.
_Example_: the Picker with its two top-level branches, Domains and Skills.sh, both collapsed.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Inspect**:
The Picker's view of one skill, opened from its row, showing its Footprint, source, and `SKILL.md`.
_Example_: opening Inspect on `anthropics/skills/canvas-design` shows its Footprint, source, and `SKILL.md`.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Domains branch**:
The Picker's top-level branch that holds the Catalogue, grouped by domain.
_Example_: expanding the Domains branch shows the Catalogue's skills under their domains, each row with its Footprint.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Skills.sh branch**:
The Picker's top-level branch that browses the skills.sh registry live, through the skills.sh proxy, and shows its items (live Skills.sh items) as Untraced, deduplicated against the Catalogue.
_Example_: searching "cobol" in the Skills.sh branch lists registry skills that are not in the Catalogue.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Untraced**:
A Skills.sh branch item: a skill shown and servable without a Trace, so its Footprint is unknown.
_Example_: a registry skill found by live search and absent from the Catalogue is labelled Untraced.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Author's server**:
The server the project's author operates that holds every Catalogue skill's traced files at its Revision and is the only origin they are served from. For now it is this machine, reached at its public address.
_Example_: a session in a network namespace fetches `mattpocock/skills/tdd` from the Author's server's public address and from nowhere else.
_Not_: the skills.sh proxy, which serves the Skills.sh branch.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

## invariants

Frozen with INVARIANTS.md.

**Context**:
Everything that reaches the model in a session's requests: system prompt, tool definitions, MCP instructions, and tool results.
_Example_: a Served skill's name and description returned by a search is in the agent's context; an unserved skill's name is not.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Native skill folders**:
Every folder Pi discovers skills from on its own, user-level and project-level. A skill in them is one of the user's native skills. In Pi 1.4.0 these are: user-level `~/.pi/agent/skills` (or `$PI_CODING_AGENT_DIR/skills`) and `~/.agents/skills`; project-level `.pi/skills` in the working directory, and `.agents/skills` in the working directory and each parent directory up to the git repository root, when the project is trusted.
_Example_: a skill folder placed in `~/.agents/skills` is in every session's system prompt.
_Not_: anything pi-sliced serves.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Aggregator**:
A product whose main offering is listings merged from other registries and shown at face value (their rankings, counts, and descriptions), without its own Trace and Determination of each listing.
_Example_: a site whose main page merges several registries' skill leaderboards, sorted by their install counts.
_Not_: the Skills.sh branch: a separate, secondary branch whose items are labelled Untraced and deduplicated against the Catalogue.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

**Source of truth**:
The one place a fact is kept and from which every copy of it is derived.
_Example_: a Trace committed in the repository is the source of truth for that Candidate's Footprint; the Picker's display of it is a copy.
_Confirmed_: 2026-10-23, Jang (via executive), at init.

## Language

**Marker**:
A fixed label a Classification gives a skill from its Trace, which the Picker shows as a glyph.
_Example_: `shadcn-ui/ui/shadcn` carries `runs-commands`, `installs-packages`, and `unpinned-code`.
_Not_: a Determination; a verdict on whether the skill is safe.
_Confirmed_: 2026-10-24, Jang (via executive).

**Signal**:
A fact in a Trace about what a pulled-in file's text does.
_Example_: `fetch-run` "npx shadcn@latest" at `skills/shadcn/cli.md`.
_Not_: a Marker, which a Classification derives from signals and Outside requirements.
_Confirmed_: 2026-10-24, Jang (via executive).

**Occasion**:
A problem a user meets now and then, from `catalogue/occasions.tsv`. A Determination places a Catalogue skill under its occasions.
_Example_: `doc.pdf.extract`, "Extract text and tables from a PDF, including scanned pages (OCR)", weight 4.
_Not_: a technology category.
_Confirmed_: 2026-10-24, Jang (via executive).

**Companion**:
A skill that another skill names or pulls in.
_Example_: `code-review` is a companion of `mattpocock/skills/tdd`, which names it.
_Confirmed_: 2026-10-24, Jang (via executive).

**Platform skill**:
A skill whose value is tied to one API, framework, vendor, format, or tool. One platform skill leads each occasion it fits; others for the same occasion are superseded there.
_Example_: `shopify/shopify-ai-toolkit/shopify`.
_Not_: a style skill.
_Confirmed_: 2026-10-24, Jang (via executive).

**Style skill**:
A skill whose value is a method or working style not tied to one API, whoever publishes it. Several stand side by side under an occasion, and none supersedes another.
_Example_: `mattpocock/skills/tdd`, `anthropics/skills/doc-coauthoring`.
_Not_: a portfolio grouping; style skills sit in their domains like any listing.
_Confirmed_: 2026-10-24, Jang (via executive).

## Unresolved
