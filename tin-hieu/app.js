/* Giao diện: tải dữ liệu, chạy SMC.analyze, vẽ chart, cảnh báo */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };
  const TFMS = { m5: 3e5, m15: 9e5, h1: 36e5, h4: 144e5 };
  const NEED = { m5: 3000, m15: 1500, h1: 1000, h4: 600 };
  const SYMS = {
    XAU: { name: 'XAUUSD', dp: 2, minBuf: 0.8, tv: 'OANDA:XAUUSD', src: [
      { n: 'Binance Futures XAUUSDT', f: (iv, tot) => binance('XAUUSDT', iv, tot, true) },
      { n: 'OKX XAU-USDT-SWAP', f: (iv, tot) => okx('XAU-USDT-SWAP', iv, Math.min(tot, 1400)) },
      { n: 'Bybit XAUUSDT', f: (iv, tot) => bybit('XAUUSDT', iv, Math.min(tot, 1000)) }] },
    BTC: { name: 'BTCUSD', dp: 2, minBuf: 40, tv: 'BINANCE:BTCUSDT', src: [
      { n: 'Binance BTCUSDT', f: (iv, tot) => binance('BTCUSDT', iv, tot, false) },
      { n: 'OKX BTC-USDT', f: (iv, tot) => okx('BTC-USDT', iv, Math.min(tot, 1400)) },
      { n: 'Bybit BTCUSDT', f: (iv, tot) => bybit('BTCUSDT', iv, Math.min(tot, 1000), 'spot') }] },
  };

  // ---------------- nguồn dữ liệu ----------------
  async function getJSON(u) { const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); }
  async function binance(sym, iv, total, fut) {
    const base = fut ? 'https://fapi.binance.com/fapi/v1/klines' : 'https://api.binance.com/api/v3/klines', lim = fut ? 1500 : 1000;
    let out = [], end = null;
    while (out.length < total) {
      const a = await getJSON(`${base}?symbol=${sym}&interval=${iv}&limit=${Math.min(lim, total - out.length)}` + (end ? `&endTime=${end}` : ''));
      if (!a.length) break; out = a.concat(out); end = a[0][0] - 1; if (a.length < Math.min(lim, total)) break;
    }
    return out.map(k => ({ t: k[0], ct: k[6] + 1, o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
  }
  const OKX_IV = { '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H' }, BY_IV = { '5m': '5', '15m': '15', '1h': '60', '4h': '240' }, IVMS = { '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5 };
  async function okx(inst, iv, total) {
    let out = [], after = '';
    while (out.length < total) {
      const j = await getJSON(`https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=${OKX_IV[iv]}&limit=100${after ? '&after=' + after : ''}`);
      const a = j.data || []; if (!a.length) break;
      out = out.concat(a); after = a[a.length - 1][0];
    }
    return out.reverse().map(k => ({ t: +k[0], ct: +k[0] + IVMS[iv], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
  }
  async function bybit(sym, iv, total, cat = 'linear') {
    const j = await getJSON(`https://api.bybit.com/v5/market/kline?category=${cat}&symbol=${sym}&interval=${BY_IV[iv]}&limit=${Math.min(1000, total)}`);
    return (j.result.list || []).reverse().map(k => ({ t: +k[0], ct: +k[0] + IVMS[iv], o: +k[1], h: +k[2], l: +k[3], c: +k[4] }));
  }
  const IV = { m5: '5m', m15: '15m', h1: '1h', h4: '4h' };

  // ---------------- trạng thái ----------------
  const S = {
    sym: LS.get('smc.sym', 'XAU'), tf: 'm5', view: 'chart', srcIdx: {}, raw: {}, res: null, offset: LS.get('smc.off', {}),
    cfg: LS.get('smc.cfg', { mode: 'strict', entry: 'A', minRR: 1.5, minScore: 85 }), seen: LS.get('smc.seen', {}), notif: LS.get('smc.notif', false),
  };

  async function loadAll(sym, full) {
    const def = SYMS[sym]; let lastErr;
    const order = [S.srcIdx[sym] || 0, ...def.src.map((_, i) => i)].filter((v, i, a) => a.indexOf(v) === i);
    for (const si of order) {
      try {
        const src = def.src[si], d = {};
        for (const k of ['h4', 'h1', 'm15', 'm5']) {
          const prev = S.raw[sym] && S.raw[sym][k];
          if (!full && prev && prev.length && S.srcIdx[sym] === si) { // chỉ tải phần mới
            const fresh = await src.f(IV[k], 30);
            const m = new Map(prev.map(x => [x.t, x])); fresh.forEach(x => m.set(x.t, x));
            d[k] = [...m.values()].sort((a, b) => a.t - b.t).slice(-NEED[k] - 50);
          } else d[k] = await src.f(IV[k], NEED[k]);
        }
        S.srcIdx[sym] = si; S.raw[sym] = d; S.srcName = src.n; return d;
      } catch (e) { lastErr = e; console.warn('Nguồn lỗi', e); }
    }
    throw lastErr || new Error('Không tải được dữ liệu');
  }
  const closedOnly = (d, off) => {
    const now = Date.now(), o = {};
    for (const k in d) o[k] = d[k].filter(x => x.ct <= now).map(x => off ? { ...x, o: x.o + off, h: x.h + off, l: x.l + off, c: x.c + off } : x);
    return o;
  };

  // ---------------- định dạng ----------------
  const fx = (v) => v == null || !isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: SYMS[S.sym].dp, maximumFractionDigits: SYMS[S.sym].dp });
  const ft = (t) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
  const STAGES = ['WAIT_TREND', 'WAIT_POI', 'WAIT_SWEEP', 'WAIT_MSS', 'WAIT_RETEST', 'SIGNAL'];
  const STAGE_VI = { WAIT_TREND: 'Xu hướng', WAIT_POI: 'POI M15', WAIT_SWEEP: 'Sweep', WAIT_MSS: 'MSS M5', WAIT_RETEST: 'Chờ retest', SIGNAL: 'Đã khớp' };
  const STATE_VI = { WAIT_RETEST: 'Chờ khớp', SIGNAL: 'Đang chạy', WIN: 'TP ✓', LOSS: 'SL ✗', INVALID: 'Huỷ' };

  // ---------------- chart ----------------
  let chart, cs, e24, e34, e89, plines = [];
  const SHOW = Object.assign({ m15: true, h1: true, h4: true, liq: true, proj: true, e34: true }, LS.get('smc.show', {}));
  const TZ = -new Date().getTimezoneOffset() * 60;
  const tsec = (t) => Math.floor(t / 1000) + TZ;
  function initChart() {
    const el = $('chart'), dark = document.documentElement.dataset.theme !== 'light';
    chart = LightweightCharts.createChart(el, {
      autoSize: true, layout: { background: { color: 'transparent' }, textColor: dark ? '#8b98a8' : '#5b6675', fontFamily: 'Be Vietnam Pro' },
      grid: { vertLines: { color: dark ? '#1c2430' : '#eef1f4' }, horzLines: { color: dark ? '#1c2430' : '#eef1f4' } },
      timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 8 }, crosshair: { mode: 0 }, rightPriceScale: { borderColor: '#2a3441' },
    });
    cs = chart.addCandlestickSeries({ upColor: '#22c55e', downColor: '#f43f5e', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#f43f5e' });
    e24 = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    e34 = chart.addLineSeries({ color: '#06b6d4', lineWidth: 1, lineStyle: 0, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    e89 = chart.addLineSeries({ color: '#eab308', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    chart.timeScale().subscribeVisibleLogicalRangeChange(drawOverlay);
    new ResizeObserver(() => setTimeout(drawOverlay, 30)).observe(el);
  }
  let viewBars = [];
  function renderChart(fit) {
    const r = S.res; if (!r || !chart) return;
    const tf = r.ind[S.tf], c = tf.c; viewBars = c;
    cs.setData(c.map(x => ({ time: tsec(x.t), open: x.o, high: x.h, low: x.l, close: x.c })));
    e24.setData(c.map((x, i) => ({ time: tsec(x.t), value: tf.e1[i] })));
    e89.setData(c.map((x, i) => ({ time: tsec(x.t), value: tf.e2[i] })));
    e34.setData(SHOW.e34 ? c.map((x, i) => ({ time: tsec(x.t), value: tf.e3[i] })) : []);
    const t0 = c.length ? c[0].t : 0, snap = (t) => { // đưa thời điểm về nến của khung đang xem
      let lo = 0, hi = c.length - 1, b = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].t <= t) { b = m; lo = m + 1; } else hi = m - 1; } return tsec(c[b].t);
    };
    const mk = [];
    for (const e of (r.buy.events[S.tf] || []).slice(S.tf === 'm5' ? -14 : -30)) if (e.t >= t0)
      mk.push({ time: snap(e.t), position: e.dir > 0 ? 'belowBar' : 'aboveBar', color: e.type === 'CHoCH' ? '#f59e0b' : (e.dir > 0 ? '#22c55e' : '#f43f5e'), shape: e.dir > 0 ? 'arrowUp' : 'arrowDown', text: e.type });
    for (const s of r.all) if (s.t >= t0) {
      mk.push({ time: snap(s.t), position: s.side === 'buy' ? 'belowBar' : 'aboveBar', color: '#a855f7', shape: 'circle', text: (s.side === 'buy' ? 'BUY ' : 'SELL ') + s.score });
      if (s.exit && s.exit.r != null) mk.push({ time: snap(s.exit.t), position: 'inBar', color: s.exit.r > 0 ? '#22c55e' : '#f43f5e', shape: 'square', text: s.exit.r > 0 ? 'TP' : 'SL' });
    }
    mk.sort((a, b) => a.time - b.time); cs.setMarkers(mk);
    plines.forEach(p => cs.removePriceLine(p)); plines = [];
    const a = current();
    if (a) {
      const add = (p, col, t, st = 0) => p != null && plines.push(cs.createPriceLine({ price: p, color: col, lineWidth: 2, lineStyle: st, axisLabelVisible: true, title: t }));
      add(a.entry, '#a855f7', 'ENTRY'); add(a.sl, '#f43f5e', 'SL', 2);
      add(a.tp1, '#22c55e', `TP1 ${a.rr1.toFixed(1)}R`, 2); add(a.tp2, '#16a34a', 'TP2', 1); add(a.tp3, '#15803d', 'TP3', 1);
    }
    let fut = 6;
    if (SHOW.proj && r.proj && r.proj.path.length) { const last = r.proj.path[r.proj.path.length - 1].t; fut = Math.min(220, Math.max(6, Math.ceil((last - c[c.length - 1].t) / TFMS[S.tf]) + 4)); }
    chart.timeScale().applyOptions({ rightOffset: Math.max(8, fut) });
    if (fit) chart.timeScale().setVisibleLogicalRange({ from: c.length - 160, to: c.length + fut });
    drawOverlay();
  }
  function current() { const r = S.res; if (!r) return null; return [r.buy.live.active, r.sell.live.active].filter(Boolean).sort((a, b) => b.t - a.t)[0] || null; }
  function drawOverlay() {
    const cv = $('ov'), wrap = $('chartWrap'), r = S.res; if (!r || !chart) return;
    const dpr = window.devicePixelRatio || 1, W = wrap.clientWidth, H = wrap.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const c = viewBars; if (!c.length) return;
    const ts = chart.timeScale(), psW = chart.priceScale('right').width();
    const xOf = (t) => { let lo = 0, hi = c.length - 1, b = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (c[m].t <= t) { b = m; lo = m + 1; } else hi = m - 1; } return ts.logicalToCoordinate(b); };
    const box = (t0, t1, p0, p1, fill, stroke, label) => {
      const x0 = xOf(t0), x1 = t1 ? xOf(t1) : W - psW, y0 = cs.priceToCoordinate(p1), y1 = cs.priceToCoordinate(p0);
      if (x0 == null || y0 == null || y1 == null) return;
      g.fillStyle = fill; g.fillRect(x0, y0, Math.max(2, (x1 ?? W - psW) - x0), Math.max(1, y1 - y0));
      g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(x0, y0, Math.max(2, (x1 ?? W - psW) - x0), Math.max(1, y1 - y0));
      if (label) { g.fillStyle = stroke; g.font = '600 10px Be Vietnam Pro'; g.fillText(label, x0 + 3, y0 + 11); }
    };
    // vùng cản OB/FVG M15/H1/H4 + thanh khoản
    const A = { m15: [.07, .45], h1: [.11, .65], h4: [.16, .9] };
    for (const k of ['h4', 'h1', 'm15']) {
      if (!SHOW[k]) continue;
      for (const [side, col] of [['buy', '34,197,94'], ['sell', '244,63,94']]) {
        for (const q of r[side].htf[k].zones) box(q.t0, null, q.bot, q.top, `rgba(${col},${A[k][0]})`, `rgba(${col},${A[k][1]})`, `${q.kind} ${k.toUpperCase()}`);
        if (SHOW.liq) for (const l of r[side].htf[k].liq) {
          const y = cs.priceToCoordinate(l.p), x0 = xOf(l.t); if (y == null || x0 == null) continue;
          g.strokeStyle = side === 'buy' ? 'rgba(244,63,94,.8)' : 'rgba(34,197,94,.8)'; g.setLineDash([2, 3]); g.lineWidth = k === 'h4' ? 1.6 : 1;
          g.beginPath(); g.moveTo(Math.max(0, x0), y); g.lineTo(W - psW, y); g.stroke(); g.setLineDash([]);
          g.fillStyle = g.strokeStyle; g.font = '600 10px Be Vietnam Pro'; g.fillText((side === 'buy' ? 'BSL ' : 'SSL ') + k.toUpperCase(), W - psW - 52, y - 3);
        }
      }
    }
    // đường giá dự kiến
    if (SHOW.proj && r.proj) {
      const lastI = c.length - 1, lastT = c[lastI].t, step = TFMS[S.tf];
      const X = (t) => ts.logicalToCoordinate(lastI + (t - lastT) / step);
      const path = (pts, col, dash, w, labels) => {
        if (pts.length < 2) return; g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash); g.beginPath();
        pts.forEach((p, i) => { const x = X(p.t), y = cs.priceToCoordinate(p.p); if (x == null || y == null) return; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
        if (labels) pts.forEach((p, i) => { if (!i) return; const x = X(p.t), y = cs.priceToCoordinate(p.p); if (x == null || y == null) return;
          g.fillStyle = col; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); g.font = '600 10px JetBrains Mono'; g.fillText(fx(p.p), x + 5, y + (i % 2 ? -6 : 12)); });
      };
      path(r.proj.alt, 'rgba(148,163,184,.75)', [3, 4], 1.5, true);
      path(r.proj.path, r.proj.bias > 0 ? '#4ade80' : r.proj.bias < 0 ? '#fb7185' : '#e5e7eb', [7, 5], 2.2, true);
      if (r.proj.inval) { const y = cs.priceToCoordinate(r.proj.inval.p), x = X(r.proj.path[0].t); if (y != null && x != null) { g.strokeStyle = 'rgba(245,158,11,.9)'; g.setLineDash([1, 3]); g.beginPath(); g.moveTo(x, y); g.lineTo(W - psW, y); g.stroke(); g.setLineDash([]); g.fillStyle = '#f59e0b'; g.font = '600 10px Be Vietnam Pro'; g.fillText('Vô hiệu ' + fx(r.proj.inval.p), x + 4, y - 4); } }
    }
    // vùng FVG/OB của setup
    for (const s of r.all.slice(-8)) {
      const col = s.side === 'buy' ? '34,197,94' : '244,63,94', z = s.eType === 'A' && s.fvg ? s.fvg : s.ob;
      if (z) box(s.t - 2 * 3e5, s.exit ? s.exit.t : null, z.bot, z.top, `rgba(168,85,247,.16)`, `rgba(168,85,247,.8)`, s.eType === 'A' ? 'FVG M5' : 'OB M5');
    }
  }

  // ---------------- bảng điều khiển ----------------
  function stepsHTML(stage) {
    const i = STAGES.indexOf(stage);
    return '<div class="steps">' + STAGES.map((s, k) => `<span class="${k < i ? 'done' : k === i ? 'now' : ''}">${STAGE_VI[s]}</span>`).join('') + '</div>';
  }
  function progress(side) {
    const L = S.res[side].live, t1 = L.t1, t4 = L.t4, buy = side === 'buy', y = (b) => b ? '<span class="y">✔</span>' : '<span class="n">○</span>';
    if (!t1 || !t4) return '<p class="note">Chưa đủ dữ liệu.</p>';
    const z = L.zones[0];
    return stepsHTML(L.stage) + `<ul class="ck">
      <li>${y(!L.h4Bear)} H4 ${buy ? 'không giảm mạnh' : 'không tăng mạnh'} <em>${t4.dir === 1 ? 'BOS ' + (buy ? '↑' : '↓') : t4.dir === -1 ? 'BOS ' + (buy ? '↓' : '↑') : '—'} · EMA ${t4.emaUp === buy || !buy && !t4.emaUp ? '' : ''}${t4.emaUp ? (buy ? '24>89' : '24<89') : (buy ? '24<89' : '24>89')}</em></li>
      <li>${y(t1.emaUp)} H1 EMA 24 ${buy ? 'trên' : 'dưới'} EMA 89</li>
      <li>${y(t1.gap >= S.res.cfg.gapMin)} Khoảng cách EMA ≥ ${S.res.cfg.gapMin} ATR <em>${t1.gap.toFixed(2)}</em></li>
      <li>${y(t1.slope >= S.res.cfg.slopeMin)} Độ dốc EMA 89 ${buy ? '≥ +' : '≤ −'}${S.res.cfg.slopeMin} ATR <em>${(buy ? t1.slope : -t1.slope).toFixed(2)}</em></li>
      <li>${y(t1.dir === 1)} BOS H1 ${buy ? 'tăng' : 'giảm'} gần nhất <em>${t1.hhhl ? (buy ? 'HH/HL' : 'LH/LL') : ''}</em></li>
      <li>${y(!!z)} POI M15 (OB/FVG) còn hiệu lực <em>${z ? z.kind + ' ' + fx(z.bot) + '–' + fx(z.top) : 'không có'}</em></li>
      <li>${y(!!L.touched)} Giá đã chạm POI <em>${L.touched ? ft(S.res.ind.m5.c[L.touched.m].t) : ''}</em></li>
      <li>${y(!!L.sweep)} Quét ${buy ? 'SSL' : 'BSL'} rồi đóng ngược lại <em>${L.sweep ? fx(L.sweep.level) : ''}</em></li>
      <li>${y(L.stage === 'WAIT_RETEST' || L.stage === 'SIGNAL')} MSS M5 bằng nến displacement</li>
    </ul>`;
  }
  function nowCard() {
    const a = current(), r = S.res;
    if (!a) {
      const st = [r.buy.live.stage, r.sell.live.stage];
      return `<div class="sig"><div class="t">Chưa có tín hiệu <span class="chip">ĐỨNG NGOÀI</span></div>
        <p class="note" style="margin:8px 0 0">BUY đang ở bước <b>${STAGE_VI[st[0]]}</b>, SELL ở bước <b>${STAGE_VI[st[1]]}</b>. Hệ thống chỉ báo khi đủ: xu hướng H1 hợp lệ + POI M15 + sweep + MSS M5${r.cfg.mode === 'strict' ? ' + FVG' : ''} và điểm ≥ ${r.cfg.minScore}.</p></div>`;
    }
    const b = a.side === 'buy', R = Math.abs(a.entry - a.sl), rr = (p) => p == null ? '' : (Math.abs(p - a.entry) / R).toFixed(2) + 'R';
    const live = r[a.side].live.price, dist = live - a.entry;
    const sc = a.sc;
    return `<div class="sig ${a.side}">
      <div class="t">${b ? 'BUY' : 'SELL'} LIMIT <span class="chip ${a.side}">${a.state === 'SIGNAL' ? 'ĐÃ KHỚP · ĐANG CHẠY' : 'CHỜ GIÁ VỀ ENTRY'}</span></div>
      <div class="lv">
        <span>Entry (${a.eType === 'A' ? 'FVG 50%' : 'OB'})</span><b>${fx(a.entry)}</b><span>${a.state === 'SIGNAL' ? '' : 'cách ' + fx(Math.abs(dist))}</span>
        <span>Stop Loss</span><b class="loss">${fx(a.sl)}</b><span>−1R · ${fx(R)}</span>
        <span>TP1</span><b class="win">${fx(a.tp1)}</b><span>${rr(a.tp1)}</span>
        <span>TP2</span><b class="win">${fx(a.tp2)}</b><span>${rr(a.tp2)}</span>
        <span>TP3</span><b class="win">${fx(a.tp3)}</b><span>${rr(a.tp3)}</span>
      </div>
      <p class="note" style="margin:10px 0 4px">Điểm hợp lưu <b>${a.score}/100</b> · H4/H1 ${sc.htf} · EMA ${sc.ema} · POI ${sc.poi} · Sweep ${sc.sweep} · MSS ${sc.mss} · FVG ${sc.fvg} · Mục tiêu ${sc.target}</p>
      <p class="note" style="margin:0">Tạo lúc ${ft(a.ct)} · POI ${a.zone.kind} M15 ${fx(a.zone.bot)}–${fx(a.zone.top)} · Huỷ nếu không khớp sau ${Math.round(r.cfg.expiryBars * 5 / 60)}h, giá chạy tới TP1 trước, phá ${b ? 'đáy' : 'đỉnh'} sweep hoặc H1 đổi hướng.</p>
    </div>`;
  }
  function projCard() {
    const P = S.res.proj; if (!P) return '';
    const bn = P.bias > 0 ? '<span class="chip buy">THIÊN TĂNG</span>' : P.bias < 0 ? '<span class="chip sell">THIÊN GIẢM</span>' : '<span class="chip">ĐI NGANG</span>';
    const steps = P.path.slice(1).map((p, i) => `<li><span class="y">${i + 1}</span> ${p.act || ''} <b class="mono">${fx(p.p)}</b> <em>${p.name || ''} · ~${ft(p.t)}</em></li>`).join('');
    const alt = P.alt.length ? `<p class="note" style="margin:8px 0 0">Kịch bản phụ (đường xám): nếu giá đóng nến ${P.bias > 0 ? 'dưới' : 'trên'} <b>${fx(P.inval.p)}</b> (${P.inval.name}) → ${P.alt[2].act} <b>${fx(P.alt[2].p)}</b>${P.alt[2].name ? ' (' + P.alt[2].name + ')' : ''}.</p>` : '';
    return `<div style="display:flex;justify-content:space-between;align-items:center">${bn}<span class="note">điểm xu hướng ${P.sum > 0 ? '+' : ''}${P.sum}/6</span></div>
      <ul class="ck">${P.factors.map(x => `<li>${x.v > 0 ? '<span class="y">▲</span>' : x.v < 0 ? '<span style="color:var(--sell)">▼</span>' : '<span class="n">•</span>'} ${x.n}</li>`).join('')}</ul>
      <p class="note" style="margin:10px 0 2px"><b>Kịch bản chính</b> (đường nét đứt trên chart):</p><ul class="ck">${steps}</ul>${alt}
      <p class="note" style="margin:8px 0 0">Dự kiến dựa trên EMA 34/89 và các vùng OB/FVG, thanh khoản M15/H1/H4 gần nhất; thời gian chỉ là ước lượng theo ATR. Không phải tín hiệu vào lệnh.</p>`;
  }
  function statsHist() {
    const st = S.res.stats, all = S.res.all.slice().reverse();
    $('stats').innerHTML = `<div><b>${st.total}</b><small>Setup</small></div><div><b>${st.filled}</b><small>Đã khớp</small></div>
      <div><b class="win">${st.wins}</b><small>Chạm TP1</small></div><div><b class="loss">${st.losses}</b><small>Dính SL</small></div>
      <div><b>${(st.winRate * 100).toFixed(0)}%</b><small>Tỷ lệ thắng</small></div><div><b class="${st.netR >= 0 ? 'win' : 'loss'}">${st.netR >= 0 ? '+' : ''}${st.netR.toFixed(2)}R</b><small>Tổng R</small></div>
      <div><b>${isFinite(st.pf) ? st.pf.toFixed(2) : '∞'}</b><small>Profit factor</small></div><div><b>${st.maxDD.toFixed(1)}R</b><small>Sụt giảm tối đa</small></div>`;
    $('hist').innerHTML = all.length ? all.map(s => `<tr><td>${ft(s.ct)}</td><td><span class="chip ${s.side}">${s.side === 'buy' ? 'BUY' : 'SELL'} ${s.eType}</span></td><td>${s.score}</td>
      <td class="mono">${fx(s.entry)}</td><td class="mono">${fx(s.sl)}</td><td class="mono">${fx(s.tp1)}</td><td>${s.rr1.toFixed(2)}</td>
      <td class="${s.state === 'WIN' ? 'win' : s.state === 'LOSS' ? 'loss' : 'muted'}">${STATE_VI[s.state] || s.state}${s.why ? ' · ' + s.why : ''}${s.exit && s.exit.r != null ? ` (${s.exit.r > 0 ? '+' : ''}${s.exit.r.toFixed(2)}R)` : ''}</td></tr>`).join('')
      : '<tr><td colspan="8" class="muted">Chưa có setup nào đạt đủ điều kiện trong dữ liệu đã tải.</td></tr>';
  }

  // ---------------- cảnh báo ----------------
  function beep() { try { const A = new (window.AudioContext || window.webkitAudioContext)(), o = A.createOscillator(), g = A.createGain(); o.frequency.value = 880; o.connect(g); g.connect(A.destination); g.gain.setValueAtTime(.2, A.currentTime); g.gain.exponentialRampToValueAtTime(.001, A.currentTime + .6); o.start(); o.stop(A.currentTime + .6); } catch (_) {} }
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 7000); }
  function alertUser(title, body) {
    toast(title + ' — ' + body); beep();
    if (S.notif && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(title, { body, tag: title }); } catch (_) {} }
  }
  function checkAlerts(first) {
    const seen = S.seen[S.sym] || (S.seen[S.sym] = {});
    for (const s of S.res.all) {
      const prev = seen[s.id];
      if (prev === s.state) continue;
      seen[s.id] = s.state;
      if (first && !prev) continue; // không báo lại setup cũ khi mới mở trang
      const nm = `${SYMS[S.sym].name} ${s.side === 'buy' ? 'BUY' : 'SELL'}`;
      if (s.state === 'WAIT_RETEST') alertUser(`🆕 Setup ${nm}`, `Entry ${fx(s.entry)} · SL ${fx(s.sl)} · TP1 ${fx(s.tp1)} (${s.rr1.toFixed(1)}R) · ${s.score} điểm`);
      else if (s.state === 'SIGNAL') alertUser(`🎯 Giá chạm Entry ${nm}`, `Khớp ${fx(s.entry)} · SL ${fx(s.sl)} · TP1 ${fx(s.tp1)}`);
      else if (s.state === 'WIN') alertUser(`✅ ${nm} chạm TP1`, `+${s.rr1.toFixed(2)}R`);
      else if (s.state === 'LOSS') alertUser(`❌ ${nm} dính SL`, `−1R tại ${fx(s.sl)}`);
      else if (s.state === 'INVALID' && prev) alertUser(`⚪ ${nm} huỷ`, s.why || '');
    }
    LS.set('smc.seen', S.seen);
  }

  // ---------------- vòng lặp ----------------
  let busy = false, firstRun = {};
  async function refresh(full) {
    if (busy) return; busy = true;
    try {
      const sym = S.sym, d = await loadAll(sym, full);
      if (sym !== S.sym) return;
      const off = S.offset[sym] || 0;
      S.res = SMC.analyze(closedOnly(d, off), { ...S.cfg, minBuf: SYMS[sym].minBuf });
      const m5 = d.m5, last = m5[m5.length - 1], prevDay = m5[Math.max(0, m5.length - 289)];
      $('px').textContent = fx(last.c + off);
      const ch = (last.c - prevDay.c) / prevDay.c * 100; $('chg').textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '% 24h'; $('chg').className = 'chip ' + (ch >= 0 ? 'buy' : 'sell');
      $('src').textContent = S.srcName; $('upd').textContent = 'Cập nhật ' + new Date().toLocaleTimeString('vi-VN');
      $('offNote').textContent = off ? `Đã căn theo giá Exness: chênh ${off >= 0 ? '+' : ''}${fx(off)} so với nguồn dữ liệu.` : '';
      $('now').innerHTML = nowCard(); $('proj').innerHTML = projCard(); $('pBuy').innerHTML = progress('buy'); $('pSell').innerHTML = progress('sell');
      statsHist(); renderChart(full); checkAlerts(!firstRun[sym]); firstRun[sym] = true;
    } catch (e) {
      console.error(e); $('src').textContent = 'Lỗi tải dữ liệu'; $('now').innerHTML = `<p class="err">Không tải được dữ liệu (${e.message}). Thử tải lại trang.</p>`;
    } finally { busy = false; }
  }
  async function tick() { // giá trực tiếp + phân tích lại khi có nến M5 mới đóng
    const d = S.raw[S.sym]; if (!d) return;
    const last = d.m5[d.m5.length - 1];
    if (Date.now() >= last.ct + 2000) return refresh(false);
    try {
      const src = SYMS[S.sym].src[S.srcIdx[S.sym] || 0], a = await src.f('5m', 2);
      const m = new Map(d.m5.map(x => [x.t, x])); a.forEach(x => m.set(x.t, x)); d.m5 = [...m.values()].sort((p, q) => p.t - q.t);
      const off = S.offset[S.sym] || 0, l = d.m5[d.m5.length - 1]; $('px').textContent = fx(l.c + off);
      cs && cs.update && S.tf === 'm5' && cs.update({ time: tsec(l.t), open: l.o + off, high: l.h + off, low: l.l + off, close: l.c + off });
    } catch (_) {}
  }

  // ---------------- TradingView ----------------
  function renderTV() {
    $('tv').innerHTML = `<iframe title="TradingView" allowfullscreen src="https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(SYMS[S.sym].tv)}&interval=${{ m5: 5, m15: 15, h1: 60, h4: 240 }[S.tf]}&theme=dark&style=1&timezone=Asia%2FHo_Chi_Minh&withdateranges=1&allow_symbol_change=1&saveimage=1&studies=%5B%5D&locale=vi_VN"></iframe>`;
  }

  // ---------------- sự kiện ----------------
  function seg(id, attr, fn) { $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; [...$(id).children].forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset[attr]); }); }
  seg('symSeg', 's', (s) => { S.sym = s; LS.set('smc.sym', s); S.res = null; $('px').textContent = '—'; $('src').textContent = 'đang tải…'; $('cEx').value = ''; if (S.view === 'tv') renderTV(); refresh(true); });
  seg('tfSeg', 'tf', (tf) => { S.tf = tf; if (S.view === 'tv') renderTV(); else renderChart(true); });
  seg('viewSeg', 'v', (v) => { S.view = v; $('chartWrap').classList.toggle('hide', v !== 'chart'); $('tv').classList.toggle('hide', v !== 'tv'); if (v === 'tv') renderTV(); else setTimeout(() => renderChart(false), 50); });
  [...$('symSeg').children].forEach(b => b.classList.toggle('on', b.dataset.s === S.sym));
  $('cMode').value = S.cfg.mode; $('cEntry').value = S.cfg.entry; $('cRR').value = S.cfg.minRR; $('cScore').value = S.cfg.minScore;
  $('cApply').onclick = () => {
    S.cfg = { mode: $('cMode').value, entry: $('cEntry').value, minRR: +$('cRR').value || 1.5, minScore: +$('cScore').value || 85 }; LS.set('smc.cfg', S.cfg);
    const ex = parseFloat($('cEx').value), d = S.raw[S.sym];
    if (isFinite(ex) && d) { S.offset[S.sym] = +(ex - d.m5[d.m5.length - 1].c).toFixed(3); LS.set('smc.off', S.offset); }
    else if ($('cEx').value === '' ) { /* giữ nguyên */ }
    refresh(false); toast('Đã áp dụng cài đặt');
  };
  const nb = $('notifBtn');
  const setNB = () => { nb.textContent = S.notif ? '🔔 Thông báo: BẬT' : '🔕 Bật thông báo'; };
  nb.onclick = async () => {
    if (!S.notif && 'Notification' in window && Notification.permission !== 'granted') { try { await Notification.requestPermission(); } catch (_) {} }
    S.notif = !S.notif; LS.set('smc.notif', S.notif); setNB(); beep(); toast(S.notif ? 'Sẽ báo khi có setup mới / giá chạm Entry / TP / SL (khi trang đang mở)' : 'Đã tắt thông báo');
  };
  setNB();
  document.querySelectorAll('[data-show]').forEach(cb => { cb.checked = !!SHOW[cb.dataset.show]; cb.onchange = () => { SHOW[cb.dataset.show] = cb.checked; LS.set('smc.show', SHOW); renderChart(false); }; });

  initChart(); refresh(true);
  setInterval(tick, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(false); });
})();
