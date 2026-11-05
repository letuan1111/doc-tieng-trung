// Mô hình "EMA hồi + MSS" (rút ra khi tua từng nến M15 27/10 → 05/11):
//  xu hướng EMA34/89 M15 (EMA34 trên EMA89 = tăng) → giá HỒI về vùng EMA34 (chạm EMA34, không thủng sâu EMA89) → thường quét đáy/đỉnh nhỏ (SSL/BSL)
//  → MSS/BOS theo xu hướng trên khung kích hoạt (M5 hoặc M15) có FVG → limit FVG / vào ngay · SL ngoài đáy/đỉnh hồi · TP 2R / ≥ 15 giá
import { load, ema, atr, pivots, mapHTF } from './core.mjs';
const SP = 0.35, LOT = 2, S = Date.UTC(2026, 4, 5), F3 = Date.UTC(2026, 7, 5);
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), h1 = load('XAU', 'h1');
import { resample } from './core.mjs';
const h4 = resample(h1, 144e5), dirE = (x) => { const a = ema(x.map(v => v.c), 34), b = ema(x.map(v => v.c), 89); return x.map((_, i) => a[i] > b[i] ? 1 : -1); };
const H1D = dirE(h1), H4D = dirE(h4);
const e34 = ema(m15.map(x => x.c), 34), e89 = ema(m15.map(x => x.c), 89), A15 = atr(m15);
export function signals(tf, o) {
  const c = tf === 'm5' ? m5 : m15, n = c.length, E34 = tf === 'm15' ? e34 : mapHTF(c, m15, e34), E89 = tf === 'm15' ? e89 : mapHTF(c, m15, e89), AT = tf === 'm15' ? A15 : mapHTF(c, m15, A15);
  const D1 = mapHTF(c, h1, H1D), D4 = mapHTF(c, h4, H4D);
  const pv = pivots(c, o.L || 2), N = o.look || (tf === 'm5' ? 36 : 12), out = [], used = new Set();
  let ih = 0, il = 0; const sh = [], sl = [];
  for (let k = 100; k < n; k++) {
    while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
    const a = AT[k]; if (!(a > 0) || E34[k] == null) continue;
    for (const d of [1, -1]) {
      if (!(d > 0 ? E34[k] > E89[k] : E34[k] < E89[k])) continue;
      // điểm hồi sâu nhất trong N nến gần đây
      let pi = k - 1; for (let u = Math.max(1, k - N); u < k; u++) if (d > 0 ? c[u].l < c[pi].l : c[u].h > c[pi].h) pi = u;
      const pP = d > 0 ? c[pi].l : c[pi].h; if (used.has(pi * d)) continue;
      const touch = d > 0 ? pP <= E34[pi] + (o.touch ?? 0.1) * a : pP >= E34[pi] - (o.touch ?? 0.1) * a;
      const deep = d > 0 ? pP < E89[pi] - (o.deep ?? 1.0) * a : pP > E89[pi] + (o.deep ?? 1.0) * a;
      if (!touch || deep) continue;
      // MSS/BOS: đóng cửa vượt đỉnh/đáy swing gần nhất (đã xác nhận) nằm trước điểm hồi
      const P = (d > 0 ? sh : sl).filter(q => q.i < pi && q.i >= pi - 30).slice(-1)[0]; if (!P) continue;
      if (!(d > 0 ? c[k].c > P.p && c[k - 1].c <= P.p : c[k].c < P.p && c[k - 1].c >= P.p)) continue;
      used.add(pi * d);
      // đáy hồi có quét đáy swing trước đó không (SSL/BSL sweep)
      const prev = (d > 0 ? sl : sh).filter(q => q.i < pi && q.i >= pi - 40).slice(-1)[0], swept = !!(prev && (d > 0 ? pP < prev.p : pP > prev.p));
      let f = null; for (let m = pi + 2; m <= k; m++) { const bot = d > 0 ? c[m - 2].h : c[m].h, top = d > 0 ? c[m].l : c[m - 2].l; if (top > bot) { f = { top, bot }; } }
      const entry = o.entry === 'mkt' ? c[k].c : f ? (o.entry === 'ce' ? (f.top + f.bot) / 2 : (d > 0 ? f.top : f.bot)) : (o.needFVG ? null : pP + d * 0.5 * Math.abs(c[k].c - pP));
      if (entry == null) continue;
      const slP = pP - d * ((o.slATR ?? 0.3) * a + SP), risk = Math.abs(entry - slP); if (!(risk > 0) || (o.maxRisk && risk > o.maxRisk) || (o.minRisk && risk < o.minRisk)) continue;
      const tpD = o.tp === 'pts' ? o.pts : o.tp === 'max' ? Math.max(2 * risk, o.pts || 15) : (o.rr || 2) * risk, tp = entry + d * tpD;
      let fill = o.entry === 'mkt' ? k : -1, st = 'EXP', exitP = null;
      if (fill < 0) for (let u = k + 1; u < n && u <= k + (o.exp || (tf === 'm5' ? 12 : 8)); u++) { const x = c[u]; if (d > 0 ? x.h >= tp : x.l <= tp) { st = 'MISSED'; break; } if (d > 0 ? x.l <= entry : x.h >= entry) { fill = u; break; } if (d > 0 ? x.c < slP : x.c > slP) { st = 'INV'; break; } }
      if (fill >= 0) { st = 'TIME'; let u = fill + (o.entry === 'mkt' ? 1 : 0); for (; u < n && c[u].t - c[fill].t <= 2 * 864e5; u++) { const x = c[u]; if (d > 0 ? x.l <= slP : x.h >= slP) { st = 'LOSS'; exitP = slP; break; } if (u > fill && (d > 0 ? x.h >= tp : x.l <= tp)) { st = 'WIN'; exitP = tp; break; } } if (st === 'TIME') exitP = c[Math.min(u, n - 1)].c; }
      out.push({ tf, t: c[k].t, ct: c[k].ct, d, entry, sl: slP, tp, risk, st, swept, pnl: exitP != null ? d * (exitP - entry) - SP : null, hr: (new Date(c[k].t).getUTCHours() + 7) % 24, fvg: !!f, slope: d * (E34[k] - E34[Math.max(0, k - 8)]) / a, gap: d * (E34[k] - E89[k]) / a, h1: D1[k] === d, h4: D4[k] === d });
    }
  }
  return out;
}
export function show(title, L) {
  const F = L.filter(x => x.pnl != null).sort((a, b) => a.t - b.t), w = F.filter(x => x.st === 'WIN').length, l = F.filter(x => x.st === 'LOSS').length, P = F.reduce((s, x) => s + x.pnl, 0);
  let eq = 0, pk = 0, dd = 0; for (const x of F) { eq += x.pnl * LOT; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const h = (f) => (F.filter(f).reduce((s, x) => s + x.pnl, 0) * LOT).toFixed(0), ok = +h(x => x.t < S) > 0 && +h(x => x.t >= S) > 0;
  console.log(`${ok ? '✓' : ' '} ${title.padEnd(50)} ${String(F.length).padStart(4)} lệnh (${(F.length / 49).toFixed(1)}/tuần) · TP ${w} SL ${l} · thắng ${F.length ? Math.round(100 * w / F.length) : 0}% · SL TB ${(F.reduce((s, x) => s + x.risk, 0) / (F.length || 1)).toFixed(1)} · ${(P * LOT).toFixed(0)}$ DD ${dd.toFixed(0)}$ | trước ${h(x => x.t < S)} · gần ${h(x => x.t >= S)} · 3th ${h(x => x.t >= F3)}`);
  return { ok, n: F.length, P };
}
if (import.meta.url === `file://${process.argv[1]}` && process.env.REGIME) {
  for (const [tf, o, nm] of [['m15', {}, 'M15 FVG mép 2R'], ['m15', { entry: 'ce' }, 'M15 FVG giữa 2R'], ['m5', { entry: 'mkt' }, 'M5 vào ngay 2R'], ['m5', {}, 'M5 FVG mép 2R']]) { const L = signals(tf, o); console.log('\n== ' + nm);
    show('tất cả', L); for (const g of [0.5, 1, 1.5, 2]) show(`EMA34–89 cách ≥ ${g} ATR`, L.filter(x => x.gap >= g)); show('EMA H1 cùng chiều', L.filter(x => x.h1)); show('EMA H1 + H4 cùng chiều', L.filter(x => x.h1 && x.h4)); show('H1+H4 + cách ≥ 1 ATR', L.filter(x => x.h1 && x.h4 && x.gap >= 1)); show('H1+H4 + quét SSL/BSL', L.filter(x => x.h1 && x.h4 && x.swept)); show('H1 + cách ≥ 1 ATR + quét', L.filter(x => x.h1 && x.gap >= 1 && x.swept)); }
} else if (import.meta.url === `file://${process.argv[1]}`) {
  for (const tf of ['m15', 'm5']) {
    console.log(`\n===== kích hoạt trên ${tf.toUpperCase()} (EMA34/89 M15)`);
    for (const [nm, o] of [['FVG mép · TP 2R', {}], ['FVG giữa · TP 2R', { entry: 'ce' }], ['vào ngay khi MSS · TP 2R', { entry: 'mkt' }], ['FVG mép · TP max(2R,15)', { tp: 'max', pts: 15 }], ['FVG mép · TP 15 · SL ≤ 12', { tp: 'pts', pts: 15, maxRisk: 12 }], ['FVG mép · TP 2R · SL ≤ 12', { maxRisk: 12 }], ['FVG mép · TP 1.5R', { rr: 1.5 }], ['FVG mép · TP 3R', { rr: 3 }]]) {
      const L = signals(tf, o); show(nm, L);
      if (nm === 'FVG mép · TP 2R') { show('  + đáy/đỉnh hồi có quét SSL/BSL', L.filter(x => x.swept)); show('  + không quét', L.filter(x => !x.swept)); show('  + EMA34 dốc theo xu hướng', L.filter(x => x.slope > 0.5)); show('  + có FVG', L.filter(x => x.fvg));
        for (const [a, b, s] of [[7, 13, 'phiên Á 7–13h'], [13, 19, 'London 13–19h'], [19, 24, 'New York 19–24h'], [0, 7, 'đêm 0–7h']]) show('  + ' + s, L.filter(x => x.hr >= a && x.hr < b)); }
    }
  }
}
