// So EMA34/89 trên M15 / M30 / H1 cho mô hình EMA hồi (vào lệnh M5, chuỗi quét SSL/BSL → phá vỡ M5 → FVG)
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load, resample } from './core.mjs';
const E = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'emapb.js'));
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), h1 = load('XAU', 'h1'), m30 = resample(m15, 18e5);
const END = Date.UTC(2026, 10, 5), D10 = END - 10 * 864e5, S = Date.UTC(2026, 4, 5), F3 = Date.UTC(2026, 7, 5);
const row = (nm, L) => { const w = L.filter(x => x.state === 'WIN').length, l = L.filter(x => x.state === 'LOSS').length, P = L.reduce((s, x) => s + x.pts, 0) * 2; return `${nm.padEnd(14)} ${String(L.length).padStart(4)} lệnh · TP ${String(w).padStart(3)} SL ${String(l).padStart(3)} · thắng ${String(L.length ? Math.round(100 * w / L.length) : 0).padStart(2)}% · ${(P >= 0 ? '+' : '') + P.toFixed(0)}$`; };
for (const [nm, EC] of [['EMA34/89 M15 (đang chạy)', m15], ['EMA34/89 M30', m30], ['EMA34/89 H1', h1]]) {
  for (const [vn, cfg] of [['', {}], [' · bỏ "chạm EMA34" chặt (±0.3 ATR)', { touch: 0.3 }]]) {
    const L = E.run({ m5, m15, emaC: EC }, { spread: 0.35, cfg }).filter(s => s.pts != null);
    console.log(`\n== ${nm}${vn}`);
    for (const [pn, f] of [['10 ngày gần', x => x.ct >= D10], ['3 tháng gần', x => x.ct >= F3], ['12 tháng', () => true], ['6 tháng trước', x => x.ct < S], ['6 tháng gần', x => x.ct >= S]]) console.log('  ' + row(pn, L.filter(f)));
    const M = {}; for (const x of L) { const m = new Date(x.ct).toISOString().slice(2, 7); (M[m] = M[m] || []).push(x); }
    console.log('  tháng: ' + Object.keys(M).sort().map(m => `${m} ${Math.round(100 * M[m].filter(x => x.state === 'WIN').length / M[m].length)}%/${(M[m].reduce((s, x) => s + x.pts, 0) * 2).toFixed(0)}`).join(' · '));
  }
}
