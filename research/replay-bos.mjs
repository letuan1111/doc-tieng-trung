// Tua lại từng nến M15 (như máy chủ: 3000 M15, 2200 H1) cho mô hình BOS 15 — so với tính một lần
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load } from './core.mjs';
const V3 = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'v3.js'));
const FROM = Date.parse(process.argv[2] || '2025-11-05T00:00:00Z'), A = { m15: load('XAU', 'm15'), h1: load('XAU', 'h1') }, NEED = { m15: 3000, h1: 2200 }, ptr = { m15: 0, h1: 0 };
const byId = new Map(), out = [];
for (const bar of A.m15) { const NOW = bar.ct; if (NOW < FROM) continue; const D = {};
  for (const tf of ['m15', 'h1']) { const c = A[tf]; while (ptr[tf] < c.length && c[ptr[tf]].ct <= NOW) ptr[tf]++; D[tf] = c.slice(Math.max(0, ptr[tf] - NEED[tf]), ptr[tf]); }
  D.m30 = V3.resample(D.m15, V3.MS.m30);
  for (const s of V3.runBos(D, { spread: 0.35, now: NOW })) { const old = byId.get(s.id);
    if (s.state === 'SKIP') { if (old && old.state === 'PENDING') old.state = 'SKIP'; continue; }
    if (!old) { if (s.ct < FROM) continue; const r = { ...s }; byId.set(s.id, r); out.push(r); continue; }
    if (V3.FINAL[old.state]) continue; const sv = { ...V3.CFG[old.tf] }; V3.CFG[old.tf] = { ...sv, expiry: V3.BOS15.expiry[old.tf], hold: V3.BOS15.hold[old.tf] }; V3.track(old, D[old.tf]); V3.CFG[old.tf] = sv; } }
const F = out.filter(s => s.r != null), S = Date.UTC(2026, 4, 5), usd = s => (s.side * (s.exitP - s.entry) - 0.35) * 2;
const row = (n, P) => console.log(n.padEnd(14), P.length, 'lệnh · TP', P.filter(s => s.state === 'WIN').length, 'SL', P.filter(s => s.state === 'LOSS').length, '· thắng', Math.round(100 * P.filter(s => s.state === 'WIN').length / (P.length || 1)) + '%', '·', P.reduce((a, s) => a + usd(s), 0).toFixed(0) + '$');
row('tua từng nến', F); row('6 tháng trước', F.filter(s => s.ct < S)); row('6 tháng gần', F.filter(s => s.ct >= S));
// so với tính một lần trên toàn bộ dữ liệu
const ONE = V3.runBos({ m15: A.m15, h1: A.h1 }, { spread: 0.35 }).filter(s => s.ct >= FROM && s.state !== 'SKIP'), om = new Map(ONE.map(s => [s.id, s]));
let same = 0, onlyR = 0, diffSt = 0; for (const r of out) { const o = om.get(r.id); if (!o) onlyR++; else if (o.state !== r.state) diffSt++; else same++; }
console.log('khớp hoàn toàn', same, '· chỉ có khi tua', onlyR, '· khác kết quả', diffSt, '· chỉ có khi tính một lần', ONE.filter(o => !byId.has(o.id)).length);
const ex = out.filter(r => !om.has(r.id)).slice(0, 3); for (const r of ex) { const V = V3.setups; console.log('  ví dụ chỉ khi tua:', new Date(r.ct + 252e5).toISOString().slice(0, 16), r.tf, r.side, r.sweepName, r.state); }
