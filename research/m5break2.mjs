// Bổ sung m5break: (1) lúc EMA34 M5 cắt EMA89 M5 ngược xu hướng M15, giá đang ở đâu so với EMA34 M15?
// (2) tín hiệu sớm hơn: giá M5 đóng cửa vượt EMA34 M5 (chưa cần 34 cắt 89) + quét + MSS + FVG, giá còn cách EMA34 M15 ≥ g ATR → TP test EMA34 M15
import { load, ema, atr, pivots, mapHTF } from './core.mjs';
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), n = m5.length, SP = 0.35, S = Date.UTC(2026, 4, 5), FROM = Date.UTC(2025, 10, 5);
const c5 = m5.map(x => x.c), A34 = ema(c5, 34), A89 = ema(c5, 89);
const B34 = mapHTF(m5, m15, ema(m15.map(x => x.c), 34)), B89 = mapHTF(m5, m15, ema(m15.map(x => x.c), 89)), AT = mapHTF(m5, m15, atr(m15));
const pv = pivots(m5, 2), hr = (t) => (new Date(t).getUTCHours() + 7) % 24, pct = (a, b) => b ? Math.round(100 * a / b) : 0;
// (1)
const G = []; for (let k = 200; k < n; k++) { if (m5[k].t < FROM || B34[k] == null) continue; const s0 = Math.sign(A34[k - 1] - A89[k - 1]), s1 = Math.sign(A34[k] - A89[k]); if (!s1 || s0 === s1) continue;
  const tr = Math.sign(B34[k] - B89[k]); if (tr === s1 || !tr) continue; G.push(s1 * (B34[k] - m5[k].c) / AT[k]); }
const b = (lo, hi) => G.filter(g => g >= lo && g < hi).length;
console.log(`(1) EMA34 M5 cắt EMA89 M5 ngược xu hướng M15: ${G.length} lần. Vị trí giá so với EMA34 M15 lúc cắt (ATR M15, dương = EMA34 M15 còn ở phía trước):`);
console.log(`   giá ĐÃ vượt qua EMA34 M15 (≤0): ${pct(b(-99, 0), G.length)}% · còn 0–0.5 ATR: ${pct(b(0, .5), G.length)}% · 0.5–1: ${pct(b(.5, 1), G.length)}% · ≥1: ${pct(b(1, 99), G.length)}%`);
// (2)
const ev = []; let ih = 0, il = 0; const sh = [], sl = [];
for (let k = 200; k < n - 2; k++) {
  while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
  if (m5[k].t < FROM || B34[k] == null) continue;
  const tr = Math.sign(B34[k] - B89[k]); if (!tr) continue; const d = -tr; // vào ngược xu hướng M15 để giá test lại EMA34 M15
  if (!(d > 0 ? m5[k].c > A34[k] && m5[k - 1].c <= A34[k - 1] : m5[k].c < A34[k] && m5[k - 1].c >= A34[k - 1])) continue; // đóng cửa vượt EMA34 M5
  const a = AT[k], gap = d * (B34[k] - m5[k].c) / a; if (gap < 0.5) continue;
  let xi = k; for (let u = k - 36; u <= k; u++) if (d < 0 ? m5[u].h > m5[xi].h : m5[u].l < m5[xi].l) xi = u; const xP = d < 0 ? m5[xi].h : m5[xi].l;
  const Q = (d < 0 ? sh : sl).filter(q => q.i < xi && q.i >= xi - 60).slice(-1)[0], swept = !!(Q && (d < 0 ? xP > Q.p : xP < Q.p));
  const P = (d < 0 ? sl : sh).filter(q => q.i < k && q.i > xi - 30).filter(q => d < 0 ? q.p < xP : q.p > xP).slice(-1)[0];
  const mss = !!(P && (d < 0 ? Math.min(...m5.slice(xi, k + 1).map(x => x.c)) < P.p : Math.max(...m5.slice(xi, k + 1).map(x => x.c)) > P.p));
  let fvg = null; for (let m = xi + 2; m <= k; m++) { const bt = d > 0 ? m5[m - 2].h : m5[m].h, tp = d > 0 ? m5[m].l : m5[m - 2].l; if (tp > bt) fvg = 1; }
  const ext = d * (B34[k] - (d < 0 ? xP : xP)) / a; // cực trị cách EMA34 M15 bao xa
  ev.push({ k, d, gap, swept, mss, fvg, xP, a, h: hr(m5[k].t), ext: -ext });
}
function run(L, o = {}) { const R = []; let busy = -1;
  for (const e of L) { const k = e.k; if (k <= busy) continue; const d = e.d, bb = m5[k + 1], entry = d > 0 ? bb.o + SP : bb.o;
    const sl = e.xP - d * (0.3 * e.a + SP), risk = Math.abs(entry - sl); if (!(d > 0 ? sl < entry : sl > entry) || risk > 30) continue;
    const tgt = o.tp === 'rr2' ? entry + d * 2 * risk : o.tp === 'mid' ? entry + d * 0.5 * d * (B34[k] - entry) * d : B34[k], rew = d * (tgt - entry); if (!(rew > 0) || rew / risk < (o.minRR ?? 0.5)) continue;
    let res = null, ex = null, u = k + 1; for (; u < Math.min(n, k + 1 + (o.hold || 48)); u++) { const y = m5[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= sl : hi >= sl) { res = 'SL'; ex = sl; break; } if (d > 0 ? hi >= tgt : lo <= tgt) { res = 'TP'; ex = tgt; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'TIME'; ex = d > 0 ? m5[u].c : m5[u].c + SP; } busy = u;
    R.push({ t: m5[k].t, h: e.h, res, usd: d * (ex - entry) * 2, risk, rew }); } return R; }
const show = (nm, R) => { const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0); let eq = 0, pk = 0, dd = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  console.log(`${(U(r => r.t < S) > 0 && U(r => r.t >= S) > 0) ? '✓' : ' '} ${nm.padEnd(54)} ${String(R.length).padStart(4)} lệnh (${(R.length / 260).toFixed(1)}/ngày) · thắng ${String(pct(w, R.length)).padStart(2)}% · TP TB ${(R.reduce((a, r) => a + r.rew, 0) / (R.length || 1)).toFixed(1)} / SL TB ${(R.reduce((a, r) => a + r.risk, 0) / (R.length || 1)).toFixed(1)} · ${U(() => true) >= 0 ? '+' : ''}${U(() => true).toFixed(0)}$ (trước ${U(r => r.t < S).toFixed(0)} · gần ${U(r => r.t >= S).toFixed(0)}) · DD ${dd.toFixed(0)}$`); return R; };
console.log(`\n(2) Giá M5 đóng cửa vượt EMA34 M5 ngược xu hướng M15, giá còn cách EMA34 M15 ≥ 0.5 ATR: ${ev.length} lần (${(ev.length / 260).toFixed(1)}/ngày) · TP = EMA34 M15, giữ ≤ 4h`);
for (const g of [0.5, 1, 1.5, 2]) { const L = ev.filter(e => e.gap >= g); console.log(` · giá cách EMA34 M15 ≥ ${g} ATR`);
  show('   chỉ cần vượt EMA34 M5', run(L)); show('   + quét BSL/SSL', run(L.filter(e => e.swept))); show('   + quét + MSS', run(L.filter(e => e.swept && e.mss))); show('   + quét + MSS + FVG (đủ ICT/SMC)', run(L.filter(e => e.swept && e.mss && e.fvg))); }
const F = ev.filter(e => e.gap >= 1 && e.swept && e.mss && e.fvg);
console.log(' · đủ ICT/SMC, cách ≥ 1 ATR, đổi mục tiêu'); show('   TP 2R', run(F, { tp: 'rr2' })); show('   TP EMA34 M15 chỉ khi ≥ 1R', run(F, { minRR: 1 })); show('   TP EMA34 M15 chỉ khi ≥ 2R', run(F, { minRR: 2 }));
const R = run(F); const H = {}; for (const r of R) (H[r.h] = H[r.h] || []).push(r);
console.log(' · theo giờ VN (đủ ICT/SMC, ≥1 ATR): ' + Object.keys(H).sort((a, b) => a - b).map(h => `${h}h ${H[h].length}L ${pct(H[h].filter(r => r.res === 'TP').length, H[h].length)}% ${H[h].reduce((a, r) => a + r.usd, 0).toFixed(0)}$`).join(' · '));
