// Ghi BỐI CẢNH GIÁ lúc mỗi setup V3 xuất hiện (M15 / M30 / H1), rồi xem bối cảnh nào hay thắng.
// Setup = quét PDH/PDL → MSS có displacement → FVG (mọi chiều, mọi giờ). Không nhìn trước: mọi chỉ số tính tới nến k.
// node research/ctx.mjs [rows|stats]   (SPLIT: 6 tháng gần đây = học, 6 tháng trước + ETH = kiểm tra)
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load, resample, ema, mapHTF, MS } from './core.mjs';
const V3 = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'v3.js'));
export const SPLIT = Date.UTC(2026, 4, 5), SPREAD = { XAU: 0.35, BTC: 18, ETH: 1.2 };
export const TFS = ['m15', 'm30', 'h1'];
const BASE = { m15: { expiry: 12, hold: 96 }, m30: { expiry: 10, hold: 72 }, h1: { expiry: 8, hold: 72 } };
export const VARS = { 'CE·SL0.5': { entry: 'ce', slATR: 0.5 }, 'CE·SL1': { entry: 'ce', slATR: 1.0 }, 'mép·SL0.5': { entry: 'edge', slATR: 0.5 }, 'mép·SL1': { entry: 'edge', slATR: 1.0 } };
const emaDir = (c) => { const a = ema(c.map(x => x.c), 34), b = ema(c.map(x => x.c), 89); return c.map((_, i) => a[i] > b[i] ? 1 : -1); };
const hourVN = (t) => (new Date(t).getUTCHours() + 7) % 24;
export const sess = (h) => h >= 7 && h < 13 ? 'Á (7–13h)' : h >= 13 && h < 19 ? 'London (13–19h)' : h >= 19 ? 'New York (19–24h)' : 'đêm (0–7h)';

export function collect(sym) {
  const m15 = load(sym, 'm15'), h1 = load(sym, 'h1'), D = { m15, m30: resample(m15, 18e5), h1 }, h4 = resample(h1, MS.h4), day = resample(h1, 864e5);
  const out = [];
  for (const tf of TFS) {
    const c = D[tf], eTF = emaDir(c), eH1 = mapHTF(c, h1, emaDir(h1)), eH4 = mapHTF(c, h4, emaDir(h4));
    const e89 = ema(c.map(x => x.c), 89);
    // biên độ ngày trung bình 14 ngày (ADR) của các ngày đã đóng
    const adr = day.map((_, i) => { if (i < 14) return null; let s = 0; for (let u = i - 14; u < i; u++) s += day[u].h - day[u].l; return s / 14; });
    const dIdx = c.map(x => { const t = Math.floor(x.t / 864e5) * 864e5; let lo = 0, hi = day.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (day[m].t <= t) lo = m; else hi = m - 1; } return day[lo] && day[lo].t === t ? lo : -1; });
    V3.CFG[tf] = { entry: 'ce', slATR: 0.5, ...BASE[tf], window: false, sides: [1, -1] };
    for (const e of V3.setups(c, tf)) {
      const k = e.k, d = e.d, x = c[k], di = dIdx[k];
      let dh = -Infinity, dl = Infinity; for (let u = k; u >= 0 && Math.floor(c[u].t / 864e5) === Math.floor(x.t / 864e5); u--) { dh = Math.max(dh, c[u].h); dl = Math.min(dl, c[u].l); }
      const A = di >= 0 ? adr[di] : null;
      const d5 = di >= 5 ? Math.sign(x.c - day[di - 5].c) : 0;
      const ctx = {
        hour: hourVN(x.t), sweepHour: hourVN(c[e.oi].t), sess: sess(hourVN(x.t)), wd: new Date(x.t + 7 * 36e5).getUTCDay(),
        emaTF: eTF[k] === d, emaH1: eH1[k] === d, emaH4: eH4[k] === d, trend5d: d5 === d ? 'cùng' : d5 === 0 ? '—' : 'ngược',
        depth: Math.abs(e.oP - e.lvl) / e.a, legBars: k - e.oi, fvgATR: (e.fvg.top - e.fvg.bot) / e.a,
        dayUsed: A ? (dh - dl) / A : null, ext89: d * (x.c - e89[k]) / e.a, moveATR: Math.abs(e.ext - e.oP) / e.a,
      };
      const res = {};
      for (const [vn, v] of Object.entries(VARS)) { V3.CFG[tf] = { ...V3.CFG[tf], ...v }; res[vn] = V3.simulate(c, e, SPREAD[sym]); }
      V3.CFG[tf] = { ...V3.CFG[tf], entry: 'ce', slATR: 0.5 };
      out.push({ sym, tf, t: x.t, ct: x.ct, d, sweep: d > 0 ? 'PDL' : 'PDH', price: x.c, lvl: e.lvl, oP: e.oP, a: e.a, ...ctx,
        res: Object.fromEntries(Object.entries(res).map(([k2, s]) => [k2, s ? { st: s.state, r: s.r, entry: s.entry, sl: s.sl, tp: s.tp, fillT: s.fillT, exitT: s.exitT } : null])) });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ALL = []; for (const sym of ['XAU', 'BTC', 'ETH']) ALL.push(...collect(sym));
  fs.writeFileSync(path.join(DIR, 'data', 'ctx.json'), JSON.stringify(ALL));
  console.log('đã ghi', ALL.length, 'setup');
}
