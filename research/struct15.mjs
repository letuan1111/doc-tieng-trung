// Kiểm tra kỹ: setup đúng cấu trúc ICT/SMC trên M5 / M15 / M30 (quét thanh khoản → MSS + displacement → FVG chưa lấp)
// → limit tại FVG, SL ngoài điểm quét → giá có chạy được ≥ 15 giá trước khi chạm SL không? Tách theo khung, thanh khoản, độ rộng SL, phiên, H4.
// node research/struct15.mjs [XAU] [15]
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load, resample, swingStruct } from './core.mjs';
const V3 = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'v3.js'));
const sym = process.argv[2] || 'XAU', TP = +(process.argv[3] || 15), SP = { XAU: 0.35, BTC: 18 }[sym], LOT = { XAU: 2, BTC: 0.02 }[sym];
const SPLIT = Date.UTC(2026, 4, 5), F3 = Date.UTC(2026, 7, 5);
const m5 = load(sym, 'm5'), m15 = load(sym, 'm15'), h1 = load(sym, 'h1'), C = { m5, m15, m30: resample(m15, 18e5) };
const EXP = { m5: 12, m15: 8, m30: 6 }, HOLD = 2 * 864e5;
const ALL = [];
for (const tf of ['m5', 'm15', 'm30']) {
  const c = C[tf];
  V3.CFG[tf] = { entry: 'edge', slATR: 0.5, expiry: EXP[tf], hold: 999, window: false, sides: [1, -1], liq: ['pd', 'pw', 'london', 'asia', 'swing', 'none'], back: 3, filter: null };
  if (!V3.MS[tf]) V3.MS[tf] = { m5: 3e5 }[tf];
  const ev = V3.setups(c, tf, { h1 }), SS = swingStruct(c);
  for (const e of ev) {
    const d = e.d, k = e.k, sl = e.oP - d * (0.5 * e.a + SP), leg = Math.abs(e.ext - e.oP);
    // SMC: CHoCH = phá ngược cấu trúc swing của chính khung đó (đảo chiều), BOS = phá cùng chiều (tiếp diễn)
    const prev = SS[Math.max(0, e.oi - 1)], type = prev && prev.d === d ? 'BOS' : 'CHoCH';
    // SMC Order Block: nến ngược chiều cuối cùng quanh gốc sóng (oi-3 … oi+1)
    let ob = null; for (let u = Math.min(k, e.oi + 1); u >= Math.max(0, e.oi - 3); u--) if (d * (c[u].c - c[u].o) < 0) { ob = { top: Math.max(c[u].o, c[u].h), bot: Math.min(c[u].o, c[u].l) }; break; }
    for (const mode of ['edge', 'ce', 'ob', 'ote']) {
      const entry = mode === 'edge' ? (d > 0 ? e.fvg.top : e.fvg.bot) : mode === 'ce' ? (e.fvg.top + e.fvg.bot) / 2 : mode === 'ob' ? (ob ? (d > 0 ? ob.top : ob.bot) : null) : e.ext - d * 0.705 * leg;
      if (entry == null) continue; const risk = Math.abs(entry - sl), disc = leg > 0 ? (d > 0 ? (e.ext - entry) / leg : (entry - e.ext) / leg) >= 0.5 : false;
      if (!(d > 0 ? entry < c[k].c && entry > sl : entry > c[k].c && entry < sl)) continue;
      const tp = entry + d * TP;
      let fill = -1, st = 'EXPIRED';
      for (let u = k + 1; u < c.length && u <= k + EXP[tf]; u++) { const x = c[u]; if (d > 0 ? x.h >= tp : x.l <= tp) { st = 'MISSED'; break; } if (d > 0 ? x.l <= entry : x.h >= entry) { fill = u; break; } if (d > 0 ? x.c < sl : x.c > sl) { st = 'INVALID'; break; } }
      let mfe = 0, hit = null, exitP = null;
      if (fill >= 0) { st = 'TIME';
        for (let u = fill; u < c.length && c[u].t - c[fill].t <= HOLD; u++) { const x = c[u];
          if (d > 0 ? x.l <= sl : x.h >= sl) { st = 'LOSS'; exitP = sl; break; }
          mfe = Math.max(mfe, d > 0 ? x.h - entry : entry - x.l);
          if (u > fill && mfe >= TP) { st = 'WIN'; exitP = tp; break; } }
        if (st === 'TIME') { const u = Math.min(c.length - 1, fill + Math.round(HOLD / V3.MS[tf])); exitP = c[u].c; } }
      const pnl = exitP != null ? d * (exitP - entry) - SP : null;
      ALL.push({ tf, mode, type, disc, swept: e.lvName !== 'MSS (không quét)', t: c[k].t, d, sweep: e.lvName, risk, st, pnl, fill: fill >= 0, sess: e.ctx.sess, h4: e.ctx.st4, h1s: e.ctx.st1, kz: e.ctx.kzMss, depth: e.ctx.depth, move: e.ctx.moveATR });
    }
  }
}
const days = 343, pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
function show(title, L) {
  const Fl = L.filter(x => x.fill), w = Fl.filter(x => x.st === 'WIN').length, l = Fl.filter(x => x.st === 'LOSS').length, P = Fl.reduce((s, x) => s + (x.pnl || 0), 0);
  const half = (f) => { const G = Fl.filter(f); return `${(G.reduce((s, x) => s + (x.pnl || 0), 0) * LOT).toFixed(0)}$`; };
  console.log(`  ${title.padEnd(34)} setup ${String(L.length).padStart(4)} · khớp ${String(Fl.length).padStart(4)} (${(Fl.length / days).toFixed(2)}/ngày) · chạy đủ ${TP} giá trước SL ${pct(w, w + l).padStart(4)} (${w}/${w + l}) · SL TB ${(Fl.reduce((s, x) => s + x.risk, 0) / (Fl.length || 1)).toFixed(1)} · TB ${(P / (Fl.length || 1)).toFixed(1)} giá/lệnh · ${(P * LOT).toFixed(0)}$ (6th trước ${half(x => x.t < SPLIT)} · 6th gần ${half(x => x.t >= SPLIT)} · 3th ${half(x => x.t >= F3)})`);
}
const MODE = { edge: 'FVG mép', ce: 'FVG giữa', ob: 'Order Block', ote: 'OTE 70.5%' };
for (const tf of ['m5', 'm15', 'm30']) {
  console.log(`\n======== ${tf.toUpperCase()} · TP cố định ${TP} giá · SL ngoài gốc sóng + 0.5 ATR`);
  const T = ALL.filter(x => x.tf === tf);
  for (const [fam, f] of [['ICT: quét TK → MSS(CHoCH)', x => x.swept && x.type === 'CHoCH'], ['ICT: quét TK → BOS', x => x.swept && x.type === 'BOS'], ['SMC: CHoCH không quét', x => !x.swept && x.type === 'CHoCH'], ['SMC: BOS không quét', x => !x.swept && x.type === 'BOS']])
    for (const m of ['edge', 'ce', 'ob', 'ote']) show(`${fam} · ${MODE[m]}`, T.filter(x => f(x) && x.mode === m));
  const E = T.filter(x => x.swept && x.mode === 'edge');
  console.log('  -- ICT quét TK + FVG mép, tách theo:');
  for (const s of [...new Set(E.map(x => x.sweep))].sort()) show('quét ' + s, E.filter(x => x.sweep === s));
  for (const [a, b] of [[0, 5], [5, 10], [10, 15], [15, 20], [20, 1e9]]) show(`SL ${a}–${b > 1e6 ? '∞' : b} giá`, E.filter(x => x.risk > a && x.risk <= b));
  for (const s of ['đêm', 'Á', 'London', 'New York']) show('phiên ' + s, E.filter(x => x.sess === s));
  show('cấu trúc H4 cùng chiều', E.filter(x => x.h4)); show('cấu trúc H4 ngược', E.filter(x => x.h4 === false));
  show('MSS trong killzone', E.filter(x => x.kz)); show('entry ở discount/premium', E.filter(x => x.disc)); show('sóng phá ≥ 3 ATR', E.filter(x => x.move >= 3));
}
