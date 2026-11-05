// Tua lại chart TỪNG NẾN M5 như máy chủ chạy thật: mỗi lần một nến M5 đóng → lấy đúng cửa sổ dữ liệu máy chủ thấy
// (2000 M5, 1500 M15, 1000 H1 nến đã đóng) → V3.run → gộp vào nhật ký y hệt scanner/journal.mjs.
// Dùng: node research/replay.mjs XAU 2026-05-05 [lot]   → in bảng lệnh + thống kê, lưu research/data/replay_XAU.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load } from './core.mjs';
const V3 = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'v3.js'));
const sym = process.argv[2] || 'XAU', FROM = Date.parse(process.argv[3] || '2026-05-05T00:00:00Z');
const SP = { XAU: 0.35, BTC: 18 }[sym], LOT = +(process.argv[4] || 0.02), CONTRACT = { XAU: 100, BTC: 1 }[sym]; // Exness XAUUSDm 1 lot = 100 oz, BTCUSDm 1 lot = 1 BTC
const NEED = { m5: 2000, m15: 1500, h1: 1000 }, MS = { m5: 3e5, m15: 9e5, h1: 36e5 };
const A = { m5: load(sym, 'm5'), m15: load(sym, 'm15'), h1: load(sym, 'h1') };
const ptr = { m5: 0, m15: 0, h1: 0 };
const trades = [], byId = new Map();
const t0 = Date.now(); let steps = 0;
for (const bar of A.m5) {
  const NOW = bar.ct; if (NOW < FROM) continue; steps++;
  const D = {};
  for (const tf of ['m5', 'm15', 'h1']) { const c = A[tf]; while (ptr[tf] < c.length && c[ptr[tf]].ct <= NOW) ptr[tf]++; D[tf] = c.slice(Math.max(0, ptr[tf] - NEED[tf]), ptr[tf]); }
  const res = V3.run(D, { spread: SP, now: NOW });
  for (const s of res) {
    if (s.state === 'SKIP' && /^M5 không có/.test(s.why || '')) continue;
    const id = `${sym}-${s.id}`, old = byId.get(id);
    if (!old) { const rec = { ...s, id, sym, seen: NOW, lastT: D[s.tf][D[s.tf].length - 1].ct, live: NOW - s.ct < 2 * MS[s.tf] + 10 * 60e3 }; if (s.ct < FROM) continue; trades.push(rec); byId.set(id, rec); continue; }
    if (V3.FINAL[old.state]) continue;
    if (s.state === 'SKIP' && old.state === 'PENDING') { old.state = 'SKIP'; old.why = s.why; old.exitT = NOW; continue; }
    V3.track(old, D[old.tf]);
  }
}
trades.sort((a, b) => a.ct - b.ct);
const vn = (t) => t == null ? '' : new Date(t + 7 * 36e5).toISOString().slice(0, 16).replace('T', ' ');
const size = LOT * CONTRACT;
for (const t of trades) if (t.exitP != null) { t.usd = (t.side * (t.exitP - t.entry) - SP) * size; t.lot = LOT; }
fs.writeFileSync(path.join(DIR, 'data', `replay_${sym}.json`), JSON.stringify(trades));
const done = trades.filter(t => t.usd != null);
console.log(`${sym}: ${steps} nến M5 đã tua (${vn(FROM)} → ${vn(A.m5[A.m5.length - 1].ct)}), ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const cnt = {}; for (const t of trades) cnt[t.state] = (cnt[t.state] || 0) + 1; console.log('trạng thái:', JSON.stringify(cnt));
let eq = 0, pk = 0, dd = 0; for (const t of done) { eq += t.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
console.log(`khớp ${done.length} lệnh | TP ${done.filter(t => t.state === 'WIN').length} | SL ${done.filter(t => t.state === 'LOSS').length} | hết giờ ${done.filter(t => t.state === 'TIME').length} | lời ${eq.toFixed(2)} USD với ${LOT} lot | DD ${dd.toFixed(2)} USD | ${done.reduce((a, t) => a + t.r, 0).toFixed(2)}R`);
for (const t of trades) if (t.state !== 'SKIP') console.log([vn(t.ct), t.tf.toUpperCase(), t.side > 0 ? 'BUY ' : 'SELL', t.sweepName, 'E ' + t.entry.toFixed(2), 'SL ' + t.sl.toFixed(2), 'TP ' + t.tp.toFixed(2), t.state, t.fillT ? 'khớp ' + vn(t.fillT) : '', t.exitP != null ? 'đóng ' + vn(t.exitT) + ' @' + t.exitP.toFixed(2) : '', t.usd != null ? (t.usd >= 0 ? '+' : '') + t.usd.toFixed(2) + '$' : ''].join(' | '));
