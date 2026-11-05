// M15 vàng: bắt sóng 15 giá — TP cố định 15 giá, SL theo cấu trúc (ngoài gốc sóng), các mức nới điều kiện ICT
import { createRequire } from 'node:module';
import path from 'node:path';
import { DIR, load } from './core.mjs';
const V = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'v3.js')); const B = { ...V.CFG.m15 };
const sym = process.env.SYM || 'XAU', SP = { XAU: 0.35, BTC: 18 }[sym], PT = +(process.env.PT || 15), LOTV = { XAU: 2, BTC: 0.02 }[sym], S = Date.UTC(2026, 4, 5), F = Date.UTC(2025, 10, 5);
const D = { m15: load(sym, 'm15'), h1: load(sym, 'h1') }; V.TFS.splice(0, V.TFS.length, 'm15');
const LIQ = ['pd', 'london', 'asia', 'pw', 'swing'];
const base = { tpPts: PT, sides: [1, -1], expiry: 12 };
const VARS = {
  'Đang chạy (2R, quét PDH/PDL, bias H4)': [{}],
  'TP 15 · quét PDH/PDL · bias H4 · ngoài Á': [{ ...base }],
  'TP 15 · quét mọi thanh khoản · bias H4': [{ ...base, liq: LIQ, filter: x => x.st4 }],
  'TP 15 · quét mọi TK · bias H4 · SL ≤15': [{ ...base, liq: LIQ, filter: x => x.st4, maxRiskPts: PT }],
  'TP 15 · quét mọi TK · bias H4 · SL ≤10': [{ ...base, liq: LIQ, filter: x => x.st4, maxRiskPts: PT * 2 / 3 }],
  'TP 15 · quét mọi TK · không bias · SL ≤15': [{ ...base, liq: LIQ, filter: null, maxRiskPts: PT }],
  'TP 15 · mọi MSS+FVG · bias H4 · SL ≤15': [{ ...base, liq: [...LIQ, 'none'], filter: x => x.st4, maxRiskPts: PT }],
  'TP 15 · mọi MSS+FVG · bias H4 · SL ≤10': [{ ...base, liq: [...LIQ, 'none'], filter: x => x.st4, maxRiskPts: PT * 2 / 3 }],
  'TP 15 · mọi MSS+FVG · bias H4+H1 · SL ≤15': [{ ...base, liq: [...LIQ, 'none'], filter: x => x.st4 && x.st1, maxRiskPts: PT }],
  'TP 15 · mọi MSS+FVG · không bias · SL ≤15': [{ ...base, liq: [...LIQ, 'none'], filter: null, maxRiskPts: PT }],
  'TP 15 · mọi MSS+FVG · bias H4 · KZ · SL ≤15': [{ ...base, liq: [...LIQ, 'none'], filter: x => x.st4 && !!x.kzMss, maxRiskPts: PT }],
  'TP 15 · mọi MSS+FVG · bias H4 · CE · SL ≤15': [{ ...base, entry: 'ce', liq: [...LIQ, 'none'], filter: x => x.st4, maxRiskPts: PT }],
  'TP 15 · SL cố định 15 · mọi MSS+FVG · bias H4': [{ ...base, liq: [...LIQ, 'none'], filter: x => x.st4, slPts: PT, minRiskATR: 0 }],
  'TP 15 · SL cố định 20 · mọi MSS+FVG · bias H4': [{ ...base, liq: [...LIQ, 'none'], filter: x => x.st4, slPts: PT * 4 / 3, minRiskATR: 0 }],
  'TP 15 · SL cố định 15 · quét mọi TK · bias H4': [{ ...base, liq: LIQ, filter: x => x.st4, slPts: PT, minRiskATR: 0 }],
  'TP 15 · SL cố định 15 · quét PDH/PDL · bias H4': [{ ...base, slPts: PT, minRiskATR: 0 }],
};
for (const [nm, [v]] of Object.entries(VARS)) {
  V.CFG.m15 = { ...B, ...v };
  const L = V.run(D, { spread: SP }).filter(s => s.r != null && s.ct >= F).sort((a, b) => a.exitT - b.exitT);
  const usd = (s) => (s.side * (s.exitP - s.entry) - SP) * LOTV;
  const seg = [['trước', s => s.ct < S], ['gần', s => s.ct >= S]].map(([pn, f]) => { const P = L.filter(f); return `${pn} ${P.length}L ${P.reduce((a, s) => a + usd(s), 0).toFixed(0)}$`; });
  let eq = 0, pk = 0, dd = 0; for (const s of L) { eq += usd(s); pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
  const w = L.filter(s => s.state === 'WIN').length, l = L.filter(s => s.state === 'LOSS').length, days = 268;
  console.log(nm.padEnd(44), `${(L.length / days).toFixed(2)} lệnh/ngày · TP ${w} SL ${l} khác ${L.length - w - l} · thắng ${Math.round(100 * w / L.length)}% · ${eq.toFixed(0)}$ · DD ${dd.toFixed(0)}$ |`, seg.join(' · '));
}
