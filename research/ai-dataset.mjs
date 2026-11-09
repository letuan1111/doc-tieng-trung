// Tạo bộ dữ liệu cho AI: mọi ứng viên (8 loại ICT/SMC/EMA/breakout) + ~55 đặc trưng + nhãn triple-barrier (TP 1R/1.5R/2R trước SL, giữ ≤ 4h)
// node research/ai-dataset.mjs XAU2Y 0.35   → research/ai/XAU2Y.csv
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { load } from './core.mjs';
const AI = createRequire(import.meta.url)('../tin-hieu/ai.js');
const sym = process.argv[2] || 'XAU2Y', SP = +(process.argv[3] || 0.35);
const D = { m5: load(sym, process.env.BASE || 'm5'), m15: load(sym, 'm15'), h1: load(sym, 'h1') };
console.time('scan'); const cfg = process.argv[4] ? JSON.parse(process.argv[4]) : null; const { P, cands } = AI.scan(D, { spread: SP, cfg }); console.timeEnd('scan');
const RR = [1, 1.5, 2], rows = [['t', 'pri', 'types', 'rk', ...AI.FEATS, ...RR.flatMap(r => ['y' + r, 'R' + r, 'x' + r])].join(',')];
for (const cd of cands) {
  const lab = RR.flatMap(rr => { const F = AI.follow(P.c, cd.k, cd.d, cd.entry, cd.sl, cd.entry + cd.d * rr * cd.risk, SP, AI.CFG.hold); if (F.state === 'OPEN') return [NaN, NaN, NaN]; return [F.state === 'WIN' ? 1 : 0, (cd.d * (F.exitP - cd.entry) / cd.risk).toFixed(3), F.exitT]; });
  if (Number.isNaN(lab[0])) continue;
  rows.push([cd.t, cd.pri, cd.types.join('|'), +cd.risk.toFixed(3), ...cd.f.map(v => Number.isNaN(v) ? '' : +(+v).toFixed(4)), ...lab].join(','));
}
fs.writeFileSync(`research/ai/${sym}${process.argv[5] || ''}.csv`, rows.join('\n'));
const days = (P.c.at(-1).t - P.c[0].t) / 864e5 * 5 / 7;
console.log(sym, 'ứng viên', rows.length - 1, '· ~', ((rows.length - 1) / days).toFixed(1), '/ngày giao dịch');
const by = {}; for (const cd of cands) for (const t of cd.types) by[t] = (by[t] || 0) + 1; console.log(by);
