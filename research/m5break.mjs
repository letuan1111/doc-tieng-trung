// M15 đang xu hướng, giá xa EMA M15 → M5 GÃY xu hướng (EMA34 M5 cắt ngược EMA89 M5) + ICT/SMC (quét BSL/SSL ở đỉnh/đáy, MSS M5, FVG)
// → vào lệnh theo chiều M5 mới, TP = test về EMA34 (hoặc EMA89) M15, SL ngoài đỉnh/đáy quét. Vàng 12 tháng, 0.02 lot.
import { load, ema, atr, pivots, mapHTF } from './core.mjs';
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), n = m5.length, SP = 0.35, S = Date.UTC(2026, 4, 5), FROM = Date.UTC(2025, 10, 5);
const c5 = m5.map(x => x.c), A34 = ema(c5, 34), A89 = ema(c5, 89);
const B34 = mapHTF(m5, m15, ema(m15.map(x => x.c), 34)), B89 = mapHTF(m5, m15, ema(m15.map(x => x.c), 89)), AT = mapHTF(m5, m15, atr(m15));
const pv = pivots(m5, 2), hr = (t) => (new Date(t).getUTCHours() + 7) % 24, pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const ev = []; let ih = 0, il = 0; const sh = [], sl = [];
for (let k = 200; k < n - 2; k++) {
  while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
  if (m5[k].t < FROM || B34[k] == null) continue;
  const cross = Math.sign(A34[k] - A89[k]) !== Math.sign(A34[k - 1] - A89[k - 1]) ? Math.sign(A34[k] - A89[k]) : 0; if (!cross) continue;
  const d = cross, tr15 = Math.sign(B34[k] - B89[k]), a = AT[k]; // d = chiều mới của M5
  const gap = d * (B34[k] - m5[k].c) / a; // giá đang cách EMA34 M15 bao nhiêu ATR về phía ngược (cần đi d để về EMA)
  // cực trị gần nhất trước điểm cắt (đỉnh cho SELL, đáy cho BUY) trong 48 nến
  let xi = k; for (let u = Math.max(0, k - 48); u <= k; u++) if (d < 0 ? m5[u].h > m5[xi].h : m5[u].l < m5[xi].l) xi = u;
  const xP = d < 0 ? m5[xi].h : m5[xi].l;
  const Q = (d < 0 ? sh : sl).filter(q => q.i < xi && q.i >= xi - 60).slice(-1)[0], swept = !!(Q && (d < 0 ? xP > Q.p : xP < Q.p));
  const P = (d < 0 ? sl : sh).filter(q => q.i > xi && q.i <= k).slice(-1)[0] || (d < 0 ? sl : sh).filter(q => q.i < xi).slice(-1)[0];
  const mss = !!(P && (d < 0 ? Math.min(...m5.slice(xi, k + 1).map(x => x.c)) < P.p : Math.max(...m5.slice(xi, k + 1).map(x => x.c)) > P.p));
  let fvg = null; for (let m = xi + 2; m <= k; m++) { const bot = d > 0 ? m5[m - 2].h : m5[m].h, top = d > 0 ? m5[m].l : m5[m - 2].l; if (top > bot) fvg = { top, bot }; }
  ev.push({ k, t: m5[k].t, d, counter: tr15 !== 0 && tr15 !== d, gap, swept, mss, fvg, xP, a, h: hr(m5[k].t) });
}
function run(L, o = {}) {
  const R = []; let busy = -1;
  for (const e of L) { const k = e.k; if (k <= busy) continue; const d = e.d, b = m5[k + 1];
    const entry = o.entry === 'fvg' ? (e.fvg ? (d > 0 ? e.fvg.top : e.fvg.bot) : null) : (d > 0 ? b.o + SP : b.o); if (entry == null) continue;
    const sl = e.xP - d * (0.3 * e.a + SP), risk = Math.abs(entry - sl); if (!(d > 0 ? sl < entry : sl > entry) || risk > (o.maxSL || 30)) continue;
    const tgt = o.tp === '89' ? B89[k] : o.tp === 'rr2' ? entry + d * 2 * risk : B34[k], rew = d * (tgt - entry); if (!(rew > 0) || rew / risk < (o.minRR || 0.5)) continue;
    let fill = o.entry === 'fvg' ? -1 : k + 1, res = null, ex = null;
    if (fill < 0) { for (let u = k + 1; u <= k + 12 && u < n; u++) if (d > 0 ? m5[u].l <= entry : m5[u].h >= entry) { fill = u; break; } if (fill < 0) continue; }
    for (let u = fill; u < Math.min(n, fill + (o.hold || 96)); u++) { const y = m5[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= sl : hi >= sl) { res = 'SL'; ex = sl; busy = u; break; } if (d > 0 ? hi >= tgt : lo <= tgt) { res = 'TP'; ex = tgt; busy = u; break; } }
    if (!res) { const u = Math.min(n - 1, fill + (o.hold || 96)); res = 'TIME'; ex = d > 0 ? m5[u].c : m5[u].c + SP; busy = u; }
    R.push({ t: m5[k].t, h: e.h, res, usd: d * (ex - entry) * 2, rr: rew / risk, risk, rew }); }
  return R;
}
const show = (nm, R) => { const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0);
  let eq = 0, pk = 0, dd = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  console.log(`${(U(r => r.t < S) > 0 && U(r => r.t >= S) > 0) ? '✓' : ' '} ${nm.padEnd(58)} ${String(R.length).padStart(4)} lệnh (${(R.length / 260).toFixed(1)}/ngày) · TP ${String(w).padStart(3)} · thắng ${String(pct(w, R.length)).padStart(2)}% · TP TB ${(R.reduce((a, r) => a + r.rew, 0) / (R.length || 1)).toFixed(1)} / SL TB ${(R.reduce((a, r) => a + r.risk, 0) / (R.length || 1)).toFixed(1)} giá · ${U(() => true) >= 0 ? '+' : ''}${U(() => true).toFixed(0)}$ (trước ${U(r => r.t < S).toFixed(0)} · gần ${U(r => r.t >= S).toFixed(0)}) · DD ${dd.toFixed(0)}$`); return R; };
const C = ev.filter(e => e.counter && e.gap >= 1); // M5 gãy NGƯỢC xu hướng M15, giá còn cách EMA34 M15 ≥ 1 ATR
console.log(`M5 cắt EMA34/89 ngược xu hướng M15, giá cách EMA34 M15 ≥ 1 ATR: ${C.length} lần (${(C.length / 260).toFixed(1)}/ngày)\n`);
console.log('== TP = test EMA34 M15, vào ngay khi M5 cắt');
show('chỉ cần M5 gãy xu hướng', run(C)); show('+ quét BSL/SSL ở đỉnh/đáy', run(C.filter(e => e.swept))); show('+ MSS M5', run(C.filter(e => e.mss)));
show('+ quét + MSS', run(C.filter(e => e.swept && e.mss))); show('+ quét + MSS + FVG (đủ ICT/SMC)', run(C.filter(e => e.swept && e.mss && e.fvg)));
for (const g of [2, 3]) show(`đủ ICT/SMC + giá cách EMA M15 ≥ ${g} ATR`, run(C.filter(e => e.swept && e.mss && e.fvg && e.gap >= g)));
console.log('\n== Đủ ICT/SMC, đổi cách vào / mục tiêu');
const F = C.filter(e => e.swept && e.mss && e.fvg);
show('limit ở mép FVG M5 · TP EMA34 M15', run(F, { entry: 'fvg' })); show('vào ngay · TP EMA89 M15', run(F, { tp: '89' })); show('vào ngay · TP 2R', run(F, { tp: 'rr2' }));
show('vào ngay · TP EMA34 M15 · chỉ khi TP ≥ 1R', run(F, { minRR: 1 })); show('vào ngay · TP EMA34 M15 · chỉ khi TP ≥ 1.5R', run(F, { minRR: 1.5 }));
console.log('\n== Đủ ICT/SMC · TP EMA34 M15 · theo giờ VN (thắng %, USD)');
const R = run(F); const H = {}; for (const r of R) (H[r.h] = H[r.h] || []).push(r);
console.log('  ' + Object.keys(H).sort((a, b) => a - b).map(h => `${h}h ${pct(H[h].filter(r => r.res === 'TP').length, H[h].length)}%/${H[h].reduce((a, r) => a + r.usd, 0).toFixed(0)}`).join(' · '));
console.log('\n== So sánh: M5 cắt EMA CÙNG chiều xu hướng M15 (giá hồi xong, quay lại xu hướng) · TP 2R');
const W = ev.filter(e => !e.counter); show('M5 cắt cùng chiều M15 + quét + MSS + FVG', run(W.filter(e => e.swept && e.mss && e.fvg), { tp: 'rr2' }));
