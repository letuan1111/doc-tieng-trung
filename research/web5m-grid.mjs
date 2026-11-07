// Nới các mô hình trên trang (Test EMA21, EMA hồi, Vùng S/R) để tìm bản M15 ~3 lệnh/ngày, thắng cao — kiểm 5 tháng gần + 5 tháng trước
import path from 'node:path'; import fs from 'node:fs'; import { createRequire } from 'node:module';
import { DIR, load } from './core.mjs';
const req = createRequire(import.meta.url), src = (f) => fs.readFileSync(path.join(DIR, '..', 'tin-hieu', f), 'utf8');
const mk = (code) => { const m = { exports: {} }; new Function('module', 'self', code)(m, {}); return m.exports; };
// Test EMA21 chạy được trên khung M15 (cfg.tfMs)
const T21 = mk(src('ema21.js').replace('const C = resample(D.m15, 18e5)', 'const C = (cfg.tfMs === 9e5 ? D.m15 : resample(D.m15, cfg.tfMs || 18e5))').replace('const jEnd = j0 + 6', 'const jEnd = j0 + (cfg.tfMs || 18e5) / 3e5'));
const EMAPB = req(path.join(DIR, '..', 'tin-hieu', 'emapb.js')), ZONES = req(path.join(DIR, '..', 'tin-hieu', 'zones.js'));
const SP = 0.35, USD = 2, VN = 7 * 36e5;
const m5 = load('XAU2Y', 'm5'), m15 = load('XAU2Y', 'm15'), h1 = load('XAU2Y', 'h1');
const T2 = m15.at(-1).ct, P = 5 * 30.44 * 864e5, T1 = T2 - P, T0 = T1 - P;
const nd = (a, b) => new Set(m15.filter(x => x.t >= a && x.t < b).map(x => new Date(x.t + VN).toISOString().slice(0, 10))).size, D1 = nd(T1, T2), D0 = nd(T0, T1);
const fin = (s) => s.state === 'WIN' || s.state === 'LOSS' || s.state === 'TIME';
const ev = (L, a, b, d) => { const G = L.filter(s => fin(s) && (s.fillT || s.ct) >= a && (s.fillT || s.ct) < b); const w = G.filter(s => s.state === 'WIN').length; const u = G.reduce((x, s) => x + (s.pts != null ? s.pts : s.r * s.risk) * USD, 0); return { n: G.length, pd: G.length / d, wr: 100 * w / (G.length || 1), usd: u }; };
const rows = [];
const push = (nm, L) => { const a = ev(L, T1, T2, D1), b = ev(L, T0, T1, D0); rows.push({ nm, a, b }); };
for (const tfMs of [9e5, 18e5]) for (const p of [9, 21, 34]) for (const run of [2, 4, 6]) for (const rr of [0.5, 0.7, 1, 1.5]) for (const bh of [[8, 23], []]) for (const maxSL of [10, 15])
  push(`🧲 Test EMA${p} ${tfMs === 9e5 ? 'M15' : 'M30'} · run${run} · TP ${rr}R · SL≤${maxSL}${bh.length ? ' · bỏ 8h/23h' : ''}`, T21.run({ m5, m15 }, { spread: SP, cfg: { tfMs, p, run, rr, badHours: bh, maxSL } }));
for (const emaTF of ['m15', 'm30']) for (const needOB of [true, false]) for (const needSweep of [true, false]) for (const needFVG of [true, false]) for (const rr of [1, 1.5, 2]) {
  const L = EMAPB.run({ m5, m15 }, { spread: SP, cfg: { emaTF, needOB, needSweep, needFVG, rr } });
  const nm = `🔁 EMA hồi ${emaTF.toUpperCase()}${needOB ? ' +OB' : ''}${needSweep ? ' +quét' : ''}${needFVG ? ' +FVG' : ''} · TP ${rr}R`;
  push(nm, L); push(nm + ' · giờ TG', L.filter(s => s.tgOK)); }
for (const aiMin of [0, 1, 2]) for (const rr of [1, 1.5, 2, 3]) for (const minScore of [2, 3, 4]) push(`🤖 Vùng S/R M15 · AI≥${aiMin} · điểm≥${minScore} · TP ${rr}R`, ZONES.run({ m5, m15, h1 }, { spread: SP, cfg: { aiMin, rr, minScore } }));
fs.writeFileSync('/home/claude/work/grid.json', JSON.stringify(rows));
const f = (z) => `${String(z.n).padStart(4)}L ${z.pd.toFixed(1)}/ng ${z.wr.toFixed(0).padStart(2)}% ${z.usd >= 0 ? '+' : ''}${Math.round(z.usd)}$`;
console.log(`5 tháng gần ${new Date(T1).toISOString().slice(0, 10)}→ (${D1} ngày) | 5 tháng trước (${D0} ngày)`);
console.log('--- ≥ 2 lệnh/ngày, lời cả 2 giai đoạn, xếp theo % thắng 5 tháng gần');
for (const r of rows.filter(r => r.a.pd >= 2 && r.a.usd > 0 && r.b.usd > 0).sort((x, y) => y.a.wr - x.a.wr).slice(0, 25)) console.log(r.nm.padEnd(60), f(r.a), '|', f(r.b));
console.log('--- ≥ 2 lệnh/ngày bất kể lời lỗ, thắng cao nhất');
for (const r of rows.filter(r => r.a.pd >= 2).sort((x, y) => y.a.wr - x.a.wr).slice(0, 12)) console.log(r.nm.padEnd(60), f(r.a), '|', f(r.b));
console.log('--- nhiều lệnh nhất của mỗi mô hình');
for (const k of ['🧲', '🔁', '🤖']) for (const r of rows.filter(r => r.nm.startsWith(k)).sort((x, y) => y.a.pd - x.a.pd).slice(0, 3)) console.log(r.nm.padEnd(60), f(r.a), '|', f(r.b));
