// Kiểm tra mục tiêu: TP 10 giá / SL 5 giá (1:2), ~2 lệnh/ngày, thắng ≥ 80% — vàng M5, 12 tháng
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load, resample, pivots } from './core.mjs';
const E = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'emapb.js'));
const SP = 0.35, TP = 10, SLD = 5, S = Date.UTC(2026, 4, 5), TD = 260;
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), m30 = resample(m15, 18e5), n = m5.length;
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24;
// mô phỏng: vào ở giá mở nến sau (BUY + spread), SL/TP cố định theo giá
function sim(k, d, tp = TP, sl = SLD) {
  if (k + 1 >= n) return null; const b = m5[k + 1], e = d > 0 ? b.o + SP : b.o, S_ = e - d * sl, T_ = e + d * tp;
  for (let u = k + 1; u < Math.min(n, k + 577); u++) { const x = m5[u], lo = d > 0 ? x.l : x.l + SP, hi = d > 0 ? x.h : x.h + SP;
    if (d > 0 ? lo <= S_ : hi >= S_) return 0; if (d > 0 ? hi >= T_ : lo <= T_) return 1; }
  return null;
}
const rate = (L) => { const R = L.filter(x => x.r != null); const w = R.filter(x => x.r === 1).length; return { n: R.length, w, wr: R.length ? w / R.length : 0, usd: (w * TP - (R.length - w) * SLD) * 2 }; };
const show = (nm, L) => { const a = rate(L), A = rate(L.filter(x => x.t < S)), B = rate(L.filter(x => x.t >= S)); console.log(`${nm.padEnd(52)} ${String(a.n).padStart(6)} lệnh (${(a.n / TD).toFixed(1)}/ngày) · thắng ${(100 * a.wr).toFixed(0)}% (trước ${(100 * A.wr).toFixed(0)}% · gần ${(100 * B.wr).toFixed(0)}%) · 0.02 lot ${a.usd >= 0 ? '+' : ''}${a.usd.toFixed(0)}$`); return a; };
console.log(`TP ${TP} giá / SL ${SLD} giá · hoà vốn cần thắng ${(100 * (SLD + SP) / (TP + SLD)).toFixed(0)}% (đã tính spread)\n`);
// 1. vào ngẫu nhiên mỗi nến M5 (mốc nền)
const R1 = []; for (let k = 100; k < n - 600; k += 3) for (const d of [1, -1]) R1.push({ t: m5[k].t, r: sim(k, d) });
show('Mốc nền: vào bất kỳ nến M5 nào', R1);
// 2. vào theo EMA34/89 (M30 / M15) — mọi nến cùng chiều EMA
// 3. các mô hình đã xây, thay SL/TP bằng 5/10
const idx = new Map(m5.map((x, i) => [x.t, i]));
for (const [nm, EC, cfg] of [['EMA hồi (EMA M30, đủ chuỗi ICT/SMC)', m30, {}], ['EMA hồi (EMA M15, đủ chuỗi)', m15, {}], ['EMA hồi (EMA M30, chỉ hồi + phá vỡ)', m30, { needSweep: false, needFVG: false, needOB: false }]]) {
  const L = E.run({ m5, m15, emaC: EC }, { spread: SP, cfg: { ...cfg, maxSL: 0 } }).map(s => ({ t: s.t, h: hr(s.t), d: s.side, brk: s.breakType, r: sim(idx.get(s.t), s.side) }));
  show(nm, L); show('   + chỉ 8 giờ tốt', L.filter(x => [0, 8, 11, 12, 14, 17, 20, 21].includes(x.h)));
  // giờ tốt nhất cho TP10/SL5
  const H = {}; for (const x of L) (H[x.h] = H[x.h] || []).push(x);
  const best = Object.entries(H).map(([h, G]) => ({ h, ...rate(G) })).filter(x => x.n >= 20).sort((a, b) => b.wr - a.wr).slice(0, 4);
  console.log('   giờ thắng cao nhất: ' + best.map(x => `${x.h}h ${(100 * x.wr).toFixed(0)}% (${x.n} lệnh)`).join(' · '));
}
// 4. sau cú quét thanh khoản (đáy/đỉnh swing M5, PDH/PDL) + nến đảo chiều mạnh, vào ngay
{ const pv = pivots(m5, 3), L = []; let ih = 0, il = 0; const sh = [], sl = [];
  for (let k = 50; k < n - 600; k++) { while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
    const x = m5[k], P = sl[sl.length - 1], Q = sh[sh.length - 1];
    if (P && x.l < P.p && x.c > P.p && x.c > x.o && (x.c - x.l) > 0.6 * (x.h - x.l)) L.push({ t: x.t, h: hr(x.t), r: sim(k, 1) });
    if (Q && x.h > Q.p && x.c < Q.p && x.c < x.o && (x.h - x.c) > 0.6 * (x.h - x.l)) L.push({ t: x.t, h: hr(x.t), r: sim(k, -1) }); }
  show('Quét đáy/đỉnh swing M5 + nến đảo chiều, vào ngay', L); }
// 5. thử các tỷ lệ khác để thấy giới hạn
console.log('\nCùng tín hiệu EMA hồi (M30, đủ chuỗi), thay TP/SL:');
{ const sig = E.run({ m5, m15, emaC: m30 }, { spread: SP, cfg: { maxSL: 0 } });
  for (const [tp, sl] of [[10, 5], [10, 10], [5, 10], [10, 20], [5, 20]]) { const L = sig.map(s => ({ t: s.t, r: sim(idx.get(s.t), s.side, tp, sl) })); const a = rate(L); const usd = (a.w * tp - (a.n - a.w) * sl) * 2;
    console.log(`   TP ${tp} / SL ${sl}: ${a.n} lệnh · thắng ${(100 * a.wr).toFixed(0)}% · ${usd >= 0 ? '+' : ''}${usd.toFixed(0)}$ (hoà vốn cần ${(100 * (sl + SP) / (tp + sl)).toFixed(0)}%)`); } }
// 6. giờ hay bị quét thanh khoản (râu nến M5 quét đỉnh/đáy swing M5 rồi đóng cửa quay lại)
{ const pv = pivots(m5, 3), H = new Array(24).fill(0); let ih = 0, il = 0; const sh = [], sl = [];
  for (let k = 50; k < n; k++) { while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
    const x = m5[k], P = sl[sl.length - 1], Q = sh[sh.length - 1]; if ((P && x.l < P.p && x.c > P.p) || (Q && x.h > Q.p && x.c < Q.p)) H[hr(x.t)]++; }
  const m = Math.max(...H); console.log('\nGiờ VN hay bị QUÉT thanh khoản (râu M5 quét đỉnh/đáy swing rồi đóng cửa quay lại):');
  for (let h = 0; h < 24; h++) console.log(`  ${String(h).padStart(2, '0')}h ${String(H[h]).padStart(4)} ${'█'.repeat(Math.round(H[h] / m * 30))}`); }
