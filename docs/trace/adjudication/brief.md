---
type: spec
thread: trace
created: 2026-10-24T05:40:00Z
created_by: claude-opus-5-5
created_session: 01a16ad8-e553-7570-944c-08638df8729d
updated: 2026-10-24T05:40:00Z
updated_by: claude-opus-5-5
updated_session: 01a16ad8-e553-7570-944c-08638df8729d
---

# Brief: adjudicate disputed items

Two independent derivations of the same Candidates disagree on the items in your input file. You decide each item from the source text and the confirmed rulings (`rulings.md`, attached), which bind you. You are not told which derivation proposed an item, and that is deliberate. Do not read `.pad/trace/expected/`, `tests/`, `traces/`, or anything under `tools/`.

Each input line is one item:
- `{"id", "candidate", "revision", "item": {"kind": "file"|"cli"|"package"|"network"|"credential"|"mcp-server", "name": "<path or name>"}, "evidence": [{"from": "<repo path>", "line": N, "text": "<quoted>"}]}`

The source repository is the bare clone `~/.cache/pi-sliced/git/<owner>/<repo>.git` at the given Revision. Read the cited lines and their surroundings with `git -C <repo> show <rev>:<path>`. Judge by the rulings:
- A `file` item: is it pulled in? Apply F1–F11, H1, S1. An item counts if any cited edge pulls it in, and that edge's own source file is pulled in.
- An Outside item: does it count under O1–O5 as written? O1 lists the base tools. O2 covers install commands and the imports of run scripts. O3 covers URLs in commands or run scripts, or prose that tells the agent to fetch, download, open, read, or follow them, but never placeholder or loopback hosts. O4 covers secret-shaped env-var names that are set or read. O5 covers "<Name> MCP server/tool(s)".

Output one JSON line per item, in order, to the output path you are given: `{"id": "<id>", "counts": true|false, "ruling": "<the ruling that decides it>", "reason": "<one sentence>", "misreading": null | "<one sentence, only when applying the ruling as written clearly contradicts the frozen definition>"}`.

Read each item and decide it individually. Do not write or run any script that produces or proposes answers; you may use a script only to emit the JSON lines you have decided, and to check their format. Done when every item has a line. Report the counts of true and false, and every `misreading` you raised.
