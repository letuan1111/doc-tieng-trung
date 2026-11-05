// Phương án sớm hơn: KHÔNG chờ EMA M5 cắt. M15 tăng, giá cách EMA34 M15 ≥ g ATR → đỉnh M5 QUÉT BSL → MSS M5 (đóng cửa phá đáy swing) →
// SELL LIMIT ở FVG/OB của sóng phá → TP = EMA34 M15 (hoặc EMA89), SL trên đỉnh quét. Chiều ngược lại tương tự.
import { load, ema, atr, pivots, mapHTF } from './core.mjs';
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), n = m5.length, SP = 0.35, S = Date.UTC(2026, 4, 5), FROM = Date.UTC(2025, 10, 5);
const B34 = mapHTF(m5, m15, ema(m15.map(x => x.c), 34)), B89 = mapHTF(m5, m15, ema(m15.map(x => x.c), 89)), AT = mapHTF(m5, m15, atr(m15));
const pv = pivots(m5, 2), pct = (a, b) => b ? Math.round(100 * a / b) : 0; const ev = []; let ih = 0, il = 0; const sh = [], sl = [];
for (let k = 300; k < n - 2; k++) { while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
  const x = m5[k]; if (x.t < FROM || B89[k] == null) continue; const tr = Math.sign(B34[k] - B89[k]); if (!tr) continue; const d = -tr, a = AT[k];
  let xi = k; for (let u = k - 24; u <= k; u++) if (d < 0 ? m5[u].h > m5[xi].h : m5[u].l < m5[xi].l) xi = u; if (xi === k) continue; const xP = d < 0 ? m5[xi].h : m5[xi].l;
  const gap = -d * (xP - B34[k]) / a; if (gap < 0.8) continue; // đỉnh quét cách EMA34 M15 ≥ 0.8 ATR
  const Q = (d < 0 ? sh : sl).filter(q => q.i < xi - 1 && q.i >= xi - 96).slice(-1)[0]; if (!(Q && (d < 0 ? xP > Q.p : xP < Q.p))) continue;
  const P = (d < 0 ? sl : sh).filter(q => q.i < xi && q.i >= xi - 60).slice(-1)[0]; if (!P) continue;
  if (!(d < 0 ? x.c < P.p && m5[k - 1].c >= P.p : x.c > P.p && m5[k - 1].c <= P.p)) continue; // MSS ngay nến này
  let fvg = null; for (let m = xi + 2; m <= k; m++) { if (d < 0 ? m5[m - 2].l > m5[m].h : m5[m].l > m5[m - 2].h) fvg = d < 0 ? { top: m5[m - 2].l, bot: m5[m].h } : { top: m5[m].l, bot: m5[m - 2].h }; }
  let ob = null; for (let u = xi; u >= xi - 6; u--) if (d < 0 ? m5[u].c > m5[u].o : m5[u].c < m5[u].o) { ob = { top: m5[u].h, bot: m5[u].l }; break; }
  let lo = xi; for (let u = xi; u <= k; u++) if (d < 0 ? m5[u].l < m5[lo].l : m5[u].h > m5[lo].h) lo = u; const loP = d < 0 ? m5[lo].l : m5[lo].h;
  ev.push({ k, d, xP, fvg, ob, loP, leg: Math.abs(xP - loP), a, gap }); }
function run(o) { const R = []; let busy = -1;
  for (const e of ev) { const k = e.k; if (k <= busy || e.gap < (o.g ?? 0.8)) continue; const d = e.d;
    const lvl = o.z === 'now' ? null : o.z === 'fvg' ? e.fvg && (d < 0 ? e.fvg.bot : e.fvg.top) : o.z === 'ce' ? e.fvg && (e.fvg.top + e.fvg.bot) / 2 : o.z === 'ob' ? e.ob && (d < 0 ? e.ob.bot : e.ob.top) : e.loP - d * o.z * e.leg;
    if (o.z !== 'now' && (lvl == null || (d < 0 ? lvl <= m5[k].c : lvl >= m5[k].c))) continue;
    const slP = e.xP - d * (0.5 + (d < 0 ? SP : 0)), tg = (j) => (o.tp === 89 ? B89[j] : B34[j]) - d * (o.buf ?? 1);
    let jf = -1, entry; if (o.z === 'now') { jf = k + 1; entry = d < 0 ? m5[k + 1].o : m5[k + 1].o + SP; }
    else for (let u = k + 1; u <= k + 12 && u < n; u++) { const y = m5[u]; if (d < 0 ? y.l <= tg(u - 1) : y.h + SP >= tg(u - 1)) break; if (d < 0 ? y.h >= lvl : y.l + SP <= lvl) { jf = u; entry = d < 0 ? Math.max(lvl, y.o) : Math.min(lvl, y.o + SP); break; } }
    if (jf < 0) continue; const risk = d * (entry - slP), rew = d * (tg(jf - 1) - entry); if (!(risk > 0.5) || risk > 20 || !(rew > 0) || rew / risk < (o.mr ?? 0.8)) continue;
    let res = null, ex = null, u = jf; for (; u < Math.min(n, jf + 48); u++) { const y = m5[u], tp = tg(u - 1), lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= slP : hi >= slP) { res = 'SL'; ex = slP; break; } if (u > jf && (d > 0 ? hi >= tp : lo <= tp)) { res = 'TP'; ex = tp; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'T'; ex = d > 0 ? m5[u].c : m5[u].c + SP; } busy = u; R.push({ t: m5[k].t, res, usd: d * (ex - entry) * 2, risk, rew }); }
  const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0); let eq = 0, pk = 0, dd = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  console.log(`${(U(r => r.t < S) > 0 && U(r => r.t >= S) > 0) ? '✓' : ' '} vào ${String(o.z).padEnd(4)} · TP EMA${o.tp ?? 34} M15−${o.buf ?? 1} · đỉnh cách ≥${o.g ?? 0.8} ATR`.padEnd(48) + ` ${String(R.length).padStart(4)} (${(R.length / 260).toFixed(1)}/ngày) · thắng ${pct(w, R.length)}% · TP ${(R.reduce((a, r) => a + r.rew, 0) / (R.length || 1)).toFixed(1)}/SL ${(R.reduce((a, r) => a + r.risk, 0) / (R.length || 1)).toFixed(1)} · ${U(() => true) >= 0 ? '+' : ''}${U(() => true).toFixed(0)}$ (trước ${U(r => r.t < S).toFixed(0)} · gần ${U(r => r.t >= S).toFixed(0)}) · DD ${dd.toFixed(0)}`); }
console.log(`Quét + MSS M5 ngược xu hướng M15, đỉnh/đáy quét cách EMA34 M15 ≥ 0.8 ATR: ${ev.length} lần (${(ev.length / 260).toFixed(1)}/ngày)`);
for (const z of ['now', 'fvg', 'ce', 'ob', 0.5, 0.62]) for (const tp of [34, 89]) run({ z, tp });
for (const g of [1.5, 2.5]) for (const z of ['fvg', 'ce', 0.5]) run({ z, g });
