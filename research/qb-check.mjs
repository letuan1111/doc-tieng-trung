// Kiểm module tin-hieu/quetbien.js: Dukascopy 12 tháng (giống nghiên cứu), năm trước đó (chưa dùng để chọn luật) và giá OKX
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load, resample } from './core.mjs';
const QB = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'quetbien.js'));
const rep = (nm, L, a, b) => { L = L.filter(s => s.ct >= a && s.ct < b && QB.FINAL[s.state]); const h = a + (b - a) / 2;
  const f = (G) => { const w = G.filter(s => s.state === 'WIN').length, u = G.reduce((x, s) => x + s.pts * 2, 0); return `${G.length}L TP ${Math.round(100 * w / (G.length || 1))}% ${(u >= 0 ? '+' : '') + Math.round(u)}$`; };
  let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; for (const s of L) { eq += s.pts * 2; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = s.pts < 0 ? ls + 1 : 0; ml = Math.max(ml, ls); }
  console.log(`${nm.padEnd(44)} ${f(L).padEnd(18)} DD ${Math.round(dd)}$ · thua l.t. ${ml} · ${(L.length / ((b - a) / 6048e5)).toFixed(1)} lệnh/tuần | nửa đầu ${f(L.filter(s => s.ct < h))} | nửa sau ${f(L.filter(s => s.ct >= h))}`); };
const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
{ const m5 = resample(m1, 3e5), m15 = resample(m1, 9e5), e = m5.at(-1).ct; rep('Dukascopy 12 tháng (dùng để chọn luật)', QB.run({ m5, m15 }, { spread: 0.35 }), m5[0].t + 20 * 864e5, e); }
{ const m5 = load('XAU2Y', 'm5'), m15 = load('XAU2Y', 'm15'); rep('Dukascopy năm TRƯỚC (11/2024–11/2025, chưa dùng)', QB.run({ m5, m15 }, { spread: 0.35 }), m5[0].t + 20 * 864e5, Date.parse('2025-11-15')); }
{ const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), e = m5.at(-1).ct; const L = QB.run({ m5, m15 }, { spread: 0.35 }); rep('OKX 12 tháng (giá dùng trên web)', L, m5[0].t + 20 * 864e5, e); rep('OKX 12 tháng, spread 0.6', QB.run({ m5, m15 }, { spread: 0.6 }), m5[0].t + 20 * 864e5, e); }
