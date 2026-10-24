# Contract: Determination store, format `pi-sliced.determination/1`

Records live in `determinations/<owner>/<repo>/<name>.jsonl`, one JSON record per line. The store is append-only: a record is never edited or deleted, and a new decision is a new record.

Each record has these fields:
- `format`, `id`: the id is the sha256 of the record without `id`, with the keys in the order shown here. An edited record no longer hashes to its id.
- `candidate`, `revision`.
- `trace: {path, sha256}` and `classification: {path, sha256}`: the exact bytes the decision read.
- `decision`: an object. Its schema is set by the Determination criteria for proof 9.
- `reason`: non-empty.
- `time`: ISO 8601 UTC.
- `author: {kind: "model" | "human", id}`: the model id or the human's name.
- `supersedes` (optional): the id of an earlier record of the same Candidate.

**Record in force:** the last record that no later record supersedes.

**`scripts/rederive`:** it replays Determinations and never regenerates them. It lists every Determination in force whose Trace or Classification sha256 differs from the current ones.
