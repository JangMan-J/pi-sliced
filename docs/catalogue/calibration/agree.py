import json,glob,collections,sys
j4={}
for f in glob.glob('traces/judgements/judge-4/**/*.jsonl',recursive=True):
    for l in open(f):
        a=json.loads(l); j4[a['id']]=a['pullsIn']
qs={}
for f in glob.glob('docs/catalogue/calibration/q-*.jsonl'):
    for l in open(f): q=json.loads(l); qs[q['id']]=q
res=collections.defaultdict(lambda:[0,0]); dis=[]
for f in sorted(glob.glob('docs/catalogue/calibration/a-*.jsonl')):
    for l in open(f):
        a=json.loads(l); q=qs[a['id']]; c=q['class']
        res[c][1]+=1
        if a['pullsIn']==j4[a['id']]: res[c][0]+=1
        else: dis.append((c,a['pullsIn'],j4[a['id']],q['file'].split('/')[-1],q['line'],q['ref'],a['reason'][:140]))
for c,(ok,n) in sorted(res.items()): print(f"{c}: {ok}/{n} = {100*ok/n:.1f}%")
for d in dis: print('  DIS',d)
