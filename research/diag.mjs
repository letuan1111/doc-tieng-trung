// Chẩn đoán: lệnh của engine hiện tại (cũ / mới) trong 6 tháng bị SL vì sao
import { createRequire } from 'node:module';
import path from 'node:path';
import { DIR, load, resample, atr, ema, swingStruct, mapHTF, inKZ, MS } from './core.mjs';
const req = createRequire(import.meta.url);
req(path.join(DIR, '..', 'scanner', '_old_ict.js')); const OLD = globalThis.ICT; delete globalThis.ICT;
req(path.join(DIR, '..', 'bot-tin-hieu', 'ict.js')); const NEW = globalThis.ICT;

const CFG = { rr: 2, minRR: 1.5, expiry: 20, maxBars: 48, cost: 0.0004, freshBars: 2, minGrade: 'A', htf: 'grade' };
const SPREAD = { XAU: 0.3, BTC: 20 };
const rows = [];
for (const sym of ['XAU', 'BTC']) {
  const D = { m5: load(sym, 'm5'), m15: load(sym, 'm15'), h1: load(sym, 'h1') };
  const h4 = resample(D.h1, MS.h4), S1 = swingStruct(D.h1), S4 = swingStruct(h4);
  for (const [eng, E, tfs] of [['cũ', OLD, ['m5', 'm15', 'h1']], ['mới', NEW, ['m15', 'h1']]]) for (const tf of tfs) {
    const c = D[tf], A = atr(c), e89 = ema(c.map(x => x.c), 89);
    const HS = tf === 'h1' ? mapHTF(c, h4, S4) : mapHTF(c, D.h1, S1);
    const cons = E.consensus(c, ['m5', 'm15', 'h1'].map(t => ({ name: t.toUpperCase(), c: D[t] })));
    const a = E.analyze(c, { ...CFG, cons, spread: SPREAD[sym] });
    for (const t of a.bt.trades) {
      if (t.r == null || (E.GRADE_RANK[t.grade] || 0) < 2) continue;
      const i = t.i, d = t.side, at = A[i], hs = HS[i];
      let mfe = 0; for (let j = t.fill; j <= t.exit; j++) mfe = Math.max(mfe, d > 0 ? c[j].h - t.entry : t.entry - c[j].l);
      const pd = hs && hs.hi > hs.lo ? (d > 0 ? (t.entry - hs.lo) / (hs.hi - hs.lo) : (hs.hi - t.entry) / (hs.hi - hs.lo)) : null;
      const hr = new Date(c[i].t).getUTCHours();
      rows.push({ eng, sym, tf, state: t.state, r: t.r, model: t.model, side: d,
        riskATR: t.risk / at, htf: hs ? (hs.d === d ? 'cùng' : hs.d === 0 ? 'chưa rõ' : 'ngược') : 'chưa rõ', pd,
        kz: inKZ(c[i].t), sess: hr < 6 ? 'Á' : hr < 12 ? 'London' : hr < 17 ? 'NY' : 'tối', ext: d * (t.entry - e89[i]) / at,
        mfeR: mfe / t.risk, bars: t.exit - t.fill, month: new Date(c[i].t).toISOString().slice(0, 7) });
    }
  }
}
const sum = (L) => { const n = L.length, w = L.filter(x => x.r > 0).length, R = L.reduce((s, x) => s + x.r, 0); return `${String(n).padStart(4)} lệnh | thắng ${n ? Math.round(100 * w / n) : 0}% | ${R >= 0 ? '+' : ''}${R.toFixed(1)}R | ${n ? (R / n).toFixed(2) : '—'}R/lệnh`; };
const by = (L, f, title) => { console.log(`  · ${title}`); const g = {}; for (const x of L) (g[f(x)] = g[f(x)] || []).push(x); for (const k of Object.keys(g).sort()) console.log(`      ${String(k).padEnd(22)} ${sum(g[k])}`); };
for (const eng of ['cũ', 'mới']) {
  const L = rows.filter(x => x.eng === eng);
  console.log(`\n===== ENGINE ${eng.toUpperCase()} · 6 tháng · ${sum(L)}`);
  by(L, x => `${x.sym} ${x.tf}`, 'theo cặp / khung');
  by(L, x => x.month, 'theo tháng');
  by(L, x => x.model, 'mô hình (sweep = quét rồi MSS, bos = phá cấu trúc tiếp diễn)');
  by(L, x => x.htf, 'cấu trúc swing khung lớn so với lệnh');
  by(L, x => x.pd == null ? 'chưa rõ' : x.pd <= 0.5 ? 'đúng vùng (≤50%)' : x.pd <= 0.75 ? 'lưng chừng (50–75%)' : 'đuổi giá (>75%)', 'vị trí entry trong dealing range khung lớn');
  by(L, x => x.sess, 'phiên (giờ UTC)');
  by(L, x => x.riskATR < 1 ? 'a <1 ATR' : x.riskATR < 2 ? 'b 1–2 ATR' : x.riskATR < 3.5 ? 'c 2–3.5 ATR' : 'd >3.5 ATR', 'độ rộng SL');
  by(L, x => x.ext < 0 ? 'a dưới EMA89 (ngược)' : x.ext < 2 ? 'b gần EMA89 <2 ATR' : x.ext < 4 ? 'c 2–4 ATR' : 'd quá xa >4 ATR', 'khoảng cách entry tới EMA89');
  const SL = L.filter(x => x.state === 'LOSS');
  console.log(`  · ${SL.length} lệnh dính SL, nguyên nhân (một lệnh có thể nhiều lý do):`);
  const why = { 'đã lời ≥1R rồi quay đầu': x => x.mfeR >= 1, 'dính SL trong ≤3 nến': x => x.bars <= 3, 'SL <1 ATR (quá sát)': x => x.riskATR < 1, 'ngược cấu trúc khung lớn': x => x.htf === 'ngược', 'mua/bán đuổi (>75% range)': x => x.pd != null && x.pd > 0.75, 'ngoài killzone': x => !x.kz, 'entry xa EMA89 >4 ATR': x => x.ext > 4 };
  for (const [k, f] of Object.entries(why)) { const n = SL.filter(f).length; console.log(`      ${k.padEnd(28)} ${n} (${Math.round(100 * n / (SL.length || 1))}%)`); }
}
