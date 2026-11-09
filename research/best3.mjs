// Kiểm 3 setup rút ra từ nghiên cứu ICT/breakout trên vàng 2 năm (Dukascopy M5, giờ UTC):
//  A. Asian range breakout (biên 00–06 UTC, OCO buy/sell stop, lọc độ rộng biên theo % giá, SL biên đối diện ≤ 0.6% giá, TP 2.5R, hoà vốn 1.5R, đóng 19 UTC)
//  B. Judas swing: trong giờ đầu London, râu M5 phá biên Á rồi đóng lại trong biên → vào ngược
//  C. Silver Bullet: 3 cửa sổ giờ New York (có giờ mùa hè), quét swing M5 → MSS → FVG → limit trong cửa sổ
//  + lọc killzone cho 💧 Quét biên.  Năm 1 (11/2024–11/2025) để chọn, năm 2 (11/2025–11/2026) kiểm mù.
// node research/best3.mjs [spread]
import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load, atr, pivots } from './core.mjs';
const QB = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'quetbien.js'));
const SP = +(process.argv[2] || 0.35), SYM = process.argv[3] || 'XAU2Y';
const c = load(SYM, 'm5'), m15 = load(SYM, 'm15'), n = c.length;
const Y1 = SYM === 'XAU2Y' ? Date.parse('2024-11-15') : c[0].t + 20 * 864e5, Y2 = Date.parse('2025-11-06'), Y3 = c.at(-1).ct;
const A = (() => { const a = atr(m15), o = new Array(n); let j = -1; for (let i = 0; i < n; i++) { while (j + 1 < m15.length && m15[j + 1].ct <= c[i].ct) j++; o[i] = a[Math.max(0, j)]; } return o; })();
const pv = pivots(c, 2);
const dayOf = (t) => Math.floor(t / 864e5), hU = (t) => new Date(t).getUTCHours(), mU = (t) => new Date(t).getUTCMinutes();
// giờ New York (có DST: Chủ nhật thứ 2 tháng 3 → Chủ nhật đầu tháng 11, 7h UTC)
const nthSun = (y, m, k) => { const d = new Date(Date.UTC(y, m, 1)); const off = (7 - d.getUTCDay()) % 7; return Date.UTC(y, m, 1 + off + 7 * (k - 1), 7); };
const nyOff = (t) => { const y = new Date(t).getUTCFullYear(); return t >= nthSun(y, 2, 2) && t < nthSun(y, 10, 1) ? -4 : -5; };
const nyH = (t) => (new Date(t + nyOff(t) * 36e5).getUTCHours());
// ---------- mô phỏng một lệnh trên M5 từ nến j (đã vào ở giá entry tại nến j hoặc chờ khớp)
function manage(s, j, cfg) { // s: {d, entry, sl, tp}; vào tại nến j (đã khớp trong nến j)
  const d = s.d; let sl = s.sl, be = false; const risk = Math.abs(s.entry - s.sl);
  // nến khớp: chỉ xét SL (bảo thủ)
  { const z = c[j]; if (d > 0 ? z.l <= sl : z.h + SP >= sl) return { ...s, st: 'LOSS', exit: sl, et: z.ct, risk }; }
  for (let u = j + 1; u < n; u++) { const z = c[u], lo = d > 0 ? z.l : z.l + SP, hi = d > 0 ? z.h : z.h + SP;
    if (cfg.exitAt && z.t >= cfg.exitAt) { const p = d > 0 ? z.o : z.o + SP; return { ...s, st: 'TIME', exit: p, et: z.t, risk }; }
    if (d > 0 ? lo <= sl : hi >= sl) return { ...s, st: be ? 'BE' : 'LOSS', exit: sl, et: z.ct, risk };
    if (d > 0 ? hi >= s.tp : lo <= s.tp) return { ...s, st: 'WIN', exit: s.tp, et: z.ct, risk };
    if (cfg.be && !be && (d > 0 ? z.h - s.entry : s.entry - lo) >= cfg.be * risk) { sl = s.entry + d * 0.1; be = true; }
    if (u - j > (cfg.maxBars || 288)) { const p = d > 0 ? z.c : z.c + SP; return { ...s, st: 'TIME', exit: p, et: z.ct, risk }; } }
  return null;
}
const idxAt = (t) => { let lo = 0, hi = n - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
// biên phiên Á mỗi ngày (00:00–06:00 UTC)
const ASIA = new Map(); for (let i = 0; i < n; i++) { const x = c[i]; if (hU(x.t) >= 6) continue; const k = dayOf(x.t); const v = ASIA.get(k); if (!v) ASIA.set(k, { h: x.h, l: x.l, n: 1, last: i }); else { v.h = Math.max(v.h, x.h); v.l = Math.min(v.l, x.l); v.n++; v.last = i; } }
// ---------- A. Asian range breakout
function asianBO(cfg) { const T = [];
  for (const [k, r] of ASIA) { if (r.n < 60) continue; const t6 = k * 864e5 + 6 * 36e5; const j0 = idxAt(t6); if (c[j0].t < t6) continue; const mid = (r.h + r.l) / 2, w = r.h - r.l, pct = 100 * w / mid;
    if (pct < cfg.minPct || pct > cfg.maxPct) continue; const buf = cfg.buf * A[j0];
    const lvB = r.h + buf, lvS = r.l - buf, endT = k * 864e5 + cfg.lastEntryH * 36e5, exitAt = k * 864e5 + cfg.exitH * 36e5;
    for (let j = j0; j < n && c[j].t < endT; j++) { const z = c[j]; const upHit = z.h + SP >= lvB, dnHit = z.l <= lvS; if (!upHit && !dnHit) continue; if (upHit && dnHit) break; // nến chạm cả 2: bỏ
      const d = upHit ? 1 : -1, entry = d > 0 ? lvB : lvS, slRaw = d > 0 ? r.l - buf : r.h + buf, cap = cfg.capPct / 100 * entry, sl = d * (entry - slRaw) > cap ? entry - d * cap : slRaw;
      const risk = Math.abs(entry - sl), tp = entry + d * cfg.rr * risk; const res = manage({ d, entry, sl, tp, t: z.t, name: 'A' }, j, { exitAt, be: cfg.be }); if (res) T.push(res); break; } }
  return T; }
// ---------- B. Judas swing: râu phá biên Á ≥ x ATR trong giờ London đầu (06–10 UTC), đóng lại trong biên → vào ngược
function judas(cfg) { const T = [];
  for (const [k, r] of ASIA) { if (r.n < 60) continue; const t6 = k * 864e5 + cfg.fromH * 36e5, endT = k * 864e5 + cfg.toH * 36e5; const w = r.h - r.l, pct = 100 * w / ((r.h + r.l) / 2); if (pct < cfg.minPct || pct > cfg.maxPct) continue;
    let hiX = r.h, loX = r.l; for (let j = idxAt(t6); j < n && c[j].t < endT; j++) { const z = c[j], a = A[j]; if (c[j].t < t6) continue; hiX = Math.max(hiX, z.h); loX = Math.min(loX, z.l);
      let d = 0; if (hiX >= r.h + cfg.pierce * a && z.c < r.h) d = -1; else if (loX <= r.l - cfg.pierce * a && z.c > r.l) d = 1; if (!d) continue;
      const entry = d > 0 ? z.c + SP : z.c, ext = d > 0 ? loX : hiX, sl = ext - d * (cfg.pad * a + (d < 0 ? SP : 0)), risk = d * (entry - sl); if (!(risk > 1) || risk > cfg.maxSL * a) break;
      const tp = cfg.tp === 'range' ? (d > 0 ? r.h : r.l) : entry + d * cfg.rr * risk; if (d * (tp - entry) < 0.8 * risk) break;
      const res = manage({ d, entry, sl, tp, t: z.ct, name: 'B' }, Math.min(n - 1, j + 1) - 0, { exitAt: k * 864e5 + cfg.exitH * 36e5, be: cfg.be }); if (res) T.push(res); break; } }
  return T; }
// ---------- C. Silver Bullet: trong cửa sổ NY: quét swing M5 (đã xác nhận, ≤ 3h) → MSS → FVG trong cửa sổ → limit (mép/CE) đến hết cửa sổ + 15′
function silver(cfg) { const T = []; let busy = 0;
  for (let k = 50; k < n - 2; k++) { const x = c[k]; if (x.t < busy) continue; const h = nyH(x.t); if (!cfg.wins.includes(h)) continue; const a = A[k];
    const winEnd = x.t - (mU(x.t) * 6e4) + 36e5 + 15 * 6e4;
    for (const d of [1, -1]) { // d = hướng lệnh; quét đáy (SSL) cho BUY
      const sw = (d > 0 ? pv.L : pv.H).filter(q => q.conf <= k - 1 && q.i >= k - 36 && (d > 0 ? x.l < q.p : x.h > q.p)); if (!sw.length) continue;
      const opp = (d > 0 ? pv.H : pv.L).filter(q => q.conf <= k && q.i < k).slice(-1)[0]; if (!opp) continue;
      let ext = d > 0 ? x.l : x.h, m = null; for (let u = k + 1; u < n && c[u].t < winEnd - 15 * 6e4 && u <= k + 10; u++) { const y = c[u]; ext = d > 0 ? Math.min(ext, y.l) : Math.max(ext, y.h); if (d > 0 ? y.c > opp.p : y.c < opp.p) { m = u; break; } }
      if (m == null) continue; let f = null; for (let u = k + 2; u <= m + 1 && u < n; u++) { const top = d > 0 ? c[u].l : c[u - 2].l, bot = d > 0 ? c[u - 2].h : c[u].h; if (top - bot >= 0.1 * a) f = { top, bot, u }; } if (!f) continue;
      const place = Math.max(m, f.u), entry = cfg.entry === 'ce' ? (f.top + f.bot) / 2 : (d > 0 ? f.top : f.bot), sl = ext - d * (cfg.pad * a + (d < 0 ? SP : 0)), risk = d * (entry - sl); if (!(risk > 1) || risk > cfg.maxSL * a) continue;
      let tp = entry + d * cfg.rr * risk; if (cfg.tp === 'liq') { const L = (d > 0 ? pv.H : pv.L).filter(q => q.conf <= place && q.i >= k - 72 && d * (q.p - entry) >= cfg.rr * risk).map(q => q.p).sort((p, q) => d * (p - q)); if (!L.length) continue; tp = L[0]; }
      let fill = null; for (let u = place + 1; u < n && c[u].t < winEnd; u++) { const z = c[u]; if (d > 0 ? z.h >= tp : z.l + SP <= tp) break; if (d > 0 ? z.l + SP <= entry : z.h >= entry) { fill = u; break; } }
      if (fill == null) { busy = c[Math.min(n - 1, place + 1)].t; continue; }
      const res = manage({ d, entry, sl, tp, t: c[fill].t, name: 'C' }, fill, { be: cfg.be, maxBars: 96 }); if (res) { T.push(res); busy = res.et; } break; } }
  return T; }
// ---------- báo cáo
const rows = [];
function rep(nm, T) { const f = (G) => { const w = G.filter(x => x.st === 'WIN').length, u = G.reduce((s, x) => s + (x.d * (x.exit - x.entry)) * 2, 0), pos = G.filter(x => x.d * (x.exit - x.entry) > 0).length; return { n: G.length, w: G.length ? 100 * w / G.length : 0, pos: G.length ? 100 * pos / G.length : 0, u }; };
  const y1 = f(T.filter(x => x.t >= Y1 && x.t < Y2)), y2 = f(T.filter(x => x.t >= Y2 && x.t < Y3)); rows.push({ nm, y1, y2 });
  const g = (z) => `${String(z.n).padStart(3)}L TP ${z.w.toFixed(0).padStart(2)}% lời ${z.pos.toFixed(0).padStart(2)}% ${(z.u >= 0 ? '+' : '') + Math.round(z.u)}$`.padEnd(30);
  console.log(nm.padEnd(60), '| năm 1:', g(y1), '| năm 2 (mù):', g(y2)); }
console.log(`Vàng Dukascopy M5 · spread ${SP} · 0.02 lot · năm 1 = ${new Date(Y1).toISOString().slice(0, 10)}→${new Date(Y2).toISOString().slice(0, 10)} · năm 2 = →${new Date(Y3).toISOString().slice(0, 10)}`);
console.log('--- A. Asian range breakout');
const AB = { minPct: 0.3, maxPct: 1.6, buf: 0.1, capPct: 0.6, rr: 2.5, be: 1.5, lastEntryH: 15, exitH: 19 };
rep('A0 đúng bài nghiên cứu (0.3–1.6%, TP 2.5R, BE 1.5R)', asianBO(AB));
rep('A1 không dời hoà vốn', asianBO({ ...AB, be: 0 }));
rep('A2 TP 2R', asianBO({ ...AB, rr: 2 }));
rep('A3 TP 1.5R', asianBO({ ...AB, rr: 1.5 }));
rep('A4 biên 0.2–1.2%', asianBO({ ...AB, minPct: 0.2, maxPct: 1.2 }));
rep('A5 chỉ vào đến 10h UTC (17h VN)', asianBO({ ...AB, lastEntryH: 10 }));
rep('A6 SL tối đa 0.4% giá', asianBO({ ...AB, capPct: 0.4 }));
if (process.argv[4] === 'A') process.exit(0);
console.log('--- B. Judas swing (phá giả biên Á đầu London → vào ngược)');
const JB = { fromH: 6, toH: 10, minPct: 0.2, maxPct: 1.6, pierce: 0.3, pad: 0.3, maxSL: 4, rr: 2, tp: 'rr', be: 0, exitH: 19 };
rep('B0 06–10 UTC · xuyên 0.3 ATR · TP 2R', judas(JB));
rep('B1 TP = biên đối diện', judas({ ...JB, tp: 'range' }));
rep('B2 xuyên 0.5 ATR', judas({ ...JB, pierce: 0.5 }));
rep('B3 06–13 UTC (tới hết London)', judas({ ...JB, toH: 13 }));
rep('B4 TP 2R + hoà vốn 1R', judas({ ...JB, be: 1 }));
console.log('--- C. Silver Bullet (giờ NY 3–4, 10–11, 14–15)');
const SB = { wins: [3, 10, 14], pad: 0.1, maxSL: 4, rr: 2, tp: 'rr', entry: 'edge', be: 0 };
rep('C0 cả 3 cửa sổ · limit mép FVG · TP 2R', silver(SB));
rep('C1 TP thanh khoản ≥ 2R', silver({ ...SB, tp: 'liq' }));
rep('C2 limit giữa FVG', silver({ ...SB, entry: 'ce' }));
rep('C3 chỉ 10–11h NY', silver({ ...SB, wins: [10] }));
rep('C4 chỉ 3–4h NY (London)', silver({ ...SB, wins: [3] }));
rep('C5 SL + 0.5 ATR', silver({ ...SB, pad: 0.5 }));
console.log('--- 💧 Quét biên + lọc killzone (London 7–10 UTC, NY 12–15 UTC)');
const Q = QB.run({ m5: c, m15 }, { spread: SP }).filter(s => QB.FINAL[s.state]).map(s => ({ d: s.side, entry: s.entry, exit: s.exitP, t: s.ct, st: s.state }));
rep('Quét biên gốc', Q);
const kz = (t) => { const h = hU(t); return (h >= 7 && h < 10) || (h >= 12 && h < 15); };
rep('Quét biên chỉ trong killzone', Q.filter(x => kz(x.t)));
rep('Quét biên ngoài killzone', Q.filter(x => !kz(x.t)));
