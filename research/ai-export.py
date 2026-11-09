# Huấn luyện AI cuối cùng + báo cáo walk-forward (ensemble 3 hạt giống) → tin-hieu/ai-model.json
# python3 research/ai-export.py research/ai/XAU2Ym15.csv 1 0.55
import sys, json, numpy as np, pandas as pd, lightgbm as lgb, warnings; warnings.filterwarnings('ignore')
from sklearn.metrics import roc_auc_score
f, rr, TH = sys.argv[1], sys.argv[2], float(sys.argv[3]); usd = 2.0
df = pd.read_csv(f); FE = list(df.columns[4:df.columns.get_loc('y1')]); y, R, X = 'y' + rr, 'R' + rr, 'x' + rr
df['m'] = pd.to_datetime(df.t, unit='ms').dt.to_period('M')
P = dict(objective='binary', learning_rate=0.03, num_leaves=15, min_data_in_leaf=120, feature_fraction=0.7, bagging_fraction=0.8, bagging_freq=1, lambda_l2=2.0, verbose=-1)
NR, SEEDS = 250, [1, 2, 3]
fit = lambda d, s: lgb.train({**P, 'seed': s}, lgb.Dataset(d[FE], d[y]), NR)
months = sorted(df.m.unique()); oos = []
for i in range(6, len(months)):
    ts = months[i].start_time.value // 10**6; tr = df[df[X] < ts - 864e5]; te = df[df.m == months[i]]
    oos.append(te.assign(p=np.mean([fit(tr, s).predict(te[FE]) for s in SEEDS], axis=0)))
O = pd.concat(oos).sort_values('t')
def sim(S):
    busy, tk = -1, []
    for i, (t, x) in enumerate(zip(S.t.values, S[X].values)):
        if t <= busy: continue
        tk.append(i); busy = x
    return S.iloc[tk]
nd = len({pd.Timestamp(t, unit='ms').normalize() for t in O.t if pd.Timestamp(t, unit='ms').dayofweek < 5})
rep = {'auc': round(roc_auc_score(O[y], O.p), 3), 'from': str(months[6]), 'to': str(months[-1]), 'days': nd, 'rr': float(rr), 'rows': []}
base = sim(O); rep['base'] = dict(n=len(base), perDay=round(len(base)/nd, 2), win=round(100*base[y].mean(), 1), R=round(base[R].sum(), 1), usd=round((base[R]*base.rk*usd).sum()))
for th in [0.5, 0.55, 0.6, 0.65]:
    T = sim(O[O.p >= th]); u = T[R]*T.rk*usd; eq = u.cumsum(); mm = T.assign(u=u).groupby('m').u.sum()
    rep['rows'].append(dict(thr=th, n=len(T), perDay=round(len(T)/nd, 2), win=round(100*T[y].mean(), 1), R=round(T[R].sum(), 1), usd=round(u.sum()), dd=round((eq.cummax()-eq).max()), months=f'{(mm>0).sum()}/{len(mm)}'))
    if th == TH: rep['monthly'] = {str(k): round(v) for k, v in mm.items()}
for r in rep['rows']: print(r)
print('base', rep['base'], 'AUC', rep['auc'])
TS = {}
for t in ['SWP', 'SWD', 'BOX', 'CHO', 'BOS', 'BRK', 'EMA', 'FVG']:
    s = O[O.types.str.contains(t)]; a = s[s.p >= TH]
    TS[t] = dict(take=round(100*len(a)/max(len(s), 1)), win=round(100*a[y].mean()) if len(a) else None, base=round(100*s[y].mean()))
print(TS)
# mô hình cuối: học trên toàn bộ 2 năm
def conv(n):
    if 'leaf_value' in n: return round(n['leaf_value'], 7)
    return [n['split_feature'], float(n['threshold']), 1 if n['default_left'] else 0, conv(n['left_child']), conv(n['right_child']), 2 if n['missing_type'] == 'NaN' else 0]
models = []
for s in SEEDS:
    b = fit(df, s); models.append({'trees': [conv(t['tree_structure']) for t in b.dump_model()['tree_info']]})
    if s == 1: imp = sorted(zip(FE, b.feature_importance('gain')), key=lambda z: -z[1])[:15]
print('Quan trọng nhất:', [(a, round(b)) for a, b in imp])
M = {'version': 'ai-2026-11-10', 'base': 'm15', 'rr': float(rr), 'thr': TH, 'feats': FE, 'trained': f'{df.m.min()}→{df.m.max()} · {len(df)} ứng viên', 'report': rep, 'typeStats': TS, 'top': [a for a, _ in imp], 'models': models}
json.dump(M, open('tin-hieu/ai-model.json', 'w'), separators=(',', ':'))
# kiểm khớp JS: lưu 200 dòng mẫu + xác suất python
smp = df.sample(200, random_state=0); smp.assign(pp=np.mean([lgb.Booster(model_str=None) if False else 0 for _ in [0]])).head(0)
pp = np.mean([fit(df, s).predict(smp[FE]) for s in SEEDS], axis=0)
json.dump({'X': smp[FE].values.tolist(), 'p': pp.tolist()}, open('/tmp/ai-check.json', 'w'))
# xác suất ngoài mẫu của từng ứng viên → dùng để dựng lịch sử thật (không dùng mô hình cuối, tránh kết quả "trong mẫu")
json.dump([[int(t), int(d), round(float(p), 4)] for t, d, p in zip(O.t, O.d, O.p)], open('research/ai/oos-p.json', 'w'))
