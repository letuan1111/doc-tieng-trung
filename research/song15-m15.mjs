// Rà mọi đỉnh/đáy swing M15 (12 tháng) → cái nào thành sóng ≥ 15 giá, cái nào không; so sánh dấu hiệu:
// EMA34/89 M15 + H1, quét thanh khoản, CHoCH / MSS (có nến displacement), FVG, OB, giờ → tìm điểm chung thật sự (so với nhóm hỏng)
import fs from 'node:fs'; import { load, resample, ema, atr, pivots, mapHTF } from './core.mjs';
const W = 15, SP = 0.35;
const all = load('XAU2Y', 'm15'), h1all = load('XAU2Y', 'h1');
const start = all.at(-1).t - (process.env.PREV ? 730 : 365) * 864e5, END = start + 365 * 864e5, c = all, n = c.length;
const e34 = ema(c.map(x => x.c), 34), e89 = ema(c.map(x => x.c), 89), A = atr(c);
const H1 = [mapHTF(c, h1all, ema(h1all.map(x => x.c), 34)), mapHTF(c, h1all, ema(h1all.map(x => x.c), 89))];
const pv = pivots(c, 2), P = [...pv.H.map(q => ({ ...q, d: -1 })), ...pv.L.map(q => ({ ...q, d: 1 }))].filter(q => c[q.i].t >= start && c[q.i].t < END && q.i > 120 && q.i < n - 100).sort((a, b) => a.i - b.i);
const hr = (t) => (new Date(t).getUTCHours() + 7) % 24;
const rows = [];
for (const q of P) {
  const { i, p, d } = q, a = A[i];
  // kết quả: chạy được bao xa trước khi phá điểm đầu (tối đa 24h)
  let best = 0, kBest = i, broke = false; for (let k = i + 1; k < Math.min(n, i + 96); k++) { if (d > 0 ? c[k].l < p : c[k].h > p) { broke = true; break; } const m = d > 0 ? c[k].h - p : p - c[k].l; if (m > best) { best = m; kBest = k; } }
  const win = best >= W;
  // EMA M15 tại điểm đầu
  const emaDir = Math.sign(e34[i] - e89[i]) === d ? 1 : 0, gap = Math.abs(e34[i] - e89[i]);
  const x34 = d * (e34[i] - p), x89 = d * (e89[i] - p); // >0: điểm đầu nằm phía "ngược" của EMA (đáy dưới EMA với sóng tăng)
  const pos = x89 > 0 && x34 > 0 ? 'ngoài cả 2 EMA (phía ngược)' : x34 > 0 || x89 > 0 ? 'giữa 2 EMA' : 'phía thuận của 2 EMA';
  const touch = (d > 0 ? c[i].l <= e34[i] && c[i].h >= e34[i] : c[i].h >= e34[i] && c[i].l <= e34[i]) || (d > 0 ? c[i].l <= e89[i] && c[i].h >= e89[i] : c[i].h >= e89[i] && c[i].l <= e89[i]);
  const h1Dir = Math.sign(H1[0][i] - H1[1][i]) === d ? 1 : 0;
  // quét thanh khoản: điểm đầu vượt một swing cùng loại trong 6h trước (swing chưa bị lấy)
  const same = d > 0 ? pv.L : pv.H; let sweep = 0;
  for (const s of same) { if (s.i >= i - 1) break; if (s.i < i - 24 || s.conf > i) continue; let fresh = true; for (let u = s.i + 1; u < i; u++) if (d > 0 ? c[u].l < s.p : c[u].h > s.p) { fresh = false; break; } if (fresh && (d > 0 ? p < s.p : p > s.p)) sweep = 1; }
  // swing đối diện gần nhất trước điểm đầu (mốc CHoCH)
  const opp = (d > 0 ? pv.H : pv.L).filter(s => s.i < i && s.i >= i - 32).at(-1);
  let choch = null, mss = 0, chochPts = null;
  if (opp) for (let k = i + 1; k < Math.min(n, i + 16); k++) { if (d > 0 ? c[k].l < p : c[k].h > p) break; if (d * (c[k].c - opp.p) > 0) { choch = k - i; chochPts = d * (c[k].c - p); for (let u = i + 1; u <= k; u++) if (d * (c[u].c - c[u].o) >= 1.0 * A[u]) mss = 1; break; } }
  // FVG trong 4 nến sau điểm đầu
  let fvg = 0, fvgSz = 0, fvgBox = null; for (let k = i + 2; k <= i + 5 && k < n; k++) { const g = d > 0 ? c[k].l - c[k - 2].h : c[k - 2].l - c[k].h; if (g > 0.15 * A[k]) { fvg = 1; fvgSz = Math.max(fvgSz, g); if (!fvgBox) fvgBox = [k - 1, d > 0 ? c[k - 2].h : c[k].h, d > 0 ? c[k].l : c[k - 2].l]; } }
  // OB: nến ngược màu cuối cùng trước nến displacement đầu tiên (thân ≥ 1 ATR) trong 6 nến sau đáy
  let ob = 0, obRetest = 0, obBox = null; for (let k = i; k <= i + 6 && k < n; k++) if (d * (c[k].c - c[k].o) >= A[k]) { for (let u = k - 1; u >= i - 2; u--) if (d * (c[u].c - c[u].o) < 0) { ob = 1; obBox = [u, c[u].l, c[u].h]; const top = d > 0 ? c[u].h : c[u].l; for (let v = k + 1; v < Math.min(n, k + 16); v++) if (d > 0 ? c[v].l <= top : c[v].h >= top) { obRetest = 1; break; } break; } break; }
  // chạy ngược trước điểm đầu (8 nến = 2h), biên 2h, nến tại đáy
  const prior = d * (c[i - 8].c - p) / a, body = Math.abs(c[i].c - c[i].o), rg = c[i].h - c[i].l, wick = (d > 0 ? Math.min(c[i].o, c[i].c) - c[i].l : c[i].h - Math.max(c[i].o, c[i].c)) / (rg || 1);
  // GIAO DỊCH ĐƯỢC KHÔNG: vào lúc tín hiệu đã xác nhận (đóng nến CHoCH), SL ngoài điểm đầu 0.2 ATR → còn chạy thêm 15 giá trước SL?
  const trade = (k, entryPx) => { if (k == null) return null; const entry = entryPx + (d > 0 ? SP : 0), sl = p - d * 0.2 * a + (d < 0 ? SP : 0), risk = d * (entry - sl), tp = entry + d * W;
    for (let u = k + 1; u < Math.min(n, k + 96); u++) { const lo = d > 0 ? c[u].l : c[u].l + SP, hi = d > 0 ? c[u].h : c[u].h + SP; if (d > 0 ? lo <= sl : hi >= sl) return { ok: 0, risk, usd: -risk * 2, k0: k, k1: u }; if (d > 0 ? hi >= tp : lo <= tp) return { ok: 1, risk, usd: W * 2, k0: k, k1: u }; }
    const z = c[Math.min(n - 1, k + 95)]; return { ok: 0, risk, usd: d * (z.c - entry) * 2, time: 1, k0: k, k1: k + 95 }; };
  const kC = choch == null ? null : i + choch, trC = trade(kC, kC == null ? 0 : c[kC].c);
  // vào limit ở FVG/OB sau CHoCH (giá hồi về mép FVG đầu tiên) trong 12 nến
  let trR = null; if (kC != null) { let lvl = null; for (let k = i + 2; k <= kC && k < n; k++) { const g = d > 0 ? c[k].l - c[k - 2].h : c[k - 2].l - c[k].h; if (g > 0.15 * A[k]) { lvl = d > 0 ? c[k].l : c[k].h; break; } }
    if (lvl != null) for (let u = kC + 1; u < Math.min(n, kC + 13); u++) { if (d > 0 ? c[u].l < p : c[u].h > p) break; if (d > 0 ? c[u].l + SP <= lvl : c[u].h >= lvl) { trR = trade(u, lvl - (d > 0 ? SP : 0)); break; } } }
  rows.push({ trC, trR, fvgBox, obBox, oppI: opp ? opp.i : null, oppP: opp ? opp.p : null, e34: +e34[i].toFixed(2), e89: +e89[i].toFixed(2), t: c[i].t, i, d, p, win, best: +best.toFixed(1), broke, a: +a.toFixed(2), emaDir, gap: +gap.toFixed(2), x34: +x34.toFixed(2), x89: +x89.toFixed(2), pos, touch: +touch, h1Dir, sweep, choch, chochPts: chochPts == null ? null : +chochPts.toFixed(1), mss, fvg, fvgSz: +fvgSz.toFixed(2), ob, obRetest, prior: +prior.toFixed(2), wick: +wick.toFixed(2), hour: hr(c[i].t), kBest });
}
fs.writeFileSync('/tmp/song15.json', JSON.stringify(rows));
const N = rows.length, Wn = rows.filter(r => r.win);
console.log('Swing M15 12 tháng:', N, '· thành sóng ≥15:', Wn.length, `(${(100 * Wn.length / N).toFixed(1)}%)`);
const feat = [['EMA34>89 M15 cùng chiều sóng', r => r.emaDir], ['EMA34/89 H1 cùng chiều sóng', r => r.h1Dir], ['M15 + H1 đều cùng chiều', r => r.emaDir && r.h1Dir], ['M15 + H1 đều NGƯỢC chiều', r => !r.emaDir && !r.h1Dir],
  ['Điểm đầu ngoài cả 2 EMA (phía ngược)', r => r.pos.startsWith('ngoài')], ['Điểm đầu giữa 2 EMA', r => r.pos.startsWith('giữa')], ['Điểm đầu phía thuận (hồi chưa tới EMA)', r => r.pos.startsWith('phía')], ['Nến đáy chạm EMA34/89', r => r.touch],
  ['Cách EMA89 ≥ 10 giá (phía ngược)', r => r.x89 >= 10], ['EMA34-89 hẹp < 3 giá (đi ngang)', r => r.gap < 3],
  ['Có quét thanh khoản (swing M15 ≤ 6h)', r => r.sweep], ['Có CHoCH ≤ 4 nến (1h)', r => r.choch != null && r.choch <= 4], ['Có CHoCH ≤ 15 nến', r => r.choch != null], ['MSS (CHoCH + nến displacement ≥1 ATR)', r => r.mss],
  ['Có FVG ≤ 4 nến sau đáy', r => r.fvg], ['Có OB + nến displacement', r => r.ob], ['Đã chạy ngược ≥ 2 ATR trong 2h trước', r => r.prior >= 2], ['Râu nến đáy ≥ 50%', r => r.wick >= 0.5],
  ['Giờ 13h–17h VN (London)', r => r.hour >= 13 && r.hour < 17], ['Giờ 19h–23h VN (New York)', r => r.hour >= 19 && r.hour < 23], ['Giờ 0h–7h VN', r => r.hour < 7]];
const F = feat.map(([nm, f]) => { const s = rows.filter(f), w = s.filter(r => r.win); return { nm, inWave: +(100 * Wn.filter(f).length / Wn.length).toFixed(1), inFail: +(100 * rows.filter(r => !r.win).filter(f).length / (N - Wn.length)).toFixed(1), n: s.length, pWin: +(100 * w.length / (s.length || 1)).toFixed(1) }; });
console.table(F);
// tổ hợp
const combos = [['Quét + CHoCH ≤1h', r => r.sweep && r.choch != null && r.choch <= 4], ['Quét + MSS', r => r.sweep && r.mss], ['Quét + MSS + FVG', r => r.sweep && r.mss && r.fvg], ['Quét + MSS + FVG + H1 cùng chiều', r => r.sweep && r.mss && r.fvg && r.h1Dir],
  ['MSS + FVG + ngoài 2 EMA', r => r.mss && r.fvg && r.pos.startsWith('ngoài')], ['MSS + FVG + M15&H1 cùng chiều', r => r.mss && r.fvg && r.emaDir && r.h1Dir], ['MSS + FVG + phía thuận EMA (hồi nông)', r => r.mss && r.fvg && r.pos.startsWith('phía')], ['MSS + FVG + giờ London/NY', r => r.mss && r.fvg && ((r.hour >= 13 && r.hour < 17) || (r.hour >= 19 && r.hour < 23))]];
const tstat = (L) => { const ok = L.filter(t => t.ok).length; return { n: L.length, hit15: +(100 * ok / (L.length || 1)).toFixed(1), riskMed: med(L.map(t => +t.risk.toFixed(1))), usd: Math.round(L.reduce((u, t) => u + t.usd, 0)) }; };
combos.unshift(['Mọi CHoCH ≤ 15 nến', r => r.choch != null]);
const C = combos.map(([nm, f]) => { const s = rows.filter(f), w = s.filter(r => r.win), tc = tstat(s.filter(r => r.trC).map(r => r.trC)), tr = tstat(s.filter(r => r.trR).map(r => r.trR)); return { nm, n: s.length, perMonth: +(s.length / 12).toFixed(1), pWin: +(100 * w.length / (s.length || 1)).toFixed(1), chochPtsMed: med(s.filter(r => r.chochPts != null).map(r => r.chochPts)), vaoCHoCH_hit15: tc.hit15, vaoCHoCH_SL: tc.riskMed, vaoCHoCH_usd: tc.usd, retest_n: tr.n, retest_hit15: tr.hit15, retest_SL: tr.riskMed, retest_usd: tr.usd }; });
function med(a) { a = a.slice().sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; }
console.table(C);
const ws = Wn.filter(r => r.choch != null); console.log('Sóng ≥15: CHoCH sau trung vị', med(ws.map(r => r.choch)), 'nến, lúc đó giá đã chạy', med(ws.map(r => r.chochPts)), 'giá; sóng trung vị', med(Wn.map(r => r.best)), 'giá');
fs.writeFileSync('/tmp/song15-sum.json', JSON.stringify({ N, nWave: Wn.length, F, C, chochMed: med(ws.map(r => r.choch)), chochPtsMed: med(ws.map(r => r.chochPts)), waveMed: med(Wn.map(r => r.best)) }));
// kiểm kỹ: mỗi lúc 1 lệnh, chia 2 nửa năm, sụt tối đa, số tháng lời
const mid = start + 182 * 864e5, deep = {};
for (const [nm, f] of combos) {
  const L = rows.filter(f).filter(r => r.trC).sort((x, y) => x.trC.k0 - y.trC.k0); let busy = -1; const T = [];
  for (const r of L) { if (r.trC.k0 <= busy) continue; busy = r.trC.k1; T.push({ ...r.trC, t: c[r.trC.k0].t, d: r.d }); }
  let eq = 0, pk = 0, dd = 0; const mo = {}; for (const t of T) { eq += t.usd; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); const m = new Date(t.t).toISOString().slice(0, 7); mo[m] = (mo[m] || 0) + t.usd; }
  const h1u = T.filter(t => t.t < mid).reduce((u, t) => u + t.usd, 0), h2u = T.filter(t => t.t >= mid).reduce((u, t) => u + t.usd, 0);
  deep[nm] = { n: T.length, perDay: +(T.length / 260).toFixed(2), hit: +(100 * T.filter(t => t.ok).length / T.length).toFixed(1), usd: Math.round(eq), dd: Math.round(dd), half1: Math.round(h1u), half2: Math.round(h2u), months: `${Object.values(mo).filter(v => v > 0).length}/${Object.keys(mo).length}`, eq: T.map(t => [t.t, t.usd]) };
  console.log(nm.padEnd(40), JSON.stringify({ ...deep[nm], eq: undefined }));
}
fs.writeFileSync('/tmp/song15-deep.json', JSON.stringify(deep));
