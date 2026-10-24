# judge-12 calibration: Muse Spark

Calibration used `meta/muse-spark-1.3`, version `judge-12`, against the original 339 questions and stored judge-4 answers. Judges received only the judge-12 prompt and blind question files, not baseline answers. The prompt retains judge-10's decision instructions unchanged; only the version/model provenance was updated. Work was divided into disjoint batches. No production routing or judgment imports were performed.

## Results

| Class | Agreement with judge-4 | Gate (≥97%) | Muse true / false |
| --- | ---: |:---:|---:|
| outside-skill-folders | 107/107 (100.00%) | PASS | 51 / 56 |
| prose-directory (valid retry) | 79/91 (86.81%) | FAIL | 52 / 39 |
| skill-folder-only | 141/141 (100.00%) | PASS | 130 / 11 |

The first prose response has 40 distinct reasons for 91 questions, below the round-brief minimum of half the lines. A retry was underway when execution guidance changed; it completed before the stop took effect. Its format and reason diversity pass (80 distinct reasons), but agreement is 79/91 (86.81%), below the gate. The invalid original is retained as excluded evidence (81/91 agreement), not the scored calibration. The valid retry is the primary prose score; neither prose answer set qualifies for production routing. No further prose judging was done.

## Evidence and validation

Blind question/answer files are `muse-12-prose.q.jsonl`, `muse-12-prose.a.jsonl`, `muse-12-prose-retry.a.jsonl`, and `muse-12-other-{00,01,02}.{q,a}.jsonl` in this directory. The exact calibration prompt is preserved as `muse-judge-12.md`. Scratch copies are under `.pad/catalogue/calibration-muse/`.

All three non-prose batches had matching question/answer counts and IDs in order, valid JSON, boolean decisions, correct `judge-12` / `muse-spark-1.3` provenance, nonempty one-sentence reasons, and passed the reason-diversity rules. Batch reason distinctness was 100/100, 100/100, and 48/48. Both prose files had 91 answers in question order with valid decision fields and correct provenance; initial reason diversity failed as noted above, retry passed. Agreement was computed only after answers were written, by matching IDs to `traces/judgements/judge-4/`.

Director validation with `python docs/catalogue/calibration/check-subscription.py 12` confirmed all valid packets and the scores above. The 339 question IDs and full question contents exactly match the original calibration set. The coordinator's initial skill-folder-only rate, 130/141, confused the number of true decisions with agreement; independent comparison against judge-4 gives 141/141. Prose fails; outside-skill-folders and skill-folder-only pass. Production routing is integrated separately; calibration answers are not imported.
