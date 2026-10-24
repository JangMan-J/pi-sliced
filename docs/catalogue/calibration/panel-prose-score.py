#!/usr/bin/env python3
"""Score the prose-directory panel against stored judge-4 answers.

Reads only existing calibration files. No model calls, no judgement import,
no edit of agreement.txt or production routing. Derived majority is judge-16.
"""
import hashlib
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / "docs/catalogue/calibration"
JUDGE4 = ROOT / "traces/judgements/judge-4"
OUT_EVIDENCE = BASE / "panel-prose-evidence.jsonl"
OUT_REPORT = BASE / "panel-prose-report.md"
PAD = ROOT / ".pad/catalogue/panel-prose"
QUARANTINE = BASE / "flash-a-14-00-quarantined.jsonl"

PANEL = (
    ("judge-10", "gpt-6-astra"),
    ("judge-13", "grok-4.7-build-fast"),
    ("judge-14", "gemini-3.8-flash"),
)
PENDING = {
    "263a340afc61cb75bc49abd3281a7f359878c798a8223f62cebbf4fbdb0c1755",
    "81ebed0ad9fc42d7c85ee9d5e2e18a2944ae6946de470313064962fc46166d3a",
}
# Published individual prose scores. A mismatch means the wrong packet was loaded.
EXPECTED = {"judge-10": 87, "judge-13": 87, "judge-14": 88}


def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(label, questions, answers, judge, model):
    assert [a["id"] for a in answers] == [q["id"] for q in questions], label
    reasons = defaultdict(list)
    for question, answer in zip(questions, answers):
        assert type(answer["pullsIn"]) is bool, (label, answer["id"])
        assert answer["judge"] == judge and answer["model"] == model, label
        assert isinstance(answer["reason"], str) and answer["reason"].strip(), label
        reasons[answer["reason"]].append(question["sentence"])
    assert len(reasons) >= len(answers) / 2, (label, "distinct", len(reasons), len(answers))
    assert not any(
        len(sentences) > len(answers) * 0.2 and len(set(sentences)) > 1
        for sentences in reasons.values()
    ), (label, "reuse")


def load_judge4():
    found = {}
    files = {}
    for path in sorted(JUDGE4.rglob("*.jsonl")):
        for answer in rows(path):
            assert answer["id"] not in found, answer["id"]
            assert type(answer["pullsIn"]) is bool
            assert answer["judge"] == "judge-4"
            found[answer["id"]] = answer
            files[answer["id"]] = path
    return found, files


def flash_packets():
    questions = rows(BASE / "flash-q-14.jsonl")
    specs = [(BASE / "flash-a-14-00-retry.jsonl", 0, 30)]
    specs += [
        (BASE / f"flash-a-14-{i:02}.jsonl", i * 30, (i + 1) * 30) for i in range(1, 12)
    ]
    loaded = []
    for path, start, end in specs:
        assert path.resolve() != QUARANTINE.resolve()
        chunk = questions[start:end]
        answers = rows(path)
        validate(path.name, chunk, answers, "judge-14", "gemini-3.8-flash")
        loaded.append((path, chunk, answers))
    assert sum(len(chunk) for _, chunk, _ in loaded) == 339
    return loaded


def index_answers(pairs, judge, model):
    indexed = {}
    for path, questions, answers in pairs:
        for question, answer in zip(questions, answers):
            assert question["id"] not in indexed
            indexed[question["id"]] = {
                "path": path,
                "question": question,
                "answer": answer,
                "judge": judge,
                "model": model,
            }
    return indexed


def prose_questions():
    ordered = []
    for name in ("q-sonnet-0.jsonl", "q-sonnet-1.jsonl"):
        for question in rows(BASE / name):
            if question["class"] == "prose-directory":
                ordered.append(question)
    assert len(ordered) == 91
    assert len({q["id"] for q in ordered}) == 91
    return ordered


def majority(votes):
    return sum(votes.values()) >= 2


def reason_for(votes):
    trues = sum(votes.values())
    dissent = [name for name, vote in votes.items() if vote is not (trues >= 2)]
    if not dissent:
        return f"majority {trues}/3 {'true' if trues == 3 else 'false'}"
    who = ", ".join(f"{name} {'true' if votes[name] else 'false'}" for name in dissent)
    return f"majority {trues}/3 {'true' if trues >= 2 else 'false'} ({who})"


def main():
    assert QUARANTINE.is_file()
    assert sha256(BASE / "flash-a-14-00-retry.jsonl") != sha256(QUARANTINE)

    sonnet = [rows(BASE / name) for name in ("q-sonnet-0.jsonl", "q-sonnet-1.jsonl")]
    astra_paths = [BASE / "a10-astra-0.jsonl", BASE / "a10-astra-1.jsonl"]
    astra_pairs = []
    for questions, path in zip(sonnet, astra_paths):
        answers = rows(path)
        validate(path.name, questions, answers, "judge-10", "gpt-6-astra")
        astra_pairs.append((path, questions, answers))

    grok_pairs = []
    for i, questions in enumerate(sonnet):
        path_q = BASE / f"grok-q-{i:02}.jsonl"
        path_a = BASE / f"grok-a-{i:02}.jsonl"
        grok_q = rows(path_q)
        assert [q["id"] for q in grok_q] == [q["id"] for q in questions], path_q.name
        answers = rows(path_a)
        validate(path_a.name, grok_q, answers, "judge-13", "grok-4.7-build-fast")
        grok_pairs.append((path_a, grok_q, answers))

    flash = flash_packets()
    stores = {
        "judge-10": index_answers(astra_pairs, "judge-10", "gpt-6-astra"),
        "judge-13": index_answers(grok_pairs, "judge-13", "grok-4.7-build-fast"),
        "judge-14": index_answers(flash, "judge-14", "gemini-3.8-flash"),
    }
    judge4, judge4_files = load_judge4()
    questions = prose_questions()
    flash_prose = {
        item["question"]["id"]
        for _, chunk, answers in flash
        for item_q, item_a in zip(chunk, answers)
        if item_q["class"] == "prose-directory"
        for item in ({"question": item_q, "answer": item_a},)
    }
    assert flash_prose == {q["id"] for q in questions}
    assert PENDING <= {q["id"] for q in questions}

    per_judge = {name: 0 for name, _ in PANEL}
    evidence = []
    misses = []
    for question in questions:
        baseline = judge4[question["id"]]
        assert baseline["file"] == question["file"]
        assert baseline["line"] == question["line"]
        assert baseline["ref"] == question["ref"]
        votes = {}
        vote_meta = {}
        for name, model in PANEL:
            item = stores[name][question["id"]]
            assert item["question"]["sentence"] == question["sentence"]
            assert item["question"]["class"] == "prose-directory"
            votes[name] = item["answer"]["pullsIn"]
            vote_meta[name] = item
            per_judge[name] += votes[name] == baseline["pullsIn"]
        panel = majority(votes)
        row = {
            "id": question["id"],
            "class": "prose-directory",
            "file": question["file"],
            "line": question["line"],
            "ref": question["ref"],
            "sentence": question["sentence"],
            "pullsIn": panel,
            "reason": reason_for(votes),
            "judge": "judge-16",
            "model": "panel-majority",
            "sources": ["judge-10", "judge-13", "judge-14"],
            "votes": votes,
            "judge4": baseline["pullsIn"],
            "match": panel == baseline["pullsIn"],
        }
        if question["id"] in PENDING:
            row["c4Baseline"] = "pending-miss"
        evidence.append((row, baseline, vote_meta))
        if not row["match"]:
            misses.append((row, baseline, vote_meta))

    for name, expected in EXPECTED.items():
        assert per_judge[name] == expected, (name, per_judge[name], expected)
    for row, baseline, _vote_meta in evidence:
        if row["id"] in PENDING:
            assert baseline["pullsIn"] is False
            assert row["match"] is False

    ok = sum(row["match"] for row, _, _ in evidence)
    lines = [
        json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row, _, _ in evidence
    ]
    text = "\n".join(lines) + "\n"
    OUT_EVIDENCE.write_text(text)
    report = render(questions, evidence, misses, per_judge, ok, judge4_files)
    OUT_REPORT.write_text(report)
    PAD.mkdir(parents=True, exist_ok=True)
    (PAD / "panel-prose-evidence.jsonl").write_text(text)
    (PAD / "panel-prose-report.md").write_text(report)
    print(report)


def pct(ok, count):
    return f"{ok}/{count} = {100 * ok / count:.6f}%"


def gate(ok, count):
    return "PASS" if ok * 100 >= count * 97 else "FAIL"


def render(questions, evidence, misses, per_judge, ok, judge4_files):
    count = len(questions)
    sources = []
    consumed = [
        BASE / "q-sonnet-0.jsonl",
        BASE / "q-sonnet-1.jsonl",
        BASE / "a10-astra-0.jsonl",
        BASE / "a10-astra-1.jsonl",
        BASE / "grok-q-00.jsonl",
        BASE / "grok-a-00.jsonl",
        BASE / "grok-q-01.jsonl",
        BASE / "grok-a-01.jsonl",
        BASE / "flash-q-14.jsonl",
        BASE / "flash-a-14-00-retry.jsonl",
        *[BASE / f"flash-a-14-{i:02}.jsonl" for i in range(1, 12)],
    ]
    for path in consumed:
        sources.append(f"- `{path.relative_to(ROOT)}` `{sha256(path)}`")
    j4_paths = sorted({judge4_files[q["id"]].relative_to(ROOT) for q in questions})
    miss_blocks = []
    for row, baseline, vote_meta in misses:
        votes = []
        for name, _model in PANEL:
            item = vote_meta[name]
            votes.append(
                f"  - {name}/{item['model']}: {str(item['answer']['pullsIn']).lower()} — {item['answer']['reason']}"
            )
        pending = " Pending c4 baseline; counted as a miss." if row["id"] in PENDING else ""
        miss_blocks.append(
            "\n".join(
                [
                    f"- `{row['id'][:8]}` `{row['file']}:{row['line']}` ref `{row['ref']}`.{pending}",
                    f"  - sentence: {row['sentence']}",
                    f"  - judge-4: {str(baseline['pullsIn']).lower()} — {baseline['reason']}",
                    *votes,
                    f"  - judge-16: {str(row['pullsIn']).lower()} ({row['reason']})",
                ]
            )
        )
    individual = "\n".join(
        f"| {name} | {model} | {pct(per_judge[name], count)} | {gate(per_judge[name], count)} |"
        for name, model in PANEL
    )
    return f"""# Prose-directory panel score (judge-16)

No new model calls. Majority of the valid stored answers from judge-10 (Astra), judge-13 (Grok Fast), and judge-14 (Gemini Flash), scored against unchanged judge-4 on the original 91 `prose-directory` questions. Derived version `judge-16` (`model`: `panel-majority`). Not a production route: `tools/trace/judge.ts` still has `prose-directory`: judge-4, judge-8. Nothing was imported under `traces/judgements/`. `agreement.txt` was not edited. Fixtures were not edited.

Flash packet 00 is `flash-a-14-00-retry.jsonl`. `flash-a-14-00-quarantined.jsonl` was not read. Its sha256 differs from the retry.

Question order is the prose-directory rows of `q-sonnet-0.jsonl` then `q-sonnet-1.jsonl` (53 + 38). That set equals the prose-directory rows of `flash-q-14.jsonl`. Each judge-4 row matches the question `file`, `line`, and `ref`. Packet checks, applied to every consumed packet and not only the prose rows: ids in order, boolean `pullsIn`, expected judge and model, non-empty reason, at least half the reasons distinct, no reason reused on more than 20% of lines whose sentences differ.

## Score

| Version | Model | prose-directory | Gate |
| --- | --- | --- | --- |
{individual}
| judge-16 | panel-majority | {pct(ok, count)} | {gate(ok, count)} |

Gate is the existing comparison `ok * 100 >= count * 97`. An individual FAIL does not disqualify the panel. Unanimity is not required; majority is two of three.

Panel {gate(ok, count)} at {pct(ok, count)}. {"The 97% gate is met. Production routing was not changed by this scoring run." if gate(ok, count) == "PASS" else "The 97% gate is not met. No clarified-prompt calibration was started."}

Misses: {count - ok}. The two c4 ids `263a340a` and `81ebed0a` stay misses against judge-4. Their baseline was not changed. See `docs/catalogue/prose-conflicts-c4.md`.

## Misses

{chr(10).join(miss_blocks) if miss_blocks else "(none)"}

## Evidence

`docs/catalogue/calibration/panel-prose-evidence.jsonl`, one derived judge-16 row per question, same order. `pullsIn` is the majority. `votes` holds the three booleans. `match` is equality with judge-4. The two pending baseline ids carry `c4Baseline: pending-miss`.

Judge-4 files touched by these 91 ids:

{chr(10).join(f"- `{path}`" for path in j4_paths)}

Consumed inputs:

{chr(10).join(sources)}
"""


if __name__ == "__main__":
    main()
