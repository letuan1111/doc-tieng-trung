// Tua lại EA mã nguồn mở "FvgGold" (github.com/foeed/FvgGold-EA, MQL5) trên vàng, bám sát luật trong FvgGold.mq5 với thông số mặc định FvgGold.set.
// M15 · FVG 3 nến (gap ≥ 25 điểm) tuổi 2–20 nến · điểm chất lượng ≥ 50 (gap/ATR 30 · thân/biên độ nến giữa 30 · EMA50/200 H1 20 · độ mới 10 · premium/discount 10 · +20 nếu có OB)
// Chỉ vào thuận EMA50/200 H1 · killzone GMT 7–10h, 12–21h · BUY LIMIT = đáy FVG + 1.5$, SL = đáy FVG − 3$ (đối xứng SELL) · TP 1.5R · dời hoà vốn khi lời 0.5 ATR
// Lệnh chờ GTC (không hết hạn) · tối đa 1 lệnh (chờ + đang mở) · dừng ngày khi lỗ ≥ 5$ (0.01 lot). Khớp/SL/TP tính bằng nến M5; nến chạm cả SL và TP → SL.
// node research/fvggold.mjs XAU|XAU2Y [spread] [--nobe] [--expire=N]
import { load, ema, atr } from './core.mjs';
const SYM = process.argv[2] || 'XAU', SP = +(process.argv.slice(3).find(a => !a.startsWith('--')) || 0.35);
const NOBE = process.argv.includes('--nobe'), EXP = +((process.argv.find(a => a.startsWith('--expire=')) || '').split('=')[1] || 0);
const P = { pt: 0.01, minGap: 25, maxAge: 20, minAge: 2, buf: 3.0, minScore: 50, wGap: 30, wDisp: 30, wHTF: 20, wFresh: 10, wPD: 10, obImp: 1.5, obLook: 50, obMin: 10, obBonus: 20, obDist: 200, rr: 1.5, dayLoss: 5, lot: 0.01 };
const M1 = process.argv.includes('--m1');
const m5 = M1 ? JSON.parse((await import('node:fs')).readFileSync(new URL('./data/XAU1Y_m1.json', import.meta.url))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] })) : load(SYM, 'm5'), m15 = load(SYM, 'm15'), h1 = load(SYM, 'h1');
const END = Math.min(m5.at(-1).ct, m15.at(-1).ct), START = END - 365 * 864e5;
const A15 = atr(m15, 14), E50 = ema(h1.map(x => x.c), 50), E200 = ema(h1.map(x => x.c), 200);
let hj = -1; const h1At = (t) => { while (hj + 1 < h1.length && h1[hj + 1].ct <= t) hj++; return hj; };
const gmtH = (t) => new Date(t).getUTCHours(), kz = (t) => { const h = gmtH(t); return (h >= 7 && h < 10) || (h >= 12 && h < 21); };
let fvgs = [], obs = [], order = null, pos = null; const T = []; const dayPL = new Map(); const dk = (t) => Math.floor(t / 864e5);
let j5 = m5.findIndex(x => x.t >= m15[300].t);
const closeTrade = (st, p, t) => { const pts = pos.side * (p - pos.entry) - (pos.side < 0 ? SP : 0) * 0; const usd = pts * 100 * P.lot; T.push({ ...pos, state: st, exitP: p, exitT: t, pts, R: pts / pos.risk0 }); dayPL.set(dk(t), (dayPL.get(dk(t)) || 0) + usd); pos = null; };
for (let k = 300; k < m15.length - 1; k++) {
  const now = m15[k].ct; // nến k vừa đóng → EA chạy ở đầu nến k+1
  // --- quản lý lệnh trong nến k+1 bằng các nến M5
  const nx = m15[k + 1];
  // --- 1) phát hiện OB/FVG + đặt lệnh tại thời điểm now (nến 0 = k+1 đang chạy, nến 1 = k ...)
  const a = A15[k], ih = h1At(now), bias = ih < 200 ? 0 : E50[ih] > E200[ih] ? 1 : E50[ih] < E200[ih] ? -1 : 0, bid = m15[k].c, ask = bid + SP;
  const sh = (s) => m15[k + 1 - s];
  for (let i = 2; i < P.obLook + 5; i++) { const c1 = sh(i + 1), c2 = sh(i); if (!c1 || !c2) break; if (Math.abs(c2.c - c2.o) < a * P.obImp) continue;
    let ty = 0; if (c2.c > c2.o && c1.c < c1.o) ty = 1; else if (c2.c < c2.o && c1.c > c1.o) ty = -1; if (!ty) continue;
    const top = Math.max(c1.o, c1.c), bot = Math.min(c1.o, c1.c); if ((top - bot) / P.pt < P.obMin) continue;
    if (!obs.some(o => o.t === c1.t)) obs.push({ type: ty, top, bot, t: c1.t }); }
  obs = obs.filter(o => o.t >= now - P.obLook * 9e5 && !(o.type === 1 && bid < o.bot) && !(o.type === -1 && ask > o.top));
  for (let i = 3; i < P.maxAge + 10; i++) { const A = sh(i), C = sh(i - 2), B = sh(i - 1); if (!A || !C) break;
    let ty = 0, top = 0, bot = 0; if (C.l > A.h) { ty = 1; top = C.l; bot = A.h; } else if (C.h < A.l) { ty = -1; top = A.l; bot = C.h; } if (!ty) continue;
    if ((top - bot) / P.pt < P.minGap) continue; const age = i - 1; if (age < P.minAge || age > P.maxAge) continue; if (fvgs.some(f => f.t === B.t)) continue;
    let sc = Math.min((top - bot) / a, 1) * P.wGap + (B.h > B.l ? Math.abs(B.c - B.o) / (B.h - B.l) : 0) * P.wDisp + (ty === bias ? P.wHTF : 0) + (1 - age / P.maxAge) * P.wFresh;
    if (ih >= 0 && ((ty === 1 && bid - E50[ih] < 0) || (ty === -1 && bid - E50[ih] > 0))) sc += P.wPD;
    if (obs.some(o => o.type === ty && ((top >= o.bot && bot <= o.top) || (() => { const d = ty === 1 ? bot - o.top : o.bot - top; return d >= 0 && d <= P.obDist * P.pt; })()))) sc += P.obBonus;
    if (sc < P.minScore) continue; fvgs.push({ type: ty, top, bot, mid: (top + bot) / 2, t: B.t, placed: false, score: sc }); }
  fvgs = fvgs.filter(f => f.t >= now - P.maxAge * 9e5 && !(f.type === 1 && bid < f.mid) && !(f.type === -1 && ask > f.mid));
  const halted = (dayPL.get(dk(now)) || 0) <= -P.dayLoss;
  if (!halted && bias && kz(now) && now >= START && now < END) for (const f of fvgs) { if (f.placed || f.type !== bias || order || pos) continue;
    const entry = f.type === 1 ? f.bot + P.buf / 2 : f.top - P.buf / 2, sl = f.type === 1 ? f.bot - P.buf : f.top + P.buf, risk = Math.abs(entry - sl);
    if (f.type === 1 ? ask - entry < SP : entry - bid < SP) continue;
    order = { side: f.type, entry, sl, tp: entry + f.type * risk * P.rr, risk0: risk, placeT: now, score: f.score, fvgT: f.t }; f.placed = true; }
  // --- 2) mô phỏng tick bằng M5 trong nến k+1
  while (j5 < m5.length && m5[j5].t < nx.t) j5++;
  for (; j5 < m5.length && m5[j5].t < nx.ct; j5++) { const x = m5[j5], bH = x.h, bL = x.l, aH = x.h + SP, aL = x.l + SP;
    if (order && EXP && x.t >= order.placeT + EXP * 9e5) order = null;
    if (order && !pos) { const o = order, fill = o.side > 0 ? aL <= o.entry : bH >= o.entry;
      if (fill) { pos = { ...o, fillT: x.t, be: false }; order = null; if (o.side > 0 ? bL <= o.sl : aH >= o.sl) { closeTrade('LOSS', o.sl, x.ct); continue; } continue; } }
    if (pos) { const d = pos.side, hitSL = d > 0 ? bL <= pos.sl : aH >= pos.sl, hitTP = d > 0 ? bH >= pos.tp : aL <= pos.tp;
      if (hitSL) { closeTrade(pos.be ? 'BE' : 'LOSS', pos.sl, x.ct); continue; }
      if (hitTP) { closeTrade('WIN', pos.tp, x.ct); continue; }
      if (!NOBE && !pos.be && (d > 0 ? x.h - pos.entry : pos.entry - (x.l + SP)) >= 0.5 * A15[k]) { pos.sl = pos.entry + d * 2 * P.pt; pos.be = true; } }
  }
}
// ---- báo cáo
const n = T.length, w = T.filter(t => t.state === 'WIN').length, be = T.filter(t => t.state === 'BE').length, l = T.filter(t => t.state === 'LOSS').length;
const usd = (lot) => T.reduce((s, t) => s + t.pts * 100 * lot, 0), R = T.reduce((s, t) => s + t.R, 0);
let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; for (const t of T) { eq += t.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = t.R < 0 ? ls + 1 : 0; ml = Math.max(ml, ls); }
const gw = T.filter(t => t.R > 0).reduce((s, t) => s + t.R, 0), gl = -T.filter(t => t.R < 0).reduce((s, t) => s + t.R, 0);
const half = START + (END - START) / 2, sub = (G) => { const w2 = G.filter(t => t.state === 'WIN').length; return `${G.length}L thắng ${G.length ? Math.round(100 * w2 / G.length) : 0}% ${G.reduce((s, t) => s + t.R, 0).toFixed(1)}R`; };
const wait = T.reduce((s, t) => s + (t.fillT - t.placeT), 0) / (n || 1) / 36e5;
console.log(`\n=== FvgGold · ${SYM}${M1 ? ' · tua bằng nến M1' : ''} · ${new Date(START).toISOString().slice(0, 10)} → ${new Date(END).toISOString().slice(0, 10)} · spread ${SP}${NOBE ? ' · KHÔNG dời hoà vốn' : ''}${EXP ? ' · lệnh chờ hết hạn sau ' + EXP + ' nến' : ' · lệnh chờ GTC'}`);
console.log(`${n} lệnh (${(n / 12).toFixed(1)}/tháng) · TP ${w} · hoà vốn ${be} · SL ${l} · thắng ${n ? (100 * w / n).toFixed(0) : 0}% (tính cả hoà vốn là không thua: ${n ? (100 * (w + be) / n).toFixed(0) : 0}%)`);
console.log(`Tổng ${R.toFixed(1)}R · ${(R / (n || 1)).toFixed(2)}R/lệnh · PF ${gl ? (gw / gl).toFixed(2) : '∞'} · sụt ${dd.toFixed(1)}R · thua l.t. ${ml} · SL TB ${(T.reduce((s, t) => s + t.risk0, 0) / (n || 1)).toFixed(2)} giá · chờ khớp TB ${wait.toFixed(1)}h`);
console.log(`0.01 lot (như EA): ${usd(0.01) >= 0 ? '+' : ''}${usd(0.01).toFixed(0)}$ · 0.02 lot: ${usd(0.02) >= 0 ? '+' : ''}${usd(0.02).toFixed(0)}$ · nửa đầu ${sub(T.filter(t => t.fillT < half))} · nửa sau ${sub(T.filter(t => t.fillT >= half))}`);
console.log(`BUY ${sub(T.filter(t => t.side > 0))} · SELL ${sub(T.filter(t => t.side < 0))}`);

const mon = {}; for (const t of T) { const k = new Date(t.exitT + 7 * 36e5).toISOString().slice(0, 7); (mon[k] = mon[k] || []).push(t); }
console.log('Theo tháng: ' + Object.entries(mon).map(([k, G]) => `${k.slice(2)} ${G.length}L ${Math.round(100 * G.filter(t => t.state === 'WIN').length / G.length)}% ${(G.reduce((s, t) => s + t.pts, 0) * 2).toFixed(0)}$`).join(' · '));
const st = { WIN: 'TP', LOSS: 'SL', BE: 'hoà vốn' };
if (process.argv.includes('--list')) for (const t of T) console.log(new Date(t.fillT + 7 * 36e5).toISOString().slice(0, 16).replace('T', ' '), t.side > 0 ? 'BUY ' : 'SELL', t.entry.toFixed(2), 'SL', (t.side > 0 ? t.entry - t.risk0 : t.entry + t.risk0).toFixed(2), 'TP', t.tp.toFixed(2), st[t.state], (t.pts * 2 >= 0 ? '+' : '') + (t.pts * 2).toFixed(1) + '$', 'điểm ' + t.score.toFixed(0), 'chờ ' + ((t.fillT - t.placeT) / 36e5).toFixed(1) + 'h');
