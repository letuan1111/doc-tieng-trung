/* V3 — Cách vào lệnh ICT/SMC rút ra từ 12 tháng chart (XAU, BTC, ETH, tháng 10/2025 → 11/2026)
 * Chạy được trên trình duyệt (window.V3) và Node (require).
 *
 *  1. Thanh khoản: giá QUÉT đỉnh hôm trước (PDH) hoặc đáy hôm trước (PDL): râu vượt rồi đóng cửa quay lại trong ≤3 nến.
 *  2. Xác nhận: phá cấu trúc (MSS/CHoCH) ngược chiều cú quét, sóng phá có displacement (nến thân lớn hoặc FVG).
 *  3. Entry (lệnh limit) — bản V4 (05/11/2026), học từ bối cảnh giá của 578 setup trong 12 tháng (XAU, BTC, ETH):
 *       M15 — bias ICT: cấu trúc swing H4 (strong high/low) cùng chiều lệnh, KHÔNG vào phiên Á (7h–13h VN); entry = mép FVG; SL ngoài đỉnh/đáy quét + 0.5 ATR
 *             (rà lại 05/11: cấu trúc H4 tốt hơn EMA H4 — cùng số lệnh, +8.2R thay vì +5.6R, dương ở mọi giai đoạn; killzone, ép entry discount, OTE đều làm kém đi)
 *       M30 — (dựng từ M15) mọi setup, cả hai chiều; entry = CE (giữa) FVG; SL + 1 ATR
 *       H1  — cả BUY và SELL; entry = mép FVG; SL + 1 ATR
 *     Chờ khớp: M15 24 nến (6h), M30 20 nến (10h), H1 16 nến (16h). TP 2R (thử TP theo thanh khoản đối diện: gần như luôn < 2R, kết quả như nhau).
 *     Chọn cách phối bền nhất: dương ở cả 6 tháng trước lẫn 6 tháng gần đây trên XAU/BTC/ETH (chỉ BTC 6 tháng trước −0.7R).
 *     Nhiều khung cùng chiều đang chờ khớp → giữ entry giá đẹp nhất (mua thấp nhất / bán cao nhất). Một lệnh một lúc mỗi cặp.
 *     Mỗi tín hiệu ghi lại BỐI CẢNH GIÁ lúc đó (ctx): phiên, EMA khung vào/H1/H4, độ sâu quét, độ mạnh sóng, ngày đã chạy bao nhiêu % ADR.
 *  4. TP cố định 2R. Huỷ nếu hết thời gian chờ khớp, nếu giá chạm TP trước khi khớp, hoặc đóng cửa vượt đỉnh/đáy quét.
 *     Giữ lệnh tối đa 96 nến (H1: 72) rồi đóng theo giá.
 */
(function (root) {
  'use strict';
  const MS = { m15: 9e5, m30: 18e5, h1: 36e5, h4: 144e5 };
  const TFS = ['h1', 'm30', 'm15'];
  // liq: nguồn thanh khoản bị quét ('pd' = PDH/PDL, 'london', 'asia', 'pw', 'swing'); back: số nến tối đa để đóng cửa quay lại
  const CFG = {
    m15: { entry: 'edge', slATR: 0.5, expiry: 24, hold: 96, window: false, sides: [1, -1], liq: ['pd'], back: 3, filter: (x) => x.st4 && x.sess !== 'Á', rule: 'cấu trúc swing H4 cùng chiều · ngoài phiên Á' },
    m30: { entry: 'ce',   slATR: 1.0, expiry: 20, hold: 72, window: false, sides: [1, -1], liq: ['pd'], back: 3, filter: null, rule: 'mọi setup quét PDH/PDL → MSS → FVG' },
    h1:  { entry: 'edge', slATR: 1.0, expiry: 16, hold: 72, window: false, sides: [1, -1], liq: ['pd'], back: 3, filter: null, rule: 'mọi setup, cả hai chiều' },
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
    const out = new Array(c.length); let day = null, aH = -Infinity, aL = Infinity, lH = -Infinity, lL = Infinity, wk = null, wH = -Infinity, wL = Infinity, pwH = null, pwL = null, wFull = false;
    for (let i = 0; i < c.length; i++) {
      const x = c[i], dk = Math.floor(x.t / 864e5), hr = new Date(x.t).getUTCHours(), wkk = Math.floor((dk + 3) / 7);
      if (dk !== day) { day = dk; aH = -Infinity; aL = Infinity; lH = -Infinity; lL = Infinity; }
      if (wkk !== wk) { if (wk !== null && wFull) { pwH = wH; pwL = wL; } else if (wk !== null) { pwH = pwL = null; } wFull = (dk + 3) % 7 === 0 && x.t % 864e5 < 36e5; wk = wkk; wH = -Infinity; wL = Infinity; } // tuần trước chỉ dùng khi có đủ dữ liệu từ đầu tuần
      out[i] = { aH: hr >= 6 && aH > -Infinity ? aH : null, aL: hr >= 6 && aL < Infinity ? aL : null, lH: hr >= 12 && lH > -Infinity ? lH : null, lL: hr >= 12 && lL < Infinity ? lL : null, wH: pwH, wL: pwL };
      if (hr < 6) { aH = Math.max(aH, x.h); aL = Math.min(aL, x.l); } else if (hr >= 7 && hr < 12) { lH = Math.max(lH, x.h); lL = Math.min(lL, x.l); }
      wH = Math.max(wH, x.h); wL = Math.min(wL, x.l);
    }
    return out;
  }
  // cấu trúc swing (strong high/low) + dealing range mỗi nến: {d, lo, hi} — bias khung lớn kiểu ICT/SMC
  function swingStruct(c) {
    const pv = pivots(c), S = new Array(c.length); let ih = 0, il = 0; const sh = [], sl = []; let d = 0, sL = null, sLi = 0, sH = null, sHi = 0, top = -Infinity, bot = Infinity; const bH = new Set(), bL = new Set();
    for (let k = 0; k < c.length; k++) {
      while (ih < pv.H.length && pv.H[ih].conf <= k) sh.push(pv.H[ih++]); while (il < pv.L.length && pv.L[il].conf <= k) sl.push(pv.L[il++]);
      const x = c[k], ph = sh[sh.length - 1], pl = sl[sl.length - 1];
      const upFrom = (f) => { let lo = Infinity, li = f; for (let u = f; u <= k; u++) if (c[u].l < lo) { lo = c[u].l; li = u; } d = 1; sL = lo; sLi = li; top = -Infinity; for (let u = li; u <= k; u++) top = Math.max(top, c[u].h); };
      const dnFrom = (f) => { let hi = -Infinity, hj = f; for (let u = f; u <= k; u++) if (c[u].h > hi) { hi = c[u].h; hj = u; } d = -1; sH = hi; sHi = hj; bot = Infinity; for (let u = hj; u <= k; u++) bot = Math.min(bot, c[u].l); };
      if (ph && !bH.has(ph.i) && x.c > ph.p && d !== -1) { bH.add(ph.i); upFrom(ph.i); }
      if (pl && !bL.has(pl.i) && x.c < pl.p && d !== 1) { bL.add(pl.i); dnFrom(pl.i); }
      if (d === 1 && x.c < sL) { dnFrom(sLi); for (const p of sl) bL.add(p.i); } else if (d === -1 && x.c > sH) { upFrom(sHi); for (const p of sh) bH.add(p.i); }
      if (d === 1) top = Math.max(top, x.h); else if (d === -1) bot = Math.min(bot, x.l);
      S[k] = d === 1 ? { d, lo: sL, hi: top } : d === -1 ? { d, lo: bot, hi: sH } : { d: 0, lo: null, hi: null };
    }
    return S;
  }
  // killzone ICT (giờ VN): London 14h–17h, New York 19h–23h
  const KZ = (t) => { const h = hourVN(t) + new Date(t).getUTCMinutes() / 60; return h >= 14 && h < 17 ? 'London' : h >= 19 && h < 23 ? 'New York' : null; };
  const hourVN = (t) => (new Date(t).getUTCHours() + 7) % 24;
  const inWindow = (t) => { const h = hourVN(t); return h >= 13 && h < 23; };

  // các setup của một khung
  function setups(c, tf, H) {
    const n = c.length, A = atr(c, 14), PD = prevDay(c), SL = sessLv(c), pv = pivots(c), cfg = CFG[tf], out = [];
    H = H || {}; const h1 = H.h1 || (tf === 'h1' ? c : null), h4 = h1 ? resample(h1, MS.h4) : null;
    const eTF = emaDir(c), eH1 = h1 ? mapHTF(c, h1, emaDir(h1)) : [], eH4 = h4 ? mapHTF(c, h4, emaDir(h4)) : [], e89 = ema(c.map(x => x.c), 89);
    const S1 = h1 ? mapHTF(c, h1, swingStruct(h1)) : [], S4 = h4 ? mapHTF(c, h4, swingStruct(h4)) : [];
    const STF = swingStruct(c);
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
          if (src === 'none') { lvl = oP; lvName = 'MSS (không quét)'; break; }
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
        // ICT/SMC: bias cấu trúc H1/H4, killzone lúc quét & lúc MSS, vị trí entry trong sóng (discount/premium) và trong dealing range H4
        const leg = Math.abs(ext - oP), ret = (px) => leg > 0 ? +(d > 0 ? (ext - px) / leg : (px - ext) / leg).toFixed(2) : null;
        const s4 = S4[k], s1 = S1[k], pdR = (px, s) => s && s.hi > s.lo ? +(d > 0 ? (px - s.lo) / (s.hi - s.lo) : (s.hi - px) / (s.hi - s.lo)).toFixed(2) : null;
        const ce = (fvg.top + fvg.bot) / 2, edge = d > 0 ? fvg.top : fvg.bot, ote = ext - d * 0.705 * leg;
        const pS = STF[Math.max(0, oi - 1)];
        Object.assign(ctx, { bos: !!(pS && pS.d === d), st1: s1 ? s1.d === d : null, st4: s4 ? s4.d === d : null, kzSweep: KZ(c[oi].t), kzMss: KZ(x.t),
          retCE: ret(ce), retEdge: ret(edge), fvgOTE: Math.max(d > 0 ? fvg.bot : fvg.bot, Math.min(ext - d * 0.62 * leg, ext - d * 0.79 * leg)) <= Math.min(fvg.top, Math.max(ext - d * 0.62 * leg, ext - d * 0.79 * leg)),
          pd4: pdR(ce, s4), pd1: pdR(ce, s1) });
        // thanh khoản đối diện (đích của con sóng): PDH/PDL hôm nay + đỉnh/đáy swing chưa bị phá, vượt quá cực trị sóng
        const opp = (d > 0 ? sh : sl).filter(q => q.i >= k - 400 && (d > 0 ? q.p > ext : q.p < ext)).map(q => q.p);
        const pdx = d > 0 ? PD[k].pH : PD[k].pL; if (pdx != null && (d > 0 ? pdx > ext : pdx < ext)) opp.push(pdx);
        const liq = opp.length ? (d > 0 ? Math.min(...opp) : Math.max(...opp)) : null;
        const e = { tf, k, d, oi, oP, lvl, lvName, a, fvg, ext, liq, ct: c[k].ct, t: c[k].t, ctx };
        if (cfg.filter && !cfg.filter(ctx)) { e.filtered = true; if (!H.keepFiltered) continue; }
        out.push(e);
      }
    }
    return out;
  }

  // mô phỏng một lệnh từ lúc tạo tới hiện tại
  function simulate(c, e, spread) {
    const cfg = CFG[e.tf], d = e.d, k = e.k;
    const entry = cfg.entry === 'ce' ? (e.fvg.top + e.fvg.bot) / 2 : cfg.entry === 'ote' ? e.ext - d * 0.705 * Math.abs(e.ext - e.oP) : (d > 0 ? e.fvg.top : e.fvg.bot);
    if (!(d > 0 ? entry < c[k].c && entry > e.oP : entry > c[k].c && entry < e.oP)) return null;
    const sl = cfg.slPts ? entry - d * (cfg.slPts + spread) : e.oP - d * (cfg.slATR * e.a + spread), risk = Math.abs(entry - sl); // slPts: SL cố định theo giá
    if (risk < (cfg.minRiskATR != null ? cfg.minRiskATR : 0.6) * e.a || risk > 10 * e.a) return null;
    // TP: cfg.tp = số R cố định (mặc định 2) hoặc 'liq' = thanh khoản đối diện (tối thiểu tpMin R, tối đa tpMax R)
    let rr = typeof cfg.tp === 'number' ? cfg.tp : RR;
    if (cfg.tp === 'liq') { const lr = e.liq != null ? Math.abs(e.liq - entry) / risk : 0; rr = lr >= (cfg.tpMin || 2) ? Math.min(lr, cfg.tpMax || 5) : (cfg.tpMin || 2); }
    if (cfg.maxRiskPts && risk > cfg.maxRiskPts) return null; // SL quá xa so với mục tiêu sóng
    if (cfg.tpPts) rr = cfg.tpPts / risk; // TP cố định theo giá (ví dụ 15 giá vàng)
    const tp = entry + d * rr * risk, cost = spread / risk;
    const s = { id: `${e.tf}-${e.t}-${d > 0 ? 'B' : 'S'}`, tf: e.tf, side: d, t: e.t, ct: e.ct, entry, sl, tp, risk, sweep: e.lvl, sweepName: e.lvName || (d > 0 ? 'PDL' : 'PDH'), origin: e.oP,
      fvg: { top: e.fvg.top, bot: e.fvg.bot }, liq: e.liq, rr: +rr.toFixed(2), spread, ctx: e.ctx, state: 'PENDING', fillT: null, exitT: null, exitP: null, r: null };
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
      if (u > fill && (d > 0 ? x.h >= tp : x.l <= tp)) { s.state = 'WIN'; s.exitT = x.ct; s.exitP = tp; s.r = rr - cost; return s; }
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
        if (d > 0 ? x.h >= s.tp : x.l <= s.tp) { s.state = 'WIN'; s.exitT = x.ct; s.exitP = s.tp; s.r = Math.abs(s.tp - s.entry) / s.risk - cost; break; }
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
  // Ghi nhận MỌI setup ICT/SMC có quét thanh khoản (PDH/PDL, tuần, London, phiên Á, swing) → MSS + displacement + FVG.
  // grade 'A' = đạt quy tắc chuẩn (đã kiểm chứng có lời); 'B' = setup quét thanh khoản khác, chỉ để ghi nhận/theo dõi. Mỗi khung một lệnh riêng.
  const LIQ_ALL = ['pd', 'pw', 'london', 'asia', 'swing'];
  function runAll(D, opt) {
    opt = opt || {};
    const A = run(D, opt); for (const s of A) s.grade = 'A';
    const save = {}; for (const tf of TFS) { save[tf] = CFG[tf]; CFG[tf] = { ...CFG[tf], liq: LIQ_ALL, filter: null, sides: [1, -1] }; }
    let Bl; try { Bl = run(D, { ...opt, perTF: true }); } finally { for (const tf of TFS) CFG[tf] = save[tf]; }
    const map = new Map(A.map(s => [s.id, s]));
    for (const s of Bl) { if (s.state === 'SKIP') continue; const a = map.get(s.id); if (a && a.state !== 'SKIP') continue; s.grade = 'B'; map.set(s.id, s); }
    return [...map.values()].sort((a, b) => a.ct - b.ct || TFS.indexOf(a.tf) - TFS.indexOf(b.tf));
  }
  // Mô hình "BOS 15" (vàng): quét thanh khoản (PDH/PDL, tuần, London, phiên Á, swing) → BOS tiếp diễn (phá cùng chiều cấu trúc swing của khung)
  // có displacement + FVG trên M15 / M30 → LIMIT mép FVG · SL 10 giá · TP 15 giá. Kiểm tra 12 tháng (research/sl10.mjs): M15 thắng 56–69%, M30 ~58%.
  const BOS15 = { tfs: ['m15', 'm30'], sl: 10, tp: 15, expiry: { m15: 8, m30: 6 }, hold: { m15: 192, m30: 96 } };
  function runBos(D, opt) {
    opt = opt || {}; const save = {}; for (const tf of TFS) save[tf] = CFG[tf];
    try {
      for (const tf of TFS) CFG[tf] = BOS15.tfs.includes(tf) ? { ...save[tf], entry: 'edge', liq: LIQ_ALL, filter: (x) => x.bos, sides: [1, -1], slPts: BOS15.sl, tpPts: BOS15.tp, minRiskATR: 0, expiry: BOS15.expiry[tf], hold: BOS15.hold[tf] } : { ...save[tf], sides: [] };
      const L = run(D, { ...opt, perTF: opt.perTF != null ? opt.perTF : true });
      for (const s of L) { s.grade = 'S'; s.id = s.id + '-bos'; }
      return L;
    } finally { for (const tf of TFS) CFG[tf] = save[tf]; }
  }
  // mô tả bối cảnh bằng lời
  function ctxText(x, side) {
    if (!x) return '';
    const yn = (v) => v == null ? '?' : v ? 'cùng' : 'ngược';
    return `phiên ${x.sess} ${x.hour}h${x.kzMss ? ' (KZ ' + x.kzMss + ')' : ''}${x.st4 != null ? ` · cấu trúc H1 ${yn(x.st1)}/H4 ${yn(x.st4)}` : ''} · EMA ${yn(x.emaTF)}/H1 ${yn(x.emaH1)}/H4 ${yn(x.emaH4)} · quét sâu ${x.depth} ATR · sóng ${x.moveATR} ATR trong ${x.legBars} nến · FVG ${x.fvgATR} ATR${x.dayUsed != null ? ` · ngày đã chạy ${Math.round(x.dayUsed * 100)}% ADR` : ''}`;
  }
  function stats(list) {
    const done = list.filter(s => s.r != null), w = done.filter(s => s.r > 0).length, R = done.reduce((a, s) => a + s.r, 0);
    let eq = 0, pk = 0, dd = 0; for (const s of done) { eq += s.r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); }
    const gw = done.filter(s => s.r > 0).reduce((a, s) => a + s.r, 0), gl = -done.filter(s => s.r <= 0).reduce((a, s) => a + s.r, 0);
    return { signals: list.filter(s => s.state !== 'SKIP').length, closed: done.length, wins: w, losses: done.filter(s => s.state === 'LOSS').length, winRate: done.length ? w / done.length : 0, netR: R, pf: gl ? gw / gl : (gw ? Infinity : 0), maxDD: dd };
  }
  const STATE_VI = { PENDING: 'Chờ khớp', OPEN: 'Đang chạy', WIN: 'Chạm TP', LOSS: 'Dính SL', TIME: 'Hết giờ, đóng theo giá', MISSED: 'Lỡ (chạm TP trước khi khớp)', EXPIRED: 'Hết hạn chờ', INVALID: 'Huỷ (phá đỉnh/đáy quét)', SKIP: 'Bỏ qua' };
  const V3 = { run, runAll, runBos, BOS15, LIQ_ALL, stats, setups, simulate, track, resample, ctxText, CFG, TFS, MS, RR, FINAL, STATE_VI, inWindow, version: 'v4.4-2026-11-05' };
  if (typeof module === 'object' && module.exports) module.exports = V3;
  root.V3 = V3;
})(typeof window !== 'undefined' ? window : globalThis);
