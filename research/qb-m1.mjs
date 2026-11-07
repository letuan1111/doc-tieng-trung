// 💧 Quét biên tích lũy + xác nhận khung bé: quét SSL/BSL M1, CHoCH M1, FVG M1/M5 — 12 tháng Dukascopy (M1)
import fs from 'node:fs'; import path from 'node:path'; import { DIR, resample, ema, atr, pivots } from './core.mjs';
const SP = 0.35;
const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
const c = resample(m1, 3e5), m15 = resample(m1, 9e5), n = c.length, N1 = m1.length;
const map = (H, v) => { const o = new Array(n).fill(null); let j = -1; for (let i = 0; i < n; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) o[i] = v[j]; } return o; };
const A = map(m15, atr(m15)), E15 = map(m15, ema(m15.map(x => x.c), 34));
const i1 = new Map(m1.map((x, j) => [x.t, j])), at1 = (t) => { for (let u = 0; u < 5; u++) { const j = i1.get(t + u * 6e4); if (j != null) return j; } return null; };
const P1 = pivots(m1, 2), PH = P1.H, PL = P1.L;
const lastPiv = (arr, beforeI, confBy) => { let r = null; for (let lo = 0, hi = arr.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (arr[m].i < beforeI) { r = m; lo = m + 1; } else hi = m - 1; } while (r != null && r >= 0 && arr[r].conf > confBy) r--; return r != null && r >= 0 ? arr[r] : null; };
const START = c[0].t + 20 * 864e5, HALF = START + (c.at(-1).t - START) / 2;
function run(cfg) { const T = []; let busy = 0;
  for (let k = 30; k < n - 2; k++) { if (c[k].t < START || c[k].t < busy) continue; const a = A[k]; if (!(a > 0)) continue;
    let hi = -Infinity, lo = Infinity; for (let u = k - 24; u < k; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); } const w = hi - lo; if (!(w < 3 * a && w >= 5)) continue;
    const x = c[k]; let d = 0; if (x.l <= lo - 0.4 * a && x.c > lo) d = 1; else if (x.h >= hi + 0.4 * a && x.c < hi) d = -1; if (!d) continue;
    if (cfg.ema && d * (x.c - E15[k]) / a > 0.3) continue;
    const j0 = at1(x.t); if (j0 == null) continue; let jx = j0; for (let j = j0; j < j0 + 5 && j < N1 && m1[j].t < x.ct; j++) if (d > 0 ? m1[j].l < m1[jx].l : m1[j].h > m1[jx].h) jx = j; // nến M1 tạo râu quét
    const ext = d > 0 ? m1[jx].l : m1[jx].h;
    // quét SSL/BSL M1: râu M1 xuyên đáy/đỉnh swing M1 đã xác nhận (≤ 2h)
    const sw1 = (d > 0 ? PL : PH).filter(q => q.conf <= jx && q.i >= jx - 120 && q.i < jx && (d > 0 ? ext < q.p : ext > q.p)); const ssl = sw1.length > 0;
    if (cfg.ssl && !ssl) continue;
    // CHoCH M1: đóng cửa M1 vượt đỉnh/đáy swing M1 gần nhất trước râu quét (trong ≤ cfg.choWin phút sau râu)
    const opp = lastPiv(d > 0 ? PH : PL, jx, jx); let jc = null; if (opp) for (let j = jx + 1; j <= jx + cfg.choWin && j < N1; j++) { if (d > 0 ? m1[j].l < ext : m1[j].h > ext) break; if (d > 0 ? m1[j].c > opp.p : m1[j].c < opp.p) { jc = j; break; } }
    if (cfg.choch && jc == null) continue;
    // FVG M1 trong nhịp đảo chiều (từ râu đến CHoCH +2)
    let f1 = null; if (jc != null) for (let m = jx + 2; m <= jc + 2 && m < N1; m++) { const top = d > 0 ? m1[m].l : m1[m - 2].l, bot = d > 0 ? m1[m - 2].h : m1[m].h; if (top > bot) { f1 = { top, bot, m }; break; } }
    if (cfg.fvg1 && !f1) continue;
    // thời điểm vào: sau khi nến M5 quét đóng (x.ct) và sau CHoCH (nếu cần)
    let tIn = x.ct; if (cfg.choch) tIn = Math.max(tIn, m1[jc].ct); if (cfg.fvg1) tIn = Math.max(tIn, m1[f1.m].ct);
    let je = at1(tIn); if (je == null) continue; let entry = d > 0 ? m1[je].o + SP : m1[je].o;
    if (cfg.limitCE && f1) { // limit tại giữa FVG M1, chờ 30 phút
      const ce = (f1.top + f1.bot) / 2; let filled = null; for (let j = je; j < je + 30 && j < N1; j++) { if (d > 0 ? m1[j].l + SP <= ce : m1[j].h >= ce) { filled = j; break; } if (d > 0 ? m1[j].l <= ext : m1[j].h >= ext) break; }
      if (filled == null) continue; je = filled; entry = ce; }
    const sl = ext - d * (0.3 * a + (d < 0 ? SP : 0)), risk = d * (entry - sl); if (!(risk > 1) || risk > 15) continue;
    const tp = entry + d * cfg.rr * risk; let ex = null, et = null, st = 'TIME', be = false, slx = sl;
    for (let j = je + (cfg.limitCE ? 1 : 0); j < Math.min(N1, je + 240); j++) { const z = m1[j], l2 = d > 0 ? z.l : z.l + SP, h2 = d > 0 ? z.h : z.h + SP;
      if (d > 0 ? l2 <= slx : h2 >= slx) { st = be ? 'BE' : 'LOSS'; ex = slx; et = z.ct; break; } if (d > 0 ? h2 >= tp : l2 <= tp) { st = 'WIN'; ex = tp; et = z.ct; break; }
      if (cfg.be && !be && d * ((d > 0 ? z.h : l2) - entry) >= risk) { slx = entry + d * 0.1; be = true; } }
    if (!et) { const z = m1[Math.min(N1 - 1, je + 239)]; ex = d > 0 ? z.c : z.c + SP; et = z.ct; }
    T.push({ t: m1[je].t, pts: d * (ex - entry), risk, st, delay: (m1[je].t - x.ct) / 6e4 }); busy = et; }
  const f = (G) => { const w = G.filter(x => x.st === 'WIN').length, u = G.reduce((s, x) => s + x.pts * 2, 0); return `${G.length}L TP ${Math.round(100 * w / (G.length || 1))}% ${(u >= 0 ? '+' : '') + Math.round(u)}$`; };
  let eq = 0, pk = 0, dd = 0; for (const x of T) { eq += x.pts * 2; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  console.log(`${cfg.nm.padEnd(58)} ${f(T).padEnd(20)} DD ${String(Math.round(dd)).padStart(4)}$ · SL TB ${(T.reduce((s, x) => s + x.risk, 0) / (T.length || 1)).toFixed(1)} · vào trễ TB ${(T.reduce((s, x) => s + x.delay, 0) / (T.length || 1)).toFixed(0)} phút | nửa đầu ${f(T.filter(x => x.t < HALF))} | nửa sau ${f(T.filter(x => x.t >= HALF))}`); }
const B = { rr: 2, choWin: 15 };
for (const v of [
  { nm: 'Gốc (vào nến M5 sau) · TP 2R' },
  { nm: 'Gốc + lọc EMA34 M15', ema: 1 },
  { nm: '+ quét SSL/BSL M1', ema: 1, ssl: 1 },
  { nm: '+ CHoCH M1 ≤ 15 phút (vào khi CHoCH)', ema: 1, choch: 1 },
  { nm: '+ quét SSL/BSL M1 + CHoCH M1', ema: 1, ssl: 1, choch: 1 },
  { nm: '+ SSL M1 + CHoCH M1 + FVG M1', ema: 1, ssl: 1, choch: 1, fvg1: 1 },
  { nm: '+ SSL M1 + CHoCH M1 + FVG M1 · limit giữa FVG M1', ema: 1, ssl: 1, choch: 1, fvg1: 1, limitCE: 1 },
  { nm: '+ CHoCH M1 + FVG M1 · limit giữa FVG M1', ema: 1, choch: 1, fvg1: 1, limitCE: 1 },
  { nm: '+ SSL + CHoCH + FVG M1 · TP 2R + hoà vốn 1R', ema: 1, ssl: 1, choch: 1, fvg1: 1, be: 1 },
  { nm: '+ SSL + CHoCH + FVG M1 · TP 1.5R', ema: 1, ssl: 1, choch: 1, fvg1: 1, rr: 1.5 },
  { nm: '+ SSL + CHoCH + FVG M1 · TP 3R', ema: 1, ssl: 1, choch: 1, fvg1: 1, rr: 3 },
  { nm: '+ CHoCH M1 ≤ 30 phút', ema: 1, choch: 1, choWin: 30 },
]) run({ ...B, ...v });
