// Lịch sử 🎯 Hồi sâu qua EMA89 cho nhật ký: Dukascopy vàng 2 năm
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load } from './core.mjs';
const HS = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'hoisau.js')), F = path.join(DIR, '..', 'scanner', 'journal-seed.json');
const m15 = load('XAU2Y', 'm15'), end = m15.at(-1).ct, S = JSON.parse(fs.readFileSync(F, 'utf8')); S.trades = S.trades.filter(t => t.grade !== 'H');
const L = HS.run({ m15 }, { spread: 0.35 }).filter(s => HS.FINAL[s.state]);
for (const s of L) S.trades.push({ ...s, id: `XAU-${s.id}`, sym: 'XAU', ver: HS.version, src: 'Dukascopy XAUUSD (lịch sử 2 năm)', seen: end, dp: 2, live: false });
fs.writeFileSync(F, JSON.stringify(S)); console.log('🎯 thêm', L.length, 'lệnh, USD', L.reduce((a, s) => a + s.pts * 2, 0).toFixed(0));
