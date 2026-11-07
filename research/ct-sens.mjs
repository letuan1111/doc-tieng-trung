import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load } from './core.mjs';
const CT = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'congthuc.js'));
const V = { 'Công thức gốc': {}, 'bỏ bias H4': { bias: null }, 'entry mép FVG': { entry: 'edge' }, 'TP 1.5R': { rr: 1.5 }, 'TP 3R': { rr: 3 }, 'SL +0.6 ATR': { slATR: 0.6 }, 'chỉ PDH/PDL': { liq: ['pd'] }, 'không bỏ giờ': { deadHours: [] } };
for (const SYM of ['XAU', 'XAU2Y', 'BTC']) { const SP = SYM === 'BTC' ? 18 : 0.35, m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), h1 = load(SYM, 'h1'), END = m15.at(-1).ct, ST = END - 365 * 864e5;
  console.log('\n' + SYM + '            M5                  M15                 M30');
  for (const [nm, cfg] of Object.entries(V)) { const L = CT.run({ m5, m15, h1 }, { spread: SP, cfg }).filter(s => s.ct >= ST && ['WIN', 'LOSS', 'TIME'].includes(s.state));
    console.log(nm.padEnd(16) + ['m5', 'm15', 'm30'].map(tf => { const G = L.filter(s => s.tf === tf), w = G.filter(s => s.state === 'WIN').length, R = G.reduce((a, s) => a + s.r, 0); return `${String(G.length).padStart(3)}L ${String(Math.round(100 * w / (G.length || 1))).padStart(2)}% ${(R >= 0 ? '+' : '') + R.toFixed(1)}R`.padEnd(20); }).join('')); } }
