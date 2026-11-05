// Kiểm chặt phần B của ematest2: lệnh LIMIT chờ test EMA M15, mô phỏng trên nến M5 (khớp bằng giá Ask/Bid đúng, nến khớp chỉ tính SL không tính TP)
import { load, ema, atr } from './core.mjs';
const c = load('XAU', 'm15'), m5 = load('XAU', 'm5'), n = c.length, E34 = ema(c.map(x => x.c), 34), E89 = ema(c.map(x => x.c), 89), A = atr(c);
const S = Date.UTC(2026, 4, 5), FROM = Date.UTC(2025, 10, 5), SP = 0.35, USD = 2;
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24, pct = (a, b) => b ? Math.round(100 * a / b) : 0, trend = (i) => Math.sign(E34[i] - E89[i]);
const i5 = new Map(m5.map((x, j) => [x.t, j]));
function trade(o) { const R = []; let busyT = 0, armed = null;
  for (let i = 100; i < n - 1; i++) { const x = c[i]; if (x.t < FROM || c[i + 1].t < busyT) { armed = null; continue; }
    const tr = trend(i);
    if (!armed) { if (tr && tr * (x.c - E34[i]) / A[i] >= (o.away ?? 1) && (!o.hours || o.hours.includes(hr(x.t)))) armed = { d: tr, from: i }; continue; }
    const d = armed.d; if (tr !== d || i - armed.from > (o.exp ?? 32)) { armed = null; continue; }
    const lvl = o.at === 89 ? E89[i] : o.at === 'mid' ? (E34[i] + E89[i]) / 2 : E34[i], a = A[i];
    const j0 = i5.get(c[i + 1].t); if (j0 == null) continue;
    // nến M15 kế tiếp = 3 nến M5; limit BUY khớp khi Ask (low+SP) ≤ lvl; SELL khớp khi Bid high ≥ lvl
    let jf = -1, entry = null; for (let j = j0; j < j0 + 3 && j < m5.length; j++) { const y = m5[j]; if (y.t >= c[i + 1].t + 9e5) break;
      if (d > 0 && y.l + SP <= lvl) { jf = j; entry = Math.min(lvl, y.o + SP); break; } if (d < 0 && y.h >= lvl) { jf = j; entry = Math.max(lvl, y.o); break; } }
    if (jf < 0) continue; armed = null;
    const sl = o.sl === '89' ? E89[i] - d * (o.slPad ?? 0.5) * a : entry - d * (o.slATR ?? 1) * a, risk = d * (entry - sl); if (!(risk > 0.5) || risk > 30) continue;
    const tp = entry + d * (o.rr ?? 1) * risk; let res = null, ex = null, j = jf;
    for (; j < Math.min(m5.length, jf + (o.hold ?? 288)); j++) { const y = m5[j], bidL = y.l, bidH = y.h, askL = y.l + SP, askH = y.h + SP;
      const hitSL = d > 0 ? bidL <= sl : askH >= sl, hitTP = d > 0 ? bidH >= tp : askL <= tp;
      if (hitSL) { res = 'SL'; ex = sl; break; } if (j > jf && hitTP) { res = 'TP'; ex = tp; break; } }
    if (!res) { j = Math.min(m5.length - 1, j); res = 'TIME'; ex = d > 0 ? m5[j].c : m5[j].c + SP; }
    busyT = m5[j].t; R.push({ t: c[i].t, h: hr(m5[jf].t), d, res, usd: d * (ex - entry) * USD, risk }); }
  return R; }
const show = (nm, R) => { const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0); let eq = 0, pk = 0, dd = 0, ls = 0, mls = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = r.usd < 0 ? ls + 1 : 0; mls = Math.max(mls, ls); }
  console.log(`${(U(r => r.t < S) > 0 && U(r => r.t >= S) > 0) ? '✓' : ' '} ${nm.padEnd(46)} ${String(R.length).padStart(4)} lệnh (${(R.length / 260).toFixed(1)}/ngày) · thắng ${String(pct(w, R.length)).padStart(2)}% · SL TB ${(R.reduce((a, r) => a + r.risk, 0) / (R.length || 1)).toFixed(1)} giá · ${U(() => true) >= 0 ? '+' : ''}${U(() => true).toFixed(0)}$ (trước ${U(r => r.t < S).toFixed(0)} · gần ${U(r => r.t >= S).toFixed(0)}) · DD ${dd.toFixed(0)}$ · thua liên tiếp ${mls}`); return R; };
export { trade, show };
if (process.argv[1].endsWith('ematest3.mjs')) {
  console.log('== Limit chờ test EMA M15 theo xu hướng (giá đã rời EMA34 ≥ 1 ATR, hết hạn 8h, giữ ≤ 24h) — mô phỏng M5, 0.02 lot');
  for (const at of [34, 'mid', 89]) for (const [sn, so] of [['SL 1 ATR', { slATR: 1 }], ['SL 1.5 ATR', { slATR: 1.5 }], ['SL ngoài EMA89 + 0.5 ATR', { sl: '89' }]]) for (const rr of [1, 1.5, 2])
    show(`${at === 'mid' ? 'giữa 34–89' : 'EMA' + at} · ${sn} · TP ${rr}R`, trade({ at, ...so, rr }));
  console.log('\n== Bản chọn: limit EMA34 · SL 1 ATR · TP 1R — độ nhạy');
  for (const away of [0.5, 1, 1.5, 2]) show(`giá rời EMA34 ≥ ${away} ATR`, trade({ at: 34, slATR: 1, rr: 1, away }));
  for (const exp of [8, 16, 64]) show(`hết hạn ${exp / 4}h`, trade({ at: 34, slATR: 1, rr: 1, exp }));
  for (const s of [0.8, 1.2]) show(`SL ${s} ATR`, trade({ at: 34, slATR: s, rr: 1 }));
  const R = trade({ at: 34, slATR: 1, rr: 1 }); const H = {}; for (const r of R) (H[r.h] = H[r.h] || []).push(r);
  console.log(' · theo giờ khớp (VN): ' + Object.keys(H).sort((a, b) => a - b).map(h => `${h}h ${H[h].length}L ${pct(H[h].filter(r => r.res === 'TP').length, H[h].length)}% ${H[h].reduce((a, r) => a + r.usd, 0).toFixed(0)}$`).join(' · '));
  show('chỉ BUY', R.filter(r => r.d > 0)); show('chỉ SELL', R.filter(r => r.d < 0));
  const M = {}; for (const r of R) { const k = new Date(r.t).toISOString().slice(0, 7); M[k] = (M[k] || 0) + r.usd; } console.log(' · theo tháng: ' + Object.entries(M).map(([k, v]) => `${k.slice(2)} ${v.toFixed(0)}`).join(' · '));
}
