import path from 'node:path'; import { createRequire } from 'node:module';
import { DIR, load } from './core.mjs';
const req = createRequire(import.meta.url), M = (f) => req(path.join(DIR, '..', 'tin-hieu', f));
const V3 = M('v3.js'), EMAPB = M('emapb.js'), ZONES = M('zones.js');
for (const SYM of ['XAU2Y', 'BTC']) {
  const BTC = SYM === 'BTC', SP = BTC ? 18 : 0.35, K = BTC ? 20 : 1;
  const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), h1 = load(SYM, 'h1'), m30 = V3.resample(m15, 18e5), END = m15.at(-1).ct, ST = END - 365 * 864e5, HALF = ST + 182.5 * 864e5;
  const fin = (s) => ['WIN', 'LOSS', 'TIME'].includes(s.state);
  const rep = (nm, L) => { L = L.filter(s => fin(s) && (s.fillT || s.ct) >= ST); const R = (s) => s.pts != null ? s.pts / s.risk : s.r; const f = (G) => { const w = G.filter(s => s.state === 'WIN').length; return `${G.length}L ${G.length ? Math.round(100 * w / G.length) : 0}% ${G.reduce((a, s) => a + R(s), 0).toFixed(1)}R`; };
    let eq = 0, pk = 0, dd = 0; for (const s of L.sort((a, b) => a.exitT - b.exitT)) { eq += R(s); pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
    console.log(`${SYM} ${nm.padEnd(30)} ${f(L)} · DD ${dd.toFixed(1)}R | nửa đầu ${f(L.filter(s => (s.fillT || s.ct) < HALF))} · nửa sau ${f(L.filter(s => (s.fillT || s.ct) >= HALF))}`); };
  const A = V3.runAll({ m15, m30, h1 }, { spread: SP, now: END });
  for (const tf of ['m15', 'm30', 'h1']) rep('V4 Chuẩn ' + tf, A.filter(s => s.grade === 'A' && s.tf === tf));
  rep('V4 Chuẩn tất cả', A.filter(s => s.grade === 'A'));
  const Z = ZONES.run({ m5, m15, h1 }, { spread: SP, cfg: BTC ? {} : {} }); rep('AI Vùng S/R (AI≥2)', Z.filter(s => s.tgOK)); rep('Vùng S/R tất cả', Z);
  const E = EMAPB.run({ m5, m15 }, { spread: SP, cfg: { maxSL: 30 * K } }); rep('EMA hồi M30', E); rep('EMA hồi giờ TG', E.filter(s => s.tgOK));
}
// gói đề xuất: mỗi mã 1 lệnh một lúc
{ const one = (L) => { const o = []; let free = 0; for (const s of L.sort((a, b) => (a.fillT || a.ct) - (b.fillT || b.ct))) { const t = s.fillT || s.ct; if (t >= free) { o.push(s); free = s.exitT; } } return o; };
  const run = (SYM) => { const BTC = SYM === 'BTC', SP = BTC ? 18 : 0.35; const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), h1 = load(SYM, 'h1'), m30 = V3.resample(m15, 18e5), END = m15.at(-1).ct, ST = END - 365 * 864e5;
    const fin = (s) => ['WIN', 'LOSS', 'TIME'].includes(s.state) && (s.fillT || s.ct) >= ST && s.exitT;
    const L = BTC ? V3.runAll({ m15, m30, h1 }, { spread: SP, now: END }).filter(s => s.grade === 'A' && fin(s)) : ZONES.run({ m5, m15, h1 }, { spread: SP }).filter(s => s.tgOK && fin(s)).concat(EMAPB.run({ m5, m15 }, { spread: SP, cfg: { maxSL: 30 } }).filter(s => s.tgOK && fin(s)).map(s => ({ ...s, half: 1 })));
    const O = one(L), R = (s) => (s.pts != null ? s.pts / s.risk : s.r) * (s.half ? 0.5 : 1); let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; const mon = {};
    for (const s of O) { eq += R(s); pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = R(s) < 0 ? ls + 1 : 0; ml = Math.max(ml, ls); const k = new Date(s.exitT).toISOString().slice(0, 7); mon[k] = (mon[k] || 0) + R(s); }
    const w = O.filter(s => s.state === 'WIN').length; console.log(`GÓI ${SYM}: ${O.length} lệnh, thắng ${Math.round(100 * w / O.length)}%, ${eq.toFixed(1)}R (≈ ${(eq * 0.5).toFixed(1)}% vốn với 0.5%/lệnh), DD ${dd.toFixed(1)}R, thua l.t. ${ml}, tháng lời ${Object.values(mon).filter(v => v > 0).length}/${Object.keys(mon).length}`); };
  run('XAU2Y'); run('BTC'); }
