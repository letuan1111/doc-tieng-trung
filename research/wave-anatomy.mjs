// Mổ xẻ từng sóng ≥ 15 giá (zigzag M5): trước sóng EMA34/89 M5/M15/M30 ra sao, có tích lũy, có quét thanh khoản M5,
// MSS M5 / FVG M5 / phá biên tích lũy xuất hiện lúc sóng chạy được bao nhiêu % → vào lệnh còn kịp không.
// (A) 12 tháng: thống kê sóng bot bỏ lỡ · (B) 30 ngày trang tua: ghi phân tích từng sóng vào data.json · (C) kiểm chuỗi dấu hiệu có thành lệnh được không
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, resample, ema, atr, pivots } from './core.mjs';
const req = createRequire(import.meta.url), EMAPB = req(path.join(DIR, '..', 'tin-hieu', 'emapb.js')), EMA21 = req(path.join(DIR, '..', 'tin-hieu', 'ema21.js'));
const SP = 0.35, VN = 7 * 36e5, WAVE = 15;
const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
const c = resample(m1, 3e5), m15 = resample(m1, 9e5), m30 = resample(m15, 18e5), n = c.length;
const map = (H, v) => { const o = new Array(n).fill(null); let j = -1; for (let i = 0; i < n; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) o[i] = v[j]; } return o; };
const EM = { M5: [ema(c.map(x => x.c), 34), ema(c.map(x => x.c), 89)], M15: [map(m15, ema(m15.map(x => x.c), 34)), map(m15, ema(m15.map(x => x.c), 89))], M30: [map(m30, ema(m30.map(x => x.c), 34)), map(m30, ema(m30.map(x => x.c), 89))] };
const A = map(m15, atr(m15)), pv = pivots(c, 2);
const idxAt = (t) => { let lo = 0, hi = n - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
const fmt = (t) => new Date(t + VN).toISOString().slice(5, 16).replace('T', ' ').replace(/^(\d\d)-(\d\d)/, '$2/$1');
const hrVN = (t) => (new Date(t).getUTCHours() + 7) % 24;
// ---------- phân tích 1 sóng
function anatomy(w) {
  const d = w.d, k0 = idxAt(w.t0), k1 = idxAt(w.t1), a = A[k0] || 3, size = Math.abs(w.p1 - w.p0), pct = (k) => Math.round(100 * Math.max(0, d * (c[k].c - w.p0)) / size);
  const kb = Math.max(0, k0 - 1); // nến ngay trước điểm đầu sóng
  // EMA
  const ema = {}; for (const tf of ['M5', 'M15', 'M30']) { const [e34, e89] = EM[tf], s = Math.sign(e34[kb] - e89[kb]), gap = Math.abs(e34[kb] - e89[kb]) / a, p = c[kb].c;
    const pos = p > Math.max(e34[kb], e89[kb]) ? 'trên' : p < Math.min(e34[kb], e89[kb]) ? 'dưới' : 'giữa';
    ema[tf] = { dir: s === d ? 'cùng' : 'ngược', flat: gap < 0.3, gap: +gap.toFixed(2), pos }; }
  // EMA M5 cắt theo chiều sóng lúc nào
  let kx = null; const [e34, e89] = EM.M5; if (Math.sign(e34[kb] - e89[kb]) !== d) for (let k = k0; k <= k1; k++) if (Math.sign(e34[k] - e89[k]) === d) { kx = k; break; }
  // giá chạm EMA34 M30 / M15 trong 3h trước (hồi về EMA)
  const touch = {}; for (const tf of ['M15', 'M30']) { touch[tf] = false; for (let k = Math.max(0, k0 - 36); k <= k0; k++) if (c[k].l <= EM[tf][0][k] && c[k].h >= EM[tf][0][k]) { touch[tf] = true; break; } }
  // tích lũy 2h trước (bỏ 2 nến cuối)
  let hi = -Infinity, lo = Infinity; for (let u = Math.max(0, k0 - 24); u < k0 - 2; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); }
  const rng = hi - lo, acc = rng < 3 * a;
  // quét thanh khoản M5 tại điểm đầu sóng: xuyên đỉnh/đáy swing M5 (đã xác nhận, ≤ 3h) rồi đóng lại trong ≤ 3 nến
  const sws = (d > 0 ? pv.L : pv.H).filter(q => q.conf <= k0 && q.i >= k0 - 36 && q.i < k0 && (d > 0 ? w.p0 < q.p : w.p0 > q.p));
  const lvl = sws.length ? (d > 0 ? Math.min(...sws.map(q => q.p)) : Math.max(...sws.map(q => q.p))) : null;
  let sweep = null; if (lvl != null) for (let u = k0; u <= k0 + 3 && u < n; u++) if (d > 0 ? c[u].c > lvl : c[u].c < lvl) { sweep = { lvl, depth: +Math.abs(w.p0 - lvl).toFixed(1), k: u }; break; }
  const boxSweep = isFinite(lo) && (d > 0 ? w.p0 < lo : w.p0 > hi);
  // MSS M5: đóng cửa vượt swing ngược gần nhất trước điểm đầu sóng
  const opp = (d > 0 ? pv.H : pv.L).filter(q => q.conf <= k0 && q.i < k0).slice(-1)[0];
  let kM = null; if (opp) for (let k = k0 + 1; k <= k1; k++) if (d > 0 ? c[k].c > opp.p : c[k].c < opp.p) { kM = k; break; }
  // FVG M5 đầu tiên theo chiều sóng
  let kF = null, fsz = 0; for (let m = k0 + 2; m <= k1; m++) { const g = d > 0 ? c[m].l - c[m - 2].h : c[m - 2].l - c[m].h; if (g > 0) { kF = m; fsz = g; break; } }
  // phá biên tích lũy theo chiều sóng
  let kB = null; if (isFinite(hi)) for (let k = k0 + 1; k <= k1; k++) if (d > 0 ? c[k].c > hi : c[k].c < lo) { kB = k; break; }
  // điểm vào sớm nhất khi đủ chuỗi quét → MSS → FVG
  let entry = null; if (sweep && kM != null && kF != null) { const k = Math.max(kM, kF), p = c[k].c, sl = Math.abs(p - w.p0) + 0.3 * a + SP, left = Math.abs(w.p1 - p); entry = { k, pct: pct(k), left: +left.toFixed(1), sl: +sl.toFixed(1), R: +(left / sl).toFixed(1) }; }
  const r = { ema, kx: kx != null ? pct(kx) : null, touch, acc, rng: +rng.toFixed(1), rngATR: +(rng / a).toFixed(1), sweep, boxSweep, mss: kM != null ? pct(kM) : null, mssMin: kM != null ? (kM - k0) * 5 : null, fvg: kF != null ? pct(kF) : null, fvgSz: +fsz.toFixed(1), brk: kB != null ? pct(kB) : null, entry, h: hrVN(w.t0) };
  // diễn giải
  const e = (tf) => `${tf} ${r.ema[tf].flat ? 'đan xen (34≈89)' : (r.ema[tf].dir === 'cùng' ? 'cùng chiều' : 'ngược chiều')}, giá ${r.ema[tf].pos} EMA`;
  r.text = [
    `EMA trước sóng: ${e('M5')} · ${e('M15')} · ${e('M30')}${r.kx != null ? ` · EMA34/89 M5 cắt theo chiều sóng khi đã chạy ${r.kx}%` : ''}${r.touch.M30 ? ' · 3h trước có chạm EMA34 M30' : r.touch.M15 ? ' · 3h trước có chạm EMA34 M15' : ''}`,
    `${r.acc ? `Tích lũy 2h: biên ${r.rng} giá (${r.rngATR} ATR)` : `Không tích lũy: biên 2h ${r.rng} giá (${r.rngATR} ATR)`} · ${r.sweep ? `QUÉT ${d > 0 ? 'đáy (SSL)' : 'đỉnh (BSL)'} swing M5 ${r.sweep.lvl.toFixed(1)}, xuyên ${r.sweep.depth} giá rồi đóng lại` : r.boxSweep ? 'xuyên biên tích lũy nhưng không đóng lại ngay' : 'không quét swing M5'}`,
    `Sau đó: ${r.mss != null ? `MSS M5 sau ${r.mssMin} phút (sóng đã chạy ${r.mss}%)` : 'không có MSS M5'} · ${r.fvg != null ? `FVG M5 ${r.fvgSz} giá (đã chạy ${r.fvg}%)` : 'không có FVG M5'} · ${r.brk != null ? `phá biên tích lũy (đã chạy ${r.brk}%)` : 'không phá qua biên tích lũy'}`,
    r.entry ? `Đủ chuỗi quét→MSS→FVG khi sóng đã chạy ${r.entry.pct}%: còn ${r.entry.left} giá, SL cần ${r.entry.sl} giá → ${r.entry.R}R ${r.entry.R >= 2 ? '✅ còn đáng vào' : r.entry.R >= 1 ? '⚠️ chỉ được ~1R' : '❌ quá muộn'}` : 'Không đủ chuỗi quét→MSS→FVG'
  ].join('\n');
  return r;
}
// ---------- zigzag 15 giá (giống trang tua) trên 12 tháng
function zigzag() { const W = []; let dir = 0, ext = c[0], start = null, sp = c[0].l;
  for (const x of c) { if (dir >= 0 && x.h > (ext.hp ?? ext.h)) ext = { ...x, hp: x.h }; if (dir <= 0 && x.l < (ext.lp ?? ext.l)) ext = { ...x, lp: x.l };
    if (dir === 0) { if (x.h - sp >= WAVE) { dir = 1; ext = { ...x, hp: x.h }; start = { t: c[0].t, p: sp }; } continue; }
    if (dir > 0 && ext.hp - x.l >= WAVE) { W.push({ d: 1, t0: start.t, p0: start.p, t1: ext.t, p1: ext.hp }); start = { t: ext.t, p: ext.hp }; dir = -1; ext = { ...x, lp: x.l }; }
    else if (dir < 0 && x.h - ext.lp >= WAVE) { W.push({ d: -1, t0: start.t, p0: start.p, t1: ext.t, p1: ext.lp }); start = { t: ext.t, p: ext.lp }; dir = 1; ext = { ...x, hp: x.h }; } }
  return W.filter(w => Math.abs(w.p1 - w.p0) >= WAVE); }
// lệnh 2 EA (giới hạn như EA) trên 12 tháng
const fin = (s) => ['WIN', 'LOSS', 'TIME'].includes(s.state), dayVN = (t) => new Date(t + VN).toISOString().slice(0, 10);
const seq = (L, cap, block) => { const o = []; let free = 0; const cnt = {}; for (const s of L.sort((a, b) => a.fillT - b.fillT)) { const dd = dayVN(s.fillT); if (s.fillT < free || (cnt[dd] || 0) >= cap || (block && block(s.fillT))) continue; o.push(s); cnt[dd] = (cnt[dd] || 0) + 1; free = s.exitT; } return o; };
const TE = seq(EMAPB.run({ m5: c, m15 }, { spread: SP }).filter(s => s.tgOK && fin(s)), 4), TR = seq(EMA21.run({ m5: c, m15 }, { spread: SP }).filter(fin), 6, (t) => TE.some(e => e.fillT <= t && t < e.exitT)), TT = [...TE, ...TR];
const START = c[0].t + 20 * 864e5;
const W12 = zigzag().filter(w => w.t0 >= START).map(w => ({ ...w, caught: TT.some(s => s.side === w.d && s.fillT >= w.t0 && s.fillT <= w.t1) }));
const MISS = W12.filter(w => !w.caught).map(w => ({ ...w, an: anatomy(w) }));
// ---------- (A) thống kê 12 tháng
const N = MISS.length, P = (f) => `${Math.round(100 * MISS.filter(f).length / N)}%`, avg = (f, g) => { const G = MISS.filter(f); return G.length ? Math.round(G.reduce((s, w) => s + g(w), 0) / G.length) : 0; };
const out = [];
out.push(`12 THÁNG (${new Date(START).toISOString().slice(0, 10)} → ${new Date(c.at(-1).t).toISOString().slice(0, 10)}): ${W12.length} sóng ≥ 15 giá, bot vào cùng chiều ${W12.length - N}, BỎ LỠ ${N} (TB ${(MISS.reduce((s, w) => s + Math.abs(w.p1 - w.p0), 0) / N).toFixed(1)} giá)`);
out.push(`EMA34/89 trước sóng (nến ngay trước điểm đầu sóng):`);
for (const tf of ['M5', 'M15', 'M30']) out.push(`   ${tf}: cùng chiều sóng ${P(w => w.an.ema[tf].dir === 'cùng' && !w.an.ema[tf].flat)} · ngược chiều ${P(w => w.an.ema[tf].dir === 'ngược' && !w.an.ema[tf].flat)} · đan xen (34≈89) ${P(w => w.an.ema[tf].flat)} · giá nằm GIỮA 2 EMA ${P(w => w.an.ema[tf].pos === 'giữa')} · giá ngược phía (sóng tăng mà giá dưới cả 2 EMA / ngược lại) ${P(w => (w.d > 0 ? w.an.ema[tf].pos === 'dưới' : w.an.ema[tf].pos === 'trên'))}`);
out.push(`   EMA M5 cắt theo chiều sóng trong lúc sóng chạy: ${P(w => w.an.kx != null)}, khi sóng đã chạy TB ${avg(w => w.an.kx != null, w => w.an.kx)}% · cả M5, M15, M30 đều cùng chiều trước sóng: ${P(w => ['M5', 'M15', 'M30'].every(tf => w.an.ema[tf].dir === 'cùng'))} · cả 3 đều ngược: ${P(w => ['M5', 'M15', 'M30'].every(tf => w.an.ema[tf].dir === 'ngược'))}`);
out.push(`   3h trước có chạm EMA34 M30: ${P(w => w.an.touch.M30)} · chạm EMA34 M15: ${P(w => w.an.touch.M15)}`);
out.push(`Tích lũy 2h trước sóng (< 3 ATR M15): ${P(w => w.an.acc)} · biên TB ${avg(() => true, w => w.an.rng)} giá`);
out.push(`Quét thanh khoản M5 tại điểm đầu sóng (xuyên swing M5 rồi đóng lại ≤ 3 nến): ${P(w => w.an.sweep)} · xuyên biên tích lũy không đóng lại ngay: ${P(w => !w.an.sweep && w.an.boxSweep)} · không quét: ${P(w => !w.an.sweep && !w.an.boxSweep)}`);
out.push(`MSS M5 trong sóng: ${P(w => w.an.mss != null)}, khi sóng đã chạy TB ${avg(w => w.an.mss != null, w => w.an.mss)}% (sau TB ${avg(w => w.an.mss != null, w => w.an.mssMin)} phút)`);
out.push(`FVG M5 trong sóng: ${P(w => w.an.fvg != null)}, khi đã chạy TB ${avg(w => w.an.fvg != null, w => w.an.fvg)}%`);
out.push(`Phá biên tích lũy theo chiều sóng: ${P(w => w.an.brk != null)}, khi đã chạy TB ${avg(w => w.an.brk != null, w => w.an.brk)}% · (sóng có tích lũy mà không phá biên: ${P(w => w.an.acc && w.an.brk == null)})`);
out.push(`Đủ chuỗi QUÉT M5 → MSS → FVG: ${P(w => w.an.entry)} · lúc đủ chuỗi sóng đã chạy TB ${avg(w => w.an.entry, w => w.an.entry.pct)}% · còn ≥ 2R: ${P(w => w.an.entry && w.an.entry.R >= 2)} · 1–2R: ${P(w => w.an.entry && w.an.entry.R >= 1 && w.an.entry.R < 2)} · < 1R: ${P(w => w.an.entry && w.an.entry.R < 1)}`);
const combo = (f) => { const G = MISS.filter(f); return `${G.length} sóng (${Math.round(100 * G.length / N)}%), TB ${(G.reduce((s, w) => s + Math.abs(w.p1 - w.p0), 0) / (G.length || 1)).toFixed(1)} giá`; };
out.push(`Kiểu hay gặp nhất:`);
out.push(`   tích lũy + quét M5 + MSS + FVG: ${combo(w => w.an.acc && w.an.sweep && w.an.mss != null && w.an.fvg != null)}`);
out.push(`   tích lũy + quét M5 + phá biên đối diện: ${combo(w => w.an.acc && w.an.sweep && w.an.brk != null)}`);
out.push(`   tích lũy + KHÔNG quét + phá biên (phá thật): ${combo(w => w.an.acc && !w.an.sweep && !w.an.boxSweep && w.an.brk != null)}`);
out.push(`   không tích lũy, EMA M30 cùng chiều (đi tiếp xu hướng): ${combo(w => !w.an.acc && w.an.ema.M30.dir === 'cùng')}`);
out.push(`   không tích lũy, EMA M30 ngược chiều (đảo chiều): ${combo(w => !w.an.acc && w.an.ema.M30.dir === 'ngược')}`);
// ---------- (C) chuỗi dấu hiệu có thành lệnh được không: quét swing M5 (trong tích lũy) → MSS M5 ≤ 12 nến → có FVG → vào khi đủ
function scan(needAcc, emaF) { const T = []; let busy = 0;
  for (let k = 40; k < n - 1; k++) { if (c[k].t < START || c[k].t < busy) continue; const a = A[k]; if (!(a > 0)) continue;
    let hi = -Infinity, lo = Infinity; for (let u = k - 24; u < k - 2; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); } const acc = hi - lo < 3 * a; if (needAcc && !acc) continue;
    for (const d of [1, -1]) { const x = c[k]; const sw = (d > 0 ? pv.L : pv.H).filter(q => q.conf <= k - 1 && q.i >= k - 36).filter(q => d > 0 ? x.l < q.p && x.c > q.p : x.h > q.p && x.c < q.p); if (!sw.length) continue;
      if (emaF && !emaF(k, d)) continue;
      const opp = (d > 0 ? pv.H : pv.L).filter(q => q.conf <= k && q.i < k).slice(-1)[0]; if (!opp) continue; const ext0 = d > 0 ? x.l : x.h;
      let kM = null, ext = ext0; for (let m = k + 1; m <= k + 12 && m < n; m++) { ext = d > 0 ? Math.min(ext, c[m].l) : Math.max(ext, c[m].h); if (d > 0 ? c[m].c < ext0 - 0.5 * a : c[m].c > ext0 + 0.5 * a) break; if (d > 0 ? c[m].c > opp.p : c[m].c < opp.p) { kM = m; break; } }
      if (kM == null) continue; let f = false; for (let m = k + 2; m <= kM; m++) if (d > 0 ? c[m].l > c[m - 2].h : c[m].h < c[m - 2].l) f = true; if (!f) continue;
      const y = c[kM + 1]; if (!y) continue; const entry = d > 0 ? y.o + SP : y.o, sl = ext - d * (0.3 * a + (d < 0 ? SP : 0)), risk = d * (entry - sl); if (!(risk > 1) || risk > 20) continue;
      const tp = entry + d * 2 * risk; let st = 'TIME', ex = null, et = null, mfe = 0;
      for (let u = kM + 1; u < Math.min(n, kM + 97); u++) { const z = c[u], l2 = d > 0 ? z.l : z.l + SP, h2 = d > 0 ? z.h : z.h + SP; mfe = Math.max(mfe, d > 0 ? z.h - entry : entry - l2);
        if (d > 0 ? l2 <= sl : h2 >= sl) { st = 'LOSS'; ex = sl; et = z.ct; break; } if (d > 0 ? h2 >= tp : l2 <= tp) { st = 'WIN'; ex = tp; et = z.ct; break; } }
      if (!et) { const z = c[Math.min(n - 1, kM + 96)]; ex = d > 0 ? z.c : z.c + SP; et = z.ct; }
      T.push({ t: y.t, d, st, pts: d * (ex - entry), risk, run15: mfe >= 15 }); busy = et; break; } }
  return T; }
const HALF = START + (c.at(-1).t - START) / 2;
const rp = (nm, T) => { const f = (G) => { const w = G.filter(x => x.st === 'WIN').length, u = G.reduce((s, x) => s + x.pts * 2, 0); return `${G.length}L ${Math.round(100 * w / (G.length || 1))}% ${(u >= 0 ? '+' : '') + Math.round(u)}$`; };
  out.push(`   ${nm.padEnd(44)} ${f(T).padEnd(16)} · ${(T.length / 345).toFixed(1)}/ngày · có chạy ≥ 15 giá theo hướng lệnh ${Math.round(100 * T.filter(x => x.run15).length / (T.length || 1))}% · SL TB ${(T.reduce((s, x) => s + x.risk, 0) / (T.length || 1)).toFixed(1)} giá | nửa đầu ${f(T.filter(x => x.t < HALF))} | nửa sau ${f(T.filter(x => x.t >= HALF))}`); };
out.push(`\nKIỂM CHUỖI DẤU HIỆU THÀNH LỆNH (12 tháng, vào khi đủ quét swing M5 → MSS M5 ≤ 1h → có FVG; SL ngoài cực trị quét + 0.3 ATR; TP 2R; 0.02 lot):`);
rp('mọi nơi', scan(false)); rp('chỉ khi có tích lũy 2h', scan(true));
rp('tích lũy + EMA34/89 M5 cùng chiều lệnh', scan(true, (k, d) => Math.sign(EM.M5[0][k] - EM.M5[1][k]) === d));
rp('tích lũy + EMA34/89 M30 cùng chiều lệnh', scan(true, (k, d) => Math.sign(EM.M30[0][k] - EM.M30[1][k]) === d));
rp('tích lũy + EMA34/89 M30 NGƯỢC chiều lệnh', scan(true, (k, d) => Math.sign(EM.M30[0][k] - EM.M30[1][k]) === -d));
rp('tích lũy + EMA M15 đan xen (|34−89| < 0.3 ATR)', scan(true, (k) => Math.abs(EM.M15[0][k] - EM.M15[1][k]) < 0.3 * A[k]));
console.log(out.join('\n'));
fs.writeFileSync('/home/claude/work/anatomy12.txt', out.join('\n'));
// ---------- (B) 30 ngày trang tua: ghi phân tích từng sóng
const F = '/home/claude/replay/data.json', D = JSON.parse(fs.readFileSync(F)); for (const w of D.waves) w.anat = anatomy(w).text;
D.anatomy = out.join('\n'); fs.writeFileSync(F, JSON.stringify(D));
