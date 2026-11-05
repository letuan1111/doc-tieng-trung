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
const DATA = process.env.DATA_DIR || 'botdata', FILE = path.join(DATA, 'tinhieu-journal.json');
const FB = (process.env.MT5_DB || 'https://letuan-mt5-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/, '');
const MS = { ...V3.MS, m5: 3e5 }, NEED = { m15: 3000, h1: 2200 }; // H1 dài để EMA34/89 H4 ổn định; M30 dựng từ M15
const SYMS = { XAU: { okx: 'XAU-USDT-SWAP', mt5: 'XAUUSDm', spread: 0.35, dp: 2 }, BTC: { okx: 'BTC-USDT-SWAP', mt5: 'BTCUSDm', spread: 18, dp: 1 } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function j(u) { for (let k = 0; k < 4; k++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.json(); } catch (_) {} await sleep(1500 * (k + 1)); } throw new Error('Không tải được ' + u.slice(0, 80)); }
const BAR = { m5: '5m', m15: '15m', h1: '1H' }; NEED.m5 = 2000;
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
  const f = (v) => v == null ? '—' : (+v).toFixed(t.dp ?? 2), side = t.side > 0 ? 'BUY' : 'SELL', tag = t.grade === 'R' ? '🧲 Test EMA21 M30' : t.grade === 'E' ? '🔁 EMA hồi' : t.grade === 'S' ? '🎯 BOS 15' : t.grade === 'W' ? '🌊 Sóng 15' : t.grade === 'B' ? '🔎 Ghi nhận' : '⭐ Chuẩn';
  const head = `<b>${t.sym} · ${t.tf.toUpperCase()} · ${side} ${t.grade === 'E' || t.grade === 'R' ? 'VÀO NGAY' : 'LIMIT'}</b> — ${tag}`;
  const zone = `Vùng FVG ${t.tf.toUpperCase()}: ${f(t.fvg && t.fvg.bot)} – ${f(t.fvg && t.fvg.top)}`;
  const lv = `Entry <b>${f(t.entry)}</b> · SL <b>${f(t.sl)}</b> · TP <b>${f(t.tp)}</b> (${(t.rr || 2).toFixed(1)}R)`;
  const sw = `Đã quét ${esc(t.sweepName)} ${f(t.sweep)} → MSS + FVG`;
  switch (t.state) {
    case 'PENDING': if (t.grade === 'R') return `🆕 ${head}\n⏰ ${t.hour}h VN (đã bỏ giờ hay dính SL: 8h, 23h)\nEMA34 M30 ${f(t.ema34)} ${t.side > 0 ? '>' : '<'} EMA89 M30 ${f(t.ema89)} · ≥ 6 nến M30 đóng ${t.side > 0 ? 'trên' : 'dưới'} EMA21\nGiá test EMA21 M30 ${f(t.ema21)} lúc ${vnT(t.touchT)} (râu ${f(t.touchP)}) → nến M5 bật lại xác nhận\n${lv} · 0.02 lot · giữ tối đa 12h\n<a href="${PAGE}">Mở trang</a>`;
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
const NOWIN = (g) => g === 'E' || g === 'R';
const notify = (t) => { if (!t.live || !(NOWIN(t.grade) && t.tgOK)) return; t.tg = t.tg || []; if (t.state === 'OPEN' && !t.tg.includes('PENDING')) { t.tg.push('PENDING'); if (NOWIN(t.grade)) t.tg.push('OPEN'); toSend.push(tgText({ ...t, state: 'PENDING' })); } if (NOWIN(t.grade) && !t.tg.includes('PENDING')) { t.tg.push('PENDING', 'OPEN'); toSend.push(tgText({ ...t, state: 'PENDING' })); }
  if (V3.FINAL[t.state] && t.fillT && !t.tg.includes('OPEN') && t.state !== 'SKIP') { t.tg.push('OPEN'); toSend.push(tgText({ ...t, state: 'OPEN' })); } if (t.tg.includes(t.state)) return; t.tg.push(t.state); toSend.push(tgText(t)); };
const closed = (c) => c.filter(x => x.ct <= NOW());

const RULES = 'Ghi nhận mọi setup ICT/SMC quét thanh khoản (PDH/PDL, tuần, London, phiên Á, swing) → MSS + FVG; nhãn Chuẩn = Quét PDH/PDL → MSS có displacement → limit tại FVG · M15: cấu trúc swing H4 cùng chiều, ngoài phiên Á (mép, SL+0.5ATR) · M30: mọi setup (CE, SL+1ATR) · H1: cả hai chiều (mép, SL+1ATR) · chờ khớp M15 6h / M30 10h / H1 16h · TP 2R';
let J = { version: V3.version, rules: RULES, trades: [] };
try { J = { ...J, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch (_) {}
// đổi bản quy tắc: bỏ các lệnh "tính lại" của bản cũ (sẽ tính lại theo bản mới), giữ nguyên lệnh đã ghi trực tiếp
if (J.version !== V3.version) J.trades = J.trades.filter(t => t.live || (t.grade === 'W' && t.ver === WAVE.version) || (t.grade === 'E' && t.ver === EMAPB.version) || (t.grade === 'R' && t.ver === EMA21.version));
J.version = V3.version; J.rules = RULES;
J.trades = J.trades.filter(t => t.grade !== 'E' || t.ver === EMAPB.version || t.live); // đổi bản EMA hồi: tính lại
J.trades = J.trades.filter(t => t.grade !== 'R' || t.ver === EMA21.version || t.live); // đổi bản Test EMA21: tính lại
const byId = new Map(J.trades.map(x => [x.id, x]));
// nạp sẵn lịch sử 12 tháng (tính lại từ OKX) — chỉ thêm lệnh chưa có, cùng bản quy tắc
try { const SEED = JSON.parse(fs.readFileSync(path.join(__dir, 'journal-seed.json'), 'utf8'));
  if (SEED.version === V3.version) { let n = 0; for (const t of SEED.trades) if (!byId.has(t.id) && (t.grade !== 'W' || t.ver === WAVE.version) && (t.grade !== 'E' || t.ver === EMAPB.version) && (t.grade !== 'R' || t.ver === EMA21.version)) { J.trades.push(t); byId.set(t.id, t); n++; } if (n) console.log(`Nạp ${n} lệnh lịch sử 12 tháng`); } } catch (_) {}
let added = 0, changed = 0, XAU15 = null; const errs = [];
for (const sym of Object.keys(SYMS)) {
  let L;
  try { L = await load(sym); } catch (e) { errs.push(sym + ': ' + e.message); continue; }
  const D = { m15: closed(L.D.m15), h1: closed(L.D.h1) }; D.m30 = V3.resample(D.m15, MS.m30);
  if (sym === 'XAU') XAU15 = D.m15;
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
  if (process.env.MOCK_DIR) { const rd = (tf) => JSON.parse(fs.readFileSync(path.join(process.env.MOCK_DIR, `XAU_${tf}.json`), 'utf8')).map(k => ({ t: k[0], ct: k[0] + MS[tf], o: k[1], h: k[2], l: k[3], c: k[4] })).filter(x => x.ct <= NOW()); m5 = rd('m5').slice(-NEED.m5); m15 = rd('m15').slice(-3000); }
  else { m5 = closed(await okx(SYMS.XAU.okx, 'm5')); m15 = XAU15 || []; }
  // các mô hình chạy trên M5 vàng: tính lại toàn bộ cửa sổ mỗi lần, cập nhật lệnh chưa kết thúc
  for (const [MOD, G] of [[WAVE, 'W'], [EMAPB, 'E'], [EMA21, 'R']]) {
    const W = MOD.run({ m5, m15 }, { spread: SYMS.XAU.spread }), seenW = new Set(), tg = MOD.telegram !== false;
    for (const s of W) {
      const id = `XAU-${s.id}`, old = byId.get(id); seenW.add(id);
      if (!old) { const rec = { ...s, id, sym: 'XAU', ver: MOD.version, src: process.env.MOCK_DIR ? 'MOCK' : 'OKX ' + SYMS.XAU.okx, seen: NOW(), dp: 2, live: NOW() - s.ct < 3 * 3e5 + 10 * 60e3 };
        J.trades.push(rec); byId.set(id, rec); added++; if (tg) notify(rec); continue; }
      if (MOD.FINAL[old.state]) continue;
      const before = old.state; for (const k of ['state', 'fillT', 'exitT', 'exitP', 'r', 'pts']) old[k] = s[k];
      if (old.state !== before) { changed++; if (tg) notify(old); }
    }
    for (const t of J.trades) if (t.grade === G && !MOD.FINAL[t.state] && !seenW.has(t.id) && NOW() - t.ct > 2 * 864e5) { t.state = 'TIME'; t.why = 'Ra ngoài cửa sổ dữ liệu M5'; }
  }
} catch (e) { errs.push('Mô hình M5 (Sóng 15 / EMA hồi / Test EMA21): ' + e.message); }
// lệnh treo quá lâu ngoài cửa sổ dữ liệu
for (const t of J.trades) if (t.grade !== 'W' && t.grade !== 'E' && t.grade !== 'R' && !V3.FINAL[t.state] && NOW() - t.ct > 30 * 864e5) { t.state = 'TIME'; t.why = 'Quá 30 ngày không cập nhật được'; }
// ---- 💼 Tài khoản DEMO (giấy) 500 USD — chạy trên máy chủ, đúng luật 2 EA trên MT5:
//  EMA_Hoi_ICT (lệnh 🔁 EMA hồi trong giờ cho phép, SL ≤ 30 giá) + EMA21_Test_M30 (lệnh 🧲 Test EMA21) · 0.02 lot · mỗi lần chỉ 1 lệnh trên vàng (giống InpOnlyOneOnSym)
{ const D = J.demo = J.demo || { start: NOW(), bal0: 500, lot: 0.02, taken: [] };
  const USDPT = 100 * D.lot, FIN = (st) => st === 'WIN' || st === 'LOSS' || st === 'TIME';
  const pick = (t) => ({ id: t.id, grade: t.grade, side: t.side, ct: t.ct, hour: t.hour, entry: t.entry, sl: t.sl, tp: t.tp, risk: t.risk, state: t.state, exitT: t.exitT, exitP: t.exitP, pts: t.pts, live: t.live });
  for (const x of D.taken) { const t = byId.get(x.id); if (t && !FIN(x.state)) Object.assign(x, pick(t)); }
  const okEA = (t) => t.sym === 'XAU' && t.ct >= D.start && ((t.grade === 'E' && t.tgOK && t.risk <= 30) || t.grade === 'R');
  const have = new Set(D.taken.map(x => x.id));
  for (const t of J.trades.filter(t => okEA(t) && !have.has(t.id)).sort((a, b) => a.ct - b.ct)) {
    if (D.taken.some(x => !FIN(x.state))) break;                                   // đang có lệnh → bỏ tín hiệu
    const lastExit = Math.max(0, ...D.taken.map(x => x.exitT || 0)); if (t.ct < lastExit) continue; // tín hiệu lúc lệnh trước chưa đóng
    D.taken.push(pick(t)); have.add(t.id); }
  let bal = D.bal0, peak = D.bal0, dd = 0;
  for (const x of D.taken) { if (FIN(x.state) && x.pts != null) { x.usd = +(x.pts * USDPT).toFixed(2); bal += x.usd; peak = Math.max(peak, bal); dd = Math.max(dd, peak - bal); x.bal = +bal.toFixed(2); }
    if (FIN(x.state) && !x.tgDone) { x.tgDone = true; if (x.live !== false && NOW() - (x.exitT || 0) < 2 * 36e5) toSend.push(`💼 <b>Tài khoản demo</b> · ${x.grade === 'R' ? '🧲 Test EMA21' : '🔁 EMA hồi'} ${x.side > 0 ? 'BUY' : 'SELL'} XAU 0.02 lot\n${x.state === 'WIN' ? '✅ Chạm TP' : x.state === 'LOSS' ? '❌ Dính SL' : '⏱ Hết giờ'} <b>${x.usd >= 0 ? '+' : ''}${x.usd.toFixed(2)}$</b> (${x.pts >= 0 ? '+' : ''}${x.pts.toFixed(1)} giá)\nSố dư <b>${bal.toFixed(2)}$</b> (vốn ${D.bal0}$ · ${bal - D.bal0 >= 0 ? '+' : ''}${(bal - D.bal0).toFixed(2)}$)`); } }
  const C = D.taken.filter(x => FIN(x.state));
  D.balance = +bal.toFixed(2); D.maxDD = +dd.toFixed(2); D.wins = C.filter(x => x.state === 'WIN').length; D.losses = C.filter(x => x.state === 'LOSS').length; D.timeouts = C.filter(x => x.state === 'TIME').length;
  D.open = D.taken.find(x => !FIN(x.state)) || null; D.updated = NOW();
  // báo số dư hằng ngày về Telegram (lần chạy đầu tiên sau 22h giờ VN) + báo mở tài khoản
  const vnD = (t) => new Date(t + 7 * 36e5), today = vnD(NOW()).toISOString().slice(0, 10), vh = vnD(NOW()).getUTCHours();
  const dayStart = Date.parse(today + 'T00:00:00Z') - 7 * 36e5, T = C.filter(x => (x.exitT || 0) >= dayStart), tU = T.reduce((a, x) => a + x.usd, 0);
  const pl = D.balance - D.bal0, wr = C.length ? Math.round(100 * D.wins / C.length) : 0;
  const openTxt = D.open ? `\n🟢 Đang mở: ${D.open.grade === 'R' ? '🧲 Test EMA21' : '🔁 EMA hồi'} ${D.open.side > 0 ? 'BUY' : 'SELL'} · Entry ${(+D.open.entry).toFixed(2)} · SL ${(+D.open.sl).toFixed(2)} · TP ${(+D.open.tp).toFixed(2)}` : '\nKhông có lệnh đang mở';
  if (!D.openMsg) { D.openMsg = NOW(); if (!process.env.MOCK_DIR) toSend.push(`💼 <b>Đã mở tài khoản demo ${D.bal0}$</b> (giấy, trên máy chủ)\nVào lệnh đúng luật 2 EA: 🔁 EMA hồi (giờ tốt, SL ≤ 30) + 🧲 Test EMA21 M30 · 0.02 lot · mỗi lần 1 lệnh\nBáo kết quả mỗi lệnh và số dư lúc 22h mỗi ngày\n<a href="${PAGE}">Mở trang</a>`); }
  if (D.dailyDay !== today && vh >= 22) { D.dailyDay = today;
    toSend.push(`💼 <b>Số dư tài khoản demo ${vnD(NOW()).toISOString().slice(8, 10)}/${vnD(NOW()).toISOString().slice(5, 7)}</b>\nSố dư <b>${D.balance.toFixed(2)}$</b> (vốn ${D.bal0}$ · ${pl >= 0 ? '+' : ''}${pl.toFixed(2)}$)\nHôm nay: ${T.length} lệnh đóng · ${T.filter(x => x.state === 'WIN').length} TP · ${T.filter(x => x.state === 'LOSS').length} SL · ${tU >= 0 ? '+' : ''}${tU.toFixed(2)}$\nTừ đầu: ${C.length} lệnh · thắng ${wr}% · sụt tối đa ${D.maxDD.toFixed(2)}$${openTxt}\n<a href="${PAGE}">Mở trang</a>`); }
}
J.trades.sort((a, b) => a.ct - b.ct);
J.updated = NOW(); J.errors = errs;
J.stats = {}; for (const sym of Object.keys(SYMS)) J.stats[sym] = { chuan: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'A')), song15: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'W')), bos15: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'S')), emaHoi: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'E')), test21: V3.stats(J.trades.filter(t => t.sym === sym && t.grade === 'R')), tatca: V3.stats(J.trades.filter(t => t.sym === sym)) };
fs.mkdirSync(DATA, { recursive: true });
J.telegram = { chats: CHATS.length, token: !!TOKEN };
fs.writeFileSync(FILE, JSON.stringify(J));
for (const m of toSend.slice(0, 20)) await tgSend(m);
console.log(`Nhật ký V4: ${J.trades.length} dòng (+${added} mới, ${changed} đổi trạng thái)${errs.length ? ' · lỗi: ' + errs.join('; ') : ''}`);
