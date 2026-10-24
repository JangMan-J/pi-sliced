# Judge-15 calibration: openai-codex/gpt-6-luna, prose-directory only

Blind calibration of `gpt-6-luna` against the original 91 proof-1 `prose-directory` questions and stored judge-4 answers. Scratch prompt: `.pad/catalogue/calibration-luna-prose/judge-15.md`, preserved as `luna-prose-judge-15.md`. Decision instructions match `tools/trace/judge-10.md`; the diff is the version name (`judge-15`), the model provenance (`gpt-6-luna`, `openai-codex`, prose-directory only, batches of at most 10), and the output `judge` tag. No agreement rate is in the prompt.

`pi auth check --provider openai-codex --model gpt-6-luna` was `ready` before the runs. Eleven fresh judges, `agent_delegate`, model `openai-codex/gpt-6-luna`, thinking `medium`, at most two at once. Each received only the prompt and one question packet. None received stored answers or calibration reports. Transcripts show each answer file written by hand. Scripts only read `$PI_MODEL` or checked format after the lines were written. No judge reported a script that drafted or proposed answers.

Packets are ten files, nine of 10 questions and one of 1, spread so identical sentences are not piled into one packet. That spread is only so a repeated reason on identical sentences can still leave at least half the reasons distinct. The preserved question set `luna-prose-q.jsonl` is the original 91 in source order (`q-sonnet-0` then `q-sonnet-1`, class `prose-directory` only). Every packet question object equals that set. Union of packet ids is those 91 ids, once each.

## Format

Every scored packet passed: one JSON line per question, ids in order, boolean `pullsIn`, `judge` = `judge-15`, `model` = `gpt-6-luna`, nonempty reasons, at least half the reasons distinct, and no reason used on more than 20% of lines whose sentences differ. Packet 07 reuses one reason on two non-identical sentences; two is not more than 20% of ten, so that check passes.

Packet 01's first answer failed format: the id `1a054b2461…` was written with an extra character. That file is quarantined (`luna-prose-a-01-quarantined.jsonl` and `.pad/catalogue/calibration-luna-prose/quarantine/a-01-invalid.jsonl`) and is not scored. One fresh blind retry of the same packet passed. No valid packet was rerun.

## Result

| Version | Model | Class | Agreement | Gate |
| --- | --- | --- | --- | --- |
| judge-15 | gpt-6-luna | prose-directory | 81/91 = 89.010989% | FAIL |

Gate arithmetic is `ok * 100 >= count * 97`. 81 × 100 = 8100, 91 × 97 = 8827, so this fails. A pass needs 89/91. Luna's answers: 52 true, 39 false. Judge-4 on the same 91: 60 true, 31 false.

The five identical-sentence splits below do not decide the gate. If those five had matched judge-4, the score would be 86/91 = 94.505495%, still short of 89.

## Disagreements

All ten are prose-directory. Luna false, judge-4 true, except `263a340a`.

Five are the same sentence, "Use `../examples/` for orchestration patterns, not as the canonical source of path names." Judge-4 is true. The other 27 copies of that sentence, in other packets, were true. These five were false:

- `06dabfcf7f6c26b20c5a80017dc1e0a448187ed21c5f691d9000d9aceab005d9` packet 00, `plugins/zoom/skills/rest-api/references/whiteboard.md:15`
- `2ceeb5ff4ce974af70ee4bd4e79d6f8b3f6d4aa927f3dfb9af3f7ffc27147b56` packet 00, `contact-center.md:15`
- `9ee0f675d077db422c16e630639e0d8b2c7d4132446e837ae73011bba812a220` packet 00, `zoom-docs.md:15`
- `e5d92e6dfcf7187771a4e3b59dbbac7a131beac3b1eb6f77161f7a91bc1a287d` packet 00, `events.md:15`
- `29150d705a650d252ed9727da4ee547c50defe7945d318537a079b685ca5424f` packet 09, `crc.md:15`

The other five:

- `ccabfa3e139d54e227c85d436f2ba67b6ffc63f19137bc4f506ecd66dcb5895e` packet 00, `skills/hyperframes/references/capability-menu.md:20`, `motion-graphics/categories/maps/`. Luna false, judge-4 true. Luna read the table cell as a listing, not a direction to use the directory.
- `e6ba3f5220546eb0c887c8bca878a1ddee172fc11cc793690e047a4c2e655c47` packet 02, `skills/hyperframes-core/SKILL.md:56`, `hyperframes-animation/adapters/`. Luna false, judge-4 true. Luna treated the directory as a named destination.
- `263a340afc61cb75bc49abd3281a7f359878c798a8223f62cebbf4fbdb0c1755` packet 04, `skills/product-launch-video/references/visual-design.md:70`. "Never write ease curves / ms / stagger (those resolve in Step 5 from this skill's local `../../hyperframes-animation/rules/`)." Luna true, judge-4 false. This is one of the two sentences already recorded as a judge-8 / judge-10 / judge-13 / judge-14 disagreement. The twin `81ebed0a` (faceless-explainer, same sentence) was false here, matching judge-4.
- `caa19dbe867136da5946c1229a68f8edabadf576a6dab960797080813e9b0bb8` packet 08, `skills/hyperframes-creative/references/beat-direction.md:74`, `skills/hyperframes-animation/transitions/`. "Full code in `skills/hyperframes-animation/transitions/` (route via `catalog.md`)." Luna false, judge-4 true.
- `ec30aab799e602a987009a326c76ba6302f4b3afd0bb990d178a161ac7b8be27` packet 08, `skills/product-launch-video/references/visual-design.md:109`. The frame-worker row says the worker reads `../../hyperframes-animation/rules/` and "you don't." Luna false, judge-4 true.

## Not done

`docs/catalogue/calibration/agreement.txt` was not edited. No judgment import, no production judge routing, no commit. Prose-directory does not clear the 97% gate, so this model is not enabled for that class by this run. The prompt was not changed after the result, and no other model was started.

## Artifacts

- `docs/catalogue/calibration/luna-prose-judge-15.md`
- `docs/catalogue/calibration/luna-prose-q.jsonl` (original 91, source order)
- `docs/catalogue/calibration/luna-prose-q-00.jsonl` through `luna-prose-q-09.jsonl`
- `docs/catalogue/calibration/luna-prose-a-00.jsonl` through `luna-prose-a-09.jsonl` (01 is the valid retry)
- Quarantined, not scored: `docs/catalogue/calibration/luna-prose-a-01-quarantined.jsonl`
- Scratch: `.pad/catalogue/calibration-luna-prose/`
