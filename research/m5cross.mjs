// Ý tưởng của Letuan: M15 (+M30) đang tăng nhỏ → trên M5 EMA34 cắt xuống EMA89, trước đó đã QUÉT BSL, đã có cấu trúc giảm nhỏ (MSS)
// → đặt SELL LIMIT ở vùng ICT/SMC M5 (FVG / OB / OTE) khi giá hồi lên → TP = giá test EMA34/89 M15 phía dưới. Chiều ngược lại tương tự (BUY).
import { load, ema, atr, pivots, mapHTF, resample } from './core.mjs';
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), m30 = resample(m15, 18e5), n = m5.length, SP = 0.35, S = Date.UTC(2026, 4, 5), FROM = Date.UTC(2025, 10, 5);
const c5 = m5.map(x => x.c), A34 = ema(c5, 34), A89 = ema(c5, 89);
const B34 = mapHTF(m5, m15, ema(m15.map(x => x.c), 34)), B89 = mapHTF(m5, m15, ema(m15.map(x => x.c), 89)), AT = mapHTF(m5, m15, atr(m15));
const T34 = mapHTF(m5, m30, ema(m30.map(x => x.c), 34)), T89 = mapHTF(m5, m30, ema(m30.map(x => x.c), 89));
const pv = pivots(m5, 2), hr = (t) => (new Date(t).getUTCHours() + 7) % 24, pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const ev = []; let ih = 0, il = 0; const sh = [], sl = [], pos = { above34: 0, mid: 0, below89: 0 };
for (let k = 300; k < n - 2; k++) {
  while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
  if (m5[k].t < FROM || B89[k] == null || T89[k] == null) continue;
  const s0 = Math.sign(A34[k - 1] - A89[k - 1]), s1 = Math.sign(A34[k] - A89[k]); if (!s1 || s0 === s1) continue;
  const d = s1, up15 = Math.sign(B34[k] - B89[k]), up30 = Math.sign(T34[k] - T89[k]); if (up15 !== -d) continue; // M5 cắt NGƯỢC xu hướng M15
  const x = m5[k], a = AT[k];
  // vị trí giá lúc cắt so với EMA M15
  const r34 = d * (B34[k] - x.c), r89 = d * (B89[k] - x.c); if (r34 > 0) pos.above34++; else if (r89 > 0) pos.mid++; else pos.below89++;
  // đỉnh (SELL) / đáy (BUY) của nhịp trước khi cắt, trong 60 nến (5h)
  let xi = k; for (let u = k - 60; u <= k; u++) if (d < 0 ? m5[u].h > m5[xi].h : m5[u].l < m5[xi].l) xi = u; const xP = d < 0 ? m5[xi].h : m5[xi].l;
  const Q = (d < 0 ? sh : sl).filter(q => q.i < xi - 1 && q.i >= xi - 96).slice(-1)[0], swept = !!(Q && (d < 0 ? xP > Q.p : xP < Q.p)); // quét BSL/SSL
  // MSS: sau đỉnh, giá đóng cửa phá đáy swing gần nhất trước đỉnh (SELL)
  const P = (d < 0 ? sl : sh).filter(q => q.i < xi && q.i >= xi - 60).slice(-1)[0]; let mssK = -1;
  if (P) for (let u = xi + 1; u <= k; u++) if (d < 0 ? m5[u].c < P.p : m5[u].c > P.p) { mssK = u; break; }
  // chân sóng giảm (thấp nhất từ đỉnh tới lúc cắt)
  let lo = xi; for (let u = xi; u <= k; u++) if (d < 0 ? m5[u].l < m5[lo].l : m5[u].h > m5[lo].h) lo = u; const loP = d < 0 ? m5[lo].l : m5[lo].h, leg = Math.abs(xP - loP);
  // FVG giảm gần nhất trong sóng đỉnh→cắt, OB = nến tăng cuối cùng trước sóng giảm
  let fvg = null; for (let m = xi + 2; m <= k; m++) { const top = d < 0 ? m5[m - 2].l : m5[m].l, bot = d < 0 ? m5[m].h : m5[m - 2].h; if (d < 0 ? top > bot : m5[m].l > m5[m - 2].h) fvg = d < 0 ? { top, bot } : { top: m5[m].l, bot: m5[m - 2].h }; }
  let ob = null; for (let u = xi; u >= xi - 6; u--) if (d < 0 ? m5[u].c > m5[u].o : m5[u].c < m5[u].o) { ob = { top: m5[u].h, bot: m5[u].l }; break; }
  ev.push({ k, d, up30: up30 === -d, swept, mss: mssK >= 0, fvg, ob, xP, loP, leg, a, h: hr(x.t), r34, r89 });
}
const N = pos.above34 + pos.mid + pos.below89;
console.log(`M5 EMA34/89 cắt NGƯỢC xu hướng M15: ${N} lần (${(N / 260).toFixed(1)}/ngày). Lúc cắt giá ở đâu so với EMA M15 (SELL: EMA ở dưới?):`);
console.log(`  chưa chạm EMA34 M15 ${pct(pos.above34, N)}% · nằm giữa EMA34 và EMA89 ${pct(pos.mid, N)}% · đã qua cả EMA89 ${pct(pos.below89, N)}%\n`);
// mô phỏng LIMIT ở vùng → TP EMA M15 (cập nhật mỗi nến M15 đóng), SL ngoài đỉnh quét
function run(L, o) { const R = []; let busy = -1;
  for (const e of L) { const k = e.k; if (k <= busy) continue; const d = e.d;
    let lvl; if (o.z === 'fvgEdge') lvl = e.fvg && (d < 0 ? e.fvg.bot : e.fvg.top); else if (o.z === 'fvgCE') lvl = e.fvg && (e.fvg.top + e.fvg.bot) / 2;
    else if (o.z === 'ob') lvl = e.ob && (d < 0 ? e.ob.bot : e.ob.top); else if (o.z === 'ob50') lvl = e.ob && (e.ob.top + e.ob.bot) / 2;
    else if (o.z === 'ote') lvl = e.loP - d * 0.62 * e.leg; else if (o.z === 'eq') lvl = e.loP - d * 0.5 * e.leg; else if (o.z === 'ema5') lvl = A34[k]; else lvl = d < 0 ? m5[k + 1].o : m5[k + 1].o + SP;
    if (lvl == null) continue; if (o.z !== 'now' && (d < 0 ? lvl <= m5[k].c : lvl >= m5[k].c)) { if (o.z !== 'ema5') continue; }
    const slP = e.xP - d * ((o.pad ?? 0.5) + (d < 0 ? SP : 0));
    let jf = o.z === 'now' ? k + 1 : -1, entry = o.z === 'now' ? lvl : null;
    if (jf < 0) for (let u = k + 1; u <= k + (o.exp ?? 24) && u < n; u++) { const y = m5[u], tgt = tgtOf(u - 1, d, o);
      if (d < 0 ? y.l <= tgt : y.h + SP >= tgt) break; // giá đã về mục tiêu trước khi khớp → huỷ
      if (d < 0 ? y.h >= lvl : y.l + SP <= lvl) { jf = u; entry = d < 0 ? Math.max(lvl, y.o) : Math.min(lvl, y.o + SP); break; } }
    if (jf < 0) continue; const risk = d * (entry - slP); if (!(risk > 0.5) || risk > (o.maxSL ?? 30)) continue;
    const tp0 = tgtOf(jf - 1, d, o), rew0 = d * (tp0 - entry); if (!(rew0 > 0) || rew0 / risk < (o.minRR ?? 0.7)) continue;
    let res = null, ex = null, u = jf; for (; u < Math.min(n, jf + (o.hold ?? 72)); u++) { const y = m5[u], tp = tgtOf(u - 1, d, o), lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= slP : hi >= slP) { res = 'SL'; ex = slP; break; } if (u > jf && (d > 0 ? hi >= tp : lo <= tp)) { res = 'TP'; ex = tp; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'T'; ex = d > 0 ? m5[u].c : m5[u].c + SP; } busy = u;
    R.push({ t: m5[k].t, h: hr(m5[jf].t), d, res, usd: d * (ex - entry) * 2, risk, rew: rew0 }); }
  return R; }
function tgtOf(j, d, o) { const b = o.buf ?? 0.5; const raw = o.tp === '89' ? B89[j] : o.tp === 'mid' ? (B34[j] + B89[j]) / 2 : o.tp === 'near' ? (d < 0 ? Math.min(B34[j], B89[j]) : Math.max(B34[j], B89[j])) : B34[j]; return raw - d * b; }
const show = (nm, R) => { const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0); let eq = 0, pk = 0, dd = 0, ls = 0, mls = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = r.usd < 0 ? ls + 1 : 0; mls = Math.max(mls, ls); }
  const line = `${(U(r => r.t < S) > 0 && U(r => r.t >= S) > 0) ? '✓' : ' '} ${nm.padEnd(52)} ${String(R.length).padStart(4)} (${(R.length / 260).toFixed(1)}/ngày) · thắng ${String(pct(w, R.length)).padStart(2)}% · TP ${(R.reduce((a, r) => a + r.rew, 0) / (R.length || 1)).toFixed(1)}/SL ${(R.reduce((a, r) => a + r.risk, 0) / (R.length || 1)).toFixed(1)} · ${U(() => true) >= 0 ? '+' : ''}${U(() => true).toFixed(0)}$ (trước ${U(r => r.t < S).toFixed(0)} · gần ${U(r => r.t >= S).toFixed(0)}) · DD ${dd.toFixed(0)} · thua l.t. ${mls}`;
  console.log(line); return { R, U: U(() => true), a: U(r => r.t < S), b: U(r => r.t >= S), n: R.length, line }; };
const ZN = { now: 'vào ngay', fvgEdge: 'mép FVG', fvgCE: 'giữa FVG (CE)', ob: 'mép OB', ob50: 'giữa OB', ote: 'OTE 62%', eq: '50% sóng', ema5: 'EMA34 M5' };
const TPN = { '34': 'EMA34 M15', '89': 'EMA89 M15', mid: 'giữa EMA34–89 M15', near: 'EMA M15 gần nhất' };
const CTX = { 'quét + MSS': e => e.swept && e.mss, 'quét + MSS + M30 cùng': e => e.swept && e.mss && e.up30, 'quét + MSS + FVG': e => e.swept && e.mss && e.fvg, 'chỉ M5 cắt': () => true };
const all = [];
for (const [cn, cf] of Object.entries(CTX)) for (const z of Object.keys(ZN)) for (const tp of Object.keys(TPN)) for (const pad of [0.5, 1.5]) {
  const o = { z, tp, pad }; const R = run(ev.filter(cf), o); if (R.length < 25) continue; const w = R.filter(r => r.res === 'TP').length, U = (f) => R.filter(f).reduce((a, r) => a + r.usd, 0);
  let eq = 0, pk = 0, dd = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  all.push({ k: `${cn} · ${ZN[z]} · TP ${TPN[tp]} · SL đỉnh/đáy+${pad}`, cf, o, n: R.length, wr: w / R.length, U: U(() => true), a: U(r => r.t < S), b: U(r => r.t >= S), dd }); }
const pr = (r) => console.log(`${(r.a > 0 && r.b > 0) ? '✓' : ' '} ${r.k.padEnd(76)} ${String(r.n).padStart(4)} (${(r.n / 260).toFixed(1)}/ngày) · thắng ${Math.round(100 * r.wr)}% · ${r.U >= 0 ? '+' : ''}${r.U.toFixed(0)}$ (trước ${r.a.toFixed(0)} · gần ${r.b.toFixed(0)}) · DD ${r.dd.toFixed(0)}`);
console.log(`== ${all.length} cấu hình (≥25 lệnh) · lời cả 2 nửa: ${all.filter(r => r.a > 0 && r.b > 0).length}`);
console.log('-- Top theo nửa yếu hơn'); [...all].sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b)).slice(0, 15).forEach(pr);
console.log('-- Thắng cao nhất'); [...all].sort((x, y) => y.wr - x.wr).slice(0, 6).forEach(pr);
console.log('-- Theo vùng vào (quét + MSS, TP EMA M15 gần nhất, SL +0.5)'); for (const z of Object.keys(ZN)) show(ZN[z], run(ev.filter(CTX['quét + MSS']), { z, tp: 'near', pad: 0.5 }));
export { ev, run, show, CTX };
