// Rà lại TẤT CẢ chiến lược trên web bằng cùng một thước đo: vàng Dukascopy 2 năm (11/2024→11/2026), spread 0.35, 0.02 lot
// mỗi chiến lược: mỗi lúc 1 lệnh · chia năm 1 / năm 2 · tính trên lệnh đã khớp & kết thúc
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load, resample } from './core.mjs';
const req = createRequire(import.meta.url), M = (f) => req(path.join(DIR, '..', 'tin-hieu', f));
const V3 = M('v3.js'), WAVE = M('wave.js'), EMAPB = M('emapb.js'), EMA21 = M('ema21.js'), ZONES = M('zones.js'), CT = M('congthuc.js'), QB = M('quetbien.js'), PB = M('asianbo.js'), BOSRT = M('bosrt.js');
const SP = 0.35, USD = 2, SYM = 'XAU2Y';
const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), h1 = load(SYM, 'h1'), m30 = resample(m15, 18e5);
const T0 = m15[400].t, HALF = Date.parse('2025-11-05'), END = m15.at(-1).ct;
const days = new Set(m15.filter(x => x.t >= T0 && ![0, 6].includes(new Date(x.t).getUTCDay())).map(x => Math.floor(x.t / 864e5))).size;
const norm = (s) => { const t = s.fillT || s.ct || s.t, ex = s.exitT; let pts = s.pts; if (pts == null && s.exitP != null) pts = s.side * (s.exitP - s.entry); let r = s.r; if (r == null && pts != null && s.risk) r = pts / s.risk; return { t, ex, pts, r, st: s.state }; };
const FIN = new Set(['WIN', 'LOSS', 'TIME', 'TP', 'SL', 'BE']);
function rep(name, raw, note = '') {
  const L = raw.map(norm).filter(x => x.t >= T0 && x.ex && x.pts != null && isFinite(x.pts) && FIN.has(x.st)).sort((a, b) => a.t - b.t);
  const T = []; let free = 0; for (const x of L) if (x.t >= free) { T.push(x); free = x.ex; }
  const part = (f) => { const P = T.filter(f), u = P.reduce((a, x) => a + x.pts * USD, 0), R = P.reduce((a, x) => a + (x.r || 0), 0), w = P.filter(x => x.pts > 0).length; return { n: P.length, win: P.length ? Math.round(100 * w / P.length) : 0, R: +R.toFixed(1), usd: Math.round(u) }; };
  let eq = 0, pk = 0, dd = 0; for (const x of T) { eq += x.pts * USD; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const gw = T.filter(x => x.pts > 0).reduce((a, x) => a + x.pts, 0), gl = -T.filter(x => x.pts < 0).reduce((a, x) => a + x.pts, 0);
  const o = { name, note, all: part(() => 1), y1: part(x => x.t < HALF), y2: part(x => x.t >= HALF), dd: Math.round(dd), pf: gl ? +(gw / gl).toFixed(2) : null, perDay: +(T.length / days).toFixed(2) };
  console.log(name.padEnd(34), JSON.stringify(o.all), 'y1', o.y1.usd, 'y2', o.y2.usd, 'dd', o.dd, 'pf', o.pf, o.perDay + '/ngày'); return o;
}
const out = [], run = (nm, f, note) => { const t0 = Date.now(); try { out.push(rep(nm, f(), note)); } catch (e) { console.log(nm, 'LỖI', e.message); } process.stderr.write(`${nm} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`); };
const D3 = { m15, h1, m30 };
run('V4 Chuẩn (A)', () => { const r = V3.runAll(D3, { spread: SP, now: END }); return r.filter(s => s.grade === 'A'); }, 'quét PDH/PDL → MSS → FVG, M15/M30/H1');
run('V4 Ghi nhận (B)', () => { const r = V3.runAll(D3, { spread: SP, now: END }); return r.filter(s => s.grade === 'B'); });
run('BOS 15 (S)', () => V3.runBos(D3, { spread: SP, now: END }));
const D5 = { m5, m15, h1 };
run('🌊 Sóng 15 (W)', () => WAVE.run(D5, { spread: SP }));
run('🔁 EMA hồi (E)', () => EMAPB.run(D5, { spread: SP }).filter(s => s.tgOK !== false));
run('🧲 Test EMA21 M30 (R)', () => EMA21.run(D5, { spread: SP }));
run('🧱 Vùng S/R H4/H1 (Z)', () => ZONES.run(D5, { spread: SP }));
run('💧 Quét biên tích lũy (Q)', () => QB.run(D5, { spread: SP }));
run('🌅 Phá biên phiên Á (P)', () => PB.run(D5, { spread: SP }));
run('📐 Công thức (C)', () => CT.run(D5, { spread: SP }));
run('🔂 BOS M5 + retest (K)', () => BOSRT.run({ m5, m15 }, { spread: SP, sym: 'XAU' }));
fs.writeFileSync('/tmp/audit-all.json', JSON.stringify({ days, out }));
const XH = M('xuhuong.js'); run('🧭 Phá biên Á theo xu hướng (X)', () => XH.run(D5, { spread: SP }).map(s => ({ ...s, state: s.state === 'BE' ? 'TIME' : s.state })));
fs.writeFileSync('/tmp/audit-all.json', JSON.stringify({ days, out }));
