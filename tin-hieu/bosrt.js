/* 🔂 BOS M5 + retest — chiến lược của Letuan (kiểm 1 năm: research/bosretest.mjs, bosretest-hours.mjs, bosretest-filter.mjs)
 *  1. Xu hướng M30: EMA34 > EMA89 và nến M30 đóng trên EMA34 → chỉ BUY (ngược lại chỉ SELL).
 *  2. Nến M5 đóng PHÁ đỉnh swing M5 gần nhất (swing 3 nến mỗi bên, chưa bị phá, trong 12h) → đặt LIMIT ngay tại mức vừa phá.
 *  3. Chờ giá quay lại TEST mức phá tối đa 6 giờ. Huỷ nếu giá thủng đáy swing trước khi test.
 *  4. SL = đáy swing low của chân phá (BUY) / đỉnh swing high (SELL), + spread với SELL · TP = 1.2R · giữ tối đa 24h · mỗi lần 1 lệnh.
 *  5. Vàng: bỏ nến cuối tuần (thứ 7 04h → thứ 2 05h VN, Exness đóng cửa; OKX vẫn chạy nên tạo BOS giả).
 *  6. KHÔNG khớp lệnh trong giờ thua (giờ VN): vàng 1, 2, 4, 6, 8, 11, 15, 17h · BTC 2, 3, 5, 6, 7, 12, 13, 17, 19h → giá test trong giờ cấm thì bỏ lệnh và đứng ngoài tới khi lệnh đó (lệnh ảo) kết thúc.
 *  Kiểm (0.02 lot, TP 1.2R → cần thắng > 45% mới có lời):
 *   vàng Dukascopy năm 11/2025–11/2026: 715 lệnh, thắng 49%, +62R · năm 11/2024–10/2025 (giờ cấm KHÔNG chọn trên năm này): 748 lệnh, thắng 44%, −20R (không cấm giờ: −52R)
 *   vàng OKX 12 tháng (bỏ cuối tuần): thắng 45%, −9R · BTC OKX 12 tháng: 984 lệnh, 3.7/ngày, thắng 48%, +58R
 *   → lợi thế mỏng, phụ thuộc giai đoạn: theo dõi tỷ lệ thắng thật trên web trước khi vào tiền thật.
 */
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.BOSRT = E; })(typeof self !== 'undefined' ? self : this, function () {
  const BAD = { XAU: [1, 2, 4, 6, 8, 11, 15, 17], BTC: [2, 3, 5, 6, 7, 12, 13, 17, 19] };
  const CFG = { L: 3, maxAge: 144, wait: 72, rr: 1.2, minRiskA: 0.2, maxRiskA: 4, holdBars: 288, ghostBusy: true };
  const BACKTEST = {
    XAU: 'vàng Dukascopy (gần giá Exness): năm gần nhất 715 lệnh, thắng 49%, +62R; năm trước đó 748 lệnh, thắng 44%, −20R · OKX 12 tháng (bỏ cuối tuần) thắng 45%, −9R → lợi thế mỏng, cần thắng > 45%',
    BTC: '1 năm BTC (OKX, spread 20): 984 lệnh · 3.7/ngày · thắng 48% (hoà vốn 45%) · +719$ (0.02 lot) · +58R' };
  const VN = 7 * 36e5, hrVN = (t) => new Date(t + VN).getUTCHours();
  // giờ mở cửa vàng như Exness: thứ 2 05:00 VN → thứ 7 04:00 VN — nguồn OKX chạy 24/7 nên bỏ nến cuối tuần (BOS giả)
  const goldOpen = (t) => { const d = new Date(t + VN), wd = d.getUTCDay(), h = d.getUTCHours(); return wd === 0 ? false : wd === 6 ? h < 4 : wd === 1 ? h >= 5 : true; };
  function resample(c, ms) { const out = []; let cur = null; for (const x of c) { const s = Math.floor(x.t / ms) * ms; if (!cur || cur.t !== s) { if (cur) out.push(cur); cur = { t: s, ct: s + ms, o: x.o, h: x.h, l: x.l, c: x.c, last: x.ct }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.ct; } } if (cur && cur.last >= cur.ct) out.push(cur); return out; }
  function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function mapHTF(c, H, vals) { const out = new Array(c.length).fill(null); let j = -1; for (let i = 0; i < c.length; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) out[i] = vals[j]; } return out; }
  function pivots(c, L) { const H = [], Lw = []; for (let i = L; i < c.length - L; i++) { let ph = true, pl = true; for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; } if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lw.push({ i, p: c[i].l, conf: i + L }); } return { H, L: Lw }; }

  // D = { m5, m15 } nến đã đóng · opt = { spread, sym: 'XAU'|'BTC', cfg }
  function run(D, opt) {
    opt = opt || {}; const cfg = { ...CFG, ...(opt.cfg || {}) }, SP = opt.spread || 0, bad = cfg.badHours || BAD[opt.sym] || BAD.XAU, wk = opt.sym !== 'BTC' && cfg.weekend !== true;
    const m5 = (D.m5 || []).filter(x => !wk || goldOpen(x.t)), m15 = (D.m15 || []).filter(x => !wk || goldOpen(x.t)), n = m5.length, out = [];
    if (n < 200 || m15.length < 200) return out;
    const m30 = resample(m15, 18e5), c30 = m30.map(x => x.c), E34 = mapHTF(m5, m30, ema(c30, 34)), E89 = mapHTF(m5, m30, ema(c30, 89)), C30 = mapHTF(m5, m30, c30), A15 = mapHTF(m5, m15, atr(m15));
    const trend = (k) => { if (E34[k] == null) return 0; const d = Math.sign(E34[k] - E89[k]); return d && d * (C30[k] - E34[k]) > 0 ? d : 0; };
    const pv = pivots(m5, cfg.L), H = [], Lw = [], usedH = new Set(), usedL = new Set(); let ih = 0, il = 0, busy = -1;
    for (let k = 60; k < n; k++) {
      while (ih < pv.H.length && pv.H[ih].conf <= k - 1) H.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k - 1) Lw.push(pv.L[il++]);
      const d = trend(k), y = m5[k]; if (!d || !(A15[k] > 0)) continue;
      const S = d > 0 ? H : Lw, U = d > 0 ? usedH : usedL, q = S.length ? S[S.length - 1] : null; if (!q || U.has(q.i) || k - q.i > cfg.maxAge) continue;
      if (d * (y.c - q.p) <= 0) continue; U.add(q.i);
      let ext = d > 0 ? Infinity : -Infinity; for (let u = q.i; u <= k; u++) ext = d > 0 ? Math.min(ext, m5[u].l) : Math.max(ext, m5[u].h);
      if (k <= busy) continue; // đang có lệnh BOS M5 khác
      const a = A15[k], lvl = q.p, sl = ext - d * (d < 0 ? SP : 0), plan = d * (lvl - sl), tp0 = lvl + d * cfg.rr * plan;
      const sg = { id: `bos5-${y.t}-${d > 0 ? 'B' : 'S'}`, tf: 'm5', model: 'BOS M5 + retest', grade: 'K', side: d, t: y.t, ct: y.ct, entry: lvl, sl, tp: tp0, risk: plan, rr: cfg.rr, spread: SP,
        lvl, swingT: m5[q.i].t, ema34: E34[k], ema89: E89[k], hour: hrVN(y.ct), badHours: bad, expT: y.ct + cfg.wait * 3e5, sweep: lvl, sweepName: d > 0 ? 'phá đỉnh swing M5' : 'phá đáy swing M5', fvg: null,
        tgOK: true, state: 'PENDING', fillT: null, exitT: null, exitP: null, r: null, pts: null };
      out.push(sg);
      if (!(plan > cfg.minRiskA * a) || plan > cfg.maxRiskA * a) { sg.state = 'SKIP'; sg.tgOK = false; sg.why = `SL ${plan.toFixed(2)} ngoài khoảng 0.2–4 ATR M15`; continue; }
      let fill = -1, entry = null;
      for (let u = k + 1; u < Math.min(n, k + 1 + cfg.wait); u++) { const z = m5[u];
        if (d > 0 ? z.l + SP <= lvl : z.h >= lvl) { fill = u; entry = d > 0 ? Math.min(lvl, z.o + SP) : Math.max(lvl, z.o); break; }
        if (d > 0 ? z.l <= sl : z.h + SP >= sl) { fill = -2; sg.state = 'INVALID'; sg.why = 'thủng swing trước khi test'; sg.exitT = z.ct; break; } }
      if (fill === -2) continue;
      if (fill < 0) { if (k + cfg.wait < n) { sg.state = 'EXPIRED'; sg.why = 'không quay lại test trong 6h'; sg.exitT = m5[Math.min(n - 1, k + cfg.wait)].ct; } continue; }
      const fh = hrVN(m5[fill].t), skipBad = bad.includes(fh);
      const risk = d * (entry - sl); if (!(risk > 0)) { sg.state = 'SKIP'; sg.why = 'giá mở vượt SL'; continue; }
      const tp = entry + d * cfg.rr * risk; Object.assign(sg, { entry, risk, tp, state: 'OPEN', fillT: m5[fill].t, fillHour: fh });
      let u = fill, res = null; { const z = m5[u]; if (d > 0 ? z.l <= sl : z.h + SP >= sl) { res = 'LOSS'; sg.exitP = sl; sg.exitT = z.ct; } } u++;
      for (; !res && u < Math.min(n, fill + 1 + cfg.holdBars); u++) { const z = m5[u], lo = d > 0 ? z.l : z.l + SP, hi = d > 0 ? z.h : z.h + SP;
        if (d > 0 ? lo <= sl : hi >= sl) { res = 'LOSS'; sg.exitP = sl; sg.exitT = z.ct; break; } if (d > 0 ? hi >= tp : lo <= tp) { res = 'WIN'; sg.exitP = tp; sg.exitT = z.ct; break; } }
      if (!res && u >= fill + 1 + cfg.holdBars && u - 1 < n) { const z = m5[u - 1]; res = 'TIME'; sg.exitP = d > 0 ? z.c : z.c + SP; sg.exitT = z.ct; }
      if (res) { sg.state = res; sg.pts = d * (sg.exitP - entry); sg.r = sg.pts / risk; busy = u; } else busy = Infinity;
      // giá test trong giờ cấm: KHÔNG vào lệnh, và đứng ngoài tới khi lệnh đó (lệnh ảo) kết thúc — đúng như bản đã kiểm
      if (skipBad) { sg.ghost = { state: sg.state, r: sg.r, exitT: sg.exitT }; Object.assign(sg, { state: 'SKIP', tgOK: false, why: `giá test lúc ${fh}h (giờ cấm) — đứng ngoài tới ${sg.exitT ? new Date(sg.exitT + VN).toISOString().slice(11, 16) : 'khi lệnh ảo đóng'}`, entry: lvl, r: null, pts: null, exitP: null, fillT: null }); if (!cfg.ghostBusy) busy = -1; }
    }
    return out;
  }
  function stats(L) { const C = L.filter(t => t.state === 'WIN' || t.state === 'LOSS' || t.state === 'TIME'), w = C.filter(t => t.state === 'WIN').length, l = C.filter(t => t.state === 'LOSS').length;
    const R = C.reduce((a, t) => a + (t.r || 0), 0), hours = {}; for (const t of C) { const h = t.fillHour != null ? t.fillHour : new Date((t.fillT || t.ct) + VN).getUTCHours(); const x = hours[h] = hours[h] || { n: 0, w: 0, l: 0, R: 0 }; x.n++; if (t.state === 'WIN') x.w++; if (t.state === 'LOSS') x.l++; x.R += t.r || 0; }
    const days = C.length ? Math.max(1, (Math.max(...C.map(t => t.exitT || t.ct)) - Math.min(...C.map(t => t.fillT || t.ct))) / 864e5 * 5 / 7) : 1;
    let eq = 0, pk = 0, dd = 0; for (const t of C) { eq += t.r || 0; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
    return { n: C.length, w, l, time: C.length - w - l, win: C.length ? w / C.length : 0, R, perDay: C.length / days, dd, hours, pending: L.filter(t => t.state === 'PENDING').length, open: L.filter(t => t.state === 'OPEN').length, cancel: L.filter(t => /EXPIRED|INVALID|SKIP/.test(t.state)).length }; }
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1, EXPIRED: 1, INVALID: 1, SKIP: 1 };
  return { run, stats, CFG, BAD, BACKTEST, FINAL, version: 'bos5-2026-11-07b', telegram: true };
});
