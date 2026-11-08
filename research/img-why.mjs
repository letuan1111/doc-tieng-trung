// Vì sao chiến lược trong ảnh (ICT + SMC + EMA34/89 M5) ít lệnh và hay dính SL — tua 5 tháng vàng M5
import fs from 'node:fs'; import { run, FUN, BASE, TF, m1, at1, START, END, SP, VN, EMA, mapTo } from './img-strat.mjs';
import { atr, pivots } from './core.mjs';
const c = TF.m5, n = c.length, A5 = atr(c), [e34, e89] = EMA(c);
const [h1a, h1b] = EMA(TF.h1).map(v => mapTo(c, TF.h1, v)), [m15a, m15b] = EMA(TF.m15).map(v => mapTo(c, TF.m15, v));
const i5 = (t) => { let lo = 0, hi = n - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].t <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
const fmt = (t) => new Date(t + VN).toISOString().slice(5, 16).replace('T', ' ').replace(/^(\d\d)-(\d\d)/, '$2/$1');
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24, sess = (h) => h >= 7 && h < 13 ? 'phiên Á' : h >= 13 && h < 19 ? 'phiên Âu' : h >= 19 ? 'phiên Mỹ' : 'đêm';
const news = (t) => { const d = new Date(t + VN), m = d.getUTCHours() * 60 + d.getUTCMinutes(); return m >= 19 * 60 + 25 && m <= 21 * 60 + 35; };
const R = run('m5', BASE), F = FUN.m5, T = R.filter(x => x.st !== 'NOFILL'), NF = R.filter(x => x.st === 'NOFILL');
const out = [];
// ---------- 1) vì sao ít lệnh: phễu
out.push(`(1) VÌ SAO ÍT LỆNH — phễu 5 tháng M5 (${new Date(START + VN).toISOString().slice(0, 10)} → ${new Date(END + VN).toISOString().slice(0, 10)}), mỗi nến xét cả 2 chiều, bỏ qua khi đang có lệnh:`);
out.push(`   nến có bias EMA34/89 M15 đúng chiều: ${F.bias} → có QUÉT SSL/BSL hợp lệ: ${F.sweep} → có CHoCH/MSS ≤ 12 nến: ${F.mss} (${Math.round(100 * F.mss / F.sweep)}%) → nến phá có displacement mạnh: ${F.disp} → có FVG ≥ 0.1 ATR: ${F.fvg} → có ĐỈNH/ĐÁY THANH KHOẢN cách ≥ 2R để đặt TP: ${F.tp} (${Math.round(100 * F.tp / F.fvg)}%) → đặt limit ${F.placed} → KHỚP ${F.filled}`);
const nfw = {}; for (const x of NF) nfw[x.why] = (nfw[x.why] || 0) + 1;
out.push(`   ${NF.length} lệnh limit không khớp: ${Object.entries(nfw).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
// ---------- 2) vì sao dính SL
const L = [];
for (const x of T) {
  const k = i5(x.t), d = x.d, risk = x.risk, a = A5[k];
  let mfe = 0, j = x.fillJ, jEnd = j; for (; j < m1.length && m1[j].ct <= x.et; j++) { const z = m1[j]; mfe = Math.max(mfe, d > 0 ? z.h - x.entry : x.entry - (z.l + SP)); jEnd = j; }
  let hitTP = false, further = 0, reSweep = false; for (let u = jEnd + 1; u < m1.length && m1[u].t < x.et + 4 * 36e5; u++) { const z = m1[u]; if (!hitTP) further = Math.max(further, d > 0 ? x.sl - z.l : z.h + SP - x.sl); if (d > 0 ? z.h >= x.tp : z.l + SP <= x.tp) { hitTP = true; break; } }
  const held = Math.round((x.et - x.t) / 6e4), h1 = Math.sign(h1a[k] - h1b[k]) === d, m5 = Math.sign(e34[k] - e89[k]) === d, side34 = d * (x.entry - e34[k]) / a;
  const slATR = risk / a, nw = news(x.t) || news(x.et), sweepDepth = Math.abs(x.lv - x.ext);
  x.an = { mfe, mfeR: mfe / risk, held, hitTP, further, h1, m5, side34, slATR, nw, sweepDepth, h: hr(x.t), fillMin: Math.round((x.t - x.placeT) / 6e4) };
  if (x.pts < 0) L.push(x);
}
const N = L.length, P = (f) => `${L.filter(f).length}/${N} (${Math.round(100 * L.filter(f).length / N)}%)`, W = T.filter(x => x.pts > 0), PW = (f) => `${Math.round(100 * W.filter(f).length / (W.length || 1))}%`;
out.push(`\n(2) VÌ SAO DÍNH SL — ${N} lệnh thua / ${T.length} lệnh (so với ${W.length} lệnh thắng):`);
out.push(`   SL quá sát: SL TB ${(L.reduce((s, x) => s + x.risk, 0) / N).toFixed(1)} giá = ${(L.reduce((s, x) => s + x.an.slATR, 0) / N).toFixed(1)} ATR M5 (lệnh thắng ${(W.reduce((s, x) => s + x.an.slATR, 0) / (W.length || 1)).toFixed(1)} ATR) · SL < 1.5 ATR M5: thua ${P(x => x.an.slATR < 1.5)}, thắng ${PW(x => x.an.slATR < 1.5)}`);
out.push(`   Dính SL rồi giá vẫn chạy tới TP cũ trong 4h (bị quét SL / SL quá sát): ${P(x => x.an.hitTP)}`);
out.push(`   Đảo chiều thật (sau SL đi ngược thêm ≥ 10 giá, không về TP): ${P(x => !x.an.hitTP && x.an.further >= 10)}`);
out.push(`   Vừa khớp đã đi ngược (lời tạm < 0.5R): ${P(x => x.an.mfeR < 0.5)} · từng lời ≥ 1R rồi quay đầu: ${P(x => x.an.mfeR >= 1)}`);
out.push(`   Dính SL nhanh (≤ 30 phút sau khi khớp): ${P(x => x.an.held <= 30)} · thời gian giữ TB ${Math.round(L.reduce((s, x) => s + x.an.held, 0) / N)} phút`);
out.push(`   EMA34/89 H1 ngược chiều lệnh: thua ${P(x => !x.an.h1)}, thắng ${PW(x => !x.an.h1)} · EMA34/89 M5 ngược chiều: thua ${P(x => !x.an.m5)}, thắng ${PW(x => !x.an.m5)}`);
out.push(`   Giờ tin Mỹ 19:30–21:30: thua ${P(x => x.an.nw)}, thắng ${PW(x => x.an.nw)} · theo phiên (thua): ${['đêm', 'phiên Á', 'phiên Âu', 'phiên Mỹ'].map(s => s + ' ' + L.filter(x => sess(x.an.h) === s).length).join(', ')} · (thắng): ${['đêm', 'phiên Á', 'phiên Âu', 'phiên Mỹ'].map(s => s + ' ' + W.filter(x => sess(x.an.h) === s).length).join(', ')}`);
out.push(`   Khớp limit muộn (> 30 phút sau khi đặt): thua ${P(x => x.an.fillMin > 30)}, thắng ${PW(x => x.an.fillMin > 30)}`);
out.push(`\n   Từng lệnh thua:`);
for (const x of L) { const a = x.an, tags = [];
  tags.push(a.hitTP ? 'bị quét SL rồi giá chạy tới TP' : a.further >= 10 ? `đảo chiều thật (đi ngược thêm ${a.further.toFixed(0)} giá)` : 'nhiễu quanh SL');
  if (a.mfeR < 0.5) tags.push('vừa khớp đã đi ngược'); else if (a.mfeR >= 1) tags.push(`đã lời ${a.mfeR.toFixed(1)}R rồi quay đầu`);
  if (a.slATR < 1.5) tags.push(`SL sát (${a.slATR.toFixed(1)} ATR)`); if (!a.h1) tags.push('ngược EMA H1'); if (a.nw) tags.push('giờ tin Mỹ');
  x.why2 = tags.join(' · ');
  out.push(`   ${fmt(x.t)} ${x.d > 0 ? 'BUY ' : 'SELL'} ${x.entry.toFixed(2)} SL ${x.sl.toFixed(2)} (${x.risk.toFixed(1)}) TP ${x.tp.toFixed(2)} · ${sess(a.h)} ${a.h}h · giữ ${a.held}′ · ${x.why2}`); }
console.log(out.join('\n'));
fs.writeFileSync('/home/claude/work/img-why.json', JSON.stringify({ T, NF, F, text: out.join('\n') }));
