// EMA34/89 M15 ở trạng thái nào thì giá HỒI LÊN (hoặc xuống) ≥ 12 giá? + setup ICT/SMC theo đó, TP ≥ 12 giá — vàng Dukascopy M15
import fs from 'node:fs'; import { load, ema, atr, pivots } from './core.mjs';
const c = load('XAU2Y', 'm15'), n = c.length, e34 = ema(c.map(x => x.c), 34), e89 = ema(c.map(x => x.c), 89), A = atr(c), pv = pivots(c, 2);
const SP = 0.35, TGT = 12, END = c.at(-1).t, Y2 = END - 365 * 864e5, Y1 = Y2 - 365 * 864e5;
// ---------- A: bảng trạng thái — từ mỗi nến M15 đóng, giá chạm +12 trước hay −12 trước (≤ 24h)?
const first = (k) => { const p = c[k].c; for (let u = k + 1; u < Math.min(n, k + 96); u++) { const up = c[u].h >= p + TGT, dn = c[u].l <= p - TGT; if (up && dn) return 0; if (up) return 1; if (dn) return -1; } return 0; };
const binD = [-Infinity, -30, -20, -12, -6, -2, 2, 6, 12, 20, 30, Infinity], lab = ['< −30', '−30…−20', '−20…−12', '−12…−6', '−6…−2', '−2…+2', '+2…+6', '+6…+12', '+12…+20', '+20…+30', '> +30'];
const tbl = {}; const yr = (t) => t >= Y2 ? 'y2' : t >= Y1 ? 'y1' : null;
for (let k = 200; k < n - 96; k++) { const y = yr(c[k].t); if (!y) continue; const tr = e34[k] > e89[k] ? 'up' : 'dn', d = c[k].c - e89[k]; let b = 0; while (d >= binD[b + 1]) b++;
  const key = `${y}|${tr}|${b}`, f = first(k), o = tbl[key] || (tbl[key] = { n: 0, up: 0, dn: 0 }); o.n++; if (f > 0) o.up++; else if (f < 0) o.dn++; }
const A_out = [];
for (const tr of ['up', 'dn']) for (let b = 0; b < lab.length; b++) { const a = tbl[`y1|${tr}|${b}`] || { n: 0, up: 0, dn: 0 }, z = tbl[`y2|${tr}|${b}`] || { n: 0, up: 0, dn: 0 };
  A_out.push({ tr, bin: lab[b], n1: a.n, up1: a.n ? +(100 * a.up / a.n).toFixed(0) : null, dn1: a.n ? +(100 * a.dn / a.n).toFixed(0) : null, n2: z.n, up2: z.n ? +(100 * z.up / z.n).toFixed(0) : null, dn2: z.n ? +(100 * z.dn / z.n).toFixed(0) : null }); }
console.table(A_out);
// ---------- B: setup ICT/SMC + EMA → lệnh TP 12 giá
// d: hướng lệnh. Điều kiện EMA tuỳ biến thể. Kích hoạt ICT: nến M15 quét đáy (đỉnh) swing M15 gần nhất (≤ 6h, còn nguyên) rồi ĐÓNG lại trên (dưới) — hoặc CHoCH: đóng qua đỉnh swing gần nhất sau khi vừa quét ≤ 4 nến
function sim(name, cond, opt = {}) {
  const T = []; let busy = -1, lastSweep = { 1: null, '-1': null };
  for (let k = 200; k < n - 2; k++) { const x = c[k], a = A[k];
    for (const d of [1, -1]) {
      const sw = (d > 0 ? pv.L : pv.H).filter(q => q.conf <= k - 1 && q.i >= k - 24 && q.i < k).slice(-1)[0];
      if (sw) { let fresh = true; for (let u = sw.i + 1; u < k; u++) if (d > 0 ? c[u].l < sw.p : c[u].h > sw.p) { fresh = false; break; }
        if (fresh && (d > 0 ? x.l < sw.p && x.c > sw.p : x.h > sw.p && x.c < sw.p)) lastSweep[d] = { k, ext: d > 0 ? x.l : x.h }; }
      const ls = lastSweep[d]; if (!ls || k - ls.k > 4) continue;
      let trig = false; if (opt.trig === 'sweep') trig = ls.k === k; else { const opp = (d > 0 ? pv.H : pv.L).filter(q => q.conf <= k && q.i < k && q.i >= k - 32).slice(-1)[0]; trig = opp && d * (x.c - opp.p) > 0 && d * (c[k - 1].c - opp.p) <= 0; }
      if (!trig || k <= busy || !cond(k, d)) continue;
      const entry = x.c + (d > 0 ? SP : 0); let sl = ls.ext - d * 0.2 * a + (d < 0 ? SP : 0), risk = d * (entry - sl); const mn = opt.minSL || 4; if (risk < mn) { risk = mn; sl = entry - d * mn; } if (risk > (opt.maxSL || 15)) continue;
      const tp = entry + d * TGT; let res = 0, u = k + 1;
      for (; u < Math.min(n, k + 96); u++) { const lo = d > 0 ? c[u].l : c[u].l + SP, hi = d > 0 ? c[u].h : c[u].h + SP; if (d > 0 ? lo <= sl : hi >= sl) { res = -risk; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = TGT; break; } }
      if (u >= Math.min(n, k + 96)) { u = Math.min(n - 1, k + 95); res = d * ((d > 0 ? c[u].c : c[u].c + SP) - entry); }
      T.push({ t: x.t, d, res, risk, win: res >= TGT, u }); busy = u; lastSweep[d] = null; }
  }
  const part = (lo, hi) => { const P = T.filter(z => z.t >= lo && z.t < hi), w = P.filter(z => z.win).length, usd = P.reduce((s, z) => s + z.res * 2, 0); return { n: P.length, perDay: +(P.length / 260).toFixed(2), win: P.length ? Math.round(100 * w / P.length) : 0, usd: Math.round(usd), sl: P.length ? +(P.reduce((s, z) => s + z.risk, 0) / P.length).toFixed(1) : 0 }; };
  const r = { name, y1: part(Y1, Y2), y2: part(Y2, END + 1) }; console.log(name.padEnd(58), 'Y1', JSON.stringify(r.y1), '| Y2', JSON.stringify(r.y2)); return { ...r, T };
}
const tr = (k, d) => d * (e34[k] - e89[k]) > 0, dist89 = (k, d) => d * (c[k].c - e89[k]), dist34 = (k, d) => d * (c[k].c - e34[k]);
const res = [];
res.push(sim('1. ICT thuần: quét swing M15 + CHoCH (không EMA)', () => true));
res.push(sim('2. + EMA34/89 cùng chiều lệnh', tr));
res.push(sim('3. + cùng chiều, giá hồi về quanh EMA34–89 (±6 giá EMA89)', (k, d) => tr(k, d) && Math.abs(dist89(k, d)) <= 6));
res.push(sim('4. + cùng chiều, giá còn trên EMA89 nhưng dưới EMA34 (vùng hồi)', (k, d) => tr(k, d) && dist34(k, d) <= 0 && dist89(k, d) >= -3));
res.push(sim('5. Ngược chiều EMA, giá căng xa EMA89 ≥ 20 giá (hồi kỹ thuật)', (k, d) => !tr(k, d) && dist89(k, d) <= -20));
res.push(sim('6. Ngược chiều EMA, căng xa EMA89 ≥ 30 giá', (k, d) => !tr(k, d) && dist89(k, d) <= -30));
res.push(sim('7. Cùng chiều, khoảng cách EMA34–89 ≥ 5 giá + hồi về EMA34', (k, d) => tr(k, d) && Math.abs(e34[k] - e89[k]) >= 5 && dist34(k, d) <= 2 && dist89(k, d) >= -3));
fs.writeFileSync('/tmp/ema-hoi.json', JSON.stringify({ A: A_out, res: res.map(({ T, ...r }) => r), T: Object.fromEntries(res.map(r => [r.name, r.T.map(z => [z.t, z.res])])) }));
console.log('--- kích hoạt chỉ cần quét + đóng lại (không chờ CHoCH)');
const res2 = [];
res2.push(sim('S1. ICT quét swing M15 + đóng lại (không EMA)', () => true, { trig: 'sweep' }));
res2.push(sim('S2. + EMA cùng chiều', tr, { trig: 'sweep' }));
res2.push(sim('S3. EMA cùng chiều, giá hồi QUA EMA89 ≥ 12 giá', (k, d) => tr(k, d) && dist89(k, d) <= -12, { trig: 'sweep' }));
res2.push(sim('S4. EMA cùng chiều, giá hồi QUA EMA89 ≥ 20 giá', (k, d) => tr(k, d) && dist89(k, d) <= -20, { trig: 'sweep' }));
res2.push(sim('S5. EMA cùng chiều, hồi về sát EMA34–89 (|giá−EMA89| ≤ 6)', (k, d) => tr(k, d) && Math.abs(dist89(k, d)) <= 6, { trig: 'sweep' }));
res2.push(sim('S6. Ngược EMA, giá căng xa EMA89 ≥ 20 (bắt đáy/đỉnh)', (k, d) => !tr(k, d) && dist89(k, d) <= -20, { trig: 'sweep' }));
res2.push(sim('C3. CHoCH + EMA cùng chiều, giá hồi QUA EMA89 ≥ 12', (k, d) => tr(k, d) && dist89(k, d) <= -12));
const J = JSON.parse(fs.readFileSync('/tmp/ema-hoi.json')); J.res2 = res2.map(({ T, ...r }) => r); Object.assign(J.T, Object.fromEntries(res2.map(r => [r.name, r.T.map(z => [z.t, z.res])]))); fs.writeFileSync('/tmp/ema-hoi.json', JSON.stringify(J));
console.log('--- SL tối thiểu 10–12 giá (TP 12 ≈ 1:1)');
const res3 = [];
res3.push(sim('W1. quét + đóng lại, không EMA, SL≥12', () => true, { trig: 'sweep', minSL: 12, maxSL: 20 }));
res3.push(sim('W2. + EMA cùng chiều, SL≥12', tr, { trig: 'sweep', minSL: 12, maxSL: 20 }));
res3.push(sim('W3. EMA cùng chiều + hồi về EMA34–89 (≤6), SL≥12', (k, d) => tr(k, d) && Math.abs(dist89(k, d)) <= 6, { trig: 'sweep', minSL: 12, maxSL: 20 }));
res3.push(sim('W4. EMA cùng chiều + hồi QUA EMA89 ≥ 12, SL≥12', (k, d) => tr(k, d) && dist89(k, d) <= -12, { trig: 'sweep', minSL: 12, maxSL: 20 }));
res3.push(sim('W5. Ngược EMA, căng xa EMA89 ≥ 20, SL≥12', (k, d) => !tr(k, d) && dist89(k, d) <= -20, { trig: 'sweep', minSL: 12, maxSL: 20 }));
res3.push(sim('W6. CHoCH + EMA cùng chiều, SL≥12', tr, { minSL: 12, maxSL: 20 }));
const J2 = JSON.parse(fs.readFileSync('/tmp/ema-hoi.json')); J2.res3 = res3.map(({ T, ...r }) => r); Object.assign(J2.T, Object.fromEntries(res3.map(r => [r.name, r.T.map(z => [z.t, z.res])]))); fs.writeFileSync('/tmp/ema-hoi.json', JSON.stringify(J2));
