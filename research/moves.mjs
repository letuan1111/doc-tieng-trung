// Ghi lại MỌI con sóng ≥ TH giá (mặc định 15 giá vàng) trên nến M5, 12 tháng.
// Mỗi sóng: trước đó giá làm gì (sóng trước, đi ngang, cấu trúc H1/H4), có quét thanh khoản nào ở điểm bắt đầu,
// mô hình nào hình thành trước (MSS M5/M15, FVG), lúc xác nhận giá đã chạy bao nhiêu, vào lệnh ở đâu thì bắt được.
// Kèm xác suất nền: cùng mô hình (quét + MSS) bao nhiêu lần thì giá chạy đủ TH.
// node research/moves.mjs [XAU] [15]  → research/data/moves_XAU.csv + in thống kê
import fs from 'node:fs';
import path from 'node:path';
import { DIR, load, resample, atr, pivots, swingStruct, mapHTF, MS } from './core.mjs';
const sym = process.argv[2] || 'XAU', TH = +(process.argv[3] || 15), SPREAD = { XAU: 0.35, BTC: 18 }[sym];
const m5 = load(sym, 'm5'), m15 = load(sym, 'm15'), h1 = load(sym, 'h1'), h4 = resample(h1, MS.h4);
const A15 = atr(m15), n = m5.length;
const hVN = (t) => (new Date(t).getUTCHours() + 7) % 24;
const sess = (h) => h >= 7 && h < 13 ? 'Á' : h >= 13 && h < 19 ? 'London' : h >= 19 ? 'New York' : 'đêm';
const i15 = (t) => { let lo = 0, hi = m15.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (m15[m].ct <= t) lo = m; else hi = m - 1; } return lo; };
const S1 = mapHTF(m5, h1, swingStruct(h1)), S4 = mapHTF(m5, h4, swingStruct(h4));

// ---- 1. zigzag trên high/low M5: sóng = đoạn giữa hai đỉnh/đáy, mỗi đoạn ≥ TH
const legs = []; {
  let dir = 0, hi = m5[0].h, hiI = 0, lo = m5[0].l, loI = 0, pI = 0, pP = null;
  for (let i = 1; i < n; i++) { const x = m5[i];
    if (dir >= 0) { if (x.h > hi) { hi = x.h; hiI = i; } }
    if (dir <= 0) { if (x.l < lo) { lo = x.l; loI = i; } }
    if (dir === 0) { if (hi - lo >= TH) { dir = hiI > loI ? 1 : -1; pI = dir > 0 ? loI : hiI; pP = dir > 0 ? lo : hi; } continue; }
    if (dir === 1 && hi - x.l >= TH && i > hiI) { legs.push({ d: 1, sI: pI, sP: pP, eI: hiI, eP: hi }); dir = -1; pI = hiI; pP = hi; lo = x.l; loI = i; }
    else if (dir === -1 && x.h - lo >= TH && i > loI) { legs.push({ d: -1, sI: pI, sP: pP, eI: loI, eP: lo }); dir = 1; pI = loI; pP = lo; hi = x.h; hiI = i; }
  }
}
// ---- 2. mức thanh khoản tại mỗi nến M5 (chỉ dùng thông tin đã có trước nến đó)
const LV = new Array(n); {
  let day = null, dH = -Infinity, dL = Infinity, pdH = null, pdL = null, aH = -Infinity, aL = Infinity, lH = -Infinity, lL = Infinity, wk = null, wH = -Infinity, wL = Infinity, pwH = null, pwL = null;
  for (let i = 0; i < n; i++) { const x = m5[i], dk = Math.floor(x.t / 864e5), hr = new Date(x.t).getUTCHours(), w = Math.floor((dk + 3) / 7);
    if (dk !== day) { if (day !== null) { pdH = dH; pdL = dL; } day = dk; dH = -Infinity; dL = Infinity; aH = -Infinity; aL = Infinity; lH = -Infinity; lL = Infinity; }
    if (w !== wk) { if (wk !== null) { pwH = wH; pwL = wL; } wk = w; wH = -Infinity; wL = Infinity; }
    LV[i] = { pdH, pdL, pwH, pwL, aH: hr >= 6 && aH > -Infinity ? aH : null, aL: hr >= 6 && aL < Infinity ? aL : null, lH: hr >= 12 && lH > -Infinity ? lH : null, lL: hr >= 12 && lL < Infinity ? lL : null };
    dH = Math.max(dH, x.h); dL = Math.min(dL, x.l); wH = Math.max(wH, x.h); wL = Math.min(wL, x.l);
    if (hr < 6) { aH = Math.max(aH, x.h); aL = Math.min(aL, x.l); } else if (hr >= 7 && hr < 12) { lH = Math.max(lH, x.h); lL = Math.min(lL, x.l); }
  }
}
const pv15 = pivots(m15, 3), pv5 = pivots(m5, 3);
// mức bị quét tại điểm gốc i (giá p), chiều sóng d: BUY quét đáy (p thấp hơn mức), SELL quét đỉnh
function swept(i, p, d) {
  const L = LV[i], t = m5[i].t, cand = d > 0
    ? [['PDL', L.pdL], ['PWL', L.pwL], ['Đáy London', L.lL], ['Đáy phiên Á', L.aL]]
    : [['PDH', L.pdH], ['PWH', L.pwH], ['Đỉnh London', L.lH], ['Đỉnh phiên Á', L.aH]];
  for (const [nm, v] of cand) if (v != null && (d > 0 ? p < v : p > v)) return { nm, lvl: v };
  // đỉnh/đáy swing M15 trong 2 ngày trước (đã xác nhận)
  const P = (d > 0 ? pv15.L : pv15.H).filter(q => m15[q.conf] && m15[q.conf].ct <= t && m15[q.i].t >= t - 2 * 864e5);
  const s = P.filter(q => d > 0 ? p < q.p : p > q.p); if (s.length) { const q = s[s.length - 1]; return { nm: d > 0 ? 'Đáy swing M15' : 'Đỉnh swing M15', lvl: q.p }; }
  return null;
}
// MSS M5 sau gốc: phá đỉnh/đáy swing M5 gần nhất trước gốc (đỉnh mà giá đã rơi từ đó xuống gốc)
function mss(sI, d, limit) {
  const P = (d > 0 ? pv5.H : pv5.L).filter(q => q.i < sI && q.conf <= sI); if (!P.length) return null;
  const q = P[P.length - 1];
  for (let k = sI + 1; k <= limit; k++) { if (d > 0 ? m5[k].l < m5[sI].l : m5[k].h > m5[sI].h) return null; if (d > 0 ? m5[k].c > q.p : m5[k].c < q.p) return { k, lvl: q.p }; }
  return null;
}
// FVG M5 đầu tiên trong đoạn gốc → nến MSS
function fvgIn(a, b, d) { for (let m = a + 2; m <= b; m++) { const bot = d > 0 ? m5[m - 2].h : m5[m].h, top = d > 0 ? m5[m].l : m5[m - 2].l; if (top > bot) return { m, top, bot }; } return null; }

const rows = [];
for (let li = 1; li < legs.length; li++) {
  const g = legs[li], pr = legs[li - 1], d = g.d, sI = g.sI, size = Math.abs(g.eP - g.sP), x = m5[sI], j15 = i15(x.t), a = A15[j15];
  const sw = swept(sI, g.sP, d);
  const before = m5.slice(Math.max(0, sI - 24), sI); const rng = before.length ? Math.max(...before.map(b => b.h)) - Math.min(...before.map(b => b.l)) : null;
  const ms = mss(sI, d, g.eI);
  let f = null, entry = null, fill = false, remain = null, rr = null, prog = null, mins = null, retr = null;
  if (ms) {
    prog = d * (m5[ms.k].c - g.sP) / size; mins = (m5[ms.k].t - x.t) / 6e4;
    f = fvgIn(sI, ms.k, d);
    entry = f ? (f.top + f.bot) / 2 : g.sP + d * 0.5 * Math.abs(m5[ms.k].c - g.sP); // FVG CE, không có FVG → 50% đoạn gốc→MSS
    // sau MSS: giá có hồi về entry trước khi tới đỉnh/đáy sóng không
    let ext = m5[ms.k].c; for (let k = ms.k + 1; k <= g.eI; k++) { if (d > 0 ? m5[k].l <= entry : m5[k].h >= entry) { fill = true; break; } }
    let mxR = 0; for (let k = ms.k + 1; k <= g.eI; k++) mxR = Math.max(mxR, d > 0 ? m5[ms.k].c - m5[k].l : m5[k].h - m5[ms.k].c);
    retr = mxR / Math.max(1e-9, Math.abs(m5[ms.k].c - g.sP));
    const sl = g.sP - d * (0.5 * a + SPREAD); remain = d * (g.eP - entry); rr = remain / Math.abs(entry - sl);
  }
  const s1 = S1[sI], s4 = S4[sI];
  rows.push({ t: x.t, d, size, bars: g.eI - sI, hour: hVN(x.t), sess: sess(hVN(x.t)), sweep: sw ? sw.nm : 'không quét', prevSize: Math.abs(pr.eP - pr.sP), prevBars: pr.eI - pr.sI,
    compress: rng != null && a ? rng / a : null, h4: s4 ? (s4.d === d ? 'cùng' : s4.d ? 'ngược' : '?') : '?', h1: s1 ? (s1.d === d ? 'cùng' : s1.d ? 'ngược' : '?') : '?',
    mss: !!ms, mssMin: mins, mssProg: prog, fvg: !!f, entry, fill, remain, rr, retr, sP: g.sP, eP: g.eP, atr: a });
}
// ---- 3. xác suất nền: mỗi lần quét (râu vượt mức rồi đóng quay lại trong ≤3 nến M5) + MSS M5 trước khi phá cực trị quét → bao nhiêu % chạy đủ TH
const base = {}; {
  const used = new Set();
  for (let i = 30; i < n - 300; i++) for (const d of [1, -1]) {
    const L = LV[i], cand = d > 0 ? [['PDL', L.pdL], ['PWL', L.pwL], ['Đáy London', L.lL], ['Đáy phiên Á', L.aL]] : [['PDH', L.pdH], ['PWH', L.pwH], ['Đỉnh London', L.lH], ['Đỉnh phiên Á', L.aH]];
    for (const [nm, v] of cand) { if (v == null || !(d > 0 ? m5[i].l < v : m5[i].h > v)) continue; const key = nm + v + d; if (used.has(key)) continue;
      let back = false; for (let u = i; u <= i + 3; u++) if (d > 0 ? m5[u].c > v : m5[u].c < v) { back = true; break; } if (!back) continue; used.add(key);
      // cực trị quét trong 12 nến
      let eI = i; for (let u = i; u <= i + 12; u++) if (d > 0 ? m5[u].l < m5[eI].l : m5[u].h > m5[eI].h) eI = u;
      const ms = mss(eI, d, eI + 72); const B = (base[nm] = base[nm] || { quet: 0, mss: 0, ok: 0, okM: 0 }); B.quet++;
      // có chạy đủ TH từ cực trị quét trước khi phá cực trị đó không (trong 2 ngày)
      let ok = false; for (let u = eI + 1; u < Math.min(n, eI + 576); u++) { if (d > 0 ? m5[u].l < m5[eI].l : m5[u].h > m5[eI].h) break; if (d * ((d > 0 ? m5[u].h : m5[u].l) - (d > 0 ? m5[eI].l : m5[eI].h)) >= TH) { ok = true; break; } }
      if (ok) B.ok++; if (ms) { B.mss++; if (ok) B.okM++; }
      break;
    }
  }
}
// ---- 4. in thống kê
const days = new Set(rows.map(r => Math.floor((r.t + 7 * 36e5) / 864e5))).size;
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—', avg = (L, f) => L.length ? L.reduce((s, x) => s + f(x), 0) / L.length : 0;
console.log(`\n${sym}: ${rows.length} sóng ≥ ${TH} giá trong ${days} ngày giao dịch = ${(rows.length / days).toFixed(1)} sóng/ngày · dài TB ${avg(rows, r => r.size).toFixed(1)} giá trong ${avg(rows, r => r.bars * 5).toFixed(0)} phút`);
const grp = (title, f, L = rows) => { console.log(`\n· ${title}`); const g = {}; for (const r of L) (g[f(r)] = g[f(r)] || []).push(r); for (const k of Object.keys(g).sort()) { const G = g[k]; console.log(`   ${String(k).padEnd(24)} ${String(G.length).padStart(4)} sóng (${pct(G.length, L.length).padStart(4)}) · dài TB ${avg(G, r => r.size).toFixed(1)} · có MSS M5 ${pct(G.filter(r => r.mss).length, G.length)}`); } };
grp('Bắt đầu lúc (giờ VN)', r => String(r.hour).padStart(2, '0') + 'h');
grp('Điểm bắt đầu sóng đã quét thanh khoản gì', r => r.sweep);
grp('Cấu trúc swing H4 so với chiều sóng', r => r.h4);
grp('Cấu trúc swing H1 so với chiều sóng', r => r.h1);
grp('Sóng trước đó (ngược chiều) so với sóng này', r => r.prevSize < r.size * 0.7 ? 'a sóng trước nhỏ hơn' : r.prevSize > r.size * 1.3 ? 'c sóng trước lớn hơn' : 'b ngang nhau');
grp('2 tiếng trước khi chạy (biên độ / ATR M15)', r => r.compress == null ? '—' : r.compress < 3 ? 'a đi ngang hẹp (<3 ATR)' : r.compress < 6 ? 'b bình thường' : 'c đang chạy mạnh (>6 ATR)');
const M = rows.filter(r => r.mss);
console.log(`\n· Mô hình xuất hiện trước: ${pct(M.length, rows.length)} sóng có MSS M5 (phá đỉnh/đáy swing M5 gần nhất) trước khi kết thúc`);
console.log(`   MSS xuất hiện sau TB ${avg(M, r => r.mssMin).toFixed(0)} phút, lúc đó giá đã chạy ${Math.round(100 * avg(M, r => r.mssProg))}% sóng`);
console.log(`   có FVG M5 giữa gốc và MSS: ${pct(M.filter(r => r.fvg).length, M.length)}`);
console.log(`   sau MSS giá hồi về entry (CE FVG / 50% đoạn gốc→MSS) trước khi đi tiếp: ${pct(M.filter(r => r.fill).length, M.length)}`);
const Fl = M.filter(r => r.fill);
console.log(`   nếu khớp: còn lại TB ${avg(Fl, r => r.remain).toFixed(1)} giá tới đỉnh/đáy sóng, RR TB ${avg(Fl, r => r.rr).toFixed(1)} (SL ngoài gốc sóng + 0.5 ATR)`);
console.log(`   hồi sau MSS (so với đoạn gốc→MSS): TB ${Math.round(100 * avg(M, r => r.retr))}%`);
console.log('\n· XÁC SUẤT NỀN: mỗi lần quét thanh khoản (đóng quay lại ≤3 nến M5) → bao nhiêu lần giá chạy ngược lại đủ ' + TH + ' giá trước khi phá điểm quét');
for (const [k, B] of Object.entries(base)) console.log(`   ${k.padEnd(14)} quét ${String(B.quet).padStart(4)} lần → chạy đủ ${pct(B.ok, B.quet).padStart(4)} · có MSS M5 ${B.mss} lần → chạy đủ ${pct(B.okM, B.mss)}`);
// CSV
const vn = (t) => new Date(t + 7 * 36e5).toISOString().slice(0, 16).replace('T', ' ');
const H = ['bat_dau_VN', 'chieu', 'dai_gia', 'phut', 'gio', 'phien', 'quet_thanh_khoan', 'cau_truc_H4', 'cau_truc_H1', 'song_truoc_gia', 'di_ngang_2h_ATR', 'co_MSS_M5', 'MSS_sau_phut', 'MSS_luc_da_chay_%', 'co_FVG', 'entry', 'hoi_ve_entry', 'con_lai_gia', 'RR', 'gia_bat_dau', 'gia_ket_thuc'];
const csv = [H.join(','), ...rows.map(r => [vn(r.t), r.d > 0 ? 'TĂNG' : 'GIẢM', r.size.toFixed(2), r.bars * 5, r.hour, r.sess, r.sweep, r.h4, r.h1, r.prevSize.toFixed(2), r.compress?.toFixed(1) ?? '', r.mss ? 'có' : 'không', r.mssMin ?? '', r.mssProg != null ? Math.round(100 * r.mssProg) : '', r.fvg ? 'có' : 'không', r.entry?.toFixed(2) ?? '', r.fill ? 'có' : 'không', r.remain?.toFixed(2) ?? '', r.rr?.toFixed(2) ?? '', r.sP.toFixed(2), r.eP.toFixed(2)].join(','))];
fs.writeFileSync(path.join(DIR, 'data', `moves_${sym}.csv`), '﻿' + csv.join('\n'));
fs.writeFileSync(path.join(DIR, 'data', `moves_${sym}.json`), JSON.stringify(rows));

// ---- 5. VÀO LỆNH THẬT sau mô hình quét thanh khoản + MSS M5 (không nhìn trước): TP = TH giá, SL ngoài điểm quét
// entry: 'mkt' = giá đóng nến MSS · 'ce' = limit CE FVG M5 (gốc→MSS) · 'half' = limit 50% đoạn gốc→MSS; chờ khớp tối đa 12 nến M5
const A5 = atr(m5), trades = [];
{
  const used = new Set();
  for (let i = 30; i < n - 600; i++) for (const d of [1, -1]) {
    const L = LV[i], cand = d > 0 ? [['PDL', L.pdL], ['PWL', L.pwL], ['Đáy London', L.lL], ['Đáy phiên Á', L.aL]] : [['PDH', L.pdH], ['PWH', L.pwH], ['Đỉnh London', L.lH], ['Đỉnh phiên Á', L.aH]];
    for (const [nm, v] of cand) { if (v == null || !(d > 0 ? m5[i].l < v : m5[i].h > v)) continue; const key = nm + v + d; if (used.has(key)) continue;
      let back = false; for (let u = i; u <= i + 3; u++) if (d > 0 ? m5[u].c > v : m5[u].c < v) { back = true; break; } if (!back) continue; used.add(key);
      // MSS M5 theo thời gian thực: duyệt từng nến, cực trị quét cập nhật cho tới khi MSS
      const P = (d > 0 ? pv5.H : pv5.L).filter(q => q.i < i && q.conf <= i); if (!P.length) break; const q = P[P.length - 1];
      let eI = i, k = -1; for (let u = i; u <= i + 72 && u < n; u++) { if (d > 0 ? m5[u].l < m5[eI].l : m5[u].h > m5[eI].h) eI = u; if (d > 0 ? m5[u].c > q.p : m5[u].c < q.p) { k = u; break; } }
      if (k < 0) break;
      const ext = d > 0 ? m5[eI].l : m5[eI].h, f = fvgIn(eI, k, d), a15 = A15[i15(m5[k].t)], sl = ext - d * (0.3 * a15 + SPREAD);
      const s1 = S1[k], s4 = S4[k], hr = hVN(m5[k].t);
      for (const mode of ['mkt', 'ce', 'half']) {
        const entry = mode === 'mkt' ? m5[k].c : mode === 'ce' ? (f ? (f.top + f.bot) / 2 : null) : ext + d * 0.5 * Math.abs(m5[k].c - ext);
        if (entry == null) continue; const risk = Math.abs(entry - sl); if (!(risk > 0)) continue;
        for (const [tpN, tpD] of [['15 giá', TH], ['2R', 2 * risk], ['1R', risk]]) {
          const tp = entry + d * tpD; let fill = mode === 'mkt' ? k : -1, st = 'EXPIRED', exitP = null, exitU = null;
          if (fill < 0) for (let u = k + 1; u <= k + 12; u++) { if (d > 0 ? m5[u].h >= tp : m5[u].l <= tp) { st = 'MISSED'; break; } if (d > 0 ? m5[u].l <= entry : m5[u].h >= entry) { fill = u; break; } }
          if (fill >= 0) { st = 'TIME'; for (let u = fill + (mode === 'mkt' ? 1 : 0); u < Math.min(n, fill + 576); u++) { const hs = d > 0 ? m5[u].l <= sl : m5[u].h >= sl, ht = d > 0 ? m5[u].h >= tp : m5[u].l <= tp; if (hs) { st = 'LOSS'; exitP = sl; exitU = u; break; } if (ht && u > fill) { st = 'WIN'; exitP = tp; exitU = u; break; } } if (st === 'TIME') { exitU = Math.min(n - 1, fill + 575); exitP = m5[exitU].c; } }
          const pnl = exitP != null ? d * (exitP - entry) - SPREAD : null;
          trades.push({ t: m5[k].t, nm, d, mode, tpN, entry, sl, tp, risk, st, pnl, hr, sess: sess(hr), h4: s4 && s4.d === d, h1: s1 && s1.d === d, mssMin: (m5[k].t - m5[eI].t) / 6e4, fillT: fill >= 0 ? m5[fill].t : null, exitT: exitU != null ? m5[exitU].t : null });
        }
      }
      break;
    }
  }
}
const SPLIT = Date.UTC(2026, 4, 5), LOTV = { XAU: 2, BTC: 0.02 }[sym];
const show = (title, L) => { const F = L.filter(x => x.pnl != null), w = F.filter(x => x.st === 'WIN').length, l = F.filter(x => x.st === 'LOSS').length, P = F.reduce((s, x) => s + x.pnl, 0);
  const h = (f) => { const G = F.filter(f); return `${G.reduce((s, x) => s + x.pnl, 0) >= 0 ? '+' : ''}${(G.reduce((s, x) => s + x.pnl, 0) * LOTV).toFixed(0)}$`; };
  console.log(`   ${title.padEnd(40)} ${String(F.length).padStart(4)} lệnh (${(F.length / days).toFixed(2)}/ngày) · TP ${w} SL ${l} · thắng ${pct(w, F.length)} · TB ${(P / (F.length || 1)).toFixed(2)} giá/lệnh · 0.02 lot: ${(P * LOTV).toFixed(0)}$ (6th trước ${h(x => x.t < SPLIT)} · 6th gần ${h(x => x.t >= SPLIT)})`); };
console.log(`\n· VÀO LỆNH THẬT sau quét thanh khoản + MSS M5 (SL ngoài điểm quét + 0.3 ATR M15, đã trừ spread)`);
for (const mode of ['mkt', 'ce', 'half']) for (const tpN of ['15 giá', '2R', '1R']) show(`entry ${({ mkt: 'ngay khi MSS', ce: 'CE FVG M5', half: '50% sóng gốc→MSS' })[mode]} · TP ${tpN}`, trades.filter(x => x.mode === mode && x.tpN === tpN));
console.log('   -- entry 50% sóng, TP 15 giá, tách theo:');
const T = trades.filter(x => x.mode === 'half' && x.tpN === '15 giá');
for (const nm of [...new Set(T.map(x => x.nm))]) show('quét ' + nm, T.filter(x => x.nm === nm));
for (const s of ['đêm', 'Á', 'London', 'New York']) show('phiên ' + s, T.filter(x => x.sess === s));
show('cấu trúc H4 cùng chiều', T.filter(x => x.h4)); show('cấu trúc H4 ngược', T.filter(x => !x.h4));
show('cấu trúc H1 cùng chiều', T.filter(x => x.h1)); show('MSS trong ≤30 phút sau quét', T.filter(x => x.mssMin <= 30)); show('MSS chậm >30 phút', T.filter(x => x.mssMin > 30));
fs.writeFileSync(path.join(DIR, 'data', `movetrades_${sym}.json`), JSON.stringify(trades));
