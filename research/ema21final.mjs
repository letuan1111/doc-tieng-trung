// Cấu hình chốt "Test EMA21 M30": xu hướng M30 + chạm EMA21 M30 + nến M5 bật lại · TP 1R · bỏ 8h và 23h VN (xấu ở cả 2 nửa năm)
import { trade, st, fmt, m30 } from './emaquick.mjs';
const BAD = [8, 23], keep = [...Array(24).keys()].filter(h => !BAD.includes(h)), S = Date.UTC(2026, 4, 5);
const o = { mode: 'confirm', trend: true, rr: 1, hours: keep }, R = trade(m30, 18e5, 21, o);
console.log(fmt(`spread ${process.env.SP || 0.35} · TP 1R · bỏ 8h,23h`, st(R)));
console.log(fmt(`spread ${process.env.SP || 0.35} · TP 1R · không lọc giờ`, st(trade(m30, 18e5, 21, { ...o, hours: null }))));
if (!process.env.SP) { const M = {}; for (const r of R) { const q = new Date(r.t).toISOString().slice(2, 7); M[q] = M[q] || [0, 0, 0]; M[q][0]++; if (r.res === 'TP') M[q][1]++; M[q][2] += r.usd; }
  console.log('  tháng: ' + Object.entries(M).map(([q, v]) => `${q} ${v[0]}L ${Math.round(100 * v[1] / v[0])}% ${v[2] >= 0 ? '+' : ''}${v[2].toFixed(0)}`).join(' · '));
  console.log(fmt('  chỉ BUY', st(R.filter(r => r.d > 0)))); console.log(fmt('  chỉ SELL', st(R.filter(r => r.d < 0))));
  console.log(`  TP: ${R.filter(r => r.res === 'TP').length} · SL: ${R.filter(r => r.res === 'SL').length} · hết giờ: ${R.filter(r => r.res === 'T').length}`);
  const fs = await import('node:fs'); fs.writeFileSync(new URL('./data/ema21_replay.json', import.meta.url), JSON.stringify(R)); }
