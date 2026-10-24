# Brief: run one judge round for the Catalogue (proof 9)

You coordinate one round of judge questions. You do not answer any question yourself.

You get a batch list: a file of paths `…/<judge>-<NNN>.q.jsonl`, one per line. Each batch file holds about 100 questions for judge-10 or judge-12, or at most 10 for judge-11.

| Judge version | Model | Prompt |
| --- | --- | --- |
| `judge-12` (default under ruling c3) | `meta/muse-spark-1.3` | `tools/trace/judge-12.md` |
| `judge-10` | `openai-codex/gpt-6-astra` | `tools/trace/judge-10.md` |
| `judge-8` (paused) | `anthropic/claude-sonnet-5-5` | `tools/trace/judge-8.md` |
| `judge-11` | `openai-codex/gpt-6-luna` | `tools/trace/judge-11.md` |

judge-12 passed outside-skill-folders (107/107) and skill-folder-only (141/141); judge-10 passed outside-skill-folders; judge-11 passed skill-folder-only. Under ruling c3, start no new work on Anthropic and prefer `meta/muse-spark-1.3` (`judge-12`) for new outside-skill-folders and skill-folder-only batches. Do not call Anthropic for the unchanged judge-8 prose-directory route; leave those batches pending until replacement calibration is approved. judge-12 failed prose-directory (79/91 valid retry): never route prose-directory to judge-12. See `docs/catalogue/calibration/subscription-results.md`, `docs/catalogue/calibration/muse-results.md`, and `docs/catalogue/rulings-c3.md`. The judge-10/11/12 prompt headers identify their calibrated models; use the actual model ID from the environment as required below.

## For each batch

1. **Start a judge.** Start one judge agent with `agent_delegate`:
   - `model` as in the table, `thinking: "medium"`, `inheritProjectContext: false`; judges must not recruit;
   - `cwd` = the repository root;
   - `files` = the prompt file and the batch file;
   - `placement: "tab"`, so that no tab holds more than four panes.

   Give it this task, with `<Q>` and `<A>` filled in (`<A>` is the batch path with `.q.jsonl` replaced by `.a.jsonl`):

   > You are the judge. Your instructions are the attached prompt, and you answer every question in the attached `<Q>`.
   > Hard requirements:
   > - Read each question and decide it individually, from its own fields. Do not write or run any script, regex, or program that produces, drafts, or proposes answers, even one whose output you discard.
   > - Every line needs its own one-sentence `reason` naming what the sentence does with the target. At least half the packet's lines must have distinct reasons, even when sentences repeat. Separately, no reason may cover more than 20% of lines unless those sentences are identical. Both checks must pass.
   > - `model` is your model id: read it with `echo $PI_MODEL`.
   > - You may use a script only to write out the lines you decided by hand (taking each `id` from the question file by position) and to check the format: one line per question, each parses as JSON, ids match the question file in order.
   >
   > Write the lines to `<A>`. Read nothing else in this repository: nothing under `.pad/` other than your question file, no `docs/`, no `tests/`, no `traces/`, no `tools/` other than the prompt. Report the counts of true and false answers.

2. **Validate.** When the judge reports, check its answer file before anything else:
   - it has one line per question, and the ids are in the question file's order;
   - every line parses as JSON;
   - `pullsIn` is a boolean;
   - `judge` equals the batch's judge version;
   - `model` equals the table's model id without the provider (`muse-spark-1.3` for judge-12, `gpt-6-astra` for judge-10, or `gpt-6-luna` for judge-11);
   - every `reason` is non-empty;
   - **Check A (independent minimum):** distinct reason texts must number at least half the packet's lines. Identical sentences do not exempt this minimum.
   - **Check B (reuse):** no single reason text may cover more than 20% of lines with differing sentences. Identical sentences exempt only this check.

   Both A and B must pass (ruling c4). Never waive either gate or import first and validate later.

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
