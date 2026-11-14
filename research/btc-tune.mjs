// Tinh chỉnh 4 chiến lược (🧭 X · 🧱 Z · 🎯 H · 🌅 P) cho BTC — OKX BTC-USDT-SWAP 12 tháng, spread 18, chia 2 nửa
import { createRequire } from 'node:module'; import { load } from './core.mjs';
const rq = createRequire(import.meta.url), M = (f) => rq('../tin-hieu/' + f);
const X = M('xuhuong.js'), Z = M('zones.js'), H = M('hoisau.js'), P = M('asianbo.js');
const sym = process.argv[2] || 'BTC', SP = +(process.argv[3] || 18), LOT = sym.startsWith('BTC') ? 0.01 : 1; // BTC: 0.01 lot ≈ 0.01$/giá · vàng: 0.01 lot = 1$/giá
const D = { m5: load(sym, 'm5'), m15: load(sym, 'm15'), h1: load(sym, 'h1') }, T0 = D.m15[400].t, mid = (T0 + D.m15.at(-1).t) / 2;
const rep = (nm, L) => { const F = L.filter(s => s.exitT && s.pts != null && s.state !== 'SKIP' && s.state !== 'EXPIRED' && s.t >= T0); const part = (f) => { const P_ = F.filter(f); return { n: P_.length, win: P_.length ? Math.round(100 * P_.filter(s => s.pts > 0).length / P_.length) : 0, R: +P_.reduce((a, s) => a + (s.r || 0), 0).toFixed(1), usd: Math.round(P_.reduce((a, s) => a + s.pts * LOT, 0)) }; };
  const a = part(() => 1), h1 = part(s => s.t < mid), h2 = part(s => s.t >= mid); console.log(nm.padEnd(46), `${a.n} lệnh ${a.win}% ${a.R}R ${a.usd}$`, '| nửa1', h1.R + 'R', h1.usd + '$', '| nửa2', h2.R + 'R', h2.usd + '$'); return { nm, a, h1, h2 }; };
const out = [];
out.push(rep('🧭 X mặc định', X.run(D, { spread: SP }).filter(s => s.fillT)));
for (const rr of [1.5, 2.5]) { X.CFG.rr = rr; out.push(rep(`🧭 X rr ${rr}`, X.run(D, { spread: SP }).filter(s => s.fillT))); } X.CFG.rr = 2;
for (const k of [0.5]) { X.CFG.rngK = k; out.push(rep(`🧭 X SL 0.5 biên`, X.run(D, { spread: SP }).filter(s => s.fillT))); } X.CFG.rngK = 0.3;
out.push(rep('🌅 P mặc định', P.run(D, { spread: SP })));
for (const c of [{ minPct: 0.5, maxPct: 3 }, { minPct: 0.8, maxPct: 4, capPct: 1.2 }, { rr: 2, capPct: 1.0, maxPct: 3 }]) out.push(rep('🌅 P ' + JSON.stringify(c), P.run(D, { spread: SP, cfg: c })));
out.push(rep('🧱 Z mặc định', Z.run(D, { spread: SP })));
for (const c of [{ aiMin: 1 }, { rr: 2 }, { strong: [8, 9, 14, 15, 19, 20, 21, 22], dead: [] }]) out.push(rep('🧱 Z ' + JSON.stringify(c), Z.run(D, { spread: SP, cfg: c })));
for (const c of [{ deepA: 2.4, tpA: 2.4, minA: 2.4, maxA: 4 }, { deepA: 3, tpA: 3, minA: 2.4, maxA: 5 }, { deepA: 2, tpA: 2, minA: 2, maxA: 4 }, { deepA: 3, tpA: 2, minA: 2, maxA: 4 }]) out.push(rep('🎯 H ' + JSON.stringify(c), H.run(D, { spread: SP, cfg: c })));
if (!sym.startsWith('BTC')) out.push(rep('🎯 H mặc định (giá cố định)', H.run(D, { spread: SP })));
