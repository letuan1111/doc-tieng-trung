/* Mô hình "🔁 EMA hồi" — rút ra khi tua từng nến M15 vàng 27/10 → 05/11/2026 (sóng giảm 106 giá 30/10, sóng tăng 122 giá 04/11). Chuỗi bắt buộc:
 *  1. Xu hướng: EMA34 M30 trên EMA89 (chỉ BUY) / dưới (chỉ SELL). (EMA M30 ổn định hơn M15: research/emaTF.mjs)
 *  2. Giá HỒI về vùng EMA34 (chạm EMA34, không thủng EMA89 quá 1 ATR) và QUÉT thanh khoản: đáy hồi thủng đáy swing M5 trước đó (SSL) — SELL: đỉnh hồi vượt đỉnh swing (BSL).
 *  3. PHÁ VỠ cấu trúc M5 theo xu hướng (MSS/BOS): nến M5 đóng cửa vượt đỉnh/đáy swing gần nhất trước điểm hồi.
 *  4. Nhịp phá vỡ có FVG M5 → VÀO NGAY giá đóng nến phá · SL ngoài đáy/đỉnh quét + 0.3 ATR M15 + spread · TP 2R · giữ tối đa 2 ngày.
 *  Kiểm tra (research/emastrict.mjs, 0.02 lot): 10 ngày gần 17 lệnh thắng 71% +802 USD · 12 tháng 677 lệnh thắng 35% +3652 USD
 *  (6 tháng trước +3660, 6 tháng gần −8: mạnh khi có xu hướng rõ, hoà khi đi ngang).
 *  SMC: ghi kiểu phá vỡ CHoCH/BOS, bắt buộc Order Block (nến ngược chiều cuối cùng tại điểm hồi), bỏ lệnh SL > 30 giá (0.02 lot mất tối đa ~60 USD).
 *  Telegram chỉ gửi lệnh trong các giờ VN CFG.tgHours (thắng cao nhất, chạm TP nhiều nhất); mọi lệnh vẫn ghi nhật ký.
 */
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.EMAPB = E; })(typeof self !== 'undefined' ? self : this, function () {
  const CFG = { look: 36, L: 2, touch: 0.1, deep: 1.0, slATR: 0.3, rr: 2, holdMs: 2 * 864e5, needSweep: true, needFVG: true, needOB: true, maxSL: 30, emaTF: 'm30', // SMC: bắt buộc Order Block tại điểm hồi · bỏ lệnh SL > 30 giá
    // giờ VN gửi Telegram: thắng ≥ 43% trong 12 tháng (research/tghours.mjs: 192 lệnh, thắng 48%, lời cả 2 nửa năm) — giờ khác chỉ ghi nhật ký
    tgHours: [0, 8, 11, 12, 14, 17, 20, 21] };
  function resample(c, ms) { const out = []; let cur = null; for (const x of c) { const s = Math.floor(x.t / ms) * ms; if (!cur || cur.t !== s) { if (cur) out.push(cur); cur = { t: s, ct: s + ms, o: x.o, h: x.h, l: x.l, c: x.c, last: x.ct }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.ct; } } if (cur && cur.last >= cur.ct) out.push(cur); return out; }
  function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function pivots(c, L) { const H = [], Lw = []; for (let i = L; i < c.length - L; i++) { let ph = true, pl = true; for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; } if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lw.push({ i, p: c[i].l, conf: i + L }); } return { H, L: Lw }; }
  function mapHTF(c, H, vals) { const out = new Array(c.length).fill(null); let j = -1; for (let i = 0; i < c.length; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) out[i] = vals[j]; } return out; }
  // D = { m5, m15 } nến đã đóng (M15 nên ≥ 300 nến để EMA89 ổn định)
  function run(D, opt) {
    opt = opt || {}; const cfg = { ...CFG, ...(opt.cfg || {}) }, c = D.m5, spread = opt.spread || 0, out = [];
    if (!c || c.length < 150 || !D.m15 || D.m15.length < 120) return out;
    const EC = D.emaC || (cfg.emaTF === 'm30' ? resample(D.m15, 18e5) : D.m15), n = c.length, cl = EC.map(x => x.c), E34 = mapHTF(c, EC, ema(cl, 34)), E89 = mapHTF(c, EC, ema(cl, 89)), AT = mapHTF(c, D.m15, atr(D.m15)); // EMA34/89 theo khung D.emaC (mặc định M15)
    const pv = pivots(c, cfg.L), used = new Set(); let ih = 0, il = 0; const sh = [], sl = [];
    for (let k = 100; k < n; k++) {
      while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
      const a = AT[k]; if (!(a > 0) || E34[k] == null) continue;
      for (const d of [1, -1]) {
        if (!(d > 0 ? E34[k] > E89[k] : E34[k] < E89[k])) continue;
        let pi = k - 1; for (let u = Math.max(1, k - cfg.look); u < k; u++) if (d > 0 ? c[u].l < c[pi].l : c[u].h > c[pi].h) pi = u;
        const pP = d > 0 ? c[pi].l : c[pi].h; if (used.has(pi * d) || E34[pi] == null) continue;
        const touch = d > 0 ? pP <= E34[pi] + cfg.touch * a : pP >= E34[pi] - cfg.touch * a, deep = d > 0 ? pP < E89[pi] - cfg.deep * a : pP > E89[pi] + cfg.deep * a;
        if (!touch || deep) continue;
        const P = (d > 0 ? sh : sl).filter(q => q.i < pi && q.i >= pi - 30).slice(-1)[0]; if (!P) continue;
        if (!(d > 0 ? c[k].c > P.p && c[k - 1].c <= P.p : c[k].c < P.p && c[k - 1].c >= P.p)) continue;
        used.add(pi * d);
        const prev = (d > 0 ? sl : sh).filter(q => q.i < pi && q.i >= pi - 40).slice(-1)[0], swept = !!(prev && (d > 0 ? pP < prev.p : pP > prev.p));
        if (cfg.needSweep && !swept) continue; // bắt buộc quét SSL (BUY) / BSL (SELL)
        let f = null; for (let m = pi + 2; m <= k; m++) { const bot = d > 0 ? c[m - 2].h : c[m].h, top = d > 0 ? c[m].l : c[m - 2].l; if (top > bot) f = { top, bot }; }
        if (cfg.needFVG && !f) continue; // bắt buộc có FVG trong nhịp phá vỡ
        // SMC: kiểu phá vỡ (CHoCH = đổi tính chất: trước điểm hồi cấu trúc M5 đi ngược / BOS = tiếp diễn), Order Block tại điểm hồi, Premium/Discount M30
        const hiB = (d > 0 ? sh : sl).filter(q => q.i < pi && q.i >= pi - 60), loB = (d > 0 ? sl : sh).filter(q => q.i < pi && q.i >= pi - 60);
        const lowerHighs = hiB.length >= 2 && (d > 0 ? hiB[hiB.length - 1].p < hiB[hiB.length - 2].p : hiB[hiB.length - 1].p > hiB[hiB.length - 2].p);
        const breakType = lowerHighs ? 'CHoCH' : 'BOS';
        let ob = null; for (let u = pi; u >= Math.max(0, pi - 3); u--) if (d * (c[u].c - c[u].o) < 0) { ob = { top: Math.max(c[u].o, c[u].c), bot: Math.min(c[u].o, c[u].c), hi: c[u].h, lo: c[u].l }; break; }
        let rHi = -Infinity, rLo = Infinity; for (let u = Math.max(0, k - 288); u <= k; u++) { rHi = Math.max(rHi, c[u].h); rLo = Math.min(rLo, c[u].l); } // dealing range 24 giờ
        const pd = rHi > rLo ? (d > 0 ? (c[k].c - rLo) / (rHi - rLo) : (rHi - c[k].c) / (rHi - rLo)) : 0.5; // 0 = discount sâu (BUY) / premium cao (SELL)
        if (cfg.needOB && !ob) continue;
        if (cfg.breakType && cfg.breakType !== breakType) continue;
        if (cfg.pdMax != null && pd > cfg.pdMax) continue;
        const entry = c[k].c, slP = pP - d * (cfg.slATR * a + spread), risk = Math.abs(entry - slP); if (!(risk > 0)) continue;
        if (cfg.maxSL && risk > cfg.maxSL) continue;
        const tp = entry + d * cfg.rr * risk;
        const s = { id: `e5-${c[k].t}-${d > 0 ? 'B' : 'S'}`, tf: 'm5', model: 'EMA hồi', grade: 'E', side: d, t: c[k].t, ct: c[k].ct, entry, sl: slP, tp, risk, rr: cfg.rr,
          sweep: pP, sweepName: swept ? (d > 0 ? 'SSL (đáy hồi)' : 'BSL (đỉnh hồi)') : (d > 0 ? 'đáy hồi EMA34' : 'đỉnh hồi EMA34'), origin: pP, fvg: f, spread,
          ema34: E34[k], ema89: E89[k], breakType, ob, pd: +pd.toFixed(2), emaTF: D.emaC ? 'tuỳ chọn' : cfg.emaTF.toUpperCase(), hour: (new Date(c[k].t).getUTCHours() + 7) % 24, tgOK: cfg.tgHours.includes((new Date(c[k].t).getUTCHours() + 7) % 24), pullT: c[pi].t, state: 'OPEN', fillT: c[k].t, exitT: null, exitP: null, r: null, pts: null };
        for (let u = k + 1; u < n; u++) { const x = c[u];
          if (d > 0 ? x.l <= slP : x.h >= slP) { s.state = 'LOSS'; s.exitP = slP; s.exitT = x.ct; break; }
          if (d > 0 ? x.h >= tp : x.l <= tp) { s.state = 'WIN'; s.exitP = tp; s.exitT = x.ct; break; }
          if (x.t - s.fillT >= cfg.holdMs) { s.state = 'TIME'; s.exitP = x.c; s.exitT = x.ct; break; } }
        if (s.exitP != null) { s.pts = d * (s.exitP - entry) - spread; s.r = s.pts / risk; }
        out.push(s);
      }
    }
    return out;
  }
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1 };
  return { run, CFG, FINAL, version: 'emapb4-2026-11-05', telegram: true };
});
