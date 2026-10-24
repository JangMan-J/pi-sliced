# Judge-13 calibration: xai/grok-4.7-build-fast

Blind calibration against the original 339 proof-1 questions and stored judge-4 answers (107 outside-skill-folders, 91 prose-directory, 141 skill-folder-only). The scratch prompt is `grok-judge-13.md` (also `.pad/catalogue/calibration-grok/judge-13.md`). Its decision instructions match `tools/trace/judge-10.md`; only the version name and model provenance differ. No agreement rate was in the prompt.

Four fresh judges, `agent_delegate`, model `xai/grok-4.7-build-fast`, thinking `medium`, at most two at once. Each received only the prompt and one question packet. None received stored answers or calibration reports. All four reported hand decisions; scripts only wrote or checked format. `pi auth check --provider xai --model grok-4.7-build-fast` was `ready` before the runs, and every judge finished on that model.

## Results

| Version | Model | Class | Agreement | Gate |
| --- | --- | --- | --- | --- |
| judge-13 | grok-4.7-build-fast | outside-skill-folders | 107/107 = 100% | PASS |
| judge-13 | grok-4.7-build-fast | prose-directory | 87/91 = 95.604396% | FAIL |
| judge-13 | grok-4.7-build-fast | skill-folder-only | 141/141 = 100% | PASS |

Packets, in original question order: `grok-q-00`/`grok-a-00` (q-sonnet-0, 99: 70 true, 29 false), `grok-q-01`/`grok-a-01` (q-sonnet-1, 99: 41 true, 58 false), `grok-q-02`/`grok-a-02` (q-haiku lines 1–71: 69 true, 2 false), `grok-q-03`/`grok-a-03` (q-haiku lines 72–141: 61 true, 9 false). Ids match the original 339, once each.

Format checks passed on every packet: one JSON line per question, ids in order, boolean `pullsIn`, `judge` = `judge-13`, `model` = `grok-4.7-build-fast`, nonempty reasons, at least half the reasons distinct, and no reason used on more than 20% of lines with differing sentences. No valid packet was rerun. The prose-directory miss stands.

## Disagreements

All four are prose-directory:

- `e25d4fbd` `skills/shadcn/design-system.md:340` `assets/showcase/`. "Copy the helpers from `assets/showcase/`…". Grok false, judge-4 true. Grok treated the directory as the location of three named files.
- `1b16c07d` `skills/media-use/references/audio.md:18` `audio/references/`. "see the per-topic guides in `audio/references/`…". Grok false, judge-4 true. Same location reading.
- `263a340a` `skills/product-launch-video/references/visual-design.md:70` and `81ebed0a` `skills/faceless-explainer/references/visual-design.md:70`, same sentence: "Never write ease curves / ms / stagger (those resolve in Step 5 from this skill's local `../../hyperframes-animation/rules/`)". Grok true, judge-4 false. These two are the documented judge-8 and judge-10 disagreements. Baseline and threshold were not changed.

## Not done

`docs/catalogue/calibration/agreement.txt` was not edited. No judgment import, no production judge routing, no commit. Prose-directory does not clear the 97% gate, so this model is not enabled for that class by this run.
