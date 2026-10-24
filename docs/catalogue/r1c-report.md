# r1c report: skill-folder-only round on judge-12 (Muse Spark)

The first coordinator report called this round complete. That was false. All 4,286 `skill-folder-only` questions were imported, but packets 012 and 014 failed the half-distinct reason gate (32 and 45 distinct reasons; minimum 50) and were imported anyway. Ruling c4 repaired that. The judge-12 store now holds 4,286 answers, every one from a packet that passed both reason gates. Do not treat the pre-repair import as the record.

## Routing (ruling c3, unchanged by this repair)

- `tools/trace/judge-12.md`: calibration decision instructions; authorized for outside-skill-folders and skill-folder-only only. Prose-directory failed calibration (79/91) and is not routed here.
- `tools/trace/judge.ts`: panel appends `judge-12` last in `outside-skill-folders` and `skill-folder-only`. Prose stays `["judge-4", "judge-8"]` (paused).
- This repair did not edit routing or tools. The coordinator brief already states Check A (half-distinct minimum; identical sentences do not exempt it) separately from Check B (no reason on more than 20% of lines with differing sentences). Both must pass before import.

## What the first pass did

`node tools/catalogue/batch-questions.ts r1c-muse shard-*.jsonl` wrote 43 judge-12 packets, 4,286 questions, all `skill-folder-only` (42×100 + 1×86). Production calls were `meta/muse-spark-1.3`. The coordinator imported 43/43, including the two invalid packets: 4,114 true and 172 false.

Director validation reproduced the gate failures. Those 200 answers were not accepted.

## C4 repair

Quarantine and rebuild were already done before this retry. Evidence is in `.pad/catalogue/judge/r1c-muse/quarantine/` (the pre-repair store under `imported-judge-12-before-c4/`, plus `judge-12-012.a.jsonl` and `judge-12-014.a.jsonl`). The rebuilt store had the other 41 packets only: 4,086 answers, 3,928 true, 158 false. Question ids from 012 and 014 were absent.

Blind retry, once each, fresh `meta/muse-spark-1.3`, `tools/trace/judge-12.md` unchanged. Each judge received only that prompt and a byte-copy of the original question file under `.pad/catalogue/judge/r1c-muse/c4-retry/`. No prior answers. Max two judges. Format-check scripts ran only after the answers were written; neither judge reported a script that drafted decisions.

Validated before import, gates scored separately:

| packet | lines | ids in order | judge / model | Check A distinct | Check B max reuse | true | false |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 012 | 100 | yes | `judge-12` / `muse-spark-1.3` | 100 (≥50) | 1 (≤20) | 99 | 1 |
| 014 | 100 | yes | `judge-12` / `muse-spark-1.3` | 100 (≥50) | 1 (≤20) | 92 | 8 |

Both passed. Imported one at a time with `node tools/trace/cli.ts import`. The CLI prints `traces/judgements/judge-7/` because that is the panel name; the files landed under `traces/judgements/judge-12/`. Each import appended 100. Quarantined originals were not edited: 012 still 32 distinct reasons (99/1), 014 still 45 (87/13). The pre-repair copies in `.pad/catalogue/judge/r1c-muse/judge-12-012.a.jsonl` and `judge-12-014.a.jsonl` are likewise untouched.

Decision diffs against the quarantined answers, not a re-judge: packet 012 flipped nothing (same 99/1). Packet 014 flipped 5, all false to true, which is why 87/13 became 92/8. The 8 false answers that remain are user-project `SKILL.md` collisions in the Foundry skill-attach docs and one contributor release-execution reference.

## Store after repair

Rebatch of the 43 r1c question files (`node tools/catalogue/batch-questions.ts c4-rebatch-verify .pad/catalogue/judge/r1c-muse/judge-12-*.q.jsonl`) wrote an empty batch list. Pending for this round: 0.

| | answers | true | false |
| --- | --- | --- | --- |
| 41 packets kept from the first pass | 4,086 | 3,928 | 158 |
| retry 012 | 100 | 99 | 1 |
| retry 014 | 100 | 92 | 8 |
| **judge-12 store** | **4,286** | **4,119** | **167** |

The store has 4,286 lines and 4,286 unique ids. Every r1c question id is present, `pullsIn` matches the accepted packet file, and no store id sits outside those 43 packets.

Per-packet true/false, with 012 and 014 from the retry:

| batch | t/f | batch | t/f | batch | t/f | batch | t/f |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 000 | 97/3 | 011 | 90/10 | 022 | 99/1 | 033 | 98/2 |
| 001 | 100/0 | 012 | 99/1 | 023 | 99/1 | 034 | 100/0 |
| 002 | 90/10 | 013 | 100/0 | 024 | 100/0 | 035 | 89/11 |
| 003 | 97/3 | 014 | 92/8 | 025 | 100/0 | 036 | 91/9 |
| 004 | 99/1 | 015 | 100/0 | 026 | 95/5 | 037 | 87/13 |
| 005 | 100/0 | 016 | 81/19 | 027 | 97/3 | 038 | 99/1 |
| 006 | 94/6 | 017 | 100/0 | 028 | 98/2 | 039 | 97/3 |
| 007 | 100/0 | 018 | 100/0 | 029 | 100/0 | 040 | 85/15 |
| 008 | 99/1 | 019 | 97/3 | 030 | 100/0 | 041 | 99/1 |
| 009 | 89/11 | 020 | 99/1 | 031 | 95/5 | 042 | 72/14 |
| 010 | 99/1 | 021 | 100/0 | 032 | 97/3 | | |

## Prose-directory

No fresh prose calibration in this repair. The c4 panel score was already recorded: judge-16 (majority of judge-10, judge-13, judge-14) prose-directory 89/91 = 97.802198% PASS, with both pending baseline conflicts counted as misses. See `docs/catalogue/calibration/agreement.txt`.

## Still open

- Batch 016 was format-valid on the first pass and was not re-judged. It reads generic other-skill `SKILL.md` mentions broadly as collisions (11 of its 19 false). Spot-check when traces replay.
- No commits in this repair.
- Next catalogue work, not done here: trace-4 rounds, publish, duplicates, Determinations, occasion runs under c3.
