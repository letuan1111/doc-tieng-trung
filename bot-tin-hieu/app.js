/* Giao diện bot tín hiệu: tải nến công khai, chạy 7 chiến lược, vẽ chart, xếp hạng, radar, thông báo */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const SYMS = {
    XAU: { name: 'XAUUSD', bn: 'XAUUSDT', okx: 'XAU-USDT-SWAP', by: 'XAUUSDT', dp: 2 },
    BTC: { name: 'BTCUSD', bn: 'BTCUSDT', okx: 'BTC-USDT-SWAP', by: 'BTCUSDT', dp: 1 },
    ETH: { name: 'ETHUSD', bn: 'ETHUSDT', okx: 'ETH-USDT-SWAP', by: 'ETHUSDT', dp: 2 },
    SOL: { name: 'SOLUSD', bn: 'SOLUSDT', okx: 'SOL-USDT-SWAP', by: 'SOLUSDT', dp: 3 },
    BNB: { name: 'BNBUSD', bn: 'BNBUSDT', okx: 'BNB-USDT-SWAP', by: 'BNBUSDT', dp: 2 },
    XRP: { name: 'XRPUSD', bn: 'XRPUSDT', okx: 'XRP-USDT-SWAP', by: 'XRPUSDT', dp: 4 },
  };
  const TFS = ['m5', 'm15', 'h1', 'h4'], TFN = { m5: 'M5', m15: 'M15', h1: 'H1', h4: 'H4' };
  const IV = { m5: '5m', m15: '15m', h1: '1h', h4: '4h' }, MS = { m5: 3e5, m15: 9e5, h1: 36e5, h4: 144e5 };
  const OKX_IV = { m5: '5m', m15: '15m', h1: '1H', h4: '4H' }, BY_IV = { m5: '5', m15: '15', h1: '60', h4: '240' };
  const BARS = 1500;

  // ---------------- dữ liệu công khai ----------------
  async function getJSON(u) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status + ''); return r.json(); }
  const SRC = [
    { n: 'Binance Futures', f: async (s, tf) => (await getJSON(`https://fapi.binance.com/fapi/v1/klines?symbol=${s.bn}&interval=${IV[tf]}&limit=${BARS}`)).map(k => ({ t: k[0], ct: k[6] + 1, o: +k[1], h: +k[2], l: +k[3], c: +k[4] })) },
    { n: 'OKX', f: async (s, tf) => {
      let out = [], after = '';
      for (let p = 0; p < 6; p++) { const j = await getJSON(`https://www.okx.com/api/v5/market/history-candles?instId=${s.okx}&bar=${OKX_IV[tf]}&limit=100${after ? '&after=' + after : ''}`); const a = j.data || []; if (!a.length) break; out = out.concat(a); after = a[a.length - 1][0]; }
      return out.reverse().map(k => ({ t: +k[0], ct: +k[0] + MS[tf], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
    } },
    { n: 'Bybit', f: async (s, tf) => { const j = await getJSON(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${s.by}&interval=${BY_IV[tf]}&limit=1000`); return (j.result.list || []).reverse().map(k => ({ t: +k[0], ct: +k[0] + MS[tf], o: +k[1], h: +k[2], l: +k[3], c: +k[4] })); } },
  ];
  const srcPref = {};
  // ---- MT5 (Exness) qua Firebase: dùng khi máy tính bật và EA MT5_Bridge_Firebase đang chạy ----
  const MT5 = Object.assign({ db: '', root: 'mt5', XAU: 'XAUUSDm', BTC: 'BTCUSDm' }, LS.get('smc.mt5', {}));
  const mt5Name = (sym) => (MT5.db && MT5[sym]) || '';
  async function mt5Load(sym, tf) {
    const j = await getJSON(`${MT5.db.replace(/\/+$/, '')}/${MT5.root || 'mt5'}/${encodeURIComponent(mt5Name(sym))}/${tf}.json?orderBy=%22$key%22&limitToLast=${BARS}`);
    if (!j) throw new Error('MT5 chưa gửi dữ liệu');
    const c = Object.entries(j).map(([k, v]) => ({ t: +k * 1000, ct: +k * 1000 + MS[tf], o: +v[0], h: +v[1], l: +v[2], c: +v[3] })).sort((a, b) => a.t - b.t);
    if (!c.length || Date.now() - c[c.length - 1].t > MS[tf] + 20 * 60e3) throw new Error('MT5 không cập nhật (máy tắt hoặc thị trường đóng)');
    return c;
  }
  // chênh lệch giá MT5 − nguồn công khai, đo khi MT5 bật (30 phút/lần), dùng lại khi MT5 tắt
  const OFF = LS.get('bot.off', {}), calibAt = {};
  async function calibrate(sym) {
    if (calibAt[sym] && Date.now() - calibAt[sym] < 30 * 60e3) return; calibAt[sym] = Date.now();
    try {
      const m = await mt5Load(sym, 'm15'), last = m[m.length - 2] || m[m.length - 1];
      for (const src of SRC) {
        try { const p = await src.f(SYMS[sym], 'm15'), q = p.find(x => x.t === last.t); if (q) { OFF[sym + '|' + src.n] = { v: +(last.c - q.c).toFixed(5), t: Date.now() }; } } catch (_) {}
      }
      LS.set('bot.off', OFF);
    } catch (_) {}
  }
  async function load(sym, tf) {
    if (mt5Name(sym)) {
      try { const c = await mt5Load(sym, tf); if (c.length >= 300) { calibrate(sym); S.mt5live = true; return { c, src: 'MT5 Exness', code: mt5Name(sym), mt5: true, off: 0 }; } throw new Error('MT5 mới có ' + c.length + ' nến'); }
      catch (e) { S.mt5err = e.message; }
    }
    const s = SYMS[sym], first = srcPref[sym] || 0, order = [first, 0, 1, 2].filter((v, i, a) => a.indexOf(v) === i);
    let err;
    for (const k of order) {
      try {
        const d = await SRC[k].f(s, tf); if (d.length < 300) throw new Error('ít dữ liệu'); srcPref[sym] = k;
        const o = OFF[sym + '|' + SRC[k].n], off = o && Date.now() - o.t < 7 * 864e5 ? o.v : 0;
        const c = off ? d.map(x => ({ ...x, o: x.o + off, h: x.h + off, l: x.l + off, c: x.c + off })) : d;
        return { c, src: SRC[k].n, code: k === 1 ? s.okx : s.bn, mt5: false, off };
      } catch (e) { err = e; }
    }
    throw err || new Error('không tải được');
  }
  const closed = (c) => { const now = Date.now(); return c.filter(x => x.ct <= now); };

  // ---------------- trạng thái ----------------
  const S = {
    sym: LS.get('bot.sym', 'XAU'), tf: LS.get('bot.tf', 'm15'), strat: LS.get('bot.strat', 'all'),
    cfg: Object.assign({ rr: 2, maxBars: 48, costPct: 0.04, freshBars: 3 }, LS.get('bot.cfg', {})),
    notif: LS.get('bot.notif', false), seen: LS.get('bot.seen', {}), data: null, res: null, radar: {},
  };
  if (S.strat !== 'all' && !BOT.S[S.strat]) S.strat = 'all';
  const engCfg = () => ({ rr: S.cfg.rr, maxBars: S.cfg.maxBars, cost: S.cfg.costPct / 100, freshBars: S.cfg.freshBars });
  const dp = () => SYMS[S.sym].dp;
  const fx = (v, d = dp()) => v == null || !isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const ft = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  const STATE = { WIN: ['TP ✓', 'win'], LOSS: ['SL ✗', 'loss'], TIME: ['Hết giờ', 'muted'], OPEN: ['Đang chạy', ''], PENDING: ['Chờ khớp', ''], EXPIRED: ['Hết hạn', 'muted'], MISSED: ['Lỡ (chạy tới TP)', 'muted'] };
  const sideTxt = (s) => s > 0 ? 'BUY' : 'SELL', sideCls = (s) => s > 0 ? 'buy' : 'sell';

  // ---------------- chart ----------------
  let chart, cs, l34, l89, l200, plines = [];
  const TZ = -new Date().getTimezoneOffset() * 60, tsec = (t) => Math.floor(t / 1000) + TZ;
  function initChart() {
    const dark = !window.matchMedia || !window.matchMedia('(prefers-color-scheme: light)').matches;
    chart = LightweightCharts.createChart($('chart'), {
      autoSize: true, layout: { background: { color: 'transparent' }, textColor: dark ? '#8b98a8' : '#5b6675', fontFamily: 'Be Vietnam Pro' },
      grid: { vertLines: { color: dark ? '#1c2430' : '#eef1f4' }, horzLines: { color: dark ? '#1c2430' : '#eef1f4' } },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 6 }, crosshair: { mode: 0 }, rightPriceScale: { borderColor: dark ? '#2a3441' : '#dde2e8' },
    });
    cs = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#f43f5e', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#f43f5e' });
    const line = (color, w) => chart.addLineSeries({ color, lineWidth: w, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    l200 = line('#94a3b8', 1); l89 = line('#eab308', 2); l34 = line('#06b6d4', 2);
  }
  function renderChart(fit) {
    const d = S.data, r = S.res; if (!d || !r || !chart) return;
    const c = d.c;
    cs.applyOptions({ priceFormat: { type: 'price', precision: dp(), minMove: 1 / 10 ** dp() } });
    cs.setData(c.map(x => ({ time: tsec(x.t), open: x.o, high: x.h, low: x.l, close: x.c })));
    l34.setData(c.map((x, i) => ({ time: tsec(x.t), value: r.P.e34[i] })));
    l89.setData(c.map((x, i) => ({ time: tsec(x.t), value: r.P.e89[i] })));
    l200.setData(c.map((x, i) => ({ time: tsec(x.t), value: r.P.e200[i] })).slice(200));
    // chế độ "tất cả": chỉ vẽ chiến lược đang có lãi trên dữ liệu này, 200 nến gần nhất cho đỡ rối
    const keys = S.strat === 'all' ? Object.keys(BOT.S).filter(k => r.res[k].netR > 0) : [S.strat], mk = [], from = c.length - (S.strat === 'all' ? 200 : 600);
    for (const k of keys) for (const t of r.res[k].trades) {
      if (t.i < from) continue;
      mk.push({ time: tsec(c[t.i].t), position: t.side > 0 ? 'belowBar' : 'aboveBar', color: t.side > 0 ? '#22c55e' : '#f43f5e', shape: t.side > 0 ? 'arrowUp' : 'arrowDown', text: (S.strat === 'all' ? BOT.S[k].short + ' ' : '') + sideTxt(t.side) });
      if (S.strat !== 'all' && t.exit != null && (t.state === 'WIN' || t.state === 'LOSS')) mk.push({ time: tsec(c[t.exit].t), position: 'inBar', color: t.state === 'WIN' ? '#22c55e' : '#f43f5e', shape: 'square', text: t.state === 'WIN' ? 'TP' : 'SL' });
    }
    mk.sort((a, b) => a.time - b.time); cs.setMarkers(mk);
    plines.forEach(p => cs.removePriceLine(p)); plines = [];
    const add = (p, col, title, st = 0) => plines.push(cs.createPriceLine({ price: p, color: col, lineWidth: 2, lineStyle: st, axisLabelVisible: true, title }));
    const lives = S.strat === 'all' ? liveList().filter(x => x.s.avgR > 0).slice(0, 2) : (r.res[S.strat].live ? [{ k: S.strat, t: r.res[S.strat].live }] : []);
    for (const { k, t } of lives) { const nm = BOT.S[k].short; add(t.entry, '#a855f7', nm + ' ENTRY'); add(t.sl, '#f43f5e', 'SL', 2); add(t.tp, '#22c55e', 'TP ' + S.cfg.rr + 'R', 2); }
    if (fit) chart.timeScale().setVisibleLogicalRange({ from: c.length - 150, to: c.length + 6 });
  }

  // ---------------- bảng ----------------
  function liveList() {
    const r = S.res; if (!r) return [];
    return Object.keys(r.res).map(k => ({ k, t: r.res[k].live, s: r.res[k] })).filter(x => x.t).sort((a, b) => b.t.i - a.t.i);
  }
  function rankTable() {
    const r = S.res, c = S.data.c, keys = Object.keys(r.res).sort((a, b) => r.res[b].netR - r.res[a].netR);
    $('rank').innerHTML = keys.map(k => {
      const x = r.res[k], L = x.last, st = L ? STATE[L.state] : null;
      const lastTxt = L ? `<span class="chip ${sideCls(L.side)}">${sideTxt(L.side)}</span> ${ft(c[L.i].t)} <span class="${st[1]}">${st[0]}</span>` : '<span class="muted">—</span>';
      return `<tr data-k="${k}" class="${S.strat === k ? 'sel' : ''}"><td><b>${esc(BOT.S[k].name)}</b><br><span class="note">${esc(BOT.S[k].kind)}</span></td><td>${x.n}</td><td>${(x.winRate * 100).toFixed(0)}%</td>
        <td class="${x.netR >= 0 ? 'win' : 'loss'}"><b>${x.netR >= 0 ? '+' : ''}${x.netR.toFixed(1)}R</b></td><td>${isFinite(x.pf) ? x.pf.toFixed(2) : '∞'}</td><td>${x.maxDD.toFixed(1)}R</td><td>${lastTxt}</td></tr>`;
    }).join('');
    const days = (c[c.length - 1].t - c[0].t) / 864e5;
    $('rankNote').textContent = `${c.length} nến ${TFN[S.tf]} (~${days.toFixed(days < 10 ? 1 : 0)} ngày). RR ${S.cfg.rr}, phí ${S.cfg.costPct}%/lệnh. Mẫu nhỏ (dưới ~30 lệnh) chưa đủ tin cậy; xem thêm ở khung khác. Bấm vào một dòng để xem riêng chiến lược đó trên chart.`;
    $('rank').querySelectorAll('tr').forEach(tr => tr.onclick = () => setStrat(S.strat === tr.dataset.k ? 'all' : tr.dataset.k));
  }
  function histTable() {
    const r = S.res, c = S.data.c, keys = S.strat === 'all' ? Object.keys(r.res) : [S.strat];
    const rows = keys.flatMap(k => r.res[k].trades.map(t => ({ k, t }))).sort((a, b) => b.t.i - a.t.i).slice(0, 25);
    $('histTitle').textContent = 'Lịch sử tín hiệu' + (S.strat === 'all' ? ' (tất cả chiến lược)' : ' · ' + BOT.S[S.strat].name);
    $('hist').innerHTML = rows.length ? rows.map(({ k, t }) => { const st = STATE[t.state];
      return `<tr><td>${ft(c[t.i].t)}</td><td><span class="chip ${sideCls(t.side)}">${sideTxt(t.side)}${t.limit ? ' LIMIT' : ''}</span> ${esc(BOT.S[k].short)}</td><td class="mono">${fx(t.entry)}</td><td class="mono">${fx(t.sl)}</td><td class="mono">${fx(t.tp)}</td>
        <td class="${st[1]}">${st[0]}${t.r != null ? ` (${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R)` : ''}</td><td class="note">${esc(t.note || '')}</td></tr>`; }).join('')
      : '<tr><td colspan="7" class="muted">Chưa có tín hiệu trong dữ liệu đang xem.</td></tr>';
  }
  function nowCard() {
    const r = S.res, cons = r.consensus, c = S.data.c, last = c[c.length - 1].c;
    let h = '';
    if (cons.side) {
      const names = (cons.side > 0 ? cons.buy : cons.sell).map(k => BOT.S[k].short).join(', ');
      h += `<div class="sig ${sideCls(cons.side)}"><div class="t"><span class="big">${cons.side > 0 ? 'THIÊN MUA' : 'THIÊN BÁN'}</span><span class="chip ${sideCls(cons.side)}">${cons.n}/7 đồng thuận</span></div>
        <p class="note" style="margin:6px 0 0">${esc(names)} cùng báo ${sideTxt(cons.side)} trong ${S.cfg.freshBars} nến ${TFN[S.tf]} gần nhất (chỉ tính chiến lược có lãi khi backtest).</p></div>`;
    } else h += `<div class="sig"><div class="t"><span class="big">Đứng ngoài</span><span class="chip">0 đồng thuận</span></div><p class="note" style="margin:6px 0 0">Chưa có chiến lược nào (có lãi khi backtest) báo tín hiệu mới trong ${S.cfg.freshBars} nến ${TFN[S.tf]} gần nhất.</p></div>`;
    const lv = liveList();
    if (lv.length) h += lv.map(({ k, t, s }) => {
      const R = Math.abs(t.entry - t.sl);
      return `<div class="sig ${sideCls(t.side)}"><div class="t"><span>${sideTxt(t.side)} ${t.limit ? 'LIMIT' : ''} · ${esc(BOT.S[k].short)}</span><span class="chip">${STATE[t.state][0]}</span></div>
        <div class="lv"><span>Entry</span><b>${fx(t.entry)}</b><span>${t.state === 'PENDING' ? 'cách ' + fx(Math.abs(last - t.entry)) : 'giá ' + fx(last)}</span>
        <span>Stop Loss</span><b class="loss">${fx(t.sl)}</b><span>−1R · ${fx(R)}</span>
        <span>Take Profit</span><b class="win">${fx(t.tp)}</b><span>+${S.cfg.rr}R</span></div>
        <p class="note" style="margin:6px 0 0">${ft(c[t.i].t)} · ${esc(t.note || '')}<br>Backtest: ${s.n} lệnh, thắng ${(s.winRate * 100).toFixed(0)}%, <span class="${s.netR >= 0 ? 'win' : 'loss'}">${s.netR >= 0 ? '+' : ''}${s.netR.toFixed(1)}R</span>${s.avgR <= 0 ? ' · <b class="loss">chiến lược này đang lỗ trên dữ liệu này</b>' : ''}</p></div>`;
    }).join('');
    else h += '<p class="note" style="margin:10px 0 0">Không có lệnh nào đang mở hoặc đang chờ khớp.</p>';
    $('now').innerHTML = h;
  }
  function radarTable() {
    $('radar').innerHTML = Object.keys(SYMS).map(sym => `<tr><td><b>${SYMS[sym].name}</b></td>` + TFS.map(tf => {
      const x = S.radar[sym + tf];
      if (!x) return '<td><span class="cell">…</span></td>';
      if (x.err) return '<td><span class="cell" title="lỗi tải">×</span></td>';
      const cl = x.side > 0 ? 'buy' : x.side < 0 ? 'sell' : '';
      return `<td><span class="cell ${cl}" data-s="${sym}" data-t="${tf}" style="cursor:pointer" title="${esc(x.names)}">${x.side ? (x.side > 0 ? '▲' : '▼') + x.n : '—'}</span></td>`;
    }).join('') + '</tr>').join('');
    $('radar').querySelectorAll('[data-s]').forEach(el => el.onclick = () => { setSym(el.dataset.s); setTf(el.dataset.t); });
  }
  function stratList() {
    $('strats').innerHTML = Object.keys(BOT.S).map(k => { const s = BOT.S[k]; return `<div class="strat"><b>${esc(s.name)}</b> <span class="chip">${esc(s.kind)}</span><p>${esc(s.desc)}</p><p style="font-size:12px">Nguồn: ${esc(s.src)}</p></div>`; }).join('');
    $('stratSel').innerHTML = '<option value="all">Tất cả chiến lược</option>' + Object.keys(BOT.S).map(k => `<option value="${k}">${esc(BOT.S[k].name)}</option>`).join('');
    $('stratSel').value = S.strat;
  }

  // ---------------- thông báo ----------------
  function beep() { try { const A = new (window.AudioContext || window.webkitAudioContext)(), o = A.createOscillator(), g = A.createGain(); o.frequency.value = 880; o.connect(g); g.connect(A.destination); g.gain.setValueAtTime(.2, A.currentTime); g.gain.exponentialRampToValueAtTime(.001, A.currentTime + .6); o.start(); o.stop(A.currentTime + .6); } catch (_) {} }
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 8000); }
  function notify(title, body) {
    toast(title + ' — ' + body); beep();
    if (S.notif && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body, tag: title }); } catch (_) {} }
  }
  // báo khi có tín hiệu mới từ chiến lược đang có lãi, hoặc khi đồng thuận ≥ 2
  function checkAlerts(sym, tf, a, c, quiet) {
    let changed = false;
    for (const k in a.res) {
      const f = a.res[k].fresh; if (!f || !(f.state === 'OPEN' || f.state === 'PENDING') || a.res[k].avgR <= 0 || a.res[k].n < 5) continue;
      const id = `${sym}|${tf}|${k}|${c[f.i].t}`; if (S.seen[id]) continue; S.seen[id] = Date.now(); changed = true;
      if (!quiet) notify(`${sideTxt(f.side)} ${SYMS[sym].name} ${TFN[tf]} · ${BOT.S[k].short}`, `Entry ${f.entry.toFixed(SYMS[sym].dp)} · SL ${f.sl.toFixed(SYMS[sym].dp)} · TP ${f.tp.toFixed(SYMS[sym].dp)}`);
    }
    if (a.consensus.n >= 2) {
      const id = `${sym}|${tf}|cons|${a.consensus.side}|${c[c.length - 1].t}`;
      const prev = Object.keys(S.seen).some(x => x.startsWith(`${sym}|${tf}|cons|${a.consensus.side}|`) && Date.now() - S.seen[x] < S.cfg.freshBars * MS[tf]);
      if (!prev) { S.seen[id] = Date.now(); changed = true; if (!quiet) notify(`🔥 ${a.consensus.n} chiến lược cùng ${sideTxt(a.consensus.side)} ${SYMS[sym].name} ${TFN[tf]}`, (a.consensus.side > 0 ? a.consensus.buy : a.consensus.sell).map(k => BOT.S[k].short).join(', ')); }
    }
    if (changed) { const cut = Date.now() - 7 * 864e5; for (const x in S.seen) if (S.seen[x] < cut) delete S.seen[x]; LS.set('bot.seen', S.seen); }
  }

  // ---------------- nhật ký máy chủ (GitHub Actions + Telegram) ----------------
  const RAW = 'https://raw.githubusercontent.com/letuan1111/doc-tieng-trung/bot-data/signals.json';
  const STATE2 = { WIN: ['TP ✓', 'win'], LOSS: ['SL ✗', 'loss'], TIME: ['Hết giờ', 'muted'], OPEN: ['Đang chạy', ''], PENDING: ['Chờ khớp', ''], EXPIRED: ['Hết hạn', 'muted'], MISSED: ['Lỡ', 'muted'], STALE: ['Quá cũ', 'muted'] };
  const symName = (k) => (SYMS[k] && SYMS[k].name) || k;
  async function loadServer() {
    let j; try { j = await getJSON(RAW + '?t=' + Math.floor(Date.now() / 6e4)); } catch (e) { $('srv').innerHTML = `<p class="note">Máy chủ chưa chạy lần nào hoặc chưa tải được nhật ký (${esc(e.message)}). GitHub Actions thường chạy lần đầu sau 5–15 phút. <a href="huong-dan-telegram.html" style="color:var(--blue)">Hướng dẫn kết nối Telegram</a></p>`; return; }
    const age = (Date.now() - j.updated) / 6e4, sg = j.signals || [];
    const tgTxt = !j.telegram || !j.telegram.configured ? '<span class="chip warn">Telegram: chưa thêm token</span>' : j.telegram.connected ? '<span class="chip buy">Telegram: đã kết nối</span>' : '<span class="chip warn">Telegram: gửi /start cho bot</span>';
    const mtTxt = !j.mt5 || !j.mt5.configured ? '<span class="chip">MT5: chưa cấu hình</span>' : j.mt5.live ? '<span class="chip buy">MT5: đang dùng</span>' : '<span class="chip">MT5: tắt → nguồn công khai</span>';
    const st = (days) => { const d = sg.filter(x => x.r != null && x.t >= Date.now() - days * 864e5), w = d.filter(x => x.r > 0).length, R = d.reduce((s, x) => s + x.r, 0);
      return `<div><b class="${R >= 0 ? 'win' : 'loss'}">${R >= 0 ? '+' : ''}${R.toFixed(1)}R</b><br><span class="note">${days} ngày · ${d.length} lệnh · thắng ${d.length ? Math.round(w / d.length * 100) : 0}%</span></div>`; };
    const rows = sg.slice().reverse().slice(0, 15).map(x => { const s2 = STATE2[x.state] || [x.state, ''], dpx = (SYMS[x.sym] || { dp: 2 }).dp, f = (v) => Number(v).toFixed(dpx);
      return `<tr><td>${ft(x.t)}</td><td>${symName(x.sym)} ${TFN[x.tf] || x.tf}</td><td><span class="chip ${sideCls(x.side)}">${sideTxt(x.side)}</span> ${esc(x.stratShort)}</td><td class="mono">${f(x.entry)}</td><td class="mono">${f(x.sl)}</td><td class="mono">${f(x.tp)}</td><td class="${s2[1]}">${s2[0]}${x.r != null ? ` (${x.r >= 0 ? '+' : ''}${x.r.toFixed(2)}R)` : ''}</td></tr>`; }).join('');
    $('srv').innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip ${age < 30 ? 'buy' : 'warn'}">Quét ${age < 1 ? 'vừa xong' : Math.round(age) + ' phút trước'}</span>${tgTxt}${mtTxt}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0">${st(7)}${st(30)}</div>
      <p class="note" style="margin:0 0 6px">Máy chủ quét ${esc((j.symbols || []).map(symName).join(', '))} khung ${esc((j.tfs || []).map(x => TFN[x] || x).join(', '))}, gửi Telegram khi có tín hiệu mới, chạm entry, TP/SL.</p>
      ${rows ? `<div class="tw"><table><thead><tr><th>Thời gian</th><th>Mã</th><th>Lệnh</th><th>Entry</th><th>SL</th><th>TP</th><th>Kết quả</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="note">Chưa có tín hiệu nào được gửi.</p>'}`;
  }

  // ---------------- bot MT5 (EA v16.1) ----------------
  async function loadBotMT5() {
    const el = $('mt5bot');
    if (!MT5.db) { el.innerHTML = '<p class="note">Nhập địa chỉ Firebase ở ô <b>Nguồn MT5</b> để xem bot MT5 và dùng giá Exness.</p>'; return; }
    try {
      const base = MT5.db.replace(/\/+$/, ''); if (!S.botLogin) { const l = await getJSON(base + '/bot.json?shallow=true'); S.botLogin = l ? Object.keys(l)[0] : null; }
      if (!S.botLogin) { el.innerHTML = '<p class="note">Bot MT5 chưa gửi dữ liệu (bật <code>InpWebEnable</code> trong EA v16.1).</p>'; return; }
      const b = await getJSON(`${base}/bot/${encodeURIComponent(S.botLogin)}.json`); if (!b) throw new Error('trống');
      const age = (Date.now() - b.updated) / 1000, s = b.symbols && Object.values(b.symbols).find(x => x.symbol === MT5[S.sym]), u = s && s.setup;
      el.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip ${age < 90 ? 'buy' : 'warn'}">${age < 90 ? 'Bot đang chạy' : 'Mất kết nối ' + Math.round(age / 60) + ' phút'}</span>${b.today && b.today.stop ? `<span class="chip sell">Dừng: ${esc(b.today.stop)}</span>` : ''}<span class="chip">Hôm nay ${b.today ? (b.today.pl >= 0 ? '+' : '') + (+b.today.pl).toFixed(2) : '—'} USD</span></div>` +
        (s ? `<p class="note" style="margin:8px 0 0">${u ? `<b class="${u.side === 'BUY' ? 'win' : 'loss'}">${u.side} ${esc(u.method)}</b> Entry ${fx(u.entry)} · SL ${fx(u.sl)} · TP ${fx(u.tp)} (${(+u.rr).toFixed(2)}R)<br>` : ''}${esc(s.scan || '')}</p>` : `<p class="note" style="margin:8px 0 0">Bot không theo dõi ${esc(SYMS[S.sym].name)}.</p>`) +
        `<p class="note" style="margin:6px 0 0"><a href="../tin-hieu/bot.html" style="color:var(--blue)">Bảng theo dõi bot đầy đủ</a></p>`;
    } catch (e) { el.innerHTML = `<p class="note">Không đọc được dữ liệu bot MT5 (${esc(e.message)}).</p>`; }
  }

  // ---------------- vòng lặp ----------------
  let busy = false, firstLoad = true;
  async function refresh(fit) {
    if (busy) return; busy = true;
    const sym = S.sym, tf = S.tf;
    try {
      const d = await load(sym, tf); if (sym !== S.sym || tf !== S.tf) return;
      const c = closed(d.c), live = d.c[d.c.length - 1];
      S.data = { c, src: d.src }; S.res = BOT.analyze(c, engCfg()); if (sym === S.sym && !d.mt5 && mt5Name(sym)) S.mt5live = false;
      $('px').textContent = fx(live.c);
      const day = d.c.find(x => x.t >= live.t - 864e5) || d.c[0], ch = (live.c - day.o) / day.o * 100;
      $('chg').textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '% 24h'; $('chg').className = 'chip ' + (ch >= 0 ? 'buy' : 'sell');
      $('src').textContent = d.src + ' · ' + d.code + (d.off ? ` (căn theo Exness ${d.off > 0 ? '+' : ''}${fx(d.off)})` : '') + (!d.mt5 && mt5Name(sym) ? ' · MT5 không hoạt động' : ''); $('src').className = 'chip ' + (d.mt5 ? 'buy' : mt5Name(sym) ? 'warn' : ''); $('upd').textContent = 'Cập nhật ' + new Date().toLocaleTimeString('vi-VN');
      renderChart(fit); rankTable(); histTable(); nowCard();
      S.radar[sym + tf] = radarCell(S.res); radarTable();
      checkAlerts(sym, tf, S.res, c, firstLoad); firstLoad = false;
    } catch (e) {
      console.error(e); $('src').textContent = 'Lỗi tải dữ liệu'; $('now').innerHTML = `<p class="err">Không tải được dữ liệu (${esc(e.message)}). Kiểm tra mạng rồi tải lại trang.</p>`;
    } finally { busy = false; }
  }
  const radarCell = (a) => ({ side: a.consensus.side, n: a.consensus.n, names: (a.consensus.side > 0 ? a.consensus.buy : a.consensus.side < 0 ? a.consensus.sell : []).map(k => BOT.S[k].short).join(', ') || 'không có' });
  let scanning = false, firstScan = true;
  async function scan() {
    if (scanning) return; scanning = true; $('radarNote').textContent = 'Đang quét…';
    const jobs = []; for (const sym of Object.keys(SYMS)) for (const tf of TFS) jobs.push([sym, tf]);
    let idx = 0;
    const worker = async () => {
      while (idx < jobs.length) {
        const [sym, tf] = jobs[idx++];
        try { const d = await load(sym, tf), c = closed(d.c), a = BOT.analyze(c, engCfg()); S.radar[sym + tf] = radarCell(a); checkAlerts(sym, tf, a, c, firstScan); }
        catch (_) { S.radar[sym + tf] = { err: true }; }
        radarTable();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    firstScan = false; scanning = false; $('radarNote').textContent = 'Quét lúc ' + new Date().toLocaleTimeString('vi-VN') + ' · tự quét mỗi 5 phút';
  }

  // ---------------- sự kiện ----------------
  function segInit(id, items, cur, fn) {
    const el = $(id);
    if (items) el.innerHTML = items.map(([v, t]) => `<button data-v="${v}">${t}</button>`).join('');
    const mark = (v) => [...el.children].forEach(b => b.classList.toggle('on', b.dataset.v === v));
    mark(cur); el.onclick = (e) => { const b = e.target.closest('button'); if (b) fn(b.dataset.v); };
    return mark;
  }
  const markSym = segInit('symSeg', Object.keys(SYMS).map(k => [k, SYMS[k].name]), S.sym, (v) => setSym(v));
  const markTf = segInit('tfSeg', null, S.tf, (v) => setTf(v));
  function setSym(v) { if (v === S.sym) return; S.sym = v; LS.set('bot.sym', v); markSym(v); $('px').textContent = '—'; $('src').textContent = 'đang tải…'; refresh(true); loadBotMT5(); }
  function setTf(v) { if (v === S.tf) return; S.tf = v; LS.set('bot.tf', v); markTf(v); refresh(true); }
  function setStrat(v) { S.strat = v; LS.set('bot.strat', v); $('stratSel').value = v; if (S.res) { renderChart(false); rankTable(); histTable(); } }
  $('stratSel').onchange = (e) => setStrat(e.target.value);
  $('cRR').value = S.cfg.rr; $('cMax').value = S.cfg.maxBars; $('cCost').value = S.cfg.costPct; $('cFresh').value = S.cfg.freshBars;
  $('cApply').onclick = () => {
    S.cfg = { rr: Math.min(6, Math.max(0.5, +$('cRR').value || 2)), maxBars: Math.max(5, +$('cMax').value || 48), costPct: Math.max(0, +$('cCost').value || 0), freshBars: Math.max(1, +$('cFresh').value || 3) };
    LS.set('bot.cfg', S.cfg); S.radar = {}; radarTable(); refresh(false); scan(); toast('Đã áp dụng cài đặt, đang tính lại');
  };
  $('scanBtn').onclick = () => scan();
  const nb = $('notifBtn'), setNB = () => { nb.textContent = S.notif ? '🔔 Thông báo: BẬT' : '🔕 Bật thông báo'; };
  nb.onclick = async () => {
    if (!S.notif && 'Notification' in window && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch (_) {} }
    S.notif = !S.notif; LS.set('bot.notif', S.notif); setNB(); beep();
    toast(S.notif ? 'Sẽ báo khi có tín hiệu mới hoặc nhiều chiến lược đồng thuận (khi trang đang mở)' : 'Đã tắt thông báo');
  };
  $('mDb').value = MT5.db; $('mX').value = MT5.XAU; $('mB').value = MT5.BTC;
  $('mSave').onclick = () => {
    MT5.db = $('mDb').value.trim(); MT5.XAU = $('mX').value.trim() || 'XAUUSDm'; MT5.BTC = $('mB').value.trim() || 'BTCUSDm';
    LS.set('smc.mt5', MT5); S.botLogin = null; S.radar = {}; radarTable(); toast(MT5.db ? 'Đã lưu – thử lấy dữ liệu MT5…' : 'Đã tắt nguồn MT5'); refresh(false); loadBotMT5(); scan();
  };
  setNB(); stratList(); radarTable(); initChart(); refresh(true); loadServer(); loadBotMT5();
  setInterval(loadServer, 2 * 60e3); setInterval(loadBotMT5, 30e3);
  setTimeout(scan, 1500);
  setInterval(() => refresh(false), 60e3); setInterval(scan, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
})();
