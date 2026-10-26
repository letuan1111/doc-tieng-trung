/* Giao diện bot tín hiệu ICT/SMC: tải nến, chạy engine ICT (ict.js), vẽ cấu trúc/OB/FVG/thanh khoản lên chart,
   so sánh giá với TradingView, radar, thông báo, nhật ký máy chủ. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const SYMS = {
    XAU: { name: 'XAUUSD', bn: 'XAUUSDT', okx: 'XAU-USDT-SWAP', by: 'XAUUSDT', dp: 2, tv: 'OANDA:XAUUSD' },
    BTC: { name: 'BTCUSD', bn: 'BTCUSDT', okx: 'BTC-USDT-SWAP', by: 'BTCUSDT', dp: 1, tv: 'BITSTAMP:BTCUSD' },
    ETH: { name: 'ETHUSD', bn: 'ETHUSDT', okx: 'ETH-USDT-SWAP', by: 'ETHUSDT', dp: 2, tv: 'BITSTAMP:ETHUSD' },
    SOL: { name: 'SOLUSD', bn: 'SOLUSDT', okx: 'SOL-USDT-SWAP', by: 'SOLUSDT', dp: 3, tv: 'COINBASE:SOLUSD' },
  };
  const TFS = ['m5', 'm15', 'h1', 'h4'], TFN = { m5: 'M5', m15: 'M15', h1: 'H1', h4: 'H4' };
  const IV = { m5: '5m', m15: '15m', h1: '1h', h4: '4h' }, MS = { m5: 3e5, m15: 9e5, h1: 36e5, h4: 144e5 };
  const OKX_IV = { m5: '5m', m15: '15m', h1: '1H', h4: '4H' }, BY_IV = { m5: '5', m15: '15', h1: '60', h4: '240' };
  const BARS = 1500;

  // ---------------- dữ liệu ----------------
  async function getJSON(u, opt) { const r = await fetch(u, Object.assign({ cache: 'no-store' }, opt)); if (!r.ok) throw new Error(r.status + ''); return r.json(); }
  const SRC = [
    { n: 'OKX', f: async (s, tf, bars = BARS) => {
      let out = (await getJSON(`https://www.okx.com/api/v5/market/candles?instId=${s.okx}&bar=${OKX_IV[tf]}&limit=300`)).data || [];
      for (let p = 0; p < 12 && out.length && out.length < bars; p++) { const a = (await getJSON(`https://www.okx.com/api/v5/market/history-candles?instId=${s.okx}&bar=${OKX_IV[tf]}&limit=100&after=${out[out.length - 1][0]}`)).data || []; if (!a.length) break; out = out.concat(a); }
      return out.reverse().map(k => ({ t: +k[0], ct: +k[0] + MS[tf], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
    } },
    { n: 'Binance Futures', f: async (s, tf, bars = BARS) => (await getJSON(`https://fapi.binance.com/fapi/v1/klines?symbol=${s.bn}&interval=${IV[tf]}&limit=${Math.min(1500, bars)}`)).map(k => ({ t: k[0], ct: k[6] + 1, o: +k[1], h: +k[2], l: +k[3], c: +k[4] })) },
    { n: 'Bybit', f: async (s, tf) => { const j = await getJSON(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${s.by}&interval=${BY_IV[tf]}&limit=1000`); return (j.result.list || []).reverse().map(k => ({ t: +k[0], ct: +k[0] + MS[tf], o: +k[1], h: +k[2], l: +k[3], c: +k[4] })); } },
  ];
  const srcPref = {};
  const MT5 = Object.assign({ db: '', root: 'mt5', XAU: 'XAUUSDm', BTC: 'BTCUSDm' }, LS.get('smc.mt5', {}));
  const mt5Name = (sym) => (MT5.db && MT5[sym]) || '';
  async function mt5Load(sym, tf) {
    const j = await getJSON(`${MT5.db.replace(/\/+$/, '')}/${MT5.root || 'mt5'}/${encodeURIComponent(mt5Name(sym))}/${tf}.json?orderBy=%22$key%22&limitToLast=${BARS}`);
    if (!j) throw new Error('MT5 chưa gửi dữ liệu');
    const c = Object.entries(j).map(([k, v]) => ({ t: +k * 1000, ct: +k * 1000 + MS[tf], o: +v[0], h: +v[1], l: +v[2], c: +v[3] })).sort((a, b) => a.t - b.t);
    if (!c.length || Date.now() - c[c.length - 1].t > MS[tf] + 20 * 60e3) throw new Error('MT5 không cập nhật (máy tắt hoặc thị trường đóng)');
    return c;
  }
  // chênh lệch MT5 − nguồn công khai, đo khi MT5 bật
  const OFF = LS.get('bot.off', {}), calibAt = {};
  async function calibrate(sym) {
    if (calibAt[sym] && Date.now() - calibAt[sym] < 30 * 60e3) return; calibAt[sym] = Date.now();
    try {
      const m = await mt5Load(sym, 'm15'), last = m[m.length - 2] || m[m.length - 1];
      for (const src of SRC) { try { const p = await src.f(SYMS[sym], 'm15'), q = p.find(x => x.t === last.t); if (q) OFF[sym + '|' + src.n] = { v: +(last.c - q.c).toFixed(5), t: Date.now() }; } catch (_) {} }
      LS.set('bot.off', OFF);
    } catch (_) {}
  }
  async function loadRaw(sym, tf, bars) {
    if (mt5Name(sym)) {
      try { const c = await mt5Load(sym, tf); if (c.length >= 300) { calibrate(sym); return { c, src: 'MT5 Exness', code: mt5Name(sym), mt5: true }; } throw new Error('MT5 mới có ' + c.length + ' nến'); }
      catch (e) { S.mt5err = e.message; }
    }
    const s = SYMS[sym], first = srcPref[sym] || 0, order = [first, 0, 1, 2].filter((v, i, a) => a.indexOf(v) === i);
    let err;
    for (const k of order) {
      try { const d = await SRC[k].f(s, tf, bars); if (d.length < 300) throw new Error('ít dữ liệu'); srcPref[sym] = k; return { c: d, src: SRC[k].n, code: k === 0 ? s.okx : s.bn, mt5: false }; }
      catch (e) { err = e; }
    }
    throw err || new Error('không tải được');
  }

  // ---------------- giá TradingView ----------------
  // Lấy trực tiếp từ TradingView (scanner công khai); nếu trình duyệt chặn thì dùng số máy chủ đo (signals.json).
  const TV = {}; // sym -> { price, at, via }
  const tvSym = (sym) => (S.tvMap[sym] || SYMS[sym].tv);
  async function tvPrice(sym) {
    const code = tvSym(sym), now = Date.now();
    if (TV[sym] && TV[sym].code === code && now - TV[sym].at < 20e3) return TV[sym];
    try {
      const j = await getJSON(`https://scanner.tradingview.com/symbol?symbol=${encodeURIComponent(code)}&fields=close`);
      if (j && isFinite(+j.close)) return (TV[sym] = { code, price: +j.close, at: now, via: 'web' });
      throw new Error('không có giá');
    } catch (_) {
      const s = S.server && S.server.tv && S.server.tv[sym];
      if (s && s.code === code && isFinite(s.price)) return (TV[sym] = { code, price: s.price, at: s.at, via: 'server', diffBy: s.diff });
      return (TV[sym] = { code, price: null, at: now, via: 'none' });
    }
  }

  async function load(sym, tf, bars) {
    const d = await loadRaw(sym, tf, bars), live = d.c[d.c.length - 1];
    const tv = await tvPrice(sym);
    // chênh lệch: TradingView − nguồn (cùng thời điểm)
    let diff = null;
    if (tv.price != null) {
      if (tv.via === 'web') diff = tv.price - live.c;
      else if (tv.diffBy && tv.diffBy[d.mt5 ? 'mt5' : d.src] != null) diff = tv.diffBy[d.mt5 ? 'mt5' : d.src];
      else diff = tv.price - live.c;
    }
    let off = 0, offTxt = '';
    if (!d.mt5) {
      if (S.cfg.align === 'tv' && diff != null) { off = diff; offTxt = 'căn theo TradingView'; }
      else if (S.cfg.align === 'mt5') { const o = OFF[sym + '|' + d.src]; if (o && Date.now() - o.t < 7 * 864e5) { off = o.v; offTxt = 'căn theo Exness'; } }
    }
    const c = off ? d.c.map(x => ({ ...x, o: x.o + off, h: x.h + off, l: x.l + off, c: x.c + off })) : d.c;
    return { ...d, c, off, offTxt, tv, diff, raw: live.c };
  }
  const closed = (c) => { const now = Date.now(); return c.filter(x => x.ct <= now); };

  // ---------------- trạng thái ----------------
  const S = {
    sym: LS.get('bot.sym', 'XAU'), tf: LS.get('bot.tf', 'm15'),
    cfg: Object.assign({ minRR: 1.5, rr: 2, expiry: 20, costPct: 0.04, minGrade: 'B', htf: 'grade', align: 'tv' }, LS.get('bot.cfg2', {})),
    tvMap: LS.get('bot.tvmap', {}),
    layers: Object.assign({ range: true, struct: true, ob: true, fvg: true, liq: true, sig: true }, LS.get('bot.layers', {})),
    notif: LS.get('bot.notif', false), seen: LS.get('bot.seen2', {}), data: null, res: null, radar: {}, server: null,
  };
  if (!SYMS[S.sym]) S.sym = 'XAU';
  const engCfg = () => ({ minRR: S.cfg.minRR, rr: S.cfg.rr, expiry: S.cfg.expiry, maxBars: 48, cost: S.cfg.costPct / 100, freshBars: 2, minGrade: S.cfg.minGrade, htf: S.cfg.htf });
  const dp = (sym) => SYMS[sym || S.sym].dp;
  const fx = (v, d = dp()) => v == null || !isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgn = (v, d) => (v >= 0 ? '+' : '−') + fx(Math.abs(v), d);
  const ft = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  const STATE = { WIN: ['TP ✓', 'win'], LOSS: ['SL ✗', 'loss'], TIME: ['Hết giờ', 'muted'], OPEN: ['Đang chạy', ''], PENDING: ['Chờ khớp', ''], EXPIRED: ['Hết hạn', 'muted'], MISSED: ['Lỡ (chạy tới TP)', 'muted'], STALE: ['Quá cũ', 'muted'] };
  const sideTxt = (s) => s > 0 ? 'BUY' : 'SELL', sideCls = (s) => s > 0 ? 'buy' : 'sell';
  const MODEL = { sweep: 'Quét + MSS', bos: 'BOS + hồi OB/FVG' };
  const biasTxt = (b) => b > 0 ? '<b class="win">▲ TĂNG</b>' : b < 0 ? '<b class="loss">▼ GIẢM</b>' : '<b class="muted">đi ngang</b>';

  // ---------------- chart ----------------
  let chart, cs, l34, l89, l200, plines = [];
  const TZ = -new Date().getTimezoneOffset() * 60, tsec = (t) => Math.floor(t / 1000) + TZ;
  const dark = () => !window.matchMedia || !window.matchMedia('(prefers-color-scheme: light)').matches;
  function initChart() {
    const dk = dark();
    chart = LightweightCharts.createChart($('chart'), {
      autoSize: true, layout: { background: { color: 'transparent' }, textColor: dk ? '#8b98a8' : '#5b6675', fontFamily: 'Be Vietnam Pro' },
      grid: { vertLines: { color: dk ? '#1c2430' : '#eef1f4' }, horzLines: { color: dk ? '#1c2430' : '#eef1f4' } },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 12 }, crosshair: { mode: 0 }, rightPriceScale: { borderColor: dk ? '#2a3441' : '#dde2e8' },
    });
    cs = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#f43f5e', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#f43f5e' });
    const line = (color, w) => chart.addLineSeries({ color, lineWidth: w, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    l200 = line('#94a3b8', 1); l89 = line('#eab308', 2); l34 = line('#06b6d4', 2);
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => drawSoon());
    chart.subscribeCrosshairMove(() => drawSoon());
    new ResizeObserver(() => drawSoon()).observe($('chartWrap'));
  }
  let raf = 0; const drawSoon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; drawOverlay(); }); };

  function renderChart(fit) {
    const d = S.data, r = S.res; if (!d || !r || !chart) return;
    const c = d.c;
    cs.applyOptions({ priceFormat: { type: 'price', precision: dp(), minMove: 1 / 10 ** dp() } });
    cs.setData(c.map(x => ({ time: tsec(x.t), open: x.o, high: x.h, low: x.l, close: x.c })));
    l34.setData(c.map((x, i) => ({ time: tsec(x.t), value: r.P.e34[i] })));
    l89.setData(c.map((x, i) => ({ time: tsec(x.t), value: r.P.e89[i] })));
    l200.setData(c.map((x, i) => ({ time: tsec(x.t), value: r.P.e200[i] })).slice(200));
    const mk = [];
    if (S.layers.sig) for (const t of r.bt.trades) {
      if (t.i < c.length - 400) continue;
      mk.push({ time: tsec(c[t.i].t), position: t.side > 0 ? 'belowBar' : 'aboveBar', color: t.side > 0 ? '#22c55e' : '#f43f5e', shape: t.side > 0 ? 'arrowUp' : 'arrowDown', text: sideTxt(t.side) + ' ' + t.grade });
      if (t.exit != null && (t.state === 'WIN' || t.state === 'LOSS')) mk.push({ time: tsec(c[t.exit].t), position: 'inBar', color: t.state === 'WIN' ? '#22c55e' : '#f43f5e', shape: 'square', text: t.state === 'WIN' ? 'TP' : 'SL' });
    }
    mk.sort((a, b) => a.time - b.time); cs.setMarkers(mk);
    plines.forEach(p => cs.removePriceLine(p)); plines = [];
    const add = (p, col, title, st = 0) => plines.push(cs.createPriceLine({ price: p, color: col, lineWidth: 2, lineStyle: st, axisLabelVisible: true, title }));
    for (const t of r.live.slice(-2)) { add(t.entry, '#a855f7', (t.state === 'PENDING' ? 'LIMIT ' : '') + sideTxt(t.side) + ' ' + t.grade); add(t.sl, '#f43f5e', 'SL', 2); add(t.tp, '#22c55e', 'TP ' + (+t.rr).toFixed(1) + 'R', 2); }
    if (fit) chart.timeScale().setVisibleLogicalRange({ from: c.length - 160, to: c.length + 12 });
    drawSoon();
  }

  // lớp vẽ ICT/SMC (canvas phủ lên chart, toạ độ theo chỉ số nến)
  function drawOverlay() {
    const cv = $('ov'), wrap = $('chartWrap'), r = S.res, d = S.data;
    const W0 = wrap.clientWidth, H0 = wrap.clientHeight, pr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(W0 * pr) || cv.height !== Math.round(H0 * pr)) { cv.width = Math.round(W0 * pr); cv.height = Math.round(H0 * pr); cv.style.width = W0 + 'px'; cv.style.height = H0 + 'px'; }
    const g = cv.getContext('2d'); g.setTransform(pr, 0, 0, pr, 0, 0); g.clearRect(0, 0, W0, H0);
    if (!r || !d || !chart) return;
    const ts = chart.timeScale(), W = W0 - chart.priceScale('right').width(), H = H0 - ts.height();
    const vr = ts.getVisibleLogicalRange(); if (!vr) return;
    const n = d.c.length, i0 = Math.max(0, Math.floor(vr.from) - 2), xR = W;
    const X = (i) => ts.logicalToCoordinate(i), Y = (p) => cs.priceToCoordinate(p);
    const dk = dark(), txt = dk ? '#cbd5e1' : '#334155';
    g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();
    g.font = '600 10.5px "Be Vietnam Pro", system-ui, sans-serif'; g.textBaseline = 'middle';
    const box = (a, b, top, bot, fill, stroke, label, lc) => {
      const x1 = X(a), x2 = b == null ? xR : X(b), y1 = Y(top), y2 = Y(bot);
      if (x1 == null || y1 == null || y2 == null) return; const xe = x2 == null ? xR : x2;
      if (xe < 0 || x1 > W) return;
      g.fillStyle = fill; g.fillRect(x1, Math.min(y1, y2), Math.max(1, xe - x1), Math.max(1, Math.abs(y2 - y1)));
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.setLineDash([]); g.strokeRect(x1 + .5, Math.min(y1, y2) + .5, Math.max(1, xe - x1), Math.max(1, Math.abs(y2 - y1))); }
      if (label) { g.fillStyle = lc || txt; g.textAlign = 'right'; g.fillText(label, Math.min(xe, W) - 4, (y1 + y2) / 2); }
    };
    const hline = (a, b, p, col, dash, label, lpos) => {
      const x1 = X(a), x2 = b == null ? xR : X(b), y = Y(p); if (x1 == null || y == null) return;
      const xe = x2 == null ? xR : x2; if (xe < 0 || x1 > W) return;
      g.strokeStyle = col; g.lineWidth = 1.2; g.setLineDash(dash || []); g.beginPath(); g.moveTo(x1, y + .5); g.lineTo(xe, y + .5); g.stroke(); g.setLineDash([]);
      if (label) { g.fillStyle = col; g.textAlign = lpos === 'end' ? 'right' : 'center'; g.fillText(label, lpos === 'end' ? Math.min(xe, W) - 4 : (Math.max(x1, 0) + Math.min(xe, W)) / 2, y + (lpos === 'below' ? 8 : -7)); }
    };
    // 1. premium / discount của nhịp hiện tại
    const rg = r.ctx.range;
    if (S.layers.range && rg && rg.plI >= i0 - 300) {
      const top = Math.max(rg.pl, rg.ext), bot = Math.min(rg.pl, rg.ext), eq = (top + bot) / 2, a = Math.max(rg.plI, i0);
      box(a, null, top, eq, 'rgba(244,63,94,.07)', null, 'PREMIUM', 'rgba(244,63,94,.9)');
      box(a, null, eq, bot, 'rgba(34,197,94,.07)', null, 'DISCOUNT', 'rgba(34,197,94,.9)');
      hline(a, null, eq, dk ? '#94a3b8' : '#64748b', [4, 4], 'EQ 50%', 'end');
    }
    const A = r.P.atr[n - 1];
    // 2. FVG chưa lấp: 3 vùng gần nhất mỗi chiều, bỏ khoảng trống quá nhỏ
    if (S.layers.fvg) for (const side of [1, -1]) for (const f of r.fvgs.filter(f => f.side === side && f.end == null && f.k >= n - 400 && f.top - f.bot >= 0.25 * A).slice(-3)) {
      const bull = side > 0; box(f.i, null, f.top, f.bot, bull ? 'rgba(59,130,246,.16)' : 'rgba(245,158,11,.16)', null, 'FVG', bull ? '#60a5fa' : '#f59e0b');
    }
    // 3. Order Block còn hiệu lực (chưa bị phá): 3 vùng gần nhất mỗi chiều
    if (S.layers.ob) for (const side of [1, -1]) for (const o of r.obs.filter(o => o.side === side && o.end == null && o.from >= n - 500).slice(-3)) {
      const bull = side > 0; box(o.i, null, o.top, o.bot, bull ? 'rgba(34,197,94,.20)' : 'rgba(244,63,94,.20)', bull ? 'rgba(34,197,94,.7)' : 'rgba(244,63,94,.7)', (bull ? '+OB' : '−OB') + (o.touched != null ? ' ✓' : ''), bull ? '#22c55e' : '#f43f5e');
    }
    // 4. thanh khoản BSL / SSL gần giá + 4 lần quét gần nhất
    if (S.layers.liq) {
      const px = d.c[n - 1].c, open = r.liq.filter(q => q.end == null && q.conf < n);
      const near = [...open.filter(q => q.side > 0 && q.p >= px).sort((a, b) => a.p - b.p).slice(0, 2), ...open.filter(q => q.side < 0 && q.p <= px).sort((a, b) => b.p - a.p).slice(0, 2)];
      for (const q of near) hline(q.i, null, q.p, q.side > 0 ? '#f59e0b' : '#38bdf8', [2, 3], (q.eq ? (q.side > 0 ? 'EQH ' : 'EQL ') : '') + (q.side > 0 ? 'BSL ' : 'SSL ') + fx(q.p), 'end');
      for (const s of r.sweeps.slice(-4)) {
        if (s.i < i0) continue; const x = X(s.i), y = Y(s.p); if (x == null || y == null) continue;
        const col = s.side > 0 ? '#f59e0b' : '#38bdf8';
        g.strokeStyle = col; g.lineWidth = 1; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(x - 18, y); g.lineTo(x + 6, y); g.stroke(); g.setLineDash([]);
        g.fillStyle = col; g.textAlign = 'center'; g.fillText('✕ quét ' + (s.side > 0 ? 'BSL' : 'SSL'), x, y + (s.side > 0 ? -9 : 9));
      }
    }
    // 5. cấu trúc BOS / CHoCH: 6 lần phá vỡ gần nhất
    if (S.layers.struct) for (const e of r.events.slice(-6)) {
      if (e.i < i0) continue;
      const col = e.d > 0 ? '#22c55e' : '#f43f5e';
      hline(e.from, e.i, e.p, e.type === 'CHoCH' ? (e.d > 0 ? '#4ade80' : '#fb7185') : col, e.type === 'CHoCH' ? [5, 3] : [], e.type, e.d > 0 ? 'above' : 'below');
    }
    // 6. POI của lệnh đang chờ / đang chạy
    if (S.layers.sig) for (const t of r.live) {
      const z = t.zone; box(z.i, null, z.top, z.bot, 'rgba(168,85,247,.18)', 'rgba(168,85,247,.9)', 'POI ' + t.poi, '#c084fc');
      if (t.sweep) { const x = X(t.sweep.i), y = Y(t.sweep.p); if (x != null && y != null) { g.fillStyle = '#c084fc'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } }
    }
    g.restore();
  }

  function layersUI() {
    const L = [['range', 'Premium/Discount', 'linear-gradient(#f43f5e55,#22c55e55)'], ['struct', 'BOS / CHoCH', '#22c55e'], ['ob', 'Order Block', '#22c55e88'], ['fvg', 'FVG', '#60a5fa88'], ['liq', 'BSL / SSL / quét', '#f59e0b'], ['sig', 'Tín hiệu + POI', '#a855f7']];
    $('layers').innerHTML = L.map(([k, t, col]) => `<label><input type="checkbox" data-k="${k}" ${S.layers[k] ? 'checked' : ''}><i style="background:${col}"></i>${t}</label>`).join('') +
      '<span><i style="background:#06b6d4;height:3px"></i>EMA 34</span><span><i style="background:#eab308;height:3px"></i>EMA 89</span><span><i style="background:#94a3b8;height:3px"></i>EMA 200</span>';
    $('layers').querySelectorAll('input').forEach(el => el.onchange = () => { S.layers[el.dataset.k] = el.checked; LS.set('bot.layers', S.layers); renderChart(false); });
  }

  // ---------------- thẻ thông tin ----------------
  function tvBox() {
    const d = S.data, tv = d.tv, el = $('tv');
    if (!tv || tv.price == null || d.diff == null) { el.innerHTML = `<span class="note">Chưa lấy được giá TradingView (${esc(tvSym(S.sym))}). Máy chủ sẽ đo lại sau vài phút.</span>`; return; }
    const srcName = d.mt5 ? 'MT5 Exness' : d.src, rawPx = d.raw, tvPx = d.diff + rawPx;
    const age = (Date.now() - tv.at) / 6e4;
    el.innerHTML = `<span>TradingView <b>${esc(tv.code)}</b>: <b>${fx(tvPx)}</b></span>` +
      `<span>${esc(srcName)}: <b>${fx(rawPx)}</b></span>` +
      `<span>Chênh lệch: <b class="${Math.abs(d.diff) < 1e-9 ? '' : d.diff > 0 ? 'win' : 'loss'}">${sgn(-d.diff)}</b> <span class="note">(${esc(srcName)} ${d.diff > 0 ? 'thấp hơn' : d.diff < 0 ? 'cao hơn' : 'bằng'} TradingView ${fx(Math.abs(d.diff))})</span></span>` +
      `<span class="note">${d.off ? '✔ Giá trên chart và Entry/SL/TP đã ' + esc(d.offTxt) : 'Giá trên chart là giá gốc ' + esc(srcName)}${tv.via === 'server' ? ` · số đo của máy chủ ${Math.round(age)} phút trước` : ''}</span>`;
  }
  function ctxCard() {
    const r = S.res, x = r.ctx, c = S.data.c, last = c[c.length - 1].c, rg = x.range, le = x.lastEvent;
    const dir = x.bias > 0 && (S.cfg.htf !== 'require' || x.htf > 0) ? 'Chỉ tìm BUY' : x.bias < 0 && (S.cfg.htf !== 'require' || x.htf < 0) ? 'Chỉ tìm SELL' : 'Đứng ngoài';
    $('biasTxt').innerHTML = `EMA34/89 ${x.tfTxt}: ${biasTxt(x.bias)} · ${esc(x.htfTxt)}: ${biasTxt(x.htf)} → <b>${dir}</b>`;
    const zoneTxt = x.zone ? (x.zone === 'discount' ? '<b class="win">DISCOUNT</b>' : '<b class="loss">PREMIUM</b>') : '—';
    const actOB = r.obs.filter(o => o.end == null && o.side === x.bias).slice(-1)[0], actF = r.fvgs.filter(f => f.end == null && f.side === x.bias).slice(-1)[0];
    $('ctx').innerHTML = [
      ['Hướng EMA 34/89', `${esc(x.tfTxt)} ${biasTxt(x.bias)} · ${esc(x.htfTxt)} ${biasTxt(x.htf)} → <b>${dir}</b>`],
      ['Cấu trúc', `${x.trend > 0 ? '<b class="win">tăng</b>' : x.trend < 0 ? '<b class="loss">giảm</b>' : '—'}${le ? ` · gần nhất <b>${le.type}</b> ${le.d > 0 ? '▲' : '▼'} ${fx(le.p)} lúc ${ft(c[le.i].t)}` : ''}`],
      ['Nhịp hiện tại', rg ? `${fx(Math.min(rg.pl, rg.ext))} → ${fx(Math.max(rg.pl, rg.ext))} · EQ ${fx((rg.pl + rg.ext) / 2)} · giá đang ở ${zoneTxt}` : '—'],
      ['Thanh khoản trên', x.bsl ? `BSL ${fx(x.bsl.p)}${x.bsl.eq ? ' (EQH)' : ''} · cách ${fx(x.bsl.p - last)}` : '—'],
      ['Thanh khoản dưới', x.ssl ? `SSL ${fx(x.ssl.p)}${x.ssl.eq ? ' (EQL)' : ''} · cách ${fx(last - x.ssl.p)}` : '—'],
      ['OB cùng chiều', actOB ? `${fx(actOB.bot)} – ${fx(actOB.top)}${actOB.touched != null ? ' (đã chạm)' : ' (chưa chạm)'}` : '—'],
      ['FVG cùng chiều', actF ? `${fx(actF.bot)} – ${fx(actF.top)} · 50% ${fx((actF.top + actF.bot) / 2)}` : '—'],
    ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
  }
  function statCard() {
    const r = S.res, b = r.bt, c = S.data.c;
    const by = (k) => { const t = b.trades.filter(x => x.model === k && x.r != null); return t.length ? `${t.length} lệnh, ${Math.round(t.filter(x => x.r > 0).length / t.length * 100)}% thắng, ${t.reduce((s, x) => s + x.r, 0) >= 0 ? '+' : ''}${t.reduce((s, x) => s + x.r, 0).toFixed(1)}R` : 'chưa có lệnh'; };
    $('stat').innerHTML = `<div><b>${b.n}</b><span>lệnh đã đóng</span></div><div><b>${(b.winRate * 100).toFixed(0)}%</b><span>tỷ lệ thắng</span></div>` +
      `<div><b class="${b.netR >= 0 ? 'win' : 'loss'}">${b.netR >= 0 ? '+' : ''}${b.netR.toFixed(1)}R</b><span>tổng lãi/lỗ</span></div><div><b>${isFinite(b.pf) ? b.pf.toFixed(2) : '∞'}</b><span>profit factor</span></div>`;
    const days = (c[c.length - 1].t - c[0].t) / 864e5, rj = Object.entries(r.rej).sort((a, b2) => b2[1] - a[1]).map(([w, k]) => `${k} × ${w}`).join(' · ');
    const miss = b.trades.filter(t => t.state === 'MISSED' || t.state === 'EXPIRED').length;
    $('statNote').innerHTML = `${c.length} nến ${TFN[S.tf]} (~${days.toFixed(days < 10 ? 1 : 0)} ngày) · ${r.sigs.length} setup hợp lệ, ${miss} lệnh chờ không khớp (huỷ). Quét + MSS: ${by('sweep')}. BOS + hồi OB: ${by('bos')}.<br>Bị loại: ${esc(rj || 'không')}. Mẫu dưới ~30 lệnh chưa đủ tin cậy.`;
  }
  function histTable() {
    const r = S.res, c = S.data.c, rows = r.bt.trades.slice().reverse().slice(0, 30);
    $('hist').innerHTML = rows.length ? rows.map(t => { const st = STATE[t.state];
      return `<tr><td>${ft(c[t.i].t)}</td><td><span class="chip ${sideCls(t.side)}">${sideTxt(t.side)} LIMIT</span> ${MODEL[t.model]}</td><td><b>${t.grade}</b></td><td class="mono">${fx(t.entry)}</td><td class="mono">${fx(t.sl)}</td><td class="mono">${fx(t.tp)}</td>
        <td class="${st[1]}">${st[0]}${t.r != null ? ` (${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R)` : ''}</td><td class="note wrap">${esc(t.note)}</td></tr>`; }).join('')
      : '<tr><td colspan="8" class="muted">Chưa có setup nào đạt điều kiện trong dữ liệu đang xem.</td></tr>';
  }
  function nowCard() {
    const r = S.res, c = S.data.c, last = c[c.length - 1].c, x = r.ctx;
    let h = '';
    if (r.live.length) h += r.live.slice().reverse().map(t => {
      const R = Math.abs(t.entry - t.sl);
      return `<div class="sig ${sideCls(t.side)}"><div class="t"><span>${sideTxt(t.side)} LIMIT · ${MODEL[t.model]}</span><span class="chip">Hạng ${t.grade} · ${STATE[t.state][0]}</span></div>
        <div class="lv"><span>Entry (${t.poi})</span><b>${fx(t.entry)}</b><span>${t.state === 'PENDING' ? 'cách ' + fx(Math.abs(last - t.entry)) : 'giá ' + fx(last)}</span>
        <span>Stop Loss</span><b class="loss">${fx(t.sl)}</b><span>−1R · ${fx(R)}</span>
        <span>Take Profit</span><b class="win">${fx(t.tp)}</b><span>+${(+t.rr).toFixed(2)}R</span></div>
        <p class="note" style="margin:6px 0 0">${ft(c[t.i].t)} · ${esc(t.note)}${t.state === 'PENDING' ? `<br>Huỷ nếu giá chạm TP trước khi khớp hoặc sau ${t.expiry} nến chưa khớp.` : ''}</p></div>`;
    }).join('');
    else {
      const why = x.bias === 0 ? 'EMA34 và EMA89 đang quấn nhau, chưa rõ hướng.' : `EMA34/89 ${x.bias > 0 ? 'tăng → chờ BUY' : 'giảm → chờ SELL'}. Cần ${x.bias > 0 ? 'quét SSL rồi phá đỉnh, hoặc BOS tăng' : 'quét BSL rồi phá đáy, hoặc BOS giảm'} có FVG/displacement, sau đó đặt LIMIT tại OB/FVG ở ${x.bias > 0 ? 'discount' : 'premium'}.`;
      h += `<div class="sig"><div class="t"><span class="big">Chưa có lệnh</span><span class="chip">${TFN[S.tf]}</span></div><p class="note" style="margin:6px 0 0">${why}</p></div>`;
    }
    $('now').innerHTML = h;
  }
  function radarTable() {
    $('radar').innerHTML = Object.keys(SYMS).map(sym => `<tr><td><b>${SYMS[sym].name}</b></td>` + TFS.map(tf => {
      const x = S.radar[sym + tf];
      if (!x) return '<td><span class="cell">…</span></td>';
      if (x.err) return '<td><span class="cell" title="lỗi tải">×</span></td>';
      const side = x.live ? x.live.side : x.bias, cl = x.live ? sideCls(side) : '';
      const txt = x.live ? (side > 0 ? '▲ ' : '▼ ') + x.live.grade : x.bias > 0 ? '▲' : x.bias < 0 ? '▼' : '—';
      return `<td><span class="cell ${cl}" data-s="${sym}" data-t="${tf}" style="cursor:pointer" title="${x.live ? esc(x.live.note) : 'EMA34/89 ' + (x.bias > 0 ? 'tăng' : x.bias < 0 ? 'giảm' : 'đi ngang') + ', chưa có lệnh'}">${txt}</span></td>`;
    }).join('') + '</tr>').join('');
    $('radar').querySelectorAll('[data-s]').forEach(el => el.onclick = () => { setSym(el.dataset.s); setTf(el.dataset.t); });
  }
  const radarCell = (a) => ({ bias: a.ctx.bias, live: a.live.length ? a.live[a.live.length - 1] : null });

  // ---------------- thông báo ----------------
  function beep() { try { const A = new (window.AudioContext || window.webkitAudioContext)(), o = A.createOscillator(), g = A.createGain(); o.frequency.value = 880; o.connect(g); g.connect(A.destination); g.gain.setValueAtTime(.2, A.currentTime); g.gain.exponentialRampToValueAtTime(.001, A.currentTime + .6); o.start(); o.stop(A.currentTime + .6); } catch (_) {} }
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 8000); }
  function notify(title, body) { toast(title + ' — ' + body); beep(); if (S.notif && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body, tag: title }); } catch (_) {} } }
  function checkAlerts(sym, tf, a, c, quiet) {
    let changed = false;
    for (const t of a.live) {
      if (c.length - 1 - t.i > 3) continue;
      const id = `${sym}|${tf}|${c[t.i].t}|${t.side}`; if (S.seen[id]) continue; S.seen[id] = Date.now(); changed = true;
      if (!quiet) notify(`${sideTxt(t.side)} LIMIT ${SYMS[sym].name} ${TFN[tf]} · hạng ${t.grade}`, `Entry ${t.entry.toFixed(dp(sym))} · SL ${t.sl.toFixed(dp(sym))} · TP ${t.tp.toFixed(dp(sym))}`);
    }
    if (changed) { const cut = Date.now() - 7 * 864e5; for (const x in S.seen) if (S.seen[x] < cut) delete S.seen[x]; LS.set('bot.seen2', S.seen); }
  }

  // ---------------- nhật ký máy chủ ----------------
  const RAW = 'https://raw.githubusercontent.com/letuan1111/doc-tieng-trung/bot-data/signals.json';
  const symName = (k) => (SYMS[k] && SYMS[k].name) || k;
  async function loadServer() {
    let j; try { j = await getJSON(RAW + '?t=' + Math.floor(Date.now() / 6e4)); S.server = j; } catch (e) { $('srv').innerHTML = `<p class="note">Chưa tải được nhật ký máy chủ (${esc(e.message)}). <a href="huong-dan-telegram.html" style="color:var(--blue)">Hướng dẫn kết nối Telegram</a></p>`; return; }
    const age = (Date.now() - j.updated) / 6e4, sg = (j.signals || []).filter(x => x.engine === 'ict');
    const tgTxt = !j.telegram || !j.telegram.configured ? '<span class="chip warn">Telegram: chưa thêm token</span>' : j.telegram.connected ? '<span class="chip buy">Telegram: đã kết nối</span>' : '<span class="chip warn">Telegram: gửi /start cho bot</span>';
    const mtTxt = !j.mt5 || !j.mt5.configured ? '<span class="chip">MT5: chưa cấu hình</span>' : j.mt5.live ? '<span class="chip buy">MT5: đang dùng</span>' : '<span class="chip">MT5: tắt → nguồn công khai</span>';
    const st = (days) => { const d = sg.filter(x => x.r != null && x.t >= Date.now() - days * 864e5), w = d.filter(x => x.r > 0).length, R = d.reduce((s, x) => s + x.r, 0);
      return `<div><b class="${R >= 0 ? 'win' : 'loss'}">${R >= 0 ? '+' : ''}${R.toFixed(1)}R</b><br><span class="note">${days} ngày · ${d.length} lệnh · thắng ${d.length ? Math.round(w / d.length * 100) : 0}%</span></div>`; };
    const today = sg.filter(x => x.t >= new Date().setHours(0, 0, 0, 0));
    const rows = sg.slice().reverse().slice(0, 15).map(x => { const s2 = STATE[x.state] || [x.state, ''], f = (v) => Number(v).toFixed(dp(x.sym) || 2);
      return `<tr><td>${ft(x.t)}</td><td>${symName(x.sym)} ${TFN[x.tf] || x.tf}</td><td><span class="chip ${sideCls(x.side)}">${sideTxt(x.side)}</span> ${esc(x.grade)}</td><td class="mono">${f(x.entry)}</td><td class="mono">${f(x.sl)}</td><td class="mono">${f(x.tp)}</td><td class="${s2[1]}">${s2[0]}${x.r != null ? ` (${x.r >= 0 ? '+' : ''}${x.r.toFixed(2)}R)` : ''}</td></tr>`; }).join('');
    $('srv').innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip ${age < 30 ? 'buy' : 'warn'}">Quét ${age < 1 ? 'vừa xong' : Math.round(age) + ' phút trước'}</span>${tgTxt}${mtTxt}<span class="chip">Hôm nay: ${today.length} tín hiệu</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0">${st(7)}${st(30)}</div>
      <p class="note" style="margin:0 0 6px">Máy chủ quét ${esc((j.symbols || []).map(symName).join(', '))} khung ${esc((j.tfs || []).map(x => TFN[x] || x).join(', '))}, gửi Telegram tín hiệu hạng ${esc(j.cfg && j.cfg.minGrade || 'A')} trở lên.</p>
      ${rows ? `<div class="tw"><table><thead><tr><th>Thời gian</th><th>Mã</th><th>Lệnh</th><th>Entry</th><th>SL</th><th>TP</th><th>Kết quả</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="note">Chưa có tín hiệu ICT nào được gửi.</p>'}`;
  }

  // ---------------- bot MT5 ----------------
  async function loadBotMT5() {
    const el = $('mt5bot');
    if (!MT5.db) { el.innerHTML = '<p class="note">Nhập địa chỉ Firebase ở ô <b>Nguồn MT5</b> để xem bot MT5 và dùng giá Exness.</p>'; return; }
    try {
      const base = MT5.db.replace(/\/+$/, ''); if (!S.botLogin) { const l = await getJSON(base + '/bot.json?shallow=true'); S.botLogin = l ? Object.keys(l)[0] : null; }
      if (!S.botLogin) { el.innerHTML = '<p class="note">Bot MT5 chưa gửi dữ liệu.</p>'; return; }
      const b = await getJSON(`${base}/bot/${encodeURIComponent(S.botLogin)}.json`); if (!b) throw new Error('trống');
      const age = (Date.now() - b.updated) / 1000, s = b.symbols && Object.values(b.symbols).find(x => x.symbol === MT5[S.sym]), u = s && s.setup;
      el.innerHTML = `<div style="display:flex;gap:6px;flex-wrap:wrap"><span class="chip ${age < 90 ? 'buy' : 'warn'}">${age < 90 ? 'Bot đang chạy' : 'Mất kết nối ' + Math.round(age / 60) + ' phút'}</span><span class="chip">Hôm nay ${b.today ? (b.today.pl >= 0 ? '+' : '') + (+b.today.pl).toFixed(2) : '—'} USD</span></div>` +
        (s ? `<p class="note" style="margin:8px 0 0">${u ? `<b class="${u.side === 'BUY' ? 'win' : 'loss'}">${u.side} ${esc(u.method)}</b> Entry ${fx(u.entry)} · SL ${fx(u.sl)} · TP ${fx(u.tp)}<br>` : ''}${esc(s.scan || '')}</p>` : `<p class="note" style="margin:8px 0 0">Bot không theo dõi ${esc(SYMS[S.sym].name)}.</p>`);
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
      S.data = { ...d, c }; S.res = ICT.analyze(c, engCfg());
      $('px').textContent = fx(live.c);
      const day = d.c.find(x => x.t >= live.t - 864e5) || d.c[0], ch = (live.c - day.o) / day.o * 100;
      $('chg').textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '% 24h'; $('chg').className = 'chip ' + (ch >= 0 ? 'buy' : 'sell');
      $('src').textContent = d.src + ' · ' + d.code + (!d.mt5 && mt5Name(sym) ? ' · MT5 không hoạt động' : ''); $('src').className = 'chip ' + (d.mt5 ? 'buy' : mt5Name(sym) ? 'warn' : '');
      $('upd').textContent = 'Cập nhật ' + new Date().toLocaleTimeString('vi-VN');
      renderChart(fit); tvBox(); ctxCard(); statCard(); histTable(); nowCard();
      S.radar[sym + tf] = radarCell(S.res); radarTable();
      checkAlerts(sym, tf, S.res, c, firstLoad); firstLoad = false;
    } catch (e) {
      console.error(e); $('src').textContent = 'Lỗi tải dữ liệu'; $('now').innerHTML = `<p class="err">Không tải được dữ liệu (${esc(e.message)}). Kiểm tra mạng rồi tải lại trang.</p>`;
    } finally { busy = false; }
  }
  let scanning = false, firstScan = true;
  async function scan() {
    if (scanning) return; scanning = true; $('radarNote').textContent = 'Đang quét…';
    const jobs = []; for (const sym of Object.keys(SYMS)) for (const tf of TFS) jobs.push([sym, tf]);
    let idx = 0;
    const worker = async () => { while (idx < jobs.length) { const [sym, tf] = jobs[idx++];
      try { const d = await load(sym, tf, 800), c = closed(d.c), a = ICT.analyze(c, engCfg()); await new Promise(r => setTimeout(r, 400)); S.radar[sym + tf] = radarCell(a); checkAlerts(sym, tf, a, c, firstScan); }
      catch (_) { S.radar[sym + tf] = { err: true }; }
      radarTable(); } };
    await Promise.all([worker(), worker()]);
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
  function setSym(v) { if (v === S.sym) return; S.sym = v; LS.set('bot.sym', v); markSym(v); $('cTv').value = tvSym(v); $('px').textContent = '—'; $('src').textContent = 'đang tải…'; refresh(true); loadBotMT5(); }
  function setTf(v) { if (v === S.tf) return; S.tf = v; LS.set('bot.tf', v); markTf(v); refresh(true); }
  const setIn = () => { $('cGrade').value = S.cfg.minGrade; $('cHtf').value = S.cfg.htf; $('cMinRR').value = S.cfg.minRR; $('cRR').value = S.cfg.rr; $('cExp').value = S.cfg.expiry; $('cCost').value = S.cfg.costPct; $('cAlign').value = S.cfg.align; $('cTv').value = tvSym(S.sym); };
  $('cApply').onclick = () => {
    S.cfg = { minGrade: $('cGrade').value, htf: $('cHtf').value, minRR: Math.min(5, Math.max(1, +$('cMinRR').value || 1.5)), rr: Math.min(6, Math.max(1, +$('cRR').value || 2)), expiry: Math.max(3, +$('cExp').value || 20), costPct: Math.max(0, +$('cCost').value || 0), align: $('cAlign').value };
    const tv = $('cTv').value.trim().toUpperCase(); if (tv && tv !== SYMS[S.sym].tv) S.tvMap[S.sym] = tv; else delete S.tvMap[S.sym];
    LS.set('bot.cfg2', S.cfg); LS.set('bot.tvmap', S.tvMap); delete TV[S.sym]; S.radar = {}; radarTable(); refresh(false); scan(); toast('Đã áp dụng cài đặt, đang tính lại');
  };
  $('scanBtn').onclick = () => scan();
  const nb = $('notifBtn'), setNB = () => { nb.textContent = S.notif ? '🔔 Thông báo: BẬT' : '🔕 Bật thông báo'; };
  nb.onclick = async () => {
    if (!S.notif && 'Notification' in window && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch (_) {} }
    S.notif = !S.notif; LS.set('bot.notif', S.notif); setNB(); beep(); toast(S.notif ? 'Sẽ báo khi có tín hiệu mới (khi trang đang mở)' : 'Đã tắt thông báo');
  };
  $('mDb').value = MT5.db; $('mX').value = MT5.XAU; $('mB').value = MT5.BTC;
  $('mSave').onclick = () => {
    MT5.db = $('mDb').value.trim(); MT5.XAU = $('mX').value.trim() || 'XAUUSDm'; MT5.BTC = $('mB').value.trim() || 'BTCUSDm';
    LS.set('smc.mt5', MT5); S.botLogin = null; S.radar = {}; radarTable(); toast(MT5.db ? 'Đã lưu – thử lấy dữ liệu MT5…' : 'Đã tắt nguồn MT5'); refresh(false); loadBotMT5(); scan();
  };
  setNB(); setIn(); layersUI(); radarTable(); initChart();
  loadServer().finally(() => { refresh(true); setTimeout(scan, 1500); });
  loadBotMT5();
  setInterval(loadServer, 2 * 60e3); setInterval(loadBotMT5, 30e3);
  setInterval(() => refresh(false), 60e3); setInterval(scan, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
})();
