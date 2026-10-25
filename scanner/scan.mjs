// Máy quét tín hiệu chạy trên GitHub Actions (miễn phí) mỗi ~5–15 phút.
// - Dữ liệu: MT5 (Exness) qua Firebase nếu máy tính đang bật, nếu không thì OKX → Bybit → Binance → Kraken.
// - Tín hiệu: 7 chiến lược trong bot-tin-hieu/strategies.js (dùng chung với web).
// - Lưu nhật ký + trạng thái vào thư mục DATA_DIR (nhánh bot-data), web đọc file signals.json.
// - Telegram: gửi tín hiệu mới, chạm entry, TP/SL; trả lời lệnh /start /tinhieu /thongke /trangthai.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
createRequire(import.meta.url)(path.join(__dir, '..', 'bot-tin-hieu', 'strategies.js'));
const BOT = globalThis.BOT;

const ENV = process.env;
const DATA_DIR = ENV.DATA_DIR || path.join(__dir, '..', 'botdata');
const TOKEN = (ENV.TELEGRAM_BOT_TOKEN || '').trim();
const FIXED_CHAT = (ENV.TELEGRAM_CHAT_ID || '').trim();
const FB = (ENV.FIREBASE_URL || '').trim().replace(/\/+$/, '');
const SYMBOLS = (ENV.SYMBOLS || 'XAU,BTC').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const TFS = (ENV.TFS || 'm15,h1,h4').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const CFG = { rr: +(ENV.RR || 2), maxBars: +(ENV.MAX_BARS || 48), cost: +(ENV.COST_PCT || 0.04) / 100, freshBars: +(ENV.FRESH_BARS || 2) };
const MOCK = ENV.MOCK === '1';
const WEB = ENV.WEB_URL || 'https://letuan1111.github.io/doc-tieng-trung/bot-tin-hieu/';

const SYM = {
  XAU: { name: 'XAUUSD', mt5: ENV.MT5_XAU || 'XAUUSDm', okx: 'XAU-USDT-SWAP', by: 'XAUUSDT', bn: 'XAUUSDT', kr: 'PAXGUSD', dp: 2 },
  BTC: { name: 'BTCUSD', mt5: ENV.MT5_BTC || 'BTCUSDm', okx: 'BTC-USDT-SWAP', by: 'BTCUSDT', bn: 'BTCUSDT', kr: 'XBTUSD', dp: 1 },
  ETH: { name: 'ETHUSD', mt5: ENV.MT5_ETH || 'ETHUSDm', okx: 'ETH-USDT-SWAP', by: 'ETHUSDT', bn: 'ETHUSDT', kr: 'ETHUSD', dp: 2 },
  SOL: { name: 'SOLUSD', mt5: '', okx: 'SOL-USDT-SWAP', by: 'SOLUSDT', bn: 'SOLUSDT', kr: 'SOLUSD', dp: 3 },
};
const MS = { m5: 3e5, m15: 9e5, h1: 36e5, h4: 144e5 }, TFN = { m5: 'M5', m15: 'M15', h1: 'H1', h4: 'H4' };
const NEED = 1000;

// ---------------- tiện ích ----------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJSON(url, opt = {}) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { ...opt, signal: ctl.signal, headers: { 'user-agent': 'letuan-signal-bot/1.0', ...(opt.headers || {}) } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(to); }
}
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')); } catch (_) { return d; } };
const writeJSON = (f, v) => { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(path.join(DATA_DIR, f), JSON.stringify(v, null, 1)); };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const vn = (t) => { const d = new Date(t + 7 * 36e5), p = (n) => String(n).padStart(2, '0'); return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}`; };
const fx = (v, dp) => v == null || !isFinite(v) ? '—' : Number(v).toFixed(dp);

// ---------------- nguồn dữ liệu ----------------
const SOURCES = {
  async mt5(s, tf) {
    if (!FB || !s.mt5) throw new Error('chưa cấu hình MT5');
    const j = await getJSON(`${FB}/mt5/${encodeURIComponent(s.mt5)}/${tf}.json?orderBy=%22$key%22&limitToLast=${NEED}`);
    if (!j) throw new Error('MT5 chưa gửi dữ liệu');
    const c = Object.entries(j).map(([k, v]) => ({ t: +k * 1000, ct: +k * 1000 + MS[tf], o: +v[0], h: +v[1], l: +v[2], c: +v[3] })).sort((a, b) => a.t - b.t);
    if (!c.length || Date.now() - c[c.length - 1].t > MS[tf] + 20 * 60e3) throw new Error('MT5 không cập nhật (máy tắt hoặc thị trường đóng)');
    return c;
  },
  async okx(s, tf) {
    const bar = { m5: '5m', m15: '15m', h1: '1H', h4: '4H' }[tf];
    let out = (await getJSON(`https://www.okx.com/api/v5/market/candles?instId=${s.okx}&bar=${bar}&limit=300`)).data || [];
    for (let p = 0; p < 8 && out.length && out.length < NEED; p++) {
      const a = (await getJSON(`https://www.okx.com/api/v5/market/history-candles?instId=${s.okx}&bar=${bar}&limit=100&after=${out[out.length - 1][0]}`)).data || [];
      if (!a.length) break; out = out.concat(a);
    }
    return out.reverse().map(k => ({ t: +k[0], ct: +k[0] + MS[tf], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
  },
  async bybit(s, tf) {
    const iv = { m5: '5', m15: '15', h1: '60', h4: '240' }[tf];
    const j = await getJSON(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${s.by}&interval=${iv}&limit=${NEED}`);
    return (j.result && j.result.list || []).reverse().map(k => ({ t: +k[0], ct: +k[0] + MS[tf], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
  },
  async binance(s, tf) {
    const a = await getJSON(`https://fapi.binance.com/fapi/v1/klines?symbol=${s.bn}&interval=${{ m5: '5m', m15: '15m', h1: '1h', h4: '4h' }[tf]}&limit=${NEED}`);
    return a.map(k => ({ t: k[0], ct: k[6] + 1, o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
  },
  async kraken(s, tf) {
    const j = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=${s.kr}&interval=${{ m5: 5, m15: 15, h1: 60, h4: 240 }[tf]}`);
    const k = Object.keys(j.result || {}).find(x => x !== 'last');
    return (k ? j.result[k] : []).map(x => ({ t: x[0] * 1000, ct: x[0] * 1000 + MS[tf], o: +x[1], h: +x[2], l: +x[3], c: +x[4] }));
  },
};
const PUBLIC = ['okx', 'bybit', 'binance', 'kraken'];
const PUB_NAME = { mt5: 'MT5 Exness', okx: 'OKX', bybit: 'Bybit', binance: 'Binance', kraken: 'Kraken' };

function mockCandles(sym, tf) {
  let seed = [...(sym + tf)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647 || 1;
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647, g = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
  const base = { XAU: 4000, BTC: 110000, ETH: 3900, SOL: 190 }[sym], step = MS[tf], now = Date.now(), t0 = Math.floor(now / step) * step - (NEED - 1) * step;
  let p = base, drift = 0; const vol = base * 0.0012 * Math.sqrt(step / 3e5), out = [];
  for (let i = 0; i < NEED; i++) { if (i % 150 === 0) drift = (rnd() - .5) * vol * .5; const o = p; p += drift + g() * vol; out.push({ t: t0 + i * step, ct: t0 + (i + 1) * step, o, h: Math.max(o, p) + Math.abs(g()) * vol * .4, l: Math.min(o, p) - Math.abs(g()) * vol * .4, c: p }); }
  return out;
}

async function loadCandles(sym, tf, state) {
  const s = SYM[sym];
  if (MOCK) return { c: mockCandles(sym, tf), src: 'mock' };
  try { return { c: await SOURCES.mt5(s, tf), src: 'mt5' }; } catch (e) { state.mt5err = e.message; }
  const pref = state.srcPref[sym] && PUBLIC.includes(state.srcPref[sym]) ? state.srcPref[sym] : 'okx';
  const order = [pref, ...PUBLIC.filter(x => x !== pref)];
  let err;
  for (const k of order) {
    try { const c = await SOURCES[k](s, tf); if (c.length < 300) throw new Error('ít dữ liệu (' + c.length + ')'); state.srcPref[sym] = k; return { c, src: k }; }
    catch (e) { err = k + ': ' + e.message; console.log('  nguồn lỗi', sym, tf, err); }
  }
  throw new Error(err || 'không tải được dữ liệu');
}

// chênh lệch giá MT5 − nguồn công khai (đo khi MT5 bật, dùng lại khi MT5 tắt)
async function measureOffset(sym, state) {
  if (!FB || MOCK || !SYM[sym].mt5) return;
  try {
    const m = await SOURCES.mt5(SYM[sym], 'm15'), lastM = m[m.length - 1];
    for (const k of PUBLIC) {
      try {
        const p = await SOURCES[k](SYM[sym], 'm15'), q = p.find(x => x.t === lastM.t);
        if (q) { state.offset[sym + '|' + k] = { v: +(lastM.c - q.c).toFixed(4), t: Date.now() }; break; }
      } catch (_) {}
    }
  } catch (_) {}
}

// ---------------- Telegram ----------------
async function tg(method, body) {
  if (!TOKEN || MOCK) { if (method === 'sendMessage') console.log('[TG]', String(body.text).replace(/<[^>]+>/g, '')); return null; }
  try { return await getJSON(`https://api.telegram.org/bot${TOKEN}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
  catch (e) { console.log('Telegram lỗi', method, e.message); return null; }
}
const chats = (state) => FIXED_CHAT ? FIXED_CHAT.split(',').map(s => s.trim()) : (state.owner ? [String(state.owner)] : []);
async function broadcast(state, text) {
  for (const id of chats(state)) { await tg('sendMessage', { chat_id: id, text, parse_mode: 'HTML', disable_web_page_preview: true }); await sleep(350); }
}

function sigText(x, head) {
  const dp = SYM[x.sym].dp, R = Math.abs(x.entry - x.sl);
  return `${head}\n<b>${x.side > 0 ? '🟢 BUY' : '🔴 SELL'}${x.limit ? ' LIMIT' : ''} ${SYM[x.sym].name} · ${TFN[x.tf]}</b> — ${esc(x.stratName)}\n` +
    `Entry: <code>${fx(x.entry, dp)}</code>\nSL: <code>${fx(x.sl, dp)}</code> (−1R · ${fx(R, dp)})\nTP: <code>${fx(x.tp, dp)}</code> (+${CFG.rr}R)\n` +
    `<i>${esc(x.note || '')}</i>\nNguồn giá: ${esc(PUB_NAME[x.src] || x.src)}${x.off ? ` (đã căn theo Exness ${x.off > 0 ? '+' : ''}${x.off})` : ''} · tín hiệu lúc ${vn(x.t)}\n` +
    `Backtest chiến lược này: ${x.bt.n} lệnh, thắng ${Math.round(x.bt.win * 100)}%, ${x.bt.netR >= 0 ? '+' : ''}${x.bt.netR.toFixed(1)}R`;
}

function statsText(log, days) {
  const since = Date.now() - days * 864e5, done = log.filter(x => x.t >= since && x.r != null);
  if (!done.length) return `Chưa có lệnh nào kết thúc trong ${days} ngày qua.`;
  const by = {};
  for (const x of done) { const k = x.stratName; (by[k] = by[k] || { n: 0, w: 0, r: 0 }); by[k].n++; if (x.r > 0) by[k].w++; by[k].r += x.r; }
  const tot = done.reduce((s, x) => s + x.r, 0), w = done.filter(x => x.r > 0).length;
  return `<b>📊 Thống kê ${days} ngày</b>\nTổng: ${done.length} lệnh · thắng ${Math.round(w / done.length * 100)}% · <b>${tot >= 0 ? '+' : ''}${tot.toFixed(1)}R</b>\n` +
    Object.entries(by).sort((a, b) => b[1].r - a[1].r).map(([k, v]) => `• ${esc(k)}: ${v.n} lệnh, thắng ${Math.round(v.w / v.n * 100)}%, ${v.r >= 0 ? '+' : ''}${v.r.toFixed(1)}R`).join('\n');
}

function openText(log) {
  const open = log.filter(x => x.state === 'OPEN' || x.state === 'PENDING');
  if (!open.length) return 'Hiện không có tín hiệu nào đang mở hoặc chờ khớp.';
  return '<b>📌 Tín hiệu đang mở / chờ khớp</b>\n\n' + open.slice(-10).map(x => { const dp = SYM[x.sym].dp; return `${x.side > 0 ? '🟢 BUY' : '🔴 SELL'}${x.limit ? ' LIMIT' : ''} ${SYM[x.sym].name} ${TFN[x.tf]} · ${esc(x.stratShort)} · ${x.state === 'OPEN' ? 'đang chạy' : 'chờ khớp'}\nEntry ${fx(x.entry, dp)} · SL ${fx(x.sl, dp)} · TP ${fx(x.tp, dp)}`; }).join('\n\n');
}

async function handleCommands(state, log, status) {
  if (!TOKEN || MOCK) return;
  const j = await tg('getUpdates', { offset: (state.tgOffset || 0) + 1, timeout: 0, allowed_updates: ['message'] });
  if (!j || !j.ok) return;
  for (const u of j.result) {
    state.tgOffset = u.update_id;
    const m = u.message; if (!m || !m.text) continue;
    const chat = String(m.chat.id), cmd = m.text.trim().split(/[\s@]/)[0].toLowerCase();
    const allowed = FIXED_CHAT ? FIXED_CHAT.split(',').map(s => s.trim()).includes(chat) : (!state.owner || String(state.owner) === chat);
    if (!allowed) { await tg('sendMessage', { chat_id: chat, text: 'Bot này là bot riêng, không nhận người dùng mới.' }); continue; }
    const reply = (text) => tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', disable_web_page_preview: true });
    if (cmd === '/start') {
      if (!FIXED_CHAT && !state.owner) state.owner = chat;
      await reply(`✅ Đã kết nối! Bot sẽ gửi tín hiệu ${SYMBOLS.map(s => SYM[s] ? SYM[s].name : s).join(', ')} khung ${TFS.map(t => TFN[t]).join(', ')} vào đây.\n\nLệnh:\n/tinhieu – tín hiệu đang mở\n/thongke – thống kê 7 ngày\n/trangthai – nguồn dữ liệu, lần quét cuối\n\nXem biểu đồ: ${WEB}\n\n<i>Chat ID của bạn: <code>${chat}</code></i>`);
    } else if (cmd === '/tinhieu') await reply(openText(log));
    else if (cmd === '/thongke') await reply(statsText(log, 7) + '\n\n' + statsText(log, 30));
    else if (cmd === '/trangthai') await reply(status());
    else await reply('Lệnh: /tinhieu, /thongke, /trangthai');
  }
}

// ---------------- vòng quét ----------------
async function main() {
  console.log(`Telegram token: ${TOKEN ? 'có (' + TOKEN.length + ' ký tự)' : 'KHÔNG CÓ'} · chat id cố định: ${FIXED_CHAT ? 'có' : 'không'} · Firebase: ${FB ? 'có' : 'không'}`);
  const state = Object.assign({ srcPref: {}, offset: {}, owner: null, tgOffset: 0, lastRun: 0, consSent: {} }, readJSON('state.json', {}));
  let log = readJSON('signals.json', { signals: [] }).signals || [];
  const runStatus = { at: Date.now(), sources: {}, errors: [] };
  const status = () => `<b>⚙️ Trạng thái</b>\nQuét lúc ${vn(runStatus.at)} (giờ VN)\n` +
    Object.entries(runStatus.sources).map(([k, v]) => `• ${k}: ${esc(PUB_NAME[v] || v)}`).join('\n') +
    (FB ? `\nMT5: ${Object.values(runStatus.sources).includes('mt5') ? '🟢 đang gửi dữ liệu' : '⚪ không hoạt động (' + esc(state.mt5err || '') + ')'}` : '\nMT5: chưa cấu hình FIREBASE_URL') +
    `\nĐang mở: ${log.filter(x => x.state === 'OPEN' || x.state === 'PENDING').length} tín hiệu`;

  const alerts = [];
  for (const sym of SYMBOLS) {
    if (!SYM[sym]) { runStatus.errors.push('mã không hỗ trợ ' + sym); continue; }
    await measureOffset(sym, state);
    for (const tf of TFS) {
      let d;
      try { d = await loadCandles(sym, tf, state); } catch (e) { runStatus.errors.push(`${sym} ${tf}: ${e.message}`); continue; }
      runStatus.sources[`${SYM[sym].name} ${TFN[tf]}`] = d.src;
      const offRec = d.src !== 'mt5' && state.offset[sym + '|' + d.src], off = offRec && Date.now() - offRec.t < 7 * 864e5 ? offRec.v : 0;
      const c = d.c.filter(x => x.ct <= Date.now()).map(x => off ? { ...x, o: x.o + off, h: x.h + off, l: x.l + off, c: x.c + off } : x);
      if (c.length < 300) { runStatus.errors.push(`${sym} ${tf}: ít nến`); continue; }
      const a = BOT.analyze(c, CFG), n = c.length;
      for (const k in a.res) {
        const r = a.res[k], meta = BOT.S[k];
        for (const t of r.trades) {
          if (t.i < n - 300) continue;
          const id = `${sym}|${tf}|${k}|${c[t.i].t}`, ex = log.find(x => x.id === id);
          if (ex) { // cập nhật trạng thái
            if (ex.state !== t.state && (ex.state === 'OPEN' || ex.state === 'PENDING')) {
              const prev = ex.state; Object.assign(ex, { state: t.state, r: t.r != null ? +t.r.toFixed(3) : null, exitT: t.exit != null ? c[t.exit].t : null });
              if (prev === 'PENDING' && t.state === 'OPEN') alerts.push(sigText(ex, '🎯 <b>Giá đã chạm Entry – lệnh khớp</b>'));
              else if (t.state === 'WIN') alerts.push(`✅ <b>Chạm TP</b> ${SYM[sym].name} ${TFN[tf]} · ${esc(meta.short)} ${ex.side > 0 ? 'BUY' : 'SELL'} · <b>+${t.r.toFixed(2)}R</b>`);
              else if (t.state === 'LOSS') alerts.push(`❌ <b>Dính SL</b> ${SYM[sym].name} ${TFN[tf]} · ${esc(meta.short)} ${ex.side > 0 ? 'BUY' : 'SELL'} · ${t.r.toFixed(2)}R`);
              else if (t.state === 'TIME') alerts.push(`⏱ <b>Đóng do hết thời gian</b> ${SYM[sym].name} ${TFN[tf]} · ${esc(meta.short)} · ${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R`);
              else if (t.state === 'EXPIRED' || t.state === 'MISSED') alerts.push(`⚪ Huỷ lệnh chờ ${SYM[sym].name} ${TFN[tf]} · ${esc(meta.short)} (${t.state === 'EXPIRED' ? 'quá hạn chưa khớp' : 'giá chạy tới TP trước khi khớp'})`);
            }
            continue;
          }
          // tín hiệu mới: phải còn mới, đang mở/chờ, và chiến lược có lãi trên dữ liệu này
          const fresh = n - 1 - t.i <= CFG.freshBars && (t.state === 'OPEN' || t.state === 'PENDING');
          if (!fresh || r.n < 5 || r.avgR <= 0) continue;
          const x = { id, sym, tf, strat: k, stratName: meta.name, stratShort: meta.short, side: t.side, limit: !!t.limit, entry: +t.entry.toFixed(6), sl: +t.sl.toFixed(6), tp: +t.tp.toFixed(6),
            t: c[t.i].t, note: t.note || '', state: t.state, r: null, src: d.src, off, bt: { n: r.n, win: +r.winRate.toFixed(3), netR: +r.netR.toFixed(2), pf: isFinite(r.pf) ? +r.pf.toFixed(2) : 99 } };
          log.push(x); alerts.push(sigText(x, '🆕 <b>TÍN HIỆU MỚI</b>'));
        }
      }
      // đồng thuận ≥ 2 chiến lược cùng chiều
      const cs = a.consensus, ck = `${sym}|${tf}|${cs.side}`;
      if (cs.n >= 2 && (!state.consSent[ck] || Date.now() - state.consSent[ck] > (CFG.freshBars + 1) * MS[tf])) {
        state.consSent[ck] = Date.now();
        alerts.push(`🔥 <b>${cs.n} chiến lược cùng ${cs.side > 0 ? 'BUY' : 'SELL'} ${SYM[sym].name} ${TFN[tf]}</b>\n${(cs.side > 0 ? cs.buy : cs.sell).map(k => esc(BOT.S[k].name)).join(', ')}\nGiá ${fx(c[n - 1].c, SYM[sym].dp)} · ${vn(c[n - 1].t)}`);
      }
      runStatus[`${sym}|${tf}`] = { consensus: cs, price: c[n - 1].c, t: c[n - 1].t, src: d.src, off, ranking: Object.keys(a.res).map(k => ({ k, n: a.res[k].n, win: +a.res[k].winRate.toFixed(3), netR: +a.res[k].netR.toFixed(2) })) };
    }
  }

  // giới hạn kích thước: giữ 600 tín hiệu gần nhất, lệnh mở quá 14 ngày coi như đóng
  for (const x of log) if ((x.state === 'OPEN' || x.state === 'PENDING') && Date.now() - x.t > 14 * 864e5) x.state = 'STALE';
  log = log.slice(-600);
  for (const k in state.consSent) if (Date.now() - state.consSent[k] > 2 * 864e5) delete state.consSent[k];

  let tgInfo = { configured: !!TOKEN, connected: chats(state).length > 0 };
  if (TOKEN && !MOCK) {
    try { const me = await getJSON(`https://api.telegram.org/bot${TOKEN}/getMe`); tgInfo.bot = me.result && me.result.username; tgInfo.ok = !!me.ok; }
    catch (e) { tgInfo.ok = false; tgInfo.error = e.message === 'HTTP 401' ? 'token sai (Telegram từ chối)' : e.message; }
  }
  await handleCommands(state, log, status);
  tgInfo.connected = chats(state).length > 0;
  if (alerts.length) {
    if (!chats(state).length) console.log('Chưa có người nhận Telegram (gửi /start cho bot). Bỏ qua', alerts.length, 'tin.');
    for (const m of alerts.slice(0, 15)) await broadcast(state, m);
    if (alerts.length > 15) await broadcast(state, `… và ${alerts.length - 15} thông báo khác. Xem đầy đủ: ${WEB}`);
  }

  state.lastRun = Date.now();
  writeJSON('state.json', { ...state, telegram: tgInfo });
  writeJSON('signals.json', { updated: Date.now(), cfg: CFG, symbols: SYMBOLS, tfs: TFS, telegram: tgInfo, mt5: { configured: !!FB, live: Object.values(runStatus.sources).includes('mt5') }, status: runStatus, signals: log });
  console.log(`Xong: ${alerts.length} thông báo, ${log.length} tín hiệu trong nhật ký, lỗi: ${runStatus.errors.join(' | ') || 'không'}`);
}

main().catch(e => { console.error(e); process.exit(1); });
