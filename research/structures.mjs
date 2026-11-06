// Cấu trúc vào lệnh rút ra từ hành vi giá 2 năm (behavior.mjs) — test trên vàng & dầu, nến M5 Dukascopy, spread thật, 1 lệnh/lúc, TP không tính trên nến khớp.
// node research/structures.mjs XAU2Y|OIL → bảng + data/structures_{SYM}.json
import fs from 'node:fs'; import path from 'node:path';
import { DIR, load, ema, atr, pivots, mapHTF, resample } from './core.mjs';
const SYM = process.argv[2] || 'XAU2Y', OIL = SYM === 'OIL', NM = OIL ? 'Dầu WTI' : 'Vàng';
const SP = OIL ? 0.03 : 0.35, USD = OIL ? 20 : 2; // 0.02 lot
const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), m30 = resample(m15, 18e5), n = m5.length;
const VN = 7 * 36e5, hr = (t) => new Date(t + VN).getUTCHours(), dkey = (t) => new Date(t + VN).toISOString().slice(0, 10);
const A15 = mapHTF(m5, m15, atr(m15)), c15 = m15.map(x => x.c), T34 = mapHTF(m5, m15, ema(c15, 34)), T89 = mapHTF(m5, m15, ema(c15, 89));
const c30 = m30.map(x => x.c), M34 = mapHTF(m5, m30, ema(c30, 34)), M89 = mapHTF(m5, m30, ema(c30, 89));
const T0 = m5[300].t, T1 = m5[n - 1].t, Q = (t) => Math.min(3, Math.floor(4 * (t - T0) / (T1 - T0)));
const STRONG = OIL ? [14, 15, 16, 20, 21, 22] : [8, 19, 20, 21, 22];
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;

// mô phỏng: s = {j (nến vào, giá = entry), d, entry, sl, tp, limit?:true (j = nến khớp)}; TP không tính trên nến khớp, SL có
function sim(S, hold = 144) {
  S.sort((a, b) => a.j - b.j); const R = []; let busy = -1;
  for (const s of S) { if (s.j <= busy) continue; const { d, entry, sl, tp } = s, risk = d * (entry - sl); if (!(risk > 0)) continue;
    let res = null, ex = null, u = s.limit ? s.j : s.j + 1;
    if (s.limit) { const y = m5[u]; if (d > 0 ? y.l <= sl : y.h + SP >= sl) { res = 'SL'; ex = sl; } u++; }
    for (; !res && u < Math.min(n, s.j + 1 + hold); u++) { const y = m5[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= sl : hi >= sl) { res = 'SL'; ex = sl; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = 'TP'; ex = tp; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'TIME'; ex = d > 0 ? m5[u].c : m5[u].c + SP; }
    busy = u; R.push({ t: m5[s.j].t, h: hr(m5[s.j].t), d, res, r: d * (ex - entry) / risk, risk, dur: (m5[u].t - m5[s.j].t) / 6e4 }); }
  for (const r of R) r.usd = r.r * r.risk * USD; return R;
}
const ROWS = [];
function show(nm, R, note = '') {
  const w = R.filter(r => r.res === 'TP').length, U = R.reduce((a, r) => a + r.usd, 0), qs = [0, 1, 2, 3].map(q => R.filter(r => Q(r.t) === q));
  let eq = 0, pk = 0, dd = 0, ls = 0, mls = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = r.usd < 0 ? ls + 1 : 0; mls = Math.max(mls, ls); }
  const qU = qs.map(x => x.reduce((a, r) => a + r.usd, 0)), good = qU.filter(v => v > 0).length, days = (T1 - T0) / 864e5;
  const row = { nm, note, n: R.length, perDay: R.length / days * 7 / 5, win: pct(w, R.length), usd: U, dd, mls, avgR: R.length ? R.reduce((a, r) => a + r.r, 0) / R.length : 0, risk: R.length ? R.reduce((a, r) => a + r.risk, 0) / R.length : 0,
    q: qs.map((x, i) => ({ n: x.length, win: pct(x.filter(r => r.res === 'TP').length, x.length), usd: qU[i] })), good,
    hours: [...Array(24).keys()].map(h => { const x = R.filter(r => r.h === h); return { h, n: x.length, win: pct(x.filter(r => r.res === 'TP').length, x.length), usd: x.reduce((a, r) => a + r.usd, 0) }; }).filter(x => x.n) };
  ROWS.push(row);
  console.log(`${good === 4 ? '✓✓' : good === 3 ? '✓ ' : '  '} ${nm.padEnd(52)} ${String(R.length).padStart(4)}L ${row.perDay.toFixed(1)}/ngày · thắng ${String(row.win).padStart(2)}% · TB ${row.avgR >= 0 ? '+' : ''}${row.avgR.toFixed(2)}R · SL TB ${row.risk.toFixed(OIL ? 3 : 2)} · ${U >= 0 ? '+' : ''}${U.toFixed(0)}$ · DD ${dd.toFixed(0)} · thua l.t. ${mls} | ${row.q.map(q => `${q.win}%/${q.usd >= 0 ? '+' : ''}${q.usd.toFixed(0)}`).join(' · ')}`);
  return row;
}

// ---------- A. Quét đỉnh/đáy swing M5 rồi đóng lại (râu quét) — đảo chiều
const pv = pivots(m5, 3); function sweeps() {
  const out = []; let ih = 0, il = 0; const H = [], L = [];
  for (let k = 300; k < n - 1; k++) { while (ih < pv.H.length && pv.H[ih].conf <= k - 1) H.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k - 1) L.push(pv.L[il++]);
    const y = m5[k], a = A15[k]; if (!(a > 0)) continue;
    const h = H.filter(q => q.i >= k - 72).slice(-3).find(q => y.h > q.p && y.c < q.p && Math.max(...m5.slice(q.i + 1, k).map(v => v.h), -Infinity) <= q.p);
    if (h) out.push({ k, d: -1, lvl: h.p, ex: y.h, a });
    const l = L.filter(q => q.i >= k - 72).slice(-3).find(q => y.l < q.p && y.c > q.p && Math.min(...m5.slice(q.i + 1, k).map(v => v.l), Infinity) >= q.p);
    if (l) out.push({ k, d: 1, lvl: l.p, ex: y.l, a }); }
  return out;
}
const SW = sweeps();
const trend15 = (k) => Math.sign(T34[k] - T89[k]), trend30 = (k) => Math.sign(M34[k] - M89[k]);
function A(f, rr = 1.5, pad = 0.2) { return SW.filter(f).map(e => { const y = m5[e.k], entry = e.d > 0 ? y.c + SP : y.c, sl = e.ex - e.d * (pad * e.a + (e.d < 0 ? SP : 0)), risk = e.d * (entry - sl);
  return { j: e.k, d: e.d, entry, sl, tp: entry + e.d * rr * risk, risk }; }).filter(s => s.risk > 0.1 * A15[s.j] && s.risk < 1.5 * A15[s.j]); }

// ---------- B. Phiên Âu quét đỉnh/đáy phiên Á rồi M15 đóng lại trong biên → đánh ngược
function asia() {
  const D = {}; for (let k = 0; k < n; k++) { const h = hr(m5[k].t); if (h >= 7 && h < 14) { const g = D[dkey(m5[k].t)] = D[dkey(m5[k].t)] || { hi: -Infinity, lo: Infinity }; g.hi = Math.max(g.hi, m5[k].h); g.lo = Math.min(g.lo, m5[k].l); } }
  const out = [], done = {};
  for (let k = 300; k < n - 1; k++) { const y = m5[k], h = hr(y.t), key = dkey(y.t), g = D[key]; if (!g || h < 14 || h >= 19 || done[key]) continue; if ((Math.floor(y.ct / 9e5) * 9e5) !== y.ct) continue; // chỉ xét tại đóng M15
    const s = m5.slice(Math.max(0, k - 2), k + 1), hi = Math.max(...s.map(v => v.h)), lo = Math.min(...s.map(v => v.l)), a = A15[k];
    if (hi > g.hi && y.c < g.hi) { done[key] = 1; let ex = hi; for (let u = k; u > 0 && hr(m5[u].t) >= 14; u--) ex = Math.max(ex, m5[u].h); out.push({ k, d: -1, ex, a, mid: (g.hi + g.lo) / 2, opp: g.lo }); }
    else if (lo < g.lo && y.c > g.lo) { done[key] = 1; let ex = lo; for (let u = k; u > 0 && hr(m5[u].t) >= 14; u--) ex = Math.min(ex, m5[u].l); out.push({ k, d: 1, ex, a, mid: (g.hi + g.lo) / 2, opp: g.hi }); }
    else if (y.c > g.hi + 0.5 * a || y.c < g.lo - 0.5 * a) done[key] = 1; } // đã phá thật thì bỏ ngày
  return out;
}
const AS = asia();
function B(tp = 'mid', f = () => true) { return AS.filter(f).map(e => { const y = m5[e.k], entry = e.d > 0 ? y.c + SP : y.c, sl = e.ex - e.d * (0.2 * e.a + (e.d < 0 ? SP : 0)), risk = e.d * (entry - sl);
  const t = tp === 'mid' ? e.mid : tp === 'opp' ? e.opp : entry + e.d * (+tp) * risk; return { j: e.k, d: e.d, entry, sl, tp: t, risk, rr: e.d * (t - entry) / risk }; }).filter(s => s.risk > 0 && s.risk < 3 * A15[s.j] && s.rr >= 0.8); }

// ---------- C. FVG M15 thuận xu hướng M15 — limit ở mép gần, SL ngoài mép xa
function C(rr = 1.5, f = () => true) {
  const out = []; const i15 = new Map(m5.map((x, j) => [x.t, j])), At = atr(m15), E34 = ema(c15, 34), E89 = ema(c15, 89);
  for (let i = 100; i < m15.length - 1; i++) { const a = At[i], d = Math.sign(E34[i] - E89[i]); if (!d) continue;
    const top = d > 0 ? m15[i].l : m15[i - 2].l, bot = d > 0 ? m15[i - 2].h : m15[i].h; if (top - bot < 0.3 * a) continue; if (d * (m15[i - 1].c - m15[i - 1].o) <= 0) continue;
    const j0 = i5(m15[i + 1].t); if (j0 == null) continue; const near = d > 0 ? top : bot, far = d > 0 ? bot : top, entry = near, sl = far - d * (0.3 * a + (d < 0 ? SP : 0)), risk = d * (entry - sl);
    if (!f({ i, d, a, h: hr(m15[i + 1].t) })) continue;
    for (let u = j0; u < Math.min(n, j0 + 144); u++) { const y = m5[u]; if (d > 0 ? y.l + SP <= entry : y.h >= entry) { // buy limit khớp khi Ask = Bid+SP chạm mép
        out.push({ j: u, limit: true, d, entry, sl, tp: entry + d * rr * risk, risk }); break; } if (d * (y.c - far) < 0) break; } }
  function i5(t) { return i15.get(t); } return out;
}
// ---------- D. Test EMA M30 (EMA34/EMA89) thuận xu hướng + xác nhận M5 (giống EA EMA21 nhưng ở EMA chậm)
function Dm(src, rr = 1, f = () => true) {
  const out = []; const L = src === 89 ? M89 : M34;
  for (let k = 300; k < n - 1; k++) { const d = trend30(k), a = A15[k], y = m5[k], lvl = L[k]; if (!d || !(a > 0)) continue;
    if (!(d > 0 ? y.l <= lvl && m5[k - 1].l > lvl : y.h >= lvl && m5[k - 1].h < lvl)) continue; // lần chạm đầu
    // trước đó giá đã cách EMA ≥ 1.5 ATR trong 48 nến (đang là hồi về)
    let far = false; for (let u = k - 48; u < k; u++) if (d * ((d > 0 ? m5[u].l : m5[u].h) - lvl) > 1.5 * a) far = true; if (!far || !f({ k, d, h: hr(y.t) })) continue;
    let ex = d > 0 ? y.l : y.h; for (let u = k; u < Math.min(n - 1, k + 12); u++) { const z = m5[u]; ex = d > 0 ? Math.min(ex, z.l) : Math.max(ex, z.h); if (d * (ex - lvl) < -0.8 * a) break;
      if (d * (z.c - lvl) > 0 && d * (z.c - z.o) > 0) { const entry = d > 0 ? z.c + SP : z.c, sl = ex - d * (0.3 * a + (d < 0 ? SP : 0)), risk = d * (entry - sl); if (risk > 0 && risk < 2.5 * a) out.push({ j: u, d, entry, sl, tp: entry + d * rr * risk, risk }); break; } } }
  return out;
}

console.log(`######## ${NM} · ${new Date(T0).toISOString().slice(0, 10)} → ${new Date(T1).toISOString().slice(0, 10)} · spread ${SP} · 0.02 lot · cột cuối: 4 quý 6 tháng (thắng%/USD) · ✓✓ = lời cả 4 quý`);
console.log(`\n== A. Quét đỉnh/đáy swing M5 rồi đóng lại (${SW.length} lần) → đánh đảo chiều, SL ngoài râu + 0.2 ATR`);
show('A1 mọi giờ · TP 1.5R', sim(A(() => true)));
show(`A2 chỉ giờ mạnh (${STRONG.join(',')}h) · TP 1.5R`, sim(A(e => STRONG.includes(hr(m5[e.k].t)))));
show('A3 giờ mạnh + thuận xu hướng M15 · TP 1.5R', sim(A(e => STRONG.includes(hr(m5[e.k].t)) && trend15(e.k) === e.d)));
show('A4 giờ mạnh + thuận xu hướng M30 · TP 2R', sim(A(e => STRONG.includes(hr(m5[e.k].t)) && trend30(e.k) === e.d, 2)));
show('A5 giờ mạnh + NGƯỢC xu hướng M15 · TP 1.5R', sim(A(e => STRONG.includes(hr(m5[e.k].t)) && trend15(e.k) === -e.d)));
show('A6 thuận M30 + quét đáy/đỉnh khi đang hồi gần EMA34 M15 (≤1 ATR) · 2R', sim(A(e => trend30(e.k) === e.d && Math.abs(m5[e.k].c - T34[e.k]) <= A15[e.k], 2)));
console.log(`\n== B. Phiên Âu (14–19h) quét đỉnh/đáy phiên Á rồi nến M15 đóng lại trong biên (${AS.length} ngày)`);
show('B1 TP giữa biên phiên Á', sim(B('mid')));
show('B2 TP đầu kia biên phiên Á', sim(B('opp')));
show('B3 TP 1.5R', sim(B('1.5')));
show('B4 TP 1.5R · chỉ khi ngược xu hướng M30', sim(B('1.5', e => trend30(e.k) === e.d)));
console.log('\n== C. FVG M15 thuận xu hướng (EMA34>89 M15) · limit ở mép gần · SL ngoài mép xa + 0.3 ATR');
show('C1 TP 1R', sim(C(1))); show('C2 TP 1.5R', sim(C(1.5))); show('C3 TP 2R', sim(C(2)));
show(`C4 TP 1.5R · FVG sinh ra giờ mạnh`, sim(C(1.5, x => STRONG.includes(x.h))));
console.log('\n== D. Giá hồi về EMA M30 (đã cách ≥1.5 ATR), lần chạm đầu + nến M5 xác nhận');
show('D1 EMA34 M30 · TP 1R', sim(Dm(34, 1))); show('D2 EMA34 M30 · TP 1.5R', sim(Dm(34, 1.5)));
show('D3 EMA89 M30 · TP 1R', sim(Dm(89, 1))); show('D4 EMA89 M30 · TP 1.5R', sim(Dm(89, 1.5))); show('D5 EMA89 M30 · TP 2R', sim(Dm(89, 2)));
show(`D6 EMA89 M30 · TP 1.5R · trừ giờ yếu (3–4h, 10–11h)`, sim(Dm(89, 1.5, x => ![3, 4, 10, 11].includes(x.h))));
fs.writeFileSync(path.join(DIR, 'data', `structures_${SYM}.json`), JSON.stringify({ sym: SYM, from: T0, to: T1, rows: ROWS }));
