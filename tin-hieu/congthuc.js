/* 📐 CÔNG THỨC VÀO LỆNH (CT) — một bộ luật cho vàng và BTC, chạy trên M5 · M15 · M30 (07/11/2026)
 * Luật được chốt trước khi kiểm thử (không chỉnh theo kết quả):
 *  1. Thanh khoản: gốc sóng QUÉT một mức thanh khoản (PDH/PDL, đỉnh/đáy tuần trước, London, phiên Á, swing gần) rồi đóng cửa quay lại trong ≤ 3 nến.
 *  2. Xác nhận: MSS — đóng cửa phá đỉnh/đáy swing ngược chiều cú quét, sóng phá có displacement (nến thân lớn) và để lại FVG chưa bị lấp.
 *  3. Bias: cấu trúc swing H4 cùng chiều lệnh (strong high/low kiểu ICT).
 *  4. Giờ: bỏ giờ chết 3–4h và 10–11h VN.
 *  5. Entry: lệnh LIMIT tại giữa FVG (CE). SL ngoài cực trị cú quét + 0.3 ATR + spread. TP = 2R.
 *  6. Huỷ nếu sau 12 nến chưa khớp, nếu giá chạm TP trước khi khớp, hoặc đóng cửa vượt cực trị quét. Giữ lệnh tối đa 2 ngày.
 *  7. Mỗi khung chỉ một lệnh một lúc. Tính khớp/SL/TP bằng nến M5 (một nến chạm cả SL và TP → tính SL).
 * Cần V3 (tin-hieu/v3.js) cho phần tìm cấu trúc ICT/SMC.
 */
(function (root, factory) {
  const V3 = typeof module === 'object' && module.exports ? require('./v3.js') : root.V3;
  const E = factory(V3); if (typeof module === 'object' && module.exports) module.exports = E; else root.CONGTHUC = E;
})(typeof self !== 'undefined' ? self : this, function (V3) {
  const CFG = { tfs: ['m5', 'm15', 'm30'], liq: ['pd', 'pw', 'london', 'asia', 'swing'], back: 3, bias: 'st4', deadHours: [3, 4, 10, 11],
    entry: 'ce', slATR: 0.3, rr: 2, minRiskATR: 0.5, maxRiskATR: 6, expiry: 12, holdMs: 2 * 864e5 };
  const MS = { m5: 3e5, m15: 9e5, m30: 18e5 };
  const hourVN = (t) => (new Date(t).getUTCHours() + 7) % 24;
  const NAME = 'Công thức', version = 'ct-2026-11-07';

  // D = { m5, m15, h1 } nến đã đóng · opt = { spread, cfg }
  function run(D, opt) {
    opt = opt || {}; const cfg = { ...CFG, ...(opt.cfg || {}) }, SP = opt.spread || 0, m5 = D.m5, out = [];
    if (!m5 || m5.length < 300 || !D.m15 || D.m15.length < 300 || !D.h1 || D.h1.length < 200) return out;
    const C = { m5, m15: D.m15, m30: D.m30 || V3.resample(D.m15, MS.m30) };
    const i5 = new Map(); m5.forEach((x, j) => i5.set(x.t, j));
    const at5 = (t) => { for (let u = 0; u < 12; u++) { const j = i5.get(t + u * 3e5); if (j != null) return j; } return null; };
    const save = V3.CFG.m5;
    try {
      for (const tf of cfg.tfs) {
        const c = C[tf]; if (!c || c.length < 150) continue;
        V3.CFG[tf] = V3.CFG[tf] || {};
        const sv = V3.CFG[tf]; V3.CFG[tf] = { ...sv, sides: [1, -1], liq: cfg.liq, back: cfg.back, filter: null, window: false };
        let ev; try { ev = V3.setups(c, tf, { h1: D.h1 }); } finally { V3.CFG[tf] = sv; }
        let busy = 0;
        for (const e of ev.sort((a, b) => a.ct - b.ct)) {
          if (e.ct < busy) continue;
          const d = e.d, why = [];
          if (cfg.bias === 'st4' && e.ctx.st4 !== true) continue;
          if (cfg.deadHours.includes(hourVN(e.ct))) continue;
          const entry = cfg.entry === 'ce' ? (e.fvg.top + e.fvg.bot) / 2 : (d > 0 ? e.fvg.top : e.fvg.bot);
          const close = c[e.k].c; if (!(d > 0 ? entry < close && entry > e.oP : entry > close && entry < e.oP)) continue;
          const sl = e.oP - d * (cfg.slATR * e.a + SP), risk = Math.abs(entry - sl);
          if (risk < cfg.minRiskATR * e.a || risk > cfg.maxRiskATR * e.a) continue;
          const tp = entry + d * cfg.rr * risk;
          const s = { id: `ct-${tf}-${e.t}-${d > 0 ? 'B' : 'S'}`, grade: 'C', model: NAME, tf, side: d, t: e.t, ct: e.ct, entry, sl, tp, risk, rr: cfg.rr, spread: SP,
            sweep: e.lvl, sweepName: e.lvName, origin: e.oP, fvg: { top: e.fvg.top, bot: e.fvg.bot }, ctx: e.ctx, hour: hourVN(e.ct), tgOK: false,
            state: 'PENDING', fillT: null, exitT: null, exitP: null, r: null, pts: null };
          const j0 = at5(e.ct); if (j0 == null) continue; // ngoài cửa sổ M5
          sim(s, m5, j0, cfg, SP, MS[tf]);
          out.push(s); busy = s.exitT || Infinity;
        }
      }
    } finally { V3.CFG.m5 = save; if (save === undefined) delete V3.CFG.m5; }
    return out.sort((a, b) => a.ct - b.ct);
  }

  // mô phỏng trên M5 (giá OHLC = bid; BUY khớp/thoát theo ask = bid + spread)
  function sim(s, m5, j0, cfg, SP, ms) {
    if (j0 == null) return s;
    const d = s.side, expT = s.ct + cfg.expiry * ms; let j = j0;
    for (; j < m5.length; j++) { const x = m5[j];
      if (x.t >= expT) { s.state = 'EXPIRED'; s.exitT = expT; return s; }
      const askL = x.l + SP, askH = x.h + SP;
      const fill = d > 0 ? askL <= s.entry : x.h >= s.entry, hitSL = d > 0 ? x.l <= s.sl : askH >= s.sl, hitTP = d > 0 ? x.h >= s.tp : askL <= s.tp;
      if (!fill) { if (hitTP) { s.state = 'MISSED'; s.exitT = x.ct; return s; } if (d > 0 ? x.c < s.origin : x.c > s.origin) { s.state = 'INVALID'; s.exitT = x.ct; return s; } continue; }
      s.state = 'OPEN'; s.fillT = x.t;
      if (hitSL) return close(s, 'LOSS', s.sl, x.ct);
      break;
    }
    if (s.state !== 'OPEN') return s;
    for (let u = j + 1; u < m5.length; u++) { const x = m5[u];
      const hitSL = d > 0 ? x.l <= s.sl : x.h + SP >= s.sl, hitTP = d > 0 ? x.h >= s.tp : x.l + SP <= s.tp;
      if (hitSL) return close(s, 'LOSS', s.sl, x.ct);
      if (hitTP) return close(s, 'WIN', s.tp, x.ct);
      if (x.ct - s.fillT >= cfg.holdMs) return close(s, 'TIME', d > 0 ? x.c : x.c + SP, x.ct); }
    return s;
  }
  function close(s, st, p, t) { s.state = st; s.exitP = p; s.exitT = t; s.pts = s.side * (p - s.entry); s.r = s.pts / s.risk; return s; }

  // kết quả tua 12 tháng (research/ct-test.mjs, OKX, spread vàng 0.35 / BTC 18): thua ở M5 & M15, M30 quanh hoà vốn → chỉ ghi nhật ký, không gửi Telegram
  const BACKTEST = { XAU: { m5: '104L · 26% · −20.7R', m15: '48L · 17% · −16.2R', m30: '40L · 33% · +2.2R', all: '192L · 25% · −34.8R' }, BTC: { m5: '138L · 30% · −12.0R', m15: '43L · 23% · −10.4R', m30: '33L · 36% · +5.3R', all: '214L · 30% · −17.0R' } };
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1, MISSED: 1, EXPIRED: 1, INVALID: 1 };
  const RULE = 'Quét thanh khoản (PDH/PDL, tuần, London, Á, swing) → MSS có lực + FVG · cùng cấu trúc H4 · bỏ 3–4h, 10–11h · limit giữa FVG · SL ngoài cú quét + 0.3 ATR · TP 2R · M5/M15/M30';
  return { run, CFG, FINAL, RULE, NAME, version, telegram: false, BACKTEST };
});
