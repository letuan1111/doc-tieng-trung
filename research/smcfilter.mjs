// Thêm cấu trúc SMC vào EA EMA hồi: CHoCH/BOS, Order Block, Premium/Discount, giới hạn SL — kiểm tra 12 tháng
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load } from './core.mjs';
const E = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'emapb.js'));
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), S = Date.UTC(2026, 4, 5), D10 = Date.UTC(2026, 9, 26);
const sm = (G) => `${String(G.length).padStart(3)} lệnh · thắng ${G.length ? Math.round(100 * G.filter(s => s.state === 'WIN').length / G.length) : 0}% · SL TB ${(G.reduce((x, s) => x + s.risk, 0) / (G.length || 1)).toFixed(1)} · ${(G.reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)}$ (trước ${(G.filter(s => s.ct < S).reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)} · gần ${(G.filter(s => s.ct >= S).reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)} · 10 ngày ${(G.filter(s => s.ct >= D10).reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)})`;
const V = { 'EA hiện tại (giờ tốt)': {}, '+ SL ≤ 30 giá': { maxSL: 30 }, '+ SL ≤ 25 giá': { maxSL: 25 }, '+ chỉ CHoCH': { breakType: 'CHoCH' }, '+ chỉ BOS': { breakType: 'BOS' }, '+ có Order Block ở điểm hồi': { needOB: true }, '+ Discount/Premium (≤ 50% range 24h)': { pdMax: 0.5 }, '+ ≤ 70% range 24h': { pdMax: 0.7 }, '+ OB + SL ≤ 30': { needOB: true, maxSL: 30 }, '+ OB + ≤70% + SL ≤ 30': { needOB: true, pdMax: 0.7, maxSL: 30 } };
for (const [k, cfg] of Object.entries(V)) { const L = E.run({ m5, m15 }, { spread: 0.35, cfg }).filter(s => s.pts != null); console.log(k.padEnd(40), 'giờ tốt:', sm(L.filter(s => s.tgOK)), ' | mọi giờ:', sm(L)); }
