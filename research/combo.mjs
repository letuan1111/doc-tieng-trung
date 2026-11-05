// Ghép 2 phương pháp trên vàng 12 tháng, 0.02 lot:
//  A "Chờ hồi về EMA" = Test EMA21 M30 (tin-hieu/ema21.js, đúng logic EA)
//  B "TP về EMA"      = Nhấn chìm M5 về EMA34 M15 (research/toema-check.mjs: cùng xu hướng M15 + quét + cách ≥0.8 ATR, TP EMA34−2, SL ngoài cực trị +0.5, giữ ≤4h)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
import { DIR, load, ema, atr, pivots, mapHTF } from './core.mjs';
const EMA21 = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'ema21.js'));
const SP = 0.35, FROM = Date.UTC(2025, 10, 5), END = Date.UTC(2026, 10, 5), S = Date.UTC(2026, 4, 5), USD = 2;
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), n = m5.length;
const vn = (t) => new Date(t + 7 * 36e5), hr = (t) => vn(t).getUTCHours(), day = (t) => vn(t).toISOString().slice(0, 10), fmtT = (t) => vn(t).toISOString().slice(5, 16).replace('T', ' ');
// ---- A
const A = EMA21.run({ m5, m15 }, { spread: SP }).filter(s => s.t >= FROM && s.exitT).map(s => ({ m: 'A', t: s.ct, exitT: s.exitT, d: s.side, e: s.entry, sl: s.sl, tp: s.tp, res: s.state === 'WIN' ? 'TP' : s.state === 'LOSS' ? 'SL' : 'Hết giờ', pts: s.pts, risk: s.risk, rew: Math.abs(s.tp - s.entry), note: `test EMA21 M30 ${s.ema21.toFixed(1)}` }));
// ---- B (độc lập: mỗi lần 1 lệnh của B)
const B34 = mapHTF(m5, m15, ema(m15.map(x => x.c), 34)), B89 = mapHTF(m5, m15, ema(m15.map(x => x.c), 89)), AT = mapHTF(m5, m15, atr(m15)), pv = pivots(m5, 2);
const B = []; { let ih = 0, il = 0, busy = -1; const sh = [], sl = [];
  for (let k = 300; k < n - 2; k++) { while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
    const x = m5[k]; if (x.t < FROM || k <= busy || B34[k] == null) continue; const a = AT[k], dist = (x.c - B34[k]) / a; if (Math.abs(dist) < 0.8) continue;
    const d = dist > 0 ? -1 : 1; if (Math.sign(B34[k] - B89[k]) !== -d) continue;
    let xi = k; for (let u = k - 24; u <= k; u++) if (d < 0 ? m5[u].h > m5[xi].h : m5[u].l < m5[xi].l) xi = u; if (k - xi > 12) continue; const xP = d < 0 ? m5[xi].h : m5[xi].l;
    const p = m5[k - 1]; if (!(d < 0 ? x.c < x.o && x.c < p.l && p.c > p.o : x.c > x.o && x.c > p.h && p.c < p.o)) continue;
    const Q = (d < 0 ? sh : sl).filter(q => q.i < xi && q.i >= xi - 72).slice(-1)[0]; if (!(Q && (d < 0 ? xP > Q.p : xP < Q.p))) continue;
    const b = m5[k + 1], e = d > 0 ? b.o + SP : b.o, tp = B34[k] - d * 2, rew = d * (tp - e); if (!(rew > 0.5)) continue;
    const slP = xP - d * (0.5 + (d < 0 ? SP : 0)), risk = d * (e - slP); if (!(risk > 0) || risk > 15) continue;
    let res = null, ex = null, u = k + 1; for (; u < Math.min(n, k + 49); u++) { const y = m5[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= slP : hi >= slP) { res = 'SL'; ex = slP; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = 'TP'; ex = tp; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'Hết giờ'; ex = d > 0 ? m5[u].c : m5[u].c + SP; } busy = u;
    B.push({ m: 'B', t: b.t, exitT: m5[u].ct, d, e, sl: slP, tp, res, pts: d * (ex - e), risk, rew, note: `về EMA34 M15 ${B34[k].toFixed(1)} (cách ${Math.abs(dist).toFixed(1)} ATR)` }); } }
// ---- ghép
const ALL = [...A, ...B].sort((p, q) => p.t - q.t);
const one = []; { let free = 0; for (const x of ALL) if (x.t >= free) { one.push(x); free = x.exitT; } } // chung 1 lệnh một lúc
const sets = { 'A · Chờ hồi về EMA (Test EMA21 M30)': A, 'B · TP về EMA (Nhấn chìm về EMA34 M15)': B, 'A + B song song (mỗi cách 1 lệnh, tối đa 2 lệnh)': ALL, 'A + B chung 1 lệnh một lúc': one };
const days = new Set(); for (let t = FROM; t < END; t += 864e5) { const w = vn(t).getUTCDay(); if (w !== 0 && w !== 6) days.add(day(t)); } const TD = days.size;
function report(nm, L) { const w = L.filter(x => x.res === 'TP'), l = L.filter(x => x.res === 'SL'), o = L.filter(x => x.res === 'Hết giờ'), U = (f) => L.filter(f).reduce((a, x) => a + x.pts * USD, 0);
  let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0, ws = 0, mw = 0; for (const x of L) { eq += x.pts * USD; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); if (x.pts < 0) { ls++; ws = 0; } else { ws++; ls = 0; } ml = Math.max(ml, ls); mw = Math.max(mw, ws); }
  const D = {}; for (const x of L) { const k = day(x.t); D[k] = D[k] || { n: 0, usd: 0, w: 0 }; D[k].n++; D[k].usd += x.pts * USD; if (x.res === 'TP') D[k].w++; }
  const dv = Object.values(D), dist = [0, 0, 0, 0, 0]; for (const dd_ of days) { const c = D[dd_] ? D[dd_].n : 0; dist[Math.min(c, 4)]++; }
  const avg = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
  return { nm, n: L.length, pd: L.length / TD, tp: w.length, sl: l.length, to: o.length, wr: w.length / L.length, tpPts: avg(w.map(x => x.pts)), slPts: avg(l.map(x => x.pts)), U: U(() => true), a: U(x => x.t < S), b: U(x => x.t >= S), dd, ml, mw, dist, TD,
    dayWin: dv.filter(v => v.usd > 0).length, dayN: dv.length, best: Math.max(...dv.map(v => v.usd)), worst: Math.min(...dv.map(v => v.usd)), maxDay: Math.max(...dv.map(v => v.n)), avgRisk: avg(L.map(x => x.risk)), avgRew: avg(L.map(x => x.rew)), hold: avg(L.map(x => (x.exitT - x.t) / 6e4)) }; }
const RS = Object.entries(sets).map(([k, L]) => report(k, L));
for (const r of RS) {
  console.log(`\n=== ${r.nm}`);
  console.log(`  ${r.n} lệnh / ${r.TD} ngày giao dịch = ${r.pd.toFixed(2)} lệnh/ngày (ngày nhiều nhất ${r.maxDay} lệnh)`);
  console.log(`  ngày 0 lệnh ${r.dist[0]} · 1 lệnh ${r.dist[1]} · 2 lệnh ${r.dist[2]} · 3 lệnh ${r.dist[3]} · ≥4 lệnh ${r.dist[4]}`);
  console.log(`  TP ${r.tp} · SL ${r.sl} · hết giờ ${r.to} · thắng ${(100 * r.wr).toFixed(0)}%`);
  console.log(`  SL đặt TB ${r.avgRisk.toFixed(1)} giá · TP đặt TB ${r.avgRew.toFixed(1)} giá · lệnh thắng TB +${r.tpPts.toFixed(1)} giá (+${(r.tpPts * USD).toFixed(1)}$) · lệnh thua TB ${r.slPts.toFixed(1)} giá (${(r.slPts * USD).toFixed(1)}$) · giữ lệnh TB ${r.hold.toFixed(0)} phút`);
  console.log(`  0.02 lot: ${r.U >= 0 ? '+' : ''}${r.U.toFixed(0)}$ (6 tháng đầu ${r.a.toFixed(0)} · 6 tháng gần ${r.b.toFixed(0)}) · TB ${(r.U / r.TD).toFixed(1)}$/ngày · sụt tối đa ${r.dd.toFixed(0)}$ · thua liên tiếp ${r.ml} · thắng liên tiếp ${r.mw}`);
  console.log(`  ngày có lệnh: lời ${r.dayWin}/${r.dayN} (${Math.round(100 * r.dayWin / r.dayN)}%) · ngày tốt nhất +${r.best.toFixed(0)}$ · tệ nhất ${r.worst.toFixed(0)}$`); }
// theo tháng
console.log('\n=== Từng tháng (lệnh · thắng% · USD)'); const months = [...new Set(ALL.map(x => vn(x.t).toISOString().slice(0, 7)))].sort();
console.log('tháng   | ' + Object.keys(sets).map(k => k.split(' · ')[0].padEnd(20)).join(' | '));
for (const mo of months) console.log(mo + ' | ' + Object.values(sets).map(L => { const G = L.filter(x => vn(x.t).toISOString().slice(0, 7) === mo), u = G.reduce((a, x) => a + x.pts * USD, 0); return `${String(G.length).padStart(3)}L ${String(Math.round(100 * G.filter(x => x.res === 'TP').length / (G.length || 1))).padStart(2)}% ${(u >= 0 ? '+' : '') + u.toFixed(0)}`.padEnd(20); }).join(' | '));
// theo giờ
console.log('\n=== Theo giờ VN vào lệnh (A | B): lệnh · thắng%');
for (let h = 0; h < 24; h++) { const f = (L) => { const G = L.filter(x => hr(x.t) === h); return `${String(G.length).padStart(3)}L ${String(Math.round(100 * G.filter(x => x.res === 'TP').length / (G.length || 1))).padStart(2)}% ${(G.reduce((a, x) => a + x.pts * USD, 0)).toFixed(0).padStart(5)}$`; }; console.log(`  ${String(h).padStart(2, '0')}h  A ${f(A)}  |  B ${f(B)}`); }
// theo thứ
console.log('\n=== Theo thứ (A | B)'); const WD = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
for (let w = 1; w <= 5; w++) { const f = (L) => { const G = L.filter(x => vn(x.t).getUTCDay() === w); return `${G.length}L ${Math.round(100 * G.filter(x => x.res === 'TP').length / (G.length || 1))}% ${(G.reduce((a, x) => a + x.pts * USD, 0)).toFixed(0)}$`; }; console.log(`  ${WD[w]}: A ${f(A)} | B ${f(B)}`); }
// tuần gần nhất
console.log('\n=== Chi tiết lệnh 7 ngày gần nhất (giờ VN)'); for (const x of ALL.filter(x => x.t >= END - 8 * 864e5)) console.log(`  ${x.m} ${fmtT(x.t)} ${x.d > 0 ? 'BUY ' : 'SELL'} entry ${x.e.toFixed(2)} SL ${x.sl.toFixed(2)} (${x.risk.toFixed(1)}) TP ${x.tp.toFixed(2)} (${x.rew.toFixed(1)}) → ${x.res} ${x.pts >= 0 ? '+' : ''}${x.pts.toFixed(1)} giá ${(x.pts * USD).toFixed(0)}$ · đóng ${fmtT(x.exitT)} · ${x.note}`);
// cặp B rồi A (bắt sóng về EMA rồi vào theo xu hướng)
let pair = 0; for (const b of B) if (A.some(a => a.t >= b.t && a.t - b.exitT <= 2 * 36e5 && a.d === -b.d)) pair++; console.log(`\nB xong rồi ≤ 2h sau có A ngược chiều (về EMA → theo xu hướng): ${pair}/${B.length} lệnh B`);
let clash = 0; for (const a of A) if (B.some(b => b.t < a.exitT && b.exitT > a.t && b.d !== a.d)) clash++; console.log(`A và B mở cùng lúc NGƯỢC chiều nhau: ${clash} lần`);
fs.writeFileSync(path.join(DIR, 'data', 'combo_trades.csv'), 'phuong_phap,vao_luc_VN,chieu,entry,sl,tp,sl_gia,tp_gia,ket_qua,gia,usd_002,dong_luc_VN,ghi_chu\n' + ALL.map(x => [x.m === 'A' ? 'A Cho hoi ve EMA' : 'B TP ve EMA', fmtT(x.t), x.d > 0 ? 'BUY' : 'SELL', x.e.toFixed(2), x.sl.toFixed(2), x.tp.toFixed(2), x.risk.toFixed(2), x.rew.toFixed(2), x.res, x.pts.toFixed(2), (x.pts * USD).toFixed(2), fmtT(x.exitT), '"' + x.note + '"'].join(',')).join('\n'));
fs.writeFileSync(path.join(DIR, 'data', 'combo_summary.json'), JSON.stringify({ RS, months: months.map(mo => ({ mo, ...Object.fromEntries(Object.entries(sets).map(([k, L]) => [k.split(' · ')[0], +L.filter(x => vn(x.t).toISOString().slice(0, 7) === mo).reduce((a, x) => a + x.pts * USD, 0).toFixed(0)])) })) }));
