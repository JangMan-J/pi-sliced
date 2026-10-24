"""Validate blind calibration artifacts and compare them with stored judge-4 answers.
Run from the repository root; this never drafts or modifies judgments.
"""
import collections
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / 'docs/catalogue/calibration'

def rows(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]

reference = {}
for path in (ROOT / 'traces/judgements/judge-4').rglob('*.jsonl'):
    for answer in rows(path):
        if answer['id'] in reference:
            assert reference[answer['id']]['pullsIn'] == answer['pullsIn']
        reference[answer['id']] = answer

specs = {
    '10': [('q-sonnet-0.jsonl', 'a10-astra-0.jsonl'),
           ('q-sonnet-1.jsonl', 'a10-astra-1.jsonl')],
    '11': [(f'q11-luna-small-{i:02}.jsonl', f'a11-luna-small-{i:02}.jsonl') for i in range(15)],
    '13': [(f'grok-q-{i:02}.jsonl', f'grok-a-{i:02}.jsonl') for i in range(4)],
    '12': [('muse-12-prose.q.jsonl', 'muse-12-prose-retry.a.jsonl')] +
          [(f'muse-12-other-{i:02}.q.jsonl', f'muse-12-other-{i:02}.a.jsonl') for i in range(3)],
}
for selection in sys.argv[1:]:
    version, _, batch = selection.partition(':')
    selected = specs[version] if not batch else [specs[version][int(batch)]]
    model = {'10': 'gpt-6-astra', '11': 'gpt-6-luna', '12': 'muse-spark-1.3', '13': 'grok-4.7-build-fast'}[version]
    results = collections.defaultdict(lambda: [0, 0])
    disagreements = []
    for qfile, afile in selected:
        questions, answers = rows(BASE / qfile), rows(BASE / afile)
        assert [a['id'] for a in answers] == [q['id'] for q in questions], afile
        reasons = collections.defaultdict(list)
        for q, a in zip(questions, answers):
            assert type(a['pullsIn']) is bool
            assert a['judge'] == f'judge-{version}' and a['model'] == model
            assert isinstance(a['reason'], str) and a['reason'].strip()
            reasons[a['reason']].append(q['sentence'])
            expected = reference[a['id']]['pullsIn']
            results[q['class']][1] += 1
            results[q['class']][0] += a['pullsIn'] == expected
            if a['pullsIn'] != expected:
                disagreements.append({'question': q, 'answer': a, 'judge4': reference[a['id']]})
        assert len(reasons) >= len(answers) / 2, (afile, 'too few distinct reasons')
        assert not any(len(sentences) > len(answers) * .2 and len(set(sentences)) > 1
                       for sentences in reasons.values()), (afile, 'repeated reasons')
        true = sum(a['pullsIn'] for a in answers)
        print(f'VALID {afile}: {len(answers)} answers, {true} true, {len(answers)-true} false')
    for cls, (ok, count) in sorted(results.items()):
        print(f'judge-{version} {cls}: {ok}/{count} = {100*ok/count:.6f}% '
              f'{"PASS" if ok*100 >= count*97 else "FAIL"}')
    for disagreement in disagreements:
        print('DISAGREEMENT ' + json.dumps(disagreement))
