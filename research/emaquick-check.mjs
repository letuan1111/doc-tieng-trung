import { trade, st, fmt, m15, m30 } from './emaquick.mjs';
const P = { 'A · M15 EMA34 · chờ nến M5 bật lại · TP 1.5R': [m15, 9e5, 34, { mode: 'confirm', rr: 1.5 }], 'B · M30 EMA21 · chờ nến M5 bật lại · TP 1R': [m30, 18e5, 21, { mode: 'confirm', rr: 1 }], 'C · M30 EMA21 · chờ bật lại · +xu hướng M30 · TP 2R': [m30, 18e5, 21, { mode: 'confirm', trend: true, rr: 2 }] };
console.log(`=== ${process.env.SYM || 'XAU'} · spread ${process.env.SP || 'chuẩn'}`);
for (const [k, [C, ms, p, o]] of Object.entries(P)) { console.log(fmt(k, st(trade(C, ms, p, o))));
  if (process.env.DEEP) { for (const v of [{ run: 3 }, { run: 10 }, { pad: 0.1 }, { pad: 0.6 }, { maxPierce: 0.4 }, { maxPierce: 1.5 }, { wait: 3 }, { wait: 12 }, { maxSL: 10 }])
      console.log(fmt('    ' + JSON.stringify(v), st(trade(C, ms, p, { ...o, ...v }))));
    const R = trade(C, ms, p, o); console.log(fmt('    chỉ BUY', st(R.filter(r => r.d > 0)))); console.log(fmt('    chỉ SELL', st(R.filter(r => r.d < 0))));
    const M = {}; for (const r of R) { const q = new Date(r.t).toISOString().slice(2, 7); M[q] = M[q] || [0, 0]; M[q][0]++; M[q][1] += r.usd; } console.log('    tháng: ' + Object.entries(M).map(([q, v]) => `${q} ${v[0]}L ${v[1] >= 0 ? '+' : ''}${v[1].toFixed(0)}`).join(' · '));
    const H = {}; for (const r of R) (H[r.h] = H[r.h] || []).push(r); console.log('    giờ VN: ' + Object.keys(H).sort((a, b) => a - b).map(h => `${h}h ${H[h].reduce((a, r) => a + r.usd, 0).toFixed(0)}`).join(' · '));
    const D = {}; for (const r of R) { const q = new Date(r.t + 7 * 36e5).toISOString().slice(0, 10); D[q] = (D[q] || 0) + r.usd; } const v = Object.values(D); console.log(`    ${v.length} ngày · ngày lời ${Math.round(100 * v.filter(x => x > 0).length / v.length)}% · TB ${(v.reduce((a, x) => a + x, 0) / v.length).toFixed(1)}$/ngày · tệ nhất ${Math.min(...v).toFixed(0)}$`); } }
