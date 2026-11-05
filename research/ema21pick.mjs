// Chọn cấu hình thắng cao nhất cho "Test EMA21 M30" + lọc giờ hay dính SL (chọn giờ ở 6 tháng đầu, kiểm 6 tháng sau)
import { trade, st, fmt, m30 } from './emaquick.mjs';
const S = Date.UTC(2026, 4, 5), base = { mode: 'confirm', trend: true };
console.log('== Tỷ lệ thắng theo TP (M30 EMA21 + xu hướng M30, chờ nến M5 bật lại)');
for (const rr of [0.6, 0.8, 1, 1.2, 1.5, 2]) console.log(fmt(`TP ${rr}R`, st(trade(m30, 18e5, 21, { ...base, rr }))));
for (const rr of [0.8, 1]) for (const sp of [0.5, 0.7]) { process.env.SP = sp; }
const rr = 1, R = trade(m30, 18e5, 21, { ...base, rr });
const A = R.filter(r => r.t < S), H = {}; for (const r of A) (H[r.h] = H[r.h] || []).push(r);
const hs = Object.entries(H).map(([h, G]) => ({ h: +h, n: G.length, wr: G.filter(r => r.res === 'TP').length / G.length, usd: G.reduce((a, r) => a + r.usd, 0) })).sort((a, b) => a.usd - b.usd);
console.log('\n== 6 tháng đầu, TP 1R — giờ VN theo lời/lỗ:'); console.log('  ' + hs.map(x => `${x.h}h ${x.n}L ${Math.round(100 * x.wr)}% ${x.usd.toFixed(0)}$`).join(' · '));
for (const nb of [3, 4, 5, 6]) { const bad = hs.slice(0, nb).filter(x => x.usd < 0).map(x => x.h); const keep = [...Array(24).keys()].filter(h => !bad.includes(h));
  const R2 = trade(m30, 18e5, 21, { ...base, rr, hours: keep }); const s = st(R2), sb = st(R2.filter(r => r.t >= S)), s0 = st(R.filter(r => r.t >= S));
  console.log(fmt(`bỏ ${bad.length} giờ xấu nhất (${bad.join(',')}h)`, s) + `  | 6 tháng sau: thắng ${Math.round(100 * sb.wr)}% vs không lọc ${Math.round(100 * s0.wr)}%`); }
