// Kiểm lại "kế hoạch A/B/C" (ảnh 10/11) trên toàn bộ lịch sử vàng:
// xu hướng = EMA34/89 H4 và H1 cùng chiều lúc 06:00 UTC (13h VN) · biên phiên Á 00–06 UTC
// A: (cùng xu hướng) quét biên Á phía ngược → M15 đóng lại trong biên → M5 CHoCH → vào; SL dưới râu quét; TP = mép biên đối diện; BE ở 1.5R
// B: (cùng xu hướng) M15 đóng ngoài biên Á cùng chiều → chờ retest mép biên → vào limit; SL max(0.3 biên, 1 ATR M15); TP 2R; BE 1.5R
// C: (ngược xu hướng) M15 đóng ngoài biên Á phía ngược ≥ 0.3 ATR → retest → vào; như B
// vào lệnh 06–15 UTC (13h–22h VN), đóng hết 20 UTC; mỗi lúc 1 lệnh; spread 0.35; nến chạm cả SL lẫn TP → SL
// node research/kehoach-abc.mjs [XAU2Y] [notrend] > out.json
import { load, resample, ema, atr, mapHTF } from './core.mjs';
const AM = process.env.AM || 'retest', sym = process.argv[2] || 'XAU2Y', NOTREND = process.argv[3] === 'notrend', SP = 0.35, USD = 2;
const c = load(sym, 'm5'), m15 = load(sym, 'm15'), h1 = load(sym, 'h1'), h4 = resample(h1, 144e5);
const E = (H) => [mapHTF(c, H, ema(H.map(x => x.c), 34)), mapHTF(c, H, ema(H.map(x => x.c), 89))];
const eh1 = E(h1), eh4 = E(h4), A15 = mapHTF(c, m15, atr(m15));
const trades = []; const days = {};
let pos = null; const DBG = {};
const hrOf = (t) => new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
function manage(k) { // quản lý lệnh đang mở trên nến k
  const z = c[k], d = pos.d, lo = d > 0 ? z.l : z.l + SP, hi = d > 0 ? z.h : z.h + SP;
  if (d > 0 ? lo <= pos.sl : hi >= pos.sl) return close(k, pos.sl, pos.be ? 'BE' : 'SL');
  if (d > 0 ? hi >= pos.tp : lo <= pos.tp) return close(k, pos.tp, 'TP');
  if (!pos.be && (d > 0 ? hi >= pos.entry + 1.5 * pos.risk : lo <= pos.entry - 1.5 * pos.risk)) { pos.be = true; pos.sl = pos.entry; }
  if (hrOf(z.ct) >= 20) return close(k, d > 0 ? z.c : z.c + SP, 'TIME');
}
function close(k, px, why) { const r = pos.d * (px - pos.entry) / pos.risk; trades.push({ ...pos, exitT: c[k].ct, exitP: px, why, r, usd: pos.d * (px - pos.entry) * USD, k1: k }); pos = null; }
function open(k, sc, d, entry, sl, tp, extra) { if (process.env.ONLY && !process.env.ONLY.includes(sc)) return false; const risk = d * (entry - sl); if (!(risk > 0)) return false; pos = { sc, d, t: c[k].ct, k0: k, entry, sl, tp, risk, be: false, ...extra }; return true; }
let day = null, S = null;
for (let k = 300; k < c.length; k++) {
  const x = c[k], dk = Math.floor(x.t / 864e5), h = hrOf(x.t), a = A15[k];
  if (dk !== day) { if (S) days[S.date] = S.sum; day = dk; S = { date: new Date(dk * 864e5).toISOString().slice(0, 10), aH: -Infinity, aL: Infinity, T: null, A: { st: 0 }, B: { st: 0 }, C: { st: 0 }, sum: {} }; }
  if (pos) { manage(k); }
  if (h < 6) { S.aH = Math.max(S.aH, x.h); S.aL = Math.min(S.aL, x.l); continue; }
  if (S.T === null) { const d4 = Math.sign(eh4[0][k] - eh4[1][k]), d1 = Math.sign(eh1[0][k] - eh1[1][k]); S.T = NOTREND ? 9 : (d4 === d1 ? d4 : 0); S.sum = { T: S.T, aH: S.aH, aL: S.aL }; }
  if (h >= 15 || !(a > 0) || !isFinite(S.aH)) continue;
  const rng = S.aH - S.aL, m15close = (x.ct % 9e5) === 0;
  const dirs = S.T === 9 ? [1, -1] : S.T ? [S.T] : [];
  for (const T of dirs) {
    const lvlA = T > 0 ? S.aL : S.aH, lvlB = T > 0 ? S.aH : S.aL;
    // --- A: quét biên phía ngược rồi đảo theo xu hướng
    const A = S.A[T] || (S.A[T] = { st: 0 });
    if (A.st === 0 && (T > 0 ? x.l < lvlA : x.h > lvlA)) { A.st = 1; A.ext = T > 0 ? x.l : x.h; A.ki = k; A.ref = -Infinity * T; for (let u = Math.max(0, k - 6); u <= k; u++) A.ref = T > 0 ? Math.max(A.ref, c[u].h) : Math.min(A.ref, c[u].l); A.back = false; }
    if (A.st === 1) { DBG.sw = (DBG.sw||0) + (A.ki === k);
      if (T > 0 ? x.l < A.ext : x.h > A.ext) { A.ext = T > 0 ? x.l : x.h; A.ki = k; A.ref = T > 0 ? Math.max(...c.slice(Math.max(0, k - 6), k + 1).map(z => z.h)) : Math.min(...c.slice(Math.max(0, k - 6), k + 1).map(z => z.l)); }
      if (T * (lvlA - A.ext) > 1.2 * a || (m15close && T * (x.c - lvlA) < -0.3 * a)) A.st = 3; // quét quá sâu / M15 đóng hẳn ngoài biên → hỏng A
      else if (k - A.ki > 24) A.st = 3;
      else { const wasBack = A.back; if (m15close && T * (x.c - lvlA) > 0) A.back = true;
        const cho = A.back && T * (x.c - A.ref) > 0;
        const trig = AM === 'close' ? (A.back && !wasBack) : AM === 'cho' ? cho : (A.cho = A.cho || cho);
        if (trig && !pos) {
          let entry = AM === 'retest' ? lvlA + T * 0.1 * a + (T > 0 ? SP : 0) : (T > 0 ? x.c + SP : x.c);
          const fill = AM !== 'retest' || (T > 0 ? x.l + SP <= entry : x.h >= entry);
          const sl = A.ext - T * 0.15 * a + (T < 0 ? SP : 0), risk = T * (entry - sl);
          if (fill && risk > 0 && risk <= 1.5 * a && T * (lvlB - entry) >= 1.5 * risk) { open(k, 'A', T, entry, sl, lvlB, { lvl: lvlA, ext: A.ext, aH: S.aH, aL: S.aL, ki: A.ki }); A.st = 2; }
          else if (fill && AM !== 'retest') A.st = 3; } } }
    // --- B (cùng xu hướng) và C (ngược xu hướng): phá biên → retest
    for (const [nm, d, lv, need] of [['B', T, lvlB, 0], ['C', -T, lvlA, 0.3]]) {
      if (S.T === 9 && nm === 'C') continue;
      const Q = S[nm][T] || (S[nm][T] = { st: 0 });
      if (Q.st === 0 && m15close && d * (x.c - lv) > need * a) { Q.st = 1; Q.kb = k; Q.run = x.c; }
      else if (Q.st === 1) {
        const lim = lv, risk = Math.max(0.3 * rng, a), tp = lim + d * 2 * risk;
        if (d * ((d > 0 ? x.h : x.l) - tp) >= 0) { Q.st = 3; continue; } // chạy tới TP khi chưa khớp → bỏ
        if (k - Q.kb > 48) { Q.st = 3; continue; }
        const fill = d > 0 ? x.l + SP <= lim : x.h >= lim;
        if (fill && !pos) { open(k, nm, d, lim, lim - d * risk, tp, { lvl: lv, aH: S.aH, aL: S.aL, kb: Q.kb }); Q.st = 2; }
        else if (fill) Q.st = 3;
      }
    }
  }
}
const st = (L) => { const n = L.length, w = L.filter(t => t.why === 'TP').length, be = L.filter(t => t.why === 'BE').length, R = L.reduce((s, t) => s + t.r, 0), U = L.reduce((s, t) => s + t.usd, 0); let eq = 0, pk = 0, dd = 0; for (const t of L) { eq += t.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); } const win = L.filter(t => t.usd > 0).length;
  return { n, tp: w, be, lai: win, winPct: n ? +(100 * win / n).toFixed(1) : 0, tpPct: n ? +(100 * w / n).toFixed(1) : 0, R: +R.toFixed(1), usd: Math.round(U), dd: Math.round(dd) }; };
const half = Date.parse('2025-11-05');
const out = { sym, notrend: NOTREND, from: new Date(c[300].t).toISOString().slice(0, 10), to: new Date(c.at(-1).t).toISOString().slice(0, 10), all: st(trades), y1: st(trades.filter(t => t.t < half)), y2: st(trades.filter(t => t.t >= half)) };
for (const s of ['A', 'B', 'C']) out[s] = { all: st(trades.filter(t => t.sc === s)), y1: st(trades.filter(t => t.sc === s && t.t < half)), y2: st(trades.filter(t => t.sc === s && t.t >= half)) };
const mo = {}; for (const t of trades) { const m = new Date(t.t).toISOString().slice(0, 7); (mo[m] = mo[m] || { A: 0, B: 0, C: 0, n: 0 }); mo[m][t.sc] += t.usd; mo[m].n++; } out.monthly = mo;
const nd = Object.keys(days).length; out.days = nd; out.trendDays = Object.values(days).filter(v => v.T).length;
out.perDay = +(trades.length / nd).toFixed(2);
console.log(JSON.stringify(out, null, 1)); console.error(DBG);
import fs from 'node:fs'; fs.writeFileSync(`/tmp/abc-${sym}${NOTREND ? '-nt' : ''}.json`, JSON.stringify(trades.map(({ k0, k1, ...t }) => ({ ...t, k0, k1 }))));
