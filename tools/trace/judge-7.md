# Judge panel, version `judge-7`

A panel that asks no question itself (Jang, rulings c1 N3). For each question it replays the first recorded answer among the judge versions listed for the question's class. A question with no recorded answer goes to the last version in that class's list.

| Class | Replays, in order | New questions go to |
| --- | --- | --- |
| `outside-skill-folders` | `judge-4`, `judge-8`, `judge-10` | `judge-10`: the `judge-8` prompt with version names replaced, run by `openai-codex/gpt-6-astra` in batches of about 100 |
| `prose-directory` | `judge-4`, `judge-8` | `judge-8` |
| `skill-folder-only` | `judge-4`, `judge-9`, `judge-11` | `judge-11`: the `judge-9` prompt with version names replaced, run by `openai-codex/gpt-6-luna` in batches of at most 10 |

Every answer stays in the store of the version that gave it (`traces/judgements/<version>/…`), with its model id. A Trace written under the panel records `judge: "judge-7"`. Every `judge-4` answer stands, so the nine proof-1 Candidates trace exactly as they did under `judge-4`.

## Calibration

Each model was run on the nine proof-1 Candidates' 339 judge-4 questions and compared with the stored `judge-4` answers. A class is used only at 97% or better (`docs/catalogue/calibration/`).

| Version | Model | Class | Agreement |
| --- | --- | --- | --- |
| `judge-5` (the `judge-4` prompt) | sonnet-5-5 | outside-skill-folders | 107/107 = 100% |
| `judge-5` | sonnet-5-5 | prose-directory | 82/91 = 90.1%: not used |
| `judge-6` (the `judge-4` prompt) | haiku-5-5 | skill-folder-only | 139/141 = 98.6%, superseded by `judge-9` |
| `judge-8` (adds the F1/F8 clarifications (i)–(iii), 2026-10-24) | sonnet-5-5 | outside-skill-folders | 107/107 = 100% |
| `judge-8` | sonnet-5-5 | prose-directory | 89/91 = 97.8% |
| `judge-9` (the same prompt) | haiku-5-5 | skill-folder-only | 141/141 = 100% |

Subscription calibration (`docs/catalogue/calibration/subscription-results.md`): `judge-10` passed outside-skill-folders at 107/107 (100%), but failed prose-directory at 87/91 (95.604396%). It is appended only to the passing class; existing answers retain priority. `judge-11` passed skill-folder-only at 138/141 (97.872340%) in batches of at most 10. The unchanged judge-8 route is not permission to make Anthropic calls during the subscription transition.

The two remaining `judge-8` disagreements are `visual-design.md:70`, "motion resolves in Step 5 from the local rules directory". `judge-8` answers true, which is the reading clarification (i) gives. `judge-4` answered false.

The panel's table pointed at `judge-5` and `judge-6` from its creation until this calibration. No `judge-5` or `judge-6` answer was ever stored, so no Trace depends on them.
