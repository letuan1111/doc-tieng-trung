// Chiến lược của Letuan: giá chạy theo EMA34/89 M30 → M5 PHÁ VỠ swing (BOS) theo xu hướng → giá QUAY LẠI TEST mức vừa phá → vào lệnh.
// SL = đáy swing low (BUY) / đỉnh swing high (SELL) của chân phá vỡ · TP = đỉnh swing high (BUY) / đáy swing low (SELL) · chỉ vào khi RR ≥ 1.2.
// node research/bosretest.mjs XAU|BTC|XAU2Y → bảng + data/bosretest_{SYM}.json
import fs from 'node:fs'; import path from 'node:path';
import { DIR, load, ema, atr, pivots, mapHTF, resample } from './core.mjs';
const SYM = process.argv[2] || 'XAU', BTC = SYM === 'BTC', NM = BTC ? 'BTC' : 'Vàng';
const SP = BTC ? 20 : 0.35, USD = BTC ? 0.02 : 2, dp = BTC ? 0 : 2; // 0.02 lot: vàng 2$/giá · BTC 0.02$/giá
let m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15');
if (SYM === 'XAU2Y') { const F = m5.at(-1).t - 365 * 864e5; m5 = m5.filter(x => x.t >= F - 30 * 864e5); m15 = m15.filter(x => x.t >= F - 30 * 864e5); }
const n = m5.length, m30 = resample(m15, 18e5), c30 = m30.map(x => x.c);
const E34 = mapHTF(m5, m30, ema(c30, 34)), E89 = mapHTF(m5, m30, ema(c30, 89)), C30 = mapHTF(m5, m30, c30), A15 = mapHTF(m5, m15, atr(m15));
const VN = 7 * 36e5, hr = (t) => new Date(t + VN).getUTCHours(), pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const T0 = m5[400].t, T1 = m5[n - 1].t, DAYS = (T1 - T0) / 864e5 * 5 / 7, Q = (t) => Math.min(3, Math.floor(4 * (t - T0) / (T1 - T0)));

// xu hướng M30: EMA34 > EMA89 và nến M30 đóng trên EMA34 → chỉ BUY (ngược lại SELL)
const trend = (k) => { const d = Math.sign(E34[k] - E89[k]); if (!d || E34[k] == null) return 0; return d * (C30[k] - E34[k]) > 0 ? d : 0; };

// 1. tìm BOS M5 theo xu hướng
function setups(L) {
  const pv = pivots(m5, L), out = []; let ih = 0, il = 0; const H = [], Lw = []; const brokenH = new Set(), brokenL = new Set();
  for (let k = 400; k < n - 1; k++) { while (ih < pv.H.length && pv.H[ih].conf <= k - 1) H.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k - 1) Lw.push(pv.L[il++]);
    const d = trend(k), y = m5[k]; if (!d) continue;
    const S = d > 0 ? H : Lw, B = d > 0 ? brokenH : brokenL; const q = S.length ? S[S.length - 1] : null; if (!q || B.has(q.i) || k - q.i > 144) continue;
    if (d * (y.c - q.p) <= 0) continue; B.add(q.i);
    // swing của chân phá: đáy thấp nhất (BUY) / đỉnh cao nhất (SELL) từ swing bị phá tới nến phá
    let ext = d > 0 ? Infinity : -Infinity; for (let u = q.i; u <= k; u++) ext = d > 0 ? Math.min(ext, m5[u].l) : Math.max(ext, m5[u].h);
    // đỉnh/đáy swing cũ hơn phía trên (BUY) / dưới (SELL) mức phá = thanh khoản mục tiêu
    const older = S.filter(z => z.i < q.i && d * (z.p - q.p) > 0 && z.i >= k - 2016).map(z => z.p);
    out.push({ k, d, lvl: q.p, ext, a: A15[k], older }); }
  return out;
}
// 2. chờ retest → vào lệnh → mô phỏng M5
function run(Ss, o) {
  const R = []; let busy = -1, miss = 0, noRR = 0, inv = 0, noTest = 0;
  for (const s of Ss) { if (s.k <= busy) continue; const d = s.d, lvl = s.lvl;
    const sl = s.ext - d * (o.pad * s.a + (d < 0 ? SP : 0));
    let legX = d > 0 ? m5[s.k].h : m5[s.k].l, fill = -1, entry = null;
    for (let u = s.k + 1; u < Math.min(n, s.k + 1 + o.wait); u++) { const y = m5[u];
      const touched = d > 0 ? y.l + SP <= lvl + o.tol * s.a : y.h >= lvl - o.tol * s.a;
      if (touched) { if (o.entry === 'limit') { fill = u; entry = d > 0 ? Math.min(lvl + o.tol * s.a, y.o + SP) : Math.max(lvl - o.tol * s.a, y.o); break; }
        // chạm + xác nhận: nến M5 đóng lại phía xu hướng của mức phá, thân cùng chiều
        if (d * (y.c - lvl) > 0 && d * (y.c - y.o) > 0) { fill = u; entry = d > 0 ? y.c + SP : y.c; break; } }
      if (d > 0 ? y.l <= sl : y.h + SP >= sl) { inv++; fill = -2; break; } // thủng swing trước khi vào
      legX = d > 0 ? Math.max(legX, y.h) : Math.min(legX, y.l); }
    if (fill === -2) continue; if (fill < 0) { noTest++; continue; }
    const risk = d * (entry - sl); if (!(risk > 0.2 * s.a) || risk > 4 * s.a) continue;
    let tp;
    if (o.tp === 'leg') tp = legX - d * (d < 0 ? -SP : 0); // đỉnh chân phá (BUY) / đáy chân phá (SELL)
    else if (o.tp === 'older') { const c = s.older.filter(p => d * (p - entry) > 0).sort((a, b) => d * (a - b))[0]; tp = c != null ? c : null; }
    else if (o.tp === 'best') { const c = [legX, ...s.older].filter(p => d * (p - entry) >= o.minRR * risk).sort((a, b) => d * (a - b))[0]; tp = c != null ? c : null; }
    else tp = entry + d * o.tp * risk;
    if (tp == null) { noRR++; continue; }
    const rr = d * (tp - entry) / risk; if (typeof o.tp !== 'number' && rr < o.minRR) { noRR++; continue; }
    if (o.maxRR && rr > o.maxRR) tp = entry + d * o.maxRR * risk;
    let res = null, ex = null, u = fill;
    if (o.entry === 'limit') { const y = m5[u]; if (d > 0 ? y.l <= sl : y.h + SP >= sl) { res = 'SL'; ex = sl; } u++; } else u++;
    for (; !res && u < Math.min(n, fill + 1 + 288); u++) { const y = m5[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
      if (d > 0 ? lo <= sl : hi >= sl) { res = 'SL'; ex = sl; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = 'TP'; ex = tp; break; } }
    if (!res) { u = Math.min(n - 1, u); res = 'TIME'; ex = d > 0 ? m5[u].c : m5[u].c + SP; }
    busy = u; const r = d * (ex - entry) / risk;
    R.push({ t: m5[fill].t, h: hr(m5[fill].t), d, res, r, usd: d * (ex - entry) * USD, risk, rr: d * (tp - entry) / risk, min: (m5[u].t - m5[fill].t) / 6e4, entry, sl, tp }); }
  R.meta = { miss, noRR, inv, noTest }; return R;
}
const ROWS = [];
function show(nm, R, keep) {
  const w = R.filter(r => r.res === 'TP').length, U = R.reduce((a, r) => a + r.usd, 0), qs = [0, 1, 2, 3].map(q => R.filter(r => Q(r.t) === q));
  let eq = 0, pk = 0, dd = 0, ls = 0, mls = 0; for (const r of R) { eq += r.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = r.usd < 0 ? ls + 1 : 0; mls = Math.max(mls, ls); }
  const qU = qs.map(x => x.reduce((a, r) => a + r.usd, 0)), good = qU.filter(v => v > 0).length, avgR = R.reduce((a, r) => a + r.r, 0) / (R.length || 1), rr = R.reduce((a, r) => a + r.rr, 0) / (R.length || 1);
  const be = rr > 0 ? Math.round(100 / (1 + rr)) : 0; // tỷ lệ thắng hoà vốn
  const hours = [...Array(24).keys()].map(h => { const x = R.filter(r => r.h === h); return { h, n: x.length, tp: x.filter(r => r.res === 'TP').length, sl: x.filter(r => r.res === 'SL').length, usd: x.reduce((a, r) => a + r.usd, 0) }; });
  const row = { nm, n: R.length, perDay: R.length / DAYS, win: pct(w, R.length), be, rr, avgR, usd: U, dd, mls, good, q: qs.map((x, i) => ({ n: x.length, win: pct(x.filter(r => r.res === 'TP').length, x.length), usd: qU[i] })), hours, meta: R.meta,
    risk: R.reduce((a, r) => a + r.risk, 0) / (R.length || 1), min: R.length ? R.map(r => r.min).sort((a, b) => a - b)[R.length >> 1] : 0, buy: R.filter(r => r.d > 0), sell: R.filter(r => r.d < 0) };
  row.buyW = pct(row.buy.filter(r => r.res === 'TP').length, row.buy.length); row.sellW = pct(row.sell.filter(r => r.res === 'TP').length, row.sell.length);
  row.buyU = row.buy.reduce((a, r) => a + r.usd, 0); row.sellU = row.sell.reduce((a, r) => a + r.usd, 0); row.buy = row.buy.length; row.sell = row.sell.length;
  if (keep) ROWS.push(row);
  console.log(`${good === 4 ? '✓✓' : good === 3 ? '✓ ' : '  '} ${nm.padEnd(56)} ${String(R.length).padStart(4)}L ${row.perDay.toFixed(1)}/ngày · thắng ${String(row.win).padStart(2)}% (hoà vốn ${be}%) · RR ${rr.toFixed(2)} · ${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R/lệnh · SL TB ${row.risk.toFixed(dp)} · ${U >= 0 ? '+' : ''}${U.toFixed(0)}$ · DD ${dd.toFixed(0)} · thua l.t. ${mls} | ${row.q.map(q => `${q.win}%/${q.usd >= 0 ? '+' : ''}${q.usd.toFixed(0)}`).join(' · ')}`);
  return row;
}
const base = { pad: 0, tol: 0, wait: 36, entry: 'limit', tp: 'best', minRR: 1.2 };
export { setups, run, show, ROWS, DAYS, T0, T1, m5, SP, USD, NM, dp };
if ((process.argv[1] || '').endsWith('bosretest.mjs')) {
console.log(`######## ${NM} (${SYM}) · ${new Date(T0).toISOString().slice(0, 10)} → ${new Date(T1).toISOString().slice(0, 10)} · spread ${SP} · 0.02 lot · cột cuối: 4 quý 3 tháng (thắng%/USD)`);
const S3 = setups(3), S2 = setups(2), S5 = setups(5);
console.log(`BOS M5 theo xu hướng M30: swing 3 nến ${S3.length} lần (${(S3.length / DAYS).toFixed(1)}/ngày)`);
console.log('\n== A. Luật gốc: limit tại mức phá · SL đáy/đỉnh swing · TP đỉnh/đáy swing gần nhất có RR ≥ 1.2');
const main = show('A1 swing 3 nến · chờ test ≤ 3h', run(S3, base), true);
show('A2 swing 2 nến (swing nhỏ hơn)', run(S2, base)); show('A3 swing 5 nến (swing lớn hơn)', run(S5, base));
console.log(`   (A1: bỏ ${main.meta.noTest} lần không quay lại test, ${main.meta.inv} lần thủng swing trước khi test, ${main.meta.noRR} lần RR < 1.2)`);
console.log('\n== B. Cách vào khi test');
show('B1 chạm mức phá + nến M5 xác nhận rồi mới vào', run(S3, { ...base, entry: 'conf' }), true);
show('B2 limit cách mức phá 0.2 ATR (vào sớm hơn)', run(S3, { ...base, tol: 0.2 }));
show('B3 chờ test ≤ 1h', run(S3, { ...base, wait: 12 })); show('B4 chờ test ≤ 6h', run(S3, { ...base, wait: 72 }));
console.log('\n== C. TP');
show('C1 TP = đỉnh/đáy chân phá (bắt buộc RR ≥ 1.2)', run(S3, { ...base, tp: 'leg' }));
show('C2 TP = đỉnh/đáy swing cũ phía trước (thanh khoản)', run(S3, { ...base, tp: 'older' }));
show('C3 TP cố định 1.2R', run(S3, { ...base, tp: 1.2 }), true); show('C4 TP cố định 1R', run(S3, { ...base, tp: 1 }));
show('C5 TP cố định 2R', run(S3, { ...base, tp: 2 })); show('C6 TP swing gần nhất RR ≥ 1.2, tối đa 2R', run(S3, { ...base, maxRR: 2 }), true);
console.log('\n== D. SL');
show('D1 SL đáy/đỉnh swing + 0.2 ATR M15', run(S3, { ...base, pad: 0.2 })); show('D2 SL + 0.5 ATR M15', run(S3, { ...base, pad: 0.5 }));
fs.writeFileSync(path.join(DIR, 'data', `bosretest_${SYM}.json`), JSON.stringify({ sym: SYM, from: T0, to: T1, rows: ROWS }));
}
