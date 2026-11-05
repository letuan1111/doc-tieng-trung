// Chuỗi đúng: EMA34/89 M15 theo xu hướng → hồi về EMA34 + QUÉT SSL (BUY) / BSL (SELL) → MSS/BOS M5 → có FVG trong nhịp phá → vào tại FVG
// So 10 ngày gần nhất với 12 tháng (và từng nửa năm)
import { signals } from './emapb.mjs';
const LOT = 2, END = Date.UTC(2026, 10, 5), D10 = END - 10 * 864e5, S = Date.UTC(2026, 4, 5);
const row = (nm, L) => { const F = L.filter(x => x.pnl != null), w = F.filter(x => x.st === 'WIN').length, l = F.filter(x => x.st === 'LOSS').length, P = F.reduce((s, x) => s + x.pnl, 0);
  return `${nm.padEnd(16)} ${String(F.length).padStart(4)} lệnh · TP ${String(w).padStart(3)} SL ${String(l).padStart(3)} · thắng ${String(F.length ? Math.round(100 * w / F.length) : 0).padStart(2)}% · ${(P * LOT >= 0 ? '+' : '') + (P * LOT).toFixed(0)}$`; };
const V = {
  'Chuỗi đủ · vào mép FVG': { needFVG: true },
  'Chuỗi đủ · vào giữa FVG': { needFVG: true, entry: 'ce' },
  'Chuỗi đủ · vào ngay khi phá (có FVG)': { needFVG: true, entry: 'mkt' },
  'Bản đang ghi (vào ngay, không bắt buộc quét/FVG)': { entry: 'mkt' },
};
for (const [nm, o] of Object.entries(V)) {
  let L = signals('m5', o); if (nm.startsWith('Chuỗi đủ')) L = L.filter(x => x.swept && (o.entry !== 'mkt' || x.fvg));
  console.log(`\n== ${nm} · TP 2R · SL ngoài đáy/đỉnh quét`);
  console.log('  ' + row('10 ngày gần', L.filter(x => x.t >= D10)));
  console.log('  ' + row('12 tháng', L));
  console.log('  ' + row('6 tháng trước', L.filter(x => x.t < S)));
  console.log('  ' + row('6 tháng gần', L.filter(x => x.t >= S)));
  const M = {}; for (const x of L.filter(x => x.pnl != null)) { const m = new Date(x.t).toISOString().slice(2, 7); (M[m] = M[m] || []).push(x); }
  console.log('  theo tháng: ' + Object.keys(M).sort().map(m => `${m} ${Math.round(100 * M[m].filter(x => x.st === 'WIN').length / M[m].length)}%/${(M[m].reduce((s, x) => s + x.pnl, 0) * LOT).toFixed(0)}$`).join(' · '));
}
