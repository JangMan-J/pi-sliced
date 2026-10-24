# Judge panel, version `judge-7`

A panel that asks no question itself (Jang, rulings c1 N3). For each question it replays the first recorded answer among the judge versions listed for the question's class. A question with no recorded answer goes to the last version in that class's list.

| Class | Replays, in order | New questions go to |
| --- | --- | --- |
| `outside-skill-folders` | `judge-4`, `judge-5` | `judge-5`: the `judge-4` prompt, run by `anthropic/claude-sonnet-5-5` in batches of about 100 |
| `prose-directory` | `judge-4`, `judge-5` | `judge-5` |
| `skill-folder-only` | `judge-4`, `judge-6` | `judge-6`: the `judge-4` prompt, run by `anthropic/claude-haiku-5-5` (the user-project collision check) |

Every answer stays in the store of the version that gave it (`traces/judgements/<version>/…`), with its model id. A Trace written under the panel records `judge: "judge-7"`. Every `judge-4` answer stands, so the nine proof-1 Candidates trace exactly as they did under `judge-4`. `judge-5` and `judge-6` are used only after calibration against the stored `judge-4` answers reaches 97% agreement or better in each class.
