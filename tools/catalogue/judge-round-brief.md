# Brief: run one judge round for the Catalogue (proof 9)

You coordinate one round of judge questions. You do not answer any question yourself.

You get a batch list: a file of paths `…/<judge>-<NNN>.q.jsonl`, one per line. Each batch file holds about 100–150 questions for one judge version.

| Judge version | Model (provider `anthropic`) | Prompt |
| --- | --- | --- |
| `judge-8` | `anthropic/claude-sonnet-5-5` | `tools/trace/judge-8.md` |
| `judge-9` | `anthropic/claude-haiku-5-5` | `tools/trace/judge-9.md` |

## For each batch

1. **Start a judge.** Start one judge agent with `agent_delegate`:
   - `model` as in the table, `thinking: "medium"`, `recruit: false`, `inheritProjectContext: false`;
   - `cwd` = the repository root;
   - `files` = the prompt file and the batch file;
   - `placement: "tab"`, so that no tab holds more than four panes.

   Give it this task, with `<Q>` and `<A>` filled in (`<A>` is the batch path with `.q.jsonl` replaced by `.a.jsonl`):

   > You are the judge. Your instructions are the attached prompt, and you answer every question in the attached `<Q>`.
   > Hard requirements:
   > - Read each question and decide it individually, from its own fields. Do not write or run any script, regex, or program that produces, drafts, or proposes answers, even one whose output you discard.
   > - Every line needs its own one-sentence `reason` naming what the sentence does with the target. A repeated reason is acceptable only for identical sentences.
   > - `model` is your model id: read it with `echo $PI_MODEL`.
   > - You may use a script only to write out the lines you decided by hand (taking each `id` from the question file by position) and to check the format: one line per question, each parses as JSON, ids match the question file in order.
   >
   > Write the lines to `<A>`. Read nothing else in this repository: nothing under `.pad/` other than your question file, no `docs/`, no `tests/`, no `traces/`, no `tools/` other than the prompt. Report the counts of true and false answers.

2. **Validate.** When the judge reports, check its answer file before anything else:
   - it has one line per question, and the ids are in the question file's order;
   - every line parses as JSON;
   - `pullsIn` is a boolean;
   - `judge` equals the batch's judge version;
   - `model` equals the table's model id without the provider (`claude-sonnet-5-5` or `claude-haiku-5-5`);
   - every `reason` is non-empty. On reasons, a batch fails only when fewer than half of its lines have distinct reasons, or one reason text is used on more than 20% of its lines while their sentences differ. A few reasons shared between similar sentences are fine.

   Also read the judge's report. If it says it used a script to draft or propose answers, the batch fails.

3. **Import or retry.**
   - If the batch passes, run `node tools/trace/cli.ts import <Q> <A>` from the repository root and keep its output line.
   - If the batch fails, move the answer file to `.pad/catalogue/judge/quarantine/`, append the reason to `.pad/catalogue/judge/quarantine/README`, and run the batch once more with a fresh judge. If it fails twice, leave it unanswered and list it in your report.

4. **Close the judge** with `agent_close`.

## Pace

Keep at most 8 judges running at once. Start a new one each time one finishes. Import one batch at a time, never two imports at once. Treat a slow judge as normal; inspect it only if it has been silent for over 30 minutes.

## Report

Report:
- batches answered and imported;
- answers imported, split into true and false;
- batches that failed twice, with the reasons;
- anything unusual you saw.

Close every agent you started.
