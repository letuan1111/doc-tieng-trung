// Chiến lược của Letuan: vẽ vùng kháng cự/hỗ trợ H4 + H1, chấm điểm vùng mạnh → giá QUÉT thanh khoản qua vùng mạnh trên M15 → cấu trúc rõ (MSS M15) → vào lệnh.
// node research/zones.mjs XAU2Y|OIL → bảng test 2 năm + vùng hiện tại (data/zones_{SYM}.json)
import fs from 'node:fs'; import path from 'node:path';
import { DIR, load, atr, pivots, resample, ema } from './core.mjs';
const SYM = process.argv[2] || 'XAU2Y', OIL = SYM === 'OIL', NM = OIL ? 'Dầu WTI' : 'Vàng', SP = OIL ? 0.03 : 0.35, USD = OIL ? 20 : 2, dp = OIL ? 2 : 1;
const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), h1 = load(SYM, 'h1'), h4 = resample(h1, 144e5);
const VN = 7 * 36e5, hr = (t) => new Date(t + VN).getUTCHours(), pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const A4 = atr(h4), A1 = atr(h1), A15 = atr(m15), P4 = pivots(h4, 3), P1 = pivots(h1, 4), P15 = pivots(m15, 2);
const E34 = ema(m15.map(x => x.c), 34), E89 = ema(m15.map(x => x.c), 89);
const i5 = new Map(m5.map((x, j) => [x.t, j]));

// ---------- 1. Vùng S/R tại thời điểm T (chỉ dùng pivot đã xác nhận trước T)
// mỗi pivot = 1 lần giá chạm & đảo; H4 nặng 2, H1 nặng 1; cộng thêm theo độ bật (ATR) sau pivot. Gom các pivot gần nhau (≤ 0.35 ATR H4) thành 1 vùng.
function react(c, A, q, kind) { const i = q.i, a = A[i]; let m = 0; for (let u = i + 1; u < Math.min(c.length, i + 13); u++) m = Math.max(m, kind > 0 ? c[i].h - c[u].l : c[u].h - c[i].l); return m / a; }
for (const [c, A, P] of [[h4, A4, P4], [h1, A1, P1]]) { for (const q of P.H) q.r = react(c, A, q, 1); for (const q of P.L) q.r = react(c, A, q, -1); }
function zonesAt(T, look4 = 120, look1 = 240) {
  let k4 = -1; while (k4 + 1 < h4.length && h4[k4 + 1].ct <= T) k4++; let k1 = -1; while (k1 + 1 < h1.length && h1[k1 + 1].ct <= T) k1++;
  return zonesFrom(k4, k1, look4, look1);
}
function zonesFrom(k4, k1, look4 = 120, look1 = 240) {
  if (k4 < 30 || k1 < 30) return { Z: [], a4: 0 }; const a4 = A4[k4], pts = [];
  const add = (P, k, look, w, tf) => { for (const q of P.H) if (q.conf <= k && q.i >= k - look) pts.push({ p: q.p, w: w * (1 + Math.min(q.r, 3) / 3), tf, k: 1, t: q.i }); for (const q of P.L) if (q.conf <= k && q.i >= k - look) pts.push({ p: q.p, w: w * (1 + Math.min(q.r, 3) / 3), tf, k: -1, t: q.i }); };
  add(P4, k4, look4, 2, 4); add(P1, k1, look1, 1, 1); pts.sort((a, b) => a.p - b.p);
  const Z = []; for (const q of pts) { const z = Z[Z.length - 1]; if (z && q.p - z.hi <= 0.35 * a4) { z.hi = Math.max(z.hi, q.p); z.pts.push(q); } else Z.push({ lo: q.p, hi: q.p, pts: [q] }); }
  for (const z of Z) { const w = z.hi - z.lo; if (w < 0.2 * a4) { const m = (z.lo + z.hi) / 2; z.lo = m - 0.1 * a4; z.hi = m + 0.1 * a4; }
    z.touch = z.pts.length; z.h4 = z.pts.filter(q => q.tf === 4).length; z.h1 = z.touch - z.h4; z.flip = new Set(z.pts.map(q => q.k)).size === 2; // vừa là đỉnh vừa là đáy = vùng đổi vai
    z.score = z.pts.reduce((s, q) => s + q.w, 0) + (z.h4 && z.h1 ? 1 : 0) + (z.flip ? 1 : 0); }
  return { Z, a4 };
}
// ---------- 2. Tín hiệu trên M15: quét qua mép vùng mạnh rồi đóng lại → MSS M15 trong ≤ W nến
function signals(o) {
  const out = []; let k4 = -1, k1 = -1, cur = null, used = new Map(), pend = [];
  let ih = 0, il = 0; const SH = [], SL = [];
  for (let i = 120; i < m15.length - 1; i++) { const x = m15[i], a = A15[i - 1];
    while (ih < P15.H.length && P15.H[ih].conf <= i) SH.push(P15.H[ih++]); while (il < P15.L.length && P15.L[il].conf <= i) SL.push(P15.L[il++]);
    let ch = false; while (k4 + 1 < h4.length && h4[k4 + 1].ct <= x.t) { k4++; ch = true; } while (k1 + 1 < h1.length && h1[k1 + 1].ct <= x.t) { k1++; ch = true; }
    if (ch || !cur) cur = zonesFrom(k4, k1); const { Z, a4 } = cur; if (!a4) continue;
    // 2a. bắt cú quét mới
    for (const z of Z) { if (z.score < o.minScore) continue; const key = Math.round(z.lo / (0.2 * a4)); if ((used.get(key) || 0) > x.t) continue;
      const prev = m15[i - 1];
      if (prev.l > z.lo && x.l < z.lo - o.minDepth * a && x.l > z.lo - o.maxDepth * a4 && x.c > z.lo) { // quét đáy vùng hỗ trợ
        const lh = SH.filter(q => q.i < i && q.i >= i - 24).slice(-1)[0]; const lvl = lh ? lh.p : Math.max(...m15.slice(i - 6, i).map(v => v.h));
        pend.push({ d: 1, z, i0: i, ex: x.l, lvl, a, a4 }); used.set(key, x.t + 12 * 36e5); }
      if (prev.h < z.hi && x.h > z.hi + o.minDepth * a && x.h < z.hi + o.maxDepth * a4 && x.c < z.hi) { // quét đỉnh vùng kháng cự
        const hl = SL.filter(q => q.i < i && q.i >= i - 24).slice(-1)[0]; const lvl = hl ? hl.p : Math.min(...m15.slice(i - 6, i).map(v => v.l));
        pend.push({ d: -1, z, i0: i, ex: x.h, lvl, a, a4 }); used.set(key, x.t + 12 * 36e5); } }
    // 2b. chờ cấu trúc
    const keep = []; for (const p of pend) { if (i === p.i0 && o.mss) { keep.push(p); continue; }
      const d = p.d; p.ex = d > 0 ? Math.min(p.ex, x.l) : Math.max(p.ex, x.h);
      if (d * (x.c - (d > 0 ? p.z.lo : p.z.hi)) < 0 || d * (p.ex - (d > 0 ? p.z.lo : p.z.hi)) < -o.maxDepth * p.a4) continue; // đóng thủng lại vùng → hủy
      const ok = o.mss ? d * (x.c - p.lvl) > 0 : true;
      if (ok) { if (!o.hours || o.hours.includes(hr(x.ct))) out.push({ ...p, iC: i, h: hr(x.ct), trend: Math.sign(E34[i] - E89[i]) }); continue; }
      if (i - p.i0 < o.wait) keep.push(p); }
    pend = keep; }
  return out;
}
// ---------- 3. Vào lệnh & mô phỏng trên M5
function trades(S, o) {
  const R = []; let busyT = 0;
  for (const s of S) { const x = m15[s.iC]; if (x.ct < busyT) continue; const d = s.d; let j = i5.get(x.ct); if (j == null) continue;
    let entry, fill = j; const slP = s.ex - d * (0.2 * s.a + (d < 0 ? SP : 0));
    if (o.entry === 'mid') { entry = (s.ex + x.c) / 2; fill = -1; for (let u = j; u < Math.min(m5.length, j + 36); u++) { const y = m5[u]; if (d > 0 ? y.l + SP <= entry : y.h >= entry) { fill = u; break; } if (d > 0 ? y.l <= slP : y.h + SP >= slP) break; } if (fill < 0) continue; }
    else entry = d > 0 ? x.c + SP : x.c;
    const risk = d * (entry - slP); if (!(risk > 0.3 * s.a) || risk > 1.5 * s.a4) continue;
    let tp; if (o.tp === 'zone') { // TP = mép gần của vùng mạnh đối diện, cần ≥ 1.5R
      const { Z } = zonesAt(x.ct); const opp = Z.filter(z => z.score >= o.minScore && (d > 0 ? z.lo > entry + 0.5 * risk : z.hi < entry - 0.5 * risk)).sort((a, b) => d * ((d > 0 ? a.lo : a.hi) - (d > 0 ? b.lo : b.hi)))[0];
      if (!opp) continue; tp = d > 0 ? opp.lo - SP : opp.hi + SP; if (d * (tp - entry) < 1.5 * risk) continue; if (d * (tp - entry) > 5 * risk) tp = entry + d * 5 * risk; }
    else tp = entry + d * o.tp * risk;
    let res = null, ex = null, u = o.entry === 'mid' ? fill : j; const st = u;
    if (o.entry === 'mid') { const y = m5[u]; if (d > 0 ? y.l <= slP : y.h + SP >= slP) { res = 'SL'; ex = slP; } u++; }
    for (; !res && u < Math.min(m5.length, st + 288); u++) { const y = m5[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= slP : hi >= slP) { res = 'SL'; ex = slP; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = 'TP'; ex = tp; break; } }
    if (!res) { u = Math.min(m5.length - 1, u); res = 'TIME'; ex = d > 0 ? m5[u].c : m5[u].c + SP; }
    busyT = m5[u].ct; const r = d * (ex - entry) / risk;
    R.push({ t: x.ct, h: s.h, d, res, r, usd: r * risk * USD, risk, rr: d * (tp - entry) / risk, score: s.z.score, trend: s.trend, entry, sl: slP, tp }); }
  return R;
}
const T0 = m15[300].t, T1 = m15[m15.length - 1].t, Q = (t) => Math.min(3, Math.floor(4 * (t - T0) / (T1 - T0))), ROWS = [];
function show(nm, R) {
  const w = R.filter(r => r.res === 'TP').length, U = R.reduce((a, r) => a + r.usd, 0), qU = [0, 1, 2, 3].map(q => R.filter(r => Q(r.t) === q).reduce((a, r) => a + r.usd, 0)), qW = [0, 1, 2, 3].map(q => { const x = R.filter(r => Q(r.t) === q); return pct(x.filter(r => r.res === 'TP').length, x.length); });
  let eq = 0, pk = 0, dd = 0, ls = 0, mls = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = r.usd < 0 ? ls + 1 : 0; mls = Math.max(mls, ls); }
  const good = qU.filter(v => v > 0).length, days = (T1 - T0) / 864e5 * 5 / 7, avgRR = R.reduce((a, r) => a + r.rr, 0) / (R.length || 1);
  ROWS.push({ nm, n: R.length, perDay: R.length / days, win: pct(w, R.length), usd: U, dd, mls, good, q: qU.map((u, i) => ({ usd: u, win: qW[i] })), risk: R.reduce((a, r) => a + r.risk, 0) / (R.length || 1), rr: avgRR });
  console.log(`${good === 4 ? '✓✓' : good === 3 ? '✓ ' : '  '} ${nm.padEnd(50)} ${String(R.length).padStart(4)}L ${(R.length / days).toFixed(2)}/ngày · thắng ${String(pct(w, R.length)).padStart(2)}% · RR TB ${avgRR.toFixed(1)} · SL TB ${(R.reduce((a, r) => a + r.risk, 0) / (R.length || 1)).toFixed(dp + 1)} · ${U >= 0 ? '+' : ''}${U.toFixed(0)}$ · DD ${dd.toFixed(0)} · thua l.t. ${mls} | ${qU.map((u, i) => `${qW[i]}%/${u >= 0 ? '+' : ''}${u.toFixed(0)}`).join(' · ')}`);
  return R;
}
export { zonesAt, signals, trades, show, m15, m5, h4, h1, A15, A4, SP, USD, OIL, NM, dp, ROWS, T0, T1 };
if ((process.argv[1] || '').endsWith('zones.mjs')) {
  const STRONG = OIL ? [14, 15, 16, 20, 21, 22, 23] : [8, 9, 19, 20, 21, 22, 23];
  const base = { minScore: 4, minDepth: 0.05, maxDepth: 0.6, wait: 8, mss: true };
  console.log(`######## ${NM} · ${new Date(T0).toISOString().slice(0, 10)} → ${new Date(T1).toISOString().slice(0, 10)} · spread ${SP} · 0.02 lot · cột cuối: 4 quý 6 tháng (thắng%/USD)`);
  console.log('\n== A. Độ mạnh vùng (điểm ≥ X) · quét M15 + MSS M15 · vào khi đóng nến MSS · TP 2R');
  for (const s of [2, 3, 4, 6, 8]) show(`vùng điểm ≥ ${s}`, trades(signals({ ...base, minScore: s }), { tp: 2 }));
  console.log('\n== B. Vùng điểm ≥ 4 · đổi cách vào / TP');
  const S4 = signals(base);
  for (const tp of [1, 1.5, 2, 3]) show(`vào khi MSS đóng · TP ${tp}R`, trades(S4, { tp }));
  show('vào khi MSS đóng · TP vùng mạnh đối diện', trades(S4, { tp: 'zone', minScore: 4 }));
  for (const tp of [2, 3]) show(`limit 50% chân quét→MSS · TP ${tp}R`, trades(S4, { tp, entry: 'mid' }));
  show('limit 50% · TP vùng mạnh đối diện', trades(S4, { tp: 'zone', entry: 'mid', minScore: 4 }));
  console.log('\n== C. Bộ lọc thêm (vùng ≥ 4 · MSS · TP 2R)');
  show('không cần MSS (quét xong đóng lại là vào)', trades(signals({ ...base, mss: false, wait: 1 }), { tp: 2 }));
  show(`chỉ giờ mạnh ${STRONG.join(',')}h`, trades(signals({ ...base, hours: STRONG }), { tp: 2 }));
  show('chỉ thuận xu hướng M15 (EMA34/89)', trades(S4.filter(s => s.trend === s.d), { tp: 2 }));
  show('chỉ ngược xu hướng M15 (bắt đảo chiều)', trades(S4.filter(s => s.trend === -s.d), { tp: 2 }));
  show('quét sâu ≥ 0.3 ATR M15', trades(signals({ ...base, minDepth: 0.3 }), { tp: 2 }));
  show('chờ MSS tối đa 4 nến', trades(signals({ ...base, wait: 4 }), { tp: 2 }));
  show('chờ MSS tối đa 16 nến', trades(signals({ ...base, wait: 16 }), { tp: 2 }));
  fs.writeFileSync(path.join(DIR, 'data', `zones_${SYM}.json`), JSON.stringify({ rows: ROWS }));
}
