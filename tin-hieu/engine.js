/* =====================================================================
   SMC ENGINE — Chiến lược EMA 24/89 + ICT + SMC  (H4 → H1 → M15 → M5)
   Mọi điều kiện tính trên NẾN ĐÃ ĐÓNG, không repaint:
   - Swing (pivot L/R) chỉ được dùng sau khi đủ R nến bên phải.
   - BOS/MSS xác nhận bằng giá đóng cửa.
   - Bối cảnh của một setup chỉ dùng dữ liệu đã đóng trước thời điểm setup.
   Lệnh SELL = chạy cùng logic BUY trên dữ liệu "lật giá" (giá → −giá).
   ===================================================================== */
(function (G) {
  'use strict';

  const DEF = {
    emaFast: 24, emaSlow: 89, emaMid: 34, atrLen: 14,
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
    bufATR: 0.15, minBuf: 0.8,        // buffer SL dưới đáy sweep
  };

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
    for (let k = 0; k < n; k++) {
      while (ph < tf.pivH.length && tf.pivH[ph].conf <= k) { const p = tf.pivH[ph++]; sh.push(p); actH = { ...p, broken: false }; }
      while (pl < tf.pivL.length && tf.pivL[pl].conf <= k) { const p = tf.pivL[pl++]; sl.push(p); actL = { ...p, broken: false }; }
      if (actH && !actH.broken && c[k].c > actH.p) {
        actH.broken = true; tf.events.push({ k, dir: 1, p: actH.p, piv: actH.i, type: dir === -1 ? 'CHoCH' : 'BOS' }); dir = 1; lastBos = k;
      }
      if (actL && !actL.broken && c[k].c < actL.p) {
        actL.broken = true; tf.events.push({ k, dir: -1, p: actL.p, piv: actL.i, type: dir === 1 ? 'CHoCH' : 'BOS' }); dir = -1; lastBos = k;
      }
      tf.st[k] = { dir, lastBos, nH: sh.length, nL: sl.length };
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
    return {
      k, dir: s.dir, emaUp: tf.e1[k] > tf.e2[k], gap: Math.abs(tf.e1[k] - tf.e2[k]) / a,
      slope: (tf.e2[k] - tf.e2[k - cfg.slopeBack]) / a, hhhl: hh && hl, lhll: !hh && !hl && H.length >= 2 && Lw.length >= 2,
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
      const isDisp = body >= cfg.dispBody * rng && rng >= cfg.dispATR * a5;
      if (!isDisp) continue;
      // swing high M5 đã xác nhận gần nhất trước j
      const nH = m5.st[j - 1].nH; if (!nH) continue;
      const SH = m5.sh[nH - 1];
      if (!(x.c > SH.p && c[j - 1].c <= SH.p)) continue; // MSS: lần đóng cửa đầu tiên phá swing high
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
      const buf = Math.max(cfg.bufATR * a5, cfg.minBuf);
      const sl = lowRef - buf;
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

      const pass = core.h1 && core.poi && sweep && (fvg || cfg.mode === 'balanced') && entry != null && tp1 && rr1 >= cfg.minRR && score >= (cfg.mode === 'strict' ? cfg.minScore : Math.min(cfg.minScore, 75));
      if (!pass) { D.rej.push({ bar: j, t: x.t, reasons: reasons.length ? reasons : ['Điểm ' + score + ' < ngưỡng'], score }); continue; }
      lastSetupBar = j;
      out.push({
        id: 'S' + c[conf].t, bar: conf, mssBar: j, t: c[conf].t, ct: Tc, entry, sl, tp1, tp2, tp3, rr1,
        eType, score, sc, sweep, fvg, ob, zone: touch.zone, swingH: SH, trend: { h1: t1, h4: t4 }, reasons,
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
        if (x.c < s.sl) { s.state = 'INVALID'; s.why = 'Phá mức vô hiệu'; s.exit = { bar: m, t: x.t }; return s; }
        if (m - s.bar > cfg.expiryBars) { s.state = 'INVALID'; s.why = 'Hết hạn chờ retest'; s.exit = { bar: m, t: x.t }; return s; }
        const t1 = trendAt(D.h1, x.ct, cfg); if (t1 && t1.dir !== 1) { s.state = 'INVALID'; s.why = 'H1 đổi hướng'; s.exit = { bar: m, t: x.t }; return s; }
      } else if (s.state === 'SIGNAL') {
        if (x.l <= s.sl) { s.state = 'LOSS'; s.exit = { bar: m, t: x.t, p: s.sl, r: -1 }; return s; }
        if (x.h >= s.tp1) { s.state = 'WIN'; s.exit = { bar: m, t: x.t, p: s.tp1, r: s.rr1 }; return s; }
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
    const f = [
      { n: 'H4 EMA34 ' + (h4.e3[k4] > h4.e2[k4] ? '>' : '<') + ' EMA89', v: h4.e3[k4] > h4.e2[k4] ? 1 : -1 },
      { n: 'H1 EMA34 ' + (h1.e3[k1] > h1.e2[k1] ? '>' : '<') + ' EMA89', v: h1.e3[k1] > h1.e2[k1] ? 1 : -1 },
      { n: 'M15 EMA34 ' + (m15.e3[n] > m15.e2[n] ? '>' : '<') + ' EMA89', v: m15.e3[n] > m15.e2[n] ? 1 : -1 },
      { n: 'Giá ' + (price > h1.e2[k1] ? 'trên' : 'dưới') + ' EMA89 H1', v: price > h1.e2[k1] ? 1 : -1 },
      { n: 'BOS H1 gần nhất ' + (h1.st[k1].dir > 0 ? 'tăng' : h1.st[k1].dir < 0 ? 'giảm' : '—'), v: h1.st[k1].dir },
      { n: 'BOS H4 gần nhất ' + (h4.st[k4].dir > 0 ? 'tăng' : h4.st[k4].dir < 0 ? 'giảm' : '—'), v: h4.st[k4].dir },
    ];
    const sum = f.reduce((x, y) => x + y.v, 0);
    const bias = sum >= 2 ? 1 : sum <= -2 ? -1 : 0;
    // các mức hỗ trợ / kháng cự
    const lv = [];
    const W = { m15: 1, h1: 2, h4: 3 };
    for (const k of ['m15', 'h1', 'h4']) {
      for (const q of res.buy.htf[k].zones) lv.push({ p: q.top, lo: q.bot, hi: q.top, type: 'S', w: W[k], name: q.kind + ' tăng ' + k.toUpperCase() });
      for (const q of res.sell.htf[k].zones) lv.push({ p: q.bot, lo: q.bot, hi: q.top, type: 'R', w: W[k], name: q.kind + ' giảm ' + k.toUpperCase() });
      for (const l of res.buy.htf[k].liq) lv.push({ p: l.p, type: 'R', w: W[k], name: 'BSL ' + k.toUpperCase() });
      for (const l of res.sell.htf[k].liq) lv.push({ p: l.p, type: 'S', w: W[k], name: 'SSL ' + k.toUpperCase() });
    }
    for (const [nm, v] of [['EMA34 M15', m15.e3[n]], ['EMA89 M15', m15.e2[n]], ['EMA34 H1', h1.e3[k1]], ['EMA89 H1', h1.e2[k1]], ['EMA89 H4', h4.e2[k4]]])
      lv.push({ p: v, type: v < price ? 'S' : 'R', w: 1.5, name: nm, ema: true });
    const gap = 0.3 * a15;
    const below = (x, skip = 0) => lv.filter(l => l.p < x - gap).sort((p, q) => q.p - p.p)[skip] || null;
    const above = (x, skip = 0) => lv.filter(l => l.p > x + gap).sort((p, q) => p.p - q.p)[skip] || null;
    const strongAbove = (x) => lv.filter(l => l.p > x + gap && l.w >= 2).sort((p, q) => p.p - q.p)[0] || above(x);
    const strongBelow = (x) => lv.filter(l => l.p < x - gap && l.w >= 2).sort((p, q) => q.p - p.p)[0] || below(x);
    const fb = (x, d) => ({ p: x + d * 2 * a1, name: 'mở rộng 2×ATR H1' });
    const pts = [{ p: price, name: 'Giá hiện tại' }];
    const ema34 = m15.e3[n];
    let inval = null, alt = [];
    if (bias === 1) {
      if (price - ema34 > 1.0 * a15) { const p1 = below(price) || { p: ema34, name: 'EMA34 M15' }; pts.push({ ...p1, act: 'hồi về' }); }
      const r1 = above(price) || fb(price, 1); pts.push({ ...r1, act: 'tăng tới' });
      const base = pts[pts.length - 2].p, pb = r1.p - 0.382 * (r1.p - base); pts.push({ p: pb, name: 'hồi 38.2%', act: 'điều chỉnh' });
      const r2 = strongAbove(r1.p) || fb(r1.p, 1); pts.push({ ...r2, act: 'tiếp tục tới' });
      const lowRef = Math.min(...pts.map(x => x.p));
      inval = strongBelow(lowRef) || { p: lowRef - a1, name: 'dưới đáy gần nhất' };
      alt = [{ p: price }, { ...inval, act: 'phá xuống' }, { ...(below(inval.p) || fb(inval.p, -1)), act: 'giảm tiếp tới' }];
    } else if (bias === -1) {
      if (ema34 - price > 1.0 * a15) { const p1 = above(price) || { p: ema34, name: 'EMA34 M15' }; pts.push({ ...p1, act: 'hồi lên' }); }
      const s1 = below(price) || fb(price, -1); pts.push({ ...s1, act: 'giảm tới' });
      const base = pts[pts.length - 2].p, pb = s1.p + 0.382 * (base - s1.p); pts.push({ p: pb, name: 'hồi 38.2%', act: 'điều chỉnh' });
      const s2 = strongBelow(s1.p) || fb(s1.p, -1); pts.push({ ...s2, act: 'tiếp tục tới' });
      const hiRef = Math.max(...pts.map(x => x.p));
      inval = strongAbove(hiRef) || { p: hiRef + a1, name: 'trên đỉnh gần nhất' };
      alt = [{ p: price }, { ...inval, act: 'phá lên' }, { ...(above(inval.p) || fb(inval.p, 1)), act: 'tăng tiếp tới' }];
    } else {
      const r1 = above(price) || fb(price, 1), s1 = below(price) || fb(price, -1);
      const first = (r1.p - price) < (price - s1.p) ? [r1, s1] : [s1, r1];
      pts.push({ ...first[0], act: 'chạm' }, { ...first[1], act: 'quay về' }, { p: (r1.p + s1.p) / 2, name: 'giữa biên', act: 'đi ngang quanh' });
      inval = null;
    }
    // thời gian: mỗi đoạn ≈ |Δ| / (0.5 × ATR M15) nến M15
    const timed = (arr) => { let t = T; return arr.map((x, i) => { if (i) t += Math.max(2, Math.round(Math.abs(x.p - arr[i - 1].p) / (0.5 * a15))) * 9e5; return { ...x, t }; }); };
    return { bias, sum, factors: f, path: timed(pts), alt: alt.length ? timed(alt) : [], inval, levels: lv };
  }

  // ---------------- API ----------------
  function analyze(raw, userCfg) {
    const cfg = Object.assign({}, DEF, userCfg || {});
    const res = {};
    for (const side of ['buy', 'sell']) {
      const src = side === 'buy' ? raw : { m5: mirror(raw.m5), m15: mirror(raw.m15), h1: mirror(raw.h1), h4: mirror(raw.h4) };
      const D = {
        m5: prepTF(src.m5, cfg, cfg.pivotL, cfg.pivotR), m15: prepTF(src.m15, cfg, cfg.pivotHTF, cfg.pivotHTF),
        h1: prepTF(src.h1, cfg, cfg.pivotHTF, cfg.pivotHTF), h4: prepTF(src.h4, cfg, cfg.pivotHTF, cfg.pivotHTF),
      };
      D.rej = [];
      const { setups, poi } = scanBuy(D, cfg);
      setups.forEach(s => lifecycle(s, D, cfg));
      const live = liveStage(D, poi, setups, cfg);
      const sg = side === 'buy' ? 1 : -1, f = v => v == null ? v : v * sg;
      const flipZone = q => q && ({ ...q, bot: sg > 0 ? q.bot : -q.top, top: sg > 0 ? q.top : -q.bot });
      res[side] = {
        setups: setups.map(s => ({ ...s, side, entry: f(s.entry), sl: f(s.sl), tp1: f(s.tp1), tp2: f(s.tp2), tp3: f(s.tp3),
          sweep: s.sweep && { ...s.sweep, low: f(s.sweep.low), level: f(s.sweep.level) }, fvg: flipZone(s.fvg), ob: flipZone(s.ob), zone: flipZone(s.zone),
          exit: s.exit && { ...s.exit, p: f(s.exit.p) } })),
        poi: poi.map(flipZone),
        live: { ...live, price: f(live.price), zones: live.zones.map(flipZone), touched: live.touched && { ...live.touched, zone: flipZone(live.touched.zone) },
          sweep: live.sweep && { ...live.sweep, low: f(live.sweep.low), level: f(live.sweep.level) }, active: live.active && res_active(live.active, sg) },
        rejected: D.rej,
        events: Object.fromEntries(['m5', 'm15', 'h1', 'h4'].map(k => [k, D[k].events.map(e => ({ ...e, t: D[k].c[e.k].t, dir: e.dir * sg, p: f(e.p) }))])),
      };
      // vùng cản đa khung: OB/FVG còn hiệu lực + thanh khoản chưa bị lấy
      const zs = {};
      for (const k of ['m15', 'h1', 'h4']) {
        const tf = D[k], last = tf.n - 1, price = tf.c[last].c, a = tf.atr[last];
        const z = buildPOI(tf).filter(q => q.dead === Infinity && last - q.ci <= 400 && q.bot < price + 0.5 * a)
          .sort((x, y) => (price - x.top) - (price - y.top)).slice(0, 3);
        const liq = [];
        for (let q = tf.sh.length - 1; q >= 0 && liq.length < 3; q--) {
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
    const all = [...res.buy.setups, ...res.sell.setups].sort((a, b) => a.t - b.t);
    const closed = all.filter(s => s.state === 'WIN' || s.state === 'LOSS');
    const wins = closed.filter(s => s.state === 'WIN'), gw = wins.reduce((a, s) => a + s.exit.r, 0), gl = closed.length - wins.length;
    let eq = 0, peak = 0, dd = 0; for (const s of closed) { eq += s.exit.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
    res.stats = { total: all.length, filled: all.filter(s => s.fill).length, closed: closed.length, wins: wins.length, losses: gl,
      winRate: closed.length ? wins.length / closed.length : 0, netR: gw - gl, pf: gl ? gw / gl : (gw ? Infinity : 0), maxDD: dd,
      invalid: all.filter(s => s.state === 'INVALID').length };
    res.all = all; res.cfg = cfg;
    res.proj = project(res, cfg);
    return res;
  }

  G.SMC = { analyze, DEF, ema, atr };
  if (typeof module !== 'undefined') module.exports = G.SMC;
})(typeof window !== 'undefined' ? window : globalThis);
