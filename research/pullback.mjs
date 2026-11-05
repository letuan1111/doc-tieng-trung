// Tìm cách có NHIỀU lệnh bắt nhịp HỒI theo xu hướng (giá hồi về EMA rồi đi tiếp) — grid trên vàng 12 tháng, mô phỏng M5, 0.02 lot, 1 lệnh một lúc
import { load, ema, atr, pivots, mapHTF, resample } from './core.mjs';
const SYM = process.argv[2] || 'XAU', K = SYM === 'XAU' ? 1 : 25, USDPT = SYM === 'XAU' ? 2 : 0.02;
const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), m30 = resample(m15, 18e5), h1 = load(SYM, 'h1'), n = m5.length, S = Date.UTC(2026, 4, 5), FROM = Date.UTC(2025, 10, 5);
const SP0 = SYM === 'XAU' ? 0.35 : 8;
const c5 = m5.map(x => x.c), M9 = ema(c5, 9), M21 = ema(c5, 21), M34 = ema(c5, 34);
const tf = {}; for (const [nm, C] of [['M15', m15], ['M30', m30], ['H1', h1]]) { const cc = C.map(x => x.c); tf[nm] = { e34: mapHTF(m5, C, ema(cc, 34)), e89: mapHTF(m5, C, ema(cc, 89)), a: mapHTF(m5, C, atr(C)) }; }
const A15 = tf.M15.a, pv = pivots(m5, 2), hr = (t) => (new Date(t).getUTCHours() + 7) % 24, pct = (a, b) => b ? Math.round(100 * a / b) : 0;
// danh sách pivot đã xác nhận tới nến k
const SH = new Array(n), SL_ = new Array(n); { let ih = 0, il = 0, lh = null, ll = null, ph = null, pl = null; for (let k = 0; k < n; k++) { while (ih < pv.H.length && pv.H[ih].conf <= k) { ph = lh; lh = pv.H[ih++]; } while (il < pv.L.length && pv.L[il].conf <= k) { pl = ll; ll = pv.L[il++]; } SH[k] = [lh, ph]; SL_[k] = [ll, pl]; } }
// sự kiện: với mỗi khung EMA, mỗi nến M5 k có xu hướng; tìm điểm hồi (đáy nhịp hồi trong `look` nến) chạm vùng EMA
function events(emaTF, look = 36) { const E = tf[emaTF], out = [];
  for (let k = 300; k < n - 2; k++) { if (m5[k].t < FROM || E.e89[k] == null || A15[k] == null) continue; const d = Math.sign(E.e34[k] - E.e89[k]); if (!d) continue; const a = A15[k], x = m5[k], p = m5[k - 1];
    // điểm cực của nhịp hồi
    let pi = k; for (let u = k - look; u <= k; u++) if (d > 0 ? m5[u].l < m5[pi].l : m5[u].h > m5[pi].h) pi = u; if (pi === k) continue; const pP = d > 0 ? m5[pi].l : m5[pi].h;
    const zone = d * (pP - E.e34[pi]) / a; // âm = xuyên dưới EMA34
    const deep = d * (pP - E.e89[pi]) / a; // âm = xuyên qua EMA89
    // tín hiệu M5 tại nến k
    const trg = [];
    const hs = d > 0 ? SH[k][0] : SL_[k][0]; if (hs && hs.i > pi - 30 && hs.i < k && (d > 0 ? x.c > hs.p && p.c <= hs.p : x.c < hs.p && p.c >= hs.p)) trg.push('mss');
    if (d > 0 ? x.c > x.o && p.c < p.o && x.c > p.h : x.c < x.o && p.c > p.o && x.c < p.l) trg.push('engulf');
    if (d > 0 ? x.c > M21[k] && p.c <= M21[k - 1] : x.c < M21[k] && p.c >= M21[k - 1]) trg.push('ema21');
    if (d > 0 ? M9[k] > M21[k] && M9[k - 1] <= M21[k - 1] : M9[k] < M21[k] && M9[k - 1] >= M21[k - 1]) trg.push('cross9');
    if (!trg.length) continue;
    const ls = d > 0 ? SL_[pi + 0][0] : SH[pi][0]; const Q = (d > 0 ? SL_[Math.max(0, pi - 1)] : SH[Math.max(0, pi - 1)])[0]; const swept = !!(Q && Q.i < pi && Q.i >= pi - 96 && (d > 0 ? pP < Q.p : pP > Q.p));
    let fvg = false; for (let m = pi + 2; m <= k; m++) if (d > 0 ? m5[m].l > m5[m - 2].h : m5[m].h < m5[m - 2].l) fvg = true;
    const h1ok = Math.sign(tf.H1.e34[k] - tf.H1.e89[k]) === d;
    let hiP = null; { let hi = k; for (let u = k - 96; u <= k; u++) if (d > 0 ? m5[u].h > m5[hi].h : m5[u].l < m5[hi].l) hi = u; hiP = d > 0 ? m5[hi].h : m5[hi].l; }
    for (const tg of trg) out.push({ k, d, tg, pP, pi, zone, deep, swept, fvg, h1ok, a, h: hr(x.t), hiP, fresh: k - pi }); }
  return out; }
function run(L, o) { const R = []; let busy = -1; const SP = o.sp ?? SP0;
  for (const e of L) { const k = e.k; if (k <= busy) continue; const d = e.d, b = m5[k + 1], entry = d > 0 ? b.o + SP : b.o;
    const slP = e.pP - d * ((o.pad ?? 0.3) * e.a + (d < 0 ? SP : 0)), risk = d * (entry - slP); if (!(risk > 0.5 * K) || risk > (o.maxSL ?? 15) * K) continue;
    const tp = o.tp === 'hi' ? e.hiP : entry + d * (o.rr ?? 2) * risk; const rew = d * (tp - entry); if (!(rew > 0) || (o.tp === 'hi' && rew / risk < 1)) continue;
    let res = null, ex = null, u = k + 1; for (; u < Math.min(n, k + 1 + (o.hold ?? 288)); u++) { const y = m5[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= slP : hi >= slP) { res = 'SL'; ex = slP; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = 'TP'; ex = tp; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'T'; ex = d > 0 ? m5[u].c : m5[u].c + SP; } busy = u;
    R.push({ t: m5[k].t, h: e.h, d, res, usd: d * (ex - entry) * USDPT, risk, rew }); }
  return R; }
const stat = (R) => { const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0); let eq = 0, pk = 0, dd = 0, ls = 0, mls = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = r.usd < 0 ? ls + 1 : 0; mls = Math.max(mls, ls); }
  return { n: R.length, pd: R.length / 260, wr: w / (R.length || 1), U: U(() => true), a: U(r => r.t < S), b: U(r => r.t >= S), dd, mls, sl: R.reduce((s, r) => s + r.risk, 0) / (R.length || 1) / K }; };
const fmt = (nm, s) => `${(s.a > 0 && s.b > 0) ? '✓' : ' '} ${nm.padEnd(70)} ${String(s.n).padStart(4)} (${s.pd.toFixed(1)}/ngày) · thắng ${Math.round(100 * s.wr)}% · SL TB ${s.sl.toFixed(1)} · ${s.U >= 0 ? '+' : ''}${s.U.toFixed(0)}$ (trước ${s.a.toFixed(0)} · gần ${s.b.toFixed(0)}) · DD ${s.dd.toFixed(0)} · thua l.t. ${s.mls}`;
export { events, run, stat, fmt };
if (process.argv[1].endsWith('pullback.mjs')) {
  const ZONES = { 'chạm EMA34 (±0.1 ATR), không qua EMA89': e => e.zone <= 0.1 && e.deep >= -0.3, 'chạm vùng EMA34–89': e => e.zone <= 0.1 && e.deep >= -1, 'về gần EMA34 (≤0.5 ATR)': e => e.zone <= 0.5 && e.deep >= -1 };
  const FIL = { '': () => true, '+quét': e => e.swept, '+FVG': e => e.fvg, '+H1 cùng': e => e.h1ok, '+quét+H1': e => e.swept && e.h1ok };
  const rows = [];
  for (const emaTF of ['M15', 'M30']) { const EV = events(emaTF).filter(e => e.fresh <= 24);
    for (const tg of ['mss', 'engulf', 'ema21', 'cross9']) for (const [zn, zf] of Object.entries(ZONES)) for (const [fn, ff] of Object.entries(FIL)) { const L = EV.filter(e => e.tg === tg && zf(e) && ff(e));
      for (const [tn, to] of [['TP 1.5R', { rr: 1.5 }], ['TP 2R', { rr: 2 }], ['TP 3R', { rr: 3 }], ['TP đỉnh/đáy cũ', { tp: 'hi' }]]) { const s = stat(run(L, to)); if (s.n < 100) continue; rows.push({ k: `EMA ${emaTF} · ${tg} · ${zn}${fn} · ${tn}`, ...s }); } } }
  const ok = rows.filter(r => r.a > 0 && r.b > 0);
  console.log(`${rows.length} cấu hình (≥100 lệnh), lời cả 2 nửa năm: ${ok.length}`);
  console.log('\n=== ≥ 1.5 lệnh/ngày, lời cả 2 nửa (xếp theo nửa yếu hơn)'); ok.filter(r => r.pd >= 1.5).sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b)).slice(0, 15).forEach(r => console.log(fmt(r.k, r)));
  console.log('\n=== 0.8–1.5 lệnh/ngày, lời cả 2 nửa'); ok.filter(r => r.pd >= 0.8 && r.pd < 1.5).sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b)).slice(0, 15).forEach(r => console.log(fmt(r.k, r)));
  console.log('\n=== Lời nhiều nhất (bất kể số lệnh), lời cả 2 nửa'); ok.sort((x, y) => y.U - x.U).slice(0, 8).forEach(r => console.log(fmt(r.k, r)));
}
