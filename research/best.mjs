// Chọn bản tốt nhất: v4.1 + các cách nới đã có lời + cách chốt lời theo con sóng (TP cố định vs thanh khoản đối diện)
import { createRequire } from 'node:module';
import path from 'node:path';
import { DIR, load } from './core.mjs';
const V = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'v3.js')); const B = {}; for (const tf of V.TFS) B[tf] = { ...V.CFG[tf] };
const SP = { XAU: 0.35, BTC: 18, ETH: 1.2 }, CT = { XAU: 2, BTC: 0.02, ETH: 0.02 }, S = Date.UTC(2026, 4, 5), F = Date.UTC(2025, 10, 5);
const D = {}; for (const sym of ['XAU', 'BTC', 'ETH']) D[sym] = { m15: load(sym, 'm15'), h1: load(sym, 'h1') };
const Fx = { m15: { expiry: 24 }, m30: { expiry: 20 }, h1: { expiry: 16, sides: [1, -1] } };
const all = (o) => Object.fromEntries(V.TFS.map(t => [t, o]));
const mix = (...a) => { const o = {}; for (const x of a) for (const [k, v] of Object.entries(x)) o[k] = { ...(o[k] || {}), ...v }; return o; };
const VARS = {
  'v4.1 đang chạy': {},
  'F: chờ lâu + H1 cả BUY': Fx,
  'F + TP 3R': mix(Fx, all({ tp: 3 })),
  'F + TP 1.5R': mix(Fx, all({ tp: 1.5 })),
  'F + TP thanh khoản (2–5R)': mix(Fx, all({ tp: 'liq', tpMin: 2, tpMax: 5 })),
  'F + TP thanh khoản (2–4R)': mix(Fx, all({ tp: 'liq', tpMin: 2, tpMax: 4 })),
  'F + TP thanh khoản (2–3R)': mix(Fx, all({ tp: 'liq', tpMin: 2, tpMax: 3 })),
  'F + TP thanh khoản (1.5–5R)': mix(Fx, all({ tp: 'liq', tpMin: 1.5, tpMax: 5 })),
  'v4.1 + TP thanh khoản (2–5R)': all({ tp: 'liq', tpMin: 2, tpMax: 5 }),
};
for (const [nm, v] of Object.entries(VARS)) {
  for (const tf of V.TFS) V.CFG[tf] = { ...B[tf], ...(v[tf] || {}) };
  const seg = {}; let n = 0, R = 0, U = 0, w = 0, ddMax = 0;
  for (const sym of ['XAU', 'BTC', 'ETH']) { const L = V.run(D[sym], { spread: SP[sym] }).filter(s => s.r != null && s.ct >= F).sort((a, b) => a.exitT - b.exitT);
    for (const [pn, f] of [['trước', s => s.ct < S], ['gần', s => s.ct >= S]]) { const P = L.filter(f); let e = 0, p = 0, dd = 0, u = 0; for (const s of P) { e += s.r; p = Math.max(p, e); dd = Math.max(dd, p - e); u += (s.side * (s.exitP - s.entry) - SP[sym]) * CT[sym]; }
      seg[sym + ' ' + pn] = `${e >= 0 ? '+' : ''}${e.toFixed(1)}R(${P.length})`; if (sym !== 'ETH') { n += P.length; R += e; U += u; w += P.filter(s => s.r > 0).length; ddMax = Math.max(ddMax, dd); } else seg[sym + ' ' + pn] += ''; seg['_' + sym + pn] = e; } }
  const neg = Object.entries(seg).filter(([k, x]) => k.startsWith('_') && x < 0).length;
  console.log(nm.padEnd(30), `${n}L · thắng ${Math.round(100 * w / n)}% · ${R >= 0 ? '+' : ''}${R.toFixed(1)}R (${(R / n).toFixed(2)}/L) · ${U.toFixed(0)}$ · DD ${ddMax.toFixed(1)}R · âm ${neg}/6 |`, Object.entries(seg).filter(([k]) => !k.startsWith('_')).map(([k, x]) => `${k} ${x}`).join(' · '));
}
