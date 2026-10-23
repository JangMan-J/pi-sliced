---
type: invariants
created: 2026-10-23T22:26:14Z
created_by: claude-opus-5-5
created_session: 01a16ad8-e553-7570-944c-08638df8729d
---

# pi-sliced invariants

These are the anti-goals of pi-sliced: what it will never be, serve, enter, or contain, and the invariants no work in it may violate.

## Invariants

- Never can the agent see, search, or load a Catalogue skill or live Skills.sh item that is not in the session's Slice. Only the user widens it. Check: `scripts/check-slice`
- Never does a Catalogue skill or live Skills.sh item that is not Served add anything to the agent's context. Check: `scripts/check-slice`
- Never hide, replace, or alter the user's native skills, other extensions, or other MCP servers. They stay exactly as Pi provides them.
- Never does anything pi-sliced served remain on the user's machine, or in a later session, after the session it was served in ends, apart from what Pi itself records in that session's own session file. A new session starts with an empty Slice. Check: `scripts/check-lifetimes`
- Never list a Catalogue skill without a recorded Trace of everything it pulls in at its Revision. Check: `scripts/check-catalogue`
- Never serve a Catalogue skill as anything other than its complete traced file set at its Revision, byte for byte. Check: `scripts/check-serve`
- Never fetch Catalogue files from a third party at serve time. The Author's server is their only origin. Check: `scripts/check-serve`
- Never let the user choose a Catalogue skill without its Footprint shown first: total size, what it pulls in (SDK, monorepo, assets), and Outside requirements (MCP servers, CLIs, API keys, network). A Heavy skill takes a deliberate confirm that names the cost. Check: `scripts/check-stranger`
- Never serve an Untraced item without the user being told it is Untraced. The status line at the top of the Picker states the user's current selections, including that disclaimer. Check: `scripts/check-untraced`
- Never serve a Catalogue skill at a Revision other than the one the user inspected when choosing it.
- Never execute a skill's scripts. pi-sliced serves files; the agent decides what to run.
- Never alter a skill's content or frontmatter. Frontmatter is as critical as a TCP/IP header.
- Never overwrite a Trace. A new Revision gets a new Trace.
- Never does a Classification, Determination, or summary exist for a skill without the Trace it was derived from.
- Never drop a Candidate. A rejected Candidate keeps its Trace and can be reconsidered. Check: `scripts/check-catalogue`
- Never admit or reject a Candidate because of its publisher's status. Admission comes from its Trace, Classification, and Determination.
- Never reject a Candidate because of its size.
- Never rank or admit Catalogue skills by popularity or install counts, and never show popularity or install counts in the Picker.
- Never present Catalogue listings unevenly by source. Every Catalogue listing is shown the same way and passes the same checks.
- Never share session state between users. Each user's Slice is their own.
- Never keep a source of truth outside the repo and public sources. Credentials are the only exception, and they are never committed.

## Will not be

- A package manager or installer. "Install" and "download" are not part of its user vocabulary; Served is.
- A place skills are kept. pi-sliced serves a skill for one session; keeping a skill permanently is outside it.
- An aggregator, or anything that feels like one.
- A skill-authoring or skill-editing tool.

## Will not enter

- Pi's Native skill folders. Nothing is ever written there.

## Will not contain

- Committed session transcripts, raw experiment dumps, or work belonging to other projects.

## Fork

If KERNEL.md cannot be satisfied while this file holds, whatever the implementation, the project is deadlocked: the goal continues in a new project, and both files stay as written. Any agent may propose that fork by proving the deadlock, and may start it as a proof of concept with local commits. Only the user pushes a fork, and only the user promotes one to primary.

## Frozen

This file and the `invariants` namespace of GLOSSARY.md are frozen. Only a fork the user promotes replaces them.

## Namespace

`invariants`: these terms are defined in GLOSSARY.md under `## invariants`, frozen with this file, and reserved across the glossary.

Context, Native skill folders, Aggregator, Source of truth
