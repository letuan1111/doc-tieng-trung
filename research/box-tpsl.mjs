// Mô hình 💧 Quét biên tích lũy (râu xuyên biên vùng 2h rồi đóng lại) + các cách đặt SL/TP + lọc EMA — 12 tháng
import fs from 'node:fs'; import path from 'node:path'; import { DIR, resample, ema, atr } from './core.mjs';
const SP = 0.35, VN = 7 * 36e5;
const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
const c = resample(m1, 3e5), m15 = resample(m1, 9e5), m30 = resample(m15, 18e5), n = c.length;
const map = (H, v) => { const o = new Array(n).fill(null); let j = -1; for (let i = 0; i < n; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) o[i] = v[j]; } return o; };
const A = map(m15, atr(m15)), E30a = map(m30, ema(m30.map(x => x.c), 34)), E30b = map(m30, ema(m30.map(x => x.c), 89)), E15 = map(m15, ema(m15.map(x => x.c), 34));
const START = c[0].t + 20 * 864e5, HALF = START + (c.at(-1).t - START) / 2;
function run(cfg) { const T = []; let busy = 0;
  for (let k = 30; k < n - 1; k++) { if (c[k].t < START || c[k].t < busy) continue; const a = A[k]; if (!(a > 0)) continue;
    let hi = -Infinity, lo = Infinity; for (let u = k - 24; u < k; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); } const w = hi - lo; if (!(w < 3 * a && w >= 5)) continue;
    const x = c[k]; let d = 0; if (x.l <= lo - 0.4 * a && x.c > lo) d = 1; else if (x.h >= hi + 0.4 * a && x.c < hi) d = -1; if (!d) continue;
    if (cfg.ema30 && Math.sign(E30a[k] - E30b[k]) !== d) continue; if (cfg.side15 != null && d * (x.c - E15[k]) / a > cfg.side15) continue;
    const y = c[k + 1], entry = d > 0 ? y.o + SP : y.o, ext = d > 0 ? x.l : x.h; let sl = ext - d * (cfg.pad * a + (d < 0 ? SP : 0)); const risk = d * (entry - sl); if (!(risk > 1) || risk > 15) continue;
    const tp = entry + d * cfg.rr * risk; let st = 'TIME', ex = null, et = null, be = false, best = entry;
    for (let u = k + 1; u < Math.min(n, k + 1 + cfg.hold); u++) { const z = c[u], l2 = d > 0 ? z.l : z.l + SP, h2 = d > 0 ? z.h : z.h + SP;
      if (d > 0 ? l2 <= sl : h2 >= sl) { st = be ? 'TRAIL' : 'LOSS'; ex = sl; et = z.ct; break; }
      if (!cfg.trail && (d > 0 ? h2 >= tp : l2 <= tp)) { st = 'WIN'; ex = tp; et = z.ct; break; }
      best = d > 0 ? Math.max(best, z.h) : Math.min(best, l2);
      if (cfg.be && !be && d * (best - entry) >= cfg.be * risk) { sl = entry + d * 0.1; be = true; }
      if (cfg.trail && d * (best - entry) >= cfg.trail * risk) { const ns = best - d * cfg.td * a; if (d * (ns - sl) > 0) { sl = ns; be = true; } } }
    if (!et) { const z = c[Math.min(n - 1, k + cfg.hold)]; ex = d > 0 ? z.c : z.c + SP; et = z.ct; }
    T.push({ t: y.t, pts: d * (ex - entry), risk }); busy = et; }
  const f = (G) => { const w = G.filter(x => x.pts > 0).length, u = G.reduce((s, x) => s + x.pts * 2, 0); return `${G.length}L thắng ${Math.round(100 * w / (G.length || 1))}% ${(u >= 0 ? '+' : '') + Math.round(u)}$`; };
  let eq = 0, pk = 0, dd = 0, avgW = 0, nw = 0; for (const x of T) { eq += x.pts * 2; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); if (x.pts > 0) { avgW += x.pts; nw++; } }
  console.log(`${cfg.nm.padEnd(46)} ${f(T).padEnd(20)} DD ${String(Math.round(dd)).padStart(4)}$ · lời TB/lệnh thắng ${(avgW / (nw || 1)).toFixed(1)} giá · SL TB ${(T.reduce((s, x) => s + x.risk, 0) / (T.length || 1)).toFixed(1)} | nửa đầu ${f(T.filter(x => x.t < HALF))} | nửa sau ${f(T.filter(x => x.t >= HALF))}`); }
const B = { pad: 0.3, rr: 2, hold: 48 };
for (const v of [
  { nm: 'Gốc: SL râu + 0.3 ATR · TP 2R' }, { nm: 'SL râu + 0.6 ATR · TP 2R', pad: 0.6 }, { nm: 'TP 1.5R', rr: 1.5 }, { nm: 'TP 3R', rr: 3 },
  { nm: 'TP 2R + dời hoà vốn khi lời 1R', be: 1 }, { nm: 'Gồng: lời 1R → kéo SL cách đỉnh 1 ATR', trail: 1, td: 1, hold: 96 },
  { nm: 'Gồng: lời 1R → kéo SL cách đỉnh 1.5 ATR', trail: 1, td: 1.5, hold: 96 },
  { nm: 'TP 2R + EMA34/89 M30 cùng chiều', ema30: true }, { nm: 'TP 2R + giá chưa vượt EMA34 M15 > 0.3 ATR', side15: 0.3 },
  { nm: 'Gồng 1R/1 ATR + EMA M30 cùng chiều', ema30: true, trail: 1, td: 1, hold: 96 }, { nm: 'Gồng 1R/1 ATR + giá chưa vượt EMA34 M15', side15: 0.3, trail: 1, td: 1, hold: 96 },
]) run({ ...B, ...v });
