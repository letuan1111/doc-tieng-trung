/* =====================================================================
   SMC ENGINE — Chiến lược EMA 34/89 + ICT + SMC  (H4 → H1 → M15 → M5)
   Mọi điều kiện tính trên NẾN ĐÃ ĐÓNG, không repaint:
   - Swing (pivot L/R) chỉ được dùng sau khi đủ R nến bên phải.
   - BOS/MSS xác nhận bằng giá đóng cửa.
   - Bối cảnh của một setup chỉ dùng dữ liệu đã đóng trước thời điểm setup.
   Lệnh SELL = chạy cùng logic BUY trên dữ liệu "lật giá" (giá → −giá).
   ===================================================================== */
(function (G) {
  'use strict';

  const DEF = {
    emaFast: 34, emaSlow: 89, emaMid: 34, atrLen: 14,
    pivotL: 3, pivotR: 3,             // pivot M5 3/3
    pivotHTF: 3,                      // pivot cho M15/H1/H4
    gapMin: 0.20, slopeMin: 0.10, slopeBack: 5,
    dispBody: 0.60, dispATR: 1.2,     // nến displacement M5
    sweepLookback: 12,                // MSS phải xảy ra trong 12 nến M5 sau sweep
    poiLookback: 36,                  // POI M15 phải được chạm trong 36 nến M5 (3h) trước MSS
    poiMaxAge: 120,                   // POI M15 tối đa 120 nến (30h)
    minRR: 1.5,                       // RR tối thiểu tới TP1
    minScore: 85,
    mode: 'strict',                   // 'strict' | 'balanced'
    entry: 'A',                       // 'A' FVG 50% | 'B' OB
    expiryBars: 36,                   // chờ retest tối đa 36 nến M5
    bufATR: 1.0, minBuf: 0.8,         // buffer SL dưới đáy sweep (1 ATR M5 — tránh bị quét lần 2)
    spread: 0,                        // spread sàn (giá) cộng vào SL
    ict: true,                        // bắt buộc đủ chuỗi ICT/SMC (không chỉ chấm điểm)
    emaM15: true,                     // EMA34/89 M15 phải cùng hướng H1
    minSlATR: 1.5,                    // SL tối thiểu 1.5 ATR M5 (SL quá sát = RR ảo)
    partialR: 1.0, partialPct: 0.5,   // chốt 50% ở +1R rồi dời SL về hoà vốn (0 = tắt)
    pdTF: 'm15',                      // khung đo premium/discount (dealing range): 'm15' | 'h1'
    ictReq: ['htf', 'extSweep', 'trueMss'], // điều kiện ICT bắt buộc; discount / killzone dùng để xếp hạng
    killzone: false,                  // true = chỉ vào lệnh trong killzone London/NY
    extLookback: 48,                  // đáy bị quét phải là đáy thấp nhất 48 nến M5 (4h) → thanh khoản ngoài
    tier: 'A',                        // 'A+' | 'A' | 'all' — chỉ giữ setup đạt hạng này trở lên
    conflictBars: 12,                 // có setup ngược chiều trong 12 nến M5 (1h) → thị trường giằng co, hạ xuống B
  };
  const TIER_OK = { 'A+': ['A+'], 'A': ['A+', 'A'], 'all': ['A+', 'A', 'B'] };

  // ---------------- tiện ích ----------------
  function ema(a, n) { const k = 2 / (n + 1), o = new Array(a.length); let e = a[0]; for (let i = 0; i < a.length; i++) { e = i ? a[i] * k + e * (1 - k) : a[i]; o[i] = e; } return o; }
  function atr(c, n) {
    const o = new Array(c.length); let v = 0;
    for (let i = 0; i < c.length; i++) {
      const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l;
      v = i < n ? (v * i + tr) / (i + 1) : (v * (n - 1) + tr) / n; o[i] = v;
    }
    return o;
  }
  function idxAt(tf, T) { // nến cuối cùng đã ĐÓNG tại thời điểm T
    const a = tf.c; let lo = 0, hi = a.length - 1, r = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m].ct <= T) { r = m; lo = m + 1; } else hi = m - 1; }
    return r;
  }
  const mirror = (cs) => cs.map(x => ({ t: x.t, ct: x.ct, o: -x.o, h: -x.l, l: -x.h, c: -x.c, v: x.v }));

  // ---------------- chuẩn bị 1 khung thời gian ----------------
  function prepTF(c, cfg, L, R) {
    const n = c.length, close = c.map(x => x.c);
    const tf = { c, n, e1: ema(close, cfg.emaFast), e2: ema(close, cfg.emaSlow), e3: ema(close, cfg.emaMid), atr: atr(c, cfg.atrLen), pivH: [], pivL: [], events: [], st: new Array(n) };
    for (let i = L; i < n - R; i++) {
      let isH = true, isL = true;
      for (let k = i - L; k <= i + R; k++) {
        if (k === i) continue;
        if (k < i ? c[k].h >= c[i].h : c[k].h > c[i].h) isH = false;
        if (k < i ? c[k].l <= c[i].l : c[k].l < c[i].l) isL = false;
      }
      if (isH) tf.pivH.push({ i, p: c[i].h, conf: i + R });
      if (isL) tf.pivL.push({ i, p: c[i].l, conf: i + R });
    }
    // duyệt tuần tự: swing đã xác nhận, BOS/CHoCH bằng giá đóng cửa
    let ph = 0, pl = 0, sh = [], sl = [], actH = null, actL = null, dir = 0, lastBos = -1;
    let sdir = 0, sL = null, sLi = 0, sH = null, sHi = 0; const sBrkH = new Set(), sBrkL = new Set();
    for (let k = 0; k < n; k++) {
      while (ph < tf.pivH.length && tf.pivH[ph].conf <= k) { const p = tf.pivH[ph++]; sh.push(p); actH = { ...p, broken: false }; }
      while (pl < tf.pivL.length && tf.pivL[pl].conf <= k) { const p = tf.pivL[pl++]; sl.push(p); actL = { ...p, broken: false }; }
      if (actH && !actH.broken && c[k].c > actH.p) {
        actH.broken = true; tf.events.push({ k, dir: 1, p: actH.p, piv: actH.i, type: dir === -1 ? 'CHoCH' : 'BOS' }); dir = 1; lastBos = k;
      }
      if (actL && !actL.broken && c[k].c < actL.p) {
        actL.broken = true; tf.events.push({ k, dir: -1, p: actL.p, piv: actL.i, type: dir === 1 ? 'CHoCH' : 'BOS' }); dir = -1; lastBos = k;
      }
      // ---- cấu trúc SWING (external): xu hướng chỉ đổi khi phá strong low/high — đáy/đỉnh đã tạo ra BOS ----
      if (sh.length && !sBrkH.has(sh[sh.length - 1].i) && c[k].c > sh[sh.length - 1].p && sdir !== -1) {
        const p = sh[sh.length - 1]; sBrkH.add(p.i);
        let lo = Infinity, li = p.i; for (let u = p.i; u <= k; u++) if (c[u].l < lo) { lo = c[u].l; li = u; }
        sdir = 1; sL = lo; sLi = li; sH = null;
      }
      if (sl.length && !sBrkL.has(sl[sl.length - 1].i) && c[k].c < sl[sl.length - 1].p && sdir !== 1) {
        const p = sl[sl.length - 1]; sBrkL.add(p.i);
        let hi = -Infinity, hiI = p.i; for (let u = p.i; u <= k; u++) if (c[u].h > hi) { hi = c[u].h; hiI = u; }
        sdir = -1; sH = hi; sHi = hiI; sL = null;
      }
      if (sdir === 1 && c[k].c < sL) { // phá strong low → CHoCH swing giảm
        let hi = -Infinity, hiI = sLi; for (let u = sLi; u <= k; u++) if (c[u].h > hi) { hi = c[u].h; hiI = u; }
        sdir = -1; sH = hi; sHi = hiI; sL = null; for (const p of sl) sBrkL.add(p.i);
      } else if (sdir === -1 && c[k].c > sH) { // phá strong high → CHoCH swing tăng
        let lo = Infinity, li = sHi; for (let u = sHi; u <= k; u++) if (c[u].l < lo) { lo = c[u].l; li = u; }
        sdir = 1; sL = lo; sLi = li; sH = null; for (const p of sh) sBrkH.add(p.i);
      }
      tf.st[k] = { dir, lastBos, nH: sh.length, nL: sl.length, sdir, sL, sLi, sH, sHi };
    }
    tf.sh = sh; tf.sl = sl;
    return tf;
  }

  // trạng thái xu hướng của một khung tại thời điểm T
  function trendAt(tf, T, cfg) {
    const k = idxAt(tf, T); if (k < cfg.slopeBack + 1) return null;
    const a = tf.atr[k] || 1e-9, s = tf.st[k];
    const H = tf.sh.slice(0, s.nH), Lw = tf.sl.slice(0, s.nL);
    const hh = H.length >= 2 && H[H.length - 1].p > H[H.length - 2].p;
    const hl = Lw.length >= 2 && Lw[Lw.length - 1].p > Lw[Lw.length - 2].p;
    // ICT/SMC: xu hướng theo cấu trúc swing (strong low/high), không theo từng nhịp hồi nội bộ
    return {
      k, dir: cfg.ict ? s.sdir : s.dir, idir: s.dir, emaUp: tf.e1[k] > tf.e2[k], gap: Math.abs(tf.e1[k] - tf.e2[k]) / a,
      slope: (tf.e2[k] - tf.e2[k - cfg.slopeBack]) / a, hhhl: cfg.ict ? s.sdir === 1 : hh && hl, lhll: !hh && !hl && H.length >= 2 && Lw.length >= 2,
      above89: tf.c[k].c > tf.e2[k], e1: tf.e1[k], e2: tf.e2[k], atr: a, close: tf.c[k].c,
    };
  }

  // ---------------- POI M15: FVG + OB ----------------
  function buildPOI(tf) {
    const c = tf.c, z = [];
    for (let i = 2; i < tf.n; i++) {
      if (c[i].l > c[i - 2].h && c[i].l - c[i - 2].h >= 0.05 * tf.atr[i])
        z.push({ kind: 'FVG', bot: c[i - 2].h, top: c[i].l, ci: i, t0: c[i - 2].t });
    }
    for (const e of tf.events) if (e.dir === 1) {
      for (let j = e.k - 1; j >= Math.max(0, e.k - 15); j--) {
        if (c[j].c < c[j].o) {
          let disp = false;
          for (let q = j + 1; q <= e.k; q++) { const r = c[q].h - c[q].l; if (r >= 1.0 * tf.atr[q] && Math.abs(c[q].c - c[q].o) >= 0.5 * r && c[q].c > c[q].o) disp = true; }
          z.push({ kind: 'OB', bot: c[j].l, top: c[j].h, ci: e.k, t0: c[j].t, disp });
          break;
        }
      }
    }
    // thời điểm bị phá (đóng cửa xuyên qua đáy vùng)
    for (const q of z) { q.dead = Infinity; for (let i = q.ci + 1; i < tf.n; i++) if (c[i].c < q.bot) { q.dead = i; break; } }
    return z;
  }

  // ---------------- lõi tìm setup BUY (SELL dùng dữ liệu lật) ----------------
  function scanBuy(D, cfg) {
    const { m5, m15, h1, h4 } = D, c = m5.c, out = [];
    const poi = buildPOI(m15);
    let lastSetupBar = -99;
    // con trỏ swing M5 đã xác nhận
    for (let j = 20; j < m5.n; j++) {
      const x = c[j], rng = x.h - x.l, body = x.c - x.o;
      if (body <= 0 || rng <= 0) continue;
      const a5 = m5.atr[j - 1];
      const isDispAt = (u) => { const y = c[u], r = y.h - y.l, b = y.c - y.o; return b > 0 && b >= cfg.dispBody * r && r >= cfg.dispATR * m5.atr[u - 1]; };
      // ICT: displacement là cả con sóng từ cú quét lên phá đỉnh (kiểm tra sau khi tìm sweep); chế độ cũ: nến phá phải là displacement
      if (!cfg.ict && !isDispAt(j)) continue;
      // swing high M5 đã xác nhận gần nhất trước j
      const nH = m5.st[j - 1].nH; if (!nH) continue;
      let SH = m5.sh[nH - 1];
      if (j - lastSetupBar < 6) continue;
      // tìm sweep SSL trong 12 nến trước
      let sweep = null;
      for (let s = j; s >= Math.max(1, j - cfg.sweepLookback); s--) {
        const nL = m5.st[s - 1].nL;
        for (let q = nL - 1; q >= Math.max(0, nL - 6); q--) {
          const L = m5.sl[q];
          if (c[s].l < L.p && c[s].c > L.p) {
            let ok = true; for (let u = L.conf; u < s; u++) if (c[u].c < L.p) { ok = false; break; }
            if (ok && (!sweep || c[s].l < sweep.low)) sweep = { s, low: c[s].l, level: L.p, piv: L.i };
          }
        }
      }
      // MSS đúng ICT: phá đỉnh đứng TRƯỚC cú quét (đỉnh gốc của sóng hồi), không phải đỉnh nhỏ sinh ra sau cú quét
      if (cfg.ict && sweep) {
        let q = nH - 1; while (q >= 0 && m5.sh[q].i >= sweep.s) q--;
        if (q < 0) continue;
        SH = m5.sh[q];
        let first = true; for (let u = sweep.s; u < j; u++) if (c[u].c > SH.p) { first = false; break; }
        if (!first) continue;
        let disp = false; for (let u = sweep.s; u <= j; u++) if (isDispAt(u)) { disp = true; break; }
        if (!disp) continue;
      } else if (cfg.ict && !isDispAt(j)) continue;
      if (!(x.c > SH.p && c[j - 1].c <= SH.p)) continue; // MSS: lần đóng cửa đầu tiên phá swing high
      // POI M15 được chạm trước MSS
      const T = x.ct;
      let touch = null;
      const from = Math.max(0, (sweep ? sweep.s : j) - cfg.poiLookback);
      for (let m = from; m <= j && !touch; m++) {
        const k15 = idxAt(m15, c[m].t); // M15 đã đóng trước nến M5 này
        if (k15 < 0) continue;
        for (let zi = poi.length - 1; zi >= 0; zi--) {
          const q = poi[zi];
          if (q.ci > k15 || k15 - q.ci > cfg.poiMaxAge || q.dead <= k15) continue;
          if (c[m].l <= q.top && c[m].c >= q.bot - 0.25 * m15.atr[k15]) { touch = { m, zone: q, k15 }; break; }
        }
      }
      // bối cảnh H4/H1 tại thời điểm MSS
      const t1 = trendAt(h1, T, cfg), t4 = trendAt(h4, T, cfg);
      if (!t1 || !t4) continue;
      const h1Valid = t1.emaUp && t1.dir === 1 && t1.gap >= cfg.gapMin && t1.slope >= cfg.slopeMin;
      const h4Bear = t4.dir === -1 && !t4.emaUp;
      // FVG M5 trong cụm displacement (nến j hoặc j+1)
      let fvg = null, conf = j;
      for (const k of [j, j + 1]) {
        if (k >= m5.n) break;
        if (c[k].l > c[k - 2].h) { fvg = { bot: c[k - 2].h, top: c[k].l, k }; conf = Math.max(j, k); break; }
      }
      // ICT: FVG có thể nằm bất kỳ đâu trong sóng displacement (sau cú quét) — lấy FVG gần nhất còn nguyên
      if (cfg.ict && !fvg && sweep) {
        for (let k = j - 1; k >= sweep.s + 2; k--) {
          if (c[k].l > c[k - 2].h) {
            let filled = false; for (let u = k + 1; u <= j; u++) if (c[u].l <= c[k - 2].h) { filled = true; break; }
            if (!filled) { fvg = { bot: c[k - 2].h, top: c[k].l, k }; break; }
          }
        }
      }
      // OB M5: nến giảm cuối cùng trước displacement
      let ob = null;
      for (let k = j - 1; k >= Math.max(0, (sweep ? sweep.s : j) - 3); k--) if (c[k].c < c[k].o) { ob = { bot: c[k].l, top: c[k].o, k }; break; }

      const core = { h1: h1Valid && !h4Bear, poi: !!touch, mss: true };
      const reasons = [];
      if (!h1Valid) reasons.push('H1 chưa đủ điều kiện tăng');
      if (h4Bear) reasons.push('H4 giảm mạnh – xung đột');
      if (!touch) reasons.push('Chưa chạm POI M15');
      if (!sweep) reasons.push('Không có quét thanh khoản');
      if (!fvg && cfg.mode === 'strict') reasons.push('Không có FVG M5');
      // điểm hợp lưu
      const sc = {
        htf: t4.dir === 1 && t4.emaUp && t1.hhhl ? 20 : (!h4Bear && t1.dir === 1 ? 10 : 0),
        ema: h1Valid ? 15 : (t1.emaUp ? 7 : 0),
        poi: touch ? 15 : 0, sweep: sweep ? 15 : 0, mss: 20, fvg: fvg ? 10 : 0, target: 0,
      };
      // entry / SL
      let entry = null, eType = cfg.entry;
      if (cfg.entry === 'A' && fvg) entry = (fvg.bot + fvg.top) / 2;
      else if (ob) { entry = ob.top; eType = 'B'; }
      else if (fvg) { entry = (fvg.bot + fvg.top) / 2; eType = 'A'; }
      const lowRef = sweep ? Math.min(...c.slice(sweep.s, j + 1).map(v => v.l)) : Math.min(...c.slice(Math.max(0, j - cfg.sweepLookback), j + 1).map(v => v.l));
      const buf = Math.max(cfg.bufATR * a5, cfg.minBuf) + (cfg.spread || 0);
      let sl = lowRef - buf;
      if (entry != null && entry - sl < cfg.minSlATR * a5) sl = entry - cfg.minSlATR * a5;
      // mục tiêu thanh khoản (đỉnh chưa bị lấy)
      const Tc = c[conf].ct;
      const tgt = (tf, above) => {
        const k = idxAt(tf, Tc); if (k < 0) return null;
        const hs = tf.sh.slice(0, tf.st[k].nH);
        let best = null;
        for (let q = hs.length - 1; q >= 0 && q >= hs.length - 40; q--) {
          const p = hs[q]; if (p.p <= above) continue;
          let taken = false; for (let u = p.i + 1; u <= k; u++) if (tf.c[u].h > p.p) { taken = true; break; }
          if (taken) continue;
          if (!best || p.p < best.p) best = p;
        }
        return best ? best.p : null;
      };
      let tp1 = null, tp2 = null, tp3 = null, rr1 = 0;
      if (entry != null && entry > sl) {
        const R = entry - sl;
        tp1 = tgt(m15, entry + 1.0 * R); // bỏ các đỉnh quá gần (< 1R)
        tp2 = tgt(h1, (tp1 || entry + R));
        tp3 = tgt(h4, (tp2 || tp1 || entry + R));
        if (!tp1) { tp1 = tp2; tp2 = tp3; tp3 = null; }
        rr1 = tp1 ? (tp1 - entry) / R : 0;
        if (rr1 >= 2) sc.target = 5;
      }
      const score = sc.htf + sc.ema + sc.poi + sc.sweep + sc.mss + sc.fvg + sc.target;
      if (entry == null) reasons.push('Không xác định được entry');
      if (!tp1) reasons.push('Không có mục tiêu thanh khoản');
      else if (rr1 < cfg.minRR) reasons.push(`Mục tiêu quá gần (RR ${rr1.toFixed(2)})`);

      // ---- chấm chất lượng cấu trúc ICT/SMC ----
      // dealing range = sóng đẩy hiện tại trên khung pdTF: đáy gốc của BOS tăng gần nhất → đỉnh cao nhất tới giờ
      const pd = cfg.pdTF === 'h1' ? h1 : m15, kp = idxAt(pd, T);
      let rgHi = null, rgLo = null;
      if (kp >= 0 && pd.st[kp].sdir === 1) { rgLo = pd.st[kp].sL; rgHi = Math.max(...pd.c.slice(pd.st[kp].sLi, kp + 1).map(v => v.h)); }
      // quét thanh khoản ngoài của sóng hồi: mức bị quét là đáy thấp nhất kể từ đỉnh gốc (SH) tới lúc quét
      const lowBefore = sweep ? Math.min(...c.slice(Math.min(SH.i, sweep.s - 1), sweep.s).map(v => v.l)) : -Infinity;
      const hr = new Date(Tc).getUTCHours();
      const t15 = trendAt(m15, T, cfg);
      // con sóng MSS: từ đáy sweep tới đỉnh cao nhất của displacement → entry phải nằm ở nửa dưới (discount của sóng M5)
      const legHi = Math.max(...c.slice(j, conf + 1).map(v => v.h));
      const q = {
        htf: t4.dir === 1 && t4.emaUp && t1.hhhl,                                   // H4 + H1 cùng hướng, H1 HH/HL
        ema15: !!t15 && t15.emaUp,                                                  // EMA34 > EMA89 trên M15 (đồng thuận H1)
        extSweep: !!sweep && lowBefore >= sweep.level - 0.05 * a5,                  // quét đáy ngoài (không có đáy thấp hơn 4h trước)
        trueMss: !!sweep && SH.i < sweep.s,                                         // phá đỉnh tạo ra con sóng xuống quét thanh khoản
        discount: entry != null && rgHi != null && rgHi > rgLo && entry > rgLo && entry <= (rgHi + rgLo) / 2, // entry ở discount của dealing range (pdTF)
        ote: entry != null && legHi > lowRef && entry <= lowRef + 0.5 * (legHi - lowRef),                   // entry ở discount của sóng MSS
        poi: !!touch && (touch.zone.kind === 'FVG' || !!touch.zone.disp),           // POI M15 có displacement
        fvg: !!fvg && fvg.top - fvg.bot >= 0.25 * a5,                               // FVG M5 đủ lớn
        rr2: rr1 >= 2,
        kz: (hr >= 6 && hr < 10) || (hr >= 12 && hr < 16),                          // London / New York killzone (UTC)
      };
      const Q_REASON = { htf: 'H4/H1 chưa cùng xu hướng tăng (HH/HL)', ema15: 'EMA34/89 M15 chưa tăng', extSweep: 'Không quét thanh khoản ngoài',
        trueMss: 'MSS không phá đỉnh gốc của sóng quét', discount: 'Entry không ở vùng discount (dealing range ' + cfg.pdTF.toUpperCase() + ')', ote: 'Entry không ở discount của sóng MSS', kz: 'Ngoài killzone London/NY' };
      const ictReq = (cfg.ictReq || ['htf', 'extSweep', 'trueMss']).concat(cfg.killzone ? ['kz'] : [], cfg.emaM15 ? ['ema15'] : []);
      const ictOK = !cfg.ict || ictReq.every(k => q[k]);
      if (cfg.ict) for (const k of ictReq) if (!q[k]) reasons.push(Q_REASON[k]);

      const pass = ictOK && core.h1 && core.poi && sweep && (fvg || cfg.mode === 'balanced') && entry != null && tp1 && rr1 >= cfg.minRR && score >= (cfg.mode === 'strict' ? cfg.minScore : Math.min(cfg.minScore, 75));
      if (!pass) { D.rej.push({ bar: j, t: x.t, reasons: reasons.length ? reasons : ['Điểm ' + score + ' < ngưỡng'], score }); continue; }
      lastSetupBar = j;
      if (cfg.ict) { // cấu trúc lõi đã bắt buộc → hạng theo số điểm cộng thêm còn thiếu
        const miss = ['discount', 'kz', 'poi', 'fvg', 'rr2'].filter(k => !q[k]).length;
        q.tier = !miss ? 'A+' : miss <= 2 ? 'A' : 'B';
      } else {
        const qCore = ['htf', 'extSweep', 'trueMss', 'discount'].every(k => q[k]);
        const miss = ['poi', 'fvg', 'rr2', 'kz'].filter(k => !q[k]).length;
        q.tier = qCore && !miss ? 'A+' : qCore && miss <= 1 ? 'A' : 'B';
      }
      out.push({
        id: 'S' + c[conf].t, bar: conf, mssBar: j, t: c[conf].t, ct: Tc, entry, sl, tp1, tp2, tp3, rr1,
        eType, score, sc, sweep, fvg, ob, zone: touch.zone, swingH: SH, trend: { h1: t1, h4: t4 }, reasons, q,
      });
    }
    return { setups: out, poi };
  }

  // vòng đời: chờ retest → khớp → SL/TP; huỷ khi hết hạn / chạy tới TP trước / H1 đổi hướng / phá mức vô hiệu
  function lifecycle(s, D, cfg) {
    const c = D.m5.c; s.state = 'WAIT_RETEST'; s.fill = null; s.exit = null;
    for (let m = s.bar + 1; m < D.m5.n; m++) {
      const x = c[m];
      if (s.state === 'WAIT_RETEST') {
        if (x.l <= s.entry) {
          s.state = 'SIGNAL'; s.fill = { bar: m, t: x.t };
          if (x.l <= s.sl) { s.state = 'LOSS'; s.exit = { bar: m, t: x.t, p: s.sl, r: -1 }; return s; }
          continue;
        }
        if (x.h >= s.tp1) { s.state = 'INVALID'; s.why = 'Giá chạy tới TP1 trước khi khớp'; s.exit = { bar: m, t: x.t }; return s; }
        if (x.c < (s.sweep ? s.sweep.low : s.sl)) { s.state = 'INVALID'; s.why = 'Đóng cửa phá đáy sweep – cấu trúc hỏng'; s.exit = { bar: m, t: x.t }; return s; }
        if (m - s.bar > cfg.expiryBars) { s.state = 'INVALID'; s.why = 'Hết hạn chờ retest'; s.exit = { bar: m, t: x.t }; return s; }
        const t1 = trendAt(D.h1, x.ct, cfg); if (t1 && t1.dir !== 1) { s.state = 'INVALID'; s.why = 'H1 đổi hướng'; s.exit = { bar: m, t: x.t }; return s; }
      } else if (s.state === 'SIGNAL') {
        // quản lý lệnh kiểu ICT: chốt một phần ở partialR, dời SL về entry (hoà vốn), phần còn lại chạy tới TP1
        const R = s.entry - s.sl, pc = cfg.partialR > 0 ? cfg.partialPct : 0;
        if (!s.part) {
          if (x.l <= s.sl) { s.state = 'LOSS'; s.exit = { bar: m, t: x.t, p: s.sl, r: -1 }; return s; }
          if (x.h >= s.tp1) { s.state = 'WIN'; s.exit = { bar: m, t: x.t, p: s.tp1, r: s.rr1 }; return s; }
          if (pc && cfg.partialR < s.rr1 && x.h >= s.entry + cfg.partialR * R) { s.part = { bar: m, t: x.t, p: s.entry + cfg.partialR * R, pct: pc, r: pc * cfg.partialR }; continue; }
        } else {
          if (x.l <= s.entry) { s.state = 'BE'; s.exit = { bar: m, t: x.t, p: s.entry, r: s.part.r }; return s; }
          if (x.h >= s.tp1) { s.state = 'WIN'; s.exit = { bar: m, t: x.t, p: s.tp1, r: s.part.r + (1 - s.part.pct) * s.rr1 }; return s; }
        }
      }
    }
    return s;
  }

  // trạng thái hiện tại của thị trường (cho checklist trực tiếp)
  function liveStage(D, poi, setups, cfg) {
    const c = D.m5.c, n = D.m5.n, T = c[n - 1].ct, price = c[n - 1].c;
    const t1 = trendAt(D.h1, T, cfg), t4 = trendAt(D.h4, T, cfg);
    const h1Valid = t1 && t1.emaUp && t1.dir === 1 && t1.gap >= cfg.gapMin && t1.slope >= cfg.slopeMin;
    const h4Bear = t4 && t4.dir === -1 && !t4.emaUp;
    const k15 = idxAt(D.m15, T);
    const zones = poi.filter(q => q.ci <= k15 && k15 - q.ci <= cfg.poiMaxAge && q.dead > k15 && q.top < price + 0.5 * (D.m15.atr[k15] || 0))
      .sort((a, b) => b.top - a.top).slice(0, 4);
    let touched = null;
    for (let m = n - 1; m >= Math.max(0, n - cfg.poiLookback) && !touched; m--) for (const q of zones) if (c[m].l <= q.top && c[m].c >= q.bot) { touched = { m, zone: q }; break; }
    let sweep = null;
    if (touched) for (let s = n - 1; s >= touched.m - 3 && s > 0; s--) {
      const nL = D.m5.st[s - 1].nL; const L = D.m5.sl[nL - 1];
      if (L && c[s].l < L.p && c[s].c > L.p) { sweep = { s, low: c[s].l, level: L.p }; break; }
    }
    const act = setups.filter(s => s.state === 'WAIT_RETEST' || s.state === 'SIGNAL').pop() || null;
    let stage = 'WAIT_TREND';
    if (h1Valid && !h4Bear) stage = 'WAIT_POI';
    if (stage === 'WAIT_POI' && touched) stage = 'WAIT_SWEEP';
    if (stage === 'WAIT_SWEEP' && sweep) stage = 'WAIT_MSS';
    if (act) stage = act.state === 'SIGNAL' ? 'SIGNAL' : 'WAIT_RETEST';
    return { stage, t1, t4, h1Valid, h4Bear, zones, touched, sweep, active: act, price };
  }


  // ---------------- dự kiến đường giá: EMA 34/89 + SMC ----------------
  function project(res, cfg) {
    const I = res.ind, m15 = I.m15, h1 = I.h1, h4 = I.h4, n = m15.n - 1;
    const price = m15.c[n].c, a15 = m15.atr[n], a1 = h1.atr[h1.n - 1], T = m15.c[n].ct;
    const k1 = h1.n - 1, k4 = h4.n - 1;
    // ---- 1. thiên hướng theo EMA 34/89 + cấu trúc ----
    const f = [
      { n: 'H4: EMA34 ' + (h4.e3[k4] > h4.e2[k4] ? 'trên' : 'dưới') + ' EMA89', v: h4.e3[k4] > h4.e2[k4] ? 1 : -1 },
      { n: 'H1: EMA34 ' + (h1.e3[k1] > h1.e2[k1] ? 'trên' : 'dưới') + ' EMA89', v: h1.e3[k1] > h1.e2[k1] ? 1 : -1 },
      { n: 'M15: EMA34 ' + (m15.e3[n] > m15.e2[n] ? 'trên' : 'dưới') + ' EMA89', v: m15.e3[n] > m15.e2[n] ? 1 : -1 },
      { n: 'Giá ' + (price > h1.e2[k1] ? 'trên' : 'dưới') + ' EMA89 H1', v: price > h1.e2[k1] ? 1 : -1 },
      { n: 'BOS H1 gần nhất ' + (h1.st[k1].dir > 0 ? 'tăng' : h1.st[k1].dir < 0 ? 'giảm' : '—'), v: h1.st[k1].dir },
      { n: 'BOS H4 gần nhất ' + (h4.st[k4].dir > 0 ? 'tăng' : h4.st[k4].dir < 0 ? 'giảm' : '—'), v: h4.st[k4].dir },
    ];
    const sum = f.reduce((x, y) => x + y.v, 0);
    const bias = sum >= 2 ? 1 : sum <= -2 ? -1 : 0;
    // ---- 2. các mốc SMC: FVG/OB + thanh khoản (S = hỗ trợ, R = kháng cự) ----
    const lv = [], W = { m15: 1, h1: 2, h4: 3 }, U = (k) => k.toUpperCase();
    for (const k of ['m15', 'h1', 'h4']) {
      for (const q of res.buy.htf[k].zones) lv.push({ p: q.top, lo: q.bot, hi: q.top, type: 'S', w: W[k], name: q.kind + ' tăng ' + U(k), tag: q.kind + ' ' + U(k), zone: true });
      for (const q of res.sell.htf[k].zones) lv.push({ p: q.bot, lo: q.bot, hi: q.top, type: 'R', w: W[k], name: q.kind + ' giảm ' + U(k), tag: q.kind + ' ' + U(k), zone: true });
      for (const l of res.buy.htf[k].liq) lv.push({ p: l.p, type: 'R', w: W[k], name: 'thanh khoản BSL ' + U(k), tag: 'BSL ' + U(k), liq: true });
      for (const l of res.sell.htf[k].liq) lv.push({ p: l.p, type: 'S', w: W[k], name: 'thanh khoản SSL ' + U(k), tag: 'SSL ' + U(k), liq: true });
    }
    // ---- 3. mô phỏng từng con sóng; EMA34/89 M15 được cập nhật theo đường giá dự kiến ----
    let p = price, t = T, e34 = m15.e3[n], e89 = m15.e2[n];
    const k34 = 2 / 35, k89 = 2 / 90, used = new Set();
    const ema34 = [{ t, p: e34 }], ema89 = [{ t, p: e89 }], waves = [{ t, p, kind: 'now', name: 'Giá hiện tại', tag: '' }];
    const move = (to, kind, name, tag) => {
      const spd = (kind === 'imp' ? 0.6 : 0.35) * a15;
      const bars = Math.max(2, Math.round(Math.abs(to - p) / spd));
      for (let i = 1; i <= bars; i++) {
        const q = p + (to - p) * i / bars; e34 += (q - e34) * k34; e89 += (q - e89) * k89; t += 9e5;
        ema34.push({ t, p: e34 }); ema89.push({ t, p: e89 });
      }
      waves.push({ t, p: to, from: p, kind, name, tag, bars }); p = to;
    };
    const MIN = Math.max(1.2 * a15, 0.8 * a1); // sóng đẩy tối thiểu ~0.8 ATR H1, bỏ qua các mốc quá sát
    // đích của sóng đẩy: thanh khoản / FVG kế tiếp theo hướng d, cách tối thiểu MIN
    const target = (d, strong) => {
      const c = lv.filter(l => !used.has(l) && (d > 0 ? l.type === 'R' && l.p > p + MIN : l.type === 'S' && l.p < p - MIN) && (!strong || l.w >= 2))
        .sort((x, y) => d > 0 ? x.p - y.p : y.p - x.p);
      return c[0] || null;
    };
    // đích của sóng hồi sau sóng đẩy A→B: ưu tiên FVG/OB, rồi EMA34, EMA89, cuối cùng 50%
    const pullback = (A, B) => {
      const d = Math.sign(B - A), lo = B - d * 0.30 * Math.abs(B - A), hi = B - d * 0.65 * Math.abs(B - A);
      const inBand = (x) => d < 0 ? x >= lo && x <= hi : x <= lo && x >= hi;
      const z = lv.filter(l => !used.has(l) && l.zone && (d < 0 ? l.type === 'R' : l.type === 'S') && inBand(l.p)).sort((x, y) => Math.abs(x.p - B) - Math.abs(y.p - B))[0];
      if (z) { used.add(z); return { p: z.p, name: 'lấp ' + z.name, tag: z.tag }; }
      if (inBand(e34)) return { p: e34, name: 'chạm EMA34 M15', tag: 'EMA34' };
      if (inBand(e89)) return { p: e89, name: 'chạm EMA89 M15', tag: 'EMA89' };
      return { p: B - d * 0.5 * Math.abs(B - A), name: 'hồi 50% sóng trước', tag: '50%' };
    };
    let inval = null, alt = [];
    if (bias !== 0) {
      const d = bias;
      // sóng 0: giá đang xa EMA34 theo hướng xu hướng → hồi về EMA34 (hoặc FVG nằm giữa)
      const ext = (p - e34) * d;
      if (ext > Math.max(1.2 * a15, 0.5 * a1)) {
        const mid = lv.filter(l => !used.has(l) && l.zone && (d > 0 ? l.type === 'S' : l.type === 'R') && (d > 0 ? l.p < p - 0.3 * a15 && l.p >= e34 : l.p > p + 0.3 * a15 && l.p <= e34))
          .sort((x, y) => Math.abs(x.p - p) - Math.abs(y.p - p))[0];
        if (mid) { used.add(mid); move(mid.p, 'pb', 'hồi ' + (d > 0 ? 'xuống' : 'lên') + ' lấp ' + mid.name, mid.tag); }
        else move(e34 + d * 0.1 * a15, 'pb', 'hồi ' + (d > 0 ? 'xuống' : 'lên') + ' chạm EMA34 M15', 'EMA34');
      } else if (ext < -0.3 * a15) {
        // giá đang ở sai phía EMA34: cần lấy lại EMA34 trước
        move(e34 + d * 0.3 * a15, 'imp', (d > 0 ? 'lấy lại' : 'mất') + ' EMA34 M15', 'EMA34');
      }
      for (let i = 0; i < 3; i++) {
        const last = i === 2, tg = target(d, last) || target(d, false);
        const A = p;
        if (tg) { used.add(tg); move(tg.p, 'imp', (tg.liq ? (d > 0 ? 'tăng quét ' : 'giảm quét ') : (d > 0 ? 'tăng tới ' : 'giảm tới ')) + tg.name, tg.tag); }
        else { move(p + d * 2 * a1, 'imp', (d > 0 ? 'tăng' : 'giảm') + ' mở rộng ~2 ATR H1', '2ATR'); }
        if (!last) { const pbv = pullback(A, p); move(pbv.p, 'pb', (d > 0 ? 'hồi xuống ' : 'hồi lên ') + pbv.name, pbv.tag); }
        if (!tg) break;
      }
      // mức vô hiệu: phía bên kia của cấu trúc gần nhất (vượt qua là kịch bản sai)
      const ext0 = d > 0 ? Math.min(...waves.map(w => w.p)) : Math.max(...waves.map(w => w.p));
      const iv = lv.filter(l => (d > 0 ? l.type === 'S' && l.p < ext0 - 0.3 * a15 : l.type === 'R' && l.p > ext0 + 0.3 * a15) && l.w >= 2).sort((x, y) => d > 0 ? y.p - x.p : x.p - y.p)[0];
      inval = iv ? { p: iv.p, name: iv.name } : { p: ext0 - d * a1, name: d > 0 ? 'dưới đáy sóng gần nhất' : 'trên đỉnh sóng gần nhất' };
      const nx = lv.filter(l => d > 0 ? l.type === 'S' && l.p < inval.p - MIN : l.type === 'R' && l.p > inval.p + MIN).sort((x, y) => d > 0 ? y.p - x.p : x.p - y.p)[0];
      alt = [{ p: price, t: T }, { p: inval.p, name: (d > 0 ? 'phá xuống ' : 'phá lên ') + inval.name }, { p: nx ? nx.p : inval.p - d * 2 * a1, name: (d > 0 ? 'giảm tới ' : 'tăng tới ') + (nx ? nx.name : 'mở rộng 2 ATR H1') }];
      let ta = T; alt = alt.map((x, i) => { if (i) ta += Math.max(2, Math.round(Math.abs(x.p - alt[i - 1].p) / (0.6 * a15))) * 9e5; return { ...x, t: ta }; });
    } else {
      // đi ngang: dao động giữa hỗ trợ và kháng cự gần nhất
      const r = target(1, false), s = target(-1, false);
      const R = r ? r : { p: p + 1.5 * a15, name: 'biên trên', tag: 'biên' }, S2 = s ? s : { p: p - 1.5 * a15, name: 'biên dưới', tag: 'biên' };
      const upFirst = R.p - p < p - S2.p;
      const seq = upFirst ? [R, S2, R] : [S2, R, S2];
      seq.forEach((x, i) => move(x.p, i % 2 ? 'pb' : 'imp', (x === R ? 'lên chạm ' : 'xuống chạm ') + x.name, x.tag));
      move((R.p + S2.p) / 2, 'pb', 'về giữa biên chờ phá vỡ', 'giữa');
    }
    return { bias, sum, factors: f, path: waves, ema34, ema89, alt, inval, levels: lv };
  }

  // ---------------- API ----------------
  function analyze(raw, userCfg) {
    const cfg = Object.assign({}, DEF, userCfg || {});
    const res = {}, P = {};
    // lượt 1: quét + vòng đời cho từng phía
    for (const side of ['buy', 'sell']) {
      const src = side === 'buy' ? raw : { m5: mirror(raw.m5), m15: mirror(raw.m15), h1: mirror(raw.h1), h4: mirror(raw.h4) };
      const D = {
        m5: prepTF(src.m5, cfg, cfg.pivotL, cfg.pivotR), m15: prepTF(src.m15, cfg, cfg.pivotHTF, cfg.pivotHTF),
        h1: prepTF(src.h1, cfg, cfg.pivotHTF, cfg.pivotHTF), h4: prepTF(src.h4, cfg, cfg.pivotHTF, cfg.pivotHTF),
      };
      D.rej = [];
      const { setups, poi } = scanBuy(D, cfg);
      setups.forEach(s => lifecycle(s, D, cfg));
      P[side] = { D, setups, poi };
    }
    // lượt 2: lọc nhiễu — giằng co hai chiều, chồng lệnh, hạng chất lượng
    for (const side of ['buy', 'sell']) {
      const other = P[side === 'buy' ? 'sell' : 'buy'].setups;
      for (const s of P[side].setups) {
        if (other.some(o => o.mssBar <= s.mssBar && s.mssBar - o.mssBar <= cfg.conflictBars)) { s.q.conflict = true; s.q.tier = 'B'; }
      }
      let open = null;
      for (const s of P[side].setups) {
        s.q.overlap = !!(open && (!open.exit || open.exit.t > s.t)); // setup trước cùng chiều còn đang chờ/chạy
        s.keep = TIER_OK[cfg.tier || 'A'].includes(s.q.tier) && !s.q.overlap;
        if (s.keep) open = s;
      }
    }
    const raws = [];
    for (const side of ['buy', 'sell']) {
      const { D, setups, poi } = P[side], kept = setups.filter(s => s.keep);
      const live = liveStage(D, poi, kept, cfg);
      const sg = side === 'buy' ? 1 : -1, f = v => v == null ? v : v * sg;
      const flipZone = q => q && ({ ...q, bot: sg > 0 ? q.bot : -q.top, top: sg > 0 ? q.top : -q.bot });
      const outS = setups.map(s => ({ ...s, side, entry: f(s.entry), sl: f(s.sl), tp1: f(s.tp1), tp2: f(s.tp2), tp3: f(s.tp3),
          sweep: s.sweep && { ...s.sweep, low: f(s.sweep.low), level: f(s.sweep.level) }, fvg: flipZone(s.fvg), ob: flipZone(s.ob), zone: flipZone(s.zone),
          exit: s.exit && { ...s.exit, p: f(s.exit.p) } }));
      raws.push(...outS);
      res[side] = {
        setups: outS.filter(s => s.keep),
        poi: poi.map(flipZone),
        live: { ...live, price: f(live.price), zones: live.zones.map(flipZone), touched: live.touched && { ...live.touched, zone: flipZone(live.touched.zone) },
          sweep: live.sweep && { ...live.sweep, low: f(live.sweep.low), level: f(live.sweep.level) }, active: live.active && res_active(live.active, sg) },
        rejected: D.rej,
        events: Object.fromEntries(['m5', 'm15', 'h1', 'h4'].map(k => [k, D[k].events.map(e => ({ ...e, t: D[k].c[e.k].t, dir: e.dir * sg, p: f(e.p) }))])),
      };
      // vùng cản đa khung: OB/FVG còn hiệu lực + thanh khoản chưa bị lấy (chỉ 2 mốc gần nhất mỗi khung → bớt rối)
      const zs = {};
      for (const k of ['m15', 'h1', 'h4']) {
        const tf = D[k], last = tf.n - 1, price = tf.c[last].c, a = tf.atr[last];
        const z = buildPOI(tf).filter(q => q.dead === Infinity && last - q.ci <= 400 && q.bot < price + 0.5 * a && (q.kind === 'FVG' || q.disp))
          .sort((x, y) => (price - x.top) - (price - y.top)).slice(0, 2);
        const liq = [];
        for (let q = tf.sh.length - 1; q >= 0 && liq.length < 2; q--) {
          const p = tf.sh[q]; if (p.p <= price) continue;
          let taken = false; for (let u = p.i + 1; u <= last; u++) if (tf.c[u].h > p.p) { taken = true; break; }
          if (!taken && !liq.some(l => Math.abs(l.p - p.p) < 0.15 * a)) liq.push({ p: p.p, t: tf.c[p.i].t });
        }
        liq.sort((x, y) => x.p - y.p);
        zs[k] = { zones: z.map(q => ({ ...flipZone(q), tf: k })), liq: liq.map(l => ({ p: f(l.p), t: l.t, tf: k })) };
      }
      res[side].htf = zs;
      if (side === 'buy') res.ind = { m5: D.m5, m15: D.m15, h1: D.h1, h4: D.h4 };
    }
    function res_active(a, sg) { const f = v => v == null ? v : v * sg; return { ...a, entry: f(a.entry), sl: f(a.sl), tp1: f(a.tp1), tp2: f(a.tp2), tp3: f(a.tp3) }; }
    // thống kê
    const stat = (list) => {
      const closed = list.filter(s => s.state === 'WIN' || s.state === 'LOSS' || s.state === 'BE');
      const wins = closed.filter(s => s.exit.r > 0), gw = wins.reduce((a, s) => a + s.exit.r, 0);
      const gl = closed.filter(s => s.exit.r < 0).reduce((a, s) => a - s.exit.r, 0), nl = closed.filter(s => s.state === 'LOSS').length;
      let eq = 0, peak = 0, dd = 0; for (const s of closed) { eq += s.exit.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
      return { total: list.length, filled: list.filter(s => s.fill).length, closed: closed.length, wins: wins.length, losses: nl,
        be: closed.filter(s => s.state === 'BE').length,
        winRate: closed.length ? wins.length / closed.length : 0, netR: gw - gl, pf: gl ? gw / gl : (gw ? Infinity : 0), maxDD: dd,
        invalid: list.filter(s => s.state === 'INVALID').length, exp: closed.length ? (gw - gl) / closed.length : 0 };
    };
    raws.sort((a, b) => a.t - b.t);
    const all = raws.filter(s => s.keep);
    res.stats = stat(all);
    // so sánh hiệu quả theo hạng (mỗi hạng tính riêng, bỏ setup chồng lệnh)
    const solo = raws.filter(s => !s.q.overlap);
    res.tierStats = { 'A+': stat(solo.filter(s => s.q.tier === 'A+')), 'A': stat(solo.filter(s => s.q.tier === 'A')), 'B': stat(solo.filter(s => s.q.tier === 'B')), 'Tất cả': stat(solo) };
    res.allRaw = raws;
    res.all = all; res.cfg = cfg;
    res.proj = project(res, cfg);
    return res;
  }

  G.SMC = { analyze, DEF, ema, atr };
  if (typeof module !== 'undefined') module.exports = G.SMC;
})(typeof window !== 'undefined' ? window : globalThis);
