// Chiến lược BẮT NHỊP GIÁ CHẠY VỀ TEST EMA34/89 M15 — TP nhỏ, chuẩn (2–3 giá hoặc ngay trước EMA). Vào trên M5, vàng 12 tháng, 0.02 lot.
import { load, ema, atr, pivots, mapHTF } from './core.mjs';
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), n = m5.length, SP = 0.35, S = Date.UTC(2026, 4, 5), FROM = Date.UTC(2025, 10, 5);
const c5 = m5.map(x => x.c), M34 = ema(c5, 34), M9 = ema(c5, 9);
const B34 = mapHTF(m5, m15, ema(m15.map(x => x.c), 34)), B89 = mapHTF(m5, m15, ema(m15.map(x => x.c), 89)), AT = mapHTF(m5, m15, atr(m15));
const pv = pivots(m5, 2), hr = (t) => (new Date(t).getUTCHours() + 7) % 24, pct = (a, b) => b ? Math.round(100 * a / b) : 0;
// sự kiện: giá M5 đang cách EMA34 M15 ≥ g ATR, xuất hiện tín hiệu đảo chiều M5 hướng VỀ EMA → d = chiều về EMA
const ev = []; let ih = 0, il = 0; const sh = [], sl = [];
for (let k = 300; k < n - 2; k++) {
  while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
  const x = m5[k]; if (x.t < FROM || B34[k] == null) continue; const a = AT[k], dist = (x.c - B34[k]) / a; if (Math.abs(dist) < 0.8) continue;
  const d = dist > 0 ? -1 : 1, tr = Math.sign(B34[k] - B89[k]), withTr = tr === -d; // withTr: giá đang chạy cùng xu hướng M15 rồi hồi về EMA (76% về trong 4h)
  let xi = k; for (let u = k - 24; u <= k; u++) if (d < 0 ? m5[u].h > m5[xi].h : m5[u].l < m5[xi].l) xi = u; const xP = d < 0 ? m5[xi].h : m5[xi].l;
  if (k - xi > 12) continue; // cực trị phải còn mới (≤ 1h)
  const trig = {
    ema9: d < 0 ? x.c < M9[k] && m5[k - 1].c >= M9[k - 1] : x.c > M9[k] && m5[k - 1].c <= M9[k - 1],                 // M5 đóng cửa cắt EMA9 M5 về phía EMA M15
    ema34: d < 0 ? x.c < M34[k] && m5[k - 1].c >= M34[k - 1] : x.c > M34[k] && m5[k - 1].c <= M34[k - 1],
    mss: (() => { const P = (d < 0 ? sl : sh).filter(q => q.i < k && q.i >= xi - 24).slice(-1)[0]; return !!(P && (d < 0 ? x.c < P.p && m5[k - 1].c >= P.p : x.c > P.p && m5[k - 1].c <= P.p)); })(),
    engulf: d < 0 ? x.c < x.o && x.c < m5[k - 1].l && m5[k - 1].c > m5[k - 1].o : x.c > x.o && x.c > m5[k - 1].h && m5[k - 1].c < m5[k - 1].o,
  };
  const Q = (d < 0 ? sh : sl).filter(q => q.i < xi && q.i >= xi - 72).slice(-1)[0], swept = !!(Q && (d < 0 ? xP > Q.p : xP < Q.p));
  for (const [tn, ok] of Object.entries(trig)) if (ok) ev.push({ k, d, tn, withTr, swept, xP, a, dist: Math.abs(dist), h: hr(x.t) });
}
function run(L, o) { const R = []; let busy = -1;
  for (const e of L) { const k = e.k; if (k <= busy) continue; const d = e.d, b = m5[k + 1], entry = d > 0 ? b.o + SP : b.o, room = d * (B34[k] - entry);
    let tp; if (o.tp === 'ema') tp = B34[k] - d * (o.buf ?? 0); else tp = entry + d * o.tp; const rew = d * (tp - entry); if (!(rew > 0.5) || (o.tp !== 'ema' && room < o.tp + (o.need ?? 0))) continue;
    const slP = o.sl === 'ext' ? e.xP - d * ((o.pad ?? 0.5) + (d < 0 ? SP : 0)) : entry - d * o.sl, risk = d * (entry - slP); if (!(risk > 0.5) || risk > (o.maxSL ?? 15)) continue;
    let res = null, ex = null, u = k + 1; for (; u < Math.min(n, k + 1 + 48); u++) { const y = m5[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= slP : hi >= slP) { res = 'SL'; ex = slP; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = 'TP'; ex = tp; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'T'; ex = d > 0 ? m5[u].c : m5[u].c + SP; } busy = u;
    R.push({ t: m5[k].t, h: e.h, res, usd: d * (ex - entry) * 2, risk, rew }); } return R; }
const rows = [];
const TR = ['ema9', 'ema34', 'mss', 'engulf'];
for (const tn of TR) for (const ctx of ['cùng xu hướng', 'mọi', 'cùng xu hướng + quét']) for (const g of [0.8, 1.5, 2.5]) {
  const L = ev.filter(e => e.tn === tn && e.dist >= g && (ctx === 'mọi' || e.withTr) && (ctx !== 'cùng xu hướng + quét' || e.swept));
  for (const tp of [2, 3, 5, 'ema']) for (const bf of (tp === 'ema' ? [0, 1, 2] : [0])) for (const slv of [3, 5, 8, 'ext']) {
    const R = run(L, { tp, buf: bf, sl: slv }); if (R.length < 150) continue; const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0);
    let eq = 0, pk = 0, dd = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
    rows.push({ k: `${tn} · ${ctx} · cách ≥${g} ATR · TP ${tp === 'ema' ? 'EMA34' + (bf ? '−' + bf : '') : tp + ' giá'} · SL ${slv === 'ext' ? 'ngoài cực trị' : slv + ' giá'}`, n: R.length, wr: w / R.length, U: U(() => true), a: U(r => r.t < S), b: U(r => r.t >= S), dd, tpA: R.reduce((s, r) => s + r.rew, 0) / R.length, slA: R.reduce((s, r) => s + r.risk, 0) / R.length, R }); } }
const pr = (r) => console.log(`${r.k.padEnd(78)} ${String(r.n).padStart(4)} (${(r.n / 260).toFixed(1)}/ngày) · thắng ${Math.round(100 * r.wr)}% · TP ${r.tpA.toFixed(1)}/SL ${r.slA.toFixed(1)} · ${r.U >= 0 ? '+' : ''}${r.U.toFixed(0)}$ (trước ${r.a.toFixed(0)} · gần ${r.b.toFixed(0)}) · DD ${r.dd.toFixed(0)}`);
console.log(`${rows.length} cấu hình (≥150 lệnh). Lời cả 2 nửa năm: ${rows.filter(r => r.a > 0 && r.b > 0).length}\n== Top lời cả 2 nửa (xếp theo nửa yếu hơn)`);
rows.filter(r => r.a > 0 && r.b > 0).sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b)).slice(0, 20).forEach(pr);
console.log('\n== Thắng cao nhất (bất kể lời)'); [...rows].sort((x, y) => y.wr - x.wr).slice(0, 8).forEach(pr);
console.log('\n== TP 2–3 giá tốt nhất'); rows.filter(r => /TP [23] giá/.test(r.k)).sort((x, y) => y.U - x.U).slice(0, 8).forEach(pr);
