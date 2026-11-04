// Tua lại 6 tháng, học dần từng tháng (walk-forward): mỗi tháng chọn cấu hình tốt nhất bằng dữ liệu TRƯỚC đó,
// rồi giao dịch tháng tiếp theo (chưa thấy). Khi M5/M15/H1 cùng có entry cùng chiều → chọn entry đẹp nhất.
import fs from 'node:fs';
import { load } from './core.mjs';
import { prepare, entryOf, simulate, setupOf, ENTRIES, SLBUF, TPS } from './engine2.mjs';

const SPREAD = { XAU: 0.35, BTC: 18 }, TFS = ['m5', 'm15', 'h1'];
const OPT = { m5: { expiry: 12, hold: 96 }, m15: { expiry: 12, hold: 96 }, h1: { expiry: 8, hold: 72 } };
const MIN_N = { m5: 25, m15: 15, h1: 8 };
// họ cấu hình nhỏ, theo lý thuyết (tránh khớp nhiễu): setup A+B+C, entry FVG (CE / mép), TP 2R, SL 0.2/0.5/1 ATR, EMA & HTF bật/tắt
const FAMILY = process.env.FAMILY || 'small';
const CONFIGS = [];
if (FAMILY === 'small') { for (const htf of [0, 1]) for (const em of [0, 1]) for (const en of [0, 1]) for (let sb = 0; sb < SLBUF.length; sb++) CONFIGS.push({ S: ['A', 'B', 'C'], htf, pd: 1, kz: 0, em, poi: 0, en, sb, tp: 1 }); }
else if (FAMILY === 'fixed') { CONFIGS.push({ S: ['A', 'B', 'C'], htf: 1, pd: 1, kz: 0, em: 1, poi: 0, en: 0, sb: 2, tp: 1 }); }
else { const SETS = [['A'], ['B'], ['A', 'B'], ['C'], ['A', 'B', 'C']];
for (const S of SETS) for (const htf of [0, 1]) for (const pd of [1, 0.5]) for (const kz of [0, 1]) for (const em of [0, 1]) for (const poi of [0, 1])
  for (let en = 0; en < ENTRIES.length; en++) for (let sb = 0; sb < SLBUF.length; sb++) for (let tp = 0; tp < TPS.length; tp++)
    CONFIGS.push({ S, htf, pd, kz, em, poi, en, sb, tp }); }
const M5_REFINE = process.env.M5 !== 'solo'; // M5 chỉ dùng tinh chỉnh entry khi M15/H1 đang có setup cùng chiều
const desc = (q) => `setup ${q.S.join('+')} · ${q.htf ? 'cùng cấu trúc HTF' : 'không cần HTF'} · ${q.pd < 1 ? 'entry ≤50% range' : 'mọi vùng'} · ${q.kz ? 'killzone' : 'mọi giờ'} · ${q.em ? 'EMA đồng thuận' : 'không cần EMA'} · ${q.poi ? 'chạm POI HTF' : 'không cần POI'} · entry ${ENTRIES[q.en]} · SL +${SLBUF[q.sb]} ATR · TP ${TPS[q.tp]}`;

const U = {}; // U[sym][tf] = {c, items:[{e, setup, t, out:[en][sb][tp], pdE:[en]}]}
for (const sym of ['XAU', 'BTC']) {
  const D = { m5: load(sym, 'm5'), m15: load(sym, 'm15'), h1: load(sym, 'h1') }; U[sym] = {};
  for (const tf of TFS) {
    const P = prepare(D, tf), o = { ...OPT[tf], spread: SPREAD[sym] }, items = [];
    for (const e of P.ev) {
      const setup = setupOf(e); if (!setup) continue;
      const out = [], pdE = [];
      for (let en = 0; en < ENTRIES.length; en++) {
        const px = entryOf(e, ENTRIES[en]); pdE.push(px == null ? null : e.pdOf(px)); const a1 = [];
        for (const sb of SLBUF) { const a2 = []; for (const tp of TPS) a2.push(px == null ? null : simulate(P.c, e, px, sb, tp, o)); a1.push(a2); }
        out.push(a1);
      }
      delete e.pdOf;
      items.push({ e, setup, t: P.c[e.k].t, out, pdE, px: ENTRIES.map(m => entryOf(e, m)) });
    }
    U[sym][tf] = { c: P.c, items };
    console.error(sym, tf, 'sự kiện', P.ev.length, 'có setup', items.length);
  }
}
const pass = (it, q) => q.S.includes(it.setup) && (!q.htf || it.e.htf === it.e.d) && (!q.kz || it.e.kz) && (!q.em || it.e.ema) && (!q.poi || it.e.poi) &&
  (q.pd >= 1 || (it.pdE[q.en] != null && it.pdE[q.en] <= q.pd));
function evalCfg(items, q, from, to, cTimes) {
  let n = 0, R = 0, R2 = 0;
  for (const it of items) { if (it.t < from || it.t >= to || !pass(it, q)) continue; const r = it.out[q.en][q.sb][q.tp]; if (!r || r.r == null || cTimes[r.exit] >= to) continue; n++; R += r.r; R2 += r.r * r.r; }
  return { n, R, mean: n ? R / n : 0 };
}
// mốc tháng
const t0 = U.XAU.m5.c[0].t, tEnd = U.XAU.m5.c[U.XAU.m5.c.length - 1].ct, months = [];
for (let d = new Date(Date.UTC(2026, 6, 1)); d.getTime() < tEnd; d.setUTCMonth(d.getUTCMonth() + 1)) months.push(d.getTime());
const mName = (t) => new Date(t).toISOString().slice(0, 7);

const report = { months: [], chosen: [] };
const allTrades = [];
for (let mi = 0; mi < months.length; mi++) {
  const from = months[mi], to = mi + 1 < months.length ? months[mi + 1] : tEnd + 1;
  for (const sym of ['XAU', 'BTC']) {
    const chosen = {};
    for (const tf of TFS) {
      const { c, items } = U[sym][tf], ct = c.map(x => x.ct);
      let best = null;
      for (const q of CONFIGS) { const s = evalCfg(items, q, t0, from, ct); if (s.n < MIN_N[tf] || s.mean < (FAMILY === 'fixed' ? -9 : 0.05)) continue; const sc = s.mean * Math.sqrt(s.n); if (!best || sc > best.sc) best = { q, sc, ...s }; }
      chosen[tf] = best;
      report.chosen.push({ month: mName(from), sym, tf, cfg: best ? desc(best.q) : 'TẮT (không cấu hình nào đủ tốt)', train: best ? `${best.n} lệnh, ${best.mean.toFixed(2)}R/lệnh` : '' });
    }
    // giao dịch tháng test: tín hiệu từ các khung đã chọn → 1 lệnh một lúc; cùng lúc nhiều khung cùng chiều → entry đẹp nhất
    const cands = [];
    for (const tf of TFS) { const b = chosen[tf]; if (!b) continue; const { c, items } = U[sym][tf];
      for (const it of items) { if (it.t < from || it.t >= to || !pass(it, b.q)) continue; const r = it.out[b.q.en][b.q.sb][b.q.tp]; if (!r) continue;
        cands.push({ sym, tf, d: it.e.d, setup: it.setup, t: c[it.e.k].ct, px: it.px[b.q.en], r: r.r, st: r.st, fillT: r.fill >= 0 ? c[r.fill].ct : null, exitT: r.exit < c.length ? c[r.exit].ct : Infinity, rr: r.rr, cfg: b.q }); } }
    cands.sort((a, b) => a.t - b.t);
    // M5 tinh chỉnh: chỉ giữ tín hiệu M5 nếu trong 12 nến M15 trước đó có setup M15/H1 cùng chiều
    if (M5_REFINE) { const hi = cands.filter(x => x.tf !== 'm5'); for (let i = cands.length - 1; i >= 0; i--) { const x = cands[i]; if (x.tf !== 'm5') continue; if (!hi.some(h => h.d === x.d && h.t <= x.t && x.t - h.t <= 12 * 9e5)) cands.splice(i, 1); } }
    let busy = -Infinity;
    for (let i = 0; i < cands.length; i++) {
      const s = cands[i]; if (s.t <= busy) continue;
      // nhóm các entry cùng chiều xuất hiện trong khi lệnh này còn chờ khớp → chọn entry tốt nhất (mua thấp nhất / bán cao nhất)
      const waitEnd = s.fillT ?? s.exitT, grp = [s];
      for (let j = i + 1; j < cands.length && cands[j].t < waitEnd; j++) if (cands[j].d === s.d) grp.push(cands[j]);
      const pick = grp.reduce((b, x) => (x.d > 0 ? x.px < b.px : x.px > b.px) ? x : b, s);
      if (pick !== s && pick.t > s.t) { continue; } // lệnh tốt hơn tới sau: bỏ lệnh hiện tại, xét lệnh kia ở vòng sau
      if (s.r == null) { busy = s.exitT; continue; }
      allTrades.push({ ...s, month: mName(from), multi: grp.length > 1 }); busy = s.exitT;
    }
  }
}
const sum = (L) => { const n = L.length, w = L.filter(x => x.r > 0).length, R = L.reduce((a, x) => a + x.r, 0); let eq = 0, pk = 0, dd = 0; for (const x of L) { eq += x.r; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); } return `${String(n).padStart(3)} lệnh | thắng ${n ? Math.round(100 * w / n) : 0}% | ${R >= 0 ? '+' : ''}${R.toFixed(1)}R | ${n ? (R / n).toFixed(2) : '—'}R/lệnh | DD ${dd.toFixed(1)}R`; };
console.log('=== KẾT QUẢ NGOÀI MẪU (mỗi tháng chỉ dùng dữ liệu các tháng trước để chọn)');
console.log('Tổng       ', sum(allTrades));
for (const sym of ['XAU', 'BTC']) console.log(sym.padEnd(11), sum(allTrades.filter(x => x.sym === sym)));
for (const m of months.map(mName)) console.log(m.padEnd(11), sum(allTrades.filter(x => x.month === m)));
for (const tf of TFS) console.log(tf.padEnd(11), sum(allTrades.filter(x => x.tf === tf)));
for (const s of ['A', 'B', 'C']) console.log(('setup ' + s).padEnd(11), sum(allTrades.filter(x => x.setup === s)));
console.log('chọn từ nhiều khung', sum(allTrades.filter(x => x.multi)));
const st = {}; for (const x of allTrades) st[x.st] = (st[x.st] || 0) + 1; console.log('kết quả lệnh', JSON.stringify(st));
console.log('\n=== CẤU HÌNH ĐÃ CHỌN MỖI THÁNG');
for (const r of report.chosen) console.log(r.month, r.sym, r.tf.padEnd(4), r.cfg, r.train ? `| học: ${r.train}` : '');
fs.writeFileSync(new URL('./learn-trades.json', import.meta.url), JSON.stringify(allTrades));
