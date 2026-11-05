// EMA nào phản ứng NHANH nhất với đảo chiều? EMA nào giá TEST rồi bật lại nhiều nhất? — vàng 12 tháng
import { load, ema, atr, resample, mapHTF } from './core.mjs';
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), m30 = resample(m15, 18e5), FROM = Date.UTC(2025, 10, 5), S = Date.UTC(2026, 4, 5);
const A15 = atr(m15), pct = (a, b) => b ? Math.round(100 * a / b) : 0, med = (a) => { a = [...a].sort((x, y) => x - y); return a.length ? a[a.length >> 1] : NaN; };
// ---- sóng thật: zigzag M15 ngưỡng 3 ATR (≈ 18–20 giá) — dùng nhìn lại để đánh dấu đỉnh/đáy đảo chiều
const Z = []; { let dir = 0, ext = 0, ei = 0; for (let i = 20; i < m15.length; i++) { const x = m15[i], th = 3 * A15[i];
  if (dir >= 0) { if (x.h > ext || dir === 0 && !ei) { ext = x.h; ei = i; dir = dir || 1; } if (dir === 1 && x.l < ext - th) { Z.push({ i: ei, t: m15[ei].t, p: ext, type: 'H' }); dir = -1; ext = x.l; ei = i; continue; } }
  if (dir === -1) { if (x.l < ext) { ext = x.l; ei = i; } if (x.h > ext + th) { Z.push({ i: ei, t: m15[ei].t, p: ext, type: 'L' }); dir = 1; ext = x.h; ei = i; } } } }
const ZZ = Z.filter(z => z.t >= FROM); const legs = []; for (let j = 0; j + 1 < ZZ.length; j++) legs.push({ a: ZZ[j], b: ZZ[j + 1], size: Math.abs(ZZ[j + 1].p - ZZ[j].p) });
console.log(`Sóng thật (zigzag M15 ≥ 3 ATR): ${legs.length} sóng trong 12 tháng (${(legs.length / 260).toFixed(1)}/ngày), dài trung vị ${med(legs.map(l => l.size)).toFixed(0)} giá\n`);
// ---- A. trễ khi đảo chiều + báo sai
const TFS = { M5: m5, M15: m15, M30: m30 }, PER = [5, 8, 9, 13, 20, 21, 34, 50, 55, 89];
console.log('== A. Sau đỉnh/đáy thật, nến đóng cửa cắt EMA lần đầu: trễ bao lâu, mất bao nhiêu giá, bắt được bao nhiêu % sóng · và mọi lần cắt thì bao nhiêu % là thật (giá đi tiếp ≥ 1.5 ATR M15 trước khi cắt ngược lại)');
console.log('   khung · EMA   trễ (phút) · mất (giá) · bắt được % sóng · số lần cắt/ngày · % cắt thật');
const resA = [];
for (const [tn, C] of Object.entries(TFS)) { const At = mapHTF(C, m15, A15), cc = C.map(x => x.c); const T2 = new Map(); C.forEach((x, i) => T2.set(x.t, i));
  for (const p of PER) { const E = ema(cc, p); const lag = [], cost = [], cap = [];
    for (const L of legs) { const d = L.a.type === 'H' ? -1 : 1; // sóng mới đi theo d
      let i0 = C.findIndex ? null : null; // tìm chỉ số đầu tiên sau đỉnh
      let lo = 0, hi = C.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (C[m].t <= L.a.t) lo = m + 1; else hi = m; } i0 = lo;
      for (let i = i0; i < C.length && C[i].t <= L.b.t + 9e5; i++) if (d > 0 ? C[i].c > E[i] : C[i].c < E[i]) { lag.push((C[i].ct - L.a.t) / 6e4); const c0 = d * (C[i].c - L.a.p); cost.push(c0); cap.push(Math.max(0, (L.size - c0) / L.size)); break; } }
    // mọi lần cắt
    let N = 0, good = 0; for (let i = 120; i < C.length - 1; i++) { if (C[i].t < FROM) continue; const s0 = Math.sign(C[i - 1].c - E[i - 1]), s1 = Math.sign(C[i].c - E[i]); if (!s1 || s0 === s1) continue; N++; const d = s1, a = At[i] ?? 6;
      for (let u = i + 1; u < C.length; u++) { if (d * (C[u].c - E[u]) < 0) break; if (d > 0 ? C[u].h >= C[i].c + 1.5 * a : C[u].l <= C[i].c - 1.5 * a) { good++; break; } } }
    resA.push({ tn, p, lag: med(lag), cost: med(cost), cap: cap.reduce((a, v) => a + v, 0) / cap.length, cpd: N / 260, good: pct(good, N) }); } }
for (const r of resA) console.log(`   ${r.tn.padEnd(4)} · EMA${String(r.p).padEnd(3)} ${String(Math.round(r.lag)).padStart(5)} · ${r.cost.toFixed(1).padStart(5)} · ${String(Math.round(100 * r.cap)).padStart(3)}% · ${r.cpd.toFixed(1).padStart(5)} · ${r.good}%`);
// ---- B. TEST: giá đang ở một phía EMA ≥ 6 nến, chạm EMA → bật lại ≥ 1 ATR M15 trước khi đóng cửa xuyên qua 0.5 ATR?
console.log('\n== B. Giá đang chạy một phía EMA (≥ 6 nến) rồi chạm lại EMA: bao nhiêu lần/ngày · % bật lại ≥ 1 ATR M15 (≈6 giá) trước khi đóng cửa xuyên qua 0.5 ATR');
const resB = [];
for (const [tn, C] of Object.entries(TFS)) { const At = mapHTF(C, m15, A15), cc = C.map(x => x.c);
  for (const p of PER) { const E = ema(cc, p); let N = 0, ok = 0, side = 0, run = 0;
    for (let i = 120; i < C.length - 1; i++) { const s = Math.sign(C[i].c - E[i]); if (s === side) run++; else { side = s; run = 1; } if (C[i].t < FROM) continue;
      const x = C[i + 1], a = At[i] ?? 6; if (run < 6) continue; const d = side; if (!(d > 0 ? x.l <= E[i] : x.h >= E[i])) continue; N++;
      for (let u = i + 1; u < Math.min(C.length, i + 200); u++) { if (d * (C[u].c - E[u]) < -0.5 * a) break; if (d > 0 ? C[u].h >= E[i] + a : C[u].l <= E[i] - a) { ok++; break; } }
      run = 0; }
    resB.push({ tn, p, tpd: N / 260, ok: pct(ok, N) }); } }
for (const tn of Object.keys(TFS)) console.log(`   ${tn.padEnd(4)} ` + resB.filter(r => r.tn === tn).map(r => `EMA${r.p} ${r.tpd.toFixed(1)}/ngày ${r.ok}%`).join(' · '));
