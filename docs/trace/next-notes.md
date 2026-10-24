# Evidence for the trace vector's Next (from the executive, sandbox prototype, since deleted)

Proof 1 does not change.

Prototype: a Haiku agent ran through Pi on each skill, with only the traced files visible (bwrap + overlay), logging file opens, execs and DNS.

- No trace misses. game-ui-frontend read 5 of 17, shadcn 1 of 16, keyframes 2 of 3, keyframes+core 4 of 414. None outside the set.
- Big finding: `hyperframes-keyframes` served alone led the agent to run `npx hyperframes init`, which ran
  `npx skills add https://github.com/heygen-com/hyperframes --skill hyperframes --skill hyperframes-cli --skill hyperframes-registry --skill media-use --global`,
  writing 3.6 MB of skills into `~/.claude/skills` and `~/.agents/skills` (a Native skill folder). pi-sliced did not write them (the skill's CLI did),
  but this is the permanent retention the project exists to avoid, and the user must know before choosing. Served together with hyperframes-core, the agent never ran init.
- Static tracing cannot see: CLI run-time hosts (posthog telemetry, jsdelivr, github), system binaries (chromium, nvidia-smi), `shadcn init` git-cloning `shadcn-ui/ui` into /tmp.

Plan to record (not to build now): a later "exercise run" stage beside the static Trace.
- Uses: a failed read inside the traced set counts as a trace miss; observed run-time hosts and programs; any write outside the working directory,
  above all into Native skill folders or other skill folders, recorded as a persistent side effect that the Footprint shows prominently and a
  Determination must address; companion dependence; quality evidence for Determinations.
- Zero misses never counts as completeness.
- Known gaps: credentials and MCP servers block runs; telemetry pollutes host lists; one run per arm varies; the miss detector needs per-process
  attribution (git's clone probes look like misses).
- Cost: about $0.10-0.40 and 2-10 minutes per run.
- Proof 5's skills A and B must not be ones whose tools write outside the session.

# Security classification (executive, for later Classification / exercise work)

Static and deterministic, computed from traced file contents:
- commands that fetch and run unpinned remote code (`curl … | sh`, `npx pkg` / `pkg@latest`, `pip install git+…`, `npx skills add`, `uvx`);
- writes to persistence locations (Native skill folders, other agents' skill folders, shell rc files, crontab/systemd units, `~/.ssh`);
- credential exfiltration shapes (secret vars sent to a non-loopback host);
- prompt-injection markers in skill text (instructions aimed at overriding the agent; invisible or bidirectional Unicode).

Exercise runs confirm what actually happens. Every hit is shown in the Footprint and must be addressed by a Determination.
Reason: the pinned Revision guarantees the served files, not the code those files tell the agent to fetch at run time; that gap must be disclosed.

# Product direction (Jang via executive): plan for the threads after proof 1; changes nothing in the D-round

Jang: "This project can only take off if it offers a substantial catalogue … consumers get to look at [the commands] … I would steer you towards icons, glyphs, clear markers from the tree view screen, particularly at the branches, with icons and a legend, indicating 'shell commands', 'chain loading', 'stub' … if we can consistently mark them that way with transparency it buys a lot of trust and a lot more catalogue. The hard part is triaging what might actually be malicious/hidden/unrelated activity within a skillset."

1. Admit broadly, mark transparently. A Determination admits by default; it rejects only for malicious/hidden/unrelated activity, unresolvable, broken when served, a set-fragment useless alone (offered only as its set), or a duplicate. Weight and requirements become markers, not rejection reasons.
2. Markers. Classification (deterministic, from Traces plus the security classification) emits a fixed marker set; the Picker shows them as glyphs per row, a branch shows the union of its children, plus a legend. Candidates: runs shell commands/CLIs; installs packages; network; needs credentials; MCP server; chain-loads (pulls sibling skills, or fetches more skills/code at run time); stub (thin router or wrapper whose content lives elsewhere); checkout-only scripts; persistent side effects (writes outside the session, especially into skill folders); fetches unpinned remote code; opaque code (minified bundles, binaries, encoded blobs); Untraced. Size stays in the Footprint (frozen) but compact: "nobody in 2026 cares about file sizes".
3. Triage of malicious/hidden/unrelated activity, layered by cost: (a) static, every Candidate: security patterns plus opacity detection; (b) purpose vs action, flagged Candidates only: a cheap model reads the description and a compact action list (commands, hosts, writes, credentials) and names every action the stated purpose does not explain, recorded as Determination evidence; (c) exercise runs for the highest risk: observed hosts/writes/execs vs declared; (d) Revision diffs: new hosts/commands/writes flagged on a Revision move (supply-chain updates). Risk ranking orders the queue. No human reads skills by hand. Never publisher status or popularity (frozen out).
4. Picker slice: marker column plus legend, built with the tui-design skill.

## Popularity as a heuristic (Jang via executive)

Jang: "you may have to reintroduce 'popularity' not necessarily as a visual mechanic but as a heuristic."

Reading of the frozen text: the invariants bar ranking or admitting Catalogue skills by popularity and showing it in the Picker. Within that, popularity (skills.sh install counts, stars) may be used:
- (a) intake order: which Candidates to consider and trace first out of the registry's ~1.37M listings; considering is not admitting;
- (b) scrutiny heuristic: low signal plus risky markers goes earlier to purpose-vs-action review or exercise runs; a very popular skill with new risky actions after a Revision diff is a supply-chain priority.

Stored as a dated Candidate fact with its source. Never in a Determination's reason (citing it fails syntactical review), never a listing order, never shown. Duplicates pick their canonical copy by provenance (the upstream origin of the forks), not install count. If popularity must ever sway admission, that is a fork, not a reading.

### Narrowing (Jang via executive): popularity is for attention only

Jang: "how hard do i have to look for malicious code in this 53000 star git repo". Drop (a) intake order. Keep only (b): popularity sets how deep malice triage goes on a Candidate. A widely used repo with nothing new gets lighter scrutiny; an obscure repo with risky markers gets heavier scrutiny; a new Revision of a popular repo that adds hosts, commands or writes always gets full scrutiny (compromised updates of popular packages are the classic attack, so popularity never discounts a Revision diff). Everything else from the previous note stands.

# Value direction (Jang via executive): Determinations and listing text after proof 1

Jang: "what can sell this project as desirable is having domain-specific, proficient skills that solve a problem that a user doesn't have to deal with every day."

- Determinations judge three fits: occasion fit (a specific problem met now and then: camera calibration, Zoom SDK debugging, a Shopify theme, video composition, a scientific or legal format); proficiency (real domain depth, not a stub or a restatement of `--help`); domain specificity.
- Generic everyday skills (commit messages, generic TDD, code review) are not the showcase; a user who needs them daily keeps them natively. They may be admitted under admit-broadly but never lead a domain.
- Each listing's one-line summary names the problem it solves and the occasion it fits, written for a person deciding whether it is worth it this time.
- Domain grouping follows occasions and problems a user recognises, not technology taxonomies.

# Portfolios vs platform skills (Jang via executive): post-proof-1, does not touch proof 1

Jang: "I would treat independent developer portfolios differently, I mean like mattpocock type sources. Those are stylistic choices, which is not the same thing as an API/Framework choice." / "aim for proportion … what's out there is NOT proportionate" / "a particular problem only needs a particular fix."

- Proportion is counted in occasions covered; a coverage director is mapping weighted occasions in `.pad/coverage/`.
- Platform skills (tied to an API, framework, vendor or format) follow the occasion rule: one best fix leads each occasion; the rest are superseded for that occasion.
- Portfolios (an independent developer's cohesive working-style set, e.g. `mattpocock/skills`) are a style choice: kept whole, offered as a set, never superseded by another portfolio's skill for the same occasion; several styles may stand side by side.
- Placement (corrected by Jang: "dont separate them"): no separate portfolio group in the Picker. Portfolio skills sit in their domains like any listing; the only difference is curation. (In the archive Jang removed the Platform/Portfolio views because they duplicated skills.)
- A Determination tells platform from portfolio from Classification signals (personal owner vs org, skills not tied to one API, internal named-skill references), by the kind of set, never by publisher status.
- 2026-10-24, Jang via executive: confirmed `occasion-1`'s `variant` rule. Different platforms serving one occasion (Postgres/MySQL, React/Vue, AWS/GCP) each get their own lead; skills for the same platform compete for one lead.
