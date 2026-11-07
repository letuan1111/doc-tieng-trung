// Thêm lịch sử 12 tháng của 📐 Công thức (vàng + BTC, OKX) vào scanner/journal-seed.json (giữ nguyên các lệnh khác)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load } from './core.mjs';
const CT = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'congthuc.js')), F = path.join(DIR, '..', 'scanner', 'journal-seed.json');
const S = JSON.parse(fs.readFileSync(F, 'utf8')); S.trades = S.trades.filter(t => t.grade !== 'C');
const SY = { XAU: { okx: 'XAU-USDT-SWAP', spread: 0.35, dp: 2 }, BTC: { okx: 'BTC-USDT-SWAP', spread: 18, dp: 1 } }; let n = 0;
for (const [sym, o] of Object.entries(SY)) { const m5 = load(sym, 'm5'), m15 = load(sym, 'm15'), h1 = load(sym, 'h1'), end = m5.at(-1).ct;
  for (const s of CT.run({ m5, m15, h1 }, { spread: o.spread })) { if (!CT.FINAL[s.state] || (s.exitT || s.ct) > end - 2 * 864e5) continue; const { ctx, ...r } = s;
    S.trades.push({ ...r, ctx, id: `${sym}-${s.id}`, sym, ver: CT.version, src: 'OKX ' + o.okx + ' (tính lại 12 tháng)', seen: end, dp: o.dp, live: false }); n++; } }
fs.writeFileSync(F, JSON.stringify(S)); console.log('thêm', n, 'lệnh 📐 Công thức · seed', S.trades.length, 'lệnh');
