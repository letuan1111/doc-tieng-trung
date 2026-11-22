// Nến đã đóng, cùng nguồn giá. Dùng chung cho máy quét và trang tín hiệu.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HOI_M5 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const version = 'hoi-m5-2026-11-22';
  const retired = new Set(['A', 'S', 'W', 'R', 'C', 'Q']);
  const retiredForGold = trade => trade.sym === 'XAU' && retired.has(trade.grade);
  const FINAL = { WIN: true, LOSS: true, TIME: true };

  function run({ m5 = [] }, { spread = 0 } = {}) {
    const m15 = [];
    for (let i = 2; i < m5.length; i++) {
      const bar = m5[i];
      if (bar.ct % 900000 === 0 && bar.t - m5[i - 1].t === 300000 && bar.t - m5[i - 2].t === 600000)
        m15.push({ ct: bar.ct, c: bar.c });
    }
    const trades = [];
    let j = -1, fast, slow, setup, active;
    for (let i = 12; i < m5.length; i++) {
      const bar = m5[i], prev = m5[i - 1];
      while (j + 1 < m15.length && m15[j + 1].ct <= bar.ct) {
        const close = m15[++j].c;
        fast = j ? fast + (close - fast) * 2 / 35 : close;
        slow = j ? slow + (close - slow) * 2 / 90 : close;
      }
      if (active) {
        const s = active, buy = s.side > 0, ask = buy ? 0 : spread;
        const stop = buy ? bar.l <= s.sl : bar.h + ask >= s.sl;
        const target = buy ? bar.h >= s.tp : bar.l + ask <= s.tp;
        if (stop || target || bar.ct - s.fillT >= 2 * 3600000) {
          s.state = stop ? 'LOSS' : target ? 'WIN' : 'TIME';
          s.exitP = stop ? (buy ? Math.min(s.sl, bar.o) : Math.max(s.sl, bar.o + ask)) : target ? s.tp : bar.c + ask;
          s.exitT = bar.ct;
          s.pts = s.side * (s.exitP - s.entry);
          s.r = s.pts / s.risk;
          active = null;
        }
        continue;
      }
      if (j < 88) continue;
      const side = Math.sign(fast - slow), buy = side > 0;
      if (!side || side * (m15[j].c - fast) <= 0) { setup = null; continue; }
      if (setup && (side !== setup.side || bar.ct - setup.time > 30 * 60000)) setup = null;
      if (setup) {
        const { level } = setup;
        if (side * (bar.c - level) <= 0) setup = null;
        else {
          setup.extreme = buy ? Math.min(setup.extreme, bar.l) : Math.max(setup.extreme, bar.h);
          if (buy ? bar.l <= level : bar.h >= level) setup.touched = true;
          if (setup.touched && side * (bar.c - bar.o) > 0 && (buy ? bar.c > prev.h : bar.c < prev.l)) {
            const entry = bar.c + (buy ? spread : 0);
            const sl = setup.extreme + (buy ? -0.01 : spread + 0.01);
            const risk = side * (entry - sl);
            if (risk > 0 && risk <= 10) {
              const distance = Math.max(5, 1.5 * risk);
              active = { id: 'hoi5-' + bar.t + '-' + side, grade: 'M', model: 'Hồi M5 có xác nhận',
                tf: 'm5', side, t: bar.t, ct: bar.ct, fillT: bar.ct, state: 'OPEN',
                entry, sl, tp: entry + side * distance, risk, rr: distance / risk, spread,
                sweep: level, sweepName: 'Mức retest M5', tgOK: false };
              trades.push(active);
            }
            setup = null;
          }
          continue;
        }
      }
      const window = m5.slice(i - 12, i);
      if (bar.ct - window[0].ct !== 12 * 300000) continue;
      const level = buy ? Math.max(...window.map(x => x.h)) : Math.min(...window.map(x => x.l));
      if (side * (bar.c - level) > 0) setup = { side, level, time: bar.ct, touched: false, extreme: level };
    }
    return trades;
  }
  return { run, version, retiredForGold, FINAL, telegram: false };
});
