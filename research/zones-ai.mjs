// Luật "AI chọn cách vào lệnh" cho chiến lược vùng: đo yếu tố nào làm lệnh thắng nhiều hơn (vàng 2 năm)
import { signals, trades, show, m15, h4, A4 } from './zones.mjs';
import { ema, resample } from './core.mjs';
const c4 = h4.map(x => x.c), H34 = ema(c4, 34), H89 = ema(c4, 89);
const trend4 = (t) => { let k = -1; for (let i = 0; i < h4.length && h4[i].ct <= t; i++) k = i; return k < 0 ? 0 : Math.sign(H34[k] - H89[k]); };
const S = signals({ minScore: 4, minDepth: 0.05, maxDepth: 0.6, wait: 16, mss: true });
for (const s of S) { s.t4 = trend4(m15[s.iC].ct); s.depth = s.d * ((s.d > 0 ? s.z.lo : s.z.hi) - s.ex) / s.a; s.bars = s.iC - s.i0; }
const by = (nm, f, tp = 3) => show(nm, trades(S.filter(f), { tp }));
console.log('== Toàn bộ (MSS ≤ 16 nến)'); by('tất cả · 3R', () => true); by('tất cả · 1.5R', () => true, 1.5);
console.log('== Xu hướng M15'); by('ngược M15 · 3R', s => s.trend === -s.d); by('thuận M15 · 3R', s => s.trend === s.d); by('thuận M15 · 1.5R', s => s.trend === s.d, 1.5);
console.log('== Xu hướng H4'); by('thuận H4 · 3R', s => s.t4 === s.d); by('ngược H4 · 3R', s => s.t4 === -s.d);
console.log('== Kết hợp'); by('ngược M15 + thuận H4 (hồi về vùng rồi quay lại xu hướng lớn)', s => s.trend === -s.d && s.t4 === s.d); by('ngược M15 + ngược H4', s => s.trend === -s.d && s.t4 === -s.d);
console.log('== Điểm vùng'); by('vùng < 12', s => s.z.score < 12); by('vùng 12–25', s => s.z.score >= 12 && s.z.score < 25); by('vùng ≥ 25', s => s.z.score >= 25);
console.log('== Độ sâu quét (ATR M15)'); by('< 0.3', s => s.depth < 0.3); by('0.3–0.8', s => s.depth >= 0.3 && s.depth < 0.8); by('≥ 0.8', s => s.depth >= 0.8);
console.log('== MSS đến sau bao lâu'); by('≤ 4 nến', s => s.bars <= 4); by('5–8', s => s.bars > 4 && s.bars <= 8); by('9–16', s => s.bars > 8);
console.log('== Đổi vai'); by('vùng đổi vai', s => s.z.flip); by('không đổi vai', s => !s.z.flip);
console.log('== Giờ'); by('giờ chết 3–4h,10–11h', s => [3, 4, 10, 11].includes(s.h)); by('giờ mạnh 8–9h,19–22h', s => [8, 9, 19, 20, 21, 22].includes(s.h)); by('còn lại', s => ![3, 4, 10, 11, 8, 9, 19, 20, 21, 22].includes(s.h));
console.log('== Chính sách AI');
by('AI-1: ngược M15 → 3R · thuận M15 → 1.5R', () => true); // placeholder, xử lý bên dưới
const SH = [8, 9, 19, 20, 21, 22], DEAD = [3, 4, 10, 11];
const ai = (s) => (s.trend === -s.d ? 1 : 0) + (s.t4 === s.d ? 1 : 0) + (SH.includes(s.h) ? 1 : 0) + (s.bars <= 4 ? 1 : 0) - (DEAD.includes(s.h) ? 1 : 0);
for (const s of S) s.ai = ai(s);
console.log('phân bố điểm AI:', [0, 1, 2, 3, 4].map(k => `${k}: ${S.filter(s => s.ai === k).length}`).join(' · '));
for (const k of [0, 1, 2, 3]) by(`AI ≥ ${k} điểm · 3R`, s => s.ai >= k);
by('AI ≥ 2 · 2R', s => s.ai >= 2, 2); by('AI ≥ 2 · 4R', s => s.ai >= 2, 4);
for (const k of [0, 1, 2, 3, 4]) by(`đúng ${k} điểm · 3R`, s => s.ai === k);
