# Flash calibration: judge-14 (`antigravity/gemini-3.8-flash`)

Scratch calibration only. Not authorized for production routing.

- Prompt: `docs/catalogue/calibration/flash-judge-14.md` (judge-14). Built from `tools/trace/judge-10.md` with decision instructions unchanged; only version (`judge-10` → `judge-14`) and model provenance (`gpt-6-astra` → `antigravity/gemini-3.8-flash`, all three classes, c3) differ. Diff touches header + output `judge` tag only.
- Baseline: the 339 original proof-1 judge-4 questions (`q-sonnet-0` 99 + `q-sonnet-1` 99 + `q-haiku` 141), preserved as `flash-q-14.jsonl` (107 outside-skill-folders, 91 prose-directory, 141 skill-folder-only). Reference answers: `traces/judgements/judge-4/**/*.jsonl` (339, exact class reproduction via the question `class` field, as in `check-subscription.py`).
- Method: twelve blind packets of ~30 (11×30 + 1×9) in `.pad/catalogue/calibration-flash/q-flash-{00..11}.jsonl`, max two simultaneous judges on `antigravity/gemini-3.8-flash`. Each judge got only the prompt + its packet; never baseline answers or calibration reports. Scripts only formatted/validated hand answers. One packet later invalidated and retried once (see Correction).

## Correction (director validation): packet 00 invalidated, one blind retry

- Director found the original packet-00 acceptance wrong: 3 distinct reasons / 30 fails the round-brief distinctness minimum (≥ half). The identical-sentence exception applies only to the >20%-reuse rule, not to the distinctness minimum. Accepted as invalid; prior acceptance paragraph superseded.
- Original packet-00 answer preserved but excluded: `.pad/catalogue/calibration-flash/quarantine/a-flash-00-invalid.jsonl` and `docs/catalogue/calibration/flash-a-14-00-quarantined.jsonl`. It is not scored anywhere below.
- Packets 01–11 revalidated independently (ids/order/boolean/judge/model/non-empty reasons + both reason checks separately): all pass. Prior full-12 arithmetic reproduced exactly (107/107, 88/91, 141/141) before exclusion. Excluding packet 00 (all 30 prose-directory) left valid coverage outside 107, prose 61, skill 141 — prose without full coverage, so no gate pass implied at that point.
- One fresh blind retry of the same packet 00 ran under the original prompt and existing rules (no answer baseline), writing `.pad/catalogue/calibration-flash/a-flash-00-retry.jsonl`, preserved durably as `docs/catalogue/calibration/flash-a-14-00-retry.jsonl`. No valid packet rerun. Retry validation: ids/order 30/30, booleans, `judge-14`/`gemini-3.8-flash`, non-empty reasons; CHECK1 distinct 30/30 (need ≥15) PASS; CHECK2 >20%-with-differing-sentences violations none PASS. Judge reported hand decisions, formatting-script only. Retry agreement on its packet: 29/30 (sole disagreement `7fc4cd8a`).

## Final results vs stored judge-4, full valid coverage (retry00 + 01–11; ≥97% per class)

| Class | Agreement | Gate |
| --- | --- | --- |
| outside-skill-folders | 107/107 = 100% | PASS |
| prose-directory | 88/91 = 96.703297% | FAIL |
| skill-folder-only | 141/141 = 100% | PASS |

Total valid: 336/339. No reruns to chase the threshold; the single retry was the one allowed replacement of the invalid packet.

## Disagreements (all prose-directory)

- `7fc4cd8a`: inventory-alignment `references/` description; flash false, judge-4 true (in retry packet).
- `263a340a` and `81ebed0a`: Step-5 rules-directory resolution; flash true, judge-4 false. Same two as the documented judge-8/astra disagreements; baseline and threshold unchanged.

## Artifacts

- `docs/catalogue/calibration/flash-judge-14.md` (prompt)
- `docs/catalogue/calibration/flash-q-14.jsonl` (339 durable questions)
- `docs/catalogue/calibration/flash-a-14-{01..11}.jsonl` + `flash-a-14-00-retry.jsonl` (339 valid durable answers)
- Quarantined/excluded: `docs/catalogue/calibration/flash-a-14-00-quarantined.jsonl` (byte-equal to `.pad/catalogue/calibration-flash/quarantine/a-flash-00-invalid.jsonl`)
- Scratch packets: `.pad/catalogue/calibration-flash/q-flash-{00..11}.jsonl`

No production imports, no edits to `agreement.txt`, no commits, no other agents' files touched. All judges closed. `git diff --check` clean for these files. Provider `antigravity/gemini-3.8-flash` was reachable throughout.
