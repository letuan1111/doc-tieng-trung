/* 🌅 PHÁ BIÊN PHIÊN Á (Asian range breakout, vàng) — bản pb-2026-11-09
 * Lấy từ nghiên cứu ICT/breakout (London breakout trên vàng, 3.7 năm real tick: PF 1.37, ngoài mẫu 2026 PF 1.61),
 * giữ nguyên luật gốc, không chỉnh theo dữ liệu của mình:
 *  1. Biên phiên Á = đỉnh/đáy từ 00:00 đến 06:00 UTC (7h–13h VN).
 *  2. Chỉ giao dịch khi biên rộng 0.30%–1.60% giá (quá hẹp → nhiều phá giả, quá rộng → giá đã chạy hết trong phiên Á).
 *  3. Từ 06:00 UTC (13h VN): đặt BUY STOP trên đỉnh và SELL STOP dưới đáy (cách biên 0.1 ATR M15), lệnh này khớp thì huỷ lệnh kia. Tối đa 1 lệnh/ngày, chỉ vào đến 15:00 UTC (22h VN).
 *  4. SL = phía bên kia của biên (tối đa 0.6% giá). TP = 2.5R. Lời 1.5R thì dời SL về hoà vốn. 19:00 UTC (2h sáng VN) còn lệnh thì đóng.
 * Kiểm (research/best3.mjs, spread 0.35, 0.02 lot): Dukascopy 11/2024–11/2025 197 lệnh +1152 USD · 11/2025–11/2026 191 lệnh +464 USD · OKX 12 tháng 231 lệnh +725 USD.
 */
(function (root, factory) { const E = factory(); if (typeof module === 'object' && module.exports) module.exports = E; else root.ASIANBO = E; })(typeof self !== 'undefined' ? self : this, function () {
  const CFG = { asiaEndH: 6, minPct: 0.3, maxPct: 1.6, buf: 0.1, capPct: 0.6, rr: 2.5, be: 1.5, lastEntryH: 15, exitH: 19, minBars: 60 };
  const NAME = 'Phá biên phiên Á', version = 'pb-2026-11-09';
  function atr(c, p = 14) { const o = new Array(c.length); let a = c.length ? c[0].h - c[0].l : 0; for (let i = 0; i < c.length; i++) { const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = i < p ? (a * i + tr) / (i + 1) : (a * (p - 1) + tr) / p; o[i] = a; } return o; }
  const hU = (t) => new Date(t).getUTCHours(), dayOf = (t) => Math.floor(t / 864e5);
  const vn = (t) => { const d = new Date(t + 7 * 36e5); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };

  // D = { m5 (hoặc M1 để tua chính xác hơn), m15 } nến đã đóng · opt = { spread, cfg }
  function run(D, opt) {
    opt = opt || {}; const cfg = { ...CFG, ...(opt.cfg || {}) }, c = D.m5, SP = opt.spread || 0, out = [];
    if (!c || c.length < 100 || !D.m15 || D.m15.length < 30) return out;
    const n = c.length, bar = c[1].t - c[0].t, minBars = Math.round(cfg.minBars * 3e5 / bar);
    const A15 = atr(D.m15); let j15 = -1; const aAt = (t) => { while (j15 + 1 < D.m15.length && D.m15[j15 + 1].ct <= t) j15++; return A15[Math.max(0, j15)]; };
    const days = new Map(); for (let i = 0; i < n; i++) { const x = c[i]; const k = dayOf(x.t); let v = days.get(k); if (!v) { v = { h: -Infinity, l: Infinity, nA: 0, j0: -1 }; days.set(k, v); }
      if (hU(x.t) < cfg.asiaEndH) { v.h = Math.max(v.h, x.h); v.l = Math.min(v.l, x.l); v.nA++; } else if (v.j0 < 0) v.j0 = i; }
    for (const [k, r] of days) {
      if (r.nA < minBars || r.j0 < 0) continue; const j0 = r.j0, mid = (r.h + r.l) / 2, w = r.h - r.l, pct = 100 * w / mid;
      if (pct < cfg.minPct || pct > cfg.maxPct) continue;
      const a = aAt(c[j0].t), buf = cfg.buf * a, lvB = r.h + buf, lvS = r.l - buf, endT = k * 864e5 + cfg.lastEntryH * 36e5, exitAt = k * 864e5 + cfg.exitH * 36e5;
      for (let j = j0; j < n && c[j].t < endT; j++) {
        const z = c[j], up = z.h + SP >= lvB, dn = z.l <= lvS; if (!up && !dn) continue; if (up && dn) break;
        const d = up ? 1 : -1, entry = d > 0 ? lvB : lvS, slRaw = d > 0 ? r.l - buf : r.h + buf, cap = cfg.capPct / 100 * entry;
        const sl0 = d * (entry - slRaw) > cap ? entry - d * cap : slRaw, risk = Math.abs(entry - sl0), tp = entry + d * cfg.rr * risk;
        const s = { id: `pb-${k}-${d > 0 ? 'B' : 'S'}`, tf: 'm5', model: NAME, grade: 'P', side: d, t: z.t, ct: z.t + bar, entry, sl: sl0, tp, risk, rr: cfg.rr, spread: SP,
          range: { hi: r.h, lo: r.l, pct: +pct.toFixed(2) }, state: 'OPEN', fillT: z.t, exitT: null, exitP: null, r: null, pts: null, tgOK: true, hour: (hU(z.t) + 7) % 24,
          info: [`biên phiên Á (7h–13h VN) ${r.l.toFixed(2)}–${r.h.toFixed(2)} = ${w.toFixed(1)} giá (${pct.toFixed(2)}% giá)`, `${d > 0 ? 'BUY STOP' : 'SELL STOP'} ${entry.toFixed(2)} khớp lúc ${vn(z.t)} VN`, `SL phía bên kia biên ${sl0.toFixed(2)} (${risk.toFixed(1)} giá)${d * (entry - slRaw) > cap ? ' — giới hạn 0.6% giá' : ''}`, `TP 2.5R ${tp.toFixed(2)} · lời 1.5R dời SL về hoà vốn · 2h sáng VN còn lệnh thì đóng`] };
        // quản lý: nến khớp chỉ xét SL (bảo thủ)
        let sl = sl0, be = false, u = j;
        if (d > 0 ? z.l <= sl : z.h + SP >= sl) { fin(s, 'LOSS', sl, z.t + bar); }
        else for (u = j + 1; u < n; u++) { const y = c[u], lo = d > 0 ? y.l : y.l + SP, hi = d > 0 ? y.h : y.h + SP;
          if (y.t >= exitAt) { fin(s, 'TIME', d > 0 ? y.o : y.o + SP, y.t, 'Đóng lúc 2h sáng VN (19:00 UTC)'); break; }
          if (d > 0 ? lo <= sl : hi >= sl) { fin(s, be ? 'TIME' : 'LOSS', sl, y.t + bar, be ? 'Hoà vốn (đã dời SL ở 1.5R)' : null); break; }
          if (d > 0 ? hi >= tp : lo <= tp) { fin(s, 'WIN', tp, y.t + bar); break; }
          if (!be && (d > 0 ? y.h - entry : entry - lo) >= cfg.be * risk) { sl = entry + d * 0.1; be = true; s.sl = sl; s.info.push(`đã lời 1.5R lúc ${vn(y.t)} → dời SL về ${sl.toFixed(2)}`); } }
        out.push(s); break;
      }
    }
    return out.sort((x, y) => x.t - y.t);
  }
  function fin(s, st, p, t, why) { s.state = st; s.exitP = p; s.exitT = t; s.pts = s.side * (p - s.entry); s.r = s.pts / s.risk; if (why) s.why = why; }
  // kế hoạch hôm nay (để hiển thị): biên phiên Á và 2 mức đặt lệnh
  function plan(D, opt) { opt = opt || {}; const cfg = { ...CFG, ...(opt.cfg || {}) }, c = D.m5; if (!c || !c.length) return null; const k = dayOf(c[c.length - 1].t);
    let h = -Infinity, l = Infinity, nA = 0; for (const x of c) if (dayOf(x.t) === k && hU(x.t) < cfg.asiaEndH) { h = Math.max(h, x.h); l = Math.min(l, x.l); nA++; }
    if (!nA) return null; const pct = 100 * (h - l) / ((h + l) / 2); return { day: k, hi: h, lo: l, pct, ok: pct >= cfg.minPct && pct <= cfg.maxPct, done: hU(c[c.length - 1].t) >= cfg.asiaEndH }; }
  const FINAL = { WIN: 1, LOSS: 1, TIME: 1 };
  const RULE = 'Biên phiên Á 7h–13h VN (rộng 0.3–1.6% giá) → 13h VN đặt BUY STOP trên đỉnh / SELL STOP dưới đáy (khớp 1 huỷ 1, 1 lệnh/ngày, vào đến 22h) → SL phía bên kia biên (≤ 0.6% giá) · TP 2.5R · lời 1.5R dời hoà vốn · 2h sáng đóng';
  return { run, plan, CFG, FINAL, RULE, NAME, version, telegram: true }; // 11/11/2026: lời cả 2 năm (audit-all) → gửi Telegram; sụt tối đa lớn → lot nhỏ
});
