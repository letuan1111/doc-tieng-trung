// Dữ liệu cho trang tua: 2 EA của người dùng (EMA_Hoi_ICT, EMA21_Test_M30) + mọi sóng ≥ 15 giá (zigzag M5), 30 ngày gần nhất, Dukascopy
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, resample } from './core.mjs';
const req = createRequire(import.meta.url), EMAPB = req(path.join(DIR, '..', 'tin-hieu', 'emapb.js')), EMA21 = req(path.join(DIR, '..', 'tin-hieu', 'ema21.js'));
const SP = 0.35, DAYS = +(process.argv[2] || 30), WAVE = 15, VN = 7 * 36e5;
const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] }));
const m5 = resample(m1, 3e5), m15 = resample(m1, 9e5), h1 = resample(m1, 36e5), END = m5.at(-1).ct, ST = END - DAYS * 864e5;
const fin = (s) => ['WIN', 'LOSS', 'TIME'].includes(s.state);
const dayVN = (t) => new Date(t + VN).toISOString().slice(0, 10);
// EMA hồi EA: chỉ giờ VN trong danh sách (tgOK), 1 lệnh của EA, ≤ 4 lệnh/ngày
const E = EMAPB.run({ m5, m15 }, { spread: SP }).filter(s => s.tgOK && fin(s)).sort((a, b) => a.fillT - b.fillT);
const takeE = []; { let free = 0; const cnt = {}; for (const s of E) { const d = dayVN(s.fillT); if (s.fillT < free || (cnt[d] || 0) >= 4) continue; takeE.push({ ...s, ea: 'EMA_Hoi_ICT' }); cnt[d] = (cnt[d] || 0) + 1; free = s.exitT; } }
// EMA21 EA: chỉ 1 lệnh trên symbol (kể cả lệnh EMA hồi), ≤ 6 lệnh/ngày
const R = EMA21.run({ m5, m15 }, { spread: SP }).filter(fin).sort((a, b) => a.fillT - b.fillT);
const busy = (t) => takeE.some(e => e.fillT <= t && t < e.exitT); const takeR = [];
{ let free = 0; const cnt = {}; for (const s of R) { const d = dayVN(s.fillT); if (s.fillT < free || busy(s.fillT) || (cnt[d] || 0) >= 6) continue; takeR.push({ ...s, ea: 'EMA21_Test_M30' }); cnt[d] = (cnt[d] || 0) + 1; free = s.exitT; } }
const trades = [...takeE, ...takeR].filter(s => s.fillT >= ST).map(s => ({ ea: s.ea, side: s.side, t: s.fillT, entry: +s.entry.toFixed(2), sl: +s.sl.toFixed(2), tp: +s.tp.toFixed(2), state: s.state, exitT: s.exitT, exitP: +(+s.exitP).toFixed(2), pts: +(s.pts).toFixed(2), usd: +(s.pts * 2).toFixed(2),
  why: s.ea === 'EMA_Hoi_ICT' ? `EMA34 ${s.ema34.toFixed(1)} / EMA89 ${s.ema89.toFixed(1)} M30 · hồi về EMA34 · ${s.sweepName || 'quét'} → ${s.breakType || 'MSS'} M5 + FVG${s.ob ? ' + OB' : ''}` : `EMA21 M30 ${(+s.ema21).toFixed(1)} · chạm lúc râu ${(+s.touchP).toFixed(1)} → nến M5 bật lại` })).sort((a, b) => a.t - b.t);
// zigzag M5 ngưỡng 15 giá: sóng được XÁC NHẬN khi giá quay ngược 15 giá từ đỉnh/đáy (không nhìn trước)
const waves = []; { let dir = 0, ext = m5[0], start = m5[0], sp = m5[0].l;
  for (const x of m5) {
    if (dir >= 0) { if (x.h > (ext.hp ?? ext.h)) ext = { ...x, hp: x.h }; }
    if (dir <= 0) { if (x.l < (ext.lp ?? ext.l)) ext = { ...x, lp: x.l }; }
    if (dir === 0) { if (x.h - sp >= WAVE) { dir = 1; ext = { ...x, hp: x.h }; start = { t: m5[0].t, p: sp }; } continue; }
    if (dir > 0 && (ext.hp - x.l) >= WAVE) { waves.push({ d: 1, t0: start.t, p0: start.p, t1: ext.t, p1: ext.hp, conf: x.ct }); start = { t: ext.t, p: ext.hp }; dir = -1; ext = { ...x, lp: x.l }; }
    else if (dir < 0 && (x.h - ext.lp) >= WAVE) { waves.push({ d: -1, t0: start.t, p0: start.p, t1: ext.t, p1: ext.lp, conf: x.ct }); start = { t: ext.t, p: ext.lp }; dir = 1; ext = { ...x, hp: x.h }; }
  } }
const W = waves.filter(w => w.t1 >= ST && Math.abs(w.p1 - w.p0) >= WAVE).map(w => { const caught = trades.filter(t => t.t >= w.t0 && t.t <= w.t1 && t.side === w.d); return { ...w, size: +Math.abs(w.p1 - w.p0).toFixed(1), min: Math.round((w.t1 - w.t0) / 6e4), caught: caught.map(t => t.ea + ' ' + t.state) }; });
const bars = m5.filter(x => x.t >= ST - 864e5).map(x => [x.t / 1000, +x.o.toFixed(2), +x.h.toFixed(2), +x.l.toFixed(2), +x.c.toFixed(2)]);
// EMA34/89 trên M5, M15, M30 (+ EMA21 M30): giá trị biết khi nến đóng → [thời điểm đóng, giá trị]
const m30 = resample(m15, 18e5), emaOf = (c, p) => { const k = 2 / (p + 1); let e = c[0].c; return c.map((x, i) => (e = i ? x.c * k + e * (1 - k) : x.c)); };
const keep = ST - 864e5, emaLines = {};
for (const [tf, c] of [['m5', m5], ['m15', m15], ['m30', m30]]) for (const p of (tf === 'm30' ? [21, 34, 89] : [34, 89])) { const v = emaOf(c, p); emaLines[tf + '_' + p] = c.map((x, i) => [x.ct / 1000, +v[i].toFixed(2)]).filter(r => r[0] * 1000 >= keep); }
// SMC M15: swing 3 nến mỗi bên (xác nhận sau 3 nến) → BOS/CHoCH khi nến M15 đóng qua swing gần nhất
// ICT: quét thanh khoản = râu M15 vượt swing đã xác nhận (BSL/SSL) hoặc PDH/PDL rồi đóng cửa quay lại
const L = 3, swings = [], smc = [], sweeps = [];
for (let i = L; i < m15.length - L; i++) { let H = true, Lo = true; for (let k = 1; k <= L; k++) { if (m15[i - k].h >= m15[i].h || m15[i + k].h > m15[i].h) H = false; if (m15[i - k].l <= m15[i].l || m15[i + k].l < m15[i].l) Lo = false; }
  if (H) swings.push({ k: 'H', i, t: m15[i].t, p: m15[i].h, conf: m15[i + L].ct }); if (Lo) swings.push({ k: 'L', i, t: m15[i].t, p: m15[i].l, conf: m15[i + L].ct }); }
swings.sort((a, b) => a.conf - b.conf);
{ let trend = 0, si = 0, lastH = null, lastL = null; const pool = []; const day = new Map();
  for (const x of m15) { const d = Math.floor(x.t / 864e5), v = day.get(d); if (!v) day.set(d, { h: x.h, l: x.l }); else { v.h = Math.max(v.h, x.h); v.l = Math.min(v.l, x.l); } }
  const keys = [...day.keys()].sort((a, b) => a - b), pd = new Map(); for (let q = 1; q < keys.length; q++) pd.set(keys[q], day.get(keys[q - 1]));
  for (let i = 0; i < m15.length; i++) { const x = m15[i];
    while (si < swings.length && swings[si].conf <= x.t) { const w = swings[si++]; if (w.k === 'H') lastH = { ...w, broken: false }; else lastL = { ...w, broken: false }; pool.push({ ...w, swept: false }); }
    if (lastH && !lastH.broken && x.c > lastH.p) { lastH.broken = true; smc.push({ t: x.ct, d: 1, type: trend > 0 ? 'BOS' : 'CHoCH', p: lastH.p, from: lastH.t }); trend = 1; }
    if (lastL && !lastL.broken && x.c < lastL.p) { lastL.broken = true; smc.push({ t: x.ct, d: -1, type: trend < 0 ? 'BOS' : 'CHoCH', p: lastL.p, from: lastL.t }); trend = -1; }
    for (const w of pool) { if (w.swept || x.t - w.t > 2 * 864e5) continue;
      if (w.k === 'H' && x.h > w.p) { w.swept = true; if (x.c < w.p) sweeps.push({ t: x.ct, d: -1, name: 'Quét BSL (đỉnh swing M15)', p: w.p, ext: x.h }); }
      if (w.k === 'L' && x.l < w.p) { w.swept = true; if (x.c > w.p) sweeps.push({ t: x.ct, d: 1, name: 'Quét SSL (đáy swing M15)', p: w.p, ext: x.l }); } }
    const P = pd.get(Math.floor(x.t / 864e5)); if (P) { if (!P.hs && x.h > P.h) { P.hs = 1; if (x.c < P.h) sweeps.push({ t: x.ct, d: -1, name: 'Quét PDH', p: P.h, ext: x.h }); } if (!P.ls && x.l < P.l) { P.ls = 1; if (x.c > P.l) sweeps.push({ t: x.ct, d: 1, name: 'Quét PDL', p: P.l, ext: x.l }); } } }
  var PD = [...pd.entries()].filter(([d]) => d * 864e5 >= keep).map(([d, v]) => [d * 86400, v.h, v.l]); }
const SW = swings.filter(w => w.conf >= keep).map(w => [w.k, w.t / 1000, +w.p.toFixed(2), w.conf / 1000]);
const SMC = smc.filter(e => e.t >= keep).map(e => [e.t / 1000, e.d, e.type, +e.p.toFixed(2), e.from / 1000]);
const SWP = sweeps.filter(e => e.t >= keep).map(e => [e.t / 1000, e.d, e.name, +e.p.toFixed(2), +e.ext.toFixed(2)]);
const out = { made: new Date().toISOString(), src: 'Dukascopy XAUUSD (giá bid), spread mô phỏng 0.35, lot 0.02', from: ST, to: END, bars, ema: emaLines, swings: SW, smc: SMC, sweeps: SWP, pd: PD, trades, waves: W };
fs.writeFileSync('/home/claude/replay/data.json', JSON.stringify(out));
const s = (ea) => { const G = trades.filter(t => t.ea === ea); return `${ea}: ${G.length} lệnh, ${G.filter(t => t.state === 'WIN').length} TP, ${G.reduce((a, t) => a + t.usd, 0).toFixed(0)}$`; };
console.log(new Date(ST).toISOString(), '→', new Date(END).toISOString(), bars.length, 'nến M5 ·', s('EMA_Hoi_ICT'), '·', s('EMA21_Test_M30'), '·', W.length, 'sóng ≥15 giá, EA bắt được', W.filter(w => w.caught.length).length, '·', SMC.length, 'BOS/CHoCH ·', SWP.length, 'cú quét');
