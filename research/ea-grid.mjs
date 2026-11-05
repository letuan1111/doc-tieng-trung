// Tìm cấu hình EA EMA hồi để có ≥ 2 lệnh/ngày: khung EMA34/89 × khung phá vỡ × điều kiện ICT/SMC × giờ — khớp như EA (0.02 lot, 1 lệnh một lúc, SL ≤ 30)
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load, resample } from './core.mjs';
const E = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'emapb.js'));
const SP = 0.35, USDPT = 2, FROM = Date.UTC(2025, 10, 5), S = Date.UTC(2026, 4, 5), TD = 260; // ~260 ngày giao dịch / năm
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), h1 = load('XAU', 'h1'), m30 = resample(m15, 18e5);
function eaExec(sig, c, maxPos = 1) {
  const idx = new Map(c.map((x, i) => [x.t, i])), out = []; let busy = [];
  for (const s of sig) { const k = idx.get(s.t); if (k == null || k + 1 >= c.length) continue; const b = c[k + 1];
    busy = busy.filter(t => t > b.t); if (busy.length >= maxPos) continue;
    const d = s.side, entry = d > 0 ? b.o + SP : b.o, sl = s.sl, risk = Math.abs(entry - sl); if (!(d > 0 ? sl < entry : sl > entry) || risk > 30) continue;
    const tp = entry + d * 2 * risk; let st = null, exitP = null, exitT = null;
    for (let u = k + 1; u < c.length; u++) { const x = c[u], lo = d > 0 ? x.l : x.l + SP, hi = d > 0 ? x.h : x.h + SP;
      if (d > 0 ? lo <= sl : hi >= sl) { st = 'SL'; exitP = sl; exitT = x.t; break; } if (d > 0 ? hi >= tp : lo <= tp) { st = 'TP'; exitP = tp; exitT = x.t; break; }
      if (x.t - b.t >= 48 * 36e5) { st = 'T'; exitP = d > 0 ? x.c : x.c + SP; exitT = x.t; break; } }
    if (!st) continue; busy.push(exitT); out.push({ t: b.t, st, usd: d * (exitP - entry) * USDPT }); }
  return out;
}
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24, GOOD = [0, 8, 11, 12, 14, 17, 20, 21];
const HOURS = { 'mọi giờ': () => true, 'bỏ 23h–6h': (h) => h >= 6 && h < 23, 'giờ tốt (8 giờ)': (h) => GOOD.includes(h) };
const rows = [];
for (const [emaN, EC] of [['M15', m15], ['M30', m30], ['H1', h1]]) for (const [brN, C, look] of [['M5', m5, 36], ['M15', m15, 12]])
  for (const [cN, cfg] of [['quét+FVG+OB', {}], ['quét+FVG', { needOB: false }], ['quét', { needFVG: false, needOB: false }], ['FVG', { needSweep: false, needOB: false }], ['không bắt buộc', { needSweep: false, needFVG: false, needOB: false }]]) {
    const all = E.run({ m5: C, m15, emaC: EC }, { spread: SP, cfg: { ...cfg, look, maxSL: 0 } }).filter(s => s.ct >= FROM).sort((a, b) => a.ct - b.ct);
    for (const [hN, hf] of Object.entries(HOURS)) for (const mp of [1, 2]) {
      const T = eaExec(all.filter(s => hf(hr(s.t))), C, mp); if (!T.length) continue;
      const U = (f) => T.filter(f).reduce((a, x) => a + x.usd, 0), w = T.filter(x => x.st === 'TP').length;
      let eq = 0, pk = 0, dd = 0; for (const x of T) { eq += x.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
      rows.push({ k: `EMA ${emaN} · phá ${brN} · ${cN} · ${hN} · tối đa ${mp} lệnh`, n: T.length, pd: T.length / TD, wr: w / T.length, U: U(() => true), a: U(x => x.t < S), b: U(x => x.t >= S), dd });
    }
  }
const ok = rows.filter(r => r.a > 0 && r.b > 0);
const pr = (r) => console.log(`${r.k.padEnd(62)} ${r.pd.toFixed(1)} lệnh/ngày (${r.n}) · thắng ${Math.round(100 * r.wr)}% · ${r.U >= 0 ? '+' : ''}${r.U.toFixed(0)}$ (trước ${r.a.toFixed(0)} · gần ${r.b.toFixed(0)}) · DD ${r.dd.toFixed(0)}$`);
console.log('=== ≥ 2 lệnh/ngày, có lời cả 2 nửa năm (xếp theo lời 6 tháng gần)'); ok.filter(r => r.pd >= 2).sort((x, y) => y.b - x.b).slice(0, 15).forEach(pr);
console.log('\n=== 1.5–2 lệnh/ngày, có lời cả 2 nửa năm'); ok.filter(r => r.pd >= 1.5 && r.pd < 2).sort((x, y) => y.b - x.b).slice(0, 8).forEach(pr);
console.log('\n=== Tham khảo: EA hiện tại'); rows.filter(r => r.k === 'EMA M30 · phá M5 · quét+FVG+OB · giờ tốt (8 giờ) · tối đa 1 lệnh').forEach(pr);
console.log('\n=== Nhiều lệnh nhất (bất kể lời/lỗ)'); rows.sort((x, y) => y.pd - x.pd).slice(0, 5).forEach(pr);
