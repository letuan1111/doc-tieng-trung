/* Kịch bản "Sóng 15" — bắt con sóng ≥ 15 giá của vàng trên M5 (ICT/SMC), dùng chung cho trang web (window.WAVE) và máy chủ (require).
 *  1. Quét thanh khoản: râu nến M5 vượt PDH/PDL, đỉnh/đáy tuần trước (PWH/PWL) hoặc đỉnh/đáy London (bỏ phiên Á: yếu), rồi đóng cửa quay lại trong ≤ 3 nến.
 *  2. MSS M5: giá đóng cửa vượt đỉnh/đáy swing M5 gần nhất trước cú quét (trong ≤ 6 giờ, chưa phá cực trị quét).
 *  3. Đặt lệnh: LIMIT tại mép FVG M5 nằm giữa cực trị quét và nến MSS. Chờ khớp tối đa 1 giờ (12 nến M5).
 *  4. SL: ngoài cực trị quét + 0.3 ATR M15 + spread.   TP: max(2R, 15 giá) — luôn nhắm sóng ≥ 15 giá.
 *  5. Huỷ nếu giá chạm TP trước khi khớp, hoặc đóng cửa vượt SL trước khi khớp. Giữ lệnh tối đa 2 ngày.
 *  Kiểm tra 12 tháng XAU (research/wavetest.mjs): ~1.2 lệnh/tuần, thắng 34%, TP TB ~32 giá; dương ở cả 2 nửa năm (+1.3R / +1.9R; 0.02 lot +69 / +26 USD) — lợi thế mỏng, để GHI NHẬN.
 *  Học từ 5163 sóng ≥ 15 giá trong 12 tháng (research/moves.mjs): 83% sóng bắt đầu bằng một cú quét thanh khoản; sau quét PDH/PDL + MSS M5,
 *  ~90% lần giá chạy ≥ 15 giá tính từ điểm quét — nhưng lúc MSS xác nhận giá đã đi ~60% sóng, nên chỉ vào khi giá hồi về FVG.
 */
(function (root, factory) { const W = factory(); if (typeof module === 'object' && module.exports) module.exports = W; else root.WAVE = W; })(typeof self !== 'undefined' ? self : this, function () {
  const M5 = 3e5, M15 = 9e5;
  const CFG = { minPts: 15, rr: 2, slATR: 0.3, back: 3, mssBars: 72, expiry: 12, hold: 576, levels: ['PD', 'PW', 'London'], needFVG: true, entry: 'edge', tpMode: 'max' };
  const hourVN = (t) => (new Date(t).getUTCHours() + 7) % 24;
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function pivotsH(c, L = 3) { const H = [], Lw = []; for (let i = L; i < c.length - L; i++) { let ph = true, pl = true; for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; } if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lw.push({ i, p: c[i].l, conf: i + L }); } return { H, L: Lw }; }
  // mức thanh khoản tại mỗi nến (chỉ dùng dữ liệu trước đó). Ngày/tuần trước chỉ dùng khi đã có đủ dữ liệu từ đầu ngày/tuần.
  function levels(c) {
    const out = new Array(c.length); let day = null, dH = -Infinity, dL = Infinity, pdH = null, pdL = null, dFull = false, aH = -Infinity, aL = Infinity, lH = -Infinity, lL = Infinity, wk = null, wH = -Infinity, wL = Infinity, pwH = null, pwL = null, wFull = false;
    for (let i = 0; i < c.length; i++) {
      const x = c[i], dk = Math.floor(x.t / 864e5), hr = new Date(x.t).getUTCHours(), w = Math.floor((dk + 3) / 7);
      if (dk !== day) { if (day !== null && dFull) { pdH = dH; pdL = dL; } else if (day !== null) { pdH = pdL = null; } dFull = x.t % 864e5 === 0; day = dk; dH = -Infinity; dL = Infinity; aH = -Infinity; aL = Infinity; lH = -Infinity; lL = Infinity; }
      if (w !== wk) { if (wk !== null && wFull) { pwH = wH; pwL = wL; } else if (wk !== null) { pwH = pwL = null; } wFull = (dk + 3) % 7 === 0 && x.t % 864e5 < 36e5; wk = w; wH = -Infinity; wL = Infinity; }
      out[i] = { PD: [pdL, pdH], PW: [pwL, pwH], 'Á': [hr >= 6 && aL < Infinity ? aL : null, hr >= 6 && aH > -Infinity ? aH : null], London: [hr >= 12 && lL < Infinity ? lL : null, hr >= 12 && lH > -Infinity ? lH : null] };
      dH = Math.max(dH, x.h); dL = Math.min(dL, x.l); wH = Math.max(wH, x.h); wL = Math.min(wL, x.l);
      if (hr < 6) { aH = Math.max(aH, x.h); aL = Math.min(aL, x.l); } else if (hr >= 7 && hr < 12) { lH = Math.max(lH, x.h); lL = Math.min(lL, x.l); }
    }
    return out;
  }
  const NAME = { PD: ['PDL', 'PDH'], PW: ['PWL', 'PWH'], London: ['Đáy London', 'Đỉnh London'], 'Á': ['Đáy phiên Á', 'Đỉnh phiên Á'] };
  // D = { m5, m15 } nến đã đóng; trả về danh sách tín hiệu (có trạng thái tới nến cuối)
  function run(D, opt) {
    opt = opt || {}; const cfg = { ...CFG, ...(opt.cfg || {}) }, c = D.m5, spread = opt.spread || 0, n = c ? c.length : 0, out = [];
    if (n < 100 || !D.m15 || D.m15.length < 20) return out;
    const A15 = atr(D.m15), lv = levels(c), pv = pivotsH(c), used = new Set(), emitted = new Set();
    let j15 = 0; const a15At = (t) => { while (j15 + 1 < D.m15.length && D.m15[j15 + 1].ct <= t) j15++; return A15[j15]; };
    let ih = 0, il = 0; const sh = [], sl = [];
    for (let i = 60; i < n; i++) {
      while (ih < pv.H.length && pv.H[ih].conf <= i) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= i) sl.push(pv.L[il++]);
      for (const d of [1, -1]) {
        for (const key of cfg.levels) {
          const v = lv[i][key][d > 0 ? 0 : 1]; if (v == null || !(d > 0 ? c[i].l < v : c[i].h > v)) continue;
          const uk = key + d + v; if (used.has(uk)) continue;
          let back = -1; for (let u = i; u <= Math.min(n - 1, i + cfg.back); u++) if (d > 0 ? c[u].c > v : c[u].c < v) { back = u; break; }
          if (back < 0) { if (i + cfg.back < n) used.add(uk); continue; } used.add(uk);
          const P = d > 0 ? sh[sh.length - 1] : sl[sl.length - 1]; if (!P) break;
          let eI = i, k = -1;
          for (let u = i; u <= i + cfg.mssBars && u < n; u++) { if (d > 0 ? c[u].l < c[eI].l : c[u].h > c[eI].h) eI = u; if (d > 0 ? c[u].c > P.p : c[u].c < P.p) { k = u; break; } }
          if (k < 0) break;
          const sid = `w5-${c[k].t}-${d > 0 ? 'B' : 'S'}`; if (emitted.has(sid)) break; // một tín hiệu cho mỗi nến MSS
          let f = null; for (let m = eI + 2; m <= k; m++) { const bot = d > 0 ? c[m - 2].h : c[m].h, top = d > 0 ? c[m].l : c[m - 2].l; if (top > bot) { f = { top, bot }; break; } }
          if (!f && cfg.needFVG) break;
          const ext = d > 0 ? c[eI].l : c[eI].h, a = a15At(c[k].ct);
          const entry = f ? (cfg.entry === 'edge' ? (d > 0 ? f.top : f.bot) : (f.top + f.bot) / 2) : ext + d * 0.5 * Math.abs(c[k].c - ext);
          const slP = ext - d * (cfg.slATR * a + spread), risk = Math.abs(entry - slP);
          if (!(risk > 0) || !(d > 0 ? entry < c[k].c : entry > c[k].c)) break;
          const tpDist = cfg.tpMode === 'max' ? Math.max(cfg.rr * risk, cfg.minPts) : cfg.tpMode === 'pts' ? cfg.minPts : cfg.rr * risk;
          if (cfg.tpMode === 'skip' && cfg.rr * risk < cfg.minPts) break;
          const tp = entry + d * tpDist, rr = tpDist / risk;
          emitted.add(sid);
          const s = { id: sid, tf: 'm5', model: 'Sóng 15', grade: 'W', side: d, t: c[k].t, ct: c[k].ct, entry, sl: slP, tp, risk, rr: +rr.toFixed(2),
            sweep: v, sweepName: NAME[key][d > 0 ? 0 : 1], origin: ext, fvg: f, spread, hour: hourVN(c[k].t), sweepT: c[eI].t, mssMin: Math.round((c[k].t - c[eI].t) / 6e4),
            state: 'PENDING', fillT: null, exitT: null, exitP: null, r: null, pts: null };
          // mô phỏng tới nến cuối
          let fill = -1;
          for (let u = k + 1; u < n && u <= k + cfg.expiry; u++) { const x = c[u];
            if (d > 0 ? x.h >= tp : x.l <= tp) { s.state = 'MISSED'; s.exitT = x.ct; break; }
            if (d > 0 ? x.l <= entry : x.h >= entry) { fill = u; break; }
            if (d > 0 ? x.c < slP : x.c > slP) { s.state = 'INVALID'; s.exitT = x.ct; break; } }
          if (s.state === 'PENDING' && fill < 0 && k + cfg.expiry < n) { s.state = 'EXPIRED'; s.exitT = c[k + cfg.expiry].ct; }
          if (fill >= 0) { s.state = 'OPEN'; s.fillT = c[fill].t;
            for (let u = fill; u < n; u++) { const x = c[u], hs = d > 0 ? x.l <= slP : x.h >= slP, ht = d > 0 ? x.h >= tp : x.l <= tp;
              if (hs) { s.state = 'LOSS'; s.exitP = slP; s.exitT = x.ct; break; }
              if (ht && u > fill) { s.state = 'WIN'; s.exitP = tp; s.exitT = x.ct; break; }
              if (u - fill >= cfg.hold) { s.state = 'TIME'; s.exitP = x.c; s.exitT = x.ct; break; } }
            if (s.exitP != null) { s.pts = d * (s.exitP - entry) - spread; s.r = s.pts / risk; } }
          out.push(s); break;
        }
      }
    }
    return out;
  }
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1, MISSED: 1, EXPIRED: 1, INVALID: 1 };
  return { run, CFG, FINAL, version: 'song15-2026-11-05' };
});
