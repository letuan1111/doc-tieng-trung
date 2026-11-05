// Giá có quay về test EMA34/89 (M15) không, khi nào, dấu hiệu gì? Và vào lệnh ngược chiều về EMA (đánh 2 chiều) có lời không — vàng 12 tháng
import { load, ema, atr, pivots } from './core.mjs';
const c = load('XAU', 'm15'), n = c.length, E34 = ema(c.map(x => x.c), 34), E89 = ema(c.map(x => x.c), 89), A = atr(c), pv = pivots(c, 3);
const S = Date.UTC(2026, 4, 5), SP = 0.35, HOR = 16; // 16 nến M15 = 4 giờ
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24, pct = (a, b) => b ? Math.round(100 * a / b) : 0;
// lần chạm EMA34 gần nhất
const lastTouch = new Array(n).fill(0); { let lt = 0; for (let i = 0; i < n; i++) { if (c[i].l <= E34[i] && c[i].h >= E34[i]) lt = i; lastTouch[i] = lt; } }
// sự kiện: nến M15 đóng cửa cách EMA34 ≥ 1.5 ATR, là cực trị mới của nhịp (cao nhất/thấp nhất 8 nến)
const ev = []; let ih = 0, il = 0; const sh = [], sl = [];
for (let k = 120; k < n - HOR; k++) {
  while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
  const x = c[k], dist = (x.c - E34[k]) / A[k]; if (Math.abs(dist) < 1.5) continue;
  const up = dist > 0; let ext = true; for (let u = k - 8; u < k; u++) if (up ? c[u].h > x.h : c[u].l < x.l) { ext = false; break; } if (!ext) continue;
  // dấu hiệu
  const rng = x.h - x.l, wick = rng > 0 ? (up ? x.h - Math.max(x.o, x.c) : Math.min(x.o, x.c) - x.l) / rng : 0;
  const Q = up ? sh[sh.length - 1] : sl[sl.length - 1], sweep = !!(Q && (up ? x.h > Q.p && x.c < Q.p : x.l < Q.p && x.c > Q.p));
  const slow = (c[k].h - c[k].l) < (c[k - 1].h - c[k - 1].l) && (c[k - 1].h - c[k - 1].l) < (c[k - 2].h - c[k - 2].l);
  const trendAligned = up ? E34[k] > E89[k] : E34[k] < E89[k];
  // kết quả: chạm EMA34 trong 4 giờ trước khi giá đi thêm 1 ATR vượt cực trị?
  const extP = up ? x.h : x.l; let touch34 = false, touch89 = false, bars = null, further = false;
  for (let u = k + 1; u <= k + HOR; u++) { const y = c[u]; if (up ? y.h > extP + A[k] : y.l < extP - A[k]) { further = true; break; }
    if (up ? y.l <= E34[u] : y.h >= E34[u]) { if (!touch34) { touch34 = true; bars = u - k; } } if (up ? y.l <= E89[u] : y.h >= E89[u]) { touch89 = true; break; } }
  ev.push({ k, t: x.t, up, dist: Math.abs(dist), wick, sweep, slow, trendAligned, since: k - lastTouch[k], h: hr(x.t), touch34, touch89, bars, further });
}
const show = (nm, L) => { const T = L.filter(e => e.touch34).length, F = L.filter(e => e.further && !e.touch34).length; const a = L.filter(e => e.t < S), b = L.filter(e => e.t >= S);
  console.log(`  ${nm.padEnd(40)} ${String(L.length).padStart(5)} lần · quay về EMA34 trong 4h ${String(pct(T, L.length)).padStart(2)}% (trước ${pct(a.filter(e => e.touch34).length, a.length)}% · gần ${pct(b.filter(e => e.touch34).length, b.length)}%) · chạm EMA89 ${pct(L.filter(e => e.touch89).length, L.length)}% · chạy tiếp +1 ATR không về ${pct(F, L.length)}%`); };
console.log(`== Giá đóng cửa cách EMA34 (M15) ≥ 1.5 ATR, tạo đỉnh/đáy mới 2 giờ: ${ev.length} lần`);
show('tất cả', ev);
console.log(' · theo khoảng cách tới EMA34'); for (const [a, b] of [[1.5, 2.5], [2.5, 3.5], [3.5, 5], [5, 99]]) show(`cách ${a}–${b > 50 ? '∞' : b} ATR`, ev.filter(e => e.dist >= a && e.dist < b));
console.log(' · theo thời gian chưa chạm EMA34'); for (const [a, b] of [[0, 8], [8, 16], [16, 32], [32, 9999]]) show(`${a / 4}–${b > 999 ? '∞' : b / 4} giờ`, ev.filter(e => e.since >= a && e.since < b));
console.log(' · dấu hiệu ở nến cực trị');
show('nến rút râu ≥ 50% (từ chối giá)', ev.filter(e => e.wick >= 0.5)); show('râu < 20%', ev.filter(e => e.wick < 0.2));
show('quét BSL/SSL rồi đóng cửa quay lại', ev.filter(e => e.sweep)); show('3 nến biên độ giảm dần (đuối sức)', ev.filter(e => e.slow));
show('ngược xu hướng EMA34/89 (đi ngược)', ev.filter(e => !e.trendAligned)); show('cùng xu hướng EMA34/89', ev.filter(e => e.trendAligned));
show('rút râu + quét thanh khoản', ev.filter(e => e.wick >= 0.5 && e.sweep)); show('rút râu + quét + cách ≥ 2.5 ATR', ev.filter(e => e.wick >= 0.5 && e.sweep && e.dist >= 2.5));
console.log(' · theo giờ VN'); const H = {}; for (const e of ev) (H[e.h] = H[e.h] || []).push(e);
console.log('  ' + Object.keys(H).sort((a, b) => a - b).map(h => `${h}h ${pct(H[h].filter(e => e.touch34).length, H[h].length)}%`).join(' · '));
const med = ev.filter(e => e.bars).map(e => e.bars).sort((a, b) => a - b); console.log(`  thời gian quay về EMA34 trung vị: ${(med[med.length >> 1] * 15)} phút`);
// GIAO DỊCH 2 CHIỀU: vào ngược chiều ở nến sau, TP = EMA34 tại lúc vào, SL = ngoài cực trị + 0.3 ATR + spread, giữ tối đa 4h
function trade(L, nm) {
  const R = []; let busy = -1;
  for (const e of L) { const k = e.k; if (k <= busy || k + 1 >= n) continue; const d = e.up ? -1 : 1, b = c[k + 1], entry = d > 0 ? b.o + SP : b.o;
    const sl = (e.up ? c[k].h : c[k].l) - d * (0.3 * A[k] + SP), tp = E34[k], risk = Math.abs(entry - sl), rew = d * (tp - entry); if (!(rew > 0) || !(risk > 0) || risk > 30) continue;
    let res = null, ex = null; for (let u = k + 1; u <= k + HOR + 1 && u < n; u++) { const y = c[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= sl : hi >= sl) { res = 'SL'; ex = sl; busy = u; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = 'TP'; ex = tp; busy = u; break; } }
    if (!res) { const u = Math.min(n - 1, k + HOR + 1); res = 'TIME'; ex = d > 0 ? c[u].c : c[u].c + SP; busy = u; }
    R.push({ t: c[k].t, res, usd: d * (ex - entry) * 2, rr: rew / risk }); }
  const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0);
  console.log(`  ${nm.padEnd(44)} ${String(R.length).padStart(4)} lệnh (${(R.length / 260).toFixed(1)}/ngày) · TP ${w} · thắng ${pct(w, R.length)}% · RR TB ${(R.reduce((a, r) => a + r.rr, 0) / (R.length || 1)).toFixed(2)} · 0.02 lot ${U(() => true).toFixed(0)}$ (trước ${U(r => r.t < S).toFixed(0)} · gần ${U(r => r.t >= S).toFixed(0)})`);
}
console.log('\n== VÀO LỆNH NGƯỢC CHIỀU VỀ EMA34 (TP = EMA34, SL ngoài cực trị + 0.3 ATR, ≤ 30 giá, giữ ≤ 4h, 0.02 lot)');
trade(ev, 'mọi lần cách ≥ 1.5 ATR'); trade(ev.filter(e => e.dist >= 2.5), 'cách ≥ 2.5 ATR'); trade(ev.filter(e => e.wick >= 0.5), 'nến rút râu ≥ 50%');
trade(ev.filter(e => e.sweep), 'quét BSL/SSL'); trade(ev.filter(e => e.wick >= 0.5 && e.sweep), 'rút râu + quét'); trade(ev.filter(e => e.wick >= 0.5 && e.sweep && e.dist >= 2.5), 'rút râu + quét + cách ≥ 2.5 ATR');
trade(ev.filter(e => !e.trendAligned && e.wick >= 0.5), 'ngược xu hướng EMA + rút râu (về lại xu hướng)'); trade(ev.filter(e => e.trendAligned && e.wick >= 0.5 && e.sweep), 'cùng xu hướng + rút râu + quét (bắt nhịp hồi)');
