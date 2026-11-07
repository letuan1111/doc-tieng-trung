// (1) Thông số EMA34/89 (M5/M15/M30) ngay trước sóng ≥ 15 giá so với lúc bình thường · (2) nến M5 trước sóng làm gì
// (3) Đặt SL/TP thế nào để bắt được nhiều sóng nhất: điểm vào = nến M5 quét đỉnh/đáy swing M5 rồi đóng lại (tín hiệu sớm nhất, không nhìn trước)
import fs from 'node:fs'; import path from 'node:path'; import { DIR, resample, ema, atr, pivots } from './core.mjs';
const SP = 0.35, VN = 7 * 36e5;
const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
const c = resample(m1, 3e5), m15 = resample(m1, 9e5), m30 = resample(m15, 18e5), n = c.length;
const map = (H, v) => { const o = new Array(n).fill(null); let j = -1; for (let i = 0; i < n; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) o[i] = v[j]; } return o; };
const E = { M5: [ema(c.map(x => x.c), 34), ema(c.map(x => x.c), 89)], M15: [map(m15, ema(m15.map(x => x.c), 34)), map(m15, ema(m15.map(x => x.c), 89))], M30: [map(m30, ema(m30.map(x => x.c), 34)), map(m30, ema(m30.map(x => x.c), 89))] };
const A = map(m15, atr(m15)), pv = pivots(c, 2), START = c[0].t + 20 * 864e5, HALF = START + (c.at(-1).t - START) / 2;
const idxAt = (t) => { let lo = 0, hi = n - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
// zigzag 15 giá
const W = []; { let dir = 0, ext = c[0], start = null, sp = c[0].l;
  for (const x of c) { if (dir >= 0 && x.h > (ext.hp ?? ext.h)) ext = { ...x, hp: x.h }; if (dir <= 0 && x.l < (ext.lp ?? ext.l)) ext = { ...x, lp: x.l };
    if (dir === 0) { if (x.h - sp >= 15) { dir = 1; ext = { ...x, hp: x.h }; start = { t: c[0].t, p: sp }; } continue; }
    if (dir > 0 && ext.hp - x.l >= 15) { W.push({ d: 1, t0: start.t, p0: start.p, t1: ext.t, p1: ext.hp }); start = { t: ext.t, p: ext.hp }; dir = -1; ext = { ...x, lp: x.l }; }
    else if (dir < 0 && x.h - ext.lp >= 15) { W.push({ d: -1, t0: start.t, p0: start.p, t1: ext.t, p1: ext.lp }); start = { t: ext.t, p: ext.lp }; dir = 1; ext = { ...x, hp: x.h }; } } }
const WS = W.filter(w => w.t0 >= START && Math.abs(w.p1 - w.p0) >= 15);
const med = (v) => { v = v.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
const q = (v, p) => { v = v.filter(Number.isFinite).sort((a, b) => a - b); return v[Math.floor(p * (v.length - 1))]; };
// thông số EMA tại nến k theo chiều d: dist = (giá − EMA34)·d / ATR (âm = giá ở phía ngược chiều sóng), gap = (EMA34−EMA89)·d / ATR, slope = (EMA34[k] − EMA34[k−6])·d / ATR
const par = (k, d, tf) => { const [a, b] = E[tf], at = A[k], back = tf === 'M5' ? 6 : tf === 'M15' ? 18 : 36; return { dist: d * (c[k].c - a[k]) / at, gap: d * (a[k] - b[k]) / at, slope: d * (a[k] - a[Math.max(0, k - back)]) / at }; };
const out = [];
out.push(`12 tháng ${new Date(START).toISOString().slice(0, 10)} → ${new Date(c.at(-1).t).toISOString().slice(0, 10)} · ${WS.length} sóng ≥ 15 giá`);
out.push(`\n(1) EMA34/89 ngay trước điểm đầu sóng (đơn vị ATR M15, dấu + = theo chiều sóng) — so với một nến M5 bất kỳ`);
out.push('   khung | giá − EMA34: sóng (trung vị / 25–75%) | bình thường | EMA34 − EMA89: sóng | bình thường | độ dốc EMA34: sóng | bình thường');
for (const tf of ['M5', 'M15', 'M30']) {
  const S = WS.map(w => par(Math.max(1, idxAt(w.t0) - 1), w.d, tf)), R = []; for (let k = idxAt(START); k < n; k += 7) R.push(par(k, Math.random() < 0.5 ? 1 : -1, tf));
  const f = (v) => `${med(v).toFixed(2)} (${q(v, .25).toFixed(1)}…${q(v, .75).toFixed(1)})`;
  out.push(`   ${tf.padEnd(4)} | ${f(S.map(x => x.dist)).padEnd(22)} | ${f(R.map(x => x.dist)).padEnd(20)} | ${f(S.map(x => x.gap)).padEnd(20)} | ${f(R.map(x => x.gap)).padEnd(20)} | ${f(S.map(x => x.slope)).padEnd(20)} | ${f(R.map(x => x.slope))}`); }
// xác suất có sóng theo vị trí giá so với EMA34 M15
const bins = [[-9, -2], [-2, -1], [-1, -0.3], [-0.3, 0.3], [0.3, 1], [1, 2], [2, 9]];
out.push('   Giá cách EMA34 M15 bao nhiêu ATR lúc sóng bắt đầu (âm = giá đang ở phía NGƯỢC chiều sóng):');
{ const S = WS.map(w => par(Math.max(1, idxAt(w.t0) - 1), w.d, 'M15').dist); out.push('   ' + bins.map(([a, b]) => `[${a},${b}): ${Math.round(100 * S.filter(x => x >= a && x < b).length / S.length)}%`).join(' · ')); }
// (2) nến M5 ở điểm đầu sóng
let pin = 0, eng = 0, big = 0, legs = [], swp = 0;
for (const w of WS) { const k = idxAt(w.t0), x = c[k], y = c[k + 1] || x, d = w.d, rg = x.h - x.l || 1e-9, wick = d > 0 ? Math.min(x.o, x.c) - x.l : x.h - Math.max(x.o, x.c);
  if (wick / rg >= 0.5) pin++; if (d * (y.c - y.o) > 0 && (d > 0 ? y.c > x.h : y.c < x.l)) eng++; if (rg > 1.2 * A[k]) big++;
  let mx = -Infinity, mn = Infinity; for (let u = Math.max(0, k - 12); u <= k; u++) { mx = Math.max(mx, c[u].h); mn = Math.min(mn, c[u].l); } legs.push((mx - mn) / A[k]);
  const sw = (d > 0 ? pv.L : pv.H).some(qq => qq.conf <= k && qq.i >= k - 36 && qq.i < k && (d > 0 ? x.l < qq.p : x.h > qq.p)); if (sw) swp++; }
out.push(`\n(2) Nến M5 ở điểm đầu sóng: râu dài ≥ 50% nến (pin bar) ${Math.round(100 * pin / WS.length)}% · nến kế tiếp nhấn chìm/đóng vượt nến đáy ${Math.round(100 * eng / WS.length)}% · nến đáy/đỉnh rất dài (> 1.2 ATR M15) ${Math.round(100 * big / WS.length)}% · xuyên swing M5 ${Math.round(100 * swp / WS.length)}% · 1h trước đã chạy TB ${med(legs).toFixed(1)} ATR ngược chiều`);
// (3) SL/TP: vào ở nến sau nến quét swing M5 (đóng lại), lọc tùy chọn
function sim(cfg) {
  const T = []; let busy = 0;
  for (let k = 40; k < n - 1; k++) { if (c[k].t < START || c[k].t < busy) continue; const a = A[k]; if (!(a > 0)) continue; const x = c[k];
    let hi = -Infinity, lo = Infinity; for (let u = k - 24; u < k - 2; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); } if (cfg.acc && hi - lo >= 3 * a) continue;
    for (const d of [1, -1]) {
      const sw = (d > 0 ? pv.L : pv.H).filter(qq => qq.conf <= k - 1 && qq.i >= k - 36).filter(qq => d > 0 ? x.l < qq.p - cfg.pierce * a && x.c > qq.p : x.h > qq.p + cfg.pierce * a && x.c < qq.p); if (!sw.length) continue;
      if (cfg.ema30 && Math.sign(E.M30[0][k] - E.M30[1][k]) !== d) continue;
      if (cfg.side15 && d * (x.c - E.M15[0][k]) / a > cfg.side15) continue; // chỉ vào khi giá còn ở phía ngược/sát EMA34 M15 (chưa chạy xa)
      const y = c[k + 1], entry = d > 0 ? y.o + SP : y.o, ext = d > 0 ? x.l : x.h, sl0 = ext - d * (cfg.pad * a + (d < 0 ? SP : 0)); let sl = sl0; const risk = d * (entry - sl0); if (!(risk > 1) || risk > cfg.maxSL) continue;
      const tp = cfg.tpATR ? entry + d * cfg.tpATR * a : entry + d * cfg.rr * risk; let st = 'TIME', ex = null, et = null, be = false, best = entry;
      for (let u = k + 1; u < Math.min(n, k + 1 + cfg.hold); u++) { const z = c[u], l2 = d > 0 ? z.l : z.l + SP, h2 = d > 0 ? z.h : z.h + SP;
        if (d > 0 ? l2 <= sl : h2 >= sl) { st = be ? (d * (sl - entry) > 0.05 ? 'TRAIL' : 'BE') : 'LOSS'; ex = sl; et = z.ct; break; }
        if (!cfg.trail && (d > 0 ? h2 >= tp : l2 <= tp)) { st = 'WIN'; ex = tp; et = z.ct; break; }
        best = d > 0 ? Math.max(best, z.h) : Math.min(best, l2);
        if (cfg.be && !be && d * (best - entry) >= cfg.be * risk) { sl = entry + d * 0.1; be = true; }
        if (cfg.trail && d * (best - entry) >= cfg.trail * risk) { const nsl = best - d * cfg.trailDist * a; if (d * (nsl - sl) > 0) { sl = nsl; be = true; } } }
      if (!et) { const z = c[Math.min(n - 1, k + cfg.hold)]; ex = d > 0 ? z.c : z.c + SP; et = z.ct; }
      T.push({ t: y.t, d, st, pts: d * (ex - entry), risk, entry, et }); busy = et; break; } }
  // bắt sóng: lệnh vào trong 1/3 đầu sóng ≥ 15 giá cùng chiều và có lời
  let cap = 0; for (const w of WS) { const tB = w.t0 + (w.t1 - w.t0) / 3; if (T.some(x => x.d === w.d && x.t >= w.t0 && x.t <= tB && x.pts > 0)) cap++; }
  return { T, cap };
}
const rp = (nm, cfg) => { const { T, cap } = sim(cfg), f = (G) => { const w = G.filter(x => x.pts > 0).length, u = G.reduce((s, x) => s + x.pts * 2, 0); return `${G.length}L thắng ${Math.round(100 * w / (G.length || 1))}% ${(u >= 0 ? '+' : '') + Math.round(u)}$`; };
  let eq = 0, pk = 0, dd = 0; for (const x of T) { eq += x.pts * 2; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  out.push(`   ${nm.padEnd(50)} ${f(T).padEnd(22)} DD ${String(Math.round(dd)).padStart(4)}$ · bắt ${cap} sóng (${(100 * cap / WS.length).toFixed(1)}%) · SL TB ${(T.reduce((s, x) => s + x.risk, 0) / (T.length || 1)).toFixed(1)} | nửa đầu ${f(T.filter(x => x.t < HALF))} | nửa sau ${f(T.filter(x => x.t >= HALF))}`); };
const B = { pierce: 0.4, pad: 0.3, maxSL: 15, rr: 2, hold: 48, acc: true };
out.push(`\n(3) SL/TP — vào ở nến sau nến quét swing M5 rồi đóng lại (tích lũy 2h, xuyên ≥ 0.4 ATR), mỗi lúc 1 lệnh, 0.02 lot:`);
out.push('  SL:'); for (const pad of [0.1, 0.3, 0.6]) rp(`SL ngoài râu + ${pad} ATR · TP 2R`, { ...B, pad });
out.push('  TP theo R:'); for (const rr of [1, 1.5, 2, 3, 4]) rp(`TP ${rr}R`, { ...B, rr });
out.push('  TP theo ATR M15 (không phụ thuộc SL):'); for (const tpATR of [1.5, 2.5, 3.5]) rp(`TP ${tpATR} ATR`, { ...B, tpATR });
out.push('  Dời hoà vốn / gồng lời:');
rp('TP 2R + dời hoà vốn khi lời 1R', { ...B, be: 1 });
rp('TP 3R + dời hoà vốn khi lời 1R', { ...B, rr: 3, be: 1 });
rp('Không TP, khi lời 1R kéo SL cách đỉnh 1 ATR (gồng)', { ...B, trail: 1, trailDist: 1, hold: 96 });
rp('Không TP, khi lời 1.5R kéo SL cách đỉnh 1.5 ATR', { ...B, trail: 1.5, trailDist: 1.5, hold: 96 });
out.push('  Lọc thêm theo EMA:');
rp('TP 2R + EMA34/89 M30 cùng chiều', { ...B, ema30: true });
rp('TP 2R + giá chưa vượt EMA34 M15 quá 0.3 ATR', { ...B, side15: 0.3 });
rp('TP 2R + cả hai lọc EMA', { ...B, ema30: true, side15: 0.3 });
rp('TP 3R + cả hai lọc EMA', { ...B, rr: 3, ema30: true, side15: 0.3 });
rp('Gồng (1R → kéo 1 ATR) + EMA M30 cùng chiều', { ...B, ema30: true, trail: 1, trailDist: 1, hold: 96 });
console.log(out.join('\n'));
