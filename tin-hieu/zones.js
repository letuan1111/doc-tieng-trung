/* 🧱 Vùng S/R H4/H1 + quét M15 → MSS M15 — "AI vào lệnh" (chiến lược của Letuan, kiểm 2 năm vàng: research/zones.mjs, zones-ai.mjs)
 *  1. Vẽ vùng: đỉnh/đáy swing H4 (3 nến mỗi bên, 20 ngày) + H1 (4 nến mỗi bên, 10 ngày), gộp các mức cách nhau ≤ 0.35 ATR H4.
 *     Điểm vùng = mỗi lần chạm H4 2đ · H1 1đ (× tới 2 lần theo độ bật sau lần chạm) · +1 có cả H4 & H1 · +1 đổi vai. Giao dịch vùng ≥ 4 điểm.
 *  2. Quét: nến M15 trước còn trong vùng, râu xuyên mép vùng (≤ 0.6 ATR H4) rồi đóng lại trong vùng.
 *  3. Cấu trúc: trong ≤ 16 nến M15, nến M15 đóng qua đỉnh (BUY) / đáy (SELL) swing M15 gần nhất trước cú quét = MSS. Huỷ nếu đóng thủng mép vùng.
 *  4. AI chấm điểm: +1 ngược xu hướng EMA34/89 M15 · +1 thuận xu hướng EMA34/89 H4 · +1 giờ mạnh (8–9h, 19–22h VN) · +1 MSS ≤ 4 nến · −1 giờ chết (3–4h, 10–11h).
 *     AI chỉ VÀO LỆNH khi ≥ 2 điểm. Vào khi nến MSS đóng · SL ngoài râu quét + 0.2 ATR M15 · TP 3R · giữ 24h · mỗi lần 1 lệnh.
 *  Kiểm 2 năm vàng (Dukascopy, spread 0.35, 0.02 lot): 133 lệnh, thắng 23%, +1.681$, sụt tối đa 298$, thua liên tiếp 5, lời cả 4 quý 6 tháng.
 *  Dầu WTI: lỗ ở mọi biến thể → chỉ dùng cho vàng.
 */
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.ZONES = E; })(typeof self !== 'undefined' ? self : this, function () {
  const CFG = { look4: 120, look1: 240, merge: 0.35, minScore: 4, minDepth: 0.05, maxDepth: 0.6, wait: 16, pad: 0.2, rr: 3, minRiskA: 0.3, maxRiskA4: 1.5, holdH: 24, reuseH: 12, aiMin: 2,
    strong: [8, 9, 19, 20, 21, 22], dead: [3, 4, 10, 11] };
  const H4MS = 144e5, VN = 7 * 36e5;
  const hrVN = (t) => new Date(t + VN).getUTCHours();
  function resample(c, ms) { const out = []; let cur = null; for (const x of c) { const s = Math.floor(x.t / ms) * ms; if (!cur || cur.t !== s) { if (cur) out.push(cur); cur = { t: s, ct: s + ms, o: x.o, h: x.h, l: x.l, c: x.c, last: x.ct }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.ct; } } if (cur && cur.last >= cur.ct) out.push(cur); return out; }
  function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function pivots(c, L) { const H = [], Lw = []; for (let i = L; i < c.length - L; i++) { let ph = true, pl = true; for (let k = 1; k <= L; k++) { if (c[i - k].h >= c[i].h || c[i + k].h > c[i].h) ph = false; if (c[i - k].l <= c[i].l || c[i + k].l < c[i].l) pl = false; } if (ph) H.push({ i, p: c[i].h, conf: i + L }); if (pl) Lw.push({ i, p: c[i].l, conf: i + L }); } return { H, L: Lw }; }
  function react(c, A, q, kind) { const i = q.i; let m = 0; for (let u = i + 1; u < Math.min(c.length, i + 13); u++) m = Math.max(m, kind > 0 ? c[i].h - c[u].l : c[u].h - c[i].l); return m / A[i]; }

  // D = { h1, m15, m5? } nến đã đóng. Trả về toàn bộ phân tích (vùng hiện tại, tín hiệu, đang chờ, kế hoạch AI)
  function analyze(D, opt) {
    opt = opt || {}; const cfg = { ...CFG, ...(opt.cfg || {}) }, SP = opt.spread || 0;
    const h1 = D.h1 || [], m15 = D.m15 || [], m5 = D.m5 || [];
    const res = { zones: [], signals: [], watch: [], plan: [], a4: 0, a15: 0, px: m15.length ? m15[m15.length - 1].c : null, trend15: 0, trend4: 0 };
    if (h1.length < 200 || m15.length < 200) return res;
    const h4 = resample(h1, H4MS), A4 = atr(h4), A1 = atr(h1), A15 = atr(m15), P4 = pivots(h4, 3), P1 = pivots(h1, 4), P15 = pivots(m15, 2);
    for (const [c, A, P] of [[h4, A4, P4], [h1, A1, P1]]) { for (const q of P.H) q.r = react(c, A, q, 1); for (const q of P.L) q.r = react(c, A, q, -1); }
    const c15 = m15.map(x => x.c), E34 = ema(c15, 34), E89 = ema(c15, 89), c4 = h4.map(x => x.c), F34 = ema(c4, 34), F89 = ema(c4, 89);
    function zonesFrom(k4, k1) {
      if (k4 < 30 || k1 < 30) return { Z: [], a4: 0 }; const a4 = A4[k4], pts = [];
      const add = (P, k, look, w, tf) => { for (const side of ['H', 'L']) for (const q of P[side]) if (q.conf <= k && q.i >= k - look) pts.push({ p: q.p, w: w * (1 + Math.min(q.r, 3) / 3), tf, k: side === 'H' ? 1 : -1 }); };
      add(P4, k4, cfg.look4, 2, 4); add(P1, k1, cfg.look1, 1, 1); pts.sort((a, b) => a.p - b.p);
      const Z = []; for (const q of pts) { const z = Z[Z.length - 1]; if (z && q.p - z.hi <= cfg.merge * a4) { z.hi = Math.max(z.hi, q.p); z.pts.push(q); } else Z.push({ lo: q.p, hi: q.p, pts: [q] }); }
      for (const z of Z) { if (z.hi - z.lo < 0.2 * a4) { const m = (z.lo + z.hi) / 2; z.lo = m - 0.1 * a4; z.hi = m + 0.1 * a4; }
        z.touch = z.pts.length; z.h4 = z.pts.filter(q => q.tf === 4).length; z.h1 = z.touch - z.h4; z.flip = new Set(z.pts.map(q => q.k)).size === 2;
        z.score = z.pts.reduce((s, q) => s + q.w, 0) + (z.h4 && z.h1 ? 1 : 0) + (z.flip ? 1 : 0); delete z.pts; }
      return { Z, a4 };
    }
    const t4At = (t) => { let lo = 0, hi = h4.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (h4[m].ct <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k < 0 ? 0 : Math.sign(F34[k] - F89[k]); };
    // ---- tín hiệu
    const cand = []; let k4 = -1, k1 = -1, cur = null, pend = [], ih = 0, il = 0; const SH = [], SLw = [], used = new Map();
    for (let i = 120; i < m15.length; i++) { const x = m15[i], a = A15[i - 1];
      while (ih < P15.H.length && P15.H[ih].conf <= i) SH.push(P15.H[ih++]); while (il < P15.L.length && P15.L[il].conf <= i) SLw.push(P15.L[il++]);
      let ch = false; while (k4 + 1 < h4.length && h4[k4 + 1].ct <= x.t) { k4++; ch = true; } while (k1 + 1 < h1.length && h1[k1 + 1].ct <= x.t) { k1++; ch = true; }
      if (ch || !cur) cur = zonesFrom(k4, k1); const { Z, a4 } = cur; if (!a4) continue; const prev = m15[i - 1];
      for (const z of Z) { if (z.score < cfg.minScore) continue; const key = Math.round(z.lo / (0.2 * a4)); if ((used.get(key) || 0) > x.t) continue;
        if (prev.l > z.lo && x.l < z.lo - cfg.minDepth * a && x.l > z.lo - cfg.maxDepth * a4 && x.c > z.lo) {
          const q = SH.filter(q => q.i < i && q.i >= i - 24).slice(-1)[0]; pend.push({ d: 1, z, i0: i, ex: x.l, lvl: q ? q.p : Math.max(...m15.slice(i - 6, i).map(v => v.h)), a, a4 }); used.set(key, x.t + cfg.reuseH * 36e5); }
        if (prev.h < z.hi && x.h > z.hi + cfg.minDepth * a && x.h < z.hi + cfg.maxDepth * a4 && x.c < z.hi) {
          const q = SLw.filter(q => q.i < i && q.i >= i - 24).slice(-1)[0]; pend.push({ d: -1, z, i0: i, ex: x.h, lvl: q ? q.p : Math.min(...m15.slice(i - 6, i).map(v => v.l)), a, a4 }); used.set(key, x.t + cfg.reuseH * 36e5); } }
      const keep = []; for (const p of pend) { if (i === p.i0) { keep.push(p); continue; } const d = p.d, edge = d > 0 ? p.z.lo : p.z.hi;
        p.ex = d > 0 ? Math.min(p.ex, x.l) : Math.max(p.ex, x.h);
        if (d * (x.c - edge) < 0) { p.dead = 'đóng thủng mép vùng'; continue; } if (d * (p.ex - edge) < -cfg.maxDepth * p.a4) { p.dead = 'quét quá sâu'; continue; }
        if (d * (x.c - p.lvl) > 0) { cand.push({ ...p, iC: i }); continue; }
        if (i - p.i0 < cfg.wait) keep.push(p); }
      pend = keep; }
    const last15 = m15[m15.length - 1];
    res.watch = pend.map(p => ({ side: p.d, zone: { lo: p.z.lo, hi: p.z.hi, score: p.z.score }, sweep: p.ex, sweepT: m15[p.i0].t, mss: p.lvl, until: m15[p.i0].ct + cfg.wait * 9e5, edge: p.d > 0 ? p.z.lo : p.z.hi, a: p.a }));
    // ---- vào lệnh + mô phỏng (M5 nếu có, nếu không dùng M15)
    const i5 = new Map(m5.map((x, j) => [x.t, j])); let busyT = 0;
    for (const s of cand) { const x = m15[s.iC], d = s.d, trend = Math.sign(E34[s.iC] - E89[s.iC]), t4 = t4At(x.ct), h = hrVN(x.ct), bars = s.iC - s.i0;
      const why = []; let ai = 0;
      if (trend === -d) { ai++; why.push('ngược xu hướng M15 (bắt đảo chiều tại vùng)'); } else why.push('thuận M15 (không cộng)');
      if (t4 === d) { ai++; why.push('thuận xu hướng H4'); } else why.push('ngược H4 (không cộng)');
      if (cfg.strong.includes(h)) { ai++; why.push(`giờ mạnh ${h}h`); } if (cfg.dead.includes(h)) { ai--; why.push(`giờ chết ${h}h (−1)`); }
      if (bars <= 4) { ai++; why.push(`MSS nhanh (${bars} nến)`); } else why.push(`MSS chậm (${bars} nến)`);
      const entry = d > 0 ? x.c + SP : x.c, sl = s.ex - d * (cfg.pad * s.a + (d < 0 ? SP : 0)), risk = d * (entry - sl), tp = entry + d * cfg.rr * risk;
      const sg = { id: `zn-${x.t}-${d > 0 ? 'B' : 'S'}`, tf: 'm15', model: 'Vùng H4/H1 + quét M15', grade: 'Z', side: d, t: m15[s.i0].t, ct: x.ct, entry, sl, tp, risk, rr: cfg.rr, spread: SP,
        zone: { lo: s.z.lo, hi: s.z.hi, score: +s.z.score.toFixed(1), touch: s.z.touch, h4: s.z.h4, h1: s.z.h1, flip: s.z.flip }, sweep: s.ex, sweepName: d > 0 ? `đáy vùng hỗ trợ ${s.z.lo.toFixed(2)}` : `đỉnh vùng kháng cự ${s.z.hi.toFixed(2)}`,
        mss: s.lvl, mssBars: bars, ai, aiWhy: why, trend15: trend, trend4: t4, hour: h, fvg: null, tgOK: false, state: 'OPEN', fillT: x.ct, exitT: null, exitP: null, r: null, pts: null };
      if (!(risk > cfg.minRiskA * s.a) || risk > cfg.maxRiskA4 * s.a4) { sg.state = 'SKIP'; sg.why = `SL ${risk.toFixed(2)} ngoài khoảng cho phép`; res.signals.push(sg); continue; }
      if (ai < cfg.aiMin) { sg.state = 'SKIP'; sg.why = `AI ${ai} điểm < ${cfg.aiMin}`; res.signals.push(sg); continue; }
      if (x.ct < busyT) { sg.state = 'SKIP'; sg.why = 'đang có lệnh Vùng S/R khác'; res.signals.push(sg); continue; }
      sg.tgOK = true; const j = i5.get(x.ct), B = j != null ? m5 : m15, j0 = j != null ? j : s.iC + 1, hold = (cfg.holdH * 36e5) / (j != null ? 3e5 : 9e5);
      let u = j0; for (; u < Math.min(B.length, j0 + hold); u++) { const y = B[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
        if (d > 0 ? lo <= sl : hi >= sl) { sg.state = 'LOSS'; sg.exitP = sl; sg.exitT = y.ct; break; } if (d > 0 ? hi >= tp : lo <= tp) { sg.state = 'WIN'; sg.exitP = tp; sg.exitT = y.ct; break; } }
      if (sg.state === 'OPEN' && u >= j0 + hold && u - 1 < B.length) { const y = B[u - 1]; sg.state = 'TIME'; sg.exitP = d > 0 ? y.c : y.c + SP; sg.exitT = y.ct; }
      if (sg.exitP != null) { sg.pts = d * (sg.exitP - entry); sg.r = sg.pts / risk; }
      busyT = sg.exitT || Infinity; res.signals.push(sg); }
    // ---- vùng hiện tại + kế hoạch AI
    let K4 = -1, K1 = -1; while (K4 + 1 < h4.length && h4[K4 + 1].ct <= last15.ct) K4++; while (K1 + 1 < h1.length && h1[K1 + 1].ct <= last15.ct) K1++;
    const now = zonesFrom(K4, K1), px = last15.c, a15 = A15[m15.length - 1]; res.a4 = now.a4; res.a15 = a15; res.px = px;
    res.trend15 = Math.sign(E34[m15.length - 1] - E89[m15.length - 1]); res.trend4 = Math.sign(F34[F34.length - 1] - F89[F89.length - 1]);
    res.zones = now.Z.filter(z => z.score >= cfg.minScore && Math.abs((z.lo + z.hi) / 2 - px) < 6 * now.a4).map(z => ({ ...z, score: +z.score.toFixed(1), kind: z.hi < px ? 'S' : z.lo > px ? 'R' : 'IN' })).sort((a, b) => b.lo - a.lo);
    const lastH = P15.H.filter(q => q.conf < m15.length).slice(-1)[0], lastL = P15.L.filter(q => q.conf < m15.length).slice(-1)[0];
    const sup = res.zones.filter(z => z.kind !== 'R').sort((a, b) => b.hi - a.hi), resis = res.zones.filter(z => z.kind !== 'S').sort((a, b) => a.lo - b.lo);
    const plan = (z, d) => { if (!z) return null; const edge = d > 0 ? z.lo : z.hi, maxEx = edge - d * cfg.maxDepth * now.a4;
      let ai = 0; const why = []; if (res.trend15 === -d) { ai++; why.push('ngược M15 +1'); } if (res.trend4 === d) { ai++; why.push('thuận H4 +1'); }
      return { side: d, zone: z, edge, maxSweep: maxEx, cancel: edge, mssNow: d > 0 ? (lastH && lastH.p) : (lastL && lastL.p), aiBase: ai, aiWhy: why, need: Math.max(0, cfg.aiMin - ai),
        dist: Math.abs(px - edge) }; };
    res.plan = [plan(sup[0], 1), plan(resis[0], -1), plan(sup[1], 1), plan(resis[1], -1)].filter(Boolean);
    return res;
  }
  function run(D, opt) { return analyze(D, opt).signals; }
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1, SKIP: 1 };
  const BACKTEST = '2 năm vàng: 133 lệnh, thắng 23%, +1.681$ (0.02 lot), sụt tối đa 298$, thua liên tiếp 5, lời cả 4 quý';
  return { analyze, run, CFG, FINAL, BACKTEST, version: 'zn-2026-11-06', telegram: true };
});
