// Tua lại 12 tháng bằng ĐÚNG logic EA mt5/EMA21_Test_M30.mq5 (2 ô chờ, giăng ở nến M5 đầu mỗi cây M30, đếm 6 nến M30 lại sau mỗi lệnh)
import { load, ema, atr, resample } from './core.mjs';
const SP = +(process.env.SP || 0.35), BAD = [8, 23], FROM = Date.UTC(2025, 10, 5), S = Date.UTC(2026, 4, 5);
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), C = resample(m15, 18e5), cc = C.map(x => x.c), E21 = ema(cc, 21), E34 = ema(cc, 34), E89 = ema(cc, 89), A15 = atr(m15);
const iC = new Map(C.map((x, i) => [x.t, i])), i15 = new Map(m15.map((x, i) => [x.t, i])), hr = (t) => (new Date(t).getUTCHours() + 7) % 24;
let pos = null, lastTradeBarI = -1, lastArmed = -1; const slots = [], T = [];
for (let j = 1000; j < m5.length; j++) { const y = m5[j];
  // quản lý lệnh đang mở (SL/TP trong nến; quá 12h đóng)
  if (pos) { const d = pos.d, lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
    if (d > 0 ? lo <= pos.sl : hi >= pos.sl) { pos.res = 'SL'; pos.ex = pos.sl; } else if (d > 0 ? hi >= pos.tp : lo <= pos.tp) { pos.res = 'TP'; pos.ex = pos.tp; } else if (y.ct - pos.t >= 12 * 36e5) { pos.res = 'T'; pos.ex = d > 0 ? y.c : y.c + SP; }
    if (pos.res) { pos.usd = d * (pos.ex - pos.e) * 2; T.push(pos); pos = null; } continue; } // nến đang có lệnh: EA không xét tín hiệu (nến sau mới xét)
  if (y.t < FROM) continue;
  const m30s = Math.floor(y.t / 18e5) * 18e5;
  if (y.t === m30s && m30s !== lastArmed) { lastArmed = m30s; const i = iC.get(m30s) - 1;
    if (i > 100 && !(slots.filter(z => z.on).length >= 2)) { const side = Math.sign(cc[i] - E21[i]); let run = 0;
      for (let k = i; k > i - 80 && k >= 0; k--) { if (k <= lastTradeBarI) break; if (Math.sign(cc[k] - E21[k]) !== side) break; run++; }
      const tr = Math.sign(E34[i] - E89[i]), q = i15.get(m30s) - 1, a = q >= 0 ? A15[q] : 0;
      if (side && run >= 6 && tr === side && !BAD.includes(hr(m30s)) && a > 0) slots.push({ on: true, touched: false, d: side, lvl: E21[i], a, m30: m30s, barI: i, ext: 0 }); } }
  const live = slots.filter(z => z.on).sort((p, q) => p.m30 - q.m30);
  for (const z of live) { const k = (y.t - z.m30) / 3e5;
    if (!z.touched) { if (k >= 6) { z.on = false; continue; } if (z.d > 0 ? y.l <= z.lvl : y.h >= z.lvl) { z.touched = true; z.ext = z.d > 0 ? y.l : y.h; } else continue; }
    z.ext = z.d > 0 ? Math.min(z.ext, y.l) : Math.max(z.ext, y.h); if (z.d * (z.ext - z.lvl) < -0.8 * z.a) { z.on = false; continue; }
    if (z.d * (y.c - z.lvl) > 0 && z.d * (y.c - y.o) > 0) { z.on = false; const d = z.d, e = d > 0 ? y.c + SP : y.c, sl = z.ext - d * (0.3 * z.a + (d < 0 ? SP : 0)), risk = d * (e - sl);
      if (!(risk > 0.5) || risk > 15) continue; lastTradeBarI = z.barI; for (const w of slots) w.on = false; pos = { t: y.ct, h: hr(y.ct), d, e, sl, tp: e + d * risk, risk }; break; }
    if (k >= 11) z.on = false; }
  for (let q = slots.length - 1; q >= 0; q--) if (!slots[q].on) slots.splice(q, 1); }
const w = T.filter(x => x.res === 'TP').length, U = (f) => T.filter(f).reduce((a, x) => a + x.usd, 0); let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; for (const x of T) { eq += x.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = x.usd < 0 ? ls + 1 : 0; ml = Math.max(ml, ls); }
console.log(`Logic EA · 12 tháng · spread ${SP}: ${T.length} lệnh (${(T.length / 260).toFixed(1)}/ngày) · TP ${w} · SL ${T.filter(x => x.res === 'SL').length} · hết 12h ${T.filter(x => x.res === 'T').length} · thắng ${Math.round(100 * w / T.length)}% · SL TB ${(T.reduce((a, x) => a + x.risk, 0) / T.length).toFixed(1)} giá · 0.02 lot ${U(() => true) >= 0 ? '+' : ''}${U(() => true).toFixed(0)}$ (6 tháng đầu ${U(x => x.t < S).toFixed(0)} · 6 tháng gần ${U(x => x.t >= S).toFixed(0)}) · sụt tối đa ${dd.toFixed(0)}$ · thua liên tiếp ${ml}`);
const M = {}; for (const x of T) { const q = new Date(x.t).toISOString().slice(2, 7); M[q] = M[q] || [0, 0, 0]; M[q][0]++; if (x.res === 'TP') M[q][1]++; M[q][2] += x.usd; }
console.log('Từng tháng: ' + Object.entries(M).map(([q, v]) => `${q} ${v[0]}L ${Math.round(100 * v[1] / v[0])}% ${v[2] >= 0 ? '+' : ''}${v[2].toFixed(0)}$`).join(' · '));
