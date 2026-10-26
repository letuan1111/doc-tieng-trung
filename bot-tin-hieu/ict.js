/* ENGINE ICT / SMC — dùng chung cho web (bot-tin-hieu) và máy quét (scanner/scan.mjs).
   Mọi thứ tính tuần tự trên NẾN ĐÃ ĐÓNG, không nhìn trước:
   - Swing (pivot) chỉ dùng sau khi đủ L nến bên phải xác nhận.
   - BOS / CHoCH xác nhận bằng giá ĐÓNG CỬA vượt đỉnh/đáy swing.
   - Thanh khoản: đỉnh swing chưa bị lấy = BSL, đáy chưa bị lấy = SSL, hai đỉnh/đáy gần bằng nhau = EQH/EQL.
   - Quét thanh khoản (sweep): râu nến vượt BSL/SSL rồi đóng cửa quay lại.
   - Order Block: nến ngược chiều cuối cùng tại gốc nhịp tạo BOS/CHoCH. FVG: khoảng trống 3 nến.
   - Premium / Discount: chia đôi nhịp hiện tại (đáy được bảo vệ ↔ đỉnh nhịp).
   HƯỚNG LỆNH do EMA 34/89 quyết định: EMA34 > EMA89 và giá trên EMA89 → chỉ BUY; ngược lại → chỉ SELL.
   Mô hình vào lệnh (lệnh chờ LIMIT tại POI ở vùng discount/premium):
   1. "Quét + MSS": quét SSL → CHoCH/BOS tăng có displacement → BUY LIMIT tại 50% FVG (hoặc OB), SL dưới đáy quét.
   2. "BOS + hồi OB": xu hướng tăng tiếp diễn (BOS) → BUY LIMIT tại OB/FVG của nhịp phá vỡ nằm ở discount, SL dưới OB/đáy bảo vệ.
   TP: thanh khoản đối diện gần nhất (BSL cho BUY) đạt RR tối thiểu, nếu không có thì RR dự phòng. */
(function (root) {
  'use strict';

  // ---------------- chỉ báo ----------------
  const ema = (a, n) => { const k = 2 / (n + 1), o = new Array(a.length); let p = a[0]; for (let i = 0; i < a.length; i++) { p = i ? a[i] * k + p * (1 - k) : a[0]; o[i] = p; } return o; };
  function atr(c, n) {
    const o = new Array(c.length); let v = 0;
    for (let i = 0; i < c.length; i++) {
      const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l;
      v = i < n ? (v * i + tr) / (i + 1) : (v * (n - 1) + tr) / n; o[i] = v;
    }
    return o;
  }
  function pivots(c, L) {
    const H = [], Lo = [];
    for (let i = L; i < c.length - L; i++) {
      let ph = true, pl = true;
      for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; }
      if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lo.push({ i, p: c[i].l, conf: i + L });
    }
    return { H, L: Lo };
  }

  // ---------------- khung lớn (HTF) ----------------
  const HTF_OF = { 3e5: 36e5, 9e5: 36e5, 18e5: 144e5, 36e5: 144e5, 144e5: 864e5, 864e5: 6048e5 };
  const TF_TXT = { 3e5: 'M5', 9e5: 'M15', 18e5: 'M30', 36e5: 'H1', 144e5: 'H4', 864e5: 'D1', 6048e5: 'W1' };
  function stepOf(c) { const d = []; for (let i = 1; i < Math.min(c.length, 60); i++) d.push(c[i].t - c[i - 1].t); d.sort((a, b) => a - b); return d[d.length >> 1] || 9e5; }
  function resample(c, ms) {
    const out = [];
    for (const x of c) {
      const t = Math.floor(x.t / ms) * ms, b = out[out.length - 1];
      if (b && b.t === t) { b.h = Math.max(b.h, x.h); b.l = Math.min(b.l, x.l); b.c = x.c; b.ct = x.ct; }
      else out.push({ t, ct: x.ct, end: t + ms, o: x.o, h: x.h, l: x.l, c: x.c });
    }
    return out.filter(b => b.ct >= b.end);
  }
  // xu hướng EMA34/89 khung lớn tại từng nến (chỉ dùng nến khung lớn đã đóng)
  function htfBias(c, step) {
    const ms = HTF_OF[step] || step * 4, H = resample(c, ms), out = new Array(c.length).fill(0);
    if (H.length < 100) return { bias: out, txt: TF_TXT[ms] || 'khung lớn', ok: false };
    const cl = H.map(x => x.c), a = ema(cl, 34), b = ema(cl, 89);
    let j = -1;
    for (let i = 0; i < c.length; i++) {
      while (j + 1 < H.length && H[j + 1].end <= c[i].ct) j++;
      out[i] = j < 0 ? 0 : a[j] > b[j] && cl[j] > b[j] ? 1 : a[j] < b[j] && cl[j] < b[j] ? -1 : 0;
    }
    return { bias: out, txt: TF_TXT[ms] || 'khung lớn', ok: true, e34: a[a.length - 1], e89: b[b.length - 1] };
  }

  const GRADE_RANK = { 'A+': 3, A: 2, B: 1 };

  // ---------------- đồng thuận EMA 34/89 nhiều khung (mặc định M5 + M15 + H1) ----------------
  // sets: [{ name: 'M5', c: nến }, ...]. Với mỗi nến của khung đang xem, lấy nến ĐÃ ĐÓNG gần nhất của từng khung,
  // hướng khung = EMA34 > EMA89 và giá trên EMA89 (tăng) / ngược lại (giảm) / còn lại 0. Đồng thuận = tất cả cùng chiều.
  function emaBias(c) {
    const cl = c.map(x => x.c), a = ema(cl, 34), b = ema(cl, 89);
    return cl.map((x, i) => i < 89 ? 0 : a[i] > b[i] && x > b[i] ? 1 : a[i] < b[i] && x < b[i] ? -1 : 0);
  }
  function consensus(c, sets) {
    const step = stepOf(c), n = c.length, dir = new Array(n).fill(0), per = {}, now = {};
    const cols = sets.map(s => { const st = stepOf(s.c), cc = s.c.map(x => x.ct == null ? { ...x, ct: x.t + st } : x); return { name: s.name, c: cc, b: emaBias(cc) }; });
    for (const s of cols) { per[s.name] = new Array(n).fill(0); now[s.name] = s.b[s.b.length - 1] || 0; }
    const ptr = cols.map(() => -1);
    for (let i = 0; i < n; i++) {
      const T = c[i].ct != null ? c[i].ct : c[i].t + step; let v = null, ok = true;
      cols.forEach((s, k) => {
        while (ptr[k] + 1 < s.c.length && s.c[ptr[k] + 1].ct <= T) ptr[k]++;
        const b = ptr[k] >= 89 ? s.b[ptr[k]] : 0; per[s.name][i] = b;
        if (!b) ok = false; else if (v == null) v = b; else if (v !== b) ok = false;
      });
      dir[i] = ok && v ? v : 0;
    }
    return { dir, per, now, names: cols.map(s => s.name), from: cols.reduce((m, s) => Math.max(m, s.c.length > 89 ? s.c[89].ct : Infinity), 0) };
  }

  // ---------------- phân tích ----------------
  function analyze(c, cfg) {
    cfg = Object.assign({ swing: 3, minRR: 1.5, maxRR: 6, rr: 2, expiry: 20, maxBars: 48, cost: 0.0004, freshBars: 2, sweepWin: 20, dispATR: 1.0, slBuf: 0.15, htf: 'grade', minGrade: 'B' }, cfg);
    const n = c.length, step = stepOf(c);
    if (c.length && c[0].ct == null) c = c.map(x => ({ ...x, ct: x.t + step }));
    const cl = c.map(x => x.c), e34 = ema(cl, 34), e89 = ema(cl, 89), e200 = ema(cl, 200), A = atr(c, 14);
    const bias = cl.map((x, i) => i < 89 ? 0 : e34[i] > e89[i] && x > e89[i] ? 1 : e34[i] < e89[i] && x < e89[i] ? -1 : 0);
    const HT = htfBias(c, step), tfTxt = TF_TXT[step] || '';
    // hướng lệnh: đồng thuận nhiều khung (cfg.cons từ consensus()) hoặc EMA của khung đang xem
    const CONS = cfg.cons || null, dirArr = CONS ? CONS.dir : bias, dirTxt = CONS ? CONS.names.join('+') : tfTxt;
    const pv = pivots(c, cfg.swing);
    const fmt = (v) => { const a = Math.abs(v); return v.toFixed(a >= 1000 ? 2 : a >= 10 ? 2 : 4); };

    // ---- FVG (mọi khoảng trống ≥ 0.1 ATR), theo dõi lấp đầy ----
    const fvgs = [];
    for (let k = 2; k < n; k++) {
      const a = A[k];
      if (c[k].l > c[k - 2].h && c[k].l - c[k - 2].h >= 0.1 * a) fvgs.push({ side: 1, i: k - 1, k, top: c[k].l, bot: c[k - 2].h, end: null });
      if (c[k].h < c[k - 2].l && c[k - 2].l - c[k].h >= 0.1 * a) fvgs.push({ side: -1, i: k - 1, k, top: c[k - 2].l, bot: c[k].h, end: null });
    }
    for (const f of fvgs) for (let j = f.k + 1; j < n; j++) { if (f.side > 0 ? c[j].l <= f.bot : c[j].h >= f.top) { f.end = j; break; } }

    // ---- duyệt tuần tự: thanh khoản, quét, cấu trúc, OB, tín hiệu ----
    const liq = [], events = [], obs = [], sweeps = [], sigs = [], rej = {};
    const R = (why) => { rej[why] = (rej[why] || 0) + 1; };
    let ih = 0, il = 0, hi = null, lo = null, trend = 0;
    const lastSweep = { 1: null, '-1': null };
    let range = null; // nhịp hiện tại: { d, pl, plI, ext, extI, i }
    const structAt = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      const x = c[i], a = A[i];
      // swing mới được xác nhận → thêm vào thanh khoản
      while (ih < pv.H.length && pv.H[ih].conf <= i) { const p = pv.H[ih++]; hi = { ...p, broken: false }; liq.push({ side: 1, i: p.i, p: p.p, conf: p.conf, end: null, swept: false }); }
      while (il < pv.L.length && pv.L[il].conf <= i) { const p = pv.L[il++]; lo = { ...p, broken: false }; liq.push({ side: -1, i: p.i, p: p.p, conf: p.conf, end: null, swept: false }); }
      // thanh khoản bị lấy / bị quét
      for (const q of liq) {
        if (q.end != null || q.conf >= i) continue;
        if (q.side > 0 && x.h > q.p) { q.end = i; if (x.c < q.p) { q.swept = true; sweeps.push({ i, side: 1, p: q.p }); lastSweep[-1] = { i, lvl: q.p, ext: x.h }; } }
        if (q.side < 0 && x.l < q.p) { q.end = i; if (x.c > q.p) { q.swept = true; sweeps.push({ i, side: -1, p: q.p }); lastSweep[1] = { i, lvl: q.p, ext: x.l }; } }
      }
      if (lastSweep[1]) lastSweep[1].ext = Math.min(lastSweep[1].ext, x.l);
      if (lastSweep[-1]) lastSweep[-1].ext = Math.max(lastSweep[-1].ext, x.h);
      if (range) { if (range.d > 0 ? x.h > range.ext : x.l < range.ext) { range.ext = range.d > 0 ? x.h : x.l; range.extI = i; } }

      // phá cấu trúc bằng giá đóng cửa
      let brk = null;
      if (hi && !hi.broken && x.c > hi.p) { hi.broken = true; brk = { d: 1, piv: hi }; }
      else if (lo && !lo.broken && x.c < lo.p) { lo.broken = true; brk = { d: -1, piv: lo }; }
      // mất đáy/đỉnh được bảo vệ → đảo cấu trúc (CHoCH) dù chưa có swing mới
      else if (range && (range.d > 0 ? x.c < range.pl : x.c > range.pl) && trend === range.d) {
        const d = -range.d; events.push({ type: 'CHoCH', d, i, p: range.pl, from: range.plI }); trend = d;
        // nhịp mới: gốc = đỉnh/đáy của nhịp cũ, cực trị = giá xa nhất từ đó tới nay
        let ext = d > 0 ? -Infinity : Infinity, extI = i;
        for (let j = range.extI; j <= i; j++) if (d > 0 ? c[j].h > ext : c[j].l < ext) { ext = d > 0 ? c[j].h : c[j].l; extI = j; }
        range = { d, pl: range.ext, plI: range.extI, ext, extI, i };
      }
      if (brk) {
        const d = brk.d, type = trend === d ? 'BOS' : 'CHoCH';
        events.push({ type, d, i, p: brk.piv.p, from: brk.piv.i }); trend = d;
        // gốc nhịp = đáy thấp nhất (BUY) / đỉnh cao nhất (SELL) từ swing bị phá đến nến phá
        let pl = d > 0 ? Infinity : -Infinity, plI = brk.piv.i;
        for (let j = brk.piv.i; j <= i; j++) if (d > 0 ? c[j].l < pl : c[j].h > pl) { pl = d > 0 ? c[j].l : c[j].h; plI = j; }
        let ext = d > 0 ? -Infinity : Infinity, extI = i; for (let j = plI; j <= i; j++) if (d > 0 ? c[j].h > ext : c[j].l < ext) { ext = d > 0 ? c[j].h : c[j].l; extI = j; }
        range = { d, pl, plI, ext, extI, i };
        // Order Block: nến ngược chiều cuối cùng tại gốc nhịp (lùi tối đa 3 nến)
        let ob = null;
        for (let j = plI; j >= Math.max(0, plI - 3); j--) if (d > 0 ? c[j].c < c[j].o : c[j].c > c[j].o) { ob = j; break; }
        if (ob == null) ob = plI;
        const OB = { side: d, i: ob, top: c[ob].h, bot: c[ob].l, from: i, end: null, touched: null };
        // displacement + FVG trong nhịp
        let disp = false, fvg = null;
        for (let j = plI + 1; j <= i; j++) if (Math.abs(c[j].c - c[j].o) >= cfg.dispATR * A[j]) disp = true;
        for (const f of fvgs) if (f.side === d && f.k > plI && f.k <= i && (!fvg || f.top - f.bot > fvg.top - fvg.bot)) fvg = f;
        if (fvg) disp = true;
        OB.valid = disp; if (disp) obs.push(OB);
        // ---------- tạo tín hiệu ----------
        const sw = lastSweep[d];
        const swOk = sw && i - sw.i <= cfg.sweepWin && (d > 0 ? sw.ext <= pl + 0.25 * a : sw.ext >= pl - 0.25 * a);
        const model = swOk ? 'sweep' : type === 'BOS' ? 'bos' : null;
        if (!disp) R('nhịp phá vỡ không có displacement/FVG');
        else if (!model) R('CHoCH chưa quét thanh khoản');
        else if (dirArr[i] !== d) R(CONS ? `EMA34/89 ${dirTxt} chưa đồng thuận ${d > 0 ? 'BUY' : 'SELL'}` : `EMA34/89 không ủng hộ ${d > 0 ? 'BUY' : 'SELL'}`);
        else if (!CONS && cfg.htf === 'require' && HT.ok && HT.bias[i] !== d) R('EMA34/89 khung lớn ngược chiều');
        else {
          const eq = (ext + pl) / 2, rng = Math.abs(ext - pl), tol = 0.05 * rng;
          const inDisc = (p) => d > 0 ? p <= eq + tol : p >= eq - tol;
          const fvgCE = fvg ? (fvg.top + fvg.bot) / 2 : null, obEdge = d > 0 ? OB.top : OB.bot;
          let entry = null, poi = null;
          const cand = model === 'sweep' ? [['FVG', fvgCE], ['OB', obEdge]] : [['OB', obEdge], ['FVG', fvgCE]];
          for (const [k, p] of cand) if (p != null && inDisc(p) && (d > 0 ? p < x.c : p > x.c)) { entry = p; poi = k; break; }
          if (entry == null) R(d > 0 ? 'POI (OB/FVG) nằm ở premium' : 'POI (OB/FVG) nằm ở discount');
          else {
            const base = model === 'sweep' ? sw.ext : (d > 0 ? Math.min(OB.bot, pl) : Math.max(OB.top, pl));
            const sl = base - d * cfg.slBuf * a, risk = Math.abs(entry - sl);
            if (d > 0 ? sl >= entry : sl <= entry) R('SL sai phía');
            else if (risk < 0.25 * a) R('SL quá sát (<0.25 ATR)');
            else if (risk > 5 * a) R('SL quá xa (>5 ATR)');
            else {
              // TP: thanh khoản đối diện gần nhất còn nguyên (đỉnh nhịp + BSL/SSL chưa bị lấy)
              const tg = [{ p: ext, t: (d > 0 ? 'đỉnh nhịp ' : 'đáy nhịp ') + fmt(ext) }];
              for (const q of liq) if (q.side === d && q.end == null && q.conf <= i) tg.push({ p: q.p, t: (d > 0 ? 'BSL ' : 'SSL ') + fmt(q.p) });
              let tp = null, tpT = '';
              for (const g of tg) { const rr = (g.p - entry) * d / risk; if (rr >= cfg.minRR && rr <= cfg.maxRR && (tp == null || (g.p - entry) * d < (tp - entry) * d)) { tp = g.p; tpT = g.t; } }
              if (tp == null) { tp = entry + d * cfg.rr * risk; tpT = cfg.rr + 'R (chưa có thanh khoản phù hợp)'; }
              const htfOk = CONS ? true : !HT.ok || HT.bias[i] === d;
              const overlap = fvg && (d > 0 ? fvg.bot <= OB.top && fvg.top >= OB.bot : fvg.top >= OB.bot && fvg.bot <= OB.top);
              const grade = !htfOk ? 'B' : model === 'sweep' && overlap ? 'A+' : 'A';
              if (GRADE_RANK[grade] >= GRADE_RANK[cfg.minGrade]) {
                const pos = Math.abs(entry - pl) / (rng || 1);
                const note = (model === 'sweep' ? `Quét ${d > 0 ? 'SSL' : 'BSL'} ${fmt(sw.lvl)} → ${type} ${fmt(brk.piv.p)}` : `${type} ${fmt(brk.piv.p)} cùng xu hướng → hồi về ${poi}`) +
                  ` · Entry ${poi} ${poi === 'FVG' ? '50%' : d > 0 ? 'đỉnh' : 'đáy'} (${(pos * 100).toFixed(0)}% nhịp, ${d > 0 ? 'discount' : 'premium'})` +
                  (CONS ? ` · EMA34/89 ${dirTxt} đồng thuận ${d > 0 ? 'tăng' : 'giảm'}` : ` · EMA34/89 ${tfTxt} ${d > 0 ? 'tăng' : 'giảm'}${HT.ok ? `, ${HT.txt} ${htfOk ? 'cùng chiều' : 'ngược chiều'}` : ''}`) + ` · SL ${model === 'sweep' ? 'ngoài đáy quét' : 'ngoài OB'} · TP ${tpT}`;
                sigs.push({ i, side: d, entry, sl, tp, limit: true, expiry: cfg.expiry, model, poi, grade, type,
                  zone: poi === 'FVG' ? { top: fvg.top, bot: fvg.bot, i: fvg.i } : { top: OB.top, bot: OB.bot, i: OB.i },
                  sweep: model === 'sweep' ? { i: sw.i, p: sw.lvl } : null, mss: { i, p: brk.piv.p, from: brk.piv.i }, note });
              } else R('hạng B (khung lớn ngược chiều)');
            }
          }
        }
        if (model === 'sweep') lastSweep[d] = null;
      }
      structAt[i] = trend;
    }
    // OB: chạm / bị phá
    for (const o of obs) for (let j = o.from + 1; j < n; j++) {
      if (o.touched == null && (o.side > 0 ? c[j].l <= o.top : c[j].h >= o.bot)) o.touched = j;
      if (o.side > 0 ? c[j].c < o.bot : c[j].c > o.top) { o.end = j; break; }
    }
    // EQH / EQL: hai swing chưa bị lấy gần bằng nhau
    const open = liq.filter(q => q.end == null);
    for (const q of open) for (const r of open) if (r !== q && r.side === q.side && Math.abs(r.p - q.p) <= 0.1 * A[n - 1] && Math.abs(r.i - q.i) >= 3) { q.eq = true; }

    const bt = backtest(c, sigs, cfg), last = bt.trades[bt.trades.length - 1] || null;
    const live = bt.trades.filter(t => t.state === 'OPEN' || t.state === 'PENDING');
    const fresh = last && n - 1 - last.i <= cfg.freshBars ? last : null;
    const px = cl[n - 1];
    const ctx = {
      bias: bias[n - 1], htf: HT.ok ? HT.bias[n - 1] : 0, htfTxt: HT.txt, tfTxt, trend: structAt[n - 1],
      dir: dirArr[n - 1], dirTxt, cons: CONS ? CONS.now : null,
      lastEvent: events[events.length - 1] || null, range,
      zone: range ? ((px - range.pl) / (range.ext - range.pl || 1) > 0.5 ? (range.d > 0 ? 'premium' : 'discount') : (range.d > 0 ? 'discount' : 'premium')) : null,
      bsl: open.filter(q => q.side > 0 && q.p > px).sort((a, b) => a.p - b.p)[0] || null,
      ssl: open.filter(q => q.side < 0 && q.p < px).sort((a, b) => b.p - a.p)[0] || null,
    };
    return { P: { e34, e89, e200, atr: A, bias }, HT, events, obs, fvgs, liq, sweeps, sigs, rej, bt, live, fresh, last, ctx, cfg };
  }

  // ---------------- backtest ----------------
  function backtest(c, sigs, cfg) {
    const trades = []; let busyUntil = -1;
    for (const s of sigs) {
      if (s.i <= busyUntil) continue; // giữ 1 lệnh một lúc
      const risk = Math.abs(s.entry - s.sl); if (!(risk > 0)) continue;
      const tp = s.tp, rrT = Math.abs(tp - s.entry) / risk, t = { ...s, rr: rrT, risk, state: 'PENDING', fill: null, exit: null, r: null };
      let k = s.i + 1;
      for (; k < c.length && k <= s.i + s.expiry; k++) {
        const x = c[k];
        if (s.side > 0 ? x.h >= tp : x.l <= tp) { t.state = 'MISSED'; break; }
        if (s.side > 0 ? x.l <= s.entry : x.h >= s.entry) { t.fill = k; t.state = 'OPEN'; break; }
      }
      if (t.state === 'PENDING' && k > s.i + s.expiry) t.state = 'EXPIRED';
      if (t.state !== 'OPEN') { trades.push(t); busyUntil = t.state === 'PENDING' ? c.length : Math.min(k, c.length - 1); continue; }
      const costR = cfg.cost * s.entry / risk;
      for (let j = t.fill; j < c.length; j++) {
        const x = c[j];
        const hitSL = s.side > 0 ? x.l <= s.sl : x.h >= s.sl, hitTP = s.side > 0 ? x.h >= tp : x.l <= tp;
        if (hitSL) { t.state = 'LOSS'; t.exit = j; t.r = -1 - costR; break; }
        if (hitTP && j > t.fill) { t.state = 'WIN'; t.exit = j; t.r = rrT - costR; break; }
        if (j - t.fill >= cfg.maxBars) { t.state = 'TIME'; t.exit = j; t.r = s.side * (x.c - s.entry) / risk - costR; break; }
      }
      trades.push(t); busyUntil = t.exit != null ? t.exit : c.length;
    }
    const done = trades.filter(t => t.r != null), wins = done.filter(t => t.r > 0);
    let eq = 0, peak = 0, dd = 0; for (const t of done) { eq += t.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
    const gw = wins.reduce((s, t) => s + t.r, 0), gl = -done.filter(t => t.r <= 0).reduce((s, t) => s + t.r, 0);
    return { trades, n: done.length, wins: wins.length, winRate: done.length ? wins.length / done.length : 0, netR: eq, pf: gl ? gw / gl : (gw ? Infinity : 0), maxDD: dd, avgR: done.length ? eq / done.length : 0 };
  }

  root.ICT = { analyze, backtest, consensus, ema, atr, GRADE_RANK };
})(typeof window !== 'undefined' ? window : globalThis);
