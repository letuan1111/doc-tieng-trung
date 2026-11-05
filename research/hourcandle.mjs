// Có cây nến / khung giờ nào báo trước chiều đi của giá không? (vàng, 12 tháng, giờ VN; ngày giao dịch 06h → 05h hôm sau)
import { load, atr } from './core.mjs';
const sym = process.argv[2] || 'XAU';
const h1 = load(sym, 'h1'), A = atr(h1), S = Date.UTC(2026, 4, 5), n = h1.length;
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24, pct = (a, b) => b ? Math.round(100 * a / b) : 0;
// A. nến H1 ở giờ h: thân nến lớn (≥ 0.5 ATR) → 4 giờ sau giá đi cùng chiều?
console.log(`== ${sym} · A. Nến H1 theo giờ VN: nếu thân nến ≥ 0.5 ATR, 4 giờ sau giá đi CÙNG chiều nến bao nhiêu % (trước | gần) · chênh TB (giá)`);
for (let h = 0; h < 24; h++) {
  const R = { a: [0, 0], b: [0, 0] }, mv = [];
  for (let i = 20; i < n - 4; i++) { const x = h1[i]; if (hr(x.t) !== h) continue; const body = x.c - x.o; if (Math.abs(body) < 0.5 * A[i]) continue;
    if (h1[i + 4].t - x.t !== 4 * 36e5) continue; const fwd = h1[i + 4].c - x.c, same = Math.sign(fwd) === Math.sign(body); const g = x.t < S ? R.a : R.b; g[0]++; if (same) g[1]++; mv.push(Math.sign(body) * fwd); }
  const N = R.a[0] + R.b[0], W = R.a[1] + R.b[1]; if (!N) continue;
  console.log(`  ${String(h).padStart(2, '0')}h  ${String(N).padStart(3)} nến · cùng chiều ${String(pct(W, N)).padStart(2)}% (${pct(R.a[1], R.a[0])}% | ${pct(R.b[1], R.b[0])}%) · TB ${(mv.reduce((s, v) => s + v, 0) / mv.length).toFixed(1)} giá`);
}
// B. ngày giao dịch: chiều cả ngày so với nến đầu ngày / phiên Á / phá biên độ phiên Á
const D = {}; for (const x of h1) { const k = Math.floor((x.t + 7 * 36e5 - 6 * 36e5) / 864e5); (D[k] = D[k] || []).push(x); }
const tests = {
  'nến 06h (nến đầu ngày)': (B) => { const x = B.find(v => hr(v.t) === 6); return x ? { d: Math.sign(x.c - x.o), from: x.c, at: x.t } : null; },
  '2 giờ đầu 06h–08h': (B) => { const a = B.find(v => hr(v.t) === 6), b = B.find(v => hr(v.t) === 7); return a && b ? { d: Math.sign(b.c - a.o), from: b.c, at: b.t } : null; },
  'phiên Á 07h–13h': (B) => { const a = B.find(v => hr(v.t) === 7), b = B.find(v => hr(v.t) === 12); return a && b ? { d: Math.sign(b.c - a.o), from: b.c, at: b.t } : null; },
  'phá biên độ phiên Á (07–13h) lần đầu sau 13h': (B) => { const As = B.filter(v => hr(v.t) >= 7 && hr(v.t) < 13); if (As.length < 5) return null; const H = Math.max(...As.map(v => v.h)), L = Math.min(...As.map(v => v.l));
    for (const v of B) { const h = hr(v.t); if (h < 13 && h >= 6) continue; if (v.c > H) return { d: 1, from: v.c, at: v.t }; if (v.c < L) return { d: -1, from: v.c, at: v.t }; } return null; },
  'nến 14h (mở London)': (B) => { const x = B.find(v => hr(v.t) === 14); return x ? { d: Math.sign(x.c - x.o), from: x.c, at: x.t } : null; },
  'nến 20h (mở New York)': (B) => { const x = B.find(v => hr(v.t) === 20); return x ? { d: Math.sign(x.c - x.o), from: x.c, at: x.t } : null; },
};
console.log(`\n== B. Tín hiệu trong ngày → giá đóng cuối ngày (05h hôm sau) đi CÙNG chiều? (trước | gần) · lời TB nếu vào theo chiều đó tới cuối ngày`);
for (const [nm, f] of Object.entries(tests)) { const R = { a: [0, 0], b: [0, 0] }, pnl = [];
  for (const B of Object.values(D)) { if (B.length < 18) continue; const s = f(B); if (!s || !s.d) continue; const end = B[B.length - 1].c, same = Math.sign(end - s.from) === s.d; const g = s.at < S ? R.a : R.b; g[0]++; if (same) g[1]++; pnl.push(s.d * (end - s.from)); }
  const N = R.a[0] + R.b[0], W = R.a[1] + R.b[1];
  console.log(`  ${nm.padEnd(44)} ${String(N).padStart(3)} ngày · cùng chiều ${pct(W, N)}% (${pct(R.a[1], R.a[0])}% | ${pct(R.b[1], R.b[0])}%) · TB ${(pnl.reduce((s, v) => s + v, 0) / pnl.length).toFixed(1)} giá/ngày`); }
// C. nến nào thường là đỉnh/đáy của ngày (điểm bắt đầu sóng) — xác suất nến giờ h chứa đỉnh hoặc đáy ngày
console.log(`\n== C. Nến H1 giờ nào hay là ĐỈNH hoặc ĐÁY của ngày (điểm bắt đầu/kết thúc sóng ngày)`);
const cnt = new Array(24).fill(0); let days = 0;
for (const B of Object.values(D)) { if (B.length < 18) continue; days++; let hi = B[0], lo = B[0]; for (const v of B) { if (v.h > hi.h) hi = v; if (v.l < lo.l) lo = v; } cnt[hr(hi.t)]++; cnt[hr(lo.t)]++; }
const order = [...Array(24).keys()].map(h => (h + 6) % 24); const m = Math.max(...cnt);
for (const h of order) console.log(`  ${String(h).padStart(2, '0')}h ${String(Math.round(100 * cnt[h] / days)).padStart(3)}% số ngày ${'█'.repeat(Math.round(cnt[h] / m * 30))}`);
