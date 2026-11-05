// Thử các cách đặt TP / chọn thanh khoản cho kịch bản Sóng 15 (tin-hieu/wave.js), XAU 12 tháng, chia 2 nửa
import { createRequire } from 'node:module';
import path from 'node:path';
import { DIR, load } from './core.mjs';
const W = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'wave.js'));
const sym = process.env.SYM || 'XAU', SP = { XAU: 0.35, BTC: 18 }[sym], LOTV = { XAU: 2, BTC: 0.02 }[sym], S = Date.UTC(2026, 4, 5);
const D = { m5: load(sym, 'm5'), m15: load(sym, 'm15') };
const V = {
  'TP max(2R,15) · mọi mức · CE FVG': { entry: 'ce' },
  'TP max(2R,15) · mọi mức · mép FVG (mặc định)': {},
  'mép · chỉ PDH/PDL+tuần': { levels: ['PD', 'PW'] },
  'mép · PDH/PDL+tuần+London': { levels: ['PD', 'PW', 'London'] },
  'mép · TP 15 giá': { tpMode: 'pts' },
  'TP 2R · mọi mức · CE FVG': { tpMode: 'r', entry: 'ce' },
  'TP 15 giá · mọi mức · CE FVG': { tpMode: 'pts', entry: 'ce' },
  'TP 2R, bỏ nếu 2R<15 · CE FVG': { tpMode: 'skip' },
  'CE · PDH/PDL+tuần+London': { levels: ['PD', 'PW', 'London'], entry: 'ce' },
  'CE · chỉ PDH/PDL+tuần': { levels: ['PD', 'PW'], entry: 'ce' },
  'TP max(2R,15) · mép FVG': { entry: 'edge' },
  'TP max(3R,15) · CE FVG': { rr: 3 },
  'TP max(2R,15) · SL +0.5ATR': { slATR: 0.5 },
  'TP max(2R,15) · chờ khớp 2h': { expiry: 24 },
  'TP max(2R,20) · CE FVG': { minPts: 20 },
};
for (const [nm, cfg] of Object.entries(V)) {
  const L = W.run(D, { spread: SP, cfg }), F = L.filter(s => s.pts != null).sort((a, b) => a.exitT - b.exitT);
  let eq = 0, pk = 0, dd = 0; for (const s of F) { eq += s.pts * LOTV; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const h = (f) => { const G = F.filter(f); return `${G.length}L ${(G.reduce((a, s) => a + s.pts, 0) * LOTV).toFixed(0)}$ ${G.reduce((a, s) => a + s.r, 0).toFixed(1)}R`; };
  const w = F.filter(s => s.state === 'WIN').length, l = F.filter(s => s.state === 'LOSS').length, days = 343;
  console.log(nm.padEnd(38), `${L.length} tín hiệu · khớp ${F.length} (${(F.length / days * 7).toFixed(1)}/tuần) · TP ${w} SL ${l} · thắng ${Math.round(100 * w / F.length)}% · TP TB ${(F.filter(s => s.state === 'WIN').reduce((a, s) => a + s.pts, 0) / (w || 1)).toFixed(1)} giá · ${(eq).toFixed(0)}$ DD ${dd.toFixed(0)}$ | trước ${h(s => s.t < S)} · gần ${h(s => s.t >= S)}`);
}
