/* 🤖 AI TRỢ LÝ VÀO LỆNH (vàng, khung M15) — gom mọi chiến lược ICT · SMC · EMA34/89 · breakout thành một bộ não.
 * Tầng 1 (luật): mỗi nến M15 đóng, liệt kê mọi "ứng viên" vào lệnh:
 *   SWP  quét SSL/BSL swing rồi đóng lại                 SWD  quét PDH/PDL hoặc đỉnh/đáy phiên Á rồi đóng lại
 *   BOX  quét biên tích lũy rồi đóng lại                  CHO  CHoCH sau khi vừa quét thanh khoản
 *   BOS  phá swing cùng chiều EMA34/89 M30                BRK  phá biên phiên Á
 *   EMA  hồi về EMA34 rồi bật (xu hướng M30)              FVG  hồi vào FVG chưa lấp rồi bật (cấu trúc SMC cùng chiều)
 * Tầng 2 (AI): 3 mô hình cây tăng cường (LightGBM) học trên 2 năm vàng (Dukascopy 11/2024–11/2026), 62 đặc trưng chuẩn hoá theo ATR
 *   (EMA34/89 M15→H4, cấu trúc SMC M15/H1, thanh khoản PDH/PDL/phiên Á/swing, tích lũy, động lượng, nến, giờ, chế độ thị trường 24h)
 *   → xác suất "chạm TP trước SL". Chỉ vào lệnh khi xác suất ≥ ngưỡng.
 * Nhãn tự động (triple-barrier): vào ở giá đóng nến (+spread khi BUY), SL theo cấu trúc (0.5–2.5 ATR), TP = 1R, giữ ≤ 48 nến (12h); nến chạm cả SL lẫn TP tính SL.
 * Kiểm walk-forward 19 tháng (học các tháng trước → chấm tháng sau): xem ai-model.json → report. M5 và BTC không có lợi thế → chỉ phân tích.
 * status(): đọc thị trường hiện tại → xu hướng, mức thanh khoản, "bây giờ cần làm gì / chờ giá tới đâu".
 */
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.AIBOT = E; })(typeof self !== 'undefined' ? self : this, function () {
  const NAME = 'AI trợ lý', version = 'ai-2026-11-10';
  const CFG = { rr: 1, hold: 48, minRiskA: 0.5, maxRiskA: 2.5, pad: 0.3, thr: 0.5 };
  const TYPES = ['SWP', 'SWD', 'BOX', 'CHO', 'BOS', 'BRK', 'EMA', 'FVG'];
  const TYPE_VI = { SWP: 'quét swing M15', SWD: 'quét PDH/PDL/phiên Á', BOX: 'quét biên tích lũy', CHO: 'CHoCH sau quét', BOS: 'BOS M15 cùng EMA M30', BRK: 'phá biên phiên Á', EMA: 'hồi EMA34 M15', FVG: 'hồi vào FVG M15' };
  let MODEL = null;

  // ---------- chỉ báo ----------
  function resample(c, ms) { const out = []; let cur = null; for (const x of c) { const s = Math.floor(x.t / ms) * ms; if (!cur || cur.t !== s) { if (cur) out.push(cur); cur = { t: s, ct: s + ms, o: x.o, h: x.h, l: x.l, c: x.c, last: x.ct }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.ct; } } if (cur && cur.last >= cur.ct) out.push(cur); return out; }
  function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function mapHTF(c, H, vals) { const out = new Array(c.length).fill(null); let j = -1; for (let i = 0; i < c.length; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) out[i] = vals[j]; } return out; }
  function pivots(c, L) { const H = [], Lw = []; for (let i = L; i < c.length - L; i++) { let ph = true, pl = true; for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; } if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lw.push({ i, p: c[i].l, conf: i + L }); } return { H, L: Lw }; }
  // cấu trúc SMC: hướng swing (BOS/CHoCH theo giá đóng) + dealing range
  function swingStruct(c, L = 3) {
    const pv = pivots(c, L), S = new Array(c.length); let ih = 0, il = 0, sh = [], sl = [], d = 0, sL = null, sLi = 0, sH = null, sHi = 0, top = -Infinity, bot = Infinity; const bH = new Set(), bL = new Set();
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
  const hU = (t) => new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
  const vnHM = (t) => { const d = new Date(t + 7 * 36e5); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };

  // ---------- chuẩn bị mọi dãy chỉ báo cho nến M15 ----------
  function prep(D) {
    const c = D.m5, n = c.length, m15 = D.m15, m30 = resample(m15, 18e5), h1 = D.h1 && D.h1.length ? D.h1 : resample(m15, 36e5), h4 = resample(h1, 144e5);
    const P = { c, n };
    const a15 = atr(m15); P.A = mapHTF(c, m15, a15);
    const avg = []; let s = 0; for (let i = 0; i < a15.length; i++) { s += a15[i]; if (i >= 1920) s -= a15[i - 1920]; avg.push(s / Math.min(i + 1, 1920)); } P.Aavg = mapHTF(c, m15, avg);
    P.A5 = atr(c);
    const E = (cc, tgt) => [mapHTF(c, cc, ema(cc.map(x => x.c), 34)), mapHTF(c, cc, ema(cc.map(x => x.c), 89))];
    P.e5 = [ema(c.map(x => x.c), 34), ema(c.map(x => x.c), 89)]; P.e15 = E(m15); P.e30 = E(m30); P.e60 = E(h1); P.e240 = E(h4);
    P.s15 = mapHTF(c, m15, swingStruct(m15, 3)); P.s60 = mapHTF(c, h1, swingStruct(h1, 3));
    P.pv = pivots(c, 3);
    // mức ngày (UTC): PDH/PDL, đỉnh/đáy hôm nay, phiên Á 00–06 UTC, ADR 10 ngày
    P.lv = new Array(n); let day = null, dH = -Infinity, dL = Infinity, pdH = null, pdL = null, aH = -Infinity, aL = Infinity; const ranges = [];
    for (let i = 0; i < n; i++) {
      const x = c[i], dk = Math.floor(x.t / 864e5), hr = new Date(x.t).getUTCHours();
      if (dk !== day) { if (day !== null && dH > -Infinity) { pdH = dH; pdL = dL; ranges.push(dH - dL); if (ranges.length > 10) ranges.shift(); } day = dk; dH = -Infinity; dL = Infinity; aH = -Infinity; aL = Infinity; }
      dH = Math.max(dH, x.h); dL = Math.min(dL, x.l); if (hr < 6) { aH = Math.max(aH, x.h); aL = Math.min(aL, x.l); }
      P.lv[i] = { pdH, pdL, dH, dL, aH: hr >= 6 && aH > -Infinity ? aH : null, aL: hr >= 6 && aL < Infinity ? aL : null, asiaRun: hr < 6 ? [aL, aH] : null, adr: ranges.length ? ranges.reduce((u, v) => u + v, 0) / ranges.length : null, day: dk };
    }
    // swing M15 chưa bị lấy (để tìm thanh khoản) — tính khi cần
    return P;
  }
  // các swing M15 đã xác nhận tới nến k và chưa bị giá vượt (thanh khoản còn nằm đó)
  function liveSwings(P, k, side, look = 96) {
    const c = P.c, arr = side > 0 ? P.pv.H : P.pv.L, out = [];
    for (let j = arr.length - 1; j >= 0; j--) { const q = arr[j]; if (q.conf > k) continue; if (q.i < k - look) break;
      let ok = true; for (let u = q.i + 1; u < k; u++) if (side > 0 ? c[u].h > q.p : c[u].l < q.p) { ok = false; break; } if (ok) out.push(q); }
    return out; // mới nhất trước
  }

  // ---------- tầng 1: ứng viên ở nến k ----------
  function candidatesAt(P, k, SP, st) {
    const c = P.c, x = c[k], a = P.A[k]; if (!(a > 0) || k < 100) return [];
    const L = P.lv[k], hr = new Date(x.t).getUTCHours(), res = { 1: {}, '-1': {} };
    const add = (d, type, sl) => { const r = res[d]; if (!r[type]) r[type] = sl; };
    for (const d of [1, -1]) {
      const ext = d > 0 ? x.l : x.h, back = (lvl) => d > 0 ? x.l < lvl && x.c > lvl : x.h > lvl && x.c < lvl, slW = ext - d * P.pad(a);
      // SWP: quét swing M15 còn nguyên
      const sw = liveSwings(P, k, -d, 72).filter(q => q.i < k - 1); for (const q of sw) if (back(q.p)) { add(d, 'SWP', slW); st.lastSweep[d] = { k, ext }; break; }
      // SWD: PDH/PDL, đỉnh/đáy phiên Á — lần quét đầu (6 nến trước chưa chạm)
      for (const lvl of d > 0 ? [L.pdL, L.aL] : [L.pdH, L.aH]) { if (lvl == null) continue; let fresh = true; for (let u = Math.max(0, k - 6); u < k; u++) if (d > 0 ? c[u].l <= lvl : c[u].h >= lvl) fresh = false; if (fresh && back(lvl)) { add(d, 'SWD', slW); st.lastSweep[d] = { k, ext }; } }
      // BOX: tích lũy 2h < 3 ATR, râu xuyên ≥ 0.4 ATR rồi đóng lại trong vùng
      { let hi = -Infinity, lo = Infinity; for (let u = k - 24; u < k; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); } const w = hi - lo;
        if (w < 3 * a && w >= 0.8 * a) { if (d > 0 ? x.l <= lo - 0.4 * a && x.c > lo : x.h >= hi + 0.4 * a && x.c < hi) { add(d, 'BOX', slW); st.lastSweep[d] = { k, ext }; } } }
      // CHO: trong 12 nến sau một cú quét, đóng qua swing đối diện gần nhất
      const ls = st.lastSweep[d]; if (ls && k - ls.k <= 12 && k > ls.k) { const opp = liveSwings(P, k, d, 48)[0]; if (opp && (d > 0 ? x.c > opp.p && c[k - 1].c <= opp.p : x.c < opp.p && c[k - 1].c >= opp.p)) add(d, 'CHO', ls.ext - d * P.pad(a)); }
      const tr30 = Math.sign(P.e30[0][k] - P.e30[1][k]) === d && d * (x.c - P.e30[0][k]) > 0;
      // BOS: cùng xu hướng EMA M30, đóng qua swing M15 cùng chiều
      if (tr30) { const q = liveSwings(P, k, d, 72)[0]; if (q && (d > 0 ? x.c > q.p && c[k - 1].c <= q.p : x.c < q.p && c[k - 1].c >= q.p)) { const o = liveSwings(P, k, -d, 72)[0]; add(d, 'BOS', o ? o.p - d * 0.2 * a : x.c - d * a); } }
      // BRK: phá biên phiên Á lần đầu trong ngày (06–15 UTC)
      if (hr >= 6 && hr < 15 && L.aH != null) { const lvl = d > 0 ? L.aH : L.aL; const key = L.day + ':' + d; if (!st.brk[key] && (d > 0 ? x.c > lvl : x.c < lvl)) { st.brk[key] = 1; const o = liveSwings(P, k, -d, 24)[0]; add(d, 'BRK', o ? o.p - d * 0.2 * a : ext - d * P.pad(a)); } }
      // EMA: xu hướng M30, giá hồi chạm EMA34 M15 rồi đóng bật lại, 6 nến trước nằm phía xu hướng
      { const e = P.e15[0][k]; if (tr30 && e != null && (d > 0 ? x.l <= e + 0.1 * a && x.c > e && x.c > x.o : x.h >= e - 0.1 * a && x.c < e && x.c < x.o)) { let ok = true; for (let u = k - 6; u < k; u++) if (d * (c[u].c - e) < 0) ok = false; if (ok) add(d, 'EMA', ext - d * 0.5 * a); } }
      // FVG: FVG M15 chưa lấp (≤ 36 nến), giá hồi vào lần đầu rồi đóng bật, cấu trúc M15 cùng chiều
      if (P.s15[k] && P.s15[k].d === d) for (let j = k - 2; j >= k - 36 && j >= 2; j--) {
        const top = d > 0 ? c[j].l : c[j - 2].l, bot = d > 0 ? c[j - 2].h : c[j].h; if (!(top - bot >= 0.15 * a)) continue;
        let touched = false; for (let u = j + 1; u < k; u++) if (d > 0 ? c[u].l <= top : c[u].h >= bot) { touched = true; break; } if (touched) continue;
        if (d > 0 ? x.l <= top && x.c > bot && x.c > x.o : x.h >= bot && x.c < top && x.c < x.o) { add(d, 'FVG', (d > 0 ? bot : top) - d * P.pad(a)); break; }
      }
    }
    const out = [];
    for (const d of [1, -1]) { const r = res[d], types = Object.keys(r); if (!types.length) continue;
      const pri = ['CHO', 'SWD', 'SWP', 'BOX', 'FVG', 'EMA', 'BOS', 'BRK'].find(t => r[t] != null);
      const entry = d > 0 ? x.c + SP : x.c; let sl = r[pri] - (d < 0 ? -SP : 0); let risk = d * (entry - sl);
      const minR = Math.max(CFG.minRiskA * a, 3 * SP); if (risk < minR) { risk = minR; sl = entry - d * risk; }
      if (risk > CFG.maxRiskA * a) continue;
      out.push({ k, d, types, pri, entry, sl, risk });
    }
    return out;
  }

  // ---------- đặc trưng (chuẩn hoá ATR, đổi chiều theo hướng lệnh) ----------
  const FEATS = ['d', ...TYPES.map(t => 't_' + t), 'nTypes', 'riskA', 'e5p', 'e5s', 'e5x', 'e15p', 'e15s', 'e15x', 'e30p', 'e30s', 'e30x', 'e60p', 'e60s', 'e60x', 'e240p', 'e240s', 'e240x', 'slope15', 'slope30', 'st15', 'st60', 'pos15', 'pos60',
    'tgtPD', 'oppPD', 'tgtAs', 'oppAs', 'tgtDay', 'oppDay', 'tgtSw', 'oppSw', 'atrR', 'a5a', 'aPct', 'rng2h', 'rng4h', 'dayADR', 'm3', 'm12', 'm48', 'm288', 'body', 'wick', 'cpos', 'rngA', 'hour', 'dow', 'nC12', 'nO12', 'sinceSweep', 'wrS', 'wrO', 'nRes'];
  function features(P, cd, st) {
    const c = P.c, k = cd.k, d = cd.d, x = c[k], a = P.A[k], L = P.lv[k], f = {}, N = (v) => v == null || !isFinite(v) ? NaN : v;
    f.d = d; for (const t of TYPES) f['t_' + t] = cd.types.includes(t) ? 1 : 0; f.nTypes = cd.types.length; f.riskA = cd.risk / a;
    for (const [nm, E] of [['5', P.e5], ['15', P.e15], ['30', P.e30], ['60', P.e60], ['240', P.e240]]) { f['e' + nm + 'p'] = N(d * (x.c - E[0][k]) / a); f['e' + nm + 's'] = N(d * (x.c - E[1][k]) / a); f['e' + nm + 'x'] = N(d * (E[0][k] - E[1][k]) / a); }
    f.slope15 = N(d * (P.e15[0][k] - P.e15[0][k - 12]) / a); f.slope30 = N(d * (P.e30[0][k] - P.e30[0][k - 24]) / a);
    const pos = (S) => S && S.d && S.hi > S.lo ? (d > 0 ? (x.c - S.lo) / (S.hi - S.lo) : (S.hi - x.c) / (S.hi - S.lo)) : NaN;
    f.st15 = P.s15[k] ? d * P.s15[k].d : 0; f.st60 = P.s60[k] ? d * P.s60[k].d : 0; f.pos15 = pos(P.s15[k]); f.pos60 = pos(P.s60[k]);
    const tg = (hi, lo) => [N(d > 0 ? (hi - x.c) / a : (x.c - lo) / a), N(d > 0 ? (x.c - lo) / a : (hi - x.c) / a)];
    [f.tgtPD, f.oppPD] = L.pdH != null ? tg(L.pdH, L.pdL) : [NaN, NaN]; [f.tgtAs, f.oppAs] = L.aH != null ? tg(L.aH, L.aL) : [NaN, NaN]; [f.tgtDay, f.oppDay] = tg(L.dH, L.dL);
    const up = liveSwings(P, k, d, 96)[0], dn = liveSwings(P, k, -d, 96)[0]; f.tgtSw = up ? N(d * (up.p - x.c) / a) : NaN; f.oppSw = dn ? N(d * (x.c - dn.p) / a) : NaN;
    f.atrR = N(a / P.Aavg[k]); f.a5a = N(P.A5[k] / a); f.aPct = N(1000 * a / x.c);
    const rng = (m) => { let hi = -Infinity, lo = Infinity; for (let u = Math.max(0, k - m + 1); u <= k; u++) { hi = Math.max(hi, c[u].h); lo = Math.min(lo, c[u].l); } return (hi - lo) / a; };
    f.rng2h = rng(24); f.rng4h = rng(48); f.dayADR = L.adr ? N((L.dH - L.dL) / L.adr) : NaN;
    const mom = (m) => k - m >= 0 ? d * (x.c - c[k - m].c) / a : NaN; f.m3 = mom(3); f.m12 = mom(12); f.m48 = mom(48); f.m288 = mom(288);
    const rg = x.h - x.l || 1e-9; f.body = d * (x.c - x.o) / rg; f.wick = (d > 0 ? Math.min(x.o, x.c) - x.l : x.h - Math.max(x.o, x.c)) / rg; f.cpos = d > 0 ? (x.c - x.l) / rg : (x.h - x.c) / rg; f.rngA = rg / a;
    f.hour = hU(x.t + 3e5); f.dow = new Date(x.t).getUTCDay();
    let nc = 0, no = 0; for (const h of st.hist) { if (h.k >= k - 12 && h.k < k) { if (h.d === d) nc++; else no++; } } f.nC12 = nc; f.nO12 = no;
    const ls = st.lastSweep[d]; f.sinceSweep = ls ? Math.min(k - ls.k, 99) : 99;
    // chế độ thị trường: các ứng viên 24h qua (đã có kết quả) cùng chiều / ngược chiều thắng bao nhiêu (TP 1R trước SL)
    let ws = 0, ns = 0, wo = 0, no2 = 0; for (const r of st.res) { if (r.x > x.ct || x.ct - r.t > 864e5) continue; if (r.d === d) { ns++; ws += r.w; } else { no2++; wo += r.w; } }
    f.wrS = ns >= 3 ? ws / ns : NaN; f.wrO = no2 >= 3 ? wo / no2 : NaN; f.nRes = ns + no2;
    return FEATS.map(nm => Number.isNaN(f[nm]) ? NaN : Math.round(f[nm] * 1e4) / 1e4);
  }

  // ---------- mô hình (cây LightGBM rút gọn) ----------
  function setModel(m) { MODEL = m; }
  // MODEL.models = [{ trees: [...] }, ...] (nhiều mô hình khác hạt giống → lấy trung bình xác suất)
  function predict(v) {
    if (!MODEL) return null; let sum = 0;
    for (const m of MODEL.models) { let s = 0;
      for (const t of m.trees) { let nd = t; while (Array.isArray(nd)) { const [fi, thr, dl, L, R, nanMode] = nd; let x = v[fi]; let left;
          if (x == null || Number.isNaN(x)) { if (nanMode === 2) left = dl === 1; else left = 0 <= thr; } else left = x <= thr; nd = left ? L : R; } s += nd; }
      sum += 1 / (1 + Math.exp(-s)); }
    return sum / MODEL.models.length;
  }

  // ---------- quét toàn bộ cửa sổ: ứng viên + đặc trưng (+ xác suất) ----------
  function scan(D, opt) {
    opt = opt || {}; if (opt.cfg) Object.assign(CFG, opt.cfg); const SP = opt.spread || 0, c = D.m5; if (!c || c.length < 400 || !D.m15 || D.m15.length < 200) return { P: null, cands: [] };
    const P = prep(D); P.pad = (a) => CFG.pad * a; const st = { lastSweep: {}, brk: {}, hist: [], res: [] }, cands = [];
    const from = opt.from != null ? opt.from : 300;
    for (let k = Math.max(100, from - 300); k < P.n; k++) {
      const cs = candidatesAt(P, k, SP, st); if (k < from) { for (const cd of cs) { st.hist.push(cd); const F = follow(c, k, cd.d, cd.entry, cd.sl, cd.entry + cd.d * cd.risk, SP, CFG.hold); if (F.exitT) st.res.push({ t: c[k].ct, x: F.exitT, d: cd.d, w: F.state === 'WIN' ? 1 : 0 }); } continue; }
      for (const cd of cs) { cd.f = features(P, cd, st); cd.p = predict(cd.f); cd.t = c[k].t; cd.ct = c[k].ct; cands.push(cd); }
      for (const cd of cs) { st.hist.push(cd); const F = follow(c, k, cd.d, cd.entry, cd.sl, cd.entry + cd.d * cd.risk, SP, CFG.hold); if (F.exitT) st.res.push({ t: c[k].ct, x: F.exitT, d: cd.d, w: F.state === 'WIN' ? 1 : 0 }); }
      if (st.hist.length > 200) st.hist.splice(0, 100); if (st.res.length > 400) st.res.splice(0, 200);
    }
    return { P, cands };
  }
  // theo dõi lệnh: SL/TP trên nến M15 sau (nến chạm cả hai → SL), hết giờ → đóng ở giá đóng nến
  function follow(c, k, d, entry, sl, tp, SP, hold) {
    for (let u = k + 1; u < c.length && u <= k + hold; u++) { const z = c[u], lo = d > 0 ? z.l : z.l + SP, hi = d > 0 ? z.h : z.h + SP;
      if (d > 0 ? lo <= sl : hi >= sl) return { state: 'LOSS', exitP: sl, exitT: z.ct, u };
      if (d > 0 ? hi >= tp : lo <= tp) return { state: 'WIN', exitP: tp, exitT: z.ct, u }; }
    if (k + hold < c.length) { const z = c[k + hold]; return { state: 'TIME', exitP: d > 0 ? z.c : z.c + SP, exitT: z.ct, u: k + hold }; }
    return { state: 'OPEN', exitP: null, exitT: null, u: c.length };
  }
  function whyText(cd) {
    const f = {}; FEATS.forEach((nm, i) => f[nm] = cd.f[i]); const out = [];
    out.push(cd.types.map(t => TYPE_VI[t]).join(' + '));
    const al = ['e15x', 'e30x', 'e60x', 'e240x'].filter(nm => f[nm] > 0).length; out.push(`EMA34/89 cùng chiều ${al}/4 khung (M15→H4)`);
    if (f.st15 > 0 && f.st60 > 0) out.push('cấu trúc SMC M15 + H1 cùng chiều'); else if (f.st15 < 0 && f.st60 < 0) out.push('đánh ngược cấu trúc M15 + H1 (đảo chiều)');
    if (!Number.isNaN(f.pos15)) out.push(f.pos15 < 0.5 ? `vào ở vùng ${cd.d > 0 ? 'discount' : 'premium'} của sóng M15` : `vào ở vùng ${cd.d > 0 ? 'premium' : 'discount'} của sóng M15`);
    out.push(`giờ ${vnHM(cd.ct)} VN`);
    return out;
  }
  // ---------- run: giống các mô hình khác — trả về lệnh AI đã vào (xác suất ≥ ngưỡng, mỗi lúc 1 lệnh) ----------
  function run(D, opt) {
    opt = opt || {}; const SP = opt.spread || 0, thr = opt.thr != null ? opt.thr : (MODEL && MODEL.thr) || CFG.thr, rr = (MODEL && MODEL.rr) || CFG.rr, hold = CFG.hold;
    const { P, cands } = scan(D, opt); const out = []; if (!P || !MODEL) return out; let busy = -1;
    for (const cd of cands) {
      if (cd.k <= busy || cd.p == null || cd.p < thr) continue;
      const tp = cd.entry + cd.d * rr * cd.risk, F = follow(P.c, cd.k, cd.d, cd.entry, cd.sl, tp, SP, hold);
      const s = { id: `ai-${cd.t}-${cd.d > 0 ? 'B' : 'S'}`, tf: 'm15', model: NAME, grade: 'I', side: cd.d, t: cd.t, ct: cd.ct, entry: cd.entry, sl: cd.sl, tp, risk: cd.risk, rr, spread: SP,
        prob: +cd.p.toFixed(3), types: cd.types, info: whyText(cd), hour: (new Date(cd.ct).getUTCHours() + 7) % 24, tgOK: true, fillT: cd.ct, state: F.state, exitP: F.exitP, exitT: F.exitT, r: null, pts: null };
      if (F.exitT) { s.pts = cd.d * (F.exitP - cd.entry); s.r = s.pts / cd.risk; }
      busy = F.state === 'OPEN' ? Infinity : F.u; out.push(s);
    }
    return out;
  }

  // ---------- status: bây giờ cần làm gì ----------
  function status(D, opt) {
    opt = opt || {}; const SP = opt.spread || 0, dp = opt.dp != null ? opt.dp : 2, f = (v) => (+v).toFixed(dp), thr = (MODEL && MODEL.thr) || CFG.thr;
    const n0 = D.m5.length, { P, cands } = scan(D, { ...opt, from: Math.max(300, n0 - 72) }); if (!P) return null;
    const k = P.n - 1, x = P.c[k], a = P.A[k], L = P.lv[k], hr = new Date(x.ct).getUTCHours();
    const tfs = [['M15', P.e15], ['M30', P.e30], ['H1', P.e60], ['H4', P.e240]].map(([nm, E]) => ({ nm, d: Math.sign(E[0][k] - E[1][k]), above: x.c > E[0][k], e34: E[0][k], e89: E[1][k] }));
    const st15 = P.s15[k] ? P.s15[k].d : 0, st60 = P.s60[k] ? P.s60[k].d : 0;
    const score = tfs.reduce((u, t) => u + t.d, 0) + st15 + st60;
    const bias = score >= 3 ? 1 : score <= -3 ? -1 : 0;
    const biasTxt = bias > 0 ? 'Ưu tiên BUY' : bias < 0 ? 'Ưu tiên SELL' : 'Hai chiều / chưa rõ xu hướng';
    const trend = tfs.map(t => `${t.nm} ${t.d > 0 ? '▲' : '▼'}${t.above ? ' (giá trên EMA34)' : ' (giá dưới EMA34)'}`).join(' · ') + ` · SMC M15 ${st15 > 0 ? 'tăng' : st15 < 0 ? 'giảm' : '—'} · H1 ${st60 > 0 ? 'tăng' : st60 < 0 ? 'giảm' : '—'}`;
    // thanh khoản quanh giá
    const lv = []; const push = (name, p, side) => { if (p != null && isFinite(p)) lv.push({ name, p, side, dist: p - x.c }); };
    push('PDH', L.pdH, 1); push('PDL', L.pdL, -1); if (L.aH != null) { push('Đỉnh phiên Á', L.aH, 1); push('Đáy phiên Á', L.aL, -1); }
    const sh = liveSwings(P, k + 1, 1, 96)[0], sl = liveSwings(P, k + 1, -1, 96)[0]; if (sh) push('BSL swing M15', sh.p, 1); if (sl) push('SSL swing M15', sl.p, -1);
    lv.sort((u, v) => v.p - u.p);
    const above = lv.filter(z => z.p > x.c).sort((u, v) => u.p - v.p), below = lv.filter(z => z.p < x.c).sort((u, v) => v.p - u.p);
    // FVG M15 chưa lấp gần nhất mỗi chiều
    const fvg = { 1: null, '-1': null }; for (const d of [1, -1]) for (let j = k; j >= k - 36 && j >= 2; j--) { const c = P.c, top = d > 0 ? c[j].l : c[j - 2].l, bot = d > 0 ? c[j - 2].h : c[j].h; if (!(top - bot >= 0.15 * a)) continue; let t2 = false; for (let u = j + 1; u <= k; u++) if (d > 0 ? c[u].l <= top : c[u].h >= bot) { t2 = true; break; } if (!t2) { fvg[d] = { top, bot }; break; } }
    const TS = (!opt.analysisOnly && MODEL && MODEL.typeStats) || {}, ws = (t, al) => { const z = TS[t]; return z && z.win != null ? ` · lịch sử: AI duyệt ${z.take}% ứng viên loại này, thắng ${z.win}%` : ''; };
    const plan = [];
    const dirs = bias ? [bias] : [1, -1];
    for (const d of dirs) {
      const side = d > 0 ? 'BUY' : 'SELL', liq = d > 0 ? below[0] : above[0], tgt = d > 0 ? above[0] : below[0], e = P.e15[0][k], al = bias === d;
      if (liq && Math.abs(liq.dist) < 4 * a) plan.push(`⏳ ${side}: chờ giá quét ${liq.name} ${f(liq.p)} (cách ${Math.abs(liq.dist).toFixed(1)} giá) rồi nến M15 đóng ${d > 0 ? 'lại trên' : 'lại dưới'} mức đó → AI chấm điểm${ws('SWP', al)}`);
      if (Math.sign(P.e30[0][k] - P.e30[1][k]) === d && d * (x.c - e) > 0) plan.push(`⏳ ${side}: chờ giá hồi về EMA34 M15 ≈ ${f(e)} (cách ${Math.abs(x.c - e).toFixed(1)} giá) rồi nến M15 bật ${d > 0 ? 'lên' : 'xuống'}${ws('EMA', al)}`);
      if (fvg[d]) plan.push(`⏳ ${side}: FVG M15 chưa lấp ${f(fvg[d].bot)} – ${f(fvg[d].top)} — chờ giá hồi vào rồi bật`);
      const bos = liveSwings(P, k + 1, d, 72)[0]; if (bos && Math.abs(bos.p - x.c) < 3 * a) plan.push(`⏳ ${side} tiếp diễn: nến M15 đóng ${d > 0 ? 'trên đỉnh' : 'dưới đáy'} swing ${f(bos.p)}${ws('BOS', al)}`);
      if (tgt) plan.push(`🎯 Mục tiêu thanh khoản phía ${d > 0 ? 'trên' : 'dưới'}: ${tgt.name} ${f(tgt.p)} (${Math.abs(tgt.dist).toFixed(1)} giá)`);
    }
    if (hr < 6) { const r = L.asiaRun; if (r && r[0] < Infinity) plan.unshift(`🌏 Phiên Á đang tạo biên ${f(r[0])} – ${f(r[1])} (đến 13:00 VN). Sau 13h: phá biên → ứng viên breakout, quét biên rồi đóng lại → ứng viên đảo chiều.`); }
    const weekend = [0, 6].includes(new Date(x.ct).getUTCDay());
    let session = hr >= 6 && hr < 10 ? 'Phiên London (13h–17h VN) — thanh khoản tốt' : hr >= 12 && hr < 16 ? 'Phiên New York (19h–23h VN) — thanh khoản tốt nhất' : hr >= 10 && hr < 12 ? 'Giữa phiên (17h–19h VN) — hay đi ngang chờ New York' : hr < 6 ? 'Phiên Á (7h–13h VN) — biên độ hẹp' : 'Cuối ngày (sau 23h VN) — thanh khoản mỏng, nên đứng ngoài';
    if (weekend) session = 'Cuối tuần — thị trường vàng nghỉ / dữ liệu mỏng';
    // ứng viên gần đây và quyết định của AI
    const recent = cands.filter(cd => cd.k >= k - 24).slice(-6).reverse().map(cd => ({ t: cd.ct, side: cd.d, types: cd.types.map(t => TYPE_VI[t]), p: cd.p == null ? null : +cd.p.toFixed(3), take: cd.p != null && cd.p >= thr, entry: cd.entry, sl: cd.sl }));
    const lastTake = recent.find(r => r.take);
    let now;
    if (lastTake && !opt.analysisOnly && P.c.length - 1 - cands.find(cd => cd.ct === lastTake.t).k <= 3) now = `🟢 VÀO LỆNH ${lastTake.side > 0 ? 'BUY' : 'SELL'} — AI chấm ${(100 * lastTake.p).toFixed(0)}% (${lastTake.types.join(' + ')})`;
    else if (recent.length) now = `⚪ Chưa vào — ứng viên gần nhất lúc ${vnHM(recent[0].t)} (${recent[0].types.join(' + ')}) AI chấm ${recent[0].p == null ? '—' : (100 * recent[0].p).toFixed(0) + '%'} ${opt.analysisOnly ? '(chỉ tham khảo — không vào lệnh)' : (recent[0].take ? '≥' : '<') + ' ngưỡng ' + (100 * thr).toFixed(0) + '%'}`;
    else now = '⚪ Chưa có ứng viên trong 6 giờ qua — đứng ngoài, chờ các mức bên dưới';
    return { t: x.ct, price: x.c, atr: +a.toFixed(dp), bias, biasTxt, trend, session, now, plan: plan.slice(0, 7), levels: lv.map(z => ({ name: z.name, p: +z.p.toFixed(dp), dist: +z.dist.toFixed(dp) })), recent, thr };
  }

  const FINAL = { WIN: 1, LOSS: 1, TIME: 1 };
  const RULE = 'Gom 8 loại ứng viên ICT/SMC/EMA/breakout trên M15 vàng → AI (LightGBM, ~55 đặc trưng) chấm xác suất chạm TP trước SL → vào khi ≥ ngưỡng · SL theo cấu trúc (0.5–2.5 ATR M15) · TP 1R · giữ ≤ 12h · mỗi lúc 1 lệnh';
  return { run, scan, status, whyText, features, candidatesAt, prep, predict, setModel, follow, FEATS, TYPES, TYPE_VI, CFG, FINAL, RULE, NAME, version, telegram: true, get model() { return MODEL; } };
});
