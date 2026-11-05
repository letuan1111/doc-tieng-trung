// Engine ICT/SMC v2 (nghiên cứu): sự kiện cấu trúc → phân loại setup → các cách vào lệnh → mô phỏng kết quả
import { atr, ema, pivots, swingStruct, mapHTF, resample, sessionLevels, inKZ, MS } from './core.mjs';

export const ENTRIES = ['fvgCE', 'fvgEdge', 'ote', 'ob'];
export const SLBUF = [0.2, 0.5, 1.0];
export const TPS = ['liq', 'r2', 'part'];
const HTF_OF = { m5: 'h1', m15: 'h1', h1: 'h4' };

// FVG khung lớn (dùng làm POI): danh sách vùng {i, d, top, bot}
function fvgList(H) { const o = []; for (let m = 2; m < H.length; m++) { if (H[m].l > H[m - 2].h) o.push({ i: m, d: 1, bot: H[m - 2].h, top: H[m].l }); if (H[m].h < H[m - 2].l) o.push({ i: m, d: -1, top: H[m - 2].l, bot: H[m].h }); } return o; }

// chuẩn bị dữ liệu 1 khung vào lệnh: D = {m5, m15, h1}, tf = khung vào lệnh
export function prepare(D, tf, opt = {}) {
  const L = opt.L || 3, c = D[tf], n = c.length, A = atr(c), cl = c.map(x => x.c);
  const h4 = resample(D.h1, MS.h4), HT = HTF_OF[tf] === 'h4' ? h4 : D.h1, HS = mapHTF(c, HT, swingStruct(HT));
  // EMA34/89 đồng thuận M5+M15+H1 (quy tắc người dùng), theo nến đã đóng
  const emaDir = (x) => { const a = ema(x.map(v => v.c), 34), b = ema(x.map(v => v.c), 89); return x.map((_, i) => a[i] > b[i] ? 1 : a[i] < b[i] ? -1 : 0); };
  const E5 = mapHTF(c, D.m5, emaDir(D.m5)), E15 = mapHTF(c, D.m15, emaDir(D.m15)), E1 = mapHTF(c, D.h1, emaDir(D.h1));
  // POI khung lớn: FVG H1/H4 chưa bị lấp
  const hf = fvgList(HT), htfPOI = new Array(n).fill(0);
  { let ai = 0; const act = [];
    let jh = -1;
    for (let i = 0; i < n; i++) {
      while (jh + 1 < HT.length && HT[jh + 1].ct <= c[i].ct) { jh++; while (ai < hf.length && hf[ai].i <= jh) act.push(hf[ai++]); for (let q = act.length - 1; q >= 0; q--) { const z = act[q], x = HT[jh]; if (z.i < jh && (z.d > 0 ? x.c < z.bot : x.c > z.top)) act.splice(q, 1); } if (act.length > 40) act.splice(0, act.length - 40); }
      let f = 0; for (const z of act) if (c[i].l <= z.top && c[i].h >= z.bot) f |= z.d > 0 ? 1 : 2; htfPOI[i] = f;
    } }
  const SES = sessionLevels(c), pv = pivots(c, L);
  const ev = []; let ih = 0, il = 0; const sh = [], sl = [], bH = new Set(), bL = new Set(); let trend = 0;
  for (let k = 3; k < n; k++) {
    while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]);
    while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
    for (const d of [1, -1]) {
      const P = d > 0 ? sh[sh.length - 1] : sl[sl.length - 1]; if (!P) continue;
      const B = d > 0 ? bH : bL; if (B.has(P.i)) continue;
      if (!(d > 0 ? c[k].c > P.p : c[k].c < P.p)) continue;
      B.add(P.i);
      // gốc con sóng: cực trị giữa đỉnh/đáy bị phá và nến phá
      let oi = P.i; for (let u = P.i; u <= k; u++) if (d > 0 ? c[u].l < c[oi].l : c[u].h > c[oi].h) oi = u;
      const oP = d > 0 ? c[oi].l : c[oi].h; let ext = d > 0 ? -Infinity : Infinity; for (let u = oi; u <= k; u++) ext = d > 0 ? Math.max(ext, c[u].h) : Math.min(ext, c[u].l);
      const a = A[k]; if (!(a > 0)) continue;
      // displacement: nến thân lớn hoặc FVG trong sóng
      let disp = false; for (let u = oi + 1; u <= k; u++) { const y = c[u], rg = y.h - y.l, bd = d * (y.c - y.o); if (bd > 0 && bd >= 0.6 * rg && rg >= 1.2 * A[u - 1]) { disp = true; break; } }
      // FVG trong sóng chưa bị lấp tới nến k, chọn FVG lớn nhất
      let fvg = null; for (let m = oi + 2; m <= k; m++) {
        const bot = d > 0 ? c[m - 2].h : c[m].h, top = d > 0 ? c[m].l : c[m - 2].l; if (!(top > bot)) continue;
        let ok = true; for (let u = m + 1; u <= k; u++) if (d > 0 ? c[u].l <= bot : c[u].h >= top) { ok = false; break; }
        if (ok && (!fvg || top - bot > fvg.top - fvg.bot)) fvg = { m, top, bot };
      }
      if (fvg && fvg.top - fvg.bot >= 0.15 * a) disp = true;
      // quét thanh khoản ở gốc: đáy/đỉnh swing trước, PDH/PDL, đỉnh/đáy phiên Á
      const ses = SES[oi], piv = (d > 0 ? sl : sh).filter(q => q.conf <= oi && q.i >= oi - 80 && q.i < oi);
      const swept = (lvl) => lvl != null && (d > 0 ? c[oi].l < lvl : c[oi].h > lvl) && (() => { for (let u = oi; u <= Math.min(k, oi + 3); u++) if (d > 0 ? c[u].c > lvl : c[u].c < lvl) return true; return false; })();
      let sweep = null;
      if (swept(d > 0 ? ses.pdL : ses.pdH)) sweep = 'PDH/PDL';
      else if (swept(d > 0 ? ses.aL : ses.aH)) sweep = 'phiên Á';
      else { const ext2 = piv.length ? (d > 0 ? Math.min(...piv.map(q => q.p)) : Math.max(...piv.map(q => q.p))) : null; if (swept(ext2)) sweep = 'swing ngoài'; else if (piv.some(q => swept(q.p))) sweep = 'swing trong'; }
      const hs = HS[k], pdOf = (px) => hs && hs.hi > hs.lo ? (d > 0 ? (px - hs.lo) / (hs.hi - hs.lo) : (hs.hi - px) / (hs.hi - hs.lo)) : null;
      // mục tiêu thanh khoản đối diện: swing gần nhất vượt cực trị sóng, PDH/PDL
      const opp = (d > 0 ? sh : sl).filter(q => q.i >= k - 400 && (d > 0 ? q.p > ext : q.p < ext)).map(q => q.p);
      const sk = SES[k], pdx = d > 0 ? sk.pdH : sk.pdL; if (pdx != null && (d > 0 ? pdx > ext : pdx < ext)) opp.push(pdx);
      const liq = opp.length ? (d > 0 ? Math.min(...opp) : Math.max(...opp)) : null;
      // OB: nến ngược chiều cuối cùng quanh gốc
      let ob = null; for (let u = Math.min(k, oi + 1); u >= Math.max(0, oi - 3); u--) if (d * (c[u].c - c[u].o) < 0) { ob = d > 0 ? c[u].o : c[u].o; break; }
      const type = trend === d ? 'BOS' : 'CHoCH'; trend = d;
      ev.push({ k, d, type, oi, oP, ext, a, disp, fvg, sweep, ob, liq, htf: hs ? hs.d : 0, pdO: pdOf(oP), pdK: pdOf(c[k].c),
        kz: inKZ(c[k].t), ema: E5[k] === d && E15[k] === d && E1[k] === d, poi: !!(htfPOI[oi] & (d > 0 ? 1 : 2)) || !!(htfPOI[k] & (d > 0 ? 1 : 2)), pdOf });
    }
  }
  return { c, A, ev, tf };
}

// giá entry theo từng cách
export function entryOf(e, mode) {
  const { d, oP, ext, fvg } = e;
  if (mode === 'fvgCE') return fvg ? (fvg.top + fvg.bot) / 2 : null;
  if (mode === 'fvgEdge') return fvg ? (d > 0 ? fvg.top : fvg.bot) : null;
  if (mode === 'ote') return ext - d * 0.705 * Math.abs(ext - oP);
  if (mode === 'ob') return e.ob;
  return null;
}

// mô phỏng một lệnh limit (không nhìn trước): trả về {st, r, fill, exit}
export function simulate(c, e, entry, slBuf, tpMode, o) {
  const { d, k, oP, a } = e, expiry = o.expiry, hold = o.hold, spread = o.spread;
  if (entry == null || !(d > 0 ? entry < c[k].c && entry > oP : entry > c[k].c && entry < oP)) return null;
  const sl = oP - d * (slBuf * a + spread), risk = Math.abs(entry - sl);
  if (risk < 0.6 * a || risk > 10 * a) return null;
  let tp;
  if (tpMode === 'r2') tp = entry + d * 2 * risk;
  else { if (e.liq == null) return null; let rr = Math.abs(e.liq - entry) / risk; if (rr < 1.5) return null; rr = Math.min(rr, 5); tp = entry + d * rr * risk; }
  const rr = Math.abs(tp - entry) / risk, cost = spread / risk, part = tpMode === 'part' && rr > 1.2;
  let j = k + 1, fill = -1;
  for (; j < c.length && j <= k + expiry; j++) {
    const x = c[j];
    if (d > 0 ? x.h >= tp : x.l <= tp) return { st: 'MISSED', r: null, k, fill: -1, exit: j };
    if (d > 0 ? x.l <= entry : x.h >= entry) { fill = j; break; }
    if (d > 0 ? x.c < oP : x.c > oP) return { st: 'INVALID', r: null, k, fill: -1, exit: j };
  }
  if (fill < 0) return j >= c.length ? { st: 'OPEN', r: null, k, fill: -1, exit: c.length } : { st: 'EXPIRED', r: null, k, fill: -1, exit: j };
  let half = false;
  for (let u = fill; u < c.length; u++) {
    const x = c[u], hitSL = d > 0 ? x.l <= (half ? entry : sl) : x.h >= (half ? entry : sl), hitTP = d > 0 ? x.h >= tp : x.l <= tp;
    if (hitSL) return { st: half ? 'BE' : 'LOSS', r: (half ? 0.5 : -1) - cost, k, fill, exit: u, rr, risk };
    if (hitTP && u > fill) return { st: 'WIN', r: (half ? 0.5 + 0.5 * rr : rr) - cost, k, fill, exit: u, rr, risk };
    if (part && !half && u > fill && (d > 0 ? x.h >= entry + risk : x.l <= entry - risk)) half = true;
    if (u - fill >= hold) { const open = d * (x.c - entry) / risk; return { st: 'TIME', r: (half ? 0.5 + 0.5 * open : open) - cost, k, fill, exit: u, rr, risk }; }
  }
  return { st: 'OPEN', r: null, k, fill, exit: c.length };
}

// gắn nhãn setup cho sự kiện
export function setupOf(e) {
  if (!e.disp) return null;
  if (e.type === 'CHoCH' && e.sweep && e.sweep !== 'swing trong') return 'A';          // A: quét thanh khoản ngoài → MSS (đảo chiều)
  if (e.htf === e.d && e.type === 'CHoCH' && e.pdO != null && e.pdO <= 0.5) return 'B'; // B: hồi về discount khung lớn → CHoCH thuận xu hướng
  if (e.htf === e.d && e.type === 'BOS') return 'C';                                   // C: BOS tiếp diễn
  return null;
}
