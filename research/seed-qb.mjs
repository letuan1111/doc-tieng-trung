// Thêm lịch sử 12 tháng của 💧 Quét biên (vàng, OKX) vào scanner/journal-seed.json (giữ nguyên lệnh khác)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load } from './core.mjs';
const QB = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'quetbien.js')), F = path.join(DIR, '..', 'scanner', 'journal-seed.json');
const S = JSON.parse(fs.readFileSync(F, 'utf8')); S.trades = S.trades.filter(t => t.grade !== 'Q');
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), end = m5.at(-1).ct; let n = 0;
for (const s of QB.run({ m5, m15 }, { spread: 0.35 })) { if (!QB.FINAL[s.state] || s.exitT > end - 2 * 864e5) continue; S.trades.push({ ...s, id: 'XAU-' + s.id, sym: 'XAU', ver: QB.version, src: 'OKX XAU-USDT-SWAP (tính lại 12 tháng)', seen: end, dp: 2, live: false }); n++; }
fs.writeFileSync(F, JSON.stringify(S)); console.log('thêm', n, 'lệnh 💧 · seed', S.trades.length);
