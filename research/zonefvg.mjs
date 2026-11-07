// Kịch bản: vùng mạnh H4/H1 (chấm điểm ≥ 6/10) → quét thanh khoản M15 → MSS có displacement → FVG → limit 50% FVG · SL ngoài cú quét · TP 2.5R
// Đúng theo file kịch bản người dùng gửi (07/11/2026). Không nhìn trước: vùng/swing chỉ dùng sau khi xác nhận, nến khung lớn đã đóng.
// Dùng: node research/zonefvg.mjs XAU2Y|XAU|BTC [ngàyBắtĐầu] [ngàyKếtThúc] [--nofilter]
import { load, resample, atr, pivots } from './core.mjs';
const SYM = process.argv[2] || 'XAU2Y', BTC = SYM === 'BTC', SP = BTC ? 18 : 0.35, USDPT = BTC ? 0.02 : 2; // 0.02 lot: vàng 2$/giá, BTC 0.02$/giá
const NOFILTER = process.argv.includes('--nofilter'), MINS = +(process.env.MINS || 6), NOBODY = !!process.env.NOBODY, MSSN = +(process.env.MSSN || 8), FVGW = +(process.env.FVGW ?? 0.1);
const m5 = load(SYM, 'm5'), m15 = load(SYM, 'm15'), h1 = load(SYM, 'h1'), h4 = resample(h1, 144e5);
const POS = process.argv.slice(2).filter(a => !a.startsWith('--')), END = POS[2] ? Date.parse(POS[2]) : m15.at(-1).ct, START = POS[1] ? Date.parse(POS[1]) : END - 365 * 864e5;
const A15 = atr(m15), P15 = pivots(m15, 2);
const body = (x) => Math.abs(x.c - x.o);

// ---------- 1. Vùng H1/H4
function zonesOf(c, tf) {
  const A = atr(c), pv = pivots(c, 3), Z = [];
  const sH = pv.H.map(q => ({ ...q })), sL = pv.L.map(q => ({ ...q }));
  const lastConf = (arr, k) => { let r = null; for (const q of arr) { if (q.conf <= k) r = q; else break; } return r; };
  for (const [arr, type] of [[pv.L, 'S'], [pv.H, 'R']]) for (const q of arr) {
    const i = q.i; if (i + 3 >= c.length) continue; const x = c[i];
    const lo = type === 'S' ? x.l : Math.max(x.o, x.c), hi = type === 'S' ? Math.min(x.o, x.c) : x.h;
    if (hi - lo > 0.8 * A[i]) continue;
    const d = type === 'S' ? 1 : -1;
    let dep = false, brk = false;
    for (let k = i + 1; k <= i + 3; k++) {
      if (d > 0 ? c[k].h - hi >= 1.5 * A[i] : lo - c[k].l >= 1.5 * A[i]) dep = true;
      const opp = lastConf(d > 0 ? sH : sL, k - 1); if (opp && opp.i < i && (d > 0 ? c[k].c > opp.p : c[k].c < opp.p)) brk = true;
    }
    let invT = Infinity; const touches = [];
    for (let k = i + 4; k < c.length; k++) {
      if (d > 0 ? c[k].c < lo - 0.1 * A[k] : c[k].c > hi + 0.1 * A[k]) { invT = c[k].ct; break; }
      if (d > 0 ? c[k].l <= hi : c[k].h >= lo) touches.push(c[k].ct);
    }
    Z.push({ tf, type, lo, hi, act: c[i + 3].ct, invT, dep, brk, touches, t: x.t });
  }
  return Z;
}
const ZONES = [...zonesOf(h1, 'H1'), ...zonesOf(h4, 'H4')];
const live = (t) => ZONES.filter(z => z.act <= t && z.invT > t);

// ---------- hướng H4: lần phá swing gần nhất bằng giá đóng cửa
const PV4 = pivots(h4, 3), dir4At = (() => { const out = []; let d = 0, ih = 0, il = 0, lh = null, ll = null;
  for (let k = 0; k < h4.length; k++) { while (ih < PV4.H.length && PV4.H[ih].conf <= k - 1) lh = PV4.H[ih++]; while (il < PV4.L.length && PV4.L[il].conf <= k - 1) ll = PV4.L[il++];
    if (lh && !lh.broken && h4[k].c > lh.p) { d = 1; lh.broken = true; } if (ll && !ll.broken && h4[k].c < ll.p) { d = -1; ll.broken = true; } out.push({ ct: h4[k].ct, d }); }
  return (t) => { let lo = 0, hi = out.length - 1, r = 0; while (lo <= hi) { const m = (lo + hi) >> 1; if (out[m].ct <= t) { r = out[m].d; lo = m + 1; } else hi = m - 1; } return r; }; })();

// ---------- đỉnh/đáy ngày trước (theo ngày UTC)
const dayK = (t) => Math.floor(t / 864e5), DAY = new Map(); for (const x of m15) { const k = dayK(x.t), v = DAY.get(k); if (!v) DAY.set(k, { h: x.h, l: x.l }); else { v.h = Math.max(v.h, x.h); v.l = Math.min(v.l, x.l); } }
const DKEYS = [...DAY.keys()].sort((a, b) => a - b), pdAt = (t) => { const k = dayK(t); let p = null; for (const d of DKEYS) { if (d < k) p = d; else break; } return p == null ? null : DAY.get(p); };

function score(z, t, visitStart) {
  let s = 0, why = [];
  if (z.tf === 'H4') { s += 2; why.push('H4+2'); }
  if (live(t).some(o => o.tf !== z.tf && o.type === z.type && o.lo <= z.hi && o.hi >= z.lo)) { s += 2; why.push('H1&H4+2'); }
  if (z.dep) { s += 2; why.push('rời1.5ATR+2'); }
  if (z.brk) { s += 2; why.push('phá swing+2'); }
  if (!z.touches.some(ct => ct <= visitStart)) { s += 1; why.push('chưa test+1'); }
  const pd = pdAt(t); if (pd && ((pd.h >= z.lo && pd.h <= z.hi) || (pd.l >= z.lo && pd.l <= z.hi))) { s += 1; why.push('PDH/PDL+1'); }
  return { s, why };
}

// ---------- mô phỏng trên M5
const i5 = (() => { const m = new Map(); m5.forEach((x, j) => m.set(x.t, j)); return (t) => { for (let u = 0; u < 3; u++) { const j = m.get(t + u * 3e5); if (j != null) return j; } return null; }; })();
function simulate(sg) {
  const d = sg.side; let j = i5(sg.placeT); if (j == null) return { ...sg, state: 'NODATA', endT: sg.placeT };
  const exp = sg.placeT + 8 * 9e5; let fillJ = -1;
  for (; j < m5.length; j++) { const x = m5[j]; if (x.t >= exp) return { ...sg, state: 'EXPIRED', endT: exp };
    if (sg.zone.invT <= x.ct) return { ...sg, state: 'ZONE_INV', endT: x.ct };
    const bidLo = x.l, bidHi = x.h, askLo = x.l + SP, askHi = x.h + SP;
    const touchSL = d > 0 ? bidLo <= sg.sl : askHi >= sg.sl, fill = d > 0 ? askLo <= sg.entry : bidHi >= sg.entry;
    if (touchSL && !fill) return { ...sg, state: 'SL_FIRST', endT: x.ct };
    if (fill) { fillJ = j; if (touchSL) return { ...sg, state: 'LOSS', fillT: x.t, endT: x.ct, R: -1 }; break; } }
  if (fillJ < 0) return { ...sg, state: 'OPEN_END', endT: Infinity };
  for (let u = fillJ + 1; u < m5.length; u++) { const x = m5[u];
    const hitSL = d > 0 ? x.l <= sg.sl : x.h + SP >= sg.sl, hitTP = d > 0 ? x.h >= sg.tp : x.l + SP <= sg.tp;
    if (hitSL) return { ...sg, state: 'LOSS', fillT: m5[fillJ].t, endT: x.ct, R: -1 };
    if (hitTP) return { ...sg, state: 'WIN', fillT: m5[fillJ].t, endT: x.ct, R: 2.5 }; }
  return { ...sg, state: 'OPEN_END', endT: Infinity };
}

// ---------- 2/3. tìm kèo trên M15
const F = { sweep: 0, mss: 0, bodyFail: 0, noFVG: 0, blocked: 0, placed: 0 }, OUT = [];
let busy = 0, ih = 0, il = 0; const sH = [], sL = [];
for (let k = 30; k < m15.length - 12; k++) {
  while (ih < P15.H.length && P15.H[ih].conf <= k - 1) sH.push(P15.H[ih++]); while (il < P15.L.length && P15.L[il].conf <= k - 1) sL.push(P15.L[il++]);
  const x = m15[k]; if (x.t < START || x.t >= END) continue; if (x.t < busy) continue; const a = A15[k];
  let made = false;
  for (const d of [1, -1]) { if (made) break;
    if (dir4At(x.ct) !== d) continue;
    // đáy/đỉnh thanh khoản M15 (2 nến mỗi bên, đã xác nhận, chưa bị quét), nằm trong vùng ≥ 6 điểm
    const pool = (d > 0 ? sL : sH).filter(q => q.i >= k - 192);
    const zs = live(x.ct).filter(z => z.type === (d > 0 ? 'S' : 'R'));
    let best = null;
    for (const q of pool) {
      if (!(d > 0 ? x.l <= q.p - 0.05 * a && x.c > q.p : x.h >= q.p + 0.05 * a && x.c < q.p)) continue;
      let swept = false; for (let u = q.i + 1; u < k; u++) if (d > 0 ? m15[u].l < q.p : m15[u].h > q.p) { swept = true; break; } if (swept) continue;
      for (const z of zs) { if (q.p < z.lo || q.p > z.hi) continue;
        let j = k; while (j > 0 && (d > 0 ? m15[j - 1].l <= z.hi + A15[j - 1] : m15[j - 1].h >= z.lo - A15[j - 1])) j--; // đầu lượt quay về vùng
        const sc = score(z, x.ct, m15[j].t); if (sc.s >= MINS && (!best || sc.s > best.sc.s)) best = { q, z, sc }; }
    }
    if (!best) continue; F.sweep++; made = true;
    const opp = (d > 0 ? sH : sL).at(-1); if (!opp) { busy = x.ct; continue; }
    // MSS trong ≤ 8 nến
    let m = -1, ext = d > 0 ? x.l : x.h;
    for (let u = k + 1; u <= k + MSSN; u++) { const y = m15[u]; ext = d > 0 ? Math.min(ext, y.l) : Math.max(ext, y.h);
      if (d > 0 ? y.c < best.q.p : y.c > best.q.p) break; if (d > 0 ? y.c > opp.p : y.c < opp.p) { m = u; break; } }
    if (m < 0) { busy = m15[Math.min(k + 8, m15.length - 1)].ct; continue; } F.mss++;
    const y = m15[m], avg = m15.slice(m - 20, m).reduce((s, z) => s + body(z), 0) / 20;
    if (!NOBODY && !(d * (y.c - y.o) > 0 && body(y) >= 1.2 * avg && body(y) >= 0.6 * (y.h - y.l))) { F.bodyFail++; busy = y.ct; continue; }
    // FVG: nến MSS là C (A = m-2) hoặc B (C = m+1)
    let fvg = null;
    for (const C of [m, m + 1]) { const A = m15[C - 2], c3 = m15[C]; const lo = d > 0 ? A.h : c3.h, hi = d > 0 ? c3.l : A.l;
      if (hi - lo >= FVGW * a && hi > lo) { fvg = { lo, hi, C }; break; } }
    if (!fvg) { F.noFVG++; busy = m15[m + 1].ct; continue; }
    for (let u = m + 1; u <= fvg.C; u++) ext = d > 0 ? Math.min(ext, m15[u].l) : Math.max(ext, m15[u].h);
    const placeT = m15[fvg.C].ct, entry = (fvg.lo + fvg.hi) / 2, pad = Math.max(0.1 * a, SP), sl = ext - d * pad, risk = d * (entry - sl);
    if (!(risk > 0)) { busy = placeT; continue; }
    const tp = entry + d * 2.5 * risk;
    const block = live(placeT).find(z => z.type === (d > 0 ? 'R' : 'S') && (d > 0 ? z.lo > entry && z.lo < tp : z.hi < entry && z.hi > tp));
    if (block && !NOFILTER) { F.blocked++; busy = placeT; continue; }
    F.placed++;
    const r = simulate({ side: d, sweepT: x.t, placeT, entry, sl, tp, risk, zone: best.z, score: best.sc.s, why: best.sc.why.join(' '), zoneTF: best.z.tf, hourVN: (new Date(placeT).getUTCHours() + 7) % 24 });
    OUT.push(r); busy = r.endT;
  }
}

// ---------- báo cáo
const T = OUT.filter(r => r.state === 'WIN' || r.state === 'LOSS'), W = T.filter(r => r.state === 'WIN').length;
let eq = 0, pk = 0, dd = 0, ls = 0, ml = 0, eqU = 0, pkU = 0, ddU = 0;
for (const r of T) { const R = r.R - SP / r.risk * 0; eq += r.R; pk = Math.max(pk, eq); dd = Math.max(dd, pk - eq); ls = r.R < 0 ? ls + 1 : 0; ml = Math.max(ml, ls);
  const u = (r.state === 'WIN' ? 2.5 : -1) * r.risk * USDPT; eqU += u; pkU = Math.max(pkU, eqU); ddU = Math.max(ddU, pkU - eqU); }
const gw = W * 2.5, gl = T.length - W, months = (END - START) / (30.44 * 864e5);
const cnt = (s) => OUT.filter(r => r.state === s).length;
const fmt = (L) => { const w = L.filter(r => r.state === 'WIN').length; return `${L.length} lệnh, thắng ${L.length ? Math.round(100 * w / L.length) : 0}%, ${(w * 2.5 - (L.length - w)).toFixed(1)}R`; };
console.log(`\n=== ${SYM} · ${new Date(START).toISOString().slice(0, 10)} → ${new Date(END).toISOString().slice(0, 10)} · spread ${SP} · điểm≥${MINS} · MSS≤${MSSN} nến${NOBODY ? ' · bỏ luật thân nến' : ''}${NOFILTER ? ' · KHÔNG lọc vùng chắn TP' : ''}`);
console.log(`Phễu: quét hợp lệ trong vùng ≥6đ ${F.sweep} → có MSS ${F.mss} → nến phá đủ mạnh ${F.mss - F.bodyFail} → có FVG ${F.mss - F.bodyFail - F.noFVG} → bị vùng chắn TP ${F.blocked} → đặt limit ${F.placed}`);
console.log(`Lệnh limit: khớp ${T.length} · hết hạn ${cnt('EXPIRED')} · chạm SL trước khi khớp ${cnt('SL_FIRST')} · vùng vô hiệu ${cnt('ZONE_INV')} · còn mở ${cnt('OPEN_END')}`);
console.log(`KẾT QUẢ: ${T.length} lệnh (${(T.length / months).toFixed(1)}/tháng) · TP ${W} / SL ${T.length - W} · thắng ${T.length ? (100 * W / T.length).toFixed(0) : 0}% · tổng ${(gw - gl).toFixed(1)}R · kỳ vọng ${T.length ? ((gw - gl) / T.length).toFixed(2) : 0}R/lệnh · PF ${gl ? (gw / gl).toFixed(2) : '∞'} · sụt tối đa ${dd.toFixed(1)}R · thua liên tiếp ${ml}`);
console.log(`0.02 lot: ${eqU >= 0 ? '+' : ''}${Math.round(eqU)}$ · sụt ${Math.round(ddU)}$ · SL TB ${(T.reduce((s, r) => s + r.risk, 0) / (T.length || 1)).toFixed(BTC ? 0 : 1)} giá`);
console.log(`BUY: ${fmt(T.filter(r => r.side > 0))} · SELL: ${fmt(T.filter(r => r.side < 0))} · vùng H4: ${fmt(T.filter(r => r.zoneTF === 'H4'))} · vùng H1: ${fmt(T.filter(r => r.zoneTF === 'H1'))}`);
const half = START + (END - START) / 2; console.log(`Nửa đầu: ${fmt(T.filter(r => r.placeT < half))} · nửa sau: ${fmt(T.filter(r => r.placeT >= half))}`);
if (process.argv.includes('--list')) for (const r of T) console.log(new Date(r.placeT + 7 * 36e5).toISOString().slice(0, 16), r.side > 0 ? 'BUY ' : 'SELL', r.entry.toFixed(2), 'SL', r.sl.toFixed(2), 'TP', r.tp.toFixed(2), r.state, r.score + 'đ', r.why);
