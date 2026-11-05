/* Mô hình "🧲 Test EMA21 M30" — cách có tỷ lệ thắng cao nhất khi kiểm 12 tháng vàng (research/emaquick.mjs, ema21final.mjs). Chuỗi bắt buộc:
 *  1. Xu hướng M30: EMA34 M30 > EMA89 M30 (chỉ BUY) / < (chỉ SELL), và ≥ 6 nến M30 liên tiếp đóng cửa cùng phía EMA21 M30.
 *  2. Trong cây nến M30 kế tiếp, giá hồi CHẠM EMA21 M30 (không xuyên quá 0.8 ATR M15).
 *  3. Xác nhận M5: nến M5 đóng cửa quay lại phía xu hướng của EMA21 và thân nến cùng chiều (chờ tối đa 6 nến M5 sau khi hết cây M30) → VÀO NGAY.
 *  4. SL ngoài râu chạm thấp/cao nhất + 0.3 ATR M15 (+ spread với SELL), SL 0.5–15 giá · TP 1R · giữ tối đa 12 giờ · mỗi lần 1 lệnh.
 *  5. Bỏ các cây M30 bắt đầu lúc 8h và 23h giờ VN (dính SL nhiều ở cả 2 nửa năm).
 *  Kiểm 12 tháng (0.02 lot, spread 0.35): 324 lệnh (1.2/ngày), thắng 56%, +724 USD, sụt tối đa 134 USD, thua liên tiếp tối đa 5.
 */
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.EMA21 = E; })(typeof self !== 'undefined' ? self : this, function () {
  const CFG = { p: 21, run: 6, maxPierce: 0.8, wait: 6, pad: 0.3, rr: 1, minSL: 0.5, maxSL: 15, holdBars: 144, badHours: [8, 23] };
  function resample(c, ms) { const out = []; let cur = null; for (const x of c) { const s = Math.floor(x.t / ms) * ms; if (!cur || cur.t !== s) { if (cur) out.push(cur); cur = { t: s, ct: s + ms, o: x.o, h: x.h, l: x.l, c: x.c, last: x.ct }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.ct; } } if (cur && cur.last >= cur.ct) out.push(cur); return out; }
  function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function mapHTF(c, H, vals) { const out = new Array(c.length).fill(null); let j = -1; for (let i = 0; i < c.length; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) out[i] = vals[j]; } return out; }
  const hrVN = (t) => (new Date(t).getUTCHours() + 7) % 24;
  // D = { m5, m15 } nến đã đóng (M15 ≥ 300 nến để EMA89 M30 ổn định)
  function run(D, opt) {
    opt = opt || {}; const cfg = { ...CFG, ...(opt.cfg || {}) }, m5 = D.m5, SP = opt.spread || 0, out = [];
    if (!m5 || m5.length < 50 || !D.m15 || D.m15.length < 300) return out;
    const C = resample(D.m15, 18e5), cc = C.map(x => x.c), E = ema(cc, cfg.p), E34 = ema(cc, 34), E89 = ema(cc, 89), At = mapHTF(C, D.m15, atr(D.m15));
    const i5 = new Map(m5.map((x, j) => [x.t, j])), n5 = m5.length; let side = 0, runN = 0, busyT = 0;
    for (let i = 120; i < C.length - 1; i++) {
      const s = Math.sign(C[i].c - E[i]); if (s === side) runN++; else { side = s; runN = 1; }
      if (C[i + 1].t < busyT || runN < cfg.run) continue; const d = side, a = At[i], lvl = E[i];
      if (!(a > 0) || Math.sign(E34[i] - E89[i]) !== d) continue; if (cfg.badHours.includes(hrVN(C[i + 1].t))) continue;
      const j0 = i5.get(C[i + 1].t); if (j0 == null) continue; const jEnd = j0 + 6;
      let jc = -1, touched = -1, ex = null, touchT = null;
      for (let j = j0; j < jEnd + cfg.wait && j < n5; j++) { const y = m5[j];
        if (touched < 0) { if (j >= jEnd) break; if (d > 0 ? y.l <= lvl : y.h >= lvl) { touched = j; ex = d > 0 ? y.l : y.h; touchT = y.t; } else continue; }
        ex = d > 0 ? Math.min(ex, y.l) : Math.max(ex, y.h); if (d * (ex - lvl) < -cfg.maxPierce * a) break;
        if (d * (y.c - lvl) > 0 && d * (y.c - y.o) > 0) { jc = j; break; } }
      if (jc < 0) continue;
      const y = m5[jc], entry = d > 0 ? y.c + SP : y.c, slP = ex - d * (cfg.pad * a + (d < 0 ? SP : 0)), risk = d * (entry - slP);
      if (!(risk > cfg.minSL) || risk > cfg.maxSL) continue;
      const tp = entry + d * cfg.rr * risk;
      const sg = { id: `t21-${y.t}-${d > 0 ? 'B' : 'S'}`, tf: 'm5', model: 'Test EMA21 M30', grade: 'R', side: d, t: y.t, ct: y.ct, entry, sl: slP, tp, risk, rr: cfg.rr, spread: SP,
        ema21: lvl, ema34: E34[i], ema89: E89[i], m30T: C[i + 1].t, touchT, touchP: ex, sweep: ex, sweepName: d > 0 ? 'râu chạm EMA21 M30' : 'râu chạm EMA21 M30', fvg: null,
        hour: hrVN(y.ct), tgOK: true, state: 'OPEN', fillT: y.ct, exitT: null, exitP: null, r: null, pts: null };
      let u = jc + 1; for (; u < Math.min(n5, jc + 1 + cfg.holdBars); u++) { const x = m5[u], lo = d > 0 ? x.l : x.l + SP, hi = d > 0 ? x.h : x.h + SP;
        if (d > 0 ? lo <= slP : hi >= slP) { sg.state = 'LOSS'; sg.exitP = slP; sg.exitT = x.ct; break; }
        if (d > 0 ? hi >= tp : lo <= tp) { sg.state = 'WIN'; sg.exitP = tp; sg.exitT = x.ct; break; } }
      if (sg.state === 'OPEN' && u >= jc + 1 + cfg.holdBars && u - 1 < n5) { const x = m5[u - 1]; sg.state = 'TIME'; sg.exitP = d > 0 ? x.c : x.c + SP; sg.exitT = x.ct; }
      if (sg.exitP != null) { sg.pts = d * (sg.exitP - entry); sg.r = sg.pts / risk; }
      busyT = sg.exitT || Infinity; runN = 0; out.push(sg);
    }
    return out;
  }
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1 };
  return { run, CFG, FINAL, version: 't21-2026-11-05', telegram: true };
});
