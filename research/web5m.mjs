// Chạy lại ĐÚNG các mô hình đang có trên trang tin-hieu trên 5 tháng gần nhất của vàng (Dukascopy), thống kê theo mô hình × khung
import path from 'node:path'; import { createRequire } from 'node:module'; import fs from 'node:fs';
import { DIR, load, resample } from './core.mjs';
const req = createRequire(import.meta.url), M = (f) => req(path.join(DIR, '..', 'tin-hieu', f));
const V3 = M('v3.js'), WAVE = M('wave.js'), EMAPB = M('emapb.js'), EMA21 = M('ema21.js'), ZONES = M('zones.js');
const SP = 0.35, USD = 2, VN = 7 * 36e5, MON = +(process.argv[2] || 5);
const m5 = load('XAU2Y', 'm5'), m15 = load('XAU2Y', 'm15'), h1 = load('XAU2Y', 'h1'), m30 = V3.resample(m15, 18e5);
const T1 = m15.at(-1).ct, T0 = T1 - MON * 30.44 * 864e5;
const days = new Set(m15.filter(x => x.t >= T0).map(x => new Date(x.t + VN).toISOString().slice(0, 10))).size;
const all = [];
const add = (L, g) => { for (const s of L) all.push({ ...s, g: s.grade === 'B' ? 'B' : g }); };
add(V3.runAll({ m15, m30, h1 }, { spread: SP, now: T1 }), 'A');
add(V3.runBos({ m15, m30, h1 }, { spread: SP, now: T1 }), 'S');
for (const [MOD, g] of [[WAVE, 'W'], [EMAPB, 'E'], [EMA21, 'R'], [ZONES, 'Z']]) add(MOD.run({ m5, m15, h1 }, { spread: SP }), g);
const NM = { A: '⭐ Chuẩn', B: '🔎 Ghi nhận', S: '🎯 BOS 15', W: '🌊 Sóng 15', E: '🔁 EMA hồi', R: '🧲 Test EMA21', Z: '🤖 AI Vùng S/R' };
const done = (s) => s.state === 'WIN' || s.state === 'LOSS' || s.state === 'TIME';
const pts = (s) => s.pts != null ? s.pts : (s.r != null && s.risk ? s.r * s.risk : 0);
const T = all.filter(s => (s.fillT || s.ct) >= T0 && done(s)).map(s => ({ ...s, P: pts(s), tf: s.tf || 'm5', h: new Date((s.fillT || s.ct) + VN).getUTCHours(), day: new Date((s.fillT || s.ct) + VN).toISOString().slice(0, 10) }));
fs.writeFileSync('/home/claude/work/trades5m.json', JSON.stringify(T));
const rep = (G) => { const w = G.filter(x => x.state === 'WIN').length; let eq = 0, pk = 0, dd = 0; for (const x of [...G].sort((a, b) => a.exitT - b.exitT)) { eq += x.P * USD; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  return { n: G.length, pd: +(G.length / days).toFixed(2), wr: Math.round(100 * w / (G.length || 1)), usd: Math.round(G.reduce((a, x) => a + x.P * USD, 0)), dd: Math.round(dd), sl: +(G.reduce((a, x) => a + (x.risk || 0), 0) / (G.length || 1)).toFixed(1), tp: +(G.reduce((a, x) => a + Math.abs((x.tp || 0) - (x.entry || 0)), 0) / (G.length || 1)).toFixed(1) }; };
console.log(`Vàng ${new Date(T0).toISOString().slice(0, 10)} → ${new Date(T1).toISOString().slice(0, 10)} · ${days} ngày giao dịch · spread ${SP} · 0.02 lot`);
const keys = [...new Set(T.map(s => s.g + '|' + s.tf))].sort();
for (const k of keys) { const [g, tf] = k.split('|'), r = rep(T.filter(s => s.g === g && s.tf === tf)); console.log(`${(NM[g] + ' ' + tf.toUpperCase()).padEnd(22)} ${String(r.n).padStart(4)} lệnh ${String(r.pd).padStart(5)}/ngày · thắng ${String(r.wr).padStart(3)}% · SL TB ${r.sl} TP TB ${r.tp} · ${r.usd >= 0 ? '+' : ''}${r.usd}$ · DD ${r.dd}$`); }
