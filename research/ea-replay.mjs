// Tua lại 12 tháng đúng logic EA MT5 EMA_Hoi_ICT v1.10 (vàng, nến M5 OKX):
//  tín hiệu = emapb.js (EMA34/89 M30 → hồi EMA34 + quét SSL/BSL → phá vỡ M5 + FVG + Order Block, giờ VN tốt)
//  khớp: giá mở nến M5 kế tiếp — BUY ở Ask (= giá + spread), SELL ở Bid; SL ngoài điểm quét +0.3 ATR M15 + spread; bỏ nếu SL > 30 giá; TP 2R
//  SL/TP của BUY so với Bid (low/high nến), của SELL so với Ask (low/high + spread); 1 lệnh một lúc; ≤ 4 lệnh/ngày (ngày máy chủ GMT); giữ tối đa 48 giờ
// node research/ea-replay.mjs [spread=0.35] [lot=0.02] [vốn để tính giới hạn lỗ ngày 2%, 0 = tắt]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load } from './core.mjs';
const E = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'emapb.js'));
const SP = +(process.argv[2] || 0.35), LOT = +(process.argv[3] || 0.02), BAL = +(process.argv[4] || 0), USDPT = LOT * 100;
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), FROM = Date.UTC(2025, 10, 5), S = Date.UTC(2026, 4, 5);
const idx = new Map(m5.map((x, i) => [x.t, i]));
const sig = E.run({ m5, m15 }, { spread: SP, cfg: { maxSL: 0 } }).filter(s => s.tgOK && s.ct >= FROM).sort((a, b) => a.ct - b.ct);
const trades = [], skip = { 'đang có lệnh': 0, 'đủ 4 lệnh/ngày': 0, 'SL > 30 giá': 0, 'chạm giới hạn lỗ ngày': 0 };
let busyUntil = -Infinity; const perDay = {}, plDay = {};
for (const s of sig) {
  const k = idx.get(s.t); if (k == null || k + 1 >= m5.length) continue;
  const b = m5[k + 1], day = Math.floor(b.t / 864e5);
  if (b.t < busyUntil) { skip['đang có lệnh']++; continue; }
  if ((perDay[day] || 0) >= 4) { skip['đủ 4 lệnh/ngày']++; continue; }
  if (BAL > 0 && (plDay[day] || 0) <= -BAL * 0.02) { skip['chạm giới hạn lỗ ngày']++; continue; }
  const d = s.side, entry = d > 0 ? b.o + SP : b.o, sl = s.sl, risk = Math.abs(entry - sl);
  if (!(d > 0 ? sl < entry : sl > entry)) continue;
  if (risk > 30) { skip['SL > 30 giá']++; continue; }
  const tp = entry + d * 2 * risk; perDay[day] = (perDay[day] || 0) + 1;
  let st = 'TIME', exitP = null, exitT = null;
  for (let u = k + 1; u < m5.length; u++) {
    const x = m5[u], lo = d > 0 ? x.l : x.l + SP, hi = d > 0 ? x.h : x.h + SP; // BUY đóng ở Bid, SELL đóng ở Ask
    const hitSL = d > 0 ? lo <= sl : hi >= sl, hitTP = d > 0 ? hi >= tp : lo <= tp;
    if (hitSL) { st = 'SL'; exitP = sl; exitT = x.t; break; }               // cùng nến chạm cả hai → tính SL (bi quan)
    if (hitTP) { st = 'TP'; exitP = tp; exitT = x.t; break; }
    if (x.t - b.t >= 48 * 36e5) { st = 'HẾT GIỜ'; exitP = d > 0 ? x.c : x.c + SP; exitT = x.t; break; }
  }
  if (exitP == null) continue;
  const usd = d * (exitP - entry) * USDPT; busyUntil = exitT + 3e5; plDay[Math.floor(exitT / 864e5)] = (plDay[Math.floor(exitT / 864e5)] || 0) + usd;
  trades.push({ t: b.t, d, entry, sl, tp, risk, st, exitP, exitT, usd, brk: s.breakType, sweep: s.sweepName, hour: s.hour });
}
const vn = (t) => new Date(t + 7 * 36e5).toISOString().slice(0, 16).replace('T', ' ');
const sum = (L, nm) => { const w = L.filter(x => x.st === 'TP').length, l = L.filter(x => x.st === 'SL').length, tm = L.filter(x => x.st === 'HẾT GIỜ').length, U = L.reduce((a, x) => a + x.usd, 0);
  let eq = 0, pk = 0, dd = 0, run = 0, mr = 0; for (const x of L) { eq += x.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); run = x.usd < 0 ? run + 1 : 0; mr = Math.max(mr, run); }
  console.log(`${nm.padEnd(16)} ${String(L.length).padStart(3)} lệnh · TP ${String(w).padStart(3)} · SL ${String(l).padStart(3)} · hết giờ ${tm} · thắng ${L.length ? Math.round(100 * w / L.length) : 0}% · ${U >= 0 ? '+' : ''}${U.toFixed(0)} USD · sụt giảm tối đa ${dd.toFixed(0)} USD · thua liền nhiều nhất ${mr}`); };
console.log(`EA EMA_Hoi_ICT v1.10 · ${LOT} lot · spread ${SP} · ${sig.length} tín hiệu trong giờ tốt${BAL ? ` · giới hạn lỗ ngày 2% của ${BAL} USD` : ''}`);
sum(trades, '12 tháng'); sum(trades.filter(x => x.t < S), '6 tháng trước'); sum(trades.filter(x => x.t >= S), '6 tháng gần');
const M = {}; for (const x of trades) { const m = new Date(x.t + 252e5).toISOString().slice(0, 7); (M[m] = M[m] || []).push(x); }
console.log('\nTheo tháng:'); for (const m of Object.keys(M).sort()) sum(M[m], '  ' + m);
console.log('\nBỏ lệnh:', JSON.stringify(skip));
const W = trades.filter(x => x.st === 'TP'), Lo = trades.filter(x => x.st === 'SL');
console.log(`TP trung bình +${(W.reduce((a, x) => a + x.usd, 0) / W.length).toFixed(1)} USD (${(W.reduce((a, x) => a + Math.abs(x.tp - x.entry), 0) / W.length).toFixed(1)} giá) · SL trung bình ${(Lo.reduce((a, x) => a + x.usd, 0) / Lo.length).toFixed(1)} USD (${(Lo.reduce((a, x) => a + x.risk, 0) / Lo.length).toFixed(1)} giá) · lời lớn nhất +${Math.max(...trades.map(x => x.usd)).toFixed(0)} · lỗ lớn nhất ${Math.min(...trades.map(x => x.usd)).toFixed(0)}`);
const H = ['Mở lệnh (VN)', 'Lệnh', 'Kiểu phá vỡ', 'Quét', 'Entry', 'SL', 'TP', 'SL (giá)', 'Kết quả', 'Đóng (VN)', 'Giá đóng', `Lời/lỗ USD (${LOT} lot)`];
fs.writeFileSync(path.join(DIR, 'data', 'ea_replay.csv'), '﻿' + [H.join(','), ...trades.map(x => [vn(x.t), x.d > 0 ? 'BUY' : 'SELL', x.brk, x.sweep, x.entry.toFixed(2), x.sl.toFixed(2), x.tp.toFixed(2), x.risk.toFixed(1), x.st, vn(x.exitT), x.exitP.toFixed(2), x.usd.toFixed(2)].join(','))].join('\n'));
