/* 🧭 PHÁ BIÊN PHIÊN Á THEO XU HƯỚNG (vàng) — "kịch bản B" đã kiểm 2 năm (research/kehoach-abc.mjs)
 *  1. Xu hướng lúc 13h VN (06:00 UTC): EMA34/89 trên H4 và H1 phải cùng chiều — không cùng chiều thì nghỉ ngày đó.
 *  2. Biên phiên Á = đỉnh/đáy 7h–13h VN (00–06 UTC).
 *  3. 13h–22h VN: nến M15 ĐÓNG ngoài biên theo chiều xu hướng → không đuổi, đặt LIMIT ở mép biên (retest), chờ ≤ 4h.
 *     Giá chạy tới TP trước khi khớp → huỷ.
 *  4. SL = max(0.3 × độ rộng biên, 1 ATR M15) · TP 2R · lời 1.5R dời SL về hoà vốn · 3h sáng VN (20 UTC) còn lệnh thì đóng. Mỗi ngày 1 lệnh.
 *  Kiểm vàng Dukascopy 11/2024–11/2026, spread 0.35, 0.02 lot: 128 lệnh, lãi 38%, +22.6R, +518$, sụt 208$ · năm 1 +227$ · năm 2 +292$.
 *  Không lọc xu hướng (đánh cả 2 chiều): +37$, sụt 1034$ → bộ lọc H4+H1 là then chốt.
 */
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.XUHUONG = E; })(typeof self !== 'undefined' ? self : this, function () {
  const NAME = 'Phá biên Á theo xu hướng', version = 'xh-2026-11-11';
  const CFG = { asiaEndH: 6, lastEntryH: 15, exitH: 20, rngK: 0.3, rr: 2, be: 1.5, wait: 48 };
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1, BE: 1, EXPIRED: 1 };
  const RULE = 'EMA34/89 H4 + H1 cùng chiều lúc 13h VN → M15 đóng ngoài biên phiên Á theo xu hướng → LIMIT retest mép biên (≤ 4h) · SL max(0.3 biên, 1 ATR M15) · TP 2R · 1.5R dời hoà vốn · đóng 3h sáng · 1 lệnh/ngày';
  function resample(c, ms) { const out = []; let cur = null; for (const x of c) { const s = Math.floor(x.t / ms) * ms; if (!cur || cur.t !== s) { if (cur) out.push(cur); cur = { t: s, ct: s + ms, o: x.o, h: x.h, l: x.l, c: x.c, last: x.ct }; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.ct; } } if (cur && cur.last >= cur.ct) out.push(cur); return out; }
  function ema(v, p) { const k = 2 / (p + 1), o = new Array(v.length); let e = v[0]; for (let i = 0; i < v.length; i++) { e = i ? v[i] * k + e * (1 - k) : v[0]; o[i] = e; } return o; }
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  function mapHTF(c, H, vals) { const out = new Array(c.length).fill(null); let j = -1; for (let i = 0; i < c.length; i++) { while (j + 1 < H.length && H[j + 1].ct <= c[i].ct) j++; if (j >= 0) out[i] = vals[j]; } return out; }
  const hrOf = (t) => new Date(t).getUTCHours() + new Date(t).getUTCMinutes() / 60;
  function run(D, opt) {
    opt = opt || {}; const SP = opt.spread || 0, c = D.m5, m15 = D.m15, h1 = D.h1 && D.h1.length ? D.h1 : resample(m15, 36e5), h4 = resample(h1, 144e5), out = [];
    if (!c || c.length < 300 || !m15 || m15.length < 120 || h1.length < 100) return out;
    const E = (H) => [mapHTF(c, H, ema(H.map(x => x.c), 34)), mapHTF(c, H, ema(H.map(x => x.c), 89))];
    const e1 = E(h1), e4 = E(h4), A = mapHTF(c, m15, atr(m15));
    let day = null, S = null, pos = null;
    const close = (k, px, st) => { pos.s.state = st === 'BE' ? 'TIME' : st; pos.s.exitT = c[k].ct; pos.s.exitP = px; pos.s.pts = pos.d * (px - pos.s.entry); pos.s.r = pos.s.pts / pos.s.risk; if (st === 'BE') pos.s.why = 'Hoà vốn (đã dời SL về điểm vào ở 1.5R)'; else if (st === 'TIME') pos.s.why = '3h sáng VN — đóng lệnh cuối ngày'; pos = null; };
    for (let k = 1; k < c.length; k++) {
      const x = c[k], dk = Math.floor(x.t / 864e5), h = hrOf(x.t);
      if (dk !== day) { day = dk; S = { aH: -Infinity, aL: Infinity, T: null, Q: null, done: false }; }
      if (pos) { const d = pos.d, s = pos.s, lo = d > 0 ? x.l : x.l + SP, hi = d > 0 ? x.h : x.h + SP;
        if (d > 0 ? lo <= pos.sl : hi >= pos.sl) close(k, pos.sl, pos.be ? 'BE' : 'LOSS');
        else if (d > 0 ? hi >= s.tp : lo <= s.tp) close(k, s.tp, 'WIN');
        else { if (!pos.be && (d > 0 ? hi >= s.entry + CFG.be * s.risk : lo <= s.entry - CFG.be * s.risk)) { pos.be = true; pos.sl = s.entry; s.beT = x.ct; } if (hrOf(x.ct) >= CFG.exitH) close(k, d > 0 ? x.c : x.c + SP, 'TIME'); } }
      if (h < CFG.asiaEndH) { S.aH = Math.max(S.aH, x.h); S.aL = Math.min(S.aL, x.l); continue; }
      if (S.T === null) { const d4 = Math.sign(e4[0][k] - e4[1][k]), d1 = Math.sign(e1[0][k] - e1[1][k]); S.T = d4 === d1 ? d4 : 0; S.e = { h4: [e4[0][k], e4[1][k]], h1: [e1[0][k], e1[1][k]] }; }
      const a = A[k]; if (!S.T || S.done || !(a > 0) || !isFinite(S.aH)) continue;
      const T = S.T, lv = T > 0 ? S.aH : S.aL, rng = S.aH - S.aL, m15close = (x.ct % 9e5) === 0;
      if (!S.Q) { if (h < CFG.lastEntryH && m15close && T * (x.c - lv) > 0) { const risk = Math.max(CFG.rngK * rng, a), tp = lv + T * CFG.rr * risk;
          S.Q = { kb: k, s: { id: `xh-${x.t}`, tf: 'm5', model: NAME, grade: 'X', side: T, t: x.t, ct: x.ct, entry: lv, sl: lv - T * risk, tp, risk, rr: CFG.rr, spread: SP, range: { hi: S.aH, lo: S.aL }, brk: x.c, expT: c[Math.min(c.length - 1, k + CFG.wait)].ct,
            info: [`EMA34/89 H4 + H1 cùng ${T > 0 ? 'TĂNG' : 'GIẢM'} lúc 13h VN`, `biên phiên Á ${S.aL.toFixed(2)}–${S.aH.toFixed(2)} (${rng.toFixed(1)} giá)`, `M15 đóng ${T > 0 ? 'trên đỉnh' : 'dưới đáy'} biên ${x.c.toFixed(2)} → LIMIT retest ${lv.toFixed(2)}`, `SL ${risk.toFixed(1)} giá · TP 2R · 1.5R dời hoà vốn`],
            hour: (new Date(x.ct).getUTCHours() + 7) % 24, tgOK: true, state: 'PENDING', fillT: null, exitT: null, exitP: null, r: null, pts: null } }; out.push(S.Q.s); }
        continue; }
      const s = S.Q.s; if (s.state !== 'PENDING') continue;
      if (T * ((T > 0 ? x.h : x.l) - s.tp) >= 0) { s.state = 'EXPIRED'; s.exitT = x.ct; s.why = 'Giá chạy tới TP trước khi hồi về mép biên → huỷ'; S.done = true; continue; }
      if (k - S.Q.kb > CFG.wait) { s.state = 'EXPIRED'; s.exitT = x.ct; s.why = 'Quá 4h không hồi về mép biên → huỷ'; S.done = true; continue; }
      const fill = T > 0 ? x.l + SP <= s.entry : x.h >= s.entry;
      if (fill) { S.done = true; if (pos) { s.state = 'EXPIRED'; s.exitT = x.ct; s.why = 'Đang có lệnh khác → bỏ'; continue; } s.state = 'OPEN'; s.fillT = x.ct; pos = { d: T, s, sl: s.sl, be: false }; }
    }
    return out;
  }
  // kế hoạch hôm nay (để hiện trên web)
  function plan(D) { const r = run(D, {}), last = r[r.length - 1]; return last || null; }
  return { run, plan, CFG, FINAL, RULE, NAME, version, telegram: true };
});
