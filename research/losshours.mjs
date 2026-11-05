// Đọc lại lệnh thua của mô hình EMA hồi (vào M5): theo giờ VN, phiên, thứ — giờ nào hay thua, giờ nào ít nhiễu
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load, resample } from './core.mjs';
const E = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'emapb.js'));
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), m30 = resample(m15, 18e5), S = Date.UTC(2026, 4, 5);
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24;
for (const [nm, EC] of [['EMA M15', m15], ['EMA M30', m30]]) {
  const L = E.run({ m5, m15, emaC: EC }, { spread: 0.35 }).filter(s => s.pts != null);
  const loss = L.filter(s => s.state === 'LOSS');
  console.log(`\n================ ${nm}: ${L.length} lệnh, ${loss.length} lệnh thua (${Math.round(100 * loss.length / L.length)}%)`);
  console.log(' giờ VN | lệnh | thua | thắng% | lời USD | 6th trước | 6th gần | thua trong ≤15 phút');
  const rows = [];
  for (let h = 0; h < 24; h++) { const G = L.filter(s => hr(s.ct) === h); if (!G.length) continue; const w = G.filter(s => s.state === 'WIN').length, lo = G.filter(s => s.state === 'LOSS');
    const u = (f) => (G.filter(f).reduce((a, s) => a + s.pts, 0) * 2); const fast = lo.filter(s => s.exitT - s.ct <= 15 * 6e4).length;
    rows.push({ h, n: G.length, lo: lo.length, wr: w / G.length, usd: u(() => true), a: u(s => s.ct < S), b: u(s => s.ct >= S), fast });
    console.log(` ${String(h).padStart(2, '0')}h    | ${String(G.length).padStart(4)} | ${String(lo.length).padStart(4)} | ${String(Math.round(100 * w / G.length)).padStart(4)}%  | ${u(() => true).toFixed(0).padStart(6)} | ${u(s => s.ct < S).toFixed(0).padStart(6)} | ${u(s => s.ct >= S).toFixed(0).padStart(6)} | ${fast}`); }
  const ses = { 'đêm 0–7h': [0, 7], 'Á 7–13h': [7, 13], 'London 13–19h': [13, 19], 'New York 19–24h': [19, 24] };
  console.log(' -- theo phiên');
  for (const [k, [a, b]] of Object.entries(ses)) { const G = L.filter(s => hr(s.ct) >= a && hr(s.ct) < b), w = G.filter(s => s.state === 'WIN').length, u = (f) => (G.filter(f).reduce((x, s) => x + s.pts, 0) * 2).toFixed(0);
    console.log(`   ${k.padEnd(16)} ${String(G.length).padStart(4)} lệnh · thua ${G.filter(s => s.state === 'LOSS').length} · thắng ${Math.round(100 * w / G.length)}% · ${u(() => true)}$ (trước ${u(s => s.ct < S)} · gần ${u(s => s.ct >= S)})`); }
  console.log(' -- theo thứ (giờ VN)');
  for (let d = 1; d <= 6; d++) { const G = L.filter(s => new Date(s.ct + 252e5).getUTCDay() === d); if (!G.length) continue; const w = G.filter(s => s.state === 'WIN').length; console.log(`   ${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d]} ${String(G.length).padStart(4)} lệnh · thắng ${Math.round(100 * w / G.length)}% · ${(G.reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)}$`); }
  const good = rows.filter(r => r.a > 0 && r.b > 0).map(r => r.h), bad = rows.filter(r => r.a < 0 && r.b < 0).map(r => r.h);
  console.log(` -- giờ CÓ LỜI cả 2 nửa năm: ${good.join(', ')}h · giờ LỖ cả 2 nửa năm: ${bad.join(', ')}h`);
  const keep = L.filter(s => good.includes(hr(s.ct))), drop = L.filter(s => bad.includes(hr(s.ct)));
  const sm = (G) => `${G.length} lệnh · thắng ${Math.round(100 * G.filter(s => s.state === 'WIN').length / G.length)}% · ${(G.reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)}$ (trước ${(G.filter(s => s.ct < S).reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)} · gần ${(G.filter(s => s.ct >= S).reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)})`;
  console.log(`    bỏ các giờ lỗ cả 2 nửa: ${sm(L.filter(s => !bad.includes(hr(s.ct))))}`);
}
