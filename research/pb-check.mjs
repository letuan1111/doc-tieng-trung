// Kiểm module tin-hieu/asianbo.js: 2 năm Dukascopy (M5), 1 năm Dukascopy tua bằng nến M1, OKX 12 tháng
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { DIR, load, resample } from './core.mjs';
const PB = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'asianbo.js')), VN = 7 * 36e5;
function rep(nm, L, a, b) { L = L.filter(s => s.t >= a && s.t < b && PB.FINAL[s.state]); const N = L.length, pos = L.filter(s => s.pts > 0), neg = L.filter(s => s.pts <= 0);
  const u = L.reduce((x, s) => x + s.pts * 2, 0), gw = pos.reduce((x, s) => x + s.pts, 0), gl = -neg.reduce((x, s) => x + s.pts, 0);
  let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0; for (const s of L) { eq += s.pts * 2; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = s.pts <= 0 ? ls + 1 : 0; ml = Math.max(ml, ls); }
  const cnt = (st) => L.filter(s => s.state === st).length, be = L.filter(s => s.why && /Hoà vốn/.test(s.why)).length;
  console.log(`\n${nm}: ${N} lệnh (${(N / ((b - a) / 6048e5)).toFixed(1)}/tuần) · LỜI ${pos.length} (${Math.round(100 * pos.length / N)}%) · lỗ ${neg.length} · chạm TP ${cnt('WIN')} · dính SL ${cnt('LOSS')} · hoà vốn ${be} · đóng 2h sáng ${cnt('TIME') - be}`);
  console.log(`   ${u >= 0 ? '+' : ''}${Math.round(u)}$ (0.02 lot) · PF ${(gw / gl).toFixed(2)} · lời TB ${(gw / (pos.length || 1)).toFixed(1)} giá · lỗ TB ${(gl / (neg.length || 1)).toFixed(1)} giá · SL TB ${(L.reduce((x, s) => x + s.risk, 0) / N).toFixed(1)} giá · TP TB ${(L.reduce((x, s) => x + 2.5 * s.risk, 0) / N).toFixed(1)} giá · sụt tối đa ${Math.round(dd)}$ · thua liên tiếp ${ml} · BUY ${L.filter(s => s.side > 0).length} / SELL ${L.filter(s => s.side < 0).length}`);
  const mo = {}; for (const s of L) { const k = new Date(s.t + VN).toISOString().slice(2, 7); mo[k] = mo[k] || [0, 0, 0]; mo[k][0]++; if (s.pts > 0) mo[k][1]++; mo[k][2] += s.pts * 2; }
  console.log('   theo tháng: ' + Object.entries(mo).map(([k, v]) => `${k.slice(3)}/${k.slice(0, 2)} ${v[0]}L ${Math.round(100 * v[1] / v[0])}% ${(v[2] >= 0 ? '+' : '') + Math.round(v[2])}$`).join(' · '));
  return L; }
const SP = 0.35;
{ const m5 = load('XAU2Y', 'm5'), m15 = load('XAU2Y', 'm15'), L = PB.run({ m5, m15 }, { spread: SP });
  rep('Dukascopy năm 11/2024–11/2025', L, Date.parse('2024-11-15'), Date.parse('2025-11-06')); rep('Dukascopy năm 11/2025–11/2026 (M5)', L, Date.parse('2025-11-06'), m5.at(-1).ct); }
{ const m1 = JSON.parse(fs.readFileSync(path.join(DIR, 'data', 'XAU1Y_m1.json'))).map(k => ({ t: k[0], ct: k[0] + 6e4, o: k[1], h: k[2], l: k[3], c: k[4] })), m15 = resample(m1, 9e5);
  const L = PB.run({ m5: m1, m15 }, { spread: SP }); fs.writeFileSync('/home/claude/work/pb-m1.json', JSON.stringify(L)); rep('★ 1 NĂM QUA tua bằng nến M1 (Dukascopy 06/11/2025 → 06/11/2026)', L, Date.parse('2025-11-06'), m1.at(-1).ct); }
{ const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'); rep('OKX 12 tháng (giá trang web dùng)', PB.run({ m5, m15 }, { spread: SP }), m5[0].t + 864e5, m5.at(-1).ct); }
