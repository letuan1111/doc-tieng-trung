// Kiểm độ bền cụm tốt nhất: EMA M30 xu hướng · giá hồi chạm vùng EMA34–89 M30 · nến M5 đóng cửa vượt lại EMA21 M5 · SL dưới đáy hồi + 0.3 ATR · TP 2R/3R
import { events, run, stat, fmt } from './pullback.mjs';
const SYM = process.argv[2] || 'XAU', K = SYM === 'XAU' ? 1 : 25;
const zone = e => e.zone <= 0.1 && e.deep >= -1;
const base = (EV, f = () => true) => EV.filter(e => e.tg === 'ema21' && e.fresh <= 24 && zone(e) && f(e));
const EV = events('M30'); const L = base(EV);
console.log(`=== ${SYM} · EMA M30 · hồi chạm vùng EMA34–89 · M5 đóng cửa vượt lại EMA21`);
for (const rr of [1.5, 2, 2.5, 3]) console.log(fmt(`TP ${rr}R`, stat(run(L, { rr }))));
if (SYM === 'XAU') { for (const sp of [0.5, 0.7]) for (const rr of [2, 3]) console.log(fmt(`spread ${sp} · TP ${rr}R`, stat(run(L, { rr, sp }))));
  for (const pad of [0.1, 0.5, 1]) console.log(fmt(`đệm SL ${pad} ATR · TP 2R`, stat(run(L, { rr: 2, pad }))));
  for (const mx of [10, 20, 30]) console.log(fmt(`SL tối đa ${mx} giá · TP 2R`, stat(run(L, { rr: 2, maxSL: mx }))));
  for (const fr of [12, 36]) console.log(fmt(`đáy hồi ≤ ${fr * 5} phút trước · TP 2R`, stat(run(EV.filter(e => e.tg === 'ema21' && e.fresh <= fr && zone(e)), { rr: 2 }))));
  for (const lk of [24, 60]) { const E2 = events('M30', lk); console.log(fmt(`tìm đáy hồi trong ${lk * 5 / 60}h · TP 2R`, stat(run(base(E2), { rr: 2 })))); }
  console.log(fmt('EMA M15 thay M30 · TP 2R', stat(run(base(events('M15')), { rr: 2 }))));
  console.log(fmt('EMA H1 thay M30 · TP 2R', stat(run(base(events('H1')), { rr: 2 }))));
  for (const rr of [2, 3]) { const R = run(L, { rr }); console.log(fmt(`chỉ BUY · TP ${rr}R`, stat(R.filter(r => r.d > 0)))); console.log(fmt(`chỉ SELL · TP ${rr}R`, stat(R.filter(r => r.d < 0))));
    const M = {}; for (const r of R) { const k = new Date(r.t).toISOString().slice(2, 7); M[k] = M[k] || [0, 0, 0]; M[k][0]++; if (r.res === 'TP') M[k][1]++; M[k][2] += r.usd; }
    console.log(`  từng tháng TP ${rr}R: ` + Object.entries(M).map(([k, v]) => `${k} ${v[0]}L ${Math.round(100 * v[1] / v[0])}% ${v[2] >= 0 ? '+' : ''}${v[2].toFixed(0)}`).join(' · '));
    const H = {}; for (const r of R) (H[r.h] = H[r.h] || []).push(r); console.log(`  theo giờ VN TP ${rr}R: ` + Object.keys(H).sort((a, b) => a - b).map(h => `${h}h ${H[h].length}L ${H[h].reduce((a, r) => a + r.usd, 0).toFixed(0)}`).join(' · '));
    const D = {}; for (const r of R) { const k = new Date(r.t + 7 * 36e5).toISOString().slice(0, 10); D[k] = (D[k] || 0) + r.usd; } const v = Object.values(D);
    console.log(`  ${v.length} ngày có lệnh · ngày lời ${Math.round(100 * v.filter(x => x > 0).length / v.length)}% · TB ${(v.reduce((a, x) => a + x, 0) / v.length).toFixed(1)}$/ngày · tệ nhất ${Math.min(...v).toFixed(0)}$ · tốt nhất +${Math.max(...v).toFixed(0)}$`); } }
