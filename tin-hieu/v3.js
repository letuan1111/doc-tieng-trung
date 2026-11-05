/* V3 — Cách vào lệnh ICT/SMC rút ra từ 12 tháng chart (XAU, BTC, ETH, tháng 10/2025 → 11/2026)
 * Chạy được trên trình duyệt (window.V3) và Node (require).
 *
 *  1. Thanh khoản: giá QUÉT đỉnh hôm trước (PDH) hoặc đáy hôm trước (PDL): râu vượt rồi đóng cửa quay lại trong ≤3 nến.
 *  2. Xác nhận: phá cấu trúc (MSS/CHoCH) ngược chiều cú quét, sóng phá có displacement (nến thân lớn hoặc FVG).
 *  3. Entry (lệnh limit):
 *       M15 — mọi chiều, chỉ khi sự kiện xảy ra 13h–23h giờ VN; entry = CE (giữa) FVG của sóng; SL ngoài đỉnh/đáy quét + 0.5 ATR
 *       H1  — chỉ SELL sau quét PDH (phá giả PDH ~61% số lần); entry = mép FVG; SL ngoài đỉnh quét + 1 ATR
 *       M5  — chỉ để TINH CHỈNH: chỉ nhận khi trong 3h trước đó M15/H1 đã có setup cùng chiều; entry CE, SL + 0.5 ATR
 *     Nhiều khung cùng chiều đang chờ khớp → giữ entry giá đẹp nhất (mua thấp nhất / bán cao nhất). Một lệnh một lúc mỗi cặp.
 *  4. TP cố định 2R. Huỷ nếu không khớp sau 12 nến (H1: 8), nếu giá chạm TP trước khi khớp, hoặc đóng cửa vượt đỉnh/đáy quét.
 *     Giữ lệnh tối đa 96 nến (H1: 72) rồi đóng theo giá.
 */
(function (root) {
  'use strict';
  const MS = { m5: 3e5, m15: 9e5, h1: 36e5 };
  const CFG = {
    m5:  { entry: 'ce',   slATR: 0.5, expiry: 12, hold: 96, window: true, sides: [1, -1] },
    m15: { entry: 'ce',   slATR: 0.5, expiry: 12, hold: 96, window: true, sides: [1, -1] },
    h1:  { entry: 'edge', slATR: 1.0, expiry: 8,  hold: 72, window: false, sides: [-1] },
  };
  const RR = 2, REFINE_MS = 3 * 36e5, L = 3, WARM = 100; // bỏ 100 nến đầu (ATR/cấu trúc chưa ổn định)

  function atr(c, p) { const o = new Array(c.length); let a = c[0].h - c[0].l; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function pivots(c) { const H = [], Lw = []; for (let i = L; i < c.length - L; i++) { let ph = true, pl = true; for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; } if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lw.push({ i, p: c[i].l, conf: i + L }); } return { H, L: Lw }; }
  // đỉnh/đáy ngày trước (UTC) tính tới từng nến
  // chỉ dùng ngày trước khi dữ liệu của ngày đó đầy đủ từ 00:00 UTC (tránh PDH/PDL sai ở đầu cửa sổ dữ liệu)
  function prevDay(c) { const out = new Array(c.length); let day = null, full = false, dH = -Infinity, dL = Infinity, pH = null, pL = null; const step = c.length > 1 ? c[1].t - c[0].t : 0; for (let i = 0; i < c.length; i++) { const dk = Math.floor(c[i].t / 864e5); if (dk !== day) { if (day !== null) { pH = full ? dH : null; pL = full ? dL : null; } day = dk; full = c[i].t - dk * 864e5 <= step; dH = -Infinity; dL = Infinity; } out[i] = { pH, pL }; dH = Math.max(dH, c[i].h); dL = Math.min(dL, c[i].l); } return out; }
  const hourVN = (t) => (new Date(t).getUTCHours() + 7) % 24;
  const inWindow = (t) => { const h = hourVN(t); return h >= 13 && h < 23; };

  // các setup của một khung
  function setups(c, tf) {
    const n = c.length, A = atr(c, 14), PD = prevDay(c), pv = pivots(c), cfg = CFG[tf], out = [];
    let ih = 0, il = 0; const sh = [], sl = [], bH = new Set(), bL = new Set();
    for (let k = 3; k < n; k++) {
      while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]);
      while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
      for (const d of [1, -1]) {
        const P = d > 0 ? sh[sh.length - 1] : sl[sl.length - 1]; if (!P) continue;
        const B = d > 0 ? bH : bL; if (B.has(P.i) || !(d > 0 ? c[k].c > P.p : c[k].c < P.p)) continue;
        B.add(P.i);
        if (k < WARM || !cfg.sides.includes(d) || (cfg.window && !inWindow(c[k].t))) continue;
        let oi = P.i; for (let u = P.i; u <= k; u++) if (d > 0 ? c[u].l < c[oi].l : c[u].h > c[oi].h) oi = u;
        const oP = d > 0 ? c[oi].l : c[oi].h, a = A[k]; if (!(a > 0)) continue;
        // quét PDL (cho BUY) / PDH (cho SELL) ở gốc sóng, đóng cửa quay lại trong ≤3 nến
        const lvl = d > 0 ? PD[oi].pL : PD[oi].pH; if (lvl == null || !(d > 0 ? oP < lvl : oP > lvl)) continue;
        let back = false; for (let u = oi; u <= Math.min(k, oi + 3); u++) if (d > 0 ? c[u].c > lvl : c[u].c < lvl) { back = true; break; }
        if (!back) continue;
        let ext = d > 0 ? -Infinity : Infinity; for (let u = oi; u <= k; u++) ext = d > 0 ? Math.max(ext, c[u].h) : Math.min(ext, c[u].l);
        let disp = false; for (let u = oi + 1; u <= k; u++) { const y = c[u], rg = y.h - y.l, bd = d * (y.c - y.o); if (bd > 0 && bd >= 0.6 * rg && rg >= 1.2 * A[u - 1]) { disp = true; break; } }
        let fvg = null; for (let m = oi + 2; m <= k; m++) { const bot = d > 0 ? c[m - 2].h : c[m].h, top = d > 0 ? c[m].l : c[m - 2].l; if (!(top > bot)) continue; let ok = true; for (let u = m + 1; u <= k; u++) if (d > 0 ? c[u].l <= bot : c[u].h >= top) { ok = false; break; } if (ok && (!fvg || top - bot > fvg.top - fvg.bot)) fvg = { m, top, bot }; }
        if (fvg && fvg.top - fvg.bot >= 0.15 * a) disp = true;
        if (!disp || !fvg) continue;
        out.push({ tf, k, d, oi, oP, lvl, a, fvg, ext, ct: c[k].ct, t: c[k].t });
      }
    }
    return out;
  }

  // mô phỏng một lệnh từ lúc tạo tới hiện tại
  function simulate(c, e, spread) {
    const cfg = CFG[e.tf], d = e.d, k = e.k;
    const entry = cfg.entry === 'ce' ? (e.fvg.top + e.fvg.bot) / 2 : (d > 0 ? e.fvg.top : e.fvg.bot);
    if (!(d > 0 ? entry < c[k].c && entry > e.oP : entry > c[k].c && entry < e.oP)) return null;
    const sl = e.oP - d * (cfg.slATR * e.a + spread), risk = Math.abs(entry - sl);
    if (risk < 0.6 * e.a || risk > 10 * e.a) return null;
    const tp = entry + d * RR * risk, cost = spread / risk;
    const s = { id: `${e.tf}-${e.t}-${d > 0 ? 'B' : 'S'}`, tf: e.tf, side: d, t: e.t, ct: e.ct, entry, sl, tp, risk, sweep: e.lvl, sweepName: d > 0 ? 'PDL' : 'PDH', origin: e.oP,
      fvg: { top: e.fvg.top, bot: e.fvg.bot }, spread, state: 'PENDING', fillT: null, exitT: null, exitP: null, r: null };
    let j = k + 1, fill = -1;
    for (; j < c.length && j <= k + cfg.expiry; j++) {
      const x = c[j];
      if (d > 0 ? x.h >= tp : x.l <= tp) { s.state = 'MISSED'; s.exitT = x.ct; return s; }
      if (d > 0 ? x.l <= entry : x.h >= entry) { fill = j; break; }
      if (d > 0 ? x.c < e.oP : x.c > e.oP) { s.state = 'INVALID'; s.exitT = x.ct; return s; }
    }
    if (fill < 0) { if (j > k + cfg.expiry) { s.state = 'EXPIRED'; s.exitT = c[k + cfg.expiry].ct; } return s; }
    s.state = 'OPEN'; s.fillT = c[fill].t;
    for (let u = fill; u < c.length; u++) {
      const x = c[u];
      if (d > 0 ? x.l <= sl : x.h >= sl) { s.state = 'LOSS'; s.exitT = x.ct; s.exitP = sl; s.r = -1 - cost; return s; }
      if (u > fill && (d > 0 ? x.h >= tp : x.l <= tp)) { s.state = 'WIN'; s.exitT = x.ct; s.exitP = tp; s.r = RR - cost; return s; }
      if (u - fill >= cfg.hold) { s.state = 'TIME'; s.exitT = x.ct; s.exitP = x.c; s.r = d * (x.c - entry) / risk - cost; return s; }
    }
    return s;
  }
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1, MISSED: 1, EXPIRED: 1, INVALID: 1, SKIP: 1 };

  // cập nhật trạng thái một lệnh đã ghi (giữ nguyên entry/SL/TP đã lưu) bằng các nến đóng mới của khung đó
  function track(s, c) {
    if (FINAL[s.state]) return s;
    const cfg = CFG[s.tf], ms = MS[s.tf], d = s.side, cost = (s.spread || 0) / s.risk;
    const expiryT = s.ct + cfg.expiry * ms;
    for (const x of c) {
      if (x.ct <= (s.lastT || s.ct)) continue;
      if (s.state === 'PENDING') {
        if (d > 0 ? x.h >= s.tp : x.l <= s.tp) { s.state = 'MISSED'; s.exitT = x.ct; break; }
        if (d > 0 ? x.l <= s.entry : x.h >= s.entry) {
          s.state = 'OPEN'; s.fillT = x.t;
          if (d > 0 ? x.l <= s.sl : x.h >= s.sl) { s.state = 'LOSS'; s.exitT = x.ct; s.exitP = s.sl; s.r = -1 - cost; break; }
        } else if (d > 0 ? x.c < s.origin : x.c > s.origin) { s.state = 'INVALID'; s.exitT = x.ct; break; }
        else if (x.ct >= expiryT) { s.state = 'EXPIRED'; s.exitT = x.ct; break; }
      } else if (s.state === 'OPEN') {
        if (d > 0 ? x.l <= s.sl : x.h >= s.sl) { s.state = 'LOSS'; s.exitT = x.ct; s.exitP = s.sl; s.r = -1 - cost; break; }
        if (d > 0 ? x.h >= s.tp : x.l <= s.tp) { s.state = 'WIN'; s.exitT = x.ct; s.exitP = s.tp; s.r = RR - cost; break; }
        if (x.t - s.fillT >= cfg.hold * ms) { s.state = 'TIME'; s.exitT = x.ct; s.exitP = x.c; s.r = d * (x.c - s.entry) / s.risk - cost; break; }
      }
      s.lastT = x.ct;
    }
    return s;
  }

  // chạy cả 3 khung cho một cặp: D = {m5, m15, h1} (chỉ nến đã đóng), spread theo giá
  function run(D, opt) {
    opt = opt || {}; const spread = opt.spread || 0, all = [];
    for (const tf of ['h1', 'm15', 'm5']) { const c = D[tf]; if (!c || c.length < 60) continue; for (const e of setups(c, tf)) { const s = simulate(c, e, spread); if (s) all.push(s); } }
    all.sort((a, b) => a.ct - b.ct || (a.tf === 'h1' ? -1 : 1));
    const hi = all.filter(s => s.tf !== 'm5');
    let busyUntil = -Infinity, busyId = null;
    const now = opt.now || Infinity;
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (s.tf === 'm5' && !hi.some(h => h.side === s.side && h.ct <= s.ct && s.ct - h.ct <= REFINE_MS)) { s.state = 'SKIP'; s.why = 'M5 không có setup M15/H1 cùng chiều trong 3h'; s.r = null; continue; }
      if (s.ct <= busyUntil) { s.state = 'SKIP'; s.why = 'Đang có lệnh khác (' + busyId + ')'; s.r = null; continue; }
      const waitEnd = s.fillT != null ? s.fillT : (s.exitT != null ? s.exitT : now);
      const better = all.slice(i + 1).find(x => x.ct < waitEnd && x.side === s.side && x.state !== 'SKIP' && (s.side > 0 ? x.entry < s.entry : x.entry > s.entry) && (x.tf !== 'm5' || hi.some(h => h.side === x.side && h.ct <= x.ct && x.ct - h.ct <= REFINE_MS)));
      if (better) { s.state = 'SKIP'; s.why = `Có entry đẹp hơn ở ${better.tf.toUpperCase()} (${better.entry.toFixed(2)})`; s.r = null; continue; }
      busyUntil = s.exitT != null ? s.exitT : Infinity; busyId = s.tf.toUpperCase() + ' ' + (s.side > 0 ? 'BUY' : 'SELL');
    }
    return all;
  }
  function stats(list) {
    const done = list.filter(s => s.r != null), w = done.filter(s => s.r > 0).length, R = done.reduce((a, s) => a + s.r, 0);
    let eq = 0, pk = 0, dd = 0; for (const s of done) { eq += s.r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
    const gw = done.filter(s => s.r > 0).reduce((a, s) => a + s.r, 0), gl = -done.filter(s => s.r <= 0).reduce((a, s) => a + s.r, 0);
    return { signals: list.filter(s => s.state !== 'SKIP').length, closed: done.length, wins: w, losses: done.filter(s => s.state === 'LOSS').length, winRate: done.length ? w / done.length : 0, netR: R, pf: gl ? gw / gl : (gw ? Infinity : 0), maxDD: dd };
  }
  const STATE_VI = { PENDING: 'Chờ khớp', OPEN: 'Đang chạy', WIN: 'Chạm TP (+2R)', LOSS: 'Dính SL', TIME: 'Hết giờ, đóng theo giá', MISSED: 'Lỡ (chạm TP trước khi khớp)', EXPIRED: 'Hết hạn chờ', INVALID: 'Huỷ (phá đỉnh/đáy quét)', SKIP: 'Bỏ qua' };
  const V3 = { run, stats, setups, simulate, track, CFG, RR, FINAL, STATE_VI, inWindow, version: 'v3-2026-11-05' };
  if (typeof module === 'object' && module.exports) module.exports = V3;
  root.V3 = V3;
})(typeof window !== 'undefined' ? window : globalThis);
