// Tổ hợp tốt nhất cho chiến lược vùng H4/H1 + quét M15 + MSS, và vùng hiện tại (kịch bản)
import fs from 'node:fs'; import path from 'node:path'; import { DIR } from './core.mjs';
import { zonesAt, signals, trades, show, m15, A15, SP, NM, dp, ROWS, OIL } from './zones.mjs';
const base = { minScore: 4, minDepth: 0.05, maxDepth: 0.6, wait: 8, mss: true }, S = signals(base), S16 = signals({ ...base, wait: 16 });
console.log(`######## ${NM} · tổ hợp`);
const best = show('vùng ≥4 · MSS ≤8 nến · TP 3R', trades(S, { tp: 3 }));
show('… chỉ ngược xu hướng M15 · TP 3R', trades(S.filter(s => s.trend === -s.d), { tp: 3 }));
show('… chỉ ngược xu hướng M15 · TP 1.5R', trades(S.filter(s => s.trend === -s.d), { tp: 1.5 }));
show('… MSS ≤16 nến · TP 3R', trades(S16, { tp: 3 }));
show('… MSS ≤16 nến · TP 1.5R', trades(S16, { tp: 1.5 }));
show('… bỏ giờ 3–4h, 10–11h · TP 3R', trades(S.filter(s => ![3, 4, 10, 11].includes(s.h)), { tp: 3 }));
show('… TP 2.5R', trades(S, { tp: 2.5 })); show('… TP 4R', trades(S, { tp: 4 }));
const buy = best.filter(r => r.d > 0), sell = best.filter(r => r.d < 0), pc = (R) => Math.round(100 * R.filter(r => r.res === 'TP').length / (R.length || 1));
console.log(`BUY ${buy.length}L ${pc(buy)}% ${buy.reduce((a, r) => a + r.usd, 0).toFixed(0)}$ · SELL ${sell.length}L ${pc(sell)}% ${sell.reduce((a, r) => a + r.usd, 0).toFixed(0)}$ · hết giờ ${best.filter(r => r.res === 'TIME').length}`);
const H = {}; for (const r of best) (H[r.h] = H[r.h] || []).push(r); console.log('giờ VN: ' + Object.keys(H).sort((a, b) => a - b).map(h => `${h}h ${H[h].length}L/${pc(H[h])}%/${H[h].reduce((a, r) => a + r.usd, 0).toFixed(0)}`).join(' · '));
console.log('5 lệnh gần nhất:'); for (const r of best.slice(-5)) console.log(' ', new Date(r.t + 7 * 36e5).toISOString().slice(0, 16).replace('T', ' '), r.d > 0 ? 'BUY ' : 'SELL', 'vào', r.entry.toFixed(dp + 1), 'SL', r.sl.toFixed(dp + 1), 'TP', r.tp.toFixed(dp + 1), r.res, r.usd.toFixed(0) + '$', 'điểm vùng', r.score.toFixed(1));
// vùng hiện tại
const last = m15[m15.length - 1], { Z, a4 } = zonesAt(last.ct), px = last.c;
const strong = Z.filter(z => z.score >= 4 && Math.abs((z.lo + z.hi) / 2 - px) < 6 * a4).sort((a, b) => (b.lo - a.lo));
console.log(`\nGiá đóng ${new Date(last.ct + 7 * 36e5).toISOString().slice(0, 16)} VN: ${px} · ATR H4 ${a4.toFixed(dp + 1)} · ATR M15 ${A15[m15.length - 1].toFixed(dp + 1)}`);
for (const z of strong) console.log(`  ${z.lo > px ? 'KHÁNG CỰ' : z.hi < px ? 'HỖ TRỢ  ' : 'GIÁ Ở ĐÂY'} ${z.lo.toFixed(dp)}–${z.hi.toFixed(dp)} · điểm ${z.score.toFixed(1)} · chạm ${z.touch} (H4 ${z.h4}, H1 ${z.h1})${z.flip ? ' · đổi vai' : ''}`);
const recent = m15.slice(-400).map(x => [x.t, x.o, x.h, x.l, x.c]);
fs.writeFileSync(path.join(DIR, 'data', `zonesnow_${OIL ? 'OIL' : 'XAU2Y'}.json`), JSON.stringify({ px, t: last.ct, a4, a15: A15[m15.length - 1], zones: strong.map(z => ({ lo: z.lo, hi: z.hi, score: z.score, touch: z.touch, h4: z.h4, h1: z.h1, flip: z.flip })), recent, rows: ROWS, last5: best.slice(-5) }));
