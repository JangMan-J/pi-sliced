# Subscription calibration: judge-10 and judge-11

Prompts are exact copies of judge-8 and judge-9, respectively, with only their version names replaced. At calibration time historical model names in the copied prompts remained unchanged; assignments explicitly required the actual model ID. The resumed audit corrected only model/gate provenance in the prompt headers, not the decision instructions. All calls used `agent_delegate` (or follow-ups on its live agents), provider `openai-codex`, thinking `medium`. Judges received only their prompt and questions, never stored answers.

## Results against unchanged stored judge-4 answers

| Version | Model | Class | Agreement | Gate |
| --- | --- | --- | --- | --- |
| judge-10 | gpt-6-astra | outside-skill-folders | 107/107 = 100% | PASS |
| judge-10 | gpt-6-astra | prose-directory | 87/91 = 95.604396% | FAIL |
| judge-11 | gpt-6-luna | skill-folder-only | 138/141 = 97.872340% | PASS |

Astra artifacts: `a10-astra-0.jsonl` (99 answers, 70 true, 29 false) and `a10-astra-1.jsonl` (99 answers, 43 true, 56 false). No rerun was made to seek a passing prose-directory result.

Luna artifacts: `a11-luna-small-00.jsonl` through `a11-luna-small-14.jsonl`, paired with `q11-luna-small-*`. These are disjoint, ordered batches of at most ten covering all 141 original q-haiku questions. Aggregate: 129 true, 12 false. Batch 09's agent reported 6 true/4 false, but the actual validated file contains 5 true/5 false; counts here use the file.

Every successful judge reported individual hand decisions and no program-drafted decisions. Count, ID order, JSON parsing, booleans, judge/model IDs, nonempty reasons and reason-diversity checks pass with:

```
python docs/catalogue/calibration/check-subscription.py 10 11
```

The command validates format and prints class gates and full disagreements; a FAIL rate is not a format failure.

## Disagreements

Prose-directory (question ID prefixes):
- `43b5039f`: transitions directory under See Also; Astra true, judge-4 false.
- `caa19dbe`: full transition code, route via catalog.md; Astra false, judge-4 true.
- `263a340a` and `81ebed0a`: concrete details resolve in Step 5; Astra true, judge-4 false. These last two are also documented judge-8 disagreements. Baseline and threshold were not changed.

Skill-folder-only:
- `0325d4d0`: pulled-theme settings schema; Luna true, judge-4 false (user-project collision).
- `9227b6d8`: LUT index location; Luna false, judge-4 true (F7 file mention).
- `c049b4d6`: telemetry implementation mention; Luna false, judge-4 true (F7 file mention).

## Failed attempts and sizing

Luna was reachable, not an unavailable-model error. It refused the 141-question assignment as too large to complete accurately in one response, without producing answers. A fresh-agent retry split the original questions into three ordered 47-question files (`q11-luna-0/1/2.jsonl`); all three again declined to complete within the turn. No decisions were produced; two empty outputs were removed.

The director then authorized a ten-question sizing probe, which completed, followed by the rest in disjoint batches of at most ten. Batch 07 initially failed the reason-diversity rule: one repeated reason covered more than 20% of its lines with different sentences. That invalid attempt is preserved in `quarantine/a11-luna-small-07.jsonl`, excluded from scoring. One fresh blind retry passed. No valid answers were rerun or edited. Every helper is closed.

## Routing and verification

Per the director's decision, judge-10 is appended after judge-4/judge-8 only for outside-skill-folders. judge-11 is appended after judge-4/judge-9 for skill-folder-only. Existing answers retain priority. Prose-directory remains judge-4/judge-8; the round brief explicitly pauses Anthropic calls on that route pending an approved replacement. Batching defaults to 100 for judge-10 and 10 for judge-11, rejecting Luna sizes above ten.

Validation:
- Exact prompt-copy comparison passed.
- All 339 original calibration questions still replay stored answers.
- Synthetic batching of 63 questions passed routing, coverage and Luna size-cap checks without writing batch files.
- Nine trace/classification unit tests passed; frozen hashes passed.
- `scripts/check-trace`: all nine Candidates match confirmed fixtures and blobs.
- `unshare -rn scripts/rederive`: 7,589 byte-identical Classifications, zero problems; 1,493 Determinations in force, zero changed inputs.

Existing calibration answers and stored judgments are untouched. Calibration answers were not imported into judgment stores. No round-1 run, Anthropic call or commit occurred. Remaining work: an approved replacement for prose-directory; its failed Astra calibration must not be bypassed.
