// Lịch sử 🧭 Phá biên Á theo xu hướng cho nhật ký: Dukascopy vàng 2 năm (luật cố định, không tối ưu trên dữ liệu)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load } from './core.mjs';
const XH = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'xuhuong.js')), F = path.join(DIR, '..', 'scanner', 'journal-seed.json');
const D = { m5: load('XAU2Y', 'm5'), m15: load('XAU2Y', 'm15'), h1: load('XAU2Y', 'h1') }, end = D.m5.at(-1).ct;
const S = JSON.parse(fs.readFileSync(F, 'utf8')); S.trades = S.trades.filter(t => t.grade !== 'X');
const L = XH.run(D, { spread: 0.35 }).filter(s => XH.FINAL[s.state]);
for (const s of L) S.trades.push({ ...s, id: `XAU-${s.id}`, sym: 'XAU', ver: XH.version, src: 'Dukascopy XAUUSD (lịch sử 2 năm)', seen: end, dp: 2, live: false });
fs.writeFileSync(F, JSON.stringify(S)); const f = L.filter(s => s.fillT); console.log('🧭 thêm', L.length, 'tín hiệu,', f.length, 'khớp, R', f.reduce((a, s) => a + s.r, 0).toFixed(1), 'USD', f.reduce((a, s) => a + s.pts * 2, 0).toFixed(0));
