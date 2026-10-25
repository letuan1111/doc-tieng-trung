/* BOT TÍN HIỆU — 7 chiến lược học từ các bot/indicator phổ biến nhất, chạy trên nến đã đóng.
   Mỗi chiến lược trả về danh sách tín hiệu { i, side, entry, sl, limit, expiry, note }.
   backtest() khớp lệnh trên các nến sau tín hiệu (không nhìn trước), SL và TP cùng nến → tính SL. */
(function (root) {
  'use strict';

  // ---------------- chỉ báo ----------------
  const ema = (a, n) => { const k = 2 / (n + 1), o = new Array(a.length); let p = a[0]; for (let i = 0; i < a.length; i++) { p = i ? a[i] * k + p * (1 - k) : a[0]; o[i] = p; } return o; };
  const rma = (a, n) => { const o = new Array(a.length); let p = 0; for (let i = 0; i < a.length; i++) { if (i < n) { p += a[i]; o[i] = i === n - 1 ? p / n : NaN; if (i === n - 1) p = o[i]; } else { p = (p * (n - 1) + a[i]) / n; o[i] = p; } } return o; };
  const sma = (a, n) => { const o = new Array(a.length); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; o[i] = i >= n - 1 ? s / n : NaN; } return o; };
  const stdev = (a, n) => { const m = sma(a, n), o = new Array(a.length); for (let i = 0; i < a.length; i++) { if (i < n - 1) { o[i] = NaN; continue; } let s = 0; for (let j = i - n + 1; j <= i; j++) s += (a[j] - m[i]) ** 2; o[i] = Math.sqrt(s / n); } return o; };
  const highest = (a, n, i) => { let m = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, a[j]); return m; };
  const lowest = (a, n, i) => { let m = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, a[j]); return m; };
  function atr(c, n) { const tr = c.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)) : x.h - x.l); return rma(tr, n); }
  function rsi(cl, n) {
    const up = cl.map((x, i) => i ? Math.max(0, x - cl[i - 1]) : 0), dn = cl.map((x, i) => i ? Math.max(0, cl[i - 1] - x) : 0);
    const u = rma(up, n), d = rma(dn, n); return u.map((x, i) => d[i] === 0 ? 100 : 100 - 100 / (1 + x / d[i]));
  }
  function linreg(a, n) { // giá trị hồi quy tuyến tính tại nến cuối cửa sổ (như ta.linreg(x, n, 0))
    const o = new Array(a.length).fill(NaN);
    for (let i = n - 1; i < a.length; i++) {
      let sx = 0, sy = 0, sxy = 0, sxx = 0, bad = false;
      for (let k = 0; k < n; k++) { const y = a[i - n + 1 + k]; if (!isFinite(y)) { bad = true; break; } sx += k; sy += y; sxy += k * y; sxx += k * k; }
      if (bad) continue; const sl = (n * sxy - sx * sy) / (n * sxx - sx * sx), ic = (sy - sl * sx) / n; o[i] = ic + sl * (n - 1);
    }
    return o;
  }
  function pivots(c, L) { // đỉnh/đáy swing xác nhận sau L nến
    const H = [], Lo = [];
    for (let i = L; i < c.length - L; i++) {
      let ph = true, pl = true;
      for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; }
      if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lo.push({ i, p: c[i].l, conf: i + L });
    }
    return { H, L: Lo };
  }
  function prep(c) {
    const cl = c.map(x => x.c);
    return { cl, e34: ema(cl, 34), e89: ema(cl, 89), e200: ema(cl, 200), atr14: atr(c, 14) };
  }
  const clampSL = (side, entry, sl, a, lo = 0.6, hi = 4) => { // giữ SL trong khoảng 0.6–4 ATR
    let d = side > 0 ? entry - sl : sl - entry; d = Math.min(hi * a, Math.max(lo * a, d)); return side > 0 ? entry - d : entry + d;
  };

  // ---------------- chiến lược ----------------
  const S = {};

  // 1. UT Bot Alerts (QuantNomad / Yo_adriiiiaan): ATR trailing stop, đảo chiều khi giá cắt qua stop
  S.utbot = {
    name: 'UT Bot Alerts', short: 'UT Bot', src: 'QuantNomad · TradingView', kind: 'Xu hướng',
    desc: 'Đường ATR trailing stop (key 2 × ATR 10). Giá đóng cửa cắt lên trên đường stop → BUY, cắt xuống → SELL. Lọc thêm: chỉ BUY khi giá trên EMA200, SELL khi dưới.',
    run(c, P) {
      const a = atr(c, 10), key = 2, cl = P.cl, st = new Array(c.length).fill(NaN), out = [];
      for (let i = 1; i < c.length; i++) {
        const nL = key * a[i], prev = isFinite(st[i - 1]) ? st[i - 1] : cl[i] - nL;
        if (!isFinite(nL)) continue;
        if (cl[i] > prev && cl[i - 1] > prev) st[i] = Math.max(prev, cl[i] - nL);
        else if (cl[i] < prev && cl[i - 1] < prev) st[i] = Math.min(prev, cl[i] + nL);
        else st[i] = cl[i] > prev ? cl[i] - nL : cl[i] + nL;
        if (i < 2 || !isFinite(st[i - 1])) continue;
        const buy = cl[i] > st[i] && cl[i - 1] <= st[i - 1], sell = cl[i] < st[i] && cl[i - 1] >= st[i - 1];
        if (buy && cl[i] > P.e200[i]) out.push({ i, side: 1, entry: cl[i], sl: clampSL(1, cl[i], st[i], P.atr14[i]), note: 'Giá cắt lên ATR stop ' + st[i].toFixed(2) });
        if (sell && cl[i] < P.e200[i]) out.push({ i, side: -1, entry: cl[i], sl: clampSL(-1, cl[i], st[i], P.atr14[i]), note: 'Giá cắt xuống ATR stop ' + st[i].toFixed(2) });
      }
      return out;
    },
  };

  // 2. SuperTrend (KivancOzbilgic) + EMA200: đổi màu theo hướng EMA200
  S.supertrend = {
    name: 'SuperTrend + EMA200', short: 'SuperTrend', src: 'KivancOzbilgic · TradingView', kind: 'Xu hướng',
    desc: 'SuperTrend (ATR 10 × 3). Đường chuyển sang xanh khi giá trên EMA200 → BUY; chuyển đỏ khi giá dưới EMA200 → SELL. SL đặt tại đường SuperTrend.',
    run(c, P) {
      const a = atr(c, 10), m = 3, out = []; let up = NaN, dn = NaN, dir = 1;
      for (let i = 1; i < c.length; i++) {
        if (!isFinite(a[i])) continue;
        const hl2 = (c[i].h + c[i].l) / 2, bu = hl2 - m * a[i], bd = hl2 + m * a[i];
        const pu = isFinite(up) ? up : bu, pd = isFinite(dn) ? dn : bd;
        up = c[i - 1].c > pu ? Math.max(bu, pu) : bu;
        dn = c[i - 1].c < pd ? Math.min(bd, pd) : bd;
        const pdir = dir;
        if (dir === -1 && c[i].c > pd) dir = 1; else if (dir === 1 && c[i].c < pu) dir = -1;
        if (dir !== pdir) {
          if (dir === 1 && c[i].c > P.e200[i]) out.push({ i, side: 1, entry: c[i].c, sl: clampSL(1, c[i].c, up, P.atr14[i]), note: 'SuperTrend chuyển xanh' });
          if (dir === -1 && c[i].c < P.e200[i]) out.push({ i, side: -1, entry: c[i].c, sl: clampSL(-1, c[i].c, dn, P.atr14[i]), note: 'SuperTrend chuyển đỏ' });
        }
      }
      return out;
    },
  };

  // 3. Squeeze Momentum (LazyBear): Bollinger nằm trong Keltner → nén; vào lệnh khi bung nén theo hướng momentum
  S.squeeze = {
    name: 'Squeeze Momentum', short: 'Squeeze', src: 'LazyBear · TradingView', kind: 'Phá vỡ',
    desc: 'Bollinger (20, 2) nằm trong Keltner (20, 1.5) = thị trường bị nén. Nến đầu tiên bung nén: momentum dương và tăng → BUY, âm và giảm → SELL. Lọc theo EMA34/89.',
    run(c, P) {
      const n = 20, cl = P.cl, b = sma(cl, n), sd = stdev(cl, n), tr = c.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)) : x.h - x.l), rng = sma(tr, n);
      const H = c.map(x => x.h), L = c.map(x => x.l);
      const val = cl.map((x, i) => i < n ? NaN : x - ((highest(H, n, i) + lowest(L, n, i)) / 2 + b[i]) / 2), mom = linreg(val, n), out = [];
      let wasOn = false;
      for (let i = n; i < c.length; i++) {
        const on = b[i] - 2 * sd[i] > b[i] - 1.5 * rng[i] && b[i] + 2 * sd[i] < b[i] + 1.5 * rng[i];
        if (!on && wasOn && isFinite(mom[i]) && isFinite(mom[i - 1])) {
          if (mom[i] > 0 && mom[i] > mom[i - 1] && P.e34[i] > P.e89[i]) out.push({ i, side: 1, entry: cl[i], sl: clampSL(1, cl[i], cl[i] - 1.5 * P.atr14[i], P.atr14[i]), note: 'Bung nén, momentum dương' });
          if (mom[i] < 0 && mom[i] < mom[i - 1] && P.e34[i] < P.e89[i]) out.push({ i, side: -1, entry: cl[i], sl: clampSL(-1, cl[i], cl[i] + 1.5 * P.atr14[i], P.atr14[i]), note: 'Bung nén, momentum âm' });
        }
        wasOn = on;
      }
      return out;
    },
  };

  // 4. WaveTrend (LazyBear, nền tảng của Market Cipher B): giao cắt ở vùng quá mua/quá bán
  S.wavetrend = {
    name: 'WaveTrend', short: 'WaveTrend', src: 'LazyBear · TradingView (Market Cipher B)', kind: 'Đảo chiều',
    desc: 'WaveTrend (10, 21). WT1 cắt lên WT2 dưới −53 (quá bán) → BUY; cắt xuống trên +53 (quá mua) → SELL. SL dưới/trên đáy/đỉnh 10 nến gần nhất.',
    run(c, P) {
      const ap = c.map(x => (x.h + x.l + x.c) / 3), esa = ema(ap, 10), d = ema(ap.map((x, i) => Math.abs(x - esa[i])), 10);
      const ci = ap.map((x, i) => d[i] ? (x - esa[i]) / (0.015 * d[i]) : 0), w1 = ema(ci, 21), w2 = sma(w1, 4), out = [];
      const H = c.map(x => x.h), L = c.map(x => x.l);
      for (let i = 30; i < c.length; i++) {
        const a = P.atr14[i];
        if (w1[i] > w2[i] && w1[i - 1] <= w2[i - 1] && w1[i] < -53) out.push({ i, side: 1, entry: c[i].c, sl: clampSL(1, c[i].c, lowest(L, 10, i) - 0.2 * a, a), note: 'WT cắt lên ở ' + w1[i].toFixed(0) });
        if (w1[i] < w2[i] && w1[i - 1] >= w2[i - 1] && w1[i] > 53) out.push({ i, side: -1, entry: c[i].c, sl: clampSL(-1, c[i].c, highest(H, 10, i) + 0.2 * a, a), note: 'WT cắt xuống ở ' + w1[i].toFixed(0) });
      }
      return out;
    },
  };

  // 5. SMC (theo LuxAlgo Smart Money Concepts): quét thanh khoản → CHoCH → lệnh chờ tại 50% FVG
  S.smc = {
    name: 'SMC: quét thanh khoản + CHoCH + FVG', short: 'SMC', src: 'LuxAlgo Smart Money Concepts · ICT', kind: 'Đảo chiều',
    desc: 'Giá quét đáy swing (SSL) rồi đóng lại phía trên, sau đó phá đỉnh swing gần nhất (CHoCH) bằng nến mạnh có FVG → BUY LIMIT ở 50% FVG, SL dưới đáy quét. Ngược lại cho SELL. Lệnh chờ hết hạn sau 20 nến.',
    run(c, P) {
      const pv = pivots(c, 3), out = [];
      const lastConf = (arr, i) => { let r = null; for (const p of arr) { if (p.conf <= i) r = p; else break; } return r; };
      let sweepL = null, sweepH = null;
      for (let i = 5; i < c.length; i++) {
        const a = P.atr14[i]; if (!isFinite(a)) continue;
        const sl = lastConf(pv.L, i - 1), sh = lastConf(pv.H, i - 1);
        if (sl && c[i].l < sl.p && c[i].c > sl.p && (!sweepL || sweepL.lvl !== sl.p)) sweepL = { i, lvl: sl.p, ext: c[i].l };
        if (sh && c[i].h > sh.p && c[i].c < sh.p && (!sweepH || sweepH.lvl !== sh.p)) sweepH = { i, lvl: sh.p, ext: c[i].h };
        if (sweepL && i - sweepL.i > 20) sweepL = null; if (sweepH && i - sweepH.i > 20) sweepH = null;
        if (sweepL) sweepL.ext = Math.min(sweepL.ext, c[i].l);
        if (sweepH) sweepH.ext = Math.max(sweepH.ext, c[i].h);
        const disp = Math.max(Math.abs(c[i].c - c[i].o), Math.abs(c[i - 1].c - c[i - 1].o)) > 0.8 * a;
        const fvgUp = () => { for (const k of [i, i - 1]) if (k >= 2 && c[k].l > c[k - 2].h) return [c[k - 2].h, c[k].l]; return null; };
        const fvgDn = () => { for (const k of [i, i - 1]) if (k >= 2 && c[k].h < c[k - 2].l) return [c[k].h, c[k - 2].l]; return null; };
        if (sweepL && sh && c[i].c > sh.p && c[i - 1].c <= sh.p) { // CHoCH tăng
          const z = disp && fvgUp();
          if (z) { const e = (z[0] + z[1]) / 2, s = sweepL.ext - 0.2 * a; if (e > s) out.push({ i, side: 1, entry: e, sl: s, limit: true, expiry: 20, zone: z, note: 'Quét SSL ' + sweepL.lvl.toFixed(2) + ' → CHoCH ' + sh.p.toFixed(2) + ' → FVG' }); }
          sweepL = null;
        }
        if (sweepH && sl && c[i].c < sl.p && c[i - 1].c >= sl.p) { // CHoCH giảm
          const z = disp && fvgDn();
          if (z) { const e = (z[0] + z[1]) / 2, s = sweepH.ext + 0.2 * a; if (e < s) out.push({ i, side: -1, entry: e, sl: s, limit: true, expiry: 20, zone: z, note: 'Quét BSL ' + sweepH.lvl.toFixed(2) + ' → CHoCH ' + sl.p.toFixed(2) + ' → FVG' }); }
          sweepH = null;
        }
      }
      return out;
    },
  };

  // 6. EMA 34/89 pullback (chiến lược của bạn): xu hướng EMA34/89, hồi chạm EMA34 rồi bật lại
  S.ema3489 = {
    name: 'EMA 34/89 Pullback', short: 'EMA 34/89', src: 'Chiến lược riêng (Letuan)', kind: 'Xu hướng',
    desc: 'EMA34 trên EMA89 và giá trên EMA89 = xu hướng tăng. Nến hồi chạm EMA34 rồi đóng tăng phía trên EMA34 → BUY. SL dưới EMA89 hoặc đáy 3 nến. Ngược lại cho SELL.',
    run(c, P) {
      const out = [], H = c.map(y => y.h), L = c.map(y => y.l);
      for (let i = 100; i < c.length; i++) {
        const a = P.atr14[i], e1 = P.e34[i], e2 = P.e89[i], x = c[i];
        const upT = e1 > e2 && x.c > e2 && e2 > P.e89[i - 5], dnT = e1 < e2 && x.c < e2 && e2 < P.e89[i - 5];
        const gap = Math.abs(e1 - e2) > 0.3 * a;
        if (upT && gap && x.l <= e1 && x.c > e1 && x.c > x.o && c[i - 1].c > P.e34[i - 1] - 0.5 * a) {
          const s = Math.min(lowest(L, 3, i), e2) - 0.2 * a; out.push({ i, side: 1, entry: x.c, sl: clampSL(1, x.c, s, a), note: 'Hồi chạm EMA34, đóng trên EMA34' });
        }
        if (dnT && gap && x.h >= e1 && x.c < e1 && x.c < x.o && c[i - 1].c < P.e34[i - 1] + 0.5 * a) {
          const s = Math.max(highest(H, 3, i), e2) + 0.2 * a; out.push({ i, side: -1, entry: x.c, sl: clampSL(-1, x.c, s, a), note: 'Hồi chạm EMA34, đóng dưới EMA34' });
        }
      }
      return out;
    },
  };

  // 7. Bollinger + RSI (ChartArt): bật khỏi biên Bollinger khi RSI quá mua/quá bán
  S.bbrsi = {
    name: 'Bollinger + RSI', short: 'BB + RSI', src: 'ChartArt · TradingView', kind: 'Đảo chiều',
    desc: 'Giá đóng cửa cắt lên lại biên dưới Bollinger (20, 2) khi RSI(14) vừa dưới 30 → BUY; cắt xuống lại biên trên khi RSI vừa trên 70 → SELL. SL 1.5 ATR.',
    run(c, P) {
      const cl = P.cl, b = sma(cl, 20), sd = stdev(cl, 20), r = rsi(cl, 14), out = [];
      for (let i = 21; i < c.length; i++) {
        const lo = b[i] - 2 * sd[i], lo1 = b[i - 1] - 2 * sd[i - 1], hi = b[i] + 2 * sd[i], hi1 = b[i - 1] + 2 * sd[i - 1], a = P.atr14[i];
        if (cl[i] > lo && cl[i - 1] <= lo1 && Math.min(r[i - 1], r[i - 2]) < 30) out.push({ i, side: 1, entry: cl[i], sl: clampSL(1, cl[i], Math.min(c[i].l, c[i - 1].l) - 0.3 * a, a, 1, 3), note: 'Bật khỏi biên dưới BB, RSI ' + r[i - 1].toFixed(0) });
        if (cl[i] < hi && cl[i - 1] >= hi1 && Math.max(r[i - 1], r[i - 2]) > 70) out.push({ i, side: -1, entry: cl[i], sl: clampSL(-1, cl[i], Math.max(c[i].h, c[i - 1].h) + 0.3 * a, a, 1, 3), note: 'Bật khỏi biên trên BB, RSI ' + r[i - 1].toFixed(0) });
      }
      return out;
    },
  };

  // ---------------- backtest ----------------
  // cfg: { rr, maxBars, cost (tỷ lệ giá, khứ hồi) }
  function backtest(c, sigs, cfg) {
    const trades = []; let busyUntil = -1;
    for (const s of sigs) {
      if (s.i <= busyUntil) continue; // mỗi chiến lược chỉ giữ 1 lệnh một lúc
      const risk = Math.abs(s.entry - s.sl); if (!(risk > 0)) continue;
      const tp = s.entry + s.side * cfg.rr * risk, t = { ...s, tp, risk, state: 'OPEN', fill: null, exit: null, r: null };
      let k = s.i + 1;
      if (s.limit) { // chờ giá về entry
        t.state = 'PENDING';
        for (; k < c.length && k <= s.i + s.expiry; k++) {
          const x = c[k];
          if (s.side > 0 ? x.h >= tp : x.l <= tp) { t.state = 'MISSED'; break; } // chạy tới TP trước khi khớp
          if (s.side > 0 ? x.l <= s.entry : x.h >= s.entry) { t.fill = k; t.state = 'OPEN'; break; }
        }
        if (t.state === 'PENDING' && k > s.i + s.expiry) t.state = 'EXPIRED';
        if (t.state !== 'OPEN') { trades.push(t); busyUntil = Math.min(k, c.length - 1); continue; }
      } else t.fill = s.i;
      const costR = cfg.cost * s.entry / risk;
      let j = t.fill === s.i ? s.i + 1 : t.fill;
      for (; j < c.length; j++) {
        const x = c[j];
        const hitSL = s.side > 0 ? x.l <= s.sl : x.h >= s.sl, hitTP = s.side > 0 ? x.h >= tp : x.l <= tp;
        if (hitSL) { t.state = 'LOSS'; t.exit = j; t.r = -1 - costR; break; }
        if (hitTP && !(j === t.fill && s.limit)) { t.state = 'WIN'; t.exit = j; t.r = cfg.rr - costR; break; }
        if (j - t.fill >= cfg.maxBars) { t.state = 'TIME'; t.exit = j; t.r = s.side * (x.c - s.entry) / risk - costR; break; }
      }
      trades.push(t); busyUntil = t.exit != null ? t.exit : c.length;
    }
    const done = trades.filter(t => t.r != null), wins = done.filter(t => t.r > 0);
    let eq = 0, peak = 0, dd = 0; for (const t of done) { eq += t.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
    const gw = wins.reduce((s, t) => s + t.r, 0), gl = -done.filter(t => t.r <= 0).reduce((s, t) => s + t.r, 0);
    return { trades, n: done.length, wins: wins.length, winRate: done.length ? wins.length / done.length : 0, netR: eq, pf: gl ? gw / gl : (gw ? Infinity : 0), maxDD: dd, avgR: done.length ? eq / done.length : 0 };
  }

  // chạy tất cả chiến lược trên một bộ nến
  function analyze(c, cfg) {
    const P = prep(c), res = {};
    for (const k in S) {
      let sigs = [];
      try { sigs = S[k].run(c, P); } catch (e) { console.warn(k, e); }
      const bt = backtest(c, sigs, cfg), last = bt.trades[bt.trades.length - 1] || null, n = c.length;
      const live = last && (last.state === 'OPEN' || last.state === 'PENDING') ? last : null;
      const fresh = last && n - 1 - last.i <= cfg.freshBars ? last : null;
      res[k] = { ...bt, live, fresh, last };
    }
    // đồng thuận: các chiến lược có tín hiệu mới cùng chiều, chỉ tính chiến lược có kỳ vọng dương trên dữ liệu này
    const votes = { 1: [], '-1': [] };
    for (const k in res) { const f = res[k].fresh; if (f && (f.state === 'OPEN' || f.state === 'PENDING') && res[k].n >= 5 && res[k].avgR > 0) votes[f.side].push(k); }
    const side = votes[1].length > votes[-1].length ? 1 : votes[-1].length > votes[1].length ? -1 : 0;
    return { P, res, consensus: { side, buy: votes[1], sell: votes[-1], n: Math.max(votes[1].length, votes[-1].length) } };
  }

  root.BOT = { S, analyze, backtest, ema, atr };
})(typeof window !== 'undefined' ? window : globalThis);
