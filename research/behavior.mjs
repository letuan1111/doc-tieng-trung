// Hành vi giá 2 năm (vàng / dầu): giờ chạy mạnh, sóng bắt đầu ra sao, quét thanh khoản, phá vỡ cấu trúc, test EMA, lấp FVG, phản ứng tại PDH/PDL & biên phiên Á
// node research/behavior.mjs XAU2Y|OIL  → in bảng + ghi research/data/behavior_{SYM}.json
import fs from 'node:fs'; import path from 'node:path';
import { DIR, load, ema, atr, pivots, resample } from './core.mjs';
const SYM = process.argv[2] || 'XAU2Y', NM = SYM === 'OIL' ? 'Dầu WTI' : 'Vàng';
const h1 = load(SYM, 'h1'), m15 = load(SYM, 'm15'), m5 = load(SYM, 'm5'), m30 = resample(m15, 18e5);
const VN = 7 * 36e5, hr = (t) => new Date(t + VN).getUTCHours(), dkey = (t) => new Date(t + VN - 6 * 36e5).toISOString().slice(0, 10); // ngày giao dịch 06h → 05h
const pct = (a, b) => b ? Math.round(100 * a / b) : 0, med = (a) => { a = a.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : NaN; }, avg = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const T0 = m15[0].t, T1 = m15[m15.length - 1].t, Y1 = T1 - 365 * 864e5; const OUT = { sym: SYM, from: T0, to: T1 };
const dp = SYM === 'OIL' ? 2 : 1, f = (v) => (+v).toFixed(dp);
console.log(`######## ${NM} · ${new Date(T0).toISOString().slice(0, 10)} → ${new Date(T1).toISOString().slice(0, 10)} · M15 ${m15.length} nến`);
// ---------- 1. Giờ chạy mạnh (H1, giờ VN)
const A1 = atr(h1), HR = [...Array(24)].map(() => ({ n: 0, rng: [], rngA: [], body: [], big: 0, up: 0, rngY: [[], []] }));
for (let i = 30; i < h1.length; i++) { const x = h1[i], g = HR[hr(x.t)], r = x.h - x.l; g.n++; g.rng.push(r); g.rngA.push(r / A1[i - 1]); g.body.push(Math.abs(x.c - x.o) / (r || 1)); if (r >= 1.8 * A1[i - 1]) g.big++; if (x.c > x.o) g.up++; g.rngY[x.t < Y1 ? 0 : 1].push(r); }
console.log('\n== 1. Biên độ nến H1 theo giờ VN (trung bình · so với ATR · % nến "bùng nổ" ≥ 1.8 ATR · thân/biên · % nến tăng)');
OUT.hours = HR.map((g, h) => ({ h, n: g.n, rng: avg(g.rng), rngA: avg(g.rngA), big: pct(g.big, g.n), body: avg(g.body), up: pct(g.up, g.n), y1: avg(g.rngY[0]), y2: avg(g.rngY[1]) }));
const mx = Math.max(...OUT.hours.map(x => x.rng || 0));
for (const x of OUT.hours) if (x.n) console.log(`  ${String(x.h).padStart(2, '0')}h ${f(x.rng).padStart(6)} (${x.rngA.toFixed(2)} ATR) · bùng nổ ${String(x.big).padStart(2)}% · thân ${Math.round(100 * x.body)}% · tăng ${x.up}% · năm 1 ${f(x.y1)} / năm 2 ${f(x.y2)} ${'█'.repeat(Math.round(x.rng / mx * 30))}`);
// ---------- 2. Ngày: biên độ, giờ tạo đỉnh/đáy ngày
const D = {}; for (const x of h1) (D[dkey(x.t)] = D[dkey(x.t)] || []).push(x);
const days = Object.entries(D).filter(([, B]) => B.length >= 18); const adr = days.map(([, B]) => Math.max(...B.map(v => v.h)) - Math.min(...B.map(v => v.l)));
const hiH = new Array(24).fill(0), loH = new Array(24).fill(0); let firstHigh = 0;
for (const [, B] of days) { let hi = B[0], lo = B[0]; for (const v of B) { if (v.h > hi.h) hi = v; if (v.l < lo.l) lo = v; } hiH[hr(hi.t)]++; loH[hr(lo.t)]++; if (hi.t < lo.t) firstHigh++; }
OUT.adr = { med: med(adr), avg: avg(adr), p25: [...adr].sort((a, b) => a - b)[adr.length >> 2], p75: [...adr].sort((a, b) => a - b)[(adr.length * 3) >> 2] };
OUT.extreme = [...Array(24).keys()].map(h => ({ h, hi: pct(hiH[h], days.length), lo: pct(loH[h], days.length) }));
console.log(`\n== 2. Biên độ ngày (06h→05h VN): trung vị ${f(OUT.adr.med)} · TB ${f(OUT.adr.avg)} · 25–75%: ${f(OUT.adr.p25)}–${f(OUT.adr.p75)} · ${days.length} ngày · đỉnh ngày đến TRƯỚC đáy ${pct(firstHigh, days.length)}%`);
console.log('   giờ VN tạo ĐỈNH / ĐÁY ngày (% số ngày): ' + [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4].map(h => `${h}h ${pct(hiH[h], days.length)}/${pct(loH[h], days.length)}`).join(' · '));
// ---------- 3. Phiên Á → Âu → Mỹ (giờ VN: Á 07–14, Âu 14–19, Mỹ 19–24)
let asia = 0, brk = 0, brkOne = 0, both = 0, fakeBreak = 0, contBreak = 0, ldnSweepRev = 0, ldnSweep = 0, nyRev = 0, nyN = 0; const brkHour = new Array(24).fill(0);
for (const [, B] of days) { const As = B.filter(v => hr(v.t) >= 7 && hr(v.t) < 14); if (As.length < 6) continue; asia++; const H = Math.max(...As.map(v => v.h)), L = Math.min(...As.map(v => v.l)), rest = B.filter(v => hr(v.t) >= 14 || hr(v.t) < 6);
  const upT = rest.find(v => v.h > H), dnT = rest.find(v => v.l < L); if (upT || dnT) brk++; if (upT && dnT) both++; else if (upT || dnT) brkOne++;
  const first = !upT ? dnT : !dnT ? upT : (upT.t < dnT.t ? upT : dnT); if (first) { brkHour[hr(first.t)]++; const d = first === upT ? 1 : -1, end = B[B.length - 1].c; if (d * (end - (d > 0 ? H : L)) > 0) contBreak++; else fakeBreak++; }
  const Ld = B.filter(v => hr(v.t) >= 14 && hr(v.t) < 19); if (Ld.length) { const lh = Math.max(...Ld.map(v => v.h)), ll = Math.min(...Ld.map(v => v.l)), lc = Ld[Ld.length - 1].c; const sw = lh > H || ll < L; if (sw) { ldnSweep++; if ((lh > H && lc < H) || (ll < L && lc > L)) ldnSweepRev++; } }
  const Ny = B.filter(v => hr(v.t) >= 19 && hr(v.t) < 24); if (Ld.length && Ny.length) { nyN++; const ld = Ld[Ld.length - 1].c - Ld[0].o, ny = Ny[Ny.length - 1].c - Ny[0].o; if (Math.sign(ld) !== Math.sign(ny)) nyRev++; } }
OUT.sess = { asia, brk: pct(brk, asia), both: pct(both, asia), cont: pct(contBreak, contBreak + fakeBreak), fake: pct(fakeBreak, contBreak + fakeBreak), ldnSweep: pct(ldnSweep, asia), ldnSweepRev: pct(ldnSweepRev, ldnSweep), nyRev: pct(nyRev, nyN) };
console.log(`\n== 3. Phiên: biên phiên Á (07–14h) bị phá sau 14h ${OUT.sess.brk}% ngày (phá cả 2 đầu ${OUT.sess.both}%) · lần phá đầu tiên: giá đóng ngày tiếp tục theo hướng phá ${OUT.sess.cont}% / quay lại ${OUT.sess.fake}%`);
console.log(`   phiên Âu (14–19h) quét đỉnh/đáy phiên Á ${OUT.sess.ldnSweep}% ngày → trong đó đóng phiên Âu quay lại trong biên (quét giả) ${OUT.sess.ldnSweepRev}% · phiên Mỹ đi NGƯỢC chiều phiên Âu ${OUT.sess.nyRev}% ngày`);
console.log('   giờ phá biên phiên Á lần đầu: ' + [14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1].map(h => `${h}h ${pct(brkHour[h], brk)}%`).join(' · '));
// ---------- 4. PDH / PDL
let pdN = 0, pdhT = 0, pdlT = 0, pdhRev = 0, pdlRev = 0; const DK = days.map(([k]) => k);
for (let j = 1; j < days.length; j++) { const P = days[j - 1][1], B = days[j][1], PH = Math.max(...P.map(v => v.h)), PL = Math.min(...P.map(v => v.l)); pdN++; const end = B[B.length - 1].c;
  if (Math.max(...B.map(v => v.h)) > PH) { pdhT++; if (end < PH) pdhRev++; } if (Math.min(...B.map(v => v.l)) < PL) { pdlT++; if (end > PL) pdlRev++; } }
OUT.pd = { pdh: pct(pdhT, pdN), pdl: pct(pdlT, pdN), pdhRev: pct(pdhRev, pdhT), pdlRev: pct(pdlRev, pdlT) };
console.log(`\n== 4. Đỉnh/đáy hôm trước: phá PDH ${OUT.pd.pdh}% ngày (đóng ngày quay xuống dưới PDH = quét giả ${OUT.pd.pdhRev}%) · phá PDL ${OUT.pd.pdl}% (quay lên trên PDL ${OUT.pd.pdlRev}%)`);
// ---------- 5. Sóng M15 (zigzag ≥ 3 ATR): số sóng, độ dài, giờ bắt đầu, có quét trước không, hồi bao sâu
const A15 = atr(m15), pv15 = pivots(m15, 3), Z = []; { let dir = 0, ext = m15[20].h, ei = 20; for (let i = 21; i < m15.length; i++) { const x = m15[i], th = 3 * A15[i];
  if (dir >= 0) { if (x.h > ext || !dir) { if (x.h > ext) { ext = x.h; ei = i; } dir = dir || 1; } if (dir === 1 && x.l < ext - th) { Z.push({ i: ei, p: ext, type: 'H' }); dir = -1; ext = x.l; ei = i; continue; } }
  if (dir === -1) { if (x.l < ext) { ext = x.l; ei = i; } if (x.h > ext + th) { Z.push({ i: ei, p: ext, type: 'L' }); dir = 1; ext = x.h; ei = i; } } } }
const legs = []; for (let j = 0; j + 1 < Z.length; j++) { const a = Z[j], b = Z[j + 1]; legs.push({ a, b, d: a.type === 'L' ? 1 : -1, size: Math.abs(b.p - a.p), bars: b.i - a.i, sizeA: Math.abs(b.p - a.p) / A15[a.i], h: hr(m15[a.i].t) }); }
// có quét thanh khoản ở điểm bắt đầu? (đáy sóng tăng thấp hơn đáy swing M15 trước đó trong 48 nến)
const pivL = pv15.L, pivH = pv15.H; let swept = 0, pdSwept = 0; for (const L of legs) { const i = L.a.i, P = (L.d > 0 ? pivL : pivH).filter(q => q.i < i - 1 && q.i >= i - 48 && q.conf <= i).slice(-1)[0]; if (P && (L.d > 0 ? L.a.p < P.p : L.a.p > P.p)) { L.swept = true; swept++; } }
// độ sâu nhịp hồi trong sóng lớn: hồi tiếp theo (sóng ngược) so với sóng trước
const retr = []; for (let j = 0; j + 1 < legs.length; j++) retr.push(legs[j + 1].size / legs[j].size);
const rb = (a, b) => pct(retr.filter(r => r >= a && r < b).length, retr.length);
OUT.waves = { n: legs.length, perDay: legs.length / days.length, med: med(legs.map(l => l.size)), medA: med(legs.map(l => l.sizeA)), medMin: med(legs.map(l => l.bars * 15)), swept: pct(swept, legs.length), startH: [...Array(24).keys()].map(h => pct(legs.filter(l => l.h === h).length, legs.length)), retr: { r38: rb(0, 0.382), r50: rb(0.382, 0.5), r62: rb(0.5, 0.618), r79: rb(0.618, 0.79), r100: rb(0.79, 1), over: rb(1, 99) } };
console.log(`\n== 5. Sóng M15 ≥ 3 ATR: ${legs.length} sóng (${OUT.waves.perDay.toFixed(1)}/ngày) · dài trung vị ${f(OUT.waves.med)} (${OUT.waves.medA.toFixed(1)} ATR) · kéo dài trung vị ${OUT.waves.medMin} phút · bắt đầu bằng cú QUÉT đáy/đỉnh swing trước đó ${OUT.waves.swept}%`);
console.log(`   sóng ngược kế tiếp hồi bao nhiêu % sóng trước: <38% ${OUT.waves.retr.r38}% · 38–50% ${OUT.waves.retr.r50}% · 50–62% ${OUT.waves.retr.r62}% · 62–79% ${OUT.waves.retr.r79}% · 79–100% ${OUT.waves.retr.r100}% · >100% (đảo chiều) ${OUT.waves.retr.over}%`);
console.log('   giờ VN sóng bắt đầu: ' + [...Array(24).keys()].map(h => `${h}h ${OUT.waves.startH[h]}%`).join(' · '));
// ---------- 6. Phá cấu trúc M15 (BOS theo xu hướng / CHoCH đảo chiều): sau khi đóng cửa qua swing, giá đi tiếp ≥ 1.5 ATR trước khi quay lại 1 ATR?
const bos = { cont: [0, 0], rev: [0, 0] }; { let ih = 0, il = 0, lastH = null, lastL = null, tr = 0, usedH = null, usedL = null;
  for (let i = 30; i < m15.length - 1; i++) { while (ih < pivH.length && pivH[ih].conf <= i) lastH = pivH[ih++]; while (il < pivL.length && pivL[il].conf <= i) lastL = pivL[il++]; const x = m15[i], a = A15[i];
    for (const [P, d] of [[lastH, 1], [lastL, -1]]) { if (!P || (d > 0 ? usedH === P : usedL === P)) continue; if (!(d > 0 ? x.c > P.p && m15[i - 1].c <= P.p : x.c < P.p && m15[i - 1].c >= P.p)) continue;
      if (d > 0) usedH = P; else usedL = P; const kind = tr === d ? 'cont' : 'rev'; tr = d; let ok = 0;
      for (let u = i + 1; u < Math.min(m15.length, i + 96); u++) { const y = m15[u]; if (d > 0 ? y.l <= x.c - a : y.h >= x.c + a) break; if (d > 0 ? y.h >= x.c + 1.5 * a : y.l <= x.c - 1.5 * a) { ok = 1; break; } }
      bos[kind][0]++; bos[kind][1] += ok; } } }
OUT.bos = { bos: pct(bos.cont[1], bos.cont[0]), bosN: bos.cont[0], choch: pct(bos.rev[1], bos.rev[0]), chochN: bos.rev[0] };
console.log(`\n== 6. Phá cấu trúc M15 (đóng cửa qua swing): BOS cùng xu hướng ${OUT.bos.bosN} lần → đi tiếp 1.5 ATR trước khi lùi 1 ATR ${OUT.bos.bos}% · CHoCH đảo chiều ${OUT.bos.chochN} lần → ${OUT.bos.choch}%  (mốc ngẫu nhiên ≈ 40%)`);
// ---------- 7. Test EMA (M15/M30): giá chạy một phía ≥ 6 nến rồi chạm lại → bật ≥ 1 ATR trước khi đóng xuyên 0.5 ATR
OUT.ema = []; for (const [tn, C] of [['M15', m15], ['M30', m30]]) { const At = tn === 'M15' ? A15 : atr(C); for (const p of [21, 34, 89]) { const E = ema(C.map(x => x.c), p); let N = 0, ok = 0, side = 0, run = 0;
  for (let i = 120; i < C.length - 1; i++) { const s = Math.sign(C[i].c - E[i]); if (s === side) run++; else { side = s; run = 1; } const x = C[i + 1], a = At[i]; if (run < 6) continue; const d = side; if (!(d > 0 ? x.l <= E[i] : x.h >= E[i])) continue; N++;
    for (let u = i + 1; u < Math.min(C.length, i + 200); u++) { if (d * (C[u].c - E[u]) < -0.5 * a) break; if (d > 0 ? C[u].h >= E[i] + a : C[u].l <= E[i] - a) { ok++; break; } } run = 0; }
  OUT.ema.push({ tf: tn, p, perDay: N / days.length, bounce: pct(ok, N) }); } }
console.log('\n== 7. Test EMA rồi bật lại ≥ 1 ATR (trước khi đóng xuyên 0.5 ATR):  ' + OUT.ema.map(e => `EMA${e.p} ${e.tf} ${e.perDay.toFixed(1)}/ngày ${e.bounce}%`).join(' · '));
// ---------- 8. FVG M15: bao nhiêu % bị lấp lại, lấp tới đâu, giá phản ứng ở FVG
let fN = 0, fTouch = 0, fCE = 0, fFull = 0, fReact = 0; for (let i = 2; i < m15.length - 50; i++) { for (const d of [1, -1]) { const top = d > 0 ? m15[i].l : m15[i - 2].l, bot = d > 0 ? m15[i - 2].h : m15[i].h; if (!(top - bot > 0.3 * A15[i])) continue; fN++;
  const edge = d > 0 ? top : bot, ce = (top + bot) / 2, far = d > 0 ? bot : top; let t = false, c = false, fu = false, re = false;
  for (let u = i + 1; u < i + 49; u++) { const y = m15[u]; if (!t && (d > 0 ? y.l <= edge : y.h >= edge)) { t = true; for (let v = u; v < Math.min(m15.length, u + 16); v++) { if (d > 0 ? m15[v].c < far : m15[v].c > far) break; if (d > 0 ? m15[v].h >= edge + A15[i] : m15[v].l <= edge - A15[i]) { re = true; break; } } }
    if (d > 0 ? y.l <= ce : y.h >= ce) c = true; if (d > 0 ? y.l <= far : y.h >= far) { fu = true; break; } } fTouch += t; fCE += c; fFull += fu; fReact += re; } }
OUT.fvg = { n: fN, touch: pct(fTouch, fN), ce: pct(fCE, fN), full: pct(fFull, fN), react: pct(fReact, fTouch) };
console.log(`\n== 8. FVG M15 (≥ 0.3 ATR): ${fN} vùng · giá quay lại chạm mép trong 12h ${OUT.fvg.touch}% · chạm giữa (CE) ${OUT.fvg.ce}% · lấp hết ${OUT.fvg.full}% · khi chạm mép, bật lại ≥ 1 ATR mà chưa đóng qua mép xa ${OUT.fvg.react}%`);
// ---------- 9. Quét thanh khoản M5 (râu qua đỉnh/đáy swing rồi đóng lại) → phản ứng ≥ 1 ATR M15 trước khi phá tiếp cực trị
const pv5 = pivots(m5, 3), A15on5 = []; { let j = 0; for (let i = 0; i < m5.length; i++) { while (j + 1 < m15.length && m15[j + 1].ct <= m5[i].ct) j++; A15on5[i] = A15[j]; } }
const SW = [...Array(24)].map(() => [0, 0]); { let ih = 0, il = 0, H = null, L = null; for (let i = 50; i < m5.length - 100; i++) { while (ih < pv5.H.length && pv5.H[ih].conf <= i) H = pv5.H[ih++]; while (il < pv5.L.length && pv5.L[il].conf <= i) L = pv5.L[il++]; const x = m5[i], a = A15on5[i];
  for (const [P, d] of [[L, 1], [H, -1]]) { if (!P) continue; if (!(d > 0 ? x.l < P.p && x.c > P.p : x.h > P.p && x.c < P.p)) continue; const ex = d > 0 ? x.l : x.h; let ok = 0;
    for (let u = i + 1; u < i + 96; u++) { const y = m5[u]; if (d > 0 ? y.l < ex : y.h > ex) break; if (d > 0 ? y.h >= x.c + a : y.l <= x.c - a) { ok = 1; break; } } const g = SW[hr(x.t)]; g[0]++; g[1] += ok; } } }
OUT.sweep = SW.map((g, h) => ({ h, n: g[0], ok: pct(g[1], g[0]) })); const swAll = SW.reduce((s, g) => [s[0] + g[0], s[1] + g[1]], [0, 0]);
console.log(`\n== 9. Quét đỉnh/đáy swing M5 rồi đóng lại: ${swAll[0]} lần (${(swAll[0] / days.length).toFixed(1)}/ngày) · đảo ≥ 1 ATR M15 trước khi phá tiếp cực trị ${pct(swAll[1], swAll[0])}%`);
console.log('   theo giờ VN: ' + OUT.sweep.map(s => `${s.h}h ${s.ok}%`).join(' · '));
fs.writeFileSync(path.join(DIR, 'data', `behavior_${SYM}.json`), JSON.stringify(OUT));
