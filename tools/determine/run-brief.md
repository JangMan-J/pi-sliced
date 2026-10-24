# Brief: coordinate a batch of model runs for the Catalogue (proof 9)

You coordinate model runs. You decide nothing yourself.

You get a run list, one line per run: `<packet path>\t<output path>\t<kind>`.

| kind | Model (provider `anthropic`) | Prompt | Extra file |
| --- | --- | --- | --- |
| `determine` | `anthropic/claude-sonnet-5-5` | `tools/determine/determine-1.md` | `catalogue/occasions.tsv` |
| `purpose-action` | `anthropic/claude-opus-5-5` | `tools/determine/purpose-action-1.md` | none |
| `duplicates` | `anthropic/claude-sonnet-5-5` | `tools/determine/duplicates-1.md` | none |

## For each run

1. **Start one agent** with `agent_delegate`:
   - `model` as in the table;
   - `thinking: "medium"` (`"high"` for purpose-action);
   - `recruit: false`, `inheritProjectContext: false`;
   - `cwd` = the repository root;
   - `files` = the prompt, the extra file if any, and the packet;
   - `placement: "tab"`, so that no tab holds more than four panes.

   Give it this task, with the paths filled in:

   > Follow the attached prompt for every Candidate (or group) in the attached packet `<packet>`. `model` is your model id: read it with `echo $PI_MODEL`. Decide each one by reading its packet entry. No script may produce or propose decisions; a script may only write out the lines you decided and check their JSON format. Write the JSON lines, in packet order, to `<output>`. Read nothing under `.pad/` other than your packet. You may read files of a Candidate's source from its clone (`git -C ~/.cache/pi-sliced/git/<owner>/<repo>.git show <revision>:<path>`) when the packet's excerpt is not enough. Report your counts.

2. **Check** when it reports:
   - the output file exists and has one JSON line per packet entry;
   - `model` is the run model's id without the provider;
   - the agent did not say it used a script to draft decisions.

   If a check fails, move the output file to `.pad/catalogue/runs/quarantine/` with a note, and rerun once with a fresh agent.

3. **Close the agent** with `agent_close`.

## Pace and report

Keep at most 8 agents running at once, and start the next run as soon as one finishes.

Report:
- the runs completed;
- the runs that failed twice, with the reasons;
- anything unusual an agent reported, such as an entry it could not decide.

Close every agent you started. Do not apply or commit anything; the caller validates and applies the outputs.
