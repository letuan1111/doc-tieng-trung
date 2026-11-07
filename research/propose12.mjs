// Kiểm 12 tháng các đề xuất rút ra từ phân tích 30 ngày (tua.html):
//  A. Lọc "không đuổi phá vỡ": bỏ lệnh khi giá đang ở ngoài/sát biên vùng tích lũy 2h theo chiều lệnh (dễ là phá giả)
//  B. Bỏ giờ tin Mỹ 19:30–21:30 VN · C. EMA21 bỏ SELL · D. EMA21 SL tối thiểu lớn hơn
//  E. Mô hình mới "Quét biên tích lũy": vùng 2h < 3 ATR M15 → râu M5 xuyên biên ≥ 0.3 ATR rồi đóng lại trong vùng → vào ngược ở nến sau
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, resample, atr } from './core.mjs';
const req = createRequire(import.meta.url), EMAPB = req(path.join(DIR, '..', 'tin-hieu', 'emapb.js')), EMA21 = req(path.join(DIR, '..', 'tin-hieu', 'ema21.js'));
const SP = 0.35, VN = 7 * 36e5;
const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
const c = resample(m1, 3e5), m15 = resample(m1, 9e5), n = c.length, END = c.at(-1).ct, ST = END - 365 * 864e5 + 20 * 864e5, HALF = ST + (END - ST) / 2;
const A15 = (() => { const A = atr(m15), o = new Array(n); let j = -1; for (let i = 0; i < n; i++) { while (j + 1 < m15.length && m15[j + 1].ct <= c[i].ct) j++; o[i] = A[Math.max(0, j)]; } return o; })();
const idxAt = (t) => { let lo = 0, hi = n - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
const hrm = (t) => { const d = new Date(t + VN); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const news = (t) => { const m = hrm(t); return m >= 19 * 60 + 25 && m <= 21 * 60 + 35; };
function box(k) { let hi = -Infinity, lo = Infinity; for (let u = Math.max(0, k - 24); u < k - 2; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); } return { hi, lo, acc: hi - lo < 3 * A15[k] }; }
const fin = (s) => ['WIN', 'LOSS', 'TIME'].includes(s.state);
const dayVN = (t) => new Date(t + VN).toISOString().slice(0, 10);
function seq(L, cap) { const o = []; let free = 0; const cnt = {}; for (const s of L.sort((a, b) => a.fillT - b.fillT)) { const d = dayVN(s.fillT); if (s.fillT < free || (cnt[d] || 0) >= cap) continue; o.push(s); cnt[d] = (cnt[d] || 0) + 1; free = s.exitT; } return o; }
const rep = (nm, L) => { L = L.filter(s => s.fillT >= ST); const f = (G) => { const w = G.filter(s => s.state === 'WIN').length, u = G.reduce((a, s) => a + s.pts * 2, 0); return `${String(G.length).padStart(3)}L ${String(Math.round(100 * w / (G.length || 1))).padStart(2)}% ${(u >= 0 ? '+' : '') + Math.round(u)}$`; };
  let eq = 0, pk = 0, dd = 0; for (const s of L) { eq += s.pts * 2; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  console.log(nm.padEnd(46), f(L).padEnd(18), 'DD', String(Math.round(dd)).padStart(4) + '$', '| nửa đầu', f(L.filter(s => s.fillT < HALF)).padEnd(16), '| nửa sau', f(L.filter(s => s.fillT >= HALF))); };
// chase = vào theo chiều đang phá biên vùng tích lũy (giá đóng ngoài/sát biên 15%)
const chase = (s) => { const k = idxAt(s.fillT), b = box(k); if (!b.acc || !(b.hi > b.lo)) return false; const p = c[Math.max(0, k - 1)].c, pos = (p - b.lo) / (b.hi - b.lo); return s.side > 0 ? pos > 0.85 : pos < 0.15; };
const E0 = EMAPB.run({ m5: c, m15 }, { spread: SP }).filter(s => s.tgOK && fin(s)), R0 = EMA21.run({ m5: c, m15 }, { spread: SP }).filter(fin);
console.log(`Vàng Dukascopy M5 · ${new Date(ST).toISOString().slice(0, 10)} → ${new Date(END).toISOString().slice(0, 10)} · spread ${SP} · 0.02 lot`);
console.log('--- 🔁 EMA hồi (EA EMA_Hoi_ICT)');
rep('Hiện tại', seq(E0, 4));
rep('A. bỏ lệnh đuổi phá vỡ vùng tích lũy', seq(E0.filter(s => !chase(s)), 4));
rep('B. bỏ giờ tin Mỹ 19:30–21:30', seq(E0.filter(s => !news(s.fillT)), 4));
rep('A + B', seq(E0.filter(s => !chase(s) && !news(s.fillT)), 4));
console.log('--- 🧲 Test EMA21 (EA EMA21_Test_M30)');
rep('Hiện tại', seq(R0, 6));
rep('A. bỏ lệnh đuổi phá vỡ vùng tích lũy', seq(R0.filter(s => !chase(s)), 6));
rep('B. bỏ giờ tin Mỹ', seq(R0.filter(s => !news(s.fillT)), 6));
rep('C. chỉ BUY', seq(R0.filter(s => s.side > 0), 6));
for (const mn of [3, 5]) rep(`D. SL tối thiểu ${mn} giá`, seq(EMA21.run({ m5: c, m15 }, { spread: SP, cfg: { minSL: mn } }).filter(fin), 6));
rep('A + B', seq(R0.filter(s => !chase(s) && !news(s.fillT)), 6));
// ---------- E. mô hình Quét biên tích lũy
function sweepModel(cfg) {
  const out = []; let busy = 0;
  for (let k = 30; k < n - 1; k++) { if (c[k].t < busy) continue; const a = A15[k]; if (!(a > 0)) continue;
    let hi = -Infinity, lo = Infinity; for (let u = k - 24; u < k; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); }
    const w = hi - lo; if (!(w < cfg.box * a && w >= cfg.minW)) continue;
    const x = c[k]; let d = 0;
    if (x.l <= lo - cfg.pierce * a && x.c > lo) d = 1; else if (x.h >= hi + cfg.pierce * a && x.c < hi) d = -1; if (!d) continue;
    if (cfg.hours && !cfg.hours.includes((new Date(x.ct + VN)).getUTCHours())) continue;
    if (cfg.noNews && news(x.ct)) continue;
    const y = c[k + 1], entry = d > 0 ? y.o + SP : y.o, ext = d > 0 ? x.l : x.h, sl = ext - d * (cfg.pad * a + (d < 0 ? SP : 0)), risk = d * (entry - sl);
    if (!(risk > 1) || risk > cfg.maxSL) continue;
    const tp = cfg.tp === 'box' ? (d > 0 ? hi : lo) : entry + d * cfg.rr * risk; if (d * (tp - entry) < 0.8 * risk) continue;
    const s = { side: d, fillT: y.t, entry, sl, tp, risk, state: 'OPEN' };
    for (let u = k + 1; u < Math.min(n, k + 1 + cfg.hold); u++) { const z = c[u], lo2 = d > 0 ? z.l : z.l + SP, hi2 = d > 0 ? z.h : z.h + SP;
      if (d > 0 ? lo2 <= sl : hi2 >= sl) { s.state = 'LOSS'; s.exitP = sl; s.exitT = z.ct; break; }
      if (d > 0 ? hi2 >= tp : lo2 <= tp) { s.state = 'WIN'; s.exitP = tp; s.exitT = z.ct; break; } }
    if (s.state === 'OPEN') { const z = c[Math.min(n - 1, k + cfg.hold)]; s.state = 'TIME'; s.exitP = d > 0 ? z.c : z.c + SP; s.exitT = z.ct; }
    s.pts = d * (s.exitP - entry); out.push(s); busy = s.exitT; }
  return out;
}
console.log('--- 💧 Mô hình mới: Quét biên tích lũy 2h → đóng lại → vào ngược (M5)');
const base = { box: 3, minW: 5, pierce: 0.3, pad: 0.3, maxSL: 15, rr: 2, tp: 'rr', hold: 48 };
rep('E1. mọi giờ · TP 2R', sweepModel(base));
rep('E2. TP = biên đối diện', sweepModel({ ...base, tp: 'box' }));
rep('E3. mọi giờ · TP 1.5R', sweepModel({ ...base, rr: 1.5 }));
rep('E4. giờ mạnh 7–9h, 12h, 19–22h · TP 2R', sweepModel({ ...base, hours: [7, 8, 9, 12, 19, 20, 21, 22] }));
rep('E5. E4 + bỏ giờ tin', sweepModel({ ...base, hours: [7, 8, 9, 12, 19, 20, 21, 22], noNews: true }));
rep('E6. xuyên ≥ 0.5 ATR · TP 2R', sweepModel({ ...base, pierce: 0.5 }));
console.log('--- 💧 Độ bền thông số quanh E6');
for (const pierce of [0.4, 0.5, 0.6]) for (const box of [2.5, 3, 3.5]) for (const rr of [1.5, 2, 2.5]) rep(`xuyên ${pierce} · vùng < ${box} ATR · TP ${rr}R`, sweepModel({ ...base, pierce, box, rr }));
