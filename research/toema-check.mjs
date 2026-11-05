// Kiểm độ bền chiến lược "Nhấn chìm về EMA": spread, đệm SL, đệm TP, từng tháng, giờ, BTC
import { load, ema, atr, pivots, mapHTF } from './core.mjs';
const SYM = process.argv[2] || 'XAU', USDPT = SYM === 'XAU' ? 2 : 0.02; // XAU 0.02 lot = 2$/giá; BTC 0.02 lot = 0.02$/giá
function build(SP) {
  const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), n = m5.length, FROM = Date.UTC(2025, 10, 5);
  const B34 = mapHTF(m5, m15, ema(m15.map(x => x.c), 34)), B89 = mapHTF(m5, m15, ema(m15.map(x => x.c), 89)), AT = mapHTF(m5, m15, atr(m15));
  const pv = pivots(m5, 2), ev = []; let ih = 0, il = 0; const sh = [], sl = [];
  for (let k = 300; k < n - 2; k++) { while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
    const x = m5[k]; if (x.t < FROM || B34[k] == null) continue; const a = AT[k], dist = (x.c - B34[k]) / a; if (Math.abs(dist) < 0.8) continue;
    const d = dist > 0 ? -1 : 1; if (Math.sign(B34[k] - B89[k]) !== -d) continue;
    let xi = k; for (let u = k - 24; u <= k; u++) if (d < 0 ? m5[u].h > m5[xi].h : m5[u].l < m5[xi].l) xi = u; if (k - xi > 12) continue; const xP = d < 0 ? m5[xi].h : m5[xi].l;
    const p = m5[k - 1]; if (!(d < 0 ? x.c < x.o && x.c < p.l && p.c > p.o : x.c > x.o && x.c > p.h && p.c < p.o)) continue;
    const Q = (d < 0 ? sh : sl).filter(q => q.i < xi && q.i >= xi - 72).slice(-1)[0]; if (!(Q && (d < 0 ? xP > Q.p : xP < Q.p))) continue;
    ev.push({ k, d, xP, a, dist: Math.abs(dist) }); }
  return { m5, n, B34, ev };
}
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24, pct = (a, b) => b ? Math.round(100 * a / b) : 0, S = Date.UTC(2026, 4, 5);
function run(D, SP, o = {}) { const { m5, n, B34, ev } = D, R = []; let busy = -1; const buf = (o.buf ?? 2) * (SYM === 'XAU' ? 1 : 25), pad = (o.pad ?? 0.5) * (SYM === 'XAU' ? 1 : 25), maxSL = 15 * (SYM === 'XAU' ? 1 : 25);
  for (const e of ev) { const k = e.k; if (k <= busy) continue; const d = e.d, b = m5[k + 1], entry = d > 0 ? b.o + SP : b.o, tp = B34[k] - d * buf, rew = d * (tp - entry); if (!(rew > 0.5 * (SYM === 'XAU' ? 1 : 25))) continue;
    const slP = e.xP - d * (pad + (d < 0 ? SP : 0)), risk = d * (entry - slP); if (!(risk > 0) || risk > maxSL || (o.minRR && rew / risk < o.minRR)) continue;
    let res = null, ex = null, u = k + 1; for (; u < Math.min(n, k + 1 + (o.hold ?? 48)); u++) { const y = m5[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= slP : hi >= slP) { res = 'SL'; ex = slP; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = 'TP'; ex = tp; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'T'; ex = d > 0 ? m5[u].c : m5[u].c + SP; } busy = u;
    R.push({ t: m5[k].t, h: hr(m5[k + 1].t), d, res, usd: d * (ex - entry) * USDPT, risk, rew }); } return R; }
const show = (nm, R) => { const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0); let eq = 0, pk = 0, dd = 0, ls = 0, mls = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = r.usd < 0 ? ls + 1 : 0; mls = Math.max(mls, ls); }
  console.log(`${(U(r => r.t < S) > 0 && U(r => r.t >= S) > 0) ? '✓' : ' '} ${nm.padEnd(36)} ${String(R.length).padStart(4)} (${(R.length / 260).toFixed(1)}/ngày) · thắng ${pct(w, R.length)}% · TP TB ${(R.reduce((a, r) => a + r.rew, 0) / (R.length || 1)).toFixed(1)} / SL TB ${(R.reduce((a, r) => a + r.risk, 0) / (R.length || 1)).toFixed(1)} · ${U(() => true) >= 0 ? '+' : ''}${U(() => true).toFixed(0)}$ (trước ${U(r => r.t < S).toFixed(0)} · gần ${U(r => r.t >= S).toFixed(0)}) · DD ${dd.toFixed(0)} · thua liên tiếp ${mls} · hết giờ ${R.filter(r => r.res === 'T').length}`); return R; };
const SPs = SYM === 'XAU' ? [0.35, 0.5, 0.7] : [8, 15];
console.log(`=== ${SYM} · Nhấn chìm M5 về EMA34 M15 (cùng xu hướng + quét, cách ≥ 0.8 ATR, TP = EMA34 − đệm, SL ngoài cực trị + đệm)`);
let base; for (const sp of SPs) { const D = build(sp); const R = show(`spread ${sp}`, run(D, sp)); if (sp === SPs[0]) base = { D, R, sp }; }
const { D, sp } = base;
for (const buf of [0, 1, 2, 3, 4]) show(`TP = EMA34 − ${buf}`, run(D, sp, { buf }));
for (const pad of [0.3, 1, 1.5]) show(`đệm SL ${pad}`, run(D, sp, { pad }));
for (const hold of [24, 96]) show(`giữ tối đa ${hold * 5 / 60}h`, run(D, sp, { hold }));
for (const mr of [1, 1.5, 2]) show(`chỉ vào khi TP ≥ ${mr}R`, run(D, sp, { minRR: mr }));
const R = base.R; show('chỉ BUY', R.filter(r => r.d > 0)); show('chỉ SELL', R.filter(r => r.d < 0));
const M = {}; for (const r of R) { const k = new Date(r.t).toISOString().slice(2, 7); M[k] = M[k] || [0, 0, 0]; M[k][0]++; if (r.res === 'TP') M[k][1]++; M[k][2] += r.usd; }
console.log(' · từng tháng: ' + Object.entries(M).map(([k, v]) => `${k} ${v[0]}L ${pct(v[1], v[0])}% ${v[2] >= 0 ? '+' : ''}${v[2].toFixed(0)}`).join(' · '));
const H = {}; for (const r of R) (H[r.h] = H[r.h] || []).push(r);
console.log(' · theo giờ VN: ' + Object.keys(H).sort((a, b) => a - b).map(h => `${h}h ${H[h].length}L ${pct(H[h].filter(r => r.res === 'TP').length, H[h].length)}% ${H[h].reduce((a, r) => a + r.usd, 0).toFixed(0)}`).join(' · '));
const Dy = {}; for (const r of R) { const k = new Date(r.t + 7 * 36e5).toISOString().slice(0, 10); Dy[k] = (Dy[k] || 0) + r.usd; } const dv = Object.values(Dy);
console.log(` · ${dv.length} ngày có lệnh · ngày lời ${pct(dv.filter(v => v > 0).length, dv.length)}% · TB ${(dv.reduce((a, v) => a + v, 0) / dv.length).toFixed(1)}$/ngày · ngày tệ nhất ${Math.min(...dv).toFixed(0)}$ · tốt nhất +${Math.max(...dv).toFixed(0)}$`);
