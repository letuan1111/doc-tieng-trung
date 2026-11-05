// Tua lại TỪNG NẾN M15 một đoạn (mặc định 27/10 → hết dữ liệu): EMA34/89, BSL/SSL (đỉnh/đáy swing), sweep, MSS/CHoCH/BOS, FVG
// In ra nhật ký từng sự kiện + các sóng ≥ 15 giá và điều kiện hội tụ trước mỗi sóng.
import { load, ema, atr, pivots } from './core.mjs';
const FROM = Date.parse(process.argv[2] || '2026-10-27T00:00:00Z'), TH = 15;
const c = load('XAU', 'm15'), n = c.length, cl = c.map(x => x.c), E34 = ema(cl, 34), E89 = ema(cl, 89), A = atr(c), pv = pivots(c, 3);
const vn = (t) => new Date(t + 7 * 36e5).toISOString().slice(5, 16).replace('T', ' ');
const trend = (i) => E34[i] > E89[i] ? (c[i].c > E89[i] ? 'TĂNG' : 'tăng yếu') : (c[i].c < E89[i] ? 'GIẢM' : 'giảm yếu');
const log = [];
let ih = 0, il = 0; const sh = [], sl = [], takenH = new Set(), takenL = new Set(); let lastDir = 0;
for (let k = 3; k < n; k++) {
  while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]);
  while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
  if (c[k].t < FROM) { for (const p of sh) if (c[k].h > p.p) takenH.add(p.i); for (const p of sl) if (c[k].l < p.p) takenL.add(p.i); continue; }
  const x = c[k], ev = [];
  // sweep BSL/SSL: râu vượt đỉnh/đáy swing chưa bị lấy rồi đóng cửa quay lại
  for (const p of sh.slice(-6)) if (!takenH.has(p.i) && x.h > p.p) { takenH.add(p.i); ev.push(x.c < p.p ? `BSL SWEEP ${p.p.toFixed(1)}` : `phá BSL ${p.p.toFixed(1)}`); }
  for (const p of sl.slice(-6)) if (!takenL.has(p.i) && x.l < p.p) { takenL.add(p.i); ev.push(x.c > p.p ? `SSL SWEEP ${p.p.toFixed(1)}` : `phá SSL ${p.p.toFixed(1)}`); }
  // cấu trúc: đóng cửa vượt đỉnh/đáy swing gần nhất
  const H = sh[sh.length - 1], L = sl[sl.length - 1];
  if (H && x.c > H.p && !H.broken) { H.broken = true; ev.push(lastDir === -1 ? 'CHoCH/MSS ↑' : 'BOS ↑'); lastDir = 1; }
  if (L && x.c < L.p && !L.broken) { L.broken = true; ev.push(lastDir === 1 ? 'CHoCH/MSS ↓' : 'BOS ↓'); lastDir = -1; }
  if (c[k].l > c[k - 2].h && c[k].l - c[k - 2].h > 0.15 * A[k]) ev.push(`FVG ↑ ${c[k - 2].h.toFixed(1)}–${c[k].l.toFixed(1)}`);
  if (c[k].h < c[k - 2].l && c[k - 2].l - c[k].h > 0.15 * A[k]) ev.push(`FVG ↓ ${c[k].h.toFixed(1)}–${c[k - 2].l.toFixed(1)}`);
  const cross = (E34[k] - E89[k]) * (E34[k - 1] - E89[k - 1]) < 0 ? (E34[k] > E89[k] ? 'EMA34 cắt LÊN EMA89' : 'EMA34 cắt XUỐNG EMA89') : null; if (cross) ev.push(cross);
  const touch = x.l <= E34[k] && x.h >= E34[k] ? 'chạm EMA34' : null; if (touch && ev.length) ev.push(touch);
  if (ev.length) log.push(`${vn(x.t)}  C ${x.c.toFixed(1)}  [${trend(k)} · EMA34 ${E34[k].toFixed(1)} · EMA89 ${E89[k].toFixed(1)}]  ${ev.join(' · ')}`);
}
// sóng ≥ 15 giá trên M15 (zigzag high/low) và điều kiện trước đó
const legs = []; { let dir = 0, hi = -Infinity, hiI = 0, lo = Infinity, loI = 0, pI = 0, pP = 0;
  for (let i = 0; i < n; i++) { const x = c[i]; if (x.t < FROM - 2 * 864e5) continue;
    if (x.h > hi) { hi = x.h; hiI = i; } if (x.l < lo) { lo = x.l; loI = i; }
    if (dir === 0) { if (hi - lo >= TH) { dir = hiI > loI ? 1 : -1; pI = dir > 0 ? loI : hiI; pP = dir > 0 ? lo : hi; } continue; }
    if (dir === 1 && hi - x.l >= TH && i > hiI) { legs.push({ d: 1, sI: pI, sP: pP, eI: hiI, eP: hi }); dir = -1; pI = hiI; pP = hi; lo = x.l; loI = i; }
    else if (dir === -1 && x.h - lo >= TH && i > loI) { legs.push({ d: -1, sI: pI, sP: pP, eI: loI, eP: lo }); dir = 1; pI = loI; pP = lo; hi = x.h; hiI = i; } } }
console.log(log.join('\n'));
console.log(`\n===== SÓNG ≥ ${TH} GIÁ (M15) VÀ ĐIỀU KIỆN LÚC BẮT ĐẦU`);
for (const g of legs.filter(g => c[g.sI].t >= FROM)) { const i = g.sI, al = E34[i] > E89[i] ? 1 : -1;
  const dist = (g.d > 0 ? c[i].l - E34[i] : E34[i] - c[i].h) / A[i];
  console.log(`${vn(c[i].t)} → ${vn(c[g.eI].t)} ${g.d > 0 ? 'TĂNG' : 'GIẢM'} ${Math.abs(g.eP - g.sP).toFixed(1)} giá · EMA34 ${al > 0 ? '>' : '<'} EMA89 (${al === g.d ? 'CÙNG chiều sóng' : 'ngược'}) · gốc sóng cách EMA34 ${dist.toFixed(1)} ATR · ${g.d > 0 ? (c[i].l < E89[i] ? 'dưới' : 'trên') : (c[i].h > E89[i] ? 'trên' : 'dưới')} EMA89`); }
