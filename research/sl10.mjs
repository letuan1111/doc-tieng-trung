// Kiểm tra: cấu trúc ICT/SMC trên M5/M15/M30, TP 15 giá, SL khoảng 10 giá
//  'cố định 10': SL = entry ∓ 10 giá · 'cấu trúc 8–12': SL ngoài gốc sóng + 0.5 ATR, chỉ vào khi SL nằm trong 8–12 giá · 'cấu trúc ≤10, tối thiểu 6'
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load, resample, swingStruct } from './core.mjs';
const V3 = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'v3.js'));
const SP = 0.35, LOT = 2, TP = 15, SPLIT = Date.UTC(2026, 4, 5), F3 = Date.UTC(2026, 7, 5);
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), h1 = load('XAU', 'h1'), C = { m5, m15, m30: resample(m15, 18e5) };
const EXP = { m5: 12, m15: 8, m30: 6 }, MSX = { m5: 3e5, m15: 9e5, m30: 18e5 }, HOLD = 2 * 864e5;
const SLM = { 'SL cố định 10': (e, entry) => entry - e.d * (10 + SP), 'SL cấu trúc 8–12': (e, entry) => { const s = e.oP - e.d * (0.5 * e.a + SP), r = Math.abs(entry - s); return r >= 8 && r <= 12 ? s : null; }, 'SL cấu trúc 6–10': (e, entry) => { const s = e.oP - e.d * (0.5 * e.a + SP), r = Math.abs(entry - s); return r >= 6 && r <= 10 ? s : null; } };
const ALL = [];
for (const tf of ['m5', 'm15', 'm30']) {
  const c = C[tf]; V3.CFG[tf] = { entry: 'edge', slATR: 0.5, expiry: EXP[tf], hold: 999, window: false, sides: [1, -1], liq: ['pd', 'pw', 'london', 'asia', 'swing', 'none'], back: 3, filter: null };
  const SS = swingStruct(c);
  for (const e of V3.setups(c, tf, { h1 })) {
    const d = e.d, k = e.k, prev = SS[Math.max(0, e.oi - 1)], type = prev && prev.d === d ? 'BOS' : 'CHoCH', swept = e.lvName !== 'MSS (không quét)';
    let ob = null; for (let u = Math.min(k, e.oi + 1); u >= Math.max(0, e.oi - 3); u--) if (d * (c[u].c - c[u].o) < 0) { ob = d > 0 ? Math.max(c[u].o, c[u].h) : Math.min(c[u].o, c[u].l); break; }
    for (const [mode, entry] of [['FVG mép', d > 0 ? e.fvg.top : e.fvg.bot], ['FVG giữa', (e.fvg.top + e.fvg.bot) / 2], ['Order Block', ob]]) {
      if (entry == null || !(d > 0 ? entry < c[k].c : entry > c[k].c)) continue;
      for (const [sm, f] of Object.entries(SLM)) {
        const sl = f(e, entry); if (sl == null || !(d > 0 ? sl < entry : sl > entry)) continue; const tp = entry + d * TP;
        let fill = -1, st = 'EXP';
        for (let u = k + 1; u < c.length && u <= k + EXP[tf]; u++) { const x = c[u]; if (d > 0 ? x.h >= tp : x.l <= tp) { st = 'MISSED'; break; } if (d > 0 ? x.l <= entry : x.h >= entry) { fill = u; break; } if (d > 0 ? x.c < sl : x.c > sl) { st = 'INV'; break; } }
        let exitP = null;
        if (fill >= 0) { st = 'TIME'; let u = fill; for (; u < c.length && c[u].t - c[fill].t <= HOLD; u++) { const x = c[u]; if (d > 0 ? x.l <= sl : x.h >= sl) { st = 'LOSS'; exitP = sl; break; } if (u > fill && (d > 0 ? x.h >= tp : x.l <= tp)) { st = 'WIN'; exitP = tp; break; } } if (st === 'TIME') exitP = c[Math.min(u, c.length - 1)].c; }
        ALL.push({ tf, mode, sm, type, swept, sweep: e.lvName, t: c[k].t, ft: fill >= 0 ? c[fill].t : null, st, pnl: exitP != null ? d * (exitP - entry) - SP : null, h4: e.ctx.st4, sess: e.ctx.sess });
      }
    }
  }
}
const days = 343;
const show = (title, L) => { const F = L.filter(x => x.pnl != null), w = F.filter(x => x.st === 'WIN').length, l = F.filter(x => x.st === 'LOSS').length, P = F.reduce((s, x) => s + x.pnl, 0);
  const h = (f) => (F.filter(f).reduce((s, x) => s + x.pnl, 0) * LOT).toFixed(0); const ok = +h(x => x.t < SPLIT) > 0 && +h(x => x.t >= SPLIT) > 0;
  console.log(`${ok ? '✓' : ' '} ${title.padEnd(52)} ${String(F.length).padStart(4)} lệnh (${(F.length / days * 7).toFixed(1)}/tuần) · TP ${w} SL ${l} · thắng ${F.length ? Math.round(100 * w / F.length) : 0}% · ${(P * LOT).toFixed(0)}$ | 6th trước ${h(x => x.t < SPLIT)} · 6th gần ${h(x => x.t >= SPLIT)} · 3th ${h(x => x.t >= F3)}`); return { title, F, ok, P }; };
const R = [];
for (const tf of ['m5', 'm15', 'm30']) for (const sm of Object.keys(SLM)) { console.log(`\n== ${tf.toUpperCase()} · ${sm} · TP 15`);
  for (const [fam, f] of [['quét TK → CHoCH', x => x.swept && x.type === 'CHoCH'], ['quét TK → BOS', x => x.swept && x.type === 'BOS'], ['không quét · CHoCH', x => !x.swept && x.type === 'CHoCH'], ['không quét · BOS', x => !x.swept && x.type === 'BOS']])
    for (const m of ['FVG mép', 'FVG giữa', 'Order Block']) R.push({ tf, sm, fam, m, ...show(`${fam} · ${m}`, ALL.filter(x => x.tf === tf && x.sm === sm && x.mode === m && f(x))) }); }
console.log('\n== CÁC CÁCH CÓ LỜI Ở CẢ 2 NỬA NĂM (≥ 10 lệnh), xếp theo lời');
for (const r of R.filter(r => r.ok && r.F.length >= 10).sort((a, b) => b.P - a.P)) console.log(`  ${r.tf.toUpperCase()} · ${r.sm} · ${r.fam} · ${r.m}: ${r.F.length} lệnh, thắng ${Math.round(100 * r.F.filter(x => x.st === 'WIN').length / r.F.length)}%, ${(r.P * LOT).toFixed(0)}$`);
