# Prose-directory panel score (judge-16)

No new model calls. Majority of the valid stored answers from judge-10 (Astra), judge-13 (Grok Fast), and judge-14 (Gemini Flash), scored against unchanged judge-4 on the original 91 `prose-directory` questions. Derived version `judge-16` (`model`: `panel-majority`). Not a production route: `tools/trace/judge.ts` still has `prose-directory`: judge-4, judge-8. Nothing was imported under `traces/judgements/`. `agreement.txt` was not edited. Fixtures were not edited.

Flash packet 00 is `flash-a-14-00-retry.jsonl`. `flash-a-14-00-quarantined.jsonl` was not read. Its sha256 differs from the retry.

Question order is the prose-directory rows of `q-sonnet-0.jsonl` then `q-sonnet-1.jsonl` (53 + 38). That set equals the prose-directory rows of `flash-q-14.jsonl`. Each judge-4 row matches the question `file`, `line`, and `ref`. Packet checks, applied to every consumed packet and not only the prose rows: ids in order, boolean `pullsIn`, expected judge and model, non-empty reason, at least half the reasons distinct, no reason reused on more than 20% of lines whose sentences differ.

## Score

| Version | Model | prose-directory | Gate |
| --- | --- | --- | --- |
| judge-10 | gpt-6-astra | 87/91 = 95.604396% | FAIL |
| judge-13 | grok-4.7-build-fast | 87/91 = 95.604396% | FAIL |
| judge-14 | gemini-3.8-flash | 88/91 = 96.703297% | FAIL |
| judge-16 | panel-majority | 89/91 = 97.802198% | PASS |

Gate is the existing comparison `ok * 100 >= count * 97`. An individual FAIL does not disqualify the panel. Unanimity is not required; majority is two of three.

Panel PASS at 89/91 = 97.802198%. The 97% gate is met. Production routing was not changed by this scoring run.

Misses: 2. The two c4 ids `263a340a` and `81ebed0a` stay misses against judge-4. Their baseline was not changed. See `docs/catalogue/prose-conflicts-c4.md`.

## Misses

- `263a340a` `skills/product-launch-video/references/visual-design.md:70` ref `../../hyperframes-animation/rules/`. Pending c4 baseline; counted as a miss.
  - sentence: Never write ease curves / ms / stagger (those resolve in Step 5 from this skill's local `../../hyperframes-animation/rules/`).
  - judge-4: false — Prohibition aside noting where eases resolve; the sentence does not itself direct reading the directory.
  - judge-10/gpt-6-astra: true — The parenthetical directs resolving concrete animation details from the rules directory in Step 5.
  - judge-13/grok-4.7-build-fast: true — The sentence forbids writing raw eases now because those values resolve in Step 5 from the rules directory, so that later step loads the directory.
  - judge-14/gemini-3.8-flash: true — The sentence directs that ease curves and parameters resolve in Step 5 from the rules directory.
  - judge-16: true (majority 3/3 true)
- `81ebed0a` `skills/faceless-explainer/references/visual-design.md:70` ref `../../hyperframes-animation/rules/`. Pending c4 baseline; counted as a miss.
  - sentence: Never write ease curves / ms / stagger (those resolve in Step 5 from this skill's local `../../hyperframes-animation/rules/`).
  - judge-4: false — Prohibition aside noting where eases resolve, not itself a direction to read the directory.
  - judge-10/gpt-6-astra: true — The parenthetical directs resolving concrete animation details from the rules directory in Step 5.
  - judge-13/grok-4.7-build-fast: true — The sentence forbids writing raw eases now because those values resolve in Step 5 from the rules directory, so that later step loads the directory.
  - judge-14/gemini-3.8-flash: true — The sentence directs that ease curves and parameters resolve in Step 5 from the rules directory.
  - judge-16: true (majority 3/3 true)

## Evidence

`docs/catalogue/calibration/panel-prose-evidence.jsonl`, one derived judge-16 row per question, same order. `pullsIn` is the majority. `votes` holds the three booleans. `match` is equality with judge-4. The two pending baseline ids carry `c4Baseline: pending-miss`.

Judge-4 files touched by these 91 ids:

- `traces/judgements/judge-4/anthropics/skills/dbd4588f9e1033efb41dad4bef2f7947c8993d44.jsonl`
- `traces/judgements/judge-4/figma/mcp-server-guide/056adaf7564d3dc5fa2e1c7828bbec925d5fa6bb.jsonl`
- `traces/judgements/judge-4/heygen-com/hyperframes/00d55a7f1dab0765296793b4da2f3e791b5ce42e.jsonl`
- `traces/judgements/judge-4/openai/plugins/0722921d5542fc593105c27bd52630babd8b8c2a.jsonl`
- `traces/judgements/judge-4/shadcn-ui/ui/e55b60b1014cccfb9ac62f97e0d20b5b649f4a54.jsonl`
- `traces/judgements/judge-4/shopify/shopify-ai-toolkit/a788f6a87cad4be5dfac814605a7288dc9e8f3db.jsonl`

Consumed inputs:

- `docs/catalogue/calibration/q-sonnet-0.jsonl` `22028f346fba54469077bbc2234047e549e9c2f2224ed481f548f4343644eeb5`
- `docs/catalogue/calibration/q-sonnet-1.jsonl` `30378c70d3484772df44a1067e643313acf18a84a924bef92a506bfe3bb64b0a`
- `docs/catalogue/calibration/a10-astra-0.jsonl` `2c61ec9d4da378fd98b03eca9fc2d4952406bf748618efff1324d2cd5756790f`
- `docs/catalogue/calibration/a10-astra-1.jsonl` `97e3d45dae53175471927e511dddb2c58dfeba7ce8cc7080e9c9122b04291b92`
- `docs/catalogue/calibration/grok-q-00.jsonl` `22028f346fba54469077bbc2234047e549e9c2f2224ed481f548f4343644eeb5`
- `docs/catalogue/calibration/grok-a-00.jsonl` `97a05e8dee8148f03ed77f33912e7b4b2b1488933f7ff80c794d4c7b690ba4eb`
- `docs/catalogue/calibration/grok-q-01.jsonl` `30378c70d3484772df44a1067e643313acf18a84a924bef92a506bfe3bb64b0a`
- `docs/catalogue/calibration/grok-a-01.jsonl` `58e37d4fe7d3aec2f6a82b0fc79e312b17e1cc9b3774e2187f35de48b580ed08`
- `docs/catalogue/calibration/flash-q-14.jsonl` `6ff22aff2febb47d840245489d2d032fd484d7ce500d035dbbc5d1b6b1ec9232`
- `docs/catalogue/calibration/flash-a-14-00-retry.jsonl` `d10f6a0e7f79e86a358728e6e6786b41ac7e66a27946e011fe59908c30883305`
- `docs/catalogue/calibration/flash-a-14-01.jsonl` `abe05146ae5ec3bb493a28bce40f40fab93481a4fa00e2aa49fbf56fd9f45dea`
- `docs/catalogue/calibration/flash-a-14-02.jsonl` `a10b5c287e00b85c89976baac6c334fd999b8ad4e186122de4afccf4abca5c70`
- `docs/catalogue/calibration/flash-a-14-03.jsonl` `d02f199aa0413d75d4c1519756033ec513ca8c423cb7e5920621da617a680d81`
- `docs/catalogue/calibration/flash-a-14-04.jsonl` `7bf8dbae7f33252fa2bd54221a6919f7e7a6c2b669711380f3e2423b553cc345`
- `docs/catalogue/calibration/flash-a-14-05.jsonl` `503e1dbe7998dd2a9f257b1fab6159f9b92a2e540b59a22b5a01a50aef4cd83b`
- `docs/catalogue/calibration/flash-a-14-06.jsonl` `16d5868af824cfae515b4c124882056c1a984ffd1636af2f20c6a0eaec94330d`
- `docs/catalogue/calibration/flash-a-14-07.jsonl` `561b96a08bda320e6c77722d6f63a53cae4774af93f974a557b078228fcadcc0`
- `docs/catalogue/calibration/flash-a-14-08.jsonl` `98abaf53d86c50971f75fde3d3eb65b074ebf4179ab6bff1de969f7894ac2ac0`
- `docs/catalogue/calibration/flash-a-14-09.jsonl` `96966e5d20984daaa2423f446eaf21bd12606e937530ea00e500e668f8451ffe`
- `docs/catalogue/calibration/flash-a-14-10.jsonl` `d647e8f8c39269ab50fa1c7c5ee77dd8d2ce8bfde4882c7bd42d1bc5b447b36a`
- `docs/catalogue/calibration/flash-a-14-11.jsonl` `c59a63165fdf30f734f7a5a20651626d403fa716f5405f00cca25bc3b7f16c1d`
