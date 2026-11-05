// Chọn giờ gửi Telegram cho EMA hồi (EMA34/89 M30, vào M5): giờ thắng cao / chạm TP nhiều — so các bộ giờ
import path from 'node:path';
import { createRequire } from 'node:module';
import { DIR, load, resample } from './core.mjs';
const E = createRequire(import.meta.url)(path.join(DIR, '..', 'tin-hieu', 'emapb.js'));
const m5 = load('XAU', 'm5'), m15 = load('XAU', 'm15'), m30 = resample(m15, 18e5), S = Date.UTC(2026, 4, 5), F3 = Date.UTC(2026, 7, 5), D10 = Date.UTC(2026, 9, 26);
const L = E.run({ m5, m15, emaC: m30 }, { spread: 0.35 }).filter(s => s.pts != null), hr = t => (new Date(t).getUTCHours() + 7) % 24;
const sm = (G) => `${String(G.length).padStart(3)} lệnh (${(G.length / 49).toFixed(1)}/tuần) · TP ${G.filter(s => s.state === 'WIN').length} SL ${G.filter(s => s.state === 'LOSS').length} · thắng ${Math.round(100 * G.filter(s => s.state === 'WIN').length / G.length)}% · ${(G.reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)}$ | trước ${(G.filter(s => s.ct < S).reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)} · gần ${(G.filter(s => s.ct >= S).reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)} · 3th ${(G.filter(s => s.ct >= F3).reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)} · 10 ngày ${(G.filter(s => s.ct >= D10).reduce((x, s) => x + s.pts, 0) * 2).toFixed(0)}`;
const SETS = { 'tất cả': null, 'thắng ≥ 43% (0,8,11,12,14,17,20,21h)': [0, 8, 11, 12, 14, 17, 20, 21], 'thắng ≥ 43% và lời cả 2 nửa năm (0,11,12,14,21h)': [0, 11, 12, 14, 21],
  'khung 8h–12h + 14h + 17h + 19h–21h': [8, 9, 10, 11, 12, 14, 17, 19, 20, 21], 'bỏ 22h–7h + 13h + 16h (giờ hay SL)': [8, 9, 10, 11, 12, 14, 15, 17, 18, 19, 20, 21] };
for (const [k, H] of Object.entries(SETS)) console.log(k.padEnd(52), sm(H ? L.filter(s => H.includes(hr(s.ct))) : L));
