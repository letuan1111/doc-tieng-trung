// Nhật ký giao dịch V4 cho trang tin-hieu — chạy trên GitHub Actions mỗi 5 phút (không cần mở web) + báo Telegram.
// Ghi MỌI tín hiệu: mới → chờ khớp → đang chạy → TP/SL/hết giờ/hết hạn/huỷ, và tín hiệu bị bỏ qua vì có entry đẹp hơn.
// Nguồn giá: MT5 Exness (Firebase, nếu EA bridge đang chạy và dữ liệu < 15 phút) → nếu không có thì OKX.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire(import.meta.url), __dir = path.dirname(fileURLToPath(import.meta.url));
const V3 = req(path.join(__dir, '..', 'tin-hieu', 'v3.js'));
const WAVE = req(path.join(__dir, '..', 'tin-hieu', 'wave.js'));
const EMAPB = req(path.join(__dir, '..', 'tin-hieu', 'emapb.js'));
const EMA21 = req(path.join(__dir, '..', 'tin-hieu', 'ema21.js'));
const ZONES = req(path.join(__dir, '..', 'tin-hieu', 'zones.js'));
const CT = req(path.join(__dir, '..', 'tin-hieu', 'congthuc.js'));
const QB = req(path.join(__dir, '..', 'tin-hieu', 'quetbien.js'));
const PB = req(path.join(__dir, '..', 'tin-hieu', 'asianbo.js'));
const BOSRT = req(path.join(__dir, '..', 'tin-hieu', 'bosrt.js'));
const XH = req(path.join(__dir, '..', 'tin-hieu', 'xuhuong.js'));
const HS = req(path.join(__dir, '..', 'tin-hieu', 'hoisau.js'));
const KH = req(path.join(__dir, '..', 'tin-hieu', 'kehoach.js'));
const AIB = req(path.join(__dir, '..', 'tin-hieu', 'ai.js')), AIM = req(path.join(__dir, '..', 'tin-hieu', 'ai-model.json')); AIB.setModel(AIM);
const AI_DEPLOY = Date.parse(process.env.AI_DEPLOY || '2026-11-09T17:00:00Z'); // lệnh 🤖 trước mốc này lấy từ lịch sử walk-forward (ngoài mẫu), không tính lại bằng mô hình cuối
const DATA = process.env.DATA_DIR || 'botdata', FILE = path.join(DATA, 'tinhieu-journal.json');
const FB = (process.env.MT5_DB || 'https://letuan-mt5-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/, '');
const MS = { ...V3.MS, m5: 3e5 }, NEED = { m15: 3000, h1: 2200 }; // H1 dài để EMA34/89 H4 ổn định; M30 dựng từ M15
const SYMS = { XAU: { okx: 'XAU-USDT-SWAP', mt5: 'XAUUSDm', spread: 0.35, dp: 2 }, BTC: { okx: 'BTC-USDT-SWAP', mt5: 'BTCUSDm', spread: 18, dp: 1 } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function j(u) { for (let k = 0; k < 4; k++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.json(); } catch (_) {} await sleep(1500 * (k + 1)); } throw new Error('Không tải được ' + u.slice(0, 80)); }
const BAR = { m5: '5m', m15: '15m', h1: '1H' }; NEED.m5 = 2000;
const OFF = {}; // 💱 độ lệch TradingView − OKX theo instId (cộng vào mọi nến OKX → mọi giá trong nhật ký & Telegram là giá TradingView)
async function okx(inst, tf) {
  let out = (await j(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${BAR[tf]}&limit=300`)).data || [];
  while (out.length < NEED[tf]) { const a = (await j(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=${BAR[tf]}&limit=100&after=${out[out.length - 1][0]}`)).data || []; if (!a.length) break; out = out.concat(a); await sleep(120); }
  const d = OFF[inst] || 0; return out.reverse().map(k => ({ t: +k[0], ct: +k[0] + MS[tf], o: +k[1] + d, h: +k[2] + d, l: +k[3] + d, c: +k[4] + d }));
}
async function mt5(sym, tf) {
  const o = await j(`${FB}/mt5/${sym}/${tf}.json`); if (!o) return null;
  return Object.entries(o).map(([k, v]) => ({ t: +k * 1000, ct: +k * 1000 + MS[tf], o: v[0], h: v[1], l: v[2], c: v[3] })).sort((a, b) => a.t - b.t);
}
async function load(sym) {
  const S = SYMS[sym], now = Date.now();
  if (process.env.MOCK_DIR) { // chạy thử bằng dữ liệu có sẵn: MOCK_END = mốc thời gian giả lập "bây giờ"
    const end = +process.env.MOCK_END, D = {};
    for (const tf of ['m15', 'h1']) D[tf] = JSON.parse(fs.readFileSync(path.join(process.env.MOCK_DIR, `${sym}_${tf}.json`), 'utf8')).map(k => ({ t: k[0], ct: k[0] + MS[tf], o: k[1], h: k[2], l: k[3], c: k[4] })).filter(x => x.ct <= end).slice(-NEED[tf]);
    return { D, src: 'MOCK' };
  }
  try {
    const live = await j(`${FB}/mt5/${S.mt5}/live.json`);
    if (live && now - live.t < 15 * 60e3) {
      const D = {}; for (const tf of ['m15', 'h1']) D[tf] = await mt5(S.mt5, tf);
      // MT5 chỉ dùng khi đủ dài (EMA H4 cần ~1500 nến H1) và còn mới
      if (D.m15 && D.h1 && D.h1.length >= 1500 && now - D.m15[D.m15.length - 1].t < 35 * 60e3) return { D, src: 'MT5 Exness ' + S.mt5 };
    }
  } catch (_) {}
  const D = {}; for (const tf of ['m15', 'h1']) D[tf] = await okx(S.okx, tf);
  return { D, src: 'OKX ' + S.okx };
}
const NOW = () => process.env.MOCK_END ? +process.env.MOCK_END : Date.now();

// ---- Telegram: báo lệnh V4 (mới / khớp / TP / SL / hết giờ / huỷ) — chỉ lệnh ghi trực tiếp, không báo lệnh "tính lại"
const TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim(), FIXED_CHAT = (process.env.TELEGRAM_CHAT_ID || '').trim();
let OWNER = null; try { OWNER = JSON.parse(fs.readFileSync(path.join(DATA, 'state.json'), 'utf8')).owner; } catch (_) {}
const CHATS = FIXED_CHAT ? FIXED_CHAT.split(',').map(s => s.trim()).filter(Boolean) : (OWNER ? [String(OWNER)] : []);
const PAGE = 'https://letuan1111.github.io/doc-tieng-trung/tin-hieu/';
const vnT = (t) => t ? new Date(t + 7 * 36e5).toISOString().slice(5, 16).replace('T', ' ').replace(/^(\d\d)-(\d\d)/, '$2/$1') : '';
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function tgSend(text) {
  if (!TOKEN || process.env.MOCK_DIR || !CHATS.length) { console.log('[TG]', text.replace(/<[^>]+>/g, '')); return; }
  for (const id of CHATS) { try { await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: id, text, parse_mode: 'HTML', disable_web_page_preview: true }), signal: AbortSignal.timeout(15000) }); } catch (_) {} await sleep(350); }
}
function tgText(t) {
  const f = (v) => v == null ? '—' : (+v).toFixed(t.dp ?? 2), side = t.side > 0 ? 'BUY' : 'SELL', tag = t.grade === 'H' ? '🎯 Hồi sâu qua EMA89' : t.grade === 'X' ? '🧭 Phá biên Á theo xu hướng' : t.grade === 'I' ? '🤖 AI trợ lý' : t.grade === 'P' ? '🌅 Phá biên phiên Á' : t.grade === 'Q' ? '💧 Quét biên tích lũy' : t.grade === 'K' ? '🔂 BOS M5 + retest' : t.grade === 'C' ? '📐 Công thức' : t.grade === 'Z' ? '🧱 AI Vùng S/R H4/H1' : t.grade === 'R' ? '🧲 Test EMA21 M30' : t.grade === 'E' ? '🔁 EMA hồi' : t.grade === 'S' ? '🎯 BOS 15' : t.grade === 'W' ? '🌊 Sóng 15' : t.grade === 'B' ? '🔎 Ghi nhận' : '⭐ Chuẩn';
  const head = `<b>${t.sym} · ${t.tf.toUpperCase()} · ${side} ${t.grade === 'E' || t.grade === 'R' || t.grade === 'Z' || t.grade === 'I' || t.grade === 'P' || t.grade === 'H' ? 'VÀO NGAY' : 'LIMIT'}</b> — ${tag}`;
  const zone = `Vùng FVG ${t.tf.toUpperCase()}: ${f(t.fvg && t.fvg.bot)} – ${f(t.fvg && t.fvg.top)}`;
  const lv = `Entry <b>${f(t.entry)}</b> · SL <b>${f(t.sl)}</b> · TP <b>${f(t.tp)}</b> (${(t.rr || 2).toFixed(1)}R)${t.pxSrc ? `\n💱 ${t.pxSrc}` : ''}`;
  const sw = `Đã quét ${esc(t.sweepName)} ${f(t.sweep)} → MSS + FVG`;
  switch (t.state) {
    case 'PENDING': if (t.grade === 'I') { const R0 = (AIM.report.rows || []).find(r => r.thr === AIM.thr) || {};
        return `🆕 ${head}\n🤖 AI chấm <b>${Math.round(100 * t.prob)}%</b> khả năng chạm TP trước SL (ngưỡng ${Math.round(100 * AIM.thr)}%)\n${(t.info || []).map(x => '• ' + esc(x)).join('\n')}\n${lv} · 0.02 lot ≈ ${(t.risk * 2).toFixed(0)}$ rủi ro\n⏳ Giữ tối đa 12h (48 nến M15)\n<i>Kiểm ngoài mẫu ${esc(AIM.report.from)}→${esc(AIM.report.to)}: ${R0.n} lệnh · thắng ${R0.win}% · ${R0.R >= 0 ? '+' : ''}${R0.R}R</i>\n<a href="${PAGE}">Mở trang</a>`; }
      if (t.grade === 'H') return `🆕 ${head}\n${(t.info || []).map(x => '• ' + esc(x)).join('\n')}\n${lv}\nTP 12 giá · SL ${t.risk.toFixed(1)} giá · 0.01 lot ≈ ${t.risk.toFixed(0)}$ rủi ro · giữ ≤ 24h\n<i>Kèo hiếm (~1 lệnh/10 ngày). Kiểm 2 năm vàng: năm 1 11 lệnh thắng 55% · năm 2 28 lệnh thắng 68% — mẫu nhỏ.</i>\n<a href="${PAGE}">Mở trang</a>`;
      if (t.grade === 'X') return `🆕 ${head}\n${(t.info || []).map(x => '• ' + esc(x)).join('\n')}\n${lv} · 0.01 lot ≈ ${t.risk.toFixed(0)}$ rủi ro (${(t.risk / 5).toFixed(1)}% TK 500$)\nHuỷ nếu chưa khớp trước ${vnT(t.expT)} · 3h sáng VN còn lệnh thì đóng\n<i>Kiểm 2 năm vàng: 134 lệnh · lãi 40% · +24R · năm 1 +235$ · năm 2 +316$</i>\n<a href="${PAGE}">Mở trang</a>`;
      if (t.grade === 'P') return `🆕 ${head}\n${(t.info || []).map(x => '• ' + esc(x)).join('\n')}\n${lv} · 0.02 lot ≈ ${(t.risk * 2).toFixed(0)}$ rủi ro\nLời 1.5R dời SL về hoà vốn · 2h sáng VN còn lệnh thì đóng\n<i>Kiểm 2 năm vàng: 391 lệnh · lãi 48% · +38R · năm 1 +1212$ · năm 2 +464$ (sụt tối đa 1393$ → lot nhỏ)</i>\n<a href="${PAGE}">Mở trang</a>`;
      if (t.grade === 'K') { const usd = t.sym === 'BTC' ? 0.02 : 2;
        return `🆕 ${head}\n📈 EMA34 M30 ${f(t.ema34)} ${t.side > 0 ? '>' : '<'} EMA89 M30 ${f(t.ema89)} · giá M30 ${t.side > 0 ? 'trên' : 'dưới'} EMA34\n💥 M5 phá ${t.side > 0 ? 'đỉnh' : 'đáy'} swing ${f(t.lvl)} lúc ${vnT(t.ct)} → đặt LIMIT chờ giá quay lại test\n${lv}\nSL = ${t.side > 0 ? 'đáy swing low' : 'đỉnh swing high'} của chân phá · 0.02 lot ≈ ${(t.risk * usd).toFixed(0)}$ rủi ro\n⏳ Huỷ nếu chưa test trước ${vnT(t.expT)} hoặc giá thủng SL trước\n⛔ Không vào nếu giá test trong giờ: ${t.badHours.join(', ')}h\n<a href="${PAGE}">Mở trang</a>`; }
      if (t.grade === 'Z') return `🆕 ${head}\n🧱 Vùng ${t.side > 0 ? 'hỗ trợ' : 'kháng cự'} H4/H1 ${f(t.zone.lo)} – ${f(t.zone.hi)} · ${t.zone.score} điểm (${t.zone.h4} lần chạm H4, ${t.zone.h1} H1${t.zone.flip ? ', đổi vai' : ''})\nQuét ${t.side > 0 ? 'đáy' : 'đỉnh'} vùng: râu M15 ${f(t.sweep)} lúc ${vnT(t.t)} → MSS M15 đóng qua ${f(t.mss)} sau ${t.mssBars} nến\n🤖 AI ${t.ai} điểm: ${esc(t.aiWhy.join(', '))}\n${lv} · 0.01 lot ≈ ${t.risk.toFixed(0)}$ rủi ro (${(t.risk / 5).toFixed(1)}% TK 500$)\nGiữ tối đa 24h\n<a href="${PAGE}">Mở trang</a>`;
      if (t.grade === 'R') return `🆕 ${head}\n⏰ ${t.hour}h VN (đã bỏ giờ hay dính SL: 8h, 23h)\nEMA34 M30 ${f(t.ema34)} ${t.side > 0 ? '>' : '<'} EMA89 M30 ${f(t.ema89)} · ≥ 6 nến M30 đóng ${t.side > 0 ? 'trên' : 'dưới'} EMA21\nGiá test EMA21 M30 ${f(t.ema21)} lúc ${vnT(t.touchT)} (râu ${f(t.touchP)}) → nến M5 bật lại xác nhận\n${lv} · 0.02 lot · giữ tối đa 12h\n<a href="${PAGE}">Mở trang</a>`;
      if (t.grade === 'E') return `🆕 ${head}\n⏰ ${t.hour}h — khung giờ thắng cao\nEMA34 M30 ${f(t.ema34)} ${t.side > 0 ? '>' : '<'} EMA89 M30 ${f(t.ema89)} · giá hồi về EMA34 lúc ${vnT(t.pullT)}\nĐã quét ${esc(t.sweepName)} ${f(t.sweep)} → ${t.breakType || 'MSS'} M5 + FVG M5 ${f(t.fvg && t.fvg.bot)} – ${f(t.fvg && t.fvg.top)}${t.ob ? `\nOrder Block ${f(t.ob.bot)} – ${f(t.ob.top)}` : ''}\n${lv} · 0.02 lot\n<a href="${PAGE}">Mở trang</a>`;
      if (t.grade === 'W') return `🆕 ${head}\n${sw.replace(' → MSS + FVG', ' → MSS M5 + FVG M5')}\n${zone}\n${lv} · mục tiêu sóng <b>${f(Math.abs(t.tp - t.entry))} giá</b>\nHuỷ nếu chưa khớp trước ${vnT(t.ct + WAVE.CFG.expiry * 3e5)}\n<a href="${PAGE}">Mở trang</a>`;
      return `🆕 ${head}\n${sw}\n${zone}\n${lv}\n${t.ctx ? '<i>' + esc(V3.ctxText(t.ctx)) + '</i>\n' : ''}Huỷ nếu chưa khớp trước ${vnT(t.ct + (t.grade === 'S' ? V3.BOS15.expiry[t.tf] : V3.CFG[t.tf].expiry) * MS[t.tf])}\n<a href="${PAGE}">Mở trang</a>`;
    case 'OPEN': return `🎯 Đã khớp ${head}\n${lv}\nKhớp lúc ${vnT(t.fillT)}`;
    case 'WIN': return `✅ Chạm TP ${head}\n${lv}\nKết quả <b>+${t.r.toFixed(2)}R</b>${t.pts != null ? ` (+${t.pts.toFixed(1)} giá)` : ''} · đóng ${vnT(t.exitT)}`;
    case 'LOSS': return `❌ Dính SL ${head}\n${lv}\nKết quả <b>${t.r.toFixed(2)}R</b>${t.pts != null ? ` (${t.pts.toFixed(1)} giá)` : ''} · đóng ${vnT(t.exitT)}`;
    case 'TIME': return `⏱ Hết giờ giữ lệnh ${head}\nĐóng ${f(t.exitP)} · <b>${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R</b>`;
    default: return `⚪ Huỷ ${head}\n${esc(V3.STATE_VI[t.state] || t.state)}${t.why ? ' — ' + esc(t.why) : ''}`;
  }
}
const toSend = [];
// CHỈ gửi Telegram lệnh 🔁 EMA hồi và 🧲 Test EMA21 M30 trong giờ cho phép (tgOK); mọi mô hình khác chỉ ghi nhật ký
const NOWIN = (g) => g === 'E' || g === 'R' || g === 'Z' || g === 'I' || g === 'P' || g === 'H';
// Letuan 07/11/2026: Telegram CHỈ gửi cách 🔂 BOS M5 + retest (grade K) — mọi mô hình khác chỉ ghi nhật ký & web
// 11/11/2026: rà lại mọi chiến lược trên 2 năm vàng (research/audit-all.mjs) → chỉ giữ chiến lược lời cả 2 năm: 🌅 P · 🧭 X · 🧱 Z · 🤖 I. 🔂 BOS M5 (năm 1 −21R) thôi gửi.
const KEEP = new Set(['P', 'X', 'Z', 'I', 'H']);
// 11/11/2026 (19h): Letuan chọn đúng "kế hoạch vào lệnh" (doc): Telegram chỉ 3 kiểu lệnh 🧭 X · 🧱 Z · 🎯 H, kèm luật "không vào khi"; 🌅 P và 🤖 I chỉ ghi nhật ký / tham khảo
const PLAN = new Set(['X', 'Z', 'H']);
const TGONLY = (g) => PLAN.has(g);
// luật "không vào khi" của kế hoạch — chặn gửi Telegram lệnh mới
function gate(t) {
  const h = (new Date(t.ct).getUTCHours() + 7) % 24; if (h >= 23 || h < 7) return 'ngoài giờ (23h–7h VN)';
  // 13/11: bỏ luật 'SL > 15 giá' — kiểm 2 năm: lệnh 🧱 SL > 15 lời +1361$ (≤15 chỉ +334$), 🧭 SL > 15 lời +393$ → chặn là bỏ mất nửa tốt nhất. Thay bằng ghi rõ rủi ro $ theo lot.
  const nw = (J.news || []).find(z => Math.abs(z.t - t.ct) <= 18e5); if (nw) return `sát tin ${nw.title}`;
  const d0 = Math.floor((t.ct + 7 * 36e5) / 864e5); const loss = J.trades.filter(z => PLAN.has(z.grade) && z.state === 'LOSS' && z.tgOK && z.exitT && Math.floor((z.exitT + 7 * 36e5) / 864e5) === d0 && z.exitT <= t.ct).length;
  if (loss >= 2) return 'đã thua 2 lệnh hôm nay';
  if (J.trades.some(z => PLAN.has(z.grade) && z !== t && z.tgOK && z.live && z.state === 'OPEN')) return 'đang có lệnh khác của kế hoạch';
  return null;
}
const pxTag = (t) => { if (t.pxSrc || !t.sym) return; const T = J.tv[t.sym]; if (TVON(t.sym)) { t.pxSrc = `Giá TradingView ${T.code} (đã cộng ${T.off >= 0 ? '+' : ''}${T.off} vào giá OKX)`; t.tvOff = T.off; } else t.pxSrc = 'Giá ' + (SRC[t.sym] || 'OKX') + (J.tv[t.sym] && J.tv[t.sym].code ? ' — chưa lấy được giá TradingView' : ''); };
const notify = (t) => { pxTag(t); if (t.live && TGONLY(t.grade) && t.tgOK && !t.tg && !t.gated) { t.gated = true; const why = gate(t); if (why) { t.tgOK = false; t.gate = why; } } if (!t.live || !TGONLY(t.grade) || !(t.tgOK || (t.tg && t.tg.length))) return; t.tg = t.tg || []; if (t.state === 'OPEN' && !t.tg.includes('PENDING')) { t.tg.push('PENDING'); if (NOWIN(t.grade)) t.tg.push('OPEN'); toSend.push(tgText({ ...t, state: 'PENDING' })); } if (NOWIN(t.grade) && !t.tg.includes('PENDING')) { t.tg.push('PENDING', 'OPEN'); toSend.push(tgText({ ...t, state: 'PENDING' })); }
  if (V3.FINAL[t.state] && t.fillT && !t.tg.includes('OPEN') && t.state !== 'SKIP') { t.tg.push('OPEN'); toSend.push(tgText({ ...t, state: 'OPEN' })); } if (t.tg.includes(t.state)) return; t.tg.push(t.state); toSend.push(tgText(t)); };
const closed = (c) => c.filter(x => x.ct <= NOW());

const RULES = 'Ghi nhận mọi setup ICT/SMC quét thanh khoản (PDH/PDL, tuần, London, phiên Á, swing) → MSS + FVG; nhãn Chuẩn = Quét PDH/PDL → MSS có displacement → limit tại FVG · M15: cấu trúc swing H4 cùng chiều, ngoài phiên Á (mép, SL+0.5ATR) · M30: mọi setup (CE, SL+1ATR) · H1: cả hai chiều (mép, SL+1ATR) · chờ khớp M15 6h / M30 10h / H1 16h · TP 2R';
let J = { version: V3.version, rules: RULES, trades: [] };
try { J = { ...J, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (_) {}
// ---- 💱 Giá theo TradingView: mỗi lượt lấy giá TradingView + giá OKX cùng lúc → độ lệch = trung vị 12 lượt gần nhất (~1 giờ)
// cộng độ lệch vào nến OKX trước khi phân tích → Entry/SL/TP trên web & Telegram là giá TradingView (MT5 Exness thì giữ nguyên giá MT5)
const TVC = { XAU: process.env.TV_XAU || 'OANDA:XAUUSD', BTC: process.env.TV_BTC || 'BITSTAMP:BTCUSD' };
async function tvPrice(code) {
  const tries = [
    async () => (await j(`https://scanner.tradingview.com/symbol?symbol=${encodeURIComponent(code)}&fields=close`)).close,
    async () => { const r = await fetch('https://scanner.tradingview.com/global/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ symbols: { tickers: [code], query: { types: [] } }, columns: ['close'] }), signal: AbortSignal.timeout(15000) }); const x = await r.json(); return x.data && x.data[0] && x.data[0].d[0]; }];
  for (const f of tries) { try { const v = +(await f()); if (isFinite(v) && v > 0) return v; } catch (e) { console.log('TradingView lỗi', code, e.message); } }
  return null;
}
const goldOpenNow = (t) => { const d = new Date(t + 7 * 36e5), wd = d.getUTCDay(), h = d.getUTCHours(); return wd === 0 ? false : wd === 6 ? h < 4 : wd === 1 ? h >= 5 : true; };
J.tv = J.tv || {}; const RUN0 = NOW() - 1000;
for (const sym of Object.keys(SYMS)) {
  const T = J.tv[sym] = { hist: [], ...(J.tv[sym] || {}), code: TVC[sym], okxInst: SYMS[sym].okx };
  if (!process.env.MOCK_DIR && (sym !== 'XAU' || goldOpenNow(Date.now()))) { // vàng cuối tuần: TradingView đứng giá, OKX vẫn chạy → không lấy mẫu
    try { const [px, tk] = await Promise.all([tvPrice(T.code), j(`https://www.okx.com/api/v5/market/ticker?instId=${SYMS[sym].okx}`)]), ok = tk && tk.data && tk.data[0] && +tk.data[0].last;
      if (px && ok) T.hist = [...T.hist.filter(h => h.code === T.code), { at: Date.now(), px, okx: ok, d: +(px - ok).toFixed(4), code: T.code }].slice(-12);
      else T.lastErr = 'Không lấy được giá ' + (px ? 'OKX' : 'TradingView ' + T.code); } catch (e) { T.lastErr = e.message; }
  }
  const H = T.hist.filter(h => (process.env.MOCK_DIR ? 0 : Date.now()) - h.at < 3 * 864e5);
  if (H.length) { const v = H.map(h => h.d).sort((a, b) => a - b); T.off = +v[v.length >> 1].toFixed(SYMS[sym].dp); T.n = H.length; T.at = H[H.length - 1].at; T.px = H[H.length - 1].px; T.okx = H[H.length - 1].okx; T.ok = true; OFF[SYMS[sym].okx] = T.off; }
  else { T.ok = false; T.off = 0; }
}
const TVON = (sym) => !!(J.tv[sym] && J.tv[sym].ok) && !/^MT5/.test(SRC[sym] || '');
const pxLabel = (t) => t.pxSrc ? t.pxSrc : '';
// đổi bản quy tắc: bỏ các lệnh "tính lại" của bản cũ (sẽ tính lại theo bản mới), giữ nguyên lệnh đã ghi trực tiếp
if (J.version !== V3.version) J.trades = J.trades.filter(t => t.live || (t.grade === 'W' && t.ver === WAVE.version) || (t.grade === 'E' && t.ver === EMAPB.version) || (t.grade === 'R' && t.ver === EMA21.version) || (t.grade === 'Z' && t.ver === ZONES.version) || (t.grade === 'Q' && t.ver === QB.version) || (t.grade === 'P' && t.ver === PB.version) || (t.grade === 'C' && t.ver === CT.version) || (t.grade === 'K' && t.ver === BOSRT.version) || (t.grade === 'I' && t.ver === AIB.version) || (t.grade === 'X' && t.ver === XH.version) || (t.grade === 'H' && t.ver === HS.version));
J.version = V3.version; J.rules = RULES;
J.trades = J.trades.filter(t => t.grade !== 'E' || t.ver === EMAPB.version || t.live); // đổi bản EMA hồi: tính lại
J.trades = J.trades.filter(t => t.grade !== 'R' || t.ver === EMA21.version || t.live); // đổi bản Test EMA21: tính lại
J.trades = J.trades.filter(t => t.grade !== 'Z' || t.ver === ZONES.version || t.live); // đổi bản Vùng S/R: tính lại
J.trades = J.trades.filter(t => t.grade !== 'Q' || t.ver === QB.version || t.live); // đổi bản Quét biên: tính lại
J.trades = J.trades.filter(t => t.grade !== 'P' || t.ver === PB.version || t.live); // đổi bản Phá biên phiên Á: tính lại
J.trades = J.trades.filter(t => t.grade !== 'C' || t.ver === CT.version || t.live); // đổi bản Công thức: tính lại
J.trades = J.trades.filter(t => t.grade !== 'K' || t.ver === BOSRT.version || t.live); // đổi bản BOS M5: tính lại
J.trades = J.trades.filter(t => t.grade !== 'I' || t.ver === AIB.version || t.live);
J.trades = J.trades.filter(t => t.grade !== 'X' || t.ver === XH.version || t.live);
J.trades = J.trades.filter(t => t.grade !== 'H' || t.ver === HS.version || t.live); // đổi bản AI: nạp lại lịch sử
const byId = new Map(J.trades.map(x => [x.id, x]));
// nạp sẵn lịch sử 12 tháng (tính lại từ OKX) — chỉ thêm lệnh chưa có, cùng bản quy tắc
try { const SEED = JSON.parse(fs.readFileSync(path.join(__dir, 'journal-seed.json'), 'utf8'));
  if (SEED.version === V3.version) { let n = 0; for (const t of SEED.trades) if (!byId.has(t.id) && (t.grade !== 'W' || t.ver === WAVE.version) && (t.grade !== 'E' || t.ver === EMAPB.version) && (t.grade !== 'R' || t.ver === EMA21.version) && (t.grade !== 'Z' || t.ver === ZONES.version) && (t.grade !== 'Q' || t.ver === QB.version) && (t.grade !== 'P' || t.ver === PB.version) && (t.grade !== 'C' || t.ver === CT.version) && (t.grade !== 'K' || t.ver === BOSRT.version) && (t.grade !== 'I' || t.ver === AIB.version) && (t.grade !== 'X' || t.ver === XH.version) && (t.grade !== 'H' || t.ver === HS.version)) { J.trades.push(t); byId.set(t.id, t); n++; } if (n) console.log(`Nạp ${n} lệnh lịch sử 12 tháng`); } } catch (_) {}
let added = 0, changed = 0, XAU15 = null, XAUH1 = null; const errs = [], DS = {}, SRC = {}, L_SRC = (sym) => SRC[sym] || 'OKX ' + SYMS[sym].okx;
for (const sym of Object.keys(SYMS)) {
  let L;
  try { L = await load(sym); } catch (e) { errs.push(sym + ': ' + e.message); continue; }
  const D = { m15: closed(L.D.m15), h1: closed(L.D.h1) }; D.m30 = V3.resample(D.m15, MS.m30);
  if (sym === 'XAU') { XAU15 = D.m15; XAUH1 = D.h1; }
  DS[sym] = { m15: D.m15, h1: D.h1 }; SRC[sym] = L.src;
  const res = V3.runAll(D, { spread: SYMS[sym].spread, now: NOW() });
  if (sym === 'XAU') res.push(...V3.runBos(D, { spread: SYMS[sym].spread, now: NOW() }));
  for (const s of res) {
    if (s.state === 'SKIP' && /^M5 không có/.test(s.why || '')) continue; // M5 đứng riêng: không phải tín hiệu
    const id = `${sym}-${s.id}`, old = byId.get(id);
    if (!old) {
      const rec = { ...s, id, sym, ver: V3.version, src: L.src, seen: NOW(), lastT: D[s.tf][D[s.tf].length - 1].ct, dp: SYMS[sym].dp };
      // tín hiệu tạo trước lúc nhật ký thấy nó > 1 nến: đánh dấu "tính lại"
      rec.live = NOW() - s.ct < 2 * MS[s.tf] + 10 * 60e3;
      J.trades.push(rec); byId.set(id, rec); added++; notify(rec); continue;
    }
    if (V3.FINAL[old.state]) continue;
    if (s.state === 'SKIP' && old.state === 'PENDING' && (old.grade === 'A' || old.grade === 'S')) { old.state = 'SKIP'; old.why = s.why; old.exitT = NOW(); changed++; notify(old); continue; }
    if (!D[old.tf]) continue; // lệnh M5 của bản V3 cũ: không còn dữ liệu M5
    const sv = V3.CFG[old.tf]; if (old.grade === 'S') V3.CFG[old.tf] = { ...sv, expiry: V3.BOS15.expiry[old.tf], hold: V3.BOS15.hold[old.tf] };
    const before = old.state; V3.track(old, D[old.tf]); V3.CFG[old.tf] = sv; if (old.state !== before) { changed++; notify(old); }
  }
}
// ---- Sóng 15 (vàng, M5): quét thanh khoản → MSS M5 → limit mép FVG M5 · SL ngoài điểm quét · TP max(2R, 15 giá)
try {
  let m5, m15;
  if (process.env.MOCK_DIR) { const rd = (tf) => JSON.parse(fs.readFileSync(path.join(process.env.MOCK_DIR, `XAU_${tf}.json`), 'utf8')).map(k => ({ t: k[0], ct: k[0] + MS[tf], o: k[1], h: k[2], l: k[3], c: k[4] })).filter(x => x.ct <= NOW()); m5 = rd('m5').slice(-NEED.m5); m15 = rd('m15').slice(-3000); XAUH1 = rd('h1').slice(-2200); }
  else { m5 = closed(await okx(SYMS.XAU.okx, 'm5')); m15 = XAU15 || []; }
  // các mô hình chạy trên M5 vàng: tính lại toàn bộ cửa sổ mỗi lần, cập nhật lệnh chưa kết thúc
  for (const [MOD, G] of [[WAVE, 'W'], [EMAPB, 'E'], [EMA21, 'R'], [ZONES, 'Z'], [QB, 'Q'], [PB, 'P'], [XH, 'X']]) {
    const W = MOD.run({ m5, m15, h1: XAUH1 || [] }, { spread: SYMS.XAU.spread }), seenW = new Set(), tg = MOD.telegram !== false;
    for (const s of W) {
      const id = `XAU-${s.id}`, old = byId.get(id); seenW.add(id);
      if (!old) { const rec = { ...s, id, sym: 'XAU', ver: MOD.version, src: process.env.MOCK_DIR ? 'MOCK' : 'OKX ' + SYMS.XAU.okx, seen: NOW(), dp: 2, live: NOW() - s.ct < 3 * 3e5 + 10 * 60e3 };
        J.trades.push(rec); byId.set(id, rec); added++; if (tg) notify(rec); continue; }
      if (MOD.FINAL[old.state]) continue;
      const before = old.state; for (const k of ['state', 'fillT', 'exitT', 'exitP', 'r', 'pts', 'why']) if (s[k] !== undefined) old[k] = s[k];
      if (old.state !== before) { changed++; if (tg) notify(old); }
    }
    for (const t of J.trades) if (t.grade === G && !MOD.FINAL[t.state] && !seenW.has(t.id) && NOW() - t.ct > 2 * 864e5) { t.state = 'TIME'; t.why = 'Ra ngoài cửa sổ dữ liệu M5'; }
  }
} catch (e) { errs.push('Mô hình M5 (Sóng 15 / EMA hồi / Test EMA21): ' + e.message); }
// ---- 📐 Công thức (vàng + BTC · M5/M15/M30): quét thanh khoản → MSS + FVG → limit giữa FVG · cấu trúc H4 · TP 2R — chỉ ghi nhật ký
for (const sym of Object.keys(SYMS)) {
  try {
    let m5, m15, h1;
    if (process.env.MOCK_DIR) { const rd = (tf) => JSON.parse(fs.readFileSync(path.join(process.env.MOCK_DIR, `${sym}_${tf}.json`), 'utf8')).map(k => ({ t: k[0], ct: k[0] + MS[tf], o: k[1], h: k[2], l: k[3], c: k[4] })).filter(x => x.ct <= NOW()); m5 = rd('m5').slice(-NEED.m5); m15 = rd('m15').slice(-3000); h1 = rd('h1').slice(-2200); }
    else { if (!DS[sym]) continue; m5 = closed(await okx(SYMS[sym].okx, 'm5')); m15 = DS[sym].m15; h1 = DS[sym].h1; }
    DS[sym] = { ...(DS[sym] || {}), m5, m15, h1 };
    const W = CT.run({ m5, m15, h1 }, { spread: SYMS[sym].spread }), seen = new Set(), tg = CT.telegram !== false;
    for (const s of W) {
      const id = `${sym}-${s.id}`, old = byId.get(id); seen.add(id);
      if (!old) { const rec = { ...s, id, sym, ver: CT.version, src: process.env.MOCK_DIR ? 'MOCK' : 'OKX ' + SYMS[sym].okx, seen: NOW(), dp: SYMS[sym].dp, live: NOW() - s.ct < 3 * 3e5 + 10 * 60e3 };
        J.trades.push(rec); byId.set(id, rec); added++; if (tg) notify(rec); continue; }
      if (CT.FINAL[old.state]) continue;
      const before = old.state; for (const k of ['state', 'fillT', 'exitT', 'exitP', 'r', 'pts']) old[k] = s[k];
      if (old.state !== before) { changed++; if (tg) notify(old); }
    }
    for (const t of J.trades) if (t.grade === 'C' && t.sym === sym && !CT.FINAL[t.state] && !seen.has(t.id) && NOW() - t.ct > 2 * 864e5) { t.state = 'TIME'; t.why = 'Ra ngoài cửa sổ dữ liệu M5'; }
  } catch (e) { errs.push('📐 Công thức ' + sym + ': ' + e.message); }
}
// ---- 🎯 Hồi sâu qua EMA89 (vàng M15) — kèo hiếm của kế hoạch
try {
  const Dk = DS.XAU; if (!Dk || !Dk.m15) throw new Error('chưa có dữ liệu M15');
  const W = HS.run({ m15: Dk.m15 }, { spread: SYMS.XAU.spread }), seen = new Set();
  for (const s of W) {
    const id = `XAU-${s.id}`, old = byId.get(id); seen.add(id);
    if (!old) { const rec = { ...s, id, sym: 'XAU', ver: HS.version, src: process.env.MOCK_DIR ? 'MOCK' : L_SRC('XAU'), seen: NOW(), dp: 2, live: NOW() - s.ct < 2 * 9e5 + 10 * 60e3 };
      J.trades.push(rec); byId.set(id, rec); added++; notify(rec); continue; }
    if (HS.FINAL[old.state]) continue;
    const before = old.state; for (const k of ['state', 'exitT', 'exitP', 'r', 'pts']) old[k] = s[k];
    if (old.state !== before) { changed++; notify(old); }
  }
  for (const t of J.trades) if (t.grade === 'H' && !HS.FINAL[t.state] && !seen.has(t.id) && NOW() - t.ct > 2 * 864e5) { t.state = 'TIME'; t.why = 'Ra ngoài cửa sổ dữ liệu'; }
} catch (e) { errs.push('🎯 Hồi sâu: ' + e.message); }
// ---- 🔂 BOS M5 + retest (vàng + BTC): EMA34/89 M30 → M5 phá swing → limit tại mức phá chờ test ≤ 6h → SL swing · TP 1.2R · bỏ giờ thua — CÁCH DUY NHẤT GỬI TELEGRAM
for (const sym of Object.keys(SYMS)) {
  try {
    const Dk = DS[sym]; if (!Dk || !Dk.m5 || !Dk.m15) { errs.push('🔂 BOS M5 ' + sym + ': chưa có dữ liệu M5'); continue; }
    const W = BOSRT.run({ m5: Dk.m5, m15: Dk.m15 }, { spread: SYMS[sym].spread, sym }), seen = new Set();
    for (const s of W) {
      const id = `${sym}-${s.id}`, old = byId.get(id); seen.add(id);
      if (!old) { const rec = { ...s, id, sym, ver: BOSRT.version, src: process.env.MOCK_DIR ? 'MOCK' : 'OKX ' + SYMS[sym].okx, seen: NOW(), dp: SYMS[sym].dp, live: NOW() - s.ct < 3 * 3e5 + 10 * 60e3 };
        J.trades.push(rec); byId.set(id, rec); added++; notify(rec); continue; }
      if (BOSRT.FINAL[old.state]) continue;
      const before = old.state; for (const k of ['state', 'entry', 'tp', 'risk', 'fillT', 'fillHour', 'exitT', 'exitP', 'r', 'pts', 'why', 'ghost']) old[k] = s[k];
      if (old.state !== before) { changed++; notify(old); }
    }
    for (const t of J.trades) if (t.grade === 'K' && t.sym === sym && !BOSRT.FINAL[t.state] && !seen.has(t.id) && NOW() - t.ct > 2 * 864e5) { t.state = t.fillT ? 'TIME' : 'EXPIRED'; t.why = 'Ra ngoài cửa sổ dữ liệu M5'; }
  } catch (e) { errs.push('🔂 BOS M5 ' + sym + ': ' + e.message); }
}
// ---- 🤖 AI trợ lý (vàng M15): 8 loại ứng viên ICT/SMC/EMA/breakout → AI (LightGBM) chấm xác suất → vào khi ≥ ngưỡng · GỬI TELEGRAM
//      + "bây giờ cần làm gì" cho cả vàng và BTC (BTC chỉ phân tích, không vào lệnh) · báo kế hoạch Telegram lúc 13h và 19h VN
{ const R = AIM.report; J.ai = { version: AIB.version, thr: AIM.thr, rr: AIM.rr, trained: AIM.trained, report: { from: R.from, to: R.to, auc: R.auc, base: R.base, rows: R.rows, monthly: R.monthly }, typeStats: AIM.typeStats, top: AIM.top, plans: (J.ai && J.ai.plans) || {}, updated: NOW() };
  for (const sym of Object.keys(SYMS)) {
    try {
      const Dk = DS[sym]; if (!Dk || !Dk.m15 || !Dk.h1) { errs.push('🤖 AI ' + sym + ': chưa có dữ liệu'); continue; }
      const D = { m5: Dk.m15, m15: Dk.m15, h1: Dk.h1 };
      J.ai[sym] = AIB.status(D, { spread: SYMS[sym].spread, dp: SYMS[sym].dp, analysisOnly: sym !== 'XAU' });
      if (sym !== 'XAU') { if (J.ai[sym]) J.ai[sym].note = 'BTC: AI chỉ phân tích — kiểm walk-forward trên BTC không có lợi thế (spread lớn so với biến động M15) nên không vào lệnh'; continue; }
      const W = AIB.run(D, { spread: SYMS[sym].spread, from: D.m5.length - 300 }), seen = new Set();
      for (const s of W) {
        if (s.ct < AI_DEPLOY) continue;
        const id = `${sym}-${s.id}`, old = byId.get(id); seen.add(id);
        if (!old) { const rec = { ...s, id, sym, ver: AIB.version, src: process.env.MOCK_DIR ? 'MOCK' : L_SRC(sym), seen: NOW(), dp: SYMS[sym].dp, live: NOW() - s.ct < 2 * 9e5 + 10 * 60e3 };
          J.trades.push(rec); byId.set(id, rec); added++; notify(rec); continue; }
        if (AIB.FINAL[old.state]) continue;
        const before = old.state; for (const k of ['state', 'exitT', 'exitP', 'r', 'pts']) old[k] = s[k];
        if (old.state !== before) { changed++; notify(old); }
      }
      for (const t of J.trades) if (t.grade === 'I' && t.sym === sym && !AIB.FINAL[t.state] && !seen.has(t.id) && NOW() - t.ct > 2 * 864e5) { t.state = 'TIME'; t.why = 'Ra ngoài cửa sổ dữ liệu'; }
    } catch (e) { errs.push('🤖 AI ' + sym + ': ' + e.message); }
  }
  // (13/11: bản tin kế hoạch AI cũ được thay bằng 📋 Báo cáo phiên bên dưới)

}
// ---- 📋 BÁO CÁO PHIÊN (kế hoạch giao dịch): EMA34/89 H4/H1/M15 · thanh khoản đã quét · biên Á · chờ test/hồi về đâu cho 🧭 🧱 🎯 · không vào khi
//      tính mỗi lượt cho web; gửi Telegram lần chạy đầu sau 7h · 13h · 19h VN (ngày thường)
try {
  if (!process.env.MOCK_DIR && (!J.newsAt || NOW() - J.newsAt > 3 * 36e5)) { try { const ff = await j('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
      J.newsAll = ff.filter(z => z.impact === 'High' && ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CHF', 'AUD', 'CAD'].includes(z.country)).map(z => ({ t: Date.parse(z.date), country: z.country, title: z.title, forecast: z.forecast || '', previous: z.previous || '' })).filter(z => isFinite(z.t));
      J.news = J.newsAll.filter(z => z.country === 'USD').map(z => ({ t: z.t, title: 'USD ' + z.title })); J.newsAt = NOW(); } catch (e) { errs.push('Lịch tin: ' + e.message); } }
  // tâm lý thị trường: DXY + lợi suất 10 năm (Yahoo), tỉ lệ tài khoản Long/Short XAU (OKX), tiêu đề tin vàng (Google News) — làm mới mỗi 30 phút
  if (!process.env.MOCK_DIR && (!J.mktAt || NOW() - J.mktAt > 18e5)) {
    const M = J.mkt || {}, UA = { 'user-agent': 'tin-hieu-bot/1.0' };
    const yh = async (sym) => { const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1h&range=5d`, { headers: UA, signal: AbortSignal.timeout(15000) }); const o = (await r.json()).chart.result[0];
      const ts = o.timestamp, cl = o.indicators.quote[0].close; const pts = ts.map((t, i) => [t * 1000, cl[i]]).filter(z => z[1] != null); const last = pts[pts.length - 1]; let prev = pts[0]; for (const z of pts) if (z[0] <= last[0] - 864e5) prev = z; return { last: last[1], prev: prev[1], t: last[0] }; };
    try { const d = await yh('DX-Y.NYB'); M.dxy = { last: d.last, chPct: (d.last - d.prev) / d.prev * 100, t: d.t }; } catch (e) { errs.push('DXY: ' + e.message); }
    try { const d = await yh('^TNX'); M.us10y = { last: d.last, chBp: (d.last - d.prev) * 100, t: d.t }; } catch (e) { errs.push('Lợi suất 10 năm: ' + e.message); }
    try { const o = await j('https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio-contract?instId=XAU-USDT-SWAP&period=1H&limit=25'); const a = o.data || [];
      if (a.length) M.ls = { last: +a[0][1], prev: +a[a.length - 1][1], t: +a[0][0] }; } catch (e) { errs.push('Long/Short OKX: ' + e.message); }
    try { const r = await fetch('https://news.google.com/rss/search?q=gold+price+OR+XAUUSD&hl=en-US&gl=US&ceid=US:en', { headers: UA, signal: AbortSignal.timeout(15000) }); const x = await r.text();
      const BULL = /\b(rise|rises|rising|rose|gain|gains|gained|rally|rallies|rallied|jump|jumps|surge|surges|higher|rebound|rebounds|climb|climbs|record|bullish|soar|soars|advance|advances|upside)\b/i, BEAR = /\b(fall|falls|falling|fell|drop|drops|dropped|slip|slips|decline|declines|lower|slump|tumble|tumbles|bearish|retreat|retreats|plunge|plunges|sink|sinks|pressure|weighs|slide|slides|downside)\b/i;
      const items = [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => { const g = (k) => ((m[1].match(new RegExp(`<${k}[^>]*>([\\s\\S]*?)<\\/${k}>`)) || [])[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
        const title = g('title'), t = Date.parse(g('pubDate')); const s = (BULL.test(title) ? 1 : 0) - (BEAR.test(title) ? 1 : 0); return { title, t, s }; }).filter(z => isFinite(z.t) && z.t > NOW() - 864e5).sort((a, b) => b.t - a.t);
      M.head = { score: items.reduce((u, z) => u + z.s, 0), bull: items.filter(z => z.s > 0).length, bear: items.filter(z => z.s < 0).length, n: items.length, items: items.slice(0, 8) }; } catch (e) { errs.push('Tin tức: ' + e.message); }
    J.mkt = M; J.mktAt = NOW(); }
  J.kh = J.kh || {}; const sent = J.kh.sent || {};
  const Dk = DS.XAU; if (Dk && Dk.m15 && Dk.h1) {
    const zr = ZONES.analyze({ h1: Dk.h1, m15: Dk.m15 }, { spread: SYMS.XAU.spread });
    const xh = J.trades.filter(t => t.grade === 'X' && t.sym === 'XAU').sort((a, b) => a.t - b.t).slice(-1)[0];
    const d0 = Math.floor((NOW() + 7 * 36e5) / 864e5), today = J.trades.filter(t => PLAN.has(t.grade) && t.tgOK && t.exitT && Math.floor((t.exitT + 7 * 36e5) / 864e5) === d0);
    const R = KH.report({ m15: Dk.m15, h1: Dk.h1 }, { spread: SYMS.XAU.spread, dp: 2, now: NOW(), zr, xh, news: J.news || [], newsAll: J.newsAll || [], mkt: J.mkt || {}, trades: today, ai: J.ai && J.ai.XAU });
    if (R) { R.text = KH.text(R, 'XAU', { dp: 2 }); J.kh.XAU = R;
      const vd = new Date(NOW() + 7 * 36e5), vh = vd.getUTCHours(), key = vd.toISOString().slice(0, 10) + '-' + (vh >= 19 ? 'N' : vh >= 13 ? 'L' : vh >= 7 ? 'A' : '');
      if (/-[ALN]$/.test(key) && ![0, 6].includes(vd.getUTCDay()) && !sent[key] && vh < 23) { { const full = R.text + `\n<a href="${PAGE}">Mở trang</a>`; if (full.length <= 4000) toSend.push(full); else { const cut = full.indexOf('\n<b>1. Xu hướng'); toSend.push(full.slice(0, cut)); toSend.push('📋 <b>XAU (tiếp)</b>' + full.slice(cut)); } } J.kh.sent = { [key]: NOW() }; }
      else J.kh.sent = sent; }
  }
} catch (e) { errs.push('📋 Báo cáo phiên: ' + e.message); }
// lệnh treo quá lâu ngoài cửa sổ dữ liệu
for (const t of J.trades) if (t.grade !== 'I' && t.grade !== 'W' && t.grade !== 'E' && t.grade !== 'R' && t.grade !== 'Z' && t.grade !== 'C' && t.grade !== 'K' && t.grade !== 'Q' && t.grade !== 'P' && t.grade !== 'X' && t.grade !== 'H' && !V3.FINAL[t.state] && NOW() - t.ct > 30 * 864e5) { t.state = 'TIME'; t.why = 'Quá 30 ngày không cập nhật được'; }
// ---- 💼 Tài khoản DEMO (giấy) 500 USD — chạy trên máy chủ, đúng luật 2 EA trên MT5:
//  EMA_Hoi_ICT (lệnh 🔁 EMA hồi trong giờ cho phép, SL ≤ 30 giá) + EMA21_Test_M30 (lệnh 🧲 Test EMA21) · 0.02 lot · mỗi lần chỉ 1 lệnh trên vàng (giống InpOnlyOneOnSym)
{ const D = J.demo = J.demo || { start: NOW(), bal0: 500, lot: 0.02, taken: [] };
  const USDPT = 100 * D.lot, FIN = (st) => st === 'WIN' || st === 'LOSS' || st === 'TIME';
  const pick = (t) => ({ id: t.id, grade: t.grade, side: t.side, ct: t.ct, hour: t.hour, entry: t.entry, sl: t.sl, tp: t.tp, risk: t.risk, state: t.state, exitT: t.exitT, exitP: t.exitP, pts: t.pts, live: t.live });
  for (const x of D.taken) { const t = byId.get(x.id); if (t && !FIN(x.state)) Object.assign(x, pick(t)); }
  const okEA = (t) => t.sym === 'XAU' && t.ct >= D.start && ((t.grade === 'E' && t.tgOK && t.risk <= 30) || t.grade === 'R' || (t.grade === 'Z' && t.tgOK));
  const have = new Set(D.taken.map(x => x.id));
  for (const t of J.trades.filter(t => okEA(t) && !have.has(t.id)).sort((a, b) => a.ct - b.ct)) {
    if (D.taken.some(x => !FIN(x.state))) break;                                   // đang có lệnh → bỏ tín hiệu
    const lastExit = Math.max(0, ...D.taken.map(x => x.exitT || 0)); if (t.ct < lastExit) continue; // tín hiệu lúc lệnh trước chưa đóng
    D.taken.push(pick(t)); have.add(t.id); }
  let bal = D.bal0, peak = D.bal0, dd = 0;
  for (const x of D.taken) { if (FIN(x.state) && x.pts != null) { x.usd = +(x.pts * USDPT).toFixed(2); bal += x.usd; peak = Math.max(peak, bal); dd = Math.max(dd, peak - bal); x.bal = +bal.toFixed(2); }
    if (FIN(x.state) && !x.tgDone) { x.tgDone = true; if (false && x.live !== false && NOW() - (x.exitT || 0) < 2 * 36e5) toSend.push(`💼 <b>Tài khoản demo</b> · ${x.grade === 'Z' ? '🧱 AI Vùng S/R' : x.grade === 'R' ? '🧲 Test EMA21' : '🔁 EMA hồi'} ${x.side > 0 ? 'BUY' : 'SELL'} XAU 0.02 lot\n${x.state === 'WIN' ? '✅ Chạm TP' : x.state === 'LOSS' ? '❌ Dính SL' : '⏱ Hết giờ'} <b>${x.usd >= 0 ? '+' : ''}${x.usd.toFixed(2)}$</b> (${x.pts >= 0 ? '+' : ''}${x.pts.toFixed(1)} giá)\nSố dư <b>${bal.toFixed(2)}$</b> (vốn ${D.bal0}$ · ${bal - D.bal0 >= 0 ? '+' : ''}${(bal - D.bal0).toFixed(2)}$)`); } }
  const C = D.taken.filter(x => FIN(x.state));
  D.balance = +bal.toFixed(2); D.maxDD = +dd.toFixed(2); D.wins = C.filter(x => x.state === 'WIN').length; D.losses = C.filter(x => x.state === 'LOSS').length; D.timeouts = C.filter(x => x.state === 'TIME').length;
  D.open = D.taken.find(x => !FIN(x.state)) || null; D.updated = NOW();
  // báo số dư hằng ngày về Telegram (lần chạy đầu tiên sau 22h giờ VN) + báo mở tài khoản
  const vnD = (t) => new Date(t + 7 * 36e5), today = vnD(NOW()).toISOString().slice(0, 10), vh = vnD(NOW()).getUTCHours();
  const dayStart = Date.parse(today + 'T00:00:00Z') - 7 * 36e5, T = C.filter(x => (x.exitT || 0) >= dayStart), tU = T.reduce((a, x) => a + x.usd, 0);
  const pl = D.balance - D.bal0, wr = C.length ? Math.round(100 * D.wins / C.length) : 0;
  const openTxt = D.open ? `\n🟢 Đang mở: ${D.open.grade === 'Z' ? '🧱 AI Vùng S/R' : D.open.grade === 'R' ? '🧲 Test EMA21' : '🔁 EMA hồi'} ${D.open.side > 0 ? 'BUY' : 'SELL'} · Entry ${(+D.open.entry).toFixed(2)} · SL ${(+D.open.sl).toFixed(2)} · TP ${(+D.open.tp).toFixed(2)}` : '\nKhông có lệnh đang mở';
  if (!D.openMsg) { D.openMsg = NOW(); if (false) toSend.push(`💼 <b>Đã mở tài khoản demo ${D.bal0}$</b> (giấy, trên máy chủ)\nVào lệnh đúng luật 2 EA: 🔁 EMA hồi (giờ tốt, SL ≤ 30) + 🧲 Test EMA21 M30 · 0.02 lot · mỗi lần 1 lệnh\nBáo kết quả mỗi lệnh và số dư lúc 22h mỗi ngày\n<a href="${PAGE}">Mở trang</a>`); }
  // (22h: báo cáo tài khoản DEMO-500 giống MT5 — xem khối J.acct bên dưới)
}
J.trades.sort((a, b) => a.ct - b.ct);
J.updated = NOW(); J.errors = errs;
J.stats = {}; for (const sym of Object.keys(SYMS)) J.stats[sym] = { hoiSau: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'H')), keHoach: V3.stats(J.trades.filter(t => t.sym === sym && PLAN.has(t.grade))), xuHuong: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'X')), giuLai: V3.stats(J.trades.filter(t => t.sym === sym && KEEP.has(t.grade) && t.state !== 'SKIP')), aiTroLy: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'I')), phaBienA: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'P')), quetBien: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'Q')), chuan: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'A')), song15: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'W')), bos15: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'S')), emaHoi: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'E')), vungSR: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'Z' && t.state !== 'SKIP')), test21: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'R')), bos5: BOSRT.stats(J.trades.filter(t => t.sym === sym && t.grade === 'K' && t.ver === BOSRT.version)), congThuc: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'C')), tatca: V3.stats(J.trades.filter(t => t.sym === sym)) };
fs.mkdirSync(DATA, { recursive: true });
J.telegram = { chats: CHATS.length, token: !!TOKEN };
// ---- 💼 TÀI KHOẢN DEMO-500 giống MT5 (mở 11/11/2026 theo yêu cầu Letuan): máy TỰ vào đúng các lệnh bot gửi Telegram
//  (từ 13/11: MỌI lệnh của mọi chiến lược, kể cả bị chặn Telegram) · 0.02 lot · lệnh limit nằm ở "Lệnh chờ" tới khi khớp · khớp/đóng theo nến M5 giá TradingView, có spread
//  Ký quỹ đòn bẩy 1:500 · chưa tính swap qua đêm và hoa hồng
{ const A = J.acct = J.acct || { login: 'DEMO-500', server: 'Máy chủ bot (tài khoản giấy)', start: NOW(), bal0: 500, lot: 0.02, lev: 500, next: 100000001, orders: [] };
  const CS = { XAU: 100, BTC: 1 }, FINX = (st) => /^(WIN|LOSS|TIME)$/.test(st), CANC = (st) => /^(EXPIRED|INVALID|SKIP|MISSED|CANCEL)/.test(st);
  const have = new Set(A.orders.map(o => o.id));
  // 13/11/2026 22h (Letuan): vào HẾT mọi lệnh của mọi chiến lược (vàng + BTC), kể cả lệnh bị luật chặn Telegram — tính lại từ ngày mở tài khoản
for (const t of J.trades.filter(t => t.live && t.state !== 'SKIP' && t.ct >= A.start && !have.has(t.id)).sort((a, b) => a.ct - b.ct)) {
    A.orders.push({ ticket: A.next++, id: t.id, sym: t.sym, grade: t.grade, model: t.model, side: t.side, lot: A.lot, placed: t.ct, kind: t.state === 'PENDING' || (t.fillT && t.fillT > t.ct + 6e4) || (!t.fillT && !FINX(t.state)) ? 'limit' : 'market', entry: t.entry, sl: t.sl, tp: t.tp, state: t.state, pxSrc: t.pxSrc || null, tg: !!(TGONLY(t.grade) && t.tgOK) });
    have.add(t.id); }
  for (const o of A.orders) { if (o.closed) continue; const t = byId.get(o.id); if (!t) continue;
    Object.assign(o, { state: t.state, entry: t.entry, sl: t.sl, tp: t.tp, exitT: t.exitT || null, exitP: t.exitP != null ? t.exitP : null });
    if (!o.fillT && (t.state === 'OPEN' || FINX(t.state))) o.fillT = t.fillT || t.ct;
    if (FINX(t.state) && o.exitP != null) { o.closed = true; o.profit = +(o.side * (o.exitP - o.entry) * CS[o.sym] * o.lot).toFixed(2); o.reason = t.state === 'WIN' ? 'TP' : t.state === 'LOSS' ? 'SL' : 'Hết giờ giữ lệnh'; }
    else if (CANC(t.state)) { o.closed = true; o.cancelled = true; o.profit = 0; o.reason = 'Huỷ lệnh chờ' + (t.why ? ': ' + t.why : ''); o.exitT = o.exitT || NOW(); } }
  let bal = A.bal0, peak = A.bal0, dd = 0;
  for (const o of A.orders.filter(o => o.closed && !o.cancelled).sort((a, b) => (a.exitT || 0) - (b.exitT || 0))) { bal += o.profit; o.bal = +bal.toFixed(2); peak = Math.max(peak, bal); dd = Math.max(dd, peak - bal); }
  let fl = 0, mg = 0;
  for (const o of A.orders.filter(o => !o.closed && o.fillT)) { const c = DS[o.sym] && DS[o.sym].m5 ? DS[o.sym].m5 : DS[o.sym] && DS[o.sym].m15; const px = c && c.length ? c[c.length - 1].c : null;
    if (px == null) continue; const cl = o.side > 0 ? px : px + SYMS[o.sym].spread; o.cur = cl; o.float = +(o.side * (cl - o.entry) * CS[o.sym] * o.lot).toFixed(2); fl += o.float; mg += o.lot * CS[o.sym] * o.entry / A.lev; }
  const W = A.orders.filter(o => o.closed && !o.cancelled);
  Object.assign(A, { balance: +bal.toFixed(2), floating: +fl.toFixed(2), equity: +(bal + fl).toFixed(2), margin: +mg.toFixed(2), free: +(bal + fl - mg).toFixed(2), level: mg ? +((bal + fl) / mg * 100).toFixed(0) : null,
    maxDD: +dd.toFixed(2), wins: W.filter(o => o.profit > 0).length, losses: W.filter(o => o.profit < 0).length, closedN: W.length, updated: NOW() });
  // Telegram: báo cáo tài khoản lần chạy đầu sau 22h VN
  const vD = (t) => new Date(t + 7 * 36e5), td = vD(NOW()).toISOString().slice(0, 10), hh = vD(NOW()).getUTCHours(), d0 = Date.parse(td + 'T00:00:00Z') - 7 * 36e5;
  if (A.dayRep !== td && hh >= 22) { A.dayRep = td; const T = W.filter(o => (o.exitT || 0) >= d0), tP = T.reduce((a, o) => a + o.profit, 0), op = A.orders.filter(o => !o.closed);
    toSend.push(`💼 <b>Tài khoản ${A.login}</b> · ${td.slice(8, 10)}/${td.slice(5, 7)}\nSố dư <b>${A.balance.toFixed(2)}$</b> · Vốn (equity) ${A.equity.toFixed(2)}$ · thả nổi ${A.floating >= 0 ? '+' : ''}${A.floating.toFixed(2)}$\nHôm nay: ${T.length} lệnh đóng · ${T.filter(o => o.profit > 0).length} lời · ${T.filter(o => o.profit < 0).length} lỗ · ${tP >= 0 ? '+' : ''}${tP.toFixed(2)}$\nTừ lúc mở (${vD(A.start).toISOString().slice(8, 10)}/${vD(A.start).toISOString().slice(5, 7)}): ${A.closedN} lệnh · ${A.balance - A.bal0 >= 0 ? '+' : ''}${(A.balance - A.bal0).toFixed(2)}$ · sụt tối đa ${A.maxDD.toFixed(2)}$${op.length ? '\n' + op.map(o => `${o.fillT ? '🟢 Đang chạy' : '⏳ Lệnh chờ'} #${o.ticket} ${o.side > 0 ? 'BUY' : 'SELL'}${o.fillT ? '' : ' LIMIT'} ${o.sym} 0.02 @ ${o.entry.toFixed(SYMS[o.sym].dp)}${o.float != null ? ` · ${o.float >= 0 ? '+' : ''}${o.float.toFixed(2)}$` : ''}`).join('\n') : '\nKhông có lệnh mở'}\n<a href="${PAGE}">Mở trang</a>`); }
}
for (const t of J.trades) if (t.seen && t.seen >= RUN0 && !t.pxSrc) pxTag(t); // lệnh mới lượt này: ghi rõ đang là giá gì
J.tvInfo = Object.fromEntries(Object.keys(SYMS).map(k => [k, { code: J.tv[k].code, ok: !!J.tv[k].ok, on: TVON(k), off: J.tv[k].off, n: J.tv[k].n || 0, at: J.tv[k].at || null, px: J.tv[k].px || null, okx: J.tv[k].okx || null, okxInst: SYMS[k].okx, src: SRC[k] || null, err: J.tv[k].lastErr || null }]));
try { fs.writeFileSync(path.join(DATA, 'tv.json'), JSON.stringify({ updated: NOW(), ...J.tvInfo })); } catch (_) {}
fs.writeFileSync(FILE, JSON.stringify(J));
for (const m of toSend.slice(0, 20)) await tgSend(m);
console.log(`Nhật ký V4: ${J.trades.length} dòng (+${added} mới, ${changed} đổi trạng thái)${errs.length ? ' · lỗi: ' + errs.join('; ') : ''}`);
