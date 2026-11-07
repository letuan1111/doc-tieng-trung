/* 💧 QUÉT BIÊN TÍCH LŨY (vàng M5) — bản qb-2026-11-08
 * Rút ra từ tua 30 ngày + kiểm 12 tháng (research/box-tpsl.mjs, qb-m1.mjs): phần lớn sóng ≥ 15 giá bắt đầu bằng
 * "đi ngang → quét một đầu → chạy về đầu kia", khi giá đang ở phía ngược EMA34.
 * Luật vào lệnh:
 *  1. Tích lũy: 2 giờ trước (24 nến M5) biên độ < 3 ATR M15 và ≥ 5 giá.
 *  2. Quét biên: nến M5 có râu xuyên đáy (đỉnh) vùng ≥ 0.4 ATR M15 rồi ĐÓNG CỬA quay lại trong vùng → BUY (SELL) ngay khi nến đóng.
 *  3. Lọc EMA: giá chưa vượt EMA34 M15 quá 0.3 ATR theo chiều lệnh (sóng đảo chiều bắt đầu từ phía ngược EMA).
 *  4. SL ngoài râu quét + 0.3 ATR M15 (+ spread với SELL), tối đa 15 giá · TP = 2R · giữ tối đa 4 giờ · mỗi lúc 1 lệnh.
 * Thông tin kèm (KHÔNG bắt buộc — kiểm 12 tháng cho thấy bắt buộc thì kém hơn): quét SSL/BSL swing M5, nến đảo chiều,
 * EMA34/89 M30, CHoCH M5 và FVG M5 sau khi vào.
 * Kiểm 12 tháng Dukascopy (spread 0.35, 0.02 lot): 176 lệnh, chạm TP 36%, +856 USD, sụt tối đa 215 USD, lời cả 2 nửa năm (+268 / +588).
 */
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.QUETBIEN = E; })(typeof self !== 'undefined' ? self : this, function () {
  const CFG = { box: 24, boxATR: 3, minBox: 5, pierce: 0.4, emaSide: 0.3, pad: 0.3, maxSL: 15, rr: 2, holdBars: 48 };
  const NAME = 'Quét biên tích lũy', version = 'qb-2026-11-08';
  const BACKTEST = '12 tháng vàng (Dukascopy, spread 0.35): 176 lệnh, chạm TP 36%, +856 USD (0.02 lot), sụt tối đa 215 USD, lời cả 2 nửa năm';
  function resample(c, ms) { const out = []; let cur = null; for (const x of c) { const s = Math.floor(x.t / ms) * ms; if (!cur || cur.t !== s) { if (cur) out.push(cur); cur = { t: s, ct: s + ms, o: x.o, h: x.h, l: x.l, c: x.c, last: x.ct }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.ct; } } if (cur && cur.last >= cur.ct) out.push(cur); return out; }
  function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function mapHTF(c, H, vals) { const out = new Array(c.length).fill(null); let j = -1; for (let i = 0; i < c.length; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) out[i] = vals[j]; } return out; }
  function pivots(c, L) { const H = [], Lw = []; for (let i = L; i < c.length - L; i++) { let ph = true, pl = true; for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; } if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lw.push({ i, p: c[i].l, conf: i + L }); } return { H, L: Lw }; }
  const hrVN = (t) => (new Date(t).getUTCHours() + 7) % 24;

  // D = { m5, m15 } nến đã đóng (M15 ≥ 300 nến để EMA89 M30 ổn định) · opt = { spread, cfg }
  function run(D, opt) {
    opt = opt || {}; const cfg = { ...CFG, ...(opt.cfg || {}) }, c = D.m5, SP = opt.spread || 0, out = [];
    if (!c || c.length < 60 || !D.m15 || D.m15.length < 100) return out;
    const n = c.length, m30 = resample(D.m15, 18e5), A = mapHTF(c, D.m15, atr(D.m15)), E15 = mapHTF(c, D.m15, ema(D.m15.map(x => x.c), 34));
    const E30a = mapHTF(c, m30, ema(m30.map(x => x.c), 34)), E30b = mapHTF(c, m30, ema(m30.map(x => x.c), 89)), pv = pivots(c, 2);
    let busy = 0;
    for (let k = cfg.box + 1; k < n; k++) {
      const x = c[k], a = A[k]; if (x.t < busy || !(a > 0) || E15[k] == null) continue;
      let hi = -Infinity, lo = Infinity; for (let u = k - cfg.box; u < k; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); }
      const w = hi - lo; if (!(w < cfg.boxATR * a && w >= cfg.minBox)) continue;
      let d = 0; if (x.l <= lo - cfg.pierce * a && x.c > lo) d = 1; else if (x.h >= hi + cfg.pierce * a && x.c < hi) d = -1; if (!d) continue;
      const side15 = d * (x.c - E15[k]) / a; if (side15 > cfg.emaSide) continue;
      const ext = d > 0 ? x.l : x.h, entry = d > 0 ? x.c + SP : x.c, sl = ext - d * (cfg.pad * a + (d < 0 ? SP : 0)), risk = d * (entry - sl);
      if (!(risk > 1) || risk > cfg.maxSL) continue;
      const tp = entry + d * cfg.rr * risk;
      // thông tin kèm
      const sw = (d > 0 ? pv.L : pv.H).filter(q => q.conf <= k - 1 && q.i >= k - 36 && (d > 0 ? ext < q.p : ext > q.p));
      const rg = x.h - x.l || 1e-9, wick = d > 0 ? Math.min(x.o, x.c) - x.l : x.h - Math.max(x.o, x.c);
      const tr30 = Math.sign(E30a[k] - E30b[k]);
      const info = [`vùng tích lũy 2h ${lo.toFixed(2)}–${hi.toFixed(2)} (${w.toFixed(1)} giá)`, `râu quét ${d > 0 ? 'đáy' : 'đỉnh'} xuyên ${Math.abs(d > 0 ? lo - ext : ext - hi).toFixed(1)} giá rồi đóng lại`];
      if (sw.length) info.push(`quét ${d > 0 ? 'SSL' : 'BSL'} swing M5 ${sw[sw.length - 1].p.toFixed(2)}`);
      info.push(wick / rg >= 0.5 ? 'nến pin bar (râu ≥ 50%)' : d * (x.c - x.o) > 0 ? 'nến đảo chiều đóng cùng hướng lệnh' : 'nến thường');
      info.push(`giá ${side15 < 0 ? 'ở phía ngược' : 'sát'} EMA34 M15 (${side15.toFixed(1)} ATR)`, `EMA34/89 M30 ${tr30 === d ? 'cùng chiều' : 'ngược chiều'}`);
      const s = { id: `qb-${x.t}-${d > 0 ? 'B' : 'S'}`, tf: 'm5', model: NAME, grade: 'Q', side: d, t: x.t, ct: x.ct, entry, sl, tp, risk, rr: cfg.rr, spread: SP,
        box: { hi, lo }, sweep: ext, sweepName: `${d > 0 ? 'đáy' : 'đỉnh'} vùng tích lũy ${(d > 0 ? lo : hi).toFixed(2)}`, ssl: sw.length > 0, ema15: E15[k], side15: +side15.toFixed(2), trend30: tr30,
        info, hour: hrVN(x.ct), tgOK: false, state: 'OPEN', fillT: x.ct, exitT: null, exitP: null, r: null, pts: null, after: [] };
      // theo dõi lệnh trên các nến M5 sau; ghi thêm CHoCH M5 / FVG M5 nếu xuất hiện (chỉ để xem)
      const opp = (d > 0 ? pv.H : pv.L).filter(q => q.conf <= k && q.i < k).slice(-1)[0]; let chT = null, fvT = null;
      let u = k + 1; for (; u < n && u <= k + cfg.holdBars; u++) { const z = c[u], l2 = d > 0 ? z.l : z.l + SP, h2 = d > 0 ? z.h : z.h + SP;
        if (d > 0 ? l2 <= sl : h2 >= sl) { s.state = 'LOSS'; s.exitP = sl; s.exitT = z.ct; break; }
        if (d > 0 ? h2 >= tp : l2 <= tp) { s.state = 'WIN'; s.exitP = tp; s.exitT = z.ct; break; }
        if (!chT && opp && (d > 0 ? z.c > opp.p : z.c < opp.p)) { chT = z.ct; s.after.push(`CHoCH M5 qua ${opp.p.toFixed(2)} lúc ${(hrVN(z.ct) + '').padStart(2, '0')}:${String(new Date(z.ct).getUTCMinutes()).padStart(2, '0')}`); }
        if (!fvT && u >= k + 2 && (d > 0 ? z.l > c[u - 2].h : z.h < c[u - 2].l)) { fvT = z.ct; s.after.push(`FVG M5 ${(d > 0 ? z.l - c[u - 2].h : c[u - 2].l - z.h).toFixed(1)} giá`); } }
      if (s.state === 'OPEN' && u > k + cfg.holdBars && u - 1 < n) { const z = c[u - 1]; s.state = 'TIME'; s.exitP = d > 0 ? z.c : z.c + SP; s.exitT = z.ct; }
      if (s.exitT) { s.pts = d * (s.exitP - entry); s.r = s.pts / risk; busy = s.exitT; } else busy = Infinity;
      out.push(s);
    }
    return out;
  }
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1 };
  const RULE = 'Tích lũy 2h (< 3 ATR M15) → nến M5 râu xuyên biên ≥ 0.4 ATR rồi đóng lại trong vùng → vào ngược ngay · giá chưa vượt EMA34 M15 quá 0.3 ATR · SL ngoài râu + 0.3 ATR (≤ 15 giá) · TP 2R · giữ ≤ 4h';
  return { run, CFG, FINAL, RULE, NAME, version, BACKTEST, telegram: false }; // thử nghiệm: năm 11/2024–11/2025 lỗ (−183 USD) → chỉ ghi nhật ký
});
