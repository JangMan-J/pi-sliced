> Draft fork of pi-sliced. Not promoted; not frozen.
---
type: kernel
created: 2026-10-23T22:26:14Z
created_by: claude-opus-5-5
created_session: 01a16ad8-e553-7570-944c-08638df8729d
---

# pi-sliced kernel

pi-sliced lets any Pi user pick a skill on demand from a curated Catalogue, including one they rarely need or did not expect to need, and serve it to the agent for just this session. When the session ends, the skill is gone: nothing is downloaded or kept. Every Catalogue listing has been traced to everything it pulls in, its Footprint is shown before the user chooses, and it is served at exactly the Revision the user inspected; that is what lets the Catalogue carry the trust of an official plugin marketplace.

## Proofs

Until every check below passes, work in this project serves an open proof.

1. **A Trace reaches everything a skill pulls in, and nothing else**
   Check: `scripts/check-trace` traces each of these Candidates and exits 0 only when every recorded file set and Outside requirement list exactly equals the expected set the user confirmed for that Candidate: `openai/plugins/debug-zoom-integration`, `openai/plugins/game-ui-frontend`, `heygen-com/hyperframes/hyperframes-core`, `figma/mcp-server-guide/figma-generate-diagram`, `shopify/shopify-ai-toolkit/shopify`, `anthropics/skills/canvas-design`, `nvidia/skills/amc-run-video-calibration`, `shadcn-ui/ui/shadcn`, `mattpocock/skills/tdd`. For every traced skill it also requires every file's git blob SHA to match the tree at its Revision.
2. **Classifications re-derive offline from stored Traces**
   Check: `unshare -rn scripts/rederive` rebuilds every Classification from the stored Traces, byte-identical to the committed ones, lists every Determination whose Trace or Classification changed, and exits 0.
3. **A stranger chooses with the Footprint shown**
   Check: `scripts/check-stranger` runs the Picker in a terminal with an empty HOME, reaching the Author's server at its public address, against a Catalogue on that server that admits `anthropics/skills/canvas-design`, whatever the real Determinations say. It installs the public package with `pi install`, browses to a Catalogue skill, and passes only if: the Footprint is shown in the listing row and in Inspect with no extra key press, before the skill can be served; serving `anthropics/skills/canvas-design` shows a confirm naming its size, and declining leaves it unserved; the status line at the top of the Picker states the current selections; no Picker screen contains the word "install" or "download".
4. **Catalogue skills are served exactly as traced, from the Author's server only**
   Check: `scripts/check-serve` runs a session with an empty HOME in an isolated container or network namespace with no access to the Author's server's local files, reaching that server at its public address, against a Catalogue on that server that admits the nine Candidates of proof 1, whatever the real Determinations say. The user serves those nine. It passes only if, for each, the files the agent can read equal the Trace's files by git blob SHA, and every connection over which Catalogue files reached the session's machine or container was to the Author's server, and none to GitHub, skills.sh, or any other third party.
5. **A Served skill is gone when its session ends**
   Check: `scripts/check-lifetimes`, with an empty HOME, reaching the Author's server at its public address: session 1 serves skills A and B, and the agent reads a file from each. Session 1 exits. It passes only if a diff of HOME and the temp directories against their state before session 1 shows nothing pi-sliced served remaining (the pi-sliced package itself and Pi's session files excluded), and session 2 starts with an empty Slice in which the agent cannot read A or B.
6. **The agent sees no Catalogue skill or Skills.sh branch item outside the Slice**
   Check: `scripts/check-slice` runs a session with an empty HOME whose Slice is one skill and captures every model request payload (system prompt, tools, MCP instructions, tool results). It passes only if no payload contains the frontmatter description or the `<owner>/<repo>/<name>` identifier of any Catalogue skill or Skills.sh branch item that is not Served, and an agent call to load or search for such a skill by its name returns nothing about it.
7. **The cost of a Served skill the agent has not read is measured**
   Check: `scripts/check-cost` captures request payloads for Slices of 0, 1, 10, and 50 skills and writes the measured sizes. It passes only if each payload exceeds the empty-Slice payload by no more than a fixed overhead that is the same for every Slice size, plus, per Served skill, its name, its frontmatter description, and at most 128 bytes of framing, with no skill body and no reference file.
8. **Skills.sh branch items are marked Untraced**
   Check: `scripts/check-untraced` searches the Skills.sh branch for a term that matches a Catalogue skill and a skill outside the Catalogue. It passes only if the Catalogue skill appears once, as its Catalogue listing; the other item is labelled Untraced; and selecting it makes the status line at the top of the Picker state that an Untraced item is selected.
9. **Every Candidate is traced and determined**
   Check: `scripts/check-catalogue` exits 0 only when every Candidate in the reused set (the archive's 10,001 skills) has a Trace, which records it as unresolvable when its source no longer resolves, and a Determination; and every Catalogue skill has a Classification and a Footprint.

## Frozen

This file and the `kernel` namespace of GLOSSARY.md are frozen. Only a fork the user promotes replaces them.

## Namespace

`kernel`: these terms are defined in GLOSSARY.md under `## kernel`, frozen with this file, and reserved across the glossary.

Skill, Catalogue, Candidate, Revision, Pull in, Trace, Outside requirement, Footprint, Heavy, Classification, Determination, Served, Slice, Picker, Inspect, Domains branch, Skills.sh branch, Untraced, Author's server
