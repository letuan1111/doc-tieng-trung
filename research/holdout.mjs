// Kiểm tra ngoài mẫu thật: cấu hình chọn từ 6 tháng gần đây, chạy trên 6 tháng TRƯỚC đó (chưa từng dùng) + ETH
import { createRequire } from 'node:module';
import path from 'node:path';
import { DIR, load } from './core.mjs';
import { prepare, entryOf, simulate, setupOf, ENTRIES, SLBUF, TPS } from './engine2.mjs';
const req = createRequire(import.meta.url);
req(path.join(DIR, '..', 'bot-tin-hieu', 'ict.js')); const LIVE = globalThis.ICT;

const SPLIT = Date.UTC(2026, 3, 28), SPREAD = { XAU: 0.35, BTC: 18, ETH: 1.2 }, TFS = ['m5', 'm15', 'h1'];
const OPT = { m5: { expiry: 12, hold: 96 }, m15: { expiry: 12, hold: 96 }, h1: { expiry: 8, hold: 72 } };
const V = {
  'MỚI: A+B+C · HTF · EMA · FVG CE · SL+1ATR · 2R': { S: ['A', 'B', 'C'], htf: 1, em: 1, en: 0, sb: 2, tp: 1 },
  'MỚI không EMA':                                  { S: ['A', 'B', 'C'], htf: 1, em: 0, en: 0, sb: 2, tp: 1 },
  'MỚI chỉ setup A+B (bỏ BOS)':                     { S: ['A', 'B'], htf: 1, em: 1, en: 0, sb: 2, tp: 1 },
};
const pass = (it, q) => q.S.includes(it.setup) && (!q.htf || it.e.htf === it.e.d) && (!q.em || it.e.ema);
function portfolio(cands) {
  cands.sort((a, b) => a.t - b.t);
  const hi = cands.filter(x => x.tf !== 'm5');
  cands = cands.filter(x => x.tf !== 'm5' || hi.some(h => h.d === x.d && h.t <= x.t && x.t - h.t <= 12 * 9e5));
  const out = []; let busy = -Infinity;
  for (let i = 0; i < cands.length; i++) {
    const s = cands[i]; if (s.t <= busy) continue;
    const waitEnd = s.fillT ?? s.exitT; let better = false;
    for (let j = i + 1; j < cands.length && cands[j].t < waitEnd; j++) if (cands[j].d === s.d && (s.d > 0 ? cands[j].px < s.px : cands[j].px > s.px)) { better = true; break; }
    if (better) continue;
    busy = s.exitT; if (s.r != null) out.push(s);
  }
  return out;
}
const sum = (L) => { const n = L.length, w = L.filter(x => x.r > 0).length, R = L.reduce((a, x) => a + x.r, 0); let eq = 0, pk = 0, dd = 0; for (const x of L) { eq += x.r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); } return `${String(n).padStart(4)} lệnh | thắng ${String(n ? Math.round(100 * w / n) : 0).padStart(2)}% | ${(R >= 0 ? '+' : '') + R.toFixed(1)}R | ${n ? (R / n).toFixed(2) : ' — '}R/lệnh | DD ${dd.toFixed(1)}R`; };
const RES = {};
for (const sym of ['XAU', 'BTC', 'ETH']) {
  const D = { m5: load(sym, 'm5'), m15: load(sym, 'm15'), h1: load(sym, 'h1') };
  const items = {};
  for (const tf of TFS) { const P = prepare(D, tf), o = { ...OPT[tf], spread: SPREAD[sym] }; items[tf] = [];
    for (const e of P.ev) { const setup = setupOf(e); if (!setup) continue; items[tf].push({ e, setup, c: P.c, o }); } }
  for (const [name, q] of Object.entries(V)) {
    const cands = [];
    for (const tf of TFS) for (const it of items[tf]) { if (!pass(it, q)) continue; const px = entryOf(it.e, ENTRIES[q.en]); const r = simulate(it.c, it.e, px, SLBUF[q.sb], TPS[q.tp], it.o); if (!r) continue;
      cands.push({ sym, tf, d: it.e.d, setup: it.setup, t: it.c[it.e.k].ct, px, r: r.r, fillT: r.fill >= 0 ? it.c[r.fill].ct : null, exitT: r.exit < it.c.length ? it.c[r.exit].ct : Infinity }); }
    (RES[name] = RES[name] || []).push(...portfolio(cands));
  }
  // engine đang chạy (bot Telegram hiện tại), M15+H1
  const CFG = { rr: 2, minRR: 1.5, expiry: 20, maxBars: 48, cost: 0, freshBars: 2, minGrade: 'A', htf: 'grade', spread: SPREAD[sym] };
  for (const tf of ['m15', 'h1']) { const c = D[tf], cons = LIVE.consensus(c, TFS.map(t => ({ name: t.toUpperCase(), c: D[t] }))); const a = LIVE.analyze(c, { ...CFG, cons });
    for (const t of a.bt.trades) if (t.r != null && (LIVE.GRADE_RANK[t.grade] || 0) >= 2) (RES['ĐANG CHẠY (bot Telegram hiện tại)'] = RES['ĐANG CHẠY (bot Telegram hiện tại)'] || []).push({ sym, tf, t: c[t.i].ct, r: t.r - SPREAD[sym] / t.risk, setup: t.model }); }
  console.error(sym, 'xong', D.m5.length, 'nến M5 từ', new Date(D.m5[0].t).toISOString().slice(0, 10));
}
for (const [name, L] of Object.entries(RES)) {
  console.log(`\n=== ${name}`);
  for (const [pn, f] of [['6 tháng TRƯỚC (chưa dùng để chọn)', x => x.t < SPLIT], ['6 tháng gần đây (dùng để chọn)', x => x.t >= SPLIT]]) {
    const P = L.filter(f); console.log(`  ${pn.padEnd(36)} ${sum(P)}`);
    for (const sym of ['XAU', 'BTC', 'ETH']) console.log(`      ${sym}  ${sum(P.filter(x => x.sym === sym))}`);
    if (pn.startsWith('6 tháng TRƯỚC')) { for (const tf of TFS) { const T = P.filter(x => x.tf === tf); if (T.length) console.log(`      ${tf.padEnd(4)} ${sum(T)}`); }
      const M = {}; for (const x of P) { const m = new Date(x.t).toISOString().slice(0, 7); (M[m] = M[m] || []).push(x); } console.log('      theo tháng: ' + Object.keys(M).sort().map(m => `${m.slice(2)} ${M[m].reduce((a, x) => a + x.r, 0).toFixed(1)}R`).join(' · ')); }
  }
}
