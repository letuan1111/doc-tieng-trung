// Chiến lược trong ảnh người dùng gửi (08/11/2026): "ICT + SMC + EMA 34/89 (M5)"
// BUY: 1) bias EMA34 > EMA89 (M15/H1) · 2) giá quét SSL tại vùng thanh khoản · 3) CHoCH/MSS ↑ · 4) displacement tạo FVG ↑
//      5) giá hồi về 50% FVG · 6) BUY LIMIT, SL dưới đáy cú quét · 7) TP tại BSL/đỉnh gần nhất, RR ≥ 1:2  (SELL đối xứng)
// Tua trên khung vào lệnh M5 và M15, khớp/SL/TP tính bằng nến M1 (một nến M1 chạm cả SL và TP → tính SL). Giá Dukascopy, spread 0.35, 0.02 lot.
// node research/img-strat.mjs [số tháng=5]
import fs from 'node:fs'; import path from 'node:path'; import { DIR, resample, ema, atr, pivots } from './core.mjs';
const SP = 0.35, VN = 7 * 36e5, MON = +(process.argv[2] || 5);
const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
const END = m1.at(-1).ct, START = END - MON * 30.44 * 864e5;
const TF = { m5: resample(m1, 3e5), m15: resample(m1, 9e5), h1: resample(m1, 36e5) };
const i1 = new Map(m1.map((x, j) => [x.t, j])), at1 = (t) => { for (let u = 0; u < 15; u++) { const j = i1.get(t + u * 6e4); if (j != null) return j; } return null; };
const mapTo = (c, H, v) => { const o = new Array(c.length).fill(null); let j = -1; for (let i = 0; i < c.length; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) o[i] = v[j]; } return o; };
const EMA = (c) => [ema(c.map(x => x.c), 34), ema(c.map(x => x.c), 89)];
// vùng cung/cầu H1/M15 (bước 2 "tại vùng thanh khoản"): đỉnh/đáy swing H1 và M15 (3 nến mỗi bên) đã xác nhận, chưa bị đóng cửa phá
function zonesOf(c, ms) { const P = pivots(c, 3), A = atr(c), Z = []; for (const [arr, type] of [[P.L, 1], [P.H, -1]]) for (const q of arr) { if (q.conf >= c.length) continue; const x = c[q.i], lo = type > 0 ? x.l : Math.max(x.o, x.c), hi = type > 0 ? Math.min(x.o, x.c) : x.h; let inv = Infinity; for (let k = q.conf + 1; k < c.length; k++) if (type > 0 ? c[k].c < lo - 0.1 * A[k] : c[k].c > hi + 0.1 * A[k]) { inv = c[k].ct; break; } Z.push({ type, lo: lo - 0.2 * A[q.i], hi: hi + 0.2 * A[q.i], act: c[q.conf].ct, inv, tf: ms }); } return Z; }
const ZONES = [...zonesOf(TF.h1, 'H1'), ...zonesOf(TF.m15, 'M15')];
export const FUN = {};
export function run(tfName, cfg) {
  const F = (FUN[tfName] = { bias: 0, sweep: 0, zone: 0, mss: 0, disp: 0, fvg: 0, risk: 0, tp: 0, placed: 0, filled: 0 });
  const c = TF[tfName], n = c.length, A = atr(c), pv = pivots(c, 2), [e34, e89] = EMA(c);
  const [b15a, b15b] = EMA(TF.m15).map(v => mapTo(c, TF.m15, v)), [b1a, b1b] = EMA(TF.h1).map(v => mapTo(c, TF.h1, v));
  const bias = (k, d) => { const m15 = Math.sign(b15a[k] - b15b[k]) === d, h1 = Math.sign(b1a[k] - b1b[k]) === d, own = Math.sign(e34[k] - e89[k]) === d;
    return cfg.bias === 'M15' ? m15 : cfg.bias === 'H1' ? h1 : cfg.bias === 'M15+H1' ? m15 && h1 : cfg.bias === 'own' ? own : true; };
  const avgBody = (k) => { let s = 0; for (let u = k - 20; u < k; u++) s += Math.abs(c[u].c - c[u].o); return s / 20; };
  const T = []; let busy = 0;
  for (let k = 120; k < n - 3; k++) {
    if (c[k].t < START || c[k].t < busy) continue; const x = c[k], a = A[k];
    for (const d of [1, -1]) {
      if (!bias(k, d)) continue; F.bias++;                                                   // 1) bias
      // 2) quét SSL (BSL): râu xuyên đáy (đỉnh) swing đã xác nhận, chưa bị quét, rồi đóng lại phía trên (dưới)
      const pool = (d > 0 ? pv.L : pv.H).filter(q => q.conf <= k - 1 && q.i >= k - cfg.look);
      const sw = pool.filter(q => (d > 0 ? x.l < q.p && x.c > q.p : x.h > q.p && x.c < q.p) && !c.slice(q.i + 1, k).some(z => d > 0 ? z.l < q.p : z.h > q.p));
      if (!sw.length) continue; F.sweep++; const lv = d > 0 ? Math.min(...sw.map(q => q.p)) : Math.max(...sw.map(q => q.p));
      if (cfg.zone && !ZONES.some(z => z.type === d && z.act <= x.ct && z.inv > x.ct && lv >= z.lo && lv <= z.hi)) continue; F.zone++;   // tại vùng cung/cầu H1/M15
      // 3) CHoCH/MSS: đóng cửa vượt đỉnh (đáy) swing gần nhất trước cú quét, trong ≤ 12 nến, chưa thủng lại đáy cú quét
      const opp = (d > 0 ? pv.H : pv.L).filter(q => q.conf <= k && q.i < k).slice(-1)[0]; if (!opp) continue;
      let ext = d > 0 ? x.l : x.h, m = null; for (let u = k + 1; u <= k + 12 && u < n; u++) { const y = c[u]; if (d > 0 ? y.l < ext : y.h > ext) { if (d > 0 ? y.c < lv : y.c > lv) break; ext = d > 0 ? y.l : y.h; } if (d > 0 ? y.c > opp.p : y.c < opp.p) { m = u; break; } }
      if (m == null) continue; F.mss++;
      // 4) displacement + FVG: trong nhịp từ cú quét đến nến MSS (+1), có FVG cùng chiều ≥ 0.1 ATR; nến MSS thân ≥ 1.2× thân TB 20 nến
      if (cfg.disp && Math.abs(c[m].c - c[m].o) < 1.2 * avgBody(m)) continue; F.disp++;
      let f = null; for (let u = k + 2; u <= Math.min(m + 1, n - 1); u++) { const top = d > 0 ? c[u].l : c[u - 2].l, bot = d > 0 ? c[u - 2].h : c[u].h; if (top - bot >= 0.1 * a) f = { top, bot, u }; }
      if (!f) continue; F.fvg++;
      // 5–6) LIMIT ở 50% FVG (hoặc mép), đặt sau khi nến tạo FVG/MSS đóng; SL ngoài đáy (đỉnh) cú quét
      const placeT = c[Math.max(m, f.u)].ct, entry = cfg.entry === 'edge' ? (d > 0 ? f.top : f.bot) : (f.top + f.bot) / 2;
      const sl = ext - d * Math.max(SP, cfg.pad * a), risk = d * (entry - sl); if (!(risk > 0.5)) continue; F.risk++;
      // 7) TP: BSL/đỉnh gần nhất (đỉnh swing đã xác nhận phía trên entry), RR ≥ 2; hoặc TP cố định theo R
      let tp;
      if (cfg.tp === 'liq') { const liq = (d > 0 ? pv.H : pv.L).filter(q => q.conf <= Math.max(m, f.u) && q.i >= k - cfg.look && d * (q.p - entry) > 0).map(q => q.p).sort((p, q) => d * (p - q)); const tgt = liq.find(p => d * (p - entry) >= cfg.minRR * risk); if (tgt == null) continue; tp = tgt; var near = liq[0]; }
      else tp = entry + d * cfg.rr * risk;
      F.tp++; F.placed++;
      // mô phỏng trên M1
      let j = at1(placeT); if (j == null) continue; const exp = placeT + cfg.expiry * (c[1].t - c[0].t); let fill = null, why = null;
      for (; j < m1.length; j++) { const z = m1[j]; if (z.t >= exp) { why = 'hết hạn'; break; } const aL = z.l + SP, aH = z.h + SP;
        if (d > 0 ? z.l <= sl : aH >= sl) { if (d > 0 ? aL <= entry : z.h >= entry) { fill = j; } else why = 'chạm SL trước khi khớp'; break; }
        if (d > 0 ? z.h >= tp : aL <= tp) { why = 'chạm TP trước khi khớp'; break; }
        if (d > 0 ? aL <= entry : z.h >= entry) { fill = j; break; } }
      if (fill == null) { T.push({ k, d, st: 'NOFILL', why, placeT, entry, sl, tp }); busy = m1[Math.min(j, m1.length - 1)].ct; break; }
      let st = 'OPEN', ex = null, et = null, s2 = sl, half = false, realized = 0;
      for (let u = fill; u < m1.length && u < fill + cfg.hold; u++) { const z = m1[u], l2 = d > 0 ? z.l : z.l + SP, h2 = d > 0 ? z.h : z.h + SP;
        if (d > 0 ? l2 <= s2 : h2 >= s2) { st = half ? 'TP1+BE' : 'LOSS'; ex = s2; et = z.ct; break; }
        if (u === fill) continue;
        if (cfg.tp1 && !half && (d > 0 ? h2 >= entry + d * cfg.tp1 * risk : l2 <= entry + d * cfg.tp1 * risk)) { half = true; realized = 0.5 * cfg.tp1 * risk; s2 = entry + d * 0.1; }
        if (d > 0 ? h2 >= tp : l2 <= tp) { st = 'WIN'; ex = tp; et = z.ct; break; } }
      if (!et) { const z = m1[Math.min(m1.length - 1, fill + cfg.hold - 1)]; st = 'TIME'; ex = d > 0 ? z.c : z.c + SP; et = z.ct; }
      const pts = cfg.tp1 ? (half ? realized + 0.5 * d * (ex - entry) : d * (ex - entry)) : d * (ex - entry);
      F.filled++; T.push({ k, d, st, t: m1[fill].t, entry, sl, tp, risk, tpd: Math.abs(tp - entry), pts, et, sweepT: x.t, sweepCT: x.ct, lv, ext, opp: opp.p, mssT: c[m].ct, fvg: f, placeT, near: typeof near === 'number' ? near : null, fillJ: fill, a, tf: tfName }); busy = et; break;
    }
  }
  return T;
}
export const BASE = { bias: 'M15', look: 48, zone: false, disp: true, entry: 'ce', pad: 0.1, tp: 'liq', minRR: 2, rr: 2, expiry: 12, hold: 720 };
export { TF, m1, at1, START, END, SP, VN, EMA, mapTo };
if (!process.argv[1].endsWith('img-strat.mjs')) { /* chỉ export */ } else {
const HALF = START + (END - START) / 2, fmt = (t) => new Date(t + VN).toISOString().slice(0, 10);
const out = [`Vàng · ${fmt(START)} → ${fmt(END)} (${MON} tháng) · Dukascopy · spread ${SP} · 0.02 lot (1 giá = 2$)`];
function rep(tf, nm, cfg) { const R = run(tf, cfg), T = R.filter(x => x.st !== 'NOFILL'), nf = R.length - T.length; const w = T.filter(x => x.pts > 0).length, wTP = T.filter(x => x.st === 'WIN').length, u = T.reduce((s, x) => s + x.pts * 2, 0);
  let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; for (const x of T) { eq += x.pts * 2; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = x.pts < 0 ? ls + 1 : 0; ml = Math.max(ml, ls); }
  const avg = (f) => (T.reduce((s, x) => s + f(x), 0) / (T.length || 1)).toFixed(1), g = (G) => `${G.length}L ${Math.round(100 * G.filter(x => x.pts > 0).length / (G.length || 1))}% ${(G.reduce((s, x) => s + x.pts * 2, 0) >= 0 ? '+' : '') + Math.round(G.reduce((s, x) => s + x.pts * 2, 0))}$`;
  out.push(`${(tf.toUpperCase() + ' · ' + nm).padEnd(58)} ${String(T.length).padStart(4)} lệnh (${(T.length / (MON * 21.7)).toFixed(1)}/ngày) · thắng ${Math.round(100 * w / (T.length || 1))}% (chạm TP ${Math.round(100 * wTP / (T.length || 1))}%) · SL TB ${avg(x => x.risk)} · TP TB ${avg(x => x.tpd)} giá · ${u >= 0 ? '+' : ''}${Math.round(u)}$ · DD ${Math.round(dd)}$ · thua l.t. ${ml} · không khớp ${nf} | nửa đầu ${g(T.filter(x => x.t < HALF))} | nửa sau ${g(T.filter(x => x.t >= HALF))}`);
  return T; }
const keep = {};
for (const tf of ['m5', 'm15']) {
  out.push(`\n=== Khung vào lệnh ${tf.toUpperCase()} ===`);
  keep[tf] = rep(tf, 'ĐÚNG ẢNH: bias M15 · quét · CHoCH · FVG · limit 50% · TP thanh khoản RR≥2', BASE);
  rep(tf, 'bias M15 + H1 cùng chiều', { ...BASE, bias: 'M15+H1' });
  rep(tf, 'bias H1', { ...BASE, bias: 'H1' });
  rep(tf, '+ quét phải nằm trong vùng cung/cầu H1/M15', { ...BASE, zone: true });
  rep(tf, 'TP cố định 2R', { ...BASE, tp: 'rr', rr: 2 });
  rep(tf, 'TP cố định 1.5R (TP1 trong ảnh)', { ...BASE, tp: 'rr', rr: 1.5 });
  rep(tf, 'TP cố định 3R (TP2 trong ảnh)', { ...BASE, tp: 'rr', rr: 3 });
  rep(tf, 'TP1 1.5R chốt ½ + dời hoà vốn, TP2 3R', { ...BASE, tp: 'rr', rr: 3, tp1: 1.5 });
  rep(tf, 'limit ở mép FVG thay vì 50%', { ...BASE, entry: 'edge' });
  rep(tf, 'không cần nến displacement mạnh', { ...BASE, disp: false });
  rep(tf, 'không lọc bias EMA', { ...BASE, bias: 'none' });
}
// theo tháng cho bản đúng ảnh
for (const tf of ['m5', 'm15']) { const mo = {}; for (const x of keep[tf]) { const k = new Date(x.t + VN).toISOString().slice(0, 7); mo[k] = mo[k] || []; mo[k].push(x); }
  out.push(`${tf.toUpperCase()} đúng ảnh theo tháng: ` + Object.entries(mo).map(([k, G]) => `${k.slice(5)}/${k.slice(2, 4)} ${G.length}L ${Math.round(100 * G.filter(x => x.pts > 0).length / G.length)}% ${(G.reduce((s, x) => s + x.pts * 2, 0) >= 0 ? '+' : '') + Math.round(G.reduce((s, x) => s + x.pts * 2, 0))}$`).join(' · ')); }
console.log(out.join('\n'));
fs.writeFileSync('/home/claude/work/img-strat.txt', out.join('\n'));
}
