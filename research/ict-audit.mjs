// Rà lại M15/M30 theo ICT/SMC chuẩn: bias cấu trúc HTF + quét thanh khoản + killzone + MSS có displacement + entry FVG ở discount/premium của sóng (OTE)
// Kiểm từng thành phần (bật đủ, rồi bỏ từng cái) trên XAU, BTC (2 nửa năm) + ETH. Mỗi setup tính độc lập, TP 2R, đã trừ spread.
import { createRequire } from 'node:module';
import path from 'node:path';
import { DIR, load, resample } from './core.mjs';
const V = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'v3.js'));
const SP = { XAU: 0.35, BTC: 18, ETH: 1.2 }, S = Date.UTC(2026, 4, 5), F = Date.UTC(2025, 10, 5);
const ITEMS = [];
for (const sym of ['XAU', 'BTC', 'ETH']) {
  const m15 = load(sym, 'm15'), h1 = load(sym, 'h1'), C = { m15, m30: resample(m15, 18e5) };
  for (const tf of ['m15', 'm30']) {
    const base = { ...V.CFG[tf] }; V.CFG[tf] = { ...base, sides: [1, -1], filter: null, liq: ['pd'] };
    for (const e of V.setups(C[tf], tf, { h1 })) {
      if (e.t < F) continue; const out = {};
      for (const en of ['ce', 'edge', 'ote']) for (const sl of [0.5, 1]) { V.CFG[tf] = { ...V.CFG[tf], entry: en, slATR: sl }; const s = V.simulate(C[tf], e, SP[sym]); out[en + sl] = s && s.r != null ? s.r : null; }
      ITEMS.push({ sym, tf, t: e.t, x: e.ctx, out });
    }
    V.CFG[tf] = base;
  }
}
const seg = (it) => it.sym === 'ETH' ? 'ETH' : it.sym + (it.t < S ? ' trước' : ' gần');
const SEGS = ['XAU trước', 'XAU gần', 'BTC trước', 'BTC gần', 'ETH'];
const ret = (x, en) => en === 'ce' ? x.retCE : en === 'edge' ? x.retEdge : 0.705;
const R = {
  bias: { 'không': () => true, 'cấu trúc H4': x => x.st4, 'cấu trúc H1': x => x.st1, 'H1+H4': x => x.st1 && x.st4, 'EMA H4 (cũ)': x => x.emaH4 },
  kz: { 'không': () => true, 'MSS trong killzone': x => !!x.kzMss, 'quét hoặc MSS trong KZ': x => !!(x.kzMss || x.kzSweep), 'ngoài phiên Á (cũ)': x => x.sess !== 'Á' },
  disc: { 'không': () => true, 'entry ở discount/premium sóng (≥50%)': (x, en) => ret(x, en) >= 0.5 },
};
function ev(tf, q) {
  const r = {}; let n = 0, sum = 0, w = 0;
  for (const it of ITEMS) { if (it.tf !== tf) continue; const x = it.x;
    if (!R.bias[q.bias](x) || !R.kz[q.kz](x) || !R.disc[q.disc](x, q.en)) continue;
    const v = it.out[q.en + q.sl]; if (v == null) continue; const k = seg(it); r[k] = r[k] || [0, 0]; r[k][0]++; r[k][1] += v; if (it.sym !== 'ETH') { n++; sum += v; w += v > 0; } }
  return { r, n, sum, w, neg: SEGS.filter(k => r[k] && r[k][1] < 0).length };
}
const fmt = (o) => `${String(o.n).padStart(3)}L thắng ${String(o.n ? Math.round(100 * o.w / o.n) : 0).padStart(2)}% ${(o.sum >= 0 ? '+' : '') + o.sum.toFixed(1).padStart(5)}R ${(o.n ? o.sum / o.n : 0).toFixed(2)}R/L âm ${o.neg}/5 | ` + SEGS.map(k => `${k} ${o.r[k] ? (o.r[k][1] >= 0 ? '+' : '') + o.r[k][1].toFixed(1) + '(' + o.r[k][0] + ')' : '—'}`).join(' · ');
const FULL = { bias: 'cấu trúc H4', kz: 'MSS trong killzone', disc: 'entry ở discount/premium sóng (≥50%)' };
for (const tf of ['m15', 'm30']) {
  console.log(`\n================ ${tf.toUpperCase()}`);
  const cur = tf === 'm15' ? { bias: 'EMA H4 (cũ)', kz: 'ngoài phiên Á (cũ)', disc: 'không', en: 'edge', sl: 0.5 } : { bias: 'không', kz: 'không', disc: 'không', en: 'ce', sl: 1 };
  console.log('  ĐANG CHẠY'.padEnd(52), fmt(ev(tf, cur)));
  for (const en of ['ce', 'edge', 'ote']) for (const sl of [0.5, 1]) console.log(`  ICT đủ · entry ${en} · SL+${sl}ATR`.padEnd(52), fmt(ev(tf, { ...FULL, en, sl })));
  console.log('  -- bỏ / đổi từng thành phần (entry CE, SL+1ATR)');
  for (const part of ['bias', 'kz', 'disc']) for (const opt of Object.keys(R[part])) { if (opt === FULL[part]) continue; console.log(`  ${part}: ${opt}`.padEnd(52), fmt(ev(tf, { ...FULL, [part]: opt, en: 'ce', sl: 1 }))); }
}
// thêm từng thành phần ICT vào quy tắc đang chạy
console.log('\n================ THÊM TỪNG THÀNH PHẦN ICT VÀO QUY TẮC ĐANG CHẠY');
for (const [tf, cur] of [['m15', { bias: 'EMA H4 (cũ)', kz: 'ngoài phiên Á (cũ)', disc: 'không', en: 'edge', sl: 0.5 }], ['m30', { bias: 'không', kz: 'không', disc: 'không', en: 'ce', sl: 1 }]]) {
  console.log(`  ${tf.toUpperCase()} đang chạy`.padEnd(52), fmt(ev(tf, cur)));
  console.log(`  ${tf.toUpperCase()} + entry discount/premium sóng`.padEnd(52), fmt(ev(tf, { ...cur, disc: FULL.disc })));
  console.log(`  ${tf.toUpperCase()} + MSS trong killzone`.padEnd(52), fmt(ev(tf, { ...cur, kz: 'MSS trong killzone' })));
  console.log(`  ${tf.toUpperCase()} bias cấu trúc H4 thay EMA`.padEnd(52), fmt(ev(tf, { ...cur, bias: 'cấu trúc H4' })));
  console.log(`  ${tf.toUpperCase()} entry OTE 70.5%`.padEnd(52), fmt(ev(tf, { ...cur, en: 'ote' })));
}
