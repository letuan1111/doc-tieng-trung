/* V3 — Cách vào lệnh ICT/SMC rút ra từ 12 tháng chart (XAU, BTC, ETH, tháng 10/2025 → 11/2026)
 * Chạy được trên trình duyệt (window.V3) và Node (require).
 *
 *  1. Thanh khoản: giá QUÉT đỉnh hôm trước (PDH) hoặc đáy hôm trước (PDL): râu vượt rồi đóng cửa quay lại trong ≤3 nến.
 *  2. Xác nhận: phá cấu trúc (MSS/CHoCH) ngược chiều cú quét, sóng phá có displacement (nến thân lớn hoặc FVG).
 *  3. Entry (lệnh limit) — bản V4 (05/11/2026), học từ bối cảnh giá của 578 setup trong 12 tháng (XAU, BTC, ETH):
 *       M15 — EMA34/89 H4 cùng chiều lệnh, KHÔNG vào phiên Á (7h–13h VN); entry = mép FVG; SL ngoài đỉnh/đáy quét + 0.5 ATR
 *       M30 — (dựng từ M15) mọi setup, cả hai chiều; entry = CE (giữa) FVG; SL + 1 ATR
 *       H1  — chỉ SELL sau quét PDH (phá giả PDH ~61% số lần); entry = mép FVG; SL + 1 ATR
 *     Chọn cách phối bền nhất: dương ở cả 6 tháng trước lẫn 6 tháng gần đây trên XAU/BTC/ETH (chỉ BTC 6 tháng trước −0.7R).
 *     Nhiều khung cùng chiều đang chờ khớp → giữ entry giá đẹp nhất (mua thấp nhất / bán cao nhất). Một lệnh một lúc mỗi cặp.
 *     Mỗi tín hiệu ghi lại BỐI CẢNH GIÁ lúc đó (ctx): phiên, EMA khung vào/H1/H4, độ sâu quét, độ mạnh sóng, ngày đã chạy bao nhiêu % ADR.
 *  4. TP cố định 2R. Huỷ nếu không khớp sau 12 nến (H1: 8), nếu giá chạm TP trước khi khớp, hoặc đóng cửa vượt đỉnh/đáy quét.
 *     Giữ lệnh tối đa 96 nến (H1: 72) rồi đóng theo giá.
 */
(function (root) {
  'use strict';
  const MS = { m15: 9e5, m30: 18e5, h1: 36e5, h4: 144e5 };
  const TFS = ['h1', 'm30', 'm15'];
  // liq: nguồn thanh khoản bị quét ('pd' = PDH/PDL, 'london', 'asia', 'pw', 'swing'); back: số nến tối đa để đóng cửa quay lại
  const CFG = {
    m15: { entry: 'edge', slATR: 0.5, expiry: 12, hold: 96, window: false, sides: [1, -1], liq: ['pd'], back: 3, filter: (x) => x.emaH4 && x.sess !== 'Á', rule: 'EMA H4 cùng chiều · ngoài phiên Á' },
    m30: { entry: 'ce',   slATR: 1.0, expiry: 10, hold: 72, window: false, sides: [1, -1], liq: ['pd'], back: 3, filter: null, rule: 'mọi setup quét PDH/PDL → MSS → FVG' },
    h1:  { entry: 'edge', slATR: 1.0, expiry: 8,  hold: 72, window: false, sides: [-1], liq: ['pd'], back: 3, filter: null, rule: 'chỉ SELL sau quét PDH' },
  };
  const RR = 2, L = 3, WARM = 100, PER_TF = false; // true = mỗi khung giữ một lệnh riêng // bỏ 100 nến đầu (ATR/cấu trúc chưa ổn định)
  // gộp nến (chỉ giữ nến khung lớn đã đủ, không nhìn trước)
  function resample(c, ms) { const out = []; let cur = null; for (const x of c) { const s = Math.floor(x.t / ms) * ms; if (!cur || cur.t !== s) { if (cur) out.push(cur); cur = { t: s, ct: s + ms, o: x.o, h: x.h, l: x.l, c: x.c, last: x.ct }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.ct; } } if (cur && cur.last >= cur.ct) out.push(cur); return out.map(({ last, ...r }) => r); }
  function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
  const emaDir = (c) => { const a = ema(c.map(x => x.c), 34), b = ema(c.map(x => x.c), 89); return c.map((_, i) => a[i] > b[i] ? 1 : -1); };
  function mapHTF(c, H, vals) { const out = new Array(c.length).fill(null); let j = -1; for (let i = 0; i < c.length; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) out[i] = vals[j]; } return out; }
  const SESS = (h) => h >= 7 && h < 13 ? 'Á' : h >= 13 && h < 19 ? 'London' : h >= 19 ? 'New York' : 'đêm';

  function atr(c, p) { const o = new Array(c.length); let a = c[0].h - c[0].l; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function pivots(c) { const H = [], Lw = []; for (let i = L; i < c.length - L; i++) { let ph = true, pl = true; for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; } if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lw.push({ i, p: c[i].l, conf: i + L }); } return { H, L: Lw }; }
  // đỉnh/đáy ngày trước (UTC) tính tới từng nến
  // chỉ dùng ngày trước khi dữ liệu của ngày đó đầy đủ từ 00:00 UTC (tránh PDH/PDL sai ở đầu cửa sổ dữ liệu)
  function prevDay(c) { const out = new Array(c.length); let day = null, full = false, dH = -Infinity, dL = Infinity, pH = null, pL = null; const step = c.length > 1 ? c[1].t - c[0].t : 0; for (let i = 0; i < c.length; i++) { const dk = Math.floor(c[i].t / 864e5); if (dk !== day) { if (day !== null) { pH = full ? dH : null; pL = full ? dL : null; } day = dk; full = c[i].t - dk * 864e5 <= step; dH = -Infinity; dL = Infinity; } out[i] = { pH, pL }; dH = Math.max(dH, c[i].h); dL = Math.min(dL, c[i].l); } return out; }
  // đỉnh/đáy phiên Á (00–06 UTC), London (07–12 UTC) của ngày hiện tại (chỉ khi phiên đã kết thúc) và tuần trước
  function sessLv(c) {
    const out = new Array(c.length); let day = null, aH = -Infinity, aL = Infinity, lH = -Infinity, lL = Infinity, wk = null, wH = -Infinity, wL = Infinity, pwH = null, pwL = null;
    for (let i = 0; i < c.length; i++) {
      const x = c[i], dk = Math.floor(x.t / 864e5), hr = new Date(x.t).getUTCHours(), wkk = Math.floor((dk + 3) / 7);
      if (dk !== day) { day = dk; aH = -Infinity; aL = Infinity; lH = -Infinity; lL = Infinity; }
      if (wkk !== wk) { if (wk !== null) { pwH = wH; pwL = wL; } wk = wkk; wH = -Infinity; wL = Infinity; }
      out[i] = { aH: hr >= 6 && aH > -Infinity ? aH : null, aL: hr >= 6 && aL < Infinity ? aL : null, lH: hr >= 12 && lH > -Infinity ? lH : null, lL: hr >= 12 && lL < Infinity ? lL : null, wH: pwH, wL: pwL };
      if (hr < 6) { aH = Math.max(aH, x.h); aL = Math.min(aL, x.l); } else if (hr >= 7 && hr < 12) { lH = Math.max(lH, x.h); lL = Math.min(lL, x.l); }
      wH = Math.max(wH, x.h); wL = Math.min(wL, x.l);
    }
    return out;
  }
  const hourVN = (t) => (new Date(t).getUTCHours() + 7) % 24;
  const inWindow = (t) => { const h = hourVN(t); return h >= 13 && h < 23; };

  // các setup của một khung
  function setups(c, tf, H) {
    const n = c.length, A = atr(c, 14), PD = prevDay(c), SL = sessLv(c), pv = pivots(c), cfg = CFG[tf], out = [];
    H = H || {}; const h1 = H.h1 || (tf === 'h1' ? c : null), h4 = h1 ? resample(h1, MS.h4) : null;
    const eTF = emaDir(c), eH1 = h1 ? mapHTF(c, h1, emaDir(h1)) : [], eH4 = h4 ? mapHTF(c, h4, emaDir(h4)) : [], e89 = ema(c.map(x => x.c), 89);
    const day = h1 ? resample(h1, 864e5) : [], adr = day.map((_, i) => { if (i < 14) return null; let q = 0; for (let u = i - 14; u < i; u++) q += day[u].h - day[u].l; return q / 14; });
    const dayAt = new Map(day.map((d, i) => [d.t, i]));
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
        // quét thanh khoản ở gốc sóng (mặc định PDL cho BUY / PDH cho SELL), đóng cửa quay lại trong ≤ back nến
        let lvl = null, lvName = null;
        for (const src of (cfg.liq || ['pd'])) {
          let L2 = null, nm = null;
          if (src === 'pd') { L2 = d > 0 ? PD[oi].pL : PD[oi].pH; nm = d > 0 ? 'PDL' : 'PDH'; }
          else if (src === 'asia') { L2 = d > 0 ? SL[oi].aL : SL[oi].aH; nm = d > 0 ? 'Đáy phiên Á' : 'Đỉnh phiên Á'; }
          else if (src === 'london') { L2 = d > 0 ? SL[oi].lL : SL[oi].lH; nm = d > 0 ? 'Đáy London' : 'Đỉnh London'; }
          else if (src === 'pw') { L2 = d > 0 ? SL[oi].wL : SL[oi].wH; nm = d > 0 ? 'PWL' : 'PWH'; }
          else if (src === 'swing') { const pp = (d > 0 ? sl : sh).filter(q => q.conf <= oi && q.i >= oi - 80 && q.i < oi); if (pp.length) { L2 = d > 0 ? Math.min(...pp.map(q => q.p)) : Math.max(...pp.map(q => q.p)); nm = d > 0 ? 'Đáy swing' : 'Đỉnh swing'; } }
          if (L2 == null || !(d > 0 ? oP < L2 : oP > L2)) continue;
          let back = false; for (let u = oi; u <= Math.min(k, oi + (cfg.back || 3)); u++) if (d > 0 ? c[u].c > L2 : c[u].c < L2) { back = true; break; }
          if (back) { lvl = L2; lvName = nm; break; }
        }
        if (lvl == null) continue;
        let ext = d > 0 ? -Infinity : Infinity; for (let u = oi; u <= k; u++) ext = d > 0 ? Math.max(ext, c[u].h) : Math.min(ext, c[u].l);
        let disp = false; for (let u = oi + 1; u <= k; u++) { const y = c[u], rg = y.h - y.l, bd = d * (y.c - y.o); if (bd > 0 && bd >= 0.6 * rg && rg >= 1.2 * A[u - 1]) { disp = true; break; } }
        let fvg = null; for (let m = oi + 2; m <= k; m++) { const bot = d > 0 ? c[m - 2].h : c[m].h, top = d > 0 ? c[m].l : c[m - 2].l; if (!(top > bot)) continue; let ok = true; for (let u = m + 1; u <= k; u++) if (d > 0 ? c[u].l <= bot : c[u].h >= top) { ok = false; break; } if (ok && (!fvg || top - bot > fvg.top - fvg.bot)) fvg = { m, top, bot }; }
        if (fvg && fvg.top - fvg.bot >= 0.15 * a) disp = true;
        if (!disp || !fvg) continue;
        // bối cảnh giá lúc tín hiệu
        const x = c[k], dk = Math.floor(x.t / 864e5) * 864e5, di = dayAt.get(dk); let dh = -Infinity, dl = Infinity;
        for (let u = k; u >= 0 && c[u].t >= dk; u--) { dh = Math.max(dh, c[u].h); dl = Math.min(dl, c[u].l); }
        const ctx = { price: x.c, hour: hourVN(x.t), sess: SESS(hourVN(x.t)), emaTF: eTF[k] === d, emaH1: eH1[k] == null ? null : eH1[k] === d, emaH4: eH4[k] == null ? null : eH4[k] === d,
          depth: +(Math.abs(oP - lvl) / a).toFixed(2), legBars: k - oi, fvgATR: +((fvg.top - fvg.bot) / a).toFixed(2), moveATR: +(Math.abs(ext - oP) / a).toFixed(2),
          ext89: +(d * (x.c - e89[k]) / a).toFixed(2), dayUsed: di != null && adr[di] ? +((dh - dl) / adr[di]).toFixed(2) : null, atr: a };
        const e = { tf, k, d, oi, oP, lvl, lvName, a, fvg, ext, ct: c[k].ct, t: c[k].t, ctx };
        if (cfg.filter && !cfg.filter(ctx)) { e.filtered = true; if (!H.keepFiltered) continue; }
        out.push(e);
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
    const s = { id: `${e.tf}-${e.t}-${d > 0 ? 'B' : 'S'}`, tf: e.tf, side: d, t: e.t, ct: e.ct, entry, sl, tp, risk, sweep: e.lvl, sweepName: e.lvName || (d > 0 ? 'PDL' : 'PDH'), origin: e.oP,
      fvg: { top: e.fvg.top, bot: e.fvg.bot }, spread, ctx: e.ctx, state: 'PENDING', fillT: null, exitT: null, exitP: null, r: null };
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
    if (FINAL[s.state] || !CFG[s.tf]) return s; // không còn khung M5
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

  // chạy cả 3 khung cho một cặp: D = {m15, h1} (+ m30 nếu có; nếu không thì dựng từ M15) — chỉ nến đã đóng, spread theo giá
  function run(D, opt) {
    opt = opt || {}; const spread = opt.spread || 0, all = [];
    const C = { m15: D.m15, m30: D.m30 || (D.m15 ? resample(D.m15, MS.m30) : null), h1: D.h1 };
    for (const tf of TFS) { const c = C[tf]; if (!c || c.length < 60) continue; for (const e of setups(c, tf, { h1: C.h1 })) { const s = simulate(c, e, spread); if (s) all.push(s); } }
    all.sort((a, b) => a.ct - b.ct || TFS.indexOf(a.tf) - TFS.indexOf(b.tf));
    // mặc định: một lệnh một lúc mỗi cặp; PER_TF: mỗi khung một lệnh riêng
    const perTF = opt.perTF != null ? opt.perTF : PER_TF, busy = {}, key = (s) => perTF ? s.tf : '*';
    const now = opt.now || Infinity;
    for (let i = 0; i < all.length; i++) {
      const s = all[i], b = busy[key(s)];
      if (b && s.ct <= b.until) { s.state = 'SKIP'; s.why = 'Đang có lệnh khác (' + b.id + ')'; s.r = null; continue; }
      const waitEnd = s.fillT != null ? s.fillT : (s.exitT != null ? s.exitT : now);
      const better = all.slice(i + 1).find(x => x.ct < waitEnd && x.side === s.side && x.state !== 'SKIP' && key(x) === key(s) && (s.side > 0 ? x.entry < s.entry : x.entry > s.entry));
      if (better) { s.state = 'SKIP'; s.why = `Có entry đẹp hơn ở ${better.tf.toUpperCase()} (${better.entry.toFixed(2)})`; s.r = null; continue; }
      busy[key(s)] = { until: s.exitT != null ? s.exitT : Infinity, id: s.tf.toUpperCase() + ' ' + (s.side > 0 ? 'BUY' : 'SELL') };
    }
    return all;
  }
  // mô tả bối cảnh bằng lời
  function ctxText(x, side) {
    if (!x) return '';
    const yn = (v) => v == null ? '?' : v ? 'cùng' : 'ngược';
    return `phiên ${x.sess} ${x.hour}h · EMA ${yn(x.emaTF)}/H1 ${yn(x.emaH1)}/H4 ${yn(x.emaH4)} · quét sâu ${x.depth} ATR · sóng ${x.moveATR} ATR trong ${x.legBars} nến · FVG ${x.fvgATR} ATR${x.dayUsed != null ? ` · ngày đã chạy ${Math.round(x.dayUsed * 100)}% ADR` : ''}`;
  }
  function stats(list) {
    const done = list.filter(s => s.r != null), w = done.filter(s => s.r > 0).length, R = done.reduce((a, s) => a + s.r, 0);
    let eq = 0, pk = 0, dd = 0; for (const s of done) { eq += s.r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
    const gw = done.filter(s => s.r > 0).reduce((a, s) => a + s.r, 0), gl = -done.filter(s => s.r <= 0).reduce((a, s) => a + s.r, 0);
    return { signals: list.filter(s => s.state !== 'SKIP').length, closed: done.length, wins: w, losses: done.filter(s => s.state === 'LOSS').length, winRate: done.length ? w / done.length : 0, netR: R, pf: gl ? gw / gl : (gw ? Infinity : 0), maxDD: dd };
  }
  const STATE_VI = { PENDING: 'Chờ khớp', OPEN: 'Đang chạy', WIN: 'Chạm TP (+2R)', LOSS: 'Dính SL', TIME: 'Hết giờ, đóng theo giá', MISSED: 'Lỡ (chạm TP trước khi khớp)', EXPIRED: 'Hết hạn chờ', INVALID: 'Huỷ (phá đỉnh/đáy quét)', SKIP: 'Bỏ qua' };
  const V3 = { run, stats, setups, simulate, track, resample, ctxText, CFG, TFS, MS, RR, FINAL, STATE_VI, inWindow, version: 'v4-2026-11-05' };
  if (typeof module === 'object' && module.exports) module.exports = V3;
  root.V3 = V3;
})(typeof window !== 'undefined' ? window : globalThis);
