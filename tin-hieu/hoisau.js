/* 🎯 HỒI SÂU QUA EMA89 (vàng M15) — kèo hiếm trong kế hoạch giao dịch của Letuan (research/ema-hoi.mjs, mục W4)
 *  1. Xu hướng: EMA34 > EMA89 M15 → chỉ BUY (ngược lại SELL).
 *  2. Giá hồi QUÁ SÂU: nến M15 đóng ở phía ngược của EMA89 ≥ 12 giá (BUY: giá ≤ EMA89 − 12).
 *  3. Kích hoạt ICT: nến M15 quét đáy (đỉnh) swing M15 gần nhất (≤ 6h, còn nguyên) rồi ĐÓNG lại trên (dưới) → vào ngay giá đóng.
 *  4. SL ngoài râu quét + 0.2 ATR, tối thiểu 12 giá, bỏ nếu > 20 giá · TP 12 giá · giữ ≤ 24h · mỗi lúc 1 lệnh.
 *  Kiểm vàng Dukascopy 2 năm, 0.02 lot: năm 1 11 lệnh thắng 55% +24$ · năm 2 28 lệnh thắng 68% +221$ — ~1 lệnh / 10 ngày, mẫu nhỏ.
 */
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.HOISAU = E; })(typeof self !== 'undefined' ? self : this, function () {
  const NAME = 'Hồi sâu qua EMA89', version = 'hs-2026-11-11';
  const CFG = { deep: 12, tp: 12, minSL: 12, maxSL: 20, pad: 0.2, hold: 96, look: 24 };
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1 };
  const RULE = 'EMA34/89 M15 cùng chiều · giá hồi qua EMA89 ≥ 12 giá · nến M15 quét swing M15 rồi đóng lại → vào ngay · SL ngoài râu (12–20 giá) · TP 12 giá · giữ ≤ 24h';
  function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function pivots(c, L) { const H = [], Lw = []; for (let i = L; i < c.length - L; i++) { let ph = true, pl = true; for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; } if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lw.push({ i, p: c[i].l, conf: i + L }); } return { H, L: Lw }; }
  function run(D, opt) {
    opt = opt || {}; const SP = opt.spread || 0, c = D.m15, out = []; if (!c || c.length < 200) return out;
    const n = c.length, e34 = ema(c.map(x => x.c), 34), e89 = ema(c.map(x => x.c), 89), A = atr(c), pv = pivots(c, 2); let busy = -1;
    for (let k = 120; k < n; k++) { const x = c[k], a = A[k];
      for (const d of [1, -1]) {
        if (k <= busy || d * (e34[k] - e89[k]) <= 0 || d * (x.c - e89[k]) > -CFG.deep) continue;
        const sw = (d > 0 ? pv.L : pv.H).filter(q => q.conf <= k - 1 && q.i >= k - CFG.look && q.i < k).slice(-1)[0]; if (!sw) continue;
        let fresh = true; for (let u = sw.i + 1; u < k; u++) if (d > 0 ? c[u].l < sw.p : c[u].h > sw.p) { fresh = false; break; }
        if (!fresh || !(d > 0 ? x.l < sw.p && x.c > sw.p : x.h > sw.p && x.c < sw.p)) continue;
        const ext = d > 0 ? x.l : x.h, entry = x.c + (d > 0 ? SP : 0); let sl = ext - d * CFG.pad * a + (d < 0 ? SP : 0), risk = d * (entry - sl);
        if (risk < CFG.minSL) { risk = CFG.minSL; sl = entry - d * risk; } if (risk > CFG.maxSL) continue;
        const tp = entry + d * CFG.tp;
        const s = { id: `hs-${x.t}-${d > 0 ? 'B' : 'S'}`, tf: 'm15', model: NAME, grade: 'H', side: d, t: x.t, ct: x.ct, entry, sl, tp, risk, rr: +(CFG.tp / risk).toFixed(2), spread: SP,
          sweep: ext, sweepName: `${d > 0 ? 'đáy' : 'đỉnh'} swing M15 ${sw.p.toFixed(2)}`, ema34: e34[k], ema89: e89[k],
          info: [`EMA34 ${e34[k].toFixed(2)} ${d > 0 ? '>' : '<'} EMA89 ${e89[k].toFixed(2)} (M15)`, `giá hồi qua EMA89 ${Math.abs(x.c - e89[k]).toFixed(1)} giá`, `quét ${d > 0 ? 'đáy' : 'đỉnh'} swing M15 ${sw.p.toFixed(2)} (râu ${ext.toFixed(2)}) rồi đóng lại`],
          hour: (new Date(x.ct).getUTCHours() + 7) % 24, tgOK: true, state: 'OPEN', fillT: x.ct, exitT: null, exitP: null, r: null, pts: null };
        let u = k + 1; for (; u < Math.min(n, k + CFG.hold); u++) { const y = c[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
          if (d > 0 ? lo <= sl : hi >= sl) { s.state = 'LOSS'; s.exitP = sl; s.exitT = y.ct; break; } if (d > 0 ? hi >= tp : lo <= tp) { s.state = 'WIN'; s.exitP = tp; s.exitT = y.ct; break; } }
        if (s.state === 'OPEN' && k + CFG.hold < n) { const y = c[k + CFG.hold - 1]; s.state = 'TIME'; s.exitP = d > 0 ? y.c : y.c + SP; s.exitT = y.ct; u = k + CFG.hold - 1; }
        if (s.exitP != null) { s.pts = d * (s.exitP - entry); s.r = s.pts / risk; }
        busy = s.state === 'OPEN' ? Infinity : u; out.push(s); break; }
    }
    return out;
  }
  return { run, CFG, FINAL, RULE, NAME, version, telegram: true };
});
