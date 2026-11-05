// Đối chiếu 12 tháng bằng chính module tin-hieu/ema21.js (code chạy trên web/nhật ký) — cùng logic với EA
import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load } from './core.mjs';
const M = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'ema21.js'));
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), S = Date.UTC(2026, 4, 5), FROM = Date.UTC(2025, 10, 5);
const R = M.run({ m5, m15 }, { spread: +(process.env.SP || 0.35) }).filter(s => s.t >= FROM && s.state !== 'OPEN');
const w = R.filter(s => s.state === 'WIN').length, usd = (f) => R.filter(f).reduce((a, s) => a + s.pts * 2, 0);
let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; for (const s of R) { eq += s.pts * 2; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = s.pts < 0 ? ls + 1 : 0; ml = Math.max(ml, ls); }
console.log(`Module ema21.js · 12 tháng · spread ${process.env.SP || 0.35}: ${R.length} lệnh (${(R.length / 260).toFixed(1)}/ngày) · TP ${w} · SL ${R.filter(s => s.state === 'LOSS').length} · hết giờ ${R.filter(s => s.state === 'TIME').length} · thắng ${Math.round(100 * w / R.length)}% · SL TB ${(R.reduce((a, s) => a + s.risk, 0) / R.length).toFixed(1)} giá · 0.02 lot ${usd(() => true) >= 0 ? '+' : ''}${usd(() => true).toFixed(0)}$ (6 tháng đầu ${usd(s => s.t < S).toFixed(0)} · 6 tháng gần ${usd(s => s.t >= S).toFixed(0)}) · sụt tối đa ${dd.toFixed(0)}$ · thua liên tiếp ${ml}`);
const H = {}; for (const s of R) { H[s.hour] = H[s.hour] || [0, 0, 0]; H[s.hour][0]++; if (s.state === 'WIN') H[s.hour][1]++; H[s.hour][2] += s.pts * 2; }
console.log('Theo giờ VN: ' + Object.keys(H).sort((a, b) => a - b).map(h => `${h}h ${H[h][0]}L ${Math.round(100 * H[h][1] / H[h][0])}%`).join(' · '));
const fs = await import('node:fs'); fs.writeFileSync(path.join(DIR, 'data', 'ema21_module.csv'), 'time_utc,side,entry,sl,tp,result,pts,usd_002\n' + R.map(s => [new Date(s.t).toISOString(), s.side > 0 ? 'BUY' : 'SELL', s.entry.toFixed(2), s.sl.toFixed(2), s.tp.toFixed(2), s.state, s.pts.toFixed(2), (s.pts * 2).toFixed(2)].join(',')).join('\n'));
