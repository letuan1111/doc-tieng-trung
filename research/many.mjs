// Muốn ~90 lệnh / 30 ngày (XAU+BTC) trên M15/M30/H1: thử các cách tăng số lệnh và xem còn lời không
import { createRequire } from 'node:module';
import path from 'node:path';
import { DIR, load } from './core.mjs';
const V = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'v3.js')); const B = {}; for (const tf of V.TFS) B[tf] = { ...V.CFG[tf] };
const SP = { XAU: 0.35, BTC: 18, ETH: 1.2 }, CT = { XAU: 2, BTC: 0.02 }, S = Date.UTC(2026, 4, 5), F = Date.UTC(2025, 10, 5);
const D = {}; for (const sym of ['XAU', 'BTC']) D[sym] = { m15: load(sym, 'm15'), h1: load(sym, 'h1') };
const all = (o) => Object.fromEntries(V.TFS.map(t => [t, o]));
const LIQ = ['pd', 'london', 'asia', 'pw', 'swing'];
const VARS = {
  'v4.2 đang chạy': [{}, false],
  'v4.2 + mỗi khung 1 lệnh': [{}, true],
  'quét mọi thanh khoản (PDH/L, London, Á, tuần, swing)': [all({ liq: LIQ }), false],
  '  + mỗi khung 1 lệnh': [all({ liq: LIQ }), true],
  '  + bỏ mọi bộ lọc': [all({ liq: LIQ, filter: null, sides: [1, -1] }), true],
  'mọi MSS có FVG (không cần quét)': [all({ liq: [...LIQ, 'none'], filter: null, sides: [1, -1] }), true],
  '  + bias cấu trúc H4': [all({ liq: [...LIQ, 'none'], filter: x => x.st4, sides: [1, -1] }), true],
  '  + bias H4 + ngoài phiên Á': [all({ liq: [...LIQ, 'none'], filter: x => x.st4 && x.sess !== 'Á', sides: [1, -1] }), true],
  '  + bias H4 + killzone': [all({ liq: [...LIQ, 'none'], filter: x => x.st4 && !!x.kzMss, sides: [1, -1] }), true],
  'quét mọi TK + bias H4, mỗi khung 1 lệnh': [all({ liq: LIQ, filter: x => x.st4, sides: [1, -1] }), true],
};
for (const [nm, [v, per]] of Object.entries(VARS)) {
  for (const tf of V.TFS) V.CFG[tf] = { ...B[tf], ...(v[tf] || {}) };
  const out = []; let n = 0, R = 0, U = 0, w = 0, tot = { trước: 0, gần: 0 }, cnt = { trước: 0, gần: 0 };
  for (const sym of ['XAU', 'BTC']) { const L = V.run(D[sym], { spread: SP[sym], perTF: per }).filter(s => s.r != null && s.ct >= F);
    for (const [pn, f] of [['trước', s => s.ct < S], ['gần', s => s.ct >= S]]) { const P = L.filter(f); const e = P.reduce((a, s) => a + s.r, 0); tot[pn] += e; cnt[pn] += P.length;
      out.push(`${sym} ${pn} ${e >= 0 ? '+' : ''}${e.toFixed(1)}R`); n += P.length; R += e; w += P.filter(s => s.r > 0).length; U += P.reduce((a, s) => a + (s.side * (s.exitP - s.entry) - SP[sym]) * CT[sym], 0); } }
  console.log(nm.padEnd(52), `${(n / 365 * 30).toFixed(0).padStart(3)} lệnh/30 ngày · thắng ${Math.round(100 * w / n)}% · ${(R / n).toFixed(2)}R/lệnh · 12 tháng ${R >= 0 ? '+' : ''}${R.toFixed(0)}R ${U.toFixed(0)}$ |`, out.join(' · '));
}
