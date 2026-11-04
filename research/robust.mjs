// Độ bền: mỗi cấu hình cố định chạy suốt 6 tháng — bao nhiêu tháng có lãi, trên cả XAU và BTC
import { load } from './core.mjs';
import { prepare, entryOf, simulate, setupOf, ENTRIES, SLBUF, TPS } from './engine2.mjs';
const SPREAD = { XAU: 0.35, BTC: 18 }, TFS = (process.argv[2] || 'm5,m15,h1').split(',');
const OPT = { m5: { expiry: 12, hold: 96 }, m15: { expiry: 12, hold: 96 }, h1: { expiry: 8, hold: 72 } };
const SETS = [['A'], ['B'], ['C'], ['A', 'B'], ['A', 'B', 'C']];
const CF = []; for (const S of SETS) for (const htf of [0, 1]) for (const pd of [1, 0.5]) for (const kz of [0, 1]) for (const em of [0, 1]) for (const poi of [0, 1]) for (let en = 0; en < 4; en++) for (let sb = 0; sb < 3; sb++) for (let tp = 0; tp < 3; tp++) CF.push({ S, htf, pd, kz, em, poi, en, sb, tp });
const pass = (it, q) => q.S.includes(it.setup) && (!q.htf || it.e.htf === it.e.d) && (!q.kz || it.e.kz) && (!q.em || it.e.ema) && (!q.poi || it.e.poi) && (q.pd >= 1 || (it.pdE[q.en] != null && it.pdE[q.en] <= q.pd));
const U = {};
for (const sym of ['XAU', 'BTC']) { const D = { m5: load(sym, 'm5'), m15: load(sym, 'm15'), h1: load(sym, 'h1') };
  for (const tf of TFS) { const P = prepare(D, tf), o = { ...OPT[tf], spread: SPREAD[sym] }, items = [];
    for (const e of P.ev) { const setup = setupOf(e); if (!setup) continue; const out = [], pdE = [];
      for (let en = 0; en < 4; en++) { const px = entryOf(e, ENTRIES[en]); pdE.push(px == null ? null : e.pdOf(px)); out.push(SLBUF.map(sb => TPS.map(tp => px == null ? null : simulate(P.c, e, px, sb, tp, o)))); }
      items.push({ e, setup, m: new Date(P.c[e.k].t).toISOString().slice(0, 7), out, pdE }); }
    U[sym + tf] = items; } }
const MONTHS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
const res = [];
for (const tf of TFS) for (const q of CF) {
  const per = {}; let ok = true; const row = { tf, q };
  for (const sym of ['XAU', 'BTC']) { const pm = {}; let n = 0, R = 0;
    for (const it of U[sym + tf]) { if (!pass(it, q)) continue; const r = it.out[q.en][q.sb][q.tp]; if (!r || r.r == null) continue; n++; R += r.r; (pm[it.m] = pm[it.m] || [0, 0]); pm[it.m][0]++; pm[it.m][1] += r.r; }
    row[sym] = { n, R, pos: MONTHS.filter(m => pm[m] && pm[m][1] > 0).length, act: MONTHS.filter(m => pm[m]).length }; }
  res.push(row); }
const ENm = ENTRIES, d = (q) => `${q.S.join('+')}${q.htf ? ' HTF' : ''}${q.pd < 1 ? ' PD' : ''}${q.kz ? ' KZ' : ''}${q.em ? ' EMA' : ''}${q.poi ? ' POI' : ''} | ${ENm[q.en]} SL+${SLBUF[q.sb]} ${TPS[q.tp]}`;
const fmt = (s) => `${String(s.n).padStart(4)}L ${s.R >= 0 ? '+' : ''}${s.R.toFixed(1).padStart(6)}R ${(s.n ? s.R / s.n : 0).toFixed(2).padStart(5)} ${s.pos}/${s.act}th`;
for (const tf of TFS) {
  const L = res.filter(r => r.tf === tf && r.XAU.n >= 20 && r.BTC.n >= 20);
  console.log(`\n=== ${tf}: ${L.length} cấu hình đủ mẫu · có lãi cả 2 cặp: ${L.filter(r => r.XAU.R > 0 && r.BTC.R > 0).length} · tỉ lệ cấu hình có lãi XAU ${(100 * L.filter(r => r.XAU.R > 0).length / L.length).toFixed(0)}% BTC ${(100 * L.filter(r => r.BTC.R > 0).length / L.length).toFixed(0)}%`);
  const top = L.filter(r => r.XAU.R > 0 && r.BTC.R > 0).sort((a, b) => (Math.min(a.XAU.R / a.XAU.n, a.BTC.R / a.BTC.n) * Math.sqrt(a.XAU.n + a.BTC.n) < Math.min(b.XAU.R / b.XAU.n, b.BTC.R / b.BTC.n) * Math.sqrt(b.XAU.n + b.BTC.n)) ? 1 : -1).slice(0, 12);
  for (const r of top) console.log(`  ${d(r.q).padEnd(42)} XAU ${fmt(r.XAU)} | BTC ${fmt(r.BTC)}`);
  // ảnh hưởng trung bình của từng bộ lọc (so cấu hình có / không bộ lọc đó)
  for (const f of ['htf', 'kz', 'em', 'poi']) { const on = L.filter(r => r.q[f]), off = L.filter(r => !r.q[f]); const avg = (A, s) => A.reduce((x, r) => x + r[s].R / r[s].n, 0) / (A.length || 1); console.log(`  lọc ${f.padEnd(4)}: XAU ${avg(off, 'XAU').toFixed(3)} → ${avg(on, 'XAU').toFixed(3)} | BTC ${avg(off, 'BTC').toFixed(3)} → ${avg(on, 'BTC').toFixed(3)} R/lệnh`); }
  for (const [nm, g] of [['setup', r => r.q.S.join('+')], ['entry', r => ENm[r.q.en]], ['SL', r => SLBUF[r.q.sb]], ['TP', r => TPS[r.q.tp]]]) { const G = {}; for (const r of L) (G[g(r)] = G[g(r)] || []).push(r); console.log(`  ${nm.padEnd(5)}: ` + Object.entries(G).map(([k, A]) => `${k} XAU ${(A.reduce((x, r) => x + r.XAU.R / r.XAU.n, 0) / A.length).toFixed(2)}/BTC ${(A.reduce((x, r) => x + r.BTC.R / r.BTC.n, 0) / A.length).toFixed(2)}`).join(' · ')); }
}
