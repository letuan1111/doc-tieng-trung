// Có nên xuống M1 để bắt sóng ≥ 15 giá? (1) tín hiệu M1 đến lúc nào trong sóng (30 ngày tua), (2) đánh thật 12 tháng theo M1
// Tín hiệu M1: CHoCH/MSS M1 = nến M1 đóng cửa vượt đỉnh/đáy swing M1 gần nhất (2 nến mỗi bên) NGƯỢC hướng trước đó, EMA34/89 M1 cùng chiều (hoặc vừa cắt)
import fs from 'node:fs'; import path from 'node:path'; import { DIR, ema, atr, pivots, resample } from './core.mjs';
const SP = 0.35, VN = 7 * 36e5;
const c = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
const n = c.length, cl = c.map(x => x.c), E34 = ema(cl, 34), E89 = ema(cl, 89), A1 = atr(c, 14);
const m15 = resample(c, 9e5), A15 = (() => { const A = atr(m15), o = new Array(n); let j = -1; for (let i = 0; i < n; i++) { while (j + 1 < m15.length && m15[j + 1].ct <= c[i].ct) j++; o[i] = A[Math.max(0, j)]; } return o; })();
const m30 = resample(m15, 18e5), e34_30 = ema(m30.map(x => x.c), 34), e89_30 = ema(m30.map(x => x.c), 89);
const T30 = (() => { const o = new Array(n); let j = -1; for (let i = 0; i < n; i++) { while (j + 1 < m30.length && m30[j + 1].ct <= c[i].ct) j++; o[i] = j >= 0 ? Math.sign(e34_30[j] - e89_30[j]) : 0; } return o; })();
const pv = pivots(c, 2);
// chuỗi tín hiệu M1 (không nhìn trước): theo dõi cấu trúc M1, ghi CHoCH (đổi hướng) và BOS
const SIG = []; { let ih = 0, il = 0, lastH = null, lastL = null, trend = 0;
  for (let k = 0; k < n; k++) { while (ih < pv.H.length && pv.H[ih].conf <= k) lastH = { ...pv.H[ih++], used: false }; while (il < pv.L.length && pv.L[il].conf <= k) lastL = { ...pv.L[il++], used: false };
    const x = c[k];
    if (lastH && !lastH.used && x.c > lastH.p) { lastH.used = true; SIG.push({ k, d: 1, type: trend < 0 ? 'CHoCH' : 'BOS', lvl: lastH.p, sw: lastL ? lastL.p : x.l }); trend = 1; }
    if (lastL && !lastL.used && x.c < lastL.p) { lastL.used = true; SIG.push({ k, d: -1, type: trend > 0 ? 'CHoCH' : 'BOS', lvl: lastL.p, sw: lastH ? lastH.p : x.h }); trend = -1; } } }
const emaOK = (k, d) => d > 0 ? E34[k] > E89[k] : E34[k] < E89[k];
console.log(`M1: ${n} nến · ${SIG.length} lần phá cấu trúc M1 (${(SIG.length / 365).toFixed(0)}/ngày), CHoCH ${SIG.filter(s => s.type === 'CHoCH').length} · CHoCH cùng EMA34/89 M1: ${SIG.filter(s => s.type === 'CHoCH' && emaOK(s.k, s.d)).length} (${(SIG.filter(s => s.type === 'CHoCH' && emaOK(s.k, s.d)).length / 365).toFixed(0)}/ngày)`);
// ---- (1) với các sóng 30 ngày trong trang tua
const D = JSON.parse(fs.readFileSync('/home/claude/replay/data.json'));
const idxAt = (t) => { let lo = 0, hi = n - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
let got = 0, sumRun = 0, sumLeft = 0, sumSL = 0, worthy = 0, early = 0; const missed = D.waves.filter(w => !w.caught.length);
for (const w of missed) { const k0 = idxAt(w.t0), k1 = idxAt(w.t1);
  const s = SIG.find(s => s.k > k0 && s.k <= k1 && s.d === w.d && s.type === 'CHoCH' && emaOK(s.k, s.d)) || SIG.find(s => s.k > k0 && s.k <= k1 && s.d === w.d && emaOK(s.k, s.d));
  if (!s) continue; got++;
  const run = Math.abs(c[s.k].c - w.p0), left = Math.abs(w.p1 - c[s.k].c), sl = Math.abs(c[s.k].c - w.p0) + 0.3 * A15[s.k] + SP;
  sumRun += run / w.size; sumLeft += left; sumSL += sl; if (left >= 2 * sl) worthy++; if (run / w.size < 0.33) early++; }
console.log(`\n(1) ${missed.length} sóng ≥15 giá bot bỏ lỡ (30 ngày): có tín hiệu M1 cùng chiều trong sóng ${got} (${Math.round(100 * got / missed.length)}%)`);
console.log(`    lúc tín hiệu M1: sóng đã chạy TB ${Math.round(100 * sumRun / got)}% · còn lại TB ${(sumLeft / got).toFixed(1)} giá · SL cần (ngoài đáy/đỉnh sóng) TB ${(sumSL / got).toFixed(1)} giá`);
console.log(`    tín hiệu đến sớm (< 1/3 sóng): ${early} · phần còn lại ≥ 2R (đáng vào): ${worthy} (${Math.round(100 * worthy / missed.length)}% số sóng bỏ lỡ)`);
// ---- (2) đánh thật 12 tháng: vào ở nến M1 sau tín hiệu, SL ngoài swing đối diện + 0.3 ATR M1 + spread, TP 2R, giữ ≤ 4h, mỗi lúc 1 lệnh
function trade(filter, rr = 2) { const out = []; let busy = 0;
  for (const s of SIG) { if (s.k + 1 >= n || c[s.k].t < busy || !filter(s)) continue; const d = s.d, y = c[s.k + 1], entry = d > 0 ? y.o + SP : y.o;
    const sl = s.sw - d * (0.3 * A1[s.k] + (d < 0 ? SP : 0)), risk = d * (entry - sl); if (!(risk > 0.5) || risk > 15) continue; const tp = entry + d * rr * risk;
    let st = 'TIME', ex = null, et = null; for (let u = s.k + 1; u < Math.min(n, s.k + 241); u++) { const z = c[u], lo = d > 0 ? z.l : z.l + SP, hi = d > 0 ? z.h : z.h + SP;
      if (d > 0 ? lo <= sl : hi >= sl) { st = 'LOSS'; ex = sl; et = z.ct; break; } if (d > 0 ? hi >= tp : lo <= tp) { st = 'WIN'; ex = tp; et = z.ct; break; } }
    if (!et) { const z = c[Math.min(n - 1, s.k + 240)]; ex = d > 0 ? z.c : z.c + SP; et = z.ct; }
    out.push({ t: y.t, d, st, pts: d * (ex - entry), risk }); busy = et; }
  return out; }
const HALF = c[0].t + (c.at(-1).t - c[0].t) / 2;
const rep = (nm, L) => { const f = (G) => { const w = G.filter(x => x.st === 'WIN').length, u = G.reduce((a, x) => a + x.pts * 2, 0); return `${G.length}L ${Math.round(100 * w / (G.length || 1))}% ${(u >= 0 ? '+' : '') + Math.round(u)}$`; };
  const sl = L.reduce((a, x) => a + x.risk, 0) / (L.length || 1); console.log(nm.padEnd(52), f(L).padEnd(18), `SL TB ${sl.toFixed(1)} giá (spread = ${Math.round(100 * SP / sl)}% SL) · ${(L.length / 365).toFixed(1)} lệnh/ngày | nửa đầu ${f(L.filter(x => x.t < HALF))} | nửa sau ${f(L.filter(x => x.t >= HALF))}`); };
console.log('\n(2) Đánh thật 12 tháng theo tín hiệu M1 (TP 2R, 0.02 lot, spread 0.35):');
rep('CHoCH M1 + EMA34/89 M1 cùng chiều', trade(s => s.type === 'CHoCH' && emaOK(s.k, s.d)));
rep('CHoCH M1 + EMA M1 + cùng xu hướng EMA M30', trade(s => s.type === 'CHoCH' && emaOK(s.k, s.d) && T30[s.k] === s.d));
rep('CHoCH M1 + EMA M1 + NGƯỢC xu hướng EMA M30', trade(s => s.type === 'CHoCH' && emaOK(s.k, s.d) && T30[s.k] === -s.d));
rep('BOS M1 + EMA M1 + cùng EMA M30 (đi tiếp)', trade(s => s.type === 'BOS' && emaOK(s.k, s.d) && T30[s.k] === s.d));
rep('CHoCH M1 + EMA M1 + SL ≥ 3 giá', trade(s => { if (!(s.type === 'CHoCH' && emaOK(s.k, s.d))) return false; return Math.abs(c[s.k].c - s.sw) >= 3; }));
rep('CHoCH M1 + EMA M1 + cùng M30 + TP 3R', trade(s => s.type === 'CHoCH' && emaOK(s.k, s.d) && T30[s.k] === s.d, 3));
