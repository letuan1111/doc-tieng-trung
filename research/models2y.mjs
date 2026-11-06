// Chạy lại đúng các mô hình trên web trên 2 năm (vàng / dầu): 🔁 EMA hồi (luật EA), 🧲 Test EMA21 M30 (luật EA), B "TP về EMA34 M15", và gói EA (E + R, 1 lệnh một lúc)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
import { DIR, load, ema, atr, pivots, mapHTF, resample } from './core.mjs';
const req = createRequire(import.meta.url), EMAPB = req(path.join(DIR, '..', 'tin-hieu', 'emapb.js')), EMA21 = req(path.join(DIR, '..', 'tin-hieu', 'ema21.js'));
const SYM = process.argv[2] || 'XAU2Y', OIL = SYM === 'OIL', K = OIL ? 0.025 : 1, SP = OIL ? 0.03 : 0.35, USD = OIL ? 20 : 2, NM = OIL ? 'Dầu WTI' : 'Vàng', dp = OIL ? 2 : 1;
const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), m30 = resample(m15, 18e5), n = m5.length;
const VN = 7 * 36e5, hr = (t) => new Date(t + VN).getUTCHours(), pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const T0 = m15[300].t, T1 = m15[m15.length - 1].t, Q = (t) => Math.min(3, Math.floor(4 * (t - T0) / (T1 - T0))); // 4 quý 6 tháng
const days = new Set(m15.filter(x => x.t >= T0).map(x => new Date(x.t + VN).toISOString().slice(0, 10))).size;
const one = (L) => { const out = []; let free = 0; for (const x of L.sort((a, b) => a.t - b.t)) if (x.t >= free && x.exitT) { out.push(x); free = x.exitT; } return out; };
// E
const E = one(EMAPB.run({ m5, m15, emaC: m30 }, { spread: SP, cfg: { maxSL: 30 * K } }).filter(s => s.t >= T0 && s.tgOK && s.exitT).map(s => ({ t: s.fillT, exitT: s.exitT, d: s.side, res: s.state, pts: s.pts, risk: s.risk, rew: s.risk * 2 })));
// R
const R = one(EMA21.run({ m5, m15 }, { spread: SP, cfg: { maxSL: 15 * K, minSL: 0.5 * K } }).filter(s => s.t >= T0 && s.exitT).map(s => ({ t: s.ct, exitT: s.exitT, d: s.side, res: s.state, pts: s.pts, risk: s.risk, rew: Math.abs(s.tp - s.entry) })));
// B
const B34 = mapHTF(m5, m15, ema(m15.map(x => x.c), 34)), B89 = mapHTF(m5, m15, ema(m15.map(x => x.c), 89)), AT = mapHTF(m5, m15, atr(m15)), pv = pivots(m5, 2), Bt = [];
{ let ih = 0, il = 0, busy = -1; const sh = [], sl = [];
  for (let k = 300; k < n - 2; k++) { while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
    const x = m5[k]; if (x.t < T0 || k <= busy || B34[k] == null) continue; const a = AT[k], dist = (x.c - B34[k]) / a; if (Math.abs(dist) < 0.8) continue;
    const d = dist > 0 ? -1 : 1; if (Math.sign(B34[k] - B89[k]) !== -d) continue;
    let xi = k; for (let u = k - 24; u <= k; u++) if (d < 0 ? m5[u].h > m5[xi].h : m5[u].l < m5[xi].l) xi = u; if (k - xi > 12) continue; const xP = d < 0 ? m5[xi].h : m5[xi].l;
    const p = m5[k - 1]; if (!(d < 0 ? x.c < x.o && x.c < p.l && p.c > p.o : x.c > x.o && x.c > p.h && p.c < p.o)) continue;
    const Qp = (d < 0 ? sh : sl).filter(q => q.i < xi && q.i >= xi - 72).slice(-1)[0]; if (!(Qp && (d < 0 ? xP > Qp.p : xP < Qp.p))) continue;
    const b = m5[k + 1], e = d > 0 ? b.o + SP : b.o, tp = B34[k] - d * 2 * K, rew = d * (tp - e); if (!(rew > 0.5 * K)) continue;
    const slP = xP - d * (0.5 * K + (d < 0 ? SP : 0)), risk = d * (e - slP); if (!(risk > 0) || risk > 15 * K) continue;
    let res = null, ex = null, u = k + 1; for (; u < Math.min(n, k + 49); u++) { const y = m5[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= slP : hi >= slP) { res = 'LOSS'; ex = slP; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = 'WIN'; ex = tp; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'TIME'; ex = d > 0 ? m5[u].c : m5[u].c + SP; } busy = u; Bt.push({ t: b.t, exitT: m5[u].ct, d, res, pts: d * (ex - e), risk, rew, dist: Math.abs(dist) }); } }
const EA = one([...E.map(x => ({ ...x, m: 'E' })), ...R.map(x => ({ ...x, m: 'R' }))]);
const rep = (nm, L) => { const w = L.filter(x => x.res === 'WIN').length, U = (f) => L.filter(f).reduce((a, x) => a + x.pts * USD, 0); let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; for (const x of L) { eq += x.pts * USD; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = x.pts < 0 ? ls + 1 : 0; ml = Math.max(ml, ls); }
  const q = [0, 1, 2, 3].map(i => { const G = L.filter(x => Q(x.t) === i); return { n: G.length, wr: pct(G.filter(x => x.res === 'WIN').length, G.length), usd: Math.round(G.reduce((a, x) => a + x.pts * USD, 0)) }; });
  const H = [...Array(24).keys()].map(h => { const G = L.filter(x => hr(x.t) === h); return { h, n: G.length, wr: pct(G.filter(x => x.res === 'WIN').length, G.length), usd: Math.round(G.reduce((a, x) => a + x.pts * USD, 0)) }; });
  const r = { nm, n: L.length, pd: L.length / days, wr: pct(w, L.length), tp: w, sl: L.filter(x => x.res === 'LOSS').length, to: L.filter(x => x.res === 'TIME').length, slA: L.reduce((a, x) => a + x.risk, 0) / (L.length || 1), tpA: L.reduce((a, x) => a + x.rew, 0) / (L.length || 1), usd: Math.round(U(() => true)), dd: Math.round(dd), ml, q, H };
  console.log(`${q.every(z => z.usd > 0) ? '✓' : ' '} ${nm.padEnd(40)} ${String(r.n).padStart(5)} lệnh (${r.pd.toFixed(1)}/ngày) · TP ${r.tp} SL ${r.sl} hết giờ ${r.to} · thắng ${r.wr}% · SL TB ${r.slA.toFixed(dp + 1)} / TP TB ${r.tpA.toFixed(dp + 1)} · 0.02 lot ${r.usd >= 0 ? '+' : ''}${r.usd}$ · DD ${r.dd}$ · thua l.t. ${ml}\n     4 quý 6 tháng: ` + q.map((z, i) => `Q${i + 1} ${z.n}L ${z.wr}% ${z.usd >= 0 ? '+' : ''}${z.usd}$`).join(' · ')); return r; };
console.log(`######## ${NM} · ${new Date(T0).toISOString().slice(0, 10)} → ${new Date(T1).toISOString().slice(0, 10)} · ${days} ngày · spread ${SP} · 0.02 lot = ${USD}$ mỗi 1.0 giá`);
const OUT = { sym: SYM, days, models: [rep('🔁 EMA hồi (luật EA, giờ tốt)', E), rep('🧲 Test EMA21 M30 (luật EA)', R), rep('B · TP về EMA34 M15', Bt), rep('Gói EA (EMA hồi + Test EMA21, 1 lệnh)', EA)] };
// B theo khoảng cách
OUT.bDist = [[0.8, 1.2], [1.2, 2], [2, 3], [3, 3.5], [3.5, 99]].map(([a, b]) => { const G = Bt.filter(x => x.dist >= a && x.dist < b); return { a, b, n: G.length, wr: pct(G.filter(x => x.res === 'WIN').length, G.length), usd: Math.round(G.reduce((s, x) => s + x.pts * USD, 0)) }; });
console.log('  B theo khoảng cách tới EMA34 M15: ' + OUT.bDist.map(z => `${z.a}–${z.b > 50 ? '∞' : z.b} ATR ${z.n}L ${z.wr}% ${z.usd}$`).join(' · '));
fs.writeFileSync(path.join(DIR, 'data', `models2y_${SYM}.json`), JSON.stringify(OUT));
