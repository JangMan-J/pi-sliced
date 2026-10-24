# Brief: coordinate a batch of model runs for the Catalogue (proof 9)

You coordinate model runs. You decide nothing yourself.

You get a run list, one line per run: `<packet path>\t<output path>\t<kind>\t<model>`, where `<model>` is the full provider-qualified id that run is assigned (ruling c3, Jang via executive, 2026-10-24). No new work starts on `anthropic`; never use `antigravity/claude-*`.

| kind | Model pool | Prompt | Extra file |
| --- | --- | --- | --- |
| `determine` | rotate each packet across `meta/muse-wonder-full-1.0`, `xai/grok-4.7`, `antigravity/gemini-4-argon` | `tools/determine/determine-1.md` | `catalogue/occasions.tsv` |
| `purpose-action` | `antigravity/gemini-4-argon` or `meta/muse-wonder-full-1.0`, alternating per occasion (c3 literal); flagged Candidates not yet placed under an occasion get no assignment — pending executive clarification, do not invent a per-packet mapping | `tools/determine/purpose-action-1.md` | none |
| `duplicates` | rotate each batch across the `determine` pool (`meta/muse-wonder-full-1.0`, `xai/grok-4.7`, `antigravity/gemini-4-argon`) — provisional, pending executive clarification | `tools/determine/duplicates-1.md` | none |

Occasion lead runs use `tools/determine/occasion-1.md` (no extra file) with the same per-run procedure below, alternating each occasion across `antigravity/gemini-4-argon` and `meta/muse-wonder-full-1.0`. Each record's `author.id` names the model that wrote it.

## For each run

1. **Start one agent** with `agent_delegate`:
   - `model` = the run list's `<model>` for that run;
   - `thinking: "medium"` (`"high"` for purpose-action);
   - `recruit: false`, `inheritProjectContext: false`;
   - `cwd` = the repository root;
   - `files` = the prompt, the extra file if any, and the packet;
   - `placement: "tab"`, so that no tab holds more than four panes.

   Give it this task, with the paths filled in:

   > Follow the attached prompt for every Candidate (or group) in the attached packet `<packet>`. `model` is your model id: read it with `echo $PI_MODEL`. Decide each one by reading its packet entry. No script may produce or propose decisions; a script may only write out the lines you decided and check their JSON format. Write the JSON lines, in packet order, to `<output>`. Read nothing under `.pad/` other than your packet. You may read files of a Candidate's source from its clone (`git -C ~/.cache/pi-sliced/git/<owner>/<repo>.git show <revision>:<path>`) when the packet's excerpt is not enough. Report your counts.

2. **Check** when it reports:
   - the output file exists and has one JSON line per packet entry;
   - `model` is the run's assigned id without the provider, matching the run list's `<model>`;
   - the agent did not say it used a script to draft decisions.

   If a check fails, move the output file to `.pad/catalogue/runs/quarantine/` with a note, and rerun once with a fresh agent.

3. **Close the agent** with `agent_close`.

## Pace and report

Keep at most 8 agents running at once, and start the next run as soon as one finishes.

Report:
- the runs completed;
- the runs that failed twice, with the reasons;
- anything unusual an agent reported, such as an entry it could not decide.

Close every agent you started. Do not apply or commit anything; the caller validates and applies the outputs, passing the run's assigned model as the required `tools/determine/apply.ts --model <id without the provider>` (required even for `--dry`).
