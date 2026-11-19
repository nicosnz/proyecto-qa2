import csv, json, sys, statistics as st
from datetime import datetime
csvf, jsonf, niveles = sys.argv[1], sys.argv[2], [int(x) for x in sys.argv[3].split(',')]
vus = {}
with open(jsonf) as f:
    for l in f:
        if '"metric":"vus"' not in l or '"Point"' not in l: continue
        d = json.loads(l); t = int(datetime.fromisoformat(d['data']['time'].replace('Z','+00:00')).timestamp())
        vus[t] = d['data']['value']
t0, t1 = min(vus), max(vus)
rows = list(csv.DictReader(open(csvf)))
grupos = {}
fase_recup = False; visto_max = False; mx = max(niveles)
for r in rows:
    t = int(r['ts'])
    if t < t0: k = 'reposo (antes)'
    elif t > t1 + 2: k = 'reposo (después)'
    else:
        v = vus.get(t) or vus.get(t-1) or vus.get(t+1)
        if v is None: continue
        if v >= mx: visto_max = True
        if v in niveles:
            k = (f'R{int(v)}' if visto_max and v < mx else f'E{int(v)}')
        else: continue
    grupos.setdefault(k, []).append(r)
orden = ['reposo (antes)'] + [f'E{n}' for n in niveles] + [f'R{niveles[0]}'] + ['reposo (después)']
print(f"{'fase':18} {'n':>3} | {'API cpu prom':>12} {'API cpu max':>11} {'API mem':>8} {'API mem max':>11} | {'PG cpu prom':>11} {'PG max':>7} {'PG mem':>7} {'PG procs':>8} | {'k6 cpu':>7} {'k6 mem':>7} | {'sist %':>6}")
for k in orden:
    g = grupos.get(k)
    if not g: continue
    f = lambda c: [float(x[c]) for x in g]
    print(f"{k:18} {len(g):>3} | {st.mean(f('api_cpu')):>11.1f}% {max(f('api_cpu')):>10.1f}% {st.mean(f('api_mem_mb')):>6.0f}MB {max(f('api_mem_mb')):>9.0f}MB | {st.mean(f('pg_cpu')):>10.1f}% {max(f('pg_cpu')):>6.1f}% {st.mean(f('pg_mem_mb')):>5.0f}MB {max(int(x['pg_procs']) for x in g):>8} | {st.mean(f('k6_cpu')):>6.1f}% {st.mean(f('k6_mem_mb')):>5.0f}MB | {st.mean(f('sistema_cpu_pct')):>5.1f}%")
