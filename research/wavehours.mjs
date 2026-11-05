// Sóng xu hướng vàng: bắt đầu / kết thúc lúc mấy giờ (VN), kéo dài bao lâu; đáy/đỉnh ngày hình thành lúc nào; lệnh EMA hồi khớp / đóng giờ nào
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load, resample } from './core.mjs';
const E = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'emapb.js'));
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), m30 = resample(m15, 18e5);
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24, bar = (n, m) => '█'.repeat(Math.round(n / m * 30));
function zig(c, TH) { const L = []; let dir = 0, hi = -Infinity, hiI = 0, lo = Infinity, loI = 0, pI = 0, pP = 0;
  for (let i = 0; i < c.length; i++) { const x = c[i]; if (x.h > hi) { hi = x.h; hiI = i; } if (x.l < lo) { lo = x.l; loI = i; }
    if (dir === 0) { if (hi - lo >= TH) { dir = hiI > loI ? 1 : -1; pI = dir > 0 ? loI : hiI; pP = dir > 0 ? lo : hi; } continue; }
    if (dir === 1 && hi - x.l >= TH && i > hiI) { L.push({ d: 1, s: c[pI].t, e: c[hiI].t, size: hi - pP }); dir = -1; pI = hiI; pP = hi; lo = x.l; loI = i; }
    else if (dir === -1 && x.h - lo >= TH && i > loI) { L.push({ d: -1, s: c[pI].t, e: c[loI].t, size: pP - lo }); dir = 1; pI = loI; pP = lo; hi = x.h; hiI = i; } } return L; }
const hist = (title, vals, extra) => { const H = new Array(24).fill(0), X = new Array(24).fill(0).map(() => []); vals.forEach((v, i) => { H[v]++; if (extra) X[v].push(extra[i]); }); const m = Math.max(...H);
  console.log(`\n· ${title}`); for (let h = 0; h < 24; h++) console.log(`  ${String(h).padStart(2, '0')}h ${String(H[h]).padStart(4)} ${bar(H[h], m)}${extra && X[h].length ? '  ' + (X[h].reduce((a, b) => a + b, 0) / X[h].length).toFixed(0) + ' giá TB' : ''}`); };
for (const TH of [30, 50]) {
  const L = zig(m15, TH), days = 343;
  console.log(`\n================ SÓNG ≥ ${TH} GIÁ (M15): ${L.length} sóng = ${(L.length / days * 7).toFixed(1)}/tuần · dài TB ${(L.reduce((a, x) => a + x.size, 0) / L.length).toFixed(0)} giá · kéo dài TB ${(L.reduce((a, x) => a + (x.e - x.s), 0) / L.length / 36e5).toFixed(1)} giờ`);
  hist(`BẮT ĐẦU sóng ≥ ${TH} giá (giờ VN) — kèm độ dài trung bình`, L.map(x => hr(x.s)), L.map(x => x.size));
  hist(`KẾT THÚC sóng ≥ ${TH} giá (giờ VN)`, L.map(x => hr(x.e)));
  // cặp bắt đầu → kết thúc phổ biến
  const P = {}; for (const x of L) { const k = `${String(hr(x.s)).padStart(2, '0')}h → ${String(hr(x.e)).padStart(2, '0')}h`; P[k] = (P[k] || 0) + 1; }
  console.log('  cặp giờ bắt đầu → kết thúc hay gặp nhất: ' + Object.entries(P).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} (${v})`).join(' · '));
}
// ngày xu hướng: đáy (ngày tăng) / đỉnh (ngày giảm) của ngày VN hình thành lúc nào, và điểm kết thúc
{ const D = {}; for (const x of m15) { const k = Math.floor((x.t + 252e5 - 6 * 36e5) / 864e5); /* ngày giao dịch vàng: 06h VN → 06h hôm sau */ (D[k] = D[k] || []).push(x); }
  const st = [], en = [], sz = []; for (const B of Object.values(D)) { if (B.length < 80) continue; const o = B[0].o, c = B[B.length - 1].c; let hi = B[0], lo = B[0]; for (const x of B) { if (x.h > hi.h) hi = x; if (x.l < lo.l) lo = x; }
    const rng = hi.h - lo.l; if (Math.abs(c - o) < 0.5 * rng) continue; // chỉ ngày có xu hướng rõ (đóng cửa cách mở cửa ≥ 50% biên độ)
    if (c > o) { st.push(hr(lo.t)); en.push(hr(hi.t)); } else { st.push(hr(hi.t)); en.push(hr(lo.t)); } sz.push(rng); }
  console.log(`\n================ NGÀY CÓ XU HƯỚNG RÕ: ${st.length} ngày (biên độ TB ${(sz.reduce((a, b) => a + b, 0) / sz.length).toFixed(0)} giá)`);
  hist('Điểm BẮT ĐẦU xu hướng ngày (đáy của ngày tăng / đỉnh của ngày giảm)', st); hist('Điểm KẾT THÚC xu hướng ngày (đỉnh ngày tăng / đáy ngày giảm)', en);
  const len = st.map((h, i) => ((en[i] - h + 24) % 24)); console.log('  độ dài xu hướng ngày (giờ) trung vị: ' + len.slice().sort((a, b) => a - b)[len.length >> 1]); }
// lệnh EMA hồi (EMA M30): giờ khớp, giờ chạm TP / SL, thời gian giữ
{ const L = E.run({ m5, m15, emaC: m30 }, { spread: 0.35 }).filter(s => s.pts != null), W = L.filter(s => s.state === 'WIN'), Lo = L.filter(s => s.state === 'LOSS');
  console.log(`\n================ LỆNH EMA HỒI (EMA34/89 M30, vào M5): ${L.length} lệnh`);
  const H = new Array(24).fill(0).map(() => [0, 0, 0]); for (const s of L) { const h = hr(s.ct); H[h][0]++; if (s.state === 'WIN') H[h][1]++; if (s.state === 'LOSS') H[h][2]++; }
  console.log('· Giờ KHỚP lệnh: số lệnh · thắng%'); const m = Math.max(...H.map(x => x[0])); for (let h = 0; h < 24; h++) console.log(`  ${String(h).padStart(2, '0')}h ${String(H[h][0]).padStart(3)} ${bar(H[h][0], m).padEnd(30)} thắng ${H[h][0] ? Math.round(100 * H[h][1] / H[h][0]) : 0}%`);
  hist('Giờ CHẠM TP', W.map(s => hr(s.exitT))); hist('Giờ DÍNH SL', Lo.map(s => hr(s.exitT)));
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  console.log(`  giữ lệnh: TP trung vị ${(med(W.map(s => s.exitT - s.ct)) / 36e5).toFixed(1)} giờ · SL trung vị ${(med(Lo.map(s => s.exitT - s.ct)) / 36e5).toFixed(1)} giờ`); }
