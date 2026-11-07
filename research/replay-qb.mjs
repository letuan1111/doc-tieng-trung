// Dữ liệu trang tua chỉ chạy 💧 Quét biên tích lũy (vàng M5) — 30 ngày, Dukascopy, lot 0.02
// Dùng nến/EMA/SMC/sóng của /home/claude/replay/data.json (replay-data.mjs), thay lệnh bằng lệnh của tin-hieu/quetbien.js
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, resample } from './core.mjs';
const QB = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'quetbien.js')), VN = 7 * 36e5;
const D = JSON.parse(fs.readFileSync('/home/claude/replay/data.json'));
const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
const m5 = resample(m1, 3e5), m15 = resample(m1, 9e5);
const L = QB.run({ m5, m15 }, { spread: 0.35 }).filter(s => s.ct >= D.from && QB.FINAL[s.state]);
const fmtT = (t) => new Date(t + VN).toISOString().slice(11, 16);
D.trades = L.map(s => ({ ea: 'QB', side: s.side, t: s.ct, entry: +s.entry.toFixed(2), sl: +s.sl.toFixed(2), tp: +s.tp.toFixed(2), state: s.state, exitT: s.exitT, exitP: +s.exitP.toFixed(2), pts: +s.pts.toFixed(2), usd: +(s.pts * 2).toFixed(2), box: s.box, sweepP: s.sweep,
  why: s.info.join(' · '), why2: (s.after.length ? 'Sau khi vào: ' + s.after.join(', ') + ' · ' : '') + `giữ ${Math.round((s.exitT - s.ct) / 6e4)} phút · ${s.state === 'WIN' ? 'chạm TP 2R' : s.state === 'LOSS' ? 'dính SL' : 'hết 4 giờ, đóng ở ' + s.exitP.toFixed(2)}` }));
for (const w of D.waves) { const c = D.trades.filter(t => t.side === w.d && t.t >= w.t0 && t.t <= w.t1); w.caught = c.map(t => '💧 ' + (t.state === 'WIN' ? 'TP' : t.state === 'LOSS' ? 'SL' : 'hết giờ')); delete w.why; }
const T = D.trades, w = T.filter(t => t.state === 'WIN').length, l = T.filter(t => t.state === 'LOSS').length, u = T.reduce((a, t) => a + t.usd, 0);
let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; for (const t of T) { eq += t.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = t.usd < 0 ? ls + 1 : 0; ml = Math.max(ml, ls); }
const wk = {}; for (const t of T) { const k = new Date(t.t + VN); const m = new Date(k); m.setUTCDate(k.getUTCDate() - ((k.getUTCDay() + 6) % 7)); const key = m.toISOString().slice(5, 10).split('-').reverse().join('/'); wk[key] = wk[key] || [0, 0, 0]; wk[key][0]++; if (t.state === 'WIN') wk[key][1]++; wk[key][2] += t.usd; }
const cw = D.waves.filter(x => x.caught.length).length, cwW = D.waves.filter(x => x.caught.some(c => c.endsWith('TP'))).length;
D.summary = `<p><b>💧 Quét biên tích lũy — ${new Date(D.from + VN).toISOString().slice(0, 10).split('-').reverse().join('/')} → ${new Date(D.to + VN).toISOString().slice(0, 10).split('-').reverse().join('/')}</b>: ${T.length} lệnh · TP ${w} · SL ${l} · hết giờ ${T.length - w - l} · chạm TP ${Math.round(100 * w / T.length)}% · <b class="${u >= 0 ? 'win' : 'loss'}">${u >= 0 ? '+' : ''}${u.toFixed(2)}$</b> (vốn 500$ → ${(500 + u).toFixed(2)}$, ${u >= 0 ? '+' : ''}${(u / 5).toFixed(1)}%) · sụt tối đa ${dd.toFixed(2)}$ · thua liên tiếp ${ml}</p>
<p>Theo tuần: ${Object.entries(wk).map(([k, v]) => `tuần ${k}: ${v[0]} lệnh, ${v[1]} TP, <b class="${v[2] >= 0 ? 'win' : 'loss'}">${v[2] >= 0 ? '+' : ''}${v[2].toFixed(0)}$</b>`).join(' · ')}</p>
<p>Sóng ≥ 15 giá: ${D.waves.length} · chiến lược có lệnh cùng chiều trong ${cw} sóng (${cwW} chạm TP).</p>
<p class="mut">Luật: ${QB.RULE}. Giá Dukascopy (bid), spread 0.35, lot 0.02 (1 giá = 2$).</p>`;
delete D.anatomy;
fs.writeFileSync('/home/claude/replay/qb.json', JSON.stringify(D));
console.log(D.summary.replace(/<[^>]+>/g, ''));
for (const t of T) console.log(new Date(t.t + VN).toISOString().slice(5, 16), t.side > 0 ? 'BUY ' : 'SELL', t.entry, 'SL', t.sl, 'TP', t.tp, t.state, t.usd);
