// Công cụ nghiên cứu ICT/SMC: dữ liệu, chỉ báo, cấu trúc, cấu trúc khung lớn (không nhìn trước tương lai)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const DIR = path.dirname(fileURLToPath(import.meta.url));
export const MS = { m5: 3e5, m15: 9e5, h1: 36e5, h4: 144e5 };

export function load(sym, tf) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, 'data', `${sym}_${tf}.json`), 'utf8'));
  return raw.map(k => ({ t: k[0], ct: k[0] + MS[tf], o: k[1], h: k[2], l: k[3], c: k[4] }));
}
export function resample(c, ms) {
  const out = []; let cur = null;
  for (const x of c) {
    const s = Math.floor(x.t / ms) * ms;
    if (!cur || cur.t !== s) { if (cur) out.push(cur); cur = { t: s, ct: s + ms, o: x.o, h: x.h, l: x.l, c: x.c, last: x.ct }; }
    else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.ct; }
  }
  if (cur && cur.last >= cur.ct) out.push(cur);
  return out;
}
export function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
export function atr(c, p = 14) {
  const o = new Array(c.length); let a = c[0].h - c[0].l;
  for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; }
  return o;
}
// đỉnh/đáy swing xác nhận sau L nến
export function pivots(c, L) {
  const H = [], Lw = [];
  for (let i = L; i < c.length - L; i++) {
    let ph = true, pl = true;
    for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; }
    if (ph) H.push({ i, p: c[i].h, conf: i + L });
    if (pl) Lw.push({ i, p: c[i].l, conf: i + L });
  }
  return { H, L: Lw };
}
// cấu trúc swing (strong low/high) + dealing range, mỗi nến: {d, lo, hi} (lo/hi = biên dealing range hiện tại)
export function swingStruct(c, L = 3) {
  const pv = pivots(c, L), S = new Array(c.length);
  let ih = 0, il = 0, sh = [], sl = [], d = 0, sL = null, sLi = 0, sH = null, sHi = 0, top = -Infinity, bot = Infinity;
  const bH = new Set(), bL = new Set();
  for (let k = 0; k < c.length; k++) {
    while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]);
    while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
    const x = c[k], ph = sh[sh.length - 1], pl = sl[sl.length - 1];
    const upFrom = (from) => { let lo = Infinity, li = from; for (let u = from; u <= k; u++) if (c[u].l < lo) { lo = c[u].l; li = u; } d = 1; sL = lo; sLi = li; top = -Infinity; for (let u = li; u <= k; u++) top = Math.max(top, c[u].h); };
    const dnFrom = (from) => { let hi = -Infinity, hj = from; for (let u = from; u <= k; u++) if (c[u].h > hi) { hi = c[u].h; hj = u; } d = -1; sH = hi; sHi = hj; bot = Infinity; for (let u = hj; u <= k; u++) bot = Math.min(bot, c[u].l); };
    if (ph && !bH.has(ph.i) && x.c > ph.p && d !== -1) { bH.add(ph.i); upFrom(ph.i); }
    if (pl && !bL.has(pl.i) && x.c < pl.p && d !== 1) { bL.add(pl.i); dnFrom(pl.i); }
    if (d === 1 && x.c < sL) { dnFrom(sLi); for (const p of sl) bL.add(p.i); }
    else if (d === -1 && x.c > sH) { upFrom(sHi); for (const p of sh) bH.add(p.i); }
    if (d === 1) top = Math.max(top, x.h); else if (d === -1) bot = Math.min(bot, x.l);
    S[k] = d === 1 ? { d, lo: sL, hi: top } : d === -1 ? { d, lo: bot, hi: sH } : { d: 0, lo: null, hi: null };
  }
  return S;
}
// ánh xạ giá trị khung lớn (đã đóng) sang từng nến khung nhỏ
export function mapHTF(c, H, vals) {
  const out = new Array(c.length).fill(null); let j = -1;
  for (let i = 0; i < c.length; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) out[i] = vals[j]; }
  return out;
}
// đỉnh/đáy ngày trước (UTC) và phiên Á (00–06 UTC) của ngày hiện tại, tính tới nến i (không nhìn trước)
export function sessionLevels(c) {
  const out = new Array(c.length); let day = null, dH = -Infinity, dL = Infinity, pdH = null, pdL = null, aH = -Infinity, aL = Infinity;
  for (let i = 0; i < c.length; i++) {
    const x = c[i], dt = new Date(x.t), dk = Math.floor(x.t / 864e5), hr = dt.getUTCHours();
    if (dk !== day) { if (day !== null) { pdH = dH; pdL = dL; } day = dk; dH = -Infinity; dL = Infinity; aH = -Infinity; aL = Infinity; }
    out[i] = { pdH, pdL, aH: hr >= 6 && aH > -Infinity ? aH : null, aL: hr >= 6 && aL < Infinity ? aL : null, hr };
    dH = Math.max(dH, x.h); dL = Math.min(dL, x.l); if (hr < 6) { aH = Math.max(aH, x.h); aL = Math.min(aL, x.l); }
  }
  return out;
}
export const inKZ = (t) => { const h = new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60; return (h >= 6.5 && h < 10) || (h >= 12 && h < 16); };
