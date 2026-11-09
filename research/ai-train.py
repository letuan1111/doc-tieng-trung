# Walk-forward cho AI: học các tháng trước → chấm tháng sau (không bao giờ chấm dữ liệu đã học), cách ly 1 ngày
# python3 research/ai-train.py research/ai/XAU2Y.csv 1.5 2.0   (file, rr, usd mỗi 1 giá ở 0.02 lot)
import sys, numpy as np, pandas as pd, lightgbm as lgb, warnings; warnings.filterwarnings('ignore')
f, rr, usd = sys.argv[1], sys.argv[2], float(sys.argv[3]); first = int(sys.argv[4]) if len(sys.argv) > 4 else 6
df = pd.read_csv(f); FE = list(df.columns[4:df.columns.get_loc('y1')])
y, R, X = 'y' + rr, 'R' + rr, 'x' + rr
df['m'] = pd.to_datetime(df.t, unit='ms').dt.to_period('M')
P = dict(objective='binary', learning_rate=0.03, num_leaves=15, min_data_in_leaf=120, feature_fraction=0.7, bagging_fraction=0.8, bagging_freq=1, lambda_l2=2.0, verbose=-1, seed=1)
NR = 250
months = sorted(df.m.unique()); oos = []
for i in range(first, len(months)):
    ts = months[i].start_time.value // 10**6
    tr = df[df[X] < ts - 864e5]; te = df[df.m == months[i]]
    if len(te) == 0: continue
    b = lgb.train(P, lgb.Dataset(tr[FE], tr[y]), NR)
    oos.append(te.assign(p=b.predict(te[FE])))
O = pd.concat(oos).sort_values('t')
from sklearn.metrics import roc_auc_score
print('AUC ngoài mẫu', round(roc_auc_score(O[y], O.p),3), '· theo tháng', ' '.join(f'{roc_auc_score(g[y], g.p):.2f}' for _, g in O.groupby('m') if g[y].nunique()>1))
print('Tỉ lệ thắng gốc theo loại:', ', '.join(f"{t}:{100*O[O.types.str.contains(t)][y].mean():.0f}%({(O.types.str.contains(t)).sum()})" for t in ['SWP','SWD','BOX','CHO','BOS','BRK','EMA','FVG']))
days = O.t.apply(lambda v: pd.Timestamp(v, unit='ms').normalize()); nd = days[pd.to_datetime(days).dt.dayofweek < 5].nunique()
def sim(S):
    busy, tk = -1, []
    for i, (t, x) in enumerate(zip(S.t.values, S[X].values)):
        if t <= busy: continue
        tk.append(i); busy = x
    return S.iloc[tk]
print(f'{f} rr={rr} · OOS {months[first]}→{months[-1]} · {len(O)} ứng viên · {nd} ngày giao dịch')
print(f'Không AI (mọi ứng viên, 1 lệnh/lúc): ', end=''); T = sim(O); print(f'{len(T)} lệnh {len(T)/nd:.1f}/ngày thắng {100*T[y].mean():.1f}% R {T[R].sum():+.0f} USD {(T[R]*T.rk*usd).sum():+.0f}')
print('ngưỡng | lệnh | /ngày | thắng% | tổngR | USD | sụt USD | tháng lời/tổng')
for th in [0.40,0.45,0.5,0.55,0.6,0.65,0.7]:
    T = sim(O[O.p >= th])
    if len(T) < 10: continue
    u = T[R]*T.rk*usd; eq = u.cumsum(); dd = (eq.cummax()-eq).max(); mm = T.assign(u=u).groupby('m').u.sum()
    print(f'{th:.2f} | {len(T)} | {len(T)/nd:.2f} | {100*T[y].mean():.1f} | {T[R].sum():+.1f} | {u.sum():+.0f} | {dd:.0f} | {(mm>0).sum()}/{len(mm)}')
O[['t','p',y,R,X,'rk','pri','types','m']].to_csv(f.replace('.csv', f'-oos{rr}.csv'), index=False)
