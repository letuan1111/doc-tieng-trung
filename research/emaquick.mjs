// Đánh các lần TEST NHANH vào EMA (M15/M30) theo chiều giá đang chạy — limit tại EMA hoặc chờ nến M5 bật lại. Mô phỏng M5, 0.02 lot, 1 lệnh một lúc.
import { load, ema, atr, resample, mapHTF } from './core.mjs';
const SYM = process.env.SYM || 'XAU', K = SYM === 'XAU' ? 1 : 25, UP = SYM === 'XAU' ? 2 : 0.02;
const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), m30 = resample(m15, 18e5), FROM = Date.UTC(2025, 10, 5), S = Date.UTC(2026, 4, 5), SP = +(process.env.SP || (SYM === 'XAU' ? 0.35 : 8));
const A15 = atr(m15), n5 = m5.length, pct = (a, b) => b ? Math.round(100 * a / b) : 0, hr = (t) => (new Date(t).getUTCHours() + 7) % 24;
const i5 = new Map(m5.map((x, j) => [x.t, j]));
const T30 = { e34: mapHTF(m15, m30, ema(m30.map(x => x.c), 34)), e89: mapHTF(m15, m30, ema(m30.map(x => x.c), 89)) };
function trade(C, tfMs, p, o) { const E = ema(C.map(x => x.c), p), At = C === m15 ? A15 : mapHTF(C, m15, A15), R = []; let side = 0, run = 0, busyT = 0;
  const T34 = C === m15 ? T30.e34 : ema(C.map(x => x.c), 34), T89 = C === m15 ? T30.e89 : ema(C.map(x => x.c), 89);
  for (let i = 120; i < C.length - 1; i++) { const s = Math.sign(C[i].c - E[i]); if (s === side) run++; else { side = s; run = 1; }
    if (C[i].t < FROM || C[i + 1].t < busyT || run < (o.run ?? 6)) continue; const d = side, a = At[i] ?? 6, lvl = E[i];
    if (o.trend && Math.sign(T34[i] - T89[i]) !== d) continue; if (o.hours && !o.hours.includes(hr(C[i + 1].t))) continue;
    const j0 = i5.get(C[i + 1].t); if (j0 == null) continue; const jEnd = j0 + tfMs / 3e5;
    let jf = -1, entry, slP;
    if (o.mode === 'limit') { for (let j = j0; j < jEnd && j < n5; j++) { const y = m5[j]; if (d > 0 ? y.l + SP <= lvl : y.h >= lvl) { jf = j; entry = d > 0 ? Math.min(lvl, y.o + SP) : Math.max(lvl, y.o); break; } }
      if (jf < 0) continue; slP = entry - d * (o.sl ?? 0.6) * a; }
    else { let touched = -1, ex = null; for (let j = j0; j < jEnd + (o.wait ?? 6) && j < n5 - 1; j++) { const y = m5[j];
        if (touched < 0) { if (j >= jEnd) break; if (d > 0 ? y.l <= lvl : y.h >= lvl) { touched = j; ex = d > 0 ? y.l : y.h; } else continue; }
        ex = d > 0 ? Math.min(ex, y.l) : Math.max(ex, y.h); if (d * (ex - lvl) < -(o.maxPierce ?? 0.8) * a) break; // xuyên quá sâu → bỏ
        const rng = y.h - y.l, body = Math.abs(y.c - y.o), wick = d > 0 ? Math.min(y.o, y.c) - y.l : y.h - Math.max(y.o, y.c);
        const okC = o.mode === 'reject' ? (d * (y.c - lvl) > 0 && wick >= 0.4 * rng && d * (y.c - y.o) > 0) : d * (y.c - lvl) > 0 && d * (y.c - y.o) > 0;
        if (okC) { jf = j + 1; entry = d > 0 ? m5[jf].o + SP : m5[jf].o; slP = ex - d * ((o.pad ?? 0.3) * a + (d < 0 ? SP : 0)); break; } }
      if (jf < 0) continue; }
    const risk = d * (entry - slP); if (!(risk > 0.5 * K) || risk > (o.maxSL ?? 15) * K) continue; const tp = entry + d * (o.rr ?? 1) * risk;
    let res = null, exP = null, j = jf; for (; j < Math.min(n5, jf + 144); j++) { const y = m5[j], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= slP : hi >= slP) { res = 'SL'; exP = slP; break; } if ((o.mode !== 'limit' || j > jf) && (d > 0 ? hi >= tp : lo <= tp)) { res = 'TP'; exP = tp; break; } }
    if (!res) { j = Math.min(n5 - 1, j); res = 'T'; exP = d > 0 ? m5[j].c : m5[j].c + SP; } busyT = m5[j].t; run = 0;
    R.push({ t: C[i].t, h: hr(m5[jf].t), d, res, usd: d * (exP - entry) * UP, risk: risk / K }); }
  return R; }
const st = (R) => { const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0); let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = r.usd < 0 ? ls + 1 : 0; ml = Math.max(ml, ls); }
  return { n: R.length, pd: R.length / 260, wr: w / (R.length || 1), U: U(() => true), a: U(r => r.t < S), b: U(r => r.t >= S), dd, ml, sl: R.reduce((s, r) => s + r.risk, 0) / (R.length || 1) }; };
const fmt = (k, s) => `${(s.a > 0 && s.b > 0) ? '✓' : ' '} ${k.padEnd(56)} ${String(s.n).padStart(4)} (${s.pd.toFixed(1)}/ngày) · thắng ${String(Math.round(100 * s.wr)).padStart(2)}% · SL TB ${s.sl.toFixed(1)} · ${s.U >= 0 ? '+' : ''}${s.U.toFixed(0)}$ (trước ${s.a.toFixed(0)} · gần ${s.b.toFixed(0)}) · DD ${s.dd.toFixed(0)} · thua l.t. ${s.ml}`;
export { trade, st, fmt, m15, m30 };
if (process.argv[1].endsWith('emaquick.mjs')) {
  const rows = [];
  for (const [tn, C, ms] of [['M15', m15, 9e5], ['M30', m30, 18e5]]) for (const p of [9, 21, 34, 55, 89]) for (const mode of ['limit', 'confirm', 'reject']) for (const trend of [false, true]) for (const rr of [1, 1.5, 2]) {
    const o = { mode, trend, rr }; const s = st(trade(C, ms, p, o)); if (s.n < 100) continue; rows.push({ k: `${tn} EMA${p} · ${mode === 'limit' ? 'limit tại EMA' : mode === 'confirm' ? 'chờ nến M5 bật lại' : 'chờ nến M5 rút râu'}${trend ? ' · +xu hướng M30' : ''} · TP ${rr}R`, ...s }); }
  const ok = rows.filter(r => r.a > 0 && r.b > 0);
  console.log(`${rows.length} cấu hình (≥100 lệnh), lời cả 2 nửa: ${ok.length}`);
  console.log('\n=== ≥ 2 lệnh/ngày, lời cả 2 nửa'); ok.filter(r => r.pd >= 2).sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b)).slice(0, 12).forEach(r => console.log(fmt(r.k, r)));
  console.log('\n=== 1–2 lệnh/ngày, lời cả 2 nửa'); ok.filter(r => r.pd >= 1 && r.pd < 2).sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b)).slice(0, 12).forEach(r => console.log(fmt(r.k, r)));
  console.log('\n=== Theo EMA (chờ nến M5 bật lại · +xu hướng M30 · TP 1.5R)'); for (const [tn, C, ms] of [['M15', m15, 9e5], ['M30', m30, 18e5]]) for (const p of [9, 21, 34, 55, 89]) console.log(fmt(`${tn} EMA${p}`, st(trade(C, ms, p, { mode: 'confirm', trend: true, rr: 1.5 }))));
  console.log('\n=== Limit tại EMA (TP 1R) — tham khảo'); for (const [tn, C, ms] of [['M15', m15, 9e5], ['M30', m30, 18e5]]) for (const p of [9, 21, 34, 55, 89]) console.log(fmt(`${tn} EMA${p}`, st(trade(C, ms, p, { mode: 'limit', rr: 1 }))));
}
