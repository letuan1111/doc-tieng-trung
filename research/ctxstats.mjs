// Thống kê bối cảnh: HỌC = XAU+BTC 6 tháng gần đây; KIỂM = XAU+BTC 6 tháng trước đó + ETH 12 tháng (chưa dùng để chọn)
import fs from 'node:fs';
import path from 'node:path';
import { DIR } from './core.mjs';
const A = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'ctx.json'), 'utf8'));
const SPLIT = Date.UTC(2026, 4, 5);
const learn = (x) => x.sym !== 'ETH' && x.t >= SPLIT, check = (x) => !learn(x);
const V = process.env.V || 'CE·SL0.5';
const s = (L, v = V) => { const R = L.map(x => x.res[v]).filter(r => r && r.r != null); const n = R.length, w = R.filter(r => r.r > 0).length, sum = R.reduce((a, r) => a + r.r, 0); return { n, w, sum, m: n ? sum / n : 0 }; };
const f = (q) => `${String(q.n).padStart(3)}L ${String(q.n ? Math.round(100 * q.w / q.n) : 0).padStart(3)}% ${(q.sum >= 0 ? '+' : '') + q.sum.toFixed(1).padStart(5)}R ${q.m.toFixed(2).padStart(5)}`;
const B = {
  'chiều': x => x.sweep === 'PDH' ? 'SELL sau quét PDH' : 'BUY sau quét PDL',
  'phiên lúc MSS': x => x.sess,
  'EMA34/89 khung vào': x => x.emaTF ? 'cùng chiều' : 'ngược',
  'EMA34/89 H1': x => x.emaH1 ? 'cùng chiều' : 'ngược',
  'EMA34/89 H4': x => x.emaH4 ? 'cùng chiều' : 'ngược',
  'xu hướng 5 ngày': x => x.trend5d,
  'độ sâu quét (ATR)': x => x.depth < 0.5 ? 'a <0.5' : x.depth < 1.5 ? 'b 0.5–1.5' : 'c >1.5',
  'số nến quét→MSS': x => x.legBars <= 6 ? 'a ≤6 (nhanh)' : x.legBars <= 15 ? 'b 7–15' : 'c >15 (chậm)',
  'FVG (ATR)': x => x.fvgATR < 0.5 ? 'a <0.5' : x.fvgATR < 1 ? 'b 0.5–1' : 'c >1',
  'ngày đã chạy (% ADR)': x => x.dayUsed == null ? '—' : x.dayUsed < 0.6 ? 'a <60%' : x.dayUsed < 1 ? 'b 60–100%' : 'c >100%',
  'sóng phá (ATR)': x => x.moveATR < 3 ? 'a <3' : x.moveATR < 6 ? 'b 3–6' : 'c >6',
  'thứ': x => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][x.wd],
};
for (const tf of ['m15', 'm30', 'h1']) {
  const T = A.filter(x => x.tf === tf);
  console.log(`\n================ ${tf.toUpperCase()}  (HỌC | KIỂM)`);
  for (const v of Object.keys(T[0].res)) console.log(`  ${v.padEnd(10)} ${f(s(T.filter(learn), v))} | ${f(s(T.filter(check), v))}`);
  for (const [name, fn] of Object.entries(B)) {
    console.log(`  · ${name}`); const g = {}; for (const x of T) (g[fn(x)] = g[fn(x)] || []).push(x);
    for (const k of Object.keys(g).sort()) console.log(`      ${k.padEnd(20)} ${f(s(g[k].filter(learn)))} | ${f(s(g[k].filter(check)))}`);
  }
}
