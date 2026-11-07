// Phân tích cho trang tua: (1) vì sao lệnh dính SL, (2) vì sao mỗi sóng ≥ 15 giá bot không vào — bối cảnh giờ, tích lũy, phá/quét/fake, EMA, điều kiện EA không đạt
// Đọc /home/claude/replay/data.json (do replay-data.mjs tạo), ghi thêm trường phân tích và in thống kê.
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, resample, ema, atr, pivots } from './core.mjs';
const F = '/home/claude/replay/data.json', D = JSON.parse(fs.readFileSync(F)), VN = 7 * 36e5, SP = 0.35;
const EPB = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'emapb.js')).CFG, E21C = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'ema21.js')).CFG;
const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
const c = resample(m1, 3e5), m15 = resample(m1, 9e5), m30 = resample(m15, 18e5), n = c.length;
const i5 = new Map(c.map((x, j) => [x.t, j])), idxAt = (t) => { let lo = 0, hi = n - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
const mapHTF = (H, vals) => { const out = new Array(n).fill(null); let j = -1; for (let i = 0; i < n; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) out[i] = vals[j]; } return out; };
const cl30 = m30.map(x => x.c), E34 = mapHTF(m30, ema(cl30, 34)), E89 = mapHTF(m30, ema(cl30, 89)), E21 = mapHTF(m30, ema(cl30, 21)), AT = mapHTF(m15, atr(m15));
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24, fmt = (t) => new Date(t + VN).toISOString().slice(5, 16).replace('T', ' ').replace(/^(\d\d)-(\d\d)/, '$2/$1');
const sess = (h) => h >= 7 && h < 13 ? 'phiên Á' : h >= 13 && h < 19 ? 'phiên Âu' : h >= 19 ? 'phiên Mỹ' : 'đêm (0–7h)';
const news = (t) => { const d = new Date(t + VN), m = d.getUTCHours() * 60 + d.getUTCMinutes(); return (m >= 19 * 60 + 25 && m <= 20 * 60 + 50) || (m >= 20 * 60 + 55 && m <= 21 * 60 + 35) || (m >= 1 * 60 + 55 && m <= 2 * 60 + 30); };
// PDH/PDL theo ngày UTC + swing M15 đã xác nhận
const day = new Map(); for (const x of m15) { const k = Math.floor(x.t / 864e5), v = day.get(k); if (!v) day.set(k, { h: x.h, l: x.l }); else { v.h = Math.max(v.h, x.h); v.l = Math.min(v.l, x.l); } }
const pdAt = (t) => day.get(Math.floor(t / 864e5) - 1) || day.get(Math.floor(t / 864e5) - 3) || null;
const pv15 = pivots(m15, 3);
// ---------- chẩn đoán EMA hồi (bám đúng emapb.js): bước xa nhất đạt được tại nến k theo chiều d
const pv5 = pivots(c, EPB.L); const SH = [], SL = []; { let ih = 0, il = 0; for (let k = 0; k < n; k++) { while (ih < pv5.H.length && pv5.H[ih].conf <= k) ih++; while (il < pv5.L.length && pv5.L[il].conf <= k) il++; SH[k] = ih; SL[k] = il; } }
const STEP_E = ['ngược xu hướng EMA34/89 M30', 'giá không hồi về EMA34 M30', 'hồi quá sâu, thủng EMA89 M30', 'chưa phá cấu trúc M5 (MSS)', 'điểm hồi không quét thanh khoản (SSL/BSL)', 'nhịp phá không có FVG M5', 'không có Order Block tại điểm hồi', 'SL > 30 giá', 'ngoài giờ EA (0,8,11,12,14,17,20,21h)', 'đủ điều kiện'];
function diagE(k, d) {
  const a = AT[k]; if (!(a > 0) || E34[k] == null) return 0;
  if (!(d > 0 ? E34[k] > E89[k] : E34[k] < E89[k])) return 0;
  let pi = k - 1; for (let u = Math.max(1, k - EPB.look); u < k; u++) if (d > 0 ? c[u].l < c[pi].l : c[u].h > c[pi].h) pi = u;
  const pP = d > 0 ? c[pi].l : c[pi].h; if (E34[pi] == null) return 0;
  const touch = d > 0 ? pP <= E34[pi] + EPB.touch * a : pP >= E34[pi] - EPB.touch * a, deep = d > 0 ? pP < E89[pi] - EPB.deep * a : pP > E89[pi] + EPB.deep * a;
  if (!touch) return 1; if (deep) return 2;
  const hs = pv5.H.slice(0, SH[k]), ls = pv5.L.slice(0, SL[k]);
  const P = (d > 0 ? hs : ls).filter(q => q.i < pi && q.i >= pi - 30).slice(-1)[0]; if (!P) return 3;
  if (!(d > 0 ? c[k].c > P.p && c[k - 1].c <= P.p : c[k].c < P.p && c[k - 1].c >= P.p)) return 3;
  const prev = (d > 0 ? ls : hs).filter(q => q.i < pi && q.i >= pi - 40).slice(-1)[0]; if (!(prev && (d > 0 ? pP < prev.p : pP > prev.p))) return 4;
  let f = null; for (let m = pi + 2; m <= k; m++) { const bot = d > 0 ? c[m - 2].h : c[m].h, top = d > 0 ? c[m].l : c[m - 2].l; if (top > bot) f = 1; } if (!f) return 5;
  let ob = null; for (let u = pi; u >= Math.max(0, pi - 3); u--) if (d * (c[u].c - c[u].o) < 0) { ob = 1; break; } if (!ob) return 6;
  const risk = Math.abs(c[k].c - (pP - d * (EPB.slATR * a + SP))); if (risk > EPB.maxSL) return 7;
  if (!EPB.tgHours.includes(hr(c[k].t))) return 8;
  return 9;
}
// ---------- chẩn đoán Test EMA21 (bám ema21.js) tại cây M30 bắt đầu ở thời điểm t
const cl = m30.map(x => x.c), e21 = ema(cl, 21), e34 = ema(cl, 34), e89 = ema(cl, 89), at30 = (() => { const A = atr(m15); let j = -1; return m30.map(x => { while (j + 1 < m15.length && m15[j + 1].ct <= x.ct) j++; return A[j]; }); })();
const runN = []; { let side = 0, r = 0; for (let i = 0; i < m30.length; i++) { const s = Math.sign(m30[i].c - e21[i]); if (s === side) r++; else { side = s; r = 1; } runN[i] = { side, r }; } }
const STEP_R = ['ngược xu hướng EMA34/89 M30', 'chưa đủ 6 nến M30 cùng phía EMA21', 'giờ cấm (8h, 23h)', 'giá không chạm EMA21 M30', 'râu xuyên EMA21 quá sâu / không có nến M5 bật lại', 'SL ngoài 0.5–15 giá', 'đủ điều kiện'];
function diagR(i, d) { // i = cây M30 đã đóng, xét cây i+1
  if (i < 120 || i + 1 >= m30.length) return 0; const a = at30[i], lvl = e21[i];
  if (Math.sign(e34[i] - e89[i]) !== d) return 0;
  if (runN[i].side !== d || runN[i].r < E21C.run) return 1;
  if (E21C.badHours.includes(hr(m30[i + 1].t))) return 2;
  const j0 = i5.get(m30[i + 1].t); if (j0 == null) return 3; const jEnd = j0 + 6; let touched = -1, ex = null;
  for (let j = j0; j < jEnd + E21C.wait && j < n; j++) { const y = c[j];
    if (touched < 0) { if (j >= jEnd) return 3; if (d > 0 ? y.l <= lvl : y.h >= lvl) { touched = j; ex = d > 0 ? y.l : y.h; } else continue; }
    ex = d > 0 ? Math.min(ex, y.l) : Math.max(ex, y.h); if (d * (ex - lvl) < -E21C.maxPierce * a) return 4;
    if (d * (y.c - lvl) > 0 && d * (y.c - y.o) > 0) { const entry = d > 0 ? y.c + SP : y.c, risk = d * (entry - (ex - d * (E21C.pad * a + (d < 0 ? SP : 0)))); return risk > E21C.minSL && risk <= E21C.maxSL ? 6 : 5; } }
  return touched < 0 ? 3 : 4;
}
const i30At = (t) => { let lo = 0, hi = m30.length - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (m30[m].ct <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
const trades = D.trades, openAt = (t) => trades.filter(x => x.t <= t && t < x.exitT);
// ---------- bối cảnh trước một mốc thời gian t (giá p, chiều d)
function context(t, d, p) {
  const k = idxAt(t), a = AT[k] || 3, b0 = idxAt(t - 2 * 36e5), b1 = Math.max(b0, idxAt(t - 10 * 6e4));
  let hi = -Infinity, lo = Infinity; for (let u = b0; u < b1; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); }
  const rng = hi - lo, acc = rng < 3 * a, trend = Math.sign((E34[k] || 0) - (E89[k] || 0)), dist = E34[k] != null ? (c[k].c - E34[k]) / a : 0;
  // trước đó 2h giá đi ra sao
  const move2h = c[k].c - c[b0].o, prior = acc ? `tích lũy hẹp ${rng.toFixed(1)} giá (${(rng / a).toFixed(1)} ATR) trong 2h` : Math.abs(move2h) >= 15 ? `2h trước đã ${move2h > 0 ? 'tăng' : 'giảm'} ${Math.abs(move2h).toFixed(1)} giá` : `dao động ${rng.toFixed(1)} giá trong 2h`;
  return { k, a, hi, lo, rng, acc, trend, dist, prior, h: hr(t) };
}
// ---------- (1) SÓNG ≥ 15 giá
const WCAT = {}, WREASON = {}, add = (o, k) => (o[k] = (o[k] || 0) + 1);
for (const w of D.waves) {
  const ctx = context(w.t0, w.d, w.p0), k0 = ctx.k, pd = pdAt(w.t0);
  // kiểu khởi đầu: quét/fake (đỉnh/đáy sóng vượt biên 2h trước, PDH/PDL hoặc swing M15 rồi quay đầu) · phá tích lũy · hồi về EMA · khác
  const swM15 = (w.d > 0 ? pv15.L : pv15.H).filter(q => m15[q.i + 3] && m15[q.i + 3].ct <= w.t0 && w.t0 - m15[q.i].t < 864e5);
  const sweptSwing = swM15.some(q => (w.d > 0 ? w.p0 < q.p : w.p0 > q.p));
  const sweptPD = pd && isFinite(ctx.lo) && (w.d > 0 ? w.p0 < pd.l && ctx.lo >= pd.l : w.p0 > pd.h && ctx.hi <= pd.h); // lần đầu phá qua PDH/PDL rồi quay lại
  const sweptRange = isFinite(ctx.hi) && (w.d > 0 ? w.p0 < ctx.lo : w.p0 > ctx.hi);
  const brk = isFinite(ctx.hi) && w.p0 >= ctx.lo && w.p0 <= ctx.hi && (w.d > 0 ? w.p1 > ctx.hi : w.p1 < ctx.lo);
  const nearEMA = Math.abs(((w.d > 0 ? w.p0 : w.p0) - (E34[k0] || w.p0)) / ctx.a) <= 0.5;
  const kx = idxAt(w.t1 > w.t0 ? w.t0 : w.t0), lim = (w.d > 0 ? ctx.lo : ctx.hi);
  const pierce = isFinite(lim) ? (w.d > 0 ? lim - w.p0 : w.p0 - lim) : 0;
  let back = false; for (let u = kx; u <= kx + 3 && u < n; u++) if (w.d > 0 ? c[u].c > lim : c[u].c < lim) { back = true; break; }
  const fake = pierce >= 0.3 * ctx.a && back;
  let start;
  if (sweptPD && back) start = `quét ${w.d > 0 ? 'PDL' : 'PDH'} rồi đóng lại (phá giả)`;
  else if (fake && ctx.acc) start = `phá giả ${w.d > 0 ? 'đáy' : 'đỉnh'} vùng tích lũy rồi đảo chiều`;
  else if (fake) start = `quét ${w.d > 0 ? 'đáy (SSL)' : 'đỉnh (BSL)'} 2h rồi đóng lại (phá giả)`;
  else if (pierce > 0 && !ctx.acc) start = `đảo chiều chữ V sau khi đã ${w.d > 0 ? 'giảm' : 'tăng'} dài (cạn lực)`;
  else if (pierce > 0) start = `rũ ${w.d > 0 ? 'đáy' : 'đỉnh'} tích lũy rồi đảo chiều (không đóng lại ngay)`;
  else if (brk && ctx.acc) start = 'phá vỡ vùng tích lũy (phá thật)';
  else if (brk) start = `phá ${w.d > 0 ? 'đỉnh' : 'đáy'} 2h trước, đi tiếp`;
  else if (nearEMA) start = 'bật từ EMA34 M30';
  else start = 'đi tiếp sau nhịp hồi ngắn (trong biên)';
  const withT = ctx.trend === w.d, nw = news(w.t0) || news(w.t1);
  w.ctx = { start, prior: ctx.prior, trend: withT ? 'cùng xu hướng EMA M30' : 'ngược xu hướng EMA M30', dist: +ctx.dist.toFixed(1), sess: sess(ctx.h), news: nw, speed: +(w.size / Math.max(5, w.min) * 60).toFixed(0) };
  add(WCAT, start);
  // lý do bot không vào: xét cửa sổ vào lệnh hợp lý = từ 1h trước điểm đầu sóng đến khi sóng đi được 1/3
  if (w.caught.length) { w.why = 'Bot có vào lệnh cùng chiều'; add(WREASON, 'đã có lệnh'); continue; }
  const tA = w.t0 - 36e5, tB = w.t0 + (w.t1 - w.t0) / 3; let bestE = 0, bestR = 0, busy = null, bestEk = null;
  for (let k = idxAt(tA); k <= idxAt(tB); k++) { const s = diagE(k, w.d); if (s > bestE) { bestE = s; bestEk = k; } }
  for (let i = i30At(tA); m30[i] && m30[i].t <= tB; i++) { const s = diagR(i - 1, w.d); if (s > bestR) bestR = s; }
  const ob = openAt(w.t0) .concat(openAt(tB)); if (ob.length) busy = ob[0];
  const opp = trades.filter(x => x.side !== w.d && x.t >= tA && x.t <= w.t1);
  let main;
  if (opp.length) main = `bot vào NGƯỢC chiều sóng (${opp.map(x => x.ea === 'EMA_Hoi_ICT' ? 'EMA hồi' : 'EMA21').join(', ')} ${opp[0].side > 0 ? 'BUY' : 'SELL'})`;
  else if (bestE === 9 || bestR === 6) main = busy ? 'đủ điều kiện nhưng bot đang giữ lệnh khác' : 'đủ điều kiện nhưng quá muộn (sau 1/3 sóng) hoặc vượt số lệnh/ngày';
  else if (bestE === 0 && bestR === 0) main = 'ngược xu hướng EMA34/89 M30 (cả 2 EA chỉ đánh thuận xu hướng)';
  else main = bestE >= 1 ? 'EMA hồi: ' + STEP_E[bestE] : 'EMA21: ' + STEP_R[bestR];
  w.why = main; w.whyE = STEP_E[bestE]; w.whyR = STEP_R[bestR];
  add(WREASON, main.replace(/\(.*\)/, '').trim());
}
// ---------- (2) LỆNH dính SL
const SCAT = {}, SALL = [];
for (const t of trades) {
  if (t.state !== 'LOSS') continue;
  const d = t.side, ctx = context(t.t, d, t.entry), kE = idxAt(t.t), kX = idxAt(t.exitT - 1), risk = Math.abs(t.entry - t.sl);
  let mfe = 0; for (let u = kE + 1; u <= kX; u++) mfe = Math.max(mfe, d > 0 ? c[u].h - t.entry : t.entry - (c[u].l + SP));
  // sau khi dính SL 6h: có chạm TP cũ không, hay đi ngược tiếp
  let hitTP = null, further = 0; for (let u = kX + 1; u < n && c[u].t < t.exitT + 6 * 36e5; u++) { if (hitTP == null && (d > 0 ? c[u].h >= t.tp : c[u].l + SP <= t.tp)) hitTP = c[u].t; further = Math.max(further, d > 0 ? t.sl - c[u].l : c[u].h - t.sl); }
  const wv = D.waves.find(w => w.d === -d && w.t1 >= t.t && w.t0 <= t.exitT);
  const nw = news(t.exitT - 3e5) || news(t.t), held = Math.round((t.exitT - t.t) / 6e4), retTP = hitTP != null && hitTP < t.exitT + 6 * 36e5;
  const ent = d > 0 ? (t.entry - ctx.lo) / Math.max(1e-9, ctx.hi - ctx.lo) : (ctx.hi - t.entry) / Math.max(1e-9, ctx.hi - ctx.lo);
  const tags = [];
  if (retTP) tags.push('bị quét SL rồi giá chạy đúng hướng tới TP cũ (SL quá sát / stop hunt)');
  else if (further >= 15) tags.push(`đảo chiều thật: sau SL giá đi ngược thêm ${further.toFixed(0)} giá`);
  else tags.push('giá đi ngang/nhiễu quanh entry rồi chạm SL');
  if (mfe >= risk) tags.push(`đã lời ${(mfe / risk).toFixed(1)}R rồi quay đầu (không dời hoà vốn)`);
  else if (mfe < 0.3 * risk) tags.push('vừa vào đã đi ngược ngay');
  if (nw) tags.push('giờ tin Mỹ (19:30–21:30 VN)');
  if (ctx.acc) tags.push('vào giữa vùng tích lũy hẹp');
  if (wv) tags.push(`gặp sóng ngược ${wv.size} giá (${wv.ctx ? wv.ctx.start : ''})`);
  if (ent > 0.85) tags.push(`vào ${d > 0 ? 'BUY gần đỉnh' : 'SELL gần đáy'} biên 2h (đuổi giá)`);
  t.why2 = `${sess(ctx.h)} ${ctx.h}h · trước đó: ${ctx.prior} · giữ ${held} phút · lãi tạm tối đa ${mfe.toFixed(1)} giá (${(mfe / risk).toFixed(1)}R) · ${tags.join(' · ')}`;
  t.slCat = tags[0].split(':')[0].split(' (')[0];
  add(SCAT, t.slCat); SALL.push({ t, tags, ctx, mfe, risk, retTP, nw, wv });
}
const top = (o, tot, skip) => Object.entries(o).filter(([k]) => k !== skip).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<li>${k}: <b>${v}</b> (${Math.round(100 * v / tot)}%)</li>`).join('');
{ const W = D.waves, Wm = W.filter(w => !w.caught.length), S = trades.filter(t => t.state === 'LOSS');
  D.summary = `<p><b>${W.length} sóng ≥ 15 giá</b> — bot vào cùng chiều ${W.length - Wm.length}, bỏ lỡ ${Wm.length}. Sóng cùng xu hướng EMA M30: ${W.filter(w => /cùng/.test(w.ctx.trend)).length} (bot bắt ${W.filter(w => /cùng/.test(w.ctx.trend) && w.caught.length).length}); ngược xu hướng: ${W.filter(w => /ngược/.test(w.ctx.trend)).length} (bot bắt 0).</p>
  <p><b>Sóng bắt đầu từ đâu:</b></p><ul>${top(WCAT, W.length)}</ul><p><b>Vì sao bot không vào (${Wm.length} sóng bỏ lỡ):</b></p><ul>${top(WREASON, Wm.length, 'đã có lệnh')}</ul>
  <p><b>${S.length} lệnh dính SL:</b></p><ul>${top(SCAT, S.length)}</ul>`; }
fs.writeFileSync(F, JSON.stringify(D));
// ---------- in thống kê
const pr = (o, tot) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `   ${String(v).padStart(3)} (${Math.round(100 * v / tot)}%)  ${k}`).join('\n');
const W = D.waves, Wm = W.filter(w => !w.caught.length);
console.log(`SÓNG ≥ 15 giá: ${W.length} · bot vào cùng chiều ${W.length - Wm.length} · bỏ lỡ ${Wm.length}`);
console.log('Kiểu khởi đầu sóng:\n' + pr(WCAT, W.length));
console.log('Lý do bot không vào (sóng bỏ lỡ):\n' + pr(Object.fromEntries(Object.entries(WREASON).filter(([k]) => k !== 'đã có lệnh')), Wm.length));
const by = (f) => { const o = {}; for (const w of W) { const k = f(w); o[k] = o[k] || [0, 0, 0]; o[k][0]++; o[k][1] += w.size; if (w.caught.length) o[k][2]++; } return Object.entries(o).map(([k, v]) => `   ${k}: ${v[0]} sóng, TB ${(v[1] / v[0]).toFixed(1)} giá, bot bắt ${v[2]}`).join('\n'); };
console.log('Theo phiên:\n' + by(w => w.ctx.sess)); console.log('Theo xu hướng:\n' + by(w => w.ctx.trend)); console.log('Giờ tin Mỹ:\n' + by(w => w.ctx.news ? 'trong giờ tin' : 'ngoài giờ tin'));
console.log('Trước sóng:\n' + by(w => /tích lũy/.test(w.ctx.prior) ? 'tích lũy hẹp' : /đã (tăng|giảm)/.test(w.ctx.prior) ? 'đã chạy mạnh 2h trước' : 'dao động bình thường'));
const ss = SALL.length; console.log(`\nLỆNH DÍNH SL: ${ss} (EMA hồi ${SALL.filter(x => x.t.ea === 'EMA_Hoi_ICT').length}, EMA21 ${SALL.filter(x => x.t.ea !== 'EMA_Hoi_ICT').length})`);
console.log(pr(SCAT, ss));
const cnt = (f) => SALL.filter(f).length;
console.log(`   đã lời ≥1R rồi quay đầu: ${cnt(x => x.mfe >= x.risk)} · vừa vào đi ngược ngay: ${cnt(x => x.mfe < 0.3 * x.risk)} · giờ tin Mỹ: ${cnt(x => x.nw)} · vào trong tích lũy: ${cnt(x => x.ctx.acc)} · gặp sóng ngược ≥15: ${cnt(x => x.wv)} · SL TB ${(SALL.reduce((a, x) => a + x.risk, 0) / ss).toFixed(1)} giá`);
for (const x of SALL) console.log(`   ${fmt(x.t.t)} ${x.t.ea === 'EMA_Hoi_ICT' ? 'EMA hồi' : 'EMA21 '} ${x.t.side > 0 ? 'BUY ' : 'SELL'} ${x.t.entry} SL ${x.t.sl} → ${x.t.why2}`);
