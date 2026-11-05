// Nhật ký giao dịch V4 cho trang tin-hieu — chạy trên GitHub Actions mỗi 5 phút (không cần mở web) + báo Telegram.
// Ghi MỌI tín hiệu: mới → chờ khớp → đang chạy → TP/SL/hết giờ/hết hạn/huỷ, và tín hiệu bị bỏ qua vì có entry đẹp hơn.
// Nguồn giá: MT5 Exness (Firebase, nếu EA bridge đang chạy và dữ liệu < 15 phút) → nếu không có thì OKX.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const req = createRequire(import.meta.url), __dir = path.dirname(fileURLToPath(import.meta.url));
const V3 = req(path.join(__dir, '..', 'tin-hieu', 'v3.js'));
const DATA = process.env.DATA_DIR || 'botdata', FILE = path.join(DATA, 'tinhieu-journal.json');
const FB = (process.env.MT5_DB || 'https://letuan-mt5-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/, '');
const MS = V3.MS, NEED = { m15: 3000, h1: 2200 }; // H1 dài để EMA34/89 H4 ổn định; M30 dựng từ M15
const SYMS = { XAU: { okx: 'XAU-USDT-SWAP', mt5: 'XAUUSDm', spread: 0.35, dp: 2 }, BTC: { okx: 'BTC-USDT-SWAP', mt5: 'BTCUSDm', spread: 18, dp: 1 } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function j(u) { for (let k = 0; k < 4; k++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.json(); } catch (_) {} await sleep(1500 * (k + 1)); } throw new Error('Không tải được ' + u.slice(0, 80)); }
const BAR = { m15: '15m', h1: '1H' };
async function okx(inst, tf) {
  let out = (await j(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=${BAR[tf]}&limit=300`)).data || [];
  while (out.length < NEED[tf]) { const a = (await j(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=${BAR[tf]}&limit=100&after=${out[out.length - 1][0]}`)).data || []; if (!a.length) break; out = out.concat(a); await sleep(120); }
  return out.reverse().map(k => ({ t: +k[0], ct: +k[0] + MS[tf], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
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
  const f = (v) => v == null ? '—' : (+v).toFixed(t.dp ?? 2), side = t.side > 0 ? 'BUY' : 'SELL', tag = t.grade === 'B' ? '🔎 Ghi nhận' : '⭐ Chuẩn';
  const head = `<b>${t.sym} · ${t.tf.toUpperCase()} · ${side} LIMIT</b> — ${tag}`;
  const zone = `Vùng FVG ${t.tf.toUpperCase()}: ${f(t.fvg && t.fvg.bot)} – ${f(t.fvg && t.fvg.top)}`;
  const lv = `Entry <b>${f(t.entry)}</b> · SL <b>${f(t.sl)}</b> · TP <b>${f(t.tp)}</b> (${(t.rr || 2).toFixed(1)}R)`;
  const sw = `Đã quét ${esc(t.sweepName)} ${f(t.sweep)} → MSS + FVG`;
  switch (t.state) {
    case 'PENDING': return `🆕 ${head}\n${sw}\n${zone}\n${lv}\n${t.ctx ? '<i>' + esc(V3.ctxText(t.ctx)) + '</i>\n' : ''}Huỷ nếu chưa khớp trước ${vnT(t.ct + V3.CFG[t.tf].expiry * MS[t.tf])}\n<a href="${PAGE}">Mở trang</a>`;
    case 'OPEN': return `🎯 Đã khớp ${head}\n${lv}\nKhớp lúc ${vnT(t.fillT)}`;
    case 'WIN': return `✅ Chạm TP ${head}\n${lv}\nKết quả <b>+${t.r.toFixed(2)}R</b> · đóng ${vnT(t.exitT)}`;
    case 'LOSS': return `❌ Dính SL ${head}\n${lv}\nKết quả <b>${t.r.toFixed(2)}R</b> · đóng ${vnT(t.exitT)}`;
    case 'TIME': return `⏱ Hết giờ giữ lệnh ${head}\nĐóng ${f(t.exitP)} · <b>${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R</b>`;
    default: return `⚪ Huỷ ${head}\n${esc(V3.STATE_VI[t.state] || t.state)}${t.why ? ' — ' + esc(t.why) : ''}`;
  }
}
const toSend = [];
const notify = (t) => { if (!t.live) return; t.tg = t.tg || []; if (t.state === 'OPEN' && !t.tg.includes('PENDING')) { t.tg.push('PENDING'); toSend.push(tgText({ ...t, state: 'PENDING' })); } if (V3.FINAL[t.state] && t.fillT && !t.tg.includes('OPEN') && t.state !== 'SKIP') { t.tg.push('OPEN'); toSend.push(tgText({ ...t, state: 'OPEN' })); } if (t.tg.includes(t.state)) return; t.tg.push(t.state); toSend.push(tgText(t)); };
const closed = (c) => c.filter(x => x.ct <= NOW());

const RULES = 'Ghi nhận mọi setup ICT/SMC quét thanh khoản (PDH/PDL, tuần, London, phiên Á, swing) → MSS + FVG; nhãn Chuẩn = Quét PDH/PDL → MSS có displacement → limit tại FVG · M15: cấu trúc swing H4 cùng chiều, ngoài phiên Á (mép, SL+0.5ATR) · M30: mọi setup (CE, SL+1ATR) · H1: cả hai chiều (mép, SL+1ATR) · chờ khớp M15 6h / M30 10h / H1 16h · TP 2R';
let J = { version: V3.version, rules: RULES, trades: [] };
try { J = { ...J, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (_) {}
// đổi bản quy tắc: bỏ các lệnh "tính lại" của bản cũ (sẽ tính lại theo bản mới), giữ nguyên lệnh đã ghi trực tiếp
if (J.version !== V3.version) J.trades = J.trades.filter(t => t.live);
J.version = V3.version; J.rules = RULES;
const byId = new Map(J.trades.map(x => [x.id, x]));
let added = 0, changed = 0; const errs = [];
for (const sym of Object.keys(SYMS)) {
  let L;
  try { L = await load(sym); } catch (e) { errs.push(sym + ': ' + e.message); continue; }
  const D = { m15: closed(L.D.m15), h1: closed(L.D.h1) }; D.m30 = V3.resample(D.m15, MS.m30);
  const res = V3.runAll(D, { spread: SYMS[sym].spread, now: NOW() });
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
    if (s.state === 'SKIP' && old.state === 'PENDING' && old.grade === 'A') { old.state = 'SKIP'; old.why = s.why; old.exitT = NOW(); changed++; notify(old); continue; }
    if (!D[old.tf]) continue; // lệnh M5 của bản V3 cũ: không còn dữ liệu M5
    const before = old.state; V3.track(old, D[old.tf]); if (old.state !== before) { changed++; notify(old); }
  }
}
// lệnh treo quá lâu ngoài cửa sổ dữ liệu
for (const t of J.trades) if (!V3.FINAL[t.state] && NOW() - t.ct > 30 * 864e5) { t.state = 'TIME'; t.why = 'Quá 30 ngày không cập nhật được'; }
J.trades.sort((a, b) => a.ct - b.ct);
J.updated = NOW(); J.errors = errs;
J.stats = {}; for (const sym of Object.keys(SYMS)) J.stats[sym] = { chuan: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'A')), tatca: V3.stats(J.trades.filter(t => t.sym === sym)) };
fs.mkdirSync(DATA, { recursive: true });
J.telegram = { chats: CHATS.length, token: !!TOKEN };
fs.writeFileSync(FILE, JSON.stringify(J));
for (const m of toSend.slice(0, 20)) await tgSend(m);
console.log(`Nhật ký V4: ${J.trades.length} dòng (+${added} mới, ${changed} đổi trạng thái)${errs.length ? ' · lỗi: ' + errs.join('; ') : ''}`);
